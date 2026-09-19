import type { NativeInputEvent, NativeInputKind } from "./native-frame-host";

export const INPUT_EVENT_BYTES = 112;

export function decodeNativeInputEvent(view: DataView): NativeInputEvent {
	if (view.byteLength < INPUT_EVENT_BYTES) throw new RangeError(`native input event requires ${INPUT_EVENT_BYTES} bytes`);
	const kind = view.getUint32(16, true);
	if (kind < 1 || kind > 21) throw new Error(`native input event has invalid kind ${kind}`);
	const pointerType = view.getUint32(88, true);
	const isPointerEvent = kind <= 9;
	const isPrimary = view.getUint32(92, true);
	const width = view.getFloat32(96, true);
	const height = view.getFloat32(100, true);
	const pressure = view.getFloat32(104, true);
	if ((isPointerEvent && pointerType !== 1 && pointerType !== 2)
		|| (!isPointerEvent && pointerType !== 0)
		|| isPrimary > 1 || view.getUint32(108, true) !== 0
		|| !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(pressure)
		|| (isPointerEvent && (width <= 0 || height <= 0 || pressure < 0 || pressure > 1))) {
		throw new Error("native input event has invalid pointer data");
	}
	return {
		route: view.getBigUint64(0, true),
		timestamp: view.getBigUint64(8, true),
		kind: kind as NativeInputKind,
		modifiers: view.getUint32(20, true),
		x: view.getInt32(24, true),
		y: view.getInt32(28, true),
		movementX: view.getInt32(32, true),
		movementY: view.getInt32(36, true),
		button: view.getInt32(40, true),
		buttons: view.getUint32(44, true),
		wheelX: view.getInt32(48, true),
		wheelY: view.getInt32(52, true),
		deltaMode: view.getUint32(56, true),
		keyCode: view.getUint32(60, true),
		scanCode: view.getUint32(64, true),
		repeat: view.getUint32(68, true) !== 0,
		detail: view.getUint32(72, true),
		pointerId: view.getUint32(76, true),
		screenX: view.getInt32(80, true),
		screenY: view.getInt32(84, true),
		pointerType: pointerType === 2 ? "touch" : pointerType === 1 ? "mouse" : undefined,
		isPrimary: isPrimary !== 0,
		width,
		height,
		pressure,
	};
}
