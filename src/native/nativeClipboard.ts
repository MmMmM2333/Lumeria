import { nativeHost } from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { NativeClipboardPort } from "../platform/clipboardPort.js";

export const nativeClipboard: NativeClipboardPort = {
  writeText: text => nativeHost.platform.clipboard.writeText(text),
  readText: async () => {
    const result = await nativeHost.platform.clipboard.readText();
    if (!result.ok) return result;
    if (result.value !== null && typeof result.value !== "string") throw new TypeError("Native clipboard text must be a string or null");
    return { ok: true, value: result.value };
  },
};
