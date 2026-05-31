import { ref } from "vue";
import { useLaunchpadKeyboard } from "./useLaunchpadKeyboard.js";

function createKeyboard(overrides = {}) {
  const calls = {
    clearSearch: 0,
    clearSelectedIcon: 0,
    closeDesktop: [],
    closeTopmostModal: 0,
    commitOpenFolder: [],
    hideNativeWindowAfterCloseAnimation: 0,
  };
  const keyboard = useLaunchpadKeyboard({
    clearSearch: () => {
      calls.clearSearch += 1;
    },
    clearSelectedIcon: () => {
      calls.clearSelectedIcon += 1;
    },
    closeDesktop: (options) => calls.closeDesktop.push(options),
    closeTopmostModal: () => {
      calls.closeTopmostModal += 1;
      return Boolean(overrides.hasModal);
    },
    commitFolderPageIndex: () => {},
    commitOpenFolder: (value) => calls.commitOpenFolder.push(value),
    commitPageIndex: () => {},
    commitSearchPageIndex: () => {},
    finishHomeRevealSettleWindow: () => {},
    focusDesktopSurface: () => {},
    folderPageIndex: ref(0),
    folderPages: ref([[]]),
    folderPanelRef: ref(null),
    getCurrentIconScope: () => ({ items: [] }),
    handleAltKeyDown: () => {},
    hideNativeWindowAfterCloseAnimation: () => {
      calls.hideNativeWindowAfterCloseAnimation += 1;
    },
    isAltKeyEvent: () => false,
    isAppLaunching: ref(false),
    isDesktopClosing: ref(false),
    isDesktopOpen: ref(true),
    isDragActive: () => false,
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(false),
    isHomeRevealSettling: ref(false),
    isSearchMode: ref(Boolean(overrides.isSearchMode)),
    keyboardFocusArea: ref("desktop"),
    moveSelectionByArrow: () => {},
    openDesktop: () => {},
    openFolderId: ref(overrides.openFolderId || null),
    openSelectedIcon: () => {},
    pageIndex: ref(0),
    pages: ref([[]]),
    renderedFolder: ref(overrides.renderedFolder || null),
    schedulePageGridMetrics: () => {},
    searchInputRef: ref(null),
    searchPageIndex: ref(0),
    searchPages: ref([[]]),
    searchQuery: ref(""),
    selectFirstIconInCurrentScope: () => {},
    selectedIcon: ref(null),
    selectionMatchesScope: () => true,
  });

  return { calls, keyboard };
}

function makeKeyEvent(key) {
  return {
    altKey: false,
    code: "",
    ctrlKey: false,
    key,
    metaKey: false,
    preventDefaultCalled: 0,
    target: null,
    preventDefault() {
      this.preventDefaultCalled += 1;
    },
  };
}

export function runLaunchpadKeyboardTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad keyboard test failed] ${message}`);
  };

  const modal = createKeyboard({ hasModal: true, isSearchMode: true });
  const modalEscape = makeKeyEvent("Escape");
  modal.keyboard.handleGlobalKeydown(modalEscape);
  assert(modalEscape.preventDefaultCalled === 1, "Escape should prevent default when closing a modal");
  assert(modal.calls.closeTopmostModal === 1, "Escape should ask the modal layer to close first");
  assert(modal.calls.clearSearch === 0, "modal Escape should not clear search behind the modal");
  assert(modal.calls.closeDesktop.length === 0, "modal Escape should not close the desktop behind the modal");

  const desktop = createKeyboard();
  const desktopEscape = makeKeyEvent("Escape");
  desktop.keyboard.handleGlobalKeydown(desktopEscape);
  assert(desktop.calls.closeTopmostModal === 1, "Escape should check modal state before desktop actions");
  assert(desktop.calls.closeDesktop.length === 1, "Escape with no modal should fall back to desktop close");
  assert(desktop.calls.hideNativeWindowAfterCloseAnimation === 1, "desktop Escape should still schedule native window hide");
}
