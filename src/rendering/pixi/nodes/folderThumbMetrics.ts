export interface FolderThumbMetrics {
  childSize: number;
  fillAlpha: number;
  fillColor: number;
  gap: number;
  radius: number;
  start: number;
  strokeAlpha: number;
  strokeColor: number;
  strokeWidth: number;
}

export interface FolderThumbChildLocalRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export function getFolderThumbMetrics(size: number): FolderThumbMetrics {
  const safeSize = Math.max(1, Number(size) || 1);
  const childSize = Math.max(8, safeSize * 0.25);
  const gap = Math.max(2, safeSize * 0.045);
  return {
    childSize,
    fillAlpha: 0.22,
    fillColor: 0xffffff,
    gap,
    radius: Math.max(14, safeSize * 0.26),
    start: -((childSize * 3 + gap * 2) / 2) + childSize / 2,
    strokeAlpha: 0.26,
    strokeColor: 0xffffff,
    strokeWidth: 1,
  };
}

export function getFolderThumbChildLocalRect(
  metricsOrSize: FolderThumbMetrics | number,
  slotIndex: number
): FolderThumbChildLocalRect {
  const thumb = typeof metricsOrSize === "object" && metricsOrSize
    ? metricsOrSize
    : getFolderThumbMetrics(metricsOrSize);
  const safeIndex = Math.max(0, Number(slotIndex) || 0);
  const col = safeIndex % 3;
  const row = Math.floor(safeIndex / 3);
  const centerX = thumb.start + col * (thumb.childSize + thumb.gap);
  const centerY = thumb.start + row * (thumb.childSize + thumb.gap);
  return {
    height: thumb.childSize,
    left: centerX - thumb.childSize / 2,
    top: centerY - thumb.childSize / 2,
    width: thumb.childSize,
  };
}
