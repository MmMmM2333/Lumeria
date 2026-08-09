function normalizePositiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeIds(ids) {
  return Array.from(new Set(
    (ids || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  ));
}

function getFolderPages(folder, folderPageSize) {
  const rawPages = Array.isArray(folder?.childPages)
    ? folder.childPages
    : [Array.isArray(folder?.children) ? folder.children : []];
  const pages = rawPages.map((page) => (page || []).filter(Boolean).map((item) => ({ ...item })));
  const compact = pages.filter((page) => page.length);
  if (compact.length) return compact;
  const children = Array.isArray(folder?.children) ? folder.children.filter(Boolean).map((item) => ({ ...item })) : [];
  if (!children.length) return [[]];
  const size = normalizePositiveInteger(folderPageSize, 1);
  const chunks = [];
  for (let index = 0; index < children.length; index += size) chunks.push(children.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

function withFolderPages(folder, pages) {
  const childPages = (pages || []).map((page) => (page || []).filter(Boolean).map((item) => ({ ...item })));
  while (childPages.length > 1 && childPages[childPages.length - 1].length === 0) childPages.pop();
  if (!childPages.length) childPages.push([]);
  return {
    ...folder,
    childPages,
    children: childPages.flatMap((page) => page.map((item) => ({ ...item }))),
  };
}

function cloneItem(item, folderPageSize) {
  if (!item) return null;
  if (item.type !== "folder") return { ...item };
  return withFolderPages({ ...item }, getFolderPages(item, folderPageSize));
}

function clonePages(pages, folderPageSize) {
  const next = (pages || []).map((page) => (page || []).filter(Boolean).map((item) => cloneItem(item, folderPageSize)));
  return next.length ? next : [[]];
}

function compactPages(pages) {
  const next = pages.length ? pages : [[]];
  while (next.length > 1 && next[next.length - 1].length === 0) next.pop();
  return next.length ? next : [[]];
}

function indexLayout(pages, folderPageSize) {
  const apps = new Map();
  const draggables = new Map();
  const folders = new Map();
  const order = [];
  const duplicates = new Set();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    for (let index = 0; index < pages[pageIndex].length; index += 1) {
      const item = pages[pageIndex][index];
      if (!item?.id) continue;
      if (item.type === "folder") {
        if (folders.has(item.id) || apps.has(item.id)) duplicates.add(item.id);
        const folderLocation = { index, item, kind: "desktop-folder", pageIndex };
        folders.set(item.id, folderLocation);
        draggables.set(item.id, folderLocation);
        order.push(item.id);
        const childPages = getFolderPages(item, folderPageSize);
        for (let folderPageIndex = 0; folderPageIndex < childPages.length; folderPageIndex += 1) {
          for (let childIndex = 0; childIndex < childPages[folderPageIndex].length; childIndex += 1) {
            const child = childPages[folderPageIndex][childIndex];
            if (!child?.id) continue;
            if (apps.has(child.id) || folders.has(child.id)) duplicates.add(child.id);
            apps.set(child.id, {
              folderId: item.id,
              folderPageIndex,
              index: childIndex,
              item: child,
              kind: "folder",
              ownerIndex: index,
              ownerPageIndex: pageIndex,
            });
            draggables.set(child.id, apps.get(child.id));
            order.push(child.id);
          }
        }
        continue;
      }
      if (apps.has(item.id) || folders.has(item.id)) duplicates.add(item.id);
      apps.set(item.id, { index, item, kind: "desktop", pageIndex });
      draggables.set(item.id, apps.get(item.id));
      order.push(item.id);
    }
  }
  return { apps, draggables, duplicates: [...duplicates], folders, order };
}

function rejected(reason, basePages, orderedDraggedIds = []) {
  return {
    affectedFolderIds: [],
    createdFolderId: null,
    emptiedFolderIds: [],
    nextPages: null,
    orderedDraggedIds,
    placements: [],
    projectedPages: null,
    reason,
    status: "rejected",
  };
}

function accepted(nextPages, details = {}) {
  return {
    affectedFolderIds: details.affectedFolderIds || [],
    createdFolderId: details.createdFolderId || null,
    emptiedFolderIds: details.emptiedFolderIds || [],
    nextPages,
    orderedDraggedIds: details.orderedDraggedIds || [],
    placements: details.placements || [],
    projectedPages: nextPages,
    reason: details.reason || null,
    status: details.status || "accepted",
  };
}

function removeDraggedItems(pages, removedIds, folderPageSize, preserveFolderIds = new Set()) {
  const emptiedFolderIds = [];
  const next = pages.map((page) => page.flatMap((item) => {
    if (removedIds.has(item.id)) return [];
    if (item.type === "app") return removedIds.has(item.id) ? [] : [{ ...item }];
    const childPages = getFolderPages(item, folderPageSize)
      .map((folderPage) => folderPage.filter((child) => !removedIds.has(child.id)).map((child) => ({ ...child })));
    const remainingCount = childPages.reduce((sum, folderPage) => sum + folderPage.length, 0);
    if (!remainingCount && !preserveFolderIds.has(item.id)) {
      emptiedFolderIds.push(item.id);
      return [];
    }
    return [withFolderPages(item, childPages)];
  }));
  return { emptiedFolderIds, pages: compactPages(next) };
}

function findTopLevel(pages, id) {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const index = pages[pageIndex].findIndex((item) => item?.id === id);
    if (index >= 0) return { index, item: pages[pageIndex][index], pageIndex };
  }
  return null;
}

function ensurePage(pages, pageIndex) {
  while (pages.length <= pageIndex) pages.push([]);
}

function makePlacements(orderedIds, index, target) {
  return orderedIds.map((id, offset) => ({
    id,
    order: offset,
    target: { ...target, index: index + offset },
  }));
}

function layoutsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function makeOrderedDraggedIds(layoutIndex, draggedIds, leadId) {
  const dragged = new Set(draggedIds);
  const ordered = [];
  if (leadId && dragged.has(leadId)) ordered.push(leadId);
  for (const id of layoutIndex.order) {
    if (dragged.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

function makeFolderItem(options, children, folderPageSize) {
  const childPages = [];
  for (let index = 0; index < children.length; index += folderPageSize) {
    childPages.push(children.slice(index, index + folderPageSize).map((item) => ({ ...item })));
  }
  return withFolderPages({
    id: options.makeFolderId(),
    name: options.folderName,
    type: "folder",
  }, childPages);
}

function resolveToolbarAnchor(layoutIndex, leadId, removedIds, emptiedFolderIds) {
  const lead = layoutIndex.apps.get(leadId);
  if (!lead) return null;
  if (lead.kind === "desktop") {
    return {
      originalIndex: lead.index,
      originalPageIndex: lead.pageIndex,
      type: "desktop-lead",
    };
  }
  return {
    folderId: lead.folderId,
    originalIndex: lead.ownerIndex,
    originalPageIndex: lead.ownerPageIndex,
    replaceFolder: emptiedFolderIds.includes(lead.folderId),
    type: "folder-lead",
  };
}

function resolveAdjustedAnchorIndex(basePages, pageIndex, originalIndex, removedIds, removedFolderIds) {
  const page = basePages[pageIndex] || [];
  let index = 0;
  for (let current = 0; current < originalIndex; current += 1) {
    const item = page[current];
    if (!item) continue;
    if (item.type === "app" && removedIds.has(item.id)) continue;
    if (item.type === "folder" && removedFolderIds.has(item.id)) continue;
    index += 1;
  }
  return index;
}

function addAppsToClosedFolder(folder, apps, folderPageSize) {
  const childPages = getFolderPages(folder, folderPageSize);
  let targetPageIndex = Math.max(0, childPages.length - 1);
  for (const app of apps) {
    if (childPages[targetPageIndex].length >= folderPageSize) {
      childPages.push([]);
      targetPageIndex += 1;
    }
    childPages[targetPageIndex].push({ ...app });
  }
  return withFolderPages(folder, childPages);
}

export function planGroupDrop(options = {}) {
  const folderPageSize = normalizePositiveInteger(options.folderPageSize, 1);
  const pageSize = normalizePositiveInteger(options.pageSize, 1);
  const basePages = clonePages(options.basePages, folderPageSize);
  const draggedIds = normalizeIds(options.draggedIds);
  const leadId = String(options.leadId || draggedIds[0] || "").trim();
  const intent = options.intent || { type: "invalid" };

  if (options.baseRevision !== options.currentRevision) return rejected("revision-stale", basePages);
  if (!draggedIds.length || !leadId || !draggedIds.includes(leadId)) return rejected("invalid-drag-payload", basePages);

  const layoutIndex = indexLayout(basePages, folderPageSize);
  if (layoutIndex.duplicates.length) return rejected("duplicate-layout-id", basePages);
  if (draggedIds.some((id) => !layoutIndex.draggables.has(id))) return rejected("missing-dragged-id", basePages);
  const orderedDraggedIds = makeOrderedDraggedIds(layoutIndex, draggedIds, leadId);
  const draggedItems = orderedDraggedIds.map((id) => cloneItem(layoutIndex.draggables.get(id).item, folderPageSize));
  const draggedFolderCount = draggedItems.reduce((count, item) => count + (item.type === "folder" ? 1 : 0), 0);
  if (draggedFolderCount && (draggedItems.length !== 1 || intent.type !== "desktop-slot")) {
    return rejected("folder-drag-intent", basePages, orderedDraggedIds);
  }
  if (intent.type === "invalid") return rejected(intent.reason || "invalid-target", basePages, orderedDraggedIds);
  if (intent.type === "same-placement") {
    return accepted(basePages, { orderedDraggedIds, reason: "same-placement", status: "noop" });
  }

  const removedIds = new Set(orderedDraggedIds);
  const preserveFolderIds = new Set(
    ["closed-folder", "open-folder-slot"].includes(intent.type) && intent.folderId
      ? [intent.folderId]
      : []
  );
  let removal = removeDraggedItems(basePages, removedIds, folderPageSize, preserveFolderIds);
  let nextPages = removal.pages;
  const affectedFolderIds = new Set();
  const placements = [];

  if (intent.type === "desktop-slot") {
    const targetPageIndex = Math.max(0, Math.floor(Number(intent.pageIndex) || 0));
    if (targetPageIndex > nextPages.length) {
      return rejected("desktop-page-missing", basePages, orderedDraggedIds);
    }
    if (
      targetPageIndex === nextPages.length &&
      nextPages[targetPageIndex - 1]?.length === 0
    ) {
      return rejected("desktop-page-missing", basePages, orderedDraggedIds);
    }
    ensurePage(nextPages, targetPageIndex);
    if (nextPages[targetPageIndex].length + draggedItems.length > pageSize) {
      return rejected("desktop-capacity", basePages, orderedDraggedIds);
    }
    const index = Math.max(0, Math.min(nextPages[targetPageIndex].length, Math.floor(Number(intent.index) || 0)));
    nextPages[targetPageIndex].splice(index, 0, ...draggedItems);
    placements.push(...makePlacements(orderedDraggedIds, index, {
      kind: "desktop",
      pageIndex: targetPageIndex,
    }));
  } else if (intent.type === "open-folder-slot") {
    const target = findTopLevel(nextPages, intent.folderId);
    if (!target || target.item.type !== "folder") return rejected("folder-missing", basePages, orderedDraggedIds);
    const originalTarget = layoutIndex.folders.get(intent.folderId);
    if (!originalTarget) return rejected("folder-missing", basePages, orderedDraggedIds);
    const originalChildPages = getFolderPages(originalTarget.item, folderPageSize);
    const requestedFolderPageIndex = Math.max(0, Math.floor(Number(intent.pageIndex) || 0));
    if (requestedFolderPageIndex > originalChildPages.length) {
      return rejected("folder-page-missing", basePages, orderedDraggedIds);
    }
    const emptiedPagesBeforeTarget = originalChildPages
      .slice(0, requestedFolderPageIndex)
      .reduce(
        (count, page) => count + (page.length > 0 && page.every((child) => removedIds.has(child.id)) ? 1 : 0),
        0
      );
    const folderPageIndex = Math.max(0, requestedFolderPageIndex - emptiedPagesBeforeTarget);
    const createsPage = requestedFolderPageIndex === originalChildPages.length;
    const lastOriginalPageRetainsItem = originalChildPages.at(-1)
      ?.some((child) => !removedIds.has(child.id)) === true;
    const childPages = getFolderPages(target.item, folderPageSize);
    const appendsPage = folderPageIndex === childPages.length;
    if (
      folderPageIndex > childPages.length ||
      (createsPage && intent.allowCreate !== true) ||
      (createsPage && !lastOriginalPageRetainsItem)
    ) {
      return rejected("folder-page-missing", basePages, orderedDraggedIds);
    }
    if (appendsPage) childPages.push([]);
    if (childPages[folderPageIndex].length + draggedItems.length > folderPageSize) {
      return rejected("folder-page-capacity", basePages, orderedDraggedIds);
    }
    const index = Math.max(0, Math.min(childPages[folderPageIndex].length, Math.floor(Number(intent.index) || 0)));
    childPages[folderPageIndex].splice(index, 0, ...draggedItems);
    nextPages[target.pageIndex][target.index] = withFolderPages(target.item, childPages);
    affectedFolderIds.add(target.item.id);
    placements.push(...makePlacements(orderedDraggedIds, index, {
      folderId: target.item.id,
      kind: "folder",
      pageIndex: folderPageIndex,
    }));
  } else if (intent.type === "closed-folder") {
    const target = findTopLevel(nextPages, intent.folderId);
    if (!target || target.item.type !== "folder") return rejected("folder-missing", basePages, orderedDraggedIds);
    const beforeCount = getFolderPages(target.item, folderPageSize).flat().length;
    nextPages[target.pageIndex][target.index] = addAppsToClosedFolder(target.item, draggedItems, folderPageSize);
    affectedFolderIds.add(target.item.id);
    placements.push(...orderedDraggedIds.map((id, offset) => ({
      id,
      order: offset,
      target: {
        folderId: target.item.id,
        index: beforeCount + offset,
        kind: "closed-folder",
      },
    })));
  } else if (intent.type === "app-folder-create") {
    const makeFolderId = typeof options.makeFolderId === "function"
      ? options.makeFolderId
      : () => "folder";
    const folderName = String(options.folderName || "New Folder");
    let anchorPageIndex;
    let anchorIndex;
    const folderChildren = [];
    const targetAppId = String(intent.targetAppId || "").trim();
    if (targetAppId) {
      if (removedIds.has(targetAppId)) return rejected("target-in-selection", basePages, orderedDraggedIds);
      const originalTarget = layoutIndex.apps.get(targetAppId);
      if (!originalTarget) return rejected("target-app-missing", basePages, orderedDraggedIds);
      if (originalTarget.kind !== "desktop") return rejected("nested-folder-not-supported", basePages, orderedDraggedIds);
      const targetAfterRemoval = findTopLevel(nextPages, targetAppId);
      if (!targetAfterRemoval || targetAfterRemoval.item.type !== "app") {
        return rejected("target-app-missing", basePages, orderedDraggedIds);
      }
      anchorPageIndex = targetAfterRemoval.pageIndex;
      anchorIndex = targetAfterRemoval.index;
      folderChildren.push({ ...targetAfterRemoval.item });
      nextPages[anchorPageIndex].splice(anchorIndex, 1);
    } else {
      const anchor = resolveToolbarAnchor(layoutIndex, leadId, removedIds, removal.emptiedFolderIds);
      if (!anchor) return rejected("folder-anchor-missing", basePages, orderedDraggedIds);
      anchorPageIndex = anchor.originalPageIndex;
      ensurePage(nextPages, anchorPageIndex);
      const emptiedFolderIds = new Set(removal.emptiedFolderIds);
      anchorIndex = resolveAdjustedAnchorIndex(
        basePages,
        anchorPageIndex,
        anchor.originalIndex,
        removedIds,
        emptiedFolderIds
      );
      if (anchor.type === "folder-lead" && !anchor.replaceFolder) anchorIndex += 1;
    }
    folderChildren.push(...draggedItems);
    if (nextPages[anchorPageIndex].length + 1 > pageSize) {
      return rejected("desktop-capacity", basePages, orderedDraggedIds);
    }
    const folderItem = makeFolderItem({ folderName, makeFolderId }, folderChildren, folderPageSize);
    nextPages[anchorPageIndex].splice(anchorIndex, 0, folderItem);
    affectedFolderIds.add(folderItem.id);
    placements.push(...folderChildren.map((item, index) => ({
      id: item.id,
      order: index,
      target: {
        folderId: folderItem.id,
        index,
        kind: "created-folder",
      },
    })));
    const compacted = compactPages(nextPages);
    return accepted(compacted, {
      affectedFolderIds: [...affectedFolderIds],
      createdFolderId: folderItem.id,
      emptiedFolderIds: removal.emptiedFolderIds,
      orderedDraggedIds,
      placements,
      status: layoutsEqual(compacted, basePages) ? "noop" : "accepted",
    });
  } else {
    return rejected("unsupported-intent", basePages, orderedDraggedIds);
  }

  nextPages = compactPages(nextPages);
  return accepted(nextPages, {
    affectedFolderIds: [...affectedFolderIds],
    emptiedFolderIds: removal.emptiedFolderIds,
    orderedDraggedIds,
    placements,
    reason: layoutsEqual(nextPages, basePages) ? "same-placement" : null,
    status: layoutsEqual(nextPages, basePages) ? "noop" : "accepted",
  });
}
