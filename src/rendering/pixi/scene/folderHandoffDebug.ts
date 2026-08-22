import { sceneDiagnosticsState } from "../../../diagnostics/sceneDiagnosticsState.js";
import type { StageRect } from "../geometry/stageCoordinates.js";

export interface FolderHandoffDebugOptions {
  lineWidth: number;
  log: boolean;
  overlay: boolean;
  timeline: boolean;
}

export type RoundedDebugRect = Readonly<Record<keyof StageRect, number | null>>;

export function getFolderHandoffDebugOptions(): FolderHandoffDebugOptions | null {
  return sceneDiagnosticsState.folderHandoffOptions() as FolderHandoffDebugOptions | null;
}

export function roundNumber(value: unknown, digits = 3): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

export function roundRect(
  rect: Partial<StageRect> | null | undefined,
  digits = 3,
): RoundedDebugRect | null {
  if (!rect) return null;
  return {
    height: roundNumber(rect.height, digits),
    left: roundNumber(rect.left, digits),
    top: roundNumber(rect.top, digits),
    width: roundNumber(rect.width, digits),
  };
}

export function rectDelta(
  rect: Partial<StageRect> | null | undefined,
  target: Partial<StageRect> | null | undefined,
  digits = 3,
): RoundedDebugRect | null {
  if (!rect || !target) return null;
  return {
    height: roundNumber((rect.height || 0) - (target.height || 0), digits),
    left: roundNumber((rect.left || 0) - (target.left || 0), digits),
    top: roundNumber((rect.top || 0) - (target.top || 0), digits),
    width: roundNumber((rect.width || 0) - (target.width || 0), digits),
  };
}
