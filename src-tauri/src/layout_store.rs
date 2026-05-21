use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

use crate::models::AppCatalogItem;
pub(crate) fn find_saved_layout_app(
    app: &AppHandle,
    app_id: &str,
) -> Result<Option<AppCatalogItem>, String> {
    let path = layout_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read layout {}: {error}", path.display()))?;
    let layout: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|error| format!("Failed to parse layout {}: {error}", path.display()))?;
    Ok(find_app_in_layout_value(&layout, app_id))
}

fn find_app_in_layout_value(value: &serde_json::Value, app_id: &str) -> Option<AppCatalogItem> {
    if value.get("type").and_then(serde_json::Value::as_str) == Some("app")
        && value.get("id").and_then(serde_json::Value::as_str) == Some(app_id)
        && value.get("launchTarget").is_some()
    {
        return serde_json::from_value(value.clone()).ok();
    }

    match value {
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|item| find_app_in_layout_value(item, app_id)),
        serde_json::Value::Object(map) => map
            .values()
            .find_map(|item| find_app_in_layout_value(item, app_id)),
        _ => None,
    }
}

pub(crate) fn layout_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    Ok(data_dir.join("layout.json"))
}
