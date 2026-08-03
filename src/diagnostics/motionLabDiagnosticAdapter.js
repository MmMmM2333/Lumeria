import { DiagnosticError, unsupportedDiagnosticOperation } from "./diagnosticError.js";
import {
  DEFAULT_MOTION_LAB_PARAMS,
  MOTION_LAB_EASE_OPTIONS,
  MOTION_LAB_INTERRUPT_OPTIONS,
  MOTION_LAB_NUMERIC_PARAM_RANGES,
  normalizeMotionLabParams,
} from "../motionLab/motionLabParams.js";

const MOTION_LAB_EXPORT_FORMATS = Object.freeze(["compare", "focused", "report", "trace", "trace-diff"]);

const MOTION_LAB_PARAM_SCHEMA_PROPERTIES = Object.freeze({
  ...Object.fromEntries(Object.entries(MOTION_LAB_NUMERIC_PARAM_RANGES).map(([name, range]) => [
    name,
    Object.freeze({ maximum: range.maximum, minimum: range.minimum, type: "number" }),
  ])),
  ease: Object.freeze({ enum: MOTION_LAB_EASE_OPTIONS }),
  interruptPolicy: Object.freeze({ enum: MOTION_LAB_INTERRUPT_OPTIONS }),
});

const EMPTY_PARAMS_SCHEMA = Object.freeze({ additionalProperties: false, type: "object" });

const MOTION_LAB_DIAGNOSTIC_DESCRIPTOR = Object.freeze({
  descriptionKey: "diagnostics.tools.motion-lab.description",
  id: "motion-lab",
  operations: Object.freeze([
    { id: "state.read", mutatesState: false, paramsSchema: EMPTY_PARAMS_SCHEMA, resultSize: "medium" },
    {
      id: "scenario.select",
      mutatesState: true,
      paramsSchema: {
        additionalProperties: false,
        properties: { scenarioId: { minLength: 1, type: "string" } },
        required: ["scenarioId"],
        type: "object",
      },
      resultSize: "small",
    },
    {
      id: "scenario.run",
      mutatesState: true,
      paramsSchema: {
        additionalProperties: false,
        properties: { scenarioId: { minLength: 1, type: "string" } },
        type: "object",
      },
      resultSize: "large",
    },
    { id: "scene.reset", mutatesState: true, paramsSchema: EMPTY_PARAMS_SCHEMA, resultSize: "small" },
    {
      id: "params.update",
      mutatesState: true,
      paramsSchema: {
        additionalProperties: false,
        properties: {
          patch: {
            additionalProperties: false,
            properties: MOTION_LAB_PARAM_SCHEMA_PROPERTIES,
            type: "object",
          },
        },
        required: ["patch"],
        type: "object",
      },
      resultSize: "small",
    },
    {
      id: "preset.apply",
      mutatesState: true,
      paramsSchema: {
        additionalProperties: false,
        properties: { presetId: { minLength: 1, type: "string" } },
        required: ["presetId"],
        type: "object",
      },
      resultSize: "small",
    },
    { id: "replay.capture", mutatesState: true, paramsSchema: EMPTY_PARAMS_SCHEMA, resultSize: "large" },
    { id: "baseline.save", mutatesState: true, paramsSchema: EMPTY_PARAMS_SCHEMA, resultSize: "large" },
    {
      id: "compare.run",
      mutatesState: true,
      paramsSchema: {
        additionalProperties: false,
        properties: { mode: { enum: ["baseline", "last"] } },
        required: ["mode"],
        type: "object",
      },
      resultSize: "large",
    },
    {
      id: "export.read",
      mutatesState: false,
      paramsSchema: {
        additionalProperties: false,
        properties: { format: { enum: MOTION_LAB_EXPORT_FORMATS } },
        required: ["format"],
        type: "object",
      },
      resultSize: "large",
    },
  ]),
  titleKey: "diagnostics.tools.motion-lab.title",
  version: 1,
});

function requirePort(port) {
  for (const method of [
    "applyPreset",
    "captureReplay",
    "compare",
    "exportData",
    "readState",
    "reset",
    "runScenario",
    "saveBaseline",
    "selectScenario",
    "status",
    "updateParams",
  ]) {
    if (typeof port?.[method] !== "function") {
      throw new TypeError(`Motion Lab diagnostic adapter requires port.${method}()`);
    }
  }
}

function requireId(value, label) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) {
    throw new DiagnosticError("diagnostic-params-invalid", `${label} must be a non-empty string`, {
      details: { [label]: value ?? null },
      nextActions: [`Call state.read to list available ${label} values`],
    });
  }
  return id;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateOperationParams(params, operation, allowedNames) {
  if (!isPlainObject(params)) {
    throw new DiagnosticError("diagnostic-params-invalid", `${operation} params must be a plain object`, {
      details: { receivedType: Array.isArray(params) ? "array" : typeof params },
      nextActions: ["Call describe(toolId) to inspect the operation paramsSchema"],
    });
  }
  const unknownNames = Object.keys(params).filter((name) => !allowedNames.includes(name));
  if (unknownNames.length) {
    throw new DiagnosticError("diagnostic-params-invalid", `${operation} contains unknown parameters`, {
      details: { unknownNames },
      nextActions: ["Call describe(toolId) to inspect the operation paramsSchema"],
    });
  }
  return params;
}

function validateParamPatch(patch) {
  if (!isPlainObject(patch)) {
    throw new DiagnosticError("diagnostic-params-invalid", "params.update requires a plain-object patch", {
      details: { patch: patch ?? null },
      nextActions: ["Pass parameters in the form { patch: { springStiffness: 120 } }"],
    });
  }
  const knownNames = Object.keys(DEFAULT_MOTION_LAB_PARAMS);
  const unknownNames = Object.keys(patch).filter((name) => !knownNames.includes(name));
  const invalidNames = Object.keys(patch).filter((name) => {
    const value = patch[name];
    if (name === "ease") return typeof value !== "string" || !MOTION_LAB_EASE_OPTIONS.includes(value);
    if (name === "interruptPolicy") return typeof value !== "string" || !MOTION_LAB_INTERRUPT_OPTIONS.includes(value);
    return typeof value !== "number" || !Number.isFinite(value);
  });
  const normalized = normalizeMotionLabParams({ ...DEFAULT_MOTION_LAB_PARAMS, ...patch });
  const outOfRangeNames = Object.keys(patch).filter((name) => (
    knownNames.includes(name) && !invalidNames.includes(name) && normalized[name] !== patch[name]
  ));
  if (unknownNames.length || invalidNames.length || outOfRangeNames.length) {
    throw new DiagnosticError("diagnostic-params-invalid", "Motion Lab parameters contain an unknown name, invalid type, or out-of-range value", {
      details: { invalidNames, outOfRangeNames, unknownNames },
      nextActions: ["Call state.read for current parameters, then use the canonical names and ranges from the tool description"],
    });
  }
  return { ...patch };
}

async function requireAvailable(value, label) {
  const resolved = await value;
  if (resolved != null) return resolved;
  throw new DiagnosticError("diagnostic-data-unavailable", `Motion Lab currently has no available ${label}`, {
    details: { label },
    nextActions: ["Run a scenario and complete the required capture or baseline operation first"],
  });
}

export function createMotionLabDiagnosticAdapter(options = {}) {
  const port = options.port;
  let disposed = false;
  requirePort(port);

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("diagnostic-tool-disposed", "The Motion Lab diagnostic tool has been disposed", {
        nextActions: ["Reopen Motion Lab and try again"],
      });
    }
  }

  function describe() {
    return MOTION_LAB_DIAGNOSTIC_DESCRIPTOR;
  }

  async function getStatus() {
    ensureActive();
    return port.status();
  }

  async function requireKnownId(value, label, collectionName) {
    const id = requireId(value, label);
    const state = await port.readState();
    const rows = Array.isArray(state?.[collectionName]) ? state[collectionName] : [];
    const availableIds = rows.map((row) => String(row?.id || "")).filter(Boolean);
    if (!availableIds.includes(id)) {
      throw new DiagnosticError("diagnostic-params-invalid", `${label} does not exist`, {
        details: { [label]: id, availableIds },
        nextActions: [`Call state.read to list available ${label} values`],
      });
    }
    return id;
  }

  async function invoke(operation, params = {}) {
    ensureActive();
    switch (operation) {
      case "state.read": {
        validateOperationParams(params, operation, []);
        return port.readState();
      }
      case "scenario.select": {
        const input = validateOperationParams(params, operation, ["scenarioId"]);
        return port.selectScenario(await requireKnownId(input.scenarioId, "scenarioId", "scenarios"));
      }
      case "scenario.run": {
        const input = validateOperationParams(params, operation, ["scenarioId"]);
        return port.runScenario(Object.hasOwn(input, "scenarioId")
          ? await requireKnownId(input.scenarioId, "scenarioId", "scenarios")
          : null);
      }
      case "scene.reset": {
        validateOperationParams(params, operation, []);
        return port.reset();
      }
      case "params.update": {
        const input = validateOperationParams(params, operation, ["patch"]);
        return port.updateParams(validateParamPatch(input.patch));
      }
      case "preset.apply": {
        const input = validateOperationParams(params, operation, ["presetId"]);
        return port.applyPreset(await requireKnownId(input.presetId, "presetId", "presets"));
      }
      case "replay.capture": {
        validateOperationParams(params, operation, []);
        return requireAvailable(port.captureReplay(), "replay capture");
      }
      case "baseline.save": {
        validateOperationParams(params, operation, []);
        return requireAvailable(port.saveBaseline(), "baseline");
      }
      case "compare.run": {
        const input = validateOperationParams(params, operation, ["mode"]);
        const mode = typeof input.mode === "string" ? input.mode : "";
        if (!["baseline", "last"].includes(mode)) {
          throw new DiagnosticError("diagnostic-params-invalid", "compare.run mode must be baseline or last", {
            details: { mode: input.mode ?? null },
            nextActions: ["Pass { mode: \"baseline\" } or { mode: \"last\" }"],
          });
        }
        return requireAvailable(port.compare(mode), "comparison result");
      }
      case "export.read": {
        const input = validateOperationParams(params, operation, ["format"]);
        const format = typeof input.format === "string" ? input.format : "";
        if (!MOTION_LAB_EXPORT_FORMATS.includes(format)) {
          throw new DiagnosticError("diagnostic-params-invalid", "The Motion Lab export format is not supported", {
            details: { format: input.format ?? null, supportedFormats: MOTION_LAB_EXPORT_FORMATS },
            nextActions: [`Use one of: ${MOTION_LAB_EXPORT_FORMATS.join(", ")}`],
          });
        }
        return requireAvailable(port.exportData(format), `${format} export`);
      }
      default:
        throw unsupportedDiagnosticOperation("motion-lab", operation);
    }
  }

  async function dispose() {
    disposed = true;
  }

  return Object.freeze({ describe, dispose, getStatus, invoke });
}
