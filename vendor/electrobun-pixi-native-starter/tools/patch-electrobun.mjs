import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyBunRuntimePin } from "./bun-runtime-pin.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const consumerRootIndex = process.argv.indexOf("--consumer-root");
if (consumerRootIndex >= 0 && !process.argv[consumerRootIndex + 1]) {
	throw new Error("--consumer-root requires a project directory");
}
const dependencyRoot = consumerRootIndex >= 0 ? resolve(process.argv[consumerRootIndex + 1]) : root;
const selectedDevkit = process.env.HUTCH_ELECTROBUN_DEVKIT_ROOT
	? resolve(process.env.HUTCH_ELECTROBUN_DEVKIT_ROOT)
	: join(root, ".hutch", "devkit-dcomp-2.0.1");
const adapterPath = join(selectedDevkit, "api", "sdks", "main", "webgpuAdapter.ts");
const checkOnly = process.argv.includes("--check");
const bunVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).electrobunPixiStarter?.bunVersion;
const electrobunVersion = JSON.parse(readFileSync(join(dependencyRoot, "node_modules", "electrobun", "package.json"), "utf8")).version;
const pixiVersion = JSON.parse(readFileSync(join(dependencyRoot, "node_modules", "pixi.js", "package.json"), "utf8")).version;

if (electrobunVersion !== "2.0.1") {
	throw new Error(`Electrobun adapter patch supports 2.0.1, found ${electrobunVersion}`);
}
if (pixiVersion !== "8.20.1") {
	throw new Error(`PixiJS BindGroup patch supports 8.20.1, found ${pixiVersion}`);
}

if (!existsSync(adapterPath)) {
	if (process.env.HUTCH_ELECTROBUN_DEVKIT_ROOT) {
		throw new Error(`Selected Electrobun devkit has no WebGPU adapter: ${adapterPath}`);
	}
	if (checkOnly) throw new Error("Electrobun SDK has not been materialized; run npm run prepare:electrobun");
	const cli = join(root, "node_modules", "electrobun", "bin", "electrobun.cjs");
	const result = spawnSync(process.execPath, [cli, "build", "--env=dev"], { cwd: root, stdio: "inherit" });
	if (result.status !== 0 || !existsSync(adapterPath)) {
		throw new Error("Electrobun SDK materialization failed");
	}
}

verifyBunRuntimePin(selectedDevkit, bunVersion, { apply: !checkOnly && consumerRootIndex < 0 });
console.log(`Bun runtime pin verified: ${bunVersion}`);

const surfaceAcquireBefore = [
	"\t\tconst surfaceTexture = makeSurfaceTexture();",
	"\t\tWGPUBridge.surfaceGetCurrentTexture(",
	"\t\t\tthis.surfacePtr as any,",
	"\t\t\tsurfaceTexture.ptr as any,",
	"\t\t);",
	"\t\tconst status = surfaceTexture.view.getUint32(16, true);",
	"\t\tconst texPtr = Number(surfaceTexture.view.getBigUint64(8, true));",
	"\t\tif (status !== 1 && status !== 2) {",
	"\t\t\tif (texPtr) WGPUNative.symbols.wgpuTextureRelease(texPtr);",
	"\t\t\tthrow new Error(`Surface status ${status}`);",
	"\t\t}",
	"\t\tif (!texPtr) throw new Error(\"WebGPU surface returned a null texture\");",
	"\t\tthis._currentTexture = new GPUTexture(texPtr, this.format, this);",
	"\t\tPRESENTATION_STATE.markPending(this);",
	"\t\treturn this._currentTexture;",
].join("\n");
const surfaceAcquireOutdatedPatch = [
	"\t\tfor (let attempt = 0; attempt < 2; attempt += 1) {",
	"\t\t\tconst surfaceTexture = makeSurfaceTexture();",
	"\t\t\tWGPUBridge.surfaceGetCurrentTexture(",
	"\t\t\t\tthis.surfacePtr as any,",
	"\t\t\t\tsurfaceTexture.ptr as any,",
	"\t\t\t);",
	"\t\t\tconst status = surfaceTexture.view.getUint32(16, true);",
	"\t\t\tconst texPtr = Number(surfaceTexture.view.getBigUint64(8, true));",
	"\t\t\tif (status === 4 && attempt === 0) {",
	"\t\t\t\tif (texPtr) WGPUNative.symbols.wgpuTextureRelease(texPtr);",
	"\t\t\t\tthis.reconfigure();",
	"\t\t\t\tcontinue;",
	"\t\t\t}",
	"\t\t\tif (status !== 1 && status !== 2) {",
	"\t\t\t\tif (texPtr) WGPUNative.symbols.wgpuTextureRelease(texPtr);",
	"\t\t\t\tthrow Object.assign(new Error(`Surface status ${status}`), { surfaceStatus: status });",
	"\t\t\t}",
	"\t\t\tif (!texPtr) {",
	"\t\t\t\tthrow Object.assign(new Error(\"WebGPU surface returned a null texture\"), { surfaceStatus: status });",
	"\t\t\t}",
	"\t\t\tthis._currentTexture = new GPUTexture(texPtr, this.format, this);",
	"\t\t\tPRESENTATION_STATE.markPending(this);",
	"\t\t\treturn this._currentTexture;",
	"\t\t}",
].join("\n");
const surfaceAcquireSuboptimalPatch = surfaceAcquireOutdatedPatch.replace(
	"\t\t\tthis._currentTexture = new GPUTexture(texPtr, this.format, this);",
	"\t\t\tif (status === 2) this._suboptimalReconfigurePending = true;\n\t\t\tthis._currentTexture = new GPUTexture(texPtr, this.format, this);",
);
const surfaceAcquirePatch = surfaceAcquireOutdatedPatch.replace(
	"\t\t\tthis._currentTexture = new GPUTexture(texPtr, this.format, this);",
	"\t\t\tthis._lastPresentStatus = status;\n\t\t\tthis._currentTexture = new GPUTexture(texPtr, this.format, this);",
);
const surfaceAcquireDeferredPatch = [
	"\t\tconst surfaceTexture = makeSurfaceTexture();",
	"\t\tWGPUBridge.surfaceGetCurrentTexture(",
	"\t\t\tthis.surfacePtr as any,",
	"\t\t\tsurfaceTexture.ptr as any,",
	"\t\t);",
	"\t\tconst status = surfaceTexture.view.getUint32(16, true);",
	"\t\tconst texPtr = Number(surfaceTexture.view.getBigUint64(8, true));",
	"\t\tif (status !== 1 && status !== 2) {",
	"\t\t\tif (texPtr) WGPUNative.symbols.wgpuTextureRelease(texPtr);",
	"\t\t\tthrow Object.assign(new Error(`Surface status ${status}`), { surfaceStatus: status });",
	"\t\t}",
	"\t\tif (!texPtr) {",
	"\t\t\tthrow Object.assign(new Error(\"WebGPU surface returned a null texture\"), { surfaceStatus: status });",
	"\t\t}",
	"\t\tthis._lastPresentStatus = status;",
	"\t\tthis._currentTexture = new GPUTexture(texPtr, this.format, this);",
	"\t\tPRESENTATION_STATE.markPending(this);",
	"\t\treturn this._currentTexture;",
].join("\n");
const surfaceAcquirePreludeBefore = [
	"\tgetCurrentTexture() {",
	"\t\tthis._assertConfigured();",
	"\t\tif (",
	"\t\t\tthis.devicePtr &&",
	"\t\t\tthis._fallbackSize &&",
	"\t\t\t(this.width !== this._fallbackSize.width ||",
	"\t\t\t\tthis.height !== this._fallbackSize.height)",
	"\t\t) {",
	"\t\t\tthis.width = this._fallbackSize.width;",
	"\t\t\tthis.height = this._fallbackSize.height;",
	"\t\t\tthis._configureSurface();",
	"\t\t}",
	"\t\tif (PRESENTATION_STATE.isPending(this) && this._currentTexture?.ptr) {",
	"\t\t\treturn this._currentTexture;",
	"\t\t}",
	"\t\tPRESENTATION_STATE.takePending(this);",
	"\t\tthis._releaseCurrentTexture();",
].join("\n");
const surfaceAcquirePreludeSuboptimalPatch = [
	"\tgetCurrentTexture() {",
	"\t\tthis._assertConfigured();",
	"\t\tif (PRESENTATION_STATE.isPending(this) && this._currentTexture?.ptr) {",
	"\t\t\treturn this._currentTexture;",
	"\t\t}",
	"\t\tif (this._suboptimalReconfigurePending) {",
	"\t\t\tconst now = Date.now();",
	"\t\t\tif (now - this._lastSuboptimalReconfigure >= 5_000) {",
	"\t\t\t\tthis.reconfigure();",
	"\t\t\t\tthis._lastSuboptimalReconfigure = now;",
	"\t\t\t}",
	"\t\t}",
	"\t\tif (",
	"\t\t\tthis.devicePtr &&",
	"\t\t\tthis._fallbackSize &&",
	"\t\t\t(this.width !== this._fallbackSize.width ||",
	"\t\t\t\tthis.height !== this._fallbackSize.height)",
	"\t\t) {",
	"\t\t\tthis.width = this._fallbackSize.width;",
	"\t\t\tthis.height = this._fallbackSize.height;",
	"\t\t\tthis._configureSurface();",
	"\t\t}",
	"\t\tPRESENTATION_STATE.takePending(this);",
	"\t\tthis._releaseCurrentTexture();",
].join("\n");
const surfaceAcquirePreludePatch = [
	"\tgetCurrentTexture() {",
	"\t\tthis._assertConfigured();",
	"\t\tif (PRESENTATION_STATE.isPending(this) && this._currentTexture?.ptr) {",
	"\t\t\treturn this._currentTexture;",
	"\t\t}",
	"\t\tif (",
	"\t\t\tthis.devicePtr &&",
	"\t\t\tthis._fallbackSize &&",
	"\t\t\t(this.width !== this._fallbackSize.width ||",
	"\t\t\t\tthis.height !== this._fallbackSize.height)",
	"\t\t) {",
	"\t\t\tthis.width = this._fallbackSize.width;",
	"\t\t\tthis.height = this._fallbackSize.height;",
	"\t\t\tthis._configureSurface();",
	"\t\t}",
	"\t\tPRESENTATION_STATE.takePending(this);",
	"\t\tthis._releaseCurrentTexture();",
].join("\n");

const patches = [
	[
		"WGPUNative.symbols.wgpuRenderPassEncoderSetBindGroup(\n\t\t\tthis.ptr,\n\t\t\tindex,",
		"WGPUNative.symbols.wgpuRenderPassEncoderSetBindGroup(\n\t\t\tthis.ptr,\n\t\t\tindex >>> 0,",
		"WGPUNative.symbols.wgpuRenderPassEncoderSetBindGroup(\n\t\t\tthis.ptr,\n\t\t\tindex >>> 0,",
	],
	[
		"WGPUNative.symbols.wgpuComputePassEncoderSetBindGroup(\n\t\t\tthis.ptr,\n\t\t\tindex,",
		"WGPUNative.symbols.wgpuComputePassEncoderSetBindGroup(\n\t\t\tthis.ptr,\n\t\t\tindex >>> 0,",
		"WGPUNative.symbols.wgpuComputePassEncoderSetBindGroup(\n\t\t\tthis.ptr,\n\t\t\tindex >>> 0,",
	],
	[
		"const WGPUPresentMode_Fifo = 0x00000001;",
		"const WGPUPresentMode_Fifo = 0x00000001;\nconst WGPUPresentMode_Mailbox = 0x00000004;",
		"const WGPUPresentMode_Mailbox = 0x00000004;",
	],
	[
		"const WGPUBlendOperation_Add = 0x00000001;\nconst WGPUBlendFactor_One = 0x00000002;",
		"const WGPUBlendOperation_Add = 0x00000001;\nconst WGPUStencilOperation_Keep = 0x00000001;\nconst WGPUBlendFactor_One = 0x00000002;",
		"const WGPUStencilOperation_Keep = 0x00000001;",
	],
	[
		"\tdepthCompare?: number;\n\tstencilReadMask?: number;",
		"\tdepthCompare?: number;\n\tstencilFront?: {\n\t\tcompare?: number;\n\t\tfailOp?: number;\n\t\tdepthFailOp?: number;\n\t\tpassOp?: number;\n\t};\n\tstencilBack?: {\n\t\tcompare?: number;\n\t\tfailOp?: number;\n\t\tdepthFailOp?: number;\n\t\tpassOp?: number;\n\t};\n\tstencilReadMask?: number;",
		"\tstencilFront?: {",
	],
	[
		"\twriteU32(view, 20, 0); // stencilFront.compare\n\twriteU32(view, 24, 0); // stencilFront.failOp\n\twriteU32(view, 28, 0); // stencilFront.depthFailOp\n\twriteU32(view, 32, 0); // stencilFront.passOp\n\twriteU32(view, 36, 0); // stencilBack.compare\n\twriteU32(view, 40, 0); // stencilBack.failOp\n\twriteU32(view, 44, 0); // stencilBack.depthFailOp\n\twriteU32(view, 48, 0); // stencilBack.passOp",
		"\twriteU32(view, 20, options?.stencilFront?.compare ?? WGPUCompareFunction_Always);\n\twriteU32(view, 24, options?.stencilFront?.failOp ?? WGPUStencilOperation_Keep);\n\twriteU32(view, 28, options?.stencilFront?.depthFailOp ?? WGPUStencilOperation_Keep);\n\twriteU32(view, 32, options?.stencilFront?.passOp ?? WGPUStencilOperation_Keep);\n\twriteU32(view, 36, options?.stencilBack?.compare ?? WGPUCompareFunction_Always);\n\twriteU32(view, 40, options?.stencilBack?.failOp ?? WGPUStencilOperation_Keep);\n\twriteU32(view, 44, options?.stencilBack?.depthFailOp ?? WGPUStencilOperation_Keep);\n\twriteU32(view, 48, options?.stencilBack?.passOp ?? WGPUStencilOperation_Keep);",
		"options?.stencilFront?.compare ?? WGPUCompareFunction_Always",
	],
	[
		"\t\tif (descriptor.depthStencil) {\n\t\t\tconst depth = makeDepthStencilState({",
		"\t\tif (descriptor.depthStencil) {\n\t\t\tconst mapStencilFace = (face?: any) => face ? {\n\t\t\t\tcompare: mapCompareFunction(face.compare),\n\t\t\t\tfailOp: mapStencilOperation(face.failOp),\n\t\t\t\tdepthFailOp: mapStencilOperation(face.depthFailOp),\n\t\t\t\tpassOp: mapStencilOperation(face.passOp),\n\t\t\t} : undefined;\n\t\t\tconst depth = makeDepthStencilState({",
		"const mapStencilFace = (face?: any)",
	],
	[
		"\t\t\t\tdepthCompare: mapCompareFunction(descriptor.depthStencil.depthCompare),\n\t\t\t\tstencilReadMask:",
		"\t\t\t\tdepthCompare: mapCompareFunction(descriptor.depthStencil.depthCompare),\n\t\t\t\tstencilFront: mapStencilFace(descriptor.depthStencil.stencilFront),\n\t\t\t\tstencilBack: mapStencilFace(descriptor.depthStencil.stencilBack),\n\t\t\t\tstencilReadMask:",
		"stencilFront: mapStencilFace(descriptor.depthStencil.stencilFront)",
	],
	[
		"function mapIndexFormat(format?: string | number | null) {",
		"function mapStencilOperation(operation?: string | number | null) {\n\tif (typeof operation === \"number\") return operation;\n\tswitch (operation) {\n\t\tcase \"zero\": return 0x00000002;\n\t\tcase \"replace\": return 0x00000003;\n\t\tcase \"invert\": return 0x00000004;\n\t\tcase \"increment-clamp\": return 0x00000005;\n\t\tcase \"decrement-clamp\": return 0x00000006;\n\t\tcase \"increment-wrap\": return 0x00000007;\n\t\tcase \"decrement-wrap\": return 0x00000008;\n\t\tcase \"keep\":\n\t\tdefault:\n\t\t\treturn WGPUStencilOperation_Keep;\n\t}\n}\n\nfunction mapIndexFormat(format?: string | number | null) {",
		"function mapStencilOperation(operation?: string | number | null)",
	],
	[
		"\t\t\tWGPUBridge.createAdapterDeviceMainThread(\n\t\t\t\tthis.instancePtr as any,\n\t\t\t\tthis.surfacePtr as any,\n\t\t\t\tptr(adapterDevice),\n\t\t\t);",
		"\t\t\tconst nativeFactory = (globalThis as any).__electrobunCreateAdapterDevice;\n\t\t\tif (nativeFactory) {\n\t\t\t\tnativeFactory(this.instancePtr, this.surfacePtr, adapterDevice);\n\t\t\t} else {\n\t\t\t\tWGPUBridge.createAdapterDeviceMainThread(\n\t\t\t\t\tthis.instancePtr as any,\n\t\t\t\t\tthis.surfacePtr as any,\n\t\t\t\t\tptr(adapterDevice),\n\t\t\t\t);\n\t\t\t}",
		"const nativeFactory = (globalThis as any).__electrobunCreateAdapterDevice;",
	],
	[
		[
			"\tprivate _currentTexture: GPUTexture | null = null;\n\tprivate _suboptimalReconfigurePending = false;\n\tprivate _lastSuboptimalReconfigure = 0;\n\tprivate readonly _adapters = new Set<GPUAdapter>();",
			"\tprivate _currentTexture: GPUTexture | null = null;\n\tprivate readonly _adapters = new Set<GPUAdapter>();",
		],
		"\tprivate _currentTexture: GPUTexture | null = null;\n\tprivate _lastPresentStatus: number | null = null;\n\tprivate readonly _adapters = new Set<GPUAdapter>();",
		"\tprivate _lastPresentStatus: number | null = null;",
	],
	[
		"\t\tthis._configured = true;\n\t}\n\tgetCurrentTexture() {",
		"\t\tthis._configured = true;\n\t}\n\treconfigure() {\n\t\tthis._configureSurface();\n\t}\n\tgetCurrentTexture() {",
		"\treconfigure() {",
	],
	[
		"\treconfigure() {\n\t\tthis._configureSurface();\n\t}\n\tgetCurrentTexture() {",
		"\treconfigure() {\n\t\tif (this._fallbackSize) {\n\t\t\tthis.width = this._fallbackSize.width;\n\t\t\tthis.height = this._fallbackSize.height;\n\t\t}\n\t\tthis._configureSurface();\n\t}\n\tgetCurrentTexture() {",
		"\treconfigure() {\n\t\tif (this._fallbackSize) {\n\t\t\tthis.width = this._fallbackSize.width;\n\t\t\tthis.height = this._fallbackSize.height;\n\t\t}\n\t\tthis._configureSurface();\n\t}\n\tgetCurrentTexture() {",
	],
	[
		[
			"\t\tWGPUBridge.surfaceConfigure(this.surfacePtr as any, config.ptr as any);\n\t\tthis._configured = true;\n\t\tthis._suboptimalReconfigurePending = false;\n\t}\n\treconfigure() {",
			"\t\tWGPUBridge.surfaceConfigure(this.surfacePtr as any, config.ptr as any);\n\t\tthis._configured = true;\n\t}\n\treconfigure() {",
		],
		"\t\tWGPUBridge.surfaceConfigure(this.surfacePtr as any, config.ptr as any);\n\t\tthis._configured = true;\n\t\tthis._lastPresentStatus = null;\n\t}\n\treconfigure() {",
		"\t\tthis._configured = true;\n\t\tthis._lastPresentStatus = null;\n\t}\n\treconfigure() {",
	],
	[[surfaceAcquirePreludeSuboptimalPatch, surfaceAcquirePreludeBefore], surfaceAcquirePreludePatch, surfaceAcquirePreludePatch],
	[
		[surfaceAcquireBefore, surfaceAcquireOutdatedPatch, surfaceAcquireSuboptimalPatch, surfaceAcquirePatch],
		surfaceAcquireOutdatedPatch,
		surfaceAcquireDeferredPatch,
	],
	[[surfaceAcquireSuboptimalPatch, surfaceAcquireOutdatedPatch], surfaceAcquirePatch, surfaceAcquireDeferredPatch],
	[
		[surfaceAcquirePatch, surfaceAcquireSuboptimalPatch, surfaceAcquireOutdatedPatch],
		surfaceAcquireDeferredPatch,
		surfaceAcquireDeferredPatch,
	],
	[
		"\t_presentNative() {\n\t\tthis._assertConfigured();\n\t\tconst surfacePtr = this.surfacePtr;\n\t\ttry {\n\t\t\treturn WGPUBridge.surfacePresent(surfacePtr as any);\n\t\t} finally {\n\t\t\tthis._releaseCurrentTexture();\n\t\t}\n\t}\n\t_onQueueReleased(queue: GPUQueue) {",
		"\t_presentNative() {\n\t\tthis._assertConfigured();\n\t\tconst surfacePtr = this.surfacePtr;\n\t\ttry {\n\t\t\tconst status = WGPUBridge.surfacePresent(surfacePtr as any);\n\t\t\tthis._lastPresentStatus = status === 1 && this._lastPresentStatus === 2 ? 2 : status;\n\t\t\treturn status;\n\t\t} finally {\n\t\t\tthis._releaseCurrentTexture();\n\t\t}\n\t}\n\tconsumePresentStatus() {\n\t\tconst status = this._lastPresentStatus;\n\t\tthis._lastPresentStatus = null;\n\t\treturn status;\n\t}\n\t_onQueueReleased(queue: GPUQueue) {",
		"\tconsumePresentStatus() {",
	],
];

let source = readFileSync(adapterPath, "utf8").replaceAll("\r\n", "\n");
let changed = false;
const presentModeLine = "writeU32(view, 60, (globalThis as any).__electrobunPresentMode ?? WGPUPresentMode_Fifo);";
if (!source.includes(presentModeLine)) {
	if (checkOnly) throw new Error("Electrobun WebGPU present-mode patch is not applied");
	const previous = ["WGPUPresentMode_Fifo", "WGPUPresentMode_Mailbox"]
		.map((mode) => `writeU32(view, 60, ${mode});`)
		.find((line) => source.includes(line));
	if (!previous) throw new Error("Electrobun WebGPU present-mode adapter changed; refusing an unsafe patch");
	source = source.replace(previous, presentModeLine);
	changed = true;
}

for (const [before, after, present] of patches) {
	if (source.includes(present)) continue;
	if (checkOnly) throw new Error("Electrobun WebGPU adapter patch is not applied");
	const anchors = Array.isArray(before) ? before : [before];
	const anchor = anchors.find((candidate) => source.includes(candidate));
	if (!anchor) throw new Error("Electrobun WebGPU adapter changed; refusing an unsafe patch");
	source = source.replace(anchor, after);
	changed = true;
}

for (const marker of [
	"private _lastPresentStatus: number | null = null;",
	"this._lastPresentStatus = status;",
	"this._lastPresentStatus = status === 1 && this._lastPresentStatus === 2 ? 2 : status;",
	"consumePresentStatus() {",
]) {
	if (!source.includes(marker)) throw new Error(`Electrobun WebGPU present status patch is missing: ${marker}`);
}
if (source.includes("_suboptimalReconfigurePending") || source.includes("_lastSuboptimalReconfigure")) {
	throw new Error("Electrobun WebGPU adapter retains duplicate suboptimal throttling");
}
if (source.includes("if (status === 4 && attempt === 0)")) {
	throw new Error("Electrobun WebGPU adapter reconfigures inside getCurrentTexture");
}

if (source.split("function mapStencilOperation").length !== 2) {
	throw new Error("Electrobun WebGPU stencil patch is duplicated or incomplete");
}

if (changed) writeFileSync(adapterPath, source);
console.log(`Electrobun WebGPU adapter patch ${changed ? "applied" : "verified"}`);

const patchPixiBindGroups = (extension, baseClass) => {
	const path = join(dependencyRoot, "node_modules", "pixi.js", "lib", "rendering", "batcher", "gpu", "getTextureBatchBindGroup." + extension);
	let pixiSource = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
	let pixiChanged = false;
	const cacheDeclaration = "const cachedGroups = {};";
	const lifecycleClass = [
		cacheDeclaration,
		`class TextureBatchBindGroup extends ${baseClass} {`,
		"  constructor(resources, cacheKey) {",
		"    super(resources);",
		"    this._cacheKey = cacheKey;",
		"  }",
		"  destroy() {",
		"    if (cachedGroups[this._cacheKey] === this) delete cachedGroups[this._cacheKey];",
		"    super.destroy();",
		"  }",
		"  onResourceChange(resource) {",
		"    if (!resource.destroyed) {",
		"      super.onResourceChange(resource);",
		"      return;",
		"    }",
		"    this.destroy();",
		"  }",
		"}",
	].join("\n");
	if (!pixiSource.includes("  destroy() {")) {
		if (checkOnly) throw new Error(`PixiJS ${extension} BindGroup lifecycle patch is not applied`);
		if (pixiSource.includes("class TextureBatchBindGroup extends")) {
			const classEnd = pixiSource.indexOf("\n}\n", pixiSource.indexOf("class TextureBatchBindGroup extends")) + 2;
			if (classEnd < 2) throw new Error(`PixiJS ${extension} BindGroup lifecycle class changed; refusing an unsafe patch`);
			pixiSource = pixiSource.slice(0, pixiSource.indexOf(cacheDeclaration)) + lifecycleClass + pixiSource.slice(classEnd);
		} else {
			if (!pixiSource.includes(cacheDeclaration)) throw new Error(`PixiJS ${extension} batch cache changed; refusing an unsafe patch`);
			pixiSource = pixiSource.replace(cacheDeclaration, lifecycleClass);
		}
		pixiChanged = true;
	}
	const originalConstructor = `const bindGroup = new ${baseClass}(bindGroupResources);`;
	const patchedConstructor = "const bindGroup = new TextureBatchBindGroup(bindGroupResources, key);";
	if (!pixiSource.includes(patchedConstructor)) {
		if (checkOnly) throw new Error(`PixiJS ${extension} BindGroup constructor patch is not applied`);
		if (!pixiSource.includes(originalConstructor)) throw new Error(`PixiJS ${extension} BindGroup constructor changed; refusing an unsafe patch`);
		pixiSource = pixiSource.replace(originalConstructor, patchedConstructor);
		pixiChanged = true;
	}
	if (pixiSource.split("class TextureBatchBindGroup extends").length !== 2) {
		throw new Error(`PixiJS ${extension} BindGroup lifecycle patch is duplicated or incomplete`);
	}
	if (pixiChanged) writeFileSync(path, pixiSource);
	return pixiChanged;
};

const pixiMjsChanged = patchPixiBindGroups("mjs", "BindGroup");
const pixiJsChanged = patchPixiBindGroups("js", "BindGroup.BindGroup");
const pixiChanged = pixiMjsChanged || pixiJsChanged;
console.log(`PixiJS texture BindGroup lifecycle patch ${pixiChanged ? "applied" : "verified"}`);

const nativeFramePath = join(root, ".hutch", "native-frame", "native-frame.dll");
const nativeFrameSource = join(root, "src", "platform", "native-frame.rs");
if (!checkOnly && consumerRootIndex < 0) {
	mkdirSync(dirname(nativeFramePath), { recursive: true });
	const result = spawnSync("rustc", [
		"--crate-type", "cdylib",
		nativeFrameSource,
		"-C", "opt-level=3",
		"-C", "link-arg=/Brepro",
		"-o", nativeFramePath,
	], { cwd: root, stdio: "inherit" });
	if (result.status !== 0 || !existsSync(nativeFramePath)) {
		throw new Error("Native frame bridge build failed; install Rust and retry");
	}
}
