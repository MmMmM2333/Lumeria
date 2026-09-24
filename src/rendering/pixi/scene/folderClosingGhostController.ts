import { killAllMotion } from "../animation/motionCleanup.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { parallel, motion } from "../animation/motionTween.js";
import type { MotionControl } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { sceneDiagnosticsState } from "../../../diagnostics/sceneDiagnosticsState.js";
import { stageLayoutRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { getClosingPreviewTiming } from "./folderOverlayGeometry.js";
import { getFolderSlotReleaseIconSize } from "./folderReleaseVisual.js";
import {
  getMaxFolderGhostGridDelay,
  makeClosingGhostMotion,
  makeCompletedClosingPreviewMotion,
} from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import type { FolderGhostIconNodeState } from "./folderGhostIconState.js";
import { hasUsableFolderGhostTarget } from "./folderOverlayTargets.js";
import type {
  ClosingPreviewSwapTarget,
  FolderGhostTarget,
  FolderInterruptedOpeningSource,
  FolderOverlayItem,
  UsableFolderGhostTarget,
} from "./folderOverlayTargets.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { throwAfterVisualAdapterRollback } from "./folderVisualAdapterLifecycle.js";
import { assertFolderClosingPhaseReporter } from "./folderVisualSession.js";
import type {
  FolderClosingAdapterPreparation,
  FolderClosingAdapterScope,
  FolderClosingPhaseReporter,
  FolderClosingVisualAdapter,
  FolderClosingVisualPlan,
  FolderVisualCancelOptions,
} from "./folderVisualSession.js";
import type { FolderFrameGhostOptions, FolderFramePresentation } from "./folderFrameGhost.js";
import type { FolderTransitionPlacement } from "./folderTransitionTrajectory.js";
import type {
  FolderClosingPreviewSwapReporter,
  FolderClosingPreviewSwapTiming,
} from "./folderClosingPreviewSwapController.js";
import {
  getFolderHandoffDebugOptions,
  rectDelta,
  roundNumber,
  roundRect,
} from "./folderHandoffDebug.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS: number = 140;
const CLOSING_GHOST_MAX_DELAY = 0.06;
const CLOSING_FRAME_TAIL_DURATION = 0.04;
const CLOSING_EXTRA_GHOST_ALPHA_DURATION = 0.12;
const CLOSING_EXTRA_GHOST_ALPHA_HOLD = 0.16;
const CLOSING_GHOST_GEOMETRY_FALLBACK_SECONDS = 0.75;
const CLOSING_PREVIEW_FALLBACK_DURATION = 0.22;
const CLOSING_GHOST_POSITION_REST_DELTA = 0.01;
const CLOSING_GHOST_SCALE_REST_DELTA = 0.001;
const CLOSING_GHOST_TARGET_DEVICE_EPSILON = 0.5;
const CLOSING_GHOST_ALIGNED_RENDER_FRAMES = 2;
const CLOSING_FOLDER_SLOT_VISUAL_MIX_START = 0.5;
const CLOSING_FOLDER_SLOT_VISUAL_MIX_END = 0.82;

type ClosingOwner = ReturnType<FolderClosingPhaseReporter["owner"]>;
type ClosingTimerHandle = unknown;
type ClosingFrameHandle = unknown;

export interface FolderClosingScheduler {
  cancelAnimationFrame?(handle: ClosingFrameHandle): void;
  clearTimeout?(handle: ClosingTimerHandle): void;
  requestAnimationFrame?(callback: (time?: number) => void): ClosingFrameHandle;
  setTimeout?(callback: () => void, timeoutMs: number): ClosingTimerHandle;
}

export interface FolderClosingPoint {
  x: number;
  y: number;
  set(x: number, y?: number): void;
}

interface FolderClosingMotionNode {
  readonly children?: readonly FolderClosingMotionNode[];
  scale?: object | null;
}

export interface FolderClosingGhost extends FolderClosingMotionNode {
  alpha: number;
  closingComplete: boolean;
  destroyed: boolean;
  eventMode: string;
  isThumbnailChild?: boolean | undefined;
  item: FolderOverlayItem | null;
  readonly labelText?: Readonly<{
    scale: FolderClosingPoint;
    visible: boolean;
  }> & { alpha: number };
  openingPageIndex?: number | undefined;
  parent?: FolderClosingGhostLayer | null | undefined;
  readonly position: FolderClosingPoint;
  readonly scale: FolderClosingPoint;
  stageRect?: StageOrigin | undefined;
  state?: Readonly<{ iconSize?: number | undefined }> | undefined;
  x?: number | undefined;
  y?: number | undefined;
  destroy(options?: object): void;
  getIconBounds(stageRect: StageOrigin): StageRect | null;
  clearFolderSlotReleaseVisual?(reason?: string): void;
  commitFolderSlotReleaseVisual?(): boolean;
  prepareFolderSlotReleaseVisual?(targetIconSize: unknown): boolean;
  removeFromParent?(): void;
  setFolderSlotReleaseVisualMix?(value: unknown): boolean;
  setState(
    state: FolderGhostIconNodeState,
    options?: Readonly<{ preserveRootPresentation?: boolean | undefined }>,
  ): void;
}

export interface FolderClosingGhostLayer {
  readonly children: FolderClosingGhost[];
  onRender?: ((renderer?: unknown) => void) | null | undefined;
  addChild(ghost: FolderClosingGhost): FolderClosingGhost;
  removeChild(ghost: FolderClosingGhost): FolderClosingGhost;
  removeChildren(): FolderClosingGhost[];
}

export type FolderClosingState = Readonly<{
  completeFolderCloseIconGhost?: ((key: string) => unknown) | undefined;
  deviceResolution?: number | undefined;
  folderPageIndex: number;
  folderPageSize?: number | undefined;
  getFolderCloseIconGhostKey?: ((itemId: string, index: number) => string | null | undefined) | undefined;
  height: number;
  isTextlessMode?: boolean | undefined;
  launchTargetStatusById?: Readonly<Record<string, string>> | undefined;
  renderedFolder?: FolderOverlayItem | null | undefined;
  showMissingLaunchTargetBadge?: boolean | undefined;
  stageRect: StageOrigin;
  width: number;
}>;

export type FolderClosingTarget = FolderGhostTarget & Readonly<{
  cellHeight?: number | undefined;
  cellWidth?: number | undefined;
  columnCount?: number | undefined;
  controllerGhostKey?: string | null | undefined;
  iconSize: number;
  index: number;
  interruptedOpeningSource?: FolderInterruptedOpeningSource | undefined;
  isThumbnailChild?: boolean | undefined;
  item: FolderOverlayItem;
  pageIndex: number;
  previewSlotIndex?: number | null | undefined;
  sourceAlpha?: number | undefined;
  sourceLabelAlpha?: number | undefined;
  sourcePose?: Readonly<{
    scaleX: number;
    scaleY: number;
    x: number;
    y: number;
  }> | null | undefined;
  sourceScale?: number | undefined;
}>;

type UsableFolderClosingTarget = FolderClosingTarget & UsableFolderGhostTarget;

export type FolderClosingControllerPlanOptions = Readonly<{
  folderIconSize?: number | undefined;
  framePlacement?: FolderTransitionPlacement | null | undefined;
  handoffRect?: StageRect | null | undefined;
  handoffTarget?: Readonly<Record<string, unknown>> | null | undefined;
  previewSwapTargets?: readonly ClosingPreviewSwapTarget[] | undefined;
}>;

type FolderClosingControllerVisualPlanBase = FolderClosingVisualPlan<
  FolderClosingState,
  FolderClosingTarget,
  FolderClosingControllerPlanOptions,
  StageRect
>;

export type FolderClosingControllerVisualPlan = Omit<
  FolderClosingControllerVisualPlanBase,
  "folderRect" | "panelRect"
> & Readonly<{
  folderRect: StageRect;
  panelRect: StageRect;
}>;

export interface FolderClosingPreviewSwapAdapter {
  clear(): void;
  retarget?(state: FolderClosingState, targets: readonly ClosingPreviewSwapTarget[]): boolean;
  snapshot?(): Readonly<{ activeKey: string | null }>;
  start(
    state: FolderClosingState,
    targets: readonly ClosingPreviewSwapTarget[],
    timing: FolderClosingPreviewSwapTiming,
    onComplete: ((state: FolderClosingState) => void) | null,
    options: Readonly<{ reporter: FolderClosingPreviewSwapReporter }>,
  ): void;
}

export type FolderClosingTransitionDebugSnapshot = Readonly<{
  closingGhostCount: number;
  framePresentation: Partial<StageRect> | null;
  panelVisible: boolean;
  pageTrackVisible: boolean;
}>;

export type FolderClosingGhostControllerLayer = {
  closingGhostLayer: FolderClosingGhostLayer;
  pageTrack: { visible: boolean };
  panel: { visible: boolean };
  visible: boolean;
  acquireDesktopSourceOwnership(owner: ClosingOwner): unknown;
  clearCurrentFolder(): void;
  clearFrameGhost(options?: Readonly<{ ownerToken?: unknown }>): boolean | void;
  enableClosingFrameMask(): void;
  getCurrentFolderId(): string | null;
  getTransitionDebugSnapshot(): FolderClosingTransitionDebugSnapshot;
  hideIconNodesForTransition(itemId: string, owner: ClosingOwner): void;
  hidePageTrackForTransition(owner: ClosingOwner): void;
  mapClosingTargetRectToLocal(
    state: Pick<FolderClosingState, "height" | "stageRect" | "width">,
    rect: StageRect,
  ): StageRect;
  onClosingHandoffPrepare(folderId: string | null): void;
  onClosingHandoffVisualRelease(folderId: string | null): void;
  restoreOpeningGhostPresentation(ghost: FolderClosingGhost): boolean;
  releaseTransitionOwnership(
    token: string,
    options: Readonly<{
      restorePageTrack?: boolean | undefined;
      reveal?: boolean | undefined;
    }>,
  ): unknown;
  retargetFrameGhost?(toRect: StageRect, options: FolderFrameGhostOptions): boolean;
  startFrameGhost(fromRect: StageRect | null, toRect: StageRect, options: FolderFrameGhostOptions): unknown;
};

export type FolderClosingGhostControllerOptions = Readonly<{
  ghostFactory: () => FolderClosingGhost;
  previewSwap?: FolderClosingPreviewSwapAdapter | undefined;
  scheduler?: FolderClosingScheduler | undefined;
}>;

type ClosingGhostMotion = ReturnType<typeof makeClosingGhostMotion>;
type ClosingMotionControl = MotionControl;
type ClosingThumbMetrics = ReturnType<typeof getFolderThumbMetrics>;

type ReleasedOpeningGhost = Readonly<{
  ghost: FolderClosingGhost;
  sourceAlpha: number;
  sourceLabelAlpha: number | undefined;
  sourceRect: StageRect;
  sourceScale: number;
}>;

type ClosingGhostFollower = {
  position: { x: number; y: number };
  progress: { value: number };
  scale: { x: number; y: number };
};

type ActiveClosingGhost = {
  alignedRenderFrames: number;
  alignmentGeneration: number;
  completionScheduled: boolean;
  folderSlotVisualState: ClosingFolderSlotVisualState | null;
  follower: ClosingGhostFollower;
  ghost: FolderClosingGhost;
  motionId: number;
  motionControl: ClosingMotionControl | null;
  motionSettled: boolean;
  state: FolderClosingState;
  target: UsableFolderClosingTarget;
  targetKey: string;
  targetMotion: ClosingGhostMotion;
  retargetMotion: () => MotionControl;
};

type ClosingFolderSlotVisualState = {
  mix: number;
  targetSize: number;
};

type ActiveClosingFrameState = {
  folderId: string | null;
  makeOptions(
    state: FolderClosingState,
    thumb: ClosingThumbMetrics,
    placement: FolderTransitionPlacement | null,
  ): FolderFrameGhostOptions;
  placement: FolderTransitionPlacement | null;
  previewSwapStarted: boolean;
  previewSwapTargets: readonly ClosingPreviewSwapTarget[];
  targetKey: string;
};

function requireStageRect(value: unknown, path: string): StageRect {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  for (const key of ["height", "left", "top", "width"] as const) {
    if (!Number.isFinite(Reflect.get(value, key))) {
      throw new TypeError(`${path}.${key} must be a finite number`);
    }
  }
  return value as StageRect;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${path} must be a finite number`);
  return Number(value);
}

function applyInterruptedOpeningSource(
  layer: FolderClosingGhostControllerLayer,
  state: FolderClosingState,
  target: FolderClosingTarget,
): FolderClosingTarget {
  const itemId = target?.item?.id || "unknown";
  const source = target.interruptedOpeningSource;
  if (!source || typeof source !== "object") {
    throw new TypeError(`closing target ${itemId} interruptedOpeningSource must be an object`);
  }
  const sourceRect = requireStageRect(
    source.rect,
    `closing target ${itemId} interruptedOpeningSource.rect`,
  );
  const sourceLocalRect = layer.mapClosingTargetRectToLocal(state, sourceRect);
  return {
    ...target,
    sourceAlpha: requireFiniteNumber(
      source.alpha,
      `closing target ${itemId} interruptedOpeningSource.alpha`,
    ),
    sourceLabelAlpha: requireFiniteNumber(
      source.labelAlpha,
      `closing target ${itemId} interruptedOpeningSource.labelAlpha`,
    ),
    sourceRect,
    sourceScale: Math.max(0.16, sourceLocalRect.width / Math.max(1, target.iconSize)),
  };
}

function publishLastFolderHandoffDebug(payload: Readonly<Record<string, unknown>>): void {
  const folderId = payload?.folderId || null;
  if (!folderId) return;
  sceneDiagnosticsState.publish("folderHandoff", {
    ...payload,
    desktopLogged: false,
  }, { merge: true });
}

function getClosingControllerGhostKey(
  state: FolderClosingState,
  target: FolderClosingTarget,
): string | null {
  return target?.controllerGhostKey || state.getFolderCloseIconGhostKey?.(target?.item?.id, target?.index) || null;
}

function getClosingFolderSlotVisualSize(
  folderRect: StageRect,
  options: FolderClosingControllerPlanOptions,
): number {
  const canonicalIconSize = Number(options.folderIconSize);
  if (Number.isFinite(canonicalIconSize) && canonicalIconSize > 0) {
    return getFolderSlotReleaseIconSize(canonicalIconSize);
  }
  const handoffTarget = options.handoffTarget;
  const thumbRect = handoffTarget && typeof handoffTarget === "object"
    ? Reflect.get(handoffTarget, "thumbRect")
    : null;
  const stableWidth = thumbRect && typeof thumbRect === "object"
    ? Number(Reflect.get(thumbRect, "width"))
    : Number.NaN;
  return getFolderSlotReleaseIconSize(
    Number.isFinite(stableWidth) && stableWidth > 0 ? stableWidth : folderRect.width,
  );
}

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getClosingFolderSlotVisualMix(
  geometryProgress: unknown,
): number {
  const progress = clamp01(
    (clamp01(geometryProgress) - CLOSING_FOLDER_SLOT_VISUAL_MIX_START) /
      (CLOSING_FOLDER_SLOT_VISUAL_MIX_END - CLOSING_FOLDER_SLOT_VISUAL_MIX_START),
  );
  return progress * progress * (3 - 2 * progress);
}

function getActiveMotionVelocity(target: object, prop: string): number {
  const channel = motionRuntime.getChannel(target, prop);
  const animation = Array.from(channel?.base?.values?.() || [])[0] || null;
  const velocity = Number(animation?.velocity);
  return Number.isFinite(velocity) ? velocity : 0;
}

function animateClosingGhost(
  ghost: FolderClosingGhost,
  ghostMotion: ClosingGhostMotion,
  target: FolderClosingTarget,
  follower: ClosingGhostFollower,
  onUpdate: (() => void) | null,
  onArrive: (() => void) | null,
  onComplete: (() => void) | null,
  options: Readonly<{
    animateAlpha?: boolean | undefined;
    positionVelocity?: Readonly<{ x: number; y: number }> | undefined;
    scaleVelocity?: Readonly<{ x: number; y: number }> | undefined;
    scheduler?: FolderClosingScheduler | undefined;
  }> = {},
): MotionControl {
  const positionSpring = {
    ...motionSprings.handoff,
    arriveDelta: CLOSING_GHOST_POSITION_REST_DELTA,
    restDelta: CLOSING_GHOST_POSITION_REST_DELTA,
  };
  const scaleSpring = {
    ...motionSprings.handoff,
    arriveDelta: CLOSING_GHOST_SCALE_REST_DELTA,
    restDelta: CLOSING_GHOST_SCALE_REST_DELTA,
  };
  const motionOptions = { delay: ghostMotion.delay };
  if (options.animateAlpha !== false && !target.isThumbnailChild) {
    motion(ghost)
      .duration(CLOSING_EXTRA_GHOST_ALPHA_DURATION)
      .ease("power2.in")
      .delay(ghostMotion.alphaDelay)
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 0 })
      .start();
  }
  const animations = [
    motion(follower.position)
      .spring(positionSpring)
      .handoff()
      .interrupt("retarget")
      .to({
        ...motionOptions,
        ...(onUpdate ? { onUpdate } : {}),
        velocity: options.positionVelocity,
        x: ghostMotion.toX,
        y: ghostMotion.toY,
      }),
    motion(follower.scale)
      .spring(scaleSpring)
      .handoff()
      .interrupt("retarget")
      .to({
        ...motionOptions,
        ...(onUpdate ? { onUpdate } : {}),
        velocity: options.scaleVelocity,
        x: ghostMotion.scale,
        y: ghostMotion.scale,
      }),
  ];
  if (target.isThumbnailChild) {
    animations.push(
      motion(follower.progress)
        .spring(scaleSpring)
        .handoff()
        .interrupt("retarget")
        .to({
          ...motionOptions,
          ...(onUpdate ? { onUpdate } : {}),
          value: 1,
        }),
    );
  }
  return parallel(animations, {
    scheduler: options.scheduler,
    onArrive: () => {
      onArrive?.();
    },
    onComplete: () => {
      onComplete?.();
    },
  });
}

function makeClosingGhostTargetKey(target: FolderClosingTarget): string {
  const rect = (target?.targetClientRect || target?.targetStageLayoutRect || {}) as Partial<StageRect>;
  return [
    target?.item?.id || "",
    target?.isThumbnailChild ? "thumb" : "icon",
    target?.previewSlotIndex ?? "",
    target?.iconSize ?? "",
    rect.left ?? "",
    rect.top ?? "",
    rect.width ?? "",
    rect.height ?? "",
  ].join("|");
}

function makeClosingGhostLocalRects(
  layer: FolderClosingGhostControllerLayer,
  state: FolderClosingState,
  target: UsableFolderClosingTarget,
): Readonly<{
  sourceLocalRect: StageRect;
  targetLocalRect?: StageRect | undefined;
}> {
  const sourceLocalRect = layer.mapClosingTargetRectToLocal(state, target.sourceRect);
  return target.targetClientRect
    ? {
      sourceLocalRect,
      targetLocalRect: layer.mapClosingTargetRectToLocal(state, target.targetClientRect),
    }
    : { sourceLocalRect };
}

function makeDetachedCloseFrameTarget(
  closeFrameToRect: StageRect,
  thumb: ClosingThumbMetrics,
): StageRect & Readonly<{
  fillAlpha: number;
  fillColor: number;
  radius: number;
  strokeAlpha: number;
  strokeColor: number;
  strokeWidth: number;
}> {
  return {
    ...closeFrameToRect,
    fillAlpha: thumb.fillAlpha,
    fillColor: thumb.fillColor,
    radius: thumb.radius,
    strokeAlpha: thumb.strokeAlpha,
    strokeColor: thumb.strokeColor,
    strokeWidth: thumb.strokeWidth,
  };
}

function makeClosingFrameTargetKey(
  rect: StageRect | null | undefined,
  thumb: ClosingThumbMetrics | null | undefined,
  placement: FolderTransitionPlacement | null | undefined = null,
): string {
  if (!rect) return "";
  return [
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    thumb?.fillAlpha,
    thumb?.fillColor,
    thumb?.radius,
    thumb?.strokeAlpha,
    thumb?.strokeColor,
    thumb?.strokeWidth,
    placement?.col,
    placement?.cols,
    placement?.row,
    placement?.rows,
  ].join("|");
}

function normalizePageIndex(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
}

function canReuseOpeningGhostForClose(
  ghost: unknown,
  target: FolderClosingTarget,
  state: FolderClosingState,
): boolean {
  const openingPageIndex = normalizePageIndex((ghost as FolderClosingGhost | null | undefined)?.openingPageIndex);
  if (openingPageIndex == null) return true;
  const closingPageIndex = normalizePageIndex(target?.pageIndex ?? state?.folderPageIndex);
  return closingPageIndex == null || openingPageIndex === closingPageIndex;
}

function releaseOpeningGhostsForClosing(
  layer: FolderClosingGhostControllerLayer,
  reporter: FolderClosingPhaseReporter,
  state: FolderClosingState,
  targets: readonly FolderClosingTarget[],
): Map<string, ReleasedOpeningGhost> {
  const released = new Map<string, ReleasedOpeningGhost>();
  for (const target of targets || []) {
    const itemId = target?.item?.id;
    if (!itemId || !hasUsableFolderGhostTarget(target)) continue;
    const activeOpeningGhost = reporter.takeOpeningGhost(
      itemId,
      (ghost) => canReuseOpeningGhostForClose(ghost, target, state)
    );
    const ghost = (activeOpeningGhost as FolderClosingGhost | null) || null;
    const sourceRect = ghost?.getIconBounds?.(state.stageRect);
    if (!ghost || !sourceRect) {
      killAllMotion(ghost!);
      destroyDisplayObjectAfterFrame(ghost!, { children: true });
      continue;
    }
    released.set(itemId, {
      ghost,
      sourceAlpha: ghost.alpha,
      sourceLabelAlpha: ghost.labelText?.alpha,
      sourceRect,
      sourceScale: Math.max(
        0.14,
        layer.mapClosingTargetRectToLocal(state, sourceRect).width / Math.max(1, target.iconSize),
      ),
    });
  }
  return released;
}

function captureGhostRootPose(ghost: FolderClosingGhost): NonNullable<FolderClosingTarget["sourcePose"]> {
  return {
    scaleX: Number(ghost.scale?.x) || 1,
    scaleY: Number(ghost.scale?.y) || 1,
    x: Number(ghost.position?.x) || 0,
    y: Number(ghost.position?.y) || 0,
  };
}

export class FolderClosingGhostController implements FolderClosingVisualAdapter<FolderClosingControllerVisualPlan> {
  declare readonly layer: FolderClosingGhostControllerLayer;
  declare readonly scheduler: FolderClosingScheduler;
  declare ghostFactory: () => FolderClosingGhost;
  declare readonly previewSwap: FolderClosingPreviewSwapAdapter;
  declare activeReporter: FolderClosingPhaseReporter | null;
  declare activeGhostsByItemId: Map<string, ActiveClosingGhost>;
  declare activeFrameState: ActiveClosingFrameState | null;
  declare cleanupFrame: ClosingFrameHandle | null;
  declare cleanupGeneration: number;
  declare completedPreviewGhosts: FolderClosingGhost[];
  declare motionControls: Set<ClosingMotionControl>;
  declare nextMotionId: number;
  declare nextTargetGeneration: number;
  declare owner: ClosingOwner | null;
  declare ownershipReleased: boolean;
  declare previousClosingGhostLayerOnRender: FolderClosingGhostLayer["onRender"];
  declare readonly renderHook: NonNullable<FolderClosingGhostLayer["onRender"]>;
  declare revealTimer: ClosingTimerHandle | null;
  declare targetGeneration: number;

  constructor(
    layer: FolderClosingGhostControllerLayer,
    options: FolderClosingGhostControllerOptions,
  );
  constructor(
    layer: FolderClosingGhostControllerLayer | null | undefined,
    options?: FolderClosingGhostControllerOptions,
  ) {
    if (!layer || typeof layer !== "object") {
      throw new TypeError("FolderClosingGhostController requires a layer");
    }
    if (!options || typeof options.ghostFactory !== "function") {
      throw new TypeError("FolderClosingGhostController requires a ghost factory");
    }
    this.layer = layer;
    this.scheduler = options.scheduler || globalThis;
    this.ghostFactory = options.ghostFactory;
    this.previewSwap = options.previewSwap || { clear: () => {}, start: () => {} };
    this.activeReporter = null;
    this.activeGhostsByItemId = new Map();
    this.activeFrameState = null;
    this.cleanupFrame = null;
    this.cleanupGeneration = 0;
    this.completedPreviewGhosts = [];
    this.motionControls = new Set();
    this.nextMotionId = 1;
    this.nextTargetGeneration = 1;
    this.owner = null;
    this.ownershipReleased = false;
    this.previousClosingGhostLayerOnRender = this.layer.closingGhostLayer.onRender || null;
    this.renderHook = (renderer) => {
      this.previousClosingGhostLayerOnRender?.call(this.layer.closingGhostLayer, renderer);
      this.syncClosingGhostRenderFrame();
    };
    this.layer.closingGhostLayer.onRender = this.renderHook;
    this.revealTimer = null;
    this.targetGeneration = 0;
  }

  prepare(
    plan: FolderClosingControllerVisualPlan,
  ): FolderClosingAdapterPreparation;
  prepare(
    plan?: FolderClosingControllerVisualPlan,
  ): FolderClosingAdapterPreparation {
    if (!plan || typeof plan !== "object") {
      throw new TypeError("closing adapter plan must be an object");
    }
    const state = plan.state;
    if (!state || typeof state !== "object") throw new TypeError("closing adapter plan requires state");
    const targets = Array.isArray(plan.targets) ? plan.targets : [];
    return {
      ghosts: (targets
        .filter(hasUsableFolderGhostTarget) as FolderClosingTarget[])
        .map((target) => ({
          controllerKey: getClosingControllerGhostKey(state, target),
          itemId: target.item.id,
          visualCritical: Boolean(target.isThumbnailChild),
        })),
    };
  }

  start(
    plan: FolderClosingControllerVisualPlan,
    reporter: FolderClosingPhaseReporter,
  ): FolderClosingAdapterScope<FolderClosingControllerVisualPlan>;
  start(
    plan: FolderClosingControllerVisualPlan | null | undefined,
    reporter: FolderClosingPhaseReporter,
  ): FolderClosingAdapterScope<FolderClosingControllerVisualPlan> {
    assertFolderClosingPhaseReporter(reporter);
    if (!plan || typeof plan !== "object") {
      throw new TypeError("closing adapter plan must be an object");
    }
    const state = plan.state;
    if (!state || typeof state !== "object") throw new TypeError("closing adapter plan requires state");
    const folderRect = requireStageRect(plan.folderRect, "closing adapter plan folderRect");
    const panelRect = requireStageRect(plan.panelRect, "closing adapter plan panelRect");
    this.clearVisuals({ restorePageTrack: false, reveal: false });
    this.activeReporter = reporter;
    this.owner = reporter.owner();
    this.ownershipReleased = false;
    try {
      this.startVisuals(
        state,
        Array.isArray(plan.targets) ? plan.targets : [],
        folderRect,
        panelRect,
        plan.options && typeof plan.options === "object" ? plan.options : {},
      );
    } catch (error) {
      throwAfterVisualAdapterRollback(error, () => {
        this.clearVisuals({ restorePageTrack: true, reveal: true });
      }, "closing visual startup and rollback both failed");
    }
    const isActive = () => this.activeReporter === reporter;
    return Object.freeze({
      cancel: (options: FolderVisualCancelOptions = {}) => {
        if (isActive()) this.clearVisuals(options);
      },
      onHandoffReady: ({ controllerKeys = [] }: Readonly<{ controllerKeys?: readonly string[] }> = {}) => {
        if (isActive()) this.startClosingHandoff(state, controllerKeys);
      },
      onOverlaySettled: () => {
        if (isActive()) this.deferRunHandoffCleanup();
      },
      retarget: (
        nextPlan: FolderClosingControllerVisualPlan = {} as FolderClosingControllerVisualPlan,
      ) => {
        if (!isActive()) return;
        const nextState = nextPlan.state;
        if (!nextState || typeof nextState !== "object") throw new TypeError("closing retarget plan requires state");
        const nextFolderRect = requireStageRect(nextPlan.folderRect, "closing retarget plan folderRect");
        const nextPanelRect = requireStageRect(nextPlan.panelRect, "closing retarget plan panelRect");
        this.retargetVisuals(
          nextState,
          Array.isArray(nextPlan.targets) ? nextPlan.targets : [],
          nextFolderRect,
          nextPanelRect,
          nextPlan.options && typeof nextPlan.options === "object" ? nextPlan.options : {},
        );
      },
      snapshot: () => this.snapshot(reporter),
    });
  }

  snapshot(reporter: FolderClosingPhaseReporter | null = this.activeReporter) {
    const active = reporter != null && reporter === this.activeReporter;
    return Object.freeze({
      active,
      activeVisuals: active && Boolean(
        this.activeGhostsByItemId.size ||
        this.activeFrameState ||
        this.previewSwap.snapshot?.().activeKey
      ),
      motionControlCount: active ? this.motionControls.size : 0,
      preview: active ? this.previewSwap.snapshot?.() || null : null,
      revealTimerActive: active && this.revealTimer != null,
    });
  }

  clearRevealTimer(): void {
    this.targetGeneration = this.nextTargetGeneration++;
    if (this.revealTimer != null) this.scheduler.clearTimeout?.(this.revealTimer);
    this.revealTimer = null;
  }

  scheduleRevealFallback(targets: readonly FolderClosingTarget[]): void {
    this.clearRevealTimer();
    const reporter = this.activeReporter;
    if (!reporter) return;
    const targetGeneration = this.nextTargetGeneration++;
    this.targetGeneration = targetGeneration;
    const maxDelay = getMaxFolderGhostGridDelay(targets, CLOSING_GHOST_MAX_DELAY);
    const fallbackSeconds = Math.max(
      motionPresets.folderClose!.duration!,
      CLOSING_GHOST_GEOMETRY_FALLBACK_SECONDS,
    );
    const timeoutMs = Math.round(
      (maxDelay + fallbackSeconds + CLOSING_PREVIEW_FALLBACK_DURATION) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS
    );
    this.revealTimer = this.scheduler.setTimeout?.(() => {
      if (this.activeReporter !== reporter || this.targetGeneration !== targetGeneration) return;
      this.revealTimer = null;
      if (this.hasActive()) {
        reporter.fail(new Error("folder closing visual watchdog expired before settlement"));
      }
    }, timeoutMs) || null;
  }

  hasActive(): boolean {
    const snapshot = this.activeReporter ? this.activeReporter.snapshot() : null;
    return Boolean(snapshot && (
      snapshot.ghostIds.length ||
      snapshot.previewKeys.length ||
      !snapshot.frameComplete
    ));
  }

  startVisuals(
    state: FolderClosingState,
    targets: readonly FolderClosingTarget[],
    folderRect: StageRect,
    panelRect: StageRect,
    options: FolderClosingControllerPlanOptions = {},
  ): void {
    const {
      framePlacement = null,
      handoffRect = null,
      handoffTarget = null,
      previewSwapTargets = [],
    } = options;
    const reporter = this.activeReporter;
    const owner = this.owner;
    if (!reporter || !owner) throw new Error("closing visual scope is not active");
    const folderId = state.renderedFolder?.id || this.layer.getCurrentFolderId() || null;
    const releasedOpeningGhosts = releaseOpeningGhostsForClosing(this.layer, reporter, state, targets);
    const closeFrameFromRect = panelRect;
    const closeTargets: FolderClosingTarget[] = (targets || []).map((target) => {
      const released = releasedOpeningGhosts.get(target?.item?.id);
      return released
        ? {
          ...target,
          sourceAlpha: released.sourceAlpha,
          sourceLabelAlpha: released.sourceLabelAlpha,
          sourceRect: released.sourceRect,
          sourceScale: released.sourceScale,
        }
        : target.interruptedOpeningSource
          ? applyInterruptedOpeningSource(this.layer, state, target)
          : target;
    });
    this.layer.acquireDesktopSourceOwnership(owner);
    const usableTargets = (closeTargets || []).filter(hasUsableFolderGhostTarget) as UsableFolderClosingTarget[];
    const isOpeningCloseHandoff = releasedOpeningGhosts.size > 0 ||
      closeTargets.some((target) => Boolean(target.interruptedOpeningSource));
    const frameDuration = motionPresets.folderClose!.duration! + CLOSING_FRAME_TAIL_DURATION;
    const closeFrameToRect = this.layer.mapClosingTargetRectToLocal(state, folderRect);
    const thumb = getFolderThumbMetrics(closeFrameToRect.width);
    reporter.setGeometry({
      detachedTarget: makeDetachedCloseFrameTarget(closeFrameToRect, thumb) as unknown as Readonly<Record<string, unknown>>,
      rect: (handoffRect || folderRect) as unknown as Readonly<Record<string, unknown>>,
      target: handoffTarget || null,
    });
    const previewTiming = getClosingPreviewTiming(closeFrameFromRect, closeFrameToRect);
    let closingPreviewSwapStarted = false;
    const startClosingPreviewSwapWhenReady = (frame: Readonly<{ progress?: number | undefined }>) => {
      const currentPreviewSwapTargets = this.activeFrameState?.previewSwapTargets || previewSwapTargets;
      if (closingPreviewSwapStarted || isOpeningCloseHandoff || !currentPreviewSwapTargets?.length) return;
      if ((frame?.progress ?? 0) < previewTiming.progress) return;
      closingPreviewSwapStarted = true;
      if (this.activeFrameState) this.activeFrameState.previewSwapStarted = true;
      this.previewSwap.start(
        state,
        currentPreviewSwapTargets,
        previewTiming,
        () => {},
        { reporter }
      );
    };
    this.layer.enableClosingFrameMask();
    const completeFrameVisual = () => reporter.frameVisualReady();
    const makeFrameOptions = (
      completionState: FolderClosingState = state,
      frameThumb: ClosingThumbMetrics = thumb,
      placement: FolderTransitionPlacement | null = framePlacement,
    ): FolderFrameGhostOptions => ({
      duration: frameDuration,
      ease: motionPresets.folderClose!.ease!,
      fadeStart: 0.86,
      folderId,
      frameGhostPhase: "closing",
      placement,
      frameGhostToAlpha: 1,
      fromFillAlpha: 0.26,
      fromFillColor: 0xf7f8ff,
      fromRadius: 48,
      fromStrokeAlpha: 0.24,
      fromStrokeColor: 0xffffff,
      fromStrokeWidth: 1,
      panelMaterialFinalAlpha: 0,
      panelMaterialFromAlpha: 0,
      panelMaterialToAlpha: 0,
      ownerToken: owner.token,
      progressMilestones: [{
        callback: () => startClosingPreviewSwapWhenReady({ progress: previewTiming.progress }),
        progress: previewTiming.progress,
      }],
      onComplete: () => {
        startClosingPreviewSwapWhenReady({ progress: 1 });
        this.completeFrameGhost(completionState);
      },
      onArrive: () => completeFrameVisual(),
      preserveOnComplete: true,
      toFillAlpha: frameThumb.fillAlpha,
      toFillColor: frameThumb.fillColor,
      toRadius: frameThumb.radius,
      toStrokeAlpha: frameThumb.strokeAlpha,
      toStrokeColor: frameThumb.strokeColor,
      toStrokeWidth: frameThumb.strokeWidth,
      updateClosingMask: true,
    });
    const frameOptions = makeFrameOptions(state, thumb);
    this.activeFrameState = {
      folderId,
      makeOptions: makeFrameOptions,
      placement: framePlacement,
      previewSwapStarted: false,
      previewSwapTargets,
      targetKey: makeClosingFrameTargetKey(closeFrameToRect, thumb, framePlacement),
    };
    this.layer.startFrameGhost(closeFrameFromRect, closeFrameToRect, frameOptions);

    this.layer.hidePageTrackForTransition(owner);
    if (usableTargets.length) this.scheduleRevealFallback(usableTargets);

    for (const target of usableTargets) {
      const released = releasedOpeningGhosts.get(target.item?.id);
      const ghost = released?.ghost || this.ghostFactory();
      ghost.eventMode = "none";
      ghost.stageRect = state.stageRect;
      ghost.isThumbnailChild = Boolean(target.isThumbnailChild);
      ghost.setState(
        makeFolderGhostIconNodeState({ sourceType: "folder-close-ghost", state, target }),
        released ? { preserveRootPresentation: true } : undefined,
      );
      if (released) this.layer.restoreOpeningGhostPresentation(ghost);
      const sourcePose = released
        ? captureGhostRootPose(ghost)
        : null;
      const motionTarget = sourcePose ? { ...target, sourcePose } : target;
      const ghostMotion = makeClosingGhostMotion(motionTarget, {
        alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
        closeDuration: motionPresets.folderClose!.duration!,
        isTextlessMode: state.isTextlessMode,
        ...makeClosingGhostLocalRects(this.layer, state, motionTarget),
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(ghostMotion.fromX, ghostMotion.fromY);
      ghost.scale.set(ghostMotion.sourceScaleX, ghostMotion.sourceScaleY);
      ghost.alpha = ghostMotion.sourceAlpha;
      if (ghost.labelText?.visible) {
        if (target.sourceLabelAlpha != null) ghost.labelText.alpha = target.sourceLabelAlpha;
        motion(ghost.labelText)
          .duration(0.1)
          .ease("power2.in")
          .delay(ghostMotion.delay)
          .overlay()
          .interrupt("retarget")
          .to({ alpha: 0 })
          .start();
        motion(ghost.labelText.scale)
          .duration(0.1)
          .ease("power2.in")
          .delay(ghostMotion.delay)
          .overlay()
          .interrupt("retarget")
          .to({ x: 0.94, y: 0.94 })
          .start();
      }
      this.layer.closingGhostLayer.addChild(ghost);
      this.layer.hideIconNodesForTransition(target.item.id, owner);

      this.startGhostMotion(state, motionTarget, ghost, {
        animateAlpha: true,
        folderSlotVisualSize: getClosingFolderSlotVisualSize(folderRect, options),
        resetSourceVelocity: Boolean(released),
      });
    }
    this.layer.onClosingHandoffPrepare(folderId);
  }

  startGhostMotion(
    state: FolderClosingState,
    target: UsableFolderClosingTarget,
    ghost: FolderClosingGhost,
    options: Readonly<{
      animateAlpha?: boolean | undefined;
      folderSlotVisualSize?: number | undefined;
      resetSourceVelocity?: boolean | undefined;
    }> = {},
  ): MotionControl | null {
    const itemId = target?.item?.id;
    const reporter = this.activeReporter;
    if (!itemId || !ghost || !reporter) return null;
    const ghostMotion = makeClosingGhostMotion(target, {
      alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
      closeDuration: motionPresets.folderClose!.duration!,
      isTextlessMode: state.isTextlessMode,
      ...makeClosingGhostLocalRects(this.layer, state, target),
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    const velocityScale = options.resetSourceVelocity === true ? 0 : 1;
    const positionVelocity = {
      x: getActiveMotionVelocity(ghost, "x") * velocityScale,
      y: getActiveMotionVelocity(ghost, "y") * velocityScale,
    };
    const scaleVelocity = {
      x: getActiveMotionVelocity(ghost.scale, "x") * velocityScale,
      y: getActiveMotionVelocity(ghost.scale, "y") * velocityScale,
    };
    const sourcePose = captureGhostRootPose(ghost);
    killAllMotion(ghost, {
      reason: "folder-close-moving-reference-transfer",
      recursive: false,
    });
    ghost.position.set(sourcePose.x, sourcePose.y);
    ghost.scale.set(sourcePose.scaleX, sourcePose.scaleY);
    let folderSlotVisualState: ClosingFolderSlotVisualState | null = null;
    if (target.isThumbnailChild) {
      folderSlotVisualState = {
        mix: 0,
        targetSize: Math.max(1, Number(options.folderSlotVisualSize) || ghostMotion.targetRect.width),
      };
      ghost.prepareFolderSlotReleaseVisual?.(folderSlotVisualState.targetSize);
      ghost.setFolderSlotReleaseVisualMix?.(0);
    } else {
      ghost.clearFolderSlotReleaseVisual?.();
    }
    const follower: ClosingGhostFollower = {
      position: {
        x: ghost.position.x,
        y: ghost.position.y,
      },
      progress: { value: 0 },
      scale: {
        x: ghost.scale.x,
        y: ghost.scale.y,
      },
    };
    const active: ActiveClosingGhost = {
      alignedRenderFrames: 0,
      alignmentGeneration: 1,
      completionScheduled: false,
      folderSlotVisualState,
      follower,
      ghost,
      motionId: this.nextMotionId++,
      motionControl: null,
      motionSettled: false,
      state,
      target,
      targetKey: makeClosingGhostTargetKey(target),
      targetMotion: ghostMotion,
      retargetMotion: () => { throw new Error("Closing motion not initialized"); },
    };
    this.activeGhostsByItemId.set(itemId, active);
    const applyFollower = () => this.applyClosingGhostFollower(active);
    applyFollower();
    active.retargetMotion = () => {
      const previous = active.motionControl;
      const nextPositionVelocity = previous ? { x: getActiveMotionVelocity(follower.position, "x"), y: getActiveMotionVelocity(follower.position, "y") } : positionVelocity;
      const nextScaleVelocity = previous ? { x: getActiveMotionVelocity(follower.scale, "x"), y: getActiveMotionVelocity(follower.scale, "y") } : scaleVelocity;
      if (previous) { this.motionControls.delete(previous); previous.cancel("folder-close-target-changed"); }
      active.motionSettled = false;
      const motionControl = animateClosingGhost(ghost, { ...active.targetMotion, delay: previous ? 0 : active.targetMotion.delay }, active.target, follower, applyFollower, () => {
        reporter.ghostArrived(itemId);
      }, () => {
        active.motionSettled = true;
        follower.position.x = active.targetMotion.toX;
        follower.position.y = active.targetMotion.toY;
        follower.scale.x = active.targetMotion.scale;
        follower.scale.y = active.targetMotion.scale;
        follower.progress.value = 1;
        applyFollower();
        if (active.motionControl) this.motionControls.delete(active.motionControl);
        if (active.folderSlotVisualState) {
          active.folderSlotVisualState.mix = 1;
          ghost.commitFolderSlotReleaseVisual?.();
        }
        if (!active.target.isThumbnailChild && this.activeGhostsByItemId.get(itemId) === active) {
          this.activeGhostsByItemId.delete(itemId);
          this.completeGhost(active.state, active.target, ghost, reporter);
        }
      }, {
        animateAlpha: !previous && options.animateAlpha !== false,
        positionVelocity: nextPositionVelocity,
        scaleVelocity: nextScaleVelocity,
        scheduler: this.scheduler,
      });
      active.motionControl = motionControl;
      const closeSnapshot = reporter.snapshot();
      if (this.activeGhostsByItemId.get(itemId) === active && closeSnapshot?.ghostIds.includes(itemId)) {
        if (!motionControl.completed) this.motionControls.add(motionControl);
      } else {
        this.activeGhostsByItemId.delete(itemId);
      }
      return motionControl;
    };
    return active.retargetMotion();
  }

  getMotionDebugSnapshot() {
    return Array.from(this.activeGhostsByItemId.values()).map((active) => ({
      alignedRenderFrames: active.alignedRenderFrames,
      actualRect: roundRect(active.ghost.getIconBounds(active.state.stageRect)),
      completionScheduled: active.completionScheduled,
      follower: {
        progress: roundNumber(active.follower.progress.value),
        scaleX: roundNumber(active.follower.scale.x),
        scaleY: roundNumber(active.follower.scale.y),
        x: roundNumber(active.follower.position.x),
        y: roundNumber(active.follower.position.y),
      },
      itemId: active.target.item.id,
      motionCompleted: active.motionControl?.completed ?? null,
      motionId: active.motionId,
      motionReleased: active.motionControl?.released ?? null,
      motionSettled: active.motionSettled,
      targetKey: active.targetKey,
      targetRect: roundRect(active.targetMotion.targetRect),
      targetScale: roundNumber(active.targetMotion.scale),
      targetX: roundNumber(active.targetMotion.toX),
      targetY: roundNumber(active.targetMotion.toY),
    }));
  }

  applyClosingGhostFollower(active: ActiveClosingGhost): void {
    const { follower, ghost, targetMotion } = active;
    if (!ghost || ghost.destroyed) return;
    ghost.position.set(
      follower.position.x,
      follower.position.y,
    );
    ghost.scale.set(
      follower.scale.x,
      follower.scale.y,
    );
    this.activeReporter?.setDetachedGhostMotion(ghost, {
      alpha: active.target.isThumbnailChild ? 1 : 0,
      duration: Math.max(
        0.01,
        motionPresets.folderClose!.duration! * (1 - clamp01(follower.progress.value)),
      ),
      scale: targetMotion.scale,
      x: targetMotion.toX,
      y: targetMotion.toY,
    });
    const folderSlotVisualState = active.folderSlotVisualState;
    if (!folderSlotVisualState) return;
    const nextMix = getClosingFolderSlotVisualMix(follower.progress.value);
    folderSlotVisualState.mix = Math.max(folderSlotVisualState.mix, nextMix);
    ghost.setFolderSlotReleaseVisualMix?.(folderSlotVisualState.mix);
  }

  updateClosingGhostTarget(
    active: ActiveClosingGhost,
    state: FolderClosingState,
    target: UsableFolderClosingTarget,
    reporter: FolderClosingPhaseReporter,
  ): void {
    const ghostMotion = makeClosingGhostMotion(target, {
      alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
      closeDuration: motionPresets.folderClose!.duration!,
      isTextlessMode: state.isTextlessMode,
      ...makeClosingGhostLocalRects(this.layer, state, target),
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    active.state = state;
    active.target = target;
    active.targetKey = makeClosingGhostTargetKey(target);
    active.targetMotion = ghostMotion;
    active.alignedRenderFrames = 0;
    active.alignmentGeneration += 1;
    active.completionScheduled = false;
    active.retargetMotion();
    this.applyClosingGhostFollower(active);
  }

  retargetVisuals(
    state: FolderClosingState,
    targets: readonly FolderClosingTarget[],
    folderRect: StageRect,
    _panelRect: StageRect,
    options: FolderClosingControllerPlanOptions = {},
  ): number {
    const reporter = this.activeReporter;
    const folderId = state.renderedFolder?.id || this.layer.getCurrentFolderId() || null;
    const snapshot = reporter?.snapshot?.();
    if (!reporter || !folderId || !snapshot || snapshot.folderId !== folderId) return 0;
    if (snapshot.visualReleased || snapshot.overlaySettled) return 0;

    const closeFrameToRect = this.layer.mapClosingTargetRectToLocal(state, folderRect);
    const thumb = getFolderThumbMetrics(closeFrameToRect.width);
    reporter.setGeometry({
      detachedTarget: makeDetachedCloseFrameTarget(closeFrameToRect, thumb) as unknown as Readonly<Record<string, unknown>>,
      rect: (options.handoffRect || folderRect) as unknown as Readonly<Record<string, unknown>>,
      target: options.handoffTarget || null,
    });

    let retargeted = 0;
    let targetChanged = false;
    if (this.activeFrameState?.folderId === folderId &&
      closeFrameToRect) {
      if (Object.prototype.hasOwnProperty.call(options, "previewSwapTargets")) {
        this.activeFrameState.previewSwapTargets = options.previewSwapTargets || [];
      }
      this.previewSwap.retarget?.(state, this.activeFrameState.previewSwapTargets);
      if (Object.prototype.hasOwnProperty.call(options, "framePlacement")) {
        this.activeFrameState.placement = options.framePlacement || null;
      }
      const frameTargetKey = makeClosingFrameTargetKey(
        closeFrameToRect,
        thumb,
        this.activeFrameState.placement,
      );
      if (frameTargetKey && this.activeFrameState.targetKey !== frameTargetKey) {
        const frameOptions = this.activeFrameState.makeOptions?.(
          state,
          thumb!,
          this.activeFrameState.placement,
        ) || {};
        const retargetedFrame = this.layer.retargetFrameGhost?.(closeFrameToRect, frameOptions);
        if (retargetedFrame) {
          this.activeFrameState.targetKey = frameTargetKey;
          targetChanged = true;
        }
      }
    }

    const usableTargets = (targets || []).filter((target) => target?.item?.id &&
      hasUsableFolderGhostTarget(target) &&
      snapshot.ghostIds.includes(target.item.id)) as UsableFolderClosingTarget[];
    for (const target of usableTargets) {
      const itemId = target.item.id;
      const active = this.activeGhostsByItemId.get(itemId);
      const ghost = active?.ghost;
      if (!ghost || ghost.destroyed) continue;
      const targetKey = makeClosingGhostTargetKey(target);
      if (active.targetKey === targetKey) continue;
      ghost.stageRect = state.stageRect;
      ghost.isThumbnailChild = Boolean(target.isThumbnailChild);
      ghost.setState?.(
        makeFolderGhostIconNodeState({ sourceType: "folder-close-ghost", state, target }),
        { preserveRootPresentation: true },
      );
      this.updateClosingGhostTarget(active, state, target, reporter);
      retargeted += 1;
      targetChanged = true;
    }
    if (targetChanged) this.scheduleRevealFallback(usableTargets);
    return retargeted;
  }

  flushCompletedControllerGhosts(
    state: FolderClosingState,
    keys: readonly string[] = [],
  ): void {
    for (const key of new Set(keys || [])) state.completeFolderCloseIconGhost?.(key);
  }

  hasPendingHandoff(): boolean {
    return this.activeReporter?.snapshot?.()?.handoffActive === true;
  }

  destroyCompletedPreviewGhosts(ghosts: readonly FolderClosingGhost[]): void {
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true });
    }
  }

  clearCompletedPreviewGhosts(): void {
    const ghosts = this.completedPreviewGhosts;
    this.completedPreviewGhosts = [];
    this.destroyCompletedPreviewGhosts(ghosts);
  }

  cancelHandoffCleanup(): void {
    this.cleanupGeneration += 1;
    if (this.cleanupFrame != null) this.scheduler.cancelAnimationFrame?.(this.cleanupFrame);
    this.cleanupFrame = null;
  }

  cancelMotionControls(): void {
    const controls = this.motionControls;
    this.motionControls = new Set();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  deferRunHandoffCleanup(): void {
    this.cancelHandoffCleanup();
    const generation = ++this.cleanupGeneration;
    const cleanup = () => {
      if (generation !== this.cleanupGeneration) return;
      this.cleanupFrame = null;
      this.runHandoffCleanup();
    };
    if (typeof this.scheduler.requestAnimationFrame === "function") {
      this.cleanupFrame = this.scheduler.requestAnimationFrame(cleanup);
    } else {
      cleanup();
    }
  }

  commitHandoffVisualRelease(): boolean {
    const reporter = this.activeReporter;
    if (!reporter) return false;
    const report = reporter.releaseOverlay();
    if (report.status !== "accepted") return false;
    this.debugHandoffVisualRelease("overlay-release-before-clear");
    this.previewSwap.clear();
    this.clearCompletedPreviewGhosts();
    this.clearClosingGhostVisuals();
    this.activeFrameState = null;
    const ownerToken = this.owner?.token;
    if (ownerToken != null) this.layer.clearFrameGhost({ ownerToken });
    this.debugHandoffVisualRelease("overlay-release-after-clear");
    this.layer.onClosingHandoffVisualRelease(reporter.snapshot()?.folderId || this.layer.getCurrentFolderId() || null);
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
    return true;
  }

  clearClosingGhostVisuals(): void {
    this.cancelMotionControls();
    this.activeGhostsByItemId.clear();
    const ghosts = this.layer.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      this.activeReporter?.deleteDetachedGhostMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true });
    }
  }

  runHandoffCleanup(): void {
    const reporter = this.activeReporter;
    this.releaseClosingTransitionOwnership({ restorePageTrack: false, reveal: false });
    this.layer.visible = false;
    this.layer.clearCurrentFolder();
    reporter?.cleanupFinished();
    if (this.activeReporter === reporter) {
      this.activeReporter = null;
      this.owner = null;
      this.ownershipReleased = false;
    }
  }

  releaseClosingTransitionOwnership(
    options: Readonly<{
      restorePageTrack?: boolean | undefined;
      reveal?: boolean | undefined;
    }> = {},
  ): boolean {
    if (!this.owner || this.ownershipReleased) return false;
    this.ownershipReleased = true;
    this.layer.releaseTransitionOwnership(this.owner.token, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    return true;
  }

  startClosingHandoff(
    state: FolderClosingState,
    controllerKeys: readonly string[] = [],
  ): void {
    const reporter = this.activeReporter;
    if (!reporter) return;
    const report = reporter.handoffStarted();
    if (report.status !== "accepted") return;
    this.clearRevealTimer();
    this.layer.panel.visible = false;
    this.layer.pageTrack.visible = false;
    this.commitHandoffVisualRelease();
    this.flushCompletedControllerGhosts(state, controllerKeys);
  }

  makeClosingGhostDebugPayload(
    state: FolderClosingState,
    target: FolderClosingTarget,
    ghost: FolderClosingGhost | null,
    phase: string,
  ) {
    const actualClientRect = ghost?.getIconBounds?.(state.stageRect) || null;
    const actualRect = actualClientRect
      ? this.layer.mapClosingTargetRectToLocal(state, actualClientRect)
      : null;
    const targetRect = target?.targetClientRect
      ? this.layer.mapClosingTargetRectToLocal(state, target.targetClientRect)
      : stageLayoutRectToStageVisualRect(
        state.stageRect as StageRect,
        state.width,
        state.height,
        target.targetStageLayoutRect,
      );
    return {
      actualRect: roundRect(actualRect),
      alpha: roundNumber(ghost?.alpha),
      delta: rectDelta(actualRect, targetRect),
      folderId: state.renderedFolder?.id || (this.activeReporter ? this.activeReporter.snapshot()?.folderId : null) || this.layer.getCurrentFolderId() || null,
      isThumbnailChild: Boolean(target?.isThumbnailChild),
      itemId: target?.item?.id || null,
      phase,
      previewSlotIndex: target?.previewSlotIndex ?? null,
      scaleX: roundNumber(ghost?.scale?.x),
      scaleY: roundNumber(ghost?.scale?.y),
      targetRect: roundRect(targetRect),
      x: roundNumber(ghost?.x ?? ghost?.position?.x),
      y: roundNumber(ghost?.y ?? ghost?.position?.y),
    };
  }

  debugClosingGhostVisualArrive(
    state: FolderClosingState,
    target: FolderClosingTarget,
    ghost: FolderClosingGhost | null,
  ): void {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log) return;
    const payload = this.makeClosingGhostDebugPayload(state, target, ghost, "visual-arrive");
    publishLastFolderHandoffDebug({
      folderId: payload.folderId,
      ghost: payload,
      phase: "visual-arrive",
    });
    console.log("[folder-closing-ghost-visual-arrive]", payload);
  }

  debugHandoffVisualRelease(phase: string): void {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log) return;
    const closeSnapshot = this.activeReporter ? this.activeReporter.snapshot() : null;
    if (!closeSnapshot) return;
    const debugSnapshot = this.layer.getTransitionDebugSnapshot();
    const folderId = closeSnapshot.folderId || this.layer.getCurrentFolderId() || null;
    const payload = {
      closingFrameComplete: closeSnapshot.frameComplete,
      closingFrameVisualComplete: closeSnapshot.frameVisualComplete,
      closingGhostCount: debugSnapshot.closingGhostCount,
      closingGhostKeys: closeSnapshot.ghostIds,
      closingPreviewSwapKeys: closeSnapshot.previewKeys,
      closingVisualGhostKeys: closeSnapshot.visualGhostIds,
      folderId,
      framePresentation: roundRect(debugSnapshot.framePresentation),
      panelVisible: debugSnapshot.panelVisible,
      pageTrackVisible: debugSnapshot.pageTrackVisible,
      phase,
    };
    publishLastFolderHandoffDebug({
      folderId,
      overlay: payload,
      phase,
    });
    console.log("[folder-handoff-debug] overlay-release", payload);
  }

  debugClosingGhostComplete(
    state: FolderClosingState,
    target: FolderClosingTarget,
    ghost: FolderClosingGhost,
    phase: string,
  ): void {
    const options = getFolderHandoffDebugOptions();
    if (!options?.log || !options.timeline) return;
    const payload = this.makeClosingGhostDebugPayload(state, target, ghost, phase);
    console.log("[folder-closing-ghost-complete]", payload);
  }

  completeGhost(
    state: FolderClosingState,
    target: UsableFolderClosingTarget,
    ghost: FolderClosingGhost,
    reporter: FolderClosingPhaseReporter | null = this.activeReporter,
  ): void {
    if (!ghost || ghost.closingComplete) return;
    if (!reporter) return;
    const itemId = target?.item?.id;
    const controllerGhostKey = getClosingControllerGhostKey(state, target);
    const report = reporter.ghostComplete(target.item.id, controllerGhostKey);
    if (report.status !== "accepted") return;
    if (itemId) {
      const active = this.activeGhostsByItemId.get(itemId);
      if (active?.ghost === ghost) this.activeGhostsByItemId.delete(itemId);
    }
    ghost.closingComplete = true;
    this.debugClosingGhostComplete(state, target, ghost, "before-complete");
    killAllMotion(ghost);
    if (target.isThumbnailChild && !ghost.destroyed) {
      const completedPreviewMotion = makeCompletedClosingPreviewMotion(target, {
        isTextlessMode: state.isTextlessMode,
        ...makeClosingGhostLocalRects(this.layer, state, target),
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(completedPreviewMotion.x, completedPreviewMotion.y);
      ghost.scale.set(completedPreviewMotion.scale);
      ghost.alpha = 1;
      ghost.commitFolderSlotReleaseVisual?.();
      this.debugClosingGhostComplete(state, target, ghost, "completed-preview");
      this.completedPreviewGhosts.push(ghost);
      return;
    }
    reporter.deleteDetachedGhostMotion(ghost);
    destroyDisplayObjectAfterFrame(ghost, { children: true });
  }

  completeFrameGhost(
    _state: FolderClosingState,
    reporter: FolderClosingPhaseReporter | null = this.activeReporter,
  ): void {
    reporter?.frameComplete();
  }

  markClosingGhostVisuallyArrived(
    state: FolderClosingState,
    target: FolderClosingTarget,
    ghost: FolderClosingGhost | null = null,
    reporter: FolderClosingPhaseReporter | null = this.activeReporter,
  ): void {
    if (!target?.isThumbnailChild) return;
    if (!reporter) return;
    const report = reporter.ghostVisualReady(target.item?.id);
    if (report.status !== "accepted") return;
    this.debugClosingGhostVisualArrive(state, target, ghost);
  }

  isClosingGhostAligned(active: ActiveClosingGhost): boolean {
    if (!active.motionSettled || active.ghost.destroyed) return false;
    const actualClientRect = active.ghost.getIconBounds(active.state.stageRect);
    const actualRect = actualClientRect
      ? this.layer.mapClosingTargetRectToLocal(active.state, actualClientRect)
      : null;
    const targetRect = active.targetMotion.targetRect;
    if (!actualRect || !targetRect) return false;
    const resolution = Math.max(0.01, Number(active.state.deviceResolution) || 1);
    const localClientPixel = this.layer.mapClosingTargetRectToLocal(active.state, {
      height: 1,
      left: active.state.stageRect.left,
      top: active.state.stageRect.top,
      width: 1,
    });
    const scaleX = resolution / Math.max(0.0001, Math.abs(localClientPixel.width));
    const scaleY = resolution / Math.max(0.0001, Math.abs(localClientPixel.height));
    const actualCenterX = actualRect.left + actualRect.width / 2;
    const actualCenterY = actualRect.top + actualRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    return Math.abs(actualCenterX - targetCenterX) * scaleX <= CLOSING_GHOST_TARGET_DEVICE_EPSILON &&
      Math.abs(actualCenterY - targetCenterY) * scaleY <= CLOSING_GHOST_TARGET_DEVICE_EPSILON &&
      Math.abs(actualRect.width - targetRect.width) * scaleX <= CLOSING_GHOST_TARGET_DEVICE_EPSILON &&
      Math.abs(actualRect.height - targetRect.height) * scaleY <= CLOSING_GHOST_TARGET_DEVICE_EPSILON;
  }

  syncClosingGhostRenderFrame(): void {
    const reporter = this.activeReporter;
    if (!reporter) return;
    for (const [itemId, active] of this.activeGhostsByItemId) {
      if (!active.target.isThumbnailChild || active.completionScheduled) continue;
      this.applyClosingGhostFollower(active);
      if (!this.isClosingGhostAligned(active)) {
        active.alignedRenderFrames = 0;
        active.alignmentGeneration += 1;
        continue;
      }
      active.alignedRenderFrames += 1;
      if (active.alignedRenderFrames < CLOSING_GHOST_ALIGNED_RENDER_FRAMES) continue;
      active.completionScheduled = true;
      const generation = ++active.alignmentGeneration;
      motionRuntime.afterFrame(() => {
        if (this.activeReporter !== reporter || active.ghost.destroyed) return;
        if (this.activeGhostsByItemId.get(itemId) !== active) return;
        if (active.alignmentGeneration !== generation || !this.isClosingGhostAligned(active)) {
          active.completionScheduled = false;
          active.alignedRenderFrames = 0;
          return;
        }
        this.completeGhost(active.state, active.target, active.ghost, reporter);
        this.markClosingGhostVisuallyArrived(
          active.state,
          active.target,
          active.ghost,
          reporter,
        );
      });
    }
  }

  clearVisuals(options: FolderVisualCancelOptions = {}): void {
    this.cancelHandoffCleanup();
    this.clearRevealTimer();
    this.cancelMotionControls();
    this.activeFrameState = null;
    this.activeGhostsByItemId.clear();
    this.releaseClosingTransitionOwnership({
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.clearCompletedPreviewGhosts();
    const owner = this.owner;
    if (owner?.token != null) this.layer.clearFrameGhost({ ownerToken: owner.token });
    this.layer.panel.visible = true;
    const ghosts = this.layer.closingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      this.activeReporter?.deleteDetachedGhostMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true });
    }
    this.previewSwap.clear();
    this.activeReporter = null;
    this.owner = null;
    this.ownershipReleased = false;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
