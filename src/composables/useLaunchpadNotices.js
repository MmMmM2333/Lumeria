import { shallowRef } from "vue";

export function useLaunchpadNotices() {
  const warningDialog = shallowRef(null);
  const layoutRecoveryNotice = shallowRef(null);

  function openWarningDialog(config) {
    warningDialog.value = config;
  }

  function closeWarningDialog() {
    warningDialog.value = null;
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
    closeLayoutRecoveryNotice,
    closeWarningDialog,
    confirmWarningDialog,
    handleLayoutRecovered,
    layoutRecoveryNotice,
    openWarningDialog,
    warningDialog,
  };
}
