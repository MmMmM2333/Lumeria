import Electrobun, { Screen, type GpuWindow } from "../platform/electrobun-sdk";
import { electrobunNativeAdapter } from "../rendering/electrobun-native-adapter";
import { Container, EventSystem, FederatedContainer, extensions } from "pixi.js";

const MOD_SHIFT = 1 << 0;
const MOD_CTRL = 1 << 1;
const MOD_ALT = 1 << 2;
const MOD_META = 1 << 3;
const MOD_COMPOSING = 1 << 4;
const POINTER_ACTIVATES_WINDOW = 1 << 5;
const BUTTON_BITS = [1, 4, 2, 8, 16] as const;
const WHEEL_PIXELS_PER_NOTCH = 100;

export function normalizeNativeWheel(wheelX: number, wheelY: number) {
	return {
		deltaX: wheelX * WHEEL_PIXELS_PER_NOTCH / 120,
		deltaY: wheelY === 0 ? 0 : -wheelY * WHEEL_PIXELS_PER_NOTCH / 120,
		deltaMode: 0 as const,
	};
}

export interface NativeKeyEvent {
	type: "down" | "up";
	key: string;
	code: string;
	keyCode: number;
	repeat: boolean;
	modifiers: number;
	shiftKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	metaKey: boolean;
	isComposing: boolean;
	timestamp: number;
}

export interface NativeInputHostHooks {
	initialFocused?: boolean;
	setCursor?(cursor: string): void;
	/** Return true only after the OS has granted window-level mouse capture. */
	setPointerCapture?(captured: boolean): boolean;
	useElectrobunPointerEvents?: boolean;
	pollEvent?(): NativeHostInputEvent | null;
	/** Register a callback fired when the host ring becomes non-empty. */
	subscribeInputAvailable?(listener: () => void): (() => void) | void;
	route?: bigint;
	onActivity?(): void;
}

export interface NativeHostInputEvent {
  touchpad?:import("../platform/native-touchpad").NativeTouchpadMetadata;
	route: bigint;
	timestamp: bigint;
	kind: number;
	modifiers: number;
	x: number;
	y: number;
	movementX: number;
	movementY: number;
	pointerId?: number;
	pointerType?: "mouse" | "touch";
	isPrimary?: boolean;
	width?: number;
	height?: number;
	pressure?: number;
	screenX?: number;
	screenY?: number;
	button: number;
	buttons: number;
	wheelX: number;
	wheelY: number;
	/** Target Pixi mode; wheelX/Y remain signed Win32 WHEEL_DELTA units until adapted. */
	deltaMode: number;
	keyCode: number;
	scanCode: number;
	repeat: boolean;
	detail: number;
}

type NativePointer = {
	type: number;
	x: number;
	y: number;
	buttonOrDx: number;
	dy: number;
	modifiers?: number;
};

type RawKey = {
	keyCode?: number;
	scanCode?: number;
	modifiers?: number;
	isRepeat?: boolean;
	repeat?: boolean;
	isDown?: boolean;
	chars?: string;
	timestamp?: bigint;
};

const WINDOWS_NAMED_KEYS: Readonly<Record<number, readonly [string, string]>> = {
	0x08: ["Backspace", "Backspace"],
	0x09: ["Tab", "Tab"],
	0x0d: ["Enter", "Enter"],
	0x10: ["Shift", "ShiftLeft"],
	0x11: ["Control", "ControlLeft"],
	0x12: ["Alt", "AltLeft"],
	0x14: ["CapsLock", "CapsLock"],
	0x1b: ["Escape", "Escape"],
	0x20: [" ", "Space"],
	0x21: ["PageUp", "PageUp"],
	0x22: ["PageDown", "PageDown"],
	0x23: ["End", "End"],
	0x24: ["Home", "Home"],
	0x25: ["ArrowLeft", "ArrowLeft"],
	0x26: ["ArrowUp", "ArrowUp"],
	0x27: ["ArrowRight", "ArrowRight"],
	0x28: ["ArrowDown", "ArrowDown"],
	0x2c: ["PrintScreen", "PrintScreen"],
	0x2d: ["Insert", "Insert"],
	0x2e: ["Delete", "Delete"],
	0x5b: ["Meta", "MetaLeft"],
	0x5c: ["Meta", "MetaRight"],
	0x5d: ["ContextMenu", "ContextMenu"],
	0x90: ["NumLock", "NumLock"],
	0x91: ["ScrollLock", "ScrollLock"],
};

const WINDOWS_PUNCTUATION: Readonly<Record<number, readonly [string, string, string]>> = {
	0xba: [";", ":", "Semicolon"],
	0xbb: ["=", "+", "Equal"],
	0xbc: [",", "<", "Comma"],
	0xbd: ["-", "_", "Minus"],
	0xbe: [".", ">", "Period"],
	0xbf: ["/", "?", "Slash"],
	0xc0: ["`", "~", "Backquote"],
	0xdb: ["[", "{", "BracketLeft"],
	0xdc: ["\\", "|", "Backslash"],
	0xdd: ["]", "}", "BracketRight"],
	0xde: ["'", "\"", "Quote"],
};

const WINDOWS_SCAN_CODES: Readonly<Record<number, string>> = {
	0x01: "Escape", 0x02: "Digit1", 0x03: "Digit2", 0x04: "Digit3", 0x05: "Digit4",
	0x06: "Digit5", 0x07: "Digit6", 0x08: "Digit7", 0x09: "Digit8", 0x0a: "Digit9",
	0x0b: "Digit0", 0x0c: "Minus", 0x0d: "Equal", 0x0e: "Backspace", 0x0f: "Tab",
	0x10: "KeyQ", 0x11: "KeyW", 0x12: "KeyE", 0x13: "KeyR", 0x14: "KeyT",
	0x15: "KeyY", 0x16: "KeyU", 0x17: "KeyI", 0x18: "KeyO", 0x19: "KeyP",
	0x1a: "BracketLeft", 0x1b: "BracketRight", 0x1c: "Enter", 0x1d: "ControlLeft",
	0x1e: "KeyA", 0x1f: "KeyS", 0x20: "KeyD", 0x21: "KeyF", 0x22: "KeyG",
	0x23: "KeyH", 0x24: "KeyJ", 0x25: "KeyK", 0x26: "KeyL", 0x27: "Semicolon",
	0x28: "Quote", 0x29: "Backquote", 0x2a: "ShiftLeft", 0x2b: "Backslash",
	0x2c: "KeyZ", 0x2d: "KeyX", 0x2e: "KeyC", 0x2f: "KeyV", 0x30: "KeyB",
	0x31: "KeyN", 0x32: "KeyM", 0x33: "Comma", 0x34: "Period", 0x35: "Slash",
	0x36: "ShiftRight", 0x37: "NumpadMultiply", 0x38: "AltLeft", 0x39: "Space",
	0x147: "Home", 0x148: "ArrowUp", 0x149: "PageUp", 0x14b: "ArrowLeft",
	0x14d: "ArrowRight", 0x14f: "End", 0x150: "ArrowDown", 0x151: "PageDown",
	0x152: "Insert", 0x153: "Delete", 0x11c: "NumpadEnter", 0x11d: "ControlRight",
	0x135: "NumpadDivide", 0x138: "AltRight", 0x15b: "MetaLeft", 0x15c: "MetaRight",
	0x15d: "ContextMenu",
};

const MAC_NAMED_KEYS: Readonly<Record<number, readonly [string, string]>> = {
	36: ["Enter", "Enter"],
	48: ["Tab", "Tab"],
	49: [" ", "Space"],
	51: ["Backspace", "Backspace"],
	53: ["Escape", "Escape"],
	55: ["Meta", "MetaLeft"],
	56: ["Shift", "ShiftLeft"],
	58: ["Alt", "AltLeft"],
	59: ["Control", "ControlLeft"],
	117: ["Delete", "Delete"],
	123: ["ArrowLeft", "ArrowLeft"],
	124: ["ArrowRight", "ArrowRight"],
	125: ["ArrowDown", "ArrowDown"],
	126: ["ArrowUp", "ArrowUp"],
};

const MAC_CODES: Readonly<Record<number, string>> = {
	0: "KeyA", 1: "KeyS", 2: "KeyD", 3: "KeyF", 4: "KeyH", 5: "KeyG",
	6: "KeyZ", 7: "KeyX", 8: "KeyC", 9: "KeyV", 11: "KeyB", 12: "KeyQ",
	13: "KeyW", 14: "KeyE", 15: "KeyR", 16: "KeyY", 17: "KeyT", 18: "Digit1",
	19: "Digit2", 20: "Digit3", 21: "Digit4", 22: "Digit6", 23: "Digit5",
	24: "Equal", 25: "Digit9", 26: "Digit7", 27: "Minus", 28: "Digit8",
	29: "Digit0", 30: "BracketRight", 31: "KeyO", 32: "KeyU", 33: "BracketLeft",
	34: "KeyI", 35: "KeyP", 37: "KeyL", 38: "KeyJ", 39: "Quote", 40: "KeyK",
	41: "Semicolon", 42: "Backslash", 43: "Comma", 44: "Slash", 45: "KeyN",
	46: "KeyM", 47: "Period", 50: "Backquote",
};

const modifiersFor = (modifiers: number) => ({
	shiftKey: Boolean(modifiers & MOD_SHIFT),
	ctrlKey: Boolean(modifiers & MOD_CTRL),
	altKey: Boolean(modifiers & MOD_ALT),
	metaKey: Boolean(modifiers & MOD_META),
});

const printableText = (chars?: string) =>
	chars && !/[\u0000-\u001f\u007f\uf700-\uf8ff]/.test(chars) ? chars : undefined;

function normalizeKey(keyCode: number, modifiers: number, chars?: string, scanCode = 0) {
	const printable = printableText(chars);
	if (process.platform === "darwin") {
		const named = MAC_NAMED_KEYS[keyCode];
		return {
			key: named?.[0] ?? printable ?? "Unidentified",
			code: named?.[1] ?? MAC_CODES[keyCode] ?? "Unidentified",
		};
	}
	const physicalCode = WINDOWS_SCAN_CODES[scanCode];
	if (keyCode === 0x10) return { key: "Shift", code: physicalCode ?? ((scanCode & 0xff) === 0x36 ? "ShiftRight" : "ShiftLeft") };
	if (keyCode === 0x11) return { key: "Control", code: physicalCode ?? (scanCode & 0x100 ? "ControlRight" : "ControlLeft") };
	if (keyCode === 0x12) return { key: "Alt", code: physicalCode ?? (scanCode & 0x100 ? "AltRight" : "AltLeft") };
	const named = WINDOWS_NAMED_KEYS[keyCode];
	if (named) return { key: named[0], code: physicalCode ?? named[1] };
	if (keyCode >= 0x41 && keyCode <= 0x5a) {
		const letter = String.fromCharCode(keyCode);
		return { key: printable ?? (modifiers & MOD_SHIFT ? letter : letter.toLowerCase()), code: physicalCode ?? `Key${letter}` };
	}
	if (keyCode >= 0x30 && keyCode <= 0x39) {
		const index = keyCode - 0x30;
		return {
			key: printable ?? (modifiers & MOD_SHIFT ? ")!@#$%^&*("[index]! : String(index)),
			code: physicalCode ?? `Digit${index}`,
		};
	}
	if (keyCode >= 0x60 && keyCode <= 0x69) {
		const index = keyCode - 0x60;
		return { key: printable ?? String(index), code: physicalCode ?? `Numpad${index}` };
	}
	if (keyCode >= 0x70 && keyCode <= 0x87) {
		const index = keyCode - 0x6f;
		return { key: `F${index}`, code: physicalCode ?? `F${index}` };
	}
	const punctuation = WINDOWS_PUNCTUATION[keyCode];
	if (punctuation) {
		return { key: printable ?? punctuation[modifiers & MOD_SHIFT ? 1 : 0], code: physicalCode ?? punctuation[2] };
	}
	return { key: printable ?? "Unidentified", code: physicalCode ?? "Unidentified" };
}

class NativeEventSystem extends EventSystem {
	static extension = EventSystem.extension;

	init(options: any) {
		this.resolution = this.renderer.resolution;
		(EventSystem as any)._defaultEventMode = options.eventMode ?? "passive";
		Object.assign(this.features, options.eventFeatures ?? {});
		this.rootBoundary.enableGlobalMoveEvents = this.features.globalMove;

		const boundary = this.rootBoundary as any;
		for (const type of ["pointercancel", "gotpointercapture", "lostpointercapture"]) {
			boundary.addEventMapping(type, (from: any) => {
				const tracking = boundary.trackingData(from.pointerId);
				const paths = Object.values(tracking.pressTargetsByButton) as any[][];
				const path = from.nativeEvent?.capturePath ?? paths.find(Boolean);
				const target = boundary.findMountedTarget(path) ?? boundary.hitTest(from.global.x, from.global.y);
				if (target) {
					const event = boundary.createPointerEvent(from, type, target);
					boundary.dispatchEvent(event, type);
					boundary.freeEvent(event);
				}
				if (type === "pointercancel") tracking.pressTargetsByButton = {};
			});
		}
		const bootstrap = (this as any)._bootstrapEvent.bind(this);
		(this as any)._bootstrapEvent = (event: any, nativeEvent: any) => {
			const result = bootstrap(event, nativeEvent);
			result.detail = nativeEvent.detail ?? 0;
			result.timeStamp = nativeEvent.timeStamp ?? performance.now();
			return result;
		};
		const copyData = boundary.copyData.bind(boundary);
		boundary.copyData = (from: any, to: any) => {
			copyData(from, to);
			to.timeStamp = from.timeStamp;
		};
	}

	mapPositionToPoint(point: any, x: number, y: number) {
		point.x = x;
		point.y = y;
	}

	protected normalizeWheelEvent(nativeEvent: WheelEvent) {
		const event = super.normalizeWheelEvent(nativeEvent);
		event.timeStamp = nativeEvent.timeStamp;
		return event;
	}

	setCursor(mode: string) {
		mode ||= "default";
		if ((this as any)._currentCursor === mode) return;
		(this as any)._currentCursor = mode;
		const style = this.cursorStyles[mode];
		if (typeof style === "function") style(mode);
		else (this as any).__nativeSetCursor?.(typeof style === "string" ? style : mode);
	}
}

export function installNativePixiEventSystem() {
	extensions.mixin(Container, FederatedContainer);
	extensions.add(NativeEventSystem);
}

export function attachNativePixiEvents(
	window: GpuWindow,
	renderer: any,
	hooks: NativeInputHostHooks = {},
) {
	const events = renderer.events as any;
	const keyListeners = new Set<(event: NativeKeyEvent) => void>();
	const focusListeners = new Set<(focused: boolean) => void>();
	const textListeners = new Set<(text: string) => void>();
	const hostEventListeners = new Set<(event: NativeHostInputEvent) => void>();
	const pressedKeys = new Set<string>();
	let buttons = 0;
	let currentModifiers = 0;
	let focused = hooks.initialFocused ?? true;
	let closed = false;
	const capturedPointers = new Set<number>();
	const capturePaths = new Map<number, any[]>();
	const pointerStates = new Map<number, {
		x: number; y: number; buttons: number; modifiers: number;
		pointerType: "mouse" | "touch"; isPrimary: boolean;
		width: number; height: number; pressure: number;
	}>();
	let lastX = Number.NaN;
	let lastY = Number.NaN;
	let clickButton = -1;
	let clickCount = 0;
	let clickTime = 0;
	let clickX = 0;
	let clickY = 0;
	let lastWheelTimestamp = Number.NEGATIVE_INFINITY;

	const notify = <T>(listeners: Set<(value: T) => void>, value: T) => {
		if (!closed) for (const listener of [...listeners]) listener(value);
	};
	const currentCapturePath = (pointerId = 1) => {
		const tracking = events.rootBoundary?.trackingData?.(pointerId)
			?? events.rootBoundary?.mappingState?.trackingData?.[pointerId];
		const paths = Object.values(tracking?.pressTargetsByButton ?? {}) as any[][];
		return paths.find(Boolean)?.slice();
	};
	const releasePointerCapture = (pointerId = 1) => {
		if (!capturedPointers.has(pointerId)) return;
		const state = pointerStates.get(pointerId);
		if (state?.pointerType !== "touch") hooks.setPointerCapture?.(false);
		capturedPointers.delete(pointerId);
		const capturePath = capturePaths.get(pointerId);
		emitPointer(
			"lostpointercapture", state?.x ?? lastX, state?.y ?? lastY, -1,
			state?.modifiers ?? currentModifiers, capturePath,
			state && { pointerId, ...state },
		);
		capturePaths.delete(pointerId);
	};
	const emitPointer = (
		type: string,
		x: number,
		y: number,
		button = 0,
		modifiers = currentModifiers,
		eventCapturePath?: any[],
		native?: Partial<NativeHostInputEvent>,
	) => {
		if (closed) return;
		currentModifiers = modifiers;
		const now = performance.now();
		const pointerId = native?.pointerId ?? 1;
		const previous = pointerStates.get(pointerId);
		const pointerType = native?.pointerType ?? previous?.pointerType ?? "mouse";
		const bit = BUTTON_BITS[button] ?? 0;
		let pointerButtons = native?.buttons ?? previous?.buttons ?? (pointerType === "mouse" ? buttons : 0);
		if (type === "pointerdown" && native?.buttons === undefined) pointerButtons |= bit;
		else if (type === "pointerup" && native?.buttons === undefined) pointerButtons &= ~bit;
		else if (type === "pointercancel") pointerButtons = 0;
		if (pointerType === "mouse") buttons = pointerButtons;
		if (type === "pointerdown" && pointerType === "mouse") {
			const nearby = Math.abs(x - clickX) <= 5 && Math.abs(y - clickY) <= 5;
			clickCount = button === clickButton && nearby && now - clickTime <= 500 ? clickCount + 1 : 1;
			clickButton = button;
			clickTime = now;
			clickX = x;
			clickY = y;
		}

		const movementX = native?.movementX ?? (type === "pointermove" && Number.isFinite(previous?.x) ? x - previous!.x : 0);
		const movementY = native?.movementY ?? (type === "pointermove" && Number.isFinite(previous?.y) ? y - previous!.y : 0);
		const width = native?.width ?? previous?.width ?? 1;
		const height = native?.height ?? previous?.height ?? 1;
		const pressure = native?.pressure ?? (pointerButtons ? previous?.pressure ?? 0.5 : 0);
		const state = {
			x, y, buttons: pointerButtons, modifiers, pointerType,
			isPrimary: native?.isPrimary ?? previous?.isPrimary ?? true,
			width, height, pressure,
		};
		if (Number.isFinite(x) && Number.isFinite(y) && !type.endsWith("pointercapture")) {
			pointerStates.set(pointerId, state);
			if (pointerType === "mouse") { lastX = x; lastY = y; }
		}
		const modifierState = modifiersFor(modifiers);
		const event = {
			type,
			activatesWindow: type === "pointerdown" && Boolean((native?.modifiers ?? 0) & POINTER_ACTIVATES_WINDOW),
			button,
			buttons: pointerButtons,
			clientX: x,
			clientY: y,
			screenX: native?.screenX ?? x,
			screenY: native?.screenY ?? y,
			pageX: x,
			pageY: y,
			movementX,
			movementY,
			pointerId,
			pointerType,
			isPrimary: state.isPrimary,
			isTrusted: true,
			width,
			height,
			pressure,
			tangentialPressure: 0,
			tiltX: 0,
			tiltY: 0,
			twist: 0,
			detail: native?.detail ?? (type === "pointerdown" || type === "pointerup" ? clickCount : 0),
			timeStamp: native?.timestamp ? Number(native.timestamp) : now,
			timestamp: native?.timestamp ? Number(native.timestamp) : now,
			...modifierState,
			target: null,
			cancelable: true,
			capturePath: eventCapturePath,
			preventDefault() {},
			composedPath: () => [null],
		};
		if (type === "pointermove") events._onPointerMove(event);
		else if (type === "pointerdown") events._onPointerDown(event);
		else if (type === "pointerup") events._onPointerUp(event);
		else events._onPointerOverOut(event);
		if (type === "pointercancel") events._onPointerOverOut({ ...event, type: "pointerout" });
		if (type === "pointerdown" && !capturedPointers.has(pointerId)) acquirePointerCapture(pointerId);
		if (type === "pointerup" || type === "pointercancel"
			|| (type === "pointerout" && pointerType === "touch" && pointerButtons === 0)) {
			releasePointerCapture(pointerId);
			pointerStates.delete(pointerId);
		}
		hooks.onActivity?.();
	};
	function acquirePointerCapture(pointerId = 1) {
		if (closed || capturedPointers.has(pointerId)) return capturedPointers.has(pointerId);
		const capturePath = currentCapturePath(pointerId);
		const state = pointerStates.get(pointerId);
		if (!capturePath || (state?.pointerType !== "touch" && hooks.setPointerCapture?.(true) !== true)) {
			return false;
		}
		capturePaths.set(pointerId, capturePath);
		capturedPointers.add(pointerId);
		emitPointer(
			"gotpointercapture", state?.x ?? lastX, state?.y ?? lastY, -1,
			state?.modifiers ?? currentModifiers, capturePath,
			state && { pointerId, ...state },
		);
		return true;
	}

	const emitWheel = (
		x: number, y: number, dx: number, dy: number, modifiers = currentModifiers,
		deltaMode = 0, timestamp = performance.now(),nativeTouchpad?:import("../platform/native-touchpad").NativeTouchpadMetadata,
	) => {
		if (closed) return;
		currentModifiers = modifiers;
		const now = performance.now();
		const eventTimestamp = Math.max(timestamp || now, lastWheelTimestamp + 0.001);
		lastWheelTimestamp = eventTimestamp;
		events.onWheel({
			type: "wheel",
			button: 0,
			buttons,
			clientX: x,
			clientY: y,
			pageX: x,
			pageY: y,
			movementX: 0,
			movementY: 0,
			deltaX: dx,
			deltaY: dy,
			deltaZ: 0,
			deltaMode,
			isTrusted: true,
			timeStamp: eventTimestamp,
      ...(nativeTouchpad?{nativeTouchpad,momentum:nativeTouchpad.phase==="inertia"}:{}),
			...modifiersFor(modifiers),
		});
		hooks.onActivity?.();
	};

	const emitKey = (type: "down" | "up", raw: RawKey) => {
		if (closed) return;
		const keyCode = raw.keyCode ?? 0;
		const modifiers = raw.modifiers ?? 0;
		const normalized = normalizeKey(keyCode, modifiers, raw.chars, raw.scanCode);
		const repeat = type === "down" && (Boolean(raw.isRepeat ?? raw.repeat) || pressedKeys.has(normalized.code));
		if (type === "down") pressedKeys.add(normalized.code);
		else pressedKeys.delete(normalized.code);
		currentModifiers = modifiers;
		notify(keyListeners, {
			type,
			...normalized,
			keyCode,
			repeat,
			modifiers,
			...modifiersFor(modifiers),
			isComposing: Boolean(modifiers & MOD_COMPOSING),
			timestamp: raw.timestamp ? Number(raw.timestamp) : performance.now(),
		});
		hooks.onActivity?.();
	};
	const emitText = (text: string) => {
		if (closed || !text) return;
		notify(textListeners, text);
		hooks.onActivity?.();
	};

	events.__nativeSetCursor = (cursor: string) => {
		if (!closed) hooks.setCursor?.(cursor);
	};

	const hasHostInput = Boolean(hooks.pollEvent);
	const hasNativeKeys = !hasHostInput && electrobunNativeAdapter.enableKeyEvents();
	const hasWindowText = !hasHostInput && electrobunNativeAdapter.enableTextEvents();
	const keyChannel = `wgpu-key-${window.wgpuViewId}`;
	const keyDownChannel = `keyDown-${window.id}`;
	const keyUpChannel = `keyUp-${window.id}`;
	const textChannel = `window-text-${window.id}`;
	const pointerChannel = `wgpu-pointer-${window.wgpuViewId}`;
	const onViewKey = (raw: RawKey) => {
		emitKey(raw.isDown ? "down" : "up", raw);
		const text = printableText(raw.chars);
		if (raw.isDown && !hasWindowText && text && !(Number(raw.modifiers) & (MOD_CTRL | MOD_META))) {
			emitText(text);
		}
	};
	const onKeyDown = (event: any) => emitKey("down", event?.data ?? {});
	const onKeyUp = (event: any) => emitKey("up", event?.data ?? {});
	const onWindowText = (event: any) => {
		if (typeof event?.text === "string") emitText(event.text);
	};
	if (hasNativeKeys) Electrobun.events.on(keyChannel, onViewKey);
	else if (!hasHostInput) {
		Electrobun.events.on(keyDownChannel, onKeyDown);
		Electrobun.events.on(keyUpChannel, onKeyUp);
	}
	if (hasWindowText) Electrobun.events.on(textChannel, onWindowText);

	const onPointer = (event: NativePointer) => {
		const { type, x, y, buttonOrDx, dy, modifiers = 0 } = event;
		if (type === 0) emitPointer("pointermove", x, y, 0, modifiers);
		else if (type === 1) emitPointer("pointerdown", x, y, buttonOrDx, modifiers);
		else if (type === 2) emitPointer("pointerup", x, y, buttonOrDx, modifiers);
		else if (type === 3) emitWheel(x, y, buttonOrDx, dy, modifiers);
		else if (type === 4) emitPointer("pointerover", x, y, 0, modifiers);
		else if (type === 5) emitPointer("pointerout", x, y, 0, modifiers);
	};
	const hasNativePointers = !hasHostInput && Boolean(hooks.useElectrobunPointerEvents)
		&& electrobunNativeAdapter.enablePointerEvents();
	if (hasNativePointers) Electrobun.events.on(pointerChannel, onPointer);

	const onFocus = () => {
		if (closed || focused) return;
		focused = true;
		notify(focusListeners, true);
	};
	const onBlur = () => {
		if (closed || !focused) return;
		focused = false;
		for (const [pointerId, state] of [...pointerStates]) {
			if (state.buttons || capturedPointers.has(pointerId)) {
				emitPointer("pointercancel", state.x, state.y, -1, state.modifiers, capturePaths.get(pointerId), { pointerId, ...state });
			}
		}
		pressedKeys.clear();
		notify(focusListeners, false);
		hooks.onActivity?.();
	};
	const offFocus = window.on("focus", onFocus);
	const offBlur = window.on("blur", onBlur);

	const pollFallback = () => {
		if (closed) return;
		const origin = electrobunNativeAdapter.getWindowContentOrigin(window);
		const cursor = Screen.getCursorScreenPoint();
		const x = cursor.x - origin.x;
		const y = cursor.y - origin.y;
		if (x !== lastX || y !== lastY) emitPointer("pointermove", x, y);
		const previous = buttons;
		const next = focused ? Number(Screen.getMouseButtons()) : 0;
		for (const [bit, button] of [[1, 0], [4, 1], [2, 2]] as const) {
			if ((next & bit) && !(previous & bit)) emitPointer("pointerdown", x, y, button);
			else if (!(next & bit) && (previous & bit)) emitPointer("pointerup", x, y, button);
		}
	};
	const poll = () => {
		if (closed) return;
		if (!hasHostInput) {
			if (!hasNativePointers) pollFallback();
			return;
		}
		for (let count = 0; count < 4096; count++) {
			if (closed) break;
			const event = hooks.pollEvent?.();
			if (closed || !event) break;
			if (hooks.route !== undefined && event.route !== hooks.route) continue;
			notify(hostEventListeners, event);
			if (closed) break;
			const pointerId = event.pointerId ?? 1;
			const capturePath = capturePaths.get(pointerId);
			if (event.kind === 1) emitPointer("pointermove", event.x, event.y, event.button, event.modifiers, capturePath, event);
			else if (event.kind === 2) emitPointer("pointerdown", event.x, event.y, event.button, event.modifiers, capturePath, event);
			else if (event.kind === 3) emitPointer("pointerup", event.x, event.y, event.button, event.modifiers, capturePath, event);
			else if (event.kind === 4) emitPointer("pointerover", event.x, event.y, event.button, event.modifiers, capturePath, event);
			else if (event.kind === 5) emitPointer("pointerout", event.x, event.y, event.button, event.modifiers, capturePath, event);
			else if (event.kind === 6) emitPointer("pointercancel", event.x, event.y, -1, event.modifiers, capturePath, event);
			else if (event.kind === 8 && capturedPointers.has(pointerId)) {
				capturedPointers.delete(pointerId);
				emitPointer("lostpointercapture", event.x, event.y, -1, event.modifiers, capturePath, event);
				capturePaths.delete(pointerId);
			} else if (event.kind === 7 && !capturedPointers.has(pointerId)) {
				const path = currentCapturePath(pointerId);
				if (path) capturePaths.set(pointerId, path);
				capturedPointers.add(pointerId);
				emitPointer("gotpointercapture", event.x, event.y, -1, event.modifiers, path, event);
			} else if (event.kind === 9) {
				const wheel = event.touchpad?{deltaX:event.wheelX,deltaY:event.wheelY,deltaMode:0}:normalizeNativeWheel(event.wheelX,event.wheelY);
				emitWheel(
					event.x, event.y, wheel.deltaX, wheel.deltaY,
					event.modifiers, wheel.deltaMode, Number(event.timestamp),event.touchpad,
				);
			} else if (event.kind === 10) onFocus();
			else if (event.kind === 11) onBlur();
			else if (event.kind === 12) emitKey("down", event);
			else if (event.kind === 13) emitKey("up", event);
			hooks.onActivity?.();
		}
	};
	const unsubscribeInputAvailable = hasHostInput
		? hooks.subscribeInputAvailable?.(() => {
			poll();
			hooks.onActivity?.();
		}) ?? (() => {})
		: () => {};

	const subscribe = <T>(listeners: Set<(value: T) => void>, listener: (value: T) => void) => {
		if (closed) return () => {};
		listeners.add(listener);
		return () => { listeners.delete(listener); };
	};
	return {
		get focused() { return focused; },
		poll,
		emitPointer,
		/** Replay through the same normalizer/listeners as host events. Wheel deltas are Pixi pixels. */
		emitKey,
		emitWheel,
		emitFocus: (value: boolean) => value ? onFocus() : onBlur(),
		emitText,
		onKey: (listener: (event: NativeKeyEvent) => void) => subscribe(keyListeners, listener),
		onFocusChange: (listener: (focused: boolean) => void) => subscribe(focusListeners, listener),
		onTextCommit: (listener: (text: string) => void) => subscribe(textListeners, listener),
		// Low-level diagnostics preserve host/raw units. Application gestures should use Pixi events.
		onHostEvent: (listener: (event: NativeHostInputEvent) => void) => subscribe(hostEventListeners, listener),
		capturePointer: acquirePointerCapture,
		releasePointerCapture,
		hasPointerCapture: (pointerId = 1) => capturedPointers.has(pointerId),
		destroy() {
			if (closed) return;
			if (capturedPointers.has(1) && pointerStates.get(1)?.pointerType !== "touch") hooks.setPointerCapture?.(false);
			closed = true;
			if (hasNativePointers) Electrobun.events.off(pointerChannel, onPointer);
			if (hasNativeKeys) Electrobun.events.off(keyChannel, onViewKey);
			else if (!hasHostInput) {
				Electrobun.events.off(keyDownChannel, onKeyDown);
				Electrobun.events.off(keyUpChannel, onKeyUp);
			}
			if (hasWindowText) Electrobun.events.off(textChannel, onWindowText);
			unsubscribeInputAvailable();
			offFocus();
			offBlur();
			if (events.__nativeSetCursor) events.__nativeSetCursor = undefined;
			keyListeners.clear();
			focusListeners.clear();
			textListeners.clear();
			hostEventListeners.clear();
			pressedKeys.clear();
			buttons = 0;
			capturedPointers.clear();
			capturePaths.clear();
			pointerStates.clear();
		},
	};
}
