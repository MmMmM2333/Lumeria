import type { StateHost } from "./stateHost.js";
import type {
  ReadonlyLaunchpadApp,
  ReadonlyLaunchpadFolder,
  ReadonlyLaunchpadItem,
  ReadonlyLaunchpadPages,
} from "../domain/launchpadLayout.js";

export const LAUNCHPAD_SELECTION_PHASE = Object.freeze({
  IDLE: "idle",
  SELECTING: "selecting",
  COMMITTING: "committing",
} as const);

export type LaunchpadSelectionPhase = typeof LAUNCHPAD_SELECTION_PHASE[keyof typeof LAUNCHPAD_SELECTION_PHASE];
export type LaunchpadSelectionScope = Readonly<{
  key?: string;
  scopeKey?: string;
  orderedIds?: readonly unknown[];
  items?: readonly ReadonlyLaunchpadItem[];
}>;
export type LaunchpadSelectionSnapshot = Readonly<{
  phase: LaunchpadSelectionPhase;
  primaryId: string | null;
  revision: number;
  selectedIds: readonly string[];
}>;
export type LaunchpadSelectionBeginOptions = Readonly<{
  initialIds?: Iterable<unknown>;
  primaryId?: string | null;
}>;
export type LaunchpadSelectionToggleOptions = Readonly<{
  additive?: boolean;
  range?: boolean;
  scope?: LaunchpadSelectionScope | null;
}>;

function normalizeIds(ids?: Iterable<unknown> | null): string[] {
  return Array.from(new Set(
    Array.from(ids || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  ));
}

function getFolderChildren(
  folder: ReadonlyLaunchpadFolder | null | undefined,
): readonly (ReadonlyLaunchpadApp | null | undefined)[] {
  return Array.isArray(folder?.childPages) ? folder.childPages.flatMap((page) => page || []) : [];
}

export function collectLaunchpadAppIds(pages: ReadonlyLaunchpadPages | null | undefined): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
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

function normalizeScope(scope?: LaunchpadSelectionScope | null): { key: string; orderedIds: string[] } {
  const orderedIds = normalizeIds(
    scope?.orderedIds ||
    (scope?.items || []).filter((item) => item?.type === "app").map((item) => item.id)
  );
  return {
    key: String(scope?.key || scope?.scopeKey || ""),
    orderedIds,
  };
}

export function createLaunchpadSelectionSession(host: StateHost) {
  const { cell: shallowRef, derived: computed } = host;
  const phase = shallowRef<LaunchpadSelectionPhase>(LAUNCHPAD_SELECTION_PHASE.IDLE);
  const selectedIds = shallowRef<Set<string>>(new Set());
  const primaryId = shallowRef<string | null>(null);
  const rangeAnchor = shallowRef<Readonly<{ id: string; scopeKey: string }> | null>(null);
  const frozenReason = shallowRef<string | null>(null);
  const revision = shallowRef(0);

  const isActive = computed(() => phase.value !== LAUNCHPAD_SELECTION_PHASE.IDLE);
  const isFrozen = computed(() => (
    phase.value === LAUNCHPAD_SELECTION_PHASE.COMMITTING ||
    Boolean(frozenReason.value)
  ));
  const selectedCount = computed(() => selectedIds.value.size);

  function publish(ids: Iterable<unknown>, nextPrimaryId: string | null = primaryId.value): void {
    const normalized = normalizeIds(ids);
    selectedIds.value = new Set(normalized);
    primaryId.value = nextPrimaryId !== null && normalized.includes(nextPrimaryId)
      ? nextPrimaryId
      : normalized[0] || null;
    revision.value += 1;
  }

  function begin(options: LaunchpadSelectionBeginOptions = {}): LaunchpadSelectionSnapshot {
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

  function replace(id: unknown, scope: LaunchpadSelectionScope | null = null): boolean {
    if (!isActive.value || isFrozen.value) return false;
    const normalized = normalizeIds([id]);
    const normalizedId = normalized[0];
    if (!normalizedId) return false;
    const normalizedScope = normalizeScope(scope);
    rangeAnchor.value = normalizedScope.key
      ? { id: normalizedId, scopeKey: normalizedScope.key }
      : null;
    publish(normalized, normalizedId);
    return true;
  }

  function toggle(id: unknown, options: LaunchpadSelectionToggleOptions = {}): boolean {
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

  function selectScope(scope: LaunchpadSelectionScope): boolean {
    if (!isActive.value || isFrozen.value) return false;
    const normalized = normalizeScope(scope);
    const firstId = normalized.orderedIds[0];
    if (!firstId) return false;
    const next = new Set(selectedIds.value);
    for (const id of normalized.orderedIds) next.add(id);
    rangeAnchor.value = {
      id: firstId,
      scopeKey: normalized.key,
    };
    publish(next, primaryId.value || firstId);
    return true;
  }

  function reconcile(
    pagesOrIds: readonly string[] | ReadonlyLaunchpadPages,
    options: Readonly<{ exitWhenEmpty?: boolean }> = {},
  ): string[] {
    const validIds = new Set(
      pagesOrIds.every((entry): entry is string => typeof entry === "string")
        ? normalizeIds(pagesOrIds)
        : collectLaunchpadAppIds(pagesOrIds),
    );
    const next = [...selectedIds.value].filter((id) => validIds.has(id));
    if (next.length !== selectedIds.value.size) publish(next);
    if (!next.length && options.exitWhenEmpty) clear();
    return next;
  }

  function beginCommit(): LaunchpadSelectionSnapshot | null {
    if (!isActive.value || isFrozen.value) return null;
    phase.value = LAUNCHPAD_SELECTION_PHASE.COMMITTING;
    return snapshot();
  }

  function finishCommit(options: Readonly<{ keepActive?: boolean }> = {}): boolean {
    if (phase.value !== LAUNCHPAD_SELECTION_PHASE.COMMITTING) return false;
    phase.value = selectedIds.value.size || options.keepActive
      ? LAUNCHPAD_SELECTION_PHASE.SELECTING
      : LAUNCHPAD_SELECTION_PHASE.IDLE;
    return true;
  }

  function freeze(reason: unknown = "busy"): boolean {
    if (!isActive.value || frozenReason.value) return false;
    frozenReason.value = String(reason || "busy");
    return true;
  }

  function unfreeze(reason: string | null = null): boolean {
    if (!frozenReason.value) return false;
    if (reason && frozenReason.value !== reason) return false;
    frozenReason.value = null;
    return true;
  }

  function isSelected(id: string): boolean {
    return selectedIds.value.has(id);
  }

  function snapshot(): LaunchpadSelectionSnapshot {
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
