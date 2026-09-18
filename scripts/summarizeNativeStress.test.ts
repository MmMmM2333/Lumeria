import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { summarizeNativeStress } from "./summarizeNativeStress.js";

const directory = mkdtempSync(join(tmpdir(), "native-stress-summary-"));
try {
  const base = { timeUtc: "2026-09-19T00:00:01Z", kind: "baseline", process: { rss: 100 }, js: { heapSize: 40, extraMemorySize: 5 }, nodes: { count: 10 } };
  const final = { ...base, timeUtc: "2026-09-19T00:00:10Z", kind: "settled", process: { rss: 120 } };
  writeFileSync(join(directory, "metrics.jsonl"), [base, { ...final, kind: "periodic", process: { rss: 999 } }, final].map(value => JSON.stringify(value)).join("\n"));
  const windows = join(directory, "Lumeria-memory-test"); mkdirSync(windows);
  writeFileSync(join(windows, "samples.jsonl"), [
    { timeUtc: "2026-09-19T00:00:02Z", privateBytes: 200, privateWorkingSetBytes: 90 },
    { timeUtc: "2026-09-19T00:00:11Z", privateBytes: 210, privateWorkingSetBytes: null, counterError: "unavailable" },
  ].map(value => JSON.stringify(value)).join("\n"));
  await summarizeNativeStress(directory);
  const report = JSON.parse(readFileSync(join(directory, "summary.json"), "utf8"));
  assert.equal(report.peaks.rss, 999); assert.equal(report.lastCheckpoint.process.rss, 120);
  assert.equal(report.windowsFirst.privateBytes, 200); assert.equal(report.windowsLast.privateWorkingSetBytes, null);
  assert.equal(report.windowsMatchDeltaMs.first, 1000); assert.deepEqual(report.warnings, ["unavailable"]);
  writeFileSync(join(windows, "samples.jsonl"), JSON.stringify({ timeUtc: "2026-09-18T00:00:02Z", privateBytes: 200 }));
  await summarizeNativeStress(directory);
  const stale = JSON.parse(readFileSync(join(directory, "summary.json"), "utf8"));
  assert.equal(stale.windowsFirst, undefined); assert.equal(stale.windowsLast, undefined);
  assert.ok(stale.warnings.some((value: string) => value.includes("within 3 seconds")));
} finally { rmSync(directory, { recursive: true, force: true }); }
console.log("Stress summary aligns checkpoints, preserves missing counters and rejects stale samples");
