import assert from "node:assert/strict";
import { Graphics, Sprite, Texture } from "pixi.js";
import type { NativePixiApplication } from "./native-app";
import { getNativePixiApplicationTesting } from "./native-app-testing";

/** Actual-host regression: npm start with PIXI_PRESENTED_SMOKE=1. */
export async function runPresentedSmoke(app: NativePixiApplication): Promise<void> {
	const testing = getNativePixiApplicationTesting(app);
	let updates = 0;
	let microtaskUpdates = 0;
	let observed = 0;
	let frameNumber = 0;
	const off = app.on("presented", event => {
		assert.ok(event.frameNumber > frameNumber);
		assert.ok(event.deviceGeneration > 0 && event.surfaceGeneration > 0);
		assert.equal(microtaskUpdates, updates - 1, "presented must precede animation microtasks");
		frameNumber = event.frameNumber;
		observed += 1;
	});
	const stop = app.animate(() => {
		updates += 1;
		queueMicrotask(() => { microtaskUpdates += 1; });
	});
	const next = async () => {
		const before = observed;
		const waiter = app.nextPresent();
		app.invalidate();
		await waiter;
		assert.ok(observed > before, "presented must precede nextPresent continuation");
	};
	try {
		const sprite = new Sprite(Texture.WHITE);
		sprite.width = sprite.height = 40;
		app.stage.addChild(sprite);
		await next();
		await next();
		await next();
		app.stage.addChild(new Graphics().rect(60, 0, 40, 40).fill(0xff0000));
		await next();
		assert.equal(testing.diagnostics().frame.renderCount, frameNumber);
		off(); stop();
		const count = observed;
		const waiter = app.nextPresent(); app.invalidate(); await waiter;
		assert.equal(observed, count, "unsubscribe must stop notifications");
		testing.pause();
		let failedFrameEvents = 0;
		const offFailure = app.on("presented", () => { failedFrameEvents += 1; });
		try {
			testing.injectFault("surface-timeout");
			testing.step(1);
			const deadline = performance.now() + 1000;
			while (!testing.diagnostics().events.some(event => event.type === "surface-timeout")) {
				if (performance.now() > deadline) throw new Error("timeout injection was not observed");
				await new Promise(resolve => setTimeout(resolve, 1));
			}
			testing.pause();
			assert.equal(failedFrameEvents, 0, "a timeout must not report successful presentation");
		} finally { offFailure(); }
		console.log("Presented callback smoke passed: synchronous ordering, monotonic frames, scene changes and unsubscribe");
		testing.resume();
		let attempts = 0;
		let release!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		const offGuard = app.beforeClose(async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("expected save failure");
			await gate;
		});
		app.window.requestClose();
		await new Promise(resolve => setTimeout(resolve, 100));
		assert.equal(attempts, 1);
		assert.equal(app.state, "running", "save failure must retain the window");
		app.window.requestClose();
		await new Promise(resolve => setTimeout(resolve, 100));
		assert.equal(attempts, 2);
		assert.equal(app.state, "running", "pending save must delay close");
		console.log("Close guard failure and pending-save checks passed; releasing save");
		release();
		const closeDeadline = performance.now() + 3000;
		const isClosed = () => app.state === "closed";
		while (!isClosed()) {
			if (performance.now() > closeDeadline) throw new Error("guarded close did not finish");
			await new Promise(resolve => setTimeout(resolve, 10));
		}
		offGuard();
		console.log("Close guard smoke passed: failure retains window, retry waits for save then closes");
	} finally {
		off(); stop(); await app.dispose();
	}
}
