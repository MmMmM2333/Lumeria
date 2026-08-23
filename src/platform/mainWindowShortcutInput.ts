import {
  normalizeMainWindowShortcutKey,
} from "../domain/mainWindowShortcut.js";

const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

export type ShortcutKeyboardEvent = Readonly<{
  key?: unknown;
  code?: unknown;
  ctrlKey?: unknown;
  altKey?: unknown;
  shiftKey?: unknown;
  metaKey?: unknown;
}>;

export type MainWindowShortcutInputResult =
  | Readonly<{ status: "cancel" }>
  | Readonly<{ status: "invalid"; reason: "missingMainKey" | "missingModifier" | "unsupportedKey" }>
  | Readonly<{ status: "valid"; shortcut: string }>;

export function mainWindowShortcutFromKeyboardEvent(
  event: ShortcutKeyboardEvent | null | undefined,
): MainWindowShortcutInputResult {
  const key = String(event?.key || "");
  const code = String(event?.code || "");
  if ((key === "Escape" || code === "Escape") && !event?.ctrlKey && !event?.altKey && !event?.shiftKey && !event?.metaKey) {
    return { status: "cancel" };
  }
  if (!code || MODIFIER_CODES.has(code)) {
    return { status: "invalid", reason: "missingMainKey" };
  }

  const modifiers: string[] = [];
  if (event?.ctrlKey) modifiers.push("control");
  if (event?.altKey) modifiers.push("alt");
  if (event?.shiftKey) modifiers.push("shift");
  if (event?.metaKey) modifiers.push("super");
  if (!modifiers.length) {
    return { status: "invalid", reason: "missingModifier" };
  }

  const mainKey = normalizeMainWindowShortcutKey(code) || normalizeMainWindowShortcutKey(key);
  if (!mainKey) return { status: "invalid", reason: "unsupportedKey" };
  return { status: "valid", shortcut: [...modifiers, mainKey].join("+") };
}
