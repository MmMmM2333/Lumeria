import {
  DESKTOP_TEXTLESS_LABEL_RESERVE,
  DESKTOP_WRAPPED_LABEL_RESERVE,
  getDesktopIconSizing,
} from "./desktopIconSizing.js";

export function runDesktopIconSizingTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi desktop icon sizing test failed] ${message}`);
  };

  const constrained = getDesktopIconSizing(
    { iconSize: 128, isTextlessMode: false, width: 1920 },
    { height: 120 }
  );
  assert(constrained.labelReserve === DESKTOP_WRAPPED_LABEL_RESERVE, "wrapped labels should reserve enough room for two lines");
  assert(constrained.iconSize === 78, "large icons should shrink against the wrapped label reserve");
  assert(constrained.compact, "height-constrained icons should use compact label text");

  const textless = getDesktopIconSizing(
    { iconSize: 128, isTextlessMode: true, width: 1920 },
    { height: 120 }
  );
  assert(textless.labelReserve === DESKTOP_TEXTLESS_LABEL_RESERVE, "textless mode should keep the smaller vertical reserve");
  assert(textless.iconSize === 106, "textless mode should allow more of the cell height to be used by the icon");

  const spacious = getDesktopIconSizing(
    { iconSize: 128, isTextlessMode: false, width: 1920 },
    { height: 200 }
  );
  assert(spacious.iconSize === 128, "spacious cells should keep the configured icon size");
  assert(!spacious.compact, "spacious desktop cells should keep the regular label size");
}
