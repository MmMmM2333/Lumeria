import { ref } from "vue";
import { useLaunchpadKeyboard } from "./useLaunchpadKeyboard.js";

function createKeyboard(overrides = {}) {
  const calls = {
    clearSearch: 0,
    clearSelectedIcon: 0,
    closeDesktop: [],
    closeTopmostModal: 0,
    commitFolderPageIndex: [],
    commitPageIndex: [],
    commitOpenFolder: [],
    startFolderZoomFadeClose: [],
    focusDesktopSurface: 0,
    hideNativeWindowAfterCloseAnimation: 0,
    moveSelectionByArrow: [],
    openSelectedIcon: 0,
  };
  const state = {
    folderPageIndex: ref(overrides.folderPageIndex ?? 0),
    folderPages: ref(overrides.folderPages ?? [[]]),
    isFolderClosing: ref(Boolean(overrides.isFolderClosing)),
    isFolderZoomFadeClosing: ref(false),
    openFolderId: ref(overrides.openFolderId || null),
    pageIndex: ref(overrides.pageIndex ?? 0),
    pages: ref(overrides.pages ?? [[]]),
    renderedFolder: ref(overrides.renderedFolder || null),
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
    commitFolderPageIndex: (index) => calls.commitFolderPageIndex.push(index),
    commitOpenFolder: (value) => calls.commitOpenFolder.push(value),
    commitPageIndex: (index) => calls.commitPageIndex.push(index),
    commitSearchPageIndex: () => {},
    finishHomeRevealSettleWindow: () => {},
    focusDesktopSurface: () => {
      calls.focusDesktopSurface += 1;
    },
    folderPageIndex: state.folderPageIndex,
    folderPages: state.folderPages,
    folderPanelRef: ref(null),
    getCurrentIconScope: () => ({ items: [] }),
    cancelAltEditMode: () => {},
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
    isFolderClosing: state.isFolderClosing,
    isFolderZoomFadeClosing: state.isFolderZoomFadeClosing,
    isHomeRevealSettling: ref(false),
    isModalOpen: () => Boolean(overrides.hasModal),
    isSearchMode: ref(Boolean(overrides.isSearchMode)),
    keyboardFocusArea: ref("desktop"),
    moveSelectionByArrow: (key) => calls.moveSelectionByArrow.push(key),
    openDesktop: () => {},
    openFolderId: state.openFolderId,
    openSelectedIcon: () => {
      calls.openSelectedIcon += 1;
    },
    pageIndex: state.pageIndex,
    pages: state.pages,
    renderedFolder: state.renderedFolder,
    schedulePageGridMetrics: () => {},
    searchInputRef: ref(null),
    searchPageIndex: ref(0),
    searchPages: ref([[]]),
    searchQuery: ref(""),
    selectFirstIconInCurrentScope: () => {},
    selectedIcon: ref(null),
    selectionMatchesScope: () => true,
    startFolderZoomFadeClose: (options) => {
      calls.startFolderZoomFadeClose.push(options);
      return Boolean(overrides.startFolderZoomFadeCloseResult ?? true);
    },
  });

  return { calls, keyboard, state };
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

function makeWheelEvent(deltaY = 120) {
  return {
    deltaX: 0,
    deltaY,
    preventDefaultCalled: 0,
    preventDefault() {
      this.preventDefaultCalled += 1;
    },
  };
}

function withAnimationFrameQueue(run) {
  const originalWindow = globalThis.window;
  const frames = [];
  globalThis.window = {
    ...(originalWindow || {}),
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
  };
  try {
    run({
      flushOne() {
        const callback = frames.shift();
        if (callback) callback();
      },
      get size() {
        return frames.length;
      },
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
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

  const modalTab = createKeyboard({ hasModal: true });
  const tabEvent = makeKeyEvent("Tab");
  modalTab.keyboard.handleGlobalKeydown(tabEvent);
  assert(tabEvent.preventDefaultCalled === 0, "modal Tab should be left to the dialog focus trap");
  assert(modalTab.calls.focusDesktopSurface === 0, "modal Tab should not move focus to the desktop");

  const modalEnter = createKeyboard({ hasModal: true });
  const enterEvent = makeKeyEvent("Enter");
  modalEnter.keyboard.handleGlobalKeydown(enterEvent);
  assert(enterEvent.preventDefaultCalled === 0, "modal Enter should not be consumed by desktop activation");
  assert(modalEnter.calls.openSelectedIcon === 0, "modal Enter should not open the selected desktop icon");

  const modalArrow = createKeyboard({ hasModal: true });
  const arrowEvent = makeKeyEvent("ArrowDown");
  modalArrow.keyboard.handleGlobalKeydown(arrowEvent);
  assert(arrowEvent.preventDefaultCalled === 0, "modal Arrow keys should not be consumed by desktop navigation");
  assert(modalArrow.calls.moveSelectionByArrow.length === 0, "modal Arrow keys should not move desktop selection");

  const desktop = createKeyboard();
  const desktopEscape = makeKeyEvent("Escape");
  desktop.keyboard.handleGlobalKeydown(desktopEscape);
  assert(desktop.calls.closeTopmostModal === 1, "Escape should check modal state before desktop actions");
  assert(desktop.calls.closeDesktop.length === 1, "Escape with no modal should fall back to desktop close");
  assert(desktop.calls.hideNativeWindowAfterCloseAnimation === 1, "desktop Escape should still schedule native window hide");

  const openingFolderWheel = createKeyboard({
    folderPageIndex: 0,
    folderPages: [[{ id: "app-a" }], [{ id: "app-b" }]],
    openFolderId: "folder-1",
    renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
  });
  const openingWheelEvent = makeWheelEvent();
  openingFolderWheel.keyboard.handleLaunchpadWheel(openingWheelEvent);
  assert(openingWheelEvent.preventDefaultCalled === 1, "opening-folder wheel should currently consume the wheel turn");
  assert(openingFolderWheel.calls.commitFolderPageIndex.join(",") === "1", "opening-folder wheel should currently commit the folder page immediately");
  assert(openingFolderWheel.calls.commitPageIndex.length === 0, "opening-folder wheel should not turn the desktop page");

  withAnimationFrameQueue((raf) => {
    const closingFolderWheel = createKeyboard({
      folderPageIndex: 0,
      folderPages: [[{ id: "app-a" }], [{ id: "app-b" }]],
      isFolderClosing: true,
      pageIndex: 0,
      pages: [[{ id: "folder-1" }], [{ id: "folder-2" }]],
      renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
    });
    const closingWheelEvent = makeWheelEvent();
    closingFolderWheel.keyboard.handleLaunchpadWheel(closingWheelEvent);
    assert(closingWheelEvent.preventDefaultCalled === 1, "closing-folder wheel should currently consume the queued turn");
    assert(closingFolderWheel.calls.commitFolderPageIndex.length === 0, "closing-folder wheel should not change the folder page");
    assert(closingFolderWheel.calls.commitPageIndex.length === 0, "closing-folder wheel should wait for the folder to close before turning desktop");
    assert(closingFolderWheel.state.folderPageIndex.value === 0, "closing-folder queued desktop turn should leave the folder page unchanged");
    assert(raf.size === 1, "closing-folder wheel should queue a desktop turn wait frame");

    raf.flushOne();
    assert(closingFolderWheel.calls.commitPageIndex.length === 0, "queued desktop turn should keep waiting while the folder interaction layer exists");
    assert(raf.size === 1, "queued desktop turn should reschedule while closing remains active");

    closingFolderWheel.state.isFolderClosing.value = false;
    closingFolderWheel.state.renderedFolder.value = null;
    raf.flushOne();
    assert(closingFolderWheel.calls.commitPageIndex.join(",") === "1", "queued desktop turn should commit only after the folder interaction layer disappears");
  });

  const closingFolderEscape = createKeyboard({
    isFolderClosing: true,
    renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
  });
  const closingEscapeEvent = makeKeyEvent("Escape");
  closingFolderEscape.keyboard.handleGlobalKeydown(closingEscapeEvent);
  assert(closingEscapeEvent.preventDefaultCalled === 1, "closing-folder Escape should still prevent default");
  assert(closingFolderEscape.calls.commitOpenFolder.length === 0, "closing-folder Escape should not restart folder close");
  assert(closingFolderEscape.calls.clearSelectedIcon === 0, "closing-folder Escape should not clear selection again");

  const folderAltSpace = createKeyboard({
    openFolderId: "folder-1",
    renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
  });
  const altSpaceEvent = makeKeyEvent(" ");
  altSpaceEvent.altKey = true;
  altSpaceEvent.code = "Space";
  folderAltSpace.keyboard.handleGlobalKeydown(altSpaceEvent);
  assert(altSpaceEvent.preventDefaultCalled === 1, "Alt+Space should prevent default while a folder is open");
  assert(folderAltSpace.calls.startFolderZoomFadeClose.length === 1, "Alt+Space should start the folder zoom-fade close");
  assert(folderAltSpace.calls.startFolderZoomFadeClose[0].reason === "desktop", "Alt+Space should mark zoom-fade as desktop close");
  assert(folderAltSpace.calls.commitOpenFolder.length === 0, "Alt+Space should not use the normal folder close path");
  assert(folderAltSpace.calls.closeDesktop.length === 1, "Alt+Space should close the desktop while the folder zoom-fades");
  assert(folderAltSpace.calls.hideNativeWindowAfterCloseAnimation === 1, "Alt+Space should schedule the native window hide");

  const closingFolderAltSpace = createKeyboard({
    isFolderClosing: true,
    renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
  });
  const closingAltSpaceEvent = makeKeyEvent(" ");
  closingAltSpaceEvent.altKey = true;
  closingAltSpaceEvent.code = "Space";
  closingFolderAltSpace.keyboard.handleGlobalKeydown(closingAltSpaceEvent);
  assert(closingAltSpaceEvent.preventDefaultCalled === 1, "Alt+Space should prevent default while a folder close is in flight");
  assert(closingFolderAltSpace.calls.startFolderZoomFadeClose.length === 1, "Alt+Space should interrupt a folder close with zoom-fade");
  assert(closingFolderAltSpace.calls.startFolderZoomFadeClose[0].reason === "desktop", "interrupted folder close should mark zoom-fade as desktop close");
  assert(closingFolderAltSpace.calls.closeDesktop.length === 1, "interrupted folder close should still close the desktop");
  assert(closingFolderAltSpace.calls.hideNativeWindowAfterCloseAnimation === 1, "interrupted folder close should schedule native window hide");
}
