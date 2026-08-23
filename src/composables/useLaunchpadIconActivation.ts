import { clamp } from "../domain/launchpadLayout.js";
import type {
  ReadonlyLaunchpadApp,
  ReadonlyLaunchpadFolder,
  ReadonlyLaunchpadItem,
  ReadonlyLaunchpadPages,
  Rect,
} from "../domain/launchpadLayout.js";
import type { Ref } from "vue";
import type {
  LaunchpadIconFocus,
  LaunchpadIconArea,
  LaunchpadIconScope,
} from "./useIconFocus.js";
import type { IconFocus } from "../domain/iconFocus.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../rendering/desktopScenePort.js";
import { stageLayoutRecordToClientRect } from "../rendering/desktopScenePort.js";
import type { createIconBoundsRegistry } from "../rendering/desktopScenePort.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;

type IconBoundsRegistry = ReturnType<typeof createIconBoundsRegistry>;
type FolderPageCell = ReadonlyLaunchpadApp | null | undefined;
type FolderLocation = Readonly<{
  folder: ReadonlyLaunchpadFolder;
  index: number;
  item: ReadonlyLaunchpadApp;
  pageIndex: number;
}>;
type TopLevelLocation = Readonly<{
  index: number;
  item: ReadonlyLaunchpadItem;
  pageIndex: number;
}>;

export type LaunchAppSource =
  | Readonly<{ folderId?: string | null; pageIndex?: number; type: "folder" }>
  | Readonly<{ pageIndex?: number; type: "page" | "search" }>;

export type FocusedIconSelection = Readonly<{
  item: ReadonlyLaunchpadItem;
  scope: Pick<LaunchpadIconScope<ReadonlyLaunchpadItem>, "area" | "folderId" | "pageIndex">;
}>;

export type LaunchIconRectSource = IconFocus & Readonly<{
  area: LaunchpadIconArea;
  folderId?: string | null;
}>;

export type CurrentIconScopeOptions = Readonly<{
  folderCols: Readonly<Ref<number>>;
  folderPageIndex: Readonly<Ref<number>>;
  getFolderPages: () => readonly (readonly FolderPageCell[])[];
  getRenderedFolder: () => ReadonlyLaunchpadFolder | null;
  getSearchPages: () => readonly (readonly ReadonlyLaunchpadItem[])[];
  getVisibleDesktopPage: (page: readonly ReadonlyLaunchpadItem[]) => readonly ReadonlyLaunchpadItem[];
  getVisibleFolderPage: (page: readonly FolderPageCell[]) => readonly ReadonlyLaunchpadApp[];
  gridCols: Readonly<Ref<number>>;
  isFolderAppLaunchClosing: Readonly<Ref<boolean>>;
  isFolderClosing: Readonly<Ref<boolean>>;
  isSearchMode: () => boolean;
  openFolderId: Readonly<Ref<string | null>>;
  pageIndex: Readonly<Ref<number>>;
  pages: Readonly<{ readonly value: ReadonlyLaunchpadPages }>;
  searchPageIndex: Readonly<Ref<number>>;
}>;

export type LaunchpadIconActivationOptions = CurrentIconScopeOptions & Readonly<{
  clearFocusedIcon: () => void;
  commitOpenFolder: (folderId: string | null) => void;
  findFocusedItem: () => FocusedIconSelection | null;
  findInFolder: (pages: ReadonlyLaunchpadPages, folderId: string, itemId: string) => FolderLocation | null;
  findTopLevel: (pages: ReadonlyLaunchpadPages, itemId: string) => TopLevelLocation | null;
  focusFirstIconInCurrentScope: (options: Readonly<{ force?: boolean }>) => unknown;
  getCurrentIconScope: () => LaunchpadIconScope<ReadonlyLaunchpadItem>;
  getFocusedIcon: () => LaunchpadIconFocus | null;
  iconBoundsRegistry: IconBoundsRegistry;
  openApp: (app: ReadonlyLaunchpadApp, source: LaunchAppSource) => unknown;
}>;

export function getLaunchIconRect(
  launchSource: LaunchIconRectSource,
  iconBoundsRegistry: IconBoundsRegistry,
): Rect | null {
  const expected = launchSource?.area === "folder"
    ? {
      area: launchSource.area,
      folderId: launchSource.folderId ?? null,
      id: launchSource.id,
      pageIndex: launchSource.pageIndex ?? 0,
    }
    : null;
  const getOptions = expected ? { expected } : undefined;
  return iconBoundsRegistry.getBounds(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.RENDERED, launchSource, getOptions) ||
    iconBoundsRegistry.getBounds(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.LIVE_TARGET, launchSource, getOptions) ||
    stageLayoutRecordToClientRect(iconBoundsRegistry.getBounds(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, launchSource, getOptions));
}

export function resolveCurrentIconScope(options: CurrentIconScopeOptions): LaunchpadIconScope<ReadonlyLaunchpadItem> {
  const renderedFolder = options.getRenderedFolder();
  if (renderedFolder && (options.openFolderId.value || options.isFolderClosing.value || options.isFolderAppLaunchClosing.value)) {
    const folderPages = options.getFolderPages();
    const pageNumber = clamp(options.folderPageIndex.value, 0, Math.max(0, folderPages.length - 1));
    return {
      area: "folder",
      pageIndex: pageNumber,
      folderId: renderedFolder.id,
      items: options.getVisibleFolderPage(folderPages[pageNumber] || []),
      columns: options.folderCols.value,
    };
  }

  if (options.isSearchMode()) {
    const searchPages = options.getSearchPages();
    const pageNumber = clamp(options.searchPageIndex.value, 0, Math.max(0, searchPages.length - 1));
    return {
      area: "search",
      pageIndex: pageNumber,
      folderId: null,
      items: options.getVisibleDesktopPage(searchPages[pageNumber] || []),
      columns: options.gridCols.value,
    };
  }

  const pages = options.pages.value;
  const pageNumber = clamp(options.pageIndex.value, 0, Math.max(0, pages.length - 1));
  return {
    area: "desktop",
    pageIndex: pageNumber,
    folderId: null,
    items: options.getVisibleDesktopPage(pages[pageNumber] || []),
    columns: options.gridCols.value,
  };
}

export function useLaunchpadIconActivation(options: LaunchpadIconActivationOptions) {
  const getCurrentIconScope = options.getCurrentIconScope;

  function openFocusedIcon(): void {
    const focused = options.findFocusedItem();
    if (!focused) {
      options.focusFirstIconInCurrentScope({ force: true });
      return;
    }

    if (focused.item.type === "folder" && focused.scope.area === "desktop") {
      options.commitOpenFolder(focused.item.id);
      options.clearFocusedIcon();
      return;
    }

    if (focused.item.type === "app") {
      const source: LaunchAppSource =
        focused.scope.area === "folder"
          ? { type: "folder", folderId: focused.scope.folderId, pageIndex: focused.scope.pageIndex }
          : { type: focused.scope.area === "search" ? "search" : "page", pageIndex: focused.scope.pageIndex };
      options.openApp(focused.item, source);
    }
  }

  function normalizeLaunchSource(
    app: ReadonlyLaunchpadApp,
    source?: LaunchAppSource,
  ): LaunchpadIconFocus {
    if (source?.type === "folder") {
      return { area: "folder", id: app.id, pageIndex: source.pageIndex ?? 0, folderId: source.folderId || options.getRenderedFolder()?.id || null };
    }
    if (source?.type === "search") {
      return { area: "search", id: app.id, pageIndex: source.pageIndex ?? options.searchPageIndex.value, folderId: null };
    }
    if (source?.type === "page") {
      return { area: "desktop", id: app.id, pageIndex: source.pageIndex ?? options.pageIndex.value, folderId: null };
    }

    const focused = options.getFocusedIcon();
    if (focused?.id === app.id) return { ...focused };

    const renderedFolder = options.getRenderedFolder();
    if (renderedFolder) {
      const inFolder = options.findInFolder(options.pages.value, renderedFolder.id, app.id);
      if (inFolder) return { area: "folder", id: app.id, pageIndex: inFolder.pageIndex, folderId: renderedFolder.id };
    }

    if (options.isSearchMode()) {
      const searchPages = options.getSearchPages();
      for (let currentPage = 0; currentPage < searchPages.length; currentPage += 1) {
        if ((searchPages[currentPage] || []).some((item) => item.id === app.id)) {
          return { area: "search", id: app.id, pageIndex: currentPage, folderId: null };
        }
      }
    }

    const topLevel = options.findTopLevel(options.pages.value, app.id);
    if (topLevel) return { area: "desktop", id: app.id, pageIndex: topLevel.pageIndex, folderId: null };
    return { area: "desktop", id: app.id, pageIndex: options.pageIndex.value, folderId: null };
  }

  return {
    getCurrentIconScope,
    getLaunchIconRect: (launchSource: LaunchIconRectSource) => (
      getLaunchIconRect(launchSource, options.iconBoundsRegistry)
    ),
    normalizeLaunchSource,
    openFocusedIcon,
  };
}
