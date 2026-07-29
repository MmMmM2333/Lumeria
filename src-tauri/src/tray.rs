use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};

use tauri::{menu::MenuBuilder, tray::TrayIconBuilder, AppHandle, Emitter, Manager, WebviewWindow};

use crate::{
    dwm::{
        set_main_window_topmost, set_window_cloaked, set_window_corner_rounding_enabled,
        set_window_non_client_rendering, set_window_shadow_enabled, set_window_transitions_enabled,
    },
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
const MAIN_WINDOW_CLOAKED_REVEAL_FALLBACK_DELAY_MS: u64 = 160;
const MAIN_WINDOW_NON_CLIENT_SUBCLASS_ID: usize = 1;
const EXPERIMENT_WINDOWED_THICKFRAME_NCCALCSIZE: bool = true;
const WM_NCUAHDRAWCAPTION: u32 = 0x00AE;
const WM_NCUAHDRAWFRAME: u32 = 0x00AF;
static MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_OPEN_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_MODE: Mutex<MainWindowMode> = Mutex::new(MainWindowMode::DEFAULT);
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

fn show_main_window_for_sequence(app: &AppHandle, open_sequence: u64) {
    if MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed) != open_sequence {
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
        let should_cloak =
            !window.is_visible().unwrap_or(false) || window.is_minimized().unwrap_or(false);
        if should_cloak {
            // Hidden transparent WebView2 windows can flash a white/native
            // backing surface for one frame when they are shown. DWM cloaking
            // keeps the window internally composited but off-screen until the
            // renderer reports that the opening frame has painted, which avoids
            // exposing that first unstable frame. This follows the workaround
            // described at https://stackoverflow.com/a/74019785.
            let _ = set_window_cloaked(&window, true);
        }
        if should_disable_main_window_transitions_before_show(mode) {
            let _ = disable_main_window_transitions(app);
        }
        if should_apply_main_window_surface_policy_before_show(mode) {
            let _ = apply_main_window_mode_to_window(&window, mode);
            let _ = apply_main_window_native_surface_policy(&window, mode);
        }
        if !should_cloak {
            let _ = set_window_cloaked(&window, false);
        }
        if !window.is_visible().unwrap_or(false) {
            let _ = window.show();
        }
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        if should_cloak {
            update_window_now(&window);
            schedule_main_window_cloak_fallback(app, open_sequence);
        }
        let _ = window.set_focus();
        let _ = activate_window(&window);
        let _ = confirm_main_window_mode_after_show(&window, mode);
        if mode == MainWindowMode::Fullscreen {
            let _ = window.set_focus();
            let _ = activate_window(&window);
        }
        let disable_sequence = MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.load(Ordering::Relaxed);
        if should_use_native_window_effects(mode) {
            let _ = set_window_effects_enabled(&window, true);
            schedule_window_effect_reapply(window, open_sequence, disable_sequence);
        } else if mode == MainWindowMode::Fullscreen {
            let _ = bump_main_window_z_order_for_open(&window);
        }
    }
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

fn schedule_main_window_show(app: &AppHandle, open_sequence: u64, delay_ms: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        if delay_ms > 0 {
            std::thread::sleep(Duration::from_millis(delay_ms));
        }
        show_main_window_for_sequence(&app, open_sequence);
    });
}

fn schedule_main_window_cloak_fallback(app: &AppHandle, open_sequence: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(
            MAIN_WINDOW_CLOAKED_REVEAL_FALLBACK_DELAY_MS,
        ));
        if let Err(error) = reveal_main_window(&app, Some(open_sequence)) {
            log::warn!(target: "tray", "Failed to run main window cloak fallback: {error}");
        }
    });
}

pub(crate) fn reveal_main_window(
    app: &AppHandle,
    open_sequence: Option<u64>,
) -> Result<(), String> {
    if open_sequence
        .is_some_and(|sequence| sequence != MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed))
    {
        return Ok(());
    }
    if let Some(window) = app.get_webview_window("main") {
        set_window_cloaked(&window, false)?;
        let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
        if should_enable_windowed_transitions_after_reveal(mode) {
            set_window_transitions_enabled(&window, true)?;
        }
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

pub(crate) fn set_main_window_mode(app: &AppHandle, mode: &str) -> Result<String, String> {
    let next = MainWindowMode::from_str(mode)
        .ok_or_else(|| format!("Unsupported main window mode: {mode}"))?;
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
        apply_main_window_native_surface_policy(&window, next)?;
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

pub(crate) fn set_main_window_shadow_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
        set_window_shadow_enabled(&window, enabled && should_use_native_window_effects(mode))?;
        apply_main_window_win32_surface_policy(&window, mode)?;
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
                IsZoomed, NCCALCSIZE_PARAMS, SC_KEYMENU, WM_NCACTIVATE, WM_NCCALCSIZE,
                WM_NCDESTROY, WM_NCPAINT, WM_SYSCOMMAND,
            },
        },
    };

    match message {
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
        GetWindowPlacement, IsZoomed, SW_MAXIMIZE, WINDOWPLACEMENT,
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
            || unsafe { IsZoomed(hwnd).as_bool() },
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
    set_window_non_client_rendering(window, true)?;
    refresh_main_window_frame(window)?;
    apply_main_window_borderless_fullscreen_bounds(window)
}

#[cfg(not(target_os = "windows"))]
fn prepare_main_window_fullscreen_surface(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_main_window_borderless_fullscreen_bounds(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::{
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        },
        UI::WindowsAndMessaging::{
            GetWindowPlacement, IsZoomed, SetWindowPlacement, SetWindowPos, SWP_NOACTIVATE,
            SWP_NOOWNERZORDER, SWP_NOSENDCHANGING, SWP_NOZORDER, SW_SHOWNORMAL, WINDOWPLACEMENT,
        },
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
    let rect = info.rcMonitor;
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
        placement.rcNormalPosition = rect;
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
    Ok(())
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
            apply_main_window_win32_surface_policy(window, mode)
        }
        MainWindowMode::Windowed => Ok(()),
    }
}

fn should_use_native_window_effects(mode: MainWindowMode) -> bool {
    matches!(mode, MainWindowMode::Fullscreen | MainWindowMode::Windowed)
}

fn should_round_main_window(mode: MainWindowMode) -> bool {
    mode == MainWindowMode::Windowed
}

fn apply_main_window_native_surface_policy(
    window: &WebviewWindow,
    mode: MainWindowMode,
) -> Result<(), String> {
    let enabled = should_use_native_window_effects(mode);
    if enabled {
        apply_main_window_win32_surface_policy(window, mode)?;
        set_window_shadow_enabled(window, true)?;
        set_window_effects_enabled(window, true)?;
    } else {
        set_window_shadow_enabled(window, false)?;
        set_window_effects_enabled(window, false)?;
        apply_main_window_win32_surface_policy(window, mode)?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_main_window_win32_surface_policy(
    window: &WebviewWindow,
    mode: MainWindowMode,
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
            set_window_non_client_rendering(window, true)?;
            set_main_window_topmost(window, true)?;
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
            set_window_non_client_rendering(window, true)?;
            set_main_window_topmost(window, false)?;
            refresh_main_window_frame(window)?;
        }
    }
    set_window_corner_rounding_enabled(window, should_round_main_window(mode))
}

#[cfg(not(target_os = "windows"))]
fn apply_main_window_win32_surface_policy(
    _window: &WebviewWindow,
    _mode: MainWindowMode,
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
    unsafe {
        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn activate_window(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
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
    if let Some(window) = app.get_webview_window("main") {
        let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
        set_window_effects_enabled_with_config(
            &window,
            enabled && should_use_native_window_effects(mode),
            settings,
            settings_changed,
        )?;
        apply_main_window_win32_surface_policy(&window, mode)?;
    }
    Ok(())
}

pub(crate) fn refresh_main_window_effects(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if !window.is_visible().unwrap_or(false) {
            return;
        }
        let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
        if !should_use_native_window_effects(mode) {
            let _ = set_window_effects_enabled(&window, false);
            let _ = apply_main_window_win32_surface_policy(&window, mode);
            if mode == MainWindowMode::Fullscreen {
                let _ = set_main_window_topmost(&window, true);
            }
            return;
        }
        let open_sequence = MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed);
        let disable_sequence = MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.load(Ordering::Relaxed);
        let _ = set_window_effects_enabled(&window, true);
        if mode == MainWindowMode::Fullscreen {
            let _ = set_main_window_topmost(&window, true);
            let _ = apply_main_window_borderless_fullscreen_bounds(&window);
        }
        schedule_window_effect_reapply(window, open_sequence, disable_sequence);
    }
}

pub(crate) fn release_main_window_topmost(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = set_main_window_topmost(&window, false);
    }
}

fn bump_main_window_z_order_for_open(window: &WebviewWindow) -> Result<(), String> {
    // Windows can place the taskbar above a borderless transparent fullscreen
    // window when focus is restored from another app. Keep topmost only while
    // Lumeria is foreground; Focused(false) and hide/windowed paths release it.
    set_main_window_topmost(window, true)
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
            if MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed) != open_sequence {
                return;
            }
            if MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.load(Ordering::Relaxed) != disable_sequence {
                return;
            }
            if window.is_visible().unwrap_or(false) {
                let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
                if should_use_native_window_effects(mode) {
                    let _ = set_window_effects_enabled(&window, true);
                } else {
                    let _ = set_window_effects_enabled(&window, false);
                }
            }
        });
    }
}

pub(crate) fn open_main_window(app: &AppHandle) {
    let open_sequence = next_main_window_open_sequence();
    if let Err(error) = app.emit(OPEN_DESKTOP_EVENT, open_sequence) {
        log::warn!(target: "tray", "Failed to emit open desktop event: {error}");
    }
    schedule_main_window_show(app, open_sequence, main_window_deferred_show_delay(app));
}

pub(crate) fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
        if should_disable_main_window_transitions_before_hide(mode) {
            let _ = set_window_transitions_enabled(&window, false);
        }
        let _ = set_window_cloaked(&window, false);
        let _ = set_main_window_topmost(&window, false);
        let _ = window.hide();
    }
}

pub(crate) fn trigger_main_window_shortcut(app: &AppHandle) {
    let should_hide = app
        .get_webview_window("main")
        .map(|window| {
            let is_visible = window.is_visible().unwrap_or(false);
            let is_minimized = window.is_minimized().unwrap_or(false);
            is_visible && !is_minimized && is_main_window_foreground(&window)
        })
        .unwrap_or(false);

    if should_hide {
        if let Some(window) = app.get_webview_window("main") {
            let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
            let _ = apply_main_window_native_surface_policy(&window, mode);
        }
        let open_sequence = MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed);
        if let Err(error) = app.emit(TOGGLE_DESKTOP_EVENT, open_sequence) {
            log::warn!(target: "tray", "Failed to emit toggle desktop event: {error}");
        }
        return;
    }

    let open_sequence = next_main_window_open_sequence();
    if let Err(error) = app.emit(OPEN_DESKTOP_EVENT, open_sequence) {
        log::warn!(target: "tray", "Failed to emit open desktop event: {error}");
    }
    schedule_main_window_show(app, open_sequence, main_window_deferred_show_delay(app));
}

pub(crate) fn open_settings(app: &AppHandle) {
    open_main_window(app);
    if let Err(error) = app.emit("lumeria-open-settings", ()) {
        log::warn!(target: "tray", "Failed to emit open settings event: {error}");
    }
}

pub(crate) fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text("show", "显示 Lumeria")
        .text("settings", "设置")
        .separator()
        .text("quit", "退出")
        .build()?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Lumeria");

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(should_round_main_window(MainWindowMode::Windowed));
        assert!(!should_round_main_window(MainWindowMode::Fullscreen));
    }
}
