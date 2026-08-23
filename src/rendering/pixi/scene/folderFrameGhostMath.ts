import { reloadOnPixiHotUpdate } from "../devHmr.js";
import type { StageRect } from "../geometry/stageCoordinates.js";

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

export function lerpColor(from: unknown, to: unknown, progress: unknown): number {
  const t = clamp01(progress);
  const fromColor = Math.max(0, Math.min(0xffffff, Math.round(Number(from) || 0)));
  const toColor = Math.max(0, Math.min(0xffffff, Math.round(Number(to) || 0)));
  const fromR = (fromColor >> 16) & 0xff;
  const fromG = (fromColor >> 8) & 0xff;
  const fromB = fromColor & 0xff;
  const toR = (toColor >> 16) & 0xff;
  const toG = (toColor >> 8) & 0xff;
  const toB = toColor & 0xff;
  return (
    (Math.round(lerp(fromR, toR, t)) << 16) |
    (Math.round(lerp(fromG, toG, t)) << 8) |
    Math.round(lerp(fromB, toB, t))
  );
}

export function getFrameRadius(
  rect: Pick<StageRect, "height" | "width"> | null | undefined,
  fallback = 18,
): number {
  if (!rect) return fallback;
  return Math.max(14, Math.min(48, Math.min(rect.width, rect.height) * 0.26));
}

reloadOnPixiHotUpdate(import.meta.hot);
