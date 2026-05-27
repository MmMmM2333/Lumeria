import { computed, nextTick, ref, shallowRef } from "vue";
import {
  APP_LAUNCH_DURATION,
  DESKTOP_CLOSE_DURATION,
} from "./launchpadConstants.js";
import { getElementFromRef } from "./usePageGridMetrics.js";

export function useLaunchpadLaunchFlow(options) {
  const isDesktopOpen = ref(true);
  const isDesktopClosing = ref(false);
  const isAppLaunching = ref(false);
  const launchGhost = shallowRef(null);
  let desktopCloseTimer = null;
  let appLaunchTimer = null;
  let launchGhostTimer = null;

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
    return Boolean(!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value || options.isFolderAppLaunchClosing.value);
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

  function closeDesktop(closeOptions) {
    if (options.isDragActive()) return;
    options.cancelLongPress();
    options.setNativeWindowEffectsEnabled(false);
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
    options.startHomeRevealSettleWindow();
    isDesktopClosing.value = false;
    isAppLaunching.value = false;
    isDesktopOpen.value = true;
    options.keyboardFocusArea.value = "desktop";
    nextTick(() => {
      options.schedulePageGridMetrics();
      focusDesktopSurface();
    });
  }

  function openApp(app, source) {
    if (!app || app.type !== "app" || options.isDragActive() || isLaunchpadInteractionBlocked()) return;

    const launchSource = options.normalizeLaunchSource(app, source);
    const shouldClearSearchAfterLaunch = options.isSearchMode();
    startAppLaunchGhost(app, launchSource);
    options.openingIcon.value = launchSource;
    isAppLaunching.value = true;

    if (options.hasFolderLayer()) options.startFolderAppLaunchClose();
    closeDesktop({ clearSearch: false });
    window.setTimeout(() => {
      options.launchNativeAppIfAvailable(app);
    }, 0);

    clearAppLaunchTimer();
    appLaunchTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterLaunch) options.clearSearch({ keepSelection: false });
      options.clearOpeningIcon();
      isAppLaunching.value = false;
      clearAppLaunchTimer();
      options.hideNativeWindow();
    }, APP_LAUNCH_DURATION);
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
