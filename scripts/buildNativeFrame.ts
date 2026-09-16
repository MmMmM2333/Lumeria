import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Rebuild the locally patched native host and keep the vendor integrity receipt
// in sync. Close running consumers first: Windows cannot replace a loaded DLL.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(root, "vendor/electrobun-pixi-native-starter");
const temporary = mkdtempSync(join(tmpdir(), "lumeria-native-frame-"));
try {
  const output = join(temporary, "native-frame.dll");
  const result = spawnSync("rustc", ["--crate-type", "cdylib", "src/platform/native-frame.rs",
    "-C", "opt-level=3", "-C", "link-arg=/Brepro", "-o", output], { cwd: vendor, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Native host build failed (${result.status})`);
  const manifestPath = join(vendor, "starter-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    files: Array<{ path: string; role: string; size: number; sha256: string }>;
  };
  copyFileSync(output, join(vendor, ".hutch/native-frame/native-frame.dll"));
  for (const path of [".hutch/native-frame/native-frame.dll", "src/platform/native-frame.rs", "src/platform/native-frame-window-tests.rs"]) {
    const bytes = readFileSync(join(vendor, path));
    const entry = { path, role: path.endsWith(".dll") ? "native-frame-runtime" : "starter-source",
      size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    const index = manifest.files.findIndex(value => value.path === path);
    if (index < 0) {
      const sourceIndex = manifest.files.findIndex(value => value.path === "src/platform/native-frame.rs");
      manifest.files.splice(sourceIndex + 1, 0, entry);
    } else manifest.files[index] = entry;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("Native host rebuilt; vendor source and DLL hashes updated.");
} finally {
  if (dirname(resolve(temporary)).toLowerCase() !== resolve(tmpdir()).toLowerCase()) {
    throw new Error("Refusing to remove a native host build directory outside the temporary root");
  }
  rmSync(temporary, { recursive: true, force: true });
}
