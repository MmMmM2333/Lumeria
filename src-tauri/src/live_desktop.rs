use serde::{Deserialize, Serialize};

use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

#[cfg(target_os = "windows")]
use std::{
    cell::RefCell,
    ops::ControlFlow,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

#[cfg(target_os = "windows")]
use windows::{
    core::{factory, s, IInspectable, Interface, BOOL, PCSTR},
    Foundation::TypedEventHandler,
    Graphics::{
        Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession},
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
    },
    Win32::{
        Foundation::{HMODULE, HWND, LPARAM, POINT, WPARAM},
        Graphics::{
            Direct2D::Common::D2D1_BORDER_MODE_HARD,
            Direct3D::{
                Fxc::{D3DCompile, D3DCOMPILE_ENABLE_STRICTNESS, D3DCOMPILE_OPTIMIZATION_LEVEL1},
                ID3DBlob, ID3DInclude, D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL,
                D3D_FEATURE_LEVEL_10_0, D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_11_0,
                D3D_FEATURE_LEVEL_11_1, D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST,
            },
            Direct3D11::{
                D3D11CreateDevice, ID3D11Buffer, ID3D11ClassLinkage, ID3D11DepthStencilView,
                ID3D11Device, ID3D11DeviceContext, ID3D11InputLayout, ID3D11PixelShader,
                ID3D11RenderTargetView, ID3D11Resource, ID3D11SamplerState,
                ID3D11ShaderResourceView, ID3D11Texture2D, ID3D11VertexShader,
                D3D11_BIND_CONSTANT_BUFFER, D3D11_BIND_FLAG, D3D11_BIND_RENDER_TARGET,
                D3D11_BIND_SHADER_RESOURCE, D3D11_BIND_VERTEX_BUFFER, D3D11_BOX, D3D11_BUFFER_DESC,
                D3D11_COMPARISON_NEVER, D3D11_CPU_ACCESS_FLAG, D3D11_CPU_ACCESS_READ,
                D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_FILTER_MIN_MAG_MIP_LINEAR,
                D3D11_FILTER_MIN_MAG_MIP_POINT, D3D11_FLOAT32_MAX, D3D11_INPUT_ELEMENT_DESC,
                D3D11_INPUT_PER_VERTEX_DATA, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ,
                D3D11_SAMPLER_DESC, D3D11_SDK_VERSION, D3D11_SUBRESOURCE_DATA,
                D3D11_TEXTURE2D_DESC, D3D11_TEXTURE_ADDRESS_CLAMP, D3D11_USAGE,
                D3D11_USAGE_DEFAULT, D3D11_USAGE_STAGING, D3D11_VIEWPORT,
            },
            DirectComposition::{
                DCompositionCreateDevice, DCompositionCreateDevice3,
                IDCompositionColorMatrixEffect, IDCompositionDesktopDevice, IDCompositionDevice,
                IDCompositionDevice3, IDCompositionGaussianBlurEffect, IDCompositionScaleTransform,
                IDCompositionTarget, IDCompositionVisual, IDCompositionVisual3,
            },
            Dwm::DwmFlush,
            Dxgi::{
                Common::{
                    DXGI_ALPHA_MODE_IGNORE, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_R32G32_FLOAT,
                    DXGI_SAMPLE_DESC,
                },
                CreateDXGIFactory1, IDXGIAdapter1, IDXGIDevice, IDXGIFactory1, IDXGIFactory2,
                IDXGIOutput, IDXGISwapChain1, DXGI_ADAPTER_FLAG3_SOFTWARE, DXGI_ERROR_NOT_FOUND,
                DXGI_PRESENT, DXGI_PRESENT_PARAMETERS, DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1,
                DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL, DXGI_USAGE_RENDER_TARGET_OUTPUT,
            },
            Gdi::{MonitorFromWindow, HMONITOR, MONITOR_DEFAULTTONEAREST},
        },
        System::{
            Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED},
            WinRT::{
                Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
                Graphics::Capture::IGraphicsCaptureItemInterop,
            },
        },
        UI::WindowsAndMessaging::{
            GetCursorPos, PostMessageW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GWL_STYLE,
            HWND_BOTTOM, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOSENDCHANGING,
            SWP_NOZORDER, WM_MOUSEMOVE, WS_CAPTION, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
            WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_SYSMENU, WS_THICKFRAME,
        },
    },
};

mod composition;
mod config;
mod constants;
mod diagnostics;
mod effects;
mod test_pattern;
mod wallpaper_engine;
mod window_diagnostics;

pub(crate) use composition::*;
pub(crate) use config::*;
pub(crate) use constants::*;
pub(crate) use diagnostics::*;
pub(crate) use effects::*;

#[cfg(target_os = "windows")]
use test_pattern::{
    draw_live_desktop_test_pattern_to_composition_surface, LiveDesktopTestPatternState,
};
use wallpaper_engine::{
    collect_wallpaper_engine_mouse_relay_targets, collect_wallpaper_engine_popup_wgc_targets,
    format_wallpaper_engine_popup_runtime_detail, wallpaper_engine_popup_root_for_target,
    wallpaper_engine_popup_target_matches_window_name,
};
use window_diagnostics::{format_live_desktop_window_long, live_desktop_window_diagnostics};

#[cfg(test)]
use window_diagnostics::{classify_live_desktop_window, is_live_desktop_root_class};

#[cfg(target_os = "windows")]
use wallpaper_engine::{
    cleanup_wallpaper_engine_popup_after_failed_capture, close_wallpaper_engine_named_popup,
    create_wallpaper_engine_popup_plan, ensure_wallpaper_engine_named_popup,
    LiveDesktopWallpaperEnginePopupCloseCommand,
};

#[cfg(target_os = "windows")]
use window_diagnostics::{
    format_live_desktop_window_handle, probe_windows_live_desktop_windows,
    read_live_desktop_window_client_size, read_live_desktop_window_long,
};

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
    prerequisite_probe: LiveDesktopPrerequisiteProbe,
    renderer_probe: LiveDesktopRendererProbe,
}

#[derive(Debug)]
pub(crate) struct LiveDesktopRuntime {
    status: LiveDesktopRuntimeStatus,
    renderer_session: Option<LiveDesktopRendererSession>,
    config: LiveDesktopRuntimeConfig,
    #[cfg(target_os = "windows")]
    abandoned_renderer_workers: Vec<LiveDesktopAbandonedRendererWorker>,
    reaped_abandoned_renderer_workers: u64,
    last_abandoned_renderer_reason: String,
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
struct LiveDesktopAbandonedRendererWorker {
    worker: Option<thread::JoinHandle<()>>,
    reason: &'static str,
    detail: String,
    generation: u64,
}

#[cfg(target_os = "windows")]
impl LiveDesktopAbandonedRendererWorker {
    fn new(worker: thread::JoinHandle<()>, reason: &'static str, detail: String) -> Self {
        Self {
            worker: Some(worker),
            reason,
            detail,
            generation: 0,
        }
    }
}

#[cfg(target_os = "windows")]
impl std::fmt::Debug for LiveDesktopAbandonedRendererWorker {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("LiveDesktopAbandonedRendererWorker")
            .field("reason", &self.reason)
            .field("detail", &self.detail)
            .field("generation", &self.generation)
            .field(
                "is_finished",
                &self.worker.as_ref().map(|worker| worker.is_finished()),
            )
            .finish()
    }
}

#[derive(Debug)]
struct LiveDesktopRendererStartupFailure {
    probe: LiveDesktopRendererProbe,
    #[cfg(target_os = "windows")]
    abandoned_worker: Option<LiveDesktopAbandonedRendererWorker>,
}

#[cfg(target_os = "windows")]
struct LiveDesktopRendererStartupReady {
    renderer_probe: LiveDesktopRendererProbe,
    exit_receiver: mpsc::Receiver<()>,
    worker: thread::JoinHandle<()>,
}

#[cfg(target_os = "windows")]
enum LiveDesktopRendererStartupTimeoutCleanup {
    Joined,
    Abandoned(thread::JoinHandle<()>),
}

#[cfg(target_os = "windows")]
impl LiveDesktopRendererStartupTimeoutCleanup {
    fn detail_label(&self) -> &'static str {
        match self {
            Self::Joined => "joined",
            Self::Abandoned(_) => "abandonedWorker",
        }
    }
}

#[cfg(target_os = "windows")]
#[derive(Clone, Debug)]
struct LiveDesktopStartupCancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl From<LiveDesktopRendererProbe> for LiveDesktopRendererStartupFailure {
    fn from(probe: LiveDesktopRendererProbe) -> Self {
        Self {
            probe,
            #[cfg(target_os = "windows")]
            abandoned_worker: None,
        }
    }
}

#[cfg(target_os = "windows")]
impl LiveDesktopStartupCancellationToken {
    fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

#[cfg(target_os = "windows")]
#[derive(Debug)]
enum LiveDesktopRendererCommand {
    Configure(Box<LiveDesktopRuntimeConfig>),
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
    test_pattern: LiveDesktopTestPatternState,
    visible: bool,
    consecutive_frame_errors: u32,
    source_width: u32,
    source_height: u32,
    _com: ComApartment,
    _d3d_device: ID3D11Device,
    _d3d_context: ID3D11DeviceContext,
    window_capture: Option<LiveDesktopWindowCapture>,
    _composition_device: LiveDesktopCompositionDevice,
    _blur_effect: Option<IDCompositionGaussianBlurEffect>,
    _color_matrix_effect: Option<IDCompositionColorMatrixEffect>,
    _target: IDCompositionTarget,
    host_window: LiveDesktopCompositionHost,
    _root_visual: IDCompositionVisual,
    _root_visual3: Option<IDCompositionVisual3>,
    _scale_transform: IDCompositionScaleTransform,
    _swap_chain: LiveDesktopCompositionSwapChain,
    _shader_pipeline: Option<LiveDesktopShaderPipeline>,
}

#[cfg(target_os = "windows")]
#[derive(Debug, PartialEq, Eq)]
enum LiveDesktopFramePumpAction {
    PumpFrame,
    WaitForVisibility,
    Stop,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FrameOutcome {
    Presented,
    BlankSkipped,
    TimedOut,
    NoSource,
}

#[cfg(target_os = "windows")]
fn live_desktop_frame_pump_visibility_action(
    visible: bool,
    stop_receiver: &mpsc::Receiver<()>,
    timeout: Duration,
) -> LiveDesktopFramePumpAction {
    if visible {
        return LiveDesktopFramePumpAction::PumpFrame;
    }

    match stop_receiver.recv_timeout(timeout) {
        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => LiveDesktopFramePumpAction::Stop,
        Err(mpsc::RecvTimeoutError::Timeout) => LiveDesktopFramePumpAction::WaitForVisibility,
    }
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
    frame_crop: Option<LiveDesktopFrameCrop>,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    _item: GraphicsCaptureItem,
    frame_pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    frame_arrived_receiver: Option<mpsc::Receiver<()>>,
    frame_arrived_token: Option<i64>,
    _frame_arrived_handler: Option<TypedEventHandler<Direct3D11CaptureFramePool, IInspectable>>,
}

#[cfg(target_os = "windows")]
struct LiveDesktopMouseRelay {
    target_hwnds: Vec<HWND>,
    output_rect: LiveDesktopWindowRect,
    source_left: u32,
    source_top: u32,
    source_width: u32,
    source_height: u32,
    last_position: Option<LiveDesktopMouseRelayPosition>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct LiveDesktopFrameCrop {
    left: u32,
    top: u32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct LiveDesktopMouseRelayPosition {
    x: i32,
    y: i32,
}

#[cfg(target_os = "windows")]
impl LiveDesktopWindowCapture {
    fn record_teardown_error(&self, detail: String) {
        eprintln!("{detail}");
        update_live_desktop_diagnostics(&self.diagnostics, |diagnostics| {
            push_live_desktop_recent_error(diagnostics, &detail);
        });
    }
}

#[cfg(target_os = "windows")]
impl Drop for LiveDesktopWindowCapture {
    fn drop(&mut self) {
        if let Some(token) = self.frame_arrived_token.take() {
            if let Err(error) = self.frame_pool.RemoveFrameArrived(token) {
                self.record_teardown_error(format!(
                    "Direct3D11CaptureFramePool::RemoveFrameArrived during WGC teardown failed: {error}"
                ));
            }
        }
        self.frame_arrived_receiver.take();

        if let Err(error) = self.session.Close() {
            self.record_teardown_error(format!(
                "GraphicsCaptureSession::Close during WGC teardown failed: {error}"
            ));
        }
        if let Err(error) = self.frame_pool.Close() {
            self.record_teardown_error(format!(
                "Direct3D11CaptureFramePool::Close during WGC teardown failed: {error}"
            ));
        }
        if let Some(command) = self.popup_close_command.as_ref() {
            if let Err(error) = close_wallpaper_engine_named_popup(command) {
                self.record_teardown_error(format!(
                    "Wallpaper Engine popup close during WGC teardown failed: {error}"
                ));
            }
        }
        if let Some(state) = self.popup_restore_state.as_ref() {
            if let Err(error) = unsafe { restore_wallpaper_engine_popup_after_capture(state) } {
                self.record_teardown_error(format!(
                    "Wallpaper Engine popup restore during WGC teardown failed: {error}"
                ));
            }
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
enum LiveDesktopRendererStartupMessage {
    Progress(String),
    Ready(LiveDesktopRendererProbe),
    Failed(LiveDesktopRendererProbe),
}

#[cfg(target_os = "windows")]
struct LiveDesktopOutputContext {
    output_index: u32,
    output_width: u32,
    output_height: u32,
    output_rect: LiveDesktopWindowRect,
    output_name: String,
}

#[cfg(target_os = "windows")]
struct LiveDesktopD3DDevice {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
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

impl Default for LiveDesktopRuntime {
    fn default() -> Self {
        Self {
            status: LiveDesktopRuntimeStatus::stopped(0),
            renderer_session: None,
            config: LiveDesktopRuntimeConfig::default(),
            #[cfg(target_os = "windows")]
            abandoned_renderer_workers: Vec::new(),
            reaped_abandoned_renderer_workers: 0,
            last_abandoned_renderer_reason: String::new(),
        }
    }
}

impl LiveDesktopRuntime {
    pub(crate) fn active_background_support(&mut self) -> Option<LiveDesktopBackgroundSupport> {
        self.reap_abandoned_renderer_workers();
        self.renderer_session
            .as_ref()
            .map(|session| active_live_desktop_background_support(session.renderer_probe.clone()))
    }

    pub(crate) fn status(&mut self) -> LiveDesktopRuntimeStatus {
        self.reap_abandoned_renderer_workers();
        let mut status = self.status.clone();
        let mut diagnostics = status.diagnostics.clone();
        if let Some(session) = self.renderer_session.as_ref() {
            diagnostics = session.diagnostics();
        }
        self.apply_abandoned_renderer_diagnostics(&mut diagnostics);
        if self.renderer_session.is_some() || diagnostics.has_abandoned_renderer_activity() {
            status.detail = append_live_desktop_runtime_diagnostics(&status.detail, &diagnostics);
        }
        status.diagnostics = diagnostics;
        status.window_diagnostics = live_desktop_window_diagnostics();
        status
    }

    pub(crate) fn start_for_window(
        &mut self,
        window_handle: LiveDesktopWindowHandle,
    ) -> LiveDesktopRuntimeStatus {
        let config = self.config.clone();
        self.start_with_renderer_session(probe_live_desktop_prerequisites(), || {
            LiveDesktopRendererSession::start_for_window(window_handle, config)
        })
    }

    pub(crate) fn configure(
        &mut self,
        config: LiveDesktopRuntimeConfig,
    ) -> LiveDesktopRuntimeStatus {
        self.reap_abandoned_renderer_workers();
        self.config = config.clone();
        if let Some(session) = self.renderer_session.as_ref() {
            session.configure(config);
        }
        self.status()
    }

    pub(crate) fn set_visible(&mut self, visible: bool) -> LiveDesktopRuntimeStatus {
        self.reap_abandoned_renderer_workers();
        if let Some(session) = self.renderer_session.as_ref() {
            session.set_visible(visible);
        }
        self.status()
    }

    pub(crate) fn stop(&mut self) -> LiveDesktopRuntimeStatus {
        #[cfg(target_os = "windows")]
        let cleanup_timeout = Duration::from_millis(LIVE_DESKTOP_RENDERER_STOP_JOIN_TIMEOUT_MS);
        #[cfg(not(target_os = "windows"))]
        let cleanup_timeout = std::time::Duration::ZERO;
        self.stop_with_timeout(cleanup_timeout)
    }

    fn stop_with_timeout(
        &mut self,
        cleanup_timeout: std::time::Duration,
    ) -> LiveDesktopRuntimeStatus {
        self.reap_abandoned_renderer_workers();
        if self.status.is_stopped() {
            return self.status();
        }
        let generation = self.next_generation();
        self.stop_renderer_session_for_generation(generation, cleanup_timeout);
        self.status = LiveDesktopRuntimeStatus::stopped(generation);
        self.status()
    }

    fn next_generation(&self) -> u64 {
        self.status.generation + 1
    }

    fn stop_renderer_session_for_generation(
        &mut self,
        generation: u64,
        cleanup_timeout: std::time::Duration,
    ) {
        #[cfg(not(target_os = "windows"))]
        let _ = cleanup_timeout;
        let Some(mut session) = self.renderer_session.take() else {
            return;
        };
        #[cfg(target_os = "windows")]
        if let Some(worker) = session.stop_and_maybe_abandon(cleanup_timeout) {
            self.register_abandoned_renderer_worker(generation, worker);
        }
    }

    #[cfg(test)]
    fn start_with_probes(
        &mut self,
        prerequisite_probe: LiveDesktopPrerequisiteProbe,
        renderer_probe: LiveDesktopRendererProbe,
    ) -> LiveDesktopRuntimeStatus {
        self.start_with_renderer_session(prerequisite_probe, || {
            LiveDesktopRendererSession::create_for_probe(renderer_probe).map_err(Into::into)
        })
    }

    fn start_with_renderer_session<F>(
        &mut self,
        prerequisite_probe: LiveDesktopPrerequisiteProbe,
        make_renderer_session: F,
    ) -> LiveDesktopRuntimeStatus
    where
        F: FnOnce() -> Result<LiveDesktopRendererSession, LiveDesktopRendererStartupFailure>,
    {
        self.reap_abandoned_renderer_workers();
        if self.status.is_starting_or_running() {
            return self.status();
        }
        self.renderer_session = None;

        let generation = self.next_generation();
        self.status = LiveDesktopRuntimeStatus::starting(generation);

        if !prerequisite_probe.supports_d3d11 {
            return self.fail_startup(
                generation,
                prerequisite_probe.reason,
                prerequisite_probe.detail,
            );
        }

        let renderer_session = match make_renderer_session() {
            Ok(session) => session,
            Err(failure) => return self.fail_renderer_startup(generation, failure),
        };
        let renderer_probe = renderer_session.renderer_probe.clone();
        if !renderer_probe.supports_native_renderer {
            return self.fail_startup_with_probe(generation, renderer_probe);
        }
        self.renderer_session = Some(renderer_session);
        self.status = LiveDesktopRuntimeStatus::running(generation, renderer_probe.detail);
        self.status()
    }

    fn fail_startup(
        &mut self,
        generation: u64,
        reason: &'static str,
        detail: String,
    ) -> LiveDesktopRuntimeStatus {
        self.status = LiveDesktopRuntimeStatus::failed(generation, reason, detail);
        self.status()
    }

    fn fail_startup_with_probe(
        &mut self,
        generation: u64,
        probe: LiveDesktopRendererProbe,
    ) -> LiveDesktopRuntimeStatus {
        self.fail_startup(generation, probe.reason, probe.detail)
    }

    fn fail_renderer_startup(
        &mut self,
        generation: u64,
        failure: LiveDesktopRendererStartupFailure,
    ) -> LiveDesktopRuntimeStatus {
        let LiveDesktopRendererStartupFailure {
            probe,
            #[cfg(target_os = "windows")]
            abandoned_worker,
        } = failure;
        #[cfg(target_os = "windows")]
        if let Some(worker) = abandoned_worker {
            self.register_abandoned_renderer_worker(generation, worker);
        }
        self.fail_startup_with_probe(generation, probe)
    }

    fn apply_abandoned_renderer_diagnostics(
        &self,
        diagnostics: &mut LiveDesktopRuntimeDiagnostics,
    ) {
        diagnostics.abandoned_renderer_workers = self.abandoned_renderer_worker_count();
        diagnostics.reaped_abandoned_renderer_workers = self.reaped_abandoned_renderer_workers;
        diagnostics.last_abandoned_renderer_reason = self.last_abandoned_renderer_reason.clone();
    }

    #[cfg(target_os = "windows")]
    fn abandoned_renderer_worker_count(&self) -> u64 {
        self.abandoned_renderer_workers.len() as u64
    }

    #[cfg(not(target_os = "windows"))]
    fn abandoned_renderer_worker_count(&self) -> u64 {
        0
    }

    #[cfg(target_os = "windows")]
    fn register_abandoned_renderer_worker(
        &mut self,
        generation: u64,
        mut worker: LiveDesktopAbandonedRendererWorker,
    ) {
        worker.generation = generation;
        self.last_abandoned_renderer_reason = format!(
            "generation {}: {}: {}",
            generation, worker.reason, worker.detail
        );
        self.abandoned_renderer_workers.push(worker);
    }

    #[cfg(target_os = "windows")]
    fn reap_abandoned_renderer_workers(&mut self) {
        let mut remaining = Vec::new();
        for mut abandoned in self.abandoned_renderer_workers.drain(..) {
            let Some(worker) = abandoned.worker.take() else {
                continue;
            };
            if worker.is_finished() {
                let _ = worker.join();
                self.reaped_abandoned_renderer_workers += 1;
            } else {
                abandoned.worker = Some(worker);
                remaining.push(abandoned);
            }
        }
        self.abandoned_renderer_workers = remaining;
    }

    #[cfg(not(target_os = "windows"))]
    fn reap_abandoned_renderer_workers(&mut self) {}
}

impl LiveDesktopRendererSession {
    #[cfg(target_os = "windows")]
    fn start_for_window(
        window_handle: LiveDesktopWindowHandle,
        config: LiveDesktopRuntimeConfig,
    ) -> Result<Self, LiveDesktopRendererStartupFailure> {
        let (ready_sender, ready_receiver) = mpsc::channel();
        let (stop_sender, stop_receiver) = mpsc::channel();
        let (command_sender, command_receiver) = mpsc::channel();
        let (exit_sender, exit_receiver) = mpsc::channel();
        let startup_cancel = LiveDesktopStartupCancellationToken::new();
        let worker_cancel = startup_cancel.clone();
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
                    &worker_cancel,
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

        let LiveDesktopRendererStartupReady {
            renderer_probe,
            exit_receiver,
            worker,
        } = wait_for_live_desktop_renderer_startup(
            ready_receiver,
            &stop_sender,
            exit_receiver,
            worker,
            &startup_cancel,
            Duration::from_millis(LIVE_DESKTOP_RENDERER_INIT_TIMEOUT_MS),
            Duration::from_millis(LIVE_DESKTOP_RENDERER_STARTUP_CANCEL_JOIN_TIMEOUT_MS),
        )?;

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
    ) -> Result<Self, LiveDesktopRendererStartupFailure> {
        Err(probe_live_desktop_renderer().into())
    }

    fn configure(&self, config: LiveDesktopRuntimeConfig) {
        #[cfg(target_os = "windows")]
        if let Some(command_sender) = self.command_sender.as_ref() {
            let _ = command_sender.send(LiveDesktopRendererCommand::Configure(Box::new(config)));
        }
    }

    fn set_visible(&self, visible: bool) {
        #[cfg(target_os = "windows")]
        if let Some(command_sender) = self.command_sender.as_ref() {
            let _ = command_sender.send(LiveDesktopRendererCommand::SetVisible(visible));
        }
    }

    #[cfg(target_os = "windows")]
    fn stop_and_maybe_abandon(
        &mut self,
        cleanup_timeout: Duration,
    ) -> Option<LiveDesktopAbandonedRendererWorker> {
        if let Some(stop_sender) = self.stop_sender.take() {
            let _ = stop_sender.send(());
        }
        let exited = self
            .exit_receiver
            .take()
            .map(|exit_receiver| {
                matches!(
                    exit_receiver.recv_timeout(cleanup_timeout),
                    Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected)
                )
            })
            .unwrap_or(true);

        let worker = self.worker.take()?;
        if exited || worker.is_finished() {
            let _ = worker.join();
            return None;
        }

        let detail = format!(
            "DirectComposition renderer worker did not stop within {} ms",
            cleanup_timeout.as_millis()
        );
        Some(LiveDesktopAbandonedRendererWorker::new(
            worker,
            "nativeRendererStopTimedOut",
            detail,
        ))
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
fn wait_for_live_desktop_renderer_startup(
    ready_receiver: mpsc::Receiver<LiveDesktopRendererStartupMessage>,
    stop_sender: &mpsc::Sender<()>,
    exit_receiver: mpsc::Receiver<()>,
    worker: thread::JoinHandle<()>,
    startup_cancel: &LiveDesktopStartupCancellationToken,
    startup_timeout: Duration,
    cleanup_timeout: Duration,
) -> Result<LiveDesktopRendererStartupReady, LiveDesktopRendererStartupFailure> {
    let deadline = Instant::now() + startup_timeout;
    let mut last_progress = "Renderer worker has not reported progress yet".to_string();
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(cancel_live_desktop_renderer_startup_after_timeout(
                stop_sender,
                exit_receiver,
                worker,
                startup_cancel,
                &last_progress,
                cleanup_timeout,
            ));
        }
        match ready_receiver.recv_timeout(remaining) {
            Ok(LiveDesktopRendererStartupMessage::Ready(renderer_probe)) => {
                return Ok(LiveDesktopRendererStartupReady {
                    renderer_probe,
                    exit_receiver,
                    worker,
                });
            }
            Ok(LiveDesktopRendererStartupMessage::Failed(probe)) => {
                let _ = worker.join();
                return Err(probe.into());
            }
            Ok(LiveDesktopRendererStartupMessage::Progress(progress)) => {
                last_progress = progress;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                return Err(cancel_live_desktop_renderer_startup_after_timeout(
                    stop_sender,
                    exit_receiver,
                    worker,
                    startup_cancel,
                    &last_progress,
                    cleanup_timeout,
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
                )
                .into());
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn cancel_live_desktop_renderer_startup_after_timeout(
    stop_sender: &mpsc::Sender<()>,
    exit_receiver: mpsc::Receiver<()>,
    worker: thread::JoinHandle<()>,
    startup_cancel: &LiveDesktopStartupCancellationToken,
    last_progress: &str,
    cleanup_timeout: Duration,
) -> LiveDesktopRendererStartupFailure {
    startup_cancel.cancel();
    let _ = stop_sender.send(());
    let mut detail = format!(
        "DirectComposition renderer worker did not initialize within {} ms; last progress: {}",
        LIVE_DESKTOP_RENDERER_INIT_TIMEOUT_MS, last_progress
    );
    let cleanup =
        cleanup_live_desktop_renderer_startup_after_cancel(exit_receiver, worker, cleanup_timeout);
    detail.push_str("; cleanup=");
    detail.push_str(cleanup.detail_label());
    let probe = LiveDesktopRendererProbe::unavailable(
        "nativeRendererInitializationTimedOut",
        detail.clone(),
    );

    match cleanup {
        LiveDesktopRendererStartupTimeoutCleanup::Joined => probe.into(),
        LiveDesktopRendererStartupTimeoutCleanup::Abandoned(worker) => {
            LiveDesktopRendererStartupFailure {
                probe,
                abandoned_worker: Some(LiveDesktopAbandonedRendererWorker::new(
                    worker,
                    "nativeRendererInitializationTimedOut",
                    detail,
                )),
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn cleanup_live_desktop_renderer_startup_after_cancel(
    exit_receiver: mpsc::Receiver<()>,
    worker: thread::JoinHandle<()>,
    cleanup_timeout: Duration,
) -> LiveDesktopRendererStartupTimeoutCleanup {
    match exit_receiver.recv_timeout(cleanup_timeout) {
        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => {
            let _ = worker.join();
            LiveDesktopRendererStartupTimeoutCleanup::Joined
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            LiveDesktopRendererStartupTimeoutCleanup::Abandoned(worker)
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for LiveDesktopRendererSession {
    fn drop(&mut self) {
        let _ = self.stop_and_maybe_abandon(Duration::from_millis(
            LIVE_DESKTOP_RENDERER_STOP_JOIN_TIMEOUT_MS,
        ));
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
            match live_desktop_frame_pump_visibility_action(
                self.visible,
                &stop_receiver,
                Duration::from_millis(LIVE_DESKTOP_FRAME_PUMP_INTERVAL_MS),
            ) {
                LiveDesktopFramePumpAction::PumpFrame => {}
                LiveDesktopFramePumpAction::WaitForVisibility => {
                    self.drain_window_capture_frame_arrivals();
                    continue;
                }
                LiveDesktopFramePumpAction::Stop => break,
            }

            if self.config.effective_frame_source().uses_window_capture() {
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
                    if let ControlFlow::Break(()) = self.pump_one_frame() {
                        break;
                    }
                }
            }
        }
    }

    fn wait_for_window_capture_frame_or_stop(
        &mut self,
        stop_receiver: &mpsc::Receiver<()>,
    ) -> bool {
        if live_desktop_renderer_should_stop(stop_receiver) {
            return true;
        }

        let frame_arrived_receiver = self
            .window_capture
            .as_ref()
            .and_then(|capture| capture.frame_arrived_receiver.as_ref());
        if let Some(frame_arrived_receiver) = frame_arrived_receiver {
            match frame_arrived_receiver.recv_timeout(Duration::from_millis(
                LIVE_DESKTOP_WGC_FRAME_EVENT_FALLBACK_MS,
            )) {
                Ok(()) => {
                    while frame_arrived_receiver.try_recv().is_ok() {}
                    if let ControlFlow::Break(()) = self.pump_one_frame() {
                        return true;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if let ControlFlow::Break(()) = self.pump_one_frame() {
                        return true;
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    if let ControlFlow::Break(()) = self.pump_one_frame() {
                        return true;
                    }
                }
            }
            return live_desktop_renderer_should_stop(stop_receiver);
        }

        match stop_receiver.recv_timeout(Duration::from_millis(LIVE_DESKTOP_FRAME_PUMP_INTERVAL_MS))
        {
            Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => true,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                matches!(self.pump_one_frame(), ControlFlow::Break(()))
            }
        }
    }

    fn drain_window_capture_frame_arrivals(&self) {
        let frame_arrived_receiver = self
            .window_capture
            .as_ref()
            .and_then(|capture| capture.frame_arrived_receiver.as_ref());
        if let Some(frame_arrived_receiver) = frame_arrived_receiver {
            while frame_arrived_receiver.try_recv().is_ok() {}
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
                    self.config = *config;
                    self.test_pattern.invalidate();
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
            match unsafe { self.set_visual_visible(visible) } {
                Ok(()) => {
                    self.visible = visible;
                }
                Err(error) => record_live_desktop_config_error(&self.diagnostics, &error),
            }
        }
    }

    unsafe fn apply_current_config_to_visual(&self) -> Result<(), String> {
        unsafe { apply_live_desktop_visual_opacity(self._root_visual3.as_ref(), &self.config) }?;
        let suppress_native_effects = self
            ._shader_pipeline
            .as_ref()
            .is_some_and(|pipeline| pipeline.should_apply_effects(&self.config));
        unsafe {
            apply_live_desktop_config_to_effects(
                self._blur_effect.as_ref(),
                self._color_matrix_effect.as_ref(),
                &self.config,
                self._root_visual3.is_none(),
                suppress_native_effects,
            )
        }?;
        unsafe { self.commit_composition() }?;
        Ok(())
    }

    unsafe fn apply_current_visual_placement(&self) -> Result<(), String> {
        let (display_width, display_height) = self.host_window.target_size();
        let placement = resolve_live_desktop_visual_placement(
            self.source_width,
            self.source_height,
            display_width,
            display_height,
        );
        unsafe {
            apply_direct_composition_visual_placement(
                &self._root_visual,
                &self._scale_transform,
                &placement,
            )
        }?;
        unsafe { self.commit_composition() }?;
        Ok(())
    }

    unsafe fn commit_composition(&self) -> Result<(), String> {
        unsafe { self._composition_device.commit() }?;
        if self.config.force_dwm_flush {
            unsafe { DwmFlush() }.map_err(|error| format!("DwmFlush failed: {error}"))?;
        }
        Ok(())
    }

    unsafe fn present_and_commit_composition(&self) -> Result<(), String> {
        unsafe { self._swap_chain.present() }?;
        unsafe { self.commit_composition() }?;
        Ok(())
    }

    unsafe fn set_visual_visible(&mut self, visible: bool) -> Result<(), String> {
        if visible {
            unsafe { self._target.SetRoot(&self._root_visual) }
        } else {
            unsafe { self._target.SetRoot(None::<&IDCompositionVisual>) }
        }
        .map_err(|error| error.to_string())?;
        unsafe { self.host_window.set_visible(visible) }?;
        unsafe { self.commit_composition() }?;
        Ok(())
    }

    fn pump_one_frame(&mut self) -> ControlFlow<()> {
        let error = match unsafe { self.copy_next_frame_to_surface() } {
            Ok(_outcome) => {
                self.consecutive_frame_errors = 0;
                return ControlFlow::Continue(());
            }
            Err(error) => error,
        };

        self.consecutive_frame_errors = self.consecutive_frame_errors.saturating_add(1);
        let device_removed = self.device_removed_detail();
        if self.consecutive_frame_errors >= LIVE_DESKTOP_FRAME_ERROR_CIRCUIT_BREAK
            || device_removed.is_some()
        {
            let mut detail = format!(
                "Live desktop frame pump stopped after {} consecutive frame errors; last error: {}",
                self.consecutive_frame_errors, error
            );
            if let Some(device_removed) = device_removed {
                detail.push_str("; ");
                detail.push_str(&device_removed);
            }
            record_live_desktop_frame_pump_circuit_breaker(&self.diagnostics, &detail);
            return ControlFlow::Break(());
        }

        ControlFlow::Continue(())
    }

    fn device_removed_detail(&self) -> Option<String> {
        let reason = unsafe { self._d3d_device.GetDeviceRemovedReason() };
        if reason.is_ok() {
            None
        } else {
            Some(format!(
                "D3D11 device removed during frame pump: {reason:?}"
            ))
        }
    }

    unsafe fn copy_next_frame_to_surface(&mut self) -> Result<FrameOutcome, String> {
        match unsafe { self.host_window.sync_to_owner_rect() } {
            Ok(true) => {
                if let Err(error) = unsafe { self.apply_current_visual_placement() } {
                    record_live_desktop_config_error(&self.diagnostics, &error);
                }
            }
            Ok(false) => {}
            Err(error) => record_live_desktop_config_error(&self.diagnostics, &error),
        }
        if self.config.effective_frame_source() == LiveDesktopFrameSource::TestPattern {
            let copy_started = Instant::now();
            let pattern_frame = match unsafe {
                draw_live_desktop_test_pattern_to_composition_surface(
                    &self._swap_chain,
                    &self._d3d_context,
                    &mut self.test_pattern,
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
            if let Err(detail) = unsafe { self.present_and_commit_composition() } {
                record_live_desktop_commit_error(&self.diagnostics, &detail);
                return Err(detail);
            }
            record_live_desktop_frame_commit_duration(&self.diagnostics, commit_started.elapsed());
            record_live_desktop_test_pattern_frame(&self.diagnostics, &pattern_frame);
            return Ok(FrameOutcome::Presented);
        }

        if self.config.effective_frame_source().uses_window_capture() {
            let window_capture = match self.window_capture.as_ref() {
                Some(window_capture) => window_capture,
                None => {
                    let error = format!(
                        "{} is unavailable; no WGC session was initialized",
                        self.config.effective_frame_source().window_capture_label()
                    );
                    record_live_desktop_copy_error(&self.diagnostics, &error);
                    return Err(error);
                }
            };
            unsafe { relay_wallpaper_engine_popup_mouse(window_capture) };
            let copy_started = Instant::now();
            let blank_frame_skips_before = live_desktop_blank_frame_skip_count(&self.diagnostics);
            let copied_frame = match unsafe {
                copy_window_capture_frame_to_composition_surface(
                    window_capture,
                    &self._swap_chain,
                    &self._d3d_device,
                    &self._d3d_context,
                    &self.config,
                    &self.diagnostics,
                    self._shader_pipeline.as_ref(),
                )
            } {
                Ok(copied_frame) => copied_frame,
                Err(error) => {
                    record_live_desktop_copy_error(&self.diagnostics, &error);
                    return Err(error);
                }
            };
            let Some(frame_probe) = copied_frame else {
                if live_desktop_blank_frame_skip_count(&self.diagnostics)
                    == blank_frame_skips_before
                {
                    record_live_desktop_frame_timeout(&self.diagnostics);
                    return Ok(FrameOutcome::TimedOut);
                }
                return Ok(FrameOutcome::BlankSkipped);
            };
            record_live_desktop_frame_copy_duration(&self.diagnostics, copy_started.elapsed());
            let commit_started = Instant::now();
            if let Err(detail) = unsafe { self.present_and_commit_composition() } {
                record_live_desktop_commit_error(&self.diagnostics, &detail);
                return Err(detail);
            }
            record_live_desktop_frame_commit_duration(&self.diagnostics, commit_started.elapsed());
            record_live_desktop_frame_copied(&self.diagnostics, &frame_probe);
            return Ok(FrameOutcome::Presented);
        }

        Ok(FrameOutcome::NoSource)
    }
}

#[cfg(target_os = "windows")]
fn live_desktop_renderer_should_stop(stop_receiver: &mpsc::Receiver<()>) -> bool {
    match stop_receiver.try_recv() {
        Ok(()) | Err(mpsc::TryRecvError::Disconnected) => true,
        Err(mpsc::TryRecvError::Empty) => false,
    }
}

#[cfg(target_os = "windows")]
fn report_live_desktop_renderer_startup_progress(
    sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
    detail: impl Into<String>,
) {
    let _ = sender.send(LiveDesktopRendererStartupMessage::Progress(detail.into()));
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

fn is_acceptable_live_desktop_wgc_target(info: &LiveDesktopWindowInfo) -> bool {
    !matches!(
        info.role.as_str(),
        "progman" | "shellDefView" | "desktopListView"
    )
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

    let managed_width = display_rect.width.max(1);
    let managed_height = display_rect.height.max(1);
    let set_position_result = unsafe {
        SetWindowPos(
            hwnd,
            Some(HWND_BOTTOM),
            display_rect.left,
            display_rect.top,
            managed_width,
            managed_height,
            SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING,
        )
    };
    let position_detail = match set_position_result {
        Ok(()) => format!(
            "alignedToDisplay={}x{}@{},{} popupSize={}x{} managedSize={}x{} zOrder=bottom",
            display_rect.width,
            display_rect.height,
            display_rect.left,
            display_rect.top,
            popup.rect.width,
            popup.rect.height,
            managed_width,
            managed_height
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
    let position = LiveDesktopMouseRelayPosition {
        x: position.x + mouse_relay.source_left as i32,
        y: position.y + mouse_relay.source_top as i32,
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

#[cfg(target_os = "windows")]
fn live_desktop_effective_frame_source_label(
    window_capture: Option<&LiveDesktopWindowCapture>,
) -> &'static str {
    if let Some(capture) = window_capture {
        capture.source_label
    } else {
        "Test Pattern"
    }
}

#[cfg(target_os = "windows")]
fn live_desktop_effective_frame_source_detail<'a>(
    window_capture: Option<&'a LiveDesktopWindowCapture>,
    fallback: &'a str,
) -> &'a str {
    window_capture
        .map(|capture| capture.detail.as_str())
        .unwrap_or(fallback)
}

fn resolve_live_desktop_frame_crop(
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
) -> Option<LiveDesktopFrameCrop> {
    if source_width == 0 || source_height == 0 || target_width == 0 || target_height == 0 {
        return None;
    }
    let width = target_width.min(source_width);
    let height = target_height.min(source_height);
    if width == source_width && height == source_height {
        return None;
    }
    Some(LiveDesktopFrameCrop {
        left: (source_width - width) / 2,
        top: (source_height - height) / 2,
        width,
        height,
    })
}

fn resolve_live_desktop_wgc_copy_crop(
    preferred_crop: Option<LiveDesktopFrameCrop>,
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
) -> LiveDesktopFrameCrop {
    if let Some(crop) = preferred_crop {
        if crop.width > 0
            && crop.height > 0
            && crop.left.saturating_add(crop.width) <= source_width
            && crop.top.saturating_add(crop.height) <= source_height
            && crop.width <= target_width
            && crop.height <= target_height
        {
            return crop;
        }
    }

    resolve_live_desktop_frame_crop(source_width, source_height, target_width, target_height)
        .unwrap_or(LiveDesktopFrameCrop {
            left: 0,
            top: 0,
            width: source_width.min(target_width),
            height: source_height.min(target_height),
        })
}

pub(crate) fn live_desktop_background_support() -> LiveDesktopBackgroundSupport {
    let prerequisite_probe = probe_live_desktop_prerequisites();
    let renderer_probe = probe_live_desktop_renderer();
    make_live_desktop_background_support(current_platform(), prerequisite_probe, renderer_probe)
}

fn active_live_desktop_prerequisite_probe(renderer_detail: &str) -> LiveDesktopPrerequisiteProbe {
    LiveDesktopPrerequisiteProbe {
        supports_d3d11: true,
        adapter_count: 0,
        output_count: 0,
        reason: "activeRuntime",
        detail: format!(
            "Live desktop runtime is already running; skipped D3D prerequisite probe; renderer: {renderer_detail}"
        ),
    }
}

fn active_live_desktop_background_support(
    renderer_probe: LiveDesktopRendererProbe,
) -> LiveDesktopBackgroundSupport {
    let detail = format!(
        "Live desktop runtime is already running; skipped D3D prerequisite probe; renderer: {}",
        renderer_probe.detail
    );
    let prerequisite_probe = active_live_desktop_prerequisite_probe(&renderer_probe.detail);
    let mut support = make_live_desktop_background_support(
        current_platform(),
        prerequisite_probe,
        renderer_probe,
    );
    support.reason = "available";
    support.supports_live_desktop_background = true;
    support.supports_live_desktop_background_effects =
        support.renderer_probe.supports_native_effects;
    support.detail = detail;
    support
}

fn make_live_desktop_background_support(
    platform: &'static str,
    prerequisite_probe: LiveDesktopPrerequisiteProbe,
    renderer_probe: LiveDesktopRendererProbe,
) -> LiveDesktopBackgroundSupport {
    let reason = if !prerequisite_probe.supports_d3d11 {
        prerequisite_probe.reason
    } else if !renderer_probe.supports_native_renderer {
        renderer_probe.reason
    } else {
        "available"
    };
    let supports_live_desktop_background =
        prerequisite_probe.supports_d3d11 && renderer_probe.supports_native_renderer;
    let supports_live_desktop_background_effects =
        supports_live_desktop_background && renderer_probe.supports_native_effects;
    let detail = if !prerequisite_probe.supports_d3d11 {
        prerequisite_probe.detail.clone()
    } else {
        renderer_probe.detail.clone()
    };

    LiveDesktopBackgroundSupport {
        platform,
        supports_live_desktop_background,
        supports_live_desktop_background_effects,
        reason,
        detail,
        prerequisite_probe,
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
        let adapter_name = live_desktop_adapter_name(&desc.Description);
        let (composition_device, native_effects) = match unsafe {
            create_live_desktop_composition_device(&dxgi_device, adapter_index, "probe")
        } {
            Ok(result) => result,
            Err(error) => {
                last_detail = error;
                continue;
            }
        };
        let swap_chain_probe_detail = match unsafe {
            probe_live_desktop_composition_swap_chain(
                &factory,
                &device,
                &composition_device,
                adapter_index,
            )
        } {
            Ok(detail) => detail,
            Err(error) => {
                last_detail = error;
                continue;
            }
        };
        drop(composition_device);
        let supports_native_effects =
            native_effects.color_matrix_effect.is_some() && native_effects.blur_effect.is_some();
        let detail = format!(
            "DirectComposition base renderer probe succeeded on adapter {adapter_index} ({adapter_name}); {swap_chain_probe_detail}; {}; HWND target and root visual are validated when the live desktop runtime starts",
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
fn check_live_desktop_renderer_startup_cancelled(
    startup_cancel: &LiveDesktopStartupCancellationToken,
    stage: impl Into<String>,
) -> Result<(), LiveDesktopRendererProbe> {
    if !startup_cancel.is_cancelled() {
        return Ok(());
    }
    Err(LiveDesktopRendererProbe::unavailable(
        "nativeRendererStartupCancelled",
        format!(
            "DirectComposition renderer startup was cancelled while {}",
            stage.into()
        ),
    ))
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_renderer_resources(
    window_handle: HWND,
    config: LiveDesktopRuntimeConfig,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    startup_cancel: &LiveDesktopStartupCancellationToken,
    progress_sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
) -> Result<LiveDesktopRendererStartup, LiveDesktopRendererProbe> {
    check_live_desktop_renderer_startup_cancelled(startup_cancel, "initializing COM apartment")?;
    report_live_desktop_renderer_startup_progress(progress_sender, "Initializing COM apartment");
    let com = unsafe { ComApartment::initialize() }.map_err(|error| {
        LiveDesktopRendererProbe::unavailable(
            "comInitializationFailed",
            format!("CoInitializeEx failed before creating DirectComposition renderer: {error}"),
        )
    })?;
    check_live_desktop_renderer_startup_cancelled(startup_cancel, "creating DXGI factory")?;
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
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            format!("enumerating adapter {adapter_index}"),
        )?;
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
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            format!("creating D3D11 device on adapter {adapter_index}"),
        )?;
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
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            format!("resolving output context on adapter {adapter_index}"),
        )?;
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Resolving live desktop output context on adapter {adapter_index} ({adapter_name})"
            ),
        );
        let output_context = match unsafe {
            resolve_live_desktop_output_context_for_adapter(&adapter, adapter_index, target_monitor)
        } {
            Ok(output_context) => output_context,
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
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            format!("creating DirectComposition device on adapter {adapter_index}"),
        )?;
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Creating DirectComposition device on adapter {adapter_index} ({adapter_name})"
            ),
        );
        let (composition_device, native_effects) = match unsafe {
            create_live_desktop_composition_device(&dxgi_device, adapter_index, "runtime")
        } {
            Ok(result) => result,
            Err(error) => {
                last_detail = format!(
                    "DirectComposition device creation failed on adapter {adapter_index} ({adapter_name}) while creating renderer resources: {error}"
                );
                continue;
            }
        };
        let supports_native_effects =
            native_effects.color_matrix_effect.is_some() && native_effects.blur_effect.is_some();
        let color_matrix_effect = native_effects.color_matrix_effect;
        let blur_effect = native_effects.blur_effect;
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "initializing live desktop frame source",
        )?;
        let effective_frame_source = config.effective_frame_source();
        let window_capture = if effective_frame_source.uses_window_capture() {
            match unsafe {
                create_live_desktop_window_capture(
                    &d3d.device,
                    config.disable_mouse_relay,
                    &output_context,
                    Arc::clone(&diagnostics),
                    progress_sender,
                )
            } {
                Ok(capture) => Some(capture),
                Err(error) => {
                    return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                        effective_frame_source.window_capture_unavailable_reason(),
                        format!(
                            "{} unavailable on adapter {adapter_index} ({adapter_name}): {error}",
                            effective_frame_source.window_capture_label()
                        ),
                    ));
                }
            }
        } else {
            None
        };
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "preparing live desktop host window",
        )?;
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Preparing live desktop WebView target host on adapter {adapter_index} ({adapter_name})"
            ),
        );
        let host_window_result = unsafe { LiveDesktopCompositionHost::create(window_handle) };
        let host_window = match host_window_result {
            Ok(host_window) => host_window,
            Err(error) => {
                let detail = format!(
                    "Live desktop WebView target host failed while creating renderer resources: {error}"
                );
                return Err(LiveDesktopRendererProbe::window_target_unavailable(
                    "liveDesktopHostUnavailable",
                    detail,
                ));
            }
        };
        let target_hwnd = host_window.target_hwnd();
        let (display_width, display_height) = host_window.target_size();
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "creating DirectComposition target",
        )?;
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Creating DirectComposition target for {} host on adapter {adapter_index} ({adapter_name})",
                "webviewTarget"
            ),
        );
        let target_result =
            unsafe { composition_device.create_target_for_hwnd(target_hwnd, false) };
        let target = match target_result {
            Ok(target) => target,
            Err(error) => {
                return Err(LiveDesktopRendererProbe::window_target_unavailable(
                    "directCompositionTargetUnavailable",
                    format!(
                        "CreateTargetForHwnd({adapter_index}, {adapter_name}, {}) failed while creating renderer resources: {error}",
                        "webviewTarget"
                    ),
                ));
            }
        };
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "creating DirectComposition root visual",
        )?;
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!("Creating DirectComposition root visual on adapter {adapter_index} ({adapter_name})"),
        );
        let root_visual = match unsafe { composition_device.create_visual() } {
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
        let root_visual3 = root_visual.cast::<IDCompositionVisual3>().ok();
        let source_width = window_capture
            .as_ref()
            .map(|capture| capture.width)
            .unwrap_or(output_context.output_width);
        let source_height = window_capture
            .as_ref()
            .map(|capture| capture.height)
            .unwrap_or(output_context.output_height);
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "creating DirectComposition swap chain",
        )?;
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Creating DirectComposition swap chain {source_width}x{source_height} for target {display_width}x{display_height}"
            ),
        );
        let swap_chain = match unsafe {
            LiveDesktopCompositionSwapChain::create(
                &factory,
                &d3d.device,
                source_width,
                source_height,
            )
        } {
            Ok(swap_chain) => swap_chain,
            Err(error) => {
                return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionSwapChainUnavailable",
                    format!(
                        "CreateSwapChainForComposition({}x{}) failed while creating renderer resources: {error}",
                        source_width, source_height
                    ),
                ));
            }
        };
        let (shader_pipeline, shader_pipeline_detail) =
            match unsafe {
                LiveDesktopShaderPipeline::create(&d3d.device, source_width, source_height, &config)
            } {
                Ok(pipeline) => (
                    Some(pipeline),
                    format!(
                        "D3D11 shader copy pipeline available for {}x{}",
                        source_width, source_height
                    ),
                ),
                Err(error) => (
                    None,
                    format!(
                        "D3D11 shader copy pipeline unavailable for {}x{}: {}; using direct texture copy",
                        source_width, source_height, error
                    ),
                ),
            };
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "copying initial live desktop frame",
        )?;
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            "Copying initial live desktop frame into DirectComposition swap chain",
        );
        let initial_frame = unsafe {
            copy_initial_live_desktop_frame_to_composition_surface(
                window_capture.as_ref(),
                &swap_chain,
                &d3d.device,
                &d3d.context,
                &config,
                &diagnostics,
                shader_pipeline.as_ref(),
            )
        };
        let initial_frame_copied = matches!(initial_frame, Ok(Some(_)));
        let initial_frame_detail = match initial_frame {
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
                format!("initial frame copy failed: {error}")
            }
        };
        if initial_frame_copied {
            unsafe { swap_chain.present() }.map_err(|error| {
                LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionSwapChainPresentFailed",
                    format!("Initial composition swap chain present failed: {error}"),
                )
            })?;
        }
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "applying DirectComposition effect configuration",
        )?;
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            "Applying DirectComposition effect configuration",
        );
        let suppress_native_effects = shader_pipeline
            .as_ref()
            .is_some_and(|pipeline| pipeline.should_apply_effects(&config));
        if let Err(error) = unsafe {
            apply_live_desktop_config_to_effects(
                blur_effect.as_ref(),
                color_matrix_effect.as_ref(),
                &config,
                root_visual3.is_none(),
                suppress_native_effects,
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
        check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "committing DirectComposition root visual",
        )?;
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            "Committing DirectComposition root visual",
        );
        let scale_transform = match unsafe {
            set_direct_composition_root(
                &composition_device,
                &target,
                &root_visual,
                &swap_chain.swap_chain,
                &blur_effect,
                &color_matrix_effect,
                root_visual3.as_ref(),
                &config,
                &placement,
            )
        } {
            Ok(scale_transform) => scale_transform,
            Err(error) => {
                return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionRootUnavailable",
                    format!(
                        "DirectComposition root visual and swap chain commit failed while creating renderer resources: {error}"
                    ),
                ));
            }
        };

        let effective_frame_source_detail = if effective_frame_source.uses_window_capture() {
            "effectiveFrameSource=wgc".to_string()
        } else if effective_frame_source == LiveDesktopFrameSource::TestPattern {
            "effectiveFrameSource=testPattern".to_string()
        } else {
            "effectiveFrameSource=unknown".to_string()
        };

        return Ok(LiveDesktopRendererStartup {
            renderer_probe: LiveDesktopRendererProbe::native_renderer_available_for_window(
                supports_native_effects,
                format!(
                    "{} frame pump initialized with {initial_frame_detail} and DirectComposition target/root swap chain source {}x{} -> target {}x{} scale {:.3} offset {:.1},{:.1} on adapter {adapter_index} ({adapter_name}), output {} ({}), monitor matched: {}; native effects available: {}; {}; {}; {}; {}; {}",
                    live_desktop_effective_frame_source_label(window_capture.as_ref()),
                    source_width,
                    source_height,
                    display_width,
                    display_height,
                    placement.scale,
                    placement.offset_x,
                    placement.offset_y,
                    output_context.output_index,
                    output_context.output_name,
                    !target_monitor.is_invalid(),
                    supports_native_effects,
                    host_window.detail(),
                    live_desktop_effective_frame_source_detail(
                        window_capture.as_ref(),
                        last_detail.as_str()
                    ),
                    native_effects.detail,
                    effective_frame_source_detail,
                    shader_pipeline_detail
                ),
            ),
            resources: LiveDesktopRendererResources {
                config,
                diagnostics,
                test_pattern: LiveDesktopTestPatternState::default(),
                visible: true,
                consecutive_frame_errors: 0,
                source_width,
                source_height,
                _com: com,
                _d3d_device: d3d.device,
                _d3d_context: d3d.context,
                window_capture,
                _composition_device: composition_device,
                _blur_effect: blur_effect,
                _color_matrix_effect: color_matrix_effect,
                _target: target,
                host_window,
                _root_visual: root_visual,
                _root_visual3: root_visual3,
                _scale_transform: scale_transform,
                _swap_chain: swap_chain,
                _shader_pipeline: shader_pipeline,
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
unsafe fn resolve_live_desktop_output_context_for_adapter(
    adapter: &IDXGIAdapter1,
    adapter_index: u32,
    target_monitor: HMONITOR,
) -> Result<LiveDesktopOutputContext, String> {
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

        return Ok(LiveDesktopOutputContext {
            output_index,
            output_width,
            output_height,
            output_rect,
            output_name,
        });
    }

    if output_count == 0 {
        return Err(format!(
            "DXGI did not report any outputs for hardware adapter {adapter_index}"
        ));
    }
    if last_detail.is_empty() {
        Err(format!(
            "Live desktop output context startup failed on adapter {adapter_index} without a detailed DXGI error"
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
    disable_mouse_relay: bool,
    output_context: &LiveDesktopOutputContext,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    progress_sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
) -> Result<LiveDesktopWindowCapture, String> {
    let capture_label = LiveDesktopFrameSource::WallpaperEnginePopupCapture.window_capture_label();
    report_live_desktop_renderer_startup_progress(
        progress_sender,
        format!("Probing {capture_label} windows"),
    );
    let popup_plan = create_wallpaper_engine_popup_plan(output_context);
    report_live_desktop_renderer_startup_progress(
        progress_sender,
        format!(
            "Ensuring Wallpaper Engine popup window {} at {}x{}",
            popup_plan.window_name, popup_plan.width, popup_plan.height
        ),
    );
    let mut popup_ensure = ensure_wallpaper_engine_named_popup(&popup_plan, progress_sender);
    let window_diagnostics = unsafe { probe_windows_live_desktop_windows() };
    let targets = collect_wallpaper_engine_popup_wgc_targets(
        &window_diagnostics,
        Some(&popup_plan.window_name),
    );
    if targets.is_empty() {
        let close_detail = cleanup_wallpaper_engine_popup_after_failed_capture(&mut popup_ensure);
        let ensure_detail = if popup_ensure.detail.trim().is_empty() {
            String::new()
        } else {
            format!("; {}", popup_ensure.detail)
        };
        return Err(format!(
            "{capture_label} diagnostics found no WGC capture targets: {}; open a Wallpaper Engine pop-out window when using popup capture{}{}",
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
    let manages_launchpad_popup = wallpaper_engine_popup_target_matches_window_name(
        first_target,
        &window_diagnostics,
        &popup_plan.window_name,
    );
    let mut popup_preparation = if manages_launchpad_popup {
        unsafe {
            prepare_wallpaper_engine_popup_for_capture(
                first_target,
                &window_diagnostics,
                &output_context.output_rect,
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
        let mouse_relay_targets = if manages_launchpad_popup && !disable_mouse_relay {
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
        let frame_crop = if manages_launchpad_popup {
            resolve_live_desktop_frame_crop(
                size.Width as u32,
                size.Height as u32,
                output_context.output_width,
                output_context.output_height,
            )
        } else {
            None
        };
        let render_width = frame_crop
            .map(|crop| crop.width)
            .unwrap_or(size.Width as u32);
        let render_height = frame_crop
            .map(|crop| crop.height)
            .unwrap_or(size.Height as u32);
        let relay_source_left = frame_crop.map(|crop| crop.left).unwrap_or(0);
        let relay_source_top = frame_crop.map(|crop| crop.top).unwrap_or(0);
        let relay_source_width = frame_crop
            .map(|crop| crop.width)
            .unwrap_or(size.Width as u32);
        let relay_source_height = frame_crop
            .map(|crop| crop.height)
            .unwrap_or(size.Height as u32);
        let mouse_relay = if !mouse_relay_target_hwnds.is_empty() {
            Some(Mutex::new(LiveDesktopMouseRelay {
                target_hwnds: mouse_relay_target_hwnds,
                output_rect: output_context.output_rect.clone(),
                source_left: relay_source_left,
                source_top: relay_source_top,
                source_width: relay_source_width,
                source_height: relay_source_height,
                last_position: None,
            }))
        } else {
            None
        };
        let mouse_relay_detail = if mouse_relay.is_some() {
            format!(
                "mouseRelay=enabled targets={} outputRect={}x{}@{},{} source={}x{}@{},{}",
                mouse_relay_target_labels,
                output_context.output_rect.width,
                output_context.output_rect.height,
                output_context.output_rect.left,
                output_context.output_rect.top,
                relay_source_width,
                relay_source_height,
                relay_source_left,
                relay_source_top
            )
        } else {
            if disable_mouse_relay {
                "mouseRelay=disabled(config)".to_string()
            } else {
                "mouseRelay=skipped(unmanagedPopup)".to_string()
            }
        };
        let frame_crop_detail = frame_crop
            .map(|crop| {
                format!(
                    "frameCrop={}x{}@{},{} render={}x{}",
                    crop.width, crop.height, crop.left, crop.top, render_width, render_height
                )
            })
            .unwrap_or_else(|| "frameCrop=none".to_string());

        return Ok(LiveDesktopWindowCapture {
            hwnd,
            width: render_width,
            height: render_height,
            source_label: capture_label,
            detail: format!(
                "{} initialized for {} role={} class={} process={} reason={} parent={} root={} style={} exStyle={} cloaked={} size={}x{} {} {} {} {} {} after {}/{} target attempts{}",
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
                frame_crop_detail,
                target_index + 1,
                target_count,
                previous_attempts
            ),
            popup_restore_state,
            popup_close_command,
            mouse_relay,
            frame_crop,
            diagnostics: Arc::clone(&diagnostics),
            _item: item,
            frame_pool,
            session,
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
    swap_chain: &LiveDesktopCompositionSwapChain,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    config: &LiveDesktopRuntimeConfig,
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    shader_pipeline: Option<&LiveDesktopShaderPipeline>,
) -> Result<Option<LiveDesktopFrameProbe>, String> {
    let Some(window_capture) = window_capture else {
        return Ok(None);
    };
    let deadline = std::time::Instant::now()
        + Duration::from_millis(LIVE_DESKTOP_INITIAL_FRAME_WAIT_MS as u64);
    while std::time::Instant::now() < deadline {
        unsafe { relay_wallpaper_engine_popup_mouse(window_capture) };
        match unsafe {
            copy_window_capture_frame_to_composition_surface(
                window_capture,
                swap_chain,
                device,
                context,
                config,
                diagnostics,
                shader_pipeline,
            )
        } {
            Ok(Some(frame)) => return Ok(Some(frame)),
            Ok(None) => thread::sleep(Duration::from_millis(8)),
            Err(error) => return Err(error),
        }
    }
    Ok(None)
}

#[cfg(target_os = "windows")]
unsafe fn probe_live_desktop_texture_pixels(
    source_texture: &ID3D11Texture2D,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    preferred_crop: Option<LiveDesktopFrameCrop>,
    label: &str,
) -> Result<LiveDesktopPixelProbe, String> {
    let mut source_desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { source_texture.GetDesc(&mut source_desc) };
    if source_desc.Width == 0 || source_desc.Height == 0 {
        return Err(format!("{label} source texture has invalid size"));
    }
    if source_desc.SampleDesc.Count != 1 {
        return Err(format!(
            "{label} does not support multisampled textures: sampleCount={}",
            source_desc.SampleDesc.Count
        ));
    }

    let crop = preferred_crop
        .filter(|crop| {
            crop.width > 0
                && crop.height > 0
                && crop.left.saturating_add(crop.width) <= source_desc.Width
                && crop.top.saturating_add(crop.height) <= source_desc.Height
        })
        .unwrap_or(LiveDesktopFrameCrop {
            left: 0,
            top: 0,
            width: source_desc.Width,
            height: source_desc.Height,
        });
    let probe_width = crop.width.min(16);
    let probe_height = crop.height.min(16);
    let left = crop.left + crop.width.saturating_sub(probe_width) / 2;
    let top = crop.top + crop.height.saturating_sub(probe_height) / 2;
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
        .map_err(|error| format!("{label} CreateTexture2D failed: {error}"))?;
    let staging_texture =
        staging_texture.ok_or_else(|| format!("{label} CreateTexture2D returned no texture"))?;
    let source_resource = source_texture
        .cast::<ID3D11Resource>()
        .map_err(|error| format!("{label} source resource cast failed: {error}"))?;
    let staging_resource = staging_texture
        .cast::<ID3D11Resource>()
        .map_err(|error| format!("{label} staging resource cast failed: {error}"))?;
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
        .map_err(|error| format!("{label} Map failed: {error}"))?;
    let probe_result = (|| -> Result<LiveDesktopPixelProbe, String> {
        if mapped.pData.is_null() {
            return Err(format!("{label} Map returned null data"));
        }
        let row_pitch = mapped.RowPitch as usize;
        let bytes = unsafe {
            std::slice::from_raw_parts(mapped.pData as *const u8, row_pitch * probe_height as usize)
        };
        let mut min_rgb = u32::MAX;
        let mut max_rgb = 0u32;
        let mut sum_rgb = 0u64;
        let mut min_alpha = u32::MAX;
        let mut max_alpha = 0u32;
        let mut sum_alpha = 0u64;
        let mut sample_count = 0u64;
        let mut alpha_sample_count = 0u64;
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
                let alpha = bytes.get(offset + 3).copied().unwrap_or_default() as u32;
                min_alpha = min_alpha.min(alpha);
                max_alpha = max_alpha.max(alpha);
                sum_alpha += alpha as u64;
                alpha_sample_count += 1;
            }
        }
        if sample_count == 0 {
            return Err(format!("{label} sampled no pixels"));
        }
        Ok(LiveDesktopPixelProbe {
            width: probe_width,
            height: probe_height,
            min_rgb,
            max_rgb,
            avg_rgb: (sum_rgb / sample_count) as u32,
            min_alpha,
            max_alpha,
            avg_alpha: if alpha_sample_count == 0 {
                0
            } else {
                (sum_alpha / alpha_sample_count) as u32
            },
        })
    })();
    unsafe { context.Unmap(&staging_resource, 0) };
    probe_result
}

#[cfg(target_os = "windows")]
fn is_live_desktop_suspected_blank_frame(probe: &LiveDesktopPixelProbe) -> bool {
    probe.max_alpha <= 8 || (probe.max_rgb <= 4 && probe.avg_rgb <= 2)
}

#[cfg(target_os = "windows")]
unsafe fn copy_window_capture_frame_to_composition_surface(
    window_capture: &LiveDesktopWindowCapture,
    swap_chain: &LiveDesktopCompositionSwapChain,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    config: &LiveDesktopRuntimeConfig,
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    shader_pipeline: Option<&LiveDesktopShaderPipeline>,
) -> Result<Option<LiveDesktopFrameProbe>, String> {
    let mut frame = match window_capture.frame_pool.TryGetNextFrame() {
        Ok(frame) => frame,
        Err(_) => return Ok(None),
    };
    while let Ok(next_frame) = window_capture.frame_pool.TryGetNextFrame() {
        let _ = frame.Close();
        frame = next_frame;
    }
    let copy_result = (|| -> Result<Option<LiveDesktopFrameProbe>, String> {
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
        let should_probe_frame =
            config.skip_blank_frames || should_probe_live_desktop_pixels(diagnostics);
        if should_probe_frame {
            match unsafe {
                probe_live_desktop_texture_pixels(
                    &source_texture,
                    device,
                    context,
                    window_capture.frame_crop,
                    "WGC pixel probe",
                )
            } {
                Ok(probe) => {
                    let should_skip =
                        config.skip_blank_frames && is_live_desktop_suspected_blank_frame(&probe);
                    record_live_desktop_pixel_probe(diagnostics, &probe);
                    if should_skip {
                        record_live_desktop_blank_frame_skipped(diagnostics, &probe);
                        return Ok(None);
                    }
                }
                Err(error) => record_live_desktop_pixel_probe_error(diagnostics, &error),
            }
        }

        let target_texture = unsafe { swap_chain.back_buffer("WGC") }?;
        let mut target_desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { target_texture.GetDesc(&mut target_desc) };
        let copy_crop = resolve_live_desktop_wgc_copy_crop(
            window_capture.frame_crop,
            source_desc.Width,
            source_desc.Height,
            target_desc.Width,
            target_desc.Height,
        );
        if copy_crop.width == 0 || copy_crop.height == 0 {
            return Err(format!(
                "WGC source size {}x{} cannot be copied into composition swap chain {}x{}",
                source_desc.Width, source_desc.Height, target_desc.Width, target_desc.Height
            ));
        }
        if copy_crop.left.saturating_add(copy_crop.width) > source_desc.Width
            || copy_crop.top.saturating_add(copy_crop.height) > source_desc.Height
            || copy_crop.width > target_desc.Width
            || copy_crop.height > target_desc.Height
        {
            return Err(format!(
                "WGC crop {}x{}@{},{} is outside source {}x{} or target {}x{}",
                copy_crop.width,
                copy_crop.height,
                copy_crop.left,
                copy_crop.top,
                source_desc.Width,
                source_desc.Height,
                target_desc.Width,
                target_desc.Height
            ));
        }
        let source_resource = source_texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("WGC source texture resource cast failed: {error}"))?;
        let target_resource = target_texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("WGC target texture resource cast failed: {error}"))?;
        let shader_copy_error = if let Some(shader_pipeline) = shader_pipeline {
            let copy_result = (|| -> Result<(), String> {
                unsafe {
                    shader_pipeline.render_source_region_to_texture(
                        context,
                        &source_resource,
                        source_desc.Width,
                        source_desc.Height,
                        copy_crop,
                        &target_texture,
                        config,
                        "WGC",
                    )?;
                }
                Ok(())
            })();
            copy_result.err()
        } else {
            None
        };
        let used_shader_pipeline = shader_pipeline.is_some() && shader_copy_error.is_none();
        if let Some(error) = shader_copy_error.as_ref() {
            record_live_desktop_shader_copy_fallback(diagnostics, error);
        }
        if !used_shader_pipeline {
            if copy_crop.left == 0
                && copy_crop.top == 0
                && copy_crop.width == source_desc.Width
                && copy_crop.height == source_desc.Height
                && source_desc.Width == target_desc.Width
                && source_desc.Height == target_desc.Height
            {
                unsafe { context.CopyResource(&target_resource, &source_resource) };
            } else {
                let source_box = D3D11_BOX {
                    left: copy_crop.left,
                    top: copy_crop.top,
                    front: 0,
                    right: copy_crop.left + copy_crop.width,
                    bottom: copy_crop.top + copy_crop.height,
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
        }

        Ok(Some(LiveDesktopFrameProbe {
            supports_frame_texture: true,
            width: copy_crop.width,
            height: copy_crop.height,
            format: source_desc.Format.0,
            reason: "available",
            detail: format!(
                "Copied GPU WGC frame from {} into composition swap chain: source {}x{} crop {}x{}@{},{} format {} shaderCopy {}{}",
                format_live_desktop_window_handle(window_capture.hwnd),
                source_desc.Width,
                source_desc.Height,
                copy_crop.width,
                copy_crop.height,
                copy_crop.left,
                copy_crop.top,
                source_desc.Format.0,
                used_shader_pipeline,
                shader_copy_error
                    .as_ref()
                    .map(|error| format!(" shaderCopyFallback={error}"))
                    .unwrap_or_default()
            ),
        }))
    })();
    let close_result = frame
        .Close()
        .map_err(|error| format!("WGC frame Close failed after copy: {error}"));

    match (copy_result, close_result) {
        (Ok(frame_probe), Ok(())) => Ok(frame_probe),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(error),
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
fn probe_live_desktop_prerequisites() -> LiveDesktopPrerequisiteProbe {
    match unsafe { probe_windows_live_desktop_prerequisites() } {
        Ok(probe) => probe,
        Err(probe) => probe,
    }
}

#[cfg(not(target_os = "windows"))]
fn probe_live_desktop_prerequisites() -> LiveDesktopPrerequisiteProbe {
    LiveDesktopPrerequisiteProbe {
        supports_d3d11: false,
        adapter_count: 0,
        output_count: 0,
        reason: "unsupportedPlatform",
        detail: "Live desktop backgrounds are only implemented on Windows".to_string(),
    }
}

#[cfg(target_os = "windows")]
unsafe fn probe_windows_live_desktop_prerequisites(
) -> Result<LiveDesktopPrerequisiteProbe, LiveDesktopPrerequisiteProbe> {
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.map_err(|error| {
        prerequisite_probe_error(
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
                return Err(prerequisite_probe_error(
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

        let _device = match unsafe { create_d3d11_device_for_adapter(&adapter) } {
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

            let output_desc = match unsafe { output.GetDesc() } {
                Ok(desc) => desc,
                Err(error) => {
                    last_detail =
                        format!("GetDesc({adapter_index}, {output_index}) failed: {error}");
                    continue;
                }
            };
            let output_width = (output_desc.DesktopCoordinates.right
                - output_desc.DesktopCoordinates.left)
                .max(0) as u32;
            let output_height = (output_desc.DesktopCoordinates.bottom
                - output_desc.DesktopCoordinates.top)
                .max(0) as u32;
            if output_width == 0 || output_height == 0 {
                last_detail = format!(
                    "DXGI output {adapter_index}, {output_index} has an empty desktop rectangle"
                );
                continue;
            }

            return Ok(LiveDesktopPrerequisiteProbe {
                supports_d3d11: true,
                adapter_count,
                output_count,
                reason: "available",
                detail: format!(
                    "D3D11 prerequisite probe succeeded on adapter {adapter_index}, output {output_index} ({}x{})",
                    output_width, output_height
                ),
            });
        }
    }

    if adapter_count == 0 {
        return Err(prerequisite_probe_error(
            false,
            adapter_count,
            output_count,
            "noDxgiAdapters",
            "DXGI did not report any adapters".to_string(),
        ));
    }
    if output_count == 0 {
        return Err(prerequisite_probe_error(
            true,
            adapter_count,
            output_count,
            "noDxgiOutputs",
            "DXGI did not report any outputs for hardware adapters".to_string(),
        ));
    }

    Err(prerequisite_probe_error(
        true,
        adapter_count,
        output_count,
        "d3dOutputUnavailable",
        if last_detail.is_empty() {
            "D3D11 prerequisite probe failed without a detailed DXGI error".to_string()
        } else {
            last_detail
        },
    ))
}

#[cfg(target_os = "windows")]
fn prerequisite_probe_error(
    supports_d3d11: bool,
    adapter_count: u32,
    output_count: u32,
    reason: &'static str,
    detail: String,
) -> LiveDesktopPrerequisiteProbe {
    LiveDesktopPrerequisiteProbe {
        supports_d3d11,
        adapter_count,
        output_count,
        reason,
        detail,
    }
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

    fn prerequisite_probe(
        supports_d3d11: bool,
        reason: &'static str,
    ) -> LiveDesktopPrerequisiteProbe {
        LiveDesktopPrerequisiteProbe {
            supports_d3d11,
            adapter_count: if supports_d3d11 { 1 } else { 0 },
            output_count: if supports_d3d11 { 1 } else { 0 },
            reason,
            detail: reason.to_string(),
        }
    }

    fn test_live_desktop_effect_plan() -> LiveDesktopEffectPlan {
        LiveDesktopEffectPlan {
            effect: LiveDesktopBackgroundEffect::Blur,
            blur: LiveDesktopBlurEffectPlan {
                kernel: LiveDesktopBlurKernel::DualKawase,
                gaussian_radius_px: 4.0,
                render_max_width: 960,
                render_max_height: 540,
                pass_count: 4,
                min_size: 16,
                offset_scale: 1.275,
                down_offsets: vec![1.275, 1.72125, 2.1675, 2.61375],
                up_offsets: vec![1.4025, 1.72125, 2.04],
                final_up_offset: 1.59375,
            },
            acrylic: LiveDesktopAcrylicEffectPlan {
                brightness: 1.2,
                contrast: 0.86,
                noise: 0.008,
                saturation: 1.45,
                seed: 0.42,
                tint_color: [0.1, 0.2, 0.3],
                tint_strength: 0.24,
                alpha: 0.37,
                enabled: false,
            },
        }
    }

    #[test]
    fn runtime_diagnostics_summary_includes_shader_copy_fallbacks() {
        let diagnostics = LiveDesktopRuntimeDiagnostics {
            shader_copy_fallbacks: 2,
            last_shader_copy_error: "shader failed".to_string(),
            ..LiveDesktopRuntimeDiagnostics::default()
        };
        let summary = diagnostics.summary();

        assert!(summary.contains("shaderCopyFallbacks=2"));
        assert!(summary.contains("lastShaderCopyError=shader failed"));
    }

    #[test]
    fn runtime_diagnostics_recent_errors_keep_latest_entries() {
        let mut diagnostics = LiveDesktopRuntimeDiagnostics::default();
        for index in 0..(LIVE_DESKTOP_RECENT_ERROR_LIMIT + 3) {
            push_live_desktop_recent_error(&mut diagnostics, &format!("error {index}"));
        }

        assert_eq!(
            diagnostics.recent_errors.len(),
            LIVE_DESKTOP_RECENT_ERROR_LIMIT
        );
        assert_eq!(diagnostics.recent_errors.front().unwrap(), "error 3");
        assert_eq!(
            diagnostics.recent_errors.back().unwrap(),
            &format!("error {}", LIVE_DESKTOP_RECENT_ERROR_LIMIT + 2)
        );
        assert_eq!(
            diagnostics.last_error,
            format!("error {}", LIVE_DESKTOP_RECENT_ERROR_LIMIT + 2)
        );
    }

    #[test]
    fn live_desktop_frame_pump_visibility_gate_waits_without_copying_when_hidden() {
        let (_stop_sender, stop_receiver) = mpsc::channel();

        assert_eq!(
            live_desktop_frame_pump_visibility_action(
                true,
                &stop_receiver,
                Duration::from_millis(0)
            ),
            LiveDesktopFramePumpAction::PumpFrame
        );
        assert_eq!(
            live_desktop_frame_pump_visibility_action(
                false,
                &stop_receiver,
                Duration::from_millis(0)
            ),
            LiveDesktopFramePumpAction::WaitForVisibility
        );
    }

    #[test]
    fn live_desktop_frame_pump_visibility_gate_stops_while_hidden() {
        let (stop_sender, stop_receiver) = mpsc::channel();
        stop_sender.send(()).unwrap();

        assert_eq!(
            live_desktop_frame_pump_visibility_action(
                false,
                &stop_receiver,
                Duration::from_millis(0)
            ),
            LiveDesktopFramePumpAction::Stop
        );
    }

    #[test]
    fn prerequisite_probe_success_waits_for_native_renderer_before_enabling_source() {
        let support = make_live_desktop_background_support(
            "windows",
            prerequisite_probe(true, "available"),
            LiveDesktopRendererProbe::native_renderer_unimplemented("renderer pending"),
        );

        assert!(!support.supports_live_desktop_background);
        assert!(!support.supports_live_desktop_background_effects);
        assert_eq!(support.reason, "nativeRendererNotImplemented");
        assert!(support.prerequisite_probe.supports_d3d11);
        assert!(support.renderer_probe.supports_direct_composition);
        assert!(!support.renderer_probe.supports_native_renderer);
    }

    #[test]
    fn prerequisite_and_renderer_success_enable_live_desktop_support() {
        let support = make_live_desktop_background_support(
            "windows",
            prerequisite_probe(true, "available"),
            LiveDesktopRendererProbe::native_renderer_available_for_probe(true, "renderer ready"),
        );

        assert!(support.supports_live_desktop_background);
        assert!(support.supports_live_desktop_background_effects);
        assert_eq!(support.reason, "available");
        assert!(support.renderer_probe.supports_native_renderer);
        assert!(support.renderer_probe.supports_native_effects);
    }

    #[test]
    fn active_runtime_support_skips_d3d_prerequisite_probe() {
        let mut runtime = LiveDesktopRuntime::default();
        let status = runtime.start_with_probes(
            prerequisite_probe(true, "available"),
            LiveDesktopRendererProbe::native_renderer_available_for_window(
                true,
                "active renderer ready",
            ),
        );

        assert_eq!(status.phase, "running");

        let support = runtime
            .active_background_support()
            .expect("running runtime should report active support");

        assert!(support.supports_live_desktop_background);
        assert!(support.supports_live_desktop_background_effects);
        assert_eq!(support.reason, "available");
        assert_eq!(support.prerequisite_probe.reason, "activeRuntime");
        assert!(support.detail.contains("skipped D3D prerequisite probe"));
        assert!(support.detail.contains("active renderer ready"));
    }

    #[test]
    fn renderer_without_effects_still_enables_live_desktop_source() {
        let support = make_live_desktop_background_support(
            "windows",
            prerequisite_probe(true, "available"),
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
    fn prerequisite_probe_failure_surfaces_probe_reason() {
        let support = make_live_desktop_background_support(
            "windows",
            prerequisite_probe(false, "dxgiUnavailable"),
            LiveDesktopRendererProbe::native_renderer_unimplemented("renderer pending"),
        );

        assert!(!support.supports_live_desktop_background);
        assert_eq!(support.reason, "dxgiUnavailable");
        assert!(!support.prerequisite_probe.supports_d3d11);
    }

    #[test]
    fn runtime_starts_stopped() {
        let mut runtime = LiveDesktopRuntime::default();
        let status = runtime.status();

        assert_eq!(status.phase, "stopped");
        assert!(!status.active);
        assert_eq!(status.generation, 0);
        assert_eq!(status.reason, "stopped");
    }

    #[test]
    fn live_desktop_effective_frame_source_defaults_to_wallpaper_engine_popup() {
        let config = LiveDesktopRuntimeConfig::default();

        assert_eq!(config.debug_frame_source_override, None);
        assert_eq!(
            config.effective_frame_source(),
            LiveDesktopFrameSource::WallpaperEnginePopupCapture
        );
        assert!(config.effective_frame_source().uses_window_capture());
    }

    #[test]
    fn live_desktop_debug_frame_source_override_enables_test_pattern() {
        let mut value = serde_json::to_value(LiveDesktopRuntimeConfig::default()).unwrap();
        value.as_object_mut().unwrap().insert(
            "debugFrameSourceOverride".to_string(),
            serde_json::Value::String("testPattern".to_string()),
        );

        let config: LiveDesktopRuntimeConfig = serde_json::from_value(value).unwrap();
        assert_eq!(
            config.debug_frame_source_override,
            Some(LiveDesktopDebugFrameSourceOverride::TestPattern)
        );
        assert_eq!(
            config.effective_frame_source(),
            LiveDesktopFrameSource::TestPattern
        );
        assert!(!config.effective_frame_source().uses_window_capture());
    }

    #[test]
    fn live_desktop_runtime_config_disables_mouse_relay_by_default() {
        let mut value = serde_json::to_value(LiveDesktopRuntimeConfig::default()).unwrap();
        value.as_object_mut().unwrap().remove("disableMouseRelay");

        let config: LiveDesktopRuntimeConfig = serde_json::from_value(value).unwrap();
        assert!(config.disable_mouse_relay);

        let mut value = serde_json::to_value(LiveDesktopRuntimeConfig::default()).unwrap();
        value.as_object_mut().unwrap().insert(
            "disableMouseRelay".to_string(),
            serde_json::Value::Bool(false),
        );

        let config: LiveDesktopRuntimeConfig = serde_json::from_value(value).unwrap();
        assert!(!config.disable_mouse_relay);
    }

    #[test]
    fn live_desktop_runtime_config_defaults_and_clamps_opacity() {
        let mut value = serde_json::to_value(LiveDesktopRuntimeConfig::default()).unwrap();
        value.as_object_mut().unwrap().remove("opacity");

        let config: LiveDesktopRuntimeConfig = serde_json::from_value(value).unwrap();
        assert_eq!(config.opacity, 100);
        assert_eq!(resolve_live_desktop_opacity(&config), 1.0);

        let mut config = LiveDesktopRuntimeConfig::default();
        config.opacity = 42;
        assert!((resolve_live_desktop_opacity(&config) - 0.42).abs() < 0.001);

        config.opacity = 250;
        assert_eq!(resolve_live_desktop_opacity(&config), 1.0);
    }

    #[test]
    fn live_desktop_runtime_config_accepts_missing_effect_plan() {
        let mut value = serde_json::to_value(LiveDesktopRuntimeConfig::default()).unwrap();
        value.as_object_mut().unwrap().remove("effectPlan");

        let config: LiveDesktopRuntimeConfig = serde_json::from_value(value).unwrap();

        assert!(config.effect_plan.is_none());
    }

    #[test]
    fn live_desktop_runtime_config_reads_effect_plan() {
        let mut value = serde_json::to_value(LiveDesktopRuntimeConfig::default()).unwrap();
        value.as_object_mut().unwrap().insert(
            "effectPlan".to_string(),
            serde_json::json!({
                "effect": "acrylicWebgl",
                "opacity": 0.37,
                "blur": {
                    "kernel": "gaussian",
                    "gaussianRadiusPx": 20,
                    "strength": 72,
                    "renderMaxWidth": 960,
                    "renderMaxHeight": 540,
                    "passCount": 4,
                    "minSize": 16,
                    "offsetScale": 1.275,
                    "downOffsets": [1.275, 1.72125, 2.1675, 2.61375],
                    "upOffsets": [1.4025, 1.72125, 2.04],
                    "finalUpOffset": 1.59375
                },
                "acrylic": {
                    "brightness": 1.2,
                    "contrast": 0.86,
                    "noise": 0.008,
                    "saturation": 1.45,
                    "seed": 0.42,
                    "tintColor": [0.1, 0.2, 0.3],
                    "tintStrength": 0.24,
                    "alpha": 0.37,
                    "enabled": true
                }
            }),
        );

        let config: LiveDesktopRuntimeConfig = serde_json::from_value(value).unwrap();
        let effect_plan = config.effect_plan.as_ref().unwrap();

        assert_eq!(
            effect_plan.effect,
            LiveDesktopBackgroundEffect::AcrylicWebgl
        );
        assert_eq!(effect_plan.blur.kernel, LiveDesktopBlurKernel::Gaussian);
        assert!((effect_plan.blur.gaussian_radius_px - 20.0).abs() < 0.001);
        assert_eq!(effect_plan.blur.render_max_width, 960);
        assert!((effect_plan.blur.offset_scale - 1.275).abs() < 0.001);
        assert_eq!(effect_plan.blur.down_offsets.len(), 4);
        assert!((effect_plan.blur.final_up_offset - 1.59375).abs() < 0.001);
        assert!(effect_plan.acrylic.enabled);
        assert!((effect_plan.acrylic.brightness - 1.2).abs() < 0.001);
        assert!((effect_plan.acrylic.alpha - 0.37).abs() < 0.001);
        assert_eq!(effect_plan.acrylic.tint_color, [0.1, 0.2, 0.3]);
    }

    #[test]
    fn live_desktop_effect_render_size_uses_plan_limits() {
        let mut config = LiveDesktopRuntimeConfig::default();
        config.effect_plan = Some(test_live_desktop_effect_plan());

        assert_eq!(
            resolve_live_desktop_effect_render_size(3840, 2160, config.effect_plan.as_ref()),
            (960, 540)
        );
        assert_eq!(
            resolve_live_desktop_effect_render_size(640, 360, config.effect_plan.as_ref()),
            (640, 360)
        );
    }

    #[test]
    fn live_desktop_dual_kawase_levels_match_webgl_plan() {
        assert_eq!(
            create_live_desktop_dual_kawase_levels(960, 540, 4, 16),
            vec![(480, 270), (240, 135), (120, 68), (60, 34)]
        );
    }

    #[test]
    fn live_desktop_acrylic_noise_pixels_are_stable() {
        let first = make_live_desktop_acrylic_noise_pixels(16, 0);
        let second = make_live_desktop_acrylic_noise_pixels(16, 0);
        let different = make_live_desktop_acrylic_noise_pixels(16, 1);

        assert_eq!(&first[0..64], &second[0..64]);
        assert_ne!(&first[0..64], &different[0..64]);
        assert!(first
            .chunks_exact(4)
            .all(|pixel| pixel[0] == pixel[1] && pixel[1] == pixel[2] && pixel[3] == 255));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn live_desktop_shader_source_compiles() {
        unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("main_vs"),
                s!("vs_4_0"),
                "test vertex shader",
            )
            .unwrap();
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("copy_ps"),
                s!("ps_4_0"),
                "test copy pixel shader",
            )
            .unwrap();
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("kawase_ps"),
                s!("ps_4_0"),
                "test kawase pixel shader",
            )
            .unwrap();
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("gaussian_ps"),
                s!("ps_4_0"),
                "test gaussian pixel shader",
            )
            .unwrap();
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("acrylic_ps"),
                s!("ps_4_0"),
                "test acrylic pixel shader",
            )
            .unwrap();
        }
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
    fn wgc_targets_reject_desktop_shell_roles() {
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
    fn live_desktop_frame_crop_trims_popup_overscan_to_display() {
        assert_eq!(
            resolve_live_desktop_frame_crop(2902, 1856, 2880, 1800),
            Some(LiveDesktopFrameCrop {
                left: 11,
                top: 28,
                width: 2880,
                height: 1800,
            })
        );
        assert_eq!(
            resolve_live_desktop_frame_crop(2880, 1800, 2880, 1800),
            None
        );
    }

    #[test]
    fn live_desktop_wgc_copy_crop_uses_preferred_crop_or_safe_fallback() {
        let preferred = LiveDesktopFrameCrop {
            left: 11,
            top: 28,
            width: 2880,
            height: 1800,
        };
        assert_eq!(
            resolve_live_desktop_wgc_copy_crop(Some(preferred), 2902, 1856, 2880, 1800),
            preferred
        );
        assert_eq!(
            resolve_live_desktop_wgc_copy_crop(Some(preferred), 1920, 1080, 1920, 1080),
            LiveDesktopFrameCrop {
                left: 0,
                top: 0,
                width: 1920,
                height: 1080,
            }
        );
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
    fn runtime_start_surfaces_prerequisite_failure() {
        let mut runtime = LiveDesktopRuntime::default();
        let status = runtime.start_with_probes(
            prerequisite_probe(false, "dxgiUnavailable"),
            LiveDesktopRendererProbe::available(),
        );

        assert_eq!(status.phase, "failed");
        assert!(!status.active);
        assert_eq!(status.generation, 1);
        assert_eq!(status.reason, "dxgiUnavailable");
    }

    #[test]
    fn runtime_start_waits_for_native_renderer_after_prerequisites_ready() {
        let mut runtime = LiveDesktopRuntime::default();
        let status = runtime.start_with_probes(
            prerequisite_probe(true, "available"),
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
            runtime.start_with_renderer_session(prerequisite_probe(true, "available"), || {
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

    #[cfg(target_os = "windows")]
    #[test]
    fn renderer_startup_timeout_joins_worker_that_exits_during_cleanup() {
        let (stop_sender, stop_receiver) = mpsc::channel();
        let (exit_sender, exit_receiver) = mpsc::channel();
        let startup_cancel = LiveDesktopStartupCancellationToken::new();
        let worker = thread::spawn(move || {
            let _ = stop_receiver.recv();
            let _ = exit_sender.send(());
        });

        let failure = cancel_live_desktop_renderer_startup_after_timeout(
            &stop_sender,
            exit_receiver,
            worker,
            &startup_cancel,
            "test progress",
            Duration::from_millis(200),
        );

        assert_eq!(failure.probe.reason, "nativeRendererInitializationTimedOut");
        assert!(failure.probe.detail.contains("cleanup=joined"));
        assert!(startup_cancel.is_cancelled());
        assert!(failure.abandoned_worker.is_none());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn renderer_startup_timeout_abandons_worker_that_does_not_exit_during_cleanup() {
        let (stop_sender, _stop_receiver) = mpsc::channel();
        let (exit_sender, exit_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let startup_cancel = LiveDesktopStartupCancellationToken::new();
        let worker = thread::spawn(move || {
            let _exit_sender = exit_sender;
            let _ = release_receiver.recv();
        });

        let mut failure = cancel_live_desktop_renderer_startup_after_timeout(
            &stop_sender,
            exit_receiver,
            worker,
            &startup_cancel,
            "test progress",
            Duration::from_millis(10),
        );

        assert_eq!(failure.probe.reason, "nativeRendererInitializationTimedOut");
        assert!(failure.probe.detail.contains("cleanup=abandonedWorker"));
        assert!(startup_cancel.is_cancelled());
        let mut abandoned = failure
            .abandoned_worker
            .take()
            .expect("timeout should abandon a worker that ignores cancellation");
        assert_eq!(abandoned.reason, "nativeRendererInitializationTimedOut");
        assert!(abandoned.detail.contains("cleanup=abandonedWorker"));

        let _ = release_sender.send(());
        if let Some(worker) = abandoned.worker.take() {
            let _ = worker.join();
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn renderer_startup_wait_reports_worker_exit_before_ready() {
        let (ready_sender, ready_receiver) = mpsc::channel::<LiveDesktopRendererStartupMessage>();
        drop(ready_sender);
        let (stop_sender, _stop_receiver) = mpsc::channel();
        let (_exit_sender, exit_receiver) = mpsc::channel();
        let startup_cancel = LiveDesktopStartupCancellationToken::new();
        let worker = thread::spawn(|| {});

        let failure = match wait_for_live_desktop_renderer_startup(
            ready_receiver,
            &stop_sender,
            exit_receiver,
            worker,
            &startup_cancel,
            Duration::from_millis(200),
            Duration::from_millis(10),
        ) {
            Ok(_) => panic!("startup wait should fail when the ready sender is disconnected"),
            Err(failure) => failure,
        };

        assert_eq!(failure.probe.reason, "nativeRendererWorkerExited");
        assert!(failure
            .probe
            .detail
            .contains("Renderer worker has not reported progress yet"));
        assert!(!startup_cancel.is_cancelled());
        assert!(failure.abandoned_worker.is_none());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn runtime_tracks_and_reaps_abandoned_renderer_worker() {
        let (stop_sender, _stop_receiver) = mpsc::channel();
        let (exit_sender, exit_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let startup_cancel = LiveDesktopStartupCancellationToken::new();
        let worker = thread::spawn(move || {
            let _exit_sender = exit_sender;
            let _ = release_receiver.recv();
        });

        let mut failure = cancel_live_desktop_renderer_startup_after_timeout(
            &stop_sender,
            exit_receiver,
            worker,
            &startup_cancel,
            "waiting in test",
            Duration::from_millis(10),
        );
        let abandoned = failure
            .abandoned_worker
            .take()
            .expect("timeout should abandon a worker that does not exit");
        let mut runtime = LiveDesktopRuntime::default();
        runtime.register_abandoned_renderer_worker(7, abandoned);

        let status = runtime.status();
        assert_eq!(status.diagnostics.abandoned_renderer_workers, 1);
        assert_eq!(status.diagnostics.reaped_abandoned_renderer_workers, 0);
        assert!(status.detail.contains("abandonedRendererWorkers=1"));

        let _ = release_sender.send(());
        let mut reaped_status = runtime.status();
        for _ in 0..20 {
            if reaped_status.diagnostics.reaped_abandoned_renderer_workers == 1 {
                break;
            }
            thread::sleep(Duration::from_millis(10));
            reaped_status = runtime.status();
        }

        assert_eq!(reaped_status.diagnostics.abandoned_renderer_workers, 0);
        assert_eq!(
            reaped_status.diagnostics.reaped_abandoned_renderer_workers,
            1
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn runtime_stop_tracks_abandoned_renderer_worker_when_stop_times_out() {
        let (stop_sender, _stop_receiver) = mpsc::channel();
        let (exit_sender, exit_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let worker = thread::spawn(move || {
            let _exit_sender = exit_sender;
            let _ = release_receiver.recv();
        });
        let mut runtime = LiveDesktopRuntime::default();
        let status =
            runtime.start_with_renderer_session(prerequisite_probe(true, "available"), || {
                Ok(LiveDesktopRendererSession {
                    renderer_probe: LiveDesktopRendererProbe::available(),
                    diagnostics: Arc::new(Mutex::new(LiveDesktopRuntimeDiagnostics::default())),
                    stop_sender: Some(stop_sender),
                    command_sender: None,
                    exit_receiver: Some(exit_receiver),
                    worker: Some(worker),
                })
            });
        assert_eq!(status.phase, "running");

        let stopped = runtime.stop_with_timeout(Duration::from_millis(10));
        assert_eq!(stopped.phase, "stopped");
        assert_eq!(stopped.diagnostics.abandoned_renderer_workers, 1);
        assert_eq!(stopped.diagnostics.reaped_abandoned_renderer_workers, 0);
        assert!(stopped
            .diagnostics
            .last_abandoned_renderer_reason
            .contains("nativeRendererStopTimedOut"));

        let _ = release_sender.send(());
        let mut reaped_status = runtime.status();
        for _ in 0..20 {
            if reaped_status.diagnostics.reaped_abandoned_renderer_workers == 1 {
                break;
            }
            thread::sleep(Duration::from_millis(10));
            reaped_status = runtime.status();
        }

        assert_eq!(reaped_status.diagnostics.abandoned_renderer_workers, 0);
        assert_eq!(
            reaped_status.diagnostics.reaped_abandoned_renderer_workers,
            1
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn runtime_reaps_abandoned_worker_without_changing_current_generation() {
        let (stop_sender, _stop_receiver) = mpsc::channel();
        let (exit_sender, exit_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        let worker = thread::spawn(move || {
            let _exit_sender = exit_sender;
            let _ = release_receiver.recv();
        });
        let mut runtime = LiveDesktopRuntime::default();
        let status =
            runtime.start_with_renderer_session(prerequisite_probe(true, "available"), || {
                Ok(LiveDesktopRendererSession {
                    renderer_probe: LiveDesktopRendererProbe::available(),
                    diagnostics: Arc::new(Mutex::new(LiveDesktopRuntimeDiagnostics::default())),
                    stop_sender: Some(stop_sender),
                    command_sender: None,
                    exit_receiver: Some(exit_receiver),
                    worker: Some(worker),
                })
            });
        assert_eq!(status.phase, "running");
        assert_eq!(status.generation, 1);

        let stopped = runtime.stop_with_timeout(Duration::from_millis(10));
        assert_eq!(stopped.phase, "stopped");
        assert_eq!(stopped.generation, 2);
        assert_eq!(stopped.diagnostics.abandoned_renderer_workers, 1);

        let restarted = runtime.start_with_probes(
            prerequisite_probe(true, "available"),
            LiveDesktopRendererProbe::available(),
        );
        assert_eq!(restarted.phase, "running");
        assert_eq!(restarted.generation, 3);
        assert_eq!(restarted.diagnostics.abandoned_renderer_workers, 1);

        let _ = release_sender.send(());
        let mut reaped_status = runtime.status();
        for _ in 0..20 {
            if reaped_status.diagnostics.reaped_abandoned_renderer_workers == 1 {
                break;
            }
            thread::sleep(Duration::from_millis(10));
            reaped_status = runtime.status();
        }

        assert_eq!(reaped_status.phase, "running");
        assert_eq!(reaped_status.generation, 3);
        assert_eq!(reaped_status.diagnostics.abandoned_renderer_workers, 0);
        assert_eq!(
            reaped_status.diagnostics.reaped_abandoned_renderer_workers,
            1
        );
    }

    #[test]
    fn runtime_can_transition_to_running_when_renderer_is_ready() {
        let mut runtime = LiveDesktopRuntime::default();
        let status = runtime.start_with_probes(
            prerequisite_probe(true, "available"),
            LiveDesktopRendererProbe::available(),
        );

        assert_eq!(status.phase, "running");
        assert!(status.active);
        assert_eq!(status.generation, 1);
        assert_eq!(status.reason, "running");

        let duplicate_start = runtime.start_with_probes(
            prerequisite_probe(true, "available"),
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
