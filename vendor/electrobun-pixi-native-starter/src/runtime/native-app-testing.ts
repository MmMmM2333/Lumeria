import type { NativePixiApplication, NativeGpuPreference, NativeAppState } from "./native-app";

export type NativeAppFault =
	| "device-lost"
	| "validation"
	| "out-of-memory"
	| "internal"
	| "surface-timeout"
	| "surface-outdated"
	| "surface-lost"
	| "surface-out-of-memory";

export interface NativeAppFrameCounters {
	readonly submitCount: number;
	readonly presentCount: number;
	readonly renderCount: number;
	readonly lastStatus: number;
}

export interface NativeAppRuntimeEvent {
	readonly sequence: number;
	readonly at: number;
	readonly type: string;
	readonly data?: unknown;
}

export interface NativeAppDiagnostics {
	readonly runtime: {
		readonly state: NativeAppState;
		readonly deviceGeneration: number;
		readonly surfaceGeneration: number;
		readonly recoveryCount: number;
		readonly paused: boolean;
		readonly minimized: boolean;
	};
	readonly window: {
		readonly frame: Readonly<{ x: number; y: number; width: number; height: number }>;
		readonly contentSize: Readonly<{ width: number; height: number }>;
		readonly resolution: number;
		readonly resizeMode: string;
		readonly display: Readonly<{ id: number; bounds: Readonly<{ x: number; y: number; width: number; height: number }> }>;
		readonly displays: readonly Readonly<{ id: number; bounds: Readonly<{ x: number; y: number; width: number; height: number }>; scaleFactor: number }>[];
		readonly snapshot: Readonly<{
			clientWidth: number;
			clientHeight: number;
			frameX: number;
			frameY: number;
			frameWidth: number;
			frameHeight: number;
			dpi: number;
			scaleFactor: number;
			displayId: string;
			minimized: boolean;
			maximized: boolean;
			focused: boolean;
		}>;
	};
	readonly gpu: {
		readonly preference: NativeGpuPreference;
		readonly name: string;
		readonly type: string;
	};
	readonly frame: NativeAppFrameCounters & {
		readonly maxFps: number;
		readonly fastBundleCount: number;
		readonly fastFallback: string;
		readonly lastPresentAgeMs: number;
	};
	readonly host: {
		readonly abiVersion: number;
		readonly capabilities: string;
		readonly windows: Readonly<{ surface: number; input: number; text: number }>;
		readonly textInputActive: boolean;
	};
	readonly renderTarget: unknown;
	readonly input: {
		readonly captured: boolean;
		readonly nativeCaptured: boolean;
		readonly lastCursor: number;
		readonly queued: string;
		readonly dropped: string;
		readonly coalesced: string;
		readonly duplicates: string;
		readonly nativeEvents: readonly Readonly<Record<string, unknown>>[];
	};
	readonly lastError: Readonly<{ type: string; message: string; at: number }> | null;
	readonly events: readonly NativeAppRuntimeEvent[];
}

export interface NativeAppTestingHandles {
	readonly surfaceWindow: number;
	readonly inputWindow: number;
	readonly route: bigint;
	readonly deviceGeneration: number;
	readonly surfaceGeneration: number;
}

export interface NativeAppTestingControl {
	diagnostics(): NativeAppDiagnostics;
	handles(): NativeAppTestingHandles;
	pause(): void;
	resume(): void;
	step(frames?: number): void;
	switchGpu(preference: Exclude<NativeGpuPreference, "default">): Promise<void>;
	recover(): Promise<void>;
	injectFault(kind: NativeAppFault): void;
	frameCounters(): NativeAppFrameCounters;
	syncWindow(syncBacking?: boolean): void;
	clientToScreen(x: number, y: number): Readonly<{ x: number; y: number }>;
	recordEvent(type: string, data?: unknown): void;
	resetInputEvents(): void;
	addCleanup(cleanup: () => void | Promise<void>): () => void;
}

const controls = new WeakMap<object, NativeAppTestingControl>();

export function registerNativePixiApplicationTesting(
	application: NativePixiApplication,
	control: NativeAppTestingControl,
) {
	controls.set(application, control);
	return () => { controls.delete(application); };
}

export function getNativePixiApplicationTesting(
	application: NativePixiApplication,
): NativeAppTestingControl {
	const control = controls.get(application);
	if (!control) throw new Error("Native Pixi application testing controls are unavailable");
	return control;
}
