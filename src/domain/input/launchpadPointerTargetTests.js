import {
  isLaunchpadContextMenuInteractionBlocked,
  makeLaunchSourceFromBounds,
  resolveLaunchpadContextMenuTarget,
} from "./launchpadPointerTarget.js";

export function runLaunchpadPointerTargetTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad pointer target test failed] ${message}`);
  };

  const app = { id: "app-a", name: "App A", type: "app" };
  const folderApp = { id: "app-folder", name: "Folder App", type: "app" };
  const folderPanelRect = { bottom: 420, height: 240, left: 180, right: 620, top: 180, width: 440 };
  const mainRect = { bottom: 500, height: 400, left: 100, right: 700, top: 100, width: 600 };

  assert(
    makeLaunchSourceFromBounds({
      meta: { area: "search", index: 2, pageIndex: 0 },
    }).type === "search",
    "search bounds should resolve to a search source without a second state lookup"
  );

  let requestedOptions = null;
  const iconRoute = resolveLaunchpadContextMenuTarget({
    clientX: 220,
    clientY: 180,
    getIconAtPoint: (x, y, options) => {
      requestedOptions = { options, x, y };
      return {
        id: app.id,
        meta: { area: "desktop", id: app.id, index: 3, item: app, pageIndex: 1 },
      };
    },
    mainRect,
  });
  assert(iconRoute?.kind === "icon" && iconRoute.item === app, "desktop icon hits should resolve to the icon route");
  assert(iconRoute?.source?.type === "page" && iconRoute.source.pageIndex === 1, "desktop icon routes should preserve their page source");
  assert(
    requestedOptions?.x === 220 &&
    requestedOptions?.y === 180 &&
    requestedOptions?.options?.area === "desktop",
    "desktop routing should query only desktop launch bounds at the requested point"
  );

  requestedOptions = null;
  const folderRoute = resolveLaunchpadContextMenuTarget({
    clientX: 320,
    clientY: 260,
    folderId: "folder-a",
    folderPanelRect,
    getIconAtPoint: (x, y, options) => {
      requestedOptions = { options, x, y };
      return {
        id: folderApp.id,
        meta: {
          area: "folder",
          folderId: "folder-a",
          id: folderApp.id,
          index: 4,
          item: folderApp,
          pageIndex: 2,
        },
      };
    },
    isFolderLayerActive: true,
    mainRect,
  });
  assert(folderRoute?.kind === "icon" && folderRoute.item === folderApp, "folder icon hits should remain eligible for icon menus");
  assert(
    folderRoute?.source?.type === "folder" &&
    folderRoute.source.folderId === "folder-a" &&
    requestedOptions?.options?.area === "folder" &&
    requestedOptions?.options?.folderId === "folder-a",
    "folder routing should preserve and constrain the folder source"
  );

  const surfaceRoute = resolveLaunchpadContextMenuTarget({
    clientX: 400,
    clientY: 400,
    getIconAtPoint: () => null,
    mainRect,
  });
  assert(surfaceRoute?.kind === "surface", "blank points inside the desktop main rectangle should resolve to the surface menu");

  const folderSurfaceRoute = resolveLaunchpadContextMenuTarget({
    clientX: 400,
    clientY: 360,
    folderId: "folder-a",
    folderPanelRect,
    getIconAtPoint: () => null,
    isFolderLayerActive: true,
    mainRect,
  });
  assert(
    folderSurfaceRoute?.kind === "folder-surface" && folderSurfaceRoute.folderId === "folder-a",
    "blank points inside an open folder panel should resolve to a folder-scoped surface menu"
  );

  assert(
    resolveLaunchpadContextMenuTarget({
      clientX: 120,
      clientY: 360,
      folderId: "folder-a",
      folderPanelRect,
      getIconAtPoint: () => null,
      isFolderLayerActive: true,
      mainRect,
    }) === null,
    "blank points outside the folder panel should not resolve to the folder surface menu"
  );

  for (const state of [{ isSearchMode: true }]) {
    const route = resolveLaunchpadContextMenuTarget({
      clientX: 400,
      clientY: 400,
      getIconAtPoint: () => null,
      mainRect,
      ...state,
    });
    assert(route === null, "blank search points should not resolve to a surface menu");
  }

  assert(
    resolveLaunchpadContextMenuTarget({
      clientX: 400,
      clientY: 99,
      getIconAtPoint: () => null,
      mainRect,
    }) === null,
    "points outside the desktop main rectangle should not resolve to a menu"
  );

  for (const blockedState of [
    { dragMeta: { item: app } },
    { isBatchSelectionActive: true },
    { isDialogOpen: true },
    { isEditMode: true },
    { isHomeInteractionDisabled: true },
    { isSettingsPanelOpen: true },
  ]) {
    assert(
      isLaunchpadContextMenuInteractionBlocked(blockedState),
      "drag, batch selection, Alt edit, dialog, disabled-home, and settings states should each block context-menu routing"
    );
  }

  let blockedHitTested = false;
  const blockedRoute = resolveLaunchpadContextMenuTarget({
    clientX: 220,
    clientY: 180,
    getIconAtPoint: () => {
      blockedHitTested = true;
      return null;
    },
    isInteractionBlocked: true,
    mainRect,
  });
  assert(blockedRoute === null && !blockedHitTested, "blocked requests should stop before querying rendered icon bounds");
}
