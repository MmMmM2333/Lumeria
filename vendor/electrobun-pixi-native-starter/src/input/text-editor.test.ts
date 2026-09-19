import { describe, expect, test } from "bun:test";
import { TextEditor } from "./text-editor";

describe("TextEditor editing", () => {
	const fixedMeasure = (text: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length * 10;
	test("keeps UTF-16 selections on grapheme boundaries while inserting and deleting", () => {
		const editor = new TextEditor({ value: "A🙂B" });
		editor.setSelection(2, 2);
		expect(editor.state.focus).toBe(1);

		editor.dispatch({ type: "move-horizontal", direction: 1 });
		expect(editor.state.focus).toBe(3);
		editor.dispatch({ type: "backspace" });
		expect(editor.state.value).toBe("AB");
		expect(editor.state.focus).toBe(1);

		editor.dispatch({ type: "insert", text: "中" });
		expect(editor.state).toMatchObject({ value: "A中B", anchor: 2, focus: 2 });

		editor.dispatch({ type: "backspace" });
		editor.dispatch({ type: "undo" });
		expect(editor.state).toMatchObject({ value: "A中B", anchor: 2, focus: 2 });
		editor.dispatch({ type: "delete" });
		editor.dispatch({ type: "undo" });
		expect(editor.state).toMatchObject({ value: "A中B", anchor: 2, focus: 2 });
	});

	test("normalizes single-line input and enforces maxLength without splitting graphemes", () => {
		const editor = new TextEditor({ maxLength: 4 });
		editor.dispatch({ type: "insert", text: "🙂🙂🙂\r\n" });
		expect(editor.state.value).toBe("🙂🙂");

		editor.selectAll();
		editor.dispatch({ type: "insert", text: "a\r\nb\nc" });
		expect(editor.state.value).toBe("a b ");
	});

	test("keeps composition virtual until commit and restores the replaced selection on cancel", () => {
		const editor = new TextEditor({ value: "abcd" });
		editor.setSelection(1, 3);
		editor.startComposition();
		editor.updateComposition("中🙂", 1);
		expect(editor.state.value).toBe("abcd");
		expect(editor.view).toMatchObject({
			text: "a中🙂d",
			selection: { anchor: 2, focus: 2 },
			caret: 2,
			composition: { start: 1, end: 4, caret: 2 },
		});

		editor.cancelComposition();
		expect(editor.state).toMatchObject({ value: "abcd", anchor: 1, focus: 3 });
		editor.startComposition();
		editor.updateComposition("中🙂");
		editor.commitComposition();
		expect(editor.state).toMatchObject({ value: "a中🙂d", anchor: 4, focus: 4 });
		expect(editor.view.composition).toBeUndefined();
	});

	test("navigates and selects words through Intl.Segmenter boundaries", () => {
		const editor = new TextEditor({ value: "one two" });
		editor.setSelection(0);
		editor.dispatch({ type: "move-horizontal", direction: 1, word: true });
		expect(editor.state.focus).toBe(4);
		editor.dispatch({ type: "move-horizontal", direction: 1, word: true, extend: true });
		expect(editor.view.selection).toEqual({ anchor: 4, focus: 7, start: 4, end: 7 });
		expect(editor.wordRangeAt(5)).toEqual({ start: 4, end: 7 });
	});

	test("deletes whole words with Ctrl+Backspace and Ctrl+Delete semantics", () => {
		const editor = new TextEditor({ value: "one two" });
		editor.dispatch({ type: "backspace", word: true });
		expect(editor.state.value).toBe("one ");
		editor.dispatch({ type: "undo" });
		editor.setSelection(0);
		editor.dispatch({ type: "delete", word: true });
		expect(editor.state.value).toBe("two");
	});

	test("undoes merged typing and keeps paste and IME commits as transactions", () => {
		const editor = new TextEditor();
		editor.dispatch({ type: "insert", text: "a" });
		editor.dispatch({ type: "insert", text: "b" });
		editor.dispatch({ type: "undo" });
		expect(editor.state.value).toBe("");
		editor.dispatch({ type: "redo" });
		expect(editor.state.value).toBe("ab");

		editor.dispatch({ type: "insert", text: "x", history: "paste" });
		editor.dispatch({ type: "undo" });
		expect(editor.state.value).toBe("ab");

		editor.startComposition();
		editor.updateComposition("中");
		editor.commitComposition();
		editor.dispatch({ type: "undo" });
		expect(editor.state.value).toBe("ab");
	});

	test("keeps a typed hard break as its own undo transaction", () => {
		const editor = new TextEditor({ multiline: true });
		editor.dispatch({ type: "insert", text: "a" });
		editor.dispatch({ type: "insert", text: "\n" });
		editor.dispatch({ type: "insert", text: "b" });

		editor.dispatch({ type: "undo" });
		expect(editor.state.value).toBe("a\n");
		editor.dispatch({ type: "undo" });
		expect(editor.state.value).toBe("a");
		editor.dispatch({ type: "undo" });
		expect(editor.state.value).toBe("");
	});

	test("lays out wrapped and hard-broken lines and maps offsets, points, and selections", () => {
		const editor = new TextEditor({ value: "ab\ncde", multiline: true });
		const layout = editor.layout({ width: 20, lineHeight: 12, measureText: fixedMeasure });
		expect(layout.lines).toEqual([
			{ start: 0, end: 2, text: "ab", width: 20, y: 0, height: 12, hardBreak: true },
			{ start: 3, end: 5, text: "cd", width: 20, y: 12, height: 12, hardBreak: false },
			{ start: 5, end: 6, text: "e", width: 10, y: 24, height: 12, hardBreak: false },
		]);
		expect(layout.offsetToCaret(4)).toMatchObject({ x: 10, y: 12, lineIndex: 1 });
		expect(layout.pointToOffset(16, 12)).toEqual({ offset: 5, affinity: "upstream" });
		expect(layout.rangeToRects(1, 5)).toEqual([
			{ x: 10, y: 0, width: 20, height: 12 },
			{ x: 0, y: 12, width: 20, height: 12 },
		]);
	});

	test("gives a selected hard break a visible rectangle", () => {
		const editor = new TextEditor({ value: "a\nb", multiline: true });
		const layout = editor.layout({ width: 100, lineHeight: 12, measureText: fixedMeasure });
		expect(layout.rangeToRects(1, 2)).toEqual([
			{ x: 10, y: 0, width: 10, height: 12 },
		]);
	});

	test("keeps soft-wrap affinity and preferred horizontal position while moving vertically", () => {
		const editor = new TextEditor({ value: "abcde", multiline: true });
		const layout = editor.layout({ width: 20, lineHeight: 10, measureText: fixedMeasure });
		expect(layout.offsetToCaret(2, "upstream")).toMatchObject({ x: 20, y: 0, lineIndex: 0 });
		expect(layout.offsetToCaret(2, "downstream")).toMatchObject({ x: 0, y: 10, lineIndex: 1 });
		editor.setSelection(1);
		editor.dispatch({ type: "move-horizontal", direction: 1 }, layout);
		expect(editor.state).toMatchObject({ focus: 2, affinity: "upstream" });
		editor.dispatch({ type: "move-horizontal", direction: 1 }, layout);
		expect(editor.state).toMatchObject({ focus: 2, affinity: "downstream" });
		editor.dispatch({ type: "move-horizontal", direction: -1 }, layout);
		expect(editor.state).toMatchObject({ focus: 2, affinity: "upstream" });

		editor.setSelection(1);
		editor.dispatch({ type: "move-vertical", direction: 1 }, layout);
		expect(editor.state.focus).toBe(3);
		editor.dispatch({ type: "move-vertical", direction: 1 }, layout);
		expect(editor.state.focus).toBe(5);
		editor.setSelection(1);
		editor.dispatch({ type: "move-vertical", direction: 1, lines: 2 }, layout);
		expect(editor.state.focus).toBe(5);
		editor.dispatch({ type: "move-line-boundary", edge: "start" }, layout);
		expect(editor.state.focus).toBe(4);
	});

	test("keeps the caret visible and clamps one-dimensional scrolling", () => {
		const single = new TextEditor({ value: "abcdefghij" });
		const singleLayout = single.layout({ width: 30, lineHeight: 10, measureText: fixedMeasure });
		single.ensureCaretVisible(singleLayout, { width: 30, height: 10 });
		expect(single.state.scrollX).toBe(70);
		single.setSelection(0);
		single.ensureCaretVisible(singleLayout, { width: 30, height: 10 });
		expect(single.state.scrollX).toBe(0);

		const multi = new TextEditor({ value: "a\nb\nc\nd", multiline: true });
		const multiLayout = multi.layout({ width: 20, lineHeight: 10, measureText: fixedMeasure });
		multi.scrollBy(50, 50, multiLayout, { width: 20, height: 20 });
		expect(multi.state).toMatchObject({ scrollX: 0, scrollY: 20 });
	});
});
