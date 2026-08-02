import { nextTick } from "vue";

export function shouldAssertLaunchpadLayout() {
  if (typeof import.meta.env?.DEV === "boolean") return import.meta.env.DEV;
  return typeof process === "undefined" || process.env?.NODE_ENV !== "production";
}

export function useLaunchpadPageCommands(options) {
  if (typeof options.rebasePageIndices !== "function") {
    throw new TypeError("useLaunchpadPageCommands requires rebasePageIndices");
  }
  if (typeof options.commitPagesState !== "function") {
    throw new TypeError("useLaunchpadPageCommands requires commitPagesState");
  }

  function requestAnimationFrameOnce(callback) {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      callback();
      return;
    }
    window.requestAnimationFrame(callback);
  }

  function scheduleChromePageIndexCommit(callback) {
    if (typeof options.scheduleChromePageIndexCommit === "function") {
      options.scheduleChromePageIndexCommit(callback);
      return;
    }
    nextTick(() => requestAnimationFrameOnce(callback));
  }

  function commitChromePageIndex(next) {
    const commitPage = typeof options.commitActivePageIndex === "function"
      ? options.commitActivePageIndex
      : options.commitPageIndex;
    if (options.isHomeRevealSettling?.value) {
      options.finishHomeRevealSettleWindow?.();
      scheduleChromePageIndexCommit(() => commitPage(next));
      return;
    }
    commitPage(next);
  }

  function commitPages(next) {
    if (shouldAssertLaunchpadLayout() && !options.isDragActive()) options.assertNoDuplicateItemIds(next);
    options.commitPagesState(next);
    if (options.renderedFolder.value) options.commitFolderPageIndex(options.folderPageIndex.value);
  }

  function commitPagesAfterDeletion(next) {
    const currentPageIndex = options.pageIndex.value;
    const nonEmptyPagesBeforeCurrent = next
      .slice(0, currentPageIndex)
      .filter((page) => page.length > 0)
      .length;
    const compacted = next.filter((page) => page.length > 0);
    const nextPages = compacted.length ? compacted : [[]];
    const nextPageIndex = compacted.length
      ? Math.min(nonEmptyPagesBeforeCurrent, compacted.length - 1)
      : 0;

    commitPages(nextPages);
    options.rebasePageIndices(nextPageIndex);
  }

  function renameFolder(folderId, name) {
    const nextName = String(name || "").slice(0, 32) || "新文件夹";
    const next = options.clonePages(options.pages.value);
    const folder = options.findFolder(next, folderId);
    if (!folder) return;
    folder.item.name = nextName;
    commitPages(next);
  }

  function forceFillAllPages() {
    if (options.isDragActive()) return;
    const items = options.flattenTopLevelPages(options.pages.value);
    const filled = options.chunkIntoPages(items, options.pageSize.value);
    commitPages(options.compactPages(filled, { folderPageSize: options.folderPageSize.value }));
    options.commitPageIndex(0);
    options.commitSearchPageIndex(0);
    options.schedulePageGridMetrics();
  }

  function confirmForceFillAllPages() {
    if (typeof window === "undefined") {
      forceFillAllPages();
      return;
    }

    options.openWarningDialog({
      title: "重新整理桌面页面？",
      message: "这会按当前顺序压实所有桌面页面，可能改变当前分页布局。",
      intent: "warning",
      confirmText: "重新整理",
      cancelText: "取消",
      onConfirm: forceFillAllPages,
    });
  }

  function dissolveFolderById(folderId) {
    if (!folderId || options.isDragActive()) return;
    const folder = options.findFolder(options.pages.value, folderId);
    if (!folder) return;
    options.cancelLongPress();
    const next = options.dissolveFolder(options.pages.value, folderId, options.pageSize.value);
    commitPages(next);
    if (options.selectedIcon?.value?.id === folderId) options.clearSelectedIcon?.();
    if (options.openFolderId.value === folderId || options.renderedFolder.value?.id === folderId) {
      options.commitOpenFolder(null);
    }
    options.commitPageIndex(options.pageIndex.value);
    options.commitSearchPageIndex(options.searchPageIndex.value);
    options.schedulePageGridMetrics();
  }

  function confirmDissolveFolder(folderId) {
    if (!folderId || options.isDragActive()) return;
    const folder = options.findFolder(options.pages.value, folderId)?.item;
    if (!folder) return;
    options.openWarningDialog({
      title: `解散“${folder.name}”？`,
      message: "文件夹中的应用将按当前顺序移回桌面。此操作不会删除应用。",
      intent: "warning",
      confirmText: "解散文件夹",
      cancelText: "取消",
      confirmAppearance: "outline",
      confirmTone: "danger",
      onConfirm: () => dissolveFolderById(folderId),
    });
  }

  return {
    commitChromePageIndex,
    commitPages,
    commitPagesAfterDeletion,
    confirmDissolveFolder,
    dissolveFolderById,
    confirmForceFillAllPages,
    forceFillAllPages,
    renameFolder,
  };
}
