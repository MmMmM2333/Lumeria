import * as BunFFI from "bun:ffi";
import { isAbsolute, join } from "path";
import { decodeNativeInputEvent, INPUT_EVENT_BYTES } from "./native-input-event";

export { decodeNativeInputEvent } from "./native-input-event";

const ABI_VERSION = 4;
const CAP_MULTI_BUNDLE = 1n << 0n;
const CAP_SURFACE_STATUS_V2 = 1n << 1n;
const CAP_WINDOW_INPUT = 1n << 2n;
const CAP_TEXT_INPUT = 1n << 3n;
const CAP_JOBS = 1n << 4n;
const CAP_ACCESSIBILITY_BRIDGE = 1n << 5n;
const CAP_PLATFORM_FILES = 1n << 7n;
const CAP_WINDOW_SNAPSHOT = 1n << 8n;
const CAP_INPUT_DIAGNOSTICS = 1n << 9n;
const CAP_INPUT_WAKE = 1n << 10n;
const CAP_LIFECYCLE_EVENTS = 1n << 11n;
const CAP_TOUCH_INPUT = 1n << 12n;
const REQUIRED_CAPABILITIES = CAP_MULTI_BUNDLE | CAP_SURFACE_STATUS_V2 | CAP_WINDOW_INPUT | CAP_TEXT_INPUT | CAP_JOBS
	| CAP_ACCESSIBILITY_BRIDGE | CAP_PLATFORM_FILES | CAP_WINDOW_SNAPSHOT | CAP_INPUT_DIAGNOSTICS | CAP_INPUT_WAKE
	| CAP_LIFECYCLE_EVENTS | CAP_TOUCH_INPUT;
const MAX_BUNDLES_PER_FRAME = 4096;
const WINDOW_SNAPSHOT_BYTES = 48;
const MAX_PENDING_INPUT_EVENTS_PER_ROUTE = 4096;
const TEXT_EVENT_META_BYTES = 40;
const JOB_EVENT_META_BYTES = 48;
const MAX_TEXT_UNITS = 32768;
const MAX_JOB_REQUEST_BYTES = 32 * 1024;
const MAX_JOB_RESULT_BYTES = 64 * 1024 * 1024;
const ACCESSIBILITY_ACTION_META_BYTES = 32;
const MAX_ACCESSIBILITY_SNAPSHOT_BYTES = 4 * 1024 * 1024;
const MAX_ACCESSIBILITY_ACTION_BYTES = 4 * 1024 * 1024;
const MAX_PENDING_ACCESSIBILITY_ACTIONS_PER_ROUTE = 256;
const FILE_DROP_META_BYTES = 32;
const MAX_FILE_DROP_UNITS = 1024 * 1024;

type Pointer = number;
export type GpuPowerPreference = 0 | 1 | 2;
export type SurfaceFaultStatus = 3 | 4 | 5 | 6;
export type GpuErrorType = 2 | 3 | 4 | 5;
export type NativeInputKind = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16
	| 17 | 18 | 19 | 20 | 21;
export const nativeInputKinds = {
	pointerMove: 1,
	pointerDown: 2,
	pointerUp: 3,
	pointerEnter: 4,
	pointerLeave: 5,
	pointerCancel: 6,
	captureGained: 7,
	captureLost: 8,
	wheel: 9,
	focus: 10,
	blur: 11,
	keyDown: 12,
	keyUp: 13,
	windowMove: 14,
	windowResize: 15,
	dpiChanged: 16,
	displayChanged: 17,
	minimized: 18,
	restored: 19,
	suspend: 20,
	resume: 21,
} as const satisfies Record<string, NativeInputKind>;
export type NativeCursorKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type NativeTextEventKind = 1 | 2 | 3 | 4 | 5;
export type NativeJobKind = 1 | 2;
export type NativeJobEventKind = 1 | 2 | 3 | 4;
export type NativeAccessibilityActionKind = 1 | 2 | 3 | 4;

export interface NativeBundleItem {
	bundle: Pointer;
	vertexBuffer: Pointer;
	vertexData: Uint8Array;
}

export interface NativeBundleSubmission {
	surface: Pointer;
	device: Pointer;
	queue: Pointer;
	items: readonly NativeBundleItem[];
	msaaView?: Pointer;
	viewport: Readonly<{ x: number; y: number; width: number; height: number }>;
}

export interface NativeGpuEvent {
	kind: number;
	generation: bigint;
	code: number;
	message: string;
}

export interface NativeFrameCounters {
	submitCount: bigint;
	presentCount: bigint;
	lastStatus: number;
}

/** All sizes and positions are Win32 physical pixels. Divide by scaleFactor only when a DIP value is needed. */
export interface NativeWindowSnapshot {
	clientWidth: number;
	clientHeight: number;
	frameX: number;
	frameY: number;
	frameWidth: number;
	frameHeight: number;
	dpi: number;
	scaleFactor: number;
	/** Session-stable HMONITOR identity; it is not persistent across boots or display-topology changes. */
	displayId: bigint;
	minimized: boolean;
	maximized: boolean;
	focused: boolean;
}

export interface NativeInputDiagnostics {
	queued: bigint;
	dropped: bigint;
	coalesced: bigint;
	duplicates: bigint;
}

export interface NativeInputEvent {
	route: bigint;
	timestamp: bigint;
	kind: NativeInputKind;
	modifiers: number;
	x: number;
	y: number;
	movementX: number;
	movementY: number;
	button: number;
	buttons: number;
	wheelX: number;
	wheelY: number;
	deltaMode: number;
	keyCode: number;
	scanCode: number;
	repeat: boolean;
	detail: number;
	pointerId: number;
	screenX: number;
	screenY: number;
	pointerType?: "mouse" | "touch";
	isPrimary: boolean;
	width: number;
	height: number;
	pressure: number;
}

export interface TextInputRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface NativeTextEvent {
	route: bigint;
	timestamp: bigint;
	kind: NativeTextEventKind;
	code: number;
	cursor: number;
	text: string;
}

export interface NativeFileDropEvent {
	route: bigint;
	timestamp: bigint;
	x: number;
	y: number;
	paths: readonly string[];
}

export interface NativeJobEvent {
	jobId: bigint;
	eventKind: NativeJobEventKind;
	jobKind: NativeJobKind;
	code: number;
	completed: bigint;
	total: bigint;
	data: Uint8Array;
	message?: string;
}

export interface NativeAccessibilityActionEvent {
	route: bigint;
	nodeId: bigint;
	action: NativeAccessibilityActionKind;
	code: number;
	data: Uint8Array;
}

const configuredLibrary = process.env.ELECTROBUN_PIXI_NATIVE_FRAME_DLL;
if (configuredLibrary && !isAbsolute(configuredLibrary)) {
	throw new Error("ELECTROBUN_PIXI_NATIVE_FRAME_DLL must be an absolute path");
}
const library = (BunFFI as any).dlopen(configuredLibrary || join(import.meta.dir, "native-frame.dll"), {
  pixi_set_display_change_callback: { args: ["ptr"], returns: "void" },
	pixi_host_abi_version: { args: [], returns: "u32" },
	pixi_host_capabilities: { args: [], returns: "u64" },
	pixi_submit_bundles: {
		args: ["ptr", "ptr", "ptr", "ptr", "u64", "ptr", "f32", "f32", "f32", "f32"],
		returns: "i32",
	},
	pixi_create_adapter_device: {
		args: ["ptr", "ptr", "u32", "u64", "ptr", "ptr", "u64"],
		returns: "i32",
	},
	pixi_poll_gpu_event: { args: ["ptr", "ptr", "u64"], returns: "i32" },
	pixi_get_frame_counters: { args: ["ptr"], returns: "i32" },
	pixi_inject_surface_status: { args: ["u32"], returns: "i32" },
	pixi_take_injected_surface_status: { args: [], returns: "i32" },
	pixi_force_device_loss: { args: ["ptr"], returns: "i32" },
	pixi_inject_gpu_error: { args: ["ptr", "u32", "u64"], returns: "i32" },
	pixi_get_window_scale_factor: { args: ["ptr"], returns: "f64" },
	pixi_get_window_snapshot: { args: ["ptr", "ptr"], returns: "i32" },
	pixi_client_to_screen: { args: ["ptr", "i32", "i32", "ptr"], returns: "i32" },
	pixi_screen_to_client: { args: ["ptr", "i32", "i32", "ptr"], returns: "i32" },
	pixi_resolve_input_window: { args: ["ptr"], returns: "ptr" },
	pixi_is_window_resizing: { args: ["ptr"], returns: "i32" },
	pixi_attach_input: { args: ["ptr", "u64"], returns: "i32" },
	pixi_detach_input: { args: ["ptr"], returns: "i32" },
	pixi_poll_input_event: { args: ["ptr"], returns: "i32" },
	pixi_get_input_diagnostics: { args: ["ptr"], returns: "i32" },
	pixi_register_input_wake: { args: ["ptr", "ptr"], returns: "i32" },
	pixi_clear_input_wake: { args: [], returns: "i32" },
	pixi_set_mouse_capture: { args: ["ptr"], returns: "i32" },
	pixi_release_mouse_capture: { args: ["ptr"], returns: "i32" },
	pixi_has_mouse_capture: { args: ["ptr"], returns: "i32" },
	pixi_set_fullscreen_layer: { args: ["ptr", "u32"], returns: "i32" },
	pixi_set_cursor: { args: ["ptr", "u32"], returns: "i32" },
	pixi_get_cursor: { args: ["ptr"], returns: "i32" },
	pixi_begin_text_input: { args: ["ptr", "i32", "i32", "i32", "i32"], returns: "i32" },
	pixi_update_caret_rect: { args: ["ptr", "i32", "i32", "i32", "i32"], returns: "i32" },
	pixi_end_text_input: { args: ["ptr"], returns: "i32" },
	pixi_poll_text_event: { args: ["ptr", "ptr", "u64"], returns: "i32" },
	pixi_poll_file_drop: { args: ["ptr", "ptr", "u64"], returns: "i32" },
	pixi_save_file_dialog: {
		args: ["ptr", "u64", "ptr", "u64", "ptr", "u64", "ptr", "u64"], returns: "i32",
	},
	pixi_drag_out: { args: ["ptr", "ptr", "u64"], returns: "i32" },
	pixi_start_job: { args: ["u32", "ptr", "u64"], returns: "u64" },
	pixi_cancel_job: { args: ["u64"], returns: "i32" },
	pixi_poll_job_event: { args: ["ptr", "ptr", "u64"], returns: "i32" },
	pixi_shutdown_jobs: { args: [], returns: "i32" },
	pixi_uia_provider_available: { args: [], returns: "u32" },
	pixi_attach_accessibility: { args: ["ptr", "u64"], returns: "i32" },
	pixi_update_accessibility_snapshot: { args: ["ptr", "ptr", "u64"], returns: "i32" },
	pixi_poll_accessibility_action: { args: ["ptr", "ptr", "u64"], returns: "i32" },
	pixi_detach_accessibility: { args: ["ptr"], returns: "i32" },
});

const symbols = library.symbols as {
  pixi_set_display_change_callback(callback:Pointer|null):void;
	pixi_host_abi_version(): number;
	pixi_host_capabilities(): bigint | number;
	pixi_submit_bundles(
		surface: Pointer, device: Pointer, queue: Pointer, items: Pointer, itemCount: bigint,
		msaaView: Pointer, x: number, y: number, width: number, height: number,
	): number;
	pixi_create_adapter_device(
		instance: Pointer, surface: Pointer, preference: GpuPowerPreference, generation: bigint,
		output: Pointer, adapterName: Pointer, adapterNameCapacity: bigint,
	): number;
	pixi_poll_gpu_event(output: Pointer, message: Pointer, messageCapacity: bigint): number;
	pixi_get_frame_counters(output: Pointer): number;
	pixi_inject_surface_status(status: SurfaceFaultStatus): number;
	pixi_take_injected_surface_status(): number;
	pixi_force_device_loss(device: Pointer): number;
	pixi_inject_gpu_error(device: Pointer, type: GpuErrorType, generation: bigint): number;
	pixi_get_window_scale_factor(window: Pointer): number;
	pixi_get_window_snapshot(window: Pointer, output: Pointer): number;
	pixi_client_to_screen(window: Pointer, x: number, y: number, output: Pointer): number;
	pixi_screen_to_client(window: Pointer, x: number, y: number, output: Pointer): number;
	pixi_resolve_input_window(window: Pointer): Pointer | null;
	pixi_is_window_resizing(window: Pointer): number;
	pixi_attach_input(window: Pointer, route: bigint): number;
	pixi_detach_input(window: Pointer): number;
	pixi_poll_input_event(output: Pointer): number;
	pixi_get_input_diagnostics(output: Pointer): number;
	pixi_register_input_wake(callback: Pointer, userData: Pointer): number;
	pixi_clear_input_wake(): number;
	pixi_set_mouse_capture(window: Pointer): number;
	pixi_release_mouse_capture(window: Pointer): number;
	pixi_has_mouse_capture(window: Pointer): number;
	pixi_set_fullscreen_layer(window: Pointer, enabled: number): number;
	pixi_set_cursor(window: Pointer, kind: NativeCursorKind): number;
	pixi_get_cursor(window: Pointer): number;
	pixi_begin_text_input(window: Pointer, x: number, y: number, width: number, height: number): number;
	pixi_update_caret_rect(window: Pointer, x: number, y: number, width: number, height: number): number;
	pixi_end_text_input(window: Pointer): number;
	pixi_poll_text_event(output: Pointer, text: Pointer, textCapacity: bigint): number;
	pixi_poll_file_drop(output: Pointer, paths: Pointer, pathsCapacity: bigint): number;
	pixi_save_file_dialog(
		defaultName: Pointer, defaultNameLength: bigint,
		startingFolder: Pointer, startingFolderLength: bigint,
		filter: Pointer, filterLength: bigint,
		output: Pointer, outputCapacity: bigint,
	): number;
	pixi_drag_out(window: Pointer, paths: Pointer, pathsLength: bigint): number;
	pixi_start_job(kind: NativeJobKind, request: Pointer, requestLength: bigint): bigint | number;
	pixi_cancel_job(jobId: bigint): number;
	pixi_poll_job_event(output: Pointer, data: Pointer, dataCapacity: bigint): number;
	pixi_shutdown_jobs(): number;
	pixi_uia_provider_available(): number;
	pixi_attach_accessibility(window: Pointer, route: bigint): number;
	pixi_update_accessibility_snapshot(window: Pointer, snapshot: Pointer, snapshotLength: bigint): number;
	pixi_poll_accessibility_action(output: Pointer, data: Pointer, dataCapacity: bigint): number;
	pixi_detach_accessibility(window: Pointer): number;
};

export const ptr = (view: ArrayBufferView): Pointer => (BunFFI as any).ptr(view);

const assertPointer = (value: Pointer, name: string) => {
	if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a non-zero pointer`);
};

const assertRoute = (route: bigint) => {
	if (typeof route !== "bigint" || route <= 0n || route > 0xffff_ffff_ffff_ffffn) {
		throw new RangeError("route must be a non-zero u64");
	}
};

const assertTextInputRect = ({ x, y, width, height }: TextInputRect) => {
	const values = [x, y, width, height];
	if (!values.every(Number.isInteger) || values.some((value) => value < -0x8000_0000 || value > 0x7fff_ffff)
		|| width < 0 || height < 0 || x + width > 0x7fff_ffff || y + height > 0x7fff_ffff) {
		throw new RangeError("text input rect must contain valid i32 coordinates and non-negative dimensions");
	}
};

const abiVersion = symbols.pixi_host_abi_version();
const capabilities = BigInt(symbols.pixi_host_capabilities());
if (abiVersion !== ABI_VERSION || (capabilities & REQUIRED_CAPABILITIES) !== REQUIRED_CAPABILITIES) {
	throw new Error(
		`native-frame ABI mismatch: expected version ${ABI_VERSION} capabilities 0x${REQUIRED_CAPABILITIES.toString(16)}, `
		+ `got version ${abiVersion} capabilities 0x${capabilities.toString(16)}`,
	);
}

const decoder = new TextDecoder();
const inputEventBytes = new Uint8Array(INPUT_EVENT_BYTES);
const inputEventView = new DataView(inputEventBytes.buffer, inputEventBytes.byteOffset, inputEventBytes.byteLength);
const windowSnapshotBytes = new Uint8Array(WINDOW_SNAPSHOT_BYTES);
const windowSnapshotView = new DataView(
	windowSnapshotBytes.buffer, windowSnapshotBytes.byteOffset, windowSnapshotBytes.byteLength,
);
const inputDiagnostics = new BigUint64Array(4);
const convertedPoint = new Int32Array(2);
const attachedInputRoutes = new Map<Pointer, bigint>();
const pendingInputEvents = new Map<bigint, NativeInputEvent[]>();
let inputWakeCallback: { ptr: Pointer; close(): void } | null = null;
let inputWakeHandler: (() => void) | null = null;
let inputWakeScheduled = false;
let inputWakeGeneration = 0;
const textEventMetaBytes = new Uint8Array(TEXT_EVENT_META_BYTES);
const textEventMetaView = new DataView(
	textEventMetaBytes.buffer, textEventMetaBytes.byteOffset, textEventMetaBytes.byteLength,
);
let textEventUnits = new Uint16Array(256);
const fileDropMetaBytes = new Uint8Array(FILE_DROP_META_BYTES);
const fileDropMetaView = new DataView(fileDropMetaBytes.buffer, fileDropMetaBytes.byteOffset, fileDropMetaBytes.byteLength);
let fileDropUnits = new Uint16Array(512);
const pendingFileDrops = new Map<bigint, NativeFileDropEvent[]>();
const jobEventMetaBytes = new Uint8Array(JOB_EVENT_META_BYTES);
const jobEventMetaView = new DataView(
	jobEventMetaBytes.buffer, jobEventMetaBytes.byteOffset, jobEventMetaBytes.byteLength,
);
const jobEventData = new Uint8Array(4096);
const strictUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
const accessibilityActionMetaBytes = new Uint8Array(ACCESSIBILITY_ACTION_META_BYTES);
const accessibilityActionMetaView = new DataView(
	accessibilityActionMetaBytes.buffer,
	accessibilityActionMetaBytes.byteOffset,
	accessibilityActionMetaBytes.byteLength,
);
let accessibilityActionData = new Uint8Array(256);
const attachedAccessibilityRoutes = new Map<Pointer, bigint>();
const pendingAccessibilityActions = new Map<bigint, NativeAccessibilityActionEvent[]>();

const utf16String = (units: Uint16Array, length: number) => {
	let text = "";
	for (let offset = 0; offset < length; offset += 4096) {
		text += String.fromCharCode(...units.subarray(offset, Math.min(offset + 4096, length)));
	}
	return text;
};

const utf16Units = (value: string, field: string) => {
	if (value.includes("\0")) throw new TypeError(`${field} must not contain NUL`);
	const units = new Uint16Array(value.length || 1);
	for (let index = 0; index < value.length; index++) units[index] = value.charCodeAt(index);
	return { units, length: value.length };
};

const assertPoint = (x: number, y: number) => {
	if (![x, y].every(Number.isInteger) || [x, y].some((value) => value < -0x8000_0000 || value > 0x7fff_ffff)) {
		throw new RangeError("point coordinates must fit i32");
	}
};

const clearInputWake = () => {
	const status = symbols.pixi_clear_input_wake();
	inputWakeHandler = null;
	inputWakeScheduled = false;
	inputWakeGeneration++;
	return status;
};

const setInputWake = (handler: () => void) => {
	if (inputWakeHandler) clearInputWake();
	inputWakeHandler = handler;
	const callback = inputWakeCallback ??= new (BunFFI as any).JSCallback(
		() => {
			if (inputWakeScheduled || !inputWakeHandler) return;
			const generation = inputWakeGeneration;
			inputWakeScheduled = true;
			queueMicrotask(() => {
				if (generation !== inputWakeGeneration) return;
				inputWakeScheduled = false;
				inputWakeHandler?.();
			});
		},
		{ args: ["ptr"], returns: "void", threadsafe: true },
	) as { ptr: Pointer; close(): void };
	const status = symbols.pixi_register_input_wake(callback.ptr, 0);
	if (status < 0) {
		inputWakeHandler = null;
		inputWakeGeneration++;
	}
	return status;
};

export const nativeFrameHost = {
  /** Callback is native, nonblocking, and must remain resident until process exit. */
  setDisplayChangeCallback(callback:Pointer|null){symbols.pixi_set_display_change_callback(callback);},
	abiVersion,
	capabilities,

	createAdapterDevice(
		instance: Pointer,
		surface: Pointer,
		preference: GpuPowerPreference,
		generation: bigint,
		output: BigUint64Array,
	): { status: number; adapterName: string } {
		assertPointer(instance, "instance");
		assertPointer(surface, "surface");
		if (preference !== 0 && preference !== 1 && preference !== 2) throw new RangeError("preference must be 0, 1, or 2");
		if (output.length < 2) throw new RangeError("adapter/device output must contain two u64 slots");
		if (generation < 0n || generation > 0xffff_ffff_ffff_ffffn) throw new RangeError("generation must fit u64");
		const adapterName = new Uint8Array(256);
		const status = symbols.pixi_create_adapter_device(
			instance, surface, preference, generation, ptr(output), ptr(adapterName), BigInt(adapterName.length),
		);
		const end = adapterName.indexOf(0);
		return { status, adapterName: decoder.decode(adapterName.subarray(0, end < 0 ? undefined : end)) };
	},

	pollGpuEvent(): NativeGpuEvent | null {
		const output = new BigUint64Array(2);
		const message = new Uint8Array(1024);
		const kind = symbols.pixi_poll_gpu_event(ptr(output), ptr(message), BigInt(message.length));
		if (kind < 0) throw new Error(`poll GPU event failed (${kind})`);
		if (kind === 0) return null;
		const end = message.indexOf(0);
		return {
			kind,
			generation: output[0],
			code: Number(output[1]),
			message: decoder.decode(message.subarray(0, end < 0 ? undefined : end)),
		};
	},

	readCounters(): NativeFrameCounters {
		const output = new BigUint64Array(3);
		const status = symbols.pixi_get_frame_counters(ptr(output));
		if (status < 0) throw new Error(`read native frame counters failed (${status})`);
		return {
			submitCount: output[0],
			presentCount: output[1],
			lastStatus: Number(BigInt.asIntN(64, output[2])),
		};
	},

	injectSurfaceStatus(status: SurfaceFaultStatus): number {
		return symbols.pixi_inject_surface_status(status);
	},
	takeInjectedSurfaceStatus(): number {
		return symbols.pixi_take_injected_surface_status();
	},

	forceDeviceLoss(device: Pointer): number {
		assertPointer(device, "device");
		return symbols.pixi_force_device_loss(device);
	},

	injectGpuError(device: Pointer, type: GpuErrorType, generation: bigint): number {
		assertPointer(device, "device");
		if (generation < 0n || generation > 0xffff_ffff_ffff_ffffn) throw new RangeError("generation must fit u64");
		return symbols.pixi_inject_gpu_error(device, type, generation);
	},

	getWindowScaleFactor(window: Pointer): number {
		assertPointer(window, "window");
		return symbols.pixi_get_window_scale_factor(window);
	},

	getWindowSnapshot(window: Pointer): NativeWindowSnapshot {
		assertPointer(window, "window");
		const status = symbols.pixi_get_window_snapshot(window, ptr(windowSnapshotBytes));
		if (status < 0) throw new Error(`native window snapshot failed (${status})`);
		const flags = windowSnapshotView.getUint32(28, true);
		return {
			clientWidth: windowSnapshotView.getInt32(0, true),
			clientHeight: windowSnapshotView.getInt32(4, true),
			frameX: windowSnapshotView.getInt32(8, true),
			frameY: windowSnapshotView.getInt32(12, true),
			frameWidth: windowSnapshotView.getInt32(16, true),
			frameHeight: windowSnapshotView.getInt32(20, true),
			dpi: windowSnapshotView.getUint32(24, true),
			scaleFactor: windowSnapshotView.getFloat64(32, true),
			displayId: windowSnapshotView.getBigUint64(40, true),
			minimized: (flags & 1) !== 0,
			maximized: (flags & 2) !== 0,
			focused: (flags & 4) !== 0,
		};
	},

	clientToScreen(window: Pointer, x: number, y: number): Readonly<{ x: number; y: number }> {
		assertPointer(window, "window");
		assertPoint(x, y);
		const status = symbols.pixi_client_to_screen(window, x, y, ptr(convertedPoint));
		if (status < 0) throw new Error(`client-to-screen conversion failed (${status})`);
		return { x: convertedPoint[0], y: convertedPoint[1] };
	},

	screenToClient(window: Pointer, x: number, y: number): Readonly<{ x: number; y: number }> {
		assertPointer(window, "window");
		assertPoint(x, y);
		const status = symbols.pixi_screen_to_client(window, x, y, ptr(convertedPoint));
		if (status < 0) throw new Error(`screen-to-client conversion failed (${status})`);
		return { x: convertedPoint[0], y: convertedPoint[1] };
	},

	resolveInputWindow(window: Pointer): Pointer {
		assertPointer(window, "window");
		const resolved = symbols.pixi_resolve_input_window(window);
		if (!resolved) throw new Error("native input window could not be resolved");
		return resolved;
	},

	isWindowResizing(window: Pointer): boolean {
		assertPointer(window, "window");
		const status = symbols.pixi_is_window_resizing(window);
		if (status < 0) throw new Error(`native input window resize state failed: ${status}`);
		return status > 0;
	},

	attachInput(window: Pointer, route: bigint): number {
		assertPointer(window, "window");
		assertRoute(route);
		if (attachedInputRoutes.has(window)) throw new Error(`native input window ${window} is already attached`);
		const status = symbols.pixi_attach_input(window, route);
		if (status > 0) attachedInputRoutes.set(window, route);
		return status;
	},

	setInputWakeHandler(handler: (() => void) | null): number {
		if (handler !== null && typeof handler !== "function") throw new TypeError("input wake handler must be a function or null");
		return handler === null ? clearInputWake() : setInputWake(handler);
	},

	readInputDiagnostics(): NativeInputDiagnostics {
		const status = symbols.pixi_get_input_diagnostics(ptr(inputDiagnostics));
		if (status < 0) throw new Error(`read native input diagnostics failed (${status})`);
		return {
			queued: inputDiagnostics[0],
			dropped: inputDiagnostics[1],
			coalesced: inputDiagnostics[2],
			duplicates: inputDiagnostics[3],
		};
	},

	detachInput(window: Pointer): number {
		assertPointer(window, "window");
		const status = symbols.pixi_detach_input(window);
		if (status >= 0) {
			const route = attachedInputRoutes.get(window);
			if (route !== undefined) pendingInputEvents.delete(route);
			attachedInputRoutes.delete(window);
		}
		return status;
	},

	pollInputEvent(route?: bigint): NativeInputEvent | null {
		if (route !== undefined) {
			assertRoute(route);
			const pending = pendingInputEvents.get(route);
			const event = pending?.shift();
			if (pending?.length === 0) pendingInputEvents.delete(route);
			if (event) return event;
		}
		for (;;) {
			const status = symbols.pixi_poll_input_event(ptr(inputEventBytes));
			if (status < 0) throw new Error(`poll input event failed (${status})`);
			if (status === 0) return null;
			const event = decodeNativeInputEvent(inputEventView);
			assertRoute(event.route);
			if (route === undefined || event.route === route) return event;
			if (![...attachedInputRoutes.values()].includes(event.route)) {
				throw new Error(`native input event references unattached route ${event.route}`);
			}
			const pending = pendingInputEvents.get(event.route) ?? [];
			if (pending.length >= MAX_PENDING_INPUT_EVENTS_PER_ROUTE) pending.shift();
			pending.push(event);
			pendingInputEvents.set(event.route, pending);
		}
	},

	setMouseCapture(window: Pointer): number {
		assertPointer(window, "window");
		return symbols.pixi_set_mouse_capture(window);
	},

	releaseMouseCapture(window: Pointer): number {
		assertPointer(window, "window");
		return symbols.pixi_release_mouse_capture(window);
	},

	hasMouseCapture(window: Pointer): boolean {
		assertPointer(window, "window");
		const status = symbols.pixi_has_mouse_capture(window);
		if (status < 0) throw new Error(`native mouse capture query failed (${status})`);
		return status > 0;
	},

	setFullscreenLayer(window: Pointer, enabled: boolean): void {
		assertPointer(window, "window");
		const status = symbols.pixi_set_fullscreen_layer(window, enabled ? 1 : 0);
		if (status < 0) throw new Error(`native fullscreen layer failed (${status})`);
	},

	setCursor(window: Pointer, kind: NativeCursorKind): number {
		assertPointer(window, "window");
		if (!Number.isInteger(kind) || kind < 0 || kind > 10) throw new RangeError("cursor kind must be an integer from 0 to 10");
		return symbols.pixi_set_cursor(window, kind);
	},

	getLastCursor(window: Pointer): NativeCursorKind {
		assertPointer(window, "window");
		const kind = symbols.pixi_get_cursor(window);
		if (kind < 0 || kind > 10) throw new Error(`native cursor query failed (${kind})`);
		return kind as NativeCursorKind;
	},

	beginTextInput(window: Pointer, rect: TextInputRect): number {
		assertPointer(window, "window");
		assertTextInputRect(rect);
		return symbols.pixi_begin_text_input(window, rect.x, rect.y, rect.width, rect.height);
	},

	/** 0: session ended (including native blur); 1/2: updated; negative: error. */
	updateTextInput(window: Pointer, rect: TextInputRect): number {
		assertPointer(window, "window");
		assertTextInputRect(rect);
		return symbols.pixi_update_caret_rect(window, rect.x, rect.y, rect.width, rect.height);
	},

	endTextInput(window: Pointer): number {
		assertPointer(window, "window");
		return symbols.pixi_end_text_input(window);
	},

	pollTextEvent(): NativeTextEvent | null {
		let status = symbols.pixi_poll_text_event(
			ptr(textEventMetaBytes), ptr(textEventUnits), BigInt(textEventUnits.length),
		);
		if (status === -2) {
			const required = textEventMetaView.getUint32(28, true);
			if (required <= textEventUnits.length || required > MAX_TEXT_UNITS) {
				throw new Error(`native text event requested invalid UTF-16 length ${required}`);
			}
			textEventUnits = new Uint16Array(required);
			status = symbols.pixi_poll_text_event(
				ptr(textEventMetaBytes), ptr(textEventUnits), BigInt(textEventUnits.length),
			);
		}
		if (status < 0) throw new Error(`poll text event failed (${status})`);
		if (status === 0) return null;
		const kind = textEventMetaView.getUint32(16, true);
		const textLength = textEventMetaView.getUint32(28, true);
		if (kind < 1 || kind > 5) throw new Error(`native text event has invalid kind ${kind}`);
		if (textLength > textEventUnits.length || textLength > MAX_TEXT_UNITS) {
			throw new Error(`native text event has invalid UTF-16 length ${textLength}`);
		}
		return {
			route: textEventMetaView.getBigUint64(0, true),
			timestamp: textEventMetaView.getBigUint64(8, true),
			kind: kind as NativeTextEventKind,
			code: textEventMetaView.getInt32(20, true),
			cursor: textEventMetaView.getUint32(24, true),
			text: utf16String(textEventUnits, textLength),
		};
	},

	pollFileDrop(route?: bigint): NativeFileDropEvent | null {
		if (route !== undefined) {
			assertRoute(route);
			const pending = pendingFileDrops.get(route);
			const event = pending?.shift();
			if (pending?.length === 0) pendingFileDrops.delete(route);
			if (event) return event;
		}
		for (;;) {
			let units = fileDropUnits;
			let status = symbols.pixi_poll_file_drop(ptr(fileDropMetaBytes), ptr(units), BigInt(units.length));
			if (status === -2) {
				const required = fileDropMetaView.getUint32(28, true);
				if (required <= units.length || required > MAX_FILE_DROP_UNITS) {
					throw new Error(`file drop requested invalid UTF-16 length ${required}`);
				}
				fileDropUnits = units = new Uint16Array(required);
				status = symbols.pixi_poll_file_drop(ptr(fileDropMetaBytes), ptr(units), BigInt(units.length));
			}
			if (status < 0) throw new Error(`poll file drop failed (${status})`);
			if (status === 0) return null;
			const eventRoute = fileDropMetaView.getBigUint64(0, true);
			const pathCount = fileDropMetaView.getUint32(24, true);
			const dataLength = fileDropMetaView.getUint32(28, true);
			if (dataLength > units.length || pathCount === 0 || pathCount > 128) {
				throw new Error("native file drop returned invalid path metadata");
			}
			const paths: string[] = [];
			let start = 0;
			for (let index = 0; index < dataLength; index++) {
				if (units[index] !== 0) continue;
				if (index > start) paths.push(utf16String(units.subarray(start, index), index - start));
				start = index + 1;
			}
			if (paths.length !== pathCount || start !== dataLength) {
				throw new Error("native file drop path payload is malformed");
			}
			const event: NativeFileDropEvent = {
				route: eventRoute,
				timestamp: fileDropMetaView.getBigUint64(8, true),
				x: fileDropMetaView.getInt32(16, true),
				y: fileDropMetaView.getInt32(20, true),
				paths: Object.freeze(paths),
			};
			if (route === undefined || event.route === route) return event;
			const pending = pendingFileDrops.get(event.route) ?? [];
			if (pending.length >= 64) pending.shift();
			pending.push(event);
			pendingFileDrops.set(event.route, pending);
		}
	},

	saveFileDialog(defaultName: string, startingFolder: string, filter: string): string | null {
		const name = utf16Units(defaultName, "defaultName");
		const folder = utf16Units(startingFolder, "startingFolder");
		const filterUnits = new Uint16Array(filter.length);
		for (let index = 0; index < filter.length; index++) filterUnits[index] = filter.charCodeAt(index);
		const output = new Uint16Array(32767);
		const status = symbols.pixi_save_file_dialog(
			ptr(name.units), BigInt(name.length), ptr(folder.units), BigInt(folder.length),
			ptr(filterUnits), BigInt(filterUnits.length), ptr(output), BigInt(output.length),
		);
		if (status < 0) throw new Error(`save file dialog failed (${status})`);
		return status === 0 ? null : utf16String(output, status);
	},

	dragOut(window: Pointer, paths: readonly string[]): number {
		assertPointer(window, "window");
		if (!Array.isArray(paths) || paths.length < 1 || paths.length > 128) {
			throw new RangeError("dragOut paths must contain 1..128 entries");
		}
		const values = paths.map((path, index) => utf16Units(path, `paths[${index}]`));
		const length = values.reduce((sum, value) => sum + value.length + 1, 1);
		if (length > MAX_FILE_DROP_UNITS) throw new RangeError("dragOut path payload is too large");
		const units = new Uint16Array(length);
		let offset = 0;
		for (const value of values) {
			units.set(value.units.subarray(0, value.length), offset);
			offset += value.length + 1;
		}
		const status = symbols.pixi_drag_out(window, ptr(units), BigInt(units.length));
		if (status < 0) throw new Error(`native file drag failed (${status})`);
		return status;
	},

	startJob(kind: NativeJobKind, request: Uint8Array): bigint {
		if (kind !== 1 && kind !== 2) throw new RangeError("job kind must be 1 or 2");
		if (!(request instanceof Uint8Array)) throw new TypeError("job request must be Uint8Array");
		if (request.byteLength === 0 || request.byteLength > MAX_JOB_REQUEST_BYTES) {
			throw new RangeError(`job request must contain 1..${MAX_JOB_REQUEST_BYTES} bytes`);
		}
		return BigInt(symbols.pixi_start_job(kind, ptr(request), BigInt(request.byteLength)));
	},

	cancelJob(jobId: bigint): number {
		if (typeof jobId !== "bigint" || jobId <= 0n || jobId > 0xffff_ffff_ffff_ffffn) {
			throw new RangeError("jobId must be a non-zero u64");
		}
		return symbols.pixi_cancel_job(jobId);
	},

	pollJobEvent(): NativeJobEvent | null {
		let data = jobEventData;
		let status = symbols.pixi_poll_job_event(
			ptr(jobEventMetaBytes), ptr(data), BigInt(data.byteLength),
		);
		if (status === -2) {
			const required = jobEventMetaView.getBigUint64(40, true);
			if (required <= BigInt(data.byteLength) || required > BigInt(MAX_JOB_RESULT_BYTES)) {
				throw new Error(`native job event requested invalid data length ${required}`);
			}
			data = new Uint8Array(Number(required));
			status = symbols.pixi_poll_job_event(
				ptr(jobEventMetaBytes), ptr(data), BigInt(data.byteLength),
			);
		}
		if (status < 0) throw new Error(`poll job event failed (${status})`);
		if (status === 0) return null;

		const eventKind = jobEventMetaView.getUint32(8, true);
		const jobKind = jobEventMetaView.getUint32(12, true);
		const dataLengthBig = jobEventMetaView.getBigUint64(40, true);
		if (eventKind < 1 || eventKind > 4) throw new Error(`native job event has invalid kind ${eventKind}`);
		if (jobKind < 1 || jobKind > 2) throw new Error(`native job event has invalid job kind ${jobKind}`);
		if (jobEventMetaView.getUint32(20, true) !== 0) throw new Error("native job event reserved field is non-zero");
		if (dataLengthBig > BigInt(data.byteLength) || dataLengthBig > BigInt(MAX_JOB_RESULT_BYTES)) {
			throw new Error(`native job event has invalid data length ${dataLengthBig}`);
		}
		const dataLength = Number(dataLengthBig);
		const copiedData = data.slice(0, dataLength);
		let message: string | undefined;
		if (eventKind === 3 || eventKind === 4) {
			try {
				message = strictUtf8Decoder.decode(copiedData);
			} catch {
				throw new Error("native job error message is not valid UTF-8");
			}
		}
		return {
			jobId: jobEventMetaView.getBigUint64(0, true),
			eventKind: eventKind as NativeJobEventKind,
			jobKind: jobKind as NativeJobKind,
			code: jobEventMetaView.getInt32(16, true),
			completed: jobEventMetaView.getBigUint64(24, true),
			total: jobEventMetaView.getBigUint64(32, true),
			data: copiedData,
			message,
		};
	},

	shutdownJobs(): number {
		return symbols.pixi_shutdown_jobs();
	},

	uiaProviderAvailable(): boolean {
		const available = symbols.pixi_uia_provider_available();
		if (available !== 0 && available !== 1) {
			throw new Error(`native UIA provider returned invalid availability ${available}`);
		}
		return available === 1;
	},

	attachAccessibility(window: Pointer, route: bigint): number {
		assertPointer(window, "window");
		assertRoute(route);
		if (attachedAccessibilityRoutes.has(window) || [...attachedAccessibilityRoutes.values()].includes(route)) {
			throw new Error(`native accessibility route ${route} is already attached`);
		}
		const status = symbols.pixi_attach_accessibility(window, route);
		if (status > 0) attachedAccessibilityRoutes.set(window, route);
		return status;
	},

	updateAccessibilitySnapshot(window: Pointer, snapshot: Uint8Array): number {
		assertPointer(window, "window");
		if (!(snapshot instanceof Uint8Array)) throw new TypeError("accessibility snapshot must be Uint8Array");
		if (snapshot.byteLength < 16 || snapshot.byteLength > MAX_ACCESSIBILITY_SNAPSHOT_BYTES) {
			throw new RangeError(`accessibility snapshot must contain 16..${MAX_ACCESSIBILITY_SNAPSHOT_BYTES} bytes`);
		}
		return symbols.pixi_update_accessibility_snapshot(window, ptr(snapshot), BigInt(snapshot.byteLength));
	},

	pollAccessibilityAction(route?: bigint): NativeAccessibilityActionEvent | null {
		if (route !== undefined) {
			assertRoute(route);
			const pending = pendingAccessibilityActions.get(route);
			const event = pending?.shift();
			if (pending?.length === 0) pendingAccessibilityActions.delete(route);
			if (event) return event;
		}
		for (;;) {
			let data = accessibilityActionData;
			let status = symbols.pixi_poll_accessibility_action(
				ptr(accessibilityActionMetaBytes), ptr(data), BigInt(data.byteLength),
			);
			if (status === -2) {
				const required = accessibilityActionMetaView.getBigUint64(24, true);
				if (required <= BigInt(data.byteLength) || required > BigInt(MAX_ACCESSIBILITY_ACTION_BYTES)) {
					throw new Error(`native accessibility action requested invalid data length ${required}`);
				}
				accessibilityActionData = data = new Uint8Array(Number(required));
				status = symbols.pixi_poll_accessibility_action(
					ptr(accessibilityActionMetaBytes), ptr(data), BigInt(data.byteLength),
				);
			}
			if (status < 0) throw new Error(`poll accessibility action failed (${status})`);
			if (status === 0) return null;
			const eventRoute = accessibilityActionMetaView.getBigUint64(0, true);
			const nodeId = accessibilityActionMetaView.getBigUint64(8, true);
			const action = accessibilityActionMetaView.getUint32(16, true);
			const dataLengthBig = accessibilityActionMetaView.getBigUint64(24, true);
			assertRoute(eventRoute);
			if (nodeId === 0n) throw new Error("native accessibility action has zero node id");
			if (action < 1 || action > 4) throw new Error(`native accessibility action has invalid kind ${action}`);
			if (dataLengthBig > BigInt(data.byteLength) || dataLengthBig > BigInt(MAX_ACCESSIBILITY_ACTION_BYTES)) {
				throw new Error(`native accessibility action has invalid data length ${dataLengthBig}`);
			}
			const event: NativeAccessibilityActionEvent = {
				route: eventRoute,
				nodeId,
				action: action as NativeAccessibilityActionKind,
				code: accessibilityActionMetaView.getInt32(20, true),
				data: data.slice(0, Number(dataLengthBig)),
			};
			if (route === undefined || event.route === route) return event;
			if (![...attachedAccessibilityRoutes.values()].includes(event.route)) {
				throw new Error(`native accessibility action references unattached route ${event.route}`);
			}
			const pending = pendingAccessibilityActions.get(event.route) ?? [];
			if (pending.length >= MAX_PENDING_ACCESSIBILITY_ACTIONS_PER_ROUTE) pending.shift();
			pending.push(event);
			pendingAccessibilityActions.set(event.route, pending);
		}
	},

	detachAccessibility(window: Pointer): number {
		assertPointer(window, "window");
		const status = symbols.pixi_detach_accessibility(window);
		if (status >= 0) {
			const route = attachedAccessibilityRoutes.get(window);
			if (route !== undefined) pendingAccessibilityActions.delete(route);
			attachedAccessibilityRoutes.delete(window);
		}
		return status;
	},

	submitBundles({ surface, device, queue, items, msaaView = 0, viewport }: NativeBundleSubmission): number {
		assertPointer(surface, "surface");
		assertPointer(device, "device");
		assertPointer(queue, "queue");
		if (msaaView !== 0) assertPointer(msaaView, "msaaView");
		if (items.length === 0 || items.length > MAX_BUNDLES_PER_FRAME) {
			throw new RangeError(`items must contain 1..${MAX_BUNDLES_PER_FRAME} bundles`);
		}
		if (![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite)
			|| viewport.x < 0 || viewport.y < 0 || viewport.width <= 0 || viewport.height <= 0) {
			throw new RangeError("viewport must be finite, non-negative, and non-empty");
		}

		const packed = new BigUint64Array(items.length * 4);
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			assertPointer(item.bundle, `items[${index}].bundle`);
			assertPointer(item.vertexBuffer, `items[${index}].vertexBuffer`);
			if (!(item.vertexData instanceof Uint8Array)) throw new TypeError(`items[${index}].vertexData must be Uint8Array`);
			if (item.vertexData.byteLength === 0) throw new RangeError(`items[${index}].vertexData must not be empty`);
			const offset = index * 4;
			packed[offset] = BigInt(item.bundle);
			packed[offset + 1] = BigInt(item.vertexBuffer);
			packed[offset + 2] = BigInt(ptr(item.vertexData));
			packed[offset + 3] = BigInt(item.vertexData.byteLength);
		}

		// library and input views deliberately remain process/synchronous-call scoped; do not dlclose on window teardown.
		return symbols.pixi_submit_bundles(
			surface, device, queue, ptr(packed), BigInt(items.length), msaaView,
			viewport.x, viewport.y, viewport.width, viewport.height,
		);
	},
} as const;
