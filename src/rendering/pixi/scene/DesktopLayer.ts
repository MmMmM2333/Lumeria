import { Container, Graphics } from "pixi.js";
import type { DestroyOptions } from "pixi.js";
import { PIXI_UI_FONT_FAMILY } from "../../typography.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { createPixiText } from "../pixiText.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { getDesktopGridMetrics } from "../geometry/gridGeometry.js";
import { clientRectToStageVisualRect, stageLayoutRecordToClientRect } from "../geometry/stageCoordinates.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import type { IconBoundsRegistry } from "../geometry/iconBoundsRegistry.js";
import type {
  StageLayoutRecord,
  StagePoint,
  StageRect,
} from "../geometry/stageCoordinates.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { motionSprings } from "../animation/motionPresets.js";
import { killMotionOf, motion } from "../animation/motionTween.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import type { MotionTarget, MotionVars } from "../animation/motionTween.js";
import { sceneDiagnosticsState } from "../../../diagnostics/sceneDiagnosticsState.js";
import { makeDesktopBoundsRegistration } from "./desktopBoundsRegistration.js";
import type { DesktopBoundsRegistration } from "./desktopBoundsRegistration.js";
import { resolveDesktopBoundsTargets, resolveFolderPreviewChildBoundsTargets } from "./desktopBoundsTargets.js";
import type {
  DesktopBoundsRegistrationProjection,
} from "./desktopBoundsTargets.js";
import { makeFolderThumbPreviewRect } from "./folderOverlayTargets.js";
import { makeSyntheticPointerEvent } from "./iconSceneHelpers.js";
import { FolderOverlayLayer } from "./FolderOverlayLayer.js";
import { FolderVisualCommitQueue } from "./folderVisualCommitQueue.js";
import {
  VisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
} from "./visualOwnershipRegistry.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { makeIconVisualSpecFromNodeState } from "./iconVisualSpec.js";
import { SingleStageDiagnosticsLayer } from "./singleStageDiagnostics.js";
import { GroupDragLayer } from "./GroupDragLayer.js";
import type {
  GroupDragGroup,
  GroupDragUpdateState,
} from "./GroupDragLayer.js";
import { ProvisionalFolderRollbackLayer } from "./ProvisionalFolderRollbackLayer.js";
import { DragHitDebugLayer } from "./DragHitDebugLayer.js";
import type { DragHitDebugSnapshot } from "./DragHitDebugLayer.js";
import { FolderDropTargetLayer } from "./FolderDropTargetLayer.js";
import { IconNode } from "../nodes/IconNode.js";
import type { IconNodeAction, IconNodeActionHandler } from "../nodes/IconNode.js";
import type { IconTextureRepository } from "../assets/iconTextureRepository.js";
import type {
  SceneDataRecord,
  SceneItem,
  SceneVisualTransform,
} from "../../sceneFrame.js";
import {
  getFolderHandoffDebugOptions,
  rectDelta,
  roundRect,
} from "./folderHandoffDebug.js";
import {
  cancelPageTrackMotion,
  createPageTrackMotionState,
  isPageTrackMotionActive,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";
import type { PageTrackMotionState } from "./pageTrackMotion.js";
import {
  buildDesktopRenderPlan,
  isLayoutTargetChanged,
  readNumber,
  resolveDesktopVisualAlpha,
  resolveLaunchpadVisualAlpha,
  resolveLaunchpadVisualTransform,
} from "./desktopRenderPlan.js";
import type {
  DesktopFolderGeometry,
  DesktopGroupDragState,
  DesktopItem,
  DesktopLayoutTarget,
  DesktopRect,
  DesktopRenderBoundsEntry,
  DesktopRenderEntry,
  DesktopRenderPlan,
  DesktopRenderPlanState,
} from "./desktopRenderPlan.js";
import type {
  DesktopDiagnosticsFrame,
  DesktopHandoffFrame,
  DesktopInteractionFrame,
  DesktopLayerFrameWork,
  DesktopStructureFrame,
  DesktopVisualFrame,
} from "./desktopLayerFrames.js";
import {
  captureDesktopHandoffObservation,
  getDesktopSourceGhostedIdsFromOwnership,
  hasFolderClosingHandoffId,
  isFolderOpeningSourceGhosted,
  isStaleHiddenFolderHandoffEntry,
  mergeFolderIdSets,
  shouldFinishFolderHandoff,
  shouldFinishFolderHandoffEntry,
} from "./desktopHandoffState.js";
import type {
  DesktopFolderHandoffState,
  DesktopHandoffObservation,
} from "./desktopHandoffState.js";
import type { ProvisionalFolderRollbackCompletion } from "./ProvisionalFolderRollbackLayer.js";

type PixiText = ReturnType<typeof createPixiText>;
type SpringConfig = Parameters<ReturnType<typeof motion>["spring"]>[0];
type GroupDragOwnershipGroup = NonNullable<
  Parameters<GroupDragLayer["syncVisualOwnership"]>[0]
>;

interface DesktopRenderCopy {
  newFolderName: string;
  searchEmpty: string;
}

interface DesktopLayerOptions {
  reuseSearchNodes?: boolean;
  iconBoundsRegistry: IconBoundsRegistry;
  iconTextures?: IconTextureRepository | undefined;
  onClosingFolderPointerDown?: ((folderId: string | null, event: unknown) => void) | undefined;
  onFolderGeometryChange?: ((geometry: unknown) => void) | undefined;
  onFolderInternalActivityChange?: ((active: boolean, folderId: string | null) => void) | undefined;
  onFolderOutsidePointerDown?: ((event: unknown) => void) | undefined;
  onFolderPanelPointerDown?: ((event: unknown) => void) | undefined;
  onFolderRenderRequest?: ((reason: string) => void) | undefined;
  onFolderTitleFrameChange?: ((frame: unknown) => void) | undefined;
  onGroupReleaseComplete?: ((payload: unknown) => void) | undefined;
  onIconAction?: IconNodeActionHandler | undefined;
  onProvisionalFolderRollbackComplete?: ((payload: ProvisionalFolderRollbackCompletion) => void) | undefined;
  renderCopy?: Readonly<{
    newFolderName?: unknown;
    searchEmpty?: unknown;
  }> | undefined;
  showFolderTitle?: boolean | undefined;
  visualCommitQueue?: FolderVisualCommitQueue | undefined;
  visualOwnership?: VisualOwnershipRegistry | undefined;
}

type DesktopIconNode = IconNode & {
  __folderSourceGhostedByOwnership?: boolean;
  __groupTransferGhostedByOwnership?: boolean;
  __groupTransferSuppressedFolderPreviewChildIds?: readonly string[];
  item: DesktopItem | null;
  stageRect?: StageRect;
};

interface DesktopHandoffCleanupFrame {
  cancelled: boolean;
}

interface DesktopFolderHandoffEntry extends Record<string, unknown> {
  cleanupFrame: DesktopHandoffCleanupFrame | null;
  folderId: string;
  labelRevealStarted: boolean;
  layoutTarget?: DesktopLayoutTarget;
  node: DesktopIconNode;
  originalIndex: number;
  suppressLabelReveal: boolean;
  visualHidden: boolean;
  visualReleased: boolean;
}

interface GroupOwnershipSnapshot {
  folderShellIds: ReadonlySet<string>;
  itemIds: ReadonlySet<string>;
}

interface ProvisionalFolderRollbackState {
  folderId: string;
  handoffVelocity?: unknown;
  phase: string;
  previewSlotIndex?: unknown;
  reducedMotion?: boolean;
  targetAppId: string;
  token: number;
}

type DesktopLayerState = DesktopStructureFrame & Readonly<{
  groupTransferOwnedFolderShellIds?: ReadonlySet<string>;
  groupTransferOwnedItemIds?: ReadonlySet<string>;
  isFolderOverlayActive?: boolean;
}>;

interface DesktopHandoffStateLike {
  folderClosingHandoffIds: ReadonlySet<string>;
  folderSourceGhostedIds: ReadonlySet<string>;
  isFolderOpeningPreviewFrameGhosted: (folderId: string) => boolean;
}

type DesktopGhostingState = DesktopFolderHandoffState & Readonly<{
  groupTransferOwnedFolderShellIds?: ReadonlySet<string>;
}>;

type DesktopVisualState = DesktopLayerState | DesktopVisualFrame;
type DesktopInteractionState = DesktopInteractionFrame & Readonly<{
  groupTransferOwnedFolderShellIds?: ReadonlySet<string>;
  groupTransferOwnedItemIds?: ReadonlySet<string>;
}>;
type DesktopInteractiveState = DesktopLayerState | DesktopInteractionState;
type DesktopDiagnosticsState = DesktopLayerState | DesktopDiagnosticsFrame;
type DesktopRenderEntryWithHandoff = Omit<DesktopRenderEntry, "effectiveFolderHandoffEntry"> & Readonly<{
  effectiveFolderHandoffEntry: DesktopFolderHandoffEntry | null;
}>;
type DesktopRenderPlanWithRevision = Omit<DesktopRenderPlan, "entries"> & Readonly<{
  entries: readonly DesktopRenderEntryWithHandoff[];
  revision: number;
}>;
type DesktopBoundsEntry = DesktopRenderBoundsEntry & Readonly<{ node: DesktopIconNode }>;

interface PointerOnlyPlanSnapshot {
  key: string;
  references: readonly unknown[];
}

interface DesktopPresentationGeometryCache {
  geometryById: Map<string, DesktopFolderGeometry> | null;
  version: number | null;
}

interface GroupSemanticAnchor {
  folderId?: string | null;
  folderPageIndex?: number | null;
  index?: number;
  itemId?: string | null;
  kind?: string | null;
  laneY?: number;
  pageIndex?: number | null;
  slotIndex?: number | null;
}

interface GroupReleaseTarget {
  area?: string;
  folderId?: string | null;
  id?: string | null;
  index?: number | null;
  kind?: string | null;
  pageIndex?: number | null;
  semanticAnchor?: GroupSemanticAnchor | null;
}

interface GroupReleaseEntry {
  id?: string;
  mode?: string;
  visibilityPolicy?: Readonly<{ folderId?: string | null; kind?: string }>;
}

type GroupReleaseNode = Container & Readonly<{
  iconSize?: number;
  visualWrap?: Container;
}>;

type ReleaseScaleTargetNode = Container & Readonly<{
  iconSize?: number;
  visualWrap?: Container;
}>;

interface GroupReleaseState {
  gridCols?: number;
  gridRows?: number;
  height?: number;
  stageRect?: StageRect;
  width?: number;
}

interface GroupReleaseRequest {
  entry?: GroupReleaseEntry;
  node?: GroupReleaseNode;
  state?: GroupReleaseState;
  target?: GroupReleaseTarget;
}

interface FolderHandoffOptions {
  resetVisual?: boolean;
  revealLabel?: boolean;
}

interface RestoreFolderHandoffOptions {
  fadeLabel?: boolean;
  suppressLabel?: boolean;
}

interface RevealFolderHandoffOptions {
  animate?: boolean;
}

interface FolderSourceGhostingOptions {
  handoffObservation?: DesktopHandoffObservation;
  remember?: boolean;
  visualOwnershipIds?: ReadonlySet<string>;
}

interface FolderHandoffDebugOptions {
  active?: boolean;
  clearing?: boolean;
  phase?: string;
  source?: string;
}

interface RectDeltaRow {
  delta?: Readonly<Record<keyof StageRect, number | null>> | null;
  slot?: number | string;
}

type DebugRect = Readonly<Record<keyof StageRect, number | null>>;

interface FolderDebugRow extends RectDeltaRow {
  actual: DebugRect | null;
  kind?: string;
  target: DebugRect | null;
}

interface FolderHandoffDebugEntry {
  folderId?: string | null;
  layoutTarget?: DesktopLayoutTarget | null;
  node?: DesktopIconNode | null;
  originalIndex?: number | null;
}

interface TransformSnapshotInput {
  alpha?: unknown;
  pivot?: Readonly<{ x?: unknown; y?: unknown }>;
  position?: Readonly<{ x?: unknown; y?: unknown }>;
  scale?: Readonly<{ x?: unknown; y?: unknown }>;
  visible?: unknown;
  x?: unknown;
  y?: unknown;
}

interface ResolveReleaseScaleOptions {
  targetNode?: ReleaseScaleTargetNode | null;
  targetStageRect?: StageRect | null;
}

interface DesktopUpdateOptions {
  allowPlanReuse?: boolean;
  boundsTransaction?: boolean;
}

interface RetireIconNodeOptions {
  immediate?: boolean;
}

interface FlushBoundsOptions {
  force?: boolean;
}

type FolderOverlayTransformState = Readonly<{
  height: number;
  isFolderOverlayActive?: boolean;
  launchpadVisualTransform?: SceneVisualTransform;
  singleStageFolderState?: Readonly<{ renderedFolder?: unknown }> | null;
  snapDesktopLayout?: boolean;
  width: number;
}>;

type DesktopFolderLayerUpdateState = Readonly<{
  groupTransferOwnedItemIds?: ReadonlySet<string>;
  height: number;
  singleStageFolderState: DesktopLayerState["singleStageFolderState"];
  stageRect: StageRect;
  width: number;
}>;

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;
const DESKTOP_DRAG_HANDOFF_LAYOUT_REASON = "desktop-drag-handoff-layout";
const GROUP_TRANSFER_OWNERSHIP_HANDOFF_LAYOUT_REASON = "group-transfer-ownership-handoff-layout";
const DESKTOP_RESIZE_LAYOUT_REASON = "desktop-resize-layout";
const MOTION_TARGET_EPSILON = 0.0001;

function normalizeGroupDragOwnershipGroup(value: unknown): GroupDragOwnershipGroup | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Desktop group drag state must be an object or null");
  }
  const key = Reflect.get(value, "key");
  if (key != null && typeof key !== "string") {
    throw new TypeError("Desktop group drag state key must be a string when provided");
  }
  const phase = Reflect.get(value, "phase");
  if (phase != null && typeof phase !== "string") {
    throw new TypeError("Desktop group drag state phase must be a string when provided");
  }
  return value as GroupDragOwnershipGroup;
}

function normalizeGroupDragUpdateGroup(value: unknown): GroupDragGroup | null {
  const group = normalizeGroupDragOwnershipGroup(value);
  if (!group?.key) return null;
  if (typeof group.phase !== "string" || !group.phase) {
    throw new TypeError("Desktop group drag state phase must be a non-empty string");
  }
  const entries = Reflect.get(group, "entries");
  if (!Array.isArray(entries) || entries.length === 0) return null;
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`Desktop group drag entry ${index} must be an object`);
    }
    const item = Reflect.get(entry, "item");
    const origin = Reflect.get(entry, "origin");
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError(`Desktop group drag entry ${index}.item must be an object`);
    }
    if (!origin || typeof origin !== "object" || Array.isArray(origin) ||
      !Number.isFinite(Reflect.get(origin, "x")) || !Number.isFinite(Reflect.get(origin, "y"))) {
      throw new TypeError(`Desktop group drag entry ${index}.origin must contain finite x/y coordinates`);
    }
  }
  return value as GroupDragGroup;
}

function assertDesktopItem(value: unknown, path: string): asserts value is DesktopItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be a desktop item`);
  }
  const id = Reflect.get(value, "id");
  if (typeof id !== "string" || !id) {
    throw new TypeError(`${path}.id must be a non-empty string`);
  }
  for (const key of ["customIconDataUrl", "customIconPath"] as const) {
    const field = Reflect.get(value, key);
    if (field !== undefined && field !== null && typeof field !== "string") {
      throw new TypeError(`${path}.${key} must be a string, null, or undefined`);
    }
  }
  const childPages = Reflect.get(value, "childPages");
  if (childPages === undefined) return;
  if (!Array.isArray(childPages)) throw new TypeError(`${path}.childPages must be an array`);
  for (const [pageIndex, page] of childPages.entries()) {
    if (!Array.isArray(page)) {
      throw new TypeError(`${path}.childPages[${pageIndex}] must be an array`);
    }
    for (const [itemIndex, child] of page.entries()) {
      if (child == null) continue;
      assertDesktopItem(child, `${path}.childPages[${pageIndex}][${itemIndex}]`);
    }
  }
}

function assertDesktopPages(value: unknown): asserts value is readonly (readonly (DesktopItem | null)[])[] {
  if (!Array.isArray(value)) throw new TypeError("Desktop pages must be an array");
  for (const [pageIndex, page] of value.entries()) {
    if (!Array.isArray(page)) throw new TypeError(`Desktop page ${pageIndex} must be an array`);
    for (const [itemIndex, item] of page.entries()) {
      if (item === null) continue;
      assertDesktopItem(item, `Desktop page ${pageIndex} item ${itemIndex}`);
    }
  }
}

function assertVisibleDesktopItems(value: unknown): asserts value is readonly DesktopItem[] {
  if (!Array.isArray(value)) throw new TypeError("Visible desktop items must be an array");
  for (const [index, item] of value.entries()) {
    assertDesktopItem(item, `Visible desktop item ${index}`);
  }
}

function normalizeDesktopGridDebugOptions(
  value: unknown,
): DesktopRenderPlanState["desktopGridDebugOptions"] {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Desktop grid debug options must be an object or null");
  }
  const paddingTop = Reflect.get(value, "paddingTop");
  if (paddingTop === undefined) return {};
  if (typeof paddingTop !== "number" || !Number.isFinite(paddingTop)) {
    throw new TypeError("Desktop grid debug paddingTop must be a finite number");
  }
  return { paddingTop };
}

function normalizeDesktopDragHoverState(
  value: unknown,
): DesktopRenderPlanState["dragFolderHoverState"] {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Desktop drag-folder hover state must be an object or null");
  }
  for (const key of ["phase", "targetId", "targetType"] as const) {
    const field = Reflect.get(value, key);
    if (field !== undefined && typeof field !== "string") {
      throw new TypeError(`Desktop drag-folder hover ${key} must be a string when provided`);
    }
  }
  return value as DesktopRenderPlanState["dragFolderHoverState"];
}

function normalizeDesktopRenderGroupDragState(value: unknown): DesktopGroupDragState | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Desktop render group state must be an object or null");
  }
  const outcome = Reflect.get(value, "outcome");
  const phase = Reflect.get(value, "phase");
  const totalCount = Reflect.get(value, "totalCount");
  if (outcome !== undefined && outcome !== null && typeof outcome !== "string") {
    throw new TypeError("Desktop render group outcome must be a string, null, or undefined");
  }
  if (phase !== undefined && phase !== null && typeof phase !== "string") {
    throw new TypeError("Desktop render group phase must be a string, null, or undefined");
  }
  if (totalCount !== undefined && (typeof totalCount !== "number" || !Number.isFinite(totalCount))) {
    throw new TypeError("Desktop render group totalCount must be a finite number when provided");
  }
  const runtimePlanValue = Reflect.get(value, "runtimePlan");
  let runtimePlan: DesktopGroupDragState["runtimePlan"];
  if (runtimePlanValue === undefined) {
    runtimePlan = undefined;
  } else if (runtimePlanValue === null) {
    runtimePlan = null;
  } else {
    if (typeof runtimePlanValue !== "object" || Array.isArray(runtimePlanValue)) {
      throw new TypeError("Desktop render group runtimePlan must be an object, null, or undefined");
    }
    const entriesValue = Reflect.get(runtimePlanValue, "entries");
    if (entriesValue !== undefined && !Array.isArray(entriesValue)) {
      throw new TypeError("Desktop render group runtimePlan.entries must be an array when provided");
    }
    const entries = entriesValue?.map((entry: unknown, index: number) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new TypeError(`Desktop render group entry ${index} must be an object`);
      }
      const id = Reflect.get(entry, "id");
      const memberIds = Reflect.get(entry, "memberIds");
      const mode = Reflect.get(entry, "mode");
      const target = Reflect.get(entry, "target");
      if (id !== undefined && typeof id !== "string") {
        throw new TypeError(`Desktop render group entry ${index}.id must be a string when provided`);
      }
      if (memberIds !== undefined && (!Array.isArray(memberIds) || memberIds.some((memberId) => typeof memberId !== "string"))) {
        throw new TypeError(`Desktop render group entry ${index}.memberIds must contain strings`);
      }
      if (mode !== undefined && typeof mode !== "string") {
        throw new TypeError(`Desktop render group entry ${index}.mode must be a string when provided`);
      }
      if (target !== undefined && target !== null && (typeof target !== "object" || Array.isArray(target))) {
        throw new TypeError(`Desktop render group entry ${index}.target must be an object, null, or undefined`);
      }
      const area = target == null ? undefined : Reflect.get(target, "area");
      if (area !== undefined && typeof area !== "string") {
        throw new TypeError(`Desktop render group entry ${index}.target.area must be a string when provided`);
      }
      return {
        ...(id === undefined ? {} : { id }),
        ...(memberIds === undefined ? {} : { memberIds }),
        ...(mode === undefined ? {} : { mode }),
        ...(target === undefined ? {} : target === null ? { target: null } : {
          target: area === undefined ? {} : { area },
        }),
      };
    });
    runtimePlan = entries === undefined ? {} : { entries };
  }
  return {
    ...(outcome === undefined ? {} : { outcome }),
    ...(phase === undefined ? {} : { phase }),
    ...(runtimePlan === undefined ? {} : { runtimePlan }),
    ...(totalCount === undefined ? {} : { totalCount }),
    visualSpec: Reflect.get(value, "visualSpec"),
  };
}

function normalizeDragHitDebugSnapshot(value: unknown): DragHitDebugSnapshot | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Drag-hit diagnostics state must be an object or null");
  }
  const active = Reflect.get(value, "active");
  if (active === undefined) return null;
  if (typeof active !== "boolean") {
    throw new TypeError("Drag-hit diagnostics active must be a boolean when provided");
  }
  return value as DragHitDebugSnapshot;
}

function normalizeProvisionalFolderRollbackState(value: unknown): ProvisionalFolderRollbackState | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Provisional folder rollback state must be an object or null");
  }
  const folderId = Reflect.get(value, "folderId");
  const phase = Reflect.get(value, "phase");
  const reducedMotion = Reflect.get(value, "reducedMotion");
  const targetAppId = Reflect.get(value, "targetAppId");
  const token = Reflect.get(value, "token");
  if (typeof folderId !== "string" || !folderId) {
    throw new TypeError("Provisional folder rollback folderId must be a non-empty string");
  }
  if (typeof phase !== "string" || !phase) {
    throw new TypeError("Provisional folder rollback phase must be a non-empty string");
  }
  if (typeof targetAppId !== "string" || !targetAppId) {
    throw new TypeError("Provisional folder rollback targetAppId must be a non-empty string");
  }
  if (typeof token !== "number" || !Number.isFinite(token)) {
    throw new TypeError("Provisional folder rollback token must be a finite number");
  }
  if (reducedMotion !== undefined && typeof reducedMotion !== "boolean") {
    throw new TypeError("Provisional folder rollback reducedMotion must be a boolean when provided");
  }
  return {
    folderId,
    handoffVelocity: Reflect.get(value, "handoffVelocity"),
    phase,
    previewSlotIndex: Reflect.get(value, "previewSlotIndex"),
    ...(reducedMotion === undefined ? {} : { reducedMotion }),
    targetAppId,
    token,
  };
}

function makeDesktopRenderPlanState(
  state: DesktopLayerState,
  groupTransferOwnedFolderShellIds: ReadonlySet<string>,
  groupTransferOwnedItemIds: ReadonlySet<string>,
): DesktopRenderPlanState {
  assertDesktopPages(state.activePages);
  return {
    ...state,
    activePages: state.activePages,
    desktopGridDebugOptions: normalizeDesktopGridDebugOptions(state.desktopGridDebugOptions),
    dragFolderHoverState: normalizeDesktopDragHoverState(state.dragFolderHoverState),
    getVisibleDesktopPage: (page) => {
      const items = state.getVisibleDesktopPage(page);
      assertVisibleDesktopItems(items);
      return items;
    },
    groupDragState: normalizeDesktopRenderGroupDragState(state.groupDragState),
    groupTransferOwnedFolderShellIds,
    groupTransferOwnedItemIds,
  };
}

function makeDesktopDragVisualSpec(plan: DesktopRenderPlanWithRevision | null = null): ReturnType<typeof makeIconVisualSpecFromNodeState> | null {
  const entries = plan?.entries || [];
  const activePageIndex = Number(plan?.activePageIndex) || 0;
  const entry = entries.find((candidate) => (
    candidate?.pageIndex === activePageIndex && candidate?.item?.type === "app"
  )) || entries.find((candidate) => candidate?.pageIndex === activePageIndex) || entries[0];
  return entry?.nodeState ? makeIconVisualSpecFromNodeState(entry.nodeState) : null;
}

function readTransformAxisLengths(node: Container | null | undefined): StagePoint | null {
  const matrix = node?.worldTransform;
  if (!matrix) return null;
  const x = Math.hypot(Number(matrix.a), Number(matrix.b));
  const y = Math.hypot(Number(matrix.c), Number(matrix.d));
  return Number.isFinite(x) && x > 0 && Number.isFinite(y) && y > 0
    ? { x, y }
    : null;
}

type VisualTransformNode = Container & Readonly<{ visualWrap?: Container }>;

function getVisualTransformNode<T extends VisualTransformNode>(node: T): Container | T;
function getVisualTransformNode(node: null | undefined): null | undefined;
function getVisualTransformNode(
  node: VisualTransformNode | null | undefined,
): Container | VisualTransformNode | null | undefined;
function getVisualTransformNode(
  node: VisualTransformNode | null | undefined,
): Container | VisualTransformNode | null | undefined {
  return node?.visualWrap && !node.visualWrap.destroyed
    ? node.visualWrap
    : node;
}

function readVisualCenterInLayer(
  layer: Container | null | undefined,
  node: (Container & Readonly<{ visualWrap?: Container }>) | null | undefined,
): StagePoint | null {
  const visual = getVisualTransformNode(node);
  if (!layer || !visual || visual.destroyed) return null;
  const center = layer.toLocal({ x: 0, y: 0 }, visual);
  return Number.isFinite(Number(center?.x)) && Number.isFinite(Number(center?.y))
    ? { x: Number(center.x), y: Number(center.y) }
    : null;
}

function resolveReleaseRootPoint(
  releaseNode: GroupReleaseNode | null | undefined,
  visualTarget: StagePoint | null,
  targetScale: StagePoint | null | undefined,
): StagePoint | null {
  if (!visualTarget || !releaseNode || releaseNode.destroyed) return visualTarget;
  const releaseVisual = getVisualTransformNode(releaseNode);
  if (!releaseVisual || releaseVisual === releaseNode || releaseVisual.destroyed) return visualTarget;
  const localVisualCenter = releaseNode.toLocal({ x: 0, y: 0 }, releaseVisual);
  if (
    !Number.isFinite(Number(localVisualCenter?.x)) ||
    !Number.isFinite(Number(localVisualCenter?.y))
  ) return visualTarget;
  const scaleX = Math.max(0.01, Math.abs(Number(targetScale?.x) || Number(releaseNode.scale?.x) || 1));
  const scaleY = Math.max(0.01, Math.abs(Number(targetScale?.y) || Number(releaseNode.scale?.y) || 1));
  return {
    x: visualTarget.x - Number(localVisualCenter.x) * scaleX,
    y: visualTarget.y - Number(localVisualCenter.y) * scaleY,
  };
}

function resolvePanelEgressPoint(
  visualTarget: StagePoint | null,
  panel: StageRect | null,
  extension = 32,
): StagePoint | null {
  if (!visualTarget || !panel) return visualTarget;
  const center = {
    x: Number(panel.left) + Number(panel.width) / 2,
    y: Number(panel.top) + Number(panel.height) / 2,
  };
  let dx = Number(visualTarget.x) - center.x;
  let dy = Number(visualTarget.y) - center.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return visualTarget;
  if (Math.hypot(dx, dy) < 0.001) dx = 1;
  const candidates = [];
  if (Math.abs(dx) > 0.0001) {
    const boundaryX = dx < 0 ? Number(panel.left) : Number(panel.left) + Number(panel.width);
    const distance = (boundaryX - center.x) / dx;
    if (distance > 0) candidates.push(distance);
  }
  if (Math.abs(dy) > 0.0001) {
    const boundaryY = dy < 0 ? Number(panel.top) : Number(panel.top) + Number(panel.height);
    const distance = (boundaryY - center.y) / dy;
    if (distance > 0) candidates.push(distance);
  }
  const boundaryDistance = Math.min(...candidates);
  if (!Number.isFinite(boundaryDistance)) return visualTarget;
  const vectorLength = Math.max(0.001, Math.hypot(dx, dy));
  const outsideDistance = Math.max(0, Number(extension) || 0);
  return {
    x: center.x + dx * boundaryDistance + dx / vectorLength * outsideDistance,
    y: center.y + dy * boundaryDistance + dy / vectorLength * outsideDistance,
  };
}

function resolvePointReleaseTargetScale(
  layer: Container | null | undefined,
  releaseNode: GroupReleaseNode | null | undefined,
  options: ResolveReleaseScaleOptions = {},
): StagePoint | null {
  if (!layer || !releaseNode || releaseNode.destroyed) return null;
  const releaseVisual = getVisualTransformNode(releaseNode);
  if (!releaseVisual || releaseVisual.destroyed) return null;
  layer.toLocal({ x: 0, y: 0 }, releaseVisual);
  const releaseAxes = readTransformAxisLengths(releaseVisual);
  const releaseIconSize = Number(releaseNode.iconSize);
  if (!releaseAxes || !Number.isFinite(releaseIconSize) || releaseIconSize <= 0) return null;

  let targetWorldSize = null;
  const targetNode = options.targetNode;
  if (targetNode && !targetNode.destroyed) {
    const targetVisual = getVisualTransformNode(targetNode);
    const targetIconSize = Number(targetNode.iconSize);
    if (targetVisual && !targetVisual.destroyed && Number.isFinite(targetIconSize) && targetIconSize > 0) {
      layer.toLocal({ x: 0, y: 0 }, targetVisual);
      const targetAxes = readTransformAxisLengths(targetVisual);
      if (targetAxes) {
        targetWorldSize = {
          x: targetIconSize * targetAxes.x,
          y: targetIconSize * targetAxes.y,
        };
      }
    }
  } else if (options.targetStageRect) {
    const layerAxes = readTransformAxisLengths(layer);
    const width = Number(options.targetStageRect.width);
    const height = Number(options.targetStageRect.height);
    if (layerAxes && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      targetWorldSize = {
        x: width * layerAxes.x,
        y: height * layerAxes.y,
      };
    }
  }
  if (!targetWorldSize) return null;

  const currentScaleX = Math.max(0.01, Math.abs(Number(releaseNode.scale?.x) || 1));
  const currentScaleY = Math.max(0.01, Math.abs(Number(releaseNode.scale?.y) || 1));
  return {
    x: Math.max(0.01, currentScaleX * targetWorldSize.x / (releaseIconSize * releaseAxes.x)),
    y: Math.max(0.01, currentScaleY * targetWorldSize.y / (releaseIconSize * releaseAxes.y)),
  };
}

function makeIdListSignature(
  value: ReadonlySet<unknown> | readonly unknown[] | unknown | null | undefined,
): string {
  if (!value) return "";
  const ids = value instanceof Set || Array.isArray(value)
    ? Array.from(value)
    : [value];
  return ids
    .map((id) => String(id || ""))
    .filter(Boolean)
    .sort()
    .join(",");
}

function makePointerOnlyPlanSnapshot(
  state: DesktopLayerState,
  effectiveFolderSourceGhostedIds: ReadonlySet<string>,
  folderDropFrameSuppressedIds: ReadonlySet<string>,
  folderHandoffEntries: ReadonlyMap<string, DesktopFolderHandoffEntry>,
): PointerOnlyPlanSnapshot | null {
  const group = state.groupDragState;
  const renderedFolder = state.singleStageFolderState?.renderedFolder;
  if (
    !group ||
    group.phase !== "dragging" ||
    renderedFolder ||
    folderHandoffEntries?.size ||
    folderDropFrameSuppressedIds?.size
  ) return null;

  const frame = state.desktopFrame || {};
  const stageRect = state.stageRect || {};
  const hover = state.dragFolderHoverState || {};
  const pageTrackScrub: Readonly<{
    offset?: unknown;
    progress?: unknown;
    x?: unknown;
  }> = state.pageTrackScrub || {};
  return {
    key: [
      state.activePageIndex,
      state.folderPageSize,
      state.gridCols,
      state.gridRows,
      state.height,
      state.width,
      state.deviceResolution,
      state.isBatchSelectionActive ? 1 : 0,
      state.isEditMode ? 1 : 0,
      state.isSearchMode ? 1 : 0,
      state.isTextlessMode ? 1 : 0,
      state.showMissingLaunchTargetBadge ? 1 : 0,
      state.snapDesktopLayout ? 1 : 0,
      state.shouldSnapTrack ? 1 : 0,
      state.desktopTrackMotionKey || "",
      state.desktopGridDebugOptions?.paddingTop ?? "",
      state.dragFolderTargetId || "",
      hover.key || "",
      hover.phase || "",
      hover.targetId || "",
      hover.targetType || "",
      group.phase,
      group.totalCount || 0,
      makeIdListSignature(state.dragMeta?.draggedIds),
      makeIdListSignature(state.groupTransferOwnedFolderShellIds),
      makeIdListSignature(state.groupTransferOwnedItemIds),
      makeIdListSignature(state.selectedAppIds),
      makeIdListSignature(effectiveFolderSourceGhostedIds),
      makeIdListSignature(state.folderClosingHandoffIds),
      frame.left ?? "",
      frame.top ?? "",
      frame.width ?? "",
      frame.height ?? "",
      stageRect.left ?? "",
      stageRect.top ?? "",
      stageRect.width ?? "",
      stageRect.height ?? "",
      pageTrackScrub.progress ?? "",
      pageTrackScrub.x ?? "",
      pageTrackScrub.offset ?? "",
    ].join("|"),
    references: [
      state.activePages,
      state.dragMeta,
      group.entries,
      state.selectedAppIds,
      state.focusedIcon,
      state.iconGesturePresentation,
      state.launchTargetStatusById,
      state.getDesktopPageRenderMode,
      state.getVisibleDesktopPage,
      state.isIconOpening,
      state.setPageRef,
    ],
  };
}

function canReusePointerOnlyPlan(
  previousSnapshot: PointerOnlyPlanSnapshot | null,
  nextSnapshot: PointerOnlyPlanSnapshot | null,
): boolean {
  if (!previousSnapshot || !nextSnapshot || previousSnapshot.key !== nextSnapshot.key) return false;
  if (previousSnapshot.references.length !== nextSnapshot.references.length) return false;
  return previousSnapshot.references.every((value, index) => value === nextSnapshot.references[index]);
}

function projectStageLayoutRecordToClient(record: StageLayoutRecord | null | undefined) {
  return stageLayoutRecordToClientRect(record);
}

function getDesktopSourceOwnerKind(
  visualOwnership: VisualOwnershipRegistry,
  folderId: string,
): string | null {
  const key = makeDesktopSourceVisualKey(folderId);
  return key ? visualOwnership?.getOwner?.(key)?.kind || null : null;
}

function roundDebugObject(
  object: object | null | undefined,
): Record<string, unknown> | null {
  if (!object || typeof object !== "object") return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    result[key] = typeof value === "number" ? Math.round(value * 1000) / 1000 : value;
  }
  return result;
}

function roundTransformObject(object: TransformSnapshotInput | null | undefined) {
  if (!object || typeof object !== "object") return null;
  const pointValue = (
    point: Readonly<{ x?: unknown; y?: unknown }> | null | undefined,
    key: "x" | "y",
    fallback = 0,
  ) => Math.round(readNumber(point?.[key], fallback) * 1000) / 1000;
  return {
    alpha: Math.round(readNumber(object.alpha, 1) * 1000) / 1000,
    pivotX: pointValue(object.pivot, "x"),
    pivotY: pointValue(object.pivot, "y"),
    scaleX: pointValue(object.scale, "x", 1),
    scaleY: pointValue(object.scale, "y", 1),
    visible: object.visible ?? null,
    x: pointValue(object.position || object, "x"),
    y: pointValue(object.position || object, "y"),
  };
}

function maxAbsRectDelta(rows: readonly RectDeltaRow[] | null | undefined): StageRect {
  const result = { height: 0, left: 0, top: 0, width: 0 };
  for (const row of rows || []) {
    const delta = row?.delta;
    if (!delta) continue;
    result.height = Math.max(result.height, Math.abs(delta.height || 0));
    result.left = Math.max(result.left, Math.abs(delta.left || 0));
    result.top = Math.max(result.top, Math.abs(delta.top || 0));
    result.width = Math.max(result.width, Math.abs(delta.width || 0));
  }
  return result;
}

function worstRectDelta(rows: readonly RectDeltaRow[] | null | undefined) {
  let worst = null;
  let worstValue = -1;
  for (const row of rows || []) {
    const delta = row?.delta;
    if (!delta) continue;
    const value = Math.max(
      Math.abs(delta.height || 0),
      Math.abs(delta.left || 0),
      Math.abs(delta.top || 0),
      Math.abs(delta.width || 0)
    );
    if (value <= worstValue) continue;
    worstValue = value;
    worst = {
      height: delta.height,
      left: delta.left,
      slot: row.slot,
      top: delta.top,
      width: delta.width,
    };
  }
  return worst;
}

function drawDebugRect(
  graphics: Graphics,
  rect: StageRect | DebugRect | null | undefined,
  stageRect: StageRect | null | undefined,
  color: number,
  alpha = 0.95,
  width = 3,
): void {
  const local = clientRectToStageVisualRect(rect as StageRect | null | undefined, stageRect);
  if (!local || local.width <= 0 || local.height <= 0) return;
  graphics
    .rect(local.left, local.top, local.width, local.height)
    .stroke({ alpha, color, width });
}

function springIconLayoutPosition(
  node: DesktopIconNode,
  layoutTarget: DesktopLayoutTarget,
  markBoundsDirty: () => void,
): void {
  motion(node)
    .layout()
    .spring(motionSprings.layout)
    .interrupt("retarget")
    .to({
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      x: layoutTarget.x,
      y: layoutTarget.y,
    })
    .start();
}

function snapIconLayoutPosition(
  node: DesktopIconNode,
  layoutTarget: DesktopLayoutTarget,
  markBoundsDirty: () => void,
  reason: string,
): void {
  killMotionOf(node, "x,y", { lane: "base", reason });
  node.position.set(layoutTarget.x, layoutTarget.y);
  markBoundsDirty();
}

function motionSpringTo(
  target: MotionTarget,
  vars: MotionVars,
  config: SpringConfig,
  options: Pick<MotionVars, "onComplete" | "onUpdate" | "snap"> = {},
): null | undefined {
  const numericProps = Object.keys(vars || {}).filter((prop) => Number.isFinite(Number(vars[prop])));
  if (numericProps.length && shouldSkipMotionSpring(target, numericProps, vars, options)) return null;
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

function shouldSkipMotionSpring(
  target: MotionTarget | null | undefined,
  props: readonly string[],
  vars: MotionVars,
  options: Pick<MotionVars, "snap"> = {},
): boolean {
  if (!target) return true;
  const snap = options.snap === true;
  return props.every((prop) => {
    const desired = Number(vars[prop]);
    const current = Number((target as Record<string, unknown>)[prop]);
    const channel = motionRuntime.getChannel(target, prop);
    const active = channel?.activeBaseKey
      ? channel.base?.get(channel.activeBaseKey)
      : null;
    if (active && !active.done) {
      // A snap must cancel an in-flight spring even when its destination is
      // already correct. A regular update can leave the existing spring alone
      // only when it is heading to this same destination.
      return !snap && Math.abs(Number(active.to) - desired) <= MOTION_TARGET_EPSILON;
    }
    return Number.isFinite(current) && Math.abs(current - desired) <= MOTION_TARGET_EPSILON;
  });
}

export class DesktopLayer extends Container {
  private boundsUpdateDepth = 0;
  declare boundsDirty: boolean;
  declare boundsFlushQueued: boolean;
  declare boundsRegistration: DesktopBoundsRegistration<DesktopBoundsEntry, DesktopRect> | null;
  declare desktopClosingUnderlayLayer: Container;
  declare desktopPlanRevision: number;
  declare dragHitDebugLayer: DragHitDebugLayer;
  declare emptyText: PixiText;
  declare folderDropFillLayer: FolderDropTargetLayer;
  declare folderDropFrameSuppressedIds: Set<string>;
  declare folderDropStrokeLayer: FolderDropTargetLayer;
  declare folderHandoffNodes: Map<string, DesktopFolderHandoffEntry>;
  declare folderPresentationGeometryCache: DesktopPresentationGeometryCache;
  declare groupDragLayer: GroupDragLayer | null;
  declare handoffDebugLayer: Graphics;
  declare hasDesktopVisualAlpha: boolean;
  declare hasDesktopVisualTransform: boolean;
  declare hasFolderOverlayAlpha: boolean;
  declare hasFolderOverlayTransform: boolean;
  declare heightValue: number | undefined;
  declare iconBoundsRegistry: IconBoundsRegistry;
  declare iconNodes: Map<string, DesktopIconNode>;
  declare lastDesktopRenderPlan: DesktopRenderPlanWithRevision | null;
  declare lastFolderHandoffDebugSnapshot: Record<string, unknown> | null;
  declare lastFolderSourceGhostingState: DesktopGhostingState | null;
  declare lastPointerOnlyPlanSnapshot: PointerOnlyPlanSnapshot | null;
  declare onClosingFolderPointerDown: NonNullable<DesktopLayerOptions["onClosingFolderPointerDown"]>;
  declare onFolderGeometryChange: NonNullable<DesktopLayerOptions["onFolderGeometryChange"]>;
  declare onFolderInternalActivityChange: NonNullable<DesktopLayerOptions["onFolderInternalActivityChange"]>;
  declare onFolderOutsidePointerDown: NonNullable<DesktopLayerOptions["onFolderOutsidePointerDown"]>;
  declare onFolderPanelPointerDown: NonNullable<DesktopLayerOptions["onFolderPanelPointerDown"]>;
  declare onFolderRenderRequest: NonNullable<DesktopLayerOptions["onFolderRenderRequest"]>;
  declare onFolderTitleFrameChange: NonNullable<DesktopLayerOptions["onFolderTitleFrameChange"]>;
  declare onGroupReleaseComplete: NonNullable<DesktopLayerOptions["onGroupReleaseComplete"]>;
  declare onIconAction: IconNodeActionHandler;
  declare iconTextures: IconTextureRepository | undefined;
  declare pageTrack: Container;
  declare pageTrackMotion: PageTrackMotionState;
  declare primaryFolderHandoffId: string | null;
  declare provisionalFolderRollbackLayer: ProvisionalFolderRollbackLayer;
  declare provisionalFolderRollbackState: ProvisionalFolderRollbackState | null;
  declare renderCopy: DesktopRenderCopy;
  declare retiredIconNodes: WeakSet<DesktopIconNode>;
  declare singleStageDiagnosticsLayer: SingleStageDiagnosticsLayer;
  declare singleStageFolderLayer: FolderOverlayLayer;
  declare stageRect: StageRect | undefined;
  declare unregisterFolderHandoffDiagnosticClear: (() => void) | null;
  declare unsubscribeVisualOwnership: (() => void) | null;
  declare visualCommitQueue: FolderVisualCommitQueue;
  declare visualOwnership: VisualOwnershipRegistry;
  declare visualRoot: Container;
  declare widthValue: number | undefined;

  constructor(options: DesktopLayerOptions) {
    super();
    this.reuseSearchNodes=options.reuseSearchNodes===true;
    this.visualRoot = new Container();
    this.pageTrack = new Container();
    this.desktopClosingUnderlayLayer = new Container();
    this.desktopClosingUnderlayLayer.eventMode = "none";
    this.handoffDebugLayer = new Graphics();
    this.onIconAction = options.onIconAction || (() => {});
    this.iconTextures = options.iconTextures;
    this.onClosingFolderPointerDown = options.onClosingFolderPointerDown || (() => {});
    this.onFolderGeometryChange = options.onFolderGeometryChange || (() => {});
    this.onFolderInternalActivityChange = options.onFolderInternalActivityChange || (() => {});
    this.onFolderRenderRequest = options.onFolderRenderRequest || (() => {});
    this.onFolderOutsidePointerDown = options.onFolderOutsidePointerDown || (() => {});
    this.onFolderPanelPointerDown = options.onFolderPanelPointerDown || (() => {});
    this.onFolderTitleFrameChange = options.onFolderTitleFrameChange || (() => {});
    this.onGroupReleaseComplete = options.onGroupReleaseComplete || (() => {});
    if (!options.iconBoundsRegistry) throw new Error("DesktopLayer requires iconBoundsRegistry");
    this.iconBoundsRegistry = options.iconBoundsRegistry;
    this.visualOwnership = options.visualOwnership || new VisualOwnershipRegistry();
    this.visualCommitQueue = options.visualCommitQueue || new FolderVisualCommitQueue();
    this.renderCopy = {
      newFolderName: String(options.renderCopy?.newFolderName || ""),
      searchEmpty: String(options.renderCopy?.searchEmpty || ""),
    };
    this.folderDropFrameSuppressedIds = new Set();
    this.lastFolderSourceGhostingState = null;
    this.unsubscribeVisualOwnership = this.visualOwnership.subscribe(() => {
      this.onFolderRenderRequest("visual-ownership-committed");
    });
    this.singleStageFolderLayer = new FolderOverlayLayer({
      detachedClosingVisualLayer: this.desktopClosingUnderlayLayer,
      iconBoundsRegistry: this.iconBoundsRegistry,
      iconTextures: this.iconTextures,
      onDesktopSourceGhostingChange: () => this.onFolderRenderRequest("desktop-source-ownership-committed"),
      onClosingFolderPointerDown: (folderId: string | null, event: unknown) => this.onClosingFolderPointerDown(folderId, event),
      onClosingHandoffPrepare: (folderId: string | null, prepareOptions = {}) => this.startClosingFolderHandoffNow(folderId, {
        resetVisual: prepareOptions.preserveVisualState !== true,
        revealLabel: false,
      }),
      onClosingHandoffReady: (folderId: string) => this.startClosingFolderHandoffNow(folderId, { revealLabel: false }),
      onClosingPresentationReady: (folderId: string) => this.revealClosingFolderHandoffLabel(folderId),
      onClosingHandoffVisualRelease: (folderId: string | null) => this.releaseClosingFolderHandoffVisual(folderId),
      // Authoritative "is this folder's real desktop icon currently visible". The
      // overlay/coordinator's own released flags can desync from the desktop handoff
      // entry across the cross-layer round-trip; the open-interrupt guard must use
      // this desktop truth so it never re-detaches (and re-hides) an already-revealed
      // source icon.
      isHandoffSourceVisible: (folderId: string | null) => {
        const entry = this.getFolderHandoffEntry(folderId);
        return !entry || entry.visualReleased === true;
      },
      onIconAction: (action: IconNodeAction, originalEvent: unknown, item: SceneItem | null, source: SceneDataRecord | null, iconNode: IconNode) =>
        this.handleIconAction(action, originalEvent, item, source, iconNode),
      onInternalActivityChange: (active: boolean, folderId: string | null = null) => this.onFolderInternalActivityChange(active, folderId),
      onRenderRequest: (reason: string) => this.onFolderRenderRequest(reason),
      onOutsidePointerDown: (event: unknown) => this.onFolderOutsidePointerDown(event),
      onPanelPointerDown: (event: unknown) => this.onFolderPanelPointerDown(event),
      renderCopy: this.renderCopy,
      showFolderTitle: options.showFolderTitle === true,
      onTitleFrameChange: (frame) => this.onFolderTitleFrameChange(frame),
      visualCommitQueue: this.visualCommitQueue,
      visualOwnership: this.visualOwnership,
    });
    this.singleStageDiagnosticsLayer = new SingleStageDiagnosticsLayer();
    this.folderDropFillLayer = new FolderDropTargetLayer({
      part: "fill",
      onExitComplete: (folderId: string) => this.releaseFolderDropFrameSuppression(folderId),
      onExitStart: (folderId: string) => this.holdFolderDropFrameSuppression(folderId),
      onTargetActive: (folderId: string) => this.holdFolderDropFrameSuppression(folderId),
    });
    this.groupDragLayer = new GroupDragLayer({
      iconTextures: this.iconTextures,
      onPrewarmRequest: (reason: string) => this.onFolderRenderRequest(reason),
      onRenderRequest: (reason: string) => this.onFolderRenderRequest(reason),
      onReleaseAborted: (payload) => this.onGroupReleaseComplete(payload),
      onReleaseSettled: (payload) => this.onGroupReleaseComplete(payload),
      onVisualOwnershipChange: (reason: string) => this.onFolderRenderRequest(reason),
      resolveFolderClipGeometry: () => this.resolveGroupFolderClipGeometry(),
      resolveFolderNode: (payload) => this.resolveGroupReleaseFolderNode(payload),
      resolvePointTarget: (payload) => this.resolveGroupReleasePoint(payload),
      visualOwnership: this.visualOwnership,
    });
    this.provisionalFolderRollbackLayer = new ProvisionalFolderRollbackLayer({
      onComplete: (payload) => {
        options.onProvisionalFolderRollbackComplete?.(payload);
        this.onFolderRenderRequest("provisional-folder-rollback-complete");
      },
    });
    this.provisionalFolderRollbackState = null;
    this.folderDropStrokeLayer = new FolderDropTargetLayer({ part: "stroke" });
    this.dragHitDebugLayer = new DragHitDebugLayer();
    this.folderHandoffNodes = new Map();
    this.primaryFolderHandoffId = null;
    this.hasDesktopVisualAlpha = false;
    this.hasDesktopVisualTransform = false;
    this.hasFolderOverlayAlpha = false;
    this.hasFolderOverlayTransform = false;
    this.lastFolderHandoffDebugSnapshot = null;
    this.lastDesktopRenderPlan = null;
    this.lastPointerOnlyPlanSnapshot = null;
    this.desktopPlanRevision = 0;
    this.folderPresentationGeometryCache = { geometryById: null, version: null };
    this.iconNodes = new Map();
    this.retiredIconNodes = new WeakSet();
    this.pageTrackMotion = createPageTrackMotionState();
    this.boundsRegistration = null;
    this.boundsFlushQueued = false;
    this.boundsDirty = false;
    this.emptyText = createPixiText({
      text: this.renderCopy.searchEmpty,
      style: { fill: 0xffffff, fontSize: 15, alpha: 0.74, fontFamily: [...PIXI_UI_FONT_FAMILY] },
    } as NonNullable<Parameters<typeof createPixiText>[0]>);
    this.emptyText.anchor.set(0.5);
    this.visualRoot.addChild(this.pageTrack);
    this.visualRoot.addChild(this.emptyText);
    this.visualRoot.addChild(this.provisionalFolderRollbackLayer);
    this.addChild(this.folderDropFillLayer);
    this.addChild(this.visualRoot);
    this.addChild(this.desktopClosingUnderlayLayer);
    this.addChild(this.singleStageFolderLayer);
    this.addChild(this.folderDropStrokeLayer);
    // The stroke is part of the drop target chrome.  Keep it below the
    // dragged actor so the actor can visibly enter the target instead of
    // being painted underneath the folder outline.
    this.addChild(this.groupDragLayer);
    this.addChild(this.singleStageDiagnosticsLayer);
    this.addChild(this.handoffDebugLayer);
    this.addChild(this.dragHitDebugLayer);
    this.unregisterFolderHandoffDiagnosticClear = sceneDiagnosticsState.registerClearHandler(
      "folderHandoff",
      () => this.handoffDebugLayer.clear(),
    );
    this.describeMotionTargets();
  }

  setRenderCopy(copy: Readonly<{
    newFolderName?: unknown;
    searchEmpty?: unknown;
  }> = {}): void {
    this.renderCopy = {
      newFolderName: String(copy.newFolderName || ""),
      searchEmpty: String(copy.searchEmpty || ""),
    };
    this.emptyText.text = this.renderCopy.searchEmpty;
    this.singleStageFolderLayer.setRenderCopy(this.renderCopy);
  }

  get folderHandoffNode() {
    return this.getPrimaryFolderHandoffNode();
  }

  set folderHandoffNode(entry: DesktopFolderHandoffEntry | null) {
    if (!entry) {
      this.primaryFolderHandoffId = null;
      return;
    }
    if (!entry.folderId) return;
    this.getFolderHandoffNodes().set(entry.folderId, entry);
    this.primaryFolderHandoffId = entry.folderId;
  }

  makeFolderPresentationGeometrySnapshot(): Map<string, DesktopFolderGeometry> {
    const cache = this.folderPresentationGeometryCache || { geometryById: null, version: null };
    const version = this.iconBoundsRegistry.getVersion?.();
    if (
      version != null &&
      cache.version === version &&
      cache.geometryById
    ) return cache.geometryById;
    const geometryById = new Map();
    for (const node of this.iconNodes?.values?.() || []) {
      const folderId = node?.item?.type === "folder" ? node.item.id : null;
      if (!folderId) continue;
      const stableRecord = this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folderId);
      geometryById.set(folderId, {
        liveRect: this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.LIVE_TARGET, folderId),
        renderedRect: this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, folderId),
        stableRect: projectStageLayoutRecordToClient(stableRecord),
      });
    }
    if (version != null) {
      this.folderPresentationGeometryCache = { geometryById, version };
    }
    return geometryById;
  }

  getRetiredIconNodes(): WeakSet<DesktopIconNode> {
    if (!(this.retiredIconNodes instanceof WeakSet)) this.retiredIconNodes = new WeakSet();
    return this.retiredIconNodes;
  }

  isIconNodeRetired(node: DesktopIconNode | null | undefined): boolean {
    return Boolean(node && this.getRetiredIconNodes().has(node));
  }

  discardFolderHandoffForRetiredNode(node: DesktopIconNode): void {
    const entries = this.getFolderHandoffNodes();
    for (const entry of Array.from(entries.values())) {
      if (entry.node !== node) continue;
      if (entry.cleanupFrame != null) entry.cleanupFrame.cancelled = true;
      entries.delete(entry.folderId);
      if (this.primaryFolderHandoffId === entry.folderId) this.setPrimaryFolderHandoffNode(null);
    }
  }

  private readonly reuseSearchNodes:boolean;
  private readonly searchNodeCache=new Map<string,DesktopIconNode>();
  clearSearchNodeCache():void {
    if(!this.reuseSearchNodes)return;
    for(const node of this.searchNodeCache.values())destroyDisplayObjectAfterFrame(node,{children:true});
    this.searchNodeCache.clear();
  }

  retireIconNode(
    key: string,
    node: DesktopIconNode | null | undefined,
    options: RetireIconNodeOptions = {},
  ): boolean {
    if (!node || !this.iconNodes.delete(key)) return false;
    const retiredNodes = this.getRetiredIconNodes();
    if (retiredNodes.has(node)) return true;
    retiredNodes.add(node);
    this.discardFolderHandoffForRetiredNode(node);
    killMotionOf(node);

    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      destroyDisplayObjectAfterFrame(node, { children: true });
    };
    if (options.immediate === true) {
      node.alpha = 0;
      finalize();
      return true;
    }
    motion(node)
      .preset("fade")
      .layout()
      .interrupt("retarget")
      .to({ alpha: 0, onCancel: finalize, onComplete: finalize })
      .start();
    return true;
  }

  update(state: DesktopLayerState): Partial<DesktopLayerFrameWork> {
    return this.updateScene(state, { allowPlanReuse: true });
  }

  updateStructure(state: DesktopStructureFrame): Partial<DesktopLayerFrameWork> {
    return this.updateScene(state, { allowPlanReuse: false });
  }

  updatePagePresentation(scrub:DesktopStructureFrame["pageTrackScrub"]):void {
    const track=this.lastDesktopRenderPlan?.pageTrack;
    if(!track)return;
    updatePageTrackMotion(this.pageTrackMotion,this.pageTrack,{
      debugMetadata:track.debugMetadata,onFrame:()=>this.markInteractiveBoundsDirty(),
      pageIndex:track.pageIndex,pageSpan:track.pageSpan,scrub,
      sourceLabel:track.sourceLabel,springConfig:motionSprings.layout,
    });
  }

  updateInteraction(state: DesktopInteractionState): Partial<DesktopLayerFrameWork> {
    const ownership = this.groupDragLayer?.syncVisualOwnership?.(normalizeGroupDragOwnershipGroup(state.groupDragState)) || {
      folderShellIds: new Set(),
      itemIds: new Set(),
    };
    const normalizedState = {
      ...state,
      groupTransferOwnedFolderShellIds: mergeFolderIdSets(
        state.groupTransferOwnedFolderShellIds,
        ownership.folderShellIds
      ),
      groupTransferOwnedItemIds: mergeFolderIdSets(
        state.groupTransferOwnedItemIds,
        ownership.itemIds
      ),
    };
    this.provisionalFolderRollbackState = normalizeProvisionalFolderRollbackState(
      normalizedState.provisionalFolderRollback,
    );
    const plan = this.lastDesktopRenderPlan;
    if (!plan) {
      throw new Error("DesktopLayer.updateInteraction requires an initialized structural render plan");
    }
    this.stageRect = normalizedState.stageRect;
    this.widthValue = normalizedState.width;
    this.heightValue = normalizedState.height;
    this.updateFolderDropTargetLayers(plan, normalizedState);
    this.applyGroupTransferOwnershipSnapshot({
      folderShellIds: normalizedState.groupTransferOwnedFolderShellIds,
      itemIds: normalizedState.groupTransferOwnedItemIds,
    });
    this.applyFolderSourceGhosting(normalizedState);
    this.updateGroupDragLayer(normalizedState);
    return { fullPlanBuilds: 0, handoffReconciliations: 0, reconciledNodes: 0 };
  }

  updateScene(
    state: DesktopLayerState,
    options: DesktopUpdateOptions = {},
  ): Partial<DesktopLayerFrameWork> {
    if (options.boundsTransaction !== false && typeof this.iconBoundsRegistry.transaction === "function") {
      this.boundsUpdateDepth = (this.boundsUpdateDepth || 0) + 1;
      try {
        return this.iconBoundsRegistry.transaction(() => this.updateScene(state, {
          ...options,
          boundsTransaction: false,
        }));
      } finally {
        this.boundsUpdateDepth -= 1;
        // Structural updates flush their bounds synchronously. Only schedule
        // another frame if something remains dirty when the transaction ends.
        if (this.boundsUpdateDepth === 0 && this.boundsDirty) this.markInteractiveBoundsDirty();
      }
    }
    const groupTransferOwnership = this.groupDragLayer?.syncVisualOwnership?.(normalizeGroupDragOwnershipGroup(state.groupDragState)) || {
      folderShellIds: new Set(),
      itemIds: new Set(),
    };
    state = {
      ...state,
      groupTransferOwnedFolderShellIds: mergeFolderIdSets(
        state.groupTransferOwnedFolderShellIds,
        groupTransferOwnership.folderShellIds
      ),
      groupTransferOwnedItemIds: mergeFolderIdSets(
        state.groupTransferOwnedItemIds,
        groupTransferOwnership.itemIds
      ),
    };
    this.provisionalFolderRollbackState = normalizeProvisionalFolderRollbackState(
      state.provisionalFolderRollback,
    );
    const folderHandoffEntries = this.getFolderHandoffNodes();
    const planningOwnershipSourceGhostedIds = getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership);
    const planningHandoffObservation = captureDesktopHandoffObservation(
      this.singleStageFolderLayer,
      mergeFolderIdSets(
        state.folderClosingHandoffIds,
        state.folderSourceGhostedIds,
        state.groupTransferOwnedFolderShellIds,
        planningOwnershipSourceGhostedIds,
        new Set(folderHandoffEntries.keys())
      )
    );
    const effectiveFolderSourceGhostedIds = mergeFolderIdSets(
      state.folderSourceGhostedIds,
      planningOwnershipSourceGhostedIds,
      planningHandoffObservation.desktopSourceGhostedIds
    );
    const pointerOnlyPlanSnapshot = makePointerOnlyPlanSnapshot(
      state,
      effectiveFolderSourceGhostedIds,
      this.folderDropFrameSuppressedIds,
      folderHandoffEntries
    );
    const canReusePlan = options.allowPlanReuse === true && canReusePointerOnlyPlan(
      this.lastPointerOnlyPlanSnapshot,
      pointerOnlyPlanSnapshot
    );
    const nextPlanRevision = Math.max(0, Number(this.desktopPlanRevision) || 0) + 1;
    const planState = makeDesktopRenderPlanState(
      state,
      state.groupTransferOwnedFolderShellIds || new Set(),
      state.groupTransferOwnedItemIds || new Set(),
    );
    const plan: DesktopRenderPlanWithRevision | null = canReusePlan
      ? this.lastDesktopRenderPlan
      : {
        ...buildDesktopRenderPlan(planState, {
          effectiveFolderSourceGhostedIds,
          folderDropFrameSuppressedIds: this.folderDropFrameSuppressedIds,
          folderGeometryById: this.makeFolderPresentationGeometrySnapshot(),
          folderHandoffEntries,
          handoffObservation: planningHandoffObservation,
        }),
        revision: nextPlanRevision,
      } as DesktopRenderPlanWithRevision;
    if (!plan) {
      throw new Error("DesktopLayer.updateScene requires an initialized render plan before reuse");
    }
    if (!canReusePlan) this.desktopPlanRevision = nextPlanRevision;
    this.lastPointerOnlyPlanSnapshot = pointerOnlyPlanSnapshot;
    this.stageRect = state.stageRect;
    this.widthValue = state.width;
    this.heightValue = state.height;
    this.describeMotionTargets(state);
    this.applyDesktopVisualTransform(state);
    this.applyDesktopVisualAlpha(state);
    this.applyFolderOverlayTransform(state);
    this.applyFolderOverlayAlpha(state);
    const markBoundsDirty = () => this.markInteractiveBoundsDirty();
    const previousPlan = this.lastDesktopRenderPlan;
    const shouldApplyDesktopPlan = !canReusePlan;
    const pageTrackScopeChanged = Boolean(
      previousPlan?.pageTrack && previousPlan.pageTrack.scope !== plan.pageTrack.scope
    );
    this.lastDesktopRenderPlan = plan;
    const provisionalRollbackPreparation = shouldApplyDesktopPlan
      ? this.prepareProvisionalFolderRollback({
        provisionalFolderRollback: this.provisionalFolderRollbackState,
      })
      : null;

    if (shouldApplyDesktopPlan) {
      const previousEntries = new Map((previousPlan?.entries || []).map((entry) => [entry.key, entry]));
      if (pageTrackScopeChanged) {
        this.iconBoundsRegistry.clearBounds(previousPlan!.clearLaunchArea);
      }
      this.iconBoundsRegistry.clearBounds(plan.clearLaunchArea);
      for (const folderId of plan.clearFolderPreviewChildIds) {
        this.iconBoundsRegistry.clearBounds({ folderId, kind: BOUNDS_KIND.PREVIEW_CHILD });
      }
      for (const pageRef of plan.pageRefs) {
        state.setPageRef(pageRef.element, pageRef.pageIndex);
      }

      const seen = new Set<string>();
      const boundsEntries: DesktopBoundsEntry[] = [];
      const groupTransferOwnedItemIds = state.groupTransferOwnedItemIds || new Set();
      const groupTransferOwnedFolderShellIds = state.groupTransferOwnedFolderShellIds || new Set();
      for (const entry of plan.entries) {
        const {
          effectiveFolderHandoffEntry,
          isActiveFolderClosingHandoff,
          isFolderClosingHandoff,
          item,
          key,
          layoutTarget,
          nodeState,
          shouldRetireStaleHandoff,
        } = entry;
        const isProvisionalRollbackTarget = Boolean(
          provisionalRollbackPreparation?.rollback?.targetAppId === item?.id
        );
        const previousEntry = previousEntries.get(key);
        const shouldSpringLayout = !previousEntry ||
          previousEntry.isFolderClosingHandoff !== isFolderClosingHandoff ||
          isLayoutTargetChanged(previousEntry.layoutTarget, layoutTarget);
        if (shouldRetireStaleHandoff) this.clearFolderHandoffNode(item.id);
        seen.add(key);
        let node = this.iconNodes.get(key);
        const isNewNode = !node;
        if(!node&&this.reuseSearchNodes){
          node=this.searchNodeCache.get(key);
          if(node){this.searchNodeCache.delete(key);this.iconNodes.set(key,node);this.pageTrack.addChild(node);}
        }
        const shouldSnapDragHandoffLayout = !isFolderClosingHandoff && (
          entry.isActiveDraggedItem || entry.isGroupTransferShellOwned
        );
        const shouldSnapResizeLayout = !isFolderClosingHandoff && state.snapDesktopLayout === true;
        if (!node) {
          node = new IconNode({
            iconTextures: this.iconTextures,
            onAction: (action, originalEvent, actionItem, actionSource, iconNode) =>
              this.handleIconAction(action, originalEvent, actionItem, actionSource, iconNode),
          });
          this.iconNodes.set(key, node);
          this.pageTrack.addChild(node);
        } else if (!isNewNode && (shouldSnapResizeLayout || (shouldSnapDragHandoffLayout && shouldSpringLayout))) {
          // Resize must reach the current target even when consecutive plans differ
          // by less than the animation threshold; skipped deltas otherwise accumulate.
          snapIconLayoutPosition(
            node as DesktopIconNode,
            layoutTarget,
            markBoundsDirty,
            shouldSnapDragHandoffLayout
              ? DESKTOP_DRAG_HANDOFF_LAYOUT_REASON
              : DESKTOP_RESIZE_LAYOUT_REASON
          );
        } else if (!isNewNode && !isFolderClosingHandoff && shouldSpringLayout) {
          springIconLayoutPosition(node as DesktopIconNode, layoutTarget, markBoundsDirty);
        }

        node!.stageRect = state.stageRect;
        node!.__folderSourceGhostedByOwnership = Boolean(entry.isFolderSourceGhosted);
        node!.setState(nodeState);
        if (isNewNode) {
          node!.alpha = isFolderClosingHandoff || shouldSnapDragHandoffLayout || isProvisionalRollbackTarget ? 1 : 0;
          node!.position.set(
            layoutTarget.x,
            isFolderClosingHandoff || shouldSnapDragHandoffLayout || isProvisionalRollbackTarget
              ? layoutTarget.y
              : layoutTarget.y + 8
          );
          if (!isFolderClosingHandoff && !shouldSnapDragHandoffLayout && !isProvisionalRollbackTarget) {
            motion(node)
              .preset("fade")
              .layout()
              .interrupt("retarget")
              .to({ alpha: 1 })
              .start();
            springIconLayoutPosition(node!, layoutTarget, markBoundsDirty);
          }
        }
        if (isProvisionalRollbackTarget) {
          node!.renderable = false;
          node!.eventMode = "none";
        }
        let folderHandoffEntry = effectiveFolderHandoffEntry;
        if (isFolderClosingHandoff && isActiveFolderClosingHandoff) {
          this.ensureFolderHandoffNode(item.id, node!, layoutTarget, { revealLabel: false });
          folderHandoffEntry = this.getFolderHandoffEntry(item.id);
        } else if (isFolderClosingHandoff && folderHandoffEntry) {
          this.syncFolderHandoffNode(node, layoutTarget, folderHandoffEntry);
        }
        if (isFolderClosingHandoff && folderHandoffEntry?.visualReleased) {
          this.revealFolderHandoffLabelWhenSettled(folderHandoffEntry, state, { animate: false });
        }

        if (entry.boundsEntry) {
          boundsEntries.push({
            ...entry.boundsEntry,
            node,
          } as DesktopBoundsEntry);
        }
      }

      this.emptyText.visible = plan.emptyText.visible;
      this.emptyText.position.set(plan.emptyText.x, plan.emptyText.y);
      for (const [key, node] of this.iconNodes) {
        if (seen.has(key)) continue;
        // Retain only ordinary app nodes across desktop/search transitions.
        // Detached nodes cannot receive input or participate in bounds lookup.
        if(this.reuseSearchNodes&&pageTrackScopeChanged&&node.item?.type==="app"
          &&!node.state?.dragging&&!node.state?.ghosted&&!node.state?.opening){
          this.iconNodes.delete(key);node.removeFromParent();killAllMotion(node);node.stopJiggle();
          node.setInteractionPhase(null,{immediate:true});
          node.clearAppFolderCreateHoverAnimation({immediate:true});
          node.eventMode="none";node.visible=false;
          this.searchNodeCache.set(key,node);
          continue;
        }
        this.retireIconNode(key, node, {
          immediate: pageTrackScopeChanged ||
            groupTransferOwnedItemIds.has(node?.item?.id as string) ||
            groupTransferOwnedFolderShellIds.has(node?.item?.id as string),
        });
      }
      // At most one viewport's realized pages, regardless of total catalogue size.
      if(this.reuseSearchNodes){
        const cacheLimit=Math.max(previousPlan?.entries.length??0,plan.entries.length);
        while(this.searchNodeCache.size>cacheLimit){
          const [key,node]=this.searchNodeCache.entries().next().value!;
          this.searchNodeCache.delete(key);destroyDisplayObjectAfterFrame(node,{children:true});
        }
      }

      this.boundsRegistration = makeDesktopBoundsRegistration<DesktopBoundsEntry, DesktopRect>(
        state,
        boundsEntries,
        plan.desktopFrame,
      );
      updatePageTrackMotion(this.pageTrackMotion, this.pageTrack, {
        debugMetadata: plan.pageTrack.debugMetadata,
        onFrame: markBoundsDirty,
        pageIndex: plan.pageTrack.pageIndex,
        pageSpan: plan.pageTrack.pageSpan,
        scrub: pageTrackScopeChanged ? null : plan.pageTrack.scrub,
        sourceLabel: plan.pageTrack.sourceLabel,
        snap: plan.pageTrack.snap || pageTrackScopeChanged || state.snapDesktopLayout === true,
        springConfig: motionSprings.layout,
      });
      this.flushInteractiveBounds({ force: true });
      this.startPreparedProvisionalFolderRollback(provisionalRollbackPreparation);
    }
    this.updateSingleStageFolderLayer(state);
    this.updateFolderDropTargetLayers(plan, state);
    this.applyGroupTransferOwnershipSnapshot({
      folderShellIds: state.groupTransferOwnedFolderShellIds || new Set(),
      itemIds: state.groupTransferOwnedItemIds || new Set(),
    });
    const committedOwnershipSourceGhostedIds = getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership);
    const committedHandoffObservation = this.captureFolderHandoffObservation(
      state,
      mergeFolderIdSets(
        state.groupTransferOwnedFolderShellIds,
        committedOwnershipSourceGhostedIds,
        new Set(this.getFolderHandoffNodes().keys())
      )
    );
    this.applyFolderSourceGhosting(state, {
      handoffObservation: committedHandoffObservation,
      visualOwnershipIds: committedOwnershipSourceGhostedIds,
    });
    this.updateGroupDragLayer(state);
    this.updateDiagnostics(state);
    const handoffReconciled = this.reconcileFolderHandoffs(state, committedHandoffObservation);
    return {
      fullPlanBuilds: shouldApplyDesktopPlan ? 1 : 0,
      handoffReconciliations: handoffReconciled ? 1 : 0,
      reconciledNodes: shouldApplyDesktopPlan ? plan.entries.length : 0,
    };
  }

  updateVisual(state: DesktopVisualFrame): Partial<DesktopLayerFrameWork> {
    this.stageRect = state.stageRect;
    this.widthValue = state.width;
    this.heightValue = state.height;
    this.describeMotionTargets(state);
    this.applyDesktopVisualTransform(state);
    this.applyDesktopVisualAlpha(state);
    this.applyFolderOverlayTransform(state);
    this.applyFolderOverlayAlpha(state);
    return { fullPlanBuilds: 0, handoffReconciliations: 0, reconciledNodes: 0 };
  }

  updateDiagnostics(state: DesktopDiagnosticsState): Partial<DesktopLayerFrameWork> {
    this.singleStageDiagnosticsLayer.update(state.singleStageFolderState, {
      enabled: state.singleStageDiagnosticsEnabled,
      iconBoundsRegistry: this.iconBoundsRegistry,
    });
    this.dragHitDebugLayer?.update?.(normalizeDragHitDebugSnapshot(state.dragHitDebugState), {
      enabled: state.dragHitDebugOptions?.enabled === true,
      stageRect: state.stageRect,
    });
    return { fullPlanBuilds: 0, handoffReconciliations: 0, reconciledNodes: 0 };
  }

  tickFolderHandoff(state: DesktopHandoffFrame): Partial<DesktopLayerFrameWork> {
    const handoffReconciled = this.reconcileFolderHandoffs(state);
    return {
      fullPlanBuilds: 0,
      handoffReconciliations: handoffReconciled ? 1 : 0,
      reconciledNodes: 0,
    };
  }

  reconcileFolderHandoffs(
    state: DesktopHandoffStateLike,
    handoffObservation: DesktopHandoffObservation | null = null,
  ): boolean {
    const entries = Array.from(this.getFolderHandoffNodes().values());
    const observation = handoffObservation ?? this.captureFolderHandoffObservation(
      state,
      entries.map((entry) => entry.folderId)
    );
    let handoffReconciled = false;
    for (const entry of entries) {
      if (this.reconcileFolderHandoffEntry(state, entry, observation)) {
        handoffReconciled = true;
      }
    }
    if (handoffReconciled) this.onFolderRenderRequest("folder-handoff-reconciled");
    return handoffReconciled;
  }

  captureFolderHandoffObservation(
    state: Partial<DesktopHandoffStateLike> | null | undefined,
    extraFolderIds: readonly string[] | ReadonlySet<string> = [],
  ): DesktopHandoffObservation {
    return captureDesktopHandoffObservation(
      this.singleStageFolderLayer,
      mergeFolderIdSets(
        state?.folderClosingHandoffIds,
        state?.folderSourceGhostedIds,
        extraFolderIds
      )
    );
  }

  reconcileFolderHandoffEntry(
    state: DesktopHandoffStateLike,
    entry: DesktopFolderHandoffEntry,
    handoffObservation: DesktopHandoffObservation | null = null,
  ): boolean {
    if (this.isProvisionalFolderRollbackActive(entry?.folderId)) return false;
    const observation = handoffObservation ?? this.captureFolderHandoffObservation(
      state,
      entry?.folderId ? [entry.folderId] : []
    );
    const rawSourceGhostingSettling = entry?.visualReleased === true && (
      state.folderSourceGhostedIds.has(entry.folderId) ||
      state.isFolderOpeningPreviewFrameGhosted(entry.folderId) === true
    );
    const noSubstitute = !rawSourceGhostingSettling &&
      shouldFinishFolderHandoffEntry(state, observation, entry.folderId);
    const pageTrackInFlight = noSubstitute && isPageTrackMotionActive(this.pageTrackMotion, this.pageTrack);
    if (noSubstitute && !pageTrackInFlight) {
      const hadCleanupFrame = entry.cleanupFrame != null;
      this.finishFolderHandoffNodeAfterFrame(entry.folderId);
      return !hadCleanupFrame && entry.cleanupFrame != null;
    } else if (!pageTrackInFlight && isStaleHiddenFolderHandoffEntry(state, entry, observation, entry.folderId)) {
      // Close finished without ever restoring this entry, yet a stale Vue closing
      // id keeps it alive and hidden. Restore the artwork without retiring; the
      // label still waits for source ownership to settle.
      const wasReleased = entry.visualReleased === true;
      this.restoreFolderHandoffVisual(entry);
      this.revealFolderHandoffLabelWhenSettled(entry, state, { animate: false });
      return !wasReleased && entry.visualReleased === true;
    }
    return false;
  }

  describeMotionTargets(
    state: Readonly<{ height?: number; width?: number }> = {},
  ): void {
    const base = {
      height: state.height ?? this.heightValue ?? null,
      label: "Desktop",
      layer: "desktop",
      width: state.width ?? this.widthValue ?? null,
    };
    const describe = (
      target: MotionTarget | null | undefined,
      metadata: Readonly<Record<string, unknown>>,
      overlayTarget: MotionTarget | null | undefined = target,
    ) => {
      if (target) motionRuntime.describeTarget(target, { ...metadata, overlayTarget });
    };
    describe(this.visualRoot, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.visualRoot",
      targetPart: "visualRoot",
    }, this.visualRoot);
    describe(this.visualRoot?.scale, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.visualScale",
      targetPart: "visualRoot.scale",
    }, this.visualRoot);
    describe(this.desktopClosingUnderlayLayer, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.closingUnderlay",
      targetPart: "closingUnderlay",
    }, this.desktopClosingUnderlayLayer);
    describe(this.desktopClosingUnderlayLayer?.scale, {
      ...base,
      kind: "Desktop",
      sourceLabel: "desktop.closingUnderlayScale",
      targetPart: "closingUnderlay.scale",
    }, this.desktopClosingUnderlayLayer);
    describe(this.singleStageFolderLayer, {
      ...base,
      kind: "FolderOverlay",
      sourceLabel: "folder.overlay",
      targetPart: "singleStageFolderLayer",
    }, this.singleStageFolderLayer);
    describe(this.singleStageFolderLayer?.scale, {
      ...base,
      kind: "FolderOverlay",
      sourceLabel: "folder.overlayScale",
      targetPart: "singleStageFolderLayer.scale",
    }, this.singleStageFolderLayer);
    describe(this.pageTrack, {
      ...base,
      kind: "PageTrack",
      label: "Desktop page track",
      sourceLabel: "desktop.pageTrack",
      targetPart: "pageTrack",
    }, this.pageTrack);
  }

  applyDesktopVisualTransform(state: DesktopVisualState): void {
    const transform: Partial<SceneVisualTransform> = state.desktopVisualTransform || {};
    const scale = Math.max(0.01, readNumber(transform.scale, 1));
    const offsetY = readNumber(transform.y, 0);
    const centerX = Math.max(1, readNumber(state.width, 1)) / 2;
    const centerY = Math.max(1, readNumber(state.height, 1)) / 2;
    const targetY = centerY + offsetY;
    const shouldSnapResizeLayout = state.snapDesktopLayout === true;
    this.visualRoot.pivot.set(centerX, centerY);
    this.desktopClosingUnderlayLayer.pivot.set(centerX, centerY);
    if (!this.hasDesktopVisualTransform) {
      this.visualRoot.position.set(centerX, targetY);
      this.visualRoot.scale.set(scale);
      this.desktopClosingUnderlayLayer.position.set(centerX, targetY);
      this.desktopClosingUnderlayLayer.scale.set(scale);
      this.hasDesktopVisualTransform = true;
      return;
    }
    const markBoundsDirty = () => this.markInteractiveBoundsDirty();
    const motionOptions = {
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      snap: shouldSnapResizeLayout,
    };
    motionSpringTo(this.visualRoot, { x: centerX, y: targetY }, motionSprings.settle, motionOptions);
    motionSpringTo(this.visualRoot.scale, { x: scale, y: scale }, motionSprings.settle, motionOptions);
    motionSpringTo(this.desktopClosingUnderlayLayer, { x: centerX, y: targetY }, motionSprings.settle, motionOptions);
    motionSpringTo(this.desktopClosingUnderlayLayer.scale, { x: scale, y: scale }, motionSprings.settle, motionOptions);
  }

  applyDesktopVisualAlpha(state: DesktopVisualState): void {
    const alpha = resolveDesktopVisualAlpha(state);
    this.visualRoot.visible = true;
    this.visualRoot.interactiveChildren = alpha > 0.001;
    this.desktopClosingUnderlayLayer.visible = true;
    this.desktopClosingUnderlayLayer.interactiveChildren = false;
    if (!this.hasDesktopVisualAlpha) {
      this.visualRoot.alpha = alpha;
      this.desktopClosingUnderlayLayer.alpha = alpha;
      this.hasDesktopVisualAlpha = true;
      return;
    }
    motionSpringTo(this.visualRoot, { alpha }, motionSprings.settle);
    motionSpringTo(this.desktopClosingUnderlayLayer, { alpha }, motionSprings.settle);
  }

  applyFolderOverlayAlpha(state: DesktopVisualState): void {
    const alpha = resolveLaunchpadVisualAlpha(state);
    this.singleStageFolderLayer.visible = true;
    this.singleStageFolderLayer.interactiveChildren = alpha > 0.001;
    if (!this.hasFolderOverlayAlpha) {
      this.singleStageFolderLayer.alpha = alpha;
      this.hasFolderOverlayAlpha = true;
      return;
    }
    motionSpringTo(this.singleStageFolderLayer, { alpha }, motionSprings.settle);
  }

  hasSingleStageFolderOverlayContent(state: Readonly<{
    isFolderOverlayActive?: boolean;
    singleStageFolderState?: Readonly<{ renderedFolder?: unknown }> | null;
  }> = {}): boolean {
    if (typeof state.isFolderOverlayActive === "boolean") return state.isFolderOverlayActive;
    return Boolean(state.singleStageFolderState?.renderedFolder);
  }

  applyFolderOverlayTransform(state: FolderOverlayTransformState): void {
    const transform = resolveLaunchpadVisualTransform(state);
    const centerX = Math.max(1, readNumber(state.width, 1)) / 2;
    const centerY = Math.max(1, readNumber(state.height, 1)) / 2;
    const targetY = centerY + transform.y;
    this.singleStageFolderLayer.pivot.set(centerX, centerY);
    const shouldSnap = state.snapDesktopLayout === true || !this.hasSingleStageFolderOverlayContent(state);
    if (!this.hasFolderOverlayTransform) {
      this.singleStageFolderLayer.position.set(centerX, targetY);
      this.singleStageFolderLayer.scale.set(transform.scale);
      this.hasFolderOverlayTransform = true;
      return;
    }
    const markBoundsDirty = () => this.markInteractiveBoundsDirty();
    motionSpringTo(this.singleStageFolderLayer, { x: centerX, y: targetY }, motionSprings.settle, {
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      snap: shouldSnap,
    });
    motionSpringTo(this.singleStageFolderLayer.scale, { x: transform.scale, y: transform.scale }, motionSprings.settle, {
      onComplete: markBoundsDirty,
      onUpdate: markBoundsDirty,
      snap: shouldSnap,
    });
  }

  updateSingleStageFolderLayer(state: DesktopFolderLayerUpdateState): void {
    const liveX = Number.isFinite(Number(this.pageTrack?.x)) ? Number(this.pageTrack.x) : 0;
    const targetX = Number.isFinite(Number(this.lastDesktopRenderPlan?.targetX))
      ? Number(this.lastDesktopRenderPlan!.targetX)
      : liveX;
    const desktopPageTrackOffset = { liveX, targetX };
    if (state.singleStageFolderState) {
      const folderState = state.singleStageFolderState;
      const folderUpdate = {
        ...state.singleStageFolderState,
        desktopPageTrackOffset,
        groupTransferOwnedItemIds: state.groupTransferOwnedItemIds || new Set(),
      };
      this.onFolderGeometryChange(this.singleStageFolderLayer.update(
        folderState.renderedFolder
          ? { ...folderUpdate, renderedFolder: folderState.renderedFolder }
          : { ...folderUpdate, renderedFolder: null },
      ));
      return;
    }
    this.onFolderGeometryChange(this.singleStageFolderLayer.update({
      desktopPageTrackOffset,
      folderPanelRef: null,
      folderViewportRef: null,
      height: state.height,
      renderedFolder: null,
      stageRect: state.stageRect,
      width: state.width,
    }));
  }

  applyFolderSourceGhosting(
    state: DesktopGhostingState,
    options: FolderSourceGhostingOptions = {},
  ): void {
    if (options.remember !== false) this.lastFolderSourceGhostingState = state;
    const rawIds = state.folderSourceGhostedIds;
    const visualOwnershipIds = options.visualOwnershipIds ??
      getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership);
    const handoffObservation = options.handoffObservation ?? this.captureFolderHandoffObservation(
      state,
      mergeFolderIdSets(
        visualOwnershipIds,
        new Set(this.getFolderHandoffNodes().keys())
      )
    );
    const ownershipIds = mergeFolderIdSets(
      state.groupTransferOwnedFolderShellIds,
      visualOwnershipIds,
      handoffObservation.desktopSourceGhostedIds
    );
    for (const node of this.iconNodes.values()) {
      if (node.item?.type !== "folder" || !node.state) continue;
      const folderId = node.item.id;
      const rawGhosted = rawIds.has(folderId) || state.isFolderOpeningPreviewFrameGhosted?.(folderId);
      const ownershipGhosted = ownershipIds.has(folderId);
      const nextGhosted = rawGhosted || ownershipGhosted;
      const handoffEntry = this.getFolderHandoffEntry(folderId);
      if (handoffEntry) {
        const desktopSourceOwnerKind = getDesktopSourceOwnerKind(this.visualOwnership, folderId);
        const openingSourceGhosted = desktopSourceOwnerKind === "opening" ||
          isFolderOpeningSourceGhosted(state, folderId);
        const activeClosingHandoff = hasFolderClosingHandoffId(state, folderId) ||
          handoffObservation.activeClosingFolderIds.has(folderId);
        const shouldKeepPreparedHandoff = handoffEntry.visualReleased !== true &&
          (activeClosingHandoff || (ownershipGhosted && !openingSourceGhosted));
        const retainsSourceVisibility = handoffEntry.visualReleased === true &&
          !openingSourceGhosted &&
          (activeClosingHandoff || rawGhosted || handoffEntry.cleanupFrame != null) &&
          nextGhosted;
        // Only retire the handoff node once the closing handoff is no longer
        // active; clearing it mid-handoff (rawGhosted is true throughout a close)
        // re-creates a fresh entry every frame, resetting visualReleased and
        // re-hiding visualWrap, so the icon stays blank until the active close ends.
        // Opening ownership is different: it must hide the real desktop source
        // through normal ghosted state instead of retaining a released close handoff.
        if (!shouldKeepPreparedHandoff && !retainsSourceVisibility && (rawGhosted || (ownershipGhosted && handoffEntry.visualReleased === true))) {
          this.clearFolderHandoffNode(folderId);
        } else {
          node.__folderSourceGhostedByOwnership = Boolean(nextGhosted);
          continue;
        }
      }
      const previousGhostedByOwnership = node.__folderSourceGhostedByOwnership === true;
      const nextGhostedByOwnership = Boolean(nextGhosted);
      const ownershipGhostMissingFromNode = nextGhostedByOwnership && !node.state.ghosted;
      if (previousGhostedByOwnership === nextGhostedByOwnership && !ownershipGhostMissingFromNode) continue;
      const baseGhosted = Boolean(node.state.ghosted) && !previousGhostedByOwnership;
      node.__folderSourceGhostedByOwnership = nextGhostedByOwnership;
      node.setState({ ...node.state, ghosted: baseGhosted || nextGhostedByOwnership });
    }
  }

  commitFolderSourceGhosting(): void {
    if (!this.lastFolderSourceGhostingState) return;
    const state = this.lastFolderSourceGhostingState;
    const visualOwnershipIds = getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership);
    const observation = this.captureFolderHandoffObservation(
      state,
      mergeFolderIdSets(
        visualOwnershipIds,
        new Set(this.getFolderHandoffNodes().keys())
      )
    );
    this.applyFolderSourceGhosting(state, {
      handoffObservation: observation,
      visualOwnershipIds,
    });
    this.reconcileFolderHandoffEntries(state, observation);
  }

  reconcileFolderHandoffEntries(
    state: DesktopHandoffStateLike,
    handoffObservation: DesktopHandoffObservation | null = null,
  ): void {
    const entries = Array.from(this.getFolderHandoffNodes().values());
    const observation = handoffObservation ?? this.captureFolderHandoffObservation(
      state,
      entries.map((entry) => entry.folderId)
    );
    for (const entry of entries) {
      this.reconcileFolderHandoffEntry(state, entry, observation);
    }
  }

  updateFolderDropTargetLayers(
    plan: DesktopRenderPlanWithRevision,
    state: Readonly<{ stageRect: StageRect }>,
  ): void {
    const target = plan?.folderDropTarget || null;
    const targetEntry = target
      ? plan.entries.find((entry) => entry.item?.id === target.targetId && entry.item?.type === "folder") || null
      : null;
    const context = {
      exitTransition: plan?.folderDropTargetExit || null,
      stageRect: state.stageRect,
      targetNode: targetEntry ? this.iconNodes.get(targetEntry.key) || null : null,
    };
    this.folderDropFillLayer?.update?.(target, context);
    this.folderDropStrokeLayer?.update?.(target, context);
  }

  holdFolderDropFrameSuppression(folderId: string | null | undefined): void {
    if (!folderId) return;
    this.folderDropFrameSuppressedIds.add(folderId);
  }

  releaseFolderDropFrameSuppression(folderId: string | null | undefined): void {
    if (!folderId || !this.folderDropFrameSuppressedIds.delete(folderId)) return;
    this.onFolderRenderRequest("folder-drop-target-exit-complete");
  }

  updateGroupDragLayer(state: DesktopInteractiveState): void {
    const updateState: GroupDragUpdateState = {
      deviceResolution: state.deviceResolution,
      desktopVisualSpec: makeDesktopDragVisualSpec(this.lastDesktopRenderPlan),
      dragFolderHoverState: state.dragFolderHoverState,
      folderPageSize: state.folderPageSize,
      folderVisualSpec: this.singleStageFolderLayer?.stableFolderSlotContext?.visualSpec || null,
      groupState: normalizeGroupDragUpdateGroup(state.groupDragState),
      height: state.height,
      iconSize: state.iconSize,
      isTextlessMode: state.isTextlessMode,
      launchTargetStatusById: state.launchTargetStatusById,
      releasePrewarmCount: state.isBatchSelectionActive
        ? Math.max(
          1,
          Number(state.folderPageSize) || 1,
          (Number(state.gridCols) || 1) * (Number(state.gridRows) || 1)
        )
        : 0,
      showMissingLaunchTargetBadge: state.showMissingLaunchTargetBadge,
      stageRect: state.stageRect,
      width: state.width,
    };
    this.groupDragLayer?.update?.(updateState);
  }

  applyImmediateGroupTransferOwnership(group: unknown): boolean {
    const ownership = this.groupDragLayer!.syncVisualOwnership(normalizeGroupDragOwnershipGroup(group));
    return this.applyGroupTransferOwnershipSnapshot(ownership);
  }

  applyGroupTransferOwnershipSnapshot(
    ownership: Partial<GroupOwnershipSnapshot> = {},
  ): boolean {
    const itemIds = ownership.itemIds instanceof Set ? ownership.itemIds : new Set();
    const folderShellIds = ownership.folderShellIds instanceof Set ? ownership.folderShellIds : new Set();
    let changed = false;
    for (const node of this.iconNodes.values()) {
      if (!node?.state) continue;
      const wasDirectlyOwned = node.__groupTransferGhostedByOwnership === true;
      const isDirectlyOwned = itemIds.has(node.item?.id) || folderShellIds.has(node.item?.id);
      const previousSuppressedFolderPreviewChildIds = node.__groupTransferSuppressedFolderPreviewChildIds || [];
      const suppressedFolderPreviewChildIds = node.item?.type === "folder"
        ? (node.item.childPages || [])
          .flatMap((page) => page || [])
          .filter((child): child is DesktopItem => Boolean(child && itemIds.has(child.id)))
          .map((child) => child.id)
        : [];
      const previewSuppressionChanged = previousSuppressedFolderPreviewChildIds.length !== suppressedFolderPreviewChildIds.length ||
        previousSuppressedFolderPreviewChildIds.some((id, index) => id !== suppressedFolderPreviewChildIds[index]);
      if (!wasDirectlyOwned && !isDirectlyOwned && !previewSuppressionChanged) continue;
      if (isDirectlyOwned && !wasDirectlyOwned) {
        killMotionOf(node, null, { reason: "group-release-source-handoff" });
        killMotionOf(node.scale, null, { reason: "group-release-source-handoff" });
      }
      if (!isDirectlyOwned && wasDirectlyOwned) {
        const committedEntry = this.lastDesktopRenderPlan?.entries?.find(
          (entry) => entry.item?.id === node.item?.id
        );
        if (committedEntry?.layoutTarget) {
          snapIconLayoutPosition(
            node,
            committedEntry.layoutTarget,
            () => this.markInteractiveBoundsDirty(),
            GROUP_TRANSFER_OWNERSHIP_HANDOFF_LAYOUT_REASON
          );
        }
      }
      const baseGhosted = Boolean(node.state.ghosted) && !wasDirectlyOwned;
      node.__groupTransferGhostedByOwnership = isDirectlyOwned;
      node.__groupTransferSuppressedFolderPreviewChildIds = [...suppressedFolderPreviewChildIds];
      node.setState({
        ...node.state,
        dragging: isDirectlyOwned ? node.state.dragging : false,
        ghosted: baseGhosted || node.__folderSourceGhostedByOwnership === true || isDirectlyOwned,
        suppressedFolderPreviewChildIds,
        suppressLabelRevealAfterGhost: true,
      });
      changed = true;
    }
    if (this.singleStageFolderLayer?.applyGroupTransferOwnershipSnapshot?.({ itemIds })) {
      changed = true;
    }
    return changed;
  }

  resolveGroupReleaseFolderNode({ target }: GroupReleaseRequest = {}): IconNode | null {
    const folderId = target?.folderId || null;
    if (!folderId) return null;
    const handoffNode = this.getFolderHandoffEntry(folderId)?.node;
    if (handoffNode && !handoffNode.destroyed) return handoffNode;
    const desktopNode = this.findIconNodeByItemId(folderId);
    if (desktopNode && !desktopNode.destroyed) return desktopNode;
    for (const node of this.singleStageFolderLayer?.iconNodes?.values?.() || []) {
      if (node?.item?.id === folderId && !node.destroyed) return node;
    }
    return null;
  }

  resolveGroupFolderClipGeometry() {
    const panelNode = this.singleStageFolderLayer?.panel || null;
    const panel = this.singleStageFolderLayer?.panelGeometry || null;
    const layer = this.groupDragLayer;
    if (!panelNode || panelNode.destroyed || !panel || !layer || layer.destroyed) return null;
    const origin = layer.toLocal({ x: 0, y: 0 }, panelNode);
    const xAxis = layer.toLocal({ x: 1, y: 0 }, panelNode);
    const yAxis = layer.toLocal({ x: 0, y: 1 }, panelNode);
    const scaleX = Math.hypot(xAxis.x - origin.x, xAxis.y - origin.y);
    const scaleY = Math.hypot(yAxis.x - origin.x, yAxis.y - origin.y);
    if (!Number.isFinite(scaleX) || scaleX <= 0 || !Number.isFinite(scaleY) || scaleY <= 0) {
      return null;
    }
    return {
      height: panel.height,
      radius: 48,
      rotation: Math.atan2(xAxis.y - origin.y, xAxis.x - origin.x),
      scaleX,
      scaleY,
      width: panel.width,
      x: origin.x,
      y: origin.y,
    };
  }

  resolveGroupReleasePoint({ entry, node: releaseNode, target, state }: GroupReleaseRequest = {}) {
    const semanticAnchor = target?.semanticAnchor || null;
    const resolveStableFolderSlotStageRect = (anchor: GroupSemanticAnchor) => {
      const record = this.singleStageFolderLayer?.resolveStableIconSlotRecord?.(anchor);
      const clientRect = stageLayoutRecordToClientRect(record);
      return clientRectToStageVisualRect(clientRect, state?.stageRect);
    };
    const makeResolvedPoint = (visualTarget: StagePoint | null, targetScale: StagePoint | null = { x: 1, y: 1 }) => {
      const resolvedVisualTarget = entry?.visibilityPolicy?.kind === "desktop-occluded-egress"
        ? resolvePanelEgressPoint(
          visualTarget,
          this.singleStageFolderLayer?.panelGeometry || null
        )
        : visualTarget;
      return {
        point: resolveReleaseRootPoint(releaseNode, resolvedVisualTarget, targetScale),
        scale: targetScale,
      };
    };
    if (semanticAnchor?.kind?.startsWith("desktop-page-edge-")) {
      const goesLeft = semanticAnchor.kind.endsWith("-left");
      const width = Math.max(1, Number(state?.width) || 1);
      const height = Math.max(1, Number(state?.height) || 1);
      const laneY = Math.max(0, Math.min(1, Number(semanticAnchor.laneY) || 0.5));
      const metrics = getDesktopGridMetrics({
        cols: state?.gridCols as number,
        height,
        rows: state?.gridRows as number,
        width,
      } as Parameters<typeof getDesktopGridMetrics>[0]);
      return makeResolvedPoint({
        x: goesLeft ? -28 : width + 28,
        y: metrics.gridTop + metrics.gridHeight * laneY,
      }, { x: 0.72, y: 0.72 });
    }
    if (semanticAnchor?.kind?.startsWith("folder-page-edge-")) {
      const panel = this.singleStageFolderLayer?.panelGeometry || null;
      if (!panel) return null;
      const goesLeft = semanticAnchor.kind.endsWith("-left");
      const grid = this.singleStageFolderLayer?.targetFolderGeometry?.grid || null;
      const laneY = Math.max(0, Math.min(1, Number(semanticAnchor.laneY) || 0.5));
      const stableSlotRect = resolveStableFolderSlotStageRect(semanticAnchor);
      return makeResolvedPoint({
        x: goesLeft ? panel.left - 24 : panel.left + panel.width + 24,
        y: stableSlotRect
          ? stableSlotRect.top + stableSlotRect.height / 2
          : grid
            ? grid.top + grid.height * laneY
            : panel.top + panel.height * laneY,
      }, { x: 0.62, y: 0.62 });
    }
    if (semanticAnchor?.kind === "folder-preview-slot") {
      const previewRect = this.iconBoundsRegistry?.getBounds?.(
        BOUNDS_KIND.PREVIEW_CHILD,
        BOUNDS_VARIANT.RENDERED,
        {
          childId: semanticAnchor.itemId || entry?.id,
          folderId: semanticAnchor.folderId,
          slotIndex: semanticAnchor.slotIndex,
        }
      );
      const previewStageRect = clientRectToStageVisualRect(previewRect, state?.stageRect);
      if (!previewStageRect) return null;
      const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
        targetStageRect: previewStageRect,
      });
      return makeResolvedPoint({
        x: previewStageRect.left + previewStageRect.width / 2,
        y: previewStageRect.top + previewStageRect.height / 2,
      }, targetScale);
    }
    if (semanticAnchor?.kind === "folder-center") {
      const folderNode = this.resolveGroupReleaseFolderNode({ target: semanticAnchor });
      const pose = folderNode?.getFolderCenterReleasePose?.(this.groupDragLayer);
      if (!pose?.center) return null;
      return makeResolvedPoint(pose.center, { x: 0.35, y: 0.35 });
    }
    if (semanticAnchor?.kind === "folder-open-slot") {
      const stableSlotRect = resolveStableFolderSlotStageRect(semanticAnchor);
      if (!stableSlotRect) return null;
      const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
        targetStageRect: stableSlotRect,
      });
      return makeResolvedPoint({
        x: stableSlotRect.left + stableSlotRect.width / 2,
        y: stableSlotRect.top + stableSlotRect.height / 2,
      }, targetScale);
    }
    const targetId = target?.id || entry?.id || null;
    if (!targetId) return null;
    if (semanticAnchor?.kind === "desktop-slot") {
      const pageIndex = Number.isFinite(Number(semanticAnchor.pageIndex))
        ? Number(semanticAnchor.pageIndex)
        : Number(target?.pageIndex) || 0;
      const stableRecord = this.iconBoundsRegistry?.getBounds?.(
        BOUNDS_KIND.LAUNCH,
        BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
        {
          area: "desktop",
          id: targetId,
          pageIndex,
        }
      );
      const stableClientRect = stageLayoutRecordToClientRect(stableRecord);
      const stableStageRect = clientRectToStageVisualRect(stableClientRect, state?.stageRect);
      const stableIndex = Number(stableRecord?.meta?.index);
      const expectedIndex = Number(semanticAnchor.index);
      if (
        stableStageRect &&
        (!Number.isFinite(expectedIndex) || !Number.isFinite(stableIndex) || stableIndex === expectedIndex)
      ) {
        const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
          targetStageRect: stableStageRect,
        });
        return makeResolvedPoint({
          x: stableStageRect.left + stableStageRect.width / 2,
          y: stableStageRect.top + stableStageRect.height / 2,
        }, targetScale);
      }
      return null;
    }
    const nodeCandidates = [
      this.findIconNodeByItemId(targetId),
      ...Array.from(this.singleStageFolderLayer?.iconNodes?.values?.() || [])
        .filter((node) => node?.item?.id === targetId),
    ];
    for (const node of nodeCandidates) {
      if (!node || node.destroyed || !this.groupDragLayer) continue;
      const visualTarget = readVisualCenterInLayer(this.groupDragLayer, node);
      if (visualTarget) {
        const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
          targetNode: node,
        });
        return makeResolvedPoint(visualTarget, targetScale);
      }
    }
    const area = target?.area === "folder" ? "folder" : "desktop";
    const rect = this.iconBoundsRegistry?.getBounds?.(
      BOUNDS_KIND.LAUNCH,
      BOUNDS_VARIANT.RENDERED,
      {
        area,
        folderId: target?.folderId,
        id: targetId,
        pageIndex: target?.pageIndex,
      }
    );
    const stageRect = clientRectToStageVisualRect(rect, state?.stageRect);
    if (!stageRect) return null;
    const visualTarget = {
      x: stageRect.left + stageRect.width / 2,
      y: stageRect.top + stageRect.height / 2,
    };
    const targetScale = resolvePointReleaseTargetScale(this.groupDragLayer, releaseNode, {
      targetStageRect: stageRect,
    });
    return makeResolvedPoint(visualTarget, targetScale);
  }

  findFolderBoundsEntry(folderId: string | null): DesktopBoundsEntry | null {
    const entries = this.boundsRegistration?.entries || [];
    return entries.find((entry) => entry?.item?.id === folderId && entry.item.type === "folder" && entry.area === "desktop") ||
      entries.find((entry) => entry?.item?.id === folderId && entry.item.type === "folder") ||
      null;
  }

  isProvisionalFolderRollbackActive(folderId: string | null = null): boolean {
    const rollback = this.provisionalFolderRollbackState;
    return Boolean(
      rollback?.token != null &&
      (!folderId || rollback.folderId === folderId) &&
      ["closing", "dissolving"].includes(rollback.phase)
    );
  }

  detachFolderNodeForProvisionalRollback(folderId: string): DesktopIconNode {
    const entry = this.getFolderHandoffEntry(folderId);
    const node = entry?.node || this.findIconNodeByItemId(folderId);
    if (!node || node.destroyed || this.isIconNodeRetired(node)) {
      throw new Error(`Missing handed-off folder node for provisional rollback ${folderId}`);
    }
    if (entry?.cleanupFrame != null) entry.cleanupFrame.cancelled = true;
    this.getFolderHandoffNodes().delete(folderId);
    if (this.primaryFolderHandoffId === folderId) this.setPrimaryFolderHandoffNode(null);
    for (const [key, candidate] of this.iconNodes) {
      if (candidate === node) this.iconNodes.delete(key);
    }
    return node;
  }

  prepareProvisionalFolderRollback(state: Readonly<{
    provisionalFolderRollback?: ProvisionalFolderRollbackState | null;
  }>): Readonly<{
    folderNode: DesktopIconNode;
    rollback: ProvisionalFolderRollbackState;
  }> | null {
    const rollback = state.provisionalFolderRollback;
    if (rollback?.phase !== "dissolving") return null;
    if (this.provisionalFolderRollbackLayer?.hasHandledToken?.(rollback.token)) return null;
    const activeSnapshot = this.provisionalFolderRollbackLayer?.snapshot?.();
    if (activeSnapshot?.token === rollback.token) return null;
    if (activeSnapshot?.active) {
      throw new Error(`Provisional folder rollback ${activeSnapshot.token} overlaps ${rollback.token}`);
    }
    return {
      folderNode: this.detachFolderNodeForProvisionalRollback(rollback.folderId),
      rollback,
    };
  }

  startPreparedProvisionalFolderRollback(preparation: Readonly<{
    folderNode: DesktopIconNode;
    rollback: ProvisionalFolderRollbackState;
  }> | null): boolean {
    if (!preparation) return false;
    const { folderNode, rollback } = preparation;
    const targetNode = this.findIconNodeByItemId(rollback.targetAppId);
    if (!targetNode || targetNode.destroyed || this.isIconNodeRetired(targetNode)) {
      throw new Error(`Missing target app node for provisional rollback ${rollback.targetAppId}`);
    }
    return this.provisionalFolderRollbackLayer.start({
      folderId: rollback.folderId,
      folderNode,
      handoffVelocity: rollback.handoffVelocity,
      previewSlotIndex: rollback.previewSlotIndex,
      reducedMotion: rollback.reducedMotion,
      targetAppId: rollback.targetAppId,
      targetNode,
      token: rollback.token,
    });
  }

  getFolderHandoffNodes(): Map<string, DesktopFolderHandoffEntry> {
    if (!(this.folderHandoffNodes instanceof Map)) this.folderHandoffNodes = new Map();
    return this.folderHandoffNodes;
  }

  getPrimaryFolderHandoffNode(): DesktopFolderHandoffEntry | null {
    const entries = this.getFolderHandoffNodes();
    if (this.primaryFolderHandoffId && entries.has(this.primaryFolderHandoffId)) {
      return entries.get(this.primaryFolderHandoffId)!;
    }
    return entries.values().next().value || null;
  }

  getFolderHandoffEntry(folderId: string | null = null): DesktopFolderHandoffEntry | null {
    const entries = this.getFolderHandoffNodes();
    if (folderId) return entries.get(folderId) || null;
    return this.getPrimaryFolderHandoffNode();
  }

  setPrimaryFolderHandoffNode(entry: DesktopFolderHandoffEntry | null = null): void {
    this.primaryFolderHandoffId = entry?.folderId || null;
  }

  startClosingFolderHandoffNow(
    folderId: string | null,
    options: FolderHandoffOptions = {},
  ): boolean {
    const entry = this.findFolderBoundsEntry(folderId);
    const existing = this.getFolderHandoffEntry(folderId);
    const node = entry?.node || existing?.node || this.findIconNodeByItemId(folderId);
    const layoutTarget = entry?.handoffLayoutTarget || (entry ? { x: entry.x, y: entry.y } : existing?.layoutTarget);
    if (!folderId || !node || node.destroyed || this.isIconNodeRetired(node) || !layoutTarget) return false;
    return this.ensureFolderHandoffNode(folderId, node, layoutTarget, { revealLabel: false, ...options });
  }

  ensureFolderHandoffNode(
    folderId: string,
    node: DesktopIconNode,
    layoutTarget: DesktopLayoutTarget,
    options: FolderHandoffOptions = {},
  ): boolean {
    if (!folderId || !node || node.destroyed || this.isIconNodeRetired(node)) return false;
    const entries = this.getFolderHandoffNodes();
    let entry = entries.get(folderId) || null;
    if (!entry) {
      entry = {
        cleanupFrame: null,
        folderId,
        labelRevealStarted: false,
        node,
        originalIndex: this.getPageTrackChildIndex(node),
        suppressLabelReveal: false,
        visualHidden: false,
        visualReleased: false,
      };
      entries.set(folderId, entry);
    } else if (entry.node !== node) {
      this.restoreFolderHandoffNode(entry);
      entry.node = node;
      entry.originalIndex = this.getPageTrackChildIndex(node);
      entry.labelRevealStarted = false;
      entry.suppressLabelReveal = false;
      entry.visualHidden = false;
      entry.visualReleased = false;
    } else if (options.resetVisual === true) {
      entry.labelRevealStarted = false;
      entry.suppressLabelReveal = false;
      entry.visualHidden = false;
      entry.visualReleased = false;
    }
    if (entry.cleanupFrame != null) {
      entry.cleanupFrame.cancelled = true;
      entry.cleanupFrame = null;
    }
    this.setPrimaryFolderHandoffNode(entry);
    this.syncFolderHandoffNode(node, layoutTarget, entry);
    if (options.revealLabel !== false && entry.visualReleased) this.revealFolderHandoffLabel(entry);
    return true;
  }

  syncFolderHandoffNode(
    node: DesktopIconNode | null | undefined = this.folderHandoffNode?.node,
    layoutTarget: DesktopLayoutTarget | null = null,
    handoffEntry: DesktopFolderHandoffEntry | null = null,
  ): boolean {
    const entry = handoffEntry || this.getFolderHandoffEntry(node?.item?.id || this.folderHandoffNode?.folderId || null);
    if (!entry || !node || node.destroyed || this.isIconNodeRetired(node)) return false;
    const target = layoutTarget || entry.layoutTarget;
    if (!target) return false;
    entry.node = node;
    entry.layoutTarget = target;
    killMotionOf(node);
    killMotionOf(node.scale);
    node.position.set(target.x, target.y);
    node.scale.set(target.scaleX || 1, target.scaleY || target.scaleX || 1);
    node.alpha = 1;
    node.visible = true;
    node.eventMode = "static";
    node.cursor = "pointer";
    if (node.state) {
      node.state = Object.freeze({
        ...node.state,
        draggable: true,
        ghosted: false,
        interactive: true,
        preserveNodeScale: true,
      });
    }
    node.resetFolderPreviewAfterGhost?.();
    if (!entry.visualReleased) {
      if (!entry.visualHidden || !entry.labelRevealStarted) {
        if (typeof node.setFolderHandoffSourceHidden === "function") node.setFolderHandoffSourceHidden(true);
        else node.setFolderHandoffVisualHidden?.(true);
        entry.visualHidden = true;
      }
    } else if (entry.visualHidden) {
      if (typeof node.setFolderHandoffSourceHidden === "function") node.setFolderHandoffSourceHidden(false);
      else node.setFolderHandoffVisualHidden?.(false);
      entry.visualHidden = false;
    }
    if (node.parent === this.pageTrack && this.pageTrack.children.length > 1) {
      this.pageTrack.setChildIndex(node, this.pageTrack.children.length - 1);
    }
    return true;
  }

  finishFolderHandoffNodeAfterFrame(folderId: string | null = null): void {
    const entry = this.getFolderHandoffEntry(folderId);
    if (!entry || entry.cleanupFrame != null) return;
    if (!entry.visualReleased) this.restoreFolderHandoffVisual(entry, { fadeLabel: true });
    else this.revealFolderHandoffLabelWhenSettled(entry, undefined, { animate: false });
    const cleanupFrame = { cancelled: false };
    entry.cleanupFrame = cleanupFrame;
    const finish = () => {
      if (cleanupFrame.cancelled || entry.cleanupFrame !== cleanupFrame) return;
      if (this.getFolderHandoffEntry(entry.folderId) !== entry) return;
      entry.cleanupFrame = null;
      this.clearFolderHandoffNode(entry.folderId);
    };
    motionRuntime.afterFrame(finish);
  }

  releaseClosingFolderHandoffVisual(folderId: string | null = null): void {
    const entry = this.getFolderHandoffEntry(folderId);
    if (!entry || (folderId && entry.folderId !== folderId)) return;
    this.debugFolderHandoffRestore(entry, "desktop-restore-before");
    this.restoreFolderHandoffVisual(entry, {
      fadeLabel: true,
      suppressLabel: this.isProvisionalFolderRollbackActive(entry.folderId),
    });
    this.debugFolderHandoffRestore(entry, "desktop-restore-after");
  }

  revealClosingFolderHandoffLabel(folderId: string | null = null): boolean {
    if (!folderId || this.isProvisionalFolderRollbackActive(folderId)) return false;
    if (!this.startClosingFolderHandoffNow(folderId, { revealLabel: false })) return false;
    const entry = this.getFolderHandoffEntry(folderId);
    if (!entry || entry.suppressLabelReveal) return false;
    this.revealFolderHandoffLabel(entry);
    return entry.labelRevealStarted;
  }

  restoreFolderHandoffVisual(
    entry: DesktopFolderHandoffEntry | null | undefined,
    options: RestoreFolderHandoffOptions = {},
  ): void {
    const node = entry?.node;
    if (!node || node.destroyed || this.isIconNodeRetired(node)) return;
    entry.visualHidden = false;
    entry.visualReleased = true;
    if (options.suppressLabel === true || entry.suppressLabelReveal === true) {
      entry.suppressLabelReveal = true;
      entry.labelRevealStarted = true;
      if (typeof node.setFolderHandoffSourceHidden === "function") {
        node.setFolderHandoffSourceHidden(false);
      } else {
        node.setFolderHandoffVisualHidden?.(false);
      }
      if (node.labelText) {
        killMotionOf(node.labelText);
        node.labelText.alpha = 0;
        node.labelText.renderable = false;
      }
      return;
    }
    const labelFadeActive = node.folderHandoffLabelRevealInProgress === true;
    const shouldReleaseLabel = !entry.labelRevealStarted ||
      (
        options.fadeLabel !== false &&
        !labelFadeActive &&
        node.labelText?.visible &&
        Number(node.labelText.alpha) <= 0.001
      );
    if (shouldReleaseLabel) {
      entry.labelRevealStarted = true;
      if (typeof node.releaseFolderHandoffSource === "function") {
        node.releaseFolderHandoffSource({ fadeLabel: options.fadeLabel !== false });
      } else {
        node.setFolderHandoffVisualHidden?.(false);
        if (options.fadeLabel === false && typeof node.restoreLabelAfterGhost === "function") node.restoreLabelAfterGhost();
        else if (typeof node.revealLabelAfterGhost === "function") node.revealLabelAfterGhost();
        else if (node.labelText) node.labelText.alpha = 1;
      }
      return;
    }
    if (typeof node.setFolderHandoffSourceHidden === "function") node.setFolderHandoffSourceHidden(false);
    else node.setFolderHandoffVisualHidden?.(false);
  }

  isFolderHandoffLabelRevealSafe(
    entry: DesktopFolderHandoffEntry | null | undefined,
    state: DesktopHandoffStateLike = (this.lastFolderSourceGhostingState || {}) as DesktopHandoffStateLike,
  ): boolean {
    if (!entry || entry.suppressLabelReveal || !entry.visualReleased || entry.visualHidden) return false;
    if (state.folderSourceGhostedIds.has(entry.folderId)) return false;
    if (state.isFolderOpeningPreviewFrameGhosted(entry.folderId) === true) return false;
    const ownershipIds = getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership);
    if (ownershipIds.has(entry.folderId)) return false;
    const observation = this.captureFolderHandoffObservation(state, [entry.folderId]);
    return shouldFinishFolderHandoffEntry(state, observation, entry.folderId);
  }

  revealFolderHandoffLabelWhenSettled(
    entry: DesktopFolderHandoffEntry | null = this.folderHandoffNode,
    state: DesktopHandoffStateLike = (this.lastFolderSourceGhostingState || {}) as DesktopHandoffStateLike,
    options: RevealFolderHandoffOptions = {},
  ): boolean {
    if (!this.isFolderHandoffLabelRevealSafe(entry, state)) return false;
    this.revealFolderHandoffLabel(entry, options);
    return true;
  }

  revealFolderHandoffLabel(
    entry: DesktopFolderHandoffEntry | null = this.folderHandoffNode,
    options: RevealFolderHandoffOptions = {},
  ): void {
    const node = entry?.node;
    if (!entry || entry.labelRevealStarted || entry.suppressLabelReveal || !node || node.destroyed || !node.labelText?.visible) return;
    entry.labelRevealStarted = true;
    if (!entry.visualReleased) {
      node.releaseFolderHandoffLabel();
    } else if (typeof node.releaseFolderHandoffSource === "function") {
      node.releaseFolderHandoffSource({ fadeLabel: options.animate !== false });
    } else if (options.animate === false && typeof node.restoreLabelAfterGhost === "function") node.restoreLabelAfterGhost();
    else if (typeof node.revealLabelAfterGhost === "function") node.revealLabelAfterGhost();
    else node.labelText.alpha = 1;
  }

  clearFolderHandoffNode(folderId: string | null = null): void {
    if (!folderId) {
      for (const entry of Array.from(this.getFolderHandoffNodes().values())) {
        this.clearFolderHandoffNode(entry.folderId);
      }
      return;
    }
    const entry = this.getFolderHandoffEntry(folderId);
    if (entry) {
      this.lastFolderHandoffDebugSnapshot = this.makeFolderHandoffDebugSnapshot(entry, {
        active: false,
        clearing: true,
      }) || this.lastFolderHandoffDebugSnapshot;
    }
    if (!entry) return;
    if (entry.cleanupFrame != null) entry.cleanupFrame.cancelled = true;
    this.getFolderHandoffNodes().delete(entry.folderId);
    if (this.primaryFolderHandoffId === entry.folderId) this.setPrimaryFolderHandoffNode(null);
    this.restoreFolderHandoffNode(entry);
  }

  restoreFolderHandoffNode(entry: DesktopFolderHandoffEntry | null | undefined): void {
    const node = entry?.node;
    if (!node || node.destroyed || this.isIconNodeRetired(node)) return;
    this.restoreFolderHandoffVisual(entry, { fadeLabel: true });
    if (node.parent !== this.pageTrack) return;
    const childCount = this.pageTrack.children.length;
    if (!childCount) return;
    const targetIndex = Math.max(0, Math.min(entry.originalIndex ?? childCount - 1, childCount - 1));
    if (this.getPageTrackChildIndex(node) !== targetIndex) this.pageTrack.setChildIndex(node, targetIndex);
    if (entry.visualReleased) this.revealFolderHandoffLabel(entry, { animate: false });
  }

  getPageTrackChildIndex(node: DesktopIconNode): number {
    return this.pageTrack.children.indexOf(node);
  }

  debugFolderHandoffRestore(
    entry: DesktopFolderHandoffEntry,
    phase: string,
  ): Record<string, unknown> | null {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log) return null;
    const snapshot = this.makeFolderHandoffDebugSnapshot(entry, { phase });
    if (!snapshot) return null;
    sceneDiagnosticsState.publish("folderHandoff", {
      ...snapshot,
      desktopLogged: false,
      phase,
    });
    console.log("[folder-handoff-debug] desktop-restore", {
      ...snapshot,
      phase,
    });
    return snapshot;
  }

  makeFolderHandoffDebugSnapshot(
    entry: FolderHandoffDebugEntry | DesktopFolderHandoffEntry | null | undefined,
    options: FolderHandoffDebugOptions = {},
  ): Record<string, unknown> | null {
    const node = entry?.node;
    if (!entry || !node || node.destroyed) return null;
    const registration: Readonly<{
      height?: number | null | undefined;
      stageRect?: DesktopRect | null | undefined;
      width?: number | null | undefined;
    }> = this.boundsRegistration || {};
    const stageRect = registration.stageRect || this.stageRect;
    const folderId = entry.folderId || node.item?.id || null;
    const thumbRect = node.getFolderThumbBounds?.(stageRect) || null;
    const iconRect = node.getIconBounds?.(stageRect) || null;
    const liveTargetRect = folderId ? this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.LIVE_TARGET, folderId) : null;
    const stableStageLayoutTargetRecord = folderId ? this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folderId) : null;
    const stableTargetRect = projectStageLayoutRecordToClient(stableStageLayoutTargetRecord);
    const registeredThumbRect = folderId ? this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, folderId) : null;
    const targetRect = liveTargetRect || registeredThumbRect || stableTargetRect;
    const childRows: FolderDebugRow[] = [];
    for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] : null;
      if (!child?.id) continue;
      const actualRect = node.getFolderPreviewChildBounds(stageRect, slotIndex);
      const targetChildRect = targetRect ? makeFolderThumbPreviewRect(targetRect, slotIndex) : null;
      childRows.push({
        actual: roundRect(actualRect, 2),
        delta: rectDelta(actualRect, targetChildRect),
        slot: slotIndex,
        target: roundRect(targetChildRect, 2),
      });
    }
    return {
      active: options.active !== false,
      childMaxDelta: maxAbsRectDelta(childRows),
      childRows,
      childWorstDelta: worstRectDelta(childRows),
      childIndex: this.getPageTrackChildIndex(node),
      clearing: options.clearing === true,
      desktopClosingUnderlayLayer: roundTransformObject(this.desktopClosingUnderlayLayer),
      folderId,
      iconRect: roundRect(iconRect, 2),
      layoutTarget: roundDebugObject(entry.layoutTarget),
      liveTargetRect: roundRect(liveTargetRect, 2),
      node: {
        alpha: Math.round((node.alpha ?? 0) * 1000) / 1000,
        eventMode: node.eventMode,
        folderChildrenWrapScaleX: node.folderChildrenWrap?.scale ? Math.round((node.folderChildrenWrap.scale.x ?? 1) * 1000) / 1000 : null,
        folderChildrenWrapScaleY: node.folderChildrenWrap?.scale ? Math.round((node.folderChildrenWrap.scale.y ?? 1) * 1000) / 1000 : null,
        folderChildrenWrapY: node.folderChildrenWrap ? Math.round((node.folderChildrenWrap.y || 0) * 1000) / 1000 : null,
        labelAlpha: node.labelText ? Math.round((node.labelText.alpha ?? 0) * 1000) / 1000 : null,
        labelRenderable: node.labelText ? node.labelText.renderable : null,
        labelRevealInProgress: node.folderHandoffLabelRevealInProgress === true,
        labelVisible: node.labelText ? node.labelText.visible : null,
        parentIsPageTrack: node.parent === this.pageTrack,
        scaleX: Math.round((node.scale?.x ?? 1) * 1000) / 1000,
        scaleY: Math.round((node.scale?.y ?? 1) * 1000) / 1000,
        visible: node.visible,
        visualWrapAlpha: node.visualWrap ? Math.round((node.visualWrap.alpha ?? 1) * 1000) / 1000 : null,
        visualWrapScaleX: node.visualWrap?.scale ? Math.round((node.visualWrap.scale.x ?? 1) * 1000) / 1000 : null,
        visualWrapScaleY: node.visualWrap?.scale ? Math.round((node.visualWrap.scale.y ?? 1) * 1000) / 1000 : null,
        visualWrapVisible: node.visualWrap ? node.visualWrap.visible : null,
        x: Math.round((node.x || 0) * 1000) / 1000,
        y: Math.round((node.y || 0) * 1000) / 1000,
      },
      originalIndex: entry.originalIndex ?? null,
      pageTrack: roundTransformObject(this.pageTrack),
      pageTrackX: Math.round((this.pageTrack?.x || 0) * 1000) / 1000,
      phase: options.phase || null,
      registeredThumbRect: roundRect(registeredThumbRect, 2),
      singleStageFolderLayer: roundTransformObject(this.singleStageFolderLayer),
      source: options.source || "handoff-node",
      stableStageLayoutTargetRect: roundRect(stableStageLayoutTargetRecord, 2),
      stableTargetRect: roundRect(stableTargetRect, 2),
      stageRect: roundRect(stageRect, 2),
      stageScaleX: registration.stageRect?.width && registration.width ? Math.round((registration.stageRect.width / registration.width) * 1000000) / 1000000 : null,
      stageScaleY: registration.stageRect?.height && registration.height ? Math.round((registration.stageRect.height / registration.height) * 1000000) / 1000000 : null,
      targetDelta: rectDelta(thumbRect, targetRect),
      targetRect: roundRect(targetRect, 2),
      thumbRect: roundRect(thumbRect, 2),
      visualRoot: roundTransformObject(this.visualRoot),
    };
  }

  findIconNodeByItemId(itemId: string | null | undefined): DesktopIconNode | null {
    if (!itemId) return null;
    for (const node of this.iconNodes.values()) {
      if (node?.item?.id === itemId && !node.destroyed) return node;
    }
    return null;
  }

  getFolderHandoffDebugSnapshot(folderId: string | null = null): Record<string, unknown> | null {
    const activeEntry = folderId ? this.getFolderHandoffEntry(folderId) : this.getFolderHandoffEntry();
    const activeSnapshot = this.makeFolderHandoffDebugSnapshot(activeEntry);
    if (activeSnapshot) {
      this.lastFolderHandoffDebugSnapshot = activeSnapshot;
      return activeSnapshot;
    }
    const node = this.findIconNodeByItemId(folderId);
    const actualSnapshot = this.makeFolderHandoffDebugSnapshot({
      folderId,
      layoutTarget: null,
      node,
      originalIndex: node ? this.getPageTrackChildIndex(node) : null,
    }, {
      active: false,
      source: "actual-node",
    });
    if (actualSnapshot) return actualSnapshot;
    if (!this.lastFolderHandoffDebugSnapshot) return null;
    return {
      ...this.lastFolderHandoffDebugSnapshot,
      active: false,
      stale: true,
    };
  }

  markInteractiveBoundsDirty(): void {
    this.boundsDirty = true;
    if (this.boundsUpdateDepth > 0) return;
    if (this.boundsFlushQueued) return;
    this.boundsFlushQueued = true;
    const flush = () => {
      this.boundsFlushQueued = false;
      this.flushInteractiveBounds();
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

  flushInteractiveBounds(options: FlushBoundsOptions = {}): void {
    if (!options.force && !this.boundsDirty) return;
    this.boundsDirty = false;
    this.refreshInteractiveBounds();
    this.singleStageFolderLayer?.refreshRegisteredIconBounds?.();
  }

  refreshInteractiveBounds(): void {
    const registration = this.boundsRegistration as (
      DesktopBoundsRegistration<DesktopBoundsEntry, DesktopRect> & DesktopBoundsRegistrationProjection
    ) | null;
    if (!registration) return;
    for (const entry of registration.entries) {
      const { area, folderPresentation, handoffLayoutTarget, index, item, node, pageIndex, sizing, targetX, x, y } = entry;
      if (!item?.id || !node || node.destroyed) continue;
      const visualSpec = makeIconVisualSpecFromNodeState(node.state);
      const meta = { area, id: item.id, index, item, pageIndex, visualSpec };
      const visualOffsetY = getIconVisualOffsetY(registration.isTextlessMode as boolean);
      const handoffEntry = item.type === "folder" ? this.getFolderHandoffEntry(item.id) : null;
      const isReleasedFolderHandoffEntry = handoffEntry?.visualReleased === true;
      const isFolderClosingHandoff = folderPresentation?.handoff?.syncsNode === true ||
        (item.type === "folder" && (
          Boolean(handoffEntry && !isReleasedFolderHandoffEntry) ||
          (hasFolderClosingHandoffId(
            registration as Readonly<{ folderClosingHandoffIds: ReadonlySet<string> }>,
            item.id,
          ) && !isReleasedFolderHandoffEntry)
        ));
      const boundsTargets = resolveDesktopBoundsTargets({
        handoffLayoutTarget,
        isFolderClosingHandoff,
        item,
        node,
        registration,
        sizing,
        targetX,
        visualOffsetY,
        visualRoot: this.visualRoot,
        x,
        y,
      } as Parameters<typeof resolveDesktopBoundsTargets>[0]);
      if (boundsTargets.syncHandoffLayoutTarget && handoffEntry && folderPresentation?.handoff?.syncsNode !== false && !isReleasedFolderHandoffEntry) {
        this.syncFolderHandoffNode(node, boundsTargets.syncHandoffLayoutTarget, handoffEntry);
      }
      this.iconBoundsRegistry.registerBounds(
        BOUNDS_KIND.LAUNCH,
        BOUNDS_VARIANT.RENDERED,
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.renderedClientIconBounds,
        meta
      );
      this.iconBoundsRegistry.registerBounds(
        BOUNDS_KIND.LAUNCH,
        BOUNDS_VARIANT.LIVE_TARGET,
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.liveClientTargetBounds,
        meta
      );
      this.iconBoundsRegistry.registerBounds(
        BOUNDS_KIND.LAUNCH,
        BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
        { area, folderId: null, id: item.id, pageIndex },
        boundsTargets.stableStageLayoutTargetBounds,
        {
          ...meta,
          stageHeight: registration.height,
          stageRect: registration.stageRect,
          stageWidth: registration.width,
        }
      );
      if (area === "desktop") {
        this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.LIVE_TARGET, item.id, boundsTargets.liveClientTargetBounds, {
          ...meta,
        });
        this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, item.id, boundsTargets.stableStageLayoutTargetBounds, {
          ...meta,
          stageHeight: registration.height,
          stageRect: registration.stageRect,
          stageWidth: registration.width,
        });
      }
      if (item.type === "folder") {
        this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, item.id, boundsTargets.renderedClientThumbBounds, meta);
        if (area === "desktop") {
          this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.LIVE_TARGET, item.id, boundsTargets.liveClientTargetBounds, {
            ...meta,
          });
          this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, item.id, boundsTargets.stableStageLayoutTargetBounds, {
            ...meta,
            stageHeight: registration.height,
            stageRect: registration.stageRect,
            stageWidth: registration.width,
          });
        }
        this.registerFolderChildren(item, node, registration.stageRect, {
          liveThumbRect: boundsTargets.liveClientTargetBounds,
          stableStageLayoutThumbRect: boundsTargets.stableStageLayoutTargetBounds,
          stageHeight: registration.height,
          stageWidth: registration.width,
        });
        if (area === "desktop") this.debugFolderHandoffDesktopActual(item, node, registration);
      }
    }
  }

  debugFolderHandoffDesktopActual(
    folder: DesktopItem,
    node: DesktopIconNode,
    registration: DesktopBoundsRegistration<DesktopBoundsEntry, DesktopRect>,
  ): void {
    const options = getFolderHandoffDebugOptions();
    const debugState = sceneDiagnosticsState.read("folderHandoff") as Readonly<{
      desktopLogged?: boolean;
      folderId?: string | null;
    }> | null;
    if (!options?.log || debugState?.desktopLogged || debugState?.folderId !== folder?.id) return;
    const rows: FolderDebugRow[] = [];
    const actualThumbRect = node.getFolderThumbBounds(registration.stageRect as StageRect);
    const stableStageLayoutTargetRecord = this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folder.id);
    const stableTargetRect = projectStageLayoutRecordToClient(stableStageLayoutTargetRecord);
    const targetThumbRect = this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.LIVE_TARGET, folder.id) ||
      this.iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, folder.id) ||
      stableTargetRect;
    rows.push({
      actual: roundRect(actualThumbRect, 2),
      delta: rectDelta(actualThumbRect, targetThumbRect),
      kind: "thumb",
      slot: "",
      target: roundRect(targetThumbRect, 2),
    });
    for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[slotIndex] : null;
      if (!child?.id) continue;
      const actualRect = node.getFolderPreviewChildBounds(registration.stageRect as StageRect, slotIndex);
      const stableChildTargetRect = projectStageLayoutRecordToClient(
        this.iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, { childId: child.id, folderId: folder.id, slotIndex })
      );
      const targetRect = this.iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.LIVE_TARGET, { childId: child.id, folderId: folder.id, slotIndex }) ||
        this.iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, { childId: child.id, folderId: folder.id, slotIndex }) ||
        stableChildTargetRect;
      rows.push({
        actual: roundRect(actualRect, 2),
        delta: rectDelta(actualRect, targetRect),
        kind: "child",
        slot: slotIndex,
        target: roundRect(targetRect, 2),
      });
    }
    sceneDiagnosticsState.publish("folderHandoff", {
      desktopLogged: true,
      desktopRows: rows,
    }, { merge: true });
    console.log("[folder-handoff-debug] desktop-actual", {
      folderId: folder.id,
      pageTrackX: Math.round((this.pageTrack?.x || 0) * 1000) / 1000,
      stageScaleX: registration.stageRect?.width && registration.width ? registration.stageRect.width / registration.width : null,
      stageScaleY: registration.stageRect?.height && registration.height ? registration.stageRect.height / registration.height : null,
    });
    console.table(rows.map((row) => ({
      actualHeight: row.actual?.height ?? null,
      actualLeft: row.actual?.left ?? null,
      actualTop: row.actual?.top ?? null,
      actualWidth: row.actual?.width ?? null,
      deltaHeight: row.delta?.height ?? null,
      deltaLeft: row.delta?.left ?? null,
      deltaTop: row.delta?.top ?? null,
      deltaWidth: row.delta?.width ?? null,
      kind: row.kind,
      slot: row.slot,
      targetHeight: row.target?.height ?? null,
      targetLeft: row.target?.left ?? null,
      targetTop: row.target?.top ?? null,
      targetWidth: row.target?.width ?? null,
    })));
    if (options.overlay) {
      this.handoffDebugLayer.clear();
      drawDebugRect(this.handoffDebugLayer, actualThumbRect, registration.stageRect as StageRect, 0xbf5af2, 0.98, options.lineWidth as number);
      for (const row of rows) {
        if (row.kind !== "child") continue;
        drawDebugRect(this.handoffDebugLayer, row.actual, registration.stageRect as StageRect, 0xffffff, 0.9, options.lineWidth as number);
      }
    }
  }

  registerFolderChildren(
    folder: DesktopItem,
    node: DesktopIconNode,
    stageRect: StageRect,
    target: Readonly<{
      liveThumbRect?: StageRect | null;
      stableStageLayoutThumbRect?: StageRect | null;
      stageHeight: number;
      stageWidth: number;
    }> | null = null,
  ): void {
    for (let index = 0; index < 9; index += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[index] : null;
      if (!child?.id) continue;
      const childTargets = resolveFolderPreviewChildBoundsTargets({
        node,
        slotIndex: index,
        stageRect,
        target,
      } as Parameters<typeof resolveFolderPreviewChildBoundsTargets>[0]);
      const keyInput = { childId: child.id, folderId: folder.id, slotIndex: index };
      if (childTargets.renderedClientBounds) this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, keyInput, childTargets.renderedClientBounds);
      if (childTargets.liveClientTargetBounds) this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.LIVE_TARGET, keyInput, childTargets.liveClientTargetBounds);
      if (childTargets.stableStageLayoutTargetBounds) {
        this.iconBoundsRegistry.registerBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, keyInput, childTargets.stableStageLayoutTargetBounds, {
          stageHeight: target!.stageHeight,
          stageRect,
          stageWidth: target!.stageWidth,
        });
      }
    }
  }

  handleIconAction(
    action: IconNodeAction,
    originalEvent: unknown,
    item: SceneItem | null,
    source: SceneDataRecord | null,
    node: IconNode,
  ): void {
    const event = makeSyntheticPointerEvent(
      originalEvent as Parameters<typeof makeSyntheticPointerEvent>[0],
      node as Parameters<typeof makeSyntheticPointerEvent>[1],
    );
    this.onIconAction(action, event, item, source, node);
  }

  getFolderVisualDebugSnapshot(): Record<string, unknown> {
    const readDisplay = (node: DesktopIconNode | null | undefined) => ({
      alpha: Math.round((node?.alpha ?? 0) * 1000) / 1000,
      eventMode: node?.eventMode ?? null,
      labelAlpha: node?.labelText ? Math.round((node.labelText.alpha ?? 0) * 1000) / 1000 : null,
      labelRenderable: node?.labelText?.renderable ?? null,
      labelRevealInProgress: node?.folderHandoffLabelRevealInProgress === true,
      labelVisible: node?.labelText?.visible ?? null,
      scaleX: Math.round((node?.scale?.x ?? 1) * 1000) / 1000,
      scaleY: Math.round((node?.scale?.y ?? 1) * 1000) / 1000,
      visible: node?.visible ?? null,
      visualWrapVisible: node?.visualWrap?.visible ?? null,
      x: Math.round((node?.x ?? 0) * 1000) / 1000,
      y: Math.round((node?.y ?? 0) * 1000) / 1000,
    });
    const folderNodes = [];
    for (const [key, node] of this.iconNodes || []) {
      if (node?.item?.type !== "folder") continue;
      folderNodes.push({
        display: readDisplay(node),
        id: node.item.id,
        key,
        sourceGhostedByOwnership: node.__folderSourceGhostedByOwnership === true,
        state: {
          draggable: node.state?.draggable ?? null,
          ghosted: node.state?.ghosted ?? null,
          interactive: node.state?.interactive ?? null,
          opening: node.state?.opening ?? null,
        },
      });
    }
    const overlay = this.singleStageFolderLayer;
    const lastStateSourceIds = this.lastFolderSourceGhostingState?.folderSourceGhostedIds || new Set();
    const ownershipSourceIds = getDesktopSourceGhostedIdsFromOwnership(this.visualOwnership);
    const overlaySourceIds = overlay?.getDesktopSourceGhostedIds?.() || new Set();
    const overlaySessionSnapshot = overlay?.folderVisualSession?.snapshot?.() || null;
    const overlayCloseSnapshot = overlaySessionSnapshot?.closing || null;
    const folderHandoffNodes = Array.from(this.getFolderHandoffNodes().values()).map((entry) => ({
      display: readDisplay(entry.node),
      folderId: entry.folderId || null,
      labelRevealStarted: entry.labelRevealStarted === true,
      visualHidden: entry.visualHidden === true,
      visualReleased: entry.visualReleased === true,
    }));
    return {
      detachedClosingVisuals: (overlay?.detachedClosingVisuals || []).map((visual) => ({
        clearing: visual.clearing === true,
        destroyed: visual.destroyed === true,
        folderId: visual.folderId || null,
        ownerToken: visual.ownerToken || null,
      })),
      folderHandoffNode: this.folderHandoffNode ? {
        display: readDisplay(this.folderHandoffNode.node),
        folderId: this.folderHandoffNode.folderId || null,
        labelRevealStarted: this.folderHandoffNode.labelRevealStarted === true,
        visualHidden: this.folderHandoffNode.visualHidden === true,
        visualReleased: this.folderHandoffNode.visualReleased === true,
      } : null,
      folderHandoffNodes,
      folderNodes,
      folderSourceGhostedIds: {
        lastState: Array.from(lastStateSourceIds),
        ownership: Array.from(ownershipSourceIds),
        overlay: Array.from(overlaySourceIds),
      },
      overlay: overlay ? {
        closingFolderId: overlayCloseSnapshot?.folderId || null,
        closingGhostKeys: overlayCloseSnapshot?.ghostIds || [],
        closingPreviewSwapKeys: overlayCloseSnapshot?.previewKeys || [],
        closingPreviewSwapLayerChildCount: overlay.closingPreviewSwapLayer?.children?.length ?? null,
        closingHandoffActive: overlayCloseSnapshot?.handoffActive === true,
        currentFolderId: overlay.currentFolderId || null,
        debug: overlay.getVisualDebugSnapshot?.() || null,
        openingGhostItemIds: overlaySessionSnapshot?.opening?.ghostIds || [],
        pageTrackVisible: overlay.pageTrack?.visible ?? null,
      } : null,
      ownership: this.visualOwnership?.snapshot?.() || [],
      provisionalFolderRollback: {
        layer: this.provisionalFolderRollbackLayer?.snapshot?.() || null,
        presentation: this.provisionalFolderRollbackState ? {
          folderId: this.provisionalFolderRollbackState.folderId || null,
          handoffVelocity: this.provisionalFolderRollbackState.handoffVelocity ?? null,
          phase: this.provisionalFolderRollbackState.phase || null,
          targetAppId: this.provisionalFolderRollbackState.targetAppId || null,
          token: this.provisionalFolderRollbackState.token ?? null,
        } : null,
      },
    };
  }

  override destroy(options?: DestroyOptions): void {
    this.clearSearchNodeCache();
    this.unregisterFolderHandoffDiagnosticClear?.();
    this.unregisterFolderHandoffDiagnosticClear = null;
    this.unsubscribeVisualOwnership?.();
    this.unsubscribeVisualOwnership = null;
    this.boundsRegistration = null;
    this.clearFolderHandoffNode();
    killMotionOf(this.visualRoot, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.visualRoot?.scale, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.desktopClosingUnderlayLayer, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.desktopClosingUnderlayLayer?.scale, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.singleStageFolderLayer, null, { lane: "base", reason: "destroyed" });
    killMotionOf(this.singleStageFolderLayer?.scale, null, { lane: "base", reason: "destroyed" });
    this.groupDragLayer?.destroy?.();
    this.groupDragLayer = null;
    this.lastPointerOnlyPlanSnapshot = null;
    cancelPageTrackMotion(this.pageTrackMotion, "destroyed");
    killMotionOf(this.pageTrack, null, { lane: "base", reason: "destroyed" });
    this.visualCommitQueue?.clear?.();
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
