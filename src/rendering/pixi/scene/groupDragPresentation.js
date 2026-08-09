function safePoint(point) {
  return {
    time: Number(point?.time) || 0,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
  };
}

export function appendGroupTrailPoint(points, point, options = {}) {
  const maxPoints = Math.max(2, Math.floor(Number(options.maxPoints) || 14));
  const minDistance = Math.max(0, Number(options.minDistance) || 5);
  const next = [...(points || [])];
  const last = next[next.length - 1];
  const nextPoint = {
    ...safePoint(point),
    time: Math.max(
      Number(last?.time) || 0,
      Number(options.timeMs ?? point?.time) || ((Number(last?.time) || 0) + (last ? 16 : 0))
    ),
  };
  if (last && Math.hypot(nextPoint.x - last.x, nextPoint.y - last.y) < minDistance) return next;
  next.push(nextPoint);
  return next.slice(-maxPoints);
}

export function sampleGroupTrailPoint(points, delayMs = 0) {
  const trail = (points || []).map(safePoint);
  if (!trail.length) return null;
  if (trail.length === 1) return trail[0];
  const targetTime = trail[trail.length - 1].time - Math.max(0, Number(delayMs) || 0);
  if (targetTime <= trail[0].time) return trail[0];
  for (let index = 1; index < trail.length; index += 1) {
    const right = trail[index];
    if (right.time < targetTime) continue;
    const left = trail[index - 1];
    const span = Math.max(1, right.time - left.time);
    const progress = Math.max(0, Math.min(1, (targetTime - left.time) / span));
    return {
      time: targetTime,
      x: left.x + (right.x - left.x) * progress,
      y: left.y + (right.y - left.y) * progress,
    };
  }
  return trail[trail.length - 1];
}

export function makeGroupStackTarget(center, visualIndex, visualCount) {
  const point = safePoint(center);
  const index = Math.max(0, Math.floor(Number(visualIndex) || 0));
  const count = Math.max(1, Math.floor(Number(visualCount) || 1));
  if (index === 0) return point;
  const depth = Math.min(index, 7);
  const fan = Math.min(1, Math.max(0, (count - 2) / 8));
  const direction = index % 2 === 0 ? 1 : -1;
  return {
    x: point.x - depth * (3.2 + fan * 1.6) + direction * Math.min(4, index) * fan,
    y: point.y + depth * (3.8 + fan * 1.4),
  };
}

export function makeGroupFollowerTarget(center, trail, visualIndex, visualCount, options = {}) {
  const point = safePoint(center);
  const index = Math.max(0, Math.floor(Number(visualIndex) || 0));
  if (index === 0 || options.reducedMotion) return makeGroupStackTarget(point, index, visualCount);
  const delayStepMs = Math.max(1, Number(options.delayStepMs) || 26);
  const sampled = sampleGroupTrailPoint(trail, Math.min(index, 5) * delayStepMs);
  if (!sampled) return makeGroupStackTarget(point, index, visualCount);
  const stackOffset = makeGroupStackTarget({ x: 0, y: 0 }, index, visualCount);
  const desired = {
    x: sampled.x + stackOffset.x * 0.45,
    y: sampled.y + stackOffset.y * 0.45,
  };
  const maxDistance = Math.max(12, Number(options.maxDistance) || 78);
  const dx = desired.x - point.x;
  const dy = desired.y - point.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= maxDistance || distance === 0) return desired;
  const scale = maxDistance / distance;
  return {
    x: point.x + dx * scale,
    y: point.y + dy * scale,
  };
}

export function makeGroupReleaseDelayMs(order, total, options = {}) {
  if (options.reducedMotion) return 0;
  const safeOrder = Math.max(0, Math.floor(Number(order) || 0));
  const safeTotal = Math.max(1, Math.floor(Number(total) || 1));
  const interval = safeTotal > 18 ? 12 : safeTotal > 10 ? 18 : 26;
  return Math.min(260, safeOrder * interval);
}
