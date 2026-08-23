import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { matchesIconFocus } from "../../../domain/iconFocus.js";
import { GROUP_TRANSFER_PHASE } from "../../../domain/groupTransferSession.js";
import { resolveIconInteractionPhase } from "../../../domain/input/launchpadTargetPresentation.js";
import { getGridSlotRect } from "../geometry/gridGeometry.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { makeIconVisualState, type IconVisualState } from "../nodes/iconVisualState.js";
import type {
  SceneDataRecord,
  SceneFocusedIcon,
  SceneItem,
} from "../../sceneFrame.js";
import {
  findFolderGhostKey,
  makeClosingPreviewSwapTargets,
  makePreviewSlotById,
  type ClosingGhostTargetInput,
  type ClosingPreviewSwapTarget,
  type FolderGhost,
  type FolderOverlayRect,
  type OpeningGhostTargetInput,
  type StableFolderCloseTarget,
} from "./folderOverlayTargets.js";

export type FolderPageRenderMode = "empty" | "interactive" | "static-real";

export type FolderOverlayGridMetrics = Readonly<{
  cellHeight: number;
  cellWidth: number;
  cols: number;
  gapX: number;
  gapY: number;
  gridLeft: number;
  gridTop: number;
}>;

export type FolderOverlayGeometry = Readonly<{
  grid: Readonly<{ width: number }>;
  panel: Readonly<{ left: number; top: number }>;
}>;

export type FolderOverlayGroupDragState = Readonly<{
  phase: string | null;
  totalCount: number;
  visualSpec: unknown;
}>;

export type FolderOverlayPlanFrame = Readonly<{
  closingGhostKeys: ReadonlySet<string>;
  focusedIcon: SceneFocusedIcon | null;
  folderId: string;
  folderPageIndex: number;
  folderPages: readonly (readonly (SceneItem | null)[])[];
  folderPageSize: number;
  getFolderPageRenderMode: (pageIndex: number) => FolderPageRenderMode;
  getVisibleFolderPage: (page: readonly (SceneItem | null)[]) => readonly SceneItem[];
  groupDragState: FolderOverlayGroupDragState | null;
  groupTransferOwnedItemIds: ReadonlySet<string>;
  iconGesturePresentation: SceneDataRecord | null;
  iconSize: number;
  isBatchSelectionActive: boolean;
  isEditMode: boolean;
  isIconOpening: ((
    area: "folder",
    itemId: string,
    pageIndex: number,
    folderId: string,
  ) => boolean) | null;
  isTextlessMode: boolean;
  launchTargetStatusById: Readonly<Record<string, string>>;
  selectedAppIds: ReadonlySet<string> | readonly string[];
  showMissingLaunchTargetBadge: boolean;
  stageHeight: number;
  stageWidth: number;
  visualFolderPageIndex: number;
}>;

export type FolderOverlayLiveLayout = Readonly<{
  cols: number;
  geometry: FolderOverlayGeometry;
  metrics: FolderOverlayGridMetrics;
  pageSpan: number;
  rows: number;
  trackX: number;
}>;

export type FolderOverlayStableLayout = Readonly<{
  closeTarget: StableFolderCloseTarget | null;
  geometry: FolderOverlayGeometry;
  metrics: FolderOverlayGridMetrics;
  pageSpan: number;
  trackX: number;
}>;

export type FolderOverlayTransitions = Readonly<{
  closeThumbRect: FolderOverlayRect | null;
  folderCloseIconGhosts: readonly FolderGhost[];
  folderOpenIconGhosts: readonly FolderGhost[];
  isClosing: boolean;
  isFolderClosing: boolean;
  openingGhostItemIds: ReadonlySet<string>;
  previewSlots: readonly (SceneItem | null)[];
}>;

export type FolderOverlayRenderPlanInput = Readonly<{
  frame: FolderOverlayPlanFrame;
  isNewFolder: boolean;
  liveLayout: FolderOverlayLiveLayout;
  stableLayout: FolderOverlayStableLayout;
  transitions: FolderOverlayTransitions;
}>;

type FolderIconSource = SceneDataRecord & Readonly<{
  folderId: string;
  index: number;
  pageIndex: number;
  slotIndex: number;
  type: "folder";
}>;

type FolderOpeningGhostPlanInput = Omit<
  OpeningGhostTargetInput,
  "folderId" | "folderRect" | "getPreviewChildRect" | "pageIndex"
>;

type FolderClosingGhostPlanInput = Omit<
  ClosingGhostTargetInput,
  "closeThumbRect" | "iconBounds" | "stableFolderCloseTarget"
>;

export type FolderOverlayRenderEntry = Readonly<{
  closingGhostInput: FolderClosingGhostPlanInput | null;
  index: number;
  isActiveDraggedItem: boolean;
  isInteractivePage: boolean;
  item: SceneItem;
  key: string;
  nodeState: IconVisualState;
  openingGhostInput: FolderOpeningGhostPlanInput | null;
  pageIndex: number;
  stableTargetCenter: Readonly<{ x: number; y: number }>;
  targetCenter: Readonly<{ x: number; y: number }>;
  x: number;
  y: number;
}>;

export type FolderOverlayRenderPlan = Readonly<{
  closingPreviewSwapTargets: readonly ClosingPreviewSwapTarget[];
  entries: readonly FolderOverlayRenderEntry[];
}>;

type FolderIconLayout = Readonly<{
  key: string;
  source: FolderIconSource;
  x: number;
  y: number;
}>;

function makeFolderIconLayout(options: Readonly<{
  folderId: string;
  geometry: FolderOverlayGeometry;
  index: number;
  item: SceneItem;
  pageIndex: number;
  pageSpan: number;
  slot: FolderOverlayRect;
}>): FolderIconLayout {
  const safePageIndex = Math.max(0, Number(options.pageIndex) || 0);
  const safeIndex = Math.max(0, Number(options.index) || 0);
  const resolvedPageSpan = Number.isFinite(options.pageSpan)
    ? options.pageSpan
    : Number(options.geometry.grid.width) || 0;
  const x = safePageIndex * resolvedPageSpan + options.slot.left + options.slot.width / 2;
  const y = options.slot.top + options.slot.height / 2;
  return {
    key: `${options.folderId}:${options.item.id}`,
    source: {
      type: "folder",
      folderId: options.folderId,
      index: safeIndex,
      pageIndex: safePageIndex,
      slotIndex: safeIndex,
    },
    x,
    y,
  };
}

function makeFolderIconTargetCenter(options: Readonly<{
  geometry: FolderOverlayGeometry;
  isTextlessMode: boolean;
  targetTrackX: number;
  x: number;
  y: number;
}>): Readonly<{ x: number; y: number }> {
  return {
    x: options.geometry.panel.left + options.x + options.targetTrackX,
    y: options.geometry.panel.top + options.y + getIconVisualOffsetY(options.isTextlessMode),
  };
}

function hasSelectedId(
  selectedAppIds: ReadonlySet<string> | readonly string[],
  itemId: string,
): boolean {
  if ("has" in selectedAppIds) return selectedAppIds.has(itemId);
  return selectedAppIds.includes(itemId);
}

function matchesFolderIconFocus(
  focus: SceneFocusedIcon | null,
  itemId: string,
  pageIndex: number,
  folderId: string,
): boolean {
  return Reflect.apply(matchesIconFocus, undefined, [
    focus,
    "folder",
    itemId,
    pageIndex,
    folderId,
  ]) === true;
}

function resolveFolderIconInteractionPhase(
  presentation: SceneDataRecord | null,
  itemId: string,
  folderId: string,
  interactive: boolean,
): string | null {
  const phase: unknown = Reflect.apply(resolveIconInteractionPhase, undefined, [presentation, {
    interactive,
    itemId,
    scope: `folder:${folderId}`,
  }]);
  return typeof phase === "string" ? phase : null;
}

export function makeFolderOverlayRenderPlan(
  input: FolderOverlayRenderPlanInput,
): FolderOverlayRenderPlan {
  const { frame, isNewFolder, liveLayout, stableLayout, transitions } = input;
  const previewSlotById = makePreviewSlotById(transitions.previewSlots);
  const groupPhase = frame.groupDragState?.phase ?? null;
  const hasVisualHandoff = groupPhase === GROUP_TRANSFER_PHASE.RELEASING ||
    groupPhase === GROUP_TRANSFER_PHASE.RETURNING;
  const transferActorsAreTextless = frame.groupDragState !== null && (
    frame.groupDragState.totalCount > 1 ||
    (typeof frame.groupDragState.visualSpec === "object" &&
      frame.groupDragState.visualSpec !== null &&
      "textless" in frame.groupDragState.visualSpec &&
      frame.groupDragState.visualSpec.textless === true)
  );
  const entries: FolderOverlayRenderEntry[] = [];

  frame.folderPages.forEach((page, pageIndex) => {
    const visibleItems = frame.getVisibleFolderPage(page);
    const renderMode = frame.getFolderPageRenderMode(pageIndex);
    const isInteractivePage = renderMode === "interactive";
    if (renderMode === "empty") return;

    visibleItems.forEach((item, index) => {
      const slot: FolderOverlayRect = getGridSlotRect(liveLayout.metrics, index);
      const stableSlot: FolderOverlayRect = getGridSlotRect(stableLayout.metrics, index);
      const iconLayout = makeFolderIconLayout({
        folderId: frame.folderId,
        geometry: liveLayout.geometry,
        index,
        item,
        pageIndex,
        pageSpan: liveLayout.pageSpan,
        slot,
      });
      const stableIconLayout = makeFolderIconLayout({
        folderId: frame.folderId,
        geometry: stableLayout.geometry,
        index,
        item,
        pageIndex,
        pageSpan: stableLayout.pageSpan,
        slot: stableSlot,
      });
      const isActiveDraggedItem = Boolean(
        (groupPhase === GROUP_TRANSFER_PHASE.GATHERING || groupPhase === GROUP_TRANSFER_PHASE.DRAGGING) &&
        frame.groupTransferOwnedItemIds.has(item.id),
      );
      const hasActiveOpeningGhost = transitions.openingGhostItemIds.has(item.id);
      const targetCenter = makeFolderIconTargetCenter({
        geometry: liveLayout.geometry,
        isTextlessMode: frame.isTextlessMode,
        targetTrackX: liveLayout.trackX,
        x: iconLayout.x,
        y: iconLayout.y,
      });
      const stableTargetCenter = makeFolderIconTargetCenter({
        geometry: stableLayout.geometry,
        isTextlessMode: frame.isTextlessMode,
        targetTrackX: stableLayout.trackX,
        x: stableIconLayout.x,
        y: stableIconLayout.y,
      });
      const ghosted = frame.groupTransferOwnedItemIds.has(item.id) || (
        isInteractivePage && (
          transitions.openingGhostItemIds.has(item.id) ||
          frame.closingGhostKeys.has(item.id)
        )
      );
      const nodeState = makeIconVisualState({
        area: null,
        batchSelected: Boolean(
          frame.isBatchSelectionActive &&
          item.type === "app" &&
          hasSelectedId(frame.selectedAppIds, item.id)
        ),
        cellHeight: slot.height,
        cellWidth: slot.width,
        compact: false,
        dragging: isActiveDraggedItem,
        draggable: isInteractivePage,
        dropTarget: false,
        editing: isInteractivePage && frame.isEditMode,
        focused: isInteractivePage && matchesFolderIconFocus(
          frame.focusedIcon,
          item.id,
          pageIndex,
          frame.folderId,
        ),
        folderHoverState: null,
        folderPreviewPageSize: frame.folderPageSize,
        folderPreviewRelease: false,
        ghosted,
        hasCustomIcon: Boolean(item.customIconPath || item.customIconDataUrl),
        iconSize: frame.iconSize,
        interactionPhase: resolveFolderIconInteractionPhase(
          frame.iconGesturePresentation,
          item.id,
          frame.folderId,
          isInteractivePage,
        ),
        interactive: isInteractivePage,
        item,
        jiggleSeed: Math.max(0, pageIndex) * 100 + iconLayout.source.index,
        launchTargetStatus: isInteractivePage && frame.showMissingLaunchTargetBadge
          ? frame.launchTargetStatusById[item.id] ?? null
          : null,
        opening: Boolean(
          isInteractivePage && frame.isIconOpening?.("folder", item.id, pageIndex, frame.folderId),
        ),
        preserveNodeScale: false,
        removable: item.type === "app",
        revealLabelAfterVisualHandoff: Boolean(
          hasVisualHandoff &&
          frame.groupTransferOwnedItemIds.has(item.id) &&
          transferActorsAreTextless
        ),
        selectedChildCount: 0,
        singleLineLabel: false,
        source: iconLayout.source,
        stageHeight: frame.stageHeight,
        stageWidth: frame.stageWidth,
        suppressFolderThumbFrame: false,
        suppressedFolderPreviewChildIds: Object.freeze([]),
        suppressLabelRevealAfterGhost: false,
        textless: frame.isTextlessMode,
        visualSpecTransition: null,
      });

      entries.push({
        closingGhostInput: isInteractivePage &&
          transitions.isFolderClosing &&
          pageIndex === frame.folderPageIndex
          ? {
            cellHeight: slot.height,
            cellWidth: slot.width,
            cols: liveLayout.cols,
            controllerGhostKey: findFolderGhostKey(transitions.folderCloseIconGhosts, item.id, index),
            folderId: frame.folderId,
            iconSize: frame.iconSize,
            index,
            item,
            pageIndex,
            previewSlotById,
          }
          : null,
        index,
        isActiveDraggedItem,
        isInteractivePage,
        item,
        key: iconLayout.key,
        nodeState,
        openingGhostInput: (isInteractivePage || hasActiveOpeningGhost) &&
          !isActiveDraggedItem &&
          (isNewFolder || hasActiveOpeningGhost) &&
          !transitions.isClosing &&
          (pageIndex === frame.visualFolderPageIndex || hasActiveOpeningGhost)
          ? {
            cellHeight: slot.height,
            cellWidth: slot.width,
            cols: liveLayout.cols,
            controllerGhostKey: findFolderGhostKey(transitions.folderOpenIconGhosts, item.id, index),
            iconSize: frame.iconSize,
            index,
            item,
            previewSlotById,
            rows: liveLayout.rows,
            targetCenterX: targetCenter.x,
            targetCenterY: targetCenter.y,
          }
          : null,
        pageIndex,
        stableTargetCenter,
        targetCenter,
        x: iconLayout.x,
        y: iconLayout.y,
      });
    });
  });

  return {
    closingPreviewSwapTargets: transitions.isFolderClosing && frame.folderPageIndex > 0
      ? makeClosingPreviewSwapTargets({
        folderId: frame.folderId,
        folderRect: transitions.closeThumbRect,
        previewSlots: transitions.previewSlots,
        stableFolderCloseTarget: stableLayout.closeTarget,
      })
      : [],
    entries,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
