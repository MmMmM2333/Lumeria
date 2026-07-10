const CLOSING_PREVIEW_BASE_RATIO = 7;
const CLOSING_PREVIEW_RATIO_RANGE = 5;
const CLOSING_PREVIEW_COMPACT_ICON_DURATION = 0.22;
const CLOSING_PREVIEW_TALL_ICON_DURATION = 0.26;
const CLOSING_PREVIEW_COMPACT_PROGRESS = 0.76;
const CLOSING_PREVIEW_TALL_PROGRESS = 0.68;
const CLOSING_PREVIEW_COMPACT_SWAP_DURATION = 0.18;
const CLOSING_PREVIEW_TALL_SWAP_DURATION = 0.22;
export const FOLDER_PAGE_DOTS_HIT_HEIGHT = 28;
export const FOLDER_PAGE_DOTS_SIZE = 10;
export const FOLDER_PAGE_DOTS_GAP = 12;
export const FOLDER_PAGE_DOT_ACTIVE_ALPHA = 0.96;
export const FOLDER_PAGE_DOT_ACTIVE_SCALE = 1.02;
export const FOLDER_PAGE_DOT_HOVER_ALPHA = 0.5;
export const FOLDER_PAGE_DOT_IDLE_ALPHA = 0.28;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

export function getFolderPageMaskRect(geometry, localGridLeft, localGridTop, options = {}) {
  const topOverflow = Math.max(0, Number(options.topOverflow) || 0);
  const top = Math.max(0, localGridTop - topOverflow);
  return {
    left: 0,
    top,
    width: geometry.panel.width,
    height: Math.max(
      geometry.grid.height + localGridTop - top,
      geometry.panel.height - top - 20
    ),
  };
}

export function getFolderPageDotsFrame(geometry) {
  const panel = geometry?.panel;
  if (!panel) return null;
  const grid = geometry?.grid;
  const bottomPaddingTop = grid ? grid.top + grid.height : panel.top + panel.height - 54;
  const bottomPaddingHeight = Math.max(0, panel.top + panel.height - bottomPaddingTop);
  return {
    height: FOLDER_PAGE_DOTS_HIT_HEIGHT,
    left: panel.left,
    top: bottomPaddingTop + bottomPaddingHeight / 2 - FOLDER_PAGE_DOTS_HIT_HEIGHT / 2,
    width: panel.width,
  };
}

export function getFolderPageDotVisualState(options = {}) {
  const active = options.active === true;
  return {
    alpha: active
      ? FOLDER_PAGE_DOT_ACTIVE_ALPHA
      : options.hovered === true
        ? FOLDER_PAGE_DOT_HOVER_ALPHA
        : FOLDER_PAGE_DOT_IDLE_ALPHA,
    scale: active ? FOLDER_PAGE_DOT_ACTIVE_SCALE : 1,
  };
}

export function makePanelVisualRect(panel, panelRect, options = {}) {
  if (!panelRect || !panel) return null;
  const scaleX = Number(panel.scale?.x) || 1;
  const scaleY = Number(panel.scale?.y) || 1;
  const pivotX = Number(panel.pivot?.x) || panelRect.width / 2;
  const pivotY = Number(panel.pivot?.y) || panelRect.height / 2;
  const radius = Number(options.radius ?? 48);
  return {
    height: panelRect.height * Math.abs(scaleY),
    left: panel.x - pivotX * scaleX,
    progress: options.progress ?? 1,
    radius: radius * Math.min(Math.abs(scaleX), Math.abs(scaleY)),
    top: panel.y - pivotY * scaleY,
    width: panelRect.width * Math.abs(scaleX),
  };
}

export function getClosingPreviewTiming(frameRect, targetRect) {
  const frameHeight = Math.max(1, Number(frameRect?.height) || 1);
  const targetHeight = Math.max(1, Number(targetRect?.height) || 1);
  const ratio = frameHeight / targetHeight;
  const factor = clamp01((ratio - CLOSING_PREVIEW_BASE_RATIO) / CLOSING_PREVIEW_RATIO_RANGE);
  return {
    factor,
    iconDuration: lerp(CLOSING_PREVIEW_COMPACT_ICON_DURATION, CLOSING_PREVIEW_TALL_ICON_DURATION, factor),
    progress: lerp(CLOSING_PREVIEW_COMPACT_PROGRESS, CLOSING_PREVIEW_TALL_PROGRESS, factor),
    swapDuration: lerp(CLOSING_PREVIEW_COMPACT_SWAP_DURATION, CLOSING_PREVIEW_TALL_SWAP_DURATION, factor),
  };
}
