#[cfg(target_os = "windows")]
use png::{BitDepth, ColorType, Encoder};
use serde::{Deserialize, Serialize};
use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    env, fs,
    fs::File,
    hash::{Hash, Hasher},
    io::BufWriter,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
#[cfg(target_os = "windows")]
use windows::{
    core::HSTRING,
    Win32::{
        Foundation::SIZE,
        Graphics::Gdi::{
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        },
        System::Com::{CoInitializeEx, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED},
        UI::Shell::{
            IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK,
            SIIGBF_ICONONLY, SIIGBF_SCALEUP,
        },
    },
};

#[derive(Default)]
struct AppState {
    catalog: Mutex<HashMap<String, AppCatalogItem>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppCatalogItem {
    id: String,
    #[serde(rename = "type")]
    item_type: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    icon_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    icon_data_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    emoji: Option<String>,
    launch_target: LaunchTarget,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchTarget {
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    app_user_model_id: Option<String>,
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
    let target = {
        let catalog = state
            .catalog
            .lock()
            .map_err(|_| "Failed to lock app catalog".to_string())?;
        catalog.get(&app_id).cloned()
    };

    let app = match target {
        Some(app) => app,
        None => {
            let icon_dir = icon_cache_dir(&app)?;
            let apps = scan_start_menu_apps(&icon_dir)?;
            apps.into_iter()
                .find(|app| app.id == app_id)
                .or_else(|| find_saved_layout_app(&app, &app_id).ok().flatten())
                .ok_or_else(|| format!("Unknown app id: {app_id}"))?
        }
    };

    let path = app
        .launch_target
        .path
        .ok_or_else(|| format!("App has no launch path: {}", app.name))?;
    launch_path(&path)
}

fn find_saved_layout_app(app: &AppHandle, app_id: &str) -> Result<Option<AppCatalogItem>, String> {
    let path = layout_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read layout {}: {error}", path.display()))?;
    let layout: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|error| format!("Failed to parse layout {}: {error}", path.display()))?;
    Ok(find_app_in_layout_value(&layout, app_id))
}

fn find_app_in_layout_value(value: &serde_json::Value, app_id: &str) -> Option<AppCatalogItem> {
    if value.get("type").and_then(serde_json::Value::as_str) == Some("app")
        && value.get("id").and_then(serde_json::Value::as_str) == Some(app_id)
        && value.get("launchTarget").is_some()
    {
        return serde_json::from_value(value.clone()).ok();
    }

    match value {
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|item| find_app_in_layout_value(item, app_id)),
        serde_json::Value::Object(map) => map
            .values()
            .find_map(|item| find_app_in_layout_value(item, app_id)),
        _ => None,
    }
}

fn layout_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    Ok(data_dir.join("layout.json"))
}

fn icon_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let icon_dir = data_dir.join("icons");
    fs::create_dir_all(&icon_dir).map_err(|error| {
        format!(
            "Failed to create icon cache directory {}: {error}",
            icon_dir.display()
        )
    })?;
    Ok(icon_dir)
}

fn scan_start_menu_apps(icon_dir: &Path) -> Result<Vec<AppCatalogItem>, String> {
    let mut apps = Vec::new();
    let mut seen_paths = HashMap::new();

    for root in start_menu_roots() {
        collect_apps_from_dir(&root, icon_dir, &mut apps, &mut seen_paths)?;
    }

    apps.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(apps)
}

fn start_menu_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(appdata) = env::var("APPDATA") {
        roots.push(PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }

    if let Ok(program_data) = env::var("ProgramData") {
        roots.push(PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }

    roots
}

fn collect_apps_from_dir(
    dir: &Path,
    icon_dir: &Path,
    apps: &mut Vec<AppCatalogItem>,
    seen_paths: &mut HashMap<String, ()>,
) -> Result<(), String> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "Failed to read app directory {}: {error}",
                dir.display()
            ))
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.is_dir() {
            collect_apps_from_dir(&path, icon_dir, apps, seen_paths)?;
            continue;
        }

        if !is_supported_launch_file(&path) {
            continue;
        }

        let path_key = path.to_string_lossy().to_lowercase();
        if seen_paths.insert(path_key, ()).is_some() {
            continue;
        }

        apps.push(make_catalog_item(&path, icon_dir));
    }

    Ok(())
}

fn is_supported_launch_file(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("lnk") | Some("url") | Some("exe")
    )
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
}

fn make_catalog_item(path: &Path, icon_dir: &Path) -> AppCatalogItem {
    let name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Application")
        .trim()
        .to_string();
    let path_string = path.to_string_lossy().to_string();
    let kind = match extension(path).as_deref() {
        Some("exe") => "executable",
        Some("url") => "url",
        _ => "shortcut",
    }
    .to_string();
    let id = stable_app_id(&path_string);
    let icon_path = cache_app_icon(path, icon_dir, &id);
    let icon_data_url = icon_path.as_deref().and_then(icon_file_data_url);

    AppCatalogItem {
        id,
        item_type: "app".to_string(),
        name: if name.is_empty() {
            "Application".to_string()
        } else {
            name.clone()
        },
        icon_path,
        icon_data_url,
        emoji: Some(app_glyph(&name)),
        launch_target: LaunchTarget {
            kind,
            path: Some(path_string),
            app_user_model_id: None,
        },
    }
}

fn stable_app_id(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.to_lowercase().hash(&mut hasher);
    format!("win-app-{:x}", hasher.finish())
}

fn app_glyph(name: &str) -> String {
    name.chars()
        .find(|character| character.is_alphanumeric())
        .map(|character| character.to_uppercase().collect())
        .unwrap_or_else(|| "A".to_string())
}

fn icon_file_data_url(path: &str) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(format!("data:image/png;base64,{}", encode_base64(&bytes)))
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);

        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(TABLE[(((first & 0b0000_0011) << 4) | (second >> 4)) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[(((second & 0b0000_1111) << 2) | (third >> 6)) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(third & 0b0011_1111) as usize] as char
        } else {
            '='
        });
    }

    output
}

#[cfg(target_os = "windows")]
fn cache_app_icon(path: &Path, icon_dir: &Path, app_id: &str) -> Option<String> {
    let icon_path = icon_dir.join(format!("{app_id}.png"));
    if icon_path.exists() {
        return Some(icon_path.to_string_lossy().to_string());
    }

    extract_icon_png(path, &icon_path)
        .ok()
        .map(|_| icon_path.to_string_lossy().to_string())
}

#[cfg(not(target_os = "windows"))]
fn cache_app_icon(_path: &Path, _icon_dir: &Path, _app_id: &str) -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn extract_icon_png(source_path: &Path, output_path: &Path) -> Result<(), String> {
    let _com_guard = ComGuard::new();
    let source = HSTRING::from(source_path.to_string_lossy().as_ref());
    let bitmap = unsafe {
        let factory: IShellItemImageFactory =
            SHCreateItemFromParsingName(&source, None::<&IBindCtx>)
                .map_err(|error| format!("Failed to create shell item image factory: {error}"))?;
        factory
            .GetImage(
                SIZE { cx: 256, cy: 256 },
                SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK | SIIGBF_SCALEUP,
            )
            .map_err(|error| format!("Failed to get shell item icon: {error}"))?
    };

    let result = write_hbitmap_as_png(bitmap, output_path);
    unsafe {
        let _ = DeleteObject(bitmap.into());
    }
    result
}

#[cfg(target_os = "windows")]
struct ComGuard {
    initialized: bool,
}

#[cfg(target_os = "windows")]
impl ComGuard {
    fn new() -> Self {
        let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };
        Self { initialized }
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn write_hbitmap_as_png(
    bitmap: windows::Win32::Graphics::Gdi::HBITMAP,
    output_path: &Path,
) -> Result<(), String> {
    let mut bitmap_info = BITMAP::default();
    let object_size = std::mem::size_of::<BITMAP>() as i32;
    let object_result = unsafe {
        GetObjectW(
            bitmap.into(),
            object_size,
            Some((&mut bitmap_info as *mut BITMAP).cast()),
        )
    };
    if object_result == 0 {
        return Err("Failed to read bitmap metadata".to_string());
    }

    let width = bitmap_info.bmWidth;
    let height = bitmap_info.bmHeight.abs();
    if width <= 0 || height <= 0 {
        return Err("Bitmap has invalid dimensions".to_string());
    }

    let mut dib_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..BITMAPINFOHEADER::default()
        },
        ..BITMAPINFO::default()
    };
    let mut bgra = vec![0u8; (width as usize) * (height as usize) * 4];
    let hdc = unsafe { CreateCompatibleDC(None) };
    if hdc.is_invalid() {
        return Err("Failed to create bitmap read context".to_string());
    }
    let read_lines = unsafe {
        GetDIBits(
            hdc,
            bitmap,
            0,
            height as u32,
            Some(bgra.as_mut_ptr().cast()),
            &mut dib_info,
            DIB_RGB_COLORS,
        )
    };
    unsafe {
        let _ = DeleteDC(hdc);
    }
    if read_lines == 0 {
        return Err("Failed to read bitmap pixels".to_string());
    }

    for pixel in bgra.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create icon output directory {}: {error}",
                parent.display()
            )
        })?;
    }
    let file = File::create(output_path).map_err(|error| {
        format!(
            "Failed to create icon file {}: {error}",
            output_path.display()
        )
    })?;
    let writer = BufWriter::new(file);
    let mut encoder = Encoder::new(writer, width as u32, height as u32);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    let mut png_writer = encoder
        .write_header()
        .map_err(|error| format!("Failed to write PNG header: {error}"))?;
    png_writer
        .write_image_data(&bgra)
        .map_err(|error| format!("Failed to write PNG data: {error}"))
}

#[cfg(target_os = "windows")]
fn launch_path(path: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", path])
        .spawn()
        .map_err(|error| format!("Failed to launch {path}: {error}"))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn launch_path(_path: &str) -> Result<(), String> {
    Err("Launching apps is only implemented on Windows".to_string())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn open_settings(app: &AppHandle) {
    show_main_window(app);
    let _ = app.emit("launchpad-open-settings", ());
}

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text("show", "显示 LaunchPad")
        .text("settings", "设置")
        .separator()
        .text("quit", "退出")
        .build()?;
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("LaunchPad");

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
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
