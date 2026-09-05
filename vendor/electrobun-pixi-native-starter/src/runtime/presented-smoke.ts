import assert from "node:assert/strict";
import { FillGradient, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { NativePixiApplication } from "./native-app";
import { getNativePixiApplicationTesting } from "./native-app-testing";
import { createCanvas } from "@napi-rs/canvas";
import { runColorDialogSmoke } from "./color-dialog-smoke";
import { assertWindowInputCoverage } from "./window-input-smoke";
import { runShortcutSmoke } from "./shortcut-smoke";
import { runTraySmoke } from "./tray-smoke";

/** Actual-host regression: npm start with PIXI_PRESENTED_SMOKE=1. */
export async function runPresentedSmoke(app: NativePixiApplication): Promise<void> {
	const testing = getNativePixiApplicationTesting(app);
  assert.equal(app.windowMode,"windowed","a newly created hidden-titlebar window is windowed");
  app.setWindowMode("windowed");
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
    if(process.env.PIXI_TRAY_SMOKE_ICON)await runTraySmoke(process.env.PIXI_TRAY_SMOKE_ICON);
    await runShortcutSmoke();
    await assertWindowInputCoverage(app);
    const frame = app.getWindowFrame();
    assert.ok(Object.isFrozen(frame));
    assert.ok(Number.isFinite(frame.x) && Number.isFinite(frame.y));
    assert.ok(frame.width > 0 && frame.height > 0 && frame.scaleFactor > 0);
    const diagnosticFrame = testing.diagnostics().window.snapshot;
    assert.equal(frame.x, diagnosticFrame.frameX);
    assert.equal(frame.y, diagnosticFrame.frameY);
    assert.equal(frame.width, diagnosticFrame.frameWidth);
    assert.equal(frame.height, diagnosticFrame.frameHeight);
    if (app.supportsColorDialog) await assert.rejects(app.chooseColor(-1), /RGB integer/);
    if (process.env.PIXI_COLOR_DIALOG_SMOKE === "1") await runColorDialogSmoke(app);
    const previousMode = app.windowMode;
    try {
      app.setWindowMode("fullscreen");
      await new Promise(resolve => setTimeout(resolve, 120));
      assert.equal(app.windowMode, "fullscreen");
      await next();
      const fullscreenFrame = app.getWindowFrame();
      await assertWindowInputCoverage(app);
      assert.ok(fullscreenFrame.width >= frame.width && fullscreenFrame.height >= frame.height);
      app.setWindowMode("fullscreen", 1);
      await new Promise(resolve => setTimeout(resolve, 120));
      await next();
      const overscan = app.getWindowFrame();
      await assertWindowInputCoverage(app);
      assert.equal(overscan.x, fullscreenFrame.x - 1);
      assert.equal(overscan.y, fullscreenFrame.y - 1);
      assert.equal(overscan.width, fullscreenFrame.width + 2);
      assert.equal(overscan.height, fullscreenFrame.height + 2);
      app.setWindowMode("fullscreen", 0);
      await new Promise(resolve => setTimeout(resolve, 120));
      await next();
      assert.deepEqual(app.getWindowFrame(), fullscreenFrame);
    } finally {
      app.setWindowMode(previousMode);
      await new Promise(resolve => setTimeout(resolve, 120));
      await next();
    }
    assert.deepEqual(app.getWindowFrame(), frame, "fullscreen must restore the previous window bounds");
    await assertWindowInputCoverage(app);
    console.log("Native window modes passed: physical frame, fullscreen overscan and windowed restore");
    if(app.windowMaterialSupport.supportsAcrylic){
      for(const material of ["acrylic","mica","micaAlt","none"] as const){
        app.setWindowPresentation(material,"dark");await next();
      }
      app.setWindowPresentation("none","light");
      console.log("Native transparent surface and system backdrop changes passed");
    }
    if(process.platform==="win32"){
      assert.equal(app.supportsWindowIcon,true);
      const iconCanvas=createCanvas(32,32),iconContext=iconCanvas.getContext("2d");
      for(const color of ["red","blue"]){
        iconContext.fillStyle=color;iconContext.fillRect(0,0,32,32);
        app.setWindowIcon(iconCanvas.toBuffer("image/png"));
      }
      assert.throws(()=>app.setWindowIcon(new Uint8Array([1,2,3])));
      console.log("Native window icon replacement and invalid-input checks passed");
    }
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
		const gradient=new FillGradient({start:{x:0,y:0},end:{x:1,y:0},
			colorStops:[{offset:0,color:0x1234dc},{offset:1,color:0x1234dc}]});
		const sample=new Graphics().rect(120,0,20,20).fill(gradient);app.stage.addChild(sample);
		const gradientFrame=app.nextPresent();app.invalidate();await gradientFrame;
		const capture=await app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(120,0,20,20),resolution:1});
		const middle=(10*capture.width+10)*4;
		assert.deepEqual(Array.from(capture.pixels.slice(middle,middle+4)),[18,52,220,255],"gradient canvas RGB must survive BGRA GPU upload");
		sample.destroy();gradient.destroy();
		console.log("Native canvas gradient GPU color readback passed");
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
