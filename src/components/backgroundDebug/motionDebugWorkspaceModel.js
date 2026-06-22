export const MOTION_DEBUG_WORKSPACE_MODE_DOCK = "dock";
export const MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN = "fullscreen";
export const MOTION_DEBUG_DEFAULT_PROFILE_ID = "default-visual";
export const MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_DEFAULT = 680;
export const MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN = 520;
export const MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX = 960;

export const MOTION_DEBUG_QUICK_PANEL_CONTROLS = [
  { id: "record", label: "Record", kind: "toggle" },
  { id: "overlay", label: "Overlay", kind: "toggle" },
  { id: "time-scale", label: "Time Scale", kind: "slider" },
  { id: "replay-capture", label: "Replay Capture", kind: "command" },
  { id: "open-workspace", label: "Open Workspace", kind: "command" },
  { id: "copy-ai-report", label: "Copy AI Report", kind: "command" },
];

export const MOTION_DEBUG_WORKSPACE_REGIONS = [
  { id: "left", label: "Targets", sections: ["layer-tree", "target-tree", "filters", "pins"] },
  { id: "center", label: "Timeline", sections: ["timeline", "curves", "replay-scrubber", "event-track"] },
  { id: "right", label: "Inspector", sections: ["inspector", "properties", "lane-breakdown", "warnings", "ai-export"] },
];

const QUICK_PANEL_CONTROL_IDS = new Set(MOTION_DEBUG_QUICK_PANEL_CONTROLS.map((control) => control.id));
const WORKSPACE_SECTION_IDS = new Set(MOTION_DEBUG_WORKSPACE_REGIONS.flatMap((region) => region.sections));

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeWorkspaceMode(value) {
  return value === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN
    ? MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN
    : MOTION_DEBUG_WORKSPACE_MODE_DOCK;
}

function normalizeViewportDockMax(viewportWidth) {
  const viewport = readNumber(viewportWidth, 0);
  if (viewport <= 0) return MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX;
  return Math.max(
    MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN,
    Math.min(MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX, Math.floor(viewport - 48)),
  );
}

export function normalizeMotionDebugWorkspaceDockWidth(value, options = {}) {
  const max = normalizeViewportDockMax(options.viewportWidth);
  const fallback = Math.min(MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_DEFAULT, max);
  return Math.min(max, Math.max(
    MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN,
    Math.round(readNumber(value, fallback)),
  ));
}

function normalizeWorkspaceFilters(filters = {}) {
  return {
    preset: readString(filters.preset, "all"),
    query: readString(filters.query, ""),
  };
}

function normalizeTargetRef(target = null) {
  if (target == null) return null;
  if (typeof target === "string" || typeof target === "number") {
    return { sourceLabel: String(target) };
  }
  if (typeof target !== "object") return null;
  const normalized = {};
  if (target.targetId != null && Number.isFinite(Number(target.targetId))) normalized.targetId = Number(target.targetId);
  if (target.sourceLabel != null) normalized.sourceLabel = String(target.sourceLabel);
  if (target.label != null) normalized.label = String(target.label);
  if (target.layer != null) normalized.layer = String(target.layer);
  if (target.kind != null) normalized.kind = String(target.kind);
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeTrackRef(track = null) {
  if (!track || typeof track !== "object") return null;
  const normalized = {
    lane: readString(track.lane, "base"),
    laneKey: readString(track.laneKey, "default"),
    prop: readString(track.prop, "unknown"),
  };
  const target = normalizeTargetRef(track);
  if (target?.targetId != null) normalized.targetId = target.targetId;
  if (target?.sourceLabel != null) normalized.sourceLabel = target.sourceLabel;
  return normalized;
}

function makeTargetPinKey(target) {
  const normalized = normalizeTargetRef(target);
  if (!normalized) return null;
  if (normalized.targetId != null) return `id:${normalized.targetId}`;
  if (normalized.sourceLabel) return `source:${normalized.sourceLabel}`;
  if (normalized.label) return `label:${normalized.label}`;
  return null;
}

function normalizePinnedTargets(targets = []) {
  const pins = [];
  const seen = new Set();
  for (const target of Array.isArray(targets) ? targets : []) {
    const normalized = normalizeTargetRef(target);
    const key = makeTargetPinKey(normalized);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    pins.push({ ...normalized, key });
  }
  return pins;
}

export function isMotionDebugQuickPanelControl(id) {
  return QUICK_PANEL_CONTROL_IDS.has(id);
}

export function isMotionDebugWorkspaceSection(id) {
  return WORKSPACE_SECTION_IDS.has(id);
}

export function createMotionDebugWorkspaceSession(input = {}) {
  return {
    captureProfileId: readString(input.captureProfileId, MOTION_DEBUG_DEFAULT_PROFILE_ID),
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

export function openMotionDebugWorkspace(session = {}, options = {}) {
  return {
    ...createMotionDebugWorkspaceSession(session),
    dockWidthPx: normalizeMotionDebugWorkspaceDockWidth(options.dockWidthPx ?? session.dockWidthPx, {
      viewportWidth: options.viewportWidth ?? session.viewportWidth,
    }),
    isOpen: true,
    mode: normalizeWorkspaceMode(options.mode ?? session.mode),
  };
}

export function closeMotionDebugWorkspace(session = {}) {
  return {
    ...createMotionDebugWorkspaceSession(session),
    isOpen: false,
  };
}

export function setMotionDebugWorkspaceMode(session = {}, mode = MOTION_DEBUG_WORKSPACE_MODE_DOCK) {
  return {
    ...createMotionDebugWorkspaceSession(session),
    mode: normalizeWorkspaceMode(mode),
  };
}

export function toggleMotionDebugWorkspaceFullscreen(session = {}) {
  const current = createMotionDebugWorkspaceSession(session);
  return {
    ...current,
    isOpen: true,
    mode: current.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN
      ? MOTION_DEBUG_WORKSPACE_MODE_DOCK
      : MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN,
  };
}

export function resizeMotionDebugWorkspaceDock(session = {}, widthPx, options = {}) {
  return {
    ...createMotionDebugWorkspaceSession(session),
    dockWidthPx: normalizeMotionDebugWorkspaceDockWidth(widthPx, options),
  };
}

export function selectMotionDebugWorkspaceTarget(session = {}, target = null) {
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

export function selectMotionDebugWorkspaceTrack(session = {}, track = null) {
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

export function setMotionDebugWorkspaceFilters(session = {}, filters = {}) {
  return {
    ...createMotionDebugWorkspaceSession(session),
    filters: normalizeWorkspaceFilters(filters),
  };
}

export function setMotionDebugWorkspaceTime(session = {}, timeMs = 0) {
  return {
    ...createMotionDebugWorkspaceSession(session),
    selectedTimeMs: Math.max(0, readNumber(timeMs, 0)),
  };
}

export function toggleMotionDebugWorkspacePin(session = {}, target = null) {
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
