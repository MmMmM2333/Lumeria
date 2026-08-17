use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::i18n::validate_locale_preference;
use crate::launchpad_icon::LaunchpadIconVariant;
use crate::models::LaunchTarget;

const MAX_LAYOUT_LOOKUP_DEPTH: usize = 32;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedManualApp {
    pub(crate) name: String,
    pub(crate) launch_target: LaunchTarget,
    #[serde(default)]
    pub(crate) launch_args: Option<String>,
}

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

pub(crate) fn read_locale_preference(app: &AppHandle) -> Result<Option<String>, String> {
    let path = layout_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read layout {}: {error}", path.display()))?;
    let layout: Value = serde_json::from_str(&contents)
        .map_err(|error| format!("Failed to parse layout {}: {error}", path.display()))?;
    let settings = layout
        .as_object()
        .and_then(|object| object.get("settings"))
        .and_then(Value::as_object)
        .ok_or_else(|| "layout settings must be an object".to_string())?;
    let Some(preference) = settings.get("localePreference") else {
        return Ok(None);
    };
    let preference = preference
        .as_str()
        .ok_or_else(|| "layout settings.localePreference must be a non-empty string".to_string())?;
    validate_locale_preference(preference).map(Some)
}

pub(crate) fn read_launchpad_icon_variant(
    app: &AppHandle,
) -> Result<Option<LaunchpadIconVariant>, String> {
    let path = layout_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read layout {}: {error}", path.display()))?;
    let layout: Value = serde_json::from_str(&contents)
        .map_err(|error| format!("Failed to parse layout {}: {error}", path.display()))?;
    let settings = layout
        .as_object()
        .and_then(|object| object.get("settings"))
        .and_then(Value::as_object)
        .ok_or_else(|| "layout settings must be an object".to_string())?;
    let Some(value) = settings.get("launchpadIconVariant") else {
        return Ok(None);
    };
    value
        .as_str()
        .and_then(LaunchpadIconVariant::parse)
        .map(Some)
        .ok_or_else(|| {
            "layout settings.launchpadIconVariant must be light, dark, pastelLight, or pastelDark"
                .to_string()
        })
}

pub(crate) fn find_layout_manual_app(layout: &Value, app_id: &str) -> Option<SavedManualApp> {
    find_manual_app_in_layout_value(layout, app_id, 0)
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
    log::warn!(
        target: "layout_store",
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

    if object.get("version").and_then(Value::as_u64) != Some(2) {
        return Err("layout version must be 2".to_string());
    }

    let pages = object
        .get("pages")
        .and_then(Value::as_array)
        .ok_or_else(|| "layout pages must be an array".to_string())?;
    let mut item_ids = HashSet::new();
    for (page_index, page) in pages.iter().enumerate() {
        let items = page
            .as_array()
            .ok_or_else(|| format!("layout pages[{page_index}] must be an array"))?;
        for (item_index, item) in items.iter().enumerate() {
            let label = format!("pages[{page_index}][{item_index}]");
            validate_layout_item(item, &label)?;
            register_layout_item_ids(item, &label, &mut item_ids)?;
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

    if let Some(value) = object.get("folderIconSize") {
        let size = value.as_u64().ok_or_else(|| {
            "layout settings.folderIconSize must be a positive integer".to_string()
        })?;
        if size == 0 {
            return Err("layout settings.folderIconSize must be a positive integer".to_string());
        }
    }

    if let Some(value) = object.get("folderIconSizeMode") {
        match value.as_str() {
            Some("global" | "custom") => {}
            _ => {
                return Err(
                    "layout settings.folderIconSizeMode must be global or custom".to_string(),
                );
            }
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

    validate_scan_roots(
        object
            .get("scanRoots")
            .ok_or_else(|| "layout settings.scanRoots must be an array".to_string())?,
    )?;
    if let Some(value) = object.get("scanKeywordAllowlist") {
        validate_string_array(value, "layout settings.scanKeywordAllowlist")?;
    }
    validate_string_array(
        object
            .get("scanKeywordBlacklist")
            .ok_or_else(|| "layout settings.scanKeywordBlacklist must be an array".to_string())?,
        "layout settings.scanKeywordBlacklist",
    )?;
    validate_scan_app_blacklist(
        object
            .get("scanAppBlacklist")
            .ok_or_else(|| "layout settings.scanAppBlacklist must be an array".to_string())?,
    )?;
    object
        .get("showMissingLaunchTargetBadge")
        .and_then(Value::as_bool)
        .ok_or_else(|| {
            "layout settings.showMissingLaunchTargetBadge must be a boolean".to_string()
        })?;
    if object
        .get("showCustomTitlebar")
        .is_some_and(|value| !value.is_boolean())
    {
        return Err("layout settings.showCustomTitlebar must be a boolean".to_string());
    }
    if object
        .get("fullscreenOverscanEnabled")
        .is_some_and(|value| !value.is_boolean())
    {
        return Err("layout settings.fullscreenOverscanEnabled must be a boolean".to_string());
    }
    if let Some(value) = object.get("windowEffectMaterial") {
        match value.as_str() {
            Some("none" | "acrylic" | "mica" | "micaAlt" | "mica-alt") => {}
            _ => {
                return Err(
                    "layout settings.windowEffectMaterial must be none, acrylic, mica, or micaAlt"
                        .to_string(),
                );
            }
        }
    }
    if let Some(value) = object.get("windowEffectAppearance") {
        match value.as_str() {
            Some("system" | "dark" | "light") => {}
            _ => {
                return Err(
                    "layout settings.windowEffectAppearance must be system, dark, or light"
                        .to_string(),
                );
            }
        }
    }
    if let Some(value) = object.get("settingsThemePreference") {
        match value.as_str() {
            Some("system" | "dark" | "light") => {}
            _ => {
                return Err(
                    "layout settings.settingsThemePreference must be system, dark, or light"
                        .to_string(),
                );
            }
        }
    }
    if let Some(value) = object.get("launchpadIconVariant") {
        if value
            .as_str()
            .and_then(LaunchpadIconVariant::parse)
            .is_none()
        {
            return Err(
                "layout settings.launchpadIconVariant must be light, dark, pastelLight, or pastelDark"
                    .to_string(),
            );
        }
    }
    let main_window_shortcut = object
        .get("mainWindowShortcut")
        .ok_or_else(|| "layout settings.mainWindowShortcut is required".to_string())?;
    if !main_window_shortcut.is_null() {
        let shortcut = main_window_shortcut.as_str().ok_or_else(|| {
            "layout settings.mainWindowShortcut must be a non-empty string or null".to_string()
        })?;
        if shortcut.trim().is_empty() {
            return Err(
                "layout settings.mainWindowShortcut must be a non-empty string or null".to_string(),
            );
        }
    }

    if let Some(value) = object.get("localePreference") {
        let preference = value.as_str().ok_or_else(|| {
            "layout settings.localePreference must be a non-empty string".to_string()
        })?;
        let trimmed = preference.trim();
        if trimmed.is_empty() || trimmed.len() > 64 {
            return Err(
                "layout settings.localePreference must be a non-empty string up to 64 bytes"
                    .to_string(),
            );
        }
    }

    Ok(())
}

fn validate_scan_roots(value: &Value) -> Result<(), String> {
    let roots = value
        .as_array()
        .ok_or_else(|| "layout settings.scanRoots must be an array".to_string())?;
    for (index, root) in roots.iter().enumerate() {
        let label = format!("layout settings.scanRoots[{index}]");
        let object = root
            .as_object()
            .ok_or_else(|| format!("{label} must be an object"))?;
        require_non_empty_string_field(object, "id", &label)?;
        let root_type = require_non_empty_string_field(object, "type", &label)?;
        if !matches!(
            root_type.as_str(),
            "startMenuUser" | "startMenuSystem" | "customDirectory" | "windowsAppCatalog"
        ) {
            return Err(format!(
                "{label}.type must be startMenuUser, startMenuSystem, customDirectory, or windowsAppCatalog"
            ));
        }
        require_non_empty_string_field(object, "label", &label)?;
        require_non_empty_string_field(object, "path", &label)?;
        require_bool_field(object, "enabled", &label)?;
        require_bool_field(object, "removable", &label)?;
        validate_optional_object_string_field(object, "lastScannedAt", &label)?;
        validate_optional_positive_integer_field(object, "maxDepth", &label)?;
        validate_optional_positive_integer_field(object, "maxEntries", &label)?;
    }
    Ok(())
}

fn validate_scan_app_blacklist(value: &Value) -> Result<(), String> {
    let items = value
        .as_array()
        .ok_or_else(|| "layout settings.scanAppBlacklist must be an array".to_string())?;
    for (index, item) in items.iter().enumerate() {
        let label = format!("layout settings.scanAppBlacklist[{index}]");
        let object = item
            .as_object()
            .ok_or_else(|| format!("{label} must be an object"))?;
        require_non_empty_string_field(object, "catalogId", &label)?;
        validate_optional_object_string_field(object, "name", &label)?;
        validate_optional_object_string_field(object, "blockedAt", &label)?;
    }
    Ok(())
}

fn validate_string_array(value: &Value, label: &str) -> Result<(), String> {
    let items = value
        .as_array()
        .ok_or_else(|| format!("{label} must be an array"))?;
    if items.iter().any(|value| !value.is_string()) {
        return Err(format!("{label} must contain strings"));
    }
    Ok(())
}

fn register_layout_item_ids(
    item: &Value,
    label: &str,
    seen_ids: &mut HashSet<String>,
) -> Result<(), String> {
    let object = item
        .as_object()
        .ok_or_else(|| format!("layout item {label} must be an object"))?;
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("layout item {label}.id must be a non-empty string"))?;
    if !seen_ids.insert(id.to_string()) {
        return Err(format!("layout item id must be unique: {id}"));
    }

    if object.get("type").and_then(Value::as_str) != Some("folder") {
        return Ok(());
    }

    let child_pages = object
        .get("childPages")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("layout item {label}.childPages must be an array"))?;
    for (page_index, page) in child_pages.iter().enumerate() {
        let children = page.as_array().ok_or_else(|| {
            format!("layout item {label}.childPages[{page_index}] must be an array")
        })?;
        for (child_index, child) in children.iter().enumerate() {
            register_layout_item_ids(
                child,
                &format!("{label}.childPages[{page_index}][{child_index}]"),
                seen_ids,
            )?;
        }
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
    match item_type {
        "catalogApp" => validate_layout_catalog_app_item(object, label),
        "manualApp" => {
            require_string_field(object, "name", label)?;
            validate_layout_manual_app_item(object, label)
        }
        "folder" => validate_layout_folder_item(object, label),
        _ => Err(format!(
            "layout item {label}.type must be catalogApp, manualApp, or folder"
        )),
    }
}

fn validate_layout_catalog_app_item(
    object: &serde_json::Map<String, Value>,
    label: &str,
) -> Result<(), String> {
    for forbidden in [
        "name",
        "emoji",
        "iconPath",
        "customIconPath",
        "launchTarget",
        "launchArgs",
        "source",
        "sourceKey",
        "sources",
        "trackingKey",
        "identityStatus",
        "iconDataUrl",
        "customIconDataUrl",
    ] {
        if object.contains_key(forbidden) {
            return Err(format!(
                "layout item {label}.{forbidden} must not be persisted on catalog references"
            ));
        }
    }
    let Some(overrides) = object.get("overrides") else {
        return Ok(());
    };
    let overrides = overrides
        .as_object()
        .ok_or_else(|| format!("layout item {label}.overrides must be an object"))?;
    for key in overrides.keys() {
        if !matches!(key.as_str(), "name" | "emoji" | "customIconPath") {
            return Err(format!(
                "layout item {label}.overrides.{key} is not a supported presentation override"
            ));
        }
    }
    for key in ["name", "emoji", "customIconPath"] {
        validate_optional_string_field(overrides, key, &format!("{label}.overrides"))?;
    }
    Ok(())
}

fn validate_layout_manual_app_item(
    object: &serde_json::Map<String, Value>,
    label: &str,
) -> Result<(), String> {
    if object.contains_key("iconDataUrl") {
        return Err(format!(
            "layout item {label}.iconDataUrl must not be persisted"
        ));
    }
    if object.contains_key("customIconDataUrl") {
        return Err(format!(
            "layout item {label}.customIconDataUrl must not be persisted"
        ));
    }

    for key in ["emoji", "iconPath", "customIconPath", "launchArgs"] {
        validate_optional_string_field(object, key, label)?;
    }

    let launch_target = object
        .get("launchTarget")
        .ok_or_else(|| format!("layout item {label}.launchTarget is required"))?;
    let launch_kind = validate_launch_target(launch_target, &format!("{label}.launchTarget"))?;
    if launch_kind != "executable" && object.get("launchArgs").is_some() {
        return Err(format!(
            "layout item {label}.launchArgs is only supported for executable launch targets"
        ));
    }

    Ok(())
}

fn validate_launch_target(launch_target: &Value, label: &str) -> Result<String, String> {
    let object = launch_target
        .as_object()
        .ok_or_else(|| format!("layout item {label} must be an object"))?;
    let kind = require_non_empty_string_field(object, "kind", label)?;
    match kind.as_str() {
        "shortcut" | "executable" | "url" => {
            require_non_empty_string_field(object, "path", label)?;
            validate_optional_string_field(object, "appUserModelId", label)?;
        }
        "appUserModelId" => {
            require_non_empty_string_field(object, "appUserModelId", label)?;
            validate_optional_string_field(object, "path", label)?;
        }
        _ => {
            return Err(format!(
                "layout item {label}.kind must be shortcut, executable, url, or appUserModelId"
            ))
        }
    }
    Ok(kind)
}

fn validate_layout_folder_item(
    object: &serde_json::Map<String, Value>,
    label: &str,
) -> Result<(), String> {
    require_string_field(object, "name", label)?;
    let child_pages = object
        .get("childPages")
        .ok_or_else(|| format!("layout item {label}.childPages is required"))?;
    let pages = child_pages
        .as_array()
        .ok_or_else(|| format!("layout item {label}.childPages must be an array"))?;
    for (page_index, page) in pages.iter().enumerate() {
        let children = page.as_array().ok_or_else(|| {
            format!("layout item {label}.childPages[{page_index}] must be an array")
        })?;
        for (child_index, child) in children.iter().enumerate() {
            validate_layout_folder_child(
                child,
                &format!("{label}.childPages[{page_index}][{child_index}]"),
            )?;
        }
    }

    if let Some(children) = object.get("children") {
        let children = children
            .as_array()
            .ok_or_else(|| format!("layout item {label}.children must be an array"))?;
        for (child_index, child) in children.iter().enumerate() {
            validate_layout_folder_child(child, &format!("{label}.children[{child_index}]"))?;
        }
    }

    Ok(())
}

fn validate_layout_folder_child(child: &Value, label: &str) -> Result<(), String> {
    let object = child
        .as_object()
        .ok_or_else(|| format!("layout item {label} must be an object"))?;
    if !matches!(
        object.get("type").and_then(Value::as_str),
        Some("catalogApp" | "manualApp")
    ) {
        return Err(format!(
            "layout item {label}.type must be catalogApp or manualApp"
        ));
    }
    validate_layout_item(child, label)
}

fn require_string_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<(), String> {
    match object.get(key).and_then(Value::as_str) {
        Some(value) if !value.is_empty() => Ok(()),
        _ => Err(format!(
            "layout item {label}.{key} must be a non-empty string"
        )),
    }
}

fn require_non_empty_string_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<String, String> {
    match object.get(key).and_then(Value::as_str) {
        Some(value) if !value.is_empty() => Ok(value.to_string()),
        _ => Err(format!("{label}.{key} must be a non-empty string")),
    }
}

fn require_bool_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<(), String> {
    object
        .get(key)
        .and_then(Value::as_bool)
        .ok_or_else(|| format!("{label}.{key} must be a boolean"))?;
    Ok(())
}

fn validate_optional_object_string_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<(), String> {
    if object.get(key).is_some_and(|value| !value.is_string()) {
        return Err(format!("{label}.{key} must be a string"));
    }
    Ok(())
}

fn validate_optional_positive_integer_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<(), String> {
    if let Some(value) = object.get(key) {
        let number = value
            .as_u64()
            .ok_or_else(|| format!("{label}.{key} must be a positive integer"))?;
        if number == 0 {
            return Err(format!("{label}.{key} must be a positive integer"));
        }
    }
    Ok(())
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

    replace_file(&temp_path, path).inspect_err(|_| {
        if let Err(error) = fs::remove_file(&temp_path) {
            log::warn!(
                target: "layout_store",
                "Failed to remove temporary layout {} after save failure: {error}",
                temp_path.display()
            );
        }
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

fn find_manual_app_in_layout_value(
    value: &Value,
    app_id: &str,
    depth: usize,
) -> Option<SavedManualApp> {
    if depth > MAX_LAYOUT_LOOKUP_DEPTH {
        log::warn!(
            target: "layout_store",
            "Skipping layout app lookup beyond maximum traversal depth {MAX_LAYOUT_LOOKUP_DEPTH} while searching for app id {app_id}"
        );
        return None;
    }

    if value.get("type").and_then(Value::as_str) == Some("manualApp")
        && value.get("id").and_then(Value::as_str) == Some(app_id)
        && value.get("launchTarget").is_some()
    {
        return match SavedManualApp::deserialize(value) {
            Ok(app) => Some(app),
            Err(error) => {
                log::warn!(
                    target: "layout_store",
                    "Failed to deserialize saved layout app {app_id}: {error}"
                );
                None
            }
        };
    }

    match value {
        Value::Array(items) => items
            .iter()
            .find_map(|item| find_manual_app_in_layout_value(item, app_id, depth + 1)),
        Value::Object(map) => map
            .values()
            .find_map(|item| find_manual_app_in_layout_value(item, app_id, depth + 1)),
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
        let path = std::env::temp_dir().join(format!("lumeria-{name}-{}", timestamp_nanos()));
        fs::create_dir_all(&path).expect("create test directory");
        path
    }

    fn valid_layout() -> Value {
        json!({
            "version": 2,
            "pages": [
                [
                    {
                        "id": "app-a",
                        "type": "manualApp",
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
                                    "type": "manualApp",
                                    "name": "App B",
                                    "launchTarget": {
                                        "kind": "url",
                                        "path": "https://example.com"
                                    }
                                }
                            ]
                        ],
                    }
                ]
            ],
            "settings": {
                "gridRows": 4,
                "gridCols": 6,
                "folderRows": 3,
                "folderCols": 4,
                "iconSize": 64,
                "folderIconSizeMode": "custom",
                "folderIconSize": 88,
                "textless": false,
                "hiddenAppIds": ["hidden-app"],
                "scanRoots": [
                    {
                        "id": "root-start-menu-user",
                        "type": "startMenuUser",
                        "label": "用户开始菜单",
                        "path": "%APPDATA%/Microsoft/Windows/Start Menu/Programs",
                        "enabled": true,
                        "removable": true
                    },
                    {
                        "id": "root-windows-app-catalog",
                        "type": "windowsAppCatalog",
                        "label": "Windows 应用（商店与系统）",
                        "path": "shell:AppsFolder",
                        "enabled": true,
                        "removable": false,
                        "maxEntries": 5000
                    }
                ],
                "scanKeywordAllowlist": ["catalog-allowed"],
                "scanKeywordBlacklist": ["卸载", "uninstall"],
                "scanAppBlacklist": [
                    {
                        "catalogId": "catalog-blocked",
                        "name": "Blocked",
                        "blockedAt": "2026-05-31T00:00:00.000Z"
                    }
                ],
                "showMissingLaunchTargetBadge": true,
                "windowEffectMaterial": "none",
                "windowEffectAppearance": "system",
                "settingsThemePreference": "system",
                "launchpadIconVariant": "pastelDark",
                "mainWindowShortcut": "control+alt+KeyL"
            }
        })
    }

    fn nested_folder_item(depth: usize) -> Value {
        let mut item = json!({
            "id": "deep-app",
            "type": "manualApp",
            "name": "Deep App",
            "launchTarget": {
                "kind": "shortcut",
                "path": "C:/Apps/Deep App.lnk"
            }
        });

        for level in (0..depth).rev() {
            item = json!({
                "id": format!("folder-{level}"),
                "type": "folder",
                "name": format!("Folder {level}"),
                "childPages": [[item.clone()]],
            });
        }

        item
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

        assert_eq!(
            fs::read_to_string(&path).expect("read replaced file"),
            "new"
        );
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
    fn save_layout_to_path_accepts_v2_catalog_references_without_launch_snapshots() {
        let dir = test_dir("v2-catalog-reference");
        let path = dir.join("layout.json");
        let mut layout = valid_layout();
        layout["version"] = json!(2);
        layout["pages"] = json!([[
            {
                "id": "catalog-steam",
                "type": "catalogApp",
                "overrides": {
                    "name": "My Steam",
                    "customIconPath": "C:/Icons/steam.png"
                }
            },
            {
                "id": "manual-tool",
                "type": "manualApp",
                "name": "Tool",
                "launchTarget": {
                    "kind": "executable",
                    "path": "C:/Tools/Tool.exe"
                },
                "launchArgs": "--profile work"
            }
        ]]);

        save_layout_to_path(&path, &layout).expect("version 2 layout should save");

        assert!(path.exists());
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_launch_snapshots_on_catalog_references() {
        let dir = test_dir("catalog-launch-snapshot");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][0] = json!({
            "id": "catalog-app-a",
            "type": "catalogApp",
            "launchTarget": {
                "kind": "shortcut",
                "path": "C:/Apps/App A.lnk"
            }
        });

        let error =
            save_layout_to_path(&path, &invalid).expect_err("catalog launch snapshots should fail");

        assert!(error.contains("launchTarget"));
        assert!(!path.exists());
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn load_layout_from_path_rejects_unreleased_v1_without_migration() {
        let dir = test_dir("v1-no-migration");
        let path = dir.join("layout.json");
        let mut old = valid_layout();
        old["version"] = json!(1);
        fs::write(
            &path,
            serde_json::to_string(&old).expect("serialize v1 layout"),
        )
        .expect("write v1 layout");

        let result = load_layout_from_path(&path).expect("v1 layout should recover explicitly");

        assert!(result.layout.is_none());
        assert!(result.recovery.is_some());
        assert!(!path.exists());
        assert_eq!(corrupt_backups(&dir).len(), 1);
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_layout_schema() {
        let dir = test_dir("invalid-save");
        let path = dir.join("layout.json");
        let invalid = json!({
            "version": 2,
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
    fn save_layout_to_path_rejects_persisted_catalog_icon_data() {
        let dir = test_dir("invalid-icon-data-url");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][0]["iconDataUrl"] = json!("data:image/png;base64,abc");

        let error = save_layout_to_path(&path, &invalid).expect_err("iconDataUrl should fail");

        assert!(error.contains("iconDataUrl"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_persisted_custom_icon_data() {
        let dir = test_dir("invalid-custom-icon-data-url");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][0]["customIconDataUrl"] = json!("data:image/png;base64,abc");

        let error =
            save_layout_to_path(&path, &invalid).expect_err("customIconDataUrl should fail");

        assert!(error.contains("customIconDataUrl"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_requires_documented_scan_settings() {
        let dir = test_dir("invalid-scan-settings");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]
            .as_object_mut()
            .expect("settings object")
            .remove("scanRoots");

        let error = save_layout_to_path(&path, &invalid).expect_err("scanRoots should fail");

        assert!(error.contains("scanRoots"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_scan_keyword_allowlist() {
        let dir = test_dir("invalid-scan-keyword-allowlist");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]["scanKeywordAllowlist"] = json!("catalog-allowed");

        let error = save_layout_to_path(&path, &invalid)
            .expect_err("scanKeywordAllowlist should be a string array");

        assert!(error.contains("scanKeywordAllowlist"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_accepts_legacy_layout_without_scan_keyword_allowlist() {
        let dir = test_dir("legacy-layout-without-scan-keyword-allowlist");
        let path = dir.join("layout.json");
        let mut legacy = valid_layout();
        legacy["settings"]
            .as_object_mut()
            .expect("settings object")
            .remove("scanKeywordAllowlist");

        save_layout_to_path(&path, &legacy)
            .expect("legacy layout without scanKeywordAllowlist should remain valid");

        assert!(path.exists());
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_missing_main_window_shortcut() {
        let dir = test_dir("missing-main-window-shortcut");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]
            .as_object_mut()
            .expect("settings object")
            .remove("mainWindowShortcut");

        let error = save_layout_to_path(&path, &invalid).expect_err("missing shortcut should fail");

        assert!(error.contains("mainWindowShortcut"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_allows_null_main_window_shortcut() {
        let dir = test_dir("null-main-window-shortcut");
        let path = dir.join("layout.json");
        let mut valid = valid_layout();
        valid["settings"]["mainWindowShortcut"] = json!(null);

        save_layout_to_path(&path, &valid).expect("null mainWindowShortcut should save");

        assert!(path.exists(), "valid layout should be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_empty_main_window_shortcut() {
        let dir = test_dir("empty-main-window-shortcut");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]["mainWindowShortcut"] = json!("  ");

        let error = save_layout_to_path(&path, &invalid).expect_err("empty shortcut should fail");

        assert!(error.contains("mainWindowShortcut"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_custom_titlebar_visibility() {
        let dir = test_dir("invalid-custom-titlebar-visibility");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]["showCustomTitlebar"] = json!("yes");

        let error = save_layout_to_path(&path, &invalid)
            .expect_err("non-boolean custom titlebar visibility should fail");

        assert!(error.contains("showCustomTitlebar"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_fullscreen_overscan_preference() {
        let dir = test_dir("invalid-fullscreen-overscan-preference");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]["fullscreenOverscanEnabled"] = json!("yes");

        let error = save_layout_to_path(&path, &invalid)
            .expect_err("non-boolean fullscreen overscan preference should fail");

        assert!(error.contains("fullscreenOverscanEnabled"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_settings_theme_preferences() {
        let dir = test_dir("invalid-settings-theme-preference");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]["settingsThemePreference"] = json!("sepia");

        let error = save_layout_to_path(&path, &invalid)
            .expect_err("an unknown settings theme preference should fail");

        assert!(error.contains("settingsThemePreference"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_launchpad_icon_variants() {
        let dir = test_dir("invalid-launchpad-icon-variant");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]["launchpadIconVariant"] = json!("system");

        let error = save_layout_to_path(&path, &invalid)
            .expect_err("an unknown launchpad icon variant should fail");

        assert!(error.contains("launchpadIconVariant"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_window_effect_appearances() {
        let dir = test_dir("invalid-window-effect-appearance");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]["windowEffectAppearance"] = json!("sepia");

        let error = save_layout_to_path(&path, &invalid)
            .expect_err("an unknown window effect appearance should fail");

        assert!(error.contains("windowEffectAppearance"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_accepts_optional_future_locale_preferences() {
        let dir = test_dir("future-locale-preference");
        let path = dir.join("layout.json");
        let mut valid = valid_layout();
        valid["settings"]["localePreference"] = json!("fr-FR");

        save_layout_to_path(&path, &valid)
            .expect("unknown non-empty locale preferences should remain forward compatible");

        assert!(
            path.exists(),
            "the forward-compatible layout should be written"
        );
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_locale_preferences() {
        let dir = test_dir("invalid-locale-preference");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]["localePreference"] = json!("   ");

        let error = save_layout_to_path(&path, &invalid)
            .expect_err("an empty locale preference should fail");

        assert!(error.contains("localePreference"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_requires_app_launch_target() {
        let dir = test_dir("invalid-app-launch-target");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][0]
            .as_object_mut()
            .expect("app object")
            .remove("launchTarget");

        let error = save_layout_to_path(&path, &invalid).expect_err("launchTarget should fail");

        assert!(error.contains("launchTarget"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_launch_target_kind() {
        let dir = test_dir("invalid-launch-target-kind");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][0]["launchTarget"]["kind"] = json!("document");

        let error = save_layout_to_path(&path, &invalid).expect_err("kind should fail");

        assert!(error.contains("kind"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_launch_args_for_shortcuts() {
        let dir = test_dir("invalid-shortcut-launch-args");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][0]["launchArgs"] = json!("--profile dev");

        let error = save_layout_to_path(&path, &invalid).expect_err("launchArgs should fail");

        assert!(error.contains("launchArgs"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_allows_launch_args_for_executables() {
        let dir = test_dir("valid-executable-launch-args");
        let path = dir.join("layout.json");
        let mut valid = valid_layout();
        valid["pages"][0][0]["launchTarget"]["kind"] = json!("executable");
        valid["pages"][0][0]["launchTarget"]["path"] = json!("C:/Apps/App A.exe");
        valid["pages"][0][0]["launchArgs"] = json!("--profile dev");

        save_layout_to_path(&path, &valid).expect("executable launchArgs should save");

        assert!(path.exists(), "valid layout should be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_requires_folder_child_pages() {
        let dir = test_dir("invalid-folder-contract");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][1].as_object_mut().expect("folder object").remove("childPages");

        let error = save_layout_to_path(&path, &invalid).expect_err("childPages should fail");

        assert!(error.contains("childPages"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_duplicate_item_ids() {
        let dir = test_dir("invalid-duplicate-ids");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][1]["childPages"][0][0]["id"] = json!("app-a");

        let error = save_layout_to_path(&path, &invalid).expect_err("duplicate ids should fail");

        assert!(error.contains("unique"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn find_layout_manual_app_deserializes_matching_app_and_reports_corrupt_match() {
        let layout = valid_layout();

        let app =
            find_layout_manual_app(&layout, "app-a").expect("saved manual app should deserialize");

        assert_eq!(app.name, "App A");

        let mut corrupt = valid_layout();
        corrupt["pages"][0][0]
            .as_object_mut()
            .expect("app object")
            .remove("name");

        assert!(
            find_layout_manual_app(&corrupt, "app-a").is_none(),
            "corrupt matching app should not be treated as missing silently"
        );
    }

    #[test]
    fn save_layout_to_path_rejects_nested_folder_children() {
        let dir = test_dir("nested-folder-child");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        let nested = nested_folder_item(2);
        invalid["pages"][0][1]["childPages"][0][0] = nested.clone();

        let error = save_layout_to_path(&path, &invalid).expect_err("nested folder should fail");

        assert!(error.contains("type must be catalogApp or manualApp"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn find_layout_manual_app_stops_at_maximum_nesting_depth() {
        let mut layout = json!({
            "id": "deep-app",
            "type": "manualApp",
            "name": "Deep App",
            "launchTarget": {
                "kind": "shortcut",
                "path": "C:/Apps/Deep App.lnk"
            }
        });
        for _ in 0..(MAX_LAYOUT_LOOKUP_DEPTH + 2) {
            layout = json!([layout]);
        }

        assert!(find_layout_manual_app(&layout, "deep-app").is_none());
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

        assert_eq!(loaded["version"], 2);
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
