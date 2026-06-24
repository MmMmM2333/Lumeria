import { clamp } from "../domain/launchpadLayout.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../rendering/pixi/geometry/iconBoundsRegistry.js";
import { stageLayoutRecordToClientRect } from "../rendering/pixi/geometry/stageCoordinates.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;

export function getLaunchIconRect(launchSource, iconBoundsRegistry) {
  const expected = launchSource?.area === "folder"
    ? {
      area: launchSource.area,
      folderId: launchSource.folderId ?? null,
      id: launchSource.id,
      pageIndex: launchSource.pageIndex ?? 0,
    }
    : null;
  return iconBoundsRegistry.getBounds(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.RENDERED, launchSource, { expected }) ||
    iconBoundsRegistry.getBounds(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.LIVE_TARGET, launchSource, { expected }) ||
    stageLayoutRecordToClientRect(iconBoundsRegistry.getBounds(BOUNDS_KIND.LAUNCH, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, launchSource, { expected }));
}

export function resolveCurrentIconScope(options) {
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

export function useLaunchpadIconActivation(options) {
  const getCurrentIconScope = options.getCurrentIconScope;

  function openSelectedIcon() {
    const selected = options.findSelectedItem();
    if (!selected) {
      options.selectFirstIconInCurrentScope({ force: true });
      return;
    }

    if (selected.item.type === "folder" && selected.scope.area === "desktop") {
      options.commitOpenFolder(selected.item.id);
      options.clearSelectedIcon();
      return;
    }

    if (selected.item.type === "app") {
      const source =
        selected.scope.area === "folder"
          ? { type: "folder", folderId: selected.scope.folderId, pageIndex: selected.scope.pageIndex }
          : { type: selected.scope.area === "search" ? "search" : "page", pageIndex: selected.scope.pageIndex };
      options.openApp(selected.item, source);
    }
  }

  function normalizeLaunchSource(app, source) {
    if (source?.type === "folder") {
      return { area: "folder", id: app.id, pageIndex: source.pageIndex ?? 0, folderId: source.folderId || options.getRenderedFolder()?.id || null };
    }
    if (source?.type === "search") {
      return { area: "search", id: app.id, pageIndex: source.pageIndex ?? options.searchPageIndex.value, folderId: null };
    }
    if (source?.type === "page") {
      return { area: "desktop", id: app.id, pageIndex: source.pageIndex ?? options.pageIndex.value, folderId: null };
    }

    const selected = options.getSelectedIcon();
    if (selected?.id === app.id) return { ...selected };

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
    getLaunchIconRect: (launchSource) => getLaunchIconRect(launchSource, options.iconBoundsRegistry),
    normalizeLaunchSource,
    openSelectedIcon,
  };
}
