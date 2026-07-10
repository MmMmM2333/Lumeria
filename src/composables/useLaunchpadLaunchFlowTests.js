import { nextTick, ref, shallowRef } from "vue";
import {
  APP_LAUNCH_DURATION,
  DESKTOP_CLOSE_DURATION,
} from "./launchpadConstants.js";
import { useLaunchpadLaunchFlow } from "./useLaunchpadLaunchFlow.js";

const launchApp = { id: "launch-app", type: "app", name: "Launch App" };

function createTimerWindow() {
  let nextId = 1;
  const timers = new Map();

  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    runDelay(delay) {
      const matchingTimers = Array.from(timers.entries()).filter(([, timer]) => timer.delay === delay);
      for (const [id, timer] of matchingTimers) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    timers,
  };
}

function createLaunchFlow(overrides = {}) {
  const calls = {
    cancelLongPress: 0,
    clearOpeningIcon: 0,
    clearFolderCloseIconGhosts: 0,
    clearFolderOpenIconGhosts: 0,
    clearSearch: [],
    clearSelectedIcon: 0,
    finishFolderZoomFadeClose: 0,
    finishHomeRevealSettleWindow: 0,
    hideNativeWindow: 0,
    launchNativeAppIfAvailable: [],
    openLaunchErrorDialog: [],
    schedulePageGridMetrics: 0,
    setNativeWindowEffectsEnabled: [],
    setNativeWindowFrameEnabled: [],
    showNativeLaunchError: [],
    startFolderAppLaunchClose: 0,
    startFolderZoomFadeClose: [],
    startHomeRevealSettleWindow: 0,
  };
  const desktopFocusCalls = [];
  const desktopMainRef = ref({
    focus(options) {
      desktopFocusCalls.push(options);
    },
  });
  const keyboardFocusArea = ref(overrides.keyboardFocusArea ?? "search");
  const openingIcon = shallowRef(overrides.openingIcon ?? null);
  const folderZoomFadeCloseReason = ref(overrides.folderZoomFadeCloseReason ?? null);
  const searchInputRef = ref({
    blur() {
      calls.searchInputBlur = (calls.searchInputBlur || 0) + 1;
    },
  });

  const flow = useLaunchpadLaunchFlow({
    cancelLongPress: () => {
      calls.cancelLongPress += 1;
    },
    clearOpeningIcon: () => {
      calls.clearOpeningIcon += 1;
      openingIcon.value = null;
    },
    clearFolderCloseIconGhosts: () => {
      calls.clearFolderCloseIconGhosts += 1;
    },
    clearFolderOpenIconGhosts: () => {
      calls.clearFolderOpenIconGhosts += 1;
    },
    clearSearch: (options) => calls.clearSearch.push(options),
    clearSelectedIcon: () => {
      calls.clearSelectedIcon += 1;
    },
    cloneItem: (item) => ({ ...item }),
    desktopMainRef,
    getLaunchIconRect: () => overrides.launchRect ?? { left: 12, top: 24, width: 48, height: 56 },
    getLaunchTargetStatus: overrides.getLaunchTargetStatus,
    hasFolderLayer: () => Boolean(overrides.hasFolderLayer),
    hideNativeWindow: () => {
      calls.hideNativeWindow += 1;
    },
    finishFolderZoomFadeClose: () => {
      calls.finishFolderZoomFadeClose += 1;
      folderZoomFadeCloseReason.value = null;
    },
    finishHomeRevealSettleWindow: () => {
      calls.finishHomeRevealSettleWindow += 1;
    },
    folderZoomFadeCloseReason,
    isDragActive: () => Boolean(overrides.isDragActive),
    isFolderAppLaunchClosing: ref(Boolean(overrides.isFolderAppLaunchClosing)),
    isFolderZoomFadeClosing: ref(Boolean(overrides.isFolderZoomFadeClosing)),
    isSearchMode: () => Boolean(overrides.isSearchMode),
    keyboardFocusArea,
    launchNativeAppIfAvailable: (app) => {
      calls.launchNativeAppIfAvailable.push(app.id);
      return overrides.launchNativeAppResult ?? true;
    },
    launchTargetStatusById: ref(overrides.launchTargetStatusById || {}),
    normalizeLaunchSource: (app, source) => source ?? { area: "desktop", id: app.id, pageIndex: 0 },
    openLaunchErrorDialog: (config) => calls.openLaunchErrorDialog.push(config),
    openingIcon,
    prepareNativeLaunch: overrides.prepareNativeLaunch,
    schedulePageGridMetrics: () => {
      calls.schedulePageGridMetrics += 1;
    },
    searchInputRef,
    setNativeWindowEffectsEnabled: (enabled) => calls.setNativeWindowEffectsEnabled.push(enabled),
    setNativeWindowFrameEnabled: (enabled) => calls.setNativeWindowFrameEnabled.push(enabled),
    showNativeLaunchError: (error) => calls.showNativeLaunchError.push(error),
    shouldValidateLaunchTarget: () => Boolean(overrides.shouldValidateLaunchTarget),
    startFolderAppLaunchClose: () => {
      calls.startFolderAppLaunchClose += 1;
    },
    startFolderZoomFadeClose: (options) => {
      calls.startFolderZoomFadeClose.push(options);
      return true;
    },
    startHomeRevealSettleWindow: () => {
      calls.startHomeRevealSettleWindow += 1;
    },
  });

  return {
    calls,
    desktopFocusCalls,
    desktopMainRef,
    flow,
    keyboardFocusArea,
    openingIcon,
    searchInputRef,
  };
}

async function flushMicrotasks(count = 1) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

export async function runLaunchpadLaunchFlowTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad launch flow test failed] ${message}`);
  };
  const originalWindow = globalThis.window;
  const timers = createTimerWindow();
  globalThis.window = timers;

  try {
    const close = createLaunchFlow({ isSearchMode: true });
    close.flow.closeDesktop({ clearSearch: true });
    assert(!close.flow.isDesktopOpen.value, "closing the desktop should mark it closed immediately");
    assert(close.flow.isDesktopClosing.value, "closing the desktop should enter the closing state immediately");
    assert(close.calls.cancelLongPress === 1, "closing the desktop should cancel long press");
    assert(close.calls.clearSelectedIcon === 1, "closing the desktop should clear selected icon");
    assert(close.calls.searchInputBlur === 1, "closing the desktop should blur search input");
    assert(close.calls.setNativeWindowEffectsEnabled.join(",") === "false", "closing the desktop should disable native window effects");
    assert(close.calls.setNativeWindowFrameEnabled.join(",") === "false", "closing the desktop should disable the native window frame");
    timers.runDelay(DESKTOP_CLOSE_DURATION);
    assert(!close.flow.isDesktopClosing.value, "desktop close timer should end the closing state");
    assert(close.calls.clearSearch.length === 1, "desktop close should clear search after the close animation");
    assert(close.calls.clearSearch[0].keepSelection === false, "desktop close should clear search without keeping selection");

    const open = createLaunchFlow({ openingIcon: { area: "desktop", id: "old" } });
    open.flow.closeDesktop();
    open.flow.openDesktop();
    assert(open.flow.isDesktopOpen.value, "opening the desktop should mark it open");
    assert(!open.flow.isDesktopClosing.value, "opening the desktop should clear closing state");
    assert(!open.flow.isAppLaunching.value, "opening the desktop should clear launch state");
    assert(open.calls.clearOpeningIcon === 1, "opening the desktop should clear the opening icon");
    assert(open.calls.startHomeRevealSettleWindow === 1, "opening the desktop should start the home reveal settle window");
    await nextTick();
    assert(open.calls.schedulePageGridMetrics === 1, "opening the desktop should refresh page metrics on next tick");
    assert(open.keyboardFocusArea.value === "desktop", "opening the desktop should focus the desktop area");
    assert(open.desktopFocusCalls.length === 1, "opening the desktop should focus the desktop surface");
    assert(open.desktopFocusCalls[0].preventScroll === true, "desktop focus should prevent scroll");

    const reopenAfterFolderZoomFade = createLaunchFlow({
      folderZoomFadeCloseReason: "desktop",
      openingIcon: { area: "folder", id: "old" },
    });
    reopenAfterFolderZoomFade.flow.closeDesktop();
    reopenAfterFolderZoomFade.flow.openDesktop();
    assert(reopenAfterFolderZoomFade.flow.isDesktopOpen.value, "reopening after folder zoom-fade should mark desktop open");
    assert(reopenAfterFolderZoomFade.calls.finishFolderZoomFadeClose === 1, "reopening should finish folder zoom-fade state");
    assert(reopenAfterFolderZoomFade.calls.clearFolderOpenIconGhosts === 1, "reopening should clear folder open ghosts");
    assert(reopenAfterFolderZoomFade.calls.clearFolderCloseIconGhosts === 1, "reopening should clear folder close ghosts");
    assert(reopenAfterFolderZoomFade.calls.finishHomeRevealSettleWindow === 1, "reopening should clear stale home reveal settle state");
    assert(reopenAfterFolderZoomFade.calls.startHomeRevealSettleWindow === 0, "reopening after folder zoom-fade should not start home reveal settle");

    const source = { area: "desktop", id: "launch-app", pageIndex: 0 };
    const launch = createLaunchFlow({ hasFolderLayer: true, isSearchMode: true });
    launch.flow.openApp(launchApp, source);
    assert(launch.flow.isAppLaunching.value, "opening an app should enter launch state");
    assert(!launch.flow.isDesktopOpen.value, "opening an app should close the desktop");
    assert(launch.openingIcon.value === source, "opening an app should store the launch source");
    assert(launch.flow.launchGhost.value.app !== launchApp, "launch ghost should clone the app");
    assert(launch.flow.launchGhostStyle.value.left === "12px", "launch ghost style should expose rect geometry");
    assert(launch.calls.startFolderZoomFadeClose.length === 1, "folder app launches should start folder zoom-fade close");
    assert(launch.calls.startFolderZoomFadeClose[0].reason === "app-launch", "folder app launches should mark zoom-fade as app launch");
    assert(launch.calls.startFolderAppLaunchClose === 0, "folder app launches should not use the folder shrink-close path");
    assert(launch.calls.setNativeWindowFrameEnabled.join(",") === "false", "app launch close animation should disable the native window frame");
    timers.runDelay(0);
    assert(launch.calls.launchNativeAppIfAvailable.join(",") === "launch-app", "app launch should call native launch on a zero delay timer");
    timers.runDelay(APP_LAUNCH_DURATION);
    assert(!launch.flow.isAppLaunching.value, "app launch timer should end launch state");
    assert(launch.calls.clearSearch.length === 1, "app launch should clear search after the launch animation");
    assert(launch.calls.clearOpeningIcon === 1, "app launch should clear opening icon after the animation");
    assert(launch.calls.hideNativeWindow === 1, "app launch should hide the native window after the animation");
    timers.runDelay(APP_LAUNCH_DURATION + 100);
    assert(launch.flow.launchGhost.value === null, "launch ghost should clear after its timer");

    const launchError = {
      kind: "targetNotFound",
      title: "无法打开应用",
      message: "无法打开应用。",
      suggestion: "请检查路径。",
    };
    const failedLaunch = createLaunchFlow({ launchNativeAppResult: launchError });
    failedLaunch.flow.openApp(launchApp, source);
    timers.runDelay(0);
    await flushMicrotasks(2);
    assert(failedLaunch.calls.showNativeLaunchError.length === 0, "native launch errors should wait for the launch animation");
    timers.runDelay(APP_LAUNCH_DURATION);
    await flushMicrotasks(2);
    assert(failedLaunch.calls.hideNativeWindow === 1, "failed app launches should still hide the native window after animation");
    assert(failedLaunch.calls.showNativeLaunchError[0] === launchError, "native launch errors should show after the launch animation");

    const blockedByCriticalSave = createLaunchFlow({
      prepareNativeLaunch: () => false,
    });
    blockedByCriticalSave.flow.openApp(launchApp, source);
    assert(!blockedByCriticalSave.flow.isAppLaunching.value, "failed launch preparation should not start launch animation");
    timers.runDelay(0);
    assert(blockedByCriticalSave.calls.launchNativeAppIfAvailable.length === 0, "failed launch preparation should not call native launch");
    timers.runDelay(APP_LAUNCH_DURATION);
    assert(blockedByCriticalSave.calls.hideNativeWindow === 0, "failed launch preparation should not hide the native window");

    let resolvePrepareLaunch;
    const delayedPrepare = createLaunchFlow({
      prepareNativeLaunch: () => new Promise((resolve) => {
        resolvePrepareLaunch = resolve;
      }),
    });
    delayedPrepare.flow.openApp(launchApp, source);
    assert(!delayedPrepare.flow.isAppLaunching.value, "pending launch preparation should delay launch animation");
    resolvePrepareLaunch(true);
    await Promise.resolve();
    assert(delayedPrepare.flow.isAppLaunching.value, "successful async launch preparation should start launch animation");

    const dragBlocked = createLaunchFlow({ isDragActive: true });
    dragBlocked.flow.openApp(launchApp, source);
    assert(!dragBlocked.flow.isAppLaunching.value, "drag-active launches should be ignored");
    assert(dragBlocked.calls.launchNativeAppIfAvailable.length === 0, "drag-active launches should not call native launch");

    const zoomFadeBlocked = createLaunchFlow({ isFolderZoomFadeClosing: true });
    zoomFadeBlocked.flow.openApp(launchApp, source);
    assert(!zoomFadeBlocked.flow.isAppLaunching.value, "folder zoom-fade launches should be ignored");
    assert(zoomFadeBlocked.calls.launchNativeAppIfAvailable.length === 0, "folder zoom-fade launches should not call native launch");

    const missingTarget = createLaunchFlow({ shouldValidateLaunchTarget: true });
    missingTarget.flow.openApp(launchApp, source);
    assert(!missingTarget.flow.isAppLaunching.value, "missing launch targets should not start launch animation");
    assert(missingTarget.calls.openLaunchErrorDialog.length === 1, "missing launch targets should open an in-launchpad error dialog");

    const missingPath = createLaunchFlow({
      shouldValidateLaunchTarget: true,
      launchTargetStatusById: { "missing-app": "missing" },
    });
    missingPath.flow.openApp({
      id: "missing-app",
      type: "app",
      name: "Missing App",
      launchTarget: { kind: "shortcut", path: "C:/Missing.lnk" },
    }, source);
    assert(!missingPath.flow.isAppLaunching.value, "known missing paths should not start launch animation");
    assert(missingPath.calls.openLaunchErrorDialog[0].message.includes("找不到"), "known missing paths should explain that the file is missing");
    assert(missingPath.calls.openLaunchErrorDialog[0].suggestion.includes("编辑"), "known missing paths should put the suggestion in a separate field");

    const refreshedPath = createLaunchFlow({
      shouldValidateLaunchTarget: true,
      launchTargetStatusById: { "missing-app": "missing" },
      getLaunchTargetStatus: () => null,
    });
    refreshedPath.flow.openApp({
      id: "missing-app",
      type: "app",
      name: "Missing App",
      launchTarget: { kind: "shortcut", path: "C:/Fixed.lnk" },
    }, source);
    assert(refreshedPath.flow.isAppLaunching.value, "target-aware status lookup should ignore stale missing status for a changed path");
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}
