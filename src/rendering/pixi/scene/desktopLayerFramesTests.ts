import {
  applyDesktopLayerFrameUpdates,
  getDesktopLayerFrameFields,
  makeDesktopLayerFrameUpdates,
} from "./desktopLayerFrames.js";

type TestDesktopLayerLane = "structure" | "interaction" | "visual" | "diagnostics" | "handoff";

type OpaqueDesktopLayerFrame = Readonly<Record<string, null>>;

type OpaqueDesktopLayerFrameUpdate = Readonly<{
  frame: OpaqueDesktopLayerFrame;
  lane: TestDesktopLayerLane;
}>;

type OpaqueDesktopLayerFrameBuilders = Readonly<Record<
  TestDesktopLayerLane,
  () => OpaqueDesktopLayerFrame
>>;

type TestRenderInvalidation = Readonly<{
  requiresDiagnosticsUpdate: boolean;
  requiresHandoffUpdate: boolean;
  requiresInteractionUpdate: boolean;
  requiresStructureUpdate: boolean;
  requiresVisualUpdate: boolean;
}>;

type TestDesktopLayerPort = Readonly<{
  tickFolderHandoff: () => Readonly<{ handoffReconciliations: number }>;
  updateDiagnostics: () => void;
  updateInteraction: () => void;
  updateStructure: () => Readonly<{ fullPlanBuilds: number; reconciledNodes: number }>;
  updateVisual: () => void;
}>;

type TestDesktopLayerFrameWork = Readonly<{
  diagnosticsFrames: number;
  fullPlanBuilds: number;
  handoffFrames: number;
  handoffReconciliations: number;
  interactionFrames: number;
  reconciledNodes: number;
  structureFrames: number;
  visualFrames: number;
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isTestDesktopLayerLane(value: unknown): value is TestDesktopLayerLane {
  return value === "structure" || value === "interaction" || value === "visual" || value === "diagnostics" || value === "handoff";
}

function isOpaqueFrameUpdate(value: unknown): value is OpaqueDesktopLayerFrameUpdate {
  if (!isRecord(value) || !isTestDesktopLayerLane(value.lane) || !isRecord(value.frame)) return false;
  return Object.values(value.frame).every((entry) => entry === null);
}

function requireOpaqueFrameUpdates(value: unknown): readonly OpaqueDesktopLayerFrameUpdate[] {
  if (!Array.isArray(value) || !value.every(isOpaqueFrameUpdate)) {
    throw new Error("[desktop layer frames test setup failed] scheduler should return opaque lane updates");
  }
  return value;
}

function requireFrameWork(value: unknown): TestDesktopLayerFrameWork {
  if (!isRecord(value)) throw new Error("[desktop layer frames test setup failed] apply should return frame work");
  const requireCounter = (counter: unknown, name: keyof TestDesktopLayerFrameWork): number => {
    if (typeof counter !== "number") {
      throw new Error(`[desktop layer frames test setup failed] ${name} should be numeric`);
    }
    return counter;
  };
  return {
    diagnosticsFrames: requireCounter(value.diagnosticsFrames, "diagnosticsFrames"),
    fullPlanBuilds: requireCounter(value.fullPlanBuilds, "fullPlanBuilds"),
    handoffFrames: requireCounter(value.handoffFrames, "handoffFrames"),
    handoffReconciliations: requireCounter(value.handoffReconciliations, "handoffReconciliations"),
    interactionFrames: requireCounter(value.interactionFrames, "interactionFrames"),
    reconciledNodes: requireCounter(value.reconciledNodes, "reconciledNodes"),
    structureFrames: requireCounter(value.structureFrames, "structureFrames"),
    visualFrames: requireCounter(value.visualFrames, "visualFrames"),
  };
}

function makeOpaqueFrameUpdates(
  invalidation: TestRenderInvalidation,
  builders: OpaqueDesktopLayerFrameBuilders,
): readonly OpaqueDesktopLayerFrameUpdate[] {
  // This scheduling-contract test intentionally crosses the production payload types with opaque null frames.
  const updates: unknown = Reflect.apply(makeDesktopLayerFrameUpdates, undefined, [invalidation, builders]);
  return requireOpaqueFrameUpdates(updates);
}

function applyOpaqueFrameUpdates(
  layer: TestDesktopLayerPort,
  updates: readonly OpaqueDesktopLayerFrameUpdate[],
): TestDesktopLayerFrameWork {
  const work: unknown = Reflect.apply(applyDesktopLayerFrameUpdates, undefined, [layer, updates]);
  return requireFrameWork(work);
}

function makeFrame(lane: TestDesktopLayerLane): OpaqueDesktopLayerFrame {
  return Object.fromEntries(getDesktopLayerFrameFields(lane).map((field) => [field, null]));
}

export function runDesktopLayerFramesTests(): void {
  const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(`[desktop layer frames test failed] ${message}`);
  };

  const buildCalls: string[] = [];
  const buildFrame = (lane: TestDesktopLayerLane): OpaqueDesktopLayerFrame => {
    buildCalls.push(lane);
    return makeFrame(lane);
  };
  const builders: OpaqueDesktopLayerFrameBuilders = {
    structure: () => buildFrame("structure"),
    interaction: () => buildFrame("interaction"),
    visual: () => buildFrame("visual"),
    diagnostics: () => buildFrame("diagnostics"),
    handoff: () => buildFrame("handoff"),
  };

  const visualUpdates = makeOpaqueFrameUpdates({
    requiresDiagnosticsUpdate: false,
    requiresHandoffUpdate: false,
    requiresInteractionUpdate: false,
    requiresStructureUpdate: false,
    requiresVisualUpdate: true,
  }, builders);
  assert(buildCalls.join(",") === "visual", "a visual invalidation must build only the visual frame");
  assert(visualUpdates.length === 1 && visualUpdates[0]?.lane === "visual", "a visual invalidation should schedule one visual update");

  buildCalls.length = 0;
  const structureUpdates = makeOpaqueFrameUpdates({
    requiresDiagnosticsUpdate: true,
    requiresHandoffUpdate: true,
    requiresInteractionUpdate: true,
    requiresStructureUpdate: true,
    requiresVisualUpdate: true,
  }, builders);
  assert(buildCalls.join(",") === "structure", "structure invalidation must subsume all narrower lanes");
  assert(structureUpdates.length === 1 && structureUpdates[0]?.lane === "structure", "structure invalidation should schedule one structural update");

  buildCalls.length = 0;
  const narrowUpdates = makeOpaqueFrameUpdates({
    requiresDiagnosticsUpdate: false,
    requiresHandoffUpdate: true,
    requiresInteractionUpdate: true,
    requiresStructureUpdate: false,
    requiresVisualUpdate: true,
  }, builders);
  assert(buildCalls.join(",") === "interaction,visual,handoff", "narrow invalidations should build only requested lane frames in commit order");

  const applied: string[] = [];
  const layer: TestDesktopLayerPort = {
    tickFolderHandoff: () => { applied.push("handoff"); return { handoffReconciliations: 1 }; },
    updateDiagnostics: () => { applied.push("diagnostics"); },
    updateInteraction: () => { applied.push("interaction"); },
    updateStructure: () => { applied.push("structure"); return { fullPlanBuilds: 1, reconciledNodes: 7 }; },
    updateVisual: () => { applied.push("visual"); },
  };
  const work = applyOpaqueFrameUpdates(layer, narrowUpdates);
  assert(applied.join(",") === "interaction,visual,handoff", "lane updates should be applied in the planned order");
  assert(work.interactionFrames === 1 && work.visualFrames === 1 && work.handoffFrames === 1, "work diagnostics should count built lane frames");
  assert(work.structureFrames === 0 && work.diagnosticsFrames === 0, "work diagnostics should keep unbuilt lanes at zero");
  assert(work.fullPlanBuilds === 0 && work.handoffReconciliations === 1, "work diagnostics should merge layer work without inventing plan builds");
}
