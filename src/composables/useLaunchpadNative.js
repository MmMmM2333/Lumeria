import { nextTick, ref } from "vue";
import {
  DESKTOP_CLOSE_DURATION,
} from "./launchpadConstants.js";
import { createBackgroundEffectPlan } from "../domain/backgroundEffectPlan.js";
import { getKawaseDebugEffectPlanParams } from "../rendering/pixi/background/kawaseDebugParams.js";
import {
  backgroundAssetPort,
  layoutStorePort,
  nativeLifecyclePort,
} from "../platform/launchpadPorts.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
  backgroundSourceUsesLiveDesktop,
  clampBackgroundAcrylicBlurStrength,
  clampBackgroundBlurStrength,
  clampBackgroundDarkenStrength,
  clampBackgroundLiveDesktopOpacity,
  normalizeBackgroundAcrylicAppearance,
  normalizeBackgroundAcrylicParams,
  normalizeBackgroundDarkenColor,
  normalizeBackgroundEffect,
  normalizeBackgroundImagePath,
  normalizeWindowEffectAppearance,
} from "./useLaunchpadSettingsConfig.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import {
  DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS,
  readLiveDesktopDebugSettings,
} from "../diagnostics/liveDesktopDebugSettings.js";

const USE_MOCK_DATA_IN_NATIVE = false;
const WINDOWS_WALLPAPER_REFRESH_INTERVAL_MS = 5000;
// Pixi intentionally snaps monitor-resize layout for three frames. Keep the
// closed visual state through that window so the later open transition starts
// from its real initial values instead of being consumed behind DWM cloak.
const NATIVE_DISPLAY_CHANGE_SETTLE_FRAME_COUNT = 3;
const NATIVE_WINDOW_CLOSING_BLOCKED_EVENTS = [
  "pointerdown",
  "pointerup",
  "pointermove",
  "click",
  "dblclick",
  "contextmenu",
  "wheel",
  "keydown",
];
const NON_DESTRUCTIVE_CATALOG_WARNING_KINDS = new Set([
  "cycleSkipped",
  "iconExtractionFailed",
]);
const NATIVE_LAUNCH_FAILURE_COPY = Object.freeze({
  accessDenied: Object.freeze({
    reason: "errors.launch.reason.accessDenied",
    suggestion: "errors.launch.suggestion.checkPermission",
  }),
  appNotInstalled: Object.freeze({
    reason: "errors.launch.reason.packageMissing",
    suggestion: "errors.launch.suggestion.rescanOrRemove",
  }),
  brokenShortcut: Object.freeze({
    reason: "errors.launch.reason.shortcutInvalid",
    suggestion: "errors.launch.suggestion.replaceShortcut",
  }),
  layoutReadFailed: Object.freeze({
    reason: "errors.launch.reason.savedTargetInvalid",
    suggestion: "errors.launch.suggestion.rescanOrReadd",
  }),
  missingLaunchInfo: Object.freeze({
    reason: "errors.launch.reason.pathEmpty",
    suggestion: "errors.launch.suggestion.chooseTarget",
  }),
  noAssociation: Object.freeze({
    reason: "errors.launch.reason.noAssociation",
    suggestion: "errors.launch.suggestion.checkAssociation",
  }),
  targetNotFound: Object.freeze({
    reason: "errors.launch.reason.pathMissing",
    suggestion: "errors.launch.suggestion.editTarget",
  }),
  unsupportedTarget: Object.freeze({
    reason: "errors.launch.reason.unsupported",
    suggestion: "errors.launch.suggestion.supportedType",
  }),
  windowsLaunchFailed: Object.freeze({
    reason: "errors.launch.reason.windowsFailure",
    suggestion: "errors.launch.suggestion.checkExplorer",
  }),
});

function collectSavedCatalogReferenceIds(savedDocument) {
  const ids = new Set();
  const stack = Array.isArray(savedDocument?.pages) ? savedDocument.pages.flat() : [];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== "object") continue;
    if (item.type === "catalogApp") {
      const id = String(item.id || "").trim();
      if (id) ids.add(id);
      continue;
    }
    if (item.type === "folder" && Array.isArray(item.childPages)) {
      stack.push(...item.childPages.flat());
    }
  }
  return ids;
}

function assertCatalogRefreshCanRestoreDocument(savedDocument, scanResult, localizationText) {
  const savedCatalogIds = collectSavedCatalogReferenceIds(savedDocument);
  if (!savedCatalogIds.size) return;
  const currentCatalogIds = new Set((scanResult?.apps || []).map((app) => String(app?.id || "")));
  const missingCount = Array.from(savedCatalogIds).filter((id) => !currentCatalogIds.has(id)).length;
  if (!missingCount) return;
  const warnings = Array.isArray(scanResult?.warnings) ? scanResult.warnings : [];
  const mayBeIncomplete = Boolean(scanResult?.stats?.limitReached)
    || warnings.some((warning) => !NON_DESTRUCTIVE_CATALOG_WARNING_KINDS.has(String(warning?.kind || "")));
  if (!mayBeIncomplete) return;
  throw new Error(localizationText.t("errors.catalog.incomplete", { count: missingCount }));
}

function isLiveDesktopDebugRuntimeConfigEnabled() {
  return Boolean(import.meta.env?.DEV && isLiveDesktopExperimentEnabled());
}

function resolveLiveDesktopDebugRuntimeSettings() {
  if (!isLiveDesktopDebugRuntimeConfigEnabled() || typeof window === "undefined") {
    return DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS;
  }
  const snapshot = readLiveDesktopDebugSettings();
  if (snapshot.issues.length) {
    console.error("Live Desktop runtime debug settings were only partially read", snapshot.issues);
  }
  return snapshot.values;
}

function resolveLiveDesktopAcrylicProfile(config) {
  const appearance = normalizeBackgroundAcrylicAppearance(config.backgroundAcrylicAppearance);
  if (appearance !== BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM) return appearance;
  return normalizeWindowEffectAppearance(config.windowEffectAppearance) === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    ? BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    : BACKGROUND_ACRYLIC_APPEARANCE_DARK;
}

function makeLiveDesktopRuntimeConfig(config) {
  const debugSettings = resolveLiveDesktopDebugRuntimeSettings();
  const acrylicAppearance = normalizeBackgroundAcrylicAppearance(config.backgroundAcrylicAppearance);
  const acrylicProfile = resolveLiveDesktopAcrylicProfile(config);
  const acrylicParams = normalizeBackgroundAcrylicParams(
    acrylicProfile === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
      ? config.backgroundAcrylicLightParams
      : config.backgroundAcrylicDarkParams,
    acrylicProfile
  );
  const effect = normalizeBackgroundEffect(config.effect);
  const blurStrength = effect === BACKGROUND_EFFECT_ACRYLIC_WEBGL
    ? clampBackgroundAcrylicBlurStrength(config.backgroundAcrylicBlurStrength)
    : clampBackgroundBlurStrength(config.backgroundBlurStrength);
  return {
    effect,
    debugFrameSourceOverride: debugSettings.debugFrameSourceOverride,
    blurStrength,
    darkenStrength: clampBackgroundDarkenStrength(config.backgroundDarkenStrength),
    darkenColor: normalizeBackgroundDarkenColor(config.backgroundDarkenColor),
    acrylicAppearance,
    acrylicParams,
    effectPlan: createBackgroundEffectPlan({
      acrylicParams,
      blurStrength,
      dualKawaseParams: getKawaseDebugEffectPlanParams(),
      effect,
      opacity: config.backgroundLiveDesktopOpacity,
    }),
    disableMouseRelay: debugSettings.disableMouseRelay,
    skipBlankFrames: debugSettings.skipBlankFrames,
    forceDwmFlush: debugSettings.forceDwmFlush,
    opacity: clampBackgroundLiveDesktopOpacity(config.backgroundLiveDesktopOpacity),
  };
}

export function useLaunchpadNative(options) {
  const localizationText = options.localizationText;
  if (!localizationText || typeof localizationText.t !== "function") {
    throw new TypeError("useLaunchpadNative requires localizationText");
  }
  const document = options.document;
  if (
    typeof document?.capture !== "function"
    || typeof document?.createFromCatalog !== "function"
    || typeof document?.restoreConfiguration !== "function"
    || typeof document?.restorePages !== "function"
    || typeof document?.signature !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires a document coordinator");
  }
  const liveDesktopRuntime = options.liveDesktopRuntime;
  if (
    !liveDesktopRuntime?.support
    || !liveDesktopRuntime?.status
    || typeof liveDesktopRuntime.sync !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires liveDesktopRuntime");
  }
  const mainWindowRuntime = options.mainWindowRuntime;
  if (!mainWindowRuntime?.support || typeof mainWindowRuntime.refreshSupport !== "function") {
    throw new TypeError("useLaunchpadNative requires mainWindowRuntime");
  }
  const settings = options.settings;
  if (
    typeof settings?.captureLiveDesktopConfig !== "function"
    || typeof settings?.captureWindowPresentation !== "function"
    || typeof settings?.getBackgroundSource !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires settings native integration");
  }
  const apps = options.apps;
  if (
    typeof apps?.listLaunchTargets !== "function"
    || typeof apps?.scanInitialCatalog !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires apps native integration");
  }
  const store = options.store || layoutStorePort;
  const platform = options.platform || nativeLifecyclePort;
  const backgroundAssets = options.backgroundAssets || backgroundAssetPort;
  const notices = options.notices;
  if (
    typeof store?.load !== "function"
    || typeof store?.save !== "function"
    || typeof store?.confirmQuit !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires a layout store port");
  }
  if (
    typeof platform?.isAvailable !== "function"
    || typeof platform?.listen !== "function"
    || typeof platform?.checkLaunchTargets !== "function"
    || typeof platform?.launchApp !== "function"
    || typeof platform?.showLaunchError !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires a native lifecycle port");
  }
  if (typeof backgroundAssets?.getDesktopWallpaper !== "function" || typeof backgroundAssets?.toAssetUrl !== "function") {
    throw new TypeError("useLaunchpadNative requires a background asset port");
  }
  if (
    typeof notices?.showLayoutLoadFailed !== "function"
    || typeof notices?.showLayoutLoadRecovered !== "function"
    || typeof notices?.showLayoutSaveFailed !== "function"
    || typeof notices?.showLayoutSaveRecovered !== "function"
  ) {
    throw new TypeError("useLaunchpadNative requires layout notices");
  }
  let eventHandlers = null;
  let nativeLayoutReady = false;
  const isNativeLayoutReady = ref(!shouldUseNativeCatalog());
  const mainWindowDisplayRevision = ref(0);
  let nativeWindowRevealUpdate = Promise.resolve();
  let nativeSaveTimer = null;
  let nativeWindowHideTimer = null;
  let nativeWallpaperRefreshTimer = null;
  let hasRequestedStartupNativeWindowShow = false;
  let nativeWindowOpenSequence = null;
  let nativeWindowHideSequence = 0;
  let isNativeWindowClosingInteractionBlocked = false;
  let nativeEventListenerGeneration = 0;
  let nativeSavePromise = null;
  let launchCriticalDirtyRevision = 0;
  let launchTargetStatusCheckRequestId = 0;
  let launchTargetStatusCheckSignature = null;
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
    return platform.isAvailable() && !USE_MOCK_DATA_IN_NATIVE;
  }

  function registerEventHandlers(handlers) {
    if (eventHandlers) throw new Error("useLaunchpadNative event handlers are already registered");
    const requiredHandlers = [
      "closeDesktop",
      "closeSettingsPanel",
      "focusDesktopSurface",
      "handleLayoutRecovered",
      "hasRenderedFolder",
      "isDesktopOpen",
      "isSettingsPanelOpen",
      "openDesktop",
      "openSettingsPanel",
      "reclampLayoutPageIndices",
      "schedulePageGridMetrics",
      "startFolderZoomFadeClose",
    ];
    for (const name of requiredHandlers) {
      if (typeof handlers?.[name] !== "function") {
        throw new TypeError(`useLaunchpadNative requires event handler ${name}`);
      }
    }
    eventHandlers = Object.freeze({ ...handlers });
  }

  function requireEventHandlers() {
    if (!eventHandlers) throw new Error("useLaunchpadNative event handlers are not registered");
    return eventHandlers;
  }

  function clearNativeSaveTimer() {
    if (nativeSaveTimer) window.clearTimeout(nativeSaveTimer);
    nativeSaveTimer = null;
  }

  function clearNativeWindowHideTimer() {
    nativeWindowHideSequence += 1;
    setNativeWindowClosingInteractionBlocked(false);
    if (nativeWindowHideTimer) window.clearTimeout(nativeWindowHideTimer);
    nativeWindowHideTimer = null;
  }

  function suppressNativeWindowClosingInteraction(event) {
    if (!isNativeWindowClosingInteractionBlocked) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
  }

  function setNativeWindowClosingInteractionBlocked(blocked) {
    const nextBlocked = Boolean(blocked);
    if (isNativeWindowClosingInteractionBlocked === nextBlocked) return;
    isNativeWindowClosingInteractionBlocked = nextBlocked;
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const action = nextBlocked ? "addEventListener" : "removeEventListener";
    for (const eventName of NATIVE_WINDOW_CLOSING_BLOCKED_EVENTS) {
      const options = eventName === "wheel" ? { capture: true, passive: false } : true;
      window[action](eventName, suppressNativeWindowClosingInteraction, options);
    }
  }

  function clearNativeWallpaperRefreshTimer() {
    if (nativeWallpaperRefreshTimer) window.clearTimeout(nativeWallpaperRefreshTimer);
    nativeWallpaperRefreshTimer = null;
  }

  function createCurrentLayoutSnapshot() {
    return document.capture();
  }

  function layoutSignature(layout) {
    return document.signature(layout);
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
      await store.save(layout);
      lastSavedLayoutSignature = signature;
      if (saveDirtyRevision === launchCriticalDirtyRevision) launchCriticalDirtyAppIds.clear();
      if (hadNativeSaveFailure) notices.showLayoutSaveRecovered();
      hadNativeSaveFailure = false;
      nativeSaveFailureCount = 0;
      return true;
    } catch (error) {
      hadNativeSaveFailure = true;
      nativeSaveFailureCount += 1;
      notices.showLayoutSaveFailed({
        error,
        retryCount: nativeSaveFailureCount,
        onRetry: retryNativeLayoutSave,
      });
      console.error("Failed to save Lumeria layout", error);
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

  async function finishNativeLayoutLoad() {
    nativeLayoutReady = true;
    isNativeLayoutReady.value = true;
    if (hadNativeLoadFailure) notices.showLayoutLoadRecovered();
    hadNativeLoadFailure = false;
    nativeLoadFailureCount = 0;
    requireEventHandlers().schedulePageGridMetrics();
    scheduleLaunchTargetStatusCheck();
    setNativeWindowMode();
    setNativeWindowEffectsEnabled(true);
    syncWindowsWallpaperRefreshTimer();
    await syncLiveDesktopBackgroundRuntime();
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
    if (settings.getBackgroundSource() !== BACKGROUND_SOURCE_WINDOWS_WALLPAPER) return false;
    try {
      const selected = await backgroundAssets.getDesktopWallpaper();
      const imagePath = normalizeBackgroundImagePath(selected?.imagePath);
      if (!imagePath) return false;
      const imageUrl = backgroundAssets.toAssetUrl(imagePath);
      return settings.refreshDesktopWallpaper(imagePath, imageUrl);
    } catch (error) {
      console.error("Failed to refresh Windows desktop wallpaper background", error);
      return false;
    }
  }

  function shouldPollWindowsWallpaperBackground() {
    return Boolean(
      platform.isAvailable()
      && requireEventHandlers().isDesktopOpen()
      && settings.getBackgroundSource() === BACKGROUND_SOURCE_WINDOWS_WALLPAPER
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

  function makeLiveDesktopRuntimeRequest() {
    const config = settings.captureLiveDesktopConfig();
    return {
      enabled: backgroundSourceUsesLiveDesktop(config.backgroundSource),
      visible: requireEventHandlers().isDesktopOpen(),
      config: makeLiveDesktopRuntimeConfig(config),
    };
  }

  function reportLiveDesktopRuntimeOutcome(action, outcome) {
    if (!outcome.ok) console.error(`Failed to ${action} live desktop background`, outcome.error);
    return outcome.status;
  }

  async function syncLiveDesktopBackgroundRuntime() {
    const outcome = await liveDesktopRuntime.sync(makeLiveDesktopRuntimeRequest());
    return reportLiveDesktopRuntimeOutcome("sync", outcome);
  }

  async function restartLiveDesktopBackgroundRuntime() {
    const outcome = await liveDesktopRuntime.restart(makeLiveDesktopRuntimeRequest());
    return reportLiveDesktopRuntimeOutcome("restart", outcome);
  }

  async function loadNativeLaunchpadData() {
    if (!shouldUseNativeCatalog()) return;
    isNativeLayoutReady.value = false;

    try {
      await refreshNativeWindowEffectsSupport();
      await refreshLiveDesktopBackgroundSupport();
      const savedLayout = await store.load();
      if (!savedLayout) {
        const scanResult = await apps.scanInitialCatalog();
        document.createFromCatalog(scanResult.apps);
        requireEventHandlers().reclampLayoutPageIndices();
        await finishNativeLayoutLoad();
        scheduleNativeLayoutSave();
        return;
      }

      document.restoreConfiguration(savedLayout);
      const scanResult = await apps.scanInitialCatalog();
      assertCatalogRefreshCanRestoreDocument(savedLayout, scanResult, localizationText);
      document.restorePages(savedLayout, scanResult.apps);
      const shortcutOutcome = await settings.registerCurrentShortcut();
      if (!shortcutOutcome.ok) console.error("Failed to update Lumeria shortcut", shortcutOutcome.error);
      const refreshedWallpaperBackground = await refreshWindowsWallpaperBackground();
      requireEventHandlers().reclampLayoutPageIndices();
      await finishNativeLayoutLoad();
      if (refreshedWallpaperBackground) scheduleNativeLayoutSave();
    } catch (error) {
      nativeLayoutReady = false;
      isNativeLayoutReady.value = false;
      hadNativeLoadFailure = true;
      nativeLoadFailureCount += 1;
      notices.showLayoutLoadFailed({
        error,
        retryCount: nativeLoadFailureCount,
        onRetry: retryNativeLayoutLoad,
      });
      console.error("Failed to load native Lumeria data", error);
    }
  }

  async function refreshNativeWindowEffectsSupport() {
    const outcome = await mainWindowRuntime.refreshSupport();
    applyNativeWindowEffectsSupport();
    if (!outcome.ok) console.error("Failed to load Lumeria window effects support", outcome.error);
  }

  async function refreshLiveDesktopBackgroundSupport() {
    const outcome = await liveDesktopRuntime.refreshSupport();
    if (!outcome.ok) console.error("Failed to load live desktop background support", outcome.error);
    return outcome.support;
  }

  async function refreshLiveDesktopRuntimeStatus() {
    const outcome = await liveDesktopRuntime.refreshStatus();
    if (!outcome.ok) {
      console.error("Failed to refresh live desktop background", outcome.error);
      throw outcome.error;
    }
    return outcome.status;
  }

  async function configureNativeLiveDesktopBackground() {
    const outcome = await liveDesktopRuntime.configure(
      makeLiveDesktopRuntimeConfig(settings.captureLiveDesktopConfig())
    );
    return reportLiveDesktopRuntimeOutcome("configure", outcome);
  }

  async function startNativeLiveDesktopBackground() {
    const outcome = await liveDesktopRuntime.start(
      makeLiveDesktopRuntimeConfig(settings.captureLiveDesktopConfig())
    );
    return reportLiveDesktopRuntimeOutcome("start", outcome);
  }

  async function stopNativeLiveDesktopBackground() {
    const outcome = await liveDesktopRuntime.stop();
    return reportLiveDesktopRuntimeOutcome("stop", outcome);
  }

  function applyNativeWindowEffectsSupport() {
    settings.reconcileWindowEffectsSupport();
  }

  function scheduleLaunchTargetStatusCheck() {
    if (!apps.shouldCheckLaunchTargets() || !platform.isAvailable()) {
      launchTargetStatusCheckRequestId += 1;
      launchTargetStatusCheckSignature = null;
      apps.clearLaunchTargetStatuses();
      return;
    }
    const checks = apps.listLaunchTargets();
    const signature = apps.launchTargetCheckSignature(checks);
    if (signature === launchTargetStatusCheckSignature) return;
    apps.pruneLaunchTargetStatuses();
    launchTargetStatusCheckSignature = signature;
    const requestId = (launchTargetStatusCheckRequestId += 1);
    window.setTimeout(() => checkCurrentLaunchTargets(requestId, signature, checks), 0);
  }

  async function checkCurrentLaunchTargets(requestId, scheduledSignature, checks) {
    if (requestId !== launchTargetStatusCheckRequestId) return;
    if (!apps.shouldCheckLaunchTargets() || !platform.isAvailable()) return;
    if (scheduledSignature !== apps.launchTargetCheckSignature()) {
      if (requestId === launchTargetStatusCheckRequestId) launchTargetStatusCheckSignature = null;
      scheduleLaunchTargetStatusCheck();
      return;
    }
    if (!checks.length) {
      if (requestId !== launchTargetStatusCheckRequestId) return;
      apps.clearLaunchTargetStatuses();
      return;
    }
    try {
      const results = await platform.checkLaunchTargets(
        checks.map((app) => ({ id: app.id, launchTarget: app.launchTarget }))
      );
      if (requestId !== launchTargetStatusCheckRequestId || !apps.shouldCheckLaunchTargets()) return;
      apps.applyLaunchTargetStatuses(results, checks);
      apps.pruneLaunchTargetStatuses();
    } catch (error) {
      if (requestId === launchTargetStatusCheckRequestId) launchTargetStatusCheckSignature = null;
      console.error("Failed to check Lumeria app paths", error);
    }
  }

  function getLaunchTargetStatus(app) {
    return apps.getLaunchTargetStatus(app);
  }

  async function launchNativeAppIfAvailable(app) {
    if (!shouldUseNativeCatalog()) return;
    try {
      await platform.launchApp(app);
      return true;
    } catch (error) {
      console.error(`Failed to launch ${app.name}`, error);
      return normalizeLaunchErrorReport(error, app);
    }
  }

  function normalizeLaunchErrorReport(error, app) {
    const requestedKind = error && typeof error === "object" ? String(error.kind || "") : "";
    const kind = Object.hasOwn(NATIVE_LAUNCH_FAILURE_COPY, requestedKind)
      ? requestedKind
      : "windowsLaunchFailed";
    const copy = NATIVE_LAUNCH_FAILURE_COPY[kind];
    const fallbackName = localizationText.t("errors.launch.appFallback");
    const appName = String(error?.appName || app?.name || fallbackName).trim() || fallbackName;
    const reason = localizationText.t(copy.reason);
    return {
      kind,
      title: localizationText.t("errors.launch.genericTitle"),
      message: localizationText.t("errors.launch.failureMessage", { appName, reason }),
      suggestion: localizationText.t(copy.suggestion),
      detail: String(error?.detail || error?.message || error || ""),
    };
  }

  async function showNativeLaunchError(error) {
    if (!shouldUseNativeCatalog() || !error) return false;
    try {
      await platform.showLaunchError(error);
      return true;
    } catch (showError) {
      console.error("Failed to show Lumeria launch error", showError);
      return false;
    }
  }

  function setNativeWindowEffectsEnabled(enabled) {
    if (!platform.isAvailable()) return;
    const openSequence = enabled ? null : nativeWindowOpenSequence;
    const { material, appearance } = settings.captureWindowPresentation();
    return mainWindowRuntime.setEffectsEnabled({ enabled, openSequence, material, appearance })
      .then((outcome) => {
        if (!outcome.ok) console.error("Failed to update Lumeria window effects", outcome.error);
        return outcome;
      });
  }

  function setNativeWindowMode(mode = settings.captureWindowPresentation().mode) {
    if (!platform.isAvailable()) return;
    const { fullscreenOverscanEnabled } = settings.captureWindowPresentation();
    return mainWindowRuntime.setMode({
      mode,
      fullscreenOverscanEnabled,
    }).then((outcome) => {
      if (!outcome.ok) console.error("Failed to update Lumeria window mode", outcome.error);
      return outcome;
    });
  }

  function setNativeMainWindowShortcutCaptureActive(active) {
    if (!platform.isAvailable()) return;
    return mainWindowRuntime.setShortcutCaptureActive(active).then((outcome) => {
      if (!outcome.ok) console.error("Failed to update Lumeria shortcut capture state", outcome.error);
      return outcome;
    });
  }

  function setNativeWindowFrameEnabled(enabled) {
    if (!platform.isAvailable()) return;
    return mainWindowRuntime.setFrameEnabled(enabled).then((outcome) => {
      if (!outcome.ok) console.error("Failed to update Lumeria native window frame", outcome.error);
      return outcome;
    });
  }

  function waitForNativeWindowRevealFrame() {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }
    return Promise.resolve();
  }

  function revealNativeWindowAfterPaint(
    openSequence = nativeWindowOpenSequence,
    paintFrameCount = 2
  ) {
    const revealSequence = Number(openSequence);
    if (!platform.isAvailable() || !Number.isFinite(revealSequence) || revealSequence <= 0) {
      return Promise.resolve(false);
    }
    const framesToWait = Math.max(0, Math.ceil(Number(paintFrameCount) || 0));
    nativeWindowRevealUpdate = nativeWindowRevealUpdate
      .then(async () => {
        await nextTick();
        for (let frame = 0; frame < framesToWait; frame += 1) {
          await waitForNativeWindowRevealFrame();
        }
        if (nativeWindowOpenSequence !== revealSequence) return false;
        const outcome = await mainWindowRuntime.reveal(revealSequence);
        if (!outcome.ok) throw outcome.error;
        return true;
      })
      .catch((error) => {
        console.error("Failed to reveal Lumeria window", error);
        return false;
      });
    return nativeWindowRevealUpdate;
  }

  function showNativeWindowAfterStartup() {
    if (!platform.isAvailable() || hasRequestedStartupNativeWindowShow) return;
    hasRequestedStartupNativeWindowShow = true;
    mainWindowRuntime.show().then((outcome) => {
      if (!outcome.ok) console.error("Failed to show Lumeria window after startup", outcome.error);
    });
  }

  function registerNativeEventListeners() {
    if (!platform.isAvailable()) return Promise.resolve();
    const handlers = requireEventHandlers();
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
      platform.listen("lumeria-open-desktop", openDesktopFromNativeShortcut)
        .then(keepUnlisten((unlisten) => {
          unlistenOpenDesktopEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native desktop open event", error);
        }),
      platform.listen("lumeria-toggle-desktop", toggleDesktopFromNativeShortcut)
        .then(keepUnlisten((unlisten) => {
          unlistenToggleDesktopEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native desktop toggle event", error);
        }),
      platform.listen("lumeria-close-desktop", closeDesktopFromNativeWindow)
        .then(keepUnlisten((unlisten) => {
          unlistenCloseDesktopEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native desktop close event", error);
        }),
      platform.listen("lumeria-open-settings", handlers.openSettingsPanel)
        .then(keepUnlisten((unlisten) => {
          unlistenSettingsEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for native settings event", error);
        }),
      platform.listen("lumeria-layout-recovered", handlers.handleLayoutRecovered)
        .then(keepUnlisten((unlisten) => {
          unlistenLayoutRecoveredEvent = unlisten;
        }))
        .catch((error) => {
          console.error("Failed to listen for layout recovery event", error);
        }),
      platform.listen("lumeria-quit-requested", quitFromNativeRequest)
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
    liveDesktopRuntime.dispose();
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

  function readNativeWindowActivation(event) {
    const payload = event?.payload;
    if (
      payload === null
      || typeof payload !== "object"
      || Array.isArray(payload)
      || typeof payload.displayChanged !== "boolean"
    ) {
      console.error("Invalid native main window activation payload", payload);
      return null;
    }
    const nextSequence = payload.openSequence;
    if (!Number.isSafeInteger(nextSequence) || nextSequence < 0) {
      console.error("Invalid native main window activation sequence", payload.openSequence);
      return null;
    }
    if (nextSequence > 0) {
      nativeWindowOpenSequence = nextSequence;
    }
    return {
      displayChanged: payload.displayChanged,
      openSequence: nextSequence,
    };
  }

  async function openDesktopAfterNativeDisplayChange(activation) {
    const handlers = requireEventHandlers();
    const didReveal = await revealNativeWindowAfterPaint(
      activation.openSequence,
      NATIVE_DISPLAY_CHANGE_SETTLE_FRAME_COUNT
    );
    if (!didReveal || nativeWindowOpenSequence !== activation.openSequence) return;
    await waitForNativeWindowRevealFrame();
    if (nativeWindowOpenSequence !== activation.openSequence || handlers.isDesktopOpen()) return;
    handlers.openDesktop();
  }

  function openDesktopFromNativeShortcut(event) {
    const handlers = requireEventHandlers();
    const activation = readNativeWindowActivation(event);
    if (!activation) return;
    if (activation.displayChanged) {
      mainWindowDisplayRevision.value += 1;
    }
    setNativeWindowFrameEnabled(true);
    setNativeWindowEffectsEnabled(true);
    refreshWindowsWallpaperBackground().then((changed) => {
      if (changed) scheduleNativeLayoutSave();
    }).finally(syncWindowsWallpaperRefreshTimer);
    clearNativeWindowHideTimer();
    if (handlers.isDesktopOpen()) {
      handlers.focusDesktopSurface();
      if (activation.displayChanged) restartLiveDesktopBackgroundRuntime();
      else syncLiveDesktopBackgroundRuntime();
      return revealNativeWindowAfterPaint(
        activation.openSequence,
        activation.displayChanged ? NATIVE_DISPLAY_CHANGE_SETTLE_FRAME_COUNT : 2
      );
    }
    if (activation.displayChanged) restartLiveDesktopBackgroundRuntime();
    else syncLiveDesktopBackgroundRuntime();
    if (activation.displayChanged) {
      return openDesktopAfterNativeDisplayChange(activation);
    }
    handlers.openDesktop();
    return revealNativeWindowAfterPaint(activation.openSequence);
  }

  function hideNativeWindowAfterCloseAnimation() {
    clearNativeWallpaperRefreshTimer();
    clearNativeWindowHideTimer();
    const hideSequence = ++nativeWindowHideSequence;
    setNativeWindowClosingInteractionBlocked(true);
    setNativeWindowFrameEnabled(false);
    syncLiveDesktopBackgroundRuntime();
    nativeWindowHideTimer = window.setTimeout(async () => {
      if (hideSequence !== nativeWindowHideSequence) return;
      nativeWindowHideTimer = null;
      await hideNativeWindow(hideSequence);
    }, DESKTOP_CLOSE_DURATION);
  }

  function closeSettingsPanelForDesktopClose() {
    const handlers = requireEventHandlers();
    if (!handlers.isSettingsPanelOpen()) return;
    handlers.closeSettingsPanel({ mode: "desktop" });
  }

  async function hideNativeWindow(expectedHideSequence = null) {
    if (!platform.isAvailable()) {
      setNativeWindowClosingInteractionBlocked(false);
      return;
    }
    if (expectedHideSequence !== null) {
      if (expectedHideSequence !== nativeWindowHideSequence) {
        setNativeWindowClosingInteractionBlocked(false);
        return;
      }
      nativeWindowHideTimer = null;
    } else {
      clearNativeWindowHideTimer();
    }
    try {
      if (expectedHideSequence !== null && expectedHideSequence !== nativeWindowHideSequence) {
        setNativeWindowClosingInteractionBlocked(false);
        return;
      }
      const outcome = await mainWindowRuntime.hide();
      if (!outcome.ok) throw outcome.error;
      setNativeWindowClosingInteractionBlocked(false);
    } catch (error) {
      console.error("Failed to hide Lumeria window", error);
      setNativeWindowClosingInteractionBlocked(false);
    }
  }

  function toggleDesktopFromNativeShortcut(event) {
    if (!readNativeWindowActivation(event)) return;
    const handlers = requireEventHandlers();
    if (handlers.isDesktopOpen()) {
      closeSettingsPanelForDesktopClose();
      if (handlers.hasRenderedFolder() && handlers.startFolderZoomFadeClose({ reason: "desktop" })) {
        handlers.closeDesktop({ clearSearch: false });
        hideNativeWindowAfterCloseAnimation();
        return;
      }
      handlers.closeDesktop({ clearSearch: false });
      hideNativeWindowAfterCloseAnimation();
    } else {
      openDesktopFromNativeShortcut(event);
    }
  }

  function closeDesktopFromNativeWindow() {
    clearNativeWallpaperRefreshTimer();
    const handlers = requireEventHandlers();
    if (handlers.isDesktopOpen()) {
      closeSettingsPanelForDesktopClose();
      handlers.closeDesktop({ clearSearch: false });
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
      console.error("Failed to save Lumeria layout before quit", error);
    } finally {
      try {
        await store.confirmQuit(saved);
      } catch (error) {
        console.error("Failed to confirm Lumeria quit", error);
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
    mainWindowDisplayRevision,
    loadNativeLaunchpadData,
    launchNativeAppIfAvailable,
    markLaunchCriticalLayoutDirty,
    prepareNativeLaunch,
    refreshLiveDesktopBackgroundSupport,
    refreshLiveDesktopRuntimeStatus,
    registerEventHandlers,
    registerNativeEventListeners,
    scheduleNativeLayoutSave,
    scheduleLaunchTargetStatusCheck,
    setNativeMainWindowShortcutCaptureActive,
    setNativeWindowMode,
    setNativeWindowEffectsEnabled,
    setNativeWindowFrameEnabled,
    showNativeWindowAfterStartup,
    showNativeLaunchError,
    startNativeLiveDesktopBackground,
    stopNativeLiveDesktopBackground,
    restartLiveDesktopBackgroundRuntime,
    syncLiveDesktopBackgroundRuntime,
    syncWindowsWallpaperRefreshTimer,
    shouldUseNativeCatalog,
  };
}
