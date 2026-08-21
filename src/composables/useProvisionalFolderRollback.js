import { computed, shallowRef } from "vue";

function cloneRect(rect) {
  if (!rect) return null;
  const left = Number(rect.left) || 0;
  const top = Number(rect.top) || 0;
  const width = Number(rect.width) || 0;
  const height = Number(rect.height) || 0;
  return Object.freeze({
    bottom: Number(rect.bottom) || top + height,
    height,
    left,
    right: Number(rect.right) || left + width,
    top,
    width,
  });
}

function requireId(value, label) {
  const id = String(value || "").trim();
  if (!id) throw new TypeError(`${label} must be a non-empty id`);
  return id;
}

export function useProvisionalFolderRollback(options = {}) {
  if (typeof options.cloneItem !== "function") {
    throw new TypeError("useProvisionalFolderRollback requires cloneItem");
  }
  const projectedPages = shallowRef(null);
  const presentation = shallowRef(null);
  const isActive = computed(() => presentation.value !== null);
  let nextToken = 0;

  function begin(request = {}) {
    if (presentation.value) {
      throw new Error(`Provisional folder rollback ${presentation.value.token} is still active`);
    }
    const folderId = requireId(request.folderId, "Provisional folder rollback folderId");
    const targetItem = request.targetItem;
    const targetAppId = requireId(targetItem?.id, "Provisional folder rollback target item");
    if (!Array.isArray(request.projectedPages)) {
      throw new TypeError("Provisional folder rollback requires projectedPages");
    }
    const token = ++nextToken;
    projectedPages.value = request.projectedPages;
    presentation.value = Object.freeze({
      folderId,
      handoffVelocity: 0,
      phase: "closing",
      previewSlotIndex: Math.max(0, Math.trunc(Number(request.previewSlotIndex) || 0)),
      reducedMotion: request.reducedMotion === true,
      targetAppId,
      targetIndex: Math.max(0, Math.trunc(Number(request.targetIndex) || 0)),
      targetItem: Object.freeze(options.cloneItem(targetItem)),
      targetPageIndex: Math.max(0, Math.trunc(Number(request.targetPageIndex) || 0)),
      targetRect: cloneRect(request.targetRect),
      token,
    });
    return token;
  }

  function beginDissolve(folderId, options = {}) {
    const current = presentation.value;
    if (!current || current.folderId !== folderId) return false;
    if (current.phase === "dissolving") return true;
    const velocity = Number(options.handoffVelocity);
    projectedPages.value = null;
    presentation.value = Object.freeze({
      ...current,
      handoffVelocity: Number.isFinite(velocity) ? Math.max(0, velocity) : 0,
      phase: "dissolving",
    });
    return true;
  }

  function complete(token) {
    const current = presentation.value;
    if (!current || current.phase !== "dissolving" || current.token !== token) return false;
    projectedPages.value = null;
    presentation.value = null;
    return true;
  }

  function dispose() {
    projectedPages.value = null;
    presentation.value = null;
  }

  return {
    begin,
    beginDissolve,
    complete,
    dispose,
    isActive,
    presentation,
    projectedPages,
  };
}
