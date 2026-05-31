import { ref, shallowRef } from "vue";
import { getCustomIconCanvasSize, useLaunchpadApps } from "./useLaunchpadApps.js";

function withMockTauri(invoke, run) {
  const originalWindow = globalThis.window;
  globalThis.window = {
    __TAURI__: {
      core: {
        invoke,
      },
    },
  };

  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    });
}

export async function runLaunchpadAppsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad apps test failed] ${message}`);
  };

  assert(getCustomIconCanvasSize(128, 128) === 128, "128px custom icons should not be upscaled to 256px");
  assert(getCustomIconCanvasSize(64, 64) === 128, "small custom icons should be normalized to the UI max size");
  assert(getCustomIconCanvasSize(512, 256) === 256, "large non-square custom icons should be capped at the high-DPI size");

  await withMockTauri(async (command) => {
    if (command === "pick_scan_root_directory") return "D:\\Tools";
    if (command === "pick_launch_file") {
      return {
        name: "Shortcut",
        path: "C:\\Tools\\Shortcut.lnk",
        launchTarget: { kind: "shortcut", path: "C:\\Tools\\Shortcut.lnk" },
        launchArgs: "",
      };
    }
    if (command !== "scan_apps") throw new Error(`Unexpected invoke: ${command}`);
    return [
      {
        id: "win-app-1",
        type: "app",
        name: "Native App",
        launchTarget: { kind: "shortcut", path: "C:/Apps/Native.lnk" },
        sourceKey: "scan-root:root:native.lnk",
      },
    ];
  }, async () => {
    const pages = shallowRef([[]]);
    const hiddenAppIds = ref(["win-app-1"]);
    const scanRoots = ref([{ id: "root", type: "customDirectory", label: "Root", path: "C:/Apps", enabled: true }]);
    const warningDialogs = [];
    const apps = useLaunchpadApps({
      appendAppsToPages: (_sourcePages, selectedApps) => [selectedApps.map((app) => ({ ...app }))],
      cloneItem: (item) => (item ? { ...item } : item),
      clonePages: (sourcePages) => sourcePages.map((page) => page.map((item) => ({ ...item }))),
      collectAppsFromPages: (sourcePages) => sourcePages.flatMap((page) => page.filter((item) => item?.type === "app")),
      commitOpenFolder: () => {},
      commitPageIndex: () => {},
      commitPages: (next) => {
        pages.value = next;
      },
      commitSearchPageIndex: () => {},
      findFolder: () => null,
      hiddenAppIds,
      isDragActive: () => false,
      makeId: () => "generated-app-id",
      openFolderId: ref(null),
      openWarningDialog: (config) => warningDialogs.push(config),
      pageIndex: ref(0),
      pages,
      removeEverywhere: (sourcePages) => sourcePages,
      renderedFolder: ref(null),
      schedulePageGridMetrics: () => {},
      scanAppBlacklist: ref([]),
      scanKeywordBlacklist: ref([]),
      scanRoots,
      shouldUseNativeCatalog: () => true,
      showMissingLaunchTargetBadge: ref(true),
      searchPageIndex: ref(0),
    });

    apps.addScanRoot();
    const addedRoot = scanRoots.value[1];
    assert(addedRoot.enabled === false, "new scan roots should not be enabled by default");
    assert(addedRoot.path !== "C:/", "new scan roots should not default to the full system drive");

    apps.changeScanRootLabel("root", "工具目录");
    assert(scanRoots.value[0].label === "工具目录", "scan root labels should be editable");

    await apps.browseScanRootDirectory("root");
    assert(scanRoots.value[0].path === "D:\\Tools", "scan root browse should update the selected path");

    apps.confirmResetScanRoots();
    assert(scanRoots.value[0].id === "root", "default reset should wait for confirmation");
    assert(warningDialogs.length === 1, "default reset should open a confirmation dialog");
    warningDialogs[0].onConfirm();
    assert(scanRoots.value.map((root) => root.id).join(",") === "root-start-menu-user,root-start-menu-system", "confirmed reset should restore default scan roots");

    scanRoots.value = scanRoots.value.map((root) => ({ ...root, enabled: false }));
    assert(apps.canBrowseLaunchFile.value, "native file browsing should not require enabled scan roots");
    assert(!apps.canScanManagedApps.value, "app scanning should still require enabled scan roots");
    apps.openAddManagedAppPage();
    await apps.browseNewAppLaunchFile();
    assert(apps.newAppTarget.value === "C:\\Tools\\Shortcut.lnk", "launch file browse should use the native launch target path");
    assert(apps.canAddManagedApp.value, "browsed shortcut files should be addable");
    assert(!apps.canEditNewAppArgs.value, "shortcut targets should not expose launch args");
    apps.closeAddManagedAppPage();
    scanRoots.value = scanRoots.value.map((root) => ({ ...root, enabled: true }));

    await apps.rescanManagedApps();
    apps.addSelectedScannedApps();

    assert(pages.value[0][0].id === "win-app-1", "adding scanned apps should preserve native stable ids");
    assert(hiddenAppIds.value.length === 0, "adding scanned apps should unhide the preserved native id");

    apps.openAddManagedAppPage();
    apps.newAppName.value = "URL App";
    apps.newAppTarget.value = "https://example.com";
    apps.newAppArgs.value = "--ignored";
    apps.addManagedApp();
    assert(!("launchArgs" in pages.value[0][0]), "URL apps should not save launch args");

    apps.openAddManagedAppPage();
    apps.newAppName.value = "Exe App";
    apps.newAppTarget.value = "C:/Tools/App.exe";
    apps.newAppArgs.value = "--profile dev";
    assert(apps.canEditNewAppArgs.value, "executable targets should expose launch args");
    apps.addManagedApp();
    assert(pages.value[0][0].launchArgs === "--profile dev", "executable apps should save launch args");
  });

  await withMockTauri(async (command) => {
    if (command === "pick_scan_root_directory") throw new Error("folder denied");
    if (command === "pick_launch_file") throw new Error("file denied");
    if (command === "scan_apps") throw new Error("scan denied");
    if (command === "load_app_icon_choices") throw new Error("icons denied");
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const originalConsoleError = console.error;
    const pages = shallowRef([[{ id: "app", type: "app", name: "App", launchTarget: { kind: "executable", path: "C:/Apps/App.exe" } }]]);
    const warningDialogs = [];
    console.error = () => {};
    try {
      const apps = useLaunchpadApps({
        appendAppsToPages: (_sourcePages, selectedApps) => [selectedApps.map((app) => ({ ...app }))],
        cloneItem: (item) => (item ? { ...item } : item),
        clonePages: (sourcePages) => sourcePages.map((page) => page.map((item) => ({ ...item }))),
        collectAppsFromPages: (sourcePages) => sourcePages.flatMap((page) => page.filter((item) => item?.type === "app")),
        commitOpenFolder: () => {},
        commitPageIndex: () => {},
        commitPages: (next) => {
          pages.value = next;
        },
        commitSearchPageIndex: () => {},
        findFolder: () => null,
        hiddenAppIds: ref([]),
        isDragActive: () => false,
        makeId: () => "generated-app-id",
        openFolderId: ref(null),
        openWarningDialog: (config) => warningDialogs.push(config),
        pageIndex: ref(0),
        pages,
        removeEverywhere: (sourcePages) => sourcePages,
        renderedFolder: ref(null),
        schedulePageGridMetrics: () => {},
        scanAppBlacklist: ref([]),
        scanKeywordBlacklist: ref([]),
        scanRoots: ref([{ id: "root", type: "customDirectory", label: "Root", path: "C:/Apps", enabled: true }]),
        shouldUseNativeCatalog: () => true,
        showMissingLaunchTargetBadge: ref(true),
        searchPageIndex: ref(0),
      });

      await apps.browseScanRootDirectory("root");
      apps.openAddManagedAppPage();
      await apps.browseNewAppLaunchFile();
      await apps.rescanManagedApps();
      apps.newAppTarget.value = "C:/Apps/App.exe";
      apps.openNewAppIconChooser();
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert(warningDialogs.map((dialog) => dialog.title).join(",") === "无法选择扫描来源,无法选择启动文件,无法扫描应用", "failed native app actions should show warning dialogs");
      assert(apps.iconChoicesError.value.includes("无法读取应用内图标"), "failed icon choice loads should show an inline error");
    } finally {
      console.error = originalConsoleError;
    }
  });
}
