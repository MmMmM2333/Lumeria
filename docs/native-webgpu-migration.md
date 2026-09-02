---
type: context
status: active
scope: native-webgpu-migration
updated: 2026-09-02
read_when: "继续 LaunchPad 的 Electrobun/PixiJS 原生迁移时"
next_entry: "用现有域模型接入真实 layout/catalog 数据，生成第一个非固定数据的 CompleteDesktopSceneFrame"
---

# Native WebGPU migration

Branch: `feature/electrobun-native-migration`  
Worktree: `<local-workspace>/LaunchPad-native-webgpu`

## Confirmed direction

- Target Electrobun plus native WebGPU; Deno is out of scope.
- Keep the existing domain and `CompleteDesktopSceneFrame` boundary.
- Keep Vue/WebView until the native path reaches feature parity; do not introduce a second domain-state owner.
- Consume the fixed Starter release from `vendor/electrobun-pixi-native-starter`; LaunchPad must not import a sibling repository, `.hutch`, or Starter private compatibility modules.

## Completed native slice

- Starter release commit `3062d76` is vendored with manifest schema v2, complete file hashes, native ABI 3 and capability mask validation.
- Electrobun `2.0.1`, PixiJS `8.20.1`, Pretext `0.0.8`, native DLLs, patched devkit and consumer runner are fixed by the release contract.
- `tsconfig.electrobun.json` extends the vendored consumer config; Electrobun build/copy/patch operations use only public consumer files.
- `src/native/electrobunSmoke.ts` uses public `createNativePixiApplication()`, `app.animate()`, `invalidate()` and `nextPresent()`.
- Starter owns window creation, WebGPU/Pixi initialization, input, present, resize/DPI, minimize/restore, surface/device recovery and reverse-order cleanup.
- LaunchPad owns only its scene-frame projection, `NativeDesktopScene`, native icon loading, motion updates and LaunchPad-specific pixel proof.
- `NativeDesktopScene` no longer creates a second presentation loop. Its existing `motionRuntime` is advanced by Starter's application scheduler.
- The obsolete sibling imports, manual devkit/hash selection, manual WebGPU renderer/context lifecycle, local Pixi patcher and duplicate production canvas adapter are removed.

## Verified behavior

The real native smoke proves:

- all three reconciled scene nodes are visible;
- a local PNG travels through the native texture path;
- color Emoji and labels contain real GPU pixels;
- the empty lower viewport remains clean;
- resize updates logical and backing sizes;
- cross-DPI movement updates resolution when mixed-DPI displays exist;
- minimize suspends and restore resumes rendering;
- public `nextPresent()` observes successful native surface submissions;
- the worker and launcher close cleanly.

Verification commands:

```powershell
npm test
npm run typecheck
npm run check:policy
npm run native:smoke
npm run native:build
```

## Remaining migration boundary

The current native entry still uses a fixed three-item smoke frame. Production startup requires one authoritative data path:

1. Load the persisted v2 layout from the existing roaming data root.
2. Scan the current Windows app catalog and extracted icon cache.
3. Reuse the existing normalization, reconciliation and validation functions.
4. Produce the existing `CompleteDesktopSceneFrame`; do not add a native-only scene model.
5. Synchronize all visible icon textures, commit once, then await a public present.

The existing Rust layout/catalog/icon/launcher implementation should be exposed through a host-neutral sidecar or native service rather than rewritten in TypeScript. Editing, launching, search, folders and full WinUI-style controls follow as complete behavior slices after real startup data.

## Guardrails

- Do not restore imports containing `webgpu test` or `LAUNCHPAD_ELECTROBUN_DEVKIT_ROOT`.
- Do not call Starter files other than its documented public native host and consumer integration entries.
- Do not restore a LaunchPad-owned window/WebGPU/present/recovery loop.
- Do not keep both Vue and native presentation as writable owners of the same runtime state.
- `vendor/` is third-party release payload: LaunchPad source policy skips it, while Starter manifest/hash validation and consumer typecheck remain authoritative.

## Next complete slice

Use the existing domain model to load real layout/catalog data and render the first non-fixture native desktop frame. This is the next and only continuation entry.
