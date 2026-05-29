import { ref, shallowRef } from "vue";

const WARNING_DIALOG_CLOSE_DURATION = 180;

function getTimerHost() {
  return typeof window === "undefined" ? globalThis : window;
}

export function useLaunchpadNotices() {
  const warningDialog = shallowRef(null);
  const isWarningDialogOpen = ref(false);
  const layoutRecoveryNotice = shallowRef(null);
  let warningDialogCloseTimer = null;

  function clearWarningDialogTimer() {
    if (warningDialogCloseTimer) getTimerHost().clearTimeout(warningDialogCloseTimer);
    warningDialogCloseTimer = null;
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
    };
  }

  function closeLayoutRecoveryNotice() {
    layoutRecoveryNotice.value = null;
  }

  return {
    clearWarningDialogTimer,
    closeLayoutRecoveryNotice,
    closeWarningDialog,
    confirmWarningDialog,
    handleLayoutRecovered,
    isWarningDialogOpen,
    layoutRecoveryNotice,
    openLaunchErrorDialog,
    openWarningDialog,
    warningDialog,
  };
}
