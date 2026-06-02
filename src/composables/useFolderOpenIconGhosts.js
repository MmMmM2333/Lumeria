import { computed, nextTick, shallowRef } from "vue";

const FOLDER_OPEN_PREVIEW_COLUMNS = 3;
const FOLDER_OPEN_PREVIEW_ROW_STAGGER = 22;
const FOLDER_OPEN_PREVIEW_COL_STAGGER = 10;
const FOLDER_OPEN_EXTRA_BASE_DELAY = 78;
const FOLDER_OPEN_EXTRA_STAGGER = 7;
const FOLDER_OPEN_EXTRA_MAX_DELAY = 180;
const FOLDER_OPEN_ICON_GHOST_DURATION = 0.36;
const FOLDER_CLOSE_ICON_GHOST_DURATION = 0.34;
const FOLDER_OPEN_ICON_GHOST_EASE = [0.22, 1, 0.36, 1];
const FOLDER_CLOSE_ICON_GHOST_EASE = [0.4, 0, 0.2, 1];
const FOLDER_OPEN_SOURCE_GAP_RATIO = 3 / 14;

function makeFolderOpenIconGhostedKey(folderId, childId) {
  return `${folderId}::${childId}`;
}

export function getFolderOpenPreviewIconDelay(slotIndex) {
  const safeIndex = Math.max(0, Number(slotIndex) || 0);
  const row = Math.floor(safeIndex / FOLDER_OPEN_PREVIEW_COLUMNS);
  const col = safeIndex % FOLDER_OPEN_PREVIEW_COLUMNS;
  return row * FOLDER_OPEN_PREVIEW_ROW_STAGGER + col * FOLDER_OPEN_PREVIEW_COL_STAGGER;
}

export function getFolderOpenExtraIconDelay(index) {
  const safeIndex = Math.max(0, Number(index) || 0);
  if (safeIndex < FOLDER_OPEN_PREVIEW_COLUMNS * FOLDER_OPEN_PREVIEW_COLUMNS) {
    return getFolderOpenPreviewIconDelay(safeIndex);
  }
  return Math.min(FOLDER_OPEN_EXTRA_MAX_DELAY, FOLDER_OPEN_EXTRA_BASE_DELAY + (safeIndex - 9) * FOLDER_OPEN_EXTRA_STAGGER);
}

function escapeAttributeValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function makeFolderPreviewChildSelector(folderId, childId) {
  if (!folderId || !childId) return null;
  return `.folder-child[data-folder-preview-folder-id="${escapeAttributeValue(folderId)}"][data-folder-preview-child-id="${escapeAttributeValue(childId)}"]`;
}

export function makeFolderPreviewChildVisualSelector(folderId, childId) {
  const childSelector = makeFolderPreviewChildSelector(folderId, childId);
  return childSelector ? `${childSelector} .folder-child-visual` : null;
}

export function makeFolderGridFrameSelector(folderId, childId) {
  if (!folderId || !childId) return null;
  return `.icon-selection-frame[data-folder-open-folder-id="${escapeAttributeValue(folderId)}"][data-folder-open-child-id="${escapeAttributeValue(childId)}"]`;
}

export function makeFolderGridChildSelector(folderId, childId) {
  if (!folderId || !childId) return null;
  return `.icon-hit-target[data-launch-area="folder"][data-launch-folder-id="${escapeAttributeValue(folderId)}"][data-launch-item-id="${escapeAttributeValue(childId)}"] .icon-box`;
}

function requestAnimationFrameOnce(callback) {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    callback();
    return;
  }
  window.requestAnimationFrame(callback);
}

function requestAnimationFrameTwice(callback) {
  requestAnimationFrameOnce(() => requestAnimationFrameOnce(callback));
}

function cloneRect(rect) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function cloneItemStyleMetrics(node) {
  const getComputedStyle = typeof window !== "undefined" ? window.getComputedStyle : null;
  const style = node && typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
  const labelStyle = node && typeof getComputedStyle === "function" ? getComputedStyle(node.querySelector?.(".icon-name")) : null;
  const numberValue = (propertyName, fallback) => {
    const value = Number.parseFloat(style?.[propertyName]);
    return Number.isFinite(value) ? value : fallback;
  };
  const labelNumberValue = (propertyName, fallback) => {
    const value = Number.parseFloat(labelStyle?.[propertyName]);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    framePaddingX: numberValue("paddingLeft", 12),
    framePaddingY: numberValue("paddingTop", 10),
    iconNameFontSize: labelNumberValue("fontSize", 13),
    iconNameLineClamp: Number.parseInt(labelStyle?.webkitLineClamp, 10) || 2,
    iconNameMarginTop: labelNumberValue("marginTop", 8),
    iconNamePaddingX: labelNumberValue("paddingLeft", 8),
    iconNamePaddingY: labelNumberValue("paddingTop", 2),
  };
}

function getRectBounds(rects) {
  const validRects = (rects || []).map(cloneRect).filter(Boolean);
  if (!validRects.length) return null;

  const left = Math.min(...validRects.map((rect) => rect.left));
  const top = Math.min(...validRects.map((rect) => rect.top));
  const right = Math.max(...validRects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...validRects.map((rect) => rect.top + rect.height));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function getNodeRect(node) {
  return cloneRect(node?.getBoundingClientRect?.());
}

function parseTransformOrigin(value, width, height) {
  const parts = String(value || "").trim().split(/\s+/);
  const parseToken = (token, size, fallback) => {
    if (!token) return fallback;
    if (token.endsWith("%")) {
      const percent = Number.parseFloat(token);
      return Number.isFinite(percent) ? (percent / 100) * size : fallback;
    }
    const px = Number.parseFloat(token);
    return Number.isFinite(px) ? px : fallback;
  };
  return {
    x: parseToken(parts[0], width, width / 2),
    y: parseToken(parts[1], height, height / 2),
  };
}

function parseCssTransformMatrix(value) {
  const transform = String(value || "").trim();
  if (!transform || transform === "none") return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  const matrix3dMatch = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3dMatch) {
    const values = matrix3dMatch[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (values.length === 16 && values.every(Number.isFinite)) {
      return { a: values[0], b: values[1], c: values[4], d: values[5], e: values[12], f: values[13] };
    }
  }

  const matrixMatch = transform.match(/^matrix\((.+)\)$/);
  if (matrixMatch) {
    const values = matrixMatch[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (values.length === 6 && values.every(Number.isFinite)) {
      return { a: values[0], b: values[1], c: values[2], d: values[3], e: values[4], f: values[5] };
    }
  }

  return null;
}

function isIdentityMatrix(matrix) {
  return matrix &&
    Math.abs(matrix.a - 1) < 0.0001 &&
    Math.abs(matrix.b) < 0.0001 &&
    Math.abs(matrix.c) < 0.0001 &&
    Math.abs(matrix.d - 1) < 0.0001 &&
    Math.abs(matrix.e) < 0.0001 &&
    Math.abs(matrix.f) < 0.0001;
}

function makeRestingViewportRectMapper(element) {
  const transformedElementRect = getNodeRect(element);
  const getComputedStyle = typeof window !== "undefined" ? window.getComputedStyle : null;
  const style = element && typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  const matrix = parseCssTransformMatrix(style?.transform);
  if (!transformedElementRect || !matrix || isIdentityMatrix(matrix)) return cloneRect;

  const width = Number(element?.offsetWidth || 0) || transformedElementRect.width;
  const height = Number(element?.offsetHeight || 0) || transformedElementRect.height;
  const origin = parseTransformOrigin(style?.transformOrigin, width, height);
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 0.0001) return cloneRect;

  const layoutLeft = transformedElementRect.left - origin.x * (1 - matrix.a) - matrix.e;
  const layoutTop = transformedElementRect.top - origin.y * (1 - matrix.d) - matrix.f;

  function unmapPoint(x, y) {
    const targetX = x - layoutLeft - origin.x - matrix.e;
    const targetY = y - layoutTop - origin.y - matrix.f;
    const localX = origin.x + (matrix.d * targetX - matrix.c * targetY) / determinant;
    const localY = origin.y + (-matrix.b * targetX + matrix.a * targetY) / determinant;
    return {
      x: layoutLeft + localX,
      y: layoutTop + localY,
    };
  }

  return (rect) => {
    const source = cloneRect(rect);
    if (!source) return null;
    const points = [
      unmapPoint(source.left, source.top),
      unmapPoint(source.left + source.width, source.top),
      unmapPoint(source.left, source.top + source.height),
      unmapPoint(source.left + source.width, source.top + source.height),
    ];
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  };
}

function makeLocalRectMapper(element) {
  const viewportRect = getNodeRect(element);
  const localWidth = Number(element?.offsetWidth || 0);
  const localHeight = Number(element?.offsetHeight || 0);
  if (!viewportRect || viewportRect.width <= 0 || viewportRect.height <= 0 || localWidth <= 0 || localHeight <= 0) return null;

  const scaleX = localWidth / viewportRect.width;
  const scaleY = localHeight / viewportRect.height;
  return (rect) => {
    if (!rect) return null;
    return {
      left: (rect.left - viewportRect.left) * scaleX,
      top: (rect.top - viewportRect.top) * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    };
  };
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function countDistinctRectStarts(rects, axis, tolerance) {
  const starts = (rects || [])
    .map((rect) => rect?.[axis])
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!starts.length) return 0;

  let count = 1;
  let previous = starts[0];
  for (let index = 1; index < starts.length; index += 1) {
    if (Math.abs(starts[index] - previous) <= tolerance) continue;
    count += 1;
    previous = starts[index];
  }
  return count;
}

function getSourcePreviewMetrics(sourceBounds, previewRects) {
  const validRects = (previewRects || []).map(cloneRect).filter(Boolean);
  const source = cloneRect(sourceBounds);
  const width = median(validRects.map((rect) => rect.width)) || source?.width || 1;
  const height = median(validRects.map((rect) => rect.height)) || source?.height || 1;
  const columnCount = countDistinctRectStarts(validRects, "left", Math.max(1, width * 0.25));
  const rowCount = countDistinctRectStarts(validRects, "top", Math.max(1, height * 0.25));
  const gapRatios = [];

  if (source && columnCount > 1) {
    const gap = (source.width - columnCount * width) / (columnCount - 1);
    if (Number.isFinite(gap) && gap > 0) gapRatios.push(gap / width);
  }
  if (source && rowCount > 1) {
    const gap = (source.height - rowCount * height) / (rowCount - 1);
    if (Number.isFinite(gap) && gap > 0) gapRatios.push(gap / height);
  }

  return {
    gapRatio: gapRatios.length ? gapRatios.reduce((sum, value) => sum + value, 0) / gapRatios.length : FOLDER_OPEN_SOURCE_GAP_RATIO,
    height,
    width,
  };
}

export function projectTargetGridSlotIntoSourceBounds(sourceBounds, slotIndex, columnCount, rowCount, sourceMetrics) {
  const source = cloneRect(sourceBounds);
  if (!source) return null;

  const columns = Math.max(1, Math.floor(Number(columnCount) || 1));
  const rows = Math.max(1, Math.floor(Number(rowCount) || 1));
  const safeIndex = Math.max(0, Math.floor(Number(slotIndex) || 0));
  const col = Math.min(columns - 1, safeIndex % columns);
  const row = Math.min(rows - 1, Math.floor(safeIndex / columns));
  const preferredWidth = Math.max(1, Number(sourceMetrics?.width) || source.width / columns);
  const preferredHeight = Math.max(1, Number(sourceMetrics?.height) || source.height / rows);
  const gapRatio = Math.max(0, Number(sourceMetrics?.gapRatio) || FOLDER_OPEN_SOURCE_GAP_RATIO);
  const maxWidth = source.width / (columns + Math.max(0, columns - 1) * gapRatio);
  const maxHeight = source.height / (rows + Math.max(0, rows - 1) * gapRatio);
  const scale = Math.min(1, maxWidth / preferredWidth, maxHeight / preferredHeight);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const width = preferredWidth * scale;
  const height = preferredHeight * scale;
  const cellWidth = source.width / columns;
  const cellHeight = source.height / rows;
  return {
    left: source.left + col * cellWidth + (cellWidth - width) / 2,
    top: source.top + row * cellHeight + (cellHeight - height) / 2,
    width,
    height,
  };
}

function getGridTrackCount(node, propertyName) {
  const grid = node?.closest?.(".folder-grid");
  const getComputedStyle = typeof window !== "undefined" ? window.getComputedStyle : null;
  const template = grid && typeof getComputedStyle === "function" ? getComputedStyle(grid)?.[propertyName] : "";
  const tracks = String(template || "").trim().split(/\s+/).filter((track) => track && track !== "none");
  return tracks.length || 0;
}

function inferTargetColumnCount(ghosts) {
  const sortedGhosts = [...(ghosts || [])].sort((a, b) => a.slotIndex - b.slotIndex);
  const measuredColumnCount = sortedGhosts.find((ghost) => ghost.targetGridColumnCount > 0)?.targetGridColumnCount;
  if (measuredColumnCount > 0) return measuredColumnCount;

  const firstIcon = sortedGhosts[0]?.toIcon;
  if (!firstIcon) return FOLDER_OPEN_PREVIEW_COLUMNS;

  const rowTolerance = Math.max(1, firstIcon.height * 0.25);
  for (let index = 1; index < sortedGhosts.length; index += 1) {
    if (Math.abs(sortedGhosts[index].toIcon.top - firstIcon.top) > rowTolerance) {
      return Math.max(1, index);
    }
  }
  return Math.max(1, sortedGhosts.length);
}

function inferTargetRowCount(ghosts, columnCount) {
  const measuredRowCount = (ghosts || []).find((ghost) => ghost.targetGridRowCount > 0)?.targetGridRowCount;
  if (measuredRowCount > 0) return measuredRowCount;
  const safeColumnCount = Math.max(1, Number(columnCount) || FOLDER_OPEN_PREVIEW_COLUMNS);
  const maxSlotIndex = (ghosts || []).reduce((maxIndex, ghost) => Math.max(maxIndex, Number(ghost?.slotIndex) || 0), 0);
  return Math.max(1, Math.floor(maxSlotIndex / safeColumnCount) + 1);
}

function inferSourceColumnCount(ghosts) {
  const sortedGhosts = [...(ghosts || [])].sort((a, b) => a.slotIndex - b.slotIndex);
  const measuredColumnCount = sortedGhosts.find((ghost) => ghost.sourceGridColumnCount > 0)?.sourceGridColumnCount;
  if (measuredColumnCount > 0) return measuredColumnCount;

  const firstIcon = sortedGhosts[0]?.fromIcon;
  if (!firstIcon) return FOLDER_OPEN_PREVIEW_COLUMNS;

  const rowTolerance = Math.max(1, firstIcon.height * 0.25);
  for (let index = 1; index < sortedGhosts.length; index += 1) {
    if (Math.abs(sortedGhosts[index].fromIcon.top - firstIcon.top) > rowTolerance) {
      return Math.max(1, index);
    }
  }
  return Math.max(1, sortedGhosts.length);
}

function inferSourceRowCount(ghosts, columnCount) {
  const measuredRowCount = (ghosts || []).find((ghost) => ghost.sourceGridRowCount > 0)?.sourceGridRowCount;
  if (measuredRowCount > 0) return measuredRowCount;
  const safeColumnCount = Math.max(1, Number(columnCount) || FOLDER_OPEN_PREVIEW_COLUMNS);
  const maxSlotIndex = (ghosts || []).reduce((maxIndex, ghost) => Math.max(maxIndex, Number(ghost?.slotIndex) || 0), 0);
  return Math.max(1, Math.floor(maxSlotIndex / safeColumnCount) + 1);
}

function getFolderOpenIconDelay(ghost) {
  const columnCount = Math.max(1, Number(ghost?.targetColumnCount) || Number(ghost?.sourceColumnCount) || FOLDER_OPEN_PREVIEW_COLUMNS);
  const safeIndex = Math.max(0, Number(ghost?.slotIndex) || 0);
  const row = Math.floor(safeIndex / columnCount);
  const col = safeIndex % columnCount;
  return Math.min(FOLDER_OPEN_EXTRA_MAX_DELAY, row * FOLDER_OPEN_PREVIEW_ROW_STAGGER + col * FOLDER_OPEN_PREVIEW_COL_STAGGER);
}

function makeOpeningChildren(folder, children, options) {
  const sourceChildren = Array.isArray(children) && children.length ? children : optionsSafeFolderPreviewSlots(folder, options).filter(Boolean);
  const result = [];
  const seenIds = new Set();
  for (const child of sourceChildren) {
    if (!child?.id || seenIds.has(child.id)) continue;
    seenIds.add(child.id);
    result.push(child);
  }
  return result;
}

function optionsSafeFolderPreviewSlots(folder, options) {
  if (!folder || !options || typeof options.folderPreviewSlots !== "function") return [];
  return options.folderPreviewSlots(folder) || [];
}

export function useFolderOpenIconGhosts(options) {
  const folderOpenIconGhosts = shallowRef([]);
  const folderOpenIconGhostedKeys = shallowRef(new Set());
  const folderCloseIconGhosts = shallowRef([]);
  const folderCloseIconGhostedKeys = shallowRef(new Set());
  const isFolderOpenIconAnimationActive = computed(() => folderOpenIconGhostedKeys.value.size > 0);
  const isFolderCloseIconAnimationActive = computed(() => folderCloseIconGhostedKeys.value.size > 0);
  const completedFolderOpenIconGhostKeys = new Set();
  const completedFolderCloseIconGhostKeys = new Set();
  let folderOpenIconGhostRequestId = 0;
  let folderCloseIconGhostRequestId = 0;

  function clearFolderOpenIconGhosts() {
    folderOpenIconGhostRequestId += 1;
    completedFolderOpenIconGhostKeys.clear();
    folderOpenIconGhosts.value = [];
    folderOpenIconGhostedKeys.value = new Set();
  }

  function clearFolderCloseIconGhosts() {
    folderCloseIconGhostRequestId += 1;
    completedFolderCloseIconGhostKeys.clear();
    folderCloseIconGhosts.value = [];
    folderCloseIconGhostedKeys.value = new Set();
  }

  function getFolderOpenIconGhostStyle(ghost) {
    return {
      left: `${ghost.to.left}px`,
      top: `${ghost.to.top}px`,
      width: `${ghost.to.width}px`,
      height: `${ghost.to.height}px`,
      "--folder-open-label-delay": `${getFolderOpenIconDelay(ghost) + 120}ms`,
    };
  }

  function getFolderOpenIconGhostInitial(ghost) {
    const iconOffsetX = ghost.toIcon.left - ghost.to.left;
    const iconOffsetY = ghost.toIcon.top - ghost.to.top;
    const scaleX = ghost.from.width / ghost.toIcon.width;
    const scaleY = ghost.from.height / ghost.toIcon.height;

    return {
      opacity: ghost.synthetic ? 0 : 1,
      x: ghost.from.left - ghost.to.left - iconOffsetX * scaleX,
      y: ghost.from.top - ghost.to.top - iconOffsetY * scaleY,
      scaleX,
      scaleY,
    };
  }

  function getFolderOpenIconGhostAnimate() {
    return { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 };
  }

  function getFolderOpenIconGhostTransition(ghost) {
    return {
      delay: getFolderOpenIconDelay(ghost) / 1000,
      duration: FOLDER_OPEN_ICON_GHOST_DURATION,
      ease: FOLDER_OPEN_ICON_GHOST_EASE,
    };
  }

  function getFolderCloseIconGhostStyle(ghost) {
    const metrics = ghost.styleMetrics || {};
    return {
      left: `${ghost.from.left}px`,
      top: `${ghost.from.top}px`,
      width: `${ghost.from.width}px`,
      height: `${ghost.from.height}px`,
      "--app-icon-size": `${ghost.fromIcon.width}px`,
      "--app-icon-image-size": `${ghost.fromIcon.width}px`,
      "--app-icon-emoji-size": `${ghost.fromIcon.width}px`,
      "--folder-icon-name-font-size": `${metrics.iconNameFontSize || 13}px`,
      "--folder-icon-name-line-clamp": metrics.iconNameLineClamp || 2,
      "--folder-icon-name-margin-top": `${metrics.iconNameMarginTop ?? 8}px`,
      "--folder-icon-name-padding-x": `${metrics.iconNamePaddingX ?? 8}px`,
      "--folder-icon-name-padding-y": `${metrics.iconNamePaddingY ?? 2}px`,
      "--folder-selection-frame-padding-x": `${metrics.framePaddingX ?? 12}px`,
      "--folder-selection-frame-padding-y": `${metrics.framePaddingY ?? 10}px`,
    };
  }

  function getFolderCloseIconGhostInitial() {
    return { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 };
  }

  function getFolderCloseIconGhostAnimate(ghost) {
    const iconOffsetX = ghost.fromIcon.left - ghost.from.left;
    const iconOffsetY = ghost.fromIcon.top - ghost.from.top;
    const scaleX = ghost.to.width / ghost.fromIcon.width;
    const scaleY = ghost.to.height / ghost.fromIcon.height;

    return {
      opacity: 0,
      x: ghost.to.left - ghost.from.left - iconOffsetX * scaleX,
      y: ghost.to.top - ghost.from.top - iconOffsetY * scaleY,
      scaleX,
      scaleY,
    };
  }

  function getFolderCloseIconGhostTransition(ghost) {
    return {
      delay: getFolderOpenIconDelay(ghost) / 1000,
      duration: FOLDER_CLOSE_ICON_GHOST_DURATION,
      ease: FOLDER_CLOSE_ICON_GHOST_EASE,
    };
  }

  function completeFolderOpenIconGhost(key) {
    const ghost = folderOpenIconGhosts.value.find((candidate) => candidate.key === key);
    if (!ghost || ghost.requestId !== folderOpenIconGhostRequestId) return;

    completedFolderOpenIconGhostKeys.add(key);
    if (completedFolderOpenIconGhostKeys.size < folderOpenIconGhosts.value.length) return;

    completedFolderOpenIconGhostKeys.clear();
    folderOpenIconGhosts.value = [];
    folderOpenIconGhostedKeys.value = new Set();
  }

  function completeFolderCloseIconGhost(key) {
    const ghost = folderCloseIconGhosts.value.find((candidate) => candidate.key === key);
    if (!ghost || ghost.requestId !== folderCloseIconGhostRequestId) return;

    completedFolderCloseIconGhostKeys.add(key);
    if (completedFolderCloseIconGhostKeys.size < folderCloseIconGhosts.value.length) return;

    completedFolderCloseIconGhostKeys.clear();
    folderCloseIconGhosts.value = [];
    folderCloseIconGhostedKeys.value = new Set();
  }

  function captureFolderPreviewIconGhosts(folder, openingChildren) {
    if (!folder?.id || typeof document === "undefined") return [];
    const previewGhosts = optionsSafeFolderPreviewSlots(folder, options)
      .map((child, previewSlotIndex) => {
        if (!child?.id) return null;
        const selector = makeFolderPreviewChildVisualSelector(folder.id, child.id);
        const from = getNodeRect(selector ? document.querySelector(selector) : null);
        if (!from) return null;
        return {
          folderId: folder.id,
          from,
          item: options.cloneItem(child),
          previewSlotIndex,
        };
      })
      .filter(Boolean);
    const sourceBounds = getRectBounds(previewGhosts.map((ghost) => ghost.from));
    if (!sourceBounds) return [];

    const previewGhostById = new Map(previewGhosts.map((ghost) => [ghost.item.id, ghost]));
    return makeOpeningChildren(folder, openingChildren, options)
      .map((child, slotIndex) => {
        if (!child?.id) return null;
        const previewGhost = previewGhostById.get(child.id);
        return {
          folderId: folder.id,
          from: previewGhost?.from || null,
          item: options.cloneItem(child),
          previewSlotIndex: previewGhost?.previewSlotIndex ?? null,
          slotIndex,
          sourceBounds,
          synthetic: !previewGhost,
        };
      })
      .filter(Boolean);
  }

  function captureFolderCloseIconGhosts(folder, closingChildren) {
    if (!folder?.id || typeof document === "undefined") return [];
    const previewSlotById = new Map(
      optionsSafeFolderPreviewSlots(folder, options)
        .map((child, previewSlotIndex) => (child?.id ? [child.id, previewSlotIndex] : null))
        .filter(Boolean)
    );
    const targetRectMapper = makeRestingViewportRectMapper(document.querySelector(".launchpad-shell"));
    const previewTargets = optionsSafeFolderPreviewSlots(folder, options)
      .map((child, previewSlotIndex) => {
        if (!child?.id) return null;
        const selector = makeFolderPreviewChildVisualSelector(folder.id, child.id);
        const to = targetRectMapper(getNodeRect(selector ? document.querySelector(selector) : null));
        if (!to) return null;
        return {
          childId: child.id,
          previewSlotIndex,
          to,
        };
      })
      .filter(Boolean);
    const targetBounds = getRectBounds(previewTargets.map((target) => target.to));
    if (!targetBounds) return [];

    const previewTargetById = new Map(previewTargets.map((target) => [target.childId, target]));
    const measuredGhosts = makeOpeningChildren(folder, closingChildren, options)
      .map((child, slotIndex) => {
        if (!child?.id) return null;
        const frameSelector = makeFolderGridFrameSelector(folder.id, child.id);
        const iconSelector = makeFolderGridChildSelector(folder.id, child.id);
        const frameNode = frameSelector ? document.querySelector(frameSelector) : null;
        const iconBoxNode = iconSelector ? document.querySelector(iconSelector) : null;
        const from = getNodeRect(frameNode);
        const fromIcon = getNodeRect(iconBoxNode);
        if (!from || !fromIcon) return null;
        const previewTarget = previewTargetById.get(child.id);
        return {
          folderId: folder.id,
          from,
          fromIcon,
          item: options.cloneItem(child),
          previewSlotIndex: previewSlotById.get(child.id) ?? null,
          previewTo: previewTarget?.to || null,
          slotIndex,
          sourceGridColumnCount: getGridTrackCount(frameNode, "gridTemplateColumns"),
          sourceGridRowCount: getGridTrackCount(frameNode, "gridTemplateRows"),
          styleMetrics: cloneItemStyleMetrics(frameNode),
          synthetic: !previewTarget,
        };
      })
      .filter(Boolean);

    const sourceColumnCount = inferSourceColumnCount(measuredGhosts);
    const sourceRowCount = inferSourceRowCount(measuredGhosts, sourceColumnCount);
    const targetMetrics = getSourcePreviewMetrics(targetBounds, previewTargets.map((target) => target.to));
    return measuredGhosts
      .map((ghost) => {
        const to = sourceColumnCount === FOLDER_OPEN_PREVIEW_COLUMNS && !ghost.synthetic && ghost.previewTo
          ? ghost.previewTo
          : projectTargetGridSlotIntoSourceBounds(targetBounds, ghost.slotIndex, sourceColumnCount, sourceRowCount, targetMetrics) || ghost.previewTo;
        if (!to) return null;
        return {
          ...ghost,
          key: `${folder.id}-${ghost.item.id}-${ghost.slotIndex}-close-${folderCloseIconGhostRequestId + 1}`,
          sourceColumnCount,
          sourceRowCount,
          to,
        };
      })
      .filter(Boolean);
  }

  function playFolderOpenIconGhosts(folderId, capturedGhosts) {
    if (!folderId || !capturedGhosts?.length || typeof document === "undefined") return;
    const requestId = (folderOpenIconGhostRequestId += 1);
    completedFolderOpenIconGhostKeys.clear();
    folderOpenIconGhosts.value = [];
    folderOpenIconGhostedKeys.value = new Set(capturedGhosts.map((ghost) => makeFolderOpenIconGhostedKey(folderId, ghost.item.id)));

    nextTick(() => {
      if (requestId !== folderOpenIconGhostRequestId) return;
      requestAnimationFrameTwice(() => {
        if (requestId !== folderOpenIconGhostRequestId) return;
        const toLocalRect = makeLocalRectMapper(document.querySelector(".folder-panel-content"));
        const measuredGhosts = toLocalRect
          ? capturedGhosts
              .map((ghost) => {
                const frameSelector = makeFolderGridFrameSelector(folderId, ghost.item.id);
                const iconSelector = makeFolderGridChildSelector(folderId, ghost.item.id);
                const frameNode = frameSelector ? document.querySelector(frameSelector) : null;
                const iconBoxNode = iconSelector ? document.querySelector(iconSelector) : null;
                const previewFrom = toLocalRect(ghost.from);
                const sourceBounds = toLocalRect(ghost.sourceBounds);
                const to = toLocalRect(getNodeRect(frameNode));
                const toIcon = toLocalRect(getNodeRect(iconBoxNode));
                if ((!previewFrom && !sourceBounds) || !to || !toIcon) return null;
                return {
                  ...ghost,
                  previewFrom,
                  sourceBounds,
                  targetGridColumnCount: getGridTrackCount(frameNode, "gridTemplateColumns"),
                  targetGridRowCount: getGridTrackCount(frameNode, "gridTemplateRows"),
                  key: `${folderId}-${ghost.item.id}-${ghost.slotIndex}-${requestId}`,
                  requestId,
                  to,
                  toIcon,
                };
              })
              .filter(Boolean)
          : [];

        const sourceBounds = getRectBounds(measuredGhosts.map((ghost) => ghost.sourceBounds || ghost.previewFrom));
        const sourceMetrics = getSourcePreviewMetrics(sourceBounds, measuredGhosts.map((ghost) => ghost.previewFrom));
        const targetColumnCount = inferTargetColumnCount(measuredGhosts);
        const targetRowCount = inferTargetRowCount(measuredGhosts, targetColumnCount);
        const ghosts = measuredGhosts
          .map((ghost) => {
            const from = targetColumnCount === FOLDER_OPEN_PREVIEW_COLUMNS && !ghost.synthetic && ghost.previewFrom
              ? ghost.previewFrom
              : projectTargetGridSlotIntoSourceBounds(sourceBounds, ghost.slotIndex, targetColumnCount, targetRowCount, sourceMetrics) || ghost.previewFrom;
            if (!from) return null;
            return {
              ...ghost,
              from,
              targetColumnCount,
              targetRowCount,
            };
          })
          .filter(Boolean);

        if (!ghosts.length) {
          clearFolderOpenIconGhosts();
          return;
        }
        folderOpenIconGhostedKeys.value = new Set(ghosts.map((ghost) => makeFolderOpenIconGhostedKey(folderId, ghost.item.id)));
        folderOpenIconGhosts.value = ghosts;
      });
    });
  }

  function playFolderCloseIconGhosts(folderId, capturedGhosts) {
    if (!folderId || !capturedGhosts?.length) {
      clearFolderCloseIconGhosts();
      return;
    }
    const requestId = (folderCloseIconGhostRequestId += 1);
    completedFolderCloseIconGhostKeys.clear();
    const ghosts = capturedGhosts.map((ghost) => ({
      ...ghost,
      key: `${folderId}-${ghost.item.id}-${ghost.slotIndex}-close-${requestId}`,
      requestId,
    }));
    folderCloseIconGhostedKeys.value = new Set(ghosts.map((ghost) => makeFolderOpenIconGhostedKey(folderId, ghost.item.id)));
    folderCloseIconGhosts.value = ghosts;
  }

  function isFolderOpeningIconGhosted(folderId, childId) {
    return folderOpenIconGhostedKeys.value.has(makeFolderOpenIconGhostedKey(folderId, childId));
  }

  function isFolderClosingIconGhosted(folderId, childId) {
    return folderCloseIconGhostedKeys.value.has(makeFolderOpenIconGhostedKey(folderId, childId));
  }

  return {
    captureFolderCloseIconGhosts,
    captureFolderPreviewIconGhosts,
    clearFolderCloseIconGhosts,
    clearFolderOpenIconGhosts,
    completeFolderCloseIconGhost,
    completeFolderOpenIconGhost,
    folderCloseIconGhosts,
    folderOpenIconGhosts,
    getFolderOpenExtraIconDelay,
    getFolderCloseIconGhostAnimate,
    getFolderCloseIconGhostInitial,
    getFolderCloseIconGhostStyle,
    getFolderCloseIconGhostTransition,
    getFolderOpenIconGhostAnimate,
    getFolderOpenIconGhostInitial,
    getFolderOpenIconGhostStyle,
    getFolderOpenIconGhostTransition,
    isFolderCloseIconAnimationActive,
    isFolderOpenIconAnimationActive,
    isFolderClosingIconGhosted,
    isFolderOpeningIconGhosted,
    playFolderCloseIconGhosts,
    playFolderOpenIconGhosts,
  };
}
