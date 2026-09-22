import { dlopen, JSCallback } from "bun:ffi";
import { join } from "node:path";
import { nativeFrameHost } from "../../vendor/electrobun-pixi-native-starter/src/platform/native-frame-host.js";
import type { HotCornerBackend } from "./nativeHotCorners.js";

// Keep the library and callback resident: queued threadsafe notifications may
// arrive after stop has joined the worker. Generation checks reject those events.
let library: ReturnType<typeof openLibrary> | null = null;
let callback: JSCallback | null = null;
let handler: Parameters<HotCornerBackend["start"]>[6] | null = null;
function openLibrary() {
  return dlopen(join(import.meta.dir, "lumeria_hot_corners.dll"), {
    lumeria_hot_corners_start: { args: ["u32", "u32", "u32", "u32", "u32", "u32", "ptr"], returns: "i32" },
    lumeria_hot_corners_stop: { args: [], returns: "void" },
    lumeria_hot_corners_consume: { args: ["u32", "u32"], returns: "i32" },
    lumeria_hot_corners_topology_callback: { args: [], returns: "ptr" },
  });
}
export const nativeHotCorners: HotCornerBackend = {
  start(mask, delay, modifier, pause, seams, generation, onTrigger) {
    library ??= openLibrary();
    library.symbols.lumeria_hot_corners_stop();
    handler = onTrigger;
    callback ??= new JSCallback((generation: number, x: number, y: number, corner: number, displayId: number, topology: number) => {
      if (library?.symbols.lumeria_hot_corners_consume(generation, topology)) handler?.(generation, x, y, corner, displayId, topology);
    }, { args: ["u32", "i32", "i32", "u32", "f64", "u32"], returns: "void", threadsafe: true });
    const topologyCallback = library.symbols.lumeria_hot_corners_topology_callback();
    nativeFrameHost.setDisplayChangeCallback(topologyCallback === null ? null : Number(topologyCallback));
    const status = library.symbols.lumeria_hot_corners_start(mask, delay, modifier, Number(pause), Number(seams), generation, callback.ptr);
    if (status !== 0) {
      handler = null;
      nativeFrameHost.setDisplayChangeCallback(null);
      throw new Error(`Hot corner detector failed (${status})`);
    }
  },
  stop() {
    handler = null;
    if (!library) return;
    nativeFrameHost.setDisplayChangeCallback(null);
    library.symbols.lumeria_hot_corners_stop();
  },
};
