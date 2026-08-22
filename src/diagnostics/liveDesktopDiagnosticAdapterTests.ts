import { createLiveDesktopDiagnosticAdapter } from "./liveDesktopDiagnosticAdapter.js";
import { DiagnosticError } from "./diagnosticError.js";

export async function runLiveDesktopDiagnosticAdapterTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[live desktop diagnostic adapter test failed] ${message}`);
  };
  const calls: Array<{
    operation: string;
    options?: unknown;
    patch?: Readonly<Record<string, unknown>>;
  }> = [];
  let disposed = false;
  const state = {
    consistency: { status: "consistent" },
    desired: { revision: 2 },
    lastFailure: null,
    phase: "ready",
    runtimeStatus: { active: true, generation: 4, phase: "running" },
    schema: "lumeria-live-desktop-diagnostics-state/v1",
  };
  const controller = {
    applyDesired: (options: unknown) => {
      calls.push({ operation: "apply", options });
      return state;
    },
    dispose: () => {
      disposed = true;
    },
    getState: () => state,
    refreshRuntime: () => {
      calls.push({ operation: "refresh" });
      return state;
    },
    updateSettings: (patch: Readonly<Record<string, unknown>>, options: unknown) => {
      calls.push({ operation: "update", options, patch });
      return state;
    },
  };
  const adapter = createLiveDesktopDiagnosticAdapter({ controller });
  const descriptor = adapter.describe();
  assert(descriptor.id === "live-desktop", "adapter should expose a stable tool id");
  assert(descriptor.operations.some((operation) => operation.id === "settings.update"), "adapter should expose the canonical settings operation");
  const updateDescriptor = descriptor.operations.find((operation) => operation.id === "settings.update");
  assert(updateDescriptor?.paramsSchema?.properties?.patch?.properties?.debugFrameSourceOverride, "settings.update should publish its accepted parameter schema");
  assert(updateDescriptor?.paramsSchema?.properties?.options?.properties?.restart?.type === "boolean", "settings.update should publish the strict restart option");
  const applyDescriptor = descriptor.operations.find((operation) => operation.id === "runtime.apply");
  assert(applyDescriptor?.paramsSchema?.properties?.restart?.type === "boolean", "runtime.apply should publish the strict restart option");
  assert((await adapter.getStatus()).runtime.phase === "running", "adapter status should remain lightweight and include runtime phase");
  const stateRead = await adapter.invoke("state.read");
  assert(stateRead !== null && typeof stateRead === "object" && "schema" in stateRead, "state.read should return a state object");
  assert(stateRead.schema === state.schema, "full state should be readable explicitly");
  await adapter.invoke("settings.update", { patch: { skipBlankFrames: true } });
  assert(calls[0]?.patch?.skipBlankFrames === true, "settings updates should delegate through the controller");

  for (const patch of [false, 0, "", null, undefined]) {
    let invalidPatchError: DiagnosticError | null = null;
    try {
      await adapter.invoke("settings.update", { patch });
    } catch (error) {
      invalidPatchError = error instanceof DiagnosticError ? error : null;
    }
    assert(invalidPatchError?.code === "diagnostic-params-invalid", "falsy non-object patches must fail instead of becoming empty updates");
  }

  let unknownParamError: DiagnosticError | null = null;
  try {
    await adapter.invoke("settings.update", { typo: true });
  } catch (error) {
    unknownParamError = error instanceof DiagnosticError ? error : null;
  }
  assert(unknownParamError?.code === "diagnostic-params-invalid", "unknown top-level params should fail explicitly");

  for (const [operation, params] of [
    ["settings.update", { options: { restart: "false" }, patch: {} }],
    ["runtime.apply", { restart: "false" }],
  ]) {
    let invalidRestartError: DiagnosticError | null = null;
    try {
      await adapter.invoke(operation, params);
    } catch (error) {
      invalidRestartError = error instanceof DiagnosticError ? error : null;
    }
    assert(invalidRestartError?.code === "diagnostic-params-invalid", "restart must reject coerced string values");
  }

  await adapter.invoke("runtime.apply", { restart: true });
  await adapter.invoke("runtime.refresh");
  assert(calls.map((call) => call.operation).join(",") === "update,apply,refresh", "runtime operations should use canonical controller methods");
  await adapter.dispose();
  assert(disposed, "adapter disposal should release its controller");
}
