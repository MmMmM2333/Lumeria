import { WGPU } from "electrobun/main";
import { ptr } from "bun:ffi";

const blendFactors: Record<string, number> = {
	zero: 1,
	one: 2,
	src: 3,
	"one-minus-src": 4,
	"src-alpha": 5,
	"one-minus-src-alpha": 6,
	dst: 7,
	"one-minus-dst": 8,
	"dst-alpha": 9,
	"one-minus-dst-alpha": 10,
	"src-alpha-saturated": 11,
	constant: 12,
	"one-minus-constant": 13,
};

const blendOperations: Record<string, number> = {
	add: 1,
	subtract: 2,
	"reverse-subtract": 3,
	min: 4,
	max: 5,
};

const vertexFormats: Record<string, number> = {
	uint8: 1, uint8x2: 2, uint8x4: 3,
	sint8: 4, sint8x2: 5, sint8x4: 6,
	unorm8: 7, unorm8x2: 8, unorm8x4: 9,
	snorm8: 10, snorm8x2: 11, snorm8x4: 12,
	uint16: 13, uint16x2: 14, uint16x4: 15,
	sint16: 16, sint16x2: 17, sint16x4: 18,
	unorm16: 19, unorm16x2: 20, unorm16x4: 21,
	snorm16: 22, snorm16x2: 23, snorm16x4: 24,
	float16: 25, float16x2: 26, float16x4: 27,
	float32: 28, float32x2: 29, float32x3: 30, float32x4: 31,
	uint32: 32, uint32x2: 33, uint32x3: 34, uint32x4: 35,
	sint32: 36, sint32x2: 37, sint32x3: 38, sint32x4: 39,
	"unorm10-10-10-2": 40,
	"unorm8x4-bgra": 41,
};

const textureFormats: Record<string, number> = {
	r8unorm: 1, r8snorm: 2, r8uint: 3, r8sint: 4,
	r16unorm: 5, r16snorm: 6, r16uint: 7, r16sint: 8, r16float: 9,
	rg8unorm: 10, rg8snorm: 11, rg8uint: 12, rg8sint: 13,
	r32float: 14, r32uint: 15, r32sint: 16,
	rg16unorm: 17, rg16snorm: 18, rg16uint: 19, rg16sint: 20, rg16float: 21,
	rgba8unorm: 22, "rgba8unorm-srgb": 23, rgba8snorm: 24, rgba8uint: 25, rgba8sint: 26,
	bgra8unorm: 27, "bgra8unorm-srgb": 28,
	rgb10a2uint: 29, rgb10a2unorm: 30, rg11b10ufloat: 31, rgb9e5ufloat: 32,
	rg32float: 33, rg32uint: 34, rg32sint: 35,
	rgba16unorm: 36, rgba16snorm: 37, rgba16uint: 38, rgba16sint: 39, rgba16float: 40,
	rgba32float: 41, rgba32uint: 42, rgba32sint: 43,
	stencil8: 44, depth16unorm: 45, depth24plus: 46,
	"depth24plus-stencil8": 47, depth32float: 48, "depth32float-stencil8": 49,
};

const writePtr = (view: DataView, offset: number, value: number) =>
	view.setBigUint64(offset, BigInt(value), true);

const textureCopyInfo = (texture: any, mipLevel = 0, origin: any = {}) => {
	const buffer = new ArrayBuffer(32);
	const view = new DataView(buffer);
	writePtr(view, 0, texture.ptr);
	view.setUint32(8, mipLevel, true);
	view.setUint32(12, origin.x ?? 0, true);
	view.setUint32(16, origin.y ?? 0, true);
	view.setUint32(20, origin.z ?? 0, true);
	return buffer;
};

const extent3D = (size: any) => {
	const buffer = new ArrayBuffer(12);
	const view = new DataView(buffer);
	view.setUint32(0, size.width, true);
	view.setUint32(4, size.height, true);
	view.setUint32(8, size.depthOrArrayLayers ?? 1, true);
	return buffer;
};

const bufferCopyInfo = (destination: any) => {
	const buffer = new ArrayBuffer(24);
	const view = new DataView(buffer);
	view.setBigUint64(0, BigInt(destination.offset ?? 0), true);
	view.setUint32(8, destination.bytesPerRow ?? 0, true);
	view.setUint32(12, destination.rowsPerImage ?? 0, true);
	writePtr(view, 16, destination.buffer.ptr);
	return buffer;
};

const mapValue = (value: unknown, values: Record<string, number>, kind = "WebGPU value") => {
	if (typeof value !== "string") return value;
	const mapped = values[value];
	if (mapped === undefined) throw new Error(`Unsupported ${kind}: ${value}`);
	return mapped;
};

const patchBlendComponent = (component: any) => {
	if (!component) return;
	component.srcFactor = mapValue(component.srcFactor, blendFactors, "blend factor");
	component.dstFactor = mapValue(component.dstFactor, blendFactors, "blend factor");
	component.operation = mapValue(component.operation, blendOperations, "blend operation");
};

/** Adds only the WebGPU calls Pixi uses but Electrobun 2.0.1 does not expose. */
export function patchElectrobunWebGPUDevice(device: any) {
	if (device.__pixiCompat) return;
	device.__pixiCompat = true;
	let resolveLost: (info: unknown) => void = () => {};
	device.lost ??= new Promise((resolve) => { resolveLost = resolve; });
	device.__pixiResolveLost = (info: unknown) => resolveLost(info);
	device.__pixiDispatchUncapturedError = (error: Error) => {
		const event = { error };
		device.onuncapturederror?.(event);
		for (const listener of [...device._uncapturedErrorListeners]) listener(event);
	};
	device.removeEventListener ??= (type: string, handler: (event: any) => void) => {
		if (type !== "uncapturederror") return;
		const index = device._uncapturedErrorListeners.indexOf(handler);
		if (index >= 0) device._uncapturedErrorListeners.splice(index, 1);
	};

	const writeBuffer = device.queue.writeBuffer.bind(device.queue);
	device.queue.writeBuffer = (
		buffer: any,
		bufferOffset: number,
		data: ArrayBuffer | ArrayBufferView,
		dataOffset = 0,
		size?: number,
	) => {
		if (!dataOffset && size === undefined) return writeBuffer(buffer, bufferOffset, data);
		const source = ArrayBuffer.isView(data) ? data : null;
		const bytesPerElement = (source as any)?.BYTES_PER_ELEMENT ?? 1;
		const byteOffset = (source?.byteOffset ?? 0) + dataOffset * bytesPerElement;
		const available = data.byteLength - dataOffset * bytesPerElement;
		const byteLength = size === undefined ? available : size * bytesPerElement;
		return writeBuffer(
			buffer,
			bufferOffset,
			new Uint8Array((source ? source.buffer : data) as ArrayBufferLike, byteOffset, byteLength),
		);
	};

	device.createRenderBundleEncoder ??= (descriptor: any) => {
		const symbols = WGPU.native.symbols as any;
		const colorFormats = new Uint32Array(
			(descriptor.colorFormats ?? []).map((format: unknown) =>
				mapValue(format, textureFormats, "render bundle color format")),
		);
		const data = new ArrayBuffer(56);
		const view = new DataView(data);
		view.setBigUint64(24, BigInt(colorFormats.length), true);
		writePtr(view, 32, colorFormats.length ? Number(ptr(colorFormats)) : 0);
		view.setUint32(
			40,
			Number(mapValue(descriptor.depthStencilFormat ?? 0, textureFormats, "render bundle depth format")),
			true,
		);
		view.setUint32(44, descriptor.sampleCount ?? 1, true);
		view.setUint32(48, descriptor.depthReadOnly ? 1 : 0, true);
		view.setUint32(52, descriptor.stencilReadOnly ? 1 : 0, true);

		let encoderPtr = Number(symbols.wgpuDeviceCreateRenderBundleEncoder(device.ptr, ptr(data)));
		if (!encoderPtr) throw new Error("Failed to create WebGPU render bundle encoder");
		const assertLive = () => {
			if (!encoderPtr) throw new Error("WebGPU render bundle encoder has been released");
		};
		return {
			get ptr() { return encoderPtr; },
			setPipeline(pipeline: any) {
				assertLive();
				symbols.wgpuRenderBundleEncoderSetPipeline(encoderPtr, pipeline.ptr);
			},
			setBindGroup(index: number, bindGroup: any, offsets?: number[]) {
				assertLive();
				const values = offsets?.length ? new Uint32Array(offsets) : null;
				symbols.wgpuRenderBundleEncoderSetBindGroup(
					encoderPtr,
					index,
					bindGroup.ptr,
					BigInt(values?.length ?? 0),
					values ? ptr(values) : 0,
				);
			},
			setVertexBuffer(slot: number, buffer: any, offset = 0, size = buffer.size) {
				assertLive();
				symbols.wgpuRenderBundleEncoderSetVertexBuffer(
					encoderPtr, slot, buffer.ptr, BigInt(offset), BigInt(size),
				);
			},
			setIndexBuffer(buffer: any, format: string | number, offset = 0, size = buffer.size) {
				assertLive();
				const indexFormat = typeof format === "number" ? format : format === "uint16" ? 1 : format === "uint32" ? 2 : 0;
				symbols.wgpuRenderBundleEncoderSetIndexBuffer(
					encoderPtr, buffer.ptr, indexFormat, BigInt(offset), BigInt(size),
				);
			},
			draw(vertexCount: number, instanceCount = 1, firstVertex = 0, firstInstance = 0) {
				assertLive();
				symbols.wgpuRenderBundleEncoderDraw(
					encoderPtr, vertexCount, instanceCount, firstVertex, firstInstance,
				);
			},
			drawIndexed(indexCount: number, instanceCount = 1, firstIndex = 0, baseVertex = 0, firstInstance = 0) {
				assertLive();
				symbols.wgpuRenderBundleEncoderDrawIndexed(
					encoderPtr, indexCount, instanceCount, firstIndex, baseVertex, firstInstance,
				);
			},
			drawIndirect(buffer: any, offset = 0) {
				assertLive();
				symbols.wgpuRenderBundleEncoderDrawIndirect(encoderPtr, buffer.ptr, BigInt(offset));
			},
			drawIndexedIndirect(buffer: any, offset = 0) {
				assertLive();
				symbols.wgpuRenderBundleEncoderDrawIndexedIndirect(encoderPtr, buffer.ptr, BigInt(offset));
			},
			finish() {
				assertLive();
				const finishedEncoder = encoderPtr;
				encoderPtr = 0;
				let bundlePtr = 0;
				try {
					bundlePtr = Number(symbols.wgpuRenderBundleEncoderFinish(finishedEncoder, 0));
				} finally {
					symbols.wgpuRenderBundleEncoderRelease(finishedEncoder);
				}
				if (!bundlePtr) throw new Error("Failed to finish WebGPU render bundle");
				return {
					ptr: bundlePtr,
					destroy() {
						if (!this.ptr) return;
						symbols.wgpuRenderBundleRelease(this.ptr);
						this.ptr = 0;
					},
				};
			},
		};
	};

	const createRenderPipeline = device.createRenderPipeline.bind(device);
	device.createRenderPipeline = (descriptor: any) => {
		for (const buffer of descriptor.vertex?.buffers ?? []) {
			for (const attribute of buffer?.attributes ?? []) {
				attribute.format = mapValue(attribute.format, vertexFormats, "vertex format");
			}
		}
		for (const target of descriptor.fragment?.targets ?? []) {
			target.format = mapValue(target.format, textureFormats, "texture format");
			patchBlendComponent(target?.blend?.color);
			patchBlendComponent(target?.blend?.alpha);
		}
		if (descriptor.depthStencil) {
			descriptor.depthStencil.format = mapValue(
				descriptor.depthStencil.format,
				textureFormats,
				"depth/stencil texture format",
			);
		}
		return createRenderPipeline(descriptor);
	};

	const createTexture = device.createTexture.bind(device);
	device.createTexture = (descriptor: any) => {
		descriptor.format = mapValue(descriptor.format, textureFormats, "texture format");
		if (descriptor.dimension && descriptor.dimension !== "2d") {
			throw new Error(`Electrobun 2.0.1 only supports 2d textures, got ${descriptor.dimension}`);
		}
		const texture = createTexture(descriptor);
		const size = descriptor.size;
		Object.assign(texture, {
			width: size.width,
			height: size.height,
			depthOrArrayLayers: size.depthOrArrayLayers ?? 1,
			mipLevelCount: descriptor.mipLevelCount ?? 1,
			sampleCount: descriptor.sampleCount ?? 1,
			dimension: descriptor.dimension ?? "2d",
			usage: descriptor.usage,
		});
		return texture;
	};

	const createCommandEncoder = device.createCommandEncoder.bind(device);
	device.createCommandEncoder = (...args: any[]) => {
		const encoder = createCommandEncoder(...args);

		encoder.copyTextureToTexture ??= (source: any, destination: any, size: any) => {
			const sourceInfo = textureCopyInfo(source.texture, source.mipLevel, source.origin);
			const destinationInfo = textureCopyInfo(destination.texture, destination.mipLevel, destination.origin);
			const extent = extent3D(size);
			WGPU.native.symbols.wgpuCommandEncoderCopyTextureToTexture(
				encoder.ptr,
				ptr(sourceInfo),
				ptr(destinationInfo),
				ptr(extent),
			);
		};

		encoder.copyTextureToBuffer ??= (source: any, destination: any, size: any) => {
			const sourceInfo = textureCopyInfo(source.texture, source.mipLevel, source.origin);
			const destinationInfo = bufferCopyInfo(destination);
			const extent = extent3D(size);
			WGPU.native.symbols.wgpuCommandEncoderCopyTextureToBuffer(
				encoder.ptr,
				ptr(sourceInfo),
				ptr(destinationInfo),
				ptr(extent),
			);
		};

		encoder.copyBufferToTexture = (source: any, destination: any, size: any) => {
			const sourceInfo = bufferCopyInfo(source);
			const destinationInfo = textureCopyInfo(destination.texture, destination.mipLevel, destination.origin);
			const extent = extent3D(size);
			WGPU.native.symbols.wgpuCommandEncoderCopyBufferToTexture(
				encoder.ptr,
				ptr(sourceInfo),
				ptr(destinationInfo),
				ptr(extent),
			);
		};

		const beginRenderPass = encoder.beginRenderPass.bind(encoder);
		encoder.beginRenderPass = (descriptor: any) => {
			for (const attachment of descriptor.colorAttachments) {
				const color = attachment?.clearValue;
				if (Array.isArray(color)) {
					attachment.clearValue = { r: color[0], g: color[1], b: color[2], a: color[3] };
				}
			}
			const pass = beginRenderPass(descriptor);
			pass.executeBundles ??= (bundles: any[]) => {
				const symbols = WGPU.native.symbols as any;
				const values = new BigUint64Array(bundles.length);
				for (let i = 0; i < bundles.length; i++) values[i] = BigInt(bundles[i].ptr);
				symbols.wgpuRenderPassEncoderExecuteBundles(
					pass.ptr,
					BigInt(values.length),
					values.length ? ptr(values) : 0,
				);
			};
			pass.setStencilReference ??= (reference: number) =>
				WGPU.native.symbols.wgpuRenderPassEncoderSetStencilReference(pass.ptr, reference);
			pass.drawIndirect ??= (buffer: any, offset = 0) =>
				WGPU.native.symbols.wgpuRenderPassEncoderDrawIndirect(pass.ptr, buffer.ptr, BigInt(offset));
			pass.drawIndexedIndirect ??= (buffer: any, offset = 0) =>
				WGPU.native.symbols.wgpuRenderPassEncoderDrawIndexedIndirect(pass.ptr, buffer.ptr, BigInt(offset));
			const setBindGroup = pass.setBindGroup.bind(pass);
			pass.setBindGroup = (index: number, bindGroup: any, offsets?: number[]) => {
				if (!offsets?.length) return setBindGroup(index, bindGroup);
				const values = new Uint32Array(offsets);
				WGPU.native.symbols.wgpuRenderPassEncoderSetBindGroup(
					pass.ptr,
					index,
					bindGroup.ptr,
					BigInt(values.length),
					ptr(values),
				);
			};
			return pass;
		};

		const beginComputePass = encoder.beginComputePass.bind(encoder);
		encoder.beginComputePass = (...passArgs: any[]) => {
			const pass = beginComputePass(...passArgs);
			pass.dispatchWorkgroupsIndirect ??= (buffer: any, offset = 0) =>
				WGPU.native.symbols.wgpuComputePassEncoderDispatchWorkgroupsIndirect(
					pass.ptr,
					buffer.ptr,
					BigInt(offset),
				);
			const setBindGroup = pass.setBindGroup.bind(pass);
			pass.setBindGroup = (index: number, bindGroup: any, offsets?: number[]) => {
				if (!offsets?.length) return setBindGroup(index, bindGroup);
				const values = new Uint32Array(offsets);
				WGPU.native.symbols.wgpuComputePassEncoderSetBindGroup(
					pass.ptr,
					index,
					bindGroup.ptr,
					BigInt(values.length),
					ptr(values),
				);
			};
			return pass;
		};

		return encoder;
	};
}

/** One-pixel round trip that fails fast if either texture-copy wrapper has the wrong ABI. */
export async function verifyElectrobunWebGPUCopies(device: any) {
	const pixel = new Uint8Array([0x21, 0x43, 0x65, 0xff]);
	const textureOptions = {
		size: { width: 1, height: 1 },
		format: "rgba8unorm",
		usage: 3, // COPY_SRC | COPY_DST
	};
	const source = device.createTexture(textureOptions);
	const destination = device.createTexture(textureOptions);
	const upload = device.createBuffer({ size: 256, usage: 12 }); // COPY_SRC | COPY_DST
	const readback = device.createBuffer({ size: 256, usage: 9 }); // MAP_READ | COPY_DST
	try {
		const uploadRow = new Uint8Array(256);
		uploadRow.set(pixel);
		device.queue.writeBuffer(upload, 0, uploadRow);
		const encoder = device.createCommandEncoder();
		encoder.copyBufferToTexture(
			{ buffer: upload, bytesPerRow: 256, rowsPerImage: 1 },
			{ texture: source },
			{ width: 1, height: 1 },
		);
		encoder.copyTextureToTexture({ texture: source }, { texture: destination }, { width: 1, height: 1 });
		encoder.copyTextureToBuffer(
			{ texture: destination },
			{ buffer: readback, bytesPerRow: 256, rowsPerImage: 1 },
			{ width: 1, height: 1 },
		);
		device.queue.submit([encoder.finish()]);
		const output = new Uint8Array(256);
		if (await readback.readbackAsync(output) !== 1) throw new Error("WebGPU readback failed");
		const result = output.subarray(0, 4);
		if (!pixel.every((value, index) => result[index] === value)) {
			throw new Error(`WebGPU texture copy mismatch: ${[...result].join(",")}`);
		}
	} finally {
		source.destroy();
		destination.destroy();
		upload.destroy();
		readback.destroy();
	}
}

export type NativePixelData = {
	pixels: Uint8ClampedArray;
	width: number;
	height: number;
};

/** Reads an RGBA/BGRA 8-bit texture without creating a Canvas or ImageBitmap. */
export async function readElectrobunWebGPUTexture(
	device: any,
	texture: any,
	width: number,
	height: number,
	unpremultiplyAlpha = true,
): Promise<NativePixelData> {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
		throw new Error(`Invalid WebGPU readback size: ${width}x${height}`);
	}
	const format = texture.format;
	if (![22, 23, 27, 28].includes(format)) {
		throw new Error(`Native pixel extraction only supports RGBA8/BGRA8 textures, got format ${format}`);
	}
	const rowBytes = width * 4;
	const bytesPerRow = Math.ceil(rowBytes / 256) * 256;
	const staging = device.createBuffer({ size: bytesPerRow * height, usage: 9 }); // MAP_READ | COPY_DST
	try {
		const encoder = device.createCommandEncoder();
		encoder.copyTextureToBuffer(
			{ texture },
			{ buffer: staging, bytesPerRow, rowsPerImage: height },
			{ width, height },
		);
		device.queue.submit([encoder.finish()]);
		const padded = new Uint8Array(bytesPerRow * height);
		if (await staging.readbackAsync(padded) !== 1) throw new Error("WebGPU texture readback failed");
		const pixels = new Uint8ClampedArray(rowBytes * height);
		const bgra = format === 27 || format === 28;
		for (let y = 0; y < height; y++) {
			const sourceRow = padded.subarray(y * bytesPerRow, y * bytesPerRow + rowBytes);
			pixels.set(sourceRow, y * rowBytes);
		}
		for (let offset = 0; offset < pixels.length; offset += 4) {
			if (bgra) {
				const red = pixels[offset];
				pixels[offset] = pixels[offset + 2];
				pixels[offset + 2] = red;
			}
			const alpha = pixels[offset + 3];
			if (unpremultiplyAlpha && alpha > 0 && alpha < 255) {
				pixels[offset] = Math.min(255, Math.round((pixels[offset] * 255) / alpha));
				pixels[offset + 1] = Math.min(255, Math.round((pixels[offset + 1] * 255) / alpha));
				pixels[offset + 2] = Math.min(255, Math.round((pixels[offset + 2] * 255) / alpha));
			}
		}
		return { pixels, width, height };
	} finally {
		staging.destroy();
	}
}
