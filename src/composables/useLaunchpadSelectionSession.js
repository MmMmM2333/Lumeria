import { computed, shallowRef } from "vue";

export const LAUNCHPAD_SELECTION_PHASE = Object.freeze({
  IDLE: "idle",
  SELECTING: "selecting",
  COMMITTING: "committing",
});

function normalizeIds(ids) {
  return Array.from(new Set(
    Array.from(ids || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  ));
}

function getFolderChildren(folder) {
  if (Array.isArray(folder?.childPages)) return folder.childPages.flatMap((page) => page || []);
  return Array.isArray(folder?.children) ? folder.children : [];
}

export function collectLaunchpadAppIds(pages) {
  const ids = [];
  const seen = new Set();
  for (const page of pages || []) {
    for (const item of page || []) {
      if (!item) continue;
      if (item.type === "app" && item.id && !seen.has(item.id)) {
        seen.add(item.id);
        ids.push(item.id);
      }
      if (item.type !== "folder") continue;
      for (const child of getFolderChildren(item)) {
        if (child?.type !== "app" || !child.id || seen.has(child.id)) continue;
        seen.add(child.id);
        ids.push(child.id);
      }
    }
  }
  return ids;
}

function normalizeScope(scope) {
  const orderedIds = normalizeIds(
    scope?.orderedIds ||
    (scope?.items || []).filter((item) => item?.type === "app").map((item) => item.id)
  );
  return {
    key: String(scope?.key || scope?.scopeKey || ""),
    orderedIds,
  };
}

export function useLaunchpadSelectionSession() {
  const phase = shallowRef(LAUNCHPAD_SELECTION_PHASE.IDLE);
  const selectedIds = shallowRef(new Set());
  const primaryId = shallowRef(null);
  const rangeAnchor = shallowRef(null);
  const frozenReason = shallowRef(null);
  const revision = shallowRef(0);

  const isActive = computed(() => phase.value !== LAUNCHPAD_SELECTION_PHASE.IDLE);
  const isFrozen = computed(() => (
    phase.value === LAUNCHPAD_SELECTION_PHASE.COMMITTING ||
    Boolean(frozenReason.value)
  ));
  const selectedCount = computed(() => selectedIds.value.size);

  function publish(ids, nextPrimaryId = primaryId.value) {
    const normalized = normalizeIds(ids);
    selectedIds.value = new Set(normalized);
    primaryId.value = normalized.includes(nextPrimaryId)
      ? nextPrimaryId
      : normalized[0] || null;
    revision.value += 1;
  }

  function begin(options = {}) {
    const ids = normalizeIds(options.initialIds);
    phase.value = LAUNCHPAD_SELECTION_PHASE.SELECTING;
    frozenReason.value = null;
    rangeAnchor.value = null;
    publish(ids, options.primaryId || ids[0] || null);
    return snapshot();
  }

  function clear() {
    phase.value = LAUNCHPAD_SELECTION_PHASE.IDLE;
    frozenReason.value = null;
    rangeAnchor.value = null;
    publish([]);
  }

  function deselectAll() {
    if (!isActive.value || isFrozen.value) return false;
    rangeAnchor.value = null;
    publish([]);
    return true;
  }

  function replace(id, scope = null) {
    if (!isActive.value || isFrozen.value) return false;
    const normalized = normalizeIds([id]);
    if (!normalized.length) return false;
    const normalizedScope = normalizeScope(scope);
    rangeAnchor.value = normalizedScope.key
      ? { id: normalized[0], scopeKey: normalizedScope.key }
      : null;
    publish(normalized, normalized[0]);
    return true;
  }

  function toggle(id, options = {}) {
    if (!isActive.value || isFrozen.value) return false;
    const normalizedId = normalizeIds([id])[0];
    if (!normalizedId) return false;
    const scope = normalizeScope(options.scope);
    const shouldSelectRange = Boolean(options.range && scope.key && scope.orderedIds.length);
    if (
      shouldSelectRange &&
      rangeAnchor.value?.scopeKey === scope.key
    ) {
      const anchorIndex = scope.orderedIds.indexOf(rangeAnchor.value.id);
      const targetIndex = scope.orderedIds.indexOf(normalizedId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [start, end] = anchorIndex <= targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
        const next = options.additive === false ? new Set() : new Set(selectedIds.value);
        for (const rangeId of scope.orderedIds.slice(start, end + 1)) next.add(rangeId);
        publish(next, primaryId.value || normalizedId);
        return true;
      }
    }

    const next = new Set(selectedIds.value);
    if (next.has(normalizedId)) next.delete(normalizedId);
    else next.add(normalizedId);
    rangeAnchor.value = scope.key ? { id: normalizedId, scopeKey: scope.key } : null;
    publish(next, next.has(normalizedId) ? normalizedId : primaryId.value);
    return true;
  }

  function selectScope(scope) {
    if (!isActive.value || isFrozen.value) return false;
    const normalized = normalizeScope(scope);
    if (!normalized.orderedIds.length) return false;
    const next = new Set(selectedIds.value);
    for (const id of normalized.orderedIds) next.add(id);
    rangeAnchor.value = {
      id: normalized.orderedIds[0],
      scopeKey: normalized.key,
    };
    publish(next, primaryId.value || normalized.orderedIds[0]);
    return true;
  }

  function reconcile(pagesOrIds, options = {}) {
    const validIds = new Set(Array.isArray(pagesOrIds) && pagesOrIds.every((entry) => typeof entry === "string")
      ? normalizeIds(pagesOrIds)
      : collectLaunchpadAppIds(pagesOrIds));
    const next = [...selectedIds.value].filter((id) => validIds.has(id));
    if (next.length !== selectedIds.value.size) publish(next);
    if (!next.length && options.exitWhenEmpty) clear();
    return next;
  }

  function beginCommit() {
    if (!isActive.value || isFrozen.value) return null;
    phase.value = LAUNCHPAD_SELECTION_PHASE.COMMITTING;
    return snapshot();
  }

  function finishCommit(options = {}) {
    if (phase.value !== LAUNCHPAD_SELECTION_PHASE.COMMITTING) return false;
    phase.value = selectedIds.value.size || options.keepActive
      ? LAUNCHPAD_SELECTION_PHASE.SELECTING
      : LAUNCHPAD_SELECTION_PHASE.IDLE;
    return true;
  }

  function freeze(reason = "busy") {
    if (!isActive.value || frozenReason.value) return false;
    frozenReason.value = String(reason || "busy");
    return true;
  }

  function unfreeze(reason = null) {
    if (!frozenReason.value) return false;
    if (reason && frozenReason.value !== reason) return false;
    frozenReason.value = null;
    return true;
  }

  function isSelected(id) {
    return selectedIds.value.has(id);
  }

  function snapshot() {
    return Object.freeze({
      phase: phase.value,
      primaryId: primaryId.value,
      revision: revision.value,
      selectedIds: Object.freeze([...selectedIds.value]),
    });
  }

  return {
    begin,
    beginCommit,
    clear,
    deselectAll,
    finishCommit,
    freeze,
    frozenReason,
    isActive,
    isFrozen,
    isSelected,
    phase,
    primaryId,
    rangeAnchor,
    reconcile,
    replace,
    revision,
    selectedCount,
    selectedIds,
    selectScope,
    snapshot,
    toggle,
    unfreeze,
  };
}
