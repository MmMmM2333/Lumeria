# Bun 1.4.2 runtime pin

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
