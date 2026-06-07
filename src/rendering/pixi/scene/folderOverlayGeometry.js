const CLOSING_PREVIEW_BASE_RATIO = 7;
const CLOSING_PREVIEW_RATIO_RANGE = 5;
const CLOSING_PREVIEW_COMPACT_ICON_DURATION = 0.22;
const CLOSING_PREVIEW_TALL_ICON_DURATION = 0.26;
const CLOSING_PREVIEW_COMPACT_PROGRESS = 0.76;
const CLOSING_PREVIEW_TALL_PROGRESS = 0.68;
const CLOSING_PREVIEW_COMPACT_SWAP_DURATION = 0.18;
const CLOSING_PREVIEW_TALL_SWAP_DURATION = 0.22;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

export function getFolderPageMaskRect(geometry, localGridLeft, localGridTop) {
  return {
    left: localGridLeft,
    top: localGridTop,
    width: geometry.grid.width,
    height: Math.max(geometry.grid.height, geometry.panel.height - localGridTop - 20),
  };
}

export function resolveOpeningInterruptionFrame(frameRect, panelRect, contentFrameRect) {
  return frameRect || panelRect || contentFrameRect;
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
