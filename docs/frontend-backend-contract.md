# Frontend Backend Contract

This project keeps the Vue UI independent from the native Windows backend.
The first native target should be Tauri, where these functions map to Rust
commands.

## Commands

- `scan_apps() -> AppCatalogItem[]`
- `load_layout() -> LaunchpadLayout | null`
- `save_layout(layout: LaunchpadLayout) -> void`
- `pick_launch_file() -> PickedLaunchFile | null`
- `load_app_icon_choices(targetPath: string) -> AppIconChoice[]`
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

The Windows backend should discover applications from Start Menu known folders
first, then add registry or packaged-app discovery later.

`scan_apps` returns cached PNG icons as `iconDataUrl` when extraction succeeds.
The frontend may persist `customIconDataUrl` for user-selected replacements.

`load_app_icon_choices` returns cached PNG data URLs for icons discovered in a
local `.exe`, `.dll`, `.ico`, or `.lnk` target.

`launch_app` resolves `appId` server-side from the current native catalog first.
If the app is not in the current catalog, the backend may fall back to a saved
layout item with a `launchTarget`; this supports user-created custom apps.
