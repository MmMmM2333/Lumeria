import { nextTick } from "vue";

export function shouldAssertLaunchpadLayout() {
  if (typeof import.meta.env?.DEV === "boolean") return import.meta.env.DEV;
  return typeof process === "undefined" || process.env?.NODE_ENV !== "production";
}

export function useLaunchpadPageCommands(options) {
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
    options.pages.value = next;
    if (options.renderedFolder.value) options.commitFolderPageIndex(options.folderPageIndex.value);
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
      confirmText: "重新整理",
      cancelText: "取消",
      onConfirm: forceFillAllPages,
    });
  }

  function removeAppById(appId) {
    if (!appId || options.isDragActive()) return;
    options.cancelLongPress();
    const openedFolderId = options.openFolderId.value;
    const next = options.removeEverywhere(options.pages.value, appId);
    commitPages(next);
    if (openedFolderId && !options.findFolder(next, openedFolderId)) options.commitOpenFolder(null);
    options.commitPageIndex(options.pageIndex.value);
    options.commitSearchPageIndex(options.searchPageIndex.value);
  }

  return {
    commitChromePageIndex,
    commitPages,
    confirmForceFillAllPages,
    forceFillAllPages,
    removeAppById,
    renameFolder,
  };
}
