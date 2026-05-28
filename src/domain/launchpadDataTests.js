import { createLaunchpadDataHelpers, makeLaunchTarget, normalizeNativeApp } from "./launchpadData.js";
import { createLaunchpadLayoutHelpers, makePageSize } from "./launchpadLayout.js";

export function runLaunchpadDataTests() {
  const state = {
    gridRows: 1,
    gridCols: 2,
    folderRows: 1,
    folderCols: 2,
  };
  const pageSize = {
    get value() {
      return makePageSize(state.gridRows, state.gridCols);
    },
  };
  const folderPageSize = {
    get value() {
      return makePageSize(state.folderRows, state.folderCols);
    },
  };
  const layoutHelpers = createLaunchpadLayoutHelpers({
    getPageSize: () => pageSize.value,
    getFolderPageSize: () => folderPageSize.value,
  });
  const dataHelpers = createLaunchpadDataHelpers({
    cloneItem: layoutHelpers.cloneItem,
    clonePages: layoutHelpers.clonePages,
    compactPages: layoutHelpers.compactPages,
    ensurePage: layoutHelpers.ensurePage,
    getFolderChildPages: layoutHelpers.getFolderChildPages,
    getFolderPageSize: () => folderPageSize.value,
    getPageSize: () => pageSize.value,
    makeId: layoutHelpers.makeId,
    withFolderPages: layoutHelpers.withFolderPages,
  });
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad data test failed] ${message}`);
  };

  const normalized = normalizeNativeApp({ name: "Native", launch_target: { kind: "shortcut", path: "native.lnk" } }, 4);
  assert(normalized.id === "native-app-4", "native app fallback id should use the supplied index");
  assert(normalized.launchTarget.path === "native.lnk", "native app should normalize snake_case launch targets");
  assert(normalized.emoji === "N", "native app should derive a fallback glyph");
  assert(makeLaunchTarget("https://example.com").kind === "url", "http targets should become url launch targets");
  assert(makeLaunchTarget("C:/Tools/App.exe").kind === "executable", "local targets should become executable launch targets");

  const catalogApps = [
    { id: "a", type: "app", name: "A", emoji: "A", iconPath: "C:/Icons/a.png", iconDataUrl: "data:a", launchTarget: { kind: "shortcut", path: "a.lnk" } },
    { id: "b", type: "app", name: "B", emoji: "B", launchTarget: { kind: "shortcut", path: "b.lnk" } },
    { id: "c", type: "app", name: "C", emoji: "C", launchTarget: { kind: "shortcut", path: "c.lnk" } },
    { id: "hidden", type: "app", name: "Hidden", emoji: "H", launchTarget: { kind: "shortcut", path: "hidden.lnk" } },
  ];
  const savedLayout = {
    version: 1,
    pages: [
      [
        { id: "a", type: "app", name: "Renamed A", customIconDataUrl: "data:custom-a" },
        {
          id: "folder",
          type: "folder",
          name: "Tools",
          childPages: [
            [
              { id: "b", type: "app", name: "Saved B" },
              { id: "custom", type: "app", name: "Custom App", emoji: "C", launchTarget: { kind: "url", path: "https://example.com" }, launchArgs: "--safe" },
              { id: "a", type: "app", name: "Duplicate A" },
            ],
          ],
        },
      ],
    ],
    settings: {},
  };

  const merged = dataHelpers.mergeNativeCatalogWithSavedLayout(catalogApps, savedLayout, ["hidden"]);
  assert(merged.length === 2, "new non-hidden catalog apps should overflow to a second page when the first page is full");
  assert(merged[0][0].name === "Renamed A", "saved app names should override catalog names");
  assert(merged[0][0].customIconDataUrl === "data:custom-a", "saved custom icons should be preserved");
  assert(merged[0][1].type === "folder", "saved folders should be preserved");
  assert(merged[0][1].children.map((item) => item.id).join(",") === "b,custom", "folder merge should keep custom apps and remove duplicate app ids");
  assert(merged[1].map((item) => item.id).join(",") === "c", "new visible catalog apps should append after saved pages");
  assert(!merged.flat().some((item) => item.id === "hidden"), "hidden catalog apps should not be appended");

  const snapshot = dataHelpers.createLayoutSnapshot({
    pages: merged,
    gridRows: state.gridRows,
    gridCols: state.gridCols,
    folderRows: state.folderRows,
    folderCols: state.folderCols,
    iconSize: 64,
    folderIconSizeMode: "custom",
    folderIconSize: 88,
    textless: true,
    hiddenAppIds: ["hidden"],
  });
  assert(snapshot.version === 1, "layout snapshots should use version 1");
  assert(snapshot.settings.textless === true && snapshot.settings.hiddenAppIds[0] === "hidden", "layout snapshots should include settings");
  assert(snapshot.settings.folderIconSizeMode === "custom" && snapshot.settings.folderIconSize === 88, "layout snapshots should include folder icon size settings");
  assert(!("iconDataUrl" in snapshot.pages[0][0]), "layout snapshots should omit catalog icon data");
  assert(snapshot.pages[0][0].iconPath === "C:/Icons/a.png", "layout snapshots should preserve cached icon paths");
  assert(snapshot.pages[0][0].customIconDataUrl === "data:custom-a", "layout snapshots should preserve custom icon data");
  assert(snapshot.pages[0][1].children.length === 2, "folder snapshots should include flat children for compatibility");
}
