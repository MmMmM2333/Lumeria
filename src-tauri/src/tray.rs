use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};

use serde::Serialize;
use tauri::{
    menu::MenuBuilder,
    tray::TrayIconBuilder,
    window::{Color, Effect, EffectsBuilder},
    AppHandle, Emitter, Manager, WebviewWindow,
};

pub(crate) const OPEN_DESKTOP_EVENT: &str = "launchpad-open-desktop";
pub(crate) const TOGGLE_DESKTOP_EVENT: &str = "launchpad-toggle-desktop";
pub(crate) const CLOSE_DESKTOP_EVENT: &str = "launchpad-close-desktop";
const MAIN_WINDOW_ACRYLIC_DARK_COLOR: Color = Color(0x10, 0x14, 0x1f, 0xcc);
const MAIN_WINDOW_ACRYLIC_LIGHT_COLOR: Color = Color(0xf3, 0xf6, 0xfb, 0xcc);
const MAIN_WINDOW_EFFECT_REAPPLY_DELAYS_MS: [u64; 2] = [80, 180];
const MAIN_WINDOW_DEFERRED_SHOW_DELAY_MS: u64 = 0;
const MAIN_WINDOW_CLOAKED_REVEAL_FALLBACK_DELAY_MS: u64 = 160;
const MAIN_WINDOW_NON_CLIENT_SUBCLASS_ID: usize = 1;
const EXPERIMENT_WINDOWED_THICKFRAME_NCCALCSIZE: bool = true;
const WM_NCUAHDRAWCAPTION: u32 = 0x00AE;
const WM_NCUAHDRAWFRAME: u32 = 0x00AF;
const WINDOWS_ACRYLIC_MIN_BUILD: u32 = 17763;
const WINDOWS_MICA_MIN_BUILD: u32 = 22000;
const WINDOWS_MICA_ALT_MIN_BUILD: u32 = 22621;
static MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_OPEN_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_EFFECT_SETTINGS: Mutex<MainWindowEffectSettings> =
    Mutex::new(MainWindowEffectSettings::DEFAULT);
static MAIN_WINDOW_MODE: Mutex<MainWindowMode> = Mutex::new(MainWindowMode::DEFAULT);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MainWindowEffectMaterial {
    None,
    Acrylic,
    Mica,
    MicaAlt,
}

impl MainWindowEffectMaterial {
    fn from_str(value: &str) -> Option<Self> {
        match value {
            "none" => Some(Self::None),
            "acrylic" => Some(Self::Acrylic),
            "mica" => Some(Self::Mica),
            "micaAlt" | "mica-alt" => Some(Self::MicaAlt),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MainWindowEffectAppearance {
    Dark,
    Light,
}

impl MainWindowEffectAppearance {
    fn from_str(value: &str) -> Option<Self> {
        match value {
            "dark" => Some(Self::Dark),
            "light" => Some(Self::Light),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MainWindowEffectSettings {
    material: MainWindowEffectMaterial,
    appearance: MainWindowEffectAppearance,
}

impl MainWindowEffectSettings {
    const DEFAULT: Self = Self {
        material: MainWindowEffectMaterial::Acrylic,
        appearance: MainWindowEffectAppearance::Dark,
    };

    fn from_options(material: Option<&str>, appearance: Option<&str>, fallback: Self) -> Self {
        Self {
            material: material
                .and_then(MainWindowEffectMaterial::from_str)
                .unwrap_or(fallback.material),
            appearance: appearance
                .and_then(MainWindowEffectAppearance::from_str)
                .unwrap_or(fallback.appearance),
        }
    }

    fn effect(self) -> Option<Effect> {
        match (self.material, self.appearance) {
            (MainWindowEffectMaterial::None, _) => None,
            (MainWindowEffectMaterial::Acrylic, _) => Some(Effect::Acrylic),
            (MainWindowEffectMaterial::Mica, MainWindowEffectAppearance::Dark) => {
                Some(Effect::MicaDark)
            }
            (MainWindowEffectMaterial::Mica, MainWindowEffectAppearance::Light) => {
                Some(Effect::MicaLight)
            }
            (MainWindowEffectMaterial::MicaAlt, MainWindowEffectAppearance::Dark) => {
                Some(Effect::TabbedDark)
            }
            (MainWindowEffectMaterial::MicaAlt, MainWindowEffectAppearance::Light) => {
                Some(Effect::TabbedLight)
            }
        }
    }

    fn acrylic_color(self) -> Color {
        match self.appearance {
            MainWindowEffectAppearance::Dark => MAIN_WINDOW_ACRYLIC_DARK_COLOR,
            MainWindowEffectAppearance::Light => MAIN_WINDOW_ACRYLIC_LIGHT_COLOR,
        }
    }

    fn is_dark(self) -> bool {
        self.appearance == MainWindowEffectAppearance::Dark
    }
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MainWindowEffectsSupport {
    platform: &'static str,
    build: Option<u32>,
    supports_acrylic: bool,
    supports_mica: bool,
    supports_mica_alt: bool,
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
    mode == MainWindowMode::Fullscreen || !EXPERIMENT_WINDOWED_THICKFRAME_NCCALCSIZE
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
        let _ = reveal_main_window(&app, Some(open_sequence));
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
        apply_main_window_mode_to_window(&window, mode)?;
    }
    Ok(())
}

pub(crate) fn set_main_window_mode(app: &AppHandle, mode: &str) -> Result<String, String> {
    let mode = update_main_window_mode(mode)?;
    if let Some(window) = app.get_webview_window("main") {
        apply_main_window_mode_to_window(&window, mode)?;
        apply_main_window_native_surface_policy(&window, mode)?;
    }
    Ok(mode.as_str().to_string())
}

pub(crate) fn set_main_window_shadow_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let mode = current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT);
        set_window_shadow_enabled(&window, enabled && should_use_native_window_effects(mode))?;
        apply_main_window_win32_surface_policy(&window, mode)?;
    }
    Ok(())
}

fn set_window_shadow_enabled(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_shadow(enabled)
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn set_window_cloaked(window: &WebviewWindow, cloaked: bool) -> Result<(), String> {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_CLOAK};

    let cloak = if cloaked { 1i32 } else { 0i32 };
    unsafe {
        DwmSetWindowAttribute(
            window.hwnd().map_err(|error| error.to_string())?,
            DWMWA_CLOAK,
            &cloak as *const _ as _,
            std::mem::size_of_val(&cloak) as u32,
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_window_cloaked(_window: &WebviewWindow, _cloaked: bool) -> Result<(), String> {
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
fn set_window_non_client_rendering(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMNCRP_DISABLED, DWMNCRP_USEWINDOWSTYLE, DWMWA_NCRENDERING_POLICY,
    };

    let policy = if enabled {
        DWMNCRP_USEWINDOWSTYLE
    } else {
        DWMNCRP_DISABLED
    };
    unsafe {
        DwmSetWindowAttribute(
            window.hwnd().map_err(|error| error.to_string())?,
            DWMWA_NCRENDERING_POLICY,
            &policy as *const _ as _,
            std::mem::size_of_val(&policy) as u32,
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn set_main_window_non_client_subclass(
    window: &WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    use windows::Win32::UI::Shell::{RemoveWindowSubclass, SetWindowSubclass};

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    unsafe {
        if enabled {
            if !SetWindowSubclass(
                hwnd,
                Some(main_window_non_client_subclass_proc),
                MAIN_WINDOW_NON_CLIENT_SUBCLASS_ID,
                0,
            )
            .as_bool()
            {
                return Err("Failed to install main window non-client subclass".to_string());
            }
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
                IsZoomed, NCCALCSIZE_PARAMS, WM_NCACTIVATE, WM_NCCALCSIZE, WM_NCDESTROY, WM_NCPAINT,
            },
        },
    };

    match message {
        WM_NCCALCSIZE => {
            let is_windowed_mode =
                current_main_window_mode().unwrap_or(MainWindowMode::DEFAULT)
                    == MainWindowMode::Windowed;
            if is_windowed_mode && wparam.0 != 0 && lparam.0 != 0 && IsZoomed(hwnd).as_bool() {
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
            LRESULT(0)
        }
        WM_NCPAINT | WM_NCUAHDRAWCAPTION | WM_NCUAHDRAWFRAME => LRESULT(0),
        WM_NCACTIVATE => LRESULT(1),
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
fn strip_main_window_non_client_style(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_STYLE, WS_CAPTION, WS_MAXIMIZEBOX,
        WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
    };

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let current_style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) };
    let next_style = (current_style
        & !main_window_style_mask([
            WS_CAPTION.0,
            WS_THICKFRAME.0,
            WS_SYSMENU.0,
            WS_MINIMIZEBOX.0,
            WS_MAXIMIZEBOX.0,
        ]))
        | main_window_style_mask([WS_POPUP.0]);
    if next_style != current_style {
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_STYLE, next_style);
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn restore_main_window_resizable_frame_style(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_STYLE, WS_CAPTION, WS_MAXIMIZEBOX,
        WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
    };

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let current_style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) };
    let next_style = (current_style & !main_window_style_mask([WS_POPUP.0]))
        | main_window_style_mask([
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
            window.hwnd().map_err(|error| error.to_string())?,
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
    .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn set_main_window_topmost(window: &WebviewWindow, topmost: bool) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER,
        SWP_NOSENDCHANGING, SWP_NOSIZE,
    };

    let hwnd_insert_after = if topmost {
        Some(HWND_TOPMOST)
    } else {
        Some(HWND_NOTOPMOST)
    };
    unsafe {
        SetWindowPos(
            window.hwnd().map_err(|error| error.to_string())?,
            hwnd_insert_after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING,
        )
    }
    .map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
fn set_main_window_topmost(_window: &WebviewWindow, _topmost: bool) -> Result<(), String> {
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

fn update_main_window_mode(mode: &str) -> Result<MainWindowMode, String> {
    let next = MainWindowMode::from_str(mode)
        .ok_or_else(|| format!("Unsupported main window mode: {mode}"))?;
    let mut current = MAIN_WINDOW_MODE
        .lock()
        .map_err(|_| "Failed to lock main window mode".to_string())?;
    *current = next;
    Ok(next)
}

fn apply_main_window_mode_to_window(
    window: &WebviewWindow,
    mode: MainWindowMode,
) -> Result<(), String> {
    match mode {
        MainWindowMode::Fullscreen => {
            prepare_main_window_fullscreen_surface(window)?;
            window
                .set_decorations(false)
                .map_err(|error| error.to_string())?;
            window
                .set_resizable(false)
                .map_err(|error| error.to_string())?;
            if !window.is_fullscreen().unwrap_or(false) {
                window
                    .set_fullscreen(true)
                    .map_err(|error| error.to_string())?;
            }
        }
        MainWindowMode::Windowed => {
            window
                .set_decorations(false)
                .map_err(|error| error.to_string())?;
            window
                .set_resizable(true)
                .map_err(|error| error.to_string())?;
            if window.is_fullscreen().unwrap_or(false) {
                window
                    .set_fullscreen(false)
                    .map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn prepare_main_window_fullscreen_surface(window: &WebviewWindow) -> Result<(), String> {
    set_window_transitions_enabled(window, false)?;
    set_window_non_client_rendering(window, false)?;
    set_main_window_non_client_subclass(window, true)?;
    strip_main_window_non_client_style(window)?;
    refresh_main_window_frame(window)
}

#[cfg(not(target_os = "windows"))]
fn prepare_main_window_fullscreen_surface(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

fn confirm_main_window_mode_after_show(
    window: &WebviewWindow,
    mode: MainWindowMode,
) -> Result<(), String> {
    match mode {
        MainWindowMode::Fullscreen => {
            window
                .set_fullscreen(true)
                .map_err(|error| error.to_string())?;
            apply_main_window_win32_surface_policy(window, mode)
        }
        MainWindowMode::Windowed => Ok(()),
    }
}

fn should_use_native_window_effects(mode: MainWindowMode) -> bool {
    // Fullscreen is a transparent borderless surface; DWM material
    // or shadow can expose frame artifacts.
    mode == MainWindowMode::Windowed
}

fn apply_main_window_native_surface_policy(
    window: &WebviewWindow,
    mode: MainWindowMode,
) -> Result<(), String> {
    let enabled = should_use_native_window_effects(mode);
    set_window_shadow_enabled(window, enabled)?;
    if enabled {
        set_window_effects_enabled(window, true)?;
    } else {
        set_window_effects_enabled(window, false)?;
    }
    apply_main_window_win32_surface_policy(window, mode)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn apply_main_window_win32_surface_policy(
    window: &WebviewWindow,
    mode: MainWindowMode,
) -> Result<(), String> {
    // `decorations: false` removes the regular frame, but Tao still owns
    // the Windows fullscreen state machine. Focus changes can make Windows
    // recalculate and paint non-client chrome for a frame, which is visible
    // on our transparent overlay. Fullscreen therefore needs explicit Win32
    // style stripping and non-client message suppression.
    match mode {
        MainWindowMode::Fullscreen => {
            set_window_transitions_enabled(window, false)?;
            set_window_non_client_rendering(window, false)?;
            set_main_window_non_client_subclass(window, true)?;
            strip_main_window_non_client_style(window)?;
            refresh_main_window_frame(window)
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
            refresh_main_window_frame(window)
        }
    }
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

#[cfg(target_os = "windows")]
fn set_window_transitions_enabled(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};

    let disabled = if enabled { 0i32 } else { 1i32 };
    unsafe {
        DwmSetWindowAttribute(
            window.hwnd().map_err(|error| error.to_string())?,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            &disabled as *const _ as _,
            std::mem::size_of_val(&disabled) as u32,
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_window_transitions_enabled(_window: &WebviewWindow, _enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn disable_window_transitions(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn activate_window(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{BringWindowToTop, SetForegroundWindow};

    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
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

fn set_window_effects_enabled(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    let settings = current_main_window_effect_settings()?;
    set_window_effects_enabled_with_config(window, enabled, settings, false)
}

fn set_window_effects_enabled_with_config(
    window: &WebviewWindow,
    enabled: bool,
    settings: MainWindowEffectSettings,
    clear_first: bool,
) -> Result<(), String> {
    if enabled {
        let support = main_window_effects_support();
        let settings = coerce_effect_settings_for_support(settings, &support);
        if settings.material == MainWindowEffectMaterial::None {
            window
                .set_effects(None)
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
        if !is_effect_settings_supported(settings, &support) {
            window
                .set_effects(None)
                .map_err(|error| error.to_string())?;
            return Ok(());
        }

        if clear_first {
            window
                .set_effects(None)
                .map_err(|error| error.to_string())?;
        }

        set_window_backdrop_dark_mode(window, settings.is_dark())?;
        let effect = settings
            .effect()
            .ok_or_else(|| "Window effect material does not map to a native effect".to_string())?;
        let effects = if settings.material == MainWindowEffectMaterial::Acrylic {
            EffectsBuilder::new()
                .effect(effect)
                .color(settings.acrylic_color())
                .build()
        } else {
            EffectsBuilder::new().effect(effect).build()
        };
        window
            .set_effects(effects)
            .map_err(|error| error.to_string())?;
        set_window_backdrop_dark_mode(window, settings.is_dark())?;
    } else {
        window
            .set_effects(None)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn main_window_effects_support() -> MainWindowEffectsSupport {
    let build = current_windows_build();
    let (supports_acrylic, supports_mica, supports_mica_alt) =
        effect_support_for_windows_build(build);
    MainWindowEffectsSupport {
        platform: current_platform(),
        build,
        supports_acrylic,
        supports_mica,
        supports_mica_alt,
    }
}

fn current_main_window_effect_settings() -> Result<MainWindowEffectSettings, String> {
    MAIN_WINDOW_EFFECT_SETTINGS
        .lock()
        .map(|settings| *settings)
        .map_err(|_| "Failed to lock main window effect settings".to_string())
}

fn update_main_window_effect_settings(
    material: Option<&str>,
    appearance: Option<&str>,
) -> Result<(MainWindowEffectSettings, bool), String> {
    let support = main_window_effects_support();
    let mut settings = MAIN_WINDOW_EFFECT_SETTINGS
        .lock()
        .map_err(|_| "Failed to lock main window effect settings".to_string())?;
    let requested = MainWindowEffectSettings::from_options(material, appearance, *settings);
    let next = coerce_effect_settings_for_support(requested, &support);
    let changed = next != *settings;
    *settings = next;
    Ok((next, changed))
}

fn coerce_effect_settings_for_support(
    settings: MainWindowEffectSettings,
    support: &MainWindowEffectsSupport,
) -> MainWindowEffectSettings {
    let material = if is_material_supported(settings.material, support) {
        settings.material
    } else if settings.material == MainWindowEffectMaterial::MicaAlt && support.supports_mica {
        MainWindowEffectMaterial::Mica
    } else if support.supports_acrylic {
        MainWindowEffectMaterial::Acrylic
    } else if support.supports_mica {
        MainWindowEffectMaterial::Mica
    } else if support.supports_mica_alt {
        MainWindowEffectMaterial::MicaAlt
    } else {
        MainWindowEffectMaterial::Acrylic
    };
    MainWindowEffectSettings {
        material,
        appearance: settings.appearance,
    }
}

fn is_effect_settings_supported(
    settings: MainWindowEffectSettings,
    support: &MainWindowEffectsSupport,
) -> bool {
    is_material_supported(settings.material, support)
}

fn is_material_supported(
    material: MainWindowEffectMaterial,
    support: &MainWindowEffectsSupport,
) -> bool {
    match material {
        MainWindowEffectMaterial::None => true,
        MainWindowEffectMaterial::Acrylic => support.supports_acrylic,
        MainWindowEffectMaterial::Mica => support.supports_mica,
        MainWindowEffectMaterial::MicaAlt => support.supports_mica_alt,
    }
}

fn effect_support_for_windows_build(build: Option<u32>) -> (bool, bool, bool) {
    let Some(build) = build else {
        return (false, false, false);
    };
    (
        build >= WINDOWS_ACRYLIC_MIN_BUILD,
        build >= WINDOWS_MICA_MIN_BUILD,
        build >= WINDOWS_MICA_ALT_MIN_BUILD,
    )
}

#[cfg(target_os = "windows")]
fn current_platform() -> &'static str {
    "windows"
}

#[cfg(not(target_os = "windows"))]
fn current_platform() -> &'static str {
    std::env::consts::OS
}

#[cfg(target_os = "windows")]
fn current_windows_build() -> Option<u32> {
    Some(windows_version::OsVersion::current().build)
}

#[cfg(not(target_os = "windows"))]
fn current_windows_build() -> Option<u32> {
    None
}

#[cfg(target_os = "windows")]
fn set_window_backdrop_dark_mode(window: &WebviewWindow, dark: bool) -> Result<(), String> {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};

    let enabled = if dark { 1i32 } else { 0i32 };
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &enabled as *const _ as _,
            std::mem::size_of_val(&enabled) as u32,
        );
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_window_backdrop_dark_mode(_window: &WebviewWindow, _dark: bool) -> Result<(), String> {
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
    // LaunchPad is foreground; Focused(false) and hide/windowed paths release it.
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
    // only runs when LaunchPad, not another app, is actually active.
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
    let _ = app.emit(OPEN_DESKTOP_EVENT, open_sequence);
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
        let _ = app.emit(TOGGLE_DESKTOP_EVENT, open_sequence);
        return;
    }

    let open_sequence = next_main_window_open_sequence();
    let _ = app.emit(OPEN_DESKTOP_EVENT, open_sequence);
    schedule_main_window_show(app, open_sequence, main_window_deferred_show_delay(app));
}

pub(crate) fn open_settings(app: &AppHandle) {
    open_main_window(app);
    let _ = app.emit("launchpad-open-settings", ());
}

pub(crate) fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text("show", "显示 LaunchPad")
        .text("settings", "设置")
        .separator()
        .text("quit", "退出")
        .build()?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("LaunchPad");

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn support(build: Option<u32>) -> MainWindowEffectsSupport {
        let (supports_acrylic, supports_mica, supports_mica_alt) =
            effect_support_for_windows_build(build);
        MainWindowEffectsSupport {
            platform: "windows",
            build,
            supports_acrylic,
            supports_mica,
            supports_mica_alt,
        }
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
    fn windows_effect_support_tracks_build_thresholds() {
        assert_eq!(
            effect_support_for_windows_build(None),
            (false, false, false)
        );
        assert_eq!(
            effect_support_for_windows_build(Some(WINDOWS_ACRYLIC_MIN_BUILD - 1)),
            (false, false, false)
        );
        assert_eq!(
            effect_support_for_windows_build(Some(WINDOWS_ACRYLIC_MIN_BUILD)),
            (true, false, false)
        );
        assert_eq!(
            effect_support_for_windows_build(Some(WINDOWS_MICA_MIN_BUILD - 1)),
            (true, false, false)
        );
        assert_eq!(
            effect_support_for_windows_build(Some(WINDOWS_MICA_MIN_BUILD)),
            (true, true, false)
        );
        assert_eq!(
            effect_support_for_windows_build(Some(WINDOWS_MICA_ALT_MIN_BUILD - 1)),
            (true, true, false)
        );
        assert_eq!(
            effect_support_for_windows_build(Some(WINDOWS_MICA_ALT_MIN_BUILD)),
            (true, true, true)
        );
    }

    #[test]
    fn requested_mica_alt_falls_back_to_mica_when_supported() {
        let requested = MainWindowEffectSettings {
            material: MainWindowEffectMaterial::MicaAlt,
            appearance: MainWindowEffectAppearance::Light,
        };
        let coerced =
            coerce_effect_settings_for_support(requested, &support(Some(WINDOWS_MICA_MIN_BUILD)));

        assert_eq!(coerced.material, MainWindowEffectMaterial::Mica);
        assert_eq!(coerced.appearance, MainWindowEffectAppearance::Light);
    }

    #[test]
    fn requested_mica_falls_back_to_acrylic_when_unsupported() {
        let requested = MainWindowEffectSettings {
            material: MainWindowEffectMaterial::Mica,
            appearance: MainWindowEffectAppearance::Light,
        };
        let coerced = coerce_effect_settings_for_support(
            requested,
            &support(Some(WINDOWS_ACRYLIC_MIN_BUILD)),
        );

        assert_eq!(coerced.material, MainWindowEffectMaterial::Acrylic);
        assert_eq!(coerced.appearance, MainWindowEffectAppearance::Light);
    }

    #[test]
    fn requested_none_material_stays_none_without_native_support() {
        let requested = MainWindowEffectSettings {
            material: MainWindowEffectMaterial::None,
            appearance: MainWindowEffectAppearance::Light,
        };
        let coerced = coerce_effect_settings_for_support(requested, &support(None));

        assert_eq!(coerced.material, MainWindowEffectMaterial::None);
        assert_eq!(coerced.appearance, MainWindowEffectAppearance::Light);
    }
}
