export const FOLDER_OVERLAY_STATE_RENDER_REF_KEYS = Object.freeze([
  "dragMeta",
  "dragReleaseState",
  "folderCloseIconGhosts",
  "folderGridStyle",
  "folderOpeningOriginBounds",
  "folderOpenIconGhosts",
  "folderPageIndex",
  "folderPageTurnRequest",
  "folderPageTrackScrub",
  "folderPageSize",
  "folderPages",
  "folderPanelStyle",
  "folderZoomFadeCloseReason",
  "isEditMode",
  "isFolderAppLaunchClosing",
  "isFolderCloseIconAnimationActive",
  "isFolderClosing",
  "isFolderOpenFrameGhostPending",
  "isFolderOpenIconAnimationActive",
  "isFolderZoomFadeClosing",
  "isFolderZoomFadeClosingFromFolderClose",
  "isTextlessMode",
  "launchTargetStatusById",
  "renderedFolder",
  "showMissingLaunchTargetBadge",
  "visualFolderPageIndex",
]);

export function resolveMaybeRefValue(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

export function readFolderOverlayStateRenderDependencies(state) {
  if (!state) return {};
  const dependencies = {};
  for (const key of FOLDER_OVERLAY_STATE_RENDER_REF_KEYS) {
    dependencies[key] = resolveMaybeRefValue(state[key]);
  }
  return dependencies;
}
