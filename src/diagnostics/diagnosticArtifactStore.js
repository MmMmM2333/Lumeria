import { DiagnosticError } from "./diagnosticError.js";
import {
  DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA,
  DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA,
} from "./diagnosticProtocol.js";

export { DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA, DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA };

const DEFAULT_MAX_ARTIFACTS = 12;
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_ARTIFACT_BYTES = 96 * 1024 * 1024;
const DEFAULT_MAX_PAGE_BYTES = 256 * 1024;
const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_MAX_PAGE_LIMIT = 500;
const UTF8_ENCODER = new TextEncoder();

function positiveInteger(value, fallback, name) {
  if (value == null) return fallback;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError(`DiagnosticArtifactStore ${name} must be a positive integer`);
  }
  return normalized;
}

function byteLength(value) {
  return UTF8_ENCODER.encode(value).byteLength;
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function valueKind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function summarizeValue(value) {
  const kind = valueKind(value);
  if (kind === "array") return { kind, length: value.length };
  if (kind === "object") return { fieldCount: Object.keys(value).length, kind };
  if (kind === "string") {
    return {
      kind,
      length: value.length,
      preview: value.length > 80 ? `${value.slice(0, 80)}…` : value,
    };
  }
  return { kind, value };
}

function serializeArtifact(value) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError("root value has no JSON representation");
    return serialized;
  } catch (error) {
    throw new DiagnosticError("diagnostic-artifact-not-serializable", "The diagnostic result cannot be serialized as an artifact", {
      cause: error,
      details: { reason: String(error?.message || error) },
      nextActions: ["Return plain JSON data without circular references, BigInt values, or functions from the diagnostic adapter"],
    });
  }
}

function normalizeSource(source = {}) {
  return {
    operation: source.operation == null ? null : String(source.operation),
    requestId: source.requestId == null ? null : String(source.requestId),
    toolId: source.toolId == null ? null : String(source.toolId),
  };
}

function makeNotFoundError(artifactId) {
  return new DiagnosticError("diagnostic-artifact-not-found", `Diagnostic artifact not found: ${artifactId || "(empty)"}`, {
    details: { artifactId: artifactId || null },
    nextActions: ["Confirm the artifact has not been released, then retry with the artifactId returned by invoke"],
  });
}

function normalizePath(path) {
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
    if (Number.isSafeInteger(segment) && segment >= 0) return segment;
    throw new DiagnosticError("diagnostic-artifact-path-invalid", "Diagnostic artifact path accepts only strings or non-negative integers", {
      details: { path },
      nextActions: ["Use field names for objects and non-negative integers for arrays"],
    });
  });
}

function resolvePath(root, path, artifactId) {
  let current = root;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    const isArrayIndex = Array.isArray(current)
      && ((Number.isSafeInteger(segment) && segment >= 0)
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
    current = current[key];
  }
  return current;
}

function normalizeOffset(value) {
  const offset = value == null ? 0 : Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new DiagnosticError("diagnostic-artifact-page-invalid", "Diagnostic artifact offset must be a non-negative integer", {
      details: { offset: value },
      nextActions: ["Begin pagination at offset: 0"],
    });
  }
  return offset;
}

function normalizeLimit(value, fallback, maximum) {
  const limit = value == null ? fallback : Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > maximum) {
    throw new DiagnosticError("diagnostic-artifact-page-invalid", `Diagnostic artifact limit must be an integer from 1 to ${maximum}`, {
      details: { limit: value, maximum },
      nextActions: [`Set limit to a value from 1 through ${maximum}`],
    });
  }
  return limit;
}

function makePage(offset, requestedLimit, returned, total) {
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

export function createDiagnosticArtifactStore(options = {}) {
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
    : ({ sequence }) => `diagnostic-artifact-${sequence}`;
  const entries = new Map();
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

  function requireEntry(artifactIdInput) {
    ensureActive();
    const artifactId = String(artifactIdInput || "").trim();
    const entry = entries.get(artifactId);
    if (!entry) throw makeNotFoundError(artifactId);
    return entry;
  }

  function makeReference(entry) {
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
        representations: ["structured", "json", "text"],
      },
      root: cloneJson(entry.root),
      schema: DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA,
      source: cloneJson(entry.source),
    };
  }

  function ensureStructured(entry) {
    if (entry.hasStructured) return entry.value;
    entry.value = JSON.parse(entry.serialized);
    entry.serialized = null;
    entry.hasStructured = true;
    entry.pathJsonCache = null;
    return entry.value;
  }

  function ensureRootJson(entry) {
    if (entry.serialized == null) entry.serialized = JSON.stringify(entry.value);
    entry.value = null;
    entry.hasStructured = false;
    entry.pathJsonCache = null;
    return entry.serialized;
  }

  function create(value, metadata = {}) {
    ensureActive();
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
    const rootFields = valueKind(value) === "object"
      ? Object.keys(value)
        .filter((name) => !["undefined", "function", "symbol"].includes(typeof value[name]))
        .map((name) => ({ name, path: [name], summary: summarizeValue(value[name]) }))
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

  function makeQueryBase(entry, path, kind, representation) {
    return {
      artifactId: entry.artifactId,
      kind,
      path: [...path],
      representation,
      schema: DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA,
    };
  }

  function queryText(entry, path, representation, request) {
    let content;
    let kind;
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

  function queryValue(entry, path, target) {
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

  function queryArray(entry, path, target, request) {
    const offset = normalizeOffset(request.offset);
    const limit = normalizeLimit(request.limit, defaultPageLimit, maxPageLimit);
    const items = [];
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

  function queryFields(entry, path, total, request, createField) {
    const offset = normalizeOffset(request.offset);
    const limit = normalizeLimit(request.limit, defaultPageLimit, maxPageLimit);
    const fields = [];
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

  function queryObject(entry, path, target, request) {
    const keys = Object.keys(target);
    const result = queryFields(entry, path, keys.length, request, (index) => {
      const name = keys[index];
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

  function queryRootObject(entry, request) {
    const result = queryFields(entry, [], entry.rootFields.length, request, (index) => entry.rootFields[index]);
    return {
      ...makeQueryBase(entry, [], "object", "structured"),
      ...result,
    };
  }

  function query(request = {}) {
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
      return queryRootObject(entry, request);
    }
    const root = ensureStructured(entry);
    const target = resolvePath(root, path, entry.artifactId);
    if (request.mode === "value") return queryValue(entry, path, target);
    const kind = valueKind(target);
    if (kind === "array") return queryArray(entry, path, target, request);
    if (kind === "object") return queryObject(entry, path, target, request);
    if (kind === "string") return queryText(entry, path, "text", request);
    return {
      ...makeQueryBase(entry, path, kind, "structured"),
      value: target,
    };
  }

  function release(artifactIdInput) {
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
