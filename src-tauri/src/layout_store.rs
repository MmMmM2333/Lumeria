use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Manager};

pub(crate) use lumeria_core::layout_store::StartupLayoutPreferences;

pub(crate) fn load_layout(app: &AppHandle) -> Result<Option<Value>, String> {
    lumeria_core::layout_store::load_layout_from_path(&layout_path(app)?)
}

pub(crate) fn save_layout(app: &AppHandle, layout: &Value) -> Result<(), String> {
    lumeria_core::layout_store::save_layout_to_path(&layout_path(app)?, layout)
}

pub(crate) fn load_startup_layout_preferences(
    app: &AppHandle,
) -> Result<Option<StartupLayoutPreferences>, String> {
    load_layout(app)?
        .as_ref()
        .map(lumeria_core::layout_store::startup_layout_preferences_from_value)
        .transpose()
}

pub(crate) fn layout_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    Ok(data_dir.join("layout.json"))
}
