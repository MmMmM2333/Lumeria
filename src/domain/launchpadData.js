import { chunkIntoPages } from "./launchpadLayout.js";

export function fallbackAppGlyph(name) {
  return String(name || "A").trim().charAt(0).toUpperCase() || "A";
}

export function makeLaunchTarget(target) {
  const value = String(target || "").trim();
  if (!value) return null;
  return {
    kind: /^https?:\/\//i.test(value) ? "url" : "executable",
    path: value,
  };
}

export function compareAppsByDefaultOrder(left, right) {
  const leftName = String(left?.name || "").toLowerCase();
  const rightName = String(right?.name || "").toLowerCase();
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;

  const leftId = String(left?.id || "");
  const rightId = String(right?.id || "");
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  return 0;
}

export function normalizeNativeApp(app, index) {
  const name = String(app?.name || "Application").trim() || "Application";
  return {
    ...app,
    id: String(app?.id || `native-app-${index}`),
    type: "app",
    name,
    launchTarget: app?.launchTarget || app?.launch_target || null,
    launchArgs: typeof app?.launchArgs === "string" ? app.launchArgs : "",
    iconDataUrl: app?.iconDataUrl || null,
    emoji: app?.emoji || fallbackAppGlyph(name),
  };
}

export function createLaunchpadDataHelpers(options) {
  const {
    cloneItem,
    clonePages,
    compactPages,
    ensurePage,
    getFolderChildPages,
    getFolderPageSize,
    getPageSize,
    makeId,
    withFolderPages,
  } = options;

  function mergeAppWithSavedIcon(app, savedItem) {
    const next = cloneItem(app);
    if (savedItem?.name) next.name = String(savedItem.name).slice(0, 64);
    if (savedItem?.emoji) next.emoji = savedItem.emoji;
    if (savedItem?.launchTarget) next.launchTarget = savedItem.launchTarget;
    if (typeof savedItem?.launchArgs === "string") next.launchArgs = savedItem.launchArgs;
    if (savedItem?.customIconDataUrl) next.customIconDataUrl = savedItem.customIconDataUrl;
    return next;
  }

  function normalizeSavedCustomApp(item) {
    if (!item || item.type !== "app" || !item.launchTarget) return null;
    const name = String(item.name || "Application").trim() || "Application";
    return {
      ...item,
      id: String(item.id || makeId("custom-app")),
      type: "app",
      name,
      emoji: item.emoji || fallbackAppGlyph(name),
      launchTarget: item.launchTarget,
      launchArgs: typeof item.launchArgs === "string" ? item.launchArgs : "",
    };
  }

  function mergeFolderWithCatalog(folder, catalog, usedAppIds) {
    const sourcePages = Array.isArray(folder?.childPages)
      ? folder.childPages
      : chunkIntoPages(folder?.children || [], getFolderPageSize());
    const childPages = sourcePages
      .map((page) =>
        (page || [])
          .map((child) => {
            const app = child?.id ? catalog.get(child.id) || normalizeSavedCustomApp(child) : null;
            if (!app || usedAppIds.has(app.id)) return null;
            usedAppIds.add(app.id);
            return mergeAppWithSavedIcon(app, child);
          })
          .filter(Boolean)
      )
      .filter((page) => page.length > 0);

    if (!childPages.length) return null;
    return withFolderPages(
      {
        id: String(folder?.id || makeId("folder")),
        type: "folder",
        name: String(folder?.name || "新文件夹").slice(0, 32) || "新文件夹",
      },
      childPages
    );
  }

  function appendAppsToPages(sourcePages, apps) {
    const next = sourcePages.length ? sourcePages.map((page) => page.slice()) : [[]];
    for (const app of apps) {
      if (next[next.length - 1].length >= getPageSize()) next.push([]);
      next[next.length - 1].push(cloneItem(app));
    }
    return compactPages(next, { folderPageSize: getFolderPageSize() });
  }

  function fitPagesToGrid(sourcePages) {
    const next = clonePages(sourcePages);
    for (let i = 0; i < next.length; i += 1) {
      while (next[i].length > getPageSize()) {
        const overflow = next[i].pop();
        ensurePage(next, i + 1);
        next[i + 1].unshift(overflow);
      }
    }
    return compactPages(next, { folderPageSize: getFolderPageSize() });
  }

  function mergeNativeCatalogWithSavedLayout(apps, savedLayout, hiddenAppIds) {
    const catalog = new Map(apps.map((app) => [app.id, app]));
    const usedAppIds = new Set();
    const sourcePages = Array.isArray(savedLayout?.pages) ? savedLayout.pages : [];
    const mergedPages = sourcePages.map((page) =>
      (page || [])
        .map((item) => {
          if (item?.type === "folder") return mergeFolderWithCatalog(item, catalog, usedAppIds);
          const app = item?.id ? catalog.get(item.id) || normalizeSavedCustomApp(item) : null;
          if (!app || usedAppIds.has(app.id)) return null;
          usedAppIds.add(app.id);
          return mergeAppWithSavedIcon(app, item);
        })
        .filter(Boolean)
    );
    const hidden = new Set(hiddenAppIds || []);
    const newApps = apps.filter((app) => !usedAppIds.has(app.id) && !hidden.has(app.id));
    return fitPagesToGrid(appendAppsToPages(mergedPages, newApps));
  }

  function makeLayoutPages(sourcePages) {
    return (sourcePages || []).map((page) => (page || []).filter(Boolean).map(makeLayoutItem));
  }

  function makeLayoutItem(item) {
    if (item.type === "folder") {
      const sourcePages = Array.isArray(item.childPages)
        ? item.childPages
        : getFolderChildPages(item, getFolderPageSize());
      const childPages = sourcePages.map((page) => (page || []).filter(Boolean).map(makeLayoutItem));
      return {
        id: item.id,
        type: "folder",
        name: item.name,
        childPages,
        children: childPages.flat(),
      };
    }

    const clean = {
      id: item.id,
      type: "app",
      name: item.name,
      emoji: item.emoji,
    };
    if (item.customIconDataUrl) clean.customIconDataUrl = item.customIconDataUrl;
    if (item.launchTarget) clean.launchTarget = item.launchTarget;
    if (item.launchArgs) clean.launchArgs = item.launchArgs;
    return clean;
  }

  function createLayoutSnapshot(state) {
    return {
      version: 1,
      pages: makeLayoutPages(state.pages),
      settings: {
        gridRows: state.gridRows,
        gridCols: state.gridCols,
        folderRows: state.folderRows,
        folderCols: state.folderCols,
        iconSize: state.iconSize,
        folderIconSizeMode: state.folderIconSizeMode,
        folderIconSize: state.folderIconSize,
        textless: state.textless,
        hiddenAppIds: state.hiddenAppIds,
      },
    };
  }

  return {
    appendAppsToPages,
    createLayoutSnapshot,
    fitPagesToGrid,
    mergeNativeCatalogWithSavedLayout,
  };
}
