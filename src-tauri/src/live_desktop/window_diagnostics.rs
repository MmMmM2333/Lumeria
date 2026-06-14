use super::{
    current_platform, LiveDesktopWindowDiagnostics, LiveDesktopWindowInfo, LiveDesktopWindowRect,
};

#[cfg(target_os = "windows")]
use super::live_desktop_wide_string;

#[cfg(target_os = "windows")]
use std::collections::HashSet;

#[cfg(target_os = "windows")]
use windows::{
    core::{BOOL, PWSTR},
    Win32::{
        Foundation::{CloseHandle, HWND, LPARAM, RECT},
        Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::{
            EnumChildWindows, EnumWindows, GetAncestor, GetClassNameW, GetClientRect, GetParent,
            GetWindowLongPtrW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
            IsWindowVisible, GA_ROOT, GWL_EXSTYLE, GWL_STYLE, WINDOW_LONG_PTR_INDEX,
        },
    },
};

#[cfg(target_os = "windows")]
struct LiveDesktopWindowHandleCollector {
    handles: Vec<isize>,
    seen: HashSet<isize>,
}

impl LiveDesktopWindowDiagnostics {
    pub(super) fn unavailable(
        platform: &'static str,
        reason: &'static str,
        detail: String,
    ) -> Self {
        Self {
            platform,
            available: false,
            reason,
            detail,
            window_count: 0,
            candidate_count: 0,
            windows: Vec::new(),
            candidates: Vec::new(),
        }
    }
}

pub(super) fn live_desktop_window_diagnostics() -> LiveDesktopWindowDiagnostics {
    #[cfg(target_os = "windows")]
    {
        unsafe { probe_windows_live_desktop_windows() }
    }

    #[cfg(not(target_os = "windows"))]
    {
        LiveDesktopWindowDiagnostics::unavailable(
            current_platform(),
            "unsupportedPlatform",
            "Live desktop window diagnostics are only available on Windows".to_string(),
        )
    }
}

pub(super) fn classify_live_desktop_window(
    class_name: &str,
    title: &str,
    process_name: &str,
    visible: bool,
    rect: &LiveDesktopWindowRect,
    parent_class_name: &str,
) -> (String, String) {
    let class_lower = class_name.to_ascii_lowercase();
    let title_lower = title.to_ascii_lowercase();
    let process_lower = process_name.to_ascii_lowercase();
    let parent_class_lower = parent_class_name.to_ascii_lowercase();
    let area = i64::from(rect.width.max(0)) * i64::from(rect.height.max(0));
    let is_wallpaper_process_or_title =
        process_lower.contains("wallpaper") || title_lower.contains("wallpaper");

    let role = if class_lower == "progman" {
        "progman"
    } else if class_lower == "workerw" {
        "workerw"
    } else if class_lower == "shelldll_defview" {
        "shellDefView"
    } else if class_lower == "syslistview32" {
        "desktopListView"
    } else if parent_class_lower.is_empty() && is_wallpaper_process_or_title {
        "wallpaperPopup"
    } else if parent_class_lower == "workerw" || parent_class_lower == "progman" {
        "desktopChild"
    } else {
        "window"
    };

    let candidate_reason = if !visible {
        ""
    } else if role == "wallpaperPopup" && area >= 320 * 180 {
        "wallpaperPopup"
    } else if is_wallpaper_process_or_title {
        "wallpaperProcessOrTitle"
    } else if class_lower == "workerw" {
        "workerwLayer"
    } else if parent_class_lower == "workerw"
        && class_lower != "shelldll_defview"
        && class_lower != "syslistview32"
        && area >= 640 * 360
    {
        "largeWorkerWChild"
    } else {
        ""
    };

    (role.to_string(), candidate_reason.to_string())
}

#[cfg(target_os = "windows")]
pub(super) unsafe fn probe_windows_live_desktop_windows() -> LiveDesktopWindowDiagnostics {
    let mut hwnds = unsafe { enumerate_live_desktop_window_handles() };
    hwnds.sort_unstable();
    hwnds.dedup();

    let all_infos: Vec<LiveDesktopWindowInfo> = hwnds
        .into_iter()
        .map(|hwnd| unsafe { inspect_live_desktop_window(HWND(hwnd as _)) })
        .collect();

    let mut interesting_windows = Vec::new();
    let mut candidates = Vec::new();
    for info in all_infos {
        let is_desktop_window = info.role != "window";
        let is_candidate = !info.candidate_reason.is_empty();
        if is_candidate {
            candidates.push(info.clone());
        }
        if is_desktop_window || is_candidate {
            interesting_windows.push(info);
        }
    }

    interesting_windows.sort_by_key(|info| {
        (
            live_desktop_window_role_order(&info.role),
            live_desktop_window_handle_sort_key(&info.hwnd),
        )
    });
    candidates.sort_by_key(|info| {
        (
            live_desktop_candidate_reason_order(&info.candidate_reason),
            live_desktop_window_role_order(&info.role),
            live_desktop_window_handle_sort_key(&info.hwnd),
        )
    });

    let window_count = interesting_windows.len();
    let candidate_count = candidates.len();
    let detail = format!(
        "Live desktop diagnostics enumerated {window_count} desktop/popup-related windows and {candidate_count} capture candidates"
    );
    LiveDesktopWindowDiagnostics {
        platform: current_platform(),
        available: true,
        reason: "available",
        detail,
        window_count,
        candidate_count,
        windows: interesting_windows,
        candidates,
    }
}

#[cfg(target_os = "windows")]
unsafe fn enumerate_live_desktop_window_handles() -> Vec<isize> {
    let mut desktop_root_handles = Vec::<isize>::new();
    unsafe {
        let _ = EnumWindows(
            Some(enum_live_desktop_root_window),
            LPARAM((&mut desktop_root_handles as *mut Vec<isize>) as isize),
        );
    }

    let mut collector = LiveDesktopWindowHandleCollector {
        handles: Vec::new(),
        seen: HashSet::new(),
    };
    for handle in desktop_root_handles {
        if collector.seen.insert(handle) {
            collector.handles.push(handle);
        }
        unsafe {
            let _ = EnumChildWindows(
                Some(HWND(handle as _)),
                Some(enum_live_desktop_child_window),
                LPARAM((&mut collector as *mut LiveDesktopWindowHandleCollector) as isize),
            );
        }
    }
    collector.handles
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_live_desktop_root_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let handles = unsafe { &mut *(lparam.0 as *mut Vec<isize>) };
    let class_name = unsafe { read_live_desktop_window_class_name(hwnd) };
    if is_live_desktop_root_class(&class_name)
        || unsafe { is_live_desktop_wallpaper_engine_popup_root(hwnd, &class_name) }
    {
        handles.push(hwnd.0 as isize);
    }
    BOOL(1)
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_live_desktop_child_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let collector = unsafe { &mut *(lparam.0 as *mut LiveDesktopWindowHandleCollector) };
    let handle = hwnd.0 as isize;
    if collector.seen.insert(handle) {
        collector.handles.push(handle);
    }
    BOOL(1)
}

pub(super) fn is_live_desktop_root_class(class_name: &str) -> bool {
    class_name.eq_ignore_ascii_case("Progman") || class_name.eq_ignore_ascii_case("WorkerW")
}

#[cfg(target_os = "windows")]
unsafe fn is_live_desktop_wallpaper_engine_popup_root(hwnd: HWND, class_name: &str) -> bool {
    if is_live_desktop_root_class(class_name) {
        return false;
    }
    let parent = unsafe { GetParent(hwnd).unwrap_or_default() };
    if !parent.0.is_null() || !unsafe { IsWindowVisible(hwnd).as_bool() } {
        return false;
    }
    if unsafe { read_live_desktop_window_cloaked(hwnd) } != 0 {
        return false;
    }
    let rect = unsafe { read_live_desktop_window_rect(hwnd) };
    if rect.width < 320 || rect.height < 180 {
        return false;
    }
    let pid = unsafe { read_live_desktop_window_process_id(hwnd) };
    let process_name = read_live_desktop_process_name(pid).unwrap_or_default();
    let process_lower = process_name.to_ascii_lowercase();
    process_lower == "wallpaper64.exe" || process_lower == "wallpaper32.exe"
}

#[cfg(target_os = "windows")]
unsafe fn inspect_live_desktop_window(hwnd: HWND) -> LiveDesktopWindowInfo {
    let parent = unsafe { GetParent(hwnd).unwrap_or_default() };
    let root = unsafe { GetAncestor(hwnd, GA_ROOT) };
    let class_name = unsafe { read_live_desktop_window_class_name(hwnd) };
    let parent_class_name = if parent.0.is_null() {
        String::new()
    } else {
        unsafe { read_live_desktop_window_class_name(parent) }
    };
    let title = unsafe { read_live_desktop_window_text(hwnd) };
    let pid = unsafe { read_live_desktop_window_process_id(hwnd) };
    let process_name = read_live_desktop_process_name(pid).unwrap_or_default();
    let visible = unsafe { IsWindowVisible(hwnd).as_bool() };
    let style = unsafe { read_live_desktop_window_long(hwnd, GWL_STYLE) };
    let ex_style = unsafe { read_live_desktop_window_long(hwnd, GWL_EXSTYLE) };
    let cloaked = unsafe { read_live_desktop_window_cloaked(hwnd) };
    let rect = unsafe { read_live_desktop_window_rect(hwnd) };
    let (role, candidate_reason) = classify_live_desktop_window(
        &class_name,
        &title,
        &process_name,
        visible,
        &rect,
        &parent_class_name,
    );

    LiveDesktopWindowInfo {
        hwnd: format_live_desktop_window_handle(hwnd),
        parent_hwnd: format_live_desktop_window_handle(parent),
        root_hwnd: format_live_desktop_window_handle(root),
        pid,
        class_name,
        title,
        process_name,
        role,
        candidate_reason,
        visible,
        style: format_live_desktop_window_long(style),
        ex_style: format_live_desktop_window_long(ex_style),
        cloaked,
        rect,
    }
}

#[cfg(target_os = "windows")]
unsafe fn read_live_desktop_window_class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) } as usize;
    live_desktop_wide_string(&buffer[..length.min(buffer.len())])
}

#[cfg(target_os = "windows")]
unsafe fn read_live_desktop_window_text(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let length = unsafe { GetWindowTextW(hwnd, &mut buffer) } as usize;
    live_desktop_wide_string(&buffer[..length.min(buffer.len())])
}

#[cfg(target_os = "windows")]
unsafe fn read_live_desktop_window_process_id(hwnd: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    pid
}

#[cfg(target_os = "windows")]
pub(super) unsafe fn read_live_desktop_window_long(
    hwnd: HWND,
    index: WINDOW_LONG_PTR_INDEX,
) -> isize {
    unsafe { GetWindowLongPtrW(hwnd, index) }
}

#[cfg(target_os = "windows")]
unsafe fn read_live_desktop_window_cloaked(hwnd: HWND) -> u32 {
    let mut cloaked = 0u32;
    if unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            (&mut cloaked as *mut u32).cast(),
            std::mem::size_of::<u32>() as u32,
        )
    }
    .is_err()
    {
        return 0;
    }
    cloaked
}

pub(super) fn format_live_desktop_window_long(value: isize) -> String {
    format!("0x{:X}", value as usize)
}

#[cfg(target_os = "windows")]
fn read_live_desktop_process_name(pid: u32) -> Option<String> {
    let path = read_live_desktop_process_image_path(pid)?;
    path.rsplit(|character| character == '\\' || character == '/')
        .next()
        .filter(|name| !name.is_empty())
        .map(str::to_string)
}

#[cfg(target_os = "windows")]
pub(super) fn read_live_desktop_process_image_path(pid: u32) -> Option<String> {
    if pid == 0 {
        return None;
    }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()? };
    let mut buffer = [0u16; 260];
    let mut size = buffer.len() as u32;
    let result = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut size,
        )
    };
    unsafe {
        let _ = CloseHandle(process);
    }
    if result.is_err() || size == 0 {
        return None;
    }
    Some(live_desktop_wide_string(&buffer[..size as usize]))
}

#[cfg(target_os = "windows")]
unsafe fn read_live_desktop_window_rect(hwnd: HWND) -> LiveDesktopWindowRect {
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
        return LiveDesktopWindowRect::default();
    }
    LiveDesktopWindowRect {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: (rect.right - rect.left).max(0),
        height: (rect.bottom - rect.top).max(0),
    }
}

#[cfg(target_os = "windows")]
pub(super) unsafe fn read_live_desktop_window_client_size(hwnd: HWND) -> Option<(u32, u32)> {
    let mut rect = RECT::default();
    if unsafe { GetClientRect(hwnd, &mut rect) }.is_err() {
        return None;
    }
    let width = (rect.right - rect.left).max(0) as u32;
    let height = (rect.bottom - rect.top).max(0) as u32;
    if width == 0 || height == 0 {
        return None;
    }
    Some((width, height))
}

#[cfg(target_os = "windows")]
pub(super) fn format_live_desktop_window_handle(hwnd: HWND) -> String {
    if hwnd.0.is_null() {
        return String::new();
    }
    format!("0x{:X}", hwnd.0 as usize)
}

fn live_desktop_window_handle_sort_key(hwnd: &str) -> u64 {
    hwnd.strip_prefix("0x")
        .and_then(|value| u64::from_str_radix(value, 16).ok())
        .unwrap_or_default()
}

fn live_desktop_window_role_order(role: &str) -> u8 {
    match role {
        "progman" => 0,
        "workerw" => 1,
        "desktopChild" => 2,
        "wallpaperPopup" => 3,
        "shellDefView" => 4,
        "desktopListView" => 5,
        _ => 6,
    }
}

fn live_desktop_candidate_reason_order(reason: &str) -> u8 {
    match reason {
        "wallpaperPopup" => 0,
        "wallpaperProcessOrTitle" => 0,
        "largeWorkerWChild" => 1,
        "workerwLayer" => 2,
        _ => 3,
    }
}
