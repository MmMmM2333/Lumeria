import { createDemo } from "./demo/demo";
import { createNativePixiApplication, type NativeGpuPreference, type NativeResizeMode } from "./native-host";

const integer = (name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER) => {
	const value = Number(process.env[name] ?? fallback);
	if (!Number.isInteger(value) || value < 0 || value > maximum) {
		throw new Error(`${name} must be an integer between 0 and ${maximum}`);
	}
	return value;
};

const bunnyCount = integer("PIXI_BUNNYMARK_COUNT", 0);
const fastBundleSmokeBatches = integer("PIXI_FAST_BUNDLE_SMOKE", 0, 32);
if (bunnyCount && fastBundleSmokeBatches) {
	throw new Error("PIXI_FAST_BUNDLE_SMOKE and PIXI_BUNNYMARK_COUNT are mutually exclusive");
}

const maxFps = Number(process.env.PIXI_MAX_FPS ?? (bunnyCount ? 0 : 60));
if (!Number.isFinite(maxFps) || maxFps < 0) {
	throw new Error("PIXI_MAX_FPS must be a non-negative number; use 0 for unlimited");
}
const resizeMode = (process.env.PIXI_RESIZE_MODE ?? "smooth").toLowerCase() as NativeResizeMode;
if (!(["smooth", "live", "adaptive"] as const).includes(resizeMode)) {
	throw new Error("PIXI_RESIZE_MODE must be smooth, live, or adaptive");
}
const gpuPreference = (process.env.PIXI_GPU ?? "default").toLowerCase() as NativeGpuPreference;
if (!(["default", "integrated", "discrete"] as const).includes(gpuPreference)) {
	throw new Error("PIXI_GPU must be default, integrated, or discrete");
}
const fpsHudScale = Number(process.env.PIXI_BUNNYMARK_HUD_SCALE ?? 2);
if (!Number.isFinite(fpsHudScale) || fpsHudScale < 0.5 || fpsHudScale > 4) {
	throw new Error("PIXI_BUNNYMARK_HUD_SCALE must be between 0.5 and 4");
}

const title = bunnyCount
	? `PixiJS BunnyMark · Native WebGPU · ${bunnyCount.toLocaleString()}`
	: `PixiJS · Native WebGPU · No WebView${fastBundleSmokeBatches ? ` · ${fastBundleSmokeBatches} bundles` : ""}`;
const app = await createNativePixiApplication({
	title,
	width: 900,
	height: 600,
	background: 0x090b14,
	antialias: !bunnyCount,
	maxFps,
	resizeMode,
	gpuPreference,
	presentationMode: bunnyCount ? "mailbox" : "fifo",
});
try {
	if (process.env.PIXI_PRESENTED_SMOKE === "1") {
		await (await import("./runtime/presented-smoke")).runPresentedSmoke(app);
	} else {
		await createDemo(app, { bunnyCount, fastBundleSmokeBatches, fpsHudScale });
	}
} catch (error) {
	await app.dispose();
	throw error;
}
