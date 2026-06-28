import { computed, ref, shallowRef } from "vue";
import {
  FOLDER_APP_LAUNCH_DURATION,
  FOLDER_CLOSE_DURATION,
  FOLDER_CLOSE_GHOST_FALLBACK_DURATION,
  FOLDER_ZOOM_FADE_CLOSE_DURATION,
  HOME_REVEAL_SETTLE_DURATION,
} from "./launchpadConstants.js";

export function useLaunchpadFolderFlow(options) {
  const openFolderId = ref(null);
  const renderedFolderId = ref(null);
  const isFolderClosing = ref(false);
  const folderClosingSnapshot = shallowRef(null);
  const folderSession = shallowRef(null);
  const isFolderAppLaunchClosing = ref(false);
  const isFolderZoomFadeClosing = ref(false);
  const isFolderZoomFadeClosingFromFolderClose = ref(false);
  const folderZoomFadeCloseReason = ref(null);
  const folderOpeningOriginBounds = shallowRef(null);
  const folderOpenWarmupRequest = shallowRef(null);
  const isHomeRevealSettling = ref(false);
  const desktopProjectionEpoch = ref(0);
  let folderCloseTimer = null;
  let homeRevealSettleTimer = null;
  let folderAppLaunchTimer = null;
  let folderCloseHandoffFrame = null;
  let folderZoomFadeCloseTimer = null;
  let folderOpenWarmupRequestId = 0;
  let hasPreparedFirstFolderOpen = false;

  const renderedFolder = computed(() => {
    if (!renderedFolderId.value) return folderClosingSnapshot.value;
    return options.findFolder(options.pages.value, renderedFolderId.value)?.item || folderClosingSnapshot.value;
  });

  const folderPages = computed(() => {
    if (!renderedFolder.value) return [];
    const minPageCount = options.isDragActive() && openFolderId.value === renderedFolder.value.id ? options.folderPageIndex.value + 1 : 1;
    return options.getVisibleFolderPages(renderedFolder.value, options.folderPageSize.value, minPageCount);
  });

  const isFolderLayerActive = computed(() => Boolean(openFolderId.value || renderedFolderId.value || isFolderClosing.value || isFolderAppLaunchClosing.value || isFolderZoomFadeClosing.value));

  function clearFolderCloseTimer() {
    if (folderCloseTimer) window.clearTimeout(folderCloseTimer);
    folderCloseTimer = null;
  }

  function clearHomeRevealSettleTimer() {
    if (homeRevealSettleTimer) window.clearTimeout(homeRevealSettleTimer);
    homeRevealSettleTimer = null;
  }

  function clearFolderAppLaunchTimer() {
    if (folderAppLaunchTimer) window.clearTimeout(folderAppLaunchTimer);
    folderAppLaunchTimer = null;
  }

  function clearFolderZoomFadeCloseTimer() {
    if (folderZoomFadeCloseTimer) window.clearTimeout(folderZoomFadeCloseTimer);
    folderZoomFadeCloseTimer = null;
  }

  function clearFolderCloseHandoffFrame() {
    if (folderCloseHandoffFrame != null) window.cancelAnimationFrame?.(folderCloseHandoffFrame);
    folderCloseHandoffFrame = null;
  }

  function finishHomeRevealSettleWindow() {
    clearHomeRevealSettleTimer();
    if (!isHomeRevealSettling.value) return;
    desktopProjectionEpoch.value += 1;
    isHomeRevealSettling.value = false;
    options.pageRefs.length = 0;
  }

  function startHomeRevealSettleWindow() {
    clearHomeRevealSettleTimer();
    isHomeRevealSettling.value = true;
    homeRevealSettleTimer = window.setTimeout(finishHomeRevealSettleWindow, HOME_REVEAL_SETTLE_DURATION);
  }

  function commitPendingFolderPageTurnForClose(folderId) {
    const request = options.folderPageTurnRequest?.value;
    if (!request || !folderId || request.folderId !== folderId || typeof options.commitFolderPageTurnRequest !== "function") return false;
    return options.commitFolderPageTurnRequest(request.token, {
      folderId,
      maxIndex: Math.max(0, folderPages.value.length - 1),
      phase: "open",
    }) === true;
  }

  function finishFolderClose() {
    clearFolderCloseHandoffFrame();
    clearFolderZoomFadeCloseTimer();
    renderedFolderId.value = null;
    folderClosingSnapshot.value = null;
    isFolderClosing.value = false;
    isFolderZoomFadeClosing.value = false;
    isFolderZoomFadeClosingFromFolderClose.value = false;
    folderZoomFadeCloseReason.value = null;
    folderOpeningOriginBounds.value = null;
    options.clearFolderPageTurnRequest?.("folder-close-finish");
    options.folderPageIndex.value = 0;
    options.folderPageRefs.length = 0;
    options.resetFolderViewportMetrics?.();
    clearFolderCloseTimer();
  }

  function finishFolderCloseAfterHandoffFrame() {
    clearFolderCloseHandoffFrame();
    if (typeof window.requestAnimationFrame !== "function") {
      finishFolderClose();
      return;
    }
    folderCloseHandoffFrame = window.requestAnimationFrame(() => {
      folderCloseHandoffFrame = null;
      finishFolderClose();
    });
  }

  function startFolderAppLaunchClose() {
    if (!renderedFolder.value || isFolderAppLaunchClosing.value) return;
    clearFolderCloseHandoffFrame();
    clearFolderZoomFadeCloseTimer();
    const closingId = renderedFolderId.value || openFolderId.value || renderedFolder.value.id;
    const current = closingId ? options.findFolder(options.pages.value, closingId)?.item : null;
    folderClosingSnapshot.value = current ? options.cloneItem(current) : options.cloneItem(renderedFolder.value);
    openFolderId.value = null;
    isFolderClosing.value = false;
    isFolderZoomFadeClosing.value = false;
    isFolderZoomFadeClosingFromFolderClose.value = false;
    folderZoomFadeCloseReason.value = null;
    folderOpeningOriginBounds.value = null;
    isFolderAppLaunchClosing.value = true;
    options.clearFolderPageTurnRequest?.("folder-app-launch-close");
    options.clearFolderPageTurn();
    clearFolderCloseTimer();
    clearFolderAppLaunchTimer();
    folderAppLaunchTimer = window.setTimeout(() => {
      renderedFolderId.value = null;
      folderClosingSnapshot.value = null;
      isFolderAppLaunchClosing.value = false;
      options.folderPageIndex.value = 0;
      options.folderPageRefs.length = 0;
      options.resetFolderViewportMetrics?.();
      clearFolderAppLaunchTimer();
    }, FOLDER_APP_LAUNCH_DURATION);
  }

  function commitOpenFolder(next, commitOptions) {
    clearFolderCloseHandoffFrame();
    clearFolderZoomFadeCloseTimer();
    if (next) {
      const isSameFolder = openFolderId.value === next && renderedFolderId.value === next;
      const originGeometry = commitOptions?.originGeometry;
      clearFolderCloseTimer();
      clearFolderAppLaunchTimer();
      finishHomeRevealSettleWindow();
      isFolderClosing.value = false;
      isFolderAppLaunchClosing.value = false;
      isFolderZoomFadeClosing.value = false;
      isFolderZoomFadeClosingFromFolderClose.value = false;
      folderZoomFadeCloseReason.value = null;
      folderOpeningOriginBounds.value = commitOptions?.originBounds || null;
      folderClosingSnapshot.value = null;
      if (!isSameFolder) {
        options.clearFolderPageTurnRequest?.("folder-open");
        options.resetFolderViewportMetrics?.();
      }
      options.setFolderMotionGeometry(originGeometry ? { ...originGeometry, id: next } : options.getFolderIconMotionGeometry(next));
      openFolderId.value = next;
      renderedFolderId.value = next;
      if (!isSameFolder) options.folderPageIndex.value = 0;
      return;
    }

    const closingId = renderedFolderId.value || openFolderId.value;
    commitPendingFolderPageTurnForClose(closingId);
    const current = closingId ? options.findFolder(options.pages.value, closingId)?.item : null;
    const fallback = renderedFolder.value;
    folderClosingSnapshot.value = current ? options.cloneItem(current) : fallback ? options.cloneItem(fallback) : null;
    const folderMotionGeometry = options.getFolderMotionGeometry();
    if (!folderMotionGeometry?.id || folderMotionGeometry.id !== closingId) {
      options.setFolderMotionGeometry(options.getFolderIconMotionGeometry(closingId));
    }
    openFolderId.value = null;
    isFolderClosing.value = true;
    isFolderZoomFadeClosing.value = false;
    isFolderZoomFadeClosingFromFolderClose.value = false;
    folderZoomFadeCloseReason.value = null;
    folderOpeningOriginBounds.value = null;
    startHomeRevealSettleWindow();
    options.clearFolderPageTurnRequest?.("folder-close-start");
    options.clearFolderPageTurn();
    clearFolderCloseTimer();
    folderCloseTimer = window.setTimeout(
      finishFolderClose,
      commitOptions?.waitForCloseGhosts ? FOLDER_CLOSE_GHOST_FALLBACK_DURATION : FOLDER_CLOSE_DURATION
    );
  }

  function commitFolderSession(next) {
    folderSession.value = next;
  }

  function requestFolderOpenWarmup(folder, originBounds = null) {
    if (hasPreparedFirstFolderOpen || !folder?.id) return false;
    folderOpenWarmupRequest.value = {
      folder: options.cloneItem(folder),
      id: ++folderOpenWarmupRequestId,
      originBounds,
    };
    return true;
  }

  function consumeFirstFolderOpenPrepare() {
    if (hasPreparedFirstFolderOpen) return false;
    hasPreparedFirstFolderOpen = true;
    return true;
  }

  function finishFolderZoomFadeClose() {
    if (!isFolderZoomFadeClosing.value) return false;
    clearFolderCloseHandoffFrame();
    clearFolderZoomFadeCloseTimer();
    renderedFolderId.value = null;
    folderClosingSnapshot.value = null;
    openFolderId.value = null;
    isFolderZoomFadeClosing.value = false;
    isFolderZoomFadeClosingFromFolderClose.value = false;
    folderZoomFadeCloseReason.value = null;
    folderOpeningOriginBounds.value = null;
    options.clearFolderPageTurnRequest?.("folder-zoom-fade-finish");
    options.folderPageIndex.value = 0;
    options.folderPageRefs.length = 0;
    options.resetFolderViewportMetrics?.();
    return true;
  }

  function startFolderZoomFadeClose(closeOptions = {}) {
    if (!renderedFolder.value || isFolderAppLaunchClosing.value || isFolderZoomFadeClosing.value) return false;
    clearFolderCloseHandoffFrame();
    clearFolderCloseTimer();
    clearFolderAppLaunchTimer();
    clearFolderZoomFadeCloseTimer();
    isFolderZoomFadeClosingFromFolderClose.value = isFolderClosing.value;
    isFolderClosing.value = false;
    isFolderZoomFadeClosing.value = true;
    folderZoomFadeCloseReason.value = closeOptions.reason || null;
    options.clearFolderOpenIconGhosts?.();
    options.clearFolderCloseIconGhosts?.();
    if (closeOptions.revealHome) startHomeRevealSettleWindow();
    else finishHomeRevealSettleWindow();
    options.clearFolderPageTurnRequest?.("folder-zoom-fade-start");
    options.clearFolderPageTurn();
    folderZoomFadeCloseTimer = window.setTimeout(finishFolderZoomFadeClose, FOLDER_ZOOM_FADE_CLOSE_DURATION + 80);
    return true;
  }

  return {
    clearFolderAppLaunchTimer,
    clearFolderCloseTimer,
    clearFolderCloseHandoffFrame,
    clearFolderZoomFadeCloseTimer,
    clearHomeRevealSettleTimer,
    commitFolderSession,
    commitOpenFolder,
    desktopProjectionEpoch,
    finishFolderClose,
    finishFolderCloseAfterHandoffFrame,
    finishFolderZoomFadeClose,
    finishHomeRevealSettleWindow,
    folderClosingSnapshot,
    folderOpenWarmupRequest,
    folderOpeningOriginBounds,
    folderPages,
    folderSession,
    folderZoomFadeCloseReason,
    isFolderAppLaunchClosing,
    isFolderClosing,
    isFolderLayerActive,
    isFolderZoomFadeClosing,
    isFolderZoomFadeClosingFromFolderClose,
    isHomeRevealSettling,
    openFolderId,
    renderedFolder,
    renderedFolderId,
    consumeFirstFolderOpenPrepare,
    requestFolderOpenWarmup,
    startFolderAppLaunchClose,
    startFolderZoomFadeClose,
    startHomeRevealSettleWindow,
  };
}
