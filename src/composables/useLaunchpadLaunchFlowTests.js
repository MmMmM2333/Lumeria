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
    clearSearch: [],
    clearSelectedIcon: 0,
    hideNativeWindow: 0,
    launchNativeAppIfAvailable: [],
    schedulePageGridMetrics: 0,
    setNativeWindowEffectsEnabled: [],
    startFolderAppLaunchClose: 0,
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
    clearSearch: (options) => calls.clearSearch.push(options),
    clearSelectedIcon: () => {
      calls.clearSelectedIcon += 1;
    },
    cloneItem: (item) => ({ ...item }),
    desktopMainRef,
    getLaunchIconRect: () => overrides.launchRect ?? { left: 12, top: 24, width: 48, height: 56 },
    hasFolderLayer: () => Boolean(overrides.hasFolderLayer),
    hideNativeWindow: () => {
      calls.hideNativeWindow += 1;
    },
    isDragActive: () => Boolean(overrides.isDragActive),
    isFolderAppLaunchClosing: ref(Boolean(overrides.isFolderAppLaunchClosing)),
    isSearchMode: () => Boolean(overrides.isSearchMode),
    keyboardFocusArea,
    launchNativeAppIfAvailable: (app) => calls.launchNativeAppIfAvailable.push(app.id),
    normalizeLaunchSource: (app, source) => source ?? { area: "desktop", id: app.id, pageIndex: 0 },
    openingIcon,
    schedulePageGridMetrics: () => {
      calls.schedulePageGridMetrics += 1;
    },
    searchInputRef,
    setNativeWindowEffectsEnabled: (enabled) => calls.setNativeWindowEffectsEnabled.push(enabled),
    startFolderAppLaunchClose: () => {
      calls.startFolderAppLaunchClose += 1;
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

    const source = { area: "desktop", id: "launch-app", pageIndex: 0 };
    const launch = createLaunchFlow({ hasFolderLayer: true, isSearchMode: true });
    launch.flow.openApp(launchApp, source);
    assert(launch.flow.isAppLaunching.value, "opening an app should enter launch state");
    assert(!launch.flow.isDesktopOpen.value, "opening an app should close the desktop");
    assert(launch.openingIcon.value === source, "opening an app should store the launch source");
    assert(launch.flow.launchGhost.value.app !== launchApp, "launch ghost should clone the app");
    assert(launch.flow.launchGhostStyle.value.left === "12px", "launch ghost style should expose rect geometry");
    assert(launch.calls.startFolderAppLaunchClose === 1, "folder app launches should start folder launch close");
    timers.runDelay(0);
    assert(launch.calls.launchNativeAppIfAvailable.join(",") === "launch-app", "app launch should call native launch on a zero delay timer");
    timers.runDelay(APP_LAUNCH_DURATION);
    assert(!launch.flow.isAppLaunching.value, "app launch timer should end launch state");
    assert(launch.calls.clearSearch.length === 1, "app launch should clear search after the launch animation");
    assert(launch.calls.clearOpeningIcon === 1, "app launch should clear opening icon after the animation");
    assert(launch.calls.hideNativeWindow === 1, "app launch should hide the native window after the animation");
    timers.runDelay(APP_LAUNCH_DURATION + 100);
    assert(launch.flow.launchGhost.value === null, "launch ghost should clear after its timer");

    const dragBlocked = createLaunchFlow({ isDragActive: true });
    dragBlocked.flow.openApp(launchApp, source);
    assert(!dragBlocked.flow.isAppLaunching.value, "drag-active launches should be ignored");
    assert(dragBlocked.calls.launchNativeAppIfAvailable.length === 0, "drag-active launches should not call native launch");
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}
