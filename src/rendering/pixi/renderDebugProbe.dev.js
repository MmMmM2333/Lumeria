import { getPixiIconTextureSource } from "./assets/iconTextureSourceAdapter.js";
import {
  hashDebugSample as hashSample,
  makeDebugSourceSnapshot,
} from "./renderDebugFingerprint.js";
import {
  captureFolderFramebufferSample,
  compareFolderPixelSnapshots,
  makeFolderPixelSlotKey,
} from "./folderFramebufferSampler.dev.js";
import { getFolderPreviewMaskRect } from "./nodes/folderThumbDrawing.js";
import { getFolderPreviewMotionPlan } from "./nodes/folderThumbPreviewMotion.js";
import { getFolderThumbMetrics } from "./nodes/folderThumbMetrics.js";
import {
  beginPixiBatchBindingCapture,
  summarizePixiBatchBindingCapture,
} from "./pixiBatchBindingProbe.dev.js";

const REPORT_VERSION = 2;
const DEFAULT_MAX_EVENTS = 240;
const DEFAULT_MAX_SESSIONS = 4;
const LEGACY_RENDER_PROBE_OPTIONS = ["capturePixels", "filter", "folderId", "itemId", "itemName"];
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

function matchesItemTarget(item, target) {
  if (target === "all-folders") return true;
  if (target?.itemId && item?.id !== target.itemId) return false;
  if (target?.itemName && !matchesText(item?.name || item?.title, target.itemName)) return false;
  if (target?.folderId) return false;
  return true;
}

function matchesFolderTarget(folder, planItems, target) {
  if (target === "all-folders") return true;
  if (target?.folderId) return folder?.id === target.folderId;
  if (matchesItemTarget(folder, target)) return true;
  return planItems.some((item) => matchesItemTarget(item, target));
}

function makeChildSceneSignature(result, mask, folderNode) {
  const values = [
    result.itemId,
    result.slot,
    result.suppressed,
    result.intersectsMask,
    result.display?.visible,
    result.display?.renderable,
    result.display?.worldAlpha,
    result.sprite?.visible,
    result.sprite?.renderable,
    result.sprite?.worldAlpha,
    result.emoji?.display?.visible,
    result.emoji?.display?.renderable,
    result.emoji?.display?.worldAlpha,
    result.emoji?.text,
    result.source?.fingerprint,
    result.texture?.textureUid,
    result.texture?.sourceUid,
    result.texture?.destroyed,
    result.texture?.sourceDestroyed,
    result.texture?.sourcePixelWidth,
    result.texture?.sourcePixelHeight,
    result.batch?.plannedSourceUid,
    result.batch?.actualBoundSourceUid,
    result.batch?.actualSourceMatches,
    result.batch?.glHandleMatchesPlanned,
    result.clientBounds?.left,
    result.clientBounds?.top,
    result.clientBounds?.width,
    result.clientBounds?.height,
    mask?.clipBounds?.left,
    mask?.clipBounds?.top,
    mask?.clipBounds?.width,
    mask?.clipBounds?.height,
    mask?.assigned,
    mask?.effectPipes?.join(","),
    mask?.display?.visible,
    mask?.display?.renderable,
    mask?.display?.worldAlpha,
    folderNode?.state?.dragging === true,
    folderNode?.state?.ghosted === true,
    folderNode?.state?.opening === true,
  ];
  return hashSample(values.join("|"));
}

function makeChildSnapshot({
  batchBindings,
  child,
  childNode,
  folderNode,
  index,
  mask,
  renderer,
  targeted,
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
  const suppressed = (folderNode?.state?.suppressedFolderPreviewChildIds || []).includes(child?.id);
  const folderVisible = isDisplayNodeVisible(folderNode);
  const intersectsMask = mask?.clipBounds
    ? rectsIntersect(clientBounds, mask.clipBounds)
    : rectsIntersect(childBounds, mask?.bounds);
  const pixelEligible = Boolean(
    targeted &&
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
    intersectsMask,
    itemId: child?.id || null,
    itemName: child?.name || child?.title || null,
    itemType: child?.type || null,
    pixel: null,
    pixelEligible,
    slot: index,
    source: makeSourceSnapshot(child),
    sprite: makeDisplaySnapshot(sprite),
    suppressed,
    targeted,
    texture,
    violations: [],
  };
  result.sceneSignature = makeChildSceneSignature(result, mask, folderNode);

  if (!childNode) {
    result.violations.push(makeViolation("preview-child-missing", folderNode?.item?.id, child?.id, index));
    return result;
  }
  if (suppressed) {
    if (childNode?.visible === false) {
      result.violations.push(makeViolation("suppressed-child-transform-hidden", folderNode?.item?.id, child?.id, index));
    }
    if (childNode?.renderable !== false) {
      result.violations.push(makeViolation("suppressed-child-renderable", folderNode?.item?.id, child?.id, index));
    }
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

function makeFolderSnapshots({ app, batchBindings, layer, target }) {
  const folders = [];
  const violations = [];
  const renderer = app?.renderer || null;
  for (const [key, folderNode] of layer?.iconNodes || []) {
    const folder = folderNode?.item;
    if (folder?.type !== "folder") continue;
    const metrics = getFolderThumbMetrics(folderNode.iconSize || 64);
    const plan = getFolderPreviewMotionPlan(folder, folderNode.state?.folderPreviewPageSize, metrics);
    if (!matchesFolderTarget(folder, plan.items, target)) continue;
    const mask = makeMaskSnapshot(folderNode, metrics);
    if (mask.readErrors.length || mask.bounds?.error || mask.clipBounds?.error) {
      violations.push(makeViolation("folder-mask-read-error", folder.id, null, null, {
        boundsError: mask.bounds?.error || null,
        clipBoundsError: mask.clipBounds?.error || null,
        errors: mask.readErrors,
      }));
    }
    const children = [];
    const targetFolderChildren = target === "all-folders" ||
      (target?.folderId && folder.id === target.folderId) ||
      (!target?.folderId && matchesItemTarget(folder, target));
    for (let index = 0; index < plan.items.length; index += 1) {
      const child = plan.items[index];
      const childNode = folderNode.folderChildNodes?.[index] || null;
      const targeted = targetFolderChildren || matchesItemTarget(child, target);
      const childSnapshot = makeChildSnapshot({
        batchBindings,
        child,
        childNode,
        folderNode,
        index,
        mask,
        renderer,
        targeted,
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
        suppressedFolderPreviewChildIds: [...(folderNode.state?.suppressedFolderPreviewChildIds || [])],
      },
    });
  }
  return { folders, violations };
}

function collectPixelSlots(folderResult) {
  const slots = [];
  for (const folder of folderResult.folders) {
    for (const child of folder.children) {
      if (!child.pixelEligible) continue;
      slots.push({
        clientBounds: child.clientBounds,
        folderId: folder.folderId,
        folderName: folder.folderName,
        itemId: child.itemId,
        itemName: child.itemName,
        sceneSignature: child.sceneSignature,
        slot: child.slot,
      });
    }
  }
  return slots;
}

function attachFramebufferPixels(folderResult, framebufferSample) {
  const bySlot = new Map((framebufferSample?.slots || []).map((slot) => [
    makeFolderPixelSlotKey(slot),
    slot,
  ]));
  for (const folder of folderResult.folders) {
    for (const child of folder.children) {
      const slot = bySlot.get(makeFolderPixelSlotKey({ folderId: folder.folderId, itemId: child.itemId, slot: child.slot }));
      if (!slot) continue;
      const {
        folderId: _folderId,
        folderName: _folderName,
        itemId: _itemId,
        itemName: _itemName,
        sceneSignature: _sceneSignature,
        slot: _slot,
        ...pixel
      } = slot;
      child.pixel = pixel;
    }
  }
}

function summarizeFramebufferSample(sample) {
  if (!sample) return null;
  return {
    available: sample.available === true,
    captureDurationMs: sample.captureDurationMs ?? 0,
    detail: clonePlain(sample.detail),
    readPixelsCallCount: sample.readPixelsCallCount ?? 0,
    reason: sample.reason || null,
    region: clonePlain(sample.region),
    skippedSlots: clonePlain(sample.skippedSlots || []),
    slotCount: sample.slots?.length || 0,
    warnings: clonePlain(sample.warnings || []),
  };
}

function summarizeFramebufferForPanel(framebuffer) {
  if (!framebuffer) return null;
  return {
    available: framebuffer.available === true,
    captureDurationMs: framebuffer.captureDurationMs ?? null,
    readPixelsCallCount: framebuffer.readPixelsCallCount ?? null,
    reason: framebuffer.reason || null,
    region: clonePlain(framebuffer.region),
    skippedSlotCount: framebuffer.skippedSlots?.length ?? null,
    slotCount: framebuffer.slotCount ?? null,
    warningCount: framebuffer.warnings?.length ?? null,
  };
}

function summarizePixelComparisonForPanel(comparison) {
  if (!comparison) return null;
  return {
    available: comparison.available === true,
    candidates: clonePlain(comparison.candidates || []),
    changedSlotCount: comparison.changedSlotCount ?? 0,
    comparableSlotCount: comparison.comparableSlotCount ?? 0,
    from: comparison.from || null,
    reason: comparison.reason || null,
    skippedSlotCount: comparison.skippedSlotCount ?? 0,
    strongCandidateCount: comparison.strongCandidateCount ?? 0,
    to: comparison.to || null,
    truncatedCandidateCount: comparison.truncatedCandidateCount ?? 0,
  };
}

function summarizeSessionForPanel(session) {
  if (!session) return null;
  return {
    captures: (session.captures || []).map((entry) => ({
      firstViolation: clonePlain(entry.snapshot?.violations?.[0] || null),
      framebuffer: summarizeFramebufferForPanel(entry.snapshot?.framebuffer),
      phase: entry.phase || null,
      timeMs: entry.timeMs ?? null,
      violationCount: entry.snapshot?.violations?.length || 0,
    })),
    dragItem: clonePlain(session.dragItem),
    finishedAt: session.finishedAt ?? null,
    frozenAt: session.frozenAt ?? null,
    frozenReason: session.frozenReason || null,
    id: session.id || null,
    pixelComparison: summarizePixelComparisonForPanel(session.pixelComparison),
    source: clonePlain(session.source),
    startedAt: session.startedAt ?? null,
    status: session.status || null,
  };
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
  const childSource = Array.isArray(item?.childPages) ? item.childPages[0] || [] : [];
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
  assertNoLegacyRenderProbeOptions(options);
  const { app, layer } = options;
  const pixels = normalizePixels(options.pixels);
  const target = normalizeTarget(options.target);
  const stencil = makeStencilSnapshot(app);
  const folderResult = makeFolderSnapshots({
    app,
    batchBindings: options.batchBindings,
    layer,
    target,
  });
  const violations = [...folderResult.violations];
  let framebuffer = null;
  if (pixels === "phase-diff") {
    const framebufferSample = captureFolderFramebufferSample({
      app,
      maxReadBytes: options.maxPixelReadBytes,
      now: options.now,
      slots: collectPixelSlots(folderResult),
    });
    attachFramebufferPixels(folderResult, framebufferSample);
    framebuffer = summarizeFramebufferSample(framebufferSample);
    if (framebufferSample.available !== true) {
      violations.push(makeViolation("framebuffer-capture-unavailable", null, null, null, {
        detail: framebufferSample.detail,
        reason: framebufferSample.reason,
        region: framebufferSample.region,
      }));
    }
  }
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
    framebuffer,
    folders: folderResult.folders,
    phase: options.phase || "manual",
    pixels,
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
    target: clonePlain(target),
    textureCache,
    version: REPORT_VERSION,
    violations,
  };
}

function assertNoLegacyRenderProbeOptions(options) {
  const present = LEGACY_RENDER_PROBE_OPTIONS.filter((key) => Object.prototype.hasOwnProperty.call(options || {}, key));
  if (present.length) {
    throw new TypeError(`Render probe options ${present.join(", ")} were removed; use target and pixels`);
  }
}

function normalizeTarget(target) {
  if (target == null || target === "all-folders") return "all-folders";
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new TypeError('Render probe target must be "all-folders" or one target object');
  }
  const entries = ["folderId", "itemId", "itemName"]
    .filter((key) => Object.prototype.hasOwnProperty.call(target, key) && target[key] != null);
  if (entries.length !== 1) {
    throw new TypeError("Render probe target must contain exactly one of folderId, itemId, or itemName");
  }
  const key = entries[0];
  const value = String(target[key]).trim();
  if (!value) throw new TypeError(`Render probe target ${key} must not be empty`);
  return { [key]: value };
}

function normalizePixels(pixels) {
  if (pixels == null || pixels === "off") return "off";
  if (pixels === "phase-diff") return pixels;
  throw new TypeError('Render probe pixels must be "off" or "phase-diff"');
}

function normalizeConfig(config = {}) {
  assertNoLegacyRenderProbeOptions(config);
  return {
    autoFreeze: config.autoFreeze !== false,
    enabled: config.enabled !== false,
    maxEvents: clampInteger(config.maxEvents, DEFAULT_MAX_EVENTS, 20, 2000),
    maxSessions: clampInteger(config.maxSessions, DEFAULT_MAX_SESSIONS, 1, 20),
    pixels: normalizePixels(config.pixels),
    target: normalizeTarget(config.target),
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
        phase,
        pixels: normalizePixels(captureOptions.pixels),
        reasons: Array.from(reasons || []),
        target: config.target,
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
      pixelComparison: null,
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
        snapshot: captureCurrent("pointerdown", [], { pixels: "off" }),
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
        pixels: config.pixels,
      });
    }
    if (token.phase === "drag-end") {
      if (activeSession && config.pixels === "phase-diff") {
        const startEntry = activeSession.captures.find((entry) => entry.phase === "drag-start") || null;
        const comparison = compareFolderPixelSnapshots(startEntry?.snapshot, captureEntry?.snapshot);
        activeSession.pixelComparison = comparison;
        record("pixel-comparison", {
          available: comparison.available,
          changedSlotCount: comparison.changedSlotCount,
          comparableSlotCount: comparison.comparableSlotCount,
          strongCandidateCount: comparison.strongCandidateCount,
        });
        const strongest = comparison.candidates?.find((candidate) => candidate.strongCandidate);
        if (strongest && config.autoFreeze) {
          freeze(`pixel-diff:${strongest.folderId || "unknown"}:${strongest.itemId || "unknown"}:${strongest.slot ?? "unknown"}`);
        }
      }
      finishSession("complete");
    }
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

  function makeSummary() {
    return {
      activeSession: summarizeSessionForPanel(activeSession),
      config: clonePlain(config),
      lastSession: summarizeSessionForPanel(sessions.at(-1) || null),
      recentEventCount: recentEvents.length,
      sessionCount: sessions.length,
      version: REPORT_VERSION,
    };
  }

  function inspect(label = "manual") {
    return captureCurrent(String(label || "manual"), [], { pixels: config.pixels });
  }

  function exportJson(space = 2) {
    return JSON.stringify(makeReport(), null, clampInteger(space, 2, 0, 4));
  }

  function download(filename = `lumeria-render-trace-${Date.now()}.json`) {
    const document = globalThis.document;
    const URLApi = globalThis.URL;
    if (!document?.createElement || !URLApi?.createObjectURL || typeof Blob !== "function") {
      throw new Error("Render trace download is unavailable in this environment");
    }
    const url = URLApi.createObjectURL(new Blob([exportJson()], { type: "application/json" }));
    const link = document.createElement("a");
    link.download = String(filename || "lumeria-render-trace.json");
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
    capture: (label = "manual") => storeCapture(String(label || "manual"), [], { pixels: config.pixels }).snapshot,
    clear,
    disarm: () => configure({ enabled: false }),
    download,
    exportJson,
    freeze,
    inspect,
    snapshot: makeReport,
    status: () => clonePlain(config),
    summary: makeSummary,
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
