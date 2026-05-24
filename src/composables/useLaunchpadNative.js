import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { clamp } from "../domain/launchpadLayout.js";
import { normalizeNativeApp } from "../domain/launchpadData.js";
import {
  isNativeBridgeAvailable,
  launchApp as launchNativeApp,
  listenNativeEvent,
  loadLayout,
  saveLayout,
  scanApps,
} from "../api/launchpadApi.js";

const USE_MOCK_DATA_IN_NATIVE = false;

export function useLaunchpadNative(options) {
  let nativeLayoutReady = false;
  let nativeSaveTimer = null;
  let unlistenSettingsEvent = null;
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

    options.gridRows.value = rows;
    options.gridCols.value = cols;
    options.folderRows.value = nextFolderRows;
    options.folderCols.value = nextFolderCols;
    options.iconSize.value = nextIconSize;
    options.draftRows.value = rows;
    options.draftCols.value = cols;
    options.draftFolderRows.value = nextFolderRows;
    options.draftFolderCols.value = nextFolderCols;
    options.draftIconSize.value = nextIconSize;
    options.isTextlessMode.value = Boolean(settings.textless);
    options.hiddenAppIds.value = Array.isArray(settings.hiddenAppIds)
      ? settings.hiddenAppIds.map(String)
      : [];
  }

  function clearNativeSaveTimer() {
    if (nativeSaveTimer) window.clearTimeout(nativeSaveTimer);
    nativeSaveTimer = null;
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
          textless: options.isTextlessMode.value,
          hiddenAppIds: options.hiddenAppIds.value,
        }));
      } catch (error) {
        console.error("Failed to save LaunchPad layout", error);
      }
    }, 320);
  }

  async function loadNativeLaunchpadData() {
    if (!shouldUseNativeCatalog()) return;

    try {
      const [nativeApps, savedLayout] = await Promise.all([scanApps(), loadLayout()]);
      const apps = (nativeApps || []).map(normalizeNativeApp);
      if (!apps.length && !savedLayout) {
        nativeLayoutReady = true;
        return;
      }

      applyLayoutSettings(savedLayout?.settings);
      options.pages.value = options.mergeNativeCatalogWithSavedLayout(
        apps,
        savedLayout,
        options.hiddenAppIds.value
      );
      options.commitPageIndex(options.pageIndex.value);
      options.commitSearchPageIndex(options.searchPageIndex.value);
      options.commitFolderPageIndex(options.folderPageIndex.value);
      nativeLayoutReady = true;
      options.schedulePageGridMetrics();
    } catch (error) {
      nativeLayoutReady = false;
      console.error("Failed to load native LaunchPad data", error);
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

  function registerNativeEventListeners() {
    if (!isNativeBridgeAvailable()) return Promise.resolve();
    return Promise.all([
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
    unlistenSettingsEvent?.();
    unlistenSettingsEvent = null;
    unlistenLayoutRecoveredEvent?.();
    unlistenLayoutRecoveredEvent = null;
  }

  return {
    clearNativeEventListeners,
    clearNativeSaveTimer,
    loadNativeLaunchpadData,
    launchNativeAppIfAvailable,
    registerNativeEventListeners,
    scheduleNativeLayoutSave,
    shouldUseNativeCatalog,
  };
}
