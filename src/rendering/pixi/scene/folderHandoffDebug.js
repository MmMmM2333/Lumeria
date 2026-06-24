import { readLaunchpadDebugValue } from "../debugNamespace.js";

export function getFolderHandoffDebugOptions() {
  const value = readLaunchpadDebugValue("folderHandoff");
  if (!value) return null;
  if (value === true) return { lineWidth: 3, log: true, overlay: true, timeline: false };
  if (typeof value === "object") {
    return {
      lineWidth: Math.max(1, Number(value.lineWidth) || 3),
      log: value.log !== false,
      overlay: value.overlay !== false,
      timeline: value.timeline === true,
    };
  }
  return null;
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
