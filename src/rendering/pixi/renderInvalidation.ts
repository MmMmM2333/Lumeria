export const RENDER_INVALIDATION_LANES = Object.freeze({
  STRUCTURE: "structure",
  GEOMETRY: "geometry",
  VISUAL: "visual",
  MOTION: "motion",
  INTERACTION: "interaction",
  HANDOFF: "handoff",
  ASSET: "asset",
  DIAGNOSTICS: "diagnostics",
} as const);

export type RenderInvalidationLane = typeof RENDER_INVALIDATION_LANES[keyof typeof RENDER_INVALIDATION_LANES];

export type RenderInvalidationOptions = Readonly<{
  invalidateGeometry?: boolean;
}>;

export type RenderInvalidationMark = Readonly<{
  lane: RenderInvalidationLane;
  reason: string;
  revision: number;
}>;

export type RenderInvalidationSnapshot = Readonly<{
  lanes: readonly RenderInvalidationLane[];
  reasons: Readonly<Partial<Record<RenderInvalidationLane, readonly string[]>>>;
  revision: number;
  revisions: Readonly<Partial<Record<RenderInvalidationLane, number>>>;
  requiresDiagnosticsUpdate: boolean;
  requiresHandoffUpdate: boolean;
  requiresInteractionUpdate: boolean;
  requiresStructureUpdate: boolean;
  requiresVisualUpdate: boolean;
}>;

export type RenderInvalidationLedger = Readonly<{
  clear: () => void;
  consume: () => RenderInvalidationSnapshot;
  hasPending: () => boolean;
  mark: (reason?: string, options?: RenderInvalidationOptions) => RenderInvalidationMark;
  snapshot: () => RenderInvalidationSnapshot;
}>;

type MutableRenderInvalidationSnapshot = {
  lanes: RenderInvalidationLane[];
  reasons: Partial<Record<RenderInvalidationLane, string[]>>;
  revision: number;
  revisions: Partial<Record<RenderInvalidationLane, number>>;
  requiresDiagnosticsUpdate: boolean;
  requiresHandoffUpdate: boolean;
  requiresInteractionUpdate: boolean;
  requiresStructureUpdate: boolean;
  requiresVisualUpdate: boolean;
};

const MOTION_REASON_RE = /^(?:motion(?:-|$)|animation(?:-|$))/;
const INTERACTION_REASON_RE = /^(?:interaction(?:-|$)|visual-ownership(?:-|$)|desktop-source-ownership(?:-|$)|icon-(?:pointerdown|remove|choose-icon|reset-icon)|folder-(?:internal-|outside-pointerdown|panel-pointerdown|closing-pointerdown)|group-|drag-)/;
const VISUAL_REASON_RE = /^(?:visual-watch$|desktop-visual(?:-|$)|launchpad-visual(?:-|$))/;
const HANDOFF_REASON_RE = /^(?:folder-handoff-loop|handoff(?:-|$))/;
const ASSET_REASON_RE = /^(?:icon-texture-ready|asset(?:-|$)|texture(?:-|$))/;
const DIAGNOSTIC_REASON_RE = /^(?:diagnostic(?:-|$)|debug(?:-|$)|render-probe(?:-|$))/;
const GEOMETRY_REASON_RE = /^(?:resize|window-state-resize|desktop-projection|page-grid-measure|geometry(?:-|$)|folder-geometry(?:-|$))/;

function normalizeReason(reason: unknown): string {
  return String(reason || "desktop-update").trim() || "desktop-update";
}

export function classifyRenderInvalidation(
  reason: string,
  options: RenderInvalidationOptions = {},
): RenderInvalidationLane {
  if (options.invalidateGeometry === true) return RENDER_INVALIDATION_LANES.GEOMETRY;
  const normalized = normalizeReason(reason);
  if (MOTION_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.MOTION;
  if (VISUAL_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.VISUAL;
  if (HANDOFF_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.HANDOFF;
  if (INTERACTION_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.INTERACTION;
  if (ASSET_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.ASSET;
  if (DIAGNOSTIC_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.DIAGNOSTICS;
  if (GEOMETRY_REASON_RE.test(normalized)) return RENDER_INVALIDATION_LANES.GEOMETRY;
  return RENDER_INVALIDATION_LANES.STRUCTURE;
}

export function collectRenderInvalidationReasons(
  snapshot: RenderInvalidationSnapshot,
): readonly string[] {
  const reasons: string[] = [];
  for (const lane of snapshot.lanes) reasons.push(...(snapshot.reasons[lane] ?? []));
  return reasons;
}

function createEmptySnapshot(): MutableRenderInvalidationSnapshot {
  return {
    lanes: [],
    reasons: Object.create(null),
    revision: 0,
    revisions: Object.create(null),
    requiresDiagnosticsUpdate: false,
    requiresHandoffUpdate: false,
    requiresInteractionUpdate: false,
    requiresStructureUpdate: false,
    requiresVisualUpdate: false,
  };
}

export function createRenderInvalidationLedger(): RenderInvalidationLedger {
  const reasonsByLane = new Map<RenderInvalidationLane, Set<string>>();
  const revisionsByLane = new Map<RenderInvalidationLane, number>();
  let revision = 0;

  function mark(
    reason = "desktop-update",
    options: RenderInvalidationOptions = {},
  ): RenderInvalidationMark {
    const normalized = normalizeReason(reason);
    const lane = classifyRenderInvalidation(normalized, options);
    let reasons = reasonsByLane.get(lane);
    if (!reasons) {
      reasons = new Set();
      reasonsByLane.set(lane, reasons);
    }
    reasons.add(normalized);
    revision += 1;
    revisionsByLane.set(lane, revision);
    return { lane, reason: normalized, revision };
  }

  function hasPending(): boolean {
    return reasonsByLane.size > 0;
  }

  function snapshot(): RenderInvalidationSnapshot {
    const result = createEmptySnapshot();
    for (const [lane, reasons] of reasonsByLane) {
      result.lanes.push(lane);
      result.reasons[lane] = [...reasons];
      result.revisions[lane] = revisionsByLane.get(lane) || 0;
    }
    result.revision = revision;
    result.requiresStructureUpdate = result.lanes.some((lane) => (
      lane === RENDER_INVALIDATION_LANES.STRUCTURE || lane === RENDER_INVALIDATION_LANES.GEOMETRY
    ));
    result.requiresInteractionUpdate = result.lanes.includes(RENDER_INVALIDATION_LANES.INTERACTION);
    result.requiresVisualUpdate = result.lanes.includes(RENDER_INVALIDATION_LANES.VISUAL);
    result.requiresHandoffUpdate = result.lanes.includes(RENDER_INVALIDATION_LANES.HANDOFF);
    result.requiresDiagnosticsUpdate = result.lanes.includes(RENDER_INVALIDATION_LANES.DIAGNOSTICS);
    return result;
  }

  function consume(): RenderInvalidationSnapshot {
    const result = snapshot();
    reasonsByLane.clear();
    return result;
  }

  function clear(): void {
    reasonsByLane.clear();
    revisionsByLane.clear();
  }

  return Object.freeze({
    clear,
    consume,
    hasPending,
    mark,
    snapshot,
  });
}
