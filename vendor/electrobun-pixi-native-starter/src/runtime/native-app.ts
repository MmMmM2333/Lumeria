import "./runtime-shim";
import { GpuWindow, Screen, webgpu } from "electrobun/main";
import {
	AlphaMask,
	Assets,
	browserExt,
	CanvasTextPipe,
	CanvasTextSystem,
	ColorMask,
	Container,
	extensions,
	FilterPipe,
	FilterSystem,
	GraphicsContextSystem,
	GraphicsPipe,
	MaskEffectManager,
	Matrix,
	Rectangle,
	StencilMask,
	updateRenderGroupTransforms,
	WebGPURenderer,
	webworkerExt,
} from "pixi.js";
import { electrobunNativeAdapter } from "../rendering/electrobun-native-adapter";
import { patchElectrobunWebGPUDevice, verifyElectrobunWebGPUCopies } from "../rendering/electrobun-webgpu-compat";
import {
	attachNativePixiEvents,
	installNativePixiEventSystem,
	type NativeInputHostHooks,
} from "../input/native-events";
import { createNativeTextInputSession } from "../input/native-text-input";
import { createFrameScheduler, type FrameScheduler } from "./native-scheduler";
import {
	installNativeRender,
	type FastRenderBundle,
	type FastRenderPlan,
} from "../rendering/native-render";
import {
	consumePresentStatus,
	createContext,
	present as presentContext,
	reconfigure as reconfigureContext,
	releaseContext,
	type NativePresentStatus,
	type NativeWebGpuContext,
} from "../rendering/native-webgpu-context";
import { nativeFrameHost, nativeInputKinds, type NativeCursorKind } from "../platform/native-frame-host";
import { installNativeExtract } from "../rendering/native-pixi";
import { installNativeSkia } from "../rendering/native-skia";
import { createNativeWindowPresentation, type NativeWindowMaterial, type NativeWindowAppearance, type NativeResizeDirection } from "../platform/native-window-presentation";
import { createNativeWindowIcon } from "../platform/native-window-icon";
import { createNativeColorDialog } from "../platform/native-color-dialog";
import type { NativePlatformResult } from "../platform/native-platform";
import {
	registerNativePixiApplicationTesting,
	type NativeAppDiagnostics,
	type NativeAppFault,
	type NativeAppFrameCounters,
} from "./native-app-testing";

export type NativeResizeMode = "smooth" | "live" | "adaptive";
export type NativeGpuPreference = "default" | "integrated" | "discrete";
export type NativePresentationMode = "fifo" | "mailbox";
export type NativeAppState = "running" | "suspended" | "recovering" | "failed" | "closing" | "closed";

export interface NativePixiApplicationOptions {
	title?: string;
	width?: number;
	height?: number;
	background?: number;
  transparent?: boolean;
  titleBarStyle?: "default" | "hidden" | "hiddenInset";
	antialias?: boolean;
	maxFps?: number;
	resizeMode?: NativeResizeMode;
	gpuPreference?: NativeGpuPreference;
	presentationMode?: NativePresentationMode;
}

export interface NativeAppResizeEvent {
	readonly width: number;
	readonly height: number;
	readonly resolution: number;
}
export interface NativeAppStateChangeEvent {
	readonly state: NativeAppState;
	readonly previous: NativeAppState;
	readonly reason?: string;
}
export interface NativeAppRecoveredEvent {
	readonly reason: string;
	readonly mode: "device" | "surface";
	readonly deviceGeneration: number;
	readonly surfaceGeneration: number;
}
export interface NativeAppFatalEvent {
	readonly type: string;
	readonly message: string;
	readonly error?: unknown;
}
export interface NativeAppPresentedEvent {
	readonly frameNumber: number;
	readonly deviceGeneration: number;
	readonly surfaceGeneration: number;
}

/** Outer window bounds in physical pixels, including non-client borders. */
export interface NativeWindowFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
}

type NativeInput = ReturnType<typeof attachNativePixiEvents>;
type NativeTextInput = ReturnType<typeof createNativeTextInputSession>;
type NativeAppEvents = {
	presented: NativeAppPresentedEvent;
	resize: NativeAppResizeEvent;
	statechange: NativeAppStateChangeEvent;
	recovered: NativeAppRecoveredEvent;
	fatal: NativeAppFatalEvent;
};

export interface NativePixiApplication {
	readonly stage: Container;
	readonly window: GpuWindow;
	readonly renderer: WebGPURenderer;
	readonly screen: Rectangle;
	readonly resolution: number;
	readonly contentSize: Readonly<{ width: number; height: number }>;
	readonly state: NativeAppState;
	readonly nativeInput: NativeInput;
	readonly textInput: NativeTextInput;
  getWindowFrame(): Readonly<NativeWindowFrame>;
  readonly supportsColorDialog: boolean;
  chooseColor(color: number): Promise<NativePlatformResult<number>>;
  setWindowMode(mode: "fullscreen" | "windowed", overscanPixels?: number): void;
  readonly windowMode: "fullscreen" | "windowed";
  startWindowDrag(): void;
  startWindowResize(direction: NativeResizeDirection): void;
	invalidate(): void;
	nextPresent(): Promise<void>;
	animate(update: (deltaMs: number) => void): () => void;
	on<K extends keyof NativeAppEvents>(type: K, listener: (event: NativeAppEvents[K]) => void): () => void;
	dispose(): Promise<void>;
	beforeClose(listener: () => Promise<void | boolean>): () => void;
  readonly windowMaterialSupport: ReturnType<typeof import("../platform/native-window-presentation").nativeWindowMaterialSupport>;
  setWindowPresentation(material:NativeWindowMaterial,appearance:NativeWindowAppearance):void;
  readonly supportsWindowIcon: boolean;
  setWindowIcon(png: Uint8Array): void;
}

const gpuPowerPreferences = { default: 0, integrated: 1, discrete: 2 } as const;
const cursorKinds: Readonly<Record<string, NativeCursorKind>> = {
	default: 0, arrow: 0, pointer: 1, hand: 1, text: 2, crosshair: 3,
	"ew-resize": 4, "col-resize": 4, "ns-resize": 5, "row-resize": 5,
	"nwse-resize": 9, "se-resize": 9, move: 6, "not-allowed": 7, wait: 8, progress: 8,
};

const displayFor = (frame: { x: number; y: number; width: number; height: number }) => {
	let best = Screen.getPrimaryDisplay();
	let bestArea = 0;
	for (const candidate of Screen.getAllDisplays()) {
		const { bounds } = candidate;
		const width = Math.max(0, Math.min(frame.x + frame.width, bounds.x + bounds.width) - Math.max(frame.x, bounds.x));
		const height = Math.max(0, Math.min(frame.y + frame.height, bounds.y + bounds.height) - Math.max(frame.y, bounds.y));
		if (width * height > bestArea) { best = candidate; bestArea = width * height; }
	}
	return best;
};

let platformInitialization: Promise<void> | null = null;
let activeApplication = false;

const initializePlatform = () => {
	if (!platformInitialization) {
		platformInitialization = (async () => {
			webgpu.install();
			Object.assign(globalThis, {
				GPUTextureUsage: { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16, TRANSIENT_ATTACHMENT: 32 },
				GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
			});
			extensions.remove(browserExt, webworkerExt);
			installNativeSkia();
			await Assets.init({ skipDetections: true });
			installNativePixiEventSystem();
			extensions.add(FilterSystem, FilterPipe, GraphicsContextSystem, GraphicsPipe, CanvasTextSystem, CanvasTextPipe);
			MaskEffectManager.init();
			for (const maskClass of [AlphaMask, ColorMask, StencilMask]) {
				if ((MaskEffectManager as any)._tests.some((test: any) => test.maskClass === maskClass)) continue;
				MaskEffectManager.add({ test: maskClass.test, maskClass });
			}
		})().catch((error) => { platformInitialization = null; throw error; });
	}
	return platformInitialization;
};

const positive = (value: number, fallback: number, name: string) => {
	const result = value ?? fallback;
	if (!Number.isFinite(result) || result <= 0) throw new RangeError(`${name} must be positive`);
	return result;
};

export async function createNativePixiApplication(
	options: NativePixiApplicationOptions = {},
): Promise<NativePixiApplication> {
	if (activeApplication) throw new Error("Only one NativePixiApplication can be active at a time");
	activeApplication = true;
	const width = positive(options.width!, 900, "width");
	const height = positive(options.height!, 600, "height");
	const maxFps = options.maxFps ?? 60;
	if (!Number.isFinite(maxFps) || maxFps < 0) { activeApplication = false; throw new RangeError("maxFps must be non-negative"); }
	const resizeMode = options.resizeMode ?? "smooth";
	if (!["smooth", "live", "adaptive"].includes(resizeMode)) { activeApplication = false; throw new RangeError("resizeMode is invalid"); }
	const startupPreference = options.gpuPreference ?? "default";
	if (!(startupPreference in gpuPowerPreferences)) { activeApplication = false; throw new RangeError("gpuPreference is invalid"); }

	const startupCleanup: Array<() => void | Promise<void>> = [];
	try {
		await initializePlatform();
		const window = new GpuWindow({ title: options.title ?? "PixiJS · Native WebGPU", frame: { width, height }, transparent:options.transparent??false, titleBarStyle:options.titleBarStyle??"default" });
		startupCleanup.push(() => window.close());
		let runtimeContext: NativeWebGpuContext = createContext(window);
		startupCleanup.push(() => { releaseContext(runtimeContext); });
		let canvas = runtimeContext.canvas;
		const surfaceWindow = electrobunNativeAdapter.getWgpuNativeHandle(window);
		if (!surfaceWindow) throw new Error("WGPU child window has no native handle");
		const inputWindow = nativeFrameHost.resolveInputWindow(surfaceWindow);
    const windowPresentation=createNativeWindowPresentation(inputWindow,()=>{
      if(nativeFrameHost.releaseMouseCapture(inputWindow)<0)throw new Error("Cannot release pointer capture");
    },options.transparent??false);
    startupCleanup.push(()=>windowPresentation?.dispose());
    const windowIcon=createNativeWindowIcon(inputWindow);
    const colorDialog=createNativeColorDialog(inputWindow);
    startupCleanup.push(()=>windowIcon?.dispose());
		const route = BigInt(window.wgpuViewId);
		let snapshot = nativeFrameHost.getWindowSnapshot(inputWindow);
		let resolution = snapshot.scaleFactor > 0 ? snapshot.scaleFactor : 1;
		let contentSize = { width: Math.max(1, snapshot.clientWidth / resolution), height: Math.max(1, snapshot.clientHeight / resolution) };
		let requestedPreference = startupPreference;
		let activePreference = startupPreference;
		let requestedGeneration = 1;
		let nextGeneration = 1;
		let adapterName = "unknown";
		let adapterType = "unknown";
		const previousFactory = (globalThis as any).__electrobunCreateAdapterDevice;
		const previousPresentMode = (globalThis as any).__electrobunPresentMode;
		const adapterFactory = (instance: number, surface: number, output: BigUint64Array) => {
			const selected = nativeFrameHost.createAdapterDevice(instance, surface, gpuPowerPreferences[requestedPreference], BigInt(requestedGeneration), output);
			if (selected.status < 0) throw new Error(`Native GPU selection failed (${selected.status})`);
			adapterName = selected.adapterName || "unknown";
			adapterType = ["unknown", "discrete", "integrated", "CPU", "unknown"][selected.status] ?? "unknown";
		};
		(globalThis as any).__electrobunCreateAdapterDevice = adapterFactory;
		(globalThis as any).__electrobunPresentMode = options.presentationMode === "mailbox" ? 0x00000004 : 0x00000001;
		startupCleanup.push(() => {
			if ((globalThis as any).__electrobunCreateAdapterDevice === adapterFactory) {
				if (previousFactory === undefined) delete (globalThis as any).__electrobunCreateAdapterDevice;
				else (globalThis as any).__electrobunCreateAdapterDevice = previousFactory;
			}
			if (previousPresentMode === undefined) delete (globalThis as any).__electrobunPresentMode;
			else (globalThis as any).__electrobunPresentMode = previousPresentMode;
		});

		const createGpu = async (preference: NativeGpuPreference) => {
			const generation = nextGeneration++;
			requestedGeneration = generation;
			requestedPreference = preference;
			const adapter = await webgpu.navigator.requestAdapter({ compatibleSurface: runtimeContext.compatibleSurface as any });
			if (!adapter) throw new Error("No WebGPU adapter is available");
			const device = await adapter.requestDevice();
			try {
				patchElectrobunWebGPUDevice(device);
				await verifyElectrobunWebGPUCopies(device);
				Object.assign(device.limits, { maxSampledTexturesPerShaderStage: 16, maxSamplersPerShaderStage: 16 });
				return { adapter, device, generation };
			} catch (error) { try { device.destroy(); } catch {} throw error; }
		};
		const destroyRenderer = (target: WebGPURenderer) => {
			(target as any).filter?._globalFilterBindGroup?.destroy();
			target.destroy();
		};
		const createRenderer = async (adapter: any, device: any) => {
			const result = new WebGPURenderer();
			await result.init({
				canvas: canvas as any, width: contentSize.width, height: contentSize.height, resolution,
				antialias: options.antialias ?? true, backgroundColor: options.background ?? 0x090b14, backgroundAlpha:options.transparent?0:1,
				gpu: { adapter, device } as any, skipExtensionImports: true,
			});
			const uniformBatch = (result.renderPipes as any).uniformBatch;
			let lastUpload = new Uint8Array();
			uniformBatch._uploadBindGroups = () => {
				const byteLength = uniformBatch._batchBuffer.byteIndex;
				const data = uniformBatch._batchBuffer.data as Float32Array;
				const bytes = new Uint8Array(data.buffer, data.byteOffset, byteLength + 128);
				if (bytes.length === lastUpload.length && bytes.every((value, index) => value === lastUpload[index])) return;
				lastUpload = bytes.slice();
				const [evenBuffer, oddBuffer] = uniformBatch._buffers;
				evenBuffer.update(byteLength);
				result.buffer.updateBuffer(evenBuffer);
				(device.queue as any).writeBuffer(result.buffer.getGPUBuffer(oddBuffer), 0, data.buffer, data.byteOffset + 128, byteLength);
			};
			result.limits.supportsOverrideConstants = false;
			installNativeExtract(result);
			for (const pipe of ["filter", "alphaMask", "stencilMask", "graphics", "text"]) {
				if (!(result.renderPipes as any)[pipe]) {
					destroyRenderer(result);
					throw new Error(`Missing Pixi ${pipe} pipe; loaded: ${Object.keys(result.renderPipes).join(",")}`);
				}
			}
			return result;
		};

		let { adapter, device, generation: deviceGeneration } = await createGpu(startupPreference);
		startupCleanup.push(() => { try { releaseContext(runtimeContext); } catch {} try { device.destroy(); } catch {} });
		let renderer = await createRenderer(adapter, device);
		startupCleanup.push(() => { try { destroyRenderer(renderer); } catch {} });
		const stage = new Container();
		stage.eventMode = "static";
		stage.hitArea = new Rectangle(0, 0, contentSize.width, contentSize.height);
		startupCleanup.push(() => { try { stage.destroy({ children: true }); } catch {} });

		if (nativeFrameHost.attachInput(inputWindow, route) < 0) throw new Error("Failed to attach native input");
		startupCleanup.push(() => { nativeFrameHost.detachInput(inputWindow); });
		if (surfaceWindow !== inputWindow) {
			if (nativeFrameHost.attachInput(surfaceWindow, route) < 0) throw new Error("Failed to attach surface input");
			startupCleanup.push(() => { nativeFrameHost.detachInput(surfaceWindow); });
		}

		let state: NativeAppState = snapshot.minimized ? "suspended" : "running";
		let minimized = snapshot.minimized;
		let closed = false;
		let paused = false;
		let stepFrames = 0;
		let recoveryCount = 0;
		let surfaceGeneration = 1;
		let lastError: { type: string; message: string; at: number } | null = null;
		let lastPresentedAt = performance.now();
		let renderCount = 0;
		let pendingWindowSync = true;
		let pendingBackingSync = true;
		let windowSyncTimer: ReturnType<typeof setTimeout> | null = null;
		let lastFrameAt = performance.now();
		let inputPollingEnabled = false;
		let recoveryPromise: Promise<void> | null = null;
		let pendingRecovery: { reason: string; mode: "device" | "surface"; preference: NativeGpuPreference; automatic: boolean } | null = null;
		const recoveryTimes: number[] = [];
		const retiredGenerations = new Set<number>();
		const animations = new Set<(deltaMs: number) => void>();
		const runtimeEvents: Array<{ sequence: number; at: number; type: string; data?: unknown }> = [];
		let runtimeEventSequence = 0;
		const recordEvent = (type: string, data?: unknown) => {
			runtimeEvents.push({ sequence: ++runtimeEventSequence, at: Date.now(), type, data });
			if (runtimeEvents.length > 256) runtimeEvents.shift();
		};
		const nativeInputEvents: Array<Record<string, unknown>> = [];
		const cleanups = new Set<() => void | Promise<void>>();
		const closeGuards = new Set<() => Promise<void | boolean>>();
		let closeRequest: Promise<void> | null = null;
		const presentWaiters = new Set<{ resolve(): void; reject(error: Error): void }>();
		const rejectPresentWaiters = (error: Error) => {
			const waiters = [...presentWaiters]; presentWaiters.clear();
			for (const waiter of waiters) waiter.reject(error);
		};
		const listeners = {
			presented: new Set<(event: NativeAppPresentedEvent) => void>(),
			resize: new Set<(event: NativeAppResizeEvent) => void>(),
			statechange: new Set<(event: NativeAppStateChangeEvent) => void>(),
			recovered: new Set<(event: NativeAppRecoveredEvent) => void>(),
			fatal: new Set<(event: NativeAppFatalEvent) => void>(),
		};
		const emit = <K extends keyof NativeAppEvents>(type: K, event: NativeAppEvents[K]) => {
			for (const listener of [...listeners[type]] as Array<(event: NativeAppEvents[K]) => void>) {
				try { listener(event); } catch (error) { console.error(`[native-app] ${type} listener failed`, error); }
			}
		};
		const setState = (next: NativeAppState, reason?: string) => {
			if (next === state) return;
			const previous = state;
			state = next;
			recordEvent("state-changed", { state: next, previous, reason });
			emit("statechange", { state: next, previous, reason });
		};
		const fail = (type: string, message: string, error?: unknown) => {
			lastError = { type, message, at: Date.now() };
			recordEvent(type, { message });
			setState("failed", message);
			frameScheduler?.suspend();
			rejectPresentWaiters(new Error("Native Pixi presentation failed: " + message, { cause: error }));
			emit("fatal", { type, message, error });
		};

		let requestFrame = () => {};
		let pollTextInput = () => {};
		let syncInputLayout = () => {};
		const inputHooks: NativeInputHostHooks = {
			route,
			pollEvent: () => {
				const event = nativeFrameHost.pollInputEvent(route);
				if (event) {
					nativeInputEvents.push({
						kind: event.kind, x: event.x, y: event.y, screenX: event.screenX, screenY: event.screenY,
						pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
						width: event.width, height: event.height, pressure: event.pressure,
						button: event.button, buttons: event.buttons,
						wheelX: event.wheelX, wheelY: event.wheelY, deltaMode: event.deltaMode,
						modifiers: event.modifiers, keyCode: event.keyCode, timestamp: event.timestamp.toString(),
					});
					if (nativeInputEvents.length > 128) nativeInputEvents.shift();
				}
				if (!event || event.kind > 9) return event;
				syncInputLayout();
				if (resolution === 1) return event;
				return {
					...event,
					x: event.x / resolution, y: event.y / resolution,
					movementX: event.movementX / resolution, movementY: event.movementY / resolution,
					width: event.width / resolution, height: event.height / resolution,
				};
			},
			setPointerCapture: (captured) => (captured ? nativeFrameHost.setMouseCapture(inputWindow) : nativeFrameHost.releaseMouseCapture(inputWindow)) > 0,
			setCursor: (cursor) => { nativeFrameHost.setCursor(inputWindow, cursorKinds[cursor] ?? 0); },
			subscribeInputAvailable: (listener) => {
				const status = nativeFrameHost.setInputWakeHandler(() => { if (inputPollingEnabled) listener(); });
				if (status < 0) throw new Error(`Failed to register native input wake (${status})`);
				return () => { nativeFrameHost.setInputWakeHandler(null); };
			},
			onActivity: () => { if (inputPollingEnabled) { pollTextInput(); requestFrame(); } },
		};
		let nativeInput = attachNativePixiEvents(window, renderer, inputHooks);
		startupCleanup.push(() => { nativeInput.destroy(); });
		const textInput = createNativeTextInputSession({
			windowHandle: inputWindow, route,
			toPhysicalRect: (rect) => ({ x: Math.round(rect.x * resolution), y: Math.round(rect.y * resolution), width: Math.max(0, Math.round(rect.width * resolution)), height: Math.max(0, Math.round(rect.height * resolution)) }),
			onActivity: () => requestFrame(),
		});
		startupCleanup.push(() => { textInput.destroy(); });
		pollTextInput = () => { textInput.poll(); };
		let offFocus = () => {};
		let offLifecycle = () => {};
		const bindInputObservers = () => {
			offFocus(); offLifecycle();
			offFocus = nativeInput.onFocusChange((focused) => { if (!focused) textInput.blur(); });
			offLifecycle = nativeInput.onHostEvent((event) => {
				if (event.kind === nativeInputKinds.windowMove || event.kind === nativeInputKinds.windowResize) handleWindowChange();
				else if (event.kind === nativeInputKinds.dpiChanged) { requestWindowSync(true); syncWindow(); }
				else if (event.kind === nativeInputKinds.displayChanged) requestWindowSync(true);
				else if (event.kind === nativeInputKinds.minimized || event.kind === nativeInputKinds.suspend) suspendRuntime(event.kind === nativeInputKinds.minimized ? "minimized" : "system");
				else if (event.kind === nativeInputKinds.restored) restoreRuntime();
				else if (event.kind === nativeInputKinds.resume) void requestRecovery("system resume", "surface");
			});
		};

		type PixiFastBundle = FastRenderBundle<any, any> & { batch: any; batcher: any };
		let nativeRender: ReturnType<typeof installNativeRender<any, any, any>> | null = null;
		let rootFastPlan: FastRenderPlan<any, any> | null = null;
		let fastFallback = "not-compiled";
		const invalidateFastPath = () => { nativeRender?.invalidate(); rootFastPlan = null; };
		const invalidateGpuResources = () => {
			const renderGroups = stage.renderGroup ? [stage.renderGroup] : [];
			for (let index = 0; index < renderGroups.length; index++) {
				renderGroups[index].structureDidChange = true;
				renderGroups.push(...renderGroups[index].renderGroupChildren);
			}
			const views: any[] = [stage];
			for (let index = 0; index < views.length; index++) {
				views[index].unload?.();
				views.push(...(views[index].children ?? []));
			}
		};
		const installFastPath = (target: WebGPURenderer) => {
			const batchPipe = (target.renderPipes as any).batch;
			const executeBatch = batchPipe.execute.bind(batchPipe);
			let executionIndex = 0;
			nativeRender = installNativeRender<any, any, any>({
				recordBatch(batch: any): PixiFastBundle {
					const batcher = batch.batcher;
					(target.encoder as any).beginBundle();
					if (batch.action !== "startBatch") batchPipe._adaptor.start(batchPipe, batcher.geometry, batcher.shader);
					executeBatch(batch);
					return { batch, batcher, bundle: (target.encoder as any).endBundle(), vertexBuffer: target.buffer.getGPUBuffer(batcher.geometry.buffers[0]), vertexData: new Uint8Array(batcher.attributeBuffer.rawBinaryData, 0, batcher.attributeSize * 4) };
				},
				destroyBundle(item: any) { item.bundle?.destroy(); if (item.batch?.bindGroup) item.batch.bindGroup = null; },
			});
			batchPipe.execute = (batch: any) => {
				// The current native bundle ABI clears to opaque #090b14. Transparent
				// windows must use Pixi's normal pass, which carries backgroundAlpha.
				if(options.transparent){fastFallback="transparent-surface";return executeBatch(batch);}
				if (target.renderTarget.renderTarget !== target.renderTarget.rootRenderTarget || !stage.renderGroup) {
					return executeBatch(batch);
				}
				if (!rootFastPlan) {
					const set = stage.renderGroup.instructionSet;
					const decision = nativeRender!.compile({ rendererUid: target.uid, generation: deviceGeneration, isRootTarget: true, passCount: stage.renderGroup.renderGroupChildren.length || (stage.renderGroup as any)._onRenderContainers.length ? 2 : 1, instructions: set.instructions.slice(0, set.instructionSize) });
					if (decision.kind === "standard") {
						fastFallback = decision.reason === "unsupported-instruction"
							? `${decision.reason}:${[...new Set(set.instructions.slice(0, set.instructionSize).map((instruction: any) => instruction.renderPipeId))].join(",")}`
							: decision.reason;
						return executeBatch(batch);
					}
					fastFallback = "none";
					rootFastPlan = decision.plan; executionIndex = 0;
				}
				const item = rootFastPlan.bundles[executionIndex++] as PixiFastBundle | undefined;
				if (!item || item.batch !== batch) { invalidateFastPath(); return executeBatch(batch); }
				(target.encoder as any).executeBundle(item.bundle);
			};
		};
		const renderTransform = new Matrix();
		const renderStage = () => {
			const source = renderer.view.texture.source;
			renderTransform.set(source.width / Math.max(1, contentSize.width), 0, 0, source.height / Math.max(1, contentSize.height), 0, 0);
			renderer.render({ container: stage, transform: renderTransform });
		};
		installFastPath(renderer);

		let frameScheduler: FrameScheduler | null = null;
		const reconfigureSurface = (reason: string) => {
			reconfigureContext(runtimeContext);
			recordEvent("surface-reconfigured", { reason, ...contentSize, resolution });
		};
		const presentFailureCode = (status: Exclude<NativePresentStatus, "success" | "suboptimal"> | null) => ({ outdated: -3, timeout: -2, "surface-lost": -4, "out-of-memory": -6, "device-lost": -5, fatal: -15 }[status ?? "fatal"]);
		const markPresented = (status: NativePresentStatus) => {
			lastPresentedAt = performance.now(); renderCount++;
			try {
				const event = Object.freeze({ frameNumber: renderCount, deviceGeneration, surfaceGeneration });
				for (const listener of [...listeners.presented]) listener(event);
			} catch (error) {
				fail("presented-listener", error instanceof Error ? error.message : String(error), error);
				return;
			}
			const waiters = [...presentWaiters]; presentWaiters.clear();
			for (const waiter of waiters) waiter.resolve();
			if (status === "suboptimal") { try { reconfigureSurface("surface suboptimal"); } catch { void requestRecovery("surface suboptimal", "surface"); } }
		};
		const handleFrameFailure = (status: number) => {
			recordEvent(({ [-2]: "surface-timeout", [-3]: "surface-outdated", [-4]: "surface-lost", [-6]: "surface-out-of-memory" } as Record<number, string>)[status] ?? "present-error", { status });
			if (status === -3) { try { reconfigureSurface("surface outdated"); requestWindowSync(true); } catch (error) { void requestRecovery(String(error), "surface"); } }
			else if (status === -2) setTimeout(requestFrame, 16);
			else if (status === -6) fail("out-of-memory", "GPU surface is out of memory");
			else void requestRecovery(`presentation failed (${status})`, "surface");
		};
		const standardFrame = () => {
			renderStage();
			const status = consumePresentStatus(runtimeContext);
			if (status !== "success" && status !== "suboptimal") { handleFrameFailure(presentFailureCode(status)); return false; }
			markPresented(status); return true;
		};

		const pollGpu = () => {
			for (let count = 0; count < 64; count++) {
				const event = nativeFrameHost.pollGpuEvent();
				if (!event) break;
				const generation = Number(event.generation);
				if (retiredGenerations.has(generation) || generation !== deviceGeneration) continue;
				if (event.kind === 1) {
					(device as any).__pixiResolveLost?.({ reason: event.code === 2 ? "destroyed" : "unknown", message: event.message });
					void requestRecovery(`device lost (${event.code}): ${event.message}`, "device");
				} else {
					const error = Object.assign(new Error(event.message || `WebGPU error ${event.code}`), { type: event.code });
					(device as any).__pixiDispatchUncapturedError?.(error);
					if (event.code === 2 || event.code === 3) fail(event.code === 2 ? "validation" : "out-of-memory", error.message, error);
					else void requestRecovery(error.message, "surface");
				}
			}
		};
		const retireDevice = (target: any, generation: number) => { retiredGenerations.add(generation); try { target.destroy(); } catch {} };
		const waitForQueue = (target: any, timeout = 1000) => Promise.race([target.queue.onSubmittedWorkDone(), new Promise((resolve) => setTimeout(resolve, timeout))]);

		const rebuildGpu = async (reason: string, preference: NativeGpuPreference, requestedMode: "device" | "surface") => {
			let mode = requestedMode;
			for (;;) {
				const previous = { adapter, device, renderer, generation: deviceGeneration };
				let nextGpu: Awaited<ReturnType<typeof createGpu>> | null = null;
				let nextRenderer: WebGPURenderer | null = null;
				try {
					if (mode === "device") nextGpu = await createGpu(preference);
					if (closed) { nextGpu?.device.destroy(); return; }
					inputPollingEnabled = false; offFocus(); offLifecycle(); nativeInput.destroy(); invalidateFastPath(); invalidateGpuResources();
					try { await waitForQueue(previous.device); } catch {}
					destroyRenderer(previous.renderer);
					if (mode === "surface") {
						releaseContext(runtimeContext); retireDevice(previous.device, previous.generation);
						runtimeContext = createContext(window); canvas = runtimeContext.canvas; surfaceGeneration++;
						nextGpu = await createGpu(preference);
					}
					if (!nextGpu) throw new Error("GPU recreation produced no device");
					nextRenderer = await createRenderer(nextGpu.adapter, nextGpu.device);
					adapter = nextGpu.adapter; device = nextGpu.device; deviceGeneration = nextGpu.generation; renderer = nextRenderer;
					installFastPath(renderer); nativeInput = attachNativePixiEvents(window, renderer, inputHooks); bindInputObservers();
					if (mode === "device") retireDevice(previous.device, previous.generation);
					activePreference = preference; snapshot = nativeFrameHost.getWindowSnapshot(inputWindow); minimized = snapshot.minimized;
					setState(minimized ? "suspended" : "running", reason); inputPollingEnabled = true; nativeInput.poll(); textInput.poll();
					lastError = null; recoveryCount++; pendingWindowSync = true; pendingBackingSync = true; lastFrameAt = performance.now();
					recordEvent("recovered", { reason, mode, deviceGeneration, surfaceGeneration });
					emit("recovered", { reason, mode, deviceGeneration, surfaceGeneration });
					if (!minimized) { syncWindow(); frameScheduler?.resume(); requestFrame(); }
					return;
				} catch (error) {
					try { nativeInput.destroy(); } catch {} try { if (nextRenderer) destroyRenderer(nextRenderer); } catch {}
					if (mode === "surface") try { releaseContext(runtimeContext); } catch {}
					try { if (nextGpu && nextGpu.device !== previous.device) retireDevice(nextGpu.device, nextGpu.generation); } catch {}
					if (closed) return;
					if (mode === "device") { mode = "surface"; continue; }
					fail("recovery", error instanceof Error ? error.message : String(error), error); return;
				}
			}
		};
		function requestRecovery(reason: string, mode: "device" | "surface", preference = activePreference, automatic = true) {
			if (closed || state === "closing" || state === "closed") return recoveryPromise ?? Promise.resolve();
			if (state === "recovering") { pendingRecovery = { reason, mode, preference, automatic }; return recoveryPromise ?? Promise.resolve(); }
			if (automatic) {
				const now = Date.now(); while (recoveryTimes.length && now - recoveryTimes[0]! > 30_000) recoveryTimes.shift();
				if (recoveryTimes.length >= 5) { fail("recovery-limit", reason); return Promise.resolve(); }
				recoveryTimes.push(now);
			}
			recordEvent("recovery-started", { reason, mode, preference });
			setState("recovering", reason); frameScheduler?.suspend();
			recoveryPromise = rebuildGpu(reason, preference, mode).finally(() => {
				recoveryPromise = null; const next = pendingRecovery; pendingRecovery = null;
				if (next && !closed) void requestRecovery(next.reason, next.mode, next.preference, next.automatic);
			});
			return recoveryPromise;
		}

		function syncWindow() {
			const syncBacking = pendingBackingSync; pendingWindowSync = false; pendingBackingSync = false;
			if (state !== "running") { pendingWindowSync = true; pendingBackingSync ||= syncBacking; return; }
			try {
				const previousDisplayId = snapshot.displayId;
				const previousResolution = resolution;
				snapshot = nativeFrameHost.getWindowSnapshot(inputWindow);
				const nextResolution = snapshot.scaleFactor > 0 ? snapshot.scaleFactor : 1;
				const nextSize = { width: snapshot.clientWidth / nextResolution, height: snapshot.clientHeight / nextResolution };
				if (snapshot.minimized || nextSize.width <= 0 || nextSize.height <= 0) { minimized = true; suspendRuntime("minimized"); return; }
				const logicalChanged = nextSize.width !== contentSize.width || nextSize.height !== contentSize.height || nextResolution !== resolution;
				const source = renderer.view.texture.source;
				const backingChanged = source.pixelWidth !== Math.round(nextSize.width * nextResolution) || source.pixelHeight !== Math.round(nextSize.height * nextResolution) || source.resolution !== nextResolution;
				const resizeBacking = backingChanged && (resizeMode !== "adaptive" || syncBacking || nextResolution !== resolution);
				if (logicalChanged || resizeBacking) invalidateFastPath();
				contentSize = nextSize; resolution = nextResolution;
				if (resizeBacking) { renderer.resize(nextSize.width, nextSize.height, nextResolution); reconfigureSurface("window resize"); }
				else if (logicalChanged) {
					renderer.view.screen.width = nextSize.width; renderer.view.screen.height = nextSize.height;
					renderer.emit("resize", nextSize.width, nextSize.height, nextResolution);
					recordEvent("logical-resized", { ...nextSize, backingWidth: source.width, backingHeight: source.height });
				}
				stage.hitArea = new Rectangle(0, 0, nextSize.width, nextSize.height);
				if (snapshot.displayId !== previousDisplayId || nextResolution !== previousResolution) {
					recordEvent("display-changed", { id: snapshot.displayId.toString(), resolution: nextResolution });
				}
				if (logicalChanged) emit("resize", { ...nextSize, resolution: nextResolution });
			} catch (error) { void requestRecovery(`window sync failed: ${error instanceof Error ? error.message : String(error)}`, "surface"); }
		}
		function requestWindowSync(syncBacking = true) { pendingWindowSync = true; pendingBackingSync ||= syncBacking; if (state === "running") requestFrame(); }
		const requestSettledSync = () => {
			if (windowSyncTimer !== null) clearTimeout(windowSyncTimer);
			const settle = () => {
				if (nativeFrameHost.isWindowResizing(inputWindow)) { windowSyncTimer = setTimeout(settle, 16); return; }
				windowSyncTimer = null; requestWindowSync(true);
			};
			windowSyncTimer = setTimeout(settle, 120);
		};
		const handleWindowChange = () => {
			if (resizeMode === "smooth") requestSettledSync();
			else if (resizeMode === "adaptive") { requestWindowSync(false); requestSettledSync(); }
			else requestWindowSync(true);
		};
		function suspendRuntime(reason: string) { if (state !== "running") return; minimized = reason === "minimized" || minimized; setState("suspended", reason); frameScheduler?.suspend(); }
		function restoreRuntime() { if (state !== "suspended") return; minimized = false; setState("running", "restored"); pendingWindowSync = true; pendingBackingSync = true; lastFrameAt = performance.now(); syncWindow(); frameScheduler?.resume(); requestFrame(); }
		syncInputLayout = () => {
			if (state !== "running") return;
			const currentScale = nativeFrameHost.getWindowScaleFactor(inputWindow);
			if (currentScale !== resolution || resizeMode === "adaptive") { requestWindowSync(currentScale !== resolution); syncWindow(); }
		};

		const tick = () => {
			if (closed || state !== "running" || (paused && stepFrames <= 0)) return;
			try {
				pollGpu(); if (state !== "running") return;
				if (pendingWindowSync) syncWindow(); if (state !== "running") return;
				const now = performance.now(); const delta = Math.max(0, now - lastFrameAt); lastFrameAt = now;
				for (const update of [...animations]) { try { update(delta); } catch (error) { fail("animation", error instanceof Error ? error.message : String(error), error); return; } }
				if (rootFastPlan && stage.renderGroup?.structureDidChange) invalidateFastPath();
				if (stage.renderGroup) updateRenderGroupTransforms(stage.renderGroup);
				if (!rootFastPlan) {
					const injected = nativeFrameHost.takeInjectedSurfaceStatus(); if (injected < 0) { handleFrameFailure(injected); return; }
					if (!standardFrame()) return; if (rootFastPlan) requestFrame();
				} else {
					const gpuTarget = renderer.renderTarget.getGpuRenderTarget(renderer.renderTarget.rootRenderTarget) as any;
					const items = rootFastPlan.bundles.map((raw) => { const item = raw as PixiFastBundle; return { bundle: item.bundle.ptr, vertexBuffer: item.vertexBuffer.ptr, vertexData: new Uint8Array(item.batcher.attributeBuffer.rawBinaryData, 0, item.batcher.attributeSize * 4) }; });
					const presented = nativeRender!.present({ rendererUid: renderer.uid, generation: deviceGeneration, submit: () => presentContext(runtimeContext, (surface) => nativeFrameHost.submitBundles({ surface, device: device.ptr, queue: device.queue.ptr, items, msaaView: gpuTarget.msaaTextures?.length ? gpuTarget.descriptor.colorAttachments[0].view.ptr : 0, viewport: renderer.renderTarget.viewport })) });
					if (presented.kind === "standard") { rootFastPlan = null; if (!standardFrame()) return; }
					else if (presented.status !== "success" && presented.status !== "suboptimal") { handleFrameFailure(presentFailureCode(presented.status)); return; }
					else markPresented(presented.status);
				}
				if (paused && stepFrames > 0 && --stepFrames === 0) frameScheduler?.suspend();
			} catch (error) {
				const surfaceStatus = Number((error as any)?.surfaceStatus);
				if (Number.isInteger(surfaceStatus)) handleFrameFailure({ 3: -2, 4: -3, 5: -4, 6: -6 }[surfaceStatus] ?? -5);
				else void requestRecovery(`frame exception: ${error instanceof Error ? error.message : String(error)}`, "surface");
			}
		};
		frameScheduler = createFrameScheduler({ mode: "product", maxFps, frame: tick, schedule: (callback, delay) => delay > 0 ? setTimeout(callback, delay) : setImmediate(callback), cancel: (handle) => { clearTimeout(handle as any); clearImmediate(handle as any); }, clock: () => performance.now() });
		requestFrame = () => frameScheduler?.invalidate();
		bindInputObservers(); inputPollingEnabled = true; nativeInput.poll(); textInput.poll();
		if (!minimized) { syncWindow(); requestFrame(); } else frameScheduler.suspend();

		const frameCounters = (): NativeAppFrameCounters => { const counters = nativeFrameHost.readCounters(); return { submitCount: Number(counters.submitCount), presentCount: Number(counters.presentCount), renderCount, lastStatus: counters.lastStatus }; };
		const monitor = setInterval(() => { if (!closed) { pollGpu(); if (state === "running" && !minimized && performance.now() - lastPresentedAt > 5000 && animations.size) void requestRecovery("presentation stalled", "surface"); } }, 500);
		let disposePromise: Promise<void> | null = null;
		let unregisterTesting = () => {};
		let allowClose = false;
		const dispose = () => disposePromise ??= (async () => {
			if (closed) return;
			closed = true; inputPollingEnabled = false; setState("closing"); clearInterval(monitor);
      windowPresentation?.dispose();
      windowIcon?.dispose();
			rejectPresentWaiters(new Error("Native Pixi application is closing"));
			if (windowSyncTimer !== null) clearTimeout(windowSyncTimer);
			frameScheduler?.close(); animations.clear(); offFocus(); offLifecycle();
			for (const cleanup of [...cleanups].reverse()) { try { await cleanup(); } catch (error) { console.error("[native-app] cleanup failed", error); } }
			cleanups.clear(); unregisterTesting();
			await Promise.race([recoveryPromise ?? Promise.resolve(), new Promise((resolve) => setTimeout(resolve, 1000))]);
			try { await waitForQueue(device); } catch {} try { nativeInput.destroy(); } catch {} try { textInput.destroy(); } catch {}
			try { nativeFrameHost.detachInput(inputWindow); } catch {} if (surfaceWindow !== inputWindow) try { nativeFrameHost.detachInput(surfaceWindow); } catch {}
			try { invalidateFastPath(); } catch {} try { stage.destroy({ children: true }); } catch {} try { destroyRenderer(renderer); } catch {}
			try { releaseContext(runtimeContext); } catch {} try { retireDevice(device, deviceGeneration); } catch {} try { pollGpu(); } catch {}
			if ((globalThis as any).__electrobunCreateAdapterDevice === adapterFactory) { if (previousFactory === undefined) delete (globalThis as any).__electrobunCreateAdapterDevice; else (globalThis as any).__electrobunCreateAdapterDevice = previousFactory; }
			if (previousPresentMode === undefined) delete (globalThis as any).__electrobunPresentMode; else (globalThis as any).__electrobunPresentMode = previousPresentMode;
			setState("closed"); for (const set of Object.values(listeners)) set.clear(); activeApplication = false;
			allowClose = true; try { window.close(); } catch {}
		})();

		const application: NativePixiApplication = {
			stage, window,
      get windowMode(){return windowPresentation?.fullscreen?"fullscreen":"windowed";},
      setWindowMode(mode, pixels=0) {
        if(mode!=="fullscreen"&&mode!=="windowed")throw new TypeError("Invalid window mode");
        if(!Number.isInteger(pixels)||pixels<0||pixels>16)throw new RangeError("Invalid fullscreen overscan");
        if(closed||state==="closing"||state==="closed")throw new Error("Window is closed");
        if(!windowPresentation)throw new Error("Window mode control is unavailable");
        windowPresentation.setMode(mode==="fullscreen",pixels);
        requestWindowSync(true);
      },
      startWindowDrag(){if(!windowPresentation)throw new Error("Window dragging is unavailable");windowPresentation.startDrag();},
      startWindowResize(direction){if(!windowPresentation)throw new Error("Window resizing is unavailable");windowPresentation.startResize(direction);},
      supportsColorDialog: colorDialog !== null,
      chooseColor(color) {
        if (closed || state === "closing" || state === "closed") return Promise.resolve({ ok: false,
          error: { code: "PLATFORM_ERROR", message: "Window is closed" } });
        return colorDialog ? colorDialog(color) : Promise.resolve({ ok: false,
          error: { code: "UNAVAILABLE", message: "System color selection is unavailable" } });
      },
      getWindowFrame() {
        if (closed || state === "closing" || state === "closed") throw new Error("Window is closed");
        const frame = nativeFrameHost.getWindowSnapshot(inputWindow);
        return Object.freeze({ x: frame.frameX, y: frame.frameY, width: frame.frameWidth,
          height: frame.frameHeight, scaleFactor: frame.scaleFactor });
      },
      windowMaterialSupport:windowPresentation?.support??{platform:process.platform,supportsAcrylic:false,supportsMica:false,supportsMicaAlt:false},
      setWindowPresentation(material,appearance){if(!windowPresentation)throw new Error("Window presentation is unavailable");windowPresentation.set(material,appearance);},
      supportsWindowIcon:windowIcon!==null,
      setWindowIcon(png){if(!windowIcon)throw new Error("Window icons are unavailable on this platform");windowIcon.set(png);},
			get renderer() {
				if (state === "recovering" || state === "failed" || state === "closing" || state === "closed") {
					throw new Error("Native Pixi renderer is unavailable while application state is " + state + "; await nextPresent()");
				}
				return renderer;
			},
			get screen() {
				if (state === "recovering" || state === "failed" || state === "closing" || state === "closed") {
					throw new Error("Native Pixi screen is unavailable while application state is " + state + "; await nextPresent()");
				}
				return renderer.view.screen;
			},
			get resolution() { return resolution; },
			get contentSize() { return Object.freeze({ ...contentSize }); }, get state() { return state; }, get nativeInput() { return nativeInput; }, textInput,
			invalidate: requestFrame,
			nextPresent() {
				if (closed || state === "failed" || state === "closing" || state === "closed") {
					return Promise.reject(new Error("Cannot wait for presentation while application state is " + state));
				}
				return new Promise<void>((resolve, reject) => { presentWaiters.add({ resolve, reject }); });
			},
			animate(update) {
				if (closed) return () => {};
				animations.add(update); const release = frameScheduler!.animate(); let stopped = false;
				return () => { if (stopped) return; stopped = true; animations.delete(update); release(); };
			},
			on(type, listener) { if (closed) return () => {}; (listeners[type] as Set<any>).add(listener); return () => { (listeners[type] as Set<any>).delete(listener); }; },
			dispose,
			beforeClose(listener) { closeGuards.add(listener); return () => { closeGuards.delete(listener); }; },
		};
		const diagnostics = (): NativeAppDiagnostics => {
			snapshot = nativeFrameHost.getWindowSnapshot(inputWindow); const input = nativeFrameHost.readInputDiagnostics();
			const frame = window.getFrame();
			const display = displayFor(frame);
			let renderTarget: unknown;
			try {
				const rootTarget = renderer.renderTarget.rootRenderTarget;
				const gpuTarget = rootTarget && renderer.renderTarget.getGpuRenderTarget(rootTarget) as any;
				const colorSource = rootTarget?.colorAttachments?.[0]?.texture;
				const msaaSource = gpuTarget?.msaaTextures?.[0];
				const msaaGpu = msaaSource?._gpuData?.[renderer.uid]?.gpuTexture;
				renderTarget = {
					canvas: { width: canvas.width, height: canvas.height }, context: { width: canvas.width, height: canvas.height },
					colorSource: colorSource && { width: colorSource.width, height: colorSource.height, pixelWidth: colorSource.pixelWidth, pixelHeight: colorSource.pixelHeight, resolution: colorSource._resolution },
					gpuTarget: gpuTarget && { width: gpuTarget.width, height: gpuTarget.height },
					msaaSource: msaaSource && { width: msaaSource.width, height: msaaSource.height, pixelWidth: msaaSource.pixelWidth, pixelHeight: msaaSource.pixelHeight, resolution: msaaSource._resolution },
					msaaGpu: msaaGpu && { width: msaaGpu.width, height: msaaGpu.height },
				};
			} catch (error) { renderTarget = { error: String(error) }; }
			return {
				runtime: { state, deviceGeneration, surfaceGeneration, recoveryCount, paused, minimized },
				host: { abiVersion: nativeFrameHost.abiVersion, capabilities: `0x${nativeFrameHost.capabilities.toString(16)}`, windows: { surface: surfaceWindow, input: inputWindow, text: inputWindow }, textInputActive: textInput.active },
				window: {
					frame, contentSize: { ...contentSize }, resolution, resizeMode,
					display: { id: display.id, bounds: display.bounds },
					displays: Screen.getAllDisplays().map(({ id, bounds, scaleFactor }) => ({ id, bounds, scaleFactor })),
					snapshot: { ...snapshot, displayId: snapshot.displayId.toString() },
				},
				gpu: { preference: activePreference, name: adapterName, type: adapterType },
				frame: { ...frameCounters(), maxFps, fastBundleCount: rootFastPlan?.bundles.length ?? 0, fastFallback, lastPresentAgeMs: performance.now() - lastPresentedAt },
				renderTarget,
				input: { captured: nativeInput.hasPointerCapture(), nativeCaptured: nativeFrameHost.hasMouseCapture(inputWindow), lastCursor: nativeFrameHost.getLastCursor(inputWindow), queued: input.queued.toString(), dropped: input.dropped.toString(), coalesced: input.coalesced.toString(), duplicates: input.duplicates.toString(), nativeEvents: nativeInputEvents.slice(-64) },
				lastError,
				events: runtimeEvents.slice(-64),
			};
		};
		unregisterTesting = registerNativePixiApplicationTesting(application, {
			diagnostics,
			handles: () => ({ surfaceWindow, inputWindow, route, deviceGeneration, surfaceGeneration }),
			pause: () => { paused = true; frameScheduler?.suspend(); },
			resume: () => { paused = false; stepFrames = 0; lastFrameAt = performance.now(); frameScheduler?.resume(); requestFrame(); },
			step: (frames = 1) => { paused = true; stepFrames = Math.max(1, Math.min(1000, Math.floor(frames))); frameScheduler?.resume(); requestFrame(); },
			switchGpu: async (preference) => { if (preference !== activePreference) await requestRecovery(`GPU switch ${activePreference} -> ${preference}`, "surface", preference, false); },
			recover: () => requestRecovery("manual recovery", "surface", activePreference, false),
			injectFault: (kind: NativeAppFault) => {
				const status = kind === "device-lost" ? nativeFrameHost.forceDeviceLoss(device.ptr)
					: kind === "validation" ? nativeFrameHost.injectGpuError(device.ptr, 2, BigInt(deviceGeneration))
					: kind === "out-of-memory" ? nativeFrameHost.injectGpuError(device.ptr, 3, BigInt(deviceGeneration))
					: kind === "internal" ? nativeFrameHost.injectGpuError(device.ptr, 4, BigInt(deviceGeneration))
					: nativeFrameHost.injectSurfaceStatus(({ "surface-timeout": 3, "surface-outdated": 4, "surface-lost": 5, "surface-out-of-memory": 6 } as const)[kind]);
				if (status < 0) throw new Error(`Fault injection failed (${status})`); requestFrame();
			},
			frameCounters,
			syncWindow: requestWindowSync,
			clientToScreen: (x, y) => nativeFrameHost.clientToScreen(inputWindow, x, y),
			recordEvent,
			resetInputEvents: () => { nativeInputEvents.length = 0; },
			addCleanup: (cleanup) => { cleanups.add(cleanup); return () => { cleanups.delete(cleanup); }; },
		});
		window.on("will-close", (event: any) => {
			if (allowClose || closed) return;
			event.response = { allow: false };
			if (closeRequest) return;
			closeRequest = (async () => {
				for (const guard of [...closeGuards]) if(await guard()===false)return;
				await dispose();
				allowClose = true;
				window.close();
			})().catch(error => { console.error("[native-app] close guard rejected; window remains open", error); })
				.finally(() => { closeRequest = null; });
		});
		window.on("close", () => { void dispose(); });
		startupCleanup.length = 0;
		return application;
	} catch (error) {
		for (const cleanup of startupCleanup.reverse()) { try { await cleanup(); } catch {} }
		activeApplication = false;
		throw error;
	}
}
