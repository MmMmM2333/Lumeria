use tauri::{image::Image, AppHandle, Manager};

use crate::tray::set_tray_icon;

const MAIN_WINDOW_LABEL: &str = "main";

const LIGHT_WINDOW_ICON: Image<'static> =
    tauri::include_image!("./icons/launchpad/light/256x256.png");
const LIGHT_TRAY_ICON: Image<'static> = tauri::include_image!("./icons/launchpad/light/32x32.png");
const DARK_WINDOW_ICON: Image<'static> =
    tauri::include_image!("./icons/launchpad/dark/256x256.png");
const DARK_TRAY_ICON: Image<'static> = tauri::include_image!("./icons/launchpad/dark/32x32.png");
const PASTEL_LIGHT_WINDOW_ICON: Image<'static> =
    tauri::include_image!("./icons/launchpad/pastelLight/256x256.png");
const PASTEL_LIGHT_TRAY_ICON: Image<'static> =
    tauri::include_image!("./icons/launchpad/pastelLight/32x32.png");
const PASTEL_DARK_WINDOW_ICON: Image<'static> =
    tauri::include_image!("./icons/launchpad/pastelDark/256x256.png");
const PASTEL_DARK_TRAY_ICON: Image<'static> =
    tauri::include_image!("./icons/launchpad/pastelDark/32x32.png");

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) enum LaunchpadIconVariant {
    #[default]
    Light,
    Dark,
    PastelLight,
    PastelDark,
}

impl LaunchpadIconVariant {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "light" => Some(Self::Light),
            "dark" => Some(Self::Dark),
            "pastelLight" => Some(Self::PastelLight),
            "pastelDark" => Some(Self::PastelDark),
            _ => None,
        }
    }

    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
            Self::PastelLight => "pastelLight",
            Self::PastelDark => "pastelDark",
        }
    }

    pub(crate) const fn window_icon(self) -> Image<'static> {
        match self {
            Self::Light => LIGHT_WINDOW_ICON,
            Self::Dark => DARK_WINDOW_ICON,
            Self::PastelLight => PASTEL_LIGHT_WINDOW_ICON,
            Self::PastelDark => PASTEL_DARK_WINDOW_ICON,
        }
    }

    pub(crate) const fn tray_icon(self) -> Image<'static> {
        match self {
            Self::Light => LIGHT_TRAY_ICON,
            Self::Dark => DARK_TRAY_ICON,
            Self::PastelLight => PASTEL_LIGHT_TRAY_ICON,
            Self::PastelDark => PASTEL_DARK_TRAY_ICON,
        }
    }
}

pub(crate) fn set_main_window_icon(
    app: &AppHandle,
    variant: LaunchpadIconVariant,
) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Lumeria main window is unavailable".to_string())?;
    window
        .set_icon(variant.window_icon())
        .map_err(|error| format!("Failed to update Lumeria window icon: {error}"))
}

pub(crate) fn apply_runtime_icon(
    app: &AppHandle,
    next: LaunchpadIconVariant,
    previous: LaunchpadIconVariant,
) -> Result<(), String> {
    set_main_window_icon(app, next)?;
    if let Err(tray_error) = set_tray_icon(app, next.tray_icon()) {
        return match set_main_window_icon(app, previous) {
            Ok(()) => Err(tray_error),
            Err(rollback_error) => Err(format!(
                "{tray_error}; additionally failed to restore the previous window icon: {rollback_error}"
            )),
        };
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::LaunchpadIconVariant;

    #[test]
    fn launchpad_icon_variants_use_the_persisted_frontend_contract() {
        for value in ["light", "dark", "pastelLight", "pastelDark"] {
            let variant = LaunchpadIconVariant::parse(value).expect("documented icon variant");
            assert_eq!(variant.as_str(), value);
        }
        assert!(LaunchpadIconVariant::parse("system").is_none());
    }
}
