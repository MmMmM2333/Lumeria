import { createRenderDiagnosticAdapter } from "./renderDiagnosticAdapter.js";

export async function runRenderDiagnosticAdapterTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[render diagnostic adapter test failed] ${message}`);
  };
  const calls = [];
  let config = { autoFreeze: true, enabled: false, pixels: "off", target: "all-folders" };
  const makeSummary = () => ({
    activeSession: null,
    config: { ...config },
    lastSession: null,
    recentEventCount: 2,
    sessionCount: 1,
    version: 2,
  });
  const commands = {
    arm(patch) {
      calls.push({ operation: "arm", patch });
      config = { ...config, ...patch, enabled: true };
      return { ...config };
    },
    capture(label) {
      calls.push({ label, operation: "capture" });
      return { phase: label };
    },
    clear() {
      calls.push({ operation: "clear" });
    },
    disarm() {
      calls.push({ operation: "disarm" });
      config = { ...config, enabled: false };
      return { ...config };
    },
    exportJson(space) {
      calls.push({ operation: "exportJson", space });
      return JSON.stringify({ version: 2 }, null, space);
    },
    freeze(reason) {
      calls.push({ operation: "freeze", reason });
      return reason;
    },
    inspect(label) {
      calls.push({ label, operation: "inspect" });
      return { phase: label };
    },
    snapshot() {
      calls.push({ operation: "snapshot" });
      return { sessions: [{ id: "drag-render-1" }], version: 2 };
    },
    summary() {
      calls.push({ operation: "summary" });
      return makeSummary();
    },
  };
  const probe = {
    commands,
    destroy() {
      calls.push({ operation: "destroy" });
    },
  };
  const adapter = createRenderDiagnosticAdapter({
    getFolderVisualSnapshot: () => ({ ownerCount: 2 }),
    probe,
  });

  const descriptor = adapter.describe();
  const operationIds = descriptor.operations.map((operation) => operation.id);
  assert(descriptor.id === "render" && descriptor.version === 1, "the adapter should expose a stable descriptor");
  assert(operationIds.includes("probe.arm") && operationIds.includes("report.summary"), "the descriptor should expose canonical control and read operations");
  assert(operationIds.includes("report.export") && !operationIds.includes("download"), "the adapter should export data without owning browser download behavior");

  const initialStatus = await adapter.getStatus();
  assert(initialStatus.state === "disabled", "a disarmed probe should report disabled state");
  assert(calls.filter((entry) => entry.operation === "summary").length === 1, "status should use the lightweight probe summary");
  assert(!calls.some((entry) => entry.operation === "snapshot"), "status should not materialize the full report");

  const armed = await adapter.invoke("probe.arm", { pixels: "phase-diff", target: "all-folders" });
  assert(armed.enabled === true && armed.pixels === "phase-diff", "arm should return the applied probe config");
  assert((await adapter.getStatus()).state === "armed", "an enabled idle probe should report armed state");
  await adapter.invoke("probe.disarm");
  await adapter.invoke("probe.clear");
  await adapter.invoke("probe.freeze", { reason: "manual-check" });
  assert(calls.some((entry) => entry.operation === "freeze" && entry.reason === "manual-check"), "freeze should preserve its reason");

  const summary = await adapter.invoke("report.summary");
  assert(summary.version === 2 && !summary.sessions, "summary should remain the lightweight report shape");
  const report = await adapter.invoke("report.read");
  assert(report.sessions[0].id === "drag-render-1", "full report reads should be explicit");
  const exported = await adapter.invoke("report.export", { space: 0 });
  assert(exported.format === "json" && JSON.parse(exported.content).version === 2, "export should return serializable content to the caller");
  const capture = await adapter.invoke("capture.manual", { label: "manual-test" });
  assert(capture.phase === "manual-test", "manual capture should preserve its label");
  const inspection = await adapter.invoke("capture.inspect", { label: "inspect-test" });
  assert(inspection.phase === "inspect-test", "inspection should preserve its label");
  const folderVisual = await adapter.invoke("folder-visual.snapshot");
  assert(folderVisual.ownerCount === 2, "the adapter should absorb the replaced folderVisual global path");

  await adapter.dispose();
  await adapter.dispose();
  assert(calls.filter((entry) => entry.operation === "destroy").length === 1, "dispose should destroy the probe exactly once");

  let unsupported = null;
  try {
    await createRenderDiagnosticAdapter({ probe }).invoke("download");
  } catch (error) {
    unsupported = error;
  }
  assert(unsupported?.code === "diagnostic-operation-not-supported", "direct adapter misuse should fail with the shared operation code");
}
