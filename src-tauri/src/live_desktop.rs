use serde::{Deserialize, Serialize};

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

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
    core::{factory, s, IInspectable, Interface, BOOL, PCSTR, PWSTR},
    Foundation::TypedEventHandler,
    Graphics::{
        Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession},
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
    },
    Win32::{
        Foundation::{CloseHandle, HMODULE, HWND, LPARAM, POINT, RECT, WPARAM},
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
                D3D11_BIND_CONSTANT_BUFFER, D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE,
                D3D11_BIND_VERTEX_BUFFER, D3D11_BOX, D3D11_BUFFER_DESC, D3D11_COMPARISON_NEVER,
                D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                D3D11_FILTER_MIN_MAG_MIP_LINEAR, D3D11_FILTER_MIN_MAG_MIP_POINT, D3D11_FLOAT32_MAX,
                D3D11_INPUT_ELEMENT_DESC, D3D11_INPUT_PER_VERTEX_DATA, D3D11_MAPPED_SUBRESOURCE,
                D3D11_MAP_READ, D3D11_SAMPLER_DESC, D3D11_SDK_VERSION, D3D11_SUBRESOURCE_DATA,
                D3D11_TEXTURE2D_DESC, D3D11_TEXTURE_ADDRESS_CLAMP, D3D11_USAGE_DEFAULT,
                D3D11_USAGE_STAGING, D3D11_VIEWPORT,
            },
            DirectComposition::{
                DCompositionCreateDevice, DCompositionCreateDevice3,
                IDCompositionColorMatrixEffect, IDCompositionDesktopDevice, IDCompositionDevice,
                IDCompositionDevice3, IDCompositionGaussianBlurEffect, IDCompositionScaleTransform,
                IDCompositionTarget, IDCompositionVisual, IDCompositionVisual3,
            },
            Dwm::{DwmFlush, DwmGetWindowAttribute, DWMWA_CLOAKED},
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
const LIVE_DESKTOP_RENDERER_STARTUP_CANCEL_JOIN_TIMEOUT_MS: u64 = 1_000;

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveDesktopPrerequisiteProbe {
    supports_d3d11: bool,
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
    source_width: u32,
    source_height: u32,
    _com: ComApartment,
    _d3d_device: ID3D11Device,
    _d3d_context: ID3D11DeviceContext,
    _window_capture: Option<LiveDesktopWindowCapture>,
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
#[derive(Default)]
struct LiveDesktopTestPatternState;

#[cfg(target_os = "windows")]
impl LiveDesktopTestPatternState {
    fn invalidate(&mut self) {}
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
    source_left: u32,
    source_top: u32,
    source_width: u32,
    source_height: u32,
    last_position: Option<LiveDesktopMouseRelayPosition>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct LiveDesktopFrameCrop {
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
struct LiveDesktopPixelProbe {
    width: u32,
    height: u32,
    min_rgb: u32,
    max_rgb: u32,
    avg_rgb: u32,
    min_alpha: u32,
    max_alpha: u32,
    avg_alpha: u32,
}

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

#[cfg(target_os = "windows")]
struct LiveDesktopCompositionSwapChain {
    swap_chain: IDXGISwapChain1,
    width: u32,
    height: u32,
}

#[cfg(target_os = "windows")]
struct LiveDesktopShaderPipeline {
    device: ID3D11Device,
    input_resource: ID3D11Resource,
    input_srv: ID3D11ShaderResourceView,
    vertex_shader: ID3D11VertexShader,
    copy_pixel_shader: ID3D11PixelShader,
    kawase_pixel_shader: ID3D11PixelShader,
    gaussian_pixel_shader: ID3D11PixelShader,
    acrylic_pixel_shader: ID3D11PixelShader,
    input_layout: ID3D11InputLayout,
    vertex_buffer: ID3D11Buffer,
    point_sampler: ID3D11SamplerState,
    linear_sampler: ID3D11SamplerState,
    kawase_constants: ID3D11Buffer,
    acrylic_constants: ID3D11Buffer,
    effect_source: LiveDesktopShaderTexture,
    down_textures: Vec<LiveDesktopShaderTexture>,
    up_textures: Vec<LiveDesktopShaderTexture>,
    final_blur_texture: LiveDesktopShaderTexture,
    final_render_texture: LiveDesktopShaderTexture,
    noise_texture: LiveDesktopShaderNoiseTexture,
    width: u32,
    height: u32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Clone, Copy)]
struct LiveDesktopShaderVertex {
    position: [f32; 2],
    uv: [f32; 2],
}

#[cfg(target_os = "windows")]
struct LiveDesktopShaderTexture {
    srv: ID3D11ShaderResourceView,
    rtv: ID3D11RenderTargetView,
    width: u32,
    height: u32,
}

#[cfg(target_os = "windows")]
struct LiveDesktopShaderNoiseTexture {
    srv: ID3D11ShaderResourceView,
    width: u32,
    height: u32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Clone, Copy)]
struct LiveDesktopKawaseConstants {
    values0: [f32; 4],
    values1: [f32; 4],
    values2: [f32; 4],
    values3: [f32; 4],
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Clone, Copy)]
struct LiveDesktopAcrylicConstants {
    values0: [f32; 4],
    values1: [f32; 4],
    values2: [f32; 4],
    values3: [f32; 4],
}

#[cfg(target_os = "windows")]
struct LiveDesktopNativeEffects {
    color_matrix_effect: Option<IDCompositionColorMatrixEffect>,
    blur_effect: Option<IDCompositionGaussianBlurEffect>,
    detail: String,
}

#[cfg(target_os = "windows")]
enum LiveDesktopCompositionDevice {
    Desktop(IDCompositionDesktopDevice),
    Legacy(IDCompositionDevice),
}

#[cfg(target_os = "windows")]
struct LiveDesktopCompositionHost {
    owner_hwnd: HWND,
    target_hwnd: HWND,
    target_rect: LiveDesktopWindowRect,
    detail: String,
}

#[cfg(target_os = "windows")]
impl LiveDesktopCompositionDevice {
    unsafe fn commit(&self) -> Result<(), String> {
        match self {
            Self::Desktop(device) => unsafe { device.Commit() },
            Self::Legacy(device) => unsafe { device.Commit() },
        }
        .map_err(|error| error.to_string())
    }

    unsafe fn create_target_for_hwnd(
        &self,
        hwnd: HWND,
        topmost: bool,
    ) -> Result<IDCompositionTarget, String> {
        match self {
            Self::Desktop(device) => unsafe { device.CreateTargetForHwnd(hwnd, topmost) },
            Self::Legacy(device) => unsafe { device.CreateTargetForHwnd(hwnd, topmost) },
        }
        .map_err(|error| error.to_string())
    }

    unsafe fn create_visual(&self) -> Result<IDCompositionVisual, String> {
        match self {
            Self::Desktop(device) => unsafe { device.CreateVisual() }
                .and_then(|visual| visual.cast::<IDCompositionVisual>()),
            Self::Legacy(device) => unsafe { device.CreateVisual() },
        }
        .map_err(|error| error.to_string())
    }

    unsafe fn create_scale_transform(&self) -> Result<IDCompositionScaleTransform, String> {
        match self {
            Self::Desktop(device) => unsafe { device.CreateScaleTransform() },
            Self::Legacy(device) => unsafe { device.CreateScaleTransform() },
        }
        .map_err(|error| error.to_string())
    }
}

#[cfg(target_os = "windows")]
impl LiveDesktopCompositionSwapChain {
    unsafe fn create(
        factory: &IDXGIFactory1,
        device: &ID3D11Device,
        width: u32,
        height: u32,
    ) -> Result<Self, String> {
        let factory2 = factory.cast::<IDXGIFactory2>().map_err(|error| {
            format!("IDXGIFactory2 cast failed before creating composition swap chain: {error}")
        })?;
        let desc = DXGI_SWAP_CHAIN_DESC1 {
            Width: width.max(1),
            Height: height.max(1),
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            Stereo: BOOL(0),
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
            BufferCount: 2,
            Scaling: DXGI_SCALING_STRETCH,
            SwapEffect: DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
            AlphaMode: DXGI_ALPHA_MODE_IGNORE,
            Flags: 0,
        };
        let swap_chain =
            unsafe { factory2.CreateSwapChainForComposition(device, &desc, None::<&IDXGIOutput>) }
                .map_err(|error| {
                    format!(
                        "CreateSwapChainForComposition({}x{}) failed: {error}",
                        desc.Width, desc.Height
                    )
                })?;
        Ok(Self {
            swap_chain,
            width: desc.Width,
            height: desc.Height,
        })
    }

    unsafe fn back_buffer(&self, label: &str) -> Result<ID3D11Texture2D, String> {
        unsafe { self.swap_chain.GetBuffer::<ID3D11Texture2D>(0) }
            .map_err(|error| format!("{label} swap chain GetBuffer(0) failed: {error}"))
    }

    unsafe fn present(&self) -> Result<(), String> {
        let present_params = DXGI_PRESENT_PARAMETERS::default();
        let result = unsafe {
            self.swap_chain
                .Present1(1, DXGI_PRESENT(0), &present_params)
        };
        result.ok().map_err(|error| {
            format!(
                "Composition swap chain Present1({}x{}) failed: {error}",
                self.width, self.height
            )
        })
    }
}

#[cfg(target_os = "windows")]
const LIVE_DESKTOP_COPY_SHADER_HLSL: &str = r#"
struct VsInput {
    float2 position : POSITION;
    float2 uv : TEXCOORD0;
};

struct PsInput {
    float4 position : SV_POSITION;
    float2 uv : TEXCOORD0;
};

PsInput main_vs(VsInput input) {
    PsInput output;
    output.position = float4(input.position, 0.0, 1.0);
    output.uv = input.uv;
    return output;
}

Texture2D source_texture : register(t0);
Texture2D noise_texture : register(t1);
SamplerState point_sampler : register(s0);
SamplerState linear_sampler : register(s1);

cbuffer EffectConstants : register(b0) {
    float4 effect_values0;
    float4 effect_values1;
    float4 effect_values2;
    float4 effect_values3;
};

float4 copy_ps(PsInput input) : SV_TARGET {
    return source_texture.Sample(linear_sampler, input.uv);
}

float4 kawase_ps(PsInput input) : SV_TARGET {
    float2 offset = effect_values0.xy * effect_values0.z;
    float4 color = source_texture.Sample(linear_sampler, input.uv + float2(-offset.x, -offset.y));
    color += source_texture.Sample(linear_sampler, input.uv + float2(offset.x, -offset.y));
    color += source_texture.Sample(linear_sampler, input.uv + float2(offset.x, offset.y));
    color += source_texture.Sample(linear_sampler, input.uv + float2(-offset.x, offset.y));
    return color * 0.25;
}

float4 gaussian_ps(PsInput input) : SV_TARGET {
    float2 texel_size = effect_values0.xy;
    float2 direction = effect_values0.zw;
    float sigma = max(effect_values1.x, 0.001);
    int radius = min(32, max(0, (int)(effect_values1.y + 0.5)));
    float4 color = float4(0.0, 0.0, 0.0, 0.0);
    float total_weight = 0.0;

    [loop]
    for (int index = -32; index <= 32; index++) {
        if (abs(index) <= radius) {
            float sample_index = (float)index;
            float weight = exp(-(sample_index * sample_index) / (2.0 * sigma * sigma));
            color += source_texture.Sample(linear_sampler, input.uv + texel_size * direction * sample_index) * weight;
            total_weight += weight;
        }
    }

    return color / max(total_weight, 0.0001);
}

float3 acrylic_soft_light(float3 base, float blend) {
    float3 safe_base = saturate(base);
    float3 low = safe_base - (1.0 - 2.0 * blend) * safe_base * (1.0 - safe_base);
    float3 high = safe_base + (2.0 * blend - 1.0) * (sqrt(safe_base) - safe_base);
    return lerp(low, high, step(0.5, blend));
}

float4 acrylic_ps(PsInput input) : SV_TARGET {
    float alpha = effect_values0.x;
    float saturation = effect_values0.y;
    float contrast = effect_values0.z;
    float brightness = effect_values0.w;
    float tint_strength = effect_values1.x;
    float noise_amount = effect_values1.y;
    float seed = effect_values1.z;
    float2 noise_size = max(effect_values2.xy, float2(1.0, 1.0));
    float3 tint_color = float3(effect_values2.z, effect_values2.w, effect_values3.x);

    float4 color = source_texture.Sample(linear_sampler, input.uv);
    if (color.a > 0.0) {
        color.rgb /= color.a;
    }

    float luminance = dot(color.rgb, float3(0.299, 0.587, 0.114));
    color.rgb = lerp(float3(luminance, luminance, luminance), color.rgb, saturation);
    color.rgb = (color.rgb - 0.5) * contrast + 0.5;
    color.rgb *= brightness;
    color.rgb = lerp(color.rgb, tint_color, tint_strength);

    float2 noise_offset = float2(seed * 17.0, seed * 31.0);
    float2 noise_uv = frac((input.position.xy + noise_offset) / noise_size);
    float noise_sample = noise_texture.Sample(point_sampler, noise_uv).r;
    color.rgb = lerp(color.rgb, acrylic_soft_light(color.rgb, noise_sample), noise_amount);
    color.rgb = saturate(color.rgb);
    color.a *= alpha;
    color.rgb *= color.a;
    return color;
}
"#;

#[cfg(target_os = "windows")]
impl LiveDesktopShaderPipeline {
    unsafe fn create(
        device: &ID3D11Device,
        width: u32,
        height: u32,
        config: &LiveDesktopRuntimeConfig,
    ) -> Result<Self, String> {
        let width = width.max(1);
        let height = height.max(1);
        let vertex_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("main_vs"),
                s!("vs_4_0"),
                "copy vertex shader",
            )
        }?;
        let copy_pixel_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("copy_ps"),
                s!("ps_4_0"),
                "copy pixel shader",
            )
        }?;
        let kawase_pixel_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("kawase_ps"),
                s!("ps_4_0"),
                "kawase pixel shader",
            )
        }?;
        let gaussian_pixel_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("gaussian_ps"),
                s!("ps_4_0"),
                "gaussian pixel shader",
            )
        }?;
        let acrylic_pixel_shader_blob = unsafe {
            compile_live_desktop_shader(
                LIVE_DESKTOP_COPY_SHADER_HLSL,
                s!("acrylic_ps"),
                s!("ps_4_0"),
                "acrylic pixel shader",
            )
        }?;
        let vertex_shader_bytes = unsafe { live_desktop_d3d_blob_bytes(&vertex_shader_blob) };
        let copy_pixel_shader_bytes =
            unsafe { live_desktop_d3d_blob_bytes(&copy_pixel_shader_blob) };
        let kawase_pixel_shader_bytes =
            unsafe { live_desktop_d3d_blob_bytes(&kawase_pixel_shader_blob) };
        let gaussian_pixel_shader_bytes =
            unsafe { live_desktop_d3d_blob_bytes(&gaussian_pixel_shader_blob) };
        let acrylic_pixel_shader_bytes =
            unsafe { live_desktop_d3d_blob_bytes(&acrylic_pixel_shader_blob) };

        let mut vertex_shader = None;
        unsafe {
            device.CreateVertexShader(
                vertex_shader_bytes,
                None::<&ID3D11ClassLinkage>,
                Some(&mut vertex_shader),
            )
        }
        .map_err(|error| format!("CreateVertexShader(copy) failed: {error}"))?;
        let vertex_shader = vertex_shader
            .ok_or_else(|| "CreateVertexShader(copy) returned no shader".to_string())?;

        let copy_pixel_shader =
            unsafe { create_live_desktop_pixel_shader(device, copy_pixel_shader_bytes, "copy") }?;
        let kawase_pixel_shader = unsafe {
            create_live_desktop_pixel_shader(device, kawase_pixel_shader_bytes, "kawase")
        }?;
        let gaussian_pixel_shader = unsafe {
            create_live_desktop_pixel_shader(device, gaussian_pixel_shader_bytes, "gaussian")
        }?;
        let acrylic_pixel_shader = unsafe {
            create_live_desktop_pixel_shader(device, acrylic_pixel_shader_bytes, "acrylic")
        }?;

        let input_elements = [
            D3D11_INPUT_ELEMENT_DESC {
                SemanticName: s!("POSITION"),
                SemanticIndex: 0,
                Format: DXGI_FORMAT_R32G32_FLOAT,
                InputSlot: 0,
                AlignedByteOffset: 0,
                InputSlotClass: D3D11_INPUT_PER_VERTEX_DATA,
                InstanceDataStepRate: 0,
            },
            D3D11_INPUT_ELEMENT_DESC {
                SemanticName: s!("TEXCOORD"),
                SemanticIndex: 0,
                Format: DXGI_FORMAT_R32G32_FLOAT,
                InputSlot: 0,
                AlignedByteOffset: 8,
                InputSlotClass: D3D11_INPUT_PER_VERTEX_DATA,
                InstanceDataStepRate: 0,
            },
        ];
        let mut input_layout = None;
        unsafe {
            device.CreateInputLayout(
                &input_elements,
                vertex_shader_bytes,
                Some(&mut input_layout),
            )
        }
        .map_err(|error| format!("CreateInputLayout(copy) failed: {error}"))?;
        let input_layout =
            input_layout.ok_or_else(|| "CreateInputLayout(copy) returned no layout".to_string())?;

        let vertices = [
            LiveDesktopShaderVertex {
                position: [-1.0, -1.0],
                uv: [0.0, 1.0],
            },
            LiveDesktopShaderVertex {
                position: [-1.0, 3.0],
                uv: [0.0, -1.0],
            },
            LiveDesktopShaderVertex {
                position: [3.0, -1.0],
                uv: [2.0, 1.0],
            },
        ];
        let vertex_buffer_desc = D3D11_BUFFER_DESC {
            ByteWidth: std::mem::size_of_val(&vertices) as u32,
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_VERTEX_BUFFER.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
            StructureByteStride: 0,
        };
        let vertex_buffer_data = D3D11_SUBRESOURCE_DATA {
            pSysMem: vertices.as_ptr() as *const std::ffi::c_void,
            SysMemPitch: 0,
            SysMemSlicePitch: 0,
        };
        let mut vertex_buffer = None;
        unsafe {
            device.CreateBuffer(
                &vertex_buffer_desc,
                Some(&vertex_buffer_data),
                Some(&mut vertex_buffer),
            )
        }
        .map_err(|error| format!("CreateBuffer(copy vertex buffer) failed: {error}"))?;
        let vertex_buffer = vertex_buffer
            .ok_or_else(|| "CreateBuffer(copy vertex buffer) returned no buffer".to_string())?;

        let point_sampler = unsafe {
            create_live_desktop_sampler(device, D3D11_FILTER_MIN_MAG_MIP_POINT, "point")
        }?;
        let linear_sampler = unsafe {
            create_live_desktop_sampler(device, D3D11_FILTER_MIN_MAG_MIP_LINEAR, "linear")
        }?;
        let kawase_constants = unsafe {
            create_live_desktop_constant_buffer::<LiveDesktopKawaseConstants>(
                device,
                "kawase constants",
            )
        }?;
        let acrylic_constants = unsafe {
            create_live_desktop_constant_buffer::<LiveDesktopAcrylicConstants>(
                device,
                "acrylic constants",
            )
        }?;

        let input_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let mut input_texture = None;
        unsafe { device.CreateTexture2D(&input_desc, None, Some(&mut input_texture)) }.map_err(
            |error| format!("CreateTexture2D(shader input {width}x{height}) failed: {error}"),
        )?;
        let input_texture = input_texture
            .ok_or_else(|| "CreateTexture2D(shader input) returned no texture".to_string())?;
        let input_resource = input_texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("Shader input texture resource cast failed: {error}"))?;
        let mut input_srv = None;
        unsafe { device.CreateShaderResourceView(&input_resource, None, Some(&mut input_srv)) }
            .map_err(|error| format!("CreateShaderResourceView(shader input) failed: {error}"))?;
        let input_srv = input_srv
            .ok_or_else(|| "CreateShaderResourceView(shader input) returned no view".to_string())?;
        let (effect_width, effect_height) =
            resolve_live_desktop_effect_render_size(width, height, config.effect_plan.as_ref());
        let levels = create_live_desktop_dual_kawase_levels(
            effect_width,
            effect_height,
            4,
            config
                .effect_plan
                .as_ref()
                .map(|plan| plan.blur.min_size)
                .unwrap_or(16),
        );
        let effect_source = unsafe {
            LiveDesktopShaderTexture::create(device, effect_width, effect_height, "effect source")
        }?;
        let final_blur_texture = unsafe {
            LiveDesktopShaderTexture::create(device, effect_width, effect_height, "final blur")
        }?;
        let final_render_texture = unsafe {
            LiveDesktopShaderTexture::create(device, effect_width, effect_height, "final render")
        }?;
        let down_textures =
            unsafe { create_live_desktop_shader_textures(device, &levels, "dual kawase down") }?;
        let up_textures =
            unsafe { create_live_desktop_shader_textures(device, &levels, "dual kawase up") }?;
        let noise_texture = unsafe { LiveDesktopShaderNoiseTexture::create(device, 128, 0) }?;

        Ok(Self {
            device: device.clone(),
            input_resource,
            input_srv,
            vertex_shader,
            copy_pixel_shader,
            kawase_pixel_shader,
            gaussian_pixel_shader,
            acrylic_pixel_shader,
            input_layout,
            vertex_buffer,
            point_sampler,
            linear_sampler,
            kawase_constants,
            acrylic_constants,
            effect_source,
            down_textures,
            up_textures,
            final_blur_texture,
            final_render_texture,
            noise_texture,
            width,
            height,
        })
    }

    unsafe fn copy_source_region_to_input(
        &self,
        context: &ID3D11DeviceContext,
        source_resource: &ID3D11Resource,
        source_width: u32,
        source_height: u32,
        copy_crop: LiveDesktopFrameCrop,
        label: &str,
    ) -> Result<(), String> {
        if copy_crop.width == 0 || copy_crop.height == 0 {
            return Err(format!("{label} shader copy crop has invalid size"));
        }
        if copy_crop.left.saturating_add(copy_crop.width) > source_width
            || copy_crop.top.saturating_add(copy_crop.height) > source_height
            || copy_crop.width > self.width
            || copy_crop.height > self.height
        {
            return Err(format!(
                "{label} shader copy crop {}x{}@{},{} is outside source {}x{} or input {}x{}",
                copy_crop.width,
                copy_crop.height,
                copy_crop.left,
                copy_crop.top,
                source_width,
                source_height,
                self.width,
                self.height
            ));
        }

        if copy_crop.left == 0
            && copy_crop.top == 0
            && copy_crop.width == source_width
            && copy_crop.height == source_height
            && source_width == self.width
            && source_height == self.height
        {
            unsafe { context.CopyResource(&self.input_resource, source_resource) };
            return Ok(());
        }

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
                &self.input_resource,
                0,
                0,
                0,
                0,
                source_resource,
                0,
                Some(&source_box),
            )
        };
        Ok(())
    }

    fn should_apply_effects(&self, config: &LiveDesktopRuntimeConfig) -> bool {
        config.effect_plan.as_ref().is_some_and(|plan| {
            matches!(
                plan.effect,
                LiveDesktopBackgroundEffect::Blur | LiveDesktopBackgroundEffect::AcrylicWebgl
            ) && !self.down_textures.is_empty()
        })
    }

    #[allow(clippy::too_many_arguments)]
    unsafe fn render_source_region_to_texture(
        &self,
        context: &ID3D11DeviceContext,
        source_resource: &ID3D11Resource,
        source_width: u32,
        source_height: u32,
        copy_crop: LiveDesktopFrameCrop,
        target_texture: &ID3D11Texture2D,
        config: &LiveDesktopRuntimeConfig,
        label: &str,
    ) -> Result<(), String> {
        unsafe {
            self.copy_source_region_to_input(
                context,
                source_resource,
                source_width,
                source_height,
                copy_crop,
                label,
            )?;
        }
        if self.should_apply_effects(config) {
            unsafe { self.render_effect_to_texture(context, target_texture, config, label) }
        } else {
            unsafe { self.draw_to_texture(context, target_texture, label) }
        }
    }

    unsafe fn render_effect_to_texture(
        &self,
        context: &ID3D11DeviceContext,
        target_texture: &ID3D11Texture2D,
        config: &LiveDesktopRuntimeConfig,
        label: &str,
    ) -> Result<(), String> {
        let effect_plan = config
            .effect_plan
            .as_ref()
            .ok_or_else(|| format!("{label} shader effect requested without effect plan"))?;

        unsafe {
            self.draw_shader_resource_to_render_target(
                context,
                &[Some(self.input_srv.clone())],
                &self.copy_pixel_shader,
                None,
                &self.effect_source.rtv,
                self.effect_source.width,
                self.effect_source.height,
            );
        }
        let mut current_srv = self.effect_source.srv.clone();
        let mut current_width = self.effect_source.width;
        let mut current_height = self.effect_source.height;

        if effect_plan.blur.kernel == LiveDesktopBlurKernel::Gaussian {
            let horizontal_sigma = resolve_live_desktop_gaussian_sigma(
                effect_plan.blur.gaussian_radius_px,
                self.effect_source.width,
                self.width,
            );
            let vertical_sigma = resolve_live_desktop_gaussian_sigma(
                effect_plan.blur.gaussian_radius_px,
                self.effect_source.height,
                self.height,
            );
            unsafe {
                self.draw_gaussian_pass(
                    context,
                    &self.effect_source.srv,
                    self.effect_source.width,
                    self.effect_source.height,
                    &self.final_render_texture,
                    horizontal_sigma,
                    [1.0, 0.0],
                    label,
                )?;
                self.draw_gaussian_pass(
                    context,
                    &self.final_render_texture.srv,
                    self.final_render_texture.width,
                    self.final_render_texture.height,
                    &self.final_blur_texture,
                    vertical_sigma,
                    [0.0, 1.0],
                    label,
                )?;
            }
        } else {
            let active_pass_count = (effect_plan.blur.pass_count.max(1) as usize)
                .min(self.down_textures.len())
                .max(1);

            for (index, target) in self
                .down_textures
                .iter()
                .take(active_pass_count)
                .enumerate()
            {
                let offset = effect_plan
                    .blur
                    .down_offsets
                    .get(index)
                    .copied()
                    .unwrap_or((1.0 + index as f32 * 0.35) * effect_plan.blur.offset_scale);
                unsafe {
                    self.draw_kawase_pass(
                        context,
                        &current_srv,
                        current_width,
                        current_height,
                        target,
                        offset,
                        label,
                    )?;
                }
                current_srv = target.srv.clone();
                current_width = target.width;
                current_height = target.height;
            }

            for index in (0..active_pass_count.saturating_sub(1)).rev() {
                let target = &self.up_textures[index];
                let offset = effect_plan
                    .blur
                    .up_offsets
                    .get(index)
                    .copied()
                    .unwrap_or((1.1 + index as f32 * 0.25) * effect_plan.blur.offset_scale);
                unsafe {
                    self.draw_kawase_pass(
                        context,
                        &current_srv,
                        current_width,
                        current_height,
                        target,
                        offset,
                        label,
                    )?;
                }
                current_srv = target.srv.clone();
                current_width = target.width;
                current_height = target.height;
            }

            unsafe {
                self.draw_kawase_pass(
                    context,
                    &current_srv,
                    current_width,
                    current_height,
                    &self.final_blur_texture,
                    effect_plan.blur.final_up_offset,
                    label,
                )?;
            }
        }

        let final_srv = if effect_plan.acrylic.enabled
            && effect_plan.effect == LiveDesktopBackgroundEffect::AcrylicWebgl
        {
            unsafe {
                self.draw_acrylic_pass(
                    context,
                    &self.final_blur_texture.srv,
                    &self.final_render_texture,
                    &effect_plan.acrylic,
                    label,
                )?;
            }
            &self.final_render_texture.srv
        } else {
            &self.final_blur_texture.srv
        };

        unsafe {
            self.draw_shader_resource_to_texture(
                context,
                final_srv,
                &self.copy_pixel_shader,
                None,
                target_texture,
                label,
            )
        }
    }

    unsafe fn draw_to_texture(
        &self,
        context: &ID3D11DeviceContext,
        target_texture: &ID3D11Texture2D,
        label: &str,
    ) -> Result<(), String> {
        unsafe {
            self.draw_shader_resource_to_texture(
                context,
                &self.input_srv,
                &self.copy_pixel_shader,
                None,
                target_texture,
                label,
            )
        }
    }

    unsafe fn draw_shader_resource_to_texture(
        &self,
        context: &ID3D11DeviceContext,
        source_srv: &ID3D11ShaderResourceView,
        pixel_shader: &ID3D11PixelShader,
        constant_buffer: Option<&ID3D11Buffer>,
        target_texture: &ID3D11Texture2D,
        label: &str,
    ) -> Result<(), String> {
        let mut target_desc = D3D11_TEXTURE2D_DESC::default();
        unsafe { target_texture.GetDesc(&mut target_desc) };
        let target_resource = target_texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("{label} shader target resource cast failed: {error}"))?;
        let mut render_target_view = None;
        unsafe {
            self.device.CreateRenderTargetView(
                &target_resource,
                None,
                Some(&mut render_target_view),
            )
        }
        .map_err(|error| {
            format!("{label} CreateRenderTargetView(shader target) failed: {error}")
        })?;
        let render_target_view = render_target_view
            .ok_or_else(|| format!("{label} CreateRenderTargetView returned no view"))?;
        unsafe {
            self.draw_shader_resource_to_render_target(
                context,
                &[Some(source_srv.clone())],
                pixel_shader,
                constant_buffer,
                &render_target_view,
                target_desc.Width,
                target_desc.Height,
            );
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    unsafe fn draw_shader_resource_to_render_target(
        &self,
        context: &ID3D11DeviceContext,
        shader_resources: &[Option<ID3D11ShaderResourceView>],
        pixel_shader: &ID3D11PixelShader,
        constant_buffer: Option<&ID3D11Buffer>,
        render_target_view: &ID3D11RenderTargetView,
        target_width: u32,
        target_height: u32,
    ) {
        let render_targets = [Some(render_target_view.clone())];
        let viewport = D3D11_VIEWPORT {
            TopLeftX: 0.0,
            TopLeftY: 0.0,
            Width: target_width.max(1) as f32,
            Height: target_height.max(1) as f32,
            MinDepth: 0.0,
            MaxDepth: 1.0,
        };
        let vertex_buffers = [Some(self.vertex_buffer.clone())];
        let stride = std::mem::size_of::<LiveDesktopShaderVertex>() as u32;
        let offset = 0u32;
        let samplers = [
            Some(self.point_sampler.clone()),
            Some(self.linear_sampler.clone()),
        ];
        let empty_shader_resources = vec![None; shader_resources.len().max(1)];
        unsafe {
            context.OMSetRenderTargets(Some(&render_targets), None::<&ID3D11DepthStencilView>);
            context.RSSetViewports(Some(&[viewport]));
            context.IASetInputLayout(&self.input_layout);
            context.IASetVertexBuffers(
                0,
                1,
                Some(vertex_buffers.as_ptr()),
                Some(&stride as *const u32),
                Some(&offset as *const u32),
            );
            context.IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            context.VSSetShader(&self.vertex_shader, None);
            context.PSSetShader(pixel_shader, None);
            if let Some(constant_buffer) = constant_buffer {
                context.PSSetConstantBuffers(0, Some(&[Some(constant_buffer.clone())]));
            } else {
                context.PSSetConstantBuffers(0, Some(&[None]));
            }
            context.PSSetShaderResources(0, Some(shader_resources));
            context.PSSetSamplers(0, Some(&samplers));
            context.Draw(3, 0);
            context.PSSetShaderResources(0, Some(&empty_shader_resources));
            context.PSSetConstantBuffers(0, Some(&[None]));
            context.OMSetRenderTargets(None, None::<&ID3D11DepthStencilView>);
        }
    }

    #[allow(clippy::too_many_arguments)]
    unsafe fn draw_kawase_pass(
        &self,
        context: &ID3D11DeviceContext,
        source_srv: &ID3D11ShaderResourceView,
        source_width: u32,
        source_height: u32,
        target: &LiveDesktopShaderTexture,
        offset: f32,
        label: &str,
    ) -> Result<(), String> {
        let constants = LiveDesktopKawaseConstants {
            values0: [
                1.0 / source_width.max(1) as f32,
                1.0 / source_height.max(1) as f32,
                if offset.is_finite() { offset } else { 1.0 },
                0.0,
            ],
            values1: [0.0; 4],
            values2: [0.0; 4],
            values3: [0.0; 4],
        };
        unsafe {
            update_live_desktop_constant_buffer(
                context,
                &self.kawase_constants,
                &constants,
                "kawase constants",
            )?;
            self.draw_shader_resource_to_render_target(
                context,
                &[Some(source_srv.clone())],
                &self.kawase_pixel_shader,
                Some(&self.kawase_constants),
                &target.rtv,
                target.width,
                target.height,
            );
        }
        if target.width == 0 || target.height == 0 {
            return Err(format!("{label} kawase target has invalid size"));
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    unsafe fn draw_gaussian_pass(
        &self,
        context: &ID3D11DeviceContext,
        source_srv: &ID3D11ShaderResourceView,
        source_width: u32,
        source_height: u32,
        target: &LiveDesktopShaderTexture,
        sigma: f32,
        direction: [f32; 2],
        label: &str,
    ) -> Result<(), String> {
        let sigma = if sigma.is_finite() {
            sigma.max(0.001)
        } else {
            0.001
        };
        let radius = (sigma * 3.0).ceil().clamp(0.0, 32.0);
        let constants = LiveDesktopKawaseConstants {
            values0: [
                1.0 / source_width.max(1) as f32,
                1.0 / source_height.max(1) as f32,
                direction[0],
                direction[1],
            ],
            values1: [sigma, radius, 0.0, 0.0],
            values2: [0.0; 4],
            values3: [0.0; 4],
        };
        unsafe {
            update_live_desktop_constant_buffer(
                context,
                &self.kawase_constants,
                &constants,
                "gaussian constants",
            )?;
            self.draw_shader_resource_to_render_target(
                context,
                &[Some(source_srv.clone())],
                &self.gaussian_pixel_shader,
                Some(&self.kawase_constants),
                &target.rtv,
                target.width,
                target.height,
            );
        }
        if target.width == 0 || target.height == 0 {
            return Err(format!("{label} gaussian target has invalid size"));
        }
        Ok(())
    }

    unsafe fn draw_acrylic_pass(
        &self,
        context: &ID3D11DeviceContext,
        source_srv: &ID3D11ShaderResourceView,
        target: &LiveDesktopShaderTexture,
        acrylic: &LiveDesktopAcrylicEffectPlan,
        _label: &str,
    ) -> Result<(), String> {
        let constants = LiveDesktopAcrylicConstants {
            values0: [
                acrylic.alpha.clamp(0.0, 1.0),
                acrylic.saturation.clamp(0.4, 1.8),
                acrylic.contrast.clamp(0.6, 1.4),
                acrylic.brightness.clamp(0.4, 1.4),
            ],
            values1: [
                acrylic.tint_strength.clamp(0.0, 0.8),
                acrylic.noise.clamp(0.0, 0.08),
                if acrylic.seed.is_finite() {
                    acrylic.seed
                } else {
                    0.0
                },
                0.0,
            ],
            values2: [
                self.noise_texture.width.max(1) as f32,
                self.noise_texture.height.max(1) as f32,
                acrylic.tint_color[0].clamp(0.0, 1.0),
                acrylic.tint_color[1].clamp(0.0, 1.0),
            ],
            values3: [acrylic.tint_color[2].clamp(0.0, 1.0), 0.0, 0.0, 0.0],
        };
        unsafe {
            update_live_desktop_constant_buffer(
                context,
                &self.acrylic_constants,
                &constants,
                "acrylic constants",
            )?;
            self.draw_shader_resource_to_render_target(
                context,
                &[
                    Some(source_srv.clone()),
                    Some(self.noise_texture.srv.clone()),
                ],
                &self.acrylic_pixel_shader,
                Some(&self.acrylic_constants),
                &target.rtv,
                target.width,
                target.height,
            );
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
impl LiveDesktopShaderTexture {
    unsafe fn create(
        device: &ID3D11Device,
        width: u32,
        height: u32,
        label: &str,
    ) -> Result<Self, String> {
        let width = width.max(1);
        let height = height.max(1);
        let texture_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_SHADER_RESOURCE.0 | D3D11_BIND_RENDER_TARGET.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let mut texture = None;
        unsafe { device.CreateTexture2D(&texture_desc, None, Some(&mut texture)) }.map_err(
            |error| format!("CreateTexture2D({label} {width}x{height}) failed: {error}"),
        )?;
        let texture =
            texture.ok_or_else(|| format!("CreateTexture2D({label}) returned no texture"))?;
        let resource = texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("{label} texture resource cast failed: {error}"))?;
        let mut srv = None;
        unsafe { device.CreateShaderResourceView(&resource, None, Some(&mut srv)) }
            .map_err(|error| format!("CreateShaderResourceView({label}) failed: {error}"))?;
        let srv =
            srv.ok_or_else(|| format!("CreateShaderResourceView({label}) returned no view"))?;
        let mut rtv = None;
        unsafe { device.CreateRenderTargetView(&resource, None, Some(&mut rtv)) }
            .map_err(|error| format!("CreateRenderTargetView({label}) failed: {error}"))?;
        let rtv = rtv.ok_or_else(|| format!("CreateRenderTargetView({label}) returned no view"))?;
        Ok(Self {
            srv,
            rtv,
            width,
            height,
        })
    }
}

#[cfg(target_os = "windows")]
impl LiveDesktopShaderNoiseTexture {
    unsafe fn create(device: &ID3D11Device, size: u32, seed: u32) -> Result<Self, String> {
        let size = size.clamp(16, 512);
        let pixels = make_live_desktop_acrylic_noise_pixels(size, seed);
        let texture_desc = D3D11_TEXTURE2D_DESC {
            Width: size,
            Height: size,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let initial_data = D3D11_SUBRESOURCE_DATA {
            pSysMem: pixels.as_ptr() as *const std::ffi::c_void,
            SysMemPitch: size * 4,
            SysMemSlicePitch: 0,
        };
        let mut texture = None;
        unsafe { device.CreateTexture2D(&texture_desc, Some(&initial_data), Some(&mut texture)) }
            .map_err(|error| format!("CreateTexture2D(acrylic noise {size}x{size}) failed: {error}"))?;
        let texture = texture
            .ok_or_else(|| "CreateTexture2D(acrylic noise) returned no texture".to_string())?;
        let resource = texture
            .cast::<ID3D11Resource>()
            .map_err(|error| format!("Acrylic noise texture resource cast failed: {error}"))?;
        let mut srv = None;
        unsafe { device.CreateShaderResourceView(&resource, None, Some(&mut srv)) }
            .map_err(|error| format!("CreateShaderResourceView(acrylic noise) failed: {error}"))?;
        let srv = srv.ok_or_else(|| {
            "CreateShaderResourceView(acrylic noise) returned no view".to_string()
        })?;
        Ok(Self {
            srv,
            width: size,
            height: size,
        })
    }
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_shader_textures(
    device: &ID3D11Device,
    levels: &[(u32, u32)],
    label: &str,
) -> Result<Vec<LiveDesktopShaderTexture>, String> {
    let mut textures = Vec::with_capacity(levels.len());
    for (index, (width, height)) in levels.iter().copied().enumerate() {
        textures.push(unsafe {
            LiveDesktopShaderTexture::create(
                device,
                width,
                height,
                &format!("{label} level {index}"),
            )
        }?);
    }
    Ok(textures)
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_pixel_shader(
    device: &ID3D11Device,
    shader_bytes: &[u8],
    label: &str,
) -> Result<ID3D11PixelShader, String> {
    let mut pixel_shader = None;
    unsafe {
        device.CreatePixelShader(
            shader_bytes,
            None::<&ID3D11ClassLinkage>,
            Some(&mut pixel_shader),
        )
    }
    .map_err(|error| format!("CreatePixelShader({label}) failed: {error}"))?;
    pixel_shader.ok_or_else(|| format!("CreatePixelShader({label}) returned no shader"))
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_sampler(
    device: &ID3D11Device,
    filter: windows::Win32::Graphics::Direct3D11::D3D11_FILTER,
    label: &str,
) -> Result<ID3D11SamplerState, String> {
    let sampler_desc = D3D11_SAMPLER_DESC {
        Filter: filter,
        AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
        AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
        AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
        MipLODBias: 0.0,
        MaxAnisotropy: 1,
        ComparisonFunc: D3D11_COMPARISON_NEVER,
        BorderColor: [0.0, 0.0, 0.0, 0.0],
        MinLOD: 0.0,
        MaxLOD: D3D11_FLOAT32_MAX,
    };
    let mut sampler = None;
    unsafe { device.CreateSamplerState(&sampler_desc, Some(&mut sampler)) }
        .map_err(|error| format!("CreateSamplerState({label}) failed: {error}"))?;
    sampler.ok_or_else(|| format!("CreateSamplerState({label}) returned no sampler"))
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_constant_buffer<T>(
    device: &ID3D11Device,
    label: &str,
) -> Result<ID3D11Buffer, String> {
    let byte_width = (std::mem::size_of::<T>() as u32).div_ceil(16) * 16;
    let desc = D3D11_BUFFER_DESC {
        ByteWidth: byte_width.max(16),
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
        StructureByteStride: 0,
    };
    let mut buffer = None;
    unsafe { device.CreateBuffer(&desc, None, Some(&mut buffer)) }
        .map_err(|error| format!("CreateBuffer({label}) failed: {error}"))?;
    buffer.ok_or_else(|| format!("CreateBuffer({label}) returned no buffer"))
}

#[cfg(target_os = "windows")]
unsafe fn update_live_desktop_constant_buffer<T>(
    context: &ID3D11DeviceContext,
    buffer: &ID3D11Buffer,
    value: &T,
    label: &str,
) -> Result<(), String> {
    let resource = buffer
        .cast::<ID3D11Resource>()
        .map_err(|error| format!("{label} resource cast failed: {error}"))?;
    unsafe {
        context.UpdateSubresource(
            &resource,
            0,
            None,
            value as *const T as *const std::ffi::c_void,
            0,
            0,
        )
    };
    Ok(())
}

fn resolve_live_desktop_effect_render_size(
    width: u32,
    height: u32,
    effect_plan: Option<&LiveDesktopEffectPlan>,
) -> (u32, u32) {
    let width = width.max(1);
    let height = height.max(1);
    let max_width = effect_plan
        .map(|plan| plan.blur.render_max_width.max(1))
        .unwrap_or(960);
    let max_height = effect_plan
        .map(|plan| plan.blur.render_max_height.max(1))
        .unwrap_or(540);
    let scale = 1.0_f32
        .min(max_width as f32 / width as f32)
        .min(max_height as f32 / height as f32);
    (
        ((width as f32 * scale).round() as u32).max(1),
        ((height as f32 * scale).round() as u32).max(1),
    )
}

fn resolve_live_desktop_gaussian_sigma(radius_px: f32, render_axis: u32, target_axis: u32) -> f32 {
    let radius_px = if radius_px.is_finite() {
        radius_px.max(0.0)
    } else {
        0.0
    };
    (radius_px * render_axis.max(1) as f32 / target_axis.max(1) as f32).max(0.001)
}

fn create_live_desktop_dual_kawase_levels(
    width: u32,
    height: u32,
    pass_count: u32,
    min_size: u32,
) -> Vec<(u32, u32)> {
    let mut levels = Vec::new();
    let mut current_width = width.max(1);
    let mut current_height = height.max(1);
    let count = pass_count.max(1);
    let min_size = min_size.max(1);
    for _ in 0..count {
        current_width = current_width.div_ceil(2).max(min_size);
        current_height = current_height.div_ceil(2).max(min_size);
        levels.push((current_width, current_height));
        if current_width == min_size && current_height == min_size {
            break;
        }
    }
    levels
}

fn make_live_desktop_acrylic_noise_pixels(size: u32, seed: u32) -> Vec<u8> {
    let size = size.clamp(16, 512) as usize;
    let mut pixels = vec![0u8; size.saturating_mul(size).saturating_mul(4)];
    let mut state = seed.wrapping_add(0x9e3779b9);
    for offset in (0..pixels.len()).step_by(4) {
        state = state.wrapping_add(0x6d2b79f5);
        let mut value = state;
        value = (value ^ (value >> 15)).wrapping_mul(value | 1);
        value ^= value.wrapping_add((value ^ (value >> 7)).wrapping_mul(value | 61));
        let sample = ((value ^ (value >> 14)) >> 24) as u8;
        pixels[offset] = sample;
        pixels[offset + 1] = sample;
        pixels[offset + 2] = sample;
        pixels[offset + 3] = 255;
    }
    pixels
}

#[cfg(target_os = "windows")]
unsafe fn compile_live_desktop_shader(
    source: &str,
    entry_point: PCSTR,
    target: PCSTR,
    label: &str,
) -> Result<ID3DBlob, String> {
    let mut code = None;
    let mut errors = None;
    let result = unsafe {
        D3DCompile(
            source.as_ptr() as *const std::ffi::c_void,
            source.len(),
            s!("live_desktop_shader"),
            None,
            None::<&ID3DInclude>,
            entry_point,
            target,
            D3DCOMPILE_ENABLE_STRICTNESS | D3DCOMPILE_OPTIMIZATION_LEVEL1,
            0,
            &mut code,
            Some(&mut errors),
        )
    };
    match result {
        Ok(()) => code.ok_or_else(|| format!("D3DCompile({label}) returned no blob")),
        Err(error) => {
            let message = errors
                .as_ref()
                .map(|blob| unsafe { live_desktop_d3d_blob_string(blob) })
                .filter(|message| !message.is_empty())
                .unwrap_or_else(|| "no compiler diagnostics".to_string());
            Err(format!("D3DCompile({label}) failed: {error}; {message}"))
        }
    }
}

#[cfg(target_os = "windows")]
unsafe fn live_desktop_d3d_blob_bytes(blob: &ID3DBlob) -> &[u8] {
    unsafe {
        std::slice::from_raw_parts(blob.GetBufferPointer() as *const u8, blob.GetBufferSize())
    }
}

#[cfg(target_os = "windows")]
unsafe fn live_desktop_d3d_blob_string(blob: &ID3DBlob) -> String {
    let bytes = unsafe { live_desktop_d3d_blob_bytes(blob) };
    String::from_utf8_lossy(bytes)
        .trim_matches(char::from(0))
        .trim()
        .to_string()
}

#[cfg(target_os = "windows")]
impl LiveDesktopCompositionHost {
    unsafe fn create(owner_hwnd: HWND) -> Result<Self, String> {
        let Some((width, height)) = (unsafe { read_live_desktop_window_client_size(owner_hwnd) })
        else {
            return Err(format!(
                "Could not read launchpad WebView client size for {}",
                format_live_desktop_window_handle(owner_hwnd)
            ));
        };
        Ok(Self {
            owner_hwnd,
            target_hwnd: owner_hwnd,
            target_rect: LiveDesktopWindowRect {
                left: 0,
                top: 0,
                right: width as i32,
                bottom: height as i32,
                width: width as i32,
                height: height as i32,
            },
            detail: format!(
                "host=webviewTarget target={} targetSize={}x{}",
                format_live_desktop_window_handle(owner_hwnd),
                width,
                height
            ),
        })
    }

    fn target_hwnd(&self) -> HWND {
        self.target_hwnd
    }

    fn target_size(&self) -> (u32, u32) {
        (
            self.target_rect.width.max(1) as u32,
            self.target_rect.height.max(1) as u32,
        )
    }

    fn detail(&self) -> &str {
        &self.detail
    }

    unsafe fn sync_to_owner_rect(&mut self) -> Result<bool, String> {
        let Some((width, height)) =
            (unsafe { read_live_desktop_window_client_size(self.owner_hwnd) })
        else {
            return Ok(false);
        };
        let rect = LiveDesktopWindowRect {
            left: 0,
            top: 0,
            right: width as i32,
            bottom: height as i32,
            width: width as i32,
            height: height as i32,
        };
        if self.target_rect == rect {
            return Ok(false);
        }
        self.target_rect = rect;
        self.detail = format!(
            "host=webviewTarget target={} targetSize={}x{}",
            format_live_desktop_window_handle(self.owner_hwnd),
            width,
            height
        );
        Ok(true)
    }

    unsafe fn set_visible(&mut self, _visible: bool) -> Result<(), String> {
        Ok(())
    }
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
    pixel_probe_samples: u64,
    pixel_probe_errors: u64,
    blank_frame_skips: u64,
    abandoned_renderer_workers: u64,
    reaped_abandoned_renderer_workers: u64,
    last_pixel_probe_width: u32,
    last_pixel_probe_height: u32,
    last_pixel_probe_min_rgb: u32,
    last_pixel_probe_max_rgb: u32,
    last_pixel_probe_avg_rgb: u32,
    last_pixel_probe_min_alpha: u32,
    last_pixel_probe_max_alpha: u32,
    last_pixel_probe_avg_alpha: u32,
    last_abandoned_renderer_reason: String,
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
    #[serde(default = "default_live_desktop_opacity")]
    opacity: u32,
    #[serde(default)]
    effect_plan: Option<LiveDesktopEffectPlan>,
    acrylic_appearance: LiveDesktopAcrylicAppearance,
    acrylic_params: LiveDesktopAcrylicParams,
    #[serde(default = "default_live_desktop_disable_mouse_relay")]
    disable_mouse_relay: bool,
    #[serde(default)]
    skip_blank_frames: bool,
    #[serde(default)]
    force_dwm_flush: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum LiveDesktopBackgroundEffect {
    None,
    Dimmed,
    Blur,
    AcrylicWebgl,
}

#[allow(dead_code)]
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveDesktopEffectPlan {
    effect: LiveDesktopBackgroundEffect,
    opacity: f32,
    blur: LiveDesktopBlurEffectPlan,
    acrylic: LiveDesktopAcrylicEffectPlan,
}

#[allow(dead_code)]
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveDesktopBlurEffectPlan {
    #[serde(default)]
    kernel: LiveDesktopBlurKernel,
    #[serde(default)]
    gaussian_radius_px: f32,
    strength: u32,
    render_max_width: u32,
    render_max_height: u32,
    pass_count: u32,
    min_size: u32,
    offset_scale: f32,
    down_offsets: Vec<f32>,
    up_offsets: Vec<f32>,
    final_up_offset: f32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum LiveDesktopBlurKernel {
    #[default]
    DualKawase,
    Gaussian,
}

#[allow(dead_code)]
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveDesktopAcrylicEffectPlan {
    brightness: f32,
    contrast: f32,
    noise: f32,
    saturation: f32,
    seed: f32,
    tint_color: [f32; 3],
    tint_strength: f32,
    alpha: f32,
    enabled: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum LiveDesktopDiagnosticMode {
    #[default]
    WallpaperEnginePopupCapture,
    TestPattern,
}

fn default_live_desktop_disable_mouse_relay() -> bool {
    true
}

fn default_live_desktop_opacity() -> u32 {
    100
}

impl LiveDesktopDiagnosticMode {
    fn uses_window_capture(&self) -> bool {
        matches!(self, Self::WallpaperEnginePopupCapture)
    }

    fn window_capture_label(&self) -> &'static str {
        "Wallpaper Engine popup WGC"
    }

    fn window_capture_unavailable_reason(&self) -> &'static str {
        "wallpaperEnginePopupCaptureUnavailable"
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
            diagnostic_mode: LiveDesktopDiagnosticMode::WallpaperEnginePopupCapture,
            blur_strength: 50,
            darken_strength: 28,
            darken_color: "#1c1c1c".to_string(),
            opacity: default_live_desktop_opacity(),
            effect_plan: None,
            acrylic_appearance: LiveDesktopAcrylicAppearance::System,
            acrylic_params: LiveDesktopAcrylicParams::default(),
            disable_mouse_relay: default_live_desktop_disable_mouse_relay(),
            skip_blank_frames: false,
            force_dwm_flush: false,
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
        #[cfg(not(target_os = "windows"))]
        let _ = cleanup_timeout;
        self.reap_abandoned_renderer_workers();
        if self.status.is_stopped() {
            return self.status();
        }
        let generation = self.status.generation + 1;
        if let Some(mut session) = self.renderer_session.take() {
            #[cfg(target_os = "windows")]
            if let Some(worker) = session.stop_and_maybe_abandon(cleanup_timeout) {
                self.register_abandoned_renderer_worker(generation, worker);
            }
        }
        self.status = LiveDesktopRuntimeStatus::stopped(generation);
        self.status()
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

        let generation = self.status.generation + 1;
        self.status = LiveDesktopRuntimeStatus::starting(generation);

        if !prerequisite_probe.supports_d3d11 {
            self.status = LiveDesktopRuntimeStatus::failed(
                generation,
                prerequisite_probe.reason,
                prerequisite_probe.detail,
            );
            return self.status();
        }

        let renderer_session = match make_renderer_session() {
            Ok(session) => session,
            Err(failure) => {
                let LiveDesktopRendererStartupFailure {
                    probe,
                    #[cfg(target_os = "windows")]
                    abandoned_worker,
                } = failure;
                #[cfg(target_os = "windows")]
                if let Some(worker) = abandoned_worker {
                    self.register_abandoned_renderer_worker(generation, worker);
                }
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
        self.renderer_session = Some(renderer_session);
        self.status = LiveDesktopRuntimeStatus::running(generation, renderer_probe.detail);
        self.status()
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

        let renderer_probe = {
            let deadline =
                Instant::now() + Duration::from_millis(LIVE_DESKTOP_RENDERER_INIT_TIMEOUT_MS);
            let mut last_progress = "Renderer worker has not reported progress yet".to_string();
            loop {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    return Err(cancel_live_desktop_renderer_startup_after_timeout(
                        &stop_sender,
                        exit_receiver,
                        worker,
                        &startup_cancel,
                        &last_progress,
                        Duration::from_millis(LIVE_DESKTOP_RENDERER_STARTUP_CANCEL_JOIN_TIMEOUT_MS),
                    ));
                }
                match ready_receiver.recv_timeout(remaining) {
                    Ok(LiveDesktopRendererStartupMessage::Ready(probe)) => break probe,
                    Ok(LiveDesktopRendererStartupMessage::Failed(probe)) => {
                        let _ = worker.join();
                        return Err(probe.into());
                    }
                    Ok(LiveDesktopRendererStartupMessage::Progress(progress)) => {
                        last_progress = progress;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        return Err(cancel_live_desktop_renderer_startup_after_timeout(
                            &stop_sender,
                            exit_receiver,
                            worker,
                            &startup_cancel,
                            &last_progress,
                            Duration::from_millis(
                                LIVE_DESKTOP_RENDERER_STARTUP_CANCEL_JOIN_TIMEOUT_MS,
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
                        )
                        .into());
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
        Some(LiveDesktopAbandonedRendererWorker {
            worker: Some(worker),
            reason: "nativeRendererStopTimedOut",
            detail,
            generation: 0,
        })
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

    match exit_receiver.recv_timeout(cleanup_timeout) {
        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => {
            let _ = worker.join();
            detail.push_str("; cleanup=joined");
            LiveDesktopRendererProbe::unavailable("nativeRendererInitializationTimedOut", detail)
                .into()
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            detail.push_str("; cleanup=abandonedWorker");
            LiveDesktopRendererStartupFailure {
                probe: LiveDesktopRendererProbe::unavailable(
                    "nativeRendererInitializationTimedOut",
                    detail.clone(),
                ),
                abandoned_worker: Some(LiveDesktopAbandonedRendererWorker {
                    worker: Some(worker),
                    reason: "nativeRendererInitializationTimedOut",
                    detail,
                    generation: 0,
                }),
            }
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

    fn wait_for_window_capture_frame_or_stop(
        &mut self,
        stop_receiver: &mpsc::Receiver<()>,
    ) -> bool {
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
            if let Err(error) = unsafe { self.set_visual_visible(visible) } {
                record_live_desktop_config_error(&self.diagnostics, &error);
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

    unsafe fn copy_next_frame_to_surface(&mut self) -> Result<bool, String> {
        match unsafe { self.host_window.sync_to_owner_rect() } {
            Ok(true) => {
                if let Err(error) = unsafe { self.apply_current_visual_placement() } {
                    record_live_desktop_config_error(&self.diagnostics, &error);
                }
            }
            Ok(false) => {}
            Err(error) => record_live_desktop_config_error(&self.diagnostics, &error),
        }
        if self.config.diagnostic_mode == LiveDesktopDiagnosticMode::TestPattern {
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
            if copied_frame.is_none() {
                if live_desktop_blank_frame_skip_count(&self.diagnostics)
                    == blank_frame_skips_before
                {
                    record_live_desktop_frame_timeout(&self.diagnostics);
                }
                return Ok(false);
            }
            record_live_desktop_frame_copy_duration(&self.diagnostics, copy_started.elapsed());
            let frame_probe = copied_frame.expect("checked copied WGC frame");
            let commit_started = Instant::now();
            if let Err(detail) = unsafe { self.present_and_commit_composition() } {
                record_live_desktop_commit_error(&self.diagnostics, &detail);
                return Err(detail);
            }
            record_live_desktop_frame_commit_duration(&self.diagnostics, commit_started.elapsed());
            record_live_desktop_frame_copied(&self.diagnostics, &frame_probe);
            return Ok(true);
        }

        Ok(false)
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
    fn starting(generation: u64) -> Self {
        Self {
            phase: "starting",
            active: false,
            generation,
            reason: "starting",
            detail: "Live desktop runtime start requested".to_string(),
            diagnostics: LiveDesktopRuntimeDiagnostics::default(),
            window_diagnostics: live_desktop_window_diagnostics(),
        }
    }

    fn running(generation: u64, renderer_detail: String) -> Self {
        Self {
            phase: "running",
            active: true,
            generation,
            reason: "running",
            detail: format!("Live desktop runtime is running: {renderer_detail}"),
            diagnostics: LiveDesktopRuntimeDiagnostics::default(),
            window_diagnostics: live_desktop_window_diagnostics(),
        }
    }

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

    fn is_stopped(&self) -> bool {
        self.phase == "stopped"
    }

    fn is_starting_or_running(&self) -> bool {
        matches!(self.phase, "starting" | "running")
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
            format!("pixelProbeSamples={}", self.pixel_probe_samples),
            format!("pixelProbeErrors={}", self.pixel_probe_errors),
            format!("blankFrameSkips={}", self.blank_frame_skips),
            format!(
                "abandonedRendererWorkers={}",
                self.abandoned_renderer_workers
            ),
            format!(
                "reapedAbandonedRendererWorkers={}",
                self.reaped_abandoned_renderer_workers
            ),
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
        if self.pixel_probe_samples > 0 {
            parts.push(format!(
                "lastPixelProbe={}x{} rgb min {} max {} avg {} alpha min {} max {} avg {}",
                self.last_pixel_probe_width,
                self.last_pixel_probe_height,
                self.last_pixel_probe_min_rgb,
                self.last_pixel_probe_max_rgb,
                self.last_pixel_probe_avg_rgb,
                self.last_pixel_probe_min_alpha,
                self.last_pixel_probe_max_alpha,
                self.last_pixel_probe_avg_alpha
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
        if !self.last_abandoned_renderer_reason.is_empty() {
            parts.push(format!(
                "lastAbandonedRenderer={}",
                self.last_abandoned_renderer_reason
            ));
        }
        parts.join(", ")
    }

    fn has_abandoned_renderer_activity(&self) -> bool {
        self.abandoned_renderer_workers > 0
            || self.reaped_abandoned_renderer_workers > 0
            || !self.last_abandoned_renderer_reason.is_empty()
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
            "Live desktop window diagnostics are only available on Windows".to_string(),
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
    output_context: &LiveDesktopOutputContext,
) -> LiveDesktopWallpaperEnginePopupPlan {
    LiveDesktopWallpaperEnginePopupPlan {
        window_name: format!(
            "LaunchPad::LiveDesktop::display{}::{}x{}",
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
) -> &'static str {
    if let Some(capture) = window_capture {
        capture.source_label
    } else {
        "Test Pattern"
    }
}

#[cfg(target_os = "windows")]
fn live_desktop_frame_source_detail<'a>(
    window_capture: Option<&'a LiveDesktopWindowCapture>,
    fallback: &'a str,
) -> &'a str {
    window_capture
        .map(|capture| capture.detail.as_str())
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
fn should_probe_live_desktop_pixels(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) -> bool {
    diagnostics
        .lock()
        .map(|diagnostics| diagnostics.frames_copied % 30 == 0)
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn live_desktop_blank_frame_skip_count(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) -> u64 {
    diagnostics
        .lock()
        .map(|diagnostics| diagnostics.blank_frame_skips)
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn record_live_desktop_pixel_probe(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    probe: &LiveDesktopPixelProbe,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.pixel_probe_samples += 1;
        diagnostics.last_pixel_probe_width = probe.width;
        diagnostics.last_pixel_probe_height = probe.height;
        diagnostics.last_pixel_probe_min_rgb = probe.min_rgb;
        diagnostics.last_pixel_probe_max_rgb = probe.max_rgb;
        diagnostics.last_pixel_probe_avg_rgb = probe.avg_rgb;
        diagnostics.last_pixel_probe_min_alpha = probe.min_alpha;
        diagnostics.last_pixel_probe_max_alpha = probe.max_alpha;
        diagnostics.last_pixel_probe_avg_alpha = probe.avg_alpha;
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_pixel_probe_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.pixel_probe_errors += 1;
        diagnostics.last_error = detail.to_string();
    });
}

#[cfg(target_os = "windows")]
fn record_live_desktop_blank_frame_skipped(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    probe: &LiveDesktopPixelProbe,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.blank_frame_skips += 1;
        diagnostics.last_error = format!(
            "Skipped suspected blank WGC frame: {}x{} rgb max {} avg {} alpha max {} avg {}",
            probe.width,
            probe.height,
            probe.max_rgb,
            probe.avg_rgb,
            probe.max_alpha,
            probe.avg_alpha
        );
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
        let window_capture = if config.diagnostic_mode.uses_window_capture() {
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

        let frame_source_detail = if config.diagnostic_mode.uses_window_capture() {
            "frameSource=wgc".to_string()
        } else if config.diagnostic_mode == LiveDesktopDiagnosticMode::TestPattern {
            "frameSource=testPattern".to_string()
        } else {
            "frameSource=unknown".to_string()
        };

        return Ok(LiveDesktopRendererStartup {
            renderer_probe: LiveDesktopRendererProbe::native_renderer_available_for_window(
                supports_native_effects,
                format!(
                    "{} frame pump initialized with {initial_frame_detail} and DirectComposition target/root swap chain source {}x{} -> target {}x{} scale {:.3} offset {:.1},{:.1} on adapter {adapter_index} ({adapter_name}), output {} ({}), monitor matched: {}; native effects available: {}; {}; {}; {}; {}; {}",
                    live_desktop_frame_source_label(window_capture.as_ref()),
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
                    live_desktop_frame_source_detail(
                        window_capture.as_ref(),
                        last_detail.as_str()
                    ),
                    native_effects.detail,
                    frame_source_detail,
                    shader_pipeline_detail
                ),
            ),
            resources: LiveDesktopRendererResources {
                config,
                diagnostics,
                test_pattern: LiveDesktopTestPatternState::default(),
                source_width,
                source_height,
                _com: com,
                _d3d_device: d3d.device,
                _d3d_context: d3d.context,
                _window_capture: window_capture,
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
    let capture_label =
        LiveDesktopDiagnosticMode::WallpaperEnginePopupCapture.window_capture_label();
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
                None,
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
fn make_live_desktop_test_pattern_pixels(width: u32, height: u32) -> Vec<u8> {
    let width_usize = width as usize;
    let height_usize = height as usize;
    let mut pixels = vec![0u8; width_usize.saturating_mul(height_usize).saturating_mul(4)];
    let cell = (width.min(height) / 12).max(24) as usize;
    let dark = [28, 28, 28, 255];
    let light = [214, 214, 214, 255];
    let accent = [255, 255, 0, 255];

    for y in 0..height_usize {
        for x in 0..width_usize {
            let checker = ((x / cell) + (y / cell)) % 2 == 0;
            let color = if checker { light } else { dark };
            set_live_desktop_test_pattern_pixel(&mut pixels, width_usize, x, y, color);
        }
    }

    let corner = (width.min(height) / 7).max(72) as usize;
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        0,
        0,
        corner,
        corner,
        [64, 0, 255, 255],
    );
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        width_usize.saturating_sub(corner),
        0,
        corner,
        corner,
        [48, 220, 0, 255],
    );
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        0,
        height_usize.saturating_sub(corner),
        corner,
        corner,
        [255, 80, 16, 255],
    );
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        width_usize.saturating_sub(corner),
        height_usize.saturating_sub(corner),
        corner,
        corner,
        [0, 220, 255, 255],
    );

    let bar_width = (width_usize / 24).max(18);
    let bar_x = width_usize / 5;
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        bar_x,
        0,
        bar_width.min(width_usize.saturating_sub(bar_x)),
        height_usize,
        [255, 255, 255, 255],
    );

    let cross = (width.min(height) / 180).max(4) as usize;
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        (width_usize / 2).saturating_sub(cross / 2),
        0,
        cross,
        height_usize,
        accent,
    );
    fill_live_desktop_test_pattern_rect(
        &mut pixels,
        width_usize,
        height_usize,
        0,
        (height_usize / 2).saturating_sub(cross / 2),
        width_usize,
        cross,
        accent,
    );

    draw_live_desktop_test_pattern_counter(&mut pixels, width_usize, height_usize, 0);
    draw_live_desktop_test_pattern_binary_bar(&mut pixels, width_usize, height_usize);
    pixels
}

#[cfg(target_os = "windows")]
fn set_live_desktop_test_pattern_pixel(
    pixels: &mut [u8],
    width: usize,
    x: usize,
    y: usize,
    color: [u8; 4],
) {
    let offset = y.saturating_mul(width).saturating_add(x).saturating_mul(4);
    if offset + 3 >= pixels.len() {
        return;
    }
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
}

#[cfg(target_os = "windows")]
fn fill_live_desktop_test_pattern_rect(
    pixels: &mut [u8],
    width: usize,
    height: usize,
    left: usize,
    top: usize,
    rect_width: usize,
    rect_height: usize,
    color: [u8; 4],
) {
    let right = left.saturating_add(rect_width).min(width);
    let bottom = top.saturating_add(rect_height).min(height);
    for y in top..bottom {
        for x in left..right {
            set_live_desktop_test_pattern_pixel(pixels, width, x, y, color);
        }
    }
}

#[cfg(target_os = "windows")]
fn draw_live_desktop_test_pattern_counter(
    pixels: &mut [u8],
    width: usize,
    height: usize,
    value: u64,
) {
    let text = format!("{value:05}");
    let scale = (width.min(height) / 72).max(5);
    let digit_width = scale * 5;
    let gap = scale * 2;
    let total_width = text.len() * digit_width + text.len().saturating_sub(1) * gap;
    let start_x = width.saturating_sub(total_width) / 2;
    let start_y = (height / 9).min(height.saturating_sub(scale * 11));
    fill_live_desktop_test_pattern_rect(
        pixels,
        width,
        height,
        start_x.saturating_sub(scale),
        start_y.saturating_sub(scale),
        total_width + scale * 2,
        scale * 11,
        [0, 0, 0, 220],
    );
    for (index, digit) in text.bytes().enumerate() {
        draw_live_desktop_test_pattern_digit(
            pixels,
            width,
            height,
            (digit - b'0') as usize,
            start_x + index * (digit_width + gap),
            start_y,
            scale,
            [255, 255, 255, 255],
        );
    }
}

#[cfg(target_os = "windows")]
fn draw_live_desktop_test_pattern_digit(
    pixels: &mut [u8],
    width: usize,
    height: usize,
    digit: usize,
    x: usize,
    y: usize,
    scale: usize,
    color: [u8; 4],
) {
    const SEGMENTS: [[bool; 7]; 10] = [
        [true, true, true, true, true, true, false],
        [false, true, true, false, false, false, false],
        [true, true, false, true, true, false, true],
        [true, true, true, true, false, false, true],
        [false, true, true, false, false, true, true],
        [true, false, true, true, false, true, true],
        [true, false, true, true, true, true, true],
        [true, true, true, false, false, false, false],
        [true, true, true, true, true, true, true],
        [true, true, true, true, false, true, true],
    ];
    let Some(segments) = SEGMENTS.get(digit) else {
        return;
    };
    let thickness = scale.max(2);
    let long = scale * 5;
    let short = scale * 4;
    let segment_rects = [
        (x, y, long, thickness),
        (x + long - thickness, y, thickness, short),
        (x + long - thickness, y + short, thickness, short),
        (x, y + short * 2, long, thickness),
        (x, y + short, thickness, short),
        (x, y, thickness, short),
        (x, y + short, long, thickness),
    ];
    for (enabled, rect) in segments.iter().zip(segment_rects) {
        if *enabled {
            fill_live_desktop_test_pattern_rect(
                pixels, width, height, rect.0, rect.1, rect.2, rect.3, color,
            );
        }
    }
}

#[cfg(target_os = "windows")]
fn draw_live_desktop_test_pattern_binary_bar(pixels: &mut [u8], width: usize, height: usize) {
    let bits = 16usize;
    let gap = (width / 260).max(2);
    let bar_width = ((width / 3).max(bits * 8) - gap * (bits - 1)) / bits;
    let bar_height = (height / 28).max(14);
    let total_width = bits * bar_width + (bits - 1) * gap;
    let start_x = width.saturating_sub(total_width) / 2;
    let y = height.saturating_sub(bar_height * 2);
    for bit in 0..bits {
        let enabled = bit % 2 == 0;
        fill_live_desktop_test_pattern_rect(
            pixels,
            width,
            height,
            start_x + bit * (bar_width + gap),
            y,
            bar_width,
            bar_height,
            if enabled {
                [32, 255, 255, 255]
            } else {
                [24, 24, 24, 255]
            },
        );
    }
}

#[cfg(target_os = "windows")]
unsafe fn draw_live_desktop_test_pattern_to_composition_surface(
    swap_chain: &LiveDesktopCompositionSwapChain,
    context: &ID3D11DeviceContext,
    _state: &mut LiveDesktopTestPatternState,
) -> Result<LiveDesktopFrameProbe, String> {
    let target_texture = unsafe { swap_chain.back_buffer("Test pattern") }?;
    let mut desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { target_texture.GetDesc(&mut desc) };
    if desc.Width == 0 || desc.Height == 0 {
        return Err("Test pattern target texture has invalid size".to_string());
    }
    let target_resource = target_texture
        .cast::<ID3D11Resource>()
        .map_err(|error| format!("Test pattern target texture resource cast failed: {error}"))?;
    let pixels = make_live_desktop_test_pattern_pixels(desc.Width, desc.Height);
    unsafe {
        context.UpdateSubresource(
            &target_resource,
            0,
            None,
            pixels.as_ptr() as *const std::ffi::c_void,
            desc.Width * 4,
            0,
        )
    };

    Ok(LiveDesktopFrameProbe {
        supports_frame_texture: true,
        width: desc.Width,
        height: desc.Height,
        format: desc.Format.0,
        reason: "testPattern",
        detail: format!(
            "Drew DirectComposition swap chain static test pattern {}x{} format {}",
            desc.Width, desc.Height, desc.Format.0
        ),
    })
}

#[cfg(target_os = "windows")]
unsafe fn apply_live_desktop_config_to_effects(
    blur_effect: Option<&IDCompositionGaussianBlurEffect>,
    color_matrix_effect: Option<&IDCompositionColorMatrixEffect>,
    config: &LiveDesktopRuntimeConfig,
    apply_opacity_in_color_matrix: bool,
    suppress_native_effects: bool,
) -> Result<(), String> {
    if let Some(blur_effect) = blur_effect {
        unsafe { blur_effect.SetBorderMode(D2D1_BORDER_MODE_HARD) }
            .map_err(|error| error.to_string())?;
        let standard_deviation = if suppress_native_effects {
            0.0
        } else {
            resolve_live_desktop_blur_standard_deviation(config)
        };
        unsafe { blur_effect.SetStandardDeviation2(standard_deviation) }
            .map_err(|error| error.to_string())?;
    }
    if let Some(color_matrix_effect) = color_matrix_effect {
        unsafe {
            apply_live_desktop_config_to_color_matrix(
                color_matrix_effect,
                config,
                apply_opacity_in_color_matrix,
                suppress_native_effects,
            )
        }?;
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

fn resolve_live_desktop_opacity(config: &LiveDesktopRuntimeConfig) -> f32 {
    config.opacity.min(100) as f32 / 100.0
}

#[cfg(target_os = "windows")]
unsafe fn apply_live_desktop_visual_opacity(
    visual3: Option<&IDCompositionVisual3>,
    config: &LiveDesktopRuntimeConfig,
) -> Result<(), String> {
    if let Some(visual3) = visual3 {
        unsafe { visual3.SetOpacity2(resolve_live_desktop_opacity(config)) }
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
unsafe fn apply_live_desktop_config_to_color_matrix(
    effect: &IDCompositionColorMatrixEffect,
    config: &LiveDesktopRuntimeConfig,
    apply_opacity_in_color_matrix: bool,
    suppress_color_effect: bool,
) -> Result<(), String> {
    let mut matrix = if suppress_color_effect {
        live_desktop_identity_color_matrix()
    } else {
        resolve_live_desktop_color_matrix(config)
    };
    if apply_opacity_in_color_matrix {
        matrix[3][3] *= resolve_live_desktop_opacity(config);
    }
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
unsafe fn create_live_desktop_composition_device(
    dxgi_device: &IDXGIDevice,
    adapter_index: u32,
    phase: &str,
) -> Result<(LiveDesktopCompositionDevice, LiveDesktopNativeEffects), String> {
    match unsafe { DCompositionCreateDevice3::<_, IDCompositionDesktopDevice>(dxgi_device) } {
        Ok(device) => {
            let native_effects =
                unsafe { create_live_desktop_native_effects(&device, adapter_index, phase) };
            Ok((
                LiveDesktopCompositionDevice::Desktop(device),
                native_effects,
            ))
        }
        Err(device3_error) => {
            let legacy_device =
                unsafe { DCompositionCreateDevice::<_, IDCompositionDevice>(dxgi_device) }
                    .map_err(|legacy_error| {
                        format!(
                            "DCompositionCreateDevice3<IDCompositionDesktopDevice> failed during {phase} on adapter {adapter_index}: {device3_error}; legacy DCompositionCreateDevice<IDCompositionDevice> fallback failed: {legacy_error}"
                        )
                    })?;
            Ok((
                LiveDesktopCompositionDevice::Legacy(legacy_device),
                LiveDesktopNativeEffects {
                    color_matrix_effect: None,
                    blur_effect: None,
                    detail: format!(
                        "Native DirectComposition effects unavailable during {phase} on adapter {adapter_index}: DCompositionCreateDevice3<IDCompositionDesktopDevice> failed: {device3_error}; using legacy DCompositionCreateDevice fallback"
                    ),
                },
            ))
        }
    }
}

#[cfg(target_os = "windows")]
unsafe fn probe_live_desktop_composition_swap_chain(
    factory: &IDXGIFactory1,
    d3d_device: &ID3D11Device,
    composition_device: &LiveDesktopCompositionDevice,
    adapter_index: u32,
) -> Result<String, String> {
    let swap_chain =
        unsafe { LiveDesktopCompositionSwapChain::create(factory, d3d_device, 16, 16) }.map_err(
            |error| {
                format!(
                    "DirectComposition swap chain probe failed on adapter {adapter_index}: {error}"
                )
            },
        )?;
    let visual = unsafe { composition_device.create_visual() }.map_err(|error| {
        format!("CreateVisual failed during swap chain probe on adapter {adapter_index}: {error}")
    })?;
    unsafe { visual.SetContent(&swap_chain.swap_chain) }.map_err(|error| {
        format!(
            "visual.SetContent(swapChain) failed during probe on adapter {adapter_index}: {error}"
        )
    })?;
    unsafe { composition_device.commit() }.map_err(|error| {
        format!("DirectComposition commit failed during swap chain probe on adapter {adapter_index}: {error}")
    })?;
    Ok("composition swap chain probe succeeded".to_string())
}

#[cfg(target_os = "windows")]
unsafe fn create_live_desktop_native_effects(
    device: &IDCompositionDesktopDevice,
    adapter_index: u32,
    phase: &str,
) -> LiveDesktopNativeEffects {
    let device3 = match device.cast::<IDCompositionDevice3>() {
        Ok(device) => device,
        Err(error) => {
            return LiveDesktopNativeEffects {
                color_matrix_effect: None,
                blur_effect: None,
                detail: format!(
                    "Native DirectComposition effects unavailable during {phase} on adapter {adapter_index}: IDCompositionDesktopDevice cast to IDCompositionDevice3 failed: {error}"
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
    device: &LiveDesktopCompositionDevice,
    target: &IDCompositionTarget,
    visual: &IDCompositionVisual,
    swap_chain: &IDXGISwapChain1,
    blur_effect: &Option<IDCompositionGaussianBlurEffect>,
    effect: &Option<IDCompositionColorMatrixEffect>,
    visual3: Option<&IDCompositionVisual3>,
    config: &LiveDesktopRuntimeConfig,
    placement: &LiveDesktopVisualPlacement,
) -> Result<IDCompositionScaleTransform, String> {
    let scale_transform = unsafe { device.create_scale_transform() }.map_err(|error| {
        format!("CreateScaleTransform failed while placing live desktop visual: {error}")
    })?;
    unsafe { apply_direct_composition_visual_placement(visual, &scale_transform, placement) }?;
    unsafe { visual.SetContent(swap_chain) }.map_err(|error| {
        format!("DirectComposition visual.SetContent(swapChain) failed: {error}")
    })?;
    unsafe { apply_live_desktop_visual_opacity(visual3, config) }
        .map_err(|error| format!("DirectComposition visual.SetOpacity failed: {error}"))?;
    if let Some(effect) = effect {
        if let Some(blur_effect) = blur_effect {
            unsafe { effect.SetInput(0, blur_effect, 0) }.map_err(|error| {
                format!("DirectComposition colorMatrix.SetInput(blurEffect) failed: {error}")
            })?;
        }
        unsafe { visual.SetEffect(effect) }.map_err(|error| {
            format!("DirectComposition visual.SetEffect(colorMatrix) failed: {error}")
        })?;
    }
    unsafe { target.SetRoot(visual) }
        .map_err(|error| format!("DirectComposition target.SetRoot failed: {error}"))?;
    unsafe { device.commit() }
        .map_err(|error| format!("DirectComposition initial commit failed: {error}"))?;
    Ok(scale_transform)
}

#[cfg(target_os = "windows")]
unsafe fn apply_direct_composition_visual_placement(
    visual: &IDCompositionVisual,
    scale_transform: &IDCompositionScaleTransform,
    placement: &LiveDesktopVisualPlacement,
) -> Result<(), String> {
    unsafe { scale_transform.SetCenterX2(0.0) }.map_err(|error| error.to_string())?;
    unsafe { scale_transform.SetCenterY2(0.0) }.map_err(|error| error.to_string())?;
    unsafe { scale_transform.SetScaleX2(placement.scale) }.map_err(|error| error.to_string())?;
    unsafe { scale_transform.SetScaleY2(placement.scale) }.map_err(|error| error.to_string())?;
    unsafe { visual.SetOffsetX2(placement.offset_x) }.map_err(|error| error.to_string())?;
    unsafe { visual.SetOffsetY2(placement.offset_y) }.map_err(|error| error.to_string())?;
    unsafe { visual.SetTransform(scale_transform) }.map_err(|error| error.to_string())?;
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
            opacity: 1.0,
            blur: LiveDesktopBlurEffectPlan {
                kernel: LiveDesktopBlurKernel::DualKawase,
                gaussian_radius_px: 4.0,
                strength: 72,
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
    fn live_desktop_diagnostic_defaults_to_wallpaper_engine_popup() {
        let config = LiveDesktopRuntimeConfig::default();

        assert_eq!(
            config.diagnostic_mode,
            LiveDesktopDiagnosticMode::WallpaperEnginePopupCapture
        );
        assert!(config.diagnostic_mode.uses_window_capture());
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
        assert!((effect_plan.opacity - 0.37).abs() < 0.001);
        assert_eq!(effect_plan.blur.kernel, LiveDesktopBlurKernel::Gaussian);
        assert!((effect_plan.blur.gaussian_radius_px - 20.0).abs() < 0.001);
        assert_eq!(effect_plan.blur.strength, 72);
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
