import { computed, ref, shallowRef } from "vue";
import { killMotionOf, motion, motionSprings } from "../rendering/desktopScenePort.js";
import {
  FOLDER_APP_LAUNCH_DURATION,
  FOLDER_CLOSE_DURATION,
  FOLDER_CLOSE_GHOST_FALLBACK_DURATION,
  FOLDER_ZOOM_FADE_CLOSE_DURATION,
  HOME_REVEAL_SETTLE_DURATION,
} from "./launchpadConstants.js";

const FOLDER_OPEN_PROGRESS_LANE_KEY = "folder-open-progress";
const FOLDER_OPEN_PROGRESS_SPRING = Object.freeze({
  ...motionSprings.folderPanelOpen,
  arriveDelta: 0.01,
});

function createDefaultFolderOpenProgressAnimation({ onArrive, progress, target }) {
  return motion(progress)
    .spring(FOLDER_OPEN_PROGRESS_SPRING)
    .lane("base", FOLDER_OPEN_PROGRESS_LANE_KEY)
    .interrupt("retarget")
    .to({ onArrive, value: target })
    .start();
}

export function useLaunchpadFolderFlow(options) {
  if (typeof options.commitFolderPageIndex !== "function") {
    throw new TypeError("useLaunchpadFolderFlow requires commitFolderPageIndex");
  }
  if (typeof options.getRenderedPages !== "function") {
    throw new TypeError("useLaunchpadFolderFlow requires getRenderedPages");
  }
  const openFolderId = ref(null);
  const renderedFolderId = ref(null);
  const folderOpenProgress = ref(0);
  const folderOpenProgressTarget = ref(0);
  const folderClosingSnapshot = shallowRef(null);
  const isFolderAppLaunchClosing = ref(false);
  const isFolderZoomFadeClosing = ref(false);
  const isFolderZoomFadeClosingFromFolderClose = ref(false);
  const folderZoomFadeCloseReason = ref(null);
  const folderOpeningOriginBounds = shallowRef(null);
  const folderOpeningCancelRequest = shallowRef(null);
  const folderOpenWarmupRequest = shallowRef(null);
  const isHomeRevealSettling = ref(false);
  const desktopProjectionEpoch = ref(0);
  let folderCloseTimer = null;
  let homeRevealSettleTimer = null;
  let folderAppLaunchTimer = null;
  let folderCloseHandoffFrame = null;
  let folderZoomFadeCloseTimer = null;
  let folderOpenWarmupRequestId = 0;
  let folderOpeningCancelRequestId = 0;
  let hasPreparedFirstFolderOpen = false;
  let folderOpenProgressControl = null;
  let normalCloseNeedsHandoff = false;
  let normalCloseProgressArrived = false;
  let normalCloseHandoffReady = false;
  let normalCloseHandoffPublished = false;
  let normalCloseHandoffVelocity = 0;
  let normalCloseHandoffVelocityCaptured = false;
  let folderOpenProgressAnimationId = 0;

  function getRenderedPages() {
    const renderedPages = options.getRenderedPages();
    if (!Array.isArray(renderedPages)) {
      throw new TypeError("useLaunchpadFolderFlow getRenderedPages must return pages");
    }
    return renderedPages;
  }

  const renderedFolder = computed(() => {
    if (!renderedFolderId.value) return folderClosingSnapshot.value;
    return options.findFolder(getRenderedPages(), renderedFolderId.value)?.item || folderClosingSnapshot.value;
  });

  const folderPages = computed(() => {
    if (!renderedFolder.value) return [];
    const pendingPageTurnTarget = options.folderPageTurnRequest?.value?.folderId === renderedFolder.value.id
      ? options.folderPageTurnRequest.value.targetIndex
      : null;
    const activeDragPageIndex = Math.max(options.folderPageIndex.value, Number(pendingPageTurnTarget) || 0);
    const minPageCount = options.isDragActive() && openFolderId.value === renderedFolder.value.id ? activeDragPageIndex + 1 : 1;
    return options.getVisibleFolderPages(renderedFolder.value, options.folderPageSize.value, minPageCount);
  });

  const isFolderClosing = computed(() => Boolean(
    renderedFolderId.value &&
    !openFolderId.value &&
    folderOpenProgressTarget.value === 0 &&
    !isFolderAppLaunchClosing.value &&
    !isFolderZoomFadeClosing.value
  ));
  const isFolderLayerActive = computed(() => Boolean(openFolderId.value || renderedFolderId.value || isFolderClosing.value || isFolderAppLaunchClosing.value || isFolderZoomFadeClosing.value));

  function clearFolderOpenProgressMotion(reason = "replace") {
    folderOpenProgressAnimationId += 1;
    folderOpenProgressControl?.cancel?.(reason);
    folderOpenProgressControl = null;
    killMotionOf(folderOpenProgress, "value", {
      lane: "base",
      laneKey: FOLDER_OPEN_PROGRESS_LANE_KEY,
      reason,
    });
  }

  function setFolderOpenProgressImmediate(value, reason = "set") {
    clearFolderOpenProgressMotion(reason);
    folderOpenProgress.value = value;
    folderOpenProgressTarget.value = value;
  }

  function resetNormalCloseCompletion() {
    normalCloseNeedsHandoff = false;
    normalCloseProgressArrived = false;
    normalCloseHandoffReady = false;
    normalCloseHandoffPublished = false;
    normalCloseHandoffVelocity = 0;
    normalCloseHandoffVelocityCaptured = false;
  }

  function captureNormalCloseHandoffVelocity() {
    if (normalCloseHandoffVelocityCaptured) return normalCloseHandoffVelocity;
    const velocity = Number(folderOpenProgressControl?.velocity);
    if (!Number.isFinite(velocity)) return normalCloseHandoffVelocity;
    normalCloseHandoffVelocity = Math.max(0, -velocity);
    normalCloseHandoffVelocityCaptured = true;
    return normalCloseHandoffVelocity;
  }

  function publishNormalCloseHandoff() {
    if (normalCloseHandoffPublished) return false;
    const folderId = renderedFolderId.value || folderClosingSnapshot.value?.id || null;
    if (!folderId) return false;
    normalCloseHandoffPublished = true;
    options.onFolderCloseHandoffReady?.(folderId, {
      velocity: captureNormalCloseHandoffVelocity(),
    });
    return true;
  }

  function animateFolderOpenProgress(target, reason) {
    const animationId = ++folderOpenProgressAnimationId;
    folderOpenProgressTarget.value = target;
    const animate = options.animateFolderOpenProgress || createDefaultFolderOpenProgressAnimation;
    folderOpenProgressControl = animate({
      onArrive: () => {
        if (animationId !== folderOpenProgressAnimationId) return;
        if (folderOpenProgressTarget.value !== target) return;
        if (target === 0) {
          if (isFolderClosing.value) captureNormalCloseHandoffVelocity();
          finishActiveFolderProgressClose();
        }
      },
      progress: folderOpenProgress,
      reason,
      spring: FOLDER_OPEN_PROGRESS_SPRING,
      target,
    }) || null;
  }

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
    setFolderOpenProgressImmediate(0, "folder-close-finish");
    renderedFolderId.value = null;
    folderClosingSnapshot.value = null;
    isFolderZoomFadeClosing.value = false;
    isFolderZoomFadeClosingFromFolderClose.value = false;
    folderZoomFadeCloseReason.value = null;
    folderOpeningOriginBounds.value = null;
    options.clearFolderPageTurnRequest?.("folder-close-finish");
    options.commitFolderPageIndex(0);
    options.folderPageRefs.length = 0;
    options.resetFolderViewportMetrics?.();
    clearFolderCloseTimer();
    resetNormalCloseCompletion();
    folderOpeningCancelRequest.value = null;
  }

  function scheduleFolderCloseFinishFrame() {
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

  function maybeFinishNormalFolderClose() {
    if (!isFolderClosing.value) return false;
    if (!normalCloseProgressArrived) return false;
    if (normalCloseNeedsHandoff && !normalCloseHandoffReady) return false;
    publishNormalCloseHandoff();
    scheduleFolderCloseFinishFrame();
    return true;
  }

  function finishActiveFolderProgressClose() {
    if (isFolderAppLaunchClosing.value) return finishFolderAppLaunchClose();
    if (isFolderZoomFadeClosing.value) return finishFolderZoomFadeClose();
    normalCloseProgressArrived = true;
    return maybeFinishNormalFolderClose();
  }

  function finishFolderCloseAfterHandoffFrame() {
    normalCloseHandoffReady = true;
    return maybeFinishNormalFolderClose();
  }

  function finishFolderAppLaunchClose() {
    if (!isFolderAppLaunchClosing.value) return false;
    clearFolderCloseHandoffFrame();
    clearFolderAppLaunchTimer();
    renderedFolderId.value = null;
    folderClosingSnapshot.value = null;
    openFolderId.value = null;
    isFolderAppLaunchClosing.value = false;
    isFolderZoomFadeClosing.value = false;
    isFolderZoomFadeClosingFromFolderClose.value = false;
    folderZoomFadeCloseReason.value = null;
    folderOpeningOriginBounds.value = null;
    folderOpeningCancelRequest.value = null;
    setFolderOpenProgressImmediate(0, "folder-app-launch-finish");
    options.clearFolderPageTurnRequest?.("folder-app-launch-finish");
    options.commitFolderPageIndex(0);
    options.folderPageRefs.length = 0;
    options.resetFolderViewportMetrics?.();
    return true;
  }

  function startFolderAppLaunchClose() {
    if (!renderedFolder.value || isFolderAppLaunchClosing.value) return false;
    clearFolderCloseHandoffFrame();
    clearFolderZoomFadeCloseTimer();
    const closingId = renderedFolderId.value || openFolderId.value || renderedFolder.value.id;
    const current = closingId ? options.findFolder(options.pages.value, closingId)?.item : null;
    folderClosingSnapshot.value = current ? options.cloneItem(current) : options.cloneItem(renderedFolder.value);
    openFolderId.value = null;
    isFolderZoomFadeClosing.value = false;
    isFolderZoomFadeClosingFromFolderClose.value = false;
    folderZoomFadeCloseReason.value = null;
    folderOpeningOriginBounds.value = null;
    folderOpeningCancelRequest.value = null;
    isFolderAppLaunchClosing.value = true;
    options.clearFolderPageTurnRequest?.("folder-app-launch-close");
    options.clearFolderPageTurn();
    clearFolderCloseTimer();
    clearFolderAppLaunchTimer();
    resetNormalCloseCompletion();
    animateFolderOpenProgress(0, "folder-app-launch-close");
    folderAppLaunchTimer = window.setTimeout(finishFolderAppLaunchClose, FOLDER_APP_LAUNCH_DURATION);
    return true;
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
      resetNormalCloseCompletion();
      isFolderAppLaunchClosing.value = false;
      isFolderZoomFadeClosing.value = false;
      isFolderZoomFadeClosingFromFolderClose.value = false;
      folderZoomFadeCloseReason.value = null;
      folderOpeningOriginBounds.value = commitOptions?.originBounds || null;
      folderOpeningCancelRequest.value = null;
      folderClosingSnapshot.value = null;
      if (!isSameFolder) {
        options.clearFolderPageTurnRequest?.("folder-open");
        options.resetFolderViewportMetrics?.();
      }
      options.setFolderMotionGeometry(originGeometry ? { ...originGeometry, id: next } : options.getFolderIconMotionGeometry(next));
      openFolderId.value = next;
      renderedFolderId.value = next;
      if (!isSameFolder) options.commitFolderPageIndex(0);
      animateFolderOpenProgress(1, "folder-open");
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
    folderOpenProgressTarget.value = 0;
    isFolderZoomFadeClosing.value = false;
    isFolderZoomFadeClosingFromFolderClose.value = false;
    folderZoomFadeCloseReason.value = null;
    folderOpeningOriginBounds.value = null;
    folderOpeningCancelRequest.value = commitOptions?.openingCancelRequest || null;
    startHomeRevealSettleWindow();
    options.clearFolderPageTurnRequest?.("folder-close-start");
    options.clearFolderPageTurn();
    normalCloseNeedsHandoff = Boolean(commitOptions?.waitForCloseGhosts);
    normalCloseProgressArrived = false;
    normalCloseHandoffReady = !normalCloseNeedsHandoff;
    animateFolderOpenProgress(0, "folder-close");
    clearFolderCloseTimer();
    folderCloseTimer = window.setTimeout(() => {
      normalCloseProgressArrived = true;
      normalCloseHandoffReady = true;
      maybeFinishNormalFolderClose();
    }, commitOptions?.waitForCloseGhosts ? FOLDER_CLOSE_GHOST_FALLBACK_DURATION : FOLDER_CLOSE_DURATION);
  }

  function cancelFolderOpening(cancelOptions = {}) {
    const folderId = openFolderId.value;
    const progress = Number(folderOpenProgress.value);
    if (!folderId || folderOpenProgressTarget.value !== 1 || progress >= 0.999) return false;
    const request = {
      folderId,
      id: ++folderOpeningCancelRequestId,
      progress,
    };
    const commit = typeof cancelOptions.commit === "function" ? cancelOptions.commit : commitOpenFolder;
    commit(null, {
      ...(cancelOptions.commitOptions || {}),
      openingCancelRequest: request,
      waitForCloseGhosts: true,
    });
    return true;
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
    clearFolderAppLaunchTimer();
    renderedFolderId.value = null;
    folderClosingSnapshot.value = null;
    openFolderId.value = null;
    setFolderOpenProgressImmediate(0, "folder-zoom-fade-finish");
    isFolderZoomFadeClosing.value = false;
    isFolderZoomFadeClosingFromFolderClose.value = false;
    folderZoomFadeCloseReason.value = null;
    folderOpeningOriginBounds.value = null;
    folderOpeningCancelRequest.value = null;
    options.clearFolderPageTurnRequest?.("folder-zoom-fade-finish");
    options.commitFolderPageIndex(0);
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
    resetNormalCloseCompletion();
    isFolderZoomFadeClosing.value = true;
    folderZoomFadeCloseReason.value = closeOptions.reason || null;
    options.clearFolderOpenIconGhosts?.();
    options.clearFolderCloseIconGhosts?.();
    if (closeOptions.revealHome) startHomeRevealSettleWindow();
    else finishHomeRevealSettleWindow();
    options.clearFolderPageTurnRequest?.("folder-zoom-fade-start");
    options.clearFolderPageTurn();
    animateFolderOpenProgress(0, "folder-zoom-fade-close");
    folderZoomFadeCloseTimer = window.setTimeout(finishFolderZoomFadeClose, FOLDER_ZOOM_FADE_CLOSE_DURATION + 80);
    return true;
  }

  return {
    clearFolderAppLaunchTimer,
    clearFolderCloseTimer,
    clearFolderCloseHandoffFrame,
    clearFolderZoomFadeCloseTimer,
    clearHomeRevealSettleTimer,
    cancelFolderOpening,
    commitOpenFolder,
    desktopProjectionEpoch,
    finishFolderClose,
    finishFolderCloseAfterHandoffFrame,
    finishFolderZoomFadeClose,
    finishHomeRevealSettleWindow,
    folderClosingSnapshot,
    folderOpenProgress,
    folderOpenProgressTarget,
    folderOpenWarmupRequest,
    folderOpeningCancelRequest,
    folderOpeningOriginBounds,
    folderPages,
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
