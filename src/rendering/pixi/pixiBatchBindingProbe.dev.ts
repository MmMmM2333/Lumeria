interface PixiBatchGpuTextureProbe {
  target?: number | null;
  texture?: unknown;
}

interface PixiBatchTextureSourceProbe {
  _gpuData?: Readonly<Record<number, PixiBatchGpuTextureProbe | null | undefined>>;
  uid?: number | null;
}

interface PixiBatchProbe {
  textures?: {
    count?: number | null;
    textures?: readonly (PixiBatchTextureSourceProbe | null | undefined)[];
  } | null;
}

interface PixiBatchGlProbe {
  ACTIVE_TEXTURE: number;
  TEXTURE0: number;
  TEXTURE_2D: number;
  TEXTURE_2D_ARRAY: number;
  TEXTURE_CUBE_MAP: number;
  TEXTURE_BINDING_2D: number;
  TEXTURE_BINDING_2D_ARRAY: number;
  TEXTURE_BINDING_CUBE_MAP: number;
  activeTexture?(texture: number): void;
  getParameter?(parameter: number): unknown;
}

interface PixiBatchActiveGlProbe extends PixiBatchGlProbe {
  activeTexture(texture: number): void;
  getParameter(parameter: number): unknown;
}

type PixiBatchExecute = (this: unknown, batchPipe: unknown, batch: unknown) => unknown;

interface PixiBatchAdaptorProbe {
  execute?: PixiBatchExecute;
}

export interface PixiBatchProbeRenderer {
  gl?: PixiBatchGlProbe | null;
  name?: string | null;
  renderPipes?: {
    batch?: {
      _adaptor?: PixiBatchAdaptorProbe | null;
    } | null;
  } | null;
  texture?: {
    _boundTextures?: readonly (PixiBatchTextureSourceProbe | null | undefined)[];
  } | null;
  uid?: number;
}

export interface PixiBatchBindingSlotEvidence {
  glBindingTarget?: string;
  glHandleMatchesPlanned: boolean | null;
  glHandlePresent?: boolean;
  location: number;
  pixiBoundSourceUid: number | null;
  pixiSourceMatchesPlanned?: boolean | null;
  plannedGpuHandlePresent?: boolean;
  plannedSourceUid?: number | null;
}

export interface PixiBatchBindingEntryEvidence {
  error?: string;
  slots: PixiBatchBindingSlotEvidence[];
}

export interface PixiBatchBindingError {
  batchIndex: number | null;
  error: string;
}

export interface PixiBatchBindingEvidence {
  available: boolean;
  batchCount: number;
  byBatch: WeakMap<object, PixiBatchBindingEntryEvidence>;
  errors: PixiBatchBindingError[];
  reason: string | null;
  rendererName: string | null | undefined;
}

export interface PixiBatchBindingCapture {
  finish(): PixiBatchBindingEvidence;
}

export interface PixiBatchBindingSummary {
  available: boolean;
  batchCount: number;
  errors: PixiBatchBindingError[];
  reason: string | null;
  rendererName: string | null;
}

function errorText(error: unknown): string {
  return String(
    (error as { message?: unknown } | null)?.message ||
    error ||
    "Unknown Pixi batch binding probe error"
  );
}

function makeUnavailableCapture(
  renderer: PixiBatchProbeRenderer | null | undefined,
  reason: string,
): PixiBatchBindingCapture {
  const evidence: PixiBatchBindingEvidence = {
    available: false,
    batchCount: 0,
    byBatch: new WeakMap(),
    errors: [],
    reason,
    rendererName: renderer?.name || null,
  };
  return { finish: () => evidence };
}

function getGlBindingParameter(
  gl: PixiBatchGlProbe,
  target: number | null | undefined,
): { name: string; parameter: number | null } {
  if (target === gl.TEXTURE_2D) return { name: "texture-2d", parameter: gl.TEXTURE_BINDING_2D };
  if (target === gl.TEXTURE_2D_ARRAY) {
    return { name: "texture-2d-array", parameter: gl.TEXTURE_BINDING_2D_ARRAY };
  }
  if (target === gl.TEXTURE_CUBE_MAP) {
    return { name: "texture-cube-map", parameter: gl.TEXTURE_BINDING_CUBE_MAP };
  }
  return { name: `unknown:${target ?? "null"}`, parameter: null };
}

function captureGlSlots(
  renderer: PixiBatchProbeRenderer,
  batch: PixiBatchProbe,
): PixiBatchBindingEntryEvidence {
  const gl = renderer.gl as PixiBatchActiveGlProbe;
  const textureSystem = renderer.texture;
  const plannedSources = batch?.textures?.textures || [];
  const count = Math.max(0, Number(batch?.textures?.count) || 0);
  const slots = [];
  const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  try {
    for (let location = 0; location < count; location += 1) {
      const plannedSource = plannedSources[location] || null;
      const pixiBoundSource = textureSystem?._boundTextures?.[location] || null;
      const plannedGpuTexture = plannedSource?._gpuData?.[renderer.uid as number] || null;
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
    if (previousActiveTexture != null) gl.activeTexture(previousActiveTexture as number);
  }
  return { slots };
}

export function beginPixiBatchBindingCapture(
  renderer: PixiBatchProbeRenderer | null | undefined,
): PixiBatchBindingCapture {
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

  const byBatch = new WeakMap<object, PixiBatchBindingEntryEvidence>();
  const errors: PixiBatchBindingError[] = [];
  const hadOwnExecute = Object.prototype.hasOwnProperty.call(adaptor, "execute");
  const originalExecute = adaptor.execute;
  let batchCount = 0;
  let finishedEvidence: PixiBatchBindingEvidence | null = null;

  function wrappedExecute(this: unknown, batchPipe: unknown, batch: unknown): unknown {
    try {
      return originalExecute.call(this, batchPipe, batch);
    } finally {
      if (batch && typeof batch === "object") {
        try {
          byBatch.set(batch, captureGlSlots(renderer as PixiBatchProbeRenderer, batch as PixiBatchProbe));
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

export function summarizePixiBatchBindingCapture(
  evidence: PixiBatchBindingEvidence | null | undefined,
): PixiBatchBindingSummary | null {
  if (!evidence) return null;
  return {
    available: evidence.available === true,
    batchCount: evidence.batchCount ?? 0,
    errors: (evidence.errors || []).map((entry) => ({ ...entry })),
    reason: evidence.reason || null,
    rendererName: evidence.rendererName || null,
  };
}
