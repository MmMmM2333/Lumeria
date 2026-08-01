import { ref, shallowRef } from "vue";

const WARNING_DIALOG_CLOSE_DURATION = 180;
const TRANSIENT_NOTICE_CLOSE_DURATION = 2200;

function getTimerHost() {
  return typeof window === "undefined" ? globalThis : window;
}

export function useLaunchpadNotices() {
  const warningDialog = shallowRef(null);
  const isWarningDialogOpen = ref(false);
  const layoutRecoveryNotice = shallowRef(null);
  const transientNotice = shallowRef(null);
  let warningDialogCloseTimer = null;
  let transientNoticeTimer = null;

  function clearWarningDialogTimer() {
    if (warningDialogCloseTimer) getTimerHost().clearTimeout(warningDialogCloseTimer);
    warningDialogCloseTimer = null;
  }

  function clearTransientNoticeTimer() {
    if (transientNoticeTimer) getTimerHost().clearTimeout(transientNoticeTimer);
    transientNoticeTimer = null;
  }

  function showWarningDialog(config) {
    clearWarningDialogTimer();
    warningDialog.value = config;
    isWarningDialogOpen.value = true;
  }

  function openWarningDialog(config) {
    showWarningDialog(config);
  }

  function openLaunchErrorDialog(config) {
    showWarningDialog({
      title: config?.title || "无法打开应用",
      message: config?.message || "Lumeria 无法打开此应用。",
      suggestion: config?.suggestion || "",
      intent: "error",
      confirmText: "知道了",
    });
  }

  function closeWarningDialog() {
    if (!warningDialog.value) return;
    isWarningDialogOpen.value = false;
    clearWarningDialogTimer();
    warningDialogCloseTimer = getTimerHost().setTimeout(() => {
      warningDialog.value = null;
      clearWarningDialogTimer();
    }, WARNING_DIALOG_CLOSE_DURATION);
  }

  function confirmWarningDialog() {
    const action = warningDialog.value?.onConfirm;
    closeWarningDialog();
    action?.();
  }

  function handleLayoutRecovered(event) {
    const payload = event?.payload || {};
    layoutRecoveryNotice.value = {
      title: "布局已恢复",
      message: "检测到布局文件损坏，已备份原文件并恢复默认布局。",
      backupPath: payload.backupPath || payload.backup_path || "",
      intent: "warning",
    };
  }

  function closeLayoutRecoveryNotice() {
    layoutRecoveryNotice.value = null;
  }

  function closeTransientNotice() {
    clearTransientNoticeTimer();
    transientNotice.value = null;
  }

  function showTransientNotice(config) {
    clearTransientNoticeTimer();
    transientNotice.value = {
      title: String(config?.title || "操作已完成"),
      message: String(config?.message || ""),
      detail: String(config?.detail || ""),
      intent: config?.intent || "info",
      actionText: config?.actionText || "",
      onAction: config?.onAction,
    };
    const durationMs = Number(config?.durationMs) || 0;
    if (durationMs > 0) {
      transientNoticeTimer = getTimerHost().setTimeout(closeTransientNotice, durationMs);
    }
  }

  function showLayoutSaveFailed(config) {
    const retryCount = Number(config?.retryCount) || 1;
    const detail = String(config?.error?.message || config?.error || "").trim();
    showTransientNotice({
      title: "布局暂未保存",
      message: retryCount > 1
        ? `本次更改仍在当前会话中，重启后可能丢失。已失败 ${retryCount} 次。`
        : "本次更改仍在当前会话中，重启后可能丢失。",
      detail,
      intent: "error",
      actionText: "重试",
      onAction: config?.onRetry,
    });
  }

  function showLayoutSaveRecovered() {
    showTransientNotice({
      title: "布局已保存",
      message: "之前未保存的更改已经写入。",
      intent: "success",
      durationMs: TRANSIENT_NOTICE_CLOSE_DURATION,
    });
  }

  function showLayoutLoadFailed(config) {
    const retryCount = Number(config?.retryCount) || 1;
    const detail = String(config?.error?.message || config?.error || "").trim();
    showTransientNotice({
      title: "本地布局载入失败",
      message: retryCount > 1
        ? `当前更改不会保存。已失败 ${retryCount} 次。`
        : "当前更改不会保存，请重试载入本地布局。",
      detail,
      intent: "error",
      actionText: "重试",
      onAction: config?.onRetry,
    });
  }

  function showLayoutLoadRecovered() {
    showTransientNotice({
      title: "本地布局已载入",
      message: "之后的更改会正常保存。",
      intent: "success",
      durationMs: TRANSIENT_NOTICE_CLOSE_DURATION,
    });
  }

  return {
    clearTransientNoticeTimer,
    clearWarningDialogTimer,
    closeLayoutRecoveryNotice,
    closeTransientNotice,
    closeWarningDialog,
    confirmWarningDialog,
    handleLayoutRecovered,
    isWarningDialogOpen,
    layoutRecoveryNotice,
    openLaunchErrorDialog,
    openWarningDialog,
    showLayoutLoadFailed,
    showLayoutLoadRecovered,
    showLayoutSaveFailed,
    showLayoutSaveRecovered,
    showTransientNotice,
    transientNotice,
    warningDialog,
  };
}
