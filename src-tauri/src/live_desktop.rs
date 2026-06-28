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

mod capture;
mod composition;
mod config;
mod constants;
mod d3d;
mod diagnostics;
mod effects;
mod test_pattern;
mod wallpaper_engine;
mod window_diagnostics;

pub(crate) use capture::*;
pub(crate) use composition::*;
pub(crate) use config::*;
pub(crate) use constants::*;
pub(crate) use d3d::*;
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
pub(crate) struct LiveDesktopStartupCancellationToken {
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
pub(crate) struct LiveDesktopRendererStartup {
    renderer_probe: LiveDesktopRendererProbe,
    resources: LiveDesktopRendererResources,
}

#[cfg(target_os = "windows")]
struct LiveDesktopRendererResources {
    pub(crate) config: LiveDesktopRuntimeConfig,
    pub(crate) diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    pub(crate) test_pattern: LiveDesktopTestPatternState,
    pub(crate) visible: bool,
    pub(crate) consecutive_frame_errors: u32,
    pub(crate) source_width: u32,
    pub(crate) source_height: u32,
    pub(crate) _com: ComApartment,
    pub(crate) _d3d_device: ID3D11Device,
    pub(crate) _d3d_context: ID3D11DeviceContext,
    pub(crate) window_capture: Option<LiveDesktopWindowCapture>,
    pub(crate) _composition_device: LiveDesktopCompositionDevice,
    pub(crate) _blur_effect: Option<IDCompositionGaussianBlurEffect>,
    pub(crate) _color_matrix_effect: Option<IDCompositionColorMatrixEffect>,
    pub(crate) _target: IDCompositionTarget,
    pub(crate) host_window: LiveDesktopCompositionHost,
    pub(crate) _root_visual: IDCompositionVisual,
    pub(crate) _root_visual3: Option<IDCompositionVisual3>,
    pub(crate) _scale_transform: IDCompositionScaleTransform,
    pub(crate) _swap_chain: LiveDesktopCompositionSwapChain,
    pub(crate) _shader_pipeline: Option<LiveDesktopShaderPipeline>,
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
pub(crate) enum LiveDesktopRendererStartupMessage {
    Progress(String),
    Ready(LiveDesktopRendererProbe),
    Failed(LiveDesktopRendererProbe),
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

pub(crate) fn live_desktop_background_support() -> LiveDesktopBackgroundSupport {
    let prerequisite_probe = probe_live_desktop_prerequisites();
    let renderer_probe = probe_live_desktop_renderer();
    make_live_desktop_background_support(current_platform(), prerequisite_probe, renderer_probe)
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
