export type DiagnosticUiTranslate = (key: string, params?: Readonly<Record<string, unknown>>) => string;

interface DiagnosticUiErrorShape {
  code?: unknown;
  message?: unknown;
  nextActions?: unknown;
}

export function formatDiagnosticActionError(action: unknown, error: unknown, translate: DiagnosticUiTranslate): string {
  if (typeof translate !== "function") {
    throw new TypeError("formatDiagnosticActionError requires a translation function");
  }
  const details: DiagnosticUiErrorShape = error !== null && typeof error === "object" ? error : {};
  const code = String(details.code || "diagnostic-operation-failed");
  const message = String(details.message || error || translate("debug.errors.unknown"));
  const nextAction = Array.isArray(details.nextActions) && details.nextActions[0]
    ? String(details.nextActions[0])
    : translate("debug.errors.nextAction");
  return translate("debug.errors.action", {
    action,
    code,
    message,
    nextAction,
  });
}
