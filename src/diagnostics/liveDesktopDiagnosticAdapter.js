import { DiagnosticError, unsupportedDiagnosticOperation } from "./diagnosticError.js";
import {
  LIVE_DESKTOP_RESTART_OPTIONS_SCHEMA,
  validateLiveDesktopDebugSettingsPatch,
  validateLiveDesktopRestartOptions,
} from "./liveDesktopDebugSettings.js";

const LIVE_DESKTOP_DIAGNOSTIC_DESCRIPTOR = Object.freeze({
  descriptionKey: "diagnostics.tools.live-desktop.description",
  id: "live-desktop",
  operations: Object.freeze([
    { id: "state.read", mutatesState: false, resultSize: "medium" },
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
      resultSize: "medium",
    },
    {
      id: "runtime.apply",
      mutatesState: true,
      paramsSchema: LIVE_DESKTOP_RESTART_OPTIONS_SCHEMA,
      resultSize: "medium",
    },
    { id: "runtime.refresh", mutatesState: false, resultSize: "medium" },
  ]),
  titleKey: "diagnostics.tools.live-desktop.title",
  version: 1,
});

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateOperationParams(params, operation, allowedNames) {
  if (!isPlainObject(params)) {
    throw new DiagnosticError("diagnostic-params-invalid", `${operation} 的 params 必须是对象`, {
      details: { receivedType: Array.isArray(params) ? "array" : typeof params },
      nextActions: ["按工具描述中的 paramsSchema 传入对象参数"],
    });
  }
  const unknownNames = Object.keys(params).filter((name) => !allowedNames.includes(name));
  if (unknownNames.length) {
    throw new DiagnosticError("diagnostic-params-invalid", `${operation} 包含未知参数`, {
      details: { unknownNames },
      nextActions: ["调用 describe(toolId) 查看 paramsSchema"],
    });
  }
  return params;
}

export function createLiveDesktopDiagnosticAdapter(options = {}) {
  const controller = options.controller;
  let disposed = false;
  for (const method of ["applyDesired", "dispose", "getState", "refreshRuntime", "updateSettings"]) {
    if (typeof controller?.[method] !== "function") {
      throw new TypeError(`Live desktop diagnostic adapter requires controller.${method}()`);
    }
  }

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("diagnostic-tool-disposed", "Live Desktop 诊断工具已经释放", {
        nextActions: ["等待运行时重新安装诊断入口"],
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

  async function invoke(operation, params = {}) {
    ensureActive();
    switch (operation) {
      case "state.read": {
        validateOperationParams(params, operation, []);
        return controller.getState();
      }
      case "settings.update": {
        const input = validateOperationParams(params, operation, ["options", "patch"]);
        return controller.updateSettings(
          validateLiveDesktopDebugSettingsPatch(Object.hasOwn(input, "patch") ? input.patch : {}),
          validateLiveDesktopRestartOptions(
            Object.hasOwn(input, "options") ? input.options : {},
            "settings.update.options ",
          ),
        );
      }
      case "runtime.apply": {
        const input = validateOperationParams(params, operation, ["restart"]);
        return controller.applyDesired(validateLiveDesktopRestartOptions(input, "runtime.apply params "));
      }
      case "runtime.refresh": {
        validateOperationParams(params, operation, []);
        return controller.refreshRuntime();
      }
      default:
        throw unsupportedDiagnosticOperation("live-desktop", operation);
    }
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    await controller.dispose();
  }

  return Object.freeze({ describe, dispose, getStatus, invoke });
}
