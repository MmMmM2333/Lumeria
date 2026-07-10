function errorText(error) {
  return String(error?.message || error || "Unknown Pixi batch binding probe error");
}

function makeUnavailableCapture(renderer, reason) {
  const evidence = {
    available: false,
    batchCount: 0,
    byBatch: new WeakMap(),
    errors: [],
    reason,
    rendererName: renderer?.name || null,
  };
  return { finish: () => evidence };
}

function getGlBindingParameter(gl, target) {
  if (target === gl.TEXTURE_2D) return { name: "texture-2d", parameter: gl.TEXTURE_BINDING_2D };
  if (target === gl.TEXTURE_2D_ARRAY) {
    return { name: "texture-2d-array", parameter: gl.TEXTURE_BINDING_2D_ARRAY };
  }
  if (target === gl.TEXTURE_CUBE_MAP) {
    return { name: "texture-cube-map", parameter: gl.TEXTURE_BINDING_CUBE_MAP };
  }
  return { name: `unknown:${target ?? "null"}`, parameter: null };
}

function captureGlSlots(renderer, batch) {
  const gl = renderer.gl;
  const textureSystem = renderer.texture;
  const plannedSources = batch?.textures?.textures || [];
  const count = Math.max(0, Number(batch?.textures?.count) || 0);
  const slots = [];
  const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  try {
    for (let location = 0; location < count; location += 1) {
      const plannedSource = plannedSources[location] || null;
      const pixiBoundSource = textureSystem?._boundTextures?.[location] || null;
      const plannedGpuTexture = plannedSource?._gpuData?.[renderer.uid] || null;
      const target = plannedGpuTexture?.target ?? gl.TEXTURE_2D;
      const binding = getGlBindingParameter(gl, target);
      let glTexture = null;
      if (binding.parameter != null) {
        gl.activeTexture(gl.TEXTURE0 + location);
        glTexture = gl.getParameter(binding.parameter);
      }
      slots.push({
        glBindingTarget: binding.name,
        glHandleMatchesPlanned: glTexture == null || plannedGpuTexture?.texture == null
          ? null
          : glTexture === plannedGpuTexture.texture,
        glHandlePresent: glTexture != null,
        location,
        pixiBoundSourceUid: pixiBoundSource?.uid ?? null,
        pixiSourceMatchesPlanned: pixiBoundSource?.uid == null || plannedSource?.uid == null
          ? null
          : pixiBoundSource.uid === plannedSource.uid,
        plannedGpuHandlePresent: plannedGpuTexture?.texture != null,
        plannedSourceUid: plannedSource?.uid ?? null,
      });
    }
  } finally {
    if (previousActiveTexture != null) gl.activeTexture(previousActiveTexture);
  }
  return { slots };
}

export function beginPixiBatchBindingCapture(renderer) {
  if (renderer?.name !== "webgl") {
    return makeUnavailableCapture(renderer, `unsupported-renderer:${renderer?.name || "unknown"}`);
  }
  const gl = renderer.gl;
  const adaptor = renderer.renderPipes?.batch?._adaptor;
  if (!gl?.getParameter || !gl?.activeTexture) {
    return makeUnavailableCapture(renderer, "webgl-api-unavailable");
  }
  if (!adaptor || typeof adaptor.execute !== "function") {
    return makeUnavailableCapture(renderer, "batch-adaptor-unavailable");
  }

  const byBatch = new WeakMap();
  const errors = [];
  const hadOwnExecute = Object.prototype.hasOwnProperty.call(adaptor, "execute");
  const originalExecute = adaptor.execute;
  let batchCount = 0;
  let finishedEvidence = null;

  function wrappedExecute(batchPipe, batch) {
    try {
      return originalExecute.call(this, batchPipe, batch);
    } finally {
      if (batch && typeof batch === "object") {
        try {
          byBatch.set(batch, captureGlSlots(renderer, batch));
          batchCount += 1;
        } catch (error) {
          const message = errorText(error);
          errors.push({ batchIndex: batchCount, error: message });
          byBatch.set(batch, { error: message, slots: [] });
          batchCount += 1;
        }
      }
    }
  }

  adaptor.execute = wrappedExecute;

  return {
    finish() {
      if (finishedEvidence) return finishedEvidence;
      if (adaptor.execute === wrappedExecute) {
        if (hadOwnExecute) adaptor.execute = originalExecute;
        else delete adaptor.execute;
      } else {
        errors.push({ batchIndex: null, error: "Pixi batch adaptor changed before probe cleanup" });
      }
      finishedEvidence = {
        available: true,
        batchCount,
        byBatch,
        errors,
        reason: null,
        rendererName: renderer.name,
      };
      return finishedEvidence;
    },
  };
}

export function summarizePixiBatchBindingCapture(evidence) {
  if (!evidence) return null;
  return {
    available: evidence.available === true,
    batchCount: evidence.batchCount ?? 0,
    errors: (evidence.errors || []).map((entry) => ({ ...entry })),
    reason: evidence.reason || null,
    rendererName: evidence.rendererName || null,
  };
}
