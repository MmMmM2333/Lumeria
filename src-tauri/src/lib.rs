mod catalog;
mod file_dialog;
mod icons;
mod launcher;
mod layout_store;
mod models;
mod path_utils;
mod tray;

use std::{collections::HashMap, sync::Mutex};

use catalog::{
    icon_cache_dir, icon_file_data_url, scan_apps_from_roots, scan_start_menu_apps, stable_app_id,
    ScanFilters, ScanRoot,
};
use file_dialog::{
    pick_launch_file as pick_native_launch_file,
    pick_scan_root_directory as pick_native_scan_root_directory, PickedLaunchFile,
};
use icons::cache_app_icon_choices;
use launcher::launch_path;
use layout_store::{
    find_saved_layout_app, load_layout as load_saved_layout, save_layout as save_saved_layout,
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

#[cfg(all(target_os = "windows", debug_assertions))]
pub use icons::debug_extract_icon_png;

#[derive(Default)]
struct AppState {
    catalog: Mutex<HashMap<String, AppCatalogItem>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppIconChoice {
    id: String,
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

#[tauri::command]
fn scan_apps(
    app: AppHandle,
    state: State<'_, AppState>,
    roots: Vec<ScanRoot>,
    filters: Option<ScanFilters>,
) -> Result<Vec<AppCatalogItem>, String> {
    let icon_dir = icon_cache_dir(&app)?;
    let filters = filters.unwrap_or_default();
    let apps = scan_apps_from_roots(&roots, &icon_dir, &filters)?;
    let mut catalog = state
        .catalog
        .lock()
        .map_err(|_| "Failed to lock app catalog".to_string())?;
    catalog.clear();
    catalog.extend(apps.iter().cloned().map(|app| (app.id.clone(), app)));
    Ok(apps)
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
    let choices = cache_app_icon_choices(path, &icon_dir, &app_id)
        .into_iter()
        .enumerate()
        .filter_map(|(index, path)| {
            let icon_data_url = icon_file_data_url(path.to_str()?)?;
            Some(AppIconChoice {
                id: format!("{app_id}-icon-{index}"),
                icon_data_url,
            })
        })
        .collect();
    Ok(choices)
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
fn launch_app(app: AppHandle, app_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let saved_app = find_saved_layout_app(&app, &app_id).ok().flatten();
    let catalog_app = {
        let catalog = state
            .catalog
            .lock()
            .map_err(|_| "Failed to lock app catalog".to_string())?;
        catalog.get(&app_id).cloned()
    };

    let app = match select_launch_app(catalog_app, saved_app) {
        Some(app) => app,
        None => {
            let icon_dir = icon_cache_dir(&app)?;
            let apps = scan_start_menu_apps(&icon_dir)?;
            apps.into_iter()
                .find(|app| app.id == app_id)
                .ok_or_else(|| format!("Unknown app id: {app_id}"))?
        }
    };

    let path = app
        .launch_target
        .path
        .ok_or_else(|| format!("App has no launch path: {}", app.name))?;
    launch_path(&path, app.launch_args.as_deref())
}

#[tauri::command]
fn hide_main_window(app: AppHandle) {
    tray::hide_main_window(&app);
}

#[tauri::command]
fn set_main_window_effects_enabled(
    app: AppHandle,
    enabled: bool,
    open_sequence: Option<u64>,
) -> Result<(), String> {
    tray::set_main_window_effects_enabled(&app, enabled, open_sequence)
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
                app.exit(0);
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
            TrayIconEvent::DoubleClick { button, .. } if button == MouseButton::Left => {
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
            pick_scan_root_directory,
            load_app_icon_choices,
            load_cached_app_icons,
            check_launch_targets,
            launch_app,
            hide_main_window,
            set_main_window_effects_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::LaunchTarget;

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
}
