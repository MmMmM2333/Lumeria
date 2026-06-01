import { ref, shallowRef } from "vue";
import { setLaunchpadApiBridgeForTests } from "../api/launchpadApi.js";
import { useLaunchpadNative } from "./useLaunchpadNative.js";

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
    draftIconSize: ref(64),
    draftIsTextlessMode: ref(false),
    draftRows: ref(4),
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

function withMockTauri(invoke, run) {
  const originalWindow = globalThis.window;
  const timers = [];
  setLaunchpadApiBridgeForTests({
    convertFileSrc: (path) => `asset://${path}`,
    invoke,
    listen: async () => () => {},
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

    await native.loadNativeLaunchpadData();
    await Promise.all(timers.splice(0).map((timer) => timer()));

    assert(options.pages.value[0].map((app) => app.id).join(",") === "win-app-good", "missing native layout should replace mock pages with scanned apps");
    assert(Boolean(options.scanRoots.value[0].lastScannedAt), "initial native scan should mark roots as scanned");
    assert(initialSaveLayouts.length === 1, "initial native scan should be persisted after load completes");
    assert(initialSaveLayouts[0].pages[0][0].id === "win-app-good", "initial native save should include scanned apps");
    assert(calls.commitPageIndex.join(",") === "0", "initial native load should reclamp desktop page");
    assert(calls.schedulePageGridMetrics === 1, "initial native load should refresh grid metrics");
  });

  let loadAttempts = 0;
  await withMockTauri(async (command) => {
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
      assert(loadFailures.length === 1, "failed native loads should surface a persistent notice");
      assert(typeof loadFailures[0].onRetry === "function", "failed native loads should expose retry action");

      native.scheduleNativeLayoutSave();
      assert(timers.length === 0, "native saves should not be scheduled while the layout is not ready");

      await loadFailures[0].onRetry();
      assert(loadAttempts === 2, "layout load retry should attempt to load again");
      assert(loadRecoveredCount === 1, "successful layout retry should surface a recovered notice");
      assert(options.pages.value[0][0].id === "loaded-app", "successful layout retry should apply the loaded layout");
      assert(options.isTextlessMode.value === true, "successful layout retry should apply textless mode");
      assert(options.draftIsTextlessMode.value === true, "successful layout retry should sync the textless draft");
    } finally {
      console.error = originalConsoleError;
    }
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
      assert(args.layout.pages[0][0].id === "custom-app", "native launch should flush the current layout before launching");
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
    assert(launchCommands.join(",") === "save_layout,launch_app", "native launch should save before invoking launch_app");
    assert(timers.length === 0, "native launch flush should clear the pending debounced save");
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
    if (command === "launch_app") throw new Error("launch_app should not run after a failed launch flush");
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
      await native.launchNativeAppIfAvailable({
        id: "custom-app",
        type: "app",
        name: "Custom App",
        launchTarget: { kind: "shortcut", path: "C:/Tools/Custom.lnk" },
      });
      assert(saveFailures.length === 1, "failed launch flush should surface a save notice");
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
