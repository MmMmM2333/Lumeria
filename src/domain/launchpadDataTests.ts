import {
  canExcludeAppFromScan,
  createDefaultScanRoots,
  createLaunchpadDataHelpers,
  isAppExcludedFromScan,
  makeLaunchTarget,
  makeScanAppExclusionEntry,
  normalizeNativeApp,
  normalizeScanAppBlacklist,
  normalizeScanKeywordAllowlist,
  normalizeScanKeywordBlacklist,
  normalizeScanRoots,
} from "./launchpadData.js";
import { DEFAULT_SCAN_ROOTS } from "../platform/applicationCatalogDefaults.js";
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
    getNewFolderName: () => "New Folder",
    getPageSize: () => pageSize.value,
    makeId: layoutHelpers.makeId,
    withFolderPages: layoutHelpers.withFolderPages,
  });
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad data test failed] ${message}`);
  };

  const normalized = normalizeNativeApp({
    id: "catalog-native",
    type: "app",
    name: "Native",
    launchTarget: { kind: "shortcut", path: "native.lnk" },
    trackingKey: "launch:native",
    identityStatus: "exact",
    sources: [{
      key: "native",
      type: "customDirectory",
      state: "primary",
      rootId: "root-native",
      rootLabel: "Native",
      relativePath: "native.exe",
      absolutePath: "C:/Apps/native.exe",
    }],
  });
  assert(normalized.id === "catalog-native", "native apps should preserve canonical catalog ids");
  assert(normalized.launchTarget.path === "native.lnk", "native apps should preserve launch targets");
  assert(normalized.emoji === "N", "native app should derive a fallback glyph");
  assert(makeLaunchTarget("https://example.com")?.kind === "url", "http targets should become url launch targets");
  assert(makeLaunchTarget("https://example.com/file.url")?.kind === "url", "http targets ending in .url should stay url launch targets");
  assert(makeLaunchTarget("C:/Tools/App.lnk")?.kind === "shortcut", "local .lnk targets should become shortcut launch targets");
  assert(makeLaunchTarget("C:/Tools/App.url")?.kind === "shortcut", "local .url targets should become shortcut launch targets");
  assert(makeLaunchTarget("C:/Tools/App.exe")?.kind === "executable", "local targets should become executable launch targets");
  assert(normalizeScanKeywordBlacklist([" uninstall ", "UNINSTALL", "", "卸载"]).join(",") === "uninstall,卸载", "scan keywords should be trimmed and deduplicated");
  assert(
    normalizeScanKeywordAllowlist([" catalog-app ", "CATALOG-APP", "", null]).join(",") === "catalog-app",
    "scan keyword exceptions should normalize stable catalog ids"
  );
  assert(normalizeScanRoots([]).length === 0, "empty scan roots should stay empty");
  const windowsAppRoot = DEFAULT_SCAN_ROOTS.find((root) => root.type === "windowsAppCatalog");
  assert(windowsAppRoot?.path === "shell:AppsFolder", "default scan roots should include the Windows app catalog");
  assert(windowsAppRoot?.removable === false, "the system-managed Windows app catalog should not be removable");
  const localizedRoots = createDefaultScanRoots({
    roots: DEFAULT_SCAN_ROOTS,
    translate: (key) => ({
      "settings.apps.sources.default.systemStartMenu": "System Start Menu",
      "settings.apps.sources.default.userStartMenu": "User Start Menu",
      "settings.apps.sources.default.windowsCatalog": "Windows Apps",
    })[key],
  });
  assert(localizedRoots.map((root) => root.label).join(",") === "Windows Apps,User Start Menu,System Start Menu", "default scan-root labels should be created through the active locale");
  const normalizedRoot = normalizeScanRoots([{ id: "root", label: "Root", path: "C:/Apps" }])[0];
  assert(normalizedRoot && !("lastScannedAt" in normalizedRoot), "scan roots should omit absent optional fields");
  const blockedEntry = makeScanAppExclusionEntry({
    id: "catalog-blocked",
    origin: "catalog",
    name: "Blocked",
  });
  const normalizedBlacklist = normalizeScanAppBlacklist([blockedEntry, { catalogId: "CATALOG-BLOCKED" }]);
  assert(normalizedBlacklist.length === 1, "scan app blacklist should deduplicate canonical catalog ids");
  assert(normalizedBlacklist[0]?.catalogId === "catalog-blocked", "scan blacklist should persist the canonical catalog id");
  assert(isAppExcludedFromScan({ id: "catalog-blocked" }, normalizedBlacklist), "scan app blacklist should match canonical catalog ids");
  assert(canExcludeAppFromScan({ id: "catalog-settings", origin: "catalog" }), "catalog apps should support logical scan exclusion");
  assert(!canExcludeAppFromScan({ id: "manual-tool", origin: "manual" }), "manual apps should not expose scan exclusion");
  assert(makeScanAppExclusionEntry({ id: "manual-web", origin: "manual" }) === null, "scan exclusion entries should require catalog ownership");

  const reconciledV2Result = dataHelpers.reconcileDocument(
    [
      {
        id: "catalog-steam",
        type: "app",
        name: "Steam",
        iconPath: "C:/Catalog/steam.png",
        launchTarget: { kind: "shortcut", path: "C:/Current/Steam.lnk" },
        sources: [{ key: "steam-current", type: "customDirectory", state: "primary" }],
      },
      {
        id: "catalog-new",
        type: "app",
        name: "New App",
        launchTarget: { kind: "executable", path: "C:/Apps/New.exe" },
        sources: [{ key: "new", type: "startMenuUser", state: "primary" }],
      },
      {
        id: "catalog-hidden",
        type: "app",
        name: "Hidden",
        launchTarget: { kind: "executable", path: "C:/Apps/Hidden.exe" },
        sources: [{ key: "hidden", type: "startMenuUser", state: "primary" }],
      },
    ],
    {
      version: 2,
      pages: [[
        {
          id: "catalog-steam",
          type: "catalogApp",
          overrides: { name: "My Steam", customIconPath: "C:/Custom/steam.png" },
          launchTarget: { kind: "executable", path: "C:/Stale/Steam.exe" },
        },
        {
          id: "manual-web",
          type: "manualApp",
          name: "Web",
          emoji: "W",
          launchTarget: { kind: "url", path: "https://example.com" },
        },
      ]],
      settings: {},
    },
    ["catalog-hidden"]
  );
  const reconciledV2 = reconciledV2Result.pages;
  assert(reconciledV2Result.issues.length === 0, "a clean reconciliation should not emit issues");
  const reconciledCatalog = reconciledV2[0]![0]!;
  const reconciledManual = reconciledV2[0]![1]!;
  assert(reconciledCatalog.type === "app" && reconciledCatalog.origin === "catalog", "catalog references should become catalog-owned runtime apps");
  assert(reconciledCatalog.name === "My Steam", "catalog references should apply explicit presentation overrides");
  assert(reconciledCatalog.launchTarget?.path === "C:/Current/Steam.lnk", "saved catalog references must not override current launch data");
  assert(reconciledCatalog.sources?.[0]?.key === "steam-current", "catalog references should use current provenance");
  assert(reconciledManual.type === "app" && reconciledManual.origin === "manual", "manual apps should retain their saved launch configuration");
  assert(reconciledV2[1]![0]!.id === "catalog-new", "new catalog apps should append after restored placements");
  assert(!reconciledV2.flat().some((item) => item.id === "catalog-hidden"), "hidden catalog ids should not be appended");

  const catalogApps = [
    { id: "a", type: "app", name: "A", emoji: "A", iconPath: "C:/Icons/a.png", iconDataUrl: "data:a", launchTarget: { kind: "shortcut", path: "a.lnk" } },
    { id: "b", type: "app", name: "B", emoji: "B", launchTarget: { kind: "shortcut", path: "b.lnk" } },
    { id: "c", type: "app", name: "C", emoji: "C", launchTarget: { kind: "shortcut", path: "c.lnk" } },
    { id: "hidden", type: "app", name: "Hidden", emoji: "H", launchTarget: { kind: "shortcut", path: "hidden.lnk" } },
  ];
  const savedLayout = {
    version: 2,
    pages: [
      [
        { id: "a", type: "catalogApp", runAsAdmin: true, overrides: { name: "Renamed A", customIconPath: "C:/Icons/custom-a.png" } },
        {
          id: "folder",
          type: "folder",
          name: "Tools",
          childPages: [
            [
              { id: "b", type: "catalogApp", overrides: { name: "Saved B" } },
              { id: "custom", type: "manualApp", name: "Custom App", emoji: "C", launchTarget: { kind: "url", path: "https://example.com" }, launchArgs: "--safe" },
              { id: "a", type: "catalogApp", overrides: { name: "Duplicate A" } },
            ],
          ],
        },
      ],
    ],
    settings: {},
  };

  const mergedResult = dataHelpers.reconcileDocument(catalogApps, savedLayout, ["hidden"]);
  const merged = mergedResult.pages;
  assert(merged.length === 2, "new non-hidden catalog apps should overflow to a second page when the first page is full");
  const mergedCatalog = merged[0]![0]!;
  const mergedFolder = merged[0]![1]!;
  assert(mergedCatalog.type === "app" && mergedCatalog.name === "Renamed A", "saved app names should override catalog names");
  assert(mergedCatalog.iconDataUrl === "data:a", "saved catalog icon data should not override native catalog icons");
  assert(mergedCatalog.runAsAdmin === true, "catalog refresh preserves administrator launch preference");
  assert(mergedCatalog.customIconPath === "C:/Icons/custom-a.png", "saved custom icon paths should be preserved");
  assert(mergedFolder.type === "folder", "saved folders should be preserved");
  assert(mergedFolder.childPages.flat().filter(Boolean).map((item) => item!.id).join(",") === "b,custom", "folder merge should keep custom apps and remove duplicate app ids");
  assert(!("launchArgs" in mergedFolder.childPages.flat().filter(Boolean)[1]!), "non-executable custom apps should not preserve launch args");
  assert(merged[1]!.map((item) => item.id).join(",") === "c", "new visible catalog apps should append after saved pages");
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
    scanKeywordAllowlist: ["catalog-uninstall", "CATALOG-UNINSTALL"],
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
    windowEffectAppearance: "system",
    windowMode: "windowed",
    fullscreenOverscanEnabled: false,
    showCustomTitlebar: false,
    mainWindowShortcut: "control+alt+KeyL",
    hotCorners: { enabled: true, corners: 9, delayMs: 500, modifier: "alt", pauseFullscreen: true, toggle: true },
    launchpadIconVariant: "pastelDark",
    localePreference: "en-US",
    settingsThemePreference: "system",
  });
  assert(snapshot.settings.hotCorners?.enabled && snapshot.settings.hotCorners.toggle && snapshot.settings.hotCorners.corners === 9, "layout snapshots retain hot corner settings");
  assert(snapshot.version === 2, "layout snapshots should use version 2");
  assert(snapshot.settings.textless === true && snapshot.settings.hiddenAppIds[0] === "hidden", "layout snapshots should include settings");
  assert(snapshot.settings.folderIconSizeMode === "custom" && snapshot.settings.folderIconSize === 88, "layout snapshots should include folder icon size settings");
  assert(Array.isArray(snapshot.settings.scanRoots), "layout snapshots should include scan roots");
  assert(Array.isArray(snapshot.settings.scanKeywordBlacklist), "layout snapshots should include scan keyword blacklist");
  assert(
    snapshot.settings.scanKeywordAllowlist.join(",") === "catalog-uninstall",
    "layout snapshots should include normalized keyword exceptions"
  );
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
  assert(snapshot.settings.windowEffectMaterial === "mica" && snapshot.settings.windowEffectAppearance === "system", "layout snapshots should preserve system-following window effect settings");
  assert(snapshot.settings.windowMode === "windowed", "layout snapshots should include window mode settings");
  assert(snapshot.settings.fullscreenOverscanEnabled === false, "layout snapshots should preserve disabled fullscreen overscan");
  assert(snapshot.settings.showCustomTitlebar === false, "layout snapshots should include custom titlebar visibility");
  assert(snapshot.settings.mainWindowShortcut === "control+alt+KeyL", "layout snapshots should include the main window shortcut");
  assert(snapshot.settings.launchpadIconVariant === "pastelDark", "layout snapshots should include the launchpad icon variant");
  assert(snapshot.settings.localePreference === "en-US", "layout snapshots should include the language preference without changing version 2");
  assert(snapshot.settings.settingsThemePreference === "system", "layout snapshots should include the settings theme preference without changing version 2");
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
    backgroundEffect: "acrylic",
    backgroundImagePath: "C:/Images/acrylic.webp",
  });
  assert(acrylicSnapshot.settings.backgroundEffect === "acrylic", "layout snapshots should preserve the acrylic background effect");
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
  const snapshotCatalog = snapshot.pages[0]![0]!;
  const snapshotFolder = snapshot.pages[0]![1]!;
  assert(snapshotCatalog.type === "catalogApp", "layout snapshots should persist catalog references");
  assert(snapshotCatalog.runAsAdmin === true, "catalog administrator preference survives serialization");
  assert(!("iconDataUrl" in snapshotCatalog), "catalog references should omit runtime icon data");
  assert(!("iconPath" in snapshotCatalog), "catalog references should omit scanned icon paths");
  assert(!("launchTarget" in snapshotCatalog), "catalog references should omit scanned launch targets");
  assert(snapshotCatalog.overrides?.customIconPath === "C:/Icons/custom-a.png", "catalog references should preserve explicit presentation overrides");
  assert(snapshotFolder.type === "folder", "layout snapshots should persist folders");
  assert(snapshotFolder.childPages.flat().length === 2, "folder snapshots should persist canonical child pages");
  assert(!("children" in snapshotFolder), "layout snapshots should not persist a duplicate flat children representation");
  assert(!("launchArgs" in snapshotFolder.childPages.flat()[1]!), "layout snapshots should omit non-executable launch args");

  const issueResult = dataHelpers.reconcileDocument(
    catalogApps,
    {
      version: 2,
      pages: [[
        { id: "missing", type: "catalogApp" },
        {
          id: "legacy-folder",
          type: "folder",
          name: "Legacy",
          children: [{ id: "c", type: "catalogApp" }],
        },
      ]],
      settings: {},
    },
    []
  );
  assert(issueResult.issues.some((issue) => issue.kind === "missing-catalog-item"), "missing catalog items should be reported instead of silently disappearing");
  assert(issueResult.issues.some((issue) => issue.kind === "unsupported-folder-children"), "legacy flat folder children should be rejected");
}
