import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NativeDataTransport } from "../src/native/nativeDataTransport.js";

// All writes are isolated. An optional layout supplies read-only scan roots.
const [label = "sample", layoutPath] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Invalid benchmark label");
mkdirSync("artifacts", { recursive: true });
const directory = mkdtempSync(resolve(`artifacts/data-benchmark-${label}-`));
const layout = JSON.parse(readFileSync(layoutPath ?? "src/domain/fixtures/layout-v2-roundtrip.json", "utf8"));
const roots = layoutPath ? layout.settings.scanRoots : [];
const filters = { keywordBlacklist: layout.settings.scanKeywordBlacklist,
  keywordAllowlist: layout.settings.scanKeywordAllowlist, appBlacklist: layout.settings.scanAppBlacklist };
const original = process.env.LUMERIA_NATIVE_DATA_DIR;
process.env.LUMERIA_NATIVE_DATA_DIR = directory;
const transport = new NativeDataTransport(resolve("target/release/lumeria_native_data.exe"));
if (original === undefined) delete process.env.LUMERIA_NATIVE_DATA_DIR;
else process.env.LUMERIA_NATIVE_DATA_DIR = original;
type Sample = { operation: string; ms: number; responseBytes: number; count?: number; stats?: unknown };
const samples: Sample[] = [];
async function measure(operation: string, fields: Record<string, unknown> = {}) {
  const start = performance.now();
  let result:unknown;
  if(operation==="loadIconChoices") {
    await transport.request("startIconChoicesLoad",fields);
    do {result=await transport.request("pollIconChoicesLoad");if(result===null)await new Promise(resolve=>setTimeout(resolve,25));} while(result===null);
  } else result=await transport.request(operation, fields);
  const value = result as { apps?: unknown[]; stats?: unknown } | null;
  samples.push({ operation, ms: performance.now() - start, responseBytes: Buffer.byteLength(JSON.stringify(result)),
    ...(Array.isArray(result) ? { count: result.length } : value?.apps ? { count: value.apps.length, stats: value.stats } : {}) });
  return result;
}
try {
  await measure("hello");
  await measure("saveLayout", { layout });
  for (let i = 0; i < 5; i++) await measure("loadLayout");
  for (let i = 0; i < 3; i++) {
    const result = await measure("scanApps", { roots, filters }) as { warnings: unknown[] };
    assert.equal(result.warnings.length, 0, "benchmark requires a complete scan");
  }
  for (let i = 0; i < 3; i++) await measure("loadIconChoices", { targetPath: join(process.env.SystemRoot!, "System32", "shell32.dll") });
  writeFileSync(join(directory, "summary.json"), JSON.stringify({ label, samples }, null, 2));
  console.log(JSON.stringify({ label, directory, samples }, null, 2));
} finally { await transport.dispose(); }
