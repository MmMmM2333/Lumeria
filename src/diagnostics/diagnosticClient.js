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
    throw new DiagnosticError("diagnostic-result-invalid", "The diagnostic Hub returned an invalid result", {
      details: { result },
      nextActions: ["Check that the diagnostic Hub and client protocol versions match"],
    });
  }
  if (result.ok) return result.data;
  throw new DiagnosticError(
    result.error?.code || "diagnostic-operation-failed",
    result.error?.message || "Diagnostic operation failed",
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
  throw new DiagnosticError("diagnostic-artifact-delivery-invalid", "The diagnostic operation did not return a valid artifact reference", {
    details: { value },
    nextActions: ["Confirm the operation resultSize is large and check the Hub and client protocol versions"],
  });
}

function normalizeChunkSize(value) {
  const size = value == null ? DEFAULT_ARTIFACT_CHUNK_SIZE : Number(value);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new DiagnosticError("diagnostic-artifact-chunk-size-invalid", "Diagnostic artifact chunkSize must be a positive integer", {
      details: { chunkSize: value },
      nextActions: ["Use a chunkSize greater than 0"],
    });
  }
  return size;
}

function invalidArtifactPage(message, details = {}) {
  return new DiagnosticError("diagnostic-artifact-page-invalid", message, {
    details,
    nextActions: ["Check the diagnostic Hub and client artifact-pagination protocol versions"],
  });
}

export function createDiagnosticClient(options = {}) {
  const resolveDiagnostics = typeof options.resolveDiagnostics === "function"
    ? options.resolveDiagnostics
    : defaultResolveDiagnostics;

  function requireMethod(method) {
    const diagnostics = resolveDiagnostics();
    if (!diagnostics) {
      throw new DiagnosticError("diagnostics-hub-unavailable", "The diagnostic Hub is not installed", {
        nextActions: ["Confirm the Pixi Desktop Surface is mounted, then retry"],
      });
    }
    if (typeof diagnostics[method] !== "function") {
      throw new DiagnosticError("diagnostics-client-method-unavailable", `The diagnostic Hub does not support ${method}`, {
        details: { method },
        nextActions: ["Check that the diagnostic Hub and client protocol versions match"],
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
      throw new DiagnosticError("diagnostic-artifact-id-invalid", "Releasing a diagnostic artifact requires a non-empty artifactId", {
        nextActions: ["Use the artifact reference returned by invoke"],
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
        throw invalidArtifactPage("The diagnostic Hub returned an invalid artifact-page schema", { artifactId, page });
      }
      if (page.artifactId !== artifactId || page.representation !== representation || typeof page.text !== "string") {
        throw invalidArtifactPage("The diagnostic Hub returned an artifact page that does not match the request", {
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
        throw invalidArtifactPage("The diagnostic artifact pagination cursor is invalid", { artifactId, page: pageInfo });
      }
      chunks.push(page.text);
      if (!pageInfo.hasMore) return chunks.join("");
      if (pageInfo.nextOffset <= offset) {
        throw invalidArtifactPage("The diagnostic artifact pagination cursor did not advance", { artifactId, page: pageInfo });
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
      throw new DiagnosticError("diagnostic-artifact-json-invalid", "The diagnostic artifact JSON content could not be parsed", {
        cause: error,
        details: { artifactId: artifact.artifactId, reason: String(error?.message || error) },
        nextActions: ["Check whether the artifact was modified during reading, then retry the diagnostic operation"],
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
      throw new DiagnosticError("diagnostic-artifact-consume-failed", "Reading the diagnostic artifact failed, and releasing it afterward also failed", {
        cause: readError,
        details: {
          artifactId: artifact.artifactId,
          readError: { code: readError?.code || null, message: String(readError?.message || readError) },
          releaseError: { code: releaseError?.code || null, message: String(releaseError?.message || releaseError) },
        },
        nextActions: ["Preserve both error details and inspect the diagnostic Hub lifecycle"],
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
