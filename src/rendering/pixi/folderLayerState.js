import { findFolderGhostKey } from "./scene/folderOverlayTargets.js";

export function createFolderLayerState(groups, overrides = {}) {
  const {
    callbacks = {},
    drag = {},
    folder = {},
    icons = {},
    stage = {},
    ui = {},
  } = groups || {};
  const rect = stage.rect || { height: 1, left: 0, top: 0, width: 1 };
  const folderPanelStyle = folder.panelStyle || {};
  const folderCloseIconGhosts = folder.closeIconGhosts || [];
  const folderOpenIconGhosts = folder.openIconGhosts || [];

  return {
    completeFolderCloseIconGhost: callbacks.completeFolderCloseIconGhost,
    completeFolderOpenFrameGhost: callbacks.completeFolderOpenFrameGhost,
    completeFolderOpenIconGhost: callbacks.completeFolderOpenIconGhost,
    dragMeta: drag.meta,
    folderCloseIconGhosts,
    desktopPageTrackOffset: folder.desktopPageTrackOffset || null,
    folderGridStyle: folder.gridStyle,
    folderOpeningOriginBounds: folder.openingOriginBounds,
    folderOpenProgress: folder.openProgress ?? (folder.renderedFolder ? 1 : 0),
    folderOpenProgressTarget: folder.openProgressTarget ?? (folder.renderedFolder ? 1 : 0),
    folderOpenIconGhosts,
    folderPageIndex: folder.pageIndex,
    folderPageIndexCommit: folder.pageIndexCommit,
    folderPageTurnToken: folder.pageTurnToken ?? null,
    folderPageTrackScrub: folder.pageTrackScrub,
    folderPageDotsVisible: folder.pageDotsVisible === true,
    folderPageSize: folder.pageSize,
    folderPages: folder.pages,
    folderPanelRef: folder.panelRef,
    folderPanelStyle,
    folderViewportRef: folder.viewportRef,
    getFolderCloseIconGhostKey: (itemId, slotIndex) => findFolderGhostKey(folderCloseIconGhosts, itemId, slotIndex),
    getFolderOpenIconGhostKey: (itemId, slotIndex) => findFolderGhostKey(folderOpenIconGhosts, itemId, slotIndex),
    getFolderPageRenderMode: callbacks.getFolderPageRenderMode,
    getVisibleFolderPage: callbacks.getVisibleFolderPage,
    height: Math.max(1, rect.height),
    iconSize: Number.parseFloat(folderPanelStyle["--folder-icon-size"]) || 64,
    iconGesturePresentation: ui.iconGesturePresentation || null,
    isDesktopClosing: folder.desktopClosing === true,
    isBatchSelectionActive: ui.isBatchSelectionActive === true,
    isEditMode: ui.isEditMode,
    isFolderAppLaunchClosing: folder.isAppLaunchClosing,
    isFolderClosing: folder.isClosing,
    isFolderZoomFadeClosing: folder.isZoomFadeClosing,
    folderZoomFadeCloseReason: folder.zoomFadeCloseReason || null,
    isIconOpening: callbacks.isIconOpening,
    isTextlessMode: ui.isTextlessMode,
    launchTargetStatusById: ui.launchTargetStatusById,
    renderedFolder: folder.renderedFolder,
    focusedIcon: ui.focusedIcon || null,
    selectedAppIds: ui.selectedAppIds || [],
    setFolderPageRef: callbacks.setFolderPageRef,
    showMissingLaunchTargetBadge: ui.showMissingLaunchTargetBadge,
    stageRect: rect,
    visualFolderPageIndex: folder.visualPageIndex ?? folder.pageIndex,
    width: Math.max(1, rect.width),
    ...overrides,
  };
}
