export const DEFAULT_MAIN_WINDOW_SHORTCUT = "alt+Space";
export const NO_MAIN_WINDOW_SHORTCUT = null;

const MODIFIER_ALIASES = new Map([
  ["alt", "alt"],
  ["option", "alt"],
  ["control", "control"],
  ["ctrl", "control"],
  ["cmd", "super"],
  ["command", "super"],
  ["meta", "super"],
  ["super", "super"],
  ["win", "super"],
  ["windows", "super"],
  ["shift", "shift"],
]);

const MODIFIER_ORDER = ["control", "alt", "shift", "super"];
const MODIFIER_LABELS = {
  alt: "Alt",
  control: "Ctrl",
  shift: "Shift",
  super: "Win",
};

const KEY_LABELS = {
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Equal: "=",
  Minus: "-",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  Space: "Space",
  Escape: "Esc",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  NumpadAdd: "Num +",
  NumpadDecimal: "Num .",
  NumpadDivide: "Num /",
  NumpadEnter: "Num Enter",
  NumpadEqual: "Num =",
  NumpadMultiply: "Num *",
  NumpadSubtract: "Num -",
};

const SPECIAL_KEY_ALIASES = new Map([
  ["`", "Backquote"],
  ["backquote", "Backquote"],
  ["\\", "Backslash"],
  ["backslash", "Backslash"],
  ["[", "BracketLeft"],
  ["bracketleft", "BracketLeft"],
  ["]", "BracketRight"],
  ["bracketright", "BracketRight"],
  [",", "Comma"],
  ["comma", "Comma"],
  ["=", "Equal"],
  ["equal", "Equal"],
  ["-", "Minus"],
  ["minus", "Minus"],
  [".", "Period"],
  ["period", "Period"],
  ["'", "Quote"],
  ["quote", "Quote"],
  [";", "Semicolon"],
  ["semicolon", "Semicolon"],
  ["/", "Slash"],
  ["slash", "Slash"],
  ["backspace", "Backspace"],
  ["capslock", "CapsLock"],
  ["enter", "Enter"],
  ["space", "Space"],
  ["tab", "Tab"],
  ["delete", "Delete"],
  ["end", "End"],
  ["home", "Home"],
  ["insert", "Insert"],
  ["pagedown", "PageDown"],
  ["pageup", "PageUp"],
  ["printscreen", "PrintScreen"],
  ["scrolllock", "ScrollLock"],
  ["arrowdown", "ArrowDown"],
  ["down", "ArrowDown"],
  ["arrowleft", "ArrowLeft"],
  ["left", "ArrowLeft"],
  ["arrowright", "ArrowRight"],
  ["right", "ArrowRight"],
  ["arrowup", "ArrowUp"],
  ["up", "ArrowUp"],
  ["numlock", "NumLock"],
  ["escape", "Escape"],
  ["esc", "Escape"],
]);

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

function normalizeKeyToken(token) {
  const value = String(token || "").trim();
  if (!value) return null;
  if (/^Key[A-Z]$/i.test(value)) return `Key${value.slice(3).toUpperCase()}`;
  if (/^[A-Z]$/i.test(value)) return `Key${value.toUpperCase()}`;
  if (/^Digit[0-9]$/i.test(value)) return `Digit${value.slice(5)}`;
  if (/^[0-9]$/.test(value)) return `Digit${value}`;
  if (/^Numpad[0-9]$/i.test(value)) return `Numpad${value.slice(6)}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(value)) return value.toUpperCase();

  const lower = value.toLowerCase();
  if (SPECIAL_KEY_ALIASES.has(lower)) return SPECIAL_KEY_ALIASES.get(lower);
  if (/^Numpad(Add|Decimal|Divide|Enter|Equal|Multiply|Subtract)$/i.test(value)) {
    return `Numpad${value.slice(6, 7).toUpperCase()}${value.slice(7)}`;
  }
  return null;
}

export function normalizeMainWindowShortcut(shortcut) {
  if (shortcut === null) return NO_MAIN_WINDOW_SHORTCUT;
  const tokens = String(shortcut || "")
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return DEFAULT_MAIN_WINDOW_SHORTCUT;

  const modifiers = new Set();
  let key = null;
  for (const token of tokens) {
    const modifier = MODIFIER_ALIASES.get(token.toLowerCase());
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }
    const normalizedKey = normalizeKeyToken(token);
    if (!normalizedKey || key) return DEFAULT_MAIN_WINDOW_SHORTCUT;
    key = normalizedKey;
  }

  if (!key || modifiers.size === 0) return DEFAULT_MAIN_WINDOW_SHORTCUT;
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join("+");
}

export function formatMainWindowShortcut(shortcut) {
  if (shortcut === null) return null;
  return normalizeMainWindowShortcut(shortcut)
    .split("+")
    .map((token) => {
      if (MODIFIER_LABELS[token]) return MODIFIER_LABELS[token];
      if (/^Key[A-Z]$/.test(token)) return token.slice(3);
      if (/^Digit[0-9]$/.test(token)) return token.slice(5);
      if (/^Numpad[0-9]$/.test(token)) return `Num ${token.slice(6)}`;
      return KEY_LABELS[token] || token;
    })
    .join(" + ");
}

export function mainWindowShortcutFromKeyboardEvent(event) {
  const key = String(event?.key || "");
  const code = String(event?.code || "");
  if ((key === "Escape" || code === "Escape") && !event?.ctrlKey && !event?.altKey && !event?.shiftKey && !event?.metaKey) {
    return { status: "cancel" };
  }
  if (!code || MODIFIER_CODES.has(code)) {
    return { status: "invalid", reason: "missingMainKey" };
  }

  const modifiers = [];
  if (event?.ctrlKey) modifiers.push("control");
  if (event?.altKey) modifiers.push("alt");
  if (event?.shiftKey) modifiers.push("shift");
  if (event?.metaKey) modifiers.push("super");
  if (!modifiers.length) {
    return { status: "invalid", reason: "missingModifier" };
  }

  const mainKey = normalizeKeyToken(code) || normalizeKeyToken(key);
  if (!mainKey) return { status: "invalid", reason: "unsupportedKey" };
  return { status: "valid", shortcut: [...modifiers, mainKey].join("+") };
}
