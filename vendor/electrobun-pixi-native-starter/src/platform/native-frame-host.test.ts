import { expect, test } from "bun:test";
import { decodeNativeInputEvent } from "./native-input-event";

test("ABI4 decoder exposes native touch pointer fields at their fixed offsets", () => {
	const bytes = new Uint8Array(112);
	const view = new DataView(bytes.buffer);
	view.setBigUint64(0, 9n, true);
	view.setBigUint64(8, 123n, true);
	view.setUint32(16, 2, true);
	view.setInt32(24, 20, true);
	view.setInt32(28, 30, true);
	view.setInt32(40, 0, true);
	view.setUint32(44, 1, true);
	view.setUint32(76, 31, true);
	view.setInt32(80, 120, true);
	view.setInt32(84, 130, true);
	view.setUint32(88, 2, true);
	view.setUint32(92, 1, true);
	view.setFloat32(96, 12.5, true);
	view.setFloat32(100, 18.5, true);
	view.setFloat32(104, 0.625, true);

	expect(decodeNativeInputEvent(view)).toMatchObject({
		route: 9n, timestamp: 123n, kind: 2, x: 20, y: 30,
		button: 0, buttons: 1, pointerId: 31, screenX: 120, screenY: 130,
		pointerType: "touch", isPrimary: true, width: 12.5, height: 18.5, pressure: 0.625,
	});
});
