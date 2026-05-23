use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::models::AppCatalogItem;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LayoutRecovery {
    reason: String,
    backup_path: String,
}

pub(crate) struct LoadLayoutResult {
    pub(crate) layout: Option<Value>,
    pub(crate) recovery: Option<LayoutRecovery>,
}

pub(crate) fn load_layout(app: &AppHandle) -> Result<LoadLayoutResult, String> {
    let path = layout_path(app)?;
    load_layout_from_path(&path)
}

pub(crate) fn save_layout(app: &AppHandle, layout: &Value) -> Result<(), String> {
    let path = layout_path(app)?;
    save_layout_to_path(&path, layout)
}

pub(crate) fn find_saved_layout_app(
    app: &AppHandle,
    app_id: &str,
) -> Result<Option<AppCatalogItem>, String> {
    let path = layout_path(app)?;
    let result = load_layout_from_path(&path)?;
    Ok(result
        .layout
        .as_ref()
        .and_then(|layout| find_app_in_layout_value(layout, app_id)))
}

fn load_layout_from_path(path: &Path) -> Result<LoadLayoutResult, String> {
    if !path.exists() {
        return Ok(LoadLayoutResult {
            layout: None,
            recovery: None,
        });
    }

    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read layout {}: {error}", path.display()))?;
    let layout: Value = match serde_json::from_str(&contents) {
        Ok(layout) => layout,
        Err(error) => {
            return recover_invalid_layout_file(
                path,
                format!("Failed to parse layout {}: {error}", path.display()),
            )
        }
    };

    if let Err(error) = validate_layout_value(&layout) {
        return recover_invalid_layout_file(
            path,
            format!("Invalid layout {}: {error}", path.display()),
        );
    }

    Ok(LoadLayoutResult {
        layout: Some(layout),
        recovery: None,
    })
}

fn save_layout_to_path(path: &Path, layout: &Value) -> Result<(), String> {
    validate_layout_value(layout)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create layout directory {}: {error}",
                parent.display()
            )
        })?;
    }

    let contents = serde_json::to_string_pretty(&layout)
        .map_err(|error| format!("Failed to serialize layout: {error}"))?;
    write_file_atomic(path, &contents)
}

fn recover_invalid_layout_file(path: &Path, reason: String) -> Result<LoadLayoutResult, String> {
    let backup_path = backup_invalid_layout_file(path)?;
    eprintln!(
        "{reason}; moved invalid layout to {}",
        backup_path.display()
    );
    Ok(LoadLayoutResult {
        layout: None,
        recovery: Some(LayoutRecovery {
            reason,
            backup_path: backup_path.to_string_lossy().to_string(),
        }),
    })
}

fn backup_invalid_layout_file(path: &Path) -> Result<PathBuf, String> {
    let backup_path = invalid_layout_backup_path(path);
    fs::rename(path, &backup_path).map_err(|error| {
        format!(
            "Failed to back up invalid layout {} to {}: {error}",
            path.display(),
            backup_path.display()
        )
    })?;
    Ok(backup_path)
}

fn invalid_layout_backup_path(path: &Path) -> PathBuf {
    let timestamp = timestamp_nanos();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("layout.json");
    path.with_file_name(format!("{file_name}.corrupt.{timestamp}"))
}

fn validate_layout_value(layout: &Value) -> Result<(), String> {
    let object = layout
        .as_object()
        .ok_or_else(|| "layout must be an object".to_string())?;

    if object.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("layout version must be 1".to_string());
    }

    let pages = object
        .get("pages")
        .and_then(Value::as_array)
        .ok_or_else(|| "layout pages must be an array".to_string())?;
    for (page_index, page) in pages.iter().enumerate() {
        let items = page
            .as_array()
            .ok_or_else(|| format!("layout pages[{page_index}] must be an array"))?;
        for (item_index, item) in items.iter().enumerate() {
            validate_layout_item(item, &format!("pages[{page_index}][{item_index}]"))?;
        }
    }

    validate_layout_settings(
        object
            .get("settings")
            .ok_or_else(|| "layout settings are required".to_string())?,
    )
}

fn validate_layout_settings(settings: &Value) -> Result<(), String> {
    let object = settings
        .as_object()
        .ok_or_else(|| "layout settings must be an object".to_string())?;

    for key in [
        "gridRows",
        "gridCols",
        "folderRows",
        "folderCols",
        "iconSize",
    ] {
        let value = object
            .get(key)
            .and_then(Value::as_u64)
            .ok_or_else(|| format!("layout settings.{key} must be a positive integer"))?;
        if value == 0 {
            return Err(format!("layout settings.{key} must be a positive integer"));
        }
    }

    object
        .get("textless")
        .and_then(Value::as_bool)
        .ok_or_else(|| "layout settings.textless must be a boolean".to_string())?;

    let hidden_app_ids = object
        .get("hiddenAppIds")
        .and_then(Value::as_array)
        .ok_or_else(|| "layout settings.hiddenAppIds must be an array".to_string())?;
    if hidden_app_ids.iter().any(|value| !value.is_string()) {
        return Err("layout settings.hiddenAppIds must contain strings".to_string());
    }

    Ok(())
}

fn validate_layout_item(item: &Value, label: &str) -> Result<(), String> {
    let object = item
        .as_object()
        .ok_or_else(|| format!("layout item {label} must be an object"))?;
    let item_type = object
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("layout item {label}.type must be a string"))?;

    require_string_field(object, "id", label)?;
    require_string_field(object, "name", label)?;

    match item_type {
        "app" => validate_layout_app_item(object, label),
        "folder" => validate_layout_folder_item(object, label),
        _ => Err(format!("layout item {label}.type must be app or folder")),
    }
}

fn validate_layout_app_item(
    object: &serde_json::Map<String, Value>,
    label: &str,
) -> Result<(), String> {
    for key in [
        "emoji",
        "iconPath",
        "iconDataUrl",
        "customIconDataUrl",
        "launchArgs",
    ] {
        validate_optional_string_field(object, key, label)?;
    }

    if let Some(launch_target) = object.get("launchTarget") {
        validate_launch_target(launch_target, &format!("{label}.launchTarget"))?;
    }

    Ok(())
}

fn validate_launch_target(launch_target: &Value, label: &str) -> Result<(), String> {
    let object = launch_target
        .as_object()
        .ok_or_else(|| format!("layout item {label} must be an object"))?;
    require_string_field(object, "kind", label)?;
    validate_optional_string_field(object, "path", label)?;
    validate_optional_string_field(object, "appUserModelId", label)
}

fn validate_layout_folder_item(
    object: &serde_json::Map<String, Value>,
    label: &str,
) -> Result<(), String> {
    if let Some(child_pages) = object.get("childPages") {
        let pages = child_pages
            .as_array()
            .ok_or_else(|| format!("layout item {label}.childPages must be an array"))?;
        for (page_index, page) in pages.iter().enumerate() {
            let children = page.as_array().ok_or_else(|| {
                format!("layout item {label}.childPages[{page_index}] must be an array")
            })?;
            for (child_index, child) in children.iter().enumerate() {
                validate_layout_item(
                    child,
                    &format!("{label}.childPages[{page_index}][{child_index}]"),
                )?;
            }
        }
    }

    if let Some(children) = object.get("children") {
        let children = children
            .as_array()
            .ok_or_else(|| format!("layout item {label}.children must be an array"))?;
        for (child_index, child) in children.iter().enumerate() {
            validate_layout_item(child, &format!("{label}.children[{child_index}]"))?;
        }
    }

    Ok(())
}

fn require_string_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<(), String> {
    match object.get(key).and_then(Value::as_str) {
        Some(value) if !value.is_empty() => Ok(()),
        _ => Err(format!("layout item {label}.{key} must be a non-empty string")),
    }
}

fn validate_optional_string_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<(), String> {
    if object.get(key).is_some_and(|value| !value.is_string()) {
        return Err(format!("layout item {label}.{key} must be a string"));
    }
    Ok(())
}

fn write_file_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let temp_path = temporary_layout_path(path);
    fs::write(&temp_path, contents).map_err(|error| {
        format!(
            "Failed to write temporary layout {}: {error}",
            temp_path.display()
        )
    })?;

    replace_file(&temp_path, path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        error
    })
}

fn temporary_layout_path(path: &Path) -> PathBuf {
    let timestamp = timestamp_nanos();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("layout.json");
    path.with_file_name(format!("{file_name}.{timestamp}.tmp"))
}

fn timestamp_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

#[cfg(target_os = "windows")]
fn replace_file(source: &Path, target: &Path) -> Result<(), String> {
    use windows::{
        core::HSTRING,
        Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        },
    };

    let target_display = target.display().to_string();
    let source = HSTRING::from(source.to_string_lossy().as_ref());
    let target = HSTRING::from(target.to_string_lossy().as_ref());
    unsafe {
        MoveFileExW(
            &source,
            &target,
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| format!("Failed to replace layout {target_display}: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn replace_file(source: &Path, target: &Path) -> Result<(), String> {
    fs::rename(source, target)
        .map_err(|error| format!("Failed to replace layout {}: {error}", target.display()))
}

fn find_app_in_layout_value(value: &Value, app_id: &str) -> Option<AppCatalogItem> {
    if value.get("type").and_then(Value::as_str) == Some("app")
        && value.get("id").and_then(Value::as_str) == Some(app_id)
        && value.get("launchTarget").is_some()
    {
        return serde_json::from_value(value.clone()).ok();
    }

    match value {
        Value::Array(items) => items
            .iter()
            .find_map(|item| find_app_in_layout_value(item, app_id)),
        Value::Object(map) => map
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "launchpad-{name}-{}",
            timestamp_nanos()
        ));
        fs::create_dir_all(&path).expect("create test directory");
        path
    }

    fn valid_layout() -> Value {
        json!({
            "version": 1,
            "pages": [
                [
                    {
                        "id": "app-a",
                        "type": "app",
                        "name": "App A",
                        "emoji": "A",
                        "launchTarget": {
                            "kind": "shortcut",
                            "path": "C:/Apps/App A.lnk"
                        }
                    },
                    {
                        "id": "folder-a",
                        "type": "folder",
                        "name": "Folder A",
                        "childPages": [
                            [
                                {
                                    "id": "app-b",
                                    "type": "app",
                                    "name": "App B",
                                    "launchTarget": {
                                        "kind": "url",
                                        "path": "https://example.com"
                                    }
                                }
                            ]
                        ],
                        "children": [
                            {
                                "id": "app-b",
                                "type": "app",
                                "name": "App B",
                                "launchTarget": {
                                    "kind": "url",
                                    "path": "https://example.com"
                                }
                            }
                        ]
                    }
                ]
            ],
            "settings": {
                "gridRows": 4,
                "gridCols": 6,
                "folderRows": 3,
                "folderCols": 4,
                "iconSize": 64,
                "textless": false,
                "hiddenAppIds": ["hidden-app"]
            }
        })
    }

    fn corrupt_backups(dir: &Path) -> Vec<PathBuf> {
        fs::read_dir(dir)
            .expect("read test directory")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|name| name.starts_with("layout.json.corrupt."))
            })
            .collect()
    }

    #[test]
    fn write_file_atomic_replaces_existing_contents() {
        let dir = test_dir("atomic-write");
        let path = dir.join("layout.json");
        fs::write(&path, "old").expect("write initial file");

        write_file_atomic(&path, "new").expect("write atomically");

        assert_eq!(fs::read_to_string(&path).expect("read replaced file"), "new");
        let temp_files: Vec<_> = fs::read_dir(&dir)
            .expect("read test directory")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| name.ends_with(".tmp"))
            })
            .collect();
        assert!(temp_files.is_empty(), "temporary file should be moved away");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_layout_schema() {
        let dir = test_dir("invalid-save");
        let path = dir.join("layout.json");
        let invalid = json!({
            "version": 1,
            "pages": [],
            "settings": {
                "gridRows": 4,
                "gridCols": 6,
                "folderRows": 3,
                "folderCols": 4,
                "iconSize": 64,
                "textless": false,
                "hiddenAppIds": [42]
            }
        });

        let error = save_layout_to_path(&path, &invalid).expect_err("invalid layout should fail");

        assert!(error.contains("hiddenAppIds"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn load_layout_from_path_returns_valid_layout() {
        let dir = test_dir("valid-load");
        let path = dir.join("layout.json");
        save_layout_to_path(&path, &valid_layout()).expect("save valid layout");

        let loaded = load_layout_from_path(&path)
            .expect("load valid layout")
            .layout
            .expect("layout should exist");

        assert_eq!(loaded["version"], 1);
        assert!(path.exists(), "valid layout should remain in place");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn load_layout_from_path_backs_up_malformed_json() {
        let dir = test_dir("malformed-load");
        let path = dir.join("layout.json");
        fs::write(&path, "{not-json").expect("write malformed layout");

        let result = load_layout_from_path(&path).expect("malformed layout should recover");
        let backups = corrupt_backups(&dir);

        assert!(result.layout.is_none());
        assert!(result.recovery.is_some());
        assert!(!path.exists(), "malformed layout should be moved away");
        assert_eq!(backups.len(), 1, "malformed layout should be backed up");
        assert_eq!(
            fs::read_to_string(&backups[0]).expect("read backup"),
            "{not-json"
        );
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn load_layout_from_path_backs_up_invalid_schema() {
        let dir = test_dir("invalid-load");
        let path = dir.join("layout.json");
        fs::write(
            &path,
            serde_json::to_string(&json!({
                "version": 2,
                "pages": [],
                "settings": {
                    "gridRows": 4,
                    "gridCols": 6,
                    "folderRows": 3,
                    "folderCols": 4,
                    "iconSize": 64,
                    "textless": false,
                    "hiddenAppIds": []
                }
            }))
            .expect("serialize invalid layout"),
        )
        .expect("write invalid layout");

        let result = load_layout_from_path(&path).expect("invalid layout should recover");
        let backups = corrupt_backups(&dir);

        assert!(result.layout.is_none());
        assert!(result.recovery.is_some());
        assert!(!path.exists(), "invalid layout should be moved away");
        assert_eq!(backups.len(), 1, "invalid layout should be backed up");
        fs::remove_dir_all(dir).expect("remove test directory");
    }
}
