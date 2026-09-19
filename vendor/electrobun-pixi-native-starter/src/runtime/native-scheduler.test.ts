import { describe, expect, test } from "bun:test";
import { createFrameScheduler } from "./native-scheduler";

function harness(mode: "product" | "benchmark" = "product", maxFps = 0, frameCostMs = 0) {
	let nextId = 1;
	let now = 0;
	const frames: number[] = [];
	const pending = new Map<number, { callback: () => void; delayMs: number }>();
	const scheduler = createFrameScheduler({
		mode,
		maxFps,
		frame: (time) => {
			frames.push(time);
			now += frameCostMs;
		},
		schedule: (callback, delayMs) => {
			const id = nextId++;
			pending.set(id, { callback, delayMs });
			return id;
		},
		cancel: (id) => pending.delete(id),
		clock: () => now,
	});
	const runNext = (elapsedMs?: number) => {
		const item = pending.entries().next().value as [number, { callback: () => void; delayMs: number }] | undefined;
		if (!item) return false;
		pending.delete(item[0]);
		now += elapsedMs ?? item[1].delayMs;
		item[1].callback();
		return true;
	};
	return { scheduler, frames, pending, runNext };
}

describe("FrameScheduler", () => {
	test("invalidations never bypass the max FPS deadline", () => {
		const { scheduler, frames, pending, runNext } = harness("product", 60);
		const stop = scheduler.animate();
		runNext();
		const delayedId = pending.keys().next().value!;

		scheduler.invalidate();
		expect([...pending.keys()]).toEqual([delayedId]);
		expect(pending.get(delayedId)?.delayMs).toBeCloseTo(1000 / 60);

		scheduler.invalidate();
		expect([...pending.keys()]).toEqual([delayedId]);
		runNext();
		expect(frames).toEqual([0, 1000 / 60]);
		expect(pending.values().next().value?.delayMs).toBeCloseTo(1000 / 60);
		stop();
	});

	test("coalesces dirty invalidations into one product frame", () => {
		const { scheduler, frames, pending, runNext } = harness();
		scheduler.invalidate();
		scheduler.invalidate();
		expect(pending.size).toBe(1);
		expect(runNext()).toBe(true);
		expect(frames).toEqual([0]);
		expect(pending.size).toBe(0);
	});

	test("animation leases keep frames running", () => {
		const { scheduler, frames, pending, runNext } = harness();
		const stop = scheduler.animate();
		expect(runNext()).toBe(true);
		expect(runNext()).toBe(true);
		expect(frames).toEqual([0, 0]);
		expect(pending.size).toBe(1);
		stop();
		expect(pending.size).toBe(0);
	});

	test("only the final animation lease stops scheduling", () => {
		const { scheduler, pending } = harness();
		const stopA = scheduler.animate();
		const stopB = scheduler.animate();
		stopA();
		expect(pending.size).toBe(1);
		stopB();
		stopB();
		expect(pending.size).toBe(0);
	});

	test("suspend cancels work and resume preserves it", () => {
		const { scheduler, frames, pending, runNext } = harness();
		scheduler.invalidate();
		scheduler.suspend();
		expect(pending.size).toBe(0);
		scheduler.resume();
		expect(pending.size).toBe(1);
		runNext();
		expect(frames).toEqual([0]);
	});

	test("close cancels pending work permanently", () => {
		const { scheduler, frames, pending, runNext } = harness();
		scheduler.invalidate();
		scheduler.close();
		scheduler.invalidate();
		scheduler.animate();
		scheduler.resume();
		expect(pending.size).toBe(0);
		expect(runNext()).toBe(false);
		expect(frames).toEqual([]);
	});

	test("benchmark mode runs continuously until suspended", () => {
		const { scheduler, frames, pending, runNext } = harness("benchmark");
		expect(pending.size).toBe(1);
		runNext();
		runNext();
		runNext();
		expect(frames).toEqual([0, 0, 0]);
		expect(pending.size).toBe(1);
		scheduler.suspend();
		expect(pending.size).toBe(0);
		scheduler.resume();
		expect(pending.size).toBe(1);
	});

	test("caps total frame cadence without adding render time", () => {
		const { scheduler, frames, pending, runNext } = harness("product", 60, 4);
		const stop = scheduler.animate();
		expect(runNext()).toBe(true);
		expect(pending.values().next().value?.delayMs).toBeCloseTo(1000 / 60 - 4);
		expect(runNext()).toBe(true);
		expect(frames[1]).toBeCloseTo(1000 / 60);
		expect(pending.values().next().value?.delayMs).toBeCloseTo(1000 / 60 - 4);
		stop();
	});

	test("skips missed deadlines instead of emitting catch-up bursts", () => {
		const { scheduler, pending, runNext } = harness("product", 60);
		const stop = scheduler.animate();
		expect(runNext()).toBe(true);
		expect(runNext(50)).toBe(true);
		expect(pending.values().next().value?.delayMs).toBeCloseTo(1000 / 60);
		stop();
	});
});
