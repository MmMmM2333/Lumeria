import { formatDiagnosticActionError } from "./diagnosticUiError.js";
import { createLocalization } from "../../i18n/localization.js";

export function runDiagnosticUiErrorTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[diagnostic ui error test failed] ${message}`);
  };
  const chinese = createLocalization({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" }).text;
  const english = createLocalization({ issue: null, match: "exact", preference: "en-US", resolvedLocale: "en-US" }).text;
  const formatted = formatDiagnosticActionError("应用设置", {
    code: "diagnostic-params-invalid",
    message: "参数错误",
    nextActions: ["修正参数名"],
  }, chinese.t);
  assert(formatted.includes("应用设置失败"), "formatted errors should retain the user action");
  assert(formatted.includes("[diagnostic-params-invalid]"), "formatted errors should expose the machine code");
  assert(formatted.includes("参数错误") && formatted.includes("建议：修正参数名"), "formatted errors should expose the message and next action");
  const fallback = formatDiagnosticActionError("刷新", new Error("网络断开"), chinese.t);
  assert(fallback.includes("[diagnostic-operation-failed]") && fallback.includes("刷新实际状态"), "plain errors should receive explicit fallback diagnostics");
  const englishFormatted = formatDiagnosticActionError("Refresh", new Error("offline"), english.t);
  assert(englishFormatted.includes("Refresh failed") && englishFormatted.includes("suggestion:"), "formatted errors should follow the active locale");
}
