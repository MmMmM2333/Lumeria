---
type: context
status: active
scope: native-webgpu-migration
updated: 2026-09-05
read_when: "继续 LaunchPad 的 Electrobun/PixiJS 原生迁移时"
next_entry: "下一完整切片是文件夹中断行为：先对照原版开关/跨文件夹交接并核对 Starter 的呈现后回调能力，再确定迁移方案"
---

# Native WebGPU migration

Branch: `feature/electrobun-native-migration`  
Worktree: `<local-workspace>/LaunchPad-native-webgpu`

## Confirmed direction

- Current task (2026-09-05): user authorized steps 2, 3 and 4: independently upgrade/verify/commit Starter 0.2.0, then restore shared original focus/keyboard semantics and synchronous wheel/page-track integration, removing replaced paths. Baseline commit: `714385a`; upgrade commit: `3211cd1`. Touch, folder interruption, search and settings remain outside this task.

- Target Electrobun plus native WebGPU; Deno is out of scope.
- Keep the existing domain and `CompleteDesktopSceneFrame` boundary.
- Keep Vue/WebView until the native path reaches feature parity; do not introduce a second domain-state owner.
- Consume the fixed Starter release from `vendor/electrobun-pixi-native-starter`; LaunchPad must not import a sibling repository, `.hutch`, or Starter private compatibility modules.

## Completed native slice

- Starter `0.2.0`, release commit `b3e6536`, is vendored with manifest schema v2, complete file hashes, native ABI 4, capability-mask validation, and stable path-/memory-backed font registration exports.
- Electrobun `2.0.1`, PixiJS `8.20.1`, Pretext `0.0.8`, native DLLs, patched devkit and consumer runner are fixed by the release contract.
- `tsconfig.electrobun.json` extends the vendored consumer config; Electrobun build/copy/patch operations use only public consumer files.
- `src/native/nativeMain.ts` uses public `createNativePixiApplication()`, `app.animate()`, `invalidate()` and `nextPresent()`.
- Starter owns window creation, WebGPU/Pixi initialization, input, present, resize/DPI, minimize/restore, surface/device recovery and reverse-order cleanup.
- LaunchPad owns only its scene-frame projection, `NativeDesktopScene`, native icon loading, motion updates and LaunchPad-specific pixel proof.
- `NativeDesktopScene` no longer creates a second presentation loop. Its existing `motionRuntime` is advanced by Starter's application scheduler.
- LaunchPad uses an explicit Latin/CJK/Emoji family list for Pixi text; no restricted Windows font is bundled.
- The obsolete sibling imports, manual devkit/hash selection, manual WebGPU renderer/context lifecycle, local Pixi patcher and duplicate production canvas adapter are removed.

## Real data startup slice

- `lumeria_native_data.exe` is built from the existing Rust crate and exposes protocol v1 over newline-delimited JSON. The implemented operations are `hello`, `loadLayout`, `scanApps` and `launchApp`.
- The sidecar reuses `layout_store::load_layout_from_path` and `catalog::scan_apps_from_roots`; layout validation, Windows catalog enumeration, shortcut resolution and icon caching are not duplicated in TypeScript.
- The Electrobun client validates every request/response envelope and existing layout/catalog contracts. Requests are serial because the Rust host is serial.
- Startup loads `%APPDATA%\com.lumeria.app\layout.json` by default. `LUMERIA_NATIVE_DATA_DIR` exists only as an absolute-path isolation seam for tests.
- `nativeStartup.ts` reuses `normalizeNativeApp`, `createLaunchpadLayoutHelpers` and `reconcileDocument` to produce the existing `CompleteDesktopSceneFrame`. There is no native-only layout model or second state owner.
- Pointer tap and focused Enter activation send only the stable app id to Rust. Rust resolves it from the scanned catalog, persisted manual app, or persisted scan roots and returns structured launch failures. Enter without focus only establishes focus; Space does not activate.
- Ordinary arrows move icon focus; Ctrl+Left/Right turns pages and focuses the new page's first item. Wheel paging clears stale focus without manufacturing a new selection. Resize, DPI changes and restore always recommit the current page rather than the startup snapshot.
- Desktop page turns now keep the source/target Pixi pages alive and run through the existing page-track spring instead of snapping.
- The native texture repository retains every desktop/folder item in the layout for the scene lifetime, matching the original layout-wide retention rule. It no longer unloads textures solely because their page leaves the active/adjacent window while exit animation still references them.
- Native wheel input feeds the existing `createLaunchpadGestureEngine`, deadlines and desktop/folder `pageTrackScrub`, using Starter pixel-mode deltas. Accepted page commands synchronously update the authoritative frame without texture resynchronization or animation waits. New presentations cancel obsolete clear timers; keyboard navigation clears the previous wheel session and presentation. Native rendering retains the currently presented source page when another page turn redirects the animation.
- Native folders reuse `FolderOverlayLayer`, its page-track motion and the existing folder panel visual system. Pointer, Escape, keyboard and wheel input cover open, close, page turns and child launch.
- Folder state is native-owned presentation state only, with no focus field. Focus lives solely in `currentFrame.interaction.focusedIcon`; initial display and folder open/close clear it. Vue and native use the same pure helpers in `domain/iconFocus.ts`. Shared layout metrics remain above Vue/Pixi, without importing Vue into the native runtime.
- Normal close waits for both progress arrival and Pixi's closing-handoff completion. Opening interruption and cross-folder retargeting remain intentionally rejected until there is a per-present hook for exact presented-ghost capture.
- Folder children, opening ghosts and closing preview swaps use the scene's injected native texture repository. Folder thumbnail emoji request the same color-emoji font stack as full-size icons.
- The sidecar release executable is built before native dev/smoke/build and copied beside the Electrobun Bun entrypoint.

## Verified behavior

The isolated real-data native smoke proves:

- the persisted v2 layout is loaded through Rust;
- one `.url` catalog item is scanned through Rust and appended by existing reconciliation rules;
- all active first-page scene nodes are visible and all three desktop pages can be entered and left through an observed intermediate track position;
- a multi-page folder visibly opens, turns pages through an observed intermediate track position, launches a real child process through Rust, then visibly closes and completes its Pixi handoff;
- the layout PNG and extracted catalog icon travel through the native texture path;
- color Emoji and labels contain real GPU pixels;
- a Chinese application label produces real GPU foreground pixels through the ordered Skia fallback stack;
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
npm run native:build
npm run native:smoke
```

## 2026-09-05 baseline acceptance

- Scope: close out the existing desktop/folder/texture/animation slice and commit it, without upgrading to Starter 0.2.0 or expanding search/settings/editing.
- `npm run check`: complete project gate (patch, tests, app/tools/native types, policy, i18n and Web production build).
- `npm run native:smoke`: passed on the actual native GPU host with 3 desktop pages, 15 observed presents, folder open/page/child launch/close, CJK and Emoji foreground pixels, adaptive resize and minimize/restore. Final viewport/backing: 1044 × 641 at resolution 1.
- Mixed-DPI transition: explicitly skipped because no mixed-DPI display was available; hardware touchpad and rapid overlapping wheel/keyboard input are not covered by this sequential smoke.
- `npm run native:build`: stable native package build verified. Existing linker informational warning and Web bundle-size warning remain; neither failed the build.
- `.cottontail-tmp` contains generated Electrobun helpers, and is now excluded from Git and source-policy discovery, with a regression check. No temporary files were deleted.
- Smoke retains `artifacts/native-smoke/proof.json` and seven PNGs: desktop pages 1–3, folder pages 1–2, closed folder, and resized/restored desktop. These are GPU scene readbacks, not OS-window screenshots, and remain ignored build evidence. Run smoke after stable packaging when preserving these files: packaging recreates the artifacts directory.
- Visual inspection caught folder thumbnail emoji using the default font; the shared thumbnail creation path now uses the existing emoji stack, with a regression assertion. Final screenshots show the miniature emoji correctly.
- One earlier readback lacked the second folder-page title. Diagnostic state reported visible/in-bounds text, and subsequent captures including the final run without diagnostics show it normally. No title-specific fix or root cause is claimed; revisit with native frame diagnostics if reproduced.

## Current slice handoff

- Step 2 completed on 2026-09-05 in `3211cd1`: public release installer validated all 528 payload files and ABI 4/0x1fbf before and after installation. Patch checks, app/tools/native types, npm tests, stable native build and native GPU smoke passed. The 0.1.1 payload and temporary rollback copy were removed. No application behavior changes are included in that upgrade commit.
- Steps 3/4 implementation: domain focus helpers serve Vue and native; folder presentation no longer owns focus; desktop page commits are synchronous, and scene retention follows the actually presented source page during interruptions. Native smoke verifies first Enter, arrow navigation, two Ctrl page commands before any animation frame, keyboard folder activation/navigation/close, discrete wheel burst suppression/repeat/reversal, continuous scrub/cancel/progress/velocity/edge behavior, and pointer-opened folder wheel paging without default focus.
- Verification: `npm run check`, stable native build and final GPU/input smoke all passed; proof reports `inputNavigation: verified`, and screenshots show no initial desktop or pointer-opened folder selection. Stable packaging was followed by smoke to preserve artifacts. Keyboard cases call the same callback registered with native input; wheel cases inject FederatedWheelEvent into the application's Pixi stage handler. These tests do not claim physical keyboard/precision-touchpad or OS input-adapter acceptance.

- Changed anchors for steps 3/4: `domain/iconFocus.ts` and its registered tests; `useIconFocus.ts`; `nativeMain.ts` and its smoke runner; `nativeStartup.ts`; `NativeDesktopScene.ts`; `nativeFolderFlow.ts`; native scene tests.
- Removed/replaced paths: native sign-only wheel helper, Vue-local duplicate folder metric implementation, windowed native texture retention, and implicit Web texture repository use by native folder children/ghosts. Do not restore them.
- Removed in steps 3/4: Vue-local duplicate focus navigation, folder-generated focus, startup/page-generated first-item focus, plain-arrow/PageUp/PageDown paging, Space activation, `turnNativeDesktopPage`, `pageTurnInFlight`, page-time texture synchronization and production animation waits. Do not restore these old paths.
- Remaining limits: folder opening interruption/cross-folder retargeting, touch gesture integration, search/settings/editing/persistence and full product visual parity. Hardware touchpad and mixed-DPI acceptance remain unverified.

## Remaining migration boundary

Production data now reaches an interactive native Pixi frame through one authoritative path. Application icons support pointer/keyboard activation, launch through Rust, and show explicit success/failure status. The current native slice cannot mutate layout state, so there is no dirty state to save before launch; the existing launch-critical save rule must be connected when native editing is introduced.

Bundled fonts are intentionally deferred because the repository has no redistributable font asset. The public registration API is ready when one is selected. Editing, search and WinUI-style settings controls remain later slices.

## Guardrails

- Do not restore imports containing `webgpu test` or `LAUNCHPAD_ELECTROBUN_DEVKIT_ROOT`.
- Do not call Starter files other than its documented public native host and consumer integration entries.
- Do not restore a LaunchPad-owned window/WebGPU/present/recovery loop.
- Do not keep both Vue and native presentation as writable owners of the same runtime state.
- `vendor/` is third-party release payload: LaunchPad source policy skips it, while Starter manifest/hash validation and consumer typecheck remain authoritative.

## Starter/native foundation feedback

No new production Starter ABI capability blocked this slice. Bun child-process stdio, pointer/keyboard/wheel input, animation scheduling, adaptive resize/DPI, recovery and cleanup were sufficient. A public per-frame post-present hook would be needed before exact opening-interruption/cross-folder ghost handoff parity; public key/wheel injection would improve automated input tests. Neither blocks the current normal folder flow.

## Next complete slice

Next action: compare native folder opening/closing interruptions and cross-folder retargeting against the original flow, and inspect the Starter public API for exact post-present capture support before implementing that slice. Touch, search, settings, editing/persistence and final WebView removal remain subsequent work.
