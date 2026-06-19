import {
  findFolderGhostKey,
  getStableFolderCloseRects,
  makeClosingGhostTarget,
  makeClosingPreviewSwapTargets,
  makeFolderThumbPreviewRect,
  makeOpeningGhostTarget,
  makePreviewChildKey,
  makePreviewSlotById,
  makeProjectedPreviewRect,
  makeStableFolderCloseTarget,
} from "./folderOverlayTargets.js";
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
    getProjectedClientPreviewChildRect: (item, slotIndex) => item.id === "app-b" && slotIndex === 1 ? childRect : null,
    previewSlots,
    projectedClientIconRect: folderRect,
    projectedClientThumbRect: folderThumbRect,
  });
  assert(stableTarget.folderId === "folder-1", "stable close target should keep the folder id");
  assert(stableTarget.projectedClientIconRect !== folderRect && stableTarget.projectedClientIconRect.left === folderRect.left, "stable projected icon rect should be cloned");
  assert(
    stableTarget.projectedClientPreviewChildRects.get(makePreviewChildKey("app-b", 1)).left === childRect.left,
    "stable close target should cache available projected preview child bounds"
  );

  const closeRects = getStableFolderCloseRects({
    folderId: "folder-1",
    folderRect: { height: 10, left: 0, top: 0, width: 10 },
    folderThumbRect: { height: 10, left: 0, top: 0, width: 10 },
    isClosing: true,
    stableFolderCloseTarget: stableTarget,
  });
  assert(closeRects.closeThumbRect.left === folderThumbRect.left, "closing should prefer the stable thumbnail bounds");

  const openingTarget = makeOpeningGhostTarget({
    cellHeight: 80,
    cellWidth: 100,
    cols: 5,
    controllerGhostKey: "open-ghost",
    folderRect,
    getPreviewChildRect: (item, slotIndex) => item.id === "app-b" && slotIndex === 1 ? childRect : null,
    iconSize: 56,
    index: 5,
    item: { id: "app-b" },
    previewSlotById,
    rows: 2,
    targetCenterX: 200,
    targetCenterY: 300,
  });
  assert(openingTarget.isThumbnailChild && openingTarget.previewSlotIndex === 1, "opening target should identify thumbnail children");
  assert(openingTarget.sourceRect === childRect, "opening target should use registered preview bounds first");
  assert(openingTarget.targetRect.left === 172 && openingTarget.targetRect.top === 272, "opening target should build a centered icon target");

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
  assert(closingTarget.targetRect.left === childRect.left, "closing target should use stable preview bounds first");

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
  assertRectInside(projectedThumbnailTarget.targetRect, folderThumbRect, "projected thumbnail close target");
  assert(
    nearlyEqual(projectedThumbnailTarget.targetRect.width, getFolderThumbMetrics(folderThumbRect.width).childSize),
    "thumbnail close fallback should use the real folder thumb child size"
  );

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
  assert(
    nearlyEqual(fallbackClosingTarget.targetRect.left + fallbackClosingTarget.targetRect.width / 2, 50),
    "non-preview closing targets should collapse to the thumbnail center"
  );

  const swapTargets = makeClosingPreviewSwapTargets({
    folderId: "folder-1",
    folderRect: folderThumbRect,
    previewSlots,
    stableFolderCloseTarget: stableTarget,
  });
  assert(swapTargets.length === 3, "preview swap should emit one target per visible preview slot");
  assert(swapTargets[1].targetRect.left === childRect.left, "preview swap should reuse stable preview child bounds");
}
