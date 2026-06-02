import { nextTick } from "vue";
import {
  getFolderOpenExtraIconDelay,
  getFolderOpenPreviewIconDelay,
  makeFolderGridChildSelector,
  makeFolderGridFrameSelector,
  makeFolderPreviewChildSelector,
  makeFolderPreviewChildVisualSelector,
  projectTargetGridSlotIntoSourceBounds,
  useFolderOpenIconGhosts,
} from "./useFolderOpenIconGhosts.js";

const folder = { id: 'folder"1', type: "folder", name: "Folder" };
const child = { id: 'child"1', type: "app", name: "Child" };

function createNode(rect, metrics = {}) {
  const children = metrics.children || new Map();
  const closestNodes = metrics.closest || {};
  return {
    style: metrics.style || {},
    offsetWidth: metrics.offsetWidth ?? rect.width,
    offsetHeight: metrics.offsetHeight ?? rect.height,
    closest(selector) {
      if (typeof closestNodes === "function") return closestNodes(selector);
      return closestNodes[selector] || null;
    },
    getBoundingClientRect: () => rect,
    querySelector(selector) {
      return children.get?.(selector) || null;
    },
  };
}

function createTimerWindow() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    getComputedStyle(node) {
      return node?.style || {};
    },
    runDelay(delay) {
      const matchingTimers = Array.from(timers.entries()).filter(([, timer]) => timer.delay === delay);
      for (const [id, timer] of matchingTimers) {
        timers.delete(id);
        timer.callback();
      }
    },
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
  };
}

export async function runFolderOpenIconGhostsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder open icon ghosts test failed] ${message}`);
  };
  const assertAlmostEqual = (actual, expected, message) => {
    if (Math.abs(actual - expected) > 0.001) {
      throw new Error(`[Folder open icon ghosts test failed] ${message}: expected ${expected}, got ${actual}`);
    }
  };

  assert(
    makeFolderPreviewChildSelector('folder"1', 'child"1') === '.folder-child[data-folder-preview-folder-id="folder\\"1"][data-folder-preview-child-id="child\\"1"]',
    "preview selector should escape attribute values",
  );
  assert(
    makeFolderPreviewChildVisualSelector('folder"1', 'child"1') === '.folder-child[data-folder-preview-folder-id="folder\\"1"][data-folder-preview-child-id="child\\"1"] .folder-child-visual',
    "preview visual selector should escape attribute values",
  );
  assert(
    makeFolderGridChildSelector('folder"1', 'child"1') === '.icon-hit-target[data-launch-area="folder"][data-launch-folder-id="folder\\"1"][data-launch-item-id="child\\"1"] .icon-box',
    "folder grid selector should escape attribute values",
  );
  assert(
    makeFolderGridFrameSelector('folder"1', 'child"1') === '.icon-selection-frame[data-folder-open-folder-id="folder\\"1"][data-folder-open-child-id="child\\"1"]',
    "folder grid frame selector should escape attribute values",
  );
  assert(getFolderOpenPreviewIconDelay(0) === 0, "first preview icon should start immediately");
  assert(getFolderOpenPreviewIconDelay(8) === 64, "preview icon delay should follow 3x3 spatial order");
  assert(getFolderOpenExtraIconDelay(9) > getFolderOpenPreviewIconDelay(8), "extra icon delay should continue after preview icons");
  assert(getFolderOpenExtraIconDelay(80) === 180, "extra icon delay should be capped");
  const projectedSecondRow = projectTargetGridSlotIntoSourceBounds(
    { left: 100, top: 50, width: 26, height: 26 },
    7,
    7,
    2,
    { width: 6, height: 6, gapRatio: 4 / 6 },
  );
  assertAlmostEqual(projectedSecondRow.left, 100.67532467532467, "target-grid projection should preserve the second-row first-column x topology");
  assertAlmostEqual(projectedSecondRow.top, 68.31818181818181, "target-grid projection should place the second target row in the second mini-grid row");
  assertAlmostEqual(projectedSecondRow.width, 2.3636363636363638, "target-grid projection should keep mini-grid slots visible without stretching them");

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const timers = createTimerWindow();
  const nodes = new Map([
    [".folder-panel-content", createNode({ left: 50, top: 60, width: 400, height: 300 }, { offsetWidth: 800, offsetHeight: 600 })],
    [makeFolderPreviewChildSelector(folder.id, child.id), createNode({ left: 1, top: 2, width: 18, height: 18 })],
    [makeFolderPreviewChildVisualSelector(folder.id, child.id), createNode({ left: 70, top: 90, width: 6, height: 6 })],
    [makeFolderGridFrameSelector(folder.id, child.id), createNode({ left: 250, top: 210, width: 80, height: 60 })],
    [makeFolderGridChildSelector(folder.id, child.id), createNode({ left: 270, top: 220, width: 32, height: 32 })],
  ]);

  globalThis.window = timers;
  globalThis.document = {
    querySelector(selector) {
      return nodes.get(selector) || null;
    },
  };

  try {
    const ghosts = useFolderOpenIconGhosts({
      cloneItem: (item) => ({ ...item }),
      folderPreviewSlots: () => [child, null, null, null, null, null, null, null, null],
    });
    const captured = ghosts.captureFolderPreviewIconGhosts(folder);
    assert(captured.length === 1, "capture should include visible preview child icons");
    assert(captured[0].from.left === 70 && captured[0].from.width === 6, "capture should snapshot preview viewport geometry");
    assert(captured[0].item !== child, "capture should clone ghost item data");

    ghosts.playFolderOpenIconGhosts(folder.id, captured);
    assert(ghosts.isFolderOpenIconAnimationActive.value, "play should immediately mark the folder icon animation active");
    assert(ghosts.isFolderOpeningIconGhosted(folder.id, child.id), "play should immediately hide matching target icons");
    await nextTick();
    assert(ghosts.folderOpenIconGhosts.value.length === 1, "play should publish ghosts after target geometry is available");
    const ghost = ghosts.folderOpenIconGhosts.value[0];
    assert(ghost.from.left === 40 && ghost.from.width === 12, "play should project the target geometry into the source preview bounds");
    assert(ghost.to.left === 400 && ghost.to.width === 160, "play should map target frame geometry into folder content space");
    assert(ghost.toIcon.left === 440 && ghost.toIcon.width === 64, "play should map target icon geometry into folder content space");
    const motionStyle = ghosts.getFolderOpenIconGhostStyle(ghost);
    assert(motionStyle.left === "400px" && motionStyle.top === "300px", "ghost style should pin the Motion layer to the target frame");
    assert(motionStyle.width === "160px" && motionStyle.height === "120px", "ghost style should use target frame size");
    assert(motionStyle["--folder-open-label-delay"] === "120ms", "ghost label delay should include the slot delay");
    assert(!("transform" in motionStyle), "ghost movement should be delegated to Motion transform values");
    const initial = ghosts.getFolderOpenIconGhostInitial(ghost);
    assertAlmostEqual(initial.x, -367.5, "initial Motion x should align the ghost icon with the projected source icon");
    assertAlmostEqual(initial.y, -243.75, "initial Motion y should align the ghost icon with the projected source icon");
    assert(initial.scaleX === 12 / 64 && initial.scaleY === 12 / 64, "initial Motion scale should match source-to-target icon size ratio");
    const animate = ghosts.getFolderOpenIconGhostAnimate(ghost);
    assert(animate.x === 0 && animate.y === 0 && animate.scaleX === 1 && animate.scaleY === 1, "animate target should settle at identity transform");
    const transition = ghosts.getFolderOpenIconGhostTransition(ghost);
    assert(transition.delay === 0 && transition.duration === 0.36, "transition should use the slot delay and Motion duration");

    ghosts.completeFolderOpenIconGhost("stale-key");
    assert(ghosts.folderOpenIconGhosts.value.length === 1, "stale completion should not clear current ghosts");
    assert(ghosts.isFolderOpeningIconGhosted(folder.id, child.id), "stale completion should not reveal matching target icons");

    ghosts.completeFolderOpenIconGhost(ghost.key);
    assert(ghosts.folderOpenIconGhosts.value.length === 0, "ghosts should clear after Motion completion");
    assert(!ghosts.isFolderOpenIconAnimationActive.value, "completion should mark the folder icon animation inactive");
    assert(!ghosts.isFolderOpeningIconGhosted(folder.id, child.id), "completion should reveal matching target icons");

    const gridFolder = { id: "folder-grid", type: "folder", name: "Grid Folder" };
    const gridChildren = Array.from({ length: 10 }, (_, index) => ({ id: `grid-child-${index}`, type: "app", name: `Child ${index + 1}` }));
    const gridNodes = new Map([
      [".folder-panel-content", createNode({ left: 0, top: 0, width: 1000, height: 800 }, { offsetWidth: 1000, offsetHeight: 800 })],
    ]);
    for (let index = 0; index < gridChildren.length; index += 1) {
      const gridChild = gridChildren[index];
      const previewCol = index % 3;
      const previewRow = Math.floor(index / 3);
      const targetCol = index % 7;
      const targetRow = Math.floor(index / 7);
      if (index < 9) {
        gridNodes.set(makeFolderPreviewChildVisualSelector(gridFolder.id, gridChild.id), createNode({
          left: 100 + previewCol * 10,
          top: 50 + previewRow * 10,
          width: 6,
          height: 6,
        }));
      }
      gridNodes.set(makeFolderGridFrameSelector(gridFolder.id, gridChild.id), createNode({
        left: 190 + targetCol * 40,
        top: 292 + targetRow * 50,
        width: 44,
        height: 46,
      }));
      gridNodes.set(makeFolderGridChildSelector(gridFolder.id, gridChild.id), createNode({
        left: 200 + targetCol * 40,
        top: 300 + targetRow * 50,
        width: 24,
        height: 24,
      }));
    }
    globalThis.document = {
      querySelector(selector) {
        return gridNodes.get(selector) || null;
      },
    };
    const gridGhosts = useFolderOpenIconGhosts({
      cloneItem: (item) => ({ ...item }),
      folderPreviewSlots: () => gridChildren.slice(0, 9),
    });
    const capturedGridGhosts = gridGhosts.captureFolderPreviewIconGhosts(gridFolder, gridChildren);
    assert(capturedGridGhosts.length === 10, "capture should include all visible opening page children");
    assert(capturedGridGhosts[7].from.left === 110 && capturedGridGhosts[7].from.top === 70, "capture should still snapshot the real 3x3 preview slot");
    assert(capturedGridGhosts[9].synthetic === true, "capture should synthesize ghosts for children outside the preview thumb");
    assert(capturedGridGhosts[9].from === null, "synthetic ghosts should not invent viewport geometry before target projection");
    assert(capturedGridGhosts[9].sourceBounds.width === 26, "synthetic ghosts should keep the measured preview source bounds");

    gridGhosts.playFolderOpenIconGhosts(gridFolder.id, capturedGridGhosts);
    assert(gridGhosts.isFolderOpeningIconGhosted(gridFolder.id, gridChildren[9].id), "play should immediately hide synthetic target icons");
    await nextTick();
    const openedGridGhosts = gridGhosts.folderOpenIconGhosts.value;
    assert(openedGridGhosts.length === 10, "play should publish a ghost for every visible opening page child");
    const seventhIndexGhost = openedGridGhosts.find((candidate) => candidate.slotIndex === 7);
    const eighthIndexGhost = openedGridGhosts.find((candidate) => candidate.slotIndex === 8);
    const ninthIndexGhost = openedGridGhosts.find((candidate) => candidate.slotIndex === 9);
    assert(seventhIndexGhost.targetColumnCount === 7, "target column count should be inferred from the measured folder grid");
    assertAlmostEqual(seventhIndexGhost.previewFrom.left, 110, "slot 7 should retain its measured 3x3 preview position for diagnostics");
    assertAlmostEqual(seventhIndexGhost.from.left, 100.67532467532467, "slot 7 should project from target-grid row 2 column 1, not the 3x3 row 3 column 2 slot");
    assertAlmostEqual(seventhIndexGhost.from.top, 68.31818181818181, "slot 7 should project to the target-grid second row inside the source bounds");
    assertAlmostEqual(eighthIndexGhost.from.left, 104.3896103896104, "slot 8 should project from target-grid row 2 column 2");
    assert(ninthIndexGhost.synthetic === true, "slot 9 should remain marked as synthetic after measurement");
    assert(ninthIndexGhost.previewFrom === null, "slot 9 should not report a measured preview rect");
    assertAlmostEqual(ninthIndexGhost.from.left, 108.1038961038961, "slot 9 should project from target-grid row 2 column 3");
    assertAlmostEqual(ninthIndexGhost.from.top, 68.31818181818181, "slot 9 should share the target-grid second-row source y");
    assert(gridGhosts.getFolderOpenIconGhostInitial(ninthIndexGhost).opacity === 0, "synthetic ghosts should fade in from the compressed source grid");
    assert(gridGhosts.getFolderOpenIconGhostStyle(seventhIndexGhost)["--folder-open-label-delay"] === "142ms", "slot 7 label delay should follow the inferred target-grid row and column");
    assertAlmostEqual(gridGhosts.getFolderOpenIconGhostTransition(seventhIndexGhost).delay, 0.022, "slot 7 motion delay should follow the inferred target-grid row and column");
    assertAlmostEqual(gridGhosts.getFolderOpenIconGhostTransition(ninthIndexGhost).delay, 0.042, "synthetic slot delay should follow its target-grid row and column");

    const closeGridNode = createNode(
      { left: 0, top: 0, width: 700, height: 200 },
      { style: { gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr 1fr", gridTemplateRows: "1fr 1fr" } }
    );
    const transformRestingRect = (rect) => ({
      left: 40 + rect.left * 0.92,
      top: 76 + rect.top * 0.92,
      width: rect.width * 0.92,
      height: rect.height * 0.92,
    });
    const closeNodes = new Map([
      [".launchpad-shell", createNode(
        { left: 40, top: 76, width: 920, height: 736 },
        {
          offsetWidth: 1000,
          offsetHeight: 800,
          style: {
            transform: "matrix(0.92, 0, 0, 0.92, 0, 44)",
            transformOrigin: "500px 400px",
          },
        }
      )],
    ]);
    for (let index = 0; index < gridChildren.length; index += 1) {
      const gridChild = gridChildren[index];
      const previewCol = index % 3;
      const previewRow = Math.floor(index / 3);
      const sourceCol = index % 7;
      const sourceRow = Math.floor(index / 7);
      if (index < 9) {
        closeNodes.set(makeFolderPreviewChildVisualSelector(gridFolder.id, gridChild.id), createNode(transformRestingRect({
          left: 100 + previewCol * 10,
          top: 50 + previewRow * 10,
          width: 6,
          height: 6,
        })));
      }
      closeNodes.set(makeFolderGridFrameSelector(gridFolder.id, gridChild.id), createNode(
        {
          left: 190 + sourceCol * 40,
          top: 292 + sourceRow * 50,
          width: 44,
          height: 46,
        },
        { closest: { ".folder-grid": closeGridNode } }
      ));
      closeNodes.set(makeFolderGridChildSelector(gridFolder.id, gridChild.id), createNode({
        left: 200 + sourceCol * 40,
        top: 300 + sourceRow * 50,
        width: 24,
        height: 24,
      }));
    }
    globalThis.document = {
      querySelector(selector) {
        return closeNodes.get(selector) || null;
      },
    };
    const closeGhosts = useFolderOpenIconGhosts({
      cloneItem: (item) => ({ ...item }),
      folderPreviewSlots: () => gridChildren.slice(0, 9),
    });
    const capturedCloseGhosts = closeGhosts.captureFolderCloseIconGhosts(gridFolder, gridChildren);
    assert(capturedCloseGhosts.length === 10, "close capture should include every visible closing page child");
    const closeSeventhIndexGhost = capturedCloseGhosts.find((candidate) => candidate.slotIndex === 7);
    const closeEighthIndexGhost = capturedCloseGhosts.find((candidate) => candidate.slotIndex === 8);
    const closeNinthIndexGhost = capturedCloseGhosts.find((candidate) => candidate.slotIndex === 9);
    assert(closeSeventhIndexGhost.sourceColumnCount === 7, "close capture should infer the source folder-grid columns");
    assertAlmostEqual(closeSeventhIndexGhost.previewTo.left, 110, "close capture should keep the real preview target for diagnostics");
    assertAlmostEqual(closeSeventhIndexGhost.to.left, 100.67532467532467, "close slot 7 should target folder-grid row 2 column 1 topology");
    assertAlmostEqual(closeSeventhIndexGhost.to.top, 68.31818181818181, "close slot 7 should target the projected second mini-grid row");
    assertAlmostEqual(closeEighthIndexGhost.to.left, 104.3896103896104, "close slot 8 should target folder-grid row 2 column 2 topology");
    assert(closeNinthIndexGhost.synthetic === true, "close slot 9 should remain synthetic when absent from the folder preview");
    assertAlmostEqual(closeNinthIndexGhost.to.left, 108.1038961038961, "close slot 9 should target folder-grid row 2 column 3 topology");

    closeGhosts.playFolderCloseIconGhosts(gridFolder.id, capturedCloseGhosts);
    assert(closeGhosts.isFolderCloseIconAnimationActive.value, "close play should mark close icon animation active");
    assert(closeGhosts.isFolderClosingIconGhosted(gridFolder.id, gridChildren[7].id), "close play should hide matching folder icons");
    assert(closeGhosts.folderCloseIconGhosts.value.length === 10, "close play should publish viewport ghosts immediately");
    const closingSeventhIndexGhost = closeGhosts.folderCloseIconGhosts.value.find((candidate) => candidate.slotIndex === 7);
    const closeStyle = closeGhosts.getFolderCloseIconGhostStyle(closingSeventhIndexGhost);
    assert(closeStyle.left === "190px" && closeStyle.top === "342px", "close ghost style should pin the Motion layer to the source frame");
    assert(closeStyle["--app-icon-size"] === "24px", "close ghost style should keep the source icon size");
    const closeAnimate = closeGhosts.getFolderCloseIconGhostAnimate(closingSeventhIndexGhost);
    assertAlmostEqual(closeAnimate.x, -90.30919913419913, "close Motion x should align the ghost icon with the projected target icon");
    assertAlmostEqual(closeAnimate.y, -274.46915584415586, "close Motion y should align the ghost icon with the projected target icon");
    assertAlmostEqual(closeAnimate.scaleX, 0.0984848484848485, "close Motion scale should collapse to the projected mini-grid icon size");
    assert(closeAnimate.opacity === 0, "close ghosts should fade out into the desktop folder thumbnail");
    assertAlmostEqual(closeGhosts.getFolderCloseIconGhostTransition(closingSeventhIndexGhost).delay, 0.022, "close slot 7 delay should follow the source folder-grid row and column");
    closeGhosts.completeFolderCloseIconGhost("stale-key");
    assert(closeGhosts.folderCloseIconGhosts.value.length === 10, "stale close completion should not clear current ghosts");
    closeGhosts.folderCloseIconGhosts.value.forEach((candidate) => closeGhosts.completeFolderCloseIconGhost(candidate.key));
    assert(closeGhosts.folderCloseIconGhosts.value.length === 0, "close ghosts should clear after all Motion completions");
    assert(!closeGhosts.isFolderCloseIconAnimationActive.value, "close completion should mark the close icon animation inactive");
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}
