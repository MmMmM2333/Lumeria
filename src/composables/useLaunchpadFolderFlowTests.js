import { ref } from "vue";
import {
  FOLDER_APP_LAUNCH_DURATION,
  FOLDER_CLOSE_DURATION,
  FOLDER_CLOSE_GHOST_FALLBACK_DURATION,
  FOLDER_ZOOM_FADE_CLOSE_DURATION,
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
const secondFolder = {
  id: "folder-2",
  type: "folder",
  name: "Second Folder",
  childPages: [[{ ...folderApp, id: "second-folder-app" }]],
};

function createTimerWindow() {
  let nextId = 1;
  let nextFrameId = 1;
  const timers = new Map();
  const frames = new Map();

  return {
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(callback) {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    },
    runAnimationFrames() {
      const matchingFrames = Array.from(frames.entries());
      for (const [id, callback] of matchingFrames) {
        if (!frames.has(id)) continue;
        frames.delete(id);
        callback();
      }
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
    resetFolderViewportMetrics: 0,
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
    resetFolderViewportMetrics: () => {
      calls.resetFolderViewportMetrics += 1;
    },
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
    assert(open.calls.resetFolderViewportMetrics === 1, "opening a different folder should reset stale folder viewport metrics");

    open.folderPageIndex.value = 2;
    open.flow.commitOpenFolder("folder-1");
    assert(open.folderPageIndex.value === 2, "reopening the same folder should preserve folder page index");
    assert(open.calls.resetFolderViewportMetrics === 1, "reopening the same folder should preserve current folder viewport metrics");

    const switchFolder = createFolderFlow({ pages: [[folder, secondFolder]] });
    switchFolder.flow.commitOpenFolder("folder-1");
    switchFolder.flow.commitOpenFolder("folder-2");
    assert(switchFolder.calls.resetFolderViewportMetrics === 2, "switching folders should reset viewport metrics for the new folder");

    const close = createFolderFlow();
    close.flow.commitOpenFolder("folder-1");
    close.folderPageIndex.value = 2;
    close.folderPageRefs.push({ id: "extra-folder-page" });
    close.flow.commitOpenFolder(null);
    assert(close.flow.openFolderId.value === null, "closing should clear the open folder id immediately");
    assert(close.flow.isFolderClosing.value, "closing should enter folder closing state immediately");
    assert(close.flow.isHomeRevealSettling.value, "closing should start home reveal settle state");
    assert(close.calls.clearFolderPageTurn === 1, "closing should clear folder page turn timers");
    assert(close.calls.resetFolderViewportMetrics === 1, "closing should keep viewport metrics until the close animation finishes");
    timers.runDelay(FOLDER_CLOSE_DURATION);
    assert(!close.flow.isFolderClosing.value, "folder close timer should clear folder closing state");
    assert(close.flow.renderedFolder.value === null, "folder close timer should clear rendered folder");
    assert(close.folderPageIndex.value === 0, "folder close timer should reset folder page index");
    assert(close.folderPageRefs.length === 0, "folder close timer should clear folder page refs");
    assert(close.calls.resetFolderViewportMetrics === 2, "finishing close should clear viewport metrics for the next folder");
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

    const closeAfterFrame = createFolderFlow();
    closeAfterFrame.flow.commitOpenFolder("folder-1");
    closeAfterFrame.flow.commitOpenFolder(null, { waitForCloseGhosts: true });
    closeAfterFrame.flow.finishFolderCloseAfterHandoffFrame();
    assert(closeAfterFrame.flow.isFolderClosing.value, "ghost handoff frame should keep the folder closing for one frame");
    assert(closeAfterFrame.flow.renderedFolder.value?.id === "folder-1", "ghost handoff frame should keep the rendered folder for overlay cleanup");
    timers.runAnimationFrames();
    assert(!closeAfterFrame.flow.isFolderClosing.value, "ghost handoff frame completion should clear folder closing state");
    assert(closeAfterFrame.flow.renderedFolder.value === null, "ghost handoff frame completion should clear rendered folder");

    const canceledCloseAfterFrame = createFolderFlow();
    canceledCloseAfterFrame.flow.commitOpenFolder("folder-1");
    canceledCloseAfterFrame.flow.commitOpenFolder(null, { waitForCloseGhosts: true });
    canceledCloseAfterFrame.flow.finishFolderCloseAfterHandoffFrame();
    canceledCloseAfterFrame.flow.commitOpenFolder("folder-1");
    timers.runAnimationFrames();
    assert(canceledCloseAfterFrame.flow.openFolderId.value === "folder-1", "reopening should cancel a pending ghost handoff finish");
    assert(canceledCloseAfterFrame.flow.renderedFolder.value?.id === "folder-1", "canceled ghost handoff should keep the reopened folder rendered");

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

    const zoomFadeClose = createFolderFlow();
    zoomFadeClose.flow.commitOpenFolder("folder-1");
    zoomFadeClose.folderPageIndex.value = 1;
    zoomFadeClose.folderPageRefs.push({ id: "extra-folder-page" });
    assert(zoomFadeClose.flow.startFolderZoomFadeClose(), "zoom-fade close should start for an open folder");
    assert(zoomFadeClose.flow.openFolderId.value === "folder-1", "zoom-fade close should keep the folder open during the visual animation");
    assert(zoomFadeClose.flow.isFolderZoomFadeClosing.value, "zoom-fade close should expose its own closing state");
    assert(zoomFadeClose.flow.folderZoomFadeCloseReason.value === null, "zoom-fade close should allow a missing reason");
    assert(!zoomFadeClose.flow.isFolderClosing.value, "zoom-fade close should not use the normal folder closing state");
    assert(!zoomFadeClose.flow.isHomeRevealSettling.value, "zoom-fade close should not settle the home reveal by default");
    assert(zoomFadeClose.calls.clearFolderPageTurn === 1, "zoom-fade close should clear folder page turn timers");
    zoomFadeClose.flow.finishFolderZoomFadeClose();
    assert(zoomFadeClose.flow.openFolderId.value === null, "zoom-fade finish should clear the open folder id");
    assert(zoomFadeClose.flow.renderedFolder.value === null, "zoom-fade finish should clear the rendered folder");
    assert(zoomFadeClose.folderPageIndex.value === 0, "zoom-fade finish should reset folder page index");
    assert(zoomFadeClose.folderPageRefs.length === 0, "zoom-fade finish should clear folder page refs");

    const zoomFadeRevealHome = createFolderFlow();
    zoomFadeRevealHome.flow.commitOpenFolder("folder-1");
    zoomFadeRevealHome.flow.startFolderZoomFadeClose({ reason: "desktop", revealHome: true });
    assert(zoomFadeRevealHome.flow.folderZoomFadeCloseReason.value === "desktop", "zoom-fade close should store its reason");
    assert(zoomFadeRevealHome.flow.isHomeRevealSettling.value, "zoom-fade close should optionally settle the home reveal");

    const zoomFadeFallback = createFolderFlow();
    zoomFadeFallback.flow.commitOpenFolder("folder-1");
    zoomFadeFallback.flow.startFolderZoomFadeClose();
    timers.runDelay(FOLDER_ZOOM_FADE_CLOSE_DURATION + 80);
    assert(!zoomFadeFallback.flow.isFolderZoomFadeClosing.value, "zoom-fade fallback timer should finish the close");
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}
