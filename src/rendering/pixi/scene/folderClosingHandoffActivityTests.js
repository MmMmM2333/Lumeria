import {
  resolveFolderClosingHandoffId,
  resolveFolderPixiActivityUpdate,
  shouldClearFolderClosingHandoffRetainId,
} from "./folderClosingHandoffActivity.js";

export function runFolderClosingHandoffActivityTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder closing handoff activity test failed] ${message}`);
  };

  assert(
    resolveFolderClosingHandoffId({
      activityFolderId: "folder-active",
      hasPixiActivity: true,
      isHomeRevealSettling: true,
      retainedFolderId: "folder-retained",
    }) === "folder-active",
    "active Pixi activity should win over retained settling id"
  );
  assert(
    resolveFolderClosingHandoffId({
      hasPixiActivity: false,
      isHomeRevealSettling: true,
      retainedFolderId: "folder-retained",
    }) === null,
    "home reveal settling should leave retained handoff release to the Pixi retainer"
  );
  assert(
    resolveFolderClosingHandoffId({
      hasPixiActivity: false,
      isHomeRevealSettling: false,
      retainedFolderId: "folder-retained",
    }) === null,
    "idle state should not expose a stale retained handoff id"
  );

  const activeWithExplicitFolder = resolveFolderPixiActivityUpdate({
    active: true,
    currentActivityFolderId: "folder-current",
    folderId: "folder-next",
    retainedFolderId: "folder-retained",
  });
  assert(activeWithExplicitFolder.hasPixiActivity, "active update should enable Pixi activity");
  assert(activeWithExplicitFolder.activityFolderId === "folder-next", "active update should prefer the explicit folder id");
  assert(activeWithExplicitFolder.retainedFolderId === "folder-next", "active update should retain the active folder id");

  const activeWithFallbackFolder = resolveFolderPixiActivityUpdate({
    active: true,
    currentActivityFolderId: "folder-current",
    retainedFolderId: "folder-retained",
  });
  assert(activeWithFallbackFolder.activityFolderId === "folder-current", "active update should fall back to the current activity id");
  assert(activeWithFallbackFolder.retainedFolderId === "folder-current", "active fallback should retain the chosen activity id");

  const inactiveUpdate = resolveFolderPixiActivityUpdate({
    active: false,
    currentActivityFolderId: "folder-current",
    retainedFolderId: "folder-retained",
  });
  assert(!inactiveUpdate.hasPixiActivity, "inactive update should clear Pixi activity");
  assert(inactiveUpdate.activityFolderId === null, "inactive update should clear the activity folder id");
  assert(inactiveUpdate.retainedFolderId === "folder-retained", "inactive update should leave retained id cleanup to settle state");

  assert(
    shouldClearFolderClosingHandoffRetainId({ hasPixiActivity: false, isHomeRevealSettling: false }),
    "idle state should clear the retained handoff id"
  );
  assert(
    !shouldClearFolderClosingHandoffRetainId({ hasPixiActivity: true, isHomeRevealSettling: false }),
    "active Pixi activity should keep the retained handoff id"
  );
  assert(
    !shouldClearFolderClosingHandoffRetainId({ hasPixiActivity: false, isHomeRevealSettling: true }),
    "home reveal settling should keep the retained handoff id"
  );
}
