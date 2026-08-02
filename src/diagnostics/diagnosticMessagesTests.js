import {
  DEFAULT_DIAGNOSTIC_LOCALE,
  localizeDiagnosticDescriptor,
  translateDiagnosticMessage,
} from "./diagnosticMessages.js";

export function runDiagnosticMessagesTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[diagnostic messages test failed] ${message}`);
  };

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
  assert(descriptor.description.includes("捕获"), "tool descriptors should expose a readable Chinese description");
  assert(descriptor.operations[0].title === "分析捕获文档", "operation ids should receive Chinese presentation labels");
  assert(descriptor.operations[0].id === "replay.document.analyze", "localization must preserve stable operation ids");

  let unsupportedLocale = null;
  try {
    translateDiagnosticMessage("diagnostics.tools.motion.title", {}, { locale: "en-US" });
  } catch (error) {
    unsupportedLocale = error;
  }
  assert(unsupportedLocale?.code === "diagnostic-locale-not-supported", "unsupported locales should fail explicitly");

  let missingMessage = null;
  try {
    translateDiagnosticMessage("diagnostics.messages.missing");
  } catch (error) {
    missingMessage = error;
  }
  assert(missingMessage?.code === "diagnostic-message-not-found", "missing catalog entries should never silently fall back to keys");
}
