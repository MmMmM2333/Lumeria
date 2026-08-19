/**
 * Renderer-neutral input frame. Values are owned by the application; the
 * renderer only reads them and emits semantic SceneEvents.
 *
 * The groups are deliberately explicit. A renderer consumer must access a
 * value through its owning group instead of relying on a flat-key lookup.
 *
 * @typedef {Object} DesktopSceneFrame
 * @property {DesktopSceneFrameViewport} viewport
 * @property {DesktopSceneFrameVisual} visual
 * @property {DesktopSceneFrameInteraction} interaction
 * @property {DesktopSceneFrameFolder} folder
 * @property {DesktopSceneFrameDiagnostics} diagnostics
 */

const FRAME_FIELDS = Object.freeze({
  viewport: Object.freeze([
    "activePageIndex",
    "activePages",
    "desktopProjectionEpoch",
    "desktopTrackMotionKey",
    "folderPageSize",
    "gridCols",
    "gridRows",
    "iconSize",
    "pageGridMeasureStyle",
    "pageTrackScrub",
  ]),
  visual: Object.freeze([
    "desktopVisualAlpha",
    "desktopVisualTransform",
    "launchpadVisualAlpha",
    "launchpadVisualTransform",
  ]),
  interaction: Object.freeze([
    "dragFolderHoverState",
    "dragFolderTargetId",
    "dragMeta",
    "focusedIcon",
    "groupDragState",
    "iconGesturePresentation",
    "isBatchSelectionActive",
    "isDesktopClosing",
    "isEditMode",
    "isHomeRevealSettling",
    "isSearchMode",
    "isTextlessMode",
    "selectedAppIds",
  ]),
  folder: Object.freeze([
    "folderClosingHandoffId",
    "folderSourceGhostedId",
    "folderSourceGhostedIds",
  ]),
  diagnostics: Object.freeze([
    "desktopGridDebugOptions",
    "dragHitDebugOptions",
    "dragHitDebugState",
    "launchTargetStatusById",
    "showMissingLaunchTargetBadge",
    "singleStageDiagnosticsOptions",
  ]),
});

const FRAME_GROUPS = Object.freeze(Object.keys(FRAME_FIELDS));

function snapshotCollection(value) {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => (
    Array.isArray(entry) ? Object.freeze([...entry]) : entry
  )));
  if (value instanceof Map) return new Map(value);
  if (value instanceof Set) return new Set(value);
  if (value && typeof value === "object") return Object.freeze({ ...value });
  return value;
}

function makeFrameGroup(input, fields) {
  return Object.freeze(Object.fromEntries(
    fields.map((field) => [field, snapshotCollection(input[field])])
  ));
}

/**
 * @param {Record<string, unknown>} input
 * @returns {DesktopSceneFrame}
 */
export function makeDesktopSceneFrame(input = {}) {
  const frame = {
    viewport: makeFrameGroup(input, FRAME_FIELDS.viewport),
    visual: makeFrameGroup(input, FRAME_FIELDS.visual),
    interaction: makeFrameGroup(input, FRAME_FIELDS.interaction),
    folder: makeFrameGroup(input, FRAME_FIELDS.folder),
    diagnostics: makeFrameGroup(input, FRAME_FIELDS.diagnostics),
  };
  Object.freeze(frame);
  assertDesktopSceneFrame(frame);
  return frame;
}

/**
 * Validate the structural boundary shared by the application and renderer.
 * This intentionally checks only the frame shape; individual runtime values
 * remain owned by their domain/platform adapters.
 *
 * @param {unknown} frame
 * @returns {void}
 */
export function assertDesktopSceneFrame(frame) {
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
    throw new TypeError("DesktopSceneFrame must be an object");
  }
  const rootKeys = Object.keys(frame);
  if (rootKeys.length !== FRAME_GROUPS.length || rootKeys.some((key) => !FRAME_GROUPS.includes(key))) {
    throw new TypeError("DesktopSceneFrame contains unsupported groups");
  }
  if (!Object.isFrozen(frame)) throw new TypeError("DesktopSceneFrame must be immutable");
  for (const group of FRAME_GROUPS) {
    const value = frame[group];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`DesktopSceneFrame.${group} must be an object`);
    }
    const expectedFields = FRAME_FIELDS[group];
    const keys = Object.keys(value);
    if (keys.length !== expectedFields.length || keys.some((key) => !expectedFields.includes(key))) {
      throw new TypeError(`DesktopSceneFrame.${group} contains unsupported fields`);
    }
    if (!Object.isFrozen(value)) {
      throw new TypeError(`DesktopSceneFrame.${group} must be immutable`);
    }
  }
}
