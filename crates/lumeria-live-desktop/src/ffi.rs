//! C ABI entry points for the Lumeria live desktop runtime.
//!
//! The host (Bun) loads `lumeria_live_desktop.dll` and passes trusted UTF-8 JSON
//! request buffers of at most [`LIVE_DESKTOP_REQUEST_MAX_BYTES`] bytes. Responses
//! are owned, NUL-terminated JSON strings that the host copies and then releases
//! with [`lumeria_live_desktop_free`].
//!
//! Loading the library performs no probing, capture, or startup work: the runtime
//! is created lazily on the first explicit operation. Every call is serialized
//! through a single [`Mutex`] so the runtime state machine observes one operation
//! at a time, and each operation re-checks the current runtime state.
//!
//! `ok: true` means the request was processed and `value` is the operation
//! result. An operation that the runtime refuses or that fails while starting is
//! reported through the returned `LiveDesktopRuntimeStatus` (`phase`, `reason`,
//! `detail`, and the diagnostics counters such as `abandonedRendererWorkers`), so
//! a failed start or an unfinished worker is never masked as a plain success.
//! `ok: false` is reserved for malformed requests, unknown operations, missing or
//! mistyped parameters, an unusable window handle, and runtime lock failures.

use std::ffi::{c_char, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Mutex, MutexGuard, OnceLock};

use serde::Deserialize;
use serde_json::{json, Value};

use crate::{LiveDesktopRuntime, LiveDesktopRuntimeConfig, LiveDesktopRuntimeStatus};

/// Maximum accepted request payload size: 1 MiB of UTF-8 JSON.
pub const LIVE_DESKTOP_REQUEST_MAX_BYTES: usize = 1024 * 1024;

/// Live desktop window handle as received over the C ABI.
#[cfg(target_os = "windows")]
type LiveDesktopNativeWindowHandle = crate::LiveDesktopWindowHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveDesktopRequest {
    operation: String,
    #[serde(default)]
    window_handle: Option<i64>,
    #[serde(default)]
    config: Option<LiveDesktopRuntimeConfig>,
    #[serde(default)]
    visible: Option<bool>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LiveDesktopOperation {
    Support,
    Status,
    Configure,
    Start,
    Visible,
    Stop,
}

impl LiveDesktopOperation {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw {
            "support" => Ok(Self::Support),
            "status" => Ok(Self::Status),
            "configure" => Ok(Self::Configure),
            "start" => Ok(Self::Start),
            "visible" => Ok(Self::Visible),
            "stop" => Ok(Self::Stop),
            other => Err(format!(
                "unknown live desktop operation \"{other}\"; expected one of support, status, configure, start, visible, stop"
            )),
        }
    }
}

fn live_desktop_runtime() -> &'static Mutex<LiveDesktopRuntime> {
    static RUNTIME: OnceLock<Mutex<LiveDesktopRuntime>> = OnceLock::new();
    RUNTIME.get_or_init(|| Mutex::new(LiveDesktopRuntime::default()))
}

fn lock_live_desktop_runtime() -> Result<MutexGuard<'static, LiveDesktopRuntime>, String> {
    live_desktop_runtime()
        .lock()
        .map_err(|_| "failed to lock the live desktop runtime".to_string())
}

/// Handles one request and returns an owned, NUL-terminated JSON response.
///
/// # Safety
///
/// `input` must point to `length` readable bytes for the duration of the call.
/// Requests come from the trusted host process. The returned pointer is owned by
/// the caller and must be released with [`lumeria_live_desktop_free`]. Panics are
/// caught and reported as `{"ok":false,...}` so unwinding never crosses the C ABI.
#[no_mangle]
pub unsafe extern "C" fn lumeria_live_desktop_request(
    input: *const u8,
    length: usize,
) -> *mut c_char {
    let response = catch_unwind(AssertUnwindSafe(|| {
        handle_live_desktop_request(input, length)
    }))
    .unwrap_or_else(|_| error_live_desktop_response("live desktop request panicked"));
    into_owned_c_string(response)
}

/// Releases a response returned by [`lumeria_live_desktop_request`].
///
/// # Safety
///
/// `response` must be a pointer returned by [`lumeria_live_desktop_request`] that
/// has not been freed yet, or null.
#[no_mangle]
pub unsafe extern "C" fn lumeria_live_desktop_free(response: *mut c_char) {
    if response.is_null() {
        return;
    }
    let _ = catch_unwind(AssertUnwindSafe(|| unsafe {
        drop(CString::from_raw(response));
    }));
}

fn handle_live_desktop_request(input: *const u8, length: usize) -> String {
    if length > LIVE_DESKTOP_REQUEST_MAX_BYTES {
        return error_live_desktop_response(&format!(
            "live desktop request payload of {length} bytes exceeds the {LIVE_DESKTOP_REQUEST_MAX_BYTES} byte limit"
        ));
    }
    if input.is_null() {
        return error_live_desktop_response("live desktop request payload pointer is null");
    }
    if length == 0 {
        return error_live_desktop_response("live desktop request payload is empty");
    }

    let payload = unsafe { std::slice::from_raw_parts(input, length) };
    let text = match std::str::from_utf8(payload) {
        Ok(text) => text,
        Err(error) => {
            return error_live_desktop_response(&format!(
                "live desktop request payload is not valid UTF-8: {error}"
            ));
        }
    };

    let request = match serde_json::from_str::<LiveDesktopRequest>(text) {
        Ok(request) => request,
        Err(error) => {
            return error_live_desktop_response(&format!("invalid live desktop request: {error}"));
        }
    };

    match dispatch_live_desktop_request(request) {
        Ok(value) => success_live_desktop_response(value),
        Err(error) => error_live_desktop_response(&error),
    }
}

fn dispatch_live_desktop_request(request: LiveDesktopRequest) -> Result<Value, String> {
    match LiveDesktopOperation::parse(&request.operation)? {
        LiveDesktopOperation::Support => {
            let mut runtime = lock_live_desktop_runtime()?;
            let support = runtime
                .active_background_support()
                .unwrap_or_else(crate::live_desktop_background_support);
            serde_json::to_value(support).map_err(live_desktop_serialize_error)
        }
        LiveDesktopOperation::Status => {
            let mut runtime = lock_live_desktop_runtime()?;
            runtime_status_value(runtime.status())
        }
        LiveDesktopOperation::Configure => {
            let config = request
                .config
                .ok_or_else(|| "configure requires a config object".to_string())?;
            let mut runtime = lock_live_desktop_runtime()?;
            runtime_status_value(runtime.configure(config))
        }
        LiveDesktopOperation::Start => {
            let raw_handle = request
                .window_handle
                .ok_or_else(|| "start requires a windowHandle".to_string())?;
            let window_handle = resolve_live_desktop_window_handle(raw_handle)?;
            let mut runtime = lock_live_desktop_runtime()?;
            runtime_status_value(runtime.start_for_window(window_handle))
        }
        LiveDesktopOperation::Visible => {
            let visible = request
                .visible
                .ok_or_else(|| "visible requires a visible boolean".to_string())?;
            let mut runtime = lock_live_desktop_runtime()?;
            runtime_status_value(runtime.set_visible(visible))
        }
        LiveDesktopOperation::Stop => {
            let mut runtime = lock_live_desktop_runtime()?;
            runtime_status_value(runtime.stop())
        }
    }
}

fn runtime_status_value(status: LiveDesktopRuntimeStatus) -> Result<Value, String> {
    serde_json::to_value(status).map_err(live_desktop_serialize_error)
}

fn live_desktop_serialize_error(error: serde_json::Error) -> String {
    format!("failed to serialize the live desktop response: {error}")
}

fn success_live_desktop_response(value: Value) -> String {
    json!({ "ok": true, "value": value }).to_string()
}

fn error_live_desktop_response(error: &str) -> String {
    json!({ "ok": false, "error": error }).to_string()
}

fn into_owned_c_string(response: String) -> *mut c_char {
    match CString::new(response) {
        Ok(response) => response.into_raw(),
        Err(_) => CString::new(error_live_desktop_response(
            "live desktop response contained an interior NUL byte",
        ))
        .expect("the fallback error response is a valid C string")
        .into_raw(),
    }
}

#[cfg(target_os = "windows")]
fn resolve_live_desktop_window_handle(raw: i64) -> Result<LiveDesktopNativeWindowHandle, String> {
    validate_live_desktop_window_handle(raw, current_live_desktop_process_id())
}

#[cfg(not(target_os = "windows"))]
fn resolve_live_desktop_window_handle(_raw: i64) -> Result<(), String> {
    Err("the live desktop background is only available on Windows".to_string())
}

#[cfg(target_os = "windows")]
fn current_live_desktop_process_id() -> u32 {
    use windows::Win32::System::Threading::GetCurrentProcessId;

    unsafe { GetCurrentProcessId() }
}

/// Validates that `raw` is a non-zero window handle that exists and belongs to
/// `owner_process_id`. The live desktop bottom target is a window owned by the
/// host process, so foreign window handles are rejected instead of manipulated.
#[cfg(target_os = "windows")]
fn validate_live_desktop_window_handle(
    raw: i64,
    owner_process_id: u32,
) -> Result<LiveDesktopNativeWindowHandle, String> {
    use std::ffi::c_void;

    use windows::Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{GetWindowThreadProcessId, IsWindow},
    };

    if raw <= 0 {
        return Err(format!(
            "start requires a non-zero native window handle, received {raw}"
        ));
    }

    let window = HWND(raw as usize as *mut c_void);
    if !unsafe { IsWindow(Some(window)) }.as_bool() {
        return Err(format!("window handle 0x{raw:X} does not exist"));
    }

    let mut process_id = 0u32;
    unsafe {
        GetWindowThreadProcessId(window, Some(&mut process_id));
    }
    if process_id != owner_process_id {
        return Err(format!(
            "window handle 0x{raw:X} belongs to process {process_id}; the live desktop root window must belong to the current process {owner_process_id}"
        ));
    }

    Ok(window)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(payload: &str) -> Value {
        lumeria_live_desktop_request_with_payload(payload.as_bytes())
    }

    fn lumeria_live_desktop_request_with_payload(payload: &[u8]) -> Value {
        let response = unsafe { lumeria_live_desktop_request(payload.as_ptr(), payload.len()) };
        let json = read_live_desktop_response(response);
        unsafe { lumeria_live_desktop_free(response) };
        json
    }

    fn read_live_desktop_response(response: *mut c_char) -> Value {
        assert!(
            !response.is_null(),
            "the request must always return a response"
        );
        let text = unsafe { std::ffi::CStr::from_ptr(response) }
            .to_str()
            .expect("responses are UTF-8 JSON");
        serde_json::from_str(text).expect("responses are JSON")
    }

    fn expect_error(value: &Value) -> String {
        assert_eq!(
            value["ok"],
            json!(false),
            "expected an error response: {value}"
        );
        value["error"]
            .as_str()
            .expect("error responses carry an error string")
            .to_string()
    }

    fn expect_status(value: &Value) -> &Value {
        assert_eq!(
            value["ok"],
            json!(true),
            "expected a successful response: {value}"
        );
        value["value"]
            .as_object()
            .map(|_| &value["value"])
            .expect("status responses carry a value object")
    }

    #[test]
    fn status_request_reports_the_default_stopped_runtime() {
        let value = request(r#"{"operation":"status"}"#);
        let status = expect_status(&value);
        assert_eq!(status["phase"], json!("stopped"));
        assert_eq!(status["active"], json!(false));
        assert_eq!(status["generation"], json!(0));
        assert!(status["diagnostics"].is_object());
    }

    #[test]
    fn stop_on_the_default_runtime_stays_stopped_without_fake_success() {
        let value = request(r#"{"operation":"stop"}"#);
        let status = expect_status(&value);
        assert_eq!(status["phase"], json!("stopped"));
        assert_eq!(status["active"], json!(false));
        assert_eq!(status["diagnostics"]["abandonedRendererWorkers"], json!(0));
    }

    #[test]
    fn visible_and_configure_report_the_runtime_status_without_a_session() {
        let visible = request(r#"{"operation":"visible","visible":true}"#);
        assert_eq!(expect_status(&visible)["phase"], json!("stopped"));

        let configured = request(
            r##"{"operation":"configure","config":{"effect":"dimmed","blurStrength":50,"darkenStrength":28,"darkenColor":"#1c1c1c","acrylicAppearance":"system","acrylicParams":{"brightness":0.8,"contrast":0.85,"noise":0.005,"saturation":1.5,"seed":0.0,"tintColor":[0.23529412,0.23529412,0.23529412],"tintStrength":0.2}}}"##,
        );
        assert_eq!(expect_status(&configured)["phase"], json!("stopped"));
    }

    #[test]
    fn support_request_reports_the_live_desktop_background_support() {
        let value = request(r#"{"operation":"support"}"#);
        let support = expect_status(&value);
        assert_eq!(support["platform"], json!("windows"));
        assert!(support["supportsLiveDesktopBackground"].is_boolean());
        assert!(support["prerequisiteProbe"].is_object());
        assert!(support["rendererProbe"].is_object());
    }

    #[test]
    fn invalid_json_is_reported_as_an_error() {
        let error = expect_error(&request(r#"{"operation":"status""#));
        assert!(error.contains("invalid live desktop request"), "{error}");
    }

    #[test]
    fn unknown_operation_is_reported_as_an_error() {
        let error = expect_error(&request(r#"{"operation":"explode"}"#));
        assert!(error.contains("unknown live desktop operation"), "{error}");
        assert!(error.contains("explode"), "{error}");
    }

    #[test]
    fn missing_operation_is_reported_as_an_error() {
        let error = expect_error(&request(r#"{}"#));
        assert!(error.contains("invalid live desktop request"), "{error}");
    }

    #[test]
    fn missing_parameters_are_reported_as_errors() {
        let start = expect_error(&request(r#"{"operation":"start"}"#));
        assert!(start.contains("windowHandle"), "{start}");

        let visible = expect_error(&request(r#"{"operation":"visible"}"#));
        assert!(visible.contains("visible"), "{visible}");

        let configure = expect_error(&request(r#"{"operation":"configure"}"#));
        assert!(configure.contains("config"), "{configure}");
    }

    #[test]
    fn mismatched_parameter_types_are_reported_as_errors() {
        let visible = expect_error(&request(r#"{"operation":"visible","visible":"yes"}"#));
        assert!(
            visible.contains("invalid live desktop request"),
            "{visible}"
        );

        let handle = expect_error(&request(r#"{"operation":"start","windowHandle":"42"}"#));
        assert!(handle.contains("invalid live desktop request"), "{handle}");

        let config = expect_error(&request(r#"{"operation":"configure","config":42}"#));
        assert!(config.contains("invalid live desktop request"), "{config}");
    }

    #[test]
    fn incomplete_config_is_reported_as_an_error() {
        let error = expect_error(&request(
            r#"{"operation":"configure","config":{"effect":"dimmed"}}"#,
        ));
        assert!(error.contains("invalid live desktop request"), "{error}");
    }

    #[test]
    fn zero_window_handle_is_rejected() {
        let error = expect_error(&request(r#"{"operation":"start","windowHandle":0}"#));
        assert!(error.contains("non-zero"), "{error}");
    }

    #[test]
    fn payload_larger_than_one_mib_is_rejected() {
        let oversized = vec![b' '; LIVE_DESKTOP_REQUEST_MAX_BYTES + 1];
        let error = expect_error(&lumeria_live_desktop_request_with_payload(&oversized));
        assert!(error.contains("exceeds"), "{error}");
    }

    #[test]
    fn one_mib_payload_at_the_limit_is_still_accepted() {
        let mut payload = br#"{"operation":"status"}"#.to_vec();
        payload.resize(LIVE_DESKTOP_REQUEST_MAX_BYTES, b' ');
        let value = lumeria_live_desktop_request_with_payload(&payload);
        assert_eq!(value["ok"], json!(true), "{value}");
    }

    #[test]
    fn empty_payload_is_rejected() {
        let value = lumeria_live_desktop_request_with_payload(b"");
        assert_eq!(value["ok"], json!(false), "{value}");
    }

    #[test]
    fn null_payload_pointer_is_rejected() {
        let response = unsafe { lumeria_live_desktop_request(std::ptr::null(), 0) };
        let value = read_live_desktop_response(response);
        unsafe { lumeria_live_desktop_free(response) };
        assert!(expect_error(&value).contains("null"), "{value}");
    }

    #[test]
    fn invalid_utf8_payload_is_rejected() {
        let value = lumeria_live_desktop_request_with_payload(&[0xff, 0xfe, 0xfd]);
        assert!(expect_error(&value).contains("UTF-8"), "{value}");
    }

    #[test]
    fn freeing_a_null_response_is_a_no_op() {
        unsafe { lumeria_live_desktop_free(std::ptr::null_mut()) };
    }
}

#[cfg(all(test, target_os = "windows"))]
mod windows_tests {
    use super::*;

    use std::ffi::c_void;

    use windows::{
        core::{w, PCWSTR},
        Win32::{
            Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
            UI::WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, UnregisterClassW,
                WNDCLASSW, WS_OVERLAPPED,
            },
        },
    };

    const TEST_WINDOW_CLASS: PCWSTR = w!("LumeriaLiveDesktopTestWindow");

    unsafe extern "system" fn test_window_proc(
        window: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        unsafe { DefWindowProcW(window, message, wparam, lparam) }
    }

    /// Creates a real top-level window owned by the test process.
    fn create_owned_test_window() -> HWND {
        let window_class = WNDCLASSW {
            lpfnWndProc: Some(test_window_proc),
            hInstance: HINSTANCE::default(),
            lpszClassName: TEST_WINDOW_CLASS,
            ..WNDCLASSW::default()
        };
        unsafe {
            let _ = RegisterClassW(&window_class);
            CreateWindowExW(
                Default::default(),
                TEST_WINDOW_CLASS,
                w!("Lumeria live desktop test window"),
                WS_OVERLAPPED,
                0,
                0,
                16,
                16,
                None,
                None,
                None,
                None,
            )
            .expect("the test window must be created in the current process")
        }
    }

    fn destroy_owned_test_window(window: HWND) {
        unsafe {
            let _ = DestroyWindow(window);
            let _ = UnregisterClassW(TEST_WINDOW_CLASS, None);
        }
    }

    #[test]
    fn handle_of_a_window_owned_by_the_current_process_is_accepted() {
        let window = create_owned_test_window();
        let raw = window.0 as isize as i64;

        let resolved = validate_live_desktop_window_handle(raw, current_live_desktop_process_id())
            .expect("a window of the current process must be accepted");
        assert_eq!(resolved.0 as *mut c_void, window.0 as *mut c_void);

        destroy_owned_test_window(window);
    }

    #[test]
    fn handle_of_a_window_owned_by_another_process_is_rejected() {
        let window = create_owned_test_window();
        let raw = window.0 as isize as i64;
        let foreign_process_id = current_live_desktop_process_id().wrapping_add(1);

        let error = validate_live_desktop_window_handle(raw, foreign_process_id)
            .expect_err("a window owned by another process must be rejected");
        assert!(
            error.contains("must belong to the current process"),
            "{error}"
        );
        assert!(error.contains(&foreign_process_id.to_string()), "{error}");

        destroy_owned_test_window(window);
    }

    #[test]
    fn handle_of_a_destroyed_window_is_rejected() {
        let window = create_owned_test_window();
        let raw = window.0 as isize as i64;
        destroy_owned_test_window(window);

        let error = validate_live_desktop_window_handle(raw, current_live_desktop_process_id())
            .expect_err("a destroyed window must be rejected");
        assert!(error.contains("does not exist"), "{error}");
    }

    #[test]
    fn negative_window_handle_values_are_rejected() {
        let error = validate_live_desktop_window_handle(-1, current_live_desktop_process_id())
            .expect_err("a negative window handle must be rejected");
        assert!(error.contains("non-zero"), "{error}");
    }
}
