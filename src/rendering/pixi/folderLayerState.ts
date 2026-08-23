import type {
  SceneDataRecord,
  SceneFocusedIcon,
  SceneItem,
  ScenePageTrackScrub,
} from "../sceneFrame.js";
import type { SceneRuntimeRef } from "../sceneRuntime.js";
import { findFolderGhostKey } from "./scene/folderOverlayTargets.js";
import type { CapturedFolderOriginBounds } from "./scene/folderOverlayTargetResolver.js";

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

type FolderPageRenderMode = "empty" | "interactive" | "static-real";

type FolderLayerFolder = SceneItem & Readonly<{
  childPages?: readonly (readonly (SceneItem | null)[])[];
  name?: string;
}>;

export type FolderLayerCallbacks = Readonly<{
  acceptFolderOpenIconGhostSession?: ((folderId: string | null, requestId: unknown) => boolean) | undefined;
  completeFolderCloseIconGhost?: ((key: string) => boolean | void) | undefined;
  completeFolderOpenFrameGhost?: ((folderId: string | null, requestId: unknown) => unknown) | undefined;
  completeFolderOpenIconGhost?: ((key: string) => unknown) | undefined;
  getFolderPageRenderMode?: ((pageIndex: number) => FolderPageRenderMode) | undefined;
  getVisibleFolderPage?: ((page: readonly (SceneItem | null)[]) => readonly SceneItem[]) | undefined;
  isIconOpening?: ((
    area: "folder",
    itemId: string,
    pageIndex: number,
    folderId: string,
  ) => boolean) | undefined;
  setFolderPageRef?: ((element: unknown, pageIndex: number) => unknown) | undefined;
}>;

type FolderLayerFolderInput = Readonly<{
  closeIconGhosts?: readonly FolderGhost[] | null | undefined;
  desktopClosing?: boolean | undefined;
  desktopPageTrackOffset?: SceneDataRecord | null | undefined;
  gridStyle?: SceneDataRecord | null | undefined;
  isAppLaunchClosing?: boolean | undefined;
  isClosing?: boolean | undefined;
  isZoomFadeClosing?: boolean | undefined;
  openingCancelRequest?: SceneDataRecord | null | undefined;
  openingOriginBounds?: CapturedFolderOriginBounds | null | undefined;
  openIconGhostSession?: SceneDataRecord | null | undefined;
  openIconGhosts?: readonly FolderGhost[] | null | undefined;
  openProgress?: number | undefined;
  openProgressTarget?: number | undefined;
  pageDotsVisible?: boolean | undefined;
  pageIndex?: number | undefined;
  pageIndexCommit?: ((pageIndex: number) => unknown) | undefined;
  pageSize?: number | undefined;
  pageTrackScrub?: ScenePageTrackScrub | null | undefined;
  pageTurnToken?: unknown;
  pages?: readonly (readonly (SceneItem | null)[])[] | null | undefined;
  panelRef?: SceneRuntimeRef<unknown> | null | undefined;
  panelStyle?: Readonly<Record<string, string>> | null | undefined;
  renderedFolder?: FolderLayerFolder | null | undefined;
  viewportRef?: SceneRuntimeRef<unknown> | null | undefined;
  visualPageIndex?: number | undefined;
  zoomFadeCloseReason?: string | null | undefined;
}>;

type FolderLayerUiInput = Readonly<{
  focusedIcon?: SceneFocusedIcon | null | undefined;
  iconGesturePresentation?: SceneDataRecord | null | undefined;
  isBatchSelectionActive?: boolean | undefined;
  isEditMode?: boolean | undefined;
  isTextlessMode?: boolean | undefined;
  launchTargetStatusById?: Readonly<Record<string, string>> | null | undefined;
  selectedAppIds?: ReadonlySet<string> | readonly string[] | null | undefined;
  showMissingLaunchTargetBadge?: boolean | undefined;
}>;

export type FolderOverlayFrameInput = Readonly<{
  callbacks: FolderLayerCallbacks;
  drag: Readonly<{
    groupDragState?: SceneDataRecord | null;
    meta?: SceneDataRecord | null;
  }>;
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
  folderOpeningOriginBounds: CapturedFolderOriginBounds | null;
  folderPageDotsVisible: boolean;
  folderPageIndex: number;
  folderPageIndexCommit: FolderLayerFolderInput["pageIndexCommit"];
  folderPageSize: number;
  folderPages: readonly (readonly (SceneItem | null)[])[];
  folderPageTrackScrub: ScenePageTrackScrub | null;
  folderPageTurnToken: unknown;
  folderPanelRef: SceneRuntimeRef<unknown> | null;
  folderPanelStyle: Readonly<Record<string, string>>;
  folderViewportRef: SceneRuntimeRef<unknown> | null;
  folderZoomFadeCloseReason: string | null;
  getFolderCloseIconGhostKey: (itemId: string, slotIndex: number) => string | null;
  getFolderOpenIconGhostKey: (itemId: string, slotIndex: number) => string | null;
  getFolderPageRenderMode: FolderLayerCallbacks["getFolderPageRenderMode"];
  getVisibleFolderPage: FolderLayerCallbacks["getVisibleFolderPage"];
  groupDragState: SceneDataRecord | null;
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
  renderedFolder: FolderLayerFolder | null;
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
    folderPanelRef: folder.panelRef || null,
    folderPanelStyle,
    folderViewportRef: folder.viewportRef || null,
    folderZoomFadeCloseReason: folder.zoomFadeCloseReason || null,
    getFolderCloseIconGhostKey: (itemId: string, slotIndex: number) =>
      findFolderGhostKey(folderCloseIconGhosts, itemId, slotIndex),
    getFolderOpenIconGhostKey: (itemId: string, slotIndex: number) =>
      findFolderGhostKey(folderOpenIconGhosts, itemId, slotIndex),
    getFolderPageRenderMode: callbacks.getFolderPageRenderMode,
    getVisibleFolderPage: callbacks.getVisibleFolderPage,
    groupDragState: drag.groupDragState || null,
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
