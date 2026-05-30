#[cfg(target_os = "windows")]
use std::path::Path;

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
    },
};

#[cfg(target_os = "windows")]
use tauri::AppHandle;

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

#[cfg(target_os = "windows")]
pub(crate) fn pick_launch_file(app: &AppHandle) -> Result<Option<PickedLaunchFile>, String> {
    let _com_guard = ComGuard::new();
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
pub(crate) fn pick_scan_root_directory() -> Result<Option<String>, String> {
    let _com_guard = ComGuard::new();
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
}
