import { nativeRuntimePaths } from "./runtimePaths.js";
import { requestNativeSession, waitForNativeExit } from "./nativeSession.js";

try {
  const command = process.argv[2];
  if (process.argv.length !== 3 || (command !== "--lumeria-shutdown" && command !== "--lumeria-status")) {
    throw new Error("Expected --lumeria-shutdown or --lumeria-status");
  }
  const paths = nativeRuntimePaths();
  const status = await requestNativeSession(paths, command === "--lumeria-shutdown" ? "shutdown" : "status");
  if (command === "--lumeria-shutdown" && status) await waitForNativeExit(status);
  console.log(JSON.stringify({ running: status !== null, ...status }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
