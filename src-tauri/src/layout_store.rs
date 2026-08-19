use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct StartupLayoutPreferences {
    pub(crate) locale_preference: String,
    pub(crate) launchpad_icon_variant: LaunchpadIconVariant,
}

pub(crate) fn load_layout(app: &AppHandle) -> Result<Option<Value>, String> {
    let path = layout_path(app)?;
    load_layout_from_path(&path)
}

pub(crate) fn save_layout(app: &AppHandle, layout: &Value) -> Result<(), String> {
    let path = layout_path(app)?;
    save_layout_to_path(&path, layout)
}

pub(crate) fn load_startup_layout_preferences(
    app: &AppHandle,
) -> Result<Option<StartupLayoutPreferences>, String> {
    load_layout(app)?
        .as_ref()
        .map(startup_layout_preferences_from_value)
        .transpose()
}

fn startup_layout_preferences_from_value(
    layout: &Value,
) -> Result<StartupLayoutPreferences, String> {
    validate_layout_value(layout)?;
    let settings = layout
        .get("settings")
        .and_then(Value::as_object)
        .expect("validated layout settings");
    let locale_preference = settings
        .get("localePreference")
        .and_then(Value::as_str)
        .expect("validated locale preference")
        .to_string();
    let launchpad_icon_variant = settings
        .get("launchpadIconVariant")
        .and_then(Value::as_str)
        .and_then(LaunchpadIconVariant::parse)
        .expect("validated launchpad icon variant");
    Ok(StartupLayoutPreferences {
        locale_preference,
        launchpad_icon_variant,
    })
}

pub(crate) fn find_layout_manual_app(layout: &Value, app_id: &str) -> Option<SavedManualApp> {
    find_manual_app_in_layout_value(layout, app_id, 0)
}

fn load_layout_from_path(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read layout {}: {error}", path.display()))?;
    let layout: Value = serde_json::from_str(&contents)
        .map_err(|error| format!("Failed to parse layout {}: {error}", path.display()))?;
    validate_layout_value(&layout)
        .map_err(|error| format!("Invalid layout {}: {error}", path.display()))?;
    Ok(Some(layout))
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

fn validate_layout_value(layout: &Value) -> Result<(), String> {
    let object = layout
        .as_object()
        .ok_or_else(|| "layout must be an object".to_string())?;
    require_exact_fields(
        object,
        &["version", "pages", "settings"],
        &["version", "pages", "settings"],
        "layout",
    )?;

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
    const FIELDS: &[&str] = &[
        "gridRows",
        "gridCols",
        "folderRows",
        "folderCols",
        "iconSize",
        "folderIconSizeMode",
        "folderIconSize",
        "textless",
        "hiddenAppIds",
        "scanRoots",
        "scanKeywordBlacklist",
        "scanKeywordAllowlist",
        "scanAppBlacklist",
        "showMissingLaunchTargetBadge",
        "backgroundBaseColor",
        "backgroundBaseOpacity",
        "backgroundSource",
        "backgroundEffect",
        "backgroundImageOpacity",
        "backgroundLiveDesktopOpacity",
        "backgroundImageLayout",
        "backgroundBlurStrength",
        "backgroundAcrylicBlurStrength",
        "backgroundDarkenStrength",
        "backgroundDarkenColor",
        "backgroundAcrylicAppearance",
        "backgroundAcrylicDarkParams",
        "backgroundAcrylicLightParams",
        "backgroundImagePath",
        "windowEffectMaterial",
        "windowEffectAppearance",
        "windowMode",
        "fullscreenOverscanEnabled",
        "showCustomTitlebar",
        "mainWindowShortcut",
        "localePreference",
        "settingsThemePreference",
        "launchpadIconVariant",
    ];
    require_exact_fields(object, FIELDS, FIELDS, "layout settings")?;

    require_integer_in_range(object, "gridRows", 2, 8, "layout settings")?;
    require_integer_in_range(object, "gridCols", 3, 10, "layout settings")?;
    require_integer_in_range(object, "folderRows", 2, 6, "layout settings")?;
    require_integer_in_range(object, "folderCols", 2, 8, "layout settings")?;
    require_integer_in_range(object, "iconSize", 32, 128, "layout settings")?;
    require_enum_field(
        object,
        "folderIconSizeMode",
        &["global", "custom"],
        "layout settings",
    )?;
    require_integer_in_range(object, "folderIconSize", 32, 128, "layout settings")?;
    require_bool_field(object, "textless", "layout settings")?;
    validate_string_array(
        object.get("hiddenAppIds").expect("required settings field"),
        "layout settings.hiddenAppIds",
    )?;

    validate_scan_roots(
        object
            .get("scanRoots")
            .ok_or_else(|| "layout settings.scanRoots must be an array".to_string())?,
    )?;
    validate_string_array(
        object
            .get("scanKeywordAllowlist")
            .ok_or_else(|| "layout settings.scanKeywordAllowlist must be an array".to_string())?,
        "layout settings.scanKeywordAllowlist",
    )?;
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
    require_bool_field(object, "showMissingLaunchTargetBadge", "layout settings")?;

    require_color_field(object, "backgroundBaseColor", "layout settings")?;
    require_integer_in_range(object, "backgroundBaseOpacity", 0, 100, "layout settings")?;
    require_enum_field(
        object,
        "backgroundSource",
        &[
            "systemMaterial",
            "customImage",
            "windowsWallpaper",
            "windowsLiveDesktop",
        ],
        "layout settings",
    )?;
    require_enum_field(
        object,
        "backgroundEffect",
        &["none", "dimmed", "blur", "acrylicWebgl"],
        "layout settings",
    )?;
    require_integer_in_range(object, "backgroundImageOpacity", 0, 100, "layout settings")?;
    require_integer_in_range(
        object,
        "backgroundLiveDesktopOpacity",
        0,
        100,
        "layout settings",
    )?;
    require_enum_field(
        object,
        "backgroundImageLayout",
        &["fill", "fit", "stretch", "tile", "center"],
        "layout settings",
    )?;
    require_integer_in_range(object, "backgroundBlurStrength", 1, 100, "layout settings")?;
    require_integer_in_range(
        object,
        "backgroundAcrylicBlurStrength",
        1,
        100,
        "layout settings",
    )?;
    require_integer_in_range(
        object,
        "backgroundDarkenStrength",
        0,
        100,
        "layout settings",
    )?;
    require_color_field(object, "backgroundDarkenColor", "layout settings")?;
    require_enum_field(
        object,
        "backgroundAcrylicAppearance",
        &["system", "dark", "light"],
        "layout settings",
    )?;
    validate_acrylic_parameters(
        object
            .get("backgroundAcrylicDarkParams")
            .expect("required settings field"),
        "layout settings.backgroundAcrylicDarkParams",
    )?;
    validate_acrylic_parameters(
        object
            .get("backgroundAcrylicLightParams")
            .expect("required settings field"),
        "layout settings.backgroundAcrylicLightParams",
    )?;
    let background_image_path = object
        .get("backgroundImagePath")
        .expect("required settings field");
    if !background_image_path.is_null() {
        require_non_empty_string_value(
            background_image_path,
            "layout settings.backgroundImagePath",
        )?;
    }

    require_enum_field(
        object,
        "windowEffectMaterial",
        &["none", "acrylic", "mica", "micaAlt"],
        "layout settings",
    )?;
    require_enum_field(
        object,
        "windowEffectAppearance",
        &["system", "dark", "light"],
        "layout settings",
    )?;
    require_enum_field(
        object,
        "windowMode",
        &["fullscreen", "windowed"],
        "layout settings",
    )?;
    require_bool_field(object, "fullscreenOverscanEnabled", "layout settings")?;
    require_bool_field(object, "showCustomTitlebar", "layout settings")?;
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

    let preference = object
        .get("localePreference")
        .and_then(Value::as_str)
        .ok_or_else(|| "layout settings.localePreference must be a non-empty string".to_string())?;
    if preference.trim().is_empty() || preference.len() > 64 {
        return Err(
            "layout settings.localePreference must be a non-empty string up to 64 bytes"
                .to_string(),
        );
    }

    require_enum_field(
        object,
        "settingsThemePreference",
        &["system", "dark", "light"],
        "layout settings",
    )?;
    require_enum_field(
        object,
        "launchpadIconVariant",
        &["light", "dark", "pastelLight", "pastelDark"],
        "layout settings",
    )?;

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
        require_exact_fields(
            object,
            &[
                "id",
                "type",
                "label",
                "path",
                "enabled",
                "removable",
                "lastScannedAt",
                "maxDepth",
                "maxEntries",
            ],
            &["id", "type", "label", "path", "enabled", "removable"],
            &label,
        )?;
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
        require_exact_fields(
            object,
            &["catalogId", "name", "blockedAt"],
            &["catalogId"],
            &label,
        )?;
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
    for (index, value) in items.iter().enumerate() {
        require_non_empty_string_value(value, &format!("{label}[{index}]"))?;
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
    require_exact_fields(
        object,
        &["id", "type", "overrides"],
        &["id", "type"],
        &format!("layout item {label}"),
    )?;
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
    require_exact_fields(
        overrides,
        &["name", "emoji", "customIconPath"],
        &[],
        &format!("layout item {label}.overrides"),
    )?;
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
    require_exact_fields(
        object,
        &[
            "id",
            "type",
            "name",
            "emoji",
            "iconPath",
            "customIconPath",
            "launchTarget",
            "launchArgs",
        ],
        &["id", "type", "name", "launchTarget"],
        &format!("layout item {label}"),
    )?;
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
    require_exact_fields(
        object,
        &["kind", "path", "appUserModelId"],
        &["kind"],
        &format!("layout item {label}"),
    )?;
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
    if object.contains_key("children") {
        return Err(format!(
            "layout item {label}.children is no longer supported; use childPages"
        ));
    }
    require_exact_fields(
        object,
        &["id", "type", "name", "childPages"],
        &["id", "type", "name", "childPages"],
        &format!("layout item {label}"),
    )?;
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
        Some(value) if !value.trim().is_empty() => Ok(()),
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
        Some(value) if !value.trim().is_empty() => Ok(value.to_string()),
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
    if let Some(value) = object.get(key) {
        require_non_empty_string_value(value, &format!("{label}.{key}"))?;
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
    if let Some(value) = object.get(key) {
        require_non_empty_string_value(value, &format!("layout item {label}.{key}"))?;
    }
    Ok(())
}

fn require_exact_fields(
    object: &serde_json::Map<String, Value>,
    allowed: &[&str],
    required: &[&str],
    label: &str,
) -> Result<(), String> {
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(format!("{label}.{key} is not supported"));
        }
    }
    for key in required {
        if !object.contains_key(*key) {
            return Err(format!("{label}.{key} is required"));
        }
    }
    Ok(())
}

fn require_non_empty_string_value(value: &Value, label: &str) -> Result<(), String> {
    match value.as_str() {
        Some(value) if !value.trim().is_empty() => Ok(()),
        _ => Err(format!("{label} must be a non-empty string")),
    }
}

fn require_integer_in_range(
    object: &serde_json::Map<String, Value>,
    key: &str,
    minimum: u64,
    maximum: u64,
    label: &str,
) -> Result<(), String> {
    let value = object
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("{label}.{key} must be an integer from {minimum} to {maximum}"))?;
    if value < minimum || value > maximum {
        return Err(format!(
            "{label}.{key} must be an integer from {minimum} to {maximum}"
        ));
    }
    Ok(())
}

fn require_number_in_range(
    object: &serde_json::Map<String, Value>,
    key: &str,
    minimum: f64,
    maximum: f64,
    label: &str,
) -> Result<(), String> {
    let value = object
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| format!("{label}.{key} must be a number from {minimum} to {maximum}"))?;
    if value < minimum || value > maximum {
        return Err(format!(
            "{label}.{key} must be a number from {minimum} to {maximum}"
        ));
    }
    Ok(())
}

fn require_enum_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    allowed: &[&str],
    label: &str,
) -> Result<(), String> {
    let value = object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{label}.{key} must be {}", allowed.join(", ")))?;
    if !allowed.contains(&value) {
        return Err(format!("{label}.{key} must be {}", allowed.join(", ")));
    }
    Ok(())
}

fn require_color_field(
    object: &serde_json::Map<String, Value>,
    key: &str,
    label: &str,
) -> Result<(), String> {
    let Some(value) = object.get(key).and_then(Value::as_str) else {
        return Err(format!("{label}.{key} must be a lowercase #rrggbb color"));
    };
    let bytes = value.as_bytes();
    if bytes.len() != 7
        || bytes[0] != b'#'
        || bytes[1..]
            .iter()
            .any(|byte| !byte.is_ascii_digit() && !(b'a'..=b'f').contains(byte))
    {
        return Err(format!("{label}.{key} must be a lowercase #rrggbb color"));
    }
    Ok(())
}

fn validate_acrylic_parameters(value: &Value, label: &str) -> Result<(), String> {
    const FIELDS: &[&str] = &[
        "brightness",
        "contrast",
        "noise",
        "saturation",
        "seed",
        "tintColor",
        "tintStrength",
    ];
    let object = value
        .as_object()
        .ok_or_else(|| format!("{label} must be an object"))?;
    require_exact_fields(object, FIELDS, FIELDS, label)?;
    require_number_in_range(object, "brightness", 0.4, 1.4, label)?;
    require_number_in_range(object, "contrast", 0.6, 1.4, label)?;
    require_number_in_range(object, "noise", 0.0, 0.08, label)?;
    require_number_in_range(object, "saturation", 0.4, 1.8, label)?;
    require_integer_in_range(object, "seed", 0, 1000, label)?;
    let tint_color = object
        .get("tintColor")
        .and_then(Value::as_array)
        .filter(|values| values.len() == 3)
        .ok_or_else(|| format!("{label}.tintColor must contain exactly three numbers"))?;
    for (index, component) in tint_color.iter().enumerate() {
        let component = component
            .as_f64()
            .filter(|value| value.is_finite())
            .ok_or_else(|| format!("{label}.tintColor[{index}] must be a number from 0 to 1"))?;
        if !(0.0..=1.0).contains(&component) {
            return Err(format!(
                "{label}.tintColor[{index}] must be a number from 0 to 1"
            ));
        }
    }
    require_number_in_range(object, "tintStrength", 0.0, 0.8, label)
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

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LayoutContractCase {
        name: String,
        valid: bool,
        #[serde(default)]
        path: Vec<Value>,
        #[serde(default)]
        value: Value,
        #[serde(default)]
        remove: bool,
    }

    fn test_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("lumeria-{name}-{}", timestamp_nanos()));
        fs::create_dir_all(&path).expect("create test directory");
        path
    }

    fn valid_layout() -> Value {
        serde_json::from_str(include_str!(
            "../../src/domain/fixtures/layout-v2-roundtrip.json"
        ))
        .expect("parse canonical layout fixture")
    }

    fn apply_contract_case(layout: &mut Value, contract_case: &LayoutContractCase) {
        if contract_case.path.is_empty() {
            return;
        }
        let (last, parents) = contract_case.path.split_last().expect("non-empty path");
        let mut cursor = layout;
        for segment in parents {
            cursor = match segment {
                Value::String(key) => cursor
                    .as_object_mut()
                    .and_then(|object| object.get_mut(key))
                    .expect("contract case object path"),
                Value::Number(index) => cursor
                    .as_array_mut()
                    .and_then(|array| {
                        index
                            .as_u64()
                            .and_then(|index| array.get_mut(index as usize))
                    })
                    .expect("contract case array path"),
                _ => panic!("contract case path segments must be strings or integers"),
            };
        }
        match last {
            Value::String(key) => {
                let object = cursor.as_object_mut().expect("contract case object parent");
                if contract_case.remove {
                    object.remove(key);
                } else {
                    object.insert(key.clone(), contract_case.value.clone());
                }
            }
            Value::Number(index) => {
                let index = index.as_u64().expect("contract case integer index") as usize;
                let array = cursor.as_array_mut().expect("contract case array parent");
                if contract_case.remove {
                    array.remove(index);
                } else {
                    array[index] = contract_case.value.clone();
                }
            }
            _ => panic!("contract case final segment must be a string or integer"),
        }
    }

    #[test]
    fn layout_contract_matches_shared_parity_corpus() {
        let cases: Vec<LayoutContractCase> = serde_json::from_str(include_str!(
            "../../src/domain/fixtures/layout-v2-contract-cases.json"
        ))
        .expect("parse shared layout contract cases");
        for contract_case in cases {
            let mut layout = valid_layout();
            apply_contract_case(&mut layout, &contract_case);
            assert_eq!(
                validate_layout_value(&layout).is_ok(),
                contract_case.valid,
                "shared layout contract case '{}'",
                contract_case.name
            );
        }
    }

    #[test]
    fn startup_preferences_are_derived_only_from_a_validated_layout() {
        let layout = valid_layout();
        let preferences = startup_layout_preferences_from_value(&layout)
            .expect("canonical layout should provide startup preferences");
        assert_eq!(preferences.locale_preference, "en-US");
        assert_eq!(
            preferences.launchpad_icon_variant,
            LaunchpadIconVariant::PastelDark
        );

        let mut invalid = layout;
        invalid["settings"]["unexpected"] = json!(true);
        assert!(
            startup_layout_preferences_from_value(&invalid).is_err(),
            "partial startup reads must not bypass the canonical validator"
        );
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
    fn load_layout_from_path_rejects_unreleased_v1() {
        let dir = test_dir("v1-no-migration");
        let path = dir.join("layout.json");
        let mut old = valid_layout();
        old["version"] = json!(1);
        fs::write(
            &path,
            serde_json::to_string(&old).expect("serialize v1 layout"),
        )
        .expect("write v1 layout");

        let error = load_layout_from_path(&path).expect_err("v1 layout should be rejected");

        assert!(error.contains("version must be 2"));
        assert!(
            path.exists(),
            "invalid layout should remain for explicit user reset"
        );
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_invalid_layout_schema() {
        let dir = test_dir("invalid-save");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]["hiddenAppIds"] = json!([42]);

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
    fn save_layout_to_path_rejects_missing_scan_keyword_allowlist() {
        let dir = test_dir("missing-scan-keyword-allowlist");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["settings"]
            .as_object_mut()
            .expect("settings object")
            .remove("scanKeywordAllowlist");

        let error = save_layout_to_path(&path, &invalid)
            .expect_err("scanKeywordAllowlist should be required by the canonical contract");

        assert!(error.contains("scanKeywordAllowlist"));
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
        invalid["pages"][0][1]["childPages"][0][0]["launchArgs"] = json!("--profile dev");

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
        invalid["pages"][0][1]
            .as_object_mut()
            .expect("folder object")
            .remove("childPages");

        let error = save_layout_to_path(&path, &invalid).expect_err("childPages should fail");

        assert!(error.contains("childPages"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_legacy_flat_folder_children() {
        let dir = test_dir("legacy-flat-folder-children");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][1]["children"] = json!([
            {
                "id": "app-c",
                "type": "manualApp",
                "name": "App C",
                "launchTarget": {
                    "kind": "url",
                    "path": "https://example.com/c"
                }
            }
        ]);

        let error = save_layout_to_path(&path, &invalid)
            .expect_err("legacy flat folder children should fail");

        assert!(error.contains("children is no longer supported"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn save_layout_to_path_rejects_duplicate_item_ids() {
        let dir = test_dir("invalid-duplicate-ids");
        let path = dir.join("layout.json");
        let mut invalid = valid_layout();
        invalid["pages"][0][1]["childPages"][0][0]["id"] = json!("custom-editor");

        let error = save_layout_to_path(&path, &invalid).expect_err("duplicate ids should fail");

        assert!(error.contains("unique"));
        assert!(!path.exists(), "invalid layout should not be written");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn find_layout_manual_app_deserializes_matching_app_and_reports_corrupt_match() {
        let layout = valid_layout();

        let app = find_layout_manual_app(&layout, "custom-editor")
            .expect("saved manual app should deserialize");

        assert_eq!(app.name, "Editor");

        let mut corrupt = valid_layout();
        corrupt["pages"][0][0]
            .as_object_mut()
            .expect("app object")
            .remove("name");

        assert!(
            find_layout_manual_app(&corrupt, "custom-editor").is_none(),
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
            .expect("layout should exist");

        assert_eq!(loaded["version"], 2);
        assert!(path.exists(), "valid layout should remain in place");
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn load_layout_from_path_rejects_malformed_json_without_mutating_file() {
        let dir = test_dir("malformed-load");
        let path = dir.join("layout.json");
        fs::write(&path, "{not-json").expect("write malformed layout");

        let error = load_layout_from_path(&path).expect_err("malformed layout should fail");

        assert!(error.contains("Failed to parse layout"));
        assert!(
            path.exists(),
            "malformed layout should remain for explicit user reset"
        );
        assert_eq!(
            fs::read_to_string(&path).expect("read malformed layout"),
            "{not-json"
        );
        fs::remove_dir_all(dir).expect("remove test directory");
    }

    #[test]
    fn load_layout_from_path_rejects_invalid_schema_without_mutating_file() {
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

        let error = load_layout_from_path(&path).expect_err("invalid layout should fail");

        assert!(error.contains("Invalid layout"));
        assert!(
            path.exists(),
            "invalid layout should remain for explicit user reset"
        );
        fs::remove_dir_all(dir).expect("remove test directory");
    }
}
