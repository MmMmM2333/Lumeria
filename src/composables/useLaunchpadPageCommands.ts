import { nextTick, type Ref } from "vue";
import type {
  LaunchpadFolder,
  LaunchpadItem,
  LaunchpadPages,
  ReadonlyLaunchpadFolder,
  ReadonlyLaunchpadPages,
} from "../domain/launchpadLayout.js";
import type { IconFocus } from "../domain/iconFocus.js";
import type { LocalizationText } from "../i18n/localization.js";

type FolderLocation = Readonly<{
  index: number;
  item: LaunchpadFolder;
  pageIndex: number;
}>;
type ReadonlyFolderLocation = Readonly<{
  index: number;
  item: ReadonlyLaunchpadFolder;
  pageIndex: number;
}>;
type FindFolder = {
  (pages: LaunchpadPages, folderId: string): FolderLocation | null;
  (pages: ReadonlyLaunchpadPages, folderId: string): ReadonlyFolderLocation | null;
};

export type LaunchpadWarningDialogConfig = Readonly<{
  cancelText: string;
  confirmAppearance?: "outline";
  confirmText: string;
  confirmTone?: "danger";
  intent: "warning";
  message: string;
  onConfirm: () => void;
  title: string;
}>;

export type LaunchpadPageCommandsOptions = Readonly<{
  assertNoDuplicateItemIds: (pages: ReadonlyLaunchpadPages) => void;
  cancelInputGesture: () => void;
  chunkIntoPages: (items: readonly LaunchpadItem[], size: number) => LaunchpadPages;
  clearFocusedIcon?: () => void;
  clonePages: (pages: ReadonlyLaunchpadPages) => LaunchpadPages;
  compactPages: (
    pages: ReadonlyLaunchpadPages,
    options?: Readonly<{ folderPageSize?: number }>,
  ) => LaunchpadPages;
  commitActivePageIndex?: (next: number) => unknown;
  commitFolderPageIndex: (next: number) => unknown;
  commitOpenFolder: (folderId: string | null) => unknown;
  commitPageIndex: (next: number) => unknown;
  commitPagesState: (pages: LaunchpadPages) => void;
  commitSearchPageIndex: (next: number) => unknown;
  dissolveFolder: (pages: ReadonlyLaunchpadPages, folderId: string, pageSize: number) => LaunchpadPages;
  findFolder: FindFolder;
  finishHomeRevealSettleWindow?: () => void;
  flattenTopLevelPages: (pages: ReadonlyLaunchpadPages) => LaunchpadItem[];
  focusedIcon?: Readonly<Ref<IconFocus | null>>;
  folderPageIndex: Readonly<Ref<number>>;
  folderPageSize: Readonly<Ref<number>>;
  isDragActive: () => boolean;
  isFolderClosing?: Readonly<Ref<boolean>>;
  isHomeRevealSettling?: Readonly<Ref<boolean>>;
  localizationText: Pick<LocalizationText, "t">;
  openFolderId: Readonly<Ref<string | null>>;
  openWarningDialog: (config: LaunchpadWarningDialogConfig) => void;
  pageIndex: Readonly<Ref<number>>;
  pages: Readonly<{ readonly value: ReadonlyLaunchpadPages }>;
  pageSize: Readonly<Ref<number>>;
  rebasePageIndices: (next: number) => void;
  renderedFolder: Readonly<Ref<ReadonlyLaunchpadFolder | null>>;
  scheduleChromePageIndexCommit?: (callback: () => void) => void;
  schedulePageGridMetrics: () => void;
  searchPageIndex: Readonly<Ref<number>>;
}>;

export function shouldAssertLaunchpadLayout() {
  return import.meta.env?.PROD !== true;
}

export function useLaunchpadPageCommands(options: LaunchpadPageCommandsOptions) {
  const t = options?.localizationText?.t;
  if (typeof t !== "function") {
    throw new TypeError("useLaunchpadPageCommands requires localization text");
  }
  if (typeof options.rebasePageIndices !== "function") {
    throw new TypeError("useLaunchpadPageCommands requires rebasePageIndices");
  }
  if (typeof options.commitPagesState !== "function") {
    throw new TypeError("useLaunchpadPageCommands requires commitPagesState");
  }

  function requestAnimationFrameOnce(callback: FrameRequestCallback): void {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      callback(globalThis.performance?.now?.() ?? 0);
      return;
    }
    window.requestAnimationFrame(callback);
  }

  function scheduleChromePageIndexCommit(callback: () => void): void {
    if (typeof options.scheduleChromePageIndexCommit === "function") {
      options.scheduleChromePageIndexCommit(callback);
      return;
    }
    nextTick(() => requestAnimationFrameOnce(callback));
  }

  function commitChromePageIndex(next: number): void {
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

  function commitPages(next: LaunchpadPages): void {
    if (shouldAssertLaunchpadLayout() && !options.isDragActive()) options.assertNoDuplicateItemIds(next);
    options.commitPagesState(next);
    if (options.renderedFolder.value) options.commitFolderPageIndex(options.folderPageIndex.value);
  }

  function commitPagesAfterDeletion(next: LaunchpadPages): void {
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

  function renameFolder(folderId: string, name: string): void {
    const nextName = String(name || "").slice(0, 32) || t("launchpad.newFolder");
    const next = options.clonePages(options.pages.value);
    const folder = options.findFolder(next, folderId);
    if (!folder) return;
    folder.item.name = nextName;
    commitPages(next);
  }

  function forceFillAllPages(): void {
    if (options.isDragActive()) return;
    const items = options.flattenTopLevelPages(options.pages.value);
    const filled = options.chunkIntoPages(items, options.pageSize.value);
    commitPages(options.compactPages(filled, { folderPageSize: options.folderPageSize.value }));
    options.commitPageIndex(0);
    options.commitSearchPageIndex(0);
    options.schedulePageGridMetrics();
  }

  function confirmForceFillAllPages(): void {
    if (typeof window === "undefined") {
      forceFillAllPages();
      return;
    }

    options.openWarningDialog({
      title: t("commands.compact.title"),
      message: t("commands.compact.message"),
      intent: "warning",
      confirmText: t("commands.compact.confirm"),
      cancelText: t("common.actions.cancel"),
      onConfirm: forceFillAllPages,
    });
  }

  function dissolveFolderById(folderId: string): void {
    if (!folderId || options.isDragActive()) return;
    const folder = options.findFolder(options.pages.value, folderId);
    if (!folder) return;
    options.cancelInputGesture();
    const next = options.dissolveFolder(options.pages.value, folderId, options.pageSize.value);
    commitPages(next);
    if (options.focusedIcon?.value?.id === folderId) options.clearFocusedIcon?.();
    if (options.openFolderId.value === folderId || options.renderedFolder.value?.id === folderId) {
      options.commitOpenFolder(null);
    }
    options.commitPageIndex(options.pageIndex.value);
    options.commitSearchPageIndex(options.searchPageIndex.value);
    options.schedulePageGridMetrics();
  }

  function confirmDissolveFolder(folderId: string): void {
    if (!folderId || options.isDragActive()) return;
    const folder = options.findFolder(options.pages.value, folderId)?.item;
    if (!folder) return;
    options.openWarningDialog({
      title: t("commands.dissolve.title", { name: folder.name }),
      message: t("commands.dissolve.message"),
      intent: "warning",
      confirmText: t("commands.dissolve.confirm"),
      cancelText: t("common.actions.cancel"),
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
