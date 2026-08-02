import { DiagnosticError } from "./diagnosticError.js";
import {
  DEFAULT_DIAGNOSTIC_LOCALE,
  translateDiagnosticMessage,
} from "./diagnosticMessages.js";

export const DIAGNOSTIC_FORMATTED_ANALYSIS_SCHEMA = "lumeria-diagnostic-formatted-analysis/v1";

function message(key, locale) {
  return translateDiagnosticMessage(key, {}, { locale });
}

function severityLabel(severity, locale) {
  return message(`diagnostics.severity.${severity || "info"}`, locale);
}

function confidenceLabel(confidence, locale) {
  return message(`diagnostics.confidence.${confidence?.level || "low"}`, locale);
}

function formatMetric(metric = {}) {
  const unit = metric.unit && metric.unit !== "count" ? ` ${metric.unit}` : "";
  return `${metric.label || metric.id}: ${metric.value ?? "-"}${unit}`;
}

function formatFindingMarkdown(finding, locale) {
  const lines = [
    `### [${severityLabel(finding.severity, locale)} · ${confidenceLabel(finding.confidence, locale)}] ${finding.title}`,
  ];
  if (finding.message) lines.push("", finding.message);
  for (const observation of finding.observations || []) {
    lines.push(`- ${message("diagnostics.format.observations", locale)}：${observation.message}`);
  }
  for (const evidence of finding.evidence || []) {
    lines.push(`- ${message("diagnostics.format.evidence", locale)}：${evidence.message}`);
  }
  if ((finding.counterEvidence || []).length) {
    for (const counterEvidence of finding.counterEvidence) {
      lines.push(`- ${message("diagnostics.format.counterEvidence", locale)}：${counterEvidence.message}`);
    }
  } else {
    lines.push(`- ${message("diagnostics.format.counterEvidence", locale)}：${message("diagnostics.format.noCounterEvidence", locale)}`);
  }
  for (const action of finding.nextActions || []) {
    lines.push(`- ${message("diagnostics.format.nextActions", locale)}：${action.label}`);
  }
  return lines.join("\n");
}

function formatMarkdown(analysis, locale) {
  const lines = [
    `# ${analysis.title}`,
    "",
    `## ${message("diagnostics.format.summary", locale)}`,
    "",
    analysis.summary?.headline || "-",
  ];
  if ((analysis.metrics || []).length) {
    lines.push("", `## ${message("diagnostics.format.metrics", locale)}`, "");
    lines.push(...analysis.metrics.map((metric) => `- ${formatMetric(metric)}`));
  }
  lines.push("", `## ${message("diagnostics.format.findings", locale)}`, "");
  if ((analysis.findings || []).length) {
    lines.push(analysis.findings.map((finding) => formatFindingMarkdown(finding, locale)).join("\n\n"));
  } else {
    lines.push(analysis.summary?.headline || "-");
  }
  lines.push(
    "",
    `## ${message("diagnostics.format.dataQuality", locale)}`,
    "",
    analysis.dataQuality?.headline || "-",
  );
  for (const issue of analysis.dataQuality?.issues || []) lines.push(`- ${issue.message}`);
  return lines.join("\n");
}

function formatText(analysis, locale) {
  const lines = [analysis.title, analysis.summary?.headline || "-"];
  for (const metric of analysis.metrics || []) lines.push(`- ${formatMetric(metric)}`);
  for (const finding of analysis.findings || []) {
    lines.push(
      `[${severityLabel(finding.severity, locale)}/${confidenceLabel(finding.confidence, locale)}] ${finding.title}`,
      finding.message || "",
    );
    for (const evidence of finding.evidence || []) {
      lines.push(`  ${message("diagnostics.format.evidence", locale)}：${evidence.message}`);
    }
    for (const counterEvidence of finding.counterEvidence || []) {
      lines.push(`  ${message("diagnostics.format.counterEvidence", locale)}：${counterEvidence.message}`);
    }
    for (const action of finding.nextActions || []) {
      lines.push(`  ${message("diagnostics.format.nextActions", locale)}：${action.label}`);
    }
  }
  lines.push(`${message("diagnostics.format.dataQuality", locale)}：${analysis.dataQuality?.headline || "-"}`);
  return lines.filter(Boolean).join("\n");
}

export function formatDiagnosticAnalysis(analysis, options = {}) {
  if (!analysis || typeof analysis !== "object") {
    throw new TypeError("formatDiagnosticAnalysis requires an analysis object");
  }
  const locale = String(options.locale || analysis.locale || DEFAULT_DIAGNOSTIC_LOCALE);
  const format = String(options.format || "markdown");
  if (format === "markdown") return formatMarkdown(analysis, locale);
  if (format === "text") return formatText(analysis, locale);
  throw new DiagnosticError("diagnostic-format-not-supported", `诊断分析不支持输出格式 ${format}`, {
    details: { format, supportedFormats: ["markdown", "text"] },
    nextActions: ["使用 markdown 或 text 格式"],
  });
}
