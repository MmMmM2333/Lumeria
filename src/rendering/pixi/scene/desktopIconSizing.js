import { reloadOnPixiHotUpdate } from "../devHmr.js";

export const DESKTOP_TEXTLESS_LABEL_RESERVE = 14;
export const DESKTOP_WRAPPED_LABEL_RESERVE = 42;

export function getDesktopIconSizing(state, slot) {
  const configuredSize = Math.max(1, Number(state.iconSize) || 64);
  const labelReserve = state.isTextlessMode ? DESKTOP_TEXTLESS_LABEL_RESERVE : DESKTOP_WRAPPED_LABEL_RESERVE;
  const maxByHeight = Math.max(36, slot.height - labelReserve);
  const iconSize = Math.max(36, Math.min(configuredSize, maxByHeight));
  const compact = iconSize < configuredSize || state.width <= 960 || slot.height < configuredSize + labelReserve + 18;
  return {
    compact,
    iconSize,
    labelReserve,
    singleLineLabel: false,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
