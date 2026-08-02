import { DiagnosticError, unsupportedDiagnosticOperation } from "./diagnosticError.js";
import { sceneDiagnosticsState } from "./sceneDiagnosticsState.js";

const SCENE_DIAGNOSTIC_DESCRIPTOR = Object.freeze({
  descriptionKey: "diagnostics.tools.scene.description",
  id: "scene",
  operations: Object.freeze([
    { id: "state.read", mutatesState: false, resultSize: "medium" },
    { id: "state.clear", mutatesState: true, resultSize: "small" },
    { id: "folder-handoff.configure", mutatesState: true, resultSize: "small" },
  ]),
  titleKey: "diagnostics.tools.scene.title",
  version: 1,
});

function requireState(state) {
  for (const method of ["clear", "configureFolderHandoff", "reset", "snapshot", "status"]) {
    if (typeof state?.[method] !== "function") {
      throw new TypeError(`Scene diagnostic adapter requires state.${method}()`);
    }
  }
}

export function createSceneDiagnosticAdapter(options = {}) {
  const state = options.state || sceneDiagnosticsState;
  let disposed = false;
  requireState(state);

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("diagnostic-tool-disposed", "Scene 诊断工具已经释放", {
        nextActions: ["等待 Pixi 桌面表面重新安装诊断入口"],
      });
    }
  }

  function describe() {
    return SCENE_DIAGNOSTIC_DESCRIPTOR;
  }

  async function getStatus() {
    ensureActive();
    return state.status();
  }

  async function invoke(operation, params = {}) {
    ensureActive();
    switch (operation) {
      case "state.read":
        return state.snapshot();
      case "state.clear":
        return state.clear(params.channel ?? null);
      case "folder-handoff.configure": {
        if (typeof params.enabled !== "boolean") {
          throw new DiagnosticError("diagnostic-params-invalid", "folder-handoff.configure 需要布尔 enabled 参数", {
            details: { enabled: params.enabled ?? null },
            nextActions: ["传入 { enabled: true } 启用，或 { enabled: false } 停用"],
          });
        }
        const { enabled, ...config } = params;
        return state.configureFolderHandoff(enabled ? config : false);
      }
      default:
        throw unsupportedDiagnosticOperation("scene", operation);
    }
  }

  async function dispose() {
    if (disposed) return;
    state.reset();
    disposed = true;
  }

  return Object.freeze({ describe, dispose, getStatus, invoke });
}
