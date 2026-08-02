export const RENDER_PROBE_TARGET_ALL = "all-folders";
export const RENDER_PROBE_PIXELS_OFF = "off";
export const RENDER_PROBE_PIXELS_PHASE_DIFF = "phase-diff";
export const RENDER_PROBE_TARGET_OPTIONS = [
  { label: "全部文件夹", value: RENDER_PROBE_TARGET_ALL },
  { label: "文件夹 ID", value: "folderId" },
  { label: "项目 ID", value: "itemId" },
  { label: "项目名称", value: "itemName" },
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
  if (target == null || target === RENDER_PROBE_TARGET_ALL) return "全部文件夹";
  for (const key of TARGET_KEYS) {
    if (target?.[key] != null) {
      const label = RENDER_PROBE_TARGET_OPTIONS.find((option) => option.value === key)?.label || key;
      return `${label}: ${String(target[key])}`;
    }
  }
  return "未知目标";
}

export function resolveRenderProbeDisplaySession(summary) {
  return summary?.activeSession || summary?.lastSession || null;
}

export function buildRenderProbeStatusRows(summary) {
  if (!summary) return [{ label: "状态", value: "不可用", wide: true }];
  const config = summary.config || {};
  const session = resolveRenderProbeDisplaySession(summary);
  return [
    { label: "状态", value: config.enabled ? "已布防" : "未布防" },
    { label: "像素采样", value: config.pixels === RENDER_PROBE_PIXELS_PHASE_DIFF ? "阶段差异" : "关闭" },
    { label: "目标", value: formatRenderProbeTarget(config.target), wide: true },
    { label: "自动冻结", value: config.autoFreeze === false ? "关闭" : "开启" },
    {
      label: "会话 / 事件",
      value: `${normalizeCount(summary.sessionCount)} / ${normalizeCount(summary.recentEventCount)}`,
    },
    {
      label: "当前会话",
      value: session ? `${session.id || "未知"} · ${session.status || "未知"}` : "无",
      wide: true,
    },
    {
      label: "拖拽项目",
      value: session?.dragItem?.name || session?.dragItem?.id || "无",
      wide: true,
    },
    { label: "冻结原因", value: session?.frozenReason || "无", wide: true },
  ];
}

function formatFramebuffer(framebuffer) {
  if (!framebuffer) return "未采样";
  if (framebuffer.available !== true) return `不可用 · ${framebuffer.reason || "未知原因"}`;
  const region = framebuffer.region;
  const parts = [
    `${normalizeCount(framebuffer.slotCount)} 个槽位`,
    `${normalizeCount(framebuffer.readPixelsCallCount)} 次读取`,
    formatMillis(framebuffer.captureDurationMs),
  ];
  if (region?.width != null && region?.height != null) {
    parts.push(`${normalizeCount(region.width)}×${normalizeCount(region.height)}`);
  }
  if (normalizeCount(framebuffer.skippedSlotCount)) {
    parts.push(`跳过 ${normalizeCount(framebuffer.skippedSlotCount)}`);
  }
  if (normalizeCount(framebuffer.warningCount)) {
    parts.push(`${normalizeCount(framebuffer.warningCount)} 条警告`);
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
      ? `${candidate.folderName} (${candidate.folderId || "未知"})`
      : candidate.folderId || "未知文件夹";
    return {
      detail: [
        candidate.strongCandidate ? "强候选" : "有变化",
        `Δ ${formatPercent(candidate.meanAbsoluteDelta)}`,
        `网格 ${formatPercent(candidate.changedSampleRatio)}`,
        `Alpha ${formatSignedPercent(candidate.alphaGainAfterRelease)}`,
        `亮度 ${formatSignedPercent(candidate.brightnessGainAfterRelease)}`,
      ].join(" · "),
      identity: `${folderLabel} · 槽位 ${candidate.slot ?? "?"} · ${candidate.itemId || "未知项目"}`,
      key: `${candidate.folderId || ""}:${candidate.itemId || ""}:${candidate.slot ?? ""}:${index}`,
      rank: index + 1,
      strong: candidate.strongCandidate === true,
      title: candidate.itemName || candidate.itemId || `候选 ${index + 1}`,
    };
  });
}
