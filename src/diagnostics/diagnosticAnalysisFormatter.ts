import { DiagnosticError } from "./diagnosticError.js";
import {
  DEFAULT_DIAGNOSTIC_LOCALE,
  translateDiagnosticMessage,
} from "./diagnosticMessages.js";

export const DIAGNOSTIC_FORMATTED_ANALYSIS_SCHEMA = "lumeria-diagnostic-formatted-analysis/v1" as const;

type DiagnosticMessageEntry = Readonly<{ message: string }>;

export interface DiagnosticAnalysisMetric {
  readonly id?: string;
  readonly label?: string;
  readonly unit?: string;
  readonly value?: unknown;
}

export interface DiagnosticAnalysisFinding {
  readonly confidence?: Readonly<{ level?: string; score?: number }>;
  readonly counterEvidence?: readonly DiagnosticMessageEntry[];
  readonly evidence?: readonly DiagnosticMessageEntry[];
  readonly message?: string;
  readonly nextActions?: readonly Readonly<{ label: string }>[];
  readonly observations?: readonly DiagnosticMessageEntry[];
  readonly severity?: string;
  readonly title: string;
}

export interface DiagnosticAnalysis {
  readonly dataQuality?: Readonly<{
    headline?: string;
    issues?: readonly DiagnosticMessageEntry[];
  }>;
  readonly findings?: readonly DiagnosticAnalysisFinding[];
  readonly locale?: string;
  readonly metrics?: readonly DiagnosticAnalysisMetric[];
  readonly summary?: Readonly<{ headline?: string }>;
  readonly title: string;
}

export interface DiagnosticAnalysisFormatOptions {
  readonly format?: unknown;
  readonly locale?: unknown;
}

function isDiagnosticAnalysis(value: unknown): value is DiagnosticAnalysis {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && "title" in value
    && typeof value.title === "string";
}

function message(key: string, locale: string): string {
  return translateDiagnosticMessage(key, {}, { locale });
}

function severityLabel(severity: unknown, locale: string): string {
  return message(`diagnostics.severity.${severity || "info"}`, locale);
}

function confidenceLabel(confidence: DiagnosticAnalysisFinding["confidence"], locale: string): string {
  return message(`diagnostics.confidence.${confidence?.level || "low"}`, locale);
}

function formatMetric(metric: DiagnosticAnalysisMetric = {}): string {
  const unit = metric.unit && metric.unit !== "count" ? ` ${metric.unit}` : "";
  return `${metric.label || metric.id}: ${metric.value ?? "-"}${unit}`;
}

function formatFindingMarkdown(finding: DiagnosticAnalysisFinding, locale: string): string {
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
  const counterEvidenceEntries = finding.counterEvidence || [];
  if (counterEvidenceEntries.length) {
    for (const counterEvidence of counterEvidenceEntries) {
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

function formatMarkdown(analysis: DiagnosticAnalysis, locale: string): string {
  const lines = [
    `# ${analysis.title}`,
    "",
    `## ${message("diagnostics.format.summary", locale)}`,
    "",
    analysis.summary?.headline || "-",
  ];
  const metrics = analysis.metrics || [];
  if (metrics.length) {
    lines.push("", `## ${message("diagnostics.format.metrics", locale)}`, "");
    lines.push(...metrics.map((metric) => `- ${formatMetric(metric)}`));
  }
  lines.push("", `## ${message("diagnostics.format.findings", locale)}`, "");
  const findings = analysis.findings || [];
  if (findings.length) {
    lines.push(findings.map((finding) => formatFindingMarkdown(finding, locale)).join("\n\n"));
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

function formatText(analysis: DiagnosticAnalysis, locale: string): string {
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

export function formatDiagnosticAnalysis(
  analysis: unknown,
  options: DiagnosticAnalysisFormatOptions = {},
): string {
  if (!isDiagnosticAnalysis(analysis)) {
    throw new TypeError("formatDiagnosticAnalysis requires an analysis object");
  }
  const locale = String(options.locale || analysis.locale || DEFAULT_DIAGNOSTIC_LOCALE);
  const format = String(options.format || "markdown");
  if (format === "markdown") return formatMarkdown(analysis, locale);
  if (format === "text") return formatText(analysis, locale);
  throw new DiagnosticError("diagnostic-format-not-supported", `Diagnostic analysis does not support output format ${format}`, {
    details: { format, supportedFormats: ["markdown", "text"] },
    nextActions: ["Use markdown or text format"],
  });
}
