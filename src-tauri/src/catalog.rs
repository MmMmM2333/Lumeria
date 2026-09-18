use std::path::PathBuf;

use tauri::{AppHandle, Manager};

pub(crate) fn icon_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    lumeria_core::catalog::icon_cache_dir(&data_dir)
}
