# Lumeria Windows launchers

The original adapter is based on Electrobun v2.0.1, commit
`8d09d15db791f346e419efd452d6759750addb62`, `package/src/launcher/`.
See LICENSE for the upstream license.

## Product entry

`product.zig` is the project-owned Windows entry, shipped as **Lumeria.exe**.
It checks the product manifest, starts `runtime/bin/LumeriaRuntime.exe`, forwards
startup arguments and the full Windows exit code, and waits for the runtime.
It has no extraction, update, bootstrap-install or uninstall implementation.
Normal starts also prestart the Rust data service via `data_service.zig`, using
an owner-restricted local named pipe and a kill-on-close Job. Control requests
do not create a data service. The pipe keeps the existing JSON protocol; this
avoids a measured multi-second CreateProcess stall when Bun is the parent.
The NSIS installer owns those installation responsibilities.

The application uses a per-data-directory authenticated session for activation
and guarded shutdown. The launcher passes the login origin, its PID and the
validated product root to the runtime. Normal starts are rejected while an
installer transaction is open; `--lumeria-status` and `--lumeria-shutdown` remain
available to the installer. Native library logs use the user log directory as
the working directory; scripts and DLLs are located by absolute runtime paths.

`ELECTROBUN_LAUNCHER_PID` is still supplied for the internal SDK's lifecycle.
It is not an installation identity and can be removed when that runtime is
replaced. `LUMERIA_LAUNCHER_PID` belongs to the product control protocol.

## Electrobun build/development adapter

`main.zig` remains the adapter for Electrobun's intermediate bundle and native
development commands. Its Bun filename is `Lumeria.exe` instead of `bun.exe`.
This adapter retains the upstream directory assumptions for those build tools.
It is deliberately **excluded from the final product directory**, together with
the upstream uninstall manager, by `scripts/stageWindowsRelease.ts`.

Retain it while Electrobun is the build/development host; remove this adapter
when the replacement host supplies those workflows. The remaining upstream
runtime contents are kept together to preserve GPU/resource/bytecode behavior.

## Build and verify

Both entries use Zig **0.16.0**. `scripts/windowsBuildTools.ts` builds and caches
them by source hash and applies icons/version resources to fresh output copies.
Set `LUMERIA_ZIG`, put that version on PATH, or place it at
`.codex-dev/toolchains/zig-x86_64-windows-0.16.0/zig.exe`.

The shared `windows_spawn.zig` follows Windows CRT quoting rules for quotes,
empty arguments and trailing backslashes. Verify changes with:

- `zig build test` in this directory, for shared/upstream unit tests.
- `npm run test:native-launcher`, for the real product entry and process boundary.
- `npm run native:release` and `npm run test:native-product`.
- `npm run native:smoke`, for the retained development adapter.

When updating upstream sources, preserve `product.zig` and the shared argument
quoting implementation. Test the development, ESM, bytecode, restart and installer
flows. Do not patch executable string offsets or edit the shared Bun toolchain.

See `docs/windows-release.md` for packaging, platform boundaries and validation
commands.
