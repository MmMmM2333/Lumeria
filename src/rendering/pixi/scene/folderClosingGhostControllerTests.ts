import { motionRuntime } from "../animation/motionRuntime.js";
import {
  clearMotionPreferencesForTests,
  setReducedMotionForTests,
} from "../animation/motionPreferences.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import type {
  FolderClosingControllerPlanOptions,
  FolderClosingControllerVisualPlan,
  FolderClosingGhost,
  FolderClosingGhostControllerLayer,
  FolderClosingGhostLayer,
  FolderClosingGhostControllerOptions,
  FolderClosingPreviewSwapAdapter,
  FolderClosingScheduler,
  FolderClosingState,
  FolderClosingTarget,
} from "./folderClosingGhostController.js";
import { FolderVisualSession } from "./folderVisualSession.js";
import type {
  FolderClosingPhaseReporter,
  FolderOpeningPhaseReporter,
  FolderOpeningVisualAdapter,
  FolderOpeningVisualPlan,
} from "./folderVisualSession.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import type { FolderFrameGhostOptions, FolderFramePresentation } from "./folderFrameGhost.js";
import type { FolderGhostIconNodeState } from "./folderGhostIconState.js";
import type { ClosingPreviewSwapTarget } from "./folderOverlayTargets.js";
import {
  VisualOwnershipRegistry as FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
} from "./visualOwnershipRegistry.js";

type TimerCallback = () => void;

type AssertTrue<Value extends true> = Value;
type ClosingControllerConstructorOptionsAreRequired = AssertTrue<
  undefined extends ConstructorParameters<typeof FolderClosingGhostController>[1] ? false : true
>;
type ClosingControllerPreparePlanIsRequired = AssertTrue<
  undefined extends Parameters<FolderClosingGhostController["prepare"]>[0] ? false : true
>;
type ClosingControllerStartPlanIsRequired = AssertTrue<
  undefined extends Parameters<FolderClosingGhostController["start"]>[0] ? false : true
>;
type ClosingControllerFolderRectIsRequired = AssertTrue<
  null extends FolderClosingControllerVisualPlan["folderRect"] ? false : true
>;

type ClosingVisualSession = FolderVisualSession<
  FolderOpeningVisualPlan,
  FolderClosingControllerVisualPlan
>;

type TestTimerHost = FolderClosingScheduler & Readonly<{
  frameCount: number;
  timerCount: number;
  runAllFrames(): void;
  runAllTimers(): void;
}>;

type TestPoint = Readonly<{
  set(nextX: number, nextY?: number): void;
}> & { x: number; y: number };

type TestGhost = FolderClosingGhost & {
  children: TestGhost[];
  id: string;
  parent?: FolderClosingGhostLayer | null | undefined;
  state?: FolderGhostIconNodeState | undefined;
};

type TestCall = string | Readonly<{
  targets?: readonly ClosingPreviewSwapTarget[] | undefined;
  toRect?: StageRect | undefined;
  type: string;
}>;

type TestActivityChange = Readonly<{
  active: boolean;
  folderId: string | null;
}>;

function makeTimerHost(): TestTimerHost {
  let nextId = 1;
  const frames = new Map<number, TimerCallback>();
  const timers = new Map<number, TimerCallback>();
  return {
    cancelAnimationFrame(id: unknown) {
      if (typeof id === "number") frames.delete(id);
    },
    clearTimeout(id: unknown) {
      if (typeof id === "number") timers.delete(id);
    },
    requestAnimationFrame(callback: TimerCallback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    runAllFrames() {
      const pending = Array.from(frames.entries());
      for (const [id, callback] of pending) {
        if (!frames.delete(id)) continue;
        callback();
      }
    },
    runAllTimers() {
      const pending = Array.from(timers.entries());
      for (const [id, callback] of pending) {
        if (!timers.delete(id)) continue;
        callback();
      }
    },
    setTimeout(callback: TimerCallback) {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
    get frameCount() {
      return frames.size;
    },
    get timerCount() {
      return timers.size;
    },
  };
}

function makePoint(x = 0, y = x): TestPoint {
  return {
    x,
    y,
    set(nextX: number, nextY = nextX) {
      this.x = nextX;
      this.y = nextY;
    },
  };
}

function makeGhost(id = "ghost"): TestGhost {
  const ghost: TestGhost = {
    alpha: 1,
    children: [],
    closingComplete: false,
    destroyed: false,
    eventMode: "static",
    id,
    item: null,
    labelText: { alpha: 1, scale: makePoint(1), visible: true },
    position: makePoint(),
    scale: makePoint(1),
    destroy() {
      this.destroyed = true;
    },
    getIconBounds(_stageRect: StageOrigin) {
      const width = 32 * (Number(this.scale.x) || 1);
      const height = 32 * (Number(this.scale.y) || 1);
      return {
        height,
        left: this.position.x - width / 2,
        top: this.position.y - height / 2,
        width,
      };
    },
    removeFromParent() {
      this.parent?.removeChild?.(this);
    },
    setState(
      state: FolderGhostIconNodeState,
      options: Readonly<{ preserveRootPresentation?: boolean | undefined }> = {},
    ) {
      this.item = state.item ?? null;
      this.state = state;
      if (!options.preserveRootPresentation) this.alpha = state.opening ? 0 : 1;
    },
  };
  return ghost;
}

function makeChildLayer(): FolderClosingGhostLayer {
  const children: FolderClosingGhost[] = [];
  const layer: FolderClosingGhostLayer = {
    children,
    addChild(child: FolderClosingGhost) {
      child.parent?.removeChild?.(child);
      child.parent = this;
      children.push(child);
      return child;
    },
    removeChild(child: FolderClosingGhost) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      if (child.parent === this) child.parent = null;
      return child;
    },
    removeChildren() {
      const removed = children.splice(0);
      for (const child of removed) {
        if (child.parent === this) child.parent = null;
      }
      return removed;
    },
  };
  return layer;
}

function makePreviewSwap(calls: TestCall[]): FolderClosingPreviewSwapAdapter {
  return {
    clear() {
      calls.push("clear-preview");
    },
    retarget(_state: FolderClosingState, targets: readonly ClosingPreviewSwapTarget[]) {
      calls.push({ targets, type: "retarget-preview" });
      return true;
    },
    snapshot() {
      return { activeKey: null };
    },
    start() {
      calls.push("start-preview");
    },
  };
}

type TestIconNode = {
  alpha: number;
  item: Readonly<{ id: string }>;
  visible: boolean;
};

type TestLayer = FolderClosingGhostControllerLayer & {
  calls: TestCall[];
  currentFolderId: string | null;
  frameGhostOptions: FolderFrameGhostOptions | null;
  frameGhostState: Partial<FolderFramePresentation> | null;
  frameGhostTarget: StageRect | null;
  iconNodes: Map<string, TestIconNode>;
  openingGhostLayer: FolderClosingGhostLayer;
  visualOwnership: FolderVisualOwnershipRegistry;
  acquireVisualOwnership(
    key: string | null,
    owner: Parameters<FolderClosingGhostControllerLayer["acquireDesktopSourceOwnership"]>[0],
  ): boolean;
  rebuildPageTrackMask(): void;
};

type TestHarness = Readonly<{
  activityChanges: TestActivityChange[];
  calls: TestCall[];
  controller: FolderClosingGhostController;
  layer: TestLayer;
  session: ClosingVisualSession;
  timerHost: TestTimerHost;
  visualOwnership: FolderVisualOwnershipRegistry;
}>;

type TestHarnessOptions = Readonly<{
  ghostFactory?: FolderClosingGhostControllerOptions["ghostFactory"] | undefined;
  openingAdapter?: FolderOpeningVisualAdapter | undefined;
}>;

function makeHarness(options: TestHarnessOptions = {}): TestHarness {
  const activityChanges: TestActivityChange[] = [];
  const calls: TestCall[] = [];
  const closingGhostLayer = makeChildLayer();
  const timerHost = makeTimerHost();
  const visualOwnership = new FolderVisualOwnershipRegistry();
  const iconNodes = new Map<string, TestIconNode>([
    ["app-1", { alpha: 0.4, item: { id: "app-1" }, visible: true }],
    ["app-2", { alpha: 0.4, item: { id: "app-2" }, visible: true }],
  ]);
  const layer: TestLayer = {
    calls,
    closingGhostLayer,
    currentFolderId: "folder-1",
    frameGhostOptions: null,
    frameGhostState: null,
    frameGhostTarget: null,
    iconNodes,
    openingGhostLayer: makeChildLayer(),
    pageTrack: { visible: true },
    panel: { visible: true },
    visible: true,
    visualOwnership,
    acquireDesktopSourceOwnership(owner) {
      return this.acquireVisualOwnership(makeDesktopSourceVisualKey(owner.folderId), owner);
    },
    acquireVisualOwnership(key, owner) {
      return visualOwnership.acquire(key, owner);
    },
    clearCurrentFolder() {
      this.currentFolderId = null;
    },
    clearFrameGhost() {
      calls.push("clear-frame");
      this.frameGhostOptions = null;
    },
    enableClosingFrameMask() {
      calls.push("enable-mask");
    },
    getClosingFrameStartRect(panelRect: StageRect) {
      return panelRect;
    },
    getCurrentFolderId() {
      return this.currentFolderId;
    },
    getTransitionDebugSnapshot() {
      return {
        closingGhostCount: closingGhostLayer.children.length,
        framePresentation: this.frameGhostState || null,
        panelVisible: this.panel.visible,
        pageTrackVisible: this.pageTrack.visible,
      };
    },
    hideIconNodesForTransition(itemId: string) {
      const node = iconNodes.get(itemId);
      if (node) node.visible = false;
    },
    hidePageTrackForTransition() {
      this.pageTrack.visible = false;
    },
    onClosingHandoffPrepare(folderId: string | null) {
      calls.push(`prepare:${folderId}`);
    },
    onClosingHandoffVisualRelease(folderId: string | null) {
      calls.push(`release-visual:${folderId}`);
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
    },
    releaseTransitionOwnership(token, releaseOptions = {}) {
      visualOwnership.releaseByToken(token);
      if (releaseOptions.restorePageTrack !== false) this.pageTrack.visible = true;
      if (releaseOptions.reveal !== false) {
        for (const node of iconNodes.values()) {
          node.visible = true;
          node.alpha = 1;
        }
      }
    },
    retargetFrameGhost(toRect: StageRect, frameOptions: FolderFrameGhostOptions) {
      this.frameGhostTarget = toRect;
      this.frameGhostOptions = frameOptions;
      calls.push({ toRect, type: "retarget-frame" });
      return true;
    },
    startFrameGhost(
      fromRect: StageRect | null,
      toRect: StageRect,
      frameOptions: FolderFrameGhostOptions,
    ) {
      this.frameGhostState = fromRect ? { ...fromRect, progress: 0 } : null;
      this.frameGhostTarget = toRect;
      this.frameGhostOptions = frameOptions;
    },
  };
  const controller = new FolderClosingGhostController(layer, {
    ghostFactory: options.ghostFactory || (() => makeGhost()),
    previewSwap: makePreviewSwap(calls),
    scheduler: timerHost,
  });
  const session = new FolderVisualSession<
    FolderOpeningVisualPlan,
    FolderClosingControllerVisualPlan
  >({
    closingAdapter: controller,
    onCloseHandoffChange: (active, folderId) => activityChanges.push({ active, folderId }),
    onClosingHandoffReady: (folderId) => calls.push(`ready:${folderId}`),
    ownershipRevision: () => visualOwnership.getRevision(),
    ...(options.openingAdapter ? { openingAdapter: options.openingAdapter } : {}),
  });
  return { activityChanges, calls, controller, layer, session, timerHost, visualOwnership };
}

function makeState(completed: string[] = []): FolderClosingState {
  return {
    completeFolderCloseIconGhost: (key) => completed.push(key),
    folderPageIndex: 0,
    folderPageSize: 9,
    getFolderCloseIconGhostKey: (_itemId, index) => `close-${index}`,
    height: 800,
    isTextlessMode: false,
    renderedFolder: { id: "folder-1", name: "Folder", type: "folder" },
    stageRect: { left: 0, top: 0 },
    width: 1200,
  };
}

type TestTargetOverrides = Readonly<{
  interruptedOpeningSource?: Readonly<{
    alpha: number;
    labelAlpha: number;
    rect: StageRect;
  }> | undefined;
  isThumbnailChild?: boolean | undefined;
  targetStageLayoutRect?: StageRect | undefined;
}>;

function makeTarget(
  id = "app-1",
  index = 0,
  overrides: TestTargetOverrides = {},
): FolderClosingTarget {
  return {
    controllerGhostKey: `controller-${id}`,
    iconSize: 64,
    index,
    ...(overrides.interruptedOpeningSource === undefined
      ? {}
      : { interruptedOpeningSource: overrides.interruptedOpeningSource }),
    item: { id, type: "app" },
    pageIndex: 0,
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: overrides.targetStageLayoutRect ?? {
      height: 12,
      left: 100 + index * 30,
      top: 120,
      width: 12,
    },
    ...(overrides.isThumbnailChild === undefined
      ? {}
      : { isThumbnailChild: overrides.isThumbnailChild }),
  };
}

function makeUnusableTarget(id: string, index: number): FolderClosingTarget {
  return {
    controllerGhostKey: `controller-${id}`,
    iconSize: 64,
    index,
    item: { id, type: "app" },
    pageIndex: 0,
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: null,
  };
}

type PresentCloseOptions = Readonly<{
  adapterOptions?: FolderClosingControllerPlanOptions | undefined;
  folderRect?: StageRect | undefined;
  panelRect?: StageRect | undefined;
}>;

function presentClose(
  harness: TestHarness,
  targets: readonly FolderClosingTarget[] = [makeTarget()],
  state: FolderClosingState = makeState(),
  options: PresentCloseOptions = {},
) {
  const folderId = state.renderedFolder?.id;
  if (!folderId) throw new Error("closing test state requires a rendered folder id");
  const folderRect = options.folderRect || { height: 72, left: 10, top: 20, width: 72 };
  const panelRect = options.panelRect || { height: 360, left: 180, top: 200, width: 800 };
  const lease = harness.session.close({ folderId });
  lease.present({
    folderRect: { ...folderRect },
    options: options.adapterOptions || {},
    panelRect: { ...panelRect },
    state: { ...state },
    targets: targets.map((target) => ({ ...target })),
  });
  return lease;
}

function makeFramePresentation(): FolderFramePresentation {
  return {
    fillAlpha: 1,
    fillColor: 0,
    height: 72,
    left: 10,
    progress: 1,
    radius: 24,
    strokeAlpha: 1,
    strokeColor: 0,
    strokeWidth: 1,
    top: 20,
    width: 72,
  };
}

function runFrameArrive(layer: TestLayer): void {
  const onArrive = layer.frameGhostOptions?.onArrive;
  if (!onArrive) throw new Error("closing frame test fixture is missing onArrive()");
  onArrive(makeFramePresentation());
}

function hasCallType(call: TestCall, type: string): boolean {
  return typeof call === "object" && call.type === type;
}

export function runFolderClosingGhostControllerTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Folder closing ghost controller test failed] ${message}`);
  };

  {
    const harness = makeHarness();
    let thrown: unknown = null;
    try {
      Reflect.construct(FolderClosingGhostController, [harness.layer]);
    } catch (error) {
      thrown = error;
    }
    assert(/requires a ghost factory/.test(String(thrown)), "closing controller should reject missing constructor capabilities explicitly");
  }

  {
    const harness = makeHarness();
    let thrown: unknown = null;
    try {
      Reflect.apply(harness.controller.prepare, harness.controller, []);
    } catch (error) {
      thrown = error;
    }
    assert(/plan must be an object/.test(String(thrown)), "closing adapter should reject a missing presentation plan explicitly");
  }

  {
    const harness = makeHarness();
    let thrown: unknown = null;
    try {
      Reflect.apply(harness.controller.start, harness.controller, [
        { state: { ...makeState() }, targets: [] },
        {
          frameComplete() {},
          owner: () => ({ folderId: "folder-1", kind: "closing", token: "owner-a" }),
        },
      ]);
    } catch (error) {
      thrown = error;
    }
    assert(/missing cleanupFinished\(\)/.test(String(thrown)), "closing adapter setup should reject reporters missing required capabilities");
  }

  {
    const harness = makeHarness();
    const lease = harness.session.close({ folderId: "folder-1" });
    let thrown: unknown = null;
    try {
      Reflect.apply(lease.present, lease, [{
        folderRect: null,
        panelRect: { height: 360, left: 180, top: 200, width: 800 },
        state: makeState(),
        targets: [],
      }]);
    } catch (error) {
      thrown = error;
    }
    assert(
      thrown instanceof TypeError && /closing adapter plan folderRect must be an object/.test(thrown.message),
      "closing adapter startup should reject a null folder rect before visual code dereferences it",
    );
    assert(!lease.isCurrent(), "an invalid closing geometry plan should retire its failed Session lease");
  }

  {
    const expected = new Error("closing ghost construction failed");
    const harness = makeHarness();
    harness.controller.ghostFactory = () => {
      throw expected;
    };
    let thrown: unknown = null;
    try {
      presentClose(harness, [makeTarget()]);
    } catch (error) {
      thrown = error;
    }
    assert(thrown === expected, "closing adapter start failures should propagate unchanged");
    assert(!harness.controller.snapshot().active, "failed closing startup should release the controller reporter");
    assert(harness.layer.closingGhostLayer.children.length === 0, "failed closing startup should not leave orphan ghosts");
    assert(!harness.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")), "failed closing startup should release source ownership before Session receives a scope");
  }

  {
    const harness = makeHarness();
    const prepared = harness.controller.prepare({
      folderRect: { height: 72, left: 10, top: 20, width: 72 },
      panelRect: { height: 360, left: 180, top: 200, width: 800 },
      state: makeState(),
      targets: [
        makeTarget("app-1", 0, { isThumbnailChild: true }),
        makeUnusableTarget("app-2", 1),
      ],
    });
    const ghosts = prepared.ghosts ?? [];
    assert(ghosts.length === 1, "prepare should expose only usable closing participants");
    assert(ghosts[0]?.itemId === "app-1" && ghosts[0].visualCritical, "thumbnail participants should be marked visual-critical");
    assert(ghosts[0]?.controllerKey === "controller-app-1", "prepare should resolve controller completion keys once at the boundary");
  }

  {
    const completed: string[] = [];
    const harness = makeHarness();
    const lease = presentClose(harness, [makeTarget()], makeState(completed));
    const sourceOwner = harness.visualOwnership.getOwner(makeDesktopSourceVisualKey("folder-1"));

    assert(harness.layer.closingGhostLayer.children.length === 1, "presenting a close should install one child ghost");
    assert(harness.layer.frameGhostOptions?.frameGhostPhase === "closing", "presenting a close should install the closing frame before handoff preparation");
    assert(harness.calls.includes("prepare:folder-1"), "the adapter should prepare the desktop source only after substitutes exist");
    assert(sourceOwner?.kind === "closing", "the adapter should acquire desktop source ownership with the lease-bound owner");
    assert(lease.snapshot().ghostIds.join(",") === "app-1", "the Session should own participant settlement state");
  assert(lease.snapshot().activeVisuals === true, "the Session should expose active visuals as a semantic close state");

    runFrameArrive(harness.layer);
    assert(harness.calls.includes("ready:folder-1"), "frame visual readiness should begin handoff when no child is visual-critical");
    assert(completed.join(",") === "controller-app-1", "handoff should flush controller keys supplied by the Session exactly once");
    assert(harness.layer.panel.visible === false, "handoff should hide the stale panel before restoring desktop artwork");
  assert((harness.layer.closingGhostLayer.children.length as number) === 0, "handoff should release overlay ghosts before desktop artwork becomes visible");
    assert(harness.activityChanges[0]?.active === true, "handoff activation should flow through the Session callback");

    harness.timerHost.runAllFrames();
    assert(harness.session.snapshot().closing === null, "deferred cleanup should retire the close lease");
    assert(!harness.controller.snapshot().active, "deferred cleanup should release the controller's phase reporter identity");
    assert(harness.activityChanges.at(-1)?.active === false, "deferred cleanup should end handoff activity");
    assert(harness.layer.currentFolderId === null && harness.layer.visible === false, "deferred cleanup should retire stale overlay identity");
    motionRuntime.reset();
  }

  {
    const harness = makeHarness();
    const target = makeTarget("app-1", 0, { isThumbnailChild: true });
    const lease = presentClose(harness, [target]);
    const ghost = harness.layer.closingGhostLayer.children[0];
    assert(ghost, "thumbnail close should install its ghost before visual arrival");

    runFrameArrive(harness.layer);
    assert(!lease.snapshot().handoffReady, "a thumbnail child should keep handoff pending after frame arrival");
    harness.controller.markClosingGhostVisuallyArrived(makeState(), target, ghost);
    assert(lease.snapshot().handoffReady, "the visual-critical thumbnail arrival should unlock handoff");
    assert(harness.calls.includes("ready:folder-1"), "critical arrival should publish the handoff-ready callback once");
    harness.timerHost.runAllFrames();
    motionRuntime.reset();
  }

  {
    const openingGhost = makeGhost("reused-opening");
    openingGhost.openingPageIndex = 0;
    type OpeningRecord = {
      canceled: boolean;
      reporter: FolderOpeningPhaseReporter;
      taken: boolean;
    };
    const openingRecords: OpeningRecord[] = [];
    const openingAdapter: FolderOpeningVisualAdapter = {
      prepare: () => ({ ghostIds: ["app-1"] }),
      start(_plan, reporter) {
        const record: OpeningRecord = { canceled: false, reporter, taken: false };
        openingRecords.push(record);
        return {
          cancel() {
            record.canceled = true;
          },
          retarget() {},
          reveal() {},
          snapshot: () => ({ active: !record.canceled, ghostIds: record.taken ? [] : ["app-1"] }),
          takeGhost(itemId: string, accept?: (ghost: unknown) => boolean) {
            if (record.taken || itemId !== "app-1" || (accept && !accept(openingGhost))) return null;
            record.taken = true;
            return openingGhost;
          },
        };
      },
    };
    const harness = makeHarness({ openingAdapter });
    const openingLease = harness.session.open({ folderId: "folder-1", targetKey: "target-a" });
    openingLease.present({ state: {}, targets: [] });
    presentClose(harness);

    assert(harness.layer.closingGhostLayer.children[0] === openingGhost, "close should reuse the opening ghost through the reporter transfer port");
    assert(openingRecords[0]?.taken && openingRecords[0].canceled, "Session should transfer the ghost first and then retire the opening scope");
    assert(!openingLease.isCurrent(), "the interrupted opening lease should become stale after transfer");
    motionRuntime.reset();
  }

  {
    const harness = makeHarness();
    const openingLease = harness.session.open({ folderId: "folder-1", targetKey: "target-a" });
    const previewSourceRect = { height: 12, left: 42, top: 54, width: 12 };
    const syntheticSourceRect = { height: 8, left: 60, top: 72, width: 8 };
    presentClose(harness, [
      makeTarget("app-1", 0, {
        interruptedOpeningSource: {
          alpha: 1,
          labelAlpha: 0,
          rect: previewSourceRect,
        },
        isThumbnailChild: true,
      }),
      makeTarget("app-2", 1, {
        interruptedOpeningSource: {
          alpha: 0,
          labelAlpha: 0,
          rect: syntheticSourceRect,
        },
        isThumbnailChild: false,
      }),
    ], makeState());

    const [previewGhost, syntheticGhost] = harness.layer.closingGhostLayer.children;
    assert(previewGhost?.position.x === 48, "an unpresented opening close should start its preview ghost at the captured desktop preview center");
    assert(previewGhost?.scale.x === previewSourceRect.width / 64, "an unpresented opening close should preserve the captured desktop preview scale");
    assert(previewGhost?.alpha === 1 && previewGhost.labelText?.alpha === 0, "an interrupted preview child should preserve its pre-opening visibility");
    assert(syntheticGhost?.alpha === 0 && syntheticGhost.labelText?.alpha === 0, "an interrupted synthetic opening child should remain hidden at close startup");
    assert(!openingLease.isCurrent(), "closing an unpresented opening lease should retire it after installing fallback poses");
    motionRuntime.reset();
  }

  {
    const harness = makeHarness();
    const lease = presentClose(harness, [makeTarget()]);
    const ghost = harness.layer.closingGhostLayer.children[0];
    assert(ghost, "retarget should preserve an installed closing ghost");
    ghost.alpha = 0.4;
    const originalControl = harness.controller.activeGhostsByItemId.get("app-1")?.motionControl;
    lease.present({
      folderRect: { height: 80, left: 30, top: 40, width: 80 },
      options: {
        handoffRect: { height: 64, left: 44, top: 55, width: 64 },
        handoffTarget: { folderId: "folder-1", trackingKey: "retargeted" },
        previewSwapTargets: [],
      },
      panelRect: { height: 360, left: 180, top: 200, width: 800 },
      state: makeState(),
      targets: [makeTarget("app-1", 0, {
        targetStageLayoutRect: { height: 20, left: 220, top: 260, width: 20 },
      })],
    });

    const currentControl = harness.controller.activeGhostsByItemId.get("app-1")?.motionControl;
    assert(harness.layer.closingGhostLayer.children.length === 1 && harness.layer.closingGhostLayer.children[0] === ghost, "retarget should preserve the existing ghost object");
    assert(ghost.alpha === 0.4, "retarget should preserve the closing motion owner's physical alpha");
    assert(originalControl?.released === true && currentControl !== originalControl, "retarget should release the old motion owner before binding a new one");
    assert(harness.calls.some((call) => hasCallType(call, "retarget-frame")), "retarget should update the active frame instead of creating a second frame");
    assert(lease.snapshot().handoffRect?.left === 44, "retarget geometry should replace the lease-owned handoff metadata");
    assert(lease.detachedGhostMotion(ghost)?.x === 230, "retarget should update detached motion through the reporter port");
  assert(harness.controller.snapshot().motionControlCount === 1, "retarget should replace, not accumulate, controller-local motion ownership");
    lease.cancel({ restorePageTrack: false, reveal: false });
    motionRuntime.reset();
  }

  {
    const harness = makeHarness();
    const lease = presentClose(harness);
    lease.cancel({ restorePageTrack: false, reveal: false });

    assert(harness.layer.panel.visible, "cancellation should restore the panel container for a future folder render");
    assert(!harness.layer.pageTrack.visible, "non-reveal cancellation should not expose stale page-track content");
    assert(!harness.layer.iconNodes.get("app-1")!.visible, "non-reveal cancellation should not expose stale icon content");
    assert(harness.layer.closingGhostLayer.children.length === 0, "cancellation should remove all closing substitutes");
    assert(harness.session.snapshot().closing === null, "cancellation should retire the close identity at the Session boundary");
    motionRuntime.reset();
  }

  {
    const completed: string[] = [];
    const harness = makeHarness();
    setReducedMotionForTests(true);
    try {
      const lease = presentClose(harness, [
        makeTarget("app-1", 0),
        makeTarget("app-2", 1),
      ], makeState(completed));
      assert(lease.snapshot().ghostIds.length === 0, "synchronous reduced-motion completion should settle every registered ghost");
      assert(harness.layer.closingGhostLayer.children.length === 0, "completed non-thumbnail ghosts should leave the closing scene layer immediately");
      assert(harness.controller.snapshot().motionControlCount === 0, "synchronous completion must not leave stale controller motion controls");
      assert(lease.snapshot().completedControllerKeys.join(",") === "controller-app-1,controller-app-2", "Session should retain the controller completion set independent of callback timing");
      runFrameArrive(harness.layer);
      harness.timerHost.runAllFrames();
    } finally {
      clearMotionPreferencesForTests();
      motionRuntime.reset();
    }
  }

  {
    const harness = makeHarness();
    const lease = presentClose(harness);
    assert(harness.timerHost.timerCount === 1, "an active close should arm one geometry watchdog");
    harness.timerHost.runAllTimers();
    assert(!lease.isCurrent(), "a watchdog expiry should terminate the lease instead of leaving a visually empty pending Session");
    assert(lease.snapshot().error instanceof Error, "watchdog termination should remain observable as an explicit failure");
    motionRuntime.reset();
  }
}
