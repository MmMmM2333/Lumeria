import { DiagnosticError, makeDiagnosticErrorPayload } from "./diagnosticError.js";
import { localizeDiagnosticDescriptor } from "./diagnosticMessages.js";
import {
  DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA,
  DIAGNOSTIC_RESULT_SCHEMA,
} from "./diagnosticProtocol.js";
import type {
  DiagnosticAdapter,
  DiagnosticArtifactStore,
  DiagnosticInvocationContext,
  DiagnosticOperationDescriptor,
  DiagnosticResult,
  DiagnosticToolDescriptor,
} from "./diagnosticProtocol.js";

export { DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA, DIAGNOSTIC_RESULT_SCHEMA };

type UnknownRecord = Record<string, unknown>;

interface DiagnosticHubOptions {
  readonly adapters?: readonly unknown[];
  readonly artifactStore?: unknown;
  readonly now?: () => unknown;
}

interface ValidatedDiagnosticAdapter {
  describe(): unknown;
  dispose(): unknown | Promise<unknown>;
  getStatus(): unknown | Promise<unknown>;
  invoke(operation: string, params?: unknown, context?: DiagnosticInvocationContext): unknown | Promise<unknown>;
}

interface ValidatedArtifactStore {
  create(value: unknown, metadata?: unknown): unknown | Promise<unknown>;
  dispose(): unknown | Promise<unknown>;
  query(request?: unknown): unknown | Promise<unknown>;
  release(artifactId: unknown): unknown | Promise<unknown>;
}

interface NormalizedTool {
  readonly adapter: ValidatedDiagnosticAdapter;
  readonly descriptor: DiagnosticToolDescriptor;
  readonly operationIds: ReadonlySet<string>;
  readonly operationsById: ReadonlyMap<string, DiagnosticOperationDescriptor>;
}

interface DiagnosticResultInput {
  readonly operation: string;
  readonly requestId: string;
  readonly toolId?: string | null;
}

export interface DiagnosticHub {
  describe(toolId: unknown, input?: unknown): Promise<DiagnosticResult>;
  dispose(input?: unknown): Promise<DiagnosticResult>;
  invoke(request?: unknown): Promise<DiagnosticResult>;
  listTools(input?: unknown): Promise<DiagnosticResult>;
  queryArtifact(request?: unknown): Promise<DiagnosticResult>;
  releaseArtifact(artifactId: unknown, input?: unknown): Promise<DiagnosticResult>;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requireRequest(value: unknown, label: string): UnknownRecord {
  const record = asRecord(value);
  if (record) return record;
  throw new DiagnosticError("diagnostic-params-invalid", `${label} must be an object`, {
    details: { receivedType: Array.isArray(value) ? "array" : typeof value },
    nextActions: ["Call describe(toolId) to inspect the diagnostic request shape"],
  });
}

function errorMessage(error: unknown): string {
  return String(asRecord(error)?.message || error);
}

function clonePlain<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeDescriptor(adapterInput: unknown): NormalizedTool {
  const adapterRecord = asRecord(adapterInput);
  if (!adapterRecord) {
    throw new TypeError("DiagnosticHub adapters must be objects");
  }
  for (const method of ["describe", "getStatus", "invoke", "dispose"]) {
    if (typeof adapterRecord[method] !== "function") {
      throw new TypeError(`DiagnosticHub adapter requires ${method}()`);
    }
  }
  const adapter: ValidatedDiagnosticAdapter = {
    describe: () => Reflect.apply(adapterRecord.describe as Function, adapterInput, []),
    dispose: () => Reflect.apply(adapterRecord.dispose as Function, adapterInput, []),
    getStatus: () => Reflect.apply(adapterRecord.getStatus as Function, adapterInput, []),
    invoke: (operation, params, context) => Reflect.apply(adapterRecord.invoke as Function, adapterInput, [operation, params, context]),
  };
  const descriptorValue = adapter.describe();
  const descriptorRecord = asRecord(descriptorValue);
  if (!descriptorRecord) {
    throw new TypeError("DiagnosticHub adapter describe() must return an object");
  }
  const id = String(descriptorRecord.id || "").trim();
  if (!id) throw new TypeError("DiagnosticHub tool descriptors require a non-empty id");
  if (!Array.isArray(descriptorRecord.operations)) {
    throw new TypeError(`DiagnosticHub tool ${id} requires an operations array`);
  }
  const operationIds = new Set<string>();
  const operationsById = new Map<string, DiagnosticOperationDescriptor>();
  const operations = descriptorRecord.operations.map((operationValue: unknown) => {
    const operation = asRecord(operationValue);
    if (!operation) throw new TypeError(`DiagnosticHub tool ${id} has an invalid operation descriptor`);
    const operationId = String(operation?.id || "").trim();
    if (!operationId) throw new TypeError(`DiagnosticHub tool ${id} has an operation without an id`);
    if (operationIds.has(operationId)) {
      throw new TypeError(`DiagnosticHub tool ${id} has duplicate operation ${operationId}`);
    }
    operationIds.add(operationId);
    const resultSize = operation.resultSize;
    if (resultSize !== "small" && resultSize !== "medium" && resultSize !== "large") {
      throw new TypeError(`DiagnosticHub tool ${id} operation ${operationId} has an invalid resultSize`);
    }
    const normalizedOperation: DiagnosticOperationDescriptor = {
      ...clonePlain(operation),
      id: operationId,
      mutatesState: Boolean(operation.mutatesState),
      resultSize,
    };
    operationsById.set(operationId, normalizedOperation);
    return normalizedOperation;
  });
  return {
    adapter,
    descriptor: {
      ...(clonePlain(descriptorRecord) as UnknownRecord),
      id,
      operations,
      version: Number(descriptorRecord.version || 1),
    },
    operationIds,
    operationsById,
  };
}

function normalizeGeneratedAt(now: () => unknown): string {
  const value = now();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function createDiagnosticHub(options: DiagnosticHubOptions = {}): DiagnosticHub {
  const adapters = Array.isArray(options.adapters) ? options.adapters : [];
  const artifactStore = options.artifactStore || null;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const tools = new Map<string, NormalizedTool>();
  let requestSequence = 0;
  let disposed = false;

  for (const adapter of adapters) {
    const normalized = normalizeDescriptor(adapter);
    const id = normalized.descriptor.id;
    if (tools.has(id)) throw new TypeError(`DiagnosticHub received duplicate tool id ${id}`);
    tools.set(id, normalized);
  }

  function requestIdFrom(input: UnknownRecord): string {
    const value = String(input.requestId || "").trim();
    if (value) return value;
    requestSequence += 1;
    return `diagnostic-${requestSequence}`;
  }

  function resultBase({ operation, requestId, toolId = null }: DiagnosticResultInput) {
    return {
      generatedAt: normalizeGeneratedAt(now),
      operation,
      requestId,
      schema: DIAGNOSTIC_RESULT_SCHEMA,
      toolId,
    };
  }

  function success<Data>(input: DiagnosticResultInput, data: Data): DiagnosticResult<Data | null> {
    return {
      ...resultBase(input),
      data: data ?? null,
      ok: true,
    };
  }

  function failure(
    input: DiagnosticResultInput,
    error: unknown,
    fallback: Parameters<typeof makeDiagnosticErrorPayload>[1] = {},
  ): DiagnosticResult {
    return {
      ...resultBase(input),
      error: makeDiagnosticErrorPayload(error, fallback),
      ok: false,
    };
  }

  function disposedFailure(input: DiagnosticResultInput): DiagnosticResult {
    return failure(
      input,
      new DiagnosticError("diagnostic-hub-disposed", "The diagnostic entry point has been disposed", {
        nextActions: ["Wait for the runtime to reinstall the diagnostic entry point"],
      }),
    );
  }

  function missingToolFailure(input: DiagnosticResultInput, toolId: string): DiagnosticResult {
    return failure(
      input,
      new DiagnosticError("diagnostic-tool-not-found", `Diagnostic tool not found: ${toolId || "(empty)"}`, {
        details: { toolId: toolId || null },
        nextActions: ["Call listTools() to get the currently available tools"],
      }),
    );
  }

  async function listTools(inputValue: unknown = {}): Promise<DiagnosticResult> {
    const input = requireRequest(inputValue, "Diagnostic tool-list request");
    const requestId = requestIdFrom(input);
    const resultInput = { operation: "tools.list", requestId };
    if (disposed) return disposedFailure(resultInput);
    try {
      return success(resultInput, {
        tools: Array.from(tools.values(), ({ descriptor }) => localizeDiagnosticDescriptor(
          clonePlain(descriptor),
          { locale: input.locale },
        )),
      });
    } catch (error) {
      return failure(resultInput, error, {
        code: "diagnostic-tool-list-failed",
        message: "Failed to read the diagnostic tool list",
      });
    }
  }

  async function describe(toolId: unknown, inputValue: unknown = {}): Promise<DiagnosticResult> {
    const input = requireRequest(inputValue, "Diagnostic describe request");
    const normalizedToolId = String(toolId || "").trim();
    const requestId = requestIdFrom(input);
    const resultInput = { operation: "tool.describe", requestId, toolId: normalizedToolId || null };
    if (disposed) return disposedFailure(resultInput);
    const tool = tools.get(normalizedToolId);
    if (!tool) return missingToolFailure(resultInput, normalizedToolId);
    try {
      const status = await tool.adapter.getStatus();
      return success(resultInput, {
        status: clonePlain(status),
        tool: localizeDiagnosticDescriptor(clonePlain(tool.descriptor), { locale: input.locale }),
      });
    } catch (error) {
      return failure(resultInput, error, {
        code: "diagnostic-status-failed",
        message: `Failed to read diagnostic tool ${normalizedToolId} state`,
        nextActions: ["Check whether the runtime is still available", "Retry describe(toolId) later"],
      });
    }
  }

  async function invoke(requestValue: unknown = {}): Promise<DiagnosticResult> {
    const request = requireRequest(requestValue, "Diagnostic invoke request");
    const requestId = requestIdFrom(request);
    const toolId = String(request.toolId || "").trim();
    const operation = String(request.operation || "").trim();
    const resultInput = { operation: operation || "tool.invoke", requestId, toolId: toolId || null };
    if (disposed) return disposedFailure(resultInput);
    const tool = tools.get(toolId);
    if (!tool) return missingToolFailure(resultInput, toolId);
    if (!tool.operationIds.has(operation)) {
      return failure(
        resultInput,
        new DiagnosticError(
          "diagnostic-operation-not-supported",
          `Diagnostic tool ${toolId} does not support operation ${operation || "(empty)"}`,
          {
            details: { operation: operation || null, toolId },
            nextActions: ["Call describe(toolId) to inspect supported operations"],
          },
        ),
      );
    }
    const operationDescriptor = tool.operationsById.get(operation);
    if (!operationDescriptor) {
      return failure(resultInput, new DiagnosticError("diagnostic-operation-not-supported", "The diagnostic operation descriptor is unavailable"));
    }
    const usesArtifactDelivery = operationDescriptor.resultSize === "large";
    const artifactStoreRecord = asRecord(artifactStore);
    if (usesArtifactDelivery && (!artifactStoreRecord || typeof artifactStoreRecord.create !== "function")) {
      return unavailableArtifactStore(resultInput);
    }
    try {
      const context: DiagnosticInvocationContext = {
        generatedAt: normalizeGeneratedAt(now),
        requestId,
        toolId,
      };
      const data = await tool.adapter.invoke(operation, request.params ?? {}, context);
      if (usesArtifactDelivery) {
        if (!artifactStoreRecord || typeof artifactStoreRecord.create !== "function") {
          return unavailableArtifactStore(resultInput);
        }
        const createArtifact = artifactStoreRecord.create as Function;
        const artifact = await Reflect.apply(createArtifact, artifactStore, [data, {
          mediaType: typeof asRecord(data)?.mediaType === "string" ? asRecord(data)?.mediaType : "application/json",
          source: { operation, requestId, toolId },
        }]);
        return success(resultInput, {
          artifact,
          delivery: "artifact",
          schema: DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA,
        });
      }
      return success(resultInput, clonePlain(data));
    } catch (error) {
      return failure(resultInput, error, {
        code: "diagnostic-operation-failed",
        message: `Diagnostic operation ${toolId}.${operation} failed`,
        nextActions: ["Inspect the error details and current tool state", "Correct the parameters and retry with a new requestId"],
      });
    }
  }

  function unavailableArtifactStore(resultInput: DiagnosticResultInput): DiagnosticResult {
    return failure(
      resultInput,
      new DiagnosticError("diagnostic-artifact-store-unavailable", "The diagnostic artifact store is not configured", {
        nextActions: ["Wait for the runtime to install the diagnostic artifact store, then retry"],
      }),
    );
  }

  async function queryArtifact(requestValue: unknown = {}): Promise<DiagnosticResult> {
    const request = requireRequest(requestValue, "Diagnostic artifact query");
    const requestId = requestIdFrom(request);
    const resultInput = { operation: "artifact.query", requestId };
    if (disposed) return disposedFailure(resultInput);
    const artifactStoreRecord = asRecord(artifactStore);
    if (!artifactStoreRecord || typeof artifactStoreRecord.query !== "function") return unavailableArtifactStore(resultInput);
    try {
      return success(resultInput, clonePlain(await Reflect.apply(
        artifactStoreRecord.query as Function,
        artifactStore,
        [request],
      )));
    } catch (error) {
      return failure(resultInput, error, {
        code: "diagnostic-artifact-query-failed",
        message: "Failed to read the diagnostic artifact",
      });
    }
  }

  async function releaseArtifact(artifactId: unknown, inputValue: unknown = {}): Promise<DiagnosticResult> {
    const input = requireRequest(inputValue, "Diagnostic artifact release request");
    const requestId = requestIdFrom(input);
    const resultInput = { operation: "artifact.release", requestId };
    if (disposed) return disposedFailure(resultInput);
    const artifactStoreRecord = asRecord(artifactStore);
    if (!artifactStoreRecord || typeof artifactStoreRecord.release !== "function") return unavailableArtifactStore(resultInput);
    try {
      return success(resultInput, clonePlain(await Reflect.apply(
        artifactStoreRecord.release as Function,
        artifactStore,
        [artifactId],
      )));
    } catch (error) {
      return failure(resultInput, error, {
        code: "diagnostic-artifact-release-failed",
        message: "Failed to release the diagnostic artifact",
      });
    }
  }

  async function dispose(inputValue: unknown = {}): Promise<DiagnosticResult> {
    const input = requireRequest(inputValue, "Diagnostic Hub dispose request");
    const requestId = requestIdFrom(input);
    const resultInput = { operation: "hub.dispose", requestId };
    if (disposed) return success(resultInput, { alreadyDisposed: true });
    disposed = true;
    const releases = await Promise.allSettled([
      ...Array.from(tools.values(), ({ adapter }) => Promise.resolve().then(() => adapter.dispose())),
      ...(typeof asRecord(artifactStore)?.dispose === "function"
        ? [Promise.resolve().then(() => Reflect.apply(
          (artifactStore as UnknownRecord).dispose as Function,
          artifactStore,
          [],
        ))]
        : []),
    ]);
    const failures: { index: number; message: string }[] = [];
    releases.forEach((release, index) => {
      if (release.status === "rejected") failures.push({ index, message: errorMessage(release.reason) });
    });
    if (failures.length) {
      return failure(
        resultInput,
        new DiagnosticError("diagnostic-dispose-failed", "The diagnostic entry point was not fully disposed", {
          details: { failures },
          nextActions: ["Inspect the tool-disposal errors"],
        }),
      );
    }
    return success(resultInput, { releasedToolCount: tools.size });
  }

  return Object.freeze({
    describe,
    dispose,
    invoke,
    listTools,
    queryArtifact,
    releaseArtifact,
  });
}
