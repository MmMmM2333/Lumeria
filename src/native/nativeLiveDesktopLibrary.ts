import { CString, dlopen, ptr } from "bun:ffi";
import { join } from "node:path";

// Keep the DLL resident until process exit: an abandoned Windows capture worker
// must never execute code from an unloaded library. stop still releases sessions.
let library: ReturnType<typeof openLibrary> | null = null;
function openLibrary() {
  return dlopen(join(import.meta.dir,"lumeria_live_desktop.dll"), {
    lumeria_live_desktop_request: {args:["ptr","usize"],returns:"ptr"},
    lumeria_live_desktop_free: {args:["ptr"],returns:"void"},
  });
}
export function requestNativeLiveDesktop(request: unknown): unknown {
  library ??= openLibrary();
  const bytes=new TextEncoder().encode(JSON.stringify(request));
  const response=library.symbols.lumeria_live_desktop_request(ptr(bytes),bytes.byteLength);
  if(!response)throw new Error("Live Desktop returned no response");
  try {
    const result:unknown=JSON.parse(new CString(response).toString());
    if(!result||typeof result!=="object"||!("ok" in result))throw new Error("Invalid Live Desktop response");
    if(result.ok!==true)throw new Error("error" in result?String(result.error):"Live Desktop request failed");
    if(!("value" in result))throw new Error("Live Desktop response has no value");
    return result.value;
  } finally { library.symbols.lumeria_live_desktop_free(response); }
}
