import { ref } from "vue";
import {
  FOLDER_APP_LAUNCH_DURATION,
  FOLDER_CLOSE_DURATION,
  FOLDER_CLOSE_GHOST_FALLBACK_DURATION,
  HOME_REVEAL_SETTLE_DURATION,
} from "./launchpadConstants.js";
import { useLaunchpadFolderFlow } from "./useLaunchpadFolderFlow.js";

const folderApp = { id: "folder-app", type: "app", name: "Folder App" };
const folder = {
  id: "folder-1",
  type: "folder",
  name: "Folder",
  childPages: [[folderApp]],
};

function createTimerWindow() {
  let nextId = 1;
  const timers = new Map();

  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    runDelay(delay) {
      const matchingTimers = Array.from(timers.entries()).filter(([, timer]) => timer.delay === delay);
      for (const [id, timer] of matchingTimers) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
  };
}

function cloneItem(item) {
  return {
    ...item,
    childPages: item.childPages?.map((page) => page.map((child) => ({ ...child }))),
  };
}

function findFolder(sourcePages, folderId) {
  for (let pageIndex = 0; pageIndex < sourcePages.length; pageIndex += 1) {
    const index = sourcePages[pageIndex].findIndex((item) => item?.type === "folder" && item.id === folderId);
    if (index >= 0) return { pageIndex, index, item: sourcePages[pageIndex][index] };
  }
  return null;
}

function createFolderFlow(overrides = {}) {
  const calls = {
    clearFolderPageTurn: 0,
    setFolderMotionGeometry: [],
  };
  const pages = ref(overrides.pages ?? [[folder]]);
  const folderPageIndex = ref(overrides.folderPageIndex ?? 1);
  const folderPageRefs = [{ id: "folder-page" }];
  const pageRefs = [{ id: "page" }];
  let folderMotionGeometry = overrides.folderMotionGeometry ?? { id: null, x: 0 };

  const flow = useLaunchpadFolderFlow({
    clearFolderPageTurn: () => {
      calls.clearFolderPageTurn += 1;
    },
    cloneItem,
    findFolder,
    folderPageIndex,
    folderPageRefs,
    folderPageSize: ref(overrides.folderPageSize ?? 2),
    getFolderIconMotionGeometry: (folderId) => ({ id: folderId, source: "icon" }),
    getFolderMotionGeometry: () => folderMotionGeometry,
    getVisibleFolderPages: (currentFolder, pageSize, minPageCount) => {
      const visiblePages = (currentFolder.childPages || []).slice();
      while (visiblePages.length < minPageCount) visiblePages.push([]);
      return visiblePages;
    },
    isDragActive: () => Boolean(overrides.isDragActive),
    pageRefs,
    pages,
    setFolderMotionGeometry: (next) => {
      folderMotionGeometry = next;
      calls.setFolderMotionGeometry.push(next);
    },
  });

  return {
    calls,
    flow,
    folderPageIndex,
    folderPageRefs,
    get folderMotionGeometry() {
      return folderMotionGeometry;
    },
    pageRefs,
    pages,
  };
}

export function runLaunchpadFolderFlowTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad folder flow test failed] ${message}`);
  };
  const originalWindow = globalThis.window;
  const timers = createTimerWindow();
  globalThis.window = timers;

  try {
    const open = createFolderFlow({ folderPageIndex: 2 });
    open.flow.startHomeRevealSettleWindow();
    open.flow.commitOpenFolder("folder-1", { originGeometry: { id: "origin", x: 18 } });
    assert(open.flow.openFolderId.value === "folder-1", "opening should store the open folder id");
    assert(open.flow.renderedFolderId.value === "folder-1", "opening should store the rendered folder id");
    assert(open.flow.renderedFolder.value.id === "folder-1", "opening should expose the rendered folder");
    assert(open.flow.isFolderLayerActive.value, "opening should activate the folder layer");
    assert(open.flow.desktopProjectionEpoch.value === 1, "opening should finish any pending home reveal settle window");
    assert(!open.flow.isHomeRevealSettling.value, "opening should clear home reveal settle state");
    assert(open.pageRefs.length === 0, "finishing home reveal settle should clear page refs");
    assert(open.folderPageIndex.value === 0, "opening a different folder should reset folder page index");
    assert(open.folderMotionGeometry.id === "folder-1" && open.folderMotionGeometry.x === 18, "opening should set origin geometry with the folder id");

    open.folderPageIndex.value = 2;
    open.flow.commitOpenFolder("folder-1");
    assert(open.folderPageIndex.value === 2, "reopening the same folder should preserve folder page index");

    const close = createFolderFlow();
    close.flow.commitOpenFolder("folder-1");
    close.folderPageIndex.value = 2;
    close.folderPageRefs.push({ id: "extra-folder-page" });
    close.flow.commitOpenFolder(null);
    assert(close.flow.openFolderId.value === null, "closing should clear the open folder id immediately");
    assert(close.flow.isFolderClosing.value, "closing should enter folder closing state immediately");
    assert(close.flow.isHomeRevealSettling.value, "closing should start home reveal settle state");
    assert(close.calls.clearFolderPageTurn === 1, "closing should clear folder page turn timers");
    timers.runDelay(FOLDER_CLOSE_DURATION);
    assert(!close.flow.isFolderClosing.value, "folder close timer should clear folder closing state");
    assert(close.flow.renderedFolder.value === null, "folder close timer should clear rendered folder");
    assert(close.folderPageIndex.value === 0, "folder close timer should reset folder page index");
    assert(close.folderPageRefs.length === 0, "folder close timer should clear folder page refs");
    timers.runDelay(HOME_REVEAL_SETTLE_DURATION);
    assert(!close.flow.isHomeRevealSettling.value, "home reveal timer should finish settle state");
    assert(close.flow.desktopProjectionEpoch.value === 1, "home reveal timer should advance projection epoch");

    const closeWithGhosts = createFolderFlow();
    closeWithGhosts.flow.commitOpenFolder("folder-1");
    closeWithGhosts.folderPageIndex.value = 2;
    closeWithGhosts.folderPageRefs.push({ id: "extra-folder-page" });
    closeWithGhosts.flow.commitOpenFolder(null, { waitForCloseGhosts: true });
    timers.runDelay(FOLDER_CLOSE_DURATION);
    assert(closeWithGhosts.flow.isFolderClosing.value, "ghost handoff close should not finish on the DOM close duration");
    assert(closeWithGhosts.flow.renderedFolder.value?.id === "folder-1", "ghost handoff close should keep the rendered folder until handoff completion");
    closeWithGhosts.flow.finishFolderClose();
    assert(!closeWithGhosts.flow.isFolderClosing.value, "ghost handoff completion should clear folder closing state");
    assert(closeWithGhosts.flow.renderedFolder.value === null, "ghost handoff completion should clear rendered folder");

    const closeWithGhostFallback = createFolderFlow();
    closeWithGhostFallback.flow.commitOpenFolder("folder-1");
    closeWithGhostFallback.flow.commitOpenFolder(null, { waitForCloseGhosts: true });
    timers.runDelay(FOLDER_CLOSE_GHOST_FALLBACK_DURATION);
    assert(!closeWithGhostFallback.flow.isFolderClosing.value, "ghost handoff fallback should clear folder closing state");

    const launchClose = createFolderFlow();
    launchClose.flow.commitOpenFolder("folder-1");
    launchClose.folderPageIndex.value = 1;
    launchClose.folderPageRefs.push({ id: "extra-folder-page" });
    launchClose.flow.startFolderAppLaunchClose();
    assert(launchClose.flow.openFolderId.value === null, "app launch close should clear open folder id immediately");
    assert(launchClose.flow.isFolderAppLaunchClosing.value, "app launch close should enter launch closing state");
    assert(!launchClose.flow.isFolderClosing.value, "app launch close should not use normal folder closing state");
    assert(launchClose.flow.folderClosingSnapshot.value.id === "folder-1", "app launch close should keep a closing snapshot");
    assert(launchClose.flow.folderClosingSnapshot.value !== folder, "app launch close snapshot should be cloned");
    timers.runDelay(FOLDER_APP_LAUNCH_DURATION);
    assert(!launchClose.flow.isFolderAppLaunchClosing.value, "app launch close timer should clear launch closing state");
    assert(launchClose.flow.renderedFolder.value === null, "app launch close timer should clear rendered folder");
    assert(launchClose.folderPageIndex.value === 0, "app launch close timer should reset folder page index");
    assert(launchClose.folderPageRefs.length === 0, "app launch close timer should clear folder page refs");

    const dragActive = createFolderFlow({ isDragActive: true });
    dragActive.flow.commitOpenFolder("folder-1");
    dragActive.folderPageIndex.value = 2;
    assert(dragActive.flow.folderPages.value.length === 3, "drag-active folder pages should include the current drag target page");
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}
