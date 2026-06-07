import {
  getActiveAppFolderCreateHoverState,
  getActiveFolderHoverState,
  getAppFolderCreateTargetPadding,
  getFolderHoverTargetPadding,
  getFolderPreviewPlanKey,
} from "./iconFolderHoverState.js";

export function runIconFolderHoverStateTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon folder hover state test failed] ${message}`);
  };

  assert(getFolderHoverTargetPadding(24) === 6, "folder hover padding should keep the lower bound");
  assert(getFolderHoverTargetPadding(64) === 64 * 0.16, "folder hover padding should scale with regular icon sizes");
  assert(getFolderHoverTargetPadding(120) === 14, "folder hover padding should keep the upper bound");
  assert(getAppFolderCreateTargetPadding(24) === 8, "app-folder padding should keep the lower bound");
  assert(getAppFolderCreateTargetPadding(64) === 64 * 0.18, "app-folder padding should scale with regular icon sizes");
  assert(getAppFolderCreateTargetPadding(120) === 16, "app-folder padding should keep the upper bound");

  const folderHover = { key: "folder-key", phase: "hover", targetId: "folder-1", targetType: "folder" };
  assert(getActiveFolderHoverState({ hoverState: folderHover, isFolder: true, itemId: "folder-1" }) === folderHover, "matching folder hover should be active");
  assert(!getActiveFolderHoverState({ hoverState: folderHover, isFolder: false, itemId: "folder-1" }), "non-folder nodes should ignore folder hover");
  assert(!getActiveFolderHoverState({ hoverState: folderHover, isFolder: true, itemId: "folder-2" }), "non-matching folders should ignore folder hover");

  const appHover = { key: "app-key", phase: "flash", targetId: "app-1", targetType: "app" };
  assert(getActiveAppFolderCreateHoverState({ hoverState: appHover, itemId: "app-1", itemType: "app" }) === appHover, "matching app hover should be active");
  assert(!getActiveAppFolderCreateHoverState({ hoverState: appHover, isFolder: true, itemId: "app-1", itemType: "folder" }), "folders should ignore app-folder hover");
  assert(!getActiveAppFolderCreateHoverState({ hoverState: appHover, itemId: "app-2", itemType: "app" }), "non-matching apps should ignore app-folder hover");

  const planKey = getFolderPreviewPlanKey(folderHover, {
    endY: -16,
    items: [{ id: "a" }, null, { id: "c" }],
  });
  assert(planKey === "folder-key:-16:a||c", "preview plan key should include hover key, scroll target, and child ids");
}
