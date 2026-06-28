use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    window::{Color, Effect, EffectsBuilder},
    WebviewWindow,
};

use crate::dwm::set_window_backdrop_dark_mode;
use crate::native_error::NativeError;

const MAIN_WINDOW_ACRYLIC_DARK_COLOR: Color = Color(0x10, 0x14, 0x1f, 0xcc);
const MAIN_WINDOW_ACRYLIC_LIGHT_COLOR: Color = Color(0xf3, 0xf6, 0xfb, 0xcc);
const WINDOWS_ACRYLIC_MIN_BUILD: u32 = 17763;
const WINDOWS_MICA_MIN_BUILD: u32 = 22000;
const WINDOWS_MICA_ALT_MIN_BUILD: u32 = 22621;
static MAIN_WINDOW_EFFECT_SETTINGS: Mutex<MainWindowEffectSettings> =
    Mutex::new(MainWindowEffectSettings::DEFAULT);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum MainWindowEffectMaterial {
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
pub(crate) enum MainWindowEffectAppearance {
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
pub(crate) struct MainWindowEffectSettings {
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MainWindowEffectsSupport {
    platform: &'static str,
    build: Option<u32>,
    supports_acrylic: bool,
    supports_mica: bool,
    supports_mica_alt: bool,
}

pub(crate) fn set_window_effects_enabled(
    window: &WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    let settings = current_main_window_effect_settings()?;
    set_window_effects_enabled_with_config(window, enabled, settings, false)
}

pub(crate) fn set_window_effects_enabled_with_config(
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
                .map_err(|source| NativeError::Tauri {
                    context: "WebviewWindow::set_effects(clear unsupported material)",
                    source,
                })?;
            return Ok(());
        }
        if !is_effect_settings_supported(settings, &support) {
            window
                .set_effects(None)
                .map_err(|source| NativeError::Tauri {
                    context: "WebviewWindow::set_effects(clear unsupported build)",
                    source,
                })?;
            return Ok(());
        }

        if clear_first {
            window
                .set_effects(None)
                .map_err(|source| NativeError::Tauri {
                    context: "WebviewWindow::set_effects(clear before reapply)",
                    source,
                })?;
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
            .map_err(|source| NativeError::Tauri {
                context: "WebviewWindow::set_effects(apply native effect)",
                source,
            })?;
        set_window_backdrop_dark_mode(window, settings.is_dark())?;
    } else {
        window
            .set_effects(None)
            .map_err(|source| NativeError::Tauri {
                context: "WebviewWindow::set_effects(disable native effect)",
                source,
            })?;
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

pub(crate) fn update_main_window_effect_settings(
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
