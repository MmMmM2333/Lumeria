#[cfg(target_os = "windows")]
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::SystemTime,
};

use serde::Serialize;

#[cfg(target_os = "windows")]
use windows::{
    core::{HRESULT, HSTRING, PCWSTR, PWSTR},
    Win32::{
        Foundation::{ERROR_CANCELLED, RECT},
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        },
        System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL, CLSCTX_INPROC_SERVER},
        UI::Shell::{
            Common::COMDLG_FILTERSPEC, DesktopWallpaper, FileOpenDialog, IDesktopWallpaper,
            IFileOpenDialog, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_PATHMUSTEXIST,
            FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
        },
        UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        },
    },
};

#[cfg(target_os = "windows")]
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use crate::encoding::{cache_content_addressed, encode_base64, PNG_SIGNATURE};
#[cfg(target_os = "windows")]
use crate::windows_com::ComGuard;
use crate::{
    catalog::{icon_cache_dir, icon_file_data_url, stable_app_id},
    icons::cache_app_icon,
    models::LaunchTarget,
    path_utils::{extension, windows_api_path},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PickedLaunchFile {
    name: String,
    path: String,
    launch_target: LaunchTarget,
    launch_args: String,
    icon_path: Option<String>,
    icon_data_url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PickedBackgroundImage {
    name: String,
    image_path: String,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Debug)]
struct DesktopWallpaperCacheRecord {
    source_path: String,
    source_len: u64,
    source_modified: Option<SystemTime>,
    picked: PickedBackgroundImage,
}

#[cfg(target_os = "windows")]
static DESKTOP_WALLPAPER_CACHE: Mutex<Option<DesktopWallpaperCacheRecord>> = Mutex::new(None);

#[cfg(target_os = "windows")]
pub(crate) fn pick_launch_file(app: &AppHandle) -> Result<Option<PickedLaunchFile>, String> {
    let _com_guard = ComGuard::new()?;
    let result = unsafe { pick_launch_file_inner() };
    match result {
        Ok(path) => make_picked_launch_file(app, Path::new(&path)).map(Some),
        Err(error) if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) => Ok(None),
        Err(error) => Err(format!("Failed to pick launch file: {error}")),
    }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn pick_launch_file(
    _app: &tauri::AppHandle,
) -> Result<Option<PickedLaunchFile>, String> {
    Err("Picking launch files is only implemented on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub(crate) fn pick_background_image(
    app: &AppHandle,
) -> Result<Option<PickedBackgroundImage>, String> {
    let _com_guard = ComGuard::new()?;
    let result = unsafe { pick_background_image_inner() };
    match result {
        Ok(path) => cache_picked_background_image(app, Path::new(&path)).map(Some),
        Err(error) if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) => Ok(None),
        Err(error) => Err(format!("Failed to pick background image: {error}")),
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn get_desktop_wallpaper_background(
    app: &AppHandle,
) -> Result<Option<PickedBackgroundImage>, String> {
    let path = current_desktop_wallpaper_path(app)?;
    let path = path.trim();
    if path.is_empty() {
        return Ok(None);
    }
    cache_desktop_wallpaper_image(app, Path::new(path)).map(Some)
}

#[cfg(target_os = "windows")]
pub(crate) fn cached_background_image_data_url(
    app: &AppHandle,
    image_path: &str,
) -> Result<Option<String>, String> {
    let image_path = image_path.trim();
    if image_path.is_empty() {
        return Ok(None);
    }

    let background_dir = background_cache_dir(app)?;
    let canonical_background_dir = background_dir.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve background cache directory {}: {error}",
            background_dir.display()
        )
    })?;
    let canonical_image_path = match PathBuf::from(image_path).canonicalize() {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };
    if !canonical_image_path.starts_with(&canonical_background_dir) {
        return Ok(None);
    }

    let metadata = fs::metadata(&canonical_image_path).map_err(|error| {
        format!(
            "Failed to read background image {}: {error}",
            canonical_image_path.display()
        )
    })?;
    if !metadata.is_file() {
        return Ok(None);
    }
    if metadata.len() > MAX_BACKGROUND_IMAGE_BYTES {
        return Err("Background image is larger than 30 MB".to_string());
    }

    let bytes = fs::read(&canonical_image_path).map_err(|error| {
        format!(
            "Failed to read background image {}: {error}",
            canonical_image_path.display()
        )
    })?;
    let extension =
        detect_background_image_extension(&canonical_image_path, &bytes).ok_or_else(|| {
            "Background image must be a PNG, JPG, JPEG, WEBP, or BMP file".to_string()
        })?;
    let mime_type = background_image_mime_type(extension);
    Ok(Some(format!(
        "data:{mime_type};base64,{}",
        encode_base64(&bytes)
    )))
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn get_desktop_wallpaper_background(
    _app: &tauri::AppHandle,
) -> Result<Option<PickedBackgroundImage>, String> {
    Err("Desktop wallpaper backgrounds are only implemented on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn cached_background_image_data_url(
    _app: &tauri::AppHandle,
    _image_path: &str,
) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn pick_background_image(
    _app: &tauri::AppHandle,
) -> Result<Option<PickedBackgroundImage>, String> {
    Err("Picking background images is only implemented on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub(crate) fn pick_scan_root_directory() -> Result<Option<String>, String> {
    let _com_guard = ComGuard::new()?;
    let result = unsafe { pick_scan_root_directory_inner() };
    match result {
        Ok(path) => Ok(Some(path)),
        Err(error) if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) => Ok(None),
        Err(error) => Err(format!("Failed to pick scan root directory: {error}")),
    }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn pick_scan_root_directory() -> Result<Option<String>, String> {
    Err("Picking scan root directories is only implemented on Windows".to_string())
}

#[cfg(target_os = "windows")]
unsafe fn pick_launch_file_inner() -> windows::core::Result<String> {
    let dialog: IFileOpenDialog =
        unsafe { CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)? };
    let launch_files_name = HSTRING::from("Applications and shortcuts");
    let launch_files_spec = HSTRING::from("*.exe;*.lnk;*.url");
    let filters = [COMDLG_FILTERSPEC {
        pszName: PCWSTR(launch_files_name.as_ptr()),
        pszSpec: PCWSTR(launch_files_spec.as_ptr()),
    }];

    unsafe {
        dialog.SetTitle(&HSTRING::from("选择应用"))?;
        dialog.SetFileTypes(&filters)?;
        dialog.SetOptions(FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST)?;
        dialog.Show(None)?;
    }

    let item = unsafe { dialog.GetResult()? };
    let display_name = unsafe { item.GetDisplayName(SIGDN_FILESYSPATH)? };
    let path = unsafe {
        let value = display_name.to_string()?;
        CoTaskMemFree(Some(display_name.as_ptr().cast()));
        value
    };

    if is_supported_launch_file(Path::new(&path)) {
        Ok(path)
    } else {
        Err(windows::core::Error::new(
            HRESULT::from_win32(ERROR_CANCELLED.0),
            "Unsupported launch file type",
        ))
    }
}

#[cfg(target_os = "windows")]
unsafe fn pick_background_image_inner() -> windows::core::Result<String> {
    let dialog: IFileOpenDialog =
        unsafe { CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)? };
    let image_files_name = HSTRING::from("Image files");
    let image_files_spec = HSTRING::from("*.png;*.jpg;*.jpeg;*.webp");
    let filters = [COMDLG_FILTERSPEC {
        pszName: PCWSTR(image_files_name.as_ptr()),
        pszSpec: PCWSTR(image_files_spec.as_ptr()),
    }];

    unsafe {
        dialog.SetTitle(&HSTRING::from("选择背景图片"))?;
        dialog.SetFileTypes(&filters)?;
        dialog.SetOptions(FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST)?;
        dialog.Show(None)?;
    }

    let item = unsafe { dialog.GetResult()? };
    let display_name = unsafe { item.GetDisplayName(SIGDN_FILESYSPATH)? };
    unsafe {
        let value = display_name.to_string()?;
        CoTaskMemFree(Some(display_name.as_ptr().cast()));
        Ok(value)
    }
}

#[cfg(target_os = "windows")]
unsafe fn pick_scan_root_directory_inner() -> windows::core::Result<String> {
    let dialog: IFileOpenDialog =
        unsafe { CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)? };

    unsafe {
        dialog.SetTitle(&HSTRING::from("选择扫描来源"))?;
        dialog.SetOptions(FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_PICKFOLDERS)?;
        dialog.Show(None)?;
    }

    let item = unsafe { dialog.GetResult()? };
    let display_name = unsafe { item.GetDisplayName(SIGDN_FILESYSPATH)? };
    unsafe {
        let value = display_name.to_string()?;
        CoTaskMemFree(Some(display_name.as_ptr().cast()));
        Ok(value)
    }
}

#[cfg(target_os = "windows")]
fn is_supported_launch_file(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("exe") | Some("lnk") | Some("url")
    )
}

#[cfg(target_os = "windows")]
fn is_supported_background_image(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("png") | Some("jpg") | Some("jpeg") | Some("webp")
    )
}

#[cfg(target_os = "windows")]
fn detect_background_image_extension(path: &Path, bytes: &[u8]) -> Option<&'static str> {
    match extension(path).as_deref() {
        Some("png") => Some("png"),
        Some("jpg") | Some("jpeg") => Some("jpg"),
        Some("webp") => Some("webp"),
        Some("bmp") => Some("bmp"),
        _ => detect_background_image_extension_from_bytes(bytes),
    }
}

#[cfg(target_os = "windows")]
fn detect_background_image_extension_from_bytes(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(PNG_SIGNATURE) {
        return Some("png");
    }
    if bytes.starts_with(b"\xff\xd8\xff") {
        return Some("jpg");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && bytes[8..12] == *b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(b"BM") {
        return Some("bmp");
    }
    None
}

#[cfg(target_os = "windows")]
fn background_image_mime_type(extension: &str) -> &'static str {
    match extension {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/png",
    }
}

#[cfg(target_os = "windows")]
fn make_picked_launch_file(
    app: &AppHandle,
    selected_path: &Path,
) -> Result<PickedLaunchFile, String> {
    let name = selected_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Application")
        .trim();
    let icon_source = selected_path;
    let icon_dir = icon_cache_dir(app)?;
    let icon_id = stable_app_id(&icon_source.to_string_lossy());
    let icon_path = cache_app_icon(icon_source, &icon_dir, &icon_id);
    let icon_data_url = icon_path.as_deref().and_then(icon_file_data_url);
    let launch_path = windows_api_path(selected_path);
    let launch_target = LaunchTarget {
        kind: match extension(selected_path).as_deref() {
            Some("exe") => "executable",
            _ => "shortcut",
        }
        .to_string(),
        path: Some(launch_path.clone()),
        app_user_model_id: None,
    };

    Ok(PickedLaunchFile {
        name: if name.is_empty() {
            "Application".to_string()
        } else {
            name.to_string()
        },
        path: launch_path,
        launch_target,
        launch_args: String::new(),
        icon_path,
        icon_data_url,
    })
}

#[cfg(target_os = "windows")]
const MAX_BACKGROUND_IMAGE_BYTES: u64 = 30 * 1024 * 1024;

#[cfg(target_os = "windows")]
fn background_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let background_dir = data_dir.join("backgrounds");
    fs::create_dir_all(&background_dir).map_err(|error| {
        format!(
            "Failed to create background cache directory {}: {error}",
            background_dir.display()
        )
    })?;
    Ok(background_dir)
}

#[cfg(target_os = "windows")]
fn cache_picked_background_image(
    app: &AppHandle,
    selected_path: &Path,
) -> Result<PickedBackgroundImage, String> {
    if !is_supported_background_image(selected_path) {
        return Err("Background images must be PNG, JPG, JPEG, or WEBP files".to_string());
    }
    cache_background_image(app, selected_path, "Background image")
}

#[cfg(target_os = "windows")]
fn cache_background_image(
    app: &AppHandle,
    selected_path: &Path,
    fallback_name: &str,
) -> Result<PickedBackgroundImage, String> {
    let metadata = fs::metadata(selected_path).map_err(|error| {
        format!(
            "Failed to read background image {}: {error}",
            selected_path.display()
        )
    })?;
    if !metadata.is_file() {
        return Err("Background image must be a file".to_string());
    }
    if metadata.len() > MAX_BACKGROUND_IMAGE_BYTES {
        return Err("Background image is larger than 30 MB".to_string());
    }

    let bytes = fs::read(selected_path).map_err(|error| {
        format!(
            "Failed to read background image {}: {error}",
            selected_path.display()
        )
    })?;
    let extension = detect_background_image_extension(selected_path, &bytes).ok_or_else(|| {
        "Background image must be a PNG, JPG, JPEG, WEBP, or BMP file".to_string()
    })?;
    let background_dir = background_cache_dir(app)?;
    let background_path = cache_content_addressed(&background_dir, "background", extension, &bytes)
        .map_err(|error| {
            format!(
                "Failed to cache background image {}: {error}",
                error.path().display(),
                error = error.source()
            )
        })?;

    Ok(PickedBackgroundImage {
        name: selected_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(fallback_name)
            .to_string(),
        image_path: windows_api_path(&background_path),
    })
}

#[cfg(target_os = "windows")]
fn cache_desktop_wallpaper_image(
    app: &AppHandle,
    selected_path: &Path,
) -> Result<PickedBackgroundImage, String> {
    let metadata = fs::metadata(selected_path).map_err(|error| {
        format!(
            "Failed to read desktop wallpaper {}: {error}",
            selected_path.display()
        )
    })?;
    let source_path = selected_path.to_string_lossy().to_string();
    let source_len = metadata.len();
    let source_modified = metadata.modified().ok();

    {
        let cache = DESKTOP_WALLPAPER_CACHE
            .lock()
            .map_err(|_| "Failed to lock desktop wallpaper cache".to_string())?;
        if let Some(record) = cache.as_ref() {
            if record.source_path == source_path
                && record.source_len == source_len
                && record.source_modified == source_modified
            {
                return Ok(record.picked.clone());
            }
        }
    }

    let picked = cache_background_image(app, selected_path, "Windows desktop wallpaper")?;
    let mut cache = DESKTOP_WALLPAPER_CACHE
        .lock()
        .map_err(|_| "Failed to lock desktop wallpaper cache".to_string())?;
    *cache = Some(DesktopWallpaperCacheRecord {
        source_path,
        source_len,
        source_modified,
        picked: picked.clone(),
    });
    Ok(picked)
}

#[cfg(target_os = "windows")]
fn current_desktop_wallpaper_path(app: &AppHandle) -> Result<String, String> {
    match current_desktop_wallpaper_path_for_window(app) {
        Ok(Some(path)) if !path.trim().is_empty() => Ok(path),
        Ok(_) | Err(_) => current_desktop_wallpaper_path_from_system_parameters(),
    }
}

#[cfg(target_os = "windows")]
fn current_desktop_wallpaper_path_for_window(app: &AppHandle) -> Result<Option<String>, String> {
    let _com_guard = ComGuard::new()?;
    let desktop_wallpaper: IDesktopWallpaper =
        unsafe { CoCreateInstance(&DesktopWallpaper, None, CLSCTX_ALL) }
            .map_err(|error| format!("Failed to create IDesktopWallpaper: {error}"))?;
    let target_rect = main_window_monitor_rect(app);
    let monitor_count = unsafe { desktop_wallpaper.GetMonitorDevicePathCount() }
        .map_err(|error| format!("Failed to enumerate desktop wallpaper monitors: {error}"))?;
    let mut best: Option<(i64, String)> = None;

    for index in 0..monitor_count {
        let monitor_id = unsafe { desktop_wallpaper.GetMonitorDevicePathAt(index) }
            .map_err(|error| format!("Failed to read desktop wallpaper monitor id: {error}"))?;
        let monitor_id_pcwstr = PCWSTR(monitor_id.as_ptr() as *const u16);
        let monitor_rect = unsafe { desktop_wallpaper.GetMonitorRECT(monitor_id_pcwstr) }.ok();
        let wallpaper = unsafe { desktop_wallpaper.GetWallpaper(monitor_id_pcwstr) };
        free_cotaskmem_string(monitor_id);
        let Ok(wallpaper) = wallpaper else {
            continue;
        };
        let wallpaper_path = take_cotaskmem_string(wallpaper)
            .map_err(|error| format!("Failed to read desktop wallpaper path: {error}"))?;
        let wallpaper_path = wallpaper_path.trim().to_string();
        if wallpaper_path.is_empty() {
            continue;
        }

        let Some(target_rect) = target_rect else {
            return Ok(Some(wallpaper_path));
        };
        let score = monitor_rect
            .map(|rect| rect_intersection_area(target_rect, rect))
            .unwrap_or(0);
        if best
            .as_ref()
            .map_or(true, |(best_score, _)| score > *best_score)
        {
            best = Some((score, wallpaper_path));
        }
    }

    Ok(best.map(|(_, path)| path))
}

#[cfg(target_os = "windows")]
fn current_desktop_wallpaper_path_from_system_parameters() -> Result<String, String> {
    const MAX_WALLPAPER_PATH_CHARS: usize = 32768;
    let mut buffer = vec![0u16; MAX_WALLPAPER_PATH_CHARS];
    unsafe {
        SystemParametersInfoW(
            SPI_GETDESKWALLPAPER,
            buffer.len() as u32,
            Some(buffer.as_mut_ptr().cast()),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
        .map_err(|error| format!("Failed to read Windows desktop wallpaper path: {error}"))?;
    }
    let end = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    Ok(String::from_utf16_lossy(&buffer[..end]))
}

#[cfg(target_os = "windows")]
fn main_window_monitor_rect(app: &AppHandle) -> Option<RECT> {
    let window = app.get_webview_window("main")?;
    let hwnd = window.hwnd().ok()?;
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if monitor.is_invalid() {
        return None;
    }
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    let ok = unsafe { GetMonitorInfoW(monitor, &mut info) };
    ok.as_bool().then_some(info.rcMonitor)
}

#[cfg(target_os = "windows")]
fn rect_intersection_area(left: RECT, right: RECT) -> i64 {
    let width = (left.right.min(right.right) - left.left.max(right.left)).max(0) as i64;
    let height = (left.bottom.min(right.bottom) - left.top.max(right.top)).max(0) as i64;
    width * height
}

#[cfg(target_os = "windows")]
fn free_cotaskmem_string(value: PWSTR) {
    if !value.is_null() {
        unsafe {
            CoTaskMemFree(Some(value.as_ptr().cast()));
        }
    }
}

#[cfg(target_os = "windows")]
fn take_cotaskmem_string(value: PWSTR) -> Result<String, std::string::FromUtf16Error> {
    let result = unsafe { value.to_string() };
    free_cotaskmem_string(value);
    result
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn supported_launch_files_include_url_shortcuts() {
        assert!(is_supported_launch_file(Path::new("C:/Apps/App.exe")));
        assert!(is_supported_launch_file(Path::new("C:/Apps/App.lnk")));
        assert!(is_supported_launch_file(Path::new("C:/Apps/App.url")));
        assert!(!is_supported_launch_file(Path::new("C:/Apps/readme.txt")));
    }

    #[test]
    fn supported_background_images_are_limited_to_static_images() {
        assert!(is_supported_background_image(Path::new(
            "C:/Images/wallpaper.png"
        )));
        assert!(is_supported_background_image(Path::new(
            "C:/Images/wallpaper.jpg"
        )));
        assert!(is_supported_background_image(Path::new(
            "C:/Images/wallpaper.jpeg"
        )));
        assert!(is_supported_background_image(Path::new(
            "C:/Images/wallpaper.webp"
        )));
        assert!(!is_supported_background_image(Path::new(
            "C:/Images/wallpaper.gif"
        )));
        assert!(!is_supported_background_image(Path::new(
            "C:/Images/wallpaper.exe"
        )));
    }

    #[test]
    fn rect_intersection_area_scores_monitor_overlap() {
        let launchpad_monitor = RECT {
            left: 1920,
            top: 0,
            right: 3840,
            bottom: 1080,
        };
        let same_monitor = RECT {
            left: 1920,
            top: 0,
            right: 3840,
            bottom: 1080,
        };
        let other_monitor = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };

        assert!(rect_intersection_area(launchpad_monitor, same_monitor) > 0);
        assert_eq!(rect_intersection_area(launchpad_monitor, other_monitor), 0);
    }
}
