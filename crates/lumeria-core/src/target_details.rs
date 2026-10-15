use std::path::{Path, PathBuf};
use serde::Serialize;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetDetails {
    pub can_elevate: bool,
    pub requires_admin: bool,
    pub admin_requirement_known: bool,
    pub file_location: Option<String>,
    pub location_is_folder: bool,
    pub shortcut_location: Option<String>,
}

pub fn path_status(path: &Path) -> &'static str {
    // Offline network locations cannot be distinguished reliably from removed files.
    let network = path.to_string_lossy().starts_with(r"\\");
    match std::fs::metadata(path) {
        Ok(_) => "ok",
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && !network => {
            if path.ancestors().last().is_some_and(|root| root.exists()) { "missing" } else { "unknown" }
        }
        Err(_) => "unknown",
    }
}

pub fn inspect_path(path: &Path) -> (&'static str, TargetDetails) {
    inspect_path_options(path,true)
}

pub fn launch_path_status(path: &Path) -> &'static str {
    inspect_path_options(path,false).0
}

fn inspect_path_options(path: &Path, inspect_admin: bool) -> (&'static str, TargetDetails) {
    let mut details = TargetDetails::default();
    let mut target = Some(path.to_path_buf());
    let mut status = path_status(path);
    #[cfg(windows)]
    if crate::path_utils::extension(path).as_deref() == Some("lnk") {
        if status == "ok" {
            details.shortcut_location = Some(path.to_string_lossy().into_owned());
            match crate::windows_shell_link::load_shell_link(path) {
                Ok(link) => {
                    details.requires_admin = link.run_as;
                    details.admin_requirement_known = link.run_as;
                    target = link.target_path;
                    status = target.as_deref().map(path_status).unwrap_or("unknown");
                }
                Err(_) => { target = None; status = "unknown"; }
            }
        } else { target = None; }
    }
    if let Some(target) = target {
        let extension = crate::path_utils::extension(&target);
        details.can_elevate = extension.as_deref() == Some("exe");
        #[cfg(windows)]
        if inspect_admin && details.can_elevate && status == "ok" {
            if let Some(required) = administrator_requirement(&target) {
                details.requires_admin |= required;
                details.admin_requirement_known = true;
            }
        }
        if target.exists() {
            details.file_location = Some(target.to_string_lossy().into_owned());
        } else if let Some(parent) = target.parent().filter(|parent| parent.is_dir()) {
            details.file_location = Some(parent.to_string_lossy().into_owned());
            details.location_is_folder = true;
        }
    }
    (status, details)
}

#[cfg(windows)]
fn administrator_requirement(path: &Path) -> Option<bool> {
    use windows::{core::{HSTRING, PCWSTR}, Win32::System::ApplicationInstallationAndServicing::*};
    use winreg::{enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE}, RegKey};
    let path_string = path.to_string_lossy();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        if let Ok(key) = RegKey::predef(hive).open_subkey(r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers") {
            if key.get_value::<String, _>(path_string.as_ref()).ok().is_some_and(|value| value.split_whitespace().any(|flag| flag.eq_ignore_ascii_case("RUNASADMIN"))) { return Some(true); }
        }
    }
    let source = HSTRING::from(path_string.as_ref());
    let embedded = crate::path_utils::extension(path).as_deref() == Some("exe");
    // Executables store their process manifest under CREATEPROCESS_MANIFEST_RESOURCE_ID (1).
    let context = ACTCTXW { cbSize: std::mem::size_of::<ACTCTXW>() as u32, lpSource: PCWSTR(source.as_ptr()),
        dwFlags: if embedded { 8 } else { 0 }, lpResourceName: if embedded { PCWSTR(1usize as *const u16) } else { PCWSTR::null() }, ..Default::default() };
    let Ok(handle) = (unsafe { CreateActCtxW(&context) }) else { return None; };
    let mut info = ACTIVATION_CONTEXT_RUN_LEVEL_INFORMATION::default();
    let result = unsafe { QueryActCtxW(0, handle, None, 5, Some((&mut info as *mut ACTIVATION_CONTEXT_RUN_LEVEL_INFORMATION).cast()), std::mem::size_of_val(&info), None) };
    unsafe { ReleaseActCtx(handle); }
    result.ok().map(|()| info.RunLevel == ACTCTX_RUN_LEVEL_REQUIRE_ADMIN)
}

pub fn reveal_path(path: &str, folder: bool) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() { return Err(format!("Location no longer exists: {}", path.display())); }
    #[cfg(windows)]
    {
        use windows::{core::HSTRING, Win32::{System::Com::CoTaskMemFree, UI::Shell::{SHParseDisplayName, SHOpenFolderAndSelectItems}}};
        let _guard = crate::windows_com::ComGuard::new()?;
        if folder { return crate::launcher::launch_path(&path.to_string_lossy(), None).map_err(|error| error.detail); }
        let name = HSTRING::from(path.to_string_lossy().as_ref());
        let mut pidl = std::ptr::null_mut();
        unsafe { SHParseDisplayName(&name, None, &mut pidl, 0, None) }.map_err(|error| error.to_string())?;
        let result = unsafe { SHOpenFolderAndSelectItems(pidl, None, 0) };
        unsafe { CoTaskMemFree(Some(pidl.cast())); }
        result.map_err(|error| error.to_string())
    }
    #[cfg(not(windows))]
    { let _ = folder; Err("File location is only supported on Windows".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_file_keeps_existing_parent_available() {
        let path = std::env::temp_dir().join(format!("lumeria-absent-{}.exe", std::process::id()));
        let (status, details) = inspect_path(&path);
        assert_eq!(status, "missing");
        assert!(details.location_is_folder);
        assert!(details.file_location.is_some());
    }

    #[cfg(windows)]
    #[test]
    fn shortcut_target_and_admin_flag_are_inspected_without_launching() {
        use windows::{core::{HSTRING, Interface}, Win32::{System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER}, UI::Shell::{IShellLinkW, IShellLinkDataList, ShellLink, SLDF_RUNAS_USER}}};
        let root = std::env::temp_dir().join(format!("lumeria-target-details-{}",std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path=root.join("target.lnk");let target=root.join("target.exe");
        std::fs::write(&target, b"").unwrap();
        let _guard=crate::windows_com::ComGuard::new().unwrap();
        let link:IShellLinkW=unsafe{CoCreateInstance(&ShellLink,None,CLSCTX_INPROC_SERVER)}.unwrap();
        unsafe{link.SetPath(&HSTRING::from(target.to_string_lossy().as_ref()))}.unwrap();
        let flags:IShellLinkDataList=link.cast().unwrap();
        unsafe{flags.SetFlags(flags.GetFlags().unwrap()|SLDF_RUNAS_USER.0 as u32)}.unwrap();
        let file:IPersistFile=link.cast().unwrap();unsafe{file.Save(&HSTRING::from(path.to_string_lossy().as_ref()),true)}.unwrap();
        let (status,details)=inspect_path(&path);assert_eq!(status,"ok");assert!(details.requires_admin);assert!(details.can_elevate);
        assert_eq!(details.shortcut_location,Some(path.to_string_lossy().into_owned()));
        std::fs::remove_file(&target).unwrap();assert_eq!(inspect_path(&path).0,"missing");
        std::fs::remove_file(path).unwrap();std::fs::remove_dir(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn manifest_run_level_distinguishes_required_from_highest_available() {
        let root=std::env::temp_dir().join(format!("lumeria-run-level-{}",std::process::id()));std::fs::create_dir_all(&root).unwrap();
        for (level,expected) in [("requireAdministrator",true),("highestAvailable",false),("asInvoker",false)] {
            let manifest=root.join(format!("app-{level}.manifest"));
            std::fs::write(&manifest,format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><assemblyIdentity version="1.0.0.0" processorArchitecture="*" name="Lumeria.Test" type="win32"/><trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="{level}" uiAccess="false"/></requestedPrivileges></security></trustInfo></assembly>"#)).unwrap();
            assert_eq!(administrator_requirement(&manifest),Some(expected),"{level}");
            std::fs::remove_file(manifest).unwrap();
        }
        std::fs::remove_dir(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn embedded_executable_manifest_requires_resource_one() {
        use windows::{core::{HSTRING,PCWSTR},Win32::System::LibraryLoader::{BeginUpdateResourceW,UpdateResourceW,EndUpdateResourceW}};
        let path=std::env::temp_dir().join(format!("lumeria-embedded-manifest-{}.exe",std::process::id()));
        std::fs::copy(std::env::current_exe().unwrap(),&path).unwrap();
        let xml=br#"<?xml version="1.0" encoding="UTF-8"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="requireAdministrator" uiAccess="false"/></requestedPrivileges></security></trustInfo></assembly>"#;
        let update=unsafe{BeginUpdateResourceW(&HSTRING::from(path.to_string_lossy().as_ref()),true)}.unwrap();
        unsafe{UpdateResourceW(update,PCWSTR(24usize as *const u16),PCWSTR(1usize as *const u16),0,Some(xml.as_ptr().cast()),xml.len() as u32)}.unwrap();
        unsafe{EndUpdateResourceW(update,false)}.unwrap();
        assert_eq!(administrator_requirement(&path),Some(true));
        std::fs::remove_file(path).unwrap();
    }
}
