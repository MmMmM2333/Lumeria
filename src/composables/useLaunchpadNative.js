import {
  DESKTOP_CLOSE_DURATION,
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { clamp } from "../domain/launchpadLayout.js";
import {
  DEFAULT_SCAN_KEYWORD_BLACKLIST,
  isAppBlockedByScanBlacklist,
  normalizeNativeApp,
  normalizeScanAppBlacklist,
  normalizeScanKeywordBlacklist,
  normalizeScanRoots,
} from "../domain/launchpadData.js";
import {
  checkLaunchTargets,
  convertFilePathToAssetUrl,
  hideMainWindow,
  isNativeBridgeAvailable,
  launchApp as launchNativeApp,
  listenNativeEvent,
  loadCachedAppIcons,
  loadLayout,
  saveLayout,
  scanApps,
  setMainWindowEffectsEnabled,
} from "../api/launchpadApi.js";

const USE_MOCK_DATA_IN_NATIVE = false;
const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";
const MIN_ICON_HYDRATION_BATCH_SIZE = 20;
const MAX_ICON_HYDRATION_BATCH_SIZE = 80;

export function useLaunchpadNative(options) {
  let nativeLayoutReady = false;
  let nativeWindowEffectsUpdate = Promise.resolve();
  let nativeSaveTimer = null;
  let nativeWindowHideTimer = null;
  let nativeWindowOpenSequence = null;
  let launchTargetStatusCheckRequestId = 0;
  let unlistenCloseDesktopEvent = null;
  let unlistenOpenDesktopEvent = null;
  let unlistenSettingsEvent = null;
  let unlistenToggleDesktopEvent = null;
  let unlistenLayoutRecoveredEvent = null;

  function shouldUseNativeCatalog() {
    return isNativeBridgeAvailable() && !USE_MOCK_DATA_IN_NATIVE;
  }

  function applyLayoutSettings(settings) {
    if (!settings) return;
    const rows = clamp(Number(settings.gridRows) || DEFAULT_ROWS, 2, 8);
    const cols = clamp(Number(settings.gridCols) || DEFAULT_COLS, 3, 10);
    const nextFolderRows = clamp(Number(settings.folderRows) || DEFAULT_FOLDER_ROWS, 2, 6);
    const nextFolderCols = clamp(Number(settings.folderCols) || DEFAULT_FOLDER_COLS, 2, 8);
    const nextIconSize = options.clampIconSize(settings.iconSize);
    const nextFolderIconSizeMode = settings.folderIconSizeMode === FOLDER_ICON_SIZE_MODE_CUSTOM
      ? FOLDER_ICON_SIZE_MODE_CUSTOM
      : FOLDER_ICON_SIZE_MODE_GLOBAL;
    const nextFolderIconSize = options.clampIconSize(settings.folderIconSize ?? nextIconSize);

    options.gridRows.value = rows;
    options.gridCols.value = cols;
    options.folderRows.value = nextFolderRows;
    options.folderCols.value = nextFolderCols;
    options.iconSize.value = nextIconSize;
    options.folderIconSizeMode.value = nextFolderIconSizeMode;
    options.folderIconSize.value = nextFolderIconSize;
    options.draftRows.value = rows;
    options.draftCols.value = cols;
    options.draftFolderRows.value = nextFolderRows;
    options.draftFolderCols.value = nextFolderCols;
    options.draftIconSize.value = nextIconSize;
    options.draftFolderIconSizeMode.value = nextFolderIconSizeMode;
    options.draftFolderIconSize.value = nextFolderIconSize;
    options.isTextlessMode.value = Boolean(settings.textless);
    options.hiddenAppIds.value = Array.isArray(settings.hiddenAppIds)
      ? settings.hiddenAppIds.map(String)
      : [];
    options.scanRoots.value = normalizeScanRoots(settings.scanRoots);
    options.scanKeywordBlacklist.value = Array.isArray(settings.scanKeywordBlacklist)
      ? normalizeScanKeywordBlacklist(settings.scanKeywordBlacklist)
      : [...DEFAULT_SCAN_KEYWORD_BLACKLIST];
    options.scanAppBlacklist.value = normalizeScanAppBlacklist(settings.scanAppBlacklist);
    options.showMissingLaunchTargetBadge.value = settings.showMissingLaunchTargetBadge !== false;
  }

  function clearNativeSaveTimer() {
    if (nativeSaveTimer) window.clearTimeout(nativeSaveTimer);
    nativeSaveTimer = null;
  }

  function clearNativeWindowHideTimer() {
    if (nativeWindowHideTimer) window.clearTimeout(nativeWindowHideTimer);
    nativeWindowHideTimer = null;
  }

  function scheduleNativeLayoutSave() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return;
    clearNativeSaveTimer();
    nativeSaveTimer = window.setTimeout(async () => {
      nativeSaveTimer = null;
      try {
        await saveLayout(options.createLayoutSnapshot({
          pages: options.pages.value,
          gridRows: options.gridRows.value,
          gridCols: options.gridCols.value,
          folderRows: options.folderRows.value,
          folderCols: options.folderCols.value,
          iconSize: options.iconSize.value,
          folderIconSizeMode: options.folderIconSizeMode.value,
          folderIconSize: options.folderIconSize.value,
          textless: options.isTextlessMode.value,
          hiddenAppIds: options.hiddenAppIds.value,
          scanRoots: options.scanRoots.value,
          scanKeywordBlacklist: options.scanKeywordBlacklist.value,
          scanAppBlacklist: options.scanAppBlacklist.value,
          showMissingLaunchTargetBadge: options.showMissingLaunchTargetBadge.value,
        }));
      } catch (error) {
        console.error("Failed to save LaunchPad layout", error);
      }
    }, 320);
  }

  async function loadNativeLaunchpadData() {
    if (!shouldUseNativeCatalog()) return;

    try {
      const savedLayout = await loadLayout();
      if (!savedLayout) {
        options.pages.value = [[]];
        const nativeApps = await scanInitialNativeApps();
        options.pages.value = options.mergeNativeCatalogWithSavedLayout(
          nativeApps,
          { version: 1, pages: [] },
          options.hiddenAppIds.value
        );
        options.pages.value = applyCachedIconAssetUrls(options.pages.value);
        options.commitPageIndex(options.pageIndex.value);
        options.commitSearchPageIndex(options.searchPageIndex.value);
        options.commitFolderPageIndex(options.folderPageIndex.value);
        nativeLayoutReady = true;
        hydrateCachedAppIcons();
        options.schedulePageGridMetrics();
        scheduleLaunchTargetStatusCheck();
        return;
      }

      applyLayoutSettings(savedLayout?.settings);
      options.pages.value = options.mergeNativeCatalogWithSavedLayout(
        [],
        savedLayout,
        options.hiddenAppIds.value
      );
      options.pages.value = applyCachedIconAssetUrls(options.pages.value);
      options.commitPageIndex(options.pageIndex.value);
      options.commitSearchPageIndex(options.searchPageIndex.value);
      options.commitFolderPageIndex(options.folderPageIndex.value);
      nativeLayoutReady = true;
      hydrateCachedAppIcons();
      options.schedulePageGridMetrics();
      scheduleLaunchTargetStatusCheck();
    } catch (error) {
      nativeLayoutReady = false;
      console.error("Failed to load native LaunchPad data", error);
    }
  }

  async function scanInitialNativeApps() {
    const enabledRoots = normalizeScanRoots(options.scanRoots.value).filter((root) => root.enabled);
    if (!enabledRoots.length) return [];
    const scanFilters = {
      keywordBlacklist: normalizeScanKeywordBlacklist(options.scanKeywordBlacklist.value),
      appBlacklist: normalizeScanAppBlacklist(options.scanAppBlacklist.value),
    };
    const nativeApps = await scanApps(enabledRoots, scanFilters);
    const now = new Date().toISOString();
    const scannedRootIds = new Set(enabledRoots.map((root) => root.id));
    options.scanRoots.value = options.scanRoots.value.map((root) =>
      scannedRootIds.has(root.id) ? { ...root, lastScannedAt: now } : root
    );
    return (nativeApps || [])
      .map(normalizeNativeApp)
      .filter((app) => !isAppBlockedByScanBlacklist(app, scanFilters.appBlacklist));
  }

  function applyCachedIconAssetUrls(sourcePages) {
    return options.clonePages(sourcePages).map((page) =>
      page.map(applyCachedIconAssetUrlToItem)
    );
  }

  function applyCachedIconAssetUrlToItem(item) {
    if (!item) return item;
    if (item.type === "app") {
      const iconUrl = item.iconPath ? convertFilePathToAssetUrl(item.iconPath) : null;
      return iconUrl ? { ...item, iconUrl } : item;
    }
    if (item.type !== "folder") return item;
    const childPages = (item.childPages || []).map((page) =>
      (page || []).map(applyCachedIconAssetUrlToItem)
    );
    return {
      ...item,
      childPages,
      children: childPages.flat().filter(Boolean).map(options.cloneItem),
    };
  }

  async function hydrateCachedAppIcons() {
    if (!isNativeBridgeAvailable()) return;
    const requests = options.collectAppsFromPages(options.pages.value)
      .filter((app) => app?.id && app.iconPath && !app.iconDataUrl)
      .map((app) => ({ id: app.id, iconPath: app.iconPath }));
    if (!requests.length) return;
    const batchSize = getIconHydrationBatchSize();
    for (let index = 0; index < requests.length; index += batchSize) {
      const batch = requests.slice(index, index + batchSize);
      try {
        const results = await loadCachedAppIcons(batch);
        const iconDataById = new Map(
          (results || [])
            .filter((item) => item?.id && item.iconDataUrl)
            .map((item) => [item.id, item.iconDataUrl])
        );
        if (!iconDataById.size) continue;
        options.pages.value = applyCachedIconDataUrls(options.pages.value, iconDataById);
        options.schedulePageGridMetrics();
      } catch (error) {
        console.error("Failed to load cached LaunchPad icons", error);
      }
    }
  }

  function getIconHydrationBatchSize() {
    const pageCapacity = Number(options.gridRows.value) * Number(options.gridCols.value);
    if (!Number.isFinite(pageCapacity) || pageCapacity <= 0) {
      return MIN_ICON_HYDRATION_BATCH_SIZE;
    }
    return clamp(
      Math.floor(pageCapacity),
      MIN_ICON_HYDRATION_BATCH_SIZE,
      MAX_ICON_HYDRATION_BATCH_SIZE
    );
  }

  function applyCachedIconDataUrls(sourcePages, iconDataById) {
    return options.clonePages(sourcePages).map((page) =>
      page.map((item) => applyCachedIconDataUrlToItem(item, iconDataById))
    );
  }

  function applyCachedIconDataUrlToItem(item, iconDataById) {
    if (!item) return item;
    if (item.type === "app") {
      const iconDataUrl = iconDataById.get(item.id);
      return iconDataUrl ? { ...item, iconDataUrl } : item;
    }
    if (item.type !== "folder") return item;
    const childPages = (item.childPages || []).map((page) =>
      (page || []).map((child) => applyCachedIconDataUrlToItem(child, iconDataById))
    );
    return {
      ...item,
      childPages,
      children: childPages.flat().filter(Boolean).map(options.cloneItem),
    };
  }

  function scheduleLaunchTargetStatusCheck() {
    const requestId = (launchTargetStatusCheckRequestId += 1);
    if (!options.showMissingLaunchTargetBadge.value || !isNativeBridgeAvailable()) {
      options.launchTargetStatusById.value = {};
      return;
    }
    window.setTimeout(() => checkCurrentLaunchTargets(requestId), 0);
  }

  async function checkCurrentLaunchTargets(requestId) {
    if (requestId !== launchTargetStatusCheckRequestId) return;
    if (!options.showMissingLaunchTargetBadge.value || !isNativeBridgeAvailable()) return;
    const apps = options.collectAppsFromPages(options.pages.value)
      .filter((app) => app?.id && app.launchTarget)
      .map((app) => ({ id: app.id, launchTarget: app.launchTarget }));
    if (!apps.length) {
      if (requestId !== launchTargetStatusCheckRequestId) return;
      options.launchTargetStatusById.value = {};
      return;
    }
    try {
      const results = await checkLaunchTargets(apps);
      if (requestId !== launchTargetStatusCheckRequestId || !options.showMissingLaunchTargetBadge.value) return;
      options.launchTargetStatusById.value = Object.fromEntries(
        (results || []).map((result) => [result.id, result.status])
      );
    } catch (error) {
      console.error("Failed to check LaunchPad app paths", error);
    }
  }

  async function launchNativeAppIfAvailable(app) {
    if (!shouldUseNativeCatalog()) return;
    try {
      await launchNativeApp(app.id);
    } catch (error) {
      console.error(`Failed to launch ${app.name}`, error);
    }
  }

  function setNativeWindowEffectsEnabled(enabled) {
    if (!isNativeBridgeAvailable()) return;
    const openSequence = enabled ? null : nativeWindowOpenSequence;
    nativeWindowEffectsUpdate = nativeWindowEffectsUpdate
      .catch(() => {})
      .then(() => setMainWindowEffectsEnabled(enabled, openSequence))
      .catch((error) => {
        console.error("Failed to update LaunchPad window effects", error);
      });
  }

  function registerNativeEventListeners() {
    if (!isNativeBridgeAvailable()) return Promise.resolve();
    return Promise.all([
      listenNativeEvent("launchpad-open-desktop", openDesktopFromNativeShortcut)
        .then((unlisten) => {
          unlistenOpenDesktopEvent = unlisten;
        })
        .catch((error) => {
          console.error("Failed to listen for native desktop open event", error);
        }),
      listenNativeEvent("launchpad-toggle-desktop", toggleDesktopFromNativeShortcut)
        .then((unlisten) => {
          unlistenToggleDesktopEvent = unlisten;
        })
        .catch((error) => {
          console.error("Failed to listen for native desktop toggle event", error);
        }),
      listenNativeEvent("launchpad-close-desktop", closeDesktopFromNativeWindow)
        .then((unlisten) => {
          unlistenCloseDesktopEvent = unlisten;
        })
        .catch((error) => {
          console.error("Failed to listen for native desktop close event", error);
        }),
      listenNativeEvent("launchpad-open-settings", options.openSettingsPanel)
        .then((unlisten) => {
          unlistenSettingsEvent = unlisten;
        })
        .catch((error) => {
          console.error("Failed to listen for native settings event", error);
        }),
      listenNativeEvent("launchpad-layout-recovered", options.handleLayoutRecovered)
        .then((unlisten) => {
          unlistenLayoutRecoveredEvent = unlisten;
        })
        .catch((error) => {
          console.error("Failed to listen for layout recovery event", error);
        }),
    ]);
  }

  function clearNativeEventListeners() {
    clearNativeWindowHideTimer();
    unlistenOpenDesktopEvent?.();
    unlistenOpenDesktopEvent = null;
    unlistenToggleDesktopEvent?.();
    unlistenToggleDesktopEvent = null;
    unlistenCloseDesktopEvent?.();
    unlistenCloseDesktopEvent = null;
    unlistenSettingsEvent?.();
    unlistenSettingsEvent = null;
    unlistenLayoutRecoveredEvent?.();
    unlistenLayoutRecoveredEvent = null;
  }

  function rememberNativeWindowOpenSequence(event) {
    const nextSequence = Number(event?.payload);
    if (Number.isFinite(nextSequence) && nextSequence > 0) {
      nativeWindowOpenSequence = nextSequence;
    }
  }

  function openDesktopFromNativeShortcut(event) {
    rememberNativeWindowOpenSequence(event);
    clearNativeWindowHideTimer();
    if (options.isDesktopOpen.value) {
      options.focusDesktopSurface?.();
      return;
    }
    options.openDesktop();
  }

  function hideNativeWindowAfterCloseAnimation() {
    clearNativeWindowHideTimer();
    nativeWindowHideTimer = window.setTimeout(async () => {
      nativeWindowHideTimer = null;
      hideNativeWindow();
    }, DESKTOP_CLOSE_DURATION);
  }

  async function hideNativeWindow() {
    if (!isNativeBridgeAvailable()) return;
    clearNativeWindowHideTimer();
    try {
      await hideMainWindow();
    } catch (error) {
      console.error("Failed to hide LaunchPad window", error);
    }
  }

  function toggleDesktopFromNativeShortcut(event) {
    rememberNativeWindowOpenSequence(event);
    if (options.isDesktopOpen.value) {
      options.closeDesktop({ clearSearch: false });
      hideNativeWindowAfterCloseAnimation();
    } else {
      openDesktopFromNativeShortcut();
    }
  }

  function closeDesktopFromNativeWindow() {
    if (options.isDesktopOpen.value) {
      options.closeDesktop({ clearSearch: false });
    }
    hideNativeWindowAfterCloseAnimation();
  }

  return {
    clearNativeEventListeners,
    clearNativeSaveTimer,
    hideNativeWindow,
    hideNativeWindowAfterCloseAnimation,
    loadNativeLaunchpadData,
    launchNativeAppIfAvailable,
    registerNativeEventListeners,
    scheduleNativeLayoutSave,
    scheduleLaunchTargetStatusCheck,
    setNativeWindowEffectsEnabled,
    shouldUseNativeCatalog,
  };
}
