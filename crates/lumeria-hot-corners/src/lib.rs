//! Passive hot-corner sampling. No input hooks, synthetic input or renderer ticks.
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
type Handle = *mut c_void;
#[repr(C)]
#[derive(Clone, Copy, Default, Debug, PartialEq)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}
#[repr(C)]
#[derive(Default, Clone, Copy)]
struct Point {
    x: i32,
    y: i32,
}
#[repr(C)]
struct MonitorInfo {
    size: u32,
    bounds: Rect,
    work: Rect,
    flags: u32,
}
#[link(name = "user32")]
unsafe extern "system" {
    fn MonitorFromPoint(point: Point, flags: u32) -> Handle;
    fn GetCursorPos(point: *mut Point) -> i32;
    fn GetAsyncKeyState(key: i32) -> i16;
    fn EnumDisplayMonitors(
        dc: Handle,
        clip: *const Rect,
        callback: unsafe extern "system" fn(Handle, Handle, *mut Rect, isize) -> i32,
        data: isize,
    ) -> i32;
    fn GetMonitorInfoW(monitor: Handle, info: *mut MonitorInfo) -> i32;
    fn GetForegroundWindow() -> Handle;
    fn IsZoomed(window: Handle) -> i32;
    fn GetWindowRect(window: Handle, rect: *mut Rect) -> i32;
    fn GetWindowThreadProcessId(window: Handle, pid: *mut u32) -> u32;
    fn GetClassNameW(window: Handle, name: *mut u16, max: i32) -> i32;
    fn OpenInputDesktop(flags: u32, inherit: i32, access: u32) -> Handle;
    fn CloseDesktop(desktop: Handle) -> i32;
    fn GetUserObjectInformationW(
        object: Handle,
        index: i32,
        info: *mut c_void,
        len: u32,
        needed: *mut u32,
    ) -> i32;
    fn SetThreadDpiAwarenessContext(context: Handle) -> Handle;
}
#[link(name = "shcore")]
unsafe extern "system" {
    fn GetDpiForMonitor(monitor: Handle, kind: i32, x: *mut u32, y: *mut u32) -> i32;
}
mod geometry;
use self::geometry::{zones, Detector, Monitor};
unsafe extern "system" fn enumerate(monitor: Handle, _: Handle, _: *mut Rect, data: isize) -> i32 {
    let mut info = MonitorInfo {
        size: std::mem::size_of::<MonitorInfo>() as u32,
        bounds: Rect::default(),
        work: Rect::default(),
        flags: 0,
    };
    if unsafe { GetMonitorInfoW(monitor, &mut info) } != 0 {
        let (mut x, mut y) = (96, 96);
        if unsafe { GetDpiForMonitor(monitor, 0, &mut x, &mut y) } < 0 {
            x = 96;
        }
        unsafe { &mut *(data as *mut Vec<Monitor>) }.push(Monitor {
            id: monitor as usize,
            rect: info.bounds,
            dpi: x,
        });
    }
    1
}
fn monitors() -> Vec<Monitor> {
    let mut result = Vec::new();
    unsafe {
        EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            enumerate,
            &mut result as *mut _ as isize,
        );
    };
    geometry::normalize(result)
}
fn input_desktop_available() -> bool {
    unsafe {
        let desktop = OpenInputDesktop(0, 0, 1);
        if desktop.is_null() {
            return false;
        }
        let mut name = [0u16; 64];
        let mut needed = 0;
        let ok =
            GetUserObjectInformationW(desktop, 2, name.as_mut_ptr().cast(), 128, &mut needed) != 0;
        CloseDesktop(desktop);
        ok && String::from_utf16_lossy(&name[..name.iter().position(|v| *v == 0).unwrap_or(64)])
            .eq_ignore_ascii_case("Default")
    }
}
fn fullscreen(monitor: &Monitor) -> bool {
    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() || IsZoomed(window) != 0 {
            return false;
        }
        let mut pid = 0;
        GetWindowThreadProcessId(window, &mut pid);
        if pid == std::process::id() {
            return false;
        }
        let mut class = [0u16; 128];
        let len = GetClassNameW(window, class.as_mut_ptr(), 128);
        let class = String::from_utf16_lossy(&class[..len.max(0) as usize]);
        if matches!(
            class.as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
        ) {
            return false;
        }
        let mut r = Rect::default();
        let m = monitor.rect;
        GetWindowRect(window, &mut r) != 0
            && r.left <= m.left
            && r.top <= m.top
            && r.right >= m.right
            && r.bottom >= m.bottom
    }
}
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetTickCount64() -> u64;
}
static PENDING: AtomicU32 = AtomicU32::new(0);
static PENDING_DISPLAYS: OnceLock<Mutex<Vec<Monitor>>> = OnceLock::new();
static TOPOLOGY_DIRTY: AtomicBool = AtomicBool::new(false);
#[unsafe(no_mangle)]
pub extern "C" fn lumeria_hot_corners_topology_callback() -> *const c_void {
    invalidate_topology as *const c_void
}
extern "C" fn invalidate_topology() {
    TOPOLOGY_DIRTY.store(true, Ordering::Release);
    TOPOLOGY.fetch_add(1, Ordering::AcqRel);
    PENDING.store(0, Ordering::Release);
}
static TOPOLOGY: AtomicU32 = AtomicU32::new(0);
static PENDING_TIME: AtomicU64 = AtomicU64::new(0);
#[unsafe(no_mangle)]
pub extern "C" fn lumeria_hot_corners_consume(generation: u32, topology: u32) -> i32 {
    if topology != TOPOLOGY.load(Ordering::Acquire) {
        return 0;
    }
    let expected = PENDING_DISPLAYS
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let sent_at = PENDING_TIME.load(Ordering::Acquire);
    if PENDING
        .compare_exchange(generation, 0, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return 0;
    }
    i32::from(unsafe { GetTickCount64() }.saturating_sub(sent_at) <= 500 && monitors() == expected)
}

type Callback = unsafe extern "C" fn(u32, i32, i32, u32, f64, u32);
struct Service {
    stop: Arc<(Mutex<bool>, Condvar)>,
    thread: JoinHandle<()>,
}
static SERVICE: OnceLock<Mutex<Option<Service>>> = OnceLock::new();
fn stop_service(slot: &mut Option<Service>) {
    PENDING.store(0, Ordering::Release);
    if let Some(service) = slot.take() {
        let (lock, cv) = &*service.stop;
        *lock.lock().unwrap_or_else(|e| e.into_inner()) = true;
        cv.notify_all();
        let _ = service.thread.join();
    }
    PENDING.store(0, Ordering::Release);
}
#[unsafe(no_mangle)]
pub extern "C" fn lumeria_hot_corners_stop() {
    stop_service(
        &mut SERVICE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap_or_else(|e| e.into_inner()),
    );
}
#[unsafe(no_mangle)]
pub extern "C" fn lumeria_hot_corners_start(
    mask: u32,
    delay_ms: u32,
    modifier: u32,
    pause_fullscreen: u32,
    allow_seams: u32,
    generation: u32,
    callback: Option<Callback>,
) -> i32 {
    let Some(callback) = callback else {
        return -1;
    };
    if generation == 0
        || mask == 0
        || mask > 15
        || delay_ms > 10_000
        || !matches!(modifier, 0 | 16 | 17 | 18)
    {
        return -1;
    }
    let mut slot = SERVICE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    stop_service(&mut slot);
    let stop = Arc::new((Mutex::new(false), Condvar::new()));
    let worker_stop = stop.clone();
    let thread = std::thread::Builder::new()
        .name("lumeria-hot-corners".into())
        .spawn(move || {
            unsafe {
                SetThreadDpiAwarenessContext(-4isize as Handle);
            }
            let mut displays = Vec::new();
            let mut areas = Vec::new();
            let mut detector = Detector::default();
            let mut refreshed = Instant::now() - Duration::from_secs(2);
            let mut last = Instant::now();
            loop {
                let (lock, cv) = &*worker_stop;
                if *lock.lock().unwrap_or_else(|e| e.into_inner()) {
                    break;
                }
                let now = Instant::now();
                if now.duration_since(last) > Duration::from_millis(500) {
                    detector.reset();
                }
                last = now;
                let dirty = TOPOLOGY_DIRTY.swap(false, Ordering::AcqRel);
                if dirty {
                    detector.reset();
                }
                if dirty || now.duration_since(refreshed) >= Duration::from_secs(1) {
                    let next = monitors();
                    if next != displays {
                        TOPOLOGY.fetch_add(1, Ordering::AcqRel);
                        displays = next;
                        areas = zones(&displays, mask, allow_seams != 0);
                        detector.reset();
                        PENDING.store(0, Ordering::Release);
                    }
                    refreshed = now;
                }
                let mut point = Point::default();
                let valid = input_desktop_available() && unsafe { GetCursorPos(&mut point) } != 0;
                if valid {
                    let owner_id = unsafe { MonitorFromPoint(point, 0) } as usize;
                    let owner = displays
                        .iter()
                        .find(|m| m.id == owner_id && m.rect.contains(point.x, point.y))
                        .map(|m| m.rect);
                    let buttons = [1, 2, 4, 5, 6]
                        .iter()
                        .any(|key| unsafe { GetAsyncKeyState(*key) } < 0);
                    let missing_modifier =
                        modifier != 0 && unsafe { GetAsyncKeyState(modifier as i32) } >= 0;
                    let full = pause_fullscreen != 0
                        && displays
                            .iter()
                            .find(|m| owner == Some(m.rect))
                            .is_some_and(fullscreen);
                    if let Some(zone) = detector.sample(
                        &areas,
                        &point,
                        now,
                        Duration::from_millis(delay_ms as u64),
                        buttons || missing_modifier || full,
                        owner,
                    ) {
                        if PENDING
                            .compare_exchange(0, generation, Ordering::AcqRel, Ordering::Acquire)
                            .is_ok()
                        {
                            *PENDING_DISPLAYS
                                .get_or_init(|| Mutex::new(Vec::new()))
                                .lock()
                                .unwrap_or_else(|e| e.into_inner()) = displays.clone();
                            PENDING_TIME.store(unsafe { GetTickCount64() }, Ordering::Release);
                            unsafe {
                                callback(
                                    generation,
                                    point.x,
                                    point.y,
                                    zone.corner,
                                    owner_id as f64,
                                    TOPOLOGY.load(Ordering::Acquire),
                                );
                            }
                        }
                    }
                } else {
                    detector.reset();
                }
                let guard = lock.lock().unwrap_or_else(|e| e.into_inner());
                let _ = cv.wait_timeout_while(
                    guard,
                    if valid { detector.next_sample_delay(Instant::now(), Duration::from_millis(delay_ms as u64)) } else { Duration::from_millis(500) },
                    |stop| !*stop,
                );
            }
        });
    match thread {
        Ok(thread) => {
            *slot = Some(Service { stop, thread });
            0
        }
        Err(_) => -2,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pending_events_are_single_use_and_expire() {
        *PENDING_DISPLAYS
            .get_or_init(|| Mutex::new(Vec::new()))
            .lock()
            .unwrap() = monitors();
        PENDING_TIME.store(unsafe { GetTickCount64() }, Ordering::Release);
        PENDING.store(41, Ordering::Release);
        assert_eq!(lumeria_hot_corners_consume(40, 0), 0);
        assert_eq!(lumeria_hot_corners_consume(41, 0), 1);
        assert_eq!(lumeria_hot_corners_consume(41, 0), 0);
        PENDING_TIME.store(
            unsafe { GetTickCount64() }.saturating_sub(1000),
            Ordering::Release,
        );
        PENDING.store(42, Ordering::Release);
        assert_eq!(lumeria_hot_corners_consume(42, 0), 0);
        PENDING.store(43, Ordering::Release);
        invalidate_topology();
        assert_eq!(lumeria_hot_corners_consume(43, 0), 0);
        assert_eq!(PENDING.load(Ordering::Acquire), 0);
        TOPOLOGY.store(0, Ordering::Release);
        TOPOLOGY_DIRTY.store(false, Ordering::Release);
    }
    fn display(id: usize, x: i32, dpi: u32) -> Monitor {
        Monitor {
            id,
            rect: Rect {
                left: x,
                top: 0,
                right: x + 1000,
                bottom: 800,
            },
            dpi,
        }
    }
    #[test]
    fn seams_and_scaling() {
        let z = zones(&[display(1, -1000, 96), display(2, 0, 192)], 15, false);
        assert_eq!(z.len(), 4);
        assert_eq!(z[0].rect.left, -1000);
        assert_eq!(z[2].rect.right - z[2].rect.left, 16);
    }
    #[test]
    fn dwell_once_leave_and_drag_suppression() {
        let z = zones(&[display(1, 0, 96)], 1, false);
        let mut d = Detector::default();
        let now = Instant::now();
        let outside = Point { x: 100, y: 100 };
        let inside = Point { x: 0, y: 0 };
        let delay = Duration::from_millis(200);
        assert!(d
            .sample(&z, &inside, now, delay, false, Some(display(1, 0, 96).rect))
            .is_none());
        d.sample(
            &z,
            &outside,
            now,
            delay,
            false,
            Some(display(1, 0, 96).rect),
        );
        assert!(d
            .sample(&z, &inside, now, delay, false, Some(display(1, 0, 96).rect))
            .is_none());
        assert!(d
            .sample(
                &z,
                &inside,
                now + delay,
                delay,
                false,
                Some(display(1, 0, 96).rect)
            )
            .is_some());
        assert!(d
            .sample(
                &z,
                &inside,
                now + delay * 3,
                delay,
                false,
                Some(display(1, 0, 96).rect)
            )
            .is_none());
        d.sample(
            &z,
            &outside,
            now,
            delay,
            false,
            Some(display(1, 0, 96).rect),
        );
        d.sample(&z, &inside, now, delay, true, Some(display(1, 0, 96).rect));
        assert!(d
            .sample(
                &z,
                &inside,
                now + delay,
                delay,
                false,
                Some(display(1, 0, 96).rect)
            )
            .is_none());
        d.sample(
            &z,
            &outside,
            now,
            delay,
            false,
            Some(display(1, 0, 96).rect),
        );
        assert!(d
            .sample(
                &z,
                &inside,
                now,
                Duration::ZERO,
                false,
                Some(display(1, 0, 96).rect)
            )
            .is_some());
    }
    #[test]
    fn reset_requires_leaving() {
        let z = zones(&[display(1, 0, 96)], 1, false);
        let mut d = Detector::default();
        let now = Instant::now();
        d.sample(
            &z,
            &Point { x: 100, y: 100 },
            now,
            Duration::ZERO,
            false,
            Some(display(1, 0, 96).rect),
        );
        d.reset();
        assert!(d
            .sample(
                &z,
                &Point { x: 0, y: 0 },
                now,
                Duration::ZERO,
                false,
                Some(display(1, 0, 96).rect)
            )
            .is_none());
    }
}
