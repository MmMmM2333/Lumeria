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
    throw new DiagnosticError("diagnostic-artifact-not-serializable", "诊断结果无法序列化为制品", {
      cause: error,
      details: { reason: String(error?.message || error) },
      nextActions: ["让诊断适配器返回不含循环引用、BigInt 或函数的普通 JSON 数据"],
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
  return new DiagnosticError("diagnostic-artifact-not-found", `未找到诊断制品 ${artifactId || "(empty)"}`, {
    details: { artifactId: artifactId || null },
    nextActions: ["确认制品尚未释放，并使用 invoke 返回的 artifactId 重试"],
  });
}

function normalizePath(path) {
  if (path == null) return [];
  if (!Array.isArray(path)) {
    throw new DiagnosticError("diagnostic-artifact-path-invalid", "诊断制品 path 必须是字符串或整数数组", {
      details: { path },
      nextActions: ["示例：path: [\"timeline\", \"events\"]"],
    });
  }
  if (path.length > 32) {
    throw new DiagnosticError("diagnostic-artifact-path-invalid", "诊断制品 path 超过 32 层限制", {
      details: { length: path.length },
      nextActions: ["缩短查询路径"],
    });
  }
  return path.map((segment) => {
    if (typeof segment === "string") return segment;
    if (Number.isSafeInteger(segment) && segment >= 0) return segment;
    throw new DiagnosticError("diagnostic-artifact-path-invalid", "诊断制品 path 只接受字符串或非负整数", {
      details: { path },
      nextActions: ["用字段名访问对象，用非负整数访问数组"],
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
      throw new DiagnosticError("diagnostic-artifact-path-not-found", "诊断制品中不存在请求的路径", {
        details: { artifactId, missingAt: index, path },
        nextActions: ["先查询父路径的 fields 或数组长度，再修正 path"],
      });
    }
    current = current[key];
  }
  return current;
}

function normalizeOffset(value) {
  const offset = value == null ? 0 : Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new DiagnosticError("diagnostic-artifact-page-invalid", "诊断制品 offset 必须是非负整数", {
      details: { offset: value },
      nextActions: ["从 offset: 0 开始分页"],
    });
  }
  return offset;
}

function normalizeLimit(value, fallback, maximum) {
  const limit = value == null ? fallback : Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > maximum) {
    throw new DiagnosticError("diagnostic-artifact-page-invalid", `诊断制品 limit 必须是 1 到 ${maximum} 的整数`, {
      details: { limit: value, maximum },
      nextActions: [`把 limit 调整到 1..${maximum}`],
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
      throw new DiagnosticError("diagnostic-artifact-store-disposed", "诊断制品存储已经释放", {
        nextActions: ["等待运行时重新安装诊断 Hub"],
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
      throw new DiagnosticError("diagnostic-artifact-too-large", "诊断结果超过单个制品大小上限", {
        details: { artifactBytes, maxArtifactBytes },
        nextActions: ["缩短捕获窗口、收窄过滤条件，或改用分页友好的诊断操作"],
      });
    }
    if (entries.size >= maxArtifacts || storedBytes + artifactBytes > maxBytes) {
      throw new DiagnosticError("diagnostic-artifact-capacity-exceeded", "诊断制品存储容量不足", {
        details: {
          artifactBytes,
          artifactCount: entries.size,
          maxArtifacts,
          maxBytes,
          storedBytes,
        },
        nextActions: ["调用 releaseArtifact(artifactId) 释放不再使用的制品后重试"],
      });
    }
    sequence += 1;
    const artifactId = String(idFactory({ sequence }) || "").trim();
    if (!artifactId) throw new TypeError("DiagnosticArtifactStore idFactory must return a non-empty id");
    if (entries.has(artifactId)) {
      throw new DiagnosticError("diagnostic-artifact-id-collision", `诊断制品 ID ${artifactId} 已存在`, {
        details: { artifactId },
        nextActions: ["修正 DiagnosticArtifactStore 的 idFactory"],
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
        throw new DiagnosticError("diagnostic-artifact-text-required", "text 表示只适用于字符串路径", {
          details: { artifactId: entry.artifactId, kind: valueKind(target), path },
          nextActions: ["改用 representation: \"json\"，或把 path 指向字符串字段"],
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
      throw new DiagnosticError("diagnostic-artifact-value-too-large", "请求的诊断值超过单页大小上限", {
        details: { artifactId: entry.artifactId, maxPageBytes, path, valueBytes },
        nextActions: ["查询子路径，或使用 representation: \"json\" 分页读取"],
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
          throw new DiagnosticError("diagnostic-artifact-page-too-large", "单个数组项超过诊断制品单页上限", {
            details: { artifactId: entry.artifactId, index, maxPageBytes, path },
            nextActions: ["把 path 延伸到该数组项内部后再查询"],
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
          throw new DiagnosticError("diagnostic-artifact-page-too-large", "单个对象字段摘要超过诊断制品单页上限", {
            details: {
              artifactId: entry.artifactId,
              fieldName: field.name,
              index,
              maxPageBytes,
              path,
            },
            nextActions: ["使用更短的字段名，或通过 representation: \"json\" 分页读取父路径"],
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
      throw new DiagnosticError("diagnostic-artifact-representation-invalid", "不支持请求的诊断制品表示形式", {
        details: { representation },
        nextActions: ["使用 structured、json 或 text"],
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
