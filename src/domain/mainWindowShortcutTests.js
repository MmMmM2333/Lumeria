import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  formatMainWindowShortcut,
  mainWindowShortcutFromKeyboardEvent,
  normalizeMainWindowShortcut,
  NO_MAIN_WINDOW_SHORTCUT,
} from "./mainWindowShortcut.js";

export function runMainWindowShortcutTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Main window shortcut test failed] ${message}`);
  };

  assert(normalizeMainWindowShortcut("") === DEFAULT_MAIN_WINDOW_SHORTCUT, "empty shortcuts should fall back to the default");
  assert(normalizeMainWindowShortcut(null) === NO_MAIN_WINDOW_SHORTCUT, "null shortcuts should disable the shortcut");
  assert(normalizeMainWindowShortcut("Alt + Space") === "alt+Space", "alt space should normalize aliases and whitespace");
  assert(normalizeMainWindowShortcut("Ctrl+Shift+L") === "control+shift+KeyL", "letter shortcuts should normalize to keyboard codes");
  assert(normalizeMainWindowShortcut("Meta+1") === "super+Digit1", "meta digit shortcuts should normalize to super digit");
  assert(normalizeMainWindowShortcut("Space") === DEFAULT_MAIN_WINDOW_SHORTCUT, "single-key shortcuts should fall back to the default");
  assert(formatMainWindowShortcut("control+shift+KeyL") === "Ctrl + Shift + L", "letters should format without the Key prefix");
  assert(formatMainWindowShortcut("alt+Space") === "Alt + Space", "space should format as a readable key");
  assert(formatMainWindowShortcut(null) === null, "null shortcuts should remain a locale-neutral disabled value");

  const valid = mainWindowShortcutFromKeyboardEvent({
    key: "l",
    code: "KeyL",
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
  });
  assert(valid.status === "valid" && valid.shortcut === "control+alt+KeyL", "keyboard events should convert to shortcuts");

  const cancel = mainWindowShortcutFromKeyboardEvent({
    key: "Escape",
    code: "Escape",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });
  assert(cancel.status === "cancel", "plain escape should cancel recording");

  const invalidModifier = mainWindowShortcutFromKeyboardEvent({
    key: "Alt",
    code: "AltLeft",
    altKey: true,
  });
  assert(invalidModifier.reason === "missingMainKey", "modifier-only shortcuts should expose a stable reason code");
  assert(invalidModifier.status === "invalid", "pure modifier keys should be rejected");

  const invalidSingleKey = mainWindowShortcutFromKeyboardEvent({
    key: "l",
    code: "KeyL",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });
  assert(invalidSingleKey.reason === "missingModifier", "single-key shortcuts should expose a stable reason code");
  assert(invalidSingleKey.status === "invalid", "single main keys should be rejected");
}
