import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { matchesIconFocus } from "../../../domain/iconFocus.js";
import {
  GROUP_TRANSFER_OUTCOME,
  GROUP_TRANSFER_PHASE,
} from "../../../domain/groupTransferSession.js";
import { resolveIconInteractionPhase } from "../../../domain/input/launchpadTargetPresentation.js";
import { getDesktopGridMetrics, getGridSlotRect, makeRect } from "../geometry/gridGeometry.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import {
  getStageScale,
  makeStageVirtualElement,
  snapRectToDevicePixels,
} from "../geometry/stageCoordinates.js";
import { makeIconVisualState, type IconVisualState } from "../nodes/iconVisualState.js";
import type {
  SceneDataRecord,
  SceneFocusedIcon,
  ScenePageTrackScrub,
} from "../../sceneFrame.js";
import { getDesktopIconSizing } from "./desktopIconSizing.js";
import {
  hasFolderClosingHandoffId,
  hasRawFolderSourceGhosting,
  isFolderOpeningSourceGhosted,
  shouldFinishFolderHandoffEntry,
  type DesktopFolderHandoffEntry,
  type DesktopFolderHandoffState,
  type DesktopHandoffObservation,
} from "./desktopHandoffState.js";
import type { FolderOverlayRect } from "./folderOverlayTargets.js";
import { makeTargetIconBounds } from "./iconSceneHelpers.js";
import { resolveFolderPresentationState } from "./folderPresentationPlan.js";
import { hasIconVisualSpecMismatch, makeIconVisualSpec } from "./iconVisualSpec.js";
import { GROUP_TRANSFER_RUNTIME_MODE } from "./groupTransferRuntimeAdapter.js";

export type DesktopRect = FolderOverlayRect;

export type DesktopItem = Readonly<{
  childPages?: readonly (readonly (DesktopItem | null | undefined)[])[];
  customIconDataUrl?: string | null;
  customIconPath?: string | null;
  id: string;
  type?: string;
}> & SceneDataRecord;

export type DesktopLayoutTarget = Readonly<{
  scaleX?: number;
  scaleY?: number;
  x: number;
  y: number;
}>;

export type DesktopIconSizing = Readonly<{
  compact: boolean;
  iconSize: number;
  labelReserve: number;
  singleLineLabel: boolean;
}>;

export type DesktopGroupRuntimeEntry = Readonly<{
  id?: string;
  memberIds?: readonly string[];
  mode?: string;
  target?: Readonly<{ area?: string }> | null;
}>;

export type DesktopGroupDragState = Readonly<{
  outcome?: string | null;
  phase?: string | null;
  runtimePlan?: Readonly<{ entries?: readonly DesktopGroupRuntimeEntry[] }> | null;
  totalCount?: number;
  visualSpec?: unknown;
}>;

export type DesktopRenderPlanState = DesktopFolderHandoffState & Readonly<{
  activePageIndex: number;
  activePages: readonly (readonly (DesktopItem | null)[])[];
  desktopFrame: DesktopRect;
  desktopGridDebugOptions: Readonly<{ paddingTop?: number }> | null;
  deviceResolution: number;
  dragFolderHoverState: (SceneDataRecord & Readonly<{
    phase?: string;
    targetId?: string;
    targetType?: string;
  }>) | null;
  dragFolderTargetId: string | null;
  focusedIcon: SceneFocusedIcon | null;
  folderPageSize: number;
  getDesktopPageRenderMode: (pageIndex: number) => "empty" | "interactive" | "static-real";
  getVisibleDesktopPage: (page: readonly (DesktopItem | null)[]) => readonly DesktopItem[];
  gridCols: number;
  gridRows: number;
  groupDragState: DesktopGroupDragState | null;
  groupTransferOwnedFolderShellIds: ReadonlySet<string>;
  groupTransferOwnedItemIds: ReadonlySet<string>;
  height: number;
  iconGesturePresentation: SceneDataRecord | null;
  iconSize: number;
  isBatchSelectionActive: boolean;
  isEditMode: boolean;
  isIconOpening: (
    area: "desktop" | "search",
    itemId: string,
    pageIndex: number,
  ) => boolean;
  isSearchMode: boolean;
  isTextlessMode: boolean;
  launchTargetStatusById: Readonly<Record<string, string>>;
  pageTrackScrub: ScenePageTrackScrub | null;
  selectedAppIds: ReadonlySet<string>;
  shouldSnapTrack: boolean;
  showMissingLaunchTargetBadge: boolean;
  stageRect: DesktopRect;
  width: number;
}>;

export type DesktopFolderGeometry = Readonly<{
  liveRect?: DesktopRect | null;
  renderedRect?: DesktopRect | null;
  stableRect?: DesktopRect | null;
}>;

export type DesktopRenderPlanContext = Readonly<{
  effectiveFolderSourceGhostedIds: ReadonlySet<string>;
  folderDropFrameSuppressedIds: ReadonlySet<string>;
  folderGeometryById: ReadonlyMap<string, DesktopFolderGeometry>;
  folderHandoffEntries: ReadonlyMap<string, DesktopFolderHandoffEntry>;
  handoffObservation: DesktopHandoffObservation;
}>;

export type FolderPresentationRect = DesktopRect & Readonly<{
  bottom: number;
  right: number;
}>;

export type FolderDropTarget = Readonly<{
  active: true;
  geometryVersion: string;
  hoverRect: FolderPresentationRect;
  hoverState: SceneDataRecord | null;
  iconSize: number;
  padding: number;
  phase: string;
  releaseRect: FolderPresentationRect | null;
  targetId: string;
}>;

export type FolderPresentationState = Readonly<{
  acceptsDropHover: boolean;
  dropTarget: FolderDropTarget | null;
  dropTargetExit: Readonly<{ mode: "immediate"; targetId: string }> | null;
  geometry: Readonly<{
    geometryVersion: string;
    hitRect: FolderPresentationRect | null;
    hoverRect: FolderPresentationRect | null;
    liveRect: FolderPresentationRect | null;
    releaseRect: FolderPresentationRect | null;
    renderedRect: FolderPresentationRect | null;
    stableRect: FolderPresentationRect | null;
  }>;
  handoff: Readonly<{
    blocksHover: boolean;
    pinsLayout: boolean;
    retainsSourceVisibility: boolean;
    syncsNode: boolean;
  }>;
  isReleasedHandoff: boolean;
  isSourceGhosted: boolean;
  phase: string;
  sourceVisible: boolean;
}>;

export type DesktopRenderBoundsEntry = Readonly<{
  area: "desktop" | "search";
  folderPresentation: FolderPresentationState | null;
  handoffLayoutTarget: DesktopLayoutTarget | null;
  index: number;
  item: DesktopItem;
  pageIndex: number;
  sizing: DesktopIconSizing;
  targetX: number;
  x: number;
  y: number;
}>;

export type DesktopRenderEntry = Readonly<{
  boundsEntry: DesktopRenderBoundsEntry | null;
  effectiveFolderHandoffEntry: DesktopFolderHandoffEntry | null;
  folderPresentation: FolderPresentationState | null;
  handoffLayoutTarget: DesktopLayoutTarget | null;
  index: number;
  isActiveDraggedItem: boolean;
  isActiveFolderClosingHandoff: boolean;
  isGroupTransferShellOwned: boolean;
  isFolderClosingHandoff: boolean;
  isFolderSourceGhosted: boolean;
  isInteractivePage: boolean;
  item: DesktopItem;
  key: string;
  layoutTarget: DesktopLayoutTarget;
  nodeState: IconVisualState;
  pageIndex: number;
  shouldRetireStaleHandoff: boolean;
  sizing: DesktopIconSizing;
  slot: DesktopRect;
  source: SceneDataRecord;
  stableLayoutTarget: DesktopLayoutTarget;
  stableScreenTarget: DesktopRect | null;
  x: number;
  y: number;
}>;

export type DesktopPageRefElement = Readonly<{
  __launchpadVirtualElementMeta: Readonly<Record<string, unknown>>;
  clientHeight: number;
  clientWidth: number;
  getBoundingClientRect: () => DesktopRect;
  offsetHeight: number;
  offsetWidth: number;
}>;

export type DesktopRenderPlan = Readonly<{
  activePageIndex: number;
  clearFolderPreviewChildIds: readonly string[];
  clearLaunchArea: "desktop" | "search";
  desktopFrame: DesktopRect;
  emptyText: Readonly<{ visible: boolean; x: number; y: number }>;
  entries: readonly DesktopRenderEntry[];
  folderDropTarget: FolderDropTarget | null;
  folderDropTargetExit: Readonly<{ mode: "immediate"; targetId: string }> | null;
  pageRefs: readonly Readonly<{ element: DesktopPageRefElement; pageIndex: number }>[];
  pageTrack: Readonly<{
    debugMetadata: Readonly<{
      kind: "PageTrack";
      label: "Desktop page track";
      layer: "desktop";
    }>;
    pageIndex: number;
    pageSpan: number;
    scope: "desktop" | "search";
    scrub: ScenePageTrackScrub | null;
    snap: boolean;
    sourceLabel: "desktop.pageTrack";
  }>;
  pageWidth: number;
  targetX: number;
}>;

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAcceptedDesktopPointRelease(state: DesktopRenderPlanState, item: DesktopItem): boolean {
  const group = state.groupDragState;
  if (
    item.type !== "app" ||
    group?.totalCount !== 1 ||
    group.phase !== GROUP_TRANSFER_PHASE.RELEASING ||
    group.outcome !== GROUP_TRANSFER_OUTCOME.ACCEPTED
  ) return false;
  const releaseEntry = group.runtimePlan?.entries?.find((entry) =>
    entry.id === item.id || entry.memberIds?.includes(item.id),
  );
  return releaseEntry?.mode === GROUP_TRANSFER_RUNTIME_MODE.POINT_HANDOFF &&
    releaseEntry.target?.area === "desktop";
}

export function readNumber(value: unknown, fallback = 0): number {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, readNumber(value, 0)));
}

function getFolderPreviewChildren(folder: DesktopItem): readonly DesktopItem[] {
  return Array.isArray(folder.childPages)
    ? folder.childPages.flatMap((page) => page).filter((child): child is DesktopItem => Boolean(child))
    : [];
}

function countSelectedFolderChildren(folder: DesktopItem, selectedIds: ReadonlySet<string>): number {
  if (folder.type !== "folder" || selectedIds.size === 0) return 0;
  return getFolderPreviewChildren(folder).reduce(
    (count, child) => count + (selectedIds.has(child.id) ? 1 : 0),
    0,
  );
}

export function resolveDesktopVisualAlpha(state: unknown = {}): number {
  return clamp01(isRecord(state) ? state.desktopVisualAlpha ?? 1 : 1);
}

export function resolveLaunchpadVisualAlpha(state: unknown = {}): number {
  return clamp01(isRecord(state) ? state.launchpadVisualAlpha ?? 1 : 1);
}

export function resolveLaunchpadVisualTransform(state: unknown = {}): Readonly<{
  scale: number;
  y: number;
}> {
  const transform = isRecord(state) && isRecord(state.launchpadVisualTransform)
    ? state.launchpadVisualTransform
    : {};
  return {
    scale: Math.max(0.01, readNumber(transform.scale, 1)),
    y: readNumber(transform.y, 0),
  };
}

function makeLayoutTargetFromScreenRect(
  state: DesktopRenderPlanState,
  stageRect: DesktopRect,
  targetX: number,
  rect: DesktopRect | null,
  visualOffsetY: number,
): DesktopLayoutTarget | null {
  if (!rect) return null;
  const { scaleX, scaleY } = getStageScale(stageRect, state.width, state.height);
  const visualCenterX = (rect.left - stageRect.left + rect.width / 2) / scaleX;
  const visualCenterY = (rect.top - stageRect.top + rect.height / 2) / scaleY;
  return {
    x: visualCenterX - targetX,
    y: visualCenterY - visualOffsetY,
  };
}

function makeSnappedFolderLayoutTarget(
  state: DesktopRenderPlanState,
  targetX: number,
  x: number,
  y: number,
  iconSize: number,
  visualOffsetY: number,
): DesktopLayoutTarget {
  const targetBounds: DesktopRect = snapRectToDevicePixels(makeTargetIconBounds(
    state.stageRect,
    state.width,
    state.height,
    targetX + x,
    y,
    iconSize,
    visualOffsetY,
  ), state.deviceResolution);
  return makeLayoutTargetFromScreenRect(
    state,
    state.stageRect,
    targetX,
    targetBounds,
    visualOffsetY,
  ) ?? { x, y };
}

function makeFolderStableScreenTarget(
  state: DesktopRenderPlanState,
  targetX: number,
  layoutTarget: DesktopLayoutTarget,
  iconSize: number,
  visualOffsetY: number,
): DesktopRect {
  return snapRectToDevicePixels(makeTargetIconBounds(
    state.stageRect,
    state.width,
    state.height,
    targetX + layoutTarget.x,
    layoutTarget.y,
    iconSize,
    visualOffsetY,
  ), state.deviceResolution);
}

function makeFolderPinnedLayoutTarget(
  state: DesktopRenderPlanState,
  targetX: number,
  stableScreenTarget: DesktopRect,
  iconSize: number,
  visualOffsetY: number,
): DesktopLayoutTarget | null {
  const target = makeLayoutTargetFromScreenRect(
    state,
    state.stageRect,
    targetX,
    stableScreenTarget,
    visualOffsetY,
  );
  if (!target) return null;
  const { scaleX, scaleY } = getStageScale(state.stageRect, state.width, state.height);
  return {
    ...target,
    scaleX: stableScreenTarget.width / Math.max(1, iconSize * scaleX),
    scaleY: stableScreenTarget.height / Math.max(1, iconSize * scaleY),
  };
}

export const DESKTOP_LAYOUT_TARGET_EPSILON = 0.5;

export function isLayoutTargetChanged(
  previousTarget: DesktopLayoutTarget | null | undefined,
  nextTarget: DesktopLayoutTarget | null | undefined,
  epsilon: unknown = DESKTOP_LAYOUT_TARGET_EPSILON,
): boolean {
  if (!previousTarget || !nextTarget) return true;
  const tolerance = Math.max(0, readNumber(epsilon, DESKTOP_LAYOUT_TARGET_EPSILON));
  for (const key of ["x", "y", "scaleX", "scaleY"] as const) {
    if (previousTarget[key] === undefined && nextTarget[key] === undefined) continue;
    const fallback = key === "scaleX" || key === "scaleY" ? 1 : 0;
    if (Math.abs(
      readNumber(previousTarget[key], fallback) - readNumber(nextTarget[key], fallback),
    ) > tolerance) return true;
  }
  return false;
}

export function getDesktopFrame(
  state: Pick<DesktopRenderPlanState, "desktopFrame" | "height" | "width">,
): DesktopRect {
  return {
    height: Math.max(1, readNumber(state.desktopFrame.height, state.height)),
    left: readNumber(state.desktopFrame.left),
    top: readNumber(state.desktopFrame.top),
    width: Math.max(1, readNumber(state.desktopFrame.width, state.width)),
  };
}

function matchesDesktopIconFocus(
  focus: SceneFocusedIcon | null,
  area: "desktop" | "search",
  itemId: string,
  pageIndex: number,
): boolean {
  return Reflect.apply(matchesIconFocus, undefined, [focus, area, itemId, pageIndex]) === true;
}

function resolveDesktopIconInteractionPhase(
  presentation: SceneDataRecord | null,
  itemId: string,
  scope: "desktop" | "search",
  interactive: boolean,
): string | null {
  const phase: unknown = Reflect.apply(resolveIconInteractionPhase, undefined, [presentation, {
    interactive,
    itemId,
    scope,
  }]);
  return typeof phase === "string" ? phase : null;
}

function readFolderPresentation(options: UnknownRecord): FolderPresentationState {
  const result: unknown = Reflect.apply(resolveFolderPresentationState, undefined, [options]);
  if (!isRecord(result) || !isRecord(result.handoff)) {
    throw new TypeError("resolveFolderPresentationState() returned an invalid plan");
  }
  for (const field of ["blocksHover", "pinsLayout", "retainsSourceVisibility", "syncsNode"] as const) {
    if (typeof result.handoff[field] !== "boolean") {
      throw new TypeError(`Folder presentation handoff.${field} must be boolean`);
    }
  }
  return result as FolderPresentationState;
}

export function buildDesktopRenderPlan(
  state: DesktopRenderPlanState,
  context: DesktopRenderPlanContext,
): DesktopRenderPlan {
  const hasVisualHandoff = state.groupDragState?.phase === GROUP_TRANSFER_PHASE.RELEASING ||
    state.groupDragState?.phase === GROUP_TRANSFER_PHASE.RETURNING;
  const visualSpec = state.groupDragState?.visualSpec;
  const transferActorsAreTextless = (state.groupDragState?.totalCount ?? 0) > 1 || (
    isRecord(visualSpec) && visualSpec.textless === true
  );
  const pages = state.activePages;
  const activePageIndex = Math.max(0, state.activePageIndex);
  const desktopFrame = getDesktopFrame(state);
  const pageWidth = desktopFrame.width;
  const targetX = -activePageIndex * pageWidth;
  const entries: DesktopRenderEntry[] = [];
  const pageRefs: Array<Readonly<{ element: DesktopPageRefElement; pageIndex: number }>> = [];
  const clearFolderPreviewChildIds: string[] = [];
  let folderDropTarget: FolderDropTarget | null = null;
  let folderDropTargetExit: Readonly<{ mode: "immediate"; targetId: string }> | null = null;

  for (const page of pages) {
    for (const item of page) {
      if (item?.type === "folder") clearFolderPreviewChildIds.push(item.id);
    }
  }

  pages.forEach((page, pageIndex) => {
    const visibleItems = state.getVisibleDesktopPage(page);
    const renderMode = state.getDesktopPageRenderMode(pageIndex);
    const isInteractivePage = renderMode === "interactive";
    const metrics = getDesktopGridMetrics({
      cols: state.gridCols,
      height: desktopFrame.height,
      isSearchMode: state.isSearchMode,
      paddingTop: state.desktopGridDebugOptions?.paddingTop,
      rows: state.gridRows,
      visibleCount: visibleItems.length,
      width: desktopFrame.width,
    });
    const gridRect = makeRect(
      desktopFrame.left + metrics.gridLeft,
      desktopFrame.top + metrics.gridTop,
      metrics.gridWidth,
      metrics.gridHeight,
    );
    pageRefs.push({
      element: makeStageVirtualElement(
        state.stageRect,
        state.width,
        state.height,
        gridRect,
      ),
      pageIndex,
    });
    if (renderMode === "empty") return;

    visibleItems.forEach((item, index) => {
      const slot: DesktopRect = getGridSlotRect(metrics, index);
      const sizing: DesktopIconSizing = getDesktopIconSizing(state, slot);
      const targetVisualSpec = makeIconVisualSpec({
        cellHeight: slot.height,
        cellWidth: slot.width,
        compact: sizing.compact,
        iconSize: sizing.iconSize,
        singleLineLabel: sizing.singleLineLabel,
        textless: state.isTextlessMode,
      });
      const x = pageIndex * pageWidth + desktopFrame.left + slot.left + slot.width / 2;
      const y = desktopFrame.top + slot.top + slot.height / 2;
      const visualOffsetY = getIconVisualOffsetY(state.isTextlessMode);
      const stableLayoutTarget = item.type === "folder"
        ? makeSnappedFolderLayoutTarget(state, targetX, x, y, sizing.iconSize, visualOffsetY)
        : { x, y };
      const stableScreenTarget = item.type === "folder"
        ? makeFolderStableScreenTarget(
          state,
          targetX,
          stableLayoutTarget,
          sizing.iconSize,
          visualOffsetY,
        )
        : null;
      const existingFolderHandoffEntry = item.type === "folder"
        ? context.folderHandoffEntries.get(item.id) ?? null
        : null;
      const isActiveFolderClosingHandoff = item.type === "folder" &&
        hasFolderClosingHandoffId(state, item.id);
      const isRawFolderSourceGhosted = item.type === "folder" &&
        hasRawFolderSourceGhosting(state, item.id);
      const shouldRetireStaleHandoff = Boolean(
        existingFolderHandoffEntry &&
        shouldFinishFolderHandoffEntry(state, context.handoffObservation, item.id) &&
        isRawFolderSourceGhosted &&
        !existingFolderHandoffEntry.visualReleased,
      );
      const previousGeometry = item.type === "folder"
        ? context.folderGeometryById.get(item.id) ?? null
        : null;
      const folderPresentation = item.type === "folder"
        ? readFolderPresentation({
          dragFolderHoverState: state.dragFolderHoverState,
          dragFolderTargetId: state.dragFolderTargetId,
          existingHandoffEntry: existingFolderHandoffEntry,
          folderId: item.id,
          geometry: {
            liveRect: previousGeometry?.liveRect,
            renderedRect: previousGeometry?.renderedRect,
            stableRect: stableScreenTarget ?? previousGeometry?.stableRect,
          },
          iconSize: sizing.iconSize,
          isActiveClosingHandoff: isActiveFolderClosingHandoff,
          isEffectiveSourceGhosted: context.effectiveFolderSourceGhostedIds.has(item.id) ||
            state.isFolderOpeningPreviewFrameGhosted(item.id),
          isOpeningSourceGhosted: isFolderOpeningSourceGhosted(state, item.id),
          isInteractivePage,
          isRawSourceGhosted: isRawFolderSourceGhosted,
          isSearchMode: state.isSearchMode,
          shouldRetireStaleHandoff,
        })
        : null;
      if (folderPresentation?.dropTarget?.active) folderDropTarget = folderPresentation.dropTarget;
      if (folderPresentation?.dropTargetExit) folderDropTargetExit = folderPresentation.dropTargetExit;
      const effectiveFolderHandoffEntry = item.type === "folder" && !shouldRetireStaleHandoff
        ? existingFolderHandoffEntry
        : null;
      const isFolderClosingHandoff = folderPresentation?.handoff.blocksHover === true;
      const pinnedLayoutTarget = folderPresentation?.handoff.pinsLayout && stableScreenTarget
        ? makeFolderPinnedLayoutTarget(
          state,
          targetX,
          stableScreenTarget,
          sizing.iconSize,
          visualOffsetY,
        ) ?? stableLayoutTarget
        : null;
      const handoffLayoutTarget = folderPresentation?.handoff.syncsNode
        ? pinnedLayoutTarget
        : null;
      const layoutTarget = pinnedLayoutTarget ?? stableLayoutTarget;
      const source: SceneDataRecord = {
        type: state.isSearchMode ? "search" : "page",
        pageIndex,
        index,
      };
      const sourceScope = state.isSearchMode ? "search" : "desktop";
      const key = `${state.isSearchMode ? "search" : "page"}:${pageIndex}:${item.id}`;
      const groupPhase = state.groupDragState?.phase;
      const isActiveDraggedItem = Boolean(
        (groupPhase === GROUP_TRANSFER_PHASE.GATHERING || groupPhase === GROUP_TRANSFER_PHASE.DRAGGING) &&
        state.groupTransferOwnedItemIds.has(item.id),
      );
      const isGroupTransferShellOwned = item.type === "folder" &&
        state.groupTransferOwnedFolderShellIds.has(item.id);
      const isFolderSourceGhosted = item.type === "folder" &&
        folderPresentation?.isSourceGhosted === true;
      const suppressedFolderPreviewChildIds = item.type === "folder"
        ? getFolderPreviewChildren(item)
          .filter((child) => state.groupTransferOwnedItemIds.has(child.id))
          .map((child) => child.id)
        : [];
      const isDesktopFolderTransferOwned = item.type === "folder" &&
        state.groupTransferOwnedItemIds.has(item.id) &&
        !isFolderClosingHandoff &&
        !isFolderSourceGhosted;
      const suppressLabelRevealAfterGhost = isFolderClosingHandoff ||
        isFolderSourceGhosted ||
        isDesktopFolderTransferOwned;
      const shouldDeferLabelReveal = hasVisualHandoff &&
        !isAcceptedDesktopPointRelease(state, item) && (
        isGroupTransferShellOwned ||
        (state.groupTransferOwnedItemIds.has(item.id) && (
          transferActorsAreTextless ||
          hasIconVisualSpecMismatch(visualSpec, targetVisualSpec)
        ))
      );
      const nodeState = makeIconVisualState({
        area: null,
        batchSelected: Boolean(
          state.isBatchSelectionActive &&
          item.type === "app" &&
          state.selectedAppIds.has(item.id)
        ),
        cellHeight: slot.height,
        cellWidth: slot.width,
        compact: sizing.compact,
        dragging: !isFolderClosingHandoff && !state.isSearchMode && isActiveDraggedItem,
        draggable: isInteractivePage && !state.isSearchMode && !isFolderClosingHandoff,
        dropTarget: item.type !== "folder" &&
          isInteractivePage &&
          !state.isSearchMode &&
          !isFolderClosingHandoff &&
          state.dragFolderTargetId === item.id,
        editing: isInteractivePage && !isFolderClosingHandoff && state.isEditMode,
        focused: !isFolderClosingHandoff &&
          isInteractivePage &&
          matchesDesktopIconFocus(state.focusedIcon, sourceScope, item.id, pageIndex),
        folderHoverState: item.type !== "folder" &&
          isInteractivePage &&
          !state.isSearchMode &&
          !isFolderClosingHandoff &&
          state.dragFolderHoverState?.targetId === item.id
          ? state.dragFolderHoverState
          : null,
        folderPreviewPageSize: state.folderPageSize,
        folderPreviewRelease: false,
        ghosted: !isFolderClosingHandoff && (
          isFolderSourceGhosted ||
          state.groupTransferOwnedItemIds.has(item.id) ||
          isGroupTransferShellOwned
        ),
        hasCustomIcon: Boolean(item.customIconPath || item.customIconDataUrl),
        iconSize: sizing.iconSize,
        interactionPhase: resolveDesktopIconInteractionPhase(
          state.iconGesturePresentation,
          item.id,
          sourceScope,
          isInteractivePage && !isFolderClosingHandoff,
        ),
        interactive: isInteractivePage && !isFolderClosingHandoff,
        item,
        jiggleSeed: pageIndex * 100 + index,
        launchTargetStatus: isInteractivePage &&
          !isFolderClosingHandoff &&
          state.showMissingLaunchTargetBadge
          ? state.launchTargetStatusById[item.id] ?? null
          : null,
        opening: Boolean(
          !isFolderClosingHandoff &&
          isInteractivePage &&
          state.isIconOpening(sourceScope, item.id, pageIndex),
        ),
        preserveNodeScale: folderPresentation?.handoff.pinsLayout === true ||
          isFolderClosingHandoff,
        removable: item.type === "app",
        revealLabelAfterVisualHandoff: shouldDeferLabelReveal,
        selectedChildCount: state.isBatchSelectionActive
          ? countSelectedFolderChildren(item, state.selectedAppIds)
          : 0,
        singleLineLabel: sizing.singleLineLabel,
        source,
        stageHeight: state.height,
        stageWidth: state.width,
        suppressFolderThumbFrame: item.type === "folder" && (
          folderPresentation?.dropTarget?.active === true ||
          context.folderDropFrameSuppressedIds.has(item.id)
        ),
        suppressedFolderPreviewChildIds,
        suppressLabelRevealAfterGhost,
        textless: state.isTextlessMode,
        visualSpecTransition: null,
      });

      entries.push({
        boundsEntry: isInteractivePage ? {
          area: sourceScope,
          folderPresentation,
          handoffLayoutTarget,
          index,
          item,
          pageIndex,
          sizing,
          targetX,
          x: stableLayoutTarget.x,
          y: stableLayoutTarget.y,
        } : null,
        effectiveFolderHandoffEntry,
        folderPresentation,
        handoffLayoutTarget,
        index,
        isActiveDraggedItem,
        isActiveFolderClosingHandoff,
        isGroupTransferShellOwned,
        isFolderClosingHandoff,
        isFolderSourceGhosted,
        isInteractivePage,
        item,
        key,
        layoutTarget,
        nodeState,
        pageIndex,
        shouldRetireStaleHandoff,
        sizing,
        slot,
        source,
        stableLayoutTarget,
        stableScreenTarget,
        x,
        y,
      });
    });
  });

  return {
    activePageIndex,
    clearFolderPreviewChildIds,
    clearLaunchArea: state.isSearchMode ? "search" : "desktop",
    desktopFrame,
    emptyText: {
      visible: Boolean(state.isSearchMode && pages[activePageIndex]?.length === 0),
      x: desktopFrame.left + desktopFrame.width / 2,
      y: desktopFrame.top + desktopFrame.height / 2,
    },
    entries,
    folderDropTarget,
    folderDropTargetExit,
    pageRefs,
    pageTrack: {
      debugMetadata: {
        kind: "PageTrack",
        label: "Desktop page track",
        layer: "desktop",
      },
      pageIndex: activePageIndex,
      pageSpan: pageWidth,
      scope: state.isSearchMode ? "search" : "desktop",
      scrub: state.pageTrackScrub,
      snap: state.shouldSnapTrack,
      sourceLabel: "desktop.pageTrack",
    },
    pageWidth,
    targetX,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
