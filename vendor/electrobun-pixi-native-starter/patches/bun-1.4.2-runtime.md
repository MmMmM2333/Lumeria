# Bun 1.4.2 runtime pin

Lumeria consumer note: the active devkit is now locked by `native-toolchain.lock.json`.
Use the root `native:prepare` command to obtain/verify it. Only the explicit upstream
rebuild workflow runs `patch-electrobun.mjs --sdk-only` to migrate a freshly built
1.4.0 SDK to 1.4.2. The standalone Starter release generator and consumer installer
have been retired; the historical notes below describe the original import.

Starter 0.3.3 pins Bun 1.4.2 in `package.json` under `electrobunPixiStarter.bunVersion`.
`npm run prepare:electrobun` migrates the supported patched Electrobun 2.0.1 devkit's
`toolchains.bun.defaultVersion` and `api/shared/bun-version.ts` from 1.4.0 together.
Unknown or inconsistent versions fail instead of being overwritten. Consumer prepare
only verifies the released pin; it never changes vendored files.

Hutch resolves/downloads the exact managed toolchain and packages that Bun executable.
Updating a global Bun or editing application build options does not select this runtime.
The native ABI and Electrobun/Pixi versions remain unchanged. No bytecode or standalone
compilation is enabled by this upgrade. Existing 1.4.0 type declarations remain compatible;
they are not used to choose the runtime.

Release generation verifies both declarations; the external consumer smoke checks the
actual stable package's `bin/bun.exe --version` in addition to normal build and lifecycle
tests. `npm run test:bun-pin` tests the migration, idempotency and drift rejection.
