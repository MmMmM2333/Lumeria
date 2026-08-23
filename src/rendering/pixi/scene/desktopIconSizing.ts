import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getIconCellContentMaxWidth } from "../nodes/iconInteractionGeometry.js";

export const DESKTOP_TEXTLESS_LABEL_RESERVE = 14;
export const DESKTOP_WRAPPED_LABEL_RESERVE = 42;

interface DesktopIconSizingState {
  iconSize: number;
  isTextlessMode: boolean;
  width: number;
}

interface DesktopIconSlot {
  height: number;
  width?: number | null;
}

export function getDesktopIconSizing(state: DesktopIconSizingState, slot: DesktopIconSlot) {
  const configuredSize = Math.max(1, Number(state.iconSize) || 64);
  const labelReserve = state.isTextlessMode ? DESKTOP_TEXTLESS_LABEL_RESERVE : DESKTOP_WRAPPED_LABEL_RESERVE;
  const maxByHeight = Math.max(36, slot.height - labelReserve);
  const maxByWidth = getIconCellContentMaxWidth(slot.width) ?? configuredSize;
  const iconSize = Math.max(1, Math.min(configuredSize, maxByHeight, maxByWidth));
  const compact = iconSize < configuredSize || state.width <= 960 || slot.height < configuredSize + labelReserve + 18;
  return {
    compact,
    iconSize,
    labelReserve,
    singleLineLabel: false,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
