export const RENDER_PROBE_TARGET_ALL = "all-folders";
export const RENDER_PROBE_PIXELS_OFF = "off";
export const RENDER_PROBE_PIXELS_PHASE_DIFF = "phase-diff";
export const RENDER_PROBE_TARGET_OPTIONS = [
  { labelKey: "debug.render.target.allFolders", value: RENDER_PROBE_TARGET_ALL },
  { labelKey: "debug.render.target.folderId", value: "folderId" },
  { labelKey: "debug.render.target.itemId", value: "itemId" },
  { labelKey: "debug.render.target.itemName", value: "itemName" },
];

function requireTranslation(translate) {
  if (typeof translate !== "function") {
    throw new TypeError("Render probe presentation requires a translation function");
  }
  return translate;
}

export function getRenderProbeTargetOptions(translate) {
  const t = requireTranslation(translate);
  return RENDER_PROBE_TARGET_OPTIONS.map((option) => ({
    ...option,
    label: t(option.labelKey),
  }));
}

const TARGET_KEYS = new Set(
  RENDER_PROBE_TARGET_OPTIONS
    .map((option) => option.value)
    .filter((value) => value !== RENDER_PROBE_TARGET_ALL),
);

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function formatMillis(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}ms` : "-";
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "-";
}

function formatSignedPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number >= 0 ? "+" : ""}${(number * 100).toFixed(1)}%`;
}

export function buildRenderProbeArmConfig(form = {}) {
  const targetKind = form.targetKind || RENDER_PROBE_TARGET_ALL;
  if (targetKind !== RENDER_PROBE_TARGET_ALL && !TARGET_KEYS.has(targetKind)) {
    throw new TypeError(`Unknown render probe target kind: ${targetKind}`);
  }
  const pixels = form.pixels || RENDER_PROBE_PIXELS_OFF;
  if (pixels !== RENDER_PROBE_PIXELS_OFF && pixels !== RENDER_PROBE_PIXELS_PHASE_DIFF) {
    throw new TypeError(`Unknown render probe pixel mode: ${pixels}`);
  }
  let target = RENDER_PROBE_TARGET_ALL;
  if (targetKind !== RENDER_PROBE_TARGET_ALL) {
    const targetValue = String(form.targetValue || "").trim();
    if (!targetValue) throw new TypeError(`${targetKind} must not be empty`);
    target = { [targetKind]: targetValue };
  }
  return {
    autoFreeze: form.autoFreeze !== false,
    clear: true,
    pixels,
    target,
  };
}

export function formatRenderProbeTarget(target, translate) {
  const t = requireTranslation(translate);
  if (target == null || target === RENDER_PROBE_TARGET_ALL) return t("debug.render.target.allFolders");
  for (const key of TARGET_KEYS) {
    if (target?.[key] != null) {
      const labelKey = RENDER_PROBE_TARGET_OPTIONS.find((option) => option.value === key)?.labelKey;
      const label = labelKey ? t(labelKey) : key;
      return `${label}: ${String(target[key])}`;
    }
  }
  return t("debug.render.target.unknown");
}

export function resolveRenderProbeDisplaySession(summary) {
  return summary?.activeSession || summary?.lastSession || null;
}

export function buildRenderProbeStatusRows(summary, translate) {
  const t = requireTranslation(translate);
  if (!summary) return [{ label: t("debug.render.status.state"), value: t("debug.common.unavailable"), wide: true }];
  const config = summary.config || {};
  const session = resolveRenderProbeDisplaySession(summary);
  return [
    { label: t("debug.render.status.state"), value: t(config.enabled ? "debug.render.status.armed" : "debug.render.status.disarmed") },
    { label: t("debug.render.status.pixelSampling"), value: t(config.pixels === RENDER_PROBE_PIXELS_PHASE_DIFF ? "debug.render.pixels.phaseDiff" : "debug.common.off") },
    { label: t("debug.render.status.target"), value: formatRenderProbeTarget(config.target, t), wide: true },
    { label: t("debug.render.status.autoFreeze"), value: t(config.autoFreeze === false ? "debug.common.off" : "debug.common.on") },
    {
      label: t("debug.render.status.sessionEvents"),
      value: `${normalizeCount(summary.sessionCount)} / ${normalizeCount(summary.recentEventCount)}`,
    },
    {
      label: t("debug.render.status.currentSession"),
      value: session ? `${session.id || t("debug.common.unknown")} · ${session.status || t("debug.common.unknown")}` : t("debug.common.none"),
      wide: true,
    },
    {
      label: t("debug.render.status.dragItem"),
      value: session?.dragItem?.name || session?.dragItem?.id || t("debug.common.none"),
      wide: true,
    },
    { label: t("debug.render.status.freezeReason"), value: session?.frozenReason || t("debug.common.none"), wide: true },
  ];
}

function formatFramebuffer(framebuffer, t) {
  if (!framebuffer) return t("debug.render.framebuffer.notSampled");
  if (framebuffer.available !== true) {
    return t("debug.render.framebuffer.unavailable", {
      reason: framebuffer.reason || t("debug.common.unknownReason"),
    });
  }
  const region = framebuffer.region;
  const parts = [
    t("debug.render.framebuffer.slots", { count: normalizeCount(framebuffer.slotCount) }),
    t("debug.render.framebuffer.reads", { count: normalizeCount(framebuffer.readPixelsCallCount) }),
    formatMillis(framebuffer.captureDurationMs),
  ];
  if (region?.width != null && region?.height != null) {
    parts.push(`${normalizeCount(region.width)}×${normalizeCount(region.height)}`);
  }
  if (normalizeCount(framebuffer.skippedSlotCount)) {
    parts.push(t("debug.render.framebuffer.skipped", { count: normalizeCount(framebuffer.skippedSlotCount) }));
  }
  if (normalizeCount(framebuffer.warningCount)) {
    parts.push(t("debug.render.framebuffer.warnings", { count: normalizeCount(framebuffer.warningCount) }));
  }
  return parts.join(" · ");
}

export function buildRenderProbePhaseRows(session, translate) {
  const t = requireTranslation(translate);
  return (session?.captures || []).map((capture, index) => {
    const violationCount = normalizeCount(capture?.violationCount);
    const firstViolation = capture?.firstViolation?.code || null;
    return {
      framebuffer: formatFramebuffer(capture?.framebuffer, t),
      key: `${capture?.phase || "unknown"}:${capture?.timeMs ?? "unknown"}:${index}`,
      phase: capture?.phase || "unknown",
      time: formatMillis(capture?.timeMs),
      violations: firstViolation ? `${violationCount} · ${firstViolation}` : String(violationCount),
    };
  });
}

export function buildRenderProbeCandidateRows(session, translate) {
  const t = requireTranslation(translate);
  return (session?.pixelComparison?.candidates || []).map((candidate, index) => {
    const folderLabel = candidate.folderName
      ? `${candidate.folderName} (${candidate.folderId || t("debug.common.unknown")})`
      : candidate.folderId || t("debug.render.candidates.folderUnknown");
    return {
      detail: [
        t(candidate.strongCandidate ? "debug.render.candidates.strong" : "debug.render.candidates.changed"),
        `Δ ${formatPercent(candidate.meanAbsoluteDelta)}`,
        t("debug.render.candidates.grid", { value: formatPercent(candidate.changedSampleRatio) }),
        t("debug.render.candidates.alpha", { value: formatSignedPercent(candidate.alphaGainAfterRelease) }),
        t("debug.render.candidates.brightness", { value: formatSignedPercent(candidate.brightnessGainAfterRelease) }),
      ].join(" · "),
      identity: `${folderLabel} · ${t("debug.render.candidates.slot", { slot: candidate.slot ?? "?" })} · ${candidate.itemId || t("debug.render.candidates.itemUnknown")}`,
      key: `${candidate.folderId || ""}:${candidate.itemId || ""}:${candidate.slot ?? ""}:${index}`,
      rank: index + 1,
      strong: candidate.strongCandidate === true,
      title: candidate.itemName || candidate.itemId || t("debug.render.candidates.candidate", { index: index + 1 }),
    };
  });
}
