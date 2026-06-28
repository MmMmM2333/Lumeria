#[allow(unused_imports)]
use super::*;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct LiveDesktopVisualPlacement {
    pub(crate) scale: f32,
    pub(crate) offset_x: f32,
    pub(crate) offset_y: f32,
}

#[cfg(target_os = "windows")]
pub(crate) struct ComApartment;

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopCompositionSwapChain {
    pub(crate) swap_chain: IDXGISwapChain1,
    cached_back_buffer: RefCell<Option<ID3D11Texture2D>>,
    width: u32,
    height: u32,
}

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopNativeEffects {
    pub(crate) color_matrix_effect: Option<IDCompositionColorMatrixEffect>,
    pub(crate) blur_effect: Option<IDCompositionGaussianBlurEffect>,
    pub(crate) detail: String,
}

#[cfg(target_os = "windows")]
pub(crate) enum LiveDesktopCompositionDevice {
    Desktop(IDCompositionDesktopDevice),
    Legacy(IDCompositionDevice),
}

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopCompositionHost {
    owner_hwnd: HWND,
    target_hwnd: HWND,
    target_rect: LiveDesktopWindowRect,
    detail: String,
}

#[cfg(target_os = "windows")]
impl LiveDesktopCompositionDevice {
    pub(crate) unsafe fn commit(&self) -> Result<(), String> {
        match self {
            Self::Desktop(device) => unsafe { device.Commit() },
            Self::Legacy(device) => unsafe { device.Commit() },
        }
        .map_err(|error| error.to_string())
    }

    pub(crate) unsafe fn create_target_for_hwnd(
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

    pub(crate) unsafe fn create_visual(&self) -> Result<IDCompositionVisual, String> {
        match self {
            Self::Desktop(device) => unsafe { device.CreateVisual() }
                .and_then(|visual| visual.cast::<IDCompositionVisual>()),
            Self::Legacy(device) => unsafe { device.CreateVisual() },
        }
        .map_err(|error| error.to_string())
    }

    pub(crate) unsafe fn create_scale_transform(
        &self,
    ) -> Result<IDCompositionScaleTransform, String> {
        match self {
            Self::Desktop(device) => unsafe { device.CreateScaleTransform() },
            Self::Legacy(device) => unsafe { device.CreateScaleTransform() },
        }
        .map_err(|error| error.to_string())
    }
}

#[cfg(target_os = "windows")]
impl LiveDesktopCompositionSwapChain {
    pub(crate) unsafe fn create(
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
            cached_back_buffer: RefCell::new(None),
            width: desc.Width,
            height: desc.Height,
        })
    }

    pub(crate) unsafe fn back_buffer(&self, label: &str) -> Result<ID3D11Texture2D, String> {
        if let Some(texture) = self.cached_back_buffer.borrow().as_ref().cloned() {
            return Ok(texture);
        }

        let texture = unsafe { self.swap_chain.GetBuffer::<ID3D11Texture2D>(0) }
            .map_err(|error| format!("{label} swap chain GetBuffer(0) failed: {error}"))?;
        *self.cached_back_buffer.borrow_mut() = Some(texture.clone());
        Ok(texture)
    }

    pub(crate) unsafe fn present(&self) -> Result<(), String> {
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
impl LiveDesktopCompositionHost {
    pub(crate) unsafe fn create(owner_hwnd: HWND) -> Result<Self, String> {
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

    pub(crate) fn target_hwnd(&self) -> HWND {
        self.target_hwnd
    }

    pub(crate) fn target_size(&self) -> (u32, u32) {
        (
            self.target_rect.width.max(1) as u32,
            self.target_rect.height.max(1) as u32,
        )
    }

    pub(crate) fn detail(&self) -> &str {
        &self.detail
    }

    pub(crate) unsafe fn sync_to_owner_rect(&mut self) -> Result<bool, String> {
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

    pub(crate) unsafe fn set_visible(&mut self, _visible: bool) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(target_os = "windows")]
impl ComApartment {
    pub(crate) unsafe fn initialize() -> Result<Self, String> {
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

pub(crate) fn resolve_live_desktop_visual_placement(
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
pub(crate) unsafe fn create_live_desktop_composition_device(
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
pub(crate) unsafe fn probe_live_desktop_composition_swap_chain(
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
        format!(
            "DirectComposition commit failed during swap chain probe on adapter {adapter_index}: {error}"
        )
    })?;
    Ok("composition swap chain probe succeeded".to_string())
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn create_live_desktop_native_effects(
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
pub(crate) unsafe fn set_direct_composition_root(
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
pub(crate) unsafe fn apply_direct_composition_visual_placement(
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
