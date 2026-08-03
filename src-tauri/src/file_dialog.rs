#[cfg(target_os = "windows")]
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::SystemTime,
};

use serde::Serialize;

#[cfg(target_os = "windows")]
use windows::{
    core::{HRESULT, HSTRING, PCWSTR, PWSTR},
    Win32::{
        Foundation::{ERROR_CANCELLED, HWND, RECT},
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
use crate::native_error::NativeError;
#[cfg(target_os = "windows")]
use crate::windows_com::ComGuard;
use crate::{
    catalog::{icon_cache_dir, icon_file_data_url, stable_app_id},
    current_app_locale, i18n,
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
#[derive(Clone, Debug, PartialEq, Eq)]
struct NativeFileDialogLabels {
    choose_launch_file: String,
    choose_background_image: String,
    choose_scan_root: String,
    launch_file_filter: String,
    image_file_filter: String,
}

#[cfg(target_os = "windows")]
fn native_file_dialog_labels(locale: &str) -> Result<NativeFileDialogLabels, String> {
    Ok(NativeFileDialogLabels {
        choose_launch_file: i18n::translate(locale, "native.dialogs.chooseApp", &[])?,
        choose_background_image: i18n::translate(locale, "native.dialogs.chooseBackground", &[])?,
        choose_scan_root: i18n::translate(locale, "native.dialogs.chooseScanSource", &[])?,
        launch_file_filter: i18n::translate(locale, "native.dialogs.executableFilter", &[])?,
        image_file_filter: i18n::translate(locale, "native.dialogs.imageFilter", &[])?,
    })
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
const NATIVE_DIALOG_BUSY_MESSAGE: &str = "Another native file dialog is already open";

#[cfg(target_os = "windows")]
static NATIVE_DIALOG_ACTIVE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
struct NativeDialogPermit;

#[cfg(target_os = "windows")]
impl NativeDialogPermit {
    fn acquire() -> Result<Self, String> {
        NATIVE_DIALOG_ACTIVE
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Self)
            .map_err(|_| NATIVE_DIALOG_BUSY_MESSAGE.to_string())
    }
}

#[cfg(target_os = "windows")]
impl Drop for NativeDialogPermit {
    fn drop(&mut self) {
        NATIVE_DIALOG_ACTIVE.store(false, Ordering::Release);
    }
}

#[cfg(target_os = "windows")]
async fn run_native_dialog<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let permit = NativeDialogPermit::acquire()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        work()
    })
    .await
    .map_err(|error| format!("Native file dialog worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn main_window_dialog_owner(app: &AppHandle) -> Result<isize, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable for the native file dialog".to_string())?;
    window
        .hwnd()
        .map(|hwnd| hwnd.0 as isize)
        .map_err(|source| NativeError::Tauri {
            context: "WebviewWindow::hwnd(native file dialog)",
            source,
        })
        .map_err(String::from)
}

#[cfg(target_os = "windows")]
pub(crate) async fn pick_launch_file(app: AppHandle) -> Result<Option<PickedLaunchFile>, String> {
    let owner = main_window_dialog_owner(&app)?;
    let labels = native_file_dialog_labels(&current_app_locale(&app)?)?;
    run_native_dialog(move || {
        let _com_guard = ComGuard::new()?;
        let result = unsafe { pick_launch_file_inner(HWND(owner as _), &labels) };
        match result {
            Ok(path) => make_picked_launch_file(&app, Path::new(&path)).map(Some),
            Err(error) if error.windows_code() == Some(HRESULT::from_win32(ERROR_CANCELLED.0)) => {
                Ok(None)
            }
            Err(error) => Err(String::from(error)),
        }
    })
    .await
}

#[cfg(not(target_os = "windows"))]
pub(crate) async fn pick_launch_file(
    _app: tauri::AppHandle,
) -> Result<Option<PickedLaunchFile>, String> {
    Err("Picking launch files is only implemented on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub(crate) async fn pick_background_image(
    app: AppHandle,
) -> Result<Option<PickedBackgroundImage>, String> {
    let owner = main_window_dialog_owner(&app)?;
    let labels = native_file_dialog_labels(&current_app_locale(&app)?)?;
    run_native_dialog(move || {
        let _com_guard = ComGuard::new()?;
        let result = unsafe { pick_background_image_inner(HWND(owner as _), &labels) };
        match result {
            Ok(path) => cache_picked_background_image(&app, Path::new(&path)).map(Some),
            Err(error) if error.windows_code() == Some(HRESULT::from_win32(ERROR_CANCELLED.0)) => {
                Ok(None)
            }
            Err(error) => Err(String::from(error)),
        }
    })
    .await
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
pub(crate) async fn pick_background_image(
    _app: tauri::AppHandle,
) -> Result<Option<PickedBackgroundImage>, String> {
    Err("Picking background images is only implemented on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub(crate) async fn pick_scan_root_directory(app: AppHandle) -> Result<Option<String>, String> {
    let owner = main_window_dialog_owner(&app)?;
    let labels = native_file_dialog_labels(&current_app_locale(&app)?)?;
    run_native_dialog(move || {
        let _com_guard = ComGuard::new()?;
        let result = unsafe { pick_scan_root_directory_inner(HWND(owner as _), &labels) };
        match result {
            Ok(path) => Ok(Some(path)),
            Err(error) if error.windows_code() == Some(HRESULT::from_win32(ERROR_CANCELLED.0)) => {
                Ok(None)
            }
            Err(error) => Err(String::from(error)),
        }
    })
    .await
}

#[cfg(not(target_os = "windows"))]
pub(crate) async fn pick_scan_root_directory(
    _app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    Err("Picking scan root directories is only implemented on Windows".to_string())
}

#[cfg(target_os = "windows")]
unsafe fn pick_launch_file_inner(
    owner: HWND,
    labels: &NativeFileDialogLabels,
) -> Result<String, NativeError> {
    let dialog: IFileOpenDialog = unsafe {
        CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(|source| {
            NativeError::Com {
                context: "CoCreateInstance(FileOpenDialog launch file)",
                source,
            }
        })?
    };
    let launch_files_name = HSTRING::from(labels.launch_file_filter.as_str());
    let launch_files_spec = HSTRING::from("*.exe;*.lnk;*.url");
    let filters = [COMDLG_FILTERSPEC {
        pszName: PCWSTR(launch_files_name.as_ptr()),
        pszSpec: PCWSTR(launch_files_spec.as_ptr()),
    }];

    unsafe {
        dialog
            .SetTitle(&HSTRING::from(labels.choose_launch_file.as_str()))
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::SetTitle(launch file)",
                source,
            })?;
        dialog
            .SetFileTypes(&filters)
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::SetFileTypes(launch file)",
                source,
            })?;
        dialog
            .SetOptions(FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST)
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::SetOptions(launch file)",
                source,
            })?;
        dialog
            .Show(Some(owner))
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::Show(launch file)",
                source,
            })?;
    }

    let item = unsafe { dialog.GetResult() }.map_err(|source| NativeError::Com {
        context: "IFileOpenDialog::GetResult(launch file)",
        source,
    })?;
    let display_name =
        unsafe { item.GetDisplayName(SIGDN_FILESYSPATH) }.map_err(|source| NativeError::Com {
            context: "IShellItem::GetDisplayName(launch file)",
            source,
        })?;
    let path = take_cotaskmem_string(display_name).map_err(|source| NativeError::Utf16 {
        context: "launch file path",
        source,
    })?;

    if is_supported_launch_file(Path::new(&path)) {
        Ok(path)
    } else {
        Err(NativeError::Shell {
            context: "unsupported launch file type",
            source: windows::core::Error::new(
                HRESULT::from_win32(ERROR_CANCELLED.0),
                "Unsupported launch file type",
            ),
        })
    }
}

#[cfg(target_os = "windows")]
unsafe fn pick_background_image_inner(
    owner: HWND,
    labels: &NativeFileDialogLabels,
) -> Result<String, NativeError> {
    let dialog: IFileOpenDialog = unsafe {
        CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(|source| {
            NativeError::Com {
                context: "CoCreateInstance(FileOpenDialog background image)",
                source,
            }
        })?
    };
    let image_files_name = HSTRING::from(labels.image_file_filter.as_str());
    let image_files_spec = HSTRING::from("*.png;*.jpg;*.jpeg;*.webp");
    let filters = [COMDLG_FILTERSPEC {
        pszName: PCWSTR(image_files_name.as_ptr()),
        pszSpec: PCWSTR(image_files_spec.as_ptr()),
    }];

    unsafe {
        dialog
            .SetTitle(&HSTRING::from(labels.choose_background_image.as_str()))
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::SetTitle(background image)",
                source,
            })?;
        dialog
            .SetFileTypes(&filters)
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::SetFileTypes(background image)",
                source,
            })?;
        dialog
            .SetOptions(FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST)
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::SetOptions(background image)",
                source,
            })?;
        dialog
            .Show(Some(owner))
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::Show(background image)",
                source,
            })?;
    }

    let item = unsafe { dialog.GetResult() }.map_err(|source| NativeError::Com {
        context: "IFileOpenDialog::GetResult(background image)",
        source,
    })?;
    let display_name =
        unsafe { item.GetDisplayName(SIGDN_FILESYSPATH) }.map_err(|source| NativeError::Com {
            context: "IShellItem::GetDisplayName(background image)",
            source,
        })?;
    take_cotaskmem_string(display_name).map_err(|source| NativeError::Utf16 {
        context: "background image path",
        source,
    })
}

#[cfg(target_os = "windows")]
unsafe fn pick_scan_root_directory_inner(
    owner: HWND,
    labels: &NativeFileDialogLabels,
) -> Result<String, NativeError> {
    let dialog: IFileOpenDialog = unsafe {
        CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(|source| {
            NativeError::Com {
                context: "CoCreateInstance(FileOpenDialog scan root)",
                source,
            }
        })?
    };

    unsafe {
        dialog
            .SetTitle(&HSTRING::from(labels.choose_scan_root.as_str()))
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::SetTitle(scan root)",
                source,
            })?;
        dialog
            .SetOptions(FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_PICKFOLDERS)
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::SetOptions(scan root)",
                source,
            })?;
        dialog
            .Show(Some(owner))
            .map_err(|source| NativeError::Com {
                context: "IFileOpenDialog::Show(scan root)",
                source,
            })?;
    }

    let item = unsafe { dialog.GetResult() }.map_err(|source| NativeError::Com {
        context: "IFileOpenDialog::GetResult(scan root)",
        source,
    })?;
    let display_name =
        unsafe { item.GetDisplayName(SIGDN_FILESYSPATH) }.map_err(|source| NativeError::Com {
            context: "IShellItem::GetDisplayName(scan root)",
            source,
        })?;
    take_cotaskmem_string(display_name).map_err(|source| NativeError::Utf16 {
        context: "scan root path",
        source,
    })
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
        .map_err(|source| NativeError::Tauri {
            context: "PathResolver::app_data_dir(background cache)",
            source,
        })?;
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
fn current_desktop_wallpaper_path_for_window(
    app: &AppHandle,
) -> Result<Option<String>, NativeError> {
    let _com_guard = ComGuard::new()?;
    let desktop_wallpaper: IDesktopWallpaper = unsafe {
        CoCreateInstance(&DesktopWallpaper, None, CLSCTX_ALL)
    }
    .map_err(|source| NativeError::Com {
        context: "CoCreateInstance(DesktopWallpaper)",
        source,
    })?;
    let target_rect = main_window_monitor_rect(app);
    let monitor_count =
        unsafe { desktop_wallpaper.GetMonitorDevicePathCount() }.map_err(|source| {
            NativeError::Com {
                context: "IDesktopWallpaper::GetMonitorDevicePathCount",
                source,
            }
        })?;
    let mut best: Option<(i64, String)> = None;

    for index in 0..monitor_count {
        let monitor_id =
            unsafe { desktop_wallpaper.GetMonitorDevicePathAt(index) }.map_err(|source| {
                NativeError::Com {
                    context: "IDesktopWallpaper::GetMonitorDevicePathAt",
                    source,
                }
            })?;
        let monitor_id_pcwstr = PCWSTR(monitor_id.as_ptr() as *const u16);
        let monitor_rect = unsafe { desktop_wallpaper.GetMonitorRECT(monitor_id_pcwstr) }.ok();
        let wallpaper = unsafe { desktop_wallpaper.GetWallpaper(monitor_id_pcwstr) };
        free_cotaskmem_string(monitor_id);
        let Ok(wallpaper) = wallpaper else {
            continue;
        };
        let wallpaper_path =
            take_cotaskmem_string(wallpaper).map_err(|source| NativeError::Utf16 {
                context: "desktop wallpaper path",
                source,
            })?;
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
        .map_err(|source| NativeError::Win32 {
            context: "SystemParametersInfoW(SPI_GETDESKWALLPAPER)",
            source,
        })?;
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
    fn native_file_dialog_labels_use_the_shared_locale_catalog() {
        let chinese = native_file_dialog_labels("zh-CN").expect("Chinese dialog labels");
        let english = native_file_dialog_labels("en-US").expect("English dialog labels");

        assert_eq!(chinese.choose_launch_file, "选择应用");
        assert_eq!(chinese.choose_background_image, "选择背景图片");
        assert_eq!(english.choose_scan_root, "Choose a scan source");
        assert_eq!(english.launch_file_filter, "Applications and shortcuts");
        assert_eq!(english.image_file_filter, "Images");
    }

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

    #[test]
    fn native_dialog_jobs_run_off_thread_and_reject_concurrent_requests() {
        let calling_thread = std::thread::current().id();
        tauri::async_runtime::block_on(async {
            let (started_sender, started_receiver) = std::sync::mpsc::channel();
            let (release_sender, release_receiver) = std::sync::mpsc::channel();
            let first = tauri::async_runtime::spawn(async move {
                run_native_dialog(move || {
                    started_sender.send(()).unwrap();
                    release_receiver.recv().unwrap();
                    Ok::<_, String>("first")
                })
                .await
            });

            started_receiver
                .recv_timeout(std::time::Duration::from_secs(2))
                .expect("first native dialog job did not start");

            let busy = run_native_dialog(|| Ok::<_, String>("second"))
                .await
                .expect_err("a concurrent native dialog should be rejected");
            assert_eq!(busy, NATIVE_DIALOG_BUSY_MESSAGE);

            release_sender.send(()).unwrap();
            assert_eq!(first.await.unwrap().unwrap(), "first");
            let worker_thread = run_native_dialog(|| Ok::<_, String>(std::thread::current().id()))
                .await
                .unwrap();
            assert_ne!(worker_thread, calling_thread);
        });
    }
}
