interface DiagnosticErrorPayload {
  code: string;
  details: unknown;
  message: string;
  nextActions: string[];
}

interface DiagnosticErrorOptions {
  cause?: unknown;
  details?: unknown;
  nextActions?: readonly unknown[];
}

interface DiagnosticErrorFallback {
  code?: unknown;
  details?: unknown;
  message?: unknown;
  nextActions?: readonly unknown[];
}

export class DiagnosticError extends Error {
  declare readonly code: string;
  declare readonly details: unknown;
  declare readonly nextActions: string[];

  constructor(code: unknown, message: unknown, options: DiagnosticErrorOptions = {}) {
    super(String(message || code || "Diagnostic operation failed"), options.cause ? { cause: options.cause } : undefined);
    this.name = "DiagnosticError";
    this.code = String(code || "diagnostic-operation-failed");
    this.details = options.details ?? null;
    this.nextActions = Array.isArray(options.nextActions)
      ? options.nextActions.map((action) => String(action))
      : [];
  }
}

export function makeDiagnosticErrorPayload(
  error: unknown,
  fallback: DiagnosticErrorFallback = {},
): DiagnosticErrorPayload {
  if (error instanceof DiagnosticError) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
      nextActions: [...error.nextActions],
    };
  }
  return {
    code: String(fallback.code || "diagnostic-operation-failed"),
    details: fallback.details ?? null,
    message: String(fallback.message || (error as { message?: unknown } | null | undefined)?.message || error || "Diagnostic operation failed"),
    nextActions: Array.isArray(fallback.nextActions)
      ? fallback.nextActions.map((action) => String(action))
      : [],
  };
}

export function unsupportedDiagnosticOperation(toolId: unknown, operation: unknown): DiagnosticError {
  return new DiagnosticError(
    "diagnostic-operation-not-supported",
    `Diagnostic tool ${toolId} does not support operation ${operation || "(empty)"}`,
    {
      details: { operation: operation || null, toolId },
      nextActions: ["Call describe(toolId) to inspect supported operations"],
    },
  );
}
