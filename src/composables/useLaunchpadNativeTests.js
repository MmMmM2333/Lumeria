import { ref, shallowRef } from "vue";
import { setLaunchpadApiBridgeForTests } from "../api/launchpadApi.js";
import { useLaunchpadNative } from "./useLaunchpadNative.js";
import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
  DEFAULT_BACKGROUND_BASE_COLOR,
  DEFAULT_BACKGROUND_BASE_OPACITY,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_MATERIAL_NONE,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_MICA,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
} from "./useLaunchpadSettingsConfig.js";

function makeOptions(overrides = {}) {
  const { pages: initialPages, ...optionOverrides } = overrides;
  const calls = {
    commitFolderPageIndex: [],
    commitPageIndex: [],
    commitSearchPageIndex: [],
    schedulePageGridMetrics: 0,
  };
  const pages = shallowRef(initialPages ?? [[]]);
  const options = {
    clampIconSize: (value) => Number(value) || 64,
    cloneItem: (item) => (item ? { ...item } : item),
    clonePages: (sourcePages) => sourcePages.map((page) => page.filter(Boolean).map((item) => ({ ...item }))),
    collectAppsFromPages: (sourcePages) => sourcePages.flatMap((page) => page.filter((item) => item?.type === "app")),
    closeDesktop: () => {},
    commitFolderPageIndex: (value) => calls.commitFolderPageIndex.push(value),
    commitPageIndex: (value) => calls.commitPageIndex.push(value),
    commitSearchPageIndex: (value) => calls.commitSearchPageIndex.push(value),
    createLayoutSnapshot: (state) => ({ version: 1, pages: state.pages, settings: state }),
    draftCols: ref(6),
    draftFolderCols: ref(4),
    draftFolderIconSize: ref(64),
    draftFolderIconSizeMode: ref("global"),
    draftFolderRows: ref(3),
    draftBackgroundBaseColor: ref(DEFAULT_BACKGROUND_BASE_COLOR),
    draftBackgroundBaseOpacity: ref(DEFAULT_BACKGROUND_BASE_OPACITY),
    draftBackgroundImageOpacity: ref(46),
    draftBackgroundImagePath: ref(null),
    draftBackgroundImageUrl: ref(null),
    draftBackgroundSource: ref(BACKGROUND_SOURCE_SYSTEM_MATERIAL),
    draftBackgroundEffect: ref(BACKGROUND_EFFECT_DIMMED),
    draftIconSize: ref(64),
    draftIsTextlessMode: ref(false),
    draftRows: ref(4),
    draftWindowEffectAppearance: ref(WINDOW_EFFECT_APPEARANCE_DARK),
    draftWindowEffectMaterial: ref(WINDOW_EFFECT_MATERIAL_ACRYLIC),
    folderCols: ref(4),
    folderIconSize: ref(64),
    folderIconSizeMode: ref("global"),
    folderPageIndex: ref(0),
    folderRows: ref(3),
    gridCols: ref(6),
    gridRows: ref(4),
    handleLayoutRecovered: () => {},
    showLayoutLoadFailed: () => {},
    showLayoutLoadRecovered: () => {},
    showLayoutSaveFailed: () => {},
    showLayoutSaveRecovered: () => {},
    hiddenAppIds: ref([]),
    iconSize: ref(64),
    isDesktopOpen: ref(true),
    isTextlessMode: ref(false),
    backgroundBaseColor: ref(DEFAULT_BACKGROUND_BASE_COLOR),
    backgroundBaseOpacity: ref(DEFAULT_BACKGROUND_BASE_OPACITY),
    backgroundImageOpacity: ref(46),
    backgroundImagePath: ref(null),
    backgroundImageUrl: ref(null),
    backgroundSource: ref(BACKGROUND_SOURCE_SYSTEM_MATERIAL),
    backgroundEffect: ref(BACKGROUND_EFFECT_DIMMED),
    windowEffectAppearance: ref(WINDOW_EFFECT_APPEARANCE_DARK),
    windowEffectMaterial: ref(WINDOW_EFFECT_MATERIAL_ACRYLIC),
    windowEffectsSupport: ref({
      platform: "unknown",
      build: null,
      supportsAcrylic: false,
      supportsMica: false,
      supportsMicaAlt: false,
    }),
    launchTargetStatusById: ref({}),
    mergeNativeCatalogWithSavedLayout: (apps) => [apps],
    openDesktop: () => {},
    openSettingsPanel: () => {},
    pageIndex: ref(0),
    pages,
    scanAppBlacklist: ref([]),
    scanKeywordBlacklist: ref([]),
    scanRoots: ref([{ id: "root", type: "customDirectory", label: "Root", path: "C:/Apps", enabled: true }]),
    schedulePageGridMetrics: () => {
      calls.schedulePageGridMetrics += 1;
    },
    searchPageIndex: ref(0),
    showMissingLaunchTargetBadge: ref(true),
    ...optionOverrides,
  };
  return { calls, options };
}

function withMockTauri(invoke, run, bridgeOverrides = {}) {
  const originalWindow = globalThis.window;
  const timers = [];
  const defaultEffectsSupport = {
    platform: "windows",
    build: 22621,
    supportsAcrylic: true,
    supportsMica: true,
    supportsMicaAlt: true,
  };
  setLaunchpadApiBridgeForTests({
    convertFileSrc: (path) => `asset://${path}`,
    invoke: (command, args) => {
      if (command === "get_main_window_effects_support" && !bridgeOverrides.passWindowEffectsSupport) {
        return defaultEffectsSupport;
      }
      if (command === "set_main_window_effects_enabled" && !bridgeOverrides.passWindowEffectsCommand) {
        return null;
      }
      return invoke(command, args);
    },
    listen: bridgeOverrides.listen || (async () => () => {}),
  });
  globalThis.window = {
    clearTimeout: (timer) => {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    },
    setTimeout: (callback) => {
      timers.push(callback);
      return callback;
    },
  };

  return Promise.resolve()
    .then(() => run(timers))
    .finally(() => {
      setLaunchpadApiBridgeForTests(null);
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    });
}

async function flushMicrotasks(count = 1) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

export async function runLaunchpadNativeTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad native test failed] ${message}`);
  };

  const initialSaveLayouts = [];
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") return null;
    if (command === "scan_apps") {
      assert(args.roots.length === 1 && args.roots[0].id === "root", "initial native scan should use enabled scan roots");
      return [
        { id: "win-app-good", name: "Good", launchTarget: { kind: "shortcut", path: "C:/Apps/Good.lnk" } },
        { id: "win-app-blocked", name: "Blocked", launchTarget: { kind: "shortcut", path: "C:/Apps/Blocked.lnk" } },
      ];
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      initialSaveLayouts.push(args.layout);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { calls, options } = makeOptions({
      pages: [[{ id: "mock", type: "app", name: "Mock" }]],
      scanAppBlacklist: ref([{ path: "C:/Apps/Blocked.lnk" }]),
    });
    const native = useLaunchpadNative(options);
    assert(native.isNativeLayoutReady.value === false, "native layout should not be ready before the initial native load");

    await native.loadNativeLaunchpadData();
    await Promise.all(timers.splice(0).map((timer) => timer()));

    assert(native.isNativeLayoutReady.value === true, "native layout should be ready after the initial native load");
    assert(options.pages.value[0].map((app) => app.id).join(",") === "win-app-good", "missing native layout should replace mock pages with scanned apps");
    assert(Boolean(options.scanRoots.value[0].lastScannedAt), "initial native scan should mark roots as scanned");
    assert(initialSaveLayouts.length === 1, "initial native scan should be persisted after load completes");
    assert(initialSaveLayouts[0].pages[0][0].id === "win-app-good", "initial native save should include scanned apps");
    assert(initialSaveLayouts[0].settings.backgroundSource === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "native saves should include background source");
    assert(initialSaveLayouts[0].settings.backgroundEffect === BACKGROUND_EFFECT_DIMMED, "native saves should include background effect");
    assert(initialSaveLayouts[0].settings.backgroundBaseColor === DEFAULT_BACKGROUND_BASE_COLOR, "native saves should include background base color");
    assert(initialSaveLayouts[0].settings.backgroundBaseOpacity === DEFAULT_BACKGROUND_BASE_OPACITY, "native saves should include background base opacity");
    assert(initialSaveLayouts[0].settings.backgroundImageOpacity === 46, "native saves should include background image opacity");
    assert(initialSaveLayouts[0].settings.backgroundImagePath === null, "native saves should include an empty background image path");
    assert(calls.commitPageIndex.join(",") === "0", "initial native load should reclamp desktop page");
    assert(calls.schedulePageGridMetrics === 1, "initial native load should refresh grid metrics");
  });

  let loadAttempts = 0;
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      loadAttempts += 1;
      if (loadAttempts === 1) throw new Error("layout locked");
      return {
        version: 1,
        pages: [[{ id: "loaded-app", type: "app", name: "Loaded", launchTarget: { kind: "shortcut", path: "Loaded.lnk" } }]],
        settings: { textless: true },
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const originalConsoleError = console.error;
    const loadFailures = [];
    let loadRecoveredCount = 0;
    console.error = () => {};
    try {
      const { options } = makeOptions({
        mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
        showLayoutLoadFailed: (config) => loadFailures.push(config),
        showLayoutLoadRecovered: () => {
          loadRecoveredCount += 1;
        },
      });
      const native = useLaunchpadNative(options);

      await native.loadNativeLaunchpadData();
      assert(native.isNativeLayoutReady.value === false, "failed native layout loads should keep native layout readiness false");
      assert(loadFailures.length === 1, "failed native loads should surface a persistent notice");
      assert(typeof loadFailures[0].onRetry === "function", "failed native loads should expose retry action");

      native.scheduleNativeLayoutSave();
      assert(timers.length === 0, "native saves should not be scheduled while the layout is not ready");

      await loadFailures[0].onRetry();
      assert(native.isNativeLayoutReady.value === true, "successful layout retry should mark the native layout ready");
      assert(loadAttempts === 2, "layout load retry should attempt to load again");
      assert(loadRecoveredCount === 1, "successful layout retry should surface a recovered notice");
      assert(options.pages.value[0][0].id === "loaded-app", "successful layout retry should apply the loaded layout");
      assert(options.isTextlessMode.value === true, "successful layout retry should apply textless mode");
      assert(options.draftIsTextlessMode.value === true, "successful layout retry should sync the textless draft");
    } finally {
      console.error = originalConsoleError;
    }
  });

  const effectsCommands = [];
  await withMockTauri(async (command, args) => {
    if (command === "get_main_window_effects_support") {
      return {
        platform: "windows",
        build: 22621,
        supportsAcrylic: true,
        supportsMica: true,
        supportsMicaAlt: true,
      };
    }
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{ id: "effects-app", type: "app", name: "Effects", launchTarget: { kind: "shortcut", path: "Effects.lnk" } }]],
        settings: {
          windowEffectMaterial: WINDOW_EFFECT_MATERIAL_MICA_ALT,
          windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
          backgroundBaseColor: "#ABC",
          backgroundBaseOpacity: 73,
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_DIMMED,
          backgroundImageOpacity: 64,
          backgroundImagePath: "C:/Images/wallpaper.webp",
        },
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "set_main_window_effects_enabled") {
      effectsCommands.push(args);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.windowEffectsSupport.value.supportsMica === true && options.windowEffectsSupport.value.supportsMicaAlt === true, "native load should apply window effect support");
    assert(options.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA_ALT, "native load should apply saved window effect material");
    assert(options.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "native load should apply saved window effect appearance");
    assert(options.backgroundBaseColor.value === "#aabbcc", "native load should apply saved background base color");
    assert(options.backgroundBaseOpacity.value === 73, "native load should apply saved background base opacity");
    assert(options.backgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "native load should apply saved background source");
    assert(options.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "native load should apply saved background effect");
    assert(options.backgroundImageOpacity.value === 64, "native load should apply saved background opacity");
    assert(options.backgroundImagePath.value === "C:/Images/wallpaper.webp", "native load should apply saved background image path");
    assert(options.backgroundImageUrl.value === "asset://C:/Images/wallpaper.webp", "native load should derive a background image asset url");
    assert(options.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "native load should sync background source draft");
    assert(options.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "native load should sync background effect draft");
    assert(options.draftBackgroundBaseColor.value === "#aabbcc", "native load should sync background base color draft");
    assert(options.draftBackgroundBaseOpacity.value === 73, "native load should sync background base opacity draft");
    assert(options.draftBackgroundImageOpacity.value === 64, "native load should sync background opacity draft");
    assert(options.draftBackgroundImagePath.value === "C:/Images/wallpaper.webp", "native load should sync background image path draft");
    assert(options.draftBackgroundImageUrl.value === "asset://C:/Images/wallpaper.webp", "native load should sync background image url draft");
    assert(effectsCommands.length === 1, "native load should refresh window effects once");
    assert(effectsCommands[0].enabled === true, "window effect refresh should enable effects");
    assert(effectsCommands[0].material === WINDOW_EFFECT_MATERIAL_MICA_ALT, "window effect refresh should pass the selected material");
    assert(effectsCommands[0].appearance === WINDOW_EFFECT_APPEARANCE_LIGHT, "window effect refresh should pass the selected appearance");
  }, {
    passWindowEffectsCommand: true,
    passWindowEffectsSupport: true,
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{ id: "acrylic-app", type: "app", name: "Acrylic", launchTarget: { kind: "shortcut", path: "Acrylic.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_ACRYLIC_WEBGL,
          backgroundImagePath: "C:/Images/acrylic.webp",
        },
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.backgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "native load should apply custom image source for webgl acrylic");
    assert(options.backgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL, "native load should preserve webgl acrylic background effect");
    assert(options.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL, "native load should sync webgl acrylic draft effect");
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{ id: "blur-app", type: "app", name: "Blur", launchTarget: { kind: "shortcut", path: "Blur.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_BLUR,
          backgroundImagePath: "C:/Images/blur.webp",
        },
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.backgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "native load should apply custom image source for blur");
    assert(options.backgroundEffect.value === BACKGROUND_EFFECT_BLUR, "native load should preserve blur background effect");
    assert(options.draftBackgroundEffect.value === BACKGROUND_EFFECT_BLUR, "native load should sync blur draft effect");
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_ACRYLIC_WEBGL,
          backgroundImagePath: null,
        },
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.backgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "native load should fall back when webgl acrylic has no image path");
    assert(options.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "native load should reset webgl acrylic without an image path");
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
          backgroundEffect: BACKGROUND_EFFECT_BLUR,
          backgroundImagePath: null,
        },
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.backgroundSource.value === BACKGROUND_SOURCE_SYSTEM_MATERIAL, "native load should fall back when blur has no image path");
    assert(options.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "native load should reset blur without an image path");
  });

  const wallpaperSaves = [];
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{ id: "wallpaper-app", type: "app", name: "Wallpaper", launchTarget: { kind: "shortcut", path: "Wallpaper.lnk" } }]],
        settings: {
          backgroundSource: BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
          backgroundEffect: BACKGROUND_EFFECT_DIMMED,
          backgroundImageOpacity: 72,
          backgroundImagePath: "C:/Cached/old-wallpaper.jpg",
        },
      };
    }
    if (command === "get_desktop_wallpaper_background") {
      return { name: "Windows wallpaper", imagePath: "C:/Cached/current-wallpaper.jpg" };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      wallpaperSaves.push(args.layout);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);
    await Promise.all(timers.splice(0).map((timer) => timer()));

    assert(options.backgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER, "native load should keep windows wallpaper as the background source");
    assert(options.backgroundImagePath.value === "C:/Cached/current-wallpaper.jpg", "native load should refresh the cached desktop wallpaper path");
    assert(options.backgroundImageUrl.value === "asset://C:/Cached/current-wallpaper.jpg", "native load should derive the refreshed wallpaper asset url");
    assert(wallpaperSaves.length === 1, "refreshed desktop wallpaper backgrounds should be persisted after native load");
    assert(wallpaperSaves[0].settings.backgroundImagePath === "C:/Cached/current-wallpaper.jpg", "persisted layouts should include the refreshed wallpaper path");
  });

  await withMockTauri(async (command) => {
    if (command === "get_main_window_effects_support") {
      return {
        platform: "windows",
        build: 19045,
        supportsAcrylic: true,
        supportsMica: false,
        supportsMicaAlt: false,
      };
    }
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[]],
        settings: {
          windowEffectMaterial: "mica",
          windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
        },
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "set_main_window_effects_enabled") return null;
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_ACRYLIC, "unsupported saved mica material should fall back to acrylic");
    assert(options.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "material fallback should preserve saved appearance");
  }, {
    passWindowEffectsCommand: true,
    passWindowEffectsSupport: true,
  });

  await withMockTauri(async (command) => {
    if (command === "get_main_window_effects_support") {
      return {
        platform: "windows",
        build: 22000,
        supportsAcrylic: true,
        supportsMica: true,
        supportsMicaAlt: false,
      };
    }
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[]],
        settings: {
          windowEffectMaterial: WINDOW_EFFECT_MATERIAL_MICA_ALT,
          windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
        },
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "set_main_window_effects_enabled") return null;
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA, "unsupported saved mica alt material should fall back to mica when available");
    assert(options.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "mica alt fallback should preserve saved appearance");
  }, {
    passWindowEffectsCommand: true,
    passWindowEffectsSupport: true,
  });

  await withMockTauri(async (command) => {
    if (command === "get_main_window_effects_support") {
      return {
        platform: "windows",
        build: 10240,
        supportsAcrylic: false,
        supportsMica: false,
        supportsMicaAlt: false,
      };
    }
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[]],
        settings: {
          windowEffectMaterial: WINDOW_EFFECT_MATERIAL_NONE,
          windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
        },
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "set_main_window_effects_enabled") return null;
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(options.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_NONE, "saved none material should remain selected without native material support");
    assert(options.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_NONE, "native load should sync none material draft");
  }, {
    passWindowEffectsCommand: true,
    passWindowEffectsSupport: true,
  });

  const pendingIconLoads = [];
  await withMockTauri((command, args) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{
          id: "icon-app",
          type: "app",
          name: "Icon App",
          iconPath: "C:/Icons/old.png",
          launchTarget: { kind: "shortcut", path: "Icon App.lnk" },
        }]],
        settings: {},
      };
    }
    if (command === "load_cached_app_icons") {
      return new Promise((resolve) => {
        pendingIconLoads.push({ args, resolve });
      });
    }
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    assert(pendingIconLoads.length === 1, "native load should request cached icon hydration");
    assert(pendingIconLoads[0].args.icons[0].iconPath === "C:/Icons/old.png", "icon hydration should request the original icon path");

    options.pages.value = [[{
      ...options.pages.value[0][0],
      iconPath: "C:/Icons/new.png",
    }]];
    pendingIconLoads[0].resolve([{ id: "icon-app", iconDataUrl: "data:image/png;base64,old" }]);
    await flushMicrotasks(3);

    assert(options.pages.value[0][0].iconPath === "C:/Icons/new.png", "current icon path should be preserved");
    assert(!("iconDataUrl" in options.pages.value[0][0]), "stale cached icon data should not overwrite a newer icon path");
  });

  const iconHydrationRequests = [];
  await withMockTauri((command, args) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{
          id: "custom-icon-app",
          type: "app",
          name: "Custom Icon App",
          iconPath: "C:/Icons/catalog.png",
          customIconPath: "C:/Icons/custom.png",
          launchTarget: { kind: "shortcut", path: "Custom Icon App.lnk" },
        }]],
        settings: {},
      };
    }
    if (command === "load_cached_app_icons") {
      iconHydrationRequests.push(args.icons);
      return [
        { id: "custom-icon-app", iconDataUrl: "data:image/png;base64,catalog" },
        { id: "__custom_icon__:custom-icon-app", iconDataUrl: "data:image/png;base64,custom" },
      ];
    }
    if (command === "check_launch_targets") return [];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await flushMicrotasks(3);

    assert(iconHydrationRequests.length === 1, "native load should request icon hydration once");
    assert(iconHydrationRequests[0].length === 2, "icon hydration should request catalog and custom icon paths");
    assert(iconHydrationRequests[0][0].iconPath === "C:/Icons/catalog.png", "catalog hydration should request the catalog icon path");
    assert(iconHydrationRequests[0][1].iconPath === "C:/Icons/custom.png", "custom hydration should request the custom icon path");
    assert(options.pages.value[0][0].iconDataUrl === "data:image/png;base64,catalog", "catalog icon hydration should apply data URL");
    assert(options.pages.value[0][0].customIconDataUrl === "data:image/png;base64,custom", "custom icon hydration should apply data URL");
  });

  const launchCommands = [];
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{ id: "custom-app", type: "app", name: "Custom App", launchTarget: { kind: "executable", path: "C:/Tools/Custom.exe" } }]],
        settings: {},
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      launchCommands.push(command);
      assert(args.layout.pages[0][0].id === "custom-app", "debounced native saves should persist the current layout");
      return null;
    }
    if (command === "launch_app") {
      launchCommands.push(command);
      assert(args.request.id === "custom-app", "native launch should pass the current app id");
      assert(args.request.name === "Custom App", "native launch should pass the current app name");
      assert(!("launchTarget" in args.request), "native launch should not pass launch target from the renderer");
      assert(!("launchArgs" in args.request), "native launch should not pass launch arguments from the renderer");
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    timers.length = 0;
    native.scheduleNativeLayoutSave();
    await native.launchNativeAppIfAvailable({
      id: "custom-app",
      type: "app",
      name: "Custom App",
      launchTarget: { kind: "executable", path: "C:/Tools/Custom.exe" },
      launchArgs: "--profile dev",
    });
    assert(launchCommands.join(",") === "launch_app", "non-critical pending saves should not block native launch");
    assert(timers.length === 1, "non-critical pending saves should remain debounced after launch");
    await timers.shift()();
    assert(launchCommands.join(",") === "launch_app,save_layout", "debounced save should still run after non-critical launch");
  });

  const pendingCriticalSaves = [];
  const criticalCommands = [];
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{ id: "custom-app", type: "app", name: "Custom App", launchTarget: { kind: "shortcut", path: "C:/Tools/Custom.lnk" } }]],
        settings: {},
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      criticalCommands.push(command);
      assert(args.layout.pages[0][0].id === "custom-app", "critical native saves should persist the current app");
      return new Promise((resolve) => {
        pendingCriticalSaves.push(resolve);
      });
    }
    if (command === "launch_app") {
      criticalCommands.push(command);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    timers.length = 0;
    const savePromise = native.markLaunchCriticalLayoutDirty("custom-app");
    assert(pendingCriticalSaves.length === 1, "critical layout changes should save immediately");
    let prepared = false;
    const preparePromise = native.prepareNativeLaunch({ id: "custom-app" }).then((result) => {
      prepared = result;
    });
    await flushMicrotasks(2);
    assert(prepared === false, "critical launch preparation should wait for the save");
    pendingCriticalSaves[0](null);
    await savePromise;
    await preparePromise;
    assert(prepared === true, "critical launch preparation should succeed after the save");
    await native.launchNativeAppIfAvailable({
      id: "custom-app",
      type: "app",
      name: "Custom App",
      launchTarget: { kind: "shortcut", path: "C:/Tools/Custom.lnk" },
    });
    assert(criticalCommands.join(",") === "save_layout,launch_app", "critical saves should complete before native launch");
  });

  const pendingFlushSaves = [];
  let flushSaveCount = 0;
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{ id: "flush-app", type: "app", name: "Flush App", launchTarget: { kind: "shortcut", path: "C:/Tools/Flush.lnk" } }]],
        settings: {},
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      flushSaveCount += 1;
      return new Promise((resolve) => {
        pendingFlushSaves.push(resolve);
      });
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    timers.length = 0;
    native.scheduleNativeLayoutSave();
    assert(timers.length === 1, "debounced native saves should be scheduled before flush");
    const firstFlush = native.flushNativeLayoutSave();
    const secondFlush = native.flushNativeLayoutSave();
    assert(timers.length === 0, "flushing native saves should cancel pending debounce timers");
    assert(flushSaveCount === 1, "concurrent flushes should share the in-flight native save");
    pendingFlushSaves[0](null);
    assert(await firstFlush, "first flush should resolve after the save succeeds");
    assert(await secondFlush, "second flush should resolve after the shared save succeeds");
  });

  const quitCommands = [];
  const quitEventHandlers = new Map();
  await withMockTauri(async (command, args) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{ id: "quit-app", type: "app", name: "Quit App", launchTarget: { kind: "shortcut", path: "C:/Tools/Quit.lnk" } }]],
        settings: {},
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "save_layout" || command === "confirm_quit_after_save") {
      if (command === "confirm_quit_after_save") {
        assert(args.saved === true, "quit confirmation should report successful layout save");
      }
      quitCommands.push(command);
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
      mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();
    await native.registerNativeEventListeners();
    timers.length = 0;
    native.scheduleNativeLayoutSave();
    await quitEventHandlers.get("launchpad-quit-requested")();

    assert(quitCommands.join(",") === "save_layout,confirm_quit_after_save", "native quit requests should flush pending layout saves before confirming quit");
  }, {
    listen: async (eventName, handler) => {
      quitEventHandlers.set(eventName, handler);
      return () => quitEventHandlers.delete(eventName);
    },
  });

  const launchFailureCommands = [];
  await withMockTauri(async (command, args) => {
    if (command === "launch_app") {
      launchFailureCommands.push(command);
      throw {
        kind: "targetNotFound",
        title: "无法打开应用",
        message: "无法打开“Missing App”。\n\n找不到启动文件。",
        suggestion: "请在 LaunchPad 中编辑此应用的启动路径。",
        detail: "missing",
      };
    }
    if (command === "show_launch_error_message") {
      launchFailureCommands.push(command);
      assert(args.report.kind === "targetNotFound", "native launch error dialog should receive the structured failure kind");
      assert(args.report.suggestion.includes("编辑"), "native launch error dialog should receive the structured suggestion");
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const { options } = makeOptions();
      const native = useLaunchpadNative(options);

      const failure = await native.launchNativeAppIfAvailable({
        id: "missing-app",
        type: "app",
        name: "Missing App",
      });
      assert(failure.kind === "targetNotFound", "failed native launches should return structured launch errors");
      await native.showNativeLaunchError(failure);
      assert(launchFailureCommands.join(",") === "launch_app,show_launch_error_message", "launch errors should be shown by an explicit native dialog command");
    } finally {
      console.error = originalConsoleError;
    }
  });

  await withMockTauri(async (command) => {
    if (command === "load_layout") {
      return {
        version: 1,
        pages: [[{ id: "custom-app", type: "app", name: "Custom App", launchTarget: { kind: "shortcut", path: "C:/Tools/Custom.lnk" } }]],
        settings: {},
      };
    }
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") throw new Error("disk full");
    if (command === "launch_app") throw new Error("launch_app should not run after a failed critical save");
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const originalConsoleError = console.error;
    const saveFailures = [];
    console.error = () => {};
    try {
      const { options } = makeOptions({
        mergeNativeCatalogWithSavedLayout: (_apps, layout) => layout.pages,
        showLayoutSaveFailed: (config) => saveFailures.push(config),
      });
      const native = useLaunchpadNative(options);

      await native.loadNativeLaunchpadData();
      timers.length = 0;
      await native.markLaunchCriticalLayoutDirty("custom-app");
      const prepared = await native.prepareNativeLaunch({ id: "custom-app" });
      assert(prepared === false, "failed critical saves should block native launch preparation");
      assert(saveFailures.length >= 1, "failed critical saves should surface a save notice");
    } finally {
      console.error = originalConsoleError;
    }
  });

  const pendingChecks = [];
  await withMockTauri((command, args) => {
    if (command !== "check_launch_targets") throw new Error(`Unexpected invoke: ${command}`);
    return new Promise((resolve) => {
      pendingChecks.push({ args, resolve });
    });
  }, async (timers) => {
    const { options } = makeOptions({
      pages: [[{ id: "app-a", type: "app", name: "A", launchTarget: { kind: "shortcut", path: "A.lnk" } }]],
    });
    const native = useLaunchpadNative(options);

    native.scheduleLaunchTargetStatusCheck();
    const firstCheck = timers.shift()();
    options.pages.value = [[{ id: "app-b", type: "app", name: "B", launchTarget: { kind: "shortcut", path: "B.lnk" } }]];
    native.scheduleLaunchTargetStatusCheck();
    const secondCheck = timers.shift()();

    assert(pendingChecks[0].args.targets[0].id === "app-a", "first status check should capture the original app");
    assert(pendingChecks[1].args.targets[0].id === "app-b", "second status check should capture the updated app");
    pendingChecks[1].resolve([{ id: "app-b", status: "ok" }]);
    await secondCheck;
    assert(options.launchTargetStatusById.value["app-b"] === "ok", "latest status check should update badge state");
    pendingChecks[0].resolve([{ id: "app-a", status: "missing" }]);
    await firstCheck;
    assert(!("app-a" in options.launchTargetStatusById.value), "stale status checks should not overwrite newer state");
  });

  await withMockTauri((command) => {
    if (command === "check_launch_targets") return [{ id: "app", status: "missing" }];
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const { options } = makeOptions({
      pages: [[{ id: "app", type: "app", name: "App", launchTarget: { kind: "shortcut", path: "A.lnk" } }]],
    });
    const native = useLaunchpadNative(options);

    native.scheduleLaunchTargetStatusCheck();
    await timers.shift()();
    assert(options.launchTargetStatusById.value.app === "missing", "missing status should apply to the checked target");
    assert(native.getLaunchTargetStatus(options.pages.value[0][0]) === "missing", "native status lookup should match the checked target");

    options.pages.value = [[{ id: "app", type: "app", name: "App", launchTarget: { kind: "shortcut", path: "B.lnk" } }]];
    native.scheduleLaunchTargetStatusCheck();
    assert(!("app" in options.launchTargetStatusById.value), "changing launch target should clear stale missing status before recheck");
    assert(native.getLaunchTargetStatus(options.pages.value[0][0]) === null, "native status lookup should ignore stale target records");
  });

  const pendingNativeListeners = [];
  const staleUnlistenEvents = [];
  await withMockTauri(async () => {
    throw new Error("layout should not load during listener cleanup test");
  }, async () => {
    const { options } = makeOptions();
    const native = useLaunchpadNative(options);

    const registerPromise = native.registerNativeEventListeners();
    assert(pendingNativeListeners.length === 6, "native event listener registration should request all listeners");
    native.clearNativeEventListeners();
    for (const pending of pendingNativeListeners) {
      pending.resolve(() => staleUnlistenEvents.push(pending.eventName));
    }
    await registerPromise;

    assert(staleUnlistenEvents.length === 6, "late native listener registrations should be immediately unlistened after cleanup");
  }, {
    listen: (eventName) => new Promise((resolve) => {
      pendingNativeListeners.push({ eventName, resolve });
    }),
  });

  let saveAttempts = 0;
  await withMockTauri(async (command) => {
    if (command === "load_layout") return null;
    if (command === "scan_apps") return { apps: [], warnings: [], stats: null };
    if (command === "load_cached_app_icons") return [];
    if (command === "check_launch_targets") return [];
    if (command === "save_layout") {
      saveAttempts += 1;
      if (saveAttempts === 1) throw new Error("disk full");
      return null;
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async (timers) => {
    const originalConsoleError = console.error;
    const saveFailures = [];
    let saveRecoveredCount = 0;
    console.error = () => {};
    try {
      const { options } = makeOptions({
        showLayoutSaveFailed: (config) => saveFailures.push(config),
        showLayoutSaveRecovered: () => {
          saveRecoveredCount += 1;
        },
      });
      const native = useLaunchpadNative(options);

      await native.loadNativeLaunchpadData();
      timers.length = 0;
      native.scheduleNativeLayoutSave();
      await timers.shift()();

      assert(saveFailures.length === 1, "failed native saves should surface a save notice");
      assert(saveFailures[0].retryCount === 1, "failed native saves should include retry count");
      assert(typeof saveFailures[0].onRetry === "function", "failed native saves should expose retry action");

      await saveFailures[0].onRetry();
      assert(saveAttempts === 2, "retry action should attempt to save again");
      assert(saveRecoveredCount === 1, "successful retry should surface recovered save notice");
    } finally {
      console.error = originalConsoleError;
    }
  });
}
