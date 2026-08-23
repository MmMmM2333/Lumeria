import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getIconLabelLocalY } from "../geometry/iconMetrics.js";
import { getIconCellContentMaxWidth } from "./iconInteractionGeometry.js";

export interface IconLabelRenderOptions {
  cellWidth?: number;
  compact?: boolean;
  iconSize?: number;
  itemName?: unknown;
  singleLineLabel?: boolean;
  textless?: boolean;
}

export type HiddenIconLabelRenderState = Readonly<{
  visible: false;
}>;

export type VisibleIconLabelRenderState = Readonly<{
  anchorX: number;
  anchorY: number;
  fontSize: number;
  lineHeight: number;
  text: string;
  visible: true;
  wordWrap: boolean;
  wordWrapWidth: number;
  x: number;
  y: number;
}>;

export type IconLabelRenderState = HiddenIconLabelRenderState | VisibleIconLabelRenderState;

export function plainName(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function estimateLabelWidth(text: unknown, fontSize: number): number {
  return Array.from(String(text || "")).reduce((width, char) => {
    if (/\s/.test(char)) return width + fontSize * 0.34;
    if (/[\u4e00-\u9fff]/.test(char)) return width + fontSize;
    if (/[ilI.,'`|!]/.test(char)) return width + fontSize * 0.36;
    if (/[MW@#%&]/.test(char)) return width + fontSize * 0.82;
    return width + fontSize * 0.58;
  }, 0);
}

export function truncateNameToWidth(text: unknown, fontSize: number, maxWidth: number): string {
  const value = String(text || "");
  if (!value || estimateLabelWidth(value, fontSize) <= maxWidth) return value;
  const ellipsis = "...";
  let result = "";
  for (const char of Array.from(value)) {
    const next = `${result}${char}`;
    if (estimateLabelWidth(`${next}${ellipsis}`, fontSize) > maxWidth) break;
    result = next;
  }
  return `${result.trimEnd() || Array.from(value)[0] || ""}${ellipsis}`;
}

export function splitLabelLine(text: unknown, fontSize: number, maxWidth: number): [string, string] {
  const value = String(text || "");
  if (estimateLabelWidth(value, fontSize) <= maxWidth) return [value, ""];

  const chars = Array.from(value);
  let breakAt = 0;
  let lastSoftBreak = -1;
  for (let index = 0; index < chars.length; index += 1) {
    const candidate = chars.slice(0, index + 1).join("");
    if (estimateLabelWidth(candidate, fontSize) > maxWidth) break;
    breakAt = index + 1;
    if (/[\s\-_/()]/.test(chars[index]!)) lastSoftBreak = index + 1;
  }

  const splitAt = lastSoftBreak > 1 ? lastSoftBreak : Math.max(1, breakAt);
  return [
    chars.slice(0, splitAt).join("").trimEnd(),
    chars.slice(splitAt).join("").trimStart(),
  ];
}

export function fitSingleLineName(value: unknown, fontSize: number, maxWidth: number): string {
  return truncateNameToWidth(plainName(value), fontSize, maxWidth);
}

export function fitWrappedName(value: unknown, fontSize: number, maxWidth: number): string {
  let rest = plainName(value);
  const lines: string[] = [];
  while (rest && lines.length < 2) {
    if (lines.length === 1) {
      lines.push(truncateNameToWidth(rest, fontSize, maxWidth));
      break;
    }
    const [line, next] = splitLabelLine(rest, fontSize, maxWidth);
    lines.push(line);
    rest = next;
  }
  return lines.join("\n");
}

export function getIconLabelRenderState(
  options: IconLabelRenderOptions & { textless: true },
): HiddenIconLabelRenderState;
export function getIconLabelRenderState(
  options?: IconLabelRenderOptions & { textless?: false },
): VisibleIconLabelRenderState;
export function getIconLabelRenderState(options?: IconLabelRenderOptions): IconLabelRenderState;
export function getIconLabelRenderState(options: IconLabelRenderOptions = {}): IconLabelRenderState {
  const {
    cellWidth = 0,
    compact = false,
    iconSize = 64,
    itemName = null,
    singleLineLabel = false,
    textless = false,
  } = options;
  if (textless) return { visible: false };

  const fontSize = compact ? 12 : 13;
  const singleLine = Boolean(singleLineLabel);
  const availableContentWidth = getIconCellContentMaxWidth(cellWidth);
  const unconstrainedWrapWidth = Math.max(72, Math.min(160, cellWidth * 0.84));
  const wrapWidth = availableContentWidth == null
    ? unconstrainedWrapWidth
    : Math.min(unconstrainedWrapWidth, availableContentWidth);
  const unconstrainedSingleLineWidth = Math.max(56, cellWidth * 0.9);
  const singleLineWidth = availableContentWidth == null
    ? unconstrainedSingleLineWidth
    : Math.min(unconstrainedSingleLineWidth, availableContentWidth);
  return {
    anchorX: 0.5,
    anchorY: 0,
    fontSize,
    lineHeight: Math.round(fontSize * 1.22),
    text: singleLine
      ? fitSingleLineName(itemName, fontSize, singleLineWidth)
      : fitWrappedName(itemName, fontSize, wrapWidth),
    visible: true,
    wordWrap: !singleLine,
    wordWrapWidth: wrapWidth,
    x: 0,
    y: getIconLabelLocalY(iconSize, textless),
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
