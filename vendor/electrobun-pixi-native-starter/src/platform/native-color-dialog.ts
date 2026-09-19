import { dlopen, ptr, type Pointer } from "bun:ffi";
import type { NativePlatformResult } from "./native-platform";

const available = process.platform === "win32" && ["x64", "arm64"].includes(process.arch);
const user = available ? dlopen("user32.dll", {
  GetAncestor: { args: ["ptr", "u32"], returns: "ptr" },
  IsWindow: { args: ["ptr"], returns: "i32" },
  GetWindowThreadProcessId: { args: ["ptr", "ptr"], returns: "u32" },
}) : null;
const dialogs = available ? dlopen("comdlg32.dll", {
  ChooseColorW: { args: ["ptr"], returns: "i32" },
  CommDlgExtendedError: { args: [], returns: "u32" },
}) : null;

/** An owned system dialog. Colors use 0xRRGGBB; cancellation never changes the caller's value. */
export function createNativeColorDialog(inputWindow: number) {
  if (!user || !dialogs) return null;
  const window = user.symbols.GetAncestor(inputWindow as Pointer, 2), owner = new Uint32Array(1);
  if (!window || !user.symbols.IsWindow(window)
    || !user.symbols.GetWindowThreadProcessId(window, ptr(owner)) || owner[0] !== process.pid) {
    throw new Error("Color dialog requires a live application-owned window");
  }
  const customColors = new Uint32Array(16).fill(0xffffff);
  let choosing = false;
  return async (color: number): Promise<NativePlatformResult<number>> => {
    if (!Number.isInteger(color) || color < 0 || color > 0xffffff) throw new TypeError("Color must be an RGB integer");
    if (choosing) return { ok: false, error: { code: "PLATFORM_ERROR", message: "Color dialog is already open" } };
    choosing = true;
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      if (!user.symbols.IsWindow(window)) throw new Error("Color dialog owner is closed");
      // CHOOSECOLORW on 64-bit Windows: independently verified using ctypes against the SDK declaration.
      // https://learn.microsoft.com/windows/win32/api/commdlg/ns-commdlg-choosecolorw
      const request = Buffer.alloc(72);
      request.writeUInt32LE(request.length, 0);
      request.writeBigUInt64LE(BigInt(window), 8);
      request.writeUInt32LE(((color & 255) << 16) | (color & 0xff00) | (color >>> 16), 24);
      request.writeBigUInt64LE(BigInt(ptr(customColors)), 32);
      request.writeUInt32LE(3, 40); // CC_RGBINIT | CC_FULLOPEN
      if (!dialogs.symbols.ChooseColorW(ptr(request))) {
        const code = dialogs.symbols.CommDlgExtendedError();
        return { ok: false, error: { code: code ? "PLATFORM_ERROR" : "CANCELLED",
          message: code ? `ChooseColorW failed (${code})` : "Color selection was cancelled" } };
      }
      const result = request.readUInt32LE(24);
      return { ok: true, value: ((result & 255) << 16) | (result & 0xff00) | ((result >>> 16) & 255) };
    } catch (error) {
      return { ok: false, error: { code: "PLATFORM_ERROR", message: error instanceof Error ? error.message : String(error) } };
    } finally { choosing = false; }
  };
}
