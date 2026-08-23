import {
  deleteLaunchpadDebugValue,
  readLaunchpadDebugValue,
  setLaunchpadDebugValue,
} from "../rendering/diagnosticPort.js";

export const DIAGNOSTIC_GLOBAL_KEY = "diagnostics" as const;
export const DIAGNOSTIC_API_SCHEMA = "lumeria-diagnostic-api/v1" as const;

type DebugTarget = Record<string, unknown>;

export interface DiagnosticHubGlobalFacade {
  describe(...args: unknown[]): unknown;
  dispose(...args: unknown[]): unknown;
  invoke(...args: unknown[]): unknown;
  listTools(...args: unknown[]): unknown;
  queryArtifact(...args: unknown[]): unknown;
  releaseArtifact(...args: unknown[]): unknown;
  readonly schema: typeof DIAGNOSTIC_API_SCHEMA;
}

interface DiagnosticHubGlobalLike {
  describe(...args: unknown[]): unknown;
  dispose(...args: unknown[]): unknown;
  invoke(...args: unknown[]): unknown;
  listTools(...args: unknown[]): unknown;
  queryArtifact(...args: unknown[]): unknown;
  releaseArtifact(...args: unknown[]): unknown;
}

interface InstallDiagnosticHubGlobalOptions {
  readonly dev?: boolean;
  readonly hub?: unknown;
  readonly target?: DebugTarget | null;
}

function isDebugTarget(value: unknown): value is DebugTarget {
  return value !== null && typeof value === "object";
}

function requireHub(hub: unknown): asserts hub is DiagnosticHubGlobalLike {
  if (!hub || typeof hub !== "object") throw new TypeError("installDiagnosticHubGlobal requires a hub");
  for (const method of ["listTools", "describe", "invoke", "queryArtifact", "releaseArtifact", "dispose"]) {
    if (typeof (hub as Record<string, unknown>)[method] !== "function") {
      throw new TypeError(`installDiagnosticHubGlobal requires hub.${method}()`);
    }
  }
}

export function installDiagnosticHubGlobal(options: InstallDiagnosticHubGlobalOptions = {}) {
  const dev = options.dev ?? Boolean(import.meta.env?.DEV);
  const hub = options.hub;
  const target = options.target === undefined ? globalThis : options.target;
  if (!dev || !isDebugTarget(target)) return null;
  const debugTarget = target;
  requireHub(hub);
  const facade: DiagnosticHubGlobalFacade = Object.freeze({
    describe: (...args: unknown[]) => hub.describe(...args),
    dispose: (...args: unknown[]) => hub.dispose(...args),
    invoke: (...args: unknown[]) => hub.invoke(...args),
    listTools: (...args: unknown[]) => hub.listTools(...args),
    queryArtifact: (...args: unknown[]) => hub.queryArtifact(...args),
    releaseArtifact: (...args: unknown[]) => hub.releaseArtifact(...args),
    schema: DIAGNOSTIC_API_SCHEMA,
  });
  let installed = true;
  setLaunchpadDebugValue(DIAGNOSTIC_GLOBAL_KEY, facade, debugTarget);

  function uninstall() {
    if (!installed) return;
    installed = false;
    if (readLaunchpadDebugValue(DIAGNOSTIC_GLOBAL_KEY, debugTarget) !== facade) return;
    deleteLaunchpadDebugValue(DIAGNOSTIC_GLOBAL_KEY, debugTarget);
  }

  return Object.freeze({ facade, uninstall });
}
