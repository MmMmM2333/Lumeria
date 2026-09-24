import { describe, expect, mock, test } from "bun:test";
import type { NativeTextEvent, TextInputRect } from "../platform/native-frame-host";
import { Container } from "pixi.js";
import { installNativeSkia } from "../rendering/native-skia";
import { createTextInputHost } from "./text-input";

mock.module("../platform/native-frame-host", () => ({
	nativeFrameHost: {
		beginTextInput: () => 1,
		updateTextInput: () => 1,
		endTextInput: () => 1,
		pollTextEvent: () => null,
	},
}));
const { createNativeTextInputSession } = await import("./native-text-input");

const createHost = () => {
	const events: NativeTextEvent[] = [];
	const updates: TextInputRect[] = [];
	return {
		events,
		updates,
		host: {
			beginTextInput: () => 1,
			updateTextInput: (_window: number, rect: TextInputRect) => { updates.push(rect); return 1; },
			endTextInput: () => 1,
			pollTextEvent: () => events.shift() ?? null,
		},
	};
};

describe("native text input session", () => {
	test("the editor retires on native blur after draining all queued commits, then accepts a new focus", () => {
		installNativeSkia();
		const { host: nativeHost, events } = createHost();
		let nativeActive = false, begins = 0, updates = 0, blurs = 0;
		nativeHost.beginTextInput = () => { begins++; nativeActive = true; return 1; };
		nativeHost.updateTextInput = () => { updates++; return nativeActive ? 1 : 0; };
		nativeHost.endTextInput = () => { nativeActive = false; return 0; };
		const session = createNativeTextInputSession({ windowHandle: 1, route: 105n, nativeHost, toPhysicalRect: r => ({ ...r }) });
		const root = new Container();
		let notifyFocus = (_focused: boolean) => {};
		const editorHost = createTextInputHost({ root, nativeTextInput: session,
			nativeInput: { onKey: () => () => {}, onTextCommit: () => () => {}, onFocusChange: listener => { notifyFocus = listener; return () => {}; } },
			clipboard: { readText: async () => ({ ok: true, value: "" }), writeText: async () => ({ ok: true, value: undefined }) },
			requestFrame: () => {},
		});
		const input = editorHost.create({ width: 200, height: 40 });
		root.addChild(input);
		input.on("blur", () => blurs++);
		input.on("textviewchange", () => editorHost.syncFocused());
		try {
			input.focus();
			session.updateComposition("ni");
			nativeActive = false; // WM_KILLFOCUS has run, but JS focus notification has not.
			const updatesBeforeBlur = updates;
			events.push(
				{ route: 105n, timestamp: 1n, kind: 4, code: 0, cursor: 0, text: "你" },
				{ route: 105n, timestamp: 2n, kind: 3, code: 0, cursor: 0, text: "" },
				{ route: 105n, timestamp: 3n, kind: 4, code: 0, cursor: 0, text: "好" },
			);
			session.poll(); // Discover blur inside the first commit's editor callback.
			expect(input.value).toBe("你好");
			expect(input.composing).toBe(false);
			expect(input.focused).toBe(false);
			expect(editorHost.focused).toBeNull();
			expect(session.active).toBe(false);
			expect(updates).toBe(updatesBeforeBlur + 1);
			for (let i = 0; i < 3; i++) editorHost.syncFocused();
			notifyFocus(false); // The delayed blur must not emit twice or restart input.
			expect(begins).toBe(1);
			expect(blurs).toBe(1);
			notifyFocus(true);
			input.focus();
			session.commit("!");
			expect(input.value).toBe("你好!");
			expect(session.active).toBe(true);
			session.updateComposition("cancel");
			nativeActive = false;
			editorHost.syncFocused(); // The animation discovers blur with no IME event.
			expect(input.composing).toBe(false);
			expect(input.focused).toBe(false);
			expect(blurs).toBe(2);
			expect(begins).toBe(2);
			input.focus();
			input.blur(); // Explicit editor blur also fires once despite onEnd reentry.
			expect(blurs).toBe(3);
		} finally { editorHost.destroy(); session.destroy(); root.destroy({ children: true }); }
	});

	test("native blur ends a stale JS session and drains pending IME events without more caret updates", () => {
		const { host, events } = createHost();
		let updates = 0, ends = 0;
		host.updateTextInput = () => { updates++; return 0; };
		host.endTextInput = () => { ends++; return 0; };
		const session = createNativeTextInputSession({ windowHandle: 1, route: 103n, nativeHost: host, toPhysicalRect: r => ({ ...r }) });
		const context = { caretRect: { x: 1, y: 2, width: 2, height: 20 }, surroundingText: "", selection: { start: 0, end: 0 } };
		const seen: string[] = [];
		const endingUpdates: number[] = [];
		session.onCommit(({ text }) => {
			seen.push(`commit:${text}`);
			// TextInputHost synchronizes the caret when applying an IME commit.
			endingUpdates.push(session.update(context).status);
		});
		session.onCompositionCancel(() => seen.push("cancel"));
		session.onCompositionEnd(({ reason }) => seen.push(`end:${reason}`));
		try {
			session.begin(context);
			session.updateComposition("ni");
			events.push(
				{ route: 103n, timestamp: 1n, kind: 4, code: 0, cursor: 0, text: "你" },
				{ route: 103n, timestamp: 2n, kind: 3, code: 0, cursor: 0, text: "" },
			);
			expect(session.update(context)).toEqual({ status: 0, degraded: false });
			expect(session.active).toBe(false);
			expect(seen).toEqual(["commit:你", "end:commit"]);
			expect(endingUpdates).toEqual([0]);
			expect(updates).toBe(1);
			expect(ends).toBe(1);
			expect(session.blur().status).toBe(0);
			expect(ends).toBe(1);
			session.begin(context);
			session.updateComposition("cancel");
			events.push({ route: 103n, timestamp: 3n, kind: 3, code: 0, cursor: 0, text: "" });
			session.update(context);
			expect(seen).toEqual(["commit:你", "end:commit", "cancel", "end:cancel"]);
			host.updateTextInput = () => 1;
			session.begin(context);
			expect(session.update(context).status).toBe(1);
			expect(session.active).toBe(true);
		} finally { session.destroy(); }
	});

	test("invalid caret and native failures remain errors, not an implicit blur", () => {
		const { host } = createHost();
		const session = createNativeTextInputSession({ windowHandle: 1, route: 104n, nativeHost: host, toPhysicalRect: r => ({ ...r }) });
		const context = { caretRect: { x: 1, y: 2, width: 2, height: 20 }, surroundingText: "", selection: { start: 0, end: 0 } };
		try {
			session.begin(context);
			for (const code of [-1, -3, -4, -5, -7]) {
				host.updateTextInput = () => code;
				expect(() => session.update(context)).toThrow(`updateTextInput failed (${code})`);
				expect(session.active).toBe(true);
			}
		} finally { session.destroy(); }
	});

	test("synchronizes caret, surrounding text, and UTF-16 selection", () => {
		const { host, updates } = createHost();
		const session = createNativeTextInputSession({
			windowHandle: 1,
			route: 101n,
			nativeHost: host,
			toPhysicalRect: ({ x, y, width, height }) => ({ x: x * 2, y: y * 2, width: width * 2, height: height * 2 }),
		});
		session.begin({
			caretRect: { x: 1, y: 2, width: 1, height: 10 },
			surroundingText: "A🙂B",
			selection: { start: 1, end: 3 },
		});

		session.update({
			caretRect: { x: 3, y: 4, width: 1, height: 12 },
			surroundingText: "中文🙂",
			selection: { start: 2, end: 4 },
		});
		expect(updates).toEqual([{ x: 6, y: 8, width: 2, height: 24 }]);
		expect(session.state).toMatchObject({
			caretRect: { x: 3, y: 4, width: 1, height: 12 },
			surroundingText: "中文🙂",
			selection: { start: 2, end: 4 },
		});

		expect(() => session.update({
			caretRect: { x: 9, y: 9, width: 1, height: 1 },
			surroundingText: "x",
			selection: { start: 0, end: 2 },
		})).toThrow("UTF-16 offsets");
		expect(updates).toHaveLength(1);
		expect(session.state?.surroundingText).toBe("中文🙂");

		session.updateCaretRect({ x: 5, y: 6, width: 1, height: 12 });
		expect(session.state).toMatchObject({
			caretRect: { x: 5, y: 6, width: 1, height: 12 },
			surroundingText: "中文🙂",
			selection: { start: 2, end: 4 },
		});
		session.destroy();
	});

	test("reports committed and cancelled compositions exactly once", () => {
		const { host, events } = createHost();
		const session = createNativeTextInputSession({
			windowHandle: 1,
			route: 102n,
			nativeHost: host,
			toPhysicalRect: (rect) => ({ ...rect }),
		});
		const seen: string[] = [];
		session.onCompositionStart(() => seen.push("start"));
		session.onCompositionUpdate(({ text, cursorUtf16 }) => seen.push(`update:${text}:${cursorUtf16}`));
		session.onCompositionCancel(() => seen.push("cancel"));
		session.onCompositionEnd(({ reason }) => seen.push(`end:${reason}`));
		session.onCommit(({ text }) => seen.push(`commit:${text}`));
		session.begin({ caretRect: { x: 0, y: 0, width: 1, height: 10 }, surroundingText: "", selection: { start: 0, end: 0 } });

			events.push(
			{ route: 102n, timestamp: 1n, kind: 1, code: 0, cursor: 0, text: "" },
			{ route: 102n, timestamp: 2n, kind: 2, code: 0, cursor: 1, text: "n" },
			{ route: 102n, timestamp: 3n, kind: 4, code: 0, cursor: 0, text: "你" },
			{ route: 102n, timestamp: 4n, kind: 3, code: 0, cursor: 0, text: "" },
			{ route: 102n, timestamp: 5n, kind: 1, code: 0, cursor: 0, text: "" },
			{ route: 102n, timestamp: 6n, kind: 2, code: 0, cursor: 2, text: "ni" },
			{ route: 102n, timestamp: 7n, kind: 3, code: 0, cursor: 0, text: "" },
			{ route: 102n, timestamp: 8n, kind: 1, code: 0, cursor: 0, text: "" },
			{ route: 102n, timestamp: 9n, kind: 4, code: 0, cursor: 0, text: "好" },
			{ route: 102n, timestamp: 10n, kind: 1, code: 0, cursor: 0, text: "" },
			{ route: 102n, timestamp: 11n, kind: 3, code: 0, cursor: 0, text: "" },
			{ route: 102n, timestamp: 12n, kind: 4, code: 0, cursor: 0, text: "x" },
		);
		expect(session.poll()).toBe(12);
		expect(seen).toEqual([
			"start", "update:n:1", "commit:你", "end:commit",
			"start", "update:ni:2", "cancel", "end:cancel",
			"start", "commit:好", "end:commit", "start", "cancel", "end:cancel", "commit:x",
		]);
		expect(session.state?.composing).toBe(false);
		session.destroy();
	});
});
