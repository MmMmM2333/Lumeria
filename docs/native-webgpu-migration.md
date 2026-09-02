---
type: context
status: active
scope: native-webgpu-migration
updated: 2026-09-02
read_when: "继续 LaunchPad 的 Electrobun/PixiJS 原生迁移时"
next_entry: "等待 Starter 公共字体注册 API 后接入中文字体；随后迁移文件夹打开/关闭切片"
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
- `src/native/nativeMain.ts` uses public `createNativePixiApplication()`, `app.animate()`, `invalidate()` and `nextPresent()`.
- Starter owns window creation, WebGPU/Pixi initialization, input, present, resize/DPI, minimize/restore, surface/device recovery and reverse-order cleanup.
- LaunchPad owns only its scene-frame projection, `NativeDesktopScene`, native icon loading, motion updates and LaunchPad-specific pixel proof.
- `NativeDesktopScene` no longer creates a second presentation loop. Its existing `motionRuntime` is advanced by Starter's application scheduler.
- The obsolete sibling imports, manual devkit/hash selection, manual WebGPU renderer/context lifecycle, local Pixi patcher and duplicate production canvas adapter are removed.

## Real data startup slice

- `lumeria_native_data.exe` is built from the existing Rust crate and exposes protocol v1 over newline-delimited JSON. The implemented operations are `hello`, `loadLayout`, `scanApps` and `launchApp`.
- The sidecar reuses `layout_store::load_layout_from_path` and `catalog::scan_apps_from_roots`; layout validation, Windows catalog enumeration, shortcut resolution and icon caching are not duplicated in TypeScript.
- The Electrobun client validates every request/response envelope and existing layout/catalog contracts. Requests are serial because the Rust host is serial.
- Startup loads `%APPDATA%\com.lumeria.app\layout.json` by default. `LUMERIA_NATIVE_DATA_DIR` exists only as an absolute-path isolation seam for tests.
- `nativeStartup.ts` reuses `normalizeNativeApp`, `createLaunchpadLayoutHelpers` and `reconcileDocument` to produce the existing `CompleteDesktopSceneFrame`. There is no native-only layout model or second state owner.
- Pointer tap and Enter/Space activation send only the stable app id to Rust. Rust resolves it from the scanned catalog, persisted manual app, or persisted scan roots and returns structured launch failures.
- PageUp/PageDown, Left/Right and wheel paging update the same authoritative scene frame. Resize, DPI changes and restore always recommit the current page rather than the startup snapshot.
- The sidecar release executable is built before native dev/smoke/build and copied beside the Electrobun Bun entrypoint.

## Verified behavior

The isolated real-data native smoke proves:

- the persisted v2 layout is loaded through Rust;
- one `.url` catalog item is scanned through Rust and appended by existing reconciliation rules;
- all three first-page scene nodes are visible and the second page can be entered and left;
- the layout PNG and extracted catalog icon travel through the native texture path;
- color Emoji and labels contain real GPU pixels;
- the empty lower viewport remains clean;
- adaptive resize exposes the live logical size before rebuilding the backing texture, then settles to the exact DPI-scaled backing size;
- cross-DPI movement updates resolution when mixed-DPI displays exist;
- minimize suspends and restore resumes rendering;
- public `nextPresent()` observes successful native surface submissions;
- an unknown app id returns the expected structured `missingLaunchInfo` failure through the Rust host;
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

Production data now reaches an interactive native Pixi frame through one authoritative path. Application icons support pointer/keyboard activation, launch through Rust, and show explicit success/failure status. The current native slice cannot mutate layout state, so there is no dirty state to save before launch; the existing launch-critical save rule must be connected when native editing is introduced.

Font registration is waiting on the Starter's public API. Folder overlays, editing, search and WinUI-style settings controls remain later slices.

## Guardrails

- Do not restore imports containing `webgpu test` or `LAUNCHPAD_ELECTROBUN_DEVKIT_ROOT`.
- Do not call Starter files other than its documented public native host and consumer integration entries.
- Do not restore a LaunchPad-owned window/WebGPU/present/recovery loop.
- Do not keep both Vue and native presentation as writable owners of the same runtime state.
- `vendor/` is third-party release payload: LaunchPad source policy skips it, while Starter manifest/hash validation and consumer typecheck remain authoritative.

## Starter/native foundation feedback

No new production Starter ABI capability blocked this slice. Bun child-process stdio, pointer/keyboard/wheel input, adaptive resize/DPI, recovery and cleanup were sufficient. Public key/wheel injection would improve automated input tests but is not required by the application runtime.

## Next complete slice

Consume the public font registration API for Chinese labels, then migrate folder open/close as the next complete behavior slice.
