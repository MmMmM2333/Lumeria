import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { appSeeds } from "../mocks/appSeeds.js";

export function useLaunchpadController() {
  const DEFAULT_ROWS = 4;
  const DEFAULT_COLS = 6;
  const DEFAULT_FOLDER_ROWS = 3;
  const DEFAULT_FOLDER_COLS = 4;
  const FOLDER_HOVER_DELAY = 720;
  const LONG_PRESS_DELAY = 420;
  const LONG_PRESS_MOVE_THRESHOLD = 10;
  const ALT_EDIT_DELAY = 520;
  const PAGE_EDGE_SIZE = 92;
  const FOLDER_PAGE_EDGE_SIZE = 82;
  const PAGE_TURN_DELAY = 520;
  const FOLDER_CLOSE_DURATION = 360;
  const HOME_REVEAL_SETTLE_DURATION = 560;
  const FOLDER_HIT_ZONE_SCALE = 0.78;
  const FOLDER_HOVER_STICKY_MARGIN = 34;
  const DESKTOP_SORT_MIN_DISTANCE = 18;
  const FOLDER_SORT_MIN_DISTANCE = 12;
  const WHEEL_PAGE_THRESHOLD = 34;
  const WHEEL_PAGE_LOCK_DURATION = 360;
  const DESKTOP_CLOSE_SCALE = 1.08;
  const DESKTOP_CLOSE_DURATION = 360;
  const APP_LAUNCH_DURATION = 420;
  const FOLDER_APP_LAUNCH_DURATION = 380;
  const DEV_OPEN_DESKTOP_SHORTCUT_CODE = "KeyL";

  const springRest = { restDelta: 0.01, restSpeed: 0.01 };
  const layoutSpring = { layout: { type: "spring", stiffness: 520, damping: 34, mass: 0.75, ...springRest } };
  const desktopTrackTransition = { type: "spring", stiffness: 190, damping: 28, mass: 0.9, ...springRest };
  const panelSpring = { type: "spring", stiffness: 340, damping: 31, mass: 0.9, ...springRest };
  const homeShellTransition = { type: "spring", stiffness: 260, damping: 29, mass: 0.85, ...springRest };
  const folderContentTransition = { duration: 0.16, ease: "easeOut" };
  const instantTrackTransition = { duration: 0 };
  const dragPreviewSpring = { duration: 0.08 };
  const appLaunchGhostTransition = { duration: APP_LAUNCH_DURATION / 1000, ease: "easeOut" };

  function cx() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(" ");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function shrinkRect(rect, scale) {
    const width = rect.width * scale;
    const height = rect.height * scale;
    const left = rect.left + (rect.width - width) / 2;
    const top = rect.top + (rect.height - height) / 2;
    return { left, top, right: left + width, bottom: top + height, width, height };
  }

  function expandRect(rect, margin) {
    return {
      left: rect.left - margin,
      top: rect.top - margin,
      right: rect.right + margin,
      bottom: rect.bottom + margin,
      width: rect.width + margin * 2,
      height: rect.height + margin * 2,
    };
  }

  function isPointInsideRect(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function makePageSize(rows, cols) {
    return Math.max(1, rows * cols);
  }

  function chunkIntoPages(items, size) {
    const pageSize = Math.max(1, size || 1);
    const chunks = [];
    for (let i = 0; i < items.length; i += pageSize) {
      chunks.push(items.slice(i, i + pageSize));
    }
    return chunks.length ? chunks : [[]];
  }

  function flattenTopLevelPages(sourcePages) {
    return sourcePages.flatMap((page) => page.map(cloneItem));
  }

  function shouldCommitPlacementFromLast(last, clientX, clientY, minDistance, force) {
    if (force) return true;
    if (!last) return true;
    const distance = Math.hypot(clientX - last.x, clientY - last.y);
    return distance >= minDistance;
  }

  function makePreviewTransform(pointer, offset) {
    return `translate3d(${pointer.x - offset.x}px, ${pointer.y - offset.y}px, 0) scale(1.12) rotate(-5deg)`;
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
    return flattenFolderPages(getFolderChildPages(folder, folderPageSize.value)).length;
  }

  function getFolderPreviewSlots(folderOrChildren, pageSize) {
    const safePageSize = Math.max(1, Number(pageSize) || 9);
    const previewLimit = Math.min(9, safePageSize);
    const firstPage = Array.isArray(folderOrChildren)
      ? trimFolderSlots(folderOrChildren).slice(0, safePageSize)
      : getFolderChildPages(folderOrChildren, safePageSize)[0] || [];
    const slots = firstPage.slice(0, previewLimit).map((child) => (child ? child : null));
    while (slots.length < 9) slots.push(null);
    return slots;
  }

  function folderPreviewSlots(folder) {
    return getFolderPreviewSlots(folder, folderPageSize.value);
  }

  function getVisibleDesktopPage(page) {
    return (page || []).slice(0, pageSize.value);
  }

  function getVisibleFolderPage(page) {
    return (page || []).slice(0, folderPageSize.value);
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
    const name = seed[0];
    const emoji = seed[1];
    return { id: `app-${index}-${name.toLowerCase().replace(/\s+/g, "-")}`, type: "app", name, emoji };
  }

  function cloneItem(item) {
    if (!item) return null;
    if (item.type === "folder") {
      const childPages = Array.isArray(item.childPages) ? compactFolderPages(item.childPages) : getFolderChildPages(item, folderPageSize.value);
      return withFolderPages({ ...item }, childPages);
    }
    return { ...item };
  }

  function clonePages(sourcePages) {
    return sourcePages.map((page) => page.filter(Boolean).map(cloneItem));
  }

  function cleanFolderItem(folder, options) {
    const pageSizeForFolder = options?.folderPageSize || folderPageSize.value;
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
    const childPages = getFolderChildPages(folder, folderPageSize.value);
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
        if (item.type === "folder") count += flattenFolderPages(getFolderChildPages(item, folderPageSize.value)).filter((child) => child?.id === itemId).length;
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
          for (const child of flattenFolderPages(getFolderChildPages(item, folderPageSize.value))) {
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
          for (const child of flattenFolderPages(getFolderChildPages(item, folderPageSize.value))) {
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
          const childPages = getFolderChildPages(item, folderPageSize.value).map((folderPage) => folderPage.filter((child) => child?.id !== itemId));
          const clean = withFolderPages(item, childPages);
          if (folderItemCount(clean) === 0 && !shouldPreserveEmptyFolder(clean.id, safeOptions)) return null;
          return clean;
        })
        .filter(Boolean)
    );
    return compactPages(next, { deleteEmptyFolders: !safeOptions.keepEmptyFolders, preserveFolderIds: safeOptions.preserveFolderIds, folderPageSize: folderPageSize.value });
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
    const folderSize = Math.max(1, Number(size) || folderPageSize.value);
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
    const folderSize = Math.max(1, Number(size) || folderPageSize.value);
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
    const folderSize = Math.max(1, Number(size) || folderPageSize.value);
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

  function runLaunchpadHelperTests() {
    const a = { id: "a", type: "app", name: "A", emoji: "A" };
    const b = { id: "b", type: "app", name: "B", emoji: "B" };
    const c = { id: "c", type: "app", name: "C", emoji: "C" };
    const folder = { id: "folder", type: "folder", name: "Folder", children: [b] };
    const assert = (condition, message) => {
      if (!condition) throw new Error(`[Launchpad Vue helper test failed] ${message}`);
    };

    assert(makePageSize(4, 6) === 24, "page size should equal rows * cols");
    assert(chunkIntoPages([a, b, c], 2).length === 2, "custom page size should repack into more pages when capacity shrinks");
    assert(chunkIntoPages([a, b, c], 9).length === 1, "custom page size should merge pages when capacity grows");
    assert(flattenTopLevelPages([[a], [b, c]]).map((item) => item.id).join("") === "abc", "flattenTopLevelPages should preserve row-major order");
    assert(shouldCommitPlacementFromLast(null, 0, 0, 18, false), "placement should commit when no previous point exists");
    assert(!shouldCommitPlacementFromLast({ x: 0, y: 0 }, 6, 6, 18, false), "placement should not commit under distance threshold");
    assert(makePreviewTransform({ x: 100, y: 120 }, { x: 10, y: 20 }).includes("translate3d(90px, 100px, 0)"), "drag preview transform should subtract the pointer offset");

    const overflow = insertTopLevelItem([[...Array.from({ length: 2 }, (_, index) => ({ ...a, id: `full-${index}` }))]], c, 0, 0, 2);
    assert(overflow.length === 2 && overflow[0].length === 2 && overflow[1].length === 1, "insertTopLevelItem should overflow according to custom page size");
    const previewOverflow = previewTopLevelItemWithoutOverflow([[a, b]], c, 0, 1, 2);
    assert(previewOverflow.length === 1 && previewOverflow[0].map((item) => item.id).join("") === "acb", "desktop preview should reorder a full page without cascading overflow");
    const fullDesktopPreview = previewTopLevelItemWithoutOverflow([Array.from({ length: pageSize.value }, (_, index) => ({ ...a, id: `desktop-full-${index}` }))], c, 0, 1, pageSize.value);
    assert(fullDesktopPreview[0].length === pageSize.value + 1, "desktop preview should keep the temporarily overflowed item in page data");
    assert(getVisibleDesktopPage(fullDesktopPreview[0]).length === pageSize.value, "desktop preview should hide the temporary overflow item from rendering");
    assert(wouldTopLevelInsertOverflow([[a, b]], c, 0, 2), "desktop hover should detect an external insert into a full page");
    assert(!wouldTopLevelInsertOverflow([[a, b]], a, 0, 2), "desktop hover should allow reordering an item already on the full page");
    const folderInsert = insertAppIntoFolder([[a, folder]], "folder", c, 0, 0, 2);
    assert(getFolderChildPages(findFolder(folderInsert, "folder")?.item, 2)[0][0].id === "c", "insertAppIntoFolder should insert app at requested page index");
    assert(countItemOccurrences(folderInsert, "c") === 1, "insertAppIntoFolder should not duplicate app");
    const searchApps = collectAppsFromPages([[a, { ...folder, childPages: [[b]], children: [b] }]]);
    assert(searchApps.length === 2 && searchApps.every((item) => item.type === "app"), "search collection should flatten apps and exclude folders");
    assert(filterAppsForSearch(searchApps, " b ")[0].id === "b", "search should match app names case-insensitively after trimming");
    const savedSearchQuery = searchQuery.value;
    const savedGridRows = gridRows.value;
    const savedGridCols = gridCols.value;
    searchQuery.value = "active-test";
    gridRows.value = 6;
    gridCols.value = 6;
    const centeredSearchGridStyle = getActivePageGridStyle([a, b]);
    assert(centeredSearchGridStyle.gridTemplateRows === "repeat(6, minmax(0, 1fr))", "single-row search results should preserve the configured row template");
    assert(centeredSearchGridStyle.gridTemplateColumns.includes("repeat(2"), "single-row search results should use a centered compact column template");
    searchQuery.value = savedSearchQuery;
    gridRows.value = savedGridRows;
    gridCols.value = savedGridCols;
    const folderSlots = insertAppIntoFolder([[{ ...folder, children: [b, null, c] }]], "folder", a, 0, 1, 4);
    assert(getFolderChildPages(findFolder(folderSlots, "folder")?.item, 4)[0].map((item) => item.id).join("") === "bac", "insertAppIntoFolder should compact a folder page before sorting");
    const fullFolder = { id: "full-folder", type: "folder", name: "Full", childPages: [[a, b]], children: [a, b] };
    assert(wouldFolderInsertOverflow([[fullFolder]], "full-folder", c, 0, 2), "folder hover should detect an external insert into a full folder page");
    assert(!wouldFolderInsertOverflow([[fullFolder]], "full-folder", a, 0, 2), "folder hover should allow reordering an item already on the full folder page");
    const folderPreview = previewAppIntoFolderWithoutOverflow([[{ ...folder, childPages: [[b]], children: [b] }]], "folder", a, 0, 0, 1);
    const folderPreviewChildren = getFolderChildPages(folderPreview[0][0], 1)[0];
    assert(folderPreviewChildren.map((item) => item.id).join("") === "ab", "folder preview should keep the temporarily overflowed child in the same page data");
    const fullFolderChildren = Array.from({ length: folderPageSize.value }, (_, index) => ({ ...b, id: `folder-full-${index}` }));
    const fullFolderPreview = previewAppIntoFolderWithoutOverflow([[{ ...folder, childPages: [fullFolderChildren], children: fullFolderChildren }]], "folder", a, 0, 0, folderPageSize.value);
    const fullFolderPreviewChildren = getFolderChildPages(fullFolderPreview[0][0], folderPageSize.value)[0];
    assert(fullFolderPreviewChildren.length === folderPageSize.value + 1, "folder preview should keep the temporarily overflowed child in folder page data");
    assert(getVisibleFolderPage(fullFolderPreviewChildren).length === folderPageSize.value, "folder preview should hide the temporary folder overflow item from rendering");
    const folderLaterPage = insertAppIntoFolder([[{ ...folder, childPages: [[b], []], children: [b] }]], "folder", c, 1, 3, 2);
    const laterPages = getFolderChildPages(findFolder(folderLaterPage, "folder")?.item, 2);
    assert(laterPages.length === 2 && laterPages[0].length === 1 && laterPages[1][0].id === "c", "folder pages should allow trailing empty space before later pages like desktop pages");
    assert(getFolderPreviewSlots({ ...folder, childPages: [[a, b, c]] }, 12).length === 9, "folder preview should always render 3x3 slots");
    const collapsedBlankFolderPages = getFolderChildPages({ ...folder, childPages: [[a], [], [b]] }, 2);
    assert(collapsedBlankFolderPages.length === 2 && collapsedBlankFolderPages[0][0].id === "a" && collapsedBlankFolderPages[1][0].id === "b", "folder pages should remove empty middle pages automatically");

    assert(!canCreateDesktopPageAfterDrag([[a]], 0, "a"), "desktop should not create a new page when the current page would become empty after dragging");
    assert(canCreateDesktopPageAfterDrag([[a, b]], 0, "a"), "desktop should create a new page when another item remains on the current page");
    assert(!canCreateDesktopPageAfterDrag([[]], 0, "a"), "desktop should not create a new page from an empty current page");
    assert(!canCreateFolderPageAfterDrag({ ...folder, childPages: [[b]] }, 0, "b", 2), "folder should not create a new page when the current folder page would become empty after dragging");
    assert(canCreateFolderPageAfterDrag({ ...folder, childPages: [[b, c]] }, 0, "b", 2), "folder should create a new page when another child remains on the current folder page");

    const rect = { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
    assert(isPointInsideRect(shrinkRect(rect, 0.5), 50, 50), "center point should be inside shrunk folder hit zone");
    assert(expandRect(rect, 10).right === 110, "expandRect should add sticky margin around target");
  }

  const gridRows = ref(DEFAULT_ROWS);
  const gridCols = ref(DEFAULT_COLS);
  const folderRows = ref(DEFAULT_FOLDER_ROWS);
  const folderCols = ref(DEFAULT_FOLDER_COLS);
  const draftRows = ref(DEFAULT_ROWS);
  const draftCols = ref(DEFAULT_COLS);
  const draftFolderRows = ref(DEFAULT_FOLDER_ROWS);
  const draftFolderCols = ref(DEFAULT_FOLDER_COLS);
  const pageSize = computed(() => makePageSize(gridRows.value, gridCols.value));
  const folderPageSize = computed(() => makePageSize(folderRows.value, folderCols.value));
  const initialPages = chunkIntoPages(appSeeds.map(makeApp), pageSize.value);

  const pages = shallowRef(initialPages);
  const pageIndex = ref(0);
  const searchQuery = ref("");
  const searchPageIndex = ref(0);
  const isDesktopOpen = ref(true);
  const isDesktopClosing = ref(false);
  const isAppLaunching = ref(false);
  const isFolderAppLaunchClosing = ref(false);
  const isEditMode = ref(false);
  const isTextlessMode = ref(false);
  const keyboardFocusArea = ref("desktop");
  const selectedIcon = shallowRef(null);
  const openingIcon = shallowRef(null);
  const launchGhost = shallowRef(null);
  const dragMeta = shallowRef(null);
  const pendingTargetId = ref(null);
  const openFolderId = ref(null);
  const renderedFolderId = ref(null);
  const folderPageIndex = ref(0);
  const isFolderClosing = ref(false);
  const folderClosingSnapshot = shallowRef(null);
  const folderMotionGeometry = ref({ id: null, x: 0, y: 36, scaleX: 0.1, scaleY: 0.16, borderRadius: 26 });
  const folderSession = shallowRef(null);
  const pageGridHeight = ref(0);
  const isHomeRevealSettling = ref(false);
  const desktopProjectionEpoch = ref(0);

  const rootRef = ref(null);
  const shellRef = ref(null);
  const headerRef = ref(null);
  const searchRef = ref(null);
  const searchInputRef = ref(null);
  const searchSummaryRef = ref(null);
  const desktopMainRef = ref(null);
  const pageDotsRef = ref(null);
  const folderPanelRef = ref(null);
  const dragPreviewRef = ref(null);
  const pageRefs = [];
  const folderPageRefs = [];
  let dragRuntime = null;
  let dragPlacement = null;
  let folderHover = null;
  let lastPlacementCommit = null;
  let pendingPreviewPoint = null;
  let previewRafId = 0;
  let pendingTimer = null;
  let pageTurnTimer = null;
  let folderPageTurnTimer = null;
  let folderCloseTimer = null;
  let homeRevealSettleTimer = null;
  let desktopCloseTimer = null;
  let appLaunchTimer = null;
  let launchGhostTimer = null;
  let folderAppLaunchTimer = null;
  let wheelPageLockUntil = 0;
  let dragListenersAttached = false;
  let longPressState = null;
  let altEditTimer = null;
  let isAltPressed = false;
  let layoutResizeObserver = null;

  const renderedFolder = computed(() => {
    if (!renderedFolderId.value) return folderClosingSnapshot.value;
    return findFolder(pages.value, renderedFolderId.value)?.item || folderClosingSnapshot.value;
  });

  const folderPages = computed(() => {
    if (!renderedFolder.value) return [];
    const minPageCount = dragRuntime && openFolderId.value === renderedFolder.value.id ? folderPageIndex.value + 1 : 1;
    return getVisibleFolderPages(renderedFolder.value, folderPageSize.value, minPageCount);
  });

  const isSearchMode = computed(() => searchQuery.value.trim().length > 0);
  const searchApps = computed(() => filterAppsForSearch(collectAppsFromPages(pages.value), searchQuery.value));
  const searchPages = computed(() => chunkIntoPages(searchApps.value, pageSize.value));
  const activePages = computed(() => (isSearchMode.value ? searchPages.value : pages.value));
  const activePageIndex = computed(() => (isSearchMode.value ? searchPageIndex.value : pageIndex.value));

  const desktopTrackAnimate = computed(() => ({ x: `-${pageIndex.value * 100}%` }));
  const searchTrackAnimate = computed(() => ({ x: `-${searchPageIndex.value * 100}%` }));
  const activeDesktopTrackAnimate = computed(() => (isSearchMode.value ? searchTrackAnimate.value : desktopTrackAnimate.value));
  const isFolderLayerActive = computed(() => Boolean(openFolderId.value || renderedFolderId.value || isFolderClosing.value || isFolderAppLaunchClosing.value));
  const shouldFreezeDesktopProjection = computed(() => Boolean(isFolderLayerActive.value || isHomeRevealSettling.value || !isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value));
  const shouldSnapDesktopTrack = computed(() => Boolean(isFolderLayerActive.value || isHomeRevealSettling.value || !isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value));
  const desktopLayoutEnabled = computed(() => !shouldFreezeDesktopProjection.value);
  const desktopProjectionKeyMode = computed(() => (desktopLayoutEnabled.value ? `enabled-${desktopProjectionEpoch.value}` : "frozen"));
  const activeDesktopTrackTransition = computed(() => (shouldSnapDesktopTrack.value ? instantTrackTransition : desktopTrackTransition));
  const desktopTrackMotionKey = computed(() => `${isDesktopOpen.value ? "open" : "closed"}-${isSearchMode.value ? "search" : "desktop"}-${shouldSnapDesktopTrack.value ? "snap" : "spring"}`);
  const folderTrackAnimate = computed(() => ({ x: `-${folderPageIndex.value * 100}%` }));
  const isDesktopAnimatingClosed = computed(() => Boolean(!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value));
  const shouldHideHomeShell = computed(() => Boolean((openFolderId.value && !isFolderClosing.value) || isDesktopAnimatingClosed.value));
  const isHomeInteractionDisabled = computed(() => Boolean(!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value));
  const homeShellInitial = { opacity: 0, scale: DESKTOP_CLOSE_SCALE, y: 0, filter: "blur(8px)" };
  const homeShellAnimate = computed(() => {
    if (isDesktopAnimatingClosed.value) return { opacity: 0, scale: DESKTOP_CLOSE_SCALE, y: 0, filter: "blur(8px)" };
    if (openFolderId.value && !isFolderClosing.value) return { opacity: 0, scale: 0.92, y: 44, filter: "blur(6px)" };
    return { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" };
  });
  const homeShellStyle = computed(() => ({
    pointerEvents: shouldHideHomeShell.value || isHomeInteractionDisabled.value ? "none" : "auto",
  }));
  const folderPanelInitial = computed(() => ({
    opacity: 0.92,
    scaleX: folderMotionGeometry.value.scaleX,
    scaleY: folderMotionGeometry.value.scaleY,
    x: folderMotionGeometry.value.x,
    y: folderMotionGeometry.value.y,
    borderRadius: `${folderMotionGeometry.value.borderRadius}px`,
  }));
  const folderPanelAnimate = computed(() => {
    if (isFolderAppLaunchClosing.value) {
      return { opacity: 0, scaleX: 1.08, scaleY: 1.08, x: 0, y: 0, borderRadius: "46px" };
    }
    if (isFolderClosing.value) {
      return {
        opacity: 0,
        scaleX: folderMotionGeometry.value.scaleX,
        scaleY: folderMotionGeometry.value.scaleY,
        x: folderMotionGeometry.value.x,
        y: folderMotionGeometry.value.y,
        borderRadius: `${folderMotionGeometry.value.borderRadius}px`,
      };
    }
    return { opacity: 1, scaleX: 1, scaleY: 1, x: 0, y: 0, borderRadius: "42px" };
  });
  const folderContentInitial = { opacity: 0, scale: 0.94, y: 18 };
  const folderContentAnimate = computed(() => {
    if (isFolderAppLaunchClosing.value) return { opacity: 0, scale: 1.08, y: 0 };
    return isFolderClosing.value
      ? { opacity: 0, scale: 0.96, y: 12 }
      : { opacity: 1, scale: 1, y: 0 };
  });
  const folderPanelStyle = computed(() => ({
    transformOrigin: "center center",
    pointerEvents: isFolderAppLaunchClosing.value ? "none" : "auto",
  }));
  const pageGridMeasureStyle = computed(() =>
    pageGridHeight.value > 0
      ? { height: `${pageGridHeight.value}px`, minHeight: `${pageGridHeight.value}px` }
      : {}
  );
  const pageGridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${gridCols.value}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${gridRows.value}, minmax(0, 1fr))`,
  }));
  const folderGridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${folderCols.value}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${folderRows.value}, minmax(0, 1fr))`,
  }));
  const launchGhostStyle = computed(() => {
    const ghost = launchGhost.value;
    if (!ghost?.rect) return {};
    return {
      left: `${ghost.rect.left}px`,
      top: `${ghost.rect.top}px`,
      width: `${ghost.rect.width}px`,
      height: `${ghost.rect.height}px`,
    };
  });

  function readCssPx(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getElementFromRef(nodeRef) {
    if (nodeRef && typeof nodeRef === "object" && "value" in nodeRef) return getDomRefElement(nodeRef.value);
    return getDomRefElement(nodeRef);
  }

  function getElementHeight(nodeRef) {
    const element = getElementFromRef(nodeRef);
    return element ? element.getBoundingClientRect().height : 0;
  }

  function getVerticalPadding(element) {
    if (!element || typeof window === "undefined") return 0;
    const styles = window.getComputedStyle(element);
    return readCssPx(styles.paddingTop) + readCssPx(styles.paddingBottom);
  }

  function getVerticalMargin(element) {
    if (!element || typeof window === "undefined") return 0;
    const styles = window.getComputedStyle(element);
    return readCssPx(styles.marginTop) + readCssPx(styles.marginBottom);
  }

  function updatePageGridMetrics() {
    if (typeof window === "undefined") return;
    const root = getElementFromRef(rootRef);
    const main = getElementFromRef(desktopMainRef);
    const rootPadding = getVerticalPadding(root);
    const mainPadding = getVerticalPadding(main);
    const headerHeight = getElementHeight(headerRef);
    const searchHeight = getElementHeight(searchRef);
    const summaryElement = getElementFromRef(searchSummaryRef);
    const summaryHeight = summaryElement ? summaryElement.getBoundingClientRect().height + getVerticalMargin(summaryElement) : 0;
    const dotsHeight = getElementHeight(pageDotsRef);
    const chromeHeight = rootPadding + headerHeight + searchHeight + summaryHeight + dotsHeight + mainPadding;
    const nextHeight = Math.max(280, Math.floor(window.innerHeight - chromeHeight));
    pageGridHeight.value = nextHeight;
  }

  function schedulePageGridMetrics() {
    nextTick(updatePageGridMetrics);
  }

  function getDesktopGridProjectionKey(pageNumber) {
    return `${isSearchMode.value ? "search" : "desktop"}-grid-${pageNumber}-${desktopProjectionKeyMode.value}`;
  }

  function getActivePageGridStyle(page) {
    if (!isSearchMode.value) return pageGridStyle.value;
    const visibleCount = getVisibleDesktopPage(page).length;
    if (visibleCount > 0 && visibleCount < gridCols.value) {
      return {
        ...pageGridStyle.value,
        gridTemplateColumns: `repeat(${visibleCount}, minmax(82px, 108px))`,
        justifyContent: "center",
        columnGap: "30px",
        rowGap: "16px",
      };
    }
    return pageGridStyle.value;
  }

  function setPageRef(node, targetPageIndex) {
    if (!node) return;
    pageRefs[targetPageIndex] = node.$el || node;
  }

  function setFolderPageRef(node, targetPageIndex) {
    if (!node) return;
    folderPageRefs[targetPageIndex] = node.$el || node;
  }

  function getDomRefElement(node) {
    if (!node) return null;
    return node.$el || node;
  }

  function placementKey(kind) {
    const parts = Array.prototype.slice.call(arguments, 1);
    return `${kind}:${parts.join(":")}`;
  }

  function commitPages(next) {
    const isProduction = typeof process !== "undefined" && process.env && process.env.NODE_ENV === "production";
    if (!isProduction) assertNoDuplicateItemIds(next);
    pages.value = next;
    if (renderedFolder.value) commitFolderPageIndex(folderPageIndex.value);
  }

  function commitPageIndex(next) {
    pageIndex.value = clamp(next, 0, Math.max(0, pages.value.length - 1));
  }

  function commitSearchPageIndex(next) {
    searchPageIndex.value = clamp(next, 0, Math.max(0, searchPages.value.length - 1));
  }

  function commitActivePageIndex(next) {
    if (isSearchMode.value) commitSearchPageIndex(next);
    else commitPageIndex(next);
  }

  function goNextActivePage() {
    if (isSearchMode.value) {
      if (searchPageIndex.value >= searchPages.value.length - 1) return;
      commitSearchPageIndex(searchPageIndex.value + 1);
      return;
    }
    goNextPage();
  }

  function commitFolderPageIndex(next, options) {
    const allowCreate = Boolean(options?.allowCreate);
    const maxIndex = Math.max(0, folderPages.value.length - 1 + (allowCreate ? 1 : 0));
    folderPageIndex.value = clamp(next, 0, maxIndex);
  }

  function turnFolderPage(direction) {
    commitFolderPageIndex(folderPageIndex.value + direction);
  }

  function renameFolder(folderId, name) {
    const nextName = String(name || "").slice(0, 32) || "新文件夹";
    const next = clonePages(pages.value);
    const folder = findFolder(next, folderId);
    if (!folder) return;
    folder.item.name = nextName;
    commitPages(next);
  }

  function repackPagesForGrid(nextRows, nextCols, nextFolderRows, nextFolderCols) {
    if (dragRuntime) return;
    const rows = clamp(Number(nextRows) || DEFAULT_ROWS, 2, 8);
    const cols = clamp(Number(nextCols) || DEFAULT_COLS, 3, 10);
    const nextFolderRowCount = clamp(Number(nextFolderRows) || DEFAULT_FOLDER_ROWS, 2, 6);
    const nextFolderColumnCount = clamp(Number(nextFolderCols) || DEFAULT_FOLDER_COLS, 2, 8);
    const newPageSize = makePageSize(rows, cols);
    const oldPageSize = pageSize.value;
    const oldFolderPageSize = folderPageSize.value;
    const newFolderPageSize = makePageSize(nextFolderRowCount, nextFolderColumnCount);

    let next = clonePages(pages.value);

    if (newPageSize < oldPageSize) {
      for (let i = 0; i < next.length; i++) {
        while (next[i].length > newPageSize) {
          const overflow = next[i].pop();
          ensurePage(next, i + 1);
          next[i + 1].unshift(overflow);
        }
      }
    }

    next = repackFoldersForPageSize(next, oldFolderPageSize, newFolderPageSize);
    const compacted = compactPages(next, { folderPageSize: newFolderPageSize });

    gridRows.value = rows;
    gridCols.value = cols;
    folderRows.value = nextFolderRowCount;
    folderCols.value = nextFolderColumnCount;
    draftRows.value = rows;
    draftCols.value = cols;
    draftFolderRows.value = nextFolderRowCount;
    draftFolderCols.value = nextFolderColumnCount;
    commitPages(compacted);
    commitPageIndex(pageIndex.value);
    commitSearchPageIndex(searchPageIndex.value);
    commitFolderPageIndex(folderPageIndex.value);
  }

  function applyGridConfig() {
    repackPagesForGrid(draftRows.value, draftCols.value, draftFolderRows.value, draftFolderCols.value);
    schedulePageGridMetrics();
  }

  function handleSearchInput(event) {
    const nextQuery = event?.target?.value || "";
    searchQuery.value = nextQuery;
    commitSearchPageIndex(0);
    if (nextQuery.trim() && !dragRuntime && openFolderId.value) commitOpenFolder(null);
    if (nextQuery.trim()) nextTick(() => selectFirstIconInCurrentScope({ force: true }));
    else clearSelectedIcon();
    schedulePageGridMetrics();
  }

  function clearSearch(options) {
    searchQuery.value = "";
    commitSearchPageIndex(0);
    if (options?.selectFirst) nextTick(() => selectFirstIconInCurrentScope({ force: true }));
    else if (!options?.keepSelection) clearSelectedIcon();
    schedulePageGridMetrics();
  }

  function clearSelectedIcon() {
    selectedIcon.value = null;
  }

  function clearOpeningIcon() {
    openingIcon.value = null;
  }

  function makeIconSelection(area, item, pageNumber, folderId) {
    if (!item) return null;
    return {
      area,
      id: item.id,
      pageIndex: Math.max(0, Number(pageNumber) || 0),
      folderId: folderId || null,
    };
  }

  function isIconSelected(area, itemId, pageNumber, folderId) {
    const selected = selectedIcon.value;
    return Boolean(
      selected &&
        selected.area === area &&
        selected.id === itemId &&
        selected.pageIndex === pageNumber &&
        (area !== "folder" || selected.folderId === folderId)
    );
  }

  function isIconOpening(area, itemId, pageNumber, folderId) {
    const opening = openingIcon.value;
    return Boolean(
      opening &&
        opening.area === area &&
        opening.id === itemId &&
        opening.pageIndex === pageNumber &&
        (area !== "folder" || opening.folderId === folderId)
    );
  }

  function getCurrentIconScope() {
    if (renderedFolder.value && (openFolderId.value || isFolderClosing.value || isFolderAppLaunchClosing.value)) {
      const pageNumber = clamp(folderPageIndex.value, 0, Math.max(0, folderPages.value.length - 1));
      return {
        area: "folder",
        pageIndex: pageNumber,
        folderId: renderedFolder.value.id,
        items: getVisibleFolderPage(folderPages.value[pageNumber] || []),
        columns: folderCols.value,
      };
    }

    if (isSearchMode.value) {
      const pageNumber = clamp(searchPageIndex.value, 0, Math.max(0, searchPages.value.length - 1));
      return {
        area: "search",
        pageIndex: pageNumber,
        folderId: null,
        items: getVisibleDesktopPage(searchPages.value[pageNumber] || []),
        columns: gridCols.value,
      };
    }

    const pageNumber = clamp(pageIndex.value, 0, Math.max(0, pages.value.length - 1));
    return {
      area: "desktop",
      pageIndex: pageNumber,
      folderId: null,
      items: getVisibleDesktopPage(pages.value[pageNumber] || []),
      columns: gridCols.value,
    };
  }

  function selectionMatchesScope(selection, scope) {
    return Boolean(
      selection &&
        scope &&
        selection.area === scope.area &&
        selection.pageIndex === scope.pageIndex &&
        (scope.area !== "folder" || selection.folderId === scope.folderId)
    );
  }

  function selectIconInScope(scope, item) {
    selectedIcon.value = makeIconSelection(scope.area, item, scope.pageIndex, scope.folderId);
  }

  function selectFirstIconInCurrentScope(options) {
    const scope = getCurrentIconScope();
    const first = scope.items[0] || null;
    if (!first) {
      clearSelectedIcon();
      return false;
    }
    if (!options?.force && selectionMatchesScope(selectedIcon.value, scope)) return true;
    selectIconInScope(scope, first);
    return true;
  }

  function moveSelectionByArrow(key) {
    const scope = getCurrentIconScope();
    const items = scope.items || [];
    if (!items.length) {
      clearSelectedIcon();
      return;
    }

    const current = selectionMatchesScope(selectedIcon.value, scope)
      ? items.findIndex((item) => item.id === selectedIcon.value.id)
      : -1;

    if (current < 0) {
      selectIconInScope(scope, items[0]);
      return;
    }

    const columns = Math.max(1, scope.columns || 1);
    let nextIndex = current;
    if (key === "ArrowLeft") nextIndex = current - 1;
    if (key === "ArrowRight") nextIndex = current + 1;
    if (key === "ArrowUp") nextIndex = current - columns;
    if (key === "ArrowDown") nextIndex = current + columns;
    nextIndex = clamp(nextIndex, 0, items.length - 1);
    selectIconInScope(scope, items[nextIndex]);
  }

  function findSelectedItem() {
    const scope = getCurrentIconScope();
    const selected = selectedIcon.value;
    if (!selectionMatchesScope(selected, scope)) return null;
    const item = scope.items.find((candidate) => candidate.id === selected.id);
    return item ? { item, scope } : null;
  }

  function isLaunchpadInteractionBlocked() {
    return Boolean(!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value || isFolderAppLaunchClosing.value);
  }

  function openSelectedIcon() {
    const selected = findSelectedItem();
    if (!selected) {
      selectFirstIconInCurrentScope({ force: true });
      return;
    }

    if (selected.item.type === "folder" && selected.scope.area === "desktop") {
      commitOpenFolder(selected.item.id);
      clearSelectedIcon();
      return;
    }

    if (selected.item.type === "app") {
      const source =
        selected.scope.area === "folder"
          ? { type: "folder", folderId: selected.scope.folderId, pageIndex: selected.scope.pageIndex }
          : { type: selected.scope.area === "search" ? "search" : "page", pageIndex: selected.scope.pageIndex };
      openApp(selected.item, source);
    }
  }

  function normalizeLaunchSource(app, source) {
    if (source?.type === "folder") {
      return { area: "folder", id: app.id, pageIndex: source.pageIndex ?? 0, folderId: source.folderId || renderedFolder.value?.id || null };
    }
    if (source?.type === "search") {
      return { area: "search", id: app.id, pageIndex: source.pageIndex ?? searchPageIndex.value, folderId: null };
    }
    if (source?.type === "page") {
      return { area: "desktop", id: app.id, pageIndex: source.pageIndex ?? pageIndex.value, folderId: null };
    }

    const selected = selectedIcon.value;
    if (selected?.id === app.id) return { ...selected };

    if (renderedFolder.value) {
      const inFolder = findInFolder(pages.value, renderedFolder.value.id, app.id);
      if (inFolder) return { area: "folder", id: app.id, pageIndex: inFolder.pageIndex, folderId: renderedFolder.value.id };
    }

    if (isSearchMode.value) {
      for (let currentPage = 0; currentPage < searchPages.value.length; currentPage += 1) {
        if ((searchPages.value[currentPage] || []).some((item) => item.id === app.id)) {
          return { area: "search", id: app.id, pageIndex: currentPage, folderId: null };
        }
      }
    }

    const topLevel = findTopLevel(pages.value, app.id);
    if (topLevel) return { area: "desktop", id: app.id, pageIndex: topLevel.pageIndex, folderId: null };
    return { area: "desktop", id: app.id, pageIndex: pageIndex.value, folderId: null };
  }

  function makeLaunchIconSelector(launchSource) {
    if (!launchSource?.id) return null;
    const id = escapeAttributeValue(launchSource.id);
    const area = escapeAttributeValue(launchSource.area);
    const page = Number.isFinite(Number(launchSource.pageIndex)) ? Number(launchSource.pageIndex) : 0;
    let selector = `.icon-hit-target[data-launch-item-id="${id}"][data-launch-area="${area}"][data-launch-page-index="${page}"]`;
    if (launchSource.area === "folder" && launchSource.folderId) {
      selector += `[data-launch-folder-id="${escapeAttributeValue(launchSource.folderId)}"]`;
    }
    return `${selector} .icon-box`;
  }

  function getLaunchIconRect(launchSource) {
    if (typeof document === "undefined") return null;
    const selector = makeLaunchIconSelector(launchSource);
    const node = selector ? document.querySelector(selector) : null;
    const rect = node?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function startAppLaunchGhost(app, launchSource) {
    const rect = getLaunchIconRect(launchSource);
    if (!rect) {
      clearLaunchGhost();
      return;
    }
    clearLaunchGhostTimer();
    launchGhost.value = { app: cloneItem(app), rect };
    launchGhostTimer = window.setTimeout(clearLaunchGhost, APP_LAUNCH_DURATION + 100);
  }

  function clearDesktopCloseTimer() {
    if (desktopCloseTimer) window.clearTimeout(desktopCloseTimer);
    desktopCloseTimer = null;
  }

  function clearAppLaunchTimer() {
    if (appLaunchTimer) window.clearTimeout(appLaunchTimer);
    appLaunchTimer = null;
  }

  function clearLaunchGhostTimer() {
    if (launchGhostTimer) window.clearTimeout(launchGhostTimer);
    launchGhostTimer = null;
  }

  function clearLaunchGhost() {
    clearLaunchGhostTimer();
    launchGhost.value = null;
  }

  function clearFolderAppLaunchTimer() {
    if (folderAppLaunchTimer) window.clearTimeout(folderAppLaunchTimer);
    folderAppLaunchTimer = null;
  }

  function focusDesktopSurface() {
    keyboardFocusArea.value = "desktop";
    const element = getElementFromRef(desktopMainRef);
    element?.focus?.({ preventScroll: true });
  }

  function closeDesktop(options) {
    if (dragRuntime) return;
    cancelLongPress();
    const shouldClearSearchAfterClose = Boolean(options?.clearSearch && isSearchMode.value);
    clearSelectedIcon();
    keyboardFocusArea.value = "desktop";
    searchInputRef.value?.blur?.();
    isDesktopClosing.value = true;
    isDesktopOpen.value = false;
    clearDesktopCloseTimer();
    desktopCloseTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterClose) clearSearch({ keepSelection: false });
      isDesktopClosing.value = false;
      clearDesktopCloseTimer();
    }, DESKTOP_CLOSE_DURATION);
  }

  function openDesktop() {
    clearDesktopCloseTimer();
    clearAppLaunchTimer();
    clearLaunchGhost();
    clearOpeningIcon();
    startHomeRevealSettleWindow();
    isDesktopClosing.value = false;
    isAppLaunching.value = false;
    isDesktopOpen.value = true;
    keyboardFocusArea.value = "desktop";
    nextTick(() => {
      schedulePageGridMetrics();
      focusDesktopSurface();
    });
  }

  function startFolderAppLaunchClose() {
    if (!renderedFolder.value || isFolderAppLaunchClosing.value) return;
    const closingId = renderedFolderId.value || openFolderId.value || renderedFolder.value.id;
    const current = closingId ? findFolder(pages.value, closingId)?.item : null;
    folderClosingSnapshot.value = current ? cloneItem(current) : cloneItem(renderedFolder.value);
    openFolderId.value = null;
    isFolderClosing.value = false;
    isFolderAppLaunchClosing.value = true;
    clearFolderPageTurn();
    clearFolderCloseTimer();
    clearFolderAppLaunchTimer();
    folderAppLaunchTimer = window.setTimeout(() => {
      renderedFolderId.value = null;
      folderClosingSnapshot.value = null;
      isFolderAppLaunchClosing.value = false;
      folderPageIndex.value = 0;
      folderPageRefs.length = 0;
      clearFolderAppLaunchTimer();
    }, FOLDER_APP_LAUNCH_DURATION);
  }

  function openApp(app, source) {
    if (!app || app.type !== "app" || dragRuntime || isLaunchpadInteractionBlocked()) return;

    const launchSource = normalizeLaunchSource(app, source);
    const shouldClearSearchAfterLaunch = isSearchMode.value;
    startAppLaunchGhost(app, launchSource);
    openingIcon.value = launchSource;
    isAppLaunching.value = true;

    if (renderedFolder.value || openFolderId.value) startFolderAppLaunchClose();
    closeDesktop({ clearSearch: false });

    clearAppLaunchTimer();
    appLaunchTimer = window.setTimeout(() => {
      if (shouldClearSearchAfterLaunch) clearSearch({ keepSelection: false });
      clearOpeningIcon();
      isAppLaunching.value = false;
      clearAppLaunchTimer();
    }, APP_LAUNCH_DURATION);
  }

  function removeAppById(appId) {
    if (!appId || dragRuntime) return;
    cancelLongPress();
    const openedFolderId = openFolderId.value;
    const next = removeEverywhere(pages.value, appId);
    commitPages(next);
    if (openedFolderId && !findFolder(next, openedFolderId)) commitOpenFolder(null);
    commitPageIndex(pageIndex.value);
    commitSearchPageIndex(searchPageIndex.value);
  }

  function escapeAttributeValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function getFolderPanelTargetSize() {
    if (typeof window === "undefined") return { width: 760, height: 420 };
    const width = Math.min(760, window.innerWidth * 0.94);
    const hasFolderDots = folderPages.value.length > 1;
    const estimatedContentHeight = 28 * 2 + 62 + 18 + 268 + (hasFolderDots ? 26 : 0);
    const height = Math.min(Math.max(360, estimatedContentHeight), Math.max(280, window.innerHeight - 48));
    return { width, height };
  }

  function getFallbackFolderMotionGeometry(folderId) {
    return { id: folderId || null, x: 0, y: 36, scaleX: 0.1, scaleY: 0.16, borderRadius: 26 };
  }

  function makeFolderMotionGeometryFromRect(folderId, rect) {
    if (!rect || typeof window === "undefined") return getFallbackFolderMotionGeometry(folderId);
    const target = getFolderPanelTargetSize();
    return {
      id: folderId || null,
      x: rect.left + rect.width / 2 - window.innerWidth / 2,
      y: rect.top + rect.height / 2 - window.innerHeight / 2,
      scaleX: clamp(rect.width / target.width, 0.06, 0.3),
      scaleY: clamp(rect.height / target.height, 0.08, 0.32),
      borderRadius: Math.min(30, rect.width * 0.38),
    };
  }

  function getTopLevelIconMotionGeometry(sourceItemId, motionId) {
    const safeId = escapeAttributeValue(sourceItemId);
    const node = safeId ? document.querySelector(`[data-top-item-id="${safeId}"] .icon-box`) : null;
    const rect = node?.getBoundingClientRect();
    return rect ? makeFolderMotionGeometryFromRect(motionId || sourceItemId, rect) : null;
  }

  function getPageSlotMotionGeometry(folderId, targetPageIndex, targetIndex) {
    if (typeof window === "undefined") return null;
    const page = pageRefs[targetPageIndex];
    const rect = page?.getBoundingClientRect?.();
    if (!rect) return null;

    const col = clamp(targetIndex % gridCols.value, 0, Math.max(0, gridCols.value - 1));
    const row = clamp(Math.floor(targetIndex / gridCols.value), 0, Math.max(0, gridRows.value - 1));
    const cellWidth = rect.width / Math.max(1, gridCols.value);
    const cellHeight = rect.height / Math.max(1, gridRows.value);
    const boxSize = Math.min(70, cellWidth, cellHeight);
    const boxRect = {
      left: rect.left + col * cellWidth + (cellWidth - boxSize) / 2,
      top: rect.top + row * cellHeight + (cellHeight - boxSize) / 2,
      width: boxSize,
      height: boxSize,
    };
    return makeFolderMotionGeometryFromRect(folderId, boxRect);
  }

  function getFolderIconMotionGeometry(folderId) {
    return getTopLevelIconMotionGeometry(folderId, folderId) || getFallbackFolderMotionGeometry(folderId);
  }

  function clearFolderCloseTimer() {
    if (folderCloseTimer) window.clearTimeout(folderCloseTimer);
    folderCloseTimer = null;
  }

  function clearHomeRevealSettleTimer() {
    if (homeRevealSettleTimer) window.clearTimeout(homeRevealSettleTimer);
    homeRevealSettleTimer = null;
  }

  function finishHomeRevealSettleWindow() {
    clearHomeRevealSettleTimer();
    if (!isHomeRevealSettling.value) return;
    desktopProjectionEpoch.value += 1;
    isHomeRevealSettling.value = false;
    pageRefs.length = 0;
  }

  function startHomeRevealSettleWindow() {
    clearHomeRevealSettleTimer();
    isHomeRevealSettling.value = true;
    homeRevealSettleTimer = window.setTimeout(finishHomeRevealSettleWindow, HOME_REVEAL_SETTLE_DURATION);
  }

  function commitOpenFolder(next, options) {
    if (next) {
      const isSameFolder = openFolderId.value === next && renderedFolderId.value === next;
      const originGeometry = options?.originGeometry;
      clearFolderCloseTimer();
      clearFolderAppLaunchTimer();
      finishHomeRevealSettleWindow();
      isFolderClosing.value = false;
      isFolderAppLaunchClosing.value = false;
      folderClosingSnapshot.value = null;
      folderMotionGeometry.value = originGeometry ? { ...originGeometry, id: next } : getFolderIconMotionGeometry(next);
      openFolderId.value = next;
      renderedFolderId.value = next;
      if (!isSameFolder) folderPageIndex.value = 0;
      return;
    }

    const closingId = renderedFolderId.value || openFolderId.value;
    const current = closingId ? findFolder(pages.value, closingId)?.item : null;
    const fallback = renderedFolder.value;
    folderClosingSnapshot.value = current ? cloneItem(current) : fallback ? cloneItem(fallback) : null;
    if (!folderMotionGeometry.value?.id || folderMotionGeometry.value.id !== closingId) {
      folderMotionGeometry.value = getFolderIconMotionGeometry(closingId);
    }
    openFolderId.value = null;
    isFolderClosing.value = true;
    startHomeRevealSettleWindow();
    clearFolderPageTurn();
    clearFolderCloseTimer();
    folderCloseTimer = window.setTimeout(() => {
      renderedFolderId.value = null;
      folderClosingSnapshot.value = null;
      isFolderClosing.value = false;
      folderPageIndex.value = 0;
      folderPageRefs.length = 0;
      clearFolderCloseTimer();
    }, FOLDER_CLOSE_DURATION);
  }

  function commitFolderSession(next) {
    folderSession.value = next;
  }

  function clearPendingTarget() {
    if (pendingTimer) window.clearTimeout(pendingTimer.timer);
    pendingTimer = null;
    folderHover = null;
    pendingTargetId.value = null;
  }

  function clearPendingTimerButKeepSticky() {
    if (pendingTimer) window.clearTimeout(pendingTimer.timer);
    pendingTimer = null;
    pendingTargetId.value = null;
  }

  function clearPageTurn() {
    if (pageTurnTimer) window.clearTimeout(pageTurnTimer.timer);
    pageTurnTimer = null;
  }

  function clearFolderPageTurn() {
    if (folderPageTurnTimer) window.clearTimeout(folderPageTurnTimer.timer);
    folderPageTurnTimer = null;
  }

  function attachDragListeners() {
    if (dragListenersAttached) return;
    dragListenersAttached = true;
    window.addEventListener("pointermove", updateDragPointer, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
  }

  function detachDragListeners() {
    if (!dragListenersAttached) return;
    dragListenersAttached = false;
    window.removeEventListener("pointermove", updateDragPointer);
    window.removeEventListener("pointerup", finishDrag);
    window.removeEventListener("pointercancel", finishDrag);
  }

  function updatePreviewElement() {
    previewRafId = 0;
    if (!pendingPreviewPoint || !dragRuntime) return;
    const preview = getDomRefElement(dragPreviewRef.value);
    if (!preview) return;
    preview.style.transform = makePreviewTransform(pendingPreviewPoint, dragRuntime.offset);
  }

  function schedulePreviewPosition(clientX, clientY) {
    pendingPreviewPoint = { x: clientX, y: clientY };
    if (previewRafId) return;
    previewRafId = window.requestAnimationFrame(updatePreviewElement);
  }

  function cancelPreviewRaf() {
    if (previewRafId) window.cancelAnimationFrame(previewRafId);
    previewRafId = 0;
    pendingPreviewPoint = null;
  }

  function endDrag() {
    const shouldClampFolderPage = Boolean(renderedFolder.value || openFolderId.value);
    detachDragListeners();
    cancelPreviewRaf();
    dragRuntime = null;
    dragMeta.value = null;
    dragPlacement = null;
    folderHover = null;
    lastPlacementCommit = null;
    if (shouldClampFolderPage) commitFolderPageIndex(folderPageIndex.value);
    commitPageIndex(pageIndex.value);
  }

  function calcPageInsertIndex(clientX, clientY, targetPageIndex) {
    const safePageIndex = typeof targetPageIndex === "number" ? targetPageIndex : pageIndex.value;
    const page = pageRefs[safePageIndex];
    if (!page) return pages.value[safePageIndex]?.length || 0;

    const rect = page.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / (rect.width / gridCols.value)), 0, gridCols.value - 1);
    const row = clamp(Math.floor(y / (rect.height / gridRows.value)), 0, gridRows.value - 1);
    return clamp(row * gridCols.value + col, 0, pageSize.value - 1);
  }

  function getCurrentFolderGridElement() {
    return folderPageRefs[folderPageIndex.value] || null;
  }

  function isInsideCurrentFolderGrid(clientX, clientY) {
    const grid = getCurrentFolderGridElement();
    const rect = grid?.getBoundingClientRect();
    return rect ? isPointInsideRect(rect, clientX, clientY) : false;
  }

  function calcFolderInsertTarget(clientX, clientY) {
    const grid = getCurrentFolderGridElement();
    const folder = openFolderId.value ? findFolder(pages.value, openFolderId.value)?.item : null;
    if (!grid || !folder) {
      const fallbackPages = getFolderChildPages(folder, folderPageSize.value);
      const fallbackPageIndex = clamp(folderPageIndex.value, 0, Math.max(0, fallbackPages.length - 1));
      return { pageIndex: fallbackPageIndex, index: fallbackPages[fallbackPageIndex]?.length || 0 };
    }

    const rect = grid.getBoundingClientRect();
    const cellWidth = rect.width / folderCols.value;
    const cellHeight = rect.height / folderRows.value;
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / cellWidth), 0, folderCols.value - 1);
    const row = clamp(Math.floor(y / cellHeight), 0, folderRows.value - 1);
    return { pageIndex: folderPageIndex.value, index: row * folderCols.value + col };
  }

  function getTopLevelTargetAtPoint(clientX, clientY) {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const element of elements) {
      const node = element.closest?.("[data-top-item-id]");
      const id = node?.getAttribute("data-top-item-id");
      if (!id || id === dragRuntime?.item.id) continue;
      const found = findTopLevel(pages.value, id);
      if (found) return { item: found.item, node };
    }
    return null;
  }

  function isInsideFolderHitZone(targetInfo, clientX, clientY) {
    if (!targetInfo?.node) return false;
    return isPointInsideRect(shrinkRect(targetInfo.node.getBoundingClientRect(), FOLDER_HIT_ZONE_SCALE), clientX, clientY);
  }

  function isInsideStickyFolderZone(clientX, clientY) {
    if (!folderHover?.stickyRect) return false;
    return isPointInsideRect(folderHover.stickyRect, clientX, clientY);
  }

  function lockFolderHoverTarget(targetInfo) {
    if (!targetInfo?.node) return;
    folderHover = { targetId: targetInfo.item.id, stickyRect: expandRect(targetInfo.node.getBoundingClientRect(), FOLDER_HOVER_STICKY_MARGIN) };
  }

  function startPendingFolderTarget(target) {
    if (pendingTimer?.targetId === target.id) return;
    clearPendingTimerButKeepSticky();
    pendingTargetId.value = target.id;

    pendingTimer = {
      targetId: target.id,
      timer: window.setTimeout(() => {
        const activeDrag = dragRuntime;
        if (!activeDrag || activeDrag.item.type !== "app") return;
        const latestTarget = findTopLevel(pages.value, target.id)?.item;
        if (!latestTarget || latestTarget.id === activeDrag.item.id) return;
        clearPendingTarget();
        if (latestTarget.type === "folder") openExistingFolderForDrop(latestTarget.id);
        else createFolderForDrop(latestTarget.id);
      }, FOLDER_HOVER_DELAY),
    };
  }

  function createFolderForDrop(targetAppId) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return;

    const withoutDragged = removeEverywhere(pages.value, activeDrag.item.id);
    const target = findTopLevel(withoutDragged, targetAppId);
    if (!target || target.item.type !== "app") return;

    const folderId = makeId("folder");
    const originGeometry =
      getTopLevelIconMotionGeometry(targetAppId, folderId) ||
      getPageSlotMotionGeometry(folderId, target.pageIndex, target.index);
    const next = clonePages(withoutDragged);
    next[target.pageIndex][target.index] = withFolderPages(
      { id: folderId, type: "folder", name: "新文件夹" },
      [[cloneItem(target.item)]]
    );

    dragPlacement = placementKey("folder-open", folderId);
    lastPlacementCommit = null;
    commitPages(compactPages(next));
    commitOpenFolder(folderId, { originGeometry });
    commitFolderSession({ mode: "created", folderId, targetApp: cloneItem(target.item), hasEntered: false, openedAt: Date.now() });
  }

  function openExistingFolderForDrop(folderId) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return;
    dragPlacement = placementKey("folder-open", folderId);
    lastPlacementCommit = null;
    commitPages(removeEverywhere(pages.value, activeDrag.item.id));
    commitOpenFolder(folderId);
    commitFolderSession({ mode: "existing", folderId, hasEntered: false, openedAt: Date.now() });
  }

  function cancelFolderSessionAndReturnToDesktop(options) {
    const activeDrag = dragRuntime;
    const session = folderSession.value;
    if (!activeDrag || !session) return;

    const safeOptions = options || {};
    let next = removeEverywhere(pages.value, activeDrag.item.id);
    if (session.mode === "created" && session.targetApp) next = replaceFolderWithItem(next, session.folderId, session.targetApp);
    const insertIndex = calcPageInsertIndex(activeDrag.pointer.x, activeDrag.pointer.y);
    const shouldCommitOverflow = Boolean(safeOptions.force) || !wouldTopLevelInsertOverflow(next, activeDrag.item, pageIndex.value, pageSize.value);
    next = shouldCommitOverflow
      ? insertTopLevelItem(next, activeDrag.item, pageIndex.value, insertIndex, pageSize.value)
      : previewTopLevelItemWithoutOverflow(next, activeDrag.item, pageIndex.value, insertIndex, pageSize.value);
    dragPlacement = placementKey("page", pageIndex.value, insertIndex);

    commitOpenFolder(null);
    commitFolderSession(null);
    commitPages(next);
    clearPendingTarget();
    commitFolderPageIndex(folderPageIndex.value);
  }

  function shouldCommitPlacement(key, clientX, clientY, minDistance, force) {
    return shouldCommitPlacementFromLast(lastPlacementCommit, clientX, clientY, minDistance, Boolean(force));
  }

  function rememberPlacementCommit(key, clientX, clientY) {
    lastPlacementCommit = { key, x: clientX, y: clientY };
  }

  function placeDraggedItemOnDesktop(clientX, clientY, options) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;
    const safeOptions = options || {};
    const insertIndex = calcPageInsertIndex(clientX, clientY);
    const key = placementKey("page", pageIndex.value, insertIndex);
    const isAlreadyVisible = Boolean(findTopLevel(pages.value, activeDrag.item.id));
    const needsMove = dragPlacement !== key || !isAlreadyVisible;
    if (!needsMove) return;
    const wouldOverflow = wouldTopLevelInsertOverflow(pages.value, activeDrag.item, pageIndex.value, pageSize.value);
    if (!shouldCommitPlacement(key, clientX, clientY, DESKTOP_SORT_MIN_DISTANCE, safeOptions.force || !isAlreadyVisible)) return;

    const next = safeOptions.force || !wouldOverflow
      ? insertTopLevelItem(pages.value, activeDrag.item, pageIndex.value, insertIndex, pageSize.value)
      : previewTopLevelItemWithoutOverflow(pages.value, activeDrag.item, pageIndex.value, insertIndex, pageSize.value);
    dragPlacement = key;
    rememberPlacementCommit(key, clientX, clientY);
    commitPages(next);
  }

  function placeDraggedItemInFolder(folderId, clientX, clientY, options) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return;
    const safeOptions = options || {};
    const target = calcFolderInsertTarget(clientX, clientY);
    const key = placementKey("folder", folderId, target.pageIndex, target.index);
    const existing = findInFolder(pages.value, folderId, activeDrag.item.id);
    const needsMove = dragPlacement !== key || !existing || existing.pageIndex !== target.pageIndex || existing.index !== target.index;
    if (!needsMove) return;
    const wouldOverflow = wouldFolderInsertOverflow(pages.value, folderId, activeDrag.item, target.pageIndex, folderPageSize.value);
    if (!shouldCommitPlacement(key, clientX, clientY, FOLDER_SORT_MIN_DISTANCE, safeOptions.force || !existing)) return;

    const next = safeOptions.force || !wouldOverflow
      ? insertAppIntoFolder(pages.value, folderId, activeDrag.item, target.pageIndex, target.index, folderPageSize.value)
      : previewAppIntoFolderWithoutOverflow(pages.value, folderId, activeDrag.item, target.pageIndex, target.index, folderPageSize.value);
    dragPlacement = key;
    rememberPlacementCommit(key, clientX, clientY);
    commitPages(next);
  }

  function handleFolderSessionMove(clientX, clientY) {
    const activeDrag = dragRuntime;
    const session = folderSession.value;
    const folderId = openFolderId.value;
    if (!activeDrag || !session || !folderId) return false;

    const panel = getDomRefElement(folderPanelRef.value);
    const rect = panel?.getBoundingClientRect();
    const inside = rect ? isPointInsideRect(rect, clientX, clientY) : false;

    clearPendingTarget();

    if (inside) {
      if (!session.hasEntered) commitFolderSession({ ...session, hasEntered: true });
      if (isInsideCurrentFolderGrid(clientX, clientY)) placeDraggedItemInFolder(folderId, clientX, clientY);
      return true;
    }

    if (!session.hasEntered) return true;

    cancelFolderSessionAndReturnToDesktop();
    return true;
  }

  function handlePageEdgeTurn(clientX) {
    const width = window.innerWidth;
    const direction = clientX > width - PAGE_EDGE_SIZE ? 1 : clientX < PAGE_EDGE_SIZE ? -1 : 0;
    if (!direction) {
      clearPageTurn();
      return;
    }
    if (pageTurnTimer?.direction === direction) return;
    clearPageTurn();

    pageTurnTimer = {
      direction,
      timer: window.setTimeout(() => {
        const currentPage = pageIndex.value;
        dragPlacement = null;
        lastPlacementCommit = null;
        if (direction < 0) {
          commitPageIndex(Math.max(0, currentPage - 1));
          return;
        }
        if (currentPage >= pages.value.length - 1) {
          const draggedItemId = dragRuntime?.item?.id;
          if (!canCreateDesktopPageAfterDrag(pages.value, currentPage, draggedItemId)) return;
          commitPages([...pages.value, []]);
        }
        commitPageIndex(currentPage + 1);
      }, PAGE_TURN_DELAY),
    };
  }

  function handleFolderPageEdgeTurn(clientX, clientY) {
    const panel = getDomRefElement(folderPanelRef.value);
    const rect = panel?.getBoundingClientRect();
    if (!rect || !isPointInsideRect(rect, clientX, clientY)) {
      clearFolderPageTurn();
      return;
    }

    const direction = clientX < rect.left + FOLDER_PAGE_EDGE_SIZE ? -1 : clientX > rect.right - FOLDER_PAGE_EDGE_SIZE ? 1 : 0;
    if (!direction) {
      clearFolderPageTurn();
      return;
    }

    if (direction < 0 && folderPageIndex.value <= 0) {
      clearFolderPageTurn();
      return;
    }

    if (folderPageTurnTimer?.direction === direction) return;
    clearFolderPageTurn();

    folderPageTurnTimer = {
      direction,
      timer: window.setTimeout(() => {
        const currentPage = folderPageIndex.value;
        dragPlacement = null;
        lastPlacementCommit = null;
        if (direction < 0) commitFolderPageIndex(currentPage - 1);
        else {
          const isCreatingNewPage = currentPage >= folderPages.value.length - 1;
          if (isCreatingNewPage) {
            const folder = openFolderId.value ? findFolder(pages.value, openFolderId.value)?.item : null;
            const draggedItemId = dragRuntime?.item?.id;
            if (!canCreateFolderPageAfterDrag(folder, currentPage, draggedItemId, folderPageSize.value)) return;
          }
          commitFolderPageIndex(currentPage + 1, { allowCreate: true });
        }
        folderPageTurnTimer = null;
      }, PAGE_TURN_DELAY),
    };
  }

  function handleDefaultDesktopMove(clientX, clientY) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;

    if (activeDrag.item.type === "app") {
      const targetInfo = getTopLevelTargetAtPoint(clientX, clientY);
      const targetStillSticky = pendingTimer && isInsideStickyFolderZone(clientX, clientY);
      if (targetInfo && isInsideFolderHitZone(targetInfo, clientX, clientY)) {
        lockFolderHoverTarget(targetInfo);
        startPendingFolderTarget(targetInfo.item);
        return;
      }
      if (targetStillSticky) return;
      clearPendingTarget();
    } else {
      clearPendingTarget();
    }

    placeDraggedItemOnDesktop(clientX, clientY);
  }

  function cancelLongPress() {
    if (!longPressState) return;
    window.clearTimeout(longPressState.timer);
    longPressState = null;
    window.removeEventListener("pointermove", handleLongPressMove);
    window.removeEventListener("pointerup", handleLongPressUp);
    window.removeEventListener("pointercancel", handleLongPressUp);
  }

  function clearAltEditTimer() {
    if (altEditTimer) window.clearTimeout(altEditTimer);
    altEditTimer = null;
  }

  function enterEditModeFromAlt() {
    altEditTimer = null;
    if (isAltPressed) isEditMode.value = true;
  }

  function isAltKeyEvent(event) {
    return event.key === "Alt" || event.key === "Option" || event.code === "AltLeft" || event.code === "AltRight";
  }

  function handleAltKeyDown(event) {
    if (!isAltKeyEvent(event) || event.repeat || isAltPressed || dragRuntime) return;
    isAltPressed = true;
    clearAltEditTimer();
    altEditTimer = window.setTimeout(enterEditModeFromAlt, ALT_EDIT_DELAY);
  }

  function handleAltKeyUp(event) {
    if (!isAltKeyEvent(event)) return;
    isAltPressed = false;
    clearAltEditTimer();
    isEditMode.value = false;
  }

  function handleWindowBlur() {
    isAltPressed = false;
    clearAltEditTimer();
    isEditMode.value = false;
  }

  function handleLongPressMove(event) {
    if (!longPressState) return;
    const dist = Math.hypot(event.clientX - longPressState.startPoint.x, event.clientY - longPressState.startPoint.y);
    if (dist > LONG_PRESS_MOVE_THRESHOLD) cancelLongPress();
  }

  function handleLongPressUp(_event) {
    if (!longPressState) return;
    const lp = longPressState;
    cancelLongPress();
    if (isLaunchpadInteractionBlocked()) return;
    if (lp.item.type === "app") openApp(lp.item, lp.source);
    else if (lp.item.type === "folder" && lp.source.type === "page") commitOpenFolder(lp.item.id);
  }

  function executeDragStart() {
    const lp = longPressState;
    if (!lp) return;
    if (isLaunchpadInteractionBlocked()) {
      cancelLongPress();
      return;
    }
    if (isHomeRevealSettling.value && !isFolderLayerActive.value) finishHomeRevealSettleWindow();
    window.removeEventListener("pointermove", handleLongPressMove);
    window.removeEventListener("pointerup", handleLongPressUp);
    window.removeEventListener("pointercancel", handleLongPressUp);
    longPressState = null;

    clearPendingTarget();
    clearPageTurn();
    clearFolderPageTurn();

    const nextDrag = {
      item: lp.item,
      source: lp.source,
      pointer: { x: lp.startPoint.x, y: lp.startPoint.y },
      offset: lp.offset,
      start: { x: lp.startPoint.x, y: lp.startPoint.y },
      hasMoved: false,
    };

    dragRuntime = nextDrag;
    dragMeta.value = { item: nextDrag.item, source: nextDrag.source };
    dragPlacement = lp.source.type === "page" ? placementKey("page", lp.source.pageIndex, lp.source.index) : null;
    lastPlacementCommit = { key: dragPlacement, x: lp.startPoint.x, y: lp.startPoint.y };
    attachDragListeners();
    nextTick(() => schedulePreviewPosition(lp.startPoint.x, lp.startPoint.y));

    if (lp.source.type === "folder") {
      commitPages(removeEverywhere(pages.value, lp.item.id, { preserveFolderIds: [lp.source.folderId] }));
      commitFolderSession({ mode: "source-folder", folderId: lp.source.folderId, hasEntered: true, openedAt: Date.now() });
    }
  }

  function beginDrag(event, item, source) {
    event.preventDefault();
    event.stopPropagation();

    if (isLaunchpadInteractionBlocked() || dragRuntime || longPressState) return;

    cancelLongPress();

    const iconBox = event.currentTarget.querySelector('.icon-box');
    const rect = iconBox ? iconBox.getBoundingClientRect() : event.currentTarget.getBoundingClientRect();
    longPressState = {
      item: cloneItem(item),
      source,
      startPoint: { x: event.clientX, y: event.clientY },
      offset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      timer: window.setTimeout(executeDragStart, LONG_PRESS_DELAY),
    };

    window.addEventListener("pointermove", handleLongPressMove);
    window.addEventListener("pointerup", handleLongPressUp);
    window.addEventListener("pointercancel", handleLongPressUp);
  }

  function updateDragPointer(event) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;

    event.preventDefault();
    const distance = Math.hypot(event.clientX - activeDrag.start.x, event.clientY - activeDrag.start.y);
    activeDrag.pointer = { x: event.clientX, y: event.clientY };
    activeDrag.hasMoved = activeDrag.hasMoved || distance > 6;
    schedulePreviewPosition(event.clientX, event.clientY);

    if (folderSession.value || openFolderId.value) {
      clearPageTurn();
      handleFolderPageEdgeTurn(event.clientX, event.clientY);
    } else {
      clearFolderPageTurn();
      handlePageEdgeTurn(event.clientX);
    }

    if (folderSession.value && handleFolderSessionMove(event.clientX, event.clientY)) return;
    handleDefaultDesktopMove(event.clientX, event.clientY);
  }

  function finishDrag(event) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;
    if (isLaunchpadInteractionBlocked()) {
      endDrag();
      return;
    }

    activeDrag.pointer = { x: event.clientX, y: event.clientY };
    schedulePreviewPosition(event.clientX, event.clientY);

    clearPageTurn();
    clearFolderPageTurn();
    clearPendingTarget();

    const session = folderSession.value;
    const folderId = openFolderId.value;
    const movedDistance = Math.hypot(event.clientX - activeDrag.start.x, event.clientY - activeDrag.start.y);

    if (!session && movedDistance <= 6 && activeDrag.item.type === "folder" && activeDrag.source.type === "page") {
      commitOpenFolder(activeDrag.item.id);
      endDrag();
      return;
    }

    if (session && folderId && activeDrag.item.type === "app") {
      const panel = getDomRefElement(folderPanelRef.value);
      const rect = panel?.getBoundingClientRect();
      const inside = rect ? isPointInsideRect(rect, event.clientX, event.clientY) : true;
      if (!inside) {
        cancelFolderSessionAndReturnToDesktop({ force: true });
        endDrag();
        return;
      }
      placeDraggedItemInFolder(folderId, event.clientX, event.clientY, { force: true });
      commitOpenFolder(folderId);
      commitFolderSession(null);
    } else {
      placeDraggedItemOnDesktop(event.clientX, event.clientY, { force: true });
      commitFolderSession(null);
    }

    endDrag();
  }

  function hasFolderInteractionLayer() {
    return Boolean(renderedFolder.value && (openFolderId.value || isFolderClosing.value || isFolderAppLaunchClosing.value));
  }

  function turnCurrentPage(direction, options) {
    const step = direction > 0 ? 1 : -1;
    let didTurn = false;

    if (hasFolderInteractionLayer()) {
      const next = folderPageIndex.value + step;
      if (next >= 0 && next <= folderPages.value.length - 1) {
        commitFolderPageIndex(next);
        didTurn = true;
      }
    } else if (isSearchMode.value) {
      const next = searchPageIndex.value + step;
      if (next >= 0 && next <= searchPages.value.length - 1) {
        commitSearchPageIndex(next);
        didTurn = true;
      }
    } else {
      const next = pageIndex.value + step;
      if (next >= 0 && next <= pages.value.length - 1) {
        commitPageIndex(next);
        didTurn = true;
      }
    }

    if (didTurn && options?.selectFirst) nextTick(() => selectFirstIconInCurrentScope({ force: true }));
    return didTurn;
  }

  function handleLaunchpadWheel(event) {
    if (!isDesktopOpen.value || dragRuntime || isAppLaunching.value) return;
    const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(primaryDelta) < WHEEL_PAGE_THRESHOLD) return;

    const now = Date.now();
    if (now < wheelPageLockUntil) return;
    if (turnCurrentPage(primaryDelta > 0 ? 1 : -1, { selectFirst: false })) {
      event.preventDefault();
      wheelPageLockUntil = now + WHEEL_PAGE_LOCK_DURATION;
    }
  }

  function isTextEntryElement(element) {
    if (!element) return false;
    const tagName = element.tagName;
    return (
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT" ||
      element.isContentEditable
    );
  }

  function isDevOpenDesktopShortcut(event) {
    return Boolean(event.ctrlKey && event.shiftKey && event.code === DEV_OPEN_DESKTOP_SHORTCUT_CODE);
  }

  function appendDesktopSearchText(text) {
    if (!text || hasFolderInteractionLayer()) return;
    searchQuery.value = `${searchQuery.value}${text}`;
    commitSearchPageIndex(0);
    keyboardFocusArea.value = "desktop";
    nextTick(() => selectFirstIconInCurrentScope({ force: true }));
    schedulePageGridMetrics();
  }

  function deleteDesktopSearchText() {
    if (!searchQuery.value || hasFolderInteractionLayer()) return;
    searchQuery.value = searchQuery.value.slice(0, -1);
    commitSearchPageIndex(0);
    if (searchQuery.value) nextTick(() => selectFirstIconInCurrentScope({ force: true }));
    else clearSelectedIcon();
    schedulePageGridMetrics();
  }

  function handleTabKey(event) {
    event.preventDefault();
    if (hasFolderInteractionLayer()) {
      keyboardFocusArea.value = "desktop";
      const panel = getElementFromRef(folderPanelRef);
      panel?.focus?.({ preventScroll: true });
      if (!selectionMatchesScope(selectedIcon.value, getCurrentIconScope())) selectFirstIconInCurrentScope({ force: true });
      return;
    }

    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    const searchInput = getElementFromRef(searchInputRef);
    const isSearchFocused = keyboardFocusArea.value === "search" || activeElement === searchInput;

    if (isSearchFocused) {
      focusDesktopSurface();
      if (!selectionMatchesScope(selectedIcon.value, getCurrentIconScope())) selectFirstIconInCurrentScope({ force: true });
    } else {
      keyboardFocusArea.value = "search";
      searchInput?.focus?.({ preventScroll: true });
    }
  }

  function handleEscapeKey(event) {
    event.preventDefault();
    if (hasFolderInteractionLayer() && !isFolderAppLaunchClosing.value) {
      commitOpenFolder(null);
      clearSelectedIcon();
      return;
    }

    if (isSearchMode.value) {
      clearSearch();
      focusDesktopSurface();
      return;
    }

    closeDesktop({ clearSearch: false });
  }

  function handleGlobalKeydown(event) {
    handleAltKeyDown(event);

    if (isDevOpenDesktopShortcut(event)) {
      event.preventDefault();
      if (!isDesktopOpen.value) openDesktop();
      return;
    }

    if (!isDesktopOpen.value || isDesktopClosing.value || isAppLaunching.value) return;
    if (dragRuntime) return;
    if (isAltKeyEvent(event)) return;

    if (event.key === "Tab") {
      handleTabKey(event);
      return;
    }

    if (event.key === "Escape") {
      handleEscapeKey(event);
      return;
    }

    if (event.ctrlKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      keyboardFocusArea.value = "desktop";
      turnCurrentPage(event.key === "ArrowRight" ? 1 : -1, { selectFirst: true });
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      keyboardFocusArea.value = "desktop";
      moveSelectionByArrow(event.key);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openSelectedIcon();
      return;
    }

    const isTypingInInput = isTextEntryElement(event.target);
    if (!isTypingInInput && event.key === "Backspace" && searchQuery.value) {
      event.preventDefault();
      appendDesktopSearchText("");
      deleteDesktopSearchText();
      return;
    }

    if (!isTypingInInput && !event.ctrlKey && !event.metaKey && !event.altKey && event.key && event.key.length === 1) {
      event.preventDefault();
      appendDesktopSearchText(event.key);
    }
  }

  function handleDesktopSurfacePointerDown(event) {
    if (!isDesktopOpen.value || dragRuntime || isAppLaunching.value) return;

    const target = event.target;
    if (target?.closest?.(".icon-hit-target, .page-button, .page-dot, .search-pill, .toolbar, .launchpad-header, button, input, textarea, select")) {
      return;
    }

    closeDesktop({ clearSearch: true });
  }

  function goNextPage() {
    if (pageIndex.value >= pages.value.length - 1) return;
    commitPageIndex(pageIndex.value + 1);
  }

  function handleFolderOverlayPointerDown() {
    if (!dragRuntime) commitOpenFolder(null);
  }

  watch([gridRows, gridCols, folderRows, folderCols, isTextlessMode, isSearchMode], schedulePageGridMetrics, { flush: "post" });
  watch(activePages, schedulePageGridMetrics, { flush: "post" });

  onMounted(() => {
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("keyup", handleAltKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("resize", updatePageGridMetrics);
    schedulePageGridMetrics();

    if (typeof ResizeObserver !== "undefined") {
      layoutResizeObserver = new ResizeObserver(updatePageGridMetrics);
      [rootRef, headerRef, searchRef, desktopMainRef, pageDotsRef].forEach((nodeRef) => {
        const element = getElementFromRef(nodeRef);
        if (element) layoutResizeObserver.observe(element);
      });
    }

    if (!window.__LAUNCHPAD_VUE_GRID_TESTS_RAN__) {
      window.__LAUNCHPAD_VUE_GRID_TESTS_RAN__ = true;
      try {
        runLaunchpadHelperTests();
        console.info("Launchpad Vue grid helper tests passed");
      } catch (error) {
        console.error(error);
      }
    }
  });

  onBeforeUnmount(() => {
    detachDragListeners();
    cancelPreviewRaf();
    clearPendingTarget();
    clearPageTurn();
    clearFolderPageTurn();
    clearFolderCloseTimer();
    clearFolderAppLaunchTimer();
    clearHomeRevealSettleTimer();
    clearDesktopCloseTimer();
    clearAppLaunchTimer();
    clearLaunchGhostTimer();
    cancelLongPress();
    clearAltEditTimer();
    if (layoutResizeObserver) layoutResizeObserver.disconnect();
    layoutResizeObserver = null;
    window.removeEventListener("keydown", handleGlobalKeydown);
    window.removeEventListener("keyup", handleAltKeyUp);
    window.removeEventListener("blur", handleWindowBlur);
    window.removeEventListener("resize", updatePageGridMetrics);
  });

  return {
    rootRef,
    cx,
    isTextlessMode,
    isDesktopOpen,
    isHomeInteractionDisabled,
    isAppLaunching,
    isEditMode,
    handleLaunchpadWheel,
    shellRef,
    homeShellInitial,
    homeShellAnimate,
    homeShellTransition,
    homeShellStyle,
    headerRef,
    draftRows,
    draftCols,
    draftFolderRows,
    draftFolderCols,
    dragMeta,
    applyGridConfig,
    searchRef,
    isSearchMode,
    searchInputRef,
    searchQuery,
    handleSearchInput,
    keyboardFocusArea,
    clearSearch,
    searchSummaryRef,
    desktopMainRef,
    handleDesktopSurfacePointerDown,
    activePageIndex,
    activePages,
    commitActivePageIndex,
    goNextActivePage,
    desktopTrackMotionKey,
    activeDesktopTrackAnimate,
    activeDesktopTrackTransition,
    getDesktopGridProjectionKey,
    setPageRef,
    desktopLayoutEnabled,
    getActivePageGridStyle,
    pageGridMeasureStyle,
    getVisibleDesktopPage,
    pendingTargetId,
    folderPageSize,
    isIconSelected,
    isIconOpening,
    beginDrag,
    openApp,
    removeAppById,
    layoutSpring,
    pageDotsRef,
    renderedFolder,
    isFolderClosing,
    isFolderAppLaunchClosing,
    handleFolderOverlayPointerDown,
    folderPanelRef,
    folderPanelInitial,
    folderPanelAnimate,
    panelSpring,
    folderPanelStyle,
    folderContentInitial,
    folderContentAnimate,
    folderContentTransition,
    renameFolder,
    folderItemCount,
    folderRows,
    folderCols,
    folderPageIndex,
    turnFolderPage,
    folderPages,
    folderTrackAnimate,
    desktopTrackTransition,
    setFolderPageRef,
    folderGridStyle,
    getVisibleFolderPage,
    commitFolderPageIndex,
    launchGhost,
    appLaunchGhostTransition,
    launchGhostStyle,
    dragPreviewRef,
    dragPreviewSpring,
    folderPreviewSlots,
  };
}
