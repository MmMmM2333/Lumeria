import { ref } from "vue";
import {
  createLaunchpadLayoutResizeObserver,
  registerLaunchpadLifecycleWatchers,
  runLaunchpadBeforeUnmountEffects,
  runLaunchpadMountedEffects,
} from "./useLaunchpadLifecycle.js";
import type {
  LaunchpadLifecycleOptions,
  LaunchpadLifecycleWatch,
  LaunchpadResizeObserverConstructor,
} from "./useLaunchpadLifecycle.js";

function mockElement(id: string): Element & { id: string } {
  return { id } as unknown as Element & { id: string };
}

function createLifecycleOptions() {
  const calls: string[] = [];
  const makeCall = (name: string) => () => { calls.push(name); };
  const refs = {
    rootRef: ref(mockElement("root")),
    headerRef: ref(mockElement("header")),
    searchRef: ref<Element | null>(null),
    desktopMainRef: ref({ $el: mockElement("desktop") }),
    pageDotsRef: ref(mockElement("dots")),
  };

  const options = {
      activePages: ref([]),
      backgroundAcrylicAppearance: ref<unknown>("system"),
      backgroundAcrylicBlurStrength: ref(50),
      backgroundAcrylicDarkParams: ref({ brightness: 0.8 }),
      backgroundAcrylicLightParams: ref({ brightness: 1 }),
      backgroundBaseColor: ref("#10141f"),
      backgroundBaseOpacity: ref(28),
      backgroundBlurStrength: ref(50),
      backgroundDarkenColor: ref("#1c1c1c"),
      backgroundDarkenStrength: ref(28),
      backgroundImageOpacity: ref(46),
      backgroundLiveDesktopOpacity: ref(100),
      backgroundImagePath: ref(null),
      backgroundSource: ref("systemMaterial"),
      backgroundEffect: ref("dimmed"),
      cancelInputGesture: makeCall("cancelInputGesture"),
      cancelPreviewRaf: makeCall("cancelPreviewRaf"),
      completeRendererStartup: () => {
        calls.push("completeRendererStartup");
        return Promise.resolve();
      },
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
      clearTransientNoticeTimer: makeCall("clearTransientNoticeTimer"),
      clearNativeEventListeners: makeCall("clearNativeEventListeners"),
      clearNativeSaveTimer: makeCall("clearNativeSaveTimer"),
      flushNativeLayoutSave: makeCall("flushNativeLayoutSave"),
      clearPageJumpRenderRange: makeCall("clearPageJumpRenderRange"),
      clearPageTurn: makeCall("clearPageTurn"),
      clearPendingTarget: makeCall("clearPendingTarget"),
      clearSettingsPanelCloseTimer: makeCall("clearSettingsPanelCloseTimer"),
      clearWarningDialogTimer: makeCall("clearWarningDialogTimer"),
      disposeInteractions: makeCall("disposeInteractions"),
      disconnectFolderViewportObserver: makeCall("disconnectFolderViewportObserver"),
      disposeSettingsPanelModel: makeCall("disposeSettingsPanelModel"),
      effectiveFolderIconSize: ref(64),
      filteredManagedApps: ref([]),
      folderCols: ref(5),
      folderIconSize: ref(64),
      folderIconSizeMode: ref("global"),
      folderRows: ref(7),
      folderViewportRef: ref(null),
      fullscreenOverscanEnabled: ref(true),
      gridCols: ref(5),
      gridRows: ref(7),
      handleAltKeyUp: makeCall("handleAltKeyUp"),
      handleGlobalKeydown: makeCall("handleGlobalKeydown"),
      handleWindowBlur: makeCall("handleWindowBlur"),
      hiddenAppIds: ref([]),
      iconSize: ref(64),
      isDesktopOpen: ref(true),
      isSearchMode: ref(false),
      isTextlessMode: ref(false),
      launchpadIconVariant: ref("light"),
      launchTargetStatusById: ref({}),
      loadNativeLaunchpadData: () => {
        calls.push("loadNativeLaunchpadData");
        return Promise.resolve(true);
      },
      observeFolderViewport: makeCall("observeFolderViewport"),
      pages: ref([]),
      registerNativeEventListeners: () => {
        calls.push("registerNativeEventListeners");
        return Promise.resolve();
      },
      renderedFolder: ref(null),
      scanAppBlacklist: ref([]),
      scanKeywordAllowlist: ref([]),
      scanKeywordBlacklist: ref([]),
      scanRoots: ref([]),
      scheduleFolderViewportMetrics: makeCall("scheduleFolderViewportMetrics"),
      scheduleLaunchTargetStatusCheck: makeCall("scheduleLaunchTargetStatusCheck"),
      scheduleNativeLayoutSave: makeCall("scheduleNativeLayoutSave"),
      schedulePageGridMetrics: makeCall("schedulePageGridMetrics"),
      setNativeWindowEffectsEnabled: makeCall("setNativeWindowEffectsEnabled"),
      settingsThemePreference: ref("dark"),
      showMissingLaunchTargetBadge: ref(true),
      showCustomTitlebar: ref(true),
      syncLiveDesktopBackgroundRuntime: makeCall("syncLiveDesktopBackgroundRuntime"),
      syncWindowsWallpaperRefreshTimer: makeCall("syncWindowsWallpaperRefreshTimer"),
      syncManagedAppState: makeCall("syncManagedAppState"),
      systemAppearance: ref("light"),
      updateFolderViewportHeight: makeCall("updateFolderViewportHeight"),
      updatePageGridMetrics: makeCall("updatePageGridMetrics"),
      visibleFolderRowCount: ref(7),
      windowMode: ref("fullscreen"),
      windowEffectAppearance: ref("dark"),
      windowEffectMaterial: ref("acrylic"),
      ...refs,
  } satisfies LaunchpadLifecycleOptions;
  return {
    calls,
    options,
  };
}

function withMockWindow(run: (events: string[]) => void) {
  const originalWindow = globalThis.window;
  const events: string[] = [];
  globalThis.window = {
    addEventListener: (name: string, handler: EventListener) => { events.push(`add:${name}:${handler.name}`); },
    removeEventListener: (name: string, handler: EventListener) => { events.push(`remove:${name}:${handler.name}`); },
  } as unknown as Window & typeof globalThis;

  try {
    run(events);
  } finally {
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else globalThis.window = originalWindow;
  }
}

export async function runLaunchpadLifecycleTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad lifecycle test failed] ${message}`);
  };

  const watchers: Array<{
    callback: (...args: unknown[]) => unknown;
    config: Readonly<{ flush: "post" }>;
    source: Parameters<LaunchpadLifecycleWatch>[0];
  }> = [];
  const { calls, options } = createLifecycleOptions();
  registerLaunchpadLifecycleWatchers(options, (source, callback, config) => {
    watchers.push({ source, callback, config });
  });
  const watcher = (index: number) => {
    const value = watchers[index];
    if (!value) throw new Error(`missing watcher ${index}`);
    return value;
  };
  const watcherSources = (index: number): readonly unknown[] => {
    const source = watcher(index).source;
    if (!Array.isArray(source)) throw new Error(`watcher ${index} does not have multiple sources`);
    return source;
  };
  assert(watchers.length === 10, "lifecycle should register all controller watchers");
  assert(watchers.every((item) => item.config.flush === "post"), "lifecycle watchers should flush after render");
  assert(watcher(0).callback === options.schedulePageGridMetrics, "layout setting watcher should refresh page metrics");
  assert(watcher(2).source === options.folderViewportRef, "folder viewport watcher should observe the viewport ref");
  assert(watcherSources(4).includes(options.backgroundBlurStrength), "layout save watcher should track background blur strength");
  assert(watcherSources(4).includes(options.backgroundAcrylicBlurStrength), "layout save watcher should track acrylic blur strength");
  assert(watcherSources(4).includes(options.backgroundLiveDesktopOpacity), "layout save watcher should track live desktop opacity");
  assert(watcherSources(4).includes(options.backgroundDarkenColor), "layout save watcher should track background darken color");
  assert(watcherSources(4).includes(options.backgroundDarkenStrength), "layout save watcher should track background darken strength");
  assert(watcherSources(4).includes(options.backgroundAcrylicAppearance), "layout save watcher should track acrylic appearance");
  assert(watcherSources(4).includes(options.backgroundAcrylicDarkParams), "layout save watcher should track acrylic dark params");
  assert(watcherSources(4).includes(options.backgroundAcrylicLightParams), "layout save watcher should track acrylic light params");
  assert(watcherSources(4).includes(options.windowMode), "layout save watcher should track window mode");
  assert(watcherSources(4).includes(options.fullscreenOverscanEnabled), "layout save watcher should track fullscreen overscan");
  assert(watcherSources(4).includes(options.showCustomTitlebar), "layout save watcher should track custom titlebar visibility");
  assert(watcherSources(4).includes(options.settingsThemePreference), "layout save watcher should track the settings theme preference");
  assert(watcherSources(4).includes(options.launchpadIconVariant), "layout save watcher should track the launchpad icon variant");
  assert(watcherSources(4).includes(options.scanKeywordAllowlist), "layout save watcher should track keyword exceptions");
  assert(watcher(5).callback === options.scheduleLaunchTargetStatusCheck, "launch target watcher should refresh path status");
  assert(watcher(6).callback === options.syncManagedAppState, "managed app watcher should sync app state");
  assert(watcher(7).callback === options.syncWindowsWallpaperRefreshTimer, "wallpaper source watcher should sync the wallpaper refresh timer");
  assert(watcher(8).callback === options.syncLiveDesktopBackgroundRuntime, "live desktop watcher should sync the native runtime");
  assert(watcherSources(8).includes(options.backgroundSource), "live desktop watcher should track background source");
  assert(watcherSources(8).includes(options.isDesktopOpen), "live desktop watcher should track desktop visibility");
  assert(watcherSources(8).includes(options.backgroundEffect), "live desktop watcher should track background effect");
  assert(watcherSources(8).includes(options.backgroundLiveDesktopOpacity), "live desktop watcher should track live desktop opacity");
  assert(watcherSources(8).includes(options.backgroundBlurStrength), "live desktop watcher should track blur strength");
  assert(watcherSources(8).includes(options.backgroundAcrylicBlurStrength), "live desktop watcher should track acrylic blur strength");
  assert(watcherSources(8).includes(options.backgroundDarkenColor), "live desktop watcher should track darken color");
  assert(watcherSources(8).includes(options.backgroundDarkenStrength), "live desktop watcher should track darken strength");
  assert(watcherSources(8).includes(options.backgroundAcrylicAppearance), "live desktop watcher should track acrylic appearance");
  assert(watcherSources(8).includes(options.backgroundAcrylicDarkParams), "live desktop watcher should track acrylic dark params");
  assert(watcherSources(8).includes(options.backgroundAcrylicLightParams), "live desktop watcher should track acrylic light params");
  assert(watcher(9).source === options.systemAppearance, "system appearance should own runtime appearance refreshes");
  watcher(9).callback();
  assert(calls.includes("syncLiveDesktopBackgroundRuntime"), "system acrylic should refresh the live desktop runtime when the system changes");
  assert(!calls.includes("setNativeWindowEffectsEnabled"), "explicit window appearance should ignore system changes");
  calls.length = 0;
  options.windowEffectAppearance.value = "system";
  options.backgroundAcrylicAppearance.value = "light";
  watcher(9).callback();
  assert(calls.join(",") === "setNativeWindowEffectsEnabled", "system window appearance should refresh only the native window material");

  const observed: string[] = [];
  let observerCallback: ResizeObserverCallback | null = null;
  const ObserverCtor = class {
    callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observerCallback = callback;
    }

    observe(element: Element) {
      observed.push((element as Element & { id: string }).id);
    }

    disconnect() {}
  } satisfies LaunchpadResizeObserverConstructor;
  const observer = createLaunchpadLayoutResizeObserver(options, ObserverCtor);
  assert(observer !== null, "available ResizeObserver should create a layout observer");
  assert(observerCallback === options.updatePageGridMetrics, "layout ResizeObserver should update page metrics");
  assert(observed.join(",") === "root,header,desktop,dots", "layout ResizeObserver should observe existing layout refs");
  assert(createLaunchpadLayoutResizeObserver(options, undefined) === null, "missing ResizeObserver should be ignored");

  let mountedCalls: string[] = [];
  withMockWindow((events) => {
    const { calls, options: mountedOptions } = createLifecycleOptions();
    mountedCalls = calls;
    const mountedObserver = runLaunchpadMountedEffects(mountedOptions, ObserverCtor);
    assert(mountedObserver, "mounted effects should return the layout resize observer");
    assert(events.join(",") === "add:keydown:,add:keyup:,add:blur:,add:resize:,add:resize:", "mounted effects should add global listeners in order");
    assert(
      calls.slice(0, 4).join(",") === "schedulePageGridMetrics,scheduleFolderViewportMetrics,registerNativeEventListeners,loadNativeLaunchpadData",
      "mounted effects should begin listener registration and native scene restore after scheduling metrics"
    );
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(
    mountedCalls.join(",") === "schedulePageGridMetrics,scheduleFolderViewportMetrics,registerNativeEventListeners,loadNativeLaunchpadData,completeRendererStartup",
    `mounted effects should report renderer startup only after listeners and native scene data are ready; received ${mountedCalls.join(",")}`
  );

  const registrationError = new Error("native listener registration failed");
  const { calls: failedRegistrationCalls, options: failedRegistrationOptions } = createLifecycleOptions();
  failedRegistrationOptions.registerNativeEventListeners = () => {
    failedRegistrationCalls.push("registerNativeEventListeners");
    return Promise.reject(registrationError);
  };
  const startupErrors: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args) => startupErrors.push(args);
  try {
    withMockWindow(() => {
      runLaunchpadMountedEffects(failedRegistrationOptions, ObserverCtor);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    console.error = originalConsoleError;
  }
  assert(!failedRegistrationCalls.includes("completeRendererStartup"), "failed native listeners must not report renderer startup readiness");
  assert(failedRegistrationCalls.includes("loadNativeLaunchpadData"), "native data loading should remain independent from renderer startup failure");
  assert(startupErrors.some((args) => args.includes(registrationError)), "native renderer startup failures should remain explicit");

  let resolveNativeRegistration: (() => void) | undefined;
  const { calls: unmountedLoadCalls, options: unmountedLoadOptions } = createLifecycleOptions();
  unmountedLoadOptions.registerNativeEventListeners = () => {
    unmountedLoadCalls.push("registerNativeEventListeners");
    return new Promise<void>((resolve) => {
      resolveNativeRegistration = resolve;
    });
  };
  const lifecycle = { active: false };
  withMockWindow(() => {
    const mountedObserver = runLaunchpadMountedEffects(unmountedLoadOptions, ObserverCtor, lifecycle);
    runLaunchpadBeforeUnmountEffects(unmountedLoadOptions, mountedObserver, lifecycle);
  });
  resolveNativeRegistration?.();
  await Promise.resolve();
  assert(unmountedLoadCalls.includes("loadNativeLaunchpadData"), "native scene restore should begin independently while listener registration is pending");
  assert(!unmountedLoadCalls.includes("completeRendererStartup"), "an unmounted renderer must not report scene readiness after pending startup work settles");

  const sceneLoadError = new Error("native scene restore failed");
  const { calls: failedLoadCalls, options: failedLoadOptions } = createLifecycleOptions();
  failedLoadOptions.loadNativeLaunchpadData = () => {
    failedLoadCalls.push("loadNativeLaunchpadData");
    return Promise.reject(sceneLoadError);
  };
  const failedLoadErrors: unknown[][] = [];
  console.error = (...args) => failedLoadErrors.push(args);
  try {
    withMockWindow(() => {
      runLaunchpadMountedEffects(failedLoadOptions, ObserverCtor);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    console.error = originalConsoleError;
  }
  assert(!failedLoadCalls.includes("completeRendererStartup"), "failed scene restore must not release the native startup gate");
  assert(failedLoadErrors.some((args) => args.includes(sceneLoadError)), "scene readiness failures should remain explicit");

  withMockWindow((events) => {
    const { calls, options: unmountOptions } = createLifecycleOptions();
    const layoutObserver = {
      disconnect: () => calls.push("disconnectLayoutResizeObserver"),
      observe: () => undefined,
    };
    runLaunchpadBeforeUnmountEffects(unmountOptions, layoutObserver);
    assert(
      calls.join(",") === [
        "disposeInteractions",
        "cancelPreviewRaf",
        "clearPendingTarget",
        "clearPageTurn",
        "clearFolderPageTurn",
        "clearFolderOpenIconGhosts",
        "clearFolderCloseIconGhosts",
        "clearFolderCloseTimer",
        "clearFolderAppLaunchTimer",
        "clearSettingsPanelCloseTimer",
        "disposeSettingsPanelModel",
        "clearWarningDialogTimer",
        "clearHomeRevealSettleTimer",
        "clearDesktopCloseTimer",
        "clearAppLaunchTimer",
        "clearLaunchGhostTimer",
        "clearTransientNoticeTimer",
        "clearPageJumpRenderRange",
        "flushNativeLayoutSave",
        "clearNativeEventListeners",
        "cancelInputGesture",
        "clearAltEditTimer",
        "disconnectLayoutResizeObserver",
        "disconnectFolderViewportObserver",
      ].join(","),
      "before-unmount effects should preserve cleanup order"
    );
    assert(events.join(",") === "remove:keydown:,remove:keyup:,remove:blur:,remove:resize:,remove:resize:", "before-unmount effects should remove global listeners in order");
  });
}
