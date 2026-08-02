import { chunkIntoPages, clamp } from "./launchpadLayout.js";
import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  normalizeMainWindowShortcut,
} from "./mainWindowShortcut.js";
import { normalizeBackgroundImageLayout } from "./backgroundImageLayout.js";

export const DEFAULT_SCAN_ROOTS = [
  {
    id: "root-windows-app-catalog",
    type: "windowsAppCatalog",
    label: "Windows 应用（商店与系统）",
    path: "shell:AppsFolder",
    enabled: true,
    removable: false,
    maxEntries: 5000,
  },
  {
    id: "root-start-menu-user",
    type: "startMenuUser",
    label: "用户开始菜单",
    path: "%APPDATA%/Microsoft/Windows/Start Menu/Programs",
    enabled: true,
    removable: true,
    maxDepth: 8,
    maxEntries: 10000,
  },
  {
    id: "root-start-menu-system",
    type: "startMenuSystem",
    label: "系统开始菜单",
    path: "%ProgramData%/Microsoft/Windows/Start Menu/Programs",
    enabled: true,
    removable: true,
    maxDepth: 8,
    maxEntries: 10000,
  },
];
export const DEFAULT_SCAN_KEYWORD_BLACKLIST = ["卸载", "uninstall"];

export function fallbackAppGlyph(name) {
  return String(name || "A").trim().charAt(0).toUpperCase() || "A";
}

export function makeLaunchTarget(target) {
  const value = String(target || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    return {
      kind: "url",
      path: value,
    };
  }
  if (/\.(lnk|url)$/i.test(value)) {
    return {
      kind: "shortcut",
      path: value,
    };
  }
  return {
    kind: "executable",
    path: value,
  };
}

export function compareAppsByDefaultOrder(left, right) {
  const leftName = String(left?.name || "").toLowerCase();
  const rightName = String(right?.name || "").toLowerCase();
  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;

  const leftId = String(left?.id || "");
  const rightId = String(right?.id || "");
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  return 0;
}

export function normalizeNativeApp(app, index) {
  const name = String(app?.name || "Application").trim() || "Application";
  const launchTarget = app?.launchTarget || app?.launch_target || null;
  return {
    ...app,
    id: String(app?.id || `native-app-${index}`),
    type: "app",
    name,
    launchTarget,
    launchArgs: launchTarget?.kind === "executable" && typeof app?.launchArgs === "string" ? app.launchArgs : "",
    iconDataUrl: app?.iconDataUrl || null,
    iconPath: app?.iconPath || app?.icon_path || null,
    customIconPath: app?.customIconPath || app?.custom_icon_path || null,
    emoji: app?.emoji || fallbackAppGlyph(name),
    sourceKey: typeof app?.sourceKey === "string" ? app.sourceKey : app?.source_key || null,
    source: app?.source || null,
  };
}

export function normalizeScanRoots(roots) {
  const source = Array.isArray(roots) ? roots : DEFAULT_SCAN_ROOTS;
  return source
    .map((root, index) => {
      const path = String(root?.path || "").trim();
      if (!path) return null;
      const label = String(root?.label || path).trim() || path;
      const normalized = {
        id: String(root?.id || `root-${index}`),
        type: String(root?.type || "customDirectory"),
        label,
        path,
        enabled: root?.enabled !== false,
        removable: root?.removable !== false,
      };
      if (typeof root?.lastScannedAt === "string") normalized.lastScannedAt = root.lastScannedAt;
      const maxDepth = Number(root?.maxDepth);
      if (Number.isFinite(maxDepth) && maxDepth > 0) normalized.maxDepth = Math.floor(maxDepth);
      const maxEntries = Number(root?.maxEntries);
      if (Number.isFinite(maxEntries) && maxEntries > 0) normalized.maxEntries = Math.floor(maxEntries);
      return normalized;
    })
    .filter(Boolean);
}

export function normalizeScanKeywordBlacklist(keywords) {
  const seen = new Set();
  return (Array.isArray(keywords) ? keywords : [])
    .map((keyword) => String(keyword || "").trim())
    .filter((keyword) => {
      const key = keyword.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeAppPathKey(path) {
  return String(path || "").trim().replace(/\\/g, "/").toLowerCase();
}

export function normalizeScanAppBlacklist(apps) {
  const seen = new Set();
  return (Array.isArray(apps) ? apps : [])
    .map((app) => {
      const sourceKey = typeof app?.sourceKey === "string" ? app.sourceKey.trim() : "";
      const path = typeof app?.path === "string" ? app.path.trim() : "";
      const name = typeof app?.name === "string" ? app.name.trim() : "";
      const blockedAt = typeof app?.blockedAt === "string" ? app.blockedAt : null;
      if (!sourceKey && !path) return null;
      const sourceKeyKey = sourceKey ? `source:${sourceKey.toLowerCase()}` : "";
      const pathKey = path ? `path:${normalizeAppPathKey(path)}` : "";
      if ((sourceKeyKey && seen.has(sourceKeyKey)) || (pathKey && seen.has(pathKey))) return null;
      if (sourceKeyKey) seen.add(sourceKeyKey);
      if (pathKey) seen.add(pathKey);
      const normalized = {
        name: name || path || sourceKey,
      };
      if (sourceKey) normalized.sourceKey = sourceKey;
      if (path) normalized.path = path;
      if (blockedAt) normalized.blockedAt = blockedAt;
      return normalized;
    })
    .filter(Boolean);
}

function normalizeLayoutBackgroundBaseColor(value) {
  const color = typeof value === "string" ? value.trim() : "";
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  }
  return "#10141f";
}

function normalizeLayoutBackgroundDarkenColor(value) {
  const color = typeof value === "string" ? value.trim() : "";
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  }
  return "#1c1c1c";
}

function normalizeLayoutBackgroundBlurStrength(value) {
  const strength = Number(value);
  return Number.isFinite(strength) ? clamp(Math.round(strength), 1, 100) : 50;
}

function normalizeLayoutBackgroundDarkenStrength(value) {
  const strength = Number(value);
  return Number.isFinite(strength) ? clamp(Math.round(strength), 0, 100) : 28;
}

const DEFAULT_LAYOUT_ACRYLIC_DARK_PARAMS = {
  brightness: 0.8,
  contrast: 0.85,
  noise: 0.005,
  saturation: 1.5,
  seed: 0,
  tintColor: [0.23529411764705882, 0.23529411764705882, 0.23529411764705882],
  tintStrength: 0.2,
};

const DEFAULT_LAYOUT_ACRYLIC_LIGHT_PARAMS = {
  brightness: 1,
  contrast: 0.85,
  noise: 0.005,
  saturation: 1.5,
  seed: 0,
  tintColor: [0.4588235294117647, 0.4588235294117647, 0.4588235294117647],
  tintStrength: 0.2,
};

function normalizeLayoutBackgroundAcrylicAppearance(value) {
  if (value === "dark" || value === "light") return value;
  return "system";
}

function normalizeLayoutBackgroundAcrylicProfileKey(value) {
  return value === "light" ? "light" : "dark";
}

function clampLayoutNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function hexToRgbArray(value, fallback) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return [...fallback];
  const number = Number.parseInt(match[1], 16);
  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
  ];
}

function normalizeLayoutAcrylicTintColor(value, fallback) {
  if (typeof value === "string") return hexToRgbArray(value, fallback);
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [
    clampLayoutNumber(value[0], 0, 1, fallback[0]),
    clampLayoutNumber(value[1], 0, 1, fallback[1]),
    clampLayoutNumber(value[2], 0, 1, fallback[2]),
  ];
}

function normalizeLayoutBackgroundAcrylicParams(params, profile) {
  const fallback = normalizeLayoutBackgroundAcrylicProfileKey(profile) === "light"
    ? DEFAULT_LAYOUT_ACRYLIC_LIGHT_PARAMS
    : DEFAULT_LAYOUT_ACRYLIC_DARK_PARAMS;
  const source = params && typeof params === "object" ? params : {};
  return {
    brightness: clampLayoutNumber(source.brightness, 0.4, 1.4, fallback.brightness),
    contrast: clampLayoutNumber(source.contrast, 0.6, 1.4, fallback.contrast),
    noise: clampLayoutNumber(source.noise, 0, 0.08, fallback.noise),
    saturation: clampLayoutNumber(source.saturation, 0.4, 1.8, fallback.saturation),
    seed: clampLayoutNumber(source.seed, 0, 1000, fallback.seed),
    tintColor: normalizeLayoutAcrylicTintColor(source.tintColor, fallback.tintColor),
    tintStrength: clampLayoutNumber(source.tintStrength, 0, 0.8, fallback.tintStrength),
  };
}

function getScanExclusionPath(app) {
  const sourcePath = typeof app?.source?.absolutePath === "string"
    ? app.source.absolutePath.trim()
    : "";
  if (sourcePath) return sourcePath;

  const launchTarget = app?.launchTarget;
  const launchPath = typeof launchTarget?.path === "string" ? launchTarget.path.trim() : "";
  const launchKind = String(launchTarget?.kind || "");
  if (!launchPath || launchKind === "url" || launchKind === "appUserModelId") return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(launchPath)) return "";
  return launchPath;
}

export function makeScanAppExclusionEntry(app) {
  const sourceKey = typeof app?.sourceKey === "string" ? app.sourceKey.trim() || null : null;
  const path = getScanExclusionPath(app) || null;
  if (!sourceKey && !path) return null;
  return {
    sourceKey,
    path,
    name: String(app?.name || path || sourceKey || "Application"),
    blockedAt: new Date().toISOString(),
  };
}

export function canExcludeAppFromScan(app) {
  const sourceKey = typeof app?.sourceKey === "string" ? app.sourceKey.trim() : "";
  return Boolean(sourceKey || getScanExclusionPath(app));
}

export function isAppExcludedFromScan(app, blacklist) {
  const normalized = normalizeScanAppBlacklist(blacklist);
  if (!normalized.length) return false;
  const sourceKey = typeof app?.sourceKey === "string" ? app.sourceKey.trim().toLowerCase() : "";
  const pathKey = normalizeAppPathKey(getScanExclusionPath(app));
  return normalized.some((blocked) => {
    if (blocked.sourceKey && sourceKey && blocked.sourceKey.toLowerCase() === sourceKey) return true;
    return Boolean(blocked.path && pathKey && normalizeAppPathKey(blocked.path) === pathKey);
  });
}

export function createLaunchpadDataHelpers(options) {
  const {
    cloneItem,
    clonePages,
    compactPages,
    ensurePage,
    getFolderChildPages,
    getFolderPageSize,
    getPageSize,
    makeId,
    withFolderPages,
  } = options;

  function mergeAppWithSavedIcon(app, savedItem) {
    const next = cloneItem(app);
    if (savedItem?.id) next.id = String(savedItem.id);
    if (savedItem?.name) next.name = String(savedItem.name).slice(0, 64);
    if (savedItem?.emoji) next.emoji = savedItem.emoji;
    if (savedItem?.launchTarget) next.launchTarget = savedItem.launchTarget;
    if (next.launchTarget?.kind === "executable" && typeof savedItem?.launchArgs === "string") next.launchArgs = savedItem.launchArgs;
    else delete next.launchArgs;
    if (savedItem?.customIconPath) next.customIconPath = savedItem.customIconPath;
    if (savedItem?.iconPath) next.iconPath = savedItem.iconPath;
    if (savedItem?.sourceKey) next.sourceKey = savedItem.sourceKey;
    if (savedItem?.source) next.source = savedItem.source;
    return next;
  }

  function normalizeSavedCustomApp(item) {
    if (!item || item.type !== "app" || !item.launchTarget) return null;
    const name = String(item.name || "Application").trim() || "Application";
    return {
      ...item,
      id: String(item.id || makeId("custom-app")),
      type: "app",
      name,
      emoji: item.emoji || fallbackAppGlyph(name),
      launchTarget: item.launchTarget,
      launchArgs: item.launchTarget?.kind === "executable" && typeof item.launchArgs === "string" ? item.launchArgs : "",
      iconPath: item.iconPath || null,
      customIconPath: item.customIconPath || null,
      sourceKey: item.sourceKey || null,
      source: item.source || null,
    };
  }

  function mergeFolderWithCatalog(folder, catalog, catalogBySourceKey, usedAppIds, usedSourceKeys) {
    const sourcePages = Array.isArray(folder?.childPages)
      ? folder.childPages
      : chunkIntoPages(folder?.children || [], getFolderPageSize());
    const childPages = sourcePages
      .map((page) =>
        (page || [])
          .map((child) => {
            const app = child?.sourceKey
              ? catalogBySourceKey.get(child.sourceKey) || catalog.get(child.id) || normalizeSavedCustomApp(child)
              : child?.id ? catalog.get(child.id) || normalizeSavedCustomApp(child) : null;
            if (!app || usedAppIds.has(app.id)) return null;
            usedAppIds.add(app.id);
            if (child?.sourceKey || app.sourceKey) usedSourceKeys.add(child?.sourceKey || app.sourceKey);
            return mergeAppWithSavedIcon(app, child);
          })
          .filter(Boolean)
      )
      .filter((page) => page.length > 0);

    if (!childPages.length) return null;
    return withFolderPages(
      {
        id: String(folder?.id || makeId("folder")),
        type: "folder",
        name: String(folder?.name || "新文件夹").slice(0, 32) || "新文件夹",
      },
      childPages
    );
  }

  function appendAppsToPages(sourcePages, apps) {
    const next = sourcePages.length ? sourcePages.map((page) => page.slice()) : [[]];
    for (const app of apps) {
      if (next[next.length - 1].length >= getPageSize()) next.push([]);
      next[next.length - 1].push(cloneItem(app));
    }
    return compactPages(next, { folderPageSize: getFolderPageSize() });
  }

  function fitPagesToGrid(sourcePages) {
    const next = clonePages(sourcePages);
    for (let i = 0; i < next.length; i += 1) {
      while (next[i].length > getPageSize()) {
        const overflow = next[i].pop();
        ensurePage(next, i + 1);
        next[i + 1].unshift(overflow);
      }
    }
    return compactPages(next, { folderPageSize: getFolderPageSize() });
  }

  function mergeNativeCatalogWithSavedLayout(apps, savedLayout, hiddenAppIds) {
    const catalog = new Map(apps.map((app) => [app.id, app]));
    const catalogBySourceKey = new Map(
      apps.filter((app) => app.sourceKey).map((app) => [app.sourceKey, app])
    );
    const usedAppIds = new Set();
    const usedSourceKeys = new Set();
    const sourcePages = Array.isArray(savedLayout?.pages) ? savedLayout.pages : [];
    const mergedPages = sourcePages.map((page) =>
      (page || [])
        .map((item) => {
          if (item?.type === "folder") return mergeFolderWithCatalog(item, catalog, catalogBySourceKey, usedAppIds, usedSourceKeys);
          const app = item?.sourceKey
            ? catalogBySourceKey.get(item.sourceKey) || catalog.get(item.id) || normalizeSavedCustomApp(item)
            : item?.id ? catalog.get(item.id) || normalizeSavedCustomApp(item) : null;
          if (!app || usedAppIds.has(app.id)) return null;
          usedAppIds.add(app.id);
          if (item?.sourceKey || app.sourceKey) usedSourceKeys.add(item?.sourceKey || app.sourceKey);
          return mergeAppWithSavedIcon(app, item);
        })
        .filter(Boolean)
    );
    const hidden = new Set(hiddenAppIds || []);
    const newApps = apps.filter((app) => !usedAppIds.has(app.id) && !usedSourceKeys.has(app.sourceKey) && !hidden.has(app.id));
    return fitPagesToGrid(appendAppsToPages(mergedPages, newApps));
  }

  function makeLayoutPages(sourcePages) {
    return (sourcePages || []).map((page) => (page || []).filter(Boolean).map(makeLayoutItem));
  }

  function makeLayoutItem(item) {
    if (item.type === "folder") {
      const sourcePages = Array.isArray(item.childPages)
        ? item.childPages
        : getFolderChildPages(item, getFolderPageSize());
      const childPages = sourcePages.map((page) => (page || []).filter(Boolean).map(makeLayoutItem));
      return {
        id: item.id,
        type: "folder",
        name: item.name,
        childPages,
        children: childPages.flat(),
      };
    }

    const clean = {
      id: item.id,
      type: "app",
      name: item.name,
      emoji: item.emoji,
    };
    if (item.customIconPath) clean.customIconPath = item.customIconPath;
    if (item.iconPath) clean.iconPath = item.iconPath;
    if (item.launchTarget) clean.launchTarget = item.launchTarget;
    if (item.launchTarget?.kind === "executable" && item.launchArgs) clean.launchArgs = item.launchArgs;
    if (item.sourceKey) clean.sourceKey = item.sourceKey;
    if (item.source) clean.source = item.source;
    return clean;
  }

  function createLayoutSnapshot(state) {
    const backgroundBaseOpacity = Number(state.backgroundBaseOpacity);
    const backgroundImageOpacity = Number(state.backgroundImageOpacity);
    const backgroundLiveDesktopOpacity = Number(state.backgroundLiveDesktopOpacity);
    const backgroundImageLayout = normalizeBackgroundImageLayout(state.backgroundImageLayout);
    const backgroundBlurStrength = normalizeLayoutBackgroundBlurStrength(state.backgroundBlurStrength);
    const backgroundAcrylicBlurStrength = normalizeLayoutBackgroundBlurStrength(state.backgroundAcrylicBlurStrength);
    const backgroundDarkenStrength = normalizeLayoutBackgroundDarkenStrength(state.backgroundDarkenStrength);
    const backgroundDarkenColor = normalizeLayoutBackgroundDarkenColor(state.backgroundDarkenColor);
    const backgroundAcrylicAppearance = normalizeLayoutBackgroundAcrylicAppearance(state.backgroundAcrylicAppearance);
    const backgroundAcrylicDarkParams = normalizeLayoutBackgroundAcrylicParams(state.backgroundAcrylicDarkParams, "dark");
    const backgroundAcrylicLightParams = normalizeLayoutBackgroundAcrylicParams(state.backgroundAcrylicLightParams, "light");
    const backgroundImagePath = typeof state.backgroundImagePath === "string" ? state.backgroundImagePath.trim() : "";
    const backgroundBaseColor = normalizeLayoutBackgroundBaseColor(state.backgroundBaseColor);
    const backgroundSource = state.backgroundSource === "customImage" || state.backgroundSource === "windowsWallpaper" || state.backgroundSource === "windowsLiveDesktop"
      ? state.backgroundSource
      : "systemMaterial";
    const windowEffectMaterial = state.windowEffectMaterial === "none" || state.windowEffectMaterial === "mica" || state.windowEffectMaterial === "micaAlt"
      ? state.windowEffectMaterial
      : "acrylic";
    const windowMode = state.windowMode === "windowed" ? "windowed" : "fullscreen";
    const fullscreenOverscanEnabled = state.fullscreenOverscanEnabled !== false;
    const showCustomTitlebar = state.showCustomTitlebar !== false;
    const mainWindowShortcut = normalizeMainWindowShortcut(
      Object.prototype.hasOwnProperty.call(state, "mainWindowShortcut")
        ? state.mainWindowShortcut
        : DEFAULT_MAIN_WINDOW_SHORTCUT
    );
    return {
      version: 1,
      pages: makeLayoutPages(state.pages),
      settings: {
        gridRows: state.gridRows,
        gridCols: state.gridCols,
        folderRows: state.folderRows,
        folderCols: state.folderCols,
        iconSize: state.iconSize,
        folderIconSizeMode: state.folderIconSizeMode,
        folderIconSize: state.folderIconSize,
        textless: state.textless,
        hiddenAppIds: state.hiddenAppIds,
        scanRoots: normalizeScanRoots(state.scanRoots),
        scanKeywordBlacklist: normalizeScanKeywordBlacklist(state.scanKeywordBlacklist),
        scanAppBlacklist: normalizeScanAppBlacklist(state.scanAppBlacklist),
        showMissingLaunchTargetBadge: state.showMissingLaunchTargetBadge !== false,
        backgroundBaseColor,
        backgroundBaseOpacity: Number.isFinite(backgroundBaseOpacity) ? clamp(Math.round(backgroundBaseOpacity), 0, 100) : 28,
        backgroundSource,
        backgroundEffect: state.backgroundEffect === "none" || state.backgroundEffect === "blur" || state.backgroundEffect === "acrylicWebgl"
          ? state.backgroundEffect
          : "dimmed",
        backgroundImageOpacity: Number.isFinite(backgroundImageOpacity) ? clamp(Math.round(backgroundImageOpacity), 0, 100) : 46,
        backgroundLiveDesktopOpacity: Number.isFinite(backgroundLiveDesktopOpacity) ? clamp(Math.round(backgroundLiveDesktopOpacity), 0, 100) : 100,
        backgroundImageLayout,
        backgroundBlurStrength,
        backgroundAcrylicBlurStrength,
        backgroundDarkenStrength,
        backgroundDarkenColor,
        backgroundAcrylicAppearance,
        backgroundAcrylicDarkParams,
        backgroundAcrylicLightParams,
        backgroundImagePath: backgroundSource === "customImage" || backgroundSource === "windowsWallpaper"
          ? backgroundImagePath || null
          : null,
        windowEffectMaterial,
        windowEffectAppearance: state.windowEffectAppearance === "light" ? "light" : "dark",
        windowMode,
        fullscreenOverscanEnabled,
        showCustomTitlebar,
        mainWindowShortcut,
      },
    };
  }

  return {
    appendAppsToPages,
    createLayoutSnapshot,
    fitPagesToGrid,
    mergeNativeCatalogWithSavedLayout,
  };
}
