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
- `load_cached_app_icons(icons: CachedAppIconRequest[]) -> CachedAppIconResult[]`
- `check_launch_targets(targets: LaunchTargetCheckRequest[]) -> LaunchTargetCheckResult[]`
- `launch_app(request: LaunchAppRequest) -> void`
- `hide_main_window() -> void`
- `set_main_window_effects_enabled(enabled: boolean, openSequence?: number | null) -> void`

## Data Shapes

```ts
type AppCatalogItem = {
  id: string;
  type: "app";
  name: string;
  iconPath?: string;
  iconDataUrl?: string;
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

type CachedAppIconRequest = {
  id: string;
  iconPath: string;
};

type CachedAppIconResult = {
  id: string;
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
or truncated scans. It returns cached PNG icons as `iconDataUrl` when extraction succeeds.
The frontend persists `iconPath` for scanned default icons and hydrates those
paths with `load_cached_app_icons` on startup. It should not persist catalog
`iconDataUrl` in layout JSON.

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

Before calling `launch_app`, the frontend flushes any pending layout save so
newly added or recently edited apps are available from persisted state. The
request carries only app `id` and `name`; the backend does not trust
renderer-supplied launch targets or arguments. It resolves launch fields from
the current native catalog item and saved layout item. If those are unavailable,
it rescans the saved layout's `scanRoots` with the saved
`scanKeywordBlacklist` and `scanAppBlacklist` filters.

Launch UX is intentionally optimistic: the frontend performs only synchronous
preflight validation before starting the close/ghost animation, then calls
`launch_app` asynchronously on a zero-delay timer. The native launch path may
wait for the layout flush, but the animation should not wait for native launch
completion because that adds visible launch latency. Save failures stop the
native launch and surface a layout-save notice; runtime launch failures after
the animation starts are surfaced by the native backend with a Windows message
box using user-facing reason and suggestion text.
