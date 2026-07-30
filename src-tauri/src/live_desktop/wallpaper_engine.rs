use std::collections::HashSet;

#[cfg(target_os = "windows")]
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

#[cfg(target_os = "windows")]
use super::{
    report_live_desktop_renderer_startup_progress, LiveDesktopOutputContext,
    LiveDesktopRendererStartupMessage,
};
use super::{LiveDesktopWindowDiagnostics, LiveDesktopWindowInfo};

#[cfg(target_os = "windows")]
use super::window_diagnostics::{
    probe_windows_live_desktop_windows, read_live_desktop_process_image_path,
};

#[cfg(target_os = "windows")]
#[derive(Clone)]
pub(super) struct LiveDesktopWallpaperEnginePopupPlan {
    pub(super) window_name: String,
    pub(super) monitor_index: u32,
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) x: i32,
    pub(super) y: i32,
}

#[cfg(target_os = "windows")]
pub(super) struct LiveDesktopWallpaperEnginePopupEnsureResult {
    pub(super) detail: String,
    pub(super) close_command: Option<LiveDesktopWallpaperEnginePopupCloseCommand>,
}

#[cfg(target_os = "windows")]
#[derive(Clone)]
pub(super) struct LiveDesktopWallpaperEnginePopupCloseCommand {
    executable_path: PathBuf,
    window_name: String,
}

#[cfg(target_os = "windows")]
struct LiveDesktopWallpaperEngineGetWallpaperAttempt {
    label: String,
    success: bool,
    status_code: Option<i32>,
    stdout: String,
    stderr: String,
    error: Option<String>,
}

#[cfg(target_os = "windows")]
struct LiveDesktopWallpaperEngineWallpaperPath {
    path: String,
    detail: String,
}

#[cfg(target_os = "windows")]
struct LiveDesktopWallpaperEngineConfigRead {
    value: Option<serde_json::Value>,
    detail: String,
}

pub(super) fn collect_wallpaper_engine_popup_wgc_targets(
    diagnostics: &LiveDesktopWindowDiagnostics,
    preferred_window_name: Option<&str>,
) -> Vec<LiveDesktopWindowInfo> {
    let mut targets = Vec::new();
    let mut seen = HashSet::<String>::new();
    if let Some(window_name) = preferred_window_name {
        for popup in diagnostics
            .candidates
            .iter()
            .filter(|info| info.role == "wallpaperPopup" && info.title == window_name)
        {
            for info in diagnostics.windows.iter().filter(|info| {
                info.parent_hwnd == popup.hwnd && is_wallpaper_engine_popup_content_window(info)
            }) {
                push_live_desktop_wgc_target(&mut targets, &mut seen, info);
            }
            push_live_desktop_wgc_target(&mut targets, &mut seen, popup);
        }
    }
    for popup in diagnostics
        .candidates
        .iter()
        .filter(|info| info.role == "wallpaperPopup")
    {
        for info in diagnostics.windows.iter().filter(|info| {
            info.parent_hwnd == popup.hwnd && is_wallpaper_engine_popup_content_window(info)
        }) {
            push_live_desktop_wgc_target(&mut targets, &mut seen, info);
        }
    }
    for info in diagnostics
        .candidates
        .iter()
        .filter(|info| info.role == "wallpaperPopup")
    {
        push_live_desktop_wgc_target(&mut targets, &mut seen, info);
    }
    targets
}

fn is_wallpaper_engine_popup_content_window(info: &LiveDesktopWindowInfo) -> bool {
    info.visible
        && info.class_name.eq_ignore_ascii_case("WPEDesktopDX11Window")
        && info.candidate_reason == "wallpaperProcessOrTitle"
        && info.rect.width >= 320
        && info.rect.height >= 180
}

pub(super) fn wallpaper_engine_popup_target_matches_window_name(
    target: &LiveDesktopWindowInfo,
    diagnostics: &LiveDesktopWindowDiagnostics,
    window_name: &str,
) -> bool {
    wallpaper_engine_popup_root_for_target(target, diagnostics)
        .map(|popup| popup.title == window_name)
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
pub(super) fn create_wallpaper_engine_popup_plan(
    output_context: &LiveDesktopOutputContext,
) -> LiveDesktopWallpaperEnginePopupPlan {
    LiveDesktopWallpaperEnginePopupPlan {
        window_name: format!(
            "Lumeria::LiveDesktop::display{}::{}x{}",
            output_context.output_index, output_context.output_width, output_context.output_height
        ),
        monitor_index: output_context.output_index,
        width: output_context.output_width.max(1),
        height: output_context.output_height.max(1),
        x: -(output_context.output_width.max(1) as i32) - 128,
        y: 0,
    }
}

#[cfg(target_os = "windows")]
pub(super) fn ensure_wallpaper_engine_named_popup(
    plan: &LiveDesktopWallpaperEnginePopupPlan,
    progress_sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
) -> LiveDesktopWallpaperEnginePopupEnsureResult {
    let before = unsafe { probe_windows_live_desktop_windows() };
    if let Some(existing) = find_wallpaper_engine_popup_by_name(&before, &plan.window_name) {
        let executable_path = find_wallpaper_engine_executable_path(&before);
        return LiveDesktopWallpaperEnginePopupEnsureResult {
            detail: format!(
                "popupOwner=lumeria popupLifecycle=foundExisting popupWindowName={} root={} size={}x{}",
                plan.window_name, existing.hwnd, existing.rect.width, existing.rect.height
            ),
            close_command: executable_path.map(|path| LiveDesktopWallpaperEnginePopupCloseCommand {
                executable_path: path,
                window_name: plan.window_name.clone(),
            }),
        };
    }

    let Some(executable_path) = find_wallpaper_engine_executable_path(&before) else {
        return LiveDesktopWallpaperEnginePopupEnsureResult {
            detail: format!(
                "popupOwner=userFallback popupLifecycle=manualFallback popupWindowName={} error=wallpaperEngineExecutableNotFound",
                plan.window_name
            ),
            close_command: None,
        };
    };
    report_live_desktop_renderer_startup_progress(
        progress_sender,
        format!(
            "Querying Wallpaper Engine current wallpaper through {}",
            executable_path.display()
        ),
    );
    let wallpaper_query = match read_wallpaper_engine_current_wallpaper_path(
        &executable_path,
        plan.monitor_index,
    ) {
        Ok(query) => query,
        Err(error) => {
            return LiveDesktopWallpaperEnginePopupEnsureResult {
                detail: format!(
                    "popupOwner=userFallback popupLifecycle=manualFallback popupWindowName={} error={}",
                    plan.window_name, error
                ),
                close_command: None,
            };
        }
    };
    let wallpaper_path = wallpaper_query.path;

    report_live_desktop_renderer_startup_progress(
        progress_sender,
        format!(
            "Opening Wallpaper Engine popup {} at {}x{}",
            plan.window_name, plan.width, plan.height
        ),
    );
    if let Err(error) = open_wallpaper_engine_named_popup(&executable_path, &wallpaper_path, plan) {
        return LiveDesktopWallpaperEnginePopupEnsureResult {
            detail: format!(
                "popupOwner=userFallback popupLifecycle=manualFallback popupWindowName={} wallpaper={} wallpaperSource={} error={}",
                plan.window_name, wallpaper_path, wallpaper_query.detail, error
            ),
            close_command: None,
        };
    }

    let deadline = Instant::now() + Duration::from_millis(5_000);
    while Instant::now() < deadline {
        thread::sleep(Duration::from_millis(150));
        let diagnostics = unsafe { probe_windows_live_desktop_windows() };
        if let Some(created) = find_wallpaper_engine_popup_by_name(&diagnostics, &plan.window_name)
        {
            return LiveDesktopWallpaperEnginePopupEnsureResult {
                detail: format!(
                    "popupOwner=lumeria popupLifecycle=created popupWindowName={} root={} targetSize={}x{} wallpaper={} wallpaperSource={}",
                    plan.window_name, created.hwnd, plan.width, plan.height, wallpaper_path, wallpaper_query.detail
                ),
                close_command: Some(LiveDesktopWallpaperEnginePopupCloseCommand {
                    executable_path,
                    window_name: plan.window_name.clone(),
                }),
            };
        }
    }

    LiveDesktopWallpaperEnginePopupEnsureResult {
        detail: format!(
            "popupOwner=userFallback popupLifecycle=openSentButNotFound popupWindowName={} targetSize={}x{} wallpaper={} wallpaperSource={}",
            plan.window_name, plan.width, plan.height, wallpaper_path, wallpaper_query.detail
        ),
        close_command: Some(LiveDesktopWallpaperEnginePopupCloseCommand {
            executable_path,
            window_name: plan.window_name.clone(),
        }),
    }
}

fn find_wallpaper_engine_popup_by_name<'a>(
    diagnostics: &'a LiveDesktopWindowDiagnostics,
    window_name: &str,
) -> Option<&'a LiveDesktopWindowInfo> {
    diagnostics
        .windows
        .iter()
        .find(|info| info.role == "wallpaperPopup" && info.title == window_name)
        .or_else(|| {
            diagnostics
                .candidates
                .iter()
                .find(|info| info.role == "wallpaperPopup" && info.title == window_name)
        })
}

#[cfg(target_os = "windows")]
fn find_wallpaper_engine_executable_path(
    diagnostics: &LiveDesktopWindowDiagnostics,
) -> Option<PathBuf> {
    diagnostics
        .windows
        .iter()
        .chain(diagnostics.candidates.iter())
        .filter(|info| {
            info.process_name.eq_ignore_ascii_case("wallpaper64.exe")
                || info.process_name.eq_ignore_ascii_case("wallpaper32.exe")
        })
        .filter_map(|info| read_live_desktop_process_image_path(info.pid).map(PathBuf::from))
        .find(|path| path.exists())
        .or_else(find_wallpaper_engine_executable_in_standard_locations)
}

#[cfg(target_os = "windows")]
fn find_wallpaper_engine_executable_in_standard_locations() -> Option<PathBuf> {
    let mut roots = Vec::new();
    if let Some(path) = env::var_os("ProgramFiles(x86)") {
        roots.push(PathBuf::from(path));
    }
    if let Some(path) = env::var_os("ProgramFiles") {
        roots.push(PathBuf::from(path));
    }
    for root in roots {
        for relative in [
            "Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe",
            "Steam\\steamapps\\common\\wallpaper_engine\\wallpaper32.exe",
        ] {
            let path = root.join(relative);
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn read_wallpaper_engine_current_wallpaper_path(
    executable_path: &PathBuf,
    monitor_index: u32,
) -> Result<LiveDesktopWallpaperEngineWallpaperPath, String> {
    let config = read_wallpaper_engine_config(executable_path);
    let (location_candidates, location_detail) =
        read_wallpaper_engine_location_candidates(config.value.as_ref(), &config.detail);
    let mut attempts = Vec::new();

    for location in location_candidates.iter().take(16) {
        let args = vec![
            "-control".to_string(),
            "getWallpaper".to_string(),
            "-location".to_string(),
            location.clone(),
        ];
        let label = format!(
            "location:{}",
            truncate_wallpaper_engine_cli_text(location, 64)
        );
        if let Some(path) =
            run_wallpaper_engine_get_wallpaper_attempt(executable_path, label, &args, &mut attempts)
        {
            return Ok(LiveDesktopWallpaperEngineWallpaperPath {
                path,
                detail: "getWallpaper".to_string(),
            });
        }
    }

    for index in wallpaper_engine_get_wallpaper_monitor_indexes(monitor_index) {
        let args = vec![
            "-control".to_string(),
            "getWallpaper".to_string(),
            "-monitor".to_string(),
            index.to_string(),
        ];
        if let Some(path) = run_wallpaper_engine_get_wallpaper_attempt(
            executable_path,
            format!("monitor:{index}"),
            &args,
            &mut attempts,
        ) {
            return Ok(LiveDesktopWallpaperEngineWallpaperPath {
                path,
                detail: "getWallpaper".to_string(),
            });
        }
    }

    let default_args = vec!["-control".to_string(), "getWallpaper".to_string()];
    if let Some(path) = run_wallpaper_engine_get_wallpaper_attempt(
        executable_path,
        "default".to_string(),
        &default_args,
        &mut attempts,
    ) {
        return Ok(LiveDesktopWallpaperEngineWallpaperPath {
            path,
            detail: "getWallpaper".to_string(),
        });
    }

    let attempts_detail = attempts
        .iter()
        .map(format_wallpaper_engine_get_wallpaper_attempt)
        .collect::<Vec<_>>()
        .join(" | ");
    if let Some(value) = config.value.as_ref() {
        if let Some(config_wallpaper) =
            read_wallpaper_engine_current_wallpaper_path_from_config(value, monitor_index)
        {
            return Ok(LiveDesktopWallpaperEngineWallpaperPath {
                path: config_wallpaper.path,
                detail: format!(
                    "{} getWallpaperStdout=empty attempts={}",
                    config_wallpaper.detail, attempts_detail
                ),
            });
        }
    }

    Err(format!(
        "getWallpaperReturnedEmptyPath {location_detail} attempts={attempts_detail}"
    ))
}

#[cfg(target_os = "windows")]
fn read_wallpaper_engine_config(executable_path: &Path) -> LiveDesktopWallpaperEngineConfigRead {
    let Some(config_path) = executable_path
        .parent()
        .map(|directory| directory.join("config.json"))
    else {
        return LiveDesktopWallpaperEngineConfigRead {
            value: None,
            detail: "config=missingExecutableParent".to_string(),
        };
    };
    if !config_path.exists() {
        return LiveDesktopWallpaperEngineConfigRead {
            value: None,
            detail: format!("configNotFound={}", config_path.display()),
        };
    }
    let content = match fs::read_to_string(&config_path) {
        Ok(content) => content,
        Err(error) => {
            return LiveDesktopWallpaperEngineConfigRead {
                value: None,
                detail: format!("configReadFailed={} error={error}", config_path.display()),
            };
        }
    };
    let value = match serde_json::from_str::<serde_json::Value>(&content) {
        Ok(value) => value,
        Err(error) => {
            return LiveDesktopWallpaperEngineConfigRead {
                value: None,
                detail: format!("configParseFailed={} error={error}", config_path.display()),
            };
        }
    };
    LiveDesktopWallpaperEngineConfigRead {
        value: Some(value),
        detail: format!("config={}", config_path.display()),
    }
}

#[cfg(target_os = "windows")]
fn read_wallpaper_engine_location_candidates(
    config: Option<&serde_json::Value>,
    config_detail: &str,
) -> (Vec<String>, String) {
    let mut candidates = Vec::new();
    if let Some(config) = config {
        collect_wallpaper_engine_location_candidates_from_json(config, "", &mut candidates);
    }
    let mut seen = HashSet::new();
    candidates.retain(|candidate| seen.insert(candidate.to_ascii_lowercase()));
    let total_candidates = candidates.len();
    candidates.truncate(16);
    (
        candidates,
        format!("{config_detail} locationCandidates={total_candidates}"),
    )
}

#[cfg(target_os = "windows")]
fn read_wallpaper_engine_current_wallpaper_path_from_config(
    config: &serde_json::Value,
    monitor_index: u32,
) -> Option<LiveDesktopWallpaperEngineWallpaperPath> {
    if let Some(location) = find_wallpaper_engine_config_string(config, "lastselectedmonitor") {
        if let Some(path) = find_wallpaper_engine_selected_wallpaper_file(config, &location) {
            return Some(LiveDesktopWallpaperEngineWallpaperPath {
                path,
                detail: format!(
                    "configFallback=lastselectedmonitor location={}",
                    truncate_wallpaper_engine_cli_text(&location, 64)
                ),
            });
        }
    }

    let display_location = format!("//./DISPLAY{}", monitor_index + 1);
    if let Some(path) = find_wallpaper_engine_selected_wallpaper_file(config, &display_location) {
        return Some(LiveDesktopWallpaperEngineWallpaperPath {
            path,
            detail: format!("configFallback=displayAlias location={display_location}"),
        });
    }

    find_first_wallpaper_engine_selected_wallpaper_file(config).map(|path| {
        LiveDesktopWallpaperEngineWallpaperPath {
            path,
            detail: "configFallback=firstSelectedWallpaper".to_string(),
        }
    })
}

#[cfg(target_os = "windows")]
fn json_find<'a, T, F>(value: &'a serde_json::Value, predicate: &mut F) -> Option<T>
where
    F: FnMut(Option<&'a str>, &'a serde_json::Value) -> Option<T>,
{
    fn visit<'a, T, F>(
        key: Option<&'a str>,
        value: &'a serde_json::Value,
        predicate: &mut F,
    ) -> Option<T>
    where
        F: FnMut(Option<&'a str>, &'a serde_json::Value) -> Option<T>,
    {
        if let Some(found) = predicate(key, value) {
            return Some(found);
        }

        match value {
            serde_json::Value::Object(object) => object
                .iter()
                .find_map(|(key, child)| visit(Some(key.as_str()), child, predicate)),
            serde_json::Value::Array(items) => {
                items.iter().find_map(|item| visit(None, item, predicate))
            }
            _ => None,
        }
    }

    visit(None, value, predicate)
}

#[cfg(target_os = "windows")]
fn find_wallpaper_engine_config_string(
    value: &serde_json::Value,
    leaf_key: &str,
) -> Option<String> {
    json_find(value, &mut |key, candidate| {
        let key = key?;
        if !key.eq_ignore_ascii_case(leaf_key) {
            return None;
        }
        candidate.as_str().map(|text| text.trim().to_string())
    })
}

#[cfg(target_os = "windows")]
fn find_wallpaper_engine_selected_wallpaper_file(
    value: &serde_json::Value,
    location: &str,
) -> Option<String> {
    json_find(value, &mut |_, candidate| {
        candidate
            .as_object()
            .and_then(|object| object.get("selectedwallpapers"))
            .and_then(|value| value.as_object())
            .and_then(|selected| selected.get(location))
            .and_then(|entry| entry.get("file"))
            .and_then(|file| file.as_str())
            .map(|file| file.trim().to_string())
            .filter(|file| !file.is_empty())
    })
}

#[cfg(target_os = "windows")]
fn find_first_wallpaper_engine_selected_wallpaper_file(
    value: &serde_json::Value,
) -> Option<String> {
    json_find(value, &mut |_, candidate| {
        candidate
            .as_object()
            .and_then(|object| object.get("selectedwallpapers"))
            .and_then(|value| value.as_object())
            .and_then(|selected| selected.values().find_map(|entry| entry.get("file")))
            .and_then(|file| file.as_str())
            .map(|file| file.trim().to_string())
            .filter(|file| !file.is_empty())
    })
}

#[cfg(target_os = "windows")]
fn collect_wallpaper_engine_location_candidates_from_json(
    value: &serde_json::Value,
    key_hint: &str,
    candidates: &mut Vec<String>,
) {
    match value {
        serde_json::Value::Object(object) => {
            for (key, child) in object {
                let next_key_hint = if key_hint.is_empty() {
                    key.to_string()
                } else {
                    format!("{key_hint}.{key}")
                };
                collect_wallpaper_engine_location_candidates_from_json(
                    child,
                    &next_key_hint,
                    candidates,
                );
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_wallpaper_engine_location_candidates_from_json(item, key_hint, candidates);
            }
        }
        serde_json::Value::String(text)
            if is_wallpaper_engine_location_candidate(key_hint, text) =>
        {
            candidates.push(text.trim().to_string());
        }
        _ => {}
    }
}

#[cfg(target_os = "windows")]
fn is_wallpaper_engine_location_candidate(key_hint: &str, value: &str) -> bool {
    let value = value.trim();
    if value.is_empty() || value.len() > 512 {
        return false;
    }

    let key_hint = key_hint.to_ascii_lowercase();
    let leaf_key = key_hint.rsplit('.').next().unwrap_or(&key_hint);
    let value_lower = value.to_ascii_lowercase();
    let value_looks_relevant = value_lower.contains("display") || value_lower.contains("monitor");
    let leaf_can_hold_location = matches!(
        leaf_key,
        "location" | "deviceid" | "displayid" | "monitorid" | "lastselectedmonitor"
    );
    if !value_looks_relevant && !leaf_can_hold_location {
        return false;
    }
    if matches!(
        value_lower.as_str(),
        "default" | "devicepath" | "pause" | "run" | "stop"
    ) {
        return false;
    }

    let looks_like_wallpaper_path = value_lower.contains(":\\")
        || value_lower.contains('/')
        || [
            ".json", ".pkg", ".mp4", ".webm", ".html", ".jpg", ".jpeg", ".png", ".exe",
        ]
        .iter()
        .any(|extension| value_lower.ends_with(extension));
    if looks_like_wallpaper_path && !value_looks_relevant {
        return false;
    }

    true
}

#[cfg(target_os = "windows")]
fn wallpaper_engine_get_wallpaper_monitor_indexes(preferred_index: u32) -> Vec<u32> {
    let mut indexes = vec![preferred_index];
    for index in 0..4 {
        if !indexes.contains(&index) {
            indexes.push(index);
        }
    }
    indexes
}

#[cfg(target_os = "windows")]
fn run_wallpaper_engine_get_wallpaper_attempt(
    executable_path: &PathBuf,
    label: String,
    args: &[String],
    attempts: &mut Vec<LiveDesktopWallpaperEngineGetWallpaperAttempt>,
) -> Option<String> {
    let output = wallpaper_engine_command(executable_path)
        .args(args)
        .output();
    let attempt = match output {
        Ok(output) => LiveDesktopWallpaperEngineGetWallpaperAttempt {
            label,
            success: output.status.success(),
            status_code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
            error: None,
        },
        Err(error) => LiveDesktopWallpaperEngineGetWallpaperAttempt {
            label,
            success: false,
            status_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error: Some(error.to_string()),
        },
    };
    let path = attempt
        .success
        .then_some(())
        .and_then(|_| (!attempt.stdout.is_empty()).then(|| attempt.stdout.clone()));
    attempts.push(attempt);
    path
}

#[cfg(target_os = "windows")]
fn format_wallpaper_engine_get_wallpaper_attempt(
    attempt: &LiveDesktopWallpaperEngineGetWallpaperAttempt,
) -> String {
    let stdout = if attempt.stdout.is_empty() {
        "empty".to_string()
    } else {
        truncate_wallpaper_engine_cli_text(&attempt.stdout, 96)
    };
    let stderr = if attempt.stderr.is_empty() {
        "empty".to_string()
    } else {
        truncate_wallpaper_engine_cli_text(&attempt.stderr, 96)
    };
    let error = attempt
        .error
        .as_ref()
        .map(|error| truncate_wallpaper_engine_cli_text(error, 96))
        .unwrap_or_else(|| "none".to_string());
    format!(
        "{}:success={},status={:?},stdout={},stderr={},error={}",
        attempt.label, attempt.success, attempt.status_code, stdout, stderr, error
    )
}

#[cfg(target_os = "windows")]
fn truncate_wallpaper_engine_cli_text(value: &str, max_chars: usize) -> String {
    let value = value.trim();
    let mut output = value.chars().take(max_chars).collect::<String>();
    if value.chars().count() > max_chars {
        output.push_str("...");
    }
    output
}

#[cfg(target_os = "windows")]
fn wallpaper_engine_command(executable_path: &PathBuf) -> Command {
    let mut command = Command::new(executable_path);
    if let Some(directory) = executable_path.parent() {
        command.current_dir(directory);
    }
    command
}

#[cfg(target_os = "windows")]
fn open_wallpaper_engine_named_popup(
    executable_path: &PathBuf,
    wallpaper_path: &str,
    plan: &LiveDesktopWallpaperEnginePopupPlan,
) -> Result<(), String> {
    let width = plan.width.to_string();
    let height = plan.height.to_string();
    let x = plan.x.to_string();
    let y = plan.y.to_string();
    let output = Command::new(executable_path)
        .args([
            "-control",
            "openWallpaper",
            "-file",
            wallpaper_path,
            "-playInWindow",
            &plan.window_name,
            "-width",
            &width,
            "-height",
            &height,
            "-x",
            &x,
            "-y",
            &y,
            "-borderless",
        ])
        .output()
        .map_err(|error| format!("openWallpaperLaunchFailed={error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "openWallpaperFailed=status {:?} stderr={}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(target_os = "windows")]
pub(super) fn close_wallpaper_engine_named_popup(
    command: &LiveDesktopWallpaperEnginePopupCloseCommand,
) -> Result<(), String> {
    let output = Command::new(&command.executable_path)
        .args([
            "-control",
            "closeWallpaper",
            "-location",
            &command.window_name,
        ])
        .output()
        .map_err(|error| format!("closeWallpaperLaunchFailed={error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "closeWallpaperFailed=status {:?} stderr={}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(target_os = "windows")]
pub(super) fn cleanup_wallpaper_engine_popup_after_failed_capture(
    ensure: &mut LiveDesktopWallpaperEnginePopupEnsureResult,
) -> String {
    let Some(command) = ensure.close_command.take() else {
        return String::new();
    };
    match close_wallpaper_engine_named_popup(&command) {
        Ok(()) => "; Lumeria popup closed after failed WGC attempts".to_string(),
        Err(error) => format!("; {error}"),
    }
}

pub(super) fn format_wallpaper_engine_popup_runtime_detail(
    ensure_detail: &str,
    prepare_detail: &str,
) -> String {
    [ensure_detail, prepare_detail]
        .into_iter()
        .filter(|detail| !detail.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn push_live_desktop_wgc_target(
    targets: &mut Vec<LiveDesktopWindowInfo>,
    seen: &mut HashSet<String>,
    info: &LiveDesktopWindowInfo,
) {
    if info.hwnd.is_empty() || !seen.insert(info.hwnd.clone()) {
        return;
    }
    targets.push(info.clone());
}

pub(super) fn wallpaper_engine_popup_root_for_target<'a>(
    target: &'a LiveDesktopWindowInfo,
    diagnostics: &'a LiveDesktopWindowDiagnostics,
) -> Option<&'a LiveDesktopWindowInfo> {
    if target.role == "wallpaperPopup" {
        return Some(target);
    }
    diagnostics
        .windows
        .iter()
        .find(|info| info.hwnd == target.parent_hwnd && info.role == "wallpaperPopup")
        .or_else(|| {
            diagnostics
                .windows
                .iter()
                .find(|info| info.hwnd == target.root_hwnd && info.role == "wallpaperPopup")
        })
}

pub(super) fn collect_wallpaper_engine_mouse_relay_targets(
    target: &LiveDesktopWindowInfo,
    diagnostics: &LiveDesktopWindowDiagnostics,
) -> Vec<LiveDesktopWindowInfo> {
    let mut targets = Vec::new();
    let mut seen = HashSet::<String>::new();
    let Some(popup) = wallpaper_engine_popup_root_for_target(target, diagnostics) else {
        push_live_desktop_wgc_target(&mut targets, &mut seen, target);
        return targets;
    };

    for info in diagnostics.windows.iter().filter(|info| {
        info.parent_hwnd == popup.hwnd && is_wallpaper_engine_popup_content_window(info)
    }) {
        push_live_desktop_wgc_target(&mut targets, &mut seen, info);
    }
    push_live_desktop_wgc_target(&mut targets, &mut seen, popup);
    push_live_desktop_wgc_target(&mut targets, &mut seen, target);
    targets
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live_desktop::{LiveDesktopWindowInfo, LiveDesktopWindowRect};

    fn info(
        hwnd: &str,
        parent_hwnd: &str,
        role: &str,
        reason: &str,
        class_name: &str,
    ) -> LiveDesktopWindowInfo {
        LiveDesktopWindowInfo {
            hwnd: hwnd.to_string(),
            parent_hwnd: parent_hwnd.to_string(),
            root_hwnd: if parent_hwnd.is_empty() {
                hwnd.to_string()
            } else {
                parent_hwnd.to_string()
            },
            role: role.to_string(),
            candidate_reason: reason.to_string(),
            class_name: class_name.to_string(),
            visible: true,
            rect: LiveDesktopWindowRect {
                width: 1920,
                height: 1080,
                ..LiveDesktopWindowRect::default()
            },
            ..LiveDesktopWindowInfo::default()
        }
    }

    #[test]
    fn wallpaper_engine_popup_wgc_targets_prefer_popup_content_window() {
        let popup = info(
            "0x400",
            "",
            "wallpaperPopup",
            "wallpaperPopup",
            "WPEOverlappedWallpaper",
        );
        let mut launchpad_popup = info(
            "0x500",
            "",
            "wallpaperPopup",
            "wallpaperPopup",
            "WPEOverlappedWallpaper",
        );
        launchpad_popup.title = "Lumeria::LiveDesktop::display0::1920x1080".to_string();
        let popup_child = info(
            "0x401",
            "0x400",
            "window",
            "wallpaperProcessOrTitle",
            "WPEDesktopDX11Window",
        );
        let launchpad_popup_child = info(
            "0x501",
            "0x500",
            "window",
            "wallpaperProcessOrTitle",
            "WPEDesktopDX11Window",
        );
        let wallpaper_child = info(
            "0x300",
            "0x200",
            "desktopChild",
            "wallpaperProcessOrTitle",
            "WPEDesktopDX11Window",
        );
        let workerw = info("0x200", "", "workerw", "workerwLayer", "WorkerW");
        let diagnostics = LiveDesktopWindowDiagnostics {
            platform: "windows",
            available: true,
            reason: "available",
            detail: String::new(),
            window_count: 6,
            candidate_count: 6,
            windows: vec![
                workerw.clone(),
                wallpaper_child.clone(),
                popup.clone(),
                popup_child.clone(),
                launchpad_popup.clone(),
                launchpad_popup_child.clone(),
            ],
            candidates: vec![
                wallpaper_child,
                workerw,
                popup,
                popup_child,
                launchpad_popup,
                launchpad_popup_child,
            ],
        };

        let targets = collect_wallpaper_engine_popup_wgc_targets(&diagnostics, None);
        let hwnds: Vec<&str> = targets.iter().map(|info| info.hwnd.as_str()).collect();
        assert_eq!(hwnds, vec!["0x401", "0x501", "0x400", "0x500"]);

        let preferred_targets = collect_wallpaper_engine_popup_wgc_targets(
            &diagnostics,
            Some("Lumeria::LiveDesktop::display0::1920x1080"),
        );
        let preferred_hwnds: Vec<&str> = preferred_targets
            .iter()
            .map(|info| info.hwnd.as_str())
            .collect();
        assert_eq!(preferred_hwnds, vec!["0x501", "0x500", "0x401", "0x400"]);

        let relay_root = diagnostics
            .windows
            .iter()
            .find(|info| info.hwnd == "0x500")
            .unwrap();
        let relay_targets = collect_wallpaper_engine_mouse_relay_targets(relay_root, &diagnostics);
        let relay_hwnds: Vec<&str> = relay_targets
            .iter()
            .map(|info| info.hwnd.as_str())
            .collect();
        assert_eq!(relay_hwnds, vec!["0x501", "0x500"]);
    }

    #[test]
    fn wallpaper_engine_config_location_candidates_are_extracted_recursively() {
        let config = serde_json::json!({
            "monitors": [
                {
                    "deviceId": "\\\\?\\DISPLAY#AAA",
                    "wallpaper": "C:\\Steam\\wallpapers\\scene.json"
                },
                {
                    "location": "DISPLAY2",
                    "name": "secondary"
                }
            ],
            "selectedDisplay": "MONITOR-PRIMARY"
        });
        let mut candidates = Vec::new();
        collect_wallpaper_engine_location_candidates_from_json(&config, "", &mut candidates);

        assert_eq!(
            candidates,
            vec!["\\\\?\\DISPLAY#AAA", "DISPLAY2", "MONITOR-PRIMARY"]
        );
    }

    #[test]
    fn wallpaper_engine_location_candidate_filter_rejects_wallpaper_paths() {
        assert!(is_wallpaper_engine_location_candidate(
            "monitors.0.deviceId",
            "\\\\?\\DISPLAY#AAA"
        ));
        assert!(is_wallpaper_engine_location_candidate(
            "monitors.0.location",
            "DISPLAY1"
        ));
        assert!(!is_wallpaper_engine_location_candidate(
            "monitors.0.wallpaper",
            "C:\\Steam\\wallpapers\\scene.json"
        ));
        assert!(!is_wallpaper_engine_location_candidate(
            "general.theme",
            "dark"
        ));
    }

    #[test]
    fn wallpaper_engine_config_wallpaper_path_prefers_last_selected_monitor() {
        let config = serde_json::json!({
            "user": {
                "lastselectedmonitor": "//?/DISPLAY#CURRENT"
            },
            "wallpaperconfig": {
                "selectedwallpapers": {
                    "//./DISPLAY1": {
                        "file": "D:/Steam/old/scene.pkg"
                    },
                    "//?/DISPLAY#CURRENT": {
                        "file": "D:/Steam/current/scene.pkg"
                    }
                }
            }
        });

        let wallpaper =
            read_wallpaper_engine_current_wallpaper_path_from_config(&config, 0).unwrap();

        assert_eq!(wallpaper.path, "D:/Steam/current/scene.pkg");
        assert!(wallpaper.detail.contains("lastselectedmonitor"));
    }

    #[test]
    fn wallpaper_engine_config_wallpaper_path_falls_back_to_display_alias() {
        let config = serde_json::json!({
            "wallpaperconfig": {
                "selectedwallpapers": {
                    "//./DISPLAY2": {
                        "file": "D:/Steam/display2/scene.pkg"
                    }
                }
            }
        });

        let wallpaper =
            read_wallpaper_engine_current_wallpaper_path_from_config(&config, 1).unwrap();

        assert_eq!(wallpaper.path, "D:/Steam/display2/scene.pkg");
        assert!(wallpaper.detail.contains("displayAlias"));
    }
}
