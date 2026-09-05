---
type: context
status: active
scope: native-webgpu-migration
updated: 2026-09-05
read_when: "继续 LaunchPad 的 Electrobun/PixiJS 原生迁移时"
next_entry: "先读 docs/native-product-parity.plan.md 的当前输入验收：1+2 完成；继续原版管理闭环差异，并集中积累上游回放/UIA/桌面 IME 需求"
---

# Native WebGPU migration

Branch: `feature/electrobun-native-migration`  
Worktree: `<local-workspace>/LaunchPad-native-webgpu`

## Confirmed direction

- Latest completed slice (2026-09-05, after df982ae): user approved combined real-input regression and original keyboard/multiselect parity. Shared Alt 520ms state replaces both old implementations; one native key subscription arbitrates product/modal handling before TextInput. Native Shift scope, batch shortcuts, modal focus/buttons, hidden counts, folder-child page markers and cancel-zone presentation are verified. Full check, expanded GPU smoke and 7 Web UI tests passed. Real Windows search, menu/Tab/button, cross-page selection/folder creation and close-exit tested only with isolated data. The checks above are historical evidence and do not establish current release acceptance. No user layout was changed; all isolated validation windows closed.

- Current task after d09f528: original folder opening cancellation, closing reopen and cross-folder handoff, plus automated Windows input/window/title checks. User authorized upstream callback implementation, fixed-release consumption, and closure of the existing native dev window. User has no confirmed precision-touchpad/mixed-DPI setup; physical checks remain unverified. Collect further upstream needs together rather than patching the vendor privately.

- Current task (2026-09-05): user authorized steps 2, 3 and 4: independently upgrade/verify/commit Starter 0.2.0, then restore shared original focus/keyboard semantics and synchronous wheel/page-track integration, removing replaced paths. Baseline commit: `714385a`; upgrade commit: `3211cd1`. Touch, folder interruption, search and settings remain outside this task.

- Target Electrobun plus native WebGPU; Deno is out of scope.
- Keep the existing domain and `CompleteDesktopSceneFrame` boundary.
- Keep Vue/WebView until the native path reaches feature parity; do not introduce a second domain-state owner.
- Consume the fixed Starter release from `vendor/electrobun-pixi-native-starter`; LaunchPad must not import a sibling repository, `.hutch`, or Starter private compatibility modules.

## Completed native slice

- Starter `0.2.2`, release commit `9832eaf`, is vendored with manifest schema v2, 529 verified payload files and native ABI 4. It exposes TextInputHost/TextInput with consumer-owned chrome, focus/composition state and async beforeClose guards, in addition to font registration and synchronous presented events.
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
- Normal close waits for both progress arrival and Pixi's closing-handoff completion. Opening cancellation now passes the original openingCancelRequest into Pixi; same-folder reopen keeps progress, while a different folder starts at zero. Pending opens wait for a successful closing presentation, latest request wins, and stale folder notifications cannot release them. The existing Pixi detached-closing visuals retain ownership until their handoff completes.
- The native presented subscription calls `commitFolderVisualPresentation` after each successful frame, matching the original Web path's snapshot boundary. Closing residual visuals route pointer input back to folder reopen. Old reject-during-opening/reject-if-any-folder-open gates were removed.
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
- Remaining limits: touch gesture integration, search/settings/editing/persistence and full product visual parity. Hardware touchpad and mixed-DPI acceptance remain unverified.

## Folder interruption and automatic acceptance (2026-09-05)

- Upstream commits: `8e2c7ab` implements presented and real-host regression; `986ce97` updates fixed-release validation to 0.2.1. Typecheck, host tests (80 pass including packaged baseline duplicates), actual GPU callback ordering/unsubscribe/observed-timeout tests, and package validation passed. No DLL ABI increase was needed.
- Red baseline: `npx tsx src/native/scene.test.ts` failed with `folder close must interrupt an opening spring: false !== true` before implementation. The same regression and stale/latest-request tests pass after the flow change.
- Native GPU smoke passed cancellation before the first opening present, cancellation during visible opening, same-folder reopen, cross-folder latest-request handoff, final source icon restoration, child launch, three-page wheel/keyboard regression, adaptive resize and minimize/restore.
- Twenty alternating folder-page GPU readbacks check bright title pixels. User observation exposed a test synchronization bug: the old loop could observe the previous page's settled track before the queued new commit. The loop now awaits a new presentation and requires both the target and live track to equal the requested page's distinct X coordinate. The corrected final run passed all 20 completed traversals. The earlier passes established title visibility, not completed page traversal. No speculative title fix is claimed.
- Additional screenshots: folder-opening-cancel.png, folder-reopened.png and folder-cross-handoff.png. These capture intermediate motion, so two visible folders during cross-handoff can be intentional outgoing/incoming visuals, not leaked duplicate state.
- Windows acceptance via Computer Use observed actual mouse folder opening, Escape closing, and wheel transition followed by a settled new page. Titlebar movement did not visibly damage the content. Edge resize was not certified: outward drag exceeded the tool bounds and an inward attempt was interrupted by user-input protection. Native smoke independently verifies logical/backing resize and minimize/restore. Physical touchpad/mixed-DPI checks are explicitly unverified.
- Dev watcher cleanup revealed the Node wrapper's child hutch-engine can outlive it and retain a build lock/relaunch the app. The exact acceptance watcher was identified, stopped, and its window closed under the user's authorization; later smoke runs must not overlap native:dev.
- Complete project gate and stable native build passed; the final smoke after the test synchronization correction passed with `folderInterruptions: verified` and `folderTitleSamples: 20`. Native types were rechecked after the test-only correction. Artifacts are retained and the temporary Starter 0.2.0 rollback payload is removed before commit. Next entry is the subsequent touch integration slice.

## Remaining migration boundary

## Product parity slice after ddeb94a

- Shared core commit `b4aacb7`: original layout/drag/selection/provisional rollback implementation moved to application, Vue retains host adapters. Native now consumes the same rule owners; frame remains a detached rendering projection.
- Native now has original folder desktop fade/scale/offset, desktop page dots and click navigation, shared pointer gesture handling for touch/mouse, search/IME/pinyin results, context menu, app/name/target/args editing and browse, icon update/reset, removal confirmation, dissolve, selection toolbar, group folder creation and drag ordering/rollback.
- Rust saveLayout reuses existing format validation and atomic file replacement. Serialized saves retain dirty state on failure; launch and normal close flush first. Starter beforeClose rejection keeps the window open. Automatic smoke uses only isolated data; real user edits intentionally persist to the existing layout location.
- Validation passed: full project check; all final types/tests; 7 Chromium multi-select management regressions; Rust save protocol roundtrip/invalid-no-overwrite test; save queue retry/serialization; native stable build and GPU search/IME/touch/multi-pointer cancel/mouse drag cancel+commit/group folder creation/new-host reload plus prior folder/page/title/resize checks. GPU screenshots are retained in artifacts/native-smoke.
- These historical tests do not cover every visual or hardware configuration. Main paths are implemented, but this is not complete product or pixel parity, nor certification of physical touchpad/IME candidate-window/mixed-DPI behavior.

Production data reaches an interactive native Pixi frame through the shared layout owner. Native editing mutates that owner, persists through Rust and flushes before launch/normal close, with explicit failure. Search pages are derived and do not replace saved desktop pages.

Bundled fonts are intentionally deferred because the repository has no redistributable font asset. The public registration API is ready when one is selected. Editing, search and WinUI-style settings controls remain later slices.

## Guardrails

- Regression fixes after e9a128c: pointer/context routing now resolves unlabelled Pixi children through their ancestors and excludes input/control subtrees. The actual Windows search click previously threw at label.startsWith; repaired real-window click now focuses successfully without exiting.
- Closing scopes expose desktop items, permitting pointer activation of another desktop folder while existing closing residuals retain their original reopen handler. GPU smoke now clicks the desktop folder during closing rather than bypassing input with activateItem.
- Animation timing matches the original Web loop: motion step → dirty bounds refresh → scene/handoff commit → Starter render → presented snapshot. Previously Native only advanced motion and invalidated rendering, leaving closing targets frozen while the desktop scale/y spring continued. A deterministic regression checks closing target/icon position within pixel rounding and equal size. No fixed offset, extra wait or second render loop was added.
- Validation: full npm run check, native stable build and expanded GPU smoke passed. Actual Windows search click and right-top close were exercised; native:dev returned exit code 0 after window close. SIGINT process test verifies its descendant process is removed.
- native:dev now uses a normal Starter start session, not persistent --watch. Re-run after code edits. Async process supervision handles Ctrl+C/SIGTERM and terminates its own Windows process tree; Ctrl+C is forced cancellation, while normal close remains save-guarded. User requested the dev window be restarted after verification.

- Do not restore imports containing `webgpu test` or `LAUNCHPAD_ELECTROBUN_DEVKIT_ROOT`.
- Do not call Starter files other than its documented public native host and consumer integration entries.
- Do not restore a LaunchPad-owned window/WebGPU/present/recovery loop.
- Do not keep both Vue and native presentation as writable owners of the same runtime state.
- `vendor/` is third-party release payload: LaunchPad source policy skips it, while Starter manifest/hash validation and consumer typecheck remain authoritative.

## Starter/native foundation feedback

Required and completed: synchronous successful `presented` notification (0.2.1), needed because a nextPresent Promise can run after already queued scene-mutating microtasks. Standard and fast paths share markPresented; failed submissions do not notify. Further optional needs accumulated: public key/wheel injection or replay for deterministic end-to-end host tests; reliable precision-touchpad source/phase/momentum only if Windows can actually provide them. Neither is required for the current folder slice, and no metadata is fabricated. Future capability requests should be grouped and validated at the upstream release boundary.

## Next complete slice

The next step at this historical checkpoint was settings and full desktop host migration. This is not a current task directive; the Native product boundary is documented in [native-architecture.md](native-architecture.md).
