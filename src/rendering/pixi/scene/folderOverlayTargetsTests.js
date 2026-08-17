import {
  findFolderGhostKey,
  getStableFolderCloseRects,
  getStableFolderClosePresentationHitRects,
  hasUsableFolderGhostTarget,
  makeClosingGhostTarget,
  makeClosingPreviewSwapTargets,
  makeFolderCenterCollapseRect,
  makeFolderThumbPreviewRect,
  makeOpeningGhostTarget,
  makePreviewChildKey,
  makePreviewSlotById,
  makeProjectedPreviewRect,
  makeStableFolderCloseTarget,
  projectFolderCloseTargetToClient,
} from "./folderOverlayTargets.js";
import { STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";

export function runFolderOverlayTargetsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder overlay targets test failed] ${message}`);
  };
  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;
  const assertRectInside = (rect, bounds, message) => {
    assert(rect.left >= bounds.left, `${message}: left should stay inside bounds`);
    assert(rect.top >= bounds.top, `${message}: top should stay inside bounds`);
    assert(rect.left + rect.width <= bounds.left + bounds.width, `${message}: right should stay inside bounds`);
    assert(rect.top + rect.height <= bounds.top + bounds.height, `${message}: bottom should stay inside bounds`);
  };

  const folderRect = { height: 90, left: 10, top: 20, width: 90 };
  const folderThumbRect = { height: 72, left: 14, top: 24, width: 72 };
  const childRect = { height: 14, left: 30, top: 44, width: 14 };
  const previewSlots = [{ id: "app-a" }, { id: "app-b" }, { id: "app-c" }];
  const previewSlotById = makePreviewSlotById(previewSlots);

  assert(previewSlotById.get("app-b") === 1, "preview slot lookup should map item ids to thumbnail slots");
  const ghostKeys = [
    { item: { id: "app-a" }, key: "app-a-slot-0", slotIndex: 0 },
    { item: { id: "app-a" }, key: "app-a-slot-2", slotIndex: 2 },
    { item: { id: "app-b" }, key: "app-b-fallback" },
  ];
  assert(findFolderGhostKey(ghostKeys, "app-a", 2) === "app-a-slot-2", "ghost key lookup should prefer an exact slot match");
  assert(findFolderGhostKey(ghostKeys, "app-b", 1) === "app-b-fallback", "ghost key lookup should fall back to an item match");
  assert(findFolderGhostKey(ghostKeys, "app-z", 0) === null, "ghost key lookup should stay nullable for missing items");
  assert(hasUsableFolderGhostTarget({
    sourceRect: { height: 10, left: 0, top: 0, width: 10 },
    targetStageLayoutRect: { height: 10, left: 20, top: 20, width: 10 },
  }), "ghost targets should be usable with a stage layout target rect");
  assert(hasUsableFolderGhostTarget({
    sourceRect: { height: 10, left: 0, top: 0, width: 10 },
    targetClientRect: { height: 10, left: 20, top: 20, width: 10 },
  }), "ghost targets should be usable with a client visual target rect");
  assert(!hasUsableFolderGhostTarget({
    sourceRect: { height: 10, left: 0, top: 0, width: 10 },
  }), "ghost targets should still require a target rect");

  const projected = makeProjectedPreviewRect(folderRect, 4, 3, 3);
  assert(nearlyEqual(projected.left + projected.width / 2, 55), "projected rect should place slot centers by grid column");
  assert(nearlyEqual(projected.top + projected.height / 2, 65), "projected rect should place slot centers by grid row");

  const previewSizes = [
    { label: "compact thumbnail", rect: { height: 54, left: 12, top: 18, width: 54 } },
    { label: "regular thumbnail", rect: { height: 72, left: 14, top: 24, width: 72 } },
    { label: "4k thumbnail", rect: { height: 120, left: 40, top: 56, width: 120 } },
  ];
  for (const previewSize of previewSizes) {
    for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
      const previewRect = makeProjectedPreviewRect(previewSize.rect, slotIndex, 3, 3);
      assertRectInside(previewRect, previewSize.rect, `${previewSize.label} slot ${slotIndex}`);
      assert(previewRect.width === previewRect.height, `${previewSize.label} slot ${slotIndex} should stay square`);
    }
  }
  for (const slotIndex of [0, 4, 8]) {
    const thumb = getFolderThumbMetrics(folderThumbRect.width);
    const col = slotIndex % 3;
    const row = Math.floor(slotIndex / 3);
    const centerX = folderThumbRect.left + folderThumbRect.width / 2 + thumb.start + col * (thumb.childSize + thumb.gap);
    const centerY = folderThumbRect.top + folderThumbRect.height / 2 + thumb.start + row * (thumb.childSize + thumb.gap);
    const previewRect = makeFolderThumbPreviewRect(folderThumbRect, slotIndex);
    assert(nearlyEqual(previewRect.left, centerX - thumb.childSize / 2), `folder thumb slot ${slotIndex} should use the real thumb x`);
    assert(nearlyEqual(previewRect.top, centerY - thumb.childSize / 2), `folder thumb slot ${slotIndex} should use the real thumb y`);
    assert(nearlyEqual(previewRect.width, thumb.childSize), `folder thumb slot ${slotIndex} should use the real thumb width`);
    assert(nearlyEqual(previewRect.height, thumb.childSize), `folder thumb slot ${slotIndex} should use the real thumb height`);
  }

  const stableTarget = makeStableFolderCloseTarget({
    folderId: "folder-1",
    getStageLayoutPreviewChildRect: (item, slotIndex) => item.id === "app-b" && slotIndex === 1 ? childRect : null,
    iconRect: folderRect,
    previewSlots,
    projection: { stageHeight: 100, stageRect: { height: 100, left: 0, top: 0, width: 100 }, stageWidth: 100 },
    thumbRect: folderThumbRect,
  });
  assert(stableTarget.folderId === "folder-1", "stable close target should keep the folder id");
  assert(stableTarget.coordinateSpace === "stage-layout", "stable close target should declare stage layout coordinates");
  assert(stableTarget.iconRect !== folderRect && stableTarget.iconRect.left === folderRect.left, "stable icon rect should be cloned");
  assert(
    stableTarget.previewChildRects.get(makePreviewChildKey("app-b", 1)).left === childRect.left,
    "stable close target should cache available stage layout preview child bounds"
  );
  const projectedStableTarget = projectFolderCloseTargetToClient(stableTarget);
  assert(projectedStableTarget.iconRect.left === folderRect.left, "stable close target should project icon rect at client boundaries");

  const clientTarget = makeStableFolderCloseTarget({
    coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    folderId: "folder-1",
    getStageLayoutPreviewChildRect: (item, slotIndex) => item.id === "app-b" && slotIndex === 1 ? childRect : null,
    iconRect: { height: 95, left: 210, top: 220, width: 95 },
    previewSlots,
    projection: { stageHeight: 1, stageRect: { height: 1, left: 999, top: 999, width: 1 }, stageWidth: 1 },
    thumbRect: folderThumbRect,
    trackingKey: "live-close-target|folder-1",
  });
  const projectedClientTarget = projectFolderCloseTargetToClient(clientTarget);
  assert(projectedClientTarget.iconRect.left === 210, "client visual close targets should not be stage-layout projected");
  assert(clientTarget.trackingKey === "live-close-target|folder-1", "stable close target should keep the tracking key");

  const closeRects = getStableFolderCloseRects({
    folderId: "folder-1",
    folderRect: { height: 10, left: 0, top: 0, width: 10 },
    folderThumbRect: { height: 10, left: 0, top: 0, width: 10 },
    isClosing: true,
    stableFolderCloseTarget: stableTarget,
  });
  assert(closeRects.closeThumbRect.left === folderThumbRect.left, "closing should prefer the stable thumbnail bounds");

  const frameHitRects = getStableFolderClosePresentationHitRects({
    frameRect: { height: 120, left: 200, top: 220, width: 160 },
    handoffRect: { height: 32, left: 80, top: 90, width: 32 },
    stableFolderCloseTarget: stableTarget,
  });
  assert(frameHitRects.length === 1 && frameHitRects[0].left === 200, "closing hit testing should prefer the visible frame ghost rect");

  const handoffHitRects = getStableFolderClosePresentationHitRects({
    handoffRect: { height: 32, left: 80, top: 90, width: 32 },
    stableFolderCloseTarget: stableTarget,
  });
  assert(handoffHitRects.length === 1 && handoffHitRects[0].left === 80, "closing hit testing should fall back to the current handoff rect");

  const projectedHitRects = getStableFolderClosePresentationHitRects({
    stableFolderCloseTarget: stableTarget,
  });
  assert(projectedHitRects.length === 2, "closing hit testing should use projected stable target rects only as the final fallback");

  const openingTarget = makeOpeningGhostTarget({
    cellHeight: 80,
    cellWidth: 100,
    cols: 5,
    controllerGhostKey: "open-ghost",
    folderId: "folder-1",
    folderRect,
    getPreviewChildRect: (item, slotIndex) => item.id === "app-b" && slotIndex === 1 ? childRect : null,
    iconSize: 56,
    index: 5,
    item: { id: "app-b" },
    pageIndex: 2,
    previewSlotById,
    rows: 2,
    targetCenterX: 200,
    targetCenterY: 300,
  });
  assert(openingTarget.isThumbnailChild && openingTarget.previewSlotIndex === 1, "opening target should identify thumbnail children");
  assert(openingTarget.sourceRect === childRect, "opening target should use registered preview bounds first");
  assert(openingTarget.folderId === "folder-1" && openingTarget.pageIndex === 2, "opening target should keep folder identity for bounds ownership");
  assert(openingTarget.targetStageLayoutRect.left === 172 && openingTarget.targetStageLayoutRect.top === 272, "opening target should build a centered stage layout icon target");

  stableTarget.previewChildRects = new Map([[makePreviewChildKey("app-b", 1), { height: 7, left: 11, top: 13, width: 7 }]]);
  stableTarget.thumbRect = { height: 36, left: 5, top: 8, width: 36 };
  const closingTarget = makeClosingGhostTarget({
    cellHeight: 80,
    cellWidth: 100,
    closeThumbRect: folderThumbRect,
    cols: 5,
    controllerGhostKey: "close-ghost",
    folderId: "folder-1",
    iconBounds: { height: 56, left: 150, top: 160, width: 56 },
    iconSize: 56,
    index: 5,
    item: { id: "app-b" },
    previewSlotById,
    stableFolderCloseTarget: stableTarget,
  });
  assert(closingTarget.isThumbnailChild, "closing target should identify thumbnail children");
  assert(closingTarget.targetStageLayoutRect.left === 11, "closing target should retain the stable stage layout preview target");

  const clientClosingTarget = makeClosingGhostTarget({
    cellHeight: 80,
    cellWidth: 100,
    closeThumbRect: folderThumbRect,
    cols: 5,
    controllerGhostKey: "close-client-ghost",
    folderId: "folder-1",
    iconBounds: { height: 56, left: 150, top: 160, width: 56 },
    iconSize: 56,
    index: 5,
    item: { id: "app-b" },
    previewSlotById,
    stableFolderCloseTarget: clientTarget,
  });
  assert(clientClosingTarget.targetClientRect.left === childRect.left, "client close targets should expose a client target rect");
  assert(clientClosingTarget.targetStageLayoutRect === null, "client close targets should not expose a stage-layout target rect");

  const projectedThumbnailTarget = makeClosingGhostTarget({
    cellHeight: 80,
    cellWidth: 100,
    closeThumbRect: folderThumbRect,
    cols: 5,
    folderId: "folder-1",
    iconBounds: { height: 56, left: 150, top: 160, width: 56 },
    iconSize: 56,
    index: 5,
    item: { id: "app-c" },
    previewSlotById,
    stableFolderCloseTarget: stableTarget,
  });
  assert(projectedThumbnailTarget.isThumbnailChild, "thumbnail children without exact stable bounds should stay thumbnail targets");
  assert(projectedThumbnailTarget.targetStageLayoutRect, "thumbnail close fallback should expose a stage layout thumb target when available");
  assertRectInside(projectedThumbnailTarget.targetStageLayoutRect, stableTarget.thumbRect, "projected thumbnail close stage target");

  const fallbackClosingTarget = makeClosingGhostTarget({
    cellHeight: 80,
    cellWidth: 100,
    closeThumbRect: folderThumbRect,
    cols: 5,
    folderId: "folder-1",
    iconBounds: { height: 56, left: 150, top: 160, width: 56 },
    iconSize: 56,
    index: 6,
    item: { id: "app-z" },
    previewSlotById,
    stableFolderCloseTarget: stableTarget,
  });
  assert(!fallbackClosingTarget.isThumbnailChild, "non-preview children should collapse to the folder center");
  assert(fallbackClosingTarget.targetStageLayoutRect, "non-preview closing target should expose a stage layout center collapse when available");
  assert(
    nearlyEqual(fallbackClosingTarget.targetStageLayoutRect.left + fallbackClosingTarget.targetStageLayoutRect.width / 2, 23),
    "non-preview closing targets should collapse to the stage layout thumbnail center"
  );

  const staleStableTarget = makeClosingGhostTarget({
    cellHeight: 80,
    cellWidth: 100,
    closeThumbRect: folderThumbRect,
    cols: 5,
    folderId: "folder-2",
    iconBounds: { height: 56, left: 150, top: 160, width: 56 },
    iconSize: 56,
    index: 1,
    item: { id: "app-b" },
    previewSlotById,
    stableFolderCloseTarget: { ...stableTarget, folderId: "folder-1" },
  });
  const expectedStalePreviewTarget = makeFolderThumbPreviewRect(folderThumbRect, 1);
  assert(
    staleStableTarget.targetClientRect?.left === expectedStalePreviewTarget.left && !staleStableTarget.targetStageLayoutRect,
    "a stale stable folder target should fall back to the current thumbnail rect"
  );

  const staleStableCenterTarget = makeClosingGhostTarget({
    cellHeight: 80,
    cellWidth: 100,
    closeThumbRect: folderThumbRect,
    cols: 5,
    folderId: "folder-2",
    iconBounds: { height: 56, left: 150, top: 160, width: 56 },
    iconSize: 56,
    index: 6,
    item: { id: "app-z" },
    previewSlotById,
    stableFolderCloseTarget: { ...stableTarget, folderId: "folder-1" },
  });
  const expectedStaleCenterTarget = makeFolderCenterCollapseRect(folderThumbRect);
  assert(
    staleStableCenterTarget.targetClientRect?.left === expectedStaleCenterTarget.left && !staleStableCenterTarget.targetStageLayoutRect,
    "a stale stable folder target should fall back to the current center collapse rect"
  );

  const swapTargets = makeClosingPreviewSwapTargets({
    folderId: "folder-1",
    folderRect: folderThumbRect,
    previewSlots,
    stableFolderCloseTarget: stableTarget,
  });
  assert(swapTargets.length === 3, "preview swap should emit one target per visible preview slot");
  assert(swapTargets[1].targetStageLayoutRect.left === 11, "preview swap should retain stable stage layout preview child bounds");

  const clientSwapTargets = makeClosingPreviewSwapTargets({
    folderId: "folder-1",
    folderRect: folderThumbRect,
    previewSlots,
    stableFolderCloseTarget: clientTarget,
  });
  assert(clientSwapTargets[1].targetClientRect.left === childRect.left, "preview swap should retain client visual child bounds");
  assert(!clientSwapTargets[1].targetStageLayoutRect, "preview swap client targets should not expose stage layout bounds");
}
