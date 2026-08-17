/**
 * Renderer-neutral input frame. Values are owned by the application; the
 * renderer only reads them and emits semantic SceneEvents.
 *
 * @typedef {Object} DesktopSceneFrame
 * @property {Object} viewport
 * @property {Object} visual
 * @property {Object} interaction
 * @property {Object} folder
 * @property {Object} runtime
 * @property {Object} diagnostics
 */

/** @typedef {{type: string} & Record<string, unknown>} SceneEvent */

const FRAME_GROUPS = ["viewport", "visual", "interaction", "folder", "runtime", "diagnostics"];

/**
 * @param {Record<string, unknown>} input
 * @returns {DesktopSceneFrame}
 */
export function makeDesktopSceneFrame(input = {}) {
  return {
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
}

/**
 * @param {DesktopSceneFrame | null | undefined} frame
 * @param {string} key
 * @returns {unknown}
 */
export function readDesktopSceneFrameValue(frame, key) {
  for (const group of FRAME_GROUPS) {
    if (frame?.[group] && Object.prototype.hasOwnProperty.call(frame[group], key)) {
      return frame[group][key];
    }
  }
  return undefined;
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @returns {SceneEvent & Record<string, unknown>}
 */
export function makeSceneEvent(type, payload = {}) {
  return { type, ...payload };
}
