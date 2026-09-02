import type { GpuWindow } from "electrobun/main";
import { electrobunNativeAdapter } from "./electrobun-native-adapter";
import {
	normalizePresentStatus,
	type NativePresentStatus,
} from "./native-webgpu-status";

export { normalizePresentStatus, type NativePresentStatus } from "./native-webgpu-status";

export type NativeWebGpuCanvas = {
	width: number;
	height: number;
	getContext(type: "webgpu"): unknown;
};

export type NativeWebGpuContext = Readonly<{
	canvas: NativeWebGpuCanvas;
	/** Pass this value to requestAdapter({ compatibleSurface }); do not inspect it. */
	compatibleSurface: unknown;
}>;

type ContextState = {
	window: GpuWindow;
	raw: any;
	released: boolean;
};

const states = new WeakMap<NativeWebGpuContext, ContextState>();

const stateFor = (context: NativeWebGpuContext) => {
	const state = states.get(context);
	if (!state || state.released) throw new Error("WebGPU context has been released");
	return state;
};

export function createContext(window: GpuWindow): NativeWebGpuContext {
	const { canvas, context: raw } = electrobunNativeAdapter.createWebgpuContext(window);
	const context = Object.freeze({ canvas, compatibleSurface: raw }) as NativeWebGpuContext;
	states.set(context, { window, raw, released: false });
	return context;
}

export function getContentSize(context: NativeWebGpuContext) {
	const { window } = stateFor(context);
	const { width, height } = electrobunNativeAdapter.getWindowContentSize(window);
	return { width, height };
}

export function reconfigure(context: NativeWebGpuContext) {
	const state = stateFor(context);
	electrobunNativeAdapter.reconfigureWebgpuContext(state.raw);
}

export function present(
	context: NativeWebGpuContext,
	submit?: (nativeSurface: number) => unknown,
): NativePresentStatus {
	const state = stateFor(context);
	try {
		electrobunNativeAdapter.consumeWebgpuPresentStatus(state.raw);
		const result = submit
			? electrobunNativeAdapter.submitWithWebgpuSurface(state.raw, submit)
			: electrobunNativeAdapter.presentWebgpuContext(state.raw);
		const rawStatus = submit
			? result
			: electrobunNativeAdapter.consumeWebgpuPresentStatus(state.raw) ?? result;
		return normalizePresentStatus(rawStatus) ?? "success";
	} catch (error) {
		return normalizePresentStatus(error) ?? "fatal";
	}
}

export function consumePresentStatus(context: NativeWebGpuContext): NativePresentStatus | null {
	const state = stateFor(context);
	return normalizePresentStatus(electrobunNativeAdapter.consumeWebgpuPresentStatus(state.raw));
}

export function releaseContext(context: NativeWebGpuContext): boolean {
	const state = states.get(context);
	if (!state || state.released) return false;
	state.released = true;
	return electrobunNativeAdapter.releaseWebgpuContext(state.window);
}
