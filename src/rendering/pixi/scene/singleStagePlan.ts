import { getFolderPanelGeometry } from "../geometry/gridGeometry.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import {
  getStableFolderCloseRects,
  makeFolderThumbPreviewRect,
  makePreviewChildKey,
  projectFolderCloseTargetToClient,
} from "./folderOverlayTargets.js";
import { resolveFolderOverlayTargets } from "./folderOverlayTargetResolver.js";
import type {
  CapturedFolderOriginBounds,
  FolderOverlayTargetFolder,
} from "./folderOverlayTargetResolver.js";
import type { IconBoundsRegistry } from "../geometry/iconBoundsRegistry.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import type { FolderOverlayRect, StableFolderCloseTarget } from "./folderOverlayTargets.js";

export const SINGLE_STAGE_RENDER_KEY = "single-stage";
const DEFAULT_SINGLE_STAGE_DIAGNOSTICS_OPTIONS = Object.freeze({
  diagnostics: false,
  log: false,
  probe: false,
});

export interface SingleStageDiagnosticsOptions {
  diagnostics: boolean;
  log: boolean;
  probe: boolean;
}

interface SingleStageDiagnosticsInput {
  diagnostics?: boolean;
  log?: boolean;
  probe?: boolean;
}

interface SingleStageDiagnosticsState {
  canvasStageRect?: StageRect | null;
  desktopFrame?: StageRect | null;
  desktopPageTrackOffset?: { liveX?: number | null; targetX?: number | null } | null;
  desktopStageRect?: StageRect | null;
  folderOpeningOriginBounds?: CapturedFolderOriginBounds | null;
  folderPageSize?: number;
  folderPanelStyle?: Readonly<Record<string, string | undefined>>;
  height: number;
  isFolderAppLaunchClosing?: boolean;
  isFolderClosing?: boolean;
  renderedFolder?: (FolderOverlayTargetFolder & { id: string }) | null;
  stageRect: StageOrigin;
  width: number;
}

interface MakeSingleStageDiagnosticsPlanOptions {
  enabled?: boolean | SingleStageDiagnosticsInput | null;
  iconBoundsRegistry?: IconBoundsRegistry | null;
  previousStableFolderCloseTarget?: StableFolderCloseTarget | null;
  wasClosing?: boolean;
}

function cloneOptions(options: SingleStageDiagnosticsOptions): SingleStageDiagnosticsOptions {
  return { ...options };
}

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function getSingleStageDiagnosticsOptions(
  value: boolean | SingleStageDiagnosticsInput | null | undefined = undefined
): SingleStageDiagnosticsOptions {
  if (value === undefined) return cloneOptions(DEFAULT_SINGLE_STAGE_DIAGNOSTICS_OPTIONS);
  if (value === true) return { ...DEFAULT_SINGLE_STAGE_DIAGNOSTICS_OPTIONS, diagnostics: true, probe: true };
  if (!value || typeof value !== "object") return cloneOptions(DEFAULT_SINGLE_STAGE_DIAGNOSTICS_OPTIONS);
  const hasDiagnosticsOption = hasOwn(value, "diagnostics");
  const diagnosticsValue = hasDiagnosticsOption ? value.diagnostics : value.probe;
  const diagnostics = diagnosticsValue === true;
  return {
    diagnostics,
    log: value.log === true,
    probe: diagnostics,
  };
}

export function getSingleStageRenderKey(): typeof SINGLE_STAGE_RENDER_KEY {
  return SINGLE_STAGE_RENDER_KEY;
}

export function isSingleStageDiagnosticsEnabled(
  value: boolean | SingleStageDiagnosticsInput | null | undefined = undefined
): boolean {
  return getSingleStageDiagnosticsOptions(value).diagnostics;
}

export function makeSingleStageDiagnosticsPlan(
  state: SingleStageDiagnosticsState | null | undefined,
  options: MakeSingleStageDiagnosticsPlanOptions = {}
) {
  const enabled = options.enabled == null
    ? isSingleStageDiagnosticsEnabled()
    : isSingleStageDiagnosticsEnabled(options.enabled);
  if (!enabled || !state?.renderedFolder) return null;
  const geometry = getFolderPanelGeometry({
    height: state.height,
    panelStyle: state.folderPanelStyle,
    width: state.width,
  });
  const folderId = state.renderedFolder.id;
  const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
  const overlayTargets = resolveFolderOverlayTargets({
    folder: state.renderedFolder,
    folderOpeningOriginBounds: state.folderOpeningOriginBounds,
    folderPageSize: state.folderPageSize,
    iconBoundsRegistry: options.iconBoundsRegistry,
    isClosing,
    previousStableFolderCloseTarget: options.previousStableFolderCloseTarget,
    wasClosing: options.wasClosing,
  });
  const closeRects = getStableFolderCloseRects({
    folderId,
    folderRect: overlayTargets.folderClientRect,
    folderThumbRect: overlayTargets.folderThumbClientRect,
    isClosing,
    stableFolderCloseTarget: overlayTargets.stableFolderCloseTarget,
  });
  const stableTarget = overlayTargets.stableFolderCloseTarget;
  const projectedStableTarget = projectFolderCloseTargetToClient(stableTarget);
  const previewRects = (overlayTargets.previewSlots || []).slice(0, 9).map((item, slotIndex) => {
    if (!item?.id || !closeRects.closeThumbRect) return null;
    const previewKey = makePreviewChildKey(item.id, slotIndex);
    const rect = projectedStableTarget?.previewChildRects?.get(previewKey) ||
      makeFolderThumbPreviewRect(closeRects.closeThumbRect, slotIndex);
    return {
      itemId: item.id,
      clientRect: rect,
      rect,
      localRect: clientRectToStageVisualRect(rect, state.stageRect),
      stageLayoutRect: stableTarget?.previewChildRects?.get(previewKey) || null,
      slotIndex,
    };
  }).filter(Boolean);
  const stableCloseClientRect = closeRects.closeIconRect;
  const stableCloseThumbClientRect = closeRects.closeThumbRect;
  return {
    canvasStageRect: state.canvasStageRect || null,
    closeIconRect: closeRects.closeIconRect,
    closeIconLocalRect: clientRectToStageVisualRect(closeRects.closeIconRect, state.stageRect),
    closeThumbRect: closeRects.closeThumbRect,
    closeThumbLocalRect: clientRectToStageVisualRect(closeRects.closeThumbRect, state.stageRect),
    desktopFrame: state.desktopFrame || null,
    desktopStageRect: state.desktopStageRect || null,
    folderId,
    folderClientRect: overlayTargets.folderClientRect,
    folderLocalRect: clientRectToStageVisualRect(overlayTargets.folderClientRect, state.stageRect),
    geometry,
    panelRect: geometry.panel,
    previewRects,
    stableCloseClientRect,
    stableCloseLocalRect: clientRectToStageVisualRect(stableCloseClientRect, state.stageRect),
    stableCloseStageLayoutRect: stableTarget?.iconRect || null,
    stableCloseThumbClientRect,
    stableCloseThumbLocalRect: clientRectToStageVisualRect(stableCloseThumbClientRect, state.stageRect),
    stableCloseThumbStageLayoutRect: stableTarget?.thumbRect || null,
    stableFolderCloseTarget: overlayTargets.stableFolderCloseTarget,
    stageRect: state.stageRect,
  };
}
