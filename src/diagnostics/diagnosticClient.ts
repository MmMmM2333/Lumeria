import { readLaunchpadDebugValue } from "../rendering/diagnosticPort.js";
import { DiagnosticError } from "./diagnosticError.js";
import {
  DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA,
  DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA,
  DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA,
  DIAGNOSTIC_RESULT_SCHEMA,
} from "./diagnosticProtocol.js";
import type {
  DiagnosticArtifactDelivery,
  DiagnosticArtifactReference,
  DiagnosticParams,
} from "./diagnosticProtocol.js";

const DEFAULT_ARTIFACT_CHUNK_SIZE = 64 * 1024 as number;

type UnknownRecord = Record<string, unknown>;
type DiagnosticHubMethod = "describe" | "invoke" | "queryArtifact" | "releaseArtifact";

type DiagnosticHubMethodInvoker = (...args: unknown[]) => unknown | Promise<unknown>;

interface DiagnosticClientOptions {
  readonly resolveDiagnostics?: () => unknown;
}

export interface DiagnosticArtifactReadOptions {
  readonly chunkSize?: unknown;
  readonly path?: unknown;
}

export interface DiagnosticClient {
  consumeArtifactText(artifactInput: unknown, options?: DiagnosticArtifactReadOptions): Promise<string>;
  consumeArtifactValue(artifactInput: unknown, options?: DiagnosticArtifactReadOptions): Promise<unknown>;
  describe(toolId: unknown): Promise<unknown>;
  invoke(toolId: unknown, operation: unknown, params?: DiagnosticParams): Promise<unknown>;
  queryArtifact(request?: unknown): Promise<unknown>;
  readArtifactJsonText(artifactInput: unknown, options?: DiagnosticArtifactReadOptions): Promise<string>;
  readArtifactText(artifactInput: unknown, options?: DiagnosticArtifactReadOptions): Promise<string>;
  readArtifactValue(artifactInput: unknown, options?: DiagnosticArtifactReadOptions): Promise<unknown>;
  releaseArtifact(artifactOrId: unknown): Promise<unknown>;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function errorMessage(error: unknown): string {
  return String(asRecord(error)?.message || error);
}

function errorCode(error: unknown): string | null {
  const code = asRecord(error)?.code;
  return code == null ? null : String(code);
}

function defaultResolveDiagnostics(): unknown {
  return readLaunchpadDebugValue("diagnostics");
}

function unwrapDiagnosticResult(result: unknown): unknown {
  const record = asRecord(result);
  if (!record || record.schema !== DIAGNOSTIC_RESULT_SCHEMA || typeof record.ok !== "boolean") {
    throw new DiagnosticError("diagnostic-result-invalid", "The diagnostic Hub returned an invalid result", {
      details: { result },
      nextActions: ["Check that the diagnostic Hub and client protocol versions match"],
    });
  }
  if (record.ok) return record.data;
  const error = asRecord(record.error);
  throw new DiagnosticError(
    error?.code || "diagnostic-operation-failed",
    error?.message || "Diagnostic operation failed",
    {
      details: error?.details ?? null,
      nextActions: Array.isArray(error?.nextActions) ? error.nextActions : [],
    },
  );
}

export function isDiagnosticArtifactDelivery(value: unknown): value is DiagnosticArtifactDelivery {
  const record = asRecord(value);
  return Boolean(
    record
    && record.schema === DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA
    && record.delivery === "artifact"
    && isDiagnosticArtifactReference(record.artifact),
  );
}

function isDiagnosticArtifactReference(value: unknown): value is DiagnosticArtifactReference {
  const record = asRecord(value);
  return Boolean(
    record
    && record.schema === DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA
    && String(record.artifactId || "").trim(),
  );
}

function requireArtifactReference(value: unknown): DiagnosticArtifactReference {
  if (isDiagnosticArtifactDelivery(value)) return value.artifact;
  if (isDiagnosticArtifactReference(value)) return value;
  throw new DiagnosticError("diagnostic-artifact-delivery-invalid", "The diagnostic operation did not return a valid artifact reference", {
    details: { value },
    nextActions: ["Confirm the operation resultSize is large and check the Hub and client protocol versions"],
  });
}

function normalizeChunkSize(value: unknown): number {
  const size = value == null ? DEFAULT_ARTIFACT_CHUNK_SIZE : Number(value);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new DiagnosticError("diagnostic-artifact-chunk-size-invalid", "Diagnostic artifact chunkSize must be a positive integer", {
      details: { chunkSize: value },
      nextActions: ["Use a chunkSize greater than 0"],
    });
  }
  return size;
}

function invalidArtifactPage(message: string, details: UnknownRecord = {}): DiagnosticError {
  return new DiagnosticError("diagnostic-artifact-page-invalid", message, {
    details,
    nextActions: ["Check the diagnostic Hub and client artifact-pagination protocol versions"],
  });
}

interface DiagnosticArtifactTextPage {
  readonly hasMore: boolean;
  readonly nextOffset: number;
  readonly text: string;
}

function requireArtifactTextPage(
  value: unknown,
  artifactId: string,
  representation: "json" | "text",
  limit: number,
  offset: number,
): DiagnosticArtifactTextPage {
  const page = asRecord(value);
  if (!page || page.schema !== DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA) {
    throw invalidArtifactPage("The diagnostic Hub returned an invalid artifact-page schema", { artifactId, page: value });
  }
  if (
    page.artifactId !== artifactId
    || page.representation !== representation
    || typeof page.kind !== "string"
    || !Array.isArray(page.path)
    || typeof page.text !== "string"
  ) {
    throw invalidArtifactPage("The diagnostic Hub returned an artifact page that does not match the request", {
      artifactId,
      pageArtifactId: page.artifactId,
      representation: page.representation,
    });
  }
  const pageInfo = asRecord(page.page);
  if (
    !pageInfo
    || pageInfo.offset !== offset
    || typeof pageInfo.hasMore !== "boolean"
    || !Number.isSafeInteger(pageInfo.limit)
    || Number(pageInfo.limit) !== limit
    || !Number.isSafeInteger(pageInfo.nextOffset)
    || !Number.isSafeInteger(pageInfo.returned)
    || Number(pageInfo.returned) !== page.text.length
    || !Number.isSafeInteger(pageInfo.total)
    || Number(pageInfo.total) < 0
  ) {
    throw invalidArtifactPage("The diagnostic artifact pagination cursor is invalid", { artifactId, page: page.page });
  }
  const nextOffset = Number(pageInfo.nextOffset);
  const returned = Number(pageInfo.returned);
  const total = Number(pageInfo.total);
  if (
    nextOffset !== offset + returned
    || nextOffset > total
    || pageInfo.hasMore !== (nextOffset < total)
    || (pageInfo.hasMore && nextOffset <= offset)
  ) {
    throw invalidArtifactPage("The diagnostic artifact pagination cursor is inconsistent", { artifactId, page: page.page });
  }
  return Object.freeze({
    hasMore: pageInfo.hasMore,
    nextOffset,
    text: page.text,
  });
}

export function createDiagnosticClient(options: DiagnosticClientOptions = {}): DiagnosticClient {
  const resolveDiagnostics = typeof options.resolveDiagnostics === "function"
    ? options.resolveDiagnostics
    : defaultResolveDiagnostics;

  function requireMethod(method: DiagnosticHubMethod): DiagnosticHubMethodInvoker {
    const diagnostics = resolveDiagnostics();
    if (!diagnostics) {
      throw new DiagnosticError("diagnostics-hub-unavailable", "The diagnostic Hub is not installed", {
        nextActions: ["Confirm the Pixi Desktop Surface is mounted, then retry"],
      });
    }
    const record = asRecord(diagnostics);
    const methodValue = record?.[method];
    if (typeof methodValue !== "function") {
      throw new DiagnosticError("diagnostics-client-method-unavailable", `The diagnostic Hub does not support ${method}`, {
        details: { method },
        nextActions: ["Check that the diagnostic Hub and client protocol versions match"],
      });
    }
    return (...args: unknown[]) => Reflect.apply(methodValue, diagnostics, args);
  }

  async function describe(toolId: unknown): Promise<unknown> {
    const describeMethod = requireMethod("describe");
    return unwrapDiagnosticResult(await describeMethod(toolId));
  }

  async function invoke(
    toolId: unknown,
    operation: unknown,
    params: DiagnosticParams = {},
  ): Promise<unknown> {
    const invokeMethod = requireMethod("invoke");
    return unwrapDiagnosticResult(await invokeMethod({ operation, params, toolId }));
  }

  async function queryArtifact(request: unknown = {}): Promise<unknown> {
    const queryArtifactMethod = requireMethod("queryArtifact");
    return unwrapDiagnosticResult(await queryArtifactMethod(request));
  }

  async function releaseArtifact(artifactOrId: unknown): Promise<unknown> {
    const artifactId = typeof artifactOrId === "string"
      ? artifactOrId.trim()
      : requireArtifactReference(artifactOrId).artifactId;
    if (!artifactId) {
      throw new DiagnosticError("diagnostic-artifact-id-invalid", "Releasing a diagnostic artifact requires a non-empty artifactId", {
        nextActions: ["Use the artifact reference returned by invoke"],
      });
    }
    const releaseArtifactMethod = requireMethod("releaseArtifact");
    return unwrapDiagnosticResult(await releaseArtifactMethod(artifactId));
  }

  async function collectArtifactText(
    artifactInput: unknown,
    options: DiagnosticArtifactReadOptions,
    representation: "json" | "text",
  ): Promise<string> {
    const artifact = requireArtifactReference(artifactInput);
    const artifactId = artifact.artifactId;
    const limit = normalizeChunkSize(options.chunkSize);
    const path = options.path == null ? [] : options.path;
    const chunks = [];
    let offset = 0;
    while (true) {
      const page = requireArtifactTextPage(
        await queryArtifact({ artifactId, limit, offset, path, representation }),
        artifactId,
        representation,
        limit,
        offset,
      );
      chunks.push(page.text);
      if (!page.hasMore) return chunks.join("");
      offset = page.nextOffset;
    }
  }

  async function readArtifactText(artifactInput: unknown, options: DiagnosticArtifactReadOptions = {}): Promise<string> {
    return collectArtifactText(artifactInput, options, "text");
  }

  async function readArtifactJsonText(artifactInput: unknown, options: DiagnosticArtifactReadOptions = {}): Promise<string> {
    return collectArtifactText(artifactInput, options, "json");
  }

  async function readArtifactValue(artifactInput: unknown, options: DiagnosticArtifactReadOptions = {}): Promise<unknown> {
    const artifact = requireArtifactReference(artifactInput);
    const content = await readArtifactJsonText(artifact, options);
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new DiagnosticError("diagnostic-artifact-json-invalid", "The diagnostic artifact JSON content could not be parsed", {
        cause: error,
        details: { artifactId: artifact.artifactId, reason: errorMessage(error) },
        nextActions: ["Check whether the artifact was modified during reading, then retry the diagnostic operation"],
      });
    }
  }

  async function consumeArtifact<Result>(
    artifactInput: unknown,
    reader: (artifact: DiagnosticArtifactReference) => Result | Promise<Result>,
  ): Promise<Result> {
    const artifact = requireArtifactReference(artifactInput);
    let readOutcome: Readonly<{ ok: true; value: Result }> | Readonly<{ error: unknown; ok: false }>;
    let releaseError: unknown = null;
    try {
      readOutcome = { ok: true, value: await reader(artifact) };
    } catch (error) {
      readOutcome = { error, ok: false };
    }
    try {
      await releaseArtifact(artifact);
    } catch (error) {
      releaseError = error;
    }
    if (!readOutcome.ok && releaseError) {
      throw new DiagnosticError("diagnostic-artifact-consume-failed", "Reading the diagnostic artifact failed, and releasing it afterward also failed", {
        cause: readOutcome.error,
        details: {
          artifactId: artifact.artifactId,
          readError: { code: errorCode(readOutcome.error), message: errorMessage(readOutcome.error) },
          releaseError: { code: errorCode(releaseError), message: errorMessage(releaseError) },
        },
        nextActions: ["Preserve both error details and inspect the diagnostic Hub lifecycle"],
      });
    }
    if (!readOutcome.ok) throw readOutcome.error;
    if (releaseError) throw releaseError;
    return readOutcome.value;
  }

  async function consumeArtifactText(artifactInput: unknown, options: DiagnosticArtifactReadOptions = {}): Promise<string> {
    return consumeArtifact(artifactInput, (artifact) => readArtifactText(artifact, options));
  }

  async function consumeArtifactValue(artifactInput: unknown, options: DiagnosticArtifactReadOptions = {}): Promise<unknown> {
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
