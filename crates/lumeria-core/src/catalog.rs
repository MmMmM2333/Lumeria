use std::{
    collections::{HashMap, HashSet},
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

#[cfg(target_os = "windows")]
use std::os::windows::fs::MetadataExt;

use serde::{Deserialize, Serialize};

use crate::{
    encoding::{encode_base64, short_blake3_hex},
    icons::cache_app_icon_for_identity,
    models::{
        AppCatalogItem, AppSource, AppSourceState, AppSourceType, CatalogIdentityStatus,
        LaunchTarget,
    },
    path_utils::{expand_windows_env_vars, extension, windows_api_path},
};
#[cfg(target_os = "windows")]
use crate::{
    icons::cache_shell_item_icon,
    windows_app_catalog::{enumerate_windows_apps, WindowsAppEntry},
    windows_shell_link::load_shell_link,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRoot {
    pub id: String,
    #[serde(rename = "type")]
    pub root_type: AppSourceType,
    pub label: String,
    pub path: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub max_depth: Option<usize>,
    #[serde(default)]
    pub max_entries: Option<usize>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanFilters {
    #[serde(default)]
    pub keyword_blacklist: Vec<String>,
    #[serde(default)]
    pub keyword_allowlist: Vec<String>,
    #[serde(default)]
    pub app_blacklist: Vec<ScanAppBlacklistItem>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanAppBlacklistItem {
    #[serde(default)]
    pub catalog_id: Option<String>,
}

struct NormalizedScanFilters {
    keyword_blacklist: Vec<NormalizedKeyword>,
    keyword_allowed_catalog_ids: HashSet<String>,
    blocked_catalog_ids: HashSet<String>,
}

struct NormalizedKeyword {
    display: String,
    matcher: String,
}

struct CatalogCandidate {
    id: String,
    name: String,
    kind: String,
    path_string: String,
    relative_path: String,
    source_key: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanAppsResult {
    pub apps: Vec<AppCatalogItem>,
    pub excluded_apps: Vec<AppCatalogItem>,
    pub keyword_excluded_apps: Vec<KeywordExcludedApp>,
    pub warnings: Vec<ScanWarning>,
    pub stats: ScanStats,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeywordExcludedApp {
    pub app: AppCatalogItem,
    pub matched_keyword: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanWarning {
    pub root_id: String,
    pub root_label: String,
    pub kind: String,
    pub message: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStats {
    pub metadata_cache_hits: usize,
    pub metadata_reads: usize,
    pub dirs_visited: usize,
    pub entries_seen: usize,
    pub physical_apps_found: usize,
    pub start_menu_overlays: usize,
    pub equivalent_apps_merged: usize,
    pub unresolved_apps: usize,
    pub keyword_excluded_apps: usize,
    pub excluded_apps: usize,
    pub apps_found: usize,
    pub limit_reached: bool,
}

struct ScanLimits {
    max_depth: usize,
    max_entries: usize,
}

const START_MENU_MAX_DEPTH: usize = 8;
const CUSTOM_DIRECTORY_MAX_DEPTH: usize = 3;
const DEFAULT_MAX_ENTRIES: usize = 5_000;
const MAX_CONFIGURED_DEPTH: usize = 32;
const MAX_CONFIGURED_ENTRIES: usize = 50_000;
const MAX_KEYWORD_EXCLUDED_APPS: usize = 200;
#[cfg(target_os = "windows")]
const FILE_ATTRIBUTE_REPARSE_POINT_VALUE: u32 = 0x400;

fn default_enabled() -> bool {
    true
}
pub fn icon_cache_dir(data_dir: &Path) -> Result<PathBuf, String> {
    let icon_dir = data_dir.join("icons");
    fs::create_dir_all(&icon_dir).map_err(|error| {
        format!(
            "Failed to create icon cache directory {}: {error}",
            icon_dir.display()
        )
    })?;
    Ok(icon_dir)
}

pub fn scan_apps_from_roots(
    roots: &[ScanRoot],
    icon_dir: &Path,
    filters: &ScanFilters,
) -> Result<ScanAppsResult, String> {
    let metadata_scan = crate::catalog_metadata::MetadataScan::begin(icon_dir);
    let mut apps = Vec::new();
    let mut seen_app_user_model_ids = HashSet::new();
    let filters = NormalizedScanFilters::from(filters);
    let mut warnings = Vec::new();
    let mut stats = ScanStats::default();

    for root in roots.iter().filter(|root| root.enabled) {
        let limits = scan_limits(root);
        if root.root_type == AppSourceType::WindowsAppCatalog {
            #[cfg(target_os = "windows")]
            collect_apps_from_windows_catalog(
                root,
                icon_dir,
                &mut apps,
                &mut seen_app_user_model_ids,
                &mut warnings,
                &mut stats,
                &limits,
            )?;
            #[cfg(not(target_os = "windows"))]
            return Err("The Windows app catalog is only available on Windows".to_string());
            continue;
        }

        let root_path = expand_scan_root_path(&root.path);
        let mut seen_paths = HashMap::new();
        let mut visited_dirs = HashSet::new();
        let mut root_entries_seen = 0usize;
        collect_apps_from_dir(
            root,
            &root_path,
            &root_path,
            &mut apps,
            &mut seen_paths,
            &mut visited_dirs,
            &mut warnings,
            &mut stats,
            &limits,
            &mut root_entries_seen,
            0,
        )?;
    }

    stats.physical_apps_found = apps.len();
    let before_overlay = apps.len();
    let apps = overlay_start_menu_entries(apps);
    stats.start_menu_overlays = before_overlay.saturating_sub(apps.len());
    let before_semantic_merge = apps.len();
    let apps = merge_semantically_equivalent_apps(apps);
    stats.equivalent_apps_merged = before_semantic_merge.saturating_sub(apps.len());
    stats.unresolved_apps = apps
        .iter()
        .filter(|app| app.identity_status == CatalogIdentityStatus::Unresolved)
        .count();
    let (mut excluded_apps, apps): (Vec<_>, Vec<_>) = apps.into_iter().partition(|app| {
        filters
            .blocked_catalog_ids
            .contains(&normalize_match_text(&app.id))
    });
    stats.excluded_apps = excluded_apps.len();
    let mut keyword_excluded_apps = Vec::new();
    let mut included_apps = Vec::with_capacity(apps.len());
    for app in apps {
        let catalog_id = normalize_match_text(&app.id);
        let is_allowed = filters.keyword_allowed_catalog_ids.contains(&catalog_id);
        if !is_allowed {
            if let Some(keyword) = matching_keyword(&app.name, &filters) {
                keyword_excluded_apps.push(KeywordExcludedApp {
                    app,
                    matched_keyword: keyword.display.clone(),
                });
                continue;
            }
        }
        included_apps.push(app);
    }
    let mut apps = included_apps;
    stats.keyword_excluded_apps = keyword_excluded_apps.len();
    cache_catalog_icons(&mut apps, icon_dir);
    cache_catalog_icons(&mut excluded_apps, icon_dir);
    keyword_excluded_apps.sort_by(|left, right| {
        left.app
            .name
            .to_lowercase()
            .cmp(&right.app.name.to_lowercase())
            .then_with(|| left.app.id.cmp(&right.app.id))
    });
    keyword_excluded_apps.truncate(MAX_KEYWORD_EXCLUDED_APPS);
    for excluded in &mut keyword_excluded_apps {
        cache_catalog_icons(std::slice::from_mut(&mut excluded.app), icon_dir);
    }
    apps.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    excluded_apps.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    stats.apps_found = apps.len();
    (stats.metadata_cache_hits, stats.metadata_reads) = metadata_scan.finish(warnings.is_empty() && !stats.limit_reached);
    Ok(ScanAppsResult {
        apps,
        excluded_apps,
        keyword_excluded_apps,
        warnings,
        stats,
    })
}

fn overlay_start_menu_entries(apps: Vec<AppCatalogItem>) -> Vec<AppCatalogItem> {
    let mut merged = Vec::with_capacity(apps.len());
    let mut slots = HashMap::new();

    for mut app in apps {
        let Some(source) = primary_source(&app) else {
            merged.push(app);
            continue;
        };
        let source_type = source.source_type;
        if !matches!(
            source_type,
            AppSourceType::StartMenuUser | AppSourceType::StartMenuSystem
        ) {
            merged.push(app);
            continue;
        }

        let slot_key = normalize_source_relative_path(&source.relative_path);
        let Some(existing_index) = slots.get(&slot_key).copied() else {
            slots.insert(slot_key, merged.len());
            merged.push(app);
            continue;
        };

        let existing_is_user = primary_source(&merged[existing_index])
            .is_some_and(|existing| existing.source_type == AppSourceType::StartMenuUser);
        if source_type == AppSourceType::StartMenuUser && !existing_is_user {
            let mut shadowed = std::mem::take(&mut merged[existing_index].sources);
            update_non_shadowed_source_states(&mut shadowed, AppSourceState::Shadowed);
            app.sources.extend(shadowed);
            merged[existing_index] = app;
        } else {
            let mut shadowed = app.sources;
            update_non_shadowed_source_states(&mut shadowed, AppSourceState::Shadowed);
            merged[existing_index].sources.extend(shadowed);
        }
    }

    merged
}

fn merge_semantically_equivalent_apps(apps: Vec<AppCatalogItem>) -> Vec<AppCatalogItem> {
    let mut merged = Vec::with_capacity(apps.len());
    let mut identities = HashMap::new();

    for mut app in apps {
        let Some(identity) = semantic_launch_identity(&app) else {
            let source_key = primary_source(&app)
                .map(|source| normalize_match_text(&source.key))
                .unwrap_or_else(|| normalize_match_text(&app.id));
            app.id = unresolved_app_id(&source_key);
            app.tracking_key = format!("source:{source_key}");
            app.identity_status = CatalogIdentityStatus::Unresolved;
            merged.push(app);
            continue;
        };
        app.id = semantic_app_id(&identity);
        app.tracking_key = semantic_tracking_key(&identity);
        app.identity_status = CatalogIdentityStatus::Exact;
        let Some(existing_index) = identities.get(&identity).copied() else {
            identities.insert(identity, merged.len());
            merged.push(app);
            continue;
        };

        if app_source_priority(&app) > app_source_priority(&merged[existing_index]) {
            let mut equivalent = std::mem::take(&mut merged[existing_index].sources);
            update_non_shadowed_source_states(&mut equivalent, AppSourceState::Equivalent);
            app.sources.extend(equivalent);
            merged[existing_index] = app;
        } else {
            let mut equivalent = app.sources;
            update_non_shadowed_source_states(&mut equivalent, AppSourceState::Equivalent);
            merged[existing_index].sources.extend(equivalent);
        }
    }

    merged
}

fn update_non_shadowed_source_states(sources: &mut [AppSource], state: AppSourceState) {
    for source in sources {
        if source.state != AppSourceState::Shadowed {
            source.state = state;
        }
    }
}

fn semantic_launch_identity(app: &AppCatalogItem) -> Option<String> {
    match app.launch_target.kind.as_str() {
        "appUserModelId" => app
            .launch_target
            .app_user_model_id
            .as_deref()
            .map(normalize_match_text)
            .filter(|value| !value.is_empty())
            .map(|value| format!("aumid:{value}")),
        "executable" => app
            .launch_target
            .path
            .as_deref()
            .map(normalize_path_key)
            .filter(|value| !value.is_empty())
            .map(|path| {
                format!(
                    "executable:{path}\u{0}{}",
                    app.launch_args.as_deref().unwrap_or_default()
                )
            }),
        "url" => app
            .launch_target
            .path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| format!("url:{value}")),
        "shortcut" => {
            let path = Path::new(app.launch_target.path.as_deref()?);
            match extension(path).as_deref() {
                Some("url") => read_internet_shortcut_url(path).map(|url| format!("url:{url}")),
                #[cfg(target_os = "windows")]
                Some("lnk") => shell_link_launch_identity(path),
                _ => None,
            }
        }
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn shell_link_launch_identity(path: &Path) -> Option<String> {
    let shortcut = load_shell_link(path).ok()?;
    let target_path = normalize_path_key(shortcut.target_path?.to_string_lossy().as_ref());
    if target_path.is_empty() {
        return None;
    }
    let working_directory = shortcut
        .working_directory
        .as_deref()
        .map(|path| normalize_path_key(path.to_string_lossy().as_ref()))
        .unwrap_or_default();
    Some(format!(
        "shell-link:{target_path}\u{0}{}\u{0}{working_directory}\u{0}{}\u{0}{}",
        shortcut.arguments, shortcut.show_command, shortcut.run_as
    ))
}

fn read_internet_shortcut_url(path: &Path) -> Option<String> {
    crate::catalog_metadata::cached("internet-shortcut", path, || read_internet_shortcut_url_uncached(path).ok_or(())).ok()
}

fn read_internet_shortcut_url_uncached(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let text = decode_shortcut_text(&bytes)?;
    text.lines().find_map(|line| {
        let (key, value) = line.split_once('=')?;
        key.trim()
            .eq_ignore_ascii_case("URL")
            .then(|| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

fn decode_shortcut_text(bytes: &[u8]) -> Option<String> {
    if bytes.starts_with(&[0xff, 0xfe]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16(&units).ok();
    }
    if bytes.starts_with(&[0xfe, 0xff]) {
        let units = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16(&units).ok();
    }
    String::from_utf8(
        bytes
            .strip_prefix(&[0xef, 0xbb, 0xbf])
            .unwrap_or(bytes)
            .to_vec(),
    )
    .ok()
}

fn semantic_app_id(identity: &str) -> String {
    format!("catalog-{}", short_blake3_hex(identity.as_bytes()))
}

fn semantic_tracking_key(identity: &str) -> String {
    format!("launch:{}", short_blake3_hex(identity.as_bytes()))
}

fn unresolved_app_id(source_key: &str) -> String {
    format!("catalog-source-{}", short_blake3_hex(source_key.as_bytes()))
}

fn primary_source(app: &AppCatalogItem) -> Option<&AppSource> {
    app.sources
        .iter()
        .find(|source| source.state == AppSourceState::Primary)
}

fn app_source_priority(app: &AppCatalogItem) -> u8 {
    match primary_source(app).map(|source| source.source_type) {
        Some(AppSourceType::CustomDirectory) => 4,
        Some(AppSourceType::StartMenuUser) => 3,
        Some(AppSourceType::WindowsAppCatalog) => 2,
        Some(AppSourceType::StartMenuSystem) => 1,
        None => 0,
    }
}

fn cache_catalog_icons(apps: &mut [AppCatalogItem], icon_dir: &Path) {
    for app in apps {
        if app.icon_path.is_some() {
            continue;
        }
        let Some(source) = primary_source(app)
            .filter(|source| source.source_type != AppSourceType::WindowsAppCatalog)
        else {
            continue;
        };
        let source_path = source.absolute_path.clone();
        let cache_identity = format!(
            "{}|{}",
            source.key,
            normalize_path_key(&source.absolute_path)
        );
        app.icon_path = cache_app_icon_for_identity(
            Path::new(&source_path),
            icon_dir,
            &app.id,
            &cache_identity,
        );
    }
}

#[cfg(target_os = "windows")]
#[allow(clippy::too_many_arguments)]
fn collect_apps_from_windows_catalog(
    root: &ScanRoot,
    icon_dir: &Path,
    apps: &mut Vec<AppCatalogItem>,
    seen_app_user_model_ids: &mut HashSet<String>,
    warnings: &mut Vec<ScanWarning>,
    stats: &mut ScanStats,
    limits: &ScanLimits,
) -> Result<(), String> {
    let snapshot = enumerate_windows_apps()?;
    stats.dirs_visited += 1;
    stats.entries_seen += snapshot.entries_seen.min(limits.max_entries);

    if snapshot.entries_seen > limits.max_entries {
        stats.limit_reached = true;
        push_scan_warning_once(
            warnings,
            root,
            "maxEntriesReached",
            format!("Stopped scanning after {} entries.", limits.max_entries),
        );
    }
    if snapshot.skipped_entries > 0 {
        push_scan_warning_once(
            warnings,
            root,
            "invalidAppEntry",
            format!(
                "Skipped {} Windows app entries without readable names or launch identifiers.",
                snapshot.skipped_entries
            ),
        );
    }

    for entry in snapshot.entries.into_iter().take(limits.max_entries) {
        let Some(package_family_name) = entry.package_family_name.as_deref() else {
            continue;
        };
        let app_user_model_id_key = entry.app_user_model_id.to_lowercase();
        if !seen_app_user_model_ids.insert(app_user_model_id_key) {
            continue;
        }

        let candidate = make_windows_app_candidate(entry.name.clone(), &entry.app_user_model_id);
        let cache_identity = entry
            .package_full_name
            .as_deref()
            .unwrap_or(package_family_name);
        let icon_result =
            cache_shell_item_icon(&entry.shell_item, icon_dir, &candidate.id, cache_identity);
        let icon_path = match icon_result {
            Ok(path) => Some(path),
            Err(error) => {
                log::warn!(
                    target: "windows_app_catalog",
                    "Failed to cache icon for {} ({}): {}",
                    entry.name,
                    entry.app_user_model_id,
                    error
                );
                let warning_message = format!(
                    "One or more Windows app icons could not be cached. First failure: {error}"
                );
                push_scan_warning_once(warnings, root, "iconExtractionFailed", warning_message);
                None
            }
        };

        apps.push(make_windows_app_item(root, candidate, entry, icon_path));
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn collect_apps_from_dir(
    root: &ScanRoot,
    root_dir: &Path,
    dir: &Path,
    apps: &mut Vec<AppCatalogItem>,
    seen_paths: &mut HashMap<String, ()>,
    visited_dirs: &mut HashSet<PathBuf>,
    warnings: &mut Vec<ScanWarning>,
    stats: &mut ScanStats,
    limits: &ScanLimits,
    root_entries_seen: &mut usize,
    depth: usize,
) -> Result<(), String> {
    if is_link_or_reparse_point(dir) {
        push_scan_warning_once(
            warnings,
            root,
            "linkSkipped",
            "Symbolic links and reparse points were skipped while scanning.".to_string(),
        );
        return Ok(());
    }

    if depth > limits.max_depth {
        push_scan_warning_once(
            warnings,
            root,
            "maxDepthReached",
            format!(
                "Skipped directories deeper than {} levels.",
                limits.max_depth
            ),
        );
        stats.limit_reached = true;
        return Ok(());
    }

    let canonical_dir = match dir.canonicalize() {
        Ok(path) => path,
        Err(error) if is_skippable_scan_dir_error(error.kind()) => {
            push_scan_warning_once(
                warnings,
                root,
                "skippedDirectory",
                "Some directories were skipped because they were unavailable.".to_string(),
            );
            return Ok(());
        }
        Err(error) => {
            return Err(format!(
                "Failed to resolve app directory {}: {error}",
                dir.display()
            ))
        }
    };
    if !visited_dirs.insert(canonical_dir) {
        push_scan_warning_once(
            warnings,
            root,
            "cycleSkipped",
            "A repeated directory was skipped while scanning.".to_string(),
        );
        return Ok(());
    }
    stats.dirs_visited += 1;

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if is_skippable_scan_dir_error(error.kind()) => {
            push_scan_warning_once(
                warnings,
                root,
                "skippedDirectory",
                "Some directories were skipped because they were unavailable.".to_string(),
            );
            return Ok(());
        }
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
            Err(error) => {
                push_scan_warning_once(
                    warnings,
                    root,
                    "skippedEntry",
                    format!(
                        "One or more directory entries could not be read. First failure: {error}"
                    ),
                );
                continue;
            }
        };
        let path = entry.path();
        if *root_entries_seen >= limits.max_entries {
            stats.limit_reached = true;
            push_scan_warning_once(
                warnings,
                root,
                "maxEntriesReached",
                format!("Stopped scanning after {} entries.", limits.max_entries),
            );
            return Ok(());
        }
        *root_entries_seen += 1;
        stats.entries_seen += 1;

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                push_scan_warning_once(
                    warnings,
                    root,
                    "skippedEntry",
                    format!(
                        "One or more directory entries could not be inspected. First failure: {error}"
                    ),
                );
                continue;
            }
        };
        if file_type.is_symlink() || is_reparse_point(&path) {
            push_scan_warning_once(
                warnings,
                root,
                "linkSkipped",
                "Symbolic links and reparse points were skipped while scanning.".to_string(),
            );
            continue;
        }

        if file_type.is_dir() {
            if should_skip_start_menu_directory(root, &path, depth) {
                continue;
            }
            collect_apps_from_dir(
                root,
                root_dir,
                &path,
                apps,
                seen_paths,
                visited_dirs,
                warnings,
                stats,
                limits,
                root_entries_seen,
                depth + 1,
            )?;
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
        apps.push(make_catalog_item(root, candidate));
    }

    Ok(())
}

fn should_skip_start_menu_directory(root: &ScanRoot, path: &Path, parent_depth: usize) -> bool {
    parent_depth == 0
        && matches!(
            root.root_type,
            AppSourceType::StartMenuUser | AppSourceType::StartMenuSystem
        )
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("Startup"))
}

fn scan_limits(root: &ScanRoot) -> ScanLimits {
    let default_depth = if root.root_type == AppSourceType::CustomDirectory {
        CUSTOM_DIRECTORY_MAX_DEPTH
    } else {
        START_MENU_MAX_DEPTH
    };
    ScanLimits {
        max_depth: root
            .max_depth
            .unwrap_or(default_depth)
            .min(MAX_CONFIGURED_DEPTH),
        max_entries: root
            .max_entries
            .unwrap_or(DEFAULT_MAX_ENTRIES)
            .clamp(1, MAX_CONFIGURED_ENTRIES),
    }
}

fn push_scan_warning_once(
    warnings: &mut Vec<ScanWarning>,
    root: &ScanRoot,
    kind: impl Into<String>,
    message: String,
) {
    let kind = kind.into();
    if warnings
        .iter()
        .any(|warning| warning.root_id == root.id && warning.kind == kind)
    {
        return;
    }
    warnings.push(ScanWarning {
        root_id: root.id.clone(),
        root_label: root.label.clone(),
        kind,
        message,
    });
}

fn is_link_or_reparse_point(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink() || is_reparse_metadata(&metadata))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn is_reparse_point(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| is_reparse_metadata(&metadata))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn is_reparse_metadata(metadata: &fs::Metadata) -> bool {
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT_VALUE != 0
}

#[cfg(not(target_os = "windows"))]
fn is_reparse_point(_path: &Path) -> bool {
    false
}

#[cfg(not(target_os = "windows"))]
fn is_reparse_metadata(_metadata: &fs::Metadata) -> bool {
    false
}

fn is_supported_launch_file(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("lnk") | Some("url") | Some("exe")
    )
}

fn is_skippable_scan_dir_error(kind: ErrorKind) -> bool {
    matches!(kind, ErrorKind::NotFound | ErrorKind::PermissionDenied)
}

fn make_catalog_candidate(root: &ScanRoot, root_dir: &Path, path: &Path) -> CatalogCandidate {
    let name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Application")
        .trim()
        .to_string();
    #[cfg(target_os = "windows")]
    let name = crate::windows_app_catalog::filesystem_display_name(path).unwrap_or(name);
    let path_string = windows_api_path(path);
    let kind = match extension(path).as_deref() {
        Some("exe") => "executable",
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

fn make_windows_app_candidate(name: String, app_user_model_id: &str) -> CatalogCandidate {
    let normalized_aumid = normalize_match_text(app_user_model_id);
    let path_string = format!("shell:AppsFolder\\{app_user_model_id}");
    let identity = format!("aumid:{normalized_aumid}");
    CatalogCandidate {
        id: semantic_app_id(&identity),
        name,
        kind: "appUserModelId".to_string(),
        path_string,
        relative_path: app_user_model_id.to_string(),
        source_key: format!("windows-app:{normalized_aumid}"),
    }
}

fn make_catalog_item(root: &ScanRoot, candidate: CatalogCandidate) -> AppCatalogItem {
    #[cfg(windows)]
    let group_display_name = candidate.relative_path.split('/').next().filter(|_| candidate.relative_path.contains('/'))
        .and_then(|part| crate::windows_app_catalog::filesystem_display_name(&Path::new(&crate::path_utils::expand_windows_env_vars(&root.path)).join(part)));
    #[cfg(not(windows))]
    let group_display_name = None;
    let source = AppSource {
        group_display_name,
        key: candidate.source_key.clone(),
        source_type: root.root_type,
        state: AppSourceState::Primary,
        root_id: root.id.clone(),
        root_label: root.label.clone(),
        relative_path: candidate.relative_path,
        absolute_path: candidate.path_string.clone(),
    };

    AppCatalogItem {
        id: candidate.id,
        item_type: "app".to_string(),
        name: if candidate.name.is_empty() {
            "Application".to_string()
        } else {
            candidate.name.clone()
        },
        icon_path: None,
        emoji: Some(app_glyph(&candidate.name)),
        launch_target: LaunchTarget {
            kind: candidate.kind,
            path: Some(candidate.path_string.clone()),
            app_user_model_id: None,
        },
        launch_args: None,
        tracking_key: String::new(),
        identity_status: CatalogIdentityStatus::Unresolved,
        sources: vec![source],
    }
}

#[cfg(target_os = "windows")]
fn make_windows_app_item(
    root: &ScanRoot,
    candidate: CatalogCandidate,
    entry: WindowsAppEntry,
    icon_path: Option<String>,
) -> AppCatalogItem {
    let source = AppSource {
        group_display_name: None,
        key: candidate.source_key.clone(),
        source_type: root.root_type,
        state: AppSourceState::Primary,
        root_id: root.id.clone(),
        root_label: root.label.clone(),
        relative_path: candidate.relative_path,
        absolute_path: candidate.path_string,
    };

    AppCatalogItem {
        id: candidate.id,
        item_type: "app".to_string(),
        name: if candidate.name.is_empty() {
            "Application".to_string()
        } else {
            candidate.name.clone()
        },
        icon_path,
        emoji: Some(app_glyph(&candidate.name)),
        launch_target: LaunchTarget {
            kind: candidate.kind,
            path: None,
            app_user_model_id: Some(entry.app_user_model_id),
        },
        launch_args: None,
        tracking_key: String::new(),
        identity_status: CatalogIdentityStatus::Unresolved,
        sources: vec![source],
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
                Some(NormalizedKeyword {
                    display: keyword.trim().to_string(),
                    matcher: normalized,
                })
            })
            .collect();

        let blocked_catalog_ids = filters
            .app_blacklist
            .iter()
            .filter_map(|item| item.catalog_id.as_deref())
            .map(normalize_match_text)
            .filter(|value| !value.is_empty())
            .collect();

        let keyword_allowed_catalog_ids = filters
            .keyword_allowlist
            .iter()
            .map(|catalog_id| normalize_match_text(catalog_id))
            .filter(|catalog_id| !catalog_id.is_empty())
            .collect();

        Self {
            keyword_blacklist,
            keyword_allowed_catalog_ids,
            blocked_catalog_ids,
        }
    }
}

fn matching_keyword<'a>(
    app_name: &str,
    filters: &'a NormalizedScanFilters,
) -> Option<&'a NormalizedKeyword> {
    if filters.keyword_blacklist.is_empty() {
        return None;
    }

    let name = normalize_match_text(app_name);
    filters
        .keyword_blacklist
        .iter()
        .find(|keyword| name.contains(&keyword.matcher))
}

#[cfg(target_os = "windows")]
fn expand_scan_root_path(path: &str) -> PathBuf {
    PathBuf::from(expand_windows_env_vars(path))
}

#[cfg(not(target_os = "windows"))]
fn expand_scan_root_path(path: &str) -> PathBuf {
    PathBuf::from(path)
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

pub fn stable_app_id(path: &str) -> String {
    let normalized = path.to_lowercase();
    format!("win-app-{}", short_blake3_hex(normalized.as_bytes()))
}

fn app_glyph(name: &str) -> String {
    name.chars()
        .find(|character| character.is_alphanumeric())
        .map(|character| character.to_uppercase().collect())
        .unwrap_or_else(|| "A".to_string())
}

pub fn icon_file_data_url(path: &str) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    Some(format!("data:image/png;base64,{}", encode_base64(&bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[cfg(target_os = "windows")]
    use crate::windows_com::ComGuard;
    #[cfg(target_os = "windows")]
    use windows::{
        core::{Interface, HSTRING},
        Win32::{
            System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER},
            UI::Shell::{IShellLinkW, ShellLink},
        },
    };

    #[cfg(target_os = "windows")]
    fn create_shell_link(path: &Path, target: &Path, arguments: &str) {
        let _com_guard = ComGuard::new().expect("initialize COM");
        let shell_link: IShellLinkW = unsafe {
            CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .expect("create Windows shell link")
        };
        let target = HSTRING::from(windows_api_path(target));
        unsafe {
            shell_link.SetPath(&target).expect("set shell link target");
            if !arguments.is_empty() {
                let arguments = HSTRING::from(arguments);
                shell_link
                    .SetArguments(&arguments)
                    .expect("set shell link arguments");
            }
        }
        let persist_file: IPersistFile =
            shell_link.cast().expect("cast shell link to IPersistFile");
        let path = HSTRING::from(windows_api_path(path));
        unsafe {
            persist_file.Save(&path, true).expect("save shell link");
        }
    }

    #[test]
    fn scan_filters_match_app_names_case_insensitively() {
        let filters = NormalizedScanFilters::from(&ScanFilters {
            keyword_blacklist: vec!["卸载".to_string(), "UNINSTALL".to_string()],
            keyword_allowlist: Vec::new(),
            app_blacklist: Vec::new(),
        });

        assert!(matching_keyword("卸载 Example", &filters).is_some());
        assert!(matching_keyword("Example", &filters).is_none());
        assert!(matching_keyword("Example", &filters).is_none());
    }

    #[test]
    fn scan_keyword_filters_match_app_names_without_filtering_parent_paths() {
        let base = env::temp_dir().join(format!(
            "lumeria-keyword-name-only-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let scan_root = base.join("uninstall-tools");
        fs::create_dir_all(&scan_root).expect("create scan directory");
        fs::write(scan_root.join("Example.exe"), []).expect("create included app");
        fs::write(scan_root.join("Uninstall Example.exe"), []).expect("create excluded app");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let root = ScanRoot {
            id: "root-custom".to_string(),
            root_type: AppSourceType::CustomDirectory,
            label: "Custom".to_string(),
            path: scan_root.to_string_lossy().to_string(),
            enabled: true,
            max_depth: None,
            max_entries: None,
        };

        let result = scan_apps_from_roots(
            &[root],
            &icon_dir,
            &ScanFilters {
                keyword_blacklist: vec!["UnInstall".to_string()],
                keyword_allowlist: Vec::new(),
                app_blacklist: Vec::new(),
            },
        )
        .expect("scan should complete");

        assert_eq!(result.apps.len(), 1);
        assert_eq!(result.apps[0].name, "Example");
        assert_eq!(result.stats.keyword_excluded_apps, 1);
        assert_eq!(result.keyword_excluded_apps.len(), 1);
        assert_eq!(
            result.keyword_excluded_apps[0].app.name,
            "Uninstall Example"
        );
        assert_eq!(result.keyword_excluded_apps[0].matched_keyword, "UnInstall");
        assert_eq!(
            result.keyword_excluded_apps[0].app.launch_target.path,
            Some(windows_api_path(&scan_root.join("Uninstall Example.exe")))
        );
        assert_eq!(
            result.keyword_excluded_apps[0].app.emoji.as_deref(),
            Some("U")
        );

        let allowed_id = result.keyword_excluded_apps[0].app.id.clone();
        let allowed = scan_apps_from_roots(
            &[ScanRoot {
                id: "root-custom".to_string(),
                root_type: AppSourceType::CustomDirectory,
                label: "Custom".to_string(),
                path: scan_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            }],
            &icon_dir,
            &ScanFilters {
                keyword_blacklist: vec!["uninstall".to_string()],
                keyword_allowlist: vec![allowed_id.clone()],
                app_blacklist: Vec::new(),
            },
        )
        .expect("allowlisted scan should complete");
        assert_eq!(allowed.apps.len(), 2);
        assert!(allowed.apps.iter().any(|app| app.id == allowed_id));
        assert!(allowed.keyword_excluded_apps.is_empty());
        assert_eq!(allowed.stats.keyword_excluded_apps, 0);
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[test]
    fn scan_keyword_excluded_apps_are_bounded_without_losing_the_total() {
        let base = env::temp_dir().join(format!(
            "lumeria-keyword-preview-limit-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let scan_root = base.join("apps");
        fs::create_dir_all(&scan_root).expect("create scan directory");
        for index in 0..201 {
            fs::write(scan_root.join(format!("Uninstall App {index}.exe")), [])
                .expect("create excluded app");
        }
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let root = ScanRoot {
            id: "root-custom".to_string(),
            root_type: AppSourceType::CustomDirectory,
            label: "Custom".to_string(),
            path: scan_root.to_string_lossy().to_string(),
            enabled: true,
            max_depth: None,
            max_entries: None,
        };

        let result = scan_apps_from_roots(
            &[root],
            &icon_dir,
            &ScanFilters {
                keyword_blacklist: vec!["uninstall".to_string()],
                keyword_allowlist: Vec::new(),
                app_blacklist: Vec::new(),
            },
        )
        .expect("scan should complete");

        assert_eq!(result.stats.keyword_excluded_apps, 201);
        assert_eq!(result.keyword_excluded_apps.len(), 200);
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[test]
    fn stable_app_id_uses_fixed_length_case_insensitive_hash() {
        let id = stable_app_id(r"C:\Apps\Example.lnk");

        assert!(id.starts_with("win-app-"));
        assert_eq!(id.len(), "win-app-".len() + 32);
        assert_eq!(id, stable_app_id(r"c:\apps\example.lnk"));
        assert_ne!(id, stable_app_id(r"C:\Apps\Other.lnk"));
    }

    #[test]
    fn windows_app_candidates_use_aumid_identity() {
        let candidate =
            make_windows_app_candidate("Settings".to_string(), "Example.Package_123!App");
        let same_candidate =
            make_windows_app_candidate("Renamed".to_string(), "example.package_123!app");

        assert_eq!(candidate.kind, "appUserModelId");
        assert_eq!(candidate.source_key, "windows-app:example.package_123!app");
        assert_eq!(
            candidate.path_string,
            "shell:AppsFolder\\Example.Package_123!App"
        );
        assert_eq!(candidate.id, same_candidate.id);
    }

    #[test]
    fn url_files_are_treated_as_local_shortcuts() {
        let root = ScanRoot {
            id: "root".to_string(),
            root_type: AppSourceType::CustomDirectory,
            label: "Root".to_string(),
            path: r"C:\Apps".to_string(),
            enabled: true,
            max_depth: None,
            max_entries: None,
        };
        let candidate = make_catalog_candidate(
            &root,
            Path::new(r"C:\Apps"),
            Path::new(r"C:\Apps\Example.url"),
        );

        assert_eq!(candidate.kind, "shortcut");
        assert_eq!(candidate.path_string, r"C:\Apps\Example.url");
    }

    #[test]
    fn user_start_menu_entry_overlays_the_same_system_relative_path() {
        let base = env::temp_dir().join(format!(
            "lumeria-start-menu-overlay-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let user_root = base.join("user");
        let system_root = base.join("system");
        let user_app = user_root.join("Steam").join("Steam.exe");
        let system_app = system_root.join("Steam").join("Steam.exe");
        fs::create_dir_all(user_app.parent().expect("user app parent"))
            .expect("create user start menu");
        fs::create_dir_all(system_app.parent().expect("system app parent"))
            .expect("create system start menu");
        fs::write(&user_app, []).expect("create user app");
        fs::write(&system_app, []).expect("create system app");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let roots = [
            ScanRoot {
                id: "root-start-menu-system".to_string(),
                root_type: AppSourceType::StartMenuSystem,
                label: "System Start Menu".to_string(),
                path: system_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
            ScanRoot {
                id: "root-start-menu-user".to_string(),
                root_type: AppSourceType::StartMenuUser,
                label: "User Start Menu".to_string(),
                path: user_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
        ];

        let result = scan_apps_from_roots(&roots, &icon_dir, &ScanFilters::default())
            .expect("scan should complete");

        assert_eq!(result.apps.len(), 1);
        assert_eq!(
            primary_source(&result.apps[0]).map(|source| source.source_type),
            Some(AppSourceType::StartMenuUser)
        );
        assert_eq!(
            result.apps[0].launch_target.path.as_deref(),
            Some(user_app.to_string_lossy().as_ref())
        );
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[test]
    fn start_menu_startup_entries_are_not_catalog_apps() {
        let base = env::temp_dir().join(format!(
            "lumeria-start-menu-startup-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let start_menu_root = base.join("start-menu");
        let normal_app = start_menu_root.join("QuickLook.exe");
        let startup_app = start_menu_root.join("Startup").join("QuickLook.exe");
        fs::create_dir_all(startup_app.parent().expect("startup app parent"))
            .expect("create startup directory");
        fs::write(&normal_app, []).expect("create normal app");
        fs::write(&startup_app, []).expect("create startup app");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let root = ScanRoot {
            id: "root-start-menu-user".to_string(),
            root_type: AppSourceType::StartMenuUser,
            label: "User Start Menu".to_string(),
            path: start_menu_root.to_string_lossy().to_string(),
            enabled: true,
            max_depth: None,
            max_entries: None,
        };

        let result = scan_apps_from_roots(&[root], &icon_dir, &ScanFilters::default())
            .expect("scan should complete");

        assert_eq!(result.apps.len(), 1);
        assert_eq!(
            result.apps[0].launch_target.path.as_deref(),
            Some(normal_app.to_string_lossy().as_ref())
        );
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[test]
    fn equivalent_custom_and_start_menu_shortcuts_are_one_catalog_app() {
        let base = env::temp_dir().join(format!(
            "lumeria-semantic-catalog-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let start_menu_root = base.join("start-menu");
        let custom_root = base.join("custom");
        let start_menu_app = start_menu_root.join("Steam").join("Steam.url");
        let custom_app = custom_root.join("Steam.url");
        fs::create_dir_all(start_menu_app.parent().expect("start menu app parent"))
            .expect("create start menu directory");
        fs::create_dir_all(&custom_root).expect("create custom directory");
        let shortcut = b"[InternetShortcut]\r\nURL=https://store.steampowered.com/\r\n";
        fs::write(&start_menu_app, shortcut).expect("create start menu shortcut");
        fs::write(&custom_app, shortcut).expect("create custom shortcut");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let roots = [
            ScanRoot {
                id: "root-start-menu-user".to_string(),
                root_type: AppSourceType::StartMenuUser,
                label: "User Start Menu".to_string(),
                path: start_menu_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
            ScanRoot {
                id: "root-custom".to_string(),
                root_type: AppSourceType::CustomDirectory,
                label: "Custom".to_string(),
                path: custom_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
        ];

        let result = scan_apps_from_roots(&roots, &icon_dir, &ScanFilters::default())
            .expect("scan should complete");

        assert_eq!(result.apps.len(), 1);
        assert_eq!(
            primary_source(&result.apps[0]).map(|source| source.source_type),
            Some(AppSourceType::CustomDirectory)
        );
        assert_eq!(result.apps[0].sources.len(), 2);
        assert!(result.apps[0].sources.iter().any(|source| {
            source.source_type == AppSourceType::CustomDirectory
                && source.state == AppSourceState::Primary
        }));
        assert!(result.apps[0].sources.iter().any(|source| {
            source.source_type == AppSourceType::StartMenuUser
                && source.state == AppSourceState::Equivalent
        }));
        assert_eq!(result.apps[0].identity_status, CatalogIdentityStatus::Exact);
        assert!(result.apps[0].tracking_key.starts_with("launch:"));
        assert_eq!(result.stats.physical_apps_found, 2);
        assert_eq!(result.stats.equivalent_apps_merged, 1);
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[test]
    fn unresolved_shortcuts_are_never_semantically_merged() {
        let base = env::temp_dir().join(format!(
            "lumeria-unresolved-catalog-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let first_root = base.join("first");
        let second_root = base.join("second");
        fs::create_dir_all(&first_root).expect("create first root");
        fs::create_dir_all(&second_root).expect("create second root");
        fs::write(first_root.join("Broken.lnk"), b"not a shell link")
            .expect("create first broken shortcut");
        fs::write(second_root.join("Broken.lnk"), b"not a shell link")
            .expect("create second broken shortcut");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let roots = [
            ScanRoot {
                id: "root-first".to_string(),
                root_type: AppSourceType::CustomDirectory,
                label: "First".to_string(),
                path: first_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
            ScanRoot {
                id: "root-second".to_string(),
                root_type: AppSourceType::CustomDirectory,
                label: "Second".to_string(),
                path: second_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
        ];

        let result = scan_apps_from_roots(&roots, &icon_dir, &ScanFilters::default())
            .expect("scan should complete");

        assert_eq!(result.apps.len(), 2);
        assert_ne!(result.apps[0].id, result.apps[1].id);
        assert!(result
            .apps
            .iter()
            .all(|app| app.identity_status == CatalogIdentityStatus::Unresolved));
        assert_eq!(result.stats.unresolved_apps, 2);
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[test]
    fn custom_root_provenance_is_kept_when_it_points_at_a_builtin_root() {
        let base = env::temp_dir().join(format!(
            "lumeria-overlapping-roots-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let root_path = base.join("apps");
        fs::create_dir_all(&root_path).expect("create apps directory");
        fs::write(
            root_path.join("Steam.url"),
            b"[InternetShortcut]\r\nURL=https://store.steampowered.com/\r\n",
        )
        .expect("create shortcut");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let roots = [
            ScanRoot {
                id: "root-start-menu-user".to_string(),
                root_type: AppSourceType::StartMenuUser,
                label: "User Start Menu".to_string(),
                path: root_path.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
            ScanRoot {
                id: "root-custom".to_string(),
                root_type: AppSourceType::CustomDirectory,
                label: "Custom".to_string(),
                path: root_path.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
        ];

        let result = scan_apps_from_roots(&roots, &icon_dir, &ScanFilters::default())
            .expect("scan should complete");

        assert_eq!(result.apps.len(), 1);
        assert_eq!(result.apps[0].sources.len(), 2);
        assert_eq!(
            primary_source(&result.apps[0]).map(|source| source.source_type),
            Some(AppSourceType::CustomDirectory)
        );
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[test]
    fn catalog_blacklist_excludes_a_logical_app_from_every_source() {
        let base = env::temp_dir().join(format!(
            "lumeria-logical-exclusion-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let start_menu_root = base.join("start-menu");
        let custom_root = base.join("custom");
        let start_menu_app = start_menu_root.join("Steam").join("Steam.url");
        let custom_app = custom_root.join("Steam.url");
        fs::create_dir_all(start_menu_app.parent().expect("start menu app parent"))
            .expect("create start menu directory");
        fs::create_dir_all(&custom_root).expect("create custom directory");
        let shortcut = b"[InternetShortcut]\r\nURL=https://store.steampowered.com/\r\n";
        fs::write(&start_menu_app, shortcut).expect("create start menu shortcut");
        fs::write(&custom_app, shortcut).expect("create custom shortcut");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let roots = [
            ScanRoot {
                id: "root-start-menu-user".to_string(),
                root_type: AppSourceType::StartMenuUser,
                label: "User Start Menu".to_string(),
                path: start_menu_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
            ScanRoot {
                id: "root-custom".to_string(),
                root_type: AppSourceType::CustomDirectory,
                label: "Custom".to_string(),
                path: custom_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
        ];
        let first = scan_apps_from_roots(&roots, &icon_dir, &ScanFilters::default())
            .expect("initial scan should complete");
        let catalog_id = first.apps[0].id.clone();

        let excluded = scan_apps_from_roots(
            &roots,
            &icon_dir,
            &ScanFilters {
                keyword_blacklist: vec!["steam".to_string()],
                keyword_allowlist: vec![catalog_id.clone()],
                app_blacklist: vec![ScanAppBlacklistItem {
                    catalog_id: Some(catalog_id),
                }],
            },
        )
        .expect("excluded scan should complete");

        assert!(excluded.apps.is_empty());
        assert_eq!(excluded.excluded_apps.len(), 1);
        assert_eq!(excluded.excluded_apps[0].id, first.apps[0].id);
        assert_eq!(excluded.excluded_apps[0].sources.len(), 2);
        assert!(excluded.keyword_excluded_apps.is_empty());
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn equivalent_windows_shell_links_are_one_catalog_app() {
        let base = env::temp_dir().join(format!(
            "lumeria-shell-link-catalog-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let start_menu_root = base.join("start-menu");
        let custom_root = base.join("custom");
        let target = base.join("Steam.exe");
        let start_menu_app = start_menu_root.join("Steam").join("Steam.lnk");
        let custom_app = custom_root.join("Steam.lnk");
        fs::create_dir_all(start_menu_app.parent().expect("start menu app parent"))
            .expect("create start menu directory");
        fs::create_dir_all(&custom_root).expect("create custom directory");
        fs::write(&target, []).expect("create target executable");
        create_shell_link(&start_menu_app, &target, "-silent");
        create_shell_link(&custom_app, &target, "-silent");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let roots = [
            ScanRoot {
                id: "root-start-menu-user".to_string(),
                root_type: AppSourceType::StartMenuUser,
                label: "User Start Menu".to_string(),
                path: start_menu_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
            ScanRoot {
                id: "root-custom".to_string(),
                root_type: AppSourceType::CustomDirectory,
                label: "Custom".to_string(),
                path: custom_root.to_string_lossy().to_string(),
                enabled: true,
                max_depth: None,
                max_entries: None,
            },
        ];

        let result = scan_apps_from_roots(&roots, &icon_dir, &ScanFilters::default())
            .expect("scan should complete");

        assert_eq!(result.apps.len(), 1);
        assert_eq!(result.apps[0].sources.len(), 2);
        assert_eq!(
            primary_source(&result.apps[0]).map(|source| source.source_type),
            Some(AppSourceType::CustomDirectory)
        );
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_shell_links_with_different_arguments_stay_distinct() {
        let base = env::temp_dir().join(format!(
            "lumeria-shell-link-arguments-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let root_path = base.join("apps");
        let target = base.join("Tool.exe");
        fs::create_dir_all(&root_path).expect("create apps directory");
        fs::write(&target, []).expect("create target executable");
        create_shell_link(&root_path.join("Tool Safe.lnk"), &target, "--safe");
        create_shell_link(&root_path.join("Tool Admin.lnk"), &target, "--admin");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let root = ScanRoot {
            id: "root-custom".to_string(),
            root_type: AppSourceType::CustomDirectory,
            label: "Custom".to_string(),
            path: root_path.to_string_lossy().to_string(),
            enabled: true,
            max_depth: None,
            max_entries: None,
        };

        let result = scan_apps_from_roots(&[root], &icon_dir, &ScanFilters::default())
            .expect("scan should complete");

        assert_eq!(result.apps.len(), 2);
        assert_ne!(result.apps[0].id, result.apps[1].id);
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[test]
    fn scan_respects_max_depth() {
        let base = env::temp_dir().join(format!(
            "lumeria-scan-depth-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let nested = base.join("one").join("two");
        fs::create_dir_all(&nested).expect("create nested test directory");
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let root = ScanRoot {
            id: "root".to_string(),
            root_type: AppSourceType::CustomDirectory,
            label: "Root".to_string(),
            path: base.to_string_lossy().to_string(),
            enabled: true,
            max_depth: Some(1),
            max_entries: Some(100),
        };

        let result = scan_apps_from_roots(&[root], &icon_dir, &ScanFilters::default())
            .expect("scan should complete");

        assert!(result.stats.limit_reached);
        assert!(result
            .warnings
            .iter()
            .any(|warning| warning.kind == "maxDepthReached"));
        fs::remove_dir_all(base).expect("remove test directory");
    }

    #[cfg(target_os = "windows")]
    #[test]
    #[ignore = "requires a Windows shell user session"]
    fn scan_windows_app_catalog_smoke() {
        let base = env::temp_dir().join(format!(
            "lumeria-windows-app-scan-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let icon_dir = base.join("icons");
        fs::create_dir_all(&icon_dir).expect("create icon directory");
        let root = ScanRoot {
            id: "root-windows-app-catalog".to_string(),
            root_type: AppSourceType::WindowsAppCatalog,
            label: "Windows Apps".to_string(),
            path: "shell:AppsFolder".to_string(),
            enabled: true,
            max_depth: None,
            max_entries: Some(5000),
        };

        let result = scan_apps_from_roots(&[root], &icon_dir, &ScanFilters::default())
            .expect("Windows app scan should complete");

        assert!(
            !result.apps.is_empty(),
            "at least one packaged Windows app should be discoverable"
        );
        assert!(result
            .apps
            .iter()
            .all(|app| app.launch_target.kind == "appUserModelId"));
        for app in &result.apps {
            println!(
                "{} -> {:?} (icon: {:?})",
                app.name, app.launch_target.app_user_model_id, app.icon_path
            );
        }
        for warning in &result.warnings {
            println!("warning {}: {}", warning.kind, warning.message);
        }
        assert!(
            result.apps.iter().any(|app| app.icon_path.is_some()),
            "at least one Windows app icon should be cached"
        );
        fs::remove_dir_all(base).expect("remove test directory");
    }
}
