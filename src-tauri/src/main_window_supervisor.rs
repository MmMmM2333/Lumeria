use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::{
    current_app_locale,
    dwm::{
        hide_window_immediately, set_main_window_topmost, set_window_border_enabled,
        set_window_cloaked, set_window_corner_rounding_enabled, set_window_non_client_rendering,
        set_window_shadow_enabled, set_window_transitions_enabled,
    },
    i18n,
    launcher::launch_path,
    native_error::NativeError,
    window_effects::{
        set_window_effects_enabled, set_window_effects_enabled_with_config,
        update_main_window_effect_settings,
    },
};

pub(crate) const OPEN_DESKTOP_EVENT: &str = "lumeria-open-desktop";
pub(crate) const TOGGLE_DESKTOP_EVENT: &str = "lumeria-toggle-desktop";
pub(crate) const CLOSE_DESKTOP_EVENT: &str = "lumeria-close-desktop";
const MAIN_WINDOW_EFFECT_REAPPLY_DELAYS_MS: [u64; 2] = [80, 180];
const MAIN_WINDOW_RESTORE_TRANSITIONS_DELAY_MS: u64 = 80;
const MAIN_WINDOW_DEFERRED_SHOW_DELAY_MS: u64 = 0;
const MAIN_WINDOW_RENDERER_READY_TIMEOUT_MS: u64 = 2_000;
const WEBVIEW_RECOVERY_RESTART_WINDOW_MS: u64 = 5 * 60 * 1_000;
const WEBVIEW_RECOVERY_HISTORY_FILE: &str = "webview-recovery.json";
const MAIN_WINDOW_NON_CLIENT_SUBCLASS_ID: usize = 1;
const FULLSCREEN_OVERSCAN_PX: i32 = 1;
const EXPERIMENT_WINDOWED_THICKFRAME_NCCALCSIZE: bool = true;
const WM_NCUAHDRAWCAPTION: u32 = 0x00AE;
const WM_NCUAHDRAWFRAME: u32 = 0x00AF;

#[derive(Clone, Debug, PartialEq, Eq)]
struct WebviewRecoveryPromptCopy {
    title: String,
    message: String,
}

fn webview_recovery_prompt_copy(
    locale: &str,
    log_dir: Option<&str>,
) -> Result<WebviewRecoveryPromptCopy, String> {
    let log_dir = match log_dir {
        Some(path) => path.to_string(),
        None => i18n::translate(locale, "native.supervisor.logUnavailable", &[])?,
    };
    Ok(WebviewRecoveryPromptCopy {
        title: i18n::translate(locale, "native.supervisor.title", &[])?,
        message: i18n::translate(
            locale,
            "native.supervisor.message",
            &[("logDir", log_dir.as_str())],
        )?,
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MainWindowRect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl MainWindowRect {
    const fn new(left: i32, top: i32, right: i32, bottom: i32) -> Self {
        Self {
            left,
            top,
            right,
            bottom,
        }
    }

    fn width(self) -> i32 {
        self.right.saturating_sub(self.left).max(0)
    }

    fn height(self) -> i32 {
        self.bottom.saturating_sub(self.top).max(0)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MainWindowFullscreenGeometry {
    window_rect: MainWindowRect,
    webview_offset: (i32, i32),
    webview_size: (u32, u32),
}

fn resolve_main_window_fullscreen_geometry(
    monitor_rect: MainWindowRect,
    overscan_enabled: bool,
) -> MainWindowFullscreenGeometry {
    let overscan_px = if overscan_enabled {
        FULLSCREEN_OVERSCAN_PX
    } else {
        0
    };
    MainWindowFullscreenGeometry {
        window_rect: MainWindowRect::new(
            monitor_rect.left - overscan_px,
            monitor_rect.top - overscan_px,
            monitor_rect.right + overscan_px,
            monitor_rect.bottom + overscan_px,
        ),
        webview_offset: (overscan_px, overscan_px),
        webview_size: (monitor_rect.width() as u32, monitor_rect.height() as u32),
    }
}

#[cfg(target_os = "windows")]
impl From<windows::Win32::Foundation::RECT> for MainWindowRect {
    fn from(rect: windows::Win32::Foundation::RECT) -> Self {
        Self::new(rect.left, rect.top, rect.right, rect.bottom)
    }
}

#[cfg(target_os = "windows")]
impl From<MainWindowRect> for windows::Win32::Foundation::RECT {
    fn from(rect: MainWindowRect) -> Self {
        Self {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct MainWindowMonitorTarget {
    monitor_rect: MainWindowRect,
    work_rect: MainWindowRect,
    display_changed: bool,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MainWindowActivationPayload {
    open_sequence: u64,
    display_changed: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WebviewHealth {
    Healthy,
    Failed,
    Terminating,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PendingOpen {
    Idle,
    AwaitingReady { open_sequence: u64 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MainWindowSupervisorState {
    webview_health: WebviewHealth,
    pending_open: PendingOpen,
    recovery_prompt_active: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ReadyTimeoutTransition {
    Ignore,
    Hide,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FailureTransition {
    Ignore,
    HideAndRecover,
}

impl MainWindowSupervisorState {
    const DEFAULT: Self = Self {
        webview_health: WebviewHealth::Healthy,
        pending_open: PendingOpen::Idle,
        recovery_prompt_active: false,
    };

    fn begin_open(&mut self, open_sequence: u64) -> bool {
        if self.webview_health != WebviewHealth::Healthy {
            return false;
        }
        self.pending_open = PendingOpen::AwaitingReady { open_sequence };
        true
    }

    fn confirm_renderer_ready(&mut self, open_sequence: u64) -> bool {
        if self.webview_health != WebviewHealth::Healthy
            || self.pending_open != (PendingOpen::AwaitingReady { open_sequence })
        {
            return false;
        }
        self.pending_open = PendingOpen::Idle;
        true
    }

    fn renderer_ready_timeout(&mut self, open_sequence: u64) -> ReadyTimeoutTransition {
        if !self.cancel_open(open_sequence) {
            return ReadyTimeoutTransition::Ignore;
        }
        ReadyTimeoutTransition::Hide
    }

    fn cancel_open(&mut self, open_sequence: u64) -> bool {
        if self.webview_health != WebviewHealth::Healthy
            || self.pending_open != (PendingOpen::AwaitingReady { open_sequence })
        {
            return false;
        }
        self.pending_open = PendingOpen::Idle;
        true
    }

    fn webview_failed(&mut self) -> FailureTransition {
        if self.webview_health != WebviewHealth::Healthy {
            return FailureTransition::Ignore;
        }
        self.webview_health = WebviewHealth::Failed;
        self.pending_open = PendingOpen::Idle;
        FailureTransition::HideAndRecover
    }

    fn cancel_pending_open(&mut self) -> Option<u64> {
        let PendingOpen::AwaitingReady { open_sequence } = self.pending_open else {
            return None;
        };
        self.pending_open = PendingOpen::Idle;
        Some(open_sequence)
    }

    fn can_hold_topmost(&self) -> bool {
        self.webview_health == WebviewHealth::Healthy && self.pending_open == PendingOpen::Idle
    }

    fn begin_recovery_prompt(&mut self) -> bool {
        if self.webview_health != WebviewHealth::Failed || self.recovery_prompt_active {
            return false;
        }
        self.recovery_prompt_active = true;
        true
    }

    fn finish_recovery_prompt(&mut self) {
        self.recovery_prompt_active = false;
    }

    fn mark_terminating(&mut self) {
        self.webview_health = WebviewHealth::Terminating;
        self.pending_open = PendingOpen::Idle;
    }
}

static MAIN_WINDOW_SUPERVISOR_STATE: Mutex<MainWindowSupervisorState> =
    Mutex::new(MainWindowSupervisorState::DEFAULT);

fn main_window_can_hold_topmost() -> bool {
    match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        Ok(state) => state.can_hold_topmost(),
        Err(_) => {
            log::error!(
                target: "main-window",
                "Failed to lock main window supervisor state while resolving topmost policy"
            );
            false
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebviewRecoveryHistory {
    last_failure_unix_ms: u64,
}

fn register_webview_failure_timestamp(history: &mut WebviewRecoveryHistory, now_ms: u64) -> bool {
    let previous = history.last_failure_unix_ms;
    history.last_failure_unix_ms = now_ms;
    previous == 0
        || (now_ms >= previous
            && now_ms.saturating_sub(previous) >= WEBVIEW_RECOVERY_RESTART_WINDOW_MS)
}

fn webview_recovery_history_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve Lumeria app data directory: {error}"))?;
    fs::create_dir_all(&app_data_dir).map_err(|error| {
        format!(
            "Failed to create Lumeria app data directory {}: {error}",
            app_data_dir.display()
        )
    })?;
    Ok(app_data_dir.join(WEBVIEW_RECOVERY_HISTORY_FILE))
}

fn record_webview_failure_and_allow_automatic_restart(app: &AppHandle) -> Result<bool, String> {
    let path = webview_recovery_history_path(app)?;
    let mut history = match fs::read_to_string(&path) {
        Ok(contents) => {
            serde_json::from_str::<WebviewRecoveryHistory>(&contents).map_err(|error| {
                format!(
                    "Failed to parse WebView recovery history {}: {error}",
                    path.display()
                )
            })?
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            WebviewRecoveryHistory::default()
        }
        Err(error) => {
            return Err(format!(
                "Failed to read WebView recovery history {}: {error}",
                path.display()
            ));
        }
    };
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before Unix epoch: {error}"))?
        .as_millis() as u64;
    let allow_automatic_restart = register_webview_failure_timestamp(&mut history, now_ms);
    let bytes = serde_json::to_vec(&history)
        .map_err(|error| format!("Failed to serialize WebView recovery history: {error}"))?;
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&path)
        .map_err(|error| {
            format!(
                "Failed to open WebView recovery history {}: {error}",
                path.display()
            )
        })?;
    file.write_all(&bytes).map_err(|error| {
        format!(
            "Failed to write WebView recovery history {}: {error}",
            path.display()
        )
    })?;
    file.sync_all().map_err(|error| {
        format!(
            "Failed to flush WebView recovery history {}: {error}",
            path.display()
        )
    })?;
    Ok(allow_automatic_restart)
}

const PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED: i32 = 0;
const PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED: i32 = 1;
const PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE: i32 = 2;

fn process_failed_kind_name(kind: i32) -> &'static str {
    match kind {
        0 => "browserProcessExited",
        1 => "renderProcessExited",
        2 => "renderProcessUnresponsive",
        3 => "frameRenderProcessExited",
        4 => "utilityProcessExited",
        5 => "sandboxHelperProcessExited",
        6 => "gpuProcessExited",
        7 => "ppapiPluginProcessExited",
        8 => "ppapiBrokerProcessExited",
        9 => "unknownProcessExited",
        _ => "missingProcessKind",
    }
}

fn process_failed_reason_name(reason: Option<i32>) -> &'static str {
    match reason {
        Some(0) => "unexpected",
        Some(1) => "unresponsive",
        Some(2) => "terminated",
        Some(3) => "crashed",
        Some(4) => "launchFailed",
        Some(5) => "outOfMemory",
        Some(6) => "profileDeleted",
        Some(_) => "unknown",
        None => "unavailable",
    }
}

fn is_fatal_process_failure(kind: i32) -> bool {
    matches!(
        kind,
        PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED
            | PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED
            | PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE
    )
}

fn mark_main_window_terminating() {
    match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        Ok(mut state) => state.mark_terminating(),
        Err(_) => log::error!(
            target: "main-window",
            "Failed to lock main window supervisor state while terminating"
        ),
    }
    invalidate_current_main_window_open_sequence();
}

pub(crate) fn prepare_for_app_termination() {
    mark_main_window_terminating();
}

fn restart_after_webview_failure(app: &AppHandle, reason: &str) {
    mark_main_window_terminating();
    hide_main_window_surface(app, true);
    log::warn!(
        target: "webview-supervisor",
        "Restarting Lumeria after WebView2 failure: {reason}"
    );
    app.request_restart();
}

fn handle_fatal_webview_failure(app: &AppHandle, source: &str, detail: &str) {
    let transition = match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        Ok(mut state) => state.webview_failed(),
        Err(_) => {
            log::error!(
                target: "webview-supervisor",
                "Failed to lock main window supervisor state after fatal WebView2 failure; forcing the native window hidden. source={source} detail={detail}"
            );
            invalidate_current_main_window_open_sequence();
            hide_main_window_surface(app, true);
            return;
        }
    };
    if transition == FailureTransition::Ignore {
        log::debug!(
            target: "webview-supervisor",
            "Ignored duplicate or terminating WebView2 failure. source={source} detail={detail}"
        );
        return;
    }

    invalidate_current_main_window_open_sequence();
    hide_main_window_surface(app, true);
    log::error!(
        target: "webview-supervisor",
        "Fatal WebView2 failure isolated; the native window is hidden and all pending opens are invalidated. source={source} detail={detail}"
    );

    match record_webview_failure_and_allow_automatic_restart(app) {
        Ok(true) => restart_after_webview_failure(app, detail),
        Ok(false) => {
            log::error!(
                target: "webview-supervisor",
                "Automatic WebView2 restart suppressed because another failure occurred within {}ms",
                WEBVIEW_RECOVERY_RESTART_WINDOW_MS
            );
            show_webview_recovery_prompt(app);
        }
        Err(error) => {
            log::error!(
                target: "webview-supervisor",
                "Automatic WebView2 restart suppressed because crash-loop history could not be persisted: {error}"
            );
            show_webview_recovery_prompt(app);
        }
    }
}

pub(crate) fn open_log_directory(app: &AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("Failed to resolve Lumeria log directory: {error}"))?;
    fs::create_dir_all(&log_dir).map_err(|error| {
        format!(
            "Failed to create Lumeria log directory {}: {error}",
            log_dir.display()
        )
    })?;
    launch_path(&log_dir.to_string_lossy(), None)
        .map_err(|error| format!("Failed to open Lumeria log directory: {}", error.detail))
}

#[cfg(target_os = "windows")]
fn show_webview_recovery_prompt(app: &AppHandle) {
    let should_show = match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        Ok(mut state) => state.begin_recovery_prompt(),
        Err(_) => {
            log::error!(
                target: "webview-supervisor",
                "Failed to lock main window supervisor state before recovery prompt"
            );
            false
        }
    };
    if !should_show {
        return;
    }

    use windows::{
        core::HSTRING,
        Win32::UI::WindowsAndMessaging::{
            MessageBoxW, IDYES, MB_ICONERROR, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNO,
        },
    };

    let log_dir = app
        .path()
        .app_log_dir()
        .map(|path| path.display().to_string())
        .map_err(|error| {
            log::error!(
                target: "webview-supervisor",
                "Failed to resolve log directory for recovery prompt: {error}"
            );
        })
        .ok();
    let copy = current_app_locale(app)
        .and_then(|locale| webview_recovery_prompt_copy(&locale, log_dir.as_deref()));
    let copy = match copy {
        Ok(copy) => copy,
        Err(error) => {
            log::error!(
                target: "webview-supervisor",
                "Failed to localize native WebView2 recovery prompt: {error}"
            );
            if let Ok(mut state) = MAIN_WINDOW_SUPERVISOR_STATE.lock() {
                state.finish_recovery_prompt();
            } else {
                log::error!(
                    target: "webview-supervisor",
                    "Failed to clear main window recovery prompt state after localization failure"
                );
            }
            return;
        }
    };
    let message = HSTRING::from(copy.message);
    let title = HSTRING::from(copy.title);
    log::warn!(
        target: "webview-supervisor",
        "Showing native WebView2 recovery prompt after crash-loop suppression"
    );
    let result = unsafe {
        MessageBoxW(
            None,
            &message,
            &title,
            MB_YESNO | MB_ICONERROR | MB_SETFOREGROUND | MB_TOPMOST,
        )
    };

    if let Ok(mut state) = MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        state.finish_recovery_prompt();
    } else {
        log::error!(
            target: "webview-supervisor",
            "Failed to clear main window recovery prompt state"
        );
    }
    if result.0 == 0 {
        log::error!(
            target: "webview-supervisor",
            "Native WebView2 recovery prompt failed to return a valid result"
        );
    } else {
        log::debug!(
            target: "webview-supervisor",
            "Native WebView2 recovery prompt completed result={}",
            result.0
        );
    }
    if result == IDYES {
        restart_after_webview_failure(app, "user requested restart after crash-loop suppression");
    }
}

#[cfg(not(target_os = "windows"))]
fn show_webview_recovery_prompt(_app: &AppHandle) {
    log::error!(
        target: "webview-supervisor",
        "WebView recovery requires a native restart on this platform"
    );
}

#[cfg(target_os = "windows")]
pub(crate) fn setup_main_window_supervisor(
    app: &mut tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
    let window = app.get_webview_window("main").ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "main WebView window is required for WebView2 failure monitoring",
        )
    })?;
    let app_handle = app.handle().clone();
    window.with_webview(move |webview| {
        let observer_app = app_handle.clone();
        if let Err(error) = unsafe { register_webview2_failure_observers(webview, observer_app) } {
            handle_fatal_webview_failure(
                &app_handle,
                "observerRegistration",
                &format!("failed to register WebView2 failure observers: {error}"),
            );
        }
    })?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn setup_main_window_supervisor(
    _app: &mut tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(target_os = "windows")]
unsafe fn register_webview2_failure_observers(
    webview: tauri::webview::PlatformWebview,
    app: AppHandle,
) -> windows::core::Result<()> {
    use webview2_com::{
        BrowserProcessExitedEventHandler,
        Microsoft::Web::WebView2::Win32::ICoreWebView2Environment5, ProcessFailedEventHandler,
    };
    use windows::core::Interface;

    let core_webview = unsafe { webview.controller().CoreWebView2()? };
    let process_app = app.clone();
    let process_handler = ProcessFailedEventHandler::create(Box::new(move |_sender, args| {
        handle_webview2_process_failed(&process_app, args);
        Ok(())
    }));
    let mut process_token = 0_i64;
    unsafe { core_webview.add_ProcessFailed(&process_handler, &mut process_token)? };

    let environment: ICoreWebView2Environment5 = webview.environment().cast()?;
    let browser_handler =
        BrowserProcessExitedEventHandler::create(Box::new(move |_sender, args| {
            handle_webview2_browser_process_exited(&app, args);
            Ok(())
        }));
    let mut browser_token = 0_i64;
    unsafe { environment.add_BrowserProcessExited(&browser_handler, &mut browser_token)? };

    log::debug!(
        target: "webview-supervisor",
        "Registered WebView2 failure observers processToken={process_token} browserToken={browser_token}"
    );
    Ok(())
}

#[cfg(target_os = "windows")]
fn handle_webview2_process_failed(
    app: &AppHandle,
    args: Option<
        webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2ProcessFailedEventArgs,
    >,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2ProcessFailedEventArgs2, COREWEBVIEW2_PROCESS_FAILED_KIND,
        COREWEBVIEW2_PROCESS_FAILED_REASON,
    };
    use windows::core::Interface;

    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND(-1);
    let mut reason = None;
    let mut exit_code = None;
    if let Some(args) = args.as_ref() {
        if let Err(error) = unsafe { args.ProcessFailedKind(&mut kind) } {
            log::error!(
                target: "webview-supervisor",
                "Failed to read WebView2 process-failure kind: {error}"
            );
        }
        match args.cast::<ICoreWebView2ProcessFailedEventArgs2>() {
            Ok(args2) => {
                let mut raw_reason = COREWEBVIEW2_PROCESS_FAILED_REASON(-1);
                match unsafe { args2.Reason(&mut raw_reason) } {
                    Ok(()) => reason = Some(raw_reason.0),
                    Err(error) => log::warn!(
                        target: "webview-supervisor",
                        "Failed to read WebView2 process-failure reason: {error}"
                    ),
                }
                let mut raw_exit_code = 0_i32;
                match unsafe { args2.ExitCode(&mut raw_exit_code) } {
                    Ok(()) => exit_code = Some(raw_exit_code),
                    Err(error) => log::warn!(
                        target: "webview-supervisor",
                        "Failed to read WebView2 process-failure exit code: {error}"
                    ),
                }
            }
            Err(error) => log::warn!(
                target: "webview-supervisor",
                "WebView2 process-failure details are unavailable: {error}"
            ),
        }
    }
    let detail = format!(
        "kind={}({}) reason={}({:?}) exitCode={exit_code:?}",
        process_failed_kind_name(kind.0),
        kind.0,
        process_failed_reason_name(reason),
        reason
    );
    if args.is_none() || is_fatal_process_failure(kind.0) {
        handle_fatal_webview_failure(app, "processFailed", &detail);
    } else {
        log::warn!(
            target: "webview-supervisor",
            "WebView2 reported a recoverable child-process failure. {detail}"
        );
    }
}

#[cfg(target_os = "windows")]
fn handle_webview2_browser_process_exited(
    app: &AppHandle,
    args: Option<
        webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2BrowserProcessExitedEventArgs,
    >,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_BROWSER_PROCESS_EXIT_KIND;

    let mut exit_kind = COREWEBVIEW2_BROWSER_PROCESS_EXIT_KIND(-1);
    let mut browser_process_id = 0_u32;
    if let Some(args) = args.as_ref() {
        if let Err(error) = unsafe { args.BrowserProcessExitKind(&mut exit_kind) } {
            log::error!(
                target: "webview-supervisor",
                "Failed to read WebView2 browser-process exit kind: {error}"
            );
        }
        if let Err(error) = unsafe { args.BrowserProcessId(&mut browser_process_id) } {
            log::warn!(
                target: "webview-supervisor",
                "Failed to read WebView2 browser-process id: {error}"
            );
        }
    }
    let exit_kind_name = match exit_kind.0 {
        0 => "normal",
        1 => "failed",
        _ => "unknown",
    };
    let detail = format!(
        "exitKind={exit_kind_name}({}) browserProcessId={browser_process_id}",
        exit_kind.0
    );
    // A normal browser-process exit is expected only while Lumeria is already
    // terminating. The supervisor transition filters that case; while healthy,
    // any browser exit invalidates the WebView controller and requires recovery.
    handle_fatal_webview_failure(app, "browserProcessExited", &detail);
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MainWindowSurfaceState {
    revision: u64,
    native_frame_enabled: bool,
    effects_enabled: bool,
}

impl MainWindowSurfaceState {
    const DEFAULT: Self = Self {
        revision: 0,
        native_frame_enabled: true,
        effects_enabled: true,
    };
}

static MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_OPEN_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_FULLSCREEN_OVERSCAN_ENABLED: AtomicBool = AtomicBool::new(true);
static MAIN_WINDOW_MODE: Mutex<MainWindowMode> = Mutex::new(MainWindowMode::DEFAULT);
static MAIN_WINDOW_SURFACE_STATE: Mutex<MainWindowSurfaceState> =
    Mutex::new(MainWindowSurfaceState::DEFAULT);
#[cfg(target_os = "windows")]
static MAIN_WINDOW_WINDOWED_PLACEMENT: Mutex<Option<MainWindowWindowedPlacement>> =
    Mutex::new(None);

#[cfg(target_os = "windows")]
#[derive(Clone, Copy, Debug)]
struct MainWindowWindowedPlacement {
    placement: windows::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT,
    was_maximized: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MainWindowMode {
    Fullscreen,
    Windowed,
}

impl MainWindowMode {
    const DEFAULT: Self = Self::Fullscreen;

    fn from_str(value: &str) -> Option<Self> {
        match value.trim() {
            "fullscreen" => Some(Self::Fullscreen),
            "windowed" => Some(Self::Windowed),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Fullscreen => "fullscreen",
            Self::Windowed => "windowed",
        }
    }
}

fn next_main_window_open_sequence() -> u64 {
    MAIN_WINDOW_OPEN_SEQUENCE.fetch_add(1, Ordering::Relaxed) + 1
}

fn show_main_window_for_sequence(
    app: &AppHandle,
    open_sequence: u64,
    force_cloak: bool,
) -> Result<(), String> {
    if MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed) != open_sequence {
        return Ok(());
    }

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main WebView window is unavailable during activation".to_string())?;
    let mode = current_main_window_mode()?;
    let is_visible = window.is_visible().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::is_visible before show",
        source,
    })?;
    let is_minimized = window.is_minimized().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::is_minimized before show",
        source,
    })?;
    let should_cloak = force_cloak || !is_visible || is_minimized;
    if should_cloak {
        // Hidden transparent WebView2 windows can flash a white/native backing
        // surface for one frame when shown. The cloak is a hard safety gate:
        // any later preparation error aborts and hides this transaction.
        set_window_cloaked(&window, true)?;
        set_main_window_topmost(&window, false)?;
    }
    if should_disable_main_window_transitions_before_show(mode) {
        disable_main_window_transitions(app)?;
    }
    if should_apply_main_window_surface_policy_before_show(mode) {
        apply_main_window_mode_to_window(&window, mode)?;
        apply_main_window_native_surface_policy(&window)?;
    }
    if !should_cloak {
        set_window_cloaked(&window, false)?;
    }
    if !is_visible {
        window.show().map_err(|source| NativeError::Tauri {
            context: "WebviewWindow::show",
            source,
        })?;
    }
    if is_minimized {
        window.unminimize().map_err(|source| NativeError::Tauri {
            context: "WebviewWindow::unminimize",
            source,
        })?;
    }
    if should_cloak {
        update_window_now(&window);
    }
    confirm_main_window_mode_after_show(&window, mode)?;
    if should_cloak {
        set_main_window_topmost(&window, false)?;
    } else if let Err(error) = focus_and_activate_window(&window) {
        log::warn!(target: "main-window", "Failed to activate visible main window: {error}");
    }
    if !should_cloak && mode == MainWindowMode::Fullscreen {
        if let Err(error) = focus_and_activate_window(&window) {
            log::warn!(
                target: "main-window",
                "Failed to reactivate visible fullscreen main window: {error}"
            );
        }
    }
    if let Err(error) = apply_current_main_window_effects_until_stable(&window) {
        log::warn!(target: "window-effects", "Failed to restore main window effects: {error}");
    }
    let disable_sequence = MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.load(Ordering::Relaxed);
    if should_use_native_window_effects(mode) {
        schedule_window_effect_reapply(window.clone(), open_sequence, disable_sequence);
    }
    match current_main_window_surface_state() {
        Ok(state)
            if !should_cloak
                && mode == MainWindowMode::Fullscreen
                && !state.native_frame_enabled =>
        {
            if let Err(error) = refresh_main_window_z_order_for_open(&window) {
                log::warn!(
                    target: "main-window",
                    "Failed to restore visible main-window z-order: {error}"
                );
            }
        }
        Ok(_) => {}
        Err(error) => {
            log::warn!(
                target: "window-effects",
                "Failed to read main window surface state after show: {error}"
            );
        }
    }
    Ok(())
}

fn should_disable_main_window_transitions_before_show(mode: MainWindowMode) -> bool {
    mode == MainWindowMode::Windowed && !EXPERIMENT_WINDOWED_THICKFRAME_NCCALCSIZE
}

fn should_disable_main_window_transitions_before_hide(mode: MainWindowMode) -> bool {
    mode == MainWindowMode::Windowed && EXPERIMENT_WINDOWED_THICKFRAME_NCCALCSIZE
}

fn should_enable_windowed_transitions_after_reveal(mode: MainWindowMode) -> bool {
    mode == MainWindowMode::Windowed && EXPERIMENT_WINDOWED_THICKFRAME_NCCALCSIZE
}

fn should_apply_main_window_surface_policy_before_show(mode: MainWindowMode) -> bool {
    mode == MainWindowMode::Fullscreen || !EXPERIMENT_WINDOWED_THICKFRAME_NCCALCSIZE
}

fn schedule_main_window_show(
    app: &AppHandle,
    open_sequence: u64,
    delay_ms: u64,
    force_cloak: bool,
    activation_after_show: MainWindowActivationPayload,
    open_settings_after_show: bool,
) {
    let app = app.clone();
    if delay_ms == 0 {
        dispatch_main_window_show(
            &app,
            open_sequence,
            force_cloak,
            activation_after_show,
            open_settings_after_show,
        );
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(delay_ms));
        dispatch_main_window_show(
            &app,
            open_sequence,
            force_cloak,
            activation_after_show,
            open_settings_after_show,
        );
    });
}

fn dispatch_main_window_show(
    app: &AppHandle,
    open_sequence: u64,
    force_cloak: bool,
    activation_after_show: MainWindowActivationPayload,
    open_settings_after_show: bool,
) {
    let callback_app = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        complete_main_window_show(
            &callback_app,
            open_sequence,
            force_cloak,
            activation_after_show,
            open_settings_after_show,
        );
    }) {
        abort_main_window_open(
            app,
            open_sequence,
            &format!("failed to dispatch native window preparation to the main thread: {error}"),
        );
    }
}

fn complete_main_window_show(
    app: &AppHandle,
    open_sequence: u64,
    force_cloak: bool,
    activation_after_show: MainWindowActivationPayload,
    open_settings_after_show: bool,
) {
    if let Err(error) = show_main_window_for_sequence(app, open_sequence, force_cloak) {
        abort_main_window_open(
            app,
            open_sequence,
            &format!("native window preparation failed: {error}"),
        );
        return;
    }
    if MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed) != open_sequence {
        return;
    }
    if let Err(error) = app.emit(OPEN_DESKTOP_EVENT, activation_after_show) {
        abort_main_window_open(
            app,
            open_sequence,
            &format!("renderer activation event failed after show: {error}"),
        );
        return;
    }
    if open_settings_after_show {
        if let Err(error) = app.emit("lumeria-open-settings", ()) {
            log::warn!(
                target: "main-window",
                "Failed to emit settings event after main-window activation: {error}"
            );
        }
    }
    schedule_renderer_ready_timeout(app, open_sequence);
}

fn reveal_main_window_surface(app: &AppHandle, open_sequence: u64) -> Result<(), String> {
    if open_sequence != MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed) {
        return Ok(());
    }
    if let Some(window) = app.get_webview_window("main") {
        let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
        confirm_main_window_mode_after_show(&window, mode)?;
        set_window_cloaked(&window, false)?;
        if should_enable_windowed_transitions_after_reveal(mode) {
            set_window_transitions_enabled(&window, true)?;
        }
        if !is_main_window_foreground(&window) {
            focus_and_activate_window(&window)?;
        }
    }
    Ok(())
}

pub(crate) fn reveal_main_window(app: &AppHandle, open_sequence: u64) -> Result<(), String> {
    let confirmed = match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        Ok(mut state) => state.confirm_renderer_ready(open_sequence),
        Err(_) => {
            if invalidate_main_window_open_sequence(open_sequence) {
                hide_main_window_surface(app, true);
            }
            return Err("Failed to lock main window supervisor state before reveal".to_string());
        }
    };
    if !confirmed {
        return Ok(());
    }
    if let Err(error) = reveal_main_window_surface(app, open_sequence) {
        if invalidate_main_window_open_sequence(open_sequence) {
            hide_main_window_surface(app, true);
        }
        log::error!(
            target: "main-window",
            "Failed to reveal renderer-ready open sequence {open_sequence}; the native window was hidden: {error}"
        );
        return Err(error);
    }
    Ok(())
}

fn main_window_deferred_show_delay(app: &AppHandle) -> u64 {
    app.get_webview_window("main")
        .filter(|window| {
            !window.is_visible().unwrap_or(false) || window.is_minimized().unwrap_or(false)
        })
        .map(|_| MAIN_WINDOW_DEFERRED_SHOW_DELAY_MS)
        .unwrap_or(0)
}

pub(crate) fn apply_main_window_mode(app: &AppHandle) -> Result<(), String> {
    let mode = current_main_window_mode()?;
    if let Some(window) = app.get_webview_window("main") {
        if mode == MainWindowMode::Fullscreen {
            save_initial_main_windowed_placement(&window)?;
        }
        apply_main_window_mode_to_window(&window, mode)?;
    }
    Ok(())
}

pub(crate) fn set_main_window_mode(
    app: &AppHandle,
    mode: &str,
    fullscreen_overscan_enabled: bool,
) -> Result<String, String> {
    let next = MainWindowMode::from_str(mode)
        .ok_or_else(|| format!("Unsupported main window mode: {mode}"))?;
    MAIN_WINDOW_FULLSCREEN_OVERSCAN_ENABLED.store(fullscreen_overscan_enabled, Ordering::Relaxed);
    let previous = current_main_window_mode()?;
    if let Some(window) = app.get_webview_window("main") {
        if previous == MainWindowMode::Windowed && next == MainWindowMode::Fullscreen {
            save_main_windowed_placement(&window)?;
        }
        update_main_window_mode(next)?;
        apply_main_window_mode_to_window(&window, next)?;
        if previous == MainWindowMode::Fullscreen && next == MainWindowMode::Windowed {
            restore_main_windowed_placement(&window)?;
        }
        apply_main_window_native_surface_policy(&window)?;
        if should_use_native_window_effects(next) {
            let open_sequence = MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed);
            let disable_sequence = MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.load(Ordering::Relaxed);
            schedule_window_effect_reapply(window, open_sequence, disable_sequence);
        }
    } else {
        update_main_window_mode(next)?;
    }
    Ok(next.as_str().to_string())
}

pub(crate) fn set_main_window_native_frame_enabled(
    app: &AppHandle,
    enabled: bool,
) -> Result<(), String> {
    update_main_window_native_frame_state(enabled)?;
    if let Some(window) = app.get_webview_window("main") {
        apply_main_window_native_surface_policy(&window)?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn update_window_now(window: &WebviewWindow) {
    use windows::Win32::Graphics::Gdi::UpdateWindow;

    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = UpdateWindow(hwnd);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn update_window_now(_window: &WebviewWindow) {}

#[cfg(target_os = "windows")]
fn set_main_window_tauri_resize_border_visible(
    window: &WebviewWindow,
    visible: bool,
) -> Result<(), String> {
    use windows::{
        core::w,
        Win32::UI::WindowsAndMessaging::{
            FindWindowExW, SetWindowPos, HWND_TOP, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOMOVE,
            SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW,
        },
    };

    let parent = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for Tauri resize border visibility",
        source,
    })?;
    let Ok(resize_border) = (unsafe {
        FindWindowExW(
            Some(parent),
            None,
            w!("TAURI_DRAG_RESIZE_BORDERS"),
            w!("TAURI_DRAG_RESIZE_WINDOW"),
        )
    }) else {
        log::debug!(
            target: "tray",
            "Tauri undecorated resize border not present while setting visible={visible}"
        );
        return Ok(());
    };

    let mut flags = SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOOWNERZORDER | SWP_NOSIZE;
    let insert_after = if visible {
        flags |= SWP_SHOWWINDOW;
        Some(HWND_TOP)
    } else {
        flags |= SWP_HIDEWINDOW | SWP_NOZORDER;
        None
    };
    unsafe { SetWindowPos(resize_border, insert_after, 0, 0, 0, 0, flags) }.map_err(|source| {
        NativeError::Win32 {
            context: if visible {
                "SetWindowPos(show Tauri resize border)"
            } else {
                "SetWindowPos(hide Tauri resize border)"
            },
            source,
        }
    })?;
    log::debug!(
        target: "tray",
        "Set Tauri undecorated resize border visible={visible}"
    );
    Ok(())
}

#[cfg(target_os = "windows")]
fn set_main_window_non_client_subclass(
    window: &WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    use windows::Win32::UI::Shell::{RemoveWindowSubclass, SetWindowSubclass};

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for non-client subclass",
        source,
    })?;
    unsafe {
        if enabled {
            SetWindowSubclass(
                hwnd,
                Some(main_window_non_client_subclass_proc),
                MAIN_WINDOW_NON_CLIENT_SUBCLASS_ID,
                0,
            )
            .ok()
            .map_err(|source| NativeError::Win32 {
                context: "SetWindowSubclass(main window non-client)",
                source,
            })?;
        } else {
            let _ = RemoveWindowSubclass(
                hwnd,
                Some(main_window_non_client_subclass_proc),
                MAIN_WINDOW_NON_CLIENT_SUBCLASS_ID,
            );
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn main_window_non_client_subclass_proc(
    hwnd: windows::Win32::Foundation::HWND,
    message: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    subclass_id: usize,
    _ref_data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::{
        Foundation::LRESULT,
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        },
        UI::{
            Shell::{DefSubclassProc, RemoveWindowSubclass},
            WindowsAndMessaging::{
                IsZoomed, HTBOTTOM, HTBOTTOMLEFT, HTBOTTOMRIGHT, HTCLIENT, HTLEFT, HTRIGHT, HTTOP,
                HTTOPLEFT, HTTOPRIGHT, NCCALCSIZE_PARAMS, SC_KEYMENU, WM_NCACTIVATE, WM_NCCALCSIZE,
                WM_NCDESTROY, WM_NCHITTEST, WM_NCPAINT, WM_SYSCOMMAND,
            },
        },
    };

    match message {
        WM_NCHITTEST => {
            let hit_test = DefSubclassProc(hwnd, message, wparam, lparam);
            let is_resize_border = matches!(
                hit_test.0 as u32,
                HTLEFT
                    | HTRIGHT
                    | HTTOP
                    | HTTOPLEFT
                    | HTTOPRIGHT
                    | HTBOTTOM
                    | HTBOTTOMLEFT
                    | HTBOTTOMRIGHT
            );
            if current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT)
                == MainWindowMode::Fullscreen
                && is_resize_border
            {
                return LRESULT(HTCLIENT as isize);
            }
            hit_test
        }
        WM_NCCALCSIZE => {
            let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
            let uses_borderless_non_client =
                matches!(mode, MainWindowMode::Fullscreen | MainWindowMode::Windowed);
            if uses_borderless_non_client {
                if wparam.0 != 0 && lparam.0 != 0 {
                    if mode == MainWindowMode::Windowed && IsZoomed(hwnd).as_bool() {
                        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                        if !monitor.is_invalid() {
                            let mut info = MONITORINFO {
                                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                                ..Default::default()
                            };
                            if GetMonitorInfoW(monitor, &mut info).as_bool() {
                                let params = &mut *(lparam.0 as *mut NCCALCSIZE_PARAMS);
                                params.rgrc[0] = info.rcWork;
                            }
                        }
                    }
                    return LRESULT(0);
                }
                return DefSubclassProc(hwnd, message, wparam, lparam);
            }
            LRESULT(0)
        }
        WM_NCPAINT | WM_NCUAHDRAWCAPTION | WM_NCUAHDRAWFRAME => {
            let uses_borderless_non_client = matches!(
                current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT),
                MainWindowMode::Fullscreen | MainWindowMode::Windowed
            );
            if uses_borderless_non_client {
                DefSubclassProc(hwnd, message, wparam, lparam)
            } else {
                LRESULT(0)
            }
        }
        WM_NCACTIVATE => {
            let uses_borderless_non_client = matches!(
                current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT),
                MainWindowMode::Fullscreen | MainWindowMode::Windowed
            );
            if uses_borderless_non_client {
                DefSubclassProc(hwnd, message, wparam, lparam)
            } else {
                LRESULT(1)
            }
        }
        WM_SYSCOMMAND => {
            let command = (wparam.0 & 0xfff0) as u32;
            if command == SC_KEYMENU {
                // Alt+Space is Lumeria's global shortcut, but Windows also
                // treats it as the system-menu key for WS_SYSMENU windows. If
                // the default handler opens that menu, the WebView enters a
                // modal menu loop and the close-animation timer cannot fire
                // until focus leaves the window.
                return LRESULT(0);
            }
            DefSubclassProc(hwnd, message, wparam, lparam)
        }
        WM_NCDESTROY => {
            let _ = RemoveWindowSubclass(
                hwnd,
                Some(main_window_non_client_subclass_proc),
                subclass_id,
            );
            DefSubclassProc(hwnd, message, wparam, lparam)
        }
        _ => DefSubclassProc(hwnd, message, wparam, lparam),
    }
}

#[cfg(target_os = "windows")]
fn restore_main_window_resizable_frame_style(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_STYLE, WS_CAPTION, WS_MAXIMIZEBOX,
        WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
    };

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for restoring resizable frame",
        source,
    })?;
    let current_style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) };
    let next_style = current_style
        | main_window_style_mask([
            WS_POPUP.0,
            WS_CAPTION.0,
            WS_THICKFRAME.0,
            WS_SYSMENU.0,
            WS_MINIMIZEBOX.0,
            WS_MAXIMIZEBOX.0,
        ]);
    if next_style != current_style {
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_STYLE, next_style);
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn refresh_main_window_frame(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER,
        SWP_NOSENDCHANGING, SWP_NOSIZE, SWP_NOZORDER,
    };

    unsafe {
        SetWindowPos(
            window.hwnd().map_err(|source| NativeError::Tauri {
                context: "WebviewWindow::hwnd for frame refresh",
                source,
            })?,
            None,
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED
                | SWP_NOACTIVATE
                | SWP_NOMOVE
                | SWP_NOSIZE
                | SWP_NOOWNERZORDER
                | SWP_NOSENDCHANGING
                | SWP_NOZORDER,
        )
    }
    .map_err(|source| NativeError::Win32 {
        context: "SetWindowPos(refresh main window frame)",
        source,
    })?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn main_window_style_mask<const N: usize>(parts: [u32; N]) -> isize {
    parts
        .into_iter()
        .fold(0usize, |mask, part| mask | part as usize) as isize
}

fn current_main_window_mode() -> Result<MainWindowMode, String> {
    MAIN_WINDOW_MODE
        .lock()
        .map(|mode| *mode)
        .map_err(|_| "Failed to lock main window mode".to_string())
}

fn update_main_window_mode(next: MainWindowMode) -> Result<(), String> {
    let mut current = MAIN_WINDOW_MODE
        .lock()
        .map_err(|_| "Failed to lock main window mode".to_string())?;
    *current = next;
    Ok(())
}

fn center_main_window_rect_in_work_area(
    requested_width: i32,
    requested_height: i32,
    work_area: MainWindowRect,
) -> MainWindowRect {
    let width = requested_width.max(1).min(work_area.width());
    let height = requested_height.max(1).min(work_area.height());
    let left = work_area.left + (work_area.width() - width) / 2;
    let top = work_area.top + (work_area.height() - height) / 2;
    MainWindowRect::new(left, top, left + width, top + height)
}

fn screen_rect_to_window_placement_coordinates(
    screen_rect: MainWindowRect,
    monitor_rect: MainWindowRect,
    work_rect: MainWindowRect,
) -> MainWindowRect {
    // WINDOWPLACEMENT uses workspace coordinates for regular top-level
    // windows. Account for taskbars docked to the target monitor's top or
    // left edge before storing a screen-space work-area rectangle there.
    let offset_x = monitor_rect.left.saturating_sub(work_rect.left);
    let offset_y = monitor_rect.top.saturating_sub(work_rect.top);
    MainWindowRect::new(
        screen_rect.left.saturating_add(offset_x),
        screen_rect.top.saturating_add(offset_y),
        screen_rect.right.saturating_add(offset_x),
        screen_rect.bottom.saturating_add(offset_y),
    )
}

fn should_hide_main_window_for_shortcut(
    is_visible: bool,
    is_minimized: bool,
    is_foreground: bool,
    display_changed: bool,
) -> bool {
    is_visible && !is_minimized && is_foreground && !display_changed
}

#[cfg(target_os = "windows")]
fn resolve_cursor_monitor_target(
    window: &WebviewWindow,
) -> Result<Option<MainWindowMonitorTarget>, String> {
    use windows::Win32::{
        Foundation::POINT,
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, MONITORINFO,
            MONITOR_DEFAULTTONEAREST,
        },
        UI::WindowsAndMessaging::GetCursorPos,
    };

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for cursor monitor target",
        source,
    })?;
    let mut cursor = POINT::default();
    unsafe { GetCursorPos(&mut cursor) }.map_err(|source| NativeError::Win32 {
        context: "GetCursorPos(main window shortcut)",
        source,
    })?;
    let target_monitor = unsafe { MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST) };
    if target_monitor.is_invalid() {
        return Err("Failed to find the monitor under the cursor".to_string());
    }
    let current_monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if current_monitor.is_invalid() {
        return Err("Failed to find the monitor containing the main window".to_string());
    }
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if !unsafe { GetMonitorInfoW(target_monitor, &mut info).as_bool() } {
        return Err("Failed to read the monitor under the cursor".to_string());
    }
    let target = MainWindowMonitorTarget {
        monitor_rect: info.rcMonitor.into(),
        work_rect: info.rcWork.into(),
        display_changed: target_monitor != current_monitor,
    };
    log::debug!(
        target: "tray",
        "Resolved shortcut cursor monitor cursor={},{} monitor={}x{}@{},{} work={}x{}@{},{} changed={}",
        cursor.x,
        cursor.y,
        target.monitor_rect.width(),
        target.monitor_rect.height(),
        target.monitor_rect.left,
        target.monitor_rect.top,
        target.work_rect.width(),
        target.work_rect.height(),
        target.work_rect.left,
        target.work_rect.top,
        target.display_changed,
    );
    Ok(Some(target))
}

#[cfg(not(target_os = "windows"))]
fn resolve_cursor_monitor_target(
    _window: &WebviewWindow,
) -> Result<Option<MainWindowMonitorTarget>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
fn save_initial_main_windowed_placement(window: &WebviewWindow) -> Result<(), String> {
    let has_saved_placement = MAIN_WINDOW_WINDOWED_PLACEMENT
        .lock()
        .map(|placement| placement.is_some())
        .map_err(|_| "Failed to lock main windowed placement".to_string())?;
    if has_saved_placement {
        return Ok(());
    }
    save_main_windowed_placement(window)
}

#[cfg(not(target_os = "windows"))]
fn save_initial_main_windowed_placement(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn save_main_windowed_placement(window: &WebviewWindow) -> Result<(), String> {
    let placement = read_main_windowed_placement(window)?;
    let rect = placement.placement.rcNormalPosition;
    let mut saved = MAIN_WINDOW_WINDOWED_PLACEMENT
        .lock()
        .map_err(|_| "Failed to lock main windowed placement".to_string())?;
    *saved = Some(placement);
    log::debug!(
        target: "tray",
        "Saved windowed placement normal={}x{}@{},{} maximized={}",
        rect.right - rect.left,
        rect.bottom - rect.top,
        rect.left,
        rect.top,
        placement.was_maximized
    );
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn save_main_windowed_placement(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn read_main_windowed_placement(
    window: &WebviewWindow,
) -> Result<MainWindowWindowedPlacement, String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowPlacement, IsZoomed, SW_MAXIMIZE, WINDOWPLACEMENT, WPF_RESTORETOMAXIMIZED,
    };

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for reading windowed placement",
        source,
    })?;
    let mut placement = WINDOWPLACEMENT {
        length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
        ..Default::default()
    };
    unsafe { GetWindowPlacement(hwnd, &mut placement) }.map_err(|source| NativeError::Win32 {
        context: "GetWindowPlacement(main windowed placement)",
        source,
    })?;
    if placement.rcNormalPosition.right <= placement.rcNormalPosition.left
        || placement.rcNormalPosition.bottom <= placement.rcNormalPosition.top
    {
        return Err("Main windowed placement has an invalid normal rectangle".to_string());
    }
    Ok(MainWindowWindowedPlacement {
        was_maximized: placement.showCmd == SW_MAXIMIZE.0 as u32
            || unsafe { IsZoomed(hwnd).as_bool() }
            || placement.flags.0 & WPF_RESTORETOMAXIMIZED.0 != 0,
        placement,
    })
}

#[cfg(target_os = "windows")]
fn restore_main_windowed_placement(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPlacement, SW_MAXIMIZE, SW_SHOWNORMAL, WINDOWPLACEMENT,
    };

    let Some(saved_placement) = MAIN_WINDOW_WINDOWED_PLACEMENT
        .lock()
        .map_err(|_| "Failed to lock main windowed placement".to_string())?
        .as_ref()
        .copied()
    else {
        log::debug!(target: "tray", "No saved windowed placement to restore");
        return Ok(());
    };

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for restoring windowed placement",
        source,
    })?;
    let mut placement = saved_placement.placement;
    placement.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
    placement.showCmd = if saved_placement.was_maximized {
        SW_MAXIMIZE.0 as u32
    } else {
        SW_SHOWNORMAL.0 as u32
    };
    if saved_placement.was_maximized {
        set_window_transitions_enabled(window, false)?;
    }
    unsafe { SetWindowPlacement(hwnd, &placement) }.map_err(|source| NativeError::Win32 {
        context: "SetWindowPlacement(main windowed placement)",
        source,
    })?;
    if saved_placement.was_maximized {
        schedule_main_window_transitions_restore(window.clone());
    }
    let rect = placement.rcNormalPosition;
    log::debug!(
        target: "tray",
        "Restored windowed placement normal={}x{}@{},{} maximized={}",
        rect.right - rect.left,
        rect.bottom - rect.top,
        rect.left,
        rect.top,
        saved_placement.was_maximized
    );
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn restore_main_windowed_placement(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn schedule_main_window_transitions_restore(window: WebviewWindow) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(
            MAIN_WINDOW_RESTORE_TRANSITIONS_DELAY_MS,
        ));
        if current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT) == MainWindowMode::Windowed
        {
            let _ = set_window_transitions_enabled(&window, true);
        }
    });
}

#[cfg(target_os = "windows")]
fn relocate_saved_main_windowed_placement(
    monitor_rect: MainWindowRect,
    work_rect: MainWindowRect,
) -> Result<(), String> {
    let mut saved = MAIN_WINDOW_WINDOWED_PLACEMENT
        .lock()
        .map_err(|_| "Failed to lock main windowed placement".to_string())?;
    let Some(saved) = saved.as_mut() else {
        return Ok(());
    };
    let normal_rect: MainWindowRect = saved.placement.rcNormalPosition.into();
    let target_screen_rect =
        center_main_window_rect_in_work_area(normal_rect.width(), normal_rect.height(), work_rect);
    saved.placement.rcNormalPosition =
        screen_rect_to_window_placement_coordinates(target_screen_rect, monitor_rect, work_rect)
            .into();
    Ok(())
}

#[cfg(target_os = "windows")]
fn set_main_window_position_and_size(
    window: &WebviewWindow,
    rect: MainWindowRect,
    context: &'static str,
) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
    };

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for windowed monitor relocation",
        source,
    })?;
    unsafe {
        SetWindowPos(
            hwnd,
            None,
            rect.left,
            rect.top,
            rect.width(),
            rect.height(),
            SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOZORDER,
        )
    }
    .map_err(|source| NativeError::Win32 { context, source })?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn relocate_windowed_main_window(
    window: &WebviewWindow,
    work_area: MainWindowRect,
) -> Result<(), String> {
    use windows::Win32::{
        Foundation::RECT,
        UI::WindowsAndMessaging::{
            GetWindowPlacement, GetWindowRect, IsIconic, SetWindowPlacement, SW_MAXIMIZE,
            SW_SHOWNORMAL, WINDOWPLACEMENT, WPF_RESTORETOMAXIMIZED,
        },
    };

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for relocating windowed main window",
        source,
    })?;
    let mut placement = read_main_windowed_placement(window)?;
    let normal_rect: MainWindowRect = placement.placement.rcNormalPosition.into();
    let initial_target =
        center_main_window_rect_in_work_area(normal_rect.width(), normal_rect.height(), work_area);
    let was_minimized = unsafe { IsIconic(hwnd).as_bool() };

    if placement.was_maximized || was_minimized {
        if placement.was_maximized {
            set_window_transitions_enabled(window, false)?;
        }
        placement.placement.length = std::mem::size_of_val(&placement.placement) as u32;
        placement.placement.showCmd = SW_SHOWNORMAL.0 as u32;
        placement.placement.flags.0 &= !WPF_RESTORETOMAXIMIZED.0;
        unsafe { SetWindowPlacement(hwnd, &placement.placement) }.map_err(|source| {
            NativeError::Win32 {
                context: "SetWindowPlacement(restore before monitor relocation)",
                source,
            }
        })?;
    }

    set_main_window_position_and_size(
        window,
        initial_target,
        "SetWindowPos(initial windowed monitor relocation)",
    )?;

    // Moving between monitors can synchronously apply WM_DPICHANGED and alter
    // the physical size. Re-read the actual outer rectangle and center the
    // post-DPI size rather than preserving stale pixels from the old monitor.
    let mut actual_rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut actual_rect) }.map_err(|source| NativeError::Win32 {
        context: "GetWindowRect(after windowed monitor relocation)",
        source,
    })?;
    let actual_rect: MainWindowRect = actual_rect.into();
    let final_target =
        center_main_window_rect_in_work_area(actual_rect.width(), actual_rect.height(), work_area);
    set_main_window_position_and_size(
        window,
        final_target,
        "SetWindowPos(final windowed monitor relocation)",
    )?;

    if placement.was_maximized {
        let mut maximized_placement = WINDOWPLACEMENT {
            length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        unsafe { GetWindowPlacement(hwnd, &mut maximized_placement) }.map_err(|source| {
            NativeError::Win32 {
                context: "GetWindowPlacement(before remaximizing after monitor relocation)",
                source,
            }
        })?;
        maximized_placement.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
        maximized_placement.showCmd = SW_MAXIMIZE.0 as u32;
        unsafe { SetWindowPlacement(hwnd, &maximized_placement) }.map_err(|source| {
            NativeError::Win32 {
                context: "SetWindowPlacement(remaximize after monitor relocation)",
                source,
            }
        })?;
        schedule_main_window_transitions_restore(window.clone());
    }

    if let Err(error) = save_main_windowed_placement(window) {
        log::warn!(
            target: "tray",
            "Relocated the windowed main window but failed to save its new placement: {error}"
        );
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_shortcut_monitor_target(
    window: &WebviewWindow,
    mode: MainWindowMode,
    target: MainWindowMonitorTarget,
) -> Result<(), String> {
    if !target.display_changed {
        return Ok(());
    }
    match mode {
        MainWindowMode::Fullscreen => {
            apply_main_window_borderless_fullscreen_rect(window, target.monitor_rect)?;
            if let Err(error) =
                relocate_saved_main_windowed_placement(target.monitor_rect, target.work_rect)
            {
                log::warn!(
                    target: "tray",
                    "Relocated the fullscreen main window but failed to move its saved windowed placement: {error}"
                );
            }
        }
        MainWindowMode::Windowed => {
            relocate_windowed_main_window(window, target.work_rect)?;
        }
    }
    log::debug!(
        target: "tray",
        "Relocated shortcut main window to {}x{}@{},{} in {} mode",
        target.monitor_rect.width(),
        target.monitor_rect.height(),
        target.monitor_rect.left,
        target.monitor_rect.top,
        mode.as_str(),
    );
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn apply_shortcut_monitor_target(
    _window: &WebviewWindow,
    _mode: MainWindowMode,
    _target: MainWindowMonitorTarget,
) -> Result<(), String> {
    Ok(())
}

fn apply_main_window_mode_to_window(
    window: &WebviewWindow,
    mode: MainWindowMode,
) -> Result<(), String> {
    match mode {
        MainWindowMode::Fullscreen => {
            window
                .set_decorations(false)
                .map_err(|source| NativeError::Tauri {
                    context: "WebviewWindow::set_decorations(false fullscreen)",
                    source,
                })?;
            window
                .set_resizable(true)
                .map_err(|source| NativeError::Tauri {
                    context: "WebviewWindow::set_resizable(true fullscreen borderless)",
                    source,
                })?;
            if window.is_fullscreen().unwrap_or(false) {
                window
                    .set_fullscreen(false)
                    .map_err(|source| NativeError::Tauri {
                        context: "WebviewWindow::set_fullscreen(false fullscreen borderless)",
                        source,
                    })?;
            }
            prepare_main_window_fullscreen_surface(window)?;
        }
        MainWindowMode::Windowed => {
            window
                .set_decorations(false)
                .map_err(|source| NativeError::Tauri {
                    context: "WebviewWindow::set_decorations(false windowed)",
                    source,
                })?;
            window
                .set_resizable(true)
                .map_err(|source| NativeError::Tauri {
                    context: "WebviewWindow::set_resizable(true windowed)",
                    source,
                })?;
            if window.is_fullscreen().unwrap_or(false) {
                window
                    .set_fullscreen(false)
                    .map_err(|source| NativeError::Tauri {
                        context: "WebviewWindow::set_fullscreen(false)",
                        source,
                    })?;
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn prepare_main_window_fullscreen_surface(window: &WebviewWindow) -> Result<(), String> {
    restore_main_window_resizable_frame_style(window)?;
    set_main_window_non_client_subclass(window, true)?;
    set_window_transitions_enabled(window, true)?;
    set_window_non_client_rendering(window)?;
    refresh_main_window_frame(window)?;
    apply_main_window_borderless_fullscreen_bounds(window)
}

#[cfg(not(target_os = "windows"))]
fn prepare_main_window_fullscreen_surface(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_main_window_borderless_fullscreen_bounds(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for borderless fullscreen bounds",
        source,
    })?;
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if monitor.is_invalid() {
        return Err("Failed to find monitor for borderless fullscreen bounds".to_string());
    }
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if !unsafe { GetMonitorInfoW(monitor, &mut info).as_bool() } {
        return Err("Failed to read monitor info for borderless fullscreen bounds".to_string());
    }
    apply_main_window_borderless_fullscreen_rect(window, info.rcMonitor.into())
}

#[cfg(target_os = "windows")]
fn apply_main_window_borderless_fullscreen_rect(
    window: &WebviewWindow,
    monitor_rect: MainWindowRect,
) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowPlacement, IsZoomed, SetWindowPlacement, SetWindowPos, SWP_NOACTIVATE,
        SWP_NOOWNERZORDER, SWP_NOSENDCHANGING, SWP_NOZORDER, SW_SHOWNORMAL, WINDOWPLACEMENT,
    };

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for explicit borderless fullscreen bounds",
        source,
    })?;
    let geometry = resolve_main_window_fullscreen_geometry(
        monitor_rect,
        MAIN_WINDOW_FULLSCREEN_OVERSCAN_ENABLED.load(Ordering::Relaxed),
    );
    let rect = geometry.window_rect;
    if unsafe { IsZoomed(hwnd).as_bool() } {
        let mut placement = WINDOWPLACEMENT {
            length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        unsafe { GetWindowPlacement(hwnd, &mut placement) }.map_err(|source| {
            NativeError::Win32 {
                context: "GetWindowPlacement(borderless fullscreen from maximized)",
                source,
            }
        })?;
        placement.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
        placement.showCmd = SW_SHOWNORMAL.0 as u32;
        placement.rcNormalPosition = rect.into();
        unsafe { SetWindowPlacement(hwnd, &placement) }.map_err(|source| NativeError::Win32 {
            context: "SetWindowPlacement(borderless fullscreen from maximized)",
            source,
        })?;
    }
    unsafe {
        SetWindowPos(
            hwnd,
            None,
            rect.left,
            rect.top,
            rect.right - rect.left,
            rect.bottom - rect.top,
            SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING | SWP_NOZORDER,
        )
    }
    .map_err(|source| NativeError::Win32 {
        context: "SetWindowPos(borderless fullscreen bounds)",
        source,
    })?;
    let webview: &tauri::Webview = window.as_ref();
    webview
        .set_auto_resize(false)
        .map_err(|source| NativeError::Tauri {
            context: "Webview::set_auto_resize(false) for fullscreen mode",
            source,
        })?;
    set_main_window_fullscreen_webview_bounds(window, geometry)?;
    set_main_window_tauri_resize_border_visible(window, false)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn set_main_window_fullscreen_webview_bounds(
    window: &WebviewWindow,
    geometry: MainWindowFullscreenGeometry,
) -> Result<(), String> {
    let webview: &tauri::Webview = window.as_ref();
    webview
        .set_bounds(tauri::Rect {
            position: tauri::Position::Physical(tauri::PhysicalPosition::new(
                geometry.webview_offset.0,
                geometry.webview_offset.1,
            )),
            size: tauri::Size::Physical(tauri::PhysicalSize::new(
                geometry.webview_size.0,
                geometry.webview_size.1,
            )),
        })
        .map_err(|source| {
            NativeError::Tauri {
                context: "Webview::set_bounds for fullscreen mode",
                source,
            }
            .into()
        })
}

#[cfg(not(target_os = "windows"))]
fn apply_main_window_borderless_fullscreen_bounds(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

fn confirm_main_window_mode_after_show(
    window: &WebviewWindow,
    mode: MainWindowMode,
) -> Result<(), String> {
    match mode {
        MainWindowMode::Fullscreen => {
            if window.is_fullscreen().unwrap_or(false) {
                window
                    .set_fullscreen(false)
                    .map_err(|source| NativeError::Tauri {
                        context:
                            "WebviewWindow::set_fullscreen(false confirm borderless fullscreen)",
                        source,
                    })?;
            }
            apply_main_window_native_surface_policy(window)
        }
        MainWindowMode::Windowed => Ok(()),
    }
}

fn should_use_native_window_effects(mode: MainWindowMode) -> bool {
    matches!(mode, MainWindowMode::Fullscreen | MainWindowMode::Windowed)
}

fn current_main_window_surface_state() -> Result<MainWindowSurfaceState, String> {
    MAIN_WINDOW_SURFACE_STATE
        .lock()
        .map(|state| *state)
        .map_err(|_| "Failed to lock main window surface state".to_string())
}

fn update_main_window_native_frame_state(enabled: bool) -> Result<MainWindowSurfaceState, String> {
    let mut state = MAIN_WINDOW_SURFACE_STATE
        .lock()
        .map_err(|_| "Failed to lock main window surface state".to_string())?;
    state.native_frame_enabled = enabled;
    state.revision = state.revision.wrapping_add(1);
    Ok(*state)
}

fn update_main_window_effects_state(enabled: bool) -> Result<MainWindowSurfaceState, String> {
    let mut state = MAIN_WINDOW_SURFACE_STATE
        .lock()
        .map_err(|_| "Failed to lock main window surface state".to_string())?;
    state.effects_enabled = enabled;
    state.revision = state.revision.wrapping_add(1);
    Ok(*state)
}

fn apply_main_window_surface_state_until_stable<State>(
    mut current_state: impl FnMut() -> Result<State, String>,
    mut apply_state: impl FnMut(State) -> Result<(), String>,
) -> Result<(), String>
where
    State: Copy + Eq,
{
    loop {
        let state = current_state()?;
        apply_state(state)?;
        if current_state()? == state {
            return Ok(());
        }
    }
}

fn should_enable_main_window_native_frame(mode: MainWindowMode, frame_enabled: bool) -> bool {
    frame_enabled && should_use_native_window_effects(mode)
}

fn should_enable_main_window_effects(mode: MainWindowMode, state: MainWindowSurfaceState) -> bool {
    state.effects_enabled
        && should_enable_main_window_native_frame(mode, state.native_frame_enabled)
}

fn apply_current_main_window_effects_until_stable(window: &WebviewWindow) -> Result<(), String> {
    apply_main_window_surface_state_until_stable(
        || {
            Ok((
                current_main_window_surface_state()?,
                current_main_window_mode()?,
            ))
        },
        |(state, mode)| {
            set_window_effects_enabled(window, should_enable_main_window_effects(mode, state))
        },
    )
}

fn should_round_main_window(mode: MainWindowMode, frame_enabled: bool) -> bool {
    frame_enabled && mode == MainWindowMode::Windowed
}

fn apply_main_window_native_surface_policy(window: &WebviewWindow) -> Result<(), String> {
    apply_main_window_surface_state_until_stable(
        || {
            Ok((
                current_main_window_surface_state()?,
                current_main_window_mode()?,
            ))
        },
        |(state, mode)| apply_main_window_native_surface_state(window, mode, state),
    )
}

fn apply_main_window_native_surface_state(
    window: &WebviewWindow,
    mode: MainWindowMode,
    state: MainWindowSurfaceState,
) -> Result<(), String> {
    let frame_enabled = should_enable_main_window_native_frame(mode, state.native_frame_enabled);
    if frame_enabled {
        apply_main_window_win32_surface_policy(window, mode, true)?;
        set_window_shadow_enabled(window, true)?;
    } else {
        set_window_shadow_enabled(window, false)?;
        apply_main_window_win32_surface_policy(window, mode, false)?;
    }
    set_window_effects_enabled(window, should_enable_main_window_effects(mode, state))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_main_window_win32_surface_policy(
    window: &WebviewWindow,
    mode: MainWindowMode,
    native_frame_enabled: bool,
) -> Result<(), String> {
    // `decorations: false` removes the regular frame, but Tao still owns
    // the underlying Win32 style. Keep the native caption/thickframe bits so
    // DWM materials and system animations stay active, then consume the
    // non-client area through WM_NCCALCSIZE.
    match mode {
        MainWindowMode::Fullscreen => {
            restore_main_window_resizable_frame_style(window)?;
            set_main_window_non_client_subclass(window, true)?;
            set_window_transitions_enabled(window, true)?;
            set_window_non_client_rendering(window)?;
            set_main_window_topmost(window, main_window_can_hold_topmost())?;
            refresh_main_window_frame(window)?;
            apply_main_window_borderless_fullscreen_bounds(window)?;
        }
        MainWindowMode::Windowed => {
            if EXPERIMENT_WINDOWED_THICKFRAME_NCCALCSIZE {
                restore_main_window_resizable_frame_style(window)?;
                set_main_window_non_client_subclass(window, true)?;
                set_window_transitions_enabled(window, true)?;
            } else {
                set_main_window_non_client_subclass(window, false)?;
            }
            set_window_non_client_rendering(window)?;
            set_main_window_topmost(window, false)?;
            refresh_main_window_frame(window)?;
            set_main_window_tauri_resize_border_visible(window, true)?;
        }
    }
    set_window_border_enabled(window, native_frame_enabled)?;
    set_window_corner_rounding_enabled(window, should_round_main_window(mode, native_frame_enabled))
}

#[cfg(not(target_os = "windows"))]
fn apply_main_window_win32_surface_policy(
    _window: &WebviewWindow,
    _mode: MainWindowMode,
    _native_frame_enabled: bool,
) -> Result<(), String> {
    Ok(())
}

pub(crate) fn disable_main_window_transitions(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        disable_window_transitions(&window)?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn disable_window_transitions(window: &WebviewWindow) -> Result<(), String> {
    set_window_transitions_enabled(window, false)
}

#[cfg(not(target_os = "windows"))]
fn disable_window_transitions(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn activate_window(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{BringWindowToTop, SetForegroundWindow};

    let hwnd = window.hwnd().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::hwnd for activation",
        source,
    })?;
    if is_main_window_foreground(window) {
        return Ok(());
    }
    let bring_result = unsafe { BringWindowToTop(hwnd) };
    let foreground_requested = unsafe { SetForegroundWindow(hwnd) }.as_bool();
    if is_main_window_foreground(window) {
        return Ok(());
    }
    if let Err(source) = bring_result {
        return Err(NativeError::Win32 {
            context: "BringWindowToTop for activation",
            source,
        }
        .into());
    }
    Err(format!(
        "SetForegroundWindow returned {foreground_requested}, but the main window did not become foreground"
    ))
}

#[cfg(not(target_os = "windows"))]
fn activate_window(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

fn focus_and_activate_window(window: &WebviewWindow) -> Result<(), String> {
    window.set_focus().map_err(|source| NativeError::Tauri {
        context: "WebviewWindow::set_focus for activation",
        source,
    })?;
    activate_window(window)
}

pub(crate) fn set_main_window_effects_enabled(
    app: &AppHandle,
    enabled: bool,
    open_sequence: Option<u64>,
    material: Option<&str>,
    appearance: Option<&str>,
) -> Result<(), String> {
    if !enabled {
        if open_sequence
            .is_some_and(|sequence| sequence != MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed))
        {
            return Ok(());
        }
        MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    }

    let (settings, settings_changed) = update_main_window_effect_settings(material, appearance)?;
    let requested_state = update_main_window_effects_state(enabled)?;
    if let Some(window) = app.get_webview_window("main") {
        let mode = current_main_window_mode()?;
        set_window_effects_enabled_with_config(
            &window,
            should_enable_main_window_effects(mode, requested_state),
            settings,
            settings_changed,
        )?;
        apply_main_window_win32_surface_policy(
            &window,
            mode,
            should_enable_main_window_native_frame(mode, requested_state.native_frame_enabled),
        )?;
        if (
            current_main_window_surface_state()?,
            current_main_window_mode()?,
        ) != (requested_state, mode)
        {
            apply_main_window_native_surface_policy(&window)?;
        }
    }
    Ok(())
}

pub(crate) fn refresh_main_window_effects(app: &AppHandle) {
    if !webview_is_healthy() {
        return;
    }
    if let Err(error) = refresh_main_window_effects_inner(app) {
        log::warn!(target: "window-effects", "Failed to refresh main window effects: {error}");
    }
}

fn refresh_main_window_effects_inner(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if !window.is_visible().unwrap_or(false) {
            return Ok(());
        }
        let mode = current_main_window_mode()?;
        apply_current_main_window_effects_until_stable(&window)?;
        let state = current_main_window_surface_state()?;
        let open_sequence = MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed);
        let disable_sequence = MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.load(Ordering::Relaxed);
        if mode == MainWindowMode::Fullscreen {
            set_main_window_topmost(&window, main_window_can_hold_topmost())?;
            apply_main_window_borderless_fullscreen_bounds(&window)?;
        }
        if should_enable_main_window_effects(mode, state) {
            schedule_window_effect_reapply(window, open_sequence, disable_sequence);
        }
    }
    Ok(())
}

pub(crate) fn release_main_window_topmost(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = set_main_window_topmost(&window, false);
    }
}

fn refresh_main_window_z_order_for_open(window: &WebviewWindow) -> Result<(), String> {
    // Windows can place the taskbar above a borderless transparent fullscreen
    // window when focus is restored from another app. The supervisor only
    // permits topmost after the renderer confirms the current open sequence.
    set_main_window_topmost(window, main_window_can_hold_topmost())
}

#[cfg(target_os = "windows")]
fn is_main_window_foreground(window: &WebviewWindow) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetAncestor, GetForegroundWindow, IsChild, GA_ROOT,
    };

    let Ok(hwnd) = window.hwnd() else {
        return window.is_focused().unwrap_or(false);
    };
    // Tauri focus state can lag after native fullscreen/topmost transitions.
    // Use the real Win32 foreground window so shortcut-triggered close handling
    // only runs when Lumeria, not another app, is actually active.
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.0.is_null() {
        return false;
    }
    if foreground == hwnd {
        return true;
    }
    let foreground_root = unsafe { GetAncestor(foreground, GA_ROOT) };
    foreground_root == hwnd || unsafe { IsChild(hwnd, foreground).as_bool() }
}

#[cfg(not(target_os = "windows"))]
fn is_main_window_foreground(window: &WebviewWindow) -> bool {
    window.is_focused().unwrap_or(false)
}

fn schedule_window_effect_reapply(
    window: WebviewWindow,
    open_sequence: u64,
    disable_sequence: u64,
) {
    for delay_ms in MAIN_WINDOW_EFFECT_REAPPLY_DELAYS_MS {
        let window = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(delay_ms));
            let result: Result<(), String> = (|| {
                if MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed) != open_sequence {
                    return Ok(());
                }
                if MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.load(Ordering::Relaxed) != disable_sequence {
                    return Ok(());
                }
                let state = current_main_window_surface_state()?;
                if !state.native_frame_enabled || !state.effects_enabled {
                    return Ok(());
                }
                if window.is_visible().unwrap_or(false) {
                    apply_current_main_window_effects_until_stable(&window)?;
                }
                Ok(())
            })();
            if let Err(error) = result {
                log::warn!(
                    target: "window-effects",
                    "Failed to reapply main window effects after {delay_ms}ms: {error}"
                );
            }
        });
    }
}

fn request_main_window_open(
    app: &AppHandle,
    open_sequence: u64,
    monitor_target: Option<MainWindowMonitorTarget>,
    open_settings_after_show: bool,
) {
    let force_cloak = monitor_target.is_some_and(|target| target.display_changed);
    let mut display_changed = false;
    if let (Some(window), Some(target)) = (app.get_webview_window("main"), monitor_target) {
        if target.display_changed {
            if let Err(error) = set_window_cloaked(&window, true) {
                log::warn!(
                    target: "tray",
                    "Failed to cloak Lumeria before shortcut monitor relocation: {error}"
                );
            }
            match current_main_window_mode() {
                Ok(mode) => match apply_shortcut_monitor_target(&window, mode, target) {
                    Ok(()) => display_changed = true,
                    Err(error) => {
                        log::warn!(
                            target: "tray",
                            "Failed to relocate Lumeria to the shortcut cursor monitor: {error}"
                        );
                    }
                },
                Err(error) => {
                    log::warn!(
                        target: "tray",
                        "Failed to read the main window mode before shortcut monitor relocation: {error}"
                    );
                }
            }
        }
    }
    let payload = MainWindowActivationPayload {
        open_sequence,
        display_changed,
    };
    schedule_main_window_show(
        app,
        open_sequence,
        main_window_deferred_show_delay(app),
        force_cloak,
        payload,
        open_settings_after_show,
    );
}

fn begin_supervised_open(app: &AppHandle) -> Option<u64> {
    let open_sequence = match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        Ok(mut state) if state.webview_health == WebviewHealth::Healthy => {
            let open_sequence = next_main_window_open_sequence();
            state.begin_open(open_sequence);
            Some(open_sequence)
        }
        Ok(_) => None,
        Err(_) => {
            log::error!(
                target: "main-window",
                "Failed to lock main window supervisor state before activation"
            );
            return None;
        }
    };
    let Some(open_sequence) = open_sequence else {
        show_webview_recovery_prompt(app);
        return None;
    };
    Some(open_sequence)
}

fn abort_main_window_open(app: &AppHandle, open_sequence: u64, reason: &str) {
    let should_abort = match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        Ok(mut state) => state.cancel_open(open_sequence),
        Err(_) => {
            log::error!(
                target: "main-window",
                "Failed to lock main window supervisor state while aborting open sequence {open_sequence}"
            );
            true
        }
    };
    if !should_abort || !invalidate_main_window_open_sequence(open_sequence) {
        return;
    }
    hide_main_window_surface(app, true);
    log::error!(
        target: "main-window",
        "Aborted main-window open sequence {open_sequence}; the native window was hidden: {reason}"
    );
}

fn schedule_renderer_ready_timeout(app: &AppHandle, open_sequence: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(MAIN_WINDOW_RENDERER_READY_TIMEOUT_MS));
        let transition = match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
            Ok(mut state) => state.renderer_ready_timeout(open_sequence),
            Err(_) => {
                log::error!(
                    target: "main-window",
                    "Failed to lock main window supervisor state after renderer-ready timeout"
                );
                ReadyTimeoutTransition::Hide
            }
        };
        if transition != ReadyTimeoutTransition::Hide {
            return;
        }
        if !invalidate_main_window_open_sequence(open_sequence) {
            return;
        }
        hide_main_window_surface(&app, true);
        log::error!(
            target: "main-window",
            "Renderer did not confirm open sequence {open_sequence} within {}ms; the native window was hidden",
            MAIN_WINDOW_RENDERER_READY_TIMEOUT_MS
        );
    });
}

fn invalidate_main_window_open_sequence(open_sequence: u64) -> bool {
    MAIN_WINDOW_OPEN_SEQUENCE
        .compare_exchange(
            open_sequence,
            open_sequence.wrapping_add(1),
            Ordering::Relaxed,
            Ordering::Relaxed,
        )
        .is_ok()
}

fn invalidate_current_main_window_open_sequence() {
    MAIN_WINDOW_OPEN_SEQUENCE.fetch_add(1, Ordering::Relaxed);
}

fn hide_main_window_surface(app: &AppHandle, keep_cloaked: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
        if should_disable_main_window_transitions_before_hide(mode) {
            if let Err(error) = set_window_transitions_enabled(&window, false) {
                log::warn!(target: "main-window", "Failed to disable transitions before hide: {error}");
            }
        }
        if keep_cloaked {
            if let Err(error) = set_window_cloaked(&window, true) {
                log::error!(target: "main-window", "Failed to cloak main window before fail-closed hide: {error}");
            }
        }
        if let Err(error) = set_main_window_topmost(&window, false) {
            log::error!(target: "main-window", "Failed to release main window topmost before hide: {error}");
        }
        let tauri_hide_failed = if let Err(error) = window.hide() {
            log::error!(target: "main-window", "Failed to hide main window through Tauri: {error}");
            true
        } else {
            false
        };
        let is_still_visible = match window.is_visible() {
            Ok(visible) => visible,
            Err(error) => {
                log::error!(
                    target: "main-window",
                    "Failed to verify main-window visibility after Tauri hide: {error}"
                );
                true
            }
        };
        if keep_cloaked || tauri_hide_failed || is_still_visible {
            if let Err(error) = hide_window_immediately(&window) {
                log::error!(target: "main-window", "Failed to hide main window through native fallback: {error}");
            }
        }
        if !keep_cloaked {
            if let Err(error) = set_window_cloaked(&window, false) {
                log::warn!(target: "main-window", "Failed to reset main window cloak after hide: {error}");
            }
        }
    }
}

fn open_main_window_inner(app: &AppHandle, open_settings_after_show: bool) -> bool {
    let Some(open_sequence) = begin_supervised_open(app) else {
        return false;
    };
    request_main_window_open(app, open_sequence, None, open_settings_after_show);
    true
}

pub(crate) fn open_main_window(app: &AppHandle) {
    let _ = open_main_window_inner(app, false);
}

pub(crate) fn hide_main_window(app: &AppHandle) {
    match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        Ok(mut state) => {
            state.cancel_pending_open();
            invalidate_current_main_window_open_sequence();
            hide_main_window_surface(app, false);
        }
        Err(_) => {
            log::error!(target: "main-window", "Failed to lock main window supervisor state before hide");
            invalidate_current_main_window_open_sequence();
            hide_main_window_surface(app, false);
        }
    }
}

pub(crate) fn webview_is_healthy() -> bool {
    match MAIN_WINDOW_SUPERVISOR_STATE.lock() {
        Ok(state) => state.webview_health == WebviewHealth::Healthy,
        Err(_) => {
            log::error!(
                target: "main-window",
                "Failed to lock main window supervisor state while checking WebView health"
            );
            false
        }
    }
}

pub(crate) fn trigger_main_window_shortcut(app: &AppHandle) {
    if !webview_is_healthy() {
        show_webview_recovery_prompt(app);
        return;
    }
    let window = app.get_webview_window("main");
    let monitor_target = window.as_ref().and_then(|window| {
        match resolve_cursor_monitor_target(window) {
            Ok(target) => target,
            Err(error) => {
                log::warn!(
                    target: "tray",
                    "Failed to resolve shortcut cursor monitor; keeping the current monitor: {error}"
                );
                None
            }
        }
    });
    let display_changed = monitor_target.is_some_and(|target| target.display_changed);
    let should_hide = window
        .as_ref()
        .map(|window| {
            let is_visible = window.is_visible().unwrap_or(false);
            let is_minimized = window.is_minimized().unwrap_or(false);
            should_hide_main_window_for_shortcut(
                is_visible,
                is_minimized,
                is_main_window_foreground(window),
                display_changed,
            )
        })
        .unwrap_or(false);

    if should_hide {
        if let Some(window) = window {
            let _ = apply_main_window_native_surface_policy(&window);
        }
        let open_sequence = MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed);
        let payload = MainWindowActivationPayload {
            open_sequence,
            display_changed: false,
        };
        if let Err(error) = app.emit(TOGGLE_DESKTOP_EVENT, payload) {
            log::warn!(target: "tray", "Failed to emit toggle desktop event: {error}");
        }
        return;
    }

    let Some(open_sequence) = begin_supervised_open(app) else {
        return;
    };
    request_main_window_open(app, open_sequence, monitor_target, false);
}

pub(crate) fn open_settings(app: &AppHandle) {
    let _ = open_main_window_inner(app, true);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn renderer_ready_timeout_hides_pending_open_instead_of_revealing_it() {
        let mut supervisor = MainWindowSupervisorState::DEFAULT;
        assert!(supervisor.begin_open(7));

        assert_eq!(
            supervisor.renderer_ready_timeout(7),
            ReadyTimeoutTransition::Hide
        );
        assert_eq!(supervisor.pending_open, PendingOpen::Idle);
    }

    #[test]
    fn stale_renderer_ready_cannot_reveal_a_newer_open() {
        let mut supervisor = MainWindowSupervisorState::DEFAULT;
        assert!(supervisor.begin_open(7));
        assert!(supervisor.begin_open(8));

        assert!(!supervisor.confirm_renderer_ready(7));
        assert_eq!(
            supervisor.pending_open,
            PendingOpen::AwaitingReady { open_sequence: 8 }
        );
        assert!(supervisor.confirm_renderer_ready(8));
    }

    #[test]
    fn stale_preparation_failure_cannot_cancel_a_newer_open() {
        let mut supervisor = MainWindowSupervisorState::DEFAULT;
        assert!(supervisor.begin_open(7));
        assert!(supervisor.begin_open(8));

        assert!(!supervisor.cancel_open(7));
        assert_eq!(
            supervisor.pending_open,
            PendingOpen::AwaitingReady { open_sequence: 8 }
        );
        assert!(supervisor.cancel_open(8));
    }

    #[test]
    fn fatal_webview_failure_is_handled_once_and_blocks_new_opens() {
        let mut supervisor = MainWindowSupervisorState::DEFAULT;
        assert!(supervisor.begin_open(3));

        assert_eq!(
            supervisor.webview_failed(),
            FailureTransition::HideAndRecover
        );
        assert_eq!(supervisor.webview_failed(), FailureTransition::Ignore);
        assert!(!supervisor.begin_open(4));
        assert_eq!(supervisor.pending_open, PendingOpen::Idle);
    }

    #[test]
    fn webview_failure_during_normal_termination_does_not_recover() {
        let mut supervisor = MainWindowSupervisorState::DEFAULT;
        supervisor.mark_terminating();

        assert_eq!(supervisor.webview_failed(), FailureTransition::Ignore);
    }

    #[test]
    fn pending_or_failed_webview_cannot_hold_topmost() {
        let mut supervisor = MainWindowSupervisorState::DEFAULT;
        assert!(supervisor.can_hold_topmost());

        assert!(supervisor.begin_open(1));
        assert!(!supervisor.can_hold_topmost());
        assert_eq!(
            supervisor.webview_failed(),
            FailureTransition::HideAndRecover
        );
        assert!(!supervisor.can_hold_topmost());
    }

    #[test]
    fn crash_loop_allows_only_one_automatic_restart_per_stability_window() {
        let mut history = WebviewRecoveryHistory::default();
        let first_failure = 1_000_000;

        assert!(register_webview_failure_timestamp(
            &mut history,
            first_failure
        ));
        assert!(!register_webview_failure_timestamp(
            &mut history,
            first_failure + WEBVIEW_RECOVERY_RESTART_WINDOW_MS - 1
        ));
        assert!(register_webview_failure_timestamp(
            &mut history,
            first_failure + (WEBVIEW_RECOVERY_RESTART_WINDOW_MS * 2)
        ));
    }

    #[test]
    fn only_browser_and_main_renderer_failures_are_fatal() {
        assert!(is_fatal_process_failure(
            PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED
        ));
        assert!(is_fatal_process_failure(
            PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED
        ));
        assert!(is_fatal_process_failure(
            PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE
        ));
        assert!(!is_fatal_process_failure(3));
        assert!(!is_fatal_process_failure(4));
        assert!(!is_fatal_process_failure(6));
    }

    #[test]
    fn main_window_effect_reapply_converges_after_state_changes_during_apply() {
        let revision = Cell::new(1_u64);
        let effects_enabled = Cell::new(true);
        let mut first_apply = true;
        let mut applied = Vec::new();

        apply_main_window_surface_state_until_stable(
            || Ok((revision.get(), effects_enabled.get())),
            |(_, enabled)| {
                applied.push(enabled);
                if first_apply {
                    first_apply = false;
                    effects_enabled.set(false);
                    revision.set(2);
                }
                Ok(())
            },
        )
        .expect("effect state should converge");

        assert_eq!(applied, vec![true, false]);
    }

    #[test]
    fn main_window_mode_accepts_known_modes() {
        assert_eq!(
            MainWindowMode::from_str("fullscreen"),
            Some(MainWindowMode::Fullscreen)
        );
        assert_eq!(
            MainWindowMode::from_str("windowed"),
            Some(MainWindowMode::Windowed)
        );
        assert_eq!(
            MainWindowMode::from_str(" windowed "),
            Some(MainWindowMode::Windowed)
        );
    }

    #[test]
    fn main_window_mode_rejects_unknown_modes() {
        assert_eq!(MainWindowMode::from_str("maximized"), None);
        assert_eq!(MainWindowMode::from_str(""), None);
    }

    #[test]
    fn main_window_corner_rounding_only_applies_to_windowed_mode() {
        assert!(should_round_main_window(MainWindowMode::Windowed, true));
        assert!(!should_round_main_window(MainWindowMode::Fullscreen, true));
        assert!(!should_round_main_window(MainWindowMode::Windowed, false));
    }

    #[test]
    fn main_window_native_frame_requires_open_surface_state() {
        assert!(should_enable_main_window_native_frame(
            MainWindowMode::Windowed,
            true
        ));
        assert!(should_enable_main_window_native_frame(
            MainWindowMode::Fullscreen,
            true
        ));
        assert!(!should_enable_main_window_native_frame(
            MainWindowMode::Windowed,
            false
        ));
    }

    #[test]
    fn shortcut_hides_only_when_foreground_on_the_cursor_monitor() {
        assert!(should_hide_main_window_for_shortcut(
            true, false, true, false
        ));
        assert!(!should_hide_main_window_for_shortcut(
            true, false, true, true
        ));
        assert!(!should_hide_main_window_for_shortcut(
            true, true, true, false
        ));
        assert!(!should_hide_main_window_for_shortcut(
            true, false, false, false
        ));
    }

    #[test]
    fn windowed_target_rect_centers_and_clamps_inside_negative_work_area() {
        let work_area = MainWindowRect::new(-1920, 0, 0, 1040);
        let centered = center_main_window_rect_in_work_area(1280, 820, work_area);

        assert_eq!(centered, MainWindowRect::new(-1600, 110, -320, 930));

        let oversized = center_main_window_rect_in_work_area(2400, 1200, work_area);
        assert_eq!(oversized, work_area);
    }

    #[test]
    fn saved_window_placement_accounts_for_top_and_left_taskbars() {
        let monitor = MainWindowRect::new(-1920, 0, 0, 1080);
        let work = MainWindowRect::new(-1880, 30, 0, 1080);
        let screen_rect = MainWindowRect::new(-1600, 130, -320, 950);

        assert_eq!(
            screen_rect_to_window_placement_coordinates(screen_rect, monitor, work),
            MainWindowRect::new(-1640, 100, -360, 920)
        );
    }

    #[test]
    fn fullscreen_overscan_expands_the_outer_surface_without_resizing_the_webview() {
        let geometry =
            resolve_main_window_fullscreen_geometry(MainWindowRect::new(-2560, 0, 0, 1080), true);

        assert_eq!(
            geometry.window_rect,
            MainWindowRect::new(-2561, -1, 1, 1081)
        );
        assert_eq!(geometry.webview_offset, (1, 1));
        assert_eq!(geometry.webview_size, (2560, 1080));
    }

    #[test]
    fn disabled_fullscreen_overscan_uses_the_exact_monitor_bounds() {
        let geometry =
            resolve_main_window_fullscreen_geometry(MainWindowRect::new(-2560, 0, 0, 1080), false);

        assert_eq!(geometry.window_rect, MainWindowRect::new(-2560, 0, 0, 1080));
        assert_eq!(geometry.webview_offset, (0, 0));
        assert_eq!(geometry.webview_size, (2560, 1080));
    }

    #[test]
    fn activation_payload_serializes_as_the_frontend_contract() {
        let payload = MainWindowActivationPayload {
            open_sequence: 7,
            display_changed: true,
        };

        assert_eq!(
            serde_json::to_value(payload).expect("activation payload should serialize"),
            serde_json::json!({
                "displayChanged": true,
                "openSequence": 7,
            })
        );
    }

    #[test]
    fn webview_recovery_prompt_uses_the_shared_locale_catalog() {
        let chinese = webview_recovery_prompt_copy("zh-CN", Some("C:\\Logs"))
            .expect("Chinese recovery prompt");
        let english = webview_recovery_prompt_copy("en-US", None).expect("English recovery prompt");

        assert_eq!(chinese.title, "Lumeria 界面恢复");
        assert!(chinese.message.contains("C:\\Logs"));
        assert_eq!(english.title, "Lumeria interface recovery");
        assert!(english.message.contains("log folder unavailable"));
        assert!(english.message.contains("Choose Yes to restart"));
    }
}
