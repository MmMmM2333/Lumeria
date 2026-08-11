export const GROUP_RELEASE_START_KIND = Object.freeze({
  CURRENT_POSE: "current-pose",
  SOURCE_ORIGIN: "source-origin",
  STACK_TAIL: "stack-tail",
});

export const GROUP_RELEASE_ROLE = Object.freeze({
  FOLDER_CREATE_TARGET: "folder-create-target",
  LEAD: "lead",
  MEMBER: "member",
});

function normalizePositiveInteger(value, fallback = 1) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clonePoint(point, fallback = { x: 0, y: 0 }) {
  return {
    x: Number.isFinite(Number(point?.x)) ? Number(point.x) : Number(fallback.x) || 0,
    y: Number.isFinite(Number(point?.y)) ? Number(point.y) : Number(fallback.y) || 0,
  };
}

function entryId(entry) {
  return entry?.item?.id || null;
}

function indexEntries(entries) {
  const indexed = new Map();
  for (const entry of entries || []) {
    const id = entryId(entry);
    if (id && !indexed.has(id)) indexed.set(id, entry);
  }
  return indexed;
}

function releaseVisibilityPriority(entry) {
  switch (entry?.originKind) {
    case "lead":
      return 0;
    case "visible-desktop":
    case "open-folder-visible":
      return 1;
    case "folder-preview":
    case "count-only":
      return 2;
    case "desktop-page":
    case "folder-page":
      return 3;
    case "folder-hidden":
      return 4;
    default:
      return 2;
  }
}

function prioritizeReleaseCandidates(entries) {
  return (entries || [])
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) =>
      releaseVisibilityPriority(left.entry) - releaseVisibilityPriority(right.entry) ||
      left.index - right.index
    )
    .map((candidate) => candidate.entry);
}

function makeExactEntry(entry, releaseRole, releaseStart) {
  const id = entryId(entry);
  return {
    ...entry,
    bundleCount: 1,
    memberIds: id ? [id] : [],
    releaseRole,
    releaseStart,
  };
}

export function resolveGroupReleaseVisualLimit(options = {}) {
  const rows = normalizePositiveInteger(options.gridRows, 1);
  const cols = normalizePositiveInteger(options.gridCols, 1);
  const desktopPageSize = rows * cols;
  const folderPageSize = normalizePositiveInteger(options.folderPageSize, 1);
  return Math.max(1, desktopPageSize, folderPageSize);
}

/**
 * Expands the bounded drag representatives into the release population.
 * Existing representative ids remain first and in the same order so their
 * pooled Pixi nodes can continue from the current pose. Additional semantic
 * members enter from an invisible stack-tail pose. An app-on-app target is
 * reserved as a final, lower visual instead of replacing a selected member.
 */
export function makeGroupReleasePopulation(options = {}) {
  const allEntries = Array.isArray(options.allEntries) ? options.allEntries : [];
  const dragEntries = Array.isArray(options.dragEntries) ? options.dragEntries : [];
  const exactById = indexEntries(allEntries);
  const targetEntry = entryId(options.targetEntry) ? options.targetEntry : null;
  const targetId = entryId(targetEntry);
  const targetIsAdditional = Boolean(targetId && !exactById.has(targetId));
  const minimumContinuitySize = dragEntries.length + (targetIsAdditional ? 1 : 0);
  const visualLimit = Math.max(
    minimumContinuitySize,
    normalizePositiveInteger(options.visualLimit, minimumContinuitySize || 1)
  );
  const memberLimit = Math.max(0, visualLimit - (targetIsAdditional ? 1 : 0));
  const leadId = options.leadId || entryId(dragEntries[0]) || entryId(allEntries[0]);
  const spawnPoint = clonePoint(options.spawnPoint);
  const releaseEntries = [];
  const selectedIds = new Set();

  const appendMember = (source, releaseStart) => {
    const id = entryId(source);
    if (!id || selectedIds.has(id) || releaseEntries.length >= memberLimit) return false;
    selectedIds.add(id);
    releaseEntries.push(makeExactEntry(
      source,
      id === leadId ? GROUP_RELEASE_ROLE.LEAD : GROUP_RELEASE_ROLE.MEMBER,
      releaseStart
    ));
    return true;
  };

  for (const dragEntry of dragEntries) {
    const id = entryId(dragEntry);
    appendMember(exactById.get(id) || dragEntry, {
      kind: GROUP_RELEASE_START_KIND.CURRENT_POSE,
    });
  }

  for (const entry of prioritizeReleaseCandidates(allEntries)) {
    if (releaseEntries.length >= memberLimit) break;
    appendMember(entry, {
      alpha: 0,
      kind: GROUP_RELEASE_START_KIND.STACK_TAIL,
      point: { ...spawnPoint },
      scale: 0.72,
    });
  }

  if (targetEntry && !selectedIds.has(targetId) && releaseEntries.length < visualLimit) {
    selectedIds.add(targetId);
    releaseEntries.push(makeExactEntry(
      targetEntry,
      GROUP_RELEASE_ROLE.FOLDER_CREATE_TARGET,
      {
        alpha: 1,
        kind: GROUP_RELEASE_START_KIND.SOURCE_ORIGIN,
        point: clonePoint(targetEntry.origin, spawnPoint),
        scale: Math.max(0.01, Number(targetEntry.originScale) || 1),
      }
    ));
  }

  return releaseEntries;
}
