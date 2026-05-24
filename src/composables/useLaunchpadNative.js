import {
  DESKTOP_CLOSE_DURATION,
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { clamp } from "../domain/launchpadLayout.js";
import { normalizeNativeApp } from "../domain/launchpadData.js";
import {
  hideMainWindow,
  isNativeBridgeAvailable,
  launchApp as launchNativeApp,
  listenNativeEvent,
  loadLayout,
  saveLayout,
  scanApps,
  setMainWindowEffectsEnabled,
} from "../api/launchpadApi.js";

const USE_MOCK_DATA_IN_NATIVE = false;
const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";

export function useLaunchpadNative(options) {
  let nativeLayoutReady = false;
  let nativeWindowEffectsUpdate = Promise.resolve();
  let nativeSaveTimer = null;
  let nativeWindowHideTimer = null;
  let nativeWindowOpenSequence = null;
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
    setNativeWindowEffectsEnabled,
    shouldUseNativeCatalog,
  };
}
