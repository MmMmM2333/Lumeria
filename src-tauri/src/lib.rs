mod autostart;
mod catalog;
mod dwm;
mod file_dialog;
mod i18n;
mod launchpad_icon;
mod layout_store;
mod live_desktop;
mod main_window_supervisor;
mod native_error;
mod startup;
mod tray;
mod window_effects;

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};

use autostart::{get_autostart_status, set_autostart_enabled};
use catalog::icon_cache_dir;
use file_dialog::{
    cached_background_image_data_url as load_native_cached_background_image_data_url,
    get_desktop_wallpaper_background as get_native_desktop_wallpaper_background,
    pick_background_image as pick_native_background_image,
    pick_launch_file as pick_native_launch_file,
    pick_scan_root_directory as pick_native_scan_root_directory, PickedBackgroundImage,
    PickedLaunchFile,
};
use launchpad_icon::LaunchpadIconVariantExt;
use layout_store::{
    load_layout as load_saved_layout, load_startup_layout_preferences,
    save_layout as save_saved_layout,
};
use lumeria_core::{
    app_icon_cache::{
        cache_custom_icon_to_dir, load_app_icon_choices_from_dir, AppIconChoice,
        CachedCustomIconResult,
    },
    catalog::{scan_apps_from_roots, ScanAppsResult, ScanFilters, ScanRoot},
    launch::{
        check_launch_targets_sync, launch_app as launch_selected_app, validate_launch_app_id,
        LaunchAppRequest, LaunchFailure, LaunchFailureKind, LaunchFailurePayload,
        LaunchTargetCheckRequest, LaunchTargetCheckResult,
    },
    launchpad_icon::LaunchpadIconVariant,
    models::AppCatalogItem,
};
use main_window_supervisor::{
    apply_main_window_mode, disable_main_window_transitions, open_main_window, open_settings,
    refresh_main_window_effects, reveal_main_window as reveal_supervised_main_window,
    trigger_main_window_shortcut, CLOSE_DESKTOP_EVENT,
};
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
pub use lumeria_core::icons::debug_extract_icon_png;

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
    tauri::async_runtime::spawn_blocking(move || check_launch_targets_sync(targets))
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
    load_app_icon_choices_from_dir(&target_path, &icon_cache_dir(&app)?)
}

#[tauri::command]
fn cache_custom_icon(app: AppHandle, data_url: String) -> Result<CachedCustomIconResult, String> {
    cache_custom_icon_to_dir(&data_url, &icon_cache_dir(&app)?)
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
    let app_id = validate_launch_app_id(&request.id)?;

    let catalog_app = {
        let catalog = state.catalog.lock().map_err(|_| {
            LaunchFailure::layout_read_failed("Failed to lock app catalog".to_string())
        })?;
        catalog.get(app_id).cloned()
    };

    let saved_layout = load_saved_layout(app_handle).map_err(LaunchFailure::layout_read_failed)?;
    launch_selected_app(app_id, catalog_app, saved_layout.as_ref(), || {
        icon_cache_dir(app_handle)
    })
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
