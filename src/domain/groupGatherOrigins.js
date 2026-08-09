function normalizePositiveInteger(value, fallback = 1) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function centerOfRect(rect, fallback) {
  if (!rect) return { ...fallback };
  return {
    x: Number(rect.left) + Number(rect.width) / 2,
    y: Number(rect.top) + Number(rect.height) / 2,
  };
}

function getFolderPages(folder) {
  if (Array.isArray(folder?.childPages)) return folder.childPages;
  return [Array.isArray(folder?.children) ? folder.children : []];
}

export function indexGroupDragSources(pages) {
  const apps = new Map();
  const order = [];
  for (let pageIndex = 0; pageIndex < (pages || []).length; pageIndex += 1) {
    const page = pages[pageIndex] || [];
    for (let index = 0; index < page.length; index += 1) {
      const item = page[index];
      if (!item?.id) continue;
      if (item.type !== "folder") {
        apps.set(item.id, {
          index,
          item,
          kind: "desktop",
          pageIndex,
        });
        order.push(item.id);
        continue;
      }
      apps.set(item.id, {
        index,
        item,
        kind: "desktop",
        pageIndex,
      });
      order.push(item.id);
      const childPages = getFolderPages(item);
      let flatIndex = 0;
      for (let folderPageIndex = 0; folderPageIndex < childPages.length; folderPageIndex += 1) {
        const folderPage = childPages[folderPageIndex] || [];
        for (let childIndex = 0; childIndex < folderPage.length; childIndex += 1) {
          const child = folderPage[childIndex];
          if (!child?.id) continue;
          apps.set(child.id, {
            childIndex,
            flatIndex,
            folderId: item.id,
            folderPageIndex,
            item: child,
            kind: "folder",
            ownerIndex: index,
            ownerPageIndex: pageIndex,
          });
          order.push(child.id);
          flatIndex += 1;
        }
      }
    }
  }
  return { apps, order };
}

function makeCrossPageOrigin(location, viewportRect, laneIndex, laneCount) {
  const viewport = viewportRect || { left: 0, top: 0, width: 1, height: 1 };
  const comesFromLeft = location.pageIndex < 0;
  const lane = (laneIndex + 1) / (laneCount + 1);
  return {
    x: comesFromLeft ? viewport.left - 28 : viewport.left + viewport.width + 28,
    y: viewport.top + viewport.height * (0.2 + lane * 0.6),
  };
}

function makeFolderPageOrigin(location, panelRect, activeFolderPageIndex, fallback) {
  if (!panelRect) return { ...fallback };
  const comesFromLeft = location.folderPageIndex < activeFolderPageIndex;
  return {
    x: comesFromLeft ? panelRect.left - 24 : panelRect.left + panelRect.width + 24,
    y: panelRect.top + panelRect.height * 0.5,
  };
}

function withMemberIdentity(entry) {
  const id = entry?.item?.id;
  return {
    ...entry,
    bundleCount: 1,
    memberIds: id ? [id] : [],
  };
}

export function resolveGroupGatherEntries(options = {}) {
  const draggedIds = Array.from(new Set((options.draggedIds || []).filter(Boolean)));
  const leadId = options.leadId || draggedIds[0] || null;
  const activePageIndex = Math.max(0, Number(options.activePageIndex) || 0);
  const activeFolderPageIndex = Math.max(0, Number(options.activeFolderPageIndex) || 0);
  const pointer = options.pointer || { x: 0, y: 0 };
  const leadCenter = centerOfRect(options.leadRect, pointer);
  const index = indexGroupDragSources(options.pages);
  const dragged = new Set(draggedIds);
  const orderedIds = [];
  if (leadId && dragged.has(leadId)) orderedIds.push(leadId);
  for (const id of index.order) {
    if (dragged.has(id) && !orderedIds.includes(id)) orderedIds.push(id);
  }
  const crossPageCount = orderedIds.reduce((count, id) => {
    const location = index.apps.get(id);
    const ownerPageIndex = location?.kind === "folder"
      ? location.ownerPageIndex
      : location?.pageIndex;
    return count + (ownerPageIndex !== activePageIndex ? 1 : 0);
  }, 0);
  let crossPageLane = 0;

  return orderedIds.flatMap((id, order) => {
    const location = index.apps.get(id);
    if (!location) return [];
    if (id === leadId) {
      return [withMemberIdentity({
        delayMs: 0,
        item: { ...location.item },
        order,
        origin: leadCenter,
        originKind: "lead",
        originScale: 1,
        source: location,
      })];
    }

    const ownerPageIndex = location.kind === "folder"
      ? location.ownerPageIndex
      : location.pageIndex;
    if (ownerPageIndex !== activePageIndex) {
      const relativeLocation = {
        ...location,
        pageIndex: ownerPageIndex - activePageIndex,
      };
      const origin = makeCrossPageOrigin(
        relativeLocation,
        options.viewportRect,
        crossPageLane,
        Math.max(1, crossPageCount)
      );
      crossPageLane += 1;
      return [withMemberIdentity({
        delayMs: 28 + order * 14,
        direction: ownerPageIndex < activePageIndex ? "left" : "right",
        item: { ...location.item },
        order,
        origin,
        originKind: "desktop-page",
        originScale: 0.78,
        source: location,
      })];
    }

    if (location.kind === "desktop") {
      const renderedRect = options.getDesktopRect?.(location) || null;
      if (renderedRect) {
        return [withMemberIdentity({
          delayMs: 16 + order * 12,
          item: { ...location.item },
          order,
          origin: centerOfRect(renderedRect, leadCenter),
          originKind: "visible-desktop",
          originScale: 1,
          source: location,
        })];
      }
      return [withMemberIdentity({
        delayMs: 28 + order * 14,
        item: { ...location.item },
        order,
        origin: { ...leadCenter },
        originKind: "count-only",
        originScale: 0.78,
        source: location,
      })];
    }

    const isOpenFolderChild = options.openFolderId === location.folderId;
    const isVisibleOpenFolderChild = isOpenFolderChild &&
      activeFolderPageIndex === location.folderPageIndex;
    const folderLaunchRect = isVisibleOpenFolderChild
      ? options.getFolderLaunchRect?.(location) || null
      : null;
    if (folderLaunchRect) {
      return [withMemberIdentity({
        delayMs: 18 + order * 12,
        item: { ...location.item },
        order,
        origin: centerOfRect(folderLaunchRect, leadCenter),
        originKind: "open-folder-visible",
        originScale: 1,
        source: location,
      })];
    }
    if (isOpenFolderChild && location.folderPageIndex !== activeFolderPageIndex) {
      return [withMemberIdentity({
        delayMs: 44 + order * 12,
        item: { ...location.item },
        order,
        origin: makeFolderPageOrigin(
          location,
          options.folderPanelRect,
          activeFolderPageIndex,
          leadCenter
        ),
        originKind: "folder-page",
        originScale: 0.62,
        source: location,
      })];
    }

    const folderRect = options.getFolderRect?.(location.folderId, location) || null;
    if (location.flatIndex < 9) {
      const previewRect = options.getFolderPreviewRect?.(location) || null;
      if (previewRect) {
        return [withMemberIdentity({
          delayMs: 24 + order * 14,
          item: { ...location.item },
          order,
          origin: centerOfRect(previewRect, leadCenter),
          originKind: "folder-preview",
          originScale: 0.7,
          source: location,
        })];
      }
    }

    return [withMemberIdentity({
      delayMs: 64 + Math.min(8, location.flatIndex - 9) * 12 + order * 8,
      item: { ...location.item },
      order,
      origin: centerOfRect(folderRect, leadCenter),
      originKind: "folder-hidden",
      originScale: location.flatIndex < 9 ? 0.4 : 0.18,
      source: location,
    })];
  });
}

function getBundleDescriptor(entry) {
  if (entry.originKind === "desktop-page") {
    const pageIndex = entry.source?.kind === "folder"
      ? entry.source.ownerPageIndex
      : entry.source?.pageIndex;
    return {
      key: `desktop-page:${pageIndex}`,
      originKind: "desktop-page-bundle",
    };
  }
  if (entry.originKind === "folder-page") {
    return {
      key: `folder-page:${entry.source?.folderId}:${entry.source?.folderPageIndex}`,
      originKind: "folder-page-bundle",
    };
  }
  if (entry.originKind === "folder-hidden") {
    return {
      key: `folder:${entry.source?.folderId}`,
      originKind: "folder-bundle",
    };
  }
  if (entry.originKind === "count-only") {
    return { key: "count-only", originKind: "count-only" };
  }
  return null;
}

function aggregateGatherEntries(entries) {
  const exact = [];
  const bundles = new Map();
  for (const entry of entries || []) {
    const descriptor = getBundleDescriptor(entry);
    if (!descriptor) {
      exact.push(withMemberIdentity(entry));
      continue;
    }
    const existing = bundles.get(descriptor.key);
    if (existing) {
      existing.bundleCount += 1;
      existing.memberIds.push(entry.item.id);
      existing.order = Math.min(existing.order, entry.order);
      existing.delayMs = Math.min(existing.delayMs, entry.delayMs);
      continue;
    }
    bundles.set(descriptor.key, {
      ...withMemberIdentity(entry),
      bundleKey: descriptor.key,
      originKind: descriptor.originKind,
    });
  }
  return {
    bundles: [...bundles.values()].sort((left, right) => left.order - right.order),
    exact: exact.sort((left, right) => left.order - right.order),
  };
}

function collapseDesktopPageBundles(bundles, maxBundles) {
  const desktopBundles = bundles.filter((entry) => entry.originKind === "desktop-page-bundle");
  if (desktopBundles.length <= maxBundles) return bundles;
  const mergedByDirection = new Map();
  for (const entry of desktopBundles) {
    const direction = entry.direction === "left" ? "left" : "right";
    const existing = mergedByDirection.get(direction);
    if (!existing) {
      mergedByDirection.set(direction, {
        ...entry,
        bundleKey: `desktop-pages:${direction}`,
        memberIds: [...entry.memberIds],
      });
      continue;
    }
    existing.bundleCount += entry.bundleCount;
    existing.memberIds.push(...entry.memberIds);
    existing.order = Math.min(existing.order, entry.order);
    existing.delayMs = Math.min(existing.delayMs, entry.delayMs);
  }
  return [
    ...bundles.filter((entry) => entry.originKind !== "desktop-page-bundle"),
    ...mergedByDirection.values(),
  ].sort((left, right) => left.order - right.order);
}

export function selectGroupGatherRepresentatives(entries, maxVisible = 12, options = {}) {
  const limit = normalizePositiveInteger(maxVisible, 12);
  const maxBundles = normalizePositiveInteger(options.maxBundles, 3);
  const aggregated = aggregateGatherEntries(entries);
  const bundles = collapseDesktopPageBundles(aggregated.bundles, maxBundles);
  const selected = [];
  const selectedIds = new Set();
  const append = (entry) => {
    if (!entry?.item?.id || selectedIds.has(entry.item.id) || selected.length >= limit) return;
    selectedIds.add(entry.item.id);
    selected.push(entry);
  };
  append(aggregated.exact.find((entry) => entry.originKind === "lead"));
  for (const kind of ["visible-desktop", "open-folder-visible", "folder-preview"]) {
    append(aggregated.exact.find((entry) => entry.originKind === kind));
  }
  for (const entry of bundles.slice(0, maxBundles)) append(entry);
  for (const entry of aggregated.exact) append(entry);
  return selected.sort((left, right) => left.order - right.order);
}
