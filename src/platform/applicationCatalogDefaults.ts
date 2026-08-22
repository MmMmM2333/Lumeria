export type DefaultScanRoot = Readonly<{
  id: string;
  type: "windowsAppCatalog" | "startMenuUser" | "startMenuSystem";
  labelKey: string;
  path: string;
  enabled: boolean;
  removable: boolean;
  maxDepth?: number;
  maxEntries: number;
}>;

export const DEFAULT_SCAN_ROOTS: readonly DefaultScanRoot[] = [
  {
    id: "root-windows-app-catalog",
    type: "windowsAppCatalog",
    labelKey: "settings.apps.sources.default.windowsCatalog",
    path: "shell:AppsFolder",
    enabled: true,
    removable: false,
    maxEntries: 5000,
  },
  {
    id: "root-start-menu-user",
    type: "startMenuUser",
    labelKey: "settings.apps.sources.default.userStartMenu",
    path: "%APPDATA%/Microsoft/Windows/Start Menu/Programs",
    enabled: true,
    removable: true,
    maxDepth: 8,
    maxEntries: 10000,
  },
  {
    id: "root-start-menu-system",
    type: "startMenuSystem",
    labelKey: "settings.apps.sources.default.systemStartMenu",
    path: "%ProgramData%/Microsoft/Windows/Start Menu/Programs",
    enabled: true,
    removable: true,
    maxDepth: 8,
    maxEntries: 10000,
  },
];
