import {
  createDiagnosticArtifactStore,
  DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA,
  DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA,
} from "./diagnosticArtifactStore.js";
import { DiagnosticError } from "./diagnosticError.js";

export function runDiagnosticArtifactStoreTests(): void {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[diagnostic artifact store test failed] ${message}`);
  }
  const store = createDiagnosticArtifactStore({
    defaultPageLimit: 2,
    idFactory: ({ sequence }) => `artifact-${sequence}`,
    maxArtifacts: 3,
    maxBytes: 16_384,
    maxPageBytes: 1_024,
    maxPageLimit: 4,
    now: () => "2026-08-02T00:00:00.000Z",
  });
  const reference = store.create({
    meta: { ready: true, revision: 3 },
    note: "中文诊断结果",
    records: [
      { id: 1, state: "ready" },
      { id: 2, state: "warning" },
      { id: 3, state: "done" },
    ],
  }, {
    mediaType: "application/json",
    source: { operation: "report.read", requestId: "request-1", toolId: "motion" },
  });

  assert(reference.schema === DIAGNOSTIC_ARTIFACT_REFERENCE_SCHEMA, "create should return a stable reference schema");
  assert(reference.artifactId === "artifact-1", "create should use the configured id factory");
  assert(reference.createdAt === "2026-08-02T00:00:00.000Z", "references should expose creation time");
  assert(typeof reference.byteLength === "number" && reference.byteLength > 0 && reference.root?.kind === "object", "references should summarize stored content");
  assert(reference.source?.operation === "report.read", "references should retain diagnostic provenance");

  const rootPage = store.query({ artifactId: reference.artifactId });
  assert(rootPage.schema === DIAGNOSTIC_ARTIFACT_PAGE_SCHEMA, "queries should return a stable page schema");
  assert(rootPage.kind === "object" && rootPage.fields?.length === 2, "object queries should page field summaries");
  assert(rootPage.page?.hasMore === true && rootPage.page.nextOffset === 2, "object pages should expose continuation metadata");
  const firstField = rootPage.fields[0] as { name?: unknown; summary?: { kind?: unknown } } | undefined;
  assert(firstField?.name === "meta" && firstField.summary?.kind === "object", "field summaries should be analyzable");

  const recordsPage = store.query({
    artifactId: reference.artifactId,
    limit: 2,
    offset: 1,
    path: ["records"],
  });
  assert(recordsPage.kind === "array", "array paths should identify their result kind");
  assert(recordsPage.items?.map((item) => (item as { id: number }).id).join(",") === "2,3", "array queries should return the requested value page");
  assert(recordsPage.page?.returned === 2 && recordsPage.page.hasMore === false, "array page metadata should describe actual results");

  const notePage = store.query({
    artifactId: reference.artifactId,
    limit: 4,
    offset: 2,
    path: ["note"],
    representation: "text",
  });
  assert(notePage.kind === "string" && notePage.text === "诊断结果", "text queries should page raw string content");

  const jsonChunks: string[] = [];
  let jsonOffset = 0;
  do {
    const page = store.query({
      artifactId: reference.artifactId,
      limit: 12,
      offset: jsonOffset,
      path: ["records"],
      representation: "json",
    });
    assert(typeof page.text === "string" && page.page !== undefined, "JSON pages should expose text and pagination");
    jsonChunks.push(page.text);
    jsonOffset = page.page.nextOffset;
    if (!page.page.hasMore) break;
  } while (true);
  assert(JSON.parse(jsonChunks.join("")).length === 3, "JSON representation should support lossless paged reconstruction");

  const metaValue = store.query({
    artifactId: reference.artifactId,
    mode: "value",
    path: ["meta"],
  });
  assert((metaValue.value as { revision: number }).revision === 3, "bounded value mode should return small objects directly");

  let invalidPathError: unknown = null;
  try {
    store.query({ artifactId: reference.artifactId, path: ["missing"] });
  } catch (error) {
    invalidPathError = error;
  }
  assert(invalidPathError instanceof DiagnosticError && invalidPathError.code === "diagnostic-artifact-path-not-found", "missing paths should fail with a stable code");

  const released = store.release(reference.artifactId);
  assert(released.released === true && released.byteLength === reference.byteLength, "release should report the reclaimed artifact");
  let releasedQueryError: unknown = null;
  try {
    store.query({ artifactId: reference.artifactId });
  } catch (error) {
    releasedQueryError = error;
  }
  assert(releasedQueryError instanceof DiagnosticError && releasedQueryError.code === "diagnostic-artifact-not-found", "released artifacts should no longer be readable");

  const capacityStore = createDiagnosticArtifactStore({ maxArtifacts: 1, maxBytes: 128, maxArtifactBytes: 128 });
  capacityStore.create({ value: "first" });
  let capacityError: unknown = null;
  try {
    capacityStore.create({ value: "second" });
  } catch (error) {
    capacityError = error;
  }
  assert(capacityError instanceof DiagnosticError && capacityError.code === "diagnostic-artifact-capacity-exceeded", "capacity pressure should fail instead of silently evicting");

  const sizeStore = createDiagnosticArtifactStore({ maxArtifactBytes: 12, maxBytes: 64 });
  let sizeError: unknown = null;
  try {
    sizeStore.create({ value: "this is too large" });
  } catch (error) {
    sizeError = error;
  }
  assert(sizeError instanceof DiagnosticError && sizeError.code === "diagnostic-artifact-too-large", "oversized artifacts should fail explicitly");

  const boundedFieldStore = createDiagnosticArtifactStore({
    defaultPageLimit: 10,
    maxArtifactBytes: 4_096,
    maxBytes: 8_192,
    maxPageBytes: 64,
  });
  const hugeFieldName = `field-${"x".repeat(160)}`;
  const rootFieldReference = boundedFieldStore.create({ [hugeFieldName]: true });
  let rootFieldPageError: unknown = null;
  try {
    boundedFieldStore.query({ artifactId: rootFieldReference.artifactId });
  } catch (error) {
    rootFieldPageError = error;
  }
  assert(rootFieldPageError instanceof DiagnosticError && rootFieldPageError.code === "diagnostic-artifact-page-too-large", "root object field summaries must honor maxPageBytes");
  const nestedFieldReference = boundedFieldStore.create({ nested: { [hugeFieldName]: true } });
  let nestedFieldPageError: unknown = null;
  try {
    boundedFieldStore.query({ artifactId: nestedFieldReference.artifactId, path: ["nested"] });
  } catch (error) {
    nestedFieldPageError = error;
  }
  assert(nestedFieldPageError instanceof DiagnosticError && nestedFieldPageError.code === "diagnostic-artifact-page-too-large", "nested object field summaries must honor maxPageBytes");
  boundedFieldStore.dispose();

  store.dispose();
  let disposedError: unknown = null;
  try {
    store.create({ value: true });
  } catch (error) {
    disposedError = error;
  }
  assert(disposedError instanceof DiagnosticError && disposedError.code === "diagnostic-artifact-store-disposed", "disposed stores should reject new artifacts");
}
