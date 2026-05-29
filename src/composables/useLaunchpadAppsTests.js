import { ref, shallowRef } from "vue";
import { useLaunchpadApps } from "./useLaunchpadApps.js";

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

  await withMockTauri(async (command) => {
    if (command === "pick_scan_root_directory") return "D:\\Tools";
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

    await apps.rescanManagedApps();
    apps.addSelectedScannedApps();

    assert(pages.value[0][0].id === "win-app-1", "adding scanned apps should preserve native stable ids");
    assert(hiddenAppIds.value.length === 0, "adding scanned apps should unhide the preserved native id");
  });
}
