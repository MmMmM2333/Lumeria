import { expect, test } from "bun:test";
import { chooseSurfaceCapacity, shouldReclaimSurfaceCapacity } from "./native-surface-capacity";

test("capacity covers the viewport while reserving bounded headroom", () => {
  expect(chooseSurfaceCapacity(900, 600, 8192)).toEqual({ width: 1280, height: 896 });
  expect(chooseSurfaceCapacity(1500, 900, 8192)).toEqual({ width: 1792, height: 1280 });
  expect(chooseSurfaceCapacity(8100, 8100, 8192)).toEqual({ width: 8100, height: 8100 });
  expect(chooseSurfaceCapacity(1000, 700, 1024)).toEqual({ width: 1024, height: 1024 });
});
test("invalid and unsupported extents are rejected rather than silently truncated", () => {
  for (const [w, h, limit] of [[0, 600, 8192], [900, 0, 8192], [900.5, 600, 8192], [900, 600, NaN], [900, 600, 0], [9000, 600, 8192]]) {
    expect(() => chooseSurfaceCapacity(w!, h!, limit!)).toThrow(RangeError);
  }
});
test("reclaim requires a material capacity reduction", () => {
  expect(shouldReclaimSurfaceCapacity({ width: 1280, height: 896 }, chooseSurfaceCapacity(900, 600, 8192))).toBe(false);
  expect(shouldReclaimSurfaceCapacity({ width: 1792, height: 1280 }, chooseSurfaceCapacity(700, 450, 8192))).toBe(true);
});
