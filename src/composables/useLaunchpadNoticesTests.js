import { useLaunchpadNotices } from "./useLaunchpadNotices.js";

export function runLaunchpadNoticesTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad notices test failed] ${message}`);
  };

  const notices = useLaunchpadNotices();
  notices.showTransientNotice({
    title: "已从启动台移除",
    message: "应用仍保留在系统中。",
    intent: "success",
    durationMs: 0,
  });
  assert(notices.transientNotice.value?.title === "已从启动台移除", "generic notices should expose the supplied title");
  assert(notices.transientNotice.value?.intent === "success", "generic notices should preserve their intent");
  notices.closeTransientNotice();
  assert(notices.transientNotice.value === null, "generic notices should be dismissible");

  let retryCount = 0;
  notices.showLayoutSaveFailed({
    error: new Error("disk unavailable"),
    retryCount: 2,
    onRetry: () => { retryCount += 1; },
  });
  assert(notices.transientNotice.value?.title === "布局暂未保存", "layout save failures should use the shared notice state");
  assert(notices.transientNotice.value?.detail === "disk unavailable", "layout failures should retain their diagnostic detail");
  notices.transientNotice.value?.onAction?.();
  assert(retryCount === 1, "shared notice actions should retain their callback");
  notices.clearTransientNoticeTimer();
}
