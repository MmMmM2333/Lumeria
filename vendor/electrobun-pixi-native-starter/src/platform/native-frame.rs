#![allow(non_snake_case)]

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::collections::HashSet;
use std::convert::TryInto;
use std::ffi::{c_char, c_void};
use std::fs::File;
use std::io::Read;
use std::mem::transmute_copy;
use std::mem::MaybeUninit;
use std::path::PathBuf;
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicPtr, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::Instant;

type Handle = *mut c_void;

const PIXI_HOST_ABI_VERSION: u32 = 3;
const PIXI_HOST_CAP_MULTI_BUNDLE: u64 = 1 << 0;
const PIXI_HOST_CAP_SURFACE_STATUS_V2: u64 = 1 << 1;
const MAX_BUNDLES_PER_FRAME: u64 = 4096;

#[unsafe(no_mangle)]
pub extern "C" fn pixi_host_abi_version() -> u32 {
    PIXI_HOST_ABI_VERSION
}

#[unsafe(no_mangle)]
pub extern "C" fn pixi_host_capabilities() -> u64 {
    PIXI_HOST_CAP_MULTI_BUNDLE
        | PIXI_HOST_CAP_SURFACE_STATUS_V2
        | PIXI_HOST_CAP_WINDOW_INPUT
        | PIXI_HOST_CAP_TEXT_INPUT
        | PIXI_HOST_CAP_JOBS
        | PIXI_HOST_CAP_ACCESSIBILITY_BRIDGE
        | PIXI_HOST_CAP_PLATFORM_FILES
        | PIXI_HOST_CAP_WINDOW_SNAPSHOT
        | PIXI_HOST_CAP_INPUT_DIAGNOSTICS
        | PIXI_HOST_CAP_INPUT_WAKE
        | PIXI_HOST_CAP_LIFECYCLE_EVENTS
}

#[unsafe(no_mangle)]
pub extern "C" fn pixi_uia_provider_available() -> u32 {
    u32::from(pixi_host_capabilities() & PIXI_HOST_CAP_UIA_PROVIDER != 0)
}

fn scale_factor_from_dpi(dpi: u32) -> f64 {
    if dpi == 0 { 0.0 } else { dpi as f64 / 96.0 }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_get_window_scale_factor(window: Handle) -> f64 {
    if window.is_null() {
        return 0.0;
    }
    scale_factor_from_dpi(unsafe { GetDpiForWindow(window) })
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetModuleHandleW(name: *const u16) -> Handle;
    fn GetProcAddress(module: Handle, name: *const c_char) -> *mut c_void;
    fn GetCurrentThreadId() -> u32;
    fn GetCurrentProcessId() -> u32;
    fn GetTickCount64() -> u64;
    fn CreateEventW(attributes: *const c_void, manual_reset: i32, initial_state: i32, name: *const u16) -> Handle;
    fn SetEvent(event: Handle) -> i32;
    fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
    fn CloseHandle(handle: Handle) -> i32;
    fn GlobalAlloc(flags: u32, bytes: usize) -> Handle;
    fn GlobalLock(memory: Handle) -> *mut c_void;
    fn GlobalUnlock(memory: Handle) -> i32;
    fn GlobalFree(memory: Handle) -> Handle;
}

#[link(name = "user32")]
unsafe extern "system" {
    fn PeekMessageW(message: *mut Message, window: Handle, min: u32, max: u32, remove: u32) -> i32;
    fn TranslateMessage(message: *const Message) -> i32;
    fn DispatchMessageW(message: *const Message) -> isize;
    fn PostQuitMessage(exit_code: i32);
    fn IsWindow(window: Handle) -> i32;
    fn GetWindowThreadProcessId(window: Handle, process_id: *mut u32) -> u32;
    fn SetCapture(window: Handle) -> Handle;
    fn ReleaseCapture() -> i32;
    fn GetCapture() -> Handle;
    fn TrackMouseEvent(event: *mut TrackMouseEventData) -> i32;
    fn ScreenToClient(window: Handle, point: *mut Point) -> i32;
    fn ClientToScreen(window: Handle, point: *mut Point) -> i32;
    fn GetClientRect(window: Handle, rect: *mut Rect) -> i32;
    fn GetWindowRect(window: Handle, rect: *mut Rect) -> i32;
    fn IsIconic(window: Handle) -> i32;
    fn IsZoomed(window: Handle) -> i32;
    fn MonitorFromWindow(window: Handle, flags: u32) -> Handle;
    fn GetKeyState(key: i32) -> i16;
    fn GetDoubleClickTime() -> u32;
    fn GetSystemMetrics(index: i32) -> i32;
    fn LoadCursorW(instance: Handle, name: *const u16) -> Handle;
    fn SetCursor(cursor: Handle) -> Handle;
    fn GetForegroundWindow() -> Handle;
    fn GetDpiForWindow(window: Handle) -> u32;
    fn GetAncestor(window: Handle, flags: u32) -> Handle;
    fn RegisterWindowMessageW(name: *const u16) -> u32;
    fn SetWindowsHookExW(
        id_hook: i32,
        proc: Option<unsafe extern "system" fn(i32, usize, isize) -> isize>,
        module: Handle,
        thread_id: u32,
    ) -> Handle;
    fn UnhookWindowsHookEx(hook: Handle) -> i32;
    fn CallNextHookEx(hook: Handle, code: i32, w_param: usize, l_param: isize) -> isize;
    fn SendMessageW(window: Handle, message: u32, w_param: usize, l_param: isize) -> isize;
}

#[link(name = "shell32")]
unsafe extern "system" {
    fn DragAcceptFiles(window: Handle, accept: i32);
    fn DragQueryFileW(drop: Handle, index: u32, output: *mut u16, capacity: u32) -> u32;
    fn DragQueryPoint(drop: Handle, point: *mut Point) -> i32;
    fn DragFinish(drop: Handle);
    fn SHDoDragDrop(
        window: Handle, data: *mut c_void, source: *mut c_void,
        allowed_effects: u32, effect: *mut u32,
    ) -> i32;
}

#[link(name = "ole32")]
unsafe extern "system" {
    fn OleInitialize(reserved: *mut c_void) -> i32;
    fn OleUninitialize();
}

#[link(name = "comdlg32")]
unsafe extern "system" {
    fn GetSaveFileNameW(options: *mut OpenFileNameW) -> i32;
    fn CommDlgExtendedError() -> u32;
}

type SubclassProc = Option<unsafe extern "system" fn(Handle, u32, usize, isize, usize, usize) -> isize>;

#[link(name = "comctl32")]
unsafe extern "system" {
    fn SetWindowSubclass(window: Handle, proc: SubclassProc, id: usize, data: usize) -> i32;
    fn GetWindowSubclass(window: Handle, proc: SubclassProc, id: usize, data: *mut usize) -> i32;
    fn RemoveWindowSubclass(window: Handle, proc: SubclassProc, id: usize) -> i32;
    fn DefSubclassProc(window: Handle, message: u32, w_param: usize, l_param: isize) -> isize;
}

#[link(name = "imm32")]
unsafe extern "system" {
    fn ImmGetContext(window: Handle) -> Handle;
    fn ImmReleaseContext(window: Handle, context: Handle) -> i32;
    fn ImmGetCompositionStringW(
        context: Handle, index: u32, buffer: *mut c_void, buffer_length: u32,
    ) -> i32;
    fn ImmSetCandidateWindow(context: Handle, form: *const CandidateForm) -> i32;
    fn ImmSetCompositionWindow(context: Handle, form: *const CompositionForm) -> i32;
    fn ImmNotifyIME(context: Handle, action: u32, index: u32, value: u32) -> i32;
}

#[derive(Clone, Copy)]
#[repr(C)]
pub struct Point { x: i32, y: i32 }

#[repr(C)]
struct TrackMouseEventData {
    size: u32,
    flags: u32,
    window: Handle,
    hover_time: u32,
}

#[derive(Clone, Copy)]
#[repr(C)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[repr(C)]
struct CandidateForm {
    index: u32,
    style: u32,
    current_position: Point,
    area: Rect,
}

#[repr(C)]
struct CompositionForm {
    style: u32,
    current_position: Point,
    area: Rect,
}

#[repr(C)]
struct OpenFileNameW {
    size: u32,
    owner: Handle,
    instance: Handle,
    filter: *const u16,
    custom_filter: *mut u16,
    max_custom_filter: u32,
    filter_index: u32,
    file: *mut u16,
    max_file: u32,
    file_title: *mut u16,
    max_file_title: u32,
    initial_directory: *const u16,
    title: *const u16,
    flags: u32,
    file_offset: u16,
    file_extension: u16,
    default_extension: *const u16,
    custom_data: isize,
    hook: *mut c_void,
    template_name: *const u16,
    reserved: *mut c_void,
    reserved_flags: u32,
    extended_flags: u32,
}

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(C)]
struct Guid {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

#[repr(C)]
struct FormatEtc {
    format: u16,
    target_device: *mut c_void,
    aspect: u32,
    index: i32,
    medium: u32,
}

#[repr(C)]
struct StorageMedium {
    medium: u32,
    value: Handle,
    release: *mut c_void,
}

#[repr(C)]
struct DropFiles {
    offset: u32,
    point: Point,
    non_client: i32,
    wide: i32,
}

#[repr(C)]
struct Message {
    window: Handle,
    message: u32,
    w_param: usize,
    l_param: isize,
    time: u32,
    point: Point,
    private: u32,
}

#[repr(C)]
struct CallWndProcMessage {
    l_param: isize,
    w_param: usize,
    message: u32,
    window: Handle,
}

struct OwnerThreadRequest {
    window: Handle,
    command: u32,
    arg0: u64,
    arg1: i64,
    arg2: i64,
    arg3: i64,
    arg4: i64,
    data: *mut c_void,
    claimed: AtomicBool,
    completed: AtomicBool,
    result: AtomicI32,
}

const OWNER_ATTACH_INPUT: u32 = 1;
const OWNER_DETACH_INPUT: u32 = 2;
const OWNER_SET_CAPTURE: u32 = 3;
const OWNER_RELEASE_CAPTURE: u32 = 4;
const OWNER_SET_CURSOR: u32 = 5;
const OWNER_BEGIN_TEXT: u32 = 6;
const OWNER_UPDATE_CARET: u32 = 7;
const OWNER_END_TEXT: u32 = 8;
const OWNER_ATTACH_ACCESSIBILITY: u32 = 9;
const OWNER_DETACH_ACCESSIBILITY: u32 = 10;
const OWNER_UPDATE_ACCESSIBILITY: u32 = 11;
const OWNER_DRAG_OUT: u32 = 13;
const OWNER_GET_WINDOW_SNAPSHOT: u32 = 14;
const OWNER_GET_CAPTURE: u32 = 15;
const OWNER_GET_CURSOR: u32 = 16;
const OWNER_CLIENT_TO_SCREEN: u32 = 17;
const OWNER_SCREEN_TO_CLIENT: u32 = 18;
const OWNER_MESSAGE_MAGIC: isize = 0x5049_5849;
const WH_CALLWNDPROC: i32 = 4;

static OWNER_THREAD_MESSAGE: OnceLock<u32> = OnceLock::new();
static OWNER_REQUESTS: OnceLock<Mutex<HashMap<usize, usize>>> = OnceLock::new();
static NEXT_OWNER_REQUEST: AtomicU64 = AtomicU64::new(1);

fn owner_requests() -> &'static Mutex<HashMap<usize, usize>> {
    OWNER_REQUESTS.get_or_init(|| Mutex::new(HashMap::with_capacity(16)))
}

fn owner_thread_message() -> u32 {
    *OWNER_THREAD_MESSAGE.get_or_init(|| {
        let name: Vec<u16> = "Pixi.OwnerThread.Command.v1\0".encode_utf16().collect();
        unsafe { RegisterWindowMessageW(name.as_ptr()) }
    })
}

unsafe fn dispatch_owner_request(request: *mut OwnerThreadRequest) -> i32 {
    let request = unsafe { &mut *request };
    match request.command {
        OWNER_ATTACH_INPUT => unsafe { pixi_attach_input(request.window, request.arg0) },
        OWNER_DETACH_INPUT => unsafe { pixi_detach_input(request.window) },
        OWNER_SET_CAPTURE => unsafe { pixi_set_mouse_capture(request.window) },
        OWNER_RELEASE_CAPTURE => unsafe { pixi_release_mouse_capture(request.window) },
        OWNER_SET_CURSOR => unsafe { pixi_set_cursor(request.window, request.arg0 as u32) },
        OWNER_BEGIN_TEXT => unsafe {
            pixi_begin_text_input(
                request.window,
                request.arg1 as i32,
                request.arg2 as i32,
                request.arg3 as i32,
                request.arg4 as i32,
            )
        },
        OWNER_UPDATE_CARET => unsafe {
            pixi_update_caret_rect(
                request.window,
                request.arg1 as i32,
                request.arg2 as i32,
                request.arg3 as i32,
                request.arg4 as i32,
            )
        },
        OWNER_END_TEXT => unsafe { pixi_end_text_input(request.window) },
        OWNER_DRAG_OUT => {
            if request.data.is_null() {
                -4
            } else {
                let paths = std::mem::take(unsafe { &mut *(request.data as *mut Vec<u16>) });
                unsafe { drag_out_inner(request.window, paths) }
            }
        }
        OWNER_GET_WINDOW_SNAPSHOT => {
            if request.data.is_null() {
                -4
            } else {
                unsafe {
                    get_window_snapshot_inner(
                        request.window,
                        request.data as *mut WindowSnapshot,
                    )
                }
            }
        }
        OWNER_GET_CAPTURE => unsafe { get_mouse_capture_inner(request.window) },
        OWNER_GET_CURSOR => unsafe { get_cursor_inner(request.window) },
        OWNER_CLIENT_TO_SCREEN | OWNER_SCREEN_TO_CLIENT => {
            if request.data.is_null() {
                -4
            } else {
                unsafe {
                    convert_point_inner(
                        request.window,
                        request.arg1 as i32,
                        request.arg2 as i32,
                        request.command == OWNER_CLIENT_TO_SCREEN,
                        request.data as *mut Point,
                    )
                }
            }
        }
        OWNER_ATTACH_ACCESSIBILITY => unsafe {
            pixi_attach_accessibility(request.window, request.arg0)
        },
        OWNER_DETACH_ACCESSIBILITY => unsafe { pixi_detach_accessibility(request.window) },
        OWNER_UPDATE_ACCESSIBILITY => {
            if request.data.is_null() {
                -4
            } else {
                let snapshot = std::mem::take(unsafe {
                    &mut *(request.data as *mut Vec<u8>)
                });
                unsafe { update_accessibility_snapshot_owned(request.window, snapshot) }
            }
        }
        _ => -8,
    }
}

unsafe extern "system" fn owner_thread_hook(
    code: i32,
    w_param: usize,
    l_param: isize,
) -> isize {
    if code >= 0 && l_param != 0 {
        let message = unsafe { &*(l_param as *const CallWndProcMessage) };
        if message.message == owner_thread_message()
            && message.l_param == OWNER_MESSAGE_MAGIC
            && message.w_param != 0
        {
            let request = owner_requests()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .get(&message.w_param)
                .copied()
                .unwrap_or(0) as *mut OwnerThreadRequest;
            if request.is_null() {
                return unsafe { CallNextHookEx(null_mut(), code, w_param, l_param) };
            }
            if unsafe { (*request).window } == message.window
                && unsafe {
                    (*request).claimed.compare_exchange(
                        false,
                        true,
                        Ordering::AcqRel,
                        Ordering::Acquire,
                    )
                }
                .is_ok()
            {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| unsafe {
                    dispatch_owner_request(request)
                }))
                .unwrap_or(-9);
                unsafe {
                    (*request).result.store(result, Ordering::Relaxed);
                    (*request).completed.store(true, Ordering::Release);
                }
            }
        }
    }
    unsafe { CallNextHookEx(null_mut(), code, w_param, l_param) }
}

fn run_on_window_thread(
    window: Handle,
    command: u32,
    arg0: u64,
    rect: [i32; 4],
    data: *mut c_void,
) -> i32 {
    if window.is_null() || unsafe { IsWindow(window) } == 0 { return -1; }
    let mut process_id = 0u32;
    let owner_thread = unsafe { GetWindowThreadProcessId(window, &mut process_id) };
    if owner_thread == 0 || process_id != unsafe { GetCurrentProcessId() } { return -2; }
    let message = owner_thread_message();
    if message == 0 { return -5; }
    let mut request = OwnerThreadRequest {
        window,
        command,
        arg0,
        arg1: rect[0] as i64,
        arg2: rect[1] as i64,
        arg3: rect[2] as i64,
        arg4: rect[3] as i64,
        data,
        claimed: AtomicBool::new(false),
        completed: AtomicBool::new(false),
        result: AtomicI32::new(-7),
    };
    if owner_thread == unsafe { GetCurrentThreadId() } {
        return unsafe { dispatch_owner_request(&mut request) };
    }
    let hook = unsafe {
        SetWindowsHookExW(WH_CALLWNDPROC, Some(owner_thread_hook), null_mut(), owner_thread)
    };
    if hook.is_null() { return -6; }
    let Some(token) = NEXT_OWNER_REQUEST
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |token| token.checked_add(1))
        .ok()
        .map(|token| token as usize)
    else {
        unsafe { UnhookWindowsHookEx(hook) };
        return -8;
    };
    owner_requests()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(token, (&mut request as *mut OwnerThreadRequest) as usize);
    unsafe {
        SendMessageW(
            window,
            message,
            token,
            OWNER_MESSAGE_MAGIC,
        );
        UnhookWindowsHookEx(hook);
    }
    owner_requests()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&token);
    if request.completed.load(Ordering::Acquire) {
        request.result.load(Ordering::Relaxed)
    } else {
        -7
    }
}

const PIXI_HOST_CAP_WINDOW_INPUT: u64 = 1 << 2;
const PIXI_HOST_CAP_TEXT_INPUT: u64 = 1 << 3;
const PIXI_HOST_CAP_JOBS: u64 = 1 << 4;
const PIXI_HOST_CAP_ACCESSIBILITY_BRIDGE: u64 = 1 << 5;
const PIXI_HOST_CAP_UIA_PROVIDER: u64 = 1 << 6;
const PIXI_HOST_CAP_PLATFORM_FILES: u64 = 1 << 7;
const PIXI_HOST_CAP_WINDOW_SNAPSHOT: u64 = 1 << 8;
const PIXI_HOST_CAP_INPUT_DIAGNOSTICS: u64 = 1 << 9;
const PIXI_HOST_CAP_INPUT_WAKE: u64 = 1 << 10;
const PIXI_HOST_CAP_LIFECYCLE_EVENTS: u64 = 1 << 11;
const INPUT_SUBCLASS_ID: usize = 0x5049_5849;
const ACCESSIBILITY_SUBCLASS_ID: usize = 0x4131_3159;
const INPUT_EVENT_CAPACITY: usize = 4096;
const TEXT_EVENT_CAPACITY: usize = 512;
const MAX_TEXT_UNITS: usize = 32768;
const MAX_JOB_REQUEST_BYTES: u64 = 32 * 1024;
const MAX_ACTIVE_JOBS: usize = 32;
const MAX_JOB_EVENTS: usize = 1024;
const MAX_JOB_RESULT_BYTES: usize = 64 * 1024 * 1024;
const MAX_QUEUED_JOB_BYTES: usize = 128 * 1024 * 1024;
const MAX_ACCESSIBILITY_SNAPSHOT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_ACCESSIBILITY_NODES: u32 = 65535;
const MAX_ACCESSIBILITY_ACTIONS: usize = 256;
const FILE_DROP_CAPACITY: usize = 64;
const MAX_FILE_DROP_PATHS: u32 = 128;
const MAX_FILE_PATH_UNITS: u32 = 32767;
const MAX_FILE_DROP_UNITS: usize = 1024 * 1024;

const INPUT_POINTER_MOVE: u32 = 1;
const INPUT_POINTER_DOWN: u32 = 2;
const INPUT_POINTER_UP: u32 = 3;
const INPUT_POINTER_ENTER: u32 = 4;
const INPUT_POINTER_LEAVE: u32 = 5;
const INPUT_POINTER_CANCEL: u32 = 6;
const INPUT_CAPTURE_GAINED: u32 = 7;
const INPUT_CAPTURE_LOST: u32 = 8;
const INPUT_WHEEL: u32 = 9;
const INPUT_FOCUS: u32 = 10;
const INPUT_BLUR: u32 = 11;
const INPUT_KEY_DOWN: u32 = 12;
const INPUT_KEY_UP: u32 = 13;
const INPUT_WINDOW_MOVE: u32 = 14;
const INPUT_WINDOW_RESIZE: u32 = 15;
const INPUT_DPI_CHANGED: u32 = 16;
const INPUT_DISPLAY_CHANGED: u32 = 17;
const INPUT_MINIMIZED: u32 = 18;
const INPUT_RESTORED: u32 = 19;
const INPUT_SUSPEND: u32 = 20;
const INPUT_RESUME: u32 = 21;

const TEXT_COMPOSITION_START: u32 = 1;
const TEXT_COMPOSITION_UPDATE: u32 = 2;
const TEXT_COMPOSITION_END: u32 = 3;
const TEXT_COMMIT: u32 = 4;
const TEXT_ERROR: u32 = 5;

const JOB_PROGRESS: u32 = 1;
const JOB_RESULT: u32 = 2;
const JOB_ERROR: u32 = 3;
const JOB_CANCELLED: u32 = 4;

#[derive(Clone, Copy)]
#[repr(C)]
pub struct WindowSnapshot {
    pub client_width: i32,
    pub client_height: i32,
    pub frame_x: i32,
    pub frame_y: i32,
    pub frame_width: i32,
    pub frame_height: i32,
    pub dpi: u32,
    pub flags: u32,
    pub scale_factor: f64,
    pub display_id: u64,
}

const _: [(); 48] = [(); std::mem::size_of::<WindowSnapshot>()];
const _: [(); 8] = [(); std::mem::align_of::<WindowSnapshot>()];

#[derive(Clone, Copy)]
#[repr(C)]
pub struct InputDiagnostics {
    pub queued: u64,
    pub dropped: u64,
    pub coalesced: u64,
    pub duplicates: u64,
}

const _: [(); 32] = [(); std::mem::size_of::<InputDiagnostics>()];
const _: [(); 8] = [(); std::mem::align_of::<InputDiagnostics>()];

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(C)]
pub struct InputEvent {
    pub route_id: u64,
    pub timestamp: u64,
    pub kind: u32,
    pub modifiers: u32,
    pub x: i32,
    pub y: i32,
    pub movement_x: i32,
    pub movement_y: i32,
    pub button: i32,
    pub buttons: u32,
    pub wheel_x: i32,
    pub wheel_y: i32,
    pub delta_mode: u32,
    pub key_code: u32,
    pub scan_code: u32,
    pub repeat: u32,
    pub detail: u32,
    pub pointer_id: u32,
    pub screen_x: i32,
    pub screen_y: i32,
}

const _: [(); 88] = [(); std::mem::size_of::<InputEvent>()];
const _: [(); 8] = [(); std::mem::align_of::<InputEvent>()];

#[derive(Clone, Copy)]
#[repr(C)]
pub struct TextEventMeta {
    pub route_id: u64,
    pub timestamp: u64,
    pub kind: u32,
    pub code: i32,
    pub cursor_utf16: u32,
    pub text_length_utf16: u32,
    pub reserved0: u32,
    pub reserved1: u32,
}

const _: [(); 40] = [(); std::mem::size_of::<TextEventMeta>()];
const _: [(); 8] = [(); std::mem::align_of::<TextEventMeta>()];

struct QueuedTextEvent {
    meta: TextEventMeta,
    text: Vec<u16>,
}

#[derive(Clone, Copy)]
#[repr(C)]
pub struct FileDropMeta {
    pub route_id: u64,
    pub timestamp: u64,
    pub x: i32,
    pub y: i32,
    pub path_count: u32,
    pub data_length_utf16: u32,
}

const _: [(); 32] = [(); std::mem::size_of::<FileDropMeta>()];
const _: [(); 8] = [(); std::mem::align_of::<FileDropMeta>()];

struct QueuedFileDrop {
    meta: FileDropMeta,
    paths: Vec<u16>,
}

#[derive(Clone, Copy)]
#[repr(C)]
pub struct JobEventMeta {
    pub job_id: u64,
    pub event_kind: u32,
    pub job_kind: u32,
    pub code: i32,
    pub reserved: u32,
    pub completed: u64,
    pub total: u64,
    pub data_length: u64,
}

const _: [(); 48] = [(); std::mem::size_of::<JobEventMeta>()];
const _: [(); 8] = [(); std::mem::align_of::<JobEventMeta>()];

struct QueuedJobEvent {
    meta: JobEventMeta,
    data: Vec<u8>,
}

struct JobControl {
    cancel: AtomicBool,
    terminal: AtomicBool,
}

struct JobState {
    accepting: bool,
    active: HashMap<u64, Arc<JobControl>>,
    events: VecDeque<QueuedJobEvent>,
    queued_bytes: usize,
    workers: Vec<JoinHandle<()>>,
}

#[derive(Clone, Copy)]
#[repr(C)]
pub struct AccessibilityActionMeta {
    pub route_id: u64,
    pub node_id: u64,
    pub action: u32,
    pub code: i32,
    pub data_length: u64,
}

const _: [(); 32] = [(); std::mem::size_of::<AccessibilityActionMeta>()];
const _: [(); 8] = [(); std::mem::align_of::<AccessibilityActionMeta>()];

struct AccessibilityAction {
    meta: AccessibilityActionMeta,
    data: Vec<u8>,
}

struct AccessibilityState {
    route_id: u64,
    snapshot: Vec<u8>,
}

struct WindowInputState {
    route_id: u64,
    last_x: i32,
    last_y: i32,
    last_position_valid: bool,
    tracking_leave: bool,
    buttons: u32,
    has_capture: bool,
    releasing_capture: bool,
    cursor: Handle,
    cursor_kind: u32,
    minimized: bool,
    last_click_time: u64,
    last_click_x: i32,
    last_click_y: i32,
    last_click_button: i32,
    last_click_detail: u32,
    text_active: bool,
    ime_composing: bool,
    caret: Rect,
    suppressed_result_chars: VecDeque<u16>,
    pending_high_surrogate: u16,
}

static INPUT_EVENTS: OnceLock<Mutex<VecDeque<InputEvent>>> = OnceLock::new();
static INPUT_DROPPED: AtomicU64 = AtomicU64::new(0);
static INPUT_COALESCED: AtomicU64 = AtomicU64::new(0);
static INPUT_DUPLICATES: AtomicU64 = AtomicU64::new(0);
static INPUT_CLOCK: OnceLock<(Instant, u64)> = OnceLock::new();
static TEXT_EVENTS: OnceLock<Mutex<VecDeque<QueuedTextEvent>>> = OnceLock::new();
static FILE_DROP_EVENTS: OnceLock<Mutex<VecDeque<QueuedFileDrop>>> = OnceLock::new();
static RESIZING_WINDOWS: OnceLock<Mutex<HashSet<usize>>> = OnceLock::new();
static JOBS: OnceLock<Mutex<JobState>> = OnceLock::new();
static NEXT_JOB_ID: AtomicU64 = AtomicU64::new(1);
static ACCESSIBILITY_ACTIONS: OnceLock<Mutex<VecDeque<AccessibilityAction>>> = OnceLock::new();

type InputWakeCallback = unsafe extern "C" fn(*mut c_void);

struct InputWakeRegistration {
    callback: Option<InputWakeCallback>,
    user_data: usize,
}

static INPUT_WAKE: OnceLock<Mutex<InputWakeRegistration>> = OnceLock::new();

fn input_events() -> &'static Mutex<VecDeque<InputEvent>> {
    INPUT_EVENTS.get_or_init(|| Mutex::new(VecDeque::with_capacity(INPUT_EVENT_CAPACITY)))
}

fn input_wake() -> &'static Mutex<InputWakeRegistration> {
    INPUT_WAKE.get_or_init(|| Mutex::new(InputWakeRegistration {
        callback: None,
        user_data: 0,
    }))
}

fn signal_input_wake() {
    let registration = input_wake()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(callback) = registration.callback {
        unsafe { callback(registration.user_data as *mut c_void) };
    }
}

fn text_events() -> &'static Mutex<VecDeque<QueuedTextEvent>> {
    TEXT_EVENTS.get_or_init(|| Mutex::new(VecDeque::with_capacity(TEXT_EVENT_CAPACITY)))
}

fn file_drop_events() -> &'static Mutex<VecDeque<QueuedFileDrop>> {
    FILE_DROP_EVENTS.get_or_init(|| Mutex::new(VecDeque::with_capacity(FILE_DROP_CAPACITY)))
}

fn set_window_resizing(window: usize, resizing: bool) {
    let mut windows = RESIZING_WINDOWS
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if resizing { windows.insert(window); } else { windows.remove(&window); }
}

fn window_is_resizing(window: usize) -> bool {
    RESIZING_WINDOWS
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .contains(&window)
}

fn jobs() -> &'static Mutex<JobState> {
    JOBS.get_or_init(|| Mutex::new(JobState {
        accepting: true,
        active: HashMap::with_capacity(MAX_ACTIVE_JOBS),
        events: VecDeque::with_capacity(MAX_JOB_EVENTS),
        queued_bytes: 0,
        workers: Vec::with_capacity(MAX_ACTIVE_JOBS),
    }))
}

fn accessibility_actions() -> &'static Mutex<VecDeque<AccessibilityAction>> {
    ACCESSIBILITY_ACTIONS.get_or_init(|| {
        Mutex::new(VecDeque::with_capacity(MAX_ACCESSIBILITY_ACTIONS))
    })
}

fn snapshot_u16(snapshot: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_le_bytes(snapshot.get(offset..offset.checked_add(2)?)?.try_into().ok()?))
}

fn snapshot_u32(snapshot: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes(snapshot.get(offset..offset.checked_add(4)?)?.try_into().ok()?))
}

fn snapshot_i32(snapshot: &[u8], offset: usize) -> Option<i32> {
    Some(i32::from_le_bytes(snapshot.get(offset..offset.checked_add(4)?)?.try_into().ok()?))
}

fn snapshot_u64(snapshot: &[u8], offset: usize) -> Option<u64> {
    Some(u64::from_le_bytes(snapshot.get(offset..offset.checked_add(8)?)?.try_into().ok()?))
}

fn validate_snapshot_string(
    snapshot: &[u8], arena_start: usize, offset: u32, length: u32,
) -> bool {
    if length == 0 {
        return offset == 0
            || (offset as usize >= arena_start && offset as usize <= snapshot.len());
    }
    let offset = offset as usize;
    let Some(end) = offset.checked_add(length as usize) else { return false; };
    offset >= arena_start
        && end <= snapshot.len()
        && std::str::from_utf8(&snapshot[offset..end]).is_ok()
}

fn validate_accessibility_snapshot(snapshot: &[u8]) -> Result<(), i32> {
    if snapshot.len() < 16
        || snapshot.len() > MAX_ACCESSIBILITY_SNAPSHOT_BYTES as usize
        || snapshot.get(0..4) != Some(b"A11Y")
        || snapshot_u16(snapshot, 4) != Some(1)
        || snapshot_u16(snapshot, 6) != Some(0)
        || snapshot_u32(snapshot, 12) != Some(snapshot.len() as u32)
    {
        return Err(-5);
    }
    let node_count = snapshot_u32(snapshot, 8).ok_or(-5)?;
    if node_count > MAX_ACCESSIBILITY_NODES { return Err(-5); }
    let records_size = (node_count as usize).checked_mul(64).ok_or(-5)?;
    let arena_start = 16usize.checked_add(records_size).ok_or(-5)?;
    if arena_start > snapshot.len() { return Err(-5); }
    let mut ids = HashSet::new();
    let mut parents = Vec::new();
    ids.try_reserve(node_count as usize).map_err(|_| -6)?;
    parents.try_reserve_exact(node_count as usize).map_err(|_| -6)?;
    for index in 0..node_count as usize {
        let base = 16 + index * 64;
        let id = snapshot_u64(snapshot, base).ok_or(-5)?;
        let parent = snapshot_u64(snapshot, base + 8).ok_or(-5)?;
        let width = snapshot_i32(snapshot, base + 36).ok_or(-5)?;
        let height = snapshot_i32(snapshot, base + 40).ok_or(-5)?;
        let name_offset = snapshot_u32(snapshot, base + 44).ok_or(-5)?;
        let name_length = snapshot_u32(snapshot, base + 48).ok_or(-5)?;
        let value_offset = snapshot_u32(snapshot, base + 52).ok_or(-5)?;
        let value_length = snapshot_u32(snapshot, base + 56).ok_or(-5)?;
        if id == 0
            || parent == id
            || !ids.insert(id)
            || width < 0
            || height < 0
            || snapshot_u32(snapshot, base + 60) != Some(0)
            || !validate_snapshot_string(snapshot, arena_start, name_offset, name_length)
            || !validate_snapshot_string(snapshot, arena_start, value_offset, value_length)
        {
            return Err(-5);
        }
        parents.push(parent);
    }
    if parents.into_iter().any(|parent| parent != 0 && !ids.contains(&parent)) {
        return Err(-5);
    }
    Ok(())
}

fn purge_accessibility_actions(route_id: u64) {
    accessibility_actions()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .retain(|action| action.meta.route_id != route_id);
}

unsafe fn attached_accessibility_state(window: Handle) -> Option<*mut AccessibilityState> {
    let mut data = 0usize;
    if unsafe {
        GetWindowSubclass(
            window,
            Some(accessibility_subclass_proc),
            ACCESSIBILITY_SUBCLASS_ID,
            &mut data,
        )
    } == 0 || data == 0 {
        None
    } else {
        Some(data as *mut AccessibilityState)
    }
}

unsafe extern "system" fn accessibility_subclass_proc(
    window: Handle,
    message: u32,
    w_param: usize,
    l_param: isize,
    id: usize,
    data: usize,
) -> isize {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| unsafe {
        accessibility_subclass_proc_inner(window, message, w_param, l_param, id, data)
    }))
    .unwrap_or_else(|_| unsafe { DefSubclassProc(window, message, w_param, l_param) })
}

unsafe fn accessibility_subclass_proc_inner(
    window: Handle,
    message: u32,
    w_param: usize,
    l_param: isize,
    _id: usize,
    data: usize,
) -> isize {
    let state = data as *mut AccessibilityState;
    if state.is_null() {
        return unsafe { DefSubclassProc(window, message, w_param, l_param) };
    }
    if message == 0x003d {
        // No COM provider is advertised: preserve the native window's default WM_GETOBJECT path.
        return unsafe { DefSubclassProc(window, message, w_param, l_param) };
    }
    if message == 0x0082 {
        let route_id = unsafe { (*state).route_id };
        unsafe {
            RemoveWindowSubclass(
                window,
                Some(accessibility_subclass_proc),
                ACCESSIBILITY_SUBCLASS_ID,
            )
        };
        let result = unsafe { DefSubclassProc(window, message, w_param, l_param) };
        purge_accessibility_actions(route_id);
        unsafe { drop(Box::from_raw(state)) };
        return result;
    }
    unsafe { DefSubclassProc(window, message, w_param, l_param) }
}

fn blank_input_event(route_id: u64, kind: u32) -> InputEvent {
    InputEvent {
        route_id,
        timestamp: input_timestamp_millis(),
        kind,
        modifiers: 0,
        x: 0,
        y: 0,
        movement_x: 0,
        movement_y: 0,
        button: -1,
        buttons: 0,
        wheel_x: 0,
        wheel_y: 0,
        delta_mode: 0,
        key_code: 0,
        scan_code: 0,
        repeat: 0,
        detail: 0,
        pointer_id: u32::from(matches!(kind, INPUT_POINTER_MOVE..=INPUT_WHEEL)),
        screen_x: 0,
        screen_y: 0,
    }
}

fn input_timestamp_millis() -> u64 {
    let (started, base) = INPUT_CLOCK.get_or_init(|| (Instant::now(), unsafe { GetTickCount64() }));
    base.saturating_add(started.elapsed().as_millis() as u64)
}

fn protected_input(kind: u32) -> bool {
    matches!(kind, INPUT_POINTER_DOWN | INPUT_POINTER_UP | INPUT_POINTER_CANCEL)
}

fn coalescable_input(kind: u32) -> bool {
    matches!(kind, INPUT_POINTER_MOVE | INPUT_WINDOW_MOVE | INPUT_WINDOW_RESIZE)
}

fn push_input_event(event: InputEvent) {
    let mut events = input_events().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if coalescable_input(event.kind) {
        if let Some(last) = events.back_mut().filter(|last| {
            last.kind == event.kind && last.route_id == event.route_id
        }) {
            let movement_x = if event.kind == INPUT_POINTER_MOVE {
                last.movement_x.saturating_add(event.movement_x)
            } else { 0 };
            let movement_y = if event.kind == INPUT_POINTER_MOVE {
                last.movement_y.saturating_add(event.movement_y)
            } else { 0 };
            *last = event;
            last.movement_x = movement_x;
            last.movement_y = movement_y;
            INPUT_COALESCED.fetch_add(1, Ordering::Relaxed);
            return;
        }
    }
    if events.back() == Some(&event) {
        INPUT_DUPLICATES.fetch_add(1, Ordering::Relaxed);
    }
    if events.len() >= INPUT_EVENT_CAPACITY {
        let removable = events.iter().position(|queued| queued.kind == INPUT_POINTER_MOVE)
            .or_else(|| protected_input(event.kind).then(|| {
                events.iter().position(|queued| !protected_input(queued.kind))
            }).flatten());
        if let Some(index) = removable {
            events.remove(index);
            INPUT_DROPPED.fetch_add(1, Ordering::Relaxed);
        } else {
            INPUT_DROPPED.fetch_add(1, Ordering::Relaxed);
            return;
        }
    }
    let should_wake = events.is_empty();
    events.push_back(event);
    std::mem::drop(events);
    if should_wake { signal_input_wake(); }
}

fn purge_input_events(route_id: u64) {
    input_events()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .retain(|event| event.route_id != route_id);
}

fn push_text_event(
    state: *mut WindowInputState,
    kind: u32,
    code: i32,
    cursor_utf16: u32,
    text: Vec<u16>,
) {
    let event = QueuedTextEvent {
        meta: TextEventMeta {
            route_id: unsafe { (*state).route_id },
            timestamp: unsafe { GetTickCount64() },
            kind,
            code,
            cursor_utf16,
            text_length_utf16: text.len() as u32,
            reserved0: 0,
            reserved1: 0,
        },
        text,
    };
    let mut events = text_events().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if event.meta.kind == TEXT_COMPOSITION_UPDATE {
        if let Some(last) = events.back_mut().filter(|last| {
            last.meta.kind == TEXT_COMPOSITION_UPDATE
                && last.meta.route_id == event.meta.route_id
        }) {
            *last = event;
            return;
        }
    }
    if events.len() >= TEXT_EVENT_CAPACITY {
        if let Some(index) = events.iter().position(|queued| {
            queued.meta.kind == TEXT_COMPOSITION_UPDATE
        }) {
            events.remove(index);
        } else {
            return;
        }
    }
    let should_wake = events.is_empty();
    events.push_back(event);
    drop(events);
    if should_wake { signal_input_wake(); }
}

fn push_text_error(state: *mut WindowInputState, code: i32, message: &str) {
    push_text_event(state, TEXT_ERROR, code, 0, message.encode_utf16().collect());
}

fn purge_text_events(route_id: u64) {
    text_events()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .retain(|event| event.meta.route_id != route_id);
}

fn purge_file_drop_events(route_id: u64) {
    file_drop_events()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .retain(|event| event.meta.route_id != route_id);
}

unsafe fn queue_file_drop(state: *mut WindowInputState, window: Handle, drop: Handle) {
    let count = unsafe { DragQueryFileW(drop, u32::MAX, null_mut(), 0) };
    let mut point = Point { x: 0, y: 0 };
    unsafe { DragQueryPoint(drop, &mut point) };
    let dpi = unsafe { GetDpiForWindow(window) };
    if dpi > 0 && dpi != 96 {
        point.x = (point.x as f64 * 96.0 / dpi as f64).round() as i32;
        point.y = (point.y as f64 * 96.0 / dpi as f64).round() as i32;
    }
    if count == 0 || count > MAX_FILE_DROP_PATHS {
        unsafe { DragFinish(drop) };
        return;
    }
    let mut paths = Vec::new();
    let mut delivered = 0;
    for index in 0..count {
        let length = unsafe { DragQueryFileW(drop, index, null_mut(), 0) };
        if length == 0 || length > MAX_FILE_PATH_UNITS
            || paths.len().saturating_add(length as usize + 1) > MAX_FILE_DROP_UNITS
        {
            continue;
        }
        let mut path = vec![0u16; length as usize + 1];
        let written = unsafe { DragQueryFileW(drop, index, path.as_mut_ptr(), path.len() as u32) };
        if written == 0 || written > length { continue; }
        paths.extend_from_slice(&path[..written as usize]);
        paths.push(0);
        delivered += 1;
    }
    unsafe { DragFinish(drop) };
    if delivered == 0 { return; }
    let event = QueuedFileDrop {
        meta: FileDropMeta {
            route_id: unsafe { (*state).route_id },
            timestamp: unsafe { GetTickCount64() },
            x: point.x,
            y: point.y,
            path_count: delivered,
            data_length_utf16: paths.len() as u32,
        },
        paths,
    };
    let mut events = file_drop_events().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if events.len() >= FILE_DROP_CAPACITY { events.pop_front(); }
    let should_wake = events.is_empty();
    events.push_back(event);
    std::mem::drop(events);
    if should_wake { signal_input_wake(); }
}

const IID_IUNKNOWN: Guid = Guid {
    data1: 0, data2: 0, data3: 0, data4: [0xc0, 0, 0, 0, 0, 0, 0, 0x46],
};
const IID_IDATA_OBJECT: Guid = Guid {
    data1: 0x0000010e, data2: 0, data3: 0, data4: [0xc0, 0, 0, 0, 0, 0, 0, 0x46],
};
const IID_IDROP_SOURCE: Guid = Guid {
    data1: 0x00000121, data2: 0, data3: 0, data4: [0xc0, 0, 0, 0, 0, 0, 0, 0x46],
};
const S_OK: i32 = 0;
const E_NOINTERFACE: i32 = 0x80004002u32 as i32;
const E_NOTIMPL: i32 = 0x80004001u32 as i32;
const E_INVALIDARG: i32 = 0x80070057u32 as i32;
const DV_E_FORMATETC: i32 = 0x80040064u32 as i32;
const OLE_E_ADVISENOTSUPPORTED: i32 = 0x80040003u32 as i32;
const DRAGDROP_S_DROP: i32 = 0x00040100;
const DRAGDROP_S_CANCEL: i32 = 0x00040101;
const DRAGDROP_S_USEDEFAULTCURSORS: i32 = 0x00040102;

#[repr(C)]
struct FileDropSourceVTable {
    query_interface: unsafe extern "system" fn(*mut FileDropSource, *const Guid, *mut *mut c_void) -> i32,
    add_ref: unsafe extern "system" fn(*mut FileDropSource) -> u32,
    release: unsafe extern "system" fn(*mut FileDropSource) -> u32,
    query_continue_drag: unsafe extern "system" fn(*mut FileDropSource, i32, u32) -> i32,
    give_feedback: unsafe extern "system" fn(*mut FileDropSource, u32) -> i32,
}

#[repr(C)]
struct FileDropSource {
    vtable: &'static FileDropSourceVTable,
    references: AtomicU32,
}

unsafe extern "system" fn file_drop_source_query_interface(
    this: *mut FileDropSource, iid: *const Guid, output: *mut *mut c_void,
) -> i32 {
    if this.is_null() || iid.is_null() || output.is_null() { return E_INVALIDARG; }
    unsafe { *output = null_mut() };
    if unsafe { *iid } != IID_IUNKNOWN && unsafe { *iid } != IID_IDROP_SOURCE {
        return E_NOINTERFACE;
    }
    unsafe { *output = this.cast() };
    unsafe { file_drop_source_add_ref(this) };
    S_OK
}

unsafe extern "system" fn file_drop_source_add_ref(this: *mut FileDropSource) -> u32 {
    unsafe { (*this).references.fetch_add(1, Ordering::Relaxed) + 1 }
}

unsafe extern "system" fn file_drop_source_release(this: *mut FileDropSource) -> u32 {
    let remaining = unsafe { (*this).references.fetch_sub(1, Ordering::AcqRel) - 1 };
    if remaining == 0 { unsafe { drop(Box::from_raw(this)) }; }
    remaining
}

unsafe extern "system" fn file_drop_source_query_continue_drag(
    _this: *mut FileDropSource, escape_pressed: i32, key_state: u32,
) -> i32 {
    if escape_pressed != 0 { DRAGDROP_S_CANCEL }
    else if key_state & 1 == 0 { DRAGDROP_S_DROP }
    else { S_OK }
}

unsafe extern "system" fn file_drop_source_give_feedback(
    _this: *mut FileDropSource, _effect: u32,
) -> i32 { DRAGDROP_S_USEDEFAULTCURSORS }

static FILE_DROP_SOURCE_VTABLE: FileDropSourceVTable = FileDropSourceVTable {
    query_interface: file_drop_source_query_interface,
    add_ref: file_drop_source_add_ref,
    release: file_drop_source_release,
    query_continue_drag: file_drop_source_query_continue_drag,
    give_feedback: file_drop_source_give_feedback,
};

#[repr(C)]
struct FileDataObjectVTable {
    query_interface: unsafe extern "system" fn(*mut FileDataObject, *const Guid, *mut *mut c_void) -> i32,
    add_ref: unsafe extern "system" fn(*mut FileDataObject) -> u32,
    release: unsafe extern "system" fn(*mut FileDataObject) -> u32,
    get_data: unsafe extern "system" fn(*mut FileDataObject, *const FormatEtc, *mut StorageMedium) -> i32,
    get_data_here: unsafe extern "system" fn(*mut FileDataObject, *const FormatEtc, *mut StorageMedium) -> i32,
    query_get_data: unsafe extern "system" fn(*mut FileDataObject, *const FormatEtc) -> i32,
    get_canonical_format: unsafe extern "system" fn(*mut FileDataObject, *const FormatEtc, *mut FormatEtc) -> i32,
    set_data: unsafe extern "system" fn(*mut FileDataObject, *const FormatEtc, *const StorageMedium, i32) -> i32,
    enum_format: unsafe extern "system" fn(*mut FileDataObject, u32, *mut *mut c_void) -> i32,
    advise: unsafe extern "system" fn(*mut FileDataObject, *const FormatEtc, u32, *mut c_void, *mut u32) -> i32,
    unadvise: unsafe extern "system" fn(*mut FileDataObject, u32) -> i32,
    enum_advise: unsafe extern "system" fn(*mut FileDataObject, *mut *mut c_void) -> i32,
}

#[repr(C)]
struct FileDataObject {
    vtable: &'static FileDataObjectVTable,
    references: AtomicU32,
    files: Vec<u16>,
}

unsafe extern "system" fn file_data_query_interface(
    this: *mut FileDataObject, iid: *const Guid, output: *mut *mut c_void,
) -> i32 {
    if this.is_null() || iid.is_null() || output.is_null() { return E_INVALIDARG; }
    unsafe { *output = null_mut() };
    if unsafe { *iid } != IID_IUNKNOWN && unsafe { *iid } != IID_IDATA_OBJECT {
        return E_NOINTERFACE;
    }
    unsafe { *output = this.cast() };
    unsafe { file_data_add_ref(this) };
    S_OK
}

unsafe extern "system" fn file_data_add_ref(this: *mut FileDataObject) -> u32 {
    unsafe { (*this).references.fetch_add(1, Ordering::Relaxed) + 1 }
}

unsafe extern "system" fn file_data_release(this: *mut FileDataObject) -> u32 {
    let remaining = unsafe { (*this).references.fetch_sub(1, Ordering::AcqRel) - 1 };
    if remaining == 0 { unsafe { drop(Box::from_raw(this)) }; }
    remaining
}

fn supports_file_drop_format(format: *const FormatEtc) -> bool {
    !format.is_null() && unsafe {
        (*format).format == 15
            && (*format).aspect == 1
            && (*format).index == -1
            && (*format).medium & 1 != 0
    }
}

unsafe extern "system" fn file_data_query_get_data(
    _this: *mut FileDataObject, format: *const FormatEtc,
) -> i32 {
    if supports_file_drop_format(format) { S_OK } else { DV_E_FORMATETC }
}

unsafe extern "system" fn file_data_get_data(
    this: *mut FileDataObject, format: *const FormatEtc, output: *mut StorageMedium,
) -> i32 {
    if this.is_null() || output.is_null() { return E_INVALIDARG; }
    if !supports_file_drop_format(format) { return DV_E_FORMATETC; }
    let files = unsafe { &(*this).files };
    let Some(byte_length) = std::mem::size_of::<DropFiles>().checked_add(files.len() * 2) else {
        return E_INVALIDARG;
    };
    let memory = unsafe { GlobalAlloc(0x0042, byte_length) };
    if memory.is_null() { return 0x8007000eu32 as i32; }
    let data = unsafe { GlobalLock(memory) };
    if data.is_null() {
        unsafe { GlobalFree(memory) };
        return 0x8007000eu32 as i32;
    }
    unsafe {
        (data as *mut DropFiles).write(DropFiles {
            offset: std::mem::size_of::<DropFiles>() as u32,
            point: Point { x: 0, y: 0 },
            non_client: 0,
            wide: 1,
        });
        std::ptr::copy_nonoverlapping(
            files.as_ptr(), data.byte_add(std::mem::size_of::<DropFiles>()).cast(), files.len(),
        );
        GlobalUnlock(memory);
        output.write(StorageMedium { medium: 1, value: memory, release: null_mut() });
    }
    S_OK
}

unsafe extern "system" fn file_data_get_data_here(
    _this: *mut FileDataObject, _format: *const FormatEtc, _output: *mut StorageMedium,
) -> i32 { E_NOTIMPL }
unsafe extern "system" fn file_data_get_canonical(
    _this: *mut FileDataObject, _input: *const FormatEtc, _output: *mut FormatEtc,
) -> i32 { E_NOTIMPL }
unsafe extern "system" fn file_data_set_data(
    _this: *mut FileDataObject, _format: *const FormatEtc, _medium: *const StorageMedium, _release: i32,
) -> i32 { E_NOTIMPL }
unsafe extern "system" fn file_data_enum_format(
    _this: *mut FileDataObject, _direction: u32, output: *mut *mut c_void,
) -> i32 {
    if !output.is_null() { unsafe { *output = null_mut() }; }
    E_NOTIMPL
}
unsafe extern "system" fn file_data_advise(
    _this: *mut FileDataObject, _format: *const FormatEtc, _flags: u32,
    _sink: *mut c_void, _connection: *mut u32,
) -> i32 { OLE_E_ADVISENOTSUPPORTED }
unsafe extern "system" fn file_data_unadvise(_this: *mut FileDataObject, _connection: u32) -> i32 {
    OLE_E_ADVISENOTSUPPORTED
}
unsafe extern "system" fn file_data_enum_advise(
    _this: *mut FileDataObject, output: *mut *mut c_void,
) -> i32 {
    if !output.is_null() { unsafe { *output = null_mut() }; }
    OLE_E_ADVISENOTSUPPORTED
}

static FILE_DATA_VTABLE: FileDataObjectVTable = FileDataObjectVTable {
    query_interface: file_data_query_interface,
    add_ref: file_data_add_ref,
    release: file_data_release,
    get_data: file_data_get_data,
    get_data_here: file_data_get_data_here,
    query_get_data: file_data_query_get_data,
    get_canonical_format: file_data_get_canonical,
    set_data: file_data_set_data,
    enum_format: file_data_enum_format,
    advise: file_data_advise,
    unadvise: file_data_unadvise,
    enum_advise: file_data_enum_advise,
};

unsafe fn wide_argument(pointer: *const u16, length: u64, maximum: usize) -> Result<Vec<u16>, i32> {
    if length > maximum as u64 || (length > 0 && pointer.is_null()) { return Err(-1); }
    let mut value = if length == 0 {
        Vec::new()
    } else {
        unsafe { std::slice::from_raw_parts(pointer, length as usize) }.to_vec()
    };
    if value.contains(&0) { return Err(-2); }
    value.push(0);
    Ok(value)
}

fn validate_drag_paths(paths: &[u16]) -> bool {
    if paths.len() < 3 || !paths.ends_with(&[0, 0]) { return false; }
    let mut count = 0;
    for path in paths[..paths.len() - 2].split(|unit| *unit == 0) {
        if path.is_empty() || path.len() > MAX_FILE_PATH_UNITS as usize { return false; }
        let Ok(path) = String::from_utf16(path) else { return false; };
        let path = PathBuf::from(path);
        if !path.is_absolute() || !path.exists() { return false; }
        count += 1;
    }
    count > 0 && count <= MAX_FILE_DROP_PATHS
}

fn next_job_id() -> Option<u64> {
    NEXT_JOB_ID
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |id| id.checked_add(1))
        .ok()
}

fn job_event(
    job_id: u64,
    job_kind: u32,
    event_kind: u32,
    code: i32,
    completed: u64,
    total: u64,
    data: Vec<u8>,
) -> QueuedJobEvent {
    QueuedJobEvent {
        meta: JobEventMeta {
            job_id,
            event_kind,
            job_kind,
            code,
            reserved: 0,
            completed,
            total,
            data_length: data.len() as u64,
        },
        data,
    }
}

fn push_immediate_job_error(
    state: &mut JobState, job_id: u64, job_kind: u32, code: i32, message: String,
) {
    let data = message.into_bytes();
    state.queued_bytes = state.queued_bytes.saturating_add(data.len());
    state.events.push_back(job_event(job_id, job_kind, JOB_ERROR, code, 0, 0, data));
}

fn report_job_progress(job_id: u64, job_kind: u32, completed: u64, total: u64) {
    let mut state = jobs().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(control) = state.active.get(&job_id) else { return; };
    if !state.accepting
        || control.cancel.load(Ordering::Acquire)
        || control.terminal.load(Ordering::Acquire)
    {
        return;
    }
    if let Some(progress) = state.events.iter_mut().find(|event| {
        event.meta.job_id == job_id && event.meta.event_kind == JOB_PROGRESS
    }) {
        progress.meta.completed = completed;
        progress.meta.total = total;
        return;
    }
    if state.events.len().saturating_add(state.active.len()) < MAX_JOB_EVENTS {
        state.events.push_back(job_event(
            job_id, job_kind, JOB_PROGRESS, 0, completed, total, Vec::new(),
        ));
    }
}

fn finish_job(
    job_id: u64,
    job_kind: u32,
    mut event_kind: u32,
    mut code: i32,
    completed: u64,
    total: u64,
    mut data: Vec<u8>,
) {
    let mut state = jobs().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(control) = state.active.get(&job_id).cloned() else { return; };
    if control.terminal.swap(true, Ordering::AcqRel) { return; }
    state.active.remove(&job_id);
    if !state.accepting { return; }
    if control.cancel.load(Ordering::Acquire) {
        event_kind = JOB_CANCELLED;
        code = 0;
        data = b"job cancelled".to_vec();
    } else if data.len() > MAX_JOB_RESULT_BYTES {
        event_kind = JOB_ERROR;
        code = 5;
        data = b"job result exceeds 64 MiB".to_vec();
    }
    let mut index = 0;
    while index < state.events.len() {
        if state.events[index].meta.job_id == job_id
            && state.events[index].meta.event_kind == JOB_PROGRESS
        {
            if let Some(removed) = state.events.remove(index) {
                state.queued_bytes = state.queued_bytes.saturating_sub(removed.data.len());
            }
        } else {
            index += 1;
        }
    }
    if state.queued_bytes.saturating_add(data.len()) > MAX_QUEUED_JOB_BYTES {
        event_kind = JOB_ERROR;
        code = 7;
        data = b"job result queue exceeds 128 MiB".to_vec();
    }
    if state.events.len() >= MAX_JOB_EVENTS {
        if let Some(index) = state.events.iter().position(|event| {
            event.meta.event_kind == JOB_PROGRESS
        }) {
            if let Some(removed) = state.events.remove(index) {
                state.queued_bytes = state.queued_bytes.saturating_sub(removed.data.len());
            }
        } else {
            return;
        }
    }
    state.queued_bytes = state.queued_bytes.saturating_add(data.len());
    state.events.push_back(job_event(
        job_id, job_kind, event_kind, code, completed, total, data,
    ));
}

fn finish_job_error(job_id: u64, job_kind: u32, code: i32, message: String) {
    finish_job(job_id, job_kind, JOB_ERROR, code, 0, 0, message.into_bytes());
}

fn reap_job_workers() {
    let finished = {
        let mut state = jobs().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut finished = Vec::new();
        let mut index = 0;
        while index < state.workers.len() {
            if state.workers[index].is_finished() {
                finished.push(state.workers.swap_remove(index));
            } else {
                index += 1;
            }
        }
        finished
    };
    for worker in finished {
        let _ = worker.join();
    }
}

fn run_read_file(job_id: u64, control: Arc<JobControl>, path: PathBuf) {
    if control.cancel.load(Ordering::Acquire) {
        finish_job(job_id, 1, JOB_CANCELLED, 0, 0, 0, Vec::new());
        return;
    }
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) => {
            finish_job_error(job_id, 1, 4, format!("read_file open failed: {error}"));
            return;
        }
    };
    let total = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(error) => {
            finish_job_error(job_id, 1, 4, format!("read_file metadata failed: {error}"));
            return;
        }
    };
    if total > MAX_JOB_RESULT_BYTES as u64 {
        finish_job_error(job_id, 1, 5, "read_file result exceeds 64 MiB".to_string());
        return;
    }
    let mut data = Vec::new();
    if data.try_reserve_exact(total as usize).is_err() {
        finish_job_error(job_id, 1, 8, "read_file allocation failed".to_string());
        return;
    }
    report_job_progress(job_id, 1, 0, total);
    let mut chunk = [0u8; 64 * 1024];
    loop {
        if control.cancel.load(Ordering::Acquire) {
            finish_job(job_id, 1, JOB_CANCELLED, 0, data.len() as u64, total, Vec::new());
            return;
        }
        let read = match file.read(&mut chunk) {
            Ok(read) => read,
            Err(error) => {
                finish_job_error(job_id, 1, 4, format!("read_file read failed: {error}"));
                return;
            }
        };
        if read == 0 { break; }
        if data.len().saturating_add(read) > MAX_JOB_RESULT_BYTES {
            finish_job_error(job_id, 1, 5, "read_file grew beyond 64 MiB".to_string());
            return;
        }
        if data.try_reserve(read).is_err() {
            finish_job_error(job_id, 1, 8, "read_file allocation failed".to_string());
            return;
        }
        data.extend_from_slice(&chunk[..read]);
        report_job_progress(job_id, 1, data.len() as u64, total);
    }
    finish_job(job_id, 1, JOB_RESULT, 0, data.len() as u64, total, data);
}

fn run_scan_directory(job_id: u64, control: Arc<JobControl>, path: PathBuf) {
    if control.cancel.load(Ordering::Acquire) {
        finish_job(job_id, 2, JOB_CANCELLED, 0, 0, 0, Vec::new());
        return;
    }
    let entries = match std::fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) => {
            finish_job_error(job_id, 2, 4, format!("scan_directory open failed: {error}"));
            return;
        }
    };
    let mut data = Vec::new();
    if data.try_reserve(8).is_err() {
        finish_job_error(job_id, 2, 8, "scan_directory allocation failed".to_string());
        return;
    }
    data.extend_from_slice(b"SCN1");
    data.extend_from_slice(&0u32.to_le_bytes());
    let mut count = 0u32;
    for entry in entries {
        if control.cancel.load(Ordering::Acquire) {
            finish_job(job_id, 2, JOB_CANCELLED, 0, count as u64, 0, Vec::new());
            return;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                finish_job_error(job_id, 2, 4, format!("scan_directory entry failed: {error}"));
                return;
            }
        };
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                finish_job_error(job_id, 2, 4, format!("scan_directory type failed: {error}"));
                return;
            }
        };
        let entry_type = if file_type.is_file() {
            1
        } else if file_type.is_dir() {
            2
        } else if file_type.is_symlink() {
            3
        } else {
            0
        };
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let name = name.as_bytes();
        let Some(required) = 8usize.checked_add(name.len()) else {
            finish_job_error(job_id, 2, 5, "scan_directory record is too large".to_string());
            return;
        };
        if name.len() > u32::MAX as usize
            || data.len().saturating_add(required) > MAX_JOB_RESULT_BYTES
        {
            finish_job_error(job_id, 2, 5, "scan_directory result exceeds 64 MiB".to_string());
            return;
        }
        if data.try_reserve(required).is_err() {
            finish_job_error(job_id, 2, 8, "scan_directory allocation failed".to_string());
            return;
        }
        data.extend_from_slice(&(name.len() as u32).to_le_bytes());
        data.push(entry_type);
        data.extend_from_slice(&[0, 0, 0]);
        data.extend_from_slice(name);
        let Some(next_count) = count.checked_add(1) else {
            finish_job_error(job_id, 2, 5, "scan_directory has too many entries".to_string());
            return;
        };
        count = next_count;
        report_job_progress(job_id, 2, count as u64, 0);
    }
    data[4..8].copy_from_slice(&count.to_le_bytes());
    finish_job(job_id, 2, JOB_RESULT, 0, count as u64, count as u64, data);
}

fn run_job(job_id: u64, kind: u32, control: Arc<JobControl>, path: PathBuf) {
    match kind {
        1 => run_read_file(job_id, control, path),
        2 => run_scan_directory(job_id, control, path),
        _ => finish_job_error(job_id, kind, 1, "unsupported job kind".to_string()),
    }
}

fn signed_low_word(value: isize) -> i32 {
    value as u16 as i16 as i32
}

fn signed_high_word(value: isize) -> i32 {
    ((value as usize >> 16) as u16) as i16 as i32
}

fn mouse_buttons(w_param: usize) -> u32 {
    let keys = w_param as u16;
    (u32::from(keys & 0x0001 != 0))
        | (u32::from(keys & 0x0002 != 0) << 1)
        | (u32::from(keys & 0x0010 != 0) << 2)
        | (u32::from(keys & 0x0020 != 0) << 3)
        | (u32::from(keys & 0x0040 != 0) << 4)
}

fn input_modifiers() -> u32 {
    unsafe {
        (u32::from(GetKeyState(0x10) < 0))
            | (u32::from(GetKeyState(0x11) < 0) << 1)
            | (u32::from(GetKeyState(0x12) < 0) << 2)
            | (u32::from(GetKeyState(0x5b) < 0 || GetKeyState(0x5c) < 0) << 3)
    }
}

fn wheel_message_modifiers(w_param: usize, keyboard_modifiers: u32) -> u32 {
    let keys = w_param as u16;
    u32::from(keys & 0x0004 != 0)
        | (u32::from(keys & 0x0008 != 0) << 1)
        | (keyboard_modifiers & 0b1100)
}

fn mouse_button(message: u32, w_param: usize) -> i32 {
    match message {
        0x0201 | 0x0202 | 0x0203 => 0,
        0x0207 | 0x0208 | 0x0209 => 1,
        0x0204 | 0x0205 | 0x0206 => 2,
        0x020b | 0x020c | 0x020d => if (w_param >> 16) as u16 == 1 { 3 } else { 4 },
        _ => -1,
    }
}

fn cursor_handle(kind: u32) -> Handle {
    let id = match kind {
        0 => 32512,
        1 => 32649,
        2 => 32513,
        3 => 32515,
        4 => 32644,
        5 => 32645,
        6 => 32646,
        7 => 32648,
        8 => 32514,
        9 => 32642,
        _ => return null_mut(),
    };
    unsafe { LoadCursorW(null_mut(), id as usize as *const u16) }
}

unsafe fn attached_input_state(window: Handle) -> Option<*mut WindowInputState> {
    let mut data = 0usize;
    if unsafe {
        GetWindowSubclass(window, Some(input_subclass_proc), INPUT_SUBCLASS_ID, &mut data)
    } == 0 || data == 0 {
        None
    } else {
        Some(data as *mut WindowInputState)
    }
}

unsafe fn set_event_coordinates(
    window: Handle,
    event: &mut InputEvent,
    client: Point,
    screen: Option<Point>,
) {
    event.x = client.x;
    event.y = client.y;
    let convert = screen.is_none();
    let mut screen = screen.unwrap_or(client);
    if convert {
        unsafe { ClientToScreen(window, &mut screen) };
    }
    event.screen_x = screen.x;
    event.screen_y = screen.y;
}

unsafe fn queue_state_event(state: *mut WindowInputState, window: Handle, kind: u32) {
    let mut event = blank_input_event(unsafe { (*state).route_id }, kind);
    event.modifiers = input_modifiers();
    unsafe {
        set_event_coordinates(
            window,
            &mut event,
            Point { x: (*state).last_x, y: (*state).last_y },
            None,
        )
    };
    event.buttons = unsafe { (*state).buttons };
    push_input_event(event);
}

unsafe fn next_click_detail(
    state: *mut WindowInputState, button: i32, x: i32, y: i32, timestamp: u64,
) -> u32 {
    let within_time = timestamp.saturating_sub(unsafe { (*state).last_click_time })
        <= unsafe { GetDoubleClickTime() } as u64;
    let half_width = (unsafe { GetSystemMetrics(36) }.max(1) + 1) / 2;
    let half_height = (unsafe { GetSystemMetrics(37) }.max(1) + 1) / 2;
    let within_rect = x.abs_diff(unsafe { (*state).last_click_x }) <= half_width as u32
        && y.abs_diff(unsafe { (*state).last_click_y }) <= half_height as u32;
    let detail = if button == unsafe { (*state).last_click_button } && within_time && within_rect {
        unsafe { (*state).last_click_detail }.saturating_add(1)
    } else {
        1
    };
    unsafe {
        (*state).last_click_time = timestamp;
        (*state).last_click_x = x;
        (*state).last_click_y = y;
        (*state).last_click_button = button;
        (*state).last_click_detail = detail;
    }
    detail
}

unsafe fn cancel_pointer(state: *mut WindowInputState, window: Handle) {
    let should_cancel = unsafe { (*state).buttons != 0 || (*state).has_capture };
    unsafe { (*state).buttons = 0 };
    if should_cancel {
        unsafe { queue_state_event(state, window, INPUT_POINTER_CANCEL) };
    }
    if unsafe { GetCapture() } == window {
        unsafe { (*state).releasing_capture = true };
        unsafe { ReleaseCapture() };
        unsafe { (*state).releasing_capture = false };
    }
}

fn make_caret_rect(x: i32, y: i32, width: i32, height: i32) -> Option<Rect> {
    if width < 0 || height < 0 { return None; }
    Some(Rect {
        left: x,
        top: y,
        right: x.checked_add(width)?,
        bottom: y.checked_add(height)?,
    })
}

unsafe fn position_ime(window: Handle, state: *mut WindowInputState) -> i32 {
    let context = unsafe { ImmGetContext(window) };
    if context.is_null() { return -5; }
    let caret = unsafe { (*state).caret };
    let candidate = CandidateForm {
        index: 0,
        style: 0x0080,
        current_position: Point { x: caret.left, y: caret.bottom },
        area: caret,
    };
    let composition = CompositionForm {
        style: 0x0002,
        current_position: Point { x: caret.left, y: caret.top },
        area: caret,
    };
    let candidate_ok = unsafe { ImmSetCandidateWindow(context, &candidate) } != 0;
    let composition_ok = unsafe { ImmSetCompositionWindow(context, &composition) } != 0;
    unsafe { ImmReleaseContext(window, context) };
    if candidate_ok && composition_ok { 1 } else { 2 }
}

unsafe fn read_ime_string(context: Handle, index: u32) -> Result<Vec<u16>, ()> {
    let byte_length = unsafe { ImmGetCompositionStringW(context, index, null_mut(), 0) };
    if byte_length < 0 || byte_length as usize > MAX_TEXT_UNITS * 2 || byte_length % 2 != 0 {
        return Err(());
    }
    let unit_length = byte_length as usize / 2;
    let mut text = Vec::new();
    if text.try_reserve_exact(unit_length).is_err() { return Err(()); }
    text.resize(unit_length, 0);
    if text.is_empty() { return Ok(text); }
    let read = unsafe {
        ImmGetCompositionStringW(
            context,
            index,
            text.as_mut_ptr().cast(),
            byte_length as u32,
        )
    };
    if read < 0 || read % 2 != 0 || read > byte_length { return Err(()); }
    text.truncate(read as usize / 2);
    Ok(text)
}

unsafe fn handle_ime_composition(state: *mut WindowInputState, window: Handle, flags: u32) {
    let context = unsafe { ImmGetContext(window) };
    if context.is_null() {
        push_text_error(state, 1, "IMM context unavailable");
        return;
    }
    if flags & 0x0800 != 0 {
        unsafe { (*state).suppressed_result_chars.clear() };
        match unsafe { read_ime_string(context, 0x0800) } {
            Ok(result) => {
                if !result.is_empty() {
                    unsafe { (*state).suppressed_result_chars.extend(result.iter().copied()) };
                    push_text_event(state, TEXT_COMMIT, 0, 0, result);
                }
            }
            Err(()) => push_text_error(state, 2, "IMM result string read failed"),
        }
    }
    if flags & 0x0008 != 0 {
        match unsafe { read_ime_string(context, 0x0008) } {
            Ok(composition) => {
                let cursor = if flags & 0x0080 != 0 {
                    unsafe { ImmGetCompositionStringW(context, 0x0080, null_mut(), 0) }
                        .max(0) as u32
                } else {
                    0
                };
                push_text_event(state, TEXT_COMPOSITION_UPDATE, 0, cursor, composition);
            }
            Err(()) => push_text_error(state, 2, "IMM composition string read failed"),
        }
    }
    unsafe { ImmReleaseContext(window, context) };
}

unsafe fn handle_wm_char(state: *mut WindowInputState, unit: u16) {
    if unit < 0x20 || unit == 0x7f {
        unsafe { (*state).pending_high_surrogate = 0 };
        return;
    }
    if unsafe { (*state).suppressed_result_chars.front().copied() } == Some(unit) {
        unsafe { (*state).suppressed_result_chars.pop_front() };
        return;
    }
    unsafe { (*state).suppressed_result_chars.clear() };
    let pending = unsafe { (*state).pending_high_surrogate };
    if (0xd800..=0xdbff).contains(&unit) {
        if pending != 0 {
            push_text_event(state, TEXT_COMMIT, 0, 0, vec![0xfffd]);
        }
        unsafe { (*state).pending_high_surrogate = unit };
        return;
    }
    unsafe { (*state).pending_high_surrogate = 0 };
    let text = if (0xdc00..=0xdfff).contains(&unit) {
        if pending != 0 { vec![pending, unit] } else { vec![0xfffd] }
    } else if pending != 0 {
        vec![0xfffd, unit]
    } else {
        vec![unit]
    };
    push_text_event(state, TEXT_COMMIT, 0, 0, text);
}

unsafe fn stop_text_input(window: Handle, state: *mut WindowInputState) -> i32 {
    if !unsafe { (*state).text_active } { return 0; }
    let was_composing = unsafe { (*state).ime_composing };
    unsafe {
        (*state).text_active = false;
        (*state).ime_composing = false;
        (*state).pending_high_surrogate = 0;
        (*state).suppressed_result_chars.clear();
    }
    if !was_composing { return 1; }
    let context = unsafe { ImmGetContext(window) };
    if context.is_null() { return -5; }
    let cancelled = unsafe { ImmNotifyIME(context, 0x0015, 0x0004, 0) };
    unsafe { ImmReleaseContext(window, context) };
    push_text_event(state, TEXT_COMPOSITION_END, 0, 0, Vec::new());
    if cancelled == 0 { -6 } else { 1 }
}

unsafe extern "system" fn input_subclass_proc(
    window: Handle,
    message: u32,
    w_param: usize,
    l_param: isize,
    id: usize,
    data: usize,
) -> isize {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| unsafe {
        input_subclass_proc_inner(window, message, w_param, l_param, id, data)
    }))
    .unwrap_or_else(|_| unsafe { DefSubclassProc(window, message, w_param, l_param) })
}

unsafe fn input_subclass_proc_inner(
    window: Handle,
    message: u32,
    w_param: usize,
    l_param: isize,
    _id: usize,
    data: usize,
) -> isize {
    let state = data as *mut WindowInputState;
    if state.is_null() {
        return unsafe { DefSubclassProc(window, message, w_param, l_param) };
    }
    match message {
        0x0231 => set_window_resizing(window as usize, true),
        0x0232 => set_window_resizing(window as usize, false),
        0x0003 if unsafe { root_window(window) } == window => {
            unsafe { queue_state_event(state, window, INPUT_WINDOW_MOVE) };
        }
        0x0005 if unsafe { root_window(window) } == window => {
            unsafe { queue_state_event(state, window, INPUT_WINDOW_RESIZE) };
            let minimized = w_param == 1 || unsafe { IsIconic(window) } != 0;
            if minimized != unsafe { (*state).minimized } {
                unsafe { (*state).minimized = minimized };
                unsafe {
                    queue_state_event(
                        state,
                        window,
                        if minimized { INPUT_MINIMIZED } else { INPUT_RESTORED },
                    )
                };
            }
        }
        0x02e0 if unsafe { root_window(window) } == window => {
            unsafe { queue_state_event(state, window, INPUT_DPI_CHANGED) };
        }
        0x007e if unsafe { root_window(window) } == window => {
            unsafe { queue_state_event(state, window, INPUT_DISPLAY_CHANGED) };
        }
        0x0218 if unsafe { root_window(window) } == window => {
            let kind = match w_param {
                4 => Some(INPUT_SUSPEND),
                6 | 7 | 18 => Some(INPUT_RESUME),
                _ => None,
            };
            if let Some(kind) = kind {
                unsafe { queue_state_event(state, window, kind) };
            }
        }
        0x0200 => {
            let x = signed_low_word(l_param);
            let y = signed_high_word(l_param);
            let movement_x = if unsafe { (*state).last_position_valid } {
                x - unsafe { (*state).last_x }
            } else { 0 };
            let movement_y = if unsafe { (*state).last_position_valid } {
                y - unsafe { (*state).last_y }
            } else { 0 };
            unsafe {
                (*state).buttons = mouse_buttons(w_param);
                (*state).last_x = x;
                (*state).last_y = y;
                (*state).last_position_valid = true;
            }
            if !unsafe { (*state).tracking_leave } {
                unsafe { (*state).tracking_leave = true };
                let mut tracking = TrackMouseEventData {
                    size: std::mem::size_of::<TrackMouseEventData>() as u32,
                    flags: 2,
                    window,
                    hover_time: 0,
                };
                unsafe { TrackMouseEvent(&mut tracking) };
                unsafe { queue_state_event(state, window, INPUT_POINTER_ENTER) };
            }
            let mut event = blank_input_event(unsafe { (*state).route_id }, INPUT_POINTER_MOVE);
            event.modifiers = input_modifiers();
            unsafe { set_event_coordinates(window, &mut event, Point { x, y }, None) };
            event.movement_x = movement_x;
            event.movement_y = movement_y;
            event.buttons = unsafe { (*state).buttons };
            push_input_event(event);
        }
        0x0201 | 0x0203 | 0x0204 | 0x0206 | 0x0207 | 0x0209 | 0x020b | 0x020d => {
            let x = signed_low_word(l_param);
            let y = signed_high_word(l_param);
            let button = mouse_button(message, w_param);
            unsafe {
                (*state).buttons = mouse_buttons(w_param);
                (*state).last_x = x;
                (*state).last_y = y;
                (*state).last_position_valid = true;
            }
            let mut event = blank_input_event(unsafe { (*state).route_id }, INPUT_POINTER_DOWN);
            event.modifiers = input_modifiers();
            unsafe { set_event_coordinates(window, &mut event, Point { x, y }, None) };
            event.button = button;
            event.buttons = unsafe { (*state).buttons };
            event.detail = unsafe { next_click_detail(state, button, x, y, event.timestamp) };
            push_input_event(event);
            if matches!(message, 0x020b | 0x020d) { return 1; }
        }
        0x0202 | 0x0205 | 0x0208 | 0x020c => {
            let x = signed_low_word(l_param);
            let y = signed_high_word(l_param);
            let button = mouse_button(message, w_param);
            unsafe {
                (*state).buttons = mouse_buttons(w_param);
                (*state).last_x = x;
                (*state).last_y = y;
                (*state).last_position_valid = true;
            }
            let mut event = blank_input_event(unsafe { (*state).route_id }, INPUT_POINTER_UP);
            event.modifiers = input_modifiers();
            unsafe { set_event_coordinates(window, &mut event, Point { x, y }, None) };
            event.button = button;
            event.buttons = unsafe { (*state).buttons };
            if button == unsafe { (*state).last_click_button } {
                event.detail = unsafe { (*state).last_click_detail };
            }
            push_input_event(event);
            if message == 0x020c { return 1; }
        }
        0x020a | 0x020e => {
            let screen = Point { x: signed_low_word(l_param), y: signed_high_word(l_param) };
            let mut point = screen;
            if unsafe { ScreenToClient(window, &mut point) } == 0
                && unsafe { (*state).last_position_valid }
            {
                point.x = unsafe { (*state).last_x };
                point.y = unsafe { (*state).last_y };
            }
            unsafe { (*state).buttons = mouse_buttons(w_param) };
            let delta = signed_high_word(w_param as isize);
            let mut event = blank_input_event(unsafe { (*state).route_id }, INPUT_WHEEL);
            event.modifiers = wheel_message_modifiers(w_param, input_modifiers());
            unsafe { set_event_coordinates(window, &mut event, point, Some(screen)) };
            event.buttons = unsafe { (*state).buttons };
            if message == 0x020a { event.wheel_y = delta; } else { event.wheel_x = delta; }
            event.delta_mode = 0;
            push_input_event(event);
            return 0;
        }
        0x02a3 => {
            unsafe { (*state).tracking_leave = false };
            unsafe { queue_state_event(state, window, INPUT_POINTER_LEAVE) };
        }
        0x0215 => {
            let had_capture = unsafe { (*state).has_capture };
            let intentional = unsafe { (*state).releasing_capture };
            unsafe { (*state).has_capture = false };
            if !intentional && unsafe { (*state).buttons != 0 } {
                unsafe { (*state).buttons = 0 };
                unsafe { queue_state_event(state, window, INPUT_POINTER_CANCEL) };
            }
            if had_capture {
                unsafe { queue_state_event(state, window, INPUT_CAPTURE_LOST) };
            }
        }
        0x0233 => {
            unsafe { queue_file_drop(state, window, w_param as Handle) };
            return 0;
        }
        0x010d => {
            if unsafe { (*state).text_active && !(*state).ime_composing } {
                unsafe { (*state).ime_composing = true };
                push_text_event(state, TEXT_COMPOSITION_START, 0, 0, Vec::new());
                match unsafe { position_ime(window, state) } {
                    2 => push_text_error(state, 3, "IMM caret positioning failed"),
                    -5 => push_text_error(state, 1, "IMM context unavailable"),
                    _ => {}
                }
            }
        }
        0x010f => {
            if unsafe { (*state).text_active } {
                unsafe { handle_ime_composition(state, window, l_param as u32) };
            }
        }
        0x010e => {
            if unsafe { (*state).text_active && (*state).ime_composing } {
                unsafe { (*state).ime_composing = false };
                push_text_event(state, TEXT_COMPOSITION_END, 0, 0, Vec::new());
            }
        }
        0x0102 => {
            if unsafe { (*state).text_active } {
                unsafe { handle_wm_char(state, w_param as u16) };
            }
        }
        0x001f => unsafe { cancel_pointer(state, window) },
        0x0008 => {
            unsafe { stop_text_input(window, state) };
            unsafe { cancel_pointer(state, window) };
            unsafe { queue_state_event(state, window, INPUT_BLUR) };
        }
        0x0007 => unsafe { queue_state_event(state, window, INPUT_FOCUS) },
        0x0100 | 0x0104 | 0x0101 | 0x0105 => {
            let is_down = matches!(message, 0x0100 | 0x0104);
            if is_down
                && unsafe { (*state).text_active && !(*state).ime_composing }
            {
                unsafe { (*state).suppressed_result_chars.clear() };
            }
            let mut event = blank_input_event(
                unsafe { (*state).route_id },
                if is_down { INPUT_KEY_DOWN } else { INPUT_KEY_UP },
            );
            event.modifiers = input_modifiers()
                | (u32::from(unsafe { (*state).ime_composing }) << 4);
            event.key_code = w_param as u32;
            event.scan_code = ((l_param as u64 >> 16) & 0x1ff) as u32;
            event.repeat = u32::from(is_down && (l_param as u64 & (1 << 30)) != 0);
            push_input_event(event);
        }
        0x0020 => {
            if l_param as u16 == 1 && !unsafe { (*state).cursor }.is_null() {
                unsafe { SetCursor((*state).cursor) };
                return 1;
            }
        }
        0x0082 => {
            let route_id = unsafe { (*state).route_id };
            set_window_resizing(window as usize, false);
            unsafe { stop_text_input(window, state) };
            unsafe { RemoveWindowSubclass(window, Some(input_subclass_proc), INPUT_SUBCLASS_ID) };
            let result = unsafe { DefSubclassProc(window, message, w_param, l_param) };
            purge_input_events(route_id);
            purge_text_events(route_id);
            unsafe { drop(Box::from_raw(state)) };
            return result;
        }
        _ => {}
    }
    unsafe { DefSubclassProc(window, message, w_param, l_param) }
}

fn input_window_error(window: Handle) -> i32 {
    if window.is_null() || unsafe { IsWindow(window) } == 0 {
        -1
    } else if unsafe { GetWindowThreadProcessId(window, null_mut()) } != unsafe { GetCurrentThreadId() } {
        -2
    } else {
        0
    }
}

unsafe fn root_window(window: Handle) -> Handle {
    let root = unsafe { GetAncestor(window, 2) };
    if root.is_null() { window } else { root }
}

unsafe fn get_window_snapshot_inner(window: Handle, output: *mut WindowSnapshot) -> i32 {
    let window = unsafe { root_window(window) };
    let mut client = Rect { left: 0, top: 0, right: 0, bottom: 0 };
    let mut frame = client;
    if unsafe { GetClientRect(window, &mut client) } == 0 { return -4; }
    if unsafe { GetWindowRect(window, &mut frame) } == 0 { return -5; }
    let dpi = unsafe { GetDpiForWindow(window) };
    if dpi == 0 { return -6; }
    let monitor = unsafe { MonitorFromWindow(window, 2) };
    if monitor.is_null() { return -7; }
    let flags = u32::from(unsafe { IsIconic(window) } != 0)
        | (u32::from(unsafe { IsZoomed(window) } != 0) << 1)
        | (u32::from(unsafe { GetForegroundWindow() } == window) << 2);
    unsafe {
        output.write(WindowSnapshot {
            client_width: client.right.saturating_sub(client.left),
            client_height: client.bottom.saturating_sub(client.top),
            frame_x: frame.left,
            frame_y: frame.top,
            frame_width: frame.right.saturating_sub(frame.left),
            frame_height: frame.bottom.saturating_sub(frame.top),
            dpi,
            flags,
            scale_factor: scale_factor_from_dpi(dpi),
            display_id: monitor as usize as u64,
        })
    };
    1
}

unsafe fn get_mouse_capture_inner(window: Handle) -> i32 {
    i32::from(unsafe { GetCapture() } == window)
}

unsafe fn get_cursor_inner(window: Handle) -> i32 {
    let Some(state) = (unsafe { attached_input_state(window) }) else { return -3; };
    unsafe { (*state).cursor_kind as i32 }
}

unsafe fn convert_point_inner(
    window: Handle,
    x: i32,
    y: i32,
    to_screen: bool,
    output: *mut Point,
) -> i32 {
    let mut point = Point { x, y };
    let converted = if to_screen {
        unsafe { ClientToScreen(window, &mut point) }
    } else {
        unsafe { ScreenToClient(window, &mut point) }
    };
    if converted == 0 { return -4; }
    unsafe { output.write(point) };
    1
}

unsafe fn convert_point(
    window: Handle,
    x: i32,
    y: i32,
    to_screen: bool,
    output: *mut Point,
) -> i32 {
    if output.is_null() || (output as usize) % std::mem::align_of::<Point>() != 0 {
        return -3;
    }
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window,
            if to_screen { OWNER_CLIENT_TO_SCREEN } else { OWNER_SCREEN_TO_CLIENT },
            0,
            [x, y, 0, 0],
            output.cast(),
        );
    }
    if error != 0 { return error; }
    unsafe { convert_point_inner(window, x, y, to_screen, output) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_client_to_screen(
    window: Handle,
    x: i32,
    y: i32,
    output: *mut Point,
) -> i32 {
    unsafe { convert_point(window, x, y, true, output) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_screen_to_client(
    window: Handle,
    x: i32,
    y: i32,
    output: *mut Point,
) -> i32 {
    unsafe { convert_point(window, x, y, false, output) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_get_window_snapshot(
    window: Handle,
    output: *mut WindowSnapshot,
) -> i32 {
    if output.is_null() || (output as usize) % std::mem::align_of::<WindowSnapshot>() != 0 {
        return -3;
    }
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window,
            OWNER_GET_WINDOW_SNAPSHOT,
            0,
            [0; 4],
            output.cast(),
        );
    }
    if error != 0 { return error; }
    unsafe { get_window_snapshot_inner(window, output) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_get_input_diagnostics(output: *mut InputDiagnostics) -> i32 {
    if output.is_null() || (output as usize) % std::mem::align_of::<InputDiagnostics>() != 0 {
        return -1;
    }
    let queued = input_events()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .len() as u64;
    unsafe {
        output.write(InputDiagnostics {
            queued,
            dropped: INPUT_DROPPED.load(Ordering::Relaxed),
            coalesced: INPUT_COALESCED.load(Ordering::Relaxed),
            duplicates: INPUT_DUPLICATES.load(Ordering::Relaxed),
        })
    };
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_register_input_wake(
    callback: Option<InputWakeCallback>,
    user_data: *mut c_void,
) -> i32 {
    if callback.is_none() { return -1; }
    {
        let mut registration = input_wake()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        registration.callback = callback;
        registration.user_data = user_data as usize;
    }
    let pending = !input_events()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .is_empty()
        || !text_events()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_empty()
        || !file_drop_events()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .is_empty();
    if pending { signal_input_wake(); }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn pixi_clear_input_wake() -> i32 {
    // The mutex serializes native callback entry with clear. The Bun host keeps its
    // threadsafe trampoline process-lived because queued JS delivery can outlive this call.
    let mut registration = input_wake()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    registration.callback = None;
    registration.user_data = 0;
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_has_mouse_capture(window: Handle) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(window, OWNER_GET_CAPTURE, 0, [0; 4], null_mut());
    }
    if error != 0 { return error; }
    unsafe { get_mouse_capture_inner(window) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_get_cursor(window: Handle) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(window, OWNER_GET_CURSOR, 0, [0; 4], null_mut());
    }
    if error != 0 { return error; }
    unsafe { get_cursor_inner(window) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_resolve_input_window(window: Handle) -> Handle {
    if window.is_null() || unsafe { IsWindow(window) } == 0 { return null_mut(); }
    unsafe { root_window(window) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_is_window_resizing(window: Handle) -> i32 {
    if window.is_null() || unsafe { IsWindow(window) } == 0 { return -1; }
    let root = unsafe { GetAncestor(window, 2) };
    let target = if root.is_null() { window } else { root };
    if window_is_resizing(target as usize) { 1 } else { 0 }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_attach_input(window: Handle, route_id: u64) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_ATTACH_INPUT, route_id, [0; 4], null_mut(),
        );
    }
    if error != 0 { return error; }
    if unsafe { attached_input_state(window) }.is_some() { return -3; }
    let state = Box::new(WindowInputState {
        route_id,
        last_x: 0,
        last_y: 0,
        last_position_valid: false,
        tracking_leave: false,
        buttons: 0,
        has_capture: unsafe { GetCapture() } == window,
        releasing_capture: false,
        cursor: cursor_handle(0),
        cursor_kind: 0,
        minimized: unsafe { IsIconic(window) } != 0,
        last_click_time: 0,
        last_click_x: 0,
        last_click_y: 0,
        last_click_button: -1,
        last_click_detail: 0,
        text_active: false,
        ime_composing: false,
        caret: Rect { left: 0, top: 0, right: 0, bottom: 0 },
        suppressed_result_chars: VecDeque::new(),
        pending_high_surrogate: 0,
    });
    let state = Box::into_raw(state);
    if unsafe {
        SetWindowSubclass(window, Some(input_subclass_proc), INPUT_SUBCLASS_ID, state as usize)
    } == 0 {
        unsafe { drop(Box::from_raw(state)) };
        return -4;
    }
    unsafe { DragAcceptFiles(window, 1) };
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_detach_input(window: Handle) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_DETACH_INPUT, 0, [0; 4], null_mut(),
        );
    }
    if error != 0 { return error; }
    let Some(state) = (unsafe { attached_input_state(window) }) else { return 0; };
    unsafe { DragAcceptFiles(window, 0) };
    unsafe { stop_text_input(window, state) };
    if unsafe { GetCapture() } == window && unsafe { ReleaseCapture() } == 0 {
        return -4;
    }
    if unsafe {
        RemoveWindowSubclass(window, Some(input_subclass_proc), INPUT_SUBCLASS_ID)
    } == 0 {
        return -3;
    }
    set_window_resizing(window as usize, false);
    let route_id = unsafe { (*state).route_id };
    purge_input_events(route_id);
    purge_text_events(route_id);
    purge_file_drop_events(route_id);
    unsafe { drop(Box::from_raw(state)) };
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_poll_input_event(output: *mut InputEvent) -> i32 {
    if output.is_null() || (output as usize) % std::mem::align_of::<InputEvent>() != 0 {
        return -1;
    }
    let Some(event) = input_events()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .pop_front() else { return 0; };
    unsafe { output.write(event) };
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_poll_file_drop(
    output: *mut FileDropMeta,
    paths_output: *mut u16,
    paths_capacity_utf16: u64,
) -> i32 {
    if output.is_null() || (output as usize) % std::mem::align_of::<FileDropMeta>() != 0 {
        return -1;
    }
    let mut events = file_drop_events().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(event) = events.front() else { return 0; };
    unsafe { output.write(event.meta) };
    if paths_capacity_utf16 < event.paths.len() as u64 { return -2; }
    if !event.paths.is_empty() {
        if paths_output.is_null() { return -1; }
        unsafe { std::ptr::copy_nonoverlapping(event.paths.as_ptr(), paths_output, event.paths.len()) };
    }
    events.pop_front();
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_save_file_dialog(
    default_name: *const u16,
    default_name_length: u64,
    starting_folder: *const u16,
    starting_folder_length: u64,
    filter: *const u16,
    filter_length: u64,
    output: *mut u16,
    output_capacity: u64,
) -> i32 {
    if output.is_null() || output_capacity < 2 || output_capacity > MAX_FILE_PATH_UNITS as u64 {
        return -1;
    }
    let default_name = match unsafe {
        wide_argument(default_name, default_name_length, MAX_FILE_PATH_UNITS as usize - 1)
    } {
        Ok(value) => value,
        Err(code) => return code,
    };
    let starting_folder = match unsafe {
        wide_argument(starting_folder, starting_folder_length, MAX_FILE_PATH_UNITS as usize - 1)
    } {
        Ok(value) => value,
        Err(code) => return code,
    };
    if filter_length < 2 || filter_length > 65535 || filter.is_null() { return -3; }
    let filter = unsafe { std::slice::from_raw_parts(filter, filter_length as usize) };
    if !filter.ends_with(&[0, 0]) { return -3; }
    let output = unsafe { std::slice::from_raw_parts_mut(output, output_capacity as usize) };
    output.fill(0);
    if default_name.len() > output.len() { return -4; }
    output[..default_name.len()].copy_from_slice(&default_name);
    let mut options = OpenFileNameW {
        size: std::mem::size_of::<OpenFileNameW>() as u32,
        owner: unsafe { GetForegroundWindow() },
        instance: null_mut(),
        filter: filter.as_ptr(),
        custom_filter: null_mut(),
        max_custom_filter: 0,
        filter_index: 1,
        file: output.as_mut_ptr(),
        max_file: output.len() as u32,
        file_title: null_mut(),
        max_file_title: 0,
        initial_directory: if starting_folder.len() > 1 { starting_folder.as_ptr() } else { null() },
        title: null(),
        flags: 0x0008 | 0x0002 | 0x0800 | 0x00080000 | 0x00800000,
        file_offset: 0,
        file_extension: 0,
        default_extension: null(),
        custom_data: 0,
        hook: null_mut(),
        template_name: null(),
        reserved: null_mut(),
        reserved_flags: 0,
        extended_flags: 0,
    };
    if unsafe { GetSaveFileNameW(&mut options) } == 0 {
        let error = unsafe { CommDlgExtendedError() };
        return if error == 0 { 0 } else { -(error.min(i32::MAX as u32) as i32) };
    }
    output.iter().position(|unit| *unit == 0).map(|length| length as i32).unwrap_or(-5)
}

unsafe fn drag_out_inner(window: Handle, paths: Vec<u16>) -> i32 {
    let initialized = unsafe { OleInitialize(null_mut()) };
    if initialized < 0 { return initialized; }
    let object = Box::into_raw(Box::new(FileDataObject {
        vtable: &FILE_DATA_VTABLE,
        references: AtomicU32::new(1),
        files: paths,
    }));
    let source = Box::into_raw(Box::new(FileDropSource {
        vtable: &FILE_DROP_SOURCE_VTABLE,
        references: AtomicU32::new(1),
    }));
    let mut effect = 0u32;
    let status = unsafe { SHDoDragDrop(window, object.cast(), source.cast(), 1 | 2, &mut effect) };
    unsafe {
        file_data_release(object);
        file_drop_source_release(source);
        OleUninitialize();
    }
    if status == DRAGDROP_S_DROP { effect as i32 }
    else if status == DRAGDROP_S_CANCEL { 0 }
    else if status < 0 { status }
    else { effect as i32 }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_drag_out(
    window: Handle, paths: *const u16, paths_length: u64,
) -> i32 {
    if paths.is_null() || paths_length < 3 || paths_length > MAX_FILE_DROP_UNITS as u64 {
        return -1;
    }
    let mut paths = unsafe { std::slice::from_raw_parts(paths, paths_length as usize) }.to_vec();
    if !validate_drag_paths(&paths) { return -2; }
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_DRAG_OUT, 0, [0; 4], (&mut paths as *mut Vec<u16>).cast(),
        );
    }
    if error != 0 { return error; }
    unsafe { drag_out_inner(window, paths) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_set_mouse_capture(window: Handle) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_SET_CAPTURE, 0, [0; 4], null_mut(),
        );
    }
    if error != 0 { return error; }
    let Some(state) = (unsafe { attached_input_state(window) }) else { return -3; };
    unsafe { SetCapture(window) };
    if unsafe { GetCapture() } != window { return -4; }
    if !unsafe { (*state).has_capture } {
        unsafe { (*state).has_capture = true };
        unsafe { queue_state_event(state, window, INPUT_CAPTURE_GAINED) };
    }
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_release_mouse_capture(window: Handle) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_RELEASE_CAPTURE, 0, [0; 4], null_mut(),
        );
    }
    if error != 0 { return error; }
    let Some(state) = (unsafe { attached_input_state(window) }) else { return -3; };
    if unsafe { GetCapture() } != window { return 0; }
    unsafe { (*state).releasing_capture = true };
    let released = unsafe { ReleaseCapture() };
    unsafe { (*state).releasing_capture = false };
    if released == 0 { return -4; }
    if unsafe { (*state).has_capture } {
        unsafe { (*state).has_capture = false };
        unsafe { queue_state_event(state, window, INPUT_CAPTURE_LOST) };
    }
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_set_cursor(window: Handle, kind: u32) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_SET_CURSOR, kind as u64, [0; 4], null_mut(),
        );
    }
    if error != 0 { return error; }
    let Some(state) = (unsafe { attached_input_state(window) }) else { return -3; };
    if kind > 9 { return -4; }
    let cursor = cursor_handle(kind);
    if cursor.is_null() { return -5; }
    unsafe {
        (*state).cursor = cursor;
        (*state).cursor_kind = kind;
        SetCursor(cursor);
    }
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_begin_text_input(
    window: Handle, x: i32, y: i32, width: i32, height: i32,
) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_BEGIN_TEXT, 0, [x, y, width, height], null_mut(),
        );
    }
    if error != 0 { return error; }
    let Some(state) = (unsafe { attached_input_state(window) }) else { return -3; };
    let Some(caret) = make_caret_rect(x, y, width, height) else { return -4; };
    unsafe { (*state).caret = caret };
    if unsafe { (*state).text_active } {
        return unsafe { pixi_update_caret_rect(window, x, y, width, height) };
    }
    let positioned = unsafe { position_ime(window, state) };
    if positioned < 0 { return positioned; }
    let route_id = unsafe { (*state).route_id };
    purge_text_events(route_id);
    unsafe {
        (*state).text_active = true;
        (*state).ime_composing = false;
        (*state).pending_high_surrogate = 0;
        (*state).suppressed_result_chars.clear();
    }
    if positioned == 2 {
        push_text_error(state, 3, "IMM caret positioning failed");
    }
    positioned
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_update_caret_rect(
    window: Handle, x: i32, y: i32, width: i32, height: i32,
) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_UPDATE_CARET, 0, [x, y, width, height], null_mut(),
        );
    }
    if error != 0 { return error; }
    let Some(state) = (unsafe { attached_input_state(window) }) else { return -3; };
    if !unsafe { (*state).text_active } { return -4; }
    let Some(caret) = make_caret_rect(x, y, width, height) else { return -4; };
    unsafe { (*state).caret = caret };
    let positioned = unsafe { position_ime(window, state) };
    match positioned {
        2 => push_text_error(state, 3, "IMM caret positioning failed"),
        -5 => push_text_error(state, 1, "IMM context unavailable"),
        _ => {}
    }
    positioned
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_end_text_input(window: Handle) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_END_TEXT, 0, [0; 4], null_mut(),
        );
    }
    if error != 0 { return error; }
    let Some(state) = (unsafe { attached_input_state(window) }) else { return -3; };
    unsafe { stop_text_input(window, state) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_poll_text_event(
    output: *mut TextEventMeta,
    text_output: *mut u16,
    text_capacity_utf16: u64,
) -> i32 {
    if output.is_null() || (output as usize) % std::mem::align_of::<TextEventMeta>() != 0 {
        return -1;
    }
    let mut events = text_events().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(event) = events.front() else { return 0; };
    unsafe { output.write(event.meta) };
    if text_capacity_utf16 < event.text.len() as u64 { return -2; }
    if !event.text.is_empty()
        && (text_output.is_null() || (text_output as usize) % std::mem::align_of::<u16>() != 0)
    {
        return -3;
    }
    let Some(event) = events.pop_front() else { return 0; };
    if !event.text.is_empty() {
        unsafe {
            std::ptr::copy_nonoverlapping(event.text.as_ptr(), text_output, event.text.len())
        };
    }
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_attach_accessibility(window: Handle, route_id: u64) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_ATTACH_ACCESSIBILITY, route_id, [0; 4], null_mut(),
        );
    }
    if error != 0 { return error; }
    if unsafe { attached_accessibility_state(window) }.is_some() { return -3; }
    let state = Box::into_raw(Box::new(AccessibilityState {
        route_id,
        snapshot: Vec::new(),
    }));
    if unsafe {
        SetWindowSubclass(
            window,
            Some(accessibility_subclass_proc),
            ACCESSIBILITY_SUBCLASS_ID,
            state as usize,
        )
    } == 0 {
        unsafe { drop(Box::from_raw(state)) };
        return -4;
    }
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_update_accessibility_snapshot(
    window: Handle,
    snapshot: *const u8,
    snapshot_length: u64,
) -> i32 {
    let error = input_window_error(window);
    if error != 0 && error != -2 { return error; }
    if snapshot.is_null() || snapshot_length > MAX_ACCESSIBILITY_SNAPSHOT_BYTES {
        return -4;
    }
    let snapshot = unsafe { std::slice::from_raw_parts(snapshot, snapshot_length as usize) };
    if let Err(code) = validate_accessibility_snapshot(snapshot) { return code; }
    let mut owned = Vec::new();
    if owned.try_reserve_exact(snapshot.len()).is_err() { return -6; }
    owned.extend_from_slice(snapshot);
    if error == -2 {
        return run_on_window_thread(
            window,
            OWNER_UPDATE_ACCESSIBILITY,
            0,
            [0; 4],
            (&mut owned as *mut Vec<u8>).cast(),
        );
    }
    unsafe { update_accessibility_snapshot_owned(window, owned) }
}

unsafe fn update_accessibility_snapshot_owned(window: Handle, owned: Vec<u8>) -> i32 {
    let Some(state) = (unsafe { attached_accessibility_state(window) }) else { return -3; };
    unsafe { (*state).snapshot = owned };
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_poll_accessibility_action(
    output: *mut AccessibilityActionMeta,
    data_output: *mut u8,
    data_capacity: u64,
) -> i32 {
    if output.is_null()
        || (output as usize) % std::mem::align_of::<AccessibilityActionMeta>() != 0
    {
        return -1;
    }
    let action = {
        let mut actions = accessibility_actions()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(action) = actions.front() else { return 0; };
        unsafe { output.write(action.meta) };
        if data_capacity < action.data.len() as u64 { return -2; }
        if !action.data.is_empty() && data_output.is_null() { return -3; }
        let Some(action) = actions.pop_front() else { return 0; };
        action
    };
    if !action.data.is_empty() {
        unsafe {
            std::ptr::copy_nonoverlapping(action.data.as_ptr(), data_output, action.data.len())
        };
    }
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_detach_accessibility(window: Handle) -> i32 {
    let error = input_window_error(window);
    if error == -2 {
        return run_on_window_thread(
            window, OWNER_DETACH_ACCESSIBILITY, 0, [0; 4], null_mut(),
        );
    }
    if error != 0 { return error; }
    let Some(state) = (unsafe { attached_accessibility_state(window) }) else { return 0; };
    if unsafe {
        RemoveWindowSubclass(
            window,
            Some(accessibility_subclass_proc),
            ACCESSIBILITY_SUBCLASS_ID,
        )
    } == 0 {
        return -3;
    }
    let route_id = unsafe { (*state).route_id };
    purge_accessibility_actions(route_id);
    unsafe { drop(Box::from_raw(state)) };
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_start_job(
    kind: u32,
    request: *const u8,
    request_length: u64,
) -> u64 {
    if request_length > MAX_JOB_REQUEST_BYTES || (request_length > 0 && request.is_null()) {
        return 0;
    }
    let mut request_bytes = Vec::new();
    if request_bytes.try_reserve_exact(request_length as usize).is_err() { return 0; }
    if request_length > 0 {
        request_bytes.extend_from_slice(unsafe {
            std::slice::from_raw_parts(request, request_length as usize)
        });
    }
    let path = if !matches!(kind, 1 | 2) {
        Err((1, "unsupported job kind".to_string()))
    } else {
        match String::from_utf8(request_bytes) {
            Ok(path) if !path.is_empty() => Ok(PathBuf::from(path)),
            Ok(_) => Err((3, "job path is empty".to_string())),
            Err(_) => Err((2, "job path is not valid UTF-8".to_string())),
        }
    };
    reap_job_workers();
    let mut state = jobs().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if !state.accepting { return 0; }
    let path = match path {
        Ok(path) => path,
        Err((code, message)) => {
            if state.events.len() >= MAX_JOB_EVENTS - MAX_ACTIVE_JOBS { return 0; }
            let Some(job_id) = next_job_id() else { return 0; };
            push_immediate_job_error(&mut state, job_id, kind, code, message);
            return job_id;
        }
    };
    if state.active.len() >= MAX_ACTIVE_JOBS
        || state.events.len().saturating_add(state.active.len()) >= MAX_JOB_EVENTS
    {
        return 0;
    }
    let Some(job_id) = next_job_id() else { return 0; };
    let control = Arc::new(JobControl {
        cancel: AtomicBool::new(false),
        terminal: AtomicBool::new(false),
    });
    state.active.insert(job_id, control.clone());
    let panic_control = control.clone();
    match std::thread::Builder::new()
        .name(format!("pixi-job-{job_id}"))
        .spawn(move || {
            if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run_job(job_id, kind, control, path)
            }))
            .is_err()
            {
                finish_job_error(job_id, kind, 9, "job worker panicked".to_string());
            }
            drop(panic_control);
        })
    {
        Ok(worker) => state.workers.push(worker),
        Err(error) => {
            if let Some(control) = state.active.remove(&job_id) {
                control.terminal.store(true, Ordering::Release);
            }
            push_immediate_job_error(
                &mut state,
                job_id,
                kind,
                6,
                format!("job worker spawn failed: {error}"),
            );
        }
    }
    job_id
}

#[unsafe(no_mangle)]
pub extern "C" fn pixi_cancel_job(job_id: u64) -> i32 {
    if job_id == 0 { return -1; }
    let state = jobs().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(control) = state.active.get(&job_id) else { return 0; };
    if control.terminal.load(Ordering::Acquire) { return 0; }
    control.cancel.store(true, Ordering::Release);
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_poll_job_event(
    output: *mut JobEventMeta,
    data_output: *mut u8,
    data_capacity: u64,
) -> i32 {
    if output.is_null() || (output as usize) % std::mem::align_of::<JobEventMeta>() != 0 {
        return -1;
    }
    reap_job_workers();
    let event = {
        let mut state = jobs().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(event) = state.events.front() else { return 0; };
        unsafe { output.write(event.meta) };
        if data_capacity < event.data.len() as u64 { return -2; }
        if !event.data.is_empty() && data_output.is_null() { return -3; }
        let Some(event) = state.events.pop_front() else { return 0; };
        state.queued_bytes = state.queued_bytes.saturating_sub(event.data.len());
        event
    };
    if !event.data.is_empty() {
        unsafe {
            std::ptr::copy_nonoverlapping(event.data.as_ptr(), data_output, event.data.len())
        };
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn pixi_shutdown_jobs() -> i32 {
    let workers = {
        let mut state = jobs().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if !state.accepting { return 0; }
        state.accepting = false;
        for control in state.active.values() {
            control.cancel.store(true, Ordering::Release);
        }
        state.active.clear();
        state.events.clear();
        state.queued_bytes = 0;
        std::mem::take(&mut state.workers)
    };
    for worker in workers {
        let _ = worker.join();
    }
    1
}

unsafe fn pump_windows_messages() {
    let mut message = MaybeUninit::<Message>::uninit();
    while unsafe { PeekMessageW(message.as_mut_ptr(), null_mut(), 0, 0, 1) } != 0 {
        let message = unsafe { message.assume_init_ref() };
        if message.message == 0x0012 {
            unsafe { PostQuitMessage(message.w_param as i32) };
            break;
        }
        unsafe {
            TranslateMessage(message);
            DispatchMessageW(message);
        }
    }
}

type SurfaceGetCurrentTexture = unsafe extern "C" fn(Handle, *mut SurfaceTexture);
type SurfacePresent = unsafe extern "C" fn(Handle) -> i32;
type TextureCreateView = unsafe extern "C" fn(Handle, *const c_void) -> Handle;
type DeviceCreateCommandEncoder = unsafe extern "C" fn(Handle, *const c_void) -> Handle;
type CommandEncoderBeginRenderPass = unsafe extern "C" fn(Handle, *const RenderPassDescriptor) -> Handle;
type RenderPassExecuteBundles = unsafe extern "C" fn(Handle, u64, *const Handle);
type RenderPassSetViewport = unsafe extern "C" fn(Handle, f32, f32, f32, f32, f32, f32);
type RenderPassEnd = unsafe extern "C" fn(Handle);
type RenderPassRelease = unsafe extern "C" fn(Handle);
type CommandEncoderFinish = unsafe extern "C" fn(Handle, *const c_void) -> Handle;
type CommandEncoderRelease = unsafe extern "C" fn(Handle);
type QueueSubmit = unsafe extern "C" fn(Handle, u64, *const Handle);
type QueueWriteBuffer = unsafe extern "C" fn(Handle, Handle, u64, *const c_void, u64);
type CommandBufferRelease = unsafe extern "C" fn(Handle);
type TextureViewRelease = unsafe extern "C" fn(Handle);
type TextureRelease = unsafe extern "C" fn(Handle);
type InstanceRequestAdapter = unsafe extern "C" fn(Handle, *const RequestAdapterOptions, RequestAdapterCallbackInfo) -> u64;
type AdapterRequestDevice = unsafe extern "C" fn(Handle, *const c_void, RequestDeviceCallbackInfo) -> u64;
type AdapterGetInfo = unsafe extern "C" fn(Handle, *mut AdapterInfo) -> u32;
type AdapterInfoFreeMembers = unsafe extern "C" fn(AdapterInfo);
type AdapterHasFeature = unsafe extern "C" fn(Handle, u32) -> u32;
type AdapterRelease = unsafe extern "C" fn(Handle);
type DeviceRelease = unsafe extern "C" fn(Handle);
type DeviceForceLoss = unsafe extern "C" fn(Handle, u32, StringView);
type DeviceInjectError = unsafe extern "C" fn(Handle, u32, StringView);

struct Api {
    surface_get_current_texture: SurfaceGetCurrentTexture,
    surface_present: SurfacePresent,
    texture_create_view: TextureCreateView,
    device_create_command_encoder: DeviceCreateCommandEncoder,
    command_encoder_begin_render_pass: CommandEncoderBeginRenderPass,
    render_pass_execute_bundles: RenderPassExecuteBundles,
    render_pass_set_viewport: RenderPassSetViewport,
    render_pass_end: RenderPassEnd,
    render_pass_release: RenderPassRelease,
    command_encoder_finish: CommandEncoderFinish,
    command_encoder_release: CommandEncoderRelease,
    queue_submit: QueueSubmit,
    queue_write_buffer: QueueWriteBuffer,
    command_buffer_release: CommandBufferRelease,
    texture_view_release: TextureViewRelease,
    texture_release: TextureRelease,
    instance_request_adapter: Option<InstanceRequestAdapter>,
    adapter_request_device: Option<AdapterRequestDevice>,
    adapter_get_info: Option<AdapterGetInfo>,
    adapter_info_free_members: Option<AdapterInfoFreeMembers>,
    adapter_has_feature: Option<AdapterHasFeature>,
    adapter_release: Option<AdapterRelease>,
    device_release: Option<DeviceRelease>,
    device_force_loss: Option<DeviceForceLoss>,
    device_inject_error: Option<DeviceInjectError>,
}

unsafe impl Send for Api {}
unsafe impl Sync for Api {}

static API: OnceLock<Option<Api>> = OnceLock::new();

unsafe fn symbol<T: Copy>(module: Handle, name: &'static [u8]) -> Option<T> {
    let address = unsafe { GetProcAddress(module, name.as_ptr().cast()) };
    if address.is_null() { None } else { Some(unsafe { transmute_copy(&address) }) }
}

fn load_api() -> Option<Api> {
    unsafe {
        let name: Vec<u16> = "webgpu_dawn.dll\0".encode_utf16().collect();
        let module = GetModuleHandleW(name.as_ptr());
        if module.is_null() { return None; }
        let wrapper_name: Vec<u16> = "libNativeWrapper.dll\0".encode_utf16().collect();
        let wrapper = GetModuleHandleW(wrapper_name.as_ptr());
        if wrapper.is_null() { return None; }
        Some(Api {
            surface_get_current_texture: symbol(wrapper, b"wgpuSurfaceGetCurrentTextureMainThread\0")?,
            surface_present: symbol(wrapper, b"wgpuSurfacePresentMainThread\0")?,
            texture_create_view: symbol(module, b"wgpuTextureCreateView\0")?,
            device_create_command_encoder: symbol(module, b"wgpuDeviceCreateCommandEncoder\0")?,
            command_encoder_begin_render_pass: symbol(module, b"wgpuCommandEncoderBeginRenderPass\0")?,
            render_pass_execute_bundles: symbol(module, b"wgpuRenderPassEncoderExecuteBundles\0")?,
            render_pass_set_viewport: symbol(module, b"wgpuRenderPassEncoderSetViewport\0")?,
            render_pass_end: symbol(module, b"wgpuRenderPassEncoderEnd\0")?,
            render_pass_release: symbol(module, b"wgpuRenderPassEncoderRelease\0")?,
            command_encoder_finish: symbol(module, b"wgpuCommandEncoderFinish\0")?,
            command_encoder_release: symbol(module, b"wgpuCommandEncoderRelease\0")?,
            queue_submit: symbol(module, b"wgpuQueueSubmit\0")?,
            queue_write_buffer: symbol(module, b"wgpuQueueWriteBuffer\0")?,
            command_buffer_release: symbol(module, b"wgpuCommandBufferRelease\0")?,
            texture_view_release: symbol(module, b"wgpuTextureViewRelease\0")?,
            texture_release: symbol(module, b"wgpuTextureRelease\0")?,
            instance_request_adapter: symbol(module, b"wgpuInstanceRequestAdapter\0"),
            adapter_request_device: symbol(module, b"wgpuAdapterRequestDevice\0"),
            adapter_get_info: symbol(module, b"wgpuAdapterGetInfo\0"),
            adapter_info_free_members: symbol(module, b"wgpuAdapterInfoFreeMembers\0"),
            adapter_has_feature: symbol(module, b"wgpuAdapterHasFeature\0"),
            adapter_release: symbol(module, b"wgpuAdapterRelease\0"),
            device_release: symbol(module, b"wgpuDeviceRelease\0"),
            device_force_loss: symbol(module, b"wgpuDeviceForceLoss\0"),
            device_inject_error: symbol(module, b"wgpuDeviceInjectError\0"),
        })
    }
}

#[repr(C)]
struct SurfaceTexture {
    next_in_chain: *mut c_void,
    texture: Handle,
    status: u32,
    suboptimal: u32,
}

#[repr(C)]
struct StringView {
    data: *const c_char,
    length: u64,
}

#[repr(C)]
struct RequestAdapterOptions {
    next_in_chain: *mut c_void,
    feature_level: u32,
    power_preference: u32,
    force_fallback_adapter: u32,
    backend_type: u32,
    compatible_surface: Handle,
}

type RequestAdapterCallback = unsafe extern "C" fn(u32, Handle, StringView, Handle, Handle);
type RequestDeviceCallback = unsafe extern "C" fn(u32, Handle, StringView, Handle, Handle);

#[repr(C)]
struct RequestAdapterCallbackInfo {
    next_in_chain: *mut c_void,
    mode: u32,
    callback: RequestAdapterCallback,
    userdata1: Handle,
    userdata2: Handle,
}

#[repr(C)]
struct RequestDeviceCallbackInfo {
    next_in_chain: *mut c_void,
    mode: u32,
    callback: RequestDeviceCallback,
    userdata1: Handle,
    userdata2: Handle,
}

struct RequestResult {
    event: Handle,
    status: AtomicU32,
    object: AtomicPtr<c_void>,
}

struct NativeEvent {
    kind: u32,
    code: u32,
    generation: u64,
    message: String,
}

static EVENTS: OnceLock<Mutex<VecDeque<NativeEvent>>> = OnceLock::new();
static SUBMIT_COUNT: AtomicU64 = AtomicU64::new(0);
static PRESENT_COUNT: AtomicU64 = AtomicU64::new(0);
static LAST_FRAME_STATUS: AtomicI32 = AtomicI32::new(0);
static INJECTED_SURFACE_STATUS: AtomicU32 = AtomicU32::new(0);

thread_local! {
    static BUNDLE_HANDLES: RefCell<Vec<Handle>> = const { RefCell::new(Vec::new()) };
}

fn native_events() -> &'static Mutex<VecDeque<NativeEvent>> {
    EVENTS.get_or_init(|| Mutex::new(VecDeque::with_capacity(256)))
}

unsafe fn string_view_to_string(message: StringView) -> String {
    if message.data.is_null() || matches!(message.length, 0 | u64::MAX) {
        return String::new();
    }
    let length = message.length.min(4096) as usize;
    String::from_utf8_lossy(unsafe {
        std::slice::from_raw_parts(message.data.cast::<u8>(), length)
    }).into_owned()
}

fn push_native_event(event: NativeEvent) {
    let mut events = native_events().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if events.len() == 256 { events.pop_front(); }
    events.push_back(event);
}

#[repr(C)]
struct AdapterInfo {
    next_in_chain: *mut c_void,
    vendor: StringView,
    architecture: StringView,
    device: StringView,
    description: StringView,
    backend_type: u32,
    adapter_type: u32,
    vendor_id: u32,
    device_id: u32,
    subgroup_min_size: u32,
    subgroup_max_size: u32,
}

#[repr(C)]
struct QueueDescriptor {
    next_in_chain: *mut c_void,
    label: StringView,
}

#[repr(C)]
struct DeviceLostCallbackInfo {
    next_in_chain: *mut c_void,
    mode: u32,
    callback: Option<unsafe extern "C" fn(*const Handle, u32, StringView, Handle, Handle)>,
    userdata1: Handle,
    userdata2: Handle,
}

#[repr(C)]
struct UncapturedErrorCallbackInfo {
    next_in_chain: *mut c_void,
    callback: Option<unsafe extern "C" fn(*const Handle, u32, StringView, Handle, Handle)>,
    userdata1: Handle,
    userdata2: Handle,
}

#[repr(C)]
struct DeviceDescriptor {
    next_in_chain: *mut c_void,
    label: StringView,
    required_feature_count: u64,
    required_features: *const u32,
    required_limits: *const c_void,
    default_queue: QueueDescriptor,
    device_lost_callback_info: DeviceLostCallbackInfo,
    uncaptured_error_callback_info: UncapturedErrorCallbackInfo,
}

unsafe extern "C" fn adapter_callback(
    status: u32, adapter: Handle, _message: StringView, userdata1: Handle, _userdata2: Handle,
) {
    let result = unsafe { &*(userdata1 as *const RequestResult) };
    result.object.store(adapter, Ordering::Relaxed);
    result.status.store(status, Ordering::Release);
    unsafe { SetEvent(result.event) };
}

unsafe extern "C" fn device_callback(
    status: u32, device: Handle, _message: StringView, userdata1: Handle, _userdata2: Handle,
) {
    let result = unsafe { &*(userdata1 as *const RequestResult) };
    result.object.store(device, Ordering::Relaxed);
    result.status.store(status, Ordering::Release);
    unsafe { SetEvent(result.event) };
}

unsafe extern "C" fn device_lost_callback(
    _device: *const Handle, reason: u32, message: StringView, userdata1: Handle, _userdata2: Handle,
) {
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        push_native_event(NativeEvent {
            kind: 1,
            code: reason,
            generation: userdata1 as usize as u64,
            message: unsafe { string_view_to_string(message) },
        });
    }));
}

unsafe extern "C" fn uncaptured_error_callback(
    _device: *const Handle, error_type: u32, message: StringView, userdata1: Handle, _userdata2: Handle,
) {
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        push_native_event(NativeEvent {
            kind: 2,
            code: error_type,
            generation: userdata1 as usize as u64,
            message: unsafe { string_view_to_string(message) },
        });
    }));
}

fn empty_string_view() -> StringView {
    StringView { data: null(), length: u64::MAX }
}

unsafe fn write_adapter_name(info: &AdapterInfo, output: *mut u8, capacity: u64) {
    if output.is_null() || capacity == 0 { return; }
    let source = if !info.device.data.is_null() { &info.device } else { &info.description };
    let length = if source.data.is_null() { 0 } else { source.length.min(capacity - 1) };
    if length > 0 {
        unsafe { std::ptr::copy_nonoverlapping(source.data.cast(), output, length as usize) };
    }
    unsafe { *output.add(length as usize) = 0 };
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_create_adapter_device(
    instance: Handle,
    surface: Handle,
    power_preference: u32,
    generation: u64,
    output: *mut u64,
    adapter_name: *mut u8,
    adapter_name_capacity: u64,
) -> i32 {
    if instance.is_null()
        || surface.is_null()
        || output.is_null()
        || (output as usize) % std::mem::align_of::<u64>() != 0
        || !matches!(power_preference, 0 | 1 | 2)
    {
        return -10;
    }
    unsafe { output.write(0); output.add(1).write(0); }
    let Some(api) = API.get_or_init(load_api).as_ref() else { return -1; };
    let (Some(request_adapter), Some(request_device)) =
        (api.instance_request_adapter, api.adapter_request_device) else { return -11; };
    let event = unsafe { CreateEventW(null(), 0, 0, null()) };
    if event.is_null() { return -12; }
    let result = RequestResult {
        event,
        status: AtomicU32::new(0),
        object: AtomicPtr::new(null_mut()),
    };
    let userdata = (&result as *const RequestResult).cast_mut().cast();
    let options = RequestAdapterOptions {
        next_in_chain: null_mut(),
        feature_level: 0,
        power_preference,
        force_fallback_adapter: 0,
        backend_type: 4, // D3D12: required by Electrobun's Windows presentation path.
        compatible_surface: surface,
    };
    unsafe {
        request_adapter(instance, &options, RequestAdapterCallbackInfo {
            next_in_chain: null_mut(), mode: 3, callback: adapter_callback,
            userdata1: userdata, userdata2: null_mut(),
        });
        WaitForSingleObject(event, u32::MAX);
    }
    let adapter_status = result.status.swap(0, Ordering::Acquire);
    let adapter = result.object.swap(null_mut(), Ordering::Relaxed);
    if adapter_status != 1 || adapter.is_null() {
        if !adapter.is_null() {
            if let Some(release) = api.adapter_release { unsafe { release(adapter) } }
        }
        unsafe { CloseHandle(event) };
        return -13;
    }

    let mut adapter_type = 0;
    if let (Some(get_info), Some(free_info)) = (api.adapter_get_info, api.adapter_info_free_members) {
        let empty = empty_string_view();
        let mut info = AdapterInfo {
            next_in_chain: null_mut(),
            vendor: empty_string_view(), architecture: empty_string_view(),
            device: empty_string_view(), description: empty,
            backend_type: 0, adapter_type: 0, vendor_id: 0, device_id: 0,
            subgroup_min_size: 0, subgroup_max_size: 0,
        };
        if unsafe { get_info(adapter, &mut info) } == 1 {
            adapter_type = info.adapter_type as i32;
            unsafe { write_adapter_name(&info, adapter_name, adapter_name_capacity); free_info(info); }
        }
    }

    // Match Electrobun's zero-copy Windows device path exactly.
    let mut feature_names = [0u32; 2];
    let mut feature_count = 0usize;
    for feature in [0x00050022, 0x00050029] {
        if api.adapter_has_feature.is_some_and(|has| unsafe { has(adapter, feature) != 0 }) {
            feature_names[feature_count] = feature;
            feature_count += 1;
        }
    }
    let device_descriptor = DeviceDescriptor {
        next_in_chain: null_mut(), label: empty_string_view(),
        required_feature_count: feature_count as u64,
        required_features: feature_names.as_ptr(), required_limits: null(),
        default_queue: QueueDescriptor { next_in_chain: null_mut(), label: empty_string_view() },
        device_lost_callback_info: DeviceLostCallbackInfo {
            next_in_chain: null_mut(), mode: 3, callback: Some(device_lost_callback),
            userdata1: generation as usize as Handle, userdata2: null_mut(),
        },
        uncaptured_error_callback_info: UncapturedErrorCallbackInfo {
            next_in_chain: null_mut(), callback: Some(uncaptured_error_callback),
            userdata1: generation as usize as Handle, userdata2: null_mut(),
        },
    };
    unsafe {
        request_device(adapter, (&device_descriptor as *const DeviceDescriptor).cast(), RequestDeviceCallbackInfo {
            next_in_chain: null_mut(), mode: 3, callback: device_callback,
            userdata1: userdata, userdata2: null_mut(),
        });
        WaitForSingleObject(event, u32::MAX);
        CloseHandle(event);
    }
    let device_status = result.status.load(Ordering::Acquire);
    let device = result.object.load(Ordering::Relaxed);
    if device_status != 1 || device.is_null() {
        if !device.is_null() {
            if let Some(release) = api.device_release { unsafe { release(device) } }
        }
        if let Some(release) = api.adapter_release { unsafe { release(adapter) } }
        return -14;
    }
    unsafe {
        output.write(adapter as u64);
        output.add(1).write(device as u64);
    }
    adapter_type
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_poll_gpu_event(
    output: *mut u64,
    message: *mut u8,
    message_capacity: u64,
) -> i32 {
    if output.is_null() || (output as usize) % std::mem::align_of::<u64>() != 0 {
        return -1;
    }
    let Some(event) = native_events()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .pop_front() else { return 0; };
    unsafe {
        output.write(event.generation);
        output.add(1).write(event.code as u64);
    }
    if !message.is_null() && message_capacity > 0 {
        let bytes = event.message.as_bytes();
        let length = bytes.len().min((message_capacity - 1) as usize);
        if length > 0 {
            unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), message, length) };
        }
        unsafe { *message.add(length) = 0 };
    }
    event.kind as i32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_get_frame_counters(output: *mut u64) -> i32 {
    if output.is_null() || (output as usize) % std::mem::align_of::<u64>() != 0 {
        return -1;
    }
    unsafe {
        output.write(SUBMIT_COUNT.load(Ordering::Relaxed));
        output.add(1).write(PRESENT_COUNT.load(Ordering::Relaxed));
        output.add(2).write(LAST_FRAME_STATUS.load(Ordering::Relaxed) as i64 as u64);
    }
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_inject_surface_status(status: u32) -> i32 {
    if !(3..=6).contains(&status) { return -1; }
    INJECTED_SURFACE_STATUS.store(status, Ordering::Release);
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_force_device_loss(device: Handle) -> i32 {
    let Some(api) = API.get_or_init(load_api).as_ref() else { return -1; };
    let Some(force_loss) = api.device_force_loss else { return -2; };
    if device.is_null() { return -3; }
    unsafe { force_loss(device, 1, empty_string_view()) };
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_inject_gpu_error(device: Handle, error_type: u32, generation: u64) -> i32 {
    let Some(api) = API.get_or_init(load_api).as_ref() else { return -1; };
    if device.is_null() || !(2..=5).contains(&error_type) { return -3; }
    if matches!(error_type, 2 | 3) {
        let Some(inject_error) = api.device_inject_error else { return -2; };
        unsafe { inject_error(device, error_type, empty_string_view()) };
    } else {
        push_native_event(NativeEvent {
            kind: 2,
            code: error_type,
            generation,
            message: "Synthetic internal GPU error".to_string(),
        });
    }
    1
}

#[repr(C)]
struct ColorAttachment {
    next_in_chain: *const c_void,
    view: Handle,
    depth_slice: u32,
    padding: u32,
    resolve_target: Handle,
    load_op: u32,
    store_op: u32,
    clear_r: f64,
    clear_g: f64,
    clear_b: f64,
    clear_a: f64,
}

#[repr(C)]
struct RenderPassDescriptor {
    next_in_chain: *const c_void,
    label: StringView,
    color_attachment_count: u64,
    color_attachments: *const ColorAttachment,
    depth_stencil_attachment: *const c_void,
    occlusion_query_set: Handle,
    timestamp_writes: *const c_void,
}

#[repr(C)]
pub struct FastBundleItem {
    pub bundle: u64,
    pub vertex_buffer: u64,
    pub vertex_data: *const c_void,
    pub vertex_size: u64,
}

// This ABI intentionally supports only the x64 process used by Electrobun on Windows.
const _: [(); 8] = [(); std::mem::size_of::<Handle>()];
const _: [(); 32] = [(); std::mem::size_of::<FastBundleItem>()];
const _: [(); 8] = [(); std::mem::align_of::<FastBundleItem>()];

fn surface_status_code(status: u32) -> i32 {
    match status {
        3 => -2, // timeout
        4 => -3, // outdated
        5 => -4, // lost
        6 => -6, // out of memory
        _ => -5,
    }
}

fn injected_surface_status_code(status: u32) -> i32 {
    if status == 6 { -6 } else { surface_status_code(status) }
}

fn take_injected_surface_status_code() -> i32 {
    let status = INJECTED_SURFACE_STATUS.swap(0, Ordering::AcqRel);
    if status == 0 { 0 } else { injected_surface_status_code(status) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_take_injected_surface_status() -> i32 {
    let status = take_injected_surface_status_code();
    if status != 0 { LAST_FRAME_STATUS.store(status, Ordering::Relaxed); }
    status
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_submit_bundles(
    surface: Handle,
    device: Handle,
    queue: Handle,
    items: *const FastBundleItem,
    item_count: u64,
    msaa_view: Handle,
    viewport_x: f32,
    viewport_y: f32,
    viewport_width: f32,
    viewport_height: f32,
) -> i32 {
    SUBMIT_COUNT.fetch_add(1, Ordering::Relaxed);
    let finish = |status: i32| {
        LAST_FRAME_STATUS.store(status, Ordering::Relaxed);
        status
    };
    if surface.is_null()
        || device.is_null()
        || queue.is_null()
        || items.is_null()
        || item_count == 0
        || item_count > MAX_BUNDLES_PER_FRAME
        || (items as usize) % std::mem::align_of::<FastBundleItem>() != 0
        || !viewport_x.is_finite()
        || !viewport_y.is_finite()
        || !viewport_width.is_finite()
        || !viewport_height.is_finite()
        || viewport_width <= 0.0
        || viewport_height <= 0.0
    {
        return finish(-10);
    }
    let item_count = item_count as usize;
    let items = unsafe { std::slice::from_raw_parts(items, item_count) };
    if items.iter().any(|item| {
        item.bundle == 0
            || item.vertex_buffer == 0
            || item.vertex_data.is_null()
            || item.vertex_size == 0
            || item.vertex_size > isize::MAX as u64
    }) {
        return finish(-10);
    }
    let Some(api) = API.get_or_init(load_api).as_ref() else { return finish(-1); };
    let injected = take_injected_surface_status_code();
    if injected != 0 { return finish(injected); }
    BUNDLE_HANDLES.with(|cached| {
    let Ok(mut bundles) = cached.try_borrow_mut() else { return finish(-16); };
    bundles.clear();
    if bundles.try_reserve(item_count).is_err() { return finish(-16); }
    for item in items {
        let vertex_buffer = item.vertex_buffer as usize as Handle;
        unsafe { (api.queue_write_buffer)(queue, vertex_buffer, 0, item.vertex_data, item.vertex_size) };
        bundles.push(item.bundle as usize as Handle);
    }
    let mut surface_texture = SurfaceTexture {
        next_in_chain: null_mut(), texture: null_mut(), status: 0, suboptimal: 0,
    };
    unsafe { (api.surface_get_current_texture)(surface, &mut surface_texture) };
    if !matches!(surface_texture.status, 1 | 2) || surface_texture.texture.is_null() {
        if !surface_texture.texture.is_null() {
            unsafe { (api.texture_release)(surface_texture.texture) };
        }
        return finish(surface_status_code(surface_texture.status));
    }
    let view = unsafe { (api.texture_create_view)(surface_texture.texture, null()) };
    if view.is_null() {
        unsafe { (api.texture_release)(surface_texture.texture) };
        return finish(-11);
    }
    let encoder = unsafe { (api.device_create_command_encoder)(device, null()) };
    if encoder.is_null() {
        unsafe {
            (api.texture_view_release)(view);
            (api.texture_release)(surface_texture.texture);
        }
        return finish(-12);
    }

    let attachment = ColorAttachment {
        next_in_chain: null(),
        view: if msaa_view.is_null() { view } else { msaa_view },
        depth_slice: u32::MAX,
        padding: 0,
        resolve_target: if msaa_view.is_null() { null_mut() } else { view },
        load_op: 2, store_op: 1,
        clear_r: 9.0 / 255.0, clear_g: 11.0 / 255.0,
        clear_b: 20.0 / 255.0, clear_a: 1.0,
    };
    let descriptor = RenderPassDescriptor {
        next_in_chain: null(), label: StringView { data: null(), length: 0 },
        color_attachment_count: 1, color_attachments: &attachment,
        depth_stencil_attachment: null(), occlusion_query_set: null_mut(), timestamp_writes: null(),
    };
    let pass = unsafe { (api.command_encoder_begin_render_pass)(encoder, &descriptor) };
    if pass.is_null() {
        unsafe {
            (api.command_encoder_release)(encoder);
            (api.texture_view_release)(view);
            (api.texture_release)(surface_texture.texture);
        }
        return finish(-13);
    }
    unsafe {
        (api.render_pass_set_viewport)(
            pass, viewport_x, viewport_y, viewport_width, viewport_height, 0.0, 1.0,
        );
        (api.render_pass_execute_bundles)(pass, item_count as u64, bundles.as_ptr());
        (api.render_pass_end)(pass);
        (api.render_pass_release)(pass);
    }
    drop(bundles);
    let command = unsafe { (api.command_encoder_finish)(encoder, null()) };
    unsafe { (api.command_encoder_release)(encoder) };
    if command.is_null() {
        unsafe {
            (api.texture_view_release)(view);
            (api.texture_release)(surface_texture.texture);
        }
        return finish(-14);
    }
    unsafe {
        (api.queue_submit)(queue, 1, &command);
        (api.command_buffer_release)(command);
    }
    let present_status = unsafe { (api.surface_present)(surface) };
    unsafe {
        (api.texture_view_release)(view);
        (api.texture_release)(surface_texture.texture);
        pump_windows_messages();
    }
    if present_status == 1 {
        PRESENT_COUNT.fetch_add(1, Ordering::Relaxed);
        finish(if surface_texture.status == 2 || surface_texture.suboptimal != 0 { 2 } else { 1 })
    } else {
        finish(-15)
    }
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pixi_submit_bundle(
    surface: Handle,
    device: Handle,
    queue: Handle,
    bundle: Handle,
    msaa_view: Handle,
    vertex_buffer: Handle,
    vertex_data: *const c_void,
    vertex_size: u64,
    viewport_x: f32,
    viewport_y: f32,
    viewport_width: f32,
    viewport_height: f32,
) -> i32 {
    let item = FastBundleItem {
        bundle: bundle as usize as u64,
        vertex_buffer: vertex_buffer as usize as u64,
        vertex_data,
        vertex_size,
    };
    unsafe {
        pixi_submit_bundles(
            surface, device, queue, &item, 1, msaa_view,
            viewport_x, viewport_y, viewport_width, viewport_height,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_scale_factor_uses_dpi_or_failure_sentinel() {
        assert_eq!(scale_factor_from_dpi(0), 0.0);
        assert_eq!(scale_factor_from_dpi(96), 1.0);
        assert_eq!(scale_factor_from_dpi(144), 1.5);
    }

    #[test]
    fn interactive_resize_registry_tracks_enter_and_exit() {
        let window = usize::MAX;
        set_window_resizing(window, true);
        assert!(window_is_resizing(window));
        set_window_resizing(window, false);
        assert!(!window_is_resizing(window));
    }

    #[test]
    fn stable_frame_abi_and_surface_statuses() {
        assert_eq!(pixi_host_abi_version(), 3);
        assert_eq!(pixi_host_capabilities(), 4031);
        assert_eq!(pixi_uia_provider_available(), 0);
        assert_eq!(std::mem::size_of::<FastBundleItem>(), 32);
        assert_eq!(std::mem::size_of::<WindowSnapshot>(), 48);
        assert_eq!(std::mem::size_of::<InputDiagnostics>(), 32);
        assert_eq!(std::mem::size_of::<InputEvent>(), 88);
        assert_eq!(std::mem::size_of::<TextEventMeta>(), 40);
        assert_eq!(std::mem::size_of::<FileDropMeta>(), 32);
        assert_eq!(std::mem::size_of::<JobEventMeta>(), 48);
        assert_eq!(std::mem::size_of::<AccessibilityActionMeta>(), 32);
        assert_eq!(surface_status_code(3), -2);
        assert_eq!(surface_status_code(4), -3);
        assert_eq!(surface_status_code(5), -4);
        assert_eq!(surface_status_code(6), -6);
        assert_eq!(injected_surface_status_code(6), -6);
        INJECTED_SURFACE_STATUS.store(5, Ordering::Release);
        assert_eq!(take_injected_surface_status_code(), -4);
        assert_eq!(take_injected_surface_status_code(), 0);
        assert_eq!(surface_status_code(0), -5);
        assert_eq!(unsafe {
            pixi_submit_bundles(
                null_mut(), null_mut(), null_mut(), null(), 0, null_mut(),
                0.0, 0.0, 1.0, 1.0,
            )
        }, -10);
        assert_eq!(signed_low_word(0x0000_ffff), -1);
        assert_eq!(signed_high_word(0xffff_0000u32 as isize), -1);
        assert_eq!(mouse_buttons(0x0073), 0b1_1111);
        assert_eq!(wheel_message_modifiers(0x000c, 0b1100), 0b1111);
        assert_eq!(wheel_message_modifiers(0, 0b1111), 0b1100);

        let path = std::env::current_dir().unwrap();
        let mut drag_paths: Vec<u16> = path.to_string_lossy().encode_utf16().collect();
        drag_paths.extend_from_slice(&[0, 0]);
        assert!(validate_drag_paths(&drag_paths));
        drag_paths.pop();
        assert!(!validate_drag_paths(&drag_paths));
        assert_eq!(unsafe { file_drop_source_query_continue_drag(null_mut(), 1, 1) }, DRAGDROP_S_CANCEL);
        assert_eq!(unsafe { file_drop_source_query_continue_drag(null_mut(), 0, 0) }, DRAGDROP_S_DROP);
        assert_eq!(unsafe { file_drop_source_query_continue_drag(null_mut(), 0, 1) }, S_OK);

        let route_id = u64::MAX;
        purge_input_events(route_id);
        unsafe extern "C" fn count_wake(data: *mut c_void) {
            unsafe { &*(data as *const AtomicU64) }.fetch_add(1, Ordering::Relaxed);
        }
        let wakes = AtomicU64::new(0);
        assert_eq!(unsafe {
            pixi_register_input_wake(Some(count_wake), (&wakes as *const AtomicU64).cast_mut().cast())
        }, 1);
        let coalesced_before = INPUT_COALESCED.load(Ordering::Relaxed);
        let mut first = blank_input_event(route_id, INPUT_POINTER_MOVE);
        first.x = 1;
        first.movement_x = 1;
        assert_eq!(first.pointer_id, 1);
        push_input_event(first);
        let mut second = blank_input_event(route_id, INPUT_POINTER_MOVE);
        second.x = 3;
        second.movement_x = 2;
        push_input_event(second);
        let mut output = MaybeUninit::<InputEvent>::uninit();
        assert_eq!(unsafe { pixi_poll_input_event(output.as_mut_ptr()) }, 1);
        let output = unsafe { output.assume_init() };
        assert_eq!((output.x, output.movement_x), (3, 3));
        assert_eq!(wakes.load(Ordering::Relaxed), 1);
        assert_eq!(INPUT_COALESCED.load(Ordering::Relaxed), coalesced_before + 1);
        let mut diagnostics = MaybeUninit::<InputDiagnostics>::uninit();
        assert_eq!(unsafe { pixi_get_input_diagnostics(diagnostics.as_mut_ptr()) }, 1);
        assert_eq!(unsafe { diagnostics.assume_init() }.queued, 0);
        assert_eq!(pixi_clear_input_wake(), 1);

        assert!(make_caret_rect(i32::MAX, 0, 1, 1).is_none());
        let text_route = u64::MAX - 1;
        purge_text_events(text_route);
        let mut state = Box::new(WindowInputState {
            route_id: text_route,
            last_x: 0,
            last_y: 0,
            last_position_valid: false,
            tracking_leave: false,
            buttons: 0,
            has_capture: false,
            releasing_capture: false,
            cursor: null_mut(),
            cursor_kind: 0,
            minimized: false,
            last_click_time: 0,
            last_click_x: 0,
            last_click_y: 0,
            last_click_button: -1,
            last_click_detail: 0,
            text_active: true,
            ime_composing: false,
            caret: Rect { left: 0, top: 0, right: 0, bottom: 0 },
            suppressed_result_chars: VecDeque::new(),
            pending_high_surrogate: 0,
        });
        unsafe { handle_wm_char(&mut *state, 0x0008) };
        let mut ignored = MaybeUninit::<TextEventMeta>::uninit();
        assert_eq!(unsafe {
            pixi_poll_text_event(ignored.as_mut_ptr(), null_mut(), 0)
        }, 0);
        unsafe {
            handle_wm_char(&mut *state, 0xd83d);
            handle_wm_char(&mut *state, 0xde00);
        }
        let mut meta = MaybeUninit::<TextEventMeta>::uninit();
        let mut text = [0u16; 2];
        assert_eq!(unsafe {
            pixi_poll_text_event(meta.as_mut_ptr(), text.as_mut_ptr(), text.len() as u64)
        }, 1);
        let meta = unsafe { meta.assume_init() };
        assert_eq!((meta.kind, meta.text_length_utf16, text), (TEXT_COMMIT, 2, [0xd83d, 0xde00]));

        fn wait_for_job(job_id: u64) -> (JobEventMeta, Vec<u8>) {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
            loop {
                assert!(std::time::Instant::now() < deadline, "job timed out");
                let mut meta = MaybeUninit::<JobEventMeta>::uninit();
                let status = unsafe { pixi_poll_job_event(meta.as_mut_ptr(), null_mut(), 0) };
                if status == 0 {
                    std::thread::yield_now();
                    continue;
                }
                assert!(matches!(status, 1 | -2));
                let meta = unsafe { meta.assume_init() };
                assert_eq!(meta.job_id, job_id);
                if status == 1 {
                    if meta.event_kind == JOB_PROGRESS { continue; }
                    return (meta, Vec::new());
                }
                let mut data = vec![0u8; meta.data_length as usize];
                let mut delivered = MaybeUninit::<JobEventMeta>::uninit();
                assert_eq!(unsafe {
                    pixi_poll_job_event(
                        delivered.as_mut_ptr(), data.as_mut_ptr(), data.len() as u64,
                    )
                }, 1);
                let delivered = unsafe { delivered.assume_init() };
                if delivered.event_kind == JOB_PROGRESS { continue; }
                return (delivered, data);
            }
        }

        let read_path = b"src/platform/native-frame.rs";
        let read_id = unsafe {
            pixi_start_job(1, read_path.as_ptr(), read_path.len() as u64)
        };
        assert_ne!(read_id, 0);
        let (read_meta, read_data) = wait_for_job(read_id);
        assert_eq!((read_meta.event_kind, &read_data[..2]), (JOB_RESULT, &b"#!"[..]));

        let scan_path = b"src";
        let scan_id = unsafe {
            pixi_start_job(2, scan_path.as_ptr(), scan_path.len() as u64)
        };
        assert_ne!(scan_id, 0);
        let (scan_meta, scan_data) = wait_for_job(scan_id);
        assert_eq!(scan_meta.event_kind, JOB_RESULT);
        assert_eq!(&scan_data[..4], b"SCN1");
        assert_eq!(pixi_shutdown_jobs(), 1);

        let mut snapshot = vec![0u8; 84];
        snapshot[0..4].copy_from_slice(b"A11Y");
        snapshot[4..6].copy_from_slice(&1u16.to_le_bytes());
        snapshot[8..12].copy_from_slice(&1u32.to_le_bytes());
        snapshot[12..16].copy_from_slice(&84u32.to_le_bytes());
        snapshot[16..24].copy_from_slice(&1u64.to_le_bytes());
        snapshot[32..36].copy_from_slice(&1u32.to_le_bytes());
        snapshot[52..56].copy_from_slice(&10i32.to_le_bytes());
        snapshot[56..60].copy_from_slice(&20i32.to_le_bytes());
        snapshot[60..64].copy_from_slice(&80u32.to_le_bytes());
        snapshot[64..68].copy_from_slice(&4u32.to_le_bytes());
        snapshot[80..84].copy_from_slice(b"root");
        assert_eq!(validate_accessibility_snapshot(&snapshot), Ok(()));
        snapshot[24..32].copy_from_slice(&2u64.to_le_bytes());
        assert_eq!(validate_accessibility_snapshot(&snapshot), Err(-5));
    }
}
