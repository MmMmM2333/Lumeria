import { dlopen, ptr } from "bun:ffi";
import type { NativePlatformResult } from "./native-platform";

export type NativeSystemPreferences = Readonly<{
  appearance: "light" | "dark";
  reducedMotion: boolean;
  highContrast: boolean;
  windowColor: number;
  textColor: number;
  highlightColor: number;
  uiFontFamily: string | null;
}>;

const user32 = process.platform === "win32" ? dlopen("user32.dll", {
  SystemParametersInfoW: { args: ["u32", "u32", "ptr", "u32"], returns: "i32" },
  GetSysColor: { args: ["i32"], returns: "u32" },
}) : null;
const registry = process.platform === "win32" ? dlopen("advapi32.dll", {
  RegGetValueW: { args: ["i64", "ptr", "ptr", "u32", "ptr", "ptr", "ptr"], returns: "i32" },
}) : null;
const wide = (text: string) => Buffer.from(text + "\0", "utf16le");
const rgb = (color: number) => ((color & 255) << 16) | (color & 0xff00) | ((color >>> 16) & 255);

function readUiFontFamily():string|null {
  // Win32 NONCLIENTMETRICSW (Vista+), verified against independent ctypes structures:
  // sizeof=504; lfMessageFont offset=408; LOGFONTW sizeof=92, lfFaceName offset=28.
  // https://learn.microsoft.com/windows/win32/api/winuser/ns-winuser-nonclientmetricsw
  const metrics=Buffer.alloc(504);metrics.writeUInt32LE(metrics.length,0);
  if(!user32?.symbols.SystemParametersInfoW(0x29,metrics.length,ptr(metrics),0))return null;
  return metrics.subarray(436,500).toString("utf16le").split("\0",1)[0]!.trim()||null;
}

/** Read only. No registry or system preference is modified. */
export function readNativeSystemPreferences(): NativePlatformResult<NativeSystemPreferences> {
  if (!user32 || !registry) return { ok: false, error: { code: "UNAVAILABLE", message: "System preferences require Windows" } };
  try {
    const subkey = wide("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize");
    const name = wide("AppsUseLightTheme");
    const value = new Uint32Array(1), size = new Uint32Array([4]);
    const status = registry.symbols.RegGetValueW(-2147483647n, ptr(subkey), ptr(name), 0x10, null, ptr(value), ptr(size));
    if (status !== 0 && status !== 2) throw new Error(`Reading application theme failed (${status})`);
    // Windows defaults to the light application theme when the preference is absent.
    const appearance = status === 2 || value[0] !== 0 ? "light" : "dark";
    const animation = new Int32Array(1);
    if (!user32.symbols.SystemParametersInfoW(0x1042, 0, ptr(animation), 0)) throw new Error("Reading client-area animation preference failed");
    const contrast = new Uint8Array(16);
    new DataView(contrast.buffer).setUint32(0, 16, true);
    if (!user32.symbols.SystemParametersInfoW(0x42, 16, ptr(contrast), 0)) throw new Error("Reading high-contrast preference failed");
    return { ok: true, value: Object.freeze({
      appearance,
      uiFontFamily: readUiFontFamily(),
      reducedMotion: animation[0] === 0,
      highContrast: (new DataView(contrast.buffer).getUint32(4, true) & 1) !== 0,
      windowColor: rgb(user32.symbols.GetSysColor(5)),
      textColor: rgb(user32.symbols.GetSysColor(8)),
      highlightColor: rgb(user32.symbols.GetSysColor(13)),
    }) };
  } catch (error) {
    return { ok: false, error: { code: "PLATFORM_ERROR", message: error instanceof Error ? error.message : String(error) } };
  }
}

export function subscribeNativeSystemPreferences(listener: (result: NativePlatformResult<NativeSystemPreferences>) => void): () => void {
  let previous = "";
  const check = () => {
    const result = readNativeSystemPreferences(), serialized = JSON.stringify(result);
    if (serialized !== previous) { previous = serialized; listener(result); }
  };
  check();
  const timer = setInterval(check, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
