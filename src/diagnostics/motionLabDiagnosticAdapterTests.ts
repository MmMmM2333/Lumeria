import { createMotionLabDiagnosticAdapter } from "./motionLabDiagnosticAdapter.js";
import { DiagnosticError } from "./diagnosticError.js";

export async function runMotionLabDiagnosticAdapterTests(): Promise<void> {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[motion lab diagnostic adapter test failed] ${message}`);
  }
  const calls: unknown[] = [];
  const port = {
    applyPreset: (id: string) => { calls.push(["preset", id]); return { presetId: id }; },
    captureReplay: () => { calls.push(["capture"]); return { schema: "pixi-motion-replay-trace/v1" }; },
    compare: (mode: "baseline" | "last") => { calls.push(["compare", mode]); return { mode, rows: [] }; },
    exportData: (format: "compare" | "focused" | "report" | "trace" | "trace-diff") => { calls.push(["export", format]); return { format }; },
    readState: () => ({
      presets: [{ id: "snappy" }],
      scenarios: [{ id: "folder-open" }, { id: "drag" }],
      selectedScenarioId: "folder-open",
      state: "ready",
    }),
    reset: () => { calls.push(["reset"]); return { reset: true }; },
    runScenario: async (id: string | null) => { calls.push(["run", id]); return { scenarioId: id }; },
    saveBaseline: () => { calls.push(["baseline"]); return { saved: true }; },
    selectScenario: (id: string) => { calls.push(["select", id]); return { scenarioId: id }; },
    status: () => ({ scenarioCount: 3, state: "ready" }),
    updateParams: (patch: Record<string, unknown>) => { calls.push(["params", patch]); return patch; },
  };
  const adapter = createMotionLabDiagnosticAdapter({ port });
  const descriptor = adapter.describe();
  const operationIds = descriptor.operations.map((operation) => operation.id);
  assert(descriptor.id === "motion-lab", "the adapter should expose a stable Motion Lab tool id");
  assert(operationIds.includes("state.read") && operationIds.includes("scenario.run"), "the adapter should expose state and scenario seams");
  assert(operationIds.includes("export.read") && !operationIds.some((id) => id.startsWith("copy")), "the adapter should expose data exports without clipboard concerns");
  const paramsDescriptor = descriptor.operations.find((operation) => operation.id === "params.update");
  const paramProperties = (paramsDescriptor?.paramsSchema as {
    properties?: { patch?: { properties?: Record<string, { enum?: readonly string[]; maximum?: number; minimum?: number }> } };
  } | undefined)?.properties?.patch?.properties;
  assert(paramProperties?.springStiffness?.minimum === 40 && paramProperties.springStiffness.maximum === 1200, "params.update should publish canonical numeric limits");
  assert(paramProperties?.ease?.enum?.includes("power2.out"), "params.update should publish canonical option values");
  const compareSchema = descriptor.operations.find((operation) => operation.id === "compare.run")?.paramsSchema as {
    properties?: { mode?: { enum?: readonly string[] } };
  } | undefined;
  assert(compareSchema?.properties?.mode?.enum?.includes("baseline"), "compare.run should publish its accepted modes");

  assert((await adapter.getStatus() as { scenarioCount: number }).scenarioCount === 3, "status should delegate through a lightweight port method");
  assert((await adapter.invoke("state.read") as { selectedScenarioId: string }).selectedScenarioId === "folder-open", "state.read should expose the lab state");
  assert((await adapter.invoke("scenario.select", { scenarioId: "drag" }) as { scenarioId: string }).scenarioId === "drag", "scenario selection should preserve ids");
  assert((await adapter.invoke("scenario.run", { scenarioId: "drag" }) as { scenarioId: string }).scenarioId === "drag", "scenario runs should preserve ids");
  assert((await adapter.invoke("params.update", { patch: { springStiffness: 120 } }) as { springStiffness: number }).springStiffness === 120, "parameter updates should preserve an explicit canonical patch");
  assert((await adapter.invoke("preset.apply", { presetId: "snappy" }) as { presetId: string }).presetId === "snappy", "preset application should preserve ids");
  assert((await adapter.invoke("replay.capture") as { schema: string }).schema === "pixi-motion-replay-trace/v1", "replay capture should return trace data");
  assert((await adapter.invoke("compare.run", { mode: "baseline" }) as { mode: string }).mode === "baseline", "comparison should preserve its mode");
  assert((await adapter.invoke("export.read", { format: "focused" }) as { format: string }).format === "focused", "exports should preserve their format");

  let unknownTopLevelParamError: unknown = null;
  try {
    await adapter.invoke("state.read", { typo: true });
  } catch (error) {
    unknownTopLevelParamError = error;
  }
  assert(unknownTopLevelParamError instanceof DiagnosticError && unknownTopLevelParamError.code === "diagnostic-params-invalid", "published additionalProperties=false contracts should reject unknown top-level params");

  let invalidParams: unknown = null;
  try {
    await adapter.invoke("params.update", { patch: null });
  } catch (error) {
    invalidParams = error;
  }
  assert(invalidParams instanceof DiagnosticError && invalidParams.code === "diagnostic-params-invalid", "invalid parameter patches should fail explicitly");

  for (const patch of [{ stiffness: 120 }, { springStiffness: "120" }, { springStiffness: 10_000 }, new Date(0)]) {
  let strictPatchError: unknown = null;
    try {
      await adapter.invoke("params.update", { patch });
    } catch (error) {
      strictPatchError = error;
    }
    assert(strictPatchError instanceof DiagnosticError && strictPatchError.code === "diagnostic-params-invalid", "unknown, coerced, and out-of-range Motion Lab params should fail explicitly");
  }

  const callsBeforeUnknownIds = calls.length;
  for (const [operation, params] of [
    ["scenario.select", { scenarioId: "typo" }],
    ["scenario.run", { scenarioId: "typo" }],
    ["preset.apply", { presetId: "typo" }],
  ] as const) {
  let unknownIdError: unknown = null;
    try {
      await adapter.invoke(operation, params);
    } catch (error) {
      unknownIdError = error;
    }
    assert(unknownIdError instanceof DiagnosticError && unknownIdError.code === "diagnostic-params-invalid", "unknown scenario and preset ids should fail explicitly");
  }
  assert(calls.length === callsBeforeUnknownIds, "invalid ids must not reach the Motion Lab port");

  const callsBeforeSchemaMismatches = calls.length;
  for (const [operation, params] of [
    ["scenario.run", { scenarioId: null }],
    ["compare.run", { mode: ["baseline"] }],
    ["export.read", { format: ["focused"] }],
  ] as const) {
  let schemaMismatchError: unknown = null;
    try {
      await adapter.invoke(operation, params);
    } catch (error) {
      schemaMismatchError = error;
    }
    assert(schemaMismatchError instanceof DiagnosticError && schemaMismatchError.code === "diagnostic-params-invalid", "adapter validation should enforce the published raw parameter types");
  }
  assert(calls.length === callsBeforeSchemaMismatches, "schema-invalid Motion Lab params must not reach the port");

  await adapter.dispose();
  let disposedError: unknown = null;
  try {
    await adapter.getStatus();
  } catch (error) {
    disposedError = error;
  }
  assert(disposedError instanceof DiagnosticError && disposedError.code === "diagnostic-tool-disposed", "disposed Motion Lab adapters should reject further use");
}
