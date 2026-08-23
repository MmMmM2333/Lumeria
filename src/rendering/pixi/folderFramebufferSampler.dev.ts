import { hashDebugBytes } from "./renderDebugFingerprint.js";

const DEFAULT_MAX_READ_BYTES = 64 * 1024 * 1024;
const MAX_PIXEL_CANDIDATES = 24;
const SAMPLE_GRID_SIZE = 8;
const SAMPLE_CHANGE_THRESHOLD = 8;
const MAX_GL_ERRORS = 16;

interface RectLike {
  height?: unknown;
  left?: unknown;
  top?: unknown;
  width?: unknown;
}

export interface FolderPixelSlotIdentity {
  folderId: string | null;
  folderName: string | null;
  itemId: string | null;
  itemName: string | null;
  sceneSignature: string | null;
  slot: number | null;
}

export interface FolderFramebufferSlotInput {
  clientBounds?: RectLike | null;
  folderId?: string | null;
  folderName?: string | null;
  itemId?: string | null;
  itemName?: string | null;
  sceneSignature?: string | null;
  slot?: number | null;
}

export interface FolderFramebufferRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface FolderFramebufferRegion extends FolderFramebufferRect {
  byteLength: number;
}

export interface FolderPixelSample {
  alphaNonZero?: number;
  alphaSum?: number;
  hash?: string | null;
  height?: number;
  rgbNonZero?: number;
  rgbSum?: number;
  sample?: number[];
  sampleHeight?: number;
  sampleWidth?: number;
  width?: number;
}

export interface FolderFramebufferSampledSlot extends FolderPixelSlotIdentity, Required<FolderPixelSample> {
  framebufferBounds: FolderFramebufferRect;
}

export interface FolderFramebufferSkippedSlot extends FolderPixelSlotIdentity {
  reason: string;
}

export interface FolderFramebufferWarning {
  code: string;
  errors: number[];
}

export interface FolderFramebufferSample {
  available: boolean;
  captureDurationMs: number;
  detail: unknown;
  readPixelsCallCount: number;
  reason: string | null;
  region: FolderFramebufferRegion | null;
  skippedSlots: FolderFramebufferSkippedSlot[];
  slots: FolderFramebufferSampledSlot[];
  warnings: FolderFramebufferWarning[];
}

interface FolderFramebufferGlProbe {
  INVALID_OPERATION?: number;
  NO_ERROR?: number;
  RGBA?: number;
  UNSIGNED_BYTE?: number;
  getError?(): number;
  isContextLost?(): boolean;
  readPixels?(
    x: number,
    y: number,
    width: number,
    height: number,
    format: number | undefined,
    type: number | undefined,
    pixels: Uint8Array,
  ): void;
}

interface FolderFramebufferErrorGlProbe extends FolderFramebufferGlProbe {
  getError(): number;
}

interface FolderFramebufferCanvasProbe {
  getBoundingClientRect?(): RectLike;
  height?: number;
  width?: number;
}

interface FolderFramebufferCaptureOptions {
  app?: {
    canvas?: FolderFramebufferCanvasProbe | null;
    renderer?: {
      gl?: FolderFramebufferGlProbe | null;
      name?: string | null;
    } | null;
  } | null | undefined;
  maxReadBytes?: number | undefined;
  now?: (() => number) | undefined;
  slots?: readonly FolderFramebufferSlotInput[] | undefined;
}

export interface FolderPixelSnapshot {
  framebuffer?: {
    available?: boolean;
    reason?: string | null;
  } | null;
  folders?: readonly {
    children?: readonly {
      itemId?: string | null;
      itemName?: string | null;
      pixel?: FolderPixelSample | null;
      sceneSignature?: string | null;
      slot?: number | null;
    }[];
    folderId?: string | null;
    folderName?: string | null;
  }[];
  phase?: string | null;
}

export interface FolderPixelComparisonCandidate extends FolderPixelSlotIdentity {
  alphaGainAfterRelease: number;
  brightnessGainAfterRelease: number;
  changedSampleRatio: number;
  detailGainAfterRelease: number | null;
  endHash: string | null;
  meanAbsoluteDelta: number;
  meanEndAlpha: number;
  meanStartAlpha: number;
  sceneState: "unchanged";
  startHash: string | null;
  strongCandidate: boolean;
}

export interface FolderPixelComparison {
  available: boolean;
  candidates: FolderPixelComparisonCandidate[];
  changedSlotCount: number;
  comparableSlotCount: number;
  detail: unknown;
  from: string | null;
  reason: string | null;
  skippedSlotCount: number;
  skippedSlots: FolderFramebufferSkippedSlot[];
  strongCandidateCount: number;
  to: string | null;
  truncatedCandidateCount?: number;
}

interface GlErrorDrainResult {
  errors: number[];
  truncated: boolean;
}

interface EligibleFolderFramebufferSlot extends FolderPixelSlotIdentity {
  framebufferBounds: FolderFramebufferRect;
}

interface CollectedSnapshotSlot extends FolderPixelSlotIdentity {
  pixel: FolderPixelSample;
}

interface PixelSampleDifference {
  alphaGainAfterRelease: number;
  brightnessGainAfterRelease: number;
  changedSampleRatio: number;
  detailGainAfterRelease: number | null;
  meanAbsoluteDelta: number;
  meanEndAlpha: number;
  meanStartAlpha: number;
}

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value: unknown, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(readNumber(value) * scale) / scale;
}

function makeUnavailable(reason: string, detail: unknown = null): FolderFramebufferSample {
  return {
    available: false,
    captureDurationMs: 0,
    detail,
    readPixelsCallCount: 0,
    reason,
    region: null,
    skippedSlots: [],
    slots: [],
    warnings: [],
  };
}

function makeSlotIdentity(
  slot: Partial<FolderPixelSlotIdentity> | null | undefined,
): FolderPixelSlotIdentity {
  return {
    folderId: slot?.folderId || null,
    folderName: slot?.folderName || null,
    itemId: slot?.itemId || null,
    itemName: slot?.itemName || null,
    sceneSignature: slot?.sceneSignature || null,
    slot: Number.isInteger(slot?.slot as number) ? slot!.slot! : null,
  };
}

export function makeFolderPixelSlotKey(
  slot: Partial<Pick<FolderPixelSlotIdentity, "folderId" | "itemId" | "slot">> | null | undefined,
): string {
  return `${slot?.folderId || ""}\u0000${slot?.itemId || ""}\u0000${slot?.slot ?? ""}`;
}

function drainGlErrors(gl: FolderFramebufferErrorGlProbe): GlErrorDrainResult {
  const errors: number[] = [];
  const noError = gl.NO_ERROR ?? 0;
  for (let index = 0; index < MAX_GL_ERRORS; index += 1) {
    const error = gl.getError();
    if (error === noError) return { errors, truncated: false };
    errors.push(error);
  }
  return { errors, truncated: true };
}

function toFramebufferRect(
  clientBounds: RectLike | null | undefined,
  canvasRect: RectLike,
  canvasWidth: number,
  canvasHeight: number,
): FolderFramebufferRect | null {
  const clientLeft = readNumber(clientBounds?.left, NaN);
  const clientTop = readNumber(clientBounds?.top, NaN);
  const clientWidth = readNumber(clientBounds?.width, NaN);
  const clientHeight = readNumber(clientBounds?.height, NaN);
  if (![clientLeft, clientTop, clientWidth, clientHeight].every(Number.isFinite) || clientWidth <= 0 || clientHeight <= 0) {
    return null;
  }
  const scaleX = canvasWidth / (canvasRect.width as number);
  const scaleY = canvasHeight / (canvasRect.height as number);
  const rawLeft = Math.floor((clientLeft - (canvasRect.left as number)) * scaleX);
  const rawRight = Math.ceil(((clientLeft + clientWidth) - (canvasRect.left as number)) * scaleX);
  const rawTop = Math.floor((clientTop - (canvasRect.top as number)) * scaleY);
  const rawBottom = Math.ceil(((clientTop + clientHeight) - (canvasRect.top as number)) * scaleY);
  const left = Math.max(0, Math.min(canvasWidth, rawLeft));
  const right = Math.max(0, Math.min(canvasWidth, rawRight));
  const top = Math.max(0, Math.min(canvasHeight, rawTop));
  const bottom = Math.max(0, Math.min(canvasHeight, rawBottom));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  return {
    height,
    width,
    x: left,
    y: canvasHeight - bottom,
  };
}

function makeUnionRect(entries: readonly EligibleFolderFramebufferSlot[]): FolderFramebufferRect {
  const left = Math.min(...entries.map((entry) => entry.framebufferBounds.x));
  const bottom = Math.min(...entries.map((entry) => entry.framebufferBounds.y));
  const right = Math.max(...entries.map((entry) => entry.framebufferBounds.x + entry.framebufferBounds.width));
  const top = Math.max(...entries.map((entry) => entry.framebufferBounds.y + entry.framebufferBounds.height));
  return {
    height: top - bottom,
    width: right - left,
    x: left,
    y: bottom,
  };
}

function readCrop(
  framebuffer: Uint8Array,
  union: FolderFramebufferRect,
  bounds: FolderFramebufferRect,
): Uint8Array {
  const bytes = new Uint8Array(bounds.width * bounds.height * 4);
  const offsetX = bounds.x - union.x;
  const offsetY = bounds.y - union.y;
  for (let row = 0; row < bounds.height; row += 1) {
    const sourceOffset = (((offsetY + row) * union.width) + offsetX) * 4;
    const targetOffset = row * bounds.width * 4;
    bytes.set(framebuffer.subarray(sourceOffset, sourceOffset + (bounds.width * 4)), targetOffset);
  }
  return bytes;
}

function makeGridSample(bytes: Uint8Array, width: number, height: number): number[] {
  const sample: number[] = [];
  for (let gridY = 0; gridY < SAMPLE_GRID_SIZE; gridY += 1) {
    const fromY = Math.floor((gridY * height) / SAMPLE_GRID_SIZE);
    const toY = Math.max(fromY + 1, Math.ceil(((gridY + 1) * height) / SAMPLE_GRID_SIZE));
    for (let gridX = 0; gridX < SAMPLE_GRID_SIZE; gridX += 1) {
      const fromX = Math.floor((gridX * width) / SAMPLE_GRID_SIZE);
      const toX = Math.max(fromX + 1, Math.ceil(((gridX + 1) * width) / SAMPLE_GRID_SIZE));
      let alpha = 0;
      let count = 0;
      let luma = 0;
      for (let y = fromY; y < Math.min(height, toY); y += 1) {
        for (let x = fromX; x < Math.min(width, toX); x += 1) {
          const offset = ((y * width) + x) * 4;
          luma += ((77 * bytes[offset]!) + (150 * bytes[offset + 1]!) + (29 * bytes[offset + 2]!)) >> 8;
          alpha += bytes[offset + 3]!;
          count += 1;
        }
      }
      sample.push(Math.round(luma / Math.max(1, count)), Math.round(alpha / Math.max(1, count)));
    }
  }
  return sample;
}

function summarizeCrop(bytes: Uint8Array, width: number, height: number): Required<FolderPixelSample> {
  let alphaNonZero = 0;
  let alphaSum = 0;
  let rgbNonZero = 0;
  let rgbSum = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    const rgb = bytes[index]! + bytes[index + 1]! + bytes[index + 2]!;
    if (rgb > 0) rgbNonZero += 1;
    if (bytes[index + 3]! > 0) alphaNonZero += 1;
    rgbSum += rgb;
    alphaSum += bytes[index + 3]!;
  }
  return {
    alphaNonZero,
    alphaSum,
    hash: hashDebugBytes(bytes),
    height,
    rgbNonZero,
    rgbSum,
    sample: makeGridSample(bytes, width, height),
    sampleHeight: SAMPLE_GRID_SIZE,
    sampleWidth: SAMPLE_GRID_SIZE,
    width,
  };
}

export function captureFolderFramebufferSample(
  options: FolderFramebufferCaptureOptions = {},
): FolderFramebufferSample {
  const { app } = options;
  const canvas = app?.canvas;
  const renderer = app?.renderer;
  const gl = renderer?.gl;
  if (renderer?.name !== "webgl") return makeUnavailable(`unsupported-renderer:${renderer?.name || "unknown"}`);
  if (typeof gl?.readPixels !== "function") return makeUnavailable("webgl-read-pixels-unavailable");
  if (typeof gl?.getError !== "function") return makeUnavailable("webgl-error-api-unavailable");
  if (typeof gl?.isContextLost !== "function") return makeUnavailable("webgl-context-api-unavailable");
  if (gl.isContextLost()) return makeUnavailable("webgl-context-lost-before-read");
  if (typeof canvas?.getBoundingClientRect !== "function") return makeUnavailable("canvas-bounds-unavailable");
  const canvasWidth = Math.floor(readNumber(canvas.width));
  const canvasHeight = Math.floor(readNumber(canvas.height));
  const canvasRect = canvas.getBoundingClientRect();
  if (canvasWidth <= 0 || canvasHeight <= 0 || readNumber(canvasRect?.width) <= 0 || readNumber(canvasRect?.height) <= 0) {
    return makeUnavailable("canvas-size-unavailable");
  }

  const skippedSlots: FolderFramebufferSkippedSlot[] = [];
  const entries: EligibleFolderFramebufferSlot[] = [];
  for (const slot of options.slots || []) {
    const framebufferBounds = toFramebufferRect(slot?.clientBounds, canvasRect, canvasWidth, canvasHeight);
    if (!framebufferBounds) {
      skippedSlots.push({ ...makeSlotIdentity(slot), reason: "slot-bounds-unavailable" });
      continue;
    }
    entries.push({ ...makeSlotIdentity(slot), framebufferBounds });
  }
  if (!entries.length) {
    return {
      ...makeUnavailable("no-eligible-slots"),
      skippedSlots,
    };
  }

  const region = makeUnionRect(entries);
  const byteLength = region.width * region.height * 4;
  const maxReadBytes = Math.max(1, Math.floor(readNumber(options.maxReadBytes, DEFAULT_MAX_READ_BYTES)));
  if (!Number.isSafeInteger(byteLength) || byteLength > maxReadBytes) {
    return {
      ...makeUnavailable("pixel-capture-too-large", { byteLength, maxReadBytes }),
      region: { ...region, byteLength },
      skippedSlots,
    };
  }

  const now = typeof options.now === "function"
    ? options.now
    : () => globalThis.performance?.now?.() ?? Date.now();
  const startedAt = now();
  const framebuffer = new Uint8Array(byteLength);
  let preReadErrors: GlErrorDrainResult;
  try {
    preReadErrors = drainGlErrors(gl as FolderFramebufferErrorGlProbe);
  } catch (error) {
    return {
      ...makeUnavailable("webgl-error-read-failed", String((error as { message?: unknown } | null)?.message || error)),
      captureDurationMs: round(now() - startedAt),
      region: { ...region, byteLength },
      skippedSlots,
    };
  }
  if (preReadErrors.truncated) {
    return {
      ...makeUnavailable("webgl-error-state-unreadable", { preExistingGlErrors: preReadErrors.errors }),
      captureDurationMs: round(now() - startedAt),
      region: { ...region, byteLength },
      skippedSlots,
    };
  }
  try {
    gl.readPixels(region.x, region.y, region.width, region.height, gl.RGBA, gl.UNSIGNED_BYTE, framebuffer);
  } catch (error) {
    return {
      ...makeUnavailable("pixel-read-failed", {
        error: String((error as { message?: unknown } | null)?.message || error),
        preExistingGlErrors: preReadErrors.errors,
      }),
      captureDurationMs: round(now() - startedAt),
      readPixelsCallCount: 1,
      region: { ...region, byteLength },
      skippedSlots,
    };
  }
  if (gl.isContextLost()) {
    return {
      ...makeUnavailable("webgl-context-lost-during-read", { preExistingGlErrors: preReadErrors.errors }),
      captureDurationMs: round(now() - startedAt),
      readPixelsCallCount: 1,
      region: { ...region, byteLength },
      skippedSlots,
    };
  }
  let postReadErrors: GlErrorDrainResult;
  try {
    postReadErrors = drainGlErrors(gl as FolderFramebufferErrorGlProbe);
  } catch (error) {
    return {
      ...makeUnavailable("webgl-error-read-failed", {
        error: String((error as { message?: unknown } | null)?.message || error),
        preExistingGlErrors: preReadErrors.errors,
      }),
      captureDurationMs: round(now() - startedAt),
      readPixelsCallCount: 1,
      region: { ...region, byteLength },
      skippedSlots,
    };
  }
  if (postReadErrors.errors.length || postReadErrors.truncated) {
    return {
      ...makeUnavailable("pixel-read-gl-error", {
        preExistingGlErrors: preReadErrors.errors,
        readGlErrors: postReadErrors.errors,
        truncated: postReadErrors.truncated,
      }),
      captureDurationMs: round(now() - startedAt),
      readPixelsCallCount: 1,
      region: { ...region, byteLength },
      skippedSlots,
    };
  }

  const sampledSlots = entries.map((entry) => ({
    ...entry,
    ...summarizeCrop(readCrop(framebuffer, region, entry.framebufferBounds), entry.framebufferBounds.width, entry.framebufferBounds.height),
  }));
  return {
    available: true,
    captureDurationMs: round(now() - startedAt),
    detail: null,
    readPixelsCallCount: 1,
    reason: null,
    region: { ...region, byteLength },
    skippedSlots,
    slots: sampledSlots,
    warnings: preReadErrors.errors.length ? [{ code: "pre-existing-gl-error", errors: preReadErrors.errors }] : [],
  };
}

function collectSnapshotSlots(snapshot: FolderPixelSnapshot | null | undefined): CollectedSnapshotSlot[] {
  const slots: CollectedSnapshotSlot[] = [];
  for (const folder of snapshot?.folders || []) {
    for (const child of folder?.children || []) {
      if (!child?.pixel) continue;
      slots.push({
        folderId: folder.folderId || null,
        folderName: folder.folderName || null,
        itemId: child.itemId || null,
        itemName: child.itemName || null,
        pixel: child.pixel,
        sceneSignature: child.sceneSignature || null,
    slot: Number.isInteger(child.slot as number) ? child.slot! : null,
      });
    }
  }
  return slots;
}

function makeComparisonUnavailable(
  startSnapshot: FolderPixelSnapshot | null | undefined,
  endSnapshot: FolderPixelSnapshot | null | undefined,
): FolderPixelComparison {
  return {
    available: false,
    candidates: [],
    changedSlotCount: 0,
    comparableSlotCount: 0,
    detail: {
      endReason: endSnapshot?.framebuffer?.reason || null,
      startReason: startSnapshot?.framebuffer?.reason || null,
    },
    from: startSnapshot?.phase || null,
    reason: "framebuffer-sample-unavailable",
    skippedSlotCount: 0,
    skippedSlots: [],
    strongCandidateCount: 0,
    to: endSnapshot?.phase || null,
  };
}

function makePixelDetailEnergy(pixel: FolderPixelSample | null | undefined): number | null {
  const sample = pixel?.sample;
  const width = Number(pixel?.sampleWidth) || 0;
  const height = Number(pixel?.sampleHeight) || 0;
  if (!Array.isArray(sample) || width <= 0 || height <= 0 || sample.length !== width * height * 2) return null;
  let delta = 0;
  let edgeCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 2;
      if (x + 1 < width) {
        const right = offset + 2;
        delta += Math.abs(sample[offset]! - sample[right]!);
        delta += Math.abs(sample[offset + 1]! - sample[right + 1]!);
        edgeCount += 2;
      }
      if (y + 1 < height) {
        const below = offset + (width * 2);
        delta += Math.abs(sample[offset]! - sample[below]!);
        delta += Math.abs(sample[offset + 1]! - sample[below + 1]!);
        edgeCount += 2;
      }
    }
  }
  return delta / Math.max(1, edgeCount * 255);
}

function comparePixelSamples(
  startPixel: FolderPixelSample,
  endPixel: FolderPixelSample,
): PixelSampleDifference | null {
  const startSample = startPixel?.sample;
  const endSample = endPixel?.sample;
  if (!Array.isArray(startSample) || !Array.isArray(endSample) || startSample.length !== endSample.length || startSample.length === 0) {
    return null;
  }
  if (startPixel.sampleWidth !== endPixel.sampleWidth || startPixel.sampleHeight !== endPixel.sampleHeight) return null;
  let absoluteDelta = 0;
  let alphaDelta = 0;
  let changedCells = 0;
  let endAlpha = 0;
  let endLuma = 0;
  let startAlpha = 0;
  let startLuma = 0;
  const cellCount = startSample.length / 2;
  for (let index = 0; index < startSample.length; index += 2) {
    const lumaDelta = Math.abs(endSample[index]! - startSample[index]!);
    const cellAlphaDelta = Math.abs(endSample[index + 1]! - startSample[index + 1]!);
    if (Math.max(lumaDelta, cellAlphaDelta) >= SAMPLE_CHANGE_THRESHOLD) changedCells += 1;
    absoluteDelta += lumaDelta + cellAlphaDelta;
    alphaDelta += endSample[index + 1]! - startSample[index + 1]!;
    startLuma += startSample[index]!;
    endLuma += endSample[index]!;
    startAlpha += startSample[index + 1]!;
    endAlpha += endSample[index + 1]!;
  }
  const startDetail = makePixelDetailEnergy(startPixel);
  const endDetail = makePixelDetailEnergy(endPixel);
  return {
    alphaGainAfterRelease: round(alphaDelta / Math.max(1, cellCount * 255), 4),
    brightnessGainAfterRelease: round((endLuma - startLuma) / Math.max(1, cellCount * 255), 4),
    changedSampleRatio: round(changedCells / Math.max(1, cellCount), 4),
    detailGainAfterRelease: startDetail == null || endDetail == null ? null : round(endDetail - startDetail, 4),
    meanAbsoluteDelta: round(absoluteDelta / Math.max(1, startSample.length * 255), 4),
    meanEndAlpha: round(endAlpha / Math.max(1, cellCount), 3),
    meanStartAlpha: round(startAlpha / Math.max(1, cellCount), 3),
  };
}

export function compareFolderPixelSnapshots(
  startSnapshot: FolderPixelSnapshot | null | undefined,
  endSnapshot: FolderPixelSnapshot | null | undefined,
): FolderPixelComparison {
  if (startSnapshot?.framebuffer?.available !== true || endSnapshot?.framebuffer?.available !== true) {
    return makeComparisonUnavailable(startSnapshot, endSnapshot);
  }
  const endByKey = new Map(collectSnapshotSlots(endSnapshot).map((slot) => [makeFolderPixelSlotKey(slot), slot]));
  const candidates: FolderPixelComparisonCandidate[] = [];
  const skippedSlots: FolderFramebufferSkippedSlot[] = [];
  let comparableSlotCount = 0;
  for (const startSlot of collectSnapshotSlots(startSnapshot)) {
    const identity = makeSlotIdentity(startSlot);
    const endSlot = endByKey.get(makeFolderPixelSlotKey(startSlot));
    if (!endSlot) {
      skippedSlots.push({ ...identity, reason: "recovery-slot-missing" });
      continue;
    }
    if (!startSlot.sceneSignature || startSlot.sceneSignature !== endSlot.sceneSignature) {
      skippedSlots.push({ ...identity, reason: "scene-state-changed" });
      continue;
    }
    const difference = comparePixelSamples(startSlot.pixel, endSlot.pixel);
    if (!difference) {
      skippedSlots.push({ ...identity, reason: "pixel-sample-incomparable" });
      continue;
    }
    comparableSlotCount += 1;
    if (startSlot.pixel.hash === endSlot.pixel.hash && difference.changedSampleRatio === 0) continue;
    candidates.push({
      ...identity,
      ...difference,
      endHash: endSlot.pixel.hash || null,
      sceneState: "unchanged",
      startHash: startSlot.pixel.hash || null,
      strongCandidate: difference.changedSampleRatio >= 0.25 && difference.meanAbsoluteDelta >= 0.05,
    });
  }
  candidates.sort((left, right) =>
    Number(right.strongCandidate) - Number(left.strongCandidate) ||
    right.meanAbsoluteDelta - left.meanAbsoluteDelta ||
    right.changedSampleRatio - left.changedSampleRatio
  );
  const limitedCandidates = candidates.slice(0, MAX_PIXEL_CANDIDATES);
  return {
    available: true,
    candidates: limitedCandidates,
    changedSlotCount: candidates.length,
    comparableSlotCount,
    detail: null,
    from: startSnapshot?.phase || null,
    reason: null,
    skippedSlotCount: skippedSlots.length,
    skippedSlots,
    strongCandidateCount: candidates.filter((candidate) => candidate.strongCandidate).length,
    to: endSnapshot?.phase || null,
    truncatedCandidateCount: Math.max(0, candidates.length - limitedCandidates.length),
  };
}
