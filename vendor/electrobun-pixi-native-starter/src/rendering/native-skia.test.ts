import { expect, test } from "bun:test";
import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import { installNativeSkia } from "./native-skia";
import { TextEditor } from "../input/text-editor";

test("native Skia supplies Pretext measurement and pre-wrap layout", () => {
	installNativeSkia();

	const text = "中文\n🙂e\u0301";
	const wide = layoutWithLines(
		prepareWithSegments(text, "20px Arial", { whiteSpace: "pre-wrap" }),
		10_000,
		24,
	);
	expect(wide.lines.map(({ text }) => text)).toEqual(["中文", "🙂e\u0301"]);
	expect(wide.lines.every(({ width }) => Number.isFinite(width) && width > 0)).toBe(true);

	const wrapped = layoutWithLines(
		prepareWithSegments("中文🙂e\u0301", "20px Arial", { whiteSpace: "pre-wrap" }),
		1,
		24,
	);
	expect(wrapped.lineCount).toBeGreaterThan(1);
	expect(wrapped.lines.map(({ text }) => text).join("")).toBe("中文🙂e\u0301");
	expect(wrapped.lines).toContainEqual(expect.objectContaining({ text: "e\u0301" }));
});

test("Pretext layout gives a trailing newline its own caret line", () => {
	installNativeSkia();
	const editor = new TextEditor({ value: "a", multiline: true });
	editor.setSelection(1);
	editor.dispatch({ type: "insert", text: "\n" });

	const layout = editor.layout({
		width: 200,
		lineHeight: 24,
		font: "20px Arial",
		measureText: (text) => text.length * 10,
	});
	expect(editor.state).toMatchObject({ value: "a\n", focus: 2 });
	expect(layout.offsetToCaret(2)).toMatchObject({ x: 0, y: 24, lineIndex: 1 });
});
