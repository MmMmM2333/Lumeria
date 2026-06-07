import { reloadOnPixiHotUpdate } from "../devHmr.js";

export const EDIT_BUTTON_HIT_PADDING = 12;
export const EDIT_BUTTON_HIT_RADIUS = 12;

export function getIconHitAreaRect(options = {}) {
  const {
    editing = false,
    iconSize = 64,
    itemType = null,
    visualOffsetY = 0,
  } = options;
  const editPadding = editing && itemType === "app" ? EDIT_BUTTON_HIT_PADDING : 0;
  return {
    height: iconSize + editPadding * 2,
    left: -iconSize / 2 - editPadding,
    top: visualOffsetY - iconSize / 2 - editPadding,
    width: iconSize + editPadding * 2,
  };
}

export function isPointInsideEditButton(point, button, radius = EDIT_BUTTON_HIT_RADIUS) {
  if (!point || !button?.visible) return false;
  const x = point.x - button.x;
  const y = point.y - button.y;
  return Math.hypot(x, y) <= radius;
}

export function getEditButtonActionAt(point, options = {}) {
  const {
    changeButton = null,
    editing = false,
    hasCustomIcon = false,
    itemType = null,
    removable = false,
    removeButton = null,
    resetButton = null,
  } = options;
  if (!editing || itemType !== "app") return null;
  if (isPointInsideEditButton(point, removeButton) && removable) return "remove";
  if (isPointInsideEditButton(point, changeButton)) return "choose-icon";
  if (isPointInsideEditButton(point, resetButton) && hasCustomIcon) return "reset-icon";
  return null;
}

reloadOnPixiHotUpdate(import.meta.hot);
