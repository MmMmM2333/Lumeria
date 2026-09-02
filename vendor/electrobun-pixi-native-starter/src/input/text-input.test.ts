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
		nativeInput,
		nativeTextInput,
		clipboard: {
			readText: () => readClipboard(),
			writeText: async (text: string) => { clipboardText = text; return { ok: true as const, value: undefined }; },
		},
		requestFrame() { requestedFrames++; },
	});
	const input = host.create({ width: 180, height: 36, value: "A中", maxLength: 16 });
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

	host.destroy();
});
