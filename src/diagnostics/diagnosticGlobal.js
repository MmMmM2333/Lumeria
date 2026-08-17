import {
  deleteLaunchpadDebugValue,
  readLaunchpadDebugValue,
  setLaunchpadDebugValue,
} from "../rendering/diagnosticPort.js";

export const DIAGNOSTIC_GLOBAL_KEY = "diagnostics";
export const DIAGNOSTIC_API_SCHEMA = "lumeria-diagnostic-api/v1";

function requireHub(hub) {
  if (!hub || typeof hub !== "object") throw new TypeError("installDiagnosticHubGlobal requires a hub");
  for (const method of ["listTools", "describe", "invoke", "queryArtifact", "releaseArtifact", "dispose"]) {
    if (typeof hub[method] !== "function") {
      throw new TypeError(`installDiagnosticHubGlobal requires hub.${method}()`);
    }
  }
}

export function installDiagnosticHubGlobal(options = {}) {
  const {
    dev = Boolean(import.meta.env?.DEV),
    hub,
    target = globalThis,
  } = options;
  if (!dev || !target) return null;
  requireHub(hub);
  const facade = Object.freeze({
    describe: (...args) => hub.describe(...args),
    dispose: (...args) => hub.dispose(...args),
    invoke: (...args) => hub.invoke(...args),
    listTools: (...args) => hub.listTools(...args),
    queryArtifact: (...args) => hub.queryArtifact(...args),
    releaseArtifact: (...args) => hub.releaseArtifact(...args),
    schema: DIAGNOSTIC_API_SCHEMA,
  });
  let installed = true;
  setLaunchpadDebugValue(DIAGNOSTIC_GLOBAL_KEY, facade, target);

  function uninstall() {
    if (!installed) return;
    installed = false;
    if (readLaunchpadDebugValue(DIAGNOSTIC_GLOBAL_KEY, target) !== facade) return;
    deleteLaunchpadDebugValue(DIAGNOSTIC_GLOBAL_KEY, target);
  }

  return Object.freeze({ facade, uninstall });
}
