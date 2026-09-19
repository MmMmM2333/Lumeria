import { webgpu, type GpuWindow } from "../platform/electrobun-sdk";
import {
	enableWGPUKeyEvents,
	enableWGPUPointerEvents,
	enableWindowTextEvents,
	ffi,
  WGPUBridge,
} from "../../.hutch/devkit-dcomp-2.0.1/api/sdks/main/proc/native";
import { releaseWebgpuContext } from "../../.hutch/devkit-dcomp-2.0.1/api/sdks/main/webgpuContextRegistry";
import { getWebgpuContextKey } from "../../.hutch/devkit-dcomp-2.0.1/api/sdks/main/webgpuContextKey";

export const electrobunNativeAdapter = {
  getMaxTextureDimension2D(device: { ptr: number }): number {
    if (process.platform !== "win32") throw new Error("Retained surface capacity requires Windows");
    const limit = WGPUBridge.deviceMaxTextureDimension2D(device.ptr as any);
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Cannot query the native texture dimension limit");
    return limit;
  },
  setPresentExtent(context: any, width: number, height: number): void {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      !context.surfacePtr || WGPUBridge.surfaceSetPresentExtent(context.surfacePtr, width, height) !== 1) {
      throw new Error("Cannot set the retained surface's presentation extent");
    }
  },
	createWebgpuContext(window: GpuWindow) {
		webgpu.install();
		const canvas = webgpu.utils.createCanvasShim(window);
		const context = canvas.getContext("webgpu");
		if (!context) throw new Error("Electrobun did not create a WebGPU context");
		return { canvas, context };
	},
	reconfigureWebgpuContext(context: any) {
		if (typeof context.reconfigure !== "function") {
			throw new Error("Electrobun WebGPU context does not support surface reconfiguration");
		}
		context.reconfigure();
	},
	presentWebgpuContext(context: any) {
		if (typeof context.present !== "function") {
			throw new Error("Electrobun WebGPU context does not support presentation");
		}
		return context.present();
	},
	consumeWebgpuPresentStatus(context: any) {
		return context.consumePresentStatus?.();
	},
	submitWithWebgpuSurface<T>(context: any, submit: (surface: number) => T): T {
		if (!context.surfacePtr) throw new Error("Electrobun WebGPU surface has been released");
		return submit(context.surfacePtr);
	},
	enableKeyEvents: enableWGPUKeyEvents,
	enablePointerEvents: enableWGPUPointerEvents,
	enableTextEvents: enableWindowTextEvents,
	getWindowContentOrigin(window: GpuWindow) {
		return ffi.request.getWindowContentOrigin({ winId: window.id });
	},
	getWindowContentSize(window: GpuWindow) {
		return ffi.request.getWindowContentSize({ winId: window.id });
	},
	getWgpuNativeHandle(window: GpuWindow) {
		return window.wgpuView.getNativeHandle() as number | null;
	},
	releaseWebgpuContext(window: GpuWindow) {
		return releaseWebgpuContext(getWebgpuContextKey(window));
	},
} as const;
