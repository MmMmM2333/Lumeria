import { readLaunchpadDebugValue } from "../rendering/pixi/debugNamespace.js";
import { DiagnosticError } from "./diagnosticError.js";
import {
  DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA,
  DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA,
  DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA,
  DIAGNOSTIC_RESULT_SCHEMA,
} from "./diagnosticProtocol.js";

const DEFAULT_ARTIFACT_CHUNK_SIZE = 64 * 1024;

function defaultResolveDiagnostics() {
  return readLaunchpadDebugValue("diagnostics");
}

function unwrapDiagnosticResult(result) {
  if (!result || result.schema !== DIAGNOSTIC_RESULT_SCHEMA || typeof result.ok !== "boolean") {
    throw new DiagnosticError("diagnostic-result-invalid", "诊断 Hub 返回了无效结果", {
      details: { result },
      nextActions: ["检查诊断 Hub 与客户端协议版本是否一致"],
    });
  }
  if (result.ok) return result.data;
  throw new DiagnosticError(
    result.error?.code || "diagnostic-operation-failed",
    result.error?.message || "诊断操作失败",
    {
      details: result.error?.details ?? null,
      nextActions: result.error?.nextActions || [],
    },
  );
}

export function isDiagnosticArtifactDelivery(value) {
  return Boolean(
    value
    && value.schema === DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA
    && value.delivery === "artifact"
    && value.artifact?.schema === DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA
    && String(value.artifact.artifactId || "").trim(),
  );
}

function requireArtifactReference(value) {
  if (isDiagnosticArtifactDelivery(value)) return value.artifact;
  if (
    value
    && value.schema === DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA
    && String(value.artifactId || "").trim()
  ) {
    return value;
  }
  throw new DiagnosticError("diagnostic-artifact-delivery-invalid", "诊断操作没有返回有效的制品引用", {
    details: { value },
    nextActions: ["确认该操作的 resultSize 为 large，并检查 Hub 与客户端协议版本"],
  });
}

function normalizeChunkSize(value) {
  const size = value == null ? DEFAULT_ARTIFACT_CHUNK_SIZE : Number(value);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new DiagnosticError("diagnostic-artifact-chunk-size-invalid", "诊断制品 chunkSize 必须是正整数", {
      details: { chunkSize: value },
      nextActions: ["使用大于 0 的 chunkSize"],
    });
  }
  return size;
}

function invalidArtifactPage(message, details = {}) {
  return new DiagnosticError("diagnostic-artifact-page-invalid", message, {
    details,
    nextActions: ["检查诊断 Hub 与客户端的制品分页协议版本"],
  });
}

export function createDiagnosticClient(options = {}) {
  const resolveDiagnostics = typeof options.resolveDiagnostics === "function"
    ? options.resolveDiagnostics
    : defaultResolveDiagnostics;

  function requireMethod(method) {
    const diagnostics = resolveDiagnostics();
    if (!diagnostics) {
      throw new DiagnosticError("diagnostics-hub-unavailable", "诊断 Hub 尚未安装", {
        nextActions: ["确认 Pixi Desktop Surface 已挂载并重试"],
      });
    }
    if (typeof diagnostics[method] !== "function") {
      throw new DiagnosticError("diagnostics-client-method-unavailable", `诊断 Hub 不支持 ${method}`, {
        details: { method },
        nextActions: ["检查诊断 Hub 与客户端协议版本是否一致"],
      });
    }
    return diagnostics;
  }

  async function describe(toolId) {
    const diagnostics = requireMethod("describe");
    return unwrapDiagnosticResult(await diagnostics.describe(toolId));
  }

  async function invoke(toolId, operation, params = {}) {
    const diagnostics = requireMethod("invoke");
    return unwrapDiagnosticResult(await diagnostics.invoke({ operation, params, toolId }));
  }

  async function queryArtifact(request = {}) {
    const diagnostics = requireMethod("queryArtifact");
    return unwrapDiagnosticResult(await diagnostics.queryArtifact(request));
  }

  async function releaseArtifact(artifactOrId) {
    const artifactId = typeof artifactOrId === "string"
      ? artifactOrId.trim()
      : requireArtifactReference(artifactOrId).artifactId;
    if (!artifactId) {
      throw new DiagnosticError("diagnostic-artifact-id-invalid", "释放诊断制品需要非空 artifactId", {
        nextActions: ["使用 invoke 返回的制品引用"],
      });
    }
    const diagnostics = requireMethod("releaseArtifact");
    return unwrapDiagnosticResult(await diagnostics.releaseArtifact(artifactId));
  }

  async function collectArtifactText(artifactInput, options, representation) {
    const artifact = requireArtifactReference(artifactInput);
    const artifactId = artifact.artifactId;
    const limit = normalizeChunkSize(options.chunkSize);
    const path = options.path == null ? [] : options.path;
    const chunks = [];
    let offset = 0;
    while (true) {
      const page = await queryArtifact({ artifactId, limit, offset, path, representation });
      if (!page || page.schema !== DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA) {
        throw invalidArtifactPage("诊断 Hub 返回了无效的制品页 schema", { artifactId, page });
      }
      if (page.artifactId !== artifactId || page.representation !== representation || typeof page.text !== "string") {
        throw invalidArtifactPage("诊断 Hub 返回了与请求不匹配的制品页", {
          artifactId,
          pageArtifactId: page.artifactId,
          representation: page.representation,
        });
      }
      const pageInfo = page.page;
      if (
        !pageInfo
        || pageInfo.offset !== offset
        || !Number.isSafeInteger(pageInfo.nextOffset)
        || pageInfo.nextOffset < offset
        || pageInfo.returned !== page.text.length
      ) {
        throw invalidArtifactPage("诊断制品分页游标无效", { artifactId, page: pageInfo });
      }
      chunks.push(page.text);
      if (!pageInfo.hasMore) return chunks.join("");
      if (pageInfo.nextOffset <= offset) {
        throw invalidArtifactPage("诊断制品分页游标没有前进", { artifactId, page: pageInfo });
      }
      offset = pageInfo.nextOffset;
    }
  }

  async function readArtifactText(artifactInput, options = {}) {
    return collectArtifactText(artifactInput, options, "text");
  }

  async function readArtifactJsonText(artifactInput, options = {}) {
    return collectArtifactText(artifactInput, options, "json");
  }

  async function readArtifactValue(artifactInput, options = {}) {
    const artifact = requireArtifactReference(artifactInput);
    const content = await readArtifactJsonText(artifact, options);
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new DiagnosticError("diagnostic-artifact-json-invalid", "诊断制品的 JSON 内容无法解析", {
        cause: error,
        details: { artifactId: artifact.artifactId, reason: String(error?.message || error) },
        nextActions: ["检查制品是否在读取期间被错误修改，并重试诊断操作"],
      });
    }
  }

  async function consumeArtifact(artifactInput, reader) {
    const artifact = requireArtifactReference(artifactInput);
    let value;
    let readError = null;
    let releaseError = null;
    try {
      value = await reader(artifact);
    } catch (error) {
      readError = error;
    }
    try {
      await releaseArtifact(artifact);
    } catch (error) {
      releaseError = error;
    }
    if (readError && releaseError) {
      throw new DiagnosticError("diagnostic-artifact-consume-failed", "读取诊断制品失败，且随后释放制品也失败", {
        cause: readError,
        details: {
          artifactId: artifact.artifactId,
          readError: { code: readError?.code || null, message: String(readError?.message || readError) },
          releaseError: { code: releaseError?.code || null, message: String(releaseError?.message || releaseError) },
        },
        nextActions: ["保留两个错误详情并检查诊断 Hub 生命周期"],
      });
    }
    if (readError) throw readError;
    if (releaseError) throw releaseError;
    return value;
  }

  async function consumeArtifactText(artifactInput, options = {}) {
    return consumeArtifact(artifactInput, (artifact) => readArtifactText(artifact, options));
  }

  async function consumeArtifactValue(artifactInput, options = {}) {
    return consumeArtifact(artifactInput, (artifact) => readArtifactValue(artifact, options));
  }

  return Object.freeze({
    consumeArtifactText,
    consumeArtifactValue,
    describe,
    invoke,
    queryArtifact,
    readArtifactJsonText,
    readArtifactText,
    readArtifactValue,
    releaseArtifact,
  });
}

export const diagnosticClient = createDiagnosticClient();
