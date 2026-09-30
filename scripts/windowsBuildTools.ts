import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { assertReleaseVersion } from "../src/platform/product.js";

export function runWindowsBuildTool(command: string, args: readonly string[], cwd = process.cwd()): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build tool failed: ${command} (${result.status})`);
}

export function windowsBuildTools(project = process.cwd()) {
  const source = join(project, "vendor/electrobun-launcher");
  const helper = join(project, "scripts/windowsExecutableBranding.rs");
  const hash = createHash("sha256");
  for (const file of readdirSync(source).filter(name => name.endsWith(".zig")).sort()) hash.update(file).update(readFileSync(join(source, file)));
  hash.update(readFileSync(helper));
  const cache = join(project, ".codex-dev/runtime-branding", hash.digest("hex").slice(0, 20));
  mkdirSync(cache, { recursive: true });
  const localZig = join(project, ".codex-dev/toolchains/zig-x86_64-windows-0.16.0/zig.exe");
  const zig = process.env.LUMERIA_ZIG ?? (existsSync(localZig) ? localZig : "zig");
  const png = readFileSync(join(project, "src/assets/branding/app-icons/light/256x256.png"));
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  const icon = join(cache, "app.ico");
  writeFileSync(icon, Buffer.concat([header, png]));
  return {
    icon,
    launcher(product: boolean): string {
      const output = join(cache, product ? "Lumeria.exe" : "launcher.exe");
      if (!existsSync(output)) {
        const probe = spawnSync(zig, ["version"], { encoding: "utf8", windowsHide: true });
        if (probe.error || probe.status !== 0 || probe.stdout.trim() !== "0.16.0") throw new Error("Install Zig 0.16.0 or set LUMERIA_ZIG to its executable");
        runWindowsBuildTool(zig, ["build-exe", product ? "product.zig" : "main.zig", "-O", "ReleaseSafe", "-target", "x86_64-windows-gnu", "-lc", "-ladvapi32", ...(product ? ["-luser32", "-lshell32"] : []),
          "--subsystem", "windows", "--cache-dir", join(cache, "zig-cache"), "--global-cache-dir", join(project, ".codex-dev/zig-global-cache"), "-femit-bin=" + output], source);
      }
      return output;
    },
    brand(executable: string, version: string): void {
      assertReleaseVersion(version);
      const editor = join(cache, "windowsExecutableBranding.exe");
      if (!existsSync(editor)) runWindowsBuildTool("rustc", ["--edition=2021", helper, "-C", "opt-level=2", "-o", editor]);
      runWindowsBuildTool(editor, [executable, icon, version]);
    },
  };
}

export function findNsis(): string {
  const local = process.env.LOCALAPPDATA;
  const candidates = [process.env.LUMERIA_NSIS,
    resolve(".codex-dev/toolchains/nsis-3.11/Bin/makensis.exe"),
    ...(local ? [join(local, "tauri/NSIS/Bin/makensis.exe"), join(local, "tauri/NSIS/makensis.exe")] : []),
    ...(process.env.PATH ?? "").split(delimiter).map(path => join(path, "makensis.exe")),
  ];
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["-VERSION"], { encoding: "utf8", windowsHide: true });
    if (probe.status === 0 && probe.stdout.trim() === "v3.11") return candidate;
  }
  throw new Error("NSIS 3.11 is required; set LUMERIA_NSIS to its makensis.exe (an existing Tauri cache is also supported)");
}
