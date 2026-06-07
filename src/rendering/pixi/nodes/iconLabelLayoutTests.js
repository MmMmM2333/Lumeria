import {
  estimateLabelWidth,
  fitSingleLineName,
  fitWrappedName,
  plainName,
  splitLabelLine,
  truncateNameToWidth,
} from "./iconLabelLayout.js";

export function runIconLabelLayoutTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon label layout test failed] ${message}`);
  };

  assert(plainName("  App   Name  ") === "App Name", "plainName should normalize whitespace");
  assert(estimateLabelWidth("A", 10) > estimateLabelWidth("i", 10), "wide Latin glyphs should estimate wider than narrow glyphs");
  assert(estimateLabelWidth("\u5e94", 10) === 10, "CJK glyphs should estimate as one font-size wide");

  const truncated = truncateNameToWidth("LongApplicationName", 10, 48);
  assert(truncated.endsWith("..."), "truncateNameToWidth should add an ellipsis when overflowing");
  assert(estimateLabelWidth(truncated, 10) <= 48 || truncated.length === 4, "truncated text should fit the target width");

  const [firstLine, secondLine] = splitLabelLine("Alpha Beta Gamma", 10, 42);
  assert(firstLine === "Alpha" && secondLine === "Beta Gamma", "splitLabelLine should prefer a soft break");

  const single = fitSingleLineName("  Alpha   Beta Gamma  ", 10, 64);
  assert(!single.includes("\n"), "fitSingleLineName should stay single-line");
  assert(single.endsWith("..."), "fitSingleLineName should normalize and truncate");

  const wrapped = fitWrappedName("Alpha Beta Gamma Delta", 10, 42);
  assert(wrapped.split("\n").length === 2, "fitWrappedName should produce up to two lines");
  assert(wrapped.startsWith("Alpha\n"), "fitWrappedName should preserve the first fitted soft break");
}
