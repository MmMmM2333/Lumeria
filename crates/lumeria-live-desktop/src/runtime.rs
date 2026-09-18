#[allow(unused_imports)]
use super::*;

#[derive(Debug)]
pub struct LiveDesktopRuntime {
    status: LiveDesktopRuntimeStatus,
    pub(super) renderer_session: Option<LiveDesktopRendererSession>,
    config: LiveDesktopRuntimeConfig,
    #[cfg(target_os = "windows")]
    abandoned_renderer_workers: Vec<LiveDesktopAbandonedRendererWorker>,
    reaped_abandoned_renderer_workers: u64,
    last_abandoned_renderer_reason: String,
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
    pub fn active_background_support(&mut self) -> Option<LiveDesktopBackgroundSupport> {
        self.reap_abandoned_renderer_workers();
        self.renderer_session
            .as_ref()
            .map(|session| active_live_desktop_background_support(session.renderer_probe.clone()))
    }

    pub fn status(&mut self) -> LiveDesktopRuntimeStatus {
        self.reap_abandoned_renderer_workers();
        #[cfg(target_os = "windows")]
        if self.status.active
            && self
                .renderer_session
                .as_ref()
                .and_then(|session| session.worker.as_ref())
                .is_some_and(|worker| worker.is_finished())
        {
            self.status = LiveDesktopRuntimeStatus::failed(
                self.status.generation,
                "rendererExited",
                "Live desktop capture worker exited unexpectedly".to_string(),
            );
        }
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

    pub fn start_for_window(
        &mut self,
        window_handle: LiveDesktopWindowHandle,
    ) -> LiveDesktopRuntimeStatus {
        let config = self.config.clone();
        self.start_with_renderer_session(probe_live_desktop_prerequisites(), || {
            LiveDesktopRendererSession::start_for_window(window_handle, config)
        })
    }

    pub fn configure(&mut self, config: LiveDesktopRuntimeConfig) -> LiveDesktopRuntimeStatus {
        self.reap_abandoned_renderer_workers();
        self.config = config.clone();
        if let Some(session) = self.renderer_session.as_ref() {
            session.configure(config);
        }
        self.status()
    }

    pub fn set_visible(&mut self, visible: bool) -> LiveDesktopRuntimeStatus {
        self.reap_abandoned_renderer_workers();
        if let Some(session) = self.renderer_session.as_ref() {
            session.set_visible(visible);
        }
        self.status()
    }

    pub fn stop(&mut self) -> LiveDesktopRuntimeStatus {
        #[cfg(target_os = "windows")]
        let cleanup_timeout = Duration::from_millis(LIVE_DESKTOP_RENDERER_STOP_JOIN_TIMEOUT_MS);
        #[cfg(not(target_os = "windows"))]
        let cleanup_timeout = std::time::Duration::ZERO;
        self.stop_with_timeout(cleanup_timeout)
    }

    pub(super) fn stop_with_timeout(
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
    pub(super) fn start_with_probes(
        &mut self,
        prerequisite_probe: LiveDesktopPrerequisiteProbe,
        renderer_probe: LiveDesktopRendererProbe,
    ) -> LiveDesktopRuntimeStatus {
        self.start_with_renderer_session(prerequisite_probe, || {
            LiveDesktopRendererSession::create_for_probe(renderer_probe).map_err(Into::into)
        })
    }

    pub(super) fn start_with_renderer_session<F>(
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
    pub(super) fn register_abandoned_renderer_worker(
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
