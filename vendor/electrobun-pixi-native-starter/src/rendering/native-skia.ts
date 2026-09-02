import { GlobalFonts, Image, ImageData, createCanvas, loadImage } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import {
	BufferImageSource,
	DOMAdapter,
	ExtensionType,
	createTexture,
	extensions,
	getResolutionOfUrl,
} from "pixi.js";
import type { NativePixelData } from "./electrobun-webgpu-compat";

const Canvas2D = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d")).constructor;

function makeCanvas(width = 1, height = 1) {
	const canvas = createCanvas(width, height);
	const getContext = canvas.getContext.bind(canvas);
	// Pixi probes WebGL even for a forced WebGPU renderer. Skia only exposes 2D.
	(canvas as any).getContext = (type: string, options?: unknown) => type === "2d"
		? getContext("2d", options as any)
		: null;
	return canvas;
}

function premultiply(pixels: Uint8ClampedArray) {
	for (let i = 0; i < pixels.length; i += 4) {
		const alpha = pixels[i + 3];
		if (alpha === 255) continue;
		pixels[i] = Math.round(pixels[i] * alpha / 255);
		pixels[i + 1] = Math.round(pixels[i + 1] * alpha / 255);
		pixels[i + 2] = Math.round(pixels[i + 2] * alpha / 255);
	}
}

const nativeCanvasUploader = {
	extension: { type: ExtensionType.TextureUploaderWebGPU, name: "image" },
	upload(source: any, gpuTexture: GPUTexture, gpu: any, originZOverride = 0) {
		const canvas = source.resource;
		if (!canvas?.getContext) return;
		const width = Math.min(gpuTexture.width, canvas.width);
		const height = Math.min(gpuTexture.height, canvas.height);
		const pixels = canvas.getContext("2d").getImageData(0, 0, width, height).data;
		if (source.alphaMode === "premultiply-alpha-on-upload") premultiply(pixels);
		gpu.device.queue.writeTexture(
			{ texture: gpuTexture, origin: { x: 0, y: 0, z: originZOverride } },
			pixels,
			{ offset: 0, rowsPerImage: height, bytesPerRow: width * 4 },
			{ width, height, depthOrArrayLayers: 1 },
		);
	},
};

const nativeImageLoader = {
	name: "nativeSkiaTexture",
	id: "native-skia-texture",
	extension: { type: ExtensionType.LoadParser, priority: 3, name: "nativeSkiaTexture" },
	test(url: string, asset: any) {
		if (asset?.data?.parseAsGraphicsContext) return false;
		return /^data:image\/(?:png|jpe?g|webp|avif|svg\+xml)[;,]/i.test(url)
			|| /\.(?:png|jpe?g|webp|avif|svg)(?:[?#]|$)/i.test(url);
	},
	async load(url: string, asset: any, loader: any) {
		const image = await loadImage(url.startsWith("file:") ? fileURLToPath(url) : url);
		const canvas = makeCanvas(image.width, image.height);
		const context = canvas.getContext("2d");
		context.drawImage(image, 0, 0);
		const resolution = asset.data?.resolution || getResolutionOfUrl(url);
		const source = new BufferImageSource({
			...asset.data,
			resource: new Uint8Array(context.getImageData(0, 0, image.width, image.height).data),
			width: image.width / resolution,
			height: image.height / resolution,
			resolution,
			format: "rgba8unorm",
			alphaMode: "no-premultiply-alpha",
		});
		return createTexture(source, loader, url);
	},
	unload(texture: any) {
		texture.destroy(true);
	},
};

export function installNativeSkia() {
	if (!("OffscreenCanvas" in globalThis)) {
		(globalThis as any).OffscreenCanvas = class NativeOffscreenCanvas {
			constructor(width: number, height: number) {
				return makeCanvas(width, height);
			}
		};
	}
	const adapter = DOMAdapter.get();
	DOMAdapter.set({
		...adapter,
		createCanvas: makeCanvas as any,
		createImage: () => new Image() as any,
		getCanvasRenderingContext2D: () => Canvas2D as any,
		getNavigator: () => ({ userAgent: "Electrobun/Cottontail", gpu: null }),
		getBaseUrl: () => new URL(".", import.meta.url).href,
		getFontFaceSet: () => null,
		fetch: (url, options) => fetch(url, options),
	});
	extensions.add(nativeCanvasUploader, nativeImageLoader);
}

export function registerNativeFont(path: string, family?: string) {
	const key = GlobalFonts.registerFromPath(path, family);
	if (!key) throw new Error(`Skia could not register font: ${path}`);
	return key;
}

export function registerNativeFontData(data: Uint8Array, family?: string) {
	const key = GlobalFonts.register(Buffer.from(data), family);
	if (!key) throw new Error("Skia could not register the supplied font data");
	return key;
}

export function pixelsToSkiaCanvas({ pixels, width, height }: NativePixelData) {
	const canvas = makeCanvas(width, height);
	canvas.getContext("2d").putImageData(
		new ImageData(new Uint8ClampedArray(pixels), width, height),
		0,
		0,
	);
	return canvas;
}
