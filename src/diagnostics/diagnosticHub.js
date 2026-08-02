import { DiagnosticError, makeDiagnosticErrorPayload } from "./diagnosticError.js";
import { localizeDiagnosticDescriptor } from "./diagnosticMessages.js";
import {
  DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA,
  DIAGNOSTIC_RESULT_SCHEMA,
} from "./diagnosticProtocol.js";

export { DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA, DIAGNOSTIC_RESULT_SCHEMA };

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeDescriptor(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("DiagnosticHub adapters must be objects");
  }
  for (const method of ["describe", "getStatus", "invoke", "dispose"]) {
    if (typeof adapter[method] !== "function") {
      throw new TypeError(`DiagnosticHub adapter requires ${method}()`);
    }
  }
  const descriptor = adapter.describe();
  if (!descriptor || typeof descriptor !== "object") {
    throw new TypeError("DiagnosticHub adapter describe() must return an object");
  }
  const id = String(descriptor.id || "").trim();
  if (!id) throw new TypeError("DiagnosticHub tool descriptors require a non-empty id");
  if (!Array.isArray(descriptor.operations)) {
    throw new TypeError(`DiagnosticHub tool ${id} requires an operations array`);
  }
  const operationIds = new Set();
  const operationsById = new Map();
  const operations = descriptor.operations.map((operation) => {
    const operationId = String(operation?.id || "").trim();
    if (!operationId) throw new TypeError(`DiagnosticHub tool ${id} has an operation without an id`);
    if (operationIds.has(operationId)) {
      throw new TypeError(`DiagnosticHub tool ${id} has duplicate operation ${operationId}`);
    }
    operationIds.add(operationId);
    const normalizedOperation = { ...clonePlain(operation), id: operationId };
    operationsById.set(operationId, normalizedOperation);
    return normalizedOperation;
  });
  return {
    descriptor: { ...clonePlain(descriptor), id, operations },
    operationIds,
    operationsById,
  };
}

function normalizeGeneratedAt(now) {
  const value = now();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function createDiagnosticHub(options = {}) {
  const adapters = Array.isArray(options.adapters) ? options.adapters : [];
  const artifactStore = options.artifactStore || null;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const tools = new Map();
  let requestSequence = 0;
  let disposed = false;

  for (const adapter of adapters) {
    const normalized = normalizeDescriptor(adapter);
    const id = normalized.descriptor.id;
    if (tools.has(id)) throw new TypeError(`DiagnosticHub received duplicate tool id ${id}`);
    tools.set(id, { adapter, ...normalized });
  }

  function requestIdFrom(input) {
    const value = String(input?.requestId || "").trim();
    if (value) return value;
    requestSequence += 1;
    return `diagnostic-${requestSequence}`;
  }

  function resultBase({ operation, requestId, toolId = null }) {
    return {
      generatedAt: normalizeGeneratedAt(now),
      operation,
      requestId,
      schema: DIAGNOSTIC_RESULT_SCHEMA,
      toolId,
    };
  }

  function success(input, data) {
    return {
      ...resultBase(input),
      data: data ?? null,
      ok: true,
    };
  }

  function failure(input, error, fallback) {
    return {
      ...resultBase(input),
      error: makeDiagnosticErrorPayload(error, fallback),
      ok: false,
    };
  }

  function disposedFailure(input) {
    return failure(
      input,
      new DiagnosticError("diagnostic-hub-disposed", "诊断入口已经释放", {
        nextActions: ["等待运行时重新安装诊断入口"],
      }),
    );
  }

  function missingToolFailure(input, toolId) {
    return failure(
      input,
      new DiagnosticError("diagnostic-tool-not-found", `未找到诊断工具 ${toolId || "(empty)"}`, {
        details: { toolId: toolId || null },
        nextActions: ["调用 listTools() 获取当前可用工具"],
      }),
    );
  }

  async function listTools(input = {}) {
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
        message: "读取诊断工具列表失败",
      });
    }
  }

  async function describe(toolId, input = {}) {
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
        message: `读取诊断工具 ${normalizedToolId} 状态失败`,
        nextActions: ["检查运行时是否仍然可用", "稍后重试 describe(toolId)"],
      });
    }
  }

  async function invoke(request = {}) {
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
          `诊断工具 ${toolId} 不支持操作 ${operation || "(empty)"}`,
          {
            details: { operation: operation || null, toolId },
            nextActions: ["调用 describe(toolId) 查看工具支持的操作"],
          },
        ),
      );
    }
    const operationDescriptor = tool.operationsById.get(operation);
    const usesArtifactDelivery = operationDescriptor.resultSize === "large";
    if (usesArtifactDelivery && (!artifactStore || typeof artifactStore.create !== "function")) {
      return unavailableArtifactStore(resultInput);
    }
    try {
      const data = await tool.adapter.invoke(operation, request.params ?? {}, {
        generatedAt: normalizeGeneratedAt(now),
        requestId,
        toolId,
      });
      if (usesArtifactDelivery) {
        const artifact = await artifactStore.create(data, {
          mediaType: typeof data?.mediaType === "string" ? data.mediaType : "application/json",
          source: { operation, requestId, toolId },
        });
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
        message: `诊断操作 ${toolId}.${operation} 执行失败`,
        nextActions: ["检查错误详情与工具当前状态", "修正参数后使用新的 requestId 重试"],
      });
    }
  }

  function unavailableArtifactStore(resultInput) {
    return failure(
      resultInput,
      new DiagnosticError("diagnostic-artifact-store-unavailable", "诊断制品存储尚未配置", {
        nextActions: ["等待运行时安装诊断制品存储后重试"],
      }),
    );
  }

  async function queryArtifact(request = {}) {
    const requestId = requestIdFrom(request);
    const resultInput = { operation: "artifact.query", requestId };
    if (disposed) return disposedFailure(resultInput);
    if (!artifactStore || typeof artifactStore.query !== "function") return unavailableArtifactStore(resultInput);
    try {
      return success(resultInput, clonePlain(await artifactStore.query(request)));
    } catch (error) {
      return failure(resultInput, error, {
        code: "diagnostic-artifact-query-failed",
        message: "读取诊断制品失败",
      });
    }
  }

  async function releaseArtifact(artifactId, input = {}) {
    const requestId = requestIdFrom(input);
    const resultInput = { operation: "artifact.release", requestId };
    if (disposed) return disposedFailure(resultInput);
    if (!artifactStore || typeof artifactStore.release !== "function") return unavailableArtifactStore(resultInput);
    try {
      return success(resultInput, clonePlain(await artifactStore.release(artifactId)));
    } catch (error) {
      return failure(resultInput, error, {
        code: "diagnostic-artifact-release-failed",
        message: "释放诊断制品失败",
      });
    }
  }

  async function dispose(input = {}) {
    const requestId = requestIdFrom(input);
    const resultInput = { operation: "hub.dispose", requestId };
    if (disposed) return success(resultInput, { alreadyDisposed: true });
    disposed = true;
    const releases = await Promise.allSettled([
      ...Array.from(tools.values(), ({ adapter }) => Promise.resolve().then(() => adapter.dispose())),
      ...(typeof artifactStore?.dispose === "function"
        ? [Promise.resolve().then(() => artifactStore.dispose())]
        : []),
    ]);
    const failures = releases
      .map((release, index) => ({ index, release }))
      .filter(({ release }) => release.status === "rejected")
      .map(({ index, release }) => ({ index, message: String(release.reason?.message || release.reason) }));
    if (failures.length) {
      return failure(
        resultInput,
        new DiagnosticError("diagnostic-dispose-failed", "诊断入口释放不完整", {
          details: { failures },
          nextActions: ["检查失败的工具释放错误"],
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
