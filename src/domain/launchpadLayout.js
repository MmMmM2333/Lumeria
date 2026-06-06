import { DEFAULT_FOLDER_COLS, DEFAULT_FOLDER_ROWS } from "../composables/launchpadConstants.js";

export function cx() {
  return Array.prototype.slice.call(arguments).filter(Boolean).join(" ");
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function shrinkRect(rect, scale) {
  const width = rect.width * scale;
  const height = rect.height * scale;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

export function expandRect(rect, margin) {
  return {
    left: rect.left - margin,
    top: rect.top - margin,
    right: rect.right + margin,
    bottom: rect.bottom + margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

export function isPointInsideRect(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function makePageSize(rows, cols) {
  return Math.max(1, rows * cols);
}

export function chunkIntoPages(items, size) {
  const pageSize = Math.max(1, size || 1);
  const chunks = [];
  for (let i = 0; i < items.length; i += pageSize) {
    chunks.push(items.slice(i, i + pageSize));
  }
  return chunks.length ? chunks : [[]];
}

function trimPreviewFolderSlots(children) {
  return (children || []).filter(Boolean);
}

function compactPreviewFolderPages(folderPages) {
  const pages = (folderPages || []).map((page) => trimPreviewFolderSlots(page)).filter((page) => page.length > 0);
  return pages.length ? pages : [[]];
}

function getPreviewFolderChildPages(folder, size) {
  const pageSize = Math.max(1, Number(size) || 9);
  if (Array.isArray(folder?.childPages)) return compactPreviewFolderPages(folder.childPages);
  return chunkIntoPages(trimPreviewFolderSlots(folder?.children || []), pageSize);
}

export function getFolderPreviewSlots(folderOrChildren, pageSize) {
  const safePageSize = Math.max(1, Number(pageSize) || 9);
  const previewLimit = Math.min(9, safePageSize);
  const firstPage = Array.isArray(folderOrChildren)
    ? trimPreviewFolderSlots(folderOrChildren).slice(0, safePageSize)
    : getPreviewFolderChildPages(folderOrChildren, safePageSize)[0] || [];
  const slots = firstPage.slice(0, previewLimit).map((child) => (child ? child : null));
  while (slots.length < 9) slots.push(null);
  return slots;
}

export function shouldCommitPlacementFromLast(last, key, clientX, clientY, minDistance, force) {
  if (force) return true;
  if (!last) return true;
  if (last.key !== key) return true;
  const distance = Math.hypot(clientX - last.x, clientY - last.y);
  return distance >= minDistance;
}

export function createLaunchpadLayoutHelpers(options) {
  const getPageSize = options.getPageSize;
  const getFolderPageSize = options.getFolderPageSize;

  function flattenTopLevelPages(sourcePages) {
    return sourcePages.flatMap((page) => page.map(cloneItem));
  }

  function trimFolderSlots(children) {
    return (children || []).filter(Boolean).map(cloneItem);
  }

  function compactFolderPages(folderPages) {
    const pages = (folderPages || []).map((page) => trimFolderSlots(page)).filter((page) => page.length > 0);
    return pages.length ? pages : [[]];
  }

  function flattenFolderPages(folderPages) {
    return compactFolderPages(folderPages).flatMap((page) => page.map(cloneItem));
  }

  function getFolderChildPages(folder, size) {
    const pageSize = Math.max(1, Number(size) || DEFAULT_FOLDER_ROWS * DEFAULT_FOLDER_COLS);

    if (Array.isArray(folder?.childPages)) {
      return compactFolderPages(folder.childPages);
    }

    const items = trimFolderSlots(folder?.children || []);
    return chunkIntoPages(items, pageSize);
  }

  function padFolderPages(folderPages, minPageCount) {
    const pages = compactFolderPages(folderPages);
    const targetCount = Math.max(1, Number(minPageCount) || 1);
    while (pages.length < targetCount) pages.push([]);
    return pages;
  }

  function withFolderPages(folder, folderPages) {
    const childPages = compactFolderPages(folderPages);
    return {
      ...folder,
      childPages,
      children: flattenFolderPages(childPages),
    };
  }

  function folderItemCount(folder) {
    return flattenFolderPages(getFolderChildPages(folder, getFolderPageSize())).length;
  }

  function folderPreviewSlots(folder) {
    return getFolderPreviewSlots(folder, getFolderPageSize());
  }

  function getVisibleDesktopPage(page) {
    return (page || []).slice(0, getPageSize());
  }

  function getVisibleFolderPage(page) {
    return (page || []).slice(0, getFolderPageSize());
  }

  function getVisibleFolderPages(folder, size, minPageCount) {
    return padFolderPages(getFolderChildPages(folder, size), minPageCount);
  }

  function repackFolderForPageSize(folder, oldSize, newSize) {
    const oldPageSize = Math.max(1, Number(oldSize) || DEFAULT_FOLDER_ROWS * DEFAULT_FOLDER_COLS);
    const newPageSize = Math.max(1, Number(newSize) || oldPageSize);
    const childPages = getFolderChildPages(folder, oldPageSize);

    if (newPageSize < oldPageSize) {
      for (let pageIndex = 0; pageIndex < childPages.length; pageIndex += 1) {
        while (childPages[pageIndex].length > newPageSize) {
          const overflow = childPages[pageIndex].pop();
          while (childPages.length <= pageIndex + 1) childPages.push([]);
          childPages[pageIndex + 1].unshift(overflow);
        }
      }
    }

    return withFolderPages(folder, childPages);
  }



  function makeId(prefix) {
    const safePrefix = prefix || "id";
    return `${safePrefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
  }

  function makeApp(seed, index) {
    const source = Array.isArray(seed) ? { name: seed[0], emoji: seed[1] } : { ...seed };
    const type = source.type === "folder" ? "folder" : "app";
    const name = String(source.name || "App");
    const id = source.id || `${type}-${index}-${name.toLowerCase().replace(/\s+/g, "-")}`;
    const item = { ...source, id, type, name, emoji: source.emoji || "◼️" };
    if (type === "folder") {
      const childPages = Array.isArray(source.childPages)
        ? source.childPages
        : chunkIntoPages(source.children || [], getFolderPageSize());
      return withFolderPages(item, childPages);
    }
    return item;
  }

  function cloneItem(item) {
    if (!item) return null;
    if (item.type === "folder") {
      const childPages = Array.isArray(item.childPages) ? compactFolderPages(item.childPages) : getFolderChildPages(item, getFolderPageSize());
      return withFolderPages({ ...item }, childPages);
    }
    return { ...item };
  }

  function clonePages(sourcePages) {
    return sourcePages.map((page) => page.filter(Boolean).map(cloneItem));
  }

  function cleanFolderItem(folder, options) {
    const pageSizeForFolder = options?.folderPageSize || getFolderPageSize();
    const clean = withFolderPages(folder, getFolderChildPages(folder, pageSizeForFolder));
    const preserved = Array.isArray(options?.preserveFolderIds) && options.preserveFolderIds.includes(clean.id);
    const shouldDeleteEmpty = options?.deleteEmptyFolders && folderItemCount(clean) === 0 && !preserved;
    return shouldDeleteEmpty ? null : clean;
  }

  function compactPages(sourcePages, options) {
    const safeOptions = options || {};
    const next = sourcePages.length
      ? sourcePages.map((page) =>
          page
            .filter(Boolean)
            .map((item) => (item.type === "folder" ? cleanFolderItem(item, safeOptions) : item))
            .filter(Boolean)
        )
      : [[]];

    while (next.length > 1 && next[next.length - 1].length === 0) next.pop();
    return next.length ? next : [[]];
  }

  function ensurePage(sourcePages, targetPageIndex) {
    while (sourcePages.length <= targetPageIndex) sourcePages.push([]);
    return sourcePages;
  }

  function findTopLevel(sourcePages, id) {
    for (let currentPageIndex = 0; currentPageIndex < sourcePages.length; currentPageIndex += 1) {
      const index = sourcePages[currentPageIndex].findIndex((item) => item.id === id);
      if (index >= 0) return { pageIndex: currentPageIndex, index, item: sourcePages[currentPageIndex][index] };
    }
    return null;
  }

  function findFolder(sourcePages, folderId) {
    for (let currentPageIndex = 0; currentPageIndex < sourcePages.length; currentPageIndex += 1) {
      for (let index = 0; index < sourcePages[currentPageIndex].length; index += 1) {
        const item = sourcePages[currentPageIndex][index];
        if (item.type === "folder" && item.id === folderId) return { pageIndex: currentPageIndex, index, item };
      }
    }
    return null;
  }

  function findInFolder(sourcePages, folderId, itemId) {
    const folder = findFolder(sourcePages, folderId)?.item;
    if (!folder) return null;
    const childPages = getFolderChildPages(folder, getFolderPageSize());
    for (let pageIndex = 0; pageIndex < childPages.length; pageIndex += 1) {
      const index = childPages[pageIndex].findIndex((child) => child?.id === itemId);
      if (index >= 0) return { folder, pageIndex, index, item: childPages[pageIndex][index] };
    }
    return null;
  }

  function countItemOccurrences(sourcePages, itemId) {
    let count = 0;
    for (const page of sourcePages) {
      for (const item of page) {
        if (item.id === itemId) count += 1;
        if (item.type === "folder") count += flattenFolderPages(getFolderChildPages(item, getFolderPageSize())).filter((child) => child?.id === itemId).length;
      }
    }
    return count;
  }

  function collectAppsFromPages(sourcePages) {
    const apps = [];
    const seen = new Set();
    for (const page of sourcePages || []) {
      for (const item of page || []) {
        if (!item) continue;
        if (item.type === "app" && !seen.has(item.id)) {
          seen.add(item.id);
          apps.push(cloneItem(item));
        }
        if (item.type === "folder") {
          for (const child of flattenFolderPages(getFolderChildPages(item, getFolderPageSize()))) {
            if (!child || child.type !== "app" || seen.has(child.id)) continue;
            seen.add(child.id);
            apps.push(cloneItem(child));
          }
        }
      }
    }
    return apps;
  }

  function normalizeSearchText(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function filterAppsForSearch(apps, query) {
    const term = normalizeSearchText(query);
    if (!term) return [];
    return (apps || []).filter((app) => normalizeSearchText(app.name).includes(term));
  }

  function hasItemsOtherThan(items, itemId) {
    return (items || []).some((item) => item && item.id !== itemId);
  }

  function canCreatePageFromItemsAfterDrag(items, draggedItemId) {
    return hasItemsOtherThan(items, draggedItemId);
  }

  function canCreateDesktopPageAfterDrag(sourcePages, targetPageIndex, draggedItemId) {
    return canCreatePageFromItemsAfterDrag(sourcePages[targetPageIndex] || [], draggedItemId);
  }

  function canCreateFolderPageAfterDrag(folder, targetPageIndex, draggedItemId, size) {
    if (!folder) return false;
    const childPages = getFolderChildPages(folder, size);
    return canCreatePageFromItemsAfterDrag(childPages[targetPageIndex] || [], draggedItemId);
  }

  function assertNoDuplicateItemIds(sourcePages) {
    const seen = new Set();
    const duplicates = new Set();
    for (const page of sourcePages) {
      for (const item of page) {
        if (seen.has(item.id)) duplicates.add(item.id);
        seen.add(item.id);
        if (item.type === "folder") {
          for (const child of flattenFolderPages(getFolderChildPages(item, getFolderPageSize()))) {
            if (!child) continue;
            if (seen.has(child.id)) duplicates.add(child.id);
            seen.add(child.id);
          }
        }
      }
    }
    if (duplicates.size) throw new Error(`Duplicate launchpad item ids: ${Array.from(duplicates).join(", ")}`);
  }

  function shouldPreserveEmptyFolder(folderId, options) {
    if (options?.keepEmptyFolders) return true;
    return Array.isArray(options?.preserveFolderIds) && options.preserveFolderIds.includes(folderId);
  }

  function removeEverywhere(sourcePages, itemId, options) {
    const safeOptions = options || {};
    const next = clonePages(sourcePages).map((page) =>
      page
        .filter((item) => item.id !== itemId)
        .map((item) => {
          if (item.type !== "folder") return item;
          const childPages = getFolderChildPages(item, getFolderPageSize()).map((folderPage) => folderPage.filter((child) => child?.id !== itemId));
          const clean = withFolderPages(item, childPages);
          if (folderItemCount(clean) === 0 && !shouldPreserveEmptyFolder(clean.id, safeOptions)) return null;
          return clean;
        })
        .filter(Boolean)
    );
    return compactPages(next, { deleteEmptyFolders: !safeOptions.keepEmptyFolders, preserveFolderIds: safeOptions.preserveFolderIds, folderPageSize: getFolderPageSize() });
  }

  function insertTopLevelItem(sourcePages, item, targetPageIndex, insertIndex, size) {
    const pageSize = Math.max(1, size || 1);
    const next = removeEverywhere(sourcePages, item.id);
    ensurePage(next, targetPageIndex);

    const safeIndex = clamp(insertIndex, 0, Math.min(pageSize, next[targetPageIndex].length));
    next[targetPageIndex].splice(safeIndex, 0, cloneItem(item));

    for (let currentPageIndex = targetPageIndex; currentPageIndex < next.length; currentPageIndex += 1) {
      if (next[currentPageIndex].length <= pageSize) continue;
      const overflow = next[currentPageIndex].pop();
      ensurePage(next, currentPageIndex + 1);
      next[currentPageIndex + 1].unshift(overflow);
    }

    return compactPages(next);
  }

  function previewTopLevelItemWithoutOverflow(sourcePages, item, targetPageIndex, insertIndex, size) {
    const pageSize = Math.max(1, size || 1);
    const next = removeEverywhere(sourcePages, item.id);
    ensurePage(next, targetPageIndex);

    const safeIndex = clamp(insertIndex, 0, Math.min(pageSize, next[targetPageIndex].length));
    next[targetPageIndex].splice(safeIndex, 0, cloneItem(item));
    return compactPages(next);
  }

  function insertAppIntoFolder(sourcePages, folderId, app, targetPageIndex, insertIndex, size) {
    const folderSize = Math.max(1, Number(size) || getFolderPageSize());
    const next = removeEverywhere(sourcePages, app.id, { preserveFolderIds: [folderId] });
    const folder = findFolder(next, folderId);
    if (!folder || app.type !== "app") return next;

    const childPages = getFolderChildPages(folder.item, folderSize);
    const requestedPage = Number.isFinite(Number(targetPageIndex)) ? Math.floor(Number(targetPageIndex)) : childPages.length - 1;
    const safePageIndex = Math.max(0, requestedPage);
    while (childPages.length <= safePageIndex) childPages.push([]);

    const requestedIndex = Number.isFinite(Number(insertIndex)) ? Math.floor(Number(insertIndex)) : childPages[safePageIndex].length;
    const safeIndex = clamp(requestedIndex, 0, Math.min(folderSize, childPages[safePageIndex].length));
    childPages[safePageIndex].splice(safeIndex, 0, { ...app });

    for (let pageIndex = safePageIndex; pageIndex < childPages.length; pageIndex += 1) {
      while (childPages[pageIndex].length > folderSize) {
        const overflow = childPages[pageIndex].pop();
        while (childPages.length <= pageIndex + 1) childPages.push([]);
        childPages[pageIndex + 1].unshift(overflow);
      }
    }

    next[folder.pageIndex][folder.index] = withFolderPages(folder.item, childPages);
    return compactPages(next, { preserveFolderIds: [folderId], folderPageSize: folderSize });
  }

  function previewAppIntoFolderWithoutOverflow(sourcePages, folderId, app, targetPageIndex, insertIndex, size) {
    const folderSize = Math.max(1, Number(size) || getFolderPageSize());
    const next = removeEverywhere(sourcePages, app.id, { preserveFolderIds: [folderId] });
    const folder = findFolder(next, folderId);
    if (!folder || app.type !== "app") return next;

    const childPages = getFolderChildPages(folder.item, folderSize);
    const requestedPage = Number.isFinite(Number(targetPageIndex)) ? Math.floor(Number(targetPageIndex)) : childPages.length - 1;
    const safePageIndex = Math.max(0, requestedPage);
    while (childPages.length <= safePageIndex) childPages.push([]);

    const requestedIndex = Number.isFinite(Number(insertIndex)) ? Math.floor(Number(insertIndex)) : childPages[safePageIndex].length;
    const safeIndex = clamp(requestedIndex, 0, Math.min(folderSize, childPages[safePageIndex].length));
    childPages[safePageIndex].splice(safeIndex, 0, { ...app });

    next[folder.pageIndex][folder.index] = withFolderPages(folder.item, childPages);
    return compactPages(next, { preserveFolderIds: [folderId], folderPageSize: folderSize });
  }

  function wouldTopLevelInsertOverflow(sourcePages, item, targetPageIndex, size) {
    if (!item) return false;
    const pageSize = Math.max(1, Number(size) || 1);
    const requestedPage = Number.isFinite(Number(targetPageIndex)) ? Math.max(0, Math.floor(Number(targetPageIndex))) : 0;
    const next = removeEverywhere(sourcePages, item.id);
    ensurePage(next, requestedPage);
    return next[requestedPage].length >= pageSize;
  }

  function wouldFolderInsertOverflow(sourcePages, folderId, app, targetPageIndex, size) {
    if (!folderId || !app || app.type !== "app") return false;
    const folderSize = Math.max(1, Number(size) || getFolderPageSize());
    const requestedPage = Number.isFinite(Number(targetPageIndex)) ? Math.max(0, Math.floor(Number(targetPageIndex))) : 0;
    const next = removeEverywhere(sourcePages, app.id, { preserveFolderIds: [folderId] });
    const folder = findFolder(next, folderId);
    if (!folder) return false;
    const childPages = getFolderChildPages(folder.item, folderSize);
    return (childPages[requestedPage] || []).length >= folderSize;
  }

  function replaceFolderWithItem(sourcePages, folderId, item) {
    const next = clonePages(sourcePages);
    const folder = findFolder(next, folderId);
    if (!folder) return compactPages(next);
    next[folder.pageIndex][folder.index] = cloneItem(item);
    return compactPages(next);
  }

  function repackFoldersForPageSize(sourcePages, oldSize, newSize) {
    return sourcePages.map((page) =>
      page.map((item) => (item.type === "folder" ? repackFolderForPageSize(item, oldSize, newSize) : item))
    );
  }

  return {
    flattenTopLevelPages,
    trimFolderSlots,
    compactFolderPages,
    flattenFolderPages,
    getFolderChildPages,
    padFolderPages,
    withFolderPages,
    folderItemCount,
    getFolderPreviewSlots,
    folderPreviewSlots,
    getVisibleDesktopPage,
    getVisibleFolderPage,
    getVisibleFolderPages,
    repackFolderForPageSize,
    makeId,
    makeApp,
    cloneItem,
    clonePages,
    cleanFolderItem,
    compactPages,
    ensurePage,
    findTopLevel,
    findFolder,
    findInFolder,
    countItemOccurrences,
    collectAppsFromPages,
    normalizeSearchText,
    filterAppsForSearch,
    hasItemsOtherThan,
    canCreatePageFromItemsAfterDrag,
    canCreateDesktopPageAfterDrag,
    canCreateFolderPageAfterDrag,
    assertNoDuplicateItemIds,
    shouldPreserveEmptyFolder,
    removeEverywhere,
    insertTopLevelItem,
    previewTopLevelItemWithoutOverflow,
    insertAppIntoFolder,
    previewAppIntoFolderWithoutOverflow,
    wouldTopLevelInsertOverflow,
    wouldFolderInsertOverflow,
    replaceFolderWithItem,
    repackFoldersForPageSize,
  };
}
