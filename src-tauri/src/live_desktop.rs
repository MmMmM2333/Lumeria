use serde::{Deserialize, Serialize};

use std::sync::{Arc, Mutex};

#[cfg(target_os = "windows")]
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

#[cfg(target_os = "windows")]
use windows::{
    core::{factory, s, IInspectable, Interface, BOOL, HRESULT, PCSTR, PWSTR},
    Foundation::TypedEventHandler,
    Graphics::{
        Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession},
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
    },
    Win32::{
        Foundation::{CloseHandle, HANDLE, HMODULE, HWND, LPARAM, LUID, POINT, RECT, WPARAM},
        Graphics::{
            Direct3D::{
                D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_10_0,
                D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
            },
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11RenderTargetView,
                ID3D11Resource, ID3D11Texture2D, D3D11_BOX, D3D11_CPU_ACCESS_READ,
                D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ,
                D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
            },
            DirectComposition::{
                DCompositionCreateDevice, DCompositionCreateDevice2,
                IDCompositionColorMatrixEffect, IDCompositionDevice, IDCompositionDevice3,
                IDCompositionGaussianBlurEffect, IDCompositionScaleTransform, IDCompositionSurface,
                IDCompositionTarget, IDCompositionVisual,
            },
            Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED},
            Dxgi::{
                Common::{DXGI_ALPHA_MODE_IGNORE, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC},
                CreateDXGIFactory1, IDXGIAdapter1, IDXGIDevice, IDXGIFactory1, IDXGIOutput1,
                IDXGIOutputDuplication, IDXGIResource, IDXGISurface, DXGI_ADAPTER_FLAG3_SOFTWARE,
                DXGI_ERROR_ACCESS_DENIED, DXGI_ERROR_NOT_FOUND, DXGI_ERROR_WAIT_TIMEOUT,
                DXGI_OUTDUPL_FRAME_INFO,
            },
            Gdi::{MonitorFromWindow, HMONITOR, MONITOR_DEFAULTTONEAREST},
        },
        System::{
            Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED},
            LibraryLoader::{GetProcAddress, LoadLibraryA},
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
            WinRT::{
                Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
                Graphics::Capture::IGraphicsCaptureItemInterop,
            },
        },
        UI::WindowsAndMessaging::{
            EnumChildWindows, EnumWindows, GetAncestor, GetClassNameW, GetClientRect, GetCursorPos,
            GetParent, GetWindowLongPtrW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
            IsWindowVisible, PostMessageW, SetWindowLongPtrW, SetWindowPos, GA_ROOT, GWL_EXSTYLE,
            GWL_STYLE, HWND_BOTTOM, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOOWNERZORDER,
            SWP_NOSENDCHANGING, SWP_NOZORDER, WM_MOUSEMOVE, WS_CAPTION, WS_EX_APPWINDOW,
            WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU,
            WS_THICKFRAME,
        },
    },
};

#[cfg(target_os = "windows")]
const LIVE_DESKTOP_D3D_FEATURE_LEVELS: [D3D_FEATURE_LEVEL; 4] = [
    D3D_FEATURE_LEVEL_11_1,
    D3D_FEATURE_LEVEL_11_0,
    D3D_FEATURE_LEVEL_10_1,
    D3D_FEATURE_LEVEL_10_0,
];

#[cfg(target_os = "windows")]
const LIVE_DESKTOP_INITIAL_FRAME_WAIT_MS: u32 = 100;

#[cfg(target_os = "windows")]
const LIVE_DESKTOP_FRAME_PUMP_INTERVAL_MS: u64 = 16;

#[cfg(target_os = "windows")]
const LIVE_DESKTOP_WGC_FRAME_POOL_BUFFER_COUNT: i32 = 3;

#[cfg(target_os = "windows")]
const LIVE_DESKTOP_WGC_FRAME_EVENT_FALLBACK_MS: u64 = 16;

#[cfg(target_os = "windows")]
const LIVE_DESKTOP_RENDERER_INIT_TIMEOUT_MS: u64 = 10_000;

#[cfg(target_os = "windows")]
const LIVE_DESKTOP_RENDERER_STOP_JOIN_TIMEOUT_MS: u64 = 1_000;

#[cfg(target_os = "windows")]
pub(crate) type LiveDesktopWindowHandle = HWND;

#[cfg(not(target_os = "windows"))]
pub(crate) type LiveDesktopWindowHandle = ();

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopBackgroundSupport {
    platform: &'static str,
    supports_live_desktop_background: bool,
    supports_live_desktop_background_effects: bool,
    reason: &'static str,
    detail: String,
    capture_probe: LiveDesktopCaptureProbe,
    renderer_probe: LiveDesktopRendererProbe,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveDesktopCaptureProbe {
    supports_d3d11: bool,
    supports_desktop_duplication: bool,
    frame_probe: LiveDesktopFrameProbe,
    adapter_count: u32,
    output_count: u32,
    reason: &'static str,
    detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveDesktopFrameProbe {
    supports_frame_texture: bool,
    width: u32,
    height: u32,
    format: i32,
    reason: &'static str,
    detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveDesktopRendererProbe {
    supports_direct_composition: bool,
    supports_window_target: bool,
    supports_root_visual: bool,
    supports_native_renderer: bool,
    supports_native_effects: bool,
    reason: &'static str,
    detail: String,
}

#[derive(Debug)]
pub(crate) struct LiveDesktopRuntime {
    status: LiveDesktopRuntimeStatus,
    renderer_session: Option<LiveDesktopRendererSession>,
    config: LiveDesktopRuntimeConfig,
}

#[derive(Debug)]
struct LiveDesktopRendererSession {
    renderer_probe: LiveDesktopRendererProbe,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    #[cfg(target_os = "windows")]
    stop_sender: Option<mpsc::Sender<()>>,
    #[cfg(target_os = "windows")]
    command_sender: Option<mpsc::Sender<LiveDesktopRendererCommand>>,
    #[cfg(target_os = "windows")]
    exit_receiver: Option<mpsc::Receiver<()>>,
    #[cfg(target_os = "windows")]
    worker: Option<thread::JoinHandle<()>>,
}

#[cfg(target_os = "windows")]
#[derive(Debug)]
enum LiveDesktopRendererCommand {
    Configure(LiveDesktopRuntimeConfig),
    SetVisible(bool),
}

#[cfg(target_os = "windows")]
struct LiveDesktopRendererStartup {
    renderer_probe: LiveDesktopRendererProbe,
    resources: LiveDesktopRendererResources,
}

#[cfg(target_os = "windows")]
struct LiveDesktopRendererResources {
    config: LiveDesktopRuntimeConfig,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    _com: ComApartment,
    _d3d_device: ID3D11Device,
    _d3d_context: ID3D11DeviceContext,
    _capture_duplication: IDXGIOutputDuplication,
    _window_capture: Option<LiveDesktopWindowCapture>,
    _dwm_shared_surface_capture: Option<LiveDesktopDwmSharedSurfaceCapture>,
    _composition_device: IDCompositionDevice,
    _blur_effect: Option<IDCompositionGaussianBlurEffect>,
    _color_matrix_effect: Option<IDCompositionColorMatrixEffect>,
    _target: IDCompositionTarget,
    _root_visual: IDCompositionVisual,
    _scale_transform: IDCompositionScaleTransform,
    _surface: IDCompositionSurface,
}

#[cfg(target_os = "windows")]
struct LiveDesktopWindowCapture {
    hwnd: HWND,
    width: u32,
    height: u32,
    source_label: &'static str,
    detail: String,
    popup_restore_state: Option<LiveDesktopPopupWindowRestoreState>,
    popup_close_command: Option<LiveDesktopWallpaperEnginePopupCloseCommand>,
    mouse_relay: Option<Mutex<LiveDesktopMouseRelay>>,
    _item: GraphicsCaptureItem,
    frame_pool: Direct3D11CaptureFramePool,
    _session: GraphicsCaptureSession,
    frame_arrived_receiver: Option<mpsc::Receiver<()>>,
    frame_arrived_token: Option<i64>,
    _frame_arrived_handler: Option<TypedEventHandler<Direct3D11CaptureFramePool, IInspectable>>,
}

#[cfg(target_os = "windows")]
struct LiveDesktopMouseRelay {
    target_hwnds: Vec<HWND>,
    output_rect: LiveDesktopWindowRect,
    source_width: u32,
    source_height: u32,
    last_position: Option<LiveDesktopMouseRelayPosition>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct LiveDesktopMouseRelayPosition {
    x: i32,
    y: i32,
}

#[cfg(target_os = "windows")]
impl Drop for LiveDesktopWindowCapture {
    fn drop(&mut self) {
        if let Some(command) = self.popup_close_command.as_ref() {
            let _ = close_wallpaper_engine_named_popup(command);
        }
        if let Some(state) = self.popup_restore_state.as_ref() {
            let _ = unsafe { restore_wallpaper_engine_popup_after_capture(state) };
        }
        if let Some(token) = self.frame_arrived_token.take() {
            let _ = self.frame_pool.RemoveFrameArrived(token);
        }
    }
}

#[cfg(target_os = "windows")]
struct LiveDesktopPopupPreparation {
    detail: String,
    restore_state: Option<LiveDesktopPopupWindowRestoreState>,
}

#[cfg(target_os = "windows")]
impl Default for LiveDesktopPopupPreparation {
    fn default() -> Self {
        Self {
            detail: String::new(),
            restore_state: None,
        }
    }
}

#[cfg(target_os = "windows")]
struct LiveDesktopPopupWindowRestoreState {
    hwnd: HWND,
    style: isize,
    ex_style: isize,
    rect: LiveDesktopWindowRect,
}

#[cfg(target_os = "windows")]
#[derive(Clone)]
struct LiveDesktopWallpaperEnginePopupPlan {
    window_name: String,
    monitor_index: u32,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

#[cfg(target_os = "windows")]
struct LiveDesktopWallpaperEnginePopupEnsureResult {
    detail: String,
    close_command: Option<LiveDesktopWallpaperEnginePopupCloseCommand>,
}

#[cfg(target_os = "windows")]
#[derive(Clone)]
struct LiveDesktopWallpaperEnginePopupCloseCommand {
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

#[cfg(target_os = "windows")]
struct LiveDesktopDwmSharedSurfaceCapture {
    hwnd: HWND,
    width: u32,
    height: u32,
    format: i32,
    update_id: u64,
    target_monitor: HMONITOR,
    detail: String,
    source_texture: ID3D11Texture2D,
    _api: LiveDesktopDwmApi,
}

#[cfg(target_os = "windows")]
struct LiveDesktopDwmPixelProbe {
    width: u32,
    height: u32,
    min_rgb: u32,
    max_rgb: u32,
    avg_rgb: u32,
}

#[cfg(target_os = "windows")]
struct LiveDesktopDwmSharedSurfaceCandidate {
    source_texture: ID3D11Texture2D,
    width: u32,
    height: u32,
    format: i32,
    update_id: u64,
    detail: String,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
struct LiveDesktopDwmApi {
    dx_get_window_shared_surface: Option<DwmDxGetWindowSharedSurfaceFn>,
    dx_get_window_shared_surface_name: &'static str,
    dx_update_window_shared_surface: Option<DwmDxUpdateWindowSharedSurfaceFn>,
    dx_update_window_shared_surface_name: &'static str,
    get_dx_shared_surface: Option<DwmGetDxSharedSurfaceFn>,
    get_dx_shared_surface_name: &'static str,
}

#[cfg(target_os = "windows")]
type DwmDxGetWindowSharedSurfaceFn = unsafe extern "system" fn(
    HWND,
    LUID,
    HMONITOR,
    u32,
    *mut i32,
    *mut HANDLE,
    *mut u64,
) -> HRESULT;

#[cfg(target_os = "windows")]
type DwmDxUpdateWindowSharedSurfaceFn =
    unsafe extern "system" fn(HWND, u64, i32, HMONITOR, *mut RECT) -> HRESULT;

#[cfg(target_os = "windows")]
type DwmGetDxSharedSurfaceFn = unsafe extern "system" fn(
    HWND,
    *mut HANDLE,
    *mut LUID,
    *mut u32,
    *mut u32,
    *mut u64,
) -> HRESULT;

#[cfg(target_os = "windows")]
struct LiveDesktopWindowHandleCollector {
    handles: Vec<isize>,
    seen: HashSet<isize>,
}

#[cfg(target_os = "windows")]
enum LiveDesktopRendererStartupMessage {
    Progress(String),
    Ready(LiveDesktopRendererProbe),
    Failed(LiveDesktopRendererProbe),
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct LiveDesktopVisualPlacement {
    scale: f32,
    offset_x: f32,
    offset_y: f32,
}

#[cfg(target_os = "windows")]
struct ComApartment;

#[cfg(target_os = "windows")]
struct LiveDesktopCaptureStartup {
    output_index: u32,
    output_width: u32,
    output_height: u32,
    output_rect: LiveDesktopWindowRect,
    output_name: String,
    duplication: IDXGIOutputDuplication,
}

#[cfg(target_os = "windows")]
struct LiveDesktopD3DDevice {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
}

#[cfg(target_os = "windows")]
struct LiveDesktopNativeEffects {
    color_matrix_effect: Option<IDCompositionColorMatrixEffect>,
    blur_effect: Option<IDCompositionGaussianBlurEffect>,
    detail: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopRuntimeStatus {
    phase: &'static str,
    active: bool,
    generation: u64,
    reason: &'static str,
    detail: String,
    diagnostics: LiveDesktopRuntimeDiagnostics,
    window_diagnostics: LiveDesktopWindowDiagnostics,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopRuntimeDiagnostics {
    frames_copied: u64,
    frame_timeouts: u64,
    copy_errors: u64,
    commit_errors: u64,
    frame_arrived_events: u64,
    frame_arrived_dropped_signals: u64,
    frame_copy_samples: u64,
    frame_copy_micros_total: u64,
    last_frame_copy_micros: u64,
    max_frame_copy_micros: u64,
    frame_commit_samples: u64,
    frame_commit_micros_total: u64,
    last_frame_commit_micros: u64,
    max_frame_commit_micros: u64,
    config_updates: u64,
    config_errors: u64,
    last_frame_width: u32,
    last_frame_height: u32,
    last_frame_format: i32,
    test_pattern_frames: u64,
    dwm_surface_updates: u64,
    dwm_surface_update_errors: u64,
    last_dwm_surface_update_rect_width: u32,
    last_dwm_surface_update_rect_height: u32,
    pixel_probe_samples: u64,
    pixel_probe_errors: u64,
    last_pixel_probe_width: u32,
    last_pixel_probe_height: u32,
    last_pixel_probe_min_rgb: u32,
    last_pixel_probe_max_rgb: u32,
    last_pixel_probe_avg_rgb: u32,
    last_error: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopWindowDiagnostics {
    platform: &'static str,
    available: bool,
    reason: &'static str,
    detail: String,
    window_count: usize,
    candidate_count: usize,
    windows: Vec<LiveDesktopWindowInfo>,
    candidates: Vec<LiveDesktopWindowInfo>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopWindowInfo {
    hwnd: String,
    parent_hwnd: String,
    root_hwnd: String,
    pid: u32,
    class_name: String,
    title: String,
    process_name: String,
    role: String,
    candidate_reason: String,
    visible: bool,
    style: String,
    ex_style: String,
    cloaked: u32,
    rect: LiveDesktopWindowRect,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopWindowRect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
    width: i32,
    height: i32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopRuntimeConfig {
    effect: LiveDesktopBackgroundEffect,
    #[serde(default)]
    diagnostic_mode: LiveDesktopDiagnosticMode,
    blur_strength: u32,
    darken_strength: u32,
    darken_color: String,
    acrylic_appearance: LiveDesktopAcrylicAppearance,
    acrylic_params: LiveDesktopAcrylicParams,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum LiveDesktopBackgroundEffect {
    None,
    Dimmed,
    Blur,
    AcrylicWebgl,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum LiveDesktopDiagnosticMode {
    #[default]
    #[serde(alias = "capture")]
    WorkerWCapture,
    WallpaperEnginePopupCapture,
    DwmSharedSurfaceCapture,
    MonitorCapture,
    TestPattern,
}

impl LiveDesktopDiagnosticMode {
    fn uses_window_capture(&self) -> bool {
        matches!(
            self,
            Self::WorkerWCapture | Self::WallpaperEnginePopupCapture
        )
    }

    fn uses_dwm_shared_surface_capture(&self) -> bool {
        matches!(self, Self::DwmSharedSurfaceCapture)
    }

    fn window_capture_label(&self) -> &'static str {
        match self {
            Self::WallpaperEnginePopupCapture => "Wallpaper Engine popup WGC",
            _ => "WorkerW WGC",
        }
    }

    fn window_capture_unavailable_reason(&self) -> &'static str {
        match self {
            Self::WallpaperEnginePopupCapture => "wallpaperEnginePopupCaptureUnavailable",
            _ => "workerWCaptureUnavailable",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum LiveDesktopAcrylicAppearance {
    System,
    Dark,
    Light,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveDesktopAcrylicParams {
    brightness: f32,
    contrast: f32,
    noise: f32,
    saturation: f32,
    seed: f32,
    tint_color: [f32; 3],
    tint_strength: f32,
}

impl Default for LiveDesktopRuntimeConfig {
    fn default() -> Self {
        Self {
            effect: LiveDesktopBackgroundEffect::Dimmed,
            diagnostic_mode: LiveDesktopDiagnosticMode::WorkerWCapture,
            blur_strength: 50,
            darken_strength: 28,
            darken_color: "#1c1c1c".to_string(),
            acrylic_appearance: LiveDesktopAcrylicAppearance::System,
            acrylic_params: LiveDesktopAcrylicParams::default(),
        }
    }
}

impl Default for LiveDesktopAcrylicParams {
    fn default() -> Self {
        Self {
            brightness: 0.8,
            contrast: 0.85,
            noise: 0.005,
            saturation: 1.5,
            seed: 0.0,
            tint_color: [0.23529412, 0.23529412, 0.23529412],
            tint_strength: 0.2,
        }
    }
}

impl Default for LiveDesktopRuntime {
    fn default() -> Self {
        Self {
            status: LiveDesktopRuntimeStatus::stopped(0),
            renderer_session: None,
            config: LiveDesktopRuntimeConfig::default(),
        }
    }
}

impl LiveDesktopRuntime {
    pub(crate) fn status(&self) -> LiveDesktopRuntimeStatus {
        let mut status = self.status.clone();
        if let Some(session) = self.renderer_session.as_ref() {
            let diagnostics = session.diagnostics();
            status.detail = append_live_desktop_runtime_diagnostics(&status.detail, &diagnostics);
            status.diagnostics = diagnostics;
        }
        status.window_diagnostics = live_desktop_window_diagnostics();
        status
    }

    pub(crate) fn start_for_window(
        &mut self,
        window_handle: LiveDesktopWindowHandle,
    ) -> LiveDesktopRuntimeStatus {
        let config = self.config.clone();
        self.start_with_renderer_session(probe_live_desktop_capture(), || {
            LiveDesktopRendererSession::start_for_window(window_handle, config)
        })
    }

    pub(crate) fn configure(
        &mut self,
        config: LiveDesktopRuntimeConfig,
    ) -> LiveDesktopRuntimeStatus {
        self.config = config.clone();
        if let Some(session) = self.renderer_session.as_ref() {
            session.configure(config);
        }
        self.status()
    }

    pub(crate) fn set_visible(&mut self, visible: bool) -> LiveDesktopRuntimeStatus {
        if let Some(session) = self.renderer_session.as_ref() {
            session.set_visible(visible);
        }
        self.status()
    }

    pub(crate) fn stop(&mut self) -> LiveDesktopRuntimeStatus {
        if self.status.phase == "stopped" {
            return self.status();
        }
        self.renderer_session = None;
        self.status = LiveDesktopRuntimeStatus::stopped(self.status.generation + 1);
        self.status()
    }

    #[cfg(test)]
    fn start_with_probes(
        &mut self,
        capture_probe: LiveDesktopCaptureProbe,
        renderer_probe: LiveDesktopRendererProbe,
    ) -> LiveDesktopRuntimeStatus {
        self.start_with_renderer_session(capture_probe, || {
            LiveDesktopRendererSession::create_for_probe(renderer_probe)
        })
    }

    fn start_with_renderer_session<F>(
        &mut self,
        capture_probe: LiveDesktopCaptureProbe,
        make_renderer_session: F,
    ) -> LiveDesktopRuntimeStatus
    where
        F: FnOnce() -> Result<LiveDesktopRendererSession, LiveDesktopRendererProbe>,
    {
        if self.status.phase == "running" || self.status.phase == "starting" {
            return self.status();
        }
        self.renderer_session = None;

        let generation = self.status.generation + 1;
        self.status = LiveDesktopRuntimeStatus {
            phase: "starting",
            active: false,
            generation,
            reason: "starting",
            detail: "Live desktop runtime start requested".to_string(),
            diagnostics: LiveDesktopRuntimeDiagnostics::default(),
            window_diagnostics: live_desktop_window_diagnostics(),
        };

        if !capture_probe.supports_desktop_duplication {
            self.status = LiveDesktopRuntimeStatus::failed(
                generation,
                capture_probe.reason,
                capture_probe.detail,
            );
            return self.status();
        }

        let renderer_session = match make_renderer_session() {
            Ok(session) => session,
            Err(probe) => {
                self.status =
                    LiveDesktopRuntimeStatus::failed(generation, probe.reason, probe.detail);
                return self.status();
            }
        };
        let renderer_probe = renderer_session.renderer_probe.clone();
        if !renderer_probe.supports_native_renderer {
            self.status = LiveDesktopRuntimeStatus::failed(
                generation,
                renderer_probe.reason,
                renderer_probe.detail,
            );
            return self.status();
        }
        let running_detail = format!("Live desktop runtime is running: {}", renderer_probe.detail);
        self.renderer_session = Some(renderer_session);
        self.status = LiveDesktopRuntimeStatus {
            phase: "running",
            active: true,
            generation,
            reason: "running",
            detail: running_detail,
            diagnostics: LiveDesktopRuntimeDiagnostics::default(),
            window_diagnostics: live_desktop_window_diagnostics(),
        };
        self.status()
    }
}

impl LiveDesktopRendererSession {
    #[cfg(target_os = "windows")]
    fn start_for_window(
        window_handle: LiveDesktopWindowHandle,
        config: LiveDesktopRuntimeConfig,
    ) -> Result<Self, LiveDesktopRendererProbe> {
        let (ready_sender, ready_receiver) = mpsc::channel();
        let (stop_sender, stop_receiver) = mpsc::channel();
        let (command_sender, command_receiver) = mpsc::channel();
        let (exit_sender, exit_receiver) = mpsc::channel();
        let diagnostics = Arc::new(Mutex::new(LiveDesktopRuntimeDiagnostics::default()));
        let worker_diagnostics = Arc::clone(&diagnostics);
        let window_handle_value = window_handle.0 as isize;
        let worker = thread::spawn(move || {
            let window_handle = HWND(window_handle_value as _);
            report_live_desktop_renderer_startup_progress(&ready_sender, "Renderer worker started");
            match unsafe {
                create_live_desktop_renderer_resources(
                    window_handle,
                    config,
                    worker_diagnostics,
                    &ready_sender,
                )
            } {
                Ok(startup) => {
                    let renderer_probe = startup.renderer_probe.clone();
                    if ready_sender
                        .send(LiveDesktopRendererStartupMessage::Ready(renderer_probe))
                        .is_ok()
                    {
                        let mut resources = startup.resources;
                        resources.run_frame_pump(stop_receiver, command_receiver);
                    }
                }
                Err(probe) => {
                    let _ = ready_sender.send(LiveDesktopRendererStartupMessage::Failed(probe));
                }
            }
            let _ = exit_sender.send(());
        });

        let renderer_probe = {
            let deadline =
                Instant::now() + Duration::from_millis(LIVE_DESKTOP_RENDERER_INIT_TIMEOUT_MS);
            let mut last_progress = "Renderer worker has not reported progress yet".to_string();
            loop {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    let _ = stop_sender.send(());
                    return Err(LiveDesktopRendererProbe::unavailable(
                        "nativeRendererInitializationTimedOut",
                        format!(
                            "DirectComposition renderer worker did not initialize within {} ms; last progress: {}",
                            LIVE_DESKTOP_RENDERER_INIT_TIMEOUT_MS, last_progress
                        ),
                    ));
                }
                match ready_receiver.recv_timeout(remaining) {
                    Ok(LiveDesktopRendererStartupMessage::Ready(probe)) => break probe,
                    Ok(LiveDesktopRendererStartupMessage::Failed(probe)) => {
                        let _ = worker.join();
                        return Err(probe);
                    }
                    Ok(LiveDesktopRendererStartupMessage::Progress(progress)) => {
                        last_progress = progress;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        let _ = stop_sender.send(());
                        return Err(LiveDesktopRendererProbe::unavailable(
                            "nativeRendererInitializationTimedOut",
                            format!(
                                "DirectComposition renderer worker did not initialize within {} ms; last progress: {}",
                                LIVE_DESKTOP_RENDERER_INIT_TIMEOUT_MS, last_progress
                            ),
                        ));
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        let _ = worker.join();
                        return Err(LiveDesktopRendererProbe::unavailable(
                            "nativeRendererWorkerExited",
                            format!(
                                "DirectComposition renderer worker exited before reporting initialization; last progress: {}",
                                last_progress
                            ),
                        ));
                    }
                }
            }
        };

        Ok(Self {
            renderer_probe,
            diagnostics,
            stop_sender: Some(stop_sender),
            command_sender: Some(command_sender),
            exit_receiver: Some(exit_receiver),
            worker: Some(worker),
        })
    }

    #[cfg(not(target_os = "windows"))]
    fn start_for_window(
        _window_handle: LiveDesktopWindowHandle,
        _config: LiveDesktopRuntimeConfig,
    ) -> Result<Self, LiveDesktopRendererProbe> {
        Err(probe_live_desktop_renderer())
    }

    fn configure(&self, config: LiveDesktopRuntimeConfig) {
        #[cfg(target_os = "windows")]
        if let Some(command_sender) = self.command_sender.as_ref() {
            let _ = command_sender.send(LiveDesktopRendererCommand::Configure(config));
        }
    }

    fn set_visible(&self, visible: bool) {
        #[cfg(target_os = "windows")]
        if let Some(command_sender) = self.command_sender.as_ref() {
            let _ = command_sender.send(LiveDesktopRendererCommand::SetVisible(visible));
        }
    }

    fn diagnostics(&self) -> LiveDesktopRuntimeDiagnostics {
        self.diagnostics
            .lock()
            .map(|diagnostics| diagnostics.clone())
            .unwrap_or_default()
    }

    #[cfg(test)]
    fn create_for_probe(
        renderer_probe: LiveDesktopRendererProbe,
    ) -> Result<Self, LiveDesktopRendererProbe> {
        if !renderer_probe.supports_direct_composition
            || !renderer_probe.supports_window_target
            || !renderer_probe.supports_root_visual
        {
            return Err(renderer_probe);
        }
        Ok(Self {
            renderer_probe,
            diagnostics: Arc::new(Mutex::new(LiveDesktopRuntimeDiagnostics::default())),
            #[cfg(target_os = "windows")]
            stop_sender: None,
            #[cfg(target_os = "windows")]
            command_sender: None,
            #[cfg(target_os = "windows")]
            exit_receiver: None,
            #[cfg(target_os = "windows")]
            worker: None,
        })
    }
}

#[cfg(target_os = "windows")]
impl Drop for LiveDesktopRendererSession {
    fn drop(&mut self) {
        if let Some(stop_sender) = self.stop_sender.take() {
            let _ = stop_sender.send(());
        }
        if let Some(exit_receiver) = self.exit_receiver.take() {
            let _ = exit_receiver.recv_timeout(Duration::from_millis(
                LIVE_DESKTOP_RENDERER_STOP_JOIN_TIMEOUT_MS,
            ));
        }
        if let Some(worker) = self.worker.take() {
            if worker.is_finished() {
                let _ = worker.join();
            }
        }
    }
}

#[cfg(target_os = "windows")]
impl ComApartment {
    unsafe fn initialize() -> Result<Self, String> {
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
            .ok()
            .map_err(|error| error.to_string())?;
        Ok(Self)
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

#[cfg(target_os = "windows")]
impl LiveDesktopRendererResources {
    fn run_frame_pump(
        &mut self,
        stop_receiver: mpsc::Receiver<()>,
        command_receiver: mpsc::Receiver<LiveDesktopRendererCommand>,
    ) {
        loop {
            self.apply_pending_commands(&command_receiver);
            if self.config.diagnostic_mode.uses_window_capture() {
                if self.wait_for_window_capture_frame_or_stop(&stop_receiver) {
                    break;
                }
                continue;
            }
            match stop_receiver
                .recv_timeout(Duration::from_millis(LIVE_DESKTOP_FRAME_PUMP_INTERVAL_MS))
            {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let _ = unsafe { self.copy_next_frame_to_surface() };
                }
            }
        }
    }

    fn wait_for_window_capture_frame_or_stop(&self, stop_receiver: &mpsc::Receiver<()>) -> bool {
        if live_desktop_renderer_should_stop(stop_receiver) {
            return true;
        }

        let frame_arrived_receiver = self
            ._window_capture
            .as_ref()
            .and_then(|capture| capture.frame_arrived_receiver.as_ref());
        if let Some(frame_arrived_receiver) = frame_arrived_receiver {
            match frame_arrived_receiver.recv_timeout(Duration::from_millis(
                LIVE_DESKTOP_WGC_FRAME_EVENT_FALLBACK_MS,
            )) {
                Ok(()) => {
                    while frame_arrived_receiver.try_recv().is_ok() {}
                    let _ = unsafe { self.copy_next_frame_to_surface() };
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let _ = unsafe { self.copy_next_frame_to_surface() };
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    let _ = unsafe { self.copy_next_frame_to_surface() };
                }
            }
            return live_desktop_renderer_should_stop(stop_receiver);
        }

        match stop_receiver.recv_timeout(Duration::from_millis(LIVE_DESKTOP_FRAME_PUMP_INTERVAL_MS))
        {
            Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => true,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let _ = unsafe { self.copy_next_frame_to_surface() };
                false
            }
        }
    }

    fn apply_pending_commands(
        &mut self,
        command_receiver: &mpsc::Receiver<LiveDesktopRendererCommand>,
    ) {
        let mut did_update = false;
        let mut next_visible = None;
        for command in command_receiver.try_iter() {
            match command {
                LiveDesktopRendererCommand::Configure(config) => {
                    self.config = config;
                    did_update = true;
                }
                LiveDesktopRendererCommand::SetVisible(visible) => {
                    next_visible = Some(visible);
                }
            }
        }
        if did_update {
            match unsafe { self.apply_current_config_to_visual() } {
                Ok(()) => record_live_desktop_config_update(&self.diagnostics),
                Err(error) => record_live_desktop_config_error(&self.diagnostics, &error),
            }
        }
        if let Some(visible) = next_visible {
            if let Err(error) = unsafe { self.set_visual_visible(visible) } {
                record_live_desktop_config_error(&self.diagnostics, &error);
            }
        }
    }

    unsafe fn apply_current_config_to_visual(&self) -> Result<(), String> {
        unsafe {
            apply_live_desktop_config_to_effects(
                self._blur_effect.as_ref(),
                self._color_matrix_effect.as_ref(),
                &self.config,
            )
        }?;
        unsafe { self._composition_device.Commit() }.map_err(|error| error.to_string())?;
        Ok(())
    }

    unsafe fn set_visual_visible(&self, visible: bool) -> Result<(), String> {
        if visible {
            unsafe { self._target.SetRoot(&self._root_visual) }
        } else {
            unsafe { self._target.SetRoot(None::<&IDCompositionVisual>) }
        }
        .map_err(|error| error.to_string())?;
        unsafe { self._composition_device.Commit() }.map_err(|error| error.to_string())?;
        Ok(())
    }

    unsafe fn copy_next_frame_to_surface(&self) -> Result<bool, String> {
        if self.config.diagnostic_mode == LiveDesktopDiagnosticMode::TestPattern {
            let copy_started = Instant::now();
            let pattern_frame = match unsafe {
                draw_live_desktop_test_pattern_to_composition_surface(
                    &self._surface,
                    &self._d3d_device,
                    &self._d3d_context,
                    self.diagnostics
                        .lock()
                        .map(|diagnostics| diagnostics.test_pattern_frames)
                        .unwrap_or_default(),
                )
            } {
                Ok(frame_probe) => frame_probe,
                Err(error) => {
                    record_live_desktop_copy_error(&self.diagnostics, &error);
                    return Err(error);
                }
            };
            record_live_desktop_frame_copy_duration(&self.diagnostics, copy_started.elapsed());
            let commit_started = Instant::now();
            if let Err(error) = unsafe { self._composition_device.Commit() } {
                let detail = error.to_string();
                record_live_desktop_commit_error(&self.diagnostics, &detail);
                return Err(detail);
            }
            record_live_desktop_frame_commit_duration(&self.diagnostics, commit_started.elapsed());
            record_live_desktop_test_pattern_frame(&self.diagnostics, &pattern_frame);
            return Ok(true);
        }

        if self
            .config
            .diagnostic_mode
            .uses_dwm_shared_surface_capture()
        {
            let dwm_capture = match self._dwm_shared_surface_capture.as_ref() {
                Some(dwm_capture) => dwm_capture,
                None => {
                    let error =
                        "DWM shared surface capture is unavailable; no DWM surface was initialized"
                            .to_string();
                    record_live_desktop_copy_error(&self.diagnostics, &error);
                    return Err(error);
                }
            };
            let copy_started = Instant::now();
            let frame_probe = match unsafe {
                copy_dwm_shared_surface_frame_to_composition_surface(
                    dwm_capture,
                    &self._surface,
                    &self._d3d_device,
                    &self._d3d_context,
                    &self.diagnostics,
                )
            } {
                Ok(frame_probe) => frame_probe,
                Err(error) => {
                    record_live_desktop_copy_error(&self.diagnostics, &error);
                    return Err(error);
                }
            };
            record_live_desktop_frame_copy_duration(&self.diagnostics, copy_started.elapsed());
            let commit_started = Instant::now();
            if let Err(error) = unsafe { self._composition_device.Commit() } {
                let detail = error.to_string();
                record_live_desktop_commit_error(&self.diagnostics, &detail);
                return Err(detail);
            }
            record_live_desktop_frame_commit_duration(&self.diagnostics, commit_started.elapsed());
            record_live_desktop_frame_copied(&self.diagnostics, &frame_probe);
            return Ok(true);
        }

        if self.config.diagnostic_mode.uses_window_capture() {
            let window_capture = match self._window_capture.as_ref() {
                Some(window_capture) => window_capture,
                None => {
                    let error = format!(
                        "{} is unavailable; no WGC session was initialized",
                        self.config.diagnostic_mode.window_capture_label()
                    );
                    record_live_desktop_copy_error(&self.diagnostics, &error);
                    return Err(error);
                }
            };
            unsafe { relay_wallpaper_engine_popup_mouse(window_capture) };
            let copy_started = Instant::now();
            let copied_frame = match unsafe {
                copy_window_capture_frame_to_composition_surface(
                    window_capture,
                    &self._surface,
                    &self._d3d_context,
                )
            } {
                Ok(copied_frame) => copied_frame,
                Err(error) => {
                    record_live_desktop_copy_error(&self.diagnostics, &error);
                    return Err(error);
                }
            };
            if copied_frame.is_none() {
                record_live_desktop_frame_timeout(&self.diagnostics);
                return Ok(false);
            }
            record_live_desktop_frame_copy_duration(&self.diagnostics, copy_started.elapsed());
            let frame_probe = copied_frame.expect("checked copied WGC frame");
            let commit_started = Instant::now();
            if let Err(error) = unsafe { self._composition_device.Commit() } {
                let detail = error.to_string();
                record_live_desktop_commit_error(&self.diagnostics, &detail);
                return Err(detail);
            }
            record_live_desktop_frame_commit_duration(&self.diagnostics, commit_started.elapsed());
            record_live_desktop_frame_copied(&self.diagnostics, &frame_probe);
            return Ok(true);
        }

        let copy_started = Instant::now();
        let copied_frame = match unsafe {
            copy_duplication_frame_to_composition_surface(
                &self._capture_duplication,
                &self._surface,
                &self._d3d_context,
                0,
            )
        } {
            Ok(copied_frame) => copied_frame,
            Err(error) => {
                record_live_desktop_copy_error(&self.diagnostics, &error);
                return Err(error);
            }
        };
        if copied_frame.is_none() {
            record_live_desktop_frame_timeout(&self.diagnostics);
            return Ok(false);
        }
        record_live_desktop_frame_copy_duration(&self.diagnostics, copy_started.elapsed());
        let frame_probe = copied_frame.expect("checked copied frame");
        let commit_started = Instant::now();
        if let Err(error) = unsafe { self._composition_device.Commit() } {
            let detail = error.to_string();
            record_live_desktop_commit_error(&self.diagnostics, &detail);
            return Err(detail);
        }
        record_live_desktop_frame_commit_duration(&self.diagnostics, commit_started.elapsed());
        record_live_desktop_frame_copied(&self.diagnostics, &frame_probe);
        Ok(true)
    }
}

#[cfg(target_os = "windows")]
fn live_desktop_renderer_should_stop(stop_receiver: &mpsc::Receiver<()>) -> bool {
    match stop_receiver.try_recv() {
        Ok(()) | Err(mpsc::TryRecvError::Disconnected) => true,
        Err(mpsc::TryRecvError::Empty) => false,
    }
}

impl LiveDesktopRendererProbe {
    fn native_renderer_available_for_probe(
        supports_native_effects: bool,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            supports_direct_composition: true,
            supports_window_target: false,
            supports_root_visual: false,
            supports_native_renderer: true,
            supports_native_effects,
            reason: "available",
            detail: detail.into(),
        }
    }

    #[cfg(test)]
    fn native_renderer_unimplemented_for_window(detail: impl Into<String>) -> Self {
        Self {
            supports_direct_composition: true,
            supports_window_target: true,
            supports_root_visual: true,
            supports_native_renderer: false,
            supports_native_effects: false,
            reason: "nativeRendererNotImplemented",
            detail: detail.into(),
        }
    }

    fn native_renderer_available_for_window(
        supports_native_effects: bool,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            supports_direct_composition: true,
            supports_window_target: true,
            supports_root_visual: true,
            supports_native_renderer: true,
            supports_native_effects,
            reason: "available",
            detail: detail.into(),
        }
    }

    fn unavailable(reason: &'static str, detail: impl Into<String>) -> Self {
        Self {
            supports_direct_composition: false,
            supports_window_target: false,
            supports_root_visual: false,
            supports_native_renderer: false,
            supports_native_effects: false,
            reason,
            detail: detail.into(),
        }
    }

    fn window_target_unavailable(reason: &'static str, detail: impl Into<String>) -> Self {
        Self {
            supports_direct_composition: true,
            supports_window_target: false,
            supports_root_visual: false,
            supports_native_renderer: false,
            supports_native_effects: false,
            reason,
            detail: detail.into(),
        }
    }

    fn root_visual_unavailable(reason: &'static str, detail: impl Into<String>) -> Self {
        Self {
            supports_direct_composition: true,
            supports_window_target: true,
            supports_root_visual: false,
            supports_native_renderer: false,
            supports_native_effects: false,
            reason,
            detail: detail.into(),
        }
    }

    #[cfg(test)]
    fn native_renderer_unimplemented(detail: impl Into<String>) -> Self {
        Self {
            supports_direct_composition: true,
            supports_window_target: false,
            supports_root_visual: false,
            supports_native_renderer: false,
            supports_native_effects: false,
            reason: "nativeRendererNotImplemented",
            detail: detail.into(),
        }
    }

    #[cfg(test)]
    fn available() -> Self {
        Self {
            supports_direct_composition: true,
            supports_window_target: true,
            supports_root_visual: true,
            supports_native_renderer: true,
            supports_native_effects: true,
            reason: "available",
            detail: "Native renderer test session is available".to_string(),
        }
    }
}

#[cfg(target_os = "windows")]
fn report_live_desktop_renderer_startup_progress(
    sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
    detail: impl Into<String>,
) {
    let _ = sender.send(LiveDesktopRendererStartupMessage::Progress(detail.into()));
}

impl LiveDesktopRuntimeStatus {
    fn stopped(generation: u64) -> Self {
        Self {
            phase: "stopped",
            active: false,
            generation,
            reason: "stopped",
            detail: "Live desktop runtime is stopped".to_string(),
            diagnostics: LiveDesktopRuntimeDiagnostics::default(),
            window_diagnostics: LiveDesktopWindowDiagnostics::unavailable(
                current_platform(),
                "notProbed",
                "Live desktop window diagnostics have not been probed yet".to_string(),
            ),
        }
    }

    fn failed(generation: u64, reason: &'static str, detail: String) -> Self {
        Self {
            phase: "failed",
            active: false,
            generation,
            reason,
            detail,
            diagnostics: LiveDesktopRuntimeDiagnostics::default(),
            window_diagnostics: live_desktop_window_diagnostics(),
        }
    }
}

impl LiveDesktopRuntimeDiagnostics {
    fn summary(&self) -> String {
        let mut parts = vec![
            format!("framesCopied={}", self.frames_copied),
            format!("timeouts={}", self.frame_timeouts),
            format!("copyErrors={}", self.copy_errors),
            format!("commitErrors={}", self.commit_errors),
            format!("frameArrivedEvents={}", self.frame_arrived_events),
            format!(
                "frameArrivedDroppedSignals={}",
                self.frame_arrived_dropped_signals
            ),
            format!("configUpdates={}", self.config_updates),
            format!("configErrors={}", self.config_errors),
            format!("testPatternFrames={}", self.test_pattern_frames),
            format!("dwmSurfaceUpdates={}", self.dwm_surface_updates),
            format!("dwmSurfaceUpdateErrors={}", self.dwm_surface_update_errors),
            format!("pixelProbeSamples={}", self.pixel_probe_samples),
            format!("pixelProbeErrors={}", self.pixel_probe_errors),
        ];
        if self.frame_copy_samples > 0 {
            parts.push(format!(
                "copyMicros=avg {} last {} max {}",
                self.frame_copy_micros_total / self.frame_copy_samples,
                self.last_frame_copy_micros,
                self.max_frame_copy_micros
            ));
        }
        if self.frame_commit_samples > 0 {
            parts.push(format!(
                "commitMicros=avg {} last {} max {}",
                self.frame_commit_micros_total / self.frame_commit_samples,
                self.last_frame_commit_micros,
                self.max_frame_commit_micros
            ));
        }
        if self.last_dwm_surface_update_rect_width > 0
            || self.last_dwm_surface_update_rect_height > 0
        {
            parts.push(format!(
                "lastDwmUpdateRect={}x{}",
                self.last_dwm_surface_update_rect_width, self.last_dwm_surface_update_rect_height
            ));
        }
        if self.pixel_probe_samples > 0 {
            parts.push(format!(
                "lastPixelProbe={}x{} min {} max {} avg {}",
                self.last_pixel_probe_width,
                self.last_pixel_probe_height,
                self.last_pixel_probe_min_rgb,
                self.last_pixel_probe_max_rgb,
                self.last_pixel_probe_avg_rgb
            ));
        }
        if self.last_frame_width > 0 && self.last_frame_height > 0 {
            parts.push(format!(
                "lastFrame={}x{} format {}",
                self.last_frame_width, self.last_frame_height, self.last_frame_format
            ));
        }
        if !self.last_error.is_empty() {
            parts.push(format!("lastError={}", self.last_error));
        }
        parts.join(", ")
    }
}

fn append_live_desktop_runtime_diagnostics(
    detail: &str,
    diagnostics: &LiveDesktopRuntimeDiagnostics,
) -> String {
    format!(
        "{}; frame pump diagnostics: {}",
        detail,
        diagnostics.summary()
    )
}

impl LiveDesktopWindowDiagnostics {
    fn unavailable(platform: &'static str, reason: &'static str, detail: String) -> Self {
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

fn live_desktop_window_diagnostics() -> LiveDesktopWindowDiagnostics {
    #[cfg(target_os = "windows")]
    {
        unsafe { probe_windows_live_desktop_windows() }
    }

    #[cfg(not(target_os = "windows"))]
    {
        LiveDesktopWindowDiagnostics::unavailable(
            current_platform(),
            "unsupportedPlatform",
            "WorkerW window diagnostics are only available on Windows".to_string(),
        )
    }
}

fn classify_live_desktop_window(
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
unsafe fn probe_windows_live_desktop_windows() -> LiveDesktopWindowDiagnostics {
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

fn is_live_desktop_root_class(class_name: &str) -> bool {
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
unsafe fn read_live_desktop_window_long(
    hwnd: HWND,
    index: windows::Win32::UI::WindowsAndMessaging::WINDOW_LONG_PTR_INDEX,
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

fn format_live_desktop_window_long(value: isize) -> String {
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
fn read_live_desktop_process_image_path(pid: u32) -> Option<String> {
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
unsafe fn read_live_desktop_window_client_size(hwnd: HWND) -> Option<(u32, u32)> {
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
fn format_live_desktop_window_handle(hwnd: HWND) -> String {
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

fn collect_live_desktop_wgc_targets(
    diagnostics: &LiveDesktopWindowDiagnostics,
) -> Vec<LiveDesktopWindowInfo> {
    let mut targets = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
    for info in diagnostics.candidates.iter() {
        push_live_desktop_wgc_target(&mut targets, &mut seen, info);
    }
    for info in diagnostics.candidates.iter() {
        if info.parent_hwnd.is_empty() {
            continue;
        }
        if let Some(parent) = diagnostics
            .windows
            .iter()
            .find(|candidate| candidate.hwnd == info.parent_hwnd)
        {
            push_live_desktop_wgc_target(&mut targets, &mut seen, parent);
        }
    }
    for info in diagnostics.windows.iter() {
        if info.role == "workerw" || info.role == "progman" {
            push_live_desktop_wgc_target(&mut targets, &mut seen, info);
        }
    }
    targets
}

fn collect_wallpaper_engine_popup_wgc_targets(
    diagnostics: &LiveDesktopWindowDiagnostics,
    preferred_window_name: Option<&str>,
) -> Vec<LiveDesktopWindowInfo> {
    let mut targets = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
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

fn wallpaper_engine_popup_target_matches_window_name(
    target: &LiveDesktopWindowInfo,
    diagnostics: &LiveDesktopWindowDiagnostics,
    window_name: &str,
) -> bool {
    wallpaper_engine_popup_root_for_target(target, diagnostics)
        .map(|popup| popup.title == window_name)
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn create_wallpaper_engine_popup_plan(
    capture: &LiveDesktopCaptureStartup,
) -> LiveDesktopWallpaperEnginePopupPlan {
    LiveDesktopWallpaperEnginePopupPlan {
        window_name: format!(
            "LaunchPad::LiveDesktop::display{}::{}x{}",
            capture.output_index, capture.output_width, capture.output_height
        ),
        monitor_index: capture.output_index,
        width: capture.output_width.max(1),
        height: capture.output_height.max(1),
        x: -(capture.output_width.max(1) as i32) - 128,
        y: 0,
    }
}

#[cfg(target_os = "windows")]
fn ensure_wallpaper_engine_named_popup(
    plan: &LiveDesktopWallpaperEnginePopupPlan,
    progress_sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
) -> LiveDesktopWallpaperEnginePopupEnsureResult {
    let before = unsafe { probe_windows_live_desktop_windows() };
    if let Some(existing) = find_wallpaper_engine_popup_by_name(&before, &plan.window_name) {
        let executable_path = find_wallpaper_engine_executable_path(&before);
        return LiveDesktopWallpaperEnginePopupEnsureResult {
            detail: format!(
                "popupOwner=launchpad popupLifecycle=foundExisting popupWindowName={} root={} size={}x{}",
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
                    "popupOwner=launchpad popupLifecycle=created popupWindowName={} root={} targetSize={}x{} wallpaper={} wallpaperSource={}",
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
fn find_wallpaper_engine_config_string(
    value: &serde_json::Value,
    leaf_key: &str,
) -> Option<String> {
    match value {
        serde_json::Value::Object(object) => {
            for (key, child) in object {
                if key.eq_ignore_ascii_case(leaf_key) {
                    if let Some(text) = child.as_str() {
                        return Some(text.trim().to_string());
                    }
                }
                if let Some(found) = find_wallpaper_engine_config_string(child, leaf_key) {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|item| find_wallpaper_engine_config_string(item, leaf_key)),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn find_wallpaper_engine_selected_wallpaper_file(
    value: &serde_json::Value,
    location: &str,
) -> Option<String> {
    match value {
        serde_json::Value::Object(object) => {
            if let Some(selected) = object
                .get("selectedwallpapers")
                .and_then(|value| value.as_object())
            {
                if let Some(file) = selected
                    .get(location)
                    .and_then(|entry| entry.get("file"))
                    .and_then(|file| file.as_str())
                    .map(|file| file.trim().to_string())
                    .filter(|file| !file.is_empty())
                {
                    return Some(file);
                }
            }
            object
                .values()
                .find_map(|child| find_wallpaper_engine_selected_wallpaper_file(child, location))
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(|item| find_wallpaper_engine_selected_wallpaper_file(item, location)),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn find_first_wallpaper_engine_selected_wallpaper_file(
    value: &serde_json::Value,
) -> Option<String> {
    match value {
        serde_json::Value::Object(object) => {
            if let Some(selected) = object
                .get("selectedwallpapers")
                .and_then(|value| value.as_object())
            {
                if let Some(file) = selected
                    .values()
                    .find_map(|entry| entry.get("file"))
                    .and_then(|file| file.as_str())
                    .map(|file| file.trim().to_string())
                    .filter(|file| !file.is_empty())
                {
                    return Some(file);
                }
            }
            object
                .values()
                .find_map(find_first_wallpaper_engine_selected_wallpaper_file)
        }
        serde_json::Value::Array(items) => items
            .iter()
            .find_map(find_first_wallpaper_engine_selected_wallpaper_file),
        _ => None,
    }
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
fn close_wallpaper_engine_named_popup(
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
fn cleanup_wallpaper_engine_popup_after_failed_capture(
    ensure: &mut LiveDesktopWallpaperEnginePopupEnsureResult,
) -> String {
    let Some(command) = ensure.close_command.take() else {
        return String::new();
    };
    match close_wallpaper_engine_named_popup(&command) {
        Ok(()) => "; launchpad popup closed after failed WGC attempts".to_string(),
        Err(error) => format!("; {error}"),
    }
}

fn format_wallpaper_engine_popup_runtime_detail(
    ensure_detail: &str,
    prepare_detail: &str,
) -> String {
    [ensure_detail, prepare_detail]
        .into_iter()
        .filter(|detail| !detail.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(target_os = "windows")]
fn collect_live_desktop_dwm_shared_surface_targets(
    diagnostics: &LiveDesktopWindowDiagnostics,
) -> Vec<LiveDesktopWindowInfo> {
    let mut targets = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
    for info in diagnostics.candidates.iter() {
        push_live_desktop_wgc_target(&mut targets, &mut seen, info);
    }
    for info in diagnostics.candidates.iter() {
        if info.parent_hwnd.is_empty() {
            continue;
        }
        if let Some(parent) = diagnostics
            .windows
            .iter()
            .find(|candidate| candidate.hwnd == info.parent_hwnd)
        {
            push_live_desktop_wgc_target(&mut targets, &mut seen, parent);
        }
    }
    for info in diagnostics.windows.iter() {
        if info.role == "workerw" || info.role == "progman" {
            push_live_desktop_wgc_target(&mut targets, &mut seen, info);
        }
    }
    targets
}

fn push_live_desktop_wgc_target(
    targets: &mut Vec<LiveDesktopWindowInfo>,
    seen: &mut std::collections::HashSet<String>,
    info: &LiveDesktopWindowInfo,
) {
    if info.hwnd.is_empty() || !seen.insert(info.hwnd.clone()) {
        return;
    }
    targets.push(info.clone());
}

fn format_live_desktop_wgc_attempt(info: &LiveDesktopWindowInfo, result: String) -> String {
    format!(
        "{} role={} class={} process={} reason={} parent={} root={} visible={} style={} exStyle={} cloaked={} rect={}x{} result={}",
        info.hwnd,
        info.role,
        info.class_name,
        info.process_name,
        info.candidate_reason,
        info.parent_hwnd,
        info.root_hwnd,
        info.visible,
        info.style,
        info.ex_style,
        info.cloaked,
        info.rect.width,
        info.rect.height,
        result
    )
}

#[cfg(target_os = "windows")]
fn format_live_desktop_dwm_attempt(info: &LiveDesktopWindowInfo, result: String) -> String {
    format!(
        "{} role={} class={} process={} reason={} parent={} root={} visible={} style={} exStyle={} noRedirectionBitmap={} cloaked={} rect={}x{} result={}",
        info.hwnd,
        info.role,
        info.class_name,
        info.process_name,
        info.candidate_reason,
        info.parent_hwnd,
        info.root_hwnd,
        info.visible,
        info.style,
        info.ex_style,
        live_desktop_window_has_no_redirection_bitmap(info),
        info.cloaked,
        info.rect.width,
        info.rect.height,
        result
    )
}

fn is_acceptable_live_desktop_wgc_target(info: &LiveDesktopWindowInfo) -> bool {
    !matches!(
        info.role.as_str(),
        "progman" | "shellDefView" | "desktopListView"
    )
}

#[cfg(target_os = "windows")]
fn is_acceptable_live_desktop_dwm_shared_surface_target(info: &LiveDesktopWindowInfo) -> bool {
    !matches!(
        info.role.as_str(),
        "progman" | "shellDefView" | "desktopListView"
    )
}

fn live_desktop_window_has_no_redirection_bitmap(info: &LiveDesktopWindowInfo) -> bool {
    const WS_EX_NOREDIRECTIONBITMAP: usize = 0x0020_0000;
    info.ex_style
        .strip_prefix("0x")
        .and_then(|value| usize::from_str_radix(value, 16).ok())
        .map(|value| (value & WS_EX_NOREDIRECTIONBITMAP) != 0)
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
unsafe fn prepare_wallpaper_engine_popup_for_capture(
    target: &LiveDesktopWindowInfo,
    diagnostics: &LiveDesktopWindowDiagnostics,
    display_rect: &LiveDesktopWindowRect,
) -> LiveDesktopPopupPreparation {
    let Some(popup) = wallpaper_engine_popup_root_for_target(target, diagnostics) else {
        return LiveDesktopPopupPreparation {
            detail: format!("popupManagement=skipped(no popup root for {})", target.hwnd),
            restore_state: None,
        };
    };
    let Some(hwnd) = parse_live_desktop_window_handle(&popup.hwnd) else {
        return LiveDesktopPopupPreparation {
            detail: format!("popupManagement=skipped(invalid popup HWND {})", popup.hwnd),
            restore_state: None,
        };
    };
    if popup.rect.width <= 0 || popup.rect.height <= 0 {
        return LiveDesktopPopupPreparation {
            detail: format!(
                "popupManagement=skipped(invalid popup rect {}x{})",
                popup.rect.width, popup.rect.height
            ),
            restore_state: None,
        };
    }

    let original_style = unsafe { read_live_desktop_window_long(hwnd, GWL_STYLE) };
    let original_ex_style = unsafe { read_live_desktop_window_long(hwnd, GWL_EXSTYLE) };
    let restore_state = LiveDesktopPopupWindowRestoreState {
        hwnd,
        style: original_style,
        ex_style: original_ex_style,
        rect: popup.rect.clone(),
    };
    let managed_style = original_style
        & !live_desktop_window_style_mask([
            WS_CAPTION.0,
            WS_THICKFRAME.0,
            WS_SYSMENU.0,
            WS_MINIMIZEBOX.0,
            WS_MAXIMIZEBOX.0,
        ]);
    let managed_ex_style = (original_ex_style
        & !live_desktop_window_style_mask([WS_EX_APPWINDOW.0]))
        | live_desktop_window_style_mask([WS_EX_TOOLWINDOW.0, WS_EX_NOACTIVATE.0]);

    if managed_style != original_style {
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_STYLE, managed_style);
        }
    }
    if managed_ex_style != original_ex_style {
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, managed_ex_style);
        }
    }

    let set_position_result = unsafe {
        SetWindowPos(
            hwnd,
            Some(HWND_BOTTOM),
            display_rect.left,
            display_rect.top,
            popup.rect.width,
            popup.rect.height,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING,
        )
    };
    let position_detail = match set_position_result {
        Ok(()) => format!(
            "alignedToDisplay={}x{}@{},{} popupSize={}x{} zOrder=bottom",
            display_rect.width,
            display_rect.height,
            display_rect.left,
            display_rect.top,
            popup.rect.width,
            popup.rect.height
        ),
        Err(error) => format!("alignToDisplayFailed={error}"),
    };

    LiveDesktopPopupPreparation {
        detail: format!(
            "popupManagement=root {} style {}->{} exStyle {}->{} {}",
            popup.hwnd,
            format_live_desktop_window_long(original_style),
            format_live_desktop_window_long(managed_style),
            format_live_desktop_window_long(original_ex_style),
            format_live_desktop_window_long(managed_ex_style),
            position_detail
        ),
        restore_state: Some(restore_state),
    }
}

#[cfg(target_os = "windows")]
unsafe fn restore_wallpaper_engine_popup_after_capture(
    state: &LiveDesktopPopupWindowRestoreState,
) -> Result<(), String> {
    unsafe {
        SetWindowLongPtrW(state.hwnd, GWL_STYLE, state.style);
        SetWindowLongPtrW(state.hwnd, GWL_EXSTYLE, state.ex_style);
    }
    unsafe {
        SetWindowPos(
            state.hwnd,
            None,
            state.rect.left,
            state.rect.top,
            state.rect.width.max(1),
            state.rect.height.max(1),
            SWP_FRAMECHANGED
                | SWP_NOACTIVATE
                | SWP_NOOWNERZORDER
                | SWP_NOSENDCHANGING
                | SWP_NOZORDER,
        )
    }
    .map_err(|error| format!("Wallpaper Engine popup restore failed: {error}"))?;
    Ok(())
}

#[cfg(target_os = "windows")]
unsafe fn relay_wallpaper_engine_popup_mouse(window_capture: &LiveDesktopWindowCapture) {
    let Some(mouse_relay) = window_capture.mouse_relay.as_ref() else {
        return;
    };
    let Ok(mut mouse_relay) = mouse_relay.lock() else {
        return;
    };
    let mut cursor = POINT::default();
    if unsafe { GetCursorPos(&mut cursor) }.is_err() {
        return;
    }
    let Some(position) = resolve_live_desktop_mouse_relay_position(
        cursor.x,
        cursor.y,
        &mouse_relay.output_rect,
        mouse_relay.source_width,
        mouse_relay.source_height,
    ) else {
        return;
    };
    if mouse_relay.last_position == Some(position) {
        return;
    }
    let lparam = live_desktop_mouse_relay_lparam(position);
    let mut sent = false;
    for target_hwnd in mouse_relay.target_hwnds.iter().copied() {
        if unsafe { PostMessageW(Some(target_hwnd), WM_MOUSEMOVE, WPARAM(0), lparam) }.is_ok() {
            sent = true;
        }
    }
    if sent {
        mouse_relay.last_position = Some(position);
    }
}

fn resolve_live_desktop_mouse_relay_position(
    cursor_x: i32,
    cursor_y: i32,
    output_rect: &LiveDesktopWindowRect,
    source_width: u32,
    source_height: u32,
) -> Option<LiveDesktopMouseRelayPosition> {
    if output_rect.width <= 0 || output_rect.height <= 0 || source_width == 0 || source_height == 0
    {
        return None;
    }
    Some(LiveDesktopMouseRelayPosition {
        x: map_live_desktop_mouse_axis(cursor_x, output_rect.left, output_rect.width, source_width),
        y: map_live_desktop_mouse_axis(
            cursor_y,
            output_rect.top,
            output_rect.height,
            source_height,
        ),
    })
}

fn map_live_desktop_mouse_axis(
    cursor: i32,
    source_start: i32,
    source_size: i32,
    target_size: u32,
) -> i32 {
    let source_max = (source_size - 1).max(0);
    let target_max = target_size.saturating_sub(1) as i64;
    let relative = (cursor - source_start).clamp(0, source_max) as i64;
    let denominator = source_max.max(1) as i64;
    ((relative * target_max + denominator / 2) / denominator) as i32
}

#[cfg(target_os = "windows")]
fn live_desktop_mouse_relay_lparam(position: LiveDesktopMouseRelayPosition) -> LPARAM {
    let x = (position.x as u16) as u32;
    let y = (position.y as u16) as u32;
    LPARAM(((y << 16) | x) as isize)
}

fn live_desktop_window_style_mask<const N: usize>(parts: [u32; N]) -> isize {
    parts
        .into_iter()
        .fold(0usize, |mask, part| mask | part as usize) as isize
}

fn wallpaper_engine_popup_root_for_target<'a>(
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

fn collect_wallpaper_engine_mouse_relay_targets(
    target: &LiveDesktopWindowInfo,
    diagnostics: &LiveDesktopWindowDiagnostics,
) -> Vec<LiveDesktopWindowInfo> {
    let mut targets = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
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

#[cfg(target_os = "windows")]
fn live_desktop_frame_source_label(
    window_capture: Option<&LiveDesktopWindowCapture>,
    dwm_shared_surface_capture: Option<&LiveDesktopDwmSharedSurfaceCapture>,
) -> &'static str {
    if let Some(capture) = window_capture {
        capture.source_label
    } else if dwm_shared_surface_capture.is_some() {
        "DWM shared surface"
    } else {
        "Desktop Duplication"
    }
}

#[cfg(target_os = "windows")]
fn live_desktop_frame_source_detail<'a>(
    window_capture: Option<&'a LiveDesktopWindowCapture>,
    dwm_shared_surface_capture: Option<&'a LiveDesktopDwmSharedSurfaceCapture>,
    fallback: &'a str,
) -> &'a str {
    window_capture
        .map(|capture| capture.detail.as_str())
        .or_else(|| dwm_shared_surface_capture.map(|capture| capture.detail.as_str()))
        .unwrap_or(fallback)
}

fn resolve_live_desktop_visual_placement(
    source_width: u32,
    source_height: u32,
    display_width: u32,
    display_height: u32,
) -> LiveDesktopVisualPlacement {
    let source_width = source_width.max(1) as f32;
    let source_height = source_height.max(1) as f32;
    let display_width = display_width.max(1) as f32;
    let display_height = display_height.max(1) as f32;
    let scale = (display_width / source_width).max(display_height / source_height);
    let offset_x = (display_width - source_width * scale) * 0.5;
    let offset_y = (display_height - source_height * scale) * 0.5;

    LiveDesktopVisualPlacement {
        scale,
        offset_x,
        offset_y,
    }
}

#[cfg(target_os = "windows")]
fn update_live_desktop_diagnostics(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    update: impl FnOnce(&mut LiveDesktopRuntimeDiagnostics),
) {
    if let Ok(mut diagnostics) = diagnostics.lock() {
        update(&mut diagnostics);
    }
}

#[cfg(target_os = "windows")]
fn live_desktop_duration_micros(duration: Duration) -> u64 {
    duration.as_micros().min(u64::MAX as u128) as u64
}

#[cfg(target_os = "windows")]
fn record_live_desktop_frame_arrived_event(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.frame_arrived_events += 1;
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_frame_arrived_dropped_signal(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.frame_arrived_dropped_signals += 1;
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_frame_copy_duration(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    duration: Duration,
) {
    let duration_micros = live_desktop_duration_micros(duration);
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.frame_copy_samples += 1;
        diagnostics.frame_copy_micros_total = diagnostics
            .frame_copy_micros_total
            .saturating_add(duration_micros);
        diagnostics.last_frame_copy_micros = duration_micros;
        diagnostics.max_frame_copy_micros = diagnostics.max_frame_copy_micros.max(duration_micros);
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_frame_commit_duration(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    duration: Duration,
) {
    let duration_micros = live_desktop_duration_micros(duration);
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.frame_commit_samples += 1;
        diagnostics.frame_commit_micros_total = diagnostics
            .frame_commit_micros_total
            .saturating_add(duration_micros);
        diagnostics.last_frame_commit_micros = duration_micros;
        diagnostics.max_frame_commit_micros =
            diagnostics.max_frame_commit_micros.max(duration_micros);
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_frame_copied(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    frame_probe: &LiveDesktopFrameProbe,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.frames_copied += 1;
        diagnostics.last_frame_width = frame_probe.width;
        diagnostics.last_frame_height = frame_probe.height;
        diagnostics.last_frame_format = frame_probe.format;
        diagnostics.last_error.clear();
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_test_pattern_frame(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    frame_probe: &LiveDesktopFrameProbe,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.test_pattern_frames += 1;
        diagnostics.last_frame_width = frame_probe.width;
        diagnostics.last_frame_height = frame_probe.height;
        diagnostics.last_frame_format = frame_probe.format;
        diagnostics.last_error.clear();
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_frame_timeout(diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.frame_timeouts += 1;
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_dwm_surface_update(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    update_rect: &RECT,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.dwm_surface_updates += 1;
        diagnostics.last_dwm_surface_update_rect_width =
            (update_rect.right - update_rect.left).max(0) as u32;
        diagnostics.last_dwm_surface_update_rect_height =
            (update_rect.bottom - update_rect.top).max(0) as u32;
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_dwm_surface_update_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.dwm_surface_update_errors += 1;
        diagnostics.last_error = detail.to_string();
    });
}

#[cfg(target_os = "windows")]
fn should_probe_live_desktop_dwm_pixels(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) -> bool {
    diagnostics
        .lock()
        .map(|diagnostics| diagnostics.frames_copied % 30 == 0)
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn record_live_desktop_dwm_pixel_probe(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    probe: &LiveDesktopDwmPixelProbe,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.pixel_probe_samples += 1;
        diagnostics.last_pixel_probe_width = probe.width;
        diagnostics.last_pixel_probe_height = probe.height;
        diagnostics.last_pixel_probe_min_rgb = probe.min_rgb;
        diagnostics.last_pixel_probe_max_rgb = probe.max_rgb;
        diagnostics.last_pixel_probe_avg_rgb = probe.avg_rgb;
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_dwm_pixel_probe_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.pixel_probe_errors += 1;
        diagnostics.last_error = detail.to_string();
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_copy_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.copy_errors += 1;
        diagnostics.last_error = detail.to_string();
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_commit_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.commit_errors += 1;
        diagnostics.last_error = detail.to_string();
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_config_update(diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.config_updates += 1;
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_config_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.config_errors += 1;
        diagnostics.last_error = detail.to_string();
    });
}

pub(crate) fn live_desktop_background_support() -> LiveDesktopBackgroundSupport {
    let capture_probe = probe_live_desktop_capture();
    let renderer_probe = probe_live_desktop_renderer();
    make_live_desktop_background_support(current_platform(), capture_probe, renderer_probe)
}

fn make_live_desktop_background_support(
    platform: &'static str,
    capture_probe: LiveDesktopCaptureProbe,
    renderer_probe: LiveDesktopRendererProbe,
) -> LiveDesktopBackgroundSupport {
    let reason = if !capture_probe.supports_desktop_duplication {
        capture_probe.reason
    } else if !renderer_probe.supports_native_renderer {
        renderer_probe.reason
    } else {
        "available"
    };
    let supports_live_desktop_background =
        capture_probe.supports_desktop_duplication && renderer_probe.supports_native_renderer;
    let supports_live_desktop_background_effects =
        supports_live_desktop_background && renderer_probe.supports_native_effects;

    LiveDesktopBackgroundSupport {
        platform,
        supports_live_desktop_background,
        supports_live_desktop_background_effects,
        reason,
        detail: if !capture_probe.supports_desktop_duplication {
            capture_probe.detail.clone()
        } else {
            renderer_probe.detail.clone()
        },
        capture_probe,
        renderer_probe,
    }
}

#[cfg(target_os = "windows")]
fn probe_live_desktop_renderer() -> LiveDesktopRendererProbe {
    let (probe_sender, probe_receiver) = mpsc::channel();
    let worker = thread::spawn(move || {
        let probe = match unsafe { probe_windows_live_desktop_renderer() } {
            Ok(probe) => probe,
            Err(probe) => probe,
        };
        let _ = probe_sender.send(probe);
    });

    match probe_receiver.recv_timeout(Duration::from_secs(2)) {
        Ok(probe) => {
            let _ = worker.join();
            probe
        }
        Err(mpsc::RecvTimeoutError::Timeout) => LiveDesktopRendererProbe::unavailable(
            "nativeRendererProbeTimedOut",
            "DirectComposition renderer probe did not complete within 2 seconds",
        ),
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            let _ = worker.join();
            LiveDesktopRendererProbe::unavailable(
                "nativeRendererProbeWorkerExited",
                "DirectComposition renderer probe worker exited before reporting a result",
            )
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn probe_live_desktop_renderer() -> LiveDesktopRendererProbe {
    LiveDesktopRendererProbe::unavailable(
        "unsupportedPlatform",
        "Native live desktop rendering is only implemented on Windows",
    )
}

#[cfg(target_os = "windows")]
unsafe fn probe_windows_live_desktop_renderer(
) -> Result<LiveDesktopRendererProbe, LiveDesktopRendererProbe> {
    let _com = unsafe { ComApartment::initialize() }.map_err(|error| {
        LiveDesktopRendererProbe::unavailable(
            "comInitializationFailed",
            format!("CoInitializeEx failed before probing DirectComposition renderer: {error}"),
        )
    })?;
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.map_err(|error| {
        LiveDesktopRendererProbe::unavailable(
            "dxgiUnavailable",
            format!("CreateDXGIFactory1 failed while probing renderer: {error}"),
        )
    })?;

    let mut adapter_count = 0;
    let mut last_detail = String::new();

    for adapter_index in 0.. {
        let adapter = match unsafe { factory.EnumAdapters1(adapter_index) } {
            Ok(adapter) => adapter,
            Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(error) => {
                return Err(LiveDesktopRendererProbe::unavailable(
                    "dxgiAdapterEnumerationFailed",
                    format!(
                        "EnumAdapters1({adapter_index}) failed while probing renderer: {error}"
                    ),
                ));
            }
        };
        adapter_count += 1;

        let desc = match unsafe { adapter.GetDesc1() } {
            Ok(desc) => desc,
            Err(error) => {
                last_detail =
                    format!("GetDesc1({adapter_index}) failed while probing renderer: {error}");
                continue;
            }
        };
        if (desc.Flags & DXGI_ADAPTER_FLAG3_SOFTWARE.0 as u32) != 0 {
            continue;
        }

        let device = match unsafe { create_d3d11_device_for_adapter(&adapter) } {
            Ok(device) => device,
            Err(error) => {
                last_detail = format!(
                    "D3D11CreateDevice({adapter_index}) failed while probing renderer: {error}"
                );
                continue;
            }
        };
        let dxgi_device = match device.cast::<IDXGIDevice>() {
            Ok(device) => device,
            Err(error) => {
                last_detail = format!(
                    "IDXGIDevice cast({adapter_index}) failed while probing renderer: {error}"
                );
                continue;
            }
        };
        let composition_device: IDCompositionDevice = match unsafe {
            DCompositionCreateDevice(&dxgi_device)
        } {
            Ok(device) => device,
            Err(error) => {
                last_detail = format!(
                    "DCompositionCreateDevice({adapter_index}) failed while probing renderer: {error}"
                );
                continue;
            }
        };
        drop(composition_device);

        let adapter_name = live_desktop_adapter_name(&desc.Description);
        let native_effects =
            unsafe { create_live_desktop_native_effects(&dxgi_device, adapter_index, "probe") };
        let supports_native_effects =
            native_effects.color_matrix_effect.is_some() && native_effects.blur_effect.is_some();
        let detail = format!(
            "DirectComposition base renderer probe succeeded on adapter {adapter_index} ({adapter_name}); {}; HWND target and root visual are validated when the live desktop runtime starts",
            native_effects.detail
        );

        return Ok(
            LiveDesktopRendererProbe::native_renderer_available_for_probe(
                supports_native_effects,
                detail,
            ),
        );
    }

    if adapter_count == 0 {
        return Err(LiveDesktopRendererProbe::unavailable(
            "noDxgiAdapters",
            "DXGI did not report any adapters while probing renderer",
        ));
    }

    Err(LiveDesktopRendererProbe::unavailable(
        "directCompositionUnavailable",
        if last_detail.is_empty() {
            "DirectComposition renderer probe failed without a detailed DXGI error".to_string()
        } else {
            last_detail
        },
    ))
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_renderer_resources(
    window_handle: HWND,
    config: LiveDesktopRuntimeConfig,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    progress_sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
) -> Result<LiveDesktopRendererStartup, LiveDesktopRendererProbe> {
    report_live_desktop_renderer_startup_progress(progress_sender, "Initializing COM apartment");
    let com = unsafe { ComApartment::initialize() }.map_err(|error| {
        LiveDesktopRendererProbe::unavailable(
            "comInitializationFailed",
            format!("CoInitializeEx failed before creating DirectComposition renderer: {error}"),
        )
    })?;
    report_live_desktop_renderer_startup_progress(
        progress_sender,
        "Creating DXGI factory for renderer",
    );
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.map_err(|error| {
        LiveDesktopRendererProbe::unavailable(
            "dxgiUnavailable",
            format!("CreateDXGIFactory1 failed while creating renderer resources: {error}"),
        )
    })?;

    let mut adapter_count = 0;
    let mut last_detail = String::new();
    let target_monitor = unsafe { MonitorFromWindow(window_handle, MONITOR_DEFAULTTONEAREST) };

    for adapter_index in 0.. {
        let adapter = match unsafe { factory.EnumAdapters1(adapter_index) } {
            Ok(adapter) => adapter,
            Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(error) => {
                return Err(LiveDesktopRendererProbe::unavailable(
                    "dxgiAdapterEnumerationFailed",
                    format!(
                        "EnumAdapters1({adapter_index}) failed while creating renderer resources: {error}"
                    ),
                ));
            }
        };
        adapter_count += 1;

        let desc = match unsafe { adapter.GetDesc1() } {
            Ok(desc) => desc,
            Err(error) => {
                last_detail = format!(
                    "GetDesc1({adapter_index}) failed while creating renderer resources: {error}"
                );
                continue;
            }
        };
        if (desc.Flags & DXGI_ADAPTER_FLAG3_SOFTWARE.0 as u32) != 0 {
            last_detail = format!(
                "Skipped software adapter {adapter_index} ({}) while creating renderer resources",
                live_desktop_adapter_name(&desc.Description)
            );
            continue;
        }
        let adapter_name = live_desktop_adapter_name(&desc.Description);
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!("Creating D3D11 device on adapter {adapter_index} ({adapter_name})"),
        );

        let d3d = match unsafe { create_d3d11_device_with_context_for_adapter(&adapter) } {
            Ok(d3d) => d3d,
            Err(error) => {
                last_detail = format!(
                    "D3D11CreateDevice({adapter_index}, {adapter_name}) failed while creating renderer resources: {error}"
                );
                continue;
            }
        };
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!("Creating Desktop Duplication reference capture on adapter {adapter_index} ({adapter_name})"),
        );
        let capture = match unsafe {
            create_live_desktop_capture_for_adapter(
                &adapter,
                &d3d.device,
                adapter_index,
                target_monitor,
            )
        } {
            Ok(capture) => capture,
            Err(detail) => {
                last_detail = detail;
                continue;
            }
        };
        let dxgi_device = match d3d.device.cast::<IDXGIDevice>() {
            Ok(device) => device,
            Err(error) => {
                last_detail = format!(
                    "IDXGIDevice cast({adapter_index}, {adapter_name}) failed while creating renderer resources: {error}"
                );
                continue;
            }
        };
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Creating DirectComposition device on adapter {adapter_index} ({adapter_name})"
            ),
        );
        let composition_device: IDCompositionDevice = match unsafe {
            DCompositionCreateDevice(&dxgi_device)
        } {
            Ok(device) => device,
            Err(error) => {
                last_detail = format!(
                    "DCompositionCreateDevice({adapter_index}, {adapter_name}) failed while creating renderer resources: {error}"
                );
                continue;
            }
        };
        let native_effects =
            unsafe { create_live_desktop_native_effects(&dxgi_device, adapter_index, "runtime") };
        let supports_native_effects =
            native_effects.color_matrix_effect.is_some() && native_effects.blur_effect.is_some();
        let color_matrix_effect = native_effects.color_matrix_effect;
        let blur_effect = native_effects.blur_effect;
        let window_capture = if config.diagnostic_mode.uses_window_capture() {
            match unsafe {
                create_live_desktop_window_capture(
                    &d3d.device,
                    &config.diagnostic_mode,
                    &capture,
                    Arc::clone(&diagnostics),
                    progress_sender,
                )
            } {
                Ok(capture) => Some(capture),
                Err(error) => {
                    return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                        config.diagnostic_mode.window_capture_unavailable_reason(),
                        format!(
                            "{} unavailable on adapter {adapter_index} ({adapter_name}): {error}",
                            config.diagnostic_mode.window_capture_label()
                        ),
                    ));
                }
            }
        } else {
            None
        };
        let dwm_shared_surface_capture = if config.diagnostic_mode.uses_dwm_shared_surface_capture()
        {
            match unsafe {
                create_live_desktop_dwm_shared_surface_capture(
                    &d3d.device,
                    desc.AdapterLuid,
                    target_monitor,
                    progress_sender,
                )
            } {
                Ok(capture) => Some(capture),
                Err(error) => {
                    return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                        "dwmSharedSurfaceUnavailable",
                        format!(
                            "DWM shared surface capture unavailable on adapter {adapter_index} ({adapter_name}): {error}"
                        ),
                    ));
                }
            }
        } else {
            None
        };
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!("Creating DirectComposition target for launchpad window on adapter {adapter_index} ({adapter_name})"),
        );
        let target = match unsafe { composition_device.CreateTargetForHwnd(window_handle, false) } {
            Ok(target) => target,
            Err(error) => {
                return Err(LiveDesktopRendererProbe::window_target_unavailable(
                    "directCompositionTargetUnavailable",
                    format!(
                        "CreateTargetForHwnd({adapter_index}, {adapter_name}) failed while creating renderer resources: {error}"
                    ),
                ));
            }
        };
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!("Creating DirectComposition root visual on adapter {adapter_index} ({adapter_name})"),
        );
        let root_visual = match unsafe { composition_device.CreateVisual() } {
            Ok(visual) => visual,
            Err(error) => {
                return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionVisualUnavailable",
                    format!(
                        "CreateVisual({adapter_index}, {adapter_name}) failed while creating renderer resources: {error}"
                    ),
                ));
            }
        };
        let source_width = window_capture
            .as_ref()
            .map(|capture| capture.width)
            .or_else(|| {
                dwm_shared_surface_capture
                    .as_ref()
                    .map(|capture| capture.width)
            })
            .unwrap_or(capture.output_width);
        let source_height = window_capture
            .as_ref()
            .map(|capture| capture.height)
            .or_else(|| {
                dwm_shared_surface_capture
                    .as_ref()
                    .map(|capture| capture.height)
            })
            .unwrap_or(capture.output_height);
        let (display_width, display_height) =
            unsafe { read_live_desktop_window_client_size(window_handle) }
                .unwrap_or((capture.output_width, capture.output_height));
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Creating DirectComposition surface {source_width}x{source_height} for target {display_width}x{display_height}"
            ),
        );
        let surface = match unsafe {
            composition_device.CreateSurface(
                source_width,
                source_height,
                DXGI_FORMAT_B8G8R8A8_UNORM,
                DXGI_ALPHA_MODE_IGNORE,
            )
        } {
            Ok(surface) => surface,
            Err(error) => {
                return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionSurfaceUnavailable",
                    format!(
                        "CreateSurface({}x{}) failed while creating renderer resources: {error}",
                        source_width, source_height
                    ),
                ));
            }
        };
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            "Copying initial live desktop frame into DirectComposition surface",
        );
        let initial_frame_detail = match unsafe {
            copy_initial_live_desktop_frame_to_composition_surface(
                window_capture.as_ref(),
                dwm_shared_surface_capture.as_ref(),
                &capture.duplication,
                &surface,
                &d3d.device,
                &d3d.context,
                &config,
                &diagnostics,
            )
        } {
            Ok(Some(frame_probe)) => {
                record_live_desktop_frame_copied(&diagnostics, &frame_probe);
                format!(
                    "initial frame {}x{} format {} copied",
                    frame_probe.width, frame_probe.height, frame_probe.format
                )
            }
            Ok(None) => {
                record_live_desktop_frame_timeout(&diagnostics);
                "initial frame pending after startup wait".to_string()
            }
            Err(error) => {
                record_live_desktop_copy_error(&diagnostics, &error);
                if config.diagnostic_mode.uses_dwm_shared_surface_capture() {
                    return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                        "dwmSharedSurfaceInitialFrameUnavailable",
                        format!("DWM shared surface initial frame copy failed: {error}"),
                    ));
                }
                format!("initial frame copy failed: {error}")
            }
        };
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            "Applying DirectComposition effect configuration",
        );
        if let Err(error) = unsafe {
            apply_live_desktop_config_to_effects(
                blur_effect.as_ref(),
                color_matrix_effect.as_ref(),
                &config,
            )
        } {
            return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                "directCompositionEffectUnavailable",
                format!("DirectComposition effect setup failed: {error}"),
            ));
        }
        let placement = resolve_live_desktop_visual_placement(
            source_width,
            source_height,
            display_width,
            display_height,
        );
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            "Committing DirectComposition root visual",
        );
        let scale_transform = match unsafe {
            set_direct_composition_root(
                &composition_device,
                &target,
                &root_visual,
                &surface,
                &blur_effect,
                &color_matrix_effect,
                &placement,
            )
        } {
            Ok(scale_transform) => scale_transform,
            Err(error) => {
                return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionRootUnavailable",
                    format!(
                        "DirectComposition root visual and surface commit failed while creating renderer resources: {error}"
                    ),
                ));
            }
        };

        return Ok(LiveDesktopRendererStartup {
            renderer_probe: LiveDesktopRendererProbe::native_renderer_available_for_window(
                supports_native_effects,
                format!(
                    "{} frame pump initialized with {initial_frame_detail} and DirectComposition target/root surface source {}x{} -> target {}x{} scale {:.3} offset {:.1},{:.1} on adapter {adapter_index} ({adapter_name}), output {} ({}), monitor matched: {}; native effects available: {}; {}; {}",
                    live_desktop_frame_source_label(
                        window_capture.as_ref(),
                        dwm_shared_surface_capture.as_ref()
                    ),
                    source_width,
                    source_height,
                    display_width,
                    display_height,
                    placement.scale,
                    placement.offset_x,
                    placement.offset_y,
                    capture.output_index,
                    capture.output_name,
                    !target_monitor.is_invalid(),
                supports_native_effects,
                    live_desktop_frame_source_detail(
                        window_capture.as_ref(),
                        dwm_shared_surface_capture.as_ref(),
                        last_detail.as_str()
                    ),
                    native_effects.detail
                ),
            ),
            resources: LiveDesktopRendererResources {
                config,
                diagnostics,
                _com: com,
                _d3d_device: d3d.device,
                _d3d_context: d3d.context,
                _capture_duplication: capture.duplication,
                _window_capture: window_capture,
                _dwm_shared_surface_capture: dwm_shared_surface_capture,
                _composition_device: composition_device,
                _blur_effect: blur_effect,
                _color_matrix_effect: color_matrix_effect,
                _target: target,
                _root_visual: root_visual,
                _scale_transform: scale_transform,
                _surface: surface,
            },
        });
    }

    if adapter_count == 0 {
        return Err(LiveDesktopRendererProbe::unavailable(
            "noDxgiAdapters",
            "DXGI did not report any adapters while creating renderer resources",
        ));
    }

    Err(LiveDesktopRendererProbe::unavailable(
        "directCompositionUnavailable",
        if last_detail.is_empty() {
            "DirectComposition renderer resource creation failed without a detailed DXGI error"
                .to_string()
        } else {
            last_detail
        },
    ))
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_capture_for_adapter(
    adapter: &IDXGIAdapter1,
    d3d_device: &ID3D11Device,
    adapter_index: u32,
    target_monitor: HMONITOR,
) -> Result<LiveDesktopCaptureStartup, String> {
    let mut output_count = 0;
    let mut last_detail = String::new();

    for output_index in 0.. {
        let output = match unsafe { adapter.EnumOutputs(output_index) } {
            Ok(output) => output,
            Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(error) => {
                last_detail =
                    format!("EnumOutputs({adapter_index}, {output_index}) failed: {error}");
                break;
            }
        };
        output_count += 1;

        let output_desc = match unsafe { output.GetDesc() } {
            Ok(desc) => desc,
            Err(error) => {
                last_detail = format!("GetDesc({adapter_index}, {output_index}) failed: {error}");
                continue;
            }
        };
        if !target_monitor.is_invalid() && output_desc.Monitor != target_monitor {
            last_detail = format!(
                "Skipped DXGI output {adapter_index}, {output_index} ({}) because it does not match the launchpad window monitor",
                live_desktop_output_name(&output_desc.DeviceName)
            );
            continue;
        }

        let output_name = live_desktop_output_name(&output_desc.DeviceName);
        let output_width = (output_desc.DesktopCoordinates.right
            - output_desc.DesktopCoordinates.left)
            .max(0) as u32;
        let output_height = (output_desc.DesktopCoordinates.bottom
            - output_desc.DesktopCoordinates.top)
            .max(0) as u32;
        let output_rect = LiveDesktopWindowRect {
            left: output_desc.DesktopCoordinates.left,
            top: output_desc.DesktopCoordinates.top,
            right: output_desc.DesktopCoordinates.right,
            bottom: output_desc.DesktopCoordinates.bottom,
            width: output_width as i32,
            height: output_height as i32,
        };
        if output_width == 0 || output_height == 0 {
            last_detail = format!(
                "DXGI output {adapter_index}, {output_index} has an empty desktop rectangle"
            );
            continue;
        }

        let output1 = match output.cast::<IDXGIOutput1>() {
            Ok(output1) => output1,
            Err(error) => {
                last_detail =
                    format!("IDXGIOutput1 cast({adapter_index}, {output_index}) failed: {error}");
                continue;
            }
        };

        let duplication = match unsafe { output1.DuplicateOutput(d3d_device) } {
            Ok(duplication) => duplication,
            Err(error) if error.code() == DXGI_ERROR_ACCESS_DENIED => {
                last_detail = format!(
                    "DuplicateOutput({adapter_index}, {output_index}) denied access: {error}"
                );
                continue;
            }
            Err(error) => {
                last_detail =
                    format!("DuplicateOutput({adapter_index}, {output_index}) failed: {error}");
                continue;
            }
        };

        return Ok(LiveDesktopCaptureStartup {
            output_index,
            output_width,
            output_height,
            output_rect,
            output_name,
            duplication,
        });
    }

    if output_count == 0 {
        return Err(format!(
            "DXGI did not report any outputs for hardware adapter {adapter_index}"
        ));
    }
    if last_detail.is_empty() {
        Err(format!(
            "Desktop Duplication capture startup failed on adapter {adapter_index} without a detailed DXGI error"
        ))
    } else {
        Err(last_detail)
    }
}

#[cfg(target_os = "windows")]
fn register_live_desktop_wgc_frame_arrived(
    frame_pool: &Direct3D11CaptureFramePool,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) -> Result<
    (
        mpsc::Receiver<()>,
        i64,
        TypedEventHandler<Direct3D11CaptureFramePool, IInspectable>,
    ),
    String,
> {
    let (frame_arrived_sender, frame_arrived_receiver) = mpsc::sync_channel::<()>(1);
    let handler_sender = frame_arrived_sender.clone();
    let handler = TypedEventHandler::new(move |_, _| {
        record_live_desktop_frame_arrived_event(&diagnostics);
        if handler_sender.try_send(()).is_err() {
            record_live_desktop_frame_arrived_dropped_signal(&diagnostics);
        }
        Ok(())
    });
    let token = frame_pool
        .FrameArrived(&handler)
        .map_err(|error| format!("Direct3D11CaptureFramePool::FrameArrived failed: {error}"))?;
    Ok((frame_arrived_receiver, token, handler))
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_window_capture(
    d3d_device: &ID3D11Device,
    diagnostic_mode: &LiveDesktopDiagnosticMode,
    capture: &LiveDesktopCaptureStartup,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    progress_sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
) -> Result<LiveDesktopWindowCapture, String> {
    let capture_label = diagnostic_mode.window_capture_label();
    report_live_desktop_renderer_startup_progress(
        progress_sender,
        format!("Probing {capture_label} windows"),
    );
    let popup_plan = if *diagnostic_mode == LiveDesktopDiagnosticMode::WallpaperEnginePopupCapture {
        Some(create_wallpaper_engine_popup_plan(capture))
    } else {
        None
    };
    let mut popup_ensure = if let Some(plan) = popup_plan.as_ref() {
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Ensuring Wallpaper Engine popup window {} at {}x{}",
                plan.window_name, plan.width, plan.height
            ),
        );
        ensure_wallpaper_engine_named_popup(plan, progress_sender)
    } else {
        LiveDesktopWallpaperEnginePopupEnsureResult {
            detail: String::new(),
            close_command: None,
        }
    };
    let window_diagnostics = unsafe { probe_windows_live_desktop_windows() };
    let targets = if *diagnostic_mode == LiveDesktopDiagnosticMode::WallpaperEnginePopupCapture {
        collect_wallpaper_engine_popup_wgc_targets(
            &window_diagnostics,
            popup_plan.as_ref().map(|plan| plan.window_name.as_str()),
        )
    } else {
        collect_live_desktop_wgc_targets(&window_diagnostics)
    };
    if targets.is_empty() {
        let action = if *diagnostic_mode == LiveDesktopDiagnosticMode::WallpaperEnginePopupCapture {
            "; open a Wallpaper Engine pop-out window when using popup capture"
        } else {
            ""
        };
        let close_detail = cleanup_wallpaper_engine_popup_after_failed_capture(&mut popup_ensure);
        let ensure_detail = if popup_ensure.detail.trim().is_empty() {
            String::new()
        } else {
            format!("; {}", popup_ensure.detail)
        };
        return Err(format!(
            "{capture_label} diagnostics found no WGC capture targets: {}{action}{}{}",
            window_diagnostics.detail, ensure_detail, close_detail
        ));
    }
    let target_count = targets.len();
    let first_target = targets.first().ok_or_else(|| {
        format!(
            "{capture_label} diagnostics found no WGC capture targets: {}",
            window_diagnostics.detail
        )
    })?;
    report_live_desktop_renderer_startup_progress(
        progress_sender,
        format!(
            "Creating WinRT D3D device for {} WGC targets; first={} class={} process={}",
            target_count, first_target.hwnd, first_target.class_name, first_target.process_name
        ),
    );
    let dxgi_device = d3d_device
        .cast::<IDXGIDevice>()
        .map_err(|error| format!("IDXGIDevice cast for WGC failed: {error}"))?;
    let winrt_device = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device) }
        .map_err(|error| format!("CreateDirect3D11DeviceFromDXGIDevice failed: {error}"))?;
    let winrt_device: IDirect3DDevice = winrt_device
        .cast()
        .map_err(|error| format!("IDirect3DDevice cast for WGC failed: {error}"))?;
    let interop: IGraphicsCaptureItemInterop =
        factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
            .map_err(|error| format!("GraphicsCaptureItem interop factory failed: {error}"))?;
    let manages_launchpad_popup = if let Some(plan) = popup_plan.as_ref() {
        wallpaper_engine_popup_target_matches_window_name(
            first_target,
            &window_diagnostics,
            &plan.window_name,
        )
    } else {
        false
    };
    let mut popup_preparation = if manages_launchpad_popup {
        unsafe {
            prepare_wallpaper_engine_popup_for_capture(
                first_target,
                &window_diagnostics,
                &capture.output_rect,
            )
        }
    } else {
        LiveDesktopPopupPreparation::default()
    };
    if !popup_preparation.detail.is_empty() {
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Prepared {capture_label} popup window before WGC capture: {}",
                popup_preparation.detail
            ),
        );
    }

    let mut attempt_details = Vec::new();
    for (target_index, target) in targets.iter().enumerate() {
        let hwnd = match parse_live_desktop_window_handle(&target.hwnd) {
            Some(hwnd) => hwnd,
            None => {
                attempt_details.push(format_live_desktop_wgc_attempt(
                    target,
                    "invalid HWND".to_string(),
                ));
                continue;
            }
        };
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Trying WGC target {}/{} {} role={} class={} process={} reason={}",
                target_index + 1,
                target_count,
                target.hwnd,
                target.role,
                target.class_name,
                target.process_name,
                target.candidate_reason
            ),
        );
        let item: GraphicsCaptureItem = match unsafe { interop.CreateForWindow(hwnd) } {
            Ok(item) => item,
            Err(error) => {
                attempt_details.push(format_live_desktop_wgc_attempt(
                    target,
                    format!("CreateForWindow failed: {error}"),
                ));
                continue;
            }
        };
        let size = match item.Size() {
            Ok(size) => size,
            Err(error) => {
                attempt_details.push(format_live_desktop_wgc_attempt(
                    target,
                    format!("GraphicsCaptureItem.Size failed: {error}"),
                ));
                continue;
            }
        };
        if size.Width <= 0 || size.Height <= 0 {
            attempt_details.push(format_live_desktop_wgc_attempt(
                target,
                format!(
                    "GraphicsCaptureItem returned invalid size {}x{}",
                    size.Width, size.Height
                ),
            ));
            continue;
        }
        if !is_acceptable_live_desktop_wgc_target(target) {
            attempt_details.push(format_live_desktop_wgc_attempt(
                target,
                format!(
                    "CreateForWindow succeeded with size {}x{} but target was rejected because it captures the desktop shell/icons",
                    size.Width, size.Height
                ),
            ));
            continue;
        }
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Creating WGC frame pool for {} size {}x{}",
                target.hwnd, size.Width, size.Height
            ),
        );
        let frame_pool = match Direct3D11CaptureFramePool::CreateFreeThreaded(
            &winrt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            LIVE_DESKTOP_WGC_FRAME_POOL_BUFFER_COUNT,
            size,
        ) {
            Ok(frame_pool) => frame_pool,
            Err(error) => {
                attempt_details.push(format_live_desktop_wgc_attempt(
                    target,
                    format!("Direct3D11CaptureFramePool::CreateFreeThreaded failed: {error}"),
                ));
                continue;
            }
        };
        let (
            frame_arrived_receiver,
            frame_arrived_token,
            frame_arrived_handler,
            frame_event_detail,
        ) = match register_live_desktop_wgc_frame_arrived(&frame_pool, Arc::clone(&diagnostics)) {
            Ok((receiver, token, handler)) => (
                Some(receiver),
                Some(token),
                Some(handler),
                "frameArrived=registered".to_string(),
            ),
            Err(error) => (
                None,
                None,
                None,
                format!("frameArrivedRegistrationFailed={error}"),
            ),
        };
        let session = match frame_pool.CreateCaptureSession(&item) {
            Ok(session) => session,
            Err(error) => {
                attempt_details.push(format_live_desktop_wgc_attempt(
                    target,
                    format!("CreateCaptureSession failed: {error}"),
                ));
                continue;
            }
        };
        let _ = session.SetIsBorderRequired(false);
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Starting WGC capture session for {capture_label} target {}",
                target.hwnd
            ),
        );
        let cursor_capture_detail = match session.SetIsCursorCaptureEnabled(false) {
            Ok(()) => "cursorCapture=false".to_string(),
            Err(error) => format!("cursorCaptureDisableFailed={error}"),
        };
        if let Err(error) = session.StartCapture() {
            attempt_details.push(format_live_desktop_wgc_attempt(
                target,
                format!("GraphicsCaptureSession.StartCapture failed: {error}"),
            ));
            continue;
        }
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "WGC capture session started for {capture_label} target {}",
                target.hwnd
            ),
        );
        let previous_attempts = if attempt_details.is_empty() {
            String::new()
        } else {
            format!(
                "; previous WGC target attempts: {}",
                attempt_details.join(" | ")
            )
        };
        let popup_close_command = popup_ensure.close_command.take();
        let popup_restore_state = if popup_close_command.is_some() {
            None
        } else {
            popup_preparation.restore_state.take()
        };
        let mouse_relay_targets = if manages_launchpad_popup {
            collect_wallpaper_engine_mouse_relay_targets(target, &window_diagnostics)
        } else {
            Vec::new()
        };
        let mouse_relay_target_hwnds = mouse_relay_targets
            .iter()
            .filter_map(|target| parse_live_desktop_window_handle(&target.hwnd))
            .collect::<Vec<_>>();
        let mouse_relay_target_labels = mouse_relay_targets
            .iter()
            .map(|target| target.hwnd.as_str())
            .collect::<Vec<_>>()
            .join(",");
        let mouse_relay = if !mouse_relay_target_hwnds.is_empty() {
            Some(Mutex::new(LiveDesktopMouseRelay {
                target_hwnds: mouse_relay_target_hwnds,
                output_rect: capture.output_rect.clone(),
                source_width: size.Width as u32,
                source_height: size.Height as u32,
                last_position: None,
            }))
        } else {
            None
        };
        let mouse_relay_detail = if mouse_relay.is_some() {
            format!(
                "mouseRelay=enabled targets={} outputRect={}x{}@{},{} source={}x{}",
                mouse_relay_target_labels,
                capture.output_rect.width,
                capture.output_rect.height,
                capture.output_rect.left,
                capture.output_rect.top,
                size.Width,
                size.Height
            )
        } else if *diagnostic_mode == LiveDesktopDiagnosticMode::WallpaperEnginePopupCapture {
            "mouseRelay=skipped(unmanagedPopup)".to_string()
        } else {
            String::new()
        };

        return Ok(LiveDesktopWindowCapture {
            hwnd,
            width: size.Width as u32,
            height: size.Height as u32,
            source_label: capture_label,
            detail: format!(
                "{} initialized for {} role={} class={} process={} reason={} parent={} root={} style={} exStyle={} cloaked={} size={}x{} {} {} {} {} after {}/{} target attempts{}",
                capture_label,
                target.hwnd,
                target.role,
                target.class_name,
                target.process_name,
                target.candidate_reason,
                target.parent_hwnd,
                target.root_hwnd,
                target.style,
                target.ex_style,
                target.cloaked,
                size.Width,
                size.Height,
                cursor_capture_detail,
                frame_event_detail,
                format_wallpaper_engine_popup_runtime_detail(
                    &popup_ensure.detail,
                    &popup_preparation.detail
                ),
                mouse_relay_detail,
                target_index + 1,
                target_count,
                previous_attempts
            ),
            popup_restore_state,
            popup_close_command,
            mouse_relay,
            _item: item,
            frame_pool,
            _session: session,
            frame_arrived_receiver,
            frame_arrived_token,
            _frame_arrived_handler: frame_arrived_handler,
        });
    }

    let restore_detail = if let Some(state) = popup_preparation.restore_state.as_ref() {
        match unsafe { restore_wallpaper_engine_popup_after_capture(state) } {
            Ok(()) => "; popup restored after failed WGC attempts".to_string(),
            Err(error) => format!("; {error}"),
        }
    } else {
        String::new()
    };
    let close_detail = cleanup_wallpaper_engine_popup_after_failed_capture(&mut popup_ensure);
    Err(format!(
        "{capture_label} failed for all {target_count} WGC targets: {}{}{}",
        attempt_details.join(" | "),
        restore_detail,
        close_detail
    ))
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_dwm_shared_surface_capture(
    d3d_device: &ID3D11Device,
    adapter_luid: LUID,
    target_monitor: HMONITOR,
    progress_sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
) -> Result<LiveDesktopDwmSharedSurfaceCapture, String> {
    report_live_desktop_renderer_startup_progress(
        progress_sender,
        "Loading DWM private shared surface APIs",
    );
    let api = unsafe { load_live_desktop_dwm_api() }?;
    let api_detail = api.detail();

    report_live_desktop_renderer_startup_progress(
        progress_sender,
        format!("Probing WorkerW windows through DWM shared surfaces; {api_detail}"),
    );
    let window_diagnostics = unsafe { probe_windows_live_desktop_windows() };
    let targets = collect_live_desktop_dwm_shared_surface_targets(&window_diagnostics);
    if targets.is_empty() {
        return Err(format!(
            "WorkerW diagnostics found no DWM shared surface targets: {}; {api_detail}",
            window_diagnostics.detail
        ));
    }

    let target_count = targets.len();
    let mut attempt_details = Vec::new();
    for (target_index, target) in targets.iter().enumerate() {
        let hwnd = match parse_live_desktop_window_handle(&target.hwnd) {
            Some(hwnd) => hwnd,
            None => {
                attempt_details.push(format_live_desktop_dwm_attempt(
                    target,
                    "invalid HWND".to_string(),
                ));
                continue;
            }
        };
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Trying DWM shared surface target {}/{} {} role={} class={} process={} reason={} noRedirectionBitmap={}",
                target_index + 1,
                target_count,
                target.hwnd,
                target.role,
                target.class_name,
                target.process_name,
                target.candidate_reason,
                live_desktop_window_has_no_redirection_bitmap(target)
            ),
        );

        let candidate = match unsafe {
            try_create_live_desktop_dwm_shared_surface_candidate(
                &api,
                d3d_device,
                adapter_luid,
                target_monitor,
                hwnd,
            )
        } {
            Ok(candidate) => candidate,
            Err(error) => {
                attempt_details.push(format_live_desktop_dwm_attempt(target, error));
                continue;
            }
        };
        if !is_acceptable_live_desktop_dwm_shared_surface_target(target) {
            attempt_details.push(format_live_desktop_dwm_attempt(
                target,
                format!(
                    "DWM shared surface opened {}x{} format {} but target was rejected because it captures the desktop shell/icons; {}",
                    candidate.width, candidate.height, candidate.format, candidate.detail
                ),
            ));
            continue;
        }

        let previous_attempts = if attempt_details.is_empty() {
            String::new()
        } else {
            format!(
                "; previous DWM target attempts: {}",
                attempt_details.join(" | ")
            )
        };

        return Ok(LiveDesktopDwmSharedSurfaceCapture {
            hwnd,
            width: candidate.width,
            height: candidate.height,
            format: candidate.format,
            update_id: candidate.update_id,
            target_monitor,
            detail: format!(
                "DWM shared surface capture initialized for {} role={} class={} process={} reason={} parent={} root={} style={} exStyle={} noRedirectionBitmap={} cloaked={} size={}x{} format {} updateId {} after {}/{} target attempts; {}; {}{}",
                target.hwnd,
                target.role,
                target.class_name,
                target.process_name,
                target.candidate_reason,
                target.parent_hwnd,
                target.root_hwnd,
                target.style,
                target.ex_style,
                live_desktop_window_has_no_redirection_bitmap(target),
                target.cloaked,
                candidate.width,
                candidate.height,
                candidate.format,
                candidate.update_id,
                target_index + 1,
                target_count,
                api_detail,
                candidate.detail,
                previous_attempts
            ),
            source_texture: candidate.source_texture,
            _api: api,
        });
    }

    Err(format!(
        "DWM shared surface capture failed for all {target_count} WorkerW targets; {api_detail}: {}",
        attempt_details.join(" | ")
    ))
}

#[cfg(target_os = "windows")]
unsafe fn try_create_live_desktop_dwm_shared_surface_candidate(
    api: &LiveDesktopDwmApi,
    d3d_device: &ID3D11Device,
    adapter_luid: LUID,
    target_monitor: HMONITOR,
    hwnd: HWND,
) -> Result<LiveDesktopDwmSharedSurfaceCandidate, String> {
    let mut attempt_details = Vec::new();

    if let Some(dx_get_window_shared_surface) = api.dx_get_window_shared_surface {
        match unsafe {
            try_live_desktop_dwm_dx_get_window_shared_surface(
                api.dx_get_window_shared_surface_name,
                dx_get_window_shared_surface,
                d3d_device,
                adapter_luid,
                target_monitor,
                hwnd,
            )
        } {
            Ok(candidate) => return Ok(candidate),
            Err(error) => attempt_details.push(format!(
                "{}: {error}",
                api.dx_get_window_shared_surface_name
            )),
        }
    } else {
        attempt_details.push("window shared surface export missing".to_string());
    }

    if let Some(get_dx_shared_surface) = api.get_dx_shared_surface {
        match unsafe {
            try_live_desktop_dwm_get_dx_shared_surface(
                api.get_dx_shared_surface_name,
                get_dx_shared_surface,
                d3d_device,
                adapter_luid,
                hwnd,
            )
        } {
            Ok(candidate) => return Ok(candidate),
            Err(error) => {
                attempt_details.push(format!("{}: {error}", api.get_dx_shared_surface_name))
            }
        }
    } else {
        attempt_details.push("legacy get shared surface export missing".to_string());
    }

    Err(attempt_details.join("; "))
}

#[cfg(target_os = "windows")]
unsafe fn try_live_desktop_dwm_dx_get_window_shared_surface(
    api_name: &str,
    dx_get_window_shared_surface: DwmDxGetWindowSharedSurfaceFn,
    d3d_device: &ID3D11Device,
    adapter_luid: LUID,
    target_monitor: HMONITOR,
    hwnd: HWND,
) -> Result<LiveDesktopDwmSharedSurfaceCandidate, String> {
    let mut format = 0i32;
    let mut shared_handle = HANDLE::default();
    let mut update_id = 0u64;
    let result = unsafe {
        dx_get_window_shared_surface(
            hwnd,
            adapter_luid,
            target_monitor,
            0,
            &mut format,
            &mut shared_handle,
            &mut update_id,
        )
    };
    if result.is_err() {
        return Err(format_live_desktop_hresult(result));
    }
    unsafe {
        open_live_desktop_dwm_shared_surface_texture(
            d3d_device,
            shared_handle,
            adapter_luid,
            None,
            format,
            update_id,
            format!(
                "{api_name} adapterLuid={} monitor={} reportedFormat={format}",
                format_live_desktop_luid(&adapter_luid),
                format_live_desktop_monitor_handle(target_monitor)
            ),
        )
    }
}

#[cfg(target_os = "windows")]
unsafe fn try_live_desktop_dwm_get_dx_shared_surface(
    api_name: &str,
    get_dx_shared_surface: DwmGetDxSharedSurfaceFn,
    d3d_device: &ID3D11Device,
    adapter_luid: LUID,
    hwnd: HWND,
) -> Result<LiveDesktopDwmSharedSurfaceCandidate, String> {
    let mut shared_handle = HANDLE::default();
    let mut returned_adapter_luid = LUID::default();
    let mut format = 0u32;
    let mut present_flags = 0u32;
    let mut update_id = 0u64;
    let result = unsafe {
        get_dx_shared_surface(
            hwnd,
            &mut shared_handle,
            &mut returned_adapter_luid,
            &mut format,
            &mut present_flags,
            &mut update_id,
        )
    };
    if result.is_err() {
        return Err(format_live_desktop_hresult(result));
    }
    unsafe {
        open_live_desktop_dwm_shared_surface_texture(
            d3d_device,
            shared_handle,
            adapter_luid,
            Some(returned_adapter_luid),
            format as i32,
            update_id,
            format!(
                "{api_name} expectedAdapterLuid={} returnedAdapterLuid={} reportedFormat={} presentFlags=0x{:X}",
                format_live_desktop_luid(&adapter_luid),
                format_live_desktop_luid(&returned_adapter_luid),
                format,
                present_flags
            ),
        )
    }
}

#[cfg(target_os = "windows")]
unsafe fn open_live_desktop_dwm_shared_surface_texture(
    d3d_device: &ID3D11Device,
    shared_handle: HANDLE,
    expected_adapter_luid: LUID,
    returned_adapter_luid: Option<LUID>,
    reported_format: i32,
    update_id: u64,
    detail: String,
) -> Result<LiveDesktopDwmSharedSurfaceCandidate, String> {
    if live_desktop_handle_is_invalid(shared_handle) {
        return Err(format!("{detail}; returned an invalid shared handle"));
    }
    if let Some(returned_adapter_luid) = returned_adapter_luid {
        if !live_desktop_luid_equal(&expected_adapter_luid, &returned_adapter_luid) {
            unsafe {
                let _ = CloseHandle(shared_handle);
            }
            return Err(format!(
                "{detail}; adapter LUID mismatch prevents OpenSharedResource on the current D3D device"
            ));
        }
    }

    let mut source_texture: Option<ID3D11Texture2D> = None;
    let texture_result =
        unsafe { d3d_device.OpenSharedResource(shared_handle, &mut source_texture) };
    unsafe {
        let _ = CloseHandle(shared_handle);
    }
    texture_result
        .map_err(|error| format!("{detail}; ID3D11Device::OpenSharedResource failed: {error}"))?;
    let source_texture = source_texture
        .ok_or_else(|| format!("{detail}; ID3D11Device::OpenSharedResource returned no texture"))?;
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { source_texture.GetDesc(&mut desc) };
    if desc.Width == 0 || desc.Height == 0 {
        return Err(format!(
            "{detail}; OpenSharedResource returned an invalid {}x{} texture",
            desc.Width, desc.Height
        ));
    }
    if desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM {
        return Err(format!(
            "{detail}; unsupported shared texture format {} for DirectComposition surface format {}",
            desc.Format.0, DXGI_FORMAT_B8G8R8A8_UNORM.0
        ));
    }

    Ok(LiveDesktopDwmSharedSurfaceCandidate {
        source_texture,
        width: desc.Width,
        height: desc.Height,
        format: desc.Format.0,
        update_id,
        detail: format!(
            "{detail}; opened shared texture {}x{} format {} reportedFormat {}",
            desc.Width, desc.Height, desc.Format.0, reported_format
        ),
    })
}

#[cfg(target_os = "windows")]
unsafe fn load_live_desktop_dwm_api() -> Result<LiveDesktopDwmApi, String> {
    let module = unsafe { LoadLibraryA(s!("dwmapi.dll")) }
        .map_err(|error| format!("LoadLibraryA(dwmapi.dll) failed: {error}"))?;
    let (dx_get_window_shared_surface, dx_get_window_shared_surface_name) = unsafe {
        load_live_desktop_dwm_proc_alias::<DwmDxGetWindowSharedSurfaceFn>(
            module,
            &[
                (
                    "DwmpDxGetWindowSharedSurface",
                    s!("DwmpDxGetWindowSharedSurface"),
                ),
                (
                    "DwmDxGetWindowSharedSurface",
                    s!("DwmDxGetWindowSharedSurface"),
                ),
            ],
        )
    };
    let (dx_update_window_shared_surface, dx_update_window_shared_surface_name) = unsafe {
        load_live_desktop_dwm_proc_alias::<DwmDxUpdateWindowSharedSurfaceFn>(
            module,
            &[
                (
                    "DwmpDxUpdateWindowSharedSurface",
                    s!("DwmpDxUpdateWindowSharedSurface"),
                ),
                (
                    "DwmDxUpdateWindowSharedSurface",
                    s!("DwmDxUpdateWindowSharedSurface"),
                ),
            ],
        )
    };
    let (get_dx_shared_surface, get_dx_shared_surface_name) = unsafe {
        load_live_desktop_dwm_proc_alias::<DwmGetDxSharedSurfaceFn>(
            module,
            &[("DwmGetDxSharedSurface", s!("DwmGetDxSharedSurface"))],
        )
    };
    let api = LiveDesktopDwmApi {
        dx_get_window_shared_surface,
        dx_get_window_shared_surface_name,
        dx_update_window_shared_surface,
        dx_update_window_shared_surface_name,
        get_dx_shared_surface,
        get_dx_shared_surface_name,
    };
    if api.dx_get_window_shared_surface.is_none() && api.get_dx_shared_surface.is_none() {
        return Err(format!(
            "DWM shared surface exports unavailable; {}",
            api.detail()
        ));
    }
    if api.dx_update_window_shared_surface.is_none() {
        return Err(format!(
            "DWM update shared surface export unavailable; {}",
            api.detail()
        ));
    }
    Ok(api)
}

#[cfg(target_os = "windows")]
unsafe fn load_live_desktop_dwm_proc_alias<T: Copy>(
    module: HMODULE,
    aliases: &[(&'static str, PCSTR)],
) -> (Option<T>, &'static str) {
    for (label, name) in aliases.iter() {
        if let Some(proc) = unsafe { load_live_desktop_dwm_proc(module, *name) } {
            return (Some(proc), *label);
        }
    }
    (None, "missing")
}

#[cfg(target_os = "windows")]
unsafe fn load_live_desktop_dwm_proc<T: Copy>(module: HMODULE, name: PCSTR) -> Option<T> {
    let proc = unsafe { GetProcAddress(module, name) }?;
    Some(unsafe { std::mem::transmute_copy(&proc) })
}

#[cfg(target_os = "windows")]
impl LiveDesktopDwmApi {
    fn detail(&self) -> String {
        format!(
            "DWM exports: windowSharedSurface={}, updateWindowSharedSurface={}, legacyGetDxSharedSurface={}",
            if self.dx_get_window_shared_surface.is_some() {
                self.dx_get_window_shared_surface_name
            } else {
                "missing"
            },
            if self.dx_update_window_shared_surface.is_some() {
                self.dx_update_window_shared_surface_name
            } else {
                "missing"
            },
            if self.get_dx_shared_surface.is_some() {
                self.get_dx_shared_surface_name
            } else {
                "missing"
            }
        )
    }
}

#[cfg(target_os = "windows")]
fn live_desktop_handle_is_invalid(handle: HANDLE) -> bool {
    handle.0.is_null() || handle.0 as isize == -1
}

#[cfg(target_os = "windows")]
fn live_desktop_luid_equal(left: &LUID, right: &LUID) -> bool {
    left.LowPart == right.LowPart && left.HighPart == right.HighPart
}

#[cfg(target_os = "windows")]
fn format_live_desktop_luid(luid: &LUID) -> String {
    format!("{:08X}:{:08X}", luid.HighPart as u32, luid.LowPart)
}

#[cfg(target_os = "windows")]
fn format_live_desktop_monitor_handle(monitor: HMONITOR) -> String {
    if monitor.0.is_null() {
        return String::new();
    }
    format!("0x{:X}", monitor.0 as usize)
}

#[cfg(target_os = "windows")]
fn format_live_desktop_hresult(result: HRESULT) -> String {
    let code = result.0 as u32;
    match result.ok() {
        Ok(()) => format!("S_OK (0x{code:08X})"),
        Err(error) => format!("{error} (0x{code:08X})"),
    }
}

#[cfg(target_os = "windows")]
fn parse_live_desktop_window_handle(value: &str) -> Option<HWND> {
    let handle = value
        .strip_prefix("0x")
        .and_then(|value| usize::from_str_radix(value, 16).ok())?;
    if handle == 0 {
        return None;
    }
    Some(HWND(handle as _))
}

#[cfg(target_os = "windows")]
unsafe fn copy_initial_live_desktop_frame_to_composition_surface(
    window_capture: Option<&LiveDesktopWindowCapture>,
    dwm_shared_surface_capture: Option<&LiveDesktopDwmSharedSurfaceCapture>,
    duplication: &IDXGIOutputDuplication,
    surface: &IDCompositionSurface,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    config: &LiveDesktopRuntimeConfig,
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) -> Result<Option<LiveDesktopFrameProbe>, String> {
    if config.diagnostic_mode.uses_dwm_shared_surface_capture() {
        if let Some(dwm_shared_surface_capture) = dwm_shared_surface_capture {
            return unsafe {
                copy_dwm_shared_surface_frame_to_composition_surface(
                    dwm_shared_surface_capture,
                    surface,
                    device,
                    context,
                    diagnostics,
                )
            }
            .map(Some);
        }
    }

    if config.diagnostic_mode.uses_window_capture() {
        if let Some(window_capture) = window_capture {
            let deadline = std::time::Instant::now()
                + Duration::from_millis(LIVE_DESKTOP_INITIAL_FRAME_WAIT_MS as u64);
            while std::time::Instant::now() < deadline {
                unsafe { relay_wallpaper_engine_popup_mouse(window_capture) };
                match unsafe {
                    copy_window_capture_frame_to_composition_surface(
                        window_capture,
                        surface,
                        context,
                    )
                } {
                    Ok(Some(frame)) => return Ok(Some(frame)),
                    Ok(None) => thread::sleep(Duration::from_millis(8)),
                    Err(error) => return Err(error),
                }
            }
            return Ok(None);
        }
    }

    unsafe {
        copy_duplication_frame_to_composition_surface(
            duplication,
            surface,
            context,
            LIVE_DESKTOP_INITIAL_FRAME_WAIT_MS,
        )
    }
}

#[cfg(target_os = "windows")]
unsafe fn update_live_desktop_dwm_shared_surface(
    dwm_capture: &LiveDesktopDwmSharedSurfaceCapture,
) -> Result<RECT, String> {
    let update = dwm_capture
        ._api
        .dx_update_window_shared_surface
        .ok_or_else(|| "DWM update shared surface export is missing".to_string())?;
    let mut update_rect = RECT {
        left: 0,
        top: 0,
        right: dwm_capture.width as i32,
        bottom: dwm_capture.height as i32,
    };
    let result = unsafe {
        update(
            dwm_capture.hwnd,
            dwm_capture.update_id,
            dwm_capture.format,
            dwm_capture.target_monitor,
            &mut update_rect,
        )
    };
    if result.is_err() {
        return Err(format!(
            "{} failed for {} updateId {} format {} monitor {} rect {}x{}: {}",
            dwm_capture._api.dx_update_window_shared_surface_name,
            format_live_desktop_window_handle(dwm_capture.hwnd),
            dwm_capture.update_id,
            dwm_capture.format,
            format_live_desktop_monitor_handle(dwm_capture.target_monitor),
            dwm_capture.width,
            dwm_capture.height,
            format_live_desktop_hresult(result)
        ));
    }
    Ok(update_rect)
}

#[cfg(target_os = "windows")]
unsafe fn probe_live_desktop_dwm_surface_pixels(
    dwm_capture: &LiveDesktopDwmSharedSurfaceCapture,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
) -> Result<LiveDesktopDwmPixelProbe, String> {
    let mut source_desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { dwm_capture.source_texture.GetDesc(&mut source_desc) };
    if source_desc.Width == 0 || source_desc.Height == 0 {
        return Err("DWM pixel probe source texture has invalid size".to_string());
    }
    if source_desc.SampleDesc.Count != 1 {
        return Err(format!(
            "DWM pixel probe does not support multisampled textures: sampleCount={}",
            source_desc.SampleDesc.Count
        ));
    }

    let probe_width = source_desc.Width.min(16);
    let probe_height = source_desc.Height.min(16);
    let left = source_desc.Width.saturating_sub(probe_width) / 2;
    let top = source_desc.Height.saturating_sub(probe_height) / 2;
    let source_box = D3D11_BOX {
        left,
        top,
        front: 0,
        right: left + probe_width,
        bottom: top + probe_height,
        back: 1,
    };
    let staging_desc = D3D11_TEXTURE2D_DESC {
        Width: probe_width,
        Height: probe_height,
        MipLevels: 1,
        ArraySize: 1,
        Format: source_desc.Format,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let mut staging_texture: Option<ID3D11Texture2D> = None;
    unsafe { device.CreateTexture2D(&staging_desc, None, Some(&mut staging_texture)) }
        .map_err(|error| format!("DWM pixel probe CreateTexture2D failed: {error}"))?;
    let staging_texture = staging_texture
        .ok_or_else(|| "DWM pixel probe CreateTexture2D returned no texture".to_string())?;
    let source_resource = dwm_capture
        .source_texture
        .cast::<ID3D11Resource>()
        .map_err(|error| format!("DWM pixel probe source resource cast failed: {error}"))?;
    let staging_resource = staging_texture
        .cast::<ID3D11Resource>()
        .map_err(|error| format!("DWM pixel probe staging resource cast failed: {error}"))?;
    unsafe {
        context.CopySubresourceRegion(
            &staging_resource,
            0,
            0,
            0,
            0,
            &source_resource,
            0,
            Some(&source_box),
        )
    };

    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(&staging_resource, 0, D3D11_MAP_READ, 0, Some(&mut mapped)) }
        .map_err(|error| format!("DWM pixel probe Map failed: {error}"))?;
    let probe_result = (|| -> Result<LiveDesktopDwmPixelProbe, String> {
        if mapped.pData.is_null() {
            return Err("DWM pixel probe Map returned null data".to_string());
        }
        let row_pitch = mapped.RowPitch as usize;
        let bytes = unsafe {
            std::slice::from_raw_parts(mapped.pData as *const u8, row_pitch * probe_height as usize)
        };
        let mut min_rgb = u32::MAX;
        let mut max_rgb = 0u32;
        let mut sum_rgb = 0u64;
        let mut sample_count = 0u64;
        for y in 0..probe_height as usize {
            let row_start = y * row_pitch;
            for x in 0..probe_width as usize {
                let offset = row_start + x * 4;
                let channels = [
                    bytes.get(offset).copied().unwrap_or_default(),
                    bytes.get(offset + 1).copied().unwrap_or_default(),
                    bytes.get(offset + 2).copied().unwrap_or_default(),
                ];
                for channel in channels {
                    let value = channel as u32;
                    min_rgb = min_rgb.min(value);
                    max_rgb = max_rgb.max(value);
                    sum_rgb += value as u64;
                    sample_count += 1;
                }
            }
        }
        if sample_count == 0 {
            return Err("DWM pixel probe sampled no pixels".to_string());
        }
        Ok(LiveDesktopDwmPixelProbe {
            width: probe_width,
            height: probe_height,
            min_rgb,
            max_rgb,
            avg_rgb: (sum_rgb / sample_count) as u32,
        })
    })();
    unsafe { context.Unmap(&staging_resource, 0) };
    probe_result
}

#[cfg(target_os = "windows")]
unsafe fn copy_dwm_shared_surface_frame_to_composition_surface(
    dwm_capture: &LiveDesktopDwmSharedSurfaceCapture,
    surface: &IDCompositionSurface,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) -> Result<LiveDesktopFrameProbe, String> {
    let mut source_desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { dwm_capture.source_texture.GetDesc(&mut source_desc) };
    let update_rect =
        unsafe { update_live_desktop_dwm_shared_surface(dwm_capture) }.map_err(|error| {
            record_live_desktop_dwm_surface_update_error(diagnostics, &error);
            error
        })?;
    record_live_desktop_dwm_surface_update(diagnostics, &update_rect);

    if should_probe_live_desktop_dwm_pixels(diagnostics) {
        match unsafe { probe_live_desktop_dwm_surface_pixels(dwm_capture, device, context) } {
            Ok(probe) => record_live_desktop_dwm_pixel_probe(diagnostics, &probe),
            Err(error) => record_live_desktop_dwm_pixel_probe_error(diagnostics, &error),
        }
    }

    let mut update_offset = POINT::default();
    let update_surface: IDXGISurface = unsafe { surface.BeginDraw(None, &mut update_offset) }
        .map_err(|error| format!("DirectComposition DWM BeginDraw failed: {error}"))?;
    let draw_result = (|| -> Result<(), String> {
        let target_texture = update_surface.cast::<ID3D11Texture2D>().map_err(|error| {
            format!("DirectComposition DWM update surface is not an ID3D11Texture2D: {error}")
        })?;
        let mut target_desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { target_texture.GetDesc(&mut target_desc) };
        if source_desc.Width != target_desc.Width || source_desc.Height != target_desc.Height {
            return Err(format!(
                "DWM source size {}x{} does not match DirectComposition surface {}x{}",
                source_desc.Width, source_desc.Height, target_desc.Width, target_desc.Height
            ));
        }
        let source_resource = dwm_capture
            .source_texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("DWM source texture resource cast failed: {error}"))?;
        let target_resource = target_texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("DWM target texture resource cast failed: {error}"))?;
        unsafe { context.CopyResource(&target_resource, &source_resource) };
        Ok(())
    })();
    let end_draw_result = unsafe { surface.EndDraw() }
        .map_err(|error| format!("DirectComposition DWM EndDraw failed: {error}"));
    draw_result?;
    end_draw_result?;

    Ok(LiveDesktopFrameProbe {
        supports_frame_texture: true,
        width: source_desc.Width,
        height: source_desc.Height,
        format: source_desc.Format.0,
        reason: "available",
        detail: format!(
            "Copied GPU DWM shared surface from {} into DirectComposition surface: {}x{} format {} captureFormat {} updateId {}",
            format_live_desktop_window_handle(dwm_capture.hwnd),
            source_desc.Width,
            source_desc.Height,
            source_desc.Format.0,
            dwm_capture.format,
            dwm_capture.update_id
        ),
    })
}

#[cfg(target_os = "windows")]
unsafe fn copy_window_capture_frame_to_composition_surface(
    window_capture: &LiveDesktopWindowCapture,
    surface: &IDCompositionSurface,
    context: &ID3D11DeviceContext,
) -> Result<Option<LiveDesktopFrameProbe>, String> {
    let mut frame = match window_capture.frame_pool.TryGetNextFrame() {
        Ok(frame) => frame,
        Err(_) => return Ok(None),
    };
    while let Ok(next_frame) = window_capture.frame_pool.TryGetNextFrame() {
        let _ = frame.Close();
        frame = next_frame;
    }
    let copy_result = (|| -> Result<LiveDesktopFrameProbe, String> {
        let frame_surface = frame
            .Surface()
            .map_err(|error| format!("WGC frame Surface failed: {error}"))?;
        let access = frame_surface
            .cast::<IDirect3DDxgiInterfaceAccess>()
            .map_err(|error| format!("WGC frame surface DXGI access cast failed: {error}"))?;
        let source_texture: ID3D11Texture2D = unsafe { access.GetInterface() }
            .map_err(|error| format!("WGC frame ID3D11Texture2D access failed: {error}"))?;
        let mut source_desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { source_texture.GetDesc(&mut source_desc) };

        let mut update_offset = POINT::default();
        let update_surface: IDXGISurface =
            unsafe { surface.BeginDraw(None, &mut update_offset) }
                .map_err(|error| format!("DirectComposition WGC BeginDraw failed: {error}"))?;
        let draw_result = (|| -> Result<(), String> {
            let target_texture = update_surface.cast::<ID3D11Texture2D>().map_err(|error| {
                format!("DirectComposition WGC update surface is not an ID3D11Texture2D: {error}")
            })?;
            let mut target_desc = D3D11_TEXTURE2D_DESC::default();
            unsafe { target_texture.GetDesc(&mut target_desc) };
            if source_desc.Width > target_desc.Width || source_desc.Height > target_desc.Height {
                return Err(format!(
                    "WGC source size {}x{} is larger than DirectComposition surface {}x{}",
                    source_desc.Width, source_desc.Height, target_desc.Width, target_desc.Height
                ));
            }
            let source_resource = source_texture
                .cast::<ID3D11Resource>()
                .map_err(|error| format!("WGC source texture resource cast failed: {error}"))?;
            let target_resource = target_texture
                .cast::<ID3D11Resource>()
                .map_err(|error| format!("WGC target texture resource cast failed: {error}"))?;
            if source_desc.Width == target_desc.Width && source_desc.Height == target_desc.Height {
                unsafe { context.CopyResource(&target_resource, &source_resource) };
            } else {
                let source_box = D3D11_BOX {
                    left: 0,
                    top: 0,
                    front: 0,
                    right: source_desc.Width,
                    bottom: source_desc.Height,
                    back: 1,
                };
                unsafe {
                    context.CopySubresourceRegion(
                        &target_resource,
                        0,
                        0,
                        0,
                        0,
                        &source_resource,
                        0,
                        Some(&source_box),
                    )
                };
            }
            Ok(())
        })();
        let end_draw_result = unsafe { surface.EndDraw() }
            .map_err(|error| format!("DirectComposition WGC EndDraw failed: {error}"));
        draw_result?;
        end_draw_result?;

        Ok(LiveDesktopFrameProbe {
            supports_frame_texture: true,
            width: source_desc.Width,
            height: source_desc.Height,
            format: source_desc.Format.0,
            reason: "available",
            detail: format!(
                "Copied GPU WGC frame from {} into DirectComposition surface: {}x{} format {}",
                format_live_desktop_window_handle(window_capture.hwnd),
                source_desc.Width,
                source_desc.Height,
                source_desc.Format.0
            ),
        })
    })();
    let close_result = frame
        .Close()
        .map_err(|error| format!("WGC frame Close failed after copy: {error}"));

    match (copy_result, close_result) {
        (Ok(frame_probe), Ok(())) => Ok(Some(frame_probe)),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(error),
    }
}

#[cfg(target_os = "windows")]
unsafe fn copy_duplication_frame_to_composition_surface(
    duplication: &IDXGIOutputDuplication,
    surface: &IDCompositionSurface,
    context: &ID3D11DeviceContext,
    wait_ms: u32,
) -> Result<Option<LiveDesktopFrameProbe>, String> {
    let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
    let mut resource: Option<IDXGIResource> = None;
    match unsafe { duplication.AcquireNextFrame(wait_ms, &mut frame_info, &mut resource) } {
        Ok(()) => {}
        Err(error) if error.code() == DXGI_ERROR_WAIT_TIMEOUT => return Ok(None),
        Err(error) => {
            return Err(format!(
                "AcquireNextFrame failed during desktop frame copy: {error}"
            ));
        }
    }

    let copy_result = (|| -> Result<LiveDesktopFrameProbe, String> {
        let resource = resource
            .ok_or_else(|| "AcquireNextFrame succeeded without a desktop resource".to_string())?;
        let source_texture = resource.cast::<ID3D11Texture2D>().map_err(|error| {
            format!("Desktop frame resource is not an ID3D11Texture2D: {error}")
        })?;
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { source_texture.GetDesc(&mut desc) };

        let mut update_offset = POINT::default();
        let update_surface: IDXGISurface =
            unsafe { surface.BeginDraw(None, &mut update_offset) }
                .map_err(|error| format!("DirectComposition surface BeginDraw failed: {error}"))?;
        let draw_result = (|| -> Result<(), String> {
            let target_texture = update_surface.cast::<ID3D11Texture2D>().map_err(|error| {
                format!("DirectComposition update surface is not an ID3D11Texture2D: {error}")
            })?;
            let source_resource = source_texture
                .cast::<ID3D11Resource>()
                .map_err(|error| format!("Source texture resource cast failed: {error}"))?;
            let target_resource = target_texture
                .cast::<ID3D11Resource>()
                .map_err(|error| format!("Target texture resource cast failed: {error}"))?;
            unsafe { context.CopyResource(&target_resource, &source_resource) };
            Ok(())
        })();
        let end_draw_result = unsafe { surface.EndDraw() }
            .map_err(|error| format!("DirectComposition surface EndDraw failed: {error}"));
        draw_result?;
        end_draw_result?;

        Ok(LiveDesktopFrameProbe {
            supports_frame_texture: true,
            width: desc.Width,
            height: desc.Height,
            format: desc.Format.0,
            reason: "available",
            detail: format!(
                "Copied GPU desktop frame texture {}x{} format {} into DirectComposition surface",
                desc.Width, desc.Height, desc.Format.0
            ),
        })
    })();

    let release_result = unsafe { duplication.ReleaseFrame() }
        .map_err(|error| format!("ReleaseFrame failed after desktop frame copy: {error}"));

    match (copy_result, release_result) {
        (Ok(frame_probe), Ok(())) => Ok(Some(frame_probe)),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(error),
    }
}

#[cfg(target_os = "windows")]
unsafe fn draw_live_desktop_test_pattern_to_composition_surface(
    surface: &IDCompositionSurface,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    frame_index: u64,
) -> Result<LiveDesktopFrameProbe, String> {
    let mut update_offset = POINT::default();
    let update_surface: IDXGISurface = unsafe { surface.BeginDraw(None, &mut update_offset) }
        .map_err(|error| format!("DirectComposition test pattern BeginDraw failed: {error}"))?;
    let draw_result = (|| -> Result<LiveDesktopFrameProbe, String> {
        let target_texture = update_surface.cast::<ID3D11Texture2D>().map_err(|error| {
            format!("DirectComposition test pattern surface is not an ID3D11Texture2D: {error}")
        })?;
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { target_texture.GetDesc(&mut desc) };
        let target_resource = target_texture.cast::<ID3D11Resource>().map_err(|error| {
            format!("Test pattern target texture resource cast failed: {error}")
        })?;
        let mut render_target_view: Option<ID3D11RenderTargetView> = None;
        unsafe {
            device.CreateRenderTargetView(&target_resource, None, Some(&mut render_target_view))
        }
        .map_err(|error| format!("CreateRenderTargetView for test pattern failed: {error}"))?;
        let render_target_view = render_target_view
            .ok_or_else(|| "CreateRenderTargetView returned no test pattern view".to_string())?;
        let colors = [
            [1.0, 0.0, 0.35, 1.0],
            [0.0, 0.85, 0.35, 1.0],
            [0.1, 0.35, 1.0, 1.0],
        ];
        let color = colors[((frame_index / 30) as usize) % colors.len()];
        unsafe { context.ClearRenderTargetView(&render_target_view, &color) };

        Ok(LiveDesktopFrameProbe {
            supports_frame_texture: true,
            width: desc.Width,
            height: desc.Height,
            format: desc.Format.0,
            reason: "testPattern",
            detail: format!(
                "Drew DirectComposition test pattern {}x{} format {}",
                desc.Width, desc.Height, desc.Format.0
            ),
        })
    })();
    let end_draw_result = unsafe { surface.EndDraw() }
        .map_err(|error| format!("DirectComposition test pattern EndDraw failed: {error}"));
    let frame_probe = draw_result?;
    end_draw_result?;
    Ok(frame_probe)
}

#[cfg(target_os = "windows")]
unsafe fn apply_live_desktop_config_to_effects(
    blur_effect: Option<&IDCompositionGaussianBlurEffect>,
    color_matrix_effect: Option<&IDCompositionColorMatrixEffect>,
    config: &LiveDesktopRuntimeConfig,
) -> Result<(), String> {
    if let Some(blur_effect) = blur_effect {
        unsafe {
            blur_effect.SetStandardDeviation2(resolve_live_desktop_blur_standard_deviation(config))
        }
        .map_err(|error| error.to_string())?;
    }
    if let Some(color_matrix_effect) = color_matrix_effect {
        unsafe { apply_live_desktop_config_to_color_matrix(color_matrix_effect, config) }?;
    }
    Ok(())
}

fn resolve_live_desktop_blur_standard_deviation(config: &LiveDesktopRuntimeConfig) -> f32 {
    if !matches!(
        &config.effect,
        LiveDesktopBackgroundEffect::Blur | LiveDesktopBackgroundEffect::AcrylicWebgl
    ) {
        return 0.0;
    }
    2.0 + (config.blur_strength.min(100) as f32 / 100.0) * 28.0
}

#[cfg(target_os = "windows")]
unsafe fn apply_live_desktop_config_to_color_matrix(
    effect: &IDCompositionColorMatrixEffect,
    config: &LiveDesktopRuntimeConfig,
) -> Result<(), String> {
    let matrix = resolve_live_desktop_color_matrix(config);
    for (row_index, row) in matrix.iter().enumerate() {
        for (column_index, value) in row.iter().enumerate() {
            unsafe { effect.SetMatrixElement2(row_index as i32, column_index as i32, *value) }
                .map_err(|error| error.to_string())?;
        }
    }
    unsafe { effect.SetClampOutput(true) }.map_err(|error| error.to_string())?;
    Ok(())
}

fn resolve_live_desktop_color_matrix(config: &LiveDesktopRuntimeConfig) -> [[f32; 4]; 5] {
    match &config.effect {
        LiveDesktopBackgroundEffect::Dimmed => resolve_live_desktop_dimmed_color_matrix(config),
        LiveDesktopBackgroundEffect::AcrylicWebgl => {
            resolve_live_desktop_acrylic_color_matrix(config)
        }
        LiveDesktopBackgroundEffect::None | LiveDesktopBackgroundEffect::Blur => {
            live_desktop_identity_color_matrix()
        }
    }
}

fn live_desktop_identity_color_matrix() -> [[f32; 4]; 5] {
    [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
        [0.0, 0.0, 0.0, 0.0],
    ]
}

fn resolve_live_desktop_dimmed_color_matrix(config: &LiveDesktopRuntimeConfig) -> [[f32; 4]; 5] {
    let amount = config.darken_strength.min(100) as f32 / 100.0;
    let scale = 1.0 - amount;
    let color = parse_live_desktop_hex_color(&config.darken_color);
    [
        [scale, 0.0, 0.0, 0.0],
        [0.0, scale, 0.0, 0.0],
        [0.0, 0.0, scale, 0.0],
        [0.0, 0.0, 0.0, 1.0],
        [color[0] * amount, color[1] * amount, color[2] * amount, 0.0],
    ]
}

fn resolve_live_desktop_acrylic_color_matrix(config: &LiveDesktopRuntimeConfig) -> [[f32; 4]; 5] {
    let fallback = LiveDesktopAcrylicParams::default();
    let brightness = clamp_live_desktop_f32(
        config.acrylic_params.brightness,
        0.4,
        1.4,
        fallback.brightness,
    );
    let contrast =
        clamp_live_desktop_f32(config.acrylic_params.contrast, 0.6, 1.4, fallback.contrast);
    let saturation = clamp_live_desktop_f32(
        config.acrylic_params.saturation,
        0.4,
        1.8,
        fallback.saturation,
    );
    let tint_strength = clamp_live_desktop_f32(
        config.acrylic_params.tint_strength,
        0.0,
        0.8,
        fallback.tint_strength,
    );
    let tint_color = [
        clamp_live_desktop_f32(
            config.acrylic_params.tint_color[0],
            0.0,
            1.0,
            fallback.tint_color[0],
        ),
        clamp_live_desktop_f32(
            config.acrylic_params.tint_color[1],
            0.0,
            1.0,
            fallback.tint_color[1],
        ),
        clamp_live_desktop_f32(
            config.acrylic_params.tint_color[2],
            0.0,
            1.0,
            fallback.tint_color[2],
        ),
    ];
    let tint_scale = 1.0 - tint_strength;
    let gain = contrast * brightness * tint_scale;
    let saturation_inverse = 1.0 - saturation;
    let luminance = [0.299, 0.587, 0.114];
    let saturation_matrix = [
        [
            luminance[0] * saturation_inverse + saturation,
            luminance[0] * saturation_inverse,
            luminance[0] * saturation_inverse,
        ],
        [
            luminance[1] * saturation_inverse,
            luminance[1] * saturation_inverse + saturation,
            luminance[1] * saturation_inverse,
        ],
        [
            luminance[2] * saturation_inverse,
            luminance[2] * saturation_inverse,
            luminance[2] * saturation_inverse + saturation,
        ],
    ];
    let contrast_offset = (0.5 - 0.5 * contrast) * brightness * tint_scale;
    [
        [
            saturation_matrix[0][0] * gain,
            saturation_matrix[0][1] * gain,
            saturation_matrix[0][2] * gain,
            0.0,
        ],
        [
            saturation_matrix[1][0] * gain,
            saturation_matrix[1][1] * gain,
            saturation_matrix[1][2] * gain,
            0.0,
        ],
        [
            saturation_matrix[2][0] * gain,
            saturation_matrix[2][1] * gain,
            saturation_matrix[2][2] * gain,
            0.0,
        ],
        [0.0, 0.0, 0.0, 1.0],
        [
            contrast_offset + tint_color[0] * tint_strength,
            contrast_offset + tint_color[1] * tint_strength,
            contrast_offset + tint_color[2] * tint_strength,
            0.0,
        ],
    ]
}

fn clamp_live_desktop_f32(value: f32, min: f32, max: f32, fallback: f32) -> f32 {
    if !value.is_finite() {
        return fallback;
    }
    value.clamp(min, max)
}

fn parse_live_desktop_hex_color(value: &str) -> [f32; 3] {
    let value = value.trim().strip_prefix('#').unwrap_or(value.trim());
    if value.len() != 6 {
        return [28.0 / 255.0, 28.0 / 255.0, 28.0 / 255.0];
    }
    let red = u8::from_str_radix(&value[0..2], 16);
    let green = u8::from_str_radix(&value[2..4], 16);
    let blue = u8::from_str_radix(&value[4..6], 16);
    match (red, green, blue) {
        (Ok(red), Ok(green), Ok(blue)) => [
            red as f32 / 255.0,
            green as f32 / 255.0,
            blue as f32 / 255.0,
        ],
        _ => [28.0 / 255.0, 28.0 / 255.0, 28.0 / 255.0],
    }
}

#[cfg(target_os = "windows")]
fn live_desktop_wide_string(value: &[u16]) -> String {
    let end = value
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(value.len());
    String::from_utf16_lossy(&value[..end]).trim().to_string()
}

#[cfg(target_os = "windows")]
fn live_desktop_adapter_name(description: &[u16; 128]) -> String {
    let name = live_desktop_wide_string(description);
    if name.is_empty() {
        "Unknown adapter".to_string()
    } else {
        name
    }
}

#[cfg(target_os = "windows")]
fn live_desktop_output_name(device_name: &[u16; 32]) -> String {
    let name = live_desktop_wide_string(device_name);
    if name.is_empty() {
        "Unknown output".to_string()
    } else {
        name
    }
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_native_effects(
    dxgi_device: &IDXGIDevice,
    adapter_index: u32,
    phase: &str,
) -> LiveDesktopNativeEffects {
    let device3 = match unsafe { DCompositionCreateDevice2::<_, IDCompositionDevice3>(dxgi_device) }
    {
        Ok(device) => device,
        Err(error) => {
            return LiveDesktopNativeEffects {
                color_matrix_effect: None,
                blur_effect: None,
                detail: format!(
                    "Native DirectComposition effects unavailable during {phase} on adapter {adapter_index}: DCompositionCreateDevice2<IDCompositionDevice3> failed: {error}"
                ),
            };
        }
    };

    let color_matrix_effect = match unsafe { device3.CreateColorMatrixEffect() } {
        Ok(effect) => Some(effect),
        Err(error) => {
            return LiveDesktopNativeEffects {
                color_matrix_effect: None,
                blur_effect: None,
                detail: format!(
                    "Native DirectComposition effects unavailable during {phase} on adapter {adapter_index}: CreateColorMatrixEffect failed: {error}"
                ),
            };
        }
    };

    let blur_effect = match unsafe { device3.CreateGaussianBlurEffect() } {
        Ok(effect) => Some(effect),
        Err(error) => {
            return LiveDesktopNativeEffects {
                color_matrix_effect: None,
                blur_effect: None,
                detail: format!(
                    "Native DirectComposition effects unavailable during {phase} on adapter {adapter_index}: CreateGaussianBlurEffect failed: {error}"
                ),
            };
        }
    };

    LiveDesktopNativeEffects {
        color_matrix_effect,
        blur_effect,
        detail: format!(
            "Native DirectComposition effects available during {phase} on adapter {adapter_index}"
        ),
    }
}

#[cfg(target_os = "windows")]
unsafe fn set_direct_composition_root(
    device: &IDCompositionDevice,
    target: &IDCompositionTarget,
    visual: &IDCompositionVisual,
    surface: &IDCompositionSurface,
    blur_effect: &Option<IDCompositionGaussianBlurEffect>,
    effect: &Option<IDCompositionColorMatrixEffect>,
    placement: &LiveDesktopVisualPlacement,
) -> Result<IDCompositionScaleTransform, String> {
    let scale_transform = unsafe { device.CreateScaleTransform() }.map_err(|error| {
        format!("CreateScaleTransform failed while placing live desktop visual: {error}")
    })?;
    unsafe { scale_transform.SetCenterX2(0.0) }.map_err(|error| error.to_string())?;
    unsafe { scale_transform.SetCenterY2(0.0) }.map_err(|error| error.to_string())?;
    unsafe { scale_transform.SetScaleX2(placement.scale) }.map_err(|error| error.to_string())?;
    unsafe { scale_transform.SetScaleY2(placement.scale) }.map_err(|error| error.to_string())?;
    unsafe { visual.SetOffsetX2(placement.offset_x) }.map_err(|error| error.to_string())?;
    unsafe { visual.SetOffsetY2(placement.offset_y) }.map_err(|error| error.to_string())?;
    unsafe { visual.SetTransform(&scale_transform) }.map_err(|error| error.to_string())?;
    unsafe { visual.SetContent(surface) }.map_err(|error| error.to_string())?;
    if let Some(effect) = effect {
        if let Some(blur_effect) = blur_effect {
            unsafe { blur_effect.SetInput(0, surface, 0) }.map_err(|error| error.to_string())?;
            unsafe { effect.SetInput(0, blur_effect, 0) }.map_err(|error| error.to_string())?;
        } else {
            unsafe { effect.SetInput(0, surface, 0) }.map_err(|error| error.to_string())?;
        }
        unsafe { visual.SetEffect(effect) }.map_err(|error| error.to_string())?;
    }
    unsafe { target.SetRoot(visual) }.map_err(|error| error.to_string())?;
    unsafe { device.Commit() }.map_err(|error| error.to_string())?;
    Ok(scale_transform)
}

#[cfg(target_os = "windows")]
unsafe fn create_d3d11_device_for_adapter(adapter: &IDXGIAdapter1) -> Result<ID3D11Device, String> {
    Ok(unsafe { create_d3d11_device_with_context_for_adapter(adapter) }?.device)
}

#[cfg(target_os = "windows")]
unsafe fn create_d3d11_device_with_context_for_adapter(
    adapter: &IDXGIAdapter1,
) -> Result<LiveDesktopD3DDevice, String> {
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    unsafe {
        D3D11CreateDevice(
            adapter,
            D3D_DRIVER_TYPE_UNKNOWN,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&LIVE_DESKTOP_D3D_FEATURE_LEVELS),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
    }
    .map_err(|error| error.to_string())?;

    Ok(LiveDesktopD3DDevice {
        device: device.ok_or_else(|| "D3D11CreateDevice returned no device".to_string())?,
        context: context
            .ok_or_else(|| "D3D11CreateDevice returned no immediate context".to_string())?,
    })
}

#[cfg(target_os = "windows")]
fn probe_live_desktop_capture() -> LiveDesktopCaptureProbe {
    match unsafe { probe_windows_desktop_duplication() } {
        Ok(probe) => probe,
        Err(probe) => probe,
    }
}

#[cfg(not(target_os = "windows"))]
fn probe_live_desktop_capture() -> LiveDesktopCaptureProbe {
    LiveDesktopCaptureProbe {
        supports_d3d11: false,
        supports_desktop_duplication: false,
        frame_probe: empty_frame_probe(
            "unsupportedPlatform",
            "Frame acquisition is only implemented on Windows",
        ),
        adapter_count: 0,
        output_count: 0,
        reason: "unsupportedPlatform",
        detail: "Live desktop backgrounds are only implemented on Windows".to_string(),
    }
}

#[cfg(target_os = "windows")]
unsafe fn probe_windows_desktop_duplication(
) -> Result<LiveDesktopCaptureProbe, LiveDesktopCaptureProbe> {
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.map_err(|error| {
        capture_probe_error(
            false,
            false,
            0,
            0,
            "dxgiUnavailable",
            format!("CreateDXGIFactory1 failed: {error}"),
        )
    })?;

    let mut adapter_count = 0;
    let mut output_count = 0;
    let mut last_detail = String::new();

    for adapter_index in 0.. {
        let adapter = match unsafe { factory.EnumAdapters1(adapter_index) } {
            Ok(adapter) => adapter,
            Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(error) => {
                return Err(capture_probe_error(
                    false,
                    false,
                    adapter_count,
                    output_count,
                    "dxgiAdapterEnumerationFailed",
                    format!("EnumAdapters1({adapter_index}) failed: {error}"),
                ));
            }
        };
        adapter_count += 1;

        let desc = match unsafe { adapter.GetDesc1() } {
            Ok(desc) => desc,
            Err(error) => {
                last_detail = format!("GetDesc1({adapter_index}) failed: {error}");
                continue;
            }
        };
        if (desc.Flags & DXGI_ADAPTER_FLAG3_SOFTWARE.0 as u32) != 0 {
            continue;
        }

        let device = match unsafe { create_d3d11_device_for_adapter(&adapter) } {
            Ok(device) => device,
            Err(error) => {
                last_detail = format!("D3D11CreateDevice({adapter_index}) failed: {error}");
                continue;
            }
        };

        for output_index in 0.. {
            let output = match unsafe { adapter.EnumOutputs(output_index) } {
                Ok(output) => output,
                Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
                Err(error) => {
                    last_detail =
                        format!("EnumOutputs({adapter_index}, {output_index}) failed: {error}");
                    break;
                }
            };
            output_count += 1;

            let output1 = match output.cast::<IDXGIOutput1>() {
                Ok(output1) => output1,
                Err(error) => {
                    last_detail = format!(
                        "IDXGIOutput1 cast({adapter_index}, {output_index}) failed: {error}"
                    );
                    continue;
                }
            };

            match unsafe { output1.DuplicateOutput(&device) } {
                Ok(duplication) => {
                    let frame_probe = unsafe { acquire_duplication_frame_texture(&duplication) };
                    return Ok(LiveDesktopCaptureProbe {
                        supports_d3d11: true,
                        supports_desktop_duplication: true,
                        frame_probe,
                        adapter_count,
                        output_count,
                        reason: "available",
                        detail: format!(
                            "Desktop Duplication probe succeeded on adapter {adapter_index}, output {output_index}"
                        ),
                    });
                }
                Err(error) if error.code() == DXGI_ERROR_ACCESS_DENIED => {
                    last_detail = format!(
                        "DuplicateOutput({adapter_index}, {output_index}) denied access: {error}"
                    );
                    continue;
                }
                Err(error) => {
                    last_detail =
                        format!("DuplicateOutput({adapter_index}, {output_index}) failed: {error}");
                    continue;
                }
            }
        }
    }

    if adapter_count == 0 {
        return Err(capture_probe_error(
            false,
            false,
            adapter_count,
            output_count,
            "noDxgiAdapters",
            "DXGI did not report any adapters".to_string(),
        ));
    }
    if output_count == 0 {
        return Err(capture_probe_error(
            true,
            false,
            adapter_count,
            output_count,
            "noDxgiOutputs",
            "DXGI did not report any outputs for hardware adapters".to_string(),
        ));
    }

    Err(capture_probe_error(
        true,
        false,
        adapter_count,
        output_count,
        "desktopDuplicationUnavailable",
        if last_detail.is_empty() {
            "Desktop Duplication probe failed without a detailed DXGI error".to_string()
        } else {
            last_detail
        },
    ))
}

#[cfg(target_os = "windows")]
fn capture_probe_error(
    supports_d3d11: bool,
    supports_desktop_duplication: bool,
    adapter_count: u32,
    output_count: u32,
    reason: &'static str,
    detail: String,
) -> LiveDesktopCaptureProbe {
    LiveDesktopCaptureProbe {
        supports_d3d11,
        supports_desktop_duplication,
        frame_probe: empty_frame_probe(reason, "Desktop frame texture was not acquired"),
        adapter_count,
        output_count,
        reason,
        detail,
    }
}

#[cfg(target_os = "windows")]
fn empty_frame_probe(reason: &'static str, detail: &str) -> LiveDesktopFrameProbe {
    LiveDesktopFrameProbe {
        supports_frame_texture: false,
        width: 0,
        height: 0,
        format: 0,
        reason,
        detail: detail.to_string(),
    }
}

#[cfg(not(target_os = "windows"))]
fn empty_frame_probe(reason: &'static str, detail: &str) -> LiveDesktopFrameProbe {
    LiveDesktopFrameProbe {
        supports_frame_texture: false,
        width: 0,
        height: 0,
        format: 0,
        reason,
        detail: detail.to_string(),
    }
}

#[cfg(target_os = "windows")]
unsafe fn acquire_duplication_frame_texture(
    duplication: &IDXGIOutputDuplication,
) -> LiveDesktopFrameProbe {
    let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
    let mut resource: Option<IDXGIResource> = None;
    let acquire_result =
        unsafe { duplication.AcquireNextFrame(16, &mut frame_info, &mut resource) };
    match acquire_result {
        Ok(()) => {}
        Err(error) if error.code() == DXGI_ERROR_WAIT_TIMEOUT => {
            return empty_frame_probe(
                "noFrameWithinTimeout",
                "Desktop Duplication did not produce a frame within 16 ms",
            );
        }
        Err(error) => {
            return empty_frame_probe(
                "frameAcquireFailed",
                &format!("AcquireNextFrame failed: {error}"),
            );
        }
    }

    let frame_probe = match resource {
        Some(resource) => match resource.cast::<ID3D11Texture2D>() {
            Ok(texture) => {
                let mut desc = D3D11_TEXTURE2D_DESC::default();
                unsafe { texture.GetDesc(&mut desc) };
                LiveDesktopFrameProbe {
                    supports_frame_texture: true,
                    width: desc.Width,
                    height: desc.Height,
                    format: desc.Format.0,
                    reason: "available",
                    detail: format!(
                        "Acquired GPU desktop frame texture {}x{} format {}",
                        desc.Width, desc.Height, desc.Format.0
                    ),
                }
            }
            Err(error) => empty_frame_probe(
                "frameTextureUnavailable",
                &format!("Desktop frame resource is not an ID3D11Texture2D: {error}"),
            ),
        },
        None => empty_frame_probe(
            "frameResourceMissing",
            "AcquireNextFrame succeeded without a desktop resource",
        ),
    };

    if let Err(error) = unsafe { duplication.ReleaseFrame() } {
        return empty_frame_probe(
            "frameReleaseFailed",
            &format!("ReleaseFrame failed after acquisition: {error}"),
        );
    }

    frame_probe
}

#[cfg(target_os = "windows")]
fn current_platform() -> &'static str {
    "windows"
}

#[cfg(not(target_os = "windows"))]
fn current_platform() -> &'static str {
    std::env::consts::OS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn capture_probe(
        supports_d3d11: bool,
        supports_desktop_duplication: bool,
        reason: &'static str,
    ) -> LiveDesktopCaptureProbe {
        LiveDesktopCaptureProbe {
            supports_d3d11,
            supports_desktop_duplication,
            frame_probe: LiveDesktopFrameProbe {
                supports_frame_texture: supports_desktop_duplication,
                width: if supports_desktop_duplication {
                    1920
                } else {
                    0
                },
                height: if supports_desktop_duplication {
                    1080
                } else {
                    0
                },
                format: if supports_desktop_duplication { 87 } else { 0 },
                reason,
                detail: reason.to_string(),
            },
            adapter_count: if supports_d3d11 { 1 } else { 0 },
            output_count: if supports_desktop_duplication { 1 } else { 0 },
            reason,
            detail: reason.to_string(),
        }
    }

    #[test]
    fn capture_probe_success_waits_for_native_renderer_before_enabling_source() {
        let support = make_live_desktop_background_support(
            "windows",
            capture_probe(true, true, "available"),
            LiveDesktopRendererProbe::native_renderer_unimplemented("renderer pending"),
        );

        assert!(!support.supports_live_desktop_background);
        assert!(!support.supports_live_desktop_background_effects);
        assert_eq!(support.reason, "nativeRendererNotImplemented");
        assert!(support.capture_probe.supports_d3d11);
        assert!(support.capture_probe.supports_desktop_duplication);
        assert!(support.capture_probe.frame_probe.supports_frame_texture);
        assert!(support.renderer_probe.supports_direct_composition);
        assert!(!support.renderer_probe.supports_native_renderer);
    }

    #[test]
    fn capture_and_renderer_success_enable_live_desktop_support() {
        let support = make_live_desktop_background_support(
            "windows",
            capture_probe(true, true, "available"),
            LiveDesktopRendererProbe::native_renderer_available_for_probe(true, "renderer ready"),
        );

        assert!(support.supports_live_desktop_background);
        assert!(support.supports_live_desktop_background_effects);
        assert_eq!(support.reason, "available");
        assert!(support.renderer_probe.supports_native_renderer);
        assert!(support.renderer_probe.supports_native_effects);
    }

    #[test]
    fn renderer_without_effects_still_enables_live_desktop_source() {
        let support = make_live_desktop_background_support(
            "windows",
            capture_probe(true, true, "available"),
            LiveDesktopRendererProbe::native_renderer_available_for_probe(
                false,
                "renderer ready without blur",
            ),
        );

        assert!(support.supports_live_desktop_background);
        assert!(!support.supports_live_desktop_background_effects);
        assert_eq!(support.reason, "available");
        assert!(support.detail.contains("without blur"));
    }

    #[test]
    fn capture_probe_failure_surfaces_probe_reason() {
        let support = make_live_desktop_background_support(
            "windows",
            capture_probe(false, false, "dxgiUnavailable"),
            LiveDesktopRendererProbe::native_renderer_unimplemented("renderer pending"),
        );

        assert!(!support.supports_live_desktop_background);
        assert_eq!(support.reason, "dxgiUnavailable");
        assert!(!support.capture_probe.supports_d3d11);
        assert!(!support.capture_probe.supports_desktop_duplication);
    }

    #[test]
    fn runtime_starts_stopped() {
        let runtime = LiveDesktopRuntime::default();
        let status = runtime.status();

        assert_eq!(status.phase, "stopped");
        assert!(!status.active);
        assert_eq!(status.generation, 0);
        assert_eq!(status.reason, "stopped");
    }

    #[test]
    fn live_desktop_hex_color_parser_reads_normalized_rgb() {
        let color = parse_live_desktop_hex_color("#336699");

        assert!((color[0] - 0.2).abs() < 0.001);
        assert!((color[1] - 0.4).abs() < 0.001);
        assert!((color[2] - 0.6).abs() < 0.001);

        let fallback = parse_live_desktop_hex_color("invalid");
        assert!((fallback[0] - 28.0 / 255.0).abs() < 0.001);
    }

    #[test]
    fn live_desktop_blur_standard_deviation_only_applies_to_blur_effects() {
        let mut config = LiveDesktopRuntimeConfig::default();
        assert_eq!(resolve_live_desktop_blur_standard_deviation(&config), 0.0);

        config.effect = LiveDesktopBackgroundEffect::Blur;
        config.blur_strength = 50;
        assert!((resolve_live_desktop_blur_standard_deviation(&config) - 16.0).abs() < 0.001);

        config.blur_strength = 200;
        assert!((resolve_live_desktop_blur_standard_deviation(&config) - 30.0).abs() < 0.001);

        config.effect = LiveDesktopBackgroundEffect::AcrylicWebgl;
        config.blur_strength = 100;
        assert!((resolve_live_desktop_blur_standard_deviation(&config) - 30.0).abs() < 0.001);

        config.effect = LiveDesktopBackgroundEffect::None;
        assert_eq!(resolve_live_desktop_blur_standard_deviation(&config), 0.0);
    }

    #[test]
    fn live_desktop_color_matrix_matches_effect_family() {
        let mut config = LiveDesktopRuntimeConfig::default();
        let dimmed = resolve_live_desktop_color_matrix(&config);
        assert!((dimmed[0][0] - 0.72).abs() < 0.001);
        assert!((dimmed[4][0] - 28.0 / 255.0 * 0.28).abs() < 0.001);

        config.effect = LiveDesktopBackgroundEffect::Blur;
        assert_eq!(
            resolve_live_desktop_color_matrix(&config),
            live_desktop_identity_color_matrix()
        );

        config.effect = LiveDesktopBackgroundEffect::AcrylicWebgl;
        let acrylic = resolve_live_desktop_color_matrix(&config);
        assert!((acrylic[0][0] - 0.734672).abs() < 0.001);
        assert!((acrylic[1][0] + 0.159664).abs() < 0.001);
        assert!((acrylic[4][0] - 0.095059).abs() < 0.001);
        assert_eq!(acrylic[3][3], 1.0);
    }

    #[test]
    fn workerw_window_classifier_marks_capture_candidates() {
        let full_screen_rect = LiveDesktopWindowRect {
            width: 2560,
            height: 1440,
            ..LiveDesktopWindowRect::default()
        };

        let (workerw_role, workerw_reason) = classify_live_desktop_window(
            "WorkerW",
            "",
            "explorer.exe",
            true,
            &full_screen_rect,
            "",
        );
        assert_eq!(workerw_role, "workerw");
        assert_eq!(workerw_reason, "workerwLayer");

        let (wallpaper_role, wallpaper_reason) = classify_live_desktop_window(
            "Chrome_WidgetWin_0",
            "",
            "wallpaper64.exe",
            true,
            &full_screen_rect,
            "WorkerW",
        );
        assert_eq!(wallpaper_role, "desktopChild");
        assert_eq!(wallpaper_reason, "wallpaperProcessOrTitle");

        let (popup_role, popup_reason) = classify_live_desktop_window(
            "Chrome_WidgetWin_1",
            "Wallpaper Pop-out",
            "wallpaper64.exe",
            true,
            &full_screen_rect,
            "",
        );
        assert_eq!(popup_role, "wallpaperPopup");
        assert_eq!(popup_reason, "wallpaperPopup");

        let (defview_role, defview_reason) = classify_live_desktop_window(
            "SHELLDLL_DefView",
            "",
            "explorer.exe",
            true,
            &full_screen_rect,
            "WorkerW",
        );
        assert_eq!(defview_role, "shellDefView");
        assert!(defview_reason.is_empty());
    }

    #[test]
    fn workerw_window_enumeration_roots_are_limited_to_desktop_layers() {
        assert!(is_live_desktop_root_class("Progman"));
        assert!(is_live_desktop_root_class("WorkerW"));
        assert!(is_live_desktop_root_class("workerw"));
        assert!(!is_live_desktop_root_class("Chrome_WidgetWin_1"));
        assert!(!is_live_desktop_root_class("CabinetWClass"));
    }

    #[test]
    fn workerw_wgc_targets_try_child_then_parent_then_roots() {
        fn info(hwnd: &str, parent_hwnd: &str, role: &str, reason: &str) -> LiveDesktopWindowInfo {
            LiveDesktopWindowInfo {
                hwnd: hwnd.to_string(),
                parent_hwnd: parent_hwnd.to_string(),
                root_hwnd: parent_hwnd.to_string(),
                role: role.to_string(),
                candidate_reason: reason.to_string(),
                visible: true,
                ..LiveDesktopWindowInfo::default()
            }
        }

        let wallpaper = info("0x300", "0x200", "desktopChild", "wallpaperProcessOrTitle");
        let workerw = info("0x200", "", "workerw", "workerwLayer");
        let progman = info("0x100", "", "progman", "");
        let diagnostics = LiveDesktopWindowDiagnostics {
            platform: "windows",
            available: true,
            reason: "available",
            detail: String::new(),
            window_count: 3,
            candidate_count: 2,
            windows: vec![progman, workerw.clone(), wallpaper.clone()],
            candidates: vec![wallpaper, workerw],
        };

        let targets = collect_live_desktop_wgc_targets(&diagnostics);
        let hwnds: Vec<&str> = targets.iter().map(|info| info.hwnd.as_str()).collect();
        assert_eq!(hwnds, vec!["0x300", "0x200", "0x100"]);
    }

    #[test]
    fn wallpaper_engine_popup_wgc_targets_prefer_popup_content_window() {
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
        launchpad_popup.title = "LaunchPad::LiveDesktop::display0::1920x1080".to_string();
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
            Some("LaunchPad::LiveDesktop::display0::1920x1080"),
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

    #[test]
    fn workerw_wgc_targets_reject_desktop_shell_roles() {
        let mut desktop_child = LiveDesktopWindowInfo {
            role: "desktopChild".to_string(),
            ..LiveDesktopWindowInfo::default()
        };
        assert!(is_acceptable_live_desktop_wgc_target(&desktop_child));

        desktop_child.role = "workerw".to_string();
        assert!(is_acceptable_live_desktop_wgc_target(&desktop_child));

        desktop_child.role = "progman".to_string();
        assert!(!is_acceptable_live_desktop_wgc_target(&desktop_child));

        desktop_child.role = "shellDefView".to_string();
        assert!(!is_acceptable_live_desktop_wgc_target(&desktop_child));

        desktop_child.role = "desktopListView".to_string();
        assert!(!is_acceptable_live_desktop_wgc_target(&desktop_child));
    }

    #[test]
    fn dwm_shared_surface_targets_try_wallpaper_parent_then_roots() {
        fn info(hwnd: &str, parent_hwnd: &str, role: &str, reason: &str) -> LiveDesktopWindowInfo {
            LiveDesktopWindowInfo {
                hwnd: hwnd.to_string(),
                parent_hwnd: parent_hwnd.to_string(),
                root_hwnd: parent_hwnd.to_string(),
                role: role.to_string(),
                candidate_reason: reason.to_string(),
                visible: true,
                ..LiveDesktopWindowInfo::default()
            }
        }

        let wallpaper = info("0x300", "0x200", "desktopChild", "wallpaperProcessOrTitle");
        let workerw = info("0x200", "", "workerw", "workerwLayer");
        let progman = info("0x100", "", "progman", "");
        let diagnostics = LiveDesktopWindowDiagnostics {
            platform: "windows",
            available: true,
            reason: "available",
            detail: String::new(),
            window_count: 3,
            candidate_count: 2,
            windows: vec![progman, workerw.clone(), wallpaper.clone()],
            candidates: vec![wallpaper, workerw],
        };

        let targets = collect_live_desktop_dwm_shared_surface_targets(&diagnostics);
        let hwnds: Vec<&str> = targets.iter().map(|info| info.hwnd.as_str()).collect();
        assert_eq!(hwnds, vec!["0x300", "0x200", "0x100"]);
    }

    #[test]
    fn dwm_shared_surface_rejects_shell_targets_and_marks_no_redirection() {
        let wallpaper = LiveDesktopWindowInfo {
            role: "desktopChild".to_string(),
            ex_style: "0x8280000".to_string(),
            ..LiveDesktopWindowInfo::default()
        };
        assert!(is_acceptable_live_desktop_dwm_shared_surface_target(
            &wallpaper
        ));
        assert!(live_desktop_window_has_no_redirection_bitmap(&wallpaper));

        let progman = LiveDesktopWindowInfo {
            role: "progman".to_string(),
            ..LiveDesktopWindowInfo::default()
        };
        assert!(!is_acceptable_live_desktop_dwm_shared_surface_target(
            &progman
        ));
        assert!(!live_desktop_window_has_no_redirection_bitmap(&progman));
    }

    #[test]
    fn live_desktop_visual_placement_covers_display_without_distortion() {
        let same_ratio = resolve_live_desktop_visual_placement(2560, 1440, 1280, 720);
        assert!((same_ratio.scale - 0.5).abs() < f32::EPSILON);
        assert_eq!(same_ratio.offset_x, 0.0);
        assert_eq!(same_ratio.offset_y, 0.0);

        let taller_display = resolve_live_desktop_visual_placement(2560, 1440, 2880, 1800);
        assert!((taller_display.scale - 1.25).abs() < f32::EPSILON);
        assert_eq!(taller_display.offset_y, 0.0);
        assert!(taller_display.offset_x < 0.0);
    }

    #[test]
    fn live_desktop_mouse_relay_maps_display_to_capture_source() {
        let output_rect = LiveDesktopWindowRect {
            left: 0,
            top: 0,
            right: 2560,
            bottom: 1440,
            width: 2560,
            height: 1440,
        };

        assert_eq!(
            resolve_live_desktop_mouse_relay_position(0, 0, &output_rect, 2560, 1368),
            Some(LiveDesktopMouseRelayPosition { x: 0, y: 0 })
        );
        assert_eq!(
            resolve_live_desktop_mouse_relay_position(2559, 1439, &output_rect, 2560, 1368),
            Some(LiveDesktopMouseRelayPosition { x: 2559, y: 1367 })
        );
        assert_eq!(
            resolve_live_desktop_mouse_relay_position(-200, 2000, &output_rect, 2560, 1368),
            Some(LiveDesktopMouseRelayPosition { x: 0, y: 1367 })
        );
    }

    #[test]
    fn live_desktop_mouse_relay_handles_non_zero_display_origin() {
        let output_rect = LiveDesktopWindowRect {
            left: -1920,
            top: 120,
            right: 0,
            bottom: 1200,
            width: 1920,
            height: 1080,
        };

        assert_eq!(
            resolve_live_desktop_mouse_relay_position(-1920, 120, &output_rect, 960, 540),
            Some(LiveDesktopMouseRelayPosition { x: 0, y: 0 })
        );
        assert_eq!(
            resolve_live_desktop_mouse_relay_position(-1, 1199, &output_rect, 960, 540),
            Some(LiveDesktopMouseRelayPosition { x: 959, y: 539 })
        );
    }

    #[test]
    fn runtime_start_surfaces_capture_failure() {
        let mut runtime = LiveDesktopRuntime::default();
        let status = runtime.start_with_probes(
            capture_probe(false, false, "dxgiUnavailable"),
            LiveDesktopRendererProbe::available(),
        );

        assert_eq!(status.phase, "failed");
        assert!(!status.active);
        assert_eq!(status.generation, 1);
        assert_eq!(status.reason, "dxgiUnavailable");
    }

    #[test]
    fn runtime_start_allows_capture_probe_without_immediate_frame() {
        let mut runtime = LiveDesktopRuntime::default();
        let mut capture = capture_probe(true, true, "available");
        capture.frame_probe = empty_frame_probe(
            "noFrameWithinTimeout",
            "Desktop Duplication did not produce a frame within 16 ms",
        );
        let status = runtime.start_with_probes(capture, LiveDesktopRendererProbe::available());

        assert_eq!(status.phase, "running");
        assert!(status.active);
        assert_eq!(status.reason, "running");
        assert!(status.detail.contains("frame pump diagnostics"));
    }

    #[test]
    fn runtime_start_waits_for_native_renderer_after_capture_ready() {
        let mut runtime = LiveDesktopRuntime::default();
        let status = runtime.start_with_probes(
            capture_probe(true, true, "available"),
            LiveDesktopRendererProbe::native_renderer_unimplemented("renderer pending"),
        );

        assert_eq!(status.phase, "failed");
        assert!(!status.active);
        assert_eq!(status.generation, 1);
        assert_eq!(status.reason, "nativeRendererNotImplemented");
        assert!(runtime.renderer_session.is_none());

        let stopped = runtime.stop();
        assert_eq!(stopped.phase, "stopped");
        assert_eq!(stopped.generation, 2);
    }

    #[test]
    fn runtime_drops_renderer_session_when_native_pipeline_is_not_ready() {
        let mut runtime = LiveDesktopRuntime::default();
        let status =
            runtime.start_with_renderer_session(capture_probe(true, true, "available"), || {
                Ok(LiveDesktopRendererSession {
                    renderer_probe:
                        LiveDesktopRendererProbe::native_renderer_unimplemented_for_window(
                            "target ready",
                        ),
                    diagnostics: Arc::new(Mutex::new(LiveDesktopRuntimeDiagnostics::default())),
                    #[cfg(target_os = "windows")]
                    stop_sender: None,
                    #[cfg(target_os = "windows")]
                    command_sender: None,
                    #[cfg(target_os = "windows")]
                    exit_receiver: None,
                    #[cfg(target_os = "windows")]
                    worker: None,
                })
            });

        assert_eq!(status.phase, "failed");
        assert_eq!(status.reason, "nativeRendererNotImplemented");
        assert!(runtime.renderer_session.is_none());
    }

    #[test]
    fn runtime_can_transition_to_running_when_renderer_is_ready() {
        let mut runtime = LiveDesktopRuntime::default();
        let status = runtime.start_with_probes(
            capture_probe(true, true, "available"),
            LiveDesktopRendererProbe::available(),
        );

        assert_eq!(status.phase, "running");
        assert!(status.active);
        assert_eq!(status.generation, 1);
        assert_eq!(status.reason, "running");

        let duplicate_start = runtime.start_with_probes(
            capture_probe(true, true, "available"),
            LiveDesktopRendererProbe::available(),
        );
        assert_eq!(duplicate_start.generation, 1);
        assert_eq!(duplicate_start.phase, "running");

        let stopped = runtime.stop();
        assert_eq!(stopped.phase, "stopped");
        assert!(!stopped.active);
        assert_eq!(stopped.generation, 2);
    }
}
