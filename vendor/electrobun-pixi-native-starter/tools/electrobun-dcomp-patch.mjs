import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const patch = join(root, "patches", "electrobun-2.0.1-dcomp-atomic-resize.patch");
const source = resolve(process.argv.at(-1) ?? "");
const apply = process.argv.includes("--apply");
const refresh = process.argv.includes("--refresh");
const expectedCommit = "8d09d15db791f346e419efd452d6759750addb62";

if (!existsSync(join(source, ".git")) || !existsSync(patch)) {
	throw new Error("usage: node tools/electrobun-dcomp-patch.mjs [--apply|--refresh] <electrobun-v2.0.1 checkout>");
}

const runGit = (...args) => spawnSync("git", args, { cwd: source, encoding: "utf8" });
const version = JSON.parse(readFileSync(join(source, "package", "package.json"), "utf8")).version;
const commit = runGit("rev-parse", "HEAD").stdout.trim();
if (version !== "2.0.1" || commit !== expectedCommit) {
	throw new Error(`patch requires Electrobun 2.0.1 at ${expectedCommit}; found ${version} at ${commit}`);
}

if (refresh) {
	// git diff omits untracked additions; never silently drop an existing patch's
	// new native header when refreshing a freshly-applied checkout.
	const header = "package/src/native/win/native_touchpad.h";
	if (existsSync(join(source, header)) && runGit("ls-files", "--error-unmatch", header).status !== 0) {
		throw new Error(`Refresh requires the new header in the diff; run git add -N ${header} in the source checkout`);
	}
	const diff = runGit(
		"diff", "--",
		"package/src/native/win/nativeWrapper.cpp",
    "package/src/native/win/native_touchpad.h",
		"package/src/native/win/dcomp_compositor.h",
		"package/src/sdks/main/proc/native.ts",
		"package/src/sdks/main/webgpuAdapter.ts",
	);
	if (diff.status !== 0 || !diff.stdout.trim()) {
		throw new Error(diff.stderr.trim() || "native DComp source has no patch to refresh");
	}
	writeFileSync(
		patch,
		diff.stdout.replaceAll("\r\n", "\n"),
	);
}

const patchArgs = ["apply", "--check", patch];
const alreadyApplied = runGit("apply", "--reverse", "--check", patch).status === 0;
if (!alreadyApplied) {
	const check = runGit(...patchArgs);
	if (check.status !== 0) throw new Error(check.stderr.trim() || "patch does not apply cleanly");
	if (apply) {
		const result = runGit("apply", patch);
		if (result.status !== 0) throw new Error(result.stderr.trim() || "patch application failed");
	}
}

if (alreadyApplied || apply) {
	const wrapper = readFileSync(join(source, "package", "src", "native", "win", "nativeWrapper.cpp"), "utf8");
	const compositor = readFileSync(join(source, "package", "src", "native", "win", "dcomp_compositor.h"), "utf8");
	const nativeProc = readFileSync(join(source, "package", "src", "sdks", "main", "proc", "native.ts"), "utf8");
	const adapter = readFileSync(join(source, "package", "src", "sdks", "main", "webgpuAdapter.ts"), "utf8");
	for (const marker of [
		"struct DCompSurfaceState",
		"configureGeneration",
		"surfaceState->pending == bridge",
		"writeDCompSurfaceOutdated",
		"g_dcompSurfacesByHwnd",
		"boundSurface",
		"releaseDCompStateForHwnd",
		"WGPUViewWindowProc",
		"WS_EX_NOREDIRECTIONBITMAP",
		"A resize gets a fresh pending swap chain",
    "wgpuDeviceMaxTextureDimension2D",
    "wgpuSurfaceSetPresentExtent",
    "g_retainedPresentExtents",
    "SetSourceSize",
    "SetMatrixTransform",
    "wgpuWindowSetBackgroundVisual",
	]) {
		if (!wrapper.includes(marker)) throw new Error(`patched wrapper is missing ${marker}`);
	}
	if (wrapper.includes("resizeAttachedSwapChain = true")) {
		throw new Error("patched wrapper can still resize the active swap chain in place");
	}
	for (const marker of [
		"g_dawnConfiguredSurfaces",
		"wgpuSurfaceUnconfigureMainThread",
		"configureDawnSurface",
		"unconfigureDawnSurface",
	]) {
		if (!wrapper.includes(marker)) throw new Error(`patched wrapper is missing ${marker}`);
	}
	for (const marker of [
		"scaleActiveTo",
    "setBackgroundVisual",
		"promoteSwapChain",
		"stageSwapChain",
		"waitForCommitCompletion",
		"promoteStagedSwapChain",
		"activeSwapChain",
		"SetWindowSubclass",
		"WM_NCDESTROY",
	]) {
		if (!compositor.includes(marker)) throw new Error(`patched compositor is missing ${marker}`);
	}
	if (compositor.includes("zeroCopyPresent") || compositor.includes("presentOnly")) {
		throw new Error("patched compositor retains obsolete present helpers");
	}
	for (const marker of ["wgpuSurfaceUnconfigureMainThread", "surfaceUnconfigure:"]) {
		if (!nativeProc.includes(marker)) throw new Error(`patched native FFI is missing ${marker}`);
	}
	if (!adapter.includes("WGPUBridge.surfaceUnconfigure")
		|| adapter.includes("WGPUNative.symbols.wgpuSurfaceUnconfigure")) {
		throw new Error("patched adapter does not route unconfigure through the native surface state");
	}
	const initialPromotion = compositor.slice(
		compositor.indexOf("bool promoteSwapChain"),
		compositor.indexOf("// May block until DWM"),
	);
	if (initialPromotion.includes("WaitForCommitCompletion")) {
		throw new Error("patched compositor can block the Win32 UI thread during promotion");
	}
	const present = wrapper.slice(
		wrapper.indexOf("ELECTROBUN_EXPORT int32_t wgpuSurfacePresentMainThread"),
		wrapper.indexOf("ELECTROBUN_EXPORT uint64_t wgpuQueueOnSubmittedWorkDoneShim"),
	);
	const stage = present.indexOf("stageSwapChain(");
	const wait = present.indexOf("waitForCommitCompletion(");
	const promote = present.indexOf("promoteStagedSwapChain(");
	if (stage < 0 || wait <= stage || promote <= wait) {
		throw new Error("patched wrapper is missing ordered two-phase DComp promotion");
	}
	const whitespace = runGit(
		"diff", "--check", "--",
		"package/src/native/win/nativeWrapper.cpp",
		"package/src/native/win/dcomp_compositor.h",
		"package/src/sdks/main/proc/native.ts",
		"package/src/sdks/main/webgpuAdapter.ts",
	);
	if (whitespace.status !== 0) throw new Error(whitespace.stdout.trim() || whitespace.stderr.trim());
}

console.log(alreadyApplied ? "Electrobun DComp patch verified" : apply ? "Electrobun DComp patch applied" : "Electrobun DComp patch applies cleanly");
