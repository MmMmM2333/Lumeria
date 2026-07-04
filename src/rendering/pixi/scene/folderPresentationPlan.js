import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getFolderHoverTargetPadding } from "../nodes/iconFolderHoverState.js";

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRect(rect) {
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

function rectSignature(rect) {
  const normalized = normalizeRect(rect);
  if (!normalized) return "none";
  return [
    normalized.left,
    normalized.top,
    normalized.width,
    normalized.height,
  ].map((value) => Math.round(value * 1000) / 1000).join(",");
}

function makeGeometryVersion(folderId, geometry) {
  return [
    folderId || "folder",
    rectSignature(geometry.hoverRect),
    rectSignature(geometry.releaseRect),
    rectSignature(geometry.hitRect),
  ].join(":");
}

function chooseFirstRect(...rects) {
  for (const rect of rects) {
    const normalized = normalizeRect(rect);
    if (normalized) return normalized;
  }
  return null;
}

function resolveGeometry(folderId, geometry = {}) {
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

function isFolderHoverIntentFor(folderId, hoverState) {
  return hoverState?.targetId === folderId && hoverState.targetType === "folder";
}

export function resolveFolderPresentationState(options = {}) {
  const {
    dragFolderHoverState = null,
    dragFolderTargetId = null,
    existingHandoffEntry = null,
    folderId = null,
    geometry: geometryInput = {},
    iconSize = 64,
    isActiveClosingHandoff = false,
    isEffectiveSourceGhosted = false,
    isInteractivePage = true,
    isRawSourceGhosted = false,
    isSearchMode = false,
    shouldRetireStaleHandoff = false,
  } = options;

  const effectiveHandoffEntry = shouldRetireStaleHandoff ? null : existingHandoffEntry;
  const isReleasedHandoff = effectiveHandoffEntry?.visualReleased === true;
  const hasHiddenHandoffEntry = Boolean(effectiveHandoffEntry && !isReleasedHandoff);
  const blocksHover = hasHiddenHandoffEntry || (isActiveClosingHandoff && !isReleasedHandoff);
  const retainsSourceVisibility = Boolean(
    isReleasedHandoff &&
    (
      isActiveClosingHandoff ||
      isRawSourceGhosted ||
      effectiveHandoffEntry?.cleanupFrame != null
    )
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
  const dropTarget = (hasHoverIntent || hasDropTargetIntent) && geometry.hoverRect
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

  let phase = "idle";
  if (blocksHover) phase = "closingHandoffHidden";
  else if (isReleasedHandoff) phase = "closingHandoffReleased";
  else if (isSourceGhosted) phase = "sourceGhosted";

  return {
    acceptsDropHover,
    dropTarget,
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
