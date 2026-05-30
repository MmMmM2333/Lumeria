# Frontend Backend Contract

This project keeps the Vue UI independent from the native Windows backend.
The first native target should be Tauri, where these functions map to Rust
commands.

## Commands

- `scan_apps(roots: ScanRoot[], filters?: ScanFilters) -> AppCatalogItem[]`
- `load_layout() -> LaunchpadLayout | null`
- `save_layout(layout: LaunchpadLayout) -> void`
- `pick_launch_file() -> PickedLaunchFile | null`
- `pick_scan_root_directory() -> string | null`
- `load_app_icon_choices(targetPath: string) -> AppIconChoice[]`
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
  customIconDataUrl?: string;
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
  lastScannedAt?: string;
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
  iconDataUrl?: string;
};

type AppIconChoice = {
  id: string;
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
  launchTarget?: AppCatalogItem["launchTarget"];
  launchArgs?: string;
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

## Native Backend Notes

The frontend owns the configured scan roots. The Windows backend scans only the
enabled roots passed to `scan_apps`; Start Menu folders are default scan roots,
not hard-coded startup behavior.

`scan_apps` returns cached PNG icons as `iconDataUrl` when extraction succeeds.
The frontend persists `iconPath` for scanned default icons and hydrates those
paths with `load_cached_app_icons` on startup. It should not persist catalog
`iconDataUrl` in layout JSON. The frontend may persist `customIconDataUrl` for
user-selected replacements.

Scanned `.url` files are local shell shortcuts. They should be returned as
`launchTarget.kind: "shortcut"` with the local `.url` file path so missing-file
checks behave like `.lnk` shortcuts. Literal HTTP(S) targets remain
`launchTarget.kind: "url"`.

`load_app_icon_choices` returns cached PNG data URLs for icons discovered in a
local `.exe`, `.dll`, `.ico`, or `.lnk` target.

`launch_app` accepts the frontend's current launch payload so newly added or
recently edited apps can launch before the debounced layout save reaches disk.
If the request has no `launchTarget`, the backend falls back to the current
native catalog item and saved layout item. If those are unavailable, it rescans
the saved layout's `scanRoots` with the saved `scanKeywordBlacklist` and
`scanAppBlacklist` filters. Launch failures after the frontend has started the
close animation are surfaced by the native backend with a Windows message box
using user-facing reason and suggestion text.
