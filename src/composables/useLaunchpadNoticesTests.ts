import { useLaunchpadNotices } from "./useLaunchpadNotices.js";
import { createLocalization } from "../i18n/localization.js";

export function runLaunchpadNoticesTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad notices test failed] ${message}`);
  };

  const localization = createLocalization({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" });
  const notices = useLaunchpadNotices({ localizationText: localization.text });
  const currentTransientNotice = () => notices.transientNotice.value;
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
  const retryNotice = currentTransientNotice();
  assert(retryNotice?.title === "布局暂未保存", "layout save failures should use the shared notice state");
  assert(retryNotice.detail === "disk unavailable", "layout failures should retain their diagnostic detail");
  retryNotice.onAction?.();
  assert(retryCount === 1, "shared notice actions should retain their callback");

  notices.showLayoutLoadFailed({ error: { message: "structured layout failure" } });
  assert(
    currentTransientNotice()?.detail === "structured layout failure",
    "layout failures should retain messages from structured platform errors",
  );
  notices.clearTransientNoticeTimer();
}
