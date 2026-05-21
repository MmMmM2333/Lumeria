use std::process::Command;
#[cfg(target_os = "windows")]
pub(crate) fn launch_path(path: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", path])
        .spawn()
        .map_err(|error| format!("Failed to launch {path}: {error}"))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn launch_path(_path: &str) -> Result<(), String> {
    Err("Launching apps is only implemented on Windows".to_string())
}
