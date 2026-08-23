import { DiagnosticError, unsupportedDiagnosticOperation } from "./diagnosticError.js";
import { sceneDiagnosticsState } from "./sceneDiagnosticsState.js";
import type {
  FolderHandoffDiagnosticOptions,
  SceneDiagnosticsClearResult,
  SceneDiagnosticsSnapshot,
  SceneDiagnosticsState,
  SceneDiagnosticsStatus,
} from "./sceneDiagnosticsState.js";

type SceneDiagnosticOperation =
  | "state.read"
  | "state.clear"
  | "folder-handoff.configure";

interface SceneDiagnosticOperationDescriptor {
  readonly id: SceneDiagnosticOperation;
  readonly mutatesState: boolean;
  readonly resultSize: "small" | "medium";
}

interface SceneDiagnosticDescriptor {
  readonly descriptionKey: "diagnostics.tools.scene.description";
  readonly id: "scene";
  readonly operations: readonly SceneDiagnosticOperationDescriptor[];
  readonly titleKey: "diagnostics.tools.scene.title";
  readonly version: 1;
}

type SceneDiagnosticAdapterState = Pick<
  SceneDiagnosticsState,
  "clear" | "configureFolderHandoff" | "reset" | "snapshot" | "status"
>;

interface SceneDiagnosticAdapterOptions {
  readonly state?: unknown;
}

interface SceneDiagnosticInvokeParams {
  readonly channel?: unknown;
  readonly enabled?: unknown;
  readonly lineWidth?: unknown;
  readonly log?: unknown;
  readonly overlay?: unknown;
  readonly timeline?: unknown;
}

type SceneDiagnosticInvokeOutcome =
  | FolderHandoffDiagnosticOptions
  | SceneDiagnosticsClearResult
  | SceneDiagnosticsSnapshot
  | null;

interface SceneDiagnosticAdapter {
  describe(): Readonly<SceneDiagnosticDescriptor>;
  dispose(): Promise<void>;
  getStatus(): Promise<SceneDiagnosticsStatus>;
  invoke(
    operation: unknown,
    params?: SceneDiagnosticInvokeParams,
  ): Promise<SceneDiagnosticInvokeOutcome>;
}

const SCENE_DIAGNOSTIC_DESCRIPTOR: Readonly<SceneDiagnosticDescriptor> = Object.freeze({
  descriptionKey: "diagnostics.tools.scene.description",
  id: "scene",
  operations: Object.freeze([
    { id: "state.read", mutatesState: false, resultSize: "medium" },
    { id: "state.clear", mutatesState: true, resultSize: "small" },
    { id: "folder-handoff.configure", mutatesState: true, resultSize: "small" },
  ] as const),
  titleKey: "diagnostics.tools.scene.title",
  version: 1,
});

function requireState(state: unknown): asserts state is SceneDiagnosticAdapterState {
  for (const method of ["clear", "configureFolderHandoff", "reset", "snapshot", "status"] as const) {
    if (typeof (state as {
      readonly [Method in keyof SceneDiagnosticAdapterState]?: unknown;
    } | null | undefined)?.[method] !== "function") {
      throw new TypeError(`Scene diagnostic adapter requires state.${method}()`);
    }
  }
}

export function createSceneDiagnosticAdapter(
  options: SceneDiagnosticAdapterOptions = {},
): Readonly<SceneDiagnosticAdapter> {
  const state = options.state === undefined ? sceneDiagnosticsState : options.state;
  let disposed = false;
  requireState(state);

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("diagnostic-tool-disposed", "The scene diagnostic tool has been disposed", {
        nextActions: ["Wait for the Pixi desktop surface to reinstall the diagnostic entry point"],
      });
    }
  }

  function describe() {
    return SCENE_DIAGNOSTIC_DESCRIPTOR;
  }

  async function getStatus() {
    ensureActive();
    return (state as SceneDiagnosticAdapterState).status();
  }

  async function invoke(
    operation: unknown,
    params: SceneDiagnosticInvokeParams = {},
  ): Promise<SceneDiagnosticInvokeOutcome> {
    ensureActive();
    switch (operation) {
      case "state.read":
        return (state as SceneDiagnosticAdapterState).snapshot();
      case "state.clear":
        return (state as SceneDiagnosticAdapterState).clear(params.channel ?? null);
      case "folder-handoff.configure": {
        if (typeof params.enabled !== "boolean") {
          throw new DiagnosticError("diagnostic-params-invalid", "folder-handoff.configure requires a boolean enabled parameter", {
            details: { enabled: params.enabled ?? null },
            nextActions: ["Pass { enabled: true } to enable it, or { enabled: false } to disable it"],
          });
        }
        const { enabled, ...config } = params;
        return (state as SceneDiagnosticAdapterState).configureFolderHandoff(enabled ? config : false);
      }
      default:
        throw unsupportedDiagnosticOperation("scene", operation);
    }
  }

  async function dispose() {
    if (disposed) return;
    (state as SceneDiagnosticAdapterState).reset();
    disposed = true;
  }

  return Object.freeze({ describe, dispose, getStatus, invoke });
}
