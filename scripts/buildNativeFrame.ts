import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Native output receipts are local; building never rewrites the vendored release manifest.
const tool = fileURLToPath(new URL("../vendor/electrobun-pixi-native-starter/tools/native-toolchain.mjs", import.meta.url));
const result = spawnSync(process.execPath, [tool, "frame"], { stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
