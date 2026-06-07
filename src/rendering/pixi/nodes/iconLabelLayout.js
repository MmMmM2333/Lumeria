import { reloadOnPixiHotUpdate } from "../devHmr.js";

export function plainName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function estimateLabelWidth(text, fontSize) {
  return Array.from(String(text || "")).reduce((width, char) => {
    if (/\s/.test(char)) return width + fontSize * 0.34;
    if (/[\u4e00-\u9fff]/.test(char)) return width + fontSize;
    if (/[ilI.,'`|!]/.test(char)) return width + fontSize * 0.36;
    if (/[MW@#%&]/.test(char)) return width + fontSize * 0.82;
    return width + fontSize * 0.58;
  }, 0);
}

export function truncateNameToWidth(text, fontSize, maxWidth) {
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

export function splitLabelLine(text, fontSize, maxWidth) {
  const value = String(text || "");
  if (estimateLabelWidth(value, fontSize) <= maxWidth) return [value, ""];

  const chars = Array.from(value);
  let breakAt = 0;
  let lastSoftBreak = -1;
  for (let index = 0; index < chars.length; index += 1) {
    const candidate = chars.slice(0, index + 1).join("");
    if (estimateLabelWidth(candidate, fontSize) > maxWidth) break;
    breakAt = index + 1;
    if (/[\s\-_/()]/.test(chars[index])) lastSoftBreak = index + 1;
  }

  const splitAt = lastSoftBreak > 1 ? lastSoftBreak : Math.max(1, breakAt);
  return [
    chars.slice(0, splitAt).join("").trimEnd(),
    chars.slice(splitAt).join("").trimStart(),
  ];
}

export function fitSingleLineName(value, fontSize, maxWidth) {
  return truncateNameToWidth(plainName(value), fontSize, maxWidth);
}

export function fitWrappedName(value, fontSize, maxWidth) {
  let rest = plainName(value);
  const lines = [];
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

reloadOnPixiHotUpdate(import.meta.hot);
