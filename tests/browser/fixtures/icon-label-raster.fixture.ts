const assert = {
  ok(value: unknown, message = "assertion failed") { if (!value) throw new Error(message); },
  equal(actual: unknown, expected: unknown, message = "values differ") { if (actual !== expected) throw new Error(message); },
  deepEqual(actual: unknown, expected: unknown, message = "raster/metrics differ") {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
  },
};
import { CanvasTextGenerator, CanvasTextMetrics, Text, TextStyle } from "pixi.js";
import { getIconLabelRenderState } from "../../../src/rendering/pixi/nodes/iconLabelLayout.js";
import { resolveLabelRasterWidth } from "../../../src/rendering/pixi/nodes/iconLabelRaster.js";

export function runLabelRasterTests(): void {
  const raster = (text: string, style: TextStyle, resolution: number) => {
    const generated = CanvasTextGenerator.getCanvasAndContext({ text, style, resolution });
    try {
      const width = generated.frame.width, height = generated.frame.height;
      return { width, height, pixels: Array.from(generated.canvasAndContext.context.getImageData(0, 0, width, height).data) };
    } finally { CanvasTextGenerator.returnCanvasAndContext(generated.canvasAndContext); }
  };
  for (const fontFamily of ["Arial", "Microsoft YaHei UI", "monospace"]) {
    for (const name of ["应用 01", "iiii WWWW", "Adobe After Effects 很长的应用名称", "日本語 Ελληνικά العربية", "😀 emoji folder", "a-long/path_with spaces"]) {
      for (const singleLineLabel of [false, true]) {
        const label = new Text({ text: "", style: { fontFamily, fill: "white", align: "center" } });
        try {
          for (const width of [78, 79, 80, 100, 130, 200, 130, 90, 64, 78]) {
            const next = getIconLabelRenderState({ cellWidth: width, itemName: name, iconSize: 36, compact: true, singleLineLabel });
            const rasterWidth = resolveLabelRasterWidth(label, next);
            const style = new TextStyle({ fontFamily, fill: "white", align: "center", fontSize: next.fontSize,
              lineHeight: next.lineHeight, wordWrap: next.wordWrap, wordWrapWidth: next.wordWrapWidth });
            const expected = CanvasTextMetrics.measureText(next.text, style);
            const expectedPixels = width === 100 || width === 130 ? raster(next.text, style, 2) : null;
            style.wordWrapWidth = rasterWidth;
            const actual = CanvasTextMetrics.measureText(next.text, style);
            assert.deepEqual(actual.lines, expected.lines, `line breaks must match at ${width}: ${name}`);
            assert.equal(actual.width, expected.width);
            assert.equal(actual.height, expected.height);
            if (expectedPixels) assert.deepEqual(raster(next.text, style, 2), expectedPixels,
              `raster pixels must match at ${width}: ${fontFamily}/${name}`);
            label.text = next.text;
            label.style = style;
          }
        } finally { label.destroy(); }
      }
    }
  }
  const initial = getIconLabelRenderState({ cellWidth: 100, itemName: "应用", compact: true });
  const label = new Text({ text: initial.text, style: { fontFamily: "Arial", fontSize: initial.fontSize,
    lineHeight: initial.lineHeight, wordWrap: initial.wordWrap, wordWrapWidth: initial.wordWrapWidth } });
  try {
    const wider = { ...initial, wordWrapWidth: initial.wordWrapWidth + 1 };
    assert.equal(resolveLabelRasterWidth(label, wider), initial.wordWrapWidth, "short unchanged lines preserve their raster width");
    assert.equal(resolveLabelRasterWidth(label, { ...wider, text: "changed" }), wider.wordWrapWidth);
    assert.equal(resolveLabelRasterWidth(label, { ...wider, fontSize: 20 }), wider.wordWrapWidth);
    assert.equal(resolveLabelRasterWidth(label, { ...wider, wordWrapWidth: 1 }), 1);
    label.style.fontFamily = "monospace";
    label.resolution = 2.5;
    const metrics = CanvasTextMetrics.measureText(label.text, label.style, undefined, false);
    assert.ok(Number.isFinite(metrics.width), "changed font is measured using its current style");
    const requested = label.style.clone(); requested.wordWrapWidth = wider.wordWrapWidth;
    const reused = label.style.clone(); reused.wordWrapWidth = resolveLabelRasterWidth(label, wider);
    assert.deepEqual(raster(label.text, reused, 2.5), raster(label.text, requested, 2.5),
      "font and DPI changes must preserve reference pixels");
    label.style.tagStyles = { strong: { fontSize: 30 } };
    assert.equal(resolveLabelRasterWidth(label, wider), wider.wordWrapWidth,
      "tagged text keeps Pixi's requested wrap width");
  } finally { label.destroy(); }
}
