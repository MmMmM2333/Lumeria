import { ref } from "vue";
import {
  createLaunchpadLayoutResizeObserver,
  registerLaunchpadLifecycleWatchers,
  runLaunchpadBeforeUnmountEffects,
  runLaunchpadMountedEffects,
} from "./useLaunchpadLifecycle.js";

function createLifecycleOptions() {
  const calls = [];
  const makeCall = (name) => () => calls.push(name);
  const refs = {
    rootRef: ref({ id: "root" }),
    headerRef: ref({ id: "header" }),
    searchRef: ref(null),
    desktopMainRef: ref({ $el: { id: "desktop" } }),
    pageDotsRef: ref({ id: "dots" }),
  };

  return {
    calls,
    options: {
      activePages: ref([]),
      backgroundImageOpacity: ref(46),
      backgroundImagePath: ref(null),
      backgroundSource: ref("systemMaterial"),
      backgroundEffect: ref("dimmed"),
      cancelLongPress: makeCall("cancelLongPress"),
      cancelPreviewRaf: makeCall("cancelPreviewRaf"),
      clearAltEditTimer: makeCall("clearAltEditTimer"),
      clearAppLaunchTimer: makeCall("clearAppLaunchTimer"),
      clearDesktopCloseTimer: makeCall("clearDesktopCloseTimer"),
      clearFolderAppLaunchTimer: makeCall("clearFolderAppLaunchTimer"),
      clearFolderCloseTimer: makeCall("clearFolderCloseTimer"),
      clearFolderCloseIconGhosts: makeCall("clearFolderCloseIconGhosts"),
      clearFolderOpenIconGhosts: makeCall("clearFolderOpenIconGhosts"),
      clearFolderPageTurn: makeCall("clearFolderPageTurn"),
      clearHomeRevealSettleTimer: makeCall("clearHomeRevealSettleTimer"),
      clearLaunchGhostTimer: makeCall("clearLaunchGhostTimer"),
      clearLayoutSaveNoticeTimer: makeCall("clearLayoutSaveNoticeTimer"),
      clearNativeEventListeners: makeCall("clearNativeEventListeners"),
      clearNativeSaveTimer: makeCall("clearNativeSaveTimer"),
      flushNativeLayoutSave: makeCall("flushNativeLayoutSave"),
      clearPageJumpRenderRange: makeCall("clearPageJumpRenderRange"),
      clearPageTurn: makeCall("clearPageTurn"),
      clearPendingTarget: makeCall("clearPendingTarget"),
      clearSettingsPanelCloseTimer: makeCall("clearSettingsPanelCloseTimer"),
      clearWarningDialogTimer: makeCall("clearWarningDialogTimer"),
      detachDragListeners: makeCall("detachDragListeners"),
      disconnectFolderViewportObserver: makeCall("disconnectFolderViewportObserver"),
      effectiveFolderIconSize: ref(64),
      filteredManagedApps: ref([]),
      folderCols: ref(5),
      folderIconSize: ref(64),
      folderIconSizeMode: ref("global"),
      folderRows: ref(7),
      folderViewportRef: ref(null),
      gridCols: ref(5),
      gridRows: ref(7),
      handleAltKeyUp: makeCall("handleAltKeyUp"),
      handleGlobalKeydown: makeCall("handleGlobalKeydown"),
      handleWindowBlur: makeCall("handleWindowBlur"),
      hiddenAppIds: ref([]),
      iconSize: ref(64),
      isSearchMode: ref(false),
      isTextlessMode: ref(false),
      launchTargetStatusById: ref({}),
      loadNativeLaunchpadData: makeCall("loadNativeLaunchpadData"),
      observeFolderViewport: makeCall("observeFolderViewport"),
      pages: ref([]),
      registerNativeEventListeners: () => {
        calls.push("registerNativeEventListeners");
        return Promise.resolve();
      },
      renderedFolder: ref(null),
      scanRoots: ref([]),
      scheduleFolderViewportMetrics: makeCall("scheduleFolderViewportMetrics"),
      scheduleLaunchTargetStatusCheck: makeCall("scheduleLaunchTargetStatusCheck"),
      scheduleNativeLayoutSave: makeCall("scheduleNativeLayoutSave"),
      schedulePageGridMetrics: makeCall("schedulePageGridMetrics"),
      showMissingLaunchTargetBadge: ref(true),
      syncManagedAppState: makeCall("syncManagedAppState"),
      updateFolderViewportHeight: makeCall("updateFolderViewportHeight"),
      updatePageGridMetrics: makeCall("updatePageGridMetrics"),
      visibleFolderRowCount: ref(7),
      windowEffectAppearance: ref("dark"),
      windowEffectMaterial: ref("acrylic"),
      ...refs,
    },
  };
}

function withMockWindow(run) {
  const originalWindow = globalThis.window;
  const events = [];
  globalThis.window = {
    addEventListener: (name, handler) => events.push(`add:${name}:${handler.name}`),
    removeEventListener: (name, handler) => events.push(`remove:${name}:${handler.name}`),
  };

  try {
    run(events);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

export async function runLaunchpadLifecycleTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad lifecycle test failed] ${message}`);
  };

  const watchers = [];
  const { options } = createLifecycleOptions();
  registerLaunchpadLifecycleWatchers(options, (source, callback, config) => {
    watchers.push({ source, callback, config });
  });
  assert(watchers.length === 7, "lifecycle should register all controller watchers");
  assert(watchers.every((item) => item.config.flush === "post"), "lifecycle watchers should flush after render");
  assert(watchers[0].callback === options.schedulePageGridMetrics, "layout setting watcher should refresh page metrics");
  assert(watchers[2].source === options.folderViewportRef, "folder viewport watcher should observe the viewport ref");
  assert(watchers[5].callback === options.scheduleLaunchTargetStatusCheck, "launch target watcher should refresh path status");
  assert(watchers[6].callback === options.syncManagedAppState, "managed app watcher should sync app state");

  const observed = [];
  const ObserverCtor = class {
    constructor(callback) {
      this.callback = callback;
    }

    observe(element) {
      observed.push(element.id);
    }

    disconnect() {}
  };
  const observer = createLaunchpadLayoutResizeObserver(options, ObserverCtor);
  assert(observer.callback === options.updatePageGridMetrics, "layout ResizeObserver should update page metrics");
  assert(observed.join(",") === "root,header,desktop,dots", "layout ResizeObserver should observe existing layout refs");
  assert(createLaunchpadLayoutResizeObserver(options, undefined) === null, "missing ResizeObserver should be ignored");

  withMockWindow((events) => {
    const { calls, options: mountedOptions } = createLifecycleOptions();
    const mountedObserver = runLaunchpadMountedEffects(mountedOptions, ObserverCtor);
    assert(mountedObserver, "mounted effects should return the layout resize observer");
    assert(events.join(",") === "add:keydown:,add:keyup:,add:blur:,add:resize:,add:resize:", "mounted effects should add global listeners in order");
    assert(
      calls.slice(0, 3).join(",") === "schedulePageGridMetrics,scheduleFolderViewportMetrics,registerNativeEventListeners",
      "mounted effects should schedule metrics before native data load"
    );
  });

  await Promise.resolve();

  let resolveNativeRegistration;
  const { calls: unmountedLoadCalls, options: unmountedLoadOptions } = createLifecycleOptions();
  unmountedLoadOptions.registerNativeEventListeners = () => {
    unmountedLoadCalls.push("registerNativeEventListeners");
    return new Promise((resolve) => {
      resolveNativeRegistration = resolve;
    });
  };
  const lifecycle = { active: false };
  withMockWindow(() => {
    const mountedObserver = runLaunchpadMountedEffects(unmountedLoadOptions, ObserverCtor, lifecycle);
    runLaunchpadBeforeUnmountEffects(unmountedLoadOptions, mountedObserver, lifecycle);
  });
  resolveNativeRegistration();
  await Promise.resolve();
  assert(!unmountedLoadCalls.includes("loadNativeLaunchpadData"), "native layout load should not run after unmount");

  withMockWindow((events) => {
    const { calls, options: unmountOptions } = createLifecycleOptions();
    const layoutObserver = { disconnect: () => calls.push("disconnectLayoutResizeObserver") };
    runLaunchpadBeforeUnmountEffects(unmountOptions, layoutObserver);
    assert(
      calls.join(",") === [
        "detachDragListeners",
        "cancelPreviewRaf",
        "clearPendingTarget",
        "clearPageTurn",
        "clearFolderPageTurn",
        "clearFolderOpenIconGhosts",
        "clearFolderCloseIconGhosts",
        "clearFolderCloseTimer",
        "clearFolderAppLaunchTimer",
        "clearSettingsPanelCloseTimer",
        "clearWarningDialogTimer",
        "clearHomeRevealSettleTimer",
        "clearDesktopCloseTimer",
        "clearAppLaunchTimer",
        "clearLaunchGhostTimer",
        "clearLayoutSaveNoticeTimer",
        "clearPageJumpRenderRange",
        "flushNativeLayoutSave",
        "clearNativeEventListeners",
        "cancelLongPress",
        "clearAltEditTimer",
        "disconnectLayoutResizeObserver",
        "disconnectFolderViewportObserver",
      ].join(","),
      "before-unmount effects should preserve cleanup order"
    );
    assert(events.join(",") === "remove:keydown:,remove:keyup:,remove:blur:,remove:resize:,remove:resize:", "before-unmount effects should remove global listeners in order");
  });
}
