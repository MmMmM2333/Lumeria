import { killAllMotion } from "../animation/motionCleanup.js";
import { killMotionOf, parallel, motion } from "../animation/motionTween.js";
import type { MotionControl, MotionVars } from "../animation/motionTween.js";
import { motionPresets, motionSprings } from "../animation/motionPresets.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { destroyDisplayObjectAfterFrame } from "./displayObjectLifecycle.js";
import { makeClosingPreviewSwapPlan } from "./folderPreviewSwapMotion.js";
import type { ClosingPreviewSwapIconMotion } from "./folderPreviewSwapMotion.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import type { ClosingPreviewSwapTarget } from "./folderOverlayTargets.js";
import type { FolderOverlayItem } from "./folderOverlayTargets.js";
import type { FolderVisualReportResult } from "./folderVisualSession.js";

export type FolderClosingPreviewSwapState = Readonly<{
  folderPageIndex: number;
  height: number;
  renderedFolder?: Readonly<{ id?: string | null | undefined }> | null | undefined;
  stageRect: StageOrigin;
  width: number;
}>;

export type FolderClosingPreviewSwapReporter = Readonly<{
  previewComplete(key: string): FolderVisualReportResult;
  previewStarted(key: string): FolderVisualReportResult;
}>;

export type FolderClosingPreviewSwapTiming = Readonly<{
  iconDuration: number;
  progress?: number | undefined;
}>;

export type FolderClosingPreviewSwapStartOptions = Readonly<{
  reporter: FolderClosingPreviewSwapReporter;
}>;

export interface FolderClosingPreviewSwapPoint {
  x: number;
  y: number;
  set(x: number, y?: number): void;
}

export interface FolderClosingPreviewSwapDisplayObject {
  readonly children?: readonly FolderClosingPreviewSwapDisplayObject[];
  destroyed: boolean;
  parent?: FolderClosingPreviewSwapContainer | null | undefined;
  scale?: object | null;
  destroy(options?: object): void;
  removeFromParent?(): void;
}

export interface FolderClosingPreviewSwapContainer extends FolderClosingPreviewSwapDisplayObject {
  alpha: number;
  readonly children: FolderClosingPreviewSwapDisplayObject[];
  eventMode: string;
  iconSize?: number | undefined;
  item?: FolderOverlayItem | null | undefined;
  mask?: FolderClosingPreviewSwapGraphics | null | undefined;
  readonly pivot: FolderClosingPreviewSwapPoint;
  readonly position: FolderClosingPreviewSwapPoint;
  readonly scale: FolderClosingPreviewSwapPoint;
  x: number;
  y: number;
  addChild<T extends FolderClosingPreviewSwapDisplayObject>(child: T): T;
  removeChild<T extends FolderClosingPreviewSwapDisplayObject>(child: T): T;
  removeChildren(): FolderClosingPreviewSwapDisplayObject[];
}

export interface FolderClosingPreviewSwapGraphics extends FolderClosingPreviewSwapDisplayObject {
  clear(): FolderClosingPreviewSwapGraphics;
  fill(style: Readonly<{ alpha: number; color: number }>): FolderClosingPreviewSwapGraphics;
  rect(left: number, top: number, width: number, height: number): FolderClosingPreviewSwapGraphics;
}

export interface FolderClosingPreviewSwapSprite extends FolderClosingPreviewSwapDisplayObject {
  readonly anchor: FolderClosingPreviewSwapPoint;
  height: number;
  texture: unknown;
  visible: boolean;
  width: number;
}

export interface FolderClosingPreviewSwapText extends FolderClosingPreviewSwapDisplayObject {
  readonly anchor: FolderClosingPreviewSwapPoint;
  readonly style: { fontSize: number; lineHeight: number };
  text: string;
  visible: boolean;
}

export type FolderClosingPreviewSwapLayer = Readonly<{
  ensureClosingPreviewSwapLayer(
    containerFactory: () => FolderClosingPreviewSwapContainer,
  ): FolderClosingPreviewSwapContainer;
  removeClosingPreviewSwapChildren(): FolderClosingPreviewSwapDisplayObject[];
}>;

export type FolderClosingPreviewSwapControllerOptions = Readonly<{
  containerFactory: () => FolderClosingPreviewSwapContainer;
  getIconTexture(
    item: FolderOverlayItem,
    refresh: () => void,
    owner: FolderClosingPreviewSwapContainer,
  ): unknown | null;
  graphicsFactory: () => FolderClosingPreviewSwapGraphics;
  scheduler?: typeof globalThis | undefined;
  spriteFactory: () => FolderClosingPreviewSwapSprite;
  textFactory: (size: number) => FolderClosingPreviewSwapText;
}>;

type PreviewSwapIconRecord = {
  ghost: FolderClosingPreviewSwapContainer;
};

type ActivePreviewSwap<State extends FolderClosingPreviewSwapState> = {
  iconsByKey: Map<string, PreviewSwapIconRecord>;
  iconsWrap: FolderClosingPreviewSwapContainer;
  key: string;
  mask: FolderClosingPreviewSwapGraphics;
  motionControl?: MotionControl | null;
  onComplete: ((state: State) => void) | null;
  reporter: FolderClosingPreviewSwapReporter;
  root: FolderClosingPreviewSwapContainer;
  state: State;
  targetKey: string;
};

function makeClosingPreviewSwapKey(folderId: string | null | undefined, pageIndex: number) {
  return `closing-preview-swap:${folderId || "folder"}:${pageIndex}`;
}

function makeClosingPreviewSwapIconKey(iconMotion: ClosingPreviewSwapIconMotion): string {
  return `${iconMotion?.item?.id || ""}:${iconMotion?.previewSlotIndex ?? ""}`;
}

function makeClosingPreviewSwapTargetsKey(targets: readonly ClosingPreviewSwapTarget[] = []): string {
  return (targets || []).map((target) => {
    const rect = target?.targetClientRect || target?.targetStageLayoutRect || {};
    return [
      target?.item?.id || "",
      target?.previewSlotIndex ?? "",
      rect.left ?? "",
      rect.top ?? "",
      rect.width ?? "",
      rect.height ?? "",
      target?.targetClientRect ? "client" : "stage",
    ].join(":");
  }).join("|");
}

function drawPreviewSwapMask(mask: FolderClosingPreviewSwapGraphics, rect: StageRect): void {
  if (!mask || !rect) return;
  mask.clear?.();
  mask.rect(rect.left, rect.top, rect.width, rect.height).fill({ color: 0xffffff, alpha: 1 });
}

function previewSwapSpring(
  target: object,
  vars: MotionVars,
  options: Readonly<{ delay?: number | undefined }> = {},
) {
  return motion(target)
    .handoff()
    .spring(motionSprings.handoff)
    .interrupt("retarget")
    .to({
      ...vars,
      delay: options.delay,
    });
}

export class FolderClosingPreviewSwapController<
  State extends FolderClosingPreviewSwapState = FolderClosingPreviewSwapState,
> {
  declare readonly layer: FolderClosingPreviewSwapLayer;
  declare readonly containerFactory: () => FolderClosingPreviewSwapContainer;
  declare readonly graphicsFactory: () => FolderClosingPreviewSwapGraphics;
  declare readonly spriteFactory: () => FolderClosingPreviewSwapSprite;
  declare readonly textFactory: (size: number) => FolderClosingPreviewSwapText;
  declare readonly getIconTexture: FolderClosingPreviewSwapControllerOptions["getIconTexture"];
  declare readonly scheduler: typeof globalThis;
  declare activeSwap: ActivePreviewSwap<State> | null;
  declare motionControls: Set<MotionControl>;

  constructor(
    layer: FolderClosingPreviewSwapLayer,
    options: FolderClosingPreviewSwapControllerOptions,
  );
  constructor(
    layer: FolderClosingPreviewSwapLayer | null | undefined,
    options?: FolderClosingPreviewSwapControllerOptions,
  ) {
    if (
      !layer ||
      typeof layer.ensureClosingPreviewSwapLayer !== "function" ||
      typeof layer.removeClosingPreviewSwapChildren !== "function"
    ) {
      throw new TypeError("FolderClosingPreviewSwapController requires a layer");
    }
    if (!options || typeof options.containerFactory !== "function") {
      throw new TypeError("FolderClosingPreviewSwapController requires containerFactory()");
    }
    if (typeof options.graphicsFactory !== "function") {
      throw new TypeError("FolderClosingPreviewSwapController requires graphicsFactory()");
    }
    if (typeof options.spriteFactory !== "function") {
      throw new TypeError("FolderClosingPreviewSwapController requires spriteFactory()");
    }
    if (typeof options.textFactory !== "function") {
      throw new TypeError("FolderClosingPreviewSwapController requires textFactory()");
    }
    if (typeof options.getIconTexture !== "function") {
      throw new TypeError("FolderClosingPreviewSwapController requires getIconTexture()");
    }
    this.layer = layer;
    this.containerFactory = options.containerFactory;
    this.graphicsFactory = options.graphicsFactory;
    this.spriteFactory = options.spriteFactory;
    this.textFactory = options.textFactory;
    this.getIconTexture = options.getIconTexture;
    this.scheduler = options.scheduler || globalThis;
    this.activeSwap = null;
    this.motionControls = new Set();
  }

  cancelMotionControls(): void {
    const controls = this.motionControls;
    this.motionControls = new Set();
    if (!controls?.size) return;
    for (const control of controls) control.cancel();
  }

  ensureLayer(): FolderClosingPreviewSwapContainer {
    return this.layer.ensureClosingPreviewSwapLayer(this.containerFactory);
  }

  clear(): void {
    this.cancelMotionControls();
    this.activeSwap = null;
    const ghosts = this.layer.removeClosingPreviewSwapChildren();
    for (const ghost of ghosts) {
      killAllMotion(ghost);
      destroyDisplayObjectAfterFrame(ghost, { children: true }, this.scheduler);
    }
  }

  snapshot(): Readonly<{ activeKey: string | null; motionControlCount: number }> {
    return Object.freeze({
      activeKey: this.activeSwap?.key || null,
      motionControlCount: this.motionControls.size,
    });
  }

  createIcon(item: FolderOverlayItem, size: number): FolderClosingPreviewSwapContainer {
    const ghost = this.containerFactory();
    const sprite = this.spriteFactory();
    const emoji = this.textFactory(size);
    ghost.eventMode = "none";
    ghost.item = item;
    ghost.iconSize = size;
    sprite.anchor.set(0.5);
    emoji.anchor.set(0.5);
    ghost.addChild(sprite);
    ghost.addChild(emoji);

    const render = () => {
      const texture = this.getIconTexture(item, () => {
        if (ghost.destroyed) return;
        render();
      }, ghost);
      sprite.visible = Boolean(texture);
      emoji.visible = !texture;
      if (texture) {
        sprite.texture = texture;
        sprite.width = size;
        sprite.height = size;
        return;
      }
      emoji.text = item?.emoji as string || "◼";
      emoji.style.fontSize = size;
      emoji.style.lineHeight = size;
    };
    render();
    return ghost;
  }

  complete(
    state: State,
    key: string,
    root: FolderClosingPreviewSwapContainer,
    iconsWrap: FolderClosingPreviewSwapContainer,
    onComplete: ((state: State) => void) | null,
    reporter: FolderClosingPreviewSwapReporter,
  ): void {
    const layer = this.layer;
    if (!reporter) return;
    const report = reporter.previewComplete(key);
    if (report.status !== "accepted") return;
    if (this.activeSwap?.key === key) this.activeSwap = null;
    this.cancelMotionControls();
    killMotionOf(root);
    killMotionOf(iconsWrap);
    killMotionOf(iconsWrap.scale);
    root.alpha = 1;
    iconsWrap.position.set(iconsWrap.pivot.x, iconsWrap.pivot.y);
    iconsWrap.scale.set(1);
    onComplete?.(state);
  }

  start(
    state: State,
    targets: readonly ClosingPreviewSwapTarget[],
    timing: FolderClosingPreviewSwapTiming,
    onComplete: ((state: State) => void) | null,
    options: FolderClosingPreviewSwapStartOptions,
  ): void;
  start(
    state: State,
    targets: readonly ClosingPreviewSwapTarget[],
    timing: FolderClosingPreviewSwapTiming,
    onComplete: ((state: State) => void) | null,
    options?: FolderClosingPreviewSwapStartOptions,
  ): void {
    this.clear();
    if (!targets?.length || state.folderPageIndex <= 0) return;

    const plan = makeClosingPreviewSwapPlan(targets, {
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    if (!plan) return;

    const layer = this.layer;
    const reporter = options?.reporter;
    if (!reporter || typeof reporter.previewStarted !== "function" || typeof reporter.previewComplete !== "function") {
      const missing = typeof reporter?.previewStarted !== "function" ? "previewStarted" : "previewComplete";
      throw new TypeError(`closing preview swap reporter is missing ${missing}()`);
    }
    const key = makeClosingPreviewSwapKey(state.renderedFolder?.id, state.folderPageIndex);
    const targetKey = makeClosingPreviewSwapTargetsKey(targets);
    const registration = reporter.previewStarted(key);
    if (!registration || registration.status !== "accepted") return;
    const root = this.containerFactory();
    const mask = this.graphicsFactory();
    const iconsWrap = this.containerFactory();
    const iconsByKey = new Map<string, PreviewSwapIconRecord>();

    root.eventMode = "none";
    root.alpha = 0.86;
    drawPreviewSwapMask(mask, plan.maskRect);
    iconsWrap.mask = mask;
    iconsWrap.pivot.set(plan.centerX, plan.centerY);
    iconsWrap.position.set(plan.centerX, plan.centerY);
    iconsWrap.scale.set(plan.wrapStartScale);
    root.addChild(mask);
    root.addChild(iconsWrap);
    this.ensureLayer().addChild(root);

    const iconMotions: Array<ClosingPreviewSwapIconMotion & { ghost: FolderClosingPreviewSwapContainer }> = [];
    const springItems = [
      previewSwapSpring(iconsWrap.scale, { x: 1, y: 1 }),
    ];
    for (const iconMotion of plan.iconMotions) {
      const ghost = this.createIcon(iconMotion.item, iconMotion.size);
      ghost.position.set(iconMotion.fromX, iconMotion.fromY);
      ghost.scale.set(iconMotion.fromScale);
      ghost.alpha = 0.78;
      iconsWrap.addChild(ghost);
      iconMotions.push({ ...iconMotion, ghost });
      iconsByKey.set(makeClosingPreviewSwapIconKey(iconMotion), { ghost });
      springItems.push(
        previewSwapSpring(ghost, { x: iconMotion.toX, y: iconMotion.toY }, { delay: iconMotion.delay }),
        previewSwapSpring(ghost.scale, { x: 1, y: 1 }, { delay: iconMotion.delay })
      );
    }

    motion(root)
      .duration(0.08)
      .ease("power1.out")
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 1 })
      .start();
    for (const iconMotion of iconMotions) {
      motion(iconMotion.ghost)
        .duration(timing.iconDuration)
        .ease(motionPresets.folderPreviewSettle!.ease!)
        .delay(iconMotion.delay)
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 1 })
        .start();
    }

    let motionControl: MotionControl | null = null;
    let didComplete = false;
    this.activeSwap = {
      iconsByKey,
      iconsWrap,
      key,
      mask,
      onComplete,
      reporter,
      root,
      state,
      targetKey,
    };
    motionControl = parallel(springItems, {
      onComplete: () => {
        didComplete = true;
        if (motionControl) this.motionControls.delete(motionControl);
        this.complete(state, key, root, iconsWrap, onComplete, reporter);
      },
    });
    if (!didComplete && motionControl) {
      if (this.activeSwap?.key === key) this.activeSwap.motionControl = motionControl;
      this.motionControls.add(motionControl);
    }
  }

  retarget(
    state: State,
    targets: readonly ClosingPreviewSwapTarget[],
  ): boolean {
    const active = this.activeSwap;
    if (!active || !targets?.length || state.folderPageIndex <= 0) return false;
    const targetKey = makeClosingPreviewSwapTargetsKey(targets);
    if (active.targetKey === targetKey) return false;

    const plan = makeClosingPreviewSwapPlan(targets, {
      stageHeight: state.height,
      stageRect: state.stageRect,
      stageWidth: state.width,
    });
    if (!plan) return false;

    if (active.motionControl) {
      this.motionControls.delete(active.motionControl);
      active.motionControl.release?.();
      active.motionControl = null;
    }

    active.targetKey = targetKey;
    active.state = state;
    drawPreviewSwapMask(active.mask, plan.maskRect);
    active.iconsWrap.pivot.set(plan.centerX, plan.centerY);
    active.iconsWrap.position.set(plan.centerX, plan.centerY);

    const nextKeys = new Set();
    const springItems = [
      previewSwapSpring(active.iconsWrap.scale, { x: 1, y: 1 }),
    ];
    for (const iconMotion of plan.iconMotions) {
      const iconKey = makeClosingPreviewSwapIconKey(iconMotion);
      nextKeys.add(iconKey);
      let record = active.iconsByKey.get(iconKey);
      if (!record) {
        const ghost = this.createIcon(iconMotion.item, iconMotion.size);
        ghost.position.set(iconMotion.fromX, iconMotion.fromY);
        ghost.scale.set(iconMotion.fromScale);
        ghost.alpha = 0.78;
        active.iconsWrap.addChild(ghost);
        record = { ghost };
        active.iconsByKey.set(iconKey, record);
      }
      record.ghost.item = iconMotion.item;
      record.ghost.iconSize = iconMotion.size;
      springItems.push(
        previewSwapSpring(record.ghost, { x: iconMotion.toX, y: iconMotion.toY }, { delay: iconMotion.delay }),
        previewSwapSpring(record.ghost.scale, { x: 1, y: 1 }, { delay: iconMotion.delay })
      );
    }

    for (const [iconKey, record] of active.iconsByKey) {
      if (nextKeys.has(iconKey)) continue;
      active.iconsByKey.delete(iconKey);
      killAllMotion(record.ghost);
      destroyDisplayObjectAfterFrame(record.ghost, { children: true }, this.scheduler);
    }

    let motionControl: MotionControl | null = null;
    let didComplete = false;
    motionControl = parallel(springItems, {
      onComplete: () => {
        didComplete = true;
        if (motionControl) this.motionControls.delete(motionControl);
        if (this.activeSwap === active) active.motionControl = null;
        this.complete(state, active.key, active.root, active.iconsWrap, active.onComplete, active.reporter);
      },
    });
    if (!didComplete && motionControl && this.activeSwap === active) {
      active.motionControl = motionControl;
      this.motionControls.add(motionControl);
    }
    return true;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
