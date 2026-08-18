export const RENDER_INVALIDATION_LANES = Object.freeze({
  STRUCTURE: "structure",
  GEOMETRY: "geometry",
  MOTION: "motion",
  INTERACTION: "interaction",
  ASSET: "asset",
  DIAGNOSTICS: "diagnostics",
});

const LAYER_UPDATE_LANES = new Set([
  RENDER_INVALIDATION_LANES.STRUCTURE,
  RENDER_INVALIDATION_LANES.GEOMETRY,
  RENDER_INVALIDATION_LANES.INTERACTION,
  RENDER_INVALIDATION_LANES.ASSET,
  RENDER_INVALIDATION_LANES.DIAGNOSTICS,
]);

const MOTION_REASON_RE = /^(?:motion(?:-|$)|animation(?:-|$))/;
const INTERACTION_REASON_RE = /^(?:interaction(?:-|$)|icon-(?:pointerdown|remove|choose-icon|reset-icon)|folder-(?:internal-|outside-pointerdown|panel-pointerdown|closing-pointerdown)|group-|drag-)/;
const ASSET_REASON_RE = /^(?:icon-texture-ready|asset(?:-|$)|texture(?:-|$))/;
const DIAGNOSTIC_REASON_RE = /^(?:diagnostic(?:-|$)|debug(?:-|$)|render-probe(?:-|$))/;
const GEOMETRY_REASON_RE = /^(?:resize|window-state-resize|desktop-projection|page-grid-measure|geometry(?:-|$)|folder-geometry(?:-|$))/;

function normalizeReason(reason) {
  return String(reason || "desktop-update").trim() || "desktop-update";
}

export function classifyRenderInvalidation(reason, options = {}) {
  if (options.invalidateGeometry === true) return RENDER_INVALIDATION_LANES.GEOMETRY;
  const normalized = normalizeReason(reason);
  if (MOTION_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.MOTION;
  if (INTERACTION_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.INTERACTION;
  if (ASSET_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.ASSET;
  if (DIAGNOSTIC_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.DIAGNOSTICS;
  if (GEOMETRY_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.GEOMETRY;
  return RENDER_INVALIDATION_LANES.STRUCTURE;
}

function createEmptySnapshot() {
  return {
    lanes: [],
    reasons: Object.create(null),
    requiresLayerUpdate: false,
  };
}

export function createRenderInvalidationLedger() {
  const reasonsByLane = new Map();

  function mark(reason = "desktop-update", options = {}) {
    const normalized = normalizeReason(reason);
    const lane = classifyRenderInvalidation(normalized, options);
    let reasons = reasonsByLane.get(lane);
    const wasEmpty = !reasons;
    if (!reasons) {
      reasons = new Set();
      reasonsByLane.set(lane, reasons);
    }
    reasons.add(normalized);
    return { lane, reason: normalized, wasEmpty };
  }

  function hasPending() {
    return reasonsByLane.size > 0;
  }

  function snapshot() {
    const result = createEmptySnapshot();
    for (const [lane, reasons] of reasonsByLane) {
      result.lanes.push(lane);
      result.reasons[lane] = [...reasons];
    }
    result.requiresLayerUpdate = result.lanes.some((lane) => LAYER_UPDATE_LANES.has(lane));
    return result;
  }

  function consume() {
    const result = snapshot();
    reasonsByLane.clear();
    return result;
  }

  function clear() {
    reasonsByLane.clear();
  }

  return Object.freeze({
    clear,
    consume,
    hasPending,
    mark,
    snapshot,
  });
}
