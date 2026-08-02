import { formatDiagnosticActionError } from "./diagnosticUiError.js";

export function runDiagnosticUiErrorTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[diagnostic ui error test failed] ${message}`);
  };
  const formatted = formatDiagnosticActionError("应用设置", {
    code: "diagnostic-params-invalid",
    message: "参数错误",
    nextActions: ["修正参数名"],
  });
  assert(formatted.includes("应用设置失败"), "formatted errors should retain the user action");
  assert(formatted.includes("[diagnostic-params-invalid]"), "formatted errors should expose the machine code");
  assert(formatted.includes("参数错误") && formatted.includes("建议：修正参数名"), "formatted errors should expose the message and next action");
  const fallback = formatDiagnosticActionError("刷新", new Error("网络断开"));
  assert(fallback.includes("[diagnostic-operation-failed]") && fallback.includes("刷新实际状态"), "plain errors should receive explicit fallback diagnostics");
}
