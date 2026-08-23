import { ref, shallowRef } from "vue";
import { setLaunchpadApiBridgeForTests } from "../api/launchpadApi.js";
import type { LaunchpadApiBridge, ScanStats } from "../api/launchpadApi.js";
import { createLaunchpadLayoutHelpers } from "../domain/launchpadLayout.js";
import type { LaunchpadApp, LaunchpadFolder, LaunchpadItem, LaunchpadPages } from "../domain/launchpadLayout.js";
import type { CatalogSource, CatalogSourceState } from "../domain/applicationCatalog.js";
import type { ScanRoot } from "../domain/layoutDocument.js";
import { createLocalization } from "../i18n/localization.js";
import { getCustomIconCanvasSize, useLaunchpadApps } from "./useLaunchpadApps.js";
import type { LaunchpadAppsDialogConfig, LaunchpadAppsNotice } from "./useLaunchpadApps.js";
import { useLaunchpadPageCommands } from "./useLaunchpadPageCommands.js";
import { usePageRenderRange } from "./usePageRenderRange.js";

const localizationText = createLocalization({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" }).text;
const testLayoutHelpers = createLaunchpadLayoutHelpers({
  getFolderPageSize: () => 9,
  getPageSize: () => 21,
});

function makeScanStats(overrides: Partial<ScanStats> = {}): ScanStats {
  return {
    dirsVisited: 0,
    entriesSeen: 0,
    physicalAppsFound: 0,
    startMenuOverlays: 0,
    equivalentAppsMerged: 0,
    unresolvedApps: 0,
    keywordExcludedApps: 0,
    excludedApps: 0,
    appsFound: 0,
    limitReached: false,
    ...overrides,
  };
}

function makeCatalogSource(
  key: string,
  type: ScanRoot["type"],
  state: CatalogSourceState = "primary",
): CatalogSource {
  return {
    key,
    type,
    state,
    rootId: `root:${type}`,
    rootLabel: type,
    relativePath: key,
    absolutePath: `C:/Catalog/${key}`,
  };
}

async function withMockTauri<T>(
  invoke: NonNullable<LaunchpadApiBridge["invoke"]>,
  run: () => T | Promise<T>,
): Promise<T> {
  setLaunchpadApiBridgeForTests({
    convertFileSrc: (path) => `http://asset.localhost/${path}`,
    invoke,
  });

  try {
    return await run();
  } finally {
    setLaunchpadApiBridgeForTests(null);
  }
}

function requireApp(item: LaunchpadItem | null | undefined): LaunchpadApp {
  if (item?.type !== "app") throw new TypeError("apps test expected an app item");
  return item;
}

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new TypeError(`apps test expected ${label}`);
  return value;
}

function installCustomIconDomMocks(): () => void {
  const originalURL = globalThis.URL;
  const originalCreateObjectURL = globalThis.URL?.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;
  const originalImage = globalThis.Image;
  const originalFileReader = globalThis.FileReader;
  const originalDocument = globalThis.document;
  const defer = (callback: () => void): Promise<void> => Promise.resolve().then(callback);

  if (!globalThis.URL) globalThis.URL = class MockUrl {} as unknown as typeof URL;
  globalThis.URL.createObjectURL = () => "blob:lumeria-test";
  globalThis.URL.revokeObjectURL = () => {};
  class MockImage {
    naturalWidth = 128;
    naturalHeight = 128;
    width = 128;
    height = 128;
    onload: (() => void) | null = null;
    private source = "";

    constructor() {
    }

    set src(value: string) {
      this.source = value;
      defer(() => this.onload?.());
    }
  }
  globalThis.Image = MockImage as unknown as typeof Image;
  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onload: (() => void) | null = null;

    readAsDataURL(): void {
      this.result = "data:image/png;base64,uploaded";
      defer(() => this.onload?.());
    }
  }
  globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
  globalThis.document = {
    createElement(tagName: string) {
      if (tagName !== "canvas") return null;
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          clearRect: () => {},
          drawImage: () => {},
        }),
        toBlob: (callback: BlobCallback) => defer(() => callback({ type: "image/png" } as Blob)),
      };
    },
  } as unknown as Document;

  return () => {
    if (originalURL === undefined) {
      Reflect.deleteProperty(globalThis, "URL");
    } else {
      globalThis.URL = originalURL;
      if (originalCreateObjectURL === undefined) Reflect.deleteProperty(globalThis.URL, "createObjectURL");
      else globalThis.URL.createObjectURL = originalCreateObjectURL;
      if (originalRevokeObjectURL === undefined) Reflect.deleteProperty(globalThis.URL, "revokeObjectURL");
      else globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    }
    if (originalImage === undefined) Reflect.deleteProperty(globalThis, "Image");
    else globalThis.Image = originalImage;
    if (originalFileReader === undefined) Reflect.deleteProperty(globalThis, "FileReader");
    else globalThis.FileReader = originalFileReader;
    if (originalDocument === undefined) Reflect.deleteProperty(globalThis, "document");
    else globalThis.document = originalDocument;
  };
}

async function waitForCondition(condition: () => boolean): Promise<boolean> {
  for (let index = 0; index < 20; index += 1) {
    if (condition()) return true;
    await Promise.resolve();
  }
  return false;
}

function createManagedAppRemovalHarness(
  pageItems: readonly (readonly (string | LaunchpadItem)[])[],
  currentPageIndex: number,
) {
  const helpers = createLaunchpadLayoutHelpers({
    getFolderPageSize: () => 9,
    getPageSize: () => 21,
  });
  const pages = shallowRef<LaunchpadPages>(pageItems.map((items) => items.map((item) => (
    typeof item === "string"
      ? { id: item, type: "app", name: item }
      : { ...item }
  ))));
  const pageIndex = ref(currentPageIndex);
  const searchPageIndex = ref(0);
  const searchPages = shallowRef<LaunchpadPages>([[]]);
  const folderPageIndex = ref(0);
  const folderPageSize = ref(9);
  const pageSize = ref(21);
  const openFolderId = ref<string | null>(null);
  const renderedFolder = ref<LaunchpadFolder | null>(null);
  const isDragActive = () => false;
  const pageRange = usePageRenderRange({
    activePageIndex: pageIndex,
    commitFolderPageIndexState: (value: number) => { folderPageIndex.value = value; },
    commitPageIndexState: (value: number) => { pageIndex.value = value; },
    commitSearchPageIndexState: (value: number) => { searchPageIndex.value = value; },
    folderPageIndex,
    folderPages: shallowRef<LaunchpadPages>([[]]),
    getDragMeta: () => null,
    isDragActive,
    isSearchMode: ref(false),
    pageIndex,
    pages,
    searchPageIndex,
    searchPages,
  });
  const pageCommands = useLaunchpadPageCommands({
    assertNoDuplicateItemIds: helpers.assertNoDuplicateItemIds,
    cancelInputGesture: () => {},
    chunkIntoPages: (items: readonly LaunchpadItem[], size: number) => {
      const pageSize = Math.max(1, Math.floor(size));
      const result: LaunchpadPages = [];
      for (let index = 0; index < items.length; index += pageSize) {
        result.push([...items.slice(index, index + pageSize)]);
      }
      return result.length ? result : [[]];
    },
    clonePages: helpers.clonePages,
    compactPages: helpers.compactPages,
    commitFolderPageIndex: () => {},
    commitOpenFolder: (value: string | null) => { openFolderId.value = value; },
    commitPageIndex: (value: number) => { pageIndex.value = value; },
    commitPagesState: (next: LaunchpadPages) => { pages.value = next; },
    commitSearchPageIndex: (value: number) => { searchPageIndex.value = value; },
    dissolveFolder: helpers.dissolveFolder,
    findFolder: helpers.findFolder,
    flattenTopLevelPages: helpers.flattenTopLevelPages,
    folderPageIndex,
    folderPageSize,
    isDragActive,
    localizationText,
    openFolderId,
    openWarningDialog: () => {},
    pageIndex,
    pageSize,
    pages,
    rebasePageIndices: pageRange.rebasePageIndices,
    renderedFolder,
    schedulePageGridMetrics: () => {},
    searchPageIndex,
  });
  const transientNotices: LaunchpadAppsNotice[] = [];
  const apps = useLaunchpadApps({
    appendAppsToPages: (sourcePages, selectedApps) => [
      ...helpers.clonePages(sourcePages),
      selectedApps.map((app) => ({ ...app })),
    ],
    localizationText,
    clonePages: helpers.clonePages,
    collectAppsFromPages: helpers.collectAppsFromPages,
    commitOpenFolder: () => {},
    commitPages: pageCommands.commitPages,
    commitPagesAfterDeletion: pageCommands.commitPagesAfterDeletion,
    findFolder: helpers.findFolder,
    isDragActive,
    makeId: () => "generated-app-id",
    openFolderId,
    openScanKeywordSettings: () => {},
    openWarningDialog: () => {},
    pages,
    reclampPageIndices: pageRange.reclampPageIndices,
    removeEverywhere: helpers.removeEverywhere,
    renderedFolder,
    schedulePageGridMetrics: () => {},
    focusedIcon: ref(null),
    shouldUseNativeCatalog: () => false,
    showTransientNotice: (notice) => transientNotices.push(notice),
  });
  const hiddenAppIds = apps.presentation.hiddenAppIds;
  const scanAppBlacklist = apps.presentation.scanAppBlacklist;

  return { apps, hiddenAppIds, pageIndex, pages, scanAppBlacklist, transientNotices };
}

export async function runLaunchpadAppsTests() {
  const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(`[Launchpad apps test failed] ${message}`);
  };

  assert(getCustomIconCanvasSize(128, 128) === 128, "128px custom icons should not be upscaled to 256px");
  assert(getCustomIconCanvasSize(64, 64) === 128, "small custom icons should be normalized to the UI max size");
  assert(getCustomIconCanvasSize(512, 256) === 256, "large non-square custom icons should be capped at the high-DPI size");

  {
    const { apps, transientNotices } = createManagedAppRemovalHarness([[]], 0);
    assert(
      apps.nativeIntegration.captureScanRequest().filters.keywordBlacklist.join(",") === "卸载,uninstall",
      "a first-run scan should exclude uninstall entries by default"
    );
    apps.persistence.restore({ scanKeywordBlacklist: [] });
    assert(
      apps.nativeIntegration.captureScanRequest().filters.keywordBlacklist.length === 0,
      "an explicitly empty saved keyword list should keep keyword exclusions disabled"
    );
    await apps.rescanManagedApps({ announceStart: true });
    assert(
      transientNotices.length === 0,
      "a rejected scan should not announce that scanning started"
    );
  }

  {
    const { apps, pages } = createManagedAppRemovalHarness([[
      {
        id: "owner-contract-app",
        type: "app",
        name: "Owner Contract",
        launchTarget: { kind: "executable", path: "C:/Apps/Owner.exe" },
      },
    ]], 0);
    const persisted = {
      hiddenAppIds: ["hidden-app", "hidden-app"],
      scanRoots: [{ id: "custom-root", type: "customDirectory", label: "Tools", path: "C:/Tools", enabled: true }],
      scanKeywordBlacklist: ["setup", "Setup"],
      scanAppBlacklist: [{ name: "Ignored", catalogId: "catalog-ignored" }],
      showMissingLaunchTargetBadge: false,
    };

    apps.persistence.restore(persisted);
    const firstCapture = apps.persistence.capture();
    apps.persistence.restore(firstCapture);
    assert(
      JSON.stringify(apps.persistence.capture()) === JSON.stringify(firstCapture),
      "apps persistence should be stable across restore/capture round-trips"
    );

    apps.editorModel.actions.openCreate();
    assert(apps.editorModel.mode.value === "create", "the editor should expose one create session");
    apps.editorModel.name.value = "unsaved create draft";
    apps.editorModel.actions.openEdit(requireApp(pages.value[0]?.[0]));
    assert(apps.editorModel.mode.value === "edit", "opening edit should replace the create session instead of opening a parallel draft");
    assert(apps.editorModel.name.value === "Owner Contract", "replacing a create session should hydrate the single editor draft from the edited app");

    const requestedChecks = apps.nativeIntegration.listLaunchTargets();
    apps.nativeIntegration.applyLaunchTargetStatuses([
      { id: "owner-contract-app", status: "missing" },
    ], requestedChecks);
    assert(apps.nativeIntegration.getLaunchTargetStatus(requireApp(pages.value[0]?.[0])) === "missing", "matching launch-target results should be accepted");
    apps.editorModel.target.value = "C:/Apps/Owner-v2.exe";
    assert(apps.editorModel.actions.save(), "the unified editor should save an executable target change");
    apps.nativeIntegration.applyLaunchTargetStatuses([
      { id: "owner-contract-app", status: "missing" },
    ], requestedChecks);
    assert(apps.nativeIntegration.getLaunchTargetStatus(requireApp(pages.value[0]?.[0])) === null, "stale launch-target results should not attach to an edited target");

    const removedParallelEditorKeys = [
      "newAppName",
      "newAppTarget",
      "newAppArgs",
      "editAppName",
      "editAppTarget",
      "editAppArgs",
      "isAddingManagedApp",
      "editingManagedApp",
    ];
    assert(
      removedParallelEditorKeys.every((key) => !(key in apps)),
      "the apps owner should not expose the removed create/edit state machines"
    );
  }

  {
    const { apps, pageIndex, pages, scanAppBlacklist, transientNotices } = createManagedAppRemovalHarness(
      Array.from({ length: 10 }, (_, index) => [`page-${index + 1}-app`]),
      9
    );

    apps.removeManagedAppFromLaunchpad("page-10-app");

    assert(pages.value.length === 9, "removing the only app on the last page should remove that page");
    assert(pageIndex.value === 8, "removing the current last page should move the user to the new last page");
    assert(scanAppBlacklist.value.length === 0, "removing from the launchpad should not add a scan exclusion");
    assert(transientNotices.at(-1)?.title === "已从启动台移除", "launchpad removal should surface an explicit result notice");
  }

  {
    const { apps, pageIndex, pages } = createManagedAppRemovalHarness(
      [["app-a"], ["app-b"], ["app-c"], ["app-d"], ["app-e"]],
      2
    );

    apps.removeManagedAppFromLaunchpad("app-c");

    assert(
      pages.value.map((page) => page.map((app) => app.id).join(",")).join("|") === "app-a|app-b|app-d|app-e",
      "removing the only app on a middle page should shift later pages forward without repacking their contents"
    );
    assert(pageIndex.value === 2, "removing the current middle page should keep its page number and show the shifted next page");
  }

  {
    const { apps, pageIndex, pages } = createManagedAppRemovalHarness([["only-app"]], 0);

    apps.removeManagedAppFromLaunchpad("only-app");

    assert(pages.value.length === 1 && pages.value[0]?.length === 0, "removing every app should preserve one empty launchpad page");
    assert(pageIndex.value === 0, "removing every app should return the user to the first page");
  }

  {
    const { apps, pageIndex, pages } = createManagedAppRemovalHarness(
      [["app-a"], [], ["app-b"], ["app-c"], ["app-d"], ["app-e"]],
      5
    );
    apps.toggleManagedAppSelection("app-b", true);
    apps.toggleManagedAppSelection("app-d", true);

    apps.removeSelectedManagedAppsFromLaunchpad();

    assert(
      pages.value.map((page) => page.map((app) => app.id).join(",")).join("|") === "app-a|app-c|app-e",
      "bulk removal should remove every empty page while preserving the remaining page contents"
    );
    assert(pageIndex.value === 2, "removing pages before the current page should keep the user on the same remaining content page");
  }

  {
    const scannedApp: LaunchpadApp = {
      id: "scanned-app",
      type: "app",
      origin: "catalog",
      name: "Scanned App",
      iconUrl: "http://asset.localhost/scanned-app.png",
      sources: [makeCatalogSource("scan-root:tools:scanned-app.lnk", "customDirectory")],
      launchTarget: { kind: "shortcut", path: "C:/Tools/Scanned App.lnk" },
    };
    const manualWindowsApp: LaunchpadApp = {
      id: "manual-windows-app",
      type: "app",
      origin: "manual",
      name: "Manual Windows App",
      launchTarget: { kind: "appUserModelId", appUserModelId: "example.manual!App" },
    };
    const {
      apps,
      hiddenAppIds,
      pages,
      scanAppBlacklist,
      transientNotices,
    } = createManagedAppRemovalHarness([[scannedApp, manualWindowsApp]], 0);

    assert(apps.canExcludeManagedAppFromScan(scannedApp), "scanned apps should expose scan exclusion");
    assert(!apps.canExcludeManagedAppFromScan(manualWindowsApp), "apps without a stable scan identity should not expose scan exclusion");
    apps.toggleManagedAppSelection(scannedApp.id, true);
    apps.toggleManagedAppSelection(manualWindowsApp.id, true);
    assert(!apps.canExcludeSelectedManagedAppsFromScan.value, "mixed bulk selections should not allow partial scan exclusion");
    assert(!apps.excludeSelectedManagedAppsFromScan(), "mixed bulk exclusion should fail explicitly");
    assert(pages.value[0]?.length === 2, "failed bulk exclusion should not remove any selected app");
    assert(scanAppBlacklist.value.length === 0, "failed bulk exclusion should not write a partial exclusion list");
    assert(transientNotices.at(-1)?.intent === "error", "failed bulk exclusion should explain the failure");

    apps.clearManagedAppSelection();
    apps.toggleManagedAppSelection("missing-app", true);
    assert(!apps.canExcludeSelectedManagedAppsFromScan.value, "stale selections should not allow scan exclusion");
    assert(!apps.excludeSelectedManagedAppsFromScan(), "stale bulk selections should fail without affecting current apps");
    assert(pages.value[0]?.length === 2, "stale bulk exclusion should not remove a current app");

    apps.clearManagedAppSelection();
    assert(apps.excludeManagedAppFromScan(scannedApp), "eligible apps should be removable and excluded from future scans");
    assert(!pages.value[0]?.some((app) => app.id === scannedApp.id), "scan exclusion should remove the app from the launchpad");
    assert(pages.value[0]?.some((app) => app.id === manualWindowsApp.id), "scan exclusion should preserve unrelated apps");
    assert(scanAppBlacklist.value[0]?.catalogId === scannedApp.id, "scan exclusion should persist the canonical catalog id");
    const excludedRuntimeApp = apps.presentation.excludedScanApps.value[0];
    assert(
      Boolean(excludedRuntimeApp && "iconUrl" in excludedRuntimeApp && excludedRuntimeApp.iconUrl === scannedApp.iconUrl),
      "new scan exclusions should retain their runtime icon without waiting for another scan"
    );
    assert(hiddenAppIds.value.includes(scannedApp.id), "scan exclusion should also prevent automatic layout reinsertion");
    assert(transientNotices.at(-1)?.title === "已从扫描中排除", "scan exclusion should surface an explicit result notice");

    assert(apps.cancelScanAppExclusion(0), "scan exclusions should be cancellable");
    assert(scanAppBlacklist.value.length === 0, "cancelling scan exclusion should remove the filter entry");
    assert(hiddenAppIds.value.includes(scannedApp.id), "cancelling exclusion should wait for an explicit rescan before restoring the app");
    assert(transientNotices.at(-1)?.title === "已从排除列表移出", "removing an exclusion should explain the rescan recovery path");
  }

  {
    const firstApp: LaunchpadApp = {
      id: "first-scanned-app",
      type: "app",
      origin: "catalog",
      name: "First Scanned App",
      launchTarget: { kind: "shortcut", path: "C:/Tools/First.lnk" },
    };
    const secondApp: LaunchpadApp = {
      id: "second-scanned-app",
      type: "app",
      origin: "catalog",
      name: "Second Scanned App",
      launchTarget: { kind: "executable", path: "C:/Tools/Second.exe" },
    };
    const {
      apps,
      hiddenAppIds,
      pages,
      scanAppBlacklist,
      transientNotices,
    } = createManagedAppRemovalHarness([[firstApp, secondApp]], 0);

    apps.toggleManagedAppSelection(firstApp.id, true);
    apps.toggleManagedAppSelection(secondApp.id, true);
    assert(apps.canExcludeSelectedManagedAppsFromScan.value, "eligible bulk selections should allow scan exclusion");
    assert(apps.excludeSelectedManagedAppsFromScan(), "eligible bulk exclusions should complete as one operation");
    assert(pages.value.length === 1 && pages.value[0]?.length === 0, "bulk scan exclusion should remove every selected app");
    assert(scanAppBlacklist.value.length === 2, "bulk scan exclusion should persist every stable identity");
    assert(hiddenAppIds.value.includes(firstApp.id) && hiddenAppIds.value.includes(secondApp.id), "bulk scan exclusion should hide every removed app from automatic merges");
    assert(transientNotices.at(-1)?.message.includes("2 个应用"), "bulk scan exclusion should report the affected count");

    assert(apps.cancelScanAppExclusions([0, 1]), "scan exclusions should support batch cancellation");
    assert(scanAppBlacklist.value.length === 0, "batch cancellation should remove every selected exclusion");
  }

  {
    const catalogApp: LaunchpadApp = {
      id: "catalog-editor",
      type: "app",
      origin: "catalog",
      name: "Editor",
      emoji: "E",
      catalogPresentation: { name: "Editor", emoji: "E" },
      presentationOverrides: {},
      trackingKey: "launch:editor",
      identityStatus: "exact",
      sources: [makeCatalogSource("editor", "startMenuUser")],
      launchTarget: { kind: "executable", path: "C:/Apps/Editor.exe" },
    };
    const { apps, hiddenAppIds, pages } = createManagedAppRemovalHarness([[catalogApp]], 0);

    apps.openEditManagedApp(catalogApp);
    apps.editorModel.name.value = "Work Editor";
    assert(apps.editorModel.actions.save(), "catalog presentation edits should save");
    const editedCatalogPresentation = requireApp(pages.value[0]?.[0]);
    assert(editedCatalogPresentation.id === "catalog-editor", "presentation-only edits should preserve the catalog id");
    assert(editedCatalogPresentation.origin === "catalog", "presentation-only edits should preserve catalog ownership");
    assert(editedCatalogPresentation.presentationOverrides?.name === "Work Editor", "catalog name edits should persist as presentation overrides");
    assert(editedCatalogPresentation.launchTarget?.path === "C:/Apps/Editor.exe", "presentation-only edits should preserve catalog launch data");

    apps.openEditManagedApp(editedCatalogPresentation);
    apps.editorModel.target.value = "C:/Portable/Editor.exe";
    apps.editorModel.args.value = "--portable";
    assert(apps.editorModel.actions.save(), "catalog launch edits should save by converting to manual");
    const converted = requireApp(pages.value[0]?.[0]);
    assert(converted.id === "generated-app-id", "catalog launch edits should allocate a manual app id");
    assert(converted.origin === "manual", "catalog launch edits should convert the item to manual ownership");
    assert(converted.launchTarget?.path === "C:/Portable/Editor.exe" && converted.launchArgs === "--portable", "converted manual apps should own the edited launch data");
    assert(!("sources" in converted) && !("trackingKey" in converted), "converted manual apps should drop catalog provenance");
    assert(hiddenAppIds.value.includes("catalog-editor"), "conversion should hide the original catalog app from automatic reinsertion");
  }

  await withMockTauri(async (command) => {
    if (command === "pick_scan_root_directory") return "D:\\Tools";
    if (command === "pick_launch_file") {
      return {
        name: "Shortcut",
        path: "C:\\Tools\\Shortcut.lnk",
        launchTarget: { kind: "shortcut", path: "C:\\Tools\\Shortcut.lnk" },
        launchArgs: "",
        iconPath: null,
        iconDataUrl: null,
      };
    }
    if (command !== "scan_apps") throw new Error(`Unexpected invoke: ${command}`);
    return { apps: [
      {
        id: "win-app-1",
        type: "app",
        name: "Native App",
        iconPath: "C:/Icons/native.png",
        iconDataUrl: "data:image/png;base64,native",
        launchTarget: { kind: "shortcut", path: "C:/Apps/Native.lnk" },
        trackingKey: "launch:native",
        identityStatus: "exact",
        sources: [makeCatalogSource("scan-root:root:native.lnk", "customDirectory")],
      },
      {
        id: "win-app-store",
        type: "app",
        name: "Settings",
        launchTarget: {
          kind: "appUserModelId",
          appUserModelId: "windows.settings_123!App",
        },
        trackingKey: "launch:settings",
        identityStatus: "exact",
        sources: [makeCatalogSource("windows-app:windows.settings_123!app", "windowsAppCatalog")],
      },
    ], excludedApps: [{
      id: "catalog-blocked",
      type: "app",
      name: "Blocked Current Name",
      iconPath: "C:/Icons/blocked.png",
      launchTarget: { kind: "shortcut", path: "C:/Apps/Blocked.lnk" },
      trackingKey: "launch:blocked",
      identityStatus: "exact",
      sources: [makeCatalogSource("scan-root:root:blocked.lnk", "customDirectory")],
    }], keywordExcludedApps: [{
      app: {
        id: "keyword-uninstall-native",
        type: "app",
        name: "Uninstall Native",
        iconPath: "C:/Icons/uninstall-native.png",
        emoji: "U",
        launchTarget: { kind: "shortcut", path: "C:\\Tools\\Uninstall Native.lnk" },
        trackingKey: "launch:keyword-uninstall-native",
        identityStatus: "exact",
        sources: [makeCatalogSource("scan-root:root:uninstall-native.lnk", "customDirectory")],
      },
      matchedKeyword: "uninstall",
    }, {
      app: {
        id: "keyword-blocked-uninstall",
        type: "app",
        name: "Blocked 卸载程序",
        emoji: "B",
        launchTarget: { kind: "appUserModelId", appUserModelId: "blocked.uninstall!app" },
        trackingKey: "launch:keyword-blocked-uninstall",
        identityStatus: "exact",
        sources: [makeCatalogSource("windows-app:blocked.uninstall!app", "windowsAppCatalog")],
      },
      matchedKeyword: "卸载",
    }], warnings: [], stats: makeScanStats({ physicalAppsFound: 5, keywordExcludedApps: 2, excludedApps: 1, appsFound: 2 }) };
  }, async () => {
    const pages = shallowRef<LaunchpadPages>([[]]);
    const warningDialogs: LaunchpadAppsDialogConfig[] = [];
    const transientNotices: LaunchpadAppsNotice[] = [];
    const launchCriticalDirtyIds: string[] = [];
    let openedScanKeywordSettingsCount = 0;
    let canceledInputGestureCount = 0;
    let clearedFocusedIconCount = 0;
    const focusedIcon = ref<{ area: string; id: string; pageIndex: number } | null>({ area: "desktop", id: "win-app-1", pageIndex: 0 });
    const apps = useLaunchpadApps({
      appendAppsToPages: (sourcePages, selectedApps) => {
        const existingPages = testLayoutHelpers.clonePages(sourcePages);
        return [[
          ...selectedApps.map((app) => ({ ...app })),
          ...(existingPages[0] || []),
        ]];
      },
      localizationText,
      cancelInputGesture: () => { canceledInputGestureCount += 1; },
      clonePages: testLayoutHelpers.clonePages,
      clearFocusedIcon: () => {
        clearedFocusedIconCount += 1;
        focusedIcon.value = null;
      },
      collectAppsFromPages: testLayoutHelpers.collectAppsFromPages,
      commitOpenFolder: () => {},
      commitPagesAfterDeletion: (next) => {
        pages.value = next;
      },
      commitPages: (next) => {
        pages.value = next;
      },
      findFolder: () => null,
      isDragActive: () => false,
      makeId: () => "generated-app-id",
      markLaunchCriticalLayoutDirty: (appId) => launchCriticalDirtyIds.push(appId),
      openFolderId: ref(null),
      openScanKeywordSettings: () => { openedScanKeywordSettingsCount += 1; },
      openWarningDialog: (config) => warningDialogs.push(config),
      pages,
      reclampPageIndices: () => {},
      removeEverywhere: testLayoutHelpers.removeEverywhere,
      renderedFolder: ref(null),
      schedulePageGridMetrics: () => {},
      focusedIcon,
      showTransientNotice: (notice) => transientNotices.push(notice),
      shouldUseNativeCatalog: () => true,
    });
    apps.persistence.restore({
      hiddenAppIds: ["win-app-1"],
      scanRoots: [{ id: "root", type: "customDirectory", label: "Root", path: "C:/Apps", enabled: true }],
      scanKeywordBlacklist: [],
      scanAppBlacklist: [{ catalogId: "catalog-blocked", name: "Blocked Saved Name" }],
      showMissingLaunchTargetBadge: true,
    });
    const hiddenAppIds = apps.presentation.hiddenAppIds;
    const scanRoots = apps.presentation.scanRoots;
    const setAllScanRootsEnabled = (enabled: boolean) => {
      const current = apps.persistence.capture();
      apps.persistence.restore({
        ...current,
        scanRoots: current.scanRoots.map((root) => ({ ...root, enabled })),
      });
    };

    apps.addScanRoot();
    const addedRoot = requireValue(scanRoots.value[1], "added scan root");
    assert(addedRoot.enabled === false, "new scan roots should not be enabled by default");
    assert(addedRoot.path !== "C:/", "new scan roots should not default to the full system drive");

    apps.changeScanRootLabel("root", "工具目录");
    assert(scanRoots.value[0]?.label === "工具目录", "scan root labels should be editable");

    await apps.browseScanRootDirectory("root");
    assert(scanRoots.value[0]?.path === "D:\\Tools", "scan root browse should update the selected path");

    apps.confirmResetScanRoots();
    assert(scanRoots.value[0]?.id === "root", "default reset should wait for confirmation");
    assert(warningDialogs.length === 1, "default reset should open a confirmation dialog");
    warningDialogs[0]?.onConfirm?.();
    assert(scanRoots.value.map((root) => root.id).join(",") === "root-windows-app-catalog,root-start-menu-user,root-start-menu-system", "confirmed reset should restore default scan roots");
    apps.changeScanRootPath("root-windows-app-catalog", "C:/Not/AppsFolder");
    assert(scanRoots.value[0]?.path === "shell:AppsFolder", "the Windows app catalog path should stay system-managed");
    apps.removeScanRoot("root-windows-app-catalog");
    assert(scanRoots.value.some((root) => root.id === "root-windows-app-catalog"), "the Windows app catalog root should not be removable");
    await apps.browseScanRootDirectory("root-windows-app-catalog");
    assert(scanRoots.value[0]?.path === "shell:AppsFolder", "the Windows app catalog should not open the directory picker");

    setAllScanRootsEnabled(false);
    apps.openCreateManagedApp();
    assert(apps.editorModel.canBrowseTarget.value, "native file browsing should not require enabled scan roots");
    assert(!apps.canScanManagedApps.value, "app scanning should still require enabled scan roots");
    await apps.editorModel.actions.browseTarget();
    assert(apps.editorModel.target.value === "C:\\Tools\\Shortcut.lnk", "launch file browse should use the native launch target path");
    assert(apps.editorModel.canSave.value, "browsed shortcut files should be addable");
    assert(!apps.editorModel.canEditArgs.value, "shortcut targets should not expose launch args");
    apps.editorModel.actions.cancel();
    setAllScanRootsEnabled(true);

    await apps.rescanManagedApps({ announceStart: true });
    assert(
      transientNotices.length === 1 &&
        transientNotices[0]?.title === "正在扫描应用" &&
        transientNotices[0]?.message === "扫描完成后将显示结果。" &&
        transientNotices[0]?.intent === "info",
      "a context-menu scan should announce that scanning started"
    );
    assert(
      apps.scanResultModel.stats.value?.keywordExcludedApps === 2,
      "scan results should expose keyword exclusion counts"
    );
    assert(
      apps.scanResultModel.keywordExcludedApps.value.map((entry) => entry.app.name).join(",") === "Uninstall Native,Blocked 卸载程序",
      "scan results should expose complete keyword-excluded apps"
    );
    assert(
      apps.scanResultModel.keywordExcludedApps.value.map((entry) => apps.scanResultModel.getLaunchTargetPath(entry.app)).join("|")
        === "C:\\Tools\\Uninstall Native.lnk|blocked.uninstall!app",
      "scan results should expose keyword exclusion paths"
    );
    assert(
      apps.scanResultModel.keywordExcludedApps.value[0]?.app.iconUrl === "http://asset.localhost/C:/Icons/uninstall-native.png",
      "scan results should expose cached icons for keyword-excluded apps"
    );
    assert(apps.scanResultModel.activeTab.value === "available", "scan results should open on available apps when any can be added");
    apps.scanResultModel.actions.selectTab("ignored");
    assert(apps.scanResultModel.activeTab.value === "ignored", "scan results should let users inspect ignored entries");
    apps.scanResultModel.actions.selectTab("unknown");
    assert(apps.scanResultModel.activeTab.value === "ignored", "scan results should reject unknown tabs");
    const excludedApp = apps.presentation.excludedScanApps.value[0];
    assert(excludedApp?.name === "Blocked Current Name", "excluded app rows should use current runtime catalog presentation");
    assert(excludedApp && "iconUrl" in excludedApp && excludedApp.iconUrl === "http://asset.localhost/C:/Icons/blocked.png", "excluded app rows should expose cached asset URLs");
    const persistedExcludedApp = apps.persistence.capture().scanAppBlacklist[0];
    assert(persistedExcludedApp && !("iconPath" in persistedExcludedApp) && !("iconUrl" in persistedExcludedApp), "excluded app icons should remain runtime-only");
    apps.scanResultModel.actions.toggleSelection("win-app-store", false);
    apps.scanResultModel.actions.addSelected();

    const firstAddedApp = requireApp(pages.value[0]?.[0]);
    assert(firstAddedApp.id === "win-app-1", "adding scanned apps should preserve native stable ids");
    assert(firstAddedApp.iconUrl === "http://asset.localhost/C:/Icons/native.png", "adding scanned apps should use the cached asset URL");
    assert(!("iconDataUrl" in firstAddedApp), "adding scanned apps should discard cached base64 once an asset URL exists");
    assert(hiddenAppIds.value.includes("win-app-store"), "confirming a partial scan selection should keep unselected catalog apps hidden after restart");

    await apps.rescanManagedApps();
    assert(
      transientNotices.length === 1,
      "a settings scan should rely on its inline progress state instead of duplicating the start toast"
    );
    apps.scanResultModel.actions.addSelected();

    assert(hiddenAppIds.value.length === 0, "adding scanned apps should unhide the preserved native id");
    const windowsApp = requireApp(pages.value.flat().find((app) => app.id === "win-app-store"));
    assert(apps.getLaunchTargetPath(windowsApp) === "windows.settings_123!App", "managed app details should display AppUserModelIds");
    apps.openEditManagedApp(windowsApp);
    assert(apps.editorModel.targetReadOnly.value, "Windows app identifiers should be treated as system-managed");
    apps.editorModel.name.value = "Windows Settings";
    apps.editorModel.target.value = "C:/Should/Not/Replace.exe";
    apps.editorModel.actions.save();
    const editedWindowsApp = requireApp(pages.value[0]?.find((app) => app.id === "win-app-store"));
    assert(editedWindowsApp.launchTarget?.kind === "appUserModelId", "editing a Windows app should preserve its launch target kind");
    assert(editedWindowsApp.launchTarget?.appUserModelId === "windows.settings_123!App", "editing a Windows app should preserve its AppUserModelId");

    await apps.rescanManagedApps();
    assert(apps.scanResultModel.apps.value.length === 0, "rescanning should not offer apps that are already present");
    assert(apps.scanResultModel.activeTab.value === "ignored", "scan results should open ignored entries when no apps can be added");
    apps.scanResultModel.actions.manageKeywords();
    assert(openedScanKeywordSettingsCount === 1, "scan results should open keyword settings through the owning navigation flow");
    assert(!apps.scanResultModel.isOpen.value, "opening keyword settings should close scan results");

    await apps.rescanManagedApps();
    apps.scanResultModel.actions.toggleSelection("keyword-uninstall-native", true);
    apps.scanResultModel.actions.addSelected();
    assert(pages.value.flat().some((app) => app.id === "keyword-uninstall-native"), "selected keyword-excluded apps should be added to the launchpad");
    assert(
      apps.persistence.capture().scanKeywordAllowlist.join(",") === "keyword-uninstall-native",
      "adding a keyword-excluded app should persist its stable catalog id as an exception"
    );
    assert(
      apps.nativeIntegration.captureScanRequest().filters.keywordAllowlist.join(",") === "keyword-uninstall-native",
      "future scans should send persisted keyword exceptions to the backend"
    );

    apps.removeManagedAppFromLaunchpad("win-app-1");
    assert(!pages.value.flat().some((app) => app.id === "win-app-1"), "removing an app should remove it from the launchpad layout");
    assert(pages.value.flat().some((app) => app.id === "win-app-store"), "removing a classic app should not remove a scanned Windows app");
    assert(hiddenAppIds.value.includes("win-app-1"), "removing a catalog app should keep it hidden across native layout merges");
    assert(canceledInputGestureCount === 1, "removing an app should cancel the active input gesture");
    assert(clearedFocusedIconCount === 1, "removing an app should clear focus that referenced the removed icon");

    apps.openCreateManagedApp();
    apps.editorModel.name.value = "URL App";
    apps.editorModel.target.value = "https://example.com";
    apps.editorModel.args.value = "--ignored";
    apps.editorModel.actions.save();
    assert(!("launchArgs" in requireApp(pages.value[0]?.[0])), "URL apps should not save launch args");
    assert(launchCriticalDirtyIds.includes("generated-app-id"), "new custom apps should mark launch-critical layout dirty");

    apps.openCreateManagedApp();
    apps.editorModel.name.value = "Exe App";
    apps.editorModel.target.value = "C:/Tools/App.exe";
    apps.editorModel.args.value = "--profile dev";
    assert(apps.editorModel.canEditArgs.value, "executable targets should expose launch args");
    apps.editorModel.actions.save();
    assert(requireApp(pages.value[0]?.[0]).launchArgs === "--profile dev", "executable apps should save launch args");
    apps.openEditManagedApp(requireApp(pages.value[0]?.[0]));
    apps.editorModel.args.value = "--profile prod";
    apps.editorModel.actions.save();
    assert(launchCriticalDirtyIds.length >= 3, "edited app launch fields should mark launch-critical layout dirty");
  });

  const pendingCustomIconCaches: Array<(value: Readonly<{ iconPath: string; iconDataUrl: string }>) => void> = [];
  await withMockTauri(async (command) => {
    if (command === "load_app_icon_choices") return [];
    if (command === "cache_custom_icon") {
      return new Promise((resolve) => {
        pendingCustomIconCaches.push((value) => resolve(value));
      });
    }
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const restoreCustomIconDomMocks = installCustomIconDomMocks();
    try {
      const pages = shallowRef<LaunchpadPages>([[
        { id: "app-a", type: "app", name: "A", launchTarget: { kind: "executable", path: "C:/Apps/A.exe" } },
        { id: "app-b", type: "app", name: "B", launchTarget: { kind: "executable", path: "C:/Apps/B.exe" } },
      ]]);
      let commitCount = 0;
      const apps = useLaunchpadApps({
        appendAppsToPages: (_sourcePages, selectedApps) => [selectedApps.map((app) => ({ ...app }))],
        localizationText,
        clonePages: testLayoutHelpers.clonePages,
        collectAppsFromPages: testLayoutHelpers.collectAppsFromPages,
        commitOpenFolder: () => {},
        commitPagesAfterDeletion: (next) => {
          pages.value = next;
        },
        commitPages: (next) => {
          commitCount += 1;
          pages.value = next;
        },
        findFolder: () => null,
        isDragActive: () => false,
        makeId: () => "generated-app-id",
        openFolderId: ref(null),
        openScanKeywordSettings: () => {},
        openWarningDialog: () => {},
        pages,
        reclampPageIndices: () => {},
        removeEverywhere: (sourcePages) => testLayoutHelpers.clonePages(sourcePages),
        renderedFolder: ref(null),
        schedulePageGridMetrics: () => {},
        shouldUseNativeCatalog: () => true,
      });
      const uploadInput = {
        files: [{ type: "image/png", size: 512 } as File],
        value: "C:\\fakepath\\icon.png",
      };

      apps.openExistingAppIconChooser("app-a");
      apps.iconChooserModel.actions.upload({ target: uploadInput as unknown as HTMLInputElement });
      assert(await waitForCondition(() => pendingCustomIconCaches.length === 1), "custom icon upload should reach the native cache");
      apps.openExistingAppIconChooser("app-b");
      pendingCustomIconCaches[0]!({
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
    if (command === "pick_scan_root_directory") throw { message: "folder denied" };
    if (command === "pick_launch_file") throw new Error("file denied");
    if (command === "scan_apps") throw new Error("scan denied");
    if (command === "load_app_icon_choices") throw new Error("icons denied");
    throw new Error(`Unexpected invoke: ${command}`);
  }, async () => {
    const originalConsoleError = console.error;
    const pages = shallowRef<LaunchpadPages>([[{ id: "app", type: "app", name: "App", launchTarget: { kind: "executable", path: "C:/Apps/App.exe" } }]]);
    const warningDialogs: LaunchpadAppsDialogConfig[] = [];
    console.error = () => {};
    try {
      const apps = useLaunchpadApps({
        appendAppsToPages: (_sourcePages, selectedApps) => [selectedApps.map((app) => ({ ...app }))],
        localizationText,
        clonePages: testLayoutHelpers.clonePages,
        collectAppsFromPages: testLayoutHelpers.collectAppsFromPages,
        commitOpenFolder: () => {},
        commitPagesAfterDeletion: (next) => {
          pages.value = next;
        },
        commitPages: (next) => {
          pages.value = next;
        },
        findFolder: () => null,
        isDragActive: () => false,
        makeId: () => "generated-app-id",
        openFolderId: ref(null),
        openScanKeywordSettings: () => {},
        openWarningDialog: (config) => warningDialogs.push(config),
        pages,
        reclampPageIndices: () => {},
        removeEverywhere: (sourcePages) => testLayoutHelpers.clonePages(sourcePages),
        renderedFolder: ref(null),
        schedulePageGridMetrics: () => {},
        shouldUseNativeCatalog: () => true,
      });
      apps.persistence.restore({
        scanRoots: [{ id: "root", type: "customDirectory", label: "Root", path: "C:/Apps", enabled: true }],
      });

      await apps.browseScanRootDirectory("root");
      apps.openCreateManagedApp();
      await apps.editorModel.actions.browseTarget();
      await apps.rescanManagedApps();
      apps.editorModel.target.value = "C:/Apps/App.exe";
      apps.editorModel.actions.openIconChooser();
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert(warningDialogs.map((dialog) => dialog.title).join(",") === "无法选择扫描来源,无法选择启动文件,无法扫描应用", "failed native app actions should show warning dialogs");
      assert(
        warningDialogs[0]?.suggestion?.includes("folder denied") === true,
        "structured catalog failures should retain their platform message",
      );
      assert(apps.iconChooserModel.error.value.includes("无法读取应用内图标"), "failed icon choice loads should show an inline error");
    } finally {
      console.error = originalConsoleError;
    }
  });
}
