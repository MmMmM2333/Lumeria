#[cfg(target_os = "windows")]
pub(crate) fn launch_path(path: &str, launch_args: Option<&str>) -> Result<(), String> {
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
        return Err(format!(
            "Failed to launch {path}: ShellExecuteW returned {result_code}"
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn launch_path(_path: &str, _launch_args: Option<&str>) -> Result<(), String> {
    Err("Launching apps is only implemented on Windows".to_string())
}
