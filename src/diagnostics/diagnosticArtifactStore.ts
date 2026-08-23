import { DiagnosticError } from "./diagnosticError.js";
import {
  DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA,
  DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA,
} from "./diagnosticProtocol.js";
import type {
  DiagnosticArtifactPage,
  DiagnosticArtifactPath,
  DiagnosticArtifactQueryRequest,
  DiagnosticArtifactReference,
  DiagnosticArtifactRepresentation,
  DiagnosticArtifactSource,
  DiagnosticArtifactStore,
  DiagnosticValueSummary,
} from "./diagnosticProtocol.js";

export { DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA, DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA };

const DEFAULT_MAX_ARTIFACTS = 12 as const;
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_ARTIFACT_BYTES = 96 * 1024 * 1024;
const DEFAULT_MAX_PAGE_BYTES = 256 * 1024;
const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_MAX_PAGE_LIMIT = 500;
const UTF8_ENCODER = new TextEncoder();

type UnknownRecord = Record<string, unknown>;

interface DiagnosticArtifactStoreOptions {
  readonly defaultPageLimit?: unknown;
  readonly idFactory?: (input: Readonly<{ sequence: number }>) => unknown;
  readonly maxArtifactBytes?: unknown;
  readonly maxArtifacts?: unknown;
  readonly maxBytes?: unknown;
  readonly maxPageBytes?: unknown;
  readonly maxPageLimit?: unknown;
  readonly now?: () => unknown;
}

interface DiagnosticArtifactMetadata {
  readonly mediaType?: unknown;
  readonly source?: unknown;
}

interface DiagnosticArtifactField {
  readonly name: string;
  readonly path: DiagnosticArtifactPath;
  readonly summary: DiagnosticValueSummary;
}

interface DiagnosticArtifactEntry {
  artifactId: string;
  byteLength: number;
  createdAt: string;
  hasStructured: boolean;
  mediaType: string;
  pathJsonCache: { key: string; value: string } | null;
  root: DiagnosticValueSummary;
  rootFields: DiagnosticArtifactField[] | null;
  serialized: string | null;
  source: DiagnosticArtifactSource;
  value: unknown;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function errorMessage(error: unknown): string {
  const record = asRecord(error);
  return String(record?.message || error);
}

function positiveInteger(value: unknown, fallback: number, name: string): number {
  if (value == null) return fallback;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError(`DiagnosticArtifactStore ${name} must be a positive integer`);
  }
  return normalized;
}

function byteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function cloneJson<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function valueKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function summarizeValue(value: unknown): DiagnosticValueSummary {
  const kind = valueKind(value);
  if (Array.isArray(value)) return { kind, length: value.length };
  if (kind === "object") return { fieldCount: Object.keys(asRecord(value) || {}).length, kind };
  if (typeof value === "string") {
    return {
      kind,
      length: value.length,
      preview: value.length > 80 ? `${value.slice(0, 80)}…` : value,
    };
  }
  return { kind, value };
}

function serializeArtifact(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError("root value has no JSON representation");
    return serialized;
  } catch (error) {
    throw new DiagnosticError("diagnostic-artifact-not-serializable", "The diagnostic result cannot be serialized as an artifact", {
      cause: error,
      details: { reason: errorMessage(error) },
      nextActions: ["Return plain JSON data without circular references, BigInt values, or functions from the diagnostic adapter"],
    });
  }
}

function normalizeSource(source: unknown = {}): DiagnosticArtifactSource {
  const record = asRecord(source) || {};
  return {
    operation: record.operation == null ? null : String(record.operation),
    requestId: record.requestId == null ? null : String(record.requestId),
    toolId: record.toolId == null ? null : String(record.toolId),
  };
}

function makeNotFoundError(artifactId: string): DiagnosticError {
  return new DiagnosticError("diagnostic-artifact-not-found", `Diagnostic artifact not found: ${artifactId || "(empty)"}`, {
    details: { artifactId: artifactId || null },
    nextActions: ["Confirm the artifact has not been released, then retry with the artifactId returned by invoke"],
  });
}

function normalizePath(path: unknown): (string | number)[] {
  if (path == null) return [];
  if (!Array.isArray(path)) {
    throw new DiagnosticError("diagnostic-artifact-path-invalid", "Diagnostic artifact path must be an array of strings or integers", {
      details: { path },
      nextActions: ["Example: path: [\"timeline\", \"events\"]"],
    });
  }
  if (path.length > 32) {
    throw new DiagnosticError("diagnostic-artifact-path-invalid", "Diagnostic artifact path exceeds the 32-level limit", {
      details: { length: path.length },
      nextActions: ["Shorten the query path"],
    });
  }
  return path.map((segment) => {
    if (typeof segment === "string") return segment;
    if (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0) return segment;
    throw new DiagnosticError("diagnostic-artifact-path-invalid", "Diagnostic artifact path accepts only strings or non-negative integers", {
      details: { path },
      nextActions: ["Use field names for objects and non-negative integers for arrays"],
    });
  });
}

function resolvePath(root: unknown, path: DiagnosticArtifactPath, artifactId: string): unknown {
  let current = root;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index] as string | number;
    const isArrayIndex = Array.isArray(current)
      && ((typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0)
        || (typeof segment === "string" && /^\d+$/.test(segment)));
    const key = isArrayIndex ? Number(segment) : segment;
    const exists = current != null
      && typeof current === "object"
      && Object.prototype.hasOwnProperty.call(current, key);
    if (!exists) {
      throw new DiagnosticError("diagnostic-artifact-path-not-found", "The requested path does not exist in the diagnostic artifact", {
        details: { artifactId, missingAt: index, path },
        nextActions: ["Query the parent path fields or array length, then correct the path"],
      });
    }
    current = Array.isArray(current)
      ? current[Number(key)]
      : (current as UnknownRecord)[key];
  }
  return current;
}

function normalizeOffset(value: unknown): number {
  const offset = value == null ? 0 : Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new DiagnosticError("diagnostic-artifact-page-invalid", "Diagnostic artifact offset must be a non-negative integer", {
      details: { offset: value },
      nextActions: ["Begin pagination at offset: 0"],
    });
  }
  return offset;
}

function normalizeLimit(value: unknown, fallback: number, maximum: number): number {
  const limit = value == null ? fallback : Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > maximum) {
    throw new DiagnosticError("diagnostic-artifact-page-invalid", `Diagnostic artifact limit must be an integer from 1 to ${maximum}`, {
      details: { limit: value, maximum },
      nextActions: [`Set limit to a value from 1 through ${maximum}`],
    });
  }
  return limit;
}

function makePage(offset: number, requestedLimit: number, returned: number, total: number) {
  const nextOffset = Math.min(total, offset + returned);
  return {
    hasMore: nextOffset < total,
    limit: requestedLimit,
    nextOffset,
    offset,
    returned,
    total,
  };
}

export function createDiagnosticArtifactStore(options: DiagnosticArtifactStoreOptions = {}) {
  const maxArtifacts = positiveInteger(options.maxArtifacts, DEFAULT_MAX_ARTIFACTS, "maxArtifacts");
  const maxBytes = positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes");
  const maxArtifactBytes = Math.min(
    positiveInteger(options.maxArtifactBytes, DEFAULT_MAX_ARTIFACT_BYTES, "maxArtifactBytes"),
    maxBytes,
  );
  const maxPageBytes = positiveInteger(options.maxPageBytes, DEFAULT_MAX_PAGE_BYTES, "maxPageBytes");
  const defaultPageLimit = positiveInteger(options.defaultPageLimit, DEFAULT_PAGE_LIMIT, "defaultPageLimit");
  const maxPageLimit = positiveInteger(options.maxPageLimit, DEFAULT_MAX_PAGE_LIMIT, "maxPageLimit");
  if (defaultPageLimit > maxPageLimit) {
    throw new TypeError("DiagnosticArtifactStore defaultPageLimit cannot exceed maxPageLimit");
  }
  const maxTextPageChars = Math.max(1, Math.floor(maxPageBytes / 4));
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === "function"
    ? options.idFactory
    : ({ sequence }: Readonly<{ sequence: number }>) => `diagnostic-artifact-${sequence}`;
  const entries = new Map<string, DiagnosticArtifactEntry>();
  let sequence = 0;
  let storedBytes = 0;
  let disposed = false;

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("diagnostic-artifact-store-disposed", "The diagnostic artifact store has been disposed", {
        nextActions: ["Wait for the runtime to reinstall the diagnostic Hub"],
      });
    }
  }

  function requireEntry(artifactIdInput: unknown): DiagnosticArtifactEntry {
    ensureActive();
    const artifactId = String(artifactIdInput || "").trim();
    const entry = entries.get(artifactId);
    if (!entry) throw makeNotFoundError(artifactId);
    return entry;
  }

  function makeReference(entry: DiagnosticArtifactEntry): DiagnosticArtifactReference {
    return {
      artifactId: entry.artifactId,
      byteLength: entry.byteLength,
      createdAt: entry.createdAt,
      mediaType: entry.mediaType,
      query: {
        defaultPageLimit,
        maxPageBytes,
        maxPageLimit,
        maxTextPageChars,
        representations: ["structured", "json", "text"] as const,
      },
      root: cloneJson(entry.root),
      schema: DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA,
      source: cloneJson(entry.source),
    };
  }

  function ensureStructured(entry: DiagnosticArtifactEntry): unknown {
    if (entry.hasStructured) return entry.value;
    entry.value = JSON.parse(entry.serialized as string);
    entry.serialized = null;
    entry.hasStructured = true;
    entry.pathJsonCache = null;
    return entry.value;
  }

  function ensureRootJson(entry: DiagnosticArtifactEntry): string {
    if (entry.serialized == null) entry.serialized = JSON.stringify(entry.value) as string;
    entry.value = null;
    entry.hasStructured = false;
    entry.pathJsonCache = null;
    return entry.serialized;
  }

  function create(value: unknown, metadataInput: unknown = {}): DiagnosticArtifactReference {
    ensureActive();
    const metadata = asRecord(metadataInput) as DiagnosticArtifactMetadata | null || {};
    const serialized = serializeArtifact(value);
    const artifactBytes = byteLength(serialized);
    if (artifactBytes > maxArtifactBytes) {
      throw new DiagnosticError("diagnostic-artifact-too-large", "The diagnostic result exceeds the per-artifact size limit", {
        details: { artifactBytes, maxArtifactBytes },
        nextActions: ["Shorten the capture window, narrow the filters, or use a pagination-friendly diagnostic operation"],
      });
    }
    if (entries.size >= maxArtifacts || storedBytes + artifactBytes > maxBytes) {
      throw new DiagnosticError("diagnostic-artifact-capacity-exceeded", "The diagnostic artifact store has insufficient capacity", {
        details: {
          artifactBytes,
          artifactCount: entries.size,
          maxArtifacts,
          maxBytes,
          storedBytes,
        },
        nextActions: ["Release unused artifacts with releaseArtifact(artifactId), then retry"],
      });
    }
    sequence += 1;
    const artifactId = String(idFactory({ sequence }) || "").trim();
    if (!artifactId) throw new TypeError("DiagnosticArtifactStore idFactory must return a non-empty id");
    if (entries.has(artifactId)) {
      throw new DiagnosticError("diagnostic-artifact-id-collision", `Diagnostic artifact ID already exists: ${artifactId}`, {
        details: { artifactId },
        nextActions: ["Correct the DiagnosticArtifactStore idFactory"],
      });
    }
    const rootRecord = valueKind(value) === "object" ? asRecord(value) : null;
    const rootFields = rootRecord
      ? Object.keys(rootRecord)
        .filter((name) => !["undefined", "function", "symbol"].includes(typeof rootRecord[name]))
        .map((name) => ({ name, path: [name], summary: summarizeValue(rootRecord[name]) }))
      : null;
    const entry = {
      artifactId,
      byteLength: artifactBytes,
      createdAt: String(now()),
      hasStructured: false,
      mediaType: String(metadata.mediaType || "application/json"),
      pathJsonCache: null,
      root: summarizeValue(value),
      rootFields,
      serialized,
      source: normalizeSource(metadata.source),
      value: null,
    };
    entries.set(artifactId, entry);
    storedBytes += artifactBytes;
    return makeReference(entry);
  }

  function makeQueryBase(
    entry: DiagnosticArtifactEntry,
    path: DiagnosticArtifactPath,
    kind: string,
    representation: DiagnosticArtifactRepresentation,
  ) {
    return {
      artifactId: entry.artifactId,
      kind,
      path: [...path],
      representation,
      schema: DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA,
    };
  }

  function queryText(
    entry: DiagnosticArtifactEntry,
    path: DiagnosticArtifactPath,
    representation: "json" | "text",
    request: DiagnosticArtifactQueryRequest,
  ): DiagnosticArtifactPage {
    let content: string;
    let kind: string;
    if (representation === "json") {
      kind = "json";
      if (path.length === 0) {
        content = ensureRootJson(entry);
      } else {
        const root = ensureStructured(entry);
        const target = resolvePath(root, path, entry.artifactId);
        const cacheKey = JSON.stringify(path);
        if (entry.pathJsonCache?.key !== cacheKey) {
          entry.pathJsonCache = { key: cacheKey, value: serializeArtifact(target) };
        }
        content = entry.pathJsonCache.value;
      }
    } else {
      const root = ensureStructured(entry);
      const target = resolvePath(root, path, entry.artifactId);
      if (typeof target !== "string") {
        throw new DiagnosticError("diagnostic-artifact-text-required", "The text representation is available only for string paths", {
          details: { artifactId: entry.artifactId, kind: valueKind(target), path },
          nextActions: ["Use representation: \"json\", or point path to a string field"],
        });
      }
      content = target;
      kind = "string";
    }
    const offset = normalizeOffset(request.offset);
    const limit = normalizeLimit(request.limit, maxTextPageChars, maxTextPageChars);
    const text = content.slice(offset, offset + limit);
    return {
      ...makeQueryBase(entry, path, kind, representation),
      page: makePage(offset, limit, text.length, content.length),
      text,
    };
  }

  function queryValue(
    entry: DiagnosticArtifactEntry,
    path: DiagnosticArtifactPath,
    target: unknown,
  ): DiagnosticArtifactPage {
    const serialized = serializeArtifact(target);
    const valueBytes = byteLength(serialized);
    if (valueBytes > maxPageBytes) {
      throw new DiagnosticError("diagnostic-artifact-value-too-large", "The requested diagnostic value exceeds the page size limit", {
        details: { artifactId: entry.artifactId, maxPageBytes, path, valueBytes },
        nextActions: ["Query a child path, or paginate with representation: \"json\""],
      });
    }
    return {
      ...makeQueryBase(entry, path, valueKind(target), "structured"),
      value: JSON.parse(serialized),
    };
  }

  function queryArray(
    entry: DiagnosticArtifactEntry,
    path: DiagnosticArtifactPath,
    target: readonly unknown[],
    request: DiagnosticArtifactQueryRequest,
  ): DiagnosticArtifactPage {
    const offset = normalizeOffset(request.offset);
    const limit = normalizeLimit(request.limit, defaultPageLimit, maxPageLimit);
    const items: unknown[] = [];
    let responseBytes = 2;
    const end = Math.min(target.length, offset + limit);
    for (let index = offset; index < end; index += 1) {
      const serialized = serializeArtifact(target[index]);
      const itemBytes = byteLength(serialized) + (items.length ? 1 : 0);
      if (responseBytes + itemBytes > maxPageBytes) {
        if (items.length === 0) {
          throw new DiagnosticError("diagnostic-artifact-page-too-large", "A single array item exceeds the diagnostic artifact page limit", {
            details: { artifactId: entry.artifactId, index, maxPageBytes, path },
            nextActions: ["Extend path into the array item before querying again"],
          });
        }
        break;
      }
      responseBytes += itemBytes;
      items.push(JSON.parse(serialized));
    }
    return {
      ...makeQueryBase(entry, path, "array", "structured"),
      items,
      page: makePage(offset, limit, items.length, target.length),
    };
  }

  function queryFields(
    entry: DiagnosticArtifactEntry,
    path: DiagnosticArtifactPath,
    total: number,
    request: DiagnosticArtifactQueryRequest,
    createField: (index: number) => DiagnosticArtifactField,
  ) {
    const offset = normalizeOffset(request.offset);
    const limit = normalizeLimit(request.limit, defaultPageLimit, maxPageLimit);
    const fields: DiagnosticArtifactField[] = [];
    let responseBytes = 2;
    const end = Math.min(total, offset + limit);
    for (let index = offset; index < end; index += 1) {
      const field = createField(index);
      const serialized = serializeArtifact(field);
      const fieldBytes = byteLength(serialized) + (fields.length ? 1 : 0);
      if (responseBytes + fieldBytes > maxPageBytes) {
        if (fields.length === 0) {
          throw new DiagnosticError("diagnostic-artifact-page-too-large", "A single object-field summary exceeds the diagnostic artifact page limit", {
            details: {
              artifactId: entry.artifactId,
              fieldName: field.name,
              index,
              maxPageBytes,
              path,
            },
            nextActions: ["Use shorter field names, or paginate the parent path with representation: \"json\""],
          });
        }
        break;
      }
      responseBytes += fieldBytes;
      fields.push(JSON.parse(serialized));
    }
    return {
      fields,
      page: makePage(offset, limit, fields.length, total),
    };
  }

  function queryObject(
    entry: DiagnosticArtifactEntry,
    path: DiagnosticArtifactPath,
    target: UnknownRecord,
    request: DiagnosticArtifactQueryRequest,
  ): DiagnosticArtifactPage {
    const keys = Object.keys(target);
    const result = queryFields(entry, path, keys.length, request, (index) => {
      const name = keys[index];
      if (name === undefined) throw new TypeError("Diagnostic artifact field index is out of range");
      return {
        name,
        path: [...path, name],
        summary: summarizeValue(target[name]),
      };
    });
    return {
      ...makeQueryBase(entry, path, "object", "structured"),
      ...result,
    };
  }

  function queryRootObject(
    entry: DiagnosticArtifactEntry,
    rootFields: DiagnosticArtifactField[],
    request: DiagnosticArtifactQueryRequest,
  ): DiagnosticArtifactPage {
    const result = queryFields(entry, [], rootFields.length, request, (index) => {
      const field = rootFields[index];
      if (!field) throw new TypeError("Diagnostic artifact root-field index is out of range");
      return field;
    });
    return {
      ...makeQueryBase(entry, [], "object", "structured"),
      ...result,
    };
  }

  function query(request: DiagnosticArtifactQueryRequest = {}): DiagnosticArtifactPage {
    const entry = requireEntry(request.artifactId);
    const path = normalizePath(request.path);
    const representation = String(request.representation || "structured");
    if (representation === "json" || representation === "text") {
      return queryText(entry, path, representation, request);
    }
    if (representation !== "structured") {
      throw new DiagnosticError("diagnostic-artifact-representation-invalid", "The requested diagnostic artifact representation is not supported", {
        details: { representation },
        nextActions: ["Use structured, json, or text"],
      });
    }
    if (path.length === 0 && request.mode !== "value" && entry.rootFields) {
      return queryRootObject(entry, entry.rootFields, request);
    }
    const root = ensureStructured(entry);
    const target = resolvePath(root, path, entry.artifactId);
    if (request.mode === "value") return queryValue(entry, path, target);
    const kind = valueKind(target);
    if (Array.isArray(target)) return queryArray(entry, path, target, request);
    if (asRecord(target)) return queryObject(entry, path, asRecord(target) || {}, request);
    if (typeof target === "string") return queryText(entry, path, "text", request);
    return {
      ...makeQueryBase(entry, path, kind, "structured"),
      value: target,
    };
  }

  function release(artifactIdInput: unknown) {
    const entry = requireEntry(artifactIdInput);
    entries.delete(entry.artifactId);
    storedBytes -= entry.byteLength;
    entry.serialized = null;
    entry.value = null;
    entry.pathJsonCache = null;
    return {
      artifactId: entry.artifactId,
      byteLength: entry.byteLength,
      remainingArtifactCount: entries.size,
      remainingBytes: storedBytes,
      released: true,
    };
  }

  function dispose() {
    if (disposed) return { alreadyDisposed: true, releasedArtifactCount: 0, releasedBytes: 0 };
    const releasedArtifactCount = entries.size;
    const releasedBytes = storedBytes;
    for (const entry of entries.values()) {
      entry.serialized = null;
      entry.value = null;
      entry.pathJsonCache = null;
    }
    entries.clear();
    storedBytes = 0;
    disposed = true;
    return { alreadyDisposed: false, releasedArtifactCount, releasedBytes };
  }

  return Object.freeze({ create, dispose, query, release });
}
