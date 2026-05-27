import { computed, ref, shallowRef } from "vue";
import {
  FOLDER_APP_LAUNCH_DURATION,
  FOLDER_CLOSE_DURATION,
  HOME_REVEAL_SETTLE_DURATION,
} from "./launchpadConstants.js";

export function useLaunchpadFolderFlow(options) {
  const openFolderId = ref(null);
  const renderedFolderId = ref(null);
  const isFolderClosing = ref(false);
  const folderClosingSnapshot = shallowRef(null);
  const folderSession = shallowRef(null);
  const isFolderAppLaunchClosing = ref(false);
  const isHomeRevealSettling = ref(false);
  const desktopProjectionEpoch = ref(0);
  let folderCloseTimer = null;
  let homeRevealSettleTimer = null;
  let folderAppLaunchTimer = null;

  const renderedFolder = computed(() => {
    if (!renderedFolderId.value) return folderClosingSnapshot.value;
    return options.findFolder(options.pages.value, renderedFolderId.value)?.item || folderClosingSnapshot.value;
  });

  const folderPages = computed(() => {
    if (!renderedFolder.value) return [];
    const minPageCount = options.isDragActive() && openFolderId.value === renderedFolder.value.id ? options.folderPageIndex.value + 1 : 1;
    return options.getVisibleFolderPages(renderedFolder.value, options.folderPageSize.value, minPageCount);
  });

  const isFolderLayerActive = computed(() => Boolean(openFolderId.value || renderedFolderId.value || isFolderClosing.value || isFolderAppLaunchClosing.value));

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

  function startFolderAppLaunchClose() {
    if (!renderedFolder.value || isFolderAppLaunchClosing.value) return;
    const closingId = renderedFolderId.value || openFolderId.value || renderedFolder.value.id;
    const current = closingId ? options.findFolder(options.pages.value, closingId)?.item : null;
    folderClosingSnapshot.value = current ? options.cloneItem(current) : options.cloneItem(renderedFolder.value);
    openFolderId.value = null;
    isFolderClosing.value = false;
    isFolderAppLaunchClosing.value = true;
    options.clearFolderPageTurn();
    clearFolderCloseTimer();
    clearFolderAppLaunchTimer();
    folderAppLaunchTimer = window.setTimeout(() => {
      renderedFolderId.value = null;
      folderClosingSnapshot.value = null;
      isFolderAppLaunchClosing.value = false;
      options.folderPageIndex.value = 0;
      options.folderPageRefs.length = 0;
      clearFolderAppLaunchTimer();
    }, FOLDER_APP_LAUNCH_DURATION);
  }

  function commitOpenFolder(next, commitOptions) {
    if (next) {
      const isSameFolder = openFolderId.value === next && renderedFolderId.value === next;
      const originGeometry = commitOptions?.originGeometry;
      clearFolderCloseTimer();
      clearFolderAppLaunchTimer();
      finishHomeRevealSettleWindow();
      isFolderClosing.value = false;
      isFolderAppLaunchClosing.value = false;
      folderClosingSnapshot.value = null;
      options.setFolderMotionGeometry(originGeometry ? { ...originGeometry, id: next } : options.getFolderIconMotionGeometry(next));
      openFolderId.value = next;
      renderedFolderId.value = next;
      if (!isSameFolder) options.folderPageIndex.value = 0;
      return;
    }

    const closingId = renderedFolderId.value || openFolderId.value;
    const current = closingId ? options.findFolder(options.pages.value, closingId)?.item : null;
    const fallback = renderedFolder.value;
    folderClosingSnapshot.value = current ? options.cloneItem(current) : fallback ? options.cloneItem(fallback) : null;
    const folderMotionGeometry = options.getFolderMotionGeometry();
    if (!folderMotionGeometry?.id || folderMotionGeometry.id !== closingId) {
      options.setFolderMotionGeometry(options.getFolderIconMotionGeometry(closingId));
    }
    openFolderId.value = null;
    isFolderClosing.value = true;
    startHomeRevealSettleWindow();
    options.clearFolderPageTurn();
    clearFolderCloseTimer();
    folderCloseTimer = window.setTimeout(() => {
      renderedFolderId.value = null;
      folderClosingSnapshot.value = null;
      isFolderClosing.value = false;
      options.folderPageIndex.value = 0;
      options.folderPageRefs.length = 0;
      clearFolderCloseTimer();
    }, FOLDER_CLOSE_DURATION);
  }

  function commitFolderSession(next) {
    folderSession.value = next;
  }

  return {
    clearFolderAppLaunchTimer,
    clearFolderCloseTimer,
    clearHomeRevealSettleTimer,
    commitFolderSession,
    commitOpenFolder,
    desktopProjectionEpoch,
    finishHomeRevealSettleWindow,
    folderClosingSnapshot,
    folderPages,
    folderSession,
    isFolderAppLaunchClosing,
    isFolderClosing,
    isFolderLayerActive,
    isHomeRevealSettling,
    openFolderId,
    renderedFolder,
    renderedFolderId,
    startFolderAppLaunchClose,
    startHomeRevealSettleWindow,
  };
}
