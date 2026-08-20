import { createRuntimePerformanceMetrics } from "./runtimePerformanceMetrics.js";

export function runRuntimePerformanceMetricsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[runtime performance metrics test failed] ${message}`);
  };
  let time = 100;
  const metrics = createRuntimePerformanceMetrics({ maxSamples: 4, now: () => time });
  const finish = metrics.begin("render.frame");
  time += 5;
  assert(finish() === 5 && finish() === 0, "a phase finisher should record exactly once");
  for (const duration of [1, 2, 3, 20]) metrics.record("render.frame", duration);
  const firstMark = metrics.markOnce("scene.first-ready");
  time += 10;
  assert(metrics.markOnce("scene.first-ready") === firstMark, "milestones should retain their first occurrence");
  const snapshot = metrics.snapshot();
  assert(snapshot.metrics["render.frame"].count === 4, "metric samples should obey the bounded history");
  assert(snapshot.metrics["render.frame"].p50Ms === 2 && snapshot.metrics["render.frame"].p95Ms === 20, "metric snapshots should expose stable percentiles");
  assert(snapshot.marks["scene.first-ready"] === 5, "milestones should be relative to the current measurement origin");
  metrics.reset();
  assert(Object.keys(metrics.snapshot().metrics).length === 0, "reset should clear prior samples");
}
