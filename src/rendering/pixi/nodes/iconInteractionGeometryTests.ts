import {
  getEditButtonActionAt,
  getIconCellContentMaxWidth,
  getIconCellTopInteractionOverflow,
  getIconHitAreaRect,
  isPointInsideEditButton,
} from "./iconInteractionGeometry.js";

function makeButton(x: number, y: number, visible = true) {
  return { visible, x, y };
}

export function runIconInteractionGeometryTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon interaction geometry test failed] ${message}`);
  };

  const normalRect = getIconHitAreaRect({ iconSize: 64, visualOffsetY: -14 });
  assert(normalRect.left === -32 && normalRect.top === -46, "normal hit area should cover the visual icon");
  assert(normalRect.width === 64 && normalRect.height === 64, "normal hit area should match icon size");

  const compactRect = getIconHitAreaRect({ iconSize: 32, visualOffsetY: 0 });
  assert(compactRect.width === 44 && compactRect.height === 44, "small icons should retain a touch-sized interaction target");

  const editingAppRect = getIconHitAreaRect({ editing: true, iconSize: 64, itemType: "app", visualOffsetY: -14 });
  assert(editingAppRect.left === -44 && editingAppRect.top === -58, "editing app hit area should expand for edit buttons");
  assert(editingAppRect.width === 88 && editingAppRect.height === 88, "editing app hit area should include edit padding");

  const editingFolderRect = getIconHitAreaRect({ editing: true, iconSize: 64, itemType: "folder", visualOffsetY: -14 });
  assert(editingFolderRect.width === 64 && editingFolderRect.height === 64, "folder hit area should not expand for app edit buttons");

  assert(getIconCellContentMaxWidth(90) === 66, "cell content width should reserve interaction padding on both sides");
  assert(getIconCellContentMaxWidth(null) === null, "missing cell widths should preserve unconstrained callers");
  const compressedTopOverflow = getIconCellTopInteractionOverflow({
    cellHeight: 89.89,
    iconSize: 47.94,
    visualOffsetY: -14,
  });
  assert(Math.abs(compressedTopOverflow - 17.025) < 0.0001, "compressed first rows should derive their mask overflow from the real hit area");

  assert(isPointInsideEditButton({ x: 12, y: 0 }, makeButton(0, 0)), "points on the edit button radius should hit");
  assert(!isPointInsideEditButton({ x: 13, y: 0 }, makeButton(0, 0)), "points outside the edit button radius should miss");
  assert(!isPointInsideEditButton({ x: 0, y: 0 }, makeButton(0, 0, false)), "hidden edit buttons should not hit");

  const buttons = {
    changeButton: makeButton(20, 0),
    removeButton: makeButton(-20, 0),
    resetButton: makeButton(20, 20),
  };
  assert(getEditButtonActionAt({ x: -20, y: 0 }, { ...buttons, editing: true, itemType: "app", removable: true }) === "remove", "remove button should map to remove action");
  assert(getEditButtonActionAt({ x: 20, y: 0 }, { ...buttons, editing: true, itemType: "app" }) === "choose-icon", "change button should map to choose-icon action");
  assert(getEditButtonActionAt({ x: 20, y: 20 }, { ...buttons, editing: true, hasCustomIcon: true, itemType: "app" }) === "reset-icon", "reset button should map to reset-icon action");
  assert(getEditButtonActionAt({ x: 20, y: 20 }, { ...buttons, editing: true, itemType: "app" }) === null, "reset button should require a custom icon");
  assert(getEditButtonActionAt({ x: 20, y: 0 }, { ...buttons, editing: true, itemType: "folder" }) === null, "folders should not expose app edit actions");
  assert(getEditButtonActionAt({ x: 20, y: 0 }, { ...buttons, itemType: "app" }) === null, "inactive editing state should not expose edit actions");
}
