use std::{
    ffi::{OsStr, OsString},
    path::Path,
};

pub const AUTOSTART_ARGUMENT: &str = "--lumeria-autostart";

const AUTOSTART_VALUE_NAME: &str = "Lumeria";
const RUN_REGISTRY_PATH: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
const STARTUP_APPROVED_REGISTRY_PATH: &str =
    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

#[cfg(target_os = "windows")]
const STARTUP_APPROVED_ENABLED_VALUE: [u8; 12] = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

pub fn autostart_run_command(executable: &Path) -> OsString {
    let mut command = OsString::from("\"");
    command.push(executable.as_os_str());
    command.push("\" ");
    command.push(AUTOSTART_ARGUMENT);
    command
}

fn autostart_status(
    expected_command: &OsStr,
    registered_command: Option<&OsStr>,
    startup_approved_value: Option<&[u8]>,
) -> bool {
    if registered_command != Some(expected_command) {
        return false;
    }
    match startup_approved_value {
        None => true,
        Some(bytes) if bytes.len() == 12 => {
            bytes[..4] == [2, 0, 0, 0] && bytes[4..].iter().all(|byte| *byte == 0)
        }
        Some(_) => false,
    }
}

#[cfg(target_os = "windows")]
fn open_optional_registry_key(
    root: &winreg::RegKey,
    path: &str,
    flags: u32,
) -> Result<Option<winreg::RegKey>, String> {
    match root.open_subkey_with_flags(path, flags) {
        Ok(key) => Ok(Some(key)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Failed to open registry key {path}: {error}")),
    }
}

#[cfg(target_os = "windows")]
fn read_registered_command(root: &winreg::RegKey) -> Result<Option<OsString>, String> {
    use winreg::enums::KEY_READ;

    let Some(key) = open_optional_registry_key(root, RUN_REGISTRY_PATH, KEY_READ)? else {
        return Ok(None);
    };
    match key.get_value::<OsString, _>(AUTOSTART_VALUE_NAME) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Failed to read the Lumeria autostart command: {error}"
        )),
    }
}

#[cfg(target_os = "windows")]
fn read_startup_approved_value(root: &winreg::RegKey) -> Result<Option<Vec<u8>>, String> {
    use winreg::enums::KEY_READ;

    let Some(key) = open_optional_registry_key(root, STARTUP_APPROVED_REGISTRY_PATH, KEY_READ)?
    else {
        return Ok(None);
    };
    match key.get_raw_value(AUTOSTART_VALUE_NAME) {
        Ok(value) => Ok(Some(value.bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Failed to read the Windows startup approval state for Lumeria: {error}"
        )),
    }
}

#[cfg(target_os = "windows")]
fn get_autostart_status_inner(expected_command: &OsStr) -> Result<bool, String> {
    use winreg::enums::HKEY_CURRENT_USER;

    let root = winreg::RegKey::predef(HKEY_CURRENT_USER);
    let registered_command = read_registered_command(&root)?;
    let startup_approved = read_startup_approved_value(&root)?;
    Ok(autostart_status(
        expected_command,
        registered_command.as_deref(),
        startup_approved.as_deref(),
    ))
}

#[cfg(target_os = "windows")]
fn enable_autostart(command: &OsStr) -> Result<(), String> {
    use winreg::{
        enums::{RegType::REG_BINARY, HKEY_CURRENT_USER, KEY_SET_VALUE},
        RegKey, RegValue,
    };

    let root = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = root
        .create_subkey_with_flags(RUN_REGISTRY_PATH, KEY_SET_VALUE)
        .map_err(|error| format!("Failed to create the Windows Run registry key: {error}"))?;
    run_key
        .set_value(AUTOSTART_VALUE_NAME, &command)
        .map_err(|error| format!("Failed to register Lumeria autostart: {error}"))?;

    if let Some(startup_approved_key) =
        open_optional_registry_key(&root, STARTUP_APPROVED_REGISTRY_PATH, KEY_SET_VALUE)?
    {
        startup_approved_key
            .set_raw_value(
                AUTOSTART_VALUE_NAME,
                &RegValue {
                    vtype: REG_BINARY,
                    bytes: STARTUP_APPROVED_ENABLED_VALUE.to_vec(),
                },
            )
            .map_err(|error| {
                format!("Failed to enable Lumeria in Windows startup approval: {error}")
            })?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn disable_autostart() -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};

    let root = winreg::RegKey::predef(HKEY_CURRENT_USER);
    let Some(run_key) = open_optional_registry_key(&root, RUN_REGISTRY_PATH, KEY_SET_VALUE)? else {
        return Ok(());
    };
    match run_key.delete_value(AUTOSTART_VALUE_NAME) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Failed to disable Lumeria autostart: {error}")),
    }
}

#[cfg(target_os = "windows")]
pub fn get_autostart_status(expected_command: &OsStr) -> Result<bool, String> {
    get_autostart_status_inner(expected_command)
}

#[cfg(not(target_os = "windows"))]
pub fn get_autostart_status(_expected_command: &OsStr) -> Result<bool, String> {
    Err("Lumeria autostart is only supported on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub fn set_autostart_command_enabled(
    expected_command: &OsStr,
    enabled: bool,
) -> Result<bool, String> {
    if enabled {
        enable_autostart(&expected_command)?;
    } else {
        disable_autostart()?;
    }
    let applied = get_autostart_status_inner(&expected_command)?;
    if applied != enabled {
        return Err(format!(
            "Windows reported an unexpected Lumeria autostart state after applying {enabled}"
        ));
    }
    Ok(applied)
}

#[cfg(not(target_os = "windows"))]
pub fn set_autostart_command_enabled(
    _expected_command: &OsStr,
    _enabled: bool,
) -> Result<bool, String> {
    Err("Lumeria autostart is only supported on Windows".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{ffi::OsString, path::Path};

    #[test]
    fn run_command_quotes_the_actual_install_path_without_losing_unicode() {
        assert_eq!(
            autostart_run_command(Path::new(r"D:\自定义 安装\Lumeria.exe")),
            OsString::from(r#""D:\自定义 安装\Lumeria.exe" --lumeria-autostart"#)
        );
    }

    #[test]
    fn status_requires_the_current_command_and_an_enabled_startup_override() {
        let expected = OsString::from(r#""D:\Apps\Lumeria.exe" --lumeria-autostart"#);
        let stale = OsString::from(r#""C:\Old\Lumeria.exe" --lumeria-autostart"#);
        let enabled_override = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let disabled_override = [3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];
        let disabled_with_zero_timestamp = [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let malformed_override = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        assert!(autostart_status(&expected, Some(&expected), None));
        assert!(autostart_status(
            &expected,
            Some(&expected),
            Some(&enabled_override)
        ));
        assert!(!autostart_status(&expected, Some(&stale), None));
        assert!(!autostart_status(
            &expected,
            Some(&expected),
            Some(&disabled_override)
        ));
        assert!(!autostart_status(
            &expected,
            Some(&expected),
            Some(&disabled_with_zero_timestamp)
        ));
        assert!(!autostart_status(
            &expected,
            Some(&expected),
            Some(&malformed_override)
        ));
    }
}
