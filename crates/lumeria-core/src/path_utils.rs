use std::path::Path;

pub fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
}

pub fn windows_api_path(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\")
}

#[cfg(target_os = "windows")]
pub fn expand_windows_env_vars(value: &str) -> String {
    use windows::{core::PCWSTR, Win32::System::Environment::ExpandEnvironmentStringsW};

    let source: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
    let required = unsafe { ExpandEnvironmentStringsW(PCWSTR(source.as_ptr()), None) };
    if required == 0 {
        return value.to_string();
    }

    let mut buffer = vec![0u16; required as usize];
    let written = unsafe { ExpandEnvironmentStringsW(PCWSTR(source.as_ptr()), Some(&mut buffer)) };
    if written == 0 || written as usize > buffer.len() {
        return value.to_string();
    }

    let end = buffer
        .iter()
        .position(|item| *item == 0)
        .unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

#[cfg(not(target_os = "windows"))]
pub fn expand_windows_env_vars(value: &str) -> String {
    value.to_string()
}

#[cfg(test)]
mod tests {
    use super::{expand_windows_env_vars, windows_api_path};
    use std::path::Path;

    #[test]
    fn windows_api_path_normalizes_mixed_separators() {
        let path = Path::new(r"C:\Users\233\AppData\Roaming/Microsoft/Windows/Start Menu");
        assert_eq!(
            windows_api_path(path),
            r"C:\Users\233\AppData\Roaming\Microsoft\Windows\Start Menu"
        );
    }

    #[test]
    fn expand_windows_env_vars_preserves_plain_paths() {
        assert_eq!(
            expand_windows_env_vars(r"C:\Apps\App.exe"),
            r"C:\Apps\App.exe"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn expand_windows_env_vars_uses_windows_api() {
        std::env::set_var("LUMERIA_TEST_EXPAND_ENV", r"C:\LumeriaTest");
        assert_eq!(
            expand_windows_env_vars(r"%LUMERIA_TEST_EXPAND_ENV%\App.exe"),
            r"C:\LumeriaTest\App.exe"
        );
        std::env::remove_var("LUMERIA_TEST_EXPAND_ENV");
    }
}
