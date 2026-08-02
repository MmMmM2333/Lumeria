import { createSceneDiagnosticAdapter } from "./sceneDiagnosticAdapter.js";
import { createSceneDiagnosticsState } from "./sceneDiagnosticsState.js";

export async function runSceneDiagnosticAdapterTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[scene diagnostic adapter test failed] ${message}`);
  };
  const state = createSceneDiagnosticsState({ now: () => "2026-08-02T00:00:00.000Z" });
  const adapter = createSceneDiagnosticAdapter({ state });
  const descriptor = adapter.describe();
  const operations = descriptor.operations.map((operation) => operation.id);
  assert(descriptor.id === "scene", "the adapter should expose a stable scene tool id");
  assert(operations.join(",") === "state.read,state.clear,folder-handoff.configure", "the adapter should expose one canonical state seam");

  const initialStatus = await adapter.getStatus();
  assert(initialStatus.state === "ready" && initialStatus.availableChannels.length === 0, "status should stay lightweight");
  const config = await adapter.invoke("folder-handoff.configure", {
    enabled: true,
    lineWidth: 4,
    log: false,
    overlay: true,
    timeline: true,
  });
  assert(config.lineWidth === 4 && config.timeline === true, "configuration should delegate to the scene state owner");

  state.publish("folderHandoff", { folderId: "folder-1", phase: "complete" });
  const snapshot = await adapter.invoke("state.read");
  assert(snapshot.channels.folderHandoff.snapshot.phase === "complete", "state.read should expose structured scene facts");
  const cleared = await adapter.invoke("state.clear", { channel: "folderHandoff" });
  assert(cleared.clearedChannels[0] === "folderHandoff", "state.clear should target one explicit channel");

  let invalidConfig = null;
  try {
    await adapter.invoke("folder-handoff.configure", {});
  } catch (error) {
    invalidConfig = error;
  }
  assert(invalidConfig?.code === "diagnostic-params-invalid", "configuration should require an explicit enabled flag");

  await adapter.dispose();
  let disposedError = null;
  try {
    await adapter.getStatus();
  } catch (error) {
    disposedError = error;
  }
  assert(disposedError?.code === "diagnostic-tool-disposed", "disposed scene adapters should reject further use");
}
