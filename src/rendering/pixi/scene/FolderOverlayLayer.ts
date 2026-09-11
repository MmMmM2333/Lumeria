import { Container, Graphics, Matrix, Rectangle, RenderLayer, Sprite } from "pixi.js";
import type { ContainerChild, FederatedPointerEvent } from "pixi.js";
import { PIXI_UI_FONT_FAMILY } from "../../typography.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { createPixiText } from "../pixiText.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import type { MotionSpringConfig } from "../animation/motionRuntime.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import type { MotionPreset } from "../animation/motionPresets.js";
import { killMotionOf, motion } from "../animation/motionTween.js";
import type { MotionControl, MotionVars } from "../animation/motionTween.js";
import { getDesktopGridMetrics, getFolderGridMetrics, getFolderPanelGeometry, getGridSlotRect, makeRect, parseRepeatCount, readPx } from "../geometry/gridGeometry.js";
import type { GeometryRect, GridMetrics } from "../geometry/gridGeometry.js";
import { mapClientRectToDisplayObjectLocalRect } from "../geometry/displayObjectBounds.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import {
  clearFrameGhost as clearFrameGhostState,
  commitFrameGhostPresentation as commitFrameGhostPresentationState,
  drawClosingFrameMask as drawClosingFrameMaskState,
  drawFrameGhost as drawFrameGhostState,
  enableClosingFrameMask as enableClosingFrameMaskState,
  ensureClosingFrameMaskState,
  getFrameRadius,
  lerpColor,
  retargetFrameGhost as retargetFrameGhostState,
  startFrameGhost as startFrameGhostState,
  updateFrameGhostTargetGeometry as updateFrameGhostTargetGeometryState,
} from "./folderFrameGhost.js";
import type {
  FolderFrameGhostOptions,
  FolderFramePresentedSnapshot,
  FolderFramePresentation,
  FolderFrameTransitionState,
} from "./folderFrameGhost.js";
import type { FolderFrameGhostLayer } from "./folderFrameGhost.js";

export type FolderVisualPresentationCommit = Readonly<{
  closingFolderId: string | null;
  frame: FolderFramePresentedSnapshot | null;
}>;
import { createFolderTransitionTrajectory, makeFolderTransitionPlacement } from "./folderTransitionTrajectory.js";
import type { FolderTransitionPlacement, FolderTransitionTrajectory } from "./folderTransitionTrajectory.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import type {
  FolderClosingGhost,
  FolderClosingGhostControllerLayer,
  FolderClosingControllerVisualPlan,
  FolderClosingPreviewSwapAdapter,
  FolderClosingState,
  FolderClosingTarget,
} from "./folderClosingGhostController.js";
import { FolderClosingPreviewSwapController } from "./folderClosingPreviewSwapController.js";
import type {
  FolderClosingPreviewSwapContainer,
  FolderClosingPreviewSwapDisplayObject,
  FolderClosingPreviewSwapGraphics,
  FolderClosingPreviewSwapLayer,
  FolderClosingPreviewSwapSprite,
  FolderClosingPreviewSwapText,
} from "./folderClosingPreviewSwapController.js";
import {
  applyClosingHandoffOnlyOverlayState,
  applyClosingPresentationOverlayState,
  getClosingPresentationStageHitRects,
} from "./folderClosingHandoff.js";
import type { ClosingPresentationHitArea, FolderClosingHandoffLayer } from "./folderClosingHandoff.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import type {
  FolderOpeningGhost,
  FolderOpeningControllerVisualPlan,
  FolderOpeningGhostControllerLayer,
  FolderOpeningState,
  FolderOpeningTarget,
} from "./folderOpeningGhostController.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import {
  FolderVisualSession,
  makeFolderPanelTargetKey,
} from "./folderVisualSession.js";
import type { FolderCloseLease, FolderOpenLease, FolderOpenSnapshot } from "./folderVisualSession.js";
import {
  getFolderOpeningPreviewChildRect,
  makeFolderOpeningGeometryLayoutKey,
  makeFolderOpeningGeometrySnapshot,
} from "./folderOpeningGeometrySnapshot.js";
import type { FolderOpeningGeometrySnapshot } from "./folderOpeningGeometrySnapshot.js";
import {
  VisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
  makeFolderPageTrackVisualKey,
} from "./visualOwnershipRegistry.js";
import type { VisualOwnershipOwnerInput } from "./visualOwnershipRegistry.js";
import { FolderVisualCommitQueue } from "./folderVisualCommitQueue.js";
import { clientPointToStageVisualPoint, clientRectToStageVisualRect, makeStageVirtualElement } from "../geometry/stageCoordinates.js";
import type { StagePoint, StageProjectionMeta, StageRect, StageVirtualElement } from "../geometry/stageCoordinates.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import type {
  IconBoundsMeta,
  IconBoundsRecord,
  IconBoundsRect,
  IconBoundsRegistry,
} from "../geometry/iconBoundsRegistry.js";
import {
  FOLDER_PAGE_DOTS_GAP,
  FOLDER_PAGE_DOTS_HIT_HEIGHT,
  FOLDER_PAGE_DOTS_SIZE,
  getFolderPageDotsFrame,
  getFolderPageDotVisualState,
  getFolderPageMaskRect,
  makePanelVisualRect,
} from "./folderOverlayGeometry.js";
import type { FolderPanelVisualRect } from "./folderOverlayGeometry.js";
import { makeFolderOverlayRenderPlan } from "./folderOverlayRenderPlan.js";
import type { FolderOverlayRenderPlan } from "./folderOverlayRenderPlan.js";
import {
  getStableFolderCloseRects,
  makeClosingGhostTarget,
  makeOpeningGhostTarget,
} from "./folderOverlayTargets.js";
import type {
  ClosingPreviewSwapTarget,
  FolderOverlayItem,
  FolderOverlayRect,
  OpeningGhostTarget,
  StableFolderCloseTarget,
} from "./folderOverlayTargets.js";
import { resolveFolderOverlayTargets } from "./folderOverlayTargetResolver.js";
import { resolveFolderIconRenderSize } from "./folderIconSizing.js";
import { makeIconRect, makeSyntheticPointerEvent, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { IconNode } from "../nodes/IconNode.js";
import type { IconNodeAction, IconNodeActionHandler } from "../nodes/IconNode.js";
import type { IconTextureRepository } from "../assets/iconTextureRepository.js";
import { getIconCellTopInteractionOverflow } from "../nodes/iconInteractionGeometry.js";
import { makeIconVisualSpec, makeIconVisualSpecFromNodeState } from "./iconVisualSpec.js";
import type { IconVisualSpec } from "./iconVisualSpec.js";
import { iconTextureRepository } from "../assets/iconTextureRepository.js";
import {
  cancelPageTrackMotion,
  createPageTrackMotionState,
  isPageTrackMotionActive,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";
import type { PageTrackMotionState } from "./pageTrackMotion.js";
import { isLayoutTargetChanged } from "./desktopRenderPlan.js";
import type { DesktopTransitionGrid, FolderOverlayFrame } from "../folderLayerState.js";
import type { SceneDataRecord, SceneItem, ScenePageTrackScrub } from "../../sceneFrame.js";

type FolderGeometry = ReturnType<typeof getFolderPanelGeometry>;
type PixiText = ReturnType<typeof createPixiText>;
type NativePointerInput = Parameters<typeof makeSyntheticPointerEvent>[0];
type SyntheticPointerNode = Parameters<typeof makeSyntheticPointerEvent>[1];
type OptionalPointerEvent = Readonly<{
  button?: unknown;
  clientX?: number;
  clientY?: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}>;
type ResolveFolderOverlayOptions = NonNullable<Parameters<typeof resolveFolderOverlayTargets>[0]>;
type ResolverFolder = NonNullable<ResolveFolderOverlayOptions["folder"]>;
type GeneratedClosingGhostTarget = ReturnType<typeof makeClosingGhostTarget>;
type GeneratedOpeningGhostTarget = ReturnType<typeof makeOpeningGhostTarget> & Readonly<{
  provisionalLayoutTarget: boolean;
}>;
type FolderOverlayVisualSession = FolderVisualSession<
  FolderOpeningControllerVisualPlan,
  FolderClosingControllerVisualPlan
>;
type FolderLayerFolder = NonNullable<FolderOverlayFrame["renderedFolder"]>;
type FolderOverlayOpenLease = FolderOpenLease<FolderOpeningControllerVisualPlan>;
type FolderOverlayCloseLease = FolderCloseLease<FolderClosingControllerVisualPlan>;
type MutableFramePresentation = {
  -readonly [Key in keyof FolderFramePresentation]: FolderFramePresentation[Key];
};

function inferFolderTransitionPlacement(
  sourceClientRect: StageRect | null | undefined,
  stageRect: StageRect,
  desktopFrame: StageRect,
  desktopGrid: DesktopTransitionGrid,
): FolderTransitionPlacement | null {
  const sourceRect = clientRectToStageVisualRect(sourceClientRect, stageRect);
  if (!sourceRect) return null;
  const metrics = getDesktopGridMetrics({
    cols: desktopGrid.cols,
    height: desktopFrame.height,
    isSearchMode: desktopGrid.isSearchMode,
    rows: desktopGrid.rows,
    visibleCount: desktopGrid.visibleCount,
    width: desktopFrame.width,
  });
  const centerX = sourceRect.left + sourceRect.width / 2 - desktopFrame.left;
  const centerY = sourceRect.top + sourceRect.height / 2 - desktopFrame.top;
  const columnStride = metrics.cellWidth + metrics.gapX;
  const rowStride = metrics.cellHeight + metrics.gapY;
  const col = Math.max(0, Math.min(
    metrics.cols - 1,
    Math.round((centerX - metrics.gridLeft - metrics.cellWidth / 2) / columnStride),
  ));
  const row = Math.max(0, Math.min(
    metrics.rows - 1,
    Math.round((centerY - metrics.gridTop - metrics.cellHeight / 2) / rowStride),
  ));
  return { col, cols: metrics.cols, row, rows: metrics.rows };
}

interface FolderOverlayDragSource extends SceneDataRecord {
  folderId?: string | null | undefined;
  pageIndex?: number | undefined;
  type?: string | undefined;
}

interface FolderOverlayDragMeta extends SceneDataRecord {
  source?: FolderOverlayDragSource | null | undefined;
}

interface FolderOverlayGroupDragInput extends SceneDataRecord {
  phase?: string | null | undefined;
  totalCount?: number | undefined;
  visualSpec?: SceneDataRecord[string];
}

interface FolderDesktopPageTrackOffset extends SceneDataRecord {
  liveX?: number | null | undefined;
  targetX?: number | null | undefined;
}

type FolderOverlayState = Omit<
  FolderOverlayFrame,
  | "desktopPageTrackOffset"
  | "dragMeta"
  | "groupDragState"
  | "renderedFolder"
  | "stageRect"
> & Readonly<{
  desktopPageTrackOffset: FolderDesktopPageTrackOffset | null;
  dragMeta: FolderOverlayDragMeta | null;
  groupDragState: FolderOverlayGroupDragInput | null;
  groupTransferOwnedItemIds?: ReadonlySet<string> | readonly string[] | undefined;
  prewarm?: boolean | undefined;
  renderedFolder: FolderLayerFolder;
  stageRect: StageRect;
}>;

type FolderOverlayStateInput = FolderOverlayState | (
  Omit<Partial<FolderOverlayState>, "renderedFolder"> & Readonly<{
    renderedFolder?: null | undefined;
  }>
);

interface ResizeLayoutMetrics {
  cols: number;
  fixedCellHeight: number;
  iconSize: number;
  rowGap: number;
  rows: number;
}

interface ResizeGeometryState {
  fixedCellHeight?: number | undefined;
  gridHeight: number;
  gridLeft: number;
  gridTop: number;
  gridWidth: number;
  iconSize?: number | undefined;
  panelHeight: number;
  panelLeft: number;
  panelTop: number;
  panelWidth: number;
  rowGap?: number | undefined;
  rows?: number | undefined;
  sidePadding: number;
}

type ResizeLayoutMode = "closing" | "layout" | "opening" | "page-turn";

interface ResizeLayoutSync {
  layoutSignature: string;
  mode: ResizeLayoutMode;
  remainingRenders: number;
  sizeKey: string;
}

interface PageTurnVisualSettle {
  folderId: string;
  remainingRenders: number;
  targetIndex: number;
}

type FolderIconNode = IconNode & {
  __groupTransferGhostedByOwnership?: boolean | undefined;
  stageRect?: StageRect | undefined;
};

type FolderGhostNode = FolderIconNode & FolderClosingGhost & FolderOpeningGhost;
type ClosingPreviewContainerNode = Container & FolderClosingPreviewSwapContainer;
type ClosingPreviewGraphicsNode = Graphics & FolderClosingPreviewSwapGraphics;
type ClosingPreviewSpriteNode = Sprite & FolderClosingPreviewSwapSprite;
type ClosingPreviewTextNode = PixiText & FolderClosingPreviewSwapText;
type ClosingPreviewDisplayNode = ContainerChild & FolderClosingPreviewSwapDisplayObject & {
  x?: number | undefined;
};

export type FolderVisualOpeningTarget = GeneratedOpeningGhostTarget;

export interface FolderIconBoundsMeta extends IconBoundsMeta {
  item?: FolderOverlayItem | undefined;
  provisionalLayoutTarget?: boolean | undefined;
  visualSpec?: IconVisualSpec | null | undefined;
}

export type FolderIconBoundsRecord = StageRect & Partial<Pick<IconBoundsRecord, "bottom" | "right">> & Readonly<{
  meta: FolderIconBoundsMeta;
}>;

interface CompletionTracker {
  add(): () => void;
  finishIfIdle(): void;
}

interface DetachedGhostMotion extends Readonly<Record<string, unknown>> {
  alpha?: unknown;
  duration?: unknown;
  scale?: unknown;
  x?: unknown;
  y?: unknown;
}

interface FolderContentPresentation {
  alpha: number;
  detachedMotion: DetachedGhostMotion | null;
  folderSlotReleaseMix: number | null;
  folderSlotReleaseVisible: boolean;
  labelAlpha: number | null;
  labelScaleX: number | null;
  labelScaleY: number | null;
  labelVisible: boolean | null;
  pivotX: number;
  pivotY: number;
  renderable: boolean;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  visible: boolean;
  x: number;
  y: number;
}

interface ClosingContentPresentedSnapshot {
  folderId: string;
  lease: FolderOverlayCloseLease;
  presentations: Map<Container, FolderContentPresentation>;
}

interface OpeningContentPresentedSnapshot {
  folderId: string;
  presentations: Map<Container, FolderContentPresentation>;
}

interface DetachedClosingVisual {
  clearing?: boolean | undefined;
  container: Container;
  desktopCloseReleaseRequested: boolean;
  desktopSourceKey?: string | null | undefined;
  destroyed?: boolean | undefined;
  finishQueued?: boolean | undefined;
  folderId: string | null;
  content?: Container[] | null | undefined;
  frame?: Graphics | null | undefined;
  geometryComplete: boolean;
  handoffCommitted?: boolean | undefined;
  handoffReleased?: boolean | undefined;
  motionControls?: Set<MotionControl> | null | undefined;
  ownerToken?: unknown;
  releaseAfterDesktopClose: boolean;
}

interface StableFolderSlotContext {
  folderId: string;
  iconSize: number;
  isTextlessMode: boolean;
  metrics: GridMetrics;
  pageSpan: number;
  stageHeight: number;
  stageRect: StageRect | null;
  stageWidth: number;
  visualPageIndex: number;
  visualSpec: IconVisualSpec | null;
}

interface PageDotMotionMetadata extends Readonly<Record<string, unknown>> {
  active: boolean | null;
  folderId: string | null;
  index: number | null;
  kind: "PageDot";
  label: string;
  layer: "folder";
  pageIndex: number | null;
}

type FolderPageDot = Graphics & {
  __motionDebugMetadata?: PageDotMotionMetadata | undefined;
};

interface FolderOverlayRenderCopy {
  newFolderName?: string | undefined;
}

interface ClosingHandoffPrepareOptions {
  preserveVisualState?: boolean | undefined;
}

interface FolderOverlayLayerOptions {
  detachedClosingVisualLayer?: Container | undefined;
  iconBoundsRegistry: IconBoundsRegistry;
  iconTextures?: IconTextureRepository | undefined;
  isHandoffSourceVisible?: ((folderId: string | null) => boolean) | undefined;
  onClosingFolderPointerDown?: ((folderId: string | null, event: unknown) => void) | undefined;
  onClosingHandoffPrepare?: ((
    folderId: string | null,
    options?: ClosingHandoffPrepareOptions,
  ) => void) | undefined;
  onClosingHandoffReady?: ((folderId: string) => void) | undefined;
  onClosingPresentationReady?: ((folderId: string) => void) | undefined;
  onClosingHandoffVisualRelease?: ((folderId: string | null) => void) | undefined;
  onDesktopSourceGhostingChange?: (() => void) | undefined;
  onIconAction?: IconNodeActionHandler | undefined;
  onInternalActivityChange?: ((active: boolean, folderId: string | null) => void) | undefined;
  onOutsidePointerDown?: ((event: unknown) => void) | undefined;
  onPanelPointerDown?: ((event: unknown) => void) | undefined;
  onRenderRequest?: ((reason: string) => void) | undefined;
  onTitleFrameChange?: ((frame: StageRect | null) => void) | undefined;
  renderCopy?: FolderOverlayRenderCopy | undefined;
  showFolderTitle?: boolean | undefined;
  visualCommitQueue?: FolderVisualCommitQueue | undefined;
  visualOwnership?: VisualOwnershipRegistry | undefined;
}

interface FolderOverlayPreparedContext {
  done: false;
  folderId: string;
  geometry: FolderGeometry;
  isBatchSelectionActive: boolean;
  isClosing: boolean;
  isNewFolder: boolean;
  isPrewarm: boolean;
  previousGeometry: FolderGeometry | null;
  previousLayoutMetrics: ResizeLayoutMetrics | null;
  resizeLayoutSignature: string;
  state: FolderOverlayState;
  targetLayoutMetrics: ResizeLayoutMetrics;
  wasClosing: boolean;
}

type FolderOverlayPreparation = FolderOverlayPreparedContext | Readonly<{
  done: true;
  result: null;
}>;

interface FolderOverlayResolvedContext extends FolderOverlayPreparedContext {
  closeIconRect: FolderOverlayRect | null;
  closeThumbRect: FolderOverlayRect | null;
  desktopIconSize: number | null;
  framePlacement: FolderTransitionPlacement | null;
  folderClientRect: FolderOverlayRect | null;
  folderThumbClientRect: FolderOverlayRect | null;
  geometry: FolderGeometry;
  getOpeningPreviewChildClientRect: ReturnType<typeof resolveFolderOverlayTargets>["getOpeningPreviewChildClientRect"];
  iconSize: number;
  previewSlots: readonly (FolderOverlayItem | null)[];
  renderPlan: FolderOverlayRenderPlan;
  resizeGeometryMode: ResizeLayoutMode | null;
  resizeVisualGeometryActive: boolean;
  resizeVisualGeometryFinalFrame: boolean;
  stableIconSize: number;
  stableVisualSpec: IconVisualSpec | null;
  targetGeometry: FolderGeometry;
  targetLayoutMetrics: ResizeLayoutMetrics;
  visualLayoutMetrics: ResizeLayoutMetrics;
}

interface FolderOverlaySyncedContext extends FolderOverlayResolvedContext {
  closingGhostTargets: GeneratedClosingGhostTarget[];
  closingPreviewSwapTargets: readonly ClosingPreviewSwapTarget[];
  openingGhostTargets: GeneratedOpeningGhostTarget[];
  seen: Set<string>;
}

interface ResizeVisualGeometryOptions {
  fromLayoutMetrics?: ResizeLayoutMetrics | undefined;
  toLayoutMetrics?: ResizeLayoutMetrics | undefined;
}

interface ResizeFrameGhostOptions {
  isClosing?: boolean | undefined;
  resizeGeometryMode?: ResizeLayoutMode | null | undefined;
  resizeLayoutSyncActive?: boolean | undefined;
  resizeVisualGeometryActive?: boolean | undefined;
  resizeVisualGeometryFinalFrame?: boolean | undefined;
}

interface DetachedVisualClearOptions {
  immediate?: boolean | undefined;
  reveal?: boolean | undefined;
}

interface VisualReleaseOptions {
  restorePageTrack?: boolean | undefined;
  reveal?: boolean | undefined;
}

interface StableIconSlotAnchor {
  folderId?: string | null | undefined;
  folderPageIndex?: number | null | undefined;
  id?: string | null | undefined;
  index?: number | null | undefined;
  itemId?: string | null | undefined;
  pageIndex?: number | null | undefined;
}

interface ResetPanelMotionOptions {
  panelProps?: string | null | undefined;
  scaleProps?: string | null | undefined;
  stopSprings?: boolean | undefined;
}

interface TeardownTransientStateOptions {
  cancelPageTrackReason?: string | null | undefined;
  clearDetachedClosingVisuals?: boolean | undefined;
  clearPageDots?: boolean | undefined;
  clearPageTrackSpringsReason?: string | null | undefined;
  clearPanelSpringsReason?: string | null | undefined;
  clearVisualCommitQueue?: boolean | undefined;
  preserveDetachedClosing?: boolean | undefined;
  releaseOwnership?: boolean | undefined;
}

interface TitleFrameMetadata {
  folderId?: string | null | undefined;
  openingLease?: FolderOpenLease | null | undefined;
}

type TitleFrameRect = StageRect & Readonly<{ progress?: number | undefined }>;

interface AnimatePanelOptions {
  getPreviewChildRect?: ((item: FolderOverlayItem, previewSlotIndex: number) => FolderOverlayRect | null | undefined) | undefined;
  previewSlots?: readonly (FolderOverlayItem | null)[] | null | undefined;
  resizeLayoutSyncActive?: boolean | undefined;
  resizeVisualGeometryActive?: boolean | undefined;
  resizeVisualGeometryFinalFrame?: boolean | undefined;
}

type ResizeVisualGeometryContext = Partial<FolderOverlayPreparedContext> & Readonly<{
  geometry?: FolderGeometry | undefined;
  state?: FolderOverlayStateInput | undefined;
  targetLayoutMetrics?: ResizeLayoutMetrics | undefined;
}>;

type OptionalResizeLayoutMetrics = {
  [Key in keyof ResizeLayoutMetrics]?: ResizeLayoutMetrics[Key] | undefined;
};

interface RegisterFolderIconNodeBoundsOptions {
  folderId: string;
  iconBoundsRegistry: IconBoundsRegistry;
  iconSize: number;
  index: number;
  isInteractivePage: boolean;
  isPrewarm: boolean;
  item: FolderOverlayItem;
  node: FolderIconNode;
  pageIndex: number;
  provisionalLayoutTarget?: boolean | undefined;
  stableIconSize?: number | undefined;
  stableTargetCenter?: StagePoint | null | undefined;
  stableVisualSpec?: IconVisualSpec | null | undefined;
  stageHeight: number;
  stageRect: StageRect;
  stageWidth: number;
  targetCenter: StagePoint;
}

type DetachedFrameTarget = Readonly<Record<string, unknown>> & Readonly<{
  fillAlpha?: unknown;
  fillColor?: unknown;
  height?: unknown;
  left?: unknown;
  radius?: unknown;
  strokeAlpha?: unknown;
  strokeColor?: unknown;
  strokeWidth?: unknown;
  top?: unknown;
  width?: unknown;
}>;

type DetachedFrameTransition = Readonly<{
  progressState: { value: number };
  trajectory: FolderTransitionTrajectory;
}>;

const PAGE_DOT_BLEND_DURATION = 0.08;
const PAGE_DOT_BLEND_EASE = "power2.out";
const PAGE_DOTS_REVEAL_DURATION = 0.12;
const PAGE_DOTS_REVEAL_EASE = "power2.out";
const FOLDER_ICON_EXIT_REASON = "folder-icon-exit";
const FOLDER_OVERLAY_CLEAR_REASON = "folder-overlay-clear";
const FOLDER_PAGE_TRACK_REPLACE_REASON = "folder-page-track-replace";
const FOLDER_PANEL_CLOSE_REASON = "folder-panel-close";
const FOLDER_PANEL_DETACHED_CLOSE_REASON = "folder-panel-detached-close";
const FOLDER_PANEL_HANDOFF_SNAP_REASON = "folder-panel-handoff-snap";
const FOLDER_PANEL_OPEN_REASON = "folder-panel-open";
const FOLDER_RESIZE_LAYOUT_REASON = "folder-resize-layout";
const FOLDER_DRAG_HANDOFF_LAYOUT_REASON = "folder-drag-handoff-layout";
const FOLDER_PANEL_ZOOM_FADE_REASON = "folder-panel-zoom-fade";
const FOLDER_RESIZE_SYNC_MIN_RENDERS = 2;
const FOLDER_PAGE_TURN_SETTLE_RENDERS = 4;
const FOLDER_PANEL_READY_PROGRESS = 0.985;
const MAX_DETACHED_CLOSING_VISUALS = 2;
const DETACHED_CLOSING_FRAME_TAIL_DURATION = 0.04;
const DETACHED_CLOSING_FALLBACK_DURATION = 0.22;
const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;

function isPointInRect(x: number, y: number, rect: StageRect | null | undefined): boolean {
  return Boolean(rect) &&
    x >= rect!.left &&
    x <= rect!.left + rect!.width &&
    y >= rect!.top &&
    y <= rect!.top + rect!.height;
}

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function readProgress01(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return clamp01(number);
}

function cloneFramePresentation(
  frame: FolderFramePresentation | null | undefined,
): MutableFramePresentation | null {
  if (!frame) return null;
  return {
    fillAlpha: frame.fillAlpha,
    fillColor: frame.fillColor,
    height: frame.height,
    left: frame.left,
    progress: frame.progress,
    radius: frame.radius,
    strokeAlpha: frame.strokeAlpha,
    strokeColor: frame.strokeColor,
    strokeWidth: frame.strokeWidth,
    top: frame.top,
    width: frame.width,
  };
}

function cloneMirroredFramePresentation(layer: Readonly<{
  closingDesktopPageTrackMirrorX?: number | null | undefined;
  frameGhostState?: FolderFramePresentation | null | undefined;
}> | null | undefined): MutableFramePresentation | null {
  const frame = cloneFramePresentation(layer?.frameGhostState);
  const offsetX = Number(layer?.closingDesktopPageTrackMirrorX);
  if (frame && Number.isFinite(offsetX) && offsetX !== 0) frame.left += offsetX;
  return frame;
}

function lerpNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function getPanelOpenStartGeometry(
  targetX: number,
  targetY: number,
  panelRect: StageRect,
  sourceRect: StageRect | null = null,
  stageRect: StageRect | null = null,
) {
  if (sourceRect) {
    const sourceLocalRect = clientRectToStageVisualRect(sourceRect, stageRect);
    return {
      scaleX: Math.max(0.08, sourceLocalRect.width / panelRect.width),
      scaleY: Math.max(0.08, sourceLocalRect.height / panelRect.height),
      x: sourceLocalRect.left + sourceLocalRect.width / 2,
      y: sourceLocalRect.top + sourceLocalRect.height / 2,
    };
  }
  return {
    scaleX: 0.12,
    scaleY: 0.16,
    x: targetX,
    y: targetY + 36,
  };
}

function roundDebugValue(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1000) / 1000;
}

function readSignatureValue(value: unknown): string | number | null {
  if (value == null) return "";
  const number = Number(value);
  if (Number.isFinite(number)) return roundDebugValue(number);
  return String(value);
}

function appendRectSignature(
  parts: (string | number | null)[],
  prefix: string,
  rect: StageRect | null | undefined,
): void {
  parts.push(
    `${prefix}.left:${readSignatureValue(rect?.left)}`,
    `${prefix}.top:${readSignatureValue(rect?.top)}`,
    `${prefix}.width:${readSignatureValue(rect?.width)}`,
    `${prefix}.height:${readSignatureValue(rect?.height)}`
  );
}

function makeResizeLayoutSignature(
  state: FolderOverlayStateInput,
  geometry: FolderGeometry | null | undefined,
): string {
  const parts: (string | number | null)[] = [
    `stage:${readSignatureValue(state.width)}x${readSignatureValue(state.height)}`,
    `cols:${state.folderGridStyle?.gridTemplateColumns || ""}`,
    `rows:${state.folderGridStyle?.gridTemplateRows || ""}`,
    `shell:${state.folderPanelStyle?.["--folder-shell-min-height"] || ""}`,
    `icon:${state.folderPanelStyle?.["--folder-icon-size"] || ""}`,
    `cell:${state.folderPanelStyle?.["--folder-icon-cell-height"] || ""}`,
    `rowGap:${state.folderPanelStyle?.["--folder-row-gap"] || ""}`,
  ];
  appendRectSignature(parts, "panel", geometry?.panel);
  appendRectSignature(parts, "grid", geometry?.grid);
  return parts.join("|");
}

function makeResizeLayoutMetricsSnapshot(
  state: FolderOverlayStateInput = {},
  geometry: FolderGeometry | null = null,
): ResizeLayoutMetrics {
  const committedFolderPageIndex = state.folderPageIndex ?? 0;
  const visualFolderPageIndex = state.visualFolderPageIndex ?? committedFolderPageIndex;
  const cols = parseRepeatCount(state.folderGridStyle?.gridTemplateColumns, 5);
  const fallbackRows = Math.max(1, Math.ceil((state.folderPages?.[visualFolderPageIndex] || []).length / cols));
  const fixedCellHeight = readPx(state.folderPanelStyle?.["--folder-icon-cell-height"], 0);
  const rowGap = readPx(state.folderPanelStyle?.["--folder-row-gap"], 18);
  const rows = parseRepeatCount(state.folderGridStyle?.gridTemplateRows, fallbackRows);
  const cellWidth = Number(geometry?.grid?.width) > 0 ? Number(geometry!.grid.width) / cols : null;
  const availableCellHeight = Number(geometry?.grid?.height) > 0
    ? Math.max(1, (Number(geometry!.grid.height) - rowGap * Math.max(0, rows - 1)) / rows)
    : null;
  const cellHeight = fixedCellHeight > 0 && availableCellHeight
    ? Math.min(fixedCellHeight, availableCellHeight)
    : fixedCellHeight > 0
      ? fixedCellHeight
      : availableCellHeight;
  return {
    cols,
    fixedCellHeight,
    iconSize: resolveFolderIconRenderSize({
      cellHeight,
      cellWidth,
      fallbackSize: state.iconSize!,
      requestedSize: readPx(state.folderPanelStyle?.["--folder-icon-size"], state.iconSize),
    }),
    rowGap,
    rows,
  };
}

function makeResizeLayoutMetricsKey(metrics: OptionalResizeLayoutMetrics = {}): string {
  return [
    metrics.cols,
    metrics.rows,
    metrics.fixedCellHeight,
    metrics.iconSize,
    metrics.rowGap,
  ].map(readSignatureValue).join(":");
}

function makeResizeVisualTargetKey(
  geometry: FolderGeometry | null | undefined,
  layoutMetrics: OptionalResizeLayoutMetrics,
): string {
  return `${makeFolderGeometryTargetKey(geometry)}|layout:${makeResizeLayoutMetricsKey(layoutMetrics)}`;
}

function cloneDebugRect(rect: StageRect | null | undefined) {
  if (!rect) return null;
  return {
    height: roundDebugValue(rect.height),
    left: roundDebugValue(rect.left),
    top: roundDebugValue(rect.top),
    width: roundDebugValue(rect.width),
  };
}

function makeFolderOverlayGroupDragSnapshot(
  groupDragState: FolderOverlayGroupDragInput | null | undefined,
) {
  if (!groupDragState || typeof groupDragState !== "object") return null;
  return Object.freeze({
    phase: typeof groupDragState.phase === "string" ? groupDragState.phase : null,
    totalCount: Math.max(0, Number(groupDragState.totalCount) || 0),
    visualSpec: groupDragState.visualSpec ?? null,
  });
}

function makeOpeningGeometryDebugSnapshot(
  session: FolderOpenSnapshot | null | undefined,
  currentSnapshot: FolderOpeningGeometrySnapshot | null | undefined,
  panel: Container | null | undefined,
) {
  const sessionSnapshot = session?.geometrySnapshot || null;
  const snapshot = sessionSnapshot || currentSnapshot || null;
  if (!session && !snapshot) return null;
  return {
    currentGeometryMatchesSession: Boolean(sessionSnapshot && currentSnapshot && sessionSnapshot === currentSnapshot),
    panelDisplay: {
      alpha: roundDebugValue(panel?.alpha),
      scaleX: roundDebugValue(panel?.scale?.x),
      scaleY: roundDebugValue(panel?.scale?.y),
      x: roundDebugValue(panel?.x),
      y: roundDebugValue(panel?.y),
    },
    session: session ? {
      folderId: session.folderId || null,
      geometryLayoutKey: session.geometrySnapshot?.layoutKey || null,
      ghostsReady: session.ghostsReady === true,
      hasGeometrySnapshot: Boolean(session.geometrySnapshot),
      panelReady: session.panelReady === true,
      revealed: session.revealed === true,
      targetKey: session.targetKey || "",
    } : null,
    snapshot: snapshot ? {
      folderId: snapshot.folderId || null,
      folderRect: cloneDebugRect(snapshot.source?.folderRect),
      layoutKey: snapshot.layoutKey || null,
      panelCenter: {
        x: roundDebugValue(snapshot.target?.panelCenter?.x),
        y: roundDebugValue(snapshot.target?.panelCenter?.y),
      },
      panelRect: cloneDebugRect(snapshot.target?.panelRect),
      previewChildRects: Array.from(snapshot.source?.previewChildRects?.entries?.() || []).map(([key, rect]) => ({
        key,
        rect: cloneDebugRect(rect),
      })),
      sourceCoordinateSpace: snapshot.source?.coordinateSpace || null,
      stageHeight: roundDebugValue(snapshot.projection?.stageHeight),
      stageRect: cloneDebugRect(snapshot.projection?.clientStageRect),
      stageWidth: roundDebugValue(snapshot.projection?.stageWidth),
      targetCoordinateSpace: snapshot.target?.coordinateSpace || null,
      targetKey: snapshot.targetKey || "",
    } : null,
  };
}

function registerFolderIconNodeBounds(options: RegisterFolderIconNodeBoundsOptions): IconBoundsRect | StageRect | null {
  const {
    folderId,
    iconBoundsRegistry,
    iconSize,
    index,
    isInteractivePage,
    isPrewarm,
    item,
    node,
    pageIndex,
    provisionalLayoutTarget = false,
    stableIconSize = iconSize,
    stableTargetCenter,
    stableVisualSpec = null,
    stageHeight,
    stageRect,
    stageWidth,
    targetCenter,
  } = options;
  const iconBounds = node.getIconBounds(stageRect);
  if (!isInteractivePage || isPrewarm) return iconBounds;
  const visualSpec = makeIconVisualSpecFromNodeState(node.state);
  const meta = {
    area: "folder",
    folderId,
    id: item.id,
    index,
    item,
    pageIndex,
    provisionalLayoutTarget: provisionalLayoutTarget === true,
    visualSpec,
  };
  const stableCenter = stableTargetCenter || targetCenter;
  const stableSpec = stableVisualSpec || visualSpec;
  const safeStableIconSize = Math.max(1, Number(stableIconSize) || Number(iconSize) || Number(stableSpec?.iconSize) || 1);
  iconBoundsRegistry.registerBounds(
    BOUNDS_KIND.LAUNCH,
    BOUNDS_VARIANT.RENDERED,
    { area: "folder", folderId, id: item.id, pageIndex },
    iconBounds,
    meta
  );
  iconBoundsRegistry.registerBounds(
    BOUNDS_KIND.LAUNCH,
    BOUNDS_VARIANT.LIVE_TARGET,
    { area: "folder", folderId, id: item.id, pageIndex },
    makeTargetIconBounds(stageRect, stageWidth, stageHeight, targetCenter.x, targetCenter.y, iconSize),
    meta
  );
  iconBoundsRegistry.registerBounds(
    BOUNDS_KIND.LAUNCH,
    BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
    { area: "folder", folderId, id: item.id, pageIndex },
    makeIconRect(stableCenter.x, stableCenter.y, safeStableIconSize),
    {
      ...meta,
      stageHeight,
      stageRect,
      stageWidth,
      visualSpec: stableSpec,
    } as IconBoundsMeta & Required<StageProjectionMeta> & Readonly<{ visualSpec: IconVisualSpec }>
  );
  return iconBounds;
}

function drawDetachedFrame(
  graphics: Graphics | null | undefined,
  rect: FolderFramePresentation | null | undefined,
): void {
  if (!graphics || graphics.destroyed || !rect) return;
  graphics.clear()
    .roundRect(rect.left, rect.top, rect.width, rect.height, rect.radius ?? getFrameRadius(rect))
    .fill({ color: Math.round(rect.fillColor ?? 0xf7f8ff), alpha: rect.fillAlpha ?? 0.26 })
    .stroke({ color: Math.round(rect.strokeColor ?? 0xffffff), alpha: rect.strokeAlpha ?? 0.24, width: rect.strokeWidth ?? 1 });
}

function getDesktopPageTrackLiveX(state: FolderOverlayStateInput = {}): number {
  const liveX = Number(state.desktopPageTrackOffset?.liveX);
  if (Number.isFinite(liveX)) return liveX;
  const targetX = Number(state.desktopPageTrackOffset?.targetX);
  return Number.isFinite(targetX) ? targetX : 0;
}

function addXOffsetToFrameState(
  frameState: FolderFramePresentation | null | undefined,
  offsetX: number,
): MutableFramePresentation | null | undefined {
  if (!frameState || !Number.isFinite(offsetX) || offsetX === 0) return frameState;
  const left = Number(frameState.left);
  return {
    ...frameState,
    left: Number.isFinite(left) ? left + offsetX : frameState.left,
  };
}

function mapRectBetweenContainers(
  rect: StageRect,
  source: Container,
  target: Container,
): StageRect {
  const points = [
    target.toLocal({ x: rect.left, y: rect.top }, source),
    target.toLocal({ x: rect.left + rect.width, y: rect.top }, source),
    target.toLocal({ x: rect.left, y: rect.top + rect.height }, source),
    target.toLocal({ x: rect.left + rect.width, y: rect.top + rect.height }, source),
  ];
  if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    throw new TypeError("detached closing geometry could not be mapped between display-object spaces");
  }
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  return { height: bottom - top, left, top, width: right - left };
}

function getScaleBetweenContainers(source: Container, target: Container): number {
  const origin = target.toLocal({ x: 0, y: 0 }, source);
  const xUnit = target.toLocal({ x: 1, y: 0 }, source);
  const yUnit = target.toLocal({ x: 0, y: 1 }, source);
  const scaleX = Math.hypot(xUnit.x - origin.x, xUnit.y - origin.y);
  const scaleY = Math.hypot(yUnit.x - origin.x, yUnit.y - origin.y);
  const scale = (scaleX + scaleY) / 2;
  if (!Number.isFinite(scale) || !(scale > 0)) {
    throw new TypeError("detached closing scale could not be mapped between display-object spaces");
  }
  return scale;
}

function reparentPreservingWorldTransform(child: Container, target: Container): void {
  const origin = target.toLocal({ x: 0, y: 0 }, child);
  const xUnit = target.toLocal({ x: 1, y: 0 }, child);
  const yUnit = target.toLocal({ x: 0, y: 1 }, child);
  const values = [origin.x, origin.y, xUnit.x, xUnit.y, yUnit.x, yUnit.y];
  if (!values.every(Number.isFinite)) {
    throw new TypeError("detached closing child transform could not be mapped into its new parent");
  }
  target.addChild(child);
  child.setFromMatrix(new Matrix(
    xUnit.x - origin.x,
    xUnit.y - origin.y,
    yUnit.x - origin.x,
    yUnit.y - origin.y,
    origin.x,
    origin.y,
  ));
}

function mapFramePresentationBetweenContainers(
  frame: MutableFramePresentation,
  source: Container,
  target: Container,
): MutableFramePresentation {
  const rect = mapRectBetweenContainers(frame, source, target);
  const scale = getScaleBetweenContainers(source, target);
  return {
    ...frame,
    ...rect,
    radius: frame.radius * scale,
    strokeWidth: frame.strokeWidth * scale,
  };
}

function mapDetachedFrameTargetBetweenContainers(
  targetState: DetachedFrameTarget | null | undefined,
  source: Container,
  target: Container,
): DetachedFrameTarget | null {
  if (!targetState) return null;
  const rect = {
    height: Number(targetState.height),
    left: Number(targetState.left),
    top: Number(targetState.top),
    width: Number(targetState.width),
  };
  if (!Object.values(rect).every(Number.isFinite)) {
    throw new TypeError("detached closing frame target requires finite geometry");
  }
  const mapped = mapRectBetweenContainers(rect, source, target);
  const scale = getScaleBetweenContainers(source, target);
  const radius = Number(targetState.radius);
  const strokeWidth = Number(targetState.strokeWidth);
  return {
    ...targetState,
    ...mapped,
    ...(Number.isFinite(radius) ? { radius: radius * scale } : {}),
    ...(Number.isFinite(strokeWidth) ? { strokeWidth: strokeWidth * scale } : {}),
  };
}

function mapFrameTransitionBetweenContainers(
  transition: FolderFrameTransitionState | null | undefined,
  source: Container,
  target: Container,
): FolderFrameTransitionState | null {
  if (!transition) return null;
  return {
    ...transition,
    desktopRect: mapRectBetweenContainers(transition.desktopRect, source, target),
    panelRect: mapRectBetweenContainers(transition.panelRect, source, target),
  };
}

function mapDetachedGhostMotionBetweenContainers(
  detachedMotion: DetachedGhostMotion | null | undefined,
  source: Container,
  target: Container,
): DetachedGhostMotion | null {
  if (!detachedMotion) return null;
  const x = Number(detachedMotion.x);
  const y = Number(detachedMotion.y);
  const scale = Number(detachedMotion.scale);
  if (![x, y, scale].every(Number.isFinite)) return detachedMotion;
  const point = target.toLocal({ x, y }, source);
  return {
    ...detachedMotion,
    scale: scale * getScaleBetweenContainers(source, target),
    x: point.x,
    y: point.y,
  };
}

function cloneDetachedGhostMotion(
  motion: DetachedGhostMotion | null | undefined,
): DetachedGhostMotion | null {
  return motion ? { ...motion } : null;
}

function captureFolderContentPresentation(
  node: Container,
  detachedMotion: DetachedGhostMotion | null | undefined,
): FolderContentPresentation {
  const ghost = node as FolderGhostNode;
  const label = ghost.labelText;
  const slot = ghost.folderSlotReleaseVisual;
  return {
    alpha: node.alpha,
    detachedMotion: cloneDetachedGhostMotion(detachedMotion),
    folderSlotReleaseMix: slot?.visible ? clamp01(slot.alpha) : null,
    folderSlotReleaseVisible: slot?.visible === true,
    labelAlpha: label ? label.alpha : null,
    labelScaleX: label ? label.scale.x : null,
    labelScaleY: label ? label.scale.y : null,
    labelVisible: label ? label.visible : null,
    pivotX: node.pivot.x,
    pivotY: node.pivot.y,
    renderable: node.renderable,
    rotation: node.rotation,
    scaleX: node.scale.x,
    scaleY: node.scale.y,
    skewX: node.skew.x,
    skewY: node.skew.y,
    visible: node.visible,
    x: node.position.x,
    y: node.position.y,
  };
}

function restoreFolderContentPresentation(
  node: Container,
  presentation: FolderContentPresentation,
): void {
  node.position.set(presentation.x, presentation.y);
  node.scale.set(presentation.scaleX, presentation.scaleY);
  node.pivot.set(presentation.pivotX, presentation.pivotY);
  node.skew.set(presentation.skewX, presentation.skewY);
  node.rotation = presentation.rotation;
  node.alpha = presentation.alpha;
  node.visible = presentation.visible;
  node.renderable = presentation.renderable;

  const ghost = node as FolderGhostNode;
  const label = ghost.labelText;
  if (label && presentation.labelAlpha != null &&
    presentation.labelScaleX != null && presentation.labelScaleY != null) {
    label.alpha = presentation.labelAlpha;
    label.scale.set(presentation.labelScaleX, presentation.labelScaleY);
    if (presentation.labelVisible != null) label.visible = presentation.labelVisible;
  }
  const slot = ghost.folderSlotReleaseVisual;
  if (!slot) return;
  if (!presentation.folderSlotReleaseVisible) {
    ghost.clearFolderSlotReleaseVisual?.("restore-presented-closing-content");
    return;
  }
  slot.visible = true;
  ghost.setFolderSlotReleaseVisualMix?.(presentation.folderSlotReleaseMix ?? 0);
}

function addDetachedVisualMotionControl(
  visual: DetachedClosingVisual | null,
  control: MotionControl | null | undefined,
): void {
  if (!visual || !control || control.completed) return;
  if (!visual.motionControls) visual.motionControls = new Set();
  visual.motionControls.add(control);
}

function cancelDetachedVisualMotionControls(visual: DetachedClosingVisual | null | undefined): void {
  const controls = visual?.motionControls;
  visual!.motionControls = null;
  if (!controls?.size) return;
  for (const control of controls) control.cancel?.(FOLDER_PANEL_DETACHED_CLOSE_REASON);
}

function makeCompletionTracker(onComplete: (() => void) | null | undefined): CompletionTracker {
  let pending = 0;
  let complete = false;
  const finishOne = () => {
    if (complete) return;
    pending -= 1;
    if (pending > 0) return;
    complete = true;
    onComplete?.();
  };
  return {
    add() {
      pending += 1;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        finishOne();
      };
    },
    finishIfIdle() {
      if (pending > 0 || complete) return;
      complete = true;
      onComplete?.();
    },
  };
}

function makeDetachedFrameTransition(
  frameState: MutableFramePresentation,
  transition: FolderFrameTransitionState | null | undefined,
  targetState: DetachedFrameTarget | null | undefined,
): DetachedFrameTransition {
  const readRectValue = (key: keyof StageRect): number => {
    const value = Number(targetState?.[key]);
    if (Number.isFinite(value)) return value;
    const transitionValue = Number(transition?.desktopRect[key]);
    return Number.isFinite(transitionValue) ? transitionValue : frameState[key];
  };
  const desktopRect = {
    height: readRectValue("height"),
    left: readRectValue("left"),
    top: readRectValue("top"),
    width: readRectValue("width"),
  };
  const panelRect = transition?.panelRect || {
    height: frameState.height,
    left: frameState.left,
    top: frameState.top,
    width: frameState.width,
  };
  if (!(desktopRect.width > 0) || !(desktopRect.height > 0) ||
    !(panelRect.width > 0) || !(panelRect.height > 0)) {
    throw new RangeError("detached frame transition requires positive desktop and panel geometry");
  }
  return {
    progressState: { value: transition?.progressState.value ?? 1 },
    trajectory: createFolderTransitionTrajectory({
      desktopRect,
      panelRect,
      placement: transition?.placement,
    }),
  };
}

function animateDetachedFrame(
  graphics: Graphics | null | undefined,
  frameState: MutableFramePresentation | null | undefined,
  targetState: DetachedFrameTarget | null | undefined,
  tracker: CompletionTracker,
  visual: DetachedClosingVisual | null = null,
  transition: DetachedFrameTransition,
): void {
  if (!graphics || !frameState) return;
  const frame = {
    ...frameState,
    progress: frameState.progress ?? 0,
  };
  const target = targetState || frameState;
  const startProgress = transition.progressState.value;
  const rawStart = transition.trajectory.sample(startProgress);
  const continuityOffset = {
    height: frame.height - rawStart.height,
    left: frame.left - rawStart.left,
    top: frame.top - rawStart.top,
    width: frame.width - rawStart.width,
  };
  const startStyle = {
    fillAlpha: frame.fillAlpha,
    fillColor: frame.fillColor,
    radius: frame.radius,
    strokeAlpha: frame.strokeAlpha,
    strokeColor: frame.strokeColor,
    strokeWidth: frame.strokeWidth,
  };
  const readTarget = (key: keyof typeof startStyle): number => {
    const value = Number(target[key]);
    return Number.isFinite(value) ? value : startStyle[key];
  };
  const targetStyle = {
    fillAlpha: readTarget("fillAlpha"),
    fillColor: readTarget("fillColor"),
    radius: readTarget("radius"),
    strokeAlpha: readTarget("strokeAlpha"),
    strokeColor: readTarget("strokeColor"),
    strokeWidth: readTarget("strokeWidth"),
  };
  const finishGeometry = tracker.add();
  const update = () => {
    const progress = transition.progressState.value;
    const rawRect = transition.trajectory.sample(progress);
    const continuityProgress = Math.abs(startProgress) < 0.0001
      ? 0
      : clamp01(progress / startProgress);
    const styleProgress = Math.abs(startProgress) < 0.0001
      ? 1
      : clamp01((startProgress - progress) / startProgress);
    frame.height = rawRect.height + continuityOffset.height * continuityProgress;
    frame.left = rawRect.left + continuityOffset.left * continuityProgress;
    frame.top = rawRect.top + continuityOffset.top * continuityProgress;
    frame.width = rawRect.width + continuityOffset.width * continuityProgress;
    frame.fillAlpha = startStyle.fillAlpha + (targetStyle.fillAlpha - startStyle.fillAlpha) * styleProgress;
    frame.fillColor = lerpColor(startStyle.fillColor, targetStyle.fillColor, styleProgress);
    frame.radius = startStyle.radius + (targetStyle.radius - startStyle.radius) * styleProgress;
    frame.strokeAlpha = startStyle.strokeAlpha + (targetStyle.strokeAlpha - startStyle.strokeAlpha) * styleProgress;
    frame.strokeColor = lerpColor(startStyle.strokeColor, targetStyle.strokeColor, styleProgress);
    frame.strokeWidth = startStyle.strokeWidth + (targetStyle.strokeWidth - startStyle.strokeWidth) * styleProgress;
    frame.progress = styleProgress;
    drawDetachedFrame(graphics, frame);
  };
  update();
  const geometryControl = motion(transition.progressState)
    .layout()
    .spring(motionSprings.handoff)
    .interrupt("retarget")
    .to({
      onCancel: finishGeometry,
      onComplete: () => {
        transition.progressState.value = 0;
        update();
        finishGeometry();
      },
      onUpdate: update,
      value: 0,
    })
    .start();
  addDetachedVisualMotionControl(visual, geometryControl);
}

function animateDetachedClosingGhost(
  ghost: FolderIconNode | null | undefined,
  tracker: CompletionTracker,
  visual: DetachedClosingVisual | null = null,
  detachedMotion: DetachedGhostMotion | null = null,
): void {
  if (!ghost || ghost.destroyed) return;
  motionRuntime.describeTarget(ghost, {
    itemId: ghost.item?.id ?? null,
    itemType: ghost.item?.type ?? null,
    kind: "FolderGhost",
    label: ghost.item?.name || ghost.item?.id || "Detached closing ghost",
    layer: "ghost",
    overlayTarget: ghost,
    phase: "detachedClosing",
    sourceLabel: "ghost.detachedClosing.node",
    targetPart: "node",
  });
  motionRuntime.describeTarget(ghost.scale, {
    itemId: ghost.item?.id ?? null,
    itemType: ghost.item?.type ?? null,
    kind: "FolderGhost",
    label: ghost.item?.name || ghost.item?.id || "Detached closing ghost",
    layer: "ghost",
    overlayTarget: ghost,
    phase: "detachedClosing",
    sourceLabel: "ghost.detachedClosing.scale",
    targetPart: "node.scale",
  });
  const duration = Math.max(0.01, Number(detachedMotion?.duration) || motionPresets.folderClose!.duration!);
  const hasGeometryTarget = Number.isFinite(Number(detachedMotion?.x)) &&
    Number.isFinite(Number(detachedMotion?.y)) &&
    Number.isFinite(Number(detachedMotion?.scale));
  const finishDisplay = tracker.add();

  if (hasGeometryTarget) {
    const displayControl = motion(ghost)
      .duration(duration)
      .ease(motionPresets.folderClose!.ease!)
      .overlay()
      .interrupt("retarget")
      .to({
        alpha: Number.isFinite(Number(detachedMotion!.alpha)) ? detachedMotion!.alpha : ghost.alpha,
        x: detachedMotion!.x,
        y: detachedMotion!.y,
        onComplete: finishDisplay,
        onCancel: finishDisplay,
      })
      .start();
    addDetachedVisualMotionControl(visual, displayControl);
    const finishScale = tracker.add();
    const scaleControl = motion(ghost.scale)
      .duration(duration)
      .ease(motionPresets.folderClose!.ease!)
      .overlay()
      .interrupt("retarget")
      .to({
        x: detachedMotion!.scale,
        y: detachedMotion!.scale,
        onComplete: finishScale,
        onCancel: finishScale,
      })
      .start();
    addDetachedVisualMotionControl(visual, scaleControl);
    return;
  }

  const fallbackControl = motion(ghost)
    .duration(DETACHED_CLOSING_FALLBACK_DURATION)
    .ease(motionPresets.folderClose!.ease!)
    .overlay()
    .interrupt("retarget")
    .to({
      alpha: 0,
      onComplete: finishDisplay,
      onCancel: finishDisplay,
    })
    .start();
  addDetachedVisualMotionControl(visual, fallbackControl);
}

function animateDetachedGeometryHold(
  tracker: CompletionTracker,
  visual: DetachedClosingVisual | null = null,
): void {
  const state = { progress: 0 };
  const finishGeometry = tracker.add();
  const holdControl = motion(state)
    .duration(motionPresets.folderClose!.duration! + DETACHED_CLOSING_FRAME_TAIL_DURATION)
    .ease(motionPresets.folderClose!.ease!)
    .overlay()
    .interrupt("retarget")
    .to({
      progress: 1,
      onComplete: finishGeometry,
      onCancel: finishGeometry,
    })
    .start();
  addDetachedVisualMotionControl(visual, holdControl);
}

function springFolderIconLayoutPosition(
  node: FolderIconNode,
  target: StagePoint,
  refreshBounds: () => unknown,
): void {
  motion(node)
    .layout()
    .spring(motionSprings.layout)
    .interrupt("retarget")
    .to({
      onComplete: refreshBounds,
      onUpdate: refreshBounds,
      x: target.x,
      y: target.y,
    })
    .start();
}

function isFolderIconLayoutCoveredByVisual(
  node: FolderIconNode | null | undefined,
  hasVisualOwner = false,
): boolean {
  return Boolean(
    hasVisualOwner ||
    node?.visible === false ||
    node?.state?.dragging ||
    node?.state?.ghosted
  );
}

function motionSpringTo(
  target: object,
  vars: MotionVars,
  config: Readonly<MotionSpringConfig>,
  options: Readonly<{
    onComplete?: (() => void) | undefined;
    onUpdate?: (() => void) | undefined;
    snap?: boolean | undefined;
  }> = {},
): void {
  motion(target)
    .layout()
    .spring(config)
    .interrupt("retarget")
    .to({
      ...vars,
      onComplete: options.onComplete,
      onUpdate: options.onUpdate,
      snap: options.snap,
    })
    .start();
}

function springPanelGeometry(
  panel: Container,
  target: Readonly<{ scaleX: number; scaleY: number; x: number; y: number }>,
  options: Readonly<{
    onFrame?: (() => void) | undefined;
    spring?: Readonly<MotionSpringConfig> | undefined;
  }> = {},
): void {
  const springOptions = options.onFrame ? { onComplete: options.onFrame, onUpdate: options.onFrame } : {};
  const springConfig = options.spring || motionSprings.handoff;
  motionSpringTo(panel, { x: target.x, y: target.y }, springConfig, springOptions);
  motionSpringTo(panel.scale, { x: target.scaleX, y: target.scaleY }, springConfig, springOptions);
}

function cloneFolderGeometry(geometry: FolderGeometry | null | undefined): FolderGeometry | null {
  if (!geometry?.panel || !geometry?.grid) return null;
  return {
    panel: makeRect(geometry.panel.left, geometry.panel.top, geometry.panel.width, geometry.panel.height),
    grid: makeRect(geometry.grid.left, geometry.grid.top, geometry.grid.width, geometry.grid.height),
    sidePadding: Number(geometry.sidePadding) || 0,
  };
}

function makeResizeGeometryState(
  geometry: FolderGeometry | null | undefined,
  layoutMetrics: OptionalResizeLayoutMetrics | null = null,
): ResizeGeometryState | null {
  if (!geometry?.panel || !geometry?.grid) return null;
  const state: ResizeGeometryState = {
    gridHeight: geometry.grid.height,
    gridLeft: geometry.grid.left,
    gridTop: geometry.grid.top,
    gridWidth: geometry.grid.width,
    panelHeight: geometry.panel.height,
    panelLeft: geometry.panel.left,
    panelTop: geometry.panel.top,
    panelWidth: geometry.panel.width,
    sidePadding: Number(geometry.sidePadding) || 0,
  };
  if (layoutMetrics) {
    state.fixedCellHeight = Number(layoutMetrics.fixedCellHeight) || 0;
    state.iconSize = Number(layoutMetrics.iconSize) || 0;
    state.rowGap = Number(layoutMetrics.rowGap) || 0;
    state.rows = Number(layoutMetrics.rows) || 1;
  }
  return state;
}

function makeResizeGeometryTarget(
  geometry: FolderGeometry | null | undefined,
  layoutMetrics: OptionalResizeLayoutMetrics | null = null,
): ResizeGeometryState | Record<string, never> {
  return makeResizeGeometryState(geometry, layoutMetrics) || {};
}

function makeGeometryFromResizeState(state: ResizeGeometryState | null | undefined): FolderGeometry | null {
  if (!state) return null;
  return {
    panel: makeRect(state.panelLeft, state.panelTop, Math.max(1, state.panelWidth), Math.max(1, state.panelHeight)),
    grid: makeRect(state.gridLeft, state.gridTop, Math.max(1, state.gridWidth), Math.max(1, state.gridHeight)),
    sidePadding: Number(state.sidePadding) || 0,
  };
}

function makeFolderGeometryTargetKey(geometry: FolderGeometry | null | undefined): string {
  if (!geometry?.panel || !geometry?.grid) return "";
  return [
    geometry.panel.left,
    geometry.panel.top,
    geometry.panel.width,
    geometry.panel.height,
    geometry.grid.left,
    geometry.grid.top,
    geometry.grid.width,
    geometry.grid.height,
  ].map(readSignatureValue).join(":");
}

function makeLayoutMetricsFromResizeState(
  state: ResizeGeometryState | null | undefined,
  fallback: ResizeLayoutMetrics,
): ResizeLayoutMetrics;
function makeLayoutMetricsFromResizeState(
  state?: ResizeGeometryState | null,
  fallback?: OptionalResizeLayoutMetrics,
): OptionalResizeLayoutMetrics;
function makeLayoutMetricsFromResizeState(
  state: ResizeGeometryState | null | undefined,
  fallback: OptionalResizeLayoutMetrics = {},
): OptionalResizeLayoutMetrics {
  if (!state) return fallback;
  return {
    ...fallback,
    fixedCellHeight: Number.isFinite(Number(state.fixedCellHeight)) ? Number(state.fixedCellHeight) : fallback.fixedCellHeight,
    iconSize: Number.isFinite(Number(state.iconSize)) && Number(state.iconSize) > 0 ? Number(state.iconSize) : fallback.iconSize,
    rowGap: Number.isFinite(Number(state.rowGap)) ? Number(state.rowGap) : fallback.rowGap,
    rows: Number.isFinite(Number(state.rows)) && Number(state.rows) > 0 ? Number(state.rows) : fallback.rows,
  };
}

export interface FolderOverlayLayer {
  panel: Container;
  panelMaterial: Graphics;
  panelContentLayer: Container;
  panelClipMask: Graphics;
  frameGhost: Graphics;
  closingFrameMask: Graphics;
  pageMask: Graphics;
  pageMaskRect: StageRect | null;
  pageTrack: Container;
  pageTrackMotion: PageTrackMotionState;
  pageDotsLayer: Container<FolderPageDot>;
  openingGhostLayer: Container<FolderGhostNode>;
  closingGhostLayer: Container<FolderGhostNode>;
  detachedClosingContentLayer: RenderLayer;
  closingPreviewSwapLayer: ClosingPreviewContainerNode;
  detachedClosingVisualLayer: Container;
  ownsDetachedClosingVisualLayer: boolean;
  folderTitle: PixiText;
  iconNodes: Map<string, FolderIconNode>;
  folderIconLayoutTargets: Map<string, StagePoint>;
  iconBoundsRefreshers: Map<string, () => unknown>;
  openingGhostBoundsRefreshers: Map<string, () => unknown>;
  registeredBoundsDirty: boolean;
  registeredBoundsFlushQueued: boolean;
  onIconAction: IconNodeActionHandler;
  onClosingHandoffPrepare: (
    folderId: string | null,
    options?: ClosingHandoffPrepareOptions,
  ) => void;
  onClosingHandoffReady: (folderId: string) => void;
  onClosingPresentationReady: (folderId: string) => void;
  closingVisualReleaseFolderId: string | null;
  onClosingHandoffVisualRelease: (folderId?: string | null) => void;
  isHandoffSourceVisible: (folderId: string | null) => boolean;
  onInternalActivityChange: (active: boolean, folderId: string | null) => void;
  onClosingFolderPointerDown: (folderId: string | null, event: unknown) => void;
  onPanelPointerDown: (event: unknown) => void;
  onOutsidePointerDown: (event: unknown) => void;
  onTitleFrameChange: (frame: StageRect | null) => void;
  onDesktopSourceGhostingChange: () => void;
  onRenderRequest: (reason: string) => void;
  showFolderTitle: boolean;
  renderCopy: { newFolderName: string };
  iconBoundsRegistry: IconBoundsRegistry;
  iconTextures: IconTextureRepository | undefined;
  visualCommitQueue: FolderVisualCommitQueue;
  visualOwnership: VisualOwnershipRegistry;
  ownedVisualTokens: Set<unknown>;
  openingGhosts: FolderOpeningGhostController;
  closingPreviewSwap: FolderClosingPreviewSwapController<FolderClosingState> & FolderClosingPreviewSwapAdapter;
  closingGhosts: FolderClosingGhostController;
  folderVisualSession: FolderOverlayVisualSession;
  openingLease: FolderOverlayOpenLease | null;
  closingLease: FolderOverlayCloseLease | null;
  openingPanelReadyFrame: { cancelled: boolean } | null;
  panelAlphaTarget: number | null;
  panelOpenTargetKey: string | null;
  panelOpenProgressDriven: boolean;
  panelZoomFadeClosing: boolean;
  resizeLayoutSync: ResizeLayoutSync | null;
  resizeLayoutSignature: string | null;
  resizeLayoutMetricsSnapshot: ResizeLayoutMetrics | null | undefined;
  resizeVisualGeometryState: ResizeGeometryState | null;
  resizeVisualGeometryMode: ResizeLayoutMode | null;
  resizeVisualGeometryFinalMode: ResizeLayoutMode | null;
  resizeVisualGeometryFinalTargetKey: string | null;
  resizeVisualGeometryTargetKey: string | null;
  resizeVisualLayoutStartMetrics: OptionalResizeLayoutMetrics | null;
  resizeVisualLayoutTargetMetrics: OptionalResizeLayoutMetrics | null;
  lastVisualFolderPageIndex: number | null;
  pageTurnVisualSettle: PageTurnVisualSettle | null;
  targetFolderGeometry: FolderGeometry | null;
  stableFolderSlotContext: StableFolderSlotContext | null;
  detachedClosingVisuals: DetachedClosingVisual[];
  closingDesktopPageTrackMirrorBaseline: { folderId: string; liveX: number } | null;
  closingDesktopPageTrackMirrorX: number;
  nextDetachedClosingVisualToken: number;
  openingFrameEpoch: number;
  titleFrameKey: string | null;
  titleFrameFolderId: string | null;
  titleFrameOpeningLease: FolderOpenLease | null;
  pageDotsLayerRevealKey: string | null;
  panelTitleOpening: boolean;
  panelTitleStartScaleX: number;
  panelTitleStartScaleY: number;
  stageRect: StageRect | undefined;
  currentFolderId: string | null | undefined;
  currentOpeningGeometrySnapshot: FolderOpeningGeometrySnapshot | null | undefined;
  frameGhostFolderId: string | null | undefined;
  frameGhostPhase: string | null | undefined;
  frameGhostPresentedSnapshot: FolderFramePresentedSnapshot | null | undefined;
  openingContentPresentedSnapshot: OpeningContentPresentedSnapshot | null | undefined;
  closingContentPresentedSnapshot: ClosingContentPresentedSnapshot | null | undefined;
  frameGhostState: MutableFramePresentation | null | undefined;
  frameGhostTransitionState: FolderFrameTransitionState | null | undefined;
  frameGhostMotionControl: MotionControl | null | undefined;
  hitArea: ClosingPresentationHitArea | null;
  isClosing: boolean | undefined;
  isUserFolderClosing: boolean | undefined;
  panelGeometry: GeometryRect | null | undefined;
  sizeKey: string | null | undefined;
  stableFolderCloseTarget: StableFolderCloseTarget | null | undefined;
}

export class FolderOverlayLayer extends Container {
  private panelPresentation:Parameters<FolderOverlayLayer["animatePanel"]>|null=null;

  /** Native progress is externally driven; do not rebuild icon/layout plans for it. */
  presentOpenProgress(progress:number):void {
    const input=this.panelPresentation;
    if(!input||this.destroyed||!this.visible||input[0].isFolderClosing)return;
    this.animatePanel({...input[0],folderOpenProgress:progress},input[1],input[2],input[3],input[4],input[5]);
  }
  constructor(options: FolderOverlayLayerOptions) {
    super();
    this.panel = new Container();
    this.panelMaterial = new Graphics();
    this.panelContentLayer = new Container();
    this.panelClipMask = new Graphics();
    this.frameGhost = new Graphics();
    this.frameGhost.visible = false;
    this.closingFrameMask = new Graphics();
    this.pageMask = new Graphics();
    this.pageMaskRect = null;
    this.pageTrack = new Container();
    this.pageTrackMotion = createPageTrackMotionState();
    this.pageDotsLayer = new Container();
    this.pageDotsLayer.alpha = 0;
    this.openingGhostLayer = new Container<FolderGhostNode>();
    this.closingGhostLayer = new Container<FolderGhostNode>();
    this.detachedClosingContentLayer = new RenderLayer();
    this.closingPreviewSwapLayer = new Container() as ClosingPreviewContainerNode;
    this.detachedClosingVisualLayer = options.detachedClosingVisualLayer || new Container();
    this.ownsDetachedClosingVisualLayer = !options.detachedClosingVisualLayer;
    this.folderTitle = createPixiText({
      text: "",
      style: {
        fill: 0xffffff,
        fontSize: 18,
        fontWeight: "600",
        fontFamily: [...PIXI_UI_FONT_FAMILY],
      },
    });
    this.folderTitle.eventMode = "none";
    this.iconNodes = new Map();
    this.folderIconLayoutTargets = new Map();
    this.iconBoundsRefreshers = new Map();
    this.openingGhostBoundsRefreshers = new Map();
    this.registeredBoundsDirty = false;
    this.registeredBoundsFlushQueued = false;
    this.iconTextures = options.iconTextures;
    this.onIconAction = options.onIconAction || (() => { });
    this.onClosingHandoffPrepare = options.onClosingHandoffPrepare || (() => { });
    this.onClosingHandoffReady = options.onClosingHandoffReady || (() => { });
    this.onClosingPresentationReady = options.onClosingPresentationReady || (() => { });
    this.closingVisualReleaseFolderId = null;
    const onClosingHandoffVisualRelease = options.onClosingHandoffVisualRelease || (() => { });
    this.onClosingHandoffVisualRelease = (folderId = null) => {
      this.closingVisualReleaseFolderId = folderId || null;
      onClosingHandoffVisualRelease(folderId || null);
    };
    this.isHandoffSourceVisible = options.isHandoffSourceVisible || (() => false);
    this.onInternalActivityChange = options.onInternalActivityChange || (() => { });
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => { });
    this.onPanelPointerDown = options.onPanelPointerDown || (() => { });
    this.onOutsidePointerDown = options.onOutsidePointerDown || (() => { });
    this.onTitleFrameChange = options.onTitleFrameChange || (() => { });
    this.onDesktopSourceGhostingChange = options.onDesktopSourceGhostingChange || (() => { });
    this.onRenderRequest = options.onRenderRequest || (() => { });
    this.showFolderTitle = options.showFolderTitle === true;
    this.renderCopy = { newFolderName: String(options.renderCopy?.newFolderName || "") };
    if (!options.iconBoundsRegistry) throw new Error("FolderOverlayLayer requires iconBoundsRegistry");
    this.iconBoundsRegistry = options.iconBoundsRegistry;
    this.visualCommitQueue = options.visualCommitQueue || new FolderVisualCommitQueue();
    this.visualOwnership = options.visualOwnership || new VisualOwnershipRegistry();
    this.ownedVisualTokens = new Set();
    this.openingGhosts = new FolderOpeningGhostController(
      this as FolderOverlayLayer & FolderOpeningGhostControllerLayer,
      {
        ghostFactory: () => new IconNode({ iconTextures: this.iconTextures }) as FolderGhostNode,
      });
    this.closingPreviewSwap = new FolderClosingPreviewSwapController<FolderClosingState>(
      this as FolderOverlayLayer & FolderClosingPreviewSwapLayer,
      {
        containerFactory: () => new Container() as ClosingPreviewContainerNode,
        getIconTexture: (item, render, ghost) => (this.iconTextures ?? iconTextureRepository).resolve(item, render, ghost),
        graphicsFactory: () => new Graphics() as ClosingPreviewGraphicsNode,
        spriteFactory: () => new Sprite() as ClosingPreviewSpriteNode,
        textFactory: (size) => createPixiText({ text: "", style: { align: "center", fill: 0xffffff, fontSize: size, lineHeight: size } }) as ClosingPreviewTextNode,
      });
    this.closingGhosts = new FolderClosingGhostController(
      this as FolderOverlayLayer & FolderClosingGhostControllerLayer,
      {
        ghostFactory: () => new IconNode({ iconTextures: this.iconTextures }) as FolderGhostNode,
        previewSwap: this.closingPreviewSwap,
      });
    this.folderVisualSession = new FolderVisualSession<
      FolderOpeningControllerVisualPlan,
      FolderClosingControllerVisualPlan
    >({
      closingAdapter: this.closingGhosts,
      onCloseHandoffChange: (active, folderId) => this.onInternalActivityChange?.(active, folderId),
      onClosingHandoffReady: (folderId) => this.onClosingHandoffReady?.(folderId),
      onClosingPresentationReady: (folderId) => this.onClosingPresentationReady?.(folderId),
      openingAdapter: this.openingGhosts,
      ownershipRevision: () => this.visualOwnership.getRevision?.() ?? null,
    });
    this.openingLease = null;
    this.closingLease = null;
    this.openingPanelReadyFrame = null;
    this.panelAlphaTarget = null;
    this.panelOpenTargetKey = null;
    this.panelOpenProgressDriven = false;
    this.panelZoomFadeClosing = false;
    this.resizeLayoutSync = null;
    this.resizeLayoutSignature = null;
    this.resizeVisualGeometryState = null;
    this.resizeVisualGeometryMode = null;
    this.resizeVisualGeometryFinalMode = null;
    this.resizeVisualGeometryFinalTargetKey = null;
    this.resizeVisualGeometryTargetKey = null;
    this.resizeVisualLayoutStartMetrics = null;
    this.resizeVisualLayoutTargetMetrics = null;
    this.lastVisualFolderPageIndex = null;
    this.pageTurnVisualSettle = null;
    this.targetFolderGeometry = null;
    this.stableFolderSlotContext = null;
    this.detachedClosingVisuals = [];
    this.closingDesktopPageTrackMirrorBaseline = null;
    this.closingDesktopPageTrackMirrorX = 0;
    this.nextDetachedClosingVisualToken = 1;
    this.openingFrameEpoch = 0;
    this.titleFrameKey = null;
    this.titleFrameFolderId = null;
    this.titleFrameOpeningLease = null;
    this.pageDotsLayerRevealKey = null;
    this.panelTitleOpening = false;
    this.panelTitleStartScaleX = 1;
    this.panelTitleStartScaleY = 1;
    this.frameGhostPresentedSnapshot = null;
    this.openingContentPresentedSnapshot = null;
    this.closingContentPresentedSnapshot = null;
    this.addChild(this.frameGhost);
    this.addChild(this.closingFrameMask);
    if (this.ownsDetachedClosingVisualLayer) this.addChild(this.detachedClosingVisualLayer);
    this.addChild(this.panel);
    this.panel.addChild(this.panelMaterial);
    this.panel.addChild(this.panelClipMask);
    this.panel.addChild(this.panelContentLayer);
    this.panelContentLayer.addChild(this.pageMask);
    this.panelContentLayer.addChild(this.pageTrack);
    this.panel.addChild(this.folderTitle);
    this.addChild(this.pageDotsLayer);
    this.addChild(this.detachedClosingContentLayer);
    this.addChild(this.openingGhostLayer);
    this.addChild(this.closingGhostLayer);
    this.addChild(this.closingPreviewSwapLayer);
    this.refreshPanelClipMask();
    this.pageTrack.mask = this.pageMask;
    this.eventMode = "static";
    this.on("pointerdown", (event) => this.handlePointerDown(event));
    this.describeMotionTargets();
  }

  setRenderCopy(copy: FolderOverlayRenderCopy = {}): void {
    this.renderCopy = { newFolderName: String(copy.newFolderName || "") };
  }

  update(state: FolderOverlayStateInput): FolderGeometry | null {
    if(!state.renderedFolder)this.panelPresentation=null;
    this.syncPageTurnVisualSettle(state);
    const prepared = this.prepareFolderOverlayState(state);
    if (prepared.done) return prepared.result;
    const resolved = this.resolveFolderOverlayGeometry(prepared);
    const synced = this.syncFolderOverlayNodes(resolved);
    this.startFolderOverlayTransitions(synced);
    this.finishResizeLayoutSyncFrame(synced);
    this.advancePageTurnVisualSettle(state);
    return resolved.targetGeometry || resolved.geometry;
  }

  applyGroupTransferOwnershipSnapshot(
    ownership: Readonly<{ itemIds?: ReadonlySet<string> | readonly string[] | undefined }> = {},
  ): boolean {
    const itemIds = ownership.itemIds instanceof Set ? ownership.itemIds : new Set();
    let changed = false;
    for (const [key, node] of this.iconNodes) {
      if (!node?.state) continue;
      const wasDirectlyOwned = node.__groupTransferGhostedByOwnership === true;
      const isDirectlyOwned = itemIds.has(node.item?.id);
      if (wasDirectlyOwned === isDirectlyOwned) continue;

      if (isDirectlyOwned) {
        killMotionOf(node, null, { reason: "group-release-folder-source-handoff" });
        killMotionOf(node.scale, null, { reason: "group-release-folder-source-handoff" });
      } else {
        const layoutTarget = this.folderIconLayoutTargets.get(key);
        if (layoutTarget) {
          killMotionOf(node, "x,y", {
            lane: "base",
            reason: FOLDER_DRAG_HANDOFF_LAYOUT_REASON,
          });
          node.position.set(layoutTarget.x, layoutTarget.y);
        }
      }

      const baseGhosted = Boolean(node.state.ghosted) && !wasDirectlyOwned;
      node.__groupTransferGhostedByOwnership = isDirectlyOwned;
      node.setState({
        ...node.state,
        dragging: isDirectlyOwned ? node.state.dragging : false,
        ghosted: baseGhosted || isDirectlyOwned,
      });
      this.iconBoundsRefreshers.get(key)?.();
      changed = true;
    }
    return changed;
  }

  syncPageTurnVisualSettle(state: FolderOverlayStateInput = {}): void {
    const renderedFolderId = state.renderedFolder?.id || null;
    const visualPageIndex = Number(state.visualFolderPageIndex ?? state.folderPageIndex ?? 0);
    const hasActiveDrag = Boolean(renderedFolderId && state.dragMeta);
    if (!renderedFolderId || !hasActiveDrag) {
      this.lastVisualFolderPageIndex = renderedFolderId ? visualPageIndex : null;
      this.pageTurnVisualSettle = null;
      return;
    }
    const previousPageIndex = this.lastVisualFolderPageIndex;
    if (previousPageIndex !== null && previousPageIndex !== visualPageIndex) {
      this.pageTurnVisualSettle = {
        folderId: renderedFolderId,
        remainingRenders: FOLDER_PAGE_TURN_SETTLE_RENDERS,
        targetIndex: visualPageIndex,
      };
    } else if (
      this.pageTurnVisualSettle &&
      (this.pageTurnVisualSettle.folderId !== renderedFolderId ||
        this.pageTurnVisualSettle.targetIndex !== visualPageIndex)
    ) {
      this.pageTurnVisualSettle = null;
    }
    this.lastVisualFolderPageIndex = visualPageIndex;
  }

  isPageTurnVisualSettleActive(state: FolderOverlayStateInput = {}): boolean {
    const settle = this.pageTurnVisualSettle;
    if (!settle || !state.dragMeta || settle.folderId !== state.renderedFolder?.id) return false;
    const visualPageIndex = Number(state.visualFolderPageIndex ?? state.folderPageIndex ?? 0);
    return settle.targetIndex === visualPageIndex && settle.remainingRenders > 0;
  }

  advancePageTurnVisualSettle(state: FolderOverlayStateInput = {}): void {
    const settle = this.pageTurnVisualSettle;
    if (!settle || !state.dragMeta || settle.folderId !== state.renderedFolder?.id) return;
    if (isPageTrackMotionActive(this.pageTrackMotion, this.pageTrack)) return;
    settle.remainingRenders -= 1;
    if (settle.remainingRenders <= 0) this.pageTurnVisualSettle = null;
  }

  isDesktopCloseZoomFadeState(state: FolderOverlayStateInput = {}): boolean {
    return Boolean(
      state.isDesktopClosing &&
      state.isFolderZoomFadeClosing &&
      state.folderZoomFadeCloseReason === "desktop"
    );
  }

  getDesktopCloseDetachedFolderId(state: FolderOverlayStateInput = {}): string | null {
    return state.renderedFolder?.id ||
      this.folderVisualSession.snapshot().closing?.folderId ||
      this.currentFolderId ||
      null;
  }

  hasDesktopCloseDetachedVisual(folderId: string | null = null): boolean {
    return (this.detachedClosingVisuals || []).some((visual) =>
      (!folderId || visual?.folderId === folderId) &&
      visual.releaseAfterDesktopClose === true &&
      !visual.destroyed &&
      !visual.handoffCommitted
    );
  }

  hasActiveDesktopCloseDetachedHandoff(state: FolderOverlayStateInput = {}): boolean {
    if (state.isDesktopClosing !== true) return false;
    if (this.isDesktopCloseDetachedZoomFadeState(state)) return true;
    return this.hasDesktopCloseDetachedVisual(this.getDesktopCloseDetachedFolderId(state));
  }

  syncDesktopCloseDetachedHandoff(state: FolderOverlayStateInput = {}): void {
    if (state.isDesktopClosing !== true) {
      this.requestDesktopCloseDetachedVisualRelease();
      return;
    }
    if (!this.isDesktopCloseDetachedZoomFadeState(state)) return;
    const folderId = this.getDesktopCloseDetachedFolderId(state);
    if (!folderId || this.hasDesktopCloseDetachedVisual(folderId)) return;
    this.detachClosingPresentationForDesktopClose(folderId);
  }

  isDesktopCloseDetachedZoomFadeState(state: FolderOverlayStateInput = {}): boolean {
    return Boolean(this.isDesktopCloseZoomFadeState(state) && state.isFolderClosing);
  }

  requestDesktopCloseDetachedVisualRelease(): void {
    for (const visual of Array.from(this.detachedClosingVisuals || [])) {
      if (!visual?.releaseAfterDesktopClose || visual.destroyed || visual.handoffCommitted) continue;
      visual.desktopCloseReleaseRequested = true;
      if (visual.geometryComplete) this.clearDetachedClosingVisualNow(visual);
    }
  }

  applyDesktopCloseDetachedOverlayState(): null {
    applyClosingHandoffOnlyOverlayState(this as FolderClosingHandoffLayer);
    this.clearPageDots();
    return null;
  }

  prepareFolderOverlayState(state: FolderOverlayStateInput): FolderOverlayPreparation {
    this.stageRect = state.stageRect;
    const isPrewarm = Boolean(state.prewarm);
    if (!isPrewarm) this.syncDesktopCloseDetachedHandoff(state);
    if (!isPrewarm) this.iconBoundsRegistry.clearBounds("folder");
    const keepClosingHandoff = this.closingGhosts.hasPendingHandoff();
    const keepDesktopCloseDetachedHandoff = !isPrewarm && this.hasActiveDesktopCloseDetachedHandoff(state);
    this.visible = Boolean(state.renderedFolder) || keepClosingHandoff || keepDesktopCloseDetachedHandoff;
    if (!state.renderedFolder) {
      this.closingVisualReleaseFolderId = null;
      const clearedFolderId = this.currentFolderId;
      this.clearRegisteredIconBounds();
      if (keepDesktopCloseDetachedHandoff) {
        return { done: true, result: this.applyDesktopCloseDetachedOverlayState() };
      }
      if (keepClosingHandoff) {
        return { done: true, result: applyClosingHandoffOnlyOverlayState(this as FolderClosingHandoffLayer) };
      }
      this.teardownTransientState({
        cancelPageTrackReason: "cleanup",
        clearPageDots: true,
        clearPageTrackSpringsReason: FOLDER_OVERLAY_CLEAR_REASON,
        clearPanelSpringsReason: FOLDER_OVERLAY_CLEAR_REASON,
        preserveDetachedClosing: true,
      });
      this.currentFolderId = null;
      this.isClosing = false;
      this.isUserFolderClosing = false;
      this.sizeKey = null;
      this.resizeLayoutSync = null;
      this.resizeLayoutSignature = null;
      this.resizeLayoutMetricsSnapshot = null;
      this.lastVisualFolderPageIndex = null;
      this.pageTurnVisualSettle = null;
      this.clearResizeVisualGeometry(FOLDER_OVERLAY_CLEAR_REASON);
      this.targetFolderGeometry = null;
      this.stableFolderSlotContext = null;
      this.stableFolderCloseTarget = null;
      this.resetClosingDesktopPageTrackMirror();
      this.clearFolderIconNodes(FOLDER_OVERLAY_CLEAR_REASON);
      if (state.folderPanelRef) state.folderPanelRef.value = null;
      if (state.folderViewportRef) state.folderViewportRef.value = null;
      this.notifyTitleFrame(null, { folderId: clearedFolderId });
      return { done: true, result: null };
    }
    if (keepDesktopCloseDetachedHandoff) {
      return { done: true, result: this.applyDesktopCloseDetachedOverlayState() };
    }
    this.panel.visible = true;
    this.closingPreviewSwap.ensureLayer();
    ensureClosingFrameMaskState(this as FolderFrameGhostLayer);
    this.hitArea = new Rectangle(0, 0, state.width, state.height);
    const geometry = getFolderPanelGeometry({
      height: state.height,
      panelStyle: state.folderPanelStyle,
      width: state.width,
    });
    const targetLayoutMetrics = makeResizeLayoutMetricsSnapshot(state, geometry);
    const previousLayoutMetrics = this.resizeLayoutMetricsSnapshot
      ? { ...this.resizeLayoutMetricsSnapshot }
      : null;
    const sizeKey = `${state.width}x${state.height}`;
    const layoutSignature = makeResizeLayoutSignature(state, geometry);
    const sizeChanged = Boolean(this.sizeKey && this.sizeKey !== sizeKey);
    this.sizeKey = sizeKey;
    this.syncResizeLayoutState(state, sizeKey, layoutSignature, sizeChanged);
    this.resizeLayoutMetricsSnapshot = { ...targetLayoutMetrics };

    const renderState = state;
    const isClosing = Boolean(renderState.isFolderClosing || renderState.isFolderAppLaunchClosing);
    const wasClosing = Boolean(this.isClosing);
    const renderedFolderId = state.renderedFolder?.id || null;
    if (
      this.closingVisualReleaseFolderId &&
      (this.closingVisualReleaseFolderId !== renderedFolderId || !isClosing)
    ) {
      this.closingVisualReleaseFolderId = null;
    }
    const visualSessionSnapshot = this.folderVisualSession.snapshot();
    const hasPendingRenderedOpen = visualSessionSnapshot.opening?.folderId === renderedFolderId &&
      visualSessionSnapshot.opening.revealPending;
    if (wasClosing && !isClosing && this.currentFolderId === renderedFolderId && !hasPendingRenderedOpen) {
      this.currentFolderId = null;
    }
    const isNewFolder = !isPrewarm && this.currentFolderId !== state.renderedFolder?.id;
    this.isClosing = isClosing;
    this.isUserFolderClosing = Boolean(renderState.isFolderClosing);
    const previousGeometry = cloneFolderGeometry(this.targetFolderGeometry);
    this.panelGeometry = geometry.panel;
    this.targetFolderGeometry = cloneFolderGeometry(geometry);
    const folderId = state.renderedFolder.id;
    this.describeMotionTargets(renderState, geometry);
    const closingFolderId = visualSessionSnapshot.closing?.folderId || null;
    if (closingFolderId && (closingFolderId !== folderId || !isClosing)) {
      this.detachClosingPresentationForOpen(folderId);
    }
    return {
      done: false,
      folderId,
      geometry,
      isClosing,
      isBatchSelectionActive: state.isBatchSelectionActive,
      isNewFolder,
      isPrewarm,
      previousGeometry,
      previousLayoutMetrics,
      resizeLayoutSignature: layoutSignature,
      state: renderState,
      targetLayoutMetrics,
      wasClosing,
    };
  }

  resolveFolderOverlayGeometry(context: FolderOverlayPreparedContext): FolderOverlayResolvedContext {
    const { folderId, geometry: targetGeometry, isClosing, isNewFolder, isPrewarm, state, wasClosing } = context;
    const resizeLayoutSyncActive = this.isResizeLayoutSyncActive();
    const geometry = this.resolveResizeVisualGeometry(context) || targetGeometry;
    const targetGeometryKey = makeResizeVisualTargetKey(targetGeometry, context.targetLayoutMetrics);
    const resizeVisualGeometryActive = Boolean(
      this.resizeVisualGeometryState &&
      this.resizeVisualGeometryTargetKey === targetGeometryKey
    );
    const resizeVisualGeometryFinalFrame = Boolean(
      this.resizeVisualGeometryFinalTargetKey &&
      this.resizeVisualGeometryFinalTargetKey === targetGeometryKey
    );
    const resizeGeometryMode = resizeVisualGeometryActive
      ? this.resizeVisualGeometryMode
      : resizeVisualGeometryFinalFrame
        ? this.resizeVisualGeometryFinalMode
        : this.resizeLayoutSync?.mode || null;
    if (resizeVisualGeometryFinalFrame) {
      this.resizeVisualGeometryFinalTargetKey = null;
      this.resizeVisualGeometryFinalMode = null;
    }
    const overlayTargets = resolveFolderOverlayTargets({
      folder: state.renderedFolder as FolderLayerFolder & ResolverFolder,
      folderOpeningOriginBounds: state.folderOpeningOriginBounds,
      folderPageSize: state.folderPageSize,
      iconBoundsRegistry: this.iconBoundsRegistry,
      isClosing,
      previousStableFolderCloseTarget: this.stableFolderCloseTarget,
      wasClosing,
    });
    this.stableFolderCloseTarget = overlayTargets.stableFolderCloseTarget;
    const {
      desktopIconSize,
      desktopSlot,
      folderClientRect,
      folderThumbClientRect,
      getOpeningPreviewChildClientRect,
      previewSlots,
    } = overlayTargets;
    const framePlacement = state.desktopGrid && state.desktopFrame
      ? desktopSlot
        ? makeFolderTransitionPlacement(desktopSlot.index, state.desktopGrid)
        : inferFolderTransitionPlacement(
          folderClientRect || folderThumbClientRect,
          state.stageRect,
          state.desktopFrame,
          state.desktopGrid,
        )
      : null;
    this.drawPanel(geometry.panel);
    this.syncResizeFrameGhostShell(geometry, {
      isClosing,
      resizeGeometryMode,
      resizeLayoutSyncActive,
      resizeVisualGeometryActive,
      resizeVisualGeometryFinalFrame,
    });
    if (resizeLayoutSyncActive) {
      this.rebuildPanelClipMask(geometry.panel);
    } else {
      this.drawPanelClipMask(geometry.panel);
      this.refreshPanelClipMask();
    }
    this.updatePageDots(state, geometry);
    if (isClosing) applyClosingPresentationOverlayState(this as FolderClosingHandoffLayer);
    this.panel.pivot.set(geometry.panel.width / 2, geometry.panel.height / 2);
    const targetX = geometry.panel.left + geometry.panel.width / 2;
    const targetY = geometry.panel.top + geometry.panel.height / 2;
    if (isPrewarm) {
      this.currentOpeningGeometrySnapshot = null;
      this.currentFolderId = state.renderedFolder?.id;
      this.panel.position.set(targetX, targetY);
      this.panel.scale.set(1);
      this.panel.alpha = 1;
      this.panelTitleOpening = false;
    } else {
      this.currentOpeningGeometrySnapshot = this.animatePanel(state, targetX, targetY, geometry.panel, folderClientRect, {
        getPreviewChildRect: getOpeningPreviewChildClientRect,
        previewSlots,
        resizeLayoutSyncActive,
        resizeVisualGeometryActive,
        resizeVisualGeometryFinalFrame,
      })?.openingGeometrySnapshot || null;
    }

    this.folderTitle.text = state.renderedFolder.name || this.renderCopy.newFolderName;
    this.folderTitle.visible = this.showFolderTitle;
    this.folderTitle.anchor.set(0.5);
    this.folderTitle.position.set(geometry.panel.width / 2, -34);

    const committedFolderPageIndex = state.folderPageIndex ?? 0;
    const visualFolderPageIndex = state.visualFolderPageIndex ?? committedFolderPageIndex;
    const hasFolderPageTurnState = Boolean(
      state.folderPageTrackScrub ||
      state.folderPageTurnToken != null ||
      visualFolderPageIndex !== committedFolderPageIndex
    );
    const targetLayoutMetrics = context.targetLayoutMetrics || makeResizeLayoutMetricsSnapshot(state, targetGeometry);
    const rawVisualLayoutMetrics = resizeVisualGeometryActive
      ? makeLayoutMetricsFromResizeState(this.resizeVisualGeometryState, targetLayoutMetrics)
      : targetLayoutMetrics;
    const cols = targetLayoutMetrics.cols;
    const rows = rawVisualLayoutMetrics.rows;
    const rowGap = rawVisualLayoutMetrics.rowGap;
    const fixedCellHeight = rawVisualLayoutMetrics.fixedCellHeight;
    const metrics = getFolderGridMetrics({ cols, fixedCellHeight, grid: geometry.grid, rowGap, rows });
    const iconSize = resolveFolderIconRenderSize({
      cellHeight: metrics.cellHeight,
      cellWidth: metrics.cellWidth,
      fallbackSize: state.iconSize,
      requestedSize: rawVisualLayoutMetrics.iconSize,
    });
    const visualLayoutMetrics = iconSize === rawVisualLayoutMetrics.iconSize
      ? rawVisualLayoutMetrics
      : { ...rawVisualLayoutMetrics, iconSize };
    const localGridLeft = geometry.grid.left - geometry.panel.left;
    const localGridTop = geometry.grid.top - geometry.panel.top;
    const localMetrics = { ...metrics, gridLeft: localGridLeft, gridTop: localGridTop };
    const stableMetrics = getFolderGridMetrics({
      cols,
      fixedCellHeight: targetLayoutMetrics.fixedCellHeight,
      grid: targetGeometry.grid,
      rowGap: targetLayoutMetrics.rowGap,
      rows: targetLayoutMetrics.rows,
    });
    const stableIconSize = resolveFolderIconRenderSize({
      cellHeight: stableMetrics.cellHeight,
      cellWidth: stableMetrics.cellWidth,
      fallbackSize: state.iconSize,
      requestedSize: targetLayoutMetrics.iconSize,
    });
    const stableVisualSpec = makeIconVisualSpec({
      cellHeight: stableMetrics.cellHeight,
      cellWidth: stableMetrics.cellWidth,
      compact: false,
      iconSize: stableIconSize,
      singleLineLabel: false,
      textless: state.isTextlessMode,
    });
    this.stableFolderSlotContext = {
      folderId,
      iconSize: stableIconSize,
      isTextlessMode: state.isTextlessMode,
      metrics: { ...stableMetrics },
      pageSpan: targetGeometry.panel.width,
      stageHeight: state.height,
      stageRect: state.stageRect ? { ...state.stageRect } : null,
      stageWidth: state.width,
      visualPageIndex: visualFolderPageIndex,
      visualSpec: stableVisualSpec,
    };
    const stableLocalMetrics = {
      ...stableMetrics,
      gridLeft: targetGeometry.grid.left - targetGeometry.panel.left,
      gridTop: targetGeometry.grid.top - targetGeometry.panel.top,
    };
    const pageMaskTopOverflow = getIconCellTopInteractionOverflow({
      cellHeight: metrics.cellHeight,
      iconSize,
      visualOffsetY: getIconVisualOffsetY(state.isTextlessMode),
    });
    // The page viewport includes interaction chrome above the content grid;
    // expanding the mask keeps layout and drag targets at their existing slots.
    this.pageMaskRect = getFolderPageMaskRect(geometry, localGridLeft, localGridTop, {
      topOverflow: pageMaskTopOverflow,
    });
    if (resizeLayoutSyncActive) {
      this.rebuildPageTrackMask();
    } else {
      this.drawPageMask(this.pageMask, this.pageMaskRect);
      this.refreshPageTrackMask();
    }
    const folderPageSpan = geometry.panel.width;
    const stableFolderPageSpan = targetGeometry.panel.width;
    const targetTrackX = -visualFolderPageIndex * folderPageSpan;
    const stableTargetTrackX = -visualFolderPageIndex * stableFolderPageSpan;
    const shouldSnapResizePageTrack = (resizeLayoutSyncActive || resizeVisualGeometryActive || resizeVisualGeometryFinalFrame) &&
      resizeGeometryMode !== "page-turn" &&
      !hasFolderPageTurnState;
    if ((isNewFolder && !isClosing) || shouldSnapResizePageTrack) {
      const reason = shouldSnapResizePageTrack ? FOLDER_RESIZE_LAYOUT_REASON : "replace";
      const killReason = shouldSnapResizePageTrack ? FOLDER_RESIZE_LAYOUT_REASON : FOLDER_PAGE_TRACK_REPLACE_REASON;
      cancelPageTrackMotion(this.pageTrackMotion, reason);
      killMotionOf(this.pageTrack, shouldSnapResizePageTrack ? "x" : null, { lane: "base", reason: killReason });
      this.pageTrack.x = targetTrackX;
      this.pageTrackMotion.key = null;
      this.pageTrackMotion.mode = "spring";
      this.pageTrackMotion.settleToken = null;
      this.pageTrackMotion.targetX = targetTrackX;
      this.markRegisteredBoundsDirty();
    } else {
      const markBoundsDirty = () => this.markRegisteredBoundsDirty();
      updatePageTrackMotion(this.pageTrackMotion, this.pageTrack, {
        debugMetadata: {
          folderId,
          kind: "PageTrack",
          label: `${state.renderedFolder.name || folderId || "Folder"} page track`,
          layer: "folder",
        },
        onFrame: markBoundsDirty,
        pageIndex: visualFolderPageIndex,
        pageSpan: folderPageSpan,
        scrub: state.folderPageTrackScrub,
        sourceLabel: "folder.pageTrack",
        springConfig: motionSprings.layout,
      });
    }
    const { closeIconRect, closeThumbRect } = getStableFolderCloseRects({
      folderId,
      folderRect: folderClientRect,
      folderThumbRect: folderThumbClientRect,
      isClosing,
      stableFolderCloseTarget: this.stableFolderCloseTarget,
    });

    if (!isPrewarm) this.bindFakeRefs(state, targetGeometry);
    const visualSessionSnapshot = this.folderVisualSession.snapshot();
    const renderPlan = makeFolderOverlayRenderPlan({
      frame: {
        closingGhostKeys: new Set(visualSessionSnapshot.closing?.ghostIds || []),
        focusedIcon: state.focusedIcon,
        folderId,
        folderPageIndex: committedFolderPageIndex,
        folderPages: state.folderPages,
        folderPageSize: state.folderPageSize,
        getFolderPageRenderMode: state.getFolderPageRenderMode!,
        getVisibleFolderPage: state.getVisibleFolderPage!,
        groupDragState: makeFolderOverlayGroupDragSnapshot(state.groupDragState),
        groupTransferOwnedItemIds: new Set(state.groupTransferOwnedItemIds || []),
        iconGesturePresentation: state.iconGesturePresentation,
        iconSize,
        isBatchSelectionActive: state.isBatchSelectionActive,
        isEditMode: state.isEditMode,
        isIconOpening: typeof state.isIconOpening === "function" ? state.isIconOpening : null,
        isTextlessMode: state.isTextlessMode,
        launchTargetStatusById: state.launchTargetStatusById,
        selectedAppIds: state.selectedAppIds,
        showMissingLaunchTargetBadge: state.showMissingLaunchTargetBadge,
        stageHeight: state.height,
        stageWidth: state.width,
        visualFolderPageIndex,
      },
      isNewFolder,
      liveLayout: {
        cols,
        geometry,
        metrics: localMetrics,
        pageSpan: folderPageSpan,
        rows,
        trackX: targetTrackX,
      },
      stableLayout: {
        closeTarget: this.stableFolderCloseTarget,
        geometry: targetGeometry,
        metrics: stableLocalMetrics,
        pageSpan: stableFolderPageSpan,
        trackX: stableTargetTrackX,
      },
      transitions: {
        closeThumbRect,
        folderCloseIconGhosts: state.folderCloseIconGhosts,
        folderOpenIconGhosts: state.folderOpenIconGhosts,
        isClosing,
        isFolderClosing: state.isFolderClosing,
        openingGhostItemIds: new Set(visualSessionSnapshot.opening?.ghostIds || []),
        previewSlots,
      },
    });
    return {
      ...context,
      closeIconRect,
      closeThumbRect,
      desktopIconSize,
      framePlacement,
      folderClientRect,
      folderThumbClientRect,
      geometry,
      getOpeningPreviewChildClientRect,
      iconSize,
      previewSlots,
      renderPlan,
      resizeGeometryMode,
      resizeVisualGeometryActive,
      resizeVisualGeometryFinalFrame,
      stableIconSize,
      stableVisualSpec,
      targetGeometry,
      targetLayoutMetrics,
      visualLayoutMetrics,
    };
  }

  syncFolderOverlayNodes(context: FolderOverlayResolvedContext): FolderOverlaySyncedContext {
    const {
      closeThumbRect,
      folderClientRect,
      folderId,
      getOpeningPreviewChildClientRect,
      iconSize,
      isPrewarm,
      renderPlan,
      resizeGeometryMode,
      resizeVisualGeometryActive,
      resizeVisualGeometryFinalFrame,
      stableIconSize,
      stableVisualSpec,
      state,
      visualLayoutMetrics,
    } = context;
    const resizeLayoutSyncActive = this.isResizeLayoutSyncActive();
    const shouldSnapIconLayoutForResize = Boolean(
      (resizeLayoutSyncActive || resizeVisualGeometryActive || resizeVisualGeometryFinalFrame) &&
      resizeGeometryMode !== "page-turn"
    );
    const hasProvisionalOpeningLayoutTarget = resizeGeometryMode === "opening" && resizeVisualGeometryActive;
    const hasProvisionalDragLayoutTarget = resizeVisualGeometryActive;
    const seen = new Set<string>();
    const boundsRefreshers = new Map<string, () => IconBoundsRect | StageRect | null>();
    const nextLayoutTargets = new Map<string, StagePoint>();
    const openingGhostTargets: GeneratedOpeningGhostTarget[] = [];
    const closingGhostTargets: GeneratedClosingGhostTarget[] = [];
    const isInterruptedOpeningClose = state.folderOpeningCancelRequest?.folderId === folderId;
    const openingSessionSnapshot = this.folderVisualSession.snapshot().opening;
    const interruptedOpeningGeometrySnapshot = isInterruptedOpeningClose &&
      openingSessionSnapshot?.folderId === folderId
      ? openingSessionSnapshot.geometrySnapshot
      : null;
    for (const entry of renderPlan.entries) {
      const { index, isInteractivePage, item, key, nodeState, pageIndex, stableTargetCenter, targetCenter, x, y } = entry;
      seen.add(key);
      let node = this.iconNodes.get(key);
      const isNewNode = !node;
      if (!node) {
        node = new IconNode({
          iconTextures: this.iconTextures,
          onAction: (action, originalEvent, actionItem, actionSource, iconNode) =>
            this.handleIconAction(action, originalEvent, actionItem, actionSource, iconNode),
        });
        node.alpha = 0;
        node.position.set(x, y + 10);
        this.iconNodes.set(key, node);
        this.pageTrack.addChild(node);
      }

      const wasGroupTransferOwned = node.__groupTransferGhostedByOwnership === true;
      const isGroupTransferOwned = state.groupTransferOwnedItemIds instanceof Set
        ? state.groupTransferOwnedItemIds.has(item.id)
        : ((state.groupTransferOwnedItemIds || []) as readonly string[]).includes?.(item.id) === true;
      node.__groupTransferGhostedByOwnership = isGroupTransferOwned;
      node.stageRect = state.stageRect;
      node.setState(nodeState);
      const visualKey = this.getIconNodeVisualKey(node, folderId);
      const hasVisualOwner = Boolean(visualKey && this.visualOwnership.hasOwner(visualKey));
      if (hasVisualOwner) node.visible = false;

      const stableBoundsTargetCenter = stableTargetCenter;
      const isDragHandoffItem = entry.isActiveDraggedItem;
      const provisionalBoundsTarget = isDragHandoffItem
        ? hasProvisionalDragLayoutTarget
        : hasProvisionalOpeningLayoutTarget && (stableBoundsTargetCenter === targetCenter || !stableTargetCenter);
      const refreshNodeBounds = () => registerFolderIconNodeBounds({
        folderId: state.renderedFolder.id,
        iconBoundsRegistry: this.iconBoundsRegistry,
        iconSize,
        index,
        isInteractivePage,
        isPrewarm,
        item,
        node,
        pageIndex,
        provisionalLayoutTarget: provisionalBoundsTarget,
        stableIconSize,
        stableTargetCenter: stableBoundsTargetCenter,
        stableVisualSpec,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
        targetCenter,
      });
      const iconBounds = refreshNodeBounds();
      if (isInteractivePage && !isPrewarm) boundsRefreshers.set(key, refreshNodeBounds);
      if (isNewNode) {
        motion(node)
          .preset("folderOpen", {
            delay: Math.min(0.18, index * 0.012),
            duration: 0.24,
          } as MotionPreset & Readonly<{ delay: number }>)
          .overlay()
          .interrupt("retarget")
          .to({ alpha: 1 })
          .start();
      }
      const layoutTarget = { x, y };
      nextLayoutTargets.set(key, layoutTarget);
      const shouldSnapIconLayout = shouldSnapIconLayoutForResize &&
        (resizeGeometryMode !== "opening" || isFolderIconLayoutCoveredByVisual(node, hasVisualOwner));
      const shouldSnapDragHandoffLayout = entry.isActiveDraggedItem ||
        wasGroupTransferOwned ||
        isGroupTransferOwned;
      if (shouldSnapIconLayout || shouldSnapDragHandoffLayout) {
        killMotionOf(node, "x,y", {
          lane: "base",
          reason: shouldSnapDragHandoffLayout ? FOLDER_DRAG_HANDOFF_LAYOUT_REASON : FOLDER_RESIZE_LAYOUT_REASON,
        });
        node.position.set(layoutTarget.x, layoutTarget.y);
        refreshNodeBounds();
      } else if (isNewNode || isLayoutTargetChanged(this.folderIconLayoutTargets?.get(key), layoutTarget)) {
        springFolderIconLayoutPosition(node, layoutTarget, refreshNodeBounds);
      }
      if (entry.openingGhostInput) {
        const openingGeometrySnapshot = this.currentOpeningGeometrySnapshot?.folderId === folderId
          ? this.currentOpeningGeometrySnapshot
          : null;
        const openingGhostTarget = makeOpeningGhostTarget({
          ...entry.openingGhostInput,
          folderId,
          folderRect: openingGeometrySnapshot?.source?.folderRect || folderClientRect,
          getPreviewChildRect: openingGeometrySnapshot
            ? (item, previewSlotIndex) => getFolderOpeningPreviewChildRect(openingGeometrySnapshot, item, previewSlotIndex)
            : getOpeningPreviewChildClientRect,
          pageIndex,
        });
        const stableOpeningGhostTarget = hasProvisionalOpeningLayoutTarget && stableTargetCenter
          ? {
            ...openingGhostTarget,
            targetStageLayoutRect: makeIconRect(stableTargetCenter.x, stableTargetCenter.y, openingGhostTarget.iconSize),
          }
          : openingGhostTarget;
        openingGhostTargets.push({
          ...stableOpeningGhostTarget,
          provisionalLayoutTarget: hasProvisionalOpeningLayoutTarget,
        });
      }
      if (entry.closingGhostInput) {
        const interruptedOpeningTarget = isInterruptedOpeningClose
          ? makeOpeningGhostTarget({
            ...entry.closingGhostInput,
            folderId,
            folderRect: interruptedOpeningGeometrySnapshot?.source.folderRect || folderClientRect,
            getPreviewChildRect: interruptedOpeningGeometrySnapshot
              ? (sourceItem, previewSlotIndex) =>
                getFolderOpeningPreviewChildRect(
                  interruptedOpeningGeometrySnapshot,
                  sourceItem,
                  previewSlotIndex,
                )
              : getOpeningPreviewChildClientRect,
            pageIndex,
            rows: visualLayoutMetrics.rows,
            targetCenterX: targetCenter.x,
            targetCenterY: targetCenter.y,
          })
          : null;
        const interruptedOpeningSource = interruptedOpeningTarget
          ? (() => {
            const sourceRect = interruptedOpeningTarget.sourceRect;
            if (!sourceRect) {
              throw new TypeError(
                `interrupted opening close target ${item.id} requires a complete source rect`,
              );
            }
            return {
              alpha: interruptedOpeningTarget.isThumbnailChild ? 1 : 0,
              labelAlpha: 0,
              rect: sourceRect,
            };
          })()
          : null;
        closingGhostTargets.push(makeClosingGhostTarget({
          ...entry.closingGhostInput,
          closeThumbRect,
          iconBounds,
          ...(interruptedOpeningSource
            ? { interruptedOpeningSource }
            : {}),
          stableFolderCloseTarget: this.stableFolderCloseTarget ?? null,
        }));
      }
    }

    const closingPreviewSwapTargets = renderPlan.closingPreviewSwapTargets;
    this.folderIconLayoutTargets = nextLayoutTargets;
    this.iconBoundsRefreshers = boundsRefreshers;
    return {
      ...context,
      closingGhostTargets,
      closingPreviewSwapTargets,
      openingGhostTargets,
      seen,
    };
  }

  startFolderOverlayTransitions(context: FolderOverlaySyncedContext): void {
    const {
      closeIconRect,
      closeThumbRect,
      closingGhostTargets,
      closingPreviewSwapTargets,
      desktopIconSize,
      framePlacement,
      folderClientRect,
      folderId,
      folderThumbClientRect,
      geometry,
      isClosing,
      isNewFolder,
      openingGhostTargets,
      resizeGeometryMode,
      seen,
      state,
      targetGeometry,
    } = context;
    this.syncClosingDesktopPageTrackMirror(state, folderId, isClosing);
    const openingFrameTargetRect = resizeGeometryMode === "opening" && targetGeometry?.panel
      ? targetGeometry.panel
      : geometry.panel;
    const visualSessionSnapshot = this.folderVisualSession.snapshot();
    const hasOpeningVisuals = Boolean(visualSessionSnapshot.opening?.ghostIds.length);
    if (!isClosing && this.openingLease && (
      isNewFolder ||
      hasOpeningVisuals ||
      (this.frameGhostState && this.frameGhostPhase === "opening")
    )) {
      this.openingLease.present({
        options: {
          framePlacement,
          frameSourceRect: folderThumbClientRect || folderClientRect,
          frameTargetRect: openingFrameTargetRect,
        },
        state,
        targets: openingGhostTargets,
      });
    }
    if (!isNewFolder && !isClosing && state.folderOpenIconGhosts?.length && !hasOpeningVisuals) {
      for (const ghost of state.folderOpenIconGhosts) {
        if (ghost?.key) state.completeFolderOpenIconGhost?.(ghost.key);
      }
    }
    const closingVisualReleased = this.closingVisualReleaseFolderId === folderId;
    if (state.isFolderClosing && !closingVisualReleased) {
      const closeFrameRect = this.getPanelVisualRect(geometry.panel) || geometry.panel;
      const closeOptions = {
        folderIconSize: desktopIconSize ?? undefined,
        framePlacement,
        handoffRect: folderClientRect || closeIconRect,
        handoffTarget: this.stableFolderCloseTarget,
        previewSwapTargets: closingPreviewSwapTargets,
      };
      this.closingLease = this.folderVisualSession.close({ folderId });
      // The session may begin before bounds registration has published the
      // concrete thumbnail rect. Keep the lease alive, then present only once
      // the controller's required geometry contract is available.
      if (closeThumbRect) {
        this.closingLease.present({
          folderRect: closeThumbRect,
          options: closeOptions,
          panelRect: closeFrameRect,
          state,
          targets: closingGhostTargets,
        });
      }
    } else if (closingVisualReleased) {
      // The controller has already handed the overlay back to the desktop.
      // Keep the lease only while the Session still owns its terminal record,
      // so an intervening folder switch can cancel that record instead of
      // leaving a stale handoff behind. Once cleanup retires it, drop our
      // pointer; restarting it would flash the full panel and jump the corner
      // radius back to the opening geometry.
      if (!this.folderVisualSession.snapshot().closing) this.closingLease = null;
    }
    if (!state.isFolderClosing && visualSessionSnapshot.closing) {
      this.closingLease?.cancel();
      this.closingLease = null;
    }

    for (const [key, node] of this.iconNodes) {
      if (seen.has(key)) continue;
      this.iconNodes.delete(key);
      killMotionOf(node, null, { reason: FOLDER_ICON_EXIT_REASON });
      killMotionOf(node, null, { lane: "base", reason: FOLDER_ICON_EXIT_REASON });
      motion(node)
        .preset("fade", { duration: 0.14 })
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 0, onComplete: () => destroyDisplayObjectAfterFrame(node, { children: true }) })
        .start();
    }
    this.pageTrack.visible = !isClosing &&
      !this.folderVisualSession.snapshot().closing?.activeVisuals;
    if (!this.frameGhostState) {
      if (!isClosing) this.notifyPanelTitleFrame(geometry.panel, { folderId });
      else if (closingVisualReleased) this.notifyTitleFrame(null, { folderId });
      else this.notifyTitleFrame(geometry.panel, { folderId });
    }
    this.refreshRegisteredIconBounds();
  }

  setClosingDesktopPageTrackMirrorX(offsetX: unknown): number {
    const x = Number.isFinite(Number(offsetX)) ? Number(offsetX) : 0;
    this.closingDesktopPageTrackMirrorX = x;
    return x;
  }

  syncClosingDesktopPageTrackMirror(
    state: FolderOverlayStateInput = {},
    folderId: string | null = null,
    isClosing = false,
  ): number {
    if (!isClosing || !folderId) {
      this.resetClosingDesktopPageTrackMirror();
      return 0;
    }
    const liveX = getDesktopPageTrackLiveX(state);
    if (!this.closingDesktopPageTrackMirrorBaseline ||
      this.closingDesktopPageTrackMirrorBaseline.folderId !== folderId) {
      this.closingDesktopPageTrackMirrorBaseline = { folderId, liveX };
    }
    return this.setClosingDesktopPageTrackMirrorX(liveX - this.closingDesktopPageTrackMirrorBaseline.liveX);
  }

  resetClosingDesktopPageTrackMirror(): number {
    this.closingDesktopPageTrackMirrorBaseline = null;
    return this.setClosingDesktopPageTrackMirrorX(0);
  }

  getResizeLayoutMode(
    state: FolderOverlayStateInput = {},
    options: Readonly<{ layoutChanged?: boolean | undefined; sizeChanged?: boolean | undefined }> = {},
  ): ResizeLayoutMode {
    if (state.isFolderClosing || state.isFolderAppLaunchClosing || state.isFolderZoomFadeClosing) return "closing";
    const committedFolderPageIndex = state.folderPageIndex ?? 0;
    const visualFolderPageIndex = state.visualFolderPageIndex ?? committedFolderPageIndex;
    const dragSource = state.dragMeta?.source || null;
    const isCrossPageFolderDrag = Boolean(
      state.dragMeta &&
      dragSource?.type === "folder" &&
      (dragSource.folderId == null || dragSource.folderId === state.renderedFolder?.id) &&
      Number(dragSource.pageIndex) !== Number(committedFolderPageIndex)
    );
    if (state.folderPageTrackScrub ||
      state.folderPageTurnToken != null ||
      visualFolderPageIndex !== committedFolderPageIndex ||
      isCrossPageFolderDrag ||
      this.isPageTurnVisualSettleActive(state) ||
      (state.dragMeta && isPageTrackMotionActive(this.pageTrackMotion, this.pageTrack))) {
      return "page-turn";
    }
    const openProgress = readProgress01(state.folderOpenProgress);
    if (openProgress !== null && openProgress < 1) return "opening";
    if (
      this.frameGhostState &&
      this.frameGhostPhase === "opening" &&
      options.layoutChanged &&
      !options.sizeChanged &&
      state.dragMeta
    ) return "opening";
    if (this.folderVisualSession.snapshot().opening?.ghostIds.length) return "opening";
    return "layout";
  }

  isResizeLayoutSyncActive(): boolean {
    return Boolean(this.resizeLayoutSync && this.resizeLayoutSync.remainingRenders > 0);
  }

  isOpeningGeometryTransitionActive(): boolean {
    return Boolean(
      this.resizeLayoutSync?.mode === "opening" ||
      (this.resizeVisualGeometryState && this.resizeVisualGeometryMode === "opening") ||
      this.resizeVisualGeometryFinalMode === "opening"
    );
  }

  cancelResizeLayoutMotions(): void {
    cancelPageTrackMotion(this.pageTrackMotion, FOLDER_RESIZE_LAYOUT_REASON);
    killMotionOf(this.pageTrack, "x", { lane: "base", reason: FOLDER_RESIZE_LAYOUT_REASON });
    for (const node of this.iconNodes.values()) {
      if (node?.destroyed) continue;
      killMotionOf(node, "x,y", { lane: "base", reason: FOLDER_RESIZE_LAYOUT_REASON });
    }
    // A canceled spring can no longer fulfill its cached target, so unsnapped nodes must rebuild it.
    this.folderIconLayoutTargets.clear();
    this.markRegisteredBoundsDirty();
  }

  beginResizeLayoutSync(
    state: FolderOverlayStateInput,
    sizeKey: string,
    layoutSignature: string,
    options: Readonly<{ layoutChanged?: boolean | undefined; sizeChanged?: boolean | undefined }> = {},
  ): void {
    const mode = this.getResizeLayoutMode(state, options);
    this.resizeLayoutSync = {
      layoutSignature,
      mode,
      remainingRenders: FOLDER_RESIZE_SYNC_MIN_RENDERS,
      sizeKey,
    };
    this.resizeLayoutSignature = layoutSignature;
    // A page turn is a live navigation gesture, not a layout replacement.
    // Killing the page-track and icon springs here makes the first frames
    // after reversing direction appear to flash/snap before a new spring is
    // created.  Geometry/layout changes still use the existing cancellation
    // path; page turns keep their current pose and are retargeted below.
    if (mode !== "page-turn") this.cancelResizeLayoutMotions();
  }

  syncResizeLayoutState(
    state: FolderOverlayStateInput,
    sizeKey: string,
    layoutSignature: string,
    sizeChanged: boolean,
  ): void {
    const layoutChanged = Boolean(this.resizeLayoutSignature && this.resizeLayoutSignature !== layoutSignature);
    if (sizeChanged || layoutChanged) {
      this.beginResizeLayoutSync(state, sizeKey, layoutSignature, { layoutChanged, sizeChanged });
      return;
    }
    if (this.resizeLayoutSync) this.resizeLayoutSync.layoutSignature = layoutSignature;
    this.resizeLayoutSignature = layoutSignature;
  }

  clearResizeVisualGeometry(reason = FOLDER_RESIZE_LAYOUT_REASON): void {
    if (this.resizeVisualGeometryState) {
      killMotionOf(this.resizeVisualGeometryState, null, { lane: "base", reason });
    }
    this.resizeVisualGeometryState = null;
    this.resizeVisualGeometryMode = null;
    this.resizeVisualGeometryFinalMode = null;
    this.resizeVisualGeometryFinalTargetKey = null;
    this.resizeVisualGeometryTargetKey = null;
    this.resizeVisualLayoutStartMetrics = null;
    this.resizeVisualLayoutTargetMetrics = null;
  }

  startResizeVisualGeometryMotion(
    fromGeometry: FolderGeometry | null | undefined,
    toGeometry: FolderGeometry | null | undefined,
    targetKey: string,
    mode: ResizeLayoutMode | null = null,
    options: ResizeVisualGeometryOptions = {},
  ): ResizeGeometryState | null {
    const startState = this.resizeVisualGeometryState ||
      makeResizeGeometryState(fromGeometry, options.fromLayoutMetrics);
    if (!startState) return null;
    const animationMode = mode || this.resizeVisualGeometryMode || this.resizeLayoutSync?.mode || null;
    this.resizeVisualGeometryState = startState;
    this.resizeVisualGeometryMode = animationMode;
    this.resizeVisualGeometryFinalTargetKey = null;
    this.resizeVisualGeometryFinalMode = null;
    this.resizeVisualGeometryTargetKey = targetKey;
    this.resizeVisualLayoutStartMetrics = makeLayoutMetricsFromResizeState(
      startState,
      options.fromLayoutMetrics || options.toLayoutMetrics || {}
    );
    this.resizeVisualLayoutTargetMetrics = options.toLayoutMetrics ? { ...options.toLayoutMetrics } : null;
    const requestFrame = () => {
      this.markRegisteredBoundsDirty();
      this.onRenderRequest(FOLDER_RESIZE_LAYOUT_REASON);
    };
    motion(startState)
      .layout()
      .spring(motionSprings.layout)
      .interrupt("retarget")
      .to({
        ...makeResizeGeometryTarget(toGeometry, options.toLayoutMetrics),
        onComplete: () => {
          if (this.resizeVisualGeometryTargetKey !== targetKey) return;
          this.resizeVisualGeometryState = null;
          this.resizeVisualGeometryFinalTargetKey = targetKey;
          this.resizeVisualGeometryFinalMode = animationMode;
          this.resizeVisualGeometryTargetKey = null;
          this.resizeVisualGeometryMode = null;
          this.resizeVisualLayoutStartMetrics = null;
          this.resizeVisualLayoutTargetMetrics = null;
          requestFrame();
        },
        onUpdate: requestFrame,
      })
      .start();
    return startState;
  }

  resolveResizeVisualGeometry(context: ResizeVisualGeometryContext = {}): FolderGeometry | null | undefined {
    const targetGeometry = context.geometry;
    const targetLayoutMetrics = context.targetLayoutMetrics || makeResizeLayoutMetricsSnapshot(context.state, targetGeometry);
    const targetKey = makeResizeVisualTargetKey(targetGeometry, targetLayoutMetrics);
    if (context.isClosing || context.isNewFolder || context.isPrewarm) {
      this.clearResizeVisualGeometry("resize-visual-geometry-reset");
      return targetGeometry;
    }
    const hasActiveVisualGeometry = Boolean(
      this.resizeVisualGeometryState &&
      this.resizeVisualGeometryTargetKey === targetKey
    );
    const canAnimatePageTurnResize = Boolean(
      this.resizeLayoutSync?.mode === "page-turn" &&
      context.state?.dragMeta &&
      !context.state?.folderPageTrackScrub
    );
    const canAnimateOpeningResize = this.resizeLayoutSync?.mode === "opening";
    const canAnimateResizeGeometry = Boolean(
      (this.resizeLayoutSync?.mode === "layout" || canAnimateOpeningResize || canAnimatePageTurnResize) &&
      context.previousGeometry &&
      targetKey
    );

    if (canAnimateResizeGeometry && this.resizeVisualGeometryTargetKey !== targetKey) {
      this.startResizeVisualGeometryMotion(
        this.resizeVisualGeometryState ? makeGeometryFromResizeState(this.resizeVisualGeometryState) : context.previousGeometry,
        targetGeometry,
        targetKey,
        this.resizeLayoutSync?.mode || null,
        {
          fromLayoutMetrics: context.previousLayoutMetrics || targetLayoutMetrics,
          toLayoutMetrics: targetLayoutMetrics,
        }
      );
    } else if (!canAnimateResizeGeometry &&
      !hasActiveVisualGeometry &&
      this.resizeVisualGeometryFinalTargetKey !== targetKey) {
      this.clearResizeVisualGeometry("resize-visual-geometry-clear");
    }

    return this.resizeVisualGeometryState && this.resizeVisualGeometryTargetKey === targetKey
      ? makeGeometryFromResizeState(this.resizeVisualGeometryState)
      : targetGeometry;
  }

  syncResizeFrameGhostShell(
    geometry: FolderGeometry | null | undefined,
    options: ResizeFrameGhostOptions = {},
  ): void {
    const frame = this.frameGhostState;
    const panel = geometry?.panel;
    if (!frame || !panel || options.isClosing) return;
    if (this.frameGhostPhase && this.frameGhostPhase !== "opening") return;
    if (options.resizeGeometryMode === "opening") return;
    const shouldSync = Boolean(
      options.resizeLayoutSyncActive ||
      options.resizeVisualGeometryActive ||
      options.resizeVisualGeometryFinalFrame
    );
    if (!shouldSync) return;
    const transition = this.frameGhostTransitionState;
    const target = transition?.panelRect;
    const alreadyTargetsPanel = Boolean(target &&
      Math.abs(target.height - panel.height) <= 0.01 &&
      Math.abs(target.left - panel.left) <= 0.01 &&
      Math.abs(target.top - panel.top) <= 0.01 &&
      Math.abs(target.width - panel.width) <= 0.01);
    if (alreadyTargetsPanel) return;
    this.updateFrameGhostTargetGeometry(panel, {
      folderId: this.frameGhostFolderId,
      frameGhostPhase: "opening",
      notifyTitleFrame: false,
      placement: transition?.placement,
      preserveOnComplete: true,
      toRadius: getFrameRadius(panel, transition?.panelStyle.radius ?? frame.radius ?? 48),
    });
  }

  finishResizeLayoutSyncFrame(context: Partial<FolderOverlayResolvedContext> = {}): void {
    if (!this.resizeLayoutSync) return;
    const layoutSignature = context.resizeLayoutSignature ||
      (context.state && context.geometry ? makeResizeLayoutSignature(context.state, context.geometry) : null);
    if (layoutSignature && this.resizeLayoutSync.layoutSignature !== layoutSignature) {
      this.resizeLayoutSync.layoutSignature = layoutSignature;
      this.resizeLayoutSync.remainingRenders = FOLDER_RESIZE_SYNC_MIN_RENDERS;
      this.resizeLayoutSignature = layoutSignature;
      this.onRenderRequest(FOLDER_RESIZE_LAYOUT_REASON);
      return;
    }
    this.resizeLayoutSync.remainingRenders -= 1;
    if (this.resizeLayoutSync.remainingRenders <= 0) {
      this.resizeLayoutSync = null;
      this.onRenderRequest(FOLDER_RESIZE_LAYOUT_REASON);
      return;
    }
    this.onRenderRequest(FOLDER_RESIZE_LAYOUT_REASON);
  }

  resetPanelMotion(reason: string, options: ResetPanelMotionOptions = {}): void {
    const {
      panelProps = null,
      scaleProps = null,
      stopSprings = true,
    } = options;
    if (stopSprings) {
      killMotionOf(this.panel, null, { lane: "base", reason });
      killMotionOf(this.panel.scale, null, { lane: "base", reason });
    }
    killMotionOf(this.panel, panelProps, { reason });
    killMotionOf(this.panel.scale, scaleProps, { reason });
  }

  teardownTransientState(options: TeardownTransientStateOptions = {}): void {
    const {
      cancelPageTrackReason = null,
      clearDetachedClosingVisuals = false,
      clearPageDots = false,
      clearPageTrackSpringsReason = null,
      clearPanelSpringsReason = null,
      clearVisualCommitQueue = false,
      preserveDetachedClosing = false,
      releaseOwnership = true,
    } = options;
    this.openingLease?.cancel();
    this.openingLease = null;
    this.openingContentPresentedSnapshot = null;
    this.closingLease?.cancel();
    this.closingLease = null;
    this.closingContentPresentedSnapshot = null;
    this.cancelOpeningPanelReadyCheck();
    this.panelOpenTargetKey = null;
    this.panelAlphaTarget = null;
    this.panelOpenProgressDriven = false;
    this.panelZoomFadeClosing = false;
    this.resizeLayoutSync = null;
    this.resizeLayoutSignature = null;
    this.resizeLayoutMetricsSnapshot = null;
    this.lastVisualFolderPageIndex = null;
    this.pageTurnVisualSettle = null;
    this.clearResizeVisualGeometry(FOLDER_OVERLAY_CLEAR_REASON);
    this.targetFolderGeometry = null;
    this.currentOpeningGeometrySnapshot = null;
    this.resetClosingDesktopPageTrackMirror();
    if (clearDetachedClosingVisuals) this.clearDetachedClosingVisuals(null, { immediate: true });
    if (releaseOwnership) this.releaseAllOwnedVisualOwnership({ preserveDetachedClosing });
    if (clearVisualCommitQueue) this.getVisualCommitQueue().clear();
    if (cancelPageTrackReason) {
      cancelPageTrackMotion(this.pageTrackMotion, cancelPageTrackReason);
    }
    if (clearPageTrackSpringsReason) killMotionOf(this.pageTrack, null, { lane: "base", reason: clearPageTrackSpringsReason });
    if (clearPageDots) this.clearPageDots();
    if (clearPanelSpringsReason) {
      killMotionOf(this.panel, null, { lane: "base", reason: clearPanelSpringsReason });
      killMotionOf(this.panel.scale, null, { lane: "base", reason: clearPanelSpringsReason });
    }
  }

  clearRegisteredIconBounds(): void {
    this.folderIconLayoutTargets?.clear?.();
    this.iconBoundsRefreshers?.clear();
    this.openingGhostBoundsRefreshers?.clear();
  }

  clearFolderIconNodes(reason = FOLDER_OVERLAY_CLEAR_REASON): void {
    for (const node of this.iconNodes.values()) {
      if (!node || node.destroyed) continue;
      killAllMotion(node, { reason });
      destroyDisplayObjectAfterFrame(node, { children: true });
    }
    this.iconNodes.clear();
    this.folderIconLayoutTargets.clear();
    this.iconBoundsRefreshers.clear();
    this.openingGhostBoundsRefreshers.clear();
  }

  refreshRegisteredIconBounds(): number {
    let count = 0;
    for (const refreshBounds of this.iconBoundsRefreshers?.values() || []) {
      refreshBounds?.();
      count += 1;
    }
    for (const refreshBounds of this.openingGhostBoundsRefreshers?.values() || []) {
      refreshBounds?.();
      count += 1;
    }
    return count;
  }

  markRegisteredBoundsDirty(): void {
    this.registeredBoundsDirty = true;
    if (this.registeredBoundsFlushQueued) return;
    this.registeredBoundsFlushQueued = true;
    const flush = () => {
      this.registeredBoundsFlushQueued = false;
      this.flushRegisteredIconBounds();
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      motionRuntime.afterFrame(flush);
      return;
    }
    if (typeof globalThis.queueMicrotask === "function") {
      globalThis.queueMicrotask(flush);
      return;
    }
    Promise.resolve().then(flush);
  }

  resolveStableIconSlotRecord(anchor: StableIconSlotAnchor = {}): FolderIconBoundsRecord | null {
    const context = this.stableFolderSlotContext;
    const folderId = anchor.folderId || context?.folderId || null;
    const itemId = anchor.itemId || anchor.id || null;
    const rawPageIndex = anchor.folderPageIndex ?? anchor.pageIndex ?? 0;
    const pageIndex = Math.max(0, Number(rawPageIndex) || 0);
    if (folderId && itemId) {
      const registered = this.iconBoundsRegistry.getRecord(
        BOUNDS_KIND.LAUNCH,
        BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
        { area: "folder", folderId, id: itemId, pageIndex },
        { expected: { area: "folder", folderId, id: itemId, pageIndex } }
      );
      if (registered) return registered as FolderIconBoundsRecord;
    }
    const rawIndex = Number(anchor.index);
    if (
      !context ||
      context.folderId !== folderId ||
      !Number.isFinite(rawIndex) ||
      !context.metrics ||
      !context.stageRect
    ) return null;
    const index = Math.max(0, Math.floor(rawIndex));
    const slot = getGridSlotRect(context.metrics, index);
    const center = {
      x: slot.left + slot.width / 2 +
        (pageIndex - context.visualPageIndex) * context.pageSpan,
      y: slot.top + slot.height / 2 + getIconVisualOffsetY(context.isTextlessMode),
    };
    return {
      ...makeIconRect(center.x, center.y, context.iconSize),
      meta: {
        area: "folder",
        folderId,
        id: itemId,
        index,
        pageIndex,
        stageHeight: context.stageHeight,
        stageRect: { ...context.stageRect },
        stageWidth: context.stageWidth,
        visualSpec: context.visualSpec,
      },
    };
  }

  flushRegisteredIconBounds(options: Readonly<{ force?: boolean | undefined }> = {}): number {
    if (!options.force && !this.registeredBoundsDirty) return 0;
    this.registeredBoundsDirty = false;
    return this.refreshRegisteredIconBounds();
  }

  registerOpeningGhostBounds(
    state: FolderOverlayState,
    target: FolderOpeningTarget,
    ghost: FolderIconNode,
  ): IconBoundsRect | StageRect | null {
    const rect = target?.targetStageLayoutRect;
    const item = target?.item;
    if (!rect || !item?.id || !target?.folderId) return null;
    return registerFolderIconNodeBounds({
      folderId: target.folderId,
      iconBoundsRegistry: this.iconBoundsRegistry,
      iconSize: target.iconSize,
      index: target.index,
      isInteractivePage: true,
      isPrewarm: false,
      item,
      node: ghost,
      pageIndex: target.pageIndex ?? state.folderPageIndex ?? 0,
      provisionalLayoutTarget: target.provisionalLayoutTarget === true,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
      targetCenter: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    });
  }

  restoreOpeningGhostPresentation(ghost: FolderClosingGhost | FolderOpeningGhost): boolean {
    const snapshot = this.openingContentPresentedSnapshot;
    const folderId = this.openingLease?.snapshot()?.folderId || null;
    if (!snapshot || snapshot.folderId !== folderId) return false;
    const node = ghost as unknown as Container;
    const presentation = snapshot.presentations.get(node);
    if (!presentation) return false;
    restoreFolderContentPresentation(node, presentation);
    return true;
  }

  clearPageDots(): void {
    this.pageDotsLayer.removeChildren().forEach((child) => child.destroy?.());
    this.pageDotsLayer.visible = false;
    this.pageDotsLayer.eventMode = "none";
    this.pageDotsLayer.hitArea = null;
    this.pageDotsLayer.alpha = 0;
    this.pageDotsLayerRevealKey = null;
    killMotionOf(this.pageDotsLayer, "alpha");
  }

  hasActiveIconGhosts(): boolean {
    const snapshot = this.folderVisualSession.snapshot();
    return Boolean(snapshot.opening?.ghostIds.length || snapshot.closing?.activeVisuals);
  }

  forgetOwnedVisualToken(token: unknown): void {
    if (token == null) return;
    const stillOwned = this.visualOwnership.snapshot().some((entry) => entry.owner?.token === token);
    if (!stillOwned) this.getOwnedVisualTokens().delete(token);
  }

  getOwnedVisualTokens(): Set<unknown> {
    if (!this.ownedVisualTokens) this.ownedVisualTokens = new Set();
    return this.ownedVisualTokens;
  }

  getVisualCommitQueue(): FolderVisualCommitQueue {
    if (!this.visualCommitQueue) this.visualCommitQueue = new FolderVisualCommitQueue();
    return this.visualCommitQueue;
  }

  acquireVisualOwnership(key: string | null, owner: VisualOwnershipOwnerInput): boolean {
    const acquired = this.visualOwnership.acquire(key, owner);
    if (acquired && owner?.token != null) this.getOwnedVisualTokens().add(owner.token);
    return acquired;
  }

  acquireDesktopSourceOwnership(owner: VisualOwnershipOwnerInput): boolean {
    const key = makeDesktopSourceVisualKey(owner?.folderId);
    if (!key) return false;
    return this.acquireVisualOwnership(key, owner);
  }

  getCurrentFolderId(): string | null {
    return this.currentFolderId || null;
  }

  clearCurrentFolder(): void {
    this.currentFolderId = null;
  }

  getClosingPresentationFrameRect(): MutableFramePresentation | null {
    return cloneMirroredFramePresentation(this);
  }

  getTransitionDebugSnapshot() {
    const transition = this.frameGhostTransitionState;
    return {
      closingGhostCount: this.closingGhostLayer?.children?.length ?? null,
      framePresentation: cloneMirroredFramePresentation(this),
      frameTransition: transition ? {
        closingDirection: { ...transition.trajectory.desktopClosingDirection },
        phaseFrom: transition.phaseFrom,
        phaseTo: transition.phaseTo,
        placement: transition.placement ? { ...transition.placement } : null,
        progress: transition.progressState.value,
      } : null,
      panelVisible: this.panel?.visible ?? null,
      pageTrackVisible: this.pageTrack?.visible ?? null,
    };
  }

  ensureClosingPreviewSwapLayer(
    containerFactory: () => FolderClosingPreviewSwapContainer,
  ): FolderClosingPreviewSwapContainer {
    if (this.closingPreviewSwapLayer && !this.closingPreviewSwapLayer.destroyed) {
      return this.closingPreviewSwapLayer;
    }
    this.closingPreviewSwapLayer = containerFactory() as ClosingPreviewContainerNode;
    const closingIndex = this.children.indexOf(this.closingGhostLayer);
    if (closingIndex >= 0) this.addChildAt(this.closingPreviewSwapLayer, closingIndex + 1);
    else this.addChild(this.closingPreviewSwapLayer);
    return this.closingPreviewSwapLayer;
  }

  removeClosingPreviewSwapChildren(): ClosingPreviewDisplayNode[] {
    const swapLayer = this.closingPreviewSwapLayer;
    if (!swapLayer || swapLayer.destroyed) return [];
    return (swapLayer.removeChildren?.() || []) as ClosingPreviewDisplayNode[];
  }

  releaseVisualOwnership(key: string | null, token: unknown): boolean {
    const released = this.visualOwnership.release(key, token);
    if (released) this.forgetOwnedVisualToken(token);
    return released;
  }

  releaseAllOwnedVisualOwnership(
    options: Readonly<{ preserveDetachedClosing?: boolean | undefined }> = {},
  ): number {
    const ownedVisualTokens = this.getOwnedVisualTokens();
    const preserveTokens: Set<unknown> | null = options.preserveDetachedClosing === true
      ? new Set<unknown>((this.detachedClosingVisuals || []).map((visual) => visual?.ownerToken).filter((token) => token != null))
      : null;
    const tokens = Array.from(ownedVisualTokens).filter((token) => !preserveTokens?.has(token));
    if (preserveTokens) {
      for (const token of tokens) ownedVisualTokens.delete(token);
    } else {
      ownedVisualTokens.clear();
    }
    let released = 0;
    for (const token of tokens) released += this.visualOwnership.releaseByToken(token);
    return released;
  }

  destroyDetachedClosingVisual(visual: DetachedClosingVisual | null | undefined): void {
    if (!visual || visual.destroyed) return;
    visual.destroyed = true;
    cancelDetachedVisualMotionControls(visual);
    const content = visual.content || [];
    if (content.length) this.detachedClosingContentLayer?.detach?.(...content);
    visual.content = null;
    visual.frame = null;
    killAllMotion(visual.container, { reason: FOLDER_PANEL_DETACHED_CLOSE_REASON });
    if (visual.container?.parent) visual.container.parent.removeChild(visual.container);
    visual.container?.destroy?.({ children: true });
  }

  notifyDesktopSourceGhostingChange(): void {
    this.onDesktopSourceGhostingChange?.();
  }

  releaseDetachedClosingSourceOwnership(visual: DetachedClosingVisual | null | undefined): boolean {
    if (!visual?.desktopSourceKey || visual.ownerToken == null) return false;
    const released = this.releaseVisualOwnership(visual.desktopSourceKey, visual.ownerToken);
    if (released) visual.ownerToken = null;
    return released;
  }

  releaseDetachedClosingHandoffVisual(
    visual: DetachedClosingVisual | null | undefined,
    options: DetachedVisualClearOptions = {},
  ): boolean {
    if (!visual || visual.handoffReleased) return false;
    visual.handoffReleased = true;
    if (options.reveal !== false) this.onClosingHandoffVisualRelease?.(visual.folderId || null);
    return true;
  }

  commitDetachedClosingHandoff(
    visual: DetachedClosingVisual | null | undefined,
    options: DetachedVisualClearOptions = {},
  ): boolean {
    if (!visual || visual.handoffCommitted) return false;
    visual.handoffCommitted = true;
    this.releaseDetachedClosingHandoffVisual(visual, options);
    this.releaseDetachedClosingSourceOwnership(visual);
    this.notifyDesktopSourceGhostingChange();
    return true;
  }

  clearDetachedClosingVisual(
    visual: DetachedClosingVisual | null | undefined,
    options: DetachedVisualClearOptions = {},
  ): boolean {
    if (!visual || visual.clearing) return false;
    visual.clearing = true;
    return this.getVisualCommitQueue().enqueue({
      isStale: () => !this.detachedClosingVisuals.includes(visual),
      mutateOwnership: () => {
        const index = this.detachedClosingVisuals.indexOf(visual);
        if (index < 0) return false;
        this.detachedClosingVisuals.splice(index, 1);
        const released = this.releaseDetachedClosingSourceOwnership(visual);
        return { released, visual };
      },
      applyVisibility: () => {
        this.commitDetachedClosingHandoff(visual, { reveal: options.reveal !== false });
      },
      destroyVisual: () => {
        this.destroyDetachedClosingVisual(visual);
      },
    }, { immediate: options.immediate === true });
  }

  clearDetachedClosingVisualNow(
    visual: DetachedClosingVisual | null | undefined,
    options: DetachedVisualClearOptions = {},
  ): void {
    if (!visual) return;
    const index = this.detachedClosingVisuals.indexOf(visual);
    if (index >= 0) this.detachedClosingVisuals.splice(index, 1);
    this.commitDetachedClosingHandoff(visual, { reveal: options.reveal !== false });
    this.destroyDetachedClosingVisual(visual);
  }

  clearDetachedClosingVisuals(
    folderId: string | null = null,
    options: DetachedVisualClearOptions = {},
  ): void {
    const visuals = Array.from(this.detachedClosingVisuals);
    for (const visual of visuals) {
      if (folderId && visual.folderId !== folderId) continue;
      if (options.immediate) this.clearDetachedClosingVisualNow(visual, options);
      else this.clearDetachedClosingVisual(visual, options);
    }
  }

  pruneDetachedClosingVisuals(): void {
    while (this.detachedClosingVisuals.length > MAX_DETACHED_CLOSING_VISUALS) {
      this.clearDetachedClosingVisual(this.detachedClosingVisuals[0], { immediate: true });
    }
  }

  detachClosingPresentationForOpen(
    nextFolderId: string | null,
    options: Readonly<{
      folderId?: string | null | undefined;
      waitForDesktopClose?: boolean | undefined;
    }> = {},
  ): boolean {
    if (nextFolderId) this.clearDetachedClosingVisuals(nextFolderId, { immediate: true, reveal: false });
    const waitForDesktopClose = options.waitForDesktopClose === true;
    const closingLease = this.closingLease;
    const closeSnapshot = closingLease?.snapshot() || this.folderVisualSession.snapshot().closing;
    const closingFolderId = closeSnapshot?.folderId || options.folderId || null;
    if (waitForDesktopClose && this.hasDesktopCloseDetachedVisual(closingFolderId)) return false;
    // Do not re-detach / re-prepare a close whose real desktop icon is already
    // visible (its handoff effectively finished): re-engaging would re-acquire
    // desktop-source ownership and re-hide the icon for the whole detached
    // animation — the precise-timing cross-folder blink. Trust the desktop truth.
    const closingSourceAlreadyVisible = Boolean(closingFolderId) &&
      this.isHandoffSourceVisible?.(closingFolderId) === true;
    const shouldKeepDetachedVisual = Boolean(
      closingFolderId && (waitForDesktopClose || closingFolderId !== nextFolderId) && !closingSourceAlreadyVisible
    );
    const closingMirrorOffsetX = shouldKeepDetachedVisual ? this.closingDesktopPageTrackMirrorX : 0;
    const presentedFrame = this.frameGhostPresentedSnapshot;
    const canUsePresentedFrame = Boolean(
      presentedFrame &&
      presentedFrame.folderId === closingFolderId &&
      presentedFrame.phase === "closing" &&
      presentedFrame.transition === this.frameGhostTransitionState
    );
    const sourceFrameState = canUsePresentedFrame
      ? presentedFrame!.frame
      : this.frameGhostState;
    const sourceFrameTransition = canUsePresentedFrame
      ? presentedFrame!.transition
      : this.frameGhostTransitionState;
    const overlayFrameState = shouldKeepDetachedVisual
      ? addXOffsetToFrameState(sourceFrameState, closingMirrorOffsetX)
      : null;
    const sourceFrameTarget = shouldKeepDetachedVisual
      ? (closeSnapshot?.detachedFrameTarget as DetachedFrameTarget | null) || null
      : null;
    const closingGhosts = shouldKeepDetachedVisual
      ? Array.from(
        this.closingGhostLayer?.children || this.closingGhostLayer?.removeChildren?.() || [],
      ) as FolderGhostNode[]
      : [];
    const previewSwapGhosts = shouldKeepDetachedVisual
      ? Array.from(
        this.closingPreviewSwapLayer?.children || this.removeClosingPreviewSwapChildren(),
      ) as ClosingPreviewDisplayNode[]
      : [];
    const presentedContent = this.closingContentPresentedSnapshot;
    const canUsePresentedContent = Boolean(
      presentedContent &&
      presentedContent.lease === closingLease &&
      presentedContent.folderId === closingFolderId
    );
    const getPresentedContent = (node: Container): FolderContentPresentation | null =>
      canUsePresentedContent ? presentedContent!.presentations.get(node) || null : null;
    if (canUsePresentedContent) {
      for (const node of [...closingGhosts, ...previewSwapGhosts] as Container[]) {
        const presentation = getPresentedContent(node);
        if (presentation) restoreFolderContentPresentation(node, presentation);
      }
    }
    let detachedVisual: DetachedClosingVisual | null = null;
    if (shouldKeepDetachedVisual && (overlayFrameState || closingGhosts.length || previewSwapGhosts.length || waitForDesktopClose)) {
      // This is a continuation of the handoff already prepared by the live
      // closing controller. Keep any label fade that reached its perceptual
      // release point while transferring the remaining artwork to a detached
      // visual for the next folder's opening.
      this.onClosingHandoffPrepare?.(closingFolderId, { preserveVisualState: true });
      const container = new Container();
      container.eventMode = (overlayFrameState || closingGhosts.length || previewSwapGhosts.length) ? "static" : "none";
      container.interactiveChildren = false;
      container.hitArea = {
        contains: (x, y) => {
          if (container.destroyed || !container.children.length) return false;
          const bounds = container.getLocalBounds();
          return x >= bounds.x && x <= bounds.x + bounds.width
            && y >= bounds.y && y <= bounds.y + bounds.height;
        },
      };
      container.cursor = "pointer";
      container.on("pointerdown", (event) => {
        const nativeEvent = (event?.nativeEvent || event) as OptionalPointerEvent;
        if (nativeEvent?.button != null && nativeEvent.button !== 0) return;
        event?.stopPropagation?.();
        nativeEvent?.preventDefault?.();
        nativeEvent?.stopPropagation?.();
        this.onClosingFolderPointerDown?.(closingFolderId, nativeEvent);
      });
      container.alpha = 1;
      this.detachedClosingVisualLayer.addChild(container);
      const canMapPresentationSpace = this instanceof Container && container.parent instanceof Container;
      const frameState = overlayFrameState && canMapPresentationSpace
        ? mapFramePresentationBetweenContainers(overlayFrameState, this, container)
        : overlayFrameState;
      const frameTargetSource = this.closingGhostLayer instanceof Container
        ? this.closingGhostLayer
        : this;
      const frameTarget = sourceFrameTarget && canMapPresentationSpace
        ? mapDetachedFrameTargetBetweenContainers(sourceFrameTarget, frameTargetSource, container)
        : sourceFrameTarget;
      const mappedFrameTransition = frameState && canMapPresentationSpace
        ? mapFrameTransitionBetweenContainers(sourceFrameTransition, this, container)
        : sourceFrameTransition;
      const frameTransition = frameState
        ? makeDetachedFrameTransition(frameState, mappedFrameTransition, frameTarget)
        : null;
      const detachedGhostMotions = new Map(closingGhosts.map((ghost) => [
        ghost,
        canMapPresentationSpace && this.closingGhostLayer instanceof Container
          ? mapDetachedGhostMotionBetweenContainers(
            getPresentedContent(ghost)?.detachedMotion ||
              closingLease?.detachedGhostMotion(ghost) || null,
            this.closingGhostLayer,
            container,
          )
          : getPresentedContent(ghost)?.detachedMotion ||
            closingLease?.detachedGhostMotion(ghost) || null,
      ]));
      if (closingMirrorOffsetX && previewSwapGhosts.length) {
        for (const ghost of previewSwapGhosts) {
          if (!ghost || ghost.destroyed) continue;
          ghost.x = (Number(ghost.x) || 0) + closingMirrorOffsetX;
        }
      }
      const visual: DetachedClosingVisual = {
        container,
        content: [],
        desktopCloseReleaseRequested: false,
        folderId: closingFolderId,
        frame: null,
        geometryComplete: false,
        releaseAfterDesktopClose: waitForDesktopClose,
      };
      detachedVisual = visual;
      const ownerToken = `detached-close:${closingFolderId}:${this.nextDetachedClosingVisualToken}`;
      this.nextDetachedClosingVisualToken += 1;
      visual.ownerToken = ownerToken;
      visual.desktopSourceKey = makeDesktopSourceVisualKey(closingFolderId);
      if (frameState && frameTransition) {
        const frame = new Graphics();
        drawDetachedFrame(frame, frameState);
        container.addChild(frame);
        visual.frame = frame;
      }
      for (const ghost of closingGhosts) {
        if (ghost.parent && canMapPresentationSpace) reparentPreservingWorldTransform(ghost, container);
        else container.addChild(ghost);
      }
      for (const ghost of previewSwapGhosts) {
        if (ghost.parent && canMapPresentationSpace) reparentPreservingWorldTransform(ghost as Container, container);
        else container.addChild(ghost as Container);
      }
      const detachedContent = [...closingGhosts, ...previewSwapGhosts] as Container[];
      visual.content = detachedContent;
      if (detachedContent.length) this.detachedClosingContentLayer?.attach?.(...detachedContent);
      this.acquireVisualOwnership(visual.desktopSourceKey, {
        folderId: closingFolderId,
        kind: "detachedClosing",
        token: ownerToken,
      });
      this.detachedClosingVisuals.push(visual);
      this.pruneDetachedClosingVisuals();
      this.closingContentPresentedSnapshot = null;
      closingLease?.cancel({ restorePageTrack: false, reveal: false });
      if (this.closingLease === closingLease) this.closingLease = null;
      this.resetClosingDesktopPageTrackMirror();
      const finishAfterGeometry = () => {
        if (detachedVisual!.destroyed || detachedVisual!.finishQueued) return;
        detachedVisual!.finishQueued = true;
        motionRuntime.afterFrame(() => {
          if (detachedVisual!.destroyed) return;
          detachedVisual!.geometryComplete = true;
          if (detachedVisual!.releaseAfterDesktopClose && !detachedVisual!.desktopCloseReleaseRequested) return;
          this.clearDetachedClosingVisualNow(detachedVisual);
        });
      };
      const geometryTracker = makeCompletionTracker(finishAfterGeometry);
      const frame = visual.frame;
      if (frameState && frameTransition) {
        animateDetachedFrame(
          frame,
          frameState,
          frameTarget,
          geometryTracker,
          detachedVisual,
          frameTransition,
        );
      }
      for (const ghost of closingGhosts) {
        animateDetachedClosingGhost(
          ghost,
          geometryTracker,
          detachedVisual,
          detachedGhostMotions.get(ghost)
        );
      }
      if (!frameState && !closingGhosts.length && previewSwapGhosts.length) {
        animateDetachedGeometryHold(geometryTracker, detachedVisual);
      }
      geometryTracker.finishIfIdle();
      return true;
    }

    closingLease?.cancel({ restorePageTrack: false, reveal: false });
    this.closingContentPresentedSnapshot = null;
    if (this.closingLease === closingLease) this.closingLease = null;
    this.resetClosingDesktopPageTrackMirror();
    return false;
  }

  detachClosingPresentationForDesktopClose(folderId: string | null): boolean {
    return this.detachClosingPresentationForOpen(null, {
      folderId,
      waitForDesktopClose: true,
    });
  }

  getDesktopSourceGhostedIds(): Set<string> {
    const ids = new Set<string>();
    for (const visual of this.detachedClosingVisuals || []) {
      if (visual?.folderId && !visual.handoffCommitted) ids.add(visual.folderId);
    }
    for (const entry of this.visualOwnership.snapshot()) {
      if (!entry.key?.startsWith("desktopSource:")) continue;
      const folderId = entry.owner?.folderId || entry.key.slice("desktopSource:".length);
      if (folderId) ids.add(folderId);
    }
    return ids;
  }

  // Whether an ACTUALLY VISIBLE overlay/detached substitute currently covers this
  // folder's desktop source position. Distinct from getDesktopSourceGhostedIds()
  // (which is ownership-based): a leaked desktop-source ownership keeps the real
  // icon ghosted with NO visible cover — exactly the orphan we must detect.
  hasVisibleFolderSubstitute(folderId: string | null | undefined): boolean {
    if (!folderId) return false;
    for (const visual of this.detachedClosingVisuals || []) {
      if (visual?.folderId === folderId && !visual.destroyed && !visual.handoffCommitted) return true;
    }
    const coversActiveFolder = this.currentFolderId === folderId ||
      this.folderVisualSession.snapshot().closing?.folderId === folderId;
    if (!coversActiveFolder) return false;
    return Boolean(
      this.frameGhost?.visible ||
      (this.closingGhostLayer?.children?.length || 0) > 0 ||
      (this.closingPreviewSwapLayer?.children?.length || 0) > 0 ||
      (this.openingGhostLayer?.children?.length || 0) > 0
    );
  }

  revealIconNodes(): void {
    for (const node of this.iconNodes.values()) {
      node.visible = true;
      node.alpha = 1;
    }
  }

  getIconNodeVisualKey(node: FolderIconNode, fallbackFolderId: string | null = null): string | null {
    const source = node?.source || node?.state?.source || {};
    return makeFolderIconVisualKey(
      (source.folderId as string | null | undefined) || fallbackFolderId || this.currentFolderId,
      node?.item?.id
    );
  }

  hideIconNodesForTransition(itemId: string, owner: VisualOwnershipOwnerInput): void {
    if (!itemId) return;
    for (const node of this.iconNodes.values()) {
      if (node.item?.id !== itemId) continue;
      const key = this.getIconNodeVisualKey(node, owner?.folderId);
      if (key) this.acquireVisualOwnership(key, owner);
      node.visible = false;
    }
  }

  hidePageTrackForTransition(owner: VisualOwnershipOwnerInput): void {
    const key = makeFolderPageTrackVisualKey(owner?.folderId || this.currentFolderId);
    if (key) this.acquireVisualOwnership(key, owner);
    this.pageTrack.visible = false;
  }

  hasPageTrackOwner(): boolean {
    return this.visualOwnership.snapshot().some((entry) => entry.key?.startsWith("folderPageTrack:"));
  }

  releaseTransitionOwnership(token: unknown, options: VisualReleaseOptions = {}): void {
    if (token == null) return;
    const reveal = options.reveal !== false;
    const restorePageTrack = options.restorePageTrack !== false;
    const entries = this.visualOwnership.snapshot();
    for (const entry of entries) {
      if (entry.owner?.token !== token) continue;
      this.releaseVisualOwnership(entry.key, token);
      if (reveal && entry.key?.startsWith("folderIcon:")) {
        for (const node of this.iconNodes.values()) {
          const key = this.getIconNodeVisualKey(node, entry.owner.folderId);
          if (key === entry.key && !this.visualOwnership.hasOwner(key)) {
            node.visible = true;
            node.alpha = 1;
          }
        }
      }
    }
    if (restorePageTrack && !this.hasPageTrackOwner()) {
      this.pageTrack.visible = true;
    }
  }

  releaseIconNodesForTransition(
    itemId: string,
    token: unknown,
    options: Readonly<{ reveal?: boolean | undefined }> = {},
  ): number {
    if (!itemId || token == null) return 0;
    const reveal = options.reveal !== false;
    let released = 0;
    for (const entry of this.visualOwnership.snapshot()) {
      if (entry.owner?.token !== token || !entry.key?.startsWith("folderIcon:")) continue;
      let matchedNode = null;
      for (const node of this.iconNodes.values()) {
        if (node.item?.id !== itemId) continue;
        const key = this.getIconNodeVisualKey(node, entry.owner.folderId);
        if (key === entry.key) {
          matchedNode = node;
          break;
        }
      }
      if (!matchedNode) continue;
      if (!this.releaseVisualOwnership(entry.key, token)) continue;
      released += 1;
      if (reveal && !this.visualOwnership.hasOwner(entry.key)) {
        matchedNode.visible = true;
        matchedNode.alpha = 1;
      }
    }
    return released;
  }

  clearFrameGhost(options: Parameters<typeof clearFrameGhostState>[1] = {}): boolean {
    const wasOpeningFrame = this.frameGhostPhase === "opening";
    const cleared = clearFrameGhostState(this as FolderFrameGhostLayer, options);
    if (cleared && wasOpeningFrame) this.openingGhosts?.clearFrameTarget?.();
    return cleared;
  }

  commitFrameGhostPresentation(): FolderFramePresentedSnapshot | null {
    return commitFrameGhostPresentationState(this as FolderFrameGhostLayer);
  }

  commitFolderVisualPresentation(): FolderVisualPresentationCommit {
    const frame = this.commitFrameGhostPresentation();
    const openingLease = this.openingLease;
    const openingFolderId = openingLease?.snapshot()?.folderId || null;
    if (openingLease && openingFolderId) {
      const presentations = new Map<Container, FolderContentPresentation>();
      for (const node of this.openingGhostLayer.children || []) {
        presentations.set(node, captureFolderContentPresentation(node, null));
      }
      this.openingContentPresentedSnapshot = {
        folderId: openingFolderId,
        presentations,
      };
    } else {
      this.openingContentPresentedSnapshot = null;
    }

    const closingLease = this.closingLease;
    const closingSnapshot = closingLease?.snapshot() || null;
    const closingFolderId = closingSnapshot?.folderId || null;
    const presentedClosingFolderId = closingSnapshot?.activeVisuals === true
      ? closingFolderId
      : null;
    if (!closingLease || !closingFolderId) {
      this.closingContentPresentedSnapshot = null;
      return Object.freeze({ closingFolderId: null, frame });
    }
    const presentations = new Map<Container, FolderContentPresentation>();
    for (const node of this.closingGhostLayer.children || []) {
      presentations.set(node, captureFolderContentPresentation(
        node,
        closingLease.detachedGhostMotion(node) as DetachedGhostMotion | null,
      ));
    }
    for (const node of this.closingPreviewSwapLayer.children || []) {
      presentations.set(
        node as Container,
        captureFolderContentPresentation(node as Container, null),
      );
    }
    this.closingContentPresentedSnapshot = {
      folderId: closingFolderId,
      lease: closingLease,
      presentations,
    };
    return Object.freeze({ closingFolderId: presentedClosingFolderId, frame });
  }

  notifyTitleFrame(
    rect: TitleFrameRect | null,
    metadata: TitleFrameMetadata = {},
  ): void {
    if (!rect) {
      const folderId = metadata.folderId || null;
      const openingLease = metadata.openingLease || null;
      if (folderId && this.titleFrameFolderId && folderId !== this.titleFrameFolderId) return;
      if (openingLease && this.titleFrameOpeningLease && openingLease !== this.titleFrameOpeningLease) return;
      if (this.titleFrameKey === null) return;
      this.titleFrameKey = null;
      this.titleFrameFolderId = null;
      this.titleFrameOpeningLease = null;
      this.onTitleFrameChange(null);
      return;
    }
    const openingLease = metadata.openingLease || null;
    const frame = {
      folderId: metadata.folderId ?? this.currentFolderId ?? null,
      height: rect.height,
      left: rect.left,
      progress: rect.progress ?? 1,
      top: rect.top,
      width: rect.width,
    };
    const key = [
      frame.folderId || "",
      Math.round(frame.left * 100),
      Math.round(frame.top * 100),
      Math.round(frame.width * 100),
      Math.round(frame.height * 100),
      Math.round(frame.progress * 1000),
      openingLease ? this.openingFrameEpoch : "",
    ].join(":");
    if (key === this.titleFrameKey) return;
    this.titleFrameKey = key;
    this.titleFrameFolderId = frame.folderId;
    this.titleFrameOpeningLease = openingLease;
    this.onTitleFrameChange(frame);
  }

  getPanelTitleProgress(): number {
    if (!this.panelTitleOpening) return 1;
    const progressX = this.panelTitleStartScaleX >= 1
      ? 1
      : (this.panel.scale.x - this.panelTitleStartScaleX) / (1 - this.panelTitleStartScaleX);
    const progressY = this.panelTitleStartScaleY >= 1
      ? 1
      : (this.panel.scale.y - this.panelTitleStartScaleY) / (1 - this.panelTitleStartScaleY);
    return clamp01(Math.max(progressX, progressY));
  }

  getPanelVisualRect(panelRect: StageRect): FolderPanelVisualRect | null {
    return makePanelVisualRect(this.panel, panelRect, {
      progress: this.getPanelTitleProgress(),
      radius: 48,
    });
  }

  notifyPanelTitleFrame(
    panelRect: StageRect | null,
    metadata: TitleFrameMetadata = {},
  ): void {
    if (!panelRect) {
      this.notifyTitleFrame(null, metadata);
      return;
    }
    this.notifyTitleFrame(this.getPanelVisualRect(panelRect), metadata);
  }

  cancelOpeningPanelReadyCheck(): void {
    if (this.openingPanelReadyFrame == null) return;
    this.openingPanelReadyFrame.cancelled = true;
    this.openingPanelReadyFrame = null;
  }

  markOpeningPanelReady(openingLease: FolderOverlayOpenLease | null | undefined): boolean {
    if (!openingLease?.isCurrent?.()) return false;
    const markedReady = openingLease.panelReady();
    const isPanelReady = openingLease.snapshot().panelReady === true;
    if (markedReady.status === "stale" || (markedReady.status !== "accepted" && !isPanelReady)) return false;
    this.cancelOpeningPanelReadyCheck();
    return true;
  }

  scheduleOpeningPanelReadyCheck(
    openingLease: FolderOverlayOpenLease,
    panelRect: StageRect,
    folderId: string | null | undefined = this.currentFolderId,
  ): void {
    this.cancelOpeningPanelReadyCheck();
    const queueCheck = () => {
      const frame = { cancelled: false };
      this.openingPanelReadyFrame = frame;
      motionRuntime.afterFrame(() => check(frame));
    };
    const check = (frame: { cancelled: boolean }) => {
      if (frame.cancelled || this.openingPanelReadyFrame !== frame) return;
      this.openingPanelReadyFrame = null;
      if (!openingLease?.isCurrent?.()) return;
      this.notifyPanelTitleFrame(panelRect, { folderId, openingLease });
      this.markRegisteredBoundsDirty();
      if (this.getPanelTitleProgress() >= FOLDER_PANEL_READY_PROGRESS) {
        this.markOpeningPanelReady(openingLease);
        return;
      }
      queueCheck();
    };
    queueCheck();
  }

  enableClosingFrameMask(): void {
    enableClosingFrameMaskState(this as FolderFrameGhostLayer);
  }

  drawClosingFrameMask(rect: FolderFramePresentation): void {
    drawClosingFrameMaskState(this as FolderFrameGhostLayer, rect);
  }

  drawFrameGhost(rect: FolderFramePresentation, options: FolderFrameGhostOptions = {}): void {
    drawFrameGhostState(this as FolderFrameGhostLayer, rect, options);
  }

  startFrameGhost(
    fromRect: StageRect,
    toRect: StageRect,
    options: FolderFrameGhostOptions = {},
  ): boolean {
    startFrameGhostState(this as FolderFrameGhostLayer, fromRect, toRect, options);
    return true;
  }

  retargetFrameGhost(toRect: StageRect, options: FolderFrameGhostOptions = {}): boolean {
    return retargetFrameGhostState(this as FolderFrameGhostLayer, toRect, options);
  }

  updateFrameGhostTargetGeometry(
    toRect: StageRect,
    options: FolderFrameGhostOptions = {},
  ): boolean {
    return updateFrameGhostTargetGeometryState(this as FolderFrameGhostLayer, toRect, options);
  }

  refreshPageTrackMask(): void {
    this.pageTrack.mask = null;
    this.pageTrack.mask = this.pageMask;
  }

  refreshPanelClipMask(): void {
    if (this.panelContentLayer && this.panelContentLayer.mask !== this.panelClipMask) {
      this.panelContentLayer.mask = this.panelClipMask;
    }
    if (this.openingGhostLayer && this.openingGhostLayer.mask !== this.panelClipMask) {
      this.openingGhostLayer.mask = this.panelClipMask;
    }
  }

  rebuildPanelClipMask(panelRect: StageRect | null | undefined): void {
    if (!panelRect || !this.panel || this.destroyed) {
      this.refreshPanelClipMask();
      return;
    }
    const previousMask = this.panelClipMask;
    const nextMask = new Graphics();
    this.drawPanelClipMask(panelRect, nextMask);
    const previousIndex = this.panel.children.indexOf(previousMask);
    if (this.panelContentLayer?.mask === previousMask) this.panelContentLayer.mask = null;
    if (this.openingGhostLayer?.mask === previousMask) this.openingGhostLayer.mask = null;
    if (previousIndex >= 0) {
      this.panel.removeChild(previousMask);
      this.panel.addChildAt(nextMask, previousIndex);
    } else {
      const contentIndex = this.panel.children.indexOf(this.panelContentLayer);
      this.panel.addChildAt(nextMask, Math.max(0, contentIndex));
    }
    this.panelClipMask = nextMask;
    this.refreshPanelClipMask();
    previousMask?.destroy?.();
  }

  drawPageMask(mask: Graphics | null | undefined, rect: StageRect | null | undefined): void {
    if (!mask || !rect) return;
    mask.clear()
      .rect(rect.left, rect.top, rect.width, rect.height)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  drawPageDot(dot: FolderPageDot): void {
    dot.clear()
      .circle(0, 0, FOLDER_PAGE_DOTS_SIZE / 2)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  setPageDotHover(
    dot: FolderPageDot,
    active: boolean,
    hovered: boolean,
    options: Readonly<{ immediate?: boolean | undefined }> = {},
  ): void {
    const visual = getFolderPageDotVisualState({ active, hovered });
    this.describePageDotTargets(dot);
    this.drawPageDot(dot);
    if (options.immediate) {
      killMotionOf(dot, "alpha");
      killMotionOf(dot.scale);
      dot.alpha = visual.alpha;
      dot.scale.set(visual.scale);
      return;
    }
    motion(dot)
      .preset("fade")
      .overlay()
      .blend(PAGE_DOT_BLEND_DURATION, PAGE_DOT_BLEND_EASE)
      .to({ alpha: visual.alpha })
      .start();
    motion(dot.scale)
      .preset("fade")
      .overlay()
      .blend(PAGE_DOT_BLEND_DURATION, PAGE_DOT_BLEND_EASE)
      .to({ x: visual.scale, y: visual.scale })
      .start();
  }

  updatePageDots(state: FolderOverlayState, geometry: FolderGeometry): void {
    const pageCount = Array.isArray(state.folderPages) ? state.folderPages.length : 0;
    if (!state.folderPageDotsVisible || pageCount <= 1) {
      this.clearPageDots();
      return;
    }
    const frame = getFolderPageDotsFrame(geometry);
    if (!frame) {
      this.clearPageDots();
      return;
    }
    const folderId = state.renderedFolder?.id || this.currentFolderId || null;
    const revealKey = folderId || "";
    const shouldReveal = !this.pageDotsLayer.visible || this.pageDotsLayerRevealKey !== revealKey;
    this.pageDotsLayer.removeChildren().forEach((child) => child.destroy?.());
    this.pageDotsLayer.visible = true;
    this.pageDotsLayer.eventMode = "static";
    this.pageDotsLayer.cursor = "default";
    this.pageDotsLayer.hitArea = new Rectangle(frame.left, frame.top, frame.width, frame.height);
    this.pageDotsLayerRevealKey = revealKey;
    const pageDotPitch = FOLDER_PAGE_DOTS_SIZE + FOLDER_PAGE_DOTS_GAP;
    const totalWidth = pageCount * FOLDER_PAGE_DOTS_SIZE + (pageCount - 1) * FOLDER_PAGE_DOTS_GAP;
    const startX = frame.left + frame.width / 2 - totalWidth / 2 + FOLDER_PAGE_DOTS_SIZE / 2;
    const centerY = frame.top + FOLDER_PAGE_DOTS_HIT_HEIGHT / 2;
    const activePageIndex = state.visualFolderPageIndex ?? state.folderPageIndex;
    for (let index = 0; index < pageCount; index += 1) {
      const dot = new Graphics();
      const isActive = index === activePageIndex;
      this.describePageDotTargets(dot, index, state, isActive);
      this.setPageDotHover(dot, isActive, false, { immediate: true });
      dot.position.set(startX + index * pageDotPitch, centerY);
      dot.eventMode = "static";
      dot.cursor = "pointer";
      dot.hitArea = new Rectangle(
        -pageDotPitch / 2,
        -FOLDER_PAGE_DOTS_HIT_HEIGHT / 2,
        pageDotPitch,
        FOLDER_PAGE_DOTS_HIT_HEIGHT
      );
      dot.on("pointerover", () => this.setPageDotHover(dot, isActive, true));
      dot.on("pointerout", () => this.setPageDotHover(dot, isActive, false));
      dot.on("pointerdown", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        const native = event?.nativeEvent as OptionalPointerEvent | undefined;
        native?.preventDefault?.();
        native?.stopPropagation?.();
        state.folderPageIndexCommit?.(index);
      });
      this.pageDotsLayer.addChild(dot);
    }
    if (shouldReveal) {
      killMotionOf(this.pageDotsLayer, "alpha");
      this.pageDotsLayer.alpha = 0;
      motion(this.pageDotsLayer)
        .preset("fade", { duration: PAGE_DOTS_REVEAL_DURATION, ease: PAGE_DOTS_REVEAL_EASE })
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 1 })
        .start();
    }
  }

  describeMotionTargets(
    state: FolderOverlayStateInput = {},
    geometry: Partial<FolderGeometry> = {},
  ): void {
    const folder: Partial<FolderLayerFolder> = state.renderedFolder || {};
    const folderId = folder.id ?? this.currentFolderId ?? null;
    const label = folder.name || folderId || "Folder overlay";
    const base = {
      folderId,
      kind: "FolderOverlay",
      label,
      layer: "folder",
    };
    motionRuntime.describeTarget(this.panel, {
      ...base,
      kind: "FolderPanel",
      overlayTarget: this.panel,
      sourceLabel: "folder.panel",
      targetPart: "panel",
    });
    motionRuntime.describeTarget(this.panel?.scale, {
      ...base,
      kind: "FolderPanel",
      overlayTarget: this.panel,
      sourceLabel: "folder.panelScale",
      targetPart: "panel.scale",
    });
    motionRuntime.describeTarget(this.pageTrack, {
      ...base,
      kind: "PageTrack",
      overlayTarget: this.pageTrack,
      pageIndex: state.folderPageIndex ?? null,
      pageSpan: geometry.panel?.width ?? null,
      sourceLabel: "folder.pageTrack",
      targetPart: "pageTrack",
    });
    motionRuntime.describeTarget(this.pageDotsLayer, {
      ...base,
      kind: "PageDotsLayer",
      overlayTarget: this.pageDotsLayer,
      sourceLabel: "folder.pageDotsLayer",
      targetPart: "pageDotsLayer",
    });
  }

  describePageDotTargets(
    dot: FolderPageDot | null | undefined,
    index: number | null | undefined = dot?.__motionDebugMetadata?.index,
    state: FolderOverlayStateInput | null = null,
    active: boolean | null | undefined = dot?.__motionDebugMetadata?.active,
  ): void {
    if (!dot) return;
    const existing = dot.__motionDebugMetadata;
    let metadata = !state && existing ? existing : null;
    if (!metadata) {
      const folder: Partial<FolderLayerFolder> = state?.renderedFolder || {};
      metadata = {
        active: active ?? null,
        folderId: folder.id ?? this.currentFolderId ?? null,
        index: index ?? null,
        kind: "PageDot",
        label: `Folder page dot ${index ?? ""}`.trim(),
        layer: "folder",
        pageIndex: state?.folderPageIndex ?? null,
      };
    }
    dot.__motionDebugMetadata = metadata;
    motionRuntime.describeTarget(dot, {
      ...metadata,
      overlayTarget: dot,
      sourceLabel: "folder.pageDot",
      targetPart: "pageDot",
    });
    motionRuntime.describeTarget(dot.scale, {
      ...metadata,
      overlayTarget: dot,
      sourceLabel: "folder.pageDot.scale",
      targetPart: "pageDot.scale",
    });
  }

  rebuildPageTrackMask(): void {
    if (!this.pageMaskRect || !this.panel || this.destroyed) {
      this.refreshPageTrackMask();
      return;
    }
    const previousMask = this.pageMask;
    const nextMask = new Graphics();
    this.drawPageMask(nextMask, this.pageMaskRect);
    const maskParent = this.panelContentLayer || this.panel;
    const previousIndex = maskParent.children.indexOf(previousMask);
    this.pageTrack.mask = null;
    if (previousIndex >= 0) {
      maskParent.removeChild(previousMask);
      maskParent.addChildAt(nextMask, previousIndex);
    } else {
      const trackIndex = maskParent.children.indexOf(this.pageTrack);
      maskParent.addChildAt(nextMask, Math.max(0, trackIndex));
    }
    this.pageMask = nextMask;
    this.pageTrack.mask = this.pageMask;
    previousMask?.destroy?.();
  }

  mapOpeningSourceRectToLocal(
    state: Pick<FolderOpeningState, "height" | "stageRect" | "width">,
    sourceRect: StageRect,
  ): StageRect {
    const localRect = mapClientRectToDisplayObjectLocalRect({
      node: this.openingGhostLayer,
      rect: sourceRect,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    if (!localRect) {
      throw new TypeError("opening source rect could not be mapped into the ghost-layer coordinate space");
    }
    return localRect;
  }

  mapClosingTargetRectToLocal(
    state: Pick<FolderClosingState, "height" | "stageRect" | "width">,
    rect: StageRect,
  ): StageRect {
    const localRect = mapClientRectToDisplayObjectLocalRect({
      node: this.closingGhostLayer,
      rect,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    if (!localRect) {
      throw new TypeError("closing target rect could not be mapped into the ghost-layer coordinate space");
    }
    return localRect;
  }

  getOpeningGeometrySnapshot(
    openingLease: FolderOverlayOpenLease | null | undefined,
    state: FolderOverlayState,
    targetKey: string,
    targetX: number,
    targetY: number,
    panelRect: StageRect,
    sourceRect: FolderOverlayRect | null,
    options: AnimatePanelOptions = {},
  ): FolderOpeningGeometrySnapshot | null {
    if (!openingLease?.isCurrent?.()) return null;
    const folderId = state.renderedFolder?.id || null;
    const layoutKey = makeFolderOpeningGeometryLayoutKey({
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
      targetKey,
    });
    const existing = openingLease.geometrySnapshot();
    if (existing?.layoutKey === layoutKey && existing.folderId === folderId) return existing;
    const snapshot = makeFolderOpeningGeometrySnapshot({
      folderId,
      folderRect: sourceRect,
      getPreviewChildRect: options.getPreviewChildRect,
      layoutKey,
      panelRect,
      previewSlots: options.previewSlots,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
      targetKey,
      targetX,
      targetY,
    } as Parameters<typeof makeFolderOpeningGeometrySnapshot>[0]);
    openingLease.setGeometrySnapshot(snapshot);
    return openingLease.geometrySnapshot();
  }

  animatePanel(
    state: FolderOverlayState,
    targetX: number,
    targetY: number,
    panelRect: StageRect,
    sourceRect: FolderOverlayRect | null = null,
    options: AnimatePanelOptions = {},
  ): Readonly<{
    openingGeometrySnapshot: FolderOpeningGeometrySnapshot | null;
    openingLease: FolderOverlayOpenLease;
  }> | void {
    this.panelPresentation=[state,targetX,targetY,panelRect,sourceRect,options];
    const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
    const isOpenFolderZoomFadeClosing = Boolean(state.isFolderZoomFadeClosing && !state.isFolderClosing);
    const folderId = state.renderedFolder?.id || null;
    const markBoundsDirty = () => this.markRegisteredBoundsDirty();
    const isNewPanelSource = this.currentFolderId !== folderId;
    if (state.isFolderAppLaunchClosing) {
      this.openingLease?.cancel();
      this.openingLease = null;
      this.cancelOpeningPanelReadyCheck();
      this.panelOpenTargetKey = null;
      this.panelAlphaTarget = null;
      this.panelOpenProgressDriven = false;
    }
    if (isNewPanelSource) {
      this.resetPanelMotion(FOLDER_PANEL_OPEN_REASON, { panelProps: "x,y,alpha", scaleProps: "x,y" });
      this.currentFolderId = folderId;
      this.panelOpenTargetKey = null;
      this.panelAlphaTarget = null;
      this.panelOpenProgressDriven = false;
      this.panelZoomFadeClosing = false;
      if (sourceRect) {
        const startGeometry = getPanelOpenStartGeometry(targetX, targetY, panelRect, sourceRect, state.stageRect);
        this.panel.position.set(startGeometry.x, startGeometry.y);
        this.panel.scale.set(startGeometry.scaleX, startGeometry.scaleY);
      } else {
        const startGeometry = getPanelOpenStartGeometry(targetX, targetY, panelRect, null, state.stageRect);
        this.panel.position.set(startGeometry.x, startGeometry.y);
        this.panel.scale.set(startGeometry.scaleX, startGeometry.scaleY);
      }
      this.panel.alpha = 0.94;
      this.panelTitleOpening = !isClosing;
      this.panelTitleStartScaleX = this.panel.scale.x;
      this.panelTitleStartScaleY = this.panel.scale.y;
      if (!isClosing) this.notifyPanelTitleFrame(panelRect, { folderId });
    }

    if (isOpenFolderZoomFadeClosing) {
      this.openingLease?.cancel();
      this.openingLease = null;
      this.cancelOpeningPanelReadyCheck();
      this.panelTitleOpening = false;
      this.panelOpenTargetKey = null;
      this.panelOpenProgressDriven = false;
      this.panelAlphaTarget = 1;
      if (!this.panelZoomFadeClosing) {
        this.resetPanelMotion(FOLDER_PANEL_ZOOM_FADE_REASON, { panelProps: "x,y,alpha", scaleProps: "x,y" });
        this.panelZoomFadeClosing = true;
      }
      this.panel.position.set(targetX, targetY);
      this.panel.scale.set(1);
      this.panel.alpha = 1;
      this.notifyPanelTitleFrame(panelRect, { folderId });
      markBoundsDirty();
      return;
    }
    this.panelZoomFadeClosing = false;

    if (state.isFolderClosing && sourceRect) {
      this.panelTitleOpening = false;
      this.resetPanelMotion(FOLDER_PANEL_HANDOFF_SNAP_REASON);
      this.panel.alpha = 0;
      return;
    }

    if (isClosing && sourceRect) {
      this.panelTitleOpening = false;
      this.resetPanelMotion(FOLDER_PANEL_CLOSE_REASON, { panelProps: "x,y", scaleProps: "x,y" });
      const sourceLocalRect = clientRectToStageVisualRect(sourceRect, state.stageRect);
      motion(this.panel)
        .preset("folderPanelClose")
        .overlay()
        .interrupt("retarget")
        .to({ alpha: state.isFolderAppLaunchClosing ? 0 : 0.8 })
        .start();
      springPanelGeometry(this.panel, {
        scaleX: Math.max(0.08, sourceLocalRect.width / panelRect.width),
        scaleY: Math.max(0.08, sourceLocalRect.height / panelRect.height),
        x: sourceLocalRect.left + sourceLocalRect.width / 2,
        y: sourceLocalRect.top + sourceLocalRect.height / 2,
      }, { onFrame: markBoundsDirty });
      return;
    }

    if (isClosing) {
      this.panelTitleOpening = false;
      this.resetPanelMotion(FOLDER_PANEL_CLOSE_REASON, { panelProps: "x,y", scaleProps: "x,y" });
      motion(this.panel)
        .preset("folderClose")
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 0 })
        .start();
      springPanelGeometry(this.panel, {
        scaleX: 1.08,
        scaleY: 1.08,
        x: targetX,
        y: targetY,
      }, { onFrame: markBoundsDirty });
      return;
    }

    const targetKey = makeFolderPanelTargetKey(
      folderId,
      targetX,
      targetY,
      panelRect,
    );
    const previousOpeningLease = this.openingLease;
    this.openingLease = this.folderVisualSession.open({
      folderId: folderId!,
      forceNew: isNewPanelSource,
      targetKey,
    });
    if (previousOpeningLease !== this.openingLease) this.openingFrameEpoch += 1;
    const openingLease = this.openingLease;
    const openingGeometrySnapshot = this.getOpeningGeometrySnapshot(
      openingLease,
      state,
      targetKey,
      targetX,
      targetY,
      panelRect,
      sourceRect,
      options
    );
    const updateOpeningPanelFrame = () => {
      if (!openingLease.isCurrent()) return;
      this.notifyPanelTitleFrame(openingGeometrySnapshot?.target?.panelRect || panelRect, {
        folderId,
        openingLease,
      });
      markBoundsDirty();
      if (this.getPanelTitleProgress() < FOLDER_PANEL_READY_PROGRESS) return;
      this.markOpeningPanelReady(openingLease);
    };
    const openProgress = readProgress01(state.folderOpenProgress);
    if (openProgress !== null) {
      const shouldRetargetPresentation = !this.panelOpenProgressDriven || this.panelOpenTargetKey !== targetKey;
      if (shouldRetargetPresentation) {
        openingLease.panelPending(targetKey);
        this.panelOpenTargetKey = targetKey;
        this.panelOpenProgressDriven = true;
        this.resetPanelMotion(FOLDER_PANEL_OPEN_REASON, {
          panelProps: "x,y,alpha",
          scaleProps: "x,y",
        });
        this.scheduleOpeningPanelReadyCheck(openingLease, openingGeometrySnapshot?.target?.panelRect || panelRect, folderId);
      }
      this.panelAlphaTarget = 1;
      const startGeometry = getPanelOpenStartGeometry(targetX, targetY, panelRect, sourceRect, state.stageRect);
      const x = lerpNumber(startGeometry.x, targetX, openProgress);
      const y = lerpNumber(startGeometry.y, targetY, openProgress);
      const scaleX = lerpNumber(startGeometry.scaleX, 1, openProgress);
      const scaleY = lerpNumber(startGeometry.scaleY, 1, openProgress);
      const alpha = lerpNumber(0.94, 1, openProgress);
      const presentationChanged = this.panel.x !== x || this.panel.y !== y
        || this.panel.scale.x !== scaleX || this.panel.scale.y !== scaleY || this.panel.alpha !== alpha;
      this.panel.position.set(x, y);
      this.panel.scale.set(scaleX, scaleY);
      this.panel.alpha = alpha;
      // A bounds callback schedules another native scene commit. Re-enqueuing
      // it for an unchanged panel would keep that loop alive after motion ends.
      // New leases/targets still need their readiness and title notification.
      if (presentationChanged || shouldRetargetPresentation || previousOpeningLease !== openingLease) {
        updateOpeningPanelFrame();
      }
      return {
        openingGeometrySnapshot,
        openingLease,
      };
    }
    if (this.panelOpenProgressDriven) this.panelOpenTargetKey = null;
    this.panelOpenProgressDriven = false;
    if (this.panelAlphaTarget !== 1) {
      this.panelAlphaTarget = 1;
      motion(this.panel)
        .preset("folderOpen")
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 1 })
        .start();
    }

    if (options.resizeLayoutSyncActive || options.resizeVisualGeometryActive || options.resizeVisualGeometryFinalFrame) {
      if (this.panelOpenTargetKey !== targetKey) {
        openingLease.panelPending(targetKey);
      }
      this.panelOpenTargetKey = targetKey;
      this.resetPanelMotion(FOLDER_RESIZE_LAYOUT_REASON, {
        panelProps: "x,y",
        scaleProps: "x,y",
        stopSprings: false,
      });
      this.panel.position.set(targetX, targetY);
      this.panel.scale.set(1);
      updateOpeningPanelFrame();
      return {
        openingGeometrySnapshot,
        openingLease,
      };
    }

    if (this.panelOpenTargetKey !== targetKey) {
      openingLease.panelPending(targetKey);
      this.panelOpenTargetKey = targetKey;
      this.resetPanelMotion(FOLDER_PANEL_OPEN_REASON, {
        panelProps: "x,y",
        scaleProps: "x,y",
        stopSprings: false,
      });
      springPanelGeometry(this.panel, {
        scaleX: 1,
        scaleY: 1,
        x: targetX,
        y: targetY,
      }, { onFrame: updateOpeningPanelFrame, spring: motionSprings.folderPanelOpen });
      this.scheduleOpeningPanelReadyCheck(openingLease, openingGeometrySnapshot?.target?.panelRect || panelRect, folderId);
    }
    updateOpeningPanelFrame();
    return {
      openingGeometrySnapshot,
      openingLease,
    };
  }

  drawPanel(panel: StageRect): void {
    this.panelMaterial.clear()
      .roundRect(0, 0, panel.width, panel.height, 48)
      .fill({ color: 0xf7f8ff, alpha: 0.26 })
      .stroke({ color: 0xffffff, alpha: 0.24, width: 1 });
  }

  drawPanelClipMask(panel: StageRect, mask: Graphics = this.panelClipMask): void {
    mask.clear()
      .roundRect(0, 0, panel.width, panel.height, 48)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  bindFakeRefs(state: FolderOverlayState, geometry: FolderGeometry): void {
    const meta = { folderId: state.renderedFolder?.id || null };
    const panelElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.panel, meta);
    const gridElement = makeStageVirtualElement(state.stageRect, state.width, state.height, geometry.grid, meta);
    if (state.folderPanelRef) state.folderPanelRef.value = panelElement;
    if (state.folderViewportRef) state.folderViewportRef.value = gridElement;
    if (typeof state.setFolderPageRef === "function") {
      const committedPageIndex = Number.isFinite(Number(state.folderPageIndex)) ? Number(state.folderPageIndex) : 0;
      const visualPageIndex = Number.isFinite(Number(state.visualFolderPageIndex))
        ? Number(state.visualFolderPageIndex)
        : committedPageIndex;
      state.setFolderPageRef(gridElement, visualPageIndex);
      if (committedPageIndex !== visualPageIndex) state.setFolderPageRef(gridElement, committedPageIndex);
    }
  }

  handlePointerDown(event: FederatedPointerEvent): void {
    const native = (event?.nativeEvent || event) as NativePointerInput & OptionalPointerEvent;
    if (typeof native?.button === "number" && native.button !== 0) return;

    const clientX = native.clientX ?? (this.stageRect?.left || 0) + (event?.global?.x || 0);
    const clientY = native.clientY ?? (this.stageRect?.top || 0) + (event?.global?.y || 0);
    const localPoint = clientPointToStageVisualPoint({ x: clientX, y: clientY }, this.stageRect) || { x: 0, y: 0 };
    const { x, y } = localPoint;
    if (this.isClosing) {
      const closeTarget = this.stableFolderCloseTarget;
      const hitRects = getClosingPresentationStageHitRects(this as FolderClosingHandoffLayer);
      if (this.isUserFolderClosing &&
        closeTarget?.folderId &&
        hitRects.some((rect) => isPointInRect(x, y, rect))) {
        native.preventDefault?.();
        native.stopPropagation?.();
        this.onClosingFolderPointerDown(closeTarget.folderId, native);
      }
      return;
    }

    native.preventDefault?.();
    native.stopPropagation?.();

    const panel = this.panelGeometry;
    if (!panel) return;
    if (x < panel.left || x > panel.left + panel.width || y < panel.top || y > panel.top + panel.height) {
      this.onOutsidePointerDown(native);
      return;
    }
    this.onPanelPointerDown(native);
  }

  handleIconAction(
    action: IconNodeAction,
    originalEvent: unknown,
    item: SceneItem | null,
    source: SceneDataRecord | null,
    node: IconNode,
  ): void {
    const event = makeSyntheticPointerEvent(
      originalEvent as NativePointerInput,
      node as IconNode & SyntheticPointerNode,
    );
    this.onIconAction(action, event, item, source, node);
  }

  getVisualDebugSnapshot() {
    const readDisplay = (node: Container | null | undefined) => {
      const hasTransform = Boolean(node?.scale);
      return {
        alpha: roundDebugValue(node?.alpha),
        childCount: node?.children?.length ?? null,
        destroyed: node?.destroyed ?? null,
        height: roundDebugValue(hasTransform ? node?.height : null),
        itemId: (node as FolderGhostNode | null | undefined)?.item?.id || null,
        renderable: node?.renderable ?? null,
        scaleX: roundDebugValue(node?.scale?.x),
        scaleY: roundDebugValue(node?.scale?.y),
        visible: node?.visible ?? null,
        width: roundDebugValue(hasTransform ? node?.width : null),
        x: roundDebugValue(hasTransform ? node?.x : null),
        y: roundDebugValue(hasTransform ? node?.y : null),
      };
    };
    const readChildren = (container: Container | null | undefined) => (
      Array.from(container?.children || []).map((child) => readDisplay(child as Container))
    );
    const folderIconNodes = Array.from(this.iconNodes || []).map(([key, node]) => ({
      alpha: roundDebugValue(node?.alpha),
      id: node?.item?.id || null,
      key,
      pageIndex: node?.state?.source?.pageIndex ?? node?.source?.pageIndex ?? null,
      target: this.folderIconLayoutTargets?.get(key) || null,
      visible: node?.visible ?? null,
      x: roundDebugValue(node?.x),
      y: roundDebugValue(node?.y),
    }));
    return {
      closingGhosts: readChildren(this.closingGhostLayer),
      closingGhostMotions: this.closingGhosts?.getMotionDebugSnapshot?.() || [],
      closingMirror: {
        baselineFolderId: this.closingDesktopPageTrackMirrorBaseline?.folderId || null,
        baselineLiveX: this.closingDesktopPageTrackMirrorBaseline
          ? Math.round(this.closingDesktopPageTrackMirrorBaseline.liveX * 1000) / 1000
          : null,
        frameGhostX: Math.round((this.frameGhost?.x ?? 0) * 1000) / 1000,
        maskX: Math.round((this.closingFrameMask?.x ?? 0) * 1000) / 1000,
        offsetX: Math.round((this.closingDesktopPageTrackMirrorX ?? 0) * 1000) / 1000,
        previewSwapLayerX: Math.round((this.closingPreviewSwapLayer?.x ?? 0) * 1000) / 1000,
      },
      folderLayout: {
        iconNodes: folderIconNodes,
        pageMaskRect: cloneDebugRect(this.pageMaskRect),
        pageTrackMotion: {
          mode: this.pageTrackMotion?.mode || null,
          targetX: roundDebugValue(this.pageTrackMotion?.targetX),
        },
        pageTrackX: roundDebugValue(this.pageTrack?.x),
        pageTurnVisualSettle: this.pageTurnVisualSettle ? { ...this.pageTurnVisualSettle } : null,
        resizeLayoutSync: this.resizeLayoutSync ? { ...this.resizeLayoutSync } : null,
      },
      frameGhost: {
        display: readDisplay(this.frameGhost as unknown as Container),
        folderId: this.frameGhostFolderId || null,
        phase: this.frameGhostPhase || null,
        presentation: cloneFramePresentation(this.frameGhostState),
        transition: this.frameGhostTransitionState ? {
          closingDirection: { ...this.frameGhostTransitionState.trajectory.desktopClosingDirection },
          phaseFrom: roundDebugValue(this.frameGhostTransitionState.phaseFrom),
          phaseTo: roundDebugValue(this.frameGhostTransitionState.phaseTo),
          placement: this.frameGhostTransitionState.placement
            ? { ...this.frameGhostTransitionState.placement }
            : null,
          progress: roundDebugValue(this.frameGhostTransitionState.progressState.value),
        } : null,
      },
      layerDisplay: readDisplay(this),
      openingGhosts: readChildren(this.openingGhostLayer),
      openingGeometry: makeOpeningGeometryDebugSnapshot(
        this.folderVisualSession.snapshot().opening,
        this.currentOpeningGeometrySnapshot || null,
        this.panel
      ),
      panelDisplay: readDisplay(this.panel),
      previewSwapGhosts: readChildren(this.closingPreviewSwapLayer),
      detachedClosingVisuals: (this.detachedClosingVisuals || []).map((visual) => ({
        children: readChildren(visual.container),
        clearing: visual.clearing === true,
        container: readDisplay(visual.container),
        destroyed: visual.destroyed === true,
        finishQueued: visual.finishQueued === true,
        folderId: visual.folderId || null,
        content: (visual.content || []).map((child) => readDisplay(child)),
        frame: visual.frame ? readDisplay(visual.frame as unknown as Container) : null,
        geometryComplete: visual.geometryComplete === true,
        handoffCommitted: visual.handoffCommitted === true,
        handoffReleased: visual.handoffReleased === true,
      })),
    };
  }

  destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.panelPresentation=null;
    this.teardownTransientState({
      clearDetachedClosingVisuals: true,
      clearVisualCommitQueue: true,
    });
    this.folderVisualSession.dispose();
    killAllMotion(this.panel, { reason: "destroyed" });
    killAllMotion(this.pageTrack, { reason: "destroyed" });
    this.clearPageDots();
    cancelPageTrackMotion(this.pageTrackMotion, "destroyed");
    killMotionOf(this.pageTrack, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.panel, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.panel.scale, null, { lane: "base", reason: "destroyed" });
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
