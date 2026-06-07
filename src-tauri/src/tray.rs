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
const WINDOWS_ACRYLIC_MIN_BUILD: u32 = 17763;
const WINDOWS_MICA_MIN_BUILD: u32 = 22000;
const WINDOWS_MICA_ALT_MIN_BUILD: u32 = 22621;
static MAIN_WINDOW_EFFECT_DISABLE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_OPEN_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MAIN_WINDOW_EFFECT_SETTINGS: Mutex<MainWindowEffectSettings> =
    Mutex::new(MainWindowEffectSettings::DEFAULT);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MainWindowEffectMaterial {
    Acrylic,
    Mica,
    MicaAlt,
}

impl MainWindowEffectMaterial {
    fn from_str(value: &str) -> Option<Self> {
        match value {
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

    fn effect(self) -> Effect {
        match (self.material, self.appearance) {
            (MainWindowEffectMaterial::Acrylic, _) => Effect::Acrylic,
            (MainWindowEffectMaterial::Mica, MainWindowEffectAppearance::Dark) => Effect::MicaDark,
            (MainWindowEffectMaterial::Mica, MainWindowEffectAppearance::Light) => {
                Effect::MicaLight
            }
            (MainWindowEffectMaterial::MicaAlt, MainWindowEffectAppearance::Dark) => {
                Effect::TabbedDark
            }
            (MainWindowEffectMaterial::MicaAlt, MainWindowEffectAppearance::Light) => {
                Effect::TabbedLight
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MainWindowEffectsSupport {
    platform: &'static str,
    build: Option<u32>,
    supports_acrylic: bool,
    supports_mica: bool,
    supports_mica_alt: bool,
}

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
        set_window_effects_enabled_with_config(&window, enabled, settings, settings_changed)?;
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
        let effects = if settings.material == MainWindowEffectMaterial::Acrylic {
            EffectsBuilder::new()
                .effect(settings.effect())
                .color(settings.acrylic_color())
                .build()
        } else {
            EffectsBuilder::new().effect(settings.effect()).build()
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
}
