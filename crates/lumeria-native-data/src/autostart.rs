#[cfg(target_os = "windows")]
use lumeria_core::autostart::{
    autostart_run_command, get_autostart_status, set_autostart_command_enabled,
};

use crate::native_paths::{installed_launcher, INSTALL_REGISTRY_KEY};

pub(crate) fn native_autostart_available() -> bool {
    if std::env::var_os("LUMERIA_NATIVE_DATA_DIR").is_some() {
        return false;
    }
    #[cfg(target_os = "windows")]
    {
        let Some(launcher) = std::env::current_exe()
            .ok()
            .and_then(|path| installed_launcher(&path).ok())
        else {
            return false;
        };
        let registered = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey(INSTALL_REGISTRY_KEY)
            .and_then(|key| key.get_value::<String, _>("InstallLocation"));
        registered
            .ok()
            .and_then(|path| std::fs::canonicalize(path).ok())
            .as_deref()
            == launcher.parent()
    }
    #[cfg(not(target_os = "windows"))]
    false
}

#[cfg(target_os = "windows")]
pub(crate) fn native_autostart(enabled: Option<bool>) -> Result<bool, String> {
    if !native_autostart_available() {
        return Err(
            "Autostart requires an installed native application outside an isolated session"
                .to_string(),
        );
    }
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let command = autostart_run_command(&installed_launcher(&executable)?);
    match enabled {
        Some(value) => set_autostart_command_enabled(&command, value),
        None => get_autostart_status(&command),
    }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn native_autostart(_enabled: Option<bool>) -> Result<bool, String> {
    Err("Lumeria autostart is only supported on Windows".to_string())
}
