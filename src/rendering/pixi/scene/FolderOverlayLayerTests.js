import {
  getClosingPreviewTiming,
  getFolderPageDotsFrame,
  getFolderPageDotVisualState,
  getFolderPageMaskRect,
  makePanelVisualRect,
} from "./folderOverlayGeometry.js";
import {
  applyClosingHandoffOnlyOverlayState,
  applyClosingPresentationOverlayState,
  cancelClosingHandoffCleanup,
  finishClosingHandoff,
  getClosingPresentationStageHitRects,
} from "./folderClosingHandoff.js";
import {
  createIconBoundsRegistry,
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderHandoffCoordinator } from "./folderHandoffCoordinator.js";
import {
  FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
  makeFolderPageTrackVisualKey,
} from "./folderVisualOwnershipRegistry.js";

const K = ICON_BOUNDS_KIND;
const V = ICON_BOUNDS_VARIANT;

function attachHandoffCoordinator(layer, options = {}) {
  const handoffCoordinator = new FolderHandoffCoordinator(layer);
  layer.folderHandoff = handoffCoordinator;
  if (options.folderId) handoffCoordinator.beginCloseTransition(options.folderId);
  if (options.frameComplete) handoffCoordinator.completeCloseFrame(handoffCoordinator.closeToken);
  for (const key of options.previewSwapKeys || []) handoffCoordinator.trackClosePreviewSwap(key);
  if (options.handoffRect || options.handoffTarget || options.detachedTarget) {
    handoffCoordinator.setCloseHandoffGeometry({
      detachedTarget: options.detachedTarget || null,
      rect: options.handoffRect || null,
      target: options.handoffTarget || null,
    });
  }
  return handoffCoordinator;
}

function makeClosingHandoffHarness(calls) {
  const layer = {
    closingPreviewSwapLayer: {
      destroyed: false,
      removeChildren() {
        calls.push("clear-swap");
        return [];
      },
    },
    pageTrack: { visible: true },
    clearClosingGhostRevealTimer() {
      calls.push("clear-timer");
    },
    clearCompletedClosingPreviewGhosts() {
      calls.push("clear-preview");
    },
    clearFrameGhost() {
      calls.push("clear-frame");
    },
    flushCompletedClosingControllerGhosts() {
      calls.push("flush-controller");
    },
  };
  attachHandoffCoordinator(layer, {
    folderId: "folder-a",
    frameComplete: true,
    previewSwapKeys: ["swap"],
  });
  return layer;
}

export async function runFolderOverlayLayerTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  const { FolderOverlayLayer } = await import("./FolderOverlayLayer.js");
  const { createLayerTransitionPort } = await import("./layerTransitionPort.js");
  const { Container } = await import("pixi.js");
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder overlay layer test failed] ${message}`);
  };

  const geometry = {
    grid: { height: 420, width: 884 },
    panel: { height: 560, width: 1000 },
  };
  const mask = getFolderPageMaskRect(geometry, 58, 64);

  assert(mask.left === 0, "folder page mask should start at the panel left edge");
  assert(mask.width === 1000, "folder page mask should cover the full panel width");
  assert(mask.top === 64, "folder page mask should preserve the grid top edge");
  assert(mask.height === 476, "folder page mask should keep the existing vertical panel coverage");

  const interactionMask = getFolderPageMaskRect(geometry, 58, 64, { topOverflow: 17 });
  assert(interactionMask.top === 47, "folder page mask should expand above the grid for interaction chrome");
  assert(interactionMask.height === 493, "expanded page masks should keep the existing bottom edge");

  {
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    assert(layer.panelContentLayer.parent === layer.panel, "folder panel content should be a child of the panel");
    assert(layer.panelClipMask.parent === layer.panel, "folder panel clip mask should track the panel transform");
    assert(layer.pageMask.parent === layer.panelContentLayer, "folder page mask should live inside the panel content layer");
    assert(layer.pageTrack.parent === layer.panelContentLayer, "folder page track should live inside the panel content layer");
    assert(layer.panelContentLayer.mask === layer.panelClipMask, "folder panel content should be clipped by the rounded panel mask");
    assert(layer.openingGhostLayer.mask === layer.panelClipMask, "opening ghosts should be clipped by the rounded panel mask");
    assert(layer.pageTrack.mask === layer.pageMask, "folder page track should keep its page viewport mask");

    layer.panelContentLayer.mask = null;
    layer.openingGhostLayer.mask = null;
    layer.refreshPanelClipMask();
    assert(layer.panelContentLayer.mask === layer.panelClipMask, "panel clip refresh should restore the panel content mask");
    assert(layer.openingGhostLayer.mask === layer.panelClipMask, "panel clip refresh should restore the opening ghost mask");

    const previousMask = layer.pageMask;
    layer.pageMaskRect = { left: 4, top: 8, width: 120, height: 160 };
    layer.rebuildPageTrackMask();
    assert(layer.pageMask !== previousMask, "page track mask rebuild should replace the stale mask instance");
    assert(previousMask.destroyed === true, "page track mask rebuild should destroy the old mask");
    assert(layer.pageMask.parent === layer.panelContentLayer, "rebuilt page mask should stay inside the panel content layer");
    assert(layer.pageTrack.mask === layer.pageMask, "page track should use the rebuilt mask");
    assert(
      layer.panelContentLayer.children.indexOf(layer.pageMask) < layer.panelContentLayer.children.indexOf(layer.pageTrack),
      "rebuilt page mask should remain before the page track"
    );
    assert(layer.openingGhostLayer.mask === layer.panelClipMask, "rebuilt page mask should not disturb the opening ghost panel clip");
    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
  }

  const dotsFrame = getFolderPageDotsFrame({
    grid: { height: 240, left: 220, top: 270, width: 720 },
    panel: { height: 360, left: 180, top: 200, width: 800 },
  });
  assert(dotsFrame.left === 180 && dotsFrame.width === 800, "Pixi page dots should span the panel width");
  assert(dotsFrame.top === 521, "Pixi page dots should sit in the lower panel padding below the grid");
  assert(dotsFrame.height === 28, "Pixi page dots should keep a stable hit height");

  const fallbackDotsFrame = getFolderPageDotsFrame({
    panel: { height: 360, left: 180, top: 200, width: 800 },
  });
  assert(fallbackDotsFrame.top === 519, "Pixi page dots should have a panel-only fallback position");
  assert(getFolderPageDotVisualState().alpha === 0.28, "idle Pixi page dots should match the DOM idle alpha");
  assert(getFolderPageDotVisualState({ hovered: true }).alpha === 0.5, "hovered Pixi page dots should match the DOM hover alpha");
  const activeDot = getFolderPageDotVisualState({ active: true, hovered: true });
  assert(activeDot.alpha === 0.96 && activeDot.scale === 1.02, "active Pixi page dots should keep the active visual while hovered");

  {
    const layer = {
      closingDesktopPageTrackMirrorX: 42,
      closingGhostLayer: { children: [] },
      frameGhostState: { height: 80, left: 120, top: 60, width: 90 },
      pageTrack: { visible: false },
      panel: { visible: false },
    };
    const port = createLayerTransitionPort(layer);
    const frame = port.getClosingPresentationFrameRect();
    const debug = port.getDebugSnapshot();
    assert(frame.left === 162, "closing presentation frame rect should include desktop mirror offset");
    assert(layer.frameGhostState.left === 120, "closing presentation frame rect should not mutate the stored frame state");
    assert(debug.framePresentation.left === 162, "closing debug frame presentation should include desktop mirror offset");
  }

  const visualRect = makePanelVisualRect(
    {
      pivot: { x: 500, y: 280 },
      scale: { x: 0.5, y: 0.25 },
      x: 620,
      y: 360,
    },
    { height: 560, width: 1000 },
    { progress: 0.6, radius: 48 }
  );
  assert(visualRect.left === 370, "panel visual rect should use the current scaled panel left");
  assert(visualRect.top === 290, "panel visual rect should use the current scaled panel top");
  assert(visualRect.width === 500, "panel visual rect should use the current scaled panel width");
  assert(visualRect.height === 140, "panel visual rect should use the current scaled panel height");
  assert(visualRect.radius === 12, "panel visual rect should scale the corner radius");
  assert(visualRect.progress === 0.6, "panel visual rect should preserve progress");

  {
    const layer = {
      hitArea: { width: 100 },
      pageDotsLayer: { eventMode: "static", hitArea: { width: 100 }, visible: true },
      pageTrack: { visible: true },
      panel: { visible: true },
    };

    applyClosingHandoffOnlyOverlayState(layer);
    assert(layer.hitArea === null, "handoff-only overlay should not keep a full-screen pointer hit area");
    assert(layer.panel.visible === false && layer.pageTrack.visible === false, "handoff-only overlay should hide stale folder visuals");
    assert(layer.pageDotsLayer.visible === false && layer.pageDotsLayer.eventMode === "none" && layer.pageDotsLayer.hitArea === null, "handoff-only overlay should disable stale page dots");
  }

  {
    const layer = {
      frameGhostState: { height: 420, left: 20, top: 30, width: 620 },
      hitArea: null,
      pageDotsLayer: { eventMode: "static", hitArea: { width: 100 }, visible: true },
      stageRect: { left: 100, top: 200, width: 800, height: 600 },
    };
    attachHandoffCoordinator(layer, {
      handoffRect: { height: 60, left: 140, top: 260, width: 60 },
    });

    const hitArea = applyClosingPresentationOverlayState(layer);
    assert(hitArea.contains(44, 64), "closing presentation overlay should keep the closing folder hit target active");
    assert(!hitArea.contains(240, 260), "closing presentation overlay should not block unrelated desktop icon positions inside the frame ghost");
    assert(layer.pageDotsLayer.visible === false && layer.pageDotsLayer.eventMode === "none" && layer.pageDotsLayer.hitArea === null, "closing presentation overlay should disable stale page dots");
  }

  {
    const layer = {
      frameGhostState: { height: 60, left: 20, top: 30, width: 60 },
      hitArea: null,
      pageDotsLayer: { eventMode: "static", hitArea: { width: 100 }, visible: true },
      stageRect: { left: 100, top: 200, width: 800, height: 600 },
    };

    const hitArea = applyClosingPresentationOverlayState(layer);
    assert(hitArea.contains(24, 34), "closing presentation overlay should fall back to the frame ghost without a stable source target");
  }

  {
    const layer = {
      frameGhostState: null,
      stageRect: { left: 100, top: 200, width: 800, height: 600 },
    };
    attachHandoffCoordinator(layer, {
      handoffRect: { height: 60, left: 140, top: 260, width: 60 },
    });
    const rects = getClosingPresentationStageHitRects(layer);
    assert(rects.length === 1, "handoff rect should project into a stage hit rect");
    assert(rects[0].left === 40 && rects[0].top === 60, "handoff client rect should be converted to stage coordinates");
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    const calls = [];
    layer.isClosing = false;
    layer.onOutsidePointerDown = () => calls.push("outside");
    layer.onPanelPointerDown = () => calls.push("panel");
    layer.panelGeometry = { height: 220, left: 120, top: 140, width: 360 };
    layer.stageRect = { height: 600, left: 0, top: 0, width: 800 };

    const makeEvent = (clientX, clientY) => ({
      nativeEvent: {
        clientX,
        clientY,
        preventDefault() {
          calls.push("prevent");
        },
        stopPropagation() {
          calls.push("stop");
        },
      },
    });

    layer.handlePointerDown(makeEvent(180, 200));
    layer.handlePointerDown(makeEvent(40, 200));
    assert(calls.join(",") === "prevent,stop,panel,prevent,stop,outside", "folder pointer down should route panel hits separately from outside hits");
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    const calls = [];
    layer.frameGhostState = { height: 420, left: 20, top: 30, width: 620 };
    layer.isClosing = true;
    layer.isUserFolderClosing = true;
    layer.onClosingFolderPointerDown = (folderId) => calls.push(`closing:${folderId}`);
    layer.stableFolderCloseTarget = { folderId: "folder-a" };
    layer.stageRect = { height: 600, left: 100, top: 200, width: 800 };
    attachHandoffCoordinator(layer, {
      handoffRect: { height: 60, left: 140, top: 260, width: 60 },
    });

    const makeEvent = (clientX, clientY) => ({
      nativeEvent: {
        clientX,
        clientY,
        preventDefault() {
          calls.push("prevent");
        },
        stopPropagation() {
          calls.push("stop");
        },
      },
    });

    layer.handlePointerDown(makeEvent(180, 300));
    layer.handlePointerDown(makeEvent(340, 460));
    assert(calls.join(",") === "prevent,stop,closing:folder-a", "closing pointer handling should only intercept the closing folder target");
  }

  {
    const iconBoundsRegistry = createIconBoundsRegistry();
    iconBoundsRegistry.registerBounds(
      K.LAUNCH,
      V.RENDERED,
      { area: "desktop", id: "folder-b" },
      { height: 72, left: 400, top: 220, width: 72 },
      { area: "desktop", id: "folder-b", item: { id: "folder-b", type: "folder" } }
    );
    iconBoundsRegistry.registerBounds(K.FOLDER_THUMB, V.RENDERED, "folder-b", { height: 64, left: 404, top: 224, width: 64 });
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const calls = [];
    layer.currentFolderId = "folder-a";
    layer.folderHandoff.beginCloseTransition("folder-a");
    layer.isClosing = true;
    layer.detachClosingPresentationForOpen = (nextFolderId) => {
      calls.push(`detach:${nextFolderId}:${layer.folderHandoff.folderId}`);
      layer.folderHandoff.clearCloseFolderId();
    };
    layer.closingGhosts = {
      clear() {},
      hasActive: () => false,
      hasPendingHandoff: () => false,
      start() {
        calls.push(`start:${layer.folderHandoff.folderId}`);
        layer.folderHandoff.beginCloseTransition("folder-b");
      },
    };

    layer.update({
      folderGridStyle: {
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
      },
      folderPageIndex: 0,
      folderPageSize: 9,
      folderPages: [[]],
      folderPanelStyle: {},
      getVisibleFolderPage: (page) => page || [],
      height: 800,
      iconSize: 64,
      isFolderClosing: true,
      renderedFolder: { childPages: [[]], id: "folder-b", name: "B", type: "folder" },
      stageRect: { height: 800, left: 0, top: 0, width: 1200 },
      width: 1200,
    });

    assert(calls.join(",") === "detach:folder-b:folder-a,start:null", "cross-folder closing update should detach the old live closing before starting the new closing");
    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;

  const makeFolderResizeItems = (prefix, count = 9) =>
    Array.from({ length: count }, (_, index) => ({
      id: `${prefix}-${index + 1}`,
      name: `${prefix} ${index + 1}`,
      type: "app",
    }));
  const folderResizePages = [
    makeFolderResizeItems("page-a"),
    makeFolderResizeItems("page-b"),
  ];
  const makeFolderResizeState = (overrides = {}) => {
    const width = overrides.width ?? 1000;
    const height = overrides.height ?? 760;
    const folderPageIndex = overrides.folderPageIndex ?? 0;
    const pages = overrides.folderPages || folderResizePages;
    return {
      dragMeta: null,
      dragReleaseGhostId: null,
      folderCloseIconGhosts: [],
      folderGridStyle: {
        gridTemplateColumns: "repeat(3, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(3, var(--folder-icon-cell-height))",
        ...overrides.folderGridStyle,
      },
      folderOpenIconGhosts: [],
      folderPageIndex,
      folderPages: pages,
      folderPageSize: 9,
      folderPanelStyle: {
        "--folder-icon-cell-height": "128px",
        "--folder-icon-size": "56px",
        "--folder-row-gap": "18px",
        "--folder-shell-min-height": "520px",
        ...overrides.folderPanelStyle,
      },
      getFolderPageRenderMode: overrides.getFolderPageRenderMode || (() => "interactive"),
      getVisibleFolderPage: (page) => page || [],
      height,
      iconSize: 64,
      isEditMode: false,
      isFolderClosing: false,
      isIconOpening: () => false,
      selectedIcon: null,
      isTextlessMode: false,
      launchTargetStatusById: {},
      renderedFolder: {
        childPages: pages,
        id: overrides.folderId || "folder-resize",
        name: "Resize Folder",
        type: "folder",
      },
      showMissingLaunchTargetBadge: true,
      stageRect: { height, left: 0, top: 0, width },
      visualFolderPageIndex: overrides.visualFolderPageIndex ?? folderPageIndex,
      width,
      ...overrides,
    };
  };
  const settleResizeUpdate = (layer, state, steps = 80) => {
    for (let index = 0; index < steps; index += 1) {
      motionRuntime.step(0.05);
      layer.update(state);
    }
  };
  const getBaseAnimation = (target, prop) => {
    const channel = motionRuntime.getChannel(target, prop);
    return Array.from(channel?.base?.values?.() || [])[0] || null;
  };
  const makeOpeningGhostEntries = (keyPrefix, items) => items.map((item, slotIndex) => ({
    item,
    key: `${keyPrefix}-${item.id}-${slotIndex}-open-1`,
    requestId: 1,
    slotIndex,
  }));
  const makeOpeningOriginBounds = (folderId, items, options = {}) => {
    const originLeft = Number(options.left) || 420;
    const originTop = Number(options.top) || 260;
    const childLeft = Number(options.childLeft) || 430;
    const childTop = Number(options.childTop) || 270;
    const childStep = Number(options.childStep) || 18;
    const childSize = Number(options.childSize) || 14;
    const previewCount = Math.max(0, Number(options.previewCount) || 9);
    return {
      folderId,
      iconRect: { height: 72, left: originLeft, top: originTop, width: 72 },
      previewChildRects: items.slice(0, previewCount).map((item, slotIndex) => ({
        childId: item.id,
        rect: {
          height: childSize,
          left: childLeft + (slotIndex % 3) * childStep,
          top: childTop + Math.floor(slotIndex / 3) * childStep,
          width: childSize,
        },
        slotIndex,
      })),
      thumbRect: { height: 64, left: originLeft + 4, top: originTop + 4, width: 64 },
    };
  };
  const getPanelCenter = (folderGeometry) => ({
    x: folderGeometry.panel.left + folderGeometry.panel.width / 2,
    y: folderGeometry.panel.top + folderGeometry.panel.height / 2,
  });
  const getPageMaskBottom = (folderGeometry) => folderGeometry.panel.height - 20;
  const getLayerPageMaskBottom = (layer) => layer.pageMaskRect.top + layer.pageMaskRect.height;

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const folderId = "folder-large-icon-frame";
    const page = makeFolderResizeItems("large-icon", 14);
    page[0] = { id: "adobe-after-effects", name: "Adobe After Effects", type: "app" };
    const state = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(2, var(--folder-icon-cell-height))",
      },
      folderId,
      folderPageSize: 14,
      folderPages: [page],
      folderPanelStyle: {
        "--folder-icon-cell-height": "184px",
        "--folder-icon-size": "128px",
        "--folder-row-gap": "24px",
        "--folder-shell-min-height": "536px",
      },
      height: 767,
      isEditMode: true,
      selectedIcon: { area: "folder", folderId, id: page[0].id, pageIndex: 0 },
      width: 900,
    });
    layer.update(state);
    settleResizeUpdate(layer, state);

    const key = `${folderId}:0:${page[0].id}`;
    const node = layer.iconNodes.get(key);
    const frame = node?.getSelectionFrameRect();
    assert(node && frame, "large-icon frame setup should render the selected folder icon");
    assert(node.state.iconSize + 24 <= node.state.cellWidth + 0.001, "large folder icons should reserve horizontal interaction padding");
    assert(frame.width <= node.state.cellWidth + 0.001, "large folder selection frames should stay inside their cell");
    assert(node.hitArea.width <= node.state.cellWidth + 0.001, "large folder edit hit areas should stay inside their cell");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const folderId = "folder-compressed-top-chrome";
    const page = makeFolderResizeItems("compressed-top", 35);
    const state = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(5, var(--folder-icon-cell-height))",
      },
      folderId,
      folderPageSize: 35,
      folderPages: [page],
      folderPanelStyle: {
        "--folder-icon-cell-height": "89.89px",
        "--folder-icon-size": "47.94px",
        "--folder-row-gap": "17.98px",
        "--folder-shell-min-height": "840px",
      },
      height: 825,
      isEditMode: true,
      selectedIcon: { area: "folder", folderId, id: page[0].id, pageIndex: 0 },
      width: 1415,
    });
    layer.update(state);
    settleResizeUpdate(layer, state);

    const key = `${folderId}:0:${page[0].id}`;
    const node = layer.iconNodes.get(key);
    const target = layer.folderIconLayoutTargets.get(key);
    const hitTop = target.y + node.hitArea.y;
    assert(hitTop - layer.pageMaskRect.top >= 11.999, "compressed first-row interaction chrome should keep 12px of mask clearance");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.pageTrackMotion = null;
    layer.pageTrack = null;
    const mode = layer.getResizeLayoutMode({
      dragReleaseGhostId: "page-b-1",
      dragReleaseState: {
        source: { folderId: "folder-resize", pageIndex: 1, type: "folder" },
      },
      folderPageIndex: 0,
      renderedFolder: { id: "folder-resize" },
      visualFolderPageIndex: 0,
    });
    assert(mode === "page-turn", "cross-page folder releases should preserve page-turn resize mode after dragMeta clears");
  }

  {
    const calls = [];
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.bindFakeRefs({
      folderPageIndex: 1,
      height: 600,
      renderedFolder: { id: "folder-resize" },
      setFolderPageRef: (_element, pageIndex) => calls.push(pageIndex),
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      visualFolderPageIndex: 0,
      width: 800,
    }, {
      grid: { height: 240, left: 120, top: 140, width: 560 },
      panel: { height: 360, left: 80, top: 100, width: 640 },
    });
    assert(calls.join(",") === "0,1", "folder page refs should bind the visual page first during drag page turns");
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const movingItem = { id: "release-backed-node", name: "Release Backed", type: "app" };
    const neighborItem = { id: "release-neighbor", name: "Release Neighbor", type: "app" };
    const folderId = "folder-release-backed-node";
    const baseState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(3, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(1, var(--folder-icon-cell-height))",
      },
      folderId,
      folderPages: [[movingItem, neighborItem]],
      folderPageSize: 3,
    });
    layer.update(baseState);
    settleResizeUpdate(layer, baseState);
    const movingKey = `${folderId}:0:${movingItem.id}`;
    const movingNode = layer.iconNodes.get(movingKey);
    const initialX = movingNode?.x;

    const releaseState = makeFolderResizeState({
      ...baseState,
      dragReleaseGhostId: movingItem.id,
      dragReleaseState: {
        item: movingItem,
        source: { folderId, index: 0, pageIndex: 0, type: "folder" },
      },
      folderPages: [[neighborItem, movingItem]],
    });
    layer.update(releaseState);
    const target = layer.folderIconLayoutTargets.get(movingKey);
    const xMotion = getBaseAnimation(movingNode, "x");

    assert(initialX !== target.x, "release-backed node setup should move the hidden real icon to a new slot");
    assert(movingNode.visible === false && movingNode.state.ghosted === true, "release-backed real icon should stay hidden behind the drag preview");
    assert(nearlyEqual(movingNode.x, target.x), "release-backed hidden real icon should snap to the release target before it is revealed");
    assert(!xMotion, "release-backed hidden real icon should not keep a layout spring that can twitch after reveal");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const folderId = "folder-opening-subpixel-layout";
    const initialState = makeFolderResizeState({
      folderId,
      folderOpenProgress: 0.52,
      folderPanelStyle: {
        "--folder-icon-cell-height": "119.2px",
        "--folder-icon-size": "82.92px",
        "--folder-row-gap": "15.55px",
      },
    });
    layer.update(initialState);

    const secondPageItem = folderResizePages[1][0];
    const secondPageKey = `${folderId}:1:${secondPageItem.id}`;
    const secondPageNode = layer.iconNodes.get(secondPageKey);
    const initialTarget = layer.folderIconLayoutTargets.get(secondPageKey);
    assert(secondPageNode && initialTarget, "subpixel opening layout setup should create the adjacent-page icon");
    assert(secondPageNode.y > initialTarget.y, "adjacent-page icons should begin their opening layout spring below the target");

    motionRuntime.step(0.05);
    const interruptedY = secondPageNode.y;
    assert(
      interruptedY > initialTarget.y && interruptedY < initialTarget.y + 10,
      "subpixel opening layout setup should interrupt an in-flight adjacent-page spring"
    );

    const measuredState = makeFolderResizeState({
      folderId,
      folderOpenProgress: 0.52,
      folderPanelStyle: {
        "--folder-icon-cell-height": "119.27px",
        "--folder-icon-size": "82.97px",
        "--folder-row-gap": "15.56px",
      },
    });
    layer.update(measuredState);
    const measuredTarget = layer.folderIconLayoutTargets.get(secondPageKey);

    assert(layer.resizeLayoutSync?.mode === "opening", "subpixel viewport measurement should start opening layout sync");
    assert(
      Math.abs(measuredTarget.y - initialTarget.y) < 0.5,
      "subpixel opening layout setup should keep the target delta below the layout-change epsilon"
    );
    assert(
      getBaseAnimation(secondPageNode, "y"),
      "canceling opening resize layout should restart the unsnapped adjacent-page spring"
    );

    settleResizeUpdate(layer, measuredState);
    const settledTarget = layer.folderIconLayoutTargets.get(secondPageKey);
    assert(
      Math.abs(secondPageNode.y - settledTarget.y) < 0.5,
      "adjacent-page icons should converge within the layout epsilon after subpixel opening sync"
    );

    const beforeDragY = secondPageNode.y;
    const dragState = makeFolderResizeState({
      ...measuredState,
      dragMeta: {
        item: secondPageItem,
        source: { folderId, index: 0, pageIndex: 1, type: "folder" },
      },
    });
    layer.update(dragState);
    assert(
      Math.abs(secondPageNode.y - beforeDragY) < 0.5,
      "long-press handoff should not visibly move a settled adjacent-page icon"
    );

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const largeIconItem = { id: "large-folder-icon", name: "Large Folder Icon", type: "app" };
    const state = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(3, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(1, var(--folder-icon-cell-height))",
      },
      folderId: "folder-large-icon-size",
      folderPages: [[largeIconItem]],
      folderPanelStyle: {
        "--folder-icon-cell-height": "160px",
        "--folder-icon-size": "88px",
        "--folder-row-gap": "18px",
        "--folder-shell-min-height": "520px",
      },
    });
    layer.update(state);

    const stableRecord = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-large-icon-size",
      id: largeIconItem.id,
      pageIndex: 0,
    });
    const renderedRecord = iconBoundsRegistry.getRecord(K.LAUNCH, V.RENDERED, {
      area: "folder",
      folderId: "folder-large-icon-size",
      id: largeIconItem.id,
      pageIndex: 0,
    });
    const node = layer.iconNodes.get(`folder-large-icon-size:0:${largeIconItem.id}`);

    assert(nearlyEqual(stableRecord?.width, 88), "folder stable layout bounds should allow icon sizes above 56px");
    assert(nearlyEqual(renderedRecord?.meta?.visualSpec?.iconSize, 88), "folder rendered bounds should publish the larger visual spec");
    assert(node?.state?.iconSize === 88, "folder icon node state should receive the larger icon size");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const narrowCellItem = { id: "narrow-folder-icon", name: "Narrow Folder Icon", type: "app" };
    const state = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(6, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(1, var(--folder-icon-cell-height))",
      },
      folderId: "folder-narrow-icon-size",
      folderPages: [[narrowCellItem]],
      folderPanelStyle: {
        "--folder-icon-cell-height": "180px",
        "--folder-icon-size": "128px",
        "--folder-row-gap": "18px",
        "--folder-shell-min-height": "520px",
      },
      width: 800,
    });
    const geometry = layer.update(state);
    const expectedCellWidth = geometry.grid.width / 6;
    const expectedIconWidth = expectedCellWidth - 24;
    const stableRecord = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-narrow-icon-size",
      id: narrowCellItem.id,
      pageIndex: 0,
    });

    assert(expectedCellWidth > 56 && expectedCellWidth < 128, "narrow-cell setup should isolate the cell-width clamp");
    assert(nearlyEqual(stableRecord?.width, expectedIconWidth), "folder icon bounds should reserve interaction padding inside a narrow cell");
    assert(nearlyEqual(stableRecord?.meta?.visualSpec?.iconSize, expectedIconWidth), "folder visual spec should match the decorated cell-width clamp");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const compactPage = makeFolderResizeItems("layout-release", 12);
    const insertedItem = { id: "layout-release-dragged", name: "Dragged", type: "app" };
    const folderId = "folder-layout-release-resize";
    const compactState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(4, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(3, var(--folder-icon-cell-height))",
      },
      folderId,
      folderPages: [compactPage],
      folderPageSize: 16,
      folderPanelStyle: {
        "--folder-icon-cell-height": "144px",
        "--folder-icon-size": "88px",
        "--folder-row-gap": "18px",
        "--folder-shell-min-height": "520px",
      },
    });
    layer.update(compactState);
    settleResizeUpdate(layer, compactState);

    const expandedPage = compactPage.slice();
    expandedPage.push(insertedItem);
    const expandedDragState = makeFolderResizeState({
      dragMeta: {
        item: insertedItem,
        source: { folderId, index: 0, pageIndex: 0, type: "folder" },
      },
      folderGridStyle: {
        gridTemplateColumns: "repeat(4, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(4, var(--folder-icon-cell-height))",
      },
      folderId,
      folderPages: [expandedPage],
      folderPageSize: 16,
      folderPanelStyle: {
        "--folder-icon-cell-height": "112px",
        "--folder-icon-size": "64px",
        "--folder-row-gap": "14px",
        "--folder-shell-min-height": "620px",
      },
    });
    layer.update(expandedDragState);
    const activeDragTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId,
      id: insertedItem.id,
      pageIndex: 0,
    });
    const expandedState = makeFolderResizeState({
      ...expandedDragState,
      dragMeta: null,
      dragReleaseGhostId: insertedItem.id,
      dragReleaseState: {
        item: insertedItem,
        source: { folderId, index: 0, pageIndex: 0, type: "folder" },
      },
    });
    layer.update(expandedState);
    const initialReleaseTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId,
      id: insertedItem.id,
      pageIndex: 0,
    });
    settleResizeUpdate(layer, expandedState);
    const finalReleaseTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId,
      id: insertedItem.id,
      pageIndex: 0,
    });

    assert(layer.resizeVisualGeometryState === null, "layout release resize setup should settle visual geometry before checking the final target");
    assert(initialReleaseTarget && finalReleaseTarget, "layout release resize setup should register release ghost targets");
    assert(layer.resizeVisualGeometryMode === null, "layout release resize should clear the active visual geometry mode after settling");
    assert(activeDragTarget?.meta?.provisionalLayoutTarget === true, "active drag target should be provisional while folder icon size is still animating");
    assert(initialReleaseTarget.meta?.provisionalLayoutTarget === true, "layout release target should be provisional while folder icon size is still animating");
    assert(finalReleaseTarget.meta?.provisionalLayoutTarget === false, "layout release target should become final after folder icon size settles");
    assert(nearlyEqual(initialReleaseTarget.top, finalReleaseTarget.top), "layout release target should already point at the final row geometry while resize is provisional");
    assert(nearlyEqual(initialReleaseTarget.width, finalReleaseTarget.width), "layout release target should already use the final icon bounds while resize is provisional");
    assert(nearlyEqual(initialReleaseTarget.meta?.visualSpec?.iconSize, finalReleaseTarget.meta?.visualSpec?.iconSize), "layout release target should publish the final icon size while resize is provisional");
    assert(nearlyEqual(initialReleaseTarget.meta?.visualSpec?.iconSize, 64), "layout release target should use the compressed folder icon size before completion");
    assert(nearlyEqual(finalReleaseTarget.meta?.visualSpec?.iconSize, 64), "layout release target should settle to the compressed folder icon size");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    const frame = {
      fillAlpha: 0.22,
      fillColor: 0xf7f8ff,
      height: 64,
      left: 240,
      progress: 0.18,
      radius: 14,
      strokeAlpha: 0.26,
      strokeColor: 0xffffff,
      strokeWidth: 1,
      top: 180,
      width: 64,
    };
    layer.frameGhostState = frame;
    layer.frameGhostPhase = "opening";
    layer.frameGhost = {
      clear() {
        this.drawn = null;
        return this;
      },
      fill() {
        return this;
      },
      roundRect(left, top, width, height, radius) {
        this.drawn = { height, left, radius, top, width };
        return this;
      },
      stroke() {
        return this;
      },
    };
    layer.notifyTitleFrame = () => {};

    layer.syncResizeFrameGhostShell({
      panel: { height: 520, left: 100, top: 80, width: 900 },
    }, {
      resizeGeometryMode: "opening",
      resizeLayoutSyncActive: true,
    });

    assert(frame.left === 240 && frame.top === 180, "opening resize sync should not snap the frame ghost to the full panel position");
    assert(frame.width === 64 && frame.height === 64, "opening resize sync should not flash a full-size frame ghost shell");
    assert(layer.frameGhost.drawn == null, "opening resize sync should leave the current frame ghost drawing to the active morph");
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    iconBoundsRegistry.registerBounds(
      K.TOP_LEVEL,
      V.RENDERED,
      "folder-resize",
      { height: 64, left: 80, top: 90, width: 64 },
      { area: "desktop", id: "folder-resize" }
    );
    iconBoundsRegistry.registerBounds(
      K.FOLDER_THUMB,
      V.RENDERED,
      "folder-resize",
      { height: 58, left: 83, top: 93, width: 58 },
      { area: "desktop", id: "folder-resize" }
    );
    const renderRequests = [];
    const layer = new FolderOverlayLayer({
      iconBoundsRegistry,
      onRenderRequest: (reason) => renderRequests.push(reason),
    });

    const smallState = makeFolderResizeState({ folderPageIndex: 1, height: 746, visualFolderPageIndex: 1, width: 824 });
    const smallGeometry = layer.update(smallState);
    settleResizeUpdate(layer, smallState);
    renderRequests.length = 0;
    const smallPageMask = layer.pageMask;
    const smallPanelClipMask = layer.panelClipMask;
    layer.frameGhostState = {
      fillAlpha: 0.26,
      fillColor: 0xf7f8ff,
      height: smallGeometry.panel.height,
      left: smallGeometry.panel.left,
      progress: 1,
      radius: 48,
      strokeAlpha: 0.24,
      strokeColor: 0xffffff,
      strokeWidth: 1,
      top: smallGeometry.panel.top,
      width: smallGeometry.panel.width,
    };
    layer.frameGhostPhase = "opening";
    layer.frameGhost.visible = true;
    const largeState = makeFolderResizeState({ folderPageIndex: 1, height: 912, visualFolderPageIndex: 1, width: 1707 });
    const largeGeometry = layer.update(largeState);
    const largeCenter = getPanelCenter(largeGeometry);

    assert(layer.resizeLayoutSync?.remainingRenders === 1, "window resize should keep resize layout sync active for one follow-up render");
    assert(renderRequests.length === 1, "window resize should request the follow-up render needed to settle Pixi mask/layout state");
    assert(renderRequests[0] === "folder-resize-layout", "window resize follow-up render should use the resize layout reason");
    assert(layer.panelClipMask !== smallPanelClipMask, "resize should replace the panel clip mask so content is not clipped by stale rounded geometry");
    assert(smallPanelClipMask.destroyed === true, "resize should destroy the stale panel clip mask after replacement");
    assert(layer.panelContentLayer.mask === layer.panelClipMask, "resize should bind panel content to the rebuilt panel clip mask");
    assert(layer.openingGhostLayer.mask === layer.panelClipMask, "resize should bind opening ghosts to the rebuilt panel clip mask");
    assert(nearlyEqual(layer.pageMaskRect.width, smallGeometry.panel.width), "resize should begin from the previous visual panel width");
    assert(layer.pageMask !== smallPageMask, "resize should replace the page mask instance so Pixi does not keep a stale clip");
    assert(smallPageMask.destroyed === true, "resize should destroy the stale page mask after replacement");
    assert(layer.pageTrack.mask === layer.pageMask, "resize should bind pageTrack to the rebuilt page mask");
    assert(!nearlyEqual(layer.pageTrack.x, -largeGeometry.panel.width), "resize should not snap pageTrack to the new page span immediately");
    assert(!nearlyEqual(layer.panel.x, largeCenter.x), "resize should not snap the panel x to the new geometry target immediately");
    assert(!nearlyEqual(layer.panel.y, largeCenter.y), "resize should not snap the panel y to the new geometry target immediately");
    assert(nearlyEqual(layer.frameGhostState.height, smallGeometry.panel.height), "opening frame shell should begin resize from the previous visual panel height");
    layer.update(largeState);
    assert(layer.resizeLayoutSync === null, "resize layout sync should end after the follow-up render consumes the stable layout");
    assert(layer.resizeVisualGeometryState !== null, "resize visual geometry should keep animating after the mask/layout sync settles");
    const renderRequestCountBeforeSettle = renderRequests.length;
    settleResizeUpdate(layer, largeState);
    assert(layer.resizeVisualGeometryState === null, "resize visual geometry should clear after reaching the new geometry");
    assert(renderRequests.length > renderRequestCountBeforeSettle, "resize visual geometry animation should request frames while settling");
    assert(nearlyEqual(layer.pageMaskRect.width, largeGeometry.panel.width), "settled resize should redraw the folder page mask to the new panel width");
    assert(nearlyEqual(layer.pageTrack.x, -largeGeometry.panel.width), "settled second-page resize should align pageTrack to the new page span");
    assert(nearlyEqual(layer.panel.x, largeCenter.x), "settled resize should align the panel x to the new geometry target");
    assert(nearlyEqual(layer.panel.y, largeCenter.y), "settled resize should align the panel y to the new geometry target");
    assert(nearlyEqual(layer.frameGhostState.height, largeGeometry.panel.height), "opening frame shell should settle to the new visual panel height");
    for (const [key, target] of layer.folderIconLayoutTargets) {
      const node = layer.iconNodes.get(key);
      assert(node, `resize test setup should keep icon node ${key}`);
      assert(nearlyEqual(node.x, target.x), `settled resize should align ${key} icon x to the render plan target`);
      assert(nearlyEqual(node.y, target.y), `settled resize should align ${key} icon y to the render plan target`);
    }

    const settledRenderRequestCount = renderRequests.length;
    layer.update(largeState);
    assert(renderRequests.length === settledRenderRequestCount, "final stable resize render should not request another frame");

    const firstIconNode = layer.iconNodes.values().next().value;
    firstIconNode.position.set(firstIconNode.x + 80, firstIconNode.y + 40);
    layer.pageTrack.x = -320;
    const beforeLateStyleMask = layer.pageMask;
    const beforeLateStylePanelClipMask = layer.panelClipMask;
    const lateStyleGeometry = layer.update(makeFolderResizeState({
      folderPageIndex: 1,
      folderPanelStyle: {
        "--folder-icon-cell-height": "108px",
        "--folder-icon-size": "48px",
        "--folder-row-gap": "12px",
      },
      height: 912,
      visualFolderPageIndex: 1,
      width: 1707,
    }));
    assert(layer.resizeLayoutSync?.remainingRenders === 1, "late folder viewport style changes should restart resize layout sync");
    assert(renderRequests.length > settledRenderRequestCount, "late folder viewport style changes should request another resize follow-up render");
    assert(layer.panelClipMask !== beforeLateStylePanelClipMask, "late folder viewport style changes should rebuild the panel clip mask instance");
    assert(layer.pageMask !== beforeLateStyleMask, "late folder viewport style changes should rebuild the page mask instance");
    assert(nearlyEqual(layer.pageTrack.x, -lateStyleGeometry.panel.width), "late folder viewport style changes should resnap pageTrack");
    for (const [key, target] of layer.folderIconLayoutTargets) {
      const node = layer.iconNodes.get(key);
      assert(nearlyEqual(node.x, target.x), `late folder viewport style changes should snap ${key} icon x`);
      assert(nearlyEqual(node.y, target.y), `late folder viewport style changes should snap ${key} icon y`);
    }

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });

    layer.update(makeFolderResizeState({ folderPageIndex: 0, height: 760, visualFolderPageIndex: 0, width: 1000 }));
    layer.update(makeFolderResizeState({ folderPageIndex: 1, height: 760, visualFolderPageIndex: 1, width: 1000 }));
    const livePageTrackX = layer.pageTrack.x;
    const resizedGeometry = layer.update(makeFolderResizeState({
      folderPageIndex: 1,
      folderPageTurnToken: "turn-1",
      height: 840,
      visualFolderPageIndex: 1,
      width: 1320,
    }));

    assert(layer.resizeLayoutSync?.mode === "page-turn", "resize during an active page turn should preserve page-turn mode");
    assert(layer.resizeVisualGeometryState === null, "non-drag page-turn resizes should not start a visual geometry animation");
    assert(nearlyEqual(layer.pageTrack.x, livePageTrackX), "resize during an active page turn should not snap pageTrack to the destination page");
    assert(nearlyEqual(layer.pageTrackMotion.targetX, -resizedGeometry.panel.width), "page-turn resize should retarget motion to the new page span");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });

    const openingState = makeFolderResizeState({
      folderOpenProgress: 0.42,
      folderPageIndex: 0,
      height: 853,
      visualFolderPageIndex: 0,
      width: 1365,
    });
    layer.update(openingState);

    const openingResizeState = makeFolderResizeState({
      ...openingState,
      folderPanelStyle: {
        "--folder-icon-cell-height": "112px",
        "--folder-icon-size": "50px",
        "--folder-row-gap": "18px",
        "--folder-shell-min-height": "840px",
      },
    });
    layer.update(openingResizeState);
    assert(layer.resizeLayoutSync?.mode === "opening", "test setup should leave an opening resize sync active");

    const turnGeometry = layer.update(makeFolderResizeState({
      ...openingResizeState,
      folderPageTurnToken: "turn-during-opening-resize",
      visualFolderPageIndex: 1,
    }));

    assert(
      !nearlyEqual(layer.pageTrack.x, -turnGeometry.panel.width),
      "page turn during an opening resize sync should animate from the live page instead of snapping to the destination"
    );
    assert(
      nearlyEqual(layer.pageTrackMotion.targetX, -turnGeometry.panel.width),
      "page turn during an opening resize sync should still retarget the page track to the destination page"
    );

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const compactPages = [makeFolderResizeItems("opening-release", 14)];
    const insertedItem = { id: "opening-release-dragged", name: "Dragged", type: "app" };
    const compactState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(2, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-release-row-grow",
      folderOpenProgress: 0.52,
      folderPages: compactPages,
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "410px",
      },
    });
    layer.update(compactState);
    settleResizeUpdate(layer, compactState);

    const expandedPage = compactPages[0].slice();
    expandedPage.push(insertedItem);
    const expandedState = makeFolderResizeState({
      dragReleaseGhostId: insertedItem.id,
      dragReleaseState: {
        item: insertedItem,
        source: { index: 0, pageIndex: 0, type: "page" },
      },
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(3, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-release-row-grow",
      folderOpenProgress: 0.52,
      folderPages: [expandedPage],
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "520px",
      },
    });
    layer.update(expandedState);
    const initialReleaseTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-opening-release-row-grow",
      id: insertedItem.id,
      pageIndex: 0,
    });
    settleResizeUpdate(layer, expandedState);
    const finalReleaseTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-opening-release-row-grow",
      id: insertedItem.id,
      pageIndex: 0,
    });

    assert(layer.resizeVisualGeometryState === null, "release row-growth setup should settle visual geometry before checking the final target");
    assert(initialReleaseTarget && finalReleaseTarget, "row-growth release setup should register release ghost targets");
    assert(initialReleaseTarget.meta?.provisionalLayoutTarget === true, "row-growth release target should be marked provisional while opening geometry is still animating");
    assert(finalReleaseTarget.meta?.provisionalLayoutTarget === false, "row-growth release target should become final after opening geometry settles");
    assert(nearlyEqual(initialReleaseTarget.left, finalReleaseTarget.left), "row-growth release target should already use the final column geometry while opening is provisional");
    assert(nearlyEqual(initialReleaseTarget.top, finalReleaseTarget.top), "row-growth release target should already use the final row geometry while opening is provisional");
    assert(nearlyEqual(initialReleaseTarget.width, finalReleaseTarget.width), "row-growth release target should already use the final icon bounds while opening is provisional");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const compactPages = [makeFolderResizeItems("opening-shift", 14)];
    const insertedItem = { id: "opening-shift-dragged", name: "Dragged", type: "app" };
    const shiftedItemId = "opening-shift-14";
    const openingGhosts = makeOpeningGhostEntries("folder-opening-row-shift", compactPages[0]);
    const compactState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(2, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-row-shift",
      folderOpenIconGhosts: openingGhosts,
      folderOpenProgress: 0.52,
      folderPages: compactPages,
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "410px",
      },
    });
    layer.update(compactState);
    settleResizeUpdate(layer, compactState);
    const compactShiftedTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-opening-row-shift",
      id: shiftedItemId,
      pageIndex: 0,
    });
    const sameRowShiftedItemId = "opening-shift-7";
    const compactSameRowShiftedTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-opening-row-shift",
      id: sameRowShiftedItemId,
      pageIndex: 0,
    });
    const expandedPage = compactPages[0].slice();
    expandedPage.splice(7, 0, insertedItem);
    let retargetCall = null;
    layer.folderHandoff.beginOpeningVisuals({ sessionToken: "opening-row-shift", state: compactState });
    layer.folderHandoff.registerOpeningGhost(shiftedItemId, "opening-row-shift-ghost");
    layer.folderHandoff.registerOpeningGhost(sameRowShiftedItemId, "opening-row-shift-same-row-ghost");
    layer.openingGhosts = {
      clear() {},
      finishTransition() {},
      retarget(_state, targets, options) {
        retargetCall = { options, targets };
      },
    };

    const expandedState = makeFolderResizeState({
      dragMeta: {
        item: insertedItem,
        source: { index: 0, pageIndex: 0, type: "page" },
      },
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(3, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-row-shift",
      folderOpenIconGhosts: openingGhosts,
      folderOpenProgress: 0.52,
      folderPages: [expandedPage],
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "520px",
      },
    });
    layer.update(expandedState);
    const shiftedGhostTarget = retargetCall?.targets?.find((target) => target.item?.id === shiftedItemId);
    const sameRowShiftedGhostTarget = retargetCall?.targets?.find((target) => target.item?.id === sameRowShiftedItemId);
    const expandedShiftedTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-opening-row-shift",
      id: shiftedItemId,
      pageIndex: 0,
    });
    const expandedSameRowShiftedTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-opening-row-shift",
      id: sameRowShiftedItemId,
      pageIndex: 0,
    });

    assert(shiftedGhostTarget, "shifted opening ghost should be retargeted when insertion adds a row");
    assert(nearlyEqual(shiftedGhostTarget.targetStageLayoutRect.left, expandedShiftedTarget.left), "row-growth insertion should retarget shifted ghosts to the stable final column");
    assert(nearlyEqual(shiftedGhostTarget.targetStageLayoutRect.top, expandedShiftedTarget.top), "row-growth insertion should retarget shifted ghosts to the stable final row");
    assert(sameRowShiftedGhostTarget, "same-row shifted opening ghost should be retargeted when row-growth insertion changes its slot");
    assert(nearlyEqual(sameRowShiftedGhostTarget.targetStageLayoutRect.left, expandedSameRowShiftedTarget.left), "row-growth insertion should also target same-row shifts to the stable final column");
    assert(nearlyEqual(sameRowShiftedGhostTarget.targetStageLayoutRect.top, expandedSameRowShiftedTarget.top), "row-growth insertion should also target same-row shifts to the stable final row");
    assert(!nearlyEqual(expandedShiftedTarget.top, compactShiftedTarget.top), "row-growth insertion setup should move the shifted item to a new final row");
    assert(nearlyEqual(expandedSameRowShiftedTarget.left, compactSameRowShiftedTarget.left), "same-row insertion setup should leave unaffected columns stable");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const compactPages = [makeFolderResizeItems("opening-grow", 6)];
    const expandedPages = [makeFolderResizeItems("opening-grow", 7)];
    const compactState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateRows: "repeat(2, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-row-grow",
      folderOpenProgress: 0.52,
      folderPages: compactPages,
      folderPanelStyle: {
        "--folder-shell-min-height": "410px",
      },
    });
    const compactGeometry = layer.update(compactState);
    settleResizeUpdate(layer, compactState);
    const activeGhostItemId = "opening-grow-6";
    const compactGhostTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-opening-row-grow",
      id: activeGhostItemId,
      pageIndex: 0,
    });
    let retargetCall = null;
    layer.folderHandoff.beginOpeningVisuals({ sessionToken: "opening-row-grow", state: compactState });
    layer.folderHandoff.registerOpeningGhost(activeGhostItemId, "opening-row-grow-ghost");
    layer.openingGhosts = {
      clear() {},
      finishTransition() {},
      retarget(_state, targets, options) {
        retargetCall = { options, targets };
      },
    };

    const expandedState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateRows: "repeat(3, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-row-grow",
      folderOpenProgress: 0.52,
      folderPages: expandedPages,
      folderPanelStyle: {
        "--folder-shell-min-height": "520px",
      },
    });
    const expandedGeometry = layer.update(expandedState);
    const activeGhostTarget = retargetCall?.targets?.[0] || null;
    const expandedGhostTarget = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, {
      area: "folder",
      folderId: "folder-opening-row-grow",
      id: activeGhostItemId,
      pageIndex: 0,
    });

    assert(layer.resizeLayoutSync?.mode === "opening", "row growth during open should be classified as opening layout sync");
    assert(layer.resizeVisualGeometryState !== null, "row growth during open should start a visual geometry animation");
    assert(layer.resizeVisualGeometryMode === "opening", "row growth visual geometry should remember the opening mode");
    assert(nearlyEqual(layer.resizeVisualGeometryState.panelHeight, compactGeometry.panel.height), "row growth during open should begin from the previous panel height");
    assert(nearlyEqual(getLayerPageMaskBottom(layer), getPageMaskBottom(compactGeometry)), "row growth during open should keep the previous visual mask bottom initially");
    assert(!nearlyEqual(getLayerPageMaskBottom(layer), getPageMaskBottom(expandedGeometry)), "row growth during open should not jump the mask directly to the expanded bottom");
    assert(activeGhostTarget?.item?.id === activeGhostItemId, "active opening ghost should be retargeted during row growth");
    assert(nearlyEqual(activeGhostTarget.targetStageLayoutRect.top, expandedGhostTarget.top), "opening ghost retarget should use the stable expanded row target");
    assert(!nearlyEqual(compactGhostTarget.top, expandedGhostTarget.top), "row growth setup should still prove the stable row moved");
    assert(retargetCall?.options?.frameTargetRect === expandedGeometry.panel, "opening frame shell should still retarget toward the final expanded panel");

    layer.update(expandedState);
    assert(layer.resizeLayoutSync === null, "opening row growth sync should settle after the follow-up render");
    assert(layer.resizeVisualGeometryState !== null, "opening row growth should keep animating after layout sync clears");
    settleResizeUpdate(layer, expandedState);
    assert(layer.resizeVisualGeometryState === null, "opening row growth visual geometry should clear after reaching the expanded geometry");
    assert(nearlyEqual(getLayerPageMaskBottom(layer), getPageMaskBottom(expandedGeometry)), "opening row growth should settle the visual mask to the expanded target");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const compactPages = [makeFolderResizeItems("opening-held", 14)];
    const insertedItem = { id: "opening-held-dragged", name: "Dragged", type: "app" };
    const shiftedItemId = "opening-held-14";
    const openingOriginBounds = makeOpeningOriginBounds("folder-opening-held", compactPages[0]);
    const openingGhosts = makeOpeningGhostEntries("folder-opening-held", compactPages[0]);
    const compactState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(2, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-held",
      folderOpeningOriginBounds: openingOriginBounds,
      folderOpenIconGhosts: openingGhosts,
      folderOpenProgress: 0.52,
      folderPages: compactPages,
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "410px",
      },
    });
    layer.update(compactState);
    for (let index = 0; index < 50; index += 1) {
      motionRuntime.step(0.05);
      layer.update(compactState);
    }
    const shiftedKey = `folder-opening-held:0:${shiftedItemId}`;
    const shiftedNode = layer.iconNodes.get(shiftedKey);
    assert(shiftedNode?.visible === false, "arrived opening ghosts should keep real icons hidden while the folder is still opening");
    assert(layer.folderHandoff.hasOpeningGhost(shiftedItemId), "arrived opening ghosts should keep ownership so held-drag reorders can retarget them");
    assert(
      layer.openingGhostLayer.children.some((ghost) => ghost.item?.id === shiftedItemId),
      "arrived opening ghosts should stay mounted while the folder is still opening"
    );

    const expandedPage = compactPages[0].slice();
    expandedPage.splice(7, 0, insertedItem);
    const expandedState = makeFolderResizeState({
      dragMeta: {
        item: insertedItem,
        source: { index: 0, pageIndex: 0, type: "page" },
      },
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(3, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-held",
      folderOpeningOriginBounds: openingOriginBounds,
      folderOpenIconGhosts: openingGhosts,
      folderOpenProgress: 0.72,
      folderPages: [expandedPage],
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "520px",
      },
    });
    layer.update(expandedState);

    assert(layer.resizeLayoutSync?.mode === "opening", "held-drag row growth should still be treated as opening resize geometry");
    assert(layer.folderHandoff.hasOpeningGhost(shiftedItemId), "row-growth reorders should keep shifted opening ghosts owned");
    assert(shiftedNode.visible === false, "row-growth reorders should keep shifted real icons hidden instead of exposing snapped layout nodes");
    assert(
      layer.openingGhostLayer.children.some((ghost) => ghost.item?.id === shiftedItemId),
      "row-growth reorders should retarget the mounted opening ghost instead of revealing the real icon"
    );

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const compactPages = [makeFolderResizeItems("opening-retarget", 14)];
    const insertedItem = { id: "opening-retarget-dragged", name: "Dragged", type: "app" };
    const shiftedItemId = "opening-retarget-14";
    const openingOriginBounds = makeOpeningOriginBounds("folder-opening-retarget", compactPages[0]);
    const openingGhosts = makeOpeningGhostEntries("folder-opening-retarget", compactPages[0]);
    const compactState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(2, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-retarget",
      folderOpeningOriginBounds: openingOriginBounds,
      folderOpenIconGhosts: openingGhosts,
      folderOpenProgress: 0.58,
      folderPages: compactPages,
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "410px",
      },
    });
    layer.update(compactState);
    motionRuntime.step(0.05);
    layer.update(compactState);

    const expandedPage = compactPages[0].slice();
    expandedPage.splice(7, 0, insertedItem);
    const expandedState = makeFolderResizeState({
      dragMeta: {
        item: insertedItem,
        source: { index: 0, pageIndex: 0, type: "page" },
      },
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(3, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-retarget",
      folderOpeningOriginBounds: openingOriginBounds,
      folderOpenIconGhosts: openingGhosts,
      folderOpenProgress: 0.58,
      folderPages: [expandedPage],
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "520px",
      },
    });
    layer.update(expandedState);
    const shiftedGhost = layer.openingGhostLayer.children.find((ghost) => ghost.item?.id === shiftedItemId);
    const firstTargetY = getBaseAnimation(shiftedGhost, "y")?.to;
    motionRuntime.step(0.05);
    layer.update(expandedState);
    const secondTargetY = getBaseAnimation(shiftedGhost, "y")?.to;

    assert(shiftedGhost, "row-growth retarget setup should keep the shifted opening ghost mounted");
    assert(layer.resizeVisualGeometryState !== null, "row-growth retarget setup should keep resize geometry active");
    assert(
      nearlyEqual(firstTargetY, secondTargetY),
      "opening ghosts should not retarget solely because row-growth geometry advanced without a drag reorder"
    );

    const movedPage = compactPages[0].slice();
    movedPage.splice(14, 0, insertedItem);
    layer.update({
      ...expandedState,
      folderPages: [movedPage],
      renderedFolder: {
        ...expandedState.renderedFolder,
        childPages: [movedPage],
      },
    });
    const movedTargetY = getBaseAnimation(shiftedGhost, "y")?.to;
    assert(
      !nearlyEqual(secondTargetY, movedTargetY),
      "opening ghosts should still retarget when the held drag reorders the folder slot"
    );

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const compactPages = [makeFolderResizeItems("opening-frame-layout", 7)];
    const compactState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(1, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-frame-layout",
      folderOpenProgress: 1,
      folderPages: compactPages,
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "300px",
      },
    });
    const compactGeometry = layer.update(compactState);
    settleResizeUpdate(layer, compactState);

    const iconKey = "folder-opening-frame-layout:0:opening-frame-layout-7";
    const iconNode = layer.iconNodes.get(iconKey);
    const initialTarget = layer.folderIconLayoutTargets.get(iconKey);
    assert(iconNode && initialTarget, "opening frame layout setup should create a settled visible folder icon");

    layer.frameGhostState = {
      fillAlpha: 0.26,
      fillColor: 0xf7f8ff,
      height: compactGeometry.panel.height,
      left: compactGeometry.panel.left,
      progress: 0.82,
      radius: 48,
      strokeAlpha: 0.24,
      strokeColor: 0xffffff,
      strokeWidth: 1,
      top: compactGeometry.panel.top,
      width: compactGeometry.panel.width,
    };
    layer.frameGhostPhase = "opening";
    layer.frameGhost.visible = true;

    const draggedItem = { id: "opening-frame-layout-dragged", name: "Dragged", type: "app" };
    const expandedPage = compactPages[0].slice();
    expandedPage.splice(0, 0, draggedItem);
    const expandedState = makeFolderResizeState({
      dragMeta: {
        item: draggedItem,
        source: { index: 0, pageIndex: 0, type: "page" },
      },
      folderGridStyle: {
        gridTemplateColumns: "repeat(7, var(--folder-icon-cell-width))",
        gridTemplateRows: "repeat(2, var(--folder-icon-cell-height))",
      },
      folderId: "folder-opening-frame-layout",
      folderOpenProgress: 1,
      folderPages: [expandedPage],
      folderPageSize: 35,
      folderPanelStyle: {
        "--folder-shell-min-height": "410px",
      },
    });
    layer.update(expandedState);
    const movedTarget = layer.folderIconLayoutTargets.get(iconKey);

    assert(layer.resizeLayoutSync?.mode === "opening", "active opening frame should keep row-growth resize in opening mode after progress settles");
    assert(layer.resizeVisualGeometryState !== null, "active opening frame should still animate row-growth geometry");
    assert(!nearlyEqual(initialTarget.y, movedTarget.y), "opening frame layout setup should move the icon target to a new row");
    assert(
      !nearlyEqual(iconNode.x, movedTarget.x) || !nearlyEqual(iconNode.y, movedTarget.y),
      "visible icons should animate row-growth layout while the opening frame is still active"
    );
    assert(
      getBaseAnimation(iconNode, "x") || getBaseAnimation(iconNode, "y"),
      "visible icons should keep a layout spring instead of snapping during active opening frame row growth"
    );

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const baseState = makeFolderResizeState({
      folderId: "folder-opening-layout",
      folderOpenProgress: 0.52,
    });
    layer.update(baseState);
    settleResizeUpdate(layer, baseState);

    const iconKey = "folder-opening-layout:0:page-a-2";
    const iconNode = layer.iconNodes.get(iconKey);
    const initialTarget = layer.folderIconLayoutTargets.get(iconKey);
    assert(iconNode && initialTarget, "opening layout commit setup should create a visible folder icon node");
    assert(nearlyEqual(iconNode.y, initialTarget.y), "opening layout commit setup should start from the settled layout target");
    assert(iconNode.visible === true, "opening layout commit setup should leave released real icons visible");

    const movedState = makeFolderResizeState({
      folderId: "folder-opening-layout",
      folderOpenProgress: 0.52,
      folderPanelStyle: {
        "--folder-icon-cell-height": "96px",
      },
    });
    layer.update(movedState);

    assert(layer.resizeLayoutSync?.mode === "opening", "folder commits during open should be classified as opening layout sync");
    assert(layer.resizeVisualGeometryState !== null, "folder commits during open should start visual layout metric animation");
    motionRuntime.step(0.05);
    layer.update(movedState);
    const movedTarget = layer.folderIconLayoutTargets.get(iconKey);
    assert(!nearlyEqual(initialTarget.y, movedTarget.y), "opening layout commit setup should move the icon target after the visual metrics advance");
    assert(!nearlyEqual(iconNode.y, movedTarget.y), "visible folder icons should animate opening-time layout commits instead of snapping");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const baseState = makeFolderResizeState({
      folderId: "folder-opening-owned",
      folderOpenProgress: 0.52,
    });
    layer.update(baseState);
    settleResizeUpdate(layer, baseState);

    const iconKey = "folder-opening-owned:0:page-a-2";
    const iconNode = layer.iconNodes.get(iconKey);
    const visualKey = makeFolderIconVisualKey("folder-opening-owned", "page-a-2", 0);
    layer.acquireVisualOwnership(visualKey, {
      folderId: "folder-opening-owned",
      kind: "opening",
      token: "opening-token",
    });
    iconNode.visible = false;

    const movedState = makeFolderResizeState({
      folderId: "folder-opening-owned",
      folderOpenProgress: 0.52,
      folderPanelStyle: {
        "--folder-icon-cell-height": "96px",
      },
    });
    layer.update(movedState);
    assert(layer.resizeLayoutSync?.mode === "opening", "owned icon setup should still exercise opening layout sync");
    motionRuntime.step(0.05);
    layer.update(movedState);
    const movedTarget = layer.folderIconLayoutTargets.get(iconKey);

    assert(iconNode.visible === false, "visual ownership should keep the real folder icon hidden across state sync");
    assert(nearlyEqual(iconNode.y, movedTarget.y), "covered folder icons may snap to the current visual layout while their ghost owns the visible motion");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = new FolderOverlayLayer({ iconBoundsRegistry });
    const compactState = makeFolderResizeState({
      folderGridStyle: {
        gridTemplateRows: "repeat(2, var(--folder-icon-cell-height))",
      },
      folderPageIndex: 0,
      folderPanelStyle: {
        "--folder-shell-min-height": "410px",
      },
      height: 760,
      visualFolderPageIndex: 0,
      width: 1000,
    });
    const compactGeometry = layer.update(compactState);
    settleResizeUpdate(layer, compactState);
    const livePageTrackX = layer.pageTrack.x;
    const stableIconKey = "folder-resize:0:page-a-2";
    const stableIconNode = layer.iconNodes.get(stableIconKey);
    const stableIconInitialTarget = layer.folderIconLayoutTargets.get(stableIconKey);
    assert(stableIconNode && stableIconInitialTarget, "drag-driven page-turn resize test should start with a stable icon node");
    const expandedPageTurnState = makeFolderResizeState({
      dragMeta: {
        item: { id: "page-a-1", name: "Page A 1", type: "app" },
        source: { area: "folder", folderId: "folder-resize", pageIndex: 0 },
      },
      folderGridStyle: {
        gridTemplateRows: "repeat(3, var(--folder-icon-cell-height))",
      },
      folderPageIndex: 0,
      folderPageTurnToken: "drag-turn-1",
      folderPanelStyle: {
        "--folder-shell-min-height": "520px",
      },
      height: 760,
      visualFolderPageIndex: 1,
      width: 1000,
    });
    const expandedGeometry = layer.update(expandedPageTurnState);
    const stableIconResizeTarget = layer.folderIconLayoutTargets.get(stableIconKey);
    const stableIconBoundsKey = { area: "folder", folderId: "folder-resize", id: "page-a-2", pageIndex: 0 };
    const liveIconTargetRecord = iconBoundsRegistry.getRecord(K.LAUNCH, V.LIVE_TARGET, stableIconBoundsKey);
    const stableIconTargetRecord = iconBoundsRegistry.getRecord(K.LAUNCH, V.STABLE_STAGE_LAYOUT, stableIconBoundsKey);

    assert(layer.resizeLayoutSync?.mode === "page-turn", "drag-driven page-turn resize should preserve page-turn mode");
    assert(layer.resizeVisualGeometryState !== null, "drag-driven page-turn resize should start a visual geometry animation");
    assert(layer.resizeVisualGeometryMode === "page-turn", "drag-driven page-turn resize should remember the page-turn geometry mode");
    assert(nearlyEqual(layer.resizeVisualGeometryState.panelHeight, compactGeometry.panel.height), "drag-driven page-turn resize should begin from the previous panel height");
    assert(nearlyEqual(getLayerPageMaskBottom(layer), getPageMaskBottom(compactGeometry)), "drag-driven page-turn resize should keep the previous visual mask bottom initially");
    assert(nearlyEqual(layer.pageTrack.x, livePageTrackX), "drag-driven page-turn resize should not snap the page track while the sync frame is active");
    assert(liveIconTargetRecord && stableIconTargetRecord, "drag-driven page-turn resize should register both live and stable icon targets");
    assert(!nearlyEqual(liveIconTargetRecord.top, stableIconTargetRecord.top), "stable icon targets should use final geometry instead of the resize animation frame");
    assert(nearlyEqual(stableIconInitialTarget.y, stableIconResizeTarget.y), "drag-driven page-turn resize should begin icon layout from the previous visual metrics");
    motionRuntime.step(0.05);
    layer.update(expandedPageTurnState);
    const stableIconAdvancedTarget = layer.folderIconLayoutTargets.get(stableIconKey);
    assert(
      !nearlyEqual(stableIconInitialTarget.x, stableIconAdvancedTarget.x) ||
        !nearlyEqual(stableIconInitialTarget.y, stableIconAdvancedTarget.y),
      "drag-driven page-turn resize should move visual icon targets after the resize metrics advance"
    );
    assert(!nearlyEqual(stableIconNode.y, stableIconAdvancedTarget.y), "drag-driven page-turn resize should keep icon layout spring animation instead of snapping");

    layer.update(expandedPageTurnState);
    assert(layer.resizeLayoutSync === null, "drag-driven page-turn resize sync should settle after the follow-up render");
    assert(layer.resizeVisualGeometryState !== null, "drag-driven page-turn resize should keep animating after layout sync clears");
    assert(!nearlyEqual(layer.pageTrack.x, -expandedGeometry.panel.width), "drag-driven page-turn resize should not snap the page track after layout sync clears");
    settleResizeUpdate(layer, expandedPageTurnState);
    assert(layer.resizeVisualGeometryState === null, "drag-driven page-turn resize should clear after reaching the new geometry");
    assert(nearlyEqual(getLayerPageMaskBottom(layer), getPageMaskBottom(expandedGeometry)), "drag-driven page-turn resize should settle the visual mask to the expanded target");
    assert(nearlyEqual(layer.pageTrackMotion.targetX, -expandedGeometry.panel.width), "drag-driven page-turn resize should retarget page track motion to the visual page span");

    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    motionRuntime.configureDebug({ enabled: true });
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.currentFolderId = null;
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    layer.openingGhosts = { finishTransition() {} };
    layer.panelAlphaTarget = null;
    layer.panelOpenTargetKey = null;
    layer.markRegisteredBoundsDirty = () => {};
    layer.notifyPanelTitleFrame = () => {};
    layer.panel = {
      alpha: 1,
      x: 0,
      y: 0,
      scale: {
        x: 1,
        y: 1,
        set(x, y = x) {
          this.x = x;
          this.y = y;
        },
      },
    };
    layer.panel.position = {
      set(x, y) {
        layer.panel.x = x;
        layer.panel.y = y;
      },
    };
    const panelRect = { height: 360, left: 180, top: 200, width: 800 };
    const stageRect = { height: 600, left: 0, top: 0, width: 1000 };
    const baseState = {
      isFolderAppLaunchClosing: false,
      renderedFolder: { id: "folder-1" },
      stageRect,
    };

    layer.animatePanel({ ...baseState, isFolderClosing: false }, 580, 380, panelRect, null);
    motionRuntime.step(0.02);
    layer.animatePanel(
      { ...baseState, isFolderClosing: true },
      580,
      380,
      panelRect,
      { height: 64, left: 200, top: 240, width: 64 }
    );

    const handoffSnapCount = motionRuntime.debugSnapshot().counters.canceledByReason["folder-panel-handoff-snap"] || 0;
    assert(handoffSnapCount >= 1, "folder panel handoff snap should use a specific cancel reason");
    assert(layer.panel.alpha === 0, "folder panel handoff snap should still hide the panel immediately");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    motionRuntime.configureDebug({ enabled: true });
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.currentFolderId = null;
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    layer.openingGhosts = { finishTransition() {} };
    layer.panelAlphaTarget = null;
    layer.panelOpenTargetKey = null;
    layer.markRegisteredBoundsDirty = () => {};
    layer.notifyPanelTitleFrame = () => {};
    layer.panel = {
      alpha: 1,
      x: 0,
      y: 0,
      scale: {
        x: 1,
        y: 1,
        set(x, y = x) {
          this.x = x;
          this.y = y;
        },
      },
    };
    layer.panel.position = {
      set(x, y) {
        layer.panel.x = x;
        layer.panel.y = y;
      },
    };
    const panelRect = { height: 360, left: 180, top: 200, width: 800 };
    const state = {
      isFolderAppLaunchClosing: false,
      isFolderClosing: false,
      renderedFolder: { id: "folder-1" },
      stageRect: { height: 600, left: 0, top: 0, width: 1000 },
    };

    layer.animatePanel(state, 580, 380, panelRect, { height: 64, left: 200, top: 240, width: 64 });
    motionRuntime.step(0.02);
    layer.animatePanel(state, 580, 380, panelRect, { height: 64, left: 200, top: 240, width: 64 });

    const cancelCount = motionRuntime.debugSnapshot().counters.canceledByReason["folder-panel-open"] || 0;
    assert(cancelCount === 0, "same folder panel target should not restart the geometry spring");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    motionRuntime.configureDebug({ enabled: true });
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.currentFolderId = null;
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    layer.openingGhosts = { finishTransition() {} };
    layer.openingPanelReadyFrame = null;
    layer.panelAlphaTarget = null;
    layer.panelOpenProgressDriven = false;
    layer.panelOpenTargetKey = null;
    layer.markRegisteredBoundsDirty = () => {};
    layer.notifyPanelTitleFrame = () => {};
    layer.scheduleOpeningPanelReadyCheck = () => {};
    layer.panel = {
      alpha: 1,
      x: 0,
      y: 0,
      scale: {
        x: 1,
        y: 1,
        set(x, y = x) {
          this.x = x;
          this.y = y;
        },
      },
    };
    layer.panel.position = {
      set(x, y) {
        layer.panel.x = x;
        layer.panel.y = y;
      },
    };
    const panelRect = { height: 360, left: 180, top: 200, width: 800 };
    const sourceRect = { height: 64, left: 200, top: 240, width: 64 };
    const state = {
      folderOpenProgress: 0.5,
      height: 600,
      isFolderAppLaunchClosing: false,
      isFolderClosing: false,
      renderedFolder: { id: "folder-1" },
      stageRect: { height: 600, left: 0, top: 0, width: 1000 },
      width: 1000,
    };

    layer.animatePanel(state, 580, 380, panelRect, sourceRect);

    assert(Math.abs(layer.panel.x - 406) < 0.001, "open progress should interpolate panel x from source to target");
    assert(Math.abs(layer.panel.y - 326) < 0.001, "open progress should interpolate panel y from source to target");
    assert(Math.abs(layer.panel.scale.x - 0.54) < 0.001, "open progress should interpolate panel scale x");
    assert(Math.abs(layer.panel.scale.y - 0.5888889) < 0.001, "open progress should interpolate panel scale y");
    assert(Math.abs(layer.panel.alpha - 0.97) < 0.001, "open progress should interpolate panel alpha");
    assert(layer.panelOpenProgressDriven, "open progress should mark the panel presentation as progress-driven");
    assert(motionRuntime.debugSnapshot().summary.activeAnimationCount === 0, "open progress should not start a competing panel spring");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.currentFolderId = "folder-1";
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    layer.openingPanelReadyFrame = null;
    layer.panelAlphaTarget = 1;
    layer.panelOpenProgressDriven = true;
    layer.panelOpenTargetKey = "folder-1:old";
    layer.panelZoomFadeClosing = false;
    layer.markRegisteredBoundsDirty = () => {};
    layer.notifyPanelTitleFrame = () => {};
    layer.panel = {
      alpha: 0.7,
      x: 406,
      y: 326,
      scale: {
        x: 0.54,
        y: 0.5888889,
        set(x, y = x) {
          this.x = x;
          this.y = y;
        },
      },
    };
    layer.panel.position = {
      set(x, y) {
        layer.panel.x = x;
        layer.panel.y = y;
      },
    };

    layer.animatePanel({
      folderOpenProgress: 0.25,
      isFolderAppLaunchClosing: false,
      isFolderClosing: false,
      isFolderZoomFadeClosing: true,
      renderedFolder: { id: "folder-1" },
      stageRect: { height: 600, left: 0, top: 0, width: 1000 },
    }, 580, 380, { height: 360, left: 180, top: 200, width: 800 }, { height: 64, left: 200, top: 240, width: 64 });

    assert(layer.panel.x === 580 && layer.panel.y === 380, "open-folder zoom-fade should keep the folder panel centered instead of shrinking to the desktop source");
    assert(layer.panel.scale.x === 1 && layer.panel.scale.y === 1, "open-folder zoom-fade should keep the panel at full size for the outer launchpad fade");
    assert(layer.panel.alpha === 1, "open-folder zoom-fade should leave local panel alpha visible for the outer launchpad fade");
    assert(!layer.panelOpenProgressDriven, "open-folder zoom-fade should not consume folder open progress as reverse opening");
    assert(layer.panelZoomFadeClosing, "open-folder zoom-fade should mark the panel as being held for the outer fade");
    assert(motionRuntime.debugSnapshot().summary.activeAnimationCount === 0, "open-folder zoom-fade should not start a competing source-close spring");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    motionRuntime.configureDebug({ enabled: true });
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.currentFolderId = null;
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    layer.openingGhosts = { finishTransition() {} };
    layer.panelAlphaTarget = null;
    layer.panelOpenTargetKey = null;
    layer.markRegisteredBoundsDirty = () => {};
    layer.notifyPanelTitleFrame = () => {};
    layer.panel = {
      alpha: 1,
      x: 0,
      y: 0,
      scale: {
        x: 1,
        y: 1,
        set(x, y = x) {
          this.x = x;
          this.y = y;
        },
      },
    };
    layer.panel.position = {
      set(x, y) {
        layer.panel.x = x;
        layer.panel.y = y;
      },
    };
    const panelRect = { height: 360, left: 180, top: 200, width: 800 };
    const firstSourceRect = { height: 64, left: 200, top: 240, width: 64 };
    const secondSourceRect = { height: 64, left: 500, top: 540, width: 64 };
    const firstChildRect = { height: 12, left: 210, top: 250, width: 12 };
    const secondChildRect = { height: 12, left: 510, top: 550, width: 12 };
    const state = {
      height: 600,
      isFolderAppLaunchClosing: false,
      isFolderClosing: false,
      renderedFolder: { id: "folder-1" },
      stageRect: { height: 600, left: 0, top: 0, width: 1000 },
      width: 1000,
    };
    const snapshotOptions = {
      getPreviewChildRect: () => firstChildRect,
      previewSlots: [{ id: "app-1" }],
    };

    const first = layer.animatePanel(state, 580, 380, panelRect, firstSourceRect, snapshotOptions).openingGeometrySnapshot;
    layer.currentOpeningGeometrySnapshot = first;
    const reused = layer.animatePanel(state, 580, 380, panelRect, secondSourceRect, {
      getPreviewChildRect: () => secondChildRect,
      previewSlots: [{ id: "app-1" }],
    }).openingGeometrySnapshot;
    layer.currentOpeningGeometrySnapshot = reused;

    assert(first === reused, "same open session should reuse its geometry snapshot while the target is unchanged");
    assert(reused.folderRect.left === firstSourceRect.left, "reused snapshot should keep the original folder source geometry");
    assert(reused.previewChildRects.get("app-1:0").left === firstChildRect.left, "reused snapshot should keep the original preview child geometry");
    const debug = layer.getVisualDebugSnapshot();
    assert(debug.openingGeometry.session.token === first.sessionToken, "opening debug should expose the active geometry session token");
    assert(debug.openingGeometry.currentGeometryMatchesSession, "opening debug should prove current geometry is the active session snapshot");
    assert(debug.openingGeometry.snapshot.folderRect.left === firstSourceRect.left, "opening debug should expose the frozen source geometry");
    assert(debug.openingGeometry.snapshot.panelRect.width === panelRect.width, "opening debug should expose the frozen panel geometry");

    layer.currentFolderId = null;
    layer.panelOpenTargetKey = null;
    const reopened = layer.animatePanel(state, 580, 380, panelRect, secondSourceRect, {
      getPreviewChildRect: () => secondChildRect,
      previewSlots: [{ id: "app-1" }],
    }).openingGeometrySnapshot;
    layer.currentOpeningGeometrySnapshot = reopened;

    assert(reopened !== first, "a new open session should capture a fresh geometry snapshot");
    assert(reopened.folderRect.left === secondSourceRect.left, "fresh snapshot should use the new folder source geometry");
    assert(reopened.previewChildRects.get("app-1:0").left === secondChildRect.left, "fresh snapshot should use the new preview child geometry");
    const reopenedDebug = layer.getVisualDebugSnapshot();
    assert(reopenedDebug.openingGeometry.session.token === reopened.sessionToken, "reopened debug should expose the fresh session token");
    assert(reopenedDebug.openingGeometry.snapshot.folderRect.left === secondSourceRect.left, "reopened debug should expose the fresh source geometry");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.currentFolderId = "folder-1";
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    layer.openingGhosts = { finishTransition() {} };
    layer.panelAlphaTarget = 1;
    layer.panelOpenTargetKey = null;
    layer.markRegisteredBoundsDirty = () => {};
    layer.notifyPanelTitleFrame = () => {};
    layer.panel = {
      alpha: 1,
      x: 580,
      y: 380,
      scale: {
        x: 1,
        y: 1,
        set(x, y = x) {
          this.x = x;
          this.y = y;
        },
      },
    };
    layer.panel.position = {
      set(x, y) {
        layer.panel.x = x;
        layer.panel.y = y;
      },
    };

    layer.animatePanel({
      isFolderAppLaunchClosing: false,
      isFolderClosing: false,
      renderedFolder: { id: "folder-1" },
      stageRect: { height: 600, left: 0, top: 0, width: 1000 },
    }, 580, 380, { height: 360, left: 180, top: 200, width: 800 }, null);

    assert(layer.folderHandoff.activeOpenSession === null, "settled same-folder updates should not create a pending open session");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    let clearCount = 0;
    let clearOptions = null;
    attachHandoffCoordinator(layer, { folderId: "folder-a" });
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: (options) => { clearCount += 1; clearOptions = options; } };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = {
      fillAlpha: 0.26,
      height: 160,
      left: 20,
      radius: 40,
      strokeAlpha: 0.24,
      strokeWidth: 1,
      top: 30,
      width: 240,
    };
    const pointerProxyCalls = [];
    layer.onClosingFolderPointerDown = (folderId, event) => {
      pointerProxyCalls.push(`${folderId}:${event?.type || "event"}`);
    };

    layer.detachClosingPresentationForOpen("folder-b");
    assert(layer.detachedClosingVisuals.length === 1, "opening a different folder should detach the interrupted closing frame");
    assert(detachedChildren.length === 1, "detached closing frame should be added to the detached visual layer");
    assert(detachedChildren[0].eventMode === "static", "detached closing visual should remain interactive while the real source is ghosted");
    assert(detachedChildren[0].interactiveChildren === false, "detached closing visual should own hover and click targeting while acting as a source proxy");
    assert(detachedChildren[0].hitArea?.contains?.(25, 35) === true, "detached closing visual should expose a hit area over its current visible bounds");
    assert(detachedChildren[0].cursor === "pointer", "detached closing visual should show the same click affordance as the desktop source");
    detachedChildren[0].emit("pointerdown", {
      nativeEvent: {
        button: 0,
        type: "pointerdown",
        preventDefault() {},
        stopPropagation() {},
      },
      stopPropagation() {},
    });
    assert(pointerProxyCalls.join(",") === "folder-a:pointerdown", "detached closing visual should forward clicks to the closing folder source");
    assert(clearCount === 1 && layer.folderHandoff.folderId === null, "detaching should clear the live closing controller ownership");
    assert(clearOptions?.reveal === false && clearOptions?.restorePageTrack === false, "detaching should clear live closing ownership without revealing current folder visuals");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "detached closing visual should keep the desktop source folder ghosted");
    const detachedVisual = layer.detachedClosingVisuals[0];
    const handoffVisualReleases = [];
    layer.onClosingHandoffVisualRelease = (folderId) => handoffVisualReleases.push(folderId);
    let sourceGhostingCommits = 0;
    layer.onDesktopSourceGhostingChange = () => { sourceGhostingCommits += 1; };
    layer.clearDetachedClosingVisual(detachedVisual);
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "queued detached release should keep the source ghosted until the visual commit");
    assert(detachedChildren.length === 1, "queued detached release should keep the visual alive until the visual commit");
    assert(handoffVisualReleases.length === 0, "queued detached release should wait until commit before restoring the desktop handoff visual");
    layer.getVisualCommitQueue().flush();
    assert(handoffVisualReleases.join(",") === "folder-a", "visual commit should restore the matching desktop handoff visual before destroying the detached visual");
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "visual commit should release the desktop source ownership");
    assert(detachedChildren.length === 0, "visual commit should destroy the detached visual after source visibility is applied");
    assert(sourceGhostingCommits === 1, "visual commit should explicitly notify desktop source ghosting once");
    motionRuntime.reset();

    const sameFolderLayer = Object.create(FolderOverlayLayer.prototype);
    let sameFolderClearCount = 0;
    attachHandoffCoordinator(sameFolderLayer, { folderId: "folder-a" });
    sameFolderLayer.closingGhostLayer = { removeChildren: () => [] };
    sameFolderLayer.closingGhosts = { clear: () => { sameFolderClearCount += 1; } };
    sameFolderLayer.detachedClosingVisuals = [];
    sameFolderLayer.nextDetachedClosingVisualToken = 1;
    sameFolderLayer.visualOwnership = new FolderVisualOwnershipRegistry();
    sameFolderLayer.detachedClosingVisualLayer = layer.detachedClosingVisualLayer;
    sameFolderLayer.frameGhostState = layer.frameGhostState;

    sameFolderLayer.detachClosingPresentationForOpen("folder-a");
    assert(sameFolderLayer.detachedClosingVisuals.length === 0, "reopening the same folder should not keep an old closing double-image");
    assert(sameFolderClearCount === 1, "same-folder reopen should still clear the live closing controller");
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    const releasedHandoffs = [];
    let sourceGhostingCommits = 0;
    attachHandoffCoordinator(layer, { folderId: "folder-a" });
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: () => {} };
    layer.onClosingHandoffPrepare = () => {};
    layer.onClosingHandoffVisualRelease = (folderId) => releasedHandoffs.push(folderId);
    layer.onDesktopSourceGhostingChange = () => { sourceGhostingCommits += 1; };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = {
      fillAlpha: 0.26,
      height: 160,
      left: 20,
      radius: 40,
      strokeAlpha: 0.24,
      strokeWidth: 1,
      top: 30,
      width: 240,
    };
    layer.folderHandoff.setCloseHandoffGeometry({
      detachedTarget: {
        fillAlpha: 0.2,
        height: 64,
        left: 140,
        radius: 18,
        strokeAlpha: 0.18,
        strokeWidth: 1,
        top: 170,
        width: 64,
      },
    });

    layer.detachClosingPresentationForDesktopClose("folder-a");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "desktop close detach should keep the source ghosted immediately");
    for (let index = 0; index < 12; index += 1) motionRuntime.step(0.05);
    layer.getVisualCommitQueue().flush();
    assert(releasedHandoffs.length === 0, "desktop close detach should not reveal the real source when geometry finishes before desktop close");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "desktop close detach should keep source ownership after geometry finishes");
    assert(detachedChildren.length === 1, "desktop close detach should keep the visual mounted until desktop close ends");
    layer.syncDesktopCloseDetachedHandoff({ isDesktopClosing: false });
    assert(releasedHandoffs.join(",") === "folder-a", "desktop close completion should release the real source handoff");
    assert(sourceGhostingCommits === 1, "desktop close completion should publish one source ghosting update");
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "desktop close completion should release desktop source ownership");
    assert(detachedChildren.length === 0, "desktop close completion should destroy the detached visual");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    let clearCount = 0;
    let sourceGhostingCommits = 0;
    attachHandoffCoordinator(layer);
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: () => { clearCount += 1; } };
    layer.onClosingHandoffPrepare = () => {};
    layer.onDesktopSourceGhostingChange = () => { sourceGhostingCommits += 1; };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = null;

    const openFolderDesktopZoomFadeState = {
      folderZoomFadeCloseReason: "desktop",
      isDesktopClosing: true,
      isFolderZoomFadeClosing: true,
      renderedFolder: { id: "folder-a" },
    };
    assert(!layer.hasActiveDesktopCloseDetachedHandoff(openFolderDesktopZoomFadeState), "open-folder desktop zoom-fade should continue normal overlay rendering");
    layer.syncDesktopCloseDetachedHandoff(openFolderDesktopZoomFadeState);
    assert(layer.detachedClosingVisuals.length === 0, "open-folder desktop zoom-fade should not create a detached source lock");
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "open-folder desktop zoom-fade should leave the real desktop source to normal ghosting");

    layer.syncDesktopCloseDetachedHandoff({
      folderZoomFadeCloseReason: "desktop",
      isDesktopClosing: true,
      isFolderClosing: true,
      isFolderZoomFadeClosing: true,
      renderedFolder: { id: "folder-a" },
    });
    assert(layer.detachedClosingVisuals.length === 1, "desktop close without visible ghosts should still create a source lock");
    assert(detachedChildren.length === 1 && detachedChildren[0].children.length === 0, "source lock should not need a visible substitute");
    assert(detachedChildren[0].eventMode === "none", "source lock should not create a stale pointer target");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "source lock should keep the real desktop folder ghosted");
    assert(clearCount === 1, "source lock setup should still clear live closing controller state");
    motionRuntime.flushAfterFrameForTests();
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "source lock should survive idle geometry completion while desktop is still closing");
    layer.syncDesktopCloseDetachedHandoff({ isDesktopClosing: false });
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "source lock should release after desktop close completes");
    assert(detachedChildren.length === 0, "source lock should destroy its empty holder after release");
    assert(sourceGhostingCommits === 1, "source lock release should publish one source ghosting update");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const iconBoundsRegistry = createIconBoundsRegistry();
    const titleFrames = [];
    const layer = new FolderOverlayLayer({
      iconBoundsRegistry,
      onTitleFrameChange: (frame) => titleFrames.push(frame),
    });
    layer.panel.visible = true;
    layer.pageTrack.visible = true;
    layer.pageDotsLayer.visible = true;
    layer.pageDotsLayer.eventMode = "static";
    layer.pageDotsLayer.hitArea = { contains: () => true };
    layer.hitArea = { contains: () => true };
    layer.titleFrameKey = "active";

    const result = layer.update({
      folderZoomFadeCloseReason: "desktop",
      height: 800,
      isDesktopClosing: true,
      isFolderClosing: true,
      isFolderZoomFadeClosing: true,
      renderedFolder: { childPages: [[]], id: "folder-a", name: "A", type: "folder" },
      stageRect: { height: 800, left: 0, top: 0, width: 1200 },
      width: 1200,
    });

    assert(result === null, "desktop close detached state should not continue into normal folder overlay rendering");
    assert(layer.panel.visible === false, "desktop close detached state should hide the original open folder panel");
    assert(layer.pageTrack.visible === false, "desktop close detached state should hide the original open folder page track");
    assert(layer.pageDotsLayer.visible === false && layer.pageDotsLayer.eventMode === "none" && layer.pageDotsLayer.hitArea === null, "desktop close detached state should hide stale folder page dots");
    assert(layer.hitArea === null, "desktop close detached state should not keep the open folder pointer hit area");
    assert(titleFrames.length === 1 && titleFrames[0] === null, "desktop close detached state should hide the folder title frame");
    assert(layer.detachedClosingVisuals.length === 1, "desktop close detached state should keep a detached handoff/source lock");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "desktop close detached state should keep the real source ghosted");

    motionRuntime.flushAfterFrameForTests();
    layer.panel.visible = true;
    layer.pageTrack.visible = true;
    layer.pageDotsLayer.visible = true;
    layer.pageDotsLayer.eventMode = "static";
    layer.pageDotsLayer.hitArea = { contains: () => true };
    layer.hitArea = { contains: () => true };

    const noRenderedResult = layer.update({
      height: 800,
      isDesktopClosing: true,
      renderedFolder: null,
      stageRect: { height: 800, left: 0, top: 0, width: 1200 },
      width: 1200,
    });

    assert(noRenderedResult === null, "desktop close detached state should stay handoff-only after renderedFolder clears");
    assert(layer.visible === true, "folder layer should stay available while it owns a desktop close detached handoff");
    assert(layer.panel.visible === false && layer.pageTrack.visible === false, "desktop close detached tail should keep original folder visuals hidden");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "desktop close detached tail should keep the real source ghosted until desktop close ends");
    assert(layer.detachedClosingVisuals.length === 1, "desktop close detached tail should keep the detached source lock mounted");

    layer.update({
      height: 800,
      isDesktopClosing: false,
      renderedFolder: null,
      stageRect: { height: 800, left: 0, top: 0, width: 1200 },
      width: 1200,
    });

    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "desktop close completion should release the detached source lock from update");
    assert(layer.detachedClosingVisuals.length === 0, "desktop close completion should destroy the detached source lock from update");
    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
    motionRuntime.reset();
  }

  {
    // A detached closing animation that is CANCELLED (interrupted) rather than
    // completing must still commit and reveal the desktop source icon. The
    // completion tracker only advanced on natural onComplete, so a cancel stalled
    // it forever -> the real icon stayed hidden / ownership held ("交接失败").
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    attachHandoffCoordinator(layer, { folderId: "folder-a" });
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: () => {} };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) { child.parent = this; detachedChildren.push(child); },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = {
      fillAlpha: 0.26, height: 160, left: 20, radius: 40,
      strokeAlpha: 0.24, strokeWidth: 1, top: 30, width: 240,
    };
    const handoffVisualReleases = [];
    layer.onClosingHandoffVisualRelease = (folderId) => handoffVisualReleases.push(folderId);

    layer.detachClosingPresentationForOpen("folder-b");
    const detachedVisual = layer.detachedClosingVisuals[0];
    assert(Boolean(detachedVisual) && layer.getDesktopSourceGhostedIds().has("folder-a"), "test setup: detach should ghost the desktop source");
    assert((detachedVisual.motionControls?.size || 0) > 0, "test setup: detached frame should register a geometry animation control");

    for (const control of Array.from(detachedVisual.motionControls || [])) control.cancel?.("interrupted");
    motionRuntime.flushAfterFrameForTests();

    assert(handoffVisualReleases.join(",") === "folder-a", "a cancelled detached closing animation must still reveal the desktop source icon (no stuck-hidden handoff)");
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "a cancelled detached closing animation must release the desktop source ownership");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    let clearCount = 0;
    const preparedHandoffs = [];
    const releasedHandoffs = [];
    const releaseDetachedChildCounts = [];
    const closingGhost = new Container();
    closingGhost.alpha = 1;
    closingGhost.position.set(10, 20);
    closingGhost.scale.set(1);
    attachHandoffCoordinator(layer, { folderId: "folder-a" });
    layer.folderHandoff.setDetachedClosingGhostMotion(closingGhost, {
      alpha: 0,
      duration: 0.36,
      scale: 0.2,
      x: 100,
      y: 120,
    });
    layer.closingGhostLayer = { removeChildren: () => [closingGhost] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: () => { clearCount += 1; } };
    layer.onClosingHandoffPrepare = (folderId) => preparedHandoffs.push(folderId);
    layer.onClosingHandoffVisualRelease = (folderId) => {
      releasedHandoffs.push(folderId);
      releaseDetachedChildCounts.push(detachedChildren.length);
    };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = {
      fillAlpha: 0.26,
      height: 160,
      left: 20,
      radius: 40,
      strokeAlpha: 0.24,
      strokeWidth: 1,
      top: 30,
      width: 240,
    };
    layer.folderHandoff.setCloseHandoffGeometry({
      detachedTarget: {
      fillAlpha: 0.2,
      height: 64,
      left: 140,
      radius: 18,
      strokeAlpha: 0.18,
      strokeWidth: 1,
      top: 170,
      width: 64,
      },
    });

    layer.detachClosingPresentationForOpen("folder-b");
    assert(clearCount === 1, "detached animation should clear the live closing controller once");
    assert(preparedHandoffs.join(",") === "folder-a", "detached animation should prepare the real folder handoff before it starts");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "detached animation should hold the desktop source while it is running");
    assert(detachedChildren.length === 1, "detached animation should keep the visual mounted while it is running");
    for (let index = 0; index < 3; index += 1) motionRuntime.step(0.04);
    layer.getVisualCommitQueue().flush();
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "partial detached animation progress should not reveal the desktop source early");
    assert(detachedChildren.length === 1, "partial detached animation progress should keep the visual alive");
    assert(releasedHandoffs.length === 0, "detached handoff should wait until the visual return point");
    for (let index = 0; index < 6; index += 1) motionRuntime.step(0.05);
    assert(releasedHandoffs.join(",") === "folder-a", "detached animation should release the real handoff at detached cleanup");
    assert(releaseDetachedChildCounts[0] === 1, "detached visual should still be mounted when the real handoff is released");
    assert(detachedChildren.length === 0, "detached visual should be gone after the real handoff is released");
    for (let index = 0; index < 14; index += 1) motionRuntime.step(0.05);
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "completed detached animation should release the desktop source without a deferred flush");
    assert(detachedChildren.length === 0, "completed detached animation should destroy the detached visual in the completion frame");
    assert(releasedHandoffs.join(",") === "folder-a", "detached cleanup should not release the real handoff twice");
    layer.getVisualCommitQueue().flush();
    assert(detachedChildren.length === 0, "deferred detached flush should not be required after completion");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    const releasedHandoffs = [];
    const releaseDetachedChildCounts = [];
    let sourceGhostingCommits = 0;
    attachHandoffCoordinator(layer, { folderId: "folder-a" });
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: () => {} };
    layer.onClosingHandoffPrepare = () => {};
    layer.onClosingHandoffVisualRelease = (folderId) => {
      releasedHandoffs.push(folderId);
      releaseDetachedChildCounts.push(detachedChildren.length);
    };
    layer.onDesktopSourceGhostingChange = () => { sourceGhostingCommits += 1; };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = {
      fillAlpha: 0.26,
      height: 64.4,
      left: 139.6,
      radius: 18.2,
      strokeAlpha: 0.24,
      strokeWidth: 1,
      top: 170.3,
      width: 63.7,
    };
    layer.folderHandoff.setCloseHandoffGeometry({
      detachedTarget: {
      fillAlpha: 0.2,
      height: 64,
      left: 140,
      radius: 18,
      strokeAlpha: 0.18,
      strokeWidth: 1,
      top: 170,
      width: 64,
      },
    });

    layer.detachClosingPresentationForOpen("folder-b");

    assert(releasedHandoffs.length === 0, "near-target detached frame should not release the handoff before the full geometry duration");
    assert(sourceGhostingCommits === 0, "near-target detached frame should keep source ghosting until the full geometry duration");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "near-target detached frame should keep desktop source ownership while geometry is still running");
    assert(detachedChildren.length === 1, "near-target detached frame should stay mounted while geometry is still running");
    for (let index = 0; index < 7; index += 1) motionRuntime.step(0.05);
    assert(releasedHandoffs.length === 0, "near-target detached frame should still wait before the geometry duration completes");
    motionRuntime.step(0.05);
    assert(releasedHandoffs.join(",") === "folder-a", "near-target detached frame should release after the full geometry duration");
    assert(sourceGhostingCommits === 1, "near-target detached frame handoff should publish one source ghosting commit");
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "near-target detached frame handoff should release desktop source ownership after geometry completes");
    assert(releaseDetachedChildCounts[0] === 1, "near-target detached frame should stay mounted until handoff release");
    assert(detachedChildren.length === 0, "near-target detached frame should be gone after handoff release");
    for (let index = 0; index < 4; index += 1) motionRuntime.step(0.05);
    assert(releasedHandoffs.join(",") === "folder-a", "near-target detached frame cleanup should not release the handoff twice");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    const releasedHandoffs = [];
    const releaseDetachedChildCounts = [];
    const closingGhost = new Container();
    closingGhost.alpha = 1;
    closingGhost.position.set(99.6, 120.3);
    closingGhost.scale.set(0.205);
    attachHandoffCoordinator(layer, { folderId: "folder-a" });
    layer.folderHandoff.setDetachedClosingGhostMotion(closingGhost, {
      alpha: 0,
      duration: 0.36,
      scale: 0.2,
      x: 100,
      y: 120,
    });
    layer.closingGhostLayer = { removeChildren: () => [closingGhost] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: () => {} };
    layer.onClosingHandoffPrepare = () => {};
    layer.onClosingHandoffVisualRelease = (folderId) => {
      releasedHandoffs.push(folderId);
      releaseDetachedChildCounts.push(detachedChildren.length);
    };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = null;

    layer.detachClosingPresentationForOpen("folder-b");

    assert(releasedHandoffs.length === 0, "near-target detached ghost should not release the handoff before its motion completes");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "near-target detached ghost should keep desktop source ownership while geometry is still running");
    assert(detachedChildren.length === 1, "near-target detached ghost should stay mounted while geometry is still running");
    for (let index = 0; index < 7; index += 1) motionRuntime.step(0.05);
    assert(releasedHandoffs.length === 0, "near-target detached ghost should still wait before its motion completes");
    motionRuntime.step(0.05);
    assert(releasedHandoffs.join(",") === "folder-a", "near-target detached ghost should release after its motion completes");
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "near-target detached ghost handoff should release desktop source ownership after motion completes");
    assert(releaseDetachedChildCounts[0] === 1, "near-target detached ghost should stay mounted until handoff release");
    assert(detachedChildren.length === 0, "near-target detached ghost should be gone after handoff release");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    const releasedHandoffs = [];
    const releaseDetachedChildCounts = [];
    const previewSwapGhost = new Container();
    attachHandoffCoordinator(layer, { folderId: "folder-a" });
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [previewSwapGhost] };
    layer.closingGhosts = { clear: () => {} };
    layer.onClosingHandoffPrepare = () => {};
    layer.onClosingHandoffVisualRelease = (folderId) => {
      releasedHandoffs.push(folderId);
      releaseDetachedChildCounts.push(detachedChildren.length);
    };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = null;

    layer.detachClosingPresentationForOpen("folder-b");

    assert(releasedHandoffs.length === 0, "preview-swap-only detached visual should wait for the geometry hold before releasing the handoff");
    assert(layer.getDesktopSourceGhostedIds().has("folder-a"), "preview-swap-only handoff should keep desktop source ownership during the geometry hold");
    assert(detachedChildren.length === 1, "preview-swap-only detached visual should remain mounted during the geometry hold");
    for (let index = 0; index < 7; index += 1) motionRuntime.step(0.05);
    assert(releasedHandoffs.length === 0, "preview-swap-only detached visual should still wait before the geometry hold completes");
    motionRuntime.step(0.05);
    assert(releasedHandoffs.join(",") === "folder-a", "preview-swap-only detached visual should release after the geometry hold");
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "preview-swap-only handoff should release desktop source ownership after the geometry hold");
    assert(releaseDetachedChildCounts[0] === 1, "preview-swap-only detached visual should stay mounted until handoff release");
    assert(detachedChildren.length === 0, "preview-swap-only detached visual should be gone after handoff release");
    for (let index = 0; index < 4; index += 1) motionRuntime.step(0.05);
    assert(releasedHandoffs.join(",") === "folder-a", "preview-swap-only cleanup should not release the handoff twice");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    const releasedHandoffs = [];
    let sourceGhostingCommits = 0;
    attachHandoffCoordinator(layer, { folderId: "folder-a" });
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: () => {} };
    layer.onClosingHandoffPrepare = () => {};
    layer.onClosingHandoffVisualRelease = (folderId) => releasedHandoffs.push(folderId);
    layer.onDesktopSourceGhostingChange = () => { sourceGhostingCommits += 1; };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = {
      fillAlpha: 0.26,
      height: 160,
      left: 20,
      radius: 40,
      strokeAlpha: 0.24,
      strokeWidth: 1,
      top: 30,
      width: 240,
    };
    layer.folderHandoff.setCloseHandoffGeometry({
      detachedTarget: {
      fillAlpha: 0.2,
      height: 64,
      left: 140,
      radius: 18,
      strokeAlpha: 0.18,
      strokeWidth: 1,
      top: 170,
      width: 64,
      },
    });

    layer.detachClosingPresentationForOpen("folder-b");
    for (let index = 0; index < 11; index += 1) motionRuntime.step(0.05);

    assert(releasedHandoffs.join(",") === "folder-a", "clamped frame steps should commit the detached handoff before cleanup");
    assert(sourceGhostingCommits === 1, "detached handoff should publish one source ghosting commit");
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "detached handoff should release desktop source ownership");
    assert(detachedChildren.length === 0, "detached cleanup should still destroy the visual");
    layer.getVisualCommitQueue().flush();
    assert(releasedHandoffs.join(",") === "folder-a", "cleanup should not release the handoff twice");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    attachHandoffCoordinator(layer, { folderId: "folder-a" });
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: () => {} };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.frameGhostState = {
      fillAlpha: 0.26,
      height: 160,
      left: 20,
      radius: 40,
      strokeAlpha: 0.24,
      strokeWidth: 1,
      top: 30,
      width: 240,
    };
    layer.folderHandoff.setCloseHandoffGeometry({
      detachedTarget: {
      fillAlpha: 0.2,
      height: 64,
      left: 140,
      radius: 18,
      strokeAlpha: 0.18,
      strokeWidth: 1,
      top: 170,
      width: 64,
      },
    });

    layer.detachClosingPresentationForOpen("folder-b");
    const visual = layer.detachedClosingVisuals[0];
    assert(visual?.motionControls?.size >= 1, "detached frame should retain geometry motion controls for cleanup");
    layer.clearDetachedClosingVisualNow(visual);
    assert(visual.destroyed === true && detachedChildren.length === 0, "immediate detached cleanup should destroy the visual");
    for (let index = 0; index < 6; index += 1) motionRuntime.step(0.05);
    assert(detachedChildren.length === 0, "stale detached frame callbacks should stay canceled after destruction");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const detachedChildren = [];
    let clearCount = 0;
    layer.detachedClosingVisualLayer = {
      addChild(child) {
        child.parent = this;
        detachedChildren.push(child);
      },
      removeChild(child) {
        const index = detachedChildren.indexOf(child);
        if (index >= 0) detachedChildren.splice(index, 1);
      },
    };
    layer.detachedClosingVisuals = [];
    layer.nextDetachedClosingVisualToken = 1;
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.ownedVisualTokens = new Set();
    const handoffVisualReleases = [];
    layer.onClosingHandoffVisualRelease = (folderId) => handoffVisualReleases.push(folderId);

    const existingAContainer = new Container();
    layer.detachedClosingVisualLayer.addChild(existingAContainer);
    const existingA = {
      container: existingAContainer,
      desktopSourceKey: makeDesktopSourceVisualKey("folder-a"),
      folderId: "folder-a",
      ownerToken: "detached-close:folder-a:old",
    };
    layer.detachedClosingVisuals.push(existingA);
    layer.acquireVisualOwnership(existingA.desktopSourceKey, {
      folderId: "folder-a",
      kind: "detachedClosing",
      token: existingA.ownerToken,
    });

    attachHandoffCoordinator(layer, { folderId: "folder-b" });
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = { clear: () => { clearCount += 1; } };
    layer.frameGhostState = {
      fillAlpha: 0.26,
      height: 160,
      left: 20,
      radius: 40,
      strokeAlpha: 0.24,
      strokeWidth: 1,
      top: 30,
      width: 240,
    };

    layer.detachClosingPresentationForOpen("folder-a");

    assert(existingA.destroyed === true, "reopening folder A should destroy its stale detached closing visual");
    assert(!handoffVisualReleases.includes("folder-a"), "immediate stale same-folder cleanup should not reveal folder A before the new open owns the source");
    assert(!layer.getDesktopSourceGhostedIds().has("folder-a"), "stale folder A detached ownership should release before the new open owns the source");
    assert(layer.getDesktopSourceGhostedIds().has("folder-b"), "opening folder A should keep folder B closing as a detached visual");
    assert(detachedChildren.length === 1, "only folder B's detached close should remain mounted");
    assert(clearCount === 1, "detaching folder B should clear the live closing controller once");
    motionRuntime.reset();
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.ownedVisualTokens = new Set();
    layer.detachedClosingVisuals = [{
      desktopSourceKey: makeDesktopSourceVisualKey("folder-a"),
      folderId: "folder-a",
      ownerToken: "detached-close:folder-a:1",
    }];
    layer.acquireVisualOwnership(makeDesktopSourceVisualKey("folder-a"), {
      folderId: "folder-a",
      kind: "detachedClosing",
      token: "detached-close:folder-a:1",
    });
    layer.acquireVisualOwnership(makeFolderPageTrackVisualKey("folder-b"), {
      folderId: "folder-b",
      kind: "opening",
      token: "opening-folder-b",
    });

    layer.releaseAllOwnedVisualOwnership({ preserveDetachedClosing: true });

    assert(layer.visualOwnership.isOwnedBy(makeDesktopSourceVisualKey("folder-a"), "detached-close:folder-a:1"), "empty overlay cleanup should preserve detached closing desktop source ownership");
    assert(!layer.visualOwnership.hasOwner(makeFolderPageTrackVisualKey("folder-b")), "empty overlay cleanup should still release non-detached transition ownership");
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    const iconNode = {
      alpha: 0.35,
      item: { id: "app-1" },
      state: { source: { folderId: "folder-a", pageIndex: 0 } },
      visible: true,
    };
    layer.currentFolderId = "folder-a";
    layer.iconNodes = new Map([["app-1", iconNode]]);
    layer.pageTrack = { visible: true };
    layer.visualOwnership = new FolderVisualOwnershipRegistry();

    const closingOwner = { folderId: "folder-a", kind: "closing", token: "close-a" };
    const openingOwner = { folderId: "folder-a", kind: "opening", token: "open-a" };
    layer.hideIconNodesForTransition("app-1", closingOwner);
    layer.hidePageTrackForTransition(closingOwner);

    const iconKey = makeFolderIconVisualKey("folder-a", "app-1", 0);
    const pageTrackKey = makeFolderPageTrackVisualKey("folder-a");
    assert(iconNode.visible === false, "closing ownership should hide the real folder icon node");
    assert(layer.pageTrack.visible === false, "closing ownership should hide the page track");
    assert(layer.visualOwnership.isOwnedBy(iconKey, "close-a"), "closing ownership should claim the icon visual key");
    assert(layer.visualOwnership.isOwnedBy(pageTrackKey, "close-a"), "closing ownership should claim the page track visual key");

    layer.hideIconNodesForTransition("app-1", openingOwner);
    layer.releaseTransitionOwnership("close-a", { reveal: true, restorePageTrack: true });

    assert(iconNode.visible === false, "stale closing release should not reveal an icon now owned by opening");
    assert(layer.pageTrack.visible === true, "stale closing release should restore the page track because opening no longer owns it");
    assert(layer.visualOwnership.isOwnedBy(iconKey, "open-a"), "stale closing release should preserve the opening icon owner");
    assert(!layer.visualOwnership.hasOwner(pageTrackKey), "opening ownership should not claim the page track visual key");

    assert(layer.releaseIconNodesForTransition("app-1", "open-a", { reveal: true }) === 1, "current opening icon release should only clear the completed icon");
    assert(iconNode.visible === true && iconNode.alpha === 1, "current opening icon release should reveal the real icon node");
    assert(layer.pageTrack.visible === true, "current opening icon release should leave the page track visible");
    assert(!layer.visualOwnership.hasOwner(iconKey), "current opening release should clear icon ownership");
    assert(!layer.visualOwnership.hasOwner(pageTrackKey), "current opening release should not create page track ownership");
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    const iconNode = {
      alpha: 0.35,
      item: { id: "app-1" },
      state: { source: { folderId: "folder-a", pageIndex: 0 } },
      visible: false,
    };
    layer.currentFolderId = "folder-a";
    layer.iconNodes = new Map([["app-1", iconNode]]);
    layer.pageTrack = { visible: false };
    layer.visualOwnership = new FolderVisualOwnershipRegistry();

    const owner = { folderId: "folder-a", kind: "closing", token: "close-a" };
    layer.hideIconNodesForTransition("app-1", owner);
    layer.hidePageTrackForTransition(owner);
    layer.releaseTransitionOwnership("close-a", { reveal: false, restorePageTrack: false });

    assert(iconNode.visible === false, "non-reveal release should clear ownership without showing the icon");
    assert(layer.pageTrack.visible === false, "non-restore release should clear ownership without showing the page track");
    assert(layer.visualOwnership.snapshot().length === 0, "non-reveal release should still clear matching ownership entries");
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    const session = layer.folderHandoff.beginOpen("folder-a", "target-a").session;
    layer.folderHandoff.beginOpeningVisuals({ sessionToken: session.token, state: {} });
    layer.folderHandoff.registerOpeningGhost("app-1", "open-key");
    let retargets = 0;
    layer.openingGhosts = {
      retarget() {
        retargets += 1;
      },
      start() {
        throw new Error("existing opening visuals should retarget instead of restarting");
      },
    };
    layer.closingGhosts = {
      clear() {},
      start() {},
    };
    layer.iconNodes = new Map();
    layer.pageTrack = { visible: false };
    layer.frameGhostState = null;
    layer.notifyPanelTitleFrame = () => {};
    layer.notifyTitleFrame = () => {};
    layer.refreshRegisteredIconBounds = () => {};
    layer.clearClosingFolderId = () => {};

    layer.startFolderOverlayTransitions({
      closeIconRect: null,
      closeThumbRect: null,
      closingGhostTargets: [],
      closingPreviewSwapTargets: [],
      folderClientRect: null,
      folderId: "folder-a",
      folderThumbClientRect: null,
      geometry: { panel: { height: 100, left: 0, top: 0, width: 100 } },
      isClosing: false,
      isNewFolder: false,
      openingGhostTargets: [],
      seen: new Set(),
      state: {
        folderOpenIconGhosts: [],
        isFolderClosing: false,
      },
    });

    assert(layer.folderHandoff.isRevealPending(), "opening reveal should still be pending during active opening visuals");
    assert(retargets === 1, "active opening visuals should still retarget during folder overlay updates");
    assert(layer.pageTrack.visible === true, "opening reveal and opening ghosts should no longer hide the page track");
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    let retargetOptions = null;
    layer.openingGhosts = {
      retarget(_state, _targets, options) {
        retargetOptions = options;
      },
      start() {
        throw new Error("active opening frame should retarget instead of restarting");
      },
    };
    layer.closingGhosts = {
      clear() {},
      start() {},
    };
    layer.iconNodes = new Map();
    layer.pageTrack = { visible: false };
    layer.frameGhostState = { height: 120, left: 10, top: 20, width: 220 };
    layer.frameGhostPhase = "opening";
    layer.notifyPanelTitleFrame = () => {};
    layer.notifyTitleFrame = () => {};
    layer.refreshRegisteredIconBounds = () => {};
    layer.clearClosingFolderId = () => {};

    const panel = { height: 480, left: 80, top: 90, width: 860 };
    layer.startFolderOverlayTransitions({
      closeIconRect: null,
      closeThumbRect: null,
      closingGhostTargets: [],
      closingPreviewSwapTargets: [],
      folderClientRect: null,
      folderId: "folder-a",
      folderThumbClientRect: null,
      geometry: { panel },
      isClosing: false,
      isNewFolder: false,
      openingGhostTargets: [],
      seen: new Set(),
      state: {
        folderOpenIconGhosts: [],
        isFolderClosing: false,
      },
    });

    assert(retargetOptions?.frameTargetRect === panel, "active opening frame shell should receive the latest panel geometry even after icon ghosts finish");
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.frameGhost = { destroyed: false, x: 99 };
    layer.closingFrameMask = { destroyed: false, x: 99 };
    layer.closingPreviewSwapLayer = { destroyed: false, x: 99 };
    layer.closingGhostLayer = { destroyed: false, x: 44 };

    const initialOffset = layer.syncClosingDesktopPageTrackMirror({
      desktopPageTrackOffset: { liveX: -100, targetX: -400 },
    }, "folder-a", true);
    assert(initialOffset === 0, "closing mirror should establish its baseline from the first desktop live offset");
    assert(layer.frameGhost.x === 99, "closing mirror baseline should not shift the active frame ghost");
    assert(layer.closingFrameMask.x === 99, "closing mirror baseline should not shift the active close frame mask");
    assert(layer.closingPreviewSwapLayer.x === 99, "closing mirror baseline should not shift active preview swap visuals");

    const updatedOffset = layer.syncClosingDesktopPageTrackMirror({
      desktopPageTrackOffset: { liveX: -235, targetX: -400 },
    }, "folder-a", true);
    assert(updatedOffset === -135, "closing mirror should follow desktop pageTrack live delta from close start");
    assert(layer.closingDesktopPageTrackMirrorX === -135, "closing mirror should store the desktop pageTrack delta for detached presentation");
    assert(layer.frameGhost.x === 99, "closing mirror should not shift the active frame ghost because the frame retargets directly");
    assert(layer.closingFrameMask.x === 99, "closing mirror should not shift the active close frame mask because the frame retargets directly");
    assert(layer.closingPreviewSwapLayer.x === 99, "closing mirror should not shift active preview swap visuals");
    assert(layer.closingGhostLayer.x === 44, "closing mirror must not shift closingGhostLayer because ghosts retarget individually");

    layer.syncClosingDesktopPageTrackMirror({}, "folder-a", false);
    assert(layer.closingDesktopPageTrackMirrorBaseline === null, "closing mirror should clear its session baseline after closing ends");
    assert(layer.frameGhost.x === 99, "closing mirror reset should leave the active frame ghost x untouched");
    assert(layer.closingFrameMask.x === 99, "closing mirror reset should leave the active frame mask x untouched");
    assert(layer.closingPreviewSwapLayer.x === 99, "closing mirror reset should leave active preview swap x untouched");
    assert(layer.closingGhostLayer.x === 44, "closing mirror reset should still leave closingGhostLayer untouched");
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    layer.folderHandoff.beginCloseTransition("folder-a", { closeToken: "close-a" });
    const closeThumbRect = { height: 58, left: 300, top: 340, width: 58 };
    const renderedFolderRect = { height: 64, left: 120, top: 160, width: 64 };
    let starts = 0;
    let retargets = 0;
    let retargetArgs = null;
    layer.openingGhosts = {
      retarget() {},
      start() {},
    };
    layer.closingGhosts = {
      clear() {},
      retarget(...args) {
        retargets += 1;
        retargetArgs = args;
      },
      start() {
        starts += 1;
      },
    };
    layer.iconNodes = new Map();
    layer.frameGhost = { destroyed: false, x: 0 };
    layer.closingFrameMask = { destroyed: false, x: 0 };
    layer.closingPreviewSwapLayer = { destroyed: false, x: 0 };
    layer.closingGhostLayer = { destroyed: false, x: 31 };
    layer.pageTrack = { visible: true };
    layer.frameGhostState = null;
    layer.getPanelVisualRect = () => ({ height: 220, left: 20, top: 30, width: 260 });
    layer.notifyPanelTitleFrame = () => {};
    layer.notifyTitleFrame = () => {};
    layer.refreshRegisteredIconBounds = () => {};
    layer.clearClosingFolderId = () => {};
    layer.stableFolderCloseTarget = { folderId: "folder-a", trackingKey: "live-target" };
    layer.syncClosingDesktopPageTrackMirror({
      desktopPageTrackOffset: { liveX: -100, targetX: -400 },
    }, "folder-a", true);

    layer.startFolderOverlayTransitions({
      closeIconRect: { height: 64, left: 360, top: 400, width: 64 },
      closeThumbRect,
      closingGhostTargets: [{ item: { id: "app-1" }, sourceRect: renderedFolderRect, targetClientRect: closeThumbRect }],
      closingPreviewSwapTargets: [{ item: { id: "app-1" } }],
      folderClientRect: renderedFolderRect,
      folderId: "folder-a",
      folderThumbClientRect: renderedFolderRect,
      geometry: { panel: { height: 200, left: 0, top: 0, width: 240 } },
      isClosing: true,
      isNewFolder: false,
      openingGhostTargets: [],
      seen: new Set(),
      state: {
        desktopPageTrackOffset: { liveX: -180, targetX: -400 },
        folderOpenIconGhosts: [],
        isFolderClosing: true,
      },
    });

    assert(starts === 0, "active same-folder close updates should not restart closing ghosts");
    assert(retargets === 1, "active same-folder close updates should retarget closing ghosts");
    assert(retargetArgs?.[2] === closeThumbRect, "closing retarget should receive the close thumb target rect");
    assert(retargetArgs?.[4]?.handoffRect === renderedFolderRect, "closing retarget should bind handoff geometry to the rendered folder rect");
    assert(layer.closingDesktopPageTrackMirrorX === -80, "active same-folder close updates should store the desktop pageTrack delta");
    assert(layer.frameGhost.x === 0, "active same-folder close updates should not mirror the frame ghost because it retargets directly");
    assert(layer.closingFrameMask.x === 0, "active same-folder close updates should not mirror the close mask because the frame retargets directly");
    assert(layer.closingPreviewSwapLayer.x === 0, "active same-folder close updates should not mirror active preview swap visuals");
    assert(layer.closingGhostLayer.x === 31, "active same-folder close updates should not mirror closingGhostLayer because ghosts retarget");
  }

  {
    motionRuntime.reset();
    motionRuntime.configureDebug({ enabled: true });
    const layer = Object.create(FolderOverlayLayer.prototype);
    const dot = {
      alpha: 0,
      clear() {
        return this;
      },
      circle() {
        return this;
      },
      fill() {
        return this;
      },
      scale: {
        x: 1,
        y: 1,
        set(value) {
          this.x = value;
          this.y = value;
        },
      },
    };
    const idleVisual = getFolderPageDotVisualState({ active: false, hovered: false });
    const hoverVisual = getFolderPageDotVisualState({ active: false, hovered: true });

    layer.setPageDotHover(dot, false, false, { immediate: true });
    assert(dot.alpha === idleVisual.alpha && dot.scale.x === idleVisual.scale, "immediate page dot state should apply the visual target directly");
    layer.setPageDotHover(dot, false, true);
    motionRuntime.step(0.04);
    assert(dot.alpha > idleVisual.alpha && dot.alpha < hoverVisual.alpha, "page dot hover-in should animate alpha toward the hover state");

    const alphaBeforeHoverOut = dot.alpha;
    layer.setPageDotHover(dot, false, false);
    const blendSnapshot = motionRuntime.debugSnapshot();
    const alphaBlend = blendSnapshot.animations.find((animation) => animation.prop === "alpha" && animation.laneKey === "overlay");

    assert(nearlyEqual(dot.alpha, alphaBeforeHoverOut), "page dot hover-out blend should keep the current visual value on takeover");
    assert((blendSnapshot.counters.canceledByReason.blend || 0) >= 1, "page dot hover interruption should be observable as a blend cancellation");
    assert(alphaBlend?.blendDuration === 0.08, "page dot hover should use a short blend window");

    motionRuntime.step(0.04);
    assert(dot.alpha < alphaBeforeHoverOut && dot.alpha > idleVisual.alpha, "page dot hover-out should blend back toward idle without jumping");
    for (let index = 0; index < 20; index += 1) motionRuntime.step(0.05);
    assert(nearlyEqual(dot.alpha, idleVisual.alpha), "page dot hover-out should settle on the idle alpha");
    motionRuntime.reset();
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    const commits = [];
    const calls = [];
    layer.pageDotsLayer = new Container();
    layer.currentFolderId = "folder-1";

    layer.updatePageDots({
      folderPageDotsVisible: true,
      folderPageIndex: 0,
      folderPageIndexCommit: (index) => commits.push(index),
      folderPages: [[], []],
      renderedFolder: { id: "folder-1", name: "Folder" },
      visualFolderPageIndex: 1,
    }, {
      grid: { height: 120, left: 40, top: 80, width: 320 },
      panel: { height: 240, left: 20, top: 40, width: 360 },
    });

    assert(layer.pageDotsLayer.visible === true, "folder page dots should become visible once enabled");
    assert(layer.pageDotsLayer.children[0].alpha === getFolderPageDotVisualState({ active: false }).alpha, "committed page dot should render idle when visual page differs");
    assert(layer.pageDotsLayer.children[1].alpha === getFolderPageDotVisualState({ active: true }).alpha, "visual page dot should render active");
    assert(layer.pageDotsLayer.alpha === 0, "folder page dots should start their reveal from transparent");
    motionRuntime.step(0.04);
    assert(layer.pageDotsLayer.alpha > 0 && layer.pageDotsLayer.alpha < 1, "folder page dots should fade in after reveal starts");
    const alphaDuringReveal = layer.pageDotsLayer.alpha;
    layer.updatePageDots({
      folderPageDotsVisible: true,
      folderPageIndex: 0,
      folderPageIndexCommit: (index) => commits.push(index),
      folderPages: [[], []],
      renderedFolder: { id: "folder-1", name: "Folder" },
      visualFolderPageIndex: 1,
    }, {
      grid: { height: 120, left: 40, top: 80, width: 320 },
      panel: { height: 240, left: 20, top: 40, width: 360 },
    });
    assert(nearlyEqual(layer.pageDotsLayer.alpha, alphaDuringReveal), "same-folder page dot updates should not restart the reveal");
    for (let index = 0; index < 10; index += 1) motionRuntime.step(0.04);
    assert(nearlyEqual(layer.pageDotsLayer.alpha, 1), "folder page dots should settle fully opaque");

    const targetDot = layer.pageDotsLayer.children[1];
    targetDot.emit("pointerdown", {
      nativeEvent: {
        preventDefault() {
          calls.push("native-prevent");
        },
        stopPropagation() {
          calls.push("native-stop");
        },
      },
      preventDefault() {
        calls.push("pixi-prevent");
      },
      stopPropagation() {
        calls.push("pixi-stop");
      },
    });

    assert(commits.join(",") === "1", "folder page dot pointer down should commit only the selected page");
    assert(calls.join(",") === "pixi-prevent,pixi-stop,native-prevent,native-stop", "folder page dot pointer down should stop both Pixi and native propagation");
    layer.pageDotsLayer.destroy({ children: true });
    motionRuntime.reset();
  }

  const compactTiming = getClosingPreviewTiming({ height: 490 }, { height: 70 });
  assert(compactTiming.progress === 0.76, "compact folder preview swap should keep the default start progress");
  assert(compactTiming.iconDuration === 0.22, "compact folder preview icons should keep the default duration");
  assert(compactTiming.swapDuration === 0.18, "compact folder preview wrap should keep the default duration");

  const midTiming = getClosingPreviewTiming({ height: 665 }, { height: 70 });
  assert(nearlyEqual(midTiming.factor, 0.5), "preview timing should scale from the panel-to-thumbnail ratio");
  assert(nearlyEqual(midTiming.progress, 0.72), "mid-height preview swap should start between compact and tall timings");
  assert(nearlyEqual(midTiming.iconDuration, 0.24), "mid-height preview icons should interpolate duration");
  assert(nearlyEqual(midTiming.swapDuration, 0.2), "mid-height preview wrap should interpolate duration");

  const tallTiming = getClosingPreviewTiming({ height: 840 }, { height: 70 });
  assert(tallTiming.progress === 0.68, "tall folder preview swap should start earlier");
  assert(tallTiming.iconDuration === 0.26, "tall folder preview icons should run slightly longer");
  assert(tallTiming.swapDuration === 0.22, "tall folder preview wrap should run slightly longer");

  {
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    try {
      const layer = Object.create(FolderOverlayLayer.prototype);
      layer.iconBoundsRefreshers = new Map();
      layer.openingGhostBoundsRefreshers = new Map();
      layer.registeredBoundsDirty = false;
      layer.registeredBoundsFlushQueued = false;
      let refreshCount = 0;
      layer.refreshRegisteredIconBounds = () => {
        refreshCount += 1;
        return refreshCount;
      };

      layer.markRegisteredBoundsDirty();
      layer.markRegisteredBoundsDirty();
      assert(refreshCount === 0, "registered bounds dirty should wait until the runtime frame-end flush");
      motionRuntime.flushAfterFrameForTests();
      assert(refreshCount === 1, "registered bounds dirty should coalesce repeated marks into one refresh");
      assert(layer.registeredBoundsDirty === false && layer.registeredBoundsFlushQueued === false, "registered bounds flush should clear queued flags");
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      motionRuntime.reset();
    }
  }

  {
    const iconBoundsRegistry = createIconBoundsRegistry();
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.iconBoundsRegistry = iconBoundsRegistry;
    layer.iconBoundsRefreshers = new Map();
    layer.openingGhostBoundsRefreshers = new Map();

    const app = { id: "app-1", type: "app" };
    const makeNode = (left) => ({
      getIconBounds: () => ({ height: 20, left, top: 10, width: 20 }),
    });
    const state = {
      folderPageIndex: 0,
      height: 100,
      stageRect: { height: 100, left: 0, top: 0, width: 100 },
      width: 100,
    };
    const target = {
      folderId: "folder-1",
      iconSize: 20,
      index: 0,
      item: app,
      pageIndex: 0,
      targetStageLayoutRect: { height: 20, left: 30, top: 40, width: 20 },
    };

    layer.iconBoundsRefreshers.set("real", () => layer.registerOpeningGhostBounds(state, target, makeNode(12)));
    layer.openingGhostBoundsRefreshers.set("app-1", () => layer.registerOpeningGhostBounds(state, target, makeNode(52)));
    layer.refreshRegisteredIconBounds();

    const rect = iconBoundsRegistry.getBounds(
      K.LAUNCH,
      V.RENDERED,
      { area: "folder", folderId: "folder-1", id: "app-1", pageIndex: 0 },
      { expected: { area: "folder", folderId: "folder-1", id: "app-1", pageIndex: 0 } }
    );
    assert(rect.left === 52, "opening ghost bounds should refresh after hidden real icon bounds and win during folder open");
    iconBoundsRegistry.clearBounds();
  }

  {
    const scheduler = {
      frames: [],
      cancelAnimationFrame() {
        this.frames = [];
      },
      requestAnimationFrame(callback) {
        this.frames.push(callback);
        return this.frames.length;
      },
    };

    const clearOverlay = (layer) => {
      layer.clearCompletedClosingPreviewGhosts();
      layer.folderHandoff.clearClosePreviewSwaps();
      layer.closingPreviewSwapLayer.removeChildren();
      layer.clearFrameGhost();
    };

    const calls = [];
    const layer = makeClosingHandoffHarness(calls);
    finishClosingHandoff(layer, {}, () => clearOverlay(layer), scheduler);
    assert(layer.pageTrack.visible === false, "closing handoff should keep the page track hidden");
    assert(calls.join(",") === "clear-timer,flush-controller", "closing handoff should release controller ghosts before clearing overlay visuals");
    assert(scheduler.frames.length === 1, "closing handoff should schedule deferred overlay cleanup");
    scheduler.frames.shift()();
    assert(
      calls.join(",") === "clear-timer,flush-controller,clear-preview,clear-swap,clear-frame",
      "closing handoff should clear overlay visuals on the deferred frame"
    );

    const orderingCalls = [];
    const orderingLayer = makeClosingHandoffHarness(orderingCalls);
    orderingLayer.flushCompletedClosingControllerGhosts = () => {
      orderingCalls.push("flush-controller");
      scheduler.requestAnimationFrame(() => orderingCalls.push("finish-flow"));
    };
    scheduler.frames = [];
    finishClosingHandoff(orderingLayer, {}, () => clearOverlay(orderingLayer), scheduler);
    scheduler.frames.shift()();
    scheduler.frames.shift()();
    assert(
      orderingCalls.join(",") === "clear-timer,flush-controller,clear-preview,clear-swap,clear-frame,finish-flow",
      "Pixi overlay cleanup should run before the folder flow reveals the real icon"
    );

    const cancelCalls = [];
    const cancelLayer = makeClosingHandoffHarness(cancelCalls);
    scheduler.frames = [];
    finishClosingHandoff(cancelLayer, {}, () => clearOverlay(cancelLayer), scheduler);
    const canceledFrame = scheduler.frames[0];
    cancelClosingHandoffCleanup(cancelLayer, (id) => scheduler.cancelAnimationFrame(id));
    canceledFrame();
    assert(
      cancelCalls.join(",") === "clear-timer,flush-controller",
      "canceling a closing handoff should prevent stale deferred cleanup"
    );
  }

}
