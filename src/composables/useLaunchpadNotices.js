import { ref, shallowRef } from "vue";

const WARNING_DIALOG_CLOSE_DURATION = 180;
const LAYOUT_SAVE_NOTICE_CLOSE_DURATION = 2200;

function getTimerHost() {
  return typeof window === "undefined" ? globalThis : window;
}

export function useLaunchpadNotices() {
  const warningDialog = shallowRef(null);
  const isWarningDialogOpen = ref(false);
  const layoutRecoveryNotice = shallowRef(null);
  const layoutSaveNotice = shallowRef(null);
  let warningDialogCloseTimer = null;
  let layoutSaveNoticeTimer = null;

  function clearWarningDialogTimer() {
    if (warningDialogCloseTimer) getTimerHost().clearTimeout(warningDialogCloseTimer);
    warningDialogCloseTimer = null;
  }

  function clearLayoutSaveNoticeTimer() {
    if (layoutSaveNoticeTimer) getTimerHost().clearTimeout(layoutSaveNoticeTimer);
    layoutSaveNoticeTimer = null;
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
      message: config?.message || "LaunchPad 无法打开此应用。",
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

  function closeLayoutSaveNotice() {
    clearLayoutSaveNoticeTimer();
    layoutSaveNotice.value = null;
  }

  function showLayoutSaveFailed(config) {
    clearLayoutSaveNoticeTimer();
    const retryCount = Number(config?.retryCount) || 1;
    const detail = String(config?.error?.message || config?.error || "").trim();
    layoutSaveNotice.value = {
      title: "布局暂未保存",
      message: retryCount > 1
        ? `本次更改仍在当前会话中，重启后可能丢失。已失败 ${retryCount} 次。`
        : "本次更改仍在当前会话中，重启后可能丢失。",
      detail,
      intent: "error",
      actionText: "重试",
      onAction: config?.onRetry,
    };
  }

  function showLayoutSaveRecovered() {
    clearLayoutSaveNoticeTimer();
    layoutSaveNotice.value = {
      title: "布局已保存",
      message: "之前未保存的更改已经写入。",
      intent: "success",
    };
    layoutSaveNoticeTimer = getTimerHost().setTimeout(closeLayoutSaveNotice, LAYOUT_SAVE_NOTICE_CLOSE_DURATION);
  }

  function showLayoutLoadFailed(config) {
    clearLayoutSaveNoticeTimer();
    const retryCount = Number(config?.retryCount) || 1;
    const detail = String(config?.error?.message || config?.error || "").trim();
    layoutSaveNotice.value = {
      title: "本地布局载入失败",
      message: retryCount > 1
        ? `当前更改不会保存。已失败 ${retryCount} 次。`
        : "当前更改不会保存，请重试载入本地布局。",
      detail,
      intent: "error",
      actionText: "重试",
      onAction: config?.onRetry,
    };
  }

  function showLayoutLoadRecovered() {
    clearLayoutSaveNoticeTimer();
    layoutSaveNotice.value = {
      title: "本地布局已载入",
      message: "之后的更改会正常保存。",
      intent: "success",
    };
    layoutSaveNoticeTimer = getTimerHost().setTimeout(closeLayoutSaveNotice, LAYOUT_SAVE_NOTICE_CLOSE_DURATION);
  }

  return {
    clearLayoutSaveNoticeTimer,
    clearWarningDialogTimer,
    closeLayoutRecoveryNotice,
    closeLayoutSaveNotice,
    closeWarningDialog,
    confirmWarningDialog,
    handleLayoutRecovered,
    isWarningDialogOpen,
    layoutRecoveryNotice,
    layoutSaveNotice,
    openLaunchErrorDialog,
    openWarningDialog,
    showLayoutLoadFailed,
    showLayoutLoadRecovered,
    showLayoutSaveFailed,
    showLayoutSaveRecovered,
    warningDialog,
  };
}
