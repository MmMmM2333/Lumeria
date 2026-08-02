export function formatDiagnosticActionError(action, error) {
  const code = String(error?.code || "diagnostic-operation-failed");
  const message = String(error?.message || error || "未知错误");
  const nextAction = Array.isArray(error?.nextActions) && error.nextActions[0]
    ? String(error.nextActions[0])
    : "刷新实际状态；若仍失败，查看控制台技术详情";
  return `${action}失败 [${code}]：${message}；建议：${nextAction}`;
}
