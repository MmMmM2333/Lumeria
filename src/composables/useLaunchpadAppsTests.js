import { ref, shallowRef } from "vue";
import { setLaunchpadApiBridgeForTests } from "../api/launchpadApi.js";
import { getCustomIconCanvasSize, useLaunchpadApps } from "./useLaunchpadApps.js";

function withMockTauri(invoke, run) {
  setLaunchpadApiBridgeForTests({ invoke });

  return Promise.resolve()
    .then(run)
    .finally(() => {
      setLaunchpadApiBridgeForTests(null);
    });
}

function installCustomIconDomMocks() {
  const originalURL = globalThis.URL;
  const originalCreateObjectURL = globalThis.URL?.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;
  const originalImage = globalThis.Image;
  const originalFileReader = globalThis.FileReader;
  const originalDocument = globalThis.document;
  const defer = (callback) => Promise.resolve().then(callback);

  if (!globalThis.URL) globalThis.URL = {};
  globalThis.URL.createObjectURL = () => "blob:launchpad-test";
  globalThis.URL.revokeObjectURL = () => {};
  globalThis.Image = class {
    constructor() {
      this.naturalWidth = 128;
      this.naturalHeight = 128;
    }

    set src(value) {
      this._src = value;
      defer(() => this.onload?.());
    }
  };
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = "data:image/png;base64,uploaded";
      defer(() => this.onload?.());
    }
  };
  globalThis.document = {
    createElement(tagName) {
      if (tagName !== "canvas") return null;
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          clearRect: () => {},
          drawImage: () => {},
        }),
        toBlob: (callback) => defer(() => callback({ type: "image/png" })),
      };
    },
  };

  return () => {
    if (originalURL === undefined) {
      delete globalThis.URL;
    } else {
      globalThis.URL = originalURL;
      if (originalCreateObjectURL === undefined) delete globalThis.URL.createObjectURL;
      else globalThis.URL.createObjectURL = originalCreateObjectURL;
      if (originalRevokeObjectURL === undefined) delete globalThis.URL.revokeObjectURL;
      else globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    }
    if (originalImage === undefined) delete globalThis.Image;
    else globalThis.Image = originalImage;
    if (originalFileReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalFileReader;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  };
}

async function waitForCondition(condition) {
  for (let index = 0; index < 20; index += 1) {
    if (condition()) return true;
    await Promise.resolve();
  }
  return false;
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
    const launchCriticalDirtyIds = [];
    let canceledLongPressCount = 0;
    let clearedSelectedIconCount = 0;
    const selectedIcon = ref({ area: "desktop", id: "win-app-1", pageIndex: 0 });
    const apps = useLaunchpadApps({
      appendAppsToPages: (_sourcePages, selectedApps) => [selectedApps.map((app) => ({ ...app }))],
      cancelLongPress: () => { canceledLongPressCount += 1; },
      cloneItem: (item) => (item ? { ...item } : item),
      clonePages: (sourcePages) => sourcePages.map((page) => page.map((item) => ({ ...item }))),
      clearSelectedIcon: () => {
        clearedSelectedIconCount += 1;
        selectedIcon.value = null;
      },
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
      markLaunchCriticalLayoutDirty: (appId) => launchCriticalDirtyIds.push(appId),
      openFolderId: ref(null),
      openWarningDialog: (config) => warningDialogs.push(config),
      pageIndex: ref(0),
      pages,
      removeEverywhere: (sourcePages, appId) => sourcePages.map((page) => page.filter((item) => item.id !== appId)),
      renderedFolder: ref(null),
      schedulePageGridMetrics: () => {},
      scanAppBlacklist: ref([]),
      scanKeywordBlacklist: ref([]),
      scanRoots,
      selectedIcon,
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

    apps.deleteManagedApp("win-app-1");
    assert(pages.value[0].length === 0, "deleting an app should remove it from the launchpad layout");
    assert(hiddenAppIds.value.includes("win-app-1"), "deleting a catalog app should keep it hidden across native layout merges");
    assert(canceledLongPressCount === 1, "deleting an app should cancel pending long press state");
    assert(clearedSelectedIconCount === 1, "deleting an app should clear a selection that referenced the removed icon");

    apps.openAddManagedAppPage();
    apps.newAppName.value = "URL App";
    apps.newAppTarget.value = "https://example.com";
    apps.newAppArgs.value = "--ignored";
    apps.addManagedApp();
    assert(!("launchArgs" in pages.value[0][0]), "URL apps should not save launch args");
    assert(launchCriticalDirtyIds.includes("generated-app-id"), "new custom apps should mark launch-critical layout dirty");

    apps.openAddManagedAppPage();
    apps.newAppName.value = "Exe App";
    apps.newAppTarget.value = "C:/Tools/App.exe";
    apps.newAppArgs.value = "--profile dev";
    assert(apps.canEditNewAppArgs.value, "executable targets should expose launch args");
    apps.addManagedApp();
    assert(pages.value[0][0].launchArgs === "--profile dev", "executable apps should save launch args");
    apps.openEditManagedApp(pages.value[0][0]);
    apps.editAppArgs.value = "--profile prod";
    apps.saveEditingManagedApp();
    assert(launchCriticalDirtyIds.length >= 3, "edited app launch fields should mark launch-critical layout dirty");
  });

  const pendingCustomIconCaches = [];
  await withMockTauri(async (command) => {
    if (command === "load_app_icon_choices") return [];
    if (command === "cache_custom_icon") {
      return new Promise((resolve) => {
        pendingCustomIconCaches.push(resolve);
      });
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const restoreCustomIconDomMocks = installCustomIconDomMocks();
    try {
      const pages = shallowRef([[
        { id: "app-a", type: "app", name: "A", launchTarget: { kind: "executable", path: "C:/Apps/A.exe" } },
        { id: "app-b", type: "app", name: "B", launchTarget: { kind: "executable", path: "C:/Apps/B.exe" } },
      ]]);
      let commitCount = 0;
      const apps = useLaunchpadApps({
        appendAppsToPages: (_sourcePages, selectedApps) => [selectedApps.map((app) => ({ ...app }))],
        cloneItem: (item) => (item ? { ...item } : item),
        clonePages: (sourcePages) => sourcePages.map((page) => page.map((item) => ({ ...item }))),
        collectAppsFromPages: (sourcePages) => sourcePages.flatMap((page) => page.filter((item) => item?.type === "app")),
        commitOpenFolder: () => {},
        commitPageIndex: () => {},
        commitPages: (next) => {
          commitCount += 1;
          pages.value = next;
        },
        commitSearchPageIndex: () => {},
        findFolder: () => null,
        hiddenAppIds: ref([]),
        isDragActive: () => false,
        makeId: () => "generated-app-id",
        openFolderId: ref(null),
        openWarningDialog: () => {},
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
      const uploadInput = {
        files: [{ type: "image/png", size: 512 }],
        value: "C:\\fakepath\\icon.png",
      };

      apps.openExistingAppIconChooser("app-a");
      apps.handleIconChooserUpload({ target: uploadInput });
      assert(await waitForCondition(() => pendingCustomIconCaches.length === 1), "custom icon upload should reach the native cache");
      apps.openExistingAppIconChooser("app-b");
      pendingCustomIconCaches[0]({
        iconPath: "C:/Icons/custom.png",
        iconDataUrl: "data:image/png;base64,cached",
      });
      await waitForCondition(() => uploadInput.value === "");

      assert(commitCount === 0, "stale custom icon uploads should not update a later icon chooser");
      assert(!pages.value.flat().some((app) => app.customIconDataUrl), "stale custom icon data should not be saved to any app");
    } finally {
      restoreCustomIconDomMocks();
    }
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
