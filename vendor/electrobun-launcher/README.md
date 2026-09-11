# Lumeria Windows launcher

Source: Electrobun v2.0.1, commit `8d09d15db791f346e419efd452d6759750addb62`,
`package/src/launcher/`. See LICENSE for the upstream license.

The only launcher behavior change is the Windows Bun executable name:
`bun.exe` becomes `Lumeria.exe`. Extraction, environment setup, process
supervision and uninstall behavior remain upstream implementations.

Build with Zig 0.16.0. `scripts/nativeRuntimeBranding.ts` builds this launcher
and stages it after bytecode generation. Set `LUMERIA_ZIG` to a Zig 0.16.0
executable, install that version on PATH, or place it at
`.codex-dev/toolchains/zig-x86_64-windows-0.16.0/zig.exe`.

Official Windows compiler archive:
https://ziglang.org/download/0.16.0/zig-x86_64-windows-0.16.0.zip

SHA-256: `68659eb5f1e4eb1437a722f1dd889c5a322c9954607f5edcf337bc3684a75a7e`.
Zig and Rust are build-time tools only; installed applications do not need them.
Compiled launchers and the Windows resource editor are cached by source hash
under `.codex-dev/runtime-branding/` and are not committed.

The post-build hook runs bytecode generation before renaming Bun. It stages
`Lumeria.exe`, replaces the launcher's filename selection, and writes matching
product information and icons using Windows resource APIs. It never changes
the shared Bun installation or devkit. `Resources/build.json` still identifies
the runtime as Bun so SDK initialization and bytecode validation remain intact.

The launcher remains `launcher.exe`, preserving existing restart, autostart and
installer entry points. The native data service remains a separate process.
The Windows runtime image name is `Lumeria.exe`; changing a parent process or
window title is not used to simulate that name.

Regression checks:
- `npm run check`
- `zig build test` in this directory (upstream launcher tests)
- `npm run native:build` and `npm run native:build:bytecode`
- Extract a generated update archive into an isolated directory and run
  `scripts/runNativeElectrobun.ts --smoke --folder-rename --settings-only --runtime=<bundle>`.
- Verify that the payload has `Lumeria.exe` and no `bun.exe`, the version
  resource identifies Lumeria, and tray restart preserves data and exits cleanly.

When upgrading Electrobun, update these sources from the matching release,
reapply the one-line runtime-name change and verify dev, packaged, bytecode,
restart and uninstall behavior. Do not patch binary string offsets.
