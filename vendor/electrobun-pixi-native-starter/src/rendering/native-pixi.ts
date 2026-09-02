import { DOMAdapter, Texture } from "pixi.js";
import { readElectrobunWebGPUTexture, type NativePixelData } from "./electrobun-webgpu-compat";
import { pixelsToSkiaCanvas } from "./native-skia";

const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" } as const;

/** Installs an async Extract implementation backed by GPU readback and an offscreen Skia canvas. */
export function installNativeExtract(renderer: any) {
	const extract = renderer.extract as any;
	extract.pixels = async (input: any): Promise<NativePixelData> => {
		const options = extract._normalizeOptions(input);
		const target = options.target;
		const generated = !(target instanceof Texture);
		const texture = target instanceof Texture
			? target
			: renderer.textureGenerator.generateTexture(options);
		try {
			await renderer.gpu.device.queue.onSubmittedWorkDone();
			const source = texture.source;
			return await readElectrobunWebGPUTexture(
				renderer.gpu.device,
				renderer.texture.getGpuSource(source),
				source.pixelWidth,
				source.pixelHeight,
				source.alphaMode !== "no-premultiply-alpha",
			);
		} finally {
			if (generated) texture.destroy(true);
		}
	};
	extract.canvas = async (input: any) => pixelsToSkiaCanvas(await extract.pixels(input));
	extract.base64 = async (input: any) => {
		const options = extract._normalizeOptions(input, { format: "png", quality: 1 });
		return (await extract.canvas(options)).toDataURL(mime[options.format as keyof typeof mime] ?? mime.png, options.quality);
	};
	extract.image = async (input: any) => {
		const image = DOMAdapter.get().createImage() as any;
		image.src = await extract.base64(input);
		await image.decode?.();
		return image;
	};
	extract.download = async (input: any) => {
		const options = extract._normalizeOptions(input, { filename: "image.png" });
		await Bun.write(options.filename, await (await extract.canvas(options)).encode("png"));
	};
	extract.log = async (input: any) => {
		const canvas = await extract.canvas(input);
		console.log(`[Pixi Texture] ${canvas.width}px ${canvas.height}px (native Skia canvas)`);
	};
}
