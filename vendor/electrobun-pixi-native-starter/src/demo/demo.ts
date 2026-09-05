import {
	Assets,
	BlurFilter,
	BufferImageSource,
	Container,
	DOMAdapter,
	Graphics,
	Matrix,
	Rectangle,
	Sprite,
	Text,
	Texture,
} from "pixi.js";
import { createHash } from "crypto";
import { startAgentDebugBridge } from "../diagnostics/agent-debug";
import type { NativePixiApplication } from "../runtime/native-app";
import { getNativePixiApplicationTesting, type NativeAppFault } from "../runtime/native-app-testing";
import { nativeHost } from "../native-host";
import { createTextInputHost } from "../input/text-input";
import { join } from "path";
import { tmpdir } from "os";

export interface DemoOptions {
	readonly bunnyCount: number;
	readonly fastBundleSmokeBatches: number;
	readonly fpsHudScale: number;
}

export interface DemoHandle { dispose(): Promise<void>; }

const BUNNY_NAMES = [
	"rabbitv3_ash.png", "rabbitv3_batman.png", "rabbitv3_bb8.png",
	"rabbitv3_frankenstein.png", "rabbitv3_neo.png", "rabbitv3_sonic.png",
	"rabbitv3_spidey.png", "rabbitv3_stormtrooper.png", "rabbitv3_superman.png",
	"rabbitv3_tron.png", "rabbitv3_wolverine.png", "rabbitv3.png",
];

const DEMO_FONT_FAMILY = [
	"Segoe UI Variable", "Segoe UI Variable Text", "Segoe UI",
	"Microsoft YaHei UI", "Microsoft YaHei",
	"Yu Gothic UI", "Yu Gothic", "Malgun Gothic",
	"Segoe UI Emoji", "sans-serif",
] as const;

export async function createDemo(app: NativePixiApplication, options: DemoOptions): Promise<DemoHandle> {
	const testing = getNativePixiApplicationTesting(app);
	const bunnyUrls = BUNNY_NAMES.map((name) => new URL(`../assets/bunnies/${name}`, import.meta.url).href);
	const root = new Container({ label: "demo-scene" });
	root.eventMode = "static";
	app.stage.label ||= "stage";
	app.stage.addChild(root);

	const requestFrame = () => app.invalidate();
	const subscriptions: Array<() => void> = [];
	const textInputHost = createTextInputHost({
		root,
		nativeInput: app.nativeInput,
		nativeTextInput: app.textInput,
		clipboard: nativeHost.platform.clipboard,
		requestFrame,
	});
	const textInputEvents: Array<Record<string, unknown>> = [];
	let committedText = "";
	const recordTextInputEvent = (type: string, event: Record<string, unknown> = {}) => {
		textInputEvents.push({ type, ...event });
		if (textInputEvents.length > 128) textInputEvents.shift();
	};
	subscriptions.push(
		app.textInput.onCompositionStart(({ timestamp }) => recordTextInputEvent("composition-start", { timestamp: timestamp.toString() })),
		app.textInput.onCompositionUpdate(({ timestamp, text, cursorUtf16 }) => recordTextInputEvent("composition-update", { timestamp: timestamp.toString(), text, cursorUtf16 })),
		app.textInput.onCompositionEnd(({ timestamp, reason }) => recordTextInputEvent("composition-end", { timestamp: timestamp.toString(), reason })),
		app.textInput.onCompositionCancel(({ timestamp }) => recordTextInputEvent("composition-cancel", { timestamp: timestamp.toString() })),
		app.textInput.onCommit(({ timestamp, text }) => { committedText += text; recordTextInputEvent("commit", { timestamp: timestamp.toString(), text }); }),
		app.textInput.onError(({ timestamp, code, message }) => recordTextInputEvent("error", { timestamp: timestamp.toString(), code, message })),
	);
	const nativeFileDrops: Array<{ paths: readonly string[]; x: number; y: number }> = [];
	const dropSubscription = await nativeHost.platform.fileTransfer.subscribeDrops((drop) => {
		nativeFileDrops.push(drop);
		if (nativeFileDrops.length > 32) nativeFileDrops.shift();
	});
	if (!dropSubscription.ok) throw new Error(dropSubscription.error.message);
	subscriptions.push(dropSubscription.value);
	let debugDragOutPath: string | null = null;
	let lastDragOut: unknown = null;

	const panel = new Graphics().roundRect(-180, -180, 360, 360, 48)
		.fill({ color: 0x151a2e }).stroke({ color: 0x343d68, width: 3 });
	const orbitSource = new Graphics().circle(0, 0, 126)
		.stroke({ color: 0x485487, width: 2, alpha: 0.65 })
		.circle(0, -126, 11).fill({ color: 0xff4f9a })
		.circle(126, 0, 11).fill({ color: 0x53d8fb })
		.circle(0, 126, 11).fill({ color: 0xf9d65c })
		.circle(-126, 0, 11).fill({ color: 0x8ee66b });
	const markSource = new Graphics().roundRect(-72, -72, 144, 144, 36)
		.fill({ color: 0x6c63ff })
		.poly([-42, -18, 0, -54, 42, -18, 26, 44, -26, 44]).fill({ color: 0xffffff });
	const glow = new Graphics().circle(0, 0, 92).fill({ color: 0x5148ff, alpha: 0.45 });
	glow.filters = [new BlurFilter({ strength: 14, quality: 1 })];

	const blend = new Container();
	blend.position.set(-275, 0);
	const blendB = new Graphics().circle(18, 0, 36).fill({ color: 0x53d8fb });
	blendB.blendMode = "multiply";
	blend.addChild(
		new Graphics().roundRect(-58, -58, 116, 116, 28).fill({ color: 0xdce5ff }),
		new Graphics().circle(-18, 0, 36).fill({ color: 0xff4f9a }), blendB,
	);
	const maskDemo = new Container();
	maskDemo.position.set(275, 0);
	const bars = new Graphics().rect(-56, -56, 38, 112).fill({ color: 0xff4f9a })
		.rect(-18, -56, 38, 112).fill({ color: 0xf9d65c })
		.rect(20, -56, 38, 112).fill({ color: 0x53d8fb });
	const circleMask = new Graphics().circle(0, 0, 54).fill({ color: 0xffffff });
	bars.mask = circleMask;
	maskDemo.addChild(bars, circleMask);

	const maskPixels = new Uint8Array(64 * 64 * 4);
	for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
		const alpha = Math.max(0, Math.min(255, Math.round((1 - Math.hypot(x - 31.5, y - 31.5) / 32) * 255)));
		maskPixels.set([alpha, alpha, alpha, 255], (y * 64 + x) * 4);
	}
	const alphaMaskTexture = new Texture({ source: new BufferImageSource({
		resource: maskPixels, width: 64, height: 64, format: "rgba8unorm", alphaMode: "no-premultiply-alpha",
	}) });
	const alphaMask = new Sprite(alphaMaskTexture);
	alphaMask.anchor.set(0.5); alphaMask.scale.set(1.6);
	const alphaMasked = new Graphics().roundRect(-62, -42, 124, 84, 18).fill({ color: 0x53d8fb })
		.rect(-62, -10, 124, 20).fill({ color: 0xff4f9a });
	alphaMasked.mask = alphaMask;
	const alphaMaskDemo = new Container();
	alphaMaskDemo.position.set(300, 230); alphaMaskDemo.addChild(alphaMasked, alphaMask);
	const title = new Text({ text: "PixiJS · 中文 · 日本語 · 한국어 · 🙂", style: {
		fontFamily: [...DEMO_FONT_FAMILY], fontSize: 28, fontWeight: "bold",
		fill: 0xffffff, stroke: { color: 0x6c63ff, width: 3 },
	} });
	title.label = "title"; title.anchor.set(0.5); title.position.set(0, -235);

	const staticLayer = new Container();
	staticLayer.addChild(panel, glow, blend, maskDemo, alphaMaskDemo, title);
	const sources = [staticLayer, orbitSource, markSource];
	const frames = [new Rectangle(-450, -300, 900, 600), new Rectangle(-140, -140, 280, 280), new Rectangle(-80, -80, 160, 160)];
	let textures: Texture[] = [];
	let textureResolution = 0;
	const makeTextures = () => sources.map((target, index) => app.renderer.generateTexture({
		target, frame: frames[index], resolution: app.resolution,
	}));
	textures = makeTextures(); textureResolution = app.resolution;
	const staticSprite = new Sprite(textures[0]);
	const orbit = new Sprite(textures[1]);
	const mark = new Sprite(textures[2]);
	for (const sprite of [staticSprite, orbit, mark]) sprite.anchor.set(0.5);
	mark.label = "interactive-mark"; mark.eventMode = "static"; mark.cursor = "pointer";
	let activationCount = 0;
	const pointerEvents: Array<Record<string, unknown>> = [];
	const wheelEvents: Array<Record<string, unknown>> = [];
	const recordPointer = (event: any) => {
		pointerEvents.push({
			type: event.type, x: event.clientX, y: event.clientY,
			pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
			width: event.width, height: event.height, pressure: event.pressure,
			button: event.button, buttons: event.buttons,
		});
		if (pointerEvents.length > 128) pointerEvents.shift();
	};
	for (const type of ["pointerdown", "pointermove", "pointerup", "pointerupoutside", "pointercancel", "gotpointercapture", "lostpointercapture"]) {
		mark.on(type, recordPointer);
	}
	root.on("wheel", (event: any) => {
		wheelEvents.push({
			deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode,
			timeStamp: event.timeStamp, ctrlKey: event.ctrlKey, altKey: event.altKey,
			shiftKey: event.shiftKey, metaKey: event.metaKey,
		});
		if (wheelEvents.length > 128) wheelEvents.shift();
	});
	mark.on("pointertap", () => { activationCount++; mark.rotation += Math.PI / 4; requestFrame(); });
	mark.on("pointerdown", () => {
		if (!debugDragOutPath) return;
		const path = debugDragOutPath;
		debugDragOutPath = null;
		void nativeHost.platform.fileTransfer.dragOut(testing.handles().inputWindow, [path]).then((result) => { lastDragOut = result; });
	});
	mark.on("pointerenter", () => { mark.alpha = 0.78; requestFrame(); });
	mark.on("pointerleave", () => { mark.alpha = 1; requestFrame(); });

	const single = textInputHost.create({ width: 420, height: 42,
		placeholder: "单行输入 · 微软拼音 / Emoji", style: { fontFamily: DEMO_FONT_FAMILY } });
	single.label = "single-line-input";
	const multiline = textInputHost.create({ width: 420, height: 96, multiline: true,
		placeholder: "多行输入 · Enter 换行 · 拖右下角缩放", style: { fontFamily: DEMO_FONT_FAMILY } });
	multiline.label = "multiline-input";
	const textareaSize = { width: 420, height: 96 };
	const resizeHandle = new Graphics().rect(0, 0, 18, 18).fill({ color: 0xffffff, alpha: 0.001 })
		.moveTo(5, 15).lineTo(15, 5).moveTo(10, 15).lineTo(15, 10).stroke({ color: 0x77809f, width: 1.5 });
	resizeHandle.label = "textarea-resize-handle"; resizeHandle.eventMode = "static"; resizeHandle.cursor = "nwse-resize";
	let resizeStart: { x: number; y: number; width: number; height: number } | null = null;
	const placeHandle = () => resizeHandle.position.set(multiline.x + textareaSize.width - 18, multiline.y + textareaSize.height - 18);
	resizeHandle.on("pointerdown", (event: any) => {
		const point = event.getLocalPosition(root); resizeStart = { x: point.x, y: point.y, ...textareaSize }; multiline.focus();
	});
	resizeHandle.on("globalpointermove", (event: any) => {
		if (!resizeStart || !(Number(event.buttons) & 1)) return;
		const point = event.getLocalPosition(root);
		textareaSize.width = Math.max(220, Math.min(880, Math.round(resizeStart.width + point.x - resizeStart.x)));
		textareaSize.height = Math.max(60, Math.min(320, Math.round(resizeStart.height + point.y - resizeStart.y)));
		multiline.resize(textareaSize.width, textareaSize.height); placeHandle(); requestFrame();
	});
	for (const event of ["pointerup", "pointerupoutside", "pointercancel", "lostpointercapture"] as const)
		resizeHandle.on(event, () => { resizeStart = null; });
	root.addChild(staticSprite, orbit, mark);
	if (!options.fastBundleSmokeBatches) root.addChild(single, multiline, resizeHandle);

	const fastTextures: Texture[] = [];
	if (options.fastBundleSmokeBatches > 1) {
		for (let i = 1; i < options.fastBundleSmokeBatches; i++) {
			for (let j = 0; j < 16; j++) {
				const pixels = new Uint8Array([64 + i * 5, 80 + j * 8, 180, 255]);
				const texture = new Texture({ source: new BufferImageSource({ resource: pixels, width: 1, height: 1, format: "rgba8unorm" }) });
				fastTextures.push(texture);
				const sprite = new Sprite(texture); sprite.width = 5; sprite.height = 5;
				sprite.position.set(-430 + j * 9, -285 + i * 7); root.addChild(sprite);
			}
		}
	}

	const bunnyTextures = options.bunnyCount ? await Promise.all(bunnyUrls.map(url => Assets.load<Texture>(url))) : [];
	const bunnies: Sprite[] = [];
	const velocity: Array<[number, number]> = [];
	for (let i = 0; i < options.bunnyCount; i++) {
		const bunny = new Sprite(bunnyTextures[i % bunnyTextures.length]); bunny.anchor.set(0.5); bunny.scale.set(0.5);
		bunnies.push(bunny); velocity.push([(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8]); root.addChild(bunny);
	}

	let hud: Container | null = null;
	let hudCanvas: any = null;
	let hudContext: any = null;
	let hudTexture: Texture | null = null;
	if (options.bunnyCount) {
		hudCanvas = DOMAdapter.get().createCanvas(256, 28) as any; hudContext = hudCanvas.getContext("2d");
		const source = new BufferImageSource({ resource: new Uint8Array(256 * 28 * 4), width: 256, height: 28, format: "rgba8unorm" });
		hudTexture = new Texture({ source }); const text = new Sprite(hudTexture); text.scale.set(1 / options.fpsHudScale);
		hud = new Container({ label: "fps-hud" }); hud.addChild(text); root.addChild(hud);
	}

	const layout = () => {
		const { width, height } = app.contentSize;
		root.position.set(width / 2, height / 2);
		staticSprite.position.set(0, 0); orbit.position.set(0, 0); mark.position.set(0, 0);
		single.position.set(-Math.min(430, width / 2 - 28), Math.min(88, height / 2 - 172));
		multiline.position.set(single.x, single.y + 52); placeHandle();
		if (hud) hud.position.set(-width / 2 + 12, -height / 2 + 12);
	};
	const invalidateOffscreenSources = () => {
		const groups = sources.map((source) => source.renderGroup).filter(Boolean);
		for (let index = 0; index < groups.length; index++) {
			groups[index].structureDidChange = true;
			groups.push(...groups[index].renderGroupChildren);
		}
		const views: any[] = [...sources];
		for (let index = 0; index < views.length; index++) {
			views[index].unload?.();
			views.push(...(views[index].children ?? []));
		}
	};
	const rebuildTextures = () => {
		const old = textures; textures = makeTextures(); textureResolution = app.resolution;
		staticSprite.texture = textures[0]; orbit.texture = textures[1]; mark.texture = textures[2];
		for (const texture of old) texture.destroy(true);
		testing.recordEvent("scene-texture-resolution", { resolution: textureResolution });
	};
	layout();

	const remember = (type: string, detail?: unknown) => {
		testing.recordEvent(type, detail);
	};
	const listen = (event: string, listener: (...args: any[]) => void) => {
		const off = (app as any).on(event, listener);
		if (typeof off === "function") subscriptions.push(off);
	};
	listen("resize", () => {
		if (textureResolution !== app.resolution) rebuildTextures();
		layout(); remember("resize", app.contentSize); requestFrame();
	});
	listen("recovered", () => {
		invalidateOffscreenSources();
		rebuildTextures();
		textInputHost.rebindNativeInput(app.nativeInput);
		bindNativeKeys();
		textInputHost.recover();
		layout(); remember("recovered"); requestFrame();
	});
	listen("statechange", (event) => { remember(event.state, event); if (event.state === "running") requestFrame(); });

	let animationEnabled = true;
	let hudElapsed = 0;
	let hudFrames = 0;
	const animate = (deltaMs: number) => {
		const elapsed = Math.min(50, deltaMs);
		orbit.rotation += elapsed * 0.0007;
		mark.rotation += elapsed * 0.00035;
		if (bunnies.length) {
			const halfWidth = app.contentSize.width / 2;
			const halfHeight = app.contentSize.height / 2;
			for (let i = 0; i < bunnies.length; i++) {
				const bunny = bunnies[i]; const speed = velocity[i];
				bunny.x += speed[0] * elapsed / 16.67; bunny.y += speed[1] * elapsed / 16.67;
				if (bunny.x < -halfWidth || bunny.x > halfWidth) speed[0] *= -1;
				if (bunny.y < -halfHeight || bunny.y > halfHeight) speed[1] *= -1;
			}
		}
		if (hud && hudCanvas && hudContext && hudTexture) {
			hudFrames++; hudElapsed += elapsed;
			if (hudElapsed >= 250) {
				const fps = hudFrames * 1000 / hudElapsed;
				hudFrames = 0; hudElapsed = 0;
				hudContext.clearRect(0, 0, 256, 28);
				hudContext.font = "bold 16px sans-serif";
				hudContext.fillStyle = "white";
				hudContext.fillText(`${fps.toFixed(1)} FPS · ${options.bunnyCount.toLocaleString()}`, 2, 19);
				const pixels = hudContext.getImageData(0, 0, 256, 28).data;
				(hudTexture.source as any).resource.set(pixels);
				hudTexture.source.update();
			}
		}
	};
	let stopAnimation: (() => void) | null = app.animate(animate);
	const setAnimation = (enabled: boolean) => {
		animationEnabled = enabled;
		if (enabled && !stopAnimation) stopAnimation = app.animate(animate);
		else if (!enabled && stopAnimation) { stopAnimation(); stopAnimation = null; }
	};

	let offNativeKey = () => {};
	const bindNativeKeys = () => {
		offNativeKey();
		const nativeInput: any = app.nativeInput;
		if (typeof nativeInput.onKey !== "function") return;
		offNativeKey = nativeInput.onKey((event: any) => {
			if (event.type !== "down" || event.repeat || event.code !== "F6") return;
			const preference = testing.diagnostics().gpu.preference === "integrated" ? "discrete" : "integrated";
			void testing.switchGpu(preference);
		});
	};
	bindNativeKeys();
	subscriptions.push(() => offNativeKey());

	const serializeTree = ({ depth, limit }: { depth: number; limit: number }) => {
		let visited = 0; let truncated = false;
		const visit = (node: any, remaining: number, path: string): any => {
			if (visited++ >= limit) { truncated = true; return null; }
			const bounds = node.getBounds?.();
			const result: any = {
				path, label: node.label || null, type: node.constructor?.name ?? "node",
				visible: node.visible,
				bounds: bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
			};
			if (remaining > 0 && node.children) {
				result.children = node.children.map((child: any, index: number) =>
					visit(child, remaining - 1,
						`${path}/${child.label || `${child.constructor?.name ?? "node"}[${index}]`}`))
					.filter(Boolean);
			}
			return result;
		};
		return { visited, truncated, root: visit(app.stage, depth, "stage") };
	};
	const standardRenderCheck = async () => {
		if (app.state !== "running") {
			const presented = app.nextPresent(); app.invalidate(); await presented;
		}
		const wasPaused = testing.diagnostics().runtime.paused;
		if (!wasPaused) testing.pause();
		try {
			const renderer = app.renderer;
			for (let index = 0; index < sources.length; index++) {
				const frame = frames[index];
				renderer.render({
					container: sources[index], target: textures[index],
					transform: new Matrix(1, 0, 0, 1, -frame.x, -frame.y), clearColor: [0, 0, 0, 0],
				});
				textures[index].source.updateMipmaps();
			}
			const results = [];
			for (let index = 0; index < textures.length; index++) {
				const extracted = await (renderer.extract as any).pixels(textures[index]);
				let visiblePixels = 0;
				for (let offset = 3; offset < extracted.pixels.length; offset += 4) if (extracted.pixels[offset]) visiblePixels++;
				results.push({
					index, width: extracted.width, height: extracted.height, visiblePixels,
					hash: createHash("sha256").update(extracted.pixels).digest("hex"),
				});
			}
			return results;
		} finally {
			if (!wasPaused) testing.resume();
		}
	};

	const bridge = await startAgentDebugBridge({
		status() {
			const diagnostics = testing.diagnostics();
			return {
				...diagnostics,
				runtime: {
					...diagnostics.runtime,
					focusOwner: textInputHost.focused?.label ?? null,
				},
				host: diagnostics.host,
				window: {
					...diagnostics.window,
					native: diagnostics.window.snapshot,
				},
				frame: {
					...diagnostics.frame,
					requestedFastBundleCount: options.fastBundleSmokeBatches,
				},
				renderTarget: diagnostics.renderTarget,
				input: {
					...diagnostics.input,
					activationCount,
					diagnostics: {
						queued: diagnostics.input.queued,
						dropped: diagnostics.input.dropped,
						coalesced: diagnostics.input.coalesced,
						duplicates: diagnostics.input.duplicates,
					},
					nativeEvents: diagnostics.input.nativeEvents,
					pointerEvents,
					text: {
						active: Boolean((app.textInput as any).active),
						committedText,
						events: textInputEvents.slice(-32),
					},
				},
				events: diagnostics.events,
			};
		},
		tree: serializeTree,
		async capture() {
			const path = join(tmpdir(), `electrobun-pixi-${process.pid}-${Date.now()}.png`);
			await (app.renderer.extract as any).download({ target: app.stage, filename: path });
			return { path, bytes: Bun.file(path).size };
		},
		async command(command) {
			const action = String(command.action ?? "");
			if (action === "fault") {
				const kind = String(command.kind) as NativeAppFault;
				testing.injectFault(kind); requestFrame();
				return { injected: kind };
			}
			if (action === "switch-gpu") {
				const preference = command.preference;
				if (preference !== "integrated" && preference !== "discrete") {
					throw new Error("invalid GPU preference");
				}
				await testing.switchGpu(preference);
				return { preference };
			}
			if (action === "recover") {
				await testing.recover();
				return testing.diagnostics().runtime;
			}
			if (action === "pause") { testing.pause(); return { paused: true }; }
			if (action === "resume") { testing.resume(); return { paused: false }; }
			if (action === "animation") {
				setAnimation(Boolean(command.enabled));
				return { enabled: animationEnabled };
			}
			if (action === "step") {
				testing.step(Math.max(1, Math.floor(Number(command.frames ?? 1))));
				return { paused: true };
			}
			if (action === "standard-render-check") {
				return { textures: await standardRenderCheck() };
			}
			if (action === "text-control-status") {
				return {
					focused: textInputHost.focused?.label ?? null,
					value: single.value,
					selection: single.selection,
					textInputActive: Boolean((app.textInput as any).active),
				};
			}
			if (action === "text-control-check") {
				const previous = { value: single.value, selection: single.selection };
				const samples = [];
				try {
					single.focus();
					for (const text of ["MMMMMMMM", "iiiiiiii"]) {
						single.value = ""; single.setSelectionRange(0); single.setCaretVisible(false);
						app.nativeInput.emitText(text);
						const result = await (app.renderer.extract as any).pixels(single);
						samples.push({ text, value: single.value, hash: createHash("sha256").update(result.pixels).digest("hex") });
					}
				} finally {
					single.value = previous.value;
					single.setSelectionRange(previous.selection.anchor, previous.selection.focus);
					single.blur();
				}
				if (samples.some((sample) => sample.value !== sample.text) || samples[0]!.hash === samples[1]!.hash) {
					throw new Error("native text input render check failed");
				}
				return { passed: true, samples };
			}
			if (action === "input-status") {
				const input = testing.diagnostics().input;
				return {
					captured: input.captured, activationCount, nativeCaptured: input.nativeCaptured,
					lastCursor: input.lastCursor,
					diagnostics: { queued: input.queued, dropped: input.dropped, coalesced: input.coalesced, duplicates: input.duplicates },
					events: input.nativeEvents, pointerEvents, wheelEvents,
				};
			}
			if (action === "input-reset") {
				testing.resetInputEvents(); pointerEvents.length = 0; wheelEvents.length = 0;
				return { reset: true };
			}
			if (action === "text-status") {
				return {
					active: Boolean((app.textInput as any).active),
					focused: textInputHost.focused?.label ?? null,
					state: app.textInput.state,
					committedText,
					events: textInputEvents.slice(-64),
				};
			}
			if (action === "text-begin") {
				const text = String(command.text ?? "");
				textInputEvents.length = 0;
				committedText = "";
				return app.textInput.begin({
					caretRect: { x: Number(command.x ?? 20), y: Number(command.y ?? 20), width: Number(command.width ?? 2), height: Number(command.height ?? 24) },
					surroundingText: text, selection: { start: text.length, end: text.length },
				});
			}
			if (action === "text-end") return app.textInput.end();
			if (action === "native-input-target") {
				const label = String(command.label ?? "interactive-mark");
				const target: any = app.stage.getChildByLabel(label, true);
				if (!target) throw new Error(`Pixi node not found: ${label}`);
				const bounds = target.getBounds();
				const client = {
					x: Math.round((bounds.x + bounds.width / 2) * app.resolution),
					y: Math.round((bounds.y + bounds.height / 2) * app.resolution),
				};
				const snapshot = testing.diagnostics().window.snapshot;
				return {
					label,
					client, screen: testing.clientToScreen(client.x, client.y),
					windowHandle: testing.handles().inputWindow,
					frame: { x: snapshot.frameX, y: snapshot.frameY, width: snapshot.frameWidth, height: snapshot.frameHeight },
				};
			}
			if (action === "close") { setTimeout(() => app.window.requestClose(), 0); return { closing: true }; }
			if (action === "minimize") { app.window.minimize(); return { minimized: true }; }
			if (action === "restore") { app.window.unminimize(); return { minimized: false }; }
			if (action === "resize") {
				const width = Math.round(Number(command.width)); const height = Math.round(Number(command.height));
				if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 240 || width > 8192 || height > 8192) throw new Error("invalid resize dimensions");
				const frame = app.window.getFrame(); app.window.setFrame(frame.x, frame.y, width, height); testing.syncWindow(true); return { width, height };
			}
			if (action === "move") {
				const x = Math.round(Number(command.x)); const y = Math.round(Number(command.y));
				if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("invalid window position");
				app.window.setPosition(x, y); testing.syncWindow(true); return { x, y };
			}
			if (action === "capture-start") { const bounds = mark.getBounds(); app.nativeInput.emitPointer("pointerdown", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, 0); return { captured: app.nativeInput.hasPointerCapture() }; }
			if (action === "capture-release") { app.nativeInput.releasePointerCapture(); return { captured: app.nativeInput.hasPointerCapture() }; }
			if (action === "file-drop-status") return { drops: nativeFileDrops.slice(-32) };
			if (action === "file-drop-reset") { nativeFileDrops.length = 0; return { reset: true }; }
			if (action === "click" || action === "hover" || action === "drag") {
				const label = String(command.label ?? ""); const target: any = app.stage.getChildByLabel(label, true);
				if (!target) throw new Error(`Pixi node not found: ${label}`);
				const bounds = target.getBounds(); const x = bounds.x + bounds.width / 2; const y = bounds.y + bounds.height / 2;
				if (action === "hover") { app.nativeInput.emitPointer("pointermove", -1, -1); const outsideAlpha = target.alpha; app.nativeInput.emitPointer("pointermove", x, y); return { hovered: outsideAlpha === 1 && target.alpha < 1, label, x, y, outsideAlpha, alpha: target.alpha }; }
				if (action === "click") { app.nativeInput.emitPointer("pointerdown", x, y, 0); app.nativeInput.emitPointer("pointerup", x, y, 0); return { clicked: label, x, y }; }
				const dx = Number(command.dx ?? 0); const dy = Number(command.dy ?? 0); const before = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
				app.nativeInput.emitPointer("pointerdown", x, y, 0); app.nativeInput.emitPointer("pointermove", x + dx, y + dy, 0); app.nativeInput.emitPointer("pointerup", x + dx, y + dy, 0);
				const afterBounds = target.getBounds(); return { dragged: label, dx, dy, before, after: { x: afterBounds.x, y: afterBounds.y, width: afterBounds.width, height: afterBounds.height }, textarea: { ...textareaSize } };
			}
			if (action === "pointer-capture") { const bounds = mark.getBounds(); app.nativeInput.emitPointer("pointerdown", bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, 0); const captured = app.nativeInput.hasPointerCapture(); app.nativeInput.emitPointer("pointercancel", -20, -20, -1); return { captured, released: !app.nativeInput.hasPointerCapture() }; }
			if (action === "save-dialog") return nativeHost.platform.dialogs.saveFile({ startingFolder: String(command.startingFolder ?? import.meta.dir), defaultName: String(command.defaultName ?? "pixi-save-smoke.txt"), allowedFileTypes: String(command.allowedFileTypes ?? "txt") });
			if (action === "drag-out-prepare") {
				debugDragOutPath = String(command.path ?? import.meta.path);
				lastDragOut = null;
				return { path: debugDragOutPath, gesture: "drag interactive-mark" };
			}
			if (action === "drag-out-status") return { path: debugDragOutPath, result: lastDragOut };
			if (action === "job-read") { const data = await nativeHost.jobs.readFile(String(command.path ?? import.meta.path)); return { bytes: data.byteLength, prefix: [...data.subarray(0, 4)] }; }
			if (action === "job-scan") { const entries = await nativeHost.jobs.scanDirectory(String(command.path ?? import.meta.dir)); return { count: entries.length, entries: entries.slice(0, 32) }; }
			throw new Error(`unknown debug command: ${action}`);
		},
	});

	requestFrame();
	let disposed = false;
	let removeRuntimeCleanup = () => {};
	const dispose = async () => {
		if (disposed) return;
		disposed = true;
		removeRuntimeCleanup();
			await bridge?.stop();
			stopAnimation?.(); stopAnimation = null;
			for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
			textInputHost.destroy();
			root.removeFromParent();
			root.destroy({ children: true });
			for (const texture of textures) texture.destroy(true);
			for (const texture of fastTextures) texture.destroy(true);
			alphaMaskTexture.destroy(true);
			hudTexture?.destroy(true);
			staticLayer.destroy({ children: true });
			orbitSource.destroy();
			markSource.destroy();
			await Promise.all(bunnyUrls.slice(0, bunnyTextures.length).map(url => Assets.unload(url)));
	};
	removeRuntimeCleanup = testing.addCleanup(dispose);
	return { dispose };
}
