import { motionRuntime } from "../animation/motionRuntime.js";
import {
  clearMotionPreferencesForTests,
  setReducedMotionForTests,
} from "../animation/motionPreferences.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import type {
  FolderOpeningControllerVisualPlan,
  FolderOpeningControllerPlanOptions,
  FolderOpeningGhost,
  FolderOpeningGhostControllerLayer,
  FolderOpeningGhostLayer,
  FolderOpeningPoint,
  FolderOpeningScheduler,
  FolderOpeningState,
  FolderOpeningTarget,
} from "./folderOpeningGhostController.js";
import { FolderVisualSession } from "./folderVisualSession.js";
import type { FolderOpeningPhaseReporter } from "./folderVisualSession.js";
import type { FolderFrameGhostOptions, FolderFramePresentation } from "./folderFrameGhost.js";
import type { StageRect } from "../geometry/stageCoordinates.js";
import type { SceneItem } from "../../sceneFrame.js";
import {
  VisualOwnershipRegistry as FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
} from "./visualOwnershipRegistry.js";

type TimerCallback = () => void;

type AssertTrue<Value extends true> = Value;
type OpeningControllerConstructorOptionsAreRequired = AssertTrue<
  undefined extends ConstructorParameters<typeof FolderOpeningGhostController>[1] ? false : true
>;
type OpeningControllerPreparePlanIsRequired = AssertTrue<
  undefined extends Parameters<FolderOpeningGhostController["prepare"]>[0] ? false : true
>;
type OpeningControllerStartPlanIsRequired = AssertTrue<
  undefined extends Parameters<FolderOpeningGhostController["start"]>[0] ? false : true
>;

type OpeningVisualSession = FolderVisualSession<FolderOpeningControllerVisualPlan>;

interface TestTimerHost extends FolderOpeningScheduler {
  readonly recordedIds: readonly number[];
  readonly size: number;
  runAll(): void;
  runRecorded(id: number): void;
}

function makeTimerHost(): TestTimerHost {
  let nextId = 1;
  const recorded = new Map<number, TimerCallback>();
  const timers = new Map<number, TimerCallback>();
  return {
    clearTimeout(id: unknown) {
      if (typeof id === "number") timers.delete(id);
    },
    runAll() {
      const pending = Array.from(timers.entries());
      for (const [id, callback] of pending) {
        if (!timers.delete(id)) continue;
        callback();
      }
    },
    runRecorded(id: number) {
      recorded.get(id)?.();
    },
    setTimeout(callback: TimerCallback) {
      const id = nextId++;
      timers.set(id, callback);
      recorded.set(id, callback);
      return id;
    },
    get recordedIds() {
      return Array.from(recorded.keys());
    },
    get size() {
      return timers.size;
    },
  };
}

function makePoint(x = 0, y = x): FolderOpeningPoint {
  return {
    x,
    y,
    set(nextX: number, nextY = nextX) {
      this.x = nextX;
      this.y = nextY;
    },
  };
}

function makeGhost(): FolderOpeningGhost {
  const ghost: FolderOpeningGhost = {
    alpha: 0,
    children: [],
    destroyed: false,
    eventMode: "static",
    item: null,
    labelText: { alpha: 1, scale: makePoint(1), visible: true },
    position: makePoint(),
    scale: makePoint(1),
    destroy() {
      this.destroyed = true;
    },
    parent: null,
    removeFromParent() {
      ghost.parent?.removeChild(ghost);
    },
    setState(state) {
      ghost.item = state.item ?? null;
      ghost.state = state;
    },
  };
  return ghost;
}

function makeChildLayer(): FolderOpeningGhostLayer {
  const children: FolderOpeningGhost[] = [];
  const layer: FolderOpeningGhostLayer = {
    children,
    addChild(child: FolderOpeningGhost) {
      child.parent?.removeChild(child);
      child.parent = layer;
      children.push(child);
      return child;
    },
    removeChild(child: FolderOpeningGhost) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      if (child.parent === layer) child.parent = null;
      return child;
    },
    removeChildren() {
      const removed = children.splice(0);
      for (const child of removed) {
        if (child.parent === layer) child.parent = null;
      }
      return removed;
    },
  };
  return layer;
}

type OpeningOwner = Parameters<FolderOpeningGhostControllerLayer["acquireDesktopSourceOwnership"]>[0];
type TestIconNode = {
  alpha: number;
  item: SceneItem;
  state: Readonly<{ source: Readonly<{ folderId: string }> }>;
  visible: boolean;
};
type FrameGhostCall = Readonly<{
  fromRect: StageRect;
  options: FolderFrameGhostOptions;
  toRect: StageRect;
}>;
type FrameRetargetCall = Readonly<{
  options: FolderFrameGhostOptions;
  toRect: StageRect;
}>;
type TestLayer = FolderOpeningGhostControllerLayer & {
  readonly calls: string[];
  currentFolderId: string;
  readonly frameGhostCalls: FrameGhostCall[];
  readonly frameRetargetCalls: FrameRetargetCall[];
  readonly iconNodes: Map<string, TestIconNode>;
  lastOpeningBoundsTarget: FolderOpeningTarget | null;
  openingGeometryActive: boolean;
  readonly pageTrack: { visible: boolean };
  readonly visualOwnership: FolderVisualOwnershipRegistry;
  openingSourceRectMapper(
    state: Pick<FolderOpeningState, "height" | "stageRect" | "width">,
    sourceRect: StageRect,
  ): StageRect;
  acquireVisualOwnership(key: string, owner: OpeningOwner): unknown;
  getIconNodeVisualKey(node: TestIconNode, fallbackFolderId?: string | null): string | null;
  mapOpeningSourceRectToLocal(
    state: Pick<FolderOpeningState, "height" | "stageRect" | "width">,
    sourceRect: StageRect,
  ): StageRect;
};

type OpeningHarness = Readonly<{
  calls: string[];
  controller: FolderOpeningGhostController;
  layer: TestLayer;
  session: OpeningVisualSession;
  timerHost: TestTimerHost;
  visualOwnership: FolderVisualOwnershipRegistry;
}>;

function requireArrayItem<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`[Folder opening ghost controller test fixture failed] Missing ${label}`);
  return item;
}

function requireMapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`[Folder opening ghost controller test fixture failed] Missing ${label}`);
  return value;
}

function makeFramePresentation(rect: StageRect): FolderFramePresentation {
  return {
    ...rect,
    fillAlpha: 1,
    fillColor: 0xffffff,
    progress: 1,
    radius: 1,
    strokeAlpha: 1,
    strokeColor: 0xffffff,
    strokeWidth: 1,
  };
}

function makeHarness(): OpeningHarness {
  const calls: string[] = [];
  const frameGhostCalls: FrameGhostCall[] = [];
  const frameRetargetCalls: FrameRetargetCall[] = [];
  const openingGhostLayer = makeChildLayer();
  const timerHost = makeTimerHost();
  const visualOwnership = new FolderVisualOwnershipRegistry();
  const iconNodes = new Map<string, TestIconNode>([
    ["app-1", { alpha: 1, item: { id: "app-1" }, state: { source: { folderId: "folder-1" } }, visible: true }],
    ["app-2", { alpha: 1, item: { id: "app-2" }, state: { source: { folderId: "folder-1" } }, visible: true }],
  ]);
  const layer: TestLayer = {
    calls,
    currentFolderId: "folder-1",
    frameGhost: { alpha: 0, visible: false },
    frameGhostCalls,
    frameRetargetCalls,
    iconNodes,
    lastOpeningBoundsTarget: null,
    openingGeometryActive: false,
    openingGhostBoundsRefreshers: new Map<string, () => unknown>(),
    openingGhostLayer,
    openingSourceRectMapper(state, sourceRect) {
      return {
        height: sourceRect.height,
        left: sourceRect.left - state.stageRect.left,
        top: sourceRect.top - state.stageRect.top,
        width: sourceRect.width,
      };
    },
    pageTrack: { visible: true },
    panelMaterial: { alpha: 0, visible: false },
    visualOwnership,
    acquireDesktopSourceOwnership(owner: OpeningOwner) {
      const key = makeDesktopSourceVisualKey(owner.folderId);
      if (!key) throw new Error("desktop source visual key should exist");
      return layer.acquireVisualOwnership(key, owner);
    },
    acquireVisualOwnership(key: string, owner: OpeningOwner) {
      return visualOwnership.acquire(key, owner);
    },
    clearFrameGhost() {
      calls.push("clear-frame");
      layer.frameGhost.visible = false;
      layer.frameGhost.alpha = 0;
    },
    getCurrentFolderId() {
      return layer.currentFolderId;
    },
    getIconNodeVisualKey(node: TestIconNode, fallbackFolderId: string | null = null) {
      return makeFolderIconVisualKey(node.state?.source?.folderId || fallbackFolderId, node.item?.id);
    },
    hideIconNodesForTransition(itemId: string, owner: OpeningOwner) {
      const node = iconNodes.get(itemId);
      if (!node) return;
      const key = layer.getIconNodeVisualKey(node, owner.folderId);
      if (!key) throw new Error("folder icon visual key should exist");
      layer.acquireVisualOwnership(key, owner);
      node.visible = false;
    },
    isOpeningGeometryTransitionActive() {
      return layer.openingGeometryActive;
    },
    mapOpeningSourceRectToLocal(state, sourceRect) {
      return layer.openingSourceRectMapper(state, sourceRect);
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
    },
    refreshRegisteredIconBounds() {
      calls.push("refresh-bounds");
    },
    registerOpeningGhostBounds(_state: FolderOpeningState, target: FolderOpeningTarget) {
      layer.lastOpeningBoundsTarget = target;
    },
    releaseTransitionOwnership(token: string | undefined, options = {}) {
      visualOwnership.releaseByToken(token);
      if (options.restorePageTrack !== false) layer.pageTrack.visible = true;
      if (options.reveal !== false) {
        for (const node of iconNodes.values()) {
          node.visible = true;
          node.alpha = 1;
        }
      }
    },
    removeOpeningGhost(ghost: FolderOpeningGhost) {
      return openingGhostLayer.removeChild(ghost);
    },
    retargetFrameGhost(toRect: StageRect, options: FolderFrameGhostOptions) {
      frameRetargetCalls.push({ options, toRect });
      return true;
    },
    startFrameGhost(fromRect: StageRect, toRect: StageRect, options: FolderFrameGhostOptions) {
      frameGhostCalls.push({ fromRect, options, toRect });
      layer.frameGhost.visible = true;
      layer.frameGhost.alpha = 1;
      layer.panelMaterial.visible = options.exclusivePanelMaterialHandoff !== true;
      layer.panelMaterial.alpha = layer.panelMaterial.visible ? 1 : 0;
      return true;
    },
  };
  const controller = new FolderOpeningGhostController(layer, {
    ghostFactory: makeGhost,
    scheduler: timerHost,
  });
  const session = new FolderVisualSession<FolderOpeningControllerVisualPlan>({
    openingAdapter: controller,
    ownershipRevision: () => visualOwnership.getRevision(),
  });
  return { calls, controller, layer, session, timerHost, visualOwnership };
}

type TestOpeningState = FolderOpeningState & Readonly<{
  renderedFolder: SceneItem;
}>;

function makeState(
  completed: string[] = [],
  overrides: Partial<FolderOpeningState> = {},
): TestOpeningState {
  const state: FolderOpeningState = {
    completeFolderOpenIconGhost: (key: string) => completed.push(key),
    folderOpenIconGhosts: [],
    folderPageIndex: 0,
    folderPageSize: 9,
    getFolderOpenIconGhostKey: (_itemId: string, index: number) => `controller-open-${index}`,
    height: 800,
    isTextlessMode: false,
    launchTargetStatusById: {},
    renderedFolder: { id: "folder-1", name: "Folder", type: "folder" },
    showMissingLaunchTargetBadge: false,
    stageRect: { left: 0, top: 0 },
    width: 1200,
    ...overrides,
  };
  if (!state.renderedFolder) throw new Error("opening state fixture requires a rendered folder");
  return { ...state, renderedFolder: state.renderedFolder };
}

type TestOpeningTargetInput = FolderOpeningTarget & Readonly<{
  sourceRect: StageRect;
  targetStageLayoutRect: StageRect | null;
}>;

function makeTarget(
  id = "app-1",
  index = 0,
  overrides: Partial<TestOpeningTargetInput> = {},
): TestOpeningTargetInput {
  return {
    cellHeight: 80,
    cellWidth: 80,
    columnCount: 3,
    controllerGhostKey: `controller-${id}`,
    iconSize: 64,
    index,
    item: { id, type: "app" },
    pageIndex: 0,
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: { height: 64, left: 100 + index * 80, top: 120, width: 64 },
    ...overrides,
  };
}

function requireOpeningTarget(target: TestOpeningTargetInput): FolderOpeningTarget {
  if (!target.targetClientRect && !target.targetStageLayoutRect) {
    throw new Error("[Folder opening ghost controller test fixture failed] Expected a usable target");
  }
  if (target.targetClientRect) {
    return { ...target, targetClientRect: target.targetClientRect, targetStageLayoutRect: null };
  }
  const targetStageLayoutRect = target.targetStageLayoutRect;
  if (!targetStageLayoutRect) throw new Error("opening target fixture requires target geometry");
  return { ...target, targetClientRect: null, targetStageLayoutRect };
}

type PresentOpenOptions = Readonly<{
  adapterOptions?: FolderOpeningControllerPlanOptions | undefined;
  forceNew?: boolean | undefined;
  targetKey?: string | undefined;
}>;

function presentOpen(
  harness: OpeningHarness,
  targets: readonly TestOpeningTargetInput[] = [makeTarget()],
  state: TestOpeningState = makeState(),
  options: PresentOpenOptions = {},
) {
  const lease = harness.session.open({
    folderId: state.renderedFolder.id,
    ...(options.forceNew === undefined ? {} : { forceNew: options.forceNew }),
    targetKey: options.targetKey || "target-a",
  });
  const report = lease.present({
    options: options.adapterOptions ?? {},
    state,
    targets,
  });
  return { lease, report };
}

function advanceMotion(seconds = 3) {
  for (let remaining = seconds; remaining > 0; remaining -= 0.05) {
    motionRuntime.step(Math.min(0.05, remaining));
  }
}

export function runFolderOpeningGhostControllerTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Folder opening ghost controller test failed] ${message}`);
  };

  {
    const harness = makeHarness();
    const sourceRect = {
      height: 17.874,
      left: 738.29568,
      top: 116.31168,
      width: 17.874,
    };
    const localSourceRect = {
      height: 16.55,
      left: 740.496,
      top: 139.696,
      width: 16.55,
    };
    harness.layer.openingSourceRectMapper = () => localSourceRect;
    const { lease } = presentOpen(harness, [makeTarget("app-1", 0, {
      iconSize: 128,
      isThumbnailChild: true,
      sourceRect,
      targetStageLayoutRect: { height: 128, left: 100, top: 200, width: 128 },
    })]);
    const ghost = requireArrayItem(harness.layer.openingGhostLayer.children, 0, "transform-corrected opening ghost");
    const expectedScale = localSourceRect.width / 128;
    assert(
      Math.abs(ghost.scale.x - expectedScale) < 0.0001,
      "opening thumbnails should derive their initial scale in the transformed ghost-layer coordinate space",
    );
    assert(
      Math.abs(ghost.position.x - (localSourceRect.left + localSourceRect.width / 2)) < 0.0001,
      "opening thumbnails should derive their initial x position in the ghost-layer coordinate space",
    );
    lease.cancel();
    motionRuntime.reset();
  }

  {
    const harness = makeHarness();
    let thrown: unknown = null;
    try {
      Reflect.construct(FolderOpeningGhostController, [harness.layer]);
    } catch (error) {
      thrown = error;
    }
    assert(/requires a ghost factory/.test(String(thrown)), "opening controller should reject missing constructor capabilities explicitly");
  }

  {
    const harness = makeHarness();
    let thrown: unknown = null;
    try {
      Reflect.apply(harness.controller.prepare, harness.controller, []);
    } catch (error) {
      thrown = error;
    }
    assert(/plan must be an object/.test(String(thrown)), "opening adapter should reject a missing presentation plan explicitly");
  }

  {
    const harness = makeHarness();
    let thrown: unknown = null;
    try {
      harness.controller.start({ state: makeState(), targets: [] }, {
        ghostsReady() {},
        owner: () => ({ folderId: "folder-1", kind: "opening", token: "owner-a" }),
      } as FolderOpeningPhaseReporter);
    } catch (error) {
      thrown = error;
    }
    assert(/fail/.test(String(thrown)), "opening adapter setup should reject reporters missing required capabilities");
  }

  {
    const expected = new Error("opening ghost construction failed");
    const harness = makeHarness();
    harness.controller.ghostFactory = () => {
      throw expected;
    };
    let thrown: unknown = null;
    try {
      presentOpen(harness, [makeTarget()]);
    } catch (error) {
      thrown = error;
    }
    assert(thrown === expected, "opening adapter start failures should propagate unchanged");
    assert(!harness.controller.snapshot().active, "failed opening startup should release the controller reporter");
    assert(harness.layer.openingGhostLayer.children.length === 0, "failed opening startup should not leave orphan ghosts");
    assert(!harness.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")), "failed opening startup should release source ownership before Session receives a scope");
  }

  {
    const harness = makeHarness();
    const prepared = Reflect.apply(harness.controller.prepare, harness.controller, [{
      targets: [makeTarget(), makeTarget("app-2", 1, { targetStageLayoutRect: null })],
    }]) as ReturnType<typeof harness.controller.prepare>;
    assert(prepared.ghostIds.join(",") === "app-1", "prepare should publish only usable opening participants");
  }

  {
    const harness = makeHarness();
    const state = makeState([], {
      acceptFolderOpenIconGhostSession: () => false,
      folderOpenIconGhosts: [{ key: "staged", requestId: 21 }],
    });
    const { lease, report } = presentOpen(harness, [makeTarget()], state);

    assert(report.status === "stale" && !lease.isCurrent(), "a synchronously rejected staged session should retire its lease");
    assert(lease.snapshot().error instanceof Error, "staged-session rejection should be an observable failure");
    assert(harness.layer.openingGhostLayer.children.length === 0, "rejected sessions should not mount orphan visuals");
    assert(!harness.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")), "rejected sessions should not retain desktop source ownership");
  }

  {
    const completed: string[] = [];
    const frameCompletions: string[] = [];
    const harness = makeHarness();
    const state = makeState(completed, {
      completeFolderOpenFrameGhost: (folderId: string | null, requestId: unknown) => frameCompletions.push(`${folderId}:${String(requestId)}`),
      folderOpenIconGhosts: [{ key: "controller-app-1", requestId: 7 }],
    });
    const { lease } = presentOpen(harness, [makeTarget()], state, {
      adapterOptions: {
        frameSourceRect: { height: 48, left: 10, top: 20, width: 48 },
        frameTargetRect: { height: 360, left: 180, top: 200, width: 800 },
      },
    });

    assert(harness.layer.openingGhostLayer.children.length === 1, "present should install one opening ghost");
    assert(!requireMapValue(harness.layer.iconNodes, "app-1", "hidden app icon").visible, "present should hide the real icon while its substitute owns the visual");
    assert(harness.visualOwnership.getOwner(makeDesktopSourceVisualKey("folder-1"))?.kind === "opening", "opening should own the desktop source through its lease-bound owner");
    assert(harness.layer.frameGhostCalls.length === 1, "opening should install one frame shell morph");
    const frameCall = requireArrayItem(harness.layer.frameGhostCalls, 0, "opening frame call");
    assert(frameCall.options.frameGhostPhase === "opening", "the frame shell should carry its opening phase");
    assert(frameCall.options.exclusivePanelMaterialHandoff, "frame and panel material should have one exclusive shell owner");
    const onFrameArrive = frameCall.options.onArrive;
    assert(onFrameArrive !== undefined, "opening frame call should publish an arrival callback");
    onFrameArrive(makeFramePresentation(frameCall.toRect));
    assert(frameCompletions.join(",") === "folder-1:7", "frame arrival should complete the current request identity");

    advanceMotion();
    assert(lease.snapshot().ghostsReady, "ghost arrival should report readiness through the opening reporter");
    assert(lease.snapshot().revealPending, "ghost readiness should remain gated until panel geometry is ready");
    assert(harness.layer.openingGhostLayer.children.length === 1, "the settled substitute should remain mounted while panel readiness is pending");
    lease.panelReady();
    assert(lease.snapshot().revealed, "panel readiness should complete the two-party reveal gate");
    assert(completed.join(",") === "controller-app-1", "reveal should complete the controller key once");
  assert((harness.layer.openingGhostLayer.children.length as number) === 0 && requireMapValue(harness.layer.iconNodes, "app-1", "revealed app icon").visible, "reveal should atomically replace substitutes with real icons");
    assert(!harness.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")), "reveal should release desktop source ownership");
    motionRuntime.reset();
  }

  {
    const completed: string[] = [];
    const harness = makeHarness();
    const { lease } = presentOpen(harness, [makeTarget()], makeState(completed));
    lease.panelReady();
    harness.controller.complete(
      makeState(completed),
      requireOpeningTarget(makeTarget()),
      requireArrayItem(harness.layer.openingGhostLayer.children, 0, "manual opening ghost"),
    );

    assert(lease.snapshot().revealed, "ghost readiness arriving after panel readiness should reveal through the same gate");
    assert(completed.join(",") === "controller-app-1", "manual ghost arrival should complete its controller key only at reveal");
    assert(harness.timerHost.size === 0, "reveal should disarm the geometry watchdog");
    motionRuntime.reset();
  }

  {
    const completed: string[] = [];
    const harness = makeHarness();
    const { lease } = presentOpen(harness, [makeTarget()], makeState(completed));
    lease.panelReady();
    harness.timerHost.runAll();

    assert(lease.snapshot().revealed, "the opening watchdog should settle geometry and enter the normal reveal gate");
    assert(completed.join(",") === "controller-app-1", "watchdog settlement should still complete controller ownership once");
    assert(harness.layer.openingGhostLayer.children.length === 0, "watchdog settlement should not leave substitute visuals behind");
    motionRuntime.reset();
  }

  {
    const completed: string[] = [];
    const harness = makeHarness();
    const target = makeTarget();
    const { lease } = presentOpen(harness, [target], makeState(completed), {
      adapterOptions: {
        frameSourceRect: { height: 48, left: 10, top: 20, width: 48 },
        frameTargetRect: { height: 360, left: 180, top: 200, width: 800 },
      },
    });
    const ghost = requireArrayItem(harness.layer.openingGhostLayer.children, 0, "retargeted opening ghost");
    const firstControl = harness.controller.motionControlsByItemId.get("app-1");
    const nextTarget = makeTarget("app-1", 0, {
      iconSize: 32,
      pageIndex: 1,
      targetStageLayoutRect: { height: 64, left: 500, top: 520, width: 64 },
    });
    lease.present({
      options: { frameTargetRect: { height: 480, left: 180, top: 140, width: 800 } },
      state: makeState(completed),
      targets: [nextTarget],
    });

    const secondControl = harness.controller.motionControlsByItemId.get("app-1");
    assert(harness.layer.openingGhostLayer.children[0] === ghost, "retarget should preserve the opening ghost object");
    assert(firstControl !== secondControl, "retarget should replace motion ownership instead of accumulating controls");
    assert(ghost.state?.iconSize === 32 && ghost.openingPageIndex === 1, "retarget should refresh icon metrics and page identity");
    assert(requireArrayItem(harness.layer.frameRetargetCalls, 0, "opening frame retarget").toRect.height === 480, "retarget should update the active opening frame shell");
  assert(harness.controller.snapshot().motionControlCount === 1, "the controller should expose bounded local motion ownership to its own tests");
    harness.layer.openingGhostBoundsRefreshers.get("app-1")?.();
    assert(harness.layer.lastOpeningBoundsTarget === nextTarget, "bounds refresh should follow the current retarget plan");
    const timerIds = harness.timerHost.recordedIds;
    assert(timerIds.length >= 2, "retarget should replace the watchdog generation");
    harness.timerHost.runRecorded(requireArrayItem(timerIds, 0, "stale watchdog id"));
    assert(lease.isCurrent() && lease.snapshot().ghostIds.includes("app-1"), "a stale watchdog callback must not settle a retargeted lease");
    lease.cancel({ completeControllerKeys: false, restorePageTrack: false, reveal: false });
    motionRuntime.reset();
  }

  {
    const completed: string[] = [];
    const harness = makeHarness();
    harness.layer.openingGeometryActive = true;
    const state = makeState(completed);
    const target = makeTarget();
    const { lease } = presentOpen(harness, [target], state);
    lease.panelReady();
    harness.controller.complete(
      state,
      requireOpeningTarget(target),
      requireArrayItem(harness.layer.openingGhostLayer.children, 0, "geometry-gated opening ghost"),
    );

    assert(!lease.snapshot().ghostsReady, "active resize geometry should keep an arrived ghost behind the geometry gate");
    assert(harness.layer.openingGhostLayer.children.length === 1, "geometry-gated arrival should retain its substitute for future retargeting");
    harness.layer.openingGeometryActive = false;
    lease.present({ state, targets: [target] });
    assert(lease.snapshot().revealed, "ending the geometry transition should release already-settled ghosts through the normal gate");
    assert(completed.join(",") === "controller-app-1", "geometry gate release should complete controller ownership once");
    motionRuntime.reset();
  }

  {
    const completed: string[] = [];
    const harness = makeHarness();
    const provisional = makeTarget("app-1", 0, { provisionalLayoutTarget: true });
    const { lease } = presentOpen(harness, [provisional], makeState(completed));
    lease.panelReady();
    advanceMotion();

    assert(!lease.snapshot().ghostsReady && harness.layer.openingGhostLayer.children.length === 1, "a provisional target must retain visual ownership after arrival");
    lease.present({
      state: makeState(completed),
      targets: [{ ...provisional, provisionalLayoutTarget: false }],
    });
    advanceMotion();
    assert(lease.snapshot().revealed, "a final target should settle the retained provisional ghost");
    assert(completed.join(",") === "controller-app-1", "final target settlement should complete the staged key");
    motionRuntime.reset();
  }

  {
    const harness = makeHarness();
    const { lease } = presentOpen(harness);
    lease.cancel({ completeControllerKeys: false, restorePageTrack: false, reveal: false });

    assert(!requireMapValue(harness.layer.iconNodes, "app-1", "cancelled app icon").visible, "non-reveal cancellation should not expose stale real icons");
    assert(harness.layer.openingGhostLayer.children.length === 0, "cancellation should remove opening substitutes");
    assert(!lease.isCurrent() && harness.session.snapshot().opening === null, "cancellation should retire opening identity at the Session boundary");
    motionRuntime.reset();
  }

  {
    const completed: string[] = [];
    const harness = makeHarness();
    setReducedMotionForTests(true);
    try {
      const { lease } = presentOpen(harness, [
        makeTarget("app-1", 0),
        makeTarget("app-2", 1),
      ], makeState(completed));
      lease.panelReady();
      assert(lease.snapshot().revealed, "synchronous reduced-motion ghosts should still pass through the reveal gate");
      assert(completed.join(",") === "controller-app-1,controller-app-2", "synchronous completion should flush every staged controller key once");
  assert(harness.controller.snapshot().motionControlCount === 0, "synchronous completion should not register stale controller motion controls");
    } finally {
      clearMotionPreferencesForTests();
      motionRuntime.reset();
    }
  }
}
