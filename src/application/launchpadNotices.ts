import type { StateHost } from "./stateHost.js";
import { readErrorMessage } from "./errorMessage.js";
import type { TranslationPort } from "../i18n/translationPort.js";

export type LaunchpadNoticeIntent = "error" | "info" | "success" | "warning";

export type LaunchpadWarningDialog = Readonly<{
  cancelText?: string;
  confirmAppearance?: "outline";
  confirmText?: string;
  confirmTone?: "danger";
  intent?: LaunchpadNoticeIntent;
  message: string;
  onConfirm?: () => void;
  suggestion?: string;
  title: string;
}>;

export type LaunchpadLaunchErrorDialog = Readonly<{
  message?: string;
  suggestion?: string;
  title?: string;
}>;

export type LaunchpadTransientNotice = Readonly<{
  actionText: string;
  detail: string;
  intent: LaunchpadNoticeIntent;
  message: string;
  onAction: (() => void) | undefined;
  title: string;
}>;

export type LaunchpadTransientNoticeConfig = Readonly<{
  actionText?: string;
  detail?: string;
  durationMs?: number;
  intent?: LaunchpadNoticeIntent;
  message?: string;
  onAction?: (() => void) | undefined;
  title?: string;
}>;

export type LaunchpadLayoutFailureNoticeConfig = Readonly<{
  error?: unknown;
  onRetry?: (() => void) | undefined;
  retryCount?: number;
}>;

export type LaunchpadNoticesOptions = Readonly<{
  localizationText?: TranslationPort;
}>;

const WARNING_DIALOG_CLOSE_DURATION = 180;
const TRANSIENT_NOTICE_CLOSE_DURATION = 2200;

function getTimerHost(): typeof globalThis {
  return typeof window === "undefined" ? globalThis : window;
}

export function createLaunchpadNotices(options: LaunchpadNoticesOptions, state: StateHost) {
  const ref=state.cell,shallowRef=state.cell;
  const localizationText = options.localizationText;
  if (!localizationText || typeof localizationText.t !== "function") {
    throw new TypeError("createLaunchpadNotices requires localization text");
  }
  const t: TranslationPort["t"] = localizationText.t;
  const warningDialog = shallowRef<LaunchpadWarningDialog | null>(null);
  const isWarningDialogOpen = ref(false);
  const transientNotice = shallowRef<LaunchpadTransientNotice | null>(null);
  let warningDialogCloseTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let transientNoticeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  function clearWarningDialogTimer() {
    if (warningDialogCloseTimer) getTimerHost().clearTimeout(warningDialogCloseTimer);
    warningDialogCloseTimer = null;
  }

  function clearTransientNoticeTimer() {
    if (transientNoticeTimer) getTimerHost().clearTimeout(transientNoticeTimer);
    transientNoticeTimer = null;
  }

  function showWarningDialog(config: LaunchpadWarningDialog): void {
    clearWarningDialogTimer();
    warningDialog.value = config;
    isWarningDialogOpen.value = true;
  }

  function openWarningDialog(config: LaunchpadWarningDialog): void {
    showWarningDialog(config);
  }

  function openLaunchErrorDialog(config: LaunchpadLaunchErrorDialog): void {
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

  function closeTransientNotice() {
    clearTransientNoticeTimer();
    transientNotice.value = null;
  }

  function showTransientNotice(config: LaunchpadTransientNoticeConfig): void {
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

  function showLayoutSaveFailed(config: LaunchpadLayoutFailureNoticeConfig): void {
    const retryCount = Number(config?.retryCount) || 1;
    const detail = readErrorMessage(config?.error);
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

  function showLayoutLoadFailed(config: LaunchpadLayoutFailureNoticeConfig): void {
    const retryCount = Number(config?.retryCount) || 1;
    const detail = readErrorMessage(config?.error);
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
    closeTransientNotice,
    closeWarningDialog,
    confirmWarningDialog,
    isWarningDialogOpen,
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
