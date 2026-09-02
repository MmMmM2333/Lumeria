import { describe, expect, mock, test } from "bun:test";
import type { NativeTextEvent, TextInputRect } from "../platform/native-frame-host";

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
