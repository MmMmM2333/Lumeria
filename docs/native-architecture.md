# Native product boundaries

The Native product and browser reference test host share business rules. Each host supplies capabilities and a state adapter; it does not keep
a second copy of the document. The Rust package boundary is documented in
[native-data-service.md](native-data-service.md).

| Owner | Responsibility |
| --- | --- |
| `src/domain` | Persisted contracts, layout/input rules and shared constants |
| `src/application` | Apps, settings transactions, layout, selection, drag, notices and save coordination |
| `src/platform/launchpadContracts.ts` | Shared host-facing result/value types; no Tauri runtime |
| `src/platform/launchpadPortContracts.ts` | Capabilities consumed by shared application services |
| `src/platform/launchpadPorts.ts` and `src/api/launchpadApi.ts` | Injectable browser reference test adapters; no Tauri runtime |
| `src/i18n/translationPort.ts` | Text lookup required by business rules without Vue reactive types |
| `src/native/nativeDataHost.ts` | Validated business operations over the Rust data service |
| `src/native/nativeDataTransport.ts` | One serial subprocess stream, request order and draining shutdown |
| `src/native/nativeDataProtocol.ts` | Version/envelope validation and structured launch errors |
| `src/native/nativeClipboard.ts` | Native clipboard adapter injected into the search editor |
| `src/native/nativeMain.ts` | Host creation, single-instance entry and outer lifecycle |
| `src/native/product/nativeProduct.ts` | Product assembly, one presentation-frame owner and capability wiring |
| `src/native/product/nativeSettingsController.ts` | Settings shell, navigation, panel state, apply/cancel and shortcut recording |
| `src/native/product/nativeSceneController.ts` | Synchronous scene commits, projection snapshots and retained-layout caches |
| `src/native/product/nativeVisibilityController.ts` | Show/hide generation guards and launch timers |
| `src/native/product/nativeInputRouter.ts` | Wheel/touch ownership, capture, page scrub and gesture deadlines |
| `src/native/product/nativeKeyboardRouter.ts` | Synchronous keyboard, composition, modal and focus routing |
| `src/native/nativeCloseCoordinator.ts` | Close intent, pending external shutdown, save/apply ordering and restart guard |
| `src/native/nativeRuntimeLifecycle.ts` | Outer window/data-service cleanup on startup, assembly and disposal failures |
| `src/native/nativeSession.ts` | Single instance and authenticated product control channel |
| `src/native/nativeSceneScheduler.ts` | Pending and synchronous scene work, including teardown suppression |
| `src/native/nativeStartupPreparation.ts` | Bounded startup preparation and reveal decision |
| `src/rendering/native` | Pixi scene/UI presentation and explicit text/input adapters |
| `src/native/diagnostics` | Opt-in verification scenarios, fault injection and captured proof |

Shared application modules may depend on pure rendering contracts and capability
decisions. They cannot depend on composables, concrete host implementations,
Vue, Tauri, Electrobun, Bun, Node, or vendored host code, even through type imports,
dynamic imports or re-exports. `npm run check:policy` checks the transitive local
dependency graph; integration tests are excluded from this production rule.
Use the specific pure module when a broad Web presentation export also exposes a
host-backed preview renderer.

Native text controls can use Starter's text-input types at their implementation
boundary. Business logic should use the capability it needs rather than accept a
global host object. The input router is the only owner of its live touch ID,
wheel deadlines and desktop/folder scrubs; scene presentation reads them without
creating a second state owner.

Normal data-service shutdown drains outstanding serial requests before closing
stdin. Protocol parsing errors are observable and do not become successful
operations. A dead sidecar rejects queued work; stream errors such as EPIPE are
observed instead of crashing the product through an unhandled stream event.
There is no automatic retry or concurrent multiplexing. Product close
waits for settings application and pending persistence before animation/restart;
failure restores interaction and preserves the existing retry/error UI.

Diagnostic scenarios must execute real product paths and restore injected errors
or fixtures in `finally`. They are dynamically imported under the compile-time
`__LUMERIA_DIAGNOSTICS__` switch. Production packaging checks that diagnostic
markers are absent. GPU captures prove the captured rendering only; a skipped
mixed-DPI or physical-device check is not evidence for that environment.

This boundary does not promise a plug-in renderer or a cost-free future PixiRust
migration. The Tauri product is retired; its browser reference test host remains until
its shared regression coverage has a replacement. Version/CI work and publication
remain separate stages. Current packaging instructions are in the
[Windows release guide](../release/windows/README.md); dated test reports record
their own version and environment boundaries.
