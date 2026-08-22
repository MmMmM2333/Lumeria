import { reloadOnPixiHotUpdate } from "../devHmr.js";

export interface RootStageRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface RootStageRectInput {
  height?: number;
  left?: number;
  top?: number;
  width?: number;
}

interface RootStageMetrics {
  height: number;
  layoutRect: RootStageRect;
  rect: RootStageRect;
  width: number;
}

interface SingleStageCandidates {
  rootRect?: RootStageRectInput | null;
  shellRect?: RootStageRectInput | null;
}

interface RootStagePadding {
  bottom?: unknown;
  top?: unknown;
}

interface DesktopRenderGeometryOptions extends SingleStageCandidates {
  mainPaddingBottom?: unknown;
  mainPaddingTop?: unknown;
  mainRect?: RootStageRectInput | null;
  rootStage?: boolean;
}

export interface DesktopRenderGeometry {
  desktopFrame: RootStageRect;
  desktopStageRect: RootStageRect;
  height: number;
  stageRect: RootStageRect;
  width: number;
}

function safeNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function makeRootStageRect(
  rect?: RootStageRectInput | null,
  fallback: RootStageRectInput = {}
): RootStageRect {
  const width = Math.max(1, safeNumber(rect?.width, fallback.width || 1));
  const height = Math.max(1, safeNumber(rect?.height, fallback.height || 1));
  const left = safeNumber(rect?.left, fallback.left || 0);
  const top = safeNumber(rect?.top, fallback.top || 0);
  return {
    height,
    left,
    top,
    width,
  };
}

export function makeDesktopFrameFromStageRects(
  rootStageRect?: RootStageRectInput | null,
  desktopStageRect?: RootStageRectInput | null
): RootStageRect {
  const root = makeRootStageRect(rootStageRect);
  const desktop = makeRootStageRect(desktopStageRect, root);
  return {
    height: desktop.height,
    left: desktop.left - root.left,
    top: desktop.top - root.top,
    width: desktop.width,
  };
}

export function makeRootStageHostStyle(rect?: RootStageRectInput | null): Record<
  "--pixi-root-stage-height" | "--pixi-root-stage-left" | "--pixi-root-stage-top" | "--pixi-root-stage-width",
  string
> {
  const root = makeRootStageRect(rect);
  return {
    "--pixi-root-stage-height": `${root.height}px`,
    "--pixi-root-stage-left": `${root.left}px`,
    "--pixi-root-stage-top": `${root.top}px`,
    "--pixi-root-stage-width": `${root.width}px`,
  };
}

export function resolveSingleStageCandidateRect(
  metrics: RootStageMetrics,
  candidates: SingleStageCandidates = {}
): RootStageRect {
  return makeRootStageRect(
    candidates.rootRect ||
      candidates.shellRect ||
      metrics?.layoutRect ||
      metrics?.rect,
    metrics?.rect || metrics?.layoutRect
  );
}

export function makeRootStageDesktopContentRect(
  metrics: RootStageMetrics,
  stageRect: RootStageRectInput | null | undefined,
  mainRect: RootStageRectInput | null | undefined,
  padding: RootStagePadding = {}
): RootStageRect {
  if (!mainRect) return metrics?.layoutRect || makeRootStageRect(stageRect);
  const paddingTop = safeNumber(padding.top);
  const paddingBottom = safeNumber(padding.bottom);
  return {
    height: Math.max(1, safeNumber(mainRect.height, 1) - paddingTop - paddingBottom),
    left: safeNumber(stageRect?.left),
    top: safeNumber(mainRect.top) + paddingTop,
    width: Math.max(1, safeNumber(stageRect?.width, mainRect.width || 1)),
  };
}

export function makeDesktopRenderGeometry(
  metrics: RootStageMetrics,
  options: DesktopRenderGeometryOptions = {}
): DesktopRenderGeometry {
  const stageRect = resolveSingleStageCandidateRect(metrics, options);
  const desktopStageRect = makeRootStageDesktopContentRect(
    metrics,
    stageRect,
    options.mainRect,
    {
      bottom: options.mainPaddingBottom,
      top: options.mainPaddingTop,
    }
  );
  return {
    desktopFrame: makeDesktopFrameFromStageRects(stageRect, desktopStageRect),
    desktopStageRect,
    height: Math.max(1, stageRect.height),
    stageRect,
    width: Math.max(1, stageRect.width),
  };
}

export function mapDesktopLocalRectToRootStageLocal(
  rect: RootStageRect | null | undefined,
  desktopFrame: RootStageRectInput | null | undefined
): RootStageRect | null {
  if (!rect) return null;
  const frame = desktopFrame || {};
  return {
    height: rect.height,
    left: safeNumber(frame.left) + safeNumber(rect.left),
    top: safeNumber(frame.top) + safeNumber(rect.top),
    width: rect.width,
  };
}

export function mapRootStageLocalRectToDesktopLocal(
  rect: RootStageRect | null | undefined,
  desktopFrame: RootStageRectInput | null | undefined
): RootStageRect | null {
  if (!rect) return null;
  const frame = desktopFrame || {};
  return {
    height: rect.height,
    left: safeNumber(rect.left) - safeNumber(frame.left),
    top: safeNumber(rect.top) - safeNumber(frame.top),
    width: rect.width,
  };
}

export function mapClientRectToRootStageLocal(
  rect: RootStageRect | null | undefined,
  rootStageRect: RootStageRectInput | null | undefined
): RootStageRect | null {
  if (!rect) return null;
  const root = makeRootStageRect(rootStageRect);
  return {
    height: rect.height,
    left: safeNumber(rect.left) - root.left,
    top: safeNumber(rect.top) - root.top,
    width: rect.width,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
