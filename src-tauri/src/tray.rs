use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use tauri::{
    menu::MenuBuilder,
    tray::TrayIconBuilder,
    window::{Color, Effect, EffectsBuilder},
    AppHandle, Emitter, Manager, WebviewWindow,
};

pub(crate) const OPEN_DESKTOP_EVENT: &str = "launchpad-open-desktop";
pub(crate) const TOGGLE_DESKTOP_EVENT: &str = "launchpad-toggle-desktop";
pub(crate) const CLOSE_DESKTOP_EVENT: &str = "launchpad-close-desktop";
const MAIN_WINDOW_EFFECT_COLOR: Color = Color(0x10, 0x14, 0x1f, 0xcc);
const MAIN_WINDOW_EFFECT_REAPPLY_DELAYS_MS: [u64; 2] = [80, 180];
static MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_OPEN_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub(crate) fn show_main_window(app: &AppHandle) -> u64 {
    let open_sequence = MAIN_WINDOW_OPEN_SEQUENCE.fetch_add(1, Ordering::Relaxed) + 1;
    let _ = disable_main_window_transitions(app);
    if let Some(window) = app.get_webview_window("main") {
        if !window.is_fullscreen().unwrap_or(false) {
            let _ = window.set_fullscreen(true);
        }
        if !window.is_visible().unwrap_or(false) {
            let _ = window.show();
        }
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        let _ = window.set_focus();
        let _ = activate_window(&window);
        let disable_sequence = MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.load(Ordering::Relaxed);
        let _ = set_window_effects_enabled(&window, true);
        schedule_window_effect_reapply(window, open_sequence, disable_sequence);
    }
    open_sequence
}

pub(crate) fn set_main_window_fullscreen(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_fullscreen(true)
            .map_err(|error| error.to_string())?;
    }
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
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};

    let disabled = 1i32;
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
) -> Result<(), String> {
    if !enabled {
        if open_sequence
            .is_some_and(|sequence| sequence != MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed))
        {
            return Ok(());
        }
        MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    }

    if let Some(window) = app.get_webview_window("main") {
        set_window_effects_enabled(&window, enabled)?;
    }
    Ok(())
}

fn set_window_effects_enabled(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    if enabled {
        let effects = EffectsBuilder::new()
            .effect(Effect::Acrylic)
            .color(MAIN_WINDOW_EFFECT_COLOR)
            .build();
        window
            .set_effects(effects)
            .map_err(|error| error.to_string())?;
    } else {
        window
            .set_effects(None)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn refresh_main_window_effects(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if !window.is_visible().unwrap_or(false) {
            return;
        }
        let open_sequence = MAIN_WINDOW_OPEN_SEQUENCE.load(Ordering::Relaxed);
        let disable_sequence = MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE.load(Ordering::Relaxed);
        let _ = set_window_effects_enabled(&window, true);
        schedule_window_effect_reapply(window, open_sequence, disable_sequence);
    }
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
                let _ = set_window_effects_enabled(&window, true);
            }
        });
    }
}

pub(crate) fn open_main_window(app: &AppHandle) {
    let open_sequence = show_main_window(app);
    let _ = app.emit(OPEN_DESKTOP_EVENT, open_sequence);
}

pub(crate) fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub(crate) fn trigger_main_window_shortcut(app: &AppHandle) {
    let should_hide = app
        .get_webview_window("main")
        .map(|window| {
            let is_visible = window.is_visible().unwrap_or(false);
            let is_minimized = window.is_minimized().unwrap_or(false);
            let is_focused = window.is_focused().unwrap_or(false);
            is_visible && !is_minimized && is_focused
        })
        .unwrap_or(false);

    let open_sequence = show_main_window(app);
    let _ = app.emit(
        if should_hide {
            TOGGLE_DESKTOP_EVENT
        } else {
            OPEN_DESKTOP_EVENT
        },
        open_sequence,
    );
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
