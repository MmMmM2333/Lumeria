import { formatDiagnosticAnalysis } from "./diagnosticAnalysisFormatter.js";

function makeAnalysis() {
  return {
    dataQuality: {
      headline: "捕获数据完整，可用于分析",
      issues: [],
      status: "good",
    },
    findings: [{
      code: "motion.overshoot",
      confidence: { level: "high", score: 1 },
      counterEvidence: [{ message: "末帧已回到目标附近" }],
      evidence: [{ message: "x 在 70ms 越过目标", timeMs: 70 }],
      id: "finding-1",
      nextActions: [{ label: "检查 70ms 附近的轨道状态" }],
      observations: [{ message: "捕获记录了 overshoot warning" }],
      severity: "warning",
      title: "检测到过冲",
    }],
    locale: "zh-CN",
    metrics: [{ id: "capture.frame_count", label: "帧数", unit: "count", value: 3 }],
    schema: "lumeria-motion-replay-analysis/v1",
    summary: {
      headline: "发现 1 项需关注问题，另有 0 项观测",
      highestSeverity: "warning",
      status: "attention",
    },
    title: "Motion 捕获分析",
  };
}

export function runDiagnosticAnalysisFormatterTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[diagnostic analysis formatter test failed] ${message}`);
  };

  const markdown = formatDiagnosticAnalysis(makeAnalysis(), { format: "markdown" });
  assert(markdown.includes("# Motion 捕获分析"), "Markdown should begin with the localized report title");
  assert(markdown.includes("## 诊断发现") && markdown.includes("### [需关注 · 高置信] 检测到过冲"), "Markdown should make finding priority scannable");
  assert(markdown.includes("证据：x 在 70ms 越过目标"), "Markdown should retain evidence");
  assert(markdown.includes("反证：末帧已回到目标附近"), "Markdown should retain counter-evidence instead of hiding uncertainty");
  assert(markdown.includes("下一步：检查 70ms 附近的轨道状态"), "Markdown should retain executable next actions");

  const text = formatDiagnosticAnalysis(makeAnalysis(), { format: "text" });
  assert(text.includes("Motion 捕获分析") && text.includes("[需关注/高置信]"), "plain text should remain readable without Markdown rendering");

  let unsupportedFormat = null;
  try {
    formatDiagnosticAnalysis(makeAnalysis(), { format: "html" });
  } catch (error) {
    unsupportedFormat = error;
  }
  assert(unsupportedFormat?.code === "diagnostic-format-not-supported", "unknown formats should fail explicitly");
}
