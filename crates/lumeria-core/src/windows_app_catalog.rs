use std::collections::HashSet;

use windows::{
    core::{Interface, HSTRING, PWSTR},
    Win32::{
        Foundation::PROPERTYKEY,
        System::Com::{CoTaskMemFree, IBindCtx},
        UI::Shell::{
            BHID_EnumItems, IEnumShellItems, IShellItem, IShellItem2,
            PropertiesSystem::PSGetPropertyKeyFromName, SHCreateItemFromParsingName,
            SIGDN_NORMALDISPLAY,
        },
    },
};

use crate::{native_error::NativeError, windows_com::ComGuard};

const APPS_FOLDER_PARSING_NAME: &str = "shell:AppsFolder";

pub fn filesystem_display_name(path: &std::path::Path) -> Option<String> {
    let _guard = ComGuard::new().ok()?;
    let name = HSTRING::from(crate::path_utils::windows_api_path(path));
    let item: IShellItem = unsafe { SHCreateItemFromParsingName(&name, None::<&IBindCtx>) }.ok()?;
    read_display_name(&item).map(|name| {
        let suffix = path.extension().and_then(|extension| extension.to_str()).map(|extension| format!(".{extension}"));
        if path.is_file() && suffix.as_ref().is_some_and(|suffix| name.to_lowercase().ends_with(&suffix.to_lowercase())) {
            name[..name.len()-suffix.unwrap().len()].to_string()
        } else { name }
    })
}
const AUMID_PROPERTY_NAME: &str = "System.AppUserModel.ID";
const PACKAGE_FAMILY_PROPERTY_NAME: &str = "System.AppUserModel.PackageFamilyName";
const PACKAGE_FULL_NAME_PROPERTY_NAME: &str = "System.AppUserModel.PackageFullName";

pub(crate) struct WindowsAppEntry {
    pub(crate) name: String,
    pub(crate) app_user_model_id: String,
    pub(crate) package_family_name: Option<String>,
    pub(crate) package_full_name: Option<String>,
    pub(crate) shell_item: IShellItem,
}

pub(crate) struct WindowsAppCatalogSnapshot {
    pub(crate) entries: Vec<WindowsAppEntry>,
    pub(crate) entries_seen: usize,
    pub(crate) skipped_entries: usize,
    _com_guard: ComGuard,
}

pub(crate) fn enumerate_windows_apps() -> Result<WindowsAppCatalogSnapshot, String> {
    let _com_guard = ComGuard::new()?;
    let apps_folder_name = HSTRING::from(APPS_FOLDER_PARSING_NAME);
    let apps_folder: IShellItem = unsafe {
        SHCreateItemFromParsingName(&apps_folder_name, None::<&IBindCtx>).map_err(|source| {
            NativeError::Shell {
                context: "SHCreateItemFromParsingName(shell:AppsFolder)",
                source,
            }
        })?
    };
    let items: IEnumShellItems = unsafe {
        apps_folder
            .BindToHandler(None::<&IBindCtx>, &BHID_EnumItems)
            .map_err(|source| NativeError::Shell {
                context: "IShellItem::BindToHandler(BHID_EnumItems)",
                source,
            })?
    };

    let aumid_key = resolve_property_key(
        AUMID_PROPERTY_NAME,
        "PSGetPropertyKeyFromName(System.AppUserModel.ID)",
    )?;
    let package_family_key = resolve_property_key(
        PACKAGE_FAMILY_PROPERTY_NAME,
        "PSGetPropertyKeyFromName(System.AppUserModel.PackageFamilyName)",
    )?;
    let package_full_name_key = resolve_property_key(
        PACKAGE_FULL_NAME_PROPERTY_NAME,
        "PSGetPropertyKeyFromName(System.AppUserModel.PackageFullName)",
    )?;

    let mut entries = Vec::new();
    let mut entries_seen = 0usize;
    let mut skipped_entries = 0usize;

    loop {
        let mut slot = [None];
        let mut fetched = 0u32;
        unsafe { items.Next(&mut slot, Some(&mut fetched)) }.map_err(|source| {
            NativeError::Shell {
                context: "IEnumShellItems::Next(shell:AppsFolder)",
                source,
            }
        })?;
        if fetched == 0 {
            break;
        }
        entries_seen += 1;

        let Some(shell_item) = slot[0].take() else {
            skipped_entries += 1;
            continue;
        };
        let Some(name) = read_display_name(&shell_item) else {
            skipped_entries += 1;
            continue;
        };
        let Ok(properties) = shell_item.cast::<IShellItem2>() else {
            skipped_entries += 1;
            continue;
        };
        let Some(app_user_model_id) = read_shell_property(&properties, &aumid_key) else {
            skipped_entries += 1;
            continue;
        };

        entries.push(WindowsAppEntry {
            name,
            app_user_model_id,
            package_family_name: read_shell_property(&properties, &package_family_key),
            package_full_name: read_shell_property(&properties, &package_full_name_key),
            shell_item,
        });
    }

    Ok(WindowsAppCatalogSnapshot {
        entries,
        entries_seen,
        skipped_entries,
        _com_guard,
    })
}

pub(crate) fn installed_app_user_model_ids() -> Result<HashSet<String>, String> {
    let snapshot = enumerate_windows_apps()?;
    if snapshot.skipped_entries > 0 {
        log::warn!(
            target: "windows_app_catalog",
            "Skipped {} AppsFolder entries without readable launch metadata while checking app status",
            snapshot.skipped_entries
        );
    }
    Ok(snapshot
        .entries
        .into_iter()
        .map(|entry| entry.app_user_model_id.to_lowercase())
        .collect())
}

fn resolve_property_key(name: &str, context: &'static str) -> Result<PROPERTYKEY, String> {
    let mut key = PROPERTYKEY::default();
    let property_name = HSTRING::from(name);
    unsafe { PSGetPropertyKeyFromName(&property_name, &mut key) }
        .map_err(|source| NativeError::Shell { context, source })?;
    Ok(key)
}

fn read_display_name(item: &IShellItem) -> Option<String> {
    let value = unsafe { item.GetDisplayName(SIGDN_NORMALDISPLAY) }.ok()?;
    take_cotaskmem_string(value)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read_shell_property(item: &IShellItem2, key: &PROPERTYKEY) -> Option<String> {
    let value = unsafe { item.GetString(key) }.ok()?;
    take_cotaskmem_string(value)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn take_cotaskmem_string(value: PWSTR) -> Result<String, std::string::FromUtf16Error> {
    let result = unsafe { value.to_string() };
    if !value.is_null() {
        unsafe {
            CoTaskMemFree(Some(value.as_ptr().cast()));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::enumerate_windows_apps;

    #[test]
    #[ignore = "requires a Windows shell user session"]
    fn enumerate_apps_folder_smoke() {
        let snapshot = enumerate_windows_apps().expect("AppsFolder enumeration should succeed");
        assert!(
            !snapshot.entries.is_empty(),
            "AppsFolder should expose at least one launchable app"
        );
        for entry in &snapshot.entries {
            assert!(!entry.name.trim().is_empty());
            assert!(!entry.app_user_model_id.trim().is_empty());
            println!(
                "{} -> {} (package family: {:?})",
                entry.name, entry.app_user_model_id, entry.package_family_name
            );
        }
    }
}
