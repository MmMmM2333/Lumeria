import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import type {
  FolderClosingControllerVisualPlan,
  FolderClosingGhost,
  FolderClosingGhostControllerLayer,
  FolderClosingGhostLayer,
  FolderClosingScheduler,
  FolderClosingState,
  FolderClosingTarget,
} from "./folderClosingGhostController.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import type {
  FolderOpeningControllerVisualPlan,
  FolderOpeningGhost,
  FolderOpeningGhostControllerLayer,
  FolderOpeningGhostLayer,
  FolderOpeningScheduler,
  FolderOpeningState,
  FolderOpeningTarget,
} from "./folderOpeningGhostController.js";
import { FolderVisualSession } from "./folderVisualSession.js";
import type { FolderCloseLease, FolderOpenLease } from "./folderVisualSession.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import {
  clearFrameGhost as clearFrameGhostState,
  retargetFrameGhost as retargetFrameGhostState,
  startFrameGhost as startFrameGhostState,
} from "./folderFrameGhost.js";
import type {
  FolderFrameGhostLayer,
  FolderFrameGhostOptions,
  FolderFramePresentation,
  FolderFrameTransitionState,
} from "./folderFrameGhost.js";
import type { FolderGhostIconNodeState } from "./folderGhostIconState.js";
import {
  VisualOwnershipRegistry as FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
  makeFolderPageTrackVisualKey,
} from "./visualOwnershipRegistry.js";
import type { VisualOwnershipOwnerInput } from "./visualOwnershipRegistry.js";

type TestTimerCallback = (time: number) => void;

type RaceVisualSession = FolderVisualSession<
  FolderOpeningControllerVisualPlan,
  FolderClosingControllerVisualPlan
>;
type RaceCloseLease = FolderCloseLease<FolderClosingControllerVisualPlan>;
type RaceOpenLease = FolderOpenLease<FolderOpeningControllerVisualPlan>;

type TestTimerHost = FolderClosingScheduler & FolderOpeningScheduler & Readonly<{
  frameCount: number;
  timerCount: number;
}>;

type TestPoint = Readonly<{
  set(x: number, y?: number): void;
}> & { x: number; y: number };

type TestGhostLayerPort = Readonly<{
  removeChild(ghost: TestGhost): unknown;
}>;

type TestGhost = FolderOpeningGhost & FolderClosingGhost & {
  id: string;
  state?: FolderGhostIconNodeState | undefined;
  testParent?: TestGhostLayerPort | null | undefined;
};

function isTestGhost(ghost: FolderOpeningGhost): ghost is TestGhost {
  return "closingComplete" in ghost && typeof Reflect.get(ghost, "getIconBounds") === "function";
}

type TestGhostLayer = {
  children: TestGhost[];
  mask?: TestFrameGraphics | null;
  addChild(child: TestGhost): TestGhost;
  removeChild(child: TestGhost): TestGhost;
  removeChildren(): TestGhost[];
};

type TestFrameGraphics = {
  alpha: number;
  destroyed: boolean;
  visible: boolean;
  clear(): TestFrameGraphics;
  fill(): TestFrameGraphics;
  roundRect(left: number, top: number, width: number, height: number, radius: number): TestFrameGraphics;
  stroke(): TestFrameGraphics;
};

function makeFrameGraphics(): TestFrameGraphics {
  return {
    alpha: 0,
    destroyed: false,
    visible: false,
    clear() { return this; },
    fill() { return this; },
    roundRect() { return this; },
    stroke() { return this; },
  };
}

function makeTimerHost(): TestTimerHost {
  let nextId = 1;
  const frames = new Map<number, TestTimerCallback>();
  const timers = new Map<number, TestTimerCallback>();
  return {
    cancelAnimationFrame(id: unknown) {
      if (typeof id === "number") frames.delete(id);
    },
    clearTimeout(id: unknown) {
      if (typeof id === "number") timers.delete(id);
    },
    requestAnimationFrame(callback: TestTimerCallback) {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return id;
    },
    setTimeout(callback: TestTimerCallback) {
      const id = nextId;
      nextId += 1;
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

function makePoint(): TestPoint {
  return {
    x: 0,
    y: 0,
    set(x: number, y = x) {
      this.x = x;
      this.y = y;
    },
  };
}

function makeGhost(id = "ghost"): TestGhost {
  const ghost: TestGhost = {
    alpha: 1,
    closingComplete: false,
    destroyed: false,
    eventMode: "static",
    id,
    item: null,
    labelText: {
      alpha: 1,
      scale: makePoint(),
      visible: true,
    },
    position: makePoint(),
    scale: makePoint(),
    removeFromParent() {
      this.testParent?.removeChild(this);
    },
    destroy() {
      this.destroyed = true;
    },
    getIconBounds(_stageRect: StageOrigin) {
      return {
        height: 32,
        left: this.position.x - 16,
        top: this.position.y - 16,
        width: 32,
      };
    },
    setState(state: FolderGhostIconNodeState) {
      this.item = state.item ?? null;
      this.state = state;
    },
  };
  return ghost;
}

function makeLayerList(): TestGhostLayer {
  const children: TestGhost[] = [];
  const layer: TestGhostLayer = {
    children,
    addChild(child: TestGhost) {
      child.testParent?.removeChild(child);
      child.testParent = this;
      children.push(child);
      return child;
    },
    removeChild(child: TestGhost) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      if (child.testParent === this) child.testParent = null;
      return child;
    },
    removeChildren() {
      const removed = children.splice(0);
      for (const child of removed) {
        if (child.testParent === this) child.testParent = null;
      }
      return removed;
    },
  };
  return layer;
}

type TestState = FolderOpeningState & FolderClosingState;

function makeState(completed: string[] = []): TestState {
  return {
    completeFolderCloseIconGhost: (key) => completed.push(`close:${key}`),
    completeFolderOpenIconGhost: (key) => completed.push(`open:${key}`),
    folderOpenIconGhosts: [],
    folderPageIndex: 0,
    folderPageSize: 9,
    getFolderCloseIconGhostKey: (_itemId, index) => `close-key-${index}`,
    getFolderOpenIconGhostKey: (_itemId, index) => `open-key-${index}`,
    height: 800,
    isTextlessMode: false,
    launchTargetStatusById: {},
    renderedFolder: { id: "folder-1", name: "Folder", type: "folder" },
    showMissingLaunchTargetBadge: false,
    stageRect: { left: 0, top: 0 },
    width: 1200,
  };
}

type TestTarget = FolderOpeningTarget & FolderClosingTarget;

function makeTarget(id = "app-1", index = 0, pageIndex = 0): TestTarget {
  return {
    cellHeight: 80,
    cellWidth: 80,
    columnCount: 3,
    controllerGhostKey: `ghost-key-${id}`,
    iconSize: 64,
    index,
    item: { id, type: "app" },
    pageIndex,
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: { height: 64, left: 100, top: 120, width: 64 },
  };
}

type TestActivityChange = Readonly<{
  active: boolean;
  folderId: string | null;
}>;

type TestIconNode = {
  alpha: number;
  item: Readonly<{ id: string }>;
  source: Readonly<{ folderId: string; pageIndex: number }>;
  visible: boolean;
};

type RaceLayer = FolderOpeningGhostControllerLayer & FolderClosingGhostControllerLayer & FolderFrameGhostLayer & {
  activityChanges: TestActivityChange[];
  calls: string[];
  closingGhostLayer: TestGhostLayer;
  readonly closingGhosts: FolderClosingGhostController;
  currentFolderId: string | null;
  readonly folderVisualSession: RaceVisualSession;
  frameGhostOptions: FolderFrameGhostOptions | null;
  frameGhostTransitionState: FolderFrameTransitionState | null;
  frameGhostState: FolderFramePresentation | null;
  frameGhostTarget: StageRect | null;
  iconNodes: Map<string, TestIconNode>;
  readonly iconNode: TestIconNode;
  openingGhostLayer: TestGhostLayer;
  readonly openingGhosts: FolderOpeningGhostController;
  pageTrack: { visible: boolean };
  visualOwnership: FolderVisualOwnershipRegistry;
  acquireVisualOwnership(key: string | null, owner: VisualOwnershipOwnerInput): boolean;
  createClosingGhostToken(folderId?: string | null): string;
  onClosingHandoffReady(folderId: string | null): void;
  onInternalActivityChange(active: boolean, folderId?: string | null): void;
  revealIconNodes(): void;
};

type RaceHarness = {
  activityChanges: TestActivityChange[];
  calls: string[];
  closingLease: RaceCloseLease | null;
  desktopSource: {
    item: Readonly<{ id: string; type: string }>;
    visible: boolean;
    visualWrap: { visible: boolean };
  };
  layer: RaceLayer;
  openingLease: RaceOpenLease | null;
  timerHost: TestTimerHost;
  visualOwnership: FolderVisualOwnershipRegistry;
};

function makeRaceHarness(): RaceHarness {
  const activityChanges: TestActivityChange[] = [];
  const calls: string[] = [];
  const closingLayer = makeLayerList();
  const openingLayer = makeLayerList();
  const timerHost = makeTimerHost();
  const visualOwnership = new FolderVisualOwnershipRegistry();
  const desktopSource = {
    item: { id: "folder-1", type: "folder" },
    visible: true,
    visualWrap: { visible: true },
  };
  const iconNode: TestIconNode = {
    alpha: 1,
    item: { id: "app-1" },
    source: { folderId: "folder-1", pageIndex: 0 },
    visible: true,
  };
  let closeTokenCounter = 1;
  let openingGhosts: FolderOpeningGhostController;
  let closingGhosts: FolderClosingGhostController;
  let folderVisualSession: RaceVisualSession;

  const layer: RaceLayer = {
    activityChanges,
    calls,
    closingGhostLayer: closingLayer,
    currentFolderId: "folder-1",
    closingFrameMask: makeFrameGraphics(),
    frameGhost: makeFrameGraphics(),
    frameGhostFolderId: null,
    frameGhostMotionControl: null,
    frameGhostOptions: null,
    frameGhostPhase: null,
    frameGhostState: null,
    frameGhostTransitionState: null,
    frameGhostTarget: null,
    iconNodes: new Map<string, TestIconNode>([["app-1", iconNode]]),
    openingGhostLayer: openingLayer,
    openingGhostBoundsRefreshers: new Map(),
    pageTrack: { visible: true },
    panel: { visible: true },
    panelMaterial: { alpha: 1, visible: true },
    visualOwnership,
    visible: true,
    acquireVisualOwnership(key: string | null, owner: VisualOwnershipOwnerInput) {
      return visualOwnership.acquire(key, owner);
    },
    acquireDesktopSourceOwnership(owner: VisualOwnershipOwnerInput) {
      const key = makeDesktopSourceVisualKey(owner.folderId || this.currentFolderId);
      return key ? this.acquireVisualOwnership(key, owner) : false;
    },
    clearFrameGhost(options: Readonly<{ ownerToken?: unknown }> = {}) {
      calls.push("clear-frame");
      return clearFrameGhostState(this as unknown as FolderFrameGhostLayer, options);
    },
    clearCurrentFolder() {
      this.currentFolderId = null;
    },
    createClosingGhostToken(folderId: string | null = null) {
      const token = `close:${folderId || "folder"}:${closeTokenCounter}`;
      closeTokenCounter += 1;
      return token;
    },
    getTransitionDebugSnapshot() {
      const transition = this.frameGhostTransitionState;
      return {
        closingGhostCount: this.closingGhostLayer.children.length,
        framePresentation: this.frameGhostState || null,
        frameTransition: transition ? {
          phaseFrom: transition.phaseFrom,
          phaseTo: transition.phaseTo,
          progress: transition.progressState.value,
        } : null,
        panelVisible: this.panel.visible,
        pageTrackVisible: this.pageTrack.visible,
      };
    },
    enableClosingFrameMask() {
      calls.push("enable-mask");
    },
    hideIconNodesForTransition(itemId: string, owner: VisualOwnershipOwnerInput) {
      for (const node of this.iconNodes.values()) {
        if (node.item?.id !== itemId) continue;
        const key = makeFolderIconVisualKey(owner.folderId || this.currentFolderId, itemId);
        if (key) this.acquireVisualOwnership(key, owner);
        node.visible = false;
      }
    },
    hidePageTrackForTransition(owner: VisualOwnershipOwnerInput) {
      const key = makeFolderPageTrackVisualKey(owner.folderId || this.currentFolderId);
      if (key) this.acquireVisualOwnership(key, owner);
      this.pageTrack.visible = false;
    },
    getCurrentFolderId() {
      return this.currentFolderId || null;
    },
    isOpeningGeometryTransitionActive() {
      return false;
    },
    mapOpeningSourceRectToLocal(state, sourceRect) {
      return {
        height: sourceRect.height,
        left: sourceRect.left - state.stageRect.left,
        top: sourceRect.top - state.stageRect.top,
        width: sourceRect.width,
      };
    },
    registerOpeningGhostBounds() {
      calls.push("register-opening-bounds");
    },
    revealIconNodes() {
      for (const node of this.iconNodes.values()) {
        node.visible = true;
        node.alpha = 1;
      }
    },
    onClosingHandoffReady(folderId: string | null) {
      calls.push(`ready:${folderId}`);
    },
    onClosingHandoffPrepare(folderId: string | null) {
      calls.push(`prepare:${folderId}`);
      if (folderId === desktopSource.item.id) desktopSource.visualWrap.visible = false;
    },
    onClosingHandoffVisualRelease(folderId: string | null) {
      calls.push(`visual-release:${folderId}`);
      if (folderId === desktopSource.item.id) desktopSource.visualWrap.visible = true;
    },
    onInternalActivityChange(active: boolean, folderId: string | null = null) {
      activityChanges.push({ active, folderId });
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
    },
    refreshRegisteredIconBounds() {
      calls.push("refresh-bounds");
    },
    removeOpeningGhost(ghost: FolderOpeningGhost) {
      if (!isTestGhost(ghost)) throw new TypeError("race fixture received a non-test opening ghost");
      openingLayer.removeChild(ghost);
      return ghost;
    },
    releaseTransitionOwnership(
      token: string | undefined,
      options: Readonly<{
        restorePageTrack?: boolean | undefined;
        reveal?: boolean | undefined;
      }> = {},
    ) {
      if (token == null) return;
      const reveal = options.reveal !== false;
      const restorePageTrack = options.restorePageTrack !== false;
      const entries = visualOwnership.snapshot();
      for (const entry of entries) {
        if (entry.owner?.token !== token) continue;
        visualOwnership.release(entry.key, token);
        if (!reveal || !entry.key?.startsWith("folderIcon:")) continue;
        for (const node of this.iconNodes.values()) {
          const key = makeFolderIconVisualKey(entry.owner.folderId, node.item?.id);
          if (key === entry.key && !visualOwnership.hasOwner(key)) {
            node.visible = true;
            node.alpha = 1;
          }
        }
      }
      if (restorePageTrack && !visualOwnership.snapshot().some((entry) => entry.key?.startsWith("folderPageTrack:"))) {
        this.pageTrack.visible = true;
      }
    },
    startFrameGhost(
      fromRect: StageRect | null,
      toRect: StageRect,
      options: FolderFrameGhostOptions = {},
    ) {
      this.frameGhostOptions = options;
      this.frameGhostTarget = toRect;
      startFrameGhostState(
        this as unknown as FolderFrameGhostLayer,
        fromRect,
        toRect,
        options,
      );
      return true;
    },
    retargetFrameGhost(toRect: StageRect, options: FolderFrameGhostOptions = {}) {
      this.frameGhostTarget = toRect;
      this.frameGhostOptions = options;
      return retargetFrameGhostState(
        this as unknown as FolderFrameGhostLayer,
        toRect,
        options,
      );
    },
    notifyTitleFrame() {},
    get iconNode() {
      return iconNode;
    },
    get openingGhosts() {
      return openingGhosts;
    },
    get closingGhosts() {
      return closingGhosts;
    },
    get folderVisualSession() {
      return folderVisualSession;
    },
  };

  openingGhosts = new FolderOpeningGhostController(layer, {
    ghostFactory: () => makeGhost("opening"),
    scheduler: timerHost,
  });
  closingGhosts = new FolderClosingGhostController(layer, {
    ghostFactory: () => makeGhost("closing"),
    previewSwap: {
      clear() {
        calls.push("clear-preview");
      },
      start() {
        calls.push("start-preview");
      },
    },
    scheduler: timerHost,
  });
  folderVisualSession = new FolderVisualSession<
    FolderOpeningControllerVisualPlan,
    FolderClosingControllerVisualPlan
  >({
    closingAdapter: closingGhosts,
    onCloseHandoffChange: (active, folderId) => layer.onInternalActivityChange(active, folderId),
    onClosingHandoffReady: (folderId) => layer.onClosingHandoffReady(folderId),
    openingAdapter: openingGhosts,
    ownershipRevision: () => visualOwnership.getRevision(),
  });

  return {
    activityChanges,
    calls,
    closingLease: null,
    desktopSource,
    layer,
    openingLease: null,
    timerHost,
    visualOwnership,
  };
}

function startOpening(harness: RaceHarness, token = "open:folder-1"): unknown | null {
  const lease = harness.layer.folderVisualSession.open({
    folderId: "folder-1",
    forceNew: true,
    targetKey: token,
  });
  lease.present({
    options: {
      frameSourceRect: { height: 48, left: 10, top: 20, width: 48 },
      frameTargetRect: { height: 360, left: 180, top: 200, width: 800 },
    },
    state: { ...makeState() },
    targets: [{ ...makeTarget() }],
  });
  harness.openingLease = lease;
  return visualOwnerToken(harness.visualOwnership, "opening");
}

function startClosing(
  harness: RaceHarness,
  targets: readonly TestTarget[] = [makeTarget()],
  stateOverrides: Readonly<{ folderPageIndex?: number }> = {},
): unknown | null {
  const lease = harness.layer.folderVisualSession.close({ folderId: "folder-1" });
  lease.present({
    folderRect: { height: 72, left: 10, top: 20, width: 72 },
    panelRect: { height: 360, left: 180, top: 200, width: 800 },
    state: { ...makeState(), ...stateOverrides },
    targets: targets.map((target) => ({ ...target })),
  });
  harness.closingLease = lease;
  return visualOwnerToken(harness.visualOwnership, "closing");
}

function interruptCloseWithOpen(harness: RaceHarness, token: string): void {
  harness.closingLease?.cancel({ restorePageTrack: false, reveal: false });
  harness.closingLease = null;
  startOpening(harness, token);
}

function visualOwnerToken(registry: FolderVisualOwnershipRegistry, kind: string): unknown | null {
  return registry.snapshot().find((entry) => entry.owner?.kind === kind)?.owner?.token || null;
}

function hasOwnerToken(registry: FolderVisualOwnershipRegistry, token: unknown): boolean {
  return registry.snapshot().some((entry) => entry.owner?.token === token);
}

function hasFolderSubstituteVisual(harness: RaceHarness): boolean {
  return Boolean(
    harness.layer.frameGhost?.visible ||
    harness.layer.openingGhostLayer.children.length ||
    harness.layer.closingGhostLayer.children.length
  );
}

function isDesktopSourceArtworkVisible(harness: RaceHarness): boolean {
  return Boolean(harness.desktopSource.visible && harness.desktopSource.visualWrap.visible);
}

export function runFolderCloseRaceTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Folder close race test failed] ${message}`);
  };

  {
    motionRuntime.reset();
    const harness = makeRaceHarness();
    startOpening(harness, "open:physical-reversal");
    motionRuntime.step(0.08);
    const openingTransition = harness.layer.frameGhostTransitionState;
    const openingProgress = openingTransition?.progressState.value ?? -1;
    const openingPanelRect = openingTransition?.panelRect;
    assert(openingProgress > 0 && openingProgress < 1, "the lifecycle fixture should interrupt a genuinely partial opening");

    startClosing(harness);

    const closingTransition = harness.layer.frameGhostTransitionState;
    assert(
      Math.abs((closingTransition?.progressState.value ?? -1) - openingProgress) < 0.0001,
      "open-turn-close should preserve the physical trajectory progress instead of restarting close at the panel endpoint",
    );
    assert(
      closingTransition?.panelRect.left === openingPanelRect?.left &&
      closingTransition?.panelRect.top === openingPanelRect?.top &&
      closingTransition?.panelRect.width === openingPanelRect?.width &&
      closingTransition?.panelRect.height === openingPanelRect?.height,
      "open-turn-close should keep the canonical full panel endpoint instead of replacing it with the partial presentation frame",
    );
    motionRuntime.reset();
  }

  {
    const harness = makeRaceHarness();
    startOpening(harness, "open:first");
    assert(harness.layer.openingGhostLayer.children.length === 1, "opening should start with one opening ghost");

    const closeToken = startClosing(harness);
  assert((harness.layer.openingGhostLayer.children.length as number) === 0, "close should consume interrupted opening ghosts");
    assert(harness.layer.closingGhostLayer.children.length === 1, "close should retarget the opening ghost into the closing layer");
    assert(harness.visualOwnership.isOwnedBy(makeDesktopSourceVisualKey("folder-1"), closeToken), "close should own the desktop source after interrupting open");
    assert(harness.calls.includes("prepare:folder-1"), "close should prepare the desktop source handoff in the start frame");
    assert(hasFolderSubstituteVisual(harness), "close should keep an overlay substitute visible when the desktop source artwork is hidden");
    assert(!isDesktopSourceArtworkVisible(harness), "close should not show the desktop source artwork while opening or closing ghosts are visible");

    interruptCloseWithOpen(harness, "open:second");

  assert((harness.layer.closingGhostLayer.children.length as number) === 0, "open after close should clear closing ghost visuals");
    assert(harness.layer.openingGhostLayer.children.length === 1, "open after close should leave only the new opening ghost");
    assert(harness.layer.folderVisualSession.snapshot().closing === null, "open after close should clear the stale closing lease");
    assert(!hasOwnerToken(harness.visualOwnership, closeToken), "open after close should not leak the stale closing ownership token");
    motionRuntime.reset();
  }

  {
    const harness = makeRaceHarness();
    const firstCloseToken = startClosing(harness);
    assert(harness.layer.closingGhostLayer.children.length === 1, "initial close should create one closing ghost");

    interruptCloseWithOpen(harness, "open:middle");
  assert((harness.layer.closingGhostLayer.children.length as number) === 0, "open interrupt should clear the first closing ghost");
    assert(harness.layer.openingGhostLayer.children.length === 1, "open interrupt should create one opening ghost");
    assert(harness.layer.folderVisualSession.snapshot().closing === null, "open interrupt should clear the first close lease");

    const secondCloseToken = startClosing(harness);

    assert(secondCloseToken !== firstCloseToken, "second close should use a new close session token");
  assert((harness.layer.openingGhostLayer.children.length as number) === 0, "second close should consume the interrupted opening ghost");
    assert(harness.layer.closingGhostLayer.children.length === 1, "second close should leave only the current closing ghost");
    assert(harness.visualOwnership.isOwnedBy(makeDesktopSourceVisualKey("folder-1"), secondCloseToken), "second close should own the desktop source");
    assert(hasFolderSubstituteVisual(harness), "second close should keep a substitute visual during desktop source handoff");
    assert(!isDesktopSourceArtworkVisible(harness), "second close should keep desktop source artwork hidden while ghosts are visible");
    assert(!hasOwnerToken(harness.visualOwnership, firstCloseToken), "second close should not leak the first close token");
    assert(!hasOwnerToken(harness.visualOwnership, "open:middle"), "second close should not leak the interrupted opening token");
    motionRuntime.reset();
  }

  {
    const harness = makeRaceHarness();
    const openingToken = startOpening(harness, "open:page-0");
    harness.layer.iconNodes.set("app-2", {
      alpha: 1,
      item: { id: "app-2" },
      source: { folderId: "folder-1", pageIndex: 1 },
      visible: true,
    });

    const committedPageTarget = makeTarget("app-2", 0, 1);
    startClosing(harness, [committedPageTarget], { folderPageIndex: 1 });

  assert(harness.layer.openingGhostLayer.children.length === 0, "open-turn-close should clear the interrupted non-current opening ghost");
    assert(harness.layer.closingGhostLayer.children.length === 1, "open-turn-close should create one closing ghost for the close anchor page");
    assert(harness.layer.closingGhostLayer.children[0]?.item?.id === "app-2", "open-turn-close should hand off the current visual page item");
    assert(!hasOwnerToken(harness.visualOwnership, openingToken), "open-turn-close should not keep stale origin-page opening ownership");
    motionRuntime.reset();
  }
}
