#[cfg(target_os = "windows")]
use std::path::{Path, PathBuf};

use serde::Serialize;

#[cfg(target_os = "windows")]
use windows::{
    core::{Interface, HRESULT, HSTRING, PCWSTR},
    Win32::{
        Foundation::ERROR_CANCELLED,
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
        },
        UI::Shell::{
            Common::COMDLG_FILTERSPEC, FileOpenDialog, IFileOpenDialog, IShellLinkW, ShellLink,
            FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, SIGDN_FILESYSPATH, SLGP_UNCPRIORITY,
        },
    },
};

#[cfg(target_os = "windows")]
use tauri::AppHandle;

use crate::{
    catalog::{icon_cache_dir, icon_file_data_url, stable_app_id},
    icons::cache_app_icon,
    path_utils::{extension, windows_api_path},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PickedLaunchFile {
    name: String,
    path: String,
    launch_args: String,
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
unsafe fn pick_launch_file_inner() -> windows::core::Result<String> {
    let dialog: IFileOpenDialog =
        unsafe { CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)? };
    let launch_files_name = HSTRING::from("Applications and shortcuts");
    let launch_files_spec = HSTRING::from("*.exe;*.lnk");
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
fn is_supported_launch_file(path: &Path) -> bool {
    matches!(extension(path).as_deref(), Some("exe") | Some("lnk"))
}

#[cfg(target_os = "windows")]
fn make_picked_launch_file(
    app: &AppHandle,
    selected_path: &Path,
) -> Result<PickedLaunchFile, String> {
    let shortcut = if extension(selected_path).as_deref() == Some("lnk") {
        resolve_shortcut(selected_path)
    } else {
        None
    };
    let launch_path = shortcut
        .as_ref()
        .and_then(|info| info.target_path.clone())
        .unwrap_or_else(|| selected_path.to_path_buf());
    let name = selected_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Application")
        .trim();
    let icon_source = selected_path;
    let icon_dir = icon_cache_dir(app)?;
    let icon_id = stable_app_id(&icon_source.to_string_lossy());
    let icon_data_url = cache_app_icon(icon_source, &icon_dir, &icon_id)
        .as_deref()
        .and_then(icon_file_data_url);

    Ok(PickedLaunchFile {
        name: if name.is_empty() {
            "Application".to_string()
        } else {
            name.to_string()
        },
        path: launch_path.to_string_lossy().to_string(),
        launch_args: shortcut
            .as_ref()
            .map(|info| info.arguments.clone())
            .unwrap_or_default(),
        icon_data_url,
    })
}

#[cfg(target_os = "windows")]
#[derive(Clone, Debug)]
struct ShortcutInfo {
    target_path: Option<PathBuf>,
    arguments: String,
}

#[cfg(target_os = "windows")]
fn resolve_shortcut(path: &Path) -> Option<ShortcutInfo> {
    let shell_link =
        unsafe { CoCreateInstance::<_, IShellLinkW>(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()? };
    let persist_file = shell_link.cast::<IPersistFile>().ok()?;
    let shortcut = HSTRING::from(windows_api_path(path));
    unsafe { persist_file.Load(&shortcut, STGM_READ).ok()? };

    let mut target_path = [0u16; 1024];
    let resolved_target = unsafe {
        shell_link
            .GetPath(
                &mut target_path,
                std::ptr::null_mut(),
                SLGP_UNCPRIORITY.0 as u32,
            )
            .ok()
            .and_then(|_| path_from_wide_buffer(&target_path))
    };

    let mut arguments = [0u16; 2048];
    let resolved_arguments = unsafe {
        shell_link
            .GetArguments(&mut arguments)
            .ok()
            .and_then(|_| string_from_wide_buffer(&arguments))
            .unwrap_or_default()
    };

    Some(ShortcutInfo {
        target_path: resolved_target,
        arguments: resolved_arguments,
    })
}

#[cfg(target_os = "windows")]
fn path_from_wide_buffer(buffer: &[u16]) -> Option<PathBuf> {
    let value = string_from_wide_buffer(buffer)?;
    let path = PathBuf::from(value.trim_matches('"').trim());
    path.exists().then_some(path)
}

#[cfg(target_os = "windows")]
fn string_from_wide_buffer(buffer: &[u16]) -> Option<String> {
    let length = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    if length == 0 {
        return None;
    }
    let value = String::from_utf16_lossy(&buffer[..length]);
    let value = value.trim().to_string();
    (!value.is_empty()).then_some(value)
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
