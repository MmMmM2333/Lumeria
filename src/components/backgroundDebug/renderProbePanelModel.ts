export const RENDER_PROBE_TARGET_ALL = "all-folders";
export const RENDER_PROBE_PIXELS_OFF = "off";
export const RENDER_PROBE_PIXELS_PHASE_DIFF = "phase-diff";

export type RenderProbeTranslate = (key: string, params?: Readonly<Record<string, unknown>>) => string;
type RenderProbeTargetKey = "folderId" | "itemId" | "itemName";
type RenderProbeTarget = typeof RENDER_PROBE_TARGET_ALL | Partial<Record<RenderProbeTargetKey, string>>;

export interface RenderProbeArmForm {
  autoFreeze?: unknown;
  pixels?: unknown;
  targetKind?: unknown;
  targetValue?: unknown;
}

export interface RenderProbeSession extends Readonly<Record<string, unknown>> {
  captures?: readonly RenderProbeCapture[];
  dragItem?: Readonly<{ id?: string; name?: string }>;
  frozenReason?: string;
  id?: string;
  pixelComparison?: RenderProbePixelComparison;
  status?: string;
}

export interface RenderProbeSummary extends Readonly<Record<string, unknown>> {
  activeSession?: RenderProbeSession | null;
  config?: Readonly<{ autoFreeze?: boolean; enabled?: boolean; pixels?: string; target?: RenderProbeTarget | null }>;
  lastSession?: RenderProbeSession | null;
  recentEventCount?: unknown;
  sessionCount?: unknown;
}

export interface RenderProbeCapture extends Readonly<Record<string, unknown>> {
  firstViolation?: Readonly<{ code?: string }> | null;
  framebuffer?: RenderProbeFramebuffer | null;
  phase?: string;
  timeMs?: unknown;
  violationCount?: unknown;
}

export interface RenderProbeFramebuffer extends Readonly<Record<string, unknown>> {
  available?: boolean;
  captureDurationMs?: unknown;
  readPixelsCallCount?: unknown;
  reason?: string;
  region?: Readonly<{ height?: unknown; width?: unknown }>;
  skippedSlotCount?: unknown;
  slotCount?: unknown;
  warningCount?: unknown;
}

export interface RenderProbeCandidate extends Readonly<Record<string, unknown>> {
  alphaGainAfterRelease?: unknown;
  brightnessGainAfterRelease?: unknown;
  changedSampleRatio?: unknown;
  folderId?: string;
  folderName?: string;
  itemId?: string;
  itemName?: string;
  meanAbsoluteDelta?: unknown;
  slot?: unknown;
  strongCandidate?: boolean;
}

export interface RenderProbePixelComparison extends Readonly<Record<string, unknown>> {
  available?: boolean;
  candidates?: readonly RenderProbeCandidate[];
  changedSlotCount?: number;
  comparableSlotCount?: number;
  reason?: string;
  strongCandidateCount?: number;
}
export const RENDER_PROBE_TARGET_OPTIONS = [
  { labelKey: "debug.render.target.allFolders", value: RENDER_PROBE_TARGET_ALL },
  { labelKey: "debug.render.target.folderId", value: "folderId" },
  { labelKey: "debug.render.target.itemId", value: "itemId" },
  { labelKey: "debug.render.target.itemName", value: "itemName" },
];

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requireOptionalFieldType(
  record: UnknownRecord,
  field: string,
  type: "boolean" | "number" | "string",
  label: string,
): void {
  const value = record[field];
  if (value === undefined) return;
  if (typeof value !== type || (type === "number" && !Number.isFinite(value))) {
    throw new TypeError(`${label}.${field} must be a ${type}`);
  }
}

function requireRenderProbeTarget(value: unknown, label: string): void {
  if (value == null || value === RENDER_PROBE_TARGET_ALL) return;
  const target = asRecord(value);
  if (!target) throw new TypeError(`${label} must be ${RENDER_PROBE_TARGET_ALL}, an object, or null`);
  const unknownKeys = Object.keys(target).filter((key) => key !== "folderId" && key !== "itemId" && key !== "itemName");
  if (unknownKeys.length) throw new TypeError(`${label} has unsupported keys: ${unknownKeys.join(", ")}`);
  for (const key of ["folderId", "itemId", "itemName"] as const) {
    requireOptionalFieldType(target, key, "string", label);
  }
}

function requireRenderProbeFramebuffer(value: unknown, label: string): void {
  if (value == null) return;
  const framebuffer = asRecord(value);
  if (!framebuffer) throw new TypeError(`${label} must be an object or null`);
  requireOptionalFieldType(framebuffer, "available", "boolean", label);
  requireOptionalFieldType(framebuffer, "reason", "string", label);
  if (framebuffer.region !== undefined) {
    const region = asRecord(framebuffer.region);
    if (!region) throw new TypeError(`${label}.region must be an object`);
    requireOptionalFieldType(region, "height", "number", `${label}.region`);
    requireOptionalFieldType(region, "width", "number", `${label}.region`);
  }
}

function requireRenderProbePixelComparison(value: unknown, label: string): void {
  if (value === undefined) return;
  const comparison = asRecord(value);
  if (!comparison) throw new TypeError(`${label} must be an object or null`);
  requireOptionalFieldType(comparison, "available", "boolean", label);
  requireOptionalFieldType(comparison, "changedSlotCount", "number", label);
  requireOptionalFieldType(comparison, "comparableSlotCount", "number", label);
  requireOptionalFieldType(comparison, "reason", "string", label);
  requireOptionalFieldType(comparison, "strongCandidateCount", "number", label);
  if (comparison.candidates !== undefined) {
    if (!Array.isArray(comparison.candidates)) throw new TypeError(`${label}.candidates must be an array`);
    comparison.candidates.forEach((candidateValue, index) => {
      const candidate = asRecord(candidateValue);
      const candidateLabel = `${label}.candidates[${index}]`;
      if (!candidate) throw new TypeError(`${candidateLabel} must be an object`);
      for (const field of ["folderId", "folderName", "itemId", "itemName"] as const) {
        requireOptionalFieldType(candidate, field, "string", candidateLabel);
      }
      requireOptionalFieldType(candidate, "strongCandidate", "boolean", candidateLabel);
    });
  }
}

function requireRenderProbeSession(value: unknown, label: string): void {
  if (value == null) return;
  const session = asRecord(value);
  if (!session) throw new TypeError(`${label} must be an object or null`);
  for (const field of ["frozenReason", "id", "status"] as const) {
    requireOptionalFieldType(session, field, "string", label);
  }
  if (session.dragItem !== undefined) {
    const dragItem = asRecord(session.dragItem);
    if (!dragItem) throw new TypeError(`${label}.dragItem must be an object`);
    requireOptionalFieldType(dragItem, "id", "string", `${label}.dragItem`);
    requireOptionalFieldType(dragItem, "name", "string", `${label}.dragItem`);
  }
  if (session.captures !== undefined) {
    if (!Array.isArray(session.captures)) throw new TypeError(`${label}.captures must be an array`);
    session.captures.forEach((captureValue, index) => {
      const capture = asRecord(captureValue);
      const captureLabel = `${label}.captures[${index}]`;
      if (!capture) throw new TypeError(`${captureLabel} must be an object`);
      requireOptionalFieldType(capture, "phase", "string", captureLabel);
      if (capture.firstViolation !== undefined && capture.firstViolation !== null) {
        const violation = asRecord(capture.firstViolation);
        if (!violation) throw new TypeError(`${captureLabel}.firstViolation must be an object or null`);
        requireOptionalFieldType(violation, "code", "string", `${captureLabel}.firstViolation`);
      }
      requireRenderProbeFramebuffer(capture.framebuffer, `${captureLabel}.framebuffer`);
    });
  }
  requireRenderProbePixelComparison(session.pixelComparison, `${label}.pixelComparison`);
}

export function requireRenderProbeSummary(value: unknown): RenderProbeSummary {
  const summary = asRecord(value);
  if (!summary) throw new TypeError("Render probe summary must be an object");
  if (summary.config !== undefined) {
    const config = asRecord(summary.config);
    if (!config) throw new TypeError("Render probe summary.config must be an object");
    requireOptionalFieldType(config, "autoFreeze", "boolean", "Render probe summary.config");
    requireOptionalFieldType(config, "enabled", "boolean", "Render probe summary.config");
    requireOptionalFieldType(config, "pixels", "string", "Render probe summary.config");
    requireRenderProbeTarget(config.target, "Render probe summary.config.target");
  }
  requireRenderProbeSession(summary.activeSession, "Render probe summary.activeSession");
  requireRenderProbeSession(summary.lastSession, "Render probe summary.lastSession");
  return summary as RenderProbeSummary;
}

function requireTranslation(translate: RenderProbeTranslate): RenderProbeTranslate {
  if (typeof translate !== "function") {
    throw new TypeError("Render probe presentation requires a translation function");
  }
  return translate;
}

export function getRenderProbeTargetOptions(translate: RenderProbeTranslate) {
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

function normalizeCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function formatMillis(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}ms` : "-";
}

function formatPercent(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "-";
}

function formatSignedPercent(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number >= 0 ? "+" : ""}${(number * 100).toFixed(1)}%`;
}

export function buildRenderProbeArmConfig(form: RenderProbeArmForm = {}): { autoFreeze: boolean; clear: true; pixels: string; target: RenderProbeTarget } {
  const targetKind = String(form.targetKind || RENDER_PROBE_TARGET_ALL);
  if (targetKind !== RENDER_PROBE_TARGET_ALL && !TARGET_KEYS.has(targetKind)) {
    throw new TypeError(`Unknown render probe target kind: ${targetKind}`);
  }
  const pixels = form.pixels || RENDER_PROBE_PIXELS_OFF;
  if (pixels !== RENDER_PROBE_PIXELS_OFF && pixels !== RENDER_PROBE_PIXELS_PHASE_DIFF) {
    throw new TypeError(`Unknown render probe pixel mode: ${pixels}`);
  }
  let target: RenderProbeTarget = RENDER_PROBE_TARGET_ALL;
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

export function formatRenderProbeTarget(target: RenderProbeTarget | null | undefined, translate: RenderProbeTranslate): string {
  const t = requireTranslation(translate);
  if (target == null || target === RENDER_PROBE_TARGET_ALL) return t("debug.render.target.allFolders");
  for (const key of TARGET_KEYS) {
    if (typeof target === "object" && target[key as RenderProbeTargetKey] != null) {
      const labelKey = RENDER_PROBE_TARGET_OPTIONS.find((option) => option.value === key)?.labelKey;
      const label = labelKey ? t(labelKey) : key;
      return `${label}: ${String(target[key as RenderProbeTargetKey])}`;
    }
  }
  return t("debug.render.target.unknown");
}

export function resolveRenderProbeDisplaySession(summary: RenderProbeSummary | null | undefined): RenderProbeSession | null {
  return summary?.activeSession || summary?.lastSession || null;
}

export function buildRenderProbeStatusRows(summary: RenderProbeSummary | null | undefined, translate: RenderProbeTranslate) {
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

function formatFramebuffer(framebuffer: RenderProbeFramebuffer | null | undefined, t: RenderProbeTranslate): string {
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

export function buildRenderProbePhaseRows(session: RenderProbeSession | null | undefined, translate: RenderProbeTranslate) {
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

export function buildRenderProbeCandidateRows(session: RenderProbeSession | null | undefined, translate: RenderProbeTranslate) {
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
