import { ref } from "vue";
import {
  getLaunchIconRect,
  resolveCurrentIconScope,
  useLaunchpadIconActivation,
} from "./useLaunchpadIconActivation.js";
import {
  createIconBoundsRegistry,
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../rendering/pixi/geometry/iconBoundsRegistry.js";

const K = ICON_BOUNDS_KIND;
const V = ICON_BOUNDS_VARIANT;

const desktopApp = { id: "desktop-app", type: "app", name: "Desktop App" };
const folderApp = { id: "folder-app", type: "app", name: "Folder App" };
const searchApp = { id: "search-app", type: "app", name: "Search App" };
const missingApp = { id: "missing-app", type: "app", name: "Missing App" };
const folder = {
  id: "folder-1",
  type: "folder",
  name: "Folder",
  childPages: [[folderApp]],
};

function findInFolder(sourcePages, folderId, itemId) {
  for (const page of sourcePages) {
    const currentFolder = page.find((item) => item?.type === "folder" && item.id === folderId);
    const childPages = currentFolder?.childPages || [];
    for (let pageIndex = 0; pageIndex < childPages.length; pageIndex += 1) {
      const index = childPages[pageIndex].findIndex((item) => item?.id === itemId);
      if (index >= 0) return { folder: currentFolder, pageIndex, index, item: childPages[pageIndex][index] };
    }
  }
  return null;
}

function findTopLevel(sourcePages, itemId) {
  for (let pageIndex = 0; pageIndex < sourcePages.length; pageIndex += 1) {
    const index = sourcePages[pageIndex].findIndex((item) => item?.id === itemId);
    if (index >= 0) return { pageIndex, index, item: sourcePages[pageIndex][index] };
  }
  return null;
}

function createIconActivation(overrides = {}) {
  const calls = {
    clearFocusedIcon: 0,
    commitOpenFolder: [],
    openApp: [],
    focusFirstIconInCurrentScope: [],
  };
  const pages = ref(overrides.pages ?? [[desktopApp, folder], [searchApp]]);
  const iconBoundsRegistry = overrides.iconBoundsRegistry || createIconBoundsRegistry();
  const folderPages = ref(overrides.folderPages ?? [[folderApp]]);
  const renderedFolder = ref(overrides.renderedFolder ?? null);
  const searchPages = ref(overrides.searchPages ?? [[searchApp], [folderApp]]);
  const focusedIcon = ref(overrides.focusedIcon ?? null);
  const selectedItem = ref(overrides.selectedItem ?? null);

  const activationOptions = {
    clearFocusedIcon: () => {
      calls.clearFocusedIcon += 1;
    },
    commitOpenFolder: (value) => calls.commitOpenFolder.push(value),
    findInFolder,
    findFocusedItem: () => selectedItem.value,
    findTopLevel,
    folderCols: ref(overrides.folderCols ?? 7),
    folderPageIndex: ref(overrides.folderPageIndex ?? 0),
    getFolderPages: () => folderPages.value,
    getRenderedFolder: () => renderedFolder.value,
    getSearchPages: () => searchPages.value,
    getFocusedIcon: () => focusedIcon.value,
    getVisibleDesktopPage: (page) => (page || []).slice(0, overrides.desktopLimit ?? 20),
    getVisibleFolderPage: (page) => (page || []).slice(0, overrides.folderLimit ?? 20),
    gridCols: ref(overrides.gridCols ?? 7),
    iconBoundsRegistry,
    isFolderAppLaunchClosing: ref(overrides.isFolderAppLaunchClosing ?? false),
    isFolderClosing: ref(overrides.isFolderClosing ?? false),
    isSearchMode: () => Boolean(overrides.isSearchMode),
    openApp: (app, source) => calls.openApp.push({ app, source }),
    openFolderId: ref(overrides.openFolderId ?? null),
    pageIndex: ref(overrides.pageIndex ?? 0),
    pages,
    searchPageIndex: ref(overrides.searchPageIndex ?? 1),
    focusFirstIconInCurrentScope: (options) => calls.focusFirstIconInCurrentScope.push(options),
  };
  activationOptions.getCurrentIconScope = () => resolveCurrentIconScope(activationOptions);
  const activation = useLaunchpadIconActivation(activationOptions);

  return {
    activation,
    calls,
    folderPages,
    iconBoundsRegistry,
    pages,
    renderedFolder,
    searchPages,
    focusedIcon,
    selectedItem,
  };
}

export function runLaunchpadIconActivationTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad icon activation test failed] ${message}`);
  };

  const registry = createIconBoundsRegistry();
  registry.clearBounds();
  assert(getLaunchIconRect({ area: "desktop", id: "desktop-app", pageIndex: 0 }, registry) === null, "rect lookup should return null without pixi bounds");
  registry.registerBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: "desktop-app", pageIndex: 0 }, { left: 12, top: 24, width: 36, height: 48 });
  const rect = getLaunchIconRect({ area: "desktop", id: "desktop-app", pageIndex: 0 }, registry);
  assert(rect.left === 12 && rect.width === 36, "rect lookup should return plain geometry");
  registry.clearBounds();

  registry.registerBounds(
    K.LAUNCH,
    V.RENDERED,
    { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 },
    { left: 12, top: 24, width: 36, height: 48 },
    { area: "folder", folderId: "old-folder", id: "folder-app", pageIndex: 0 }
  );
  registry.registerBounds(
    K.LAUNCH,
    V.LIVE_TARGET,
    { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 },
    { left: 40, top: 50, width: 60, height: 70 },
    { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 }
  );
  const liveFallbackRect = getLaunchIconRect({ area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 }, registry);
  assert(liveFallbackRect.left === 40 && liveFallbackRect.height === 70, "folder launch rect should reject stale rendered metadata and fall back to live target bounds");
  registry.clearBounds();

  registry.registerBounds(
    K.LAUNCH,
    V.STABLE_STAGE_LAYOUT,
    { area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 },
    { left: 20, top: 30, width: 40, height: 50 },
    {
      area: "folder",
      folderId: "folder-1",
      id: "folder-app",
      pageIndex: 0,
      stageHeight: 100,
      stageRect: { height: 200, left: 10, top: 20, width: 300 },
      stageWidth: 150,
    }
  );
  const stableFallbackRect = getLaunchIconRect({ area: "folder", folderId: "folder-1", id: "folder-app", pageIndex: 0 }, registry);
  assert(stableFallbackRect.left === 50 && stableFallbackRect.top === 80, "folder launch rect should project stable stage layout fallback bounds");
  registry.clearBounds();

  const desktop = createIconActivation({ pageIndex: 1 });
  const desktopScope = desktop.activation.getCurrentIconScope();
  assert(desktopScope.area === "desktop" && desktopScope.pageIndex === 1, "desktop scope should use the current desktop page");
  assert(desktopScope.items[0].id === "search-app", "desktop scope should expose visible desktop items");

  const search = createIconActivation({ isSearchMode: true, searchPageIndex: 1 });
  const searchScope = search.activation.getCurrentIconScope();
  assert(searchScope.area === "search" && searchScope.pageIndex === 1, "search scope should use the search page index");
  assert(searchScope.items[0].id === "folder-app", "search scope should expose visible search items");

  const folderScopeFlow = createIconActivation({ openFolderId: "folder-1", renderedFolder: folder });
  const folderScope = folderScopeFlow.activation.getCurrentIconScope();
  assert(folderScope.area === "folder" && folderScope.folderId === "folder-1", "folder scope should win when a folder layer is active");
  assert(folderScope.items[0].id === "folder-app", "folder scope should expose visible folder items");

  const noSelection = createIconActivation();
  noSelection.activation.openFocusedIcon();
  assert(noSelection.calls.focusFirstIconInCurrentScope.length === 1, "opening without selection should select the first icon");

  const folderSelection = createIconActivation({
    selectedItem: { item: folder, scope: { area: "desktop", pageIndex: 0, folderId: null } },
  });
  folderSelection.activation.openFocusedIcon();
  assert(folderSelection.calls.commitOpenFolder.join(",") === "folder-1", "opening a selected desktop folder should open it");
  assert(folderSelection.calls.clearFocusedIcon === 1, "opening a selected folder should clear selection");

  const appSelection = createIconActivation({
    selectedItem: { item: folderApp, scope: { area: "folder", pageIndex: 0, folderId: "folder-1" } },
  });
  appSelection.activation.openFocusedIcon();
  assert(appSelection.calls.openApp.length === 1, "opening a selected app should call openApp");
  assert(appSelection.calls.openApp[0].source.type === "folder", "folder app selection should preserve folder source");

  const explicit = createIconActivation({ renderedFolder: folder, searchPageIndex: 3 });
  assert(explicit.activation.normalizeLaunchSource(desktopApp, { type: "page" }).pageIndex === 0, "page launch sources should default to the desktop page index");
  assert(explicit.activation.normalizeLaunchSource(searchApp, { type: "search" }).pageIndex === 3, "search launch sources should default to the search page index");
  assert(explicit.activation.normalizeLaunchSource(folderApp, { type: "folder" }).folderId === "folder-1", "folder launch sources should default to the rendered folder id");

  const selectedSource = createIconActivation({
    focusedIcon: { area: "search", id: searchApp.id, pageIndex: 4, folderId: null },
  });
  assert(selectedSource.activation.normalizeLaunchSource(searchApp).pageIndex === 4, "selected icon metadata should be reused when it matches the app");

  const folderSource = createIconActivation({ renderedFolder: folder });
  const normalizedFolder = folderSource.activation.normalizeLaunchSource(folderApp);
  assert(normalizedFolder.area === "folder" && normalizedFolder.folderId === "folder-1", "apps inside rendered folders should resolve as folder launches");

  const searchSource = createIconActivation({ isSearchMode: true });
  const normalizedSearch = searchSource.activation.normalizeLaunchSource(folderApp);
  assert(normalizedSearch.area === "search" && normalizedSearch.pageIndex === 1, "search results should resolve to their search page");

  const desktopSource = createIconActivation();
  const normalizedDesktop = desktopSource.activation.normalizeLaunchSource(desktopApp);
  assert(normalizedDesktop.area === "desktop" && normalizedDesktop.pageIndex === 0, "top-level apps should resolve to desktop launches");
  assert(desktopSource.activation.normalizeLaunchSource(missingApp).pageIndex === 0, "missing apps should fall back to the current desktop page");
}
