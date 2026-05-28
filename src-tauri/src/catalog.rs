use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet},
    env, fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
};

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::{
    icons::cache_app_icon,
    models::{AppCatalogItem, AppSource, LaunchTarget},
    path_utils::{extension, windows_api_path},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScanRoot {
    pub(crate) id: String,
    #[serde(rename = "type")]
    pub(crate) root_type: String,
    pub(crate) label: String,
    pub(crate) path: String,
    #[serde(default = "default_enabled")]
    pub(crate) enabled: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScanFilters {
    #[serde(default)]
    pub(crate) keyword_blacklist: Vec<String>,
    #[serde(default)]
    pub(crate) app_blacklist: Vec<ScanAppBlacklistItem>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScanAppBlacklistItem {
    #[serde(default)]
    pub(crate) source_key: Option<String>,
    #[serde(default)]
    pub(crate) path: Option<String>,
}

struct NormalizedScanFilters {
    keyword_blacklist: Vec<String>,
    blocked_source_keys: HashSet<String>,
    blocked_paths: HashSet<String>,
}

struct CatalogCandidate {
    id: String,
    name: String,
    kind: String,
    path_string: String,
    relative_path: String,
    source_key: String,
}

fn default_enabled() -> bool {
    true
}
pub(crate) fn icon_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let icon_dir = data_dir.join("icons");
    fs::create_dir_all(&icon_dir).map_err(|error| {
        format!(
            "Failed to create icon cache directory {}: {error}",
            icon_dir.display()
        )
    })?;
    Ok(icon_dir)
}

pub(crate) fn scan_start_menu_apps(icon_dir: &Path) -> Result<Vec<AppCatalogItem>, String> {
    let roots: Vec<ScanRoot> = start_menu_roots()
        .into_iter()
        .enumerate()
        .map(|(index, path)| ScanRoot {
            id: format!("legacy-start-menu-{index}"),
            root_type: "startMenu".to_string(),
            label: "Start Menu".to_string(),
            path: path.to_string_lossy().to_string(),
            enabled: true,
        })
        .collect();
    scan_apps_from_roots(&roots, icon_dir, &ScanFilters::default())
}

pub(crate) fn scan_apps_from_roots(
    roots: &[ScanRoot],
    icon_dir: &Path,
    filters: &ScanFilters,
) -> Result<Vec<AppCatalogItem>, String> {
    let mut apps = Vec::new();
    let mut seen_paths = HashMap::new();
    let filters = NormalizedScanFilters::from(filters);

    for root in roots.iter().filter(|root| root.enabled) {
        let root_path = expand_scan_root_path(&root.path);
        collect_apps_from_dir(
            root,
            &root_path,
            &root_path,
            icon_dir,
            &filters,
            &mut apps,
            &mut seen_paths,
        )?;
    }

    apps.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(apps)
}

fn start_menu_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(appdata) = env::var("APPDATA") {
        roots.push(PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }

    if let Ok(program_data) = env::var("ProgramData") {
        roots.push(PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }

    roots
}

fn collect_apps_from_dir(
    root: &ScanRoot,
    root_dir: &Path,
    dir: &Path,
    icon_dir: &Path,
    filters: &NormalizedScanFilters,
    apps: &mut Vec<AppCatalogItem>,
    seen_paths: &mut HashMap<String, ()>,
) -> Result<(), String> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "Failed to read app directory {}: {error}",
                dir.display()
            ))
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.is_dir() {
            collect_apps_from_dir(root, root_dir, &path, icon_dir, filters, apps, seen_paths)?;
            continue;
        }

        if !is_supported_launch_file(&path) {
            continue;
        }

        let path_key = path.to_string_lossy().to_lowercase();
        if seen_paths.insert(path_key, ()).is_some() {
            continue;
        }

        let candidate = make_catalog_candidate(root, root_dir, &path);
        if should_skip_candidate(&candidate, &filters) {
            continue;
        }

        apps.push(make_catalog_item(root, &path, icon_dir, candidate));
    }

    Ok(())
}

fn is_supported_launch_file(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("lnk") | Some("url") | Some("exe")
    )
}

fn make_catalog_candidate(root: &ScanRoot, root_dir: &Path, path: &Path) -> CatalogCandidate {
    let name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Application")
        .trim()
        .to_string();
    let path_string = windows_api_path(path);
    let kind = match extension(path).as_deref() {
        Some("exe") => "executable",
        Some("url") => "url",
        _ => "shortcut",
    }
    .to_string();
    let id = stable_app_id(&path_string);
    let relative_path = path
        .strip_prefix(root_dir)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let source_key = format!(
        "scan-root:{}:{}",
        root.id,
        normalize_source_relative_path(&relative_path)
    );

    CatalogCandidate {
        id,
        name,
        kind,
        path_string,
        relative_path,
        source_key,
    }
}

fn make_catalog_item(
    root: &ScanRoot,
    path: &Path,
    icon_dir: &Path,
    candidate: CatalogCandidate,
) -> AppCatalogItem {
    let icon_path = cache_app_icon(path, icon_dir, &candidate.id);
    let icon_data_url = icon_path.as_deref().and_then(icon_file_data_url);

    AppCatalogItem {
        id: candidate.id,
        item_type: "app".to_string(),
        name: if candidate.name.is_empty() {
            "Application".to_string()
        } else {
            candidate.name.clone()
        },
        icon_path,
        icon_data_url,
        emoji: Some(app_glyph(&candidate.name)),
        launch_target: LaunchTarget {
            kind: candidate.kind,
            path: Some(candidate.path_string.clone()),
            app_user_model_id: None,
        },
        launch_args: None,
        source_key: Some(candidate.source_key.clone()),
        source: Some(AppSource {
            source_type: root.root_type.clone(),
            root_id: root.id.clone(),
            root_label: root.label.clone(),
            relative_path: candidate.relative_path,
            absolute_path: candidate.path_string,
        }),
    }
}

impl NormalizedScanFilters {
    fn from(filters: &ScanFilters) -> Self {
        let mut keyword_seen = HashSet::new();
        let keyword_blacklist = filters
            .keyword_blacklist
            .iter()
            .filter_map(|keyword| {
                let normalized = normalize_match_text(keyword);
                if normalized.is_empty() || !keyword_seen.insert(normalized.clone()) {
                    return None;
                }
                Some(normalized)
            })
            .collect();

        let blocked_source_keys = filters
            .app_blacklist
            .iter()
            .filter_map(|item| item.source_key.as_deref())
            .map(normalize_match_text)
            .filter(|value| !value.is_empty())
            .collect();

        let blocked_paths = filters
            .app_blacklist
            .iter()
            .filter_map(|item| item.path.as_deref())
            .map(normalize_path_key)
            .filter(|value| !value.is_empty())
            .collect();

        Self {
            keyword_blacklist,
            blocked_source_keys,
            blocked_paths,
        }
    }
}

fn should_skip_candidate(candidate: &CatalogCandidate, filters: &NormalizedScanFilters) -> bool {
    matches_keyword_blacklist(candidate, filters)
        || filters
            .blocked_source_keys
            .contains(&normalize_match_text(&candidate.source_key))
        || filters
            .blocked_paths
            .contains(&normalize_path_key(&candidate.path_string))
}

fn matches_keyword_blacklist(
    candidate: &CatalogCandidate,
    filters: &NormalizedScanFilters,
) -> bool {
    if filters.keyword_blacklist.is_empty() {
        return false;
    }

    let name = normalize_match_text(&candidate.name);
    let relative_path = normalize_path_key(&candidate.relative_path);
    let absolute_path = normalize_path_key(&candidate.path_string);

    filters.keyword_blacklist.iter().any(|keyword| {
        name.contains(keyword) || relative_path.contains(keyword) || absolute_path.contains(keyword)
    })
}

fn expand_scan_root_path(path: &str) -> PathBuf {
    let mut expanded = path.to_string();
    for (name, value) in env::vars() {
        let token = format!("%{name}%");
        if expanded.contains(&token) {
            expanded = expanded.replace(&token, &value);
        }
    }
    PathBuf::from(expanded)
}

fn normalize_source_relative_path(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
}

fn normalize_match_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_path_key(value: &str) -> String {
    normalize_match_text(&value.replace('\\', "/"))
}

pub(crate) fn stable_app_id(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.to_lowercase().hash(&mut hasher);
    format!("win-app-{:x}", hasher.finish())
}

fn app_glyph(name: &str) -> String {
    name.chars()
        .find(|character| character.is_alphanumeric())
        .map(|character| character.to_uppercase().collect())
        .unwrap_or_else(|| "A".to_string())
}

pub(crate) fn icon_file_data_url(path: &str) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(format!("data:image/png;base64,{}", encode_base64(&bytes)))
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);

        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(TABLE[(((first & 0b0000_0011) << 4) | (second >> 4)) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[(((second & 0b0000_1111) << 2) | (third >> 6)) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(third & 0b0011_1111) as usize] as char
        } else {
            '='
        });
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_candidate(name: &str, path: &str, relative_path: &str) -> CatalogCandidate {
        CatalogCandidate {
            id: "app".to_string(),
            name: name.to_string(),
            kind: "shortcut".to_string(),
            path_string: path.to_string(),
            relative_path: relative_path.to_string(),
            source_key: format!(
                "scan-root:root:{}",
                normalize_source_relative_path(relative_path)
            ),
        }
    }

    #[test]
    fn scan_filters_match_keywords_before_icon_extraction() {
        let filters = NormalizedScanFilters::from(&ScanFilters {
            keyword_blacklist: vec!["卸载".to_string(), "UNINSTALL".to_string()],
            app_blacklist: Vec::new(),
        });

        assert!(should_skip_candidate(
            &test_candidate(
                "卸载 Example",
                r"C:\Apps\Example\Uninstall.lnk",
                "Example/Uninstall.lnk"
            ),
            &filters
        ));
        assert!(should_skip_candidate(
            &test_candidate(
                "Example",
                r"C:\Apps\Example\uninstall helper.lnk",
                "Example/uninstall helper.lnk"
            ),
            &filters
        ));
        assert!(!should_skip_candidate(
            &test_candidate("Example", r"C:\Apps\Example\App.lnk", "Example/App.lnk"),
            &filters
        ));
    }

    #[test]
    fn scan_filters_match_blocked_source_key_or_path() {
        let filters = NormalizedScanFilters::from(&ScanFilters {
            keyword_blacklist: Vec::new(),
            app_blacklist: vec![
                ScanAppBlacklistItem {
                    source_key: Some("scan-root:root:tools/app.lnk".to_string()),
                    path: None,
                },
                ScanAppBlacklistItem {
                    source_key: None,
                    path: Some(r"C:\Apps\Other\App.url".to_string()),
                },
            ],
        });

        assert!(should_skip_candidate(
            &test_candidate("App", r"C:\Apps\Tools\App.lnk", "Tools/App.lnk"),
            &filters
        ));
        assert!(should_skip_candidate(
            &test_candidate("Other", r"C:\Apps\Other\App.url", "Other/App.url"),
            &filters
        ));
        assert!(!should_skip_candidate(
            &test_candidate("Keep", r"C:\Apps\Keep\App.lnk", "Keep/App.lnk"),
            &filters
        ));
    }
}
