import { reloadOnPixiHotUpdate } from "../devHmr.js";
import type { PointData } from "pixi.js";

export interface IconInteractionRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface IconCellTopInteractionOverflowOptions {
  cellHeight?: number;
  clearance?: number;
  iconSize?: number;
  visualOffsetY?: number;
}

interface IconHitAreaOptions {
  editing?: boolean;
  iconSize?: number;
  itemType?: string | null;
  visualOffsetY?: number;
}

export interface EditButtonGeometry extends PointData {
  visible: boolean;
}

interface EditButtonActionOptions {
  changeButton?: EditButtonGeometry | null;
  editing?: boolean;
  hasCustomIcon?: boolean;
  itemType?: string | null;
  removable?: boolean;
  removeButton?: EditButtonGeometry | null;
  resetButton?: EditButtonGeometry | null;
}

export type EditButtonAction = "choose-icon" | "remove" | "reset-icon";

export const ICON_INTERACTION_PADDING = 12;
export const ICON_INTERACTION_CLEARANCE = 12;
export const EDIT_BUTTON_HIT_PADDING = ICON_INTERACTION_PADDING;
export const EDIT_BUTTON_HIT_RADIUS = 12;
export const MIN_ICON_HIT_SIZE = 44;

export function getIconCellContentMaxWidth(cellWidth: number | null | undefined): number | null {
  const width = Number(cellWidth);
  if (!Number.isFinite(width) || width <= 0) return null;
  return Math.max(1, width - ICON_INTERACTION_PADDING * 2);
}

export function getIconCellTopInteractionOverflow(options: IconCellTopInteractionOverflowOptions = {}): number {
  const cellHeight = Math.max(1, Number(options.cellHeight) || 1);
  const iconSize = Math.max(1, Number(options.iconSize) || 1);
  const visualOffsetY = Number(options.visualOffsetY) || 0;
  const requestedClearance = Number(options.clearance);
  const clearance = Number.isFinite(requestedClearance)
    ? Math.max(0, requestedClearance)
    : ICON_INTERACTION_CLEARANCE;
  const hitTopFromCell = cellHeight / 2 + visualOffsetY - iconSize / 2 - ICON_INTERACTION_PADDING;
  return Math.max(0, clearance - hitTopFromCell);
}

export function getIconHitAreaRect(options: IconHitAreaOptions = {}): IconInteractionRect {
  const {
    editing = false,
    iconSize = 64,
    itemType = null,
    visualOffsetY = 0,
  } = options;
  const hitSize = Math.max(MIN_ICON_HIT_SIZE, iconSize);
  const editPadding = editing && itemType === "app" ? EDIT_BUTTON_HIT_PADDING : 0;
  return {
    height: hitSize + editPadding * 2,
    left: -hitSize / 2 - editPadding,
    top: visualOffsetY - hitSize / 2 - editPadding,
    width: hitSize + editPadding * 2,
  };
}

export function isPointInsideEditButton(
  point: PointData | null | undefined,
  button: EditButtonGeometry | null | undefined,
  radius = EDIT_BUTTON_HIT_RADIUS
): boolean {
  if (!point || !button?.visible) return false;
  const x = point.x - button.x;
  const y = point.y - button.y;
  return Math.hypot(x, y) <= radius;
}

export function getEditButtonActionAt(
  point: PointData | null | undefined,
  options: EditButtonActionOptions = {}
): EditButtonAction | null {
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
