#[allow(unused_imports)]
use super::*;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopPrerequisiteProbe {
    pub(crate) supports_d3d11: bool,
    pub(crate) adapter_count: u32,
    pub(crate) output_count: u32,
    pub(crate) reason: &'static str,
    pub(crate) detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopFrameProbe {
    pub(crate) supports_frame_texture: bool,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) format: i32,
    pub(crate) reason: &'static str,
    pub(crate) detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopRendererProbe {
    pub(crate) supports_direct_composition: bool,
    pub(crate) supports_window_target: bool,
    pub(crate) supports_root_visual: bool,
    pub(crate) supports_native_renderer: bool,
    pub(crate) supports_native_effects: bool,
    pub(crate) reason: &'static str,
    pub(crate) detail: String,
}

#[cfg(target_os = "windows")]
pub(crate) struct LiveDesktopPixelProbe {
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) min_rgb: u32,
    pub(crate) max_rgb: u32,
    pub(crate) avg_rgb: u32,
    pub(crate) min_alpha: u32,
    pub(crate) max_alpha: u32,
    pub(crate) avg_alpha: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopRuntimeStatus {
    pub(crate) phase: &'static str,
    pub(crate) active: bool,
    pub(crate) generation: u64,
    pub(crate) reason: &'static str,
    pub(crate) detail: String,
    pub(crate) diagnostics: LiveDesktopRuntimeDiagnostics,
    pub(crate) window_diagnostics: LiveDesktopWindowDiagnostics,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveDesktopRuntimeDiagnostics {
    pub(crate) frames_copied: u64,
    pub(crate) frame_timeouts: u64,
    pub(crate) copy_errors: u64,
    pub(crate) commit_errors: u64,
    pub(crate) frame_arrived_events: u64,
    pub(crate) frame_arrived_dropped_signals: u64,
    pub(crate) frame_copy_samples: u64,
    pub(crate) frame_copy_micros_total: u64,
    pub(crate) last_frame_copy_micros: u64,
    pub(crate) max_frame_copy_micros: u64,
    pub(crate) frame_commit_samples: u64,
    pub(crate) frame_commit_micros_total: u64,
    pub(crate) last_frame_commit_micros: u64,
    pub(crate) max_frame_commit_micros: u64,
    pub(crate) config_updates: u64,
    pub(crate) config_errors: u64,
    pub(crate) last_frame_width: u32,
    pub(crate) last_frame_height: u32,
    pub(crate) last_frame_format: i32,
    pub(crate) test_pattern_frames: u64,
    pub(crate) pixel_probe_samples: u64,
    pub(crate) pixel_probe_errors: u64,
    pub(crate) blank_frame_skips: u64,
    pub(crate) shader_copy_fallbacks: u64,
    pub(crate) abandoned_renderer_workers: u64,
    pub(crate) reaped_abandoned_renderer_workers: u64,
    pub(crate) last_pixel_probe_width: u32,
    pub(crate) last_pixel_probe_height: u32,
    pub(crate) last_pixel_probe_min_rgb: u32,
    pub(crate) last_pixel_probe_max_rgb: u32,
    pub(crate) last_pixel_probe_avg_rgb: u32,
    pub(crate) last_pixel_probe_min_alpha: u32,
    pub(crate) last_pixel_probe_max_alpha: u32,
    pub(crate) last_pixel_probe_avg_alpha: u32,
    pub(crate) last_shader_copy_error: String,
    pub(crate) last_abandoned_renderer_reason: String,
    pub(crate) last_error: String,
    pub(crate) recent_errors: VecDeque<String>,
}

impl LiveDesktopRendererProbe {
    pub(crate) fn native_renderer_available_for_probe(
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
    pub(crate) fn native_renderer_unimplemented_for_window(detail: impl Into<String>) -> Self {
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

    pub(crate) fn native_renderer_available_for_window(
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

    pub(crate) fn unavailable(reason: &'static str, detail: impl Into<String>) -> Self {
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

    pub(crate) fn window_target_unavailable(
        reason: &'static str,
        detail: impl Into<String>,
    ) -> Self {
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

    pub(crate) fn root_visual_unavailable(reason: &'static str, detail: impl Into<String>) -> Self {
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
    pub(crate) fn native_renderer_unimplemented(detail: impl Into<String>) -> Self {
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
    pub(crate) fn available() -> Self {
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
    pub(crate) fn starting(generation: u64) -> Self {
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

    pub(crate) fn running(generation: u64, renderer_detail: String) -> Self {
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

    pub(crate) fn stopped(generation: u64) -> Self {
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

    pub(crate) fn failed(generation: u64, reason: &'static str, detail: String) -> Self {
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

    pub(crate) fn is_stopped(&self) -> bool {
        self.phase == "stopped"
    }

    pub(crate) fn is_starting_or_running(&self) -> bool {
        matches!(self.phase, "starting" | "running")
    }
}

impl LiveDesktopRuntimeDiagnostics {
    pub(crate) fn summary(&self) -> String {
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
            format!("shaderCopyFallbacks={}", self.shader_copy_fallbacks),
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
        if !self.last_shader_copy_error.is_empty() {
            parts.push(format!(
                "lastShaderCopyError={}",
                self.last_shader_copy_error
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

    pub(crate) fn has_abandoned_renderer_activity(&self) -> bool {
        self.abandoned_renderer_workers > 0
            || self.reaped_abandoned_renderer_workers > 0
            || !self.last_abandoned_renderer_reason.is_empty()
    }
}

pub(crate) fn append_live_desktop_runtime_diagnostics(
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
pub(crate) fn update_live_desktop_diagnostics(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    update: impl FnOnce(&mut LiveDesktopRuntimeDiagnostics),
) {
    if let Ok(mut diagnostics) = diagnostics.lock() {
        update(&mut diagnostics);
    }
}

pub(crate) fn push_live_desktop_recent_error(
    diagnostics: &mut LiveDesktopRuntimeDiagnostics,
    detail: &str,
) {
    if diagnostics.recent_errors.len() >= LIVE_DESKTOP_RECENT_ERROR_LIMIT {
        diagnostics.recent_errors.pop_front();
    }
    diagnostics.recent_errors.push_back(detail.to_string());
    diagnostics.last_error = detail.to_string();
}

#[cfg(target_os = "windows")]
pub(crate) fn live_desktop_duration_micros(duration: Duration) -> u64 {
    duration.as_micros().min(u64::MAX as u128) as u64
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_frame_arrived_event(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.frame_arrived_events += 1;
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_frame_arrived_dropped_signal(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.frame_arrived_dropped_signals += 1;
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_frame_copy_duration(
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
pub(crate) fn record_live_desktop_frame_commit_duration(
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
pub(crate) fn record_live_desktop_frame_copied(
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
pub(crate) fn record_live_desktop_test_pattern_frame(
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
pub(crate) fn record_live_desktop_frame_timeout(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.frame_timeouts += 1;
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn should_probe_live_desktop_pixels(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) -> bool {
    diagnostics
        .lock()
        .map(|diagnostics| diagnostics.frames_copied % 30 == 0)
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
pub(crate) fn live_desktop_blank_frame_skip_count(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) -> u64 {
    diagnostics
        .lock()
        .map(|diagnostics| diagnostics.blank_frame_skips)
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_pixel_probe(
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
pub(crate) fn record_live_desktop_pixel_probe_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.pixel_probe_errors += 1;
        push_live_desktop_recent_error(diagnostics, detail);
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_blank_frame_skipped(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    probe: &LiveDesktopPixelProbe,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.blank_frame_skips += 1;
        let detail = format!(
            "Skipped suspected blank WGC frame: {}x{} rgb max {} avg {} alpha max {} avg {}",
            probe.width,
            probe.height,
            probe.max_rgb,
            probe.avg_rgb,
            probe.max_alpha,
            probe.avg_alpha
        );
        push_live_desktop_recent_error(diagnostics, &detail);
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_shader_copy_fallback(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.shader_copy_fallbacks += 1;
        diagnostics.last_shader_copy_error = detail.to_string();
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_copy_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.copy_errors += 1;
        push_live_desktop_recent_error(diagnostics, detail);
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_commit_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.commit_errors += 1;
        push_live_desktop_recent_error(diagnostics, detail);
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_config_update(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.config_updates += 1;
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_config_error(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        diagnostics.config_errors += 1;
        push_live_desktop_recent_error(diagnostics, detail);
    });
}

#[cfg(target_os = "windows")]
pub(crate) fn record_live_desktop_frame_pump_circuit_breaker(
    diagnostics: &Arc<Mutex<LiveDesktopRuntimeDiagnostics>>,
    detail: &str,
) {
    update_live_desktop_diagnostics(diagnostics, |diagnostics| {
        push_live_desktop_recent_error(diagnostics, detail);
    });
}
