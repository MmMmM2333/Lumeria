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
 * @property {DesktopSceneFrameRuntime} runtime
 * @property {DesktopSceneFrameDiagnostics} diagnostics
 */

/** @typedef {Record<string, unknown>} DesktopSceneFrameViewport */
/** @typedef {Record<string, unknown>} DesktopSceneFrameVisual */
/** @typedef {Record<string, unknown>} DesktopSceneFrameInteraction */
/** @typedef {Record<string, unknown>} DesktopSceneFrameFolder */
/** @typedef {Record<string, unknown>} DesktopSceneFrameRuntime */
/** @typedef {Record<string, unknown>} DesktopSceneFrameDiagnostics */

const FRAME_GROUPS = Object.freeze([
  "viewport",
  "visual",
  "interaction",
  "folder",
  "runtime",
  "diagnostics",
]);

/**
 * @param {Record<string, unknown>} input
 * @returns {DesktopSceneFrame}
 */
export function makeDesktopSceneFrame(input = {}) {
  const frame = {
    viewport: {
      activePageIndex: input.activePageIndex,
      activePages: input.activePages,
      desktopProjectionEpoch: input.desktopProjectionEpoch,
      desktopTrackMotionKey: input.desktopTrackMotionKey,
      folderPageSize: input.folderPageSize,
      gridCols: input.gridCols,
      gridRows: input.gridRows,
      iconSize: input.iconSize,
      pageGridMeasureStyle: input.pageGridMeasureStyle,
      pageTrackScrub: input.pageTrackScrub,
    },
    visual: {
      desktopVisualAlpha: input.desktopVisualAlpha,
      desktopVisualTransform: input.desktopVisualTransform,
      launchpadVisualAlpha: input.launchpadVisualAlpha,
      launchpadVisualTransform: input.launchpadVisualTransform,
    },
    interaction: {
      dragFolderHoverState: input.dragFolderHoverState,
      dragFolderTargetId: input.dragFolderTargetId,
      dragMeta: input.dragMeta,
      focusedIcon: input.focusedIcon,
      groupDragState: input.groupDragState,
      iconGesturePresentation: input.iconGesturePresentation,
      isBatchSelectionActive: input.isBatchSelectionActive,
      isDesktopClosing: input.isDesktopClosing,
      isEditMode: input.isEditMode,
      isHomeRevealSettling: input.isHomeRevealSettling,
      isSearchMode: input.isSearchMode,
      isTextlessMode: input.isTextlessMode,
      selectedAppIds: input.selectedAppIds,
    },
    folder: {
      folderClosingHandoffId: input.folderClosingHandoffId,
      folderOverlayState: input.folderOverlayState,
      folderSourceGhostedId: input.folderSourceGhostedId,
      folderSourceGhostedIds: input.folderSourceGhostedIds,
      isFolderOpeningPreviewFrameGhosted: input.isFolderOpeningPreviewFrameGhosted,
    },
    runtime: {
      domRefs: input.domRefs,
      getDesktopPageRenderMode: input.getDesktopPageRenderMode,
      getVisibleDesktopPage: input.getVisibleDesktopPage,
      iconBoundsRegistry: input.iconBoundsRegistry,
      isIconOpening: input.isIconOpening,
      setPageRef: input.setPageRef,
    },
    diagnostics: {
      desktopGridDebugOptions: input.desktopGridDebugOptions,
      dragHitDebugOptions: input.dragHitDebugOptions,
      dragHitDebugState: input.dragHitDebugState,
      launchTargetStatusById: input.launchTargetStatusById,
      liveDesktopDiagnosticsPort: input.liveDesktopDiagnosticsPort,
      showMissingLaunchTargetBadge: input.showMissingLaunchTargetBadge,
      singleStageDiagnosticsOptions: input.singleStageDiagnosticsOptions,
    },
  };
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
  for (const group of FRAME_GROUPS) {
    const value = frame[group];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`DesktopSceneFrame.${group} must be an object`);
    }
  }
}
