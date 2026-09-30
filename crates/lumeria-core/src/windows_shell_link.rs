use std::path::{Path, PathBuf};

use windows::{
    core::{Interface, HSTRING},
    Win32::{
        System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ},
        UI::Shell::{
            IShellLinkDataList, IShellLinkW, ShellLink, SLDF_RUNAS_USER, SLGP_UNCPRIORITY,
        },
    },
};

use crate::{
    native_error::NativeError,
    path_utils::{expand_windows_env_vars, windows_api_path},
    windows_com::ComGuard,
};

const SHELL_LINK_STRING_CAPACITY: usize = 32_768;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub(crate) struct ShellLinkMetadata {
    pub(crate) target_path: Option<PathBuf>,
    pub(crate) arguments: String,
    pub(crate) working_directory: Option<PathBuf>,
    pub(crate) show_command: i32,
    pub(crate) run_as: bool,
    pub(crate) icon_path: Option<PathBuf>,
    pub(crate) icon_index: i32,
}

pub(crate) fn load_shell_link(path: &Path) -> Result<ShellLinkMetadata, String> {
    crate::catalog_metadata::cached("shortcut", path, || load_shell_link_uncached(path))
}

fn load_shell_link_uncached(path: &Path) -> Result<ShellLinkMetadata, String> {
    let _com_guard = ComGuard::new()?;
    let shell_link: IShellLinkW = unsafe {
        CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(|source| {
            NativeError::Com {
                context: "CoCreateInstance(ShellLink)",
                source,
            }
        })?
    };
    let persist_file: IPersistFile = shell_link.cast().map_err(|source| NativeError::Com {
        context: "IShellLinkW::cast(IPersistFile)",
        source,
    })?;
    let shortcut_path = HSTRING::from(windows_api_path(path));
    unsafe {
        persist_file
            .Load(&shortcut_path, STGM_READ)
            .map_err(|source| NativeError::Com {
                context: "IPersistFile::Load(shortcut)",
                source,
            })?;
    }

    let mut target_path = [0u16; SHELL_LINK_STRING_CAPACITY];
    unsafe {
        shell_link
            .GetPath(
                &mut target_path,
                std::ptr::null_mut(),
                SLGP_UNCPRIORITY.0 as u32,
            )
            .map_err(|source| NativeError::Shell {
                context: "IShellLinkW::GetPath",
                source,
            })?;
    }

    let mut arguments = [0u16; SHELL_LINK_STRING_CAPACITY];
    unsafe {
        shell_link
            .GetArguments(&mut arguments)
            .map_err(|source| NativeError::Shell {
                context: "IShellLinkW::GetArguments",
                source,
            })?;
    }

    let mut working_directory = [0u16; SHELL_LINK_STRING_CAPACITY];
    unsafe {
        shell_link
            .GetWorkingDirectory(&mut working_directory)
            .map_err(|source| NativeError::Shell {
                context: "IShellLinkW::GetWorkingDirectory",
                source,
            })?;
    }

    let show_command = unsafe {
        shell_link
            .GetShowCmd()
            .map_err(|source| NativeError::Shell {
                context: "IShellLinkW::GetShowCmd",
                source,
            })?
            .0
    };
    let data_list: IShellLinkDataList = shell_link.cast().map_err(|source| NativeError::Com {
        context: "IShellLinkW::cast(IShellLinkDataList)",
        source,
    })?;
    let flags = unsafe {
        data_list.GetFlags().map_err(|source| NativeError::Shell {
            context: "IShellLinkDataList::GetFlags",
            source,
        })?
    };

    let mut icon_path = [0u16; SHELL_LINK_STRING_CAPACITY];
    let mut icon_index = 0;
    let icon_location = unsafe { shell_link.GetIconLocation(&mut icon_path, &mut icon_index) };
    let icon_path = match icon_location {
        Ok(()) => path_from_wide_buffer(&icon_path),
        Err(error) => {
            log::debug!(
                target: "windows-shell-link",
                "Failed to read optional icon metadata from {}: {}",
                path.display(),
                error
            );
            icon_index = 0;
            None
        }
    };

    Ok(ShellLinkMetadata {
        target_path: path_from_wide_buffer(&target_path),
        arguments: string_from_wide_buffer(&arguments),
        working_directory: path_from_wide_buffer(&working_directory),
        show_command,
        run_as: flags & SLDF_RUNAS_USER.0 as u32 != 0,
        icon_path,
        icon_index,
    })
}

fn path_from_wide_buffer(buffer: &[u16]) -> Option<PathBuf> {
    let value = string_from_wide_buffer(buffer);
    let value = expand_windows_env_vars(value.trim_matches('"').trim());
    (!value.is_empty()).then(|| PathBuf::from(value))
}

fn string_from_wide_buffer(buffer: &[u16]) -> String {
    let length = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..length])
        .trim()
        .to_string()
}
