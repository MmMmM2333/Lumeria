import { ref, shallowRef } from "vue";

const WARNING_DIALOG_CLOSE_DURATION = 180;
const TRANSIENT_NOTICE_CLOSE_DURATION = 2200;

function getTimerHost() {
  return typeof window === "undefined" ? globalThis : window;
}

export function useLaunchpadNotices(options) {
  const t = options?.localizationText?.t;
  if (typeof t !== "function") throw new TypeError("useLaunchpadNotices requires localization text");
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
      title: config?.title || t("errors.launch.genericTitle"),
      message: config?.message || t("errors.launch.genericMessage"),
      suggestion: config?.suggestion || "",
      intent: "error",
      confirmText: t("notices.acknowledge"),
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
      title: t("notices.layoutRecovered.title"),
      message: t("notices.layoutRecovered.message"),
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
      title: String(config?.title || t("notices.completed")),
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
      title: t("notices.layoutSaveFailed.title"),
      message: retryCount > 1
        ? t("notices.layoutSaveFailed.messageRepeated", { count: retryCount })
        : t("notices.layoutSaveFailed.message"),
      detail,
      intent: "error",
      actionText: t("notices.retry"),
      onAction: config?.onRetry,
    });
  }

  function showLayoutSaveRecovered() {
    showTransientNotice({
      title: t("notices.layoutSaveRecovered.title"),
      message: t("notices.layoutSaveRecovered.message"),
      intent: "success",
      durationMs: TRANSIENT_NOTICE_CLOSE_DURATION,
    });
  }

  function showLayoutLoadFailed(config) {
    const retryCount = Number(config?.retryCount) || 1;
    const detail = String(config?.error?.message || config?.error || "").trim();
    showTransientNotice({
      title: t("notices.layoutLoadFailed.title"),
      message: retryCount > 1
        ? t("notices.layoutLoadFailed.messageRepeated", { count: retryCount })
        : t("notices.layoutLoadFailed.message"),
      detail,
      intent: "error",
      actionText: t("notices.retry"),
      onAction: config?.onRetry,
    });
  }

  function showLayoutLoadRecovered() {
    showTransientNotice({
      title: t("notices.layoutLoadRecovered.title"),
      message: t("notices.layoutLoadRecovered.message"),
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
