type UnknownFields = Readonly<Record<string, unknown>>;

export type LiveDesktopTranslate = (key: string, params?: UnknownFields) => string;

export interface LiveDesktopWindowRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface LiveDesktopWindowInfo {
  candidateReason: string;
  className: string;
  cloaked: number;
  exStyle: string;
  hwnd: string;
  parentHwnd: string;
  pid: number;
  processName: string;
  rect: LiveDesktopWindowRect;
  role: string;
  rootHwnd: string;
  style: string;
  title: string;
  visible: boolean;
}

export interface LiveDesktopWindowDiagnostics {
  available: boolean;
  candidateCount: number;
  candidates: LiveDesktopWindowInfo[];
  detail: string;
  platform: string;
  reason: string;
  windowCount: number;
  windows: LiveDesktopWindowInfo[];
}

export interface LiveDesktopDiagnostics extends UnknownFields {
  abandonedRendererWorkers: number;
  blankFrameSkips: number;
  commitErrors: number;
  configErrors: number;
  configUpdates: number;
  copyErrors: number;
  frameArrivedDroppedSignals: number;
  frameArrivedEvents: number;
  frameCommitMicrosTotal: number;
  frameCommitSamples: number;
  frameCopyMicrosTotal: number;
  frameCopySamples: number;
  frameTimeouts: number;
  framesCopied: number;
  lastAbandonedRendererReason: string;
  lastError: string;
  lastFrameCommitMicros: number;
  lastFrameCopyMicros: number;
  lastFrameFormat: number;
  lastFrameHeight: number;
  lastFrameWidth: number;
  lastPixelProbeAvgAlpha: number;
  lastPixelProbeAvgRgb: number;
  lastPixelProbeHeight: number;
  lastPixelProbeMaxAlpha: number;
  lastPixelProbeMaxRgb: number;
  lastPixelProbeMinAlpha: number;
  lastPixelProbeMinRgb: number;
  lastPixelProbeWidth: number;
  lastShaderCopyError: string;
  maxFrameCommitMicros: number;
  maxFrameCopyMicros: number;
  pixelProbeErrors: number;
  pixelProbeSamples: number;
  reapedAbandonedRendererWorkers: number;
  shaderCopyFallbacks: number;
  testPatternFrames: number;
}

export interface LiveDesktopStatus {
  active: boolean;
  detail: string;
  diagnostics: LiveDesktopDiagnostics;
  generation: number;
  phase: string;
  reason: string;
  windowDiagnostics: LiveDesktopWindowDiagnostics;
}

export interface LiveDesktopRates {
  arrivedPerSecond: number;
  copyErrorsPerSecond: number;
  droppedPerSecond: number;
  framesPerSecond: number;
  timeoutsPerSecond: number;
}

function readFields(value: unknown): UnknownFields {
  return value !== null && typeof value === "object" ? value as UnknownFields : {};
}

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

export function normalizeCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

export function normalizeSignedInteger(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

export function normalizeLiveDesktopStatus(status: unknown): LiveDesktopStatus {
  const source = readFields(status);
  const diagnostics = readFields(source.diagnostics);
  return {
    phase: String(source.phase || DEFAULT_LIVE_DESKTOP_STATUS.phase),
    active: Boolean(source.active),
    generation: normalizeCount(source.generation),
    reason: String(source.reason || ""),
    detail: String(source.detail || ""),
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
    windowDiagnostics: normalizeLiveDesktopWindowDiagnostics(source.windowDiagnostics),
  };
}

export function normalizeLiveDesktopWindowDiagnostics(diagnostics: unknown): LiveDesktopWindowDiagnostics {
  const source = readFields(diagnostics);
  const windows = Array.isArray(source.windows)
    ? source.windows.map(normalizeLiveDesktopWindowInfo)
    : [];
  const candidates = Array.isArray(source.candidates)
    ? source.candidates.map(normalizeLiveDesktopWindowInfo)
    : [];
  return {
    platform: String(source.platform || DEFAULT_LIVE_DESKTOP_STATUS.windowDiagnostics.platform),
    available: Boolean(source.available),
    reason: String(source.reason || DEFAULT_LIVE_DESKTOP_STATUS.windowDiagnostics.reason),
    detail: String(source.detail || ""),
    windowCount: normalizeCount(source.windowCount ?? windows.length),
    candidateCount: normalizeCount(source.candidateCount ?? candidates.length),
    windows,
    candidates,
  };
}

export function normalizeLiveDesktopWindowInfo(windowInfo: unknown): LiveDesktopWindowInfo {
  const source = readFields(windowInfo);
  return {
    hwnd: String(source.hwnd || ""),
    parentHwnd: String(source.parentHwnd || ""),
    rootHwnd: String(source.rootHwnd || ""),
    pid: normalizeCount(source.pid),
    className: String(source.className || ""),
    title: String(source.title || ""),
    processName: String(source.processName || ""),
    role: String(source.role || "window"),
    candidateReason: String(source.candidateReason || ""),
    visible: Boolean(source.visible),
    style: String(source.style || ""),
    exStyle: String(source.exStyle || ""),
    cloaked: normalizeCount(source.cloaked),
    rect: normalizeLiveDesktopWindowRect(source.rect),
  };
}

export function normalizeLiveDesktopWindowRect(rect: unknown): LiveDesktopWindowRect {
  const source = readFields(rect);
  return {
    left: normalizeSignedInteger(source.left),
    top: normalizeSignedInteger(source.top),
    right: normalizeSignedInteger(source.right),
    bottom: normalizeSignedInteger(source.bottom),
    width: normalizeCount(source.width),
    height: normalizeCount(source.height),
  };
}

export function formatCount(value: unknown): string {
  return String(normalizeCount(value));
}

function requireTranslation(translate: LiveDesktopTranslate): LiveDesktopTranslate {
  if (typeof translate !== "function") {
    throw new TypeError("Live Desktop diagnostic presentation requires a translation function");
  }
  return translate;
}

export function formatLastFrame(diagnostics: LiveDesktopDiagnostics, translate: LiveDesktopTranslate): string {
  const t = requireTranslation(translate);
  if (!diagnostics.lastFrameWidth || !diagnostics.lastFrameHeight) return "-";
  return t("debug.liveDesktop.format.lastFrame", {
    format: diagnostics.lastFrameFormat,
    height: diagnostics.lastFrameHeight,
    width: diagnostics.lastFrameWidth,
  });
}

export function formatPixelProbe(diagnostics: LiveDesktopDiagnostics, translate: LiveDesktopTranslate): string {
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

export function formatFrameArrived(diagnostics: LiveDesktopDiagnostics, translate: LiveDesktopTranslate): string {
  const t = requireTranslation(translate);
  if (!diagnostics.frameArrivedEvents && !diagnostics.frameArrivedDroppedSignals) return "-";
  return t("debug.liveDesktop.format.frameArrived", {
    arrived: diagnostics.frameArrivedEvents,
    dropped: diagnostics.frameArrivedDroppedSignals,
  });
}

export function formatFrameTiming(samples: number, totalMicros: number, lastMicros: number, maxMicros: number, translate: LiveDesktopTranslate): string {
  const t = requireTranslation(translate);
  if (!samples) return "-";
  const averageMicros = totalMicros / samples;
  return t("debug.liveDesktop.format.timing", {
    average: formatMicrosAsMillis(averageMicros),
    last: formatMicrosAsMillis(lastMicros),
    max: formatMicrosAsMillis(maxMicros),
  });
}

export function formatMicrosAsMillis(micros: unknown): string {
  return (Number(micros) / 1000).toFixed(2);
}

export function formatLiveDesktopRates(rates: LiveDesktopRates, translate: LiveDesktopTranslate): string {
  const t = requireTranslation(translate);
  return t("debug.liveDesktop.format.rates", {
    arrived: rates.arrivedPerSecond.toFixed(1),
    copyErrors: rates.copyErrorsPerSecond.toFixed(1),
    dropped: rates.droppedPerSecond.toFixed(1),
    frames: rates.framesPerSecond.toFixed(1),
    timeouts: rates.timeoutsPerSecond.toFixed(1),
  });
}

export function formatWindowTitle(windowInfo: LiveDesktopWindowInfo, translate: LiveDesktopTranslate): string {
  const t = requireTranslation(translate);
  return `${windowInfo.role || t("debug.liveDesktop.windows.roleFallback")} ${windowInfo.hwnd || "-"}`;
}

export function formatWindowMeta(windowInfo: LiveDesktopWindowInfo, translate: LiveDesktopTranslate): string {
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

export function formatWindowRect(rect: LiveDesktopWindowRect): string {
  return `${rect.left},${rect.top} ${rect.width}x${rect.height}`;
}
