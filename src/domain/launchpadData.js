import { chunkIntoPages, clamp } from "./launchpadLayout.js";
import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  normalizeMainWindowShortcut,
} from "./mainWindowShortcut.js";
import { normalizeBackgroundImageLayout } from "./backgroundImageLayout.js";
import {
  APPEARANCE_DARK,
  normalizeAppearancePreference,
} from "./appearancePreference.js";
import { normalizeLaunchpadIconVariant } from "./launchpadIconVariant.js";
import { normalizeLocalePreference } from "../i18n/locale.js";

export const DEFAULT_SCAN_KEYWORD_BLACKLIST = ["卸载", "uninstall"];

export function createDefaultScanRoots({ roots, translate } = {}) {
  if (!Array.isArray(roots)) {
    throw new TypeError("createDefaultScanRoots requires platform scan roots");
  }
  if (typeof translate !== "function") {
    throw new TypeError("createDefaultScanRoots requires a translation function");
  }
  return roots.map(({ labelKey, ...root }) => {
    const label = String(translate(labelKey) || "").trim();
    if (!label) throw new TypeError(`Default scan root label is empty: ${labelKey}`);
    return { ...root, label };
  });
}

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

export function normalizeNativeApp(app) {
  const id = String(app?.id || "").trim();
  if (!id) throw new TypeError("Catalog apps require a canonical id");
  if (!app?.launchTarget || typeof app.launchTarget !== "object") {
    throw new TypeError(`Catalog app ${id} requires a launch target`);
  }
  const trackingKey = String(app?.trackingKey || "").trim();
  if (!trackingKey) throw new TypeError(`Catalog app ${id} requires a tracking key`);
  const identityStatus = String(app?.identityStatus || "");
  if (identityStatus !== "exact" && identityStatus !== "unresolved") {
    throw new TypeError(`Catalog app ${id} has an invalid identity status`);
  }
  if (!Array.isArray(app?.sources) || !app.sources.length) {
    throw new TypeError(`Catalog app ${id} requires provenance sources`);
  }
  const name = String(app?.name || "Application").trim() || "Application";
  const launchTarget = app.launchTarget;
  return {
    ...app,
    id,
    type: "app",
    name,
    launchTarget,
    launchArgs: launchTarget?.kind === "executable" && typeof app?.launchArgs === "string" ? app.launchArgs : "",
    iconDataUrl: app?.iconDataUrl || null,
    iconPath: app?.iconPath || null,
    customIconPath: app?.customIconPath || null,
    emoji: app?.emoji || fallbackAppGlyph(name),
    origin: "catalog",
    presentationOverrides: {},
    trackingKey,
    identityStatus,
    sources: Array.isArray(app?.sources) ? app.sources.map((source) => ({ ...source })) : [],
  };
}

export function normalizeScanRoots(roots) {
  const source = Array.isArray(roots) ? roots : [];
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

export function normalizeScanKeywordAllowlist(catalogIds) {
  const seen = new Set();
  return (Array.isArray(catalogIds) ? catalogIds : [])
    .map((catalogId) => String(catalogId || "").trim())
    .filter((catalogId) => {
      const key = catalogId.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeScanAppBlacklist(apps) {
  const seen = new Set();
  return (Array.isArray(apps) ? apps : [])
    .map((app) => {
      const catalogId = typeof app?.catalogId === "string" ? app.catalogId.trim() : "";
      const name = typeof app?.name === "string" ? app.name.trim() : "";
      const blockedAt = typeof app?.blockedAt === "string" ? app.blockedAt : null;
      const key = catalogId.toLowerCase();
      if (!key || seen.has(key)) return null;
      seen.add(key);
      const normalized = {
        catalogId,
        name: name || catalogId,
      };
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

export function makeScanAppExclusionEntry(app) {
  if (app?.origin !== "catalog") return null;
  const catalogId = String(app?.id || "").trim();
  if (!catalogId) return null;
  return {
    catalogId,
    name: String(app?.name || catalogId || "Application"),
    blockedAt: new Date().toISOString(),
  };
}

export function canExcludeAppFromScan(app) {
  return app?.origin === "catalog" && Boolean(String(app?.id || "").trim());
}

export function isAppExcludedFromScan(app, blacklist) {
  const normalized = normalizeScanAppBlacklist(blacklist);
  if (!normalized.length) return false;
  const catalogId = String(app?.id || "").trim().toLowerCase();
  return Boolean(catalogId && normalized.some((blocked) => blocked.catalogId.toLowerCase() === catalogId));
}

export function createLaunchpadDataHelpers(options) {
  const {
    cloneItem,
    clonePages,
    compactPages,
    ensurePage,
    getFolderChildPages,
    getFolderPageSize,
    getNewFolderName,
    getPageSize,
    makeId,
    withFolderPages,
  } = options;
  if (typeof getNewFolderName !== "function") {
    throw new TypeError("createLaunchpadDataHelpers requires getNewFolderName");
  }

  function normalizePresentationOverrides(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const overrides = {};
    const name = typeof source.name === "string" ? source.name.trim().slice(0, 64) : "";
    const emoji = typeof source.emoji === "string" ? source.emoji.trim() : "";
    const customIconPath = typeof source.customIconPath === "string" ? source.customIconPath.trim() : "";
    if (name) overrides.name = name;
    if (emoji) overrides.emoji = emoji;
    if (customIconPath) overrides.customIconPath = customIconPath;
    return overrides;
  }

  function makeCatalogRuntimeApp(app, savedReference = null) {
    const next = cloneItem(app);
    const overrides = normalizePresentationOverrides(savedReference?.overrides);
    next.catalogPresentation = {
      name: String(app?.name || "Application"),
      emoji: app?.emoji || fallbackAppGlyph(app?.name),
    };
    next.type = "app";
    next.origin = "catalog";
    next.presentationOverrides = overrides;
    if (overrides.name) next.name = overrides.name;
    if (overrides.emoji) next.emoji = overrides.emoji;
    if (overrides.customIconPath) next.customIconPath = overrides.customIconPath;
    else delete next.customIconPath;
    return next;
  }

  function normalizeSavedManualApp(item) {
    if (!item || item.type !== "manualApp" || !item.launchTarget) return null;
    const name = String(item.name || "Application").trim() || "Application";
    const app = {
      ...item,
      id: String(item.id || makeId("manual-app")),
      type: "app",
      origin: "manual",
      name,
      emoji: item.emoji || fallbackAppGlyph(name),
      launchTarget: item.launchTarget,
      iconPath: item.iconPath || null,
      customIconPath: item.customIconPath || null,
    };
    delete app.launchArgs;
    if (item.launchTarget?.kind === "executable" && typeof item.launchArgs === "string" && item.launchArgs) {
      app.launchArgs = item.launchArgs;
    }
    delete app.sources;
    delete app.trackingKey;
    delete app.identityStatus;
    return app;
  }

  function addReconcileIssue(issues, issue) {
    issues.push({
      ...issue,
      path: String(issue.path || "savedDocument"),
    });
  }

  function restoreSavedItem(item, catalog, usedAppIds, issues, path) {
    if (item?.type === "catalogApp") {
      const app = catalog.get(String(item.id || ""));
      if (!app) {
        addReconcileIssue(issues, { id: String(item.id || ""), kind: "missing-catalog-item", path });
        return null;
      }
      if (usedAppIds.has(app.id)) {
        addReconcileIssue(issues, { id: app.id, kind: "duplicate-item", path });
        return null;
      }
      usedAppIds.add(app.id);
      return makeCatalogRuntimeApp(app, item);
    }
    if (item?.type === "manualApp") {
      const app = normalizeSavedManualApp(item);
      if (!app) {
        addReconcileIssue(issues, { id: String(item?.id || ""), kind: "invalid-manual-item", path });
        return null;
      }
      if (usedAppIds.has(app.id)) {
        addReconcileIssue(issues, { id: app.id, kind: "duplicate-item", path });
        return null;
      }
      usedAppIds.add(app.id);
      return app;
    }
    addReconcileIssue(issues, { id: String(item?.id || ""), kind: "unsupported-saved-item", path });
    return null;
  }

  function restoreFolder(folder, catalog, usedAppIds, issues, path) {
    const hasChildPages = Array.isArray(folder?.childPages);
    const hasLegacyChildren = Array.isArray(folder?.children);
    const sourcePages = hasChildPages
      ? folder.childPages
      : hasLegacyChildren
        ? chunkIntoPages(folder.children, getFolderPageSize())
        : [];
    if (!hasChildPages && hasLegacyChildren) {
      addReconcileIssue(issues, { id: String(folder?.id || ""), kind: "legacy-folder-children", path });
    }
    if (hasChildPages && hasLegacyChildren) {
      const pageIds = sourcePages.flat().filter(Boolean).map((item) => String(item?.id || ""));
      const childIds = folder.children.filter(Boolean).map((item) => String(item?.id || ""));
      if (JSON.stringify(pageIds) !== JSON.stringify(childIds)) {
        addReconcileIssue(issues, { id: String(folder?.id || ""), kind: "folder-child-representation-mismatch", path });
      }
    }
    const childPages = sourcePages
      .map((page, pageIndex) =>
        (page || [])
          .map((child, childIndex) => restoreSavedItem(
            child,
            catalog,
            usedAppIds,
            issues,
            `${path}.childPages[${pageIndex}][${childIndex}]`
          ))
          .filter(Boolean)
      )
      .filter((page) => page.length > 0);

    if (!childPages.length) {
      addReconcileIssue(issues, { id: String(folder?.id || ""), kind: "empty-folder-after-reconcile", path });
      return null;
    }
    const fallbackName = String(getNewFolderName() || "").trim();
    if (!fallbackName) throw new TypeError("getNewFolderName returned an empty name");
    return withFolderPages(
      {
        id: String(folder?.id || makeId("folder")),
        type: "folder",
        name: String(folder?.name || fallbackName).slice(0, 32) || fallbackName,
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

  function reconcileDocument(apps, savedDocument, hiddenAppIds) {
    const catalog = new Map(apps.map((app) => [app.id, app]));
    const usedAppIds = new Set();
    const issues = [];
    const sourcePages = Array.isArray(savedDocument?.pages) ? savedDocument.pages : [];
    const mergedPages = sourcePages.map((page, pageIndex) =>
      (page || [])
        .map((item, itemIndex) => {
          const path = `pages[${pageIndex}][${itemIndex}]`;
          if (item?.type === "folder") return restoreFolder(item, catalog, usedAppIds, issues, path);
          return restoreSavedItem(item, catalog, usedAppIds, issues, path);
        })
        .filter(Boolean)
    );
    const hidden = new Set(hiddenAppIds || []);
    const newApps = apps
      .filter((app) => !usedAppIds.has(app.id) && !hidden.has(app.id))
      .map((app) => makeCatalogRuntimeApp(app));
    return {
      issues,
      pages: fitPagesToGrid(appendAppsToPages(mergedPages, newApps)),
    };
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
      };
    }

    if (item.origin === "catalog") {
      const clean = { id: item.id, type: "catalogApp" };
      const overrides = normalizePresentationOverrides(item.presentationOverrides);
      if (Object.keys(overrides).length) clean.overrides = overrides;
      return clean;
    }

    const clean = { id: item.id, type: "manualApp", name: item.name, emoji: item.emoji };
    if (item.customIconPath) clean.customIconPath = item.customIconPath;
    if (item.iconPath) clean.iconPath = item.iconPath;
    if (item.launchTarget) clean.launchTarget = item.launchTarget;
    if (item.launchTarget?.kind === "executable" && item.launchArgs) clean.launchArgs = item.launchArgs;
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
      version: 2,
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
        scanKeywordAllowlist: normalizeScanKeywordAllowlist(state.scanKeywordAllowlist),
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
        windowEffectAppearance: normalizeAppearancePreference(state.windowEffectAppearance, APPEARANCE_DARK),
        windowMode,
        fullscreenOverscanEnabled,
        showCustomTitlebar,
        mainWindowShortcut,
        localePreference: normalizeLocalePreference(state.localePreference),
        settingsThemePreference: normalizeAppearancePreference(state.settingsThemePreference),
        launchpadIconVariant: normalizeLaunchpadIconVariant(state.launchpadIconVariant),
      },
    };
  }

  return {
    appendAppsToPages,
    createLayoutSnapshot,
    fitPagesToGrid,
    reconcileDocument,
  };
}
