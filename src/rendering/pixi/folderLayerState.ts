import type { SceneDataRecord, SceneFocusedIcon, SceneItem } from "../sceneFrame.js";
import { findFolderGhostKey } from "./scene/folderOverlayTargets.js";

type RectLike = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

type FolderGhost = Readonly<{
  item?: SceneItem | null;
  key?: string | null;
  slotIndex?: number | null;
}>;

type FolderLayerCallbacks = Readonly<{
  acceptFolderOpenIconGhostSession?: (...args: unknown[]) => unknown;
  completeFolderCloseIconGhost?: (...args: unknown[]) => unknown;
  completeFolderOpenFrameGhost?: (...args: unknown[]) => unknown;
  completeFolderOpenIconGhost?: (...args: unknown[]) => unknown;
  getFolderPageRenderMode?: (...args: unknown[]) => unknown;
  getVisibleFolderPage?: (...args: unknown[]) => unknown;
  isIconOpening?: (...args: unknown[]) => unknown;
  setFolderPageRef?: (...args: unknown[]) => unknown;
}>;

type FolderLayerFolderInput = Readonly<{
  closeIconGhosts?: readonly FolderGhost[] | null;
  desktopClosing?: boolean;
  desktopPageTrackOffset?: SceneDataRecord | null;
  gridStyle?: SceneDataRecord | null;
  isAppLaunchClosing?: boolean;
  isClosing?: boolean;
  isZoomFadeClosing?: boolean;
  openingCancelRequest?: SceneDataRecord | null;
  openingOriginBounds?: SceneDataRecord | null;
  openIconGhostSession?: SceneDataRecord | null;
  openIconGhosts?: readonly FolderGhost[] | null;
  openProgress?: number;
  openProgressTarget?: number;
  pageDotsVisible?: boolean;
  pageIndex?: number;
  pageIndexCommit?: (...args: unknown[]) => unknown;
  pageSize?: number;
  pageTrackScrub?: SceneDataRecord | null;
  pageTurnToken?: unknown;
  pages?: readonly (readonly (SceneItem | null)[])[] | null;
  panelRef?: unknown;
  panelStyle?: Readonly<Record<string, string>> | null;
  renderedFolder?: SceneItem | null;
  viewportRef?: unknown;
  visualPageIndex?: number;
  zoomFadeCloseReason?: string | null;
}>;

type FolderLayerUiInput = Readonly<{
  focusedIcon?: SceneFocusedIcon | null;
  iconGesturePresentation?: SceneDataRecord | null;
  isBatchSelectionActive?: boolean;
  isEditMode?: boolean;
  isTextlessMode?: boolean;
  launchTargetStatusById?: Readonly<Record<string, string>> | null;
  selectedAppIds?: ReadonlySet<string> | readonly string[] | null;
  showMissingLaunchTargetBadge?: boolean;
}>;

export type FolderOverlayFrameInput = Readonly<{
  callbacks: FolderLayerCallbacks;
  drag: Readonly<{ meta?: SceneDataRecord | null }>;
  folder: FolderLayerFolderInput;
  geometry: Readonly<{
    canvasStageRect: RectLike;
    desktopFrame: RectLike;
    desktopStageRect: RectLike;
    singleStageDiagnostics: boolean;
  }>;
  stage: Readonly<{ rect: RectLike }>;
  ui: FolderLayerUiInput;
}>;

export type FolderOverlayFrame = Readonly<{
  acceptFolderOpenIconGhostSession: FolderLayerCallbacks["acceptFolderOpenIconGhostSession"];
  canvasStageRect: RectLike;
  completeFolderCloseIconGhost: FolderLayerCallbacks["completeFolderCloseIconGhost"];
  completeFolderOpenFrameGhost: FolderLayerCallbacks["completeFolderOpenFrameGhost"];
  completeFolderOpenIconGhost: FolderLayerCallbacks["completeFolderOpenIconGhost"];
  desktopFrame: RectLike;
  desktopPageTrackOffset: SceneDataRecord | null;
  desktopStageRect: RectLike;
  dragMeta: SceneDataRecord | null;
  focusedIcon: SceneFocusedIcon | null;
  folderCloseIconGhosts: readonly FolderGhost[];
  folderGridStyle: SceneDataRecord | null;
  folderOpenIconGhostSession: SceneDataRecord | null;
  folderOpenIconGhosts: readonly FolderGhost[];
  folderOpenProgress: number;
  folderOpenProgressTarget: number;
  folderOpeningCancelRequest: SceneDataRecord | null;
  folderOpeningOriginBounds: SceneDataRecord | null;
  folderPageDotsVisible: boolean;
  folderPageIndex: number;
  folderPageIndexCommit: FolderLayerFolderInput["pageIndexCommit"];
  folderPageSize: number;
  folderPages: readonly (readonly (SceneItem | null)[])[];
  folderPageTrackScrub: SceneDataRecord | null;
  folderPageTurnToken: unknown;
  folderPanelRef: unknown;
  folderPanelStyle: Readonly<Record<string, string>>;
  folderViewportRef: unknown;
  folderZoomFadeCloseReason: string | null;
  getFolderCloseIconGhostKey: (itemId: string, slotIndex: number) => string | null;
  getFolderOpenIconGhostKey: (itemId: string, slotIndex: number) => string | null;
  getFolderPageRenderMode: FolderLayerCallbacks["getFolderPageRenderMode"];
  getVisibleFolderPage: FolderLayerCallbacks["getVisibleFolderPage"];
  height: number;
  iconGesturePresentation: SceneDataRecord | null;
  iconSize: number;
  isBatchSelectionActive: boolean;
  isDesktopClosing: boolean;
  isEditMode: boolean;
  isFolderAppLaunchClosing: boolean;
  isFolderClosing: boolean;
  isFolderZoomFadeClosing: boolean;
  isIconOpening: FolderLayerCallbacks["isIconOpening"];
  isTextlessMode: boolean;
  launchTargetStatusById: Readonly<Record<string, string>>;
  renderedFolder: SceneItem | null;
  selectedAppIds: ReadonlySet<string> | readonly string[];
  setFolderPageRef: FolderLayerCallbacks["setFolderPageRef"];
  showMissingLaunchTargetBadge: boolean;
  singleStageDiagnostics: boolean;
  stageRect: RectLike;
  visualFolderPageIndex: number;
  width: number;
}>;

const INPUT_GROUPS = Object.freeze([
  "callbacks",
  "drag",
  "folder",
  "geometry",
  "stage",
  "ui",
] as const);

function assertExactInputGroups(input: FolderOverlayFrameInput): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("FolderOverlayFrameInput must be an object");
  }
  const keys = Object.keys(input);
  if (keys.length !== INPUT_GROUPS.length || keys.some((key) => !INPUT_GROUPS.includes(key as typeof INPUT_GROUPS[number]))) {
    throw new TypeError(`FolderOverlayFrameInput must contain exactly: ${INPUT_GROUPS.join(", ")}`);
  }
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createFolderLayerState(groups: FolderOverlayFrameInput): FolderOverlayFrame {
  assertExactInputGroups(groups);
  const { callbacks, drag, folder, geometry, stage, ui } = groups;
  const rect = stage.rect;
  const folderPanelStyle: Readonly<Record<string, string>> = folder.panelStyle || Object.freeze({});
  const folderCloseIconGhosts = folder.closeIconGhosts || Object.freeze([]);
  const folderOpenIconGhosts = folder.openIconGhosts || Object.freeze([]);
  const renderedFolder = folder.renderedFolder || null;
  const folderPageIndex = Math.max(0, Math.trunc(finiteNumber(folder.pageIndex)));

  return Object.freeze({
    acceptFolderOpenIconGhostSession: callbacks.acceptFolderOpenIconGhostSession,
    canvasStageRect: geometry.canvasStageRect,
    completeFolderCloseIconGhost: callbacks.completeFolderCloseIconGhost,
    completeFolderOpenFrameGhost: callbacks.completeFolderOpenFrameGhost,
    completeFolderOpenIconGhost: callbacks.completeFolderOpenIconGhost,
    desktopFrame: geometry.desktopFrame,
    desktopPageTrackOffset: folder.desktopPageTrackOffset || null,
    desktopStageRect: geometry.desktopStageRect,
    dragMeta: drag.meta || null,
    focusedIcon: ui.focusedIcon || null,
    folderCloseIconGhosts,
    folderGridStyle: folder.gridStyle || null,
    folderOpenIconGhostSession: folder.openIconGhostSession || null,
    folderOpenIconGhosts,
    folderOpenProgress: finiteNumber(folder.openProgress, renderedFolder ? 1 : 0),
    folderOpenProgressTarget: finiteNumber(folder.openProgressTarget, renderedFolder ? 1 : 0),
    folderOpeningCancelRequest: folder.openingCancelRequest || null,
    folderOpeningOriginBounds: folder.openingOriginBounds || null,
    folderPageDotsVisible: folder.pageDotsVisible === true,
    folderPageIndex,
    folderPageIndexCommit: folder.pageIndexCommit,
    folderPageSize: Math.max(0, Math.trunc(finiteNumber(folder.pageSize))),
    folderPages: folder.pages || Object.freeze([]),
    folderPageTrackScrub: folder.pageTrackScrub || null,
    folderPageTurnToken: folder.pageTurnToken ?? null,
    folderPanelRef: folder.panelRef,
    folderPanelStyle,
    folderViewportRef: folder.viewportRef,
    folderZoomFadeCloseReason: folder.zoomFadeCloseReason || null,
    getFolderCloseIconGhostKey: (itemId, slotIndex) => findFolderGhostKey(folderCloseIconGhosts, itemId, slotIndex),
    getFolderOpenIconGhostKey: (itemId, slotIndex) => findFolderGhostKey(folderOpenIconGhosts, itemId, slotIndex),
    getFolderPageRenderMode: callbacks.getFolderPageRenderMode,
    getVisibleFolderPage: callbacks.getVisibleFolderPage,
    height: Math.max(1, finiteNumber(rect.height, 1)),
    iconGesturePresentation: ui.iconGesturePresentation || null,
    iconSize: Number.parseFloat(folderPanelStyle["--folder-icon-size"] || "") || 64,
    isBatchSelectionActive: ui.isBatchSelectionActive === true,
    isDesktopClosing: folder.desktopClosing === true,
    isEditMode: ui.isEditMode === true,
    isFolderAppLaunchClosing: folder.isAppLaunchClosing === true,
    isFolderClosing: folder.isClosing === true,
    isFolderZoomFadeClosing: folder.isZoomFadeClosing === true,
    isIconOpening: callbacks.isIconOpening,
    isTextlessMode: ui.isTextlessMode === true,
    launchTargetStatusById: ui.launchTargetStatusById || Object.freeze({}),
    renderedFolder,
    selectedAppIds: ui.selectedAppIds || Object.freeze([]),
    setFolderPageRef: callbacks.setFolderPageRef,
    showMissingLaunchTargetBadge: ui.showMissingLaunchTargetBadge === true,
    singleStageDiagnostics: geometry.singleStageDiagnostics === true,
    stageRect: rect,
    visualFolderPageIndex: Math.max(0, Math.trunc(finiteNumber(folder.visualPageIndex, folderPageIndex))),
    width: Math.max(1, finiteNumber(rect.width, 1)),
  });
}
