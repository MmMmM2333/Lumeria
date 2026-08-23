import {
  analyzeMotionReplayTrace,
  MOTION_REPLAY_ANALYSIS_SCHEMA,
  MOTION_REPLAY_FINDING_CODES,
} from "./motionReplayAnalyzer.js";
import { makeMotionReplayDocumentTestTrace } from "./motionReplayDocumentTests.js";

export function runMotionReplayAnalyzerTests(): void {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[motion replay analyzer test failed] ${message}`);
  }

  const analysis = analyzeMotionReplayTrace(makeMotionReplayDocumentTestTrace(), {
    documentId: "capture-analysis",
    generatedAt: "2026-08-02T02:00:00.000Z",
  });
  assert(analysis.schema === MOTION_REPLAY_ANALYSIS_SCHEMA, "analysis should expose a stable schema");
  assert(analysis.locale === "zh-CN" && analysis.title === "Motion 捕获分析", "human-facing analysis should default to Chinese");
  assert(analysis.documentId === "capture-analysis", "analysis should identify its source capture document");
  assert(!Object.hasOwn(analysis, "signals"), "the old unstructured signal list must not remain beside findings");
  assert(analysis.summary.status === "attention" && analysis.summary.highestSeverity === "warning", "explicit runtime warnings should raise the report status");
  assert(analysis.summary.headline.includes("需关注"), "summary should provide a readable Chinese conclusion");

  const byCode = Object.fromEntries(analysis.findings.map((finding) => [finding.code, finding]));
  const overshootFinding = byCode["motion.overshoot"];
  assert(overshootFinding !== undefined, "overshoot analysis should emit a finding");
  assert(MOTION_REPLAY_FINDING_CODES.includes("motion.overshoot"), "finding codes should be a stable machine-readable vocabulary");
  assert(overshootFinding.severity === "warning", "overshoot should be classified as a warning");
  assert(overshootFinding.confidence.level === "high", "captured warnings should produce high-confidence findings");
  assert(overshootFinding.title === "检测到过冲", "finding titles should be localized");
  assert(overshootFinding.observations.length > 0, "findings should state their observations");
  assert(overshootFinding.evidence[0]?.timeMs === 100, "findings should retain navigable evidence");
  assert(Array.isArray(overshootFinding.counterEvidence), "findings should expose counter-evidence even when empty");
  assert(overshootFinding.nextActions[0]?.operation === "replay.document.view", "next actions should be machine-invokable where possible");
  assert(overshootFinding.location.track.prop === "x", "findings should expose a stable navigation location");

  const metricIds = analysis.metrics.map((metric) => metric.id);
  assert(metricIds.includes("motion.max_abs_velocity") && metricIds.includes("capture.frame_count"), "metrics should use stable English ids");
  assert(analysis.dataQuality.metrics.frameCount === 3, "data quality should expose capture coverage facts");
  assert(["good", "limited", "insufficient"].includes(analysis.dataQuality.status), "data quality should expose a stable status");

  const filtered = analyzeMotionReplayTrace(makeMotionReplayDocumentTestTrace(), {
    filters: { query: "does-not-match" },
  });
  assert(filtered.findings.length === 0, "analysis filters should remove unrelated findings and metrics locations");
  assert(filtered.summary.status === "ok", "an empty filtered result should not retain warnings from outside the scope");
}
