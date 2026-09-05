import type { StateHost, StateCell as Ref } from "./stateHost.js";
import type { DragHost } from "./dragHost.js";
import {
  FOLDER_PAGE_EDGE_MAX_SIZE,
  FOLDER_PAGE_EDGE_MIN_SIZE,
  FOLDER_PAGE_EDGE_NEUTRAL_INSET,
  FOLDER_PAGE_EDGE_RATIO,
  FOLDER_HOVER_STICKY_MARGIN,
  PAGE_EDGE_SIZE,
  PAGE_TURN_DELAY,
} from "../composables/launchpadConstants.js";
import {
  clamp,
  expandRect,
  isPointInsideRect,
} from "../domain/launchpadLayout.js";
import type {
  LaunchpadApp,
  LaunchpadFolder,
  LaunchpadItem,
  LaunchpadPages,
  ReadonlyLaunchpadApp,
  ReadonlyLaunchpadFolder,
  ReadonlyLaunchpadItem,
  ReadonlyLaunchpadPages,
  Rect,
} from "../domain/launchpadLayout.js";
import { cloneLaunchpadApp as cloneDomainLaunchpadApp } from "../domain/launchpadClone.js";
function getDomRefElement<T>(node: T | Readonly<{ $el: T | null | undefined }> | null | undefined): T | null {
  if (!node) return null;
  return typeof node === "object" && "$el" in node ? node.$el ?? null : node as T;
}
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../rendering/desktopScenePort.js";
import { stageLayoutRecordToClientRect } from "../rendering/desktopScenePort.js";
import {
  captureGroupTransferSourceEntries,
  indexGroupTransferSources,
} from "../domain/groupTransferSourceCapture.js";
import type {
  GroupTransferItem,
  GroupTransferSourceEntry,
  GroupTransferSourceLocation,
} from "../domain/groupTransferSourceCapture.js";
import { makeGroupTransferPresentation } from "../domain/groupTransferPresentation.js";
import type {
  GroupTransferPresentationMember,
} from "../domain/groupTransferPresentation.js";
import type {
  GroupTransferEffects,
  GroupTransferLocation,
  GroupTransferMember,
} from "../domain/groupTransferPlanner.js";
import {
  GROUP_TRANSFER_OUTCOME,
  GROUP_TRANSFER_PHASE,
  isInteractiveGroupTransferPhase,
} from "../domain/groupTransferSession.js";
import type {
  GroupTransferOutcome,
  GroupTransferPhase,
} from "../domain/groupTransferSession.js";
import {
  appendGroupTrailPoint,
  prefersReducedMotion,
} from "../rendering/desktopScenePort.js";
import {
  makeGroupTransferRuntimeEntries,
  makeGroupTransferRuntimeReleasePlan,
} from "../rendering/desktopScenePort.js";
import { makeIconVisualSpec } from "../rendering/desktopScenePort.js";
import type {
  createIconBoundsRegistry,
  GroupTrailPoint,
  GroupTransferRuntimeActor,
  GroupTransferRuntimeEntry,
  GroupTransferRuntimeReleaseEntry,
  GroupTransferRuntimeSourceEntry,
} from "../rendering/desktopScenePort.js";
import type { FolderMotionGeometry } from "../composables/useFolderMotionGeometry.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;
const GROUP_DRAG_VISUAL_LIMIT = 12;
// Group target intent is sampled on a short pointer cadence.  The generic
// idle delay is intentionally not used here: waiting 140ms leaves the drag
// visually over a target while the planner still reports the old desktop
// slot, which makes app-on-app drops feel slippery.
const GROUP_DROP_INTENT_DELAY_MS = 42;
const GROUP_FOLDER_HOVER_OPEN_MS = 920;
const GROUP_FOLDER_HOVER_FLASH_MS = 540;
const GROUP_APP_FOLDER_HOVER_SETTLE_MS = 660;
const GROUP_APP_FOLDER_HOVER_FLASH_TOTAL_MS = 540;
const GROUP_APP_FOLDER_HOVER_OPEN_BUFFER_MS = 20;
const GROUP_APP_FOLDER_HOVER_RESTORE_BEFORE_OPEN_MS = 90;
const GROUP_APP_FOLDER_HOVER_OPEN_MS =
  GROUP_APP_FOLDER_HOVER_SETTLE_MS +
  GROUP_APP_FOLDER_HOVER_FLASH_TOTAL_MS +
  GROUP_APP_FOLDER_HOVER_OPEN_BUFFER_MS;
const GROUP_APP_FOLDER_HOVER_OPENING_MS = Math.max(
  0,
  GROUP_APP_FOLDER_HOVER_OPEN_MS - GROUP_APP_FOLDER_HOVER_RESTORE_BEFORE_OPEN_MS
);
const FOLDER_HIT_CANDIDATE_MARGIN = 6;
const FOLDER_HIT_INTENT_MAX_SIZE = 64;
const LAYOUT_PROJECTION_RELEASE_DELAY_MS = 260;
const POINTER_MOVE_THRESHOLD = 6;
const VELOCITY_SMOOTHING = 0.6;
const VELOCITY_MAX_DELTA_MS = 80;

type IconBoundsRegistry = ReturnType<typeof createIconBoundsRegistry>;
type GroupTransferPresentationPlan = ReturnType<typeof makeGroupTransferPresentation>;
type GroupTransferRuntimeReleasePlan = ReturnType<typeof makeGroupTransferRuntimeReleasePlan>;
type IconVisualSpec = ReturnType<typeof makeIconVisualSpec>;

export type LaunchpadDragPoint = Readonly<{ x: number; y: number }>;
export type LaunchpadDragRect = Readonly<Rect>;

export type LaunchpadDragVisualState = Readonly<{
  cellHeight?: number | undefined;
  cellWidth?: number | undefined;
  compact?: boolean | undefined;
  iconSize?: number | undefined;
  singleLineLabel?: boolean | undefined;
}>;

export type LaunchpadDragEventTarget = Readonly<{
  getBoundingClientRect?: () => Pick<Rect, "height" | "left" | "top" | "width"> | null;
}>;

export type LaunchpadDragPointerEvent = Readonly<{
  button?: number | undefined;
  buttons?: number | null | undefined;
  cancelSource?: string | null | undefined;
  clientX?: number | undefined;
  clientY?: number | undefined;
  currentTarget?: LaunchpadDragEventTarget | null | undefined;
  dragAnchor?: LaunchpadDragPoint | undefined;
  dragStartedFromThreshold?: boolean | undefined;
  dragVisualState?: LaunchpadDragVisualState | null | undefined;
  isPrimary?: boolean | undefined;
  pointerId?: number | null | undefined;
  pointerType?: string | undefined;
  preventDefault?: (() => void) | undefined;
  shiftKey?: boolean | undefined;
  stopImmediatePropagation?: (() => void) | undefined;
  stopPropagation?: (() => void) | undefined;
  timeStamp?: number | undefined;
  type?: string | undefined;
  userInitiatedCancel?: boolean | undefined;
}>;

export type LaunchpadDragBatchPayload = Readonly<{
  draggedIds: readonly string[];
  layoutRevision: number;
  leadId: string;
  selectionRevision: number;
}>;

export type LaunchpadDragPayload = Readonly<{
  draggedIds: readonly string[];
  layoutRevision: number;
  leadId: string;
  selectionRevision: number | null;
  standalone: boolean;
}>;

type LaunchpadDragIntentFields = Readonly<{
  allowCreate?: boolean | undefined;
  anchorId?: string | undefined;
  folderId?: string | null | undefined;
  folderPageIndex?: number | undefined;
  index?: number | undefined;
  pageIndex?: number | undefined;
  reason?: string | undefined;
  targetAppId?: string | undefined;
}>;

export type LaunchpadDragIntent = LaunchpadDragIntentFields & (
  | Readonly<{ index: number; pageIndex: number; type: "desktop-slot" }>
  | Readonly<{ folderId: string; folderPageIndex: number; index: number; type: "folder-slot" }>
  | Readonly<{ folderId: string; type: "folder-thumbnail" }>
  | Readonly<{ targetAppId: string; type: "application" }>
  | Readonly<{ anchorId: string; type: "toolbar-folder-create" }>
  | Readonly<{ reason: string; type: "invalid" }>
  | Readonly<{ type: "cancel" }>
);

export type LaunchpadDragAcceptedPlan = Readonly<{
  effects: GroupTransferEffects;
  members: GroupTransferMember[];
  nextPages: LaunchpadPages;
  orderedSelectedIds?: string[];
  projectedPages?: LaunchpadPages;
  reason: "same-placement" | null;
  status: "accepted" | "noop";
}>;

export type LaunchpadDragRejectedPlan = Readonly<{
  effects?: GroupTransferEffects;
  members?: GroupTransferMember[];
  nextPages: null;
  orderedSelectedIds?: string[];
  reason: string;
  status: "rejected";
}>;

export type LaunchpadDragPlan = LaunchpadDragAcceptedPlan | LaunchpadDragRejectedPlan;

export type LaunchpadDragPlannerAcceptedResult = Readonly<{
  effects: GroupTransferEffects;
  members: GroupTransferMember[];
  nextPages: readonly (readonly GroupTransferItem[])[];
  orderedSelectedIds?: string[];
  projectedPages?: readonly (readonly GroupTransferItem[])[];
  reason: "same-placement" | null;
  status: "accepted" | "noop";
}>;

export type LaunchpadDragPlannerRejectedResult = Readonly<{
  effects?: GroupTransferEffects;
  members?: GroupTransferMember[];
  nextPages: null;
  orderedSelectedIds?: string[];
  reason: string;
  status: "rejected";
}>;

export type LaunchpadDragPlannerResult =
  | LaunchpadDragPlannerAcceptedResult
  | LaunchpadDragPlannerRejectedResult;

export type LaunchpadDragPlanRequest = Readonly<{
  basePages: readonly (readonly GroupTransferItem[])[];
  baseRevision: number;
  createdFolderId: string;
  currentRevision: number;
  draggedIds: readonly string[];
  intent: LaunchpadDragIntent;
  leadId: string;
  selectionRevision: number | null;
  standalone: boolean;
}>;

export type LaunchpadDragOperation = Readonly<{
  baseRevision: number;
  draggedIds: readonly string[];
  intent: LaunchpadDragIntent | null;
  selectionRevision: number | null;
  standalone: boolean;
}>;

export type LaunchpadDragSource =
  | Readonly<{ folderId: string | null; index: number; pageIndex: number; type: "folder" }>
  | Readonly<{ index: number; pageIndex: number; type: "page" | "search" }>;

type TopLevelLocation = Readonly<{
  index: number;
  item: ReadonlyLaunchpadItem;
  pageIndex: number;
}>;

type TopLevelTarget = TopLevelLocation & Readonly<{ rect: LaunchpadDragRect }>;
type ApplicationTopLevelTarget = Omit<TopLevelTarget, "item"> & Readonly<{
  item: ReadonlyLaunchpadApp;
}>;

type ResolvedDropIntent = Readonly<{
  fallbackPoint: LaunchpadDragPoint;
  intent: LaunchpadDragIntent;
  locked: boolean;
  target: TopLevelTarget | null;
}>;

type LaunchpadDragCommitFolderOptions = Readonly<{
  excludeCloseGhostIds?: readonly string[];
  originGeometry?: FolderMotionGeometry | null;
}>;

type ProvisionalFolderDiscardOptions = Readonly<{
  previewSlotIndex: number;
  projectedPages: LaunchpadPages;
  reducedMotion: boolean;
  targetIndex: number;
  targetItem: ReadonlyLaunchpadApp;
  targetPageIndex: number;
  targetRect: LaunchpadDragRect | null;
}>;

type PageTurnCommitOptions = Readonly<{ allowCreate: boolean }>;
type FolderPageTurnOptions = PageTurnCommitOptions & Readonly<{
  folderId: string | null;
  phase: "open";
  source?: string;
}>;

type PageRectElement = Readonly<{
  getBoundingClientRect: () => LaunchpadDragRect;
}>;

type DragDomRefNode =
  | PageRectElement
  | Readonly<{ $el: PageRectElement | null | undefined }>
  | null
  | undefined;

export type StartCommittedGroupTransferRequest = Readonly<{
  basePages?: ReadonlyLaunchpadPages;
  baseRevision: number;
  commit: (plan: LaunchpadDragAcceptedPlan) => boolean | void;
  draggedIds: readonly string[];
  leadId?: string | null;
  onComplete?: () => void;
  plan: LaunchpadDragPlannerAcceptedResult;
  selectionRevision: number | null;
}>;

export type CompleteGroupReleaseResult = Readonly<{
  actorKey?: string | undefined;
  entryId?: string | undefined;
  id?: string | undefined;
  outcome?: "aborted" | string | undefined;
  planKey?: string | undefined;
  reason?: string | undefined;
}>;

export type LaunchpadDragOptions = Readonly<{
  clearFolderPageTurnRequest?: (reason: string) => unknown;
  cloneItem: (item: ReadonlyLaunchpadItem) => LaunchpadItem;
  clonePages: (pages: ReadonlyLaunchpadPages) => LaunchpadPages;
  commitFolderPageIndex: (index: number, options?: PageTurnCommitOptions) => unknown;
  commitFolderPageTurnRequest?: (token: number, options: FolderPageTurnOptions) => boolean;
  commitGroupDrop: (plan: LaunchpadDragAcceptedPlan, operation: LaunchpadDragOperation) => boolean | void;
  commitOpenFolder: (folderId: string | null, options?: LaunchpadDragCommitFolderOptions) => unknown;
  commitPageIndex: (index: number) => unknown;
  desktopMainRef?: Readonly<Ref<DragDomRefNode>>;
  discardProvisionalFolder: (folderId: string, options: ProvisionalFolderDiscardOptions) => boolean;
  findTopLevel: (pages: ReadonlyLaunchpadPages, itemId: string) => TopLevelLocation | null;
  finishHomeRevealSettleWindow: () => unknown;
  folderCols: Readonly<Ref<number>>;
  folderPageIndex: Readonly<Ref<number>>;
  folderPageRefs: readonly (PageRectElement | null | undefined)[];
  folderPages: Readonly<Ref<readonly (readonly (ReadonlyLaunchpadApp | null | undefined)[])[]>>;
  folderPageSize: Readonly<Ref<number>>;
  folderPanelRef: Readonly<Ref<DragDomRefNode>>;
  folderViewportRef?: Readonly<Ref<DragDomRefNode>>;
  getBatchCancelZoneRect?: () => Pick<Rect, "height" | "left" | "top" | "width"> | null;
  getFolderCreateMotionGeometry?: (targetAppId: string, folderId: string) => FolderMotionGeometry | null;
  getGroupLayoutRevision: () => number;
  getNewFolderName: () => string;
  gridCols: Readonly<Ref<number>>;
  gridRows: Readonly<Ref<number>>;
  iconBoundsRegistry: IconBoundsRegistry;
  iconSize: Readonly<Ref<number>>;
  isHomeRevealSettling: Readonly<Ref<boolean>>;
  isLayoutProjectionActive?: Ref<boolean>;
  isLaunchpadInteractionBlocked: () => boolean;
  isTextlessMode?: Readonly<Ref<boolean>>;
  makeId: (prefix: string) => string;
  onGroupDragEnd?: (group: LaunchpadDragGroup) => unknown;
  onGroupDragStart?: (payload: LaunchpadDragPayload) => boolean | void;
  onGroupDropRejected?: (reason: string, context: Readonly<{ standalone: boolean }>) => unknown;
  openFolderId: Readonly<Ref<string | null>>;
  pageIndex: Readonly<Ref<number>>;
  pageRefs: readonly (PageRectElement | null | undefined)[];
  pages: Readonly<{ readonly value: ReadonlyLaunchpadPages }>;
  planGroupTransfer: (request: LaunchpadDragPlanRequest) => LaunchpadDragPlannerResult;
  requestFolderPageTurn?: (targetIndex: number, options: FolderPageTurnOptions) => number | null;
  visibleFolderRowCount: Readonly<Ref<number>>;
  visualFolderPageIndex?: Readonly<Ref<number>>;
}>;

type DesktopSourceSnapshot = Readonly<{
  pageIndex: number;
  pageSpan: number | null;
  rects: Map<string, LaunchpadDragRect>;
}>;

type FolderTransit = {
  folderId: string;
  hasEnteredPanel: boolean;
  origin: "auto" | "create" | "source";
};

type LockedTopLevelTarget = {
  rect: LaunchpadDragRect | null;
  stickyRect: LaunchpadDragRect | null;
  targetId: string;
  targetType: LaunchpadItem["type"];
};

type ProvisionalApplicationFolder = {
  folderId: string;
  projectedPages: LaunchpadPages;
  semanticIntent: Extract<LaunchpadDragIntent, { type: "application" }>;
  target: ApplicationTopLevelTarget;
};

export type LaunchpadDragGroup = {
  allEntries: GroupTransferRuntimeSourceEntry[];
  basePages: LaunchpadPages;
  baseRevision: number;
  cancelArmed: boolean;
  cancelSource: string | null;
  createdFolderId: string;
  desktopPageIndex: number;
  desktopSourceSnapshot?: DesktopSourceSnapshot;
  didCommit: boolean;
  dragEntries: GroupTransferRuntimeEntry[];
  draggedIds: string[];
  folderTransit?: FolderTransit | null;
  intent: LaunchpadDragIntent | null;
  intentKey: string | null;
  key: string;
  lastPlan: LaunchpadDragPlan | null;
  lastResolved?: ResolvedDropIntent | null;
  leadId: string;
  lockedTarget?: LockedTopLevelTarget | null;
  onComplete?: (() => void) | undefined;
  origin: "pointer" | "toolbar";
  outcome: GroupTransferOutcome | null;
  pendingOpenFolderId?: string | null;
  phase: GroupTransferPhase;
  planRevision?: number;
  presentationPlan?: GroupTransferPresentationPlan | null;
  projectionRefreshIntentKey: string | null;
  projectedPages: LaunchpadPages | null;
  provisionalFolder?: ProvisionalApplicationFolder | null;
  reason: string | null;
  returnedFromFolder?: boolean;
  runtimeEntries: GroupTransferRuntimeEntry[] | null;
  runtimePlan: GroupTransferRuntimeReleasePlan | null;
  runtimeStatus: "pending" | "running" | "settled" | "visual-aborted" | null;
  selectionRevision: number | null;
  semanticPlan: LaunchpadDragAcceptedPlan | null;
  settledActorKeys: Array<string | undefined>;
  shellActors: GroupTransferRuntimeActor[];
  sourceMembers: GroupTransferPresentationMember[];
  standalone: boolean;
  trail: GroupTrailPoint[];
  virtualFolderPageIndex: number | null;
  visualCompleted?: boolean;
};

type ActiveDrag = {
  cellSize: Readonly<{ height: number; width: number }> | null;
  compact: boolean;
  group: LaunchpadDragGroup;
  hasMoved: boolean;
  item: LaunchpadItem;
  lastPointerTime: number;
  offset: LaunchpadDragPoint;
  pointer: LaunchpadDragPoint;
  pointerId: number | null | undefined;
  singleLineLabel: boolean;
  size: Readonly<{ height: number; width: number }>;
  source: LaunchpadDragSource | GroupTransferSourceLocation;
  start: LaunchpadDragPoint;
  velocity: LaunchpadDragPoint;
};

function isFolderPointerSource(
  source: ActiveDrag["source"],
): source is Extract<LaunchpadDragSource, { type: "folder" }> {
  return "type" in source && source.type === "folder";
}

type PreparedDragDescriptor = Readonly<{
  anchorPoint: LaunchpadDragPoint;
  cellSize: Readonly<{ height: number; width: number }>;
  dragVisualState: LaunchpadDragVisualState | null;
  item: LaunchpadItem;
  offset: LaunchpadDragPoint;
  payload: LaunchpadDragPayload;
  pointerId: number | null | undefined;
  rect: LaunchpadDragRect;
  size: Readonly<{ height: number; width: number }>;
  source: LaunchpadDragSource;
  startedFromMovement: boolean;
  startPoint: LaunchpadDragPoint;
}>;

type PointerVelocitySample = Readonly<{
  pointer: LaunchpadDragPoint;
  time: number;
  velocity: LaunchpadDragPoint;
}>;

type FolderPageTurnState =
  | { phase: "idle"; timer: null }
  | {
    allowCreate: boolean;
    direction: -1 | 1;
    fromIndex: number;
    phase: "armed" | "latched";
    targetIndex: number;
    timer: number | null;
  };

type RenderedLaunchSource = Readonly<{
  area: "desktop" | "folder";
  folderId?: string;
  id: string;
  pageIndex: number;
}>;

type GatherPopulationSnapshot = Readonly<{
  activeFolderPageIndex: number;
  activePageIndex: number;
  draggedIds: readonly string[];
  leadId: string;
  leadRect: LaunchpadDragRect | null;
  openFolderId: string | null;
  pages: LaunchpadPages;
  pointer: LaunchpadDragPoint;
}>;

type GatherPopulation = Readonly<{
  allEntries: GroupTransferRuntimeSourceEntry[];
  sourceMembers: GroupTransferPresentationMember[];
}>;

type GroupPresentationPhase = "gather" | "release" | "return";
type GroupPresentationUpdateOptions = Readonly<{
  key?: string;
  transferPlan?: LaunchpadDragAcceptedPlan | null;
}>;

type FolderHoverSession = Readonly<{
  group: LaunchpadDragGroup | null;
  hoverStateKey: string | null;
  plan: LaunchpadDragPlan;
  targetId: string | null;
  targetType: LaunchpadItem["type"] | null;
}>;

type IntentEvaluationOptions = Readonly<{
  finalizeFolderTransit?: boolean;
  force?: boolean;
}>;

type BeginReturnOptions = Readonly<{
  cancelSource?: string | null;
  keyPrefix: string;
  outcome: GroupTransferOutcome;
  reason?: string | null;
}>;

export type LaunchpadDragMeta = Readonly<{
  draggedIds: readonly string[];
  item: ReadonlyLaunchpadItem;
  source: LaunchpadDragSource | GroupTransferSourceLocation;
}>;

export type LaunchpadDragFolderHoverState = Readonly<{
  key: string;
  phase: "flash" | "hover" | "opening";
  startedAt: number;
  targetId: string;
  targetType: LaunchpadItem["type"];
}>;

export type LaunchpadDragHitDebugState = Readonly<{
  active: true;
  key: string;
  phase: GroupTransferPhase;
  pointer: LaunchpadDragPoint;
  reason: string;
  source: ActiveDrag["source"];
  target: Readonly<{ id: string; rect: LaunchpadDragRect | null; type: LaunchpadItem["type"] }> | null;
  winner: LaunchpadDragIntent["type"] | "rejected";
}>;

export type LaunchpadGroupDragState = Readonly<{
  canCancel: boolean;
  cancelArmed: boolean;
  cancelSource: string | null;
  center: LaunchpadDragPoint | null;
  draggedIds: readonly string[];
  desktopPageIndex: number;
  entries: readonly GroupTransferRuntimeEntry[];
  folderTransit: FolderTransit | null;
  intent: LaunchpadDragIntent | null;
  intentPlan: LaunchpadDragPlan | null;
  key: string;
  leadId: string;
  outcome: GroupTransferOutcome | null;
  phase: GroupTransferPhase;
  pointer: LaunchpadDragPoint;
  presentationPlan: GroupTransferPresentationPlan | null;
  projectedPages: LaunchpadPages | null;
  reducedMotion: boolean;
  reason: string | null;
  releaseVisualCount: number;
  runtimePlan: GroupTransferRuntimeReleasePlan | null;
  runtimeStatus: LaunchpadDragGroup["runtimeStatus"];
  semanticPlan: LaunchpadDragAcceptedPlan | null;
  settledActorKeys: readonly (string | undefined)[];
  shellActors: readonly GroupTransferRuntimeActor[];
  source: ActiveDrag["source"];
  totalCount: number;
  trail: readonly GroupTrailPoint[];
  visualSpec: IconVisualSpec | null;
}>;

export function isPrimaryPointerStartEvent(event: LaunchpadDragPointerEvent | null | undefined): boolean {
  if (!event) return false;
  if (typeof event.button === "number" && event.button !== 0) return false;
  if (typeof event.buttons === "number" && (event.buttons & 1) !== 1) return false;
  return true;
}

export function isPrimaryPointerMoveEvent(event: LaunchpadDragPointerEvent | null | undefined): boolean {
  if (!event) return false;
  return typeof event.buttons !== "number" || (event.buttons & 1) === 1;
}

export function isSamePointerEvent(
  pointerId: number | null | undefined,
  event: LaunchpadDragPointerEvent | null | undefined,
): boolean {
  return pointerId == null || event?.pointerId == null || pointerId === event.pointerId;
}

export function isPrimaryPointerReleaseEvent(event: LaunchpadDragPointerEvent | null | undefined): boolean {
  return event?.type === "pointercancel" || typeof event?.button !== "number" || event.button === 0;
}

export function shouldFinishDragForPointerEvent(
  activeDrag: Pick<ActiveDrag, "pointerId"> | null | undefined,
  event: LaunchpadDragPointerEvent | null | undefined,
): boolean {
  return isSamePointerEvent(activeDrag?.pointerId, event) && isPrimaryPointerReleaseEvent(event);
}

function nowMs(): number {
  return globalThis.performance?.now?.() || Date.now();
}

function readPointerTime(event: LaunchpadDragPointerEvent | null | undefined): number {
  const time = Number(event?.timeStamp);
  return Number.isFinite(time) && time > 0 ? time : nowMs();
}

function zeroVelocity(): LaunchpadDragPoint {
  return { x: 0, y: 0 };
}

export function samplePointerVelocity(
  previous: Partial<PointerVelocitySample> = {},
  event: LaunchpadDragPointerEvent = {},
  options: Readonly<{ maxDeltaMs?: number; smoothing?: number }> = {},
): PointerVelocitySample {
  const smoothing = clamp(Number(options.smoothing ?? VELOCITY_SMOOTHING), 0, 1);
  const maxDeltaMs = Math.max(1, Number(options.maxDeltaMs ?? VELOCITY_MAX_DELTA_MS));
  const time = readPointerTime(event);
  const previousPointer: LaunchpadDragPoint = previous.pointer || {
    x: Number(event.clientX),
    y: Number(event.clientY),
  };
  const previousTime = Number(previous.time) || time;
  const elapsedMs = Math.max(0, time - previousTime);
  const deltaMs = Math.max(1, Math.min(maxDeltaMs, elapsedMs));
  const instant = {
    x: ((Number(event.clientX) - previousPointer.x) / deltaMs) * 1000,
    y: ((Number(event.clientY) - previousPointer.y) / deltaMs) * 1000,
  };
  const velocity = elapsedMs > maxDeltaMs
    ? zeroVelocity()
    : previous.velocity || zeroVelocity();
  return {
    pointer: { x: Number(event.clientX), y: Number(event.clientY) },
    time,
    velocity: {
      x: velocity.x + (instant.x - velocity.x) * smoothing,
      y: velocity.y + (instant.y - velocity.y) * smoothing,
    },
  };
}

type RectInput = Partial<Rect> | Pick<Rect, "height" | "left" | "top" | "width">;

function cloneRect(rect: RectInput | null | undefined): LaunchpadDragRect | null {
  if (!rect) return null;
  const left = Number(rect.left) || 0;
  const top = Number(rect.top) || 0;
  const width = Number(rect.width) || 0;
  const height = Number(rect.height) || 0;
  return {
    bottom: Number("bottom" in rect ? rect.bottom : undefined) || top + height,
    height,
    left,
    right: Number("right" in rect ? rect.right : undefined) || left + width,
    top,
    width,
  };
}

function centerRect(
  rect: RectInput | null | undefined,
  fallback: LaunchpadDragPoint = { x: 0, y: 0 },
): LaunchpadDragPoint {
  if (!rect) return { ...fallback };
  return {
    x: Number(rect.left) + Number(rect.width) / 2,
    y: Number(rect.top) + Number(rect.height) / 2,
  };
}

function rectsIntersect(
  left: LaunchpadDragRect | null | undefined,
  right: LaunchpadDragRect | null | undefined,
): boolean {
  if (!left || !right) return false;
  return left.left <= right.right &&
    left.right >= right.left &&
    left.top <= right.bottom &&
    left.bottom >= right.top;
}

function makeCenteredRect(
  rect: LaunchpadDragRect | null | undefined,
  width: number,
  height: number,
): LaunchpadDragRect | null {
  if (!rect || width <= 0 || height <= 0) return null;
  const left = Number(rect.left) + (Number(rect.width) - width) / 2;
  const top = Number(rect.top) + (Number(rect.height) - height) / 2;
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
}

function intentKey(intent: LaunchpadDragIntent | null | undefined): string {
  if (!intent) return "invalid";
  return [
    intent.type,
    intent.folderId || "",
    intent.targetAppId || "",
    intent.pageIndex ?? "",
    intent.folderPageIndex ?? "",
    intent.index ?? "",
    intent.allowCreate === true ? "create" : "",
    intent.reason || "",
  ].join(":");
}

function updateLayoutProjection(
  group: LaunchpadDragGroup,
  intent: LaunchpadDragIntent | null,
  plan: LaunchpadDragPlan,
): void {
  if (
    group.provisionalFolder?.folderId &&
    group.folderTransit?.folderId === group.provisionalFolder.folderId &&
    group.folderTransit.hasEnteredPanel !== true
  ) {
    group.projectedPages = group.provisionalFolder.projectedPages;
    return;
  }
  if (
    group.provisionalFolder?.folderId &&
    intent?.type === "folder-slot" &&
    intent.folderId === group.provisionalFolder.folderId
  ) {
    group.projectedPages = group.provisionalFolder.projectedPages;
    return;
  }
  // Folder/app intent is semantic only; keep the last slot projection until
  // release so the hidden source never exposes a hole in the base layout.
  if (intent?.type !== "desktop-slot" && intent?.type !== "folder-slot") return;
  if (plan.status === "accepted") {
    group.projectedPages = plan.projectedPages || plan.nextPages;
  } else if (plan.status === "noop") {
    group.projectedPages = null;
  }
}

function getFolderChildrenPages(
  folder: ReadonlyLaunchpadFolder | null | undefined,
): readonly (readonly (ReadonlyLaunchpadApp | null | undefined)[])[] {
  return Array.isArray(folder?.childPages) ? folder.childPages : [[]];
}

function toGroupTransferItem(item: ReadonlyLaunchpadItem): GroupTransferItem {
  if (item.type === "app") return toGroupTransferApp(item);
  return {
    ...item,
    childPages: item.childPages.map((page) => (
      page.flatMap((child) => child ? [toGroupTransferApp(child)] : [])
    )),
  };
}

function toGroupTransferApp(item: ReadonlyLaunchpadApp): ReadonlyLaunchpadApp {
  return { ...item };
}

function toGroupTransferPages(pages: ReadonlyLaunchpadPages): GroupTransferItem[][] {
  return pages.map((page) => page.map(toGroupTransferItem));
}

function requireLaunchpadItem(item: GroupTransferItem): LaunchpadItem {
  const name = item.name;
  if (typeof name !== "string") {
    throw new TypeError(`Launchpad drag item ${item.id} is missing a name`);
  }
  if (item.type === "app") {
    return cloneDomainLaunchpadApp(item);
  }
  const childPages = item.childPages.map((page) => page.flatMap((child) => {
    if (!child) return [];
    const launchItem = requireLaunchpadItem(child);
    if (launchItem.type !== "app") {
      throw new TypeError(`Launchpad folder ${item.id} contains nested folder ${launchItem.id}`);
    }
    return [launchItem];
  }));
  return { ...item, childPages, name, type: "folder" };
}

function requireLaunchpadPages(
  pages: readonly (readonly GroupTransferItem[])[],
): LaunchpadPages {
  return pages.map((page) => page.map(requireLaunchpadItem));
}

function normalizePlannerResult(plan: LaunchpadDragPlannerResult): LaunchpadDragPlan {
  if (plan.status === "rejected") return { ...plan, nextPages: null };
  const { projectedPages, ...acceptedPlan } = plan;
  const nextPages = requireLaunchpadPages(plan.nextPages);
  if (!projectedPages) return { ...acceptedPlan, nextPages };
  return {
    ...acceptedPlan,
    nextPages,
    projectedPages: requireLaunchpadPages(projectedPages),
  };
}

function cloneLaunchpadApp(
  cloneItem: LaunchpadDragOptions["cloneItem"],
  item: ReadonlyLaunchpadApp,
): LaunchpadApp {
  const clone = cloneItem(item);
  if (clone.type !== "app") {
    throw new TypeError(`Launchpad drag cloneItem changed app ${item.id} into a folder`);
  }
  return clone;
}

function makeGroupSourceMembers(
  pages: ReadonlyLaunchpadPages,
  draggedIds: readonly string[],
): GroupTransferPresentationMember[] {
  const selected = new Set((draggedIds || []).filter(Boolean));
  const sourceIndex = indexGroupTransferSources(toGroupTransferPages(pages));
  return sourceIndex.order.flatMap((id, sourceOrder) => {
    if (!selected.has(id)) return [];
    const location = sourceIndex.apps.get(id);
    if (!location) return [];
    const source: GroupTransferLocation = location.kind === "desktop"
      ? {
        index: location.index,
        kind: "desktop",
        pageIndex: location.pageIndex,
      }
      : {
        flatIndex: location.flatIndex,
        folderId: location.folderId,
        folderPageIndex: location.folderPageIndex,
        index: location.childIndex,
        kind: "folder",
        ownerIndex: location.ownerIndex,
        ownerPageIndex: location.ownerPageIndex,
      };
    return [{
      destination: null,
      id,
      item: { ...location.item },
      role: "selected",
      selected: true,
      source,
      sourceOrder,
    }];
  });
}

function findFolderInPages(
  pages: LaunchpadPages,
  folderId: string | null | undefined,
): LaunchpadFolder | null;
function findFolderInPages(
  pages: ReadonlyLaunchpadPages,
  folderId: string | null | undefined,
): ReadonlyLaunchpadFolder | null;
function findFolderInPages(
  pages: ReadonlyLaunchpadPages,
  folderId: string | null | undefined,
): ReadonlyLaunchpadFolder | null {
  for (const page of pages || []) {
    for (const item of page || []) {
      if (item.id === folderId && item.type === "folder") return item;
    }
  }
  return null;
}

export function createLaunchpadDrag(options: LaunchpadDragOptions, state: StateHost, host: DragHost) {
  const shallowRef = state.cell;
  const nextTick = host.afterCommit;
  const window = host;
  if (typeof options.getNewFolderName !== "function") {
    throw new TypeError("useLaunchpadDrag requires getNewFolderName");
  }
  if (typeof options.planGroupTransfer !== "function") {
    throw new TypeError("useLaunchpadDrag requires planGroupTransfer");
  }
  if (typeof options.commitGroupDrop !== "function") {
    throw new TypeError("useLaunchpadDrag requires commitGroupDrop");
  }
  if (typeof options.discardProvisionalFolder !== "function") {
    throw new TypeError("useLaunchpadDrag requires discardProvisionalFolder");
  }

  const dragMeta = shallowRef<LaunchpadDragMeta | null>(null);
  const dragFolderHoverState = shallowRef<LaunchpadDragFolderHoverState | null>(null);
  const dragFolderTargetId = shallowRef<string | null>(null);
  const dragHitDebugState = shallowRef<LaunchpadDragHitDebugState | null>(null);
  const groupDragState = shallowRef<LaunchpadGroupDragState | null>(null);
  const projectedPages = shallowRef<LaunchpadPages | null>(null);

  let activeDrag: ActiveDrag | null = null;
  let pendingDragStart: PreparedDragDescriptor | null = null;
  let previewFrame = 0;
  let intentTimer: number | null = null;
  let pageTurnTimer: { targetIndex: number; timer: number } | null = null;
  let folderPageTurnState: FolderPageTurnState = { phase: "idle", timer: null };
  let folderHoverTimer: number | null = null;
  let folderHoverFlashTimer: number | null = null;
  let folderHoverOpeningTimer: number | null = null;
  let projectionReleaseTimer: number | null = null;
  let contextMenuAttached = false;
  let groupKey = 0;
  let hoverKey = 0;
  let debugKey = 0;

  function isDragActive(): boolean {
    return Boolean(activeDrag);
  }

  function canUserCancelDrag(drag: ActiveDrag | null = activeDrag): boolean {
    return Boolean(
      drag?.group &&
      drag.group.standalone !== true &&
      isInteractiveGroupTransferPhase(drag.group.phase)
    );
  }

  function setLayoutProjectionActive(value: boolean): void {
    if (options.isLayoutProjectionActive && typeof options.isLayoutProjectionActive === "object") {
      options.isLayoutProjectionActive.value = Boolean(value);
    }
  }

  function clearLayoutProjectionRelease(reset = false): void {
    if (projectionReleaseTimer) window.clearTimeout(projectionReleaseTimer);
    projectionReleaseTimer = null;
    if (reset) setLayoutProjectionActive(false);
  }

  function scheduleLayoutProjectionRelease(): void {
    clearLayoutProjectionRelease();
    projectionReleaseTimer = window.setTimeout(() => {
      projectionReleaseTimer = null;
      setLayoutProjectionActive(false);
    }, prefersReducedMotion() ? 0 : LAYOUT_PROJECTION_RELEASE_DELAY_MS);
  }

  function suppressContextMenu(event: MouseEvent): void {
    if (!activeDrag) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function attachContextMenu(): void {
    if (contextMenuAttached) return;
    contextMenuAttached = true;
    window.addEventListener("contextmenu", suppressContextMenu, true);
  }

  function detachContextMenu(): void {
    if (!contextMenuAttached) return;
    contextMenuAttached = false;
    window.removeEventListener("contextmenu", suppressContextMenu, true);
  }

  function clearIntentTimer(): void {
    if (intentTimer) window.clearTimeout(intentTimer);
    intentTimer = null;
  }

  function clearPageTurn(): void {
    if (pageTurnTimer) window.clearTimeout(pageTurnTimer.timer);
    pageTurnTimer = null;
  }

  function clearFolderPageTurn(): void {
    if (folderPageTurnState.timer) window.clearTimeout(folderPageTurnState.timer);
    folderPageTurnState = { phase: "idle", timer: null };
    options.clearFolderPageTurnRequest?.("group-drag-clear");
  }

  function disarmFolderPageTurn(): void {
    if (folderPageTurnState.timer) window.clearTimeout(folderPageTurnState.timer);
    folderPageTurnState = { phase: "idle", timer: null };
  }

  function clearFolderHoverTimers(): void {
    if (folderHoverTimer) window.clearTimeout(folderHoverTimer);
    if (folderHoverFlashTimer) window.clearTimeout(folderHoverFlashTimer);
    if (folderHoverOpeningTimer) window.clearTimeout(folderHoverOpeningTimer);
    folderHoverTimer = null;
    folderHoverFlashTimer = null;
    folderHoverOpeningTimer = null;
  }

  function clearLockedTarget(): void {
    if (activeDrag?.group) activeDrag.group.lockedTarget = null;
  }

  function clearPendingTarget(): void {
    clearFolderHoverTimers();
    clearLockedTarget();
    if (activeDrag?.group) activeDrag.group.pendingOpenFolderId = null;
    dragFolderTargetId.value = null;
    dragFolderHoverState.value = null;
  }

  function cancelPreviewRaf(): void {
    if (previewFrame) window.cancelAnimationFrame(previewFrame);
    previewFrame = 0;
  }

  function getRenderedLaunchRect(source: RenderedLaunchSource): LaunchpadDragRect | null {
    return options.iconBoundsRegistry.getBounds(
      BOUNDS_KIND.LAUNCH,
      BOUNDS_VARIANT.RENDERED,
      source
    );
  }

  function getRenderedFolderRect(folderId: string): LaunchpadDragRect | null {
    return options.iconBoundsRegistry.getBounds(
      BOUNDS_KIND.TOP_LEVEL,
      BOUNDS_VARIANT.RENDERED,
      folderId
    ) || options.iconBoundsRegistry.getBounds(
      BOUNDS_KIND.FOLDER_THUMB,
      BOUNDS_VARIANT.RENDERED,
      folderId
    );
  }

  function makeDesktopSourceSnapshot(draggedIds: readonly string[]): DesktopSourceSnapshot {
    const pages = options.pages.value || [];
    const selectedIds = new Set(draggedIds || []);
    const rects = new Map<string, LaunchpadDragRect>();
    let pageSpan: number | null = null;
    // Only groups leave additional member slots that must remain insertion
    // targets. Standalone drags keep live app-on-app targeting after reflow.
    if (selectedIds.size <= 1) {
      return { pageIndex: options.pageIndex.value, pageSpan, rects };
    }
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      for (const item of pages[pageIndex] || []) {
        if (!item?.id || !selectedIds.has(item.id)) continue;
        const stableRecord = options.iconBoundsRegistry.getBounds(
          BOUNDS_KIND.TOP_LEVEL,
          BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
          item.id
        );
        const stableRect = stageLayoutRecordToClientRect(stableRecord);
        const stablePageSpan = Number(stableRecord?.meta?.stageRect?.width);
        if (!pageSpan && stablePageSpan > 0) {
          pageSpan = stablePageSpan;
        }
        const rect = stableRect || (item.type === "folder"
          ? getRenderedFolderRect(item.id)
          : getRenderedLaunchRect({
            area: "desktop",
            id: item.id,
            pageIndex,
          }));
        if (rect) rects.set(item.id, { ...rect });
      }
    }
    return {
      pageIndex: options.pageIndex.value,
      pageSpan,
      rects,
    };
  }

  function isPointInsideSnapshottedDesktopSource(
    point: LaunchpadDragPoint | null | undefined,
  ): boolean {
    const snapshot = activeDrag?.group?.desktopSourceSnapshot;
    const pageSpan = Number(snapshot?.pageSpan || getDesktopNavigationRect()?.width);
    if (!point || !snapshot?.rects?.size || !Number.isFinite(pageSpan) || pageSpan <= 0) {
      return false;
    }
    const pageDelta = Number(snapshot.pageIndex) - getVisualDesktopPageIndex();
    const offsetX = pageDelta * pageSpan;
    for (const rect of snapshot.rects.values()) {
      if (isPointInsideRect(rect, point.x - offsetX, point.y)) return true;
    }
    return false;
  }

  function hasNavigatedDesktopPage(): boolean {
    const snapshotPageIndex = activeDrag?.group?.desktopSourceSnapshot?.pageIndex;
    return Number.isFinite(Number(snapshotPageIndex)) &&
      Number(snapshotPageIndex) !== getVisualDesktopPageIndex();
  }

  function getStableTopLevelRect(targetId: string): LaunchpadDragRect | null {
    return stageLayoutRecordToClientRect(
      options.iconBoundsRegistry.getBounds(
        BOUNDS_KIND.TOP_LEVEL,
        BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
        targetId
      )
    );
  }

  function getVisualDesktopPageIndex(drag: ActiveDrag | null = activeDrag): number {
    return Math.max(
      0,
      Number(drag?.group?.desktopPageIndex ?? options.pageIndex.value) || 0
    );
  }

  function getPageRect(index = getVisualDesktopPageIndex()): LaunchpadDragRect | null {
    return options.pageRefs?.[index]?.getBoundingClientRect?.() || null;
  }

  function getDesktopNavigationRect(): LaunchpadDragRect | null {
    const desktopMain = getDomRefElement(options.desktopMainRef?.value);
    return desktopMain?.getBoundingClientRect?.() || getPageRect();
  }

  function getDesktopPageTurnDirection(clientX: number, clientY: number): -1 | 0 | 1 {
    const rect = getDesktopNavigationRect();
    if (!rect || clientY < rect.top || clientY > rect.bottom) return 0;
    if (clientX <= rect.left + PAGE_EDGE_SIZE) return -1;
    if (clientX >= rect.right - PAGE_EDGE_SIZE) return 1;
    return 0;
  }

  function isInsideDesktopDropRegion(
    clientX: number,
    clientY: number,
    pageRect: LaunchpadDragRect | null,
  ): boolean {
    if (!pageRect || isPointInsideRect(pageRect, clientX, clientY)) return true;
    if (!activeDrag?.group?.returnedFromFolder) return false;
    const desktopMain = getDomRefElement(options.desktopMainRef?.value);
    const desktopMainRect = desktopMain?.getBoundingClientRect?.() || null;
    return Boolean(desktopMainRect && isPointInsideRect(desktopMainRect, clientX, clientY));
  }

  function getFolderPageRect(index = options.folderPageIndex.value): LaunchpadDragRect | null {
    return options.folderPageRefs?.[index]?.getBoundingClientRect?.() ||
      options.folderPageRefs?.find(Boolean)?.getBoundingClientRect?.() ||
      null;
  }

  function getPointerCenter(drag: ActiveDrag | null = activeDrag): LaunchpadDragPoint | null {
    if (!drag) return null;
    return {
      x: drag.pointer.x - drag.offset.x + drag.size.width / 2,
      y: drag.pointer.y - drag.offset.y + drag.size.height / 2,
    };
  }

  function getDragVisualRect(drag: ActiveDrag | null = activeDrag): LaunchpadDragRect | null {
    if (!drag?.pointer || !drag.offset || !drag.size) return null;
    const left = drag.pointer.x - drag.offset.x;
    const top = drag.pointer.y - drag.offset.y;
    const width = Number(drag.size.width) || 0;
    const height = Number(drag.size.height) || 0;
    return {
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
    };
  }

  function getBatchCancelZoneRect(): LaunchpadDragRect | null {
    if (!canUserCancelDrag() || typeof options.getBatchCancelZoneRect !== "function") {
      return null;
    }
    const rect = cloneRect(options.getBatchCancelZoneRect());
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function isPointerInsideBatchCancelZone(drag: ActiveDrag | null = activeDrag): boolean {
    const rect = getBatchCancelZoneRect();
    return Boolean(
      drag?.pointer &&
      rect &&
      isPointInsideRect(rect, drag.pointer.x, drag.pointer.y)
    );
  }

  function getSourceCellSize(
    source: LaunchpadDragSource,
    fallbackRect: Pick<Rect, "height" | "width">,
  ): Readonly<{ height: number; width: number }> {
    const isFolder = source?.type === "folder";
    const rect = isFolder ? getFolderPageRect(source.pageIndex) : getPageRect(source?.pageIndex);
    if (!rect) return { height: fallbackRect.height, width: fallbackRect.width };
    const cols = Math.max(1, Number((isFolder ? options.folderCols : options.gridCols).value) || 1);
    const rowRef = isFolder ? options.visibleFolderRowCount : options.gridRows;
    const rows = Math.max(1, Number(rowRef.value) || 1);
    return {
      height: rect.height / rows,
      width: rect.width / cols,
    };
  }

  function buildGatherPopulationFromSnapshot(snapshot: GatherPopulationSnapshot): GatherPopulation {
    const viewportRect = getPageRect(snapshot.activePageIndex) || {
      height: Number(globalThis.innerHeight) || 1,
      left: 0,
      top: 0,
      width: Number(globalThis.innerWidth) || 1,
    };
    const entries = captureGroupTransferSourceEntries({
      activeFolderPageIndex: snapshot.activeFolderPageIndex,
      activePageIndex: snapshot.activePageIndex,
      draggedIds: snapshot.draggedIds,
      getDesktopRect: (location) => getRenderedLaunchRect({
        area: "desktop",
        id: location.item.id,
        pageIndex: location.pageIndex,
      }),
      getFolderLaunchRect: (location) => getRenderedLaunchRect({
        area: "folder",
        folderId: location.folderId,
        id: location.item.id,
        pageIndex: location.folderPageIndex,
      }),
      getFolderPreviewRect: (location) => options.iconBoundsRegistry.getBounds(
        BOUNDS_KIND.PREVIEW_CHILD,
        BOUNDS_VARIANT.RENDERED,
        {
          childId: location.item.id,
          folderId: location.folderId,
          slotIndex: location.flatIndex,
        }
      ),
      getFolderRect: (folderId) => getRenderedFolderRect(folderId),
      folderPanelRect: getDomRefElement(options.folderPanelRef.value)?.getBoundingClientRect?.() || null,
      leadId: snapshot.leadId,
      leadRect: snapshot.leadRect,
      openFolderId: snapshot.openFolderId,
      pages: toGroupTransferPages(snapshot.pages),
      pointer: snapshot.pointer,
      viewportRect,
    });
    return {
      allEntries: entries,
      sourceMembers: makeGroupSourceMembers(snapshot.pages, snapshot.draggedIds),
    };
  }

  function buildGatherPopulation(
    descriptor: PreparedDragDescriptor,
    drag: ActiveDrag,
  ): GatherPopulation {
    return buildGatherPopulationFromSnapshot({
      activeFolderPageIndex: options.folderPageIndex.value,
      activePageIndex: options.pageIndex.value,
      draggedIds: drag.group.draggedIds,
      leadId: drag.group.leadId,
      leadRect: descriptor.rect,
      openFolderId: options.openFolderId.value,
      pages: drag.group.basePages,
      pointer: descriptor.startPoint,
    });
  }

  function getReleaseVisualLimit(): number {
    const desktopPageSize = Math.max(
      1,
      (Number(options.gridCols?.value) || 1) * (Number(options.gridRows?.value) || 1)
    );
    return Math.max(desktopPageSize, Number(options.folderPageSize?.value) || 1);
  }

  function getReleaseVisualCount(group: LaunchpadDragGroup): number {
    const presentationCount = group.presentationPlan?.actors?.filter(
      (actor) => actor.role !== "folder-shell"
    ).length || 0;
    const semanticCount = group.sourceMembers?.length || 0;
    return Math.max(
      group.dragEntries?.length || 0,
      presentationCount,
      Math.min(getReleaseVisualLimit() + 16, semanticCount)
    );
  }

  function makePresentationCurrentView(group: LaunchpadDragGroup) {
    return {
      desktopPageIndex: group.desktopPageIndex ?? options.pageIndex.value,
      folderPageIndex: Number(options.visualFolderPageIndex?.value ?? options.folderPageIndex.value) || 0,
      leadId: group.leadId,
      openFolderId: options.openFolderId.value || null,
    };
  }

  function updateGroupPresentation(
    drag: ActiveDrag | null,
    phase: GroupPresentationPhase,
    presentationOptions: GroupPresentationUpdateOptions = {},
  ): GroupTransferPresentationPlan | null {
    const group = drag?.group;
    if (!group) return null;
    const transferPlan = presentationOptions.transferPlan || group.semanticPlan || null;
    const previousActors = group.presentationPlan?.actors || [];
    const desktopCols = Math.max(1, Number(options.gridCols?.value) || 1);
    const desktopRows = Math.max(1, Number(options.gridRows?.value) || 1);
    const folderCols = Math.max(1, Number(options.folderCols?.value) || 1);
    const folderPageSize = Math.max(1, Number(options.folderPageSize?.value) || 1);
    const folderRows = Math.max(
      1,
      Number(options.visibleFolderRowCount?.value) || Math.ceil(folderPageSize / folderCols)
    );
    const presentationPlan = makeGroupTransferPresentation({
      currentActors: previousActors,
      currentView: makePresentationCurrentView(group),
      limits: {
        desktopCols,
        desktopPageSize: desktopCols * desktopRows,
        desktopRows,
        folderCols,
        folderPageSize,
        folderRows,
        maxBundles: Math.min(
          GROUP_DRAG_VISUAL_LIMIT,
          Math.max(4, desktopRows * 2, folderRows * 2)
        ),
        maxContinuityActors: GROUP_DRAG_VISUAL_LIMIT,
        maxGatherActors: GROUP_DRAG_VISUAL_LIMIT,
      },
      phase,
      sourceMembers: group.sourceMembers,
      transferPlan,
    });
    const runtime = makeGroupTransferRuntimeEntries({
      phase,
      presentationPlan,
      sourceEntries: group.allEntries,
    });
    group.presentationPlan = presentationPlan;
    group.shellActors = runtime.shellActors;
    if (phase === "gather") {
      group.dragEntries = runtime.entries;
      return presentationPlan;
    }
    group.runtimeEntries = runtime.entries;
    group.runtimePlan = makeGroupTransferRuntimeReleasePlan({
      key: presentationOptions.key || `group-transfer-${phase}-${group.key}`,
      phase,
      presentationPlan,
      transferPlan,
      velocity: drag.velocity,
    });
    return presentationPlan;
  }

  function getPublishedGroupEntries(group: LaunchpadDragGroup): GroupTransferRuntimeEntry[] {
    if (
      (group.phase === GROUP_TRANSFER_PHASE.RELEASING ||
        group.phase === GROUP_TRANSFER_PHASE.RETURNING) &&
      group.runtimeEntries?.length
    ) return group.runtimeEntries;
    return group.dragEntries || [];
  }

  function makeActiveDragVisualSpec(drag: ActiveDrag | null = activeDrag): IconVisualSpec | null {
    if (!drag) return null;
    return makeIconVisualSpec({
      cellHeight: drag.cellSize?.height,
      cellWidth: drag.cellSize?.width,
      compact: drag.compact === true,
      iconSize: drag.size?.width,
      singleLineLabel: drag.singleLineLabel === true,
      textless: (drag.group?.draggedIds?.length || 0) > 1 ||
        options.isTextlessMode?.value === true,
    });
  }

  function publishGroupState(
    overrides: Partial<LaunchpadGroupDragState> = {},
  ): LaunchpadGroupDragState | null {
    if (!activeDrag?.group) {
      groupDragState.value = null;
      projectedPages.value = null;
      return null;
    }
    const group = activeDrag.group;
    const state: LaunchpadGroupDragState = {
      canCancel: canUserCancelDrag(activeDrag),
      cancelArmed: group.cancelArmed === true,
      cancelSource: group.cancelSource || null,
      center: getPointerCenter(activeDrag),
      draggedIds: [...group.draggedIds],
      desktopPageIndex: group.desktopPageIndex,
      entries: getPublishedGroupEntries(group),
      folderTransit: group.folderTransit ? { ...group.folderTransit } : null,
      intent: group.intent,
      intentPlan: group.lastPlan || null,
      key: group.key,
      leadId: group.leadId,
      outcome: group.outcome || null,
      phase: group.phase,
      presentationPlan: group.presentationPlan || null,
      pointer: { ...activeDrag.pointer },
      projectedPages: group.projectedPages,
      reducedMotion: prefersReducedMotion(),
      reason: group.reason || null,
      releaseVisualCount: getReleaseVisualCount(group),
      runtimePlan: group.runtimePlan,
      runtimeStatus: group.runtimeStatus || null,
      settledActorKeys: group.settledActorKeys || [],
      semanticPlan: group.semanticPlan || null,
      shellActors: group.shellActors || [],
      source: activeDrag.source,
      totalCount: group.draggedIds.length,
      trail: group.trail,
      visualSpec: makeActiveDragVisualSpec(activeDrag),
      ...overrides,
    };
    groupDragState.value = state;
    projectedPages.value = group.projectedPages || null;
    return state;
  }

  function scheduleVisualPublish(): void {
    if (previewFrame) return;
    previewFrame = window.requestAnimationFrame(() => {
      previewFrame = 0;
      publishGroupState();
    });
  }

  function enterBatchCancelZone(): boolean {
    const group = activeDrag?.group;
    if (!group || group.cancelArmed) return false;
    group.cancelArmed = true;
    group.cancelSource = null;
    group.intent = { type: "cancel" };
    group.intentKey = "cancel";
    group.projectedPages = null;
    projectedPages.value = null;
    clearIntentTimer();
    clearPageTurn();
    clearFolderPageTurn();
    clearPendingTarget();
    dragHitDebugState.value = null;
    publishGroupState();
    return true;
  }

  function leaveBatchCancelZone(): boolean {
    const group = activeDrag?.group;
    if (!group?.cancelArmed) return false;
    group.cancelArmed = false;
    group.intent = null;
    group.intentKey = null;
    evaluateIntent({ force: true });
    return true;
  }

  function syncBatchCancelZone(): boolean {
    if (!canUserCancelDrag()) return false;
    const armed = isPointerInsideBatchCancelZone();
    if (armed) enterBatchCancelZone();
    else leaveBatchCancelZone();
    return armed;
  }

  function calcDesktopInsertIndex(
    clientX: number,
    clientY: number,
    targetPageIndex = getVisualDesktopPageIndex(),
  ): number {
    const rect = getPageRect(targetPageIndex);
    if (!rect) return options.pages.value[targetPageIndex]?.length || 0;
    const cols = Math.max(1, Number(options.gridCols.value) || 1);
    const rows = Math.max(1, Number(options.gridRows.value) || 1);
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / (rect.width / cols)), 0, cols - 1);
    const row = clamp(Math.floor(y / (rect.height / rows)), 0, rows - 1);
    return row * cols + col;
  }

  function calcFolderInsertIndex(
    clientX: number,
    clientY: number,
  ): Readonly<{ index: number; pageIndex: number }> {
    const pageIndex = Math.max(0, Number(options.visualFolderPageIndex?.value ?? options.folderPageIndex.value) || 0);
    const rect = getFolderPageRect(pageIndex);
    if (!rect) {
      const folder = findFolderInPages(options.pages.value, options.openFolderId.value);
      return {
        index: getFolderChildrenPages(folder)[pageIndex]?.length || 0,
        pageIndex,
      };
    }
    const cols = Math.max(1, Number(options.folderCols.value) || 1);
    const rows = Math.max(1, Number(options.visibleFolderRowCount.value) || 1);
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / (rect.width / cols)), 0, cols - 1);
    const row = clamp(Math.floor(y / (rect.height / rows)), 0, rows - 1);
    return { index: row * cols + col, pageIndex };
  }

  function getTopLevelTargetById(targetId: string | null | undefined): TopLevelTarget | null {
    if (!activeDrag || activeDrag.item.type === "folder" || !targetId) return null;
    if (activeDrag.group.draggedIds.includes(targetId)) return null;
    const found = options.findTopLevel(options.pages.value, targetId);
    if (!found?.item) return null;
    const isSourceFolderReentryTarget = activeDrag.group.returnedFromFolder &&
      isFolderPointerSource(activeDrag.source) &&
      activeDrag.source.folderId === targetId;
    const stableRect = hasNavigatedDesktopPage() || isSourceFolderReentryTarget
      ? getStableTopLevelRect(targetId)
      : null;
    const rect = stableRect || getRenderedFolderRect(targetId) ||
      getRenderedLaunchRect({
        area: "desktop",
        id: targetId,
        pageIndex: found.pageIndex,
      }) ||
      options.iconBoundsRegistry.getBounds(
        BOUNDS_KIND.TOP_LEVEL,
        BOUNDS_VARIANT.RENDERED,
        targetId
      );
    return rect ? { ...found, rect } : null;
  }

  function getTargetIntentRect(target: TopLevelTarget | null | undefined): LaunchpadDragRect | null {
    const safeRect = cloneRect(target?.rect);
    if (!safeRect || safeRect.width <= 0 || safeRect.height <= 0) return null;
    if (target?.item?.type === "app") return safeRect;
    return makeCenteredRect(
      safeRect,
      Math.min(safeRect.width, FOLDER_HIT_INTENT_MAX_SIZE),
      Math.min(safeRect.height, FOLDER_HIT_INTENT_MAX_SIZE)
    );
  }

  function getTargetStickyRect(target: TopLevelTarget | null | undefined): LaunchpadDragRect | null {
    const intentRect = getTargetIntentRect(target);
    return intentRect ? expandRect(intentRect, FOLDER_HOVER_STICKY_MARGIN) : null;
  }

  function lockTopLevelTarget(target: TopLevelTarget | null): void {
    const stickyRect = getTargetStickyRect(target);
    if (!activeDrag?.group || !target?.item?.id || !stickyRect) return;
    activeDrag.group.lockedTarget = {
      rect: cloneRect(target.rect),
      stickyRect: cloneRect(stickyRect),
      targetId: target.item.id,
      targetType: target.item.type,
    };
  }

  function getLockedTopLevelTarget(point: LaunchpadDragPoint): (TopLevelTarget & { locked: true }) | null {
    const locked = activeDrag?.group?.lockedTarget;
    if (!locked?.targetId) return null;
    if (isPointInsideSnapshottedDesktopSource(point)) {
      clearLockedTarget();
      return null;
    }
    const target = getTopLevelTargetById(locked.targetId);
    if (!target) {
      clearLockedTarget();
      return null;
    }
    const stickyRect = getTargetStickyRect(target) || locked.stickyRect;
    locked.stickyRect = cloneRect(stickyRect);
    locked.rect = cloneRect(target.rect);
    if (!stickyRect || !isPointInsideRect(stickyRect, point.x, point.y)) {
      clearLockedTarget();
      return null;
    }
    return { ...target, locked: true };
  }

  function getTopLevelTargetAtPoint(point: LaunchpadDragPoint | null): TopLevelTarget | null {
    if (!activeDrag || activeDrag.item.type === "folder" || !point) return null;
    const selectedIds = new Set(activeDrag.group.draggedIds);
    if (isPointInsideSnapshottedDesktopSource(point)) return null;
    if (!hasNavigatedDesktopPage()) {
      const hit = options.iconBoundsRegistry.getAtPoint(
        BOUNDS_KIND.TOP_LEVEL,
        point.x,
        point.y,
        { excludeId: activeDrag.group.leadId }
      );
      if (hit?.id && !selectedIds.has(hit.id)) {
        const found = options.findTopLevel(options.pages.value, hit.id);
        if (found) return { ...found, rect: hit.rect };
      }
    }

    const dragRect = getDragVisualRect();
    const pageIndex = getVisualDesktopPageIndex();
    const page = options.pages.value[pageIndex] || [];
    for (let index = 0; index < page.length; index += 1) {
      const item = page[index];
      if (!item?.id || selectedIds.has(item.id)) continue;
      const target = getTopLevelTargetById(item.id);
      if (!target) continue;
      const candidateRect = expandRect(target.rect, FOLDER_HIT_CANDIDATE_MARGIN);
      if (
        isPointInsideRect(target.rect, point.x, point.y) ||
        rectsIntersect(candidateRect, dragRect)
      ) {
        return target;
      }
    }
    return null;
  }

  function isTargetIntentAccepted(
    target: TopLevelTarget | null,
    point: LaunchpadDragPoint | null,
  ): boolean {
    const intentRect = getTargetIntentRect(target);
    return Boolean(intentRect && point && isPointInsideRect(intentRect, point.x, point.y));
  }

  function makeFolderHoverSession(
    target: TopLevelTarget | null,
    plan: LaunchpadDragPlan,
  ): FolderHoverSession {
    return {
      group: activeDrag?.group || null,
      hoverStateKey: dragFolderHoverState.value?.key || null,
      plan,
      targetId: target?.item?.id || null,
      targetType: target?.item?.type || null,
    };
  }

  function clearFolderHoverSession(session: FolderHoverSession | null | undefined): void {
    const drag = activeDrag;
    if (
      !drag ||
      !session ||
      drag.group !== session.group ||
      drag.group.pendingOpenFolderId !== session.targetId ||
      dragFolderHoverState.value?.key !== session.hoverStateKey
    ) return;
    clearPendingTarget();
  }

  function getActiveFolderHoverTarget(
    session: FolderHoverSession | null | undefined,
  ): TopLevelTarget | null {
    const drag = activeDrag;
    const group = drag?.group;
    if (
      !session?.targetId ||
      !group ||
      group !== session.group ||
      group.pendingOpenFolderId !== session.targetId ||
      dragFolderHoverState.value?.key !== session.hoverStateKey ||
      group.lastPlan !== session.plan ||
      group.planRevision !== options.getGroupLayoutRevision()
    ) return null;
    const target = getTopLevelTargetById(session.targetId);
    const point = getPointerCenter(drag) || drag.pointer;
    const stickyRect = getTargetStickyRect(target);
    if (
      !target ||
      target.item.type !== session.targetType ||
      !point ||
      !stickyRect ||
      !isPointInsideRect(stickyRect, point.x, point.y)
    ) return null;
    return target;
  }

  function requireActiveFolderHoverTarget(session: FolderHoverSession): TopLevelTarget | null {
    const target = getActiveFolderHoverTarget(session);
    if (!target) clearFolderHoverSession(session);
    return target;
  }

  function discardProvisionalApplicationFolder(
    group: LaunchpadDragGroup | null | undefined = activeDrag?.group,
  ): boolean {
    if (!group) return false;
    const provisional = group.provisionalFolder;
    if (!provisional?.folderId || group.didCommit) return false;
    if (options.openFolderId.value === provisional.folderId) {
      const discarded = options.discardProvisionalFolder(provisional.folderId, {
        previewSlotIndex: 0,
        projectedPages: provisional.projectedPages,
        reducedMotion: prefersReducedMotion(),
        targetIndex: provisional.target.index,
        targetItem: provisional.target.item,
        targetPageIndex: provisional.target.pageIndex,
        targetRect: cloneRect(provisional.target.rect),
      });
      if (discarded !== true) {
        throw new Error(`Failed to discard provisional folder ${provisional.folderId}`);
      }
    }
    if (group.folderTransit?.folderId === provisional.folderId) group.folderTransit = null;
    group.provisionalFolder = null;
    group.projectedPages = null;
    projectedPages.value = null;
    group.projectionRefreshIntentKey = null;
    return true;
  }

  function leaveFolderTransit(): boolean {
    const group = activeDrag?.group;
    if (!group) return false;
    const transit = group.folderTransit;
    if (!transit?.folderId || options.openFolderId.value !== transit.folderId) return false;
    const isProvisionalCreate = group.provisionalFolder?.folderId === transit.folderId;
    clearPendingTarget();
    clearFolderPageTurn();
    if (isProvisionalCreate) discardProvisionalApplicationFolder(group);
    group.returnedFromFolder = true;
    group.folderTransit = null;
    group.projectedPages = null;
    projectedPages.value = null;
    group.projectionRefreshIntentKey = null;
    if (!isProvisionalCreate) {
      options.commitOpenFolder(null, {
        excludeCloseGhostIds: group.draggedIds,
      });
    }
    return true;
  }

  function syncFolderTransit(
    clientX: number,
    clientY: number,
    syncOptions: Readonly<{ finalize?: boolean }> = {},
  ): "awaiting-entry" | "desktop" | "inside" | "none" | "provisional-target" {
    const group = activeDrag?.group;
    if (!group) return "none";
    const transit = group.folderTransit;
    if (!transit?.folderId || options.openFolderId.value !== transit.folderId) return "none";
    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect?.();
    const inside = Boolean(rect && isPointInsideRect(rect, clientX, clientY));
    if (inside) {
      transit.hasEnteredPanel = true;
      return "inside";
    }
    if (!transit.hasEnteredPanel) {
      const provisional = group.provisionalFolder?.folderId === transit.folderId
        ? group.provisionalFolder
        : null;
      const provisionalTarget = provisional?.target || null;
      const point = getPointerCenter() || { x: clientX, y: clientY };
      const stickyRect = getTargetStickyRect(provisionalTarget);
      if (provisionalTarget && (!stickyRect || !isPointInsideRect(stickyRect, point.x, point.y))) {
        leaveFolderTransit();
        return "desktop";
      }
      if (syncOptions.finalize !== true) return "awaiting-entry";
      if (provisional) return "provisional-target";
    }
    leaveFolderTransit();
    return "desktop";
  }

  function resolveDropIntent(
    clientX: number,
    clientY: number,
    resolveOptions: Readonly<{ finalize?: boolean }> = {},
  ): ResolvedDropIntent {
    const drag = activeDrag;
    if (!drag) throw new Error("Cannot resolve a drop intent without an active drag");
    const point = getPointerCenter() || { x: clientX, y: clientY };
    const transitPhase = syncFolderTransit(clientX, clientY, resolveOptions);
    if (transitPhase === "provisional-target") {
      const provisional = drag.group.provisionalFolder;
      if (!provisional) {
        throw new Error("Provisional folder transit lost its release projection");
      }
      const folder = findFolderInPages(provisional.projectedPages, provisional.folderId);
      if (!folder) {
        throw new Error(`Provisional folder ${provisional.folderId} is missing from its release projection`);
      }
      const index = getFolderChildrenPages(folder).flatMap((page) => page || []).length;
      return {
        fallbackPoint: point,
        intent: {
          folderId: provisional.folderId,
          folderPageIndex: 0,
          index,
          type: "folder-slot",
        },
        locked: false,
        target: null,
      };
    }
    if (transitPhase === "awaiting-entry") {
      const pageIndex = getVisualDesktopPageIndex();
      const pageRect = getPageRect(pageIndex);
      if (pageRect && !isPointInsideRect(pageRect, point.x, point.y)) {
        return {
          fallbackPoint: point,
          intent: { reason: "invalid-target", type: "invalid" },
          locked: false,
          target: null,
        };
      }
      return {
        fallbackPoint: point,
        intent: {
          index: calcDesktopInsertIndex(point.x, point.y, pageIndex),
          pageIndex,
          type: "desktop-slot",
        },
        locked: false,
        target: null,
      };
    }
    const openFolderId = options.openFolderId.value;
    if (openFolderId && drag.item.type !== "folder") {
      const panel = getDomRefElement(options.folderPanelRef.value);
      const panelRect = panel?.getBoundingClientRect?.() || null;
      if (!panelRect || isPointInsideRect(panelRect, clientX, clientY)) {
        clearLockedTarget();
        const target = calcFolderInsertIndex(clientX, clientY);
        return {
          fallbackPoint: point,
          intent: {
            folderId: openFolderId,
            folderPageIndex: target.pageIndex,
            index: target.index,
            type: "folder-slot",
          },
          locked: false,
          target: null,
        };
      }
    }

    const lockedTarget = getLockedTopLevelTarget(point);
    if (lockedTarget) {
      return {
        fallbackPoint: centerRect(lockedTarget.rect, point),
        intent: lockedTarget.item.type === "folder"
          ? { folderId: lockedTarget.item.id, type: "folder-thumbnail" }
          : { targetAppId: lockedTarget.item.id, type: "application" },
        locked: true,
        target: lockedTarget,
      };
    }

    const target = getTopLevelTargetAtPoint(point);
    if (target && isTargetIntentAccepted(target, point)) {
      return {
        fallbackPoint: centerRect(target.rect, point),
        intent: target.item.type === "folder"
          ? { folderId: target.item.id, type: "folder-thumbnail" }
          : { targetAppId: target.item.id, type: "application" },
        locked: false,
        target,
      };
    }

    const pageIndex = getVisualDesktopPageIndex();
    const pageRect = getPageRect(pageIndex);
    if (!isInsideDesktopDropRegion(point.x, point.y, pageRect)) {
      return {
        fallbackPoint: point,
        intent: { reason: "invalid-target", type: "invalid" },
        locked: false,
        target,
      };
    }
    return {
      fallbackPoint: point,
      intent: {
        index: calcDesktopInsertIndex(point.x, point.y, pageIndex),
        pageIndex,
        type: "desktop-slot",
      },
      locked: false,
      target,
    };
  }

  function makePlan(intent: LaunchpadDragIntent): LaunchpadDragPlan {
    const group = activeDrag?.group;
    if (!group) throw new Error("Cannot plan a drop without an active drag");
    const semanticIntent = group.provisionalFolder?.folderId &&
      intent?.type === "folder-slot" &&
      intent.folderId === group.provisionalFolder.folderId
      ? group.provisionalFolder.semanticIntent
      : intent;
    return normalizePlannerResult(options.planGroupTransfer({
      basePages: toGroupTransferPages(group.basePages),
      baseRevision: group.baseRevision,
      createdFolderId: group.createdFolderId,
      currentRevision: options.getGroupLayoutRevision(),
      draggedIds: group.draggedIds,
      intent: semanticIntent,
      leadId: group.leadId,
      selectionRevision: group.selectionRevision,
      standalone: group.standalone,
    }));
  }

  function makeProvisionalApplicationFolderProjection(
    plan: LaunchpadDragPlan,
    targetAppId: string | null | undefined,
  ): LaunchpadPages | null {
    const folderId = plan?.effects?.createdFolderId;
    if (plan?.status !== "accepted" || !folderId || !targetAppId) return null;
    const projection = options.clonePages(plan.nextPages);
    const folder = findFolderInPages(projection, folderId);
    const targetApp = getFolderChildrenPages(folder)
      .flatMap((page) => page || [])
      .find((item) => item?.id === targetAppId && item.type === "app");
    if (!folder || !targetApp) return null;
    folder.childPages = [[cloneLaunchpadApp(options.cloneItem, targetApp)]];
    return projection;
  }

  function openProvisionalApplicationFolder(
    target: ApplicationTopLevelTarget,
    plan: LaunchpadDragPlan,
  ): boolean {
    const group = activeDrag?.group;
    const folderId = plan?.effects?.createdFolderId;
    const projection = makeProvisionalApplicationFolderProjection(plan, target?.item?.id);
    if (!group || !folderId || !projection || group.pendingOpenFolderId !== target.item.id) return false;
    group.pendingOpenFolderId = null;
    group.provisionalFolder = {
      folderId,
      projectedPages: projection,
      semanticIntent: { targetAppId: target.item.id, type: "application" },
      target: {
        index: target.index,
        item: cloneLaunchpadApp(options.cloneItem, target.item),
        pageIndex: target.pageIndex,
        rect: { ...target.rect },
      },
    };
    group.folderTransit = {
      folderId,
      hasEnteredPanel: false,
      origin: "create",
    };
    group.projectedPages = projection;
    projectedPages.value = projection;
    publishGroupState();
    const originGeometry = options.getFolderCreateMotionGeometry?.(target.item.id, folderId) || null;
    options.commitOpenFolder(folderId, originGeometry ? { originGeometry } : undefined);
    return true;
  }

  function publishTarget(
    target: TopLevelTarget | null,
    plan: LaunchpadDragPlan,
    resolved: ResolvedDropIntent | null = null,
  ): void {
    const drag = activeDrag;
    if (!drag) throw new Error("Cannot publish a drop target without an active drag");
    const isTopLevelIntent = resolved?.intent.type === "application" ||
      resolved?.intent.type === "folder-thumbnail";
    const isSameFolderReentryHover = plan?.status === "noop" &&
      resolved?.intent?.type === "folder-thumbnail" &&
      target?.item?.type === "folder" &&
      drag.group.returnedFromFolder === true &&
      isFolderPointerSource(drag.source) &&
      drag.source.folderId === target.item.id;
    if (!target || !isTopLevelIntent || (plan.status !== "accepted" && !isSameFolderReentryHover)) {
      clearPendingTarget();
      return;
    }
    clearPageTurn();
    clearFolderPageTurn();
    const previousTargetId = drag.group.lockedTarget?.targetId;
    if (previousTargetId && previousTargetId !== target.item.id) {
      drag.group.pendingOpenFolderId = null;
      clearFolderHoverTimers();
    }
    lockTopLevelTarget(target);
    dragFolderTargetId.value = target.item.id;
    const phase = dragFolderHoverState.value?.targetId === target.item.id
      ? dragFolderHoverState.value.phase
      : "hover";
    if (dragFolderHoverState.value?.targetId !== target.item.id) {
      hoverKey += 1;
      dragFolderHoverState.value = {
        key: `group-target-${hoverKey}`,
        phase,
        startedAt: Date.now(),
        targetId: target.item.id,
        targetType: target.item.type,
      };
    }
    if (target.item.type === "app") {
      if (
        drag.group.pendingOpenFolderId === target.item.id ||
        drag.group.provisionalFolder?.target?.item?.id === target.item.id
      ) return;
      clearFolderHoverTimers();
      drag.group.pendingOpenFolderId = target.item.id;
      const hoverSession = makeFolderHoverSession(target, plan);
      folderHoverFlashTimer = window.setTimeout(() => {
        folderHoverFlashTimer = null;
        if (!requireActiveFolderHoverTarget(hoverSession)) return;
        const hoverState = dragFolderHoverState.value;
        if (!hoverState) return;
        dragFolderHoverState.value = {
          ...hoverState,
          phase: "flash",
        };
        publishGroupState();
      }, GROUP_APP_FOLDER_HOVER_SETTLE_MS);
      folderHoverOpeningTimer = window.setTimeout(() => {
        folderHoverOpeningTimer = null;
        if (!requireActiveFolderHoverTarget(hoverSession)) return;
        const hoverState = dragFolderHoverState.value;
        if (!hoverState) return;
        dragFolderHoverState.value = {
          ...hoverState,
          phase: "opening",
        };
        publishGroupState();
      }, GROUP_APP_FOLDER_HOVER_OPENING_MS);
      folderHoverTimer = window.setTimeout(() => {
        folderHoverTimer = null;
        const latestTarget = requireActiveFolderHoverTarget(hoverSession);
        if (!latestTarget) return;
        if (latestTarget.item.type !== "app") return;
        openProvisionalApplicationFolder(
          { ...latestTarget, item: latestTarget.item },
          plan,
        );
      }, GROUP_APP_FOLDER_HOVER_OPEN_MS);
      return;
    }
    if (options.openFolderId.value === target.item.id) {
      drag.group.pendingOpenFolderId = null;
      clearFolderHoverTimers();
      return;
    }
    if (
      drag.group.pendingOpenFolderId === target.item.id ||
      drag.group.folderTransit?.folderId === target.item.id
    ) return;
    clearFolderHoverTimers();
    drag.group.pendingOpenFolderId = target.item.id;
    const hoverSession = makeFolderHoverSession(target, plan);
    folderHoverFlashTimer = window.setTimeout(() => {
      folderHoverFlashTimer = null;
      if (!requireActiveFolderHoverTarget(hoverSession)) return;
      const hoverState = dragFolderHoverState.value;
      if (!hoverState) return;
      dragFolderHoverState.value = {
        ...hoverState,
        phase: "flash",
      };
      publishGroupState();
    }, GROUP_FOLDER_HOVER_FLASH_MS);
    folderHoverTimer = window.setTimeout(() => {
      folderHoverTimer = null;
      const latestTarget = requireActiveFolderHoverTarget(hoverSession);
      if (!latestTarget) return;
      const hoverState = dragFolderHoverState.value;
      if (!hoverState) return;
      drag.group.pendingOpenFolderId = null;
      drag.group.folderTransit = {
        folderId: latestTarget.item.id,
        hasEnteredPanel: false,
        origin: "auto",
      };
      dragFolderHoverState.value = {
        ...hoverState,
        phase: "opening",
      };
      options.commitOpenFolder(latestTarget.item.id);
    }, GROUP_FOLDER_HOVER_OPEN_MS);
  }

  function publishDebug(resolved: ResolvedDropIntent, plan: LaunchpadDragPlan): void {
    const drag = activeDrag;
    if (!drag) throw new Error("Cannot publish drag diagnostics without an active drag");
    debugKey += 1;
    dragHitDebugState.value = {
      active: true,
      key: `group-drag-debug-${debugKey}`,
      phase: drag.group.phase,
      pointer: { ...drag.pointer },
      reason: plan.reason || plan.status,
      source: drag.source,
      target: resolved.target
        ? {
          id: resolved.target.item.id,
          rect: cloneRect(resolved.target.rect),
          type: resolved.target.item.type,
        }
        : null,
      winner: plan.status === "accepted" ? resolved.intent.type : "rejected",
    };
  }

  function evaluateIntent(
    optionsArg: IntentEvaluationOptions = {},
  ): Readonly<{ plan: LaunchpadDragPlan; resolved: ResolvedDropIntent }> | null {
    intentTimer = null;
    const drag = activeDrag;
    if (!drag || options.isLaunchpadInteractionBlocked()) return null;
    const group = drag.group;
    const resolved = resolveDropIntent(drag.pointer.x, drag.pointer.y, {
      finalize: optionsArg.finalizeFolderTransit === true,
    });
    const nextIntentKey = intentKey(resolved.intent);
    let plan = group.lastPlan;
    if (
      !plan ||
      optionsArg.force === true ||
      group.intentKey !== nextIntentKey ||
      group.planRevision !== options.getGroupLayoutRevision()
    ) {
      plan = makePlan(resolved.intent);
      group.intentKey = nextIntentKey;
      group.lastPlan = plan;
      group.planRevision = options.getGroupLayoutRevision();
    }
    group.intent = resolved.intent;
    group.lastResolved = resolved;
    updateLayoutProjection(group, resolved.intent, plan);
    const canRefreshProjectedLayout = plan.status === "accepted" &&
      ["desktop-slot", "folder-slot"].includes(resolved.intent?.type);
    if (canRefreshProjectedLayout) {
      if (group.projectionRefreshIntentKey !== nextIntentKey) {
        group.projectionRefreshIntentKey = nextIntentKey;
        nextTick(() => {
          if (
            activeDrag?.group !== group ||
            !isInteractiveGroupTransferPhase(group.phase)
          ) return;
          evaluateIntent({ force: true });
        });
      }
    } else {
      group.projectionRefreshIntentKey = null;
    }
    group.phase = drag.hasMoved
      ? GROUP_TRANSFER_PHASE.DRAGGING
      : GROUP_TRANSFER_PHASE.GATHERING;
    publishTarget(resolved.target, plan, resolved);
    publishDebug(resolved, plan);
    publishGroupState();
    return { plan, resolved };
  }

  function scheduleIntentEvaluation(): void {
    clearIntentTimer();
    intentTimer = window.setTimeout(evaluateIntent, GROUP_DROP_INTENT_DELAY_MS);
  }

  function scheduleDesktopPageTurn(clientX: number, clientY: number): void {
    const direction = getDesktopPageTurnDirection(clientX, clientY);
    const currentIndex = getVisualDesktopPageIndex();
    const targetIndex = currentIndex + direction;
    const createsPage = targetIndex === options.pages.value.length;
    const canCreatePage = createsPage &&
      currentIndex === options.pages.value.length - 1 &&
      makePlan({
        index: 0,
        pageIndex: targetIndex,
        type: "desktop-slot",
      }).status === "accepted";
    if (
      !direction ||
      targetIndex < 0 ||
      targetIndex > options.pages.value.length ||
      (createsPage && !canCreatePage)
    ) {
      clearPageTurn();
      return;
    }
    if (pageTurnTimer?.targetIndex === targetIndex) return;
    clearPageTurn();
    pageTurnTimer = {
      targetIndex,
      timer: window.setTimeout(() => {
        const pending = pageTurnTimer;
        pageTurnTimer = null;
        if (!activeDrag || !pending) return;
        activeDrag.group.desktopPageIndex = pending.targetIndex;
        if (pending.targetIndex < options.pages.value.length) {
          options.commitPageIndex(pending.targetIndex);
        }
        activeDrag.group.intentKey = null;
        evaluateIntent({ force: true });
      }, PAGE_TURN_DELAY),
    };
  }

  function getFolderPageTurnGeometry(): Readonly<{
    panelRect: LaunchpadDragRect;
    viewportRect: LaunchpadDragRect;
  }> | null {
    const viewport = getDomRefElement(options.folderViewportRef?.value);
    const panel = getDomRefElement(options.folderPanelRef?.value);
    const viewportRect = viewport?.getBoundingClientRect?.() ||
      getFolderPageRect(Number(options.folderPageIndex.value) || 0) ||
      null;
    const panelRect = panel?.getBoundingClientRect?.() || viewportRect;
    if (!viewportRect || !panelRect) return null;
    return { panelRect, viewportRect };
  }

  function scheduleFolderPageTurn(clientX: number, clientY: number): void {
    const geometry = getFolderPageTurnGeometry();
    const point = { x: clientX, y: clientY };
    if (!geometry) {
      disarmFolderPageTurn();
      return;
    }
    const { panelRect, viewportRect } = geometry;
    const verticalRect = {
      bottom: viewportRect.bottom,
      height: viewportRect.bottom - viewportRect.top,
      left: panelRect.left,
      right: panelRect.right,
      top: viewportRect.top,
      width: panelRect.right - panelRect.left,
    };
    if (!isPointInsideRect(verticalRect, point.x, point.y)) {
      disarmFolderPageTurn();
      return;
    }
    const edgeSize = Math.min(
      FOLDER_PAGE_EDGE_MAX_SIZE,
      Math.max(FOLDER_PAGE_EDGE_MIN_SIZE, viewportRect.width * FOLDER_PAGE_EDGE_RATIO)
    );
    const leftInnerEdge = viewportRect.left + edgeSize;
    const rightInnerEdge = viewportRect.right - edgeSize;
    const direction = point.x <= leftInnerEdge
      ? -1
      : point.x >= rightInnerEdge
        ? 1
        : 0;

    if (folderPageTurnState.phase === "latched") {
      const neutralLeft = leftInnerEdge + FOLDER_PAGE_EDGE_NEUTRAL_INSET;
      const neutralRight = rightInnerEdge - FOLDER_PAGE_EDGE_NEUTRAL_INSET;
      if (point.x > neutralLeft && point.x < neutralRight) {
        disarmFolderPageTurn();
      }
      return;
    }

    if (folderPageTurnState.phase === "armed") {
      if (direction === folderPageTurnState.direction) return;
      disarmFolderPageTurn();
    }
    if (!direction) return;
    const folderId = options.openFolderId.value;
    if (!folderId) {
      disarmFolderPageTurn();
      return;
    }

    const currentIndex = Math.max(0, Number(options.folderPageIndex.value) || 0);
    const maxIndex = Math.max(0, options.folderPages.value.length - 1);
    const targetIndex = currentIndex + direction;
    const allowCreate = targetIndex === maxIndex + 1 &&
      makePlan({
        folderId,
        folderPageIndex: targetIndex,
        index: 0,
        type: "folder-slot",
      }).status === "accepted";
    if (targetIndex < 0 || targetIndex > maxIndex + 1 || (targetIndex > maxIndex && !allowCreate)) {
      disarmFolderPageTurn();
      return;
    }

    const armedState: Extract<FolderPageTurnState, { phase: "armed" | "latched" }> = {
      allowCreate,
      direction,
      fromIndex: currentIndex,
      phase: "armed",
      targetIndex,
      timer: null,
    };
    armedState.timer = window.setTimeout(() => {
      const drag = activeDrag;
      if (!drag || folderPageTurnState !== armedState || options.openFolderId.value !== folderId) return;
      const token = options.requestFolderPageTurn?.(armedState.targetIndex, {
        allowCreate: armedState.allowCreate,
        folderId,
        phase: "open",
        source: "group-drag",
      });
      const committed = token != null
        ? options.commitFolderPageTurnRequest?.(token, {
          allowCreate: armedState.allowCreate,
          folderId,
          phase: "open",
        })
        : false;
      if (!committed) {
        options.commitFolderPageIndex(armedState.targetIndex, {
          allowCreate: armedState.allowCreate,
        });
      }
      if (activeDrag !== drag) return;
      if (armedState.allowCreate) drag.group.virtualFolderPageIndex = armedState.targetIndex;
      folderPageTurnState = {
        ...armedState,
        phase: "latched",
        timer: null,
      };
      drag.group.intentKey = null;
      evaluateIntent({ force: true });
    }, PAGE_TURN_DELAY);
    folderPageTurnState = armedState;
  }

  function makeFolderCreateTargetEntry(
    plan: LaunchpadDragAcceptedPlan,
    resolved: ResolvedDropIntent,
  ): GroupTransferRuntimeSourceEntry | null {
    if (!plan?.effects?.createdFolderId) return null;
    const target = resolved?.intent?.type === "application"
      ? resolved.target
      : activeDrag?.group?.provisionalFolder?.target;
    if (!target?.item?.id || target.item.type !== "app" || !target.rect) return null;
    return {
      delayMs: 0,
      item: cloneLaunchpadApp(options.cloneItem, target.item),
      memberIds: [target.item.id],
      order: 0,
      origin: centerRect(target.rect, resolved.fallbackPoint),
      originKind: "folder-create-target",
      originScale: 1,
    };
  }

  function normalizeUncommittedNavigation(drag: ActiveDrag | null | undefined): void {
    const group = drag?.group;
    if (!group || group.didCommit) return;
    if (group.desktopPageIndex >= options.pages.value.length) {
      group.desktopPageIndex = options.pageIndex.value;
    }
    if (group.virtualFolderPageIndex != null) {
      const maxIndex = Math.max(0, options.folderPages.value.length - 1);
      options.commitFolderPageIndex(
        Math.min(Number(options.folderPageIndex.value) || 0, maxIndex),
        { allowCreate: false }
      );
      group.virtualFolderPageIndex = null;
    }
  }

  function beginReturnToOrigin({
    cancelSource = null,
    outcome,
    reason = null,
    keyPrefix,
  }: BeginReturnOptions): boolean {
    const drag = activeDrag;
    if (!drag?.group) return false;
    clearIntentTimer();
    clearPageTurn();
    clearFolderPageTurn();
    normalizeUncommittedNavigation(drag);
    discardProvisionalApplicationFolder(drag.group);
    drag.group.cancelArmed = false;
    drag.group.cancelSource = cancelSource;
    drag.group.phase = GROUP_TRANSFER_PHASE.RETURNING;
    drag.group.outcome = outcome;
    drag.group.reason = reason;
    drag.group.projectedPages = null;
    projectedPages.value = null;
    const releaseKey = `${keyPrefix}-${groupKey}-${drag.group.leadId}`;
    updateGroupPresentation(drag, "return", { key: releaseKey });
    drag.group.settledActorKeys = [];
    drag.group.runtimeStatus = "pending";
    clearPendingTarget();
    publishGroupState();
    if (prefersReducedMotion()) {
      drag.group.visualCompleted = true;
      endDrag();
    }
    return true;
  }

  function rejectDrop(
    reason: string | null | undefined,
    optionsArg: Readonly<{ notify?: boolean }> = {},
  ): boolean {
    const drag = activeDrag;
    if (!drag) return false;
    const normalizedReason = reason || "invalid-target";
    if (!beginReturnToOrigin({
      outcome: GROUP_TRANSFER_OUTCOME.REJECTED,
      reason: normalizedReason,
      keyPrefix: "group-release-reject",
    })) return false;
    if (optionsArg.notify !== false && reason !== "same-placement") {
      options.onGroupDropRejected?.(normalizedReason, {
        standalone: drag.group.standalone,
      });
    }
    return true;
  }

  function cancelDrop(source: string = "unknown"): boolean {
    if (!canUserCancelDrag()) return false;
    return beginReturnToOrigin({
      cancelSource: String(source || "unknown"),
      outcome: GROUP_TRANSFER_OUTCOME.CANCELLED,
      reason: null,
      keyPrefix: "group-release-cancel",
    });
  }

  function returnNoop(reason = "same-placement"): boolean {
    return beginReturnToOrigin({
      outcome: GROUP_TRANSFER_OUTCOME.NOOP,
      reason,
      keyPrefix: "group-release-noop",
    });
  }

  function acceptDrop(
    plan: LaunchpadDragAcceptedPlan,
    resolved: ResolvedDropIntent,
  ): void {
    const drag = activeDrag;
    if (!drag) throw new Error("Cannot accept a drop without an active drag");
    const isProvisionalCreate = drag.group.provisionalFolder?.folderId === plan.effects?.createdFolderId;
    const folderCreateTargetEntry = makeFolderCreateTargetEntry(plan, resolved);
    if (
      folderCreateTargetEntry?.item?.id &&
      !drag.group.allEntries.some((entry) => entry?.item?.id === folderCreateTargetEntry.item.id)
    ) {
      drag.group.allEntries.push(folderCreateTargetEntry);
    }
    drag.group.phase = GROUP_TRANSFER_PHASE.COMMITTING;
    drag.group.outcome = GROUP_TRANSFER_OUTCOME.ACCEPTED;
    drag.group.reason = null;
    drag.group.semanticPlan = plan;
    if (!isProvisionalCreate) {
      drag.group.projectedPages = null;
      projectedPages.value = null;
    }
    updateGroupPresentation(drag, "release", {
      key: `group-release-${groupKey}-${drag.group.leadId}`,
      transferPlan: plan,
    });
    drag.group.settledActorKeys = [];
    drag.group.runtimeStatus = "pending";
    clearPendingTarget();
    publishGroupState();

    let committed;
    try {
      committed = options.commitGroupDrop(plan, {
        baseRevision: drag.group.baseRevision,
        draggedIds: drag.group.draggedIds,
        intent: drag.group.intent,
        selectionRevision: drag.group.selectionRevision,
        standalone: drag.group.standalone,
      });
    } catch (error) {
      endDrag();
      throw error;
    }
    if (committed === false) {
      drag.group.semanticPlan = null;
      rejectDrop("revision-stale");
      return;
    }
    drag.group.didCommit = true;
    if (isProvisionalCreate) {
      drag.group.projectedPages = null;
      projectedPages.value = null;
      drag.group.provisionalFolder = null;
      drag.group.folderTransit = null;
      drag.group.returnedFromFolder = false;
    }
    if (
      resolved.intent.type === "folder-slot" &&
      resolved.intent.folderId === options.openFolderId.value
    ) {
      const leadPlacement = plan.members?.find(
        (member) => member.id === drag.group.leadId && member.destination?.kind === "folder"
      );
      const leadDestination = leadPlacement?.destination;
      options.commitFolderPageIndex(
        leadDestination?.kind === "folder"
          ? leadDestination.folderPageIndex
          : resolved.intent.folderPageIndex,
        { allowCreate: false }
      );
      drag.group.virtualFolderPageIndex = null;
    } else {
      options.commitPageIndex(
        plan.effects?.finalDesktopPageIndex ?? drag.group.desktopPageIndex
      );
    }
    drag.group.phase = GROUP_TRANSFER_PHASE.RELEASING;
    // The release plan now owns the committed landing geometry.  Clear the
    // pre-release target before publishing the accepted frame so hover frames
    // and folder-create backdrops begin their exit in the same render as the
    // accepted drop, instead of waiting for the release ghosts to settle.
    publishGroupState();
  }

  function getGatherSourceRect(
    location: GroupTransferSourceLocation | null,
    activePageIndex: number,
    activeFolderPageIndex: number,
    openFolderId: string | null,
  ): LaunchpadDragRect | null {
    if (!location) return null;
    if (location.kind === "desktop") {
      return location.pageIndex === activePageIndex
        ? getRenderedLaunchRect({
          area: "desktop",
          id: location.item.id,
          pageIndex: location.pageIndex,
        })
        : null;
    }
    if (
      location.folderId === openFolderId &&
      location.folderPageIndex === activeFolderPageIndex
    ) {
      return getRenderedLaunchRect({
        area: "folder",
        folderId: location.folderId,
        id: location.item.id,
        pageIndex: location.folderPageIndex,
      });
    }
    if (location.ownerPageIndex !== activePageIndex) return null;
    if (location.flatIndex < 9) {
      const previewRect = options.iconBoundsRegistry.getBounds(
        BOUNDS_KIND.PREVIEW_CHILD,
        BOUNDS_VARIANT.RENDERED,
        {
          childId: location.item.id,
          folderId: location.folderId,
          slotIndex: location.flatIndex,
        }
      );
      if (previewRect) return previewRect;
    }
    return getRenderedFolderRect(location.folderId);
  }

  function startCommittedGroupTransfer(request?: StartCommittedGroupTransferRequest): boolean {
    const plannerPlan = request?.plan;
    if (
      !request ||
      activeDrag ||
      pendingDragStart ||
      plannerPlan?.status !== "accepted" ||
      !plannerPlan.effects?.createdFolderId
    ) return false;
    const plan = normalizePlannerResult(plannerPlan);
    if (plan.status !== "accepted") {
      throw new Error("Accepted folder creation plan normalized into a rejected plan");
    }
    const createdFolderId = plan.effects.createdFolderId;
    if (!createdFolderId) {
      throw new Error("Accepted folder creation plan is missing its created folder id");
    }
    if (typeof request.commit !== "function") {
      throw new TypeError("startCommittedGroupTransfer requires commit");
    }
    const draggedIds = Array.from(new Set((request.draggedIds || []).filter(Boolean)));
    const leadId = request.leadId || draggedIds[0];
    if (!leadId) {
      throw new Error("Folder creation presentation requires a lead item");
    }
    const basePages = options.clonePages(request.basePages || options.pages.value);
    const sourceIndex = indexGroupTransferSources(toGroupTransferPages(basePages));
    const leadLocation = sourceIndex.apps.get(leadId) || null;
    const targetLocation = options.findTopLevel(plan.nextPages, createdFolderId);
    if (!draggedIds.length || !leadLocation || !targetLocation) {
      throw new Error("Folder creation presentation requires valid lead and target locations");
    }
    const activePageIndex = options.pageIndex.value;
    const activeFolderPageIndex = options.folderPageIndex.value;
    const openFolderId = options.openFolderId.value;
    const viewportRect = getPageRect(activePageIndex);
    const viewportCenter = viewportRect
      ? centerRect(viewportRect)
      : {
        x: (Number(globalThis.innerWidth) || 1) / 2,
        y: (Number(globalThis.innerHeight) || 1) / 2,
      };
    const leadRect = getGatherSourceRect(
      leadLocation,
      activePageIndex,
      activeFolderPageIndex,
      openFolderId
    );
    const pointer = centerRect(leadRect, viewportCenter);
    const iconExtent = Math.max(1, Number(options.iconSize.value) || Number(leadRect?.width) || 1);
    const startedAt = nowMs();
    groupKey += 1;
    activeDrag = {
      cellSize: null,
      compact: false,
      hasMoved: false,
      item: options.cloneItem(requireLaunchpadItem(leadLocation.item)),
      lastPointerTime: startedAt,
      offset: { x: iconExtent / 2, y: iconExtent / 2 },
      pointer,
      pointerId: null,
      singleLineLabel: false,
      size: { height: iconExtent, width: iconExtent },
      source: leadLocation,
      start: pointer,
      velocity: zeroVelocity(),
      group: {
        basePages,
        baseRevision: request.baseRevision,
        cancelArmed: false,
        cancelSource: null,
        createdFolderId,
        desktopPageIndex: targetLocation.pageIndex,
        didCommit: false,
        draggedIds,
        allEntries: [],
        dragEntries: [],
        intent: {
          anchorId: leadId,
          type: "toolbar-folder-create",
        },
        intentKey: null,
        key: `group-create-${groupKey}-${leadId}`,
        lastPlan: plan,
        leadId,
        onComplete: request.onComplete,
        origin: "toolbar",
        outcome: GROUP_TRANSFER_OUTCOME.ACCEPTED,
        phase: GROUP_TRANSFER_PHASE.COMMITTING,
        projectionRefreshIntentKey: null,
        projectedPages: null,
        reason: null,
        runtimePlan: null,
        runtimeEntries: null,
        settledActorKeys: [],
        runtimeStatus: null,
        semanticPlan: plan,
        selectionRevision: request.selectionRevision,
        shellActors: [],
        sourceMembers: [],
        standalone: false,
        trail: [],
        virtualFolderPageIndex: null,
        visualCompleted: false,
      },
    };
    const gatherPopulation = buildGatherPopulationFromSnapshot({
      activeFolderPageIndex,
      activePageIndex,
      draggedIds,
      leadId,
      leadRect,
      openFolderId,
      pages: basePages,
      pointer,
    });
    activeDrag.group.allEntries = gatherPopulation.allEntries;
    activeDrag.group.sourceMembers = gatherPopulation.sourceMembers;
    updateGroupPresentation(activeDrag, "gather");
    dragMeta.value = {
      draggedIds: [...draggedIds],
      item: activeDrag.item,
      source: activeDrag.source,
    };
    attachContextMenu();
    publishGroupState();

    let committed;
    try {
      committed = request.commit(plan);
    } catch (error) {
      endDrag();
      throw error;
    }
    if (committed === false) {
      endDrag();
      return false;
    }
    const drag = activeDrag;
    if (!drag) {
      throw new Error("Committed group transfer lost drag ownership during commit");
    }
    drag.group.didCommit = true;
    options.commitPageIndex(targetLocation.pageIndex);
    publishGroupState();
    nextTick(() => {
      if (activeDrag !== drag) return;
      drag.group.phase = GROUP_TRANSFER_PHASE.RELEASING;
      updateGroupPresentation(drag, "release", {
        key: `group-release-${groupKey}-${drag.group.leadId}`,
        transferPlan: plan,
      });
      drag.group.settledActorKeys = [];
      drag.group.runtimeStatus = "pending";
      publishGroupState();
    });
    return true;
  }

  function endDrag(): void {
    const ended = activeDrag?.group || null;
    discardProvisionalApplicationFolder(ended);
    detachContextMenu();
    cancelPreviewRaf();
    clearIntentTimer();
    clearPageTurn();
    clearFolderPageTurn();
    clearFolderHoverTimers();
    normalizeUncommittedNavigation(activeDrag);
    activeDrag = null;
    pendingDragStart = null;
    dragMeta.value = null;
    dragFolderHoverState.value = null;
    dragFolderTargetId.value = null;
    dragHitDebugState.value = null;
    groupDragState.value = null;
    projectedPages.value = null;
    scheduleLayoutProjectionRelease();
    if (ended) options.onGroupDragEnd?.(ended);
    if (ended?.visualCompleted) ended.onComplete?.();
  }

  function completeGroupRelease(result: CompleteGroupReleaseResult = {}): boolean {
    const drag = activeDrag;
    const group = drag?.group;
    const plan = group?.runtimePlan;
    if (!drag || !group || !plan) return false;
    if (result.planKey && result.planKey !== plan.key) return false;
    const entryId = result.entryId || result.id || null;
    if (!entryId) return false;
    const entry = plan.entries.find((candidate) => candidate.id === entryId) || null;
    const actorKey = result.actorKey || entry?.actorKey || null;
    if (!entry || !actorKey) return false;
    const expectedActorKeys = new Set(plan.entries.map((candidate) => candidate.actorKey));
    const settled = new Set(group.settledActorKeys || []);
    if (settled.has(actorKey)) return true;
    settled.add(actorKey);
    group.settledActorKeys = [...settled];
    if (result.outcome === "aborted") {
      group.outcome = GROUP_TRANSFER_OUTCOME.VISUAL_ABORTED;
      group.reason = result.reason || "target-unavailable";
      group.runtimeStatus = "visual-aborted";
      group.phase = GROUP_TRANSFER_PHASE.SETTLED;
      publishGroupState();
      endDrag();
      return true;
    }
    const allSettled = [...expectedActorKeys].every((key) => settled.has(key));
    if (!allSettled) {
      group.runtimeStatus = "running";
      publishGroupState();
      return true;
    }
    group.runtimeStatus = "settled";
    group.phase = GROUP_TRANSFER_PHASE.SETTLED;
    group.visualCompleted = true;
    publishGroupState();
    endDrag();
    return true;
  }

  function activatePreparedDrag(
    descriptor: PreparedDragDescriptor,
    deferred = false,
  ): void {
    if (deferred && pendingDragStart !== descriptor) return;
    if (pendingDragStart === descriptor) pendingDragStart = null;
    if (activeDrag || options.isLaunchpadInteractionBlocked()) return;
    const payload = descriptor.payload;
    if (options.onGroupDragStart?.(payload) === false) return;
    groupKey += 1;
    const startedAt = nowMs();
    activeDrag = {
      cellSize: descriptor.cellSize,
      compact: descriptor.dragVisualState?.compact === true,
      hasMoved: descriptor.startedFromMovement === true,
      item: descriptor.item,
      lastPointerTime: startedAt,
      offset: descriptor.offset,
      pointer: descriptor.startPoint,
      pointerId: descriptor.pointerId,
      singleLineLabel: descriptor.dragVisualState?.singleLineLabel === true,
      size: descriptor.size,
      source: descriptor.source,
      start: descriptor.anchorPoint || descriptor.startPoint,
      velocity: zeroVelocity(),
      group: {
        basePages: options.clonePages(options.pages.value),
        baseRevision: payload.layoutRevision,
        cancelArmed: false,
        cancelSource: null,
        createdFolderId: options.makeId("folder"),
        desktopSourceSnapshot: makeDesktopSourceSnapshot(payload.draggedIds),
        desktopPageIndex: options.pageIndex.value,
        didCommit: false,
        draggedIds: [...payload.draggedIds],
        folderTransit: descriptor.source.type === "folder" &&
          descriptor.source.folderId != null &&
          options.openFolderId.value === descriptor.source.folderId
          ? {
            folderId: descriptor.source.folderId,
            hasEnteredPanel: true,
            origin: "source",
          }
          : null,
        allEntries: [],
        dragEntries: [],
        intent: null,
        intentKey: null,
        key: `group-drag-${groupKey}-${payload.leadId}`,
        lastPlan: null,
        lastResolved: null,
        lockedTarget: null,
        leadId: payload.leadId,
        origin: "pointer",
        outcome: null,
        pendingOpenFolderId: null,
        phase: GROUP_TRANSFER_PHASE.GATHERING,
        planRevision: payload.layoutRevision,
        projectionRefreshIntentKey: null,
        projectedPages: null,
        provisionalFolder: null,
        presentationPlan: null,
        reason: null,
        runtimePlan: null,
        runtimeEntries: null,
        settledActorKeys: [],
        runtimeStatus: null,
        returnedFromFolder: false,
        semanticPlan: null,
        selectionRevision: payload.selectionRevision,
        shellActors: [],
        sourceMembers: [],
        standalone: payload.standalone === true,
        trail: appendGroupTrailPoint([], descriptor.startPoint, { timeMs: startedAt }),
        virtualFolderPageIndex: null,
      },
    };
    const gatherPopulation = buildGatherPopulation(descriptor, activeDrag);
    activeDrag.group.allEntries = gatherPopulation.allEntries;
    activeDrag.group.sourceMembers = gatherPopulation.sourceMembers;
    updateGroupPresentation(activeDrag, "gather");
    dragMeta.value = {
      draggedIds: [...activeDrag.group.draggedIds],
      item: activeDrag.item,
      source: activeDrag.source,
    };
    setLayoutProjectionActive(true);
    attachContextMenu();
    publishGroupState();
    evaluateIntent({ force: true });
  }

  function startDrag(
    event: LaunchpadDragPointerEvent,
    item: ReadonlyLaunchpadItem,
    source: LaunchpadDragSource,
    batchPayload: LaunchpadDragBatchPayload | null = null,
  ): boolean {
    const acceptsPointer = event?.type === "pointermove"
      ? isPrimaryPointerMoveEvent(event)
      : isPrimaryPointerStartEvent(event);
    if (
      !acceptsPointer ||
      !item?.id ||
      activeDrag ||
      pendingDragStart ||
      options.isLaunchpadInteractionBlocked()
    ) return false;
    const rect = event.currentTarget?.getBoundingClientRect?.();
    if (!rect) throw new TypeError("startDrag requires currentTarget.getBoundingClientRect()");
    if (typeof event.preventDefault !== "function" || typeof event.stopPropagation !== "function") {
      throw new TypeError("startDrag requires preventDefault() and stopPropagation()");
    }
    event.preventDefault();
    event.stopPropagation();
    clearLayoutProjectionRelease(true);
    const dragVisualState = event.dragVisualState || null;
    const iconSize = Math.max(1, Number(dragVisualState?.iconSize) || Number(rect.width) || 1);
    const visualLeft = rect.left + rect.width / 2 - iconSize / 2;
    const visualTop = rect.top + rect.height / 2 - iconSize / 2;
    const visualRect: LaunchpadDragRect = {
      bottom: visualTop + iconSize,
      height: iconSize,
      left: visualLeft,
      right: visualLeft + iconSize,
      top: visualTop,
      width: iconSize,
    };
    const startPoint = { x: Number(event.clientX), y: Number(event.clientY) };
    const dragAnchorX = event.dragAnchor?.x;
    const dragAnchorY = event.dragAnchor?.y;
    const anchorPoint = {
      x: Number.isFinite(Number(dragAnchorX))
        ? Number(dragAnchorX)
        : startPoint.x,
      y: Number.isFinite(Number(dragAnchorY))
        ? Number(dragAnchorY)
        : startPoint.y,
    };
    const payload = batchPayload?.draggedIds?.length
      ? { ...batchPayload, draggedIds: [...batchPayload.draggedIds], standalone: false }
      : {
        draggedIds: [item.id],
        layoutRevision: options.getGroupLayoutRevision(),
        leadId: item.id,
        selectionRevision: null,
        standalone: true,
      };
    const descriptor: PreparedDragDescriptor = {
      cellSize: dragVisualState?.cellWidth && dragVisualState?.cellHeight
        ? { height: dragVisualState.cellHeight, width: dragVisualState.cellWidth }
        : getSourceCellSize(source, rect),
      dragVisualState,
      item: options.cloneItem(item),
      offset: {
        x: anchorPoint.x - visualRect.left,
        y: anchorPoint.y - visualRect.top,
      },
      payload,
      pointerId: event.pointerId,
      rect: visualRect,
      size: { height: visualRect.height, width: visualRect.width },
      source,
      startedFromMovement: event.dragStartedFromThreshold === true,
      anchorPoint,
      startPoint,
    };
    if (options.isHomeRevealSettling.value) {
      options.finishHomeRevealSettleWindow();
      pendingDragStart = descriptor;
      nextTick(() => activatePreparedDrag(descriptor, true));
    } else {
      activatePreparedDrag(descriptor);
    }
    return true;
  }

  function updateDragPointer(event: LaunchpadDragPointerEvent): void {
    if (
      !activeDrag ||
      !isInteractiveGroupTransferPhase(activeDrag.group.phase) ||
      !isSamePointerEvent(activeDrag.pointerId, event) ||
      !isPrimaryPointerMoveEvent(event)
    ) return;
    if (typeof event.preventDefault !== "function") {
      throw new TypeError("updateDragPointer requires preventDefault()");
    }
    event.preventDefault();
    const sample = samplePointerVelocity({
      pointer: activeDrag.pointer,
      time: activeDrag.lastPointerTime,
      velocity: activeDrag.velocity,
    }, event);
    activeDrag.velocity = sample.velocity;
    activeDrag.lastPointerTime = sample.time;
    activeDrag.pointer = { x: Number(event.clientX), y: Number(event.clientY) };
    activeDrag.hasMoved = activeDrag.hasMoved ||
      Math.hypot(activeDrag.pointer.x - activeDrag.start.x, activeDrag.pointer.y - activeDrag.start.y) > POINTER_MOVE_THRESHOLD;
    if (activeDrag.hasMoved) activeDrag.group.phase = GROUP_TRANSFER_PHASE.DRAGGING;
    activeDrag.group.trail = appendGroupTrailPoint(
      activeDrag.group.trail,
      activeDrag.pointer,
      { timeMs: sample.time }
    );
    const folderTransitPhase = syncFolderTransit(activeDrag.pointer.x, activeDrag.pointer.y);
    const cancelArmed = syncBatchCancelZone();
    scheduleVisualPublish();
    if (cancelArmed) return;
    if (folderTransitPhase === "awaiting-entry") {
      clearPageTurn();
      clearFolderPageTurn();
      scheduleIntentEvaluation();
      return;
    }
    if (options.openFolderId.value) {
      clearPageTurn();
      scheduleFolderPageTurn(activeDrag.pointer.x, activeDrag.pointer.y);
    } else {
      clearFolderPageTurn();
      scheduleDesktopPageTurn(activeDrag.pointer.x, activeDrag.pointer.y);
    }
    scheduleIntentEvaluation();
  }

  function finishDrag(event: LaunchpadDragPointerEvent): void {
    if (pendingDragStart && isSamePointerEvent(pendingDragStart.pointerId, event)) {
      pendingDragStart = null;
      return;
    }
    if (!activeDrag || !shouldFinishDragForPointerEvent(activeDrag, event)) return;
    if (!isInteractiveGroupTransferPhase(activeDrag.group.phase)) {
      if (event.type === "pointercancel") endDrag();
      return;
    }
    if (event.type === "pointercancel" || options.isLaunchpadInteractionBlocked()) {
      endDrag();
      return;
    }
    const sample = samplePointerVelocity({
      pointer: activeDrag.pointer,
      time: activeDrag.lastPointerTime,
      velocity: activeDrag.velocity,
    }, event);
    activeDrag.velocity = sample.velocity;
    activeDrag.lastPointerTime = sample.time;
    activeDrag.pointer = { x: Number(event.clientX), y: Number(event.clientY) };
    if (syncBatchCancelZone()) {
      cancelDrop("drop-zone");
      return;
    }
    clearIntentTimer();
    let outcome = evaluateIntent({
      finalizeFolderTransit: true,
      force: true,
    });
    clearPageTurn();
    clearFolderPageTurn();
    clearFolderHoverTimers();
    if (!outcome || outcome.plan.status === "rejected") {
      const isUnavailableDesktopEdge =
        outcome?.plan?.reason === "invalid-target" &&
        !options.openFolderId.value &&
        getDesktopPageTurnDirection(activeDrag.pointer.x, activeDrag.pointer.y) !== 0;
      if (isUnavailableDesktopEdge) {
        returnNoop("navigation-edge");
        return;
      }
      rejectDrop(outcome?.plan?.reason || "invalid-target");
      return;
    }
    if (outcome.plan.status === "noop") {
      returnNoop(outcome.plan.reason || "same-placement");
      return;
    }
    acceptDrop(outcome.plan, outcome.resolved);
  }

  function cancelDrag(event: LaunchpadDragPointerEvent = {}): boolean {
    if (event.userInitiatedCancel === true) {
      return cancelDrop(event.cancelSource || "explicit");
    }
    finishDrag({ ...event, type: "pointercancel" });
    return true;
  }

  function disposeDrag(): void {
    pendingDragStart = null;
    if (activeDrag) endDrag();
    else detachContextMenu();
    clearLayoutProjectionRelease(true);
  }

  return {
    cancelDrag,
    cancelPreviewRaf,
    clearFolderPageTurn,
    clearLayoutProjectionRelease,
    clearPageTurn,
    clearPendingTarget,
    completeGroupRelease,
    disposeDrag,
    dragFolderHoverState,
    dragFolderTargetId,
    dragHitDebugState,
    dragMeta,
    finishDrag,
    groupDragState,
    isDragActive,
    startCommittedGroupTransfer,
    projectedPages,
    startDrag,
    updateDragPointer,
  };
}

export type LaunchpadDragControls = ReturnType<typeof createLaunchpadDrag>;
