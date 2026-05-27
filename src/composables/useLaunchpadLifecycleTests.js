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
      cancelLongPress: makeCall("cancelLongPress"),
      cancelPreviewRaf: makeCall("cancelPreviewRaf"),
      clearAltEditTimer: makeCall("clearAltEditTimer"),
      clearAppLaunchTimer: makeCall("clearAppLaunchTimer"),
      clearDesktopCloseTimer: makeCall("clearDesktopCloseTimer"),
      clearFolderAppLaunchTimer: makeCall("clearFolderAppLaunchTimer"),
      clearFolderCloseTimer: makeCall("clearFolderCloseTimer"),
      clearFolderPageTurn: makeCall("clearFolderPageTurn"),
      clearHomeRevealSettleTimer: makeCall("clearHomeRevealSettleTimer"),
      clearLaunchGhostTimer: makeCall("clearLaunchGhostTimer"),
      clearNativeEventListeners: makeCall("clearNativeEventListeners"),
      clearNativeSaveTimer: makeCall("clearNativeSaveTimer"),
      clearPageJumpRenderRange: makeCall("clearPageJumpRenderRange"),
      clearPageTurn: makeCall("clearPageTurn"),
      clearPendingTarget: makeCall("clearPendingTarget"),
      clearSettingsPanelCloseTimer: makeCall("clearSettingsPanelCloseTimer"),
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
      loadNativeLaunchpadData: makeCall("loadNativeLaunchpadData"),
      observeFolderViewport: makeCall("observeFolderViewport"),
      pages: ref([]),
      registerNativeEventListeners: () => {
        calls.push("registerNativeEventListeners");
        return Promise.resolve();
      },
      renderedFolder: ref(null),
      scheduleFolderViewportMetrics: makeCall("scheduleFolderViewportMetrics"),
      scheduleNativeLayoutSave: makeCall("scheduleNativeLayoutSave"),
      schedulePageGridMetrics: makeCall("schedulePageGridMetrics"),
      syncManagedAppState: makeCall("syncManagedAppState"),
      updateFolderViewportHeight: makeCall("updateFolderViewportHeight"),
      updatePageGridMetrics: makeCall("updatePageGridMetrics"),
      visibleFolderRowCount: ref(7),
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
  assert(watchers.length === 6, "lifecycle should register all controller watchers");
  assert(watchers.every((item) => item.config.flush === "post"), "lifecycle watchers should flush after render");
  assert(watchers[0].callback === options.schedulePageGridMetrics, "layout setting watcher should refresh page metrics");
  assert(watchers[2].source === options.folderViewportRef, "folder viewport watcher should observe the viewport ref");
  assert(watchers[5].callback === options.syncManagedAppState, "managed app watcher should sync app state");

  const observed = [];
  const ObserverCtor = class {
    constructor(callback) {
      this.callback = callback;
    }

    observe(element) {
      observed.push(element.id);
    }
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
        "clearFolderCloseTimer",
        "clearFolderAppLaunchTimer",
        "clearSettingsPanelCloseTimer",
        "clearHomeRevealSettleTimer",
        "clearDesktopCloseTimer",
        "clearAppLaunchTimer",
        "clearLaunchGhostTimer",
        "clearPageJumpRenderRange",
        "clearNativeSaveTimer",
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
