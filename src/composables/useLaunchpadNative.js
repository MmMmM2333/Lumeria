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
  confirmQuitAfterSave,
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
  showLaunchErrorMessage,
} from "../api/launchpadApi.js";

const USE_MOCK_DATA_IN_NATIVE = false;
const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";
const CUSTOM_ICON_HYDRATION_ID_PREFIX = "__custom_icon__:";
const MIN_ICON_HYDRATION_BATCH_SIZE = 20;
const MAX_ICON_HYDRATION_BATCH_SIZE = 80;

export function useLaunchpadNative(options) {
  let nativeLayoutReady = false;
  let nativeWindowEffectsUpdate = Promise.resolve();
  let nativeSaveTimer = null;
  let nativeWindowHideTimer = null;
  let nativeWindowOpenSequence = null;
  let nativeEventListenerGeneration = 0;
  let nativeSavePromise = null;
  let launchCriticalDirtyRevision = 0;
  let launchTargetStatusCheckRequestId = 0;
  let launchTargetStatusRecordsById = {};
  let lastSavedLayoutSignature = "";
  let nativeLoadFailureCount = 0;
  let hadNativeLoadFailure = false;
  let nativeSaveFailureCount = 0;
  let hadNativeSaveFailure = false;
  const launchCriticalDirtyAppIds = new Set();
  let unlistenCloseDesktopEvent = null;
  let unlistenOpenDesktopEvent = null;
  let unlistenSettingsEvent = null;
  let unlistenToggleDesktopEvent = null;
  let unlistenLayoutRecoveredEvent = null;
  let unlistenQuitRequestedEvent = null;
  let quitRequestInProgress = false;

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
    options.draftIsTextlessMode.value = options.isTextlessMode.value;
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

  function createCurrentLayoutSnapshot() {
    return options.createLayoutSnapshot({
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
    });
  }

  function layoutSignature(layout) {
    return JSON.stringify(layout);
  }

  async function saveCurrentNativeLayout() {
    const layout = createCurrentLayoutSnapshot();
    const signature = layoutSignature(layout);
    const saveDirtyRevision = launchCriticalDirtyRevision;
    if (signature === lastSavedLayoutSignature) {
      if (saveDirtyRevision === launchCriticalDirtyRevision) launchCriticalDirtyAppIds.clear();
      return true;
    }

    try {
      await saveLayout(layout);
      lastSavedLayoutSignature = signature;
      if (saveDirtyRevision === launchCriticalDirtyRevision) launchCriticalDirtyAppIds.clear();
      if (hadNativeSaveFailure) options.showLayoutSaveRecovered?.();
      hadNativeSaveFailure = false;
      nativeSaveFailureCount = 0;
      return true;
    } catch (error) {
      hadNativeSaveFailure = true;
      nativeSaveFailureCount += 1;
      options.showLayoutSaveFailed?.({
        error,
        retryCount: nativeSaveFailureCount,
        onRetry: retryNativeLayoutSave,
      });
      console.error("Failed to save LaunchPad layout", error);
      return false;
    }
  }

  function runNativeLayoutSave() {
    if (!nativeSavePromise) {
      nativeSavePromise = saveCurrentNativeLayout()
        .finally(() => {
          nativeSavePromise = null;
        });
    }
    return nativeSavePromise;
  }

  function saveLaunchCriticalLayout() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return true;
    clearNativeSaveTimer();
    return runNativeLayoutSave().then((saved) => {
      if (!saved || !launchCriticalDirtyAppIds.size) return saved;
      return saveLaunchCriticalLayout();
    });
  }

  function markLaunchCriticalLayoutDirty(appId) {
    const id = String(appId || "").trim();
    if (id) launchCriticalDirtyAppIds.add(id);
    launchCriticalDirtyRevision += 1;
    return saveLaunchCriticalLayout();
  }

  function prepareNativeLaunch(app) {
    if (!shouldUseNativeCatalog()) return true;
    const appId = String(app?.id || "").trim();
    if (!appId || !launchCriticalDirtyAppIds.has(appId)) return true;
    return saveLaunchCriticalLayout();
  }

  function retryNativeLayoutSave() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return Promise.resolve(false);
    clearNativeSaveTimer();
    return runNativeLayoutSave();
  }

  function retryNativeLayoutLoad() {
    if (!shouldUseNativeCatalog()) return Promise.resolve();
    return loadNativeLaunchpadData();
  }

  function finishNativeLayoutLoad() {
    nativeLayoutReady = true;
    if (hadNativeLoadFailure) options.showLayoutLoadRecovered?.();
    hadNativeLoadFailure = false;
    nativeLoadFailureCount = 0;
    hydrateCachedAppIcons();
    options.schedulePageGridMetrics();
    scheduleLaunchTargetStatusCheck();
  }

  function scheduleNativeLayoutSave() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return;
    clearNativeSaveTimer();
    nativeSaveTimer = window.setTimeout(async () => {
      nativeSaveTimer = null;
      await runNativeLayoutSave();
    }, 320);
  }

  async function flushNativeLayoutSave() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return true;
    clearNativeSaveTimer();
    let saved = await runNativeLayoutSave();
    if (!saved) return false;
    if (layoutSignature(createCurrentLayoutSnapshot()) === lastSavedLayoutSignature) return true;
    saved = await runNativeLayoutSave();
    return Boolean(saved);
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
        finishNativeLayoutLoad();
        scheduleNativeLayoutSave();
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
      finishNativeLayoutLoad();
    } catch (error) {
      nativeLayoutReady = false;
      hadNativeLoadFailure = true;
      nativeLoadFailureCount += 1;
      options.showLayoutLoadFailed?.({
        error,
        retryCount: nativeLoadFailureCount,
        onRetry: retryNativeLayoutLoad,
      });
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
    if (nativeApps?.warnings?.length) {
      console.warn("LaunchPad scan completed with warnings", nativeApps.warnings);
    }
    const now = new Date().toISOString();
    const scannedRootIds = new Set(enabledRoots.map((root) => root.id));
    options.scanRoots.value = options.scanRoots.value.map((root) =>
      scannedRootIds.has(root.id) ? { ...root, lastScannedAt: now } : root
    );
    return (nativeApps?.apps || [])
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
      const customIconUrl = item.customIconPath ? convertFilePathToAssetUrl(item.customIconPath) : null;
      if (iconUrl || customIconUrl) return { ...item, iconUrl, customIconUrl };
      return item;
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
    const requests = collectIconHydrationRequests();
    if (!requests.length) return;
    const batchSize = getIconHydrationBatchSize();
    for (let index = 0; index < requests.length; index += batchSize) {
      const batch = requests.slice(index, index + batchSize);
      try {
        const results = await loadCachedAppIcons(batch.map((item) => ({ id: item.id, iconPath: item.iconPath })));
        const requestById = new Map(batch.map((item) => [item.id, item]));
        const iconDataById = collectHydratedIconDataByAppId(results, requestById);
        if (!iconDataById.size) continue;
        options.pages.value = applyCachedIconDataUrls(options.pages.value, iconDataById);
        options.schedulePageGridMetrics();
      } catch (error) {
        console.error("Failed to load cached LaunchPad icons", error);
      }
    }
  }

  function collectIconHydrationRequests() {
    const requests = [];
    for (const app of options.collectAppsFromPages(options.pages.value)) {
      if (!app?.id) continue;
      if (app.iconPath && !app.iconDataUrl) {
        requests.push({
          appId: app.id,
          id: app.id,
          iconPath: app.iconPath,
          kind: "catalog",
        });
      }
      if (app.customIconPath && !app.customIconDataUrl) {
        requests.push({
          appId: app.id,
          id: `${CUSTOM_ICON_HYDRATION_ID_PREFIX}${app.id}`,
          iconPath: app.customIconPath,
          kind: "custom",
        });
      }
    }
    return requests;
  }

  function collectHydratedIconDataByAppId(results, requestById) {
    const iconDataById = new Map();
    for (const item of results || []) {
      if (!item?.id || !item.iconDataUrl) continue;
      const request = requestById.get(item.id);
      if (!request) continue;
      let record = iconDataById.get(request.appId);
      if (!record) {
        record = {};
        iconDataById.set(request.appId, record);
      }
      record[request.kind] = {
        iconDataUrl: item.iconDataUrl,
        iconPath: request.iconPath,
      };
    }
    return iconDataById;
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
      const iconData = iconDataById.get(item.id);
      if (!iconData) return item;
      const next = { ...item };
      if (iconData.catalog?.iconDataUrl && iconData.catalog.iconPath === item.iconPath) {
        next.iconDataUrl = iconData.catalog.iconDataUrl;
      }
      if (iconData.custom?.iconDataUrl && iconData.custom.iconPath === item.customIconPath) {
        next.customIconDataUrl = iconData.custom.iconDataUrl;
      }
      return next;
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
      clearLaunchTargetStatuses();
      return;
    }
    pruneLaunchTargetStatusesForCurrentApps();
    window.setTimeout(() => checkCurrentLaunchTargets(requestId), 0);
  }

  async function checkCurrentLaunchTargets(requestId) {
    if (requestId !== launchTargetStatusCheckRequestId) return;
    if (!options.showMissingLaunchTargetBadge.value || !isNativeBridgeAvailable()) return;
    const apps = collectLaunchTargetChecks();
    if (!apps.length) {
      if (requestId !== launchTargetStatusCheckRequestId) return;
      clearLaunchTargetStatuses();
      return;
    }
    const targetSignatureById = new Map(apps.map((app) => [app.id, app.targetSignature]));
    try {
      const results = await checkLaunchTargets(
        apps.map((app) => ({ id: app.id, launchTarget: app.launchTarget }))
      );
      if (requestId !== launchTargetStatusCheckRequestId || !options.showMissingLaunchTargetBadge.value) return;
      const currentSignatureById = new Map(
        collectLaunchTargetChecks().map((app) => [app.id, app.targetSignature])
      );
      launchTargetStatusRecordsById = Object.fromEntries(
        (results || [])
          .map((result) => {
            const id = String(result?.id || "");
            const targetSignature = targetSignatureById.get(id);
            if (!id || !targetSignature || currentSignatureById.get(id) !== targetSignature) return null;
            return [id, { status: result.status, targetSignature }];
          })
          .filter(Boolean)
      );
      pruneLaunchTargetStatusesForCurrentApps();
    } catch (error) {
      console.error("Failed to check LaunchPad app paths", error);
    }
  }

  function collectLaunchTargetChecks() {
    return options.collectAppsFromPages(options.pages.value)
      .filter((app) => app?.id && app.launchTarget)
      .map((app) => ({
        id: String(app.id),
        launchTarget: app.launchTarget,
        targetSignature: launchTargetSignature(app.launchTarget),
      }));
  }

  function launchTargetSignature(launchTarget) {
    return JSON.stringify([
      String(launchTarget?.kind || ""),
      String(launchTarget?.path || "").trim(),
      String(launchTarget?.appUserModelId || "").trim(),
    ]);
  }

  function clearLaunchTargetStatuses() {
    launchTargetStatusRecordsById = {};
    options.launchTargetStatusById.value = {};
  }

  function pruneLaunchTargetStatusesForCurrentApps() {
    const currentSignatureById = new Map(
      collectLaunchTargetChecks().map((app) => [app.id, app.targetSignature])
    );
    const nextRecords = {};
    const nextStatuses = {};
    for (const [id, record] of Object.entries(launchTargetStatusRecordsById)) {
      if (currentSignatureById.get(id) !== record.targetSignature) continue;
      nextRecords[id] = record;
      nextStatuses[id] = record.status;
    }
    launchTargetStatusRecordsById = nextRecords;
    options.launchTargetStatusById.value = nextStatuses;
  }

  function getLaunchTargetStatus(app) {
    const id = String(app?.id || "");
    const record = launchTargetStatusRecordsById[id];
    if (!record || record.targetSignature !== launchTargetSignature(app?.launchTarget)) return null;
    return record.status;
  }

  async function launchNativeAppIfAvailable(app) {
    if (!shouldUseNativeCatalog()) return;
    try {
      await launchNativeApp(app);
      return true;
    } catch (error) {
      console.error(`Failed to launch ${app.name}`, error);
      return normalizeLaunchErrorReport(error, app);
    }
  }

  function normalizeLaunchErrorReport(error, app) {
    const fallbackName = String(app?.name || "此应用").trim() || "此应用";
    if (error && typeof error === "object" && typeof error.message === "string") {
      return {
        kind: String(error.kind || "windowsLaunchFailed"),
        title: String(error.title || "无法打开应用"),
        message: error.message,
        suggestion: String(error.suggestion || "请确认目标程序可以从资源管理器正常打开。"),
        detail: String(error.detail || ""),
      };
    }
    return {
      kind: "windowsLaunchFailed",
      title: "无法打开应用",
      message: `无法打开“${fallbackName}”。\n\nWindows 未能打开此应用。`,
      suggestion: "请确认目标程序可以从资源管理器正常打开。",
      detail: String(error?.message || error || ""),
    };
  }

  async function showNativeLaunchError(error) {
    if (!shouldUseNativeCatalog() || !error) return false;
    try {
      await showLaunchErrorMessage(error);
      return true;
    } catch (showError) {
      console.error("Failed to show LaunchPad launch error", showError);
      return false;
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
    clearNativeEventListeners();
    const generation = nativeEventListenerGeneration;
    const keepUnlisten = (setter) => (unlisten) => {
      if (generation !== nativeEventListenerGeneration) {
        unlisten?.();
        return;
      }
      setter(unlisten);
    };
    return Promise.all([
      listenNativeEvent("launchpad-open-desktop", openDesktopFromNativeShortcut)
        .then(keepUnlisten((unlisten) => {
          unlistenOpenDesktopEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native desktop open event", error);
        }),
      listenNativeEvent("launchpad-toggle-desktop", toggleDesktopFromNativeShortcut)
        .then(keepUnlisten((unlisten) => {
          unlistenToggleDesktopEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native desktop toggle event", error);
        }),
      listenNativeEvent("launchpad-close-desktop", closeDesktopFromNativeWindow)
        .then(keepUnlisten((unlisten) => {
          unlistenCloseDesktopEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native desktop close event", error);
        }),
      listenNativeEvent("launchpad-open-settings", options.openSettingsPanel)
        .then(keepUnlisten((unlisten) => {
          unlistenSettingsEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native settings event", error);
        }),
      listenNativeEvent("launchpad-layout-recovered", options.handleLayoutRecovered)
        .then(keepUnlisten((unlisten) => {
          unlistenLayoutRecoveredEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for layout recovery event", error);
        }),
      listenNativeEvent("launchpad-quit-requested", quitFromNativeRequest)
        .then(keepUnlisten((unlisten) => {
          unlistenQuitRequestedEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native quit event", error);
        }),
    ]);
  }

  function clearNativeEventListeners() {
    nativeEventListenerGeneration += 1;
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
    unlistenQuitRequestedEvent?.();
    unlistenQuitRequestedEvent = null;
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

  async function quitFromNativeRequest() {
    if (quitRequestInProgress) return;
    quitRequestInProgress = true;
    let saved = false;
    try {
      saved = await flushNativeLayoutSave();
    } catch (error) {
      console.error("Failed to save LaunchPad layout before quit", error);
    } finally {
      try {
        await confirmQuitAfterSave(saved);
      } catch (error) {
        console.error("Failed to confirm LaunchPad quit", error);
        quitRequestInProgress = false;
      }
    }
  }

  return {
    clearNativeEventListeners,
    clearNativeSaveTimer,
    flushNativeLayoutSave,
    hideNativeWindow,
    hideNativeWindowAfterCloseAnimation,
    getLaunchTargetStatus,
    loadNativeLaunchpadData,
    launchNativeAppIfAvailable,
    markLaunchCriticalLayoutDirty,
    prepareNativeLaunch,
    registerNativeEventListeners,
    scheduleNativeLayoutSave,
    scheduleLaunchTargetStatusCheck,
    setNativeWindowEffectsEnabled,
    showNativeLaunchError,
    shouldUseNativeCatalog,
  };
}
