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
  const searchQuery = ref(overrides.searchQuery || "");
  const calls = {
    cancelActiveDrag: 0,
    clearBatchSelection: 0,
    closeDesktop: 0,
    closeTopmostModal: 0,
    openFocusedIcon: 0,
    turnCurrentPage: [],
  };
  const keyboard = useLaunchpadKeyboard({
    cancelAltEditMode: () => {},
    cancelActiveDrag: () => {
      calls.cancelActiveDrag += 1;
      return overrides.cancelDrag !== false;
    },
    clearBatchSelection: () => { calls.clearBatchSelection += 1; },
    clearSearch: () => {},
    clearFocusedIcon: () => {},
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
    isBatchSelectionActive: () => Boolean(overrides.batch),
    isDragActive: () => Boolean(overrides.dragActive),
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(false),
    isFolderZoomFadeClosing: ref(false),
    isModalOpen: () => Boolean(overrides.hasModal),
    isSearchMode: ref(false),
    keyboardFocusArea: ref("desktop"),
    moveFocusByArrow: () => {},
    openDesktop: () => {},
    openFocusedIcon: () => { calls.openFocusedIcon += 1; },
    schedulePageGridMetrics: () => {},
    searchInputRef: ref(null),
    searchQuery,
    focusFirstIconInCurrentScope: () => {},
    focusedIcon: ref(null),
    focusMatchesScope: () => true,
    startFolderZoomFadeClose: () => true,
    turnCurrentPage: (direction, options) => calls.turnCurrentPage.push({ direction, options }),
  });
  return { calls, keyboard, searchQuery };
}

export function runLaunchpadKeyboardTests() {
  const dragging = createKeyboard({ batch: true, dragActive: true });
  const dragEscape = makeKeyEvent("Escape");
  dragging.keyboard.handleGlobalKeydown(dragEscape);
  assert(
    dragging.calls.cancelActiveDrag === 1 &&
      dragging.calls.clearBatchSelection === 0 &&
      dragging.calls.closeDesktop === 0,
    "Escape should cancel the active batch drag without exiting batch selection"
  );
  assert(dragEscape.preventDefaultCalled === 1, "a handled drag cancellation should consume Escape");

  const batch = createKeyboard({ batch: true });
  batch.keyboard.handleGlobalKeydown(makeKeyEvent("Escape"));
  assert(batch.calls.clearBatchSelection === 1, "Escape without an active drag should still exit batch selection");

  const batchSearch = createKeyboard({ batch: true });
  const batchPrintable = makeKeyEvent("q");
  batchSearch.keyboard.handleGlobalKeydown(batchPrintable);
  assert(
    batchSearch.searchQuery.value === "" && batchPrintable.preventDefaultCalled === 1,
    "printable keys should be consumed without entering desktop search while batch selection is active"
  );
  const focusedBatchSearch = createKeyboard({ batch: true });
  const focusedBatchPrintable = makeKeyEvent("q", { target: { tagName: "INPUT" } });
  focusedBatchSearch.keyboard.handleGlobalKeydown(focusedBatchPrintable);
  assert(
    focusedBatchPrintable.preventDefaultCalled === 1 && focusedBatchSearch.searchQuery.value === "",
    "batch selection should block native text entry even if the old search input still owns focus"
  );
  const batchBackspace = createKeyboard({ batch: true, searchQuery: "keep" });
  batchBackspace.keyboard.handleGlobalKeydown(makeKeyEvent("Backspace"));
  assert(
    batchBackspace.searchQuery.value === "keep",
    "Backspace should not mutate an existing desktop search while batch selection is active"
  );

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
  assert(activation.calls.openFocusedIcon === 1, "Enter should activate the selected icon");
}
