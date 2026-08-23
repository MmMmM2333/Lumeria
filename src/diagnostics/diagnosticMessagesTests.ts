import {
  DEFAULT_DIAGNOSTIC_LOCALE,
  localizeDiagnosticDescriptor,
  translateDiagnosticMessage,
} from "./diagnosticMessages.js";

export function runDiagnosticMessagesTests(): void {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[diagnostic messages test failed] ${message}`);
  }

  assert(DEFAULT_DIAGNOSTIC_LOCALE === "zh-CN", "diagnostics should default to Simplified Chinese");
  assert(
    translateDiagnosticMessage("diagnostics.analysis.summary.attention", { infoCount: 2, warningCount: 1 })
      === "发现 1 项需关注问题，另有 2 项观测",
    "messages should interpolate named values without translating protocol fields",
  );

  const descriptor = localizeDiagnosticDescriptor({
    descriptionKey: "diagnostics.tools.motion.description",
    id: "motion",
    operations: [{ id: "replay.document.analyze", mutatesState: false }],
    titleKey: "diagnostics.tools.motion.title",
  });
  assert(descriptor.title === "Motion 动画诊断", "tool descriptors should expose a Chinese title");
  assert(typeof descriptor.description === "string" && descriptor.description.includes("捕获"), "tool descriptors should expose a readable Chinese description");
  const firstOperation = descriptor.operations[0];
  assert(firstOperation !== undefined, "localized descriptors should retain operations");
  assert(firstOperation.title === "分析捕获文档", "operation ids should receive Chinese presentation labels");
  assert(firstOperation.id === "replay.document.analyze", "localization must preserve stable operation ids");

  assert(
    translateDiagnosticMessage("diagnostics.tools.motion.title", {}, { locale: "en-US" })
      === "Motion diagnostics",
    "diagnostic messages should use the shared English catalog",
  );

  let unsupportedLocale: unknown = null;
  try {
    translateDiagnosticMessage("diagnostics.tools.motion.title", {}, { locale: "fr-FR" });
  } catch (error) {
    unsupportedLocale = error;
  }
  assert(
    unsupportedLocale instanceof Error && "code" in unsupportedLocale
      && unsupportedLocale.code === "diagnostic-locale-not-supported",
    "unknown locales should fail explicitly",
  );

  let missingMessage: unknown = null;
  try {
    translateDiagnosticMessage("diagnostics.messages.missing");
  } catch (error) {
    missingMessage = error;
  }
  assert(
    missingMessage instanceof Error && "code" in missingMessage
      && missingMessage.code === "diagnostic-message-not-found",
    "missing catalog entries should never silently fall back to keys",
  );
}
