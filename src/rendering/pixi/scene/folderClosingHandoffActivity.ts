interface FolderClosingHandoffOptions {
  activityFolderId?: string | null;
  hasPixiActivity?: boolean;
  isHomeRevealSettling?: boolean;
  retainedFolderId?: string | null;
}

interface FolderPixiActivityUpdateOptions {
  active?: boolean;
  currentActivityFolderId?: string | null;
  folderId?: string | null;
  retainedFolderId?: string | null;
}

interface FolderPixiActivityUpdate {
  activityFolderId: string | null;
  hasPixiActivity: boolean;
  retainedFolderId: string | null;
}

interface FolderSourceGhostSession {
  folderId: string;
  status: string;
}

interface FolderSourceGhostedIdsOptions {
  folderOpenIconGhostSession?: FolderSourceGhostSession | null;
  folderOpenPreviewFrameGhostedIds?: readonly string[] | null;
  folderPixiInternalActivity?: boolean;
  folderPixiInternalActivityFolderId?: string | null;
  isFolderAppLaunchClosing?: boolean;
  isFolderClosing?: boolean;
  isFolderOpeningPreviewFrameGhosted?: (folderId: string) => boolean;
  isFolderZoomFadeClosing?: boolean;
  openFolderId?: string | null;
  renderedFolderId?: string | null;
}

export function resolveFolderClosingHandoffId(options: FolderClosingHandoffOptions = {}): string | null {
  const {
    activityFolderId = null,
    hasPixiActivity = false,
  } = options;

  if (hasPixiActivity) return activityFolderId || null;
  return null;
}

export function resolveFolderPixiActivityUpdate(
  options: FolderPixiActivityUpdateOptions = {}
): FolderPixiActivityUpdate {
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

export function shouldClearFolderClosingHandoffRetainId(options: {
  hasPixiActivity?: boolean;
  isHomeRevealSettling?: boolean;
} = {}): boolean {
  return !options.hasPixiActivity && !options.isHomeRevealSettling;
}

export function resolveFolderSourceGhostedIds(options: FolderSourceGhostedIdsOptions = {}): Set<string> {
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
  const ids = new Set<string>();
  const add = (folderId: string | null | undefined) => {
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
