import { computed, nextTick, ref, shallowRef } from "vue";
import {
  APP_LAUNCH_DURATION,
  DESKTOP_CLOSE_DURATION,
} from "./launchpadConstants.js";
import { getElementFromRef } from "./usePageGridMetrics.js";

const PATH_LAUNCH_TARGET_KINDS = new Set(["shortcut", "executable", "url"]);

export function useLaunchpadLaunchFlow(options) {
  const isDesktopOpen = ref(true);
  const isDesktopClosing = ref(false);
  const isAppLaunching = ref(false);
  const launchGhost = shallowRef(null);
  let desktopCloseTimer = null;
  let appLaunchTimer = null;
  let launchGhostTimer = null;
  let launchPrepareRequestId = 0;

  const launchGhostStyle = computed(() => {
    const ghost = launchGhost.value;
    if (!ghost?.rect) return {};
    return {
      left: `${ghost.rect.left}px`,
      top: `${ghost.rect.top}px`,
      width: `${ghost.rect.width}px`,
      height: `${ghost.rect.height}px`,
    };
  });

  function isLaunchpadInteractionBlocked() {
    return Boolean(
      !isDesktopOpen.value ||
      isDesktopClosing.value ||
      isAppLaunching.value ||
      options.isFolderAppLaunchClosing.value ||
      options.isFolderZoomFadeClosing?.value
    );
  }

  function clearDesktopCloseTimer() {
    if (desktopCloseTimer) window.clearTimeout(desktopCloseTimer);
    desktopCloseTimer = null;
  }

  function clearAppLaunchTimer() {
    if (appLaunchTimer) window.clearTimeout(appLaunchTimer);
    appLaunchTimer = null;
  }

  function clearLaunchGhostTimer() {
    if (launchGhostTimer) window.clearTimeout(launchGhostTimer);
    launchGhostTimer = null;
  }

  function clearLaunchGhost() {
    clearLaunchGhostTimer();
    launchGhost.value = null;
  }

  function focusDesktopSurface() {
    options.keyboardFocusArea.value = "desktop";
    const element = getElementFromRef(options.desktopMainRef);
    element?.focus?.({ preventScroll: true });
  }

  function startAppLaunchGhost(app, launchSource) {
    const rect = options.getLaunchIconRect(launchSource);
    if (!rect) {
      clearLaunchGhost();
      return;
    }
    clearLaunchGhostTimer();
    launchGhost.value = { app: options.cloneItem(app), rect };
    launchGhostTimer = window.setTimeout(clearLaunchGhost, APP_LAUNCH_DURATION + 100);
  }

  function getLaunchPreflightError(app) {
    if (!options.shouldValidateLaunchTarget?.()) return null;
    const name = String(app?.name || "此应用");
    if (!app?.id) {
      return {
        title: "无法打开应用",
        message: `“${name}”缺少应用标识，无法打开。`,
        suggestion: "请重新添加此应用。",
      };
    }

    const target = app.launchTarget;
    if (!target) {
      return {
        title: "无法打开应用",
        message: `“${name}”没有启动路径。`,
        suggestion: "请在设置中重新选择启动文件。",
      };
    }

    const kind = String(target.kind || "");
    if (kind === "appUserModelId") {
      return {
        title: "无法打开应用",
        message: `暂不支持打开“${name}”的这种启动类型。`,
        suggestion: "请改用本地程序、快捷方式或链接。",
      };
    }
    if (!PATH_LAUNCH_TARGET_KINDS.has(kind)) {
      return {
        title: "无法打开应用",
        message: `“${name}”的启动类型无效。`,
        suggestion: "请重新选择启动文件。",
      };
    }
    if (!String(target.path || "").trim()) {
      return {
        title: "无法打开应用",
        message: `“${name}”的启动路径为空。`,
        suggestion: "请在设置中重新选择启动文件。",
      };
    }
    if (currentLaunchTargetStatus(app) === "missing") {
      return {
        title: "无法打开应用",
        message: `找不到“${name}”的启动文件。它可能已被移动、删除或卸载。`,
        suggestion: "请在设置中编辑此应用的启动路径。",
      };
    }
    return null;
  }

  function isPromiseLike(value) {
    return Boolean(value && typeof value.then === "function");
  }

  function currentLaunchTargetStatus(app) {
    if (typeof options.getLaunchTargetStatus === "function") return options.getLaunchTargetStatus(app);
    return options.launchTargetStatusById?.value?.[app.id] || null;
  }

  function closeDesktop(closeOptions) {
    if (options.isDragActive()) return;
    options.cancelLongPress();
    options.setNativeWindowEffectsEnabled(false);
    options.setNativeWindowShadowEnabled?.(false);
    const shouldClearSearchAfterClose = Boolean(closeOptions?.clearSearch && options.isSearchMode());
    options.clearSelectedIcon();
    options.keyboardFocusArea.value = "desktop";
    options.searchInputRef.value?.blur?.();
    isDesktopClosing.value = true;
    isDesktopOpen.value = false;
    clearDesktopCloseTimer();
    desktopCloseTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterClose) options.clearSearch({ keepSelection: false });
      isDesktopClosing.value = false;
      clearDesktopCloseTimer();
    }, DESKTOP_CLOSE_DURATION);
  }

  function openDesktop() {
    clearDesktopCloseTimer();
    clearAppLaunchTimer();
    clearLaunchGhost();
    options.clearOpeningIcon();
    const didClearFolderZoomFadeClose = Boolean(options.folderZoomFadeCloseReason?.value);
    if (options.folderZoomFadeCloseReason?.value) {
      options.finishFolderZoomFadeClose?.();
      options.clearFolderOpenIconGhosts?.();
      options.clearFolderCloseIconGhosts?.();
      options.finishHomeRevealSettleWindow?.();
    }
    if (!didClearFolderZoomFadeClose) options.startHomeRevealSettleWindow();
    isDesktopClosing.value = false;
    isAppLaunching.value = false;
    isDesktopOpen.value = true;
    options.keyboardFocusArea.value = "desktop";
    nextTick(() => {
      options.schedulePageGridMetrics();
      focusDesktopSurface();
    });
  }

  function startPreparedAppLaunch(app, source) {
    const launchSource = options.normalizeLaunchSource(app, source);
    const shouldClearSearchAfterLaunch = options.isSearchMode();
    const launchSession = {
      animationDone: false,
      error: null,
      shown: false,
    };
    startAppLaunchGhost(app, launchSource);
    options.openingIcon.value = launchSource;
    isAppLaunching.value = true;

    if (options.hasFolderLayer()) options.startFolderZoomFadeClose?.({ reason: "app-launch" });
    closeDesktop({ clearSearch: false });
    window.setTimeout(() => {
      Promise.resolve(options.launchNativeAppIfAvailable(app))
        .then((result) => {
          if (result && result !== true) {
            launchSession.error = result;
            maybeShowLaunchErrorAfterAnimation(launchSession);
          }
        })
        .catch((error) => {
          console.error(`Failed to launch ${app.name}`, error);
        });
    }, 0);

    clearAppLaunchTimer();
    appLaunchTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterLaunch) options.clearSearch({ keepSelection: false });
      options.clearOpeningIcon();
      isAppLaunching.value = false;
      clearAppLaunchTimer();
      launchSession.animationDone = true;
      Promise.resolve(options.hideNativeWindow())
        .finally(() => maybeShowLaunchErrorAfterAnimation(launchSession));
    }, APP_LAUNCH_DURATION);
  }

  function maybeShowLaunchErrorAfterAnimation(launchSession) {
    if (!launchSession || launchSession.shown || !launchSession.animationDone || !launchSession.error) return;
    launchSession.shown = true;
    options.showNativeLaunchError?.(launchSession.error);
  }

  function openApp(app, source) {
    if (!app || app.type !== "app" || options.isDragActive() || isLaunchpadInteractionBlocked()) return;
    const launchError = getLaunchPreflightError(app);
    if (launchError) {
      options.openLaunchErrorDialog?.(launchError);
      return;
    }

    const requestId = (launchPrepareRequestId += 1);
    const prepared = options.prepareNativeLaunch?.(app);
    if (!isPromiseLike(prepared)) {
      if (prepared === false) return;
      startPreparedAppLaunch(app, source);
      return;
    }

    prepared
      .then((ready) => {
        if (requestId !== launchPrepareRequestId || !ready) return;
        if (!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value || options.isDragActive()) return;
        startPreparedAppLaunch(app, source);
      })
      .catch((error) => {
        console.error(`Failed to prepare ${app.name} for launch`, error);
      });
  }

  return {
    clearAppLaunchTimer,
    clearDesktopCloseTimer,
    clearLaunchGhost,
    clearLaunchGhostTimer,
    closeDesktop,
    focusDesktopSurface,
    isAppLaunching,
    isDesktopClosing,
    isDesktopOpen,
    isLaunchpadInteractionBlocked,
    launchGhost,
    launchGhostStyle,
    openApp,
    openDesktop,
  };
}
