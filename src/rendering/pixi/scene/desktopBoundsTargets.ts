import { snapRectToDevicePixels, STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";
import { makeContainerTargetIconBounds, makeIconRect, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { makeFolderThumbPreviewRect } from "./folderOverlayTargets.js";
import type {
  StageOrigin,
  StagePoint,
  StageRect,
  StageVisualRect,
} from "../geometry/stageCoordinates.js";
import type { SceneItem } from "../../sceneFrame.js";

interface DesktopBoundsTransform {
  apply(point: StagePoint): StagePoint;
}

export interface DesktopBoundsVisualRoot {
  getGlobalPosition?: () => StagePoint;
  getGlobalTransform?: () => DesktopBoundsTransform | null;
}

export interface DesktopBoundsNode {
  getFolderThumbBounds(stageRect: StageOrigin): StageRect;
  getIconBounds(stageRect: StageOrigin): StageRect;
}

export interface DesktopBoundsRegistrationProjection {
  deviceResolution?: number;
  height: number;
  stageRect: StageRect;
  width: number;
}

export interface DesktopBoundsSizing {
  iconSize: number;
}

export interface DesktopHandoffLayoutTarget {
  readonly [key: string]: unknown;
  x: number;
  y: number;
}

export interface DesktopBoundsTargetsOptions {
  handoffLayoutTarget?: DesktopHandoffLayoutTarget | null;
  isFolderClosingHandoff?: boolean;
  item: SceneItem;
  node: DesktopBoundsNode;
  registration: DesktopBoundsRegistrationProjection;
  sizing: DesktopBoundsSizing;
  targetX: number;
  visualOffsetY?: number;
  visualRoot: DesktopBoundsVisualRoot;
  x: number;
  y: number;
}

export interface DesktopBoundsTargets {
  coordinateSpace: typeof STAGE_COORDINATE_SPACES.CLIENT_VISUAL;
  liveClientTargetBounds: StageVisualRect;
  renderedClientIconBounds: StageRect;
  renderedClientThumbBounds: StageRect | null;
  stableProjectedClientTargetBounds: StageVisualRect;
  stableStageLayoutTargetBounds: StageRect;
  syncHandoffLayoutTarget: DesktopHandoffLayoutTarget | null;
}

export interface FolderPreviewBoundsNode {
  getFolderPreviewChildBounds?(stageRect: StageOrigin, slotIndex: number): StageRect | null;
}

export interface FolderPreviewBoundsTarget {
  liveThumbRect?: StageRect | null;
  stableStageLayoutThumbRect?: StageRect | null;
}

export interface FolderPreviewChildBoundsTargetsOptions {
  node?: FolderPreviewBoundsNode | null;
  slotIndex: number;
  stageRect: StageOrigin;
  target?: FolderPreviewBoundsTarget | null;
}

export interface FolderPreviewChildBoundsTargets {
  coordinateSpace: typeof STAGE_COORDINATE_SPACES.CLIENT_VISUAL;
  liveClientTargetBounds: StageRect | null;
  renderedClientBounds: StageRect | null;
  stableStageLayoutTargetBounds: StageRect | null;
}

export function resolveDesktopBoundsTargets(
  options: DesktopBoundsTargetsOptions,
): DesktopBoundsTargets {
  if (!options) {
    throw new TypeError("resolveDesktopBoundsTargets requires options");
  }
  const {
    handoffLayoutTarget = null,
    isFolderClosingHandoff = false,
    item,
    node,
    registration,
    sizing,
    targetX,
    visualOffsetY = 0,
    x,
    y,
  } = options;
  const isFolder = item?.type === "folder";
  const rawLiveTargetBounds = makeContainerTargetIconBounds(
    options.visualRoot,
    registration.stageRect,
    registration.width,
    registration.height,
    targetX + x,
    y,
    sizing.iconSize,
    visualOffsetY
  );
  const rawStableTargetBounds = makeTargetIconBounds(
    registration.stageRect,
    registration.width,
    registration.height,
    targetX + x,
    y,
    sizing.iconSize,
    visualOffsetY
  );
  const stableStageLayoutTargetBounds = makeIconRect(targetX + x, y + visualOffsetY, sizing.iconSize);
  const stableProjectedClientTargetBounds = isFolder
    ? snapRectToDevicePixels(rawStableTargetBounds, registration.deviceResolution)
    : rawStableTargetBounds;
  let liveClientTargetBounds = isFolder
    ? snapRectToDevicePixels(rawLiveTargetBounds, registration.deviceResolution)
    : rawLiveTargetBounds;
  let renderedClientThumbBounds = null;
  if (isFolder) {
    renderedClientThumbBounds = snapRectToDevicePixels(
      node.getFolderThumbBounds(registration.stageRect),
      registration.deviceResolution
    );
    if (isFolderClosingHandoff) liveClientTargetBounds = stableProjectedClientTargetBounds;
  }
  const renderedClientIconBounds = isFolder
    ? snapRectToDevicePixels(node.getIconBounds(registration.stageRect), registration.deviceResolution)
    : node.getIconBounds(registration.stageRect);

  return {
    coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    liveClientTargetBounds,
    renderedClientIconBounds,
    renderedClientThumbBounds,
    stableStageLayoutTargetBounds,
    stableProjectedClientTargetBounds,
    syncHandoffLayoutTarget: isFolderClosingHandoff ? handoffLayoutTarget || { x, y } : null,
  };
}

export function resolveFolderPreviewChildBoundsTargets(
  options?: undefined,
): FolderPreviewChildBoundsTargets;
export function resolveFolderPreviewChildBoundsTargets(
  options: FolderPreviewChildBoundsTargetsOptions,
): FolderPreviewChildBoundsTargets;
export function resolveFolderPreviewChildBoundsTargets(
  options?: FolderPreviewChildBoundsTargetsOptions,
): FolderPreviewChildBoundsTargets {
  if (!options) {
    return {
      coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      liveClientTargetBounds: null,
      renderedClientBounds: null,
      stableStageLayoutTargetBounds: null,
    };
  }
  const {
    node,
    slotIndex,
    stageRect,
    target = null,
  } = options;
  const stableStageLayoutTargetBounds = target?.stableStageLayoutThumbRect
    ? makeFolderThumbPreviewRect(target.stableStageLayoutThumbRect, slotIndex)
    : null;

  return {
    coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    liveClientTargetBounds: target?.liveThumbRect ? makeFolderThumbPreviewRect(target.liveThumbRect, slotIndex) : null,
    renderedClientBounds: node?.getFolderPreviewChildBounds?.(stageRect, slotIndex) || null,
    stableStageLayoutTargetBounds,
  };
}
