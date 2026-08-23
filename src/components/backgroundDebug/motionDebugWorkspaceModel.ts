import {
  MOTION_CAPTURE_ALLOWED_PROPS,
  MOTION_CAPTURE_PROFILE_CUSTOM,
  MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL,
  normalizeMotionCaptureProfile,
  normalizeMotionCapturePropAllowlist,
  normalizeMotionCaptureTargetFilters,
} from "./motionCaptureProfileModel.js";
import type {
  MotionCaptureAllowedProp,
  MotionCaptureProfile,
  MotionCaptureProfileInput,
  MotionCaptureProfileLike,
  MotionCaptureTargetFilters,
  MotionCaptureTargetFiltersInput,
} from "./motionCaptureProfileModel.js";

export type MotionDebugWorkspaceMode = typeof MOTION_DEBUG_WORKSPACE_MODE_DOCK | typeof MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN;

export interface MotionDebugWorkspaceFilters {
  preset: string;
  query: string;
}

export interface MotionDebugTargetRef {
  kind?: string;
  label?: string;
  layer?: string;
  sourceLabel?: string;
  targetId?: number;
}

export interface MotionDebugTrackRef extends MotionDebugTargetRef {
  lane: string;
  laneKey: string;
  prop: string;
}

export interface MotionDebugPinnedTarget extends MotionDebugTargetRef {
  key: string;
}

export interface MotionDebugWorkspaceSession extends Readonly<Record<string, unknown>> {
  captureEventTypes: string[];
  captureIncludeEvents: boolean;
  captureIncludeSamples: boolean;
  captureProfileId: string;
  capturePropAllowlist: MotionCaptureAllowedProp[];
  captureTargetFilters: MotionCaptureTargetFilters;
  dockWidthPx: number;
  filters: MotionDebugWorkspaceFilters;
  isOpen: boolean;
  mode: MotionDebugWorkspaceMode;
  pinnedTargets: MotionDebugPinnedTarget[];
  selectedTarget: MotionDebugTargetRef | null;
  selectedTimeMs: number;
  selectedTrack: MotionDebugTrackRef | null;
}

export interface MotionDebugWorkspaceSessionInput extends Readonly<Record<string, unknown>> {
  captureEventTypes?: unknown;
  captureIncludeEvents?: unknown;
  captureIncludeSamples?: unknown;
  captureProfileId?: unknown;
  capturePropAllowlist?: unknown;
  captureTargetFilters?: MotionCaptureTargetFiltersInput | undefined;
  dockWidthPx?: unknown;
  eventTypes?: unknown;
  filters?: Readonly<{ preset?: unknown; query?: unknown }>;
  id?: unknown;
  includeEvents?: unknown;
  includeSamples?: unknown;
  isOpen?: unknown;
  mode?: unknown;
  pinnedTargets?: unknown;
  propAllowlist?: unknown;
  props?: unknown;
  selectedTarget?: unknown;
  selectedTimeMs?: unknown;
  selectedTrack?: unknown;
  targetFilters?: MotionCaptureTargetFiltersInput | undefined;
  targets?: MotionCaptureTargetFiltersInput | undefined;
  viewportWidth?: unknown;
}

export interface MotionDebugWorkspaceViewportOptions {
  viewportWidth?: unknown;
}

export interface MotionDebugWorkspaceOpenOptions extends MotionDebugWorkspaceViewportOptions {
  dockWidthPx?: unknown;
  mode?: unknown;
}

export const MOTION_DEBUG_WORKSPACE_MODE_DOCK = "dock";
export const MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN = "fullscreen";
export const MOTION_DEBUG_DEFAULT_PROFILE_ID = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL;
export const MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_DEFAULT = 900;
export const MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN = 520;
export const MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX = 960;

export const MOTION_DEBUG_QUICK_PANEL_CONTROLS = [
  { id: "record", label: "Record", labelKey: "debug.motion.settings.recordHistory", kind: "toggle" },
  { id: "overlay", label: "Overlay", labelKey: "debug.motion.fields.overlay", kind: "toggle" },
  { id: "time-scale", label: "Time scale", labelKey: "debug.motion.fields.timeScale", kind: "slider" },
  { id: "replay-capture", label: "Replay capture", labelKey: "debug.motion.sections.replayCapture", kind: "command" },
  { id: "open-workspace", label: "Open workspace", labelKey: "debug.motion.actions.openWorkspace", kind: "command" },
  { id: "copy-ai-report", label: "Copy AI report", labelKey: "debug.motion.actions.copyAiReport", kind: "command" },
];

export const MOTION_DEBUG_WORKSPACE_REGIONS = [
  { id: "left", label: "Targets", labelKey: "debug.motion.sections.targets", sections: ["layer-tree", "target-tree", "filters", "pins"] },
  { id: "center", label: "Timeline", labelKey: "debug.motion.sections.timeline", sections: ["timeline", "curves", "replay-scrubber", "event-track"] },
  { id: "right", label: "Inspector", labelKey: "debug.motion.sections.inspector", sections: ["inspector", "properties", "lane-breakdown", "warnings", "ai-export"] },
];

const QUICK_PANEL_CONTROL_IDS = new Set(MOTION_DEBUG_QUICK_PANEL_CONTROLS.map((control) => control.id));
const WORKSPACE_SECTION_IDS = new Set(MOTION_DEBUG_WORKSPACE_REGIONS.flatMap((region) => region.sections));

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readString(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeWorkspaceMode(value: unknown): MotionDebugWorkspaceMode {
  return value === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN
    ? MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN
    : MOTION_DEBUG_WORKSPACE_MODE_DOCK;
}

function normalizeViewportDockMax(viewportWidth: unknown): number {
  const viewport = readNumber(viewportWidth, 0);
  if (viewport <= 0) return MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX;
  return Math.max(
    MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN,
    Math.min(MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX, Math.floor(viewport - 48)),
  );
}

export function normalizeMotionDebugWorkspaceDockWidth(value: unknown, options: MotionDebugWorkspaceViewportOptions = {}): number {
  const max = normalizeViewportDockMax(options.viewportWidth);
  const fallback = Math.min(MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_DEFAULT, max);
  return Math.min(max, Math.max(
    MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN,
    Math.round(readNumber(value, fallback)),
  ));
}

function normalizeWorkspaceFilters(filters: Readonly<{ preset?: unknown; query?: unknown }> = {}): MotionDebugWorkspaceFilters {
  return {
    preset: readString(filters.preset, "all"),
    query: readString(filters.query, ""),
  };
}

function hasOwnValue(source: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeCaptureProfileState(input: MotionCaptureProfileLike | MotionDebugWorkspaceSessionInput = {}): Pick<MotionDebugWorkspaceSession, "captureEventTypes" | "captureIncludeEvents" | "captureIncludeSamples" | "captureProfileId" | "capturePropAllowlist" | "captureTargetFilters"> {
  const source = typeof input === "string" ? { id: input } : (input && typeof input === "object" ? input : {});
  const profileInput: MotionCaptureProfileInput = {
    id: source.captureProfileId ?? source.id ?? MOTION_DEBUG_DEFAULT_PROFILE_ID,
  };
  if (hasOwnValue(source, "captureEventTypes") || hasOwnValue(source, "eventTypes")) {
    profileInput.eventTypes = source.captureEventTypes ?? source.eventTypes;
  }
  if (hasOwnValue(source, "captureIncludeEvents") || hasOwnValue(source, "includeEvents")) {
    profileInput.includeEvents = source.captureIncludeEvents ?? source.includeEvents;
  }
  if (hasOwnValue(source, "captureIncludeSamples") || hasOwnValue(source, "includeSamples")) {
    profileInput.includeSamples = source.captureIncludeSamples ?? source.includeSamples;
  }
  if (hasOwnValue(source, "capturePropAllowlist") || hasOwnValue(source, "propAllowlist") || hasOwnValue(source, "props")) {
    profileInput.propAllowlist = source.capturePropAllowlist ?? source.propAllowlist ?? source.props;
  }
  if (hasOwnValue(source, "captureTargetFilters") || hasOwnValue(source, "targetFilters") || hasOwnValue(source, "targets")) {
    profileInput.targetFilters = (source.captureTargetFilters ?? source.targetFilters ?? source.targets) as MotionCaptureTargetFiltersInput;
  }
  const profile = normalizeMotionCaptureProfile(profileInput);
  const propAllowlist = profile.propAllowlist.length
    ? profile.propAllowlist
    : [MOTION_CAPTURE_ALLOWED_PROPS[0]];
  return {
    captureEventTypes: [...profile.eventTypes],
    captureIncludeEvents: profile.includeEvents,
    captureIncludeSamples: profile.includeSamples,
    captureProfileId: profile.id,
    capturePropAllowlist: [...propAllowlist],
    captureTargetFilters: normalizeMotionCaptureTargetFilters(profile.targetFilters),
  };
}

function normalizeTargetRef(target: unknown = null): MotionDebugTargetRef | null {
  if (target == null) return null;
  if (typeof target === "string" || typeof target === "number") {
    return { sourceLabel: String(target) };
  }
  if (typeof target !== "object") return null;
  const source = target as Readonly<Record<string, unknown>>;
  const normalized: MotionDebugTargetRef = {};
  if (source.targetId != null && Number.isFinite(Number(source.targetId))) normalized.targetId = Number(source.targetId);
  if (source.sourceLabel != null) normalized.sourceLabel = String(source.sourceLabel);
  if (source.label != null) normalized.label = String(source.label);
  if (source.layer != null) normalized.layer = String(source.layer);
  if (source.kind != null) normalized.kind = String(source.kind);
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeTrackRef(track: unknown = null): MotionDebugTrackRef | null {
  if (!track || typeof track !== "object") return null;
  const source = track as Readonly<Record<string, unknown>>;
  const normalized: MotionDebugTrackRef = {
    lane: readString(source.lane, "base"),
    laneKey: readString(source.laneKey, "default"),
    prop: readString(source.prop, "unknown"),
  };
  const target = normalizeTargetRef(track);
  if (target?.targetId != null) normalized.targetId = target.targetId;
  if (target?.sourceLabel != null) normalized.sourceLabel = target.sourceLabel;
  return normalized;
}

function makeTargetPinKey(target: unknown): string | null {
  const normalized = normalizeTargetRef(target);
  if (!normalized) return null;
  if (normalized.targetId != null) return `id:${normalized.targetId}`;
  if (normalized.sourceLabel) return `source:${normalized.sourceLabel}`;
  if (normalized.label) return `label:${normalized.label}`;
  return null;
}

function normalizePinnedTargets(targets: unknown = []): MotionDebugPinnedTarget[] {
  const pins: MotionDebugPinnedTarget[] = [];
  const seen = new Set<string>();
  for (const target of Array.isArray(targets) ? targets : []) {
    const normalized = normalizeTargetRef(target);
    const key = makeTargetPinKey(normalized);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    pins.push({ ...normalized, key });
  }
  return pins;
}

export function isMotionDebugQuickPanelControl(id: unknown): boolean {
  return QUICK_PANEL_CONTROL_IDS.has(String(id));
}

export function isMotionDebugWorkspaceSection(id: unknown): boolean {
  return WORKSPACE_SECTION_IDS.has(String(id));
}

export function createMotionDebugWorkspaceSession(input: MotionDebugWorkspaceSessionInput = {}): MotionDebugWorkspaceSession {
  const captureProfileState = normalizeCaptureProfileState(input);
  return {
    ...captureProfileState,
    dockWidthPx: normalizeMotionDebugWorkspaceDockWidth(input.dockWidthPx, { viewportWidth: input.viewportWidth }),
    filters: normalizeWorkspaceFilters(input.filters),
    isOpen: Boolean(input.isOpen),
    mode: normalizeWorkspaceMode(input.mode),
    pinnedTargets: normalizePinnedTargets(input.pinnedTargets),
    selectedTarget: normalizeTargetRef(input.selectedTarget),
    selectedTimeMs: Math.max(0, readNumber(input.selectedTimeMs, 0)),
    selectedTrack: normalizeTrackRef(input.selectedTrack),
  };
}

export function buildMotionDebugWorkspaceCaptureProfile(session: MotionDebugWorkspaceSessionInput = {}): MotionCaptureProfile {
  const current = createMotionDebugWorkspaceSession(session);
  return normalizeMotionCaptureProfile({
    eventTypes: current.captureEventTypes,
    id: current.captureProfileId,
    includeEvents: current.captureIncludeEvents,
    includeSamples: current.captureIncludeSamples,
    propAllowlist: current.capturePropAllowlist,
    targetFilters: current.captureTargetFilters,
  });
}

export function openMotionDebugWorkspace(session: MotionDebugWorkspaceSessionInput = {}, options: MotionDebugWorkspaceOpenOptions = {}): MotionDebugWorkspaceSession {
  return {
    ...createMotionDebugWorkspaceSession(session),
    dockWidthPx: normalizeMotionDebugWorkspaceDockWidth(options.dockWidthPx ?? session.dockWidthPx, {
      viewportWidth: options.viewportWidth ?? session.viewportWidth,
    }),
    isOpen: true,
    mode: normalizeWorkspaceMode(options.mode ?? session.mode),
  };
}

export function closeMotionDebugWorkspace(session: MotionDebugWorkspaceSessionInput = {}): MotionDebugWorkspaceSession {
  return {
    ...createMotionDebugWorkspaceSession(session),
    isOpen: false,
  };
}

export function setMotionDebugWorkspaceMode(session: MotionDebugWorkspaceSessionInput = {}, mode: unknown = MOTION_DEBUG_WORKSPACE_MODE_DOCK): MotionDebugWorkspaceSession {
  return {
    ...createMotionDebugWorkspaceSession(session),
    mode: normalizeWorkspaceMode(mode),
  };
}

export function toggleMotionDebugWorkspaceFullscreen(session: MotionDebugWorkspaceSessionInput = {}): MotionDebugWorkspaceSession {
  const current = createMotionDebugWorkspaceSession(session);
  return {
    ...current,
    isOpen: true,
    mode: current.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN
      ? MOTION_DEBUG_WORKSPACE_MODE_DOCK
      : MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN,
  };
}

export function resizeMotionDebugWorkspaceDock(session: MotionDebugWorkspaceSessionInput = {}, widthPx: unknown, options: MotionDebugWorkspaceViewportOptions = {}): MotionDebugWorkspaceSession {
  return {
    ...createMotionDebugWorkspaceSession(session),
    dockWidthPx: normalizeMotionDebugWorkspaceDockWidth(widthPx, options),
  };
}

export function resizeMotionDebugWorkspaceDockByDelta(session: MotionDebugWorkspaceSessionInput = {}, deltaPx: unknown = 0, options: MotionDebugWorkspaceViewportOptions = {}): MotionDebugWorkspaceSession {
  const current = createMotionDebugWorkspaceSession(session);
  return resizeMotionDebugWorkspaceDock(
    current,
    current.dockWidthPx + readNumber(deltaPx, 0),
    options,
  );
}

export function setMotionDebugWorkspaceCaptureProfile(session: MotionDebugWorkspaceSessionInput = {}, profileInput: MotionCaptureProfileLike | MotionDebugWorkspaceSessionInput = MOTION_DEBUG_DEFAULT_PROFILE_ID): MotionDebugWorkspaceSession {
  return {
    ...createMotionDebugWorkspaceSession(session),
    ...normalizeCaptureProfileState(profileInput),
  };
}

export function toggleMotionDebugWorkspaceCaptureProp(session: MotionDebugWorkspaceSessionInput = {}, prop: unknown, enabled?: unknown): MotionDebugWorkspaceSession {
  const current = createMotionDebugWorkspaceSession(session);
  const propName = readString(prop);
  if (!MOTION_CAPTURE_ALLOWED_PROPS.includes(propName as MotionCaptureAllowedProp)) return current;
  const allowedProp = propName as MotionCaptureAllowedProp;
  const propSet = new Set(normalizeMotionCapturePropAllowlist(current.capturePropAllowlist));
  const shouldEnable = enabled == null ? !propSet.has(allowedProp) : Boolean(enabled);
  if (shouldEnable) {
    propSet.add(allowedProp);
  } else {
    if (propSet.size <= 1 && propSet.has(allowedProp)) return current;
    propSet.delete(allowedProp);
  }
  return {
    ...current,
    captureProfileId: MOTION_CAPTURE_PROFILE_CUSTOM,
    capturePropAllowlist: MOTION_CAPTURE_ALLOWED_PROPS.filter((allowedProp) => propSet.has(allowedProp)),
  };
}

export function setMotionDebugWorkspaceCaptureTargetFilters(session: MotionDebugWorkspaceSessionInput = {}, filters: MotionCaptureTargetFiltersInput = {}): MotionDebugWorkspaceSession {
  return {
    ...createMotionDebugWorkspaceSession(session),
    captureProfileId: MOTION_CAPTURE_PROFILE_CUSTOM,
    captureTargetFilters: normalizeMotionCaptureTargetFilters(filters),
  };
}

export function selectMotionDebugWorkspaceTarget(session: MotionDebugWorkspaceSessionInput = {}, target: unknown = null): MotionDebugWorkspaceSession {
  const current = createMotionDebugWorkspaceSession(session);
  const selectedTarget = normalizeTargetRef(target);
  const selectedKey = makeTargetPinKey(selectedTarget);
  const currentTrackKey = makeTargetPinKey(current.selectedTrack);
  return {
    ...current,
    selectedTarget,
    selectedTrack: selectedKey && selectedKey === currentTrackKey ? current.selectedTrack : null,
  };
}

export function selectMotionDebugWorkspaceTrack(session: MotionDebugWorkspaceSessionInput = {}, track: unknown = null): MotionDebugWorkspaceSession {
  const current = createMotionDebugWorkspaceSession(session);
  const selectedTrack = normalizeTrackRef(track);
  return {
    ...current,
    selectedTarget: selectedTrack
      ? normalizeTargetRef(selectedTrack) || current.selectedTarget
      : current.selectedTarget,
    selectedTrack,
  };
}

export function setMotionDebugWorkspaceFilters(session: MotionDebugWorkspaceSessionInput = {}, filters: Readonly<{ preset?: unknown; query?: unknown }> = {}): MotionDebugWorkspaceSession {
  return {
    ...createMotionDebugWorkspaceSession(session),
    filters: normalizeWorkspaceFilters(filters),
  };
}

export function setMotionDebugWorkspaceTime(session: MotionDebugWorkspaceSessionInput = {}, timeMs: unknown = 0): MotionDebugWorkspaceSession {
  return {
    ...createMotionDebugWorkspaceSession(session),
    selectedTimeMs: Math.max(0, readNumber(timeMs, 0)),
  };
}

export function toggleMotionDebugWorkspacePin(session: MotionDebugWorkspaceSessionInput = {}, target: unknown = null): MotionDebugWorkspaceSession {
  const current = createMotionDebugWorkspaceSession(session);
  const normalized = normalizeTargetRef(target);
  const key = makeTargetPinKey(normalized);
  if (!normalized || !key) return current;
  const hasPin = current.pinnedTargets.some((pin) => pin.key === key);
  return {
    ...current,
    pinnedTargets: hasPin
      ? current.pinnedTargets.filter((pin) => pin.key !== key)
      : [...current.pinnedTargets, { ...normalized, key }],
  };
}
