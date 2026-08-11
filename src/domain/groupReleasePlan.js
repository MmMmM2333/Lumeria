export const GROUP_RELEASE_MODE = Object.freeze({
  POINT_HANDOFF: "point-handoff",
  FOLDER_PREVIEW_SLOT: "folder-preview-slot",
  FOLDER_CENTER_ABSORB: "folder-center-absorb",
  CREATED_FOLDER: "created-folder",
  RETURN_TO_ORIGIN: "return-to-origin",
});

const PREVIEW_SLOT_LIMIT = 9;

function getPreviewSlotLimit(folderPageSize) {
  return Math.min(
    PREVIEW_SLOT_LIMIT,
    Math.max(0, Math.floor(Number(folderPageSize) || PREVIEW_SLOT_LIMIT))
  );
}

function clonePoint(point, fallback = { x: 0, y: 0 }) {
  return {
    x: Number.isFinite(Number(point?.x)) ? Number(point.x) : Number(fallback.x) || 0,
    y: Number.isFinite(Number(point?.y)) ? Number(point.y) : Number(fallback.y) || 0,
  };
}

function cloneVelocity(velocity) {
  return clonePoint(velocity, { x: 0, y: 0 });
}

function getFolderPages(folder, folderPageSize) {
  const rawPages = Array.isArray(folder?.childPages)
    ? folder.childPages
    : [Array.isArray(folder?.children) ? folder.children : []];
  const pages = rawPages.map((page) => (page || []).filter(Boolean));
  const compact = pages.filter((page) => page.length);
  if (compact.length) return compact;
  const children = Array.isArray(folder?.children) ? folder.children.filter(Boolean) : [];
  if (!children.length) return [[]];
  const size = Math.max(1, Math.floor(Number(folderPageSize) || 1));
  const chunks = [];
  for (let index = 0; index < children.length; index += size) {
    chunks.push(children.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}

function findTopLevelFolder(pages, folderId) {
  for (const page of pages || []) {
    const folder = (page || []).find((item) => item?.id === folderId && item.type === "folder");
    if (folder) return folder;
  }
  return null;
}

function getClosedFolderReleaseMode(basePages, target, folderPageSize) {
  const folder = findTopLevelFolder(basePages, target?.folderId);
  if (!folder) return GROUP_RELEASE_MODE.FOLDER_CENTER_ABSORB;
  const pages = getFolderPages(folder, folderPageSize);
  const beforeCount = pages.reduce((count, page) => count + page.length, 0);
  const previewLimit = getPreviewSlotLimit(folderPageSize);
  const canUsePreview = pages.length === 1 && beforeCount < previewLimit;
  const targetIndex = Number(target?.index);
  return canUsePreview && Number.isFinite(targetIndex) && targetIndex >= 0 && targetIndex < previewLimit
    ? GROUP_RELEASE_MODE.FOLDER_PREVIEW_SLOT
    : GROUP_RELEASE_MODE.FOLDER_CENTER_ABSORB;
}

function resolvePlacement(placements, entry) {
  const byId = placements instanceof Map
    ? placements
    : new Map((placements || []).map((placement) => [placement.id, placement]));
  const direct = byId.get(entry?.item?.id);
  if (direct) return direct;
  for (const memberId of entry?.memberIds || []) {
    const memberPlacement = byId.get(memberId);
    if (memberPlacement) return memberPlacement;
  }
  return null;
}

function resolveMode(placement, options) {
  const target = placement?.target;
  if (!target) return options.returnToOrigin
    ? GROUP_RELEASE_MODE.RETURN_TO_ORIGIN
    : GROUP_RELEASE_MODE.POINT_HANDOFF;
  if (target.kind === "closed-folder") {
    return getClosedFolderReleaseMode(options.basePages, target, options.folderPageSize);
  }
  if (target.kind === "created-folder") {
    const targetIndex = Number(target.index);
    return Number.isFinite(targetIndex) && targetIndex >= 0 && targetIndex < getPreviewSlotLimit(options.folderPageSize)
      ? GROUP_RELEASE_MODE.CREATED_FOLDER
      : GROUP_RELEASE_MODE.FOLDER_CENTER_ABSORB;
  }
  if (target.kind === "desktop" || target.kind === "folder") return GROUP_RELEASE_MODE.POINT_HANDOFF;
  return options.returnToOrigin
    ? GROUP_RELEASE_MODE.RETURN_TO_ORIGIN
    : GROUP_RELEASE_MODE.POINT_HANDOFF;
}

function makeTarget(placement, mode) {
  const target = placement?.target || {};
  if (mode === GROUP_RELEASE_MODE.FOLDER_PREVIEW_SLOT) {
    return {
      expectedChildId: placement?.id || null,
      folderId: target.folderId || null,
      kind: target.kind || "closed-folder",
      slotIndex: Number.isFinite(Number(target.index)) ? Number(target.index) : null,
    };
  }
  if (mode === GROUP_RELEASE_MODE.FOLDER_CENTER_ABSORB) {
    return { folderId: target.folderId || null, kind: target.kind || "closed-folder" };
  }
  if (mode === GROUP_RELEASE_MODE.CREATED_FOLDER) {
    return {
      expectedChildId: placement?.id || null,
      folderId: target.folderId || null,
      kind: "created-folder",
      slotIndex: Number.isFinite(Number(target.index)) ? Number(target.index) : null,
    };
  }
  return {
    area: target.kind === "folder" ? "folder" : "desktop",
    folderId: target.folderId || null,
    id: placement?.id || null,
    index: Number.isFinite(Number(target.index)) ? Number(target.index) : null,
    kind: target.kind || null,
    pageIndex: Number.isFinite(Number(target.pageIndex)) ? Number(target.pageIndex) : null,
  };
}

/**
 * Builds the single semantic release description consumed by the Pixi layer.
 * It intentionally contains no DOM rectangles or Pixi objects; those are
 * resolved live by the rendering adapter after the data commit.
 */
export function makeGroupReleasePlan(options = {}) {
  const entries = Array.isArray(options.entries) ? options.entries : [];
  const placements = options.placements || [];
  const fallbackPointer = clonePoint(options.pointer);
  const fallbackOffset = clonePoint(options.offset, { x: 0, y: 0 });
  const velocity = cloneVelocity(options.velocity);
  const releaseKey = String(options.key || "group-release");

  return {
    entries: entries.map((entry, index) => {
      const placement = resolvePlacement(placements, entry);
      const mode = resolveMode(placement, options);
      const fallbackPoint = options.fallbackById?.[entry?.item?.id] || options.fallbackPoint;
      return {
        delayMs: Math.max(0, Number(entry?.delayMs) || 0),
        id: entry?.item?.id || null,
        memberIds: [...(entry?.memberIds || (entry?.item?.id ? [entry.item.id] : []))],
        mode,
        order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : index,
        start: {
          offset: { ...fallbackOffset },
          pointer: { ...fallbackPointer },
        },
        startAlpha: entry?.releaseStart?.alpha != null &&
          Number.isFinite(Number(entry.releaseStart.alpha))
          ? Math.max(0, Number(entry.releaseStart.alpha))
          : null,
        fallback: clonePoint(fallbackPoint, fallbackPointer),
        originAlpha: Number.isFinite(Number(entry?.originAlpha))
          ? Math.max(0, Number(entry.originAlpha))
          : entry?.originKind === "folder-hidden" ? 0 : 1,
        originScale: Math.max(0.01, Number(entry?.originScale) || 1),
        target: makeTarget(placement, mode),
        velocity: { ...velocity },
      };
    }).filter((entry) => entry.id),
    key: releaseKey,
    status: "pending",
  };
}
