import {
  DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS,
  normalizeDesktopLayoutDebugParams,
  resolveDesktopDragHitDebugOptions,
  resolveDesktopGridDebugOptions,
  resolveDesktopLayoutDebugStyle,
} from "./desktopLayoutDebugSettings.js";

export function runDesktopLayoutDebugSettingsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Desktop layout debug settings test failed] ${message}`);
  };

  const defaults = normalizeDesktopLayoutDebugParams();
  assert(defaults.enabled === DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS.enabled, "defaults should keep the override disabled");
  assert(defaults.dragHitZonesEnabled === false, "defaults should keep drag hit zones hidden");
  assert(defaults.hostMaxHeightPx === 960, "default host max height should use the taller desktop grid cap");
  assert(resolveDesktopLayoutDebugStyle(defaults)["--debug-desktop-host-max-height"] === undefined, "disabled params should not emit CSS variables");
  assert(resolveDesktopGridDebugOptions(defaults) === null, "disabled params should not emit Pixi grid options");
  assert(resolveDesktopDragHitDebugOptions(defaults) === null, "disabled params should not emit drag hit debug options");

  const normalized = normalizeDesktopLayoutDebugParams({
    dragHitZonesEnabled: true,
    enabled: true,
    gridPaddingTopPx: 999,
    hostHeightOffsetPx: -999,
    hostMaxHeightPx: 9999,
    mainPaddingYPx: "12",
  });
  assert(normalized.enabled === true, "explicit true should enable the layout override");
  assert(normalized.dragHitZonesEnabled === true, "explicit true should enable drag hit zone debug");
  assert(normalized.gridPaddingTopPx === 80, "grid top padding should clamp to its max");
  assert(normalized.hostHeightOffsetPx === -160, "host height offset should clamp to its min");
  assert(normalized.hostMaxHeightPx === 2200, "host max height should clamp to its max");
  assert(normalized.mainPaddingYPx === 12, "numeric strings should normalize");

  const style = resolveDesktopLayoutDebugStyle(normalized);
  assert(style["--debug-desktop-host-height-offset"] === "-160px", "style should include the host height offset");
  assert(style["--debug-desktop-host-max-height"] === "2200px", "style should include the host max height");
  assert(style["--debug-desktop-main-padding-y"] === "12px", "style should include the main vertical padding");

  const gridOptions = resolveDesktopGridDebugOptions(normalized);
  assert(gridOptions.paddingTop === 80, "grid options should include the normalized top padding");
  assert(resolveDesktopDragHitDebugOptions(normalized).enabled === true, "drag hit debug options should include the enabled flag");
}
