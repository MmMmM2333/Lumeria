import { createDiagnosticClient } from "./diagnosticClient.js";

export async function runDiagnosticClientTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[diagnostic client test failed] ${message}`);
  };
  const calls = [];
  const artifactQueries = [];
  const artifactReleases = [];
  const artifactJson = JSON.stringify({ items: [1, 2], ready: true });
  const artifactText = "中文诊断导出";
  const client = createDiagnosticClient({
    resolveDiagnostics: () => ({
      describe: async (toolId) => ({
        data: { id: toolId, title: "渲染诊断" },
        ok: true,
        schema: "lumeria-diagnostic-result/v1",
      }),
      invoke: async (request) => {
        calls.push(request);
        if (request.operation === "fail") {
          return {
            error: {
              code: "render-probe-failed",
              details: { phase: "release" },
              message: "渲染探针失败",
              nextActions: ["重新捕获"],
            },
            ok: false,
            schema: "lumeria-diagnostic-result/v1",
          };
        }
        if (request.operation === "large-json" || request.operation === "large-text") {
          return {
            data: {
              artifact: {
                artifactId: request.operation,
                byteLength: request.operation === "large-json" ? artifactJson.length : artifactText.length,
                schema: "lumeria-diagnostic-artifact-reference/v1",
              },
              delivery: "artifact",
              schema: "lumeria-diagnostic-artifact-delivery/v1",
            },
            ok: true,
            schema: "lumeria-diagnostic-result/v1",
          };
        }
        return { data: { ready: true }, ok: true, schema: "lumeria-diagnostic-result/v1" };
      },
      queryArtifact: async (request) => {
        artifactQueries.push(request);
        const content = request.representation === "text" ? artifactText : artifactJson;
        const text = content.slice(request.offset, request.offset + request.limit);
        const nextOffset = request.offset + text.length;
        return {
          data: {
            artifactId: request.artifactId,
            kind: request.representation === "text" ? "string" : "json",
            page: {
              hasMore: nextOffset < content.length,
              limit: request.limit,
              nextOffset,
              offset: request.offset,
              returned: text.length,
              total: content.length,
            },
            path: request.path || [],
            representation: request.representation,
            schema: "lumeria-diagnostic-artifact-page/v1",
            text,
          },
          ok: true,
          schema: "lumeria-diagnostic-result/v1",
        };
      },
      releaseArtifact: async (artifactId) => {
        artifactReleases.push(artifactId);
        return {
          data: { artifactId, released: true },
          ok: true,
          schema: "lumeria-diagnostic-result/v1",
        };
      },
    }),
  });

  const descriptor = await client.describe("render");
  assert(descriptor.title === "渲染诊断", "describe should unwrap successful diagnostic envelopes");
  const data = await client.invoke("render", "report.summary", { limit: 2 });
  assert(data.ready === true, "invoke should return envelope data");
  assert(calls[0].toolId === "render" && calls[0].params.limit === 2, "invoke should build the canonical request shape");

  const jsonDelivery = await client.invoke("render", "large-json");
  const artifactValue = await client.consumeArtifactValue(jsonDelivery, { chunkSize: 5 });
  assert(artifactValue.ready === true && artifactValue.items.length === 2, "artifact values should be reconstructed from bounded JSON pages");
  assert(artifactQueries.filter((request) => request.artifactId === "large-json").length > 1, "artifact consumption should follow pagination");
  assert(artifactQueries[0].representation === "json" && artifactQueries[0].offset === 0, "value consumption should request canonical JSON pages");
  assert(artifactReleases.includes("large-json"), "consumed artifact values should be released in the same operation");

  const textDelivery = await client.invoke("render", "large-text");
  const exportedText = await client.consumeArtifactText(textDelivery, { chunkSize: 3, path: ["content"] });
  assert(exportedText === artifactText, "artifact text should be reconstructed without JSON quoting");
  assert(artifactQueries.some((request) => request.representation === "text" && request.path[0] === "content"), "text consumption should preserve the requested path");
  assert(artifactReleases.includes("large-text"), "consumed artifact text should be released");

  const persistentDelivery = await client.invoke("render", "large-text");
  const persistentText = await client.readArtifactText(persistentDelivery, { chunkSize: 4, path: ["content"] });
  assert(persistentText === artifactText, "readArtifactText should support persistent artifacts");
  const releasesBeforeExplicitRelease = artifactReleases.length;
  await client.releaseArtifact(persistentDelivery);
  assert(artifactReleases.length === releasesBeforeExplicitRelease + 1, "persistent artifacts should support explicit release by delivery");

  const persistentJsonDelivery = await client.invoke("render", "large-json");
  const rawJson = await client.readArtifactJsonText(persistentJsonDelivery, { chunkSize: 6 });
  assert(rawJson === artifactJson, "readArtifactJsonText should preserve the serialized JSON representation");
  await client.releaseArtifact(persistentJsonDelivery);

  let operationFailure = null;
  try {
    await client.invoke("render", "fail");
  } catch (error) {
    operationFailure = error;
  }
  assert(operationFailure?.code === "render-probe-failed", "failed envelopes should retain stable error codes");
  assert(operationFailure?.details?.phase === "release", "failed envelopes should retain structured details");
  assert(operationFailure?.nextActions?.[0] === "重新捕获", "failed envelopes should retain next actions");

  const missingClient = createDiagnosticClient({ resolveDiagnostics: () => null });
  let unavailableFailure = null;
  try {
    await missingClient.describe("render");
  } catch (error) {
    unavailableFailure = error;
  }
  assert(unavailableFailure?.code === "diagnostics-hub-unavailable", "missing hubs should fail with a stable client code");
}
