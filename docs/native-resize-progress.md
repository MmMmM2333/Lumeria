# Native resize implementation and verification

Updated: 2026-09-06. Implementation and available-machine validation are complete; changing the product default remains gated on display validation below.

## Authorized scope and decisions

Complete label raster reuse, measure its combination with retained-capacity rendering, compare frame scheduling, implement/test capacity lifecycle, then decide whether the new presentation path can become the product default. Preserve existing user changes and remove temporary runtime/probe code.

| Work | Result |
| --- | --- |
| Exact resize positioning and scene synchronization | Implemented and tested; subpixel target changes accumulate correctly, redundant after-frame updates are removed, header controls and icons update together. |
| General label raster reuse | Implemented; font metrics determine whether the previous raster width preserves the requested lines. Text/font-size/line-height/wrapping changes still invalidate; tagged text conservatively retains Pixi's requested width. Hidden focus frames skip bounds measurement. |
| Label reuse combined with retained capacity | Implemented in Starter 0.2.13 as Windows-only `resizeMode: "capacity"`; final production DLL and runtime verified. |
| Completion-oriented frame scheduling | Experiment rejected; the recorded run fell to about 54.17 FPS versus about 59.88 FPS with existing scheduling. No experimental scheduler changes remain in product code. These earlier raw files were lost during packaging; see evidence retention below. |
| Capacity lifecycle | Growth, delayed reclaim, maximize/restore, minimize/restore, explicit recovery, reverse-direction dragging and normal close passed on the available machine. |
| Display acceptance/default switch | Pending mixed-DPI, cross-adapter and actual scanout timing evidence. The LaunchPad product remains on `live`; capacity is opt-in through the Starter API/demo environment variable. |

## Implementation

Baseline commit: `5df391156e2c14c9c1c51b406fdd3b7ad9e05335`; Electrobun 2.0.1, Pixi 8.20.1. The vendored Starter is updated from 0.2.12 to 0.2.13.

`resolveLabelRasterWidth` measures explicit lines using the current Pixi style. It reuses the previous wrap width only when the content fits both widths with a one-pixel margin. Normal Pixi text/style/resolution invalidation still applies. Regression tests compare reference line breaks, dimensions and actual canvas pixels across Arial, Microsoft YaHei UI, monospace, CJK, Greek, Arabic, emoji, short/long labels, width reversals, single-line/multiline and resolution changes.

Capacity reserves in 128-pixel increments with 256-pixel headroom. It queries the actual Dawn device texture limit and reduces speculative headroom when estimated storage exceeds a 256 MiB soft budget at 44 bytes/pixel. This is an estimate, not a GPU memory measurement or a cap on the visible viewport's required resources. It grows when the viewport exceeds either backing dimension and reclaims after one second of settled resize when current area exceeds 1.5 times desired capacity. DPI changes force backing reconfiguration.

Logical scene size remains the client viewport. The native bridge uses DXGI source size and a compensating matrix, while rendering uses an identity scene transform. Surface recovery re-registers the viewport extent. The standard Pixi pass is used for capacity mode, including opaque windows. The tracked Electrobun patch includes the native changes and FFI exports; no diagnostic native exports are present in the staged production DLL.

Native DLL SHA-256: `561697da848f7dde405f73bac8b47b90a1c3bc53cfcd243ead7900303d556d35`. The staged devkit and final development bundle DLL hashes match. All 545 Starter manifest payload files have verified sizes/hashes. The patch applies cleanly to official Electrobun commit `8d09d15db791f346e419efd452d6759750addb62`.

## Final same-source validation

Environment: Windows x64, NVIDIA GeForce RTX 3060 Laptop GPU, one 1920×1080 display at scale 1. Final runtime runs completed at approximately 17:37 and 17:38 Asia/Shanghai on 2026-09-06. Both use the same final development bundle and production DLL. Only the isolated capacity run selects the alternate mode; temporary JS probes collect frame/configure timing and automate the fixture.

The fixture has 48 labeled icons in an 8×6 grid. Each mode runs two bottom-right and two left-edge native mouse drags, 180 cursor steps at nominal 60 Hz per gesture, followed by lifecycle checks. Timing covers the entire mouse-helper phase, including its setup/finish; it does not claim exact OS resize-loop or scanout intervals. A small search-bar alpha animation keeps frames active.

| Application measurement over four drag phases | live | capacity |
| --- | ---: | ---: |
| Phase duration | 13.534 s | 13.427 s |
| Completed application frames | 477 | 802 |
| Application frames/s | 35.24 | 59.73 |
| Frame interval p95 | 59.80 ms | 25.07 ms |
| Intervals above 33.34 ms | 100 | 1 |
| Surface configure calls | 328 | 0 |
| Mean JS tick duration | 24.22 ms | 4.40 ms |
| Mean native present call duration | 15.71 ms | 0.28 ms |

The retained viewport stayed within its allocated capacity during these four drag phases. This demonstrates avoiding repeated surface configuration under that condition; it does not imply all future resizes avoid allocation or that 59.73 application FPS equals the display's scanout rate.

Both modes passed 12 checkpoints, each checking all 48 icon positions, rendered bounds registry entries, center hit targets and header controls. No lastError or unexpected recovery occurred. The one requested recovery moved device/surface generations from 1 to 2 in each mode. Both test processes closed normally.

| Capacity checkpoint | Client pixels | Backing pixels |
| --- | --- | --- |
| Initial | 900×600 | 1280×896 |
| Bottom-right resize | 1200×800 | 1280×896 |
| Left-edge resize | 1200×600 | 1280×896 |
| Growth | 1500×900 | 1792×1280 |
| Settled shrink | 700×450 | 1024×768 |
| Maximize | 1920×1032 | 2176×1408 |
| Restore / minimize-restore / recovery | 700×450 | 1024×768 |
| Reverse-direction drag | 1200×800 | 1408×1024 |

Actual screen captures were visually inspected. Pixel comparisons between live and capacity match exactly in the icon/text region: 364,900 pixels in the initial 900×600 capture and 722,400 pixels in the final 1200×800 capture. The comparison excludes window edges and the animated search bar; it is a static equality check.

Validation commands/results:

- `npm run check`: passed all project tests, three TypeScript checks, policy, i18n and Vite build. Vite retains the existing large-chunk warning.
- `bun test` for `native-surface-capacity.test.ts` and `native-scheduler.test.ts`: 12 passed, 47 assertions.
- `npm run native:build`: stable packaging passed; the existing Rust linker message warning remains. An explicit dev build also passed and supplied the final isolated window tests.
- Native patch application check against official sources and all 545 Starter payload hashes: passed.
- Source `git diff --check`: passed excluding the patch-as-data file, whose unified-diff context markers trigger outer whitespace diagnostics.

## Evidence retention and cleanup

### Commit and release handoff

Starter upstream commit `9b26f0f9602f0c665a7d33374871450b2074f2e4` owns the
capacity implementation. A complete local release was generated at
`../webgpu test/artifacts/electrobun-pixi-native-starter-0.2.13-win-x64` and
installed with its `tools/starter-release.mjs install-consumer` entry point.
The installed manifest records that clean upstream commit (`source.dirty=false`),
and the official consumer validator verified all 545 payload files and ABI 4.
The native DLLs and their FFI inputs are included in this release; `.hutch`
remains ignored by Git, so a source checkout alone does not supply those files.
Retain the complete release for installation on another machine.

The release source files use LF endings matching the consumer Git policy.
Compared with the previously verified payload, the only change beyond line
endings is adding the capacity suite to `test:host`; both DLLs are byte-identical.
The upstream type check, 12 capacity/scheduler tests and the consumer native type
check passed during handoff. Product changes are split into layout commit
`807dc70` and label-raster commit `989c00d`; neither depends on enabling capacity.

Post-install startup passed in an isolated runtime with the release DLLs:
the existing verified development bundle reached `running`, presented its scene,
recorded no runtime/application error and shut down normally. Proof and logs are
retained in `.codex-dev/starter-0.2.13-startup/`. The normal `native:smoke`
attempt was stopped while waiting for the user's existing development build
lock; that development session was preserved. This handoff did not rerun the
full smoke suite. Initial isolated fixture errors (missing launch target and
nonexistent fixture wallpaper) were corrected before the successful run.

The handoff startup runtime/data copies were removed. Cleanup of
`.codex-dev/starter-0.2.13-pre-release-backup/` stopped when Windows denied
deletion of its `native-frame.dll`; the existing user development process still
has that module loaded. The partially cleaned backup is ignored by Git and is
not a release artifact. Remove the remainder after that development session
exits; the complete verified 0.2.13 release remains at the upstream path above.

Electrobun stable packaging clears the consumer's `artifacts` directory. The earlier `resize-work-analysis`, `combined-resize` and `full-resize` raw files were removed by that build. Earlier measurements are historical observations only; the final table above comes from a fresh, independent capture after packaging.

Fresh JSON traces, summaries, screen captures, logs and a reproduction harness are in `artifacts/final-resize/`. That directory is ignored by Git and will again be cleared by a future stable build. This document retains the measured results and decisions independently of generated artifacts. Temporary runtime copies, fixture data and native source-check directories have been removed; the local staged devkit and build outputs remain. Product source has no temporary probes.

## Remaining display acceptance

Previous PresentMon collection was denied by Windows ETW permissions. No Windows permission/group/security settings were changed. Application completion, active swap-chain submission and composition commits do not establish actual scanout timing. The final comparison does not add privileged ETW evidence.

The connected display inventory contains one scale-1 display. Cross-DPI and cross-adapter recovery still require suitable displays, and moving through those boundaries must verify physical size, text sharpness, hit testing and resource recovery. Actual presentation acceptance additionally requires an available presentation trace or sufficiently high-frequency display capture. Until these checks pass, the product default stays `live`; there is no claim that all visual resize stutter or single-frame presentation artifacts have been eliminated.
