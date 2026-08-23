import { DiagnosticError, unsupportedDiagnosticOperation } from "./diagnosticError.js";
import type { DiagnosticAdapter, DiagnosticParams, DiagnosticToolDescriptor } from "./diagnosticProtocol.js";

const RENDER_DIAGNOSTIC_DESCRIPTOR = Object.freeze({
  descriptionKey: "diagnostics.tools.render.description",
  id: "render",
  operations: Object.freeze([
    { id: "probe.arm", mutatesState: true, resultSize: "small" },
    { id: "probe.disarm", mutatesState: true, resultSize: "small" },
    { id: "probe.clear", mutatesState: true, resultSize: "small" },
    { id: "probe.freeze", mutatesState: true, resultSize: "small" },
    { id: "capture.manual", mutatesState: true, resultSize: "large" },
    { id: "capture.inspect", mutatesState: false, resultSize: "large" },
    { id: "report.summary", mutatesState: false, resultSize: "small" },
    { id: "report.read", mutatesState: false, resultSize: "large" },
    { id: "report.export", mutatesState: false, resultSize: "large" },
    { id: "folder-visual.snapshot", mutatesState: false, resultSize: "medium" },
    { id: "performance.snapshot", mutatesState: false, resultSize: "small" },
  ] as const),
  titleKey: "diagnostics.tools.render.title",
  version: 1,
} as const) satisfies DiagnosticToolDescriptor;

type UnknownRecord = Record<string, unknown>;

interface RenderProbeSummary extends UnknownRecord {
  activeSession?: Readonly<{ frozenReason?: unknown; status?: unknown }> | null;
  config?: Readonly<{ enabled?: unknown }>;
  lastSession?: Readonly<{ frozenReason?: unknown; status?: unknown }> | null;
}

interface RenderProbe {
  readonly commands: Readonly<{
    arm(params: DiagnosticParams): unknown | Promise<unknown>;
    capture(label: string): unknown | Promise<unknown>;
    clear(): unknown;
    disarm(): unknown | Promise<unknown>;
    exportJson(space: number): string;
    freeze(reason: string): unknown | Promise<unknown>;
    inspect(label: string): unknown | Promise<unknown>;
    snapshot(): unknown | Promise<unknown>;
    summary(): RenderProbeSummary | Promise<RenderProbeSummary>;
  }>;
  destroy(): unknown | Promise<unknown>;
}

export type RenderDiagnosticAdapter = DiagnosticAdapter;

interface RenderDiagnosticAdapterOptions {
  readonly getFolderVisualSnapshot?: (() => unknown | Promise<unknown>) | null;
  readonly getPerformanceSnapshot?: (() => unknown | Promise<unknown>) | null;
  readonly probe?: unknown;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requireParams(value: unknown, operation: string): DiagnosticParams {
  const record = asRecord(value);
  if (record) return record;
  throw new DiagnosticError("diagnostic-params-invalid", `${operation} params must be an object`, {
    details: { receivedType: Array.isArray(value) ? "array" : typeof value },
    nextActions: ["Call describe(toolId) to inspect the operation paramsSchema"],
  });
}

function requireProbe(probe: unknown): asserts probe is RenderProbe {
  const probeRecord = asRecord(probe);
  const commands = asRecord(probeRecord?.commands);
  if (!probeRecord || !commands) {
    throw new TypeError("Render diagnostic adapter requires a probe with commands");
  }
  for (const method of ["arm", "capture", "clear", "disarm", "exportJson", "freeze", "inspect", "snapshot", "summary"]) {
    if (typeof commands[method] !== "function") {
      throw new TypeError(`Render diagnostic adapter requires probe.commands.${method}()`);
    }
  }
  if (typeof probeRecord.destroy !== "function") {
    throw new TypeError("Render diagnostic adapter requires probe.destroy()");
  }
}

export function createRenderDiagnosticAdapter(
  options: RenderDiagnosticAdapterOptions = {},
): RenderDiagnosticAdapter {
  const probe = options.probe;
  const getFolderVisualSnapshot = options.getFolderVisualSnapshot || null;
  const getPerformanceSnapshot = options.getPerformanceSnapshot || null;
  let disposed = false;
  requireProbe(probe);
  const checkedProbe: RenderProbe = probe;
  const commands = checkedProbe.commands;

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("diagnostic-tool-disposed", "The render diagnostic tool has been disposed", {
        nextActions: ["Wait for the runtime to reinstall the diagnostic entry point"],
      });
    }
  }

  function describe() {
    return RENDER_DIAGNOSTIC_DESCRIPTOR;
  }

  async function getStatus() {
    ensureActive();
    const summary = await commands.summary();
    const config = summary?.config || {};
    const session = summary?.activeSession || summary?.lastSession || null;
    const state = !config.enabled
      ? "disabled"
      : summary?.activeSession?.status === "active"
        ? "capturing"
        : session?.frozenReason
          ? "frozen"
          : "armed";
    return {
      config,
      state,
      summary,
    };
  }

  async function invoke(operation: string, paramsValue: unknown = {}) {
    ensureActive();
    const params = requireParams(paramsValue, operation);
    switch (operation) {
      case "probe.arm":
        return commands.arm(params);
      case "probe.disarm":
        return commands.disarm();
      case "probe.clear":
        commands.clear();
        return commands.summary();
      case "probe.freeze":
        return commands.freeze(String(params.reason || "manual"));
      case "capture.manual":
        return commands.capture(String(params.label || "manual"));
      case "capture.inspect":
        return commands.inspect(String(params.label || "manual"));
      case "report.summary":
        return commands.summary();
      case "report.read":
        return commands.snapshot();
      case "report.export": {
        const space = Number.isFinite(Number(params.space)) ? Number(params.space) : 2;
        return {
          content: commands.exportJson(space),
          format: "json",
          mediaType: "application/json",
        };
      }
      case "folder-visual.snapshot":
        if (typeof getFolderVisualSnapshot !== "function") {
          throw new DiagnosticError("diagnostic-capability-unavailable", "The folder visual-state snapshot is currently unavailable", {
            nextActions: ["Confirm the Pixi desktop layer is mounted"],
          });
        }
        return getFolderVisualSnapshot();
      case "performance.snapshot":
        if (typeof getPerformanceSnapshot !== "function") {
          throw new DiagnosticError("diagnostic-capability-unavailable", "Runtime performance metrics are currently unavailable", {
            nextActions: ["Confirm the Pixi desktop layer is mounted"],
          });
        }
        return getPerformanceSnapshot();
      default:
        throw unsupportedDiagnosticOperation("render", operation);
    }
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    await checkedProbe.destroy();
  }

  return Object.freeze({ describe, dispose, getStatus, invoke });
}
