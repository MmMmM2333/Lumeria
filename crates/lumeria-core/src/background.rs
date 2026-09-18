#[cfg(target_os = "windows")]
use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

#[cfg(target_os = "windows")]
use windows::{
    core::{PCWSTR, PWSTR},
    Win32::{
        Foundation::RECT,
        System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL},
        UI::Shell::{DesktopWallpaper, IDesktopWallpaper},
        UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        },
    },
};

#[cfg(target_os = "windows")]
use crate::encoding::{cache_content_addressed, encode_base64, PNG_SIGNATURE};
#[cfg(target_os = "windows")]
use crate::native_error::NativeError;
#[cfg(target_os = "windows")]
use crate::path_utils::{extension, windows_api_path};
#[cfg(target_os = "windows")]
use crate::windows_com::ComGuard;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedBackgroundImage {
    pub name: String,
    pub image_path: String,
}

#[cfg(target_os = "windows")]
const MAX_BACKGROUND_IMAGE_BYTES: u64 = 30 * 1024 * 1024;

#[cfg(target_os = "windows")]
pub fn is_supported_background_image(path: &Path) -> bool {
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
pub fn cache_background_image_to_dir(
    background_dir: &Path,
    selected_path: &Path,
    fallback_name: &str,
) -> Result<PickedBackgroundImage, String> {
    if !selected_path.is_absolute() {
        return Err("Background image path must be absolute".into());
    }
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
    fs::create_dir_all(background_dir).map_err(|error| error.to_string())?;
    let background_path = cache_content_addressed(background_dir, "background", extension, &bytes)
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
pub fn cache_native_wallpaper(
    background_dir: &Path,
    rect: [i32; 4],
) -> Result<Option<PickedBackgroundImage>, String> {
    let target = RECT {
        left: rect[0],
        top: rect[1],
        right: rect[2],
        bottom: rect[3],
    };
    if target.right <= target.left || target.bottom <= target.top {
        return Err("Invalid wallpaper monitor bounds".into());
    }
    let path = match desktop_wallpaper_for_rect(Some(rect)) {
        Ok(Some(path)) if !path.trim().is_empty() => path,
        _ => current_desktop_wallpaper_path_from_system_parameters()?,
    };
    if path.trim().is_empty() {
        return Ok(None);
    }
    cache_background_image_to_dir(
        background_dir,
        Path::new(&path),
        "Windows desktop wallpaper",
    )
    .map(Some)
}

#[cfg(target_os = "windows")]
pub fn desktop_wallpaper_for_rect(
    target_rect: Option<[i32; 4]>,
) -> Result<Option<String>, NativeError> {
    let _com_guard = ComGuard::new()?;
    let desktop_wallpaper: IDesktopWallpaper = unsafe {
        CoCreateInstance(&DesktopWallpaper, None, CLSCTX_ALL)
    }
    .map_err(|source| NativeError::Com {
        context: "CoCreateInstance(DesktopWallpaper)",
        source,
    })?;
    let monitor_count =
        unsafe { desktop_wallpaper.GetMonitorDevicePathCount() }.map_err(|source| {
            NativeError::Com {
                context: "IDesktopWallpaper::GetMonitorDevicePathCount",
                source,
            }
        })?;
    let target_rect = target_rect.map(|rect| RECT {
        left: rect[0],
        top: rect[1],
        right: rect[2],
        bottom: rect[3],
    });
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
pub fn current_desktop_wallpaper_path_from_system_parameters() -> Result<String, String> {
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
pub fn cached_background_image_data_url(
    background_dir: &Path,
    image_path: &str,
) -> Result<Option<String>, String> {
    let image_path = image_path.trim();
    if image_path.is_empty() {
        return Ok(None);
    }

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
