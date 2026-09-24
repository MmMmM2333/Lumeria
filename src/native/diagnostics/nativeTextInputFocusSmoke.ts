import assert from "node:assert/strict";
import { dlopen } from "bun:ffi";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { getNativePixiApplicationTesting } from "../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";

/** Replays native blur before Bun delivers its notification, using only our HWND. */
export async function runNativeTextInputFocusSmoke(options: {
  app: NativePixiApplication;
  searchBar: NativeSearchBar;
  present(description: string): Promise<void>;
  waitFor(description: string, predicate: () => boolean): Promise<void>;
}): Promise<void> {
  const { app, searchBar, present, waitFor } = options;
  const { inputWindow } = getNativePixiApplicationTesting(app).handles();
  const user32 = dlopen("user32.dll", {
    SendMessageW: { args: ["ptr", "u32", "u64", "i64"], returns: "i64" },
  });
  try {
    for (let cycle = 0; cycle < 20; cycle++) {
      searchBar.focusForTyping();
      assert.equal(app.textInput.active, true);
      // No await between the native notification and the animation's caret sync:
      // the native session has stopped while JS still owns the focused editor.
      user32.symbols.SendMessageW(inputWindow, 0x0008, 0n, 0n);
      assert.equal(app.textInput.active, true);
      searchBar.host.syncFocused();
      assert.equal(app.textInput.active, false);
      assert.equal(searchBar.input.focused, false);
      searchBar.host.syncFocused();
      assert.equal(app.textInput.active, false, "late animation must not restart input");
      await present("text input native blur processed");
      user32.symbols.SendMessageW(inputWindow, 0x0007, 0n, 0n);
      await waitFor("text input focus restored", () => app.textInput.active && searchBar.input.focused);
      user32.symbols.SendMessageW(inputWindow, 0x0102, BigInt("q".charCodeAt(0)), 0n);
      await waitFor("text input accepts character after blur", () => searchBar.input.value === "q");
      searchBar.setQuery("");
      await present("text input focus recovery frame");
      assert.equal(app.state, "running");
    }
    console.log("Native text focus: 20 blur/caret races, no background restart, refocus and WM_CHAR input passed");
  } finally { user32.close(); }
}
