import { expect, test } from "bun:test";
import { normalizeNativeWheel } from "./native-events";

test("native wheel exposes browser-compatible pixel deltas without losing precision", () => {
	expect(normalizeNativeWheel(0, 120)).toEqual({ deltaX: 0, deltaY: -100, deltaMode: 0 });
	expect(normalizeNativeWheel(0, -120)).toEqual({ deltaX: 0, deltaY: 100, deltaMode: 0 });
	expect(normalizeNativeWheel(120, 0)).toEqual({ deltaX: 100, deltaY: 0, deltaMode: 0 });
	expect(normalizeNativeWheel(-120, 0)).toEqual({ deltaX: -100, deltaY: 0, deltaMode: 0 });
	expect(Array.from({ length: 4 }, () => normalizeNativeWheel(30, 0).deltaX)
		.reduce((sum, delta) => sum + delta, 0)).toBe(100);
});
