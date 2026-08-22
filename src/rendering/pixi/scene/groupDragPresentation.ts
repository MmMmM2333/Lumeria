import type { PointData } from "pixi.js";

export interface GroupTrailPoint extends PointData {
  time: number;
}

type GroupPointInput = Partial<GroupTrailPoint> | null | undefined;

interface GroupTrailOptions {
  delayStepMs?: number;
  maxDistance?: number;
  maxPoints?: number;
  minDistance?: number;
  reducedMotion?: boolean;
  timeMs?: number | undefined;
}

function safePoint(point: GroupPointInput): GroupTrailPoint {
  return {
    time: Number(point?.time) || 0,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
  };
}

export const GROUP_FOLLOWER_DELAY_STEP_MS = 26;
export const GROUP_FOLLOWER_DELAY_CAP = 5;

export function appendGroupTrailPoint(
  points: readonly GroupTrailPoint[] | null | undefined,
  point: GroupPointInput,
  options: GroupTrailOptions = {}
): GroupTrailPoint[] {
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
  if (last && Math.hypot(nextPoint.x - last.x, nextPoint.y - last.y) < minDistance) {
    // Keep the trail bounded without losing its authoritative endpoint. The
    // follower clock must eventually converge on the latest pointer position
    // even when the final movement is smaller than the sampling threshold.
    next[next.length - 1] = nextPoint;
    return next;
  }
  next.push(nextPoint);
  return next.slice(-maxPoints);
}

export function getGroupFollowerDelayMs(visualIndex: number, options: GroupTrailOptions = {}): number {
  const index = Math.max(0, Math.floor(Number(visualIndex) || 0));
  const delayStepMs = Math.max(
    1,
    Number(options.delayStepMs) || GROUP_FOLLOWER_DELAY_STEP_MS
  );
  return Math.min(index, GROUP_FOLLOWER_DELAY_CAP) * delayStepMs;
}

export function getGroupTrailSettleDurationMs(visualCount: number, options: GroupTrailOptions = {}): number {
  const count = Math.max(1, Math.floor(Number(visualCount) || 1));
  return getGroupFollowerDelayMs(Math.max(0, count - 1), options);
}

export function sampleGroupTrailPoint(
  points: readonly GroupTrailPoint[] | null | undefined,
  delayMs = 0,
  options: GroupTrailOptions = {}
): GroupTrailPoint | null {
  const trail = (points || []).map(safePoint);
  if (!trail.length) return null;
  if (trail.length === 1) return trail[0]!;
  const latestTime = trail[trail.length - 1]!.time;
  const requestedTime = Number(options.timeMs);
  const presentationTime = Number.isFinite(requestedTime)
    ? Math.max(latestTime, requestedTime)
    : latestTime;
  const targetTime = presentationTime - Math.max(0, Number(delayMs) || 0);
  if (targetTime <= trail[0]!.time) return trail[0]!;
  for (let index = 1; index < trail.length; index += 1) {
    const right = trail[index]!;
    if (right.time < targetTime) continue;
    const left = trail[index - 1]!;
    const span = Math.max(1, right.time - left.time);
    const progress = Math.max(0, Math.min(1, (targetTime - left.time) / span));
    return {
      time: targetTime,
      x: left.x + (right.x - left.x) * progress,
      y: left.y + (right.y - left.y) * progress,
    };
  }
  return trail[trail.length - 1]!;
}

export function makeGroupStackTarget(center: GroupPointInput, visualIndex: number, visualCount: number): PointData {
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

export function makeGroupFollowerTarget(
  center: GroupPointInput,
  trail: readonly GroupTrailPoint[] | null | undefined,
  visualIndex: number,
  visualCount: number,
  options: GroupTrailOptions = {}
): PointData {
  const point = safePoint(center);
  const index = Math.max(0, Math.floor(Number(visualIndex) || 0));
  if (index === 0 || options.reducedMotion) return makeGroupStackTarget(point, index, visualCount);
  const sampled = sampleGroupTrailPoint(
    trail,
    getGroupFollowerDelayMs(index, options),
    { timeMs: options.timeMs }
  );
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

export function makeGroupReleaseDelayMs(order: number, total: number, options: GroupTrailOptions = {}): number {
  if (options.reducedMotion) return 0;
  const safeOrder = Math.max(0, Math.floor(Number(order) || 0));
  const safeTotal = Math.max(1, Math.floor(Number(total) || 1));
  const interval = safeTotal > 18 ? 12 : safeTotal > 10 ? 18 : 26;
  return Math.min(260, safeOrder * interval);
}
