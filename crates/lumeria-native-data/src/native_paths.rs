//! Native product paths. The Tauri host keeps its own host integration.
use std::{
    env, fs,
    path::{Path, PathBuf},
};

pub(crate) const PRODUCT_IDENTIFIER: &str = "com.lumeria.app";
pub(crate) const INSTALL_REGISTRY_KEY: &str = r"Software\com.lumeria.app";

#[cfg(target_os = "windows")]
fn has_install_receipt(root: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetPrivateProfileStringW(
            section: *const u16,
            key: *const u16,
            default: *const u16,
            output: *mut u16,
            size: u32,
            file: *const u16,
        ) -> u32;
    }
    let wide = |value: &str| value.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let file = root
        .join("install.ini")
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let mut value = [0u16; 128];
    let size = unsafe {
        GetPrivateProfileStringW(
            wide("Lumeria").as_ptr(),
            wide("Identifier").as_ptr(),
            std::ptr::null(),
            value.as_mut_ptr(),
            value.len() as u32,
            file.as_ptr(),
        )
    };
    String::from_utf16(&value[..size as usize]).ok().as_deref() == Some(PRODUCT_IDENTIFIER)
}

#[cfg(not(target_os = "windows"))]
fn has_install_receipt(_root: &Path) -> bool {
    false
}

fn absolute(value: Option<std::ffi::OsString>, name: &str) -> Result<PathBuf, String> {
    let path = value
        .map(PathBuf::from)
        .ok_or_else(|| format!("{name} is unavailable"))?;
    if !path.is_absolute() {
        return Err(format!("{name} must be an absolute path"));
    }
    Ok(path)
}

pub(crate) fn data_directory() -> Result<PathBuf, String> {
    if let Some(configured) = env::var_os("LUMERIA_NATIVE_DATA_DIR") {
        return absolute(Some(configured), "LUMERIA_NATIVE_DATA_DIR");
    }
    #[cfg(target_os = "windows")]
    let base = absolute(env::var_os("APPDATA"), "APPDATA")?;
    #[cfg(target_os = "macos")]
    let base = absolute(env::var_os("HOME"), "HOME")?.join("Library/Application Support");
    #[cfg(target_os = "linux")]
    let base = match env::var_os("XDG_DATA_HOME").filter(|value| !value.is_empty()) {
        Some(value) => absolute(Some(value), "XDG_DATA_HOME")?,
        None => absolute(env::var_os("HOME"), "HOME")?.join(".local/share"),
    };
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return Err("Native data paths are unavailable on this platform".to_string());
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    Ok(base.join(PRODUCT_IDENTIFIER))
}

pub(crate) fn installed_launcher(data_executable: &Path) -> Result<PathBuf, String> {
    if !cfg!(target_os = "windows") {
        return Err("Native installation discovery is not implemented on this platform".into());
    }
    let executable = fs::canonicalize(data_executable).map_err(|error| error.to_string())?;
    let root = executable
        .ancestors()
        .nth(5)
        .ok_or("Native data host is outside a product installation")?;
    if executable != root.join("runtime/Resources/app/bun/lumeria-native-data.exe") {
        return Err("Native data host is outside a product installation".into());
    }
    let manifest: serde_json::Value = serde_json::from_slice(
        &fs::read(root.join("lumeria.json")).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    if manifest["schemaVersion"] != 1
        || manifest["identifier"] != PRODUCT_IDENTIFIER
        || manifest["platform"] != "win32"
        || manifest["arch"] != "x64"
    {
        return Err("Incompatible Lumeria installation manifest".into());
    }
    let launcher = root.join("Lumeria.exe");
    if !has_install_receipt(root)
        || !launcher.is_file()
        || !root.join("runtime/Resources/main.js").is_file()
    {
        return Err("Lumeria installation is incomplete".into());
    }
    Ok(launcher)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_relative_data_paths_fail() {
        assert!(absolute(None, "test").is_err());
        assert!(absolute(Some("relative".into()), "test").is_err());
        assert!(absolute(Some("".into()), "test").is_err());
        let root = env::temp_dir();
        assert_eq!(
            absolute(Some(root.clone().into_os_string()), "test").unwrap(),
            root
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn only_a_complete_product_installation_provides_an_autostart_entry() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = env::temp_dir().join(format!(
            "lumeria-install-path-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(root.join("runtime/Resources/app/bun")).unwrap();
        let data = root.join("runtime/Resources/app/bun/lumeria-native-data.exe");
        fs::write(&data, []).unwrap();
        fs::write(root.join("Lumeria.exe"), []).unwrap();
        fs::write(root.join("runtime/Resources/main.js"), []).unwrap();
        fs::write(
            root.join("lumeria.json"),
            r#"{"schemaVersion":1,"identifier":"com.lumeria.app","platform":"win32","arch":"x64"}"#,
        )
        .unwrap();
        assert!(
            installed_launcher(&data).is_err(),
            "an unpacked bundle is not an installed application"
        );
        fs::write(
            root.join("install.ini"),
            "[Lumeria]\r\nIdentifier=com.lumeria.app\r\n",
        )
        .unwrap();
        assert_eq!(
            installed_launcher(&data).unwrap(),
            fs::canonicalize(&root).unwrap().join("Lumeria.exe")
        );
        let command =
            lumeria_core::autostart::autostart_run_command(&installed_launcher(&data).unwrap());
        let expected_launcher = fs::canonicalize(root.join("Lumeria.exe")).unwrap();
        assert_eq!(
            command,
            lumeria_core::autostart::autostart_run_command(&expected_launcher)
        );
        assert!(!command.to_string_lossy().contains(r"\\?\"));
        fs::write(
            root.join("lumeria.json"),
            r#"{"schemaVersion":1,"identifier":"other","platform":"win32","arch":"x64"}"#,
        )
        .unwrap();
        assert!(installed_launcher(&data).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn native_autostart_rejects_development_sidecar_and_request_selected_paths() {
        assert!(installed_launcher(Path::new(
            r"C:\project\target\release\lumeria_native_data.exe"
        ))
        .is_err());
        assert!(installed_launcher(Path::new(r"C:\other\application.exe")).is_err());
    }
}
