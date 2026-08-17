function normalizePositiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeIndex(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeIds(ids) {
  return Array.from(new Set(
    (ids || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  ));
}

function getFolderPages(folder, folderPageSize) {
  if (Array.isArray(folder?.childPages)) {
    const pages = folder.childPages.map((page) => (
      (page || []).filter(Boolean).map((item) => cloneItem(item, folderPageSize))
    ));
    return pages.length ? pages : [[]];
  }
  const children = [];
  const pages = [];
  for (let index = 0; index < children.length; index += folderPageSize) {
    pages.push(children.slice(index, index + folderPageSize));
  }
  return pages.length ? pages : [[]];
}

function withFolderPages(folder, pages, options = {}) {
  let childPages = (pages || []).map((page) => (
    (page || []).filter(Boolean).map((item) => cloneItem(item, options.folderPageSize || 1))
  ));
  if (options.keepEmptyPages !== true) childPages = childPages.filter((page) => page.length > 0);
  if (!childPages.length) childPages = [[]];
  return {
    ...folder,
    childPages,
  };
}

function cloneItem(item, folderPageSize) {
  if (!item) return null;
  if (item.type !== "folder") return { ...item };
  return withFolderPages(
    { ...item },
    getFolderPages(item, folderPageSize),
    { folderPageSize, keepEmptyPages: true }
  );
}

function clonePages(pages, folderPageSize) {
  const cloned = (pages || []).map((page) => (
    (page || []).filter(Boolean).map((item) => cloneItem(item, folderPageSize))
  ));
  return cloned.length ? cloned : [[]];
}

function sourceOf(location) {
  if (!location) return null;
  if (location.kind === "desktop") {
    return {
      index: location.index,
      kind: "desktop",
      pageIndex: location.pageIndex,
    };
  }
  return {
    flatIndex: location.flatIndex,
    folderId: location.folderId,
    folderPageIndex: location.folderPageIndex,
    index: location.index,
    kind: "folder",
    ownerIndex: location.ownerIndex,
    ownerPageIndex: location.ownerPageIndex,
  };
}

function indexLayout(pages, folderPageSize) {
  const duplicates = new Set();
  const folders = new Map();
  const items = new Map();
  let sourceOrder = 0;
  const register = (id, location) => {
    if (items.has(id)) duplicates.add(id);
    items.set(id, { ...location, sourceOrder });
    sourceOrder += 1;
  };

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    for (let index = 0; index < pages[pageIndex].length; index += 1) {
      const item = pages[pageIndex][index];
      if (!item?.id) continue;
      const desktopLocation = { index, item, kind: "desktop", pageIndex };
      register(item.id, desktopLocation);
      if (item.type !== "folder") continue;
      folders.set(item.id, { ...desktopLocation, sourceOrder: items.get(item.id).sourceOrder });
      const childPages = getFolderPages(item, folderPageSize);
      let flatIndex = 0;
      for (let folderPageIndex = 0; folderPageIndex < childPages.length; folderPageIndex += 1) {
        for (let childIndex = 0; childIndex < childPages[folderPageIndex].length; childIndex += 1) {
          const child = childPages[folderPageIndex][childIndex];
          if (!child?.id) continue;
          register(child.id, {
            flatIndex,
            folderId: item.id,
            folderPageIndex,
            index: childIndex,
            item: child,
            kind: "folder",
            ownerIndex: index,
            ownerPageIndex: pageIndex,
          });
          flatIndex += 1;
        }
      }
    }
  }
  return { duplicates: [...duplicates], folders, items };
}

function compactIndexedPages(pages, preservedIndex = null) {
  const nextPages = [];
  const pageMap = new Map();
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] || [];
    if (!page.length && index !== preservedIndex) continue;
    pageMap.set(index, nextPages.length);
    nextPages.push(page);
  }
  if (!nextPages.length) {
    nextPages.push([]);
    if (preservedIndex === 0) pageMap.set(0, 0);
  }
  return { pageMap, pages: nextPages };
}

function removeSelectedItems(basePages, selectedIds, folderPageSize, options = {}) {
  const affectedFolderIds = new Set();
  const emptiedFolderIds = [];
  const folderPageMaps = new Map();
  const removedPages = basePages.map((page) => page.flatMap((item) => {
    if (selectedIds.has(item.id)) return [];
    if (item.type !== "folder") return [{ ...item }];

    const originalPages = getFolderPages(item, folderPageSize);
    let changed = false;
    const childPages = originalPages.map((folderPage) => folderPage.flatMap((child) => {
      if (!selectedIds.has(child.id)) return [{ ...child }];
      changed = true;
      return [];
    }));
    if (!changed) return [cloneItem(item, folderPageSize)];

    affectedFolderIds.add(item.id);
    const preservedPageIndex = options.preserveFolderPage?.folderId === item.id
      ? options.preserveFolderPage.folderPageIndex
      : null;
    const compacted = compactIndexedPages(childPages, preservedPageIndex);
    folderPageMaps.set(item.id, compacted.pageMap);
    const remainingCount = compacted.pages.reduce((count, folderPage) => count + folderPage.length, 0);
    if (!remainingCount && !options.preserveFolderIds?.has(item.id)) {
      emptiedFolderIds.push(item.id);
      return [];
    }
    return [withFolderPages(item, compacted.pages, {
      folderPageSize,
      keepEmptyPages: preservedPageIndex != null,
    })];
  }));
  const compacted = compactIndexedPages(removedPages, options.preserveDesktopPageIndex ?? null);
  return {
    affectedFolderIds,
    desktopPageMap: compacted.pageMap,
    emptiedFolderIds,
    folderPageMaps,
    pages: compacted.pages,
  };
}

function ensurePage(pages, pageIndex) {
  while (pages.length <= pageIndex) pages.push([]);
}

function cascadePages(pages, startPageIndex, pageSize) {
  for (let pageIndex = startPageIndex; pageIndex < pages.length; pageIndex += 1) {
    if (pages[pageIndex].length <= pageSize) continue;
    const overflow = pages[pageIndex].splice(pageSize);
    ensurePage(pages, pageIndex + 1);
    pages[pageIndex + 1].unshift(...overflow);
  }
}

function findTopLevel(pages, id) {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const index = pages[pageIndex].findIndex((item) => item?.id === id);
    if (index >= 0) return { index, item: pages[pageIndex][index], pageIndex };
  }
  return null;
}

function makeFolderItem({ children, folderId, folderName, folderPageSize }) {
  const childPages = [];
  for (let index = 0; index < children.length; index += folderPageSize) {
    childPages.push(children.slice(index, index + folderPageSize).map((item) => ({ ...item })));
  }
  return withFolderPages({
    id: folderId,
    name: folderName,
    type: "folder",
  }, childPages, { folderPageSize });
}

function layoutSignature(pages, folderPageSize) {
  return JSON.stringify((pages || []).map((page) => page.map((item) => (
    item.type === "folder"
      ? [item.id, "folder", getFolderPages(item, folderPageSize).map((folderPage) => folderPage.map((child) => child.id))]
      : [item.id, "app"]
  ))));
}

function makeEmptyEffects() {
  return {
    affectedFolderIds: [],
    createdFolderId: null,
    emptiedFolderIds: [],
    finalDesktopPageIndex: null,
    finalFolderPageIndex: null,
    finalOpenFolderId: null,
    folderCreateTargetId: null,
  };
}

function rejected(reason, details = {}) {
  return {
    effects: { ...makeEmptyEffects(), ...(details.effects || {}) },
    members: details.members || [],
    nextPages: null,
    orderedSelectedIds: details.orderedSelectedIds || [],
    reason,
    status: "rejected",
  };
}

function adjustedTopLevelIndex(basePage, originalIndex, removedIds, emptiedFolderIds) {
  const emptied = new Set(emptiedFolderIds);
  let index = 0;
  for (let current = 0; current < originalIndex; current += 1) {
    const item = basePage[current];
    if (!item || removedIds.has(item.id) || emptied.has(item.id)) continue;
    index += 1;
  }
  return index;
}

function destinationMembers(memberDescriptors, nextPages, folderPageSize) {
  const finalIndex = indexLayout(nextPages, folderPageSize);
  return memberDescriptors.map((descriptor) => {
    const destination = finalIndex.items.get(descriptor.id);
    if (!destination) throw new Error(`Group transfer planner lost member: ${descriptor.id}`);
    return {
      destination: sourceOf(destination),
      id: descriptor.id,
      item: cloneItem(descriptor.item, folderPageSize),
      role: descriptor.role,
      selected: descriptor.selected,
      source: sourceOf(descriptor.sourceLocation),
      sourceOrder: descriptor.sourceLocation.sourceOrder,
    };
  });
}

function normalizeIntent(intent) {
  const type = String(intent?.type || "invalid");
  if (type === "desktop-slot") {
    return { index: normalizeIndex(intent.index), pageIndex: normalizeIndex(intent.pageIndex), type };
  }
  if (type === "folder-slot") {
    return {
      folderId: String(intent.folderId || "").trim(),
      folderPageIndex: normalizeIndex(intent.folderPageIndex),
      index: normalizeIndex(intent.index),
      type,
    };
  }
  if (type === "folder-thumbnail") {
    return { folderId: String(intent.folderId || "").trim(), type };
  }
  if (type === "application") {
    return { targetAppId: String(intent.targetAppId || "").trim(), type };
  }
  if (type === "toolbar-folder-create") {
    return { anchorId: String(intent.anchorId || "").trim(), type };
  }
  return { reason: String(intent?.reason || "invalid-target"), type: "invalid" };
}

export function planGroupTransfer(options = {}) {
  const folderPageSize = normalizePositiveInteger(options.folderPageSize, 1);
  const pageSize = normalizePositiveInteger(options.pageSize, 1);
  const basePages = clonePages(options.basePages, folderPageSize);
  const selectedIds = normalizeIds(options.selectedIds);
  const intent = normalizeIntent(options.intent);

  if (options.baseRevision !== options.currentRevision) return rejected("revision-stale");
  if (!selectedIds.length) return rejected("invalid-selection");

  const baseIndex = indexLayout(basePages, folderPageSize);
  if (baseIndex.duplicates.length) return rejected("duplicate-layout-id");
  if (selectedIds.some((id) => !baseIndex.items.has(id))) return rejected("missing-selected-id");

  const selectedLocations = selectedIds
    .map((id) => baseIndex.items.get(id))
    .sort((left, right) => left.sourceOrder - right.sourceOrder);
  const orderedSelectedIds = selectedLocations.map((location) => location.item.id);
  const leadId = String(options.leadId || orderedSelectedIds[0] || "").trim();
  if (!leadId || !selectedIds.includes(leadId)) {
    return rejected("invalid-lead", { orderedSelectedIds });
  }
  const selectedFolderCount = selectedLocations.filter((location) => location.item.type === "folder").length;
  if (selectedFolderCount && (selectedLocations.length !== 1 || intent.type !== "desktop-slot")) {
    return rejected("folder-drag-intent", { orderedSelectedIds });
  }
  if (intent.type === "invalid") return rejected(intent.reason, { orderedSelectedIds });
  if (
    selectedLocations.some((location) => location.item.type !== "app") &&
    intent.type !== "desktop-slot"
  ) {
    return rejected("folder-drag-intent", { orderedSelectedIds });
  }

  const selectedSet = new Set(orderedSelectedIds);
  const preserveFolderIds = new Set();
  let preserveFolderPage = null;
  let preserveDesktopPageIndex = null;
  let toolbarAnchor = null;

  if (intent.type === "desktop-slot") {
    if (intent.pageIndex > basePages.length) return rejected("desktop-page-missing", { orderedSelectedIds });
    if (intent.pageIndex < basePages.length) preserveDesktopPageIndex = intent.pageIndex;
  } else if (intent.type === "folder-slot") {
    const targetFolder = baseIndex.folders.get(intent.folderId);
    if (!targetFolder) return rejected("folder-missing", { orderedSelectedIds });
    const originalPages = getFolderPages(targetFolder.item, folderPageSize);
    if (intent.folderPageIndex > originalPages.length) {
      return rejected("folder-page-missing", { orderedSelectedIds });
    }
    preserveFolderIds.add(intent.folderId);
    if (intent.folderPageIndex < originalPages.length) {
      preserveFolderPage = { folderId: intent.folderId, folderPageIndex: intent.folderPageIndex };
    }
  } else if (intent.type === "folder-thumbnail") {
    if (!baseIndex.folders.has(intent.folderId)) return rejected("folder-missing", { orderedSelectedIds });
    preserveFolderIds.add(intent.folderId);
  } else if (intent.type === "application") {
    const target = baseIndex.items.get(intent.targetAppId);
    if (!target || target.item.type !== "app") return rejected("target-app-missing", { orderedSelectedIds });
    if (target.kind !== "desktop") return rejected("nested-folder-not-supported", { orderedSelectedIds });
    if (selectedSet.has(intent.targetAppId)) return rejected("target-in-selection", { orderedSelectedIds });
  } else if (intent.type === "toolbar-folder-create") {
    const anchorId = intent.anchorId || orderedSelectedIds[0];
    toolbarAnchor = baseIndex.items.get(anchorId);
    if (!toolbarAnchor || !selectedSet.has(anchorId) || toolbarAnchor.item.type !== "app") {
      return rejected("folder-anchor-missing", { orderedSelectedIds });
    }
    preserveDesktopPageIndex = toolbarAnchor.kind === "desktop"
      ? toolbarAnchor.pageIndex
      : toolbarAnchor.ownerPageIndex;
  }

  const removal = removeSelectedItems(basePages, selectedSet, folderPageSize, {
    preserveDesktopPageIndex,
    preserveFolderIds,
    preserveFolderPage,
  });
  let nextPages = removal.pages;
  const affectedFolderIds = new Set(removal.affectedFolderIds);
  const memberDescriptors = selectedLocations.map((sourceLocation) => ({
    id: sourceLocation.item.id,
    item: sourceLocation.item,
    role: "selected",
    selected: true,
    sourceLocation,
  }));
  const effects = makeEmptyEffects();
  let folderCreateTargetId = null;

  if (intent.type === "desktop-slot") {
    let targetPageIndex;
    if (intent.pageIndex === basePages.length) {
      targetPageIndex = nextPages.length;
      ensurePage(nextPages, targetPageIndex);
    } else {
      targetPageIndex = removal.desktopPageMap.get(intent.pageIndex);
      if (targetPageIndex == null) return rejected("desktop-page-missing", { orderedSelectedIds });
    }
    const index = Math.min(intent.index, nextPages[targetPageIndex].length);
    nextPages[targetPageIndex].splice(
      index,
      0,
      ...selectedLocations.map((location) => cloneItem(location.item, folderPageSize))
    );
    cascadePages(nextPages, targetPageIndex, pageSize);
    effects.finalDesktopPageIndex = targetPageIndex;
  } else if (intent.type === "folder-slot") {
    const target = findTopLevel(nextPages, intent.folderId);
    if (!target || target.item.type !== "folder") return rejected("folder-missing", { orderedSelectedIds });
    const originalTarget = baseIndex.folders.get(intent.folderId);
    const originalPages = getFolderPages(originalTarget.item, folderPageSize);
    let folderPages = getFolderPages(target.item, folderPageSize);
    let targetFolderPageIndex;
    if (intent.folderPageIndex === originalPages.length) {
      targetFolderPageIndex = folderPages.length;
      ensurePage(folderPages, targetFolderPageIndex);
    } else {
      targetFolderPageIndex = removal.folderPageMaps.get(intent.folderId)?.get(intent.folderPageIndex);
      if (targetFolderPageIndex == null) {
        targetFolderPageIndex = intent.folderPageIndex;
      }
      ensurePage(folderPages, targetFolderPageIndex);
    }
    const index = Math.min(intent.index, folderPages[targetFolderPageIndex].length);
    folderPages[targetFolderPageIndex].splice(
      index,
      0,
      ...selectedLocations.map((location) => cloneItem(location.item, folderPageSize))
    );
    cascadePages(folderPages, targetFolderPageIndex, folderPageSize);
    nextPages[target.pageIndex][target.index] = withFolderPages(target.item, folderPages, { folderPageSize });
    affectedFolderIds.add(intent.folderId);
    effects.finalDesktopPageIndex = target.pageIndex;
    effects.finalFolderPageIndex = targetFolderPageIndex;
    effects.finalOpenFolderId = intent.folderId;
  } else if (intent.type === "folder-thumbnail") {
    const target = findTopLevel(nextPages, intent.folderId);
    if (!target || target.item.type !== "folder") return rejected("folder-missing", { orderedSelectedIds });
    const folderPages = getFolderPages(target.item, folderPageSize).filter((page) => page.length > 0);
    if (!folderPages.length) folderPages.push([]);
    const targetFolderPageIndex = folderPages.length - 1;
    folderPages[targetFolderPageIndex].push(
      ...selectedLocations.map((location) => cloneItem(location.item, folderPageSize))
    );
    cascadePages(folderPages, targetFolderPageIndex, folderPageSize);
    nextPages[target.pageIndex][target.index] = withFolderPages(target.item, folderPages, { folderPageSize });
    affectedFolderIds.add(intent.folderId);
    effects.finalDesktopPageIndex = target.pageIndex;
  } else if (intent.type === "application") {
    const target = findTopLevel(nextPages, intent.targetAppId);
    if (!target || target.item.type !== "app") return rejected("target-app-missing", { orderedSelectedIds });
    const folderId = typeof options.makeFolderId === "function"
      ? String(options.makeFolderId() || "").trim()
      : "";
    if (!folderId) return rejected("folder-id-missing", { orderedSelectedIds });
    if (baseIndex.items.has(folderId)) return rejected("folder-id-collision", { orderedSelectedIds });
    const targetSource = baseIndex.items.get(intent.targetAppId);
    memberDescriptors.unshift({
      id: targetSource.item.id,
      item: targetSource.item,
      role: "folder-create-target",
      selected: false,
      sourceLocation: targetSource,
    });
    const children = [target.item, ...selectedLocations.map((location) => location.item)];
    nextPages[target.pageIndex].splice(target.index, 1, makeFolderItem({
      children,
      folderId,
      folderName: String(options.folderName || "New Folder"),
      folderPageSize,
    }));
    affectedFolderIds.add(folderId);
    effects.createdFolderId = folderId;
    effects.finalDesktopPageIndex = target.pageIndex;
    folderCreateTargetId = intent.targetAppId;
  } else if (intent.type === "toolbar-folder-create") {
    const folderId = typeof options.makeFolderId === "function"
      ? String(options.makeFolderId() || "").trim()
      : "";
    if (!folderId) return rejected("folder-id-missing", { orderedSelectedIds });
    if (baseIndex.items.has(folderId)) return rejected("folder-id-collision", { orderedSelectedIds });
    let targetPageIndex;
    let targetIndex;
    if (toolbarAnchor.kind === "desktop") {
      targetPageIndex = removal.desktopPageMap.get(toolbarAnchor.pageIndex);
      targetIndex = adjustedTopLevelIndex(
        basePages[toolbarAnchor.pageIndex],
        toolbarAnchor.index,
        selectedSet,
        removal.emptiedFolderIds
      );
    } else {
      const remainingSourceFolder = findTopLevel(nextPages, toolbarAnchor.folderId);
      if (remainingSourceFolder) {
        targetPageIndex = remainingSourceFolder.pageIndex;
        targetIndex = remainingSourceFolder.index + 1;
      } else {
        targetPageIndex = removal.desktopPageMap.get(toolbarAnchor.ownerPageIndex);
        targetIndex = adjustedTopLevelIndex(
          basePages[toolbarAnchor.ownerPageIndex],
          toolbarAnchor.ownerIndex,
          selectedSet,
          removal.emptiedFolderIds
        );
      }
    }
    if (targetPageIndex == null) return rejected("folder-anchor-missing", { orderedSelectedIds });
    nextPages[targetPageIndex].splice(targetIndex, 0, makeFolderItem({
      children: selectedLocations.map((location) => location.item),
      folderId,
      folderName: String(options.folderName || "New Folder"),
      folderPageSize,
    }));
    cascadePages(nextPages, targetPageIndex, pageSize);
    affectedFolderIds.add(folderId);
    effects.createdFolderId = folderId;
    effects.finalDesktopPageIndex = targetPageIndex;
  }

  const compacted = compactIndexedPages(nextPages).pages;
  nextPages = compacted.map((page) => page.map((item) => (
    item.type === "folder"
      ? withFolderPages(item, getFolderPages(item, folderPageSize), { folderPageSize })
      : { ...item }
  )));
  const finalIndex = indexLayout(nextPages, folderPageSize);
  if (effects.createdFolderId) {
    const created = finalIndex.folders.get(effects.createdFolderId);
    effects.finalDesktopPageIndex = created?.pageIndex ?? effects.finalDesktopPageIndex;
  } else if (intent.type === "folder-thumbnail") {
    effects.finalDesktopPageIndex = finalIndex.folders.get(intent.folderId)?.pageIndex ?? effects.finalDesktopPageIndex;
  } else if (intent.type === "folder-slot") {
    effects.finalDesktopPageIndex = finalIndex.folders.get(intent.folderId)?.pageIndex ?? effects.finalDesktopPageIndex;
  }
  effects.affectedFolderIds = [...affectedFolderIds];
  effects.emptiedFolderIds = [...removal.emptiedFolderIds];
  effects.folderCreateTargetId = folderCreateTargetId;

  const members = destinationMembers(memberDescriptors, nextPages, folderPageSize);
  const status = layoutSignature(nextPages, folderPageSize) === layoutSignature(basePages, folderPageSize)
    ? "noop"
    : "accepted";
  return {
    effects,
    members,
    nextPages,
    orderedSelectedIds,
    reason: status === "noop" ? "same-placement" : null,
    status,
  };
}
