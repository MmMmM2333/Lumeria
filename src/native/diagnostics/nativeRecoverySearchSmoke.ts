import assert from "node:assert/strict";
import { dlopen } from "bun:ffi";
import { getNativePixiApplicationTesting } from "../../../vendor/electrobun-pixi-native-starter/src/runtime/native-app-testing.js";
import type { NativeLaunchSearchSmokeContext } from "./nativeLaunchSearchSmoke.test.js";

/** Real HWND power messages exercise the host queue, recovery and product focus together. */
export async function runNativeRecoverySearchSmoke(context: NativeLaunchSearchSmokeContext): Promise<void> {
  const { app, searchBar, present, waitFor, showLaunchpad } = context;
  const testing = getNativePixiApplicationTesting(app);
  const user32 = dlopen("user32.dll", {
    SendMessageW: { args: ["ptr", "u32", "u64", "i64"], returns: "i64" },
  });
  const power = (kind: number) => user32.symbols.SendMessageW(testing.handles().inputWindow, 0x0218, BigInt(kind), 0n);
  try {
    for (const hidden of [false, true]) {
      searchBar.setQuery("Word");
      await present("search before recovery");
      if (hidden) {
        app.window.hide();
        await waitFor("hidden recovery releases native text focus", () => !app.textInput.active);
      } else app.textInput.updateComposition("recovery");
      const before = testing.diagnostics().runtime.recoveryCount;
      power(4); power(18); power(7);
      await waitFor("wake pair rebuilds resources", () => testing.diagnostics().runtime.recoveryCount > before && app.state === "running");
      // A delayed user-presence notification still belongs to the same wake.
      power(7);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(testing.diagnostics().runtime.recoveryCount, before + 1, "one wake must perform one rebuild");
      showLaunchpad();
      await waitFor("type-to-search restored without clicking editor", () => app.textInput.active && searchBar.input.focused);
      searchBar.setQuery("");
      app.nativeInput.emitText("w");
      assert.equal(context.searchQuery(), "w");
      app.nativeInput.emitKey("down", {keyCode: 8}); app.nativeInput.emitKey("up", {keyCode: 8});
      assert.equal(context.searchQuery(), "");
      app.textInput.updateComposition("Word");
      assert.equal(context.searchQuery(), "Word");
      app.textInput.commit("Word");
      await present("search results after recovery");
      assert.ok(context.activePageItems().length > 0);
      await context.capture(hidden ? "recovery-search-hidden" : "recovery-search-visible");
      assert.equal(app.state, "running");
    }
    searchBar.setQuery("");
    await present("recovery search reset");
    console.log("Recovery search: visible composition, hidden wake, duplicate wake pair, first character, backspace and commit passed");
  } finally { user32.close(); }
}
