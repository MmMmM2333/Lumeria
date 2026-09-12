# Optional native bytecode build

Starter 0.3.4 provides an opt-in Windows x64/Bun1.4.2 build. Normal `build`, `start`
and `dev` retain Electrobun's default ESM output. No `--compile` is required.

Add a project-owned hook such as `scripts/native-post-build.ts`:

```ts
import { buildNativeBytecode } from "../vendor/electrobun-pixi-native-starter/consumer/bytecode-postbuild.mjs";
buildNativeBytecode({ entrypoint: "src/native/nativeMain.ts", tsconfig: "tsconfig.electrobun.json" });
```

Set `scripts.postBuild` in `electrobun.config.ts` to that file, then run:

```text
node vendor/electrobun-pixi-native-starter/consumer/run-electrobun.mjs build-bytecode
```

The hook runs after the main process/assets are built and before Electrobun creates
its stable runtime archive. It uses the actual bundled Bun, generates into a temporary
directory, rejects missing outputs and source-path leakage, and copies matching JS,
JSC and native assets together. `bytecode-manifest.json` records file sizes/hashes.
The command fails if the hook was not installed. Failed builds must not be distributed.

The entrypoint and bundled dependencies must not use top-level await; move asynchronous
startup into an async function and preserve error propagation/cleanup. CJS module
location aliases preserve runtime resource paths. `import.meta.env` is undefined,
matching the current native ESM runtime; this hook does not implement browser/Vite
environment injection. This mode uses default, unminified Bun bundling. Pass an explicit
`define` record to `buildNativeBytecode` when the consumer needs compile-time feature
flags; use the same record in the normal Electrobun build. The native `import.meta`
location aliases remain reserved and take precedence. Custom bundler aliases/plugins
still require an explicit integration rather than silent reuse.
The payload must stay flat: do not use the launcher's source-rewriting ASAR path.

Bytecode is tied to Bun1.4.2 and increases package size. Rebuild when the runtime changes.
This does not imply reduced GPU memory or a universally faster startup. To verify the
actual cache hit, use `BUN_JSC_verboseDiskCache=1` in a separate audit run; disable it
for performance measurements.

Upstream validation: `npm run test:bytecode`, normal `npm run release:smoke`, then
`STARTER_BYTECODE_SMOKE=1 npm run release:smoke` (set the environment using the shell's
syntax). The bytecode smoke builds the independent consumer, extracts the stable archive,
checks hashes/runtime version, runs its native lifecycle and requires a Worker cache hit.
