import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getFolderHoverTargetPadding } from "../nodes/iconFolderHoverState.js";
import type { IconFolderHoverState } from "../nodes/iconFolderHoverState.js";

interface FolderPresentationRectInput {
  height?: unknown;
  left?: unknown;
  top?: unknown;
  width?: unknown;
}

export interface FolderPresentationRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface FolderPresentationGeometryInput {
  hitRect?: FolderPresentationRectInput | null;
  hoverRect?: FolderPresentationRectInput | null;
  liveRect?: FolderPresentationRectInput | null;
  releaseRect?: FolderPresentationRectInput | null;
  renderedRect?: FolderPresentationRectInput | null;
  stableRect?: FolderPresentationRectInput | null;
}

export interface ResolvedFolderPresentationGeometry {
  geometryVersion: string;
  hitRect: FolderPresentationRect | null;
  hoverRect: FolderPresentationRect | null;
  liveRect: FolderPresentationRect | null;
  releaseRect: FolderPresentationRect | null;
  renderedRect: FolderPresentationRect | null;
  stableRect: FolderPresentationRect | null;
}

interface FolderHandoffEntry {
  cleanupFrame?: unknown;
  folderId?: string | null;
  visualReleased?: boolean;
}

interface FolderPresentationOptions {
  dragFolderHoverState?: IconFolderHoverState | null;
  dragFolderTargetId?: string | null;
  existingHandoffEntry?: FolderHandoffEntry | null;
  folderId?: string | null;
  geometry?: FolderPresentationGeometryInput;
  iconSize?: number;
  isActiveClosingHandoff?: boolean;
  isEffectiveSourceGhosted?: boolean;
  isOpeningSourceGhosted?: boolean;
  isInteractivePage?: boolean;
  isRawSourceGhosted?: boolean;
  isSearchMode?: boolean;
  shouldRetireStaleHandoff?: boolean;
}

interface FolderDropTarget {
  active: true;
  geometryVersion: string;
  hoverRect: FolderPresentationRect;
  hoverState: IconFolderHoverState | null;
  iconSize: number;
  padding: number;
  phase: string;
  releaseRect: FolderPresentationRect | null;
  targetId: string | null;
}

export interface ResolvedFolderPresentationState {
  acceptsDropHover: boolean;
  dropTarget: FolderDropTarget | null;
  dropTargetExit: { mode: "immediate"; targetId: string | null } | null;
  geometry: ResolvedFolderPresentationGeometry;
  handoff: {
    blocksHover: boolean;
    pinsLayout: boolean;
    retainsSourceVisibility: boolean;
    syncsNode: boolean;
  };
  isReleasedHandoff: boolean;
  isSourceGhosted: boolean;
  phase: "closingHandoffHidden" | "closingHandoffReleased" | "idle" | "sourceGhosted";
  sourceVisible: boolean;
}

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRect(rect: FolderPresentationRectInput | null | undefined): FolderPresentationRect | null {
  if (!rect) return null;
  const left = readNumber(rect.left, Number.NaN);
  const top = readNumber(rect.top, Number.NaN);
  const width = readNumber(rect.width, Number.NaN);
  const height = readNumber(rect.height, Number.NaN);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  return {
    bottom: top + Math.max(0, height),
    height: Math.max(0, height),
    left,
    right: left + Math.max(0, width),
    top,
    width: Math.max(0, width),
  };
}

function rectSignature(rect: FolderPresentationRectInput | null | undefined): string {
  const normalized = normalizeRect(rect);
  if (!normalized) return "none";
  return [
    normalized.left,
    normalized.top,
    normalized.width,
    normalized.height,
  ].map((value) => Math.round(value * 1000) / 1000).join(",");
}

function makeGeometryVersion(
  folderId: string | null,
  geometry: Omit<ResolvedFolderPresentationGeometry, "geometryVersion">
): string {
  return [
    folderId || "folder",
    rectSignature(geometry.hoverRect),
    rectSignature(geometry.releaseRect),
    rectSignature(geometry.hitRect),
  ].join(":");
}

function chooseFirstRect(
  ...rects: readonly (FolderPresentationRectInput | null | undefined)[]
): FolderPresentationRect | null {
  for (const rect of rects) {
    const normalized = normalizeRect(rect);
    if (normalized) return normalized;
  }
  return null;
}

function resolveGeometry(
  folderId: string | null,
  geometry: FolderPresentationGeometryInput = {}
): ResolvedFolderPresentationGeometry {
  const renderedRect = normalizeRect(geometry.renderedRect);
  const liveRect = normalizeRect(geometry.liveRect);
  const stableRect = normalizeRect(geometry.stableRect);
  const releaseRect = chooseFirstRect(geometry.releaseRect, stableRect, liveRect, renderedRect);
  const hoverRect = chooseFirstRect(geometry.hoverRect, renderedRect, liveRect, stableRect, releaseRect);
  const hitRect = chooseFirstRect(geometry.hitRect, liveRect, renderedRect, hoverRect, stableRect, releaseRect);
  const resolved = {
    hitRect,
    hoverRect,
    liveRect,
    releaseRect,
    renderedRect,
    stableRect,
  };
  return {
    ...resolved,
    geometryVersion: makeGeometryVersion(folderId, resolved),
  };
}

function isFolderHoverIntentFor(
  folderId: string | null,
  hoverState: IconFolderHoverState | null
): boolean {
  return hoverState?.targetId === folderId && hoverState.targetType === "folder";
}

export function resolveFolderPresentationState(
  options: FolderPresentationOptions = {}
): ResolvedFolderPresentationState {
  const {
    dragFolderHoverState = null,
    dragFolderTargetId = null,
    existingHandoffEntry = null,
    folderId = null,
    geometry: geometryInput = {},
    iconSize = 64,
    isActiveClosingHandoff = false,
    isEffectiveSourceGhosted = false,
    isOpeningSourceGhosted = false,
    isInteractivePage = true,
    isRawSourceGhosted = false,
    isSearchMode = false,
    shouldRetireStaleHandoff = false,
  } = options;

  const effectiveHandoffEntry = shouldRetireStaleHandoff ? null : existingHandoffEntry;
  const isReleasedHandoff = effectiveHandoffEntry?.visualReleased === true;
  const isReleasedClosingHandoff = Boolean(
    isReleasedHandoff &&
    !isOpeningSourceGhosted &&
    (isActiveClosingHandoff || isRawSourceGhosted || effectiveHandoffEntry?.cleanupFrame != null)
  );
  const hasHiddenHandoffEntry = Boolean(effectiveHandoffEntry && !isReleasedHandoff);
  const blocksHover = hasHiddenHandoffEntry || (isActiveClosingHandoff && !isReleasedHandoff);
  const retainsSourceVisibility = Boolean(
    isReleasedClosingHandoff &&
    (isEffectiveSourceGhosted || isRawSourceGhosted || effectiveHandoffEntry?.cleanupFrame != null)
  );
  const syncsNode = blocksHover;
  const pinsLayout = syncsNode || retainsSourceVisibility;
  const sourceVisible = !blocksHover && (!isEffectiveSourceGhosted || retainsSourceVisibility);
  const acceptsDropHover = Boolean(isInteractivePage && !isSearchMode && !blocksHover);
  const isSourceGhosted = Boolean(!sourceVisible && isEffectiveSourceGhosted);
  const geometry = resolveGeometry(folderId, geometryInput);
  const hasHoverIntent = acceptsDropHover && isFolderHoverIntentFor(folderId, dragFolderHoverState);
  const hasDropTargetIntent = acceptsDropHover && dragFolderTargetId === folderId;
  const padding = getFolderHoverTargetPadding(iconSize);
  const dropTargetExit: ResolvedFolderPresentationState["dropTargetExit"] = isOpeningSourceGhosted && isSourceGhosted
    ? { mode: "immediate", targetId: folderId }
    : null;
  const dropTarget: FolderDropTarget | null = !isSourceGhosted && (hasHoverIntent || hasDropTargetIntent) && geometry.hoverRect
    ? {
      active: true,
      geometryVersion: geometry.geometryVersion,
      hoverRect: geometry.hoverRect,
      hoverState: hasHoverIntent ? dragFolderHoverState : null,
      iconSize,
      padding,
      phase: dragFolderHoverState?.phase || "hover",
      releaseRect: geometry.releaseRect,
      targetId: folderId,
    }
    : null;

  let phase: ResolvedFolderPresentationState["phase"] = "idle";
  if (blocksHover) phase = "closingHandoffHidden";
  else if (isSourceGhosted) phase = "sourceGhosted";
  else if (isReleasedClosingHandoff) phase = "closingHandoffReleased";

  return {
    acceptsDropHover,
    dropTarget,
    dropTargetExit,
    geometry,
    handoff: {
      blocksHover,
      pinsLayout,
      retainsSourceVisibility,
      syncsNode,
    },
    isReleasedHandoff,
    isSourceGhosted,
    phase,
    sourceVisible,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
