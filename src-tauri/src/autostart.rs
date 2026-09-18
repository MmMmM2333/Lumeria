use std::ffi::OsString;

#[cfg(target_os = "windows")]
fn current_autostart_command() -> Result<OsString, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("Failed to resolve the current Lumeria executable: {error}"))?;
    Ok(lumeria_core::autostart::autostart_run_command(&executable))
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub(crate) fn get_autostart_status() -> Result<bool, String> {
    let expected_command = current_autostart_command()?;
    lumeria_core::autostart::get_autostart_status(&expected_command)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub(crate) fn set_autostart_enabled(enabled: bool) -> Result<bool, String> {
    let expected_command = current_autostart_command()?;
    lumeria_core::autostart::set_autostart_command_enabled(&expected_command, enabled)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub(crate) fn get_autostart_status() -> Result<bool, String> {
    Err("Lumeria autostart is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub(crate) fn set_autostart_enabled(_enabled: bool) -> Result<bool, String> {
    Err("Lumeria autostart is only supported on Windows".to_string())
}
