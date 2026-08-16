import {
  resolveFolderClosingHandoffId,
  resolveFolderPixiActivityUpdate,
  resolveFolderSourceGhostedIds,
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

  const currentOnlyGhosts = resolveFolderSourceGhostedIds({
    folderOpenPreviewFrameGhostedIds: ["folder-opening"],
    folderPixiInternalActivity: false,
    folderPixiInternalActivityFolderId: "folder-detached",
    isFolderClosing: true,
    isFolderOpeningPreviewFrameGhosted: (folderId) => folderId === "folder-current",
    openFolderId: null,
    renderedFolderId: "folder-current",
  });
  assert(currentOnlyGhosts.has("folder-current"), "current closing folder should keep its desktop source ghosted");
  assert(currentOnlyGhosts.has("folder-opening"), "opening preview frame ghosts should still hide their desktop source");
  assert(!currentOnlyGhosts.has("folder-detached"), "inactive retained handoff ids should not ghost old desktop sources");

  const activityGhosts = resolveFolderSourceGhostedIds({
    folderPixiInternalActivity: true,
    folderPixiInternalActivityFolderId: "folder-detached",
    renderedFolderId: "folder-current",
  });
  assert(activityGhosts.has("folder-detached"), "active Pixi activity should own its desktop source ghosting");
  assert(!activityGhosts.has("folder-current"), "rendered folders should not be ghosted without an active open or closing phase");

  const stagedOpeningGhosts = resolveFolderSourceGhostedIds({
    folderOpenIconGhostSession: {
      folderId: "folder-staged",
      status: "staged",
    },
    openFolderId: "folder-staged",
    renderedFolderId: "folder-staged",
  });
  assert(!stagedOpeningGhosts.has("folder-staged"), "staged opening sessions should keep the desktop source visible until Pixi accepts the visual session");

  const acceptedOpeningGhosts = resolveFolderSourceGhostedIds({
    folderOpenIconGhostSession: {
      folderId: "folder-accepted",
      status: "accepted",
    },
    openFolderId: "folder-accepted",
    renderedFolderId: "folder-accepted",
  });
  assert(acceptedOpeningGhosts.has("folder-accepted"), "accepted opening sessions should ghost the desktop source");
}
