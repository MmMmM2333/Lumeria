import { expect, test } from "bun:test";
import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { installNativeSkia, registerNativeFont, registerNativeFontData } from "./native-skia";
import { TextEditor } from "../input/text-editor";

const glyphFingerprint = (fontFamilies: readonly string[], text: string) => {
	const canvas = createCanvas(96, 64);
	const context = canvas.getContext("2d");
	context.font = `40px ${fontFamilies.map((family) => `"${family}"`).join(", ")}`;
	context.textBaseline = "top";
	context.fillText(text, 4, 4);
	return createHash("sha256").update(context.getImageData(0, 0, 96, 64).data).digest("hex");
};

const installedFamily = (script: string, names: readonly string[]) => {
	const family = names.find((name) => GlobalFonts.has(name));
	if (!family) throw new Error(`No installed ${script} font found; install one of: ${names.join(", ")}`);
	return family;
};

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

test("native Skia resolves an explicit system font list per glyph", () => {
	installNativeSkia();
	const latin = installedFamily("Latin UI", ["Segoe UI"]);
	const chinese = installedFamily("Chinese", ["Microsoft YaHei UI", "Microsoft YaHei", "SimSun"]);
	const japanese = installedFamily("Japanese", ["Yu Gothic UI", "Yu Gothic", "Meiryo UI", "Meiryo"]);
	const korean = installedFamily("Korean", ["Malgun Gothic"]);
	const emoji = installedFamily("Emoji", ["Segoe UI Emoji"]);
	const families = [latin, chinese, japanese, korean, emoji];
	const missing = glyphFingerprint(families, "\u{10ffff}");

	expect(glyphFingerprint(families, "A")).toBe(glyphFingerprint([latin], "A"));
	for (const glyph of ["汉", "あ", "한", "🙂"]) {
		expect(glyphFingerprint(families, glyph)).not.toBe(missing);
	}
});

test("native font registration accepts an absolute path and font bytes", () => {
	const windowsDirectory = process.env.WINDIR;
	if (!windowsDirectory) throw new Error("WINDIR is required by this Windows-only Starter test");
	const path = join(windowsDirectory, "Fonts", "segoeui.ttf");
	const pathAlias = `Starter Path Font ${process.pid}`;
	const dataAlias = `Starter Data Font ${process.pid}`;
	const keys = [
		registerNativeFont(path, pathAlias),
		registerNativeFontData(readFileSync(path), dataAlias),
	];
	try {
		expect(GlobalFonts.has(pathAlias)).toBe(true);
		expect(GlobalFonts.has(dataAlias)).toBe(true);
		expect(glyphFingerprint([pathAlias], "A")).not.toBe(glyphFingerprint([pathAlias], "\u{10ffff}"));
		expect(glyphFingerprint([dataAlias], "A")).not.toBe(glyphFingerprint([dataAlias], "\u{10ffff}"));
	} finally {
		GlobalFonts.removeBatch(keys);
	}
});
