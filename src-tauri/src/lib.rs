mod catalog;
mod icons;
mod launcher;
mod layout_store;
mod models;
mod path_utils;
mod tray;

use std::{collections::HashMap, fs, sync::Mutex};

use catalog::{icon_cache_dir, scan_start_menu_apps};
use launcher::launch_path;
use layout_store::{find_saved_layout_app, layout_path};
use models::AppCatalogItem;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, State, WindowEvent,
};
use tray::{open_settings, setup_tray, show_main_window};

#[cfg(all(target_os = "windows", debug_assertions))]
pub use icons::debug_extract_icon_png;

#[derive(Default)]
struct AppState {
    catalog: Mutex<HashMap<String, AppCatalogItem>>,
}

#[tauri::command]
fn scan_apps(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<AppCatalogItem>, String> {
    let icon_dir = icon_cache_dir(&app)?;
    let apps = scan_start_menu_apps(&icon_dir)?;
    let mut catalog = state
        .catalog
        .lock()
        .map_err(|_| "Failed to lock app catalog".to_string())?;
    catalog.clear();
    catalog.extend(apps.iter().cloned().map(|app| (app.id.clone(), app)));
    Ok(apps)
}

#[tauri::command]
fn load_layout(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = layout_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read layout {}: {error}", path.display()))?;
    let layout = serde_json::from_str(&contents)
        .map_err(|error| format!("Failed to parse layout {}: {error}", path.display()))?;
    Ok(Some(layout))
}

#[tauri::command]
fn save_layout(app: AppHandle, layout: serde_json::Value) -> Result<(), String> {
    let path = layout_path(&app)?;
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
    fs::write(&path, contents)
        .map_err(|error| format!("Failed to write layout {}: {error}", path.display()))
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

    let app = match saved_app.or(catalog_app) {
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

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(setup_tray)
        .on_menu_event(|app, event| {
            if event.id() == "show" {
                show_main_window(app);
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
                show_main_window(app);
            }
            TrayIconEvent::DoubleClick { button, .. } if button == MouseButton::Left => {
                show_main_window(app);
            }
            _ => {}
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            scan_apps,
            load_layout,
            save_layout,
            launch_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
