import { killAllMotion } from "../animation/motionCleanup.js";
import { killMotionOf, parallel, motion } from "../animation/motionTween.js";
import type { MotionControl } from "../animation/motionTween.js";
import { motionPresets } from "../animation/motionPresets.js";
import type { MotionPreset } from "../animation/motionPresets.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";
import {
  getMaxFolderGhostGridDelay,
  getSyntheticOpeningGhostRevealState,
  makeOpeningGhostMotion,
} from "./folderIconGhostMotion.js";
import { makeFolderGhostIconNodeState } from "./folderGhostIconState.js";
import type { FolderGhostIconNodeState } from "./folderGhostIconState.js";
import { hasUsableFolderGhostTarget } from "./folderOverlayTargets.js";
import type {
  FolderGhostTarget,
  FolderOverlayItem,
  UsableFolderGhostTarget,
} from "./folderOverlayTargets.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { throwAfterVisualAdapterRollback } from "./folderVisualAdapterLifecycle.js";
import { assertFolderOpeningPhaseReporter } from "./folderVisualSession.js";
import type {
  FolderOpeningAdapterScope,
  FolderOpeningPhaseReporter,
  FolderOpeningVisualAdapter,
  FolderOpeningVisualPlan,
  FolderVisualCancelOptions,
} from "./folderVisualSession.js";
import type { FolderFrameGhostOptions } from "./folderFrameGhost.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const GHOST_REVEAL_FALLBACK_PADDING_MS: number = 140;
const GHOST_GEOMETRY_FALLBACK_SECONDS = 0.75;

type OpeningOwner = ReturnType<FolderOpeningPhaseReporter["owner"]>;
type OpeningTimerHandle = unknown;

export interface FolderOpeningScheduler {
  clearTimeout?(handle: OpeningTimerHandle): void;
  requestAnimationFrame?(callback: (time: number) => void): unknown;
  setTimeout?(callback: () => void, timeoutMs: number): OpeningTimerHandle;
}

export interface FolderOpeningPoint {
  x: number;
  y: number;
  set(x: number, y?: number): void;
}

interface FolderOpeningMotionNode {
  readonly children?: readonly FolderOpeningMotionNode[];
  scale?: object | null;
}

export interface FolderOpeningGhost extends FolderOpeningMotionNode {
  alpha: number;
  destroyed: boolean;
  eventMode: string;
  item: FolderOverlayItem | null;
  readonly labelText?: Readonly<{
    scale: FolderOpeningPoint;
    visible: boolean;
  }> & { alpha: number };
  openingPageIndex?: number | undefined;
  parent?: FolderOpeningGhostLayer | null | undefined;
  readonly position: FolderOpeningPoint;
  readonly scale: FolderOpeningPoint;
  stageRect?: StageOrigin | undefined;
  state?: Readonly<{ iconSize?: number | undefined }> | undefined;
  syntheticOpeningRevealProgress?: number | undefined;
  destroy(options?: object): void;
  removeFromParent?(): void;
  setState(state: FolderGhostIconNodeState): void;
}

export interface FolderOpeningGhostLayer {
  readonly children: FolderOpeningGhost[];
  addChild(ghost: FolderOpeningGhost): FolderOpeningGhost;
  removeChild(ghost: FolderOpeningGhost): FolderOpeningGhost;
  removeChildren(): FolderOpeningGhost[];
}

export type FolderOpeningState = Readonly<{
  acceptFolderOpenIconGhostSession?: ((folderId: string | null, requestId: unknown) => boolean) | undefined;
  completeFolderOpenFrameGhost?: ((folderId: string | null, requestId: unknown) => unknown) | undefined;
  completeFolderOpenIconGhost?: ((key: string) => unknown) | undefined;
  folderOpenIconGhosts?: readonly Readonly<{ key?: string | null; requestId?: unknown }>[] | undefined;
  folderPageIndex?: number | undefined;
  folderPageSize?: number | undefined;
  getFolderOpenIconGhostKey?: ((itemId: string, index: number) => string | null | undefined) | undefined;
  height: number;
  isTextlessMode?: boolean | undefined;
  launchTargetStatusById?: Readonly<Record<string, string>> | undefined;
  renderedFolder?: FolderOverlayItem | null | undefined;
  showMissingLaunchTargetBadge?: boolean | undefined;
  stageRect: StageOrigin;
  width: number;
}>;

export type FolderOpeningTarget = FolderGhostTarget & Readonly<{
  cellHeight: number;
  cellWidth: number;
  columnCount: number;
  controllerGhostKey?: string | null | undefined;
  folderId?: string | undefined;
  iconSize: number;
  index: number;
  isThumbnailChild?: boolean | undefined;
  item: FolderOverlayItem;
  pageIndex: number;
  previewSlotIndex?: number | null | undefined;
  provisionalLayoutTarget?: boolean | undefined;
}>;

type UsableFolderOpeningTarget = FolderOpeningTarget & UsableFolderGhostTarget;

export type FolderOpeningControllerPlanOptions = Readonly<{
  frameSourceRect?: StageRect | null | undefined;
  frameTargetRect?: StageRect | null | undefined;
}>;

export type FolderOpeningControllerVisualPlan = FolderOpeningVisualPlan<
  FolderOpeningState,
  FolderOpeningTarget,
  FolderOpeningControllerPlanOptions
>;

export type FolderOpeningGhostControllerLayer = Readonly<{
  frameGhost: { alpha: number; visible: boolean };
  openingGhostBoundsRefreshers: Map<string, () => unknown>;
  openingGhostLayer: FolderOpeningGhostLayer;
  panelMaterial: { alpha: number; visible: boolean };
  acquireDesktopSourceOwnership(owner: OpeningOwner): unknown;
  clearFrameGhost(): void;
  getCurrentFolderId(): string | null;
  hideIconNodesForTransition(itemId: string, owner: OpeningOwner): void;
  isOpeningGeometryTransitionActive?(): boolean;
  rebuildPageTrackMask(): unknown;
  refreshRegisteredIconBounds(): unknown;
  registerOpeningGhostBounds(
    state: FolderOpeningState,
    target: FolderOpeningTarget,
    ghost: FolderOpeningGhost,
  ): unknown;
  releaseTransitionOwnership(
    token: string | undefined,
    options: Readonly<{
      restorePageTrack?: boolean | undefined;
      reveal?: boolean | undefined;
    }>,
  ): unknown;
  removeOpeningGhost(ghost: FolderOpeningGhost): unknown;
  retargetFrameGhost(rect: StageRect, options: FolderFrameGhostOptions): boolean;
  startFrameGhost(fromRect: StageRect, toRect: StageRect, options: FolderFrameGhostOptions): boolean;
}>;

export type FolderOpeningGhostControllerOptions = Readonly<{
  ghostFactory: () => FolderOpeningGhost;
  scheduler?: FolderOpeningScheduler | undefined;
}>;

type OpeningGhostMotion = ReturnType<typeof makeOpeningGhostMotion>;
type OpeningMotionControl = Pick<MotionControl, "cancel" | "completed" | "release">;

function getOpeningFrameGhostRequestId(state: FolderOpeningState): unknown | null {
  const ids = new Set((state.folderOpenIconGhosts || [])
    .map((ghost) => ghost?.requestId)
    .filter((id) => id != null));
  return ids.size === 1 ? Array.from(ids)[0] : null;
}

function completeOpeningFrameGhost(
  layer: FolderOpeningGhostControllerLayer,
  state: FolderOpeningState,
): unknown {
  const folderId = state.renderedFolder?.id || layer.getCurrentFolderId() || null;
  return state.completeFolderOpenFrameGhost?.(folderId, getOpeningFrameGhostRequestId(state));
}

function animateOpeningGhost(
  ghost: FolderOpeningGhost,
  ghostMotion: OpeningGhostMotion,
  onArrive: () => void,
  options: Readonly<{
    onFrame?: (() => void) | undefined;
    scheduler?: FolderOpeningScheduler | undefined;
  }> = {},
): OpeningMotionControl {
  const springOptions = { delay: ghostMotion.delay, onUpdate: options.onFrame };
  const fadeControl = ghostMotion.isThumbnailChild
    ? motion(ghost)
      .preset("folderOpenGhost", { delay: ghostMotion.delay } as MotionPreset & { delay: number })
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 1 })
      .start()
    : null;
  const geometryControl = parallel([
    motion(ghost)
      .preset("handoff")
      .handoff()
      .interrupt("retarget")
      .to({ ...springOptions, x: ghostMotion.toX, y: ghostMotion.toY }),
    motion(ghost.scale)
      .preset("handoff")
      .handoff()
      .interrupt("retarget")
      .to({ ...springOptions, x: 1, y: 1 }),
  ], {
    scheduler: options.scheduler,
    onArrive,
  });
  return {
    cancel() {
      fadeControl?.cancel();
      geometryControl.cancel();
    },
    get completed() {
      return geometryControl.completed;
    },
    release() {
      fadeControl?.cancel();
      geometryControl.release();
    },
  };
}

function updateSyntheticOpeningGhostReveal(
  ghost: FolderOpeningGhost,
  ghostMotion: OpeningGhostMotion,
): void {
  if (!ghost || ghostMotion.isThumbnailChild) return;
  const reveal = getSyntheticOpeningGhostRevealState(
    Math.min(Number(ghost.scale?.x) || 0, Number(ghost.scale?.y) || 0),
    ghostMotion.scale,
    ghost.syntheticOpeningRevealProgress
  );
  ghost.syntheticOpeningRevealProgress = reveal.progress;
  ghost.alpha = reveal.alpha;
  if (ghost.labelText?.visible) {
    ghost.labelText.alpha = reveal.labelAlpha;
    ghost.labelText.scale.set(reveal.labelScale);
  }
}

function finishOpeningGhostReveal(ghost: FolderOpeningGhost): void {
  ghost.alpha = 1;
  if (ghost.labelText?.visible) {
    ghost.labelText.alpha = 1;
    ghost.labelText.scale.set(1);
  }
}

function retargetOpeningGhost(
  ghost: FolderOpeningGhost,
  ghostMotion: OpeningGhostMotion,
  onArrive: () => void,
  options: Readonly<{
    onFrame?: (() => void) | undefined;
    scheduler?: FolderOpeningScheduler | undefined;
  }> = {},
): OpeningMotionControl {
  const geometryControl = parallel([
    motion(ghost)
      .preset("layout")
      .handoff()
      .interrupt("retarget")
      .to({ x: ghostMotion.toX, y: ghostMotion.toY, onUpdate: options.onFrame }),
    motion(ghost.scale)
      .preset("handoff")
      .handoff()
      .interrupt("retarget")
      .to({ x: 1, y: 1 }),
  ], {
    scheduler: options.scheduler,
    onArrive,
  });
  return {
    cancel() {
      geometryControl.cancel();
    },
    get completed() {
      return geometryControl.completed;
    },
    release() {
      geometryControl.release();
    },
  };
}

function findOpeningGhostByItemId(
  children: readonly FolderOpeningGhost[] | null | undefined,
  itemId: string | null | undefined,
): FolderOpeningGhost | null {
  if (!itemId) return null;
  return (children || []).find((ghost) => ghost?.item?.id === itemId && !ghost.destroyed) || null;
}

function makeOpeningGhostTargetKey(target: FolderOpeningTarget): string {
  const rect = (target.targetStageLayoutRect || {}) as Partial<StageRect>;
  return [
    target.pageIndex ?? "",
    rect.left ?? "",
    rect.top ?? "",
    rect.width ?? "",
    rect.height ?? "",
    target.iconSize ?? "",
    target.provisionalLayoutTarget === true ? "provisional" : "final",
  ].join(":");
}

function isProvisionalOpeningGhostTarget(target: FolderOpeningTarget): boolean {
  return target.provisionalLayoutTarget === true;
}

function roundFrameValue(value: unknown): number | "" {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Math.round(number * 100) / 100;
}

function makeOpeningFrameTargetKey(rect: StageRect | null | undefined = null): string {
  if (!rect) return "";
  return [
    roundFrameValue(rect.left),
    roundFrameValue(rect.top),
    roundFrameValue(rect.width),
    roundFrameValue(rect.height),
  ].join(":");
}

function startOpeningFrameGhost(
  layer: FolderOpeningGhostControllerLayer,
  state: FolderOpeningState,
  options: FolderOpeningControllerPlanOptions = {},
): boolean {
  const sourceRect = clientRectToStageVisualRect(options.frameSourceRect, state.stageRect);
  const targetRect = options.frameTargetRect;
  if (!sourceRect || !targetRect) return false;
  const thumb = getFolderThumbMetrics(sourceRect.width);
  const folderId = state.renderedFolder?.id || layer.getCurrentFolderId() || null;
  const requestId = getOpeningFrameGhostRequestId(state);
  return layer.startFrameGhost(sourceRect, targetRect, {
    duration: motionPresets.folderOpenGhost!.duration!,
    ease: motionPresets.folderOpenGhost!.ease!,
    exclusivePanelMaterialHandoff: true,
    folderId,
    frameGhostPhase: "opening",
    fromFillAlpha: thumb.fillAlpha,
    fromFillColor: thumb.fillColor,
    fromRadius: thumb.radius,
    fromStrokeAlpha: thumb.strokeAlpha,
    fromStrokeColor: thumb.strokeColor,
    fromStrokeWidth: thumb.strokeWidth,
    notifyTitleFrame: false,
    toFillAlpha: 0.26,
    toFillColor: 0xf7f8ff,
    toRadius: 48,
    toStrokeAlpha: 0.24,
    toStrokeColor: 0xffffff,
    toStrokeWidth: 1,
    onArrive: () => state.completeFolderOpenFrameGhost?.(folderId, requestId),
  });
}

export class FolderOpeningGhostController implements FolderOpeningVisualAdapter<FolderOpeningControllerVisualPlan> {
  declare readonly layer: FolderOpeningGhostControllerLayer;
  declare ghostFactory: () => FolderOpeningGhost;
  declare readonly scheduler: FolderOpeningScheduler;
  declare activeReporter: FolderOpeningPhaseReporter | null;
  declare activeState: FolderOpeningState | null;
  declare controllerKeys: Map<string, string>;
  declare ghostItemIds: Set<string>;
  declare motionControls: Set<OpeningMotionControl>;
  declare motionControlsByItemId: Map<string, OpeningMotionControl>;
  declare nextTargetGeneration: number;
  declare owner: OpeningOwner | null;
  declare revealTimer: OpeningTimerHandle | null;
  declare targetGeneration: number;
  declare openingTargetKeysByItemId: Map<string, string>;
  declare openingFrameTargetKey: string | null;
  declare settledOpeningGhostItemIds: Set<string>;

  constructor(
    layer: FolderOpeningGhostControllerLayer,
    options: FolderOpeningGhostControllerOptions,
  );
  constructor(
    layer: FolderOpeningGhostControllerLayer | null | undefined,
    options?: FolderOpeningGhostControllerOptions,
  ) {
    if (!layer || typeof layer !== "object") {
      throw new TypeError("FolderOpeningGhostController requires a layer");
    }
    if (!options || typeof options.ghostFactory !== "function") {
      throw new TypeError("FolderOpeningGhostController requires a ghost factory");
    }
    this.layer = layer;
    this.ghostFactory = options.ghostFactory;
    this.scheduler = options.scheduler || globalThis;
    this.activeReporter = null;
    this.activeState = null;
    this.controllerKeys = new Map();
    this.ghostItemIds = new Set();
    this.motionControls = new Set();
    this.motionControlsByItemId = new Map();
    this.nextTargetGeneration = 1;
    this.owner = null;
    this.revealTimer = null;
    this.targetGeneration = 0;
    this.openingTargetKeysByItemId = new Map();
    this.openingFrameTargetKey = null;
    this.settledOpeningGhostItemIds = new Set();
  }

  prepare(
    plan: FolderOpeningControllerVisualPlan,
  ): Readonly<{ ghostIds: readonly string[] }>;
  prepare(
    plan?: FolderOpeningControllerVisualPlan,
  ): Readonly<{ ghostIds: readonly string[] }> {
    if (!plan || typeof plan !== "object") {
      throw new TypeError("opening adapter plan must be an object");
    }
    const targets = Array.isArray(plan.targets) ? plan.targets : [];
    return {
      ghostIds: (targets
        .filter(hasUsableFolderGhostTarget) as FolderOpeningTarget[])
        .map((target) => target?.item?.id)
        .filter(Boolean) as string[],
    };
  }

  start(
    plan: FolderOpeningControllerVisualPlan,
    reporter: FolderOpeningPhaseReporter,
  ): FolderOpeningAdapterScope<FolderOpeningControllerVisualPlan>;
  start(
    plan: FolderOpeningControllerVisualPlan | null | undefined,
    reporter: FolderOpeningPhaseReporter,
  ): FolderOpeningAdapterScope<FolderOpeningControllerVisualPlan> {
    assertFolderOpeningPhaseReporter(reporter);
    if (!plan || typeof plan !== "object") {
      throw new TypeError("opening adapter plan must be an object");
    }
    const state = plan.state;
    if (!state || typeof state !== "object") throw new TypeError("opening adapter plan requires state");
    const targets = Array.isArray(plan.targets) ? plan.targets : [];
    const options = plan.options && typeof plan.options === "object" ? plan.options : {};
    this.clearVisuals({
      completeControllerKeys: false,
      restorePageTrack: false,
      reveal: false,
    });
    this.activeReporter = reporter;
    this.owner = reporter.owner();
    try {
      this.startVisuals(state, targets, options);
    } catch (error) {
      throwAfterVisualAdapterRollback(error, () => {
        this.clearVisuals({ restorePageTrack: true, reveal: true });
      }, "opening visual startup and rollback both failed");
    }
    const isActive = () => this.activeReporter === reporter;
    return Object.freeze({
      cancel: (cancelOptions: FolderVisualCancelOptions = {}) => {
        if (!isActive()) return;
        this.clearVisuals(cancelOptions);
      },
      retarget: (
        nextPlan: FolderOpeningControllerVisualPlan = {} as FolderOpeningControllerVisualPlan,
      ) => {
        if (!isActive()) return;
        const nextState = nextPlan.state;
        if (!nextState || typeof nextState !== "object") throw new TypeError("opening retarget plan requires state");
        this.retargetVisuals(
          nextState,
          Array.isArray(nextPlan.targets) ? nextPlan.targets : [],
          nextPlan.options && typeof nextPlan.options === "object" ? nextPlan.options : {},
        );
      },
      reveal: () => {
        if (isActive()) this.reveal(reporter);
      },
      snapshot: () => this.snapshot(reporter),
      takeGhost: (itemId: string, accept?: (ghost: unknown) => boolean) => (
        isActive() ? this.takeGhost(itemId, accept) : null
      ),
    });
  }

  snapshot(reporter: FolderOpeningPhaseReporter | null = this.activeReporter): Readonly<{
    active: boolean;
    ghostIds: readonly string[];
    motionControlCount: number;
    revealTimerActive: boolean;
  }> {
    const active = reporter != null && this.activeReporter === reporter;
    return Object.freeze({
      active,
      ghostIds: Object.freeze(active ? Array.from(this.ghostItemIds) : []),
      motionControlCount: active ? this.motionControls.size : 0,
      revealTimerActive: active && this.revealTimer != null,
    });
  }

  clearRevealTimer(): void {
    this.targetGeneration = this.nextTargetGeneration++;
    if (this.revealTimer != null) this.scheduler.clearTimeout?.(this.revealTimer);
    this.revealTimer = null;
  }

  clearFrameTarget(): void {
    this.openingFrameTargetKey = null;
  }

  scheduleRevealFallback(targets: readonly FolderOpeningTarget[]): void {
    this.clearRevealTimer();
    const reporter = this.activeReporter;
    if (!reporter) return;
    const targetGeneration = this.nextTargetGeneration++;
    this.targetGeneration = targetGeneration;
    const maxDelay = getMaxFolderGhostGridDelay(targets, 0.18);
    const fallbackSeconds = Math.max(
      motionPresets.folderOpenGhost!.duration!,
      GHOST_GEOMETRY_FALLBACK_SECONDS,
    );
    const timeoutMs = Math.round((maxDelay + fallbackSeconds) * 1000 + GHOST_REVEAL_FALLBACK_PADDING_MS);
    this.revealTimer = this.scheduler.setTimeout?.(() => {
      if (this.activeReporter !== reporter || this.targetGeneration !== targetGeneration) return;
      this.revealTimer = null;
      if (this.ghostItemIds.size > 0 &&
        this.layer.isOpeningGeometryTransitionActive?.() === true) {
        this.scheduleRevealFallback(targets);
        return;
      }
      if (this.ghostItemIds.size > 0) {
        this.settledOpeningGhostItemIds = new Set(this.ghostItemIds);
        this.reportGhostsReady();
      }
    }, timeoutMs) || null;
  }

  cancelMotionControls(): void {
    const controls = this.motionControls;
    this.motionControls = new Set();
    this.motionControlsByItemId = new Map();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  hasUnsettledOpeningGhosts(): boolean {
    const activeItemIds = this.ghostItemIds;
    if (!activeItemIds?.size) return false;
    for (const itemId of activeItemIds) {
      if (!this.settledOpeningGhostItemIds.has(itemId)) return true;
    }
    return false;
  }

  canRevealSettledOpeningGhosts(
    options: Readonly<{ ignoreGeometryGate?: boolean | undefined }> = {},
  ): boolean {
    return !this.hasUnsettledOpeningGhosts() &&
      (
        options.ignoreGeometryGate === true ||
      this.layer.isOpeningGeometryTransitionActive?.() !== true
      );
  }

  takeGhost(
    itemId: string,
    accept: ((ghost: unknown) => boolean) | null | undefined = null,
  ): FolderOpeningGhost | null {
    if (!itemId || !this.ghostItemIds.has(itemId)) return null;
    let releasedGhost = null;
    for (const ghost of this.layer.openingGhostLayer.children || []) {
      if (ghost?.item?.id === itemId && !ghost.destroyed) {
        releasedGhost = ghost;
        break;
      }
    }
    if (!releasedGhost) return null;
    if (typeof accept === "function" && !accept(releasedGhost)) return null;
    const control = this.motionControlsByItemId.get(itemId);
    control?.release?.();
    if (control) this.motionControls.delete(control);
    this.motionControlsByItemId.delete(itemId);
    killMotionOf(releasedGhost, "alpha", { lane: "base", laneKey: "overlay" });
    if (releasedGhost.labelText) {
      killMotionOf(releasedGhost.labelText);
      killMotionOf(releasedGhost.labelText.scale);
    }
    this.ghostItemIds.delete(itemId);
    this.controllerKeys.delete(itemId);
    this.settledOpeningGhostItemIds.delete(itemId);
    this.openingTargetKeysByItemId.delete(itemId);
    this.layer.openingGhostBoundsRefreshers.delete(itemId);
    this.layer.removeOpeningGhost(releasedGhost);
    if (!this.ghostItemIds.size) this.clearRevealTimer();
    return releasedGhost;
  }

  completeControllerKeys(): readonly string[] {
    const state = this.activeState;
    const keys = Array.from(this.controllerKeys.values());
    this.controllerKeys.clear();
    for (const key of keys) {
      if (key) state?.completeFolderOpenIconGhost?.(key);
    }
    return keys;
  }

  clearVisuals(options: FolderVisualCancelOptions = {}): void {
    this.clearRevealTimer();
    this.cancelMotionControls();
    const owner = this.owner;
    if (options.completeControllerKeys !== false) this.completeControllerKeys();
    this.layer.releaseTransitionOwnership(owner?.token, {
      restorePageTrack: options.restorePageTrack,
      reveal: options.reveal,
    });
    this.activeReporter = null;
    this.activeState = null;
    this.controllerKeys.clear();
    this.ghostItemIds.clear();
    this.owner = null;
    this.layer.openingGhostBoundsRefreshers.clear();
    this.layer.clearFrameGhost();
    this.openingTargetKeysByItemId.clear();
    this.openingFrameTargetKey = null;
    this.settledOpeningGhostItemIds.clear();
    const ghosts = this.layer.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true }, this.scheduler as typeof globalThis);
    }
  }

  reportGhostsReady(
    options: Readonly<{ ignoreGeometryGate?: boolean | undefined }> = {},
  ): boolean {
    if (!this.canRevealSettledOpeningGhosts({
      ignoreGeometryGate: options.ignoreGeometryGate === true,
    })) return false;
    const reporter = this.activeReporter;
    if (!reporter) return false;
    this.clearRevealTimer();
    this.cancelMotionControls();
    return reporter.ghostsReady().status !== "stale";
  }

  reveal(reporter: FolderOpeningPhaseReporter | null = this.activeReporter): boolean {
    if (!reporter || reporter !== this.activeReporter) return false;
    const owner = this.owner;
    this.clearRevealTimer();
    this.cancelMotionControls();
    this.completeControllerKeys();
    this.ghostItemIds.clear();
    this.layer.openingGhostBoundsRefreshers.clear();
    this.layer.releaseTransitionOwnership(owner?.token, { restorePageTrack: true, reveal: true });
    this.layer.refreshRegisteredIconBounds();
    this.layer.rebuildPageTrackMask();
    this.openingTargetKeysByItemId.clear();
    this.settledOpeningGhostItemIds.clear();
    const ghosts = this.layer.openingGhostLayer.removeChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true }, this.scheduler as typeof globalThis);
    }
    this.activeReporter = null;
    this.activeState = null;
    this.owner = null;
    return true;
  }

  complete(
    _state: FolderOpeningState,
    target: FolderOpeningTarget,
    ghost: FolderOpeningGhost,
  ): void {
    const itemId = target.item.id;
    this.settledOpeningGhostItemIds.add(itemId);
    finishOpeningGhostReveal(ghost);
    ghost.scale.set(1);
    this.reportGhostsReady();
  }

  completeIfFinalTarget(
    state: FolderOpeningState,
    target: FolderOpeningTarget,
    ghost: FolderOpeningGhost,
    motionControl: OpeningMotionControl | null = null,
  ): boolean {
    if (isProvisionalOpeningGhostTarget(target)) {
      finishOpeningGhostReveal(ghost);
      ghost.scale.set(1);
      return false;
    }
    if (motionControl) {
      this.motionControls.delete(motionControl);
      this.motionControlsByItemId.delete(target.item.id);
    }
    this.complete(state, target, ghost);
    return true;
  }

  startVisuals(
    state: FolderOpeningState,
    targets: readonly FolderOpeningTarget[],
    options: FolderOpeningControllerPlanOptions = {},
  ): boolean | void {
    const reporter = this.activeReporter;
    const owner = this.owner;
    if (!reporter || !owner) throw new Error("opening visual scope is not active");
    const folderId = state.renderedFolder?.id || this.layer.getCurrentFolderId() || null;
    const requestId = getOpeningFrameGhostRequestId(state);
    const hasStagedGhosts = (state.folderOpenIconGhosts || []).length > 0;
    if (hasStagedGhosts && typeof state.acceptFolderOpenIconGhostSession === "function") {
      const accepted = state.acceptFolderOpenIconGhostSession(folderId, requestId);
      if (!accepted) {
        reporter.fail(new Error(`opening ghost session was rejected for folder ${folderId || "unknown"}`));
        return false;
      }
    }
    this.activeState = state;
    const usableTargets = (targets || []).filter(hasUsableFolderGhostTarget) as UsableFolderOpeningTarget[];
    const usableControllerGhostKeys = new Set<string>();
    for (const target of usableTargets) {
      const key = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
      if (key) usableControllerGhostKeys.add(key);
    }
    for (const ghost of state.folderOpenIconGhosts || []) {
      if (ghost?.key && !usableControllerGhostKeys.has(ghost.key)) {
        state.completeFolderOpenIconGhost?.(ghost.key);
      }
    }

    this.layer.acquireDesktopSourceOwnership(owner);
    const startedFrameGhost = startOpeningFrameGhost(this.layer, state, options);
    this.openingFrameTargetKey = startedFrameGhost
      ? makeOpeningFrameTargetKey(options.frameTargetRect)
      : null;
    if (!startedFrameGhost) {
      this.layer.panelMaterial.visible = true;
      this.layer.panelMaterial.alpha = 1;
      this.layer.frameGhost.visible = false;
      this.layer.frameGhost.alpha = 0;
      completeOpeningFrameGhost(this.layer, state);
    }

    if (!usableTargets.length) {
      this.reportGhostsReady({ ignoreGeometryGate: true });
      return;
    }
    this.scheduleRevealFallback(usableTargets);

    for (const target of usableTargets) {
      const controllerGhostKey = target.controllerGhostKey || state.getFolderOpenIconGhostKey?.(target.item.id, target.index);
      this.ghostItemIds.add(target.item.id);
      if (controllerGhostKey) this.controllerKeys.set(target.item.id, controllerGhostKey);
    }

    for (const target of usableTargets) {
      const ghost = this.ghostFactory();
      ghost.eventMode = "none";
      ghost.openingPageIndex = target.pageIndex;
      ghost.stageRect = state.stageRect;
      ghost.setState(makeFolderGhostIconNodeState({ sourceType: "folder-open-ghost", state, target }));
      const ghostMotion = makeOpeningGhostMotion(target, {
        isTextlessMode: state.isTextlessMode,
        openDuration: motionPresets.folderOpenGhost!.duration!,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.position.set(ghostMotion.fromX, ghostMotion.fromY);
      ghost.scale.set(ghostMotion.scale);
      ghost.alpha = ghostMotion.alpha;
      const refreshGhostBounds = () => this.layer.registerOpeningGhostBounds(state, target, ghost);
      this.layer.openingGhostBoundsRefreshers.set(target.item.id, refreshGhostBounds);
      this.openingTargetKeysByItemId.set(target.item.id, makeOpeningGhostTargetKey(target));
      if (ghost.labelText?.visible) {
        ghost.labelText.alpha = 0;
        ghost.labelText.scale.set(0.94);
        if (ghostMotion.isThumbnailChild) {
          motion(ghost.labelText)
            .preset("fade", { delay: ghostMotion.labelDelay, duration: 0.13 } as MotionPreset & { delay: number })
            .overlay()
            .interrupt("retarget")
            .to({ alpha: 1 })
            .start();
          motion(ghost.labelText.scale)
            .preset("fade", { delay: ghostMotion.labelDelay, duration: 0.13 } as MotionPreset & { delay: number })
            .overlay()
            .interrupt("retarget")
            .to({ x: 1, y: 1 })
            .start();
        }
      }
      this.layer.openingGhostLayer.addChild(ghost);
      refreshGhostBounds();
      this.layer.hideIconNodesForTransition(target.item.id, owner);

      let didFinish = false;
      let motionControl: OpeningMotionControl | null = null;
      const updateGhostFrame = () => {
        updateSyntheticOpeningGhostReveal(ghost, ghostMotion);
        refreshGhostBounds();
      };
      motionControl = animateOpeningGhost(ghost, ghostMotion, () => {
        didFinish = this.completeIfFinalTarget(state, target, ghost, motionControl);
      }, { scheduler: this.scheduler, onFrame: updateGhostFrame });
      if (!didFinish && this.ghostItemIds.has(target.item.id)) {
        this.motionControls.add(motionControl);
        this.motionControlsByItemId.set(target.item.id, motionControl);
      }
    }
  }

  retargetFrame(
    state: FolderOpeningState,
    options: FolderOpeningControllerPlanOptions = {},
  ): boolean {
    const targetRect = options.frameTargetRect;
    const targetKey = makeOpeningFrameTargetKey(targetRect);
    if (!targetKey || !this.openingFrameTargetKey || this.openingFrameTargetKey === targetKey) return false;
    const folderId = state.renderedFolder?.id || this.layer.getCurrentFolderId() || null;
    const requestId = getOpeningFrameGhostRequestId(state);
    const retargeted = this.layer.retargetFrameGhost(targetRect!, {
      duration: motionPresets.folderOpenGhost!.duration!,
      ease: motionPresets.folderOpenGhost!.ease!,
      folderId,
      frameGhostPhase: "opening",
      notifyTitleFrame: false,
      preserveOnComplete: false,
      toFillAlpha: 0.26,
      toFillColor: 0xf7f8ff,
      toRadius: 48,
      toStrokeAlpha: 0.24,
      toStrokeColor: 0xffffff,
      toStrokeWidth: 1,
      onArrive: () => state.completeFolderOpenFrameGhost?.(folderId, requestId),
    });
    if (retargeted) this.openingFrameTargetKey = targetKey;
    return retargeted;
  }

  retargetVisuals(
    state: FolderOpeningState,
    targets: readonly FolderOpeningTarget[],
    options: FolderOpeningControllerPlanOptions = {},
  ): number {
    let retargeted = this.retargetFrame(state, options) ? 1 : 0;
    if (!this.ghostItemIds.size) return retargeted;
    const usableTargets = (targets || []).filter((target) =>
      target?.item?.id &&
      hasUsableFolderGhostTarget(target) &&
      this.ghostItemIds.has(target.item?.id)
    ) as UsableFolderOpeningTarget[];
    if (!usableTargets.length) {
      if (retargeted > 0) this.scheduleRevealFallback([]);
      return retargeted;
    }

    const ghosts = this.layer.openingGhostLayer.children || [];
    for (const target of usableTargets) {
      const itemId = target.item.id;
      const ghost = findOpeningGhostByItemId(ghosts, itemId);
      if (!ghost) continue;
      const targetKey = makeOpeningGhostTargetKey(target);
      if (this.openingTargetKeysByItemId.get(itemId) === targetKey) continue;

      ghost.openingPageIndex = target.pageIndex;
      const previousIconSize = Math.max(0.01, Number(ghost.state?.iconSize) || Number(target.iconSize) || 1);
      const ghostMotion = makeOpeningGhostMotion(target, {
        isTextlessMode: state.isTextlessMode,
        openDuration: motionPresets.folderOpenGhost!.duration!,
        stageHeight: state.height,
        stageRect: state.stageRect,
        stageWidth: state.width,
      });
      ghost.stageRect = state.stageRect;
      ghost.setState?.(makeFolderGhostIconNodeState({ sourceType: "folder-open-ghost", state, target }));
      const nextIconSize = Math.max(0.01, Number(target.iconSize) || previousIconSize);
      if (Math.abs(previousIconSize - nextIconSize) > 0.0001) {
        const scaleMultiplier = previousIconSize / nextIconSize;
        ghost.scale.set(
          Math.max(0.01, ghost.scale.x * scaleMultiplier),
          Math.max(0.01, ghost.scale.y * scaleMultiplier)
        );
      }
      const refreshGhostBounds = () => this.layer.registerOpeningGhostBounds(state, target, ghost);
      this.layer.openingGhostBoundsRefreshers.set(itemId, refreshGhostBounds);
      refreshGhostBounds();

      const previousControl = this.motionControlsByItemId.get(itemId);
      if (previousControl) this.motionControls.delete(previousControl);
      this.motionControlsByItemId.delete(itemId);
      this.settledOpeningGhostItemIds.delete(itemId);
      this.openingTargetKeysByItemId.set(itemId, targetKey);

      let didFinish = false;
      let motionControl: OpeningMotionControl | null = null;
      const updateGhostFrame = () => {
        updateSyntheticOpeningGhostReveal(ghost, ghostMotion);
        refreshGhostBounds();
      };
      motionControl = retargetOpeningGhost(ghost, ghostMotion, () => {
        didFinish = this.completeIfFinalTarget(state, target, ghost, motionControl);
      }, { scheduler: this.scheduler, onFrame: updateGhostFrame });
      if (didFinish) {
        this.openingTargetKeysByItemId.delete(itemId);
      } else if (this.ghostItemIds.has(itemId)) {
        this.motionControls.add(motionControl);
        this.motionControlsByItemId.set(itemId, motionControl);
      }
      retargeted += 1;
    }
    if (retargeted > 0) this.scheduleRevealFallback(usableTargets);
    this.reportGhostsReady();
    return retargeted;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
