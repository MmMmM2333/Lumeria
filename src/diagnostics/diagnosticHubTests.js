import { DiagnosticError } from "./diagnosticError.js";
import { createDiagnosticArtifactStore } from "./diagnosticArtifactStore.js";
import {
  createDiagnosticHub,
  DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA,
  DIAGNOSTIC_RESULT_SCHEMA,
} from "./diagnosticHub.js";

function makeAdapter(id, calls) {
  let disposed = false;
  return {
    describe() {
      return {
        descriptionKey: `diagnostics.tools.${id}.description`,
        id,
        operations: [
          { id: "echo", mutatesState: false, resultSize: "small" },
          { id: "fail", mutatesState: false, resultSize: "small" },
          { id: "large", mutatesState: false, resultSize: "large" },
        ],
        titleKey: `diagnostics.tools.${id}.title`,
        version: 1,
      };
    },
    dispose() {
      calls.push(`${id}:dispose`);
      disposed = true;
    },
    getStatus() {
      calls.push(`${id}:status`);
      return { disposed, state: "ready" };
    },
    invoke(operation, params, context) {
      calls.push(`${id}:${operation}`);
      if (operation === "fail") {
        throw new DiagnosticError("synthetic-failure", "合成失败", {
          nextActions: ["检查测试输入"],
        });
      }
      return { contextRequestId: context.requestId, params };
    },
  };
}

export async function runDiagnosticHubTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[diagnostic hub test failed] ${message}`);
  };
  const calls = [];
  const hub = createDiagnosticHub({
    adapters: [makeAdapter("motion", calls), makeAdapter("render", calls)],
    now: () => "2026-08-02T00:00:00.000Z",
  });

  const listed = await hub.listTools({ requestId: "list-1" });
  assert(listed.schema === DIAGNOSTIC_RESULT_SCHEMA, "listTools should use the stable result schema");
  assert(listed.ok === true && listed.requestId === "list-1", "listTools should preserve request correlation");
  assert(listed.operation === "tools.list" && listed.toolId == null, "listTools should identify the hub operation");
  assert(listed.generatedAt === "2026-08-02T00:00:00.000Z", "results should expose their generation time");
  assert(listed.data.tools.map((tool) => tool.id).join(",") === "motion,render", "listTools should expose both real seam shapes");
  assert(listed.data.tools[0].title === "Motion 动画诊断", "tool discovery should provide Chinese presentation text by default");
  assert(listed.data.tools[0].locale === "zh-CN", "localized descriptors should state their locale");
  assert(!calls.some((entry) => entry.endsWith(":status")), "tool discovery should stay lightweight");

  const described = await hub.describe("motion", { requestId: "describe-1" });
  assert(described.ok === true && described.data.tool.id === "motion", "describe should return the selected descriptor");
  assert(described.data.tool.description.includes("捕获"), "describe should expose a readable tool description");
  assert(described.data.status.state === "ready", "describe should include the adapter status");

  const invoked = await hub.invoke({
    operation: "echo",
    params: { value: 42 },
    requestId: "invoke-1",
    toolId: "render",
  });
  assert(invoked.ok === true && invoked.data.params.value === 42, "invoke should return adapter data in an envelope");
  assert(invoked.data.contextRequestId === "invoke-1", "invoke should pass request context to the adapter");

  const missingTool = await hub.invoke({ operation: "echo", requestId: "missing-1", toolId: "missing" });
  assert(missingTool.ok === false, "unknown tools should be an explicit result failure");
  assert(missingTool.error.code === "diagnostic-tool-not-found", "unknown tools should use a stable error code");

  const unsupported = await hub.invoke({ operation: "unknown", requestId: "unsupported-1", toolId: "motion" });
  assert(unsupported.ok === false, "unknown operations should be an explicit result failure");
  assert(unsupported.error.code === "diagnostic-operation-not-supported", "unknown operations should fail before adapter invocation");
  assert(!calls.includes("motion:unknown"), "the hub should not call an adapter for an undeclared operation");

  const failed = await hub.invoke({ operation: "fail", requestId: "failed-1", toolId: "motion" });
  assert(failed.ok === false && failed.error.code === "synthetic-failure", "diagnostic errors should preserve their stable code");
  assert(failed.error.message === "合成失败", "diagnostic errors should preserve their readable message");
  assert(failed.error.nextActions[0] === "检查测试输入", "diagnostic errors should retain actionable next steps");

  const largeWithoutStore = await hub.invoke({ operation: "large", requestId: "large-missing-1", toolId: "motion" });
  assert(largeWithoutStore.ok === false, "large operations should require artifact delivery");
  assert(largeWithoutStore.error.code === "diagnostic-artifact-store-unavailable", "large operations should fail explicitly without a store");
  assert(!calls.includes("motion:large"), "the hub should reject unavailable large delivery before generating expensive data");

  const artifactsUnavailable = await hub.queryArtifact({ artifactId: "missing", requestId: "artifact-1" });
  assert(artifactsUnavailable.ok === false, "artifact access should fail explicitly before a store is configured");
  assert(artifactsUnavailable.error.code === "diagnostic-artifact-store-unavailable", "missing artifact storage should have a stable code");

  const releasedUnavailable = await hub.releaseArtifact("missing", { requestId: "release-1" });
  assert(releasedUnavailable.ok === false, "artifact release should fail explicitly before a store is configured");
  assert(releasedUnavailable.error.code === "diagnostic-artifact-store-unavailable", "release should share the store-unavailable code");

  const artifactCalls = [];
  const artifactHub = createDiagnosticHub({
    adapters: [makeAdapter("artifact-tool", artifactCalls)],
    artifactStore: createDiagnosticArtifactStore({
      idFactory: ({ sequence }) => `hub-artifact-${sequence}`,
      maxArtifactBytes: 4_096,
      maxBytes: 8_192,
      now: () => "2026-08-02T00:00:00.000Z",
    }),
    now: () => "2026-08-02T00:00:00.000Z",
  });
  const delivered = await artifactHub.invoke({
    operation: "large",
    params: { records: [{ id: 1 }, { id: 2 }] },
    requestId: "large-1",
    toolId: "artifact-tool",
  });
  assert(delivered.ok === true, "large operations should succeed with artifact storage");
  assert(delivered.data.schema === DIAGNOSTIC_ARTIFACT_DELIVERY_SCHEMA, "large operations should use a stable delivery schema");
  assert(delivered.data.delivery === "artifact", "large results should identify artifact delivery");
  assert(delivered.data.artifact.source.operation === "large", "artifact references should retain the producing operation");
  assert(delivered.data.artifact.source.requestId === "large-1", "artifact references should retain request correlation");
  assert(delivered.data.params == null, "large adapter data should not remain inline beside the artifact reference");

  const artifactPage = await artifactHub.queryArtifact({
    artifactId: delivered.data.artifact.artifactId,
    mode: "value",
    path: ["params"],
    requestId: "artifact-query-1",
  });
  assert(artifactPage.ok === true, "the hub should expose stored artifact queries");
  assert(artifactPage.data.value.records.length === 2, "artifact queries should preserve large operation data");
  const artifactRelease = await artifactHub.releaseArtifact(
    delivered.data.artifact.artifactId,
    { requestId: "artifact-release-1" },
  );
  assert(artifactRelease.ok === true && artifactRelease.data.released === true, "the hub should explicitly release artifacts");
  await artifactHub.dispose({ requestId: "artifact-dispose-1" });

  const disposed = await hub.dispose({ requestId: "dispose-1" });
  assert(disposed.ok === true, "dispose should return a successful result envelope");
  assert(calls.filter((entry) => entry === "motion:dispose").length === 1, "dispose should release the motion adapter once");
  assert(calls.filter((entry) => entry === "render:dispose").length === 1, "dispose should release the render adapter once");
  await hub.dispose({ requestId: "dispose-2" });
  assert(calls.filter((entry) => entry.endsWith(":dispose")).length === 2, "dispose should be idempotent");

  const afterDispose = await hub.listTools({ requestId: "after-dispose" });
  assert(afterDispose.ok === false && afterDispose.error.code === "diagnostic-hub-disposed", "a disposed hub should fail explicitly");

  let duplicateError = null;
  try {
    createDiagnosticHub({ adapters: [makeAdapter("motion", []), makeAdapter("motion", [])] });
  } catch (error) {
    duplicateError = error;
  }
  assert(duplicateError instanceof TypeError && /duplicate/i.test(duplicateError.message), "duplicate tool ids should fail during construction");
}
