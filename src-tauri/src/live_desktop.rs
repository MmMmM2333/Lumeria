use serde::Serialize;

#[cfg(target_os = "windows")]
use windows::{
    core::Interface,
    Win32::{
        Foundation::HMODULE,
        Graphics::{
            Direct3D::{
                D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_10_0,
                D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
            },
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
                D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
            },
            Dxgi::{
                CreateDXGIFactory1, IDXGIFactory1, IDXGIOutput1, IDXGIOutputDuplication,
                IDXGIResource, DXGI_ADAPTER_FLAG3_SOFTWARE, DXGI_ERROR_ACCESS_DENIED,
                DXGI_ERROR_NOT_FOUND, DXGI_ERROR_WAIT_TIMEOUT, DXGI_OUTDUPL_FRAME_INFO,
            },
        },
    },
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopBackgroundSupport {
    platform: &'static str,
    supports_live_desktop_background: bool,
    supports_live_desktop_background_effects: bool,
    reason: &'static str,
    capture_probe: LiveDesktopCaptureProbe,
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

pub(crate) fn live_desktop_background_support() -> LiveDesktopBackgroundSupport {
    let capture_probe = probe_live_desktop_capture();
    make_live_desktop_background_support(current_platform(), capture_probe)
}

fn make_live_desktop_background_support(
    platform: &'static str,
    capture_probe: LiveDesktopCaptureProbe,
) -> LiveDesktopBackgroundSupport {
    let reason = if capture_probe.supports_desktop_duplication {
        "nativeRendererNotImplemented"
    } else {
        capture_probe.reason
    };

    LiveDesktopBackgroundSupport {
        platform,
        supports_live_desktop_background: false,
        supports_live_desktop_background_effects: false,
        reason,
        capture_probe,
    }
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
    const FEATURE_LEVELS: [D3D_FEATURE_LEVEL; 4] = [
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0,
        D3D_FEATURE_LEVEL_10_1,
        D3D_FEATURE_LEVEL_10_0,
    ];

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

        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;
        let create_device_result = unsafe {
            D3D11CreateDevice(
                &adapter,
                D3D_DRIVER_TYPE_UNKNOWN,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                Some(&FEATURE_LEVELS),
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
        };
        if let Err(error) = create_device_result {
            last_detail = format!("D3D11CreateDevice({adapter_index}) failed: {error}");
            continue;
        }
        let Some(device) = device else {
            last_detail = format!("D3D11CreateDevice({adapter_index}) returned no device");
            continue;
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
        let support =
            make_live_desktop_background_support("windows", capture_probe(true, true, "available"));

        assert!(!support.supports_live_desktop_background);
        assert!(!support.supports_live_desktop_background_effects);
        assert_eq!(support.reason, "nativeRendererNotImplemented");
        assert!(support.capture_probe.supports_d3d11);
        assert!(support.capture_probe.supports_desktop_duplication);
        assert!(support.capture_probe.frame_probe.supports_frame_texture);
    }

    #[test]
    fn capture_probe_failure_surfaces_probe_reason() {
        let support = make_live_desktop_background_support(
            "windows",
            capture_probe(false, false, "dxgiUnavailable"),
        );

        assert!(!support.supports_live_desktop_background);
        assert_eq!(support.reason, "dxgiUnavailable");
        assert!(!support.capture_probe.supports_d3d11);
        assert!(!support.capture_probe.supports_desktop_duplication);
    }
}
