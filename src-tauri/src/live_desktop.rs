use serde::{Deserialize, Serialize};

use std::sync::{Arc, Mutex};

#[cfg(target_os = "windows")]
use std::{sync::mpsc, thread, time::Duration};

#[cfg(target_os = "windows")]
use windows::{
    core::Interface,
    Win32::{
        Foundation::{HMODULE, HWND, POINT},
        Graphics::{
            Direct3D::{
                D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_10_0,
                D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
            },
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11RenderTargetView,
                ID3D11Resource, ID3D11Texture2D, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
            },
            DirectComposition::{
                DCompositionCreateDevice, DCompositionCreateDevice2,
                IDCompositionColorMatrixEffect, IDCompositionDevice, IDCompositionDevice3,
                IDCompositionGaussianBlurEffect, IDCompositionSurface, IDCompositionTarget,
                IDCompositionVisual,
            },
            Dxgi::{
                Common::{DXGI_ALPHA_MODE_IGNORE, DXGI_FORMAT_B8G8R8A8_UNORM},
                CreateDXGIFactory1, IDXGIAdapter1, IDXGIDevice, IDXGIFactory1, IDXGIOutput1,
                IDXGIOutputDuplication, IDXGIResource, IDXGISurface, DXGI_ADAPTER_FLAG3_SOFTWARE,
                DXGI_ERROR_ACCESS_DENIED, DXGI_ERROR_NOT_FOUND, DXGI_ERROR_WAIT_TIMEOUT,
                DXGI_OUTDUPL_FRAME_INFO,
            },
            Gdi::{MonitorFromWindow, HMONITOR, MONITOR_DEFAULTTONEAREST},
        },
        System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED},
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
const LIVE_DESKTOP_FRAME_PUMP_INTERVAL_MS: u64 = 33;

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
    config_sender: Option<mpsc::Sender<LiveDesktopRuntimeConfig>>,
    #[cfg(target_os = "windows")]
    worker: Option<thread::JoinHandle<()>>,
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
    _composition_device: IDCompositionDevice,
    _blur_effect: Option<IDCompositionGaussianBlurEffect>,
    _color_matrix_effect: Option<IDCompositionColorMatrixEffect>,
    _target: IDCompositionTarget,
    _root_visual: IDCompositionVisual,
    _surface: IDCompositionSurface,
}

#[cfg(target_os = "windows")]
struct ComApartment;

#[cfg(target_os = "windows")]
struct LiveDesktopCaptureStartup {
    output_index: u32,
    output_width: u32,
    output_height: u32,
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
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopRuntimeDiagnostics {
    frames_copied: u64,
    frame_timeouts: u64,
    copy_errors: u64,
    commit_errors: u64,
    config_updates: u64,
    config_errors: u64,
    last_frame_width: u32,
    last_frame_height: u32,
    last_frame_format: i32,
    test_pattern_frames: u64,
    last_error: String,
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
    Capture,
    TestPattern,
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
            diagnostic_mode: LiveDesktopDiagnosticMode::Capture,
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
        let (config_sender, config_receiver) = mpsc::channel();
        let diagnostics = Arc::new(Mutex::new(LiveDesktopRuntimeDiagnostics::default()));
        let worker_diagnostics = Arc::clone(&diagnostics);
        let window_handle_value = window_handle.0 as isize;
        let worker = thread::spawn(move || {
            let window_handle = HWND(window_handle_value as _);
            match unsafe {
                create_live_desktop_renderer_resources(window_handle, config, worker_diagnostics)
            } {
                Ok(startup) => {
                    let renderer_probe = startup.renderer_probe.clone();
                    if ready_sender.send(Ok(renderer_probe)).is_ok() {
                        let mut resources = startup.resources;
                        resources.run_frame_pump(stop_receiver, config_receiver);
                    }
                }
                Err(probe) => {
                    let _ = ready_sender.send(Err(probe));
                }
            }
        });

        let renderer_probe = match ready_receiver.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(probe)) => probe,
            Ok(Err(probe)) => {
                let _ = worker.join();
                return Err(probe);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let _ = stop_sender.send(());
                return Err(LiveDesktopRendererProbe::unavailable(
                    "nativeRendererInitializationTimedOut",
                    "DirectComposition renderer worker did not initialize within 2 seconds",
                ));
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = worker.join();
                return Err(LiveDesktopRendererProbe::unavailable(
                    "nativeRendererWorkerExited",
                    "DirectComposition renderer worker exited before reporting initialization",
                ));
            }
        };

        Ok(Self {
            renderer_probe,
            diagnostics,
            stop_sender: Some(stop_sender),
            config_sender: Some(config_sender),
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
        if let Some(config_sender) = self.config_sender.as_ref() {
            let _ = config_sender.send(config);
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
            config_sender: None,
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
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
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
        config_receiver: mpsc::Receiver<LiveDesktopRuntimeConfig>,
    ) {
        loop {
            self.apply_pending_config(&config_receiver);
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

    fn apply_pending_config(&mut self, config_receiver: &mpsc::Receiver<LiveDesktopRuntimeConfig>) {
        let mut did_update = false;
        for config in config_receiver.try_iter() {
            self.config = config;
            did_update = true;
        }
        if did_update {
            match unsafe { self.apply_current_config_to_visual() } {
                Ok(()) => record_live_desktop_config_update(&self.diagnostics),
                Err(error) => record_live_desktop_config_error(&self.diagnostics, &error),
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

    unsafe fn copy_next_frame_to_surface(&self) -> Result<bool, String> {
        if self.config.diagnostic_mode == LiveDesktopDiagnosticMode::TestPattern {
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
            if let Err(error) = unsafe { self._composition_device.Commit() } {
                let detail = error.to_string();
                record_live_desktop_commit_error(&self.diagnostics, &detail);
                return Err(detail);
            }
            record_live_desktop_test_pattern_frame(&self.diagnostics, &pattern_frame);
            return Ok(true);
        }

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
        let frame_probe = copied_frame.expect("checked copied frame");
        if let Err(error) = unsafe { self._composition_device.Commit() } {
            let detail = error.to_string();
            record_live_desktop_commit_error(&self.diagnostics, &detail);
            return Err(detail);
        }
        record_live_desktop_frame_copied(&self.diagnostics, &frame_probe);
        Ok(true)
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

impl LiveDesktopRuntimeStatus {
    fn stopped(generation: u64) -> Self {
        Self {
            phase: "stopped",
            active: false,
            generation,
            reason: "stopped",
            detail: "Live desktop runtime is stopped".to_string(),
            diagnostics: LiveDesktopRuntimeDiagnostics::default(),
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
            format!("configUpdates={}", self.config_updates),
            format!("configErrors={}", self.config_errors),
            format!("testPatternFrames={}", self.test_pattern_frames),
        ];
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
) -> Result<LiveDesktopRendererStartup, LiveDesktopRendererProbe> {
    let com = unsafe { ComApartment::initialize() }.map_err(|error| {
        LiveDesktopRendererProbe::unavailable(
            "comInitializationFailed",
            format!("CoInitializeEx failed before creating DirectComposition renderer: {error}"),
        )
    })?;
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

        let d3d = match unsafe { create_d3d11_device_with_context_for_adapter(&adapter) } {
            Ok(d3d) => d3d,
            Err(error) => {
                last_detail = format!(
                    "D3D11CreateDevice({adapter_index}, {adapter_name}) failed while creating renderer resources: {error}"
                );
                continue;
            }
        };
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
        let surface = match unsafe {
            composition_device.CreateSurface(
                capture.output_width,
                capture.output_height,
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
                        capture.output_width, capture.output_height
                    ),
                ));
            }
        };
        let initial_frame_detail = match unsafe {
            copy_duplication_frame_to_composition_surface(
                &capture.duplication,
                &surface,
                &d3d.context,
                LIVE_DESKTOP_INITIAL_FRAME_WAIT_MS,
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
                format!("initial frame copy failed: {error}")
            }
        };
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
        if let Err(error) = unsafe {
            set_direct_composition_root(
                &composition_device,
                &target,
                &root_visual,
                &surface,
                &blur_effect,
                &color_matrix_effect,
            )
        } {
            return Err(LiveDesktopRendererProbe::root_visual_unavailable(
                "directCompositionRootUnavailable",
                format!(
                    "DirectComposition root visual and surface commit failed while creating renderer resources: {error}"
                ),
            ));
        }

        return Ok(LiveDesktopRendererStartup {
            renderer_probe: LiveDesktopRendererProbe::native_renderer_available_for_window(
                supports_native_effects,
                format!(
                    "Desktop Duplication frame pump initialized with {initial_frame_detail} and DirectComposition target/root surface on adapter {adapter_index} ({adapter_name}), output {} ({}), monitor matched: {}; native effects available: {}; {}",
                    capture.output_index,
                    capture.output_name,
                    !target_monitor.is_invalid(),
                    supports_native_effects,
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
                _composition_device: composition_device,
                _blur_effect: blur_effect,
                _color_matrix_effect: color_matrix_effect,
                _target: target,
                _root_visual: root_visual,
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
) -> Result<(), String> {
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
    Ok(())
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
                    config_sender: None,
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
