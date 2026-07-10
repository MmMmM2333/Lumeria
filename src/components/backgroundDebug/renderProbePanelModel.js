export const RENDER_PROBE_TARGET_ALL = "all-folders";
export const RENDER_PROBE_PIXELS_OFF = "off";
export const RENDER_PROBE_PIXELS_PHASE_DIFF = "phase-diff";
export const RENDER_PROBE_TARGET_OPTIONS = [
  { label: "All folders", value: RENDER_PROBE_TARGET_ALL },
  { label: "Folder ID", value: "folderId" },
  { label: "Item ID", value: "itemId" },
  { label: "Item name", value: "itemName" },
];

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

export function formatRenderProbeTarget(target) {
  if (target == null || target === RENDER_PROBE_TARGET_ALL) return RENDER_PROBE_TARGET_ALL;
  for (const key of TARGET_KEYS) {
    if (target?.[key] != null) return `${key}: ${String(target[key])}`;
  }
  return "unknown";
}

export function resolveRenderProbeDisplaySession(summary) {
  return summary?.activeSession || summary?.lastSession || null;
}

export function buildRenderProbeStatusRows(summary) {
  if (!summary) return [{ label: "State", value: "unavailable", wide: true }];
  const config = summary.config || {};
  const session = resolveRenderProbeDisplaySession(summary);
  return [
    { label: "State", value: config.enabled ? "armed" : "disarmed" },
    { label: "Pixels", value: config.pixels || RENDER_PROBE_PIXELS_OFF },
    { label: "Target", value: formatRenderProbeTarget(config.target), wide: true },
    { label: "Auto freeze", value: config.autoFreeze === false ? "off" : "on" },
    {
      label: "Sessions / events",
      value: `${normalizeCount(summary.sessionCount)} / ${normalizeCount(summary.recentEventCount)}`,
    },
    {
      label: "Session",
      value: session ? `${session.id || "unknown"} · ${session.status || "unknown"}` : "none",
      wide: true,
    },
    {
      label: "Drag item",
      value: session?.dragItem?.name || session?.dragItem?.id || "none",
      wide: true,
    },
    { label: "Frozen", value: session?.frozenReason || "none", wide: true },
  ];
}

function formatFramebuffer(framebuffer) {
  if (!framebuffer) return "off";
  if (framebuffer.available !== true) return `unavailable · ${framebuffer.reason || "unknown reason"}`;
  const region = framebuffer.region;
  const parts = [
    `${normalizeCount(framebuffer.slotCount)} slots`,
    `${normalizeCount(framebuffer.readPixelsCallCount)} read`,
    formatMillis(framebuffer.captureDurationMs),
  ];
  if (region?.width != null && region?.height != null) {
    parts.push(`${normalizeCount(region.width)}×${normalizeCount(region.height)}`);
  }
  if (normalizeCount(framebuffer.skippedSlotCount)) {
    parts.push(`${normalizeCount(framebuffer.skippedSlotCount)} skipped`);
  }
  if (normalizeCount(framebuffer.warningCount)) {
    parts.push(`${normalizeCount(framebuffer.warningCount)} warnings`);
  }
  return parts.join(" · ");
}

export function buildRenderProbePhaseRows(session) {
  return (session?.captures || []).map((capture, index) => {
    const violationCount = normalizeCount(capture?.violationCount);
    const firstViolation = capture?.firstViolation?.code || null;
    return {
      framebuffer: formatFramebuffer(capture?.framebuffer),
      key: `${capture?.phase || "unknown"}:${capture?.timeMs ?? "unknown"}:${index}`,
      phase: capture?.phase || "unknown",
      time: formatMillis(capture?.timeMs),
      violations: firstViolation ? `${violationCount} · ${firstViolation}` : String(violationCount),
    };
  });
}

export function buildRenderProbeCandidateRows(session) {
  return (session?.pixelComparison?.candidates || []).map((candidate, index) => {
    const folderLabel = candidate.folderName
      ? `${candidate.folderName} (${candidate.folderId || "unknown"})`
      : candidate.folderId || "unknown folder";
    return {
      detail: [
        candidate.strongCandidate ? "strong" : "changed",
        `Δ ${formatPercent(candidate.meanAbsoluteDelta)}`,
        `cells ${formatPercent(candidate.changedSampleRatio)}`,
        `alpha ${formatSignedPercent(candidate.alphaGainAfterRelease)}`,
        `brightness ${formatSignedPercent(candidate.brightnessGainAfterRelease)}`,
      ].join(" · "),
      identity: `${folderLabel} · slot ${candidate.slot ?? "?"} · ${candidate.itemId || "unknown item"}`,
      key: `${candidate.folderId || ""}:${candidate.itemId || ""}:${candidate.slot ?? ""}:${index}`,
      rank: index + 1,
      strong: candidate.strongCandidate === true,
      title: candidate.itemName || candidate.itemId || `candidate ${index + 1}`,
    };
  });
}
