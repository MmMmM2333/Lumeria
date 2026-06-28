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
    requestFolderPageTurn: [],
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
    visualFolderPageIndex: ref(overrides.visualFolderPageIndex ?? overrides.folderPageIndex ?? 0),
  };
  let nextFolderPageTurnToken = 1;
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
    requestFolderPageTurn: (index, options) => {
      const token = nextFolderPageTurnToken;
      nextFolderPageTurnToken += 1;
      calls.requestFolderPageTurn.push({ index, options, token });
      state.visualFolderPageIndex.value = index;
      return token;
    },
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
    visualFolderPageIndex: state.visualFolderPageIndex,
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
  assert(openingWheelEvent.preventDefaultCalled === 1, "opening/open folder wheel should consume a valid folder page request");
  assert(openingFolderWheel.calls.requestFolderPageTurn.length === 1, "opening/open folder wheel should request a folder page turn");
  assert(openingFolderWheel.calls.requestFolderPageTurn[0].index === 1, "opening/open folder wheel should request the next folder page");
  assert(openingFolderWheel.calls.requestFolderPageTurn[0].options.source === "wheel", "opening/open folder wheel should mark wheel as the request source");
  assert(openingFolderWheel.calls.requestFolderPageTurn[0].options.phase === "open", "opening/open folder wheel should carry the active folder phase");
  assert(openingFolderWheel.calls.commitFolderPageIndex.length === 0, "opening/open folder wheel should not directly commit the folder page");
  assert(openingFolderWheel.calls.commitPageIndex.length === 0, "opening-folder wheel should not turn the desktop page");

  const keyboardFolderTurn = createKeyboard({
    folderPageIndex: 0,
    folderPages: [[{ id: "app-a" }], [{ id: "app-b" }]],
    openFolderId: "folder-1",
    renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
  });
  const folderArrowEvent = makeKeyEvent("ArrowRight");
  folderArrowEvent.ctrlKey = true;
  keyboardFolderTurn.keyboard.handleGlobalKeydown(folderArrowEvent);
  assert(folderArrowEvent.preventDefaultCalled === 1, "Ctrl+ArrowRight should prevent default for a valid folder page request");
  assert(keyboardFolderTurn.calls.requestFolderPageTurn.length === 1, "Ctrl+ArrowRight should request a folder page turn while the folder is active");
  assert(keyboardFolderTurn.calls.requestFolderPageTurn[0].index === 1, "Ctrl+ArrowRight should request the next folder page");
  assert(keyboardFolderTurn.calls.requestFolderPageTurn[0].options.source === "keyboard", "Ctrl+ArrowRight should mark keyboard as the request source");
  assert(keyboardFolderTurn.calls.commitFolderPageIndex.length === 0, "Ctrl+ArrowRight should not directly commit the folder page");

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
  assert(closingWheelEvent.preventDefaultCalled === 1, "closing-folder wheel should consume a valid desktop turn");
  assert(closingFolderWheel.calls.requestFolderPageTurn.length === 0, "closing-folder wheel should not request a folder page turn");
  assert(closingFolderWheel.calls.commitFolderPageIndex.length === 0, "closing-folder wheel should not change the folder page");
  assert(closingFolderWheel.calls.commitPageIndex.join(",") === "1", "closing-folder wheel should commit the desktop page immediately");
  assert(closingFolderWheel.state.folderPageIndex.value === 0, "closing-folder desktop turn should leave the folder page unchanged");

  const onePageFolderWheel = createKeyboard({
    folderPageIndex: 0,
    folderPages: [[{ id: "app-a" }]],
    openFolderId: "folder-1",
    renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
  });
  const onePageWheelEvent = makeWheelEvent();
  onePageFolderWheel.keyboard.handleLaunchpadWheel(onePageWheelEvent);
  assert(onePageWheelEvent.preventDefaultCalled === 0, "single-page folder wheel should not consume the event");
  assert(onePageFolderWheel.calls.requestFolderPageTurn.length === 0, "single-page folder wheel should not create an invalid request");

  const firstPageFolderWheel = createKeyboard({
    folderPageIndex: 0,
    folderPages: [[{ id: "app-a" }], [{ id: "app-b" }]],
    openFolderId: "folder-1",
    renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
  });
  const firstPageWheelEvent = makeWheelEvent(-120);
  firstPageFolderWheel.keyboard.handleLaunchpadWheel(firstPageWheelEvent);
  assert(firstPageWheelEvent.preventDefaultCalled === 0, "first folder page previous wheel should not consume the event");
  assert(firstPageFolderWheel.calls.requestFolderPageTurn.length === 0, "first folder page previous wheel should not create an invalid request");

  const lastPageFolderWheel = createKeyboard({
    folderPageIndex: 1,
    folderPages: [[{ id: "app-a" }], [{ id: "app-b" }]],
    openFolderId: "folder-1",
    renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
  });
  const lastPageWheelEvent = makeWheelEvent();
  lastPageFolderWheel.keyboard.handleLaunchpadWheel(lastPageWheelEvent);
  assert(lastPageWheelEvent.preventDefaultCalled === 0, "last folder page next wheel should not consume the event");
  assert(lastPageFolderWheel.calls.requestFolderPageTurn.length === 0, "last folder page next wheel should not create an invalid request");

  const pendingVisualLastPageWheel = createKeyboard({
    folderPageIndex: 0,
    folderPages: [[{ id: "app-a" }], [{ id: "app-b" }]],
    openFolderId: "folder-1",
    renderedFolder: { id: "folder-1", type: "folder", name: "Folder" },
    visualFolderPageIndex: 1,
  });
  const pendingVisualLastPageWheelEvent = makeWheelEvent();
  pendingVisualLastPageWheel.keyboard.handleLaunchpadWheel(pendingVisualLastPageWheelEvent);
  assert(pendingVisualLastPageWheelEvent.preventDefaultCalled === 0, "pending visual last page next wheel should not consume the event");
  assert(pendingVisualLastPageWheel.calls.requestFolderPageTurn.length === 0, "pending visual last page next wheel should not create an invalid request from committed index");

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
