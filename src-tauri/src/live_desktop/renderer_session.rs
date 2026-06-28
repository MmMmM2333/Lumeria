#[allow(unused_imports)]
use super::*;

#[derive(Debug)]
pub(crate) struct LiveDesktopRendererSession {
    pub(crate) renderer_probe: LiveDesktopRendererProbe,
    pub(crate) diagnostics: Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    #[cfg(target_os = "windows")]
    pub(crate) stop_sender: Option<mpsc::Sender<()>>,
    #[cfg(target_os = "windows")]
    pub(crate) command_sender: Option<mpsc::Sender<LiveDesktopRendererCommand>>,
    #[cfg(target_os = "windows")]
    pub(crate) exit_receiver: Option<mpsc::Receiver<()>>,
    #[cfg(target_os = "windows")]
    pub(crate) worker: Option<thread::JoinHandle<()>>,
}

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopAbandonedRendererWorker {
    pub(crate) worker: Option<thread::JoinHandle<()>>,
    pub(crate) reason: &'static str,
    pub(crate) detail: String,
    pub(crate) generation: u64,
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
pub(crate) struct LiveDesktopRendererStartupFailure {
    pub(crate) probe: LiveDesktopRendererProbe,
    #[cfg(target_os = "windows")]
    pub(crate) abandoned_worker: Option<LiveDesktopAbandonedRendererWorker>,
}

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopRendererStartupReady {
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
    pub(crate) fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopRendererStartup {
    pub(super) renderer_probe: LiveDesktopRendererProbe,
    pub(super) resources: LiveDesktopRendererResources,
}

#[cfg(target_os = "windows")]
pub(crate) enum LiveDesktopRendererStartupMessage {
    Progress(String),
    Ready(LiveDesktopRendererProbe),
    Failed(LiveDesktopRendererProbe),
}

impl LiveDesktopRendererSession {
    #[cfg(target_os = "windows")]
    pub(crate) fn start_for_window(
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
    pub(crate) fn start_for_window(
        _window_handle: LiveDesktopWindowHandle,
        _config: LiveDesktopRuntimeConfig,
    ) -> Result<Self, LiveDesktopRendererStartupFailure> {
        Err(probe_live_desktop_renderer().into())
    }

    pub(crate) fn configure(&self, config: LiveDesktopRuntimeConfig) {
        #[cfg(target_os = "windows")]
        if let Some(command_sender) = self.command_sender.as_ref() {
            let _ = command_sender.send(LiveDesktopRendererCommand::Configure(Box::new(config)));
        }
    }

    pub(crate) fn set_visible(&self, visible: bool) {
        #[cfg(target_os = "windows")]
        if let Some(command_sender) = self.command_sender.as_ref() {
            let _ = command_sender.send(LiveDesktopRendererCommand::SetVisible(visible));
        }
    }

    #[cfg(target_os = "windows")]
    pub(crate) fn stop_and_maybe_abandon(
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

    pub(crate) fn diagnostics(&self) -> LiveDesktopRuntimeDiagnostics {
        self.diagnostics
            .lock()
            .map(|diagnostics| diagnostics.clone())
            .unwrap_or_default()
    }

    #[cfg(test)]
    pub(crate) fn create_for_probe(
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
pub(crate) fn wait_for_live_desktop_renderer_startup(
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
pub(crate) fn cancel_live_desktop_renderer_startup_after_timeout(
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
pub(crate) fn report_live_desktop_renderer_startup_progress(
    sender: &mpsc::Sender<LiveDesktopRendererStartupMessage>,
    detail: impl Into<String>,
) {
    let _ = sender.send(LiveDesktopRendererStartupMessage::Progress(detail.into()));
}
