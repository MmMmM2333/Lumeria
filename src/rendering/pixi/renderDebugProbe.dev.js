import { getPixiIconTextureSource } from "../../domain/iconSource.js";
import {
  hashDebugBytes as hashBytes,
  hashDebugSample as hashSample,
  makeDebugSourceSnapshot,
} from "./renderDebugFingerprint.js";
import { getFolderPreviewMaskRect } from "./nodes/folderThumbDrawing.js";
import { getFolderPreviewMotionPlan } from "./nodes/folderThumbPreviewMotion.js";
import { getFolderThumbMetrics } from "./nodes/folderThumbMetrics.js";
import {
  beginPixiBatchBindingCapture,
  summarizePixiBatchBindingCapture,
} from "./pixiBatchBindingProbe.dev.js";

const REPORT_VERSION = 1;
const DEFAULT_MAX_EVENTS = 240;
const DEFAULT_MAX_SESSIONS = 4;
const MAX_PLAN_KEYS = 24;

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(readNumber(value) * scale) / scale;
}

function safeRead(getter, fallback = null, errors = null, label = "value") {
  try {
    const value = getter();
    return value ?? fallback;
  } catch (error) {
    errors?.push({
      error: String(error?.message || error || "Unknown debug read error"),
      label,
    });
    return fallback;
  }
}

function clampInteger(value, fallback, min, max) {
  const number = Math.floor(readNumber(value, fallback));
  return Math.max(min, Math.min(max, number));
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function pushLimited(list, value, limit) {
  list.push(value);
  const overflow = list.length - Math.max(1, limit);
  if (overflow > 0) list.splice(0, overflow);
}

function summarizeItem(item) {
  if (!item || typeof item !== "object") return null;
  return {
    id: item.id || null,
    name: item.name || item.title || null,
    type: item.type || null,
  };
}

function summarizeSource(source) {
  if (!source || typeof source !== "object") return null;
  return {
    folderId: source.folderId || null,
    index: source.index ?? null,
    pageIndex: source.pageIndex ?? null,
    type: source.type || null,
  };
}

function summarizeDragMeta(dragMeta) {
  if (!dragMeta?.item?.id) return null;
  return {
    item: summarizeItem(dragMeta.item),
    source: summarizeSource(dragMeta.source),
  };
}

function makeSourceSnapshot(item) {
  const source = getPixiIconTextureSource(item);
  if (!source) return null;
  return makeDebugSourceSnapshot(source);
}

function readRect(bounds) {
  if (!bounds) return null;
  const left = Number.isFinite(Number(bounds.minX)) ? Number(bounds.minX) : Number(bounds.left ?? bounds.x);
  const top = Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : Number(bounds.top ?? bounds.y);
  const right = Number.isFinite(Number(bounds.maxX))
    ? Number(bounds.maxX)
    : left + Number(bounds.width);
  const bottom = Number.isFinite(Number(bounds.maxY))
    ? Number(bounds.maxY)
    : top + Number(bounds.height);
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return {
    bottom: round(bottom),
    height: round(bottom - top),
    left: round(left),
    right: round(right),
    top: round(top),
    width: round(right - left),
  };
}

function safeBounds(node) {
  if (!node || node.destroyed || typeof node.getBounds !== "function") return null;
  try {
    return readRect(node.getBounds());
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

function rectsIntersect(left, right) {
  if (!left || !right || left.error || right.error) return null;
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

function makeDisplaySnapshot(node) {
  if (!node) return null;
  return {
    alpha: round(node.alpha ?? 1),
    destroyed: node.destroyed === true,
    globalDisplayStatus: node.globalDisplayStatus ?? null,
    includeInBuild: node.includeInBuild ?? null,
    measurable: node.measurable ?? null,
    renderable: node.renderable !== false,
    renderPipeId: node.renderPipeId || null,
    visible: node.visible !== false,
    worldAlpha: round(node.worldAlpha ?? node.alpha ?? 1),
  };
}

function isDisplayNodeVisible(node) {
  return Boolean(
    node &&
    node.visible !== false &&
    node.renderable !== false &&
    readNumber(node.worldAlpha, 1) > 0 &&
    (node.globalDisplayStatus == null || node.globalDisplayStatus !== 0)
  );
}

function makeTextureSnapshot(texture) {
  if (!texture) return null;
  const readErrors = [];
  const source = safeRead(() => texture.source || texture._source, null, readErrors, "texture.source");
  const resource = safeRead(() => source?.resource, null, readErrors, "texture.source.resource");
  const resourceWidth = resource
    ? safeRead(
        () => source.resourceWidth,
        resource.naturalWidth ?? resource.width,
        readErrors,
        "texture.source.resourceWidth"
      )
    : null;
  const resourceHeight = resource
    ? safeRead(
        () => source.resourceHeight,
        resource.naturalHeight ?? resource.height,
        readErrors,
        "texture.source.resourceHeight"
      )
    : null;
  return {
    destroyed: texture.destroyed === true,
    height: round(safeRead(() => texture.height ?? texture.frame?.height, 0, readErrors, "texture.height")),
    readErrors,
    sourceDestroyed: source?.destroyed === true,
    sourceHeight: round(safeRead(() => source?.height, 0, readErrors, "texture.source.height")),
    sourcePixelHeight: round(safeRead(() => source?.pixelHeight, 0, readErrors, "texture.source.pixelHeight")),
    sourcePixelWidth: round(safeRead(() => source?.pixelWidth, 0, readErrors, "texture.source.pixelWidth")),
    sourceResourceHeight: round(resourceHeight),
    sourceResourceType: resource?.constructor?.name || null,
    sourceResourceWidth: round(resourceWidth),
    sourceUid: source?.uid ?? null,
    sourceWidth: round(safeRead(() => source?.width, 0, readErrors, "texture.source.width")),
    textureUid: texture.uid ?? null,
    width: round(safeRead(() => texture.width ?? texture.frame?.width, 0, readErrors, "texture.width")),
    resource: resource ? {
      complete: resource.complete ?? null,
      naturalHeight: round(resource.naturalHeight),
      naturalWidth: round(resource.naturalWidth),
    } : null,
  };
}

function makeBatchSnapshot(sprite, renderer, batchBindings) {
  const gpuData = sprite?._gpuData?.[renderer?.uid];
  if (!gpuData) return null;
  const batch = gpuData._batch || null;
  const textures = batch?.textures || null;
  const textureId = gpuData._textureId ?? null;
  const plannedSource = textureId == null ? null : textures?.textures?.[textureId] || null;
  const expectedSource = sprite?.texture?.source || sprite?.texture?._source || null;
  const drawBinding = batch ? batchBindings?.byBatch?.get?.(batch) || null : null;
  const drawSlot = textureId == null
    ? null
    : drawBinding?.slots?.find((entry) => entry.location === textureId) || null;
  return {
    action: batch?.action || null,
    actualBoundSourceUid: drawSlot?.pixiBoundSourceUid ?? null,
    actualSourceMatches: expectedSource?.uid == null || drawSlot?.pixiBoundSourceUid == null
      ? null
      : expectedSource.uid === drawSlot.pixiBoundSourceUid,
    batchSize: batch?.size ?? null,
    batchStart: batch?.start ?? null,
    drawBindingCaptured: drawBinding != null,
    drawBindingError: drawBinding?.error || null,
    glHandleMatchesPlanned: drawSlot?.glHandleMatchesPlanned ?? null,
    maxTextures: gpuData._batcher?.maxTextures ?? null,
    plannedSourceMatches: expectedSource?.uid == null || plannedSource?.uid == null
      ? null
      : expectedSource.uid === plannedSource.uid,
    plannedSourceUid: plannedSource?.uid ?? null,
    textureCount: textures?.count ?? null,
    textureId,
    plannedTextureSourceUids: Array.from(textures?.textures || [])
      .slice(0, textures?.count ?? 0)
      .map((source) => source?.uid ?? null),
  };
}

function makeMaskSnapshot(folderNode, metrics) {
  const mask = folderNode?.folderPreviewMask || null;
  const wrap = folderNode?.folderChildrenWrap || null;
  const readErrors = [];
  const localRect = getFolderPreviewMaskRect(folderNode?.iconSize || 64, metrics);
  const clipBounds = typeof folderNode?.getLocalVisualBounds === "function"
    ? safeRead(
        () => readRect(folderNode.getLocalVisualBounds(folderNode.visualWrap, folderNode.stageRect, localRect)),
        null,
        readErrors,
        "folder-mask.client-bounds"
      )
    : null;
  return {
    assigned: wrap?.mask === mask,
    bounds: safeBounds(mask),
    clipBounds,
    display: makeDisplaySnapshot(mask),
    effectPipes: Array.from(wrap?.effects || []).map((effect) => effect?.pipe || null),
    localRect: readRect(localRect),
    readErrors,
    wrapDisplay: makeDisplaySnapshot(wrap),
  };
}

function makeViolation(code, folderId, itemId, slot, detail = null) {
  return {
    code,
    detail,
    folderId: folderId || null,
    itemId: itemId || null,
    slot: slot ?? null,
  };
}

function hasPositiveTextureSize(texture) {
  if (!texture) return false;
  const width = Math.max(texture.sourcePixelWidth, texture.sourceResourceWidth, texture.sourceWidth, texture.width);
  const height = Math.max(texture.sourcePixelHeight, texture.sourceResourceHeight, texture.sourceHeight, texture.height);
  return width > 0 && height > 0;
}

function matchesText(value, expected) {
  if (!expected) return true;
  return String(value || "").toLocaleLowerCase().includes(String(expected).toLocaleLowerCase());
}

function matchesItemFilter(item, filter = {}) {
  if (filter.itemId && item?.id !== filter.itemId) return false;
  if (filter.itemName && !matchesText(item?.name || item?.title, filter.itemName)) return false;
  return true;
}

function matchesFolderFilter(folder, planItems, filter = {}) {
  if (filter.folderId && folder?.id !== filter.folderId) return false;
  if (!filter.itemId && !filter.itemName) return true;
  if (matchesItemFilter(folder, filter)) return true;
  return planItems.some((item) => matchesItemFilter(item, filter));
}

function makePixelSnapshot(app, clientBounds) {
  const gl = app?.renderer?.gl;
  const canvas = app?.canvas;
  if (!gl?.readPixels) return { error: "WebGL readPixels is unavailable" };
  if (!canvas?.getBoundingClientRect) return { error: "Pixi canvas bounds are unavailable" };
  if (!clientBounds || clientBounds.error) {
    return { error: clientBounds?.error || "Folder preview child client bounds are unavailable" };
  }
  const canvasRect = canvas.getBoundingClientRect();
  if (!canvasRect?.width || !canvasRect?.height || !canvas.width || !canvas.height) {
    return { error: "Pixi canvas has no readable framebuffer dimensions" };
  }
  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;
  const rawX = Math.floor((clientBounds.left - canvasRect.left) * scaleX);
  const rawWidth = Math.ceil(clientBounds.width * scaleX);
  const rawHeight = Math.ceil(clientBounds.height * scaleY);
  const rawY = Math.floor(canvas.height - ((clientBounds.top - canvasRect.top) * scaleY) - rawHeight);
  const x = Math.max(0, Math.min(canvas.width - 1, rawX));
  const y = Math.max(0, Math.min(canvas.height - 1, rawY));
  const width = Math.max(1, Math.min(128, canvas.width - x, rawWidth));
  const height = Math.max(1, Math.min(128, canvas.height - y, rawHeight));
  try {
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let alphaNonZero = 0;
    let rgbNonZero = 0;
    let alphaSum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] || pixels[index + 1] || pixels[index + 2]) rgbNonZero += 1;
      if (pixels[index + 3]) alphaNonZero += 1;
      alphaSum += pixels[index + 3];
    }
    return {
      alphaNonZero,
      alphaSum,
      hash: hashBytes(pixels),
      height,
      rgbNonZero,
      width,
      x,
      y,
    };
  } catch (error) {
    return { error: String(error?.message || error), height, width, x, y };
  }
}

function makeChildSnapshot({
  app,
  batchBindings,
  capturePixels,
  child,
  childNode,
  focused,
  folderNode,
  index,
  mask,
  renderer,
}) {
  const sprite = childNode?.children?.[0] || null;
  const emoji = childNode?.children?.[1] || null;
  const texture = makeTextureSnapshot(sprite?.texture);
  const batch = makeBatchSnapshot(sprite, renderer, batchBindings);
  const childBounds = safeBounds(childNode);
  const clientBounds = typeof folderNode?.getFolderPreviewChildBounds === "function"
    ? (() => {
        try {
          return readRect(folderNode.getFolderPreviewChildBounds(folderNode.stageRect, index));
        } catch (error) {
          return { error: String(error?.message || error || "Unknown child bounds error") };
        }
      })()
    : null;
  const suppressed = child?.id === folderNode?.state?.suppressedFolderPreviewChildId;
  const folderVisible = isDisplayNodeVisible(folderNode);
  const intersectsMask = mask?.clipBounds
    ? rectsIntersect(clientBounds, mask.clipBounds)
    : rectsIntersect(childBounds, mask?.bounds);
  const pixelEligible = Boolean(
    capturePixels &&
    focused &&
    !suppressed &&
    folderVisible &&
    isDisplayNodeVisible(childNode) &&
    intersectsMask === true
  );
  const result = {
    batch,
    bounds: childBounds,
    clientBounds,
    display: makeDisplaySnapshot(childNode),
    emoji: {
      display: makeDisplaySnapshot(emoji),
      text: emoji?.text == null ? null : String(emoji.text),
    },
    focused,
    intersectsMask,
    itemId: child?.id || null,
    itemName: child?.name || child?.title || null,
    itemType: child?.type || null,
    pixel: pixelEligible ? makePixelSnapshot(app, clientBounds) : null,
    pixelEligible,
    slot: index,
    source: makeSourceSnapshot(child),
    sprite: makeDisplaySnapshot(sprite),
    suppressed,
    texture,
    violations: [],
  };

  if (!childNode) {
    result.violations.push(makeViolation("preview-child-missing", folderNode?.item?.id, child?.id, index));
    return result;
  }
  if (suppressed) {
    if (childNode?.visible !== false) result.violations.push(makeViolation("suppressed-child-visible", folderNode?.item?.id, child?.id, index));
    return result;
  }
  if (childNode?.visible === false) result.violations.push(makeViolation("preview-child-hidden", folderNode?.item?.id, child?.id, index));
  if (!sprite || !emoji) {
    result.violations.push(makeViolation("preview-child-visual-missing", folderNode?.item?.id, child?.id, index, {
      emojiPresent: Boolean(emoji),
      spritePresent: Boolean(sprite),
    }));
    return result;
  }
  const spriteVisible = sprite.visible !== false;
  const emojiVisible = emoji.visible !== false;
  if (spriteVisible === emojiVisible) {
    result.violations.push(makeViolation("preview-fallback-ownership", folderNode?.item?.id, child?.id, index, {
      emojiVisible,
      spriteVisible,
    }));
  }
  if (spriteVisible) {
    if (texture?.readErrors?.length) {
      result.violations.push(makeViolation("texture-read-error", folderNode?.item?.id, child?.id, index, {
        errors: texture.readErrors,
      }));
    }
    if (!texture || texture.destroyed || texture.sourceDestroyed) {
      result.violations.push(makeViolation("texture-destroyed", folderNode?.item?.id, child?.id, index));
    } else if (!hasPositiveTextureSize(texture)) {
      result.violations.push(makeViolation("texture-empty", folderNode?.item?.id, child?.id, index));
    }
    if (folderVisible && !batch) {
      result.violations.push(makeViolation("batch-gpu-data-missing", folderNode?.item?.id, child?.id, index));
    }
    if (folderVisible && batch?.plannedSourceMatches === false) {
      result.violations.push(makeViolation("batch-source-mismatch", folderNode?.item?.id, child?.id, index, {
        plannedSourceUid: batch.plannedSourceUid,
        expectedSourceUid: texture?.sourceUid ?? null,
        textureId: batch.textureId,
      }));
    }
    if (folderVisible && batchBindings?.available === true && batch && !batch.drawBindingCaptured) {
      result.violations.push(makeViolation("batch-draw-evidence-missing", folderNode?.item?.id, child?.id, index));
    }
    if (folderVisible && batch?.actualSourceMatches === false) {
      result.violations.push(makeViolation("batch-draw-source-mismatch", folderNode?.item?.id, child?.id, index, {
        actualBoundSourceUid: batch.actualBoundSourceUid,
        expectedSourceUid: texture?.sourceUid ?? null,
        textureId: batch.textureId,
      }));
    }
    if (folderVisible && batch?.glHandleMatchesPlanned === false) {
      result.violations.push(makeViolation("gl-texture-binding-mismatch", folderNode?.item?.id, child?.id, index, {
        plannedSourceUid: batch.plannedSourceUid,
        textureId: batch.textureId,
      }));
    }
  }
  return result;
}

function makeFolderSnapshots({ app, batchBindings, layer, filter, capturePixels }) {
  const folders = [];
  const violations = [];
  const renderer = app?.renderer || null;
  for (const [key, folderNode] of layer?.iconNodes || []) {
    const folder = folderNode?.item;
    if (folder?.type !== "folder") continue;
    const metrics = getFolderThumbMetrics(folderNode.iconSize || 64);
    const plan = getFolderPreviewMotionPlan(folder, folderNode.state?.folderPreviewPageSize, metrics);
    if (!matchesFolderFilter(folder, plan.items, filter)) continue;
    const mask = makeMaskSnapshot(folderNode, metrics);
    if (mask.readErrors.length || mask.bounds?.error || mask.clipBounds?.error) {
      violations.push(makeViolation("folder-mask-read-error", folder.id, null, null, {
        boundsError: mask.bounds?.error || null,
        clipBoundsError: mask.clipBounds?.error || null,
        errors: mask.readErrors,
      }));
    }
    const children = [];
    const hasItemFilter = Boolean(filter.itemId || filter.itemName);
    const focusFolderChildren = Boolean(filter.folderId) || (hasItemFilter && matchesItemFilter(folder, filter));
    for (let index = 0; index < plan.items.length; index += 1) {
      const child = plan.items[index];
      const childNode = folderNode.folderChildNodes?.[index] || null;
      const focused = focusFolderChildren || (hasItemFilter && matchesItemFilter(child, filter));
      const childSnapshot = makeChildSnapshot({
        app,
        batchBindings,
        capturePixels,
        child,
        childNode,
        focused,
        folderNode,
        index,
        mask,
        renderer,
      });
      children.push(childSnapshot);
      violations.push(...childSnapshot.violations);
    }
    folders.push({
      children,
      display: makeDisplaySnapshot(folderNode),
      folderId: folder.id,
      folderName: folder.name || folder.title || null,
      key,
      mask,
      state: {
        dragging: folderNode.state?.dragging === true,
        ghosted: folderNode.state?.ghosted === true,
        opening: folderNode.state?.opening === true,
        suppressedFolderPreviewChildId: folderNode.state?.suppressedFolderPreviewChildId || null,
      },
    });
  }
  return { folders, violations };
}

function makeStencilSnapshot(app) {
  const instructionSet = app?.stage?.renderGroup?.instructionSet || app?.stage?.parentRenderGroup?.instructionSet || null;
  if (!instructionSet || !instructionSet.instructions) {
    return {
      actions: [],
      available: false,
      balanced: null,
      counts: {},
      error: "Pixi stencil instruction set is unavailable",
      finalDepth: null,
      instructionCount: null,
      minDepth: null,
    };
  }
  const size = Math.max(0, Number(instructionSet?.instructionSize) || 0);
  const actions = [];
  let depth = 0;
  let minDepth = 0;
  const counts = {};
  for (let index = 0; index < size; index += 1) {
    const instruction = instructionSet.instructions?.[index];
    if (instruction?.renderPipeId !== "stencilMask") continue;
    const action = instruction.action || "unknown";
    actions.push({ action, index });
    counts[action] = (counts[action] || 0) + 1;
    if (action === "pushMaskBegin") depth += 1;
    if (action === "popMaskBegin") depth -= 1;
    minDepth = Math.min(minDepth, depth);
  }
  const balanced = depth === 0 && minDepth >= 0 &&
    (counts.pushMaskBegin || 0) === (counts.pushMaskEnd || 0) &&
    (counts.popMaskBegin || 0) === (counts.popMaskEnd || 0) &&
    (counts.pushMaskBegin || 0) === (counts.popMaskBegin || 0);
  return {
    actions,
    available: true,
    balanced,
    counts,
    error: null,
    finalDepth: depth,
    instructionCount: size,
    minDepth,
  };
}

function makeGlSnapshot(renderer) {
  const gl = renderer?.gl;
  if (!gl?.getParameter) {
    return {
      available: false,
      reason: renderer?.name === "webgl" ? "webgl-api-unavailable" : `renderer:${renderer?.name || "unknown"}`,
    };
  }
  try {
    const debugInfo = gl.getExtension?.("WEBGL_debug_renderer_info") || null;
    return {
      available: true,
      contextLost: gl.isContextLost?.() === true,
      glVersion: gl.getParameter(gl.VERSION),
      maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      renderer: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      vendor: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR),
    };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

function makeRendererSnapshot(app) {
  const renderer = app?.renderer || null;
  const canvas = app?.canvas || renderer?.canvas || null;
  return {
    canvas: canvas ? {
      clientHeight: canvas.clientHeight ?? null,
      clientWidth: canvas.clientWidth ?? null,
      height: canvas.height ?? null,
      width: canvas.width ?? null,
    } : null,
    gl: makeGlSnapshot(renderer),
    height: renderer?.height ?? null,
    name: renderer?.name || null,
    resolution: renderer?.resolution ?? null,
    tick: renderer?.tick ?? null,
    textureGC: renderer?.textureGC ? {
      active: renderer.textureGC.active ?? null,
      checkCount: renderer.textureGC.checkCount ?? null,
      count: renderer.textureGC.count ?? null,
    } : null,
    uid: renderer?.uid ?? null,
    width: renderer?.width ?? null,
  };
}

function stableDebugValue(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    return value.length > 160 ? { fingerprint: hashSample(value), length: value.length } : value;
  }
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (depth >= 5) return "[DepthLimit]";
  if (Array.isArray(value)) return value.map((entry) => stableDebugValue(entry, depth + 1, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const next = stableDebugValue(value[key], depth + 1, seen);
      if (next !== undefined) result[key] = next;
    }
    seen.delete(value);
    return result;
  }
  return undefined;
}

function makeEntryDebugSignature(entry) {
  if (!entry) return null;
  const state = { ...(entry.nodeState || {}) };
  delete state.item;
  const item = entry.item || entry.nodeState?.item || null;
  const childSource = Array.isArray(item?.childPages) ? item.childPages[0] || [] : item?.children || [];
  return JSON.stringify(stableDebugValue({
    item: {
      ...summarizeItem(item),
      children: childSource.filter(Boolean).map((child) => ({
        ...summarizeItem(child),
        source: makeSourceSnapshot(child),
      })),
      source: makeSourceSnapshot(item),
    },
    state,
  }));
}

export function makeDesktopPlanDebugDelta(previousPlan, nextPlan) {
  const previousEntries = new Map((previousPlan?.entries || []).map((entry) => [entry.key, entry]));
  const changedKeys = [];
  const unchangedKeys = [];
  for (const entry of nextPlan?.entries || []) {
    const previous = previousEntries.get(entry.key);
    if (previous && makeEntryDebugSignature(previous) === makeEntryDebugSignature(entry)) unchangedKeys.push(entry.key);
    else changedKeys.push(entry.key);
  }
  const applied = previousPlan?.signature !== nextPlan?.signature;
  return {
    applied,
    changedEntryCount: changedKeys.length,
    changedKeys: changedKeys.slice(0, MAX_PLAN_KEYS),
    entryCount: nextPlan?.entries?.length || 0,
    nextSignature: nextPlan?.signature ? { fingerprint: hashSample(nextPlan.signature), length: nextPlan.signature.length } : null,
    previousSignature: previousPlan?.signature ? { fingerprint: hashSample(previousPlan.signature), length: previousPlan.signature.length } : null,
    setStateCount: applied ? nextPlan?.entries?.length || 0 : 0,
    unchangedEntryCount: unchangedKeys.length,
    unchangedKeys: unchangedKeys.slice(0, MAX_PLAN_KEYS),
    unchangedSetStateCount: applied ? unchangedKeys.length : 0,
  };
}

export function capturePixiRenderSnapshot(options = {}) {
  const { app, layer } = options;
  const filter = options.filter && typeof options.filter === "object" ? options.filter : {};
  const stencil = makeStencilSnapshot(app);
  const folderResult = makeFolderSnapshots({
    app,
    batchBindings: options.batchBindings,
    capturePixels: options.capturePixels === true,
    filter,
    layer,
  });
  const violations = [...folderResult.violations];
  if (stencil.available === false) {
    violations.push(makeViolation("stencil-instructions-unavailable", null, null, null, {
      error: stencil.error,
    }));
  } else if (!stencil.balanced) {
    violations.push(makeViolation("stencil-unbalanced", null, null, null, {
      counts: stencil.counts,
      finalDepth: stencil.finalDepth,
      minDepth: stencil.minDepth,
    }));
  }
  const expectedStencilMaskCount = folderResult.folders.filter((folder) =>
    folder.display?.visible !== false &&
    folder.display?.renderable !== false &&
    readNumber(folder.display?.worldAlpha, 1) > 0 &&
    folder.mask?.assigned === true &&
    folder.mask?.effectPipes?.includes("stencilMask")
  ).length;
  const observedStencilMaskCount = stencil.counts?.pushMaskBegin || 0;
  if (stencil.available === true && observedStencilMaskCount < expectedStencilMaskCount) {
    violations.push(makeViolation("stencil-mask-count-mismatch", null, null, null, {
      expectedAtLeast: expectedStencilMaskCount,
      observed: observedStencilMaskCount,
    }));
  }
  const batchBindingCapture = summarizePixiBatchBindingCapture(options.batchBindings);
  if (batchBindingCapture?.available === false && app?.renderer?.name === "webgl") {
    violations.push(makeViolation("batch-binding-capture-unavailable", null, null, null, {
      reason: batchBindingCapture.reason,
    }));
  }
  if (batchBindingCapture?.errors?.length) {
    violations.push(makeViolation("batch-binding-capture-error", null, null, null, {
      errors: batchBindingCapture.errors,
    }));
  }
  const textureCache = typeof options.getTextureCacheDebugSnapshot === "function"
    ? options.getTextureCacheDebugSnapshot()
    : options.textureCacheSnapshot || null;
  return {
    batchBindingCapture,
    filter: clonePlain(filter),
    folders: folderResult.folders,
    phase: options.phase || "manual",
    plan: layer?.lastDesktopRenderPlan ? {
      entryCount: layer.lastDesktopRenderPlan.entries?.length || 0,
      signature: {
        fingerprint: hashSample(layer.lastDesktopRenderPlan.signature),
        length: layer.lastDesktopRenderPlan.signature?.length || 0,
      },
    } : null,
    reasons: Array.from(options.reasons || []),
    renderer: makeRendererSnapshot(app),
    stencil,
    textureCache,
    version: REPORT_VERSION,
    violations,
  };
}

function normalizeConfig(config = {}) {
  return {
    autoFreeze: config.autoFreeze !== false,
    capturePixels: config.capturePixels === true,
    enabled: config.enabled !== false,
    filter: {
      folderId: config.folderId || config.filter?.folderId || null,
      itemId: config.itemId || config.filter?.itemId || null,
      itemName: config.itemName || config.filter?.itemName || null,
    },
    maxEvents: clampInteger(config.maxEvents, DEFAULT_MAX_EVENTS, 20, 2000),
    maxSessions: clampInteger(config.maxSessions, DEFAULT_MAX_SESSIONS, 1, 20),
  };
}

export function createPixiRenderProbe(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => globalThis.performance?.now?.() ?? Date.now();
  if (typeof options.capture !== "function") {
    throw new TypeError("createPixiRenderProbe requires a capture function");
  }
  const capture = options.capture;
  let config = normalizeConfig({
    maxEvents: options.maxEvents,
    maxSessions: options.maxSessions,
    ...options.config,
  });
  let sequence = 0;
  let sessionSequence = 0;
  let activeSession = null;
  let lastDrag = null;
  let pointerPrelude = null;
  const recentEvents = [];
  const sessions = [];
  const canvasBindings = [];

  function timestamp() {
    return round(now(), 3);
  }

  function record(type, detail = null) {
    if (!config.enabled) return null;
    const event = {
      detail: clonePlain(detail),
      sequence: ++sequence,
      timeMs: timestamp(),
      type,
    };
    pushLimited(recentEvents, event, config.maxEvents);
    if (activeSession) pushLimited(activeSession.events, event, config.maxEvents);
    return event;
  }

  function captureCurrent(phase, reasons = [], captureOptions = {}) {
    try {
      return capture({
        batchBindings: captureOptions.batchBindings || null,
        capturePixels: captureOptions.capturePixels === true,
        filter: config.filter,
        phase,
        reasons: Array.from(reasons || []),
      });
    } catch (error) {
      return {
        folders: [],
        phase,
        reasons: Array.from(reasons || []),
        version: REPORT_VERSION,
        violations: [{ code: "capture-failed", detail: String(error?.stack || error) }],
      };
    }
  }

  function freeze(reason = "manual") {
    const session = activeSession || sessions.at(-1) || null;
    if (!session || session.frozenAt != null) return session;
    session.frozenAt = timestamp();
    session.frozenEvents = clonePlain(session.events);
    session.frozenReason = String(reason || "manual");
    record("trace-frozen", { reason: session.frozenReason, sessionId: session.id });
    return session;
  }

  function storeCapture(phase, reasons = [], captureOptions = {}) {
    const snapshot = captureCurrent(phase, reasons, captureOptions);
    const entry = {
      phase,
      snapshot,
      timeMs: timestamp(),
    };
    if (activeSession) activeSession.captures.push(entry);
    record("phase-capture", {
      phase,
      sessionId: activeSession?.id || null,
      violationCount: snapshot?.violations?.length || 0,
    });
    const firstViolation = snapshot?.violations?.[0];
    if (firstViolation && config.autoFreeze) freeze(`invariant:${firstViolation.code}`);
    return entry;
  }

  function startSession(drag) {
    const preludeViolation = pointerPrelude?.capture?.snapshot?.violations?.[0] || null;
    const startedAt = timestamp();
    activeSession = {
      captures: [],
      dragItem: drag.item,
      events: [],
      finishedAt: null,
      frozenAt: null,
      frozenEvents: null,
      frozenReason: null,
      id: `drag-render-${++sessionSequence}`,
      pointerDown: pointerPrelude?.pointerDown || null,
      source: drag.source,
      startedAt,
      status: "active",
    };
    if (pointerPrelude?.capture) activeSession.captures.push(pointerPrelude.capture);
    if (pointerPrelude?.event) {
      const preludeEvents = recentEvents.filter((event) => event.sequence >= pointerPrelude.event.sequence);
      for (const event of preludeEvents) pushLimited(activeSession.events, event, config.maxEvents);
    }
    record("drag-session-start", { dragItem: drag.item, sessionId: activeSession.id, source: drag.source });
    if (preludeViolation && config.autoFreeze) freeze(`invariant:${preludeViolation.code}`);
  }

  function finishSession(status = "complete") {
    if (!activeSession) return null;
    activeSession.finishedAt = timestamp();
    activeSession.status = status;
    record("drag-session-finish", { sessionId: activeSession.id, status });
    const completed = activeSession;
    activeSession = null;
    pushLimited(sessions, completed, config.maxSessions);
    pointerPrelude = null;
    return completed;
  }

  function notePointerDown(input = {}) {
    if (!config.enabled) return null;
    const pointerDown = {
      button: input.event?.button ?? null,
      clientX: input.event?.clientX ?? null,
      clientY: input.event?.clientY ?? null,
      item: summarizeItem(input.item),
      pointerId: input.event?.pointerId ?? null,
      pointerType: input.event?.pointerType || null,
      source: summarizeSource(input.source),
    };
    const event = record("pointerdown", pointerDown);
    pointerPrelude = {
      capture: {
        phase: "pointerdown",
        snapshot: captureCurrent("pointerdown", [], { capturePixels: false }),
        timeMs: timestamp(),
      },
      event,
      pointerDown,
    };
    return pointerPrelude;
  }

  function beforeRender(input = {}) {
    const nextDrag = summarizeDragMeta(input.dragMeta);
    if (!config.enabled) {
      lastDrag = nextDrag;
      return null;
    }
    let phase = null;
    if (!lastDrag && nextDrag) {
      startSession(nextDrag);
      phase = "drag-start";
    } else if (lastDrag && !nextDrag) {
      phase = "drag-end";
    } else if (lastDrag?.item?.id !== nextDrag?.item?.id) {
      finishSession("replaced");
      if (nextDrag) {
        startSession(nextDrag);
        phase = "drag-start";
      }
    }
    lastDrag = nextDrag;
    const token = {
      phase,
      reasons: Array.from(input.reasons || []),
      sessionId: activeSession?.id || null,
      updateLayer: input.updateLayer !== false,
    };
    record("render-begin", token);
    return {
      ...token,
      batchBindingCapture: phase ? beginPixiBatchBindingCapture(input.renderer) : null,
    };
  }

  function afterRender(token = null) {
    const batchBindings = token?.batchBindingCapture?.finish?.() || null;
    if (!config.enabled || !token) return null;
    record("render-end", {
      phase: token.phase,
      reasons: token.reasons,
      sessionId: token.sessionId,
      updateLayer: token.updateLayer,
    });
    let captureEntry = null;
    if (token.phase) {
      captureEntry = storeCapture(token.phase, token.reasons, {
        batchBindings,
        capturePixels: config.capturePixels && token.phase !== "pointerdown",
      });
    }
    if (token.phase === "drag-end") finishSession("complete");
    return captureEntry;
  }

  function recordDesktopPlan(previousPlan, nextPlan) {
    return record("desktop-plan", makeDesktopPlanDebugDelta(previousPlan, nextPlan));
  }

  function clear() {
    activeSession = null;
    lastDrag = null;
    pointerPrelude = null;
    recentEvents.length = 0;
    sessions.length = 0;
  }

  function configure(patch = {}) {
    const previous = config;
    config = normalizeConfig({
      ...previous,
      ...patch,
      filter: {
        ...previous.filter,
        ...(patch.filter || {}),
      },
    });
    if (patch.clear === true) clear();
    return clonePlain(config);
  }

  function makeReport() {
    return clonePlain({
      activeSession,
      config,
      recentEvents,
      sessions,
      version: REPORT_VERSION,
    });
  }

  function inspect(label = "manual") {
    return captureCurrent(String(label || "manual"), [], { capturePixels: config.capturePixels });
  }

  function exportJson(space = 2) {
    return JSON.stringify(makeReport(), null, clampInteger(space, 2, 0, 4));
  }

  function download(filename = `launchpad-render-trace-${Date.now()}.json`) {
    const document = globalThis.document;
    const URLApi = globalThis.URL;
    if (!document?.createElement || !URLApi?.createObjectURL || typeof Blob !== "function") {
      throw new Error("Render trace download is unavailable in this environment");
    }
    const url = URLApi.createObjectURL(new Blob([exportJson()], { type: "application/json" }));
    const link = document.createElement("a");
    link.download = String(filename || "launchpad-render-trace.json");
    link.href = url;
    link.click();
    globalThis.setTimeout?.(() => URLApi.revokeObjectURL(url), 0);
    return link.download;
  }

  function attachCanvas(canvas) {
    if (!canvas?.addEventListener) return () => {};
    const onLost = (event) => record("webgl-context-lost", { statusMessage: event?.statusMessage || null });
    const onRestored = () => record("webgl-context-restored");
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    const dispose = () => {
      canvas.removeEventListener?.("webglcontextlost", onLost);
      canvas.removeEventListener?.("webglcontextrestored", onRestored);
    };
    canvasBindings.push(dispose);
    return dispose;
  }

  function destroy() {
    for (const dispose of canvasBindings.splice(0)) dispose();
  }

  const commands = {
    arm: (patch = {}) => configure({ ...patch, enabled: true }),
    capture: (label = "manual") => storeCapture(String(label || "manual"), [], { capturePixels: config.capturePixels }).snapshot,
    clear,
    disarm: () => configure({ enabled: false }),
    download,
    exportJson,
    freeze,
    inspect,
    snapshot: makeReport,
    status: () => clonePlain(config),
  };

  return {
    afterRender,
    attachCanvas,
    beforeRender,
    commands,
    destroy,
    notePointerDown,
    record,
    recordDesktopPlan,
  };
}
