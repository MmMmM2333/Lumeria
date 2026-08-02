import { sceneDiagnosticsState } from "../../../diagnostics/sceneDiagnosticsState.js";

export function getFolderHandoffDebugOptions() {
  return sceneDiagnosticsState.folderHandoffOptions();
}

export function roundNumber(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

export function roundRect(rect, digits = 3) {
  if (!rect) return null;
  return {
    height: roundNumber(rect.height, digits),
    left: roundNumber(rect.left, digits),
    top: roundNumber(rect.top, digits),
    width: roundNumber(rect.width, digits),
  };
}

export function rectDelta(rect, target, digits = 3) {
  if (!rect || !target) return null;
  return {
    height: roundNumber((rect.height || 0) - (target.height || 0), digits),
    left: roundNumber((rect.left || 0) - (target.left || 0), digits),
    top: roundNumber((rect.top || 0) - (target.top || 0), digits),
    width: roundNumber((rect.width || 0) - (target.width || 0), digits),
  };
}
