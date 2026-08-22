import { DiagnosticError } from "./diagnosticError.js";

export const DIAGNOSTIC_PRESENTATIONS = Object.freeze(["structured", "json", "markdown"] as const);

type DiagnosticPresentation = (typeof DIAGNOSTIC_PRESENTATIONS)[number];

interface DiagnosticPresentationOptions<T> {
  formatMarkdown?: ((data: T) => string) | undefined;
  presentation?: unknown;
}

type DiagnosticPresentationResult<T> =
  | { data: T; mediaType: "application/json"; presentation: "structured" }
  | { content: string; mediaType: "application/json"; presentation: "json" }
  | { content: string; mediaType: "text/markdown"; presentation: "markdown" };

export function createDiagnosticPresentation<T>(
  data: T,
  options: DiagnosticPresentationOptions<T> = {},
): DiagnosticPresentationResult<T> {
  const presentation = options.presentation === undefined ? "structured" : options.presentation;
  if (typeof presentation !== "string" || !DIAGNOSTIC_PRESENTATIONS.includes(presentation as DiagnosticPresentation)) {
    throw new DiagnosticError("diagnostic-presentation-invalid", "The requested diagnostic result presentation is not supported", {
      details: { presentation, supportedPresentations: DIAGNOSTIC_PRESENTATIONS },
      nextActions: [`Use one of: ${DIAGNOSTIC_PRESENTATIONS.join(", ")}`],
    });
  }
  if (presentation === "structured") {
    return {
      data,
      mediaType: "application/json",
      presentation,
    };
  }
  if (presentation === "json") {
    return {
      content: JSON.stringify(data, null, 2),
      mediaType: "application/json",
      presentation,
    };
  }
  if (typeof options.formatMarkdown !== "function") {
    throw new TypeError("createDiagnosticPresentation requires formatMarkdown() for markdown output");
  }
  return {
    content: options.formatMarkdown(data),
    mediaType: "text/markdown",
    presentation,
  } as DiagnosticPresentationResult<T>;
}
