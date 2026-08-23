import { DEFAULT_FOLDER_COLS, DEFAULT_FOLDER_ROWS } from "./launchpadGridDefaults.js";
import { cloneLaunchpadApp as cloneApp } from "./launchpadClone.js";

export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type LaunchpadApp = {
  id: string;
  type: "app";
  name: string;
  emoji?: string;
  origin?: "catalog" | "manual";
  iconDataUrl?: string | null;
  iconPath?: string | null;
  iconUrl?: string | null;
  customIconDataUrl?: string | null;
  customIconPath?: string | null;
  customIconUrl?: string | null;
  launchTarget?: { kind?: string; path?: string; appUserModelId?: string };
  launchArgs?: string;
  sources?: { key?: string; [key: string]: unknown }[];
  trackingKey?: string;
  identityStatus?: "exact" | "unresolved";
  presentationOverrides?: { name?: string; emoji?: string; customIconPath?: string };
  catalogPresentation?: { name: string; emoji: string };
  [key: string]: unknown;
};

export type LaunchpadFolder = {
  id: string;
  type: "folder";
  name: string;
  emoji?: string;
  childPages: (LaunchpadApp | null | undefined)[][];
  [key: string]: unknown;
};

export type LaunchpadItem = LaunchpadApp | LaunchpadFolder;
export type LaunchpadPages = LaunchpadItem[][];
export type DeepReadonlyValue<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Element)[]
    ? readonly DeepReadonlyValue<Element>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonlyValue<T[Key]> }
      : T;
export type ReadonlyLaunchpadApp = DeepReadonlyValue<LaunchpadApp>;
export type ReadonlyLaunchpadFolder = DeepReadonlyValue<LaunchpadFolder>;
export type ReadonlyLaunchpadItem = ReadonlyLaunchpadApp | ReadonlyLaunchpadFolder;
export type ReadonlyLaunchpadPages = readonly (readonly ReadonlyLaunchpadItem[])[];
export type ReadonlyLaunchpadFolderInput = Readonly<{
  id: string;
  type: "folder";
  name: string;
  emoji?: string;
  childPages?: readonly (readonly (ReadonlyLaunchpadApp | null | undefined)[])[];
  [key: string]: unknown;
}>;

type LayoutHelperOptions = {
  getPageSize: () => number;
  getFolderPageSize: () => number;
};

type FolderCleanupOptions = {
  folderPageSize?: number | undefined;
  deleteEmptyFolders?: boolean | undefined;
  keepEmptyFolders?: boolean | undefined;
  preserveFolderIds?: readonly string[] | undefined;
};

type LastPlacement = { key: string; x: number; y: number };
type LaunchpadItemSeed = {
  id?: string;
  type?: unknown;
  name?: unknown;
  emoji?: unknown;
  childPages?: LaunchpadApp[][];
  [key: string]: unknown;
};

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function cx(...values: unknown[]): string {
  return values.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function shrinkRect(rect: Rect, scale: number): Rect {
  const width = rect.width * scale;
  const height = rect.height * scale;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

export function expandRect(rect: Rect, margin: number): Rect {
  return {
    left: rect.left - margin,
    top: rect.top - margin,
    right: rect.right + margin,
    bottom: rect.bottom + margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

export function isPointInsideRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function makePageSize(rows: number, cols: number): number {
  return Math.max(1, rows * cols);
}

export function chunkIntoPages<T>(items: readonly T[], size: number): T[][] {
  const pageSize = Math.max(1, size || 1);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    chunks.push(items.slice(i, i + pageSize));
  }
  return chunks.length ? chunks : [[]];
}

function trimPreviewFolderSlots<T>(children: readonly (T | null | undefined)[]): T[] {
  return (children || []).filter(isPresent);
}

function compactPreviewFolderPages<T>(
  folderPages: readonly (readonly (T | null | undefined)[])[],
): T[][] {
  const pages = (folderPages || []).map((page) => trimPreviewFolderSlots(page)).filter((page) => page.length > 0);
  return pages.length ? pages : [[]];
}

function getPreviewFolderChildPages<T>(
  folder: { childPages?: readonly (readonly (T | null | undefined)[])[] } | null | undefined,
  size: unknown,
): T[][] {
  const pageSize = Math.max(1, Number(size) || 9);
  if (Array.isArray(folder?.childPages)) return compactPreviewFolderPages(folder.childPages);
  return chunkIntoPages([], pageSize);
}

export function getFolderPreviewSlots<T>(
  folderOrChildren:
    | readonly (T | null | undefined)[]
    | { childPages?: readonly (readonly (T | null | undefined)[])[] },
  pageSize: unknown,
): (T | null)[] {
  const safePageSize = Math.max(1, Number(pageSize) || 9);
  const previewLimit = Math.min(9, safePageSize);
  const firstPage = Array.isArray(folderOrChildren)
    ? trimPreviewFolderSlots(folderOrChildren as readonly (T | null | undefined)[]).slice(0, safePageSize)
    : getPreviewFolderChildPages(
        folderOrChildren as { childPages?: readonly (readonly (T | null | undefined)[])[] },
        safePageSize,
      )[0] || [];
  const slots = firstPage.slice(0, previewLimit).map((child) => (child ? child : null));
  while (slots.length < 9) slots.push(null);
  return slots;
}

export function shouldCommitPlacementFromLast(
  last: LastPlacement | null | undefined,
  key: string,
  clientX: number,
  clientY: number,
  minDistance: number,
  force: boolean,
): boolean {
  if (force) return true;
  if (!last) return true;
  if (last.key !== key) return true;
  const distance = Math.hypot(clientX - last.x, clientY - last.y);
  return distance >= minDistance;
}

export function createLaunchpadLayoutHelpers(options: LayoutHelperOptions) {
  const getPageSize = options.getPageSize;
  const getFolderPageSize = options.getFolderPageSize;

  function flattenTopLevelPages(sourcePages: ReadonlyLaunchpadPages): LaunchpadItem[] {
    return sourcePages.flatMap((page) => page.map((item) => cloneItem(item)));
  }

  function trimFolderSlots(children: readonly (ReadonlyLaunchpadApp | null | undefined)[]): LaunchpadApp[] {
    return (children || []).filter(isPresent).map((item) => cloneApp(item));
  }

  function compactFolderPages(
    folderPages: readonly (readonly (ReadonlyLaunchpadApp | null | undefined)[])[],
  ): LaunchpadApp[][] {
    const pages = (folderPages || []).map((page) => trimFolderSlots(page)).filter((page) => page.length > 0);
    return pages.length ? pages : [[]];
  }

  function flattenFolderPages(
    folderPages: readonly (readonly (ReadonlyLaunchpadApp | null | undefined)[])[],
  ): LaunchpadApp[] {
    return compactFolderPages(folderPages).flatMap((page) => page.map(cloneApp));
  }

  function getFolderChildPages(folder: ReadonlyLaunchpadFolder, size: unknown): LaunchpadApp[][] {
    const pageSize = Math.max(1, Number(size) || DEFAULT_FOLDER_ROWS * DEFAULT_FOLDER_COLS);

    if (Array.isArray(folder?.childPages)) {
      return compactFolderPages(folder.childPages);
    }
    return chunkIntoPages([], pageSize);
  }

  function padFolderPages(
    folderPages: readonly (readonly (ReadonlyLaunchpadApp | null | undefined)[])[],
    minPageCount: unknown,
  ): LaunchpadApp[][] {
    const pages = compactFolderPages(folderPages);
    const targetCount = Math.max(1, Number(minPageCount) || 1);
    while (pages.length < targetCount) pages.push([]);
    return pages;
  }

  function withFolderPages(
    folder: ReadonlyLaunchpadFolderInput,
    folderPages: readonly (readonly (ReadonlyLaunchpadApp | null | undefined)[])[],
  ): LaunchpadFolder {
    const childPages = compactFolderPages(folderPages);
    return {
      ...folder,
      childPages,
    };
  }

  function folderItemCount(folder: ReadonlyLaunchpadFolder): number {
    return flattenFolderPages(getFolderChildPages(folder, getFolderPageSize())).length;
  }

  function folderPreviewSlots(folder: ReadonlyLaunchpadFolder): (ReadonlyLaunchpadApp | null)[] {
    return getFolderPreviewSlots<ReadonlyLaunchpadApp>(folder, getFolderPageSize());
  }

  function getVisibleDesktopPage(page: readonly ReadonlyLaunchpadItem[]): ReadonlyLaunchpadItem[] {
    return (page || []).slice(0, getPageSize());
  }

  function getVisibleFolderPage(
    page: readonly (ReadonlyLaunchpadApp | null | undefined)[],
  ): ReadonlyLaunchpadApp[] {
    return (page || []).slice(0, getFolderPageSize()).filter(isPresent);
  }

  function getVisibleFolderPages(
    folder: ReadonlyLaunchpadFolder,
    size: unknown,
    minPageCount: unknown,
  ): LaunchpadApp[][] {
    return padFolderPages(getFolderChildPages(folder, size), minPageCount);
  }

  function repackFolderForPageSize(
    folder: ReadonlyLaunchpadFolder,
    oldSize: unknown,
    newSize: unknown,
  ): LaunchpadFolder {
    const oldPageSize = Math.max(1, Number(oldSize) || DEFAULT_FOLDER_ROWS * DEFAULT_FOLDER_COLS);
    const newPageSize = Math.max(1, Number(newSize) || oldPageSize);
    const childPages = getFolderChildPages(folder, oldPageSize);

    if (newPageSize < oldPageSize) {
      for (let pageIndex = 0; pageIndex < childPages.length; pageIndex += 1) {
        const page = childPages[pageIndex]!;
        while (page.length > newPageSize) {
          const overflow = page.pop();
          if (!overflow) break;
          while (childPages.length <= pageIndex + 1) childPages.push([]);
          childPages[pageIndex + 1]!.unshift(overflow);
        }
      }
    }

    return withFolderPages(folder, childPages);
  }



  function makeId(prefix: unknown): string {
    const safePrefix = prefix || "id";
    return `${safePrefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
  }

  function makeApp(
    seed: LaunchpadItemSeed | readonly [unknown, unknown?],
    index: number,
  ): LaunchpadItem {
    const source: LaunchpadItemSeed = Array.isArray(seed)
      ? { name: seed[0], emoji: seed[1] }
      : { ...seed } as LaunchpadItemSeed;
    const type = source.type === "folder" ? "folder" : "app";
    const name = String(source.name || "App");
    const id = source.id || `${type}-${index}-${name.toLowerCase().replace(/\s+/g, "-")}`;
    const item = { ...source, id, type, name, emoji: source.emoji || "◼️" };
    if (type === "folder") {
      const childPages = Array.isArray(source.childPages)
        ? source.childPages
        : [[]];
      return withFolderPages(item as LaunchpadFolder, childPages);
    }
    return item as LaunchpadApp;
  }

  function cloneItem(item: ReadonlyLaunchpadApp): LaunchpadApp;
  function cloneItem(item: ReadonlyLaunchpadFolder): LaunchpadFolder;
  function cloneItem(item: ReadonlyLaunchpadItem): LaunchpadItem;
  function cloneItem(item: null | undefined): null;
  function cloneItem(item: ReadonlyLaunchpadItem | null | undefined): LaunchpadItem | null {
    if (!item) return null;
    if (item.type === "folder") {
      const childPages = Array.isArray(item.childPages) ? compactFolderPages(item.childPages) : getFolderChildPages(item, getFolderPageSize());
      return withFolderPages({ ...item }, childPages);
    }
    return cloneApp(item);
  }

  function clonePages(sourcePages: ReadonlyLaunchpadPages): LaunchpadPages {
    return sourcePages.map((page) => page.filter(isPresent).map((item) => cloneItem(item)));
  }

  function cleanFolderItem(
    folder: ReadonlyLaunchpadFolder,
    options?: FolderCleanupOptions,
  ): LaunchpadFolder | null {
    const pageSizeForFolder = options?.folderPageSize || getFolderPageSize();
    const clean = withFolderPages(folder, getFolderChildPages(folder, pageSizeForFolder));
    const preserved = Array.isArray(options?.preserveFolderIds) && options.preserveFolderIds.includes(clean.id);
    const shouldDeleteEmpty = options?.deleteEmptyFolders && folderItemCount(clean) === 0 && !preserved;
    return shouldDeleteEmpty ? null : clean;
  }

  function compactPages(
    sourcePages: readonly (readonly (ReadonlyLaunchpadItem | null | undefined)[])[],
    options?: FolderCleanupOptions,
  ): LaunchpadPages {
    const safeOptions = options || {};
    const next = sourcePages.length
      ? sourcePages.map((page) =>
          page
            .filter(isPresent)
            .map((item) => (item.type === "folder" ? cleanFolderItem(item, safeOptions) : cloneApp(item)))
            .filter(isPresent)
        )
      : [[]];

    while (next.length > 1 && next[next.length - 1]!.length === 0) next.pop();
    return next.length ? next : [[]];
  }

  function ensurePage(sourcePages: LaunchpadPages, targetPageIndex: number): LaunchpadPages {
    while (sourcePages.length <= targetPageIndex) sourcePages.push([]);
    return sourcePages;
  }

  function findTopLevel(sourcePages: ReadonlyLaunchpadPages, id: string) {
    for (let currentPageIndex = 0; currentPageIndex < sourcePages.length; currentPageIndex += 1) {
      const page = sourcePages[currentPageIndex]!;
      const index = page.findIndex((item) => item.id === id);
      if (index >= 0) return { pageIndex: currentPageIndex, index, item: page[index]! };
    }
    return null;
  }

  function findFolder(
    sourcePages: LaunchpadPages,
    folderId: string,
  ): Readonly<{ pageIndex: number; index: number; item: LaunchpadFolder }> | null;
  function findFolder(
    sourcePages: ReadonlyLaunchpadPages,
    folderId: string,
  ): Readonly<{ pageIndex: number; index: number; item: ReadonlyLaunchpadFolder }> | null;
  function findFolder(
    sourcePages: ReadonlyLaunchpadPages,
    folderId: string,
  ): Readonly<{ pageIndex: number; index: number; item: ReadonlyLaunchpadFolder }> | null {
    for (let currentPageIndex = 0; currentPageIndex < sourcePages.length; currentPageIndex += 1) {
      const page = sourcePages[currentPageIndex]!;
      for (let index = 0; index < page.length; index += 1) {
        const item = page[index]!;
        if (item.type === "folder" && item.id === folderId) return { pageIndex: currentPageIndex, index, item };
      }
    }
    return null;
  }

  function findInFolder(sourcePages: ReadonlyLaunchpadPages, folderId: string, itemId: string) {
    const folder = findFolder(sourcePages, folderId)?.item;
    if (!folder) return null;
    const childPages = getFolderChildPages(folder, getFolderPageSize());
    for (let pageIndex = 0; pageIndex < childPages.length; pageIndex += 1) {
      const page = childPages[pageIndex]!;
      const index = page.findIndex((child) => child?.id === itemId);
      if (index >= 0) return { folder, pageIndex, index, item: page[index]! };
    }
    return null;
  }

  function countItemOccurrences(sourcePages: ReadonlyLaunchpadPages, itemId: string): number {
    let count = 0;
    for (const page of sourcePages) {
      for (const item of page) {
        if (item.id === itemId) count += 1;
        if (item.type === "folder") count += flattenFolderPages(getFolderChildPages(item, getFolderPageSize())).filter((child) => child?.id === itemId).length;
      }
    }
    return count;
  }

  function collectAppsFromPages(sourcePages: ReadonlyLaunchpadPages): LaunchpadApp[] {
    const apps: LaunchpadApp[] = [];
    const seen = new Set<string>();
    for (const page of sourcePages || []) {
      for (const item of page || []) {
        if (!item) continue;
        if (item.type === "app" && !seen.has(item.id)) {
          seen.add(item.id);
          apps.push(cloneApp(item));
        }
        if (item.type === "folder") {
          for (const child of flattenFolderPages(getFolderChildPages(item, getFolderPageSize()))) {
            if (!child || child.type !== "app" || seen.has(child.id)) continue;
            seen.add(child.id);
            apps.push(cloneApp(child));
          }
        }
      }
    }
    return apps;
  }

  function assertNoDuplicateItemIds(sourcePages: ReadonlyLaunchpadPages): void {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
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

  function shouldPreserveEmptyFolder(folderId: string, options?: FolderCleanupOptions): boolean {
    if (options?.keepEmptyFolders) return true;
    return Array.isArray(options?.preserveFolderIds) && options.preserveFolderIds.includes(folderId);
  }

  function removeEverywhere(
    sourcePages: ReadonlyLaunchpadPages,
    itemId: string,
    options?: FolderCleanupOptions,
  ): LaunchpadPages {
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
        .filter(isPresent)
    );
    return compactPages(next, { deleteEmptyFolders: !safeOptions.keepEmptyFolders, preserveFolderIds: safeOptions.preserveFolderIds, folderPageSize: getFolderPageSize() });
  }

  function dissolveFolder(sourcePages: ReadonlyLaunchpadPages, folderId: string, size: unknown): LaunchpadPages {
    const pageSize = Math.max(1, Number(size) || getPageSize());
    const next = clonePages(sourcePages);
    const folder = findFolder(next, folderId);
    if (!folder) return compactPages(next);

    const children = flattenFolderPages(getFolderChildPages(folder.item, getFolderPageSize()));
    next[folder.pageIndex]!.splice(folder.index, 1, ...children);
    // Carry overflow forward so replacing one folder preserves global row-major order.
    for (let pageIndex = folder.pageIndex; pageIndex < next.length; pageIndex += 1) {
      const page = next[pageIndex]!;
      if (page.length <= pageSize) continue;
      const overflow = page.splice(pageSize);
      ensurePage(next, pageIndex + 1);
      next[pageIndex + 1]!.unshift(...overflow);
    }
    return compactPages(next);
  }

  function insertTopLevelItem(
    sourcePages: ReadonlyLaunchpadPages,
    item: ReadonlyLaunchpadItem,
    targetPageIndex: number,
    insertIndex: number,
    size: number,
  ): LaunchpadPages {
    const pageSize = Math.max(1, size || 1);
    const next = removeEverywhere(sourcePages, item.id);
    ensurePage(next, targetPageIndex);

    const targetPage = next[targetPageIndex]!;
    const safeIndex = clamp(insertIndex, 0, Math.min(pageSize, targetPage.length));
    targetPage.splice(safeIndex, 0, cloneItem(item));

    for (let currentPageIndex = targetPageIndex; currentPageIndex < next.length; currentPageIndex += 1) {
      const page = next[currentPageIndex]!;
      if (page.length <= pageSize) continue;
      const overflow = page.pop();
      if (!overflow) continue;
      ensurePage(next, currentPageIndex + 1);
      next[currentPageIndex + 1]!.unshift(overflow);
    }

    return compactPages(next);
  }

  function insertAppIntoFolder(
    sourcePages: ReadonlyLaunchpadPages,
    folderId: string,
    app: ReadonlyLaunchpadItem,
    targetPageIndex: unknown,
    insertIndex: unknown,
    size: unknown,
  ): LaunchpadPages {
    const folderSize = Math.max(1, Number(size) || getFolderPageSize());
    const next = removeEverywhere(sourcePages, app.id, { preserveFolderIds: [folderId] });
    const folder = findFolder(next, folderId);
    if (!folder || app.type !== "app") return next;

    const childPages = getFolderChildPages(folder.item, folderSize);
    const requestedPage = Number.isFinite(Number(targetPageIndex)) ? Math.floor(Number(targetPageIndex)) : childPages.length - 1;
    const safePageIndex = Math.max(0, requestedPage);
    while (childPages.length <= safePageIndex) childPages.push([]);

    const targetPage = childPages[safePageIndex]!;
    const requestedIndex = Number.isFinite(Number(insertIndex)) ? Math.floor(Number(insertIndex)) : targetPage.length;
    const safeIndex = clamp(requestedIndex, 0, Math.min(folderSize, targetPage.length));
    targetPage.splice(safeIndex, 0, cloneApp(app));

    for (let pageIndex = safePageIndex; pageIndex < childPages.length; pageIndex += 1) {
      const page = childPages[pageIndex]!;
      while (page.length > folderSize) {
        const overflow = page.pop();
        if (!overflow) break;
        while (childPages.length <= pageIndex + 1) childPages.push([]);
        childPages[pageIndex + 1]!.unshift(overflow);
      }
    }

    next[folder.pageIndex]![folder.index] = withFolderPages(folder.item, childPages);
    return compactPages(next, { preserveFolderIds: [folderId], folderPageSize: folderSize });
  }

  function replaceFolderWithItem(
    sourcePages: ReadonlyLaunchpadPages,
    folderId: string,
    item: ReadonlyLaunchpadItem,
  ): LaunchpadPages {
    const next = clonePages(sourcePages);
    const folder = findFolder(next, folderId);
    if (!folder) return compactPages(next);
    next[folder.pageIndex]![folder.index] = cloneItem(item);
    return compactPages(next);
  }

  function repackFoldersForPageSize(
    sourcePages: LaunchpadPages,
    oldSize: unknown,
    newSize: unknown,
  ): LaunchpadPages {
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
    assertNoDuplicateItemIds,
    shouldPreserveEmptyFolder,
    removeEverywhere,
    dissolveFolder,
    insertTopLevelItem,
    insertAppIntoFolder,
    replaceFolderWithItem,
    repackFoldersForPageSize,
  };
}
