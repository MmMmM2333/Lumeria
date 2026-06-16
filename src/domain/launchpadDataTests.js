import {
  createLaunchpadDataHelpers,
  isAppBlockedByScanBlacklist,
  makeLaunchTarget,
  makeScanAppBlacklistEntry,
  normalizeNativeApp,
  normalizeScanAppBlacklist,
  normalizeScanKeywordBlacklist,
  normalizeScanRoots,
} from "./launchpadData.js";
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
  assert(makeLaunchTarget("https://example.com/file.url").kind === "url", "http targets ending in .url should stay url launch targets");
  assert(makeLaunchTarget("C:/Tools/App.lnk").kind === "shortcut", "local .lnk targets should become shortcut launch targets");
  assert(makeLaunchTarget("C:/Tools/App.url").kind === "shortcut", "local .url targets should become shortcut launch targets");
  assert(makeLaunchTarget("C:/Tools/App.exe").kind === "executable", "local targets should become executable launch targets");
  assert(normalizeScanKeywordBlacklist([" uninstall ", "UNINSTALL", "", "卸载"]).join(",") === "uninstall,卸载", "scan keywords should be trimmed and deduplicated");
  assert(normalizeScanRoots([]).length === 0, "empty scan roots should stay empty");
  const normalizedRoot = normalizeScanRoots([{ id: "root", label: "Root", path: "C:/Apps" }])[0];
  assert(!("lastScannedAt" in normalizedRoot), "scan roots should omit absent optional fields");
  const blockedEntry = makeScanAppBlacklistEntry({
    name: "Blocked",
    sourceKey: "scan-root:root:blocked.lnk",
    launchTarget: { path: "C:\\Apps\\Blocked.lnk" },
  });
  const normalizedBlacklist = normalizeScanAppBlacklist([blockedEntry, { path: "C:/Apps/Blocked.lnk" }]);
  assert(normalizedBlacklist.length === 1, "scan app blacklist should deduplicate source-key matches");
  assert(!("path" in normalizeScanAppBlacklist([{ sourceKey: "source-only" }])[0]), "scan blacklist should omit absent optional paths");
  assert(isAppBlockedByScanBlacklist({ sourceKey: "scan-root:root:blocked.lnk" }, normalizedBlacklist), "scan app blacklist should match source keys");
  assert(isAppBlockedByScanBlacklist({ launchTarget: { path: "C:/Apps/Blocked.lnk" } }, normalizedBlacklist), "scan app blacklist should match normalized paths");

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
        { id: "a", type: "app", name: "Renamed A", customIconPath: "C:/Icons/custom-a.png", iconDataUrl: "data:saved-a" },
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
  assert(merged[0][0].iconDataUrl === "data:a", "saved catalog icon data should not override native catalog icons");
  assert(merged[0][0].customIconPath === "C:/Icons/custom-a.png", "saved custom icon paths should be preserved");
  assert(merged[0][1].type === "folder", "saved folders should be preserved");
  assert(merged[0][1].children.map((item) => item.id).join(",") === "b,custom", "folder merge should keep custom apps and remove duplicate app ids");
  assert(!("launchArgs" in merged[0][1].children[1]), "non-executable custom apps should not preserve launch args");
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
    backgroundBaseColor: "#ABC",
    backgroundBaseOpacity: 74,
    backgroundSource: "customImage",
    backgroundEffect: "dimmed",
    backgroundImageOpacity: 62,
    backgroundLiveDesktopOpacity: 77,
    backgroundBlurStrength: 72,
    backgroundAcrylicBlurStrength: 73,
    backgroundDarkenColor: "#123",
    backgroundDarkenStrength: 61,
    backgroundAcrylicAppearance: "light",
    backgroundAcrylicDarkParams: { brightness: 0.7, tintColor: "#222222" },
    backgroundAcrylicLightParams: { brightness: 1.2, tintColor: "#dddddd" },
    backgroundImagePath: " C:/Images/custom.webp ",
    windowEffectMaterial: "mica",
    windowEffectAppearance: "light",
    windowMode: "windowed",
    mainWindowShortcut: "control+alt+KeyL",
  });
  assert(snapshot.version === 1, "layout snapshots should use version 1");
  assert(snapshot.settings.textless === true && snapshot.settings.hiddenAppIds[0] === "hidden", "layout snapshots should include settings");
  assert(snapshot.settings.folderIconSizeMode === "custom" && snapshot.settings.folderIconSize === 88, "layout snapshots should include folder icon size settings");
  assert(Array.isArray(snapshot.settings.scanRoots), "layout snapshots should include scan roots");
  assert(Array.isArray(snapshot.settings.scanKeywordBlacklist), "layout snapshots should include scan keyword blacklist");
  assert(Array.isArray(snapshot.settings.scanAppBlacklist), "layout snapshots should include scan app blacklist");
  assert(snapshot.settings.showMissingLaunchTargetBadge === true, "layout snapshots should include missing target badge preference");
  assert(snapshot.settings.backgroundBaseColor === "#aabbcc", "layout snapshots should include normalized background base color");
  assert(snapshot.settings.backgroundBaseOpacity === 74, "layout snapshots should include background base opacity");
  assert(snapshot.settings.backgroundSource === "customImage" && snapshot.settings.backgroundEffect === "dimmed", "layout snapshots should include background source and effect");
  assert(snapshot.settings.backgroundImageOpacity === 62, "layout snapshots should include background image opacity");
  assert(snapshot.settings.backgroundLiveDesktopOpacity === 77, "layout snapshots should include live desktop opacity");
  assert(snapshot.settings.backgroundBlurStrength === 72, "layout snapshots should include background blur strength");
  assert(snapshot.settings.backgroundAcrylicBlurStrength === 73, "layout snapshots should include acrylic blur strength");
  assert(snapshot.settings.backgroundDarkenColor === "#112233", "layout snapshots should include normalized background darken color");
  assert(snapshot.settings.backgroundDarkenStrength === 61, "layout snapshots should include background darken strength");
  assert(snapshot.settings.backgroundAcrylicAppearance === "light", "layout snapshots should include acrylic appearance");
  assert(snapshot.settings.backgroundAcrylicDarkParams.brightness === 0.7, "layout snapshots should include acrylic dark params");
  assert(snapshot.settings.backgroundAcrylicDarkParams.tintColor[0] === 0x22 / 255, "layout snapshots should normalize acrylic dark tint");
  assert(snapshot.settings.backgroundAcrylicLightParams.brightness === 1.2, "layout snapshots should include acrylic light params");
  assert(snapshot.settings.backgroundImagePath === "C:/Images/custom.webp", "layout snapshots should include the trimmed custom background image path");
  assert(snapshot.settings.windowEffectMaterial === "mica" && snapshot.settings.windowEffectAppearance === "light", "layout snapshots should include window effect settings");
  assert(snapshot.settings.windowMode === "windowed", "layout snapshots should include window mode settings");
  assert(snapshot.settings.mainWindowShortcut === "control+alt+KeyL", "layout snapshots should include the main window shortcut");
  const disabledShortcutSnapshot = dataHelpers.createLayoutSnapshot({
    ...snapshot.settings,
    pages: merged,
    mainWindowShortcut: null,
  });
  assert(disabledShortcutSnapshot.settings.mainWindowShortcut === null, "layout snapshots should preserve disabled main window shortcuts");
  const acrylicSnapshot = dataHelpers.createLayoutSnapshot({
    ...snapshot.settings,
    pages: merged,
    backgroundSource: "customImage",
    backgroundEffect: "acrylicWebgl",
    backgroundImagePath: "C:/Images/acrylic.webp",
  });
  assert(acrylicSnapshot.settings.backgroundEffect === "acrylicWebgl", "layout snapshots should preserve webgl acrylic background effect");
  const blurSnapshot = dataHelpers.createLayoutSnapshot({
    ...snapshot.settings,
    pages: merged,
    backgroundSource: "customImage",
    backgroundEffect: "blur",
    backgroundImagePath: "C:/Images/blur.webp",
  });
  assert(blurSnapshot.settings.backgroundEffect === "blur", "layout snapshots should preserve blur background effect");
  const liveSnapshot = dataHelpers.createLayoutSnapshot({
    ...snapshot.settings,
    pages: merged,
    backgroundSource: "windowsLiveDesktop",
    backgroundEffect: "dimmed",
    backgroundImagePath: "C:/Images/ignored.webp",
  });
  assert(liveSnapshot.settings.backgroundSource === "windowsLiveDesktop", "layout snapshots should preserve live desktop background source");
  assert(liveSnapshot.settings.backgroundImagePath === null, "layout snapshots should clear image paths for live desktop backgrounds");
  const plainSnapshot = dataHelpers.createLayoutSnapshot({
    ...snapshot.settings,
    pages: merged,
    windowEffectMaterial: "none",
    windowMode: "floating",
    backgroundSource: "systemMaterial",
    backgroundImagePath: "C:/Images/ignored.webp",
  });
  assert(plainSnapshot.settings.windowEffectMaterial === "none", "layout snapshots should preserve disabled window material");
  assert(plainSnapshot.settings.windowMode === "fullscreen", "layout snapshots should fall back to fullscreen for missing window mode");
  assert(plainSnapshot.settings.backgroundImagePath === null, "layout snapshots should clear image paths when no image layer is selected");
  assert(!("iconDataUrl" in snapshot.pages[0][0]), "layout snapshots should omit catalog icon data");
  assert(snapshot.pages[0][0].iconPath === "C:/Icons/a.png", "layout snapshots should preserve cached icon paths");
  assert(snapshot.pages[0][0].customIconPath === "C:/Icons/custom-a.png", "layout snapshots should preserve custom icon paths");
  assert(snapshot.pages[0][1].children.length === 2, "folder snapshots should include flat children for compatibility");
  assert(!("launchArgs" in snapshot.pages[0][1].children[1]), "layout snapshots should omit non-executable launch args");
}
