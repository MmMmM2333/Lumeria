mod catalog;
mod file_dialog;
mod icons;
mod launcher;
mod layout_store;
mod models;
mod path_utils;
mod tray;

use std::{collections::HashMap, sync::Mutex};

use catalog::{icon_cache_dir, icon_file_data_url, scan_start_menu_apps, stable_app_id};
use file_dialog::{pick_launch_file as pick_native_launch_file, PickedLaunchFile};
use icons::cache_app_icon_choices;
use launcher::launch_path;
use layout_store::{
    find_saved_layout_app, load_layout as load_saved_layout, save_layout as save_saved_layout,
};
use models::AppCatalogItem;
use serde::Serialize;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, Emitter, State, WindowEvent,
};
use tray::{open_settings, setup_tray, show_main_window};

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

fn select_launch_app(
    catalog_app: Option<AppCatalogItem>,
    saved_app: Option<AppCatalogItem>,
) -> Option<AppCatalogItem> {
    catalog_app.or(saved_app)
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
            pick_launch_file,
            load_app_icon_choices,
            launch_app
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
        }
    }

    #[test]
    fn select_launch_app_prefers_current_catalog() {
        let selected = select_launch_app(
            Some(app_item("app", "C:/Current/App.exe")),
            Some(app_item("app", "C:/Saved/App.exe")),
        )
        .expect("app should be selected");

        assert_eq!(
            selected.launch_target.path.as_deref(),
            Some("C:/Current/App.exe")
        );
    }

    #[test]
    fn select_launch_app_falls_back_to_saved_layout() {
        let selected = select_launch_app(None, Some(app_item("app", "C:/Saved/App.exe")))
            .expect("saved app should be selected");

        assert_eq!(selected.launch_target.path.as_deref(), Some("C:/Saved/App.exe"));
    }
}
