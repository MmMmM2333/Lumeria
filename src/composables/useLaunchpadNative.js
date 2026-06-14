import { ref } from "vue";
import {
  DESKTOP_CLOSE_DURATION,
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { clamp } from "../domain/launchpadLayout.js";
import { createBackgroundEffectPlan } from "../domain/backgroundEffectPlan.js";
import { getKawaseDebugEffectPlanParams } from "../rendering/pixi/background/kawaseDebugParams.js";
import {
  DEFAULT_SCAN_KEYWORD_BLACKLIST,
  isAppBlockedByScanBlacklist,
  normalizeNativeApp,
  normalizeScanAppBlacklist,
  normalizeScanKeywordBlacklist,
  normalizeScanRoots,
} from "../domain/launchpadData.js";
import {
  checkLaunchTargets,
  configureLiveDesktopBackground,
  confirmQuitAfterSave,
  convertFilePathToAssetUrl,
  getDesktopWallpaperBackground,
  getLiveDesktopBackgroundSupport,
  getLiveDesktopRuntimeStatus,
  getMainWindowEffectsSupport,
  hideMainWindow,
  isNativeBridgeAvailable,
  launchApp as launchNativeApp,
  listenNativeEvent,
  loadCachedAppIcons,
  loadLayout,
  saveLayout,
  scanApps,
  setLiveDesktopBackgroundVisible,
  setMainWindowEffectsEnabled,
  showLaunchErrorMessage,
  startLiveDesktopBackground,
  stopLiveDesktopBackground,
} from "../api/launchpadApi.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_EFFECT_DIMMED,
  DEFAULT_WINDOW_EFFECTS_SUPPORT,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
  BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
  backgroundEffectUsesPixi,
  backgroundSourceUsesLiveDesktop,
  backgroundSourceUsesImage,
  clampBackgroundBaseOpacity,
  clampBackgroundBlurStrength,
  clampBackgroundDarkenStrength,
  clampBackgroundImageOpacity,
  clampBackgroundLiveDesktopOpacity,
  normalizeBackgroundImageLayout,
  normalizeBackgroundAcrylicAppearance,
  normalizeBackgroundAcrylicParams,
  normalizeBackgroundBaseColor,
  normalizeBackgroundDarkenColor,
  normalizeBackgroundEffect,
  normalizeBackgroundImagePath,
  normalizeBackgroundSource,
  normalizeLiveDesktopBackgroundSupport,
  normalizeWindowEffectAppearance,
  normalizeWindowEffectsSupport,
  resolveWindowEffectMaterialForSupport,
} from "./useLaunchpadSettingsConfig.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";

const USE_MOCK_DATA_IN_NATIVE = false;
const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";
const CUSTOM_ICON_HYDRATION_ID_PREFIX = "__custom_icon__:";
const MIN_ICON_HYDRATION_BATCH_SIZE = 20;
const MAX_ICON_HYDRATION_BATCH_SIZE = 80;
const WINDOWS_WALLPAPER_REFRESH_INTERVAL_MS = 5000;
const LIVE_DESKTOP_IDLE_STOP_DELAY_MS = 10_000;
const LIVE_DESKTOP_DEBUG_FRAME_SOURCE_OVERRIDE_STORAGE_KEY = "launchpadLiveDesktopDebugFrameSourceOverride";
const LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY = "launchpadLiveDesktopDisableMouseRelay";
const LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY = "launchpadLiveDesktopSkipBlankFrames";
const LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY = "launchpadLiveDesktopForceDwmFlush";
const LIVE_DESKTOP_EXPERIMENT_DISABLED_REASON = "experimentDisabled";
const LIVE_DESKTOP_EXPERIMENT_DISABLED_DETAIL = "Live desktop experiment flag is disabled.";
const DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS = Object.freeze({
  phase: "stopped",
  active: false,
  generation: 0,
  reason: "nativeBridgeUnavailable",
  detail: "",
  diagnostics: {
    framesCopied: 0,
    frameTimeouts: 0,
    copyErrors: 0,
    commitErrors: 0,
    frameArrivedEvents: 0,
    frameArrivedDroppedSignals: 0,
    frameCopySamples: 0,
    frameCopyMicrosTotal: 0,
    lastFrameCopyMicros: 0,
    maxFrameCopyMicros: 0,
    frameCommitSamples: 0,
    frameCommitMicrosTotal: 0,
    lastFrameCommitMicros: 0,
    maxFrameCommitMicros: 0,
    configUpdates: 0,
    configErrors: 0,
    lastFrameWidth: 0,
    lastFrameHeight: 0,
    lastFrameFormat: 0,
    testPatternFrames: 0,
    pixelProbeSamples: 0,
    pixelProbeErrors: 0,
    blankFrameSkips: 0,
    shaderCopyFallbacks: 0,
    abandonedRendererWorkers: 0,
    reapedAbandonedRendererWorkers: 0,
    lastPixelProbeWidth: 0,
    lastPixelProbeHeight: 0,
    lastPixelProbeMinRgb: 0,
    lastPixelProbeMaxRgb: 0,
    lastPixelProbeAvgRgb: 0,
    lastPixelProbeMinAlpha: 0,
    lastPixelProbeMaxAlpha: 0,
    lastPixelProbeAvgAlpha: 0,
    lastShaderCopyError: "",
    lastAbandonedRendererReason: "",
    lastError: "",
  },
  windowDiagnostics: {
    platform: "unknown",
    available: false,
    reason: "nativeBridgeUnavailable",
    detail: "",
    windowCount: 0,
    candidateCount: 0,
    windows: [],
    candidates: [],
  },
});

function normalizeLiveDesktopRuntimeDiagnostics(diagnostics) {
  const normalizeCount = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  };
  return {
    framesCopied: normalizeCount(diagnostics?.framesCopied),
    frameTimeouts: normalizeCount(diagnostics?.frameTimeouts),
    copyErrors: normalizeCount(diagnostics?.copyErrors),
    commitErrors: normalizeCount(diagnostics?.commitErrors),
    frameArrivedEvents: normalizeCount(diagnostics?.frameArrivedEvents),
    frameArrivedDroppedSignals: normalizeCount(diagnostics?.frameArrivedDroppedSignals),
    frameCopySamples: normalizeCount(diagnostics?.frameCopySamples),
    frameCopyMicrosTotal: normalizeCount(diagnostics?.frameCopyMicrosTotal),
    lastFrameCopyMicros: normalizeCount(diagnostics?.lastFrameCopyMicros),
    maxFrameCopyMicros: normalizeCount(diagnostics?.maxFrameCopyMicros),
    frameCommitSamples: normalizeCount(diagnostics?.frameCommitSamples),
    frameCommitMicrosTotal: normalizeCount(diagnostics?.frameCommitMicrosTotal),
    lastFrameCommitMicros: normalizeCount(diagnostics?.lastFrameCommitMicros),
    maxFrameCommitMicros: normalizeCount(diagnostics?.maxFrameCommitMicros),
    configUpdates: normalizeCount(diagnostics?.configUpdates),
    configErrors: normalizeCount(diagnostics?.configErrors),
    lastFrameWidth: normalizeCount(diagnostics?.lastFrameWidth),
    lastFrameHeight: normalizeCount(diagnostics?.lastFrameHeight),
    lastFrameFormat: normalizeCount(diagnostics?.lastFrameFormat),
    testPatternFrames: normalizeCount(diagnostics?.testPatternFrames),
    pixelProbeSamples: normalizeCount(diagnostics?.pixelProbeSamples),
    pixelProbeErrors: normalizeCount(diagnostics?.pixelProbeErrors),
    blankFrameSkips: normalizeCount(diagnostics?.blankFrameSkips),
    shaderCopyFallbacks: normalizeCount(diagnostics?.shaderCopyFallbacks),
    abandonedRendererWorkers: normalizeCount(diagnostics?.abandonedRendererWorkers),
    reapedAbandonedRendererWorkers: normalizeCount(diagnostics?.reapedAbandonedRendererWorkers),
    lastPixelProbeWidth: normalizeCount(diagnostics?.lastPixelProbeWidth),
    lastPixelProbeHeight: normalizeCount(diagnostics?.lastPixelProbeHeight),
    lastPixelProbeMinRgb: normalizeCount(diagnostics?.lastPixelProbeMinRgb),
    lastPixelProbeMaxRgb: normalizeCount(diagnostics?.lastPixelProbeMaxRgb),
    lastPixelProbeAvgRgb: normalizeCount(diagnostics?.lastPixelProbeAvgRgb),
    lastPixelProbeMinAlpha: normalizeCount(diagnostics?.lastPixelProbeMinAlpha),
    lastPixelProbeMaxAlpha: normalizeCount(diagnostics?.lastPixelProbeMaxAlpha),
    lastPixelProbeAvgAlpha: normalizeCount(diagnostics?.lastPixelProbeAvgAlpha),
    lastShaderCopyError: String(diagnostics?.lastShaderCopyError || ""),
    lastAbandonedRendererReason: String(diagnostics?.lastAbandonedRendererReason || ""),
    lastError: String(diagnostics?.lastError || ""),
  };
}

function normalizeLiveDesktopWindowRect(rect) {
  const normalizeInteger = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
  };
  return {
    left: normalizeInteger(rect?.left),
    top: normalizeInteger(rect?.top),
    right: normalizeInteger(rect?.right),
    bottom: normalizeInteger(rect?.bottom),
    width: Math.max(0, normalizeInteger(rect?.width)),
    height: Math.max(0, normalizeInteger(rect?.height)),
  };
}

function normalizeLiveDesktopWindowInfo(windowInfo) {
  return {
    hwnd: String(windowInfo?.hwnd || ""),
    parentHwnd: String(windowInfo?.parentHwnd || ""),
    rootHwnd: String(windowInfo?.rootHwnd || ""),
    pid: Math.max(0, Math.trunc(Number(windowInfo?.pid) || 0)),
    className: String(windowInfo?.className || ""),
    title: String(windowInfo?.title || ""),
    processName: String(windowInfo?.processName || ""),
    role: String(windowInfo?.role || "window"),
    candidateReason: String(windowInfo?.candidateReason || ""),
    visible: Boolean(windowInfo?.visible),
    style: String(windowInfo?.style || ""),
    exStyle: String(windowInfo?.exStyle || ""),
    cloaked: Math.max(0, Math.trunc(Number(windowInfo?.cloaked) || 0)),
    rect: normalizeLiveDesktopWindowRect(windowInfo?.rect),
  };
}

function normalizeLiveDesktopWindowDiagnostics(diagnostics) {
  const normalizeCount = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  };
  const windows = Array.isArray(diagnostics?.windows)
    ? diagnostics.windows.map(normalizeLiveDesktopWindowInfo)
    : [];
  const candidates = Array.isArray(diagnostics?.candidates)
    ? diagnostics.candidates.map(normalizeLiveDesktopWindowInfo)
    : [];
  return {
    platform: String(diagnostics?.platform || DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS.windowDiagnostics.platform),
    available: Boolean(diagnostics?.available),
    reason: String(diagnostics?.reason || DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS.windowDiagnostics.reason),
    detail: String(diagnostics?.detail || ""),
    windowCount: normalizeCount(diagnostics?.windowCount ?? windows.length),
    candidateCount: normalizeCount(diagnostics?.candidateCount ?? candidates.length),
    windows,
    candidates,
  };
}

function isLiveDesktopDebugRuntimeConfigEnabled() {
  return Boolean(import.meta.env?.DEV && isLiveDesktopExperimentEnabled());
}

function resolveLiveDesktopDebugFrameSourceOverride() {
  if (!isLiveDesktopDebugRuntimeConfigEnabled() || typeof window === "undefined") return null;
  try {
    const frameSourceOverride = window.localStorage?.getItem(LIVE_DESKTOP_DEBUG_FRAME_SOURCE_OVERRIDE_STORAGE_KEY);
    return frameSourceOverride === "testPattern" ? "testPattern" : null;
  } catch {
    return null;
  }
}

function resolveLiveDesktopDisableMouseRelay() {
  if (!isLiveDesktopDebugRuntimeConfigEnabled() || typeof window === "undefined") return true;
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function resolveLiveDesktopSkipBlankFrames() {
  if (!isLiveDesktopDebugRuntimeConfigEnabled() || typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function resolveLiveDesktopForceDwmFlush() {
  if (!isLiveDesktopDebugRuntimeConfigEnabled() || typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function normalizeLiveDesktopRuntimeStatus(status) {
  const generation = Number(status?.generation);
  return {
    phase: String(status?.phase || DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS.phase),
    active: Boolean(status?.active),
    generation: Number.isFinite(generation) && generation >= 0 ? Math.floor(generation) : 0,
    reason: String(status?.reason || DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS.reason),
    detail: String(status?.detail || ""),
    diagnostics: normalizeLiveDesktopRuntimeDiagnostics(status?.diagnostics),
    windowDiagnostics: normalizeLiveDesktopWindowDiagnostics(status?.windowDiagnostics),
  };
}

function liveDesktopRuntimeStatusIsRunning(status) {
  return Boolean(status?.active || status?.phase === "running");
}

function liveDesktopRuntimeStatusIsStopped(status) {
  return status?.phase === "stopped";
}

function resolveLiveDesktopAcrylicProfile(options) {
  const appearance = normalizeBackgroundAcrylicAppearance(options.backgroundAcrylicAppearance.value);
  if (appearance !== BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM) return appearance;
  return normalizeWindowEffectAppearance(options.windowEffectAppearance.value) === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    ? BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    : BACKGROUND_ACRYLIC_APPEARANCE_DARK;
}

function makeLiveDesktopRuntimeConfig(options) {
  const acrylicAppearance = normalizeBackgroundAcrylicAppearance(options.backgroundAcrylicAppearance.value);
  const acrylicProfile = resolveLiveDesktopAcrylicProfile(options);
  const acrylicParams = normalizeBackgroundAcrylicParams(
    acrylicProfile === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
      ? options.backgroundAcrylicLightParams.value
      : options.backgroundAcrylicDarkParams.value,
    acrylicProfile
  );
  return {
    effect: normalizeBackgroundEffect(options.backgroundEffect.value),
    debugFrameSourceOverride: resolveLiveDesktopDebugFrameSourceOverride(),
    blurStrength: clampBackgroundBlurStrength(options.backgroundBlurStrength.value),
    darkenStrength: clampBackgroundDarkenStrength(options.backgroundDarkenStrength.value),
    darkenColor: normalizeBackgroundDarkenColor(options.backgroundDarkenColor.value),
    acrylicAppearance,
    acrylicParams,
    effectPlan: createBackgroundEffectPlan({
      acrylicParams,
      blurStrength: options.backgroundBlurStrength.value,
      dualKawaseParams: getKawaseDebugEffectPlanParams(),
      effect: options.backgroundEffect.value,
      opacity: options.backgroundLiveDesktopOpacity.value,
    }),
    disableMouseRelay: resolveLiveDesktopDisableMouseRelay(),
    skipBlankFrames: resolveLiveDesktopSkipBlankFrames(),
    forceDwmFlush: resolveLiveDesktopForceDwmFlush(),
    opacity: clampBackgroundLiveDesktopOpacity(options.backgroundLiveDesktopOpacity.value),
  };
}

export function useLaunchpadNative(options) {
  let nativeLayoutReady = false;
  const isNativeLayoutReady = ref(!shouldUseNativeCatalog());
  let nativeWindowEffectsUpdate = Promise.resolve();
  let nativeSaveTimer = null;
  let nativeWindowHideTimer = null;
  let nativeWallpaperRefreshTimer = null;
  let liveDesktopIdleStopTimer = null;
  let liveDesktopBackgroundVisible = null;
  let liveDesktopRuntimeSync = Promise.resolve();
  let liveDesktopRuntimeSyncGeneration = 0;
  let nativeWindowOpenSequence = null;
  let nativeEventListenerGeneration = 0;
  let nativeSavePromise = null;
  let launchCriticalDirtyRevision = 0;
  let launchTargetStatusCheckRequestId = 0;
  let launchTargetStatusRecordsById = {};
  let lastSavedLayoutSignature = "";
  let nativeLoadFailureCount = 0;
  let hadNativeLoadFailure = false;
  let nativeSaveFailureCount = 0;
  let hadNativeSaveFailure = false;
  const launchCriticalDirtyAppIds = new Set();
  let unlistenCloseDesktopEvent = null;
  let unlistenOpenDesktopEvent = null;
  let unlistenSettingsEvent = null;
  let unlistenToggleDesktopEvent = null;
  let unlistenLayoutRecoveredEvent = null;
  let unlistenQuitRequestedEvent = null;
  let quitRequestInProgress = false;

  function shouldUseNativeCatalog() {
    return isNativeBridgeAvailable() && !USE_MOCK_DATA_IN_NATIVE;
  }

  function applyLayoutSettings(settings) {
    if (!settings) return;
    const rows = clamp(Number(settings.gridRows) || DEFAULT_ROWS, 2, 8);
    const cols = clamp(Number(settings.gridCols) || DEFAULT_COLS, 3, 10);
    const nextFolderRows = clamp(Number(settings.folderRows) || DEFAULT_FOLDER_ROWS, 2, 6);
    const nextFolderCols = clamp(Number(settings.folderCols) || DEFAULT_FOLDER_COLS, 2, 8);
    const nextIconSize = options.clampIconSize(settings.iconSize);
    const nextFolderIconSizeMode = settings.folderIconSizeMode === FOLDER_ICON_SIZE_MODE_CUSTOM
      ? FOLDER_ICON_SIZE_MODE_CUSTOM
      : FOLDER_ICON_SIZE_MODE_GLOBAL;
    const nextFolderIconSize = options.clampIconSize(settings.folderIconSize ?? nextIconSize);
    const nextWindowEffectMaterial = resolveWindowEffectMaterialForSupport(
      settings.windowEffectMaterial,
      options.windowEffectsSupport.value
    );
    const nextWindowEffectAppearance = normalizeWindowEffectAppearance(settings.windowEffectAppearance);
    const nextBackgroundSource = normalizeBackgroundSource(settings.backgroundSource);
    const nextBackgroundEffect = normalizeBackgroundEffect(settings.backgroundEffect);
    const nextBackgroundBaseColor = normalizeBackgroundBaseColor(settings.backgroundBaseColor);
    const nextBackgroundBaseOpacity = clampBackgroundBaseOpacity(settings.backgroundBaseOpacity);
    const nextBackgroundImageOpacity = clampBackgroundImageOpacity(settings.backgroundImageOpacity);
    const nextBackgroundLiveDesktopOpacity = clampBackgroundLiveDesktopOpacity(settings.backgroundLiveDesktopOpacity);
    const nextBackgroundImageLayout = normalizeBackgroundImageLayout(settings.backgroundImageLayout);
    const nextBackgroundBlurStrength = clampBackgroundBlurStrength(settings.backgroundBlurStrength);
    const nextBackgroundDarkenStrength = clampBackgroundDarkenStrength(settings.backgroundDarkenStrength);
    const nextBackgroundDarkenColor = normalizeBackgroundDarkenColor(settings.backgroundDarkenColor);
    const nextBackgroundAcrylicAppearance = normalizeBackgroundAcrylicAppearance(settings.backgroundAcrylicAppearance);
    const nextBackgroundAcrylicDarkParams = normalizeBackgroundAcrylicParams(settings.backgroundAcrylicDarkParams, BACKGROUND_ACRYLIC_APPEARANCE_DARK);
    const nextBackgroundAcrylicLightParams = normalizeBackgroundAcrylicParams(settings.backgroundAcrylicLightParams, BACKGROUND_ACRYLIC_APPEARANCE_LIGHT);
    const nextBackgroundUsesLiveDesktop = isLiveDesktopExperimentEnabled()
      && backgroundSourceUsesLiveDesktop(nextBackgroundSource)
      && normalizeLiveDesktopBackgroundSupport(options.liveDesktopBackgroundSupport.value).supportsLiveDesktopBackground;
    const nextBackgroundImagePath = backgroundSourceUsesImage(nextBackgroundSource)
      ? normalizeBackgroundImagePath(settings.backgroundImagePath)
      : null;
    const nextBackgroundImageUrl = nextBackgroundImagePath ? convertFilePathToAssetUrl(nextBackgroundImagePath) : null;
    let nextEffectiveBackgroundEffect = nextBackgroundEffect;
    if (!nextBackgroundUsesLiveDesktop && backgroundEffectUsesPixi(nextBackgroundEffect) && !nextBackgroundImagePath) {
      nextEffectiveBackgroundEffect = BACKGROUND_EFFECT_DIMMED;
    }

    options.gridRows.value = rows;
    options.gridCols.value = cols;
    options.folderRows.value = nextFolderRows;
    options.folderCols.value = nextFolderCols;
    options.iconSize.value = nextIconSize;
    options.folderIconSizeMode.value = nextFolderIconSizeMode;
    options.folderIconSize.value = nextFolderIconSize;
    options.draftRows.value = rows;
    options.draftCols.value = cols;
    options.draftFolderRows.value = nextFolderRows;
    options.draftFolderCols.value = nextFolderCols;
    options.draftIconSize.value = nextIconSize;
    options.draftFolderIconSizeMode.value = nextFolderIconSizeMode;
    options.draftFolderIconSize.value = nextFolderIconSize;
    options.isTextlessMode.value = Boolean(settings.textless);
    options.draftIsTextlessMode.value = options.isTextlessMode.value;
    options.windowEffectMaterial.value = nextWindowEffectMaterial;
    options.windowEffectAppearance.value = nextWindowEffectAppearance;
    options.draftWindowEffectMaterial.value = nextWindowEffectMaterial;
    options.draftWindowEffectAppearance.value = nextWindowEffectAppearance;
    options.backgroundSource.value = nextBackgroundUsesLiveDesktop
      ? BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP
      : nextBackgroundImagePath
        ? nextBackgroundSource
        : BACKGROUND_SOURCE_SYSTEM_MATERIAL;
    options.backgroundEffect.value = nextEffectiveBackgroundEffect;
    options.backgroundBaseColor.value = nextBackgroundBaseColor;
    options.backgroundBaseOpacity.value = nextBackgroundBaseOpacity;
    options.backgroundImageOpacity.value = nextBackgroundImageOpacity;
    options.backgroundLiveDesktopOpacity.value = nextBackgroundLiveDesktopOpacity;
    options.backgroundImageLayout.value = nextBackgroundImageLayout;
    options.backgroundBlurStrength.value = nextBackgroundBlurStrength;
    options.backgroundDarkenStrength.value = nextBackgroundDarkenStrength;
    options.backgroundDarkenColor.value = nextBackgroundDarkenColor;
    options.backgroundAcrylicAppearance.value = nextBackgroundAcrylicAppearance;
    options.backgroundAcrylicDarkParams.value = nextBackgroundAcrylicDarkParams;
    options.backgroundAcrylicLightParams.value = nextBackgroundAcrylicLightParams;
    options.backgroundImagePath.value = nextBackgroundImagePath;
    options.backgroundImageUrl.value = nextBackgroundImageUrl;
    options.draftBackgroundSource.value = options.backgroundSource.value;
    options.draftBackgroundEffect.value = nextEffectiveBackgroundEffect;
    options.draftBackgroundBaseColor.value = nextBackgroundBaseColor;
    options.draftBackgroundBaseOpacity.value = nextBackgroundBaseOpacity;
    options.draftBackgroundImageOpacity.value = nextBackgroundImageOpacity;
    options.draftBackgroundLiveDesktopOpacity.value = nextBackgroundLiveDesktopOpacity;
    options.draftBackgroundImageLayout.value = nextBackgroundImageLayout;
    options.draftBackgroundBlurStrength.value = nextBackgroundBlurStrength;
    options.draftBackgroundDarkenStrength.value = nextBackgroundDarkenStrength;
    options.draftBackgroundDarkenColor.value = nextBackgroundDarkenColor;
    options.draftBackgroundAcrylicAppearance.value = nextBackgroundAcrylicAppearance;
    options.draftBackgroundAcrylicDarkParams.value = nextBackgroundAcrylicDarkParams;
    options.draftBackgroundAcrylicLightParams.value = nextBackgroundAcrylicLightParams;
    options.draftBackgroundImagePath.value = nextBackgroundImagePath;
    options.draftBackgroundImageUrl.value = nextBackgroundImageUrl;
    options.hiddenAppIds.value = Array.isArray(settings.hiddenAppIds)
      ? settings.hiddenAppIds.map(String)
      : [];
    options.scanRoots.value = normalizeScanRoots(settings.scanRoots);
    options.scanKeywordBlacklist.value = Array.isArray(settings.scanKeywordBlacklist)
      ? normalizeScanKeywordBlacklist(settings.scanKeywordBlacklist)
      : [...DEFAULT_SCAN_KEYWORD_BLACKLIST];
    options.scanAppBlacklist.value = normalizeScanAppBlacklist(settings.scanAppBlacklist);
    options.showMissingLaunchTargetBadge.value = settings.showMissingLaunchTargetBadge !== false;
  }

  function clearNativeSaveTimer() {
    if (nativeSaveTimer) window.clearTimeout(nativeSaveTimer);
    nativeSaveTimer = null;
  }

  function clearNativeWindowHideTimer() {
    if (nativeWindowHideTimer) window.clearTimeout(nativeWindowHideTimer);
    nativeWindowHideTimer = null;
  }

  function clearNativeWallpaperRefreshTimer() {
    if (nativeWallpaperRefreshTimer) window.clearTimeout(nativeWallpaperRefreshTimer);
    nativeWallpaperRefreshTimer = null;
  }

  function clearLiveDesktopIdleStopTimer() {
    if (liveDesktopIdleStopTimer) window.clearTimeout(liveDesktopIdleStopTimer);
    liveDesktopIdleStopTimer = null;
  }

  function createCurrentLayoutSnapshot() {
    return options.createLayoutSnapshot({
      pages: options.pages.value,
      gridRows: options.gridRows.value,
      gridCols: options.gridCols.value,
      folderRows: options.folderRows.value,
      folderCols: options.folderCols.value,
      iconSize: options.iconSize.value,
      folderIconSizeMode: options.folderIconSizeMode.value,
      folderIconSize: options.folderIconSize.value,
      textless: options.isTextlessMode.value,
      hiddenAppIds: options.hiddenAppIds.value,
      scanRoots: options.scanRoots.value,
      scanKeywordBlacklist: options.scanKeywordBlacklist.value,
      scanAppBlacklist: options.scanAppBlacklist.value,
      showMissingLaunchTargetBadge: options.showMissingLaunchTargetBadge.value,
      backgroundBaseColor: options.backgroundBaseColor.value,
      backgroundBaseOpacity: options.backgroundBaseOpacity.value,
      backgroundSource: options.backgroundSource.value,
      backgroundEffect: options.backgroundEffect.value,
      backgroundImageOpacity: options.backgroundImageOpacity.value,
      backgroundLiveDesktopOpacity: options.backgroundLiveDesktopOpacity.value,
      backgroundImageLayout: options.backgroundImageLayout.value,
      backgroundBlurStrength: options.backgroundBlurStrength.value,
      backgroundDarkenStrength: options.backgroundDarkenStrength.value,
      backgroundDarkenColor: options.backgroundDarkenColor.value,
      backgroundAcrylicAppearance: options.backgroundAcrylicAppearance.value,
      backgroundAcrylicDarkParams: options.backgroundAcrylicDarkParams.value,
      backgroundAcrylicLightParams: options.backgroundAcrylicLightParams.value,
      backgroundImagePath: options.backgroundImagePath.value,
      windowEffectMaterial: options.windowEffectMaterial.value,
      windowEffectAppearance: options.windowEffectAppearance.value,
    });
  }

  function layoutSignature(layout) {
    return JSON.stringify(layout);
  }

  async function saveCurrentNativeLayout() {
    const layout = createCurrentLayoutSnapshot();
    const signature = layoutSignature(layout);
    const saveDirtyRevision = launchCriticalDirtyRevision;
    if (signature === lastSavedLayoutSignature) {
      if (saveDirtyRevision === launchCriticalDirtyRevision) launchCriticalDirtyAppIds.clear();
      return true;
    }

    try {
      await saveLayout(layout);
      lastSavedLayoutSignature = signature;
      if (saveDirtyRevision === launchCriticalDirtyRevision) launchCriticalDirtyAppIds.clear();
      if (hadNativeSaveFailure) options.showLayoutSaveRecovered?.();
      hadNativeSaveFailure = false;
      nativeSaveFailureCount = 0;
      return true;
    } catch (error) {
      hadNativeSaveFailure = true;
      nativeSaveFailureCount += 1;
      options.showLayoutSaveFailed?.({
        error,
        retryCount: nativeSaveFailureCount,
        onRetry: retryNativeLayoutSave,
      });
      console.error("Failed to save LaunchPad layout", error);
      return false;
    }
  }

  function runNativeLayoutSave() {
    if (!nativeSavePromise) {
      nativeSavePromise = saveCurrentNativeLayout()
        .finally(() => {
          nativeSavePromise = null;
        });
    }
    return nativeSavePromise;
  }

  function saveLaunchCriticalLayout() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return true;
    clearNativeSaveTimer();
    return runNativeLayoutSave().then((saved) => {
      if (!saved || !launchCriticalDirtyAppIds.size) return saved;
      return saveLaunchCriticalLayout();
    });
  }

  function markLaunchCriticalLayoutDirty(appId) {
    const id = String(appId || "").trim();
    if (id) launchCriticalDirtyAppIds.add(id);
    launchCriticalDirtyRevision += 1;
    return saveLaunchCriticalLayout();
  }

  function prepareNativeLaunch(app) {
    if (!shouldUseNativeCatalog()) return true;
    const appId = String(app?.id || "").trim();
    if (!appId || !launchCriticalDirtyAppIds.has(appId)) return true;
    return saveLaunchCriticalLayout();
  }

  function retryNativeLayoutSave() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return Promise.resolve(false);
    clearNativeSaveTimer();
    return runNativeLayoutSave();
  }

  function retryNativeLayoutLoad() {
    if (!shouldUseNativeCatalog()) return Promise.resolve();
    return loadNativeLaunchpadData();
  }

  function finishNativeLayoutLoad() {
    nativeLayoutReady = true;
    isNativeLayoutReady.value = true;
    if (hadNativeLoadFailure) options.showLayoutLoadRecovered?.();
    hadNativeLoadFailure = false;
    nativeLoadFailureCount = 0;
    hydrateCachedAppIcons();
    options.schedulePageGridMetrics();
    scheduleLaunchTargetStatusCheck();
    setNativeWindowEffectsEnabled(true);
    syncWindowsWallpaperRefreshTimer();
    syncLiveDesktopBackgroundRuntime();
  }

  function scheduleNativeLayoutSave() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return;
    clearNativeSaveTimer();
    nativeSaveTimer = window.setTimeout(async () => {
      nativeSaveTimer = null;
      await runNativeLayoutSave();
    }, 320);
  }

  async function flushNativeLayoutSave() {
    if (!nativeLayoutReady || !shouldUseNativeCatalog()) return true;
    clearNativeSaveTimer();
    let saved = await runNativeLayoutSave();
    if (!saved) return false;
    if (layoutSignature(createCurrentLayoutSnapshot()) === lastSavedLayoutSignature) return true;
    saved = await runNativeLayoutSave();
    return Boolean(saved);
  }

  async function refreshWindowsWallpaperBackground() {
    if (options.backgroundSource.value !== BACKGROUND_SOURCE_WINDOWS_WALLPAPER) return false;
    try {
      const selected = await getDesktopWallpaperBackground();
      const imagePath = normalizeBackgroundImagePath(selected?.imagePath);
      if (!imagePath) return false;
      const imageUrl = convertFilePathToAssetUrl(imagePath);
      if (options.backgroundImagePath.value === imagePath && options.backgroundImageUrl.value === imageUrl) {
        return false;
      }
      options.backgroundImagePath.value = imagePath;
      options.backgroundImageUrl.value = imageUrl;
      if (options.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER) {
        options.draftBackgroundImagePath.value = imagePath;
        options.draftBackgroundImageUrl.value = imageUrl;
      }
      return true;
    } catch (error) {
      console.error("Failed to refresh Windows desktop wallpaper background", error);
      return false;
    }
  }

  function shouldPollWindowsWallpaperBackground() {
    return Boolean(
      isNativeBridgeAvailable()
      && options.isDesktopOpen.value
      && options.backgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER
    );
  }

  function syncWindowsWallpaperRefreshTimer() {
    clearNativeWallpaperRefreshTimer();
    if (!shouldPollWindowsWallpaperBackground()) return;
    nativeWallpaperRefreshTimer = window.setTimeout(async () => {
      nativeWallpaperRefreshTimer = null;
      const changed = await refreshWindowsWallpaperBackground();
      if (changed) scheduleNativeLayoutSave();
      syncWindowsWallpaperRefreshTimer();
    }, WINDOWS_WALLPAPER_REFRESH_INTERVAL_MS);
  }

  function canUseActiveLiveDesktopBackground() {
    return Boolean(
      isNativeBridgeAvailable()
      && isLiveDesktopExperimentEnabled()
      && backgroundSourceUsesLiveDesktop(options.backgroundSource.value)
      && normalizeLiveDesktopBackgroundSupport(options.liveDesktopBackgroundSupport.value).supportsLiveDesktopBackground
    );
  }

  function shouldRunLiveDesktopBackground() {
    return Boolean(options.isDesktopOpen.value && canUseActiveLiveDesktopBackground());
  }

  function shouldKeepLiveDesktopBackgroundWarm(status) {
    return Boolean(
      !options.isDesktopOpen.value
      && canUseActiveLiveDesktopBackground()
      && liveDesktopRuntimeStatusIsRunning(status)
    );
  }

  function liveDesktopRuntimeSyncIsCurrent(generation) {
    return generation === liveDesktopRuntimeSyncGeneration;
  }

  function resetLiveDesktopRuntimeForUnavailableBridge() {
    options.liveDesktopRuntimeStatus.value = normalizeLiveDesktopRuntimeStatus(null);
    liveDesktopBackgroundVisible = null;
    return options.liveDesktopRuntimeStatus.value;
  }

  function resetLiveDesktopRuntimeForDisabledExperiment() {
    options.liveDesktopRuntimeStatus.value = normalizeLiveDesktopRuntimeStatus({
      reason: LIVE_DESKTOP_EXPERIMENT_DISABLED_REASON,
      detail: LIVE_DESKTOP_EXPERIMENT_DISABLED_DETAIL,
    });
    liveDesktopBackgroundVisible = null;
    return options.liveDesktopRuntimeStatus.value;
  }

  function enqueueLiveDesktopRuntimeSync(task) {
    const generation = ++liveDesktopRuntimeSyncGeneration;
    liveDesktopRuntimeSync = liveDesktopRuntimeSync
      .catch(() => {})
      .then(() => task(generation));
    return liveDesktopRuntimeSync;
  }

  function scheduleLiveDesktopIdleStop() {
    clearLiveDesktopIdleStopTimer();
    const generation = liveDesktopRuntimeSyncGeneration;
    liveDesktopIdleStopTimer = window.setTimeout(() => {
      liveDesktopIdleStopTimer = null;
      liveDesktopRuntimeSync = liveDesktopRuntimeSync
        .catch(() => {})
        .then(async () => {
          if (!liveDesktopRuntimeSyncIsCurrent(generation)) return options.liveDesktopRuntimeStatus.value;
          if (shouldRunLiveDesktopBackground()) return options.liveDesktopRuntimeStatus.value;
          const current = normalizeLiveDesktopRuntimeStatus(options.liveDesktopRuntimeStatus.value);
          if (liveDesktopRuntimeStatusIsStopped(current)) return current;
          return stopNativeLiveDesktopBackground();
        });
      return liveDesktopRuntimeSync;
    }, LIVE_DESKTOP_IDLE_STOP_DELAY_MS);
  }

  function syncLiveDesktopBackgroundRuntime() {
    return enqueueLiveDesktopRuntimeSync(async (generation) => {
      if (!liveDesktopRuntimeSyncIsCurrent(generation)) return options.liveDesktopRuntimeStatus.value;
      if (!isLiveDesktopExperimentEnabled()) {
        clearLiveDesktopIdleStopTimer();
        return resetLiveDesktopRuntimeForDisabledExperiment();
      }
      if (!isNativeBridgeAvailable()) {
        return resetLiveDesktopRuntimeForUnavailableBridge();
      }
      if (!shouldRunLiveDesktopBackground()) {
        const current = normalizeLiveDesktopRuntimeStatus(options.liveDesktopRuntimeStatus.value);
        if (shouldKeepLiveDesktopBackgroundWarm(current)) {
          await setNativeLiveDesktopBackgroundVisible(false);
          if (!liveDesktopRuntimeSyncIsCurrent(generation)) return options.liveDesktopRuntimeStatus.value;
          scheduleLiveDesktopIdleStop();
          return options.liveDesktopRuntimeStatus.value;
        }
        clearLiveDesktopIdleStopTimer();
        if (liveDesktopRuntimeStatusIsStopped(current)) return current;
        return stopNativeLiveDesktopBackground();
      }
      clearLiveDesktopIdleStopTimer();
      const current = normalizeLiveDesktopRuntimeStatus(options.liveDesktopRuntimeStatus.value);
      if (liveDesktopRuntimeStatusIsRunning(current)) {
        await setNativeLiveDesktopBackgroundVisible(true);
        if (!liveDesktopRuntimeSyncIsCurrent(generation)) return options.liveDesktopRuntimeStatus.value;
        return configureNativeLiveDesktopBackground();
      }
      return startNativeLiveDesktopBackground();
    });
  }

  function restartLiveDesktopBackgroundRuntime() {
    return enqueueLiveDesktopRuntimeSync(async (generation) => {
      if (!liveDesktopRuntimeSyncIsCurrent(generation)) return options.liveDesktopRuntimeStatus.value;
      if (!isLiveDesktopExperimentEnabled()) {
        clearLiveDesktopIdleStopTimer();
        return resetLiveDesktopRuntimeForDisabledExperiment();
      }
      if (!isNativeBridgeAvailable()) {
        return resetLiveDesktopRuntimeForUnavailableBridge();
      }
      clearLiveDesktopIdleStopTimer();
      if (!shouldRunLiveDesktopBackground()) return stopNativeLiveDesktopBackground();
      const current = normalizeLiveDesktopRuntimeStatus(options.liveDesktopRuntimeStatus.value);
      if (liveDesktopRuntimeStatusIsRunning(current)) {
        await stopNativeLiveDesktopBackground();
      }
      if (!liveDesktopRuntimeSyncIsCurrent(generation)) return options.liveDesktopRuntimeStatus.value;
      return startNativeLiveDesktopBackground();
    });
  }

  async function loadNativeLaunchpadData() {
    if (!shouldUseNativeCatalog()) return;
    isNativeLayoutReady.value = false;

    try {
      await refreshNativeWindowEffectsSupport();
      await refreshLiveDesktopBackgroundSupport();
      const savedLayout = await loadLayout();
      if (!savedLayout) {
        options.pages.value = [[]];
        const nativeApps = await scanInitialNativeApps();
        options.pages.value = options.mergeNativeCatalogWithSavedLayout(
          nativeApps,
          { version: 1, pages: [] },
          options.hiddenAppIds.value
        );
        options.pages.value = applyCachedIconAssetUrls(options.pages.value);
        options.commitPageIndex(options.pageIndex.value);
        options.commitSearchPageIndex(options.searchPageIndex.value);
        options.commitFolderPageIndex(options.folderPageIndex.value);
        finishNativeLayoutLoad();
        scheduleNativeLayoutSave();
        return;
      }

      applyLayoutSettings(savedLayout?.settings);
      const refreshedWallpaperBackground = await refreshWindowsWallpaperBackground();
      options.pages.value = options.mergeNativeCatalogWithSavedLayout(
        [],
        savedLayout,
        options.hiddenAppIds.value
      );
      options.pages.value = applyCachedIconAssetUrls(options.pages.value);
      options.commitPageIndex(options.pageIndex.value);
      options.commitSearchPageIndex(options.searchPageIndex.value);
      options.commitFolderPageIndex(options.folderPageIndex.value);
      finishNativeLayoutLoad();
      if (refreshedWallpaperBackground) scheduleNativeLayoutSave();
    } catch (error) {
      nativeLayoutReady = false;
      isNativeLayoutReady.value = false;
      hadNativeLoadFailure = true;
      nativeLoadFailureCount += 1;
      options.showLayoutLoadFailed?.({
        error,
        retryCount: nativeLoadFailureCount,
        onRetry: retryNativeLayoutLoad,
      });
      console.error("Failed to load native LaunchPad data", error);
    }
  }

  async function refreshNativeWindowEffectsSupport() {
    if (!isNativeBridgeAvailable()) {
      applyNativeWindowEffectsSupport(DEFAULT_WINDOW_EFFECTS_SUPPORT);
      return;
    }
    try {
      applyNativeWindowEffectsSupport(await getMainWindowEffectsSupport());
    } catch (error) {
      applyNativeWindowEffectsSupport(DEFAULT_WINDOW_EFFECTS_SUPPORT);
      console.error("Failed to load LaunchPad window effects support", error);
    }
  }

  async function refreshLiveDesktopBackgroundSupport() {
    if (!isLiveDesktopExperimentEnabled()) {
      options.liveDesktopBackgroundSupport.value = normalizeLiveDesktopBackgroundSupport({
        reason: LIVE_DESKTOP_EXPERIMENT_DISABLED_REASON,
        detail: LIVE_DESKTOP_EXPERIMENT_DISABLED_DETAIL,
      });
      return;
    }
    if (!isNativeBridgeAvailable()) {
      options.liveDesktopBackgroundSupport.value = normalizeLiveDesktopBackgroundSupport(null);
      return;
    }
    try {
      options.liveDesktopBackgroundSupport.value = normalizeLiveDesktopBackgroundSupport(
        await getLiveDesktopBackgroundSupport()
      );
    } catch (error) {
      options.liveDesktopBackgroundSupport.value = normalizeLiveDesktopBackgroundSupport(null);
      console.error("Failed to load live desktop background support", error);
    }
  }

  async function refreshLiveDesktopRuntimeStatus() {
    if (!isLiveDesktopExperimentEnabled()) {
      return resetLiveDesktopRuntimeForDisabledExperiment();
    }
    if (!isNativeBridgeAvailable()) {
      return resetLiveDesktopRuntimeForUnavailableBridge();
    }
    try {
      options.liveDesktopRuntimeStatus.value = normalizeLiveDesktopRuntimeStatus(
        await getLiveDesktopRuntimeStatus()
      );
    } catch (error) {
      options.liveDesktopRuntimeStatus.value = normalizeLiveDesktopRuntimeStatus(null);
      console.error("Failed to load live desktop runtime status", error);
    }
    return options.liveDesktopRuntimeStatus.value;
  }

  async function setNativeLiveDesktopBackgroundVisible(visible) {
    if (!isLiveDesktopExperimentEnabled()) {
      return resetLiveDesktopRuntimeForDisabledExperiment();
    }
    if (liveDesktopBackgroundVisible === visible) return options.liveDesktopRuntimeStatus.value;
    if (!isNativeBridgeAvailable()) {
      return resetLiveDesktopRuntimeForUnavailableBridge();
    }
    try {
      options.liveDesktopRuntimeStatus.value = normalizeLiveDesktopRuntimeStatus(
        await setLiveDesktopBackgroundVisible(visible)
      );
      liveDesktopBackgroundVisible = visible;
    } catch (error) {
      console.error("Failed to update live desktop background visibility", error);
    }
    return options.liveDesktopRuntimeStatus.value;
  }

  async function configureNativeLiveDesktopBackground() {
    if (!isLiveDesktopExperimentEnabled()) {
      return resetLiveDesktopRuntimeForDisabledExperiment();
    }
    if (!isNativeBridgeAvailable()) {
      return resetLiveDesktopRuntimeForUnavailableBridge();
    }
    try {
      options.liveDesktopRuntimeStatus.value = normalizeLiveDesktopRuntimeStatus(
        await configureLiveDesktopBackground(makeLiveDesktopRuntimeConfig(options))
      );
    } catch (error) {
      options.liveDesktopRuntimeStatus.value = {
        ...normalizeLiveDesktopRuntimeStatus(options.liveDesktopRuntimeStatus.value),
        active: false,
        phase: "failed",
        reason: "configureFailed",
        detail: String(error?.message || error || ""),
      };
      console.error("Failed to configure live desktop background", error);
    }
    return options.liveDesktopRuntimeStatus.value;
  }

  async function startNativeLiveDesktopBackground() {
    clearLiveDesktopIdleStopTimer();
    if (!isLiveDesktopExperimentEnabled()) {
      return resetLiveDesktopRuntimeForDisabledExperiment();
    }
    if (!isNativeBridgeAvailable()) {
      return resetLiveDesktopRuntimeForUnavailableBridge();
    }
    try {
      await configureLiveDesktopBackground(makeLiveDesktopRuntimeConfig(options));
      options.liveDesktopRuntimeStatus.value = normalizeLiveDesktopRuntimeStatus(
        await startLiveDesktopBackground()
      );
      liveDesktopBackgroundVisible = liveDesktopRuntimeStatusIsRunning(
        options.liveDesktopRuntimeStatus.value
      )
        ? true
        : null;
    } catch (error) {
      options.liveDesktopRuntimeStatus.value = {
        ...normalizeLiveDesktopRuntimeStatus(options.liveDesktopRuntimeStatus.value),
        active: false,
        phase: "failed",
        reason: "startFailed",
        detail: String(error?.message || error || ""),
      };
      console.error("Failed to start live desktop background", error);
    }
    return options.liveDesktopRuntimeStatus.value;
  }

  async function stopNativeLiveDesktopBackground() {
    clearLiveDesktopIdleStopTimer();
    if (!isLiveDesktopExperimentEnabled()) {
      return resetLiveDesktopRuntimeForDisabledExperiment();
    }
    if (!isNativeBridgeAvailable()) {
      return resetLiveDesktopRuntimeForUnavailableBridge();
    }
    try {
      options.liveDesktopRuntimeStatus.value = normalizeLiveDesktopRuntimeStatus(
        await stopLiveDesktopBackground()
      );
      liveDesktopBackgroundVisible = null;
    } catch (error) {
      options.liveDesktopRuntimeStatus.value = {
        ...normalizeLiveDesktopRuntimeStatus(options.liveDesktopRuntimeStatus.value),
        active: false,
        phase: "failed",
        reason: "stopFailed",
        detail: String(error?.message || error || ""),
      };
      console.error("Failed to stop live desktop background", error);
    }
    return options.liveDesktopRuntimeStatus.value;
  }

  function applyNativeWindowEffectsSupport(support) {
    const normalizedSupport = normalizeWindowEffectsSupport(support);
    options.windowEffectsSupport.value = normalizedSupport;
    const nextMaterial = resolveWindowEffectMaterialForSupport(
      options.windowEffectMaterial.value,
      normalizedSupport
    );
    const nextAppearance = normalizeWindowEffectAppearance(options.windowEffectAppearance.value);
    options.windowEffectMaterial.value = nextMaterial;
    options.windowEffectAppearance.value = nextAppearance;
    options.draftWindowEffectMaterial.value = nextMaterial;
    options.draftWindowEffectAppearance.value = nextAppearance;
  }

  async function scanInitialNativeApps() {
    const enabledRoots = normalizeScanRoots(options.scanRoots.value).filter((root) => root.enabled);
    if (!enabledRoots.length) return [];
    const scanFilters = {
      keywordBlacklist: normalizeScanKeywordBlacklist(options.scanKeywordBlacklist.value),
      appBlacklist: normalizeScanAppBlacklist(options.scanAppBlacklist.value),
    };
    const nativeApps = await scanApps(enabledRoots, scanFilters);
    if (nativeApps?.warnings?.length) {
      console.warn("LaunchPad scan completed with warnings", nativeApps.warnings);
    }
    const now = new Date().toISOString();
    const scannedRootIds = new Set(enabledRoots.map((root) => root.id));
    options.scanRoots.value = options.scanRoots.value.map((root) =>
      scannedRootIds.has(root.id) ? { ...root, lastScannedAt: now } : root
    );
    return (nativeApps?.apps || [])
      .map(normalizeNativeApp)
      .filter((app) => !isAppBlockedByScanBlacklist(app, scanFilters.appBlacklist));
  }

  function applyCachedIconAssetUrls(sourcePages) {
    return options.clonePages(sourcePages).map((page) =>
      page.map(applyCachedIconAssetUrlToItem)
    );
  }

  function applyCachedIconAssetUrlToItem(item) {
    if (!item) return item;
    if (item.type === "app") {
      const iconUrl = item.iconPath ? convertFilePathToAssetUrl(item.iconPath) : null;
      const customIconUrl = item.customIconPath ? convertFilePathToAssetUrl(item.customIconPath) : null;
      if (iconUrl || customIconUrl) return { ...item, iconUrl, customIconUrl };
      return item;
    }
    if (item.type !== "folder") return item;
    const childPages = (item.childPages || []).map((page) =>
      (page || []).map(applyCachedIconAssetUrlToItem)
    );
    return {
      ...item,
      childPages,
      children: childPages.flat().filter(Boolean).map(options.cloneItem),
    };
  }

  async function hydrateCachedAppIcons() {
    if (!isNativeBridgeAvailable()) return;
    const requests = collectIconHydrationRequests();
    if (!requests.length) return;
    const batchSize = getIconHydrationBatchSize();
    for (let index = 0; index < requests.length; index += batchSize) {
      const batch = requests.slice(index, index + batchSize);
      try {
        const results = await loadCachedAppIcons(batch.map((item) => ({ id: item.id, iconPath: item.iconPath })));
        const requestById = new Map(batch.map((item) => [item.id, item]));
        const iconDataById = collectHydratedIconDataByAppId(results, requestById);
        if (!iconDataById.size) continue;
        options.pages.value = applyCachedIconDataUrls(options.pages.value, iconDataById);
        options.schedulePageGridMetrics();
      } catch (error) {
        console.error("Failed to load cached LaunchPad icons", error);
      }
    }
  }

  function collectIconHydrationRequests() {
    const requests = [];
    for (const app of options.collectAppsFromPages(options.pages.value)) {
      if (!app?.id) continue;
      if (app.iconPath && !app.iconDataUrl) {
        requests.push({
          appId: app.id,
          id: app.id,
          iconPath: app.iconPath,
          kind: "catalog",
        });
      }
      if (app.customIconPath && !app.customIconDataUrl) {
        requests.push({
          appId: app.id,
          id: `${CUSTOM_ICON_HYDRATION_ID_PREFIX}${app.id}`,
          iconPath: app.customIconPath,
          kind: "custom",
        });
      }
    }
    return requests;
  }

  function collectHydratedIconDataByAppId(results, requestById) {
    const iconDataById = new Map();
    for (const item of results || []) {
      if (!item?.id || !item.iconDataUrl) continue;
      const request = requestById.get(item.id);
      if (!request) continue;
      let record = iconDataById.get(request.appId);
      if (!record) {
        record = {};
        iconDataById.set(request.appId, record);
      }
      record[request.kind] = {
        iconDataUrl: item.iconDataUrl,
        iconPath: request.iconPath,
      };
    }
    return iconDataById;
  }

  function getIconHydrationBatchSize() {
    const pageCapacity = Number(options.gridRows.value) * Number(options.gridCols.value);
    if (!Number.isFinite(pageCapacity) || pageCapacity <= 0) {
      return MIN_ICON_HYDRATION_BATCH_SIZE;
    }
    return clamp(
      Math.floor(pageCapacity),
      MIN_ICON_HYDRATION_BATCH_SIZE,
      MAX_ICON_HYDRATION_BATCH_SIZE
    );
  }

  function applyCachedIconDataUrls(sourcePages, iconDataById) {
    return options.clonePages(sourcePages).map((page) =>
      page.map((item) => applyCachedIconDataUrlToItem(item, iconDataById))
    );
  }

  function applyCachedIconDataUrlToItem(item, iconDataById) {
    if (!item) return item;
    if (item.type === "app") {
      const iconData = iconDataById.get(item.id);
      if (!iconData) return item;
      const next = { ...item };
      if (iconData.catalog?.iconDataUrl && iconData.catalog.iconPath === item.iconPath) {
        next.iconDataUrl = iconData.catalog.iconDataUrl;
      }
      if (iconData.custom?.iconDataUrl && iconData.custom.iconPath === item.customIconPath) {
        next.customIconDataUrl = iconData.custom.iconDataUrl;
      }
      return next;
    }
    if (item.type !== "folder") return item;
    const childPages = (item.childPages || []).map((page) =>
      (page || []).map((child) => applyCachedIconDataUrlToItem(child, iconDataById))
    );
    return {
      ...item,
      childPages,
      children: childPages.flat().filter(Boolean).map(options.cloneItem),
    };
  }

  function scheduleLaunchTargetStatusCheck() {
    const requestId = (launchTargetStatusCheckRequestId += 1);
    if (!options.showMissingLaunchTargetBadge.value || !isNativeBridgeAvailable()) {
      clearLaunchTargetStatuses();
      return;
    }
    pruneLaunchTargetStatusesForCurrentApps();
    window.setTimeout(() => checkCurrentLaunchTargets(requestId), 0);
  }

  async function checkCurrentLaunchTargets(requestId) {
    if (requestId !== launchTargetStatusCheckRequestId) return;
    if (!options.showMissingLaunchTargetBadge.value || !isNativeBridgeAvailable()) return;
    const apps = collectLaunchTargetChecks();
    if (!apps.length) {
      if (requestId !== launchTargetStatusCheckRequestId) return;
      clearLaunchTargetStatuses();
      return;
    }
    const targetSignatureById = new Map(apps.map((app) => [app.id, app.targetSignature]));
    try {
      const results = await checkLaunchTargets(
        apps.map((app) => ({ id: app.id, launchTarget: app.launchTarget }))
      );
      if (requestId !== launchTargetStatusCheckRequestId || !options.showMissingLaunchTargetBadge.value) return;
      const currentSignatureById = new Map(
        collectLaunchTargetChecks().map((app) => [app.id, app.targetSignature])
      );
      launchTargetStatusRecordsById = Object.fromEntries(
        (results || [])
          .map((result) => {
            const id = String(result?.id || "");
            const targetSignature = targetSignatureById.get(id);
            if (!id || !targetSignature || currentSignatureById.get(id) !== targetSignature) return null;
            return [id, { status: result.status, targetSignature }];
          })
          .filter(Boolean)
      );
      pruneLaunchTargetStatusesForCurrentApps();
    } catch (error) {
      console.error("Failed to check LaunchPad app paths", error);
    }
  }

  function collectLaunchTargetChecks() {
    return options.collectAppsFromPages(options.pages.value)
      .filter((app) => app?.id && app.launchTarget)
      .map((app) => ({
        id: String(app.id),
        launchTarget: app.launchTarget,
        targetSignature: launchTargetSignature(app.launchTarget),
      }));
  }

  function launchTargetSignature(launchTarget) {
    return JSON.stringify([
      String(launchTarget?.kind || ""),
      String(launchTarget?.path || "").trim(),
      String(launchTarget?.appUserModelId || "").trim(),
    ]);
  }

  function clearLaunchTargetStatuses() {
    launchTargetStatusRecordsById = {};
    options.launchTargetStatusById.value = {};
  }

  function pruneLaunchTargetStatusesForCurrentApps() {
    const currentSignatureById = new Map(
      collectLaunchTargetChecks().map((app) => [app.id, app.targetSignature])
    );
    const nextRecords = {};
    const nextStatuses = {};
    for (const [id, record] of Object.entries(launchTargetStatusRecordsById)) {
      if (currentSignatureById.get(id) !== record.targetSignature) continue;
      nextRecords[id] = record;
      nextStatuses[id] = record.status;
    }
    launchTargetStatusRecordsById = nextRecords;
    options.launchTargetStatusById.value = nextStatuses;
  }

  function getLaunchTargetStatus(app) {
    const id = String(app?.id || "");
    const record = launchTargetStatusRecordsById[id];
    if (!record || record.targetSignature !== launchTargetSignature(app?.launchTarget)) return null;
    return record.status;
  }

  async function launchNativeAppIfAvailable(app) {
    if (!shouldUseNativeCatalog()) return;
    try {
      await launchNativeApp(app);
      return true;
    } catch (error) {
      console.error(`Failed to launch ${app.name}`, error);
      return normalizeLaunchErrorReport(error, app);
    }
  }

  function normalizeLaunchErrorReport(error, app) {
    const fallbackName = String(app?.name || "此应用").trim() || "此应用";
    if (error && typeof error === "object" && typeof error.message === "string") {
      return {
        kind: String(error.kind || "windowsLaunchFailed"),
        title: String(error.title || "无法打开应用"),
        message: error.message,
        suggestion: String(error.suggestion || "请确认目标程序可以从资源管理器正常打开。"),
        detail: String(error.detail || ""),
      };
    }
    return {
      kind: "windowsLaunchFailed",
      title: "无法打开应用",
      message: `无法打开“${fallbackName}”。\n\nWindows 未能打开此应用。`,
      suggestion: "请确认目标程序可以从资源管理器正常打开。",
      detail: String(error?.message || error || ""),
    };
  }

  async function showNativeLaunchError(error) {
    if (!shouldUseNativeCatalog() || !error) return false;
    try {
      await showLaunchErrorMessage(error);
      return true;
    } catch (showError) {
      console.error("Failed to show LaunchPad launch error", showError);
      return false;
    }
  }

  function setNativeWindowEffectsEnabled(enabled) {
    if (!isNativeBridgeAvailable()) return;
    const openSequence = enabled ? null : nativeWindowOpenSequence;
    const material = resolveWindowEffectMaterialForSupport(
      options.windowEffectMaterial.value,
      options.windowEffectsSupport.value
    );
    const appearance = normalizeWindowEffectAppearance(options.windowEffectAppearance.value);
    nativeWindowEffectsUpdate = nativeWindowEffectsUpdate
      .catch(() => {})
      .then(() => setMainWindowEffectsEnabled(enabled, openSequence, { material, appearance }))
      .catch((error) => {
        console.error("Failed to update LaunchPad window effects", error);
      });
  }

  function registerNativeEventListeners() {
    if (!isNativeBridgeAvailable()) return Promise.resolve();
    clearNativeEventListeners();
    const generation = nativeEventListenerGeneration;
    const keepUnlisten = (setter) => (unlisten) => {
      if (generation !== nativeEventListenerGeneration) {
        unlisten?.();
        return;
      }
      setter(unlisten);
    };
    return Promise.all([
      listenNativeEvent("launchpad-open-desktop", openDesktopFromNativeShortcut)
        .then(keepUnlisten((unlisten) => {
          unlistenOpenDesktopEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native desktop open event", error);
        }),
      listenNativeEvent("launchpad-toggle-desktop", toggleDesktopFromNativeShortcut)
        .then(keepUnlisten((unlisten) => {
          unlistenToggleDesktopEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native desktop toggle event", error);
        }),
      listenNativeEvent("launchpad-close-desktop", closeDesktopFromNativeWindow)
        .then(keepUnlisten((unlisten) => {
          unlistenCloseDesktopEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native desktop close event", error);
        }),
      listenNativeEvent("launchpad-open-settings", options.openSettingsPanel)
        .then(keepUnlisten((unlisten) => {
          unlistenSettingsEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native settings event", error);
        }),
      listenNativeEvent("launchpad-layout-recovered", options.handleLayoutRecovered)
        .then(keepUnlisten((unlisten) => {
          unlistenLayoutRecoveredEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for layout recovery event", error);
        }),
      listenNativeEvent("launchpad-quit-requested", quitFromNativeRequest)
        .then(keepUnlisten((unlisten) => {
          unlistenQuitRequestedEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native quit event", error);
        }),
    ]);
  }

  function clearNativeEventListeners() {
    nativeEventListenerGeneration += 1;
    clearNativeWindowHideTimer();
    clearNativeWallpaperRefreshTimer();
    clearLiveDesktopIdleStopTimer();
    unlistenOpenDesktopEvent?.();
    unlistenOpenDesktopEvent = null;
    unlistenToggleDesktopEvent?.();
    unlistenToggleDesktopEvent = null;
    unlistenCloseDesktopEvent?.();
    unlistenCloseDesktopEvent = null;
    unlistenSettingsEvent?.();
    unlistenSettingsEvent = null;
    unlistenLayoutRecoveredEvent?.();
    unlistenLayoutRecoveredEvent = null;
    unlistenQuitRequestedEvent?.();
    unlistenQuitRequestedEvent = null;
  }

  function rememberNativeWindowOpenSequence(event) {
    const nextSequence = Number(event?.payload);
    if (Number.isFinite(nextSequence) && nextSequence > 0) {
      nativeWindowOpenSequence = nextSequence;
    }
  }

  function openDesktopFromNativeShortcut(event) {
    rememberNativeWindowOpenSequence(event);
    refreshWindowsWallpaperBackground().then((changed) => {
      if (changed) scheduleNativeLayoutSave();
    }).finally(syncWindowsWallpaperRefreshTimer);
    syncLiveDesktopBackgroundRuntime();
    clearNativeWindowHideTimer();
    if (options.isDesktopOpen.value) {
      options.focusDesktopSurface?.();
      return;
    }
    options.openDesktop();
  }

  function hideNativeWindowAfterCloseAnimation() {
    clearNativeWallpaperRefreshTimer();
    clearNativeWindowHideTimer();
    syncLiveDesktopBackgroundRuntime();
    nativeWindowHideTimer = window.setTimeout(async () => {
      nativeWindowHideTimer = null;
      await hideNativeWindow();
    }, DESKTOP_CLOSE_DURATION);
  }

  async function hideNativeWindow() {
    if (!isNativeBridgeAvailable()) return;
    clearNativeWindowHideTimer();
    try {
      await hideMainWindow();
    } catch (error) {
      console.error("Failed to hide LaunchPad window", error);
    }
  }

  function toggleDesktopFromNativeShortcut(event) {
    rememberNativeWindowOpenSequence(event);
    if (options.isDesktopOpen.value) {
      options.closeDesktop({ clearSearch: false });
      hideNativeWindowAfterCloseAnimation();
    } else {
      openDesktopFromNativeShortcut();
    }
  }

  function closeDesktopFromNativeWindow() {
    clearNativeWallpaperRefreshTimer();
    if (options.isDesktopOpen.value) {
      options.closeDesktop({ clearSearch: false });
    }
    hideNativeWindowAfterCloseAnimation();
  }

  async function quitFromNativeRequest() {
    if (quitRequestInProgress) return;
    quitRequestInProgress = true;
    let saved = false;
    try {
      saved = await flushNativeLayoutSave();
    } catch (error) {
      console.error("Failed to save LaunchPad layout before quit", error);
    } finally {
      try {
        await confirmQuitAfterSave(saved);
      } catch (error) {
        console.error("Failed to confirm LaunchPad quit", error);
        quitRequestInProgress = false;
      }
    }
  }

  return {
    clearNativeEventListeners,
    clearNativeSaveTimer,
    configureNativeLiveDesktopBackground,
    flushNativeLayoutSave,
    hideNativeWindow,
    hideNativeWindowAfterCloseAnimation,
    getLaunchTargetStatus,
    isNativeLayoutReady,
    loadNativeLaunchpadData,
    launchNativeAppIfAvailable,
    markLaunchCriticalLayoutDirty,
    prepareNativeLaunch,
    refreshLiveDesktopBackgroundSupport,
    refreshLiveDesktopRuntimeStatus,
    registerNativeEventListeners,
    scheduleNativeLayoutSave,
    scheduleLaunchTargetStatusCheck,
    setNativeWindowEffectsEnabled,
    showNativeLaunchError,
    startNativeLiveDesktopBackground,
    stopNativeLiveDesktopBackground,
    restartLiveDesktopBackgroundRuntime,
    syncLiveDesktopBackgroundRuntime,
    syncWindowsWallpaperRefreshTimer,
    shouldUseNativeCatalog,
  };
}
