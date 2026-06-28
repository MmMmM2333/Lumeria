#[allow(unused_imports)]
use super::*;

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopWindowCapture {
    hwnd: HWND,
    pub(crate) width: u32,
    pub(crate) height: u32,
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
    pub(crate) frame_arrived_receiver: Option<mpsc::Receiver<()>>,
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
    pub(crate) left: u32,
    pub(crate) top: u32,
    pub(crate) width: u32,
    pub(crate) height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct LiveDesktopMouseRelayPosition {
    pub(crate) x: i32,
    pub(crate) y: i32,
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

pub(crate) fn is_acceptable_live_desktop_wgc_target(info: &LiveDesktopWindowInfo) -> bool {
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
        Err(source) => {
            let error = LiveDesktopError::Capture {
                context: "Wallpaper Engine popup align SetWindowPos",
                source,
            };
            format!("alignToDisplayFailed={}", String::from(error))
        }
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
) -> Result<(), LiveDesktopError> {
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
    .map_err(|source| LiveDesktopError::Capture {
        context: "Wallpaper Engine popup restore SetWindowPos",
        source,
    })?;
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn relay_wallpaper_engine_popup_mouse(window_capture: &LiveDesktopWindowCapture) {
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

pub(crate) fn resolve_live_desktop_mouse_relay_position(
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
pub(crate) fn live_desktop_effective_frame_source_label(
    window_capture: Option<&LiveDesktopWindowCapture>,
) -> &'static str {
    if let Some(capture) = window_capture {
        capture.source_label
    } else {
        "Test Pattern"
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn live_desktop_effective_frame_source_detail<'a>(
    window_capture: Option<&'a LiveDesktopWindowCapture>,
    fallback: &'a str,
) -> &'a str {
    window_capture
        .map(|capture| capture.detail.as_str())
        .unwrap_or(fallback)
}

pub(crate) fn resolve_live_desktop_frame_crop(
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

pub(crate) fn resolve_live_desktop_wgc_copy_crop(
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
fn register_live_desktop_wgc_frame_arrived(
    frame_pool: &Direct3D11CaptureFramePool,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) -> Result<
    (
        mpsc::Receiver<()>,
        i64,
        TypedEventHandler<Direct3D11CaptureFramePool, IInspectable>,
    ),
    LiveDesktopError,
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
        .map_err(|source| LiveDesktopError::Capture {
            context: "Direct3D11CaptureFramePool::FrameArrived",
            source,
        })?;
    Ok((frame_arrived_receiver, token, handler))
}

#[cfg(target_os = "windows")]
pub(crate) unsafe fn create_live_desktop_window_capture(
    d3d_device: &ID3D11Device,
    disable_mouse_relay: bool,
    output_context: &LiveDesktopOutputContext,
    diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    progress_sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
) -> Result<LiveDesktopWindowCapture, LiveDesktopError> {
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
        return Err(LiveDesktopError::Message(format!(
            "{capture_label} diagnostics found no WGC capture targets: {}; open a Wallpaper Engine pop-out window when using popup capture{}{}",
            window_diagnostics.detail, ensure_detail, close_detail
        )));
    }
    let target_count = targets.len();
    let first_target = targets.first().ok_or_else(|| {
        LiveDesktopError::Message(format!(
            "{capture_label} diagnostics found no WGC capture targets: {}",
            window_diagnostics.detail
        ))
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
        .map_err(|source| LiveDesktopError::D3d {
            context: "IDXGIDevice cast for WGC",
            source,
        })?;
    let winrt_device =
        unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device) }.map_err(|source| {
            LiveDesktopError::D3d {
                context: "CreateDirect3D11DeviceFromDXGIDevice",
                source,
            }
        })?;
    let winrt_device: IDirect3DDevice =
        winrt_device
            .cast()
            .map_err(|source| LiveDesktopError::D3d {
                context: "IDirect3DDevice cast for WGC",
                source,
            })?;
    let interop: IGraphicsCaptureItemInterop =
        factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>().map_err(|source| {
            LiveDesktopError::Capture {
                context: "GraphicsCaptureItem interop factory",
                source,
            }
        })?;
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
            Err(source) => {
                let error = LiveDesktopError::CaptureContext {
                    context: format!("GraphicsCaptureItem::CreateForWindow({})", target.hwnd),
                    source,
                };
                attempt_details.push(format_live_desktop_wgc_attempt(target, String::from(error)));
                continue;
            }
        };
        let size = match item.Size() {
            Ok(size) => size,
            Err(source) => {
                let error = LiveDesktopError::Capture {
                    context: "GraphicsCaptureItem::Size",
                    source,
                };
                attempt_details.push(format_live_desktop_wgc_attempt(target, String::from(error)));
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
            Err(source) => {
                let error = LiveDesktopError::CaptureContext {
                    context: format!(
                        "Direct3D11CaptureFramePool::CreateFreeThreaded({}x{})",
                        size.Width, size.Height
                    ),
                    source,
                };
                attempt_details.push(format_live_desktop_wgc_attempt(target, String::from(error)));
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
                format!("frameArrivedRegistrationFailed={}", String::from(error)),
            ),
        };
        let session = match frame_pool.CreateCaptureSession(&item) {
            Ok(session) => session,
            Err(source) => {
                let error = LiveDesktopError::Capture {
                    context: "Direct3D11CaptureFramePool::CreateCaptureSession",
                    source,
                };
                attempt_details.push(format_live_desktop_wgc_attempt(target, String::from(error)));
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
            Err(source) => {
                let error = LiveDesktopError::Capture {
                    context: "GraphicsCaptureSession::SetIsCursorCaptureEnabled(false)",
                    source,
                };
                format!("cursorCaptureDisableFailed={}", String::from(error))
            }
        };
        if let Err(source) = session.StartCapture() {
            let error = LiveDesktopError::Capture {
                context: "GraphicsCaptureSession::StartCapture",
                source,
            };
            attempt_details.push(format_live_desktop_wgc_attempt(target, String::from(error)));
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
            Err(error) => format!("; {}", String::from(error)),
        }
    } else {
        String::new()
    };
    let close_detail = cleanup_wallpaper_engine_popup_after_failed_capture(&mut popup_ensure);
    Err(LiveDesktopError::Message(format!(
        "{capture_label} failed for all {target_count} WGC targets: {}{}{}",
        attempt_details.join(" | "),
        restore_detail,
        close_detail
    )))
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
pub(crate) unsafe fn copy_initial_live_desktop_frame_to_composition_surface(
    window_capture: Option<&LiveDesktopWindowCapture>,
    swap_chain: &LiveDesktopCompositionSwapChain,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    config: &LiveDesktopRuntimeConfig,
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    shader_pipeline: Option<&LiveDesktopShaderPipeline>,
) -> Result<Option<LiveDesktopFrameProbe>, LiveDesktopError> {
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
) -> Result<LiveDesktopPixelProbe, LiveDesktopError> {
    let mut source_desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { source_texture.GetDesc(&mut source_desc) };
    if source_desc.Width == 0 || source_desc.Height == 0 {
        return Err(LiveDesktopError::Message(format!(
            "{label} source texture has invalid size"
        )));
    }
    if source_desc.SampleDesc.Count != 1 {
        return Err(LiveDesktopError::Message(format!(
            "{label} does not support multisampled textures: sampleCount={}",
            source_desc.SampleDesc.Count
        )));
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
    unsafe { device.CreateTexture2D(&staging_desc, None, Some(&mut staging_texture)) }.map_err(
        |source| LiveDesktopError::D3dContext {
            context: format!("{label} CreateTexture2D"),
            source,
        },
    )?;
    let staging_texture = staging_texture.ok_or_else(|| {
        LiveDesktopError::Message(format!("{label} CreateTexture2D returned no texture"))
    })?;
    let source_resource =
        source_texture
            .cast::<ID3D11Resource>()
            .map_err(|source| LiveDesktopError::D3dContext {
                context: format!("{label} source resource cast"),
                source,
            })?;
    let staging_resource = staging_texture.cast::<ID3D11Resource>().map_err(|source| {
        LiveDesktopError::D3dContext {
            context: format!("{label} staging resource cast"),
            source,
        }
    })?;
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
    unsafe { context.Map(&staging_resource, 0, D3D11_MAP_READ, 0, Some(&mut mapped)) }.map_err(
        |source| LiveDesktopError::D3dContext {
            context: format!("{label} Map"),
            source,
        },
    )?;
    let probe_result = (|| -> Result<LiveDesktopPixelProbe, LiveDesktopError> {
        if mapped.pData.is_null() {
            return Err(LiveDesktopError::Message(format!(
                "{label} Map returned null data"
            )));
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
            return Err(LiveDesktopError::Message(format!(
                "{label} sampled no pixels"
            )));
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
pub(crate) unsafe fn copy_window_capture_frame_to_composition_surface(
    window_capture: &LiveDesktopWindowCapture,
    swap_chain: &LiveDesktopCompositionSwapChain,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    config: &LiveDesktopRuntimeConfig,
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    shader_pipeline: Option<&LiveDesktopShaderPipeline>,
) -> Result<Option<LiveDesktopFrameProbe>, LiveDesktopError> {
    let mut frame = match window_capture.frame_pool.TryGetNextFrame() {
        Ok(frame) => frame,
        Err(_) => return Ok(None),
    };
    while let Ok(next_frame) = window_capture.frame_pool.TryGetNextFrame() {
        let _ = frame.Close();
        frame = next_frame;
    }
    let copy_result = (|| -> Result<Option<LiveDesktopFrameProbe>, LiveDesktopError> {
        let frame_surface = frame
            .Surface()
            .map_err(|source| LiveDesktopError::Capture {
                context: "Direct3D11CaptureFrame::Surface",
                source,
            })?;
        let access = frame_surface
            .cast::<IDirect3DDxgiInterfaceAccess>()
            .map_err(|source| LiveDesktopError::D3d {
                context: "WGC frame surface DXGI access cast",
                source,
            })?;
        let source_texture: ID3D11Texture2D =
            unsafe { access.GetInterface() }.map_err(|source| LiveDesktopError::D3d {
                context: "WGC frame ID3D11Texture2D access",
                source,
            })?;
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
                Err(error) => {
                    let error = String::from(error);
                    record_live_desktop_pixel_probe_error(diagnostics, &error);
                }
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
            return Err(LiveDesktopError::Message(format!(
                "WGC source size {}x{} cannot be copied into composition swap chain {}x{}",
                source_desc.Width, source_desc.Height, target_desc.Width, target_desc.Height
            )));
        }
        if copy_crop.left.saturating_add(copy_crop.width) > source_desc.Width
            || copy_crop.top.saturating_add(copy_crop.height) > source_desc.Height
            || copy_crop.width > target_desc.Width
            || copy_crop.height > target_desc.Height
        {
            return Err(LiveDesktopError::Message(format!(
                "WGC crop {}x{}@{},{} is outside source {}x{} or target {}x{}",
                copy_crop.width,
                copy_crop.height,
                copy_crop.left,
                copy_crop.top,
                source_desc.Width,
                source_desc.Height,
                target_desc.Width,
                target_desc.Height
            )));
        }
        let source_resource =
            source_texture
                .cast::<ID3D11Resource>()
                .map_err(|source| LiveDesktopError::D3d {
                    context: "WGC source texture resource cast",
                    source,
                })?;
        let target_resource =
            target_texture
                .cast::<ID3D11Resource>()
                .map_err(|source| LiveDesktopError::D3d {
                    context: "WGC target texture resource cast",
                    source,
                })?;
        let shader_copy_error = if let Some(shader_pipeline) = shader_pipeline {
            let copy_result = (|| -> Result<(), LiveDesktopError> {
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
            copy_result.err().map(String::from)
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
    let close_result = frame.Close().map_err(|source| LiveDesktopError::Capture {
        context: "Direct3D11CaptureFrame::Close after copy",
        source,
    });

    match (copy_result, close_result) {
        (Ok(frame_probe), Ok(())) => Ok(frame_probe),
        (Err(error), _) => Err(error),
        (Ok(_), Err(error)) => Err(error),
    }
}
