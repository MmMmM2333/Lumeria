import { createSceneDiagnosticAdapter } from "./sceneDiagnosticAdapter.js";
import { createSceneDiagnosticsState } from "./sceneDiagnosticsState.js";
import type { FolderHandoffDiagnosticOptions } from "./sceneDiagnosticsState.js";

interface FolderHandoffSnapshot {
  readonly phase?: unknown;
}

export async function runSceneDiagnosticAdapterTests() {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`[scene diagnostic adapter test failed] ${message}`);
  };
  const state = createSceneDiagnosticsState({ now: () => "2026-08-02T00:00:00.000Z" });
  for (const invalidState of [false, 0, "", null]) {
    let invalidStateError: unknown = null;
    try {
      createSceneDiagnosticAdapter({ state: invalidState });
    } catch (error) {
      invalidStateError = error;
    }
    assert(
      invalidStateError instanceof TypeError,
      `an explicitly injected ${String(invalidState)} state should fail instead of using the global singleton`,
    );
  }
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
  assert((config as FolderHandoffDiagnosticOptions).lineWidth === 4 && (config as FolderHandoffDiagnosticOptions).timeline === true, "configuration should delegate to the scene state owner");

  state.publish("folderHandoff", { folderId: "folder-1", phase: "complete" });
  const snapshot = await adapter.invoke("state.read") as ReturnType<typeof state.snapshot>;
  assert((snapshot.channels.folderHandoff.snapshot as FolderHandoffSnapshot).phase === "complete", "state.read should expose structured scene facts");
  const cleared = await adapter.invoke("state.clear", { channel: "folderHandoff" }) as ReturnType<typeof state.clear>;
  assert(cleared.clearedChannels[0] === "folderHandoff", "state.clear should target one explicit channel");

  let invalidConfig: unknown = null;
  try {
    await adapter.invoke("folder-handoff.configure", {});
  } catch (error) {
    invalidConfig = error;
  }
  assert((invalidConfig as { readonly code?: unknown } | null)?.code === "diagnostic-params-invalid", "configuration should require an explicit enabled flag");

  await adapter.dispose();
  let disposedError: unknown = null;
  try {
    await adapter.getStatus();
  } catch (error) {
    disposedError = error;
  }
  assert((disposedError as { readonly code?: unknown } | null)?.code === "diagnostic-tool-disposed", "disposed scene adapters should reject further use");
}
