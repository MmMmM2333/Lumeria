#[cfg(target_os = "windows")]
use crate::path_utils::extension;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum LaunchPathErrorKind {
    AccessDenied,
    BrokenShortcut,
    NoAssociation,
    TargetNotFound,
    #[cfg(not(target_os = "windows"))]
    UnsupportedPlatform,
    WindowsLaunchFailed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct LaunchPathError {
    pub(crate) kind: LaunchPathErrorKind,
    pub(crate) detail: String,
}

impl LaunchPathError {
    fn new(kind: LaunchPathErrorKind, detail: String) -> Self {
        Self { kind, detail }
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn launch_path(path: &str, launch_args: Option<&str>) -> Result<(), LaunchPathError> {
    use windows::{
        core::HSTRING,
        Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    };

    let file = HSTRING::from(path);
    let parameters = launch_args
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(HSTRING::from);

    let result = unsafe {
        match parameters.as_ref() {
            Some(parameters) => ShellExecuteW(None, None, &file, parameters, None, SW_SHOWNORMAL),
            None => ShellExecuteW(None, None, &file, None, None, SW_SHOWNORMAL),
        }
    };
    let result_code = result.0 as usize;
    if result_code <= 32 {
        return Err(classify_shell_execute_error(path, result_code));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn classify_shell_execute_error(path: &str, result_code: usize) -> LaunchPathError {
    let kind = match result_code {
        2 | 3 if extension(std::path::Path::new(path)).as_deref() == Some("lnk") => {
            LaunchPathErrorKind::BrokenShortcut
        }
        2 | 3 => LaunchPathErrorKind::TargetNotFound,
        5 => LaunchPathErrorKind::AccessDenied,
        31 => LaunchPathErrorKind::NoAssociation,
        _ => LaunchPathErrorKind::WindowsLaunchFailed,
    };
    LaunchPathError::new(
        kind,
        format!("ShellExecuteW returned {result_code} for {path}"),
    )
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn launch_path(_path: &str, _launch_args: Option<&str>) -> Result<(), LaunchPathError> {
    Err(LaunchPathError::new(
        LaunchPathErrorKind::UnsupportedPlatform,
        "Launching apps is only implemented on Windows".to_string(),
    ))
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{classify_shell_execute_error, LaunchPathErrorKind};

    #[test]
    fn classify_shell_execute_errors_for_user_facing_messages() {
        assert_eq!(
            classify_shell_execute_error(r"C:\Missing\App.exe", 2).kind,
            LaunchPathErrorKind::TargetNotFound
        );
        assert_eq!(
            classify_shell_execute_error(r"C:\Apps\Broken.lnk", 2).kind,
            LaunchPathErrorKind::BrokenShortcut
        );
        assert_eq!(
            classify_shell_execute_error("https://example.com", 31).kind,
            LaunchPathErrorKind::NoAssociation
        );
        assert_eq!(
            classify_shell_execute_error(r"C:\Apps\Admin.exe", 5).kind,
            LaunchPathErrorKind::AccessDenied
        );
    }
}
