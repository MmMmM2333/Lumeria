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
- `hide_main_window() -> void`
- `show_main_window() -> void`; opens the hidden main window through the same cloaked show path used by tray and shortcut activation. The renderer calls this once after native event listeners are registered so cold startup does not expose an uncomposited white WebView frame.
- `reveal_main_window(openSequence: number) -> void`; confirms that the renderer has painted the matching opening frame. Native code reveals only that pending sequence; stale, missing, failed, or timed-out opens remain hidden.
- `set_main_window_effects_enabled(enabled: boolean, openSequence?: number | null) -> void`
- `set_main_window_mode(mode: "fullscreen" | "windowed") -> "fullscreen" | "windowed"`; the native window remains frameless in both modes.
- `set_main_window_shortcut(shortcut: string | null) -> string | null`; registers the global shortcut used to show or hide Lumeria, or unregisters it when `null`. Registration failure means the shortcut is occupied or invalid and the previous shortcut remains active.
- `set_main_window_shortcut_capture_active(active: boolean) -> void`; suppresses the registered main-window shortcut action while the renderer is recording a replacement shortcut.
- `set_main_window_native_frame_enabled(enabled: boolean) -> void`; close animations disable the native window frame (shadow, border, corners, and non-client rendering) and the next open restores it.

Windowed mode uses a frontend-rendered title bar for dragging, resizing, and window controls. It requires Tauri `core:window:allow-start-dragging`, `core:window:allow-start-resize-dragging`, `core:window:allow-minimize`, and `core:window:allow-toggle-maximize` permissions.

## Native Events

Both main-window shortcut events use the same structured payload:

```ts
type MainWindowActivationPayload = {
  openSequence: number;
  displayChanged: boolean;
};
```

- `lumeria-open-desktop` asks the renderer to open or refocus the launchpad. For an `Alt+Space` activation on Windows, the backend resolves the monitor under the cursor, relocates the existing main window, and completes its cloaked show preparation before emitting this event. `displayChanged` is `true` only when that cross-monitor relocation succeeds; the renderer then refreshes monitor-dependent background layout and restarts an active Live Desktop capture. If the desktop was closed, the renderer first paints the closed state through the target monitor's resize-settle frames, uncloaks the window, and starts the open animation on the following visible frame. Tray, settings, and startup opens keep the window on its current monitor and emit `displayChanged: false`.
- `lumeria-toggle-desktop` asks the renderer to run its close path. The backend emits it only when the main window is visible, not minimized, foreground, and already on the cursor monitor. Its `displayChanged` value is always `false`.

`openSequence` identifies the latest native open cycle. The renderer passes it back to `reveal_main_window` after its opening frame has painted, and the backend ignores stale reveal requests. The event payload is always the object above; numeric legacy payloads are not part of the contract.

An opening native window remains DWM-cloaked, non-topmost, and unfocused until the renderer confirms the matching `openSequence`. If confirmation times out or WebView2 fails, native code invalidates that sequence and hides the HWND; there is no forced-reveal fallback.

The native main-window supervisor observes WebView2 process failures independently of the renderer. Browser/main-renderer exit or unresponsiveness immediately cloaks, de-topmosts, and hides the HWND. The first fatal failure in a five-minute stability window restarts the whole app once; another failure in that window stays hidden and uses a native recovery dialog plus the tray's log/restart/quit actions. Recovery never waits for the failed renderer to save state.

## Data Shapes

```ts
type AppCatalogItem = {
  id: string;
  type: "app";
  name: string;
  iconPath?: string;
  iconUrl?: string;
  customIconPath?: string;
  customIconUrl?: string;
  emoji?: string;
  launchTarget: {
    kind: "shortcut" | "executable" | "url" | "appUserModelId";
    path?: string;
    appUserModelId?: string;
  };
  launchArgs?: string;
  sourceKey?: string;
  source?: {
    type: "startMenuUser" | "startMenuSystem" | "customDirectory";
    rootId: string;
    rootLabel: string;
    relativePath: string;
    absolutePath: string;
  };
};

type ScanRoot = {
  id: string;
  type: "startMenuUser" | "startMenuSystem" | "customDirectory";
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
  warnings: ScanWarning[];
  stats: {
    dirsVisited: number;
    entriesSeen: number;
    appsFound: number;
    limitReached: boolean;
  };
};

type ScanWarning = {
  rootId: string;
  rootLabel: string;
  kind: "maxDepthReached" | "maxEntriesReached" | "skippedDirectory" | "cycleSkipped" | "linkSkipped" | string;
  message: string;
};

type ScanFilters = {
  keywordBlacklist: string[];
  appBlacklist: ScanAppBlacklistItem[];
};

type ScanAppBlacklistItem = {
  sourceKey?: string;
  path?: string;
  name?: string;
  blockedAt?: string;
};

type LaunchpadLayout = {
  version: 1;
  pages: LaunchpadPage[];
  settings: {
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
    scanKeywordBlacklist: string[];
    scanAppBlacklist: ScanAppBlacklistItem[];
    showMissingLaunchTargetBadge: boolean;
    windowMode: "fullscreen" | "windowed";
    mainWindowShortcut: string | null;
  };
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
  | AppCatalogItem
  | {
      id: string;
      type: "folder";
      name: string;
      childPages: AppCatalogItem[][];
      children: AppCatalogItem[];
    };
```

Layout item ids must be unique across top-level items and folder
`childPages`. Folder `children` is a flattened compatibility mirror of
`childPages`; the backend validates that it matches `childPages` rather than
treating it as a second set of items.

## Native Backend Notes

The frontend owns the configured scan roots. The Windows backend scans only the
enabled roots passed to `scan_apps`; Start Menu folders are default scan roots,
not hard-coded startup behavior.

`scan_apps` is bounded by per-root recursion and entry limits. It skips repeated
directories, symlinks, junctions, and reparse points; warnings describe skipped
or truncated scans. It returns cached PNG paths when extraction succeeds. The
frontend persists `iconPath` for scanned default icons and derives `iconUrl`
from Tauri's scoped asset protocol on startup. Cached icons are loaded directly
by the renderer rather than being re-read and base64-encoded through IPC. Pixi
image loads set anonymous CORS before assigning an asset URL. Catalog
`iconDataUrl` must not be persisted in layout JSON.

User-selected custom icons are normalized by the frontend before being passed to
`cache_custom_icon`. The backend stores accepted PNG data URLs under the app data
icon cache and returns `customIconPath`. Layout JSON must persist
`customIconPath`, not `customIconDataUrl`; any data URL is runtime-only preview
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
for that app, such as newly added custom apps or edited launch fields, are
persisted. Non-critical layout changes such as drag ordering, page placement,
settings, and icons may remain on the debounced save path. The request carries
only app `id` and `name`; the backend does not trust renderer-supplied launch
targets or arguments. It resolves launch fields from the current native catalog
item and saved layout item. If those are unavailable, it rescans the saved
layout's `scanRoots` with the saved `scanKeywordBlacklist` and
`scanAppBlacklist` filters.

Launch UX is intentionally optimistic: the frontend performs only synchronous
preflight validation before starting the close/ghost animation, then calls
`launch_app` asynchronously on a zero-delay timer. If launch-critical save
preparation fails, the animation does not start and the frontend surfaces a
layout-save notice. Runtime launch failures after the animation starts are
surfaced by the native backend with a Windows message box using user-facing
reason and suggestion text.
