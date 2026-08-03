import { DiagnosticError } from "./diagnosticError.js";

export const DIAGNOSTIC_PRESENTATIONS = Object.freeze(["structured", "json", "markdown"]);

export function createDiagnosticPresentation(data, options = {}) {
  const presentation = options.presentation === undefined ? "structured" : options.presentation;
  if (typeof presentation !== "string" || !DIAGNOSTIC_PRESENTATIONS.includes(presentation)) {
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
  };
}
