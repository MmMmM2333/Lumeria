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
const pagedFolder = {
  id: "folder-paged",
  type: "folder",
  name: "Paged Folder",
  childPages: [
    [{ ...folderApp, id: "paged-folder-app-1" }],
    [{ ...folderApp, id: "paged-folder-app-2" }],
  ],
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
    clearFolderCloseIconGhosts: 0,
    clearFolderOpenIconGhosts: 0,
    clearFolderPageTurn: 0,
    clearFolderPageTurnRequest: 0,
    commitFolderPageTurnRequest: 0,
    folderOpenProgressAnimations: [],
    resetFolderViewportMetrics: 0,
    setFolderMotionGeometry: [],
  };
  const pages = ref(overrides.pages ?? [[folder]]);
  const folderPageIndex = ref(overrides.folderPageIndex ?? 1);
  const folderPageTurnRequest = ref(overrides.folderPageTurnRequest ?? null);
  const folderPageRefs = [{ id: "folder-page" }];
  const pageRefs = [{ id: "page" }];
  let folderMotionGeometry = overrides.folderMotionGeometry ?? { id: null, x: 0 };
  const folderOpenProgressControls = [];

  const flow = useLaunchpadFolderFlow({
    animateFolderOpenProgress: (animation) => {
      calls.folderOpenProgressAnimations.push(animation);
      const control = {
        cancelReason: null,
        cancel(reason) {
          control.cancelReason = reason;
        },
      };
      folderOpenProgressControls.push(control);
      return control;
    },
    clearFolderPageTurn: () => {
      calls.clearFolderPageTurn += 1;
    },
    clearFolderPageTurnRequest: () => {
      calls.clearFolderPageTurnRequest += 1;
      folderPageTurnRequest.value = null;
    },
    commitFolderPageIndex: (value) => {
      folderPageIndex.value = value;
    },
    commitFolderPageTurnRequest: (token, commitOptions = {}) => {
      calls.commitFolderPageTurnRequest += 1;
      const request = folderPageTurnRequest.value;
      if (!request || request.token !== token || request.folderId !== commitOptions.folderId || commitOptions.phase !== "open") return false;
      const maxIndex = Math.max(0, Number(commitOptions.maxIndex) || 0);
      if (request.targetIndex < 0 || request.targetIndex > maxIndex) return false;
      folderPageIndex.value = request.targetIndex;
      folderPageTurnRequest.value = null;
      return true;
    },
    clearFolderCloseIconGhosts: () => {
      calls.clearFolderCloseIconGhosts += 1;
    },
    clearFolderOpenIconGhosts: () => {
      calls.clearFolderOpenIconGhosts += 1;
    },
    cloneItem,
    findFolder,
    folderPageIndex,
    folderPageTurnRequest,
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
    arriveFolderOpenProgress(target = undefined) {
      const animation = [...calls.folderOpenProgressAnimations]
        .reverse()
        .find((candidate) => target === undefined || candidate.target === target);
      if (!animation) throw new Error(`Missing folder open progress animation for target ${target}`);
      animation.progress.value = animation.target;
      animation.onArrive?.();
    },
    calls,
    flow,
    folderOpenProgressControls,
    folderPageIndex,
    folderPageTurnRequest,
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
    assert(open.flow.folderOpenProgress.value === 0, "opening should start from the current open progress value");
    assert(open.flow.folderOpenProgressTarget.value === 1, "opening should target full open progress");
    assert(open.calls.folderOpenProgressAnimations.at(-1)?.target === 1, "opening should animate open progress to one");
    assert(open.flow.desktopProjectionEpoch.value === 1, "opening should finish any pending home reveal settle window");
    assert(!open.flow.isHomeRevealSettling.value, "opening should clear home reveal settle state");
    assert(open.pageRefs.length === 0, "finishing home reveal settle should clear page refs");
    assert(open.folderPageIndex.value === 0, "opening a different folder should reset folder page index");
    assert(open.folderMotionGeometry.id === "folder-1" && open.folderMotionGeometry.x === 18, "opening should set origin geometry with the folder id");
    assert(open.calls.resetFolderViewportMetrics === 1, "opening a different folder should reset stale folder viewport metrics");
    assert(open.calls.clearFolderPageTurnRequest === 1, "opening a different folder should clear stale folder page turn requests");

    const cancelledOpen = createFolderFlow();
    cancelledOpen.flow.commitOpenFolder("folder-1");
    cancelledOpen.flow.folderOpenProgress.value = 0.42;
    assert(cancelledOpen.flow.cancelFolderOpening() === true, "cancelFolderOpening should handle an in-progress folder opening");
    assert(cancelledOpen.flow.openFolderId.value === null, "cancelling an opening should enter the close path");
    assert(cancelledOpen.flow.folderOpeningCancelRequest.value?.folderId === "folder-1", "opening cancellation should publish the folder identity for the visual handoff");

    open.folderPageIndex.value = 2;
    open.flow.commitOpenFolder("folder-1");
    assert(open.folderPageIndex.value === 2, "reopening the same folder should preserve folder page index");
    assert(open.calls.resetFolderViewportMetrics === 1, "reopening the same folder should preserve current folder viewport metrics");
    assert(open.calls.clearFolderPageTurnRequest === 1, "reopening the same folder should not clear a same-folder page turn boundary");

    const switchFolder = createFolderFlow({ pages: [[folder, secondFolder]] });
    switchFolder.flow.commitOpenFolder("folder-1");
    switchFolder.flow.commitOpenFolder("folder-2");
    assert(switchFolder.calls.resetFolderViewportMetrics === 2, "switching folders should reset viewport metrics for the new folder");
    assert(switchFolder.calls.clearFolderPageTurnRequest === 2, "switching folders should clear stale folder page turn requests");

    const close = createFolderFlow();
    close.flow.commitOpenFolder("folder-1");
    close.folderPageIndex.value = 2;
    close.folderPageRefs.push({ id: "extra-folder-page" });
    close.flow.commitOpenFolder(null);
    assert(close.flow.openFolderId.value === null, "closing should clear the open folder id immediately");
    assert(close.flow.isFolderClosing.value, "closing should enter folder closing state immediately");
    assert(close.flow.isHomeRevealSettling.value, "closing should start home reveal settle state");
    assert(close.flow.folderOpenProgressTarget.value === 0, "closing should target zero open progress");
    assert(close.calls.folderOpenProgressAnimations.at(-1)?.target === 0, "closing should animate open progress to zero");
    assert(close.calls.clearFolderPageTurn === 1, "closing should clear folder page turn timers");
    assert(close.calls.clearFolderPageTurnRequest === 2, "closing should clear folder page turn requests when close starts");
    assert(close.calls.resetFolderViewportMetrics === 1, "closing should keep viewport metrics until the close animation finishes");
    close.arriveFolderOpenProgress(0);
    assert(close.flow.isFolderClosing.value, "folder close progress arrival should wait one handoff frame before cleanup");
    timers.runAnimationFrames();
    assert(!close.flow.isFolderClosing.value, "folder close progress arrival should clear folder closing state");
    assert(close.flow.renderedFolder.value === null, "folder close progress arrival should clear rendered folder");
    assert(close.folderPageIndex.value === 0, "folder close progress arrival should reset folder page index");
    assert(close.folderPageRefs.length === 0, "folder close progress arrival should clear folder page refs");
    assert(close.calls.resetFolderViewportMetrics === 2, "finishing close should clear viewport metrics for the next folder");
    assert(close.calls.clearFolderPageTurnRequest === 3, "finishing close should clear any remaining folder page turn request");
    timers.runDelay(HOME_REVEAL_SETTLE_DURATION);
    assert(!close.flow.isHomeRevealSettling.value, "home reveal timer should finish settle state");
    assert(close.flow.desktopProjectionEpoch.value === 1, "home reveal timer should advance projection epoch");

    const closeFallback = createFolderFlow();
    closeFallback.flow.commitOpenFolder("folder-1");
    closeFallback.flow.commitOpenFolder(null);
    timers.runDelay(FOLDER_CLOSE_DURATION);
    assert(closeFallback.flow.isFolderClosing.value, "normal close fallback should schedule cleanup on the next frame");
    timers.runAnimationFrames();
    assert(!closeFallback.flow.isFolderClosing.value, "normal close fallback should finish if open progress gets stuck");

    const closeWithPendingPageTurn = createFolderFlow({
      folderPageIndex: 0,
      pages: [[pagedFolder]],
    });
    closeWithPendingPageTurn.flow.commitOpenFolder("folder-paged");
    closeWithPendingPageTurn.folderPageTurnRequest.value = {
      folderId: "folder-paged",
      fromIndex: 0,
      targetIndex: 1,
      token: 42,
    };
    closeWithPendingPageTurn.flow.commitOpenFolder(null);
    assert(closeWithPendingPageTurn.calls.commitFolderPageTurnRequest === 1, "closing should commit the pending visual folder page request before clearing it");
    assert(closeWithPendingPageTurn.folderPageIndex.value === 1, "closing should use the pending visual folder page as the committed close anchor");
    assert(closeWithPendingPageTurn.folderPageTurnRequest.value === null, "committing the pending visual page should clear the folder page request");
    timers.runDelay(FOLDER_CLOSE_DURATION);
    timers.runAnimationFrames();

    const closeWithGhosts = createFolderFlow();
    closeWithGhosts.flow.commitOpenFolder("folder-1");
    closeWithGhosts.folderPageIndex.value = 2;
    closeWithGhosts.folderPageRefs.push({ id: "extra-folder-page" });
    closeWithGhosts.flow.commitOpenFolder(null, { waitForCloseGhosts: true });
    timers.runDelay(FOLDER_CLOSE_DURATION);
    assert(closeWithGhosts.flow.isFolderClosing.value, "ghost handoff close should not finish on the DOM close duration");
    assert(closeWithGhosts.flow.renderedFolder.value?.id === "folder-1", "ghost handoff close should keep the rendered folder until handoff completion");
    closeWithGhosts.arriveFolderOpenProgress(0);
    timers.runAnimationFrames();
    assert(closeWithGhosts.flow.isFolderClosing.value, "ghost handoff close should wait for handoff after open progress arrives");
    closeWithGhosts.flow.finishFolderCloseAfterHandoffFrame();
    assert(closeWithGhosts.flow.isFolderClosing.value, "ghost handoff completion should wait one frame after both close latches");
    timers.runAnimationFrames();
    assert(!closeWithGhosts.flow.isFolderClosing.value, "ghost handoff completion should clear folder closing state after progress arrival");
    assert(closeWithGhosts.flow.renderedFolder.value === null, "ghost handoff completion should clear rendered folder after progress arrival");

    const interruptedClose = createFolderFlow();
    interruptedClose.flow.commitOpenFolder("folder-1");
    interruptedClose.folderPageIndex.value = 2;
    interruptedClose.folderPageRefs.push({ id: "extra-folder-page" });
    interruptedClose.flow.commitOpenFolder(null, { waitForCloseGhosts: true });
    const staleNormalCloseProgressAnimation = interruptedClose.calls.folderOpenProgressAnimations.at(-1);
    assert(interruptedClose.flow.startFolderZoomFadeClose({ reason: "desktop" }), "zoom-fade close should interrupt a normal folder close");
    assert(!interruptedClose.flow.isFolderClosing.value, "interrupted normal close should leave folder closing state");
    assert(interruptedClose.flow.isFolderZoomFadeClosing.value, "interrupted normal close should enter zoom-fade closing state");
    assert(interruptedClose.flow.isFolderZoomFadeClosingFromFolderClose.value, "interrupted normal close should keep the folder visually closing");
    assert(interruptedClose.flow.folderZoomFadeCloseReason.value === "desktop", "interrupted normal close should store the zoom-fade reason");
    assert(interruptedClose.flow.renderedFolder.value?.id === "folder-1", "interrupted normal close should keep the rendered folder for zoom-fade");
    assert(interruptedClose.flow.folderOpenProgressTarget.value === 0, "interrupted normal close should keep targeting zero open progress");
    assert(interruptedClose.calls.folderOpenProgressAnimations.at(-1)?.target === 0, "interrupted normal close should retarget zoom-fade progress to zero");
    assert(interruptedClose.calls.clearFolderCloseIconGhosts === 1, "interrupted normal close should clear close ghosts");
    assert(interruptedClose.calls.clearFolderOpenIconGhosts === 1, "interrupted normal close should clear open ghosts");
    assert(interruptedClose.calls.clearFolderPageTurn === 2, "interrupted normal close should clear folder page turn timers again");
    staleNormalCloseProgressAnimation.progress.value = staleNormalCloseProgressAnimation.target;
    staleNormalCloseProgressAnimation.onArrive?.();
    assert(interruptedClose.flow.isFolderZoomFadeClosing.value, "stale normal close progress arrival should not finish an interrupted zoom-fade close");
    timers.runDelay(FOLDER_CLOSE_GHOST_FALLBACK_DURATION);
    assert(interruptedClose.flow.isFolderZoomFadeClosing.value, "interrupted normal close should cancel the normal close fallback timer");
    assert(interruptedClose.flow.renderedFolder.value?.id === "folder-1", "normal close fallback should not clear the zoom-fading folder");
    interruptedClose.arriveFolderOpenProgress(0);
    assert(!interruptedClose.flow.isFolderZoomFadeClosingFromFolderClose.value, "zoom-fade finish should clear the visual closing flag");

    const closeAfterFrame = createFolderFlow();
    closeAfterFrame.flow.commitOpenFolder("folder-1");
    closeAfterFrame.flow.commitOpenFolder(null, { waitForCloseGhosts: true });
    closeAfterFrame.flow.finishFolderCloseAfterHandoffFrame();
    assert(closeAfterFrame.flow.isFolderClosing.value, "ghost handoff should not finish before open progress reaches zero");
    closeAfterFrame.arriveFolderOpenProgress(0);
    assert(closeAfterFrame.flow.isFolderClosing.value, "ghost handoff frame should keep the folder closing for one frame");
    assert(closeAfterFrame.flow.renderedFolder.value?.id === "folder-1", "ghost handoff frame should keep the rendered folder for overlay cleanup");
    timers.runAnimationFrames();
    assert(!closeAfterFrame.flow.isFolderClosing.value, "ghost handoff frame completion should clear folder closing state");
    assert(closeAfterFrame.flow.renderedFolder.value === null, "ghost handoff frame completion should clear rendered folder");

    const canceledCloseAfterFrame = createFolderFlow();
    canceledCloseAfterFrame.flow.commitOpenFolder("folder-1");
    canceledCloseAfterFrame.flow.commitOpenFolder(null, { waitForCloseGhosts: true });
    canceledCloseAfterFrame.arriveFolderOpenProgress(0);
    canceledCloseAfterFrame.flow.finishFolderCloseAfterHandoffFrame();
    canceledCloseAfterFrame.flow.commitOpenFolder("folder-1");
    timers.runAnimationFrames();
    assert(canceledCloseAfterFrame.flow.openFolderId.value === "folder-1", "reopening should cancel a pending ghost handoff finish");
    assert(canceledCloseAfterFrame.flow.renderedFolder.value?.id === "folder-1", "canceled ghost handoff should keep the reopened folder rendered");
    assert(canceledCloseAfterFrame.calls.folderOpenProgressAnimations.at(-1)?.target === 1, "reopening during close should retarget open progress to one");

    const closeWithGhostFallback = createFolderFlow();
    closeWithGhostFallback.flow.commitOpenFolder("folder-1");
    closeWithGhostFallback.flow.commitOpenFolder(null, { waitForCloseGhosts: true });
    timers.runDelay(FOLDER_CLOSE_GHOST_FALLBACK_DURATION);
    assert(closeWithGhostFallback.flow.isFolderClosing.value, "ghost handoff fallback should schedule cleanup on the next frame");
    timers.runAnimationFrames();
    assert(!closeWithGhostFallback.flow.isFolderClosing.value, "ghost handoff fallback should clear folder closing state");

    const launchClose = createFolderFlow();
    launchClose.flow.commitOpenFolder("folder-1");
    launchClose.folderPageIndex.value = 1;
    launchClose.folderPageRefs.push({ id: "extra-folder-page" });
    assert(launchClose.flow.startFolderAppLaunchClose(), "app launch close should start for an open folder");
    assert(launchClose.flow.openFolderId.value === null, "app launch close should clear open folder id immediately");
    assert(launchClose.flow.isFolderAppLaunchClosing.value, "app launch close should enter launch closing state");
    assert(!launchClose.flow.isFolderClosing.value, "app launch close should not use normal folder closing state");
    assert(launchClose.flow.folderClosingSnapshot.value.id === "folder-1", "app launch close should keep a closing snapshot");
    assert(launchClose.flow.folderClosingSnapshot.value !== folder, "app launch close snapshot should be cloned");
    assert(launchClose.flow.folderOpenProgressTarget.value === 0, "app launch close should target zero open progress");
    assert(launchClose.calls.folderOpenProgressAnimations.at(-1)?.target === 0, "app launch close should animate open progress to zero");
    launchClose.arriveFolderOpenProgress(0);
    assert(!launchClose.flow.isFolderAppLaunchClosing.value, "app launch close progress arrival should clear launch closing state");
    assert(launchClose.flow.renderedFolder.value === null, "app launch close progress arrival should clear rendered folder");
    assert(launchClose.folderPageIndex.value === 0, "app launch close progress arrival should reset folder page index");
    assert(launchClose.folderPageRefs.length === 0, "app launch close progress arrival should clear folder page refs");
    timers.runDelay(FOLDER_APP_LAUNCH_DURATION);
    assert(launchClose.flow.renderedFolder.value === null, "app launch close fallback should be cleared after progress arrival");

    const launchCloseFallback = createFolderFlow();
    launchCloseFallback.flow.commitOpenFolder("folder-1");
    launchCloseFallback.flow.startFolderAppLaunchClose();
    timers.runDelay(FOLDER_APP_LAUNCH_DURATION);
    assert(!launchCloseFallback.flow.isFolderAppLaunchClosing.value, "app launch close fallback timer should finish a stuck progress close");
    assert(launchCloseFallback.flow.renderedFolder.value === null, "app launch close fallback timer should clear rendered folder");

    const launchCloseReopen = createFolderFlow();
    launchCloseReopen.flow.commitOpenFolder("folder-1");
    launchCloseReopen.flow.startFolderAppLaunchClose();
    launchCloseReopen.flow.commitOpenFolder("folder-1");
    timers.runDelay(FOLDER_APP_LAUNCH_DURATION);
    assert(launchCloseReopen.flow.openFolderId.value === "folder-1", "reopening should cancel a stale app launch close fallback");
    assert(launchCloseReopen.flow.renderedFolder.value?.id === "folder-1", "stale app launch fallback should not clear a reopened folder");
    assert(launchCloseReopen.calls.folderOpenProgressAnimations.at(-1)?.target === 1, "reopening after app launch close should retarget open progress to one");

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
    assert(!zoomFadeClose.flow.isFolderZoomFadeClosingFromFolderClose.value, "open-folder zoom-fade close should not use the visual folder-close flag");
    assert(zoomFadeClose.flow.folderOpenProgressTarget.value === 0, "zoom-fade close should target zero open progress");
    assert(zoomFadeClose.calls.folderOpenProgressAnimations.at(-1)?.target === 0, "zoom-fade close should animate open progress to zero");
    assert(!zoomFadeClose.flow.isHomeRevealSettling.value, "zoom-fade close should not settle the home reveal by default");
    assert(zoomFadeClose.calls.clearFolderPageTurn === 1, "zoom-fade close should clear folder page turn timers");
    assert(zoomFadeClose.calls.clearFolderOpenIconGhosts === 1, "zoom-fade close should clear interrupted folder open ghosts");
    assert(zoomFadeClose.calls.clearFolderCloseIconGhosts === 1, "zoom-fade close should clear interrupted folder close ghosts");
    zoomFadeClose.arriveFolderOpenProgress(0);
    assert(zoomFadeClose.flow.openFolderId.value === null, "zoom-fade finish should clear the open folder id");
    assert(zoomFadeClose.flow.renderedFolder.value === null, "zoom-fade finish should clear the rendered folder");
    assert(zoomFadeClose.folderPageIndex.value === 0, "zoom-fade finish should reset folder page index");
    assert(zoomFadeClose.folderPageRefs.length === 0, "zoom-fade finish should clear folder page refs");

    const zoomFadeDirectFinish = createFolderFlow();
    zoomFadeDirectFinish.flow.commitOpenFolder("folder-1");
    zoomFadeDirectFinish.flow.startFolderZoomFadeClose();
    assert(zoomFadeDirectFinish.flow.finishFolderZoomFadeClose(), "zoom-fade close should still support direct external finish");
    assert(zoomFadeDirectFinish.flow.openFolderId.value === null, "direct zoom-fade finish should clear the open folder id");

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

    const zoomFadeReopen = createFolderFlow();
    zoomFadeReopen.flow.commitOpenFolder("folder-1");
    zoomFadeReopen.flow.startFolderZoomFadeClose();
    zoomFadeReopen.flow.commitOpenFolder("folder-1");
    timers.runDelay(FOLDER_ZOOM_FADE_CLOSE_DURATION + 80);
    assert(zoomFadeReopen.flow.openFolderId.value === "folder-1", "reopening should cancel a stale zoom-fade fallback");
    assert(zoomFadeReopen.flow.renderedFolder.value?.id === "folder-1", "stale zoom-fade fallback should not clear a reopened folder");
    assert(zoomFadeReopen.calls.folderOpenProgressAnimations.at(-1)?.target === 1, "reopening after zoom-fade should retarget open progress to one");
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}
