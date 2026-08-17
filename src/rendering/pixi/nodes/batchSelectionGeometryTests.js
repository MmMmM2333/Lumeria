import {
  BATCH_SELECTION_BADGE_INSET,
  BATCH_SELECTION_FRAME_GAP_X,
  getBatchSelectionBadgeLayout,
  getBatchSelectionFrameRect,
} from "./batchSelectionGeometry.js";

export function runBatchSelectionGeometryTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi batch selection geometry test failed] ${message}`);
  };

  const folderFrame = getBatchSelectionFrameRect({
    area: "folder",
    cellWidth: 160,
    iconSize: 128,
    labelText: {
      height: 16,
      style: { fontSize: 13, lineHeight: 16, wordWrapWidth: 160 },
      text: "New Folder",
      visible: true,
      width: 64,
      y: 64,
    },
    visualOffsetY: -14,
  });
  assert(
    folderFrame.width <= 160 - BATCH_SELECTION_FRAME_GAP_X * 2,
    "folder batch frames should reserve visual horizontal space between cells",
  );

  const badge = getBatchSelectionBadgeLayout({
    frameRect: { left: -60, top: -56, width: 120, height: 120 },
    iconSize: 64,
    isCheck: true,
    label: "✓",
  });
  const badgeRight = badge.x + badge.outerRadius;
  const badgeTop = badge.y - badge.outerRadius;
  assert(
    Math.abs(badgeRight - (60 - BATCH_SELECTION_BADGE_INSET)) < 0.0001,
    "badge outer edge should align to the frame right edge with the configured inset",
  );
  assert(
    Math.abs(badgeTop - (-56 + BATCH_SELECTION_BADGE_INSET)) < 0.0001,
    "badge outer edge should align to the frame top edge with the configured inset",
  );
  assert(badge.fontSize === 0, "check badges should not reserve a text font size");

  const countBadge = getBatchSelectionBadgeLayout({
    frameRect: { left: -50, top: -48, width: 100, height: 110 },
    iconSize: 64,
    isCheck: false,
    label: "99+",
  });
  assert(countBadge.fontSize > 0, "count badges should expose a text font size");
  assert(countBadge.label === "99+", "count badge layout should preserve its label");
  assert(countBadge.textOffsetX > 0, "count badge text should include a small horizontal optical correction");
  assert(countBadge.textOffsetY === 0, "count badge text should not apply a vertical baseline shift");
}
