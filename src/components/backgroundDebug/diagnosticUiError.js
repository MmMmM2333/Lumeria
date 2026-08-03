export function formatDiagnosticActionError(action, error, translate) {
  if (typeof translate !== "function") {
    throw new TypeError("formatDiagnosticActionError requires a translation function");
  }
  const code = String(error?.code || "diagnostic-operation-failed");
  const message = String(error?.message || error || translate("debug.errors.unknown"));
  const nextAction = Array.isArray(error?.nextActions) && error.nextActions[0]
    ? String(error.nextActions[0])
    : translate("debug.errors.nextAction");
  return translate("debug.errors.action", {
    action,
    code,
    message,
    nextAction,
  });
}
