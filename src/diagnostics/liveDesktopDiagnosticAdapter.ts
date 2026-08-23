import { DiagnosticError, unsupportedDiagnosticOperation } from "./diagnosticError.js";
import {
  LIVE_DESKTOP_RESTART_OPTIONS_SCHEMA,
  validateLiveDesktopDebugSettingsPatch,
  validateLiveDesktopRestartOptions,
} from "./liveDesktopDebugSettings.js";
import type { LiveDesktopDiagnosticsController } from "./liveDesktopDiagnosticsController.js";

type UnknownRecord = Record<string, unknown>;
type DiagnosticParamsSchema = Readonly<{
  additionalProperties?: boolean;
  enum?: readonly unknown[];
  properties?: Readonly<Record<string, DiagnosticParamsSchema>>;
  type?: string;
}>;

type LiveDesktopDiagnosticOperation = Readonly<{
  id: string;
  mutatesState: boolean;
  paramsSchema?: DiagnosticParamsSchema;
  resultSize: "medium";
}>;

type LiveDesktopDiagnosticDescriptor = Readonly<{
  descriptionKey: string;
  id: "live-desktop";
  operations: readonly LiveDesktopDiagnosticOperation[];
  titleKey: string;
  version: 1;
}>;

export type LiveDesktopDiagnosticAdapter = Readonly<{
  describe(): LiveDesktopDiagnosticDescriptor;
  dispose(): Promise<void>;
  getStatus(): Promise<Readonly<{
    consistency: unknown;
    desiredRevision: number;
    lastFailure: unknown;
    lastRefreshFailure: unknown;
    phase: string;
    runtime: Readonly<{
      active: boolean;
      generation: number;
      phase: string;
      reason: string;
    }>;
  }>>;
  invoke(operation: unknown, params?: unknown): Promise<unknown>;
}>;

const LIVE_DESKTOP_DIAGNOSTIC_DESCRIPTOR: LiveDesktopDiagnosticDescriptor = Object.freeze({
  descriptionKey: "diagnostics.tools.live-desktop.description",
  id: "live-desktop",
  operations: Object.freeze([
    { id: "state.read", mutatesState: false, resultSize: "medium" as const },
    {
      id: "settings.update",
      mutatesState: true,
      paramsSchema: {
        additionalProperties: false,
        properties: {
          options: LIVE_DESKTOP_RESTART_OPTIONS_SCHEMA,
          patch: {
            additionalProperties: false,
            properties: {
              compositorKeeper: { type: "boolean" },
              cssFallbackEffects: { type: "boolean" },
              debugFrameSourceOverride: { enum: [null, "testPattern"] },
              disableMouseRelay: { type: "boolean" },
              forceDwmFlush: { type: "boolean" },
              skipBlankFrames: { type: "boolean" },
            },
            type: "object",
          },
        },
        type: "object",
      },
      resultSize: "medium" as const,
    },
    {
      id: "runtime.apply",
      mutatesState: true,
      paramsSchema: LIVE_DESKTOP_RESTART_OPTIONS_SCHEMA,
      resultSize: "medium" as const,
    },
    { id: "runtime.refresh", mutatesState: false, resultSize: "medium" as const },
  ]),
  titleKey: "diagnostics.tools.live-desktop.title",
  version: 1,
});

function isPlainObject(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateOperationParams(
  params: unknown,
  operation: string,
  allowedNames: readonly string[],
): UnknownRecord {
  if (!isPlainObject(params)) {
    throw new DiagnosticError("diagnostic-params-invalid", `${operation} params must be an object`, {
      details: { receivedType: Array.isArray(params) ? "array" : typeof params },
      nextActions: ["Pass an object matching the paramsSchema in the tool description"],
    });
  }
  const unknownNames = Object.keys(params).filter((name) => !allowedNames.includes(name));
  if (unknownNames.length) {
    throw new DiagnosticError("diagnostic-params-invalid", `${operation} contains unknown parameters`, {
      details: { unknownNames },
      nextActions: ["Call describe(toolId) to inspect paramsSchema"],
    });
  }
  return params;
}

function requireController(value: unknown): LiveDesktopDiagnosticsController {
  if (!isPlainObject(value)) {
    throw new TypeError("Live desktop diagnostic adapter requires a controller");
  }
  for (const method of ["applyDesired", "dispose", "getState", "refreshRuntime", "updateSettings"] as const) {
    if (typeof value[method] !== "function") {
      throw new TypeError(`Live desktop diagnostic adapter requires controller.${method}()`);
    }
  }
  return value as unknown as LiveDesktopDiagnosticsController;
}

export function createLiveDesktopDiagnosticAdapter(
  options: Readonly<{ controller?: unknown }> = {},
): LiveDesktopDiagnosticAdapter {
  const controller = requireController(options.controller);
  let disposed = false;

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("diagnostic-tool-disposed", "The Live Desktop diagnostic tool has been disposed", {
        nextActions: ["Wait for the runtime to reinstall the diagnostic entry point"],
      });
    }
  }

  function describe() {
    return LIVE_DESKTOP_DIAGNOSTIC_DESCRIPTOR;
  }

  async function getStatus() {
    ensureActive();
    const state = controller.getState();
    return {
      consistency: state.consistency,
      desiredRevision: state.desired.revision,
      lastFailure: state.lastFailure,
      lastRefreshFailure: state.lastRefreshFailure,
      phase: state.phase,
      runtime: {
        active: Boolean(state.runtimeStatus?.active),
        generation: Number(state.runtimeStatus?.generation) || 0,
        phase: state.runtimeStatus?.phase || "unknown",
        reason: state.runtimeStatus?.reason || "",
      },
    };
  }

  async function invoke(operation: unknown, params: unknown = {}): Promise<unknown> {
    ensureActive();
    const operationName = String(operation);
    switch (operationName) {
      case "state.read": {
        validateOperationParams(params, operationName, []);
        return controller.getState();
      }
      case "settings.update": {
        const input = validateOperationParams(params, operationName, ["options", "patch"]);
        return controller.updateSettings(
          validateLiveDesktopDebugSettingsPatch(Object.hasOwn(input, "patch") ? input.patch : {}),
          validateLiveDesktopRestartOptions(
            Object.hasOwn(input, "options") ? input.options : {},
            "settings.update.options ",
          ),
        );
      }
      case "runtime.apply": {
        const input = validateOperationParams(params, operationName, ["restart"]);
        return controller.applyDesired(validateLiveDesktopRestartOptions(input, "runtime.apply params "));
      }
      case "runtime.refresh": {
        validateOperationParams(params, operationName, []);
        return controller.refreshRuntime();
      }
      default:
        throw unsupportedDiagnosticOperation("live-desktop", operationName);
    }
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    await controller.dispose();
  }

  return Object.freeze({ describe, dispose, getStatus, invoke });
}
