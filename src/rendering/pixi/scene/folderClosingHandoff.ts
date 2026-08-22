import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import { getStableFolderClosePresentationHitRects } from "./folderOverlayTargets.js";
import type { FolderOverlayRect, StableFolderCloseTarget } from "./folderOverlayTargets.js";

interface ClosingPresentationSnapshot {
  readonly folderId?: string | null | undefined;
  readonly handoffRect?: FolderOverlayRect | null | undefined;
  readonly handoffTarget?: StableFolderCloseTarget | null | undefined;
}

interface FolderVisualSessionLike {
  readonly snapshot?: (() => Readonly<{
    closing?: ClosingPresentationSnapshot | null | undefined;
  }>) | undefined;
}

interface OverlayVisibilityTarget {
  visible: boolean;
}

interface OverlayPageDotsTarget extends OverlayVisibilityTarget {
  eventMode: string;
  hitArea: ClosingPresentationHitArea | null;
}

export interface ClosingPresentationHitArea {
  contains(x: number, y: number): boolean;
}

export interface FolderClosingHandoffLayer {
  readonly currentFolderId?: string | null | undefined;
  readonly folderVisualSession?: FolderVisualSessionLike | null | undefined;
  getClosingPresentationFrameRect(): StageRect | null | undefined;
  hitArea: ClosingPresentationHitArea | null;
  notifyTitleFrame?(frame: null, options: Readonly<{ folderId: string | null }>): unknown;
  readonly pageDotsLayer?: OverlayPageDotsTarget | null | undefined;
  readonly pageTrack: OverlayVisibilityTarget;
  readonly panel: OverlayVisibilityTarget;
  readonly stableFolderCloseTarget?: StableFolderCloseTarget | null | undefined;
  readonly stageRect?: StageOrigin | null | undefined;
}

function isUsableRect(rect: StageRect | null | undefined): rect is StageRect {
  return Boolean(rect) && rect!.width > 0 && rect!.height > 0;
}

function isPointInRect(x: number, y: number, rect: StageRect | null | undefined): boolean {
  return Boolean(rect) &&
    x >= rect!.left &&
    x <= rect!.left + rect!.width &&
    y >= rect!.top &&
    y <= rect!.top + rect!.height;
}

export function applyClosingHandoffOnlyOverlayState(layer: FolderClosingHandoffLayer): null {
  layer.hitArea = null;
  layer.panel.visible = false;
  layer.pageTrack.visible = false;
  if (layer.pageDotsLayer) {
    layer.pageDotsLayer.visible = false;
    layer.pageDotsLayer.eventMode = "none";
    layer.pageDotsLayer.hitArea = null;
  }
  layer.notifyTitleFrame?.(null, {
    folderId: layer.folderVisualSession?.snapshot?.().closing?.folderId || layer.currentFolderId || null,
  });
  return null;
}

export function getClosingPresentationStageHitRects(
  layer: FolderClosingHandoffLayer,
): readonly StageRect[] {
  const closeSnapshot = layer?.folderVisualSession?.snapshot?.().closing || null;
  const targetRects = getStableFolderClosePresentationHitRects({
    handoffRect: closeSnapshot?.handoffRect,
    stableFolderCloseTarget: closeSnapshot?.handoffTarget || layer?.stableFolderCloseTarget,
  } as Parameters<typeof getStableFolderClosePresentationHitRects>[0])
    .map((rect) => clientRectToStageVisualRect(rect, layer?.stageRect))
    .filter(isUsableRect);
  if (targetRects.length) return targetRects;
  const frameRect = layer.getClosingPresentationFrameRect();
  if (isUsableRect(frameRect)) return [frameRect];
  return [];
}

export function makeClosingPresentationHitArea(
  layer: FolderClosingHandoffLayer,
): ClosingPresentationHitArea {
  return {
    contains(x: number, y: number): boolean {
      return getClosingPresentationStageHitRects(layer).some((rect) => isPointInRect(x, y, rect));
    },
  };
}

export function applyClosingPresentationOverlayState(
  layer: FolderClosingHandoffLayer,
): ClosingPresentationHitArea {
  layer.hitArea = makeClosingPresentationHitArea(layer);
  if (layer.pageDotsLayer) {
    layer.pageDotsLayer.visible = false;
    layer.pageDotsLayer.eventMode = "none";
    layer.pageDotsLayer.hitArea = null;
  }
  return layer.hitArea;
}

reloadOnPixiHotUpdate(import.meta.hot);
