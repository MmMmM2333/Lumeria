# Frontend Backend Contract

This project keeps the Vue UI independent from the native Windows backend.
The first native target should be Tauri, where these functions map to Rust
commands.

## Commands

- `scan_apps() -> AppCatalogItem[]`
- `load_layout() -> LaunchpadLayout | null`
- `save_layout(layout: LaunchpadLayout) -> void`
- `launch_app(appId: string) -> void`

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
};

type LaunchpadLayout = {
  version: 1;
  pages: LaunchpadPage[];
  settings: {
    gridRows: number;
    gridCols: number;
    folderRows: number;
    folderCols: number;
    textless: boolean;
  };
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
first, then add registry or packaged-app discovery later. Launching should be
done by resolving `appId` server-side and calling the Windows shell API, rather
than trusting arbitrary paths from the UI.
