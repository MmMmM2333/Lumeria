import type { Container, ContainerChild } from "pixi.js";
import type { IconBoundsRegistry } from "../geometry/iconBoundsRegistry.js";
import type { DesktopItem } from "./desktopRenderPlan.js";
import type { DesktopLayer as DesktopLayerClass } from "./DesktopLayer.js";
import type { SceneDataRecord } from "../../sceneFrame.js";

type DesktopLayerConstructor = typeof import("./DesktopLayer.js")["DesktopLayer"];
type DesktopLayerIconNode = NonNullable<ReturnType<DesktopLayerClass["findIconNodeByItemId"]>>;
type DesktopLayerUpdateState = Parameters<DesktopLayerClass["update"]>[0];
type DesktopLayerHandoffState = Parameters<DesktopLayerClass["applyFolderSourceGhosting"]>[0];
type TestMethodKeys<T> = {
  [Key in keyof T]-?: T[Key] extends (...args: never[]) => unknown ? Key : never;
}[keyof T];
type TestRelaxedMethods<T> = {
  [Key in TestMethodKeys<T>]: T[Key] extends (...args: never[]) => infer Result
    ? (...args: unknown[]) => Result
    : never;
};
type TestDesktopLayer = Omit<DesktopLayerClass, TestMethodKeys<DesktopLayerClass>> &
  TestRelaxedMethods<DesktopLayerClass>;
interface TestDesktopLayerConstructor {
  new (...args: ConstructorParameters<DesktopLayerConstructor>): TestDesktopLayer;
  prototype: TestDesktopLayer;
}

interface TestNodeState {
  draggable?: boolean;
  dragging?: boolean;
  ghosted?: boolean;
  folderHoverState?: unknown;
  dropTarget?: unknown;
  interactive?: boolean;
  item?: DesktopItem | null;
  opening?: boolean;
  preserveNodeScale?: boolean;
  suppressLabelRevealAfterGhost?: boolean;
  suppressedFolderPreviewChildIds?: readonly string[];
  source?: Readonly<Record<string, unknown>> | null;
}

interface TestNode {
  __folderSourceGhostedByOwnership?: boolean;
  alpha: number;
  cursor: string;
  destroyed: boolean;
  eventMode: string;
  folderHandoffLabelRevealInProgress?: boolean;
  getFolderPreviewChildBounds?: (...args: unknown[]) => unknown;
  getFolderThumbBounds?: (...args: unknown[]) => unknown;
  getIconBounds?: (...args: unknown[]) => unknown;
  iconSize?: number;
  id: string;
  item?: DesktopItem | null;
  labelRestoreCount: number;
  labelRevealCount: number;
  labelText: { alpha: number; renderable: boolean; visible: boolean };
  parent: Container | null;
  position: TestPoint;
  releaseFolderHandoffSource(options?: Readonly<{ fadeLabel?: boolean }>): void;
  resetFolderPreviewAfterGhost(): void;
  resetFolderPreviewAfterGhostCount: number;
  renderable?: boolean;
  restoreLabelAfterGhost(): void;
  revealLabelAfterGhost(): void;
  scale: TestPoint;
  setFolderHandoffSourceHidden(hidden: boolean): void;
  setFolderHandoffVisualHidden(hidden: boolean): void;
  setState(state: TestNodeState): void;
  state: TestNodeState;
  visible: boolean;
  visualWrap: { visible: boolean };
}

interface TestPoint {
  set(x: number, y?: number): void;
  x: number;
  y: number;
}

interface TestGhostingNode {
  __folderSourceGhostedByOwnership?: boolean;
  alpha: number;
  item: DesktopItem;
  setState(state: TestNodeState): void;
  state: TestNodeState;
  x?: number;
  y?: number;
}

type TestPageTrack = Container & {
  children: TestNode[];
  x: number;
};

type TestReleaseNode = Container & {
  iconSize: number;
  item?: DesktopItem;
  visualWrap: Container;
};

interface FolderVisualSessionOptions {
  active?: boolean;
  folderId?: string | null;
  ghostKeys?: readonly string[];
}

interface DesktopHandoffStateOptions {
  closingFolderIds?: readonly string[];
  openingSourceGhosted?: (folderId: string) => boolean;
  sourceGhostedFolderIds?: readonly string[];
}

function asDesktopIconNode(node: unknown): DesktopLayerIconNode {
  return asTestDependency<DesktopLayerIconNode>(node);
}

function asTestDependency<T>(value: unknown): T {
  return value as T;
}

function assumePresent<T>(value: T): NonNullable<T> {
  return value as NonNullable<T>;
}

function makePageTrack(children: TestNode[]): TestPageTrack {
  const pageTrack = asTestDependency<TestPageTrack>({
    children,
    x: 0,
    addChild(this: TestPageTrack, ...nextChildren: TestNode[]) {
      nextChildren.forEach((child) => {
        if (!child) return;
        const existingIndex = this.children.indexOf(child);
        if (existingIndex >= 0) this.children.splice(existingIndex, 1);
        this.children.push(child);
        child.parent = this;
      });
      return nextChildren[0] || null;
    },
    removeChild(this: TestPageTrack, ...nextChildren: TestNode[]) {
      nextChildren.forEach((child) => {
        const currentIndex = this.children.indexOf(child);
        if (currentIndex < 0) return;
        this.children.splice(currentIndex, 1);
        if (child.parent === this) child.parent = null;
      });
      return nextChildren[0] || null;
    },
    setChildIndex(this: TestPageTrack, child: TestNode, index: number) {
      const currentIndex = this.children.indexOf(child);
      if (currentIndex < 0) return;
      this.children.splice(currentIndex, 1);
      this.children.splice(index, 0, child);
    },
  });
  for (const child of children) child.parent = pageTrack;
  return pageTrack;
}

function makeNode(id: string): TestNode {
  return {
    alpha: 0,
    cursor: "pointer",
    destroyed: false,
    eventMode: "static",
    id,
    labelText: { alpha: 0.5, renderable: true, visible: true },
    labelRevealCount: 0,
    labelRestoreCount: 0,
    position: {
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
      x: 0,
      y: 0,
    },
    scale: {
      set(x: number, y = x) {
        this.x = x;
        this.y = y;
      },
      x: 0.7,
      y: 0.7,
    },
    state: { draggable: false, ghosted: true, interactive: false },
    setState(state: TestNodeState) {
      this.state = state;
      this.eventMode = state.interactive === false ? "none" : "static";
      this.visible = !state.dragging && !state.ghosted;
    },
    setFolderHandoffSourceHidden(hidden: boolean) {
      this.visualWrap.visible = !hidden;
      this.labelText.renderable = !hidden;
      if (hidden) {
        this.folderHandoffLabelRevealInProgress = false;
        this.labelText.alpha = 0;
      }
    },
    setFolderHandoffVisualHidden(hidden: boolean) {
      this.setFolderHandoffSourceHidden(hidden);
    },
    releaseFolderHandoffSource(options: Readonly<{ fadeLabel?: boolean }> = {}) {
      this.setFolderHandoffSourceHidden(false);
      if (options.fadeLabel === false) this.restoreLabelAfterGhost();
      else this.revealLabelAfterGhost();
    },
    revealLabelAfterGhost() {
      this.labelRevealCount += 1;
      this.folderHandoffLabelRevealInProgress = true;
      this.labelText.alpha = 0;
      this.labelText.renderable = true;
      this.labelText.visible = true;
    },
    restoreLabelAfterGhost() {
      this.labelRestoreCount += 1;
      this.folderHandoffLabelRevealInProgress = false;
      this.labelText.alpha = 1;
      this.labelText.renderable = true;
      this.labelText.visible = true;
    },
    resetFolderPreviewAfterGhost() {
      this.resetFolderPreviewAfterGhostCount += 1;
    },
    resetFolderPreviewAfterGhostCount: 0,
    parent: null,
    visualWrap: { visible: true },
    visible: false,
  } as TestNode;
}

function makeLayer(DesktopLayer: TestDesktopLayerConstructor, pageTrack: TestPageTrack): TestDesktopLayer {
  const makeTransformNode = () => {
    const node = {
      alpha: 1,
      interactiveChildren: true,
      pivot: {
        x: 0,
        y: 0,
        set(x: number, y: number) {
          this.x = x;
          this.y = y;
        },
      },
      position: {
        x: 0,
        y: 0,
        set(x: number, y: number) {
          this.x = x;
          this.y = y;
        },
      },
      scale: {
        x: 1,
        y: 1,
        set(x: number, y = x) {
          this.x = x;
          this.y = y;
        },
      },
      visible: false,
    };
    Object.defineProperties(node, {
      x: {
        get() {
          return this.position.x;
        },
        set(value: number) {
          this.position.x = value;
        },
      },
      y: {
        get() {
          return this.position.y;
        },
        set(value: number) {
          this.position.y = value;
        },
      },
    });
    return asTestDependency<Container>(node);
  };
  const layer = Object.create(DesktopLayer.prototype) as TestDesktopLayer;
  layer.emptyText = asTestDependency<TestDesktopLayer["emptyText"]>({
    position: {
      set() {},
    },
    visible: false,
  });
  layer.folderHandoffNode = null;
  layer.folderHandoffNodes = new Map();
  layer.folderDropFrameSuppressedIds = new Set();
  layer.hasDesktopVisualAlpha = false;
  layer.hasDesktopVisualTransform = false;
  layer.hasFolderOverlayAlpha = false;
  layer.hasFolderOverlayTransform = false;
  layer.iconNodes = new Map();
  layer.iconBoundsRegistry = makeLayerWithRegistry.iconBoundsRegistry;
  layer.pageTrack = asTestDependency<TestDesktopLayer["pageTrack"]>(pageTrack);
  layer.desktopClosingUnderlayLayer = makeTransformNode();
  layer.dragHitDebugLayer = asTestDependency({ update() { return null; } });
  layer.singleStageDiagnosticsLayer = asTestDependency({ update() { return null; } });
  layer.singleStageFolderLayer = asTestDependency<TestDesktopLayer["singleStageFolderLayer"]>(makeTransformNode());
  layer.singleStageFolderLayer.folderVisualSession = makeFolderVisualSession();
  layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();
  layer.singleStageFolderLayer.hasVisibleFolderSubstitute = () => false;
  layer.visualOwnership = asTestDependency<TestDesktopLayer["visualOwnership"]>({ snapshot: () => [] });
  layer.visualRoot = makeTransformNode();
  return layer;
}

const makeLayerWithRegistry = makeLayer as typeof makeLayer & { iconBoundsRegistry: IconBoundsRegistry };

function makeFolderVisualSession(options: FolderVisualSessionOptions = {}) {
  const {
    active = false,
    folderId = null,
    ghostKeys = [],
  } = options;
  return {
    snapshot() {
      return {
        closing: {
          folderId,
          ghostIds: [...ghostKeys],
          handoffActive: active,
        },
      };
    },
  } as unknown as TestDesktopLayer["singleStageFolderLayer"]["folderVisualSession"];
}

function makeDesktopHandoffState({
  closingFolderIds = [],
  openingSourceGhosted = () => false,
  sourceGhostedFolderIds = [],
}: DesktopHandoffStateOptions = {}): DesktopLayerHandoffState {
  return asTestDependency<DesktopLayerHandoffState>({
    folderClosingHandoffIds: new Set(closingFolderIds),
    folderSourceGhostedIds: new Set(sourceGhostedFolderIds),
    isFolderOpeningPreviewFrameGhosted: openingSourceGhosted,
    singleStageFolderState: null,
  });
}

function makeDesktopQuiescenceState(
  item: DesktopItem = { id: "app-a", type: "app" },
): DesktopLayerUpdateState {
  return asTestDependency<DesktopLayerUpdateState>({
    activePageIndex: 0,
    activePages: [[item]],
    desktopFrame: { height: 320, left: 0, top: 0, width: 480 },
    deviceResolution: 1,
    folderClosingHandoffIds: new Set(),
    folderPageSize: 9,
    folderSourceGhostedIds: new Set(),
    getDesktopPageRenderMode: () => "interactive",
    getVisibleDesktopPage: (page: readonly (DesktopItem | null)[]) => page.filter((entry): entry is DesktopItem => entry != null),
    gridCols: 1,
    gridRows: 1,
    height: 320,
    iconSize: 64,
    isFolderOpeningPreviewFrameGhosted: () => false,
    isIconOpening: () => false,
    focusedIcon: null,
    isSearchMode: false,
    isTextlessMode: false,
    launchTargetStatusById: {},
    setPageRef: () => {},
    showMissingLaunchTargetBadge: false,
    stageRect: { height: 320, left: 0, top: 0, width: 480 },
    width: 480,
  });
}

function prepareLayerForDesktopQuiescenceTest(
  layer: TestDesktopLayer,
  item: DesktopItem,
): TestNode {
  layer.applyDesktopVisualAlpha = () => {};
  layer.applyDesktopVisualTransform = () => {};
  layer.applyFolderOverlayAlpha = () => {};
  layer.applyFolderOverlayTransform = () => {};
  layer.flushInteractiveBounds = () => {};
  layer.markInteractiveBoundsDirty = () => {};
  layer.singleStageDiagnosticsLayer = asTestDependency<TestDesktopLayer["singleStageDiagnosticsLayer"]>({ update() { return null; } });
  layer.singleStageFolderLayer = asTestDependency<TestDesktopLayer["singleStageFolderLayer"]>({
    folderVisualSession: makeFolderVisualSession(),
    getDesktopSourceGhostedIds: () => new Set(),
    hasVisibleFolderSubstitute: () => false,
  });
  layer.updateSingleStageFolderLayer = () => {};
  layer.pageTrackMotion = {
    control: null,
    grabProgressOffset: 0,
    grabToken: null,
    key: null,
    mode: null,
    settleToken: null,
    targetX: 0,
  };
  layer.visualOwnership = asTestDependency<TestDesktopLayer["visualOwnership"]>({ snapshot: () => [] });
  const node = makeNode(item.id);
  node.item = item;
  node.setState = (nextState) => {
    node.state = nextState;
    node.visible = !nextState.dragging && !nextState.ghosted;
  };
  layer.iconNodes.set(`page:0:${item.id}`, asDesktopIconNode(node));
  return node;
}

export async function runDesktopLayerTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  const { DesktopLayer: DesktopLayerRuntime } = await import("./DesktopLayer.js");
  const DesktopLayer = asTestDependency<TestDesktopLayerConstructor>(DesktopLayerRuntime);
  const {
    resolveDesktopVisualAlpha,
    resolveLaunchpadVisualAlpha,
    resolveLaunchpadVisualTransform,
  } = await import("./desktopRenderPlan.js");
  const {
    createIconBoundsRegistry,
    ICON_BOUNDS_KIND,
    ICON_BOUNDS_VARIANT,
  } = await import("../geometry/iconBoundsRegistry.js");
  const K = ICON_BOUNDS_KIND;
  const V = ICON_BOUNDS_VARIANT;
  makeLayerWithRegistry.iconBoundsRegistry = createIconBoundsRegistry();
  const {
    VisualOwnershipRegistry: FolderVisualOwnershipRegistry,
    makeDesktopSourceVisualKey,
  } = await import("./visualOwnershipRegistry.js");
  const { motionRuntime } = await import("../animation/motionRuntime.js");
  const { flushMotionRuntimeTestFrame } = await import("../animation/motionRuntimeTestHarness.js");
  const { sceneDiagnosticsState } = await import("../../../diagnostics/sceneDiagnosticsState.js");
  const {
    captureDesktopHandoffObservation,
    mergeFolderIdSets,
    shouldFinishFolderHandoff,
    shouldFinishFolderHandoffEntry,
  } = await import("./desktopHandoffState.js");
  const { Container } = await import("pixi.js");
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[DesktopLayer test failed] ${message}`);
  };
  const nearlyEqual = (a: unknown, b: unknown, epsilon = 0.0001) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= epsilon;
  const getBaseAnimation = (target: object, prop: string) => {
    const channel = motionRuntime.getChannel(target, prop);
    return Array.from(channel?.base?.values?.() || [])[0] || null;
  };

  {
    const iconBoundsRegistry = createIconBoundsRegistry();
    const renderRequests: string[] = [];
    const layer = new DesktopLayer({
      iconBoundsRegistry,
      onFolderRenderRequest: (reason) => renderRequests.push(reason),
    });
    layer.singleStageFolderLayer.onRenderRequest("folder-resize-layout");
    assert(renderRequests[0] === "folder-resize-layout", "folder overlay render requests should be forwarded to the desktop surface scheduler");
    assert(
      layer.children.indexOf(layer.folderDropStrokeLayer) < layer.children.indexOf(layer.groupDragLayer as ContainerChild),
      "folder drop stroke should render below the dragged actor"
    );
    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
  }

  {
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new DesktopLayer({ iconBoundsRegistry });
    const item = { id: "responsive-release-target", name: "Responsive Target", type: "app" };
    const targetNode = new Container() as TestReleaseNode;
    targetNode.item = item;
    targetNode.iconSize = 53.4;
    targetNode.position.set(240, 160);
    targetNode.visualWrap = new Container();
    targetNode.visualWrap.position.set(0, -14);
    targetNode.addChild(targetNode.visualWrap);
    layer.visualRoot.addChild(targetNode);
    layer.iconNodes.set(`page:0:${item.id}`, asDesktopIconNode(targetNode));
    const releaseNode = new Container() as TestReleaseNode;
    releaseNode.iconSize = 64;
    releaseNode.visualWrap = new Container();
    releaseNode.addChild(releaseNode.visualWrap);
    layer.groupDragLayer?.addChild(releaseNode);

    const pose = layer.resolveGroupReleasePoint({
      entry: { id: item.id, mode: "return" },
      node: releaseNode,
      state: { stageRect: { height: 320, left: 0, top: 0, width: 480 } },
      target: { area: "desktop", id: null, kind: null, pageIndex: null },
    });
    assert(
      nearlyEqual(pose?.point?.x, 240) &&
        nearlyEqual(pose?.point?.y, 146) &&
        nearlyEqual(pose?.scale?.x, 0.834375) &&
        nearlyEqual(pose?.scale?.y, 0.834375),
      "desktop point releases should resolve the target visual center and responsive visual scale as one pose"
    );
    const resolvedPose = assumePresent(pose);
    releaseNode.position.set(assumePresent(resolvedPose.point).x, assumePresent(resolvedPose.point).y);
    releaseNode.scale.set(assumePresent(resolvedPose.scale).x, assumePresent(resolvedPose.scale).y);
    const targetVisualCenter = layer.groupDragLayer!.toLocal({ x: 0, y: 0 }, targetNode.visualWrap);
    const releaseVisualCenter = layer.groupDragLayer!.toLocal({ x: 0, y: 0 }, releaseNode.visualWrap);
    assert(
      nearlyEqual(releaseVisualCenter.x, targetVisualCenter.x) &&
        nearlyEqual(releaseVisualCenter.y, targetVisualCenter.y),
      "the release ghost visual center should match the live icon visual center at handoff"
    );

    const topEdgePose = layer.resolveGroupReleasePoint({
      entry: { id: "remote-top", mode: "return" },
      node: releaseNode,
      state: {
        gridCols: 3,
        gridRows: 3,
        height: 320,
        stageRect: { height: 320, left: 0, top: 0, width: 480 },
        width: 480,
      },
      target: {
        semanticAnchor: {
          kind: "desktop-page-edge-left",
          laneY: 1 / 6,
          pageIndex: 0,
        },
      },
    });
    const bottomEdgePose = layer.resolveGroupReleasePoint({
      entry: { id: "remote-bottom", mode: "return" },
      node: releaseNode,
      state: {
        gridCols: 3,
        gridRows: 3,
        height: 320,
        stageRect: { height: 320, left: 0, top: 0, width: 480 },
        width: 480,
      },
      target: {
        semanticAnchor: {
          kind: "desktop-page-edge-left",
          laneY: 5 / 6,
          pageIndex: 0,
        },
      },
    });
    assert(
      topEdgePose!.point!.y! < 120 && bottomEdgePose!.point!.y! > 220 &&
        bottomEdgePose!.point!.y! - topEdgePose!.point!.y! > 150,
      "desktop edge releases should resolve their semantic source rows instead of sharing the viewport midpoint"
    );
    layer.singleStageFolderLayer.panelGeometry = {
      height: 220,
      left: 100,
      top: 50,
      width: 300,
    } as NonNullable<typeof layer.singleStageFolderLayer.panelGeometry>;
    layer.singleStageFolderLayer.targetFolderGeometry = {
      grid: { height: 140, left: 130, top: 90, width: 240 } as NonNullable<typeof layer.singleStageFolderLayer.panelGeometry>,
      panel: layer.singleStageFolderLayer.panelGeometry!,
    } as NonNullable<typeof layer.singleStageFolderLayer.targetFolderGeometry>;
    layer.singleStageFolderLayer.resolveStableIconSlotRecord = (anchor) => ({
      height: 56,
      left: 160,
      meta: {
        stageHeight: 320,
        stageRect: { height: 320, left: 0, top: 0, width: 480 },
        stageWidth: 480,
      },
      top: Number(anchor?.index) >= 7 ? 170 : 90,
      width: 56,
    });
    const folderTopEdgePose = layer.resolveGroupReleasePoint({
      entry: { id: "folder-remote-top", mode: "return" },
      node: releaseNode,
      state: { height: 320, stageRect: { height: 320, left: 0, top: 0, width: 480 }, width: 480 },
      target: {
        semanticAnchor: {
          folderId: "folder-a",
          folderPageIndex: 0,
          index: 0,
          itemId: "folder-remote-top",
          kind: "folder-page-edge-left",
          laneY: 0.5,
        },
      },
    });
    const folderBottomEdgePose = layer.resolveGroupReleasePoint({
      entry: { id: "folder-remote-bottom", mode: "return" },
      node: releaseNode,
      state: { height: 320, stageRect: { height: 320, left: 0, top: 0, width: 480 }, width: 480 },
      target: {
        semanticAnchor: {
          folderId: "folder-a",
          folderPageIndex: 0,
          index: 7,
          itemId: "folder-remote-bottom",
          kind: "folder-page-edge-left",
          laneY: 0.5,
        },
      },
    });
    assert(
      nearlyEqual(folderTopEdgePose?.point?.y, 118) &&
        nearlyEqual(folderBottomEdgePose?.point?.y, 198),
      "folder edge releases should align to stable source slots instead of normalized viewport lanes"
    );
    const liveFolderTarget = new Container() as TestReleaseNode;
    liveFolderTarget.item = { id: "folder-visible-stable", name: "Folder Visible Stable", type: "app" };
    liveFolderTarget.iconSize = 56;
    liveFolderTarget.position.set(330, 250);
    liveFolderTarget.visualWrap = new Container();
    liveFolderTarget.addChild(liveFolderTarget.visualWrap);
    layer.singleStageFolderLayer.iconNodes.set("folder-a:folder-visible-stable", asDesktopIconNode(liveFolderTarget));
    layer.singleStageFolderLayer.pageTrack.addChild(liveFolderTarget);
    const stableFolderSlotPose = layer.resolveGroupReleasePoint({
      entry: { id: "folder-visible-stable", mode: "return" },
      node: releaseNode,
      state: { height: 320, stageRect: { height: 320, left: 0, top: 0, width: 480 }, width: 480 },
      target: {
        area: "folder",
        folderId: "folder-a",
        id: "folder-visible-stable",
        pageIndex: 0,
        semanticAnchor: {
          folderId: "folder-a",
          folderPageIndex: 0,
          index: 0,
          itemId: "folder-visible-stable",
          kind: "folder-open-slot",
        },
      },
    });
    assert(
      nearlyEqual(stableFolderSlotPose?.point?.x, 188) &&
        nearlyEqual(stableFolderSlotPose?.point?.y, 118),
      "visible folder returns should use the same stable slot as the hidden real icon instead of chasing its live spring"
    );
    const egressPose = layer.resolveGroupReleasePoint({
      entry: {
        id: item.id,
        mode: "return",
        visibilityPolicy: { folderId: "folder-a", kind: "desktop-occluded-egress" },
      },
      node: releaseNode,
      state: { height: 320, stageRect: { height: 320, left: 0, top: 0, width: 480 }, width: 480 },
      target: { area: "desktop", id: item.id, pageIndex: 0 },
    });
    assert(
      egressPose && (
        egressPose.point!.x! < 100 || egressPose.point!.x! > 400 ||
        egressPose.point!.y! < 50 || egressPose.point!.y! > 270
      ),
      "desktop actors obscured by an open folder should animate beyond the panel instead of landing underneath it"
    );

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new DesktopLayer({ iconBoundsRegistry });
    const movingItem = { id: "desktop-release-backed-node", name: "Desktop Release Backed", type: "app" };
    const neighborItem = { id: "desktop-release-neighbor", name: "Desktop Release Neighbor", type: "app" };
    const baseState = {
      ...makeDesktopQuiescenceState(movingItem),
      activePages: [[movingItem, neighborItem]],
      desktopFrame: { height: 240, left: 0, top: 0, width: 480 },
      gridCols: 2,
      gridRows: 1,
      height: 240,
      stageRect: { height: 240, left: 0, top: 0, width: 480 },
      width: 480,
    };
    layer.update(baseState);
    for (let index = 0; index < 40; index += 1) {
      motionRuntime.step(0.05);
      layer.update(baseState);
    }
    const movingKey = `page:0:${movingItem.id}`;
    const movingNode = assumePresent(layer.iconNodes.get(movingKey));
    const initialX = movingNode?.x;
    const releaseState = {
      ...baseState,
      activePages: [[neighborItem, movingItem]],
      dragMeta: {
        draggedIds: [movingItem.id],
        item: movingItem,
        source: { index: 0, pageIndex: 0, type: "page" },
      },
      groupDragState: { phase: "dragging" },
      groupTransferOwnedItemIds: new Set([movingItem.id]),
    };
    layer.update(releaseState);
    const targetRecord = assumePresent(iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "desktop",
      id: movingItem.id,
      pageIndex: 0,
    }));
    const expectedX = targetRecord.left + targetRecord.width / 2;

    assert(initialX !== expectedX, "desktop release-backed setup should move the hidden real icon to a new slot");
    assert(movingNode.visible === false && movingNode.state?.dragging === true, "the shared drag owner should keep the real desktop icon hidden through visual release");
    assert(nearlyEqual(movingNode.x, expectedX), "the hidden real desktop icon should snap to the release target before it is revealed");
    assert(!getBaseAnimation(movingNode, "x"), "the hidden real desktop icon should not keep a layout spring that can twitch after reveal");

    const expectedY = targetRecord.top + targetRecord.height / 2;
    movingNode.position.set(initialX, movingNode.y);
    const releaseNode = new Container() as TestReleaseNode;
    releaseNode.iconSize = 64;
    releaseNode.visualWrap = new Container();
    const stableReleasePose = layer.resolveGroupReleasePoint({
      entry: { id: movingItem.id, mode: "move" },
      node: releaseNode,
      state: releaseState,
      target: {
        area: "desktop",
        id: movingItem.id,
        index: 1,
        pageIndex: 0,
        semanticAnchor: {
          index: 1,
          itemId: movingItem.id,
          kind: "desktop-slot",
          pageIndex: 0,
        },
      },
    });
    assert(
      nearlyEqual(stableReleasePose?.point?.x, expectedX) &&
        nearlyEqual(stableReleasePose?.point?.y, expectedY),
      "desktop point releases should resolve the committed stable slot instead of chasing the hidden node's stale transform"
    );
    releaseNode.destroy();

    layer.update({
      ...releaseState,
      dragMeta: null,
      groupDragState: null,
      groupTransferOwnedItemIds: new Set(),
    });
    assert(
      (movingNode.visible as boolean) === true && nearlyEqual(movingNode.x, expectedX),
      "a structural ownership release should reveal the real icon only after snapping its stale node to the committed slot"
    );

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    const item = { id: "group-transfer-ownership-app", name: "Ownership App", type: "app" };
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const node = makeNode(item.id);
    node.item = item;
    node.state = { ...node.state, dragging: false, ghosted: false, item };
    node.visible = true;
    layer.iconNodes.set(`page:0:${item.id}`, asDesktopIconNode(node));
    layer.groupDragLayer = asTestDependency({
      syncVisualOwnership(group: unknown) {
        return group
          ? { folderShellIds: new Set(), itemIds: new Set([item.id]) }
          : { folderShellIds: new Set(), itemIds: new Set() };
      },
    });

    layer.applyImmediateGroupTransferOwnership({ key: "group-transfer-ownership" });
    assert(
      node.state.ghosted === true && (node.visible as boolean) === false,
      "group transfer acquisition should hide the real desktop icon immediately"
    );
    layer.applyImmediateGroupTransferOwnership(null);
    assert(
      (node.state.ghosted as boolean) === false && node.visible === true,
      "group transfer release should reveal the real desktop icon in the same ownership transaction"
    );
  }

  {
    motionRuntime.reset();
    const item = { id: "resize-snap-app", name: "Resize Snap", type: "app" };
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const node = prepareLayerForDesktopQuiescenceTest(layer, item);
    const initialState = makeDesktopQuiescenceState(item);
    layer.update(initialState);
    for (let frame = 0; frame < 600 && motionRuntime.hasActiveWork(); frame += 1) {
      motionRuntime.step(1 / 60);
    }

    const resizedState = {
      ...initialState,
      desktopFrame: { ...initialState.desktopFrame, width: 640 },
      snapDesktopLayout: true,
      stageRect: { ...initialState.stageRect, width: 640 },
      width: 640,
    };
    layer.update(resizedState);
    const resizedEntry = assumePresent(assumePresent(layer.lastDesktopRenderPlan).entries[0]);

    assert(
      nearlyEqual(node.position.x, resizedEntry.layoutTarget.x) &&
        nearlyEqual(node.position.y, resizedEntry.layoutTarget.y),
      "window resize layout sync should snap an existing desktop icon to its new target"
    );
    assert(
      !getBaseAnimation(node, "x") && !getBaseAnimation(node, "y"),
      "window resize layout sync should not leave a delayed icon layout spring"
    );
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const fillerA = { id: "cancel-layout-filler-a", name: "Filler A", type: "app" };
    const fillerB = { id: "cancel-layout-filler-b", name: "Filler B", type: "app" };
    const draggedA = { id: "cancel-layout-dragged-a", name: "Dragged A", type: "app" };
    const draggedB = { id: "cancel-layout-dragged-b", name: "Dragged B", type: "app" };
    const folderChild = { id: "cancel-layout-folder-child", name: "Folder Child", type: "app" };
    const folder = {
      childPages: [[folderChild]],
      children: [folderChild],
      id: "cancel-layout-folder",
      name: "Folder",
      type: "folder",
    };
    const originalItems = [fillerA, fillerB, draggedA, draggedB, folder];
    const projectedItems = [fillerA, fillerB, folder, draggedA, draggedB];
    const groupPresentation = {
      key: "cancel-layout-group",
      presentationPlan: {
        actors: [draggedA, draggedB, folderChild].map((item) => ({
          key: `actor:${item.id}`,
          memberIds: [item.id],
          role: "item",
        })),
      },
    };
    const layer = new DesktopLayer({ iconBoundsRegistry });
    layer.updateGroupDragLayer = () => {};
    const baseState = {
      ...makeDesktopQuiescenceState(folder),
      activePages: [originalItems],
      desktopFrame: { height: 260, left: 0, top: 0, width: 1000 },
      gridCols: 5,
      gridRows: 1,
      height: 260,
      stageRect: { height: 260, left: 0, top: 0, width: 1000 },
      width: 1000,
    };
    layer.update(baseState);
    for (let frame = 0; frame < 600 && motionRuntime.hasActiveWork(); frame += 1) {
      motionRuntime.step(1 / 60);
    }

    const folderNode = assumePresent(layer.iconNodes.get(`page:0:${folder.id}`));
    const originalFolderX = folderNode.x;
    const draggingGroup = {
      ...groupPresentation,
      phase: "dragging",
    };
    layer.update({
      ...baseState,
      activePages: [projectedItems],
      groupDragState: draggingGroup,
    });
    for (let frame = 0; frame < 8; frame += 1) motionRuntime.step(1 / 60);
    assert(
      !nearlyEqual(folderNode.x, originalFolderX),
      "cancel return setup should project the folder into the vacated earlier slot"
    );

    const returningGroup = {
      ...groupPresentation,
      phase: "returning",
    };
    layer.update({
      ...baseState,
      groupDragState: returningGroup,
    });
    layer.applyImmediateGroupTransferOwnership(returningGroup);
    for (let frame = 0; frame < 600 && motionRuntime.hasActiveWork(); frame += 1) {
      motionRuntime.step(1 / 60);
    }

    assert(
      nearlyEqual(folderNode.x, originalFolderX),
      "canceling a mixed desktop/folder-child drag should let the folder shell finish returning to its original slot"
    );

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const target = { id: "created-target-layout-target", name: "Target", type: "app" };
    const dragged = { id: "created-target-layout-dragged", name: "Dragged", type: "app" };
    const folder = {
      childPages: [[target, dragged]],
      children: [target, dragged],
      id: "created-target-layout-folder",
      name: "New Folder",
      type: "folder",
    };
    const layer = new DesktopLayer({ iconBoundsRegistry });
    layer.updateGroupDragLayer = () => {};
    layer.update({
      ...makeDesktopQuiescenceState(folder),
      groupDragState: {
        entries: [
          { item: dragged, originKind: "lead" },
          { item: target, originKind: "folder-create-target" },
        ],
        key: "created-target-layout",
        phase: "releasing",
        runtimePlan: {
          entries: [target, dragged].map((item, slotIndex) => ({
            id: item.id,
            mode: "created-folder",
            target: {
              folderId: folder.id,
              kind: "created-folder",
              slotIndex,
            },
          })),
          key: "created-target-layout-plan",
        },
        totalCount: 1,
      },
      groupTransferOwnedFolderShellIds: new Set([folder.id]),
      groupTransferOwnedItemIds: new Set([target.id, dragged.id]),
    });
    const folderNode = layer.findIconNodeByItemId(folder.id);
    const folderEntry = assumePresent(layer.lastDesktopRenderPlan).entries.find((entry) => entry.item.id === folder.id);
    assert(folderNode?.state?.ghosted === true, "created-folder release target should remain hidden behind the release visuals");
    assert(
      folderNode?.__folderSourceGhostedByOwnership === true,
      "created-folder shell ownership should be recorded as the source of the folder ghost"
    );
    assert(
      nearlyEqual(folderNode?.position?.x, folderEntry?.layoutTarget?.x) &&
        nearlyEqual(folderNode?.position?.y, folderEntry?.layoutTarget?.y) &&
        !getBaseAnimation(folderNode, "x") &&
        !getBaseAnimation(folderNode, "y"),
      "created-folder release target should start at stable layout without the ordinary new-node entry spring"
    );
    layer.updateInteraction({
      ...makeDesktopQuiescenceState(folder),
      groupDragState: null,
      groupTransferOwnedFolderShellIds: new Set(),
      groupTransferOwnedItemIds: new Set(),
    });
    assert(
      (folderNode?.state?.ghosted as boolean | undefined) === false && folderNode?.visible === true,
      "releasing created-folder shell ownership should reveal the real folder in the same interaction lane"
    );
    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const dragged = { id: "created-release-dragged", name: "Dragged", type: "app" };
    const target = { id: "created-release-target", name: "Target", type: "app" };
    const folder = {
      childPages: [[target, dragged]],
      children: [target, dragged],
      id: "created-release-folder",
      name: "New Folder",
      type: "folder",
    };
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.folderDropFrameSuppressedIds = new Set();
    layer.updateFolderDropTargetLayers = () => {};
    layer.applyFolderSourceGhosting = () => {};
    layer.updateGroupDragLayer = () => {};
    layer.singleStageDiagnosticsLayer = asTestDependency({ update() {} });
    layer.dragHitDebugLayer = asTestDependency({ update() {} });

    const makePreparedNode = (item: DesktopItem) => {
      const node = makeNode(item.id);
      node.item = item;
      node.renderable = true;
      node.setState = (nextState) => {
        node.state = nextState;
        node.visible = !nextState.dragging && !nextState.ghosted;
      };
      return node;
    };
    const draggedNode = prepareLayerForDesktopQuiescenceTest(layer, dragged);
    const targetNode = makePreparedNode(target);
    layer.iconNodes.set(`page:0:${target.id}`, asDesktopIconNode(targetNode));

    const baseState = {
      ...makeDesktopQuiescenceState(dragged),
      activePages: [[dragged, target]],
      desktopFrame: { height: 320, left: 0, top: 0, width: 480 },
      gridCols: 2,
      gridRows: 1,
      height: 320,
      stageRect: { height: 320, left: 0, top: 0, width: 480 },
      width: 480,
    };
    layer.update(baseState);
    draggedNode.alpha = 1;
    targetNode.alpha = 1;
    draggedNode.visible = true;
    targetNode.visible = true;
    draggedNode.renderable = true;
    targetNode.renderable = true;

    const folderNode = makePreparedNode(folder);
    layer.iconNodes.set(`page:0:${folder.id}`, asDesktopIconNode(folderNode));
    const releaseEntries = [
      { item: dragged, originKind: "desktop" },
      { item: target, originKind: "folder-create-target" },
    ];
    layer.update({
      ...baseState,
      activePages: [[folder]],
      groupDragState: {
        entries: releaseEntries,
        key: "created-release-brightness",
        phase: "releasing",
        runtimePlan: {
          entries: releaseEntries.map((entry, index) => ({
            id: entry.item.id,
            mode: "created-folder",
            order: index,
            target: { folderId: folder.id, kind: "created-folder", slotIndex: index },
          })),
          key: "created-release-brightness-plan",
        },
        totalCount: 1,
      },
      groupTransferOwnedFolderShellIds: new Set([folder.id]),
      groupTransferOwnedItemIds: new Set([dragged.id, target.id]),
    });

    assert(
      (targetNode.visible as boolean) === false && (targetNode.renderable as boolean) === false && targetNode.alpha === 0,
      "created-folder release should retire the old target node immediately so it cannot overlap the full-alpha release ghost"
    );
    assert(
      (draggedNode.visible as boolean) === false && (draggedNode.renderable as boolean) === false && draggedNode.alpha === 0,
      "created-folder release should retire every real source node immediately once the release layer owns their visuals"
    );
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const item = { id: "pointer-cache-app", name: "Pointer Cache", type: "app" };
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const node = prepareLayerForDesktopQuiescenceTest(layer, item);
    layer.folderDropFrameSuppressedIds = new Set();
    layer.updateFolderDropTargetLayers = () => {};
    layer.applyFolderSourceGhosting = () => {};
    layer.updateGroupDragLayer = () => {};
    layer.singleStageDiagnosticsLayer.update = asTestDependency(() => null);
    layer.dragHitDebugLayer = asTestDependency({ update() {} });

    const entries: unknown[] = [];
    const dragMeta = {
      draggedIds: [item.id],
      item,
      source: { index: 0, pageIndex: 0, type: "page" },
    };
    const groupDragState = {
      center: { x: 180, y: 160 },
      entries,
      phase: "dragging",
      pointer: { x: 180, y: 160 },
      totalCount: 1,
    };
      const baseState = {
        ...makeDesktopQuiescenceState(item),
        dragMeta,
        groupDragState,
        groupTransferOwnedItemIds: new Set([item.id]),
      };

      let interactionBeforeStructureError: unknown = null;
      try {
        layer.updateInteraction(baseState);
      } catch (error) {
        interactionBeforeStructureError = error;
      }
      assert(
        (interactionBeforeStructureError as Error | null)?.message
          === "DesktopLayer.updateInteraction requires an initialized structural render plan",
        "interaction invalidation before the initial structural frame should fail instead of hiding a full plan build"
      );

      const structureWork = layer.updateStructure(baseState);
    const firstPlan = assumePresent(layer.lastDesktopRenderPlan);
    assert(structureWork.fullPlanBuilds === 1, "structural invalidation should build exactly one desktop plan");
    const pointerWork = layer.updateInteraction({
      ...baseState,
      groupDragState: {
        ...groupDragState,
        center: { x: 260, y: 220 },
        pointer: { x: 260, y: 220 },
      },
    });
    const stablePointerPlan = assumePresent(layer.lastDesktopRenderPlan);
    assert(pointerWork.fullPlanBuilds === 0, "pointer-only interaction should not rebuild the desktop plan");
    assert(
      stablePointerPlan.revision === firstPlan.revision,
      `pointer-only interaction should retain the structural plan revision (${firstPlan.revision} -> ${stablePointerPlan.revision})`
    );
    assert(
      stablePointerPlan.entries === firstPlan.entries,
      "pointer-only group drag updates should reuse the structural desktop plan"
    );

    const targetWork = layer.updateStructure({
      ...baseState,
      dragFolderTargetId: "folder-target",
      groupDragState: {
        ...groupDragState,
        center: { x: 300, y: 240 },
        pointer: { x: 300, y: 240 },
      },
    });
    assert(
      assumePresent(layer.lastDesktopRenderPlan).entries !== stablePointerPlan.entries,
      "a changed folder target should invalidate the pointer-only desktop plan cache"
    );
    assert(targetWork.fullPlanBuilds === 1, "a changed drag target should rebuild one structural plan");
    assert(assumePresent(layer.lastDesktopRenderPlan).revision > stablePointerPlan.revision, "rebuilt interaction plans should advance the plan revision");
    assert(node.state.dragging === true, "pointer-only plan test should keep the dragged icon state active");
    motionRuntime.reset();
  }

  {
    const item = { id: "single-observation-app", name: "Single Observation", type: "app" };
    const layer = makeLayer(DesktopLayer, makePageTrack([]));
    prepareLayerForDesktopQuiescenceTest(layer, item);
    layer.folderDropFrameSuppressedIds = new Set();
    layer.updateFolderDropTargetLayers = () => {};
    layer.updateGroupDragLayer = () => {};
    layer.singleStageDiagnosticsLayer.update = asTestDependency(() => null);
    layer.dragHitDebugLayer = asTestDependency({ update() {} });
    let sessionSnapshotReads = 0;
    let overlayOwnershipReads = 0;
    let visualOwnershipReads = 0;
    layer.singleStageFolderLayer.folderVisualSession = {
      snapshot() {
        sessionSnapshotReads += 1;
        return { closing: null };
      },
    } as unknown as TestDesktopLayer["singleStageFolderLayer"]["folderVisualSession"];
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => {
      overlayOwnershipReads += 1;
      return new Set();
    };
    layer.visualOwnership = asTestDependency({
      snapshot() {
        visualOwnershipReads += 1;
        return [];
      },
    });

    layer.updateStructure(makeDesktopQuiescenceState(item));

    assert(
      sessionSnapshotReads === 2 && overlayOwnershipReads === 2 && visualOwnershipReads === 2,
      "one desktop structural frame should use one planning observation and one post-overlay committed observation",
    );
  }

  {
    const canonicalIds = mergeFolderIdSets(
      new Set(["folder-a"]),
      ["folder-b", "folder-c"]
    );
    assert(canonicalIds.size === 3 && canonicalIds.has("folder-a"), "canonical handoff ids should compose without a singular compatibility field");
    let singularRejected = false;
    try {
      mergeFolderIdSets(asTestDependency<ReadonlySet<string>>("folder-a"));
    } catch (error) {
      singularRejected = error instanceof TypeError;
    }
    assert(singularRejected, "singular folder ids should be rejected at the canonical Set boundary");
    const emptyObservation = {
      activeClosingFolderIds: new Set<string>(),
      desktopSourceGhostedIds: new Set<string>(),
      visibleSubstituteFolderIds: new Set<string>(),
    };
    assert(
      !shouldFinishFolderHandoff(
        { folderClosingHandoffIds: new Set(["folder-b"]) },
        emptyObservation
      ),
      "a canonical closing handoff Set should keep the desktop handoff alive"
    );
    assert(
      !shouldFinishFolderHandoffEntry(
        { folderClosingHandoffIds: new Set(["folder-a"]) },
        emptyObservation,
        "folder-a"
      ),
      "a canonical closing handoff entry should remain active"
    );
    const observed = captureDesktopHandoffObservation({
      folderVisualSession: makeFolderVisualSession({ active: true, folderId: "folder-a" }),
      getDesktopSourceGhostedIds: () => new Set(["folder-b"]),
      hasVisibleFolderSubstitute: (folderId: string) => folderId === "folder-c",
    }, canonicalIds);
    assert(
      observed.activeClosingFolderIds.has("folder-a") &&
        observed.desktopSourceGhostedIds.has("folder-b") &&
        observed.visibleSubstituteFolderIds.has("folder-c"),
      "one observation should capture every mutable folder-layer handoff fact used by the frame"
    );
    {
      // A stale closing id keeps a never-revealed handoff entry alive while no
      // substitute covers the folder: reconcile must REVEAL it in place (real icon
      // shown) WITHOUT retiring — retiring would let the stale id recreate + re-hide
      // it every frame (the icon/label flash regression).
      const folder = makeNode("folder");
      folder.item = { id: "folder-a", type: "folder" };
      const pageTrack = makePageTrack([folder]);
      const layer = makeLayer(DesktopLayer, pageTrack);
      layer.singleStageFolderLayer = asTestDependency({
        folderVisualSession: makeFolderVisualSession(),
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: () => false,
      });
      layer.ensureFolderHandoffNode("folder-a", folder, { x: 0, y: 0 }, { revealLabel: false });
      const entry = assumePresent(layer.getFolderHandoffEntry("folder-a"));
      assert(folder.visualWrap.visible === false && entry.visualReleased !== true, "test setup: a fresh handoff entry hides the real icon");

      layer.reconcileFolderHandoffEntry(makeDesktopHandoffState({
        closingFolderIds: ["folder-a"],
      }), entry);
      assert(layer.getFolderHandoffEntry("folder-a") === entry, "a stale-id orphan should be healed in place, not retired (avoids the recreate/flash loop)");
      assert((entry.visualReleased as boolean) === true && (folder.visualWrap.visible as boolean) === true, "a stale-id orphan with no visible substitute should reveal the real folder icon");
    }

    {
      // While a visible substitute still covers the folder (normal close handoff),
      // the entry stays hidden — no premature reveal / flash.
      const folder = makeNode("folder");
      folder.item = { id: "folder-a", type: "folder" };
      const pageTrack = makePageTrack([folder]);
      const layer = makeLayer(DesktopLayer, pageTrack);
      layer.singleStageFolderLayer = asTestDependency({
        folderVisualSession: makeFolderVisualSession({ folderId: "folder-a" }),
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: (folderId: string) => folderId === "folder-a",
      });
      layer.ensureFolderHandoffNode("folder-a", folder, { x: 0, y: 0 }, { revealLabel: false });
      const entry = assumePresent(layer.getFolderHandoffEntry("folder-a"));

      layer.reconcileFolderHandoffEntry(makeDesktopHandoffState({
        closingFolderIds: ["folder-a"],
      }), entry);
      assert(layer.getFolderHandoffEntry("folder-a") === entry && entry.visualReleased !== true && folder.visualWrap.visible === false, "a closing handoff with a visible substitute should keep the real icon hidden");
    }

    {
      // If the close finishes while a desktop page turn is still moving, the
      // raised handoff node is the only stable desktop source. Do not reveal or
      // retire it until the pageTrack has reached the new page target.
      const folder = makeNode("folder");
      folder.item = { id: "folder-a", type: "folder" };
      const pageTrack = makePageTrack([folder]);
      pageTrack.x = -120;
      const layer = makeLayer(DesktopLayer, pageTrack);
      layer.singleStageFolderLayer = asTestDependency({
        folderVisualSession: makeFolderVisualSession(),
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: () => false,
      });
      layer.pageTrackMotion = asTestDependency({
        control: { completed: false, released: false },
        targetX: -480,
      });
      layer.ensureFolderHandoffNode("folder-a", folder, { x: 0, y: 0 }, { revealLabel: false });
      const entry = assumePresent(layer.getFolderHandoffEntry("folder-a"));

      const handoffState = makeDesktopHandoffState();
      assert(!layer.reconcileFolderHandoffEntry(handoffState, entry), "in-flight desktop page motion should block handoff cleanup");
      assert(entry.cleanupFrame == null, "blocked handoff cleanup should not schedule a cleanup frame");
      assert(folder.visualWrap.visible === false, "blocked handoff cleanup should keep real folder artwork hidden");

      layer.pageTrackMotion.control = asTestDependency({ completed: true, released: false });
      assert(!layer.reconcileFolderHandoffEntry(handoffState, entry), "pageTrack geometry that has not reached target should still block cleanup");
      assert(entry.cleanupFrame == null, "target mismatch should keep the handoff entry alive");

      pageTrack.x = -480;
      assert(layer.reconcileFolderHandoffEntry(handoffState, entry), "settled desktop page motion should allow handoff cleanup");
      assert((entry.cleanupFrame as { cancelled: boolean } | null)?.cancelled === false, "settled handoff cleanup should schedule the normal cleanup frame");
      flushMotionRuntimeTestFrame(motionRuntime);
      assert(!layer.getFolderHandoffEntry("folder-a"), "settled cleanup frame should clear the handoff entry");
      motionRuntime.reset();
    }

    {
      // A released handoff entry can linger for an after-frame cleanup while the
      // Vue closing id is still retained. That entry must not re-sync the folder
      // handoff node or reset the active hover frame.
      const folder = { id: "folder-a", type: "folder" };
      const hoverState = {
        key: "folder-hover-released",
        phase: "hover",
        targetId: folder.id,
        targetType: "folder",
      };
      const pageTrack = makePageTrack([]);
      const layer = makeLayer(DesktopLayer, pageTrack);
      const node = prepareLayerForDesktopQuiescenceTest(layer, folder);
      const releasedEntry = {
        cleanupFrame: { cancelled: false },
        folderId: folder.id,
        labelRevealStarted: false,
        node,
        originalIndex: 0,
        suppressLabelReveal: false,
        visualHidden: false,
        visualReleased: true,
      };
      layer.getFolderHandoffNodes().set(folder.id, asTestDependency(releasedEntry));
      layer.primaryFolderHandoffId = folder.id;

      layer.update({
        ...makeDesktopQuiescenceState(folder),
        dragFolderHoverState: hoverState,
        dragFolderTargetId: folder.id,
        folderClosingHandoffIds: new Set([folder.id]),
        folderSourceGhostedIds: new Set([folder.id]),
      });

      const entry = assumePresent(assumePresent(layer.lastDesktopRenderPlan).entries[0]);
      assert(entry.isActiveFolderClosingHandoff === true, "test setup should retain the closing id while re-hovering the folder");
      assert(entry.isFolderClosingHandoff === false, "released handoff entries should not be treated as hover-blocking handoffs");
      assert(node.state.folderHoverState === null, "folder hover should be drawn by the independent drop target layer instead of IconNode");
      assert(node.state.dropTarget === false, "folder drop target selection frame should stay disabled on IconNode");
      assert(assumePresent(layer.lastDesktopRenderPlan).folderDropTarget?.targetId === folder.id, "released handoff entries should expose a folder drop target for the independent layer");
      assert(node.state.ghosted === false && node.visible === true, "released handoff entries should keep the real folder visible while source ghosting settles");
      assert(node.resetFolderPreviewAfterGhostCount === 0, "released handoff entries should not re-sync and reset the folder hover preview");
    }
  }

  {
    motionRuntime.reset();
    const firstPageNode = makeNode("first-page-app");
    const secondPageNode = makeNode("second-page-app");
    firstPageNode.alpha = 1;
    firstPageNode.item = { id: "first-page-app", name: "First Page", type: "app" };
    firstPageNode.renderable = true;
    firstPageNode.visible = true;
    secondPageNode.alpha = 1;
    secondPageNode.item = { id: "second-page-app", name: "Second Page", type: "app" };
    secondPageNode.renderable = true;
    secondPageNode.visible = true;

    const pageTrack = makePageTrack([firstPageNode, secondPageNode]);
    pageTrack.x = -480;
    const layer = makeLayer(DesktopLayer, pageTrack);
    const iconBoundsRegistry = createIconBoundsRegistry();
    layer.iconBoundsRegistry = iconBoundsRegistry;
    layer.applyDesktopVisualAlpha = () => {};
    layer.applyDesktopVisualTransform = () => {};
    layer.applyFolderOverlayAlpha = () => {};
    layer.applyFolderOverlayTransform = () => {};
    layer.flushInteractiveBounds = () => {};
    layer.markInteractiveBoundsDirty = () => {};
    layer.singleStageDiagnosticsLayer = asTestDependency({ update() {} });
    layer.singleStageFolderLayer = asTestDependency({
      folderVisualSession: makeFolderVisualSession(),
      getDesktopSourceGhostedIds: () => new Set(),
      hasVisibleFolderSubstitute: () => false,
    });
    layer.updateSingleStageFolderLayer = () => {};
    layer.pageTrackMotion = asTestDependency({
      control: null,
      grabProgressOffset: 0,
      grabToken: null,
      key: null,
      mode: null,
      settleToken: null,
    });
    layer.iconNodes.set("page:0:first-page-app", asDesktopIconNode(firstPageNode));
    layer.iconNodes.set("page:1:second-page-app", asDesktopIconNode(secondPageNode));
    layer.lastDesktopRenderPlan = asTestDependency({
      clearLaunchArea: "desktop",
      pageTrack: { scope: "desktop" },
      signature: "desktop-before-search",
    });
    iconBoundsRegistry.registerBounds(
      K.LAUNCH,
      V.RENDERED,
      { area: "desktop", id: "first-page-app", pageIndex: 0 },
      { height: 64, left: 0, top: 0, width: 64 },
      { area: "desktop", id: "first-page-app", pageIndex: 0 }
    );
    iconBoundsRegistry.registerBounds(
      K.LAUNCH,
      V.RENDERED,
      { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 },
      { height: 64, left: 96, top: 0, width: 64 },
      { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 }
    );

    try {
      layer.update({
        activePageIndex: 0,
        activePages: [[{ id: "search-result-app", name: "Search Result", type: "app" }]],
        desktopFrame: { height: 320, left: 0, top: 0, width: 480 },
        deviceResolution: 1,
        folderClosingHandoffIds: new Set(),
        folderPageSize: 9,
        folderSourceGhostedIds: new Set(),
        getDesktopPageRenderMode: () => "interactive",
        getVisibleDesktopPage: (page: readonly DesktopItem[]) => page,
        gridCols: 1,
        gridRows: 1,
        height: 320,
        iconSize: 64,
        isFolderOpeningPreviewFrameGhosted: () => false,
        isIconOpening: () => false,
        focusedIcon: null,
        isSearchMode: true,
        isTextlessMode: false,
        launchTargetStatusById: {},
        setPageRef: () => {},
        shouldSnapTrack: false,
        showMissingLaunchTargetBadge: false,
        stageRect: { height: 320, left: 0, top: 0, width: 480 },
        width: 480,
      });

      assert(pageTrack.x === 0, "scope change into search should still snap the page track to the search page");
      assert(!pageTrack.children.includes(firstPageNode), "desktop first-page node should be detached immediately on search scope switch");
      assert(!pageTrack.children.includes(secondPageNode), "desktop current-page node should be detached immediately on search scope switch");
      assert((firstPageNode.visible as boolean) === false && (firstPageNode.renderable as boolean) === false, "detached first-page node should be hidden without a fade tail");
      assert((secondPageNode.visible as boolean) === false && (secondPageNode.renderable as boolean) === false, "detached current-page node should be hidden without a fade tail");
      assert(!layer.iconNodes.has("page:0:first-page-app") && !layer.iconNodes.has("page:1:second-page-app"), "old desktop nodes should leave the icon node registry");

      const searchNode = layer.iconNodes.get("search:0:search-result-app");
      const searchEntry = assumePresent(layer.lastDesktopRenderPlan).entries.find((entry) => entry.key === "search:0:search-result-app");
      assert(searchNode, "search scope switch should create the new search node");
      assert(pageTrack.children.includes(searchNode), "new search node should remain mounted in the page track");
      assert(searchNode.alpha === 0, "new search node should stay at the fade start alpha until the motion runtime advances");
      assert(searchEntry && searchNode.y > searchEntry.layoutTarget.y, "new search node should keep the ordinary entry motion");
      assert(
        !iconBoundsRegistry.getBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: "first-page-app", pageIndex: 0 }),
        "scope change into search should clear outgoing desktop launch bounds"
      );
      assert(
        iconBoundsRegistry.getBounds(K.LAUNCH, V.RENDERED, { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 }),
        "top-level scope changes should preserve folder launch bounds"
      );

      iconBoundsRegistry.registerBounds(
        K.LAUNCH,
        V.RENDERED,
        { area: "search", id: "search-result-app", pageIndex: 0 },
        { height: 64, left: 0, top: 0, width: 64 },
        { area: "search", id: "search-result-app", pageIndex: 0 }
      );
      layer.update(makeDesktopQuiescenceState({ id: "returned-desktop-app", name: "Returned Desktop", type: "app" }));

      assert(
        !iconBoundsRegistry.getBounds(K.LAUNCH, V.RENDERED, { area: "search", id: "search-result-app", pageIndex: 0 }),
        "scope change back to desktop should clear outgoing search launch bounds"
      );
      assert(
        iconBoundsRegistry.getBounds(K.LAUNCH, V.RENDERED, { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 }),
        "returning to desktop should preserve folder launch bounds"
      );
    } finally {
      iconBoundsRegistry.clearBounds();
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const folder = { id: "retiring-folder", name: "Retiring Folder", type: "folder" };
    const pageTrack = makePageTrack([]);
    pageTrack.x = 0;
    const layer = makeLayer(DesktopLayer, pageTrack);
    const folderNode = prepareLayerForDesktopQuiescenceTest(layer, folder);
    folderNode.alpha = 1;
    folderNode.renderable = true;
    folderNode.visible = true;
    pageTrack.addChild(asTestDependency<ContainerChild>(folderNode));
    layer.onFolderRenderRequest = () => {};

    try {
      const desktopState = makeDesktopQuiescenceState(folder);
      layer.update(desktopState);
      const layoutTarget = assumePresent(layer.lastDesktopRenderPlan).entries[0]?.layoutTarget;
      layer.ensureFolderHandoffNode(folder.id, folderNode, layoutTarget, { revealLabel: false });

      layer.update({
        ...desktopState,
        activePages: [[]],
      });

      assert(
        layer.startClosingFolderHandoffNow(folder.id, { revealLabel: false }) === false,
        "a late folder handoff should not reclaim a node that already left the desktop render plan"
      );
      motionRuntime.reset();

      assert(!pageTrack.children.includes(folderNode), "a retired folder should not survive exit-motion cancellation as an orphan page-track child");
      assert((folderNode.visible as boolean) === false && (folderNode.renderable as boolean) === false, "a retired folder should stay hidden after a late handoff");
      assert(!layer.getFolderHandoffEntry(folder.id), "retirement should discard the stale folder handoff entry");
    } finally {
      motionRuntime.reset();
    }
  }

  {
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    try {
      const pageTrack = makePageTrack([]);
      const layer = makeLayer(DesktopLayer, pageTrack);
      let refreshCount = 0;
      let folderRefreshCount = 0;
      layer.refreshInteractiveBounds = () => {
        refreshCount += 1;
      };
      layer.singleStageFolderLayer.refreshRegisteredIconBounds = (() => {
        folderRefreshCount += 1;
      }) as unknown as typeof layer.singleStageFolderLayer.refreshRegisteredIconBounds;

      layer.markInteractiveBoundsDirty();
      layer.markInteractiveBoundsDirty();
      assert(refreshCount === 0, "bounds dirty should wait until the runtime frame-end flush");
      flushMotionRuntimeTestFrame(motionRuntime);
      assert((refreshCount as number) === 1, "bounds dirty should coalesce repeated marks into one refresh");
      assert(folderRefreshCount === 1, "bounds dirty flush should refresh folder overlay bounds once");
      assert(layer.boundsDirty === false && layer.boundsFlushQueued === false, "bounds dirty flush should clear queued flags");
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      motionRuntime.reset();
    }
  }

  {
    assert(resolveDesktopVisualAlpha({ desktopVisualAlpha: -1 }) === 0, "desktop alpha should clamp low values");
    assert(resolveDesktopVisualAlpha({ desktopVisualAlpha: 2 }) === 1, "desktop alpha should clamp high values");
    assert(resolveDesktopVisualAlpha({}) === 1, "desktop alpha should default to visible");
    assert(resolveLaunchpadVisualAlpha({ launchpadVisualAlpha: -1 }) === 0, "launchpad alpha should clamp low values");
    assert(resolveLaunchpadVisualAlpha({ launchpadVisualAlpha: 2 }) === 1, "launchpad alpha should clamp high values");
    assert(resolveLaunchpadVisualAlpha({}) === 1, "launchpad alpha should default to visible");
    assert(resolveLaunchpadVisualTransform({ launchpadVisualTransform: { scale: -1, y: 12 } }).scale === 0.01, "launchpad transform should clamp scale low");
    assert(resolveLaunchpadVisualTransform({ launchpadVisualTransform: { scale: 1.08, y: 12 } }).y === 12, "launchpad transform should preserve y offset");
    assert(resolveLaunchpadVisualTransform({}).scale === 1, "launchpad transform should default to identity scale");
    const makeObservation = ({
      active = [],
      source = [],
      visible = [],
    }: Readonly<{ active?: readonly string[]; source?: readonly string[]; visible?: readonly string[] }> = {}) => ({
      activeClosingFolderIds: new Set(active),
      desktopSourceGhostedIds: new Set(source),
      visibleSubstituteFolderIds: new Set(visible),
    });
    assert(!shouldFinishFolderHandoff(makeDesktopHandoffState(), makeObservation({ active: ["folder-1"] })), "local Pixi handoff activity should keep the desktop handoff alive before the Vue bridge updates");
    assert(shouldFinishFolderHandoff(makeDesktopHandoffState(), makeObservation()), "idle state with no prop handoff should finish the desktop handoff");
    assert(!shouldFinishFolderHandoff(makeDesktopHandoffState({ closingFolderIds: ["folder-1"] }), makeObservation()), "active prop handoff should keep the desktop handoff alive");
    assert(!shouldFinishFolderHandoffEntry(makeDesktopHandoffState(), makeObservation({ active: ["folder-1"] }), "folder-1"), "matching Pixi activity should keep its folder handoff alive");
    assert(!shouldFinishFolderHandoffEntry(makeDesktopHandoffState(), makeObservation({ source: ["folder-1"] }), "folder-1"), "detached desktop source ownership should keep its folder handoff alive");
    assert(!shouldFinishFolderHandoffEntry(makeDesktopHandoffState(), makeObservation({ visible: ["folder-1"] }), "folder-1"), "visible folder substitutes should keep their folder handoff alive");
    assert(shouldFinishFolderHandoffEntry(makeDesktopHandoffState(), makeObservation({ active: ["folder-2"] }), "folder-1"), "different-folder Pixi activity should not keep an old handoff alive by itself");

    const actualLayer = new DesktopLayer({ iconBoundsRegistry: createIconBoundsRegistry() });
    assert(
      actualLayer.children.indexOf(actualLayer.folderDropFillLayer) <
        actualLayer.children.indexOf(actualLayer.visualRoot),
      "folder drop fill should render behind desktop icons so the folder thumb children stay visible"
    );
    assert(
      actualLayer.children.indexOf(actualLayer.visualRoot) <
        actualLayer.children.indexOf(actualLayer.desktopClosingUnderlayLayer),
      "desktop closing underlay should render above the desktop icons"
    );
    assert(
      actualLayer.children.indexOf(actualLayer.desktopClosingUnderlayLayer) <
        actualLayer.children.indexOf(actualLayer.singleStageFolderLayer),
      "desktop closing underlay should render below the folder opening overlay"
    );
    assert(
      actualLayer.singleStageFolderLayer.detachedClosingVisualLayer === actualLayer.desktopClosingUnderlayLayer,
      "folder detached closing visuals should mount in the desktop underlay"
    );
    actualLayer.destroy({ children: true });

    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.applyDesktopVisualAlpha({ desktopVisualAlpha: 0 });

    assert(layer.visualRoot.visible === true, "hidden desktop should stay renderable so alpha can animate");
    assert(layer.visualRoot.alpha === 0, "hidden desktop should apply the requested alpha");
    assert(layer.desktopClosingUnderlayLayer.alpha === 0, "desktop closing underlay should fade with the desktop");
    assert(layer.visualRoot.interactiveChildren === false, "hidden desktop should not receive icon interaction");
    assert(layer.singleStageFolderLayer.alpha === 1, "desktop alpha should not hide the folder overlay layer");

    layer.applyDesktopVisualTransform({
      desktopVisualTransform: { scale: 0.92, y: 44 },
      height: 600,
      width: 800,
    });
    assert(layer.desktopClosingUnderlayLayer.scale.x === 0.92 && layer.desktopClosingUnderlayLayer.scale.y === 0.92, "desktop closing underlay should scale with the desktop");
    assert(layer.desktopClosingUnderlayLayer.position.x === 400 && layer.desktopClosingUnderlayLayer.position.y === 344, "desktop closing underlay should move with the desktop");

    layer.applyFolderOverlayTransform({
      height: 600,
      launchpadVisualTransform: { scale: 1, y: 0 },
      width: 800,
    });
    assert(layer.singleStageFolderLayer.scale.x === 1 && layer.singleStageFolderLayer.scale.y === 1, "open folder overlay should keep identity scale");
    assert(layer.singleStageFolderLayer.position.x === 400 && layer.singleStageFolderLayer.position.y === 300, "folder overlay should pivot around the stage center");
    assert(layer.desktopClosingUnderlayLayer.alpha === 0, "folder overlay changes should not reveal desktop closing underlay");

    layer.applyFolderOverlayAlpha({ launchpadVisualAlpha: 0 });
    assert(layer.singleStageFolderLayer.visible === true, "hidden launchpad folder overlay should stay renderable so alpha can animate");
    assert((layer.singleStageFolderLayer.alpha as number) === 0, "hidden launchpad should apply alpha to the folder overlay");
    assert(layer.singleStageFolderLayer.interactiveChildren === false, "hidden folder overlay should not receive interaction");

    const closingLayer = makeLayer(DesktopLayer, pageTrack);
    closingLayer.applyFolderOverlayTransform({
      height: 600,
      launchpadVisualTransform: { scale: 1.08, y: 0 },
      singleStageFolderState: { renderedFolder: { id: "folder-1" } },
      width: 800,
    });
    assert(closingLayer.singleStageFolderLayer.scale.x === 1.08 && closingLayer.singleStageFolderLayer.scale.y === 1.08, "closing launchpad should scale the folder overlay layer");

    closingLayer.singleStageFolderLayer.scale.set(1.08);
    closingLayer.applyFolderOverlayTransform({
      height: 600,
      launchpadVisualTransform: { scale: 1, y: 0 },
      singleStageFolderState: null,
      width: 800,
    });
    assert((closingLayer.singleStageFolderLayer.scale.x as number) === 1 && (closingLayer.singleStageFolderLayer.scale.y as number) === 1, "inactive folder overlay should snap back to identity scale");
    assert(closingLayer.hasSingleStageFolderOverlayContent({
      singleStageFolderState: { renderedFolder: { id: "folder-1" } },
    }), "folder overlay content should require a rendered folder");
    assert(!closingLayer.hasSingleStageFolderOverlayContent({
      singleStageFolderState: null,
    }), "missing folder state should count as no overlay content");
  }

  {
    motionRuntime.reset();
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.markInteractiveBoundsDirty = () => {};
    layer.applyDesktopVisualTransform({
      desktopVisualTransform: { scale: 1, y: 0 },
      height: 600,
      width: 800,
    });
    layer.applyDesktopVisualTransform({
      desktopVisualTransform: { scale: 1, y: 0 },
      height: 640,
      snapDesktopLayout: true,
      width: 800,
    });

    assert(
      layer.visualRoot.position.x === 400 &&
        layer.visualRoot.position.y === 320 &&
        layer.desktopClosingUnderlayLayer.position.x === 400 &&
        layer.desktopClosingUnderlayLayer.position.y === 320,
      "window resize layout sync should snap desktop visual roots to the resized stage center"
    );
    assert(
      !getBaseAnimation(layer.visualRoot, "x") &&
        !getBaseAnimation(layer.visualRoot, "y") &&
        !getBaseAnimation(layer.visualRoot.scale, "x") &&
        !getBaseAnimation(layer.visualRoot.scale, "y") &&
        !getBaseAnimation(layer.desktopClosingUnderlayLayer, "x") &&
        !getBaseAnimation(layer.desktopClosingUnderlayLayer, "y") &&
        !getBaseAnimation(layer.desktopClosingUnderlayLayer.scale, "x") &&
        !getBaseAnimation(layer.desktopClosingUnderlayLayer.scale, "y"),
      "window resize layout sync should not leave a delayed desktop visual-root spring"
    );
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.markInteractiveBoundsDirty = () => {};
    const transform = (y: number) => ({
      desktopVisualTransform: { scale: 1, y },
      height: 600,
      width: 800,
    });

    layer.applyDesktopVisualTransform(transform(0));
    layer.applyDesktopVisualTransform(transform(40));
    const spring = getBaseAnimation(layer.visualRoot, "y");
    assert(spring, "a changed desktop transform should start a spring");
    motionRuntime.step(0.05);
    const fromBeforeStableUpdate = spring.from;
    layer.applyDesktopVisualTransform(transform(40));
    assert(
      spring.from === fromBeforeStableUpdate,
      "a stable desktop transform should not restart its in-flight spring"
    );

    layer.applyDesktopVisualTransform(transform(50));
    assert(
      spring.to === 350 && spring.from !== fromBeforeStableUpdate,
      "a changed desktop transform should still retarget the existing spring"
    );
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.markInteractiveBoundsDirty = () => {};
    const folderState = {
      renderedFolder: { id: "resize-snap-folder" },
    };
    layer.applyFolderOverlayTransform({
      height: 600,
      launchpadVisualTransform: { scale: 1, y: 0 },
      singleStageFolderState: folderState,
      width: 800,
    });
    layer.applyFolderOverlayTransform({
      height: 640,
      launchpadVisualTransform: { scale: 1, y: 0 },
      singleStageFolderState: folderState,
      snapDesktopLayout: true,
      width: 800,
    });

    assert(
      layer.singleStageFolderLayer.position.x === 400 &&
        layer.singleStageFolderLayer.position.y === 320,
      "window resize layout sync should snap an open folder overlay to the resized stage center"
    );
    assert(
      !getBaseAnimation(layer.singleStageFolderLayer, "x") &&
        !getBaseAnimation(layer.singleStageFolderLayer, "y") &&
        !getBaseAnimation(layer.singleStageFolderLayer.scale, "x") &&
        !getBaseAnimation(layer.singleStageFolderLayer.scale, "y"),
      "window resize layout sync should not leave a delayed open-folder overlay spring"
    );
    motionRuntime.reset();
  }

  {
    const makeFolderNode = (id: string): TestGhostingNode => ({
      alpha: 1,
      item: { id, type: "folder" },
      setState(nextState: TestNodeState) {
        this.state = nextState;
      },
      state: { ghosted: false },
    });
    const folderA = makeFolderNode("folder-a");
    const folderB = makeFolderNode("folder-b");
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("folder-a", asDesktopIconNode(folderA));
    layer.iconNodes.set("folder-b", asDesktopIconNode(folderB));
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set(["folder-a"]);

    layer.applyFolderSourceGhosting(makeDesktopHandoffState({
      sourceGhostedFolderIds: ["folder-b"],
    }));

    assert(folderA.state.ghosted === true, "overlay-owned detached folder source should stay ghosted on the desktop");
    assert(folderB.state.ghosted === true, "Vue-owned opening folder source should stay ghosted on the desktop");
    assert(folderA.__folderSourceGhostedByOwnership === true, "overlay-owned source ghosting should be tracked as ownership");
    assert(folderB.__folderSourceGhostedByOwnership === true, "Vue-owned source ghosting should be tracked as ownership");

    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set(["folder-a"]);
    layer.applyFolderSourceGhosting(makeDesktopHandoffState());

    assert(folderA.state.ghosted === true, "clearing folder B source ghosting should not reveal detached folder A");
    assert((folderB.state.ghosted as boolean) === false, "clearing folder B source ghosting should reveal only folder B");

    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();
    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-a"), {
      folderId: "folder-a",
      kind: "detachedClosing",
      token: "detached-a",
    });
    layer.applyFolderSourceGhosting(makeDesktopHandoffState());
    assert(folderA.state.ghosted === true, "root ownership should ghost a detached desktop source");
    layer.visualOwnership.release(makeDesktopSourceVisualKey("folder-a"), "detached-a");
    layer.applyFolderSourceGhosting(makeDesktopHandoffState());
    assert((folderA.state.ghosted as boolean) === false, "root ownership release should restore the desktop source");

    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-a"), {
      folderId: "folder-a",
      kind: "detachedClosing",
      token: "detached-a-2",
    });
    layer.applyFolderSourceGhosting(makeDesktopHandoffState({
      sourceGhostedFolderIds: ["folder-b"],
    }));
    assert(folderA.state.ghosted === true && folderB.state.ghosted === true, "raw and ownership source ghosting should compose while both are active");
    layer.visualOwnership.release(makeDesktopSourceVisualKey("folder-a"), "detached-a-2");
    layer.commitFolderSourceGhosting();
    assert((folderA.state.ghosted as boolean) === false, "ownership release should not be reintroduced from stale cached source ghosting");
    assert(folderB.state.ghosted === true, "raw Vue source ghosting should remain after ownership release");
  }

  {
    motionRuntime.reset();
    const makeFolderNode = (id: string): TestGhostingNode => ({
      alpha: 1,
      item: { id, type: "folder" },
      setState(nextState: TestNodeState) {
        this.state = nextState;
      },
      state: { ghosted: false },
      x: 0,
      y: 0,
    });
    const folderA = makeFolderNode("folder-a");
    const folderB = makeFolderNode("folder-b");
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.applyDesktopVisualAlpha = () => {};
    layer.applyDesktopVisualTransform = () => {};
    layer.applyFolderOverlayAlpha = () => {};
    layer.applyFolderOverlayTransform = () => {};
    layer.flushInteractiveBounds = () => {};
    layer.markInteractiveBoundsDirty = () => {};
    layer.singleStageDiagnosticsLayer = asTestDependency({ update() {} });
    layer.singleStageFolderLayer = asTestDependency({
      folderVisualSession: makeFolderVisualSession(),
      getDesktopSourceGhostedIds: () => new Set(),
      hasVisibleFolderSubstitute: () => false,
    });
    layer.updateSingleStageFolderLayer = () => {};
    layer.pageTrackMotion = asTestDependency({
      control: null,
      grabProgressOffset: 0,
      grabToken: null,
      key: null,
      mode: null,
      settleToken: null,
    });
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-a"), {
      folderId: "folder-a",
      kind: "detachedClosing",
      token: "detached-a",
    });
    layer.iconNodes.set("page:0:folder-a", asDesktopIconNode(folderA));
    layer.iconNodes.set("page:0:folder-b", asDesktopIconNode(folderB));

    layer.update({
      activePageIndex: 0,
      activePages: [[
        { id: "folder-a", type: "folder" },
        { id: "folder-b", type: "folder" },
      ]],
      desktopFrame: { height: 300, left: 0, top: 0, width: 400 },
      deviceResolution: 1,
      folderClosingHandoffIds: new Set(),
      folderPageSize: 9,
      folderSourceGhostedIds: new Set(["folder-b"]),
      getDesktopPageRenderMode: () => "interactive",
      getVisibleDesktopPage: (page: readonly DesktopItem[]) => page,
      gridCols: 2,
      gridRows: 1,
      height: 300,
      iconSize: 64,
      isFolderOpeningPreviewFrameGhosted: () => false,
      isIconOpening: () => false,
      focusedIcon: null,
      isSearchMode: false,
      isTextlessMode: false,
      launchTargetStatusById: {},
      setPageRef: () => {},
      showMissingLaunchTargetBadge: false,
      stageRect: { height: 300, left: 0, top: 0, width: 400 },
      width: 400,
    });

    assert(folderA.state.ghosted === true && folderB.state.ghosted === true, "update should compose raw Vue ghosting with live detached ownership");
    layer.visualOwnership.release(makeDesktopSourceVisualKey("folder-a"), "detached-a");
    layer.commitFolderSourceGhosting();
    assert((folderA.state.ghosted as boolean) === false, "update should cache raw source ghosting, not ownership-expanded source ghosting");
    assert(folderB.state.ghosted === true, "update should keep the raw Vue folder source ghosted after detached ownership release");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const folder = { id: "folder-late-closing-owner", name: "Late Closing Owner", type: "folder" };
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const node = prepareLayerForDesktopQuiescenceTest(layer, folder);
    pageTrack.addChild(asTestDependency<ContainerChild>(node));
    layer.folderDropFrameSuppressedIds = new Set();
    layer.updateFolderDropTargetLayers = () => {};
    layer.updateGroupDragLayer = () => {};
    layer.updateDiagnostics = () => ({});
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    let preparedEntry: unknown = null;
    layer.updateSingleStageFolderLayer = () => {
      layer.singleStageFolderLayer.folderVisualSession = makeFolderVisualSession({
        active: true,
        folderId: folder.id,
        ghostKeys: [`closing:${folder.id}`],
      });
      layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set([folder.id]);
      layer.ensureFolderHandoffNode(folder.id, node, { x: 12, y: 34 }, {
        resetVisual: true,
        revealLabel: false,
      });
      preparedEntry = layer.getFolderHandoffEntry(folder.id);
      layer.visualOwnership.acquire(makeDesktopSourceVisualKey(folder.id), {
        folderId: folder.id,
        kind: "closing",
        token: "late-closing-owner",
      });
    };

    layer.updateStructure({
      ...makeDesktopQuiescenceState(folder),
      folderSourceGhostedIds: new Set([folder.id]),
    });

    assert(preparedEntry != null, "test setup should prepare the close handoff during the overlay update");
    assert(
      layer.getFolderHandoffEntry(folder.id) === preparedEntry,
      "same-frame closing ownership should keep the newly prepared desktop handoff entry",
    );
    assert(
      node.visualWrap.visible === false && node.__folderSourceGhostedByOwnership === true,
      "fresh closing ownership should keep the real folder artwork hidden behind its closing substitute",
    );
    layer.visualOwnership.release(makeDesktopSourceVisualKey(folder.id), "late-closing-owner");
    layer.clearFolderHandoffNode(folder.id);
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const item = { id: "app-a", type: "app" };
    const pageTrack = makePageTrack([]);
    pageTrack.x = 0;
    const layer = makeLayer(DesktopLayer, pageTrack);
    prepareLayerForDesktopQuiescenceTest(layer, item);
    const state = makeDesktopQuiescenceState(item);
    let scheduledFrameCount = 0;
    let pendingRender = true;

    try {
      layer.update(state);
      for (let frame = 0; frame < 600 && motionRuntime.hasActiveWork(); frame += 1) {
        motionRuntime.step(1 / 60);
      }
      assert(!motionRuntime.hasActiveWork(), "test setup should settle the initial desktop mount animation before checking idle rendering");
      motionRuntime.reset();

      for (let frame = 0; frame < 12; frame += 1) {
        scheduledFrameCount += 1;
        motionRuntime.step(frame === 0 ? 0 : 1 / 60);
        if (motionRuntime.debug.writesLastFrame > 0) pendingRender = true;
        if (pendingRender) {
          pendingRender = false;
          layer.update(state);
        }
        if (!pendingRender && !motionRuntime.hasActiveWork()) break;
      }

      assert(
        !motionRuntime.hasActiveWork(),
        `unchanged desktop render plan should settle to idle motion work, got ${motionRuntime.debugSnapshot().summary.activeAnimationCount} active animation(s)`
      );
      assert(scheduledFrameCount <= 4, `unchanged desktop render plan should stop scheduling frames after settling, got ${scheduledFrameCount}`);
    } finally {
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const makeFolderNode = (id: string) => {
      const node = makeNode(id);
      node.alpha = 1;
      node.item = { id, type: "folder" };
      node.setState = (nextState) => {
        node.state = nextState;
        node.visible = !nextState.ghosted;
      };
      return node;
    };
    const folderA = makeFolderNode("folder-a");
    const folderB = makeFolderNode("folder-b");
    const pageTrack = makePageTrack([folderA, folderB]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.applyDesktopVisualAlpha = () => {};
    layer.applyDesktopVisualTransform = () => {};
    layer.applyFolderOverlayAlpha = () => {};
    layer.applyFolderOverlayTransform = () => {};
    layer.flushInteractiveBounds = () => {};
    layer.markInteractiveBoundsDirty = () => {};
    layer.singleStageDiagnosticsLayer = asTestDependency({ update() {} });
    layer.singleStageFolderLayer = asTestDependency({
      folderVisualSession: makeFolderVisualSession({ active: true, folderId: "folder-b" }),
      getDesktopSourceGhostedIds: () => new Set(["folder-a"]),
      hasVisibleFolderSubstitute: () => false,
    });
    layer.updateSingleStageFolderLayer = () => {};
    layer.pageTrackMotion = asTestDependency({
      control: null,
      grabProgressOffset: 0,
      grabToken: null,
      key: null,
      mode: null,
      settleToken: null,
    });
    layer.iconNodes.set("page:0:folder-a", asDesktopIconNode(folderA));
    layer.iconNodes.set("page:0:folder-b", asDesktopIconNode(folderB));
    layer.ensureFolderHandoffNode("folder-a", folderA, { x: 12, y: 34 }, { revealLabel: false });

    layer.update({
      activePageIndex: 0,
      activePages: [[
        { id: "folder-a", type: "folder" },
        { id: "folder-b", type: "folder" },
      ]],
      desktopFrame: { height: 300, left: 0, top: 0, width: 400 },
      deviceResolution: 1,
      folderClosingHandoffIds: new Set(["folder-b"]),
      folderPageSize: 9,
      folderSourceGhostedIds: new Set(["folder-a", "folder-b"]),
      getDesktopPageRenderMode: () => "interactive",
      getVisibleDesktopPage: (page: readonly DesktopItem[]) => page,
      gridCols: 2,
      gridRows: 1,
      height: 300,
      iconSize: 64,
      isFolderOpeningPreviewFrameGhosted: () => false,
      isIconOpening: () => false,
      focusedIcon: null,
      isSearchMode: false,
      isTextlessMode: false,
      launchTargetStatusById: {},
      setPageRef: () => {},
      showMissingLaunchTargetBadge: false,
      stageRect: { height: 300, left: 0, top: 0, width: 400 },
      width: 400,
    });

    assert(layer.getFolderHandoffEntry("folder-a"), "detached folder A handoff should survive folder B's live close update");
    assert(folderA.visualWrap.visible === false, "detached folder A artwork should stay hidden until its detached visual releases");
    assert(folderA.visible === true && folderA.state.ghosted === false, "detached folder A handoff node should not fall back to the ordinary ghosted path");
    assert(folderA.__folderSourceGhostedByOwnership === true, "detached folder A handoff should still track ownership ghosting");
    motionRuntime.reset();
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    const after = makeNode("after");
    const pageTrack = makePageTrack([before, folder, after]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });

    assert(pageTrack.children.length === 3, "handoff should reuse the real folder node");
    assert(pageTrack.children[2] === folder, "handoff should raise the real folder node");
    assert(!Object.prototype.hasOwnProperty.call(layer, "folderHandoffNode"), "primary handoff node should be derived from the handoff map");
    const primaryHandoff = assumePresent(layer.folderHandoffNode);
    assert(primaryHandoff.node === asDesktopIconNode(folder), "handoff state should reference the real node");
    assert(folder.position.x === 12 && folder.position.y === 34, "handoff should snap node to the target");
    assert(folder.scale.x === 1 && folder.scale.y === 1, "handoff should reset node scale");
    assert(folder.visible === true && folder.alpha === 1, "handoff should make the real node visible");
    assert(folder.visualWrap.visible === false, "handoff should hide the real folder artwork while the Pixi overlay owns the thumbnail");
    assert(folder.eventMode === "static" && folder.cursor === "pointer", "handoff should restore folder interaction once the real node owns the icon");
    assert(folder.state.draggable === true && folder.state.interactive === true, "handoff should restore the node state used by pointer handling");
    assert(folder.state.ghosted === false, "handoff should clear the stale ghost flag before the next setState");
    assert(folder.labelText.visible === true && folder.labelText.renderable === false && folder.labelText.alpha === 0, "handoff should hide the folder label while the overlay owns the source");
    assert(folder.labelRevealCount === 0, "handoff should not start the label fade before source release");
    folder.labelText.alpha = 0.4;
    layer.syncFolderHandoffNode(folder, { x: 12, y: 34 });
    assert(folder.labelText.alpha === 0, "handoff position sync should keep a hidden label parked at zero alpha");
    assert(folder.labelRevealCount === 0, "handoff position sync should not start the label reveal");
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert((folder.labelRevealCount as number) === 1, "visual release should start the folder label fade exactly once");
    assert((folder.labelText.renderable as boolean) === true, "visual release should make the folder label renderable");
    assert((folder.visualWrap.visible as boolean) === true, "settled overlay visual release should restore the real folder artwork");
    folder.labelText.alpha = 0.4;
    layer.syncFolderHandoffNode(folder, { x: 12, y: 34 });
    assert((folder.visualWrap.visible as boolean) === true, "handoff position sync should not hide artwork after settled overlay release");
    assert(folder.labelText.alpha === 0.4, "handoff position sync should not hide an in-progress label fade after visual release");

    layer.clearFolderHandoffNode();

    assert(layer.folderHandoffNode === null, "clear should remove handoff state");
    assert(layer.folderHandoffNodes.size === 0, "clear should remove all handoff entries");
    assert(pageTrack.children[1] === folder, "clear should restore original z order");
    assert((folder.visualWrap.visible as boolean) === true, "clear should restore the real folder artwork after overlay cleanup");
    assert((folder.labelRevealCount as number) === 1, "clear should not restart the folder label fade-in");
  }

  {
    const folderA = makeNode("folder-a");
    const folderB = makeNode("folder-b");
    const pageTrack = makePageTrack([folderA, folderB]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-a", folderA, { x: 12, y: 34 });
    assert(folderA.visualWrap.visible === false, "interrupted handoff should initially hide folder A artwork under the overlay");
    layer.clearFolderHandoffNode();
    assert((folderA.visualWrap.visible as boolean) === true, "clearing an interrupted handoff should restore folder A artwork even without overlay release");
    layer.ensureFolderHandoffNode("folder-a", folderA, { x: 12, y: 34 });
    layer.ensureFolderHandoffNode("folder-b", folderB, { x: 56, y: 78 });

    assert(layer.folderHandoffNodes.size === 2, "different folder handoffs should coexist");
    assert(folderA.visualWrap.visible === false, "starting folder B handoff should keep folder A hidden while its overlay visual is active");
    assert(folderB.visualWrap.visible === false, "new handoff should hide the new folder artwork");
    layer.releaseClosingFolderHandoffVisual("folder-a");
    assert((folderA.visualWrap.visible as boolean) === true && folderB.visualWrap.visible === false, "releasing folder A should not reveal folder B");
  }

  {
    const logs: unknown[][] = [];
    const originalLog = console.log;
    sceneDiagnosticsState.reset();
    sceneDiagnosticsState.configureFolderHandoff({ log: true });
    console.log = (...args: unknown[]) => { logs.push(args); };
    try {
      const folder = makeNode("folder");
      folder.item = { id: "folder-1", type: "folder" };
      const pageTrack = makePageTrack([folder]);
      const layer = makeLayer(DesktopLayer, pageTrack);

      layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
      layer.releaseClosingFolderHandoffVisual("folder-1");

      const before = logs.find(([label, payload]) =>
        label === "[folder-handoff-debug] desktop-restore" && (payload as SceneDataRecord | undefined)?.phase === "desktop-restore-before"
      );
      const after = logs.find(([label, payload]) =>
        label === "[folder-handoff-debug] desktop-restore" && (payload as SceneDataRecord | undefined)?.phase === "desktop-restore-after"
      );
      const beforePayload = before?.[1] as (SceneDataRecord & { node?: SceneDataRecord }) | undefined;
      const afterPayload = after?.[1] as (SceneDataRecord & { node?: SceneDataRecord }) | undefined;
      assert(beforePayload?.node?.visualWrapVisible === false, "desktop restore debug should capture hidden artwork before release");
      assert(afterPayload?.node?.visualWrapVisible === true, "desktop restore debug should capture restored artwork after release");
      assert(afterPayload?.visualRoot, "desktop restore debug should include desktop transform context");
      assert(afterPayload?.singleStageFolderLayer, "desktop restore debug should include folder overlay transform context");
      const lastDebug = sceneDiagnosticsState.read("folderHandoff") as SceneDataRecord | null;
      assert(
        lastDebug?.folderId === "folder-1" &&
          lastDebug?.phase === "desktop-restore-after",
        "desktop restore debug should publish the latest folder handoff snapshot"
      );
    } finally {
      console.log = originalLog;
      sceneDiagnosticsState.reset();
    }
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: true, suppressLabelRevealAfterGhost: true };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.labelText.alpha = 1;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    folder.__folderSourceGhostedByOwnership = true;
    folder.labelText.alpha = 0.4;
    layer.applyFolderSourceGhosting(makeDesktopHandoffState());

    assert(setStateCount === 0, "source ghosting commits should not use normal setState while a handoff entry owns the folder node");
    assert(folder.labelText.alpha === 0.4, "source ghosting commits should not force an in-progress handoff label fade to full opacity");
    assert((folder.__folderSourceGhostedByOwnership as boolean) === false, "handoff source ghosting metadata should still track the latest ownership state");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    assert(layer.getFolderHandoffEntry("folder-1"), "test setup should create a handoff entry");

    layer.applyFolderSourceGhosting(makeDesktopHandoffState({
      sourceGhostedFolderIds: ["folder-1"],
    }));

    assert(!layer.getFolderHandoffEntry("folder-1"), "new raw source ghosting should clear a stale handoff entry");
    assert(setStateCount === 1, "new raw source ghosting should be committed through normal icon state");
    assert(folder.state.ghosted === true && folder.visible === false, "new raw source ghosting should hide the real folder icon");

    const rememberedState = layer.lastFolderSourceGhostingState;
    layer.applyFolderSourceGhosting(makeDesktopHandoffState(), { remember: false });
    assert(layer.lastFolderSourceGhostingState === rememberedState, "immediate source ghosting should not replace the full remembered desktop state");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();
    layer.visualOwnership = new FolderVisualOwnershipRegistry();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(layer.getFolderHandoffEntry("folder-1")?.visualReleased === true, "test setup should leave a released stale handoff entry");
    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-1"), {
      folderId: "folder-1",
      kind: "closing",
      token: "close-folder-1",
    });

    layer.applyFolderSourceGhosting(makeDesktopHandoffState());

    assert(!layer.getFolderHandoffEntry("folder-1"), "ownership source ghosting should clear a released stale handoff entry");
    assert(setStateCount === 1, "ownership source ghosting should be committed through normal icon state after stale handoff cleanup");
    assert(folder.state.ghosted === true && folder.visible === false, "ownership source ghosting should hide the real folder icon");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(layer.getFolderHandoffEntry("folder-1")?.visualReleased === true, "test setup should leave a released stale handoff entry");

    layer.applyFolderSourceGhosting(makeDesktopHandoffState({
      openingSourceGhosted: (folderId) => folderId === "folder-1",
      sourceGhostedFolderIds: ["folder-1"],
    }));

    assert(!layer.getFolderHandoffEntry("folder-1"), "new opening source ghosting should clear a released stale handoff entry");
    assert(setStateCount === 1, "new opening source ghosting should be committed through normal icon state");
    assert(folder.state.ghosted === true && folder.visible === false, "new opening source ghosting should hide the real desktop folder");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.releaseClosingFolderHandoffVisual("folder-1");
    folder.__folderSourceGhostedByOwnership = true;
    folder.state = { ...folder.state, ghosted: false };
    folder.visible = true;

    layer.applyFolderSourceGhosting(makeDesktopHandoffState({
      openingSourceGhosted: (folderId) => folderId === "folder-1",
      sourceGhostedFolderIds: ["folder-1"],
    }));

    assert(!layer.getFolderHandoffEntry("folder-1"), "rapid reopen should retire the released closing handoff entry");
    assert(setStateCount === 1, "rapid reopen should reconcile the real icon even when ownership metadata already says ghosted");
    assert(folder.state.ghosted === true && (folder.visible as boolean) === false, "rapid reopen should not render the desktop folder beneath the opening overlay");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.releaseClosingFolderHandoffVisual("folder-1");
    const entry = assumePresent(layer.getFolderHandoffEntry("folder-1"));
    entry.cleanupFrame = { cancelled: false };
    assert(entry?.visualReleased === true, "test setup should leave a released close-tail handoff entry");

    layer.applyFolderSourceGhosting(makeDesktopHandoffState({
      sourceGhostedFolderIds: ["folder-1"],
    }));

    assert(layer.getFolderHandoffEntry("folder-1") === entry, "released close tail should keep the handoff entry until cleanup");
    assert(setStateCount === 0, "released close tail should not re-hide the real folder through ghosted state");
    assert(folder.visible !== false, "released close tail should keep the real desktop folder visible for handoff");
    assert(folder.__folderSourceGhostedByOwnership === true, "released close tail should still track source ownership ghosting");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();
    layer.visualOwnership = new FolderVisualOwnershipRegistry();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 }, { revealLabel: false });
    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-1"), {
      folderId: "folder-1",
      kind: "detachedClosing",
      token: "detached-folder-1",
    });

    layer.applyFolderSourceGhosting(makeDesktopHandoffState());

    assert(layer.getFolderHandoffEntry("folder-1"), "ownership source ghosting should keep an unreleased prepared handoff entry");
    assert(setStateCount === 0, "prepared handoff should not route ownership ghosting through normal setState");
    assert(folder.visualWrap.visible === false, "prepared handoff should keep the real folder artwork hidden");
    assert(folder.__folderSourceGhostedByOwnership === true, "prepared handoff should still track ownership ghosting metadata");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set(["folder-1"]);

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 }, { revealLabel: false });
    layer.applyFolderSourceGhosting(makeDesktopHandoffState({
      sourceGhostedFolderIds: ["folder-1"],
    }));

    assert(layer.getFolderHandoffEntry("folder-1"), "closing-owned raw source ghosting should keep the prepared handoff entry");
    assert(setStateCount === 0, "closing-owned prepared handoff should not fall back to normal ghosted setState");
    assert(folder.visualWrap.visible === false, "closing-owned prepared handoff should keep desktop artwork hidden while ghosts own the source");
    assert(folder.__folderSourceGhostedByOwnership === true, "closing-owned prepared handoff should track source ownership ghosting");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(folder.visualWrap.visible === true, "test setup should restore artwork after visual release");
    assert(layer.getFolderHandoffEntry("folder-1")?.visualReleased === true, "test setup should leave a released handoff entry");

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 18, y: 42 }, { revealLabel: false });

    const entry = layer.getFolderHandoffEntry("folder-1");
    assert(entry?.visualReleased === true, "ordinary handoff sync should not restart visual ownership after release");
    assert(folder.visualWrap.visible === true, "ordinary handoff sync should not hide released folder artwork again");

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 20, y: 44 }, { resetVisual: true, revealLabel: false });

    assert((entry?.visualReleased as boolean | undefined) === false, "explicit handoff prepare should restart visual ownership");
    assert(entry?.labelRevealStarted === false, "explicit handoff prepare should reset stale label reveal state");
    assert((folder.visualWrap.visible as boolean) === false, "explicit handoff prepare should hide the real folder artwork again");
  }

  {
    try {
      const folder = makeNode("folder");
      folder.item = { id: "folder-1", type: "folder" };
      folder.state = { ghosted: false };
      const pageTrack = makePageTrack([folder]);
      const layer = makeLayer(DesktopLayer, pageTrack);
      layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
      layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();

      layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
      layer.releaseClosingFolderHandoffVisual("folder-1");
      layer.lastFolderSourceGhostingState = makeDesktopHandoffState();

      layer.commitFolderSourceGhosting();
      assert(layer.getFolderHandoffEntry("folder-1")?.cleanupFrame?.cancelled === false, "source ghosting commit should schedule eligible handoff cleanup");
      flushMotionRuntimeTestFrame(motionRuntime);
      assert(!layer.getFolderHandoffEntry("folder-1"), "scheduled source ghosting reconciliation should clear eligible handoff entries");
    } finally {
      motionRuntime.reset();
    }
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    const pageTrack = makePageTrack([before, folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", asDesktopIconNode(folder));
    layer.boundsRegistration = asTestDependency({
      entries: [{
        area: "desktop",
        item: folder.item,
        node: asDesktopIconNode(folder),
        x: 22,
        y: 44,
      }],
    });

    assert(layer.startClosingFolderHandoffNow("folder-1"), "ready handoff should find the current desktop folder node");
    assert(pageTrack.children[1] === folder, "ready handoff should raise the folder node");
    assert(folder.position.x === 22 && folder.position.y === 44, "ready handoff should snap to the current desktop target");
    assert(folder.visualWrap.visible === false, "ready handoff should keep the real folder artwork hidden under the overlay");
    assert(folder.labelRevealCount === 0, "ready handoff should keep the real folder label hidden while the overlay owns the transition");
    assert(folder.labelText.renderable === false && folder.labelText.alpha === 0, "ready handoff should park the folder label as non-renderable at a hidden alpha");
    folder.labelText.alpha = 0.4;
    assert(layer.startClosingFolderHandoffNow("folder-1"), "duplicate ready handoff should keep the existing handoff active");
    assert(folder.labelRevealCount === 0, "duplicate ready handoff should not reveal the label");
    assert(folder.labelText.renderable === false && folder.labelText.alpha === 0, "duplicate ready handoff should keep the label hidden until source release");
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert((folder.labelRevealCount as number) === 1, "visual release should start the folder label fade exactly once");
    assert(folder.labelRestoreCount === 0 && (folder.labelText.renderable as boolean) === true && folder.labelText.alpha === 0, "visual release should hand the label to the fade path instead of restoring immediately");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set(["folder-1"]);
    layer.singleStageFolderLayer.hasVisibleFolderSubstitute = () => false;

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 }, { revealLabel: false });
    layer.releaseClosingFolderHandoffVisual("folder-1");

    assert(folder.visualWrap.visible === true, "visual release should restore artwork");
    assert(folder.labelRevealCount === 1, "visual release should fade the label from zero");
    assert(folder.labelRestoreCount === 0 && folder.labelText.renderable === true && folder.labelText.alpha === 0, "visual release should hand the label to the fade path as soon as the closing ghost returns");

    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();
    layer.singleStageFolderLayer.hasVisibleFolderSubstitute = () => false;
    layer.lastFolderSourceGhostingState = makeDesktopHandoffState({
      sourceGhostedFolderIds: ["folder-1"],
    });
    assert(!layer.revealFolderHandoffLabelWhenSettled(layer.getFolderHandoffEntry("folder-1")), "raw Vue source ghosting should still suppress the handoff label reveal");
    assert(folder.labelRevealCount === 1 && folder.labelRestoreCount === 0, "raw Vue source ghosting should not restart an already released label fade");

    layer.lastFolderSourceGhostingState = makeDesktopHandoffState();
    assert(layer.revealFolderHandoffLabelWhenSettled(layer.getFolderHandoffEntry("folder-1")), "settled source ownership should accept the already released label state");
    assert(folder.labelRevealCount === 1 && folder.labelRestoreCount === 0, "settled source ownership should not restart the released label fade");
  }

  {
    const iconBoundsRegistry = createIconBoundsRegistry();
    makeLayerWithRegistry.iconBoundsRegistry = iconBoundsRegistry;
    const folder = makeNode("folder");
    folder.item = {
      childPages: [[{ id: "child-1" }]],
      id: "folder-1",
      type: "folder",
    };
    folder.getFolderThumbBounds = () => ({ height: 60, left: 10, top: 20, width: 60 });
    folder.getIconBounds = () => ({ height: 80, left: 0, top: 10, width: 80 });
    folder.getFolderPreviewChildBounds = () => ({ height: 12, left: 18, top: 28, width: 12 });
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    iconBoundsRegistry.registerBounds(K.FOLDER_THUMB, V.RENDERED, "folder-1", { height: 60, left: 10, top: 20, width: 60 }, {
      area: "desktop",
      id: "folder-1",
    });

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.clearFolderHandoffNode();

    assert(layer.folderHandoffNode === null, "debug snapshot should not prevent handoff cleanup");
    assert(layer.folderHandoffNodes.size === 0, "debug snapshot cleanup should remove the handoff entry");
    const debugChildRows = layer.lastFolderHandoffDebugSnapshot?.childRows as readonly Readonly<{ target?: unknown }>[] | undefined;
    assert(debugChildRows?.length === 1, "debug snapshot should include preview child rows");
    assert(debugChildRows?.[0]?.target, "debug snapshot should resolve preview child targets");
    iconBoundsRegistry.clearBounds();
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    const pageTrack = makePageTrack([before, folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-1", folder, {
      scaleX: 1.087,
      scaleY: 1.086,
      x: 18,
      y: 42,
    });

    assert(folder.position.x === 18 && folder.position.y === 42, "handoff should apply the pinned position");
    assert(folder.scale.x === 1.087 && folder.scale.y === 1.086, "handoff should apply inverse shell scale");
  }

  {
    const calls: Array<Readonly<{
      desktopPageTrackOffset: Readonly<{ liveX: number; targetX: number }>;
      renderedFolder?: unknown;
    }>> = [];
    const geometries: Array<Readonly<{
      folderRect: Readonly<{ height: number; left: number; top: number; width: number }>;
    }>> = [];
    const pageTrack = makePageTrack([]);
    pageTrack.x = -123.25;
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.lastDesktopRenderPlan = asTestDependency({ targetX: -480 });
    layer.onFolderGeometryChange = (geometry) => geometries.push(asTestDependency(geometry));
    layer.singleStageFolderLayer = asTestDependency({
      update(state: Readonly<{
        desktopPageTrackOffset: Readonly<{ liveX: number; targetX: number }>;
        renderedFolder?: unknown;
      }>) {
        calls.push(state);
        return { folderRect: state.renderedFolder ? { left: 1, top: 2, width: 3, height: 4 } : null };
      },
    });

    layer.updateSingleStageFolderLayer({
      singleStageFolderState: {
        height: 600,
        renderedFolder: { id: "folder-1" },
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        width: 800,
      },
    });

    const firstFolderUpdate = assumePresent(calls[0]);
    assert(firstFolderUpdate.desktopPageTrackOffset.liveX === -123.25, "folder overlay state should receive the desktop pageTrack live x");
    assert(firstFolderUpdate.desktopPageTrackOffset.targetX === -480, "folder overlay state should receive the desktop render target x");
    assert(assumePresent(geometries[0]).folderRect.left === 1, "folder geometry changes should still be forwarded after offset injection");

    layer.lastDesktopRenderPlan = null;
    pageTrack.x = 18;
    layer.updateSingleStageFolderLayer({
      height: 500,
      singleStageFolderState: null,
      stageRect: { height: 500, left: 10, top: 20, width: 700 },
      width: 700,
    });

    const secondFolderUpdate = assumePresent(calls[1]);
    assert(secondFolderUpdate.renderedFolder === null, "empty folder overlay state should still clear rendered folder");
    assert(secondFolderUpdate.desktopPageTrackOffset.liveX === 18, "empty folder overlay state should receive desktop pageTrack live x");
    assert(secondFolderUpdate.desktopPageTrackOffset.targetX === 18, "missing render plan target should fall back to live x");
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    const pageTrack = makePageTrack([before, folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    try {
      layer.ensureFolderHandoffNode("folder-1", folder, { x: 20, y: 30 });
      layer.finishFolderHandoffNodeAfterFrame();

      assert(assumePresent(layer.folderHandoffNode).cleanupFrame?.cancelled === false, "finish should wait one runtime frame before cleanup");
      assert(folder.labelRevealCount === 1, "finish should release the source label fade before cleanup when no substitute remains");
      assert(folder.visualWrap.visible === true, "finish should restore the real folder artwork before final cleanup when no substitute remains");
      assert(pageTrack.children[1] === folder, "handoff should stay raised until the cleanup frame");
      layer.releaseClosingFolderHandoffVisual("folder-1");
      assert(folder.labelRevealCount === 1, "late visual release should not restart the label reveal before cleanup");
      assert(folder.visualWrap.visible === true, "settled overlay release should restore artwork before final handoff cleanup");

      flushMotionRuntimeTestFrame(motionRuntime);

      assert(layer.folderHandoffNode === null, "cleanup frame should clear handoff state");
      assert(layer.folderHandoffNodes.size === 0, "cleanup frame should clear handoff entries");
      assert(pageTrack.children[1] === folder, "cleanup frame should preserve the restored z order");
      assert(folder.visualWrap.visible === true, "cleanup frame should keep the real folder artwork visible");
      assert(folder.labelRevealCount === 1, "cleanup frame should not restart the label reveal");
    } finally {
      motionRuntime.reset();
    }
  }

  {
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const overlayDebug = {
      openingGeometry: {
        session: { folderId: "folder-1", token: 7 },
        snapshot: { folderId: "folder-1", targetKey: "target-a" },
      },
    };
    layer.singleStageFolderLayer.getVisualDebugSnapshot = (() => overlayDebug) as unknown as typeof layer.singleStageFolderLayer.getVisualDebugSnapshot;

    const snapshot = layer.getFolderVisualDebugSnapshot();

    assert((snapshot.overlay as Readonly<{ debug?: unknown }>).debug === overlayDebug, "folder visual debug snapshot should expose overlay geometry diagnostics");
  }

  {
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    let detachedFolderCount = 0;
    layer.provisionalFolderRollbackLayer = asTestDependency({
      hasHandledToken: (token: number) => token === 42,
      snapshot: () => ({ active: false, token: null }),
    });
    layer.detachFolderNodeForProvisionalRollback = asTestDependency(() => {
      detachedFolderCount += 1;
      return {};
    });

    const preparation = layer.prepareProvisionalFolderRollback({
      provisionalFolderRollback: {
        folderId: "folder-provisional",
        phase: "dissolving",
        targetAppId: "target-app",
        token: 42,
      },
    });

    assert(preparation === null, "a consumed rollback token should not restart after its visual layer completes");
    assert(detachedFolderCount === 0, "a consumed rollback token should not detach the completed folder a second time");
  }

  {
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const originalQueueMicrotask = globalThis.queueMicrotask;
    const queued: Array<() => void> = [];
    let refreshCount = 0;
    globalThis.queueMicrotask = (callback) => queued.push(callback);
    layer.refreshInteractiveBounds = () => {
      refreshCount += 1;
    };
    layer.singleStageFolderLayer.refreshRegisteredIconBounds = (() => {
      refreshCount += 10;
    }) as unknown as typeof layer.singleStageFolderLayer.refreshRegisteredIconBounds;

    try {
      layer.markInteractiveBoundsDirty();
      layer.markInteractiveBoundsDirty();
      layer.markInteractiveBoundsDirty();

      assert(refreshCount === 0, "dirty bounds should not refresh synchronously");
      assert(queued.length === 1, "dirty bounds should schedule one coalesced flush");
      assumePresent(queued.shift())();
      assert((refreshCount as number) === 11, "coalesced bounds flush should refresh desktop and folder overlay bounds once");
      layer.flushInteractiveBounds();
      assert((refreshCount as number) === 11, "clean bounds flush should not refresh again");
      layer.flushInteractiveBounds({ force: true });
      assert((refreshCount as number) === 22, "forced bounds flush should refresh desktop and folder overlay bounds even when clean");
    } finally {
      if (originalQueueMicrotask) globalThis.queueMicrotask = originalQueueMicrotask;
      else delete (globalThis as { queueMicrotask?: typeof queueMicrotask }).queueMicrotask;
    }
  }

  {
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const originalQueueMicrotask = globalThis.queueMicrotask;
    const queued: Array<() => void> = [];
    let refreshCount = 0;
    globalThis.queueMicrotask = (callback) => queued.push(callback);
    layer.refreshInteractiveBounds = () => {
      refreshCount += 1;
    };
    layer.singleStageFolderLayer.refreshRegisteredIconBounds = (() => {
      refreshCount += 10;
    }) as unknown as typeof layer.singleStageFolderLayer.refreshRegisteredIconBounds;

    try {
      layer.applyFolderOverlayTransform({
        height: 600,
        launchpadVisualTransform: { scale: 1, y: 0 },
        singleStageFolderState: { renderedFolder: { id: "folder-1" } },
        width: 800,
      });
      layer.applyFolderOverlayTransform({
        height: 600,
        launchpadVisualTransform: { scale: 1.08, y: 0 },
        singleStageFolderState: { renderedFolder: { id: "folder-1" } },
        width: 800,
      });

      assert(queued.length === 0, "active folder overlay transform should wait for spring updates before flushing bounds");
      layer.applyFolderOverlayTransform({
        height: 600,
        launchpadVisualTransform: { scale: 1, y: 0 },
        singleStageFolderState: null,
        width: 800,
      });
      assert((queued.length as number) === 1, "inactive folder overlay transform snap should refresh stale bounds immediately");
      assumePresent(queued.shift())();
      assert(refreshCount === 11, "inactive folder overlay snap should flush desktop and folder overlay bounds");
    } finally {
      if (originalQueueMicrotask) globalThis.queueMicrotask = originalQueueMicrotask;
      else delete (globalThis as { queueMicrotask?: typeof queueMicrotask }).queueMicrotask;
    }
  }
}
