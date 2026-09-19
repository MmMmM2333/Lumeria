import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Keep the patched devkit's toolchain selector and SDK declaration consistent. */
export function verifyBunRuntimePin(devkit, version, { apply = false } = {}) {
  if (version !== "1.4.2") throw new Error("This Starter requires Bun 1.4.2");
  const manifestPath = join(devkit, "native-devkit.json");
  const sdkPath = join(devkit, "api", "shared", "bun-version.ts");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const sdk = readFileSync(sdkPath, "utf8");
  const match = sdk.match(/export const BUN_VERSION = "([^"]+)";/);
  const selected = manifest.toolchains?.bun?.defaultVersion;
  if (manifest.product?.version !== "2.0.1" || !match) throw new Error("Unexpected Bun devkit contract");
  if (selected === version && match[1] === version) return;
  // Only migrate the supported stock devkit; never silently rewrite an unknown pin.
  if (!apply || selected !== "1.4.0" || match[1] !== "1.4.0") {
    throw new Error(`Bun runtime pin mismatch: devkit=${selected}, SDK=${match[1]}, expected=${version}`);
  }
  manifest.toolchains.bun.defaultVersion = version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");
  writeFileSync(sdkPath, sdk.replace(match[0], `export const BUN_VERSION = "${version}";`));
}
