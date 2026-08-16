export function resolveFolderClosingHandoffId(options = {}) {
  const {
    activityFolderId = null,
    hasPixiActivity = false,
  } = options;

  if (hasPixiActivity) return activityFolderId || null;
  return null;
}

export function resolveFolderPixiActivityUpdate(options = {}) {
  const {
    active = false,
    currentActivityFolderId = null,
    folderId = null,
    retainedFolderId = null,
  } = options;
  const hasPixiActivity = Boolean(active);
  const nextFolderId = folderId || currentActivityFolderId || retainedFolderId || null;

  return {
    activityFolderId: hasPixiActivity ? nextFolderId : null,
    hasPixiActivity,
    retainedFolderId: hasPixiActivity && nextFolderId ? nextFolderId : retainedFolderId,
  };
}

export function shouldClearFolderClosingHandoffRetainId(options = {}) {
  return !options.hasPixiActivity && !options.isHomeRevealSettling;
}

export function resolveFolderSourceGhostedIds(options = {}) {
  const {
    folderOpenIconGhostSession = null,
    folderOpenPreviewFrameGhostedIds = [],
    folderPixiInternalActivity = false,
    folderPixiInternalActivityFolderId = null,
    isFolderAppLaunchClosing = false,
    isFolderClosing = false,
    isFolderOpeningPreviewFrameGhosted = () => false,
    isFolderZoomFadeClosing = false,
    openFolderId = null,
    renderedFolderId = null,
  } = options;
  const ids = new Set();
  const add = (folderId) => {
    if (folderId) ids.add(folderId);
  };
  const currentFolderId = renderedFolderId || openFolderId || null;
  const isStagedOpeningSession = folderOpenIconGhostSession?.folderId === currentFolderId &&
    folderOpenIconGhostSession?.status === "staged";

  if (folderPixiInternalActivity) add(folderPixiInternalActivityFolderId);
  if (openFolderId || isFolderAppLaunchClosing || isFolderZoomFadeClosing || isFolderClosing) {
    if (!isStagedOpeningSession || isFolderAppLaunchClosing || isFolderZoomFadeClosing || isFolderClosing) {
      add(currentFolderId);
    }
  }
  if (currentFolderId && isFolderOpeningPreviewFrameGhosted(currentFolderId)) add(currentFolderId);
  for (const folderId of folderOpenPreviewFrameGhostedIds || []) add(folderId);
  return ids;
}
