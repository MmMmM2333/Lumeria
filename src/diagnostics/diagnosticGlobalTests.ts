import { installDiagnosticHubGlobal } from "./diagnosticGlobal.js";
import { LUMERIA_DEBUG_GLOBAL_KEY, readLaunchpadDebugValue } from "../rendering/pixi/debugNamespace.js";

export async function runDiagnosticGlobalTests(): Promise<void> {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[diagnostic global test failed] ${message}`);
  }
  const hub = {
    describe: (toolId: unknown, options: Record<string, unknown> = {}) => ({ toolId, ...options }),
    dispose: (options: unknown) => options,
    invoke: (request: unknown) => request,
    listTools: (options: unknown) => options,
    queryArtifact: (request: unknown) => request,
    releaseArtifact: (artifactId: unknown, options: Record<string, unknown> = {}) => ({ artifactId, ...options }),
  };

  const productionTarget: Record<string, unknown> = {};
  assert(installDiagnosticHubGlobal({ dev: false, hub, target: productionTarget }) == null, "production installs should be disabled");
  assert(productionTarget[LUMERIA_DEBUG_GLOBAL_KEY] == null, "production installs should not mutate the target");

  const target: Record<string, unknown> = {};
  const installation = installDiagnosticHubGlobal({ dev: true, hub, target });
  const diagnostics = readLaunchpadDebugValue("diagnostics", target);
  assert(installation !== null, "dev installs should return an installation handle");
  assert(diagnostics === installation.facade, "dev installs should expose the stable diagnostics key");
  const namespace = target[LUMERIA_DEBUG_GLOBAL_KEY];
  assert(namespace !== null && typeof namespace === "object", "a fresh target should expose a debug namespace");
  assert(Object.keys(namespace).join(",") === "diagnostics", "a fresh target should expose one root diagnostics entry");
  assert(diagnostics !== null && typeof diagnostics === "object", "diagnostics should be an object");
  assert("invoke" in diagnostics && typeof diagnostics.invoke === "function", "diagnostics should expose invoke");
  const invokeResult = diagnostics.invoke({ toolId: "motion" });
  assert(invokeResult !== null && typeof invokeResult === "object" && "toolId" in invokeResult && invokeResult.toolId === "motion", "the facade should bind hub methods without leaking this");
  assert("queryArtifact" in diagnostics && typeof diagnostics.queryArtifact === "function" && "releaseArtifact" in diagnostics && typeof diagnostics.releaseArtifact === "function", "the facade should expose artifact lifecycle methods");

  installation.uninstall();
  assert(target[LUMERIA_DEBUG_GLOBAL_KEY] == null, "uninstall should remove an empty debug namespace");
  installation.uninstall();
  assert(target[LUMERIA_DEBUG_GLOBAL_KEY] == null, "uninstall should be idempotent");

  const overlappingTarget: Record<string, unknown> = {};
  const first = installDiagnosticHubGlobal({ dev: true, hub, target: overlappingTarget });
  const second = installDiagnosticHubGlobal({ dev: true, hub, target: overlappingTarget });
  assert(first !== null && second !== null, "overlapping dev installs should return handles");
  first.uninstall();
  assert(readLaunchpadDebugValue("diagnostics", overlappingTarget) === second.facade, "an older uninstall must not remove the active installation");
  second.uninstall();
  assert(overlappingTarget[LUMERIA_DEBUG_GLOBAL_KEY] == null, "out-of-order uninstall must not resurrect a stale diagnostic facade");
}
