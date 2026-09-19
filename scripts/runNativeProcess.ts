import { execFile, spawn, type SpawnOptions } from "node:child_process";

/** Keep JS responsive to Ctrl+C and terminate only this command's process tree. */
export function runNativeProcess(command: string, args: string[], options: SpawnOptions, signal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    // On Windows keep the child group alive until our handler kills the complete tree;
    // otherwise Ctrl+C may kill the wrapper first and orphan Hutch/launcher children.
    const child = spawn(command, args, { ...options, ...(process.platform === "win32" ? { detached: true, windowsHide: true } : {}) });
    let stopping = false;
    const stop = () => {
      if(stopping || !child.pid || child.exitCode !== null) return;
      stopping = true;
      if(process.platform === "win32") {
        execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {windowsHide:true}, error => {
          if(error && child.exitCode === null) reject(error);
        });
      } else child.kill("SIGTERM");
    };
    const cleanup = () => {
      process.off("SIGINT",stop);process.off("SIGTERM",stop);signal?.removeEventListener("abort",stop);
    };
    process.on("SIGINT",stop);process.on("SIGTERM",stop);signal?.addEventListener("abort",stop,{once:true});
    child.once("error",error=>{cleanup();reject(error);});
    child.once("close",code=>{cleanup();resolve(stopping?130:code??1);});
    if(signal?.aborted)stop();
  });
}
