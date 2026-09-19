import { createCanvas, loadImage } from "@napi-rs/canvas";
import { extensions, ExtensionType, TextureSource, type Container, type WebGPURenderer } from "pixi.js";

export async function decodeIconPixels(encoded: Buffer | string) {
  const image = await loadImage(encoded);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  if (!(pixels.buffer instanceof ArrayBuffer)) throw new Error("Native image pixels require an ArrayBuffer");
  return { width: image.width, height: image.height,
    pixels: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength) };
}

/** Retains the immutable encoded image, independently of the original file. */
export class NativeRecoverableIconSource extends TextureSource<Uint8Array<ArrayBuffer>> {
  override uploadMethodId = "native-recoverable-icon";
  #encoded: Buffer | string | null;
  #restoring: Promise<void> | null = null;
  constructor(encoded: Buffer | string, decoded: Awaited<ReturnType<typeof decodeIconPixels>>) {
    // TextureSource retains its constructor options; never put the RGBA buffer
    // there, or clearing resource would leave a second strong reference alive.
    super({ width: decoded.width, height: decoded.height,
      alphaMode: "no-premultiply-alpha", autoGenerateMipmaps: true, format: "rgba8unorm" });
    this.resource = decoded.pixels;
    this.#encoded = encoded;
  }
  get retainedEncodedBytes(): number {
    return typeof this.#encoded === "string" ? this.#encoded.length * 2 : this.#encoded?.byteLength ?? 0;
  }
  get retainedPixelBytes(): number { return this.resource?.byteLength ?? 0; }
  restorePixels(): Promise<void> {
    if (this.destroyed || this.retainedPixelBytes) return Promise.resolve();
    if (this.#restoring) return this.#restoring;
    const encoded = this.#encoded;
    if (!encoded) return Promise.reject(new Error("Icon recovery snapshot is unavailable"));
    this.#restoring = decodeIconPixels(encoded).then(decoded => {
      if (this.destroyed) return;
      if (decoded.width !== this.pixelWidth || decoded.height !== this.pixelHeight) throw new Error("Icon recovery dimensions changed");
      this.resource = decoded.pixels;
    }).finally(() => { this.#restoring = null; });
    return this.#restoring;
  }
  override destroy(): void { this.#encoded = null; super.destroy(); }
}

export const nativeIconUploader = {
  extension: { type: ExtensionType.TextureUploaderWebGPU, name: "native-recoverable-icon" },
  upload(source: NativeRecoverableIconSource, texture: GPUTexture,
    gpu: { device: { queue: Pick<GPUQueue, "writeTexture"> } }, originZ = 0): void {
    const pixels = source.resource;
    if (!pixels?.byteLength) throw new Error("Icon pixels must be prepared before GPU upload");
    gpu.device.queue.writeTexture({ texture, origin: { x: 0, y: 0, z: originZ } }, pixels,
      { offset: 0, rowsPerImage: source.pixelHeight, bytesPerRow: source.pixelWidth * 4 },
      { width: source.pixelWidth, height: source.pixelHeight, depthOrArrayLayers: 1 });
    // The native queue copies the input before writeTexture returns.
    source.resource = new Uint8Array(0);
  },
};

// NativeMain imports this module before constructing its renderer.
extensions.add(nativeIconUploader);

/** Pixi 8.20.1 GC clears per-renderer GPU data without emitting source unload. */
export function prepareNativeIconTextures(stage: Container, renderer: Pick<WebGPURenderer, "uid">): void | Promise<void> {
  const missing = new Set<NativeRecoverableIconSource>();
  const visit = (node: Container): void => {
    if(!node.visible||!node.renderable)return;
    const source = (node as Container & { texture?: { source: TextureSource } }).texture?.source;
    if (source instanceof NativeRecoverableIconSource && !source.destroyed && !source.retainedPixelBytes) {
      const data = source._gpuData[renderer.uid];
      if (!data || !("gpuTexture" in data) || !data.gpuTexture) {
        // GC can remove GPU data without changing the source resource id. Notify
        // Pixi's texture/batch bindings before rebuilding, just like explicit unload.
        source.unload();
        missing.add(source);
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(stage);
  if (!missing.size) return;
  const queue = [...missing]; let index = 0;
  return Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (index < queue.length) await queue[index++]!.restorePixels();
  })).then(() => {});
}
