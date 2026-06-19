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
