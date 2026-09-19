import { expect, test } from "bun:test";
import { Container } from "pixi.js";
import { installNativeSkia } from "../rendering/native-skia";
import { createTextInputHost } from "./text-input";

test("TextInput routes keyboard, IME, focus, and clipboard through one editor seam", async () => {
	installNativeSkia();
	const keyListeners = new Set<(event: any) => void>();
	const focusListeners = new Set<(focused: boolean) => void>();
	const textListeners = new Set<(text: string) => void>();
	const compositionStart = new Set<(event: any) => void>();
	const compositionUpdate = new Set<(event: any) => void>();
	const compositionCancel = new Set<(event: any) => void>();
	const commit = new Set<(event: any) => void>();
	let nativeState: any = null;
	let nativeUpdates = 0;
	let clipboardText = "";
	let requestedFrames = 0;
	let readClipboard: () => Promise<{ ok: true; value: string | null }> = async () => ({ ok: true, value: "🙂" });
	const subscribe = <T>(set: Set<T>, listener: T) => { set.add(listener); return () => { set.delete(listener); }; };
	const nativeInput = {
		onKey: (listener: (event: any) => void) => subscribe(keyListeners, listener),
		onFocusChange: (listener: (focused: boolean) => void) => subscribe(focusListeners, listener),
		onTextCommit: (listener: (text: string) => void) => subscribe(textListeners, listener),
	};
	const nativeTextInput = {
		get active() { return nativeState !== null; },
		get state() { return nativeState; },
		begin(options: any) { nativeState = options; return { status: 1, degraded: false }; },
		update(options: any) { nativeUpdates++; nativeState = options; return { status: 1, degraded: false }; },
		end() { nativeState = null; return { status: 1, degraded: false }; },
		commit(text: string) { for (const listener of commit) listener({ text, timestamp: 1n }); },
		onCompositionStart: (listener: (event: any) => void) => subscribe(compositionStart, listener),
		onCompositionUpdate: (listener: (event: any) => void) => subscribe(compositionUpdate, listener),
		onCompositionCancel: (listener: (event: any) => void) => subscribe(compositionCancel, listener),
		onCommit: (listener: (event: any) => void) => subscribe(commit, listener),
	};
	const root = new Container();
	const host = createTextInputHost({
		root,
		textResolution:()=>2.5,
		nativeInput,
		nativeTextInput,
		clipboard: {
			readText: () => readClipboard(),
			writeText: async (text: string) => { clipboardText = text; return { ok: true as const, value: undefined }; },
		},
		requestFrame() { requestedFrames++; },
	});
	const input = host.create({
		width: 180,
		height: 36,
		value: "A中",
		maxLength: 16,
		style: { fontFamily: ["Segoe UI", "Microsoft YaHei", "Segoe UI Emoji"] },
	});
	root.addChild(input);
	input.focus();
	expect(nativeState).toMatchObject({ surroundingText: "A中", selection: { start: 2, end: 2 } });

	for (const listener of keyListeners) listener({ type: "down", key: "ArrowLeft", ctrlKey: false, shiftKey: false, isComposing: false });
	for (const listener of keyListeners) listener({ type: "down", key: "Backspace", ctrlKey: false, shiftKey: false, isComposing: false });
	expect(input.value).toBe("中");

	for (const listener of compositionStart) listener({ timestamp: 1n });
	for (const listener of compositionUpdate) listener({ timestamp: 2n, text: "ni", cursorUtf16: 2 });
	expect(input.value).toBe("中");
	for (const listener of commit) listener({ timestamp: 3n, text: "你" });
	expect(input.value).toBe("你中");

	input.selectAll();
	for (const listener of keyListeners) listener({ type: "down", key: "c", ctrlKey: true, shiftKey: false, isComposing: false });
	await Promise.resolve();
	expect(clipboardText).toBe("你中");
	for (const listener of keyListeners) listener({ type: "down", key: "v", ctrlKey: true, shiftKey: false, isComposing: false });
	await new Promise((resolve) => setImmediate(resolve));
	expect(input.value).toBe("🙂");

	let resolveRead!: (result: { ok: true; value: string | null }) => void;
	readClipboard = () => new Promise((resolve) => { resolveRead = resolve; });
	input.selectAll();
	for (const listener of keyListeners) listener({ type: "down", key: "v", ctrlKey: true, shiftKey: false, isComposing: false });
	input.blur();
	input.focus();
	resolveRead({ ok: true, value: "stale" });
	await new Promise((resolve) => setImmediate(resolve));
	expect(input.value).toBe("🙂");

	const maxed = host.create({ width: 180, height: 36, value: "a", maxLength: 1 });
	root.addChild(maxed);
	maxed.focus();
	for (const listener of compositionStart) listener({ timestamp: 4n });
	for (const listener of compositionUpdate) listener({ timestamp: 5n, text: "中", cursorUtf16: 1 });
	expect(maxed.editor.view.text).toBe("a中");
	requestedFrames = 0;
	for (const listener of commit) listener({ timestamp: 6n, text: "中" });
	expect(maxed.editor.view.composition).toBeUndefined();
	expect(requestedFrames).toBeGreaterThan(0);

	const historyInput = host.create({ width: 180, height: 36 });
	root.addChild(historyInput);
	historyInput.focus();
	for (const listener of textListeners) listener("a");
	for (const listener of textListeners) listener("b");
	for (const listener of keyListeners) listener({
		type: "down", key: "z", ctrlKey: true, shiftKey: false, isComposing: false,
	});
	expect(historyInput.value).toBe("");

	const focusHistory = host.create({ width: 180, height: 36 });
	root.addChild(focusHistory);
	focusHistory.focus();
	for (const listener of textListeners) listener("a");
	focusHistory.blur();
	focusHistory.focus();
	for (const listener of textListeners) listener("b");
	for (const listener of keyListeners) listener({
		type: "down", key: "z", ctrlKey: true, shiftKey: false, isComposing: false,
	});
	expect(focusHistory.value).toBe("a");

	const lineSelect = host.create({ width: 180, height: 72, value: "a\nb", multiline: true });
	root.addChild(lineSelect);
	(lineSelect as any).emit("pointerdown", {
		button: 0, detail: 3, getLocalPosition: () => ({ x: 12, y: 12 }),
	});
	expect(lineSelect.selection).toMatchObject({ start: 0, end: 2 });
	(lineSelect as any).emit("pointerup", {});

	const resizeInput = host.create({ width: 180, height: 72, multiline: true });
	root.addChild(resizeInput);
	resizeInput.focus();
	nativeUpdates = 0;
	resizeInput.resize(240, 100);
	expect(nativeUpdates).toBe(1);

	input.setValue("abcdefghijklmno");
	input.setSelectionRange(0);
	(input as any).emit("pointerdown", { button: 0, detail: 1, getLocalPosition: () => ({ x: 10, y: 18 }) });
	(input as any).emit("globalpointermove", { getLocalPosition: () => ({ x: 400, y: 18 }) });
	expect(input.selection.end).toBeGreaterThan(input.selection.start);
	(input as any).emit("pointerupoutside", {});

	const readOnly = host.create({ width: 180, height: 36, value: "locked", readOnly: true });
	root.addChild(readOnly);
	readOnly.focus();
	expect(nativeState).toBeNull();
	for (const listener of compositionStart) listener({ timestamp: 7n });
	for (const listener of compositionUpdate) listener({ timestamp: 8n, text: "edit", cursorUtf16: 4 });
	for (const listener of commit) listener({ timestamp: 9n, text: "edit" });
	for (const listener of textListeners) listener("edit");
	expect(readOnly.value).toBe("locked");
	expect(readOnly.editor.view.composition).toBeUndefined();

	const scrollInput = host.create({
		width: 180,
		height: 72,
		value: Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n"),
		multiline: true,
		style: { lineHeight: 20 },
	});
	root.addChild(scrollInput);
	(scrollInput as any).emit("wheel", { deltaY: 20, deltaMode: 0 });
	expect(scrollInput.editor.state.scrollY).toBe(20);
	(scrollInput as any).emit("wheel", { deltaY: 1, deltaMode: 1 });
	expect(scrollInput.editor.state.scrollY).toBe(40);
	(scrollInput as any).emit("wheel", { deltaY: 1, deltaMode: 2 });
	expect(scrollInput.editor.state.scrollY).toBe(92);

	const plain = host.create({ width: 200, height: 35, chrome: false });
	root.addChild(plain);
	plain.focus();
	expect(plain.focused).toBe(true);
	expect((plain as any).background.context.instructions.length).toBe(0);
	expect((plain as any).focusLayer.context.instructions.length).toBe(0);
	plain.beginComposition();
	expect(plain.composing).toBe(true);
	plain.cancelComposition();
	expect(plain.composing).toBe(false);
	plain.blur();
	expect(plain.focused).toBe(false);
	const compact=host.create({width:220,height:30,value:"应用路径",style:{fontFamily:["Segoe UI","Microsoft YaHei"],fontSize:13,fontWeight:"600",lineHeight:16,padding:6,paddingHorizontal:10}});
	root.addChild(compact);compact.focus();
	expect((compact as any).textNode.resolution).toBe(2.5);
	expect((compact as any).placeholderNode.resolution).toBe(2.5);
	expect((compact as any).textNode.style.fontWeight).toBe("600");
	expect((compact as any).innerSize()).toEqual({width:200,height:18});
	const local=(compact as any).layoutToLocal(25,0);
	expect(local).toEqual({x:35,y:7});
	expect((compact as any).localToLayout(local.x,local.y)).toEqual({x:25,y:0});
	const centered = host.create({ width: 360, height: 38, value: "中文标题", chrome: false,
		style: { fontSize: 26, lineHeight: 34, padding: 2, paddingHorizontal: 12,
			textAlign: "center", selectionTextColor: 0x312e81, selectionColor: 0xffffff, selectionAlpha: 0.86 } });
	root.addChild(centered);centered.focus();centered.selectAll();
	const centerStart = (centered as any).layoutToLocal(0, 0);
	const centerEnd = (centered as any).layoutToLocal((centered as any).layoutSnapshot.offsetToCaret(centered.value.length).x, 0);
	expect((centerStart.x + centerEnd.x) / 2).toBeCloseTo(180);
	expect((centered as any).localToLayout(centerStart.x, centerStart.y)).toEqual({ x: 0, y: 0 });
	expect((centered as any).selectedText.visible).toBe(true);
	expect((centered as any).selectedText.style.fill).toBe(0x312e81);
	centered.value = "Very long folder title ".repeat(20);
	expect((centered as any).horizontalInset()).toBe(0);
	centered.blur();expect((centered as any).selectedText.visible).toBe(false);
	host.destroy();
});
