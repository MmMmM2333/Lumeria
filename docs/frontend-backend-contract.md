# Frontend Backend Contract

This project keeps the Vue UI independent from the native Windows backend.
The first native target should be Tauri, where these functions map to Rust
commands.

## Commands

- `scan_apps(roots: ScanRoot[], filters?: ScanFilters) -> ScanAppsResult`
- `load_layout() -> LaunchpadLayout | null`
- `save_layout(layout: LaunchpadLayout) -> void`
- `pick_launch_file() -> PickedLaunchFile | null`
- `pick_scan_root_directory() -> string | null`
- `load_app_icon_choices(targetPath: string) -> AppIconChoice[]`
- `cache_custom_icon(dataUrl: string) -> CachedCustomIconResult`
- `check_launch_targets(targets: LaunchTargetCheckRequest[]) -> LaunchTargetCheckResult[]`
- `launch_app(request: LaunchAppRequest) -> void`
- `begin_main_window_close(openSequence: number) -> MainWindowCloseTransition`; validates and advances the matching open generation, then atomically disables the native frame and effects before returning the generation that owns the delayed hide. A stale request is a no-op and does not mutate the surface.
- `hide_main_window(generation: number) -> boolean`; hides only while `generation` is still the accepted close generation. A newer open makes the command a `false` no-op.
- `get_launch_context() -> LaunchContext`; returns the immutable launch origin parsed once from the first process arguments.
- `complete_renderer_startup() -> void`; the renderer calls this only after all required native event listeners are registered and the validated layout/catalog scene has finished restoring. Native code then replays one queued activation, opens a manual cold start, or keeps a login startup hidden.
- `get_autostart_status() -> boolean`; reports enabled only when the Windows Run command matches the current executable and Windows has not disabled its StartupApproved entry.
- `set_autostart_enabled(enabled: boolean) -> boolean`; writes or removes the current executable's quoted Windows Run command and returns the verified applied state.
- `reveal_main_window(openSequence: number) -> boolean`; confirms that the renderer has painted the matching opening frame. `true` means that exact sequence was revealed; stale, missing, failed, or timed-out opens return `false` and remain hidden.
- `set_main_window_effects_enabled(enabled: boolean, openSequence?: number | null) -> void`; opening may update the effect material without a token, while disabling requires the matching open sequence and is normally owned atomically by `begin_main_window_close`.
- `set_main_window_mode(mode: "fullscreen" | "windowed", fullscreenOverscanEnabled: boolean) -> "fullscreen" | "windowed"`; returns the applied native mode. The native window remains frameless in both modes.
- `set_main_window_shortcut(shortcut: string | null) -> string | null`; registers the global shortcut used to show or hide Lumeria, or unregisters it when `null`. Registration failure means the shortcut is occupied or invalid and the previous shortcut remains active.
- `set_main_window_shortcut_capture_active(active: boolean) -> void`; suppresses the registered main-window shortcut action while the renderer is recording a replacement shortcut.
- `set_main_window_native_frame_enabled(enabled: boolean, openSequence?: number | null) -> void`; opening may restore the frame without a token, while disabling it requires the matching open sequence. Close animations use the atomic `begin_main_window_close` transaction instead of issuing a separate disable command.

Windowed mode uses a frontend-rendered title bar for dragging, resizing, and window controls. It requires Tauri `core:window:allow-start-dragging`, `core:window:allow-start-resize-dragging`, `core:window:allow-minimize`, and `core:window:allow-toggle-maximize` permissions.
Returning from borderless fullscreen first aligns the WebView with the restored window client bounds and then reenables WebView automatic resize. Fullscreen owns explicit WebView bounds; windowed mode owns automatic client-bound synchronization.

## Startup Lifecycle

```ts
type LaunchContext = {
  origin: "manual" | "loginStartup";
};

type MainWindowCloseTransition = {
  accepted: boolean;
  generation: number;
};
```

The first process owns one immutable `LaunchContext`. The renderer may use it to initialize its closed/open scene state, but native code alone decides when the HWND is shown. A manual cold start opens after listeners and restored scene data jointly reach the startup gate and call `complete_renderer_startup`; a login startup remains resident in the system tray without opening a window. A failed scene restore leaves the gate closed and exposes the existing retry/error UI instead of briefly opening a default scene.

All native open entry points cross the main-window supervisor. Before renderer startup is complete, ordinary opens coalesce, the latest monitor target wins, and an open-settings request remains sticky. Completing renderer startup consumes the queued request at most once. A subsequent main-document navigation (including a Windows-level F5 refresh) starts a new renderer session: native visibility generations and pending hides are revoked, a visible HWND is hidden while the new renderer boots, and the native frame/effects surface is restored before a queued activation is replayed. Native code must not treat a successful event emit as proof that the renderer received it.

Lumeria is single-instance. A second manual launch routes an open request to the existing process; the launching process delegates its Windows foreground permission before the plugin forwards the request, so the existing window can be focused even when it was hidden. A second launch carrying `--lumeria-autostart` exits without making the existing process visible. The single-instance plugin is registered before every other Tauri plugin so no second process reaches tray or global-shortcut setup.

Autostart configuration is Windows-owned state and is never written to `LaunchpadLayout`. Enabling it reads the running executable through `current_exe`, preserves its native path, and writes `"<actual executable>" --lumeria-autostart`; no installation directory is assumed. Registry and verification failures are explicit command errors rather than a disabled-state fallback.

## Native Events

Both main-window shortcut events use the same structured payload:

```ts
type MainWindowActivationPayload = {
  openSequence: number;
  displayChanged: boolean;
};
```

- `lumeria-open-desktop` asks the renderer to open or refocus the launchpad. It is emitted only after `complete_renderer_startup`. For an `Alt+Space` activation on Windows, the backend resolves the monitor under the cursor, relocates the existing main window, and completes its cloaked show preparation before emitting this event. `displayChanged` is `true` only when that cross-monitor relocation succeeds; the renderer then refreshes monitor-dependent background layout and restarts an active Live Desktop capture. If the desktop was closed, the renderer first paints the closed state through the target monitor's resize-settle frames, uncloaks the window, and starts the open animation on the following visible frame. Tray, settings, second-instance, and manual startup opens otherwise keep the window on its current monitor and emit `displayChanged: false`.
- `lumeria-toggle-desktop` asks the renderer to run its close path. The backend emits it only when the main window is visible, not minimized, foreground, and already on the cursor monitor. Its `displayChanged` value is always `false`.

`openSequence` identifies the latest native open cycle. The renderer passes it back to `reveal_main_window` after its opening frame has painted, and the backend ignores stale reveal requests. The event payload is always the object above; numeric legacy payloads are not part of the contract.

The renderer owns one `MainWindowTransition` queue for mode, frame, effects, reveal, begin-close, and hide requests. Calling begin-close changes the frontend epoch synchronously, so a reveal still waiting for paint becomes stale before it can cross the adapter. Native code serializes irreversible surface mutations under the same generation protocol: begin-close advances `openSequence` to a close generation and atomically owns the disabled frame/effects state, hide accepts only that generation, and beginning a newer open or renderer navigation revokes it. Requested state may update immediately in the renderer, but applied state advances only after the native command succeeds.

An opening native window remains DWM-cloaked, non-topmost, and unfocused until the renderer confirms the matching `openSequence`. If confirmation times out or WebView2 fails, native code invalidates that sequence and hides the HWND; there is no forced-reveal fallback.

The native main-window supervisor observes WebView2 process failures independently of the renderer. Browser/main-renderer exit or unresponsiveness immediately cloaks, de-topmosts, and hides the HWND. The first fatal failure in a five-minute stability window restarts the whole app once; another failure in that window stays hidden and uses a native recovery dialog plus the tray's log/restart/quit actions. Recovery never waits for the failed renderer to save state.

## Data Shapes

```ts
type AppCatalogItem = {
  id: string;
  type: "app";
  name: string;
  iconPath?: string;
  emoji?: string;
  launchTarget: {
    kind: "shortcut" | "executable" | "url" | "appUserModelId";
    path?: string;
    appUserModelId?: string;
  };
  launchArgs?: string;
  trackingKey: string;
  identityStatus: "exact" | "unresolved";
  sources: Array<{
    key: string;
    type: "windowsAppCatalog" | "startMenuUser" | "startMenuSystem" | "customDirectory";
    state: "primary" | "equivalent" | "shadowed";
    rootId: string;
    rootLabel: string;
    relativePath: string;
    absolutePath: string;
  }>;
};

type ScanRoot = {
  id: string;
  type: "windowsAppCatalog" | "startMenuUser" | "startMenuSystem" | "customDirectory";
  label: string;
  path: string;
  enabled: boolean;
  removable: boolean;
  maxDepth?: number;
  maxEntries?: number;
  lastScannedAt?: string;
};

type ScanAppsResult = {
  apps: AppCatalogItem[];
  excludedApps: AppCatalogItem[];
  keywordExcludedApps: KeywordExcludedApp[];
  warnings: ScanWarning[];
  stats: {
    dirsVisited: number;
    entriesSeen: number;
    physicalAppsFound: number;
    startMenuOverlays: number;
    equivalentAppsMerged: number;
    unresolvedApps: number;
    keywordExcludedApps: number;
    excludedApps: number;
    appsFound: number;
    limitReached: boolean;
  };
};

type KeywordExcludedApp = {
  app: AppCatalogItem;
  matchedKeyword: string;
};

type ScanWarning = {
  rootId: string;
  rootLabel: string;
  kind: "maxDepthReached" | "maxEntriesReached" | "skippedDirectory" | "cycleSkipped" | "linkSkipped" | string;
  message: string;
};

type ScanFilters = {
  keywordBlacklist: string[];
  keywordAllowlist: string[];
  appBlacklist: ScanAppBlacklistItem[];
};

type ScanAppBlacklistItem = {
  catalogId: string;
  name?: string;
  blockedAt?: string;
};

type LaunchpadLayout = {
  version: 2;
  pages: LaunchpadPage[];
  settings: LaunchpadSettings;
};

type AcrylicParameters = {
  brightness: number;
  contrast: number;
  noise: number;
  saturation: number;
  seed: number;
  tintColor: [number, number, number];
  tintStrength: number;
};

type LaunchpadSettings = {
  gridRows: number;
  gridCols: number;
  folderRows: number;
  folderCols: number;
  iconSize: number;
  folderIconSizeMode: "global" | "custom";
  folderIconSize: number;
  textless: boolean;
  hiddenAppIds: string[];
  scanRoots: ScanRoot[];
  scanKeywordAllowlist: string[];
  scanKeywordBlacklist: string[];
  scanAppBlacklist: ScanAppBlacklistItem[];
  showMissingLaunchTargetBadge: boolean;
  backgroundBaseColor: string;
  backgroundBaseOpacity: number;
  backgroundSource: "systemMaterial" | "customImage" | "windowsWallpaper" | "windowsLiveDesktop";
  backgroundEffect: "none" | "dimmed" | "blur" | "acrylic";
  backgroundImageOpacity: number;
  backgroundLiveDesktopOpacity: number;
  backgroundImageLayout: "fill" | "fit" | "stretch" | "tile" | "center";
  backgroundBlurStrength: number;
  backgroundAcrylicBlurStrength: number;
  backgroundDarkenStrength: number;
  backgroundDarkenColor: string;
  backgroundAcrylicAppearance: "system" | "dark" | "light";
  backgroundAcrylicDarkParams: AcrylicParameters;
  backgroundAcrylicLightParams: AcrylicParameters;
  backgroundImagePath: string | null;
  windowEffectMaterial: "none" | "acrylic" | "mica" | "micaAlt";
  windowEffectAppearance: "system" | "dark" | "light";
  windowMode: "fullscreen" | "windowed";
  fullscreenOverscanEnabled: boolean;
  showCustomTitlebar: boolean;
  mainWindowShortcut: string | null;
  localePreference: string;
  settingsThemePreference: "system" | "dark" | "light";
  launchpadIconVariant: "light" | "dark" | "pastelLight" | "pastelDark";
};

type PickedLaunchFile = {
  name: string;
  path: string;
  launchTarget: AppCatalogItem["launchTarget"];
  launchArgs: string;
  iconPath?: string;
  iconDataUrl?: string;
};

type AppIconChoice = {
  id: string;
  iconPath: string;
  iconDataUrl: string;
};

type CachedCustomIconResult = {
  iconPath: string;
  iconDataUrl: string;
};

type LaunchTargetCheckRequest = {
  id: string;
  launchTarget: AppCatalogItem["launchTarget"];
};

type LaunchTargetCheckResult = {
  id: string;
  status: "ok" | "missing" | "unknown";
};

type LaunchAppRequest = {
  id: string;
  name: string;
};

type LaunchpadPage = LaunchpadItem[];

type LaunchpadItem =
  | CatalogAppReference
  | ManualApp
  | {
      id: string;
      type: "folder";
      name: string;
      childPages: Array<Array<CatalogAppReference | ManualApp>>;
    };

type CatalogAppReference = {
  id: string;
  type: "catalogApp";
  overrides?: {
    name?: string;
    emoji?: string;
    customIconPath?: string;
  };
};

type ManualApp = {
  id: string;
  type: "manualApp";
  name: string;
  emoji?: string;
  iconPath?: string;
  customIconPath?: string;
  launchTarget: AppCatalogItem["launchTarget"];
  launchArgs?: string;
};
```

`LaunchpadLayout` is a closed-world contract. Every field shown as required is
required, and unknown fields are rejected at the root and at every nested
object. The JavaScript and Rust validators run the same mutation corpus so an
accepted document has the same meaning on both sides. Validation does not add
defaults, repair values, drop fields, or migrate older shapes.

Layout item ids must be unique across top-level items and folder `childPages`.
`childPages` is the only persisted folder-content authority; the former
flattened `children` mirror is rejected. Folder children cannot be folders.

Catalog items in layout v2 are references, not snapshots. Their name, default
icon, launch target, arguments, identity, and provenance always come from the
current native catalog. Only explicit presentation overrides are persisted.
Manual items own and persist their launch configuration. Changing a catalog
item's target or arguments converts that item to a manual item and hides the
original catalog id. Layout v1 is intentionally rejected; this unreleased
project has no v1 migration path.

## Renderer Runtime Contracts

The Vue/controller side and the Pixi adapter exchange only two runtime
contracts:

- `SceneFrame` is an exact, frozen root made by `makeDesktopSceneFrame`. It has
  the groups `viewport`, `content`, `interaction`, `folder`, `overlay`, and
  `diagnostics`; unknown or missing group fields are rejected. Collection
  structure is snapshotted before it crosses the boundary, so later controller
  mutations cannot change the frame being rendered.
- `SceneEvent` is an exact discriminated union made by `makeSceneEvent`. Pointer
  and wheel data are immutable scalar snapshots. Raw DOM/Pixi events and mutable
  application items are not exposed. The optional `control` object contains
  only the explicit event-control capabilities needed by the controller.

Renderer ports use explicit named exports. `desktopScenePort.js` exposes only
application-facing scene capabilities; Motion Lab host creation and background
debug tuning use their own renderer-owned adapters. Wildcard port exports are a
boundary-test failure.

### Pixi frame invalidation

Pixi frame work is selected by an exact invalidation lane rather than a generic
"update the layer" flag:

- `structure` and `geometry` may build and reconcile one complete desktop plan;
- `interaction` patches the existing ownership, drop-target, and drag-preview
  nodes without building a plan;
- `visual` applies only root transforms and alpha;
- `handoff` advances only the folder handoff reconciliation;
- `diagnostics` updates only diagnostic display objects;
- `motion` and `asset` require only the final GPU commit.

Every invalidation mark advances a monotonic revision, with the latest revision
also recorded per lane. A consumed frame may combine capabilities, but a
structural capability subsumes the other layer patches because the complete
reconciliation applies their current state. The desktop driver owns the only
RAF commit: synchronous ownership changes patch the scene graph immediately and
enqueue that same frame, but cannot call `app.render()` through a second path.
Consequently one RAF performs at most one GPU render.

Desktop plans carry an explicit revision assigned when the plan is built. They
do not compute a recursive JSON signature. Icon-bound updates run as registry
transactions; clearing and rebuilding an identical final geometry does not
advance the bounds revision. In development, the existing render probe records
one `frame-work` event containing lanes/revisions, layer and GPU durations, full
plan build count, reconciled-node count, handoff reconciliation count, and GPU
render count.

Loading an existing v2 document is a two-phase operation: restore its scan
configuration first, refresh the current native catalog with that configuration,
then reconcile the saved pages against the refreshed catalog. Catalog references
must never be reconciled against an empty placeholder catalog. If a bounded scan
is incomplete and one or more saved catalog ids are missing from its partial
result, layout loading remains not-ready and retryable; the partial result must
not replace or be saved over the existing layout. Unreadable directory entries
and skipped links/reparse points count as potentially incomplete because a path
that was previously scanned may have changed into either state. Icon extraction
failures do not make the catalog itself incomplete.

## Native Backend Notes

The frontend owns the configured scan roots. The Windows backend scans only the
enabled roots passed to `scan_apps`; Start Menu folders are default scan roots,
not hard-coded startup behavior.

`scan_apps` is bounded by per-root recursion and entry limits. It skips repeated
directories, symlinks, junctions, and reparse points; warnings describe skipped
or truncated scans. The first-level `Startup` directory is omitted only for the
two built-in Start Menu roots. When user and system Start Menu entries have the
same normalized relative path, the user entry is primary and the system entry
is retained as `shadowed` provenance instead of becoming a second app.

`keywordBlacklist` performs case-insensitive substring matching against the
logical app name only; source-relative and absolute paths are not matched.
Matching happens after Start Menu overlay and semantic grouping, when the stable
catalog id is available. `keywordAllowlist` contains catalog ids that bypass
keyword matching, allowing the user to add a specific matched app without
weakening the global keyword rule. Explicit `appBlacklist` entries take
precedence over this allowlist.

`stats.keywordExcludedApps` counts the grouped logical apps removed by keyword
matching. `keywordExcludedApps` contains at most the first 200 of those apps for
the scan-result UI. Each entry carries the complete `AppCatalogItem`, including
its launch target and cached icon path when icon extraction succeeds, plus the
first matched keyword. The stats count is authoritative; a larger count than
the returned list means the list was truncated. Selecting one of these apps in
the UI both adds it to the layout and persists its catalog id in
`settings.scanKeywordAllowlist`; current writers always emit that setting while
the native reader accepts older version-2 layouts that omit it as an empty list.

After Start Menu overlay, the backend groups entries only when it can resolve an
exact launch identity. That identity includes executable arguments and Windows
Shell Link launch metadata; unresolved shortcuts remain separate. Equal entries
from a custom directory and a Start Menu root form one logical app, with the
custom source primary and the remaining physical paths retained as
`equivalent` provenance. Source precedence is `customDirectory`,
`startMenuUser`, `windowsAppCatalog`, then `startMenuSystem`. Display-name
equality alone never merges applications.

Catalog ids are derived from the exact semantic launch identity and remain
stable when an equivalent physical source is added or removed. Unresolved
entries use a source-scoped id. `scanAppBlacklist` filters the canonical catalog
id after overlay and grouping, so excluding an app excludes every equivalent
source. Matching entries are returned separately in `ScanAppsResult.excludedApps`
for runtime settings presentation while remaining absent from `apps` and layout
reconciliation. `hiddenAppIds` controls layout visibility independently and uses
the same canonical id. When the user confirms only part of a scan result,
unselected catalog ids are added to `hiddenAppIds`; selecting them in a later
scan removes those ids again. This keeps a deliberate partial selection stable
across startup catalog reconciliation.

Icon extraction runs after overlay, grouping, and the visible/excluded partition
and returns a cached PNG path for both visible and matched excluded logical apps
when extraction succeeds. The renderer derives runtime asset URLs from Tauri's
scoped asset protocol; cached icons are not re-read and base64-encoded through
IPC. `excludedApps` is runtime-only. Catalog default `iconPath`, runtime asset
URLs, provenance, tracking keys, identity state, launch targets, and arguments
must not be persisted in layout JSON.

The catalog icon cache is keyed by both the canonical catalog id and the current
primary source identity. Promoting a custom-directory source over a Start Menu
source must invalidate the previous source's cached icon instead of reusing it
under the stable catalog id.

User-selected custom icons are normalized by the frontend before being passed to
`cache_custom_icon`. The backend stores accepted PNG data URLs under the app data
icon cache and returns `customIconPath`. A catalog app stores it under
`overrides.customIconPath`; a manual app stores it on the manual item. Layout
JSON never persists a custom-icon data URL; any data URL is runtime-only preview
state.

Scanned `.url` files are local shell shortcuts. They should be returned as
`launchTarget.kind: "shortcut"` with the local `.url` file path so missing-file
checks behave like `.lnk` shortcuts. Literal HTTP(S) targets remain
`launchTarget.kind: "url"`.

`pick_launch_file` accepts `.exe`, `.lnk`, and `.url` files. Local `.lnk` and
`.url` selections are returned as `launchTarget.kind: "shortcut"` with the
selected file path.

`launchArgs` is only supported for `launchTarget.kind: "executable"`. The
frontend should not persist or send launch arguments for shortcuts, URL files,
literal HTTP(S) URLs, or AppUserModelId targets; the backend ignores them for
non-executable targets.

`load_app_icon_choices` returns cached PNG data URLs for icons discovered in a
local `.exe`, `.dll`, `.ico`, or `.lnk` target.

Before calling `launch_app`, the frontend ensures launch-critical layout changes
for a manual app, such as a newly added app or edited launch fields, are
persisted. Non-critical layout changes such as drag ordering, page placement,
settings, and icons may remain on the debounced save path. The request carries
only app `id` and `name`; the backend does not trust renderer-supplied launch
targets or arguments. It resolves a catalog id from the current native catalog,
using an existing `equivalent` physical path if the primary shortcut disappears;
`shadowed` Start Menu entries are not launch fallbacks. A manual id resolves only
from a saved `manualApp`. If a catalog id is not currently cached, the backend
rescans the saved layout's `scanRoots` with its saved keyword and canonical-id
filters. Saved `catalogApp` references never supply launch data.

Launch UX is intentionally optimistic: the frontend performs only synchronous
preflight validation before starting the close/ghost animation, then calls
`launch_app` asynchronously on a zero-delay timer. If launch-critical save
preparation fails, the animation does not start and the frontend surfaces a
layout-save notice. Runtime launch failures after the animation starts are
surfaced by the native backend with a Windows message box using user-facing
reason and suggestion text.
