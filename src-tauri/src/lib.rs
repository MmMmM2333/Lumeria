mod autostart;
mod catalog;
mod dwm;
mod encoding;
mod file_dialog;
mod i18n;
mod icons;
mod launcher;
mod launchpad_icon;
mod layout_store;
mod live_desktop;
mod main_window_supervisor;
mod models;
mod native_error;
mod path_utils;
mod startup;
mod tray;
mod window_effects;
#[cfg(target_os = "windows")]
mod windows_app_catalog;
mod windows_com;
#[cfg(target_os = "windows")]
mod windows_shell_link;

use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};

use autostart::{get_autostart_status, set_autostart_enabled};
use catalog::{
    icon_cache_dir, icon_file_data_url, scan_apps_from_roots, stable_app_id, ScanAppsResult,
    ScanFilters, ScanRoot,
};
use encoding::{cache_content_addressed, decode_base64, PNG_SIGNATURE};
use file_dialog::{
    cached_background_image_data_url as load_native_cached_background_image_data_url,
    get_desktop_wallpaper_background as get_native_desktop_wallpaper_background,
    pick_background_image as pick_native_background_image,
    pick_launch_file as pick_native_launch_file,
    pick_scan_root_directory as pick_native_scan_root_directory, PickedBackgroundImage,
    PickedLaunchFile,
};
use icons::cache_app_icon_choices;
use launcher::{launch_app_user_model_id, launch_path, LaunchPathError, LaunchPathErrorKind};
use launchpad_icon::LaunchpadIconVariant;
use layout_store::{
    find_layout_manual_app, load_layout as load_saved_layout, load_startup_layout_preferences,
    save_layout as save_saved_layout, SavedManualApp,
};
use main_window_supervisor::{
    apply_main_window_mode, disable_main_window_transitions, open_main_window, open_settings,
    refresh_main_window_effects, reveal_main_window as reveal_supervised_main_window,
    trigger_main_window_shortcut, CLOSE_DESKTOP_EVENT,
};
use models::{AppCatalogItem, AppSourceState};
use native_error::NativeError;
use serde::{Deserialize, Serialize};
use startup::{get_launch_context, LaunchContext};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    webview::PageLoadEvent,
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tray::{setup_tray, update_tray_menu};

const QUIT_REQUESTED_EVENT: &str = "lumeria-quit-requested";
const MAIN_WINDOW_SHORTCUT_CAPTURED_EVENT: &str = "lumeria-main-window-shortcut-captured";
const QUIT_FALLBACK_DELAY_MS: u64 = 15_000;
const DEFAULT_MAIN_WINDOW_SHORTCUT: &str = "alt+space";

#[cfg(all(target_os = "windows", debug_assertions))]
const WEBVIEW2_REMOTE_DEBUGGING_ARGS: &str =
    "--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222";

static QUIT_ACKNOWLEDGED: AtomicBool = AtomicBool::new(false);
static RESTART_AFTER_QUIT_ACKNOWLEDGEMENT: AtomicBool = AtomicBool::new(false);

#[cfg(all(target_os = "windows", debug_assertions))]
pub use icons::debug_extract_icon_png;

#[derive(Default)]
struct AppState {
    catalog: Mutex<HashMap<String, AppCatalogItem>>,
    live_desktop_runtime: Mutex<live_desktop::LiveDesktopRuntime>,
    launchpad_icon_variant: Mutex<LaunchpadIconVariant>,
    locale_state: Mutex<i18n::LocaleState>,
    main_window_shortcut: Mutex<Option<String>>,
    main_window_shortcut_capture_active: AtomicBool,
}

fn locale_state_lock(
    state: &AppState,
) -> Result<std::sync::MutexGuard<'_, i18n::LocaleState>, String> {
    state
        .locale_state
        .lock()
        .map_err(|_| "App locale state lock is poisoned".to_string())
}

fn launchpad_icon_variant_lock(
    state: &AppState,
) -> Result<std::sync::MutexGuard<'_, LaunchpadIconVariant>, String> {
    state
        .launchpad_icon_variant
        .lock()
        .map_err(|_| "Launchpad icon state lock is poisoned".to_string())
}

fn initial_presentation_state(app: &AppHandle) -> (i18n::LocaleState, LaunchpadIconVariant) {
    let (preference, launchpad_icon_variant, mut load_issue) = match load_startup_layout_preferences(
        app,
    ) {
        Ok(Some(preferences)) => (
            preferences.locale_preference,
            preferences.launchpad_icon_variant,
            None,
        ),
        Ok(None) => (
            i18n::DEFAULT_LOCALE_PREFERENCE.to_string(),
            LaunchpadIconVariant::default(),
            None,
        ),
        Err(error) => {
            log::error!(target: "layout_store", "Failed to load validated startup layout preferences: {error}");
            (
                i18n::DEFAULT_LOCALE_PREFERENCE.to_string(),
                LaunchpadIconVariant::default(),
                Some(i18n::LocaleIssue {
                    code: "preferenceLoadFailed".to_string(),
                    value: "layout".to_string(),
                }),
            )
        }
    };
    let system_languages = match i18n::system_ui_languages() {
        Ok(languages) => languages,
        Err(error) => {
            log::warn!(target: "i18n", "Failed to resolve system UI languages: {error}");
            if load_issue.is_none() {
                load_issue = Some(i18n::LocaleIssue {
                    code: "systemLocaleUnavailable".to_string(),
                    value: "windows".to_string(),
                });
            }
            Vec::new()
        }
    };
    let mut locale_state = i18n::resolve_locale_preference(&preference, &system_languages);
    if load_issue.is_some() {
        locale_state.issue = load_issue;
    }
    (locale_state, launchpad_icon_variant)
}

#[tauri::command]
fn get_app_locale_state(state: State<'_, AppState>) -> Result<i18n::LocaleState, String> {
    Ok(locale_state_lock(&state)?.clone())
}

#[tauri::command]
fn apply_app_locale_preference(
    app: AppHandle,
    state: State<'_, AppState>,
    preference: String,
) -> Result<i18n::LocaleState, String> {
    let preference = i18n::validate_locale_preference(&preference)?;
    let system_languages = i18n::system_ui_languages()?;
    let next = i18n::resolve_locale_preference(&preference, &system_languages);
    update_tray_menu(&app, &next.resolved_locale)
        .map_err(|error| format!("Failed to apply localized tray menu: {error}"))?;
    *locale_state_lock(&state)? = next.clone();
    Ok(next)
}

pub(crate) fn current_app_locale(app: &AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let locale = locale_state_lock(&state)?.resolved_locale.clone();
    Ok(locale)
}

#[derive(Clone, Debug)]
struct LaunchableApp {
    launch_target: models::LaunchTarget,
    launch_args: Option<String>,
    fallback_launch_paths: Vec<String>,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppIconChoice {
    id: String,
    icon_path: String,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchFailurePayload {
    kind: String,
    detail: String,
}

#[tauri::command]
async fn scan_apps(
    app: AppHandle,
    roots: Vec<ScanRoot>,
    filters: Option<ScanFilters>,
) -> Result<ScanAppsResult, String> {
    let icon_dir = icon_cache_dir(&app)?;
    let filters = filters.unwrap_or_default();
    let result = tauri::async_runtime::spawn_blocking(move || {
        scan_apps_from_roots(&roots, &icon_dir, &filters)
    })
    .await
    .map_err(|error| format!("App scan worker failed: {error}"))??;
    let state = app.state::<AppState>();
    let mut catalog = state
        .catalog
        .lock()
        .map_err(|_| "Failed to lock app catalog".to_string())?;
    catalog.clear();
    catalog.extend(result.apps.iter().cloned().map(|app| (app.id.clone(), app)));
    Ok(result)
}

#[tauri::command]
async fn check_launch_targets(
    targets: Vec<LaunchTargetCheckRequest>,
) -> Result<Vec<LaunchTargetCheckResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|error| format!("Launch target status worker failed: {error}"))?
}

#[tauri::command]
fn load_layout(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    load_saved_layout(&app)
}

#[tauri::command]
fn save_layout(app: AppHandle, layout: serde_json::Value) -> Result<(), String> {
    save_saved_layout(&app, &layout)
}

#[tauri::command]
async fn pick_launch_file(app: AppHandle) -> Result<Option<PickedLaunchFile>, String> {
    pick_native_launch_file(app).await
}

#[tauri::command]
async fn pick_background_image(app: AppHandle) -> Result<Option<PickedBackgroundImage>, String> {
    pick_native_background_image(app).await
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
        .map_err(|source| NativeError::Tauri {
            context: "current_monitor",
            source,
        })
        .map_err(String::from)?
    else {
        return Ok(None);
    };
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let window_position = window
        .outer_position()
        .map_err(|source| NativeError::Tauri {
            context: "outer_position",
            source,
        })
        .map_err(String::from)?;
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
async fn pick_scan_root_directory(app: AppHandle) -> Result<Option<String>, String> {
    pick_native_scan_root_directory(app).await
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
    let icon_dir = icon_cache_dir(&app)?;
    let icon_path =
        cache_content_addressed(&icon_dir, "custom-icon", "png", &bytes).map_err(|error| {
            format!(
                "Failed to write custom icon {}: {error}",
                error.path().display(),
                error = error.source()
            )
        })?;
    let icon_path = icon_path.to_string_lossy().to_string();
    let icon_data_url = icon_file_data_url(&icon_path)
        .ok_or_else(|| "Failed to read cached custom icon".to_string())?;
    Ok(CachedCustomIconResult {
        icon_path,
        icon_data_url,
    })
}

#[tauri::command]
async fn launch_app(app: AppHandle, request: LaunchAppRequest) -> Result<(), LaunchFailurePayload> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        launch_app_inner(&app, request, &state)
    })
    .await
    .map_err(|error| {
        LaunchFailure::new(
            LaunchFailureKind::WindowsLaunchFailed,
            format!("App launch worker failed: {error}"),
        )
        .payload()
    })?;
    result.map_err(|error| error.payload())
}

fn launch_app_inner(
    app_handle: &AppHandle,
    request: LaunchAppRequest,
    state: &AppState,
) -> Result<(), LaunchFailure> {
    let app_id = request.id.trim().to_string();
    if app_id.is_empty() {
        return Err(LaunchFailure::missing_launch_info(
            "App id is required".to_string(),
        ));
    }

    let catalog_app = {
        let catalog = state.catalog.lock().map_err(|_| {
            LaunchFailure::layout_read_failed("Failed to lock app catalog".to_string())
        })?;
        catalog.get(&app_id).cloned()
    };
    if let Some(app) = catalog_app {
        return launch_selected_app(app.into());
    }

    let saved_layout = load_saved_layout(app_handle).map_err(LaunchFailure::layout_read_failed)?;
    if let Some(manual_app) = saved_layout
        .as_ref()
        .and_then(|layout| find_layout_manual_app(layout, &app_id))
    {
        return launch_selected_app(manual_app.into());
    }
    let app = find_app_in_saved_scan_roots(app_handle, saved_layout.as_ref(), &app_id)
        .map_err(LaunchFailure::layout_read_failed)?
        .ok_or_else(|| LaunchFailure::missing_launch_info(format!("Unknown app id: {app_id}")))?;

    launch_selected_app(app.into())
}

#[tauri::command]
fn begin_main_window_close(
    app: AppHandle,
    open_sequence: u64,
) -> Result<main_window_supervisor::MainWindowCloseTransition, String> {
    main_window_supervisor::begin_main_window_close(&app, open_sequence)
}

#[tauri::command]
fn hide_main_window(app: AppHandle, generation: u64) -> Result<bool, String> {
    main_window_supervisor::hide_main_window(&app, generation)
}

#[tauri::command]
fn complete_renderer_startup(
    app: AppHandle,
    launch_context: State<'_, LaunchContext>,
) -> Result<(), String> {
    main_window_supervisor::complete_renderer_startup(&app, launch_context.origin)
}

#[tauri::command]
fn reveal_main_window(app: AppHandle, open_sequence: u64) -> Result<bool, String> {
    reveal_supervised_main_window(&app, open_sequence)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    finish_app_termination(&app, false);
}

#[tauri::command]
fn confirm_quit_after_save(app: AppHandle, saved: bool) {
    if !saved {
        log::warn!(target: "lumeria", "Terminating Lumeria after layout save failed or was skipped");
    }
    QUIT_ACKNOWLEDGED.store(true, Ordering::Relaxed);
    let restart = RESTART_AFTER_QUIT_ACKNOWLEDGEMENT.swap(false, Ordering::Relaxed);
    finish_app_termination(&app, restart);
}

fn finish_app_termination(app: &AppHandle, restart: bool) {
    main_window_supervisor::prepare_for_app_termination();
    if restart {
        app.request_restart();
    } else {
        app.exit(0);
    }
}

#[tauri::command]
fn show_launch_error_message(app: AppHandle, report: LaunchFailureReport) -> Result<(), String> {
    let locale = current_app_locale(&app)?;
    show_launch_error_report(&report, &locale)
}

#[tauri::command]
fn get_main_window_effects_support() -> window_effects::MainWindowEffectsSupport {
    window_effects::main_window_effects_support()
}

#[tauri::command]
fn get_live_desktop_background_support(
    state: State<'_, AppState>,
) -> Result<live_desktop::LiveDesktopBackgroundSupport, String> {
    let active_support = {
        let mut runtime = state
            .live_desktop_runtime
            .lock()
            .map_err(|_| "Failed to lock live desktop runtime".to_string())?;
        runtime.active_background_support()
    };
    Ok(active_support.unwrap_or_else(live_desktop::live_desktop_background_support))
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
    let mut runtime = state
        .live_desktop_runtime
        .lock()
        .map_err(|_| "Failed to lock live desktop runtime".to_string())?;
    Ok(runtime.start_for_window(window_handle))
}

#[cfg(target_os = "windows")]
fn native_live_desktop_window_handle(
    window: &tauri::WebviewWindow,
) -> Result<live_desktop::LiveDesktopWindowHandle, String> {
    window
        .hwnd()
        .map_err(|source| NativeError::Tauri {
            context: "live_desktop hwnd",
            source,
        })
        .map_err(String::from)
}

#[cfg(not(target_os = "windows"))]
fn native_live_desktop_window_handle(
    _window: &tauri::WebviewWindow,
) -> Result<live_desktop::LiveDesktopWindowHandle, String> {
    Ok(())
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
    main_window_supervisor::set_main_window_effects_enabled(
        &app,
        enabled,
        open_sequence,
        material.as_deref(),
        appearance.as_deref(),
    )
}

#[tauri::command]
fn set_main_window_mode(
    app: AppHandle,
    mode: String,
    fullscreen_overscan_enabled: bool,
) -> Result<String, String> {
    main_window_supervisor::set_main_window_mode(&app, &mode, fullscreen_overscan_enabled)
}

#[tauri::command]
fn set_main_window_shortcut(
    app: AppHandle,
    shortcut: Option<String>,
) -> Result<Option<String>, String> {
    set_main_window_shortcut_internal(&app, shortcut.as_deref())
}

#[tauri::command]
fn set_launchpad_icon_variant(
    app: AppHandle,
    state: State<'_, AppState>,
    variant: String,
) -> Result<String, String> {
    let next = LaunchpadIconVariant::parse(&variant).ok_or_else(|| {
        "launchpad icon variant must be light, dark, pastelLight, or pastelDark".to_string()
    })?;
    let mut current = launchpad_icon_variant_lock(&state)?;
    if *current == next {
        return Ok(next.as_str().to_string());
    }
    launchpad_icon::apply_runtime_icon(&app, next, *current)?;
    *current = next;
    Ok(next.as_str().to_string())
}

#[tauri::command]
fn set_main_window_shortcut_capture_active(
    state: State<'_, AppState>,
    active: bool,
) -> Result<(), String> {
    state
        .main_window_shortcut_capture_active
        .store(active, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn set_main_window_native_frame_enabled(
    app: AppHandle,
    enabled: bool,
    open_sequence: Option<u64>,
) -> Result<(), String> {
    main_window_supervisor::set_main_window_native_frame_enabled(&app, enabled, open_sequence)
}

#[tauri::command]
fn open_developer_console(webview: tauri::WebviewWindow) -> Result<(), String> {
    webview.open_devtools();
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum LaunchFailureKind {
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
struct LaunchFailure {
    kind: LaunchFailureKind,
    detail: String,
}

impl LaunchFailure {
    fn new(kind: LaunchFailureKind, detail: String) -> Self {
        Self { kind, detail }
    }

    fn missing_launch_info(detail: String) -> Self {
        Self::new(LaunchFailureKind::MissingLaunchInfo, detail)
    }

    fn layout_read_failed(detail: String) -> Self {
        Self::new(LaunchFailureKind::LayoutReadFailed, detail)
    }

    fn from_launch_path_error(error: LaunchPathError) -> Self {
        let kind = match error.kind {
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

    fn from_app_activation_error(error: LaunchPathError) -> Self {
        let kind = match error.kind {
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

    fn payload(&self) -> LaunchFailurePayload {
        LaunchFailurePayload {
            kind: self.kind_code().to_string(),
            detail: self.detail.clone(),
        }
    }

    fn kind_code(&self) -> &'static str {
        match self.kind {
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

#[cfg(target_os = "windows")]
fn show_launch_error_report(report: &LaunchFailureReport, locale: &str) -> Result<(), String> {
    use windows::{
        core::HSTRING,
        Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND},
    };

    let suggestion = i18n::translate(
        locale,
        "dialogs.warning.suggestion",
        &[("suggestion", report.suggestion.as_str())],
    )?;
    let body = format!("{}\n\n{}", report.message, suggestion);
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
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn show_launch_error_report(report: &LaunchFailureReport, locale: &str) -> Result<(), String> {
    let suggestion = i18n::translate(
        locale,
        "dialogs.warning.suggestion",
        &[("suggestion", report.suggestion.as_str())],
    )?;
    log::error!(target: "launcher", "{}\n\n{}", report.message, suggestion);
    Ok(())
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

#[cfg(target_os = "windows")]
fn installed_app_user_model_ids_for_status() -> Result<HashSet<String>, String> {
    windows_app_catalog::installed_app_user_model_ids()
}

#[cfg(not(target_os = "windows"))]
fn installed_app_user_model_ids_for_status() -> Result<HashSet<String>, String> {
    Err("AppUserModelId status checks are only available on Windows".to_string())
}

fn check_launch_target_status(
    target: &models::LaunchTarget,
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

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let (initial_locale, initial_launchpad_icon) = initial_presentation_state(app.handle());
    {
        let state = app.state::<AppState>();
        *locale_state_lock(&state).map_err(std::io::Error::other)? = initial_locale.clone();
    }
    main_window_supervisor::setup_main_window_supervisor(app)?;
    launchpad_icon::set_main_window_icon(app.handle(), initial_launchpad_icon)
        .map_err(std::io::Error::other)?;
    setup_tray(
        app,
        &initial_locale.resolved_locale,
        initial_launchpad_icon.tray_icon(),
    )?;
    {
        let state = app.state::<AppState>();
        *launchpad_icon_variant_lock(&state).map_err(std::io::Error::other)? =
            initial_launchpad_icon;
    }
    if let Err(error) = apply_main_window_mode(app.handle()) {
        log::warn!(target: "lumeria", "Failed to apply Lumeria window mode: {error}");
    }
    if let Err(error) = disable_main_window_transitions(app.handle()) {
        log::warn!(target: "lumeria", "Failed to disable Lumeria window transitions: {error}");
    }
    setup_global_shortcuts(app);
    Ok(())
}

fn setup_global_shortcuts(app: &mut tauri::App) {
    let plugin = tauri_plugin_global_shortcut::Builder::new().build();

    if let Err(error) = app.handle().plugin(plugin) {
        log::error!(target: "shortcut", "Failed to install Lumeria shortcut plugin: {error}");
        return;
    }

    match load_initial_main_window_shortcut(app.handle()) {
        Ok(Some(shortcut)) => {
            if let Err(error) = set_main_window_shortcut_internal(app.handle(), Some(&shortcut)) {
                log::warn!(target: "shortcut", "Failed to register configured Lumeria shortcut: {error}");
            }
        }
        Ok(None) => {}
        Err(error) => {
            log::warn!(target: "shortcut", "Failed to load configured Lumeria shortcut: {error}");
            if let Err(error) =
                set_main_window_shortcut_internal(app.handle(), Some(DEFAULT_MAIN_WINDOW_SHORTCUT))
            {
                log::error!(target: "shortcut", "Failed to register default Lumeria shortcut: {error}");
            }
        }
    }
}

fn load_initial_main_window_shortcut(app: &AppHandle) -> Result<Option<String>, String> {
    let Some(layout) = load_saved_layout(app)? else {
        return Ok(Some(DEFAULT_MAIN_WINDOW_SHORTCUT.to_string()));
    };
    let shortcut = layout
        .get("settings")
        .and_then(|settings| settings.get("mainWindowShortcut"));
    if shortcut.is_some_and(|value| value.is_null()) {
        return Ok(None);
    }
    Ok(Some(
        shortcut
            .and_then(serde_json::Value::as_str)
            .unwrap_or(DEFAULT_MAIN_WINDOW_SHORTCUT)
            .to_string(),
    ))
}

fn normalize_main_window_shortcut(shortcut: &str) -> Result<String, String> {
    let trimmed = shortcut.trim();
    if trimmed.is_empty() {
        return Err("Shortcut must not be empty".to_string());
    }
    trimmed
        .parse::<Shortcut>()
        .map_err(|error| format!("Shortcut is invalid: {error}"))?;
    Ok(trimmed.to_string())
}

fn clear_main_window_shortcut_internal(app: &AppHandle) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();
    let previous_shortcut = state
        .main_window_shortcut
        .lock()
        .map_err(|_| "Failed to lock Lumeria shortcut state".to_string())?
        .clone();

    if let Some(previous_shortcut) = previous_shortcut {
        app.global_shortcut()
            .unregister(previous_shortcut.as_str())
            .map_err(|error| {
                format!("Failed to unregister Lumeria shortcut {previous_shortcut}: {error}")
            })?;
    }

    let mut registered_shortcut = state
        .main_window_shortcut
        .lock()
        .map_err(|_| "Failed to lock Lumeria shortcut state".to_string())?;
    *registered_shortcut = None;
    Ok(None)
}

fn set_main_window_shortcut_internal(
    app: &AppHandle,
    shortcut: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(shortcut) = shortcut else {
        return clear_main_window_shortcut_internal(app);
    };
    let next_shortcut = normalize_main_window_shortcut(shortcut)?;
    let state = app.state::<AppState>();
    let previous_shortcut = state
        .main_window_shortcut
        .lock()
        .map_err(|_| "Failed to lock Lumeria shortcut state".to_string())?
        .clone();

    if previous_shortcut.as_deref() == Some(next_shortcut.as_str()) {
        return Ok(Some(next_shortcut));
    }

    app.global_shortcut()
        .on_shortcut(next_shortcut.as_str(), |app, shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if app
                    .state::<AppState>()
                    .main_window_shortcut_capture_active
                    .load(Ordering::Relaxed)
                {
                    if let Err(error) =
                        app.emit(MAIN_WINDOW_SHORTCUT_CAPTURED_EVENT, shortcut.into_string())
                    {
                        log::warn!(
                            target: "shortcut",
                            "Failed to emit captured Lumeria shortcut event: {error}"
                        );
                    }
                    return;
                }
                trigger_main_window_shortcut(app);
            }
        })
        .map_err(|error| format!("Failed to register Lumeria shortcut {next_shortcut}: {error}"))?;

    if let Some(previous_shortcut) = previous_shortcut {
        if previous_shortcut != next_shortcut {
            if let Err(error) = app.global_shortcut().unregister(previous_shortcut.as_str()) {
                log::warn!(
                    target: "shortcut",
                    "Failed to unregister previous Lumeria shortcut {previous_shortcut}: {error}"
                );
            }
        }
    }

    let mut registered_shortcut = state
        .main_window_shortcut
        .lock()
        .map_err(|_| "Failed to lock Lumeria shortcut state".to_string())?;
    *registered_shortcut = Some(next_shortcut.clone());
    Ok(Some(next_shortcut))
}

fn request_app_termination(app: &AppHandle, restart: bool) {
    if !main_window_supervisor::webview_is_healthy() {
        log::warn!(
            target: "lumeria",
            "{} without renderer save because WebView2 is unavailable",
            if restart { "Restarting" } else { "Quitting" }
        );
        finish_app_termination(app, restart);
        return;
    }
    RESTART_AFTER_QUIT_ACKNOWLEDGEMENT.store(restart, Ordering::Relaxed);
    QUIT_ACKNOWLEDGED.store(false, Ordering::Relaxed);
    if let Err(error) = app.emit(QUIT_REQUESTED_EVENT, ()) {
        log::warn!(target: "lumeria", "Failed to emit termination save request event: {error}");
    }
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(QUIT_FALLBACK_DELAY_MS));
        if !QUIT_ACKNOWLEDGED.load(Ordering::Relaxed) {
            let restart = RESTART_AFTER_QUIT_ACKNOWLEDGEMENT.swap(false, Ordering::Relaxed);
            log::error!(
                target: "lumeria",
                "Lumeria termination save request timed out; forcing {}",
                if restart { "restart" } else { "exit" }
            );
            finish_app_termination(&app, restart);
        }
    });
}

pub fn run() {
    let context = tauri::generate_context!();
    let launch_context = startup::current_launch_context();
    if let Err(error) = startup::prepare_single_instance_foreground_handoff(launch_context) {
        eprintln!("Failed to prepare Lumeria single-instance foreground handoff: {error}");
    }

    #[cfg(all(target_os = "windows", debug_assertions))]
    let context = {
        let mut context = context;
        let main_window = context
            .config_mut()
            .app
            .windows
            .iter_mut()
            .find(|window| window.label == "main")
            .expect("main window configuration is required for WebView2 remote debugging");

        let browser_args = main_window
            .additional_browser_args
            .get_or_insert_with(String::new);
        if !browser_args.is_empty() {
            browser_args.push(' ');
        }
        browser_args.push_str(WEBVIEW2_REMOTE_DEBUGGING_ARGS);

        context
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if startup::second_instance_action(args)
                == startup::SecondInstanceAction::ActivateExisting
            {
                open_main_window(app);
            }
        }))
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(launch_context)
        .manage(AppState::default())
        .setup(setup_app)
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && payload.event() == PageLoadEvent::Started {
                main_window_supervisor::begin_main_renderer_navigation(webview.app_handle());
            }
        })
        .on_menu_event(|app, event| {
            if event.id() == "show" {
                open_main_window(app);
            } else if event.id() == "settings" {
                open_settings(app);
            } else if event.id() == "logs" {
                if let Err(error) = main_window_supervisor::open_log_directory(app) {
                    log::error!(target: "lumeria", "Failed to open Lumeria log directory: {error}");
                }
            } else if event.id() == "restart" {
                request_app_termination(app, true);
            } else if event.id() == "quit" {
                request_app_termination(app, false);
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
                if let Err(error) = window.emit(CLOSE_DESKTOP_EVENT, ()) {
                    log::warn!(target: "lumeria", "Failed to emit close desktop event: {error}");
                }
            }
            WindowEvent::Focused(true) => refresh_main_window_effects(window.app_handle()),
            WindowEvent::Focused(false) => {
                main_window_supervisor::release_main_window_topmost(window.app_handle())
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            scan_apps,
            get_app_locale_state,
            apply_app_locale_preference,
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
            check_launch_targets,
            launch_app,
            begin_main_window_close,
            hide_main_window,
            complete_renderer_startup,
            reveal_main_window,
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
            set_main_window_effects_enabled,
            set_main_window_mode,
            set_main_window_shortcut,
            set_launchpad_icon_variant,
            set_main_window_shortcut_capture_active,
            set_main_window_native_frame_enabled,
            open_developer_console,
            get_launch_context,
            get_autostart_status,
            set_autostart_enabled
        ])
        .run(context)
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
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Err("Custom icon data is not a PNG image".to_string());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AppSourceType, CatalogIdentityStatus, LaunchTarget};
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
            models::AppSource {
                key: "primary".to_string(),
                source_type: AppSourceType::CustomDirectory,
                state: AppSourceState::Primary,
                root_id: "custom".to_string(),
                root_label: "Custom".to_string(),
                relative_path: "primary.lnk".to_string(),
                absolute_path: missing_primary.to_string_lossy().to_string(),
            },
            models::AppSource {
                key: "equivalent".to_string(),
                source_type: AppSourceType::StartMenuUser,
                state: AppSourceState::Equivalent,
                root_id: "user".to_string(),
                root_label: "User".to_string(),
                relative_path: "equivalent.lnk".to_string(),
                absolute_path: equivalent.to_string_lossy().to_string(),
            },
            models::AppSource {
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

    #[test]
    fn decode_custom_icon_accepts_png_data_urls() {
        let bytes = decode_custom_icon_data_url("data:image/png;base64,iVBORw0KGgo=")
            .expect("png data url should decode");

        assert!(bytes.starts_with(PNG_SIGNATURE));
    }

    #[test]
    fn decode_custom_icon_rejects_non_png_data_urls() {
        let error = decode_custom_icon_data_url("data:image/jpeg;base64,abcd")
            .expect_err("non-png data urls should fail");

        assert!(error.contains("PNG"));
    }
}
