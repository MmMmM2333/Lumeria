#[cfg(target_os = "windows")]
use crate::{path_utils::extension, windows_com::ComGuard};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LaunchPathErrorKind {
    Cancelled,
    AccessDenied,
    BrokenShortcut,
    NoAssociation,
    TargetNotFound,
    #[cfg(not(target_os = "windows"))]
    UnsupportedPlatform,
    WindowsLaunchFailed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LaunchPathError {
    pub kind: LaunchPathErrorKind,
    pub detail: String,
}

impl LaunchPathError {
    fn new(kind: LaunchPathErrorKind, detail: String) -> Self {
        Self { kind, detail }
    }
}

#[cfg(target_os = "windows")]
pub fn launch_path(path: &str, launch_args: Option<&str>) -> Result<(), LaunchPathError> {
    use windows::{
        core::{HSTRING, PCWSTR},
        Win32::UI::{
            Shell::{ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW},
            WindowsAndMessaging::SW_SHOWNORMAL,
        },
    };

    let _com_guard = ComGuard::new().map_err(|error| {
        LaunchPathError::new(
            LaunchPathErrorKind::WindowsLaunchFailed,
            format!("Failed to initialize COM before ShellExecuteExW for {path}: {error}"),
        )
    })?;
    let file = HSTRING::from(path);
    let parameters = launch_args
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(HSTRING::from);

    let mut request = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_FLAG_NO_UI | SEE_MASK_NOASYNC,
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: parameters
            .as_ref()
            .map_or(PCWSTR::null(), |value| PCWSTR(value.as_ptr())),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    unsafe { ShellExecuteExW(&mut request) }
        .map_err(|error| classify_shell_execute_error(path, error.code().0 as u32 & 0xffff))?;

    Ok(())
}

#[cfg(target_os = "windows")]
pub fn launch_app_user_model_id(app_user_model_id: &str) -> Result<(), LaunchPathError> {
    use windows::{
        core::{HSTRING, PCWSTR},
        Win32::{
            System::Com::{CoCreateInstance, CLSCTX_LOCAL_SERVER},
            UI::Shell::{ApplicationActivationManager, IApplicationActivationManager, AO_NONE},
        },
    };

    let app_user_model_id = app_user_model_id.trim();
    if app_user_model_id.is_empty() {
        return Err(LaunchPathError::new(
            LaunchPathErrorKind::TargetNotFound,
            "AppUserModelId is empty".to_string(),
        ));
    }

    let _com_guard = ComGuard::new().map_err(|error| {
        classify_activation_error(
            app_user_model_id,
            "CoInitializeEx(IApplicationActivationManager)",
            windows::core::Error::new(
                error
                    .windows_code()
                    .unwrap_or(windows::core::HRESULT(0x80004005u32 as i32)),
                error.to_string(),
            ),
        )
    })?;
    let manager: IApplicationActivationManager =
        unsafe { CoCreateInstance(&ApplicationActivationManager, None, CLSCTX_LOCAL_SERVER) }
            .map_err(|source| {
                classify_activation_error(
                    app_user_model_id,
                    "CoCreateInstance(ApplicationActivationManager)",
                    source,
                )
            })?;
    let identifier = HSTRING::from(app_user_model_id);
    unsafe { manager.ActivateApplication(&identifier, PCWSTR::null(), AO_NONE) }.map_err(
        |source| {
            classify_activation_error(
                app_user_model_id,
                "IApplicationActivationManager::ActivateApplication",
                source,
            )
        },
    )?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn classify_shell_execute_error(path: &str, result_code: u32) -> LaunchPathError {
    let kind = match result_code {
        2 | 3 if extension(std::path::Path::new(path)).as_deref() == Some("lnk") => {
            LaunchPathErrorKind::BrokenShortcut
        }
        2 | 3 => LaunchPathErrorKind::TargetNotFound,
        5 => LaunchPathErrorKind::AccessDenied,
        31 | 1155 => LaunchPathErrorKind::NoAssociation,
        1223 => LaunchPathErrorKind::Cancelled,
        _ => LaunchPathErrorKind::WindowsLaunchFailed,
    };
    LaunchPathError::new(
        kind,
        format!("ShellExecuteExW failed with Win32 error {result_code} for {path}"),
    )
}

#[cfg(target_os = "windows")]
fn classify_activation_error(
    app_user_model_id: &str,
    context: &str,
    source: windows::core::Error,
) -> LaunchPathError {
    let code = source.code().0 as u32;
    let kind = match code {
        0x800704C7 => LaunchPathErrorKind::Cancelled,
        0x80070005 => LaunchPathErrorKind::AccessDenied,
        0x80070002 | 0x80070003 | 0x80070490 | 0x80073CF1 => LaunchPathErrorKind::TargetNotFound,
        _ => LaunchPathErrorKind::WindowsLaunchFailed,
    };
    LaunchPathError::new(
        kind,
        format!("{context} failed for {app_user_model_id}: {source} (HRESULT 0x{code:08X})"),
    )
}

#[cfg(not(target_os = "windows"))]
pub fn launch_path(_path: &str, _launch_args: Option<&str>) -> Result<(), LaunchPathError> {
    Err(LaunchPathError::new(
        LaunchPathErrorKind::UnsupportedPlatform,
        "Launching apps is only implemented on Windows".to_string(),
    ))
}

#[cfg(not(target_os = "windows"))]
pub fn launch_app_user_model_id(_app_user_model_id: &str) -> Result<(), LaunchPathError> {
    Err(LaunchPathError::new(
        LaunchPathErrorKind::UnsupportedPlatform,
        "Launching apps is only implemented on Windows".to_string(),
    ))
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{
        classify_activation_error, classify_shell_execute_error, launch_app_user_model_id,
        LaunchPathErrorKind,
    };

    #[test]
    fn classify_shell_execute_errors_for_user_facing_messages() {
        assert_eq!(
            classify_shell_execute_error(r"C:\Apps\Admin.exe", 1223).kind,
            LaunchPathErrorKind::Cancelled
        );
        assert_eq!(
            classify_shell_execute_error("unknown:target", 1155).kind,
            LaunchPathErrorKind::NoAssociation
        );
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

    #[test]
    fn classify_app_activation_errors_for_user_facing_messages() {
        assert_eq!(
            classify_activation_error(
                "Example.App_123!App",
                "ActivateApplication",
                windows::core::Error::from_hresult(windows::core::HRESULT(0x80070490u32 as i32)),
            )
            .kind,
            LaunchPathErrorKind::TargetNotFound
        );
        assert_eq!(
            classify_activation_error(
                "Example.App_123!App",
                "ActivateApplication",
                windows::core::Error::from_hresult(windows::core::HRESULT(0x80070005u32 as i32)),
            )
            .kind,
            LaunchPathErrorKind::AccessDenied
        );
    }

    #[test]
    #[ignore = "calls the Windows application activation service"]
    fn application_activation_manager_rejects_unknown_aumid_smoke() {
        let error =
            launch_app_user_model_id("Lumeria.Nonexistent.Package_0000000000000!MissingApp")
                .expect_err("an unregistered AppUserModelId should fail");

        println!("{}", error.detail);
        assert!(matches!(
            error.kind,
            LaunchPathErrorKind::TargetNotFound | LaunchPathErrorKind::WindowsLaunchFailed
        ));
    }
}
