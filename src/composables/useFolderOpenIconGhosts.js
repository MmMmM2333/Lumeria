import { computed, shallowRef } from "vue";

function makeFolderOpenIconGhostedKey(folderId, childId) {
  return `${folderId || ""}:${childId || ""}`;
}

function cloneGhostItem(item, options) {
  if (!item) return item;
  return typeof options?.cloneItem === "function" ? options.cloneItem(item) : { ...item };
}

function getPreviewSlotIndexById(folder, options) {
  const slots = typeof options?.folderPreviewSlots === "function" ? options.folderPreviewSlots(folder) || [] : [];
  const result = new Map();
  slots.forEach((child, index) => {
    if (child?.id && !result.has(child.id)) result.set(child.id, index);
  });
  return result;
}

function makeCapturedGhost(folderId, item, slotIndex, previewSlotIndex, options) {
  if (!folderId || !item?.id) return null;
  return {
    item: cloneGhostItem(item, options),
    previewSlotIndex,
    slotIndex,
    synthetic: previewSlotIndex == null,
  };
}

function captureFolderIconGhosts(folder, children, options) {
  if (!folder?.id || !Array.isArray(children)) return [];
  const previewSlotById = getPreviewSlotIndexById(folder, options);
  return children
    .map((child, slotIndex) => makeCapturedGhost(folder.id, child, slotIndex, previewSlotById.get(child?.id), options))
    .filter(Boolean);
}

function publishFolderIconGhosts(folderId, capturedGhosts, requestId, kind) {
  if (!folderId || !Array.isArray(capturedGhosts)) return [];
  return capturedGhosts
    .filter((ghost) => ghost?.item?.id)
    .map((ghost) => ({
      item: ghost.item,
      key: `${folderId}-${ghost.item.id}-${ghost.slotIndex}-${kind}-${requestId}`,
      previewSlotIndex: ghost.previewSlotIndex ?? null,
      requestId,
      slotIndex: ghost.slotIndex,
      synthetic: Boolean(ghost.synthetic),
    }));
}

export function useFolderOpenIconGhosts(options = {}) {
  const folderOpenIconGhosts = shallowRef([]);
  const folderOpenIconGhostSession = shallowRef(null);
  const folderOpenIconGhostedKeys = shallowRef(new Set());
  const folderOpenPreviewFrameGhostedIds = shallowRef(new Set());
  const folderCloseIconGhosts = shallowRef([]);
  const folderCloseIconGhostedKeys = shallowRef(new Set());
  const isFolderOpenFrameGhostPending = shallowRef(false);
  const isFolderOpenIconAnimationActive = computed(() => folderOpenIconGhostedKeys.value.size > 0);
  const isFolderCloseIconAnimationActive = computed(() => folderCloseIconGhostedKeys.value.size > 0);
  const completedFolderOpenIconGhostKeys = new Set();
  const completedFolderCloseIconGhostKeys = new Set();
  let folderOpenIconGhostRequestId = 0;
  let folderCloseIconGhostRequestId = 0;

  function clearFolderOpenIconGhosts() {
    folderOpenIconGhostRequestId += 1;
    completedFolderOpenIconGhostKeys.clear();
    folderOpenIconGhosts.value = [];
    folderOpenIconGhostSession.value = null;
    folderOpenIconGhostedKeys.value = new Set();
    folderOpenPreviewFrameGhostedIds.value = new Set();
    isFolderOpenFrameGhostPending.value = false;
  }

  function finishFolderOpenIconGhosts() {
    completedFolderOpenIconGhostKeys.clear();
    folderOpenIconGhosts.value = [];
    folderOpenIconGhostedKeys.value = new Set();
    if (folderOpenIconGhostSession.value?.frameCompleted === true) {
      folderOpenIconGhostSession.value = null;
    }
  }

  function clearFolderCloseIconGhosts() {
    folderCloseIconGhostRequestId += 1;
    completedFolderCloseIconGhostKeys.clear();
    folderCloseIconGhosts.value = [];
    folderCloseIconGhostedKeys.value = new Set();
  }

  function completeFolderOpenIconGhost(key) {
    const ghost = folderOpenIconGhosts.value.find((candidate) => candidate.key === key);
    if (!ghost || ghost.requestId !== folderOpenIconGhostRequestId) return;

    completedFolderOpenIconGhostKeys.add(key);
    if (completedFolderOpenIconGhostKeys.size < folderOpenIconGhosts.value.length) return;

    finishFolderOpenIconGhosts();
  }

  function completeFolderOpenFrameGhost(folderId, requestId) {
    if (requestId !== folderOpenIconGhostRequestId) return false;
    const session = folderOpenIconGhostSession.value;
    if (!session || session.status !== "accepted" || session.folderId !== folderId) return false;
    if (session.requestId !== requestId) return false;
    if (folderId && !folderOpenPreviewFrameGhostedIds.value.has(folderId)) return false;
    folderOpenIconGhostSession.value = {
      ...session,
      frameCompleted: true,
      status: "frame-complete",
    };
    folderOpenPreviewFrameGhostedIds.value = new Set();
    isFolderOpenFrameGhostPending.value = false;
    if (folderOpenIconGhosts.value.length === 0) folderOpenIconGhostSession.value = null;
    return true;
  }

  function completeFolderCloseIconGhost(key) {
    const ghost = folderCloseIconGhosts.value.find((candidate) => candidate.key === key);
    if (!ghost || ghost.requestId !== folderCloseIconGhostRequestId) return false;

    completedFolderCloseIconGhostKeys.add(key);
    if (completedFolderCloseIconGhostKeys.size < folderCloseIconGhosts.value.length) return false;

    clearFolderCloseIconGhosts();
    return true;
  }

  function captureFolderPreviewIconGhosts(folder, openingChildren) {
    return captureFolderIconGhosts(folder, openingChildren, options);
  }

  function captureFolderCloseIconGhosts(folder, closingChildren) {
    return captureFolderIconGhosts(folder, closingChildren, options);
  }

  function playFolderOpenIconGhosts(folderId, capturedGhosts) {
    const requestId = (folderOpenIconGhostRequestId += 1);
    completedFolderOpenIconGhostKeys.clear();
    const ghosts = publishFolderIconGhosts(folderId, capturedGhosts, requestId, "open");
    folderOpenIconGhostSession.value = ghosts.length
      ? {
        folderId: folderId || null,
        frameCompleted: false,
        requestId,
        status: "staged",
      }
      : null;
    folderOpenIconGhosts.value = ghosts;
    folderOpenIconGhostedKeys.value = new Set(ghosts.map((ghost) => makeFolderOpenIconGhostedKey(folderId, ghost.item.id)));
    folderOpenPreviewFrameGhostedIds.value = new Set();
    isFolderOpenFrameGhostPending.value = ghosts.length > 0;
  }

  function acceptFolderOpenIconGhostSession(folderId, requestId) {
    const session = folderOpenIconGhostSession.value;
    if (!session || session.status !== "staged") return false;
    if (session.folderId !== (folderId || null) || session.requestId !== requestId) return false;
    folderOpenIconGhostSession.value = {
      ...session,
      status: "accepted",
    };
    if (folderId) folderOpenPreviewFrameGhostedIds.value = new Set([folderId]);
    return true;
  }

  function playFolderCloseIconGhosts(folderId, capturedGhosts) {
    const requestId = (folderCloseIconGhostRequestId += 1);
    completedFolderCloseIconGhostKeys.clear();
    const ghosts = publishFolderIconGhosts(folderId, capturedGhosts, requestId, "close");
    folderCloseIconGhosts.value = ghosts;
    folderCloseIconGhostedKeys.value = new Set(ghosts.map((ghost) => makeFolderOpenIconGhostedKey(folderId, ghost.item.id)));
  }

  function isFolderOpeningIconGhosted(folderId, childId) {
    return folderOpenIconGhostedKeys.value.has(makeFolderOpenIconGhostedKey(folderId, childId));
  }

  function isFolderClosingIconGhosted(folderId, childId) {
    return folderCloseIconGhostedKeys.value.has(makeFolderOpenIconGhostedKey(folderId, childId));
  }

  function isFolderOpeningPreviewFrameGhosted(folderId) {
    return folderOpenPreviewFrameGhostedIds.value.has(folderId);
  }

  return {
    captureFolderCloseIconGhosts,
    captureFolderPreviewIconGhosts,
    acceptFolderOpenIconGhostSession,
    clearFolderCloseIconGhosts,
    clearFolderOpenIconGhosts,
    completeFolderOpenFrameGhost,
    completeFolderCloseIconGhost,
    completeFolderOpenIconGhost,
    folderCloseIconGhosts,
    folderOpenIconGhosts,
    folderOpenIconGhostSession,
    folderOpenPreviewFrameGhostedIds,
    isFolderCloseIconAnimationActive,
    isFolderClosingIconGhosted,
    isFolderOpenFrameGhostPending,
    isFolderOpenIconAnimationActive,
    isFolderOpeningIconGhosted,
    isFolderOpeningPreviewFrameGhosted,
    playFolderCloseIconGhosts,
    playFolderOpenIconGhosts,
  };
}
