export type LiveDesktopPrerequisiteProbe = Readonly<{
  supportsD3d11: boolean;
  adapterCount: number;
  outputCount: number;
  reason: string;
  detail: string;
}>;

export type LiveDesktopRendererProbe = Readonly<{
  supportsDirectComposition: boolean;
  supportsWindowTarget: boolean;
  supportsRootVisual: boolean;
  supportsNativeRenderer: boolean;
  supportsNativeEffects: boolean;
  reason: string;
  detail: string;
}>;

export type LiveDesktopBackgroundSupport = Readonly<{
  platform: string;
  supportsLiveDesktopBackground: boolean;
  supportsLiveDesktopBackgroundEffects: boolean;
  reason: string;
  detail: string;
  prerequisiteProbe: LiveDesktopPrerequisiteProbe;
  rendererProbe: LiveDesktopRendererProbe;
}>;

export type LiveDesktopRuntimeDiagnostics = Readonly<{
  framesCopied: number;
  frameTimeouts: number;
  copyErrors: number;
  commitErrors: number;
  frameArrivedEvents: number;
  frameArrivedDroppedSignals: number;
  frameCopySamples: number;
  frameCopyMicrosTotal: number;
  lastFrameCopyMicros: number;
  maxFrameCopyMicros: number;
  frameCommitSamples: number;
  frameCommitMicrosTotal: number;
  lastFrameCommitMicros: number;
  maxFrameCommitMicros: number;
  configUpdates: number;
  configErrors: number;
  lastFrameWidth: number;
  lastFrameHeight: number;
  lastFrameFormat: number;
  testPatternFrames: number;
  pixelProbeSamples: number;
  pixelProbeErrors: number;
  blankFrameSkips: number;
  shaderCopyFallbacks: number;
  abandonedRendererWorkers: number;
  reapedAbandonedRendererWorkers: number;
  lastPixelProbeWidth: number;
  lastPixelProbeHeight: number;
  lastPixelProbeMinRgb: number;
  lastPixelProbeMaxRgb: number;
  lastPixelProbeAvgRgb: number;
  lastPixelProbeMinAlpha: number;
  lastPixelProbeMaxAlpha: number;
  lastPixelProbeAvgAlpha: number;
  lastShaderCopyError: string;
  lastAbandonedRendererReason: string;
  lastError: string;
  recentErrors: readonly string[];
}>;

export type LiveDesktopWindowRect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

export type LiveDesktopWindowInfo = Readonly<{
  hwnd: string;
  parentHwnd: string;
  rootHwnd: string;
  pid: number;
  className: string;
  title: string;
  processName: string;
  role: string;
  candidateReason: string;
  visible: boolean;
  style: string;
  exStyle: string;
  cloaked: number;
  rect: LiveDesktopWindowRect;
}>;

export type LiveDesktopWindowDiagnostics = Readonly<{
  platform: string;
  available: boolean;
  reason: string;
  detail: string;
  windowCount: number;
  candidateCount: number;
  windows: readonly LiveDesktopWindowInfo[];
  candidates: readonly LiveDesktopWindowInfo[];
}>;

export type LiveDesktopRuntimeStatus = Readonly<{
  phase: "stopped" | "starting" | "running" | "failed";
  active: boolean;
  generation: number;
  reason: string;
  detail: string;
  diagnostics: LiveDesktopRuntimeDiagnostics;
  windowDiagnostics: LiveDesktopWindowDiagnostics;
}>;

export type LiveDesktopBlurEffectPlan = Readonly<{
  kernel: "dualKawase" | "gaussian";
  gaussianRadiusPx: number;
  renderMaxWidth: number;
  renderMaxHeight: number;
  passCount: number;
  minSize: number;
  offsetScale: number;
  downOffsets: readonly number[];
  upOffsets: readonly number[];
  finalUpOffset: number;
}>;

export type LiveDesktopAcrylicEffectPlan = Readonly<{
  brightness: number;
  contrast: number;
  noise: number;
  saturation: number;
  seed: number;
  tintColor: readonly [number, number, number];
  tintStrength: number;
  alpha: number;
  enabled: boolean;
}>;

export type LiveDesktopEffectPlan = Readonly<{
  effect: "none" | "dimmed" | "blur" | "acrylic";
  blur: LiveDesktopBlurEffectPlan;
  acrylic: LiveDesktopAcrylicEffectPlan;
}>;

export type LiveDesktopAcrylicParams = Readonly<{
  brightness: number;
  contrast: number;
  noise: number;
  saturation: number;
  seed: number;
  tintColor: readonly [number, number, number];
  tintStrength: number;
}>;

export type LiveDesktopRuntimeConfig = Readonly<{
  effect: "none" | "dimmed" | "blur" | "acrylic";
  debugFrameSourceOverride: "testPattern" | null;
  blurStrength: number;
  darkenStrength: number;
  darkenColor: string;
  opacity: number;
  effectPlan: LiveDesktopEffectPlan | null;
  acrylicAppearance: "system" | "dark" | "light";
  acrylicParams: LiveDesktopAcrylicParams;
  disableMouseRelay: boolean;
  skipBlankFrames: boolean;
  forceDwmFlush: boolean;
}>;

type UnknownRecord = Record<string, unknown>;

const RUNTIME_COUNTER_FIELDS = [
  "framesCopied",
  "frameTimeouts",
  "copyErrors",
  "commitErrors",
  "frameArrivedEvents",
  "frameArrivedDroppedSignals",
  "frameCopySamples",
  "frameCopyMicrosTotal",
  "lastFrameCopyMicros",
  "maxFrameCopyMicros",
  "frameCommitSamples",
  "frameCommitMicrosTotal",
  "lastFrameCommitMicros",
  "maxFrameCommitMicros",
  "configUpdates",
  "configErrors",
  "lastFrameWidth",
  "lastFrameHeight",
  "testPatternFrames",
  "pixelProbeSamples",
  "pixelProbeErrors",
  "blankFrameSkips",
  "shaderCopyFallbacks",
  "abandonedRendererWorkers",
  "reapedAbandonedRendererWorkers",
  "lastPixelProbeWidth",
  "lastPixelProbeHeight",
  "lastPixelProbeMinRgb",
  "lastPixelProbeMaxRgb",
  "lastPixelProbeAvgRgb",
  "lastPixelProbeMinAlpha",
  "lastPixelProbeMaxAlpha",
  "lastPixelProbeAvgAlpha",
] as const;

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as UnknownRecord;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`);
  }
  return value;
}

function requireInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${path} must be a safe integer`);
  return value as number;
}

function requireCounter(value: unknown, path: string): number {
  const count = requireInteger(value, path);
  if (count < 0) throw new TypeError(`${path} must be non-negative`);
  return count;
}

function requireNumberArray(value: unknown, path: string): readonly number[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  value.forEach((entry, index) => requireFiniteNumber(entry, `${path}[${index}]`));
  return value as number[];
}

function requireStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  value.forEach((entry, index) => requireString(entry, `${path}[${index}]`));
  return value as string[];
}

function requireTintColor(value: unknown, path: string): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${path} must contain three numbers`);
  value.forEach((entry, index) => requireFiniteNumber(entry, `${path}[${index}]`));
  return value as [number, number, number];
}

function validatePrerequisiteProbe(value: unknown, path: string): LiveDesktopPrerequisiteProbe {
  const probe = requireRecord(value, path);
  requireBoolean(probe.supportsD3d11, `${path}.supportsD3d11`);
  requireCounter(probe.adapterCount, `${path}.adapterCount`);
  requireCounter(probe.outputCount, `${path}.outputCount`);
  requireString(probe.reason, `${path}.reason`);
  requireString(probe.detail, `${path}.detail`);
  return probe as LiveDesktopPrerequisiteProbe;
}

function validateRendererProbe(value: unknown, path: string): LiveDesktopRendererProbe {
  const probe = requireRecord(value, path);
  for (const key of [
    "supportsDirectComposition",
    "supportsWindowTarget",
    "supportsRootVisual",
    "supportsNativeRenderer",
    "supportsNativeEffects",
  ] as const) {
    requireBoolean(probe[key], `${path}.${key}`);
  }
  requireString(probe.reason, `${path}.reason`);
  requireString(probe.detail, `${path}.detail`);
  return probe as LiveDesktopRendererProbe;
}

export function assertLiveDesktopBackgroundSupport(value: unknown): LiveDesktopBackgroundSupport {
  const support = requireRecord(value, "live desktop background support");
  requireString(support.platform, "live desktop background support.platform");
  requireBoolean(support.supportsLiveDesktopBackground, "live desktop background support.supportsLiveDesktopBackground");
  requireBoolean(support.supportsLiveDesktopBackgroundEffects, "live desktop background support.supportsLiveDesktopBackgroundEffects");
  requireString(support.reason, "live desktop background support.reason");
  requireString(support.detail, "live desktop background support.detail");
  validatePrerequisiteProbe(support.prerequisiteProbe, "live desktop background support.prerequisiteProbe");
  validateRendererProbe(support.rendererProbe, "live desktop background support.rendererProbe");
  return support as LiveDesktopBackgroundSupport;
}

function validateRuntimeDiagnostics(value: unknown, path: string): LiveDesktopRuntimeDiagnostics {
  const diagnostics = requireRecord(value, path);
  for (const key of RUNTIME_COUNTER_FIELDS) requireCounter(diagnostics[key], `${path}.${key}`);
  requireInteger(diagnostics.lastFrameFormat, `${path}.lastFrameFormat`);
  requireString(diagnostics.lastShaderCopyError, `${path}.lastShaderCopyError`);
  requireString(diagnostics.lastAbandonedRendererReason, `${path}.lastAbandonedRendererReason`);
  requireString(diagnostics.lastError, `${path}.lastError`);
  requireStringArray(diagnostics.recentErrors, `${path}.recentErrors`);
  return diagnostics as LiveDesktopRuntimeDiagnostics;
}

function validateWindowRect(value: unknown, path: string): LiveDesktopWindowRect {
  const rect = requireRecord(value, path);
  for (const key of ["left", "top", "right", "bottom", "width", "height"] as const) {
    requireInteger(rect[key], `${path}.${key}`);
  }
  return rect as LiveDesktopWindowRect;
}

function validateWindowInfo(value: unknown, path: string): LiveDesktopWindowInfo {
  const info = requireRecord(value, path);
  for (const key of [
    "hwnd",
    "parentHwnd",
    "rootHwnd",
    "className",
    "title",
    "processName",
    "role",
    "candidateReason",
    "style",
    "exStyle",
  ] as const) {
    requireString(info[key], `${path}.${key}`);
  }
  requireCounter(info.pid, `${path}.pid`);
  requireBoolean(info.visible, `${path}.visible`);
  requireCounter(info.cloaked, `${path}.cloaked`);
  validateWindowRect(info.rect, `${path}.rect`);
  return info as LiveDesktopWindowInfo;
}

function validateWindowDiagnostics(value: unknown, path: string): LiveDesktopWindowDiagnostics {
  const diagnostics = requireRecord(value, path);
  requireString(diagnostics.platform, `${path}.platform`);
  requireBoolean(diagnostics.available, `${path}.available`);
  requireString(diagnostics.reason, `${path}.reason`);
  requireString(diagnostics.detail, `${path}.detail`);
  requireCounter(diagnostics.windowCount, `${path}.windowCount`);
  requireCounter(diagnostics.candidateCount, `${path}.candidateCount`);
  if (!Array.isArray(diagnostics.windows)) throw new TypeError(`${path}.windows must be an array`);
  if (!Array.isArray(diagnostics.candidates)) throw new TypeError(`${path}.candidates must be an array`);
  diagnostics.windows.forEach((entry, index) => validateWindowInfo(entry, `${path}.windows[${index}]`));
  diagnostics.candidates.forEach((entry, index) => validateWindowInfo(entry, `${path}.candidates[${index}]`));
  return diagnostics as LiveDesktopWindowDiagnostics;
}

export function assertLiveDesktopRuntimeStatus(value: unknown): LiveDesktopRuntimeStatus {
  const status = requireRecord(value, "live desktop runtime status");
  if (status.phase !== "stopped" && status.phase !== "starting" && status.phase !== "running" && status.phase !== "failed") {
    throw new TypeError("live desktop runtime status.phase must be stopped, starting, running, or failed");
  }
  requireBoolean(status.active, "live desktop runtime status.active");
  requireCounter(status.generation, "live desktop runtime status.generation");
  requireString(status.reason, "live desktop runtime status.reason");
  requireString(status.detail, "live desktop runtime status.detail");
  validateRuntimeDiagnostics(status.diagnostics, "live desktop runtime status.diagnostics");
  validateWindowDiagnostics(status.windowDiagnostics, "live desktop runtime status.windowDiagnostics");
  return status as LiveDesktopRuntimeStatus;
}

function validateAcrylicParams(value: unknown, path: string): LiveDesktopAcrylicParams {
  const params = requireRecord(value, path);
  for (const key of ["brightness", "contrast", "noise", "saturation", "seed", "tintStrength"] as const) {
    requireFiniteNumber(params[key], `${path}.${key}`);
  }
  requireTintColor(params.tintColor, `${path}.tintColor`);
  return params as LiveDesktopAcrylicParams;
}

function validateEffectPlan(value: unknown, path: string): LiveDesktopEffectPlan {
  const plan = requireRecord(value, path);
  if (plan.effect !== "none" && plan.effect !== "dimmed" && plan.effect !== "blur" && plan.effect !== "acrylic") {
    throw new TypeError(`${path}.effect must be a supported background effect`);
  }
  const blur = requireRecord(plan.blur, `${path}.blur`);
  if (blur.kernel !== "dualKawase" && blur.kernel !== "gaussian") {
    throw new TypeError(`${path}.blur.kernel must be dualKawase or gaussian`);
  }
  requireFiniteNumber(blur.gaussianRadiusPx, `${path}.blur.gaussianRadiusPx`);
  for (const key of ["renderMaxWidth", "renderMaxHeight", "passCount", "minSize"] as const) {
    requireCounter(blur[key], `${path}.blur.${key}`);
  }
  requireFiniteNumber(blur.offsetScale, `${path}.blur.offsetScale`);
  requireNumberArray(blur.downOffsets, `${path}.blur.downOffsets`);
  requireNumberArray(blur.upOffsets, `${path}.blur.upOffsets`);
  requireFiniteNumber(blur.finalUpOffset, `${path}.blur.finalUpOffset`);
  const acrylic = requireRecord(plan.acrylic, `${path}.acrylic`);
  validateAcrylicParams(acrylic, `${path}.acrylic`);
  requireFiniteNumber(acrylic.alpha, `${path}.acrylic.alpha`);
  requireBoolean(acrylic.enabled, `${path}.acrylic.enabled`);
  return plan as LiveDesktopEffectPlan;
}

export function assertLiveDesktopRuntimeConfig(value: unknown): LiveDesktopRuntimeConfig {
  const config = requireRecord(value, "live desktop runtime config");
  if (config.effect !== "none" && config.effect !== "dimmed" && config.effect !== "blur" && config.effect !== "acrylic") {
    throw new TypeError("live desktop runtime config.effect must be a supported background effect");
  }
  if (config.debugFrameSourceOverride !== null && config.debugFrameSourceOverride !== "testPattern") {
    throw new TypeError("live desktop runtime config.debugFrameSourceOverride must be null or testPattern");
  }
  requireCounter(config.blurStrength, "live desktop runtime config.blurStrength");
  requireCounter(config.darkenStrength, "live desktop runtime config.darkenStrength");
  requireString(config.darkenColor, "live desktop runtime config.darkenColor");
  requireCounter(config.opacity, "live desktop runtime config.opacity");
  if (config.effectPlan !== null) validateEffectPlan(config.effectPlan, "live desktop runtime config.effectPlan");
  if (config.acrylicAppearance !== "system" && config.acrylicAppearance !== "dark" && config.acrylicAppearance !== "light") {
    throw new TypeError("live desktop runtime config.acrylicAppearance must be system, dark, or light");
  }
  validateAcrylicParams(config.acrylicParams, "live desktop runtime config.acrylicParams");
  requireBoolean(config.disableMouseRelay, "live desktop runtime config.disableMouseRelay");
  requireBoolean(config.skipBlankFrames, "live desktop runtime config.skipBlankFrames");
  requireBoolean(config.forceDwmFlush, "live desktop runtime config.forceDwmFlush");
  return config as LiveDesktopRuntimeConfig;
}
