export const FOLDER_OVERLAY_STATE_RENDER_REF_KEYS = Object.freeze([
  "folderCloseIconGhosts",
  "folderGridStyle",
  "folderOpeningOriginBounds",
  "folderOpeningCancelRequest",
  "folderOpenProgress",
  "folderOpenProgressTarget",
  "folderOpenIconGhosts",
  "folderOpenIconGhostSession",
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
] as const);

export type FolderOverlayStateRenderRefKey = typeof FOLDER_OVERLAY_STATE_RENDER_REF_KEYS[number];
export type FolderOverlayStateRenderDependencies = Partial<Record<FolderOverlayStateRenderRefKey, unknown>>;

export function resolveMaybeRefValue(value: unknown): unknown {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

export function readFolderOverlayStateRenderDependencies(
  state: object | null | undefined,
): FolderOverlayStateRenderDependencies {
  if (!state) return {};
  const dependencies: FolderOverlayStateRenderDependencies = {};
  for (const key of FOLDER_OVERLAY_STATE_RENDER_REF_KEYS) {
    dependencies[key] = resolveMaybeRefValue((state as Readonly<Record<string, unknown>>)[key]);
  }
  return dependencies;
}
