import { installDiagnosticHubGlobal } from "./diagnosticGlobal.js";
import { LUMERIA_DEBUG_GLOBAL_KEY, readLaunchpadDebugValue } from "../rendering/pixi/debugNamespace.js";

export async function runDiagnosticGlobalTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[diagnostic global test failed] ${message}`);
  };
  const hub = {
    describe: (toolId, options) => ({ toolId, ...options }),
    dispose: (options) => options,
    invoke: (request) => request,
    listTools: (options) => options,
    queryArtifact: (request) => request,
    releaseArtifact: (artifactId, options) => ({ artifactId, ...options }),
  };

  const productionTarget = {};
  assert(installDiagnosticHubGlobal({ dev: false, hub, target: productionTarget }) == null, "production installs should be disabled");
  assert(productionTarget[LUMERIA_DEBUG_GLOBAL_KEY] == null, "production installs should not mutate the target");

  const target = {};
  const installation = installDiagnosticHubGlobal({ dev: true, hub, target });
  const diagnostics = readLaunchpadDebugValue("diagnostics", target);
  assert(diagnostics === installation.facade, "dev installs should expose the stable diagnostics key");
  assert(Object.keys(target[LUMERIA_DEBUG_GLOBAL_KEY]).join(",") === "diagnostics", "a fresh target should expose one root diagnostics entry");
  assert(diagnostics.invoke({ toolId: "motion" }).toolId === "motion", "the facade should bind hub methods without leaking this");
  assert(typeof diagnostics.queryArtifact === "function" && typeof diagnostics.releaseArtifact === "function", "the facade should expose artifact lifecycle methods");

  installation.uninstall();
  assert(target[LUMERIA_DEBUG_GLOBAL_KEY] == null, "uninstall should remove an empty debug namespace");
  installation.uninstall();
  assert(target[LUMERIA_DEBUG_GLOBAL_KEY] == null, "uninstall should be idempotent");

  const overlappingTarget = {};
  const first = installDiagnosticHubGlobal({ dev: true, hub, target: overlappingTarget });
  const second = installDiagnosticHubGlobal({ dev: true, hub, target: overlappingTarget });
  first.uninstall();
  assert(readLaunchpadDebugValue("diagnostics", overlappingTarget) === second.facade, "an older uninstall must not remove the active installation");
  second.uninstall();
  assert(overlappingTarget[LUMERIA_DEBUG_GLOBAL_KEY] == null, "out-of-order uninstall must not resurrect a stale diagnostic facade");
}
