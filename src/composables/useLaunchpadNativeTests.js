import { ref, shallowRef } from "vue";
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
    draftRows: ref(4),
    folderCols: ref(4),
    folderIconSize: ref(64),
    folderIconSizeMode: ref("global"),
    folderPageIndex: ref(0),
    folderRows: ref(3),
    gridCols: ref(6),
    gridRows: ref(4),
    handleLayoutRecovered: () => {},
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
  globalThis.window = {
    __TAURI__: {
      core: {
        convertFileSrc: (path) => `asset://${path}`,
        invoke,
      },
      event: {
        listen: async () => () => {},
      },
    },
    clearTimeout: () => {},
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  };

  return Promise.resolve()
    .then(() => run(timers))
    .finally(() => {
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    });
}

export async function runLaunchpadNativeTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad native test failed] ${message}`);
  };

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
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const { calls, options } = makeOptions({
      pages: [[{ id: "mock", type: "app", name: "Mock" }]],
      scanAppBlacklist: ref([{ path: "C:/Apps/Blocked.lnk" }]),
    });
    const native = useLaunchpadNative(options);

    await native.loadNativeLaunchpadData();

    assert(options.pages.value[0].map((app) => app.id).join(",") === "win-app-good", "missing native layout should replace mock pages with scanned apps");
    assert(Boolean(options.scanRoots.value[0].lastScannedAt), "initial native scan should mark roots as scanned");
    assert(calls.commitPageIndex.join(",") === "0", "initial native load should reclamp desktop page");
    assert(calls.schedulePageGridMetrics === 1, "initial native load should refresh grid metrics");
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
}
