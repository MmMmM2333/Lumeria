export const ICON_CONTEXT_MENU_VIEWPORT_MARGIN = 8;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampIconContextMenuPosition(options = {}) {
  const margin = Math.max(0, finiteNumber(options.margin, ICON_CONTEXT_MENU_VIEWPORT_MARGIN));
  const menuWidth = Math.max(0, finiteNumber(options.menuWidth));
  const menuHeight = Math.max(0, finiteNumber(options.menuHeight));
  const viewportWidth = Math.max(0, finiteNumber(options.viewportWidth));
  const viewportHeight = Math.max(0, finiteNumber(options.viewportHeight));
  const maxX = Math.max(margin, viewportWidth - menuWidth - margin);
  const maxY = Math.max(margin, viewportHeight - menuHeight - margin);
  return {
    x: Math.min(Math.max(finiteNumber(options.anchorX), margin), maxX),
    y: Math.min(Math.max(finiteNumber(options.anchorY), margin), maxY),
  };
}
