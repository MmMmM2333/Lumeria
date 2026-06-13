mod catalog;
mod file_dialog;
mod icons;
mod launcher;
mod layout_store;
mod live_desktop;
mod models;
mod path_utils;
mod tray;

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};

use catalog::{
    icon_cache_dir, icon_file_data_url, scan_apps_from_roots, stable_app_id, ScanAppsResult,
    ScanFilters, ScanRoot,
};
use file_dialog::{
    cached_background_image_data_url as load_native_cached_background_image_data_url,
    get_desktop_wallpaper_background as get_native_desktop_wallpaper_background,
    pick_background_image as pick_native_background_image,
    pick_launch_file as pick_native_launch_file,
    pick_scan_root_directory as pick_native_scan_root_directory, PickedBackgroundImage,
    PickedLaunchFile,
};
use icons::cache_app_icon_choices;
use launcher::{launch_path, LaunchPathError, LaunchPathErrorKind};
use layout_store::{
    find_layout_app, load_layout as load_saved_layout, save_layout as save_saved_layout,
};
use models::AppCatalogItem;
use serde::{Deserialize, Serialize};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
use tray::{
    disable_main_window_transitions, open_main_window, open_settings, refresh_main_window_effects,
    set_main_window_fullscreen, setup_tray, trigger_main_window_shortcut, CLOSE_DESKTOP_EVENT,
};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

const QUIT_REQUESTED_EVENT: &str = "launchpad-quit-requested";
const QUIT_FALLBACK_DELAY_MS: u64 = 15_000;
static QUIT_ACKNOWLEDGED: AtomicBool = AtomicBool::new(false);

#[cfg(all(target_os = "windows", debug_assertions))]
pub use icons::debug_extract_icon_png;

#[derive(Default)]
struct AppState {
    catalog: Mutex<HashMap<String, AppCatalogItem>>,
    live_desktop_runtime: Mutex<live_desktop::LiveDesktopRuntime>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppIconChoice {
    id: String,
    icon_path: String,
    icon_data_url: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedAppIconRequest {
    id: String,
    icon_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedAppIconResult {
    id: String,
    icon_data_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedCustomIconResult {
    icon_path: String,
    icon_data_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackgroundLayoutContext {
    monitor_physical_x: i32,
    monitor_physical_y: i32,
    monitor_physical_width: u32,
    monitor_physical_height: u32,
    monitor_scale_factor: f64,
    window_physical_x: i32,
    window_physical_y: i32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchTargetCheckRequest {
    id: String,
    launch_target: models::LaunchTarget,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchTargetCheckResult {
    id: String,
    status: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchAppRequest {
    id: String,
    name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchFailureReport {
    kind: String,
    title: String,
    message: String,
    suggestion: String,
    detail: String,
}

#[tauri::command]
fn scan_apps(
    app: AppHandle,
    state: State<'_, AppState>,
    roots: Vec<ScanRoot>,
    filters: Option<ScanFilters>,
) -> Result<ScanAppsResult, String> {
    let icon_dir = icon_cache_dir(&app)?;
    let filters = filters.unwrap_or_default();
    let result = scan_apps_from_roots(&roots, &icon_dir, &filters)?;
    let mut catalog = state
        .catalog
        .lock()
        .map_err(|_| "Failed to lock app catalog".to_string())?;
    catalog.clear();
    catalog.extend(result.apps.iter().cloned().map(|app| (app.id.clone(), app)));
    Ok(result)
}

#[tauri::command]
fn check_launch_targets(
    targets: Vec<LaunchTargetCheckRequest>,
) -> Result<Vec<LaunchTargetCheckResult>, String> {
    Ok(targets
        .into_iter()
        .map(|target| LaunchTargetCheckResult {
            id: target.id,
            status: check_launch_target_status(&target.launch_target),
        })
        .collect())
}

#[tauri::command]
fn load_layout(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let result = load_saved_layout(&app)?;
    if let Some(recovery) = result.recovery {
        let _ = app.emit("launchpad-layout-recovered", recovery);
    }
    Ok(result.layout)
}

#[tauri::command]
fn save_layout(app: AppHandle, layout: serde_json::Value) -> Result<(), String> {
    save_saved_layout(&app, &layout)
}

#[tauri::command]
fn pick_launch_file(app: AppHandle) -> Result<Option<PickedLaunchFile>, String> {
    pick_native_launch_file(&app)
}

#[tauri::command]
fn pick_background_image(app: AppHandle) -> Result<Option<PickedBackgroundImage>, String> {
    pick_native_background_image(&app)
}

#[tauri::command]
fn get_desktop_wallpaper_background(
    app: AppHandle,
) -> Result<Option<PickedBackgroundImage>, String> {
    get_native_desktop_wallpaper_background(&app)
}

#[tauri::command]
fn get_background_layout_context(
    app: AppHandle,
) -> Result<Option<BackgroundLayoutContext>, String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(None);
    };
    let Some(monitor) = window
        .current_monitor()
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let window_position = window.outer_position().map_err(|error| error.to_string())?;
    Ok(Some(BackgroundLayoutContext {
        monitor_physical_x: monitor_position.x,
        monitor_physical_y: monitor_position.y,
        monitor_physical_width: monitor_size.width,
        monitor_physical_height: monitor_size.height,
        monitor_scale_factor: monitor.scale_factor(),
        window_physical_x: window_position.x,
        window_physical_y: window_position.y,
    }))
}

#[tauri::command]
fn load_cached_background_image_data_url(
    app: AppHandle,
    image_path: String,
) -> Result<Option<String>, String> {
    load_native_cached_background_image_data_url(&app, &image_path)
}

#[tauri::command]
fn pick_scan_root_directory() -> Result<Option<String>, String> {
    pick_native_scan_root_directory()
}

#[tauri::command]
fn load_app_icon_choices(
    app: AppHandle,
    target_path: String,
) -> Result<Vec<AppIconChoice>, String> {
    let path = std::path::Path::new(target_path.trim());
    if path.as_os_str().is_empty() || !path.exists() {
        return Ok(Vec::new());
    }

    let icon_dir = icon_cache_dir(&app)?;
    let app_id = stable_app_id(&target_path);
    let choices = cache_app_icon_choices(path, &icon_dir, &app_id)?
        .into_iter()
        .enumerate()
        .filter_map(|(index, path)| {
            let icon_data_url = icon_file_data_url(path.to_str()?)?;
            Some(AppIconChoice {
                id: format!("{app_id}-icon-{index}"),
                icon_path: path.to_string_lossy().to_string(),
                icon_data_url,
            })
        })
        .collect();
    Ok(choices)
}

#[tauri::command]
fn cache_custom_icon(app: AppHandle, data_url: String) -> Result<CachedCustomIconResult, String> {
    let bytes = decode_custom_icon_data_url(&data_url)?;
    let hash = blake3::hash(&bytes);
    let hex = hash.to_hex();
    let icon_dir = icon_cache_dir(&app)?;
    let icon_path = icon_dir.join(format!("custom-icon-{}.png", &hex[..32]));
    if !icon_path.exists() {
        std::fs::write(&icon_path, &bytes).map_err(|error| {
            format!(
                "Failed to write custom icon {}: {error}",
                icon_path.display()
            )
        })?;
    }
    let icon_path = icon_path.to_string_lossy().to_string();
    let icon_data_url = icon_file_data_url(&icon_path)
        .ok_or_else(|| "Failed to read cached custom icon".to_string())?;
    Ok(CachedCustomIconResult {
        icon_path,
        icon_data_url,
    })
}

#[tauri::command]
fn load_cached_app_icons(
    app: AppHandle,
    icons: Vec<CachedAppIconRequest>,
) -> Result<Vec<CachedAppIconResult>, String> {
    let icon_dir = icon_cache_dir(&app)?;
    let canonical_icon_dir = icon_dir.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve icon cache directory {}: {error}",
            icon_dir.display()
        )
    })?;

    let results = icons
        .into_iter()
        .filter_map(|icon| {
            let path = std::path::PathBuf::from(icon.icon_path);
            let canonical_path = path.canonicalize().ok()?;
            if !canonical_path.starts_with(&canonical_icon_dir) {
                return None;
            }
            let icon_data_url = icon_file_data_url(canonical_path.to_str()?)?;
            Some(CachedAppIconResult {
                id: icon.id,
                icon_data_url,
            })
        })
        .collect();
    Ok(results)
}

#[tauri::command]
fn launch_app(
    app: AppHandle,
    request: LaunchAppRequest,
    state: State<'_, AppState>,
) -> Result<(), LaunchFailureReport> {
    launch_app_inner(&app, request, state).map_err(|error| error.report())
}

fn launch_app_inner(
    app_handle: &AppHandle,
    request: LaunchAppRequest,
    state: State<'_, AppState>,
) -> Result<(), LaunchFailure> {
    let app_id = request.id.trim().to_string();
    if app_id.is_empty() {
        return Err(LaunchFailure::missing_launch_info(
            request.name,
            "App id is required".to_string(),
        ));
    }

    let saved_layout = load_saved_layout(app_handle)
        .map(|result| result.layout)
        .map_err(|error| LaunchFailure::layout_read_failed(request.name.clone(), error))?;
    let saved_app = saved_layout
        .as_ref()
        .and_then(|layout| find_layout_app(layout, &app_id));
    let catalog_app = {
        let catalog = state.catalog.lock().map_err(|_| {
            LaunchFailure::layout_read_failed(
                request.name.clone(),
                "Failed to lock app catalog".to_string(),
            )
        })?;
        catalog.get(&app_id).cloned()
    };

    let app = match select_launch_app(catalog_app, saved_app) {
        Some(app) => app,
        None => find_app_in_saved_scan_roots(app_handle, saved_layout.as_ref(), &app_id)
            .map_err(|error| LaunchFailure::layout_read_failed(request.name.clone(), error))?
            .ok_or_else(|| {
                LaunchFailure::missing_launch_info(
                    request.name.clone(),
                    format!("Unknown app id: {app_id}"),
                )
            })?,
    };

    launch_selected_app(app)
}

#[tauri::command]
fn hide_main_window(app: AppHandle) {
    tray::hide_main_window(&app);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn confirm_quit_after_save(app: AppHandle, saved: bool) {
    if !saved {
        eprintln!("Quitting LaunchPad after layout save failed or was skipped");
    }
    QUIT_ACKNOWLEDGED.store(true, Ordering::Relaxed);
    app.exit(0);
}

#[tauri::command]
fn show_launch_error_message(report: LaunchFailureReport) {
    show_launch_error_report(&report);
}

#[tauri::command]
fn get_main_window_effects_support() -> tray::MainWindowEffectsSupport {
    tray::main_window_effects_support()
}

#[tauri::command]
fn get_live_desktop_background_support() -> live_desktop::LiveDesktopBackgroundSupport {
    live_desktop::live_desktop_background_support()
}

#[tauri::command]
fn get_live_desktop_runtime_status(
    state: State<'_, AppState>,
) -> Result<live_desktop::LiveDesktopRuntimeStatus, String> {
    let mut runtime = state
        .live_desktop_runtime
        .lock()
        .map_err(|_| "Failed to lock live desktop runtime".to_string())?;
    Ok(runtime.status())
}

#[tauri::command]
fn configure_live_desktop_background(
    state: State<'_, AppState>,
    config: live_desktop::LiveDesktopRuntimeConfig,
) -> Result<live_desktop::LiveDesktopRuntimeStatus, String> {
    let mut runtime = state
        .live_desktop_runtime
        .lock()
        .map_err(|_| "Failed to lock live desktop runtime".to_string())?;
    Ok(runtime.configure(config))
}

#[tauri::command]
fn start_live_desktop_background(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<live_desktop::LiveDesktopRuntimeStatus, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Failed to find main window for live desktop background".to_string())?;
    let window_handle = native_live_desktop_window_handle(&window)?;
    let requires_prepared_host = {
        let runtime = state
            .live_desktop_runtime
            .lock()
            .map_err(|_| "Failed to lock live desktop runtime".to_string())?;
        runtime.requires_main_thread_host_preparation()
    };
    let prepared_host = if requires_prepared_host {
        prepare_live_desktop_host_for_window(&window, window_handle)?
    } else {
        live_desktop::LiveDesktopPreparedHost::default()
    };
    let mut runtime = state
        .live_desktop_runtime
        .lock()
        .map_err(|_| "Failed to lock live desktop runtime".to_string())?;
    Ok(runtime.start_for_window(window_handle, prepared_host))
}

#[cfg(target_os = "windows")]
fn native_live_desktop_window_handle(
    window: &tauri::WebviewWindow,
) -> Result<live_desktop::LiveDesktopWindowHandle, String> {
    window.hwnd().map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
fn native_live_desktop_window_handle(
    _window: &tauri::WebviewWindow,
) -> Result<live_desktop::LiveDesktopWindowHandle, String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn prepare_live_desktop_host_for_window(
    window: &tauri::WebviewWindow,
    window_handle: live_desktop::LiveDesktopWindowHandle,
) -> Result<live_desktop::LiveDesktopPreparedHost, String> {
    if live_desktop::live_desktop_window_owned_by_current_thread(window_handle) {
        return live_desktop::prepare_live_desktop_child_host_for_window(window_handle);
    }

    let (sender, receiver) = std::sync::mpsc::channel();
    let window_handle_value = window_handle.0 as isize;
    window
        .run_on_main_thread(move || {
            let result = live_desktop::prepare_live_desktop_child_host_for_window(HWND(
                window_handle_value as _,
            ));
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
    receiver
        .recv_timeout(Duration::from_millis(3_000))
        .map_err(|error| {
            format!("Timed out preparing live desktop child host on window thread: {error}")
        })?
}

#[cfg(not(target_os = "windows"))]
fn prepare_live_desktop_host_for_window(
    _window: &tauri::WebviewWindow,
    window_handle: live_desktop::LiveDesktopWindowHandle,
) -> Result<live_desktop::LiveDesktopPreparedHost, String> {
    live_desktop::prepare_live_desktop_child_host_for_window(window_handle)
}

#[tauri::command]
fn stop_live_desktop_background(
    state: State<'_, AppState>,
) -> Result<live_desktop::LiveDesktopRuntimeStatus, String> {
    let mut runtime = state
        .live_desktop_runtime
        .lock()
        .map_err(|_| "Failed to lock live desktop runtime".to_string())?;
    Ok(runtime.stop())
}

#[tauri::command]
fn set_live_desktop_background_visible(
    state: State<'_, AppState>,
    visible: bool,
) -> Result<live_desktop::LiveDesktopRuntimeStatus, String> {
    let mut runtime = state
        .live_desktop_runtime
        .lock()
        .map_err(|_| "Failed to lock live desktop runtime".to_string())?;
    Ok(runtime.set_visible(visible))
}

#[tauri::command]
fn set_main_window_effects_enabled(
    app: AppHandle,
    enabled: bool,
    open_sequence: Option<u64>,
    material: Option<String>,
    appearance: Option<String>,
) -> Result<(), String> {
    tray::set_main_window_effects_enabled(
        &app,
        enabled,
        open_sequence,
        material.as_deref(),
        appearance.as_deref(),
    )
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum LaunchFailureKind {
    AccessDenied,
    BrokenShortcut,
    LayoutReadFailed,
    MissingLaunchInfo,
    NoAssociation,
    TargetNotFound,
    UnsupportedTarget,
    WindowsLaunchFailed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct LaunchFailure {
    app_name: String,
    kind: LaunchFailureKind,
    detail: String,
}

impl LaunchFailure {
    fn new(app_name: impl Into<String>, kind: LaunchFailureKind, detail: String) -> Self {
        Self {
            app_name: normalize_launch_app_name(app_name.into()),
            kind,
            detail,
        }
    }

    fn missing_launch_info(app_name: impl Into<String>, detail: String) -> Self {
        Self::new(app_name, LaunchFailureKind::MissingLaunchInfo, detail)
    }

    fn layout_read_failed(app_name: impl Into<String>, detail: String) -> Self {
        Self::new(app_name, LaunchFailureKind::LayoutReadFailed, detail)
    }

    fn from_launch_path_error(app_name: impl Into<String>, error: LaunchPathError) -> Self {
        let kind = match error.kind {
            LaunchPathErrorKind::AccessDenied => LaunchFailureKind::AccessDenied,
            LaunchPathErrorKind::BrokenShortcut => LaunchFailureKind::BrokenShortcut,
            LaunchPathErrorKind::NoAssociation => LaunchFailureKind::NoAssociation,
            LaunchPathErrorKind::TargetNotFound => LaunchFailureKind::TargetNotFound,
            #[cfg(not(target_os = "windows"))]
            LaunchPathErrorKind::UnsupportedPlatform => LaunchFailureKind::WindowsLaunchFailed,
            LaunchPathErrorKind::WindowsLaunchFailed => LaunchFailureKind::WindowsLaunchFailed,
        };
        Self::new(app_name, kind, error.detail)
    }

    fn report(&self) -> LaunchFailureReport {
        let name = &self.app_name;
        let (reason, suggestion) = match self.kind {
            LaunchFailureKind::AccessDenied => (
                "没有权限打开此应用。",
                "请检查文件权限，或尝试以管理员身份运行目标程序。",
            ),
            LaunchFailureKind::BrokenShortcut => (
                "这个快捷方式可能已损坏。",
                "请在 LaunchPad 中重新选择快捷方式或目标程序。",
            ),
            LaunchFailureKind::LayoutReadFailed => (
                "LaunchPad 无法读取此应用的保存信息。",
                "请重新扫描应用，或重新添加此应用。",
            ),
            LaunchFailureKind::MissingLaunchInfo => (
                "启动路径不完整，无法打开。",
                "请在 LaunchPad 中重新选择启动文件。",
            ),
            LaunchFailureKind::NoAssociation => (
                "系统没有可用于打开此目标的默认应用。",
                "请检查默认浏览器或文件关联设置。",
            ),
            LaunchFailureKind::TargetNotFound => (
                "找不到启动文件。它可能已被移动、删除或卸载。",
                "请在 LaunchPad 中编辑此应用的启动路径。",
            ),
            LaunchFailureKind::UnsupportedTarget => {
                ("暂不支持这种启动类型。", "请改用本地程序、快捷方式或链接。")
            }
            LaunchFailureKind::WindowsLaunchFailed => (
                "Windows 未能打开此应用。",
                "请确认目标程序可以从资源管理器正常打开。",
            ),
        };
        LaunchFailureReport {
            kind: self.kind_code().to_string(),
            title: "无法打开应用".to_string(),
            message: format!("无法打开“{name}”。\n\n{reason}"),
            suggestion: suggestion.to_string(),
            detail: self.detail.clone(),
        }
    }

    fn kind_code(&self) -> &'static str {
        match self.kind {
            LaunchFailureKind::AccessDenied => "accessDenied",
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

fn normalize_launch_app_name(name: String) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        "此应用".to_string()
    } else {
        trimmed.to_string()
    }
}

fn resolve_launch_path(app: &AppCatalogItem) -> Result<(String, Option<&str>), LaunchFailure> {
    let kind = app.launch_target.kind.as_str();
    if kind == "appUserModelId" {
        return Err(LaunchFailure::new(
            app.name.clone(),
            LaunchFailureKind::UnsupportedTarget,
            "AppUserModelId launch targets are not supported yet".to_string(),
        ));
    }
    if !matches!(kind, "executable" | "shortcut" | "url") {
        return Err(LaunchFailure::new(
            app.name.clone(),
            LaunchFailureKind::UnsupportedTarget,
            format!("Unsupported launch target kind: {kind}"),
        ));
    }

    let path = app
        .launch_target
        .path
        .as_ref()
        .filter(|path| !path.trim().is_empty())
        .cloned()
        .ok_or_else(|| {
            LaunchFailure::missing_launch_info(
                app.name.clone(),
                "App has no launch path".to_string(),
            )
        })?;
    if matches!(kind, "executable" | "shortcut") && !std::path::Path::new(&path).exists() {
        return Err(LaunchFailure::new(
            app.name.clone(),
            LaunchFailureKind::TargetNotFound,
            format!("Launch target does not exist: {path}"),
        ));
    }

    let launch_args = if kind == "executable" {
        app.launch_args.as_deref()
    } else {
        None
    };
    Ok((path, launch_args))
}

fn launch_selected_app(app: AppCatalogItem) -> Result<(), LaunchFailure> {
    let (path, launch_args) = resolve_launch_path(&app)?;
    launch_path(&path, launch_args)
        .map_err(|error| LaunchFailure::from_launch_path_error(app.name, error))
}

#[cfg(target_os = "windows")]
fn show_launch_error_report(report: &LaunchFailureReport) {
    use windows::{
        core::HSTRING,
        Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND},
    };

    let body = format!("{}\n\n建议：{}", report.message, report.suggestion);
    let message = HSTRING::from(body);
    let title = HSTRING::from(report.title.as_str());
    unsafe {
        let _ = MessageBoxW(
            None,
            &message,
            &title,
            MB_OK | MB_ICONERROR | MB_SETFOREGROUND,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_launch_error_report(report: &LaunchFailureReport) {
    eprintln!("{}\n\n建议：{}", report.message, report.suggestion);
}

fn find_app_in_saved_scan_roots(
    app: &AppHandle,
    saved_layout: Option<&serde_json::Value>,
    app_id: &str,
) -> Result<Option<AppCatalogItem>, String> {
    let Some((roots, filters)) = saved_scan_config(saved_layout) else {
        return Ok(None);
    };
    if roots.is_empty() {
        return Ok(None);
    }

    let icon_dir = icon_cache_dir(app)?;
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

fn select_launch_app(
    catalog_app: Option<AppCatalogItem>,
    saved_app: Option<AppCatalogItem>,
) -> Option<AppCatalogItem> {
    match (catalog_app, saved_app) {
        (Some(mut catalog), Some(saved)) => {
            catalog.launch_target = saved.launch_target;
            catalog.launch_args = saved.launch_args;
            Some(catalog)
        }
        (Some(catalog), None) => Some(catalog),
        (None, Some(saved)) => Some(saved),
        (None, None) => None,
    }
}

fn check_launch_target_status(target: &models::LaunchTarget) -> String {
    match target.kind.as_str() {
        "executable" | "shortcut" => match target.path.as_deref() {
            Some(path) if !path.trim().is_empty() && std::path::Path::new(path).exists() => {
                "ok".to_string()
            }
            _ => "missing".to_string(),
        },
        "url" | "appUserModelId" => "unknown".to_string(),
        _ => "unknown".to_string(),
    }
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    setup_tray(app)?;
    if let Err(error) = set_main_window_fullscreen(app.handle()) {
        eprintln!("Failed to fullscreen LaunchPad window: {error}");
    }
    if let Err(error) = disable_main_window_transitions(app.handle()) {
        eprintln!("Failed to disable LaunchPad window transitions: {error}");
    }
    setup_global_shortcuts(app);
    Ok(())
}

fn setup_global_shortcuts(app: &mut tauri::App) {
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcut("alt+space")
        .map(|builder| {
            builder.with_handler(|app, shortcut, event| {
                if event.state == ShortcutState::Pressed
                    && shortcut.matches(Modifiers::ALT, Code::Space)
                {
                    trigger_main_window_shortcut(app);
                }
            })
        });

    let plugin = match plugin {
        Ok(plugin) => plugin.build(),
        Err(error) => {
            eprintln!("Failed to create LaunchPad shortcut: {error}");
            return;
        }
    };

    if let Err(error) = app.handle().plugin(plugin) {
        eprintln!("Failed to register LaunchPad shortcut Alt+Space: {error}");
    }
}

fn request_app_quit(app: &AppHandle) {
    QUIT_ACKNOWLEDGED.store(false, Ordering::Relaxed);
    let _ = app.emit(QUIT_REQUESTED_EVENT, ());
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(QUIT_FALLBACK_DELAY_MS));
        if !QUIT_ACKNOWLEDGED.load(Ordering::Relaxed) {
            eprintln!("LaunchPad quit request timed out; forcing exit");
            app.exit(0);
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(setup_app)
        .on_menu_event(|app, event| {
            if event.id() == "show" {
                open_main_window(app);
            } else if event.id() == "settings" {
                open_settings(app);
            } else if event.id() == "quit" {
                request_app_quit(app);
            }
        })
        .on_tray_icon_event(|app, event| match event {
            TrayIconEvent::Click {
                button,
                button_state,
                ..
            } if button == MouseButton::Left && button_state == MouseButtonState::Up => {
                open_main_window(app);
            }
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                open_main_window(app);
            }
            _ => {}
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.emit(CLOSE_DESKTOP_EVENT, ());
            }
            WindowEvent::Focused(true) => refresh_main_window_effects(window.app_handle()),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            scan_apps,
            load_layout,
            save_layout,
            pick_launch_file,
            pick_background_image,
            get_desktop_wallpaper_background,
            get_background_layout_context,
            load_cached_background_image_data_url,
            pick_scan_root_directory,
            load_app_icon_choices,
            cache_custom_icon,
            load_cached_app_icons,
            check_launch_targets,
            launch_app,
            hide_main_window,
            confirm_quit_after_save,
            show_launch_error_message,
            quit_app,
            get_main_window_effects_support,
            get_live_desktop_background_support,
            get_live_desktop_runtime_status,
            configure_live_desktop_background,
            start_live_desktop_background,
            stop_live_desktop_background,
            set_live_desktop_background_visible,
            set_main_window_effects_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}

const CUSTOM_ICON_DATA_URL_PREFIX: &str = "data:image/png;base64,";
const MAX_CUSTOM_ICON_DATA_URL_LENGTH: usize = 1_400_000;
const MAX_CUSTOM_ICON_BYTES: usize = 1_048_576;

fn decode_custom_icon_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let trimmed = data_url.trim();
    if trimmed.len() > MAX_CUSTOM_ICON_DATA_URL_LENGTH {
        return Err("Custom icon data URL is too large".to_string());
    }
    let encoded = trimmed
        .strip_prefix(CUSTOM_ICON_DATA_URL_PREFIX)
        .ok_or_else(|| "Custom icons must be PNG data URLs".to_string())?;
    let bytes = decode_base64(encoded)?;
    if bytes.len() > MAX_CUSTOM_ICON_BYTES {
        return Err("Custom icon image is too large".to_string());
    }
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Custom icon data is not a PNG image".to_string());
    }
    Ok(bytes)
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let mut buffer = 0u32;
    let mut bits = 0u8;
    let mut data_chars = 0usize;
    let mut padding_count = 0usize;
    let mut padding_started = false;

    for byte in input.bytes() {
        let value = match byte {
            b'A'..=b'Z' => Some(byte - b'A'),
            b'a'..=b'z' => Some(byte - b'a' + 26),
            b'0'..=b'9' => Some(byte - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            b'=' => {
                padding_started = true;
                padding_count += 1;
                if padding_count > 2 {
                    return Err("Custom icon data URL has invalid base64 padding".to_string());
                }
                None
            }
            b'\r' | b'\n' | b'\t' | b' ' => None,
            _ => return Err("Custom icon data URL has invalid base64".to_string()),
        };

        let Some(value) = value else {
            continue;
        };
        if padding_started {
            return Err("Custom icon data URL has invalid base64 padding".to_string());
        }
        data_chars += 1;
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    if data_chars % 4 == 1 {
        return Err("Custom icon data URL has invalid base64 length".to_string());
    }
    if padding_count > 0 {
        let expected_padding = match data_chars % 4 {
            2 => 2,
            3 => 1,
            _ => return Err("Custom icon data URL has invalid base64 padding".to_string()),
        };
        if padding_count != expected_padding {
            return Err("Custom icon data URL has invalid base64 padding".to_string());
        }
    }
    if bits > 0 && buffer != 0 {
        return Err("Custom icon data URL has invalid base64 trailing bits".to_string());
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::LaunchTarget;
    use serde_json::json;

    fn app_item(id: &str, path: &str) -> AppCatalogItem {
        AppCatalogItem {
            id: id.to_string(),
            item_type: "app".to_string(),
            name: id.to_string(),
            icon_path: None,
            icon_data_url: None,
            emoji: None,
            launch_target: LaunchTarget {
                kind: "executable".to_string(),
                path: Some(path.to_string()),
                app_user_model_id: None,
            },
            launch_args: None,
            source_key: None,
            source: None,
        }
    }

    fn app_item_with_kind(id: &str, kind: &str, path: Option<&str>) -> AppCatalogItem {
        AppCatalogItem {
            id: id.to_string(),
            item_type: "app".to_string(),
            name: id.to_string(),
            icon_path: None,
            icon_data_url: None,
            emoji: None,
            launch_target: LaunchTarget {
                kind: kind.to_string(),
                path: path.map(str::to_string),
                app_user_model_id: None,
            },
            launch_args: None,
            source_key: None,
            source: None,
        }
    }

    #[test]
    fn launch_request_ignores_renderer_launch_fields() {
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
        assert_eq!(request.name, "App");
    }

    #[test]
    fn select_launch_app_uses_saved_launch_fields_over_catalog() {
        let selected = select_launch_app(
            Some(app_item("app", "C:/Current/App.exe")),
            Some(app_item("app", "C:/Saved/App.exe")),
        )
        .expect("app should be selected");

        assert_eq!(
            selected.launch_target.path.as_deref(),
            Some("C:/Saved/App.exe")
        );
    }

    #[test]
    fn select_launch_app_falls_back_to_saved_layout() {
        let selected = select_launch_app(None, Some(app_item("app", "C:/Saved/App.exe")))
            .expect("saved app should be selected");

        assert_eq!(
            selected.launch_target.path.as_deref(),
            Some("C:/Saved/App.exe")
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
                "scanKeywordBlacklist": ["uninstall"],
                "scanAppBlacklist": [
                    {
                        "sourceKey": "scan-root:root:blocked.lnk",
                        "path": "C:/Tools/Blocked.lnk",
                        "name": "Blocked"
                    }
                ]
            }
        });

        let (roots, filters) = saved_scan_config(Some(&layout)).expect("scan config");

        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].id, "root");
        assert_eq!(filters.keyword_blacklist, vec!["uninstall"]);
        assert_eq!(filters.app_blacklist.len(), 1);
        assert_eq!(
            filters.app_blacklist[0].source_key.as_deref(),
            Some("scan-root:root:blocked.lnk")
        );
    }

    #[test]
    fn launch_selected_app_rejects_unsupported_target_before_shell() {
        let error = launch_selected_app(app_item_with_kind("app", "appUserModelId", None))
            .expect_err("unsupported targets should fail before shell launch");

        assert_eq!(error.kind, LaunchFailureKind::UnsupportedTarget);
        let report = error.report();
        assert!(report.message.contains("暂不支持"));
        assert!(report.suggestion.contains("改用"));
    }

    #[test]
    fn launch_selected_app_rejects_missing_local_path_before_shell() {
        let error = launch_selected_app(app_item_with_kind(
            "app",
            "executable",
            Some("C:/LaunchPad/Missing.exe"),
        ))
        .expect_err("missing local paths should fail before shell launch");

        assert_eq!(error.kind, LaunchFailureKind::TargetNotFound);
        let report = error.report();
        assert!(report.message.contains("找不到启动文件"));
        assert!(report.suggestion.contains("编辑"));
    }

    #[test]
    fn resolve_launch_path_allows_urls_without_local_path_check() {
        let app = app_item_with_kind("web-app", "url", Some("https://example.com/app"));

        let (path, launch_args) = resolve_launch_path(&app).expect("urls should be launchable");

        assert_eq!(path, "https://example.com/app");
        assert_eq!(launch_args, None);
    }

    #[test]
    fn decode_custom_icon_accepts_png_data_urls() {
        let bytes = decode_custom_icon_data_url("data:image/png;base64,iVBORw0KGgo=")
            .expect("png data url should decode");

        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
    }

    #[test]
    fn decode_custom_icon_rejects_non_png_data_urls() {
        let error = decode_custom_icon_data_url("data:image/jpeg;base64,abcd")
            .expect_err("non-png data urls should fail");

        assert!(error.contains("PNG"));
    }

    #[test]
    fn decode_base64_rejects_invalid_length() {
        let error = decode_base64("A").expect_err("single base64 sextet should fail");

        assert!(error.contains("length"));
    }

    #[test]
    fn decode_base64_rejects_invalid_padding() {
        let error = decode_base64("AAAA=").expect_err("unexpected padding should fail");

        assert!(error.contains("padding"));
    }

    #[test]
    fn decode_base64_rejects_non_zero_trailing_bits() {
        let error = decode_base64("AB==").expect_err("non-zero trailing bits should fail");

        assert!(error.contains("trailing bits"));
    }
}
