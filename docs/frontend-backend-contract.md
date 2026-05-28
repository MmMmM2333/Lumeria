# Frontend Backend Contract

This project keeps the Vue UI independent from the native Windows backend.
The first native target should be Tauri, where these functions map to Rust
commands.

## Commands

- `scan_apps(roots: ScanRoot[]) -> AppCatalogItem[]`
- `load_layout() -> LaunchpadLayout | null`
- `save_layout(layout: LaunchpadLayout) -> void`
- `pick_launch_file() -> PickedLaunchFile | null`
- `load_app_icon_choices(targetPath: string) -> AppIconChoice[]`
- `load_cached_app_icons(icons: CachedAppIconRequest[]) -> CachedAppIconResult[]`
- `check_launch_targets(targets: LaunchTargetCheckRequest[]) -> LaunchTargetCheckResult[]`
- `launch_app(appId: string) -> void`

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

type LaunchpadLayout = {
  version: 1;
  pages: LaunchpadPage[];
  settings: {
    gridRows: number;
    gridCols: number;
    folderRows: number;
    folderCols: number;
    iconSize: number;
    textless: boolean;
    hiddenAppIds: string[];
    scanRoots: ScanRoot[];
    showMissingLaunchTargetBadge: boolean;
  };
};

type PickedLaunchFile = {
  name: string;
  path: string;
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

`load_app_icon_choices` returns cached PNG data URLs for icons discovered in a
local `.exe`, `.dll`, `.ico`, or `.lnk` target.

`launch_app` resolves `appId` server-side by merging the current native catalog
item with the saved layout item when both exist. The saved layout item's
`launchTarget` and `launchArgs` are authoritative so user edits are respected.
If the app is not in the current catalog, the backend falls back to the saved
layout item with a `launchTarget`.
