import { ref } from "vue";
import { useLaunchpadKeyboard } from "./useLaunchpadKeyboard.js";

function assert(condition, message) {
  if (!condition) throw new Error(`[Launchpad keyboard test failed] ${message}`);
}

function makeKeyEvent(key, overrides = {}) {
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
    ...overrides,
  };
}

function createKeyboard(overrides = {}) {
  const calls = { closeDesktop: 0, closeTopmostModal: 0, openSelectedIcon: 0, turnCurrentPage: [] };
  const keyboard = useLaunchpadKeyboard({
    cancelAltEditMode: () => {},
    clearSearch: () => {},
    clearSelectedIcon: () => {},
    closeDesktop: () => { calls.closeDesktop += 1; },
    closeTopmostModal: () => {
      calls.closeTopmostModal += 1;
      return Boolean(overrides.hasModal);
    },
    commitOpenFolder: () => {},
    commitSearchPageIndex: () => {},
    focusDesktopSurface: () => {},
    folderPanelRef: ref(null),
    getCurrentIconScope: () => ({ items: [] }),
    handleAltKeyDown: () => {},
    hasFolderInteractionLayer: () => Boolean(overrides.hasFolder),
    hideNativeWindowAfterCloseAnimation: () => {},
    isAltKeyEvent: () => false,
    isAppLaunching: ref(false),
    isDesktopClosing: ref(false),
    isDesktopOpen: ref(true),
    isDragActive: () => false,
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(false),
    isFolderZoomFadeClosing: ref(false),
    isModalOpen: () => Boolean(overrides.hasModal),
    isSearchMode: ref(false),
    keyboardFocusArea: ref("desktop"),
    moveSelectionByArrow: () => {},
    openDesktop: () => {},
    openSelectedIcon: () => { calls.openSelectedIcon += 1; },
    schedulePageGridMetrics: () => {},
    searchInputRef: ref(null),
    searchQuery: ref(""),
    selectFirstIconInCurrentScope: () => {},
    selectedIcon: ref(null),
    selectionMatchesScope: () => true,
    startFolderZoomFadeClose: () => true,
    turnCurrentPage: (direction, options) => calls.turnCurrentPage.push({ direction, options }),
  });
  return { calls, keyboard };
}

export function runLaunchpadKeyboardTests() {
  const modal = createKeyboard({ hasModal: true });
  const modalEscape = makeKeyEvent("Escape");
  modal.keyboard.handleGlobalKeydown(modalEscape);
  assert(modal.calls.closeTopmostModal === 1 && modal.calls.closeDesktop === 0, "Escape should close the topmost modal before the desktop");

  const paging = createKeyboard();
  const pageEvent = makeKeyEvent("ArrowRight", { ctrlKey: true });
  paging.keyboard.handleGlobalKeydown(pageEvent);
  assert(pageEvent.preventDefaultCalled === 1, "Ctrl+Arrow should remain a consumed page command");
  assert(paging.calls.turnCurrentPage[0]?.direction === 1, "keyboard paging should delegate to the shared page navigator");
  assert(paging.calls.turnCurrentPage[0]?.options.source === "keyboard", "the shared navigator should receive the input source");

  const activation = createKeyboard();
  const enter = makeKeyEvent("Enter");
  activation.keyboard.handleGlobalKeydown(enter);
  assert(activation.calls.openSelectedIcon === 1, "Enter should activate the selected icon");
}
