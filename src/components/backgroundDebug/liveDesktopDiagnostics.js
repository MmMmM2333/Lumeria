export const DEFAULT_LIVE_DESKTOP_STATUS = Object.freeze({
  phase: "unknown",
  active: false,
  generation: 0,
  reason: "",
  detail: "",
  diagnostics: {
    framesCopied: 0,
    frameTimeouts: 0,
    copyErrors: 0,
    commitErrors: 0,
    frameArrivedEvents: 0,
    frameArrivedDroppedSignals: 0,
    frameCopySamples: 0,
    frameCopyMicrosTotal: 0,
    lastFrameCopyMicros: 0,
    maxFrameCopyMicros: 0,
    frameCommitSamples: 0,
    frameCommitMicrosTotal: 0,
    lastFrameCommitMicros: 0,
    maxFrameCommitMicros: 0,
    configUpdates: 0,
    configErrors: 0,
    lastFrameWidth: 0,
    lastFrameHeight: 0,
    lastFrameFormat: 0,
    testPatternFrames: 0,
    pixelProbeSamples: 0,
    pixelProbeErrors: 0,
    blankFrameSkips: 0,
    shaderCopyFallbacks: 0,
    lastPixelProbeWidth: 0,
    lastPixelProbeHeight: 0,
    lastPixelProbeMinRgb: 0,
    lastPixelProbeMaxRgb: 0,
    lastPixelProbeAvgRgb: 0,
    lastPixelProbeMinAlpha: 0,
    lastPixelProbeMaxAlpha: 0,
    lastPixelProbeAvgAlpha: 0,
    lastShaderCopyError: "",
    lastError: "",
  },
  windowDiagnostics: {
    platform: "unknown",
    available: false,
    reason: "",
    detail: "",
    windowCount: 0,
    candidateCount: 0,
    windows: [],
    candidates: [],
  },
});

export function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

export function normalizeSignedInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

export function normalizeLiveDesktopStatus(status) {
  const diagnostics = status?.diagnostics || {};
  return {
    phase: String(status?.phase || DEFAULT_LIVE_DESKTOP_STATUS.phase),
    active: Boolean(status?.active),
    generation: normalizeCount(status?.generation),
    reason: String(status?.reason || ""),
    detail: String(status?.detail || ""),
    diagnostics: {
      framesCopied: normalizeCount(diagnostics.framesCopied),
      frameTimeouts: normalizeCount(diagnostics.frameTimeouts),
      copyErrors: normalizeCount(diagnostics.copyErrors),
      commitErrors: normalizeCount(diagnostics.commitErrors),
      frameArrivedEvents: normalizeCount(diagnostics.frameArrivedEvents),
      frameArrivedDroppedSignals: normalizeCount(diagnostics.frameArrivedDroppedSignals),
      frameCopySamples: normalizeCount(diagnostics.frameCopySamples),
      frameCopyMicrosTotal: normalizeCount(diagnostics.frameCopyMicrosTotal),
      lastFrameCopyMicros: normalizeCount(diagnostics.lastFrameCopyMicros),
      maxFrameCopyMicros: normalizeCount(diagnostics.maxFrameCopyMicros),
      frameCommitSamples: normalizeCount(diagnostics.frameCommitSamples),
      frameCommitMicrosTotal: normalizeCount(diagnostics.frameCommitMicrosTotal),
      lastFrameCommitMicros: normalizeCount(diagnostics.lastFrameCommitMicros),
      maxFrameCommitMicros: normalizeCount(diagnostics.maxFrameCommitMicros),
      configUpdates: normalizeCount(diagnostics.configUpdates),
      configErrors: normalizeCount(diagnostics.configErrors),
      lastFrameWidth: normalizeCount(diagnostics.lastFrameWidth),
      lastFrameHeight: normalizeCount(diagnostics.lastFrameHeight),
      lastFrameFormat: normalizeCount(diagnostics.lastFrameFormat),
      testPatternFrames: normalizeCount(diagnostics.testPatternFrames),
      pixelProbeSamples: normalizeCount(diagnostics.pixelProbeSamples),
      pixelProbeErrors: normalizeCount(diagnostics.pixelProbeErrors),
      blankFrameSkips: normalizeCount(diagnostics.blankFrameSkips),
      shaderCopyFallbacks: normalizeCount(diagnostics.shaderCopyFallbacks),
      abandonedRendererWorkers: normalizeCount(diagnostics.abandonedRendererWorkers),
      reapedAbandonedRendererWorkers: normalizeCount(diagnostics.reapedAbandonedRendererWorkers),
      lastPixelProbeWidth: normalizeCount(diagnostics.lastPixelProbeWidth),
      lastPixelProbeHeight: normalizeCount(diagnostics.lastPixelProbeHeight),
      lastPixelProbeMinRgb: normalizeCount(diagnostics.lastPixelProbeMinRgb),
      lastPixelProbeMaxRgb: normalizeCount(diagnostics.lastPixelProbeMaxRgb),
      lastPixelProbeAvgRgb: normalizeCount(diagnostics.lastPixelProbeAvgRgb),
      lastPixelProbeMinAlpha: normalizeCount(diagnostics.lastPixelProbeMinAlpha),
      lastPixelProbeMaxAlpha: normalizeCount(diagnostics.lastPixelProbeMaxAlpha),
      lastPixelProbeAvgAlpha: normalizeCount(diagnostics.lastPixelProbeAvgAlpha),
      lastShaderCopyError: String(diagnostics.lastShaderCopyError || ""),
      lastAbandonedRendererReason: String(diagnostics.lastAbandonedRendererReason || ""),
      lastError: String(diagnostics.lastError || ""),
    },
    windowDiagnostics: normalizeLiveDesktopWindowDiagnostics(status?.windowDiagnostics),
  };
}

export function normalizeLiveDesktopWindowDiagnostics(diagnostics) {
  const windows = Array.isArray(diagnostics?.windows)
    ? diagnostics.windows.map(normalizeLiveDesktopWindowInfo)
    : [];
  const candidates = Array.isArray(diagnostics?.candidates)
    ? diagnostics.candidates.map(normalizeLiveDesktopWindowInfo)
    : [];
  return {
    platform: String(diagnostics?.platform || DEFAULT_LIVE_DESKTOP_STATUS.windowDiagnostics.platform),
    available: Boolean(diagnostics?.available),
    reason: String(diagnostics?.reason || DEFAULT_LIVE_DESKTOP_STATUS.windowDiagnostics.reason),
    detail: String(diagnostics?.detail || ""),
    windowCount: normalizeCount(diagnostics?.windowCount ?? windows.length),
    candidateCount: normalizeCount(diagnostics?.candidateCount ?? candidates.length),
    windows,
    candidates,
  };
}

export function normalizeLiveDesktopWindowInfo(windowInfo) {
  return {
    hwnd: String(windowInfo?.hwnd || ""),
    parentHwnd: String(windowInfo?.parentHwnd || ""),
    rootHwnd: String(windowInfo?.rootHwnd || ""),
    pid: normalizeCount(windowInfo?.pid),
    className: String(windowInfo?.className || ""),
    title: String(windowInfo?.title || ""),
    processName: String(windowInfo?.processName || ""),
    role: String(windowInfo?.role || "window"),
    candidateReason: String(windowInfo?.candidateReason || ""),
    visible: Boolean(windowInfo?.visible),
    style: String(windowInfo?.style || ""),
    exStyle: String(windowInfo?.exStyle || ""),
    cloaked: normalizeCount(windowInfo?.cloaked),
    rect: normalizeLiveDesktopWindowRect(windowInfo?.rect),
  };
}

export function normalizeLiveDesktopWindowRect(rect) {
  return {
    left: normalizeSignedInteger(rect?.left),
    top: normalizeSignedInteger(rect?.top),
    right: normalizeSignedInteger(rect?.right),
    bottom: normalizeSignedInteger(rect?.bottom),
    width: normalizeCount(rect?.width),
    height: normalizeCount(rect?.height),
  };
}

export function formatCount(value) {
  return String(normalizeCount(value));
}

function requireTranslation(translate) {
  if (typeof translate !== "function") {
    throw new TypeError("Live Desktop diagnostic presentation requires a translation function");
  }
  return translate;
}

export function formatLastFrame(diagnostics, translate) {
  const t = requireTranslation(translate);
  if (!diagnostics.lastFrameWidth || !diagnostics.lastFrameHeight) return "-";
  return t("debug.liveDesktop.format.lastFrame", {
    format: diagnostics.lastFrameFormat,
    height: diagnostics.lastFrameHeight,
    width: diagnostics.lastFrameWidth,
  });
}

export function formatPixelProbe(diagnostics, translate) {
  const t = requireTranslation(translate);
  if (!diagnostics.pixelProbeSamples && !diagnostics.pixelProbeErrors) return "-";
  const size = diagnostics.lastPixelProbeWidth && diagnostics.lastPixelProbeHeight
    ? `${diagnostics.lastPixelProbeWidth}x${diagnostics.lastPixelProbeHeight} · `
    : "";
  return t("debug.liveDesktop.format.pixelProbe", {
    alphaAvg: diagnostics.lastPixelProbeAvgAlpha,
    alphaMax: diagnostics.lastPixelProbeMaxAlpha,
    alphaMin: diagnostics.lastPixelProbeMinAlpha,
    errors: diagnostics.pixelProbeErrors,
    rgbAvg: diagnostics.lastPixelProbeAvgRgb,
    rgbMax: diagnostics.lastPixelProbeMaxRgb,
    rgbMin: diagnostics.lastPixelProbeMinRgb,
    size,
    success: diagnostics.pixelProbeSamples,
  });
}

export function formatFrameArrived(diagnostics, translate) {
  const t = requireTranslation(translate);
  if (!diagnostics.frameArrivedEvents && !diagnostics.frameArrivedDroppedSignals) return "-";
  return t("debug.liveDesktop.format.frameArrived", {
    arrived: diagnostics.frameArrivedEvents,
    dropped: diagnostics.frameArrivedDroppedSignals,
  });
}

export function formatFrameTiming(samples, totalMicros, lastMicros, maxMicros, translate) {
  const t = requireTranslation(translate);
  if (!samples) return "-";
  const averageMicros = totalMicros / samples;
  return t("debug.liveDesktop.format.timing", {
    average: formatMicrosAsMillis(averageMicros),
    last: formatMicrosAsMillis(lastMicros),
    max: formatMicrosAsMillis(maxMicros),
  });
}

export function formatMicrosAsMillis(micros) {
  return (Number(micros) / 1000).toFixed(2);
}

export function formatLiveDesktopRates(rates, translate) {
  const t = requireTranslation(translate);
  return t("debug.liveDesktop.format.rates", {
    arrived: rates.arrivedPerSecond.toFixed(1),
    copyErrors: rates.copyErrorsPerSecond.toFixed(1),
    dropped: rates.droppedPerSecond.toFixed(1),
    frames: rates.framesPerSecond.toFixed(1),
    timeouts: rates.timeoutsPerSecond.toFixed(1),
  });
}

export function formatWindowTitle(windowInfo, translate) {
  const t = requireTranslation(translate);
  return `${windowInfo.role || t("debug.liveDesktop.windows.roleFallback")} ${windowInfo.hwnd || "-"}`;
}

export function formatWindowMeta(windowInfo, translate) {
  const t = requireTranslation(translate);
  const process = windowInfo.processName || `pid ${windowInfo.pid}`;
  const className = windowInfo.className || t("debug.liveDesktop.windows.classFallback");
  const reason = windowInfo.candidateReason || t("debug.liveDesktop.windows.reasonFallback");
  const title = windowInfo.title ? ` · ${windowInfo.title}` : "";
  return t("debug.liveDesktop.windows.meta", {
    className,
    cloaked: windowInfo.cloaked,
    exStyle: windowInfo.exStyle || "-",
    parent: windowInfo.parentHwnd || "-",
    process,
    reason,
    root: windowInfo.rootHwnd || "-",
    style: windowInfo.style || "-",
    title,
  });
}

export function formatWindowRect(rect) {
  return `${rect.left},${rect.top} ${rect.width}x${rect.height}`;
}
