#[cfg(target_os = "windows")]
use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

#[cfg(target_os = "windows")]
use windows::{
    core::{HRESULT, HSTRING, PCWSTR},
    Win32::{
        Foundation::ERROR_CANCELLED,
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        },
        UI::Shell::{
            Common::COMDLG_FILTERSPEC, FileOpenDialog, IFileOpenDialog, FOS_FILEMUSTEXIST,
            FOS_FORCEFILESYSTEM, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
        },
        UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        },
    },
};

#[cfg(target_os = "windows")]
use tauri::{AppHandle, Manager};

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
    let path = current_desktop_wallpaper_path()?;
    let path = path.trim();
    if path.is_empty() {
        return Ok(None);
    }
    cache_background_image(app, Path::new(path), "Windows desktop wallpaper").map(Some)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn get_desktop_wallpaper_background(
    _app: &tauri::AppHandle,
) -> Result<Option<PickedBackgroundImage>, String> {
    Err("Desktop wallpaper backgrounds are only implemented on Windows".to_string())
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
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
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
    let hash = blake3::hash(&bytes);
    let hex = hash.to_hex();
    let extension = detect_background_image_extension(selected_path, &bytes).ok_or_else(|| {
        "Background image must be a PNG, JPG, JPEG, WEBP, or BMP file".to_string()
    })?;
    let background_dir = background_cache_dir(app)?;
    let background_path = background_dir.join(format!("background-{}.{}", &hex[..32], extension));
    if !background_path.exists() {
        fs::write(&background_path, &bytes).map_err(|error| {
            format!(
                "Failed to cache background image {}: {error}",
                background_path.display()
            )
        })?;
    }

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
fn current_desktop_wallpaper_path() -> Result<String, String> {
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
struct ComGuard {
    initialized: bool,
}

#[cfg(target_os = "windows")]
impl ComGuard {
    fn new() -> Result<Self, String> {
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }
            .ok()
            .map_err(|error| format!("Failed to initialize COM apartment: {error}"))?;
        Ok(Self { initialized: true })
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
}
