use std::{collections::HashSet, path::PathBuf};

use serde::{Deserialize, Serialize};

use crate::{
    catalog::{scan_apps_from_roots, ScanFilters, ScanRoot},
    launcher::{launch_app_user_model_id, launch_path, LaunchPathError, LaunchPathErrorKind},
    layout_store::{find_layout_manual_app, SavedManualApp},
    models::{AppCatalogItem, AppSourceState, LaunchTarget},
};

#[derive(Clone, Debug)]
pub struct LaunchableApp {
    pub launch_target: LaunchTarget,
    pub launch_args: Option<String>,
    pub fallback_launch_paths: Vec<String>,
}

impl From<AppCatalogItem> for LaunchableApp {
    fn from(app: AppCatalogItem) -> Self {
        let primary_path = app.launch_target.path.as_deref();
        let fallback_launch_paths = app
            .sources
            .iter()
            .filter(|source| source.state == AppSourceState::Equivalent)
            .map(|source| source.absolute_path.clone())
            .filter(|path| Some(path.as_str()) != primary_path)
            .collect();
        Self {
            launch_target: app.launch_target,
            launch_args: app.launch_args,
            fallback_launch_paths,
        }
    }
}

impl From<SavedManualApp> for LaunchableApp {
    fn from(app: SavedManualApp) -> Self {
        let SavedManualApp {
            name: _validated_name,
            launch_target,
            launch_args,
        } = app;
        Self {
            launch_target,
            launch_args,
            fallback_launch_paths: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTargetCheckRequest {
    pub id: String,
    pub launch_target: LaunchTarget,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTargetCheckResult {
    pub id: String,
    pub status: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAppRequest {
    pub id: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LaunchFailureKind {
    Cancelled,
    AccessDenied,
    AppNotInstalled,
    BrokenShortcut,
    LayoutReadFailed,
    MissingLaunchInfo,
    NoAssociation,
    TargetNotFound,
    UnsupportedTarget,
    WindowsLaunchFailed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LaunchFailure {
    pub kind: LaunchFailureKind,
    pub detail: String,
}

impl LaunchFailure {
    pub fn new(kind: LaunchFailureKind, detail: String) -> Self {
        Self { kind, detail }
    }

    pub fn missing_launch_info(detail: String) -> Self {
        Self::new(LaunchFailureKind::MissingLaunchInfo, detail)
    }

    pub fn layout_read_failed(detail: String) -> Self {
        Self::new(LaunchFailureKind::LayoutReadFailed, detail)
    }

    pub fn from_launch_path_error(error: LaunchPathError) -> Self {
        let kind = match error.kind {
            LaunchPathErrorKind::Cancelled => LaunchFailureKind::Cancelled,
            LaunchPathErrorKind::AccessDenied => LaunchFailureKind::AccessDenied,
            LaunchPathErrorKind::BrokenShortcut => LaunchFailureKind::BrokenShortcut,
            LaunchPathErrorKind::NoAssociation => LaunchFailureKind::NoAssociation,
            LaunchPathErrorKind::TargetNotFound => LaunchFailureKind::TargetNotFound,
            #[cfg(not(target_os = "windows"))]
            LaunchPathErrorKind::UnsupportedPlatform => LaunchFailureKind::WindowsLaunchFailed,
            LaunchPathErrorKind::WindowsLaunchFailed => LaunchFailureKind::WindowsLaunchFailed,
        };
        Self::new(kind, error.detail)
    }

    pub fn from_app_activation_error(error: LaunchPathError) -> Self {
        let kind = match error.kind {
            LaunchPathErrorKind::Cancelled => LaunchFailureKind::Cancelled,
            LaunchPathErrorKind::AccessDenied => LaunchFailureKind::AccessDenied,
            LaunchPathErrorKind::BrokenShortcut => LaunchFailureKind::WindowsLaunchFailed,
            LaunchPathErrorKind::NoAssociation => LaunchFailureKind::WindowsLaunchFailed,
            LaunchPathErrorKind::TargetNotFound => LaunchFailureKind::AppNotInstalled,
            #[cfg(not(target_os = "windows"))]
            LaunchPathErrorKind::UnsupportedPlatform => LaunchFailureKind::WindowsLaunchFailed,
            LaunchPathErrorKind::WindowsLaunchFailed => LaunchFailureKind::WindowsLaunchFailed,
        };
        Self::new(kind, error.detail)
    }

    pub fn payload(&self) -> LaunchFailurePayload {
        LaunchFailurePayload {
            kind: self.kind_code().to_string(),
            detail: self.detail.clone(),
        }
    }

    pub fn kind_code(&self) -> &'static str {
        match self.kind {
            LaunchFailureKind::Cancelled => "cancelled",
            LaunchFailureKind::AccessDenied => "accessDenied",
            LaunchFailureKind::AppNotInstalled => "appNotInstalled",
            LaunchFailureKind::BrokenShortcut => "brokenShortcut",
            LaunchFailureKind::LayoutReadFailed => "layoutReadFailed",
            LaunchFailureKind::MissingLaunchInfo => "missingLaunchInfo",
            LaunchFailureKind::NoAssociation => "noAssociation",
            LaunchFailureKind::TargetNotFound => "targetNotFound",
            LaunchFailureKind::UnsupportedTarget => "unsupportedTarget",
            LaunchFailureKind::WindowsLaunchFailed => "windowsLaunchFailed",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchFailurePayload {
    pub kind: String,
    pub detail: String,
}

pub fn validate_launch_app_id(app_id: &str) -> Result<&str, LaunchFailure> {
    let app_id = app_id.trim();
    if app_id.is_empty() {
        return Err(LaunchFailure::missing_launch_info(
            "App id is required".to_string(),
        ));
    }
    Ok(app_id)
}

fn resolve_launchable_app(
    app_id: &str,
    catalog_app: Option<AppCatalogItem>,
    saved_layout: Option<&serde_json::Value>,
    find_catalog_app: impl FnOnce() -> Result<Option<AppCatalogItem>, String>,
) -> Result<LaunchableApp, LaunchFailure> {
    if let Some(app) = catalog_app {
        return Ok(app.into());
    }
    if let Some(app) = saved_layout.and_then(|layout| find_layout_manual_app(layout, app_id)) {
        return Ok(app.into());
    }
    find_catalog_app()
        .map_err(LaunchFailure::layout_read_failed)?
        .map(Into::into)
        .ok_or_else(|| LaunchFailure::missing_launch_info(format!("Unknown app id: {app_id}")))
}

fn resolve_launch_path(app: &LaunchableApp) -> Result<(String, Option<&str>), LaunchFailure> {
    let kind = app.launch_target.kind.as_str();
    if !matches!(kind, "executable" | "shortcut" | "url") {
        return Err(LaunchFailure::new(
            LaunchFailureKind::UnsupportedTarget,
            format!("Unsupported launch target kind: {kind}"),
        ));
    }

    let mut path = app
        .launch_target
        .path
        .as_ref()
        .filter(|path| !path.trim().is_empty())
        .cloned()
        .ok_or_else(|| LaunchFailure::missing_launch_info("App has no launch path".to_string()))?;
    if matches!(kind, "executable" | "shortcut") && !std::path::Path::new(&path).exists() {
        if let Some(fallback) = app
            .fallback_launch_paths
            .iter()
            .find(|fallback| std::path::Path::new(fallback).exists())
        {
            path = fallback.clone();
        } else {
            return Err(LaunchFailure::new(
                LaunchFailureKind::TargetNotFound,
                format!("Launch target does not exist: {path}"),
            ));
        }
    }

    let launch_args = if kind == "executable" {
        app.launch_args.as_deref()
    } else {
        None
    };
    Ok((path, launch_args))
}

fn launch_selected_app(app: LaunchableApp) -> Result<(), LaunchFailure> {
    if app.launch_target.kind == "appUserModelId" {
        let app_user_model_id = app
            .launch_target
            .app_user_model_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                LaunchFailure::missing_launch_info("App has no AppUserModelId".to_string())
            })?;
        return launch_app_user_model_id(app_user_model_id)
            .map_err(LaunchFailure::from_app_activation_error);
    }

    let (path, launch_args) = resolve_launch_path(&app)?;
    launch_path(&path, launch_args).map_err(LaunchFailure::from_launch_path_error)
}

pub fn launch_app(
    app_id: &str,
    catalog_app: Option<AppCatalogItem>,
    saved_layout: Option<&serde_json::Value>,
    resolve_icon_dir: impl FnOnce() -> Result<PathBuf, String>,
) -> Result<(), LaunchFailure> {
    let app_id = validate_launch_app_id(app_id)?;
    let selected = resolve_launchable_app(app_id, catalog_app, saved_layout, || {
        find_app_in_saved_scan_roots(saved_layout, app_id, resolve_icon_dir)
    })?;
    launch_selected_app(selected)
}

fn find_app_in_saved_scan_roots(
    saved_layout: Option<&serde_json::Value>,
    app_id: &str,
    resolve_icon_dir: impl FnOnce() -> Result<PathBuf, String>,
) -> Result<Option<AppCatalogItem>, String> {
    let Some((roots, filters)) = saved_scan_config(saved_layout) else {
        return Ok(None);
    };
    if roots.is_empty() {
        return Ok(None);
    }

    let icon_dir = resolve_icon_dir()?;
    Ok(scan_apps_from_roots(&roots, &icon_dir, &filters)?
        .apps
        .into_iter()
        .find(|app| app.id == app_id))
}

fn saved_scan_config(
    saved_layout: Option<&serde_json::Value>,
) -> Option<(Vec<ScanRoot>, ScanFilters)> {
    let settings = saved_layout?.get("settings")?;
    let roots = settings
        .get("scanRoots")
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();
    let filters = saved_scan_filters(settings);
    Some((roots, filters))
}

fn saved_scan_filters(settings: &serde_json::Value) -> ScanFilters {
    let mut value = serde_json::Map::new();
    value.insert(
        "keywordAllowlist".to_string(),
        settings
            .get("scanKeywordAllowlist")
            .cloned()
            .unwrap_or_else(|| serde_json::Value::Array(Vec::new())),
    );
    value.insert(
        "keywordBlacklist".to_string(),
        settings
            .get("scanKeywordBlacklist")
            .cloned()
            .unwrap_or_else(|| serde_json::Value::Array(Vec::new())),
    );
    value.insert(
        "appBlacklist".to_string(),
        settings
            .get("scanAppBlacklist")
            .cloned()
            .unwrap_or_else(|| serde_json::Value::Array(Vec::new())),
    );
    serde_json::from_value(serde_json::Value::Object(value)).unwrap_or_default()
}

pub fn check_launch_targets_sync(
    targets: Vec<LaunchTargetCheckRequest>,
) -> Result<Vec<LaunchTargetCheckResult>, String> {
    let needs_app_user_model_ids = targets
        .iter()
        .any(|target| target.launch_target.kind == "appUserModelId");
    let installed_app_user_model_ids = needs_app_user_model_ids
        .then(installed_app_user_model_ids_for_status)
        .transpose()?;

    Ok(targets
        .into_iter()
        .map(|target| LaunchTargetCheckResult {
            id: target.id,
            status: check_launch_target_status(
                &target.launch_target,
                installed_app_user_model_ids.as_ref(),
            ),
        })
        .collect())
}

#[cfg(target_os = "windows")]
fn installed_app_user_model_ids_for_status() -> Result<HashSet<String>, String> {
    crate::windows_app_catalog::installed_app_user_model_ids()
}

#[cfg(not(target_os = "windows"))]
fn installed_app_user_model_ids_for_status() -> Result<HashSet<String>, String> {
    Err("AppUserModelId status checks are only available on Windows".to_string())
}

fn check_launch_target_status(
    target: &LaunchTarget,
    installed_app_user_model_ids: Option<&HashSet<String>>,
) -> String {
    match target.kind.as_str() {
        "executable" | "shortcut" => match target.path.as_deref() {
            Some(path) if !path.trim().is_empty() && std::path::Path::new(path).exists() => {
                "ok".to_string()
            }
            _ => "missing".to_string(),
        },
        "appUserModelId" => {
            let Some(app_user_model_id) = target
                .app_user_model_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                return "missing".to_string();
            };
            installed_app_user_model_ids
                .map(|installed| {
                    if installed.contains(&app_user_model_id.to_lowercase()) {
                        "ok"
                    } else {
                        "missing"
                    }
                    .to_string()
                })
                .unwrap_or_else(|| "unknown".to_string())
        }
        "url" => "unknown".to_string(),
        _ => "unknown".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AppSource, AppSourceType, CatalogIdentityStatus};
    use serde_json::json;

    fn app_item(id: &str, path: &str) -> AppCatalogItem {
        AppCatalogItem {
            id: id.to_string(),
            item_type: "app".to_string(),
            name: id.to_string(),
            icon_path: None,
            emoji: None,
            launch_target: LaunchTarget {
                kind: "executable".to_string(),
                path: Some(path.to_string()),
                app_user_model_id: None,
            },
            launch_args: None,
            tracking_key: String::new(),
            identity_status: CatalogIdentityStatus::Unresolved,
            sources: Vec::new(),
        }
    }

    fn app_item_with_kind(id: &str, kind: &str, path: Option<&str>) -> AppCatalogItem {
        AppCatalogItem {
            id: id.to_string(),
            item_type: "app".to_string(),
            name: id.to_string(),
            icon_path: None,
            emoji: None,
            launch_target: LaunchTarget {
                kind: kind.to_string(),
                path: path.map(str::to_string),
                app_user_model_id: None,
            },
            launch_args: None,
            tracking_key: String::new(),
            identity_status: CatalogIdentityStatus::Unresolved,
            sources: Vec::new(),
        }
    }

    fn app_item_with_aumid(id: &str, app_user_model_id: Option<&str>) -> AppCatalogItem {
        AppCatalogItem {
            id: id.to_string(),
            item_type: "app".to_string(),
            name: id.to_string(),
            icon_path: None,
            emoji: None,
            launch_target: LaunchTarget {
                kind: "appUserModelId".to_string(),
                path: None,
                app_user_model_id: app_user_model_id.map(str::to_string),
            },
            launch_args: None,
            tracking_key: String::new(),
            identity_status: CatalogIdentityStatus::Unresolved,
            sources: Vec::new(),
        }
    }

    #[test]
    fn launch_request_only_accepts_the_stable_app_id() {
        let request: LaunchAppRequest = serde_json::from_value(json!({
            "id": "app",
            "name": "App",
            "launchTarget": {
                "kind": "executable",
                "path": "C:/Renderer/App.exe"
            },
            "launchArgs": "--profile dev"
        }))
        .expect("extra launch fields should be ignored");

        assert_eq!(request.id, "app");
    }

    #[test]
    fn catalog_launchable_keeps_current_catalog_launch_fields() {
        let selected = LaunchableApp::from(app_item("app", "C:/Current/App.exe"));

        assert_eq!(
            selected.launch_target.path.as_deref(),
            Some("C:/Current/App.exe")
        );
    }

    #[test]
    fn saved_scan_config_reads_saved_roots_and_filters() {
        let layout = json!({
            "settings": {
                "scanRoots": [
                    {
                        "id": "root",
                        "type": "customDirectory",
                        "label": "Tools",
                        "path": "C:/Tools",
                        "enabled": true
                    }
                ],
                "scanKeywordAllowlist": ["catalog-allowed"],
                "scanKeywordBlacklist": ["uninstall"],
                "scanAppBlacklist": [
                    {
                        "catalogId": "catalog-blocked",
                        "name": "Blocked"
                    }
                ]
            }
        });

        let (roots, filters) = saved_scan_config(Some(&layout)).expect("scan config");

        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].id, "root");
        assert_eq!(filters.keyword_allowlist, vec!["catalog-allowed"]);
        assert_eq!(filters.keyword_blacklist, vec!["uninstall"]);
        assert_eq!(filters.app_blacklist.len(), 1);
        assert_eq!(
            filters.app_blacklist[0].catalog_id.as_deref(),
            Some("catalog-blocked")
        );
    }

    #[test]
    fn launch_selected_app_rejects_missing_aumid_before_activation() {
        let error = launch_selected_app(app_item_with_aumid("app", None).into())
            .expect_err("missing AppUserModelIds should fail before activation");

        assert_eq!(error.kind, LaunchFailureKind::MissingLaunchInfo);
        let payload = error.payload();
        assert_eq!(payload.kind, "missingLaunchInfo");
        assert_eq!(payload.detail, "App has no AppUserModelId");
    }

    #[test]
    fn missing_app_activation_is_reported_as_uninstalled() {
        let error = LaunchFailure::from_app_activation_error(LaunchPathError {
            kind: LaunchPathErrorKind::TargetNotFound,
            detail: "not registered".to_string(),
        });

        assert_eq!(error.kind, LaunchFailureKind::AppNotInstalled);
        let payload = error.payload();
        assert_eq!(payload.kind, "appNotInstalled");
        assert_eq!(payload.detail, "not registered");
    }

    #[test]
    fn launch_cancellation_keeps_its_protocol_kind() {
        let cancelled = LaunchPathError {
            kind: LaunchPathErrorKind::Cancelled,
            detail: "cancelled by user".into(),
        };
        assert_eq!(
            LaunchFailure::from_launch_path_error(cancelled.clone())
                .payload()
                .kind,
            "cancelled"
        );
        assert_eq!(
            LaunchFailure::from_app_activation_error(cancelled)
                .payload()
                .kind,
            "cancelled"
        );
    }

    #[test]
    fn launch_selected_app_rejects_missing_local_path_before_shell() {
        let error = launch_selected_app(
            app_item_with_kind("app", "executable", Some("C:/Lumeria/Missing.exe")).into(),
        )
        .expect_err("missing local paths should fail before shell launch");

        assert_eq!(error.kind, LaunchFailureKind::TargetNotFound);
        let payload = error.payload();
        assert_eq!(payload.kind, "targetNotFound");
        assert!(payload.detail.contains("Missing.exe"));
    }

    #[test]
    fn resolve_launch_path_allows_urls_without_local_path_check() {
        let app = LaunchableApp::from(app_item_with_kind(
            "web-app",
            "url",
            Some("https://example.com/app"),
        ));

        let (path, launch_args) = resolve_launch_path(&app).expect("urls should be launchable");

        assert_eq!(path, "https://example.com/app");
        assert_eq!(launch_args, None);
    }

    #[test]
    fn resolve_launch_path_falls_back_only_to_equivalent_catalog_sources() {
        let base = std::env::temp_dir().join(format!(
            "lumeria-launch-fallback-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        std::fs::create_dir_all(&base).expect("create test directory");
        let missing_primary = base.join("missing-primary.lnk");
        let equivalent = base.join("equivalent.lnk");
        let shadowed = base.join("shadowed.lnk");
        std::fs::write(&equivalent, []).expect("create equivalent shortcut");
        std::fs::write(&shadowed, []).expect("create shadowed shortcut");
        let mut app = app_item("catalog-app", missing_primary.to_string_lossy().as_ref());
        app.sources = vec![
            AppSource {
                key: "primary".to_string(),
                source_type: AppSourceType::CustomDirectory,
                state: AppSourceState::Primary,
                root_id: "custom".to_string(),
                root_label: "Custom".to_string(),
                relative_path: "primary.lnk".to_string(),
                absolute_path: missing_primary.to_string_lossy().to_string(),
            },
            AppSource {
                key: "equivalent".to_string(),
                source_type: AppSourceType::StartMenuUser,
                state: AppSourceState::Equivalent,
                root_id: "user".to_string(),
                root_label: "User".to_string(),
                relative_path: "equivalent.lnk".to_string(),
                absolute_path: equivalent.to_string_lossy().to_string(),
            },
            AppSource {
                key: "shadowed".to_string(),
                source_type: AppSourceType::StartMenuSystem,
                state: AppSourceState::Shadowed,
                root_id: "system".to_string(),
                root_label: "System".to_string(),
                relative_path: "shadowed.lnk".to_string(),
                absolute_path: shadowed.to_string_lossy().to_string(),
            },
        ];

        let launchable = LaunchableApp::from(app);
        let (path, _) = resolve_launch_path(&launchable)
            .expect("equivalent source should keep the app launchable");

        assert_eq!(path, equivalent.to_string_lossy());
        std::fs::remove_file(&equivalent).expect("remove equivalent shortcut");
        let error = resolve_launch_path(&launchable)
            .expect_err("shadowed sources must not be launch fallbacks");
        assert_eq!(error.kind, LaunchFailureKind::TargetNotFound);
        std::fs::remove_dir_all(base).expect("remove test directory");
    }

    #[test]
    fn app_user_model_id_status_uses_installed_catalog() {
        let target = app_item_with_aumid("settings", Some("Example.Package_123!App")).launch_target;
        let installed = HashSet::from(["example.package_123!app".to_string()]);

        assert_eq!(check_launch_target_status(&target, Some(&installed)), "ok");
        assert_eq!(
            check_launch_target_status(&target, Some(&HashSet::new())),
            "missing"
        );
    }
}
