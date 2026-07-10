import {
  ICON_CONTEXT_MENU_VIEWPORT_MARGIN,
  clampIconContextMenuPosition,
} from "./iconContextMenuGeometry.js";

export function runIconContextMenuGeometryTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Icon context menu geometry test failed] ${message}`);
  };
  const nearlyEqual = (left, right) => Math.abs(left - right) < 0.001;

  const centered = clampIconContextMenuPosition({
    anchorX: 320,
    anchorY: 240,
    menuHeight: 108,
    menuWidth: 144,
    viewportHeight: 825,
    viewportWidth: 1415,
  });
  assert(centered.x === 320 && centered.y === 240, "menus away from viewport edges should keep their pointer anchor");

  const bottomRight = clampIconContextMenuPosition({
    anchorX: 1414,
    anchorY: 824,
    menuHeight: 75.333,
    menuWidth: 172,
    viewportHeight: 825,
    viewportWidth: 1415,
  });
  assert(nearlyEqual(1415 - (bottomRight.x + 172), ICON_CONTEXT_MENU_VIEWPORT_MARGIN), "right edge should keep the shared viewport margin");
  assert(nearlyEqual(825 - (bottomRight.y + 75.333), ICON_CONTEXT_MENU_VIEWPORT_MARGIN), "bottom edge should keep the shared viewport margin");

  const topLeft = clampIconContextMenuPosition({
    anchorX: -20,
    anchorY: -10,
    menuHeight: 108,
    menuWidth: 144,
    viewportHeight: 825,
    viewportWidth: 1415,
  });
  assert(topLeft.x === ICON_CONTEXT_MENU_VIEWPORT_MARGIN && topLeft.y === ICON_CONTEXT_MENU_VIEWPORT_MARGIN, "top and left edges should use the same viewport margin");
}
