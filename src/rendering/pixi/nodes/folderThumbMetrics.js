export function getFolderThumbMetrics(size) {
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
