#[allow(unused_imports)]
use super::*;

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopOutputContext {
    pub(crate) output_index: u32,
    pub(crate) output_width: u32,
    pub(crate) output_height: u32,
    pub(crate) output_rect: LiveDesktopWindowRect,
    pub(crate) output_name: String,
}

#[cfg(target_os = "windows")]
struct LiveDesktopD3DDevice {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
}

#[cfg(target_os = "windows")]
enum LiveDesktopDxgiAdapterEvent<'a> {
    BeforeAdapter {
        adapter_index: u32,
    },
    AdapterEnumerationFailed {
        adapter_index: u32,
        adapter_count: u32,
        error: LiveDesktopError,
    },
    AdapterDescriptionFailed {
        adapter_index: u32,
        error: LiveDesktopError,
    },
    SoftwareAdapter {
        adapter_index: u32,
        adapter_name: &'a str,
    },
    Adapter {
        adapter_index: u32,
        adapter_count: u32,
        adapter: &'a IDXGIAdapter1,
        adapter_name: &'a str,
    },
}

#[cfg(target_os = "windows")]
fn for_each_dxgi_adapter<T>(
    factory: &IDXGIFactory1,
    skip_software: bool,
    mut visit: impl FnMut(LiveDesktopDxgiAdapterEvent<'_>) -> ControlFlow<T>,
) -> (u32, Option<T>) {
    let mut adapter_count = 0;

    for adapter_index in 0.. {
        if let ControlFlow::Break(result) =
            visit(LiveDesktopDxgiAdapterEvent::BeforeAdapter { adapter_index })
        {
            return (adapter_count, Some(result));
        }

        let adapter = match unsafe { factory.EnumAdapters1(adapter_index) } {
            Ok(adapter) => adapter,
            Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(error) => {
                let event = LiveDesktopDxgiAdapterEvent::AdapterEnumerationFailed {
                    adapter_index,
                    adapter_count,
                    error: LiveDesktopError::D3d {
                        context: "EnumAdapters1",
                        source: error,
                    },
                };
                return match visit(event) {
                    ControlFlow::Break(result) => (adapter_count, Some(result)),
                    ControlFlow::Continue(()) => (adapter_count, None),
                };
            }
        };
        adapter_count += 1;

        let desc = match unsafe { adapter.GetDesc1() } {
            Ok(desc) => desc,
            Err(error) => {
                let event = LiveDesktopDxgiAdapterEvent::AdapterDescriptionFailed {
                    adapter_index,
                    error: LiveDesktopError::D3d {
                        context: "IDXGIAdapter1::GetDesc1",
                        source: error,
                    },
                };
                if let ControlFlow::Break(result) = visit(event) {
                    return (adapter_count, Some(result));
                }
                continue;
            }
        };
        let adapter_name = live_desktop_adapter_name(&desc.Description);
        if skip_software && (desc.Flags & DXGI_ADAPTER_FLAG3_SOFTWARE.0 as u32) != 0 {
            let event = LiveDesktopDxgiAdapterEvent::SoftwareAdapter {
                adapter_index,
                adapter_name: &adapter_name,
            };
            if let ControlFlow::Break(result) = visit(event) {
                return (adapter_count, Some(result));
            }
            continue;
        }

        let event = LiveDesktopDxgiAdapterEvent::Adapter {
            adapter_index,
            adapter_count,
            adapter: &adapter,
            adapter_name: &adapter_name,
        };
        if let ControlFlow::Break(result) = visit(event) {
            return (adapter_count, Some(result));
        }
    }

    (adapter_count, None)
}

pub(crate) fn active_live_desktop_prerequisite_probe(
    renderer_detail: &str,
) -> LiveDesktopPrerequisiteProbe {
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

pub(crate) fn active_live_desktop_background_support(
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

pub(crate) fn make_live_desktop_background_support(
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
pub(crate) fn probe_live_desktop_renderer() -> LiveDesktopRendererProbe {
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
pub(crate) fn probe_live_desktop_renderer() -> LiveDesktopRendererProbe {
    LiveDesktopRendererProbe::unavailable(
        "unsupportedPlatform",
        "Native live desktop rendering is only implemented on Windows",
    )
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn probe_windows_live_desktop_renderer(
) -> Result<LiveDesktopRendererProbe, LiveDesktopRendererProbe> {
    let _com = unsafe { ComApartment::initialize() }.map_err(|error| {
        LiveDesktopRendererProbe::unavailable(
            "comInitializationFailed",
            format!("CoInitializeEx failed before probing DirectComposition renderer: {error}"),
        )
    })?;
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }
        .map_err(|source| LiveDesktopError::D3d {
            context: "CreateDXGIFactory1 while probing renderer",
            source,
        })
        .map_err(|error| {
            LiveDesktopRendererProbe::unavailable("dxgiUnavailable", String::from(error))
        })?;

    let mut last_detail = String::new();

    let (adapter_count, probe_result) = for_each_dxgi_adapter(
        &factory,
        true,
        |event| match event {
            LiveDesktopDxgiAdapterEvent::BeforeAdapter { .. } => ControlFlow::Continue(()),
            LiveDesktopDxgiAdapterEvent::AdapterEnumerationFailed {
                adapter_index,
                error,
                ..
            } => ControlFlow::Break(Err(LiveDesktopRendererProbe::unavailable(
                "dxgiAdapterEnumerationFailed",
                format!("EnumAdapters1({adapter_index}) failed while probing renderer: {error}"),
            ))),
            LiveDesktopDxgiAdapterEvent::AdapterDescriptionFailed {
                adapter_index,
                error,
            } => {
                last_detail =
                    format!("GetDesc1({adapter_index}) failed while probing renderer: {error}");
                ControlFlow::Continue(())
            }
            LiveDesktopDxgiAdapterEvent::SoftwareAdapter { .. } => ControlFlow::Continue(()),
            LiveDesktopDxgiAdapterEvent::Adapter {
                adapter_index,
                adapter,
                adapter_name,
                ..
            } => {
                let device = match unsafe { create_d3d11_device_for_adapter(adapter) } {
                    Ok(device) => device,
                    Err(error) => {
                        last_detail = format!(
                            "D3D11CreateDevice({adapter_index}) failed while probing renderer: {error}"
                        );
                        return ControlFlow::Continue(());
                    }
                };
                let dxgi_device = match device.cast::<IDXGIDevice>() {
                    Ok(device) => device,
                    Err(source) => {
                        let error = LiveDesktopError::D3d {
                            context: "IDXGIDevice cast while probing renderer",
                            source,
                        };
                        last_detail = format!(
                            "IDXGIDevice cast({adapter_index}) failed while probing renderer: {error}"
                        );
                        return ControlFlow::Continue(());
                    }
                };
                let (composition_device, native_effects) = match unsafe {
                    create_live_desktop_composition_device(&dxgi_device, adapter_index, "probe")
                } {
                    Ok(result) => result,
                    Err(error) => {
                        last_detail = error;
                        return ControlFlow::Continue(());
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
                        return ControlFlow::Continue(());
                    }
                };
                drop(composition_device);
                let supports_native_effects = native_effects.color_matrix_effect.is_some()
                    && native_effects.blur_effect.is_some();
                let detail = format!(
                    "DirectComposition base renderer probe succeeded on adapter {adapter_index} ({adapter_name}); {swap_chain_probe_detail}; {}; HWND target and root visual are validated when the live desktop runtime starts",
                    native_effects.detail
                );

                ControlFlow::Break(Ok(
                    LiveDesktopRendererProbe::native_renderer_available_for_probe(
                        supports_native_effects,
                        detail,
                    ),
                ))
            }
        },
    );
    if let Some(result) = probe_result {
        return result;
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
pub(crate) unsafe fn create_live_desktop_renderer_resources(
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
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }
        .map_err(|source| LiveDesktopError::D3d {
            context: "CreateDXGIFactory1 while creating renderer resources",
            source,
        })
        .map_err(|error| {
            LiveDesktopRendererProbe::unavailable("dxgiUnavailable", String::from(error))
        })?;

    let mut last_detail = String::new();
    let target_monitor = unsafe { MonitorFromWindow(window_handle, MONITOR_DEFAULTTONEAREST) };
    let mut com = Some(com);

    let (adapter_count, startup_result) = for_each_dxgi_adapter(
        &factory,
        true,
        |event| {
            match event {
            LiveDesktopDxgiAdapterEvent::BeforeAdapter { adapter_index } => {
                match check_live_desktop_renderer_startup_cancelled(
                    startup_cancel,
                    format!("enumerating adapter {adapter_index}"),
                ) {
                    Ok(()) => ControlFlow::Continue(()),
                    Err(probe) => ControlFlow::Break(Err(probe)),
                }
            }
            LiveDesktopDxgiAdapterEvent::AdapterEnumerationFailed {
                adapter_index,
                error,
                ..
            } => ControlFlow::Break(Err(LiveDesktopRendererProbe::unavailable(
                "dxgiAdapterEnumerationFailed",
                format!(
                    "EnumAdapters1({adapter_index}) failed while creating renderer resources: {error}"
                ),
            ))),
            LiveDesktopDxgiAdapterEvent::AdapterDescriptionFailed {
                adapter_index,
                error,
            } => {
                last_detail = format!(
                    "GetDesc1({adapter_index}) failed while creating renderer resources: {error}"
                );
                ControlFlow::Continue(())
            }
            LiveDesktopDxgiAdapterEvent::SoftwareAdapter {
                adapter_index,
                adapter_name,
            } => {
            last_detail = format!(
                "Skipped software adapter {adapter_index} ({adapter_name}) while creating renderer resources"
            );
                ControlFlow::Continue(())
            }
            LiveDesktopDxgiAdapterEvent::Adapter {
                adapter_index,
                adapter,
                adapter_name,
                ..
            } => 'adapter: {
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            format!("creating D3D11 device on adapter {adapter_index}"),
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!("Creating D3D11 device on adapter {adapter_index} ({adapter_name})"),
        );

        let d3d = match unsafe { create_d3d11_device_with_context_for_adapter(adapter) } {
            Ok(d3d) => d3d,
            Err(error) => {
                last_detail = format!(
                    "D3D11CreateDevice({adapter_index}, {adapter_name}) failed while creating renderer resources: {error}"
                );
                break 'adapter ControlFlow::Continue(());
            }
        };
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            format!("resolving output context on adapter {adapter_index}"),
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!(
                "Resolving live desktop output context on adapter {adapter_index} ({adapter_name})"
            ),
        );
        let output_context = match unsafe {
            resolve_live_desktop_output_context_for_adapter(adapter, adapter_index, target_monitor)
        } {
            Ok(output_context) => output_context,
            Err(error) => {
                last_detail = String::from(error);
                break 'adapter ControlFlow::Continue(());
            }
        };
        let dxgi_device = match d3d.device.cast::<IDXGIDevice>() {
            Ok(device) => device,
            Err(source) => {
                let error = LiveDesktopError::D3d {
                    context: "IDXGIDevice cast while creating renderer resources",
                    source,
                };
                last_detail = format!(
                    "IDXGIDevice cast({adapter_index}, {adapter_name}) failed while creating renderer resources: {error}"
                );
                break 'adapter ControlFlow::Continue(());
            }
        };
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            format!("creating DirectComposition device on adapter {adapter_index}"),
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
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
                break 'adapter ControlFlow::Continue(());
            }
        };
        let supports_native_effects =
            native_effects.color_matrix_effect.is_some() && native_effects.blur_effect.is_some();
        let color_matrix_effect = native_effects.color_matrix_effect;
        let blur_effect = native_effects.blur_effect;
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "initializing live desktop frame source",
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
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
                    break 'adapter ControlFlow::Break(Err(
                        LiveDesktopRendererProbe::root_visual_unavailable(
                        effective_frame_source.window_capture_unavailable_reason(),
                        format!(
                            "{} unavailable on adapter {adapter_index} ({adapter_name}): {error}",
                            effective_frame_source.window_capture_label()
                        ),
                    )));
                }
            }
        } else {
            None
        };
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "preparing live desktop host window",
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
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
                break 'adapter ControlFlow::Break(Err(
                    LiveDesktopRendererProbe::window_target_unavailable(
                    "liveDesktopHostUnavailable",
                    detail,
                )));
            }
        };
        let target_hwnd = host_window.target_hwnd();
        let (display_width, display_height) = host_window.target_size();
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "creating DirectComposition target",
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
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
                break 'adapter ControlFlow::Break(Err(
                    LiveDesktopRendererProbe::window_target_unavailable(
                    "directCompositionTargetUnavailable",
                    format!(
                        "CreateTargetForHwnd({adapter_index}, {adapter_name}, {}) failed while creating renderer resources: {error}",
                        "webviewTarget"
                    ),
                )));
            }
        };
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "creating DirectComposition root visual",
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
        report_live_desktop_renderer_startup_progress(
            progress_sender,
            format!("Creating DirectComposition root visual on adapter {adapter_index} ({adapter_name})"),
        );
        let root_visual = match unsafe { composition_device.create_visual() } {
            Ok(visual) => visual,
            Err(error) => {
                break 'adapter ControlFlow::Break(Err(
                    LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionVisualUnavailable",
                    format!(
                        "CreateVisual({adapter_index}, {adapter_name}) failed while creating renderer resources: {error}"
                    ),
                )));
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
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "creating DirectComposition swap chain",
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
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
                break 'adapter ControlFlow::Break(Err(
                    LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionSwapChainUnavailable",
                    format!(
                        "CreateSwapChainForComposition({}x{}) failed while creating renderer resources: {error}",
                        source_width, source_height
                    ),
                )));
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
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "copying initial live desktop frame",
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
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
            if let Err(error) = unsafe { swap_chain.present() } {
                break 'adapter ControlFlow::Break(Err(
                    LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionSwapChainPresentFailed",
                    format!("Initial composition swap chain present failed: {error}"),
                )));
            }
        }
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "applying DirectComposition effect configuration",
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
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
            break 'adapter ControlFlow::Break(Err(
                LiveDesktopRendererProbe::root_visual_unavailable(
                "directCompositionEffectUnavailable",
                format!("DirectComposition effect setup failed: {error}"),
            )));
        }
        let placement = resolve_live_desktop_visual_placement(
            source_width,
            source_height,
            display_width,
            display_height,
        );
        if let Err(probe) = check_live_desktop_renderer_startup_cancelled(
            startup_cancel,
            "committing DirectComposition root visual",
        ) {
            break 'adapter ControlFlow::Break(Err(probe));
        }
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
                break 'adapter ControlFlow::Break(Err(
                    LiveDesktopRendererProbe::root_visual_unavailable(
                    "directCompositionRootUnavailable",
                    format!(
                        "DirectComposition root visual and swap chain commit failed while creating renderer resources: {error}"
                    ),
                )));
            }
        };

        let effective_frame_source_detail = if effective_frame_source.uses_window_capture() {
            "effectiveFrameSource=wgc".to_string()
        } else if effective_frame_source == LiveDesktopFrameSource::TestPattern {
            "effectiveFrameSource=testPattern".to_string()
        } else {
            "effectiveFrameSource=unknown".to_string()
        };

        ControlFlow::Break(Ok(LiveDesktopRendererStartup {
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
                config: config.clone(),
                diagnostics: Arc::clone(&diagnostics),
                test_pattern: LiveDesktopTestPatternState::default(),
                visible: true,
                consecutive_frame_errors: 0,
                source_width,
                source_height,
                _com: com
                    .take()
                    .expect("COM apartment should be available for renderer startup"),
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
        }))
            }
        }
        },
    );
    if let Some(result) = startup_result {
        return result;
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
) -> Result<LiveDesktopOutputContext, LiveDesktopError> {
    let mut output_count = 0;
    let mut last_detail = String::new();

    for output_index in 0.. {
        let output = match unsafe { adapter.EnumOutputs(output_index) } {
            Ok(output) => output,
            Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
            Err(source) => {
                let error = LiveDesktopError::D3d {
                    context: "IDXGIAdapter1::EnumOutputs",
                    source,
                };
                last_detail =
                    format!("EnumOutputs({adapter_index}, {output_index}) failed: {error}");
                break;
            }
        };
        output_count += 1;

        let output_desc = match unsafe { output.GetDesc() } {
            Ok(desc) => desc,
            Err(source) => {
                let error = LiveDesktopError::D3d {
                    context: "IDXGIOutput::GetDesc",
                    source,
                };
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
        return Err(LiveDesktopError::Message(format!(
            "DXGI did not report any outputs for hardware adapter {adapter_index}"
        )));
    }
    if last_detail.is_empty() {
        Err(LiveDesktopError::Message(format!(
            "Live desktop output context startup failed on adapter {adapter_index} without a detailed DXGI error"
        )))
    } else {
        Err(LiveDesktopError::Message(last_detail))
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn live_desktop_wide_string(value: &[u16]) -> String {
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
unsafe fn create_d3d11_device_for_adapter(
    adapter: &IDXGIAdapter1,
) -> Result<ID3D11Device, LiveDesktopError> {
    Ok(unsafe { create_d3d11_device_with_context_for_adapter(adapter) }?.device)
}

#[cfg(target_os = "windows")]
unsafe fn create_d3d11_device_with_context_for_adapter(
    adapter: &IDXGIAdapter1,
) -> Result<LiveDesktopD3DDevice, LiveDesktopError> {
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
    .map_err(|source| LiveDesktopError::D3d {
        context: "D3D11CreateDevice",
        source,
    })?;

    Ok(LiveDesktopD3DDevice {
        device: device.ok_or_else(|| {
            LiveDesktopError::Message("D3D11CreateDevice returned no device".to_string())
        })?,
        context: context.ok_or_else(|| {
            LiveDesktopError::Message("D3D11CreateDevice returned no immediate context".to_string())
        })?,
    })
}

#[cfg(target_os = "windows")]
pub(crate) fn probe_live_desktop_prerequisites() -> LiveDesktopPrerequisiteProbe {
    match unsafe { probe_windows_live_desktop_prerequisites() } {
        Ok(probe) => probe,
        Err(probe) => probe,
    }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn probe_live_desktop_prerequisites() -> LiveDesktopPrerequisiteProbe {
    LiveDesktopPrerequisiteProbe {
        supports_d3d11: false,
        adapter_count: 0,
        output_count: 0,
        reason: "unsupportedPlatform",
        detail: "Live desktop backgrounds are only implemented on Windows".to_string(),
    }
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn probe_windows_live_desktop_prerequisites(
) -> Result<LiveDesktopPrerequisiteProbe, LiveDesktopPrerequisiteProbe> {
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }
        .map_err(|source| LiveDesktopError::D3d {
            context: "CreateDXGIFactory1",
            source,
        })
        .map_err(|error| {
            prerequisite_probe_error(false, 0, 0, "dxgiUnavailable", String::from(error))
        })?;

    let mut output_count = 0;
    let mut last_detail = String::new();

    let (adapter_count, prerequisite_result) = for_each_dxgi_adapter(&factory, true, |event| {
        match event {
            LiveDesktopDxgiAdapterEvent::BeforeAdapter { .. } => ControlFlow::Continue(()),
            LiveDesktopDxgiAdapterEvent::AdapterEnumerationFailed {
                adapter_index,
                adapter_count,
                error,
            } => ControlFlow::Break(Err(prerequisite_probe_error(
                false,
                adapter_count,
                output_count,
                "dxgiAdapterEnumerationFailed",
                format!("EnumAdapters1({adapter_index}) failed: {error}"),
            ))),
            LiveDesktopDxgiAdapterEvent::AdapterDescriptionFailed {
                adapter_index,
                error,
            } => {
                last_detail = format!("GetDesc1({adapter_index}) failed: {error}");
                ControlFlow::Continue(())
            }
            LiveDesktopDxgiAdapterEvent::SoftwareAdapter { .. } => ControlFlow::Continue(()),
            LiveDesktopDxgiAdapterEvent::Adapter {
                adapter_index,
                adapter_count,
                adapter,
                ..
            } => {
                let _device = match unsafe { create_d3d11_device_for_adapter(adapter) } {
                    Ok(device) => device,
                    Err(error) => {
                        last_detail = format!("D3D11CreateDevice({adapter_index}) failed: {error}");
                        return ControlFlow::Continue(());
                    }
                };

                for output_index in 0.. {
                    let output = match unsafe { adapter.EnumOutputs(output_index) } {
                        Ok(output) => output,
                        Err(error) if error.code() == DXGI_ERROR_NOT_FOUND => break,
                        Err(source) => {
                            let error = LiveDesktopError::D3d {
                                context: "IDXGIAdapter1::EnumOutputs",
                                source,
                            };
                            last_detail = format!(
                                "EnumOutputs({adapter_index}, {output_index}) failed: {error}"
                            );
                            break;
                        }
                    };
                    output_count += 1;

                    let output_desc = match unsafe { output.GetDesc() } {
                        Ok(desc) => desc,
                        Err(source) => {
                            let error = LiveDesktopError::D3d {
                                context: "IDXGIOutput::GetDesc",
                                source,
                            };
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

                    return ControlFlow::Break(Ok(LiveDesktopPrerequisiteProbe {
                        supports_d3d11: true,
                        adapter_count,
                        output_count,
                        reason: "available",
                        detail: format!(
                            "D3D11 prerequisite probe succeeded on adapter {adapter_index}, output {output_index} ({}x{})",
                            output_width, output_height
                        ),
                    }));
                }

                ControlFlow::Continue(())
            }
        }
    });
    if let Some(result) = prerequisite_result {
        return result;
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
