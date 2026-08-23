import { killAllMotion } from "../animation/motionCleanup.js";
import { parallel, motion } from "../animation/motionTween.js";
import type { MotionControl } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { sceneDiagnosticsState } from "../../../diagnostics/sceneDiagnosticsState.js";
import { clientRectToStageVisualRect, stageLayoutRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import { getClosingPreviewTiming } from "./folderOverlayGeometry.js";
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
const CLOSING_GHOST_VISUAL_POSITION_EPSILON = 0.5;
const CLOSING_GHOST_VISUAL_SCALE_EPSILON = 0.01;

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
  removeFromParent?(): void;
  setState(state: FolderGhostIconNodeState): void;
}

export interface FolderClosingGhostLayer {
  readonly children: FolderClosingGhost[];
  addChild(ghost: FolderClosingGhost): FolderClosingGhost;
  removeChild(ghost: FolderClosingGhost): FolderClosingGhost;
  removeChildren(): FolderClosingGhost[];
}

export type FolderClosingState = Readonly<{
  completeFolderCloseIconGhost?: ((key: string) => unknown) | undefined;
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
  handoffRect?: StageRect | null | undefined;
  handoffTarget?: Readonly<Record<string, unknown>> | null | undefined;
  openingCancelRequest?: Readonly<{ folderId?: string | null | undefined }> | null | undefined;
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
  clearFrameGhost(): void;
  enableClosingFrameMask(): void;
  getClosingFrameStartRect(
    panelRect: StageRect,
    folderId: string | null,
  ): (StageRect & Partial<FolderFramePresentation>) | null;
  getCurrentFolderId(): string | null;
  getTransitionDebugSnapshot(): FolderClosingTransitionDebugSnapshot;
  hideIconNodesForTransition(itemId: string, owner: ClosingOwner): void;
  hidePageTrackForTransition(owner: ClosingOwner): void;
  onClosingHandoffPrepare(folderId: string | null): void;
  onClosingHandoffVisualRelease(folderId: string | null): void;
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

type ActiveClosingGhost = {
  ghost: FolderClosingGhost;
  motionControl: ClosingMotionControl;
  target: UsableFolderClosingTarget;
  targetKey: string;
};

type ActiveClosingFrameState = {
  folderId: string | null;
  makeOptions(state: FolderClosingState, thumb: ClosingThumbMetrics): FolderFrameGhostOptions;
  openingCancelRequest: Readonly<{ folderId?: string | null | undefined }> | null;
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

function animateClosingGhost(
  ghost: FolderClosingGhost,
  ghostMotion: ClosingGhostMotion,
  target: FolderClosingTarget,
  onComplete: (() => void) | null,
  options: Readonly<{
    animateAlpha?: boolean | undefined;
    onVisualArrive?: (() => void) | undefined;
    scheduler?: FolderClosingScheduler | undefined;
  }> = {},
): MotionControl {
  const positionSpring = { ...motionSprings.handoff, arriveDelta: CLOSING_GHOST_VISUAL_POSITION_EPSILON };
  const scaleSpring = { ...motionSprings.handoff, arriveDelta: CLOSING_GHOST_VISUAL_SCALE_EPSILON };
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
  return parallel([
    motion(ghost)
      .spring(positionSpring)
      .handoff()
      .interrupt("retarget")
      .to({ ...motionOptions, x: ghostMotion.toX, y: ghostMotion.toY }),
      motion(ghost.scale)
        .spring(scaleSpring)
        .handoff()
        .interrupt("retarget")
      .to({ ...motionOptions, x: ghostMotion.scale, y: ghostMotion.scale }),
  ], {
    scheduler: options.scheduler,
    onArrive: () => options.onVisualArrive?.(),
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

function makeDetachedCloseFrameTarget(
  folderRect: StageRect,
  stageRect: StageOrigin,
): (StageRect & Readonly<{
  fillAlpha: number;
  fillColor: number;
  radius: number;
  strokeAlpha: number;
  strokeColor: number;
  strokeWidth: number;
}>) | null {
  const closeFrameToRect = clientRectToStageVisualRect(folderRect, stageRect);
  if (!closeFrameToRect) return null;
  const thumb = getFolderThumbMetrics(folderRect.width);
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
      sourceScale: Math.max(0.14, sourceRect.width / Math.max(1, target.iconSize)),
    });
  }
  return released;
}

function preserveReleasedGhostPhysicalPose(
  ghost: FolderClosingGhost,
  sourceRect: StageRect,
  stageRect: StageOrigin,
): FolderClosingTarget["sourcePose"] {
  if (!ghost || !sourceRect || typeof ghost.getIconBounds !== "function") return null;
  const previousScaleX = Math.max(0.0001, Number(ghost.scale?.x) || 1);
  const previousScaleY = Math.max(0.0001, Number(ghost.scale?.y) || 1);
  const currentRect = ghost.getIconBounds(stageRect);
  if (!currentRect || !Number.isFinite(currentRect.width) || !Number.isFinite(currentRect.height)) return null;
  const intrinsicWidth = currentRect.width / previousScaleX;
  const intrinsicHeight = currentRect.height / previousScaleY;
  if (!(intrinsicWidth > 0) || !(intrinsicHeight > 0)) return null;
  const nextScaleX = sourceRect.width / intrinsicWidth;
  const nextScaleY = sourceRect.height / intrinsicHeight;
  if (!(nextScaleX > 0) || !(nextScaleY > 0)) return null;
  ghost.scale.set(nextScaleX, nextScaleY);
  const adjustedRect = ghost.getIconBounds(stageRect);
  if (adjustedRect && ghost.position?.set) {
    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const adjustedCenterX = adjustedRect.left + adjustedRect.width / 2;
    const adjustedCenterY = adjustedRect.top + adjustedRect.height / 2;
    ghost.position.set(
      (Number(ghost.position.x) || 0) + sourceCenterX - adjustedCenterX,
      (Number(ghost.position.y) || 0) + sourceCenterY - adjustedCenterY
    );
  }
  return {
    scaleX: nextScaleX,
    scaleY: nextScaleY,
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
  declare nextTargetGeneration: number;
  declare owner: ClosingOwner | null;
  declare ownershipReleased: boolean;
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
    this.nextTargetGeneration = 1;
    this.owner = null;
    this.ownershipReleased = false;
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
      handoffRect = null,
      openingCancelRequest = null,
      handoffTarget = null,
      previewSwapTargets = [],
    } = options;
    const reporter = this.activeReporter;
    const owner = this.owner;
    if (!reporter || !owner) throw new Error("closing visual scope is not active");
    const folderId = state.renderedFolder?.id || this.layer.getCurrentFolderId() || null;
    const releasedOpeningGhosts = releaseOpeningGhostsForClosing(reporter, state, targets);
    const closeFrameFromRect = this.layer.getClosingFrameStartRect(panelRect, folderId);
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
        : target;
    });
    const openingRetirement = reporter.retireOpening();
    if (openingRetirement?.status === "stale") {
      throw new Error("closing visual scope lost ownership while retiring the opening scope");
    }
    this.layer.acquireDesktopSourceOwnership(owner);
    const usableTargets = (closeTargets || []).filter(hasUsableFolderGhostTarget) as UsableFolderClosingTarget[];
    const isRetargetedOpeningClose = releasedOpeningGhosts.size > 0;
    const frameDuration = motionPresets.folderClose!.duration! + CLOSING_FRAME_TAIL_DURATION;
    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    const thumb = getFolderThumbMetrics(folderRect.width);
    reporter.setGeometry({
      detachedTarget: makeDetachedCloseFrameTarget(folderRect, state.stageRect) as unknown as Readonly<Record<string, unknown>> | null,
      rect: (handoffRect || folderRect) as unknown as Readonly<Record<string, unknown>>,
      target: handoffTarget || null,
    });
    const previewTiming = getClosingPreviewTiming(closeFrameFromRect, closeFrameToRect);
    let closingPreviewSwapStarted = false;
    const startClosingPreviewSwapWhenReady = (frame: Readonly<{ progress?: number | undefined }>) => {
      const currentPreviewSwapTargets = this.activeFrameState?.previewSwapTargets || previewSwapTargets;
      if (closingPreviewSwapStarted || isRetargetedOpeningClose || !currentPreviewSwapTargets?.length) return;
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
    ): FolderFrameGhostOptions => ({
      duration: frameDuration,
      ease: motionPresets.folderClose!.ease!,
      fadeStart: 0.86,
      folderId,
      frameGhostPhase: "closing",
      frameGhostToAlpha: 1,
      fromFillAlpha: frameThumb.fillAlpha,
      fromFillColor: frameThumb.fillColor,
      fromRadius: closeFrameFromRect?.radius ?? 48,
      fromStrokeAlpha: frameThumb.strokeAlpha,
      fromStrokeColor: frameThumb.strokeColor,
      fromStrokeWidth: frameThumb.strokeWidth,
      panelMaterialFinalAlpha: 0,
      panelMaterialFromAlpha: 0,
      panelMaterialToAlpha: 0,
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
      openingCancelRequest: openingCancelRequest?.folderId === folderId ? openingCancelRequest : null,
      makeOptions: makeFrameOptions,
      previewSwapStarted: false,
      previewSwapTargets,
      targetKey: makeClosingFrameTargetKey(closeFrameToRect, thumb),
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
      ghost.setState(makeFolderGhostIconNodeState({ sourceType: "folder-close-ghost", state, target }));
      const sourcePose = released
        ? preserveReleasedGhostPhysicalPose(ghost, released.sourceRect, state.stageRect)
        : null;
      const motionTarget = sourcePose ? { ...target, sourcePose } : target;
      const ghostMotion = makeClosingGhostMotion(motionTarget, {
        alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
        closeDuration: motionPresets.folderClose!.duration!,
        isTextlessMode: state.isTextlessMode,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(ghostMotion.fromX, ghostMotion.fromY);
      ghost.scale.set(ghostMotion.sourceScaleX, ghostMotion.sourceScaleY);
      ghost.alpha = ghostMotion.sourceAlpha;
      reporter.setDetachedGhostMotion(ghost, {
        alpha: target.isThumbnailChild ? 1 : 0,
        duration: motionPresets.folderClose!.duration!,
        scale: ghostMotion.scale,
        x: ghostMotion.toX,
        y: ghostMotion.toY,
      });
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

      this.startGhostMotion(state, motionTarget, ghost, { animateAlpha: true });
    }
    this.layer.onClosingHandoffPrepare(folderId);
  }

  startGhostMotion(
    state: FolderClosingState,
    target: UsableFolderClosingTarget,
    ghost: FolderClosingGhost,
    options: Readonly<{ animateAlpha?: boolean | undefined }> = {},
  ): MotionControl | null {
    const itemId = target?.item?.id;
    const reporter = this.activeReporter;
    if (!itemId || !ghost || !reporter) return null;
    const ghostMotion = makeClosingGhostMotion(target, {
      alphaHold: CLOSING_EXTRA_GHOST_ALPHA_HOLD,
      closeDuration: motionPresets.folderClose!.duration!,
      isTextlessMode: state.isTextlessMode,
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    reporter.setDetachedGhostMotion(ghost, {
      alpha: target.isThumbnailChild ? 1 : 0,
      duration: motionPresets.folderClose!.duration!,
      scale: ghostMotion.scale,
      x: ghostMotion.toX,
      y: ghostMotion.toY,
    });
    let didComplete = false;
    let motionControl: MotionControl | null = null;
    motionControl = animateClosingGhost(ghost, ghostMotion, target, () => {
      didComplete = true;
      if (motionControl) this.motionControls.delete(motionControl);
      const active = this.activeGhostsByItemId.get(itemId);
      if (active?.ghost === ghost && (!motionControl || active.motionControl === motionControl)) {
        this.activeGhostsByItemId.delete(itemId);
      }
      this.completeGhost(state, target, ghost, reporter);
    }, {
      animateAlpha: options.animateAlpha !== false,
      scheduler: this.scheduler,
      onVisualArrive: () => this.markClosingGhostVisuallyArrived(state, target, ghost, reporter),
    });
    const closeSnapshot = reporter.snapshot();
    if (!didComplete && closeSnapshot?.ghostIds.includes(itemId)) {
      this.motionControls.add(motionControl);
      this.activeGhostsByItemId.set(itemId, {
        ghost,
        motionControl,
        target,
        targetKey: makeClosingGhostTargetKey(target),
      });
    } else {
      this.activeGhostsByItemId.delete(itemId);
    }
    return motionControl;
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

    reporter.setGeometry({
      detachedTarget: makeDetachedCloseFrameTarget(folderRect, state.stageRect) as unknown as Readonly<Record<string, unknown>> | null,
      rect: (options.handoffRect || folderRect) as unknown as Readonly<Record<string, unknown>>,
      target: options.handoffTarget || null,
    });

    const closeFrameToRect = clientRectToStageVisualRect(folderRect, state.stageRect);
    const thumb = folderRect ? getFolderThumbMetrics(folderRect.width) : null;
    const frameTargetKey = makeClosingFrameTargetKey(closeFrameToRect, thumb);
    let retargeted = 0;
    let targetChanged = false;
    if (this.activeFrameState?.folderId === folderId &&
      closeFrameToRect) {
      if (Object.prototype.hasOwnProperty.call(options, "previewSwapTargets")) {
        this.activeFrameState.previewSwapTargets = options.previewSwapTargets || [];
      }
      this.previewSwap.retarget?.(state, this.activeFrameState.previewSwapTargets);
      if (frameTargetKey && this.activeFrameState.targetKey !== frameTargetKey) {
        const frameOptions = this.activeFrameState.makeOptions?.(state, thumb!) || {};
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
      if (active.motionControl) {
        this.motionControls.delete(active.motionControl);
        active.motionControl.release?.();
      }
      ghost.stageRect = state.stageRect;
      ghost.isThumbnailChild = Boolean(target.isThumbnailChild);
      ghost.setState?.(makeFolderGhostIconNodeState({ sourceType: "folder-close-ghost", state, target }));
      this.startGhostMotion(state, target, ghost, { animateAlpha: false });
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
    this.layer.clearFrameGhost();
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
    const actualRect = ghost?.getIconBounds?.(state.stageRect) || null;
    const targetRect = target?.targetClientRect
      ? clientRectToStageVisualRect(target.targetClientRect, state.stageRect)
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
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(completedPreviewMotion.x, completedPreviewMotion.y);
      ghost.scale.set(completedPreviewMotion.scale);
      ghost.alpha = 1;
      this.debugClosingGhostComplete(state, target, ghost, "completed-preview");
      this.completedPreviewGhosts.push(ghost);
      return;
    }
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
    this.layer.clearFrameGhost();
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
