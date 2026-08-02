import { computed, effectScope, ref, watch } from "vue";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import { cx } from "../domain/launchpadLayout.js";
import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  formatMainWindowShortcut,
  mainWindowShortcutFromKeyboardEvent,
} from "../domain/mainWindowShortcut.js";
import { developerToolsPort, nativeLifecyclePort } from "../platform/launchpadPorts.js";
import { rgbArrayToHex } from "../rendering/pixi/background/acrylicParams.js";
import { useBackgroundImagePixelSize } from "./useBackgroundImagePixelSize.js";
import { ICON_SIZE_MAX, ICON_SIZE_MIN, ICON_SIZE_STEP } from "./launchpadConstants.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_BASE_OPACITY_MAX,
  BACKGROUND_BASE_OPACITY_MIN,
  BACKGROUND_BASE_OPACITY_STEP,
  BACKGROUND_BLUR_STRENGTH_MAX,
  BACKGROUND_BLUR_STRENGTH_MIN,
  BACKGROUND_BLUR_STRENGTH_STEP,
  BACKGROUND_DARKEN_STRENGTH_MAX,
  BACKGROUND_DARKEN_STRENGTH_MIN,
  BACKGROUND_DARKEN_STRENGTH_STEP,
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_EFFECT_NONE,
  BACKGROUND_IMAGE_LAYOUT_CENTER,
  BACKGROUND_IMAGE_LAYOUT_FILL,
  BACKGROUND_IMAGE_LAYOUT_FIT,
  BACKGROUND_IMAGE_LAYOUT_STRETCH,
  BACKGROUND_IMAGE_LAYOUT_TILE,
  BACKGROUND_IMAGE_OPACITY_MAX,
  BACKGROUND_IMAGE_OPACITY_MIN,
  BACKGROUND_IMAGE_OPACITY_STEP,
  BACKGROUND_LIVE_DESKTOP_OPACITY_MAX,
  BACKGROUND_LIVE_DESKTOP_OPACITY_MIN,
  BACKGROUND_LIVE_DESKTOP_OPACITY_STEP,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
  BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_MICA,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
  WINDOW_EFFECT_MATERIAL_NONE,
  WINDOW_MODE_FULLSCREEN,
  WINDOW_MODE_WINDOWED,
  backgroundSourceUsesImage,
  backgroundSourceUsesLiveDesktop,
  normalizeBackgroundAcrylicAppearance,
  normalizeBackgroundAcrylicParams,
} from "./useLaunchpadSettingsConfig.js";

const SETTINGS_ROUTE_TRANSITION_FORWARD = "settings-route-forward";
const SETTINGS_ROUTE_TRANSITION_BACK = "settings-route-back";
const SETTINGS_ROUTE_TRANSITION_SWITCH = "settings-route-switch";
const LIVE_DESKTOP_STATUS_REFRESH_INTERVAL_MS = 1000;
const ACRYLIC_PARAM_STEP = 0.01;
const ACRYLIC_TINT_STRENGTH_MIN = 0;
const ACRYLIC_TINT_STRENGTH_MAX = 0.6;
const ACRYLIC_BRIGHTNESS_MIN = 0.5;
const ACRYLIC_BRIGHTNESS_MAX = 1.2;
const ACRYLIC_CONTRAST_MIN = 0.75;
const ACRYLIC_CONTRAST_MAX = 1.25;
const ACRYLIC_SATURATION_MIN = 0.8;
const ACRYLIC_SATURATION_MAX = 1.8;

const SETTINGS_TABS = Object.freeze([
  Object.freeze({ id: "general", label: "通用" }),
  Object.freeze({ id: "interface", label: "外观" }),
  Object.freeze({ id: "apps", label: "应用" }),
  Object.freeze({ id: "about", label: "关于" }),
]);

const SETTINGS_SUBPAGES = Object.freeze({
  appsExcludedApps: Object.freeze({ id: "apps.excludedApps", label: "已排除的应用", parentTabId: "apps" }),
  appsAppManager: Object.freeze({ id: "apps.appManager", label: "应用管理", parentTabId: "apps" }),
});

const GENERAL_CAPABILITIES = [
  "draftMainWindowShortcut",
  "isApplyingSettingsConfig",
];

const INTERFACE_CAPABILITIES = [
  "canUseLiveDesktopBackground",
  "canUseWindowEffectMaterial",
  "chooseDraftBackgroundImage",
  "clearDraftBackgroundImage",
  "confirmForceFillAllPages",
  "draftBackgroundAcrylicAppearance",
  "draftBackgroundAcrylicBlurStrength",
  "draftBackgroundBaseColor",
  "draftBackgroundBaseOpacity",
  "draftBackgroundBlurStrength",
  "draftBackgroundDarkenColor",
  "draftBackgroundDarkenStrength",
  "draftBackgroundEffect",
  "draftBackgroundImageLayout",
  "draftBackgroundImageOpacity",
  "draftBackgroundImagePath",
  "draftBackgroundImageUrl",
  "draftBackgroundLiveDesktopOpacity",
  "draftBackgroundSource",
  "draftCols",
  "draftFolderCols",
  "draftFolderIconSize",
  "draftFolderIconSizeMode",
  "draftFolderRows",
  "draftFullscreenOverscanEnabled",
  "draftIconSize",
  "draftIsTextlessMode",
  "draftRows",
  "draftShowCustomTitlebar",
  "draftWindowEffectAppearance",
  "draftWindowEffectMaterial",
  "draftWindowMode",
  "dragMeta",
  "isChoosingBackgroundImage",
  "isSettingsPanelOpen",
  "setDraftBackgroundAcrylicBlurStrength",
  "setDraftBackgroundBaseColor",
  "setDraftBackgroundBaseOpacity",
  "setDraftBackgroundBlurStrength",
  "setDraftBackgroundDarkenColor",
  "setDraftBackgroundDarkenStrength",
  "setDraftBackgroundEffect",
  "setDraftBackgroundImageLayout",
  "setDraftBackgroundImageOpacity",
  "setDraftBackgroundLiveDesktopOpacity",
  "setDraftBackgroundSource",
  "setDraftFolderIconSizeMode",
  "setDraftFullscreenOverscanEnabled",
  "setDraftShowCustomTitlebar",
  "setDraftWindowEffectAppearance",
  "setDraftWindowEffectMaterial",
  "setDraftWindowMode",
  "useDraftDesktopWallpaper",
];

const APPS_CAPABILITIES = [
  "addScanKeywordBlacklistItem",
  "addScanRoot",
  "appManagerSearchQuery",
  "appManagerSelectedIds",
  "browseScanRootDirectory",
  "canBrowseScanRoots",
  "cancelScanAppExclusion",
  "cancelScanAppExclusions",
  "canExcludeManagedAppFromScan",
  "canExcludeSelectedManagedAppsFromScan",
  "canScanManagedApps",
  "changeScanRootLabel",
  "changeScanRootPath",
  "clearManagedAppSelection",
  "confirmResetScanRoots",
  "editorModel",
  "excludeManagedAppFromScan",
  "excludeSelectedManagedAppsFromScan",
  "excludedScanApps",
  "filteredManagedApps",
  "getLaunchTargetPath",
  "isBrowsingScanRoot",
  "isScanningApps",
  "managedApps",
  "newScanKeyword",
  "removeManagedAppFromLaunchpad",
  "removeScanKeywordBlacklistItem",
  "removeScanRoot",
  "removeSelectedManagedAppsFromLaunchpad",
  "rescanManagedApps",
  "scanAppBlacklist",
  "scanKeywordBlacklist",
  "scanRoots",
  "selectAllManagedApps",
  "selectedManagedAppCount",
  "showMissingLaunchTargetBadge",
  "toggleManagedAppSelection",
  "toggleMissingLaunchTargetBadge",
  "toggleScanRootEnabled",
];

function pickCapabilities(source, names) {
  return Object.fromEntries(names.map((name) => [name, source[name]]));
}

function normalizeSettingsSubPage(page) {
  if (!page?.id || !page?.label || !page?.parentTabId) return null;
  if (!SETTINGS_TABS.some((tab) => tab.id === page.parentTabId)) return null;
  return { id: page.id, label: page.label, parentTabId: page.parentTabId };
}

function getExcludedAppKey(app, index) {
  if (app?.catalogId) return `catalog:${String(app.catalogId).toLocaleLowerCase()}`;
  if (app?.name) return `name:${String(app.name).toLocaleLowerCase()}:${index}`;
  return `excluded-app:${index}`;
}

export function useSettingsPanelModel(options) {
  const scope = effectScope();
  let model;
  try {
    model = scope.run(() => createSettingsPanelModel(options));
  } catch (error) {
    scope.stop();
    throw error;
  }

  let disposed = false;
  return Object.freeze({
    ...model,
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        model.dispose();
      } finally {
        scope.stop();
      }
    },
  });
}

function createSettingsPanelModel(options) {
  const state = options?.capabilities;
  const developerTools = options?.developerTools || developerToolsPort;
  const nativeEvents = options?.nativeEvents || nativeLifecyclePort;
  if (!state || typeof state.closeSettingsPanel !== "function" || typeof state.applySettingsConfig !== "function") {
    throw new TypeError("useSettingsPanelModel requires settings capabilities");
  }
  if (!options?.systemAppearance || !("value" in options.systemAppearance)) {
    throw new TypeError("useSettingsPanelModel requires the shared system appearance owner");
  }
  if (!options?.backgroundLayoutContext || !("value" in options.backgroundLayoutContext)) {
    throw new TypeError("useSettingsPanelModel requires background layout context");
  }
  if (typeof nativeEvents?.listen !== "function") {
    throw new TypeError("useSettingsPanelModel requires native events");
  }
  if (typeof developerTools?.isAvailable !== "function" || typeof developerTools?.openConsole !== "function") {
    throw new TypeError("useSettingsPanelModel requires developer tools");
  }

  const activeTab = ref("general");
  const activeSubPage = ref(null);
  const isNavigationCompact = ref(true);
  const routeTransitionName = ref(SETTINGS_ROUTE_TRANSITION_SWITCH);
  const activeTabItem = computed(() => SETTINGS_TABS.find((tab) => tab.id === activeTab.value) || SETTINGS_TABS[0]);
  const activeRoute = computed(() => {
    const tab = activeTabItem.value;
    const subPage = activeSubPage.value?.parentTabId === tab.id ? activeSubPage.value : null;
    return {
      depth: subPage ? 1 : 0,
      key: subPage ? `${tab.id}/${subPage.id}` : `${tab.id}/index`,
      label: subPage?.label || tab.label,
      parentLabel: tab.label,
      subPageId: subPage?.id || null,
      tabId: tab.id,
    };
  });

  function resolveRouteTransition(nextTabId, nextSubPage) {
    if (nextTabId !== activeTab.value) return SETTINGS_ROUTE_TRANSITION_SWITCH;
    const currentDepth = activeSubPage.value ? 1 : 0;
    const nextDepth = nextSubPage ? 1 : 0;
    if (nextDepth > currentDepth) return SETTINGS_ROUTE_TRANSITION_FORWARD;
    if (nextDepth < currentDepth) return SETTINGS_ROUTE_TRANSITION_BACK;
    if (nextSubPage?.id !== activeSubPage.value?.id) return SETTINGS_ROUTE_TRANSITION_SWITCH;
    return routeTransitionName.value;
  }

  function updateRoute(tabId, subPage) {
    if (!SETTINGS_TABS.some((tab) => tab.id === tabId)) return false;
    const nextSubPage = subPage ? normalizeSettingsSubPage(subPage) : null;
    if (nextSubPage && nextSubPage.parentTabId !== tabId) return false;
    routeTransitionName.value = resolveRouteTransition(tabId, nextSubPage);
    activeSubPage.value = nextSubPage;
    activeTab.value = tabId;
    return true;
  }

  function selectTab(tabId) {
    updateRoute(tabId, null);
  }

  function openSubPage(page) {
    const next = normalizeSettingsSubPage(page);
    if (next) updateRoute(next.parentTabId, next);
  }

  function closeSubPage() {
    if (activeSubPage.value) updateRoute(activeTab.value, null);
  }

  const isRecordingShortcut = ref(false);
  let shortcutRecordingSession = 0;
  let unlistenShortcutCaptured = null;

  function setShortcutError(message) {
    state.setMainWindowShortcutError?.(message);
  }

  function stopShortcutRecording() {
    if (isRecordingShortcut.value) state.setMainWindowShortcutCaptureActive?.(false);
    shortcutRecordingSession += 1;
    unlistenShortcutCaptured?.();
    unlistenShortcutCaptured = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", handleShortcutRecordingKeydown, true);
    }
    isRecordingShortcut.value = false;
  }

  function acceptShortcut(shortcut) {
    state.setDraftMainWindowShortcut(shortcut);
    setShortcutError("");
    stopShortcutRecording();
  }

  async function startShortcutRecording() {
    if (typeof window === "undefined" || isRecordingShortcut.value) return;
    setShortcutError("");
    isRecordingShortcut.value = true;
    shortcutRecordingSession += 1;
    const session = shortcutRecordingSession;
    window.addEventListener("keydown", handleShortcutRecordingKeydown, true);
    try {
      const unlisten = await nativeEvents.listen("lumeria-main-window-shortcut-captured", (event) => {
        if (session !== shortcutRecordingSession) return;
        const shortcut = String(event?.payload || "").trim();
        if (shortcut) acceptShortcut(shortcut);
      });
      if (session !== shortcutRecordingSession) {
        unlisten?.();
        return;
      }
      unlistenShortcutCaptured = unlisten;
      state.setMainWindowShortcutCaptureActive?.(true);
    } catch (error) {
      if (session === shortcutRecordingSession) {
        stopShortcutRecording();
        setShortcutError("无法开始快捷键录制，请重试。");
      }
      console.error("Failed to listen for shortcut capture", error);
    }
  }

  function handleShortcutRecordingKeydown(event) {
    event.preventDefault();
    event.stopPropagation();
    const result = mainWindowShortcutFromKeyboardEvent(event);
    if (result.status === "cancel") {
      stopShortcutRecording();
      setShortcutError("");
      return;
    }
    if (result.status === "invalid") {
      setShortcutError(result.message);
      return;
    }
    acceptShortcut(result.shortcut);
  }

  function resetShortcut() {
    stopShortcutRecording();
    state.setDraftMainWindowShortcut(DEFAULT_MAIN_WINDOW_SHORTCUT);
  }

  function clearShortcut() {
    stopShortcutRecording();
    state.setDraftMainWindowShortcut(null);
  }

  const isOpeningDeveloperConsole = ref(false);
  const developerConsoleError = ref("");
  const canOpenDeveloperConsole = computed(() => developerTools.isAvailable());

  async function openDeveloperConsole() {
    if (isOpeningDeveloperConsole.value) return false;
    developerConsoleError.value = "";
    if (!canOpenDeveloperConsole.value) {
      developerConsoleError.value = "控制台仅在 Lumeria 桌面应用中可用。";
      return false;
    }

    isOpeningDeveloperConsole.value = true;
    try {
      const opened = await developerTools.openConsole();
      if (!opened) {
        developerConsoleError.value = "当前环境无法打开控制台。";
        return false;
      }
      return true;
    } catch (error) {
      developerConsoleError.value = "无法打开控制台，请重试。";
      console.error("Failed to open developer console", error);
      return false;
    } finally {
      isOpeningDeveloperConsole.value = false;
    }
  }

  const general = Object.freeze({
    ...pickCapabilities(state, GENERAL_CAPABILITIES),
    canOpenDeveloperConsole,
    cx,
    developerConsoleHint: computed(() => (
      developerConsoleError.value
      || (canOpenDeveloperConsole.value
        ? "打开当前窗口的 WebView 开发者工具"
        : "仅在 Lumeria 桌面应用中可用")
    )),
    isOpeningDeveloperConsole,
    isRecordingMainWindowShortcut: isRecordingShortcut,
    mainWindowShortcutHint: computed(() => {
      if (state.mainWindowShortcutError.value) return state.mainWindowShortcutError.value;
      return isRecordingShortcut.value ? "按 Esc 取消录制" : "快速显示或隐藏 Lumeria";
    }),
    mainWindowShortcutLabel: computed(() => (
      isRecordingShortcut.value ? "按下组合键" : formatMainWindowShortcut(state.draftMainWindowShortcut.value)
    )),
    actions: Object.freeze({
      clearShortcut,
      openDeveloperConsole,
      resetShortcut,
      startShortcutRecording,
      stopShortcutRecording,
    }),
  });

  const activeAcrylicParamsProfile = ref(BACKGROUND_ACRYLIC_APPEARANCE_DARK);
  const windowEffectsSupport = computed(() => state.windowEffectsSupport.value || {});
  const windowEffectMaterialNotes = computed(() => [
    { material: WINDOW_EFFECT_MATERIAL_NONE, materialClass: "none", label: "无材质", description: "关闭系统材质，只显示底色与图片层", available: true },
    { material: WINDOW_EFFECT_MATERIAL_ACRYLIC, materialClass: "acrylic", label: "Acrylic", description: "半透明模糊，背景变化更明显", available: Boolean(windowEffectsSupport.value.supportsAcrylic) },
    { material: WINDOW_EFFECT_MATERIAL_MICA, materialClass: "mica", label: "Mica", description: "桌面采样，观感更稳定，资源占用更低", available: Boolean(windowEffectsSupport.value.supportsMica) },
    { material: WINDOW_EFFECT_MATERIAL_MICA_ALT, materialClass: "mica-alt", label: "Mica Alt", description: "Mica 变体，层次更强，适合分层窗口", available: Boolean(windowEffectsSupport.value.supportsMicaAlt) },
  ]);
  const windowEffectAppearances = [
    { appearance: WINDOW_EFFECT_APPEARANCE_LIGHT, appearanceLabel: "浅色" },
    { appearance: WINDOW_EFFECT_APPEARANCE_DARK, appearanceLabel: "深色" },
  ];
  const activeWindowEffectAppearance = computed(() => (
    windowEffectAppearances.find((item) => item.appearance === state.draftWindowEffectAppearance.value)
    || windowEffectAppearances[1]
  ));
  const windowEffectPreviewItems = computed(() => windowEffectMaterialNotes.value.map((material) => ({
    ...material,
    ...activeWindowEffectAppearance.value,
    active: state.draftWindowEffectMaterial.value === material.material,
  })));
  const canEditWindowEffectAppearance = computed(() => (
    state.draftWindowEffectMaterial.value !== WINDOW_EFFECT_MATERIAL_NONE
    && state.canUseWindowEffectMaterial(state.draftWindowEffectMaterial.value)
  ));
  const doesDraftBackgroundUseImage = computed(() => backgroundSourceUsesImage(state.draftBackgroundSource.value));
  const canShowLiveDesktopControls = computed(() => isLiveDesktopExperimentEnabled());
  const doesDraftBackgroundUseLiveDesktop = computed(() => Boolean(
    canShowLiveDesktopControls.value && backgroundSourceUsesLiveDesktop(state.draftBackgroundSource.value)
  ));
  const doesDraftBackgroundUseLayer = computed(() => doesDraftBackgroundUseImage.value || doesDraftBackgroundUseLiveDesktop.value);
  const isDraftCustomImage = computed(() => state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE);
  const isDraftWindowsWallpaper = computed(() => state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER);
  const liveDesktopUnavailableDetail = computed(() => {
    const support = state.liveDesktopBackgroundSupport?.value;
    return String(support?.detail || support?.reason || "").trim();
  });
  const liveDesktopRuntimeDetail = computed(() => {
    const status = state.liveDesktopRuntimeStatus?.value;
    if (!status || status.phase === "stopped") return "";
    return String(status.detail || status.reason || "").trim();
  });
  const backgroundSourceHint = computed(() => (
    state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE
      ? "自定义图片叠在底色上方"
      : state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER
        ? "跟随当前 Windows 桌面壁纸"
        : state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && canShowLiveDesktopControls.value
          ? liveDesktopRuntimeDetail.value || "捕获动态桌面并在 Native GPU 管线中合成"
          : canShowLiveDesktopControls.value && !state.canUseLiveDesktopBackground() && liveDesktopUnavailableDetail.value
            ? `动态桌面不可用：${liveDesktopUnavailableDetail.value}`
            : "不叠加背景层"
  ));
  const backgroundEffectHint = computed(() => (
    doesDraftBackgroundUseLayer.value
      ? doesDraftBackgroundUseLiveDesktop.value && !state.canUseLiveDesktopBackgroundEffect(state.draftBackgroundEffect.value)
        ? "当前效果由前端透明层合成"
        : state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL
          ? "WebGL Acrylic 风格合成"
          : state.draftBackgroundEffect.value === BACKGROUND_EFFECT_BLUR
            ? "模糊背景层"
            : state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED
              ? "叠加暗化遮罩"
              : "直接显示背景层"
      : "选择背景层后可用"
  ));
  const draftBackgroundImageName = computed(() => {
    const path = String(state.draftBackgroundImagePath.value || "").trim();
    if (!path) return isDraftWindowsWallpaper.value ? "等待同步桌面壁纸" : "使用内置图片";
    const name = path.split(/[\\/]/).filter(Boolean).pop() || "";
    if (isDraftWindowsWallpaper.value && /^background-[a-f0-9]{32}\./i.test(name)) return "当前桌面壁纸";
    return /^background-[a-f0-9]{32}\./i.test(name) ? "自定义图片" : name || "自定义图片";
  });
  const hasDraftBackgroundImagePreview = computed(() => Boolean(
    doesDraftBackgroundUseImage.value && state.draftBackgroundImageUrl.value
  ));
  const draftBackgroundImagePixelSize = useBackgroundImagePixelSize(() => (
    hasDraftBackgroundImagePreview.value ? state.draftBackgroundImageUrl.value : null
  ));
  const backgroundLayerPreviewLabel = computed(() => {
    if (!doesDraftBackgroundUseImage.value) return "无图片";
    return isDraftWindowsWallpaper.value ? "等待壁纸" : "选择图片";
  });
  const backgroundEffectPreviewLabel = computed(() => (
    isDraftWindowsWallpaper.value ? "等待壁纸" : "选择图片后可用"
  ));
  const effectiveDraftBackgroundAcrylicAppearance = computed(() => {
    const appearance = normalizeBackgroundAcrylicAppearance(state.draftBackgroundAcrylicAppearance.value);
    return appearance === BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM ? options.systemAppearance.value : appearance;
  });
  const draftBackgroundAcrylicPreviewParams = computed(() => {
    const appearance = effectiveDraftBackgroundAcrylicAppearance.value;
    const params = appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
      ? state.draftBackgroundAcrylicLightParams.value
      : state.draftBackgroundAcrylicDarkParams.value;
    return normalizeBackgroundAcrylicParams(params, appearance);
  });
  const draftBackgroundEffectBlurStrength = computed(() => (
    state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL
      ? state.draftBackgroundAcrylicBlurStrength.value
      : state.draftBackgroundBlurStrength.value
  ));
  const activeAcrylicParams = computed(() => (
    activeAcrylicParamsProfile.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
      ? state.draftBackgroundAcrylicLightParams.value
      : state.draftBackgroundAcrylicDarkParams.value
  ));
  const activeAcrylicTintColorHex = computed(() => rgbArrayToHex(activeAcrylicParams.value?.tintColor));
  const backgroundImageLayoutOptions = [
    { layout: BACKGROUND_IMAGE_LAYOUT_FILL, label: "填充" },
    { layout: BACKGROUND_IMAGE_LAYOUT_FIT, label: "适应" },
    { layout: BACKGROUND_IMAGE_LAYOUT_STRETCH, label: "拉伸" },
    { layout: BACKGROUND_IMAGE_LAYOUT_TILE, label: "平铺" },
    { layout: BACKGROUND_IMAGE_LAYOUT_CENTER, label: "居中" },
  ];

  function selectWindowEffectPreview(material, appearance) {
    if (!state.canUseWindowEffectMaterial(material)) return;
    state.setDraftWindowEffectMaterial(material);
    state.setDraftWindowEffectAppearance(appearance);
  }

  function setDraftBackgroundAcrylicAppearance(appearance) {
    state.setDraftBackgroundAcrylicAppearance(appearance);
    if (appearance === BACKGROUND_ACRYLIC_APPEARANCE_DARK || appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) {
      activeAcrylicParamsProfile.value = appearance;
    }
  }

  function setActiveDraftBackgroundAcrylicParam(key, value) {
    state.setDraftBackgroundAcrylicParam(activeAcrylicParamsProfile.value, key, value);
  }

  function resetActiveDraftBackgroundAcrylicParams() {
    state.resetDraftBackgroundAcrylicParams(activeAcrylicParamsProfile.value);
  }

  function formatAcrylicPercent(value) {
    const number = Number(value);
    return `${Math.round((Number.isFinite(number) ? number : 0) * 100)}%`;
  }

  const activeWindowEffectItem = computed(() => (
    windowEffectPreviewItems.value.find((item) => item.active) || windowEffectPreviewItems.value[0]
  ));
  const windowEffectSummary = computed(() => {
    const item = activeWindowEffectItem.value;
    return item ? `${item.label} · ${item.appearanceLabel}` : "未设置";
  });
  const activeBackgroundImageLayoutLabel = computed(() => (
    backgroundImageLayoutOptions.find((item) => item.layout === state.draftBackgroundImageLayout.value)?.label
    || backgroundImageLayoutOptions[0]?.label
    || "填充"
  ));
  const backgroundLayerSourceLabel = computed(() => {
    if (state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE) return "自定义图片";
    if (state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER) return "桌面壁纸";
    if (state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && canShowLiveDesktopControls.value) return "动态桌面";
    return "无图片";
  });
  const backgroundLayerSummary = computed(() => {
    if (doesDraftBackgroundUseLiveDesktop.value) return `${backgroundLayerSourceLabel.value} · ${state.draftBackgroundLiveDesktopOpacity.value}%`;
    if (doesDraftBackgroundUseImage.value) return `${backgroundLayerSourceLabel.value} · ${activeBackgroundImageLayoutLabel.value} · ${state.draftBackgroundImageOpacity.value}%`;
    return backgroundLayerSourceLabel.value;
  });
  const backgroundAcrylicAppearanceLabel = computed(() => {
    if (state.draftBackgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_DARK) return "深色";
    if (state.draftBackgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) return "浅色";
    return "跟随系统";
  });
  const backgroundEffectSummary = computed(() => {
    if (!doesDraftBackgroundUseLayer.value) return "选择背景层后可用";
    if (state.draftBackgroundEffect.value === BACKGROUND_EFFECT_BLUR) return `模糊 · ${state.draftBackgroundBlurStrength.value}%`;
    if (state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL) return `Acrylic · ${backgroundAcrylicAppearanceLabel.value} · ${state.draftBackgroundAcrylicBlurStrength.value}%`;
    if (state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED) return `暗化 · ${state.draftBackgroundDarkenStrength.value}%`;
    return "原图";
  });

  const interfaceModel = Object.freeze({
    ...pickCapabilities(state, INTERFACE_CAPABILITIES),
    ACRYLIC_BRIGHTNESS_MAX,
    ACRYLIC_BRIGHTNESS_MIN,
    ACRYLIC_CONTRAST_MAX,
    ACRYLIC_CONTRAST_MIN,
    ACRYLIC_PARAM_STEP,
    ACRYLIC_SATURATION_MAX,
    ACRYLIC_SATURATION_MIN,
    ACRYLIC_TINT_STRENGTH_MAX,
    ACRYLIC_TINT_STRENGTH_MIN,
    BACKGROUND_ACRYLIC_APPEARANCE_DARK,
    BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
    BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
    BACKGROUND_BASE_OPACITY_MAX,
    BACKGROUND_BASE_OPACITY_MIN,
    BACKGROUND_BASE_OPACITY_STEP,
    BACKGROUND_BLUR_STRENGTH_MAX,
    BACKGROUND_BLUR_STRENGTH_MIN,
    BACKGROUND_BLUR_STRENGTH_STEP,
    BACKGROUND_DARKEN_STRENGTH_MAX,
    BACKGROUND_DARKEN_STRENGTH_MIN,
    BACKGROUND_DARKEN_STRENGTH_STEP,
    BACKGROUND_EFFECT_ACRYLIC_WEBGL,
    BACKGROUND_EFFECT_BLUR,
    BACKGROUND_EFFECT_DIMMED,
    BACKGROUND_EFFECT_NONE,
    BACKGROUND_IMAGE_OPACITY_MAX,
    BACKGROUND_IMAGE_OPACITY_MIN,
    BACKGROUND_IMAGE_OPACITY_STEP,
    BACKGROUND_LIVE_DESKTOP_OPACITY_MAX,
    BACKGROUND_LIVE_DESKTOP_OPACITY_MIN,
    BACKGROUND_LIVE_DESKTOP_OPACITY_STEP,
    BACKGROUND_SOURCE_CUSTOM_IMAGE,
    BACKGROUND_SOURCE_SYSTEM_MATERIAL,
    BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
    BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
    ICON_SIZE_MAX,
    ICON_SIZE_MIN,
    ICON_SIZE_STEP,
    WINDOW_EFFECT_APPEARANCE_DARK,
    WINDOW_EFFECT_APPEARANCE_LIGHT,
    WINDOW_EFFECT_MATERIAL_ACRYLIC,
    WINDOW_EFFECT_MATERIAL_MICA,
    WINDOW_EFFECT_MATERIAL_MICA_ALT,
    WINDOW_EFFECT_MATERIAL_NONE,
    WINDOW_MODE_FULLSCREEN,
    WINDOW_MODE_WINDOWED,
    activeAcrylicParams,
    activeAcrylicParamsProfile,
    activeAcrylicTintColorHex,
    activeSettingsTab: activeTab,
    backgroundEffectHint,
    backgroundEffectPreviewLabel,
    backgroundEffectSummary,
    backgroundImageLayoutOptions,
    backgroundLayerPreviewLabel,
    backgroundLayerSummary,
    backgroundLayoutContext: options.backgroundLayoutContext,
    backgroundSourceHint,
    canEditWindowEffectAppearance,
    canShowLiveDesktopControls,
    canUseDraftBackgroundEffect: (effect) => state.canUseDraftBackgroundEffect(effect),
    cx,
    doesDraftBackgroundUseImage,
    doesDraftBackgroundUseLayer,
    doesDraftBackgroundUseLiveDesktop,
    draftBackgroundAcrylicPreviewParams,
    draftBackgroundEffectBlurStrength,
    draftBackgroundImageName,
    draftBackgroundImagePixelSize,
    formatAcrylicPercent,
    hasDraftBackgroundImagePreview,
    isDraftCustomImage,
    isDraftWindowsWallpaper,
    resetActiveDraftBackgroundAcrylicParams,
    selectWindowEffectPreview,
    setActiveDraftBackgroundAcrylicParam,
    setDraftBackgroundAcrylicAppearance,
    systemAppearance: options.systemAppearance,
    windowEffectPreviewItems,
    windowEffectSummary,
  });

  const excludedAppsSearchQuery = ref("");
  const selectedExcludedAppKeys = ref(new Set());
  const excludedAppsSearchTerm = computed(() => excludedAppsSearchQuery.value.trim().toLocaleLowerCase());
  const filteredExcludedApps = computed(() => {
    const term = excludedAppsSearchTerm.value;
    return state.excludedScanApps.value
      .map((app, index) => ({ app, index, key: getExcludedAppKey(app, index) }))
      .filter(({ app }) => !term || [app.name, app.catalogId]
        .some((value) => String(value || "").toLocaleLowerCase().includes(term)));
  });
  const selectedExcludedAppCount = computed(() => selectedExcludedAppKeys.value.size);
  const enabledScanRootCount = computed(() => (state.scanRoots?.value || []).filter((root) => root.enabled).length);
  const isExcludedAppsPage = computed(() => activeSubPage.value?.id === SETTINGS_SUBPAGES.appsExcludedApps.id);
  const isAppManagerPage = computed(() => activeSubPage.value?.id === SETTINGS_SUBPAGES.appsAppManager.id);
  const isAppsDetailPage = computed(() => isExcludedAppsPage.value || isAppManagerPage.value);

  function setExcludedAppsSearchQuery(value) {
    excludedAppsSearchQuery.value = value;
  }

  function isExcludedAppSelected(key) {
    return selectedExcludedAppKeys.value.has(key);
  }

  function toggleExcludedAppSelection(key, checked = !isExcludedAppSelected(key)) {
    if (!key) return;
    const next = new Set(selectedExcludedAppKeys.value);
    if (checked) next.add(key);
    else next.delete(key);
    selectedExcludedAppKeys.value = next;
  }

  function selectAllFilteredExcludedApps() {
    selectedExcludedAppKeys.value = new Set(filteredExcludedApps.value.map(({ key }) => key));
  }

  function clearExcludedAppSelection() {
    if (selectedExcludedAppKeys.value.size) selectedExcludedAppKeys.value = new Set();
  }

  function cancelScanExclusion(index, key) {
    state.cancelScanAppExclusion(index);
    if (!key || !selectedExcludedAppKeys.value.has(key)) return;
    const next = new Set(selectedExcludedAppKeys.value);
    next.delete(key);
    selectedExcludedAppKeys.value = next;
  }

  function cancelSelectedScanExclusions() {
    if (!selectedExcludedAppKeys.value.size) return;
    const selectedKeys = selectedExcludedAppKeys.value;
    const indices = state.scanAppBlacklist.value
      .map((app, index) => ({ index, key: getExcludedAppKey(app, index) }))
      .filter(({ key }) => selectedKeys.has(key))
      .map(({ index }) => index);
    state.cancelScanAppExclusions(indices);
    clearExcludedAppSelection();
  }

  function getExcludedAppName(app) {
    return String(app?.name || app?.catalogId || "未命名应用");
  }

  function getExcludedAppSubtitle(app) {
    return String(app?.catalogId || "未设置 Catalog ID");
  }

  function getExcludedAppGlyph(app) {
    const label = String(app?.emoji || app?.name || app?.catalogId || "A").trim();
    return label.charAt(0).toLocaleUpperCase() || "A";
  }

  function formatScanTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  }

  const appsModel = Object.freeze({
    ...pickCapabilities(state, APPS_CAPABILITIES),
    activeSettingsSubPage: activeSubPage,
    enabledScanRootCount,
    excludedAppsSearchQuery,
    filteredExcludedApps,
    formatScanTime,
    getExcludedAppGlyph,
    getExcludedAppName,
    getExcludedAppSubtitle,
    isAppManagerPage,
    isAppsDetailPage,
    isExcludedAppSelected,
    isExcludedAppsPage,
    selectedExcludedAppCount,
    selectedExcludedAppKeys,
    settingsSubPages: SETTINGS_SUBPAGES,
    actions: Object.freeze({
      cancelScanExclusion,
      cancelSelectedScanExclusions,
      clearExcludedAppSelection,
      openAppManager: () => openSubPage(SETTINGS_SUBPAGES.appsAppManager),
      openExcludedApps: () => openSubPage(SETTINGS_SUBPAGES.appsExcludedApps),
      selectAllFilteredExcludedApps,
      setExcludedAppsSearchQuery,
      toggleExcludedAppSelection,
    }),
  });

  const pages = Object.freeze({
    about: Object.freeze({ appVersion: String(options.appVersion || "") }),
    apps: appsModel,
    general,
    interface: interfaceModel,
  });
  const activePageModel = computed(() => pages[activeTab.value] || pages.general);
  const shell = Object.freeze({
    activePageModel,
    activeRoute,
    activeSubPage,
    activeTab,
    canApply: computed(() => !state.dragMeta?.value && !state.isApplyingSettingsConfig.value),
    isNavigationCompact,
    isOpen: state.isSettingsPanelOpen,
    motion: Object.freeze({
      closeDurationSeconds: state.settingsPanelCloseDurationSeconds,
      initial: state.settingsPanelInitial,
      overlay: state.settingsOverlayAnimate,
      panel: state.settingsPanelAnimate,
    }),
    routeKey: computed(() => activeRoute.value.key),
    routeTransitionName,
    shouldRender: state.shouldRenderSettingsPanel,
    showFooter: computed(() => activeRoute.value.depth === 0 && ["general", "interface"].includes(activeTab.value)),
    tabs: SETTINGS_TABS,
    actions: Object.freeze({
      apply: state.applySettingsConfig,
      close: state.closeSettingsPanel,
      closeSubPage,
      openSubPage,
      selectTab,
      toggleNavigation: () => { isNavigationCompact.value = !isNavigationCompact.value; },
    }),
  });

  let liveDesktopStatusTimer = null;
  function clearLiveDesktopStatusTimer() {
    if (liveDesktopStatusTimer && typeof window !== "undefined") window.clearInterval(liveDesktopStatusTimer);
    liveDesktopStatusTimer = null;
  }
  function refreshLiveDesktopRuntimeStatus() {
    if (!canShowLiveDesktopControls.value) return;
    Promise.resolve(state.refreshLiveDesktopRuntimeStatus?.()).catch((error) => {
      console.error("Live Desktop 运行时状态刷新失败，失败信息已写入状态", error);
    });
  }
  function syncLiveDesktopStatusTimer() {
    clearLiveDesktopStatusTimer();
    if (typeof window === "undefined" || !canShowLiveDesktopControls.value) return;
    if (!state.isSettingsPanelOpen.value || !doesDraftBackgroundUseLiveDesktop.value) return;
    if (typeof state.refreshLiveDesktopRuntimeStatus !== "function") return;
    refreshLiveDesktopRuntimeStatus();
    liveDesktopStatusTimer = window.setInterval(refreshLiveDesktopRuntimeStatus, LIVE_DESKTOP_STATUS_REFRESH_INTERVAL_MS);
  }

  watch([state.isSettingsPanelOpen, state.draftBackgroundSource], syncLiveDesktopStatusTimer, { immediate: true });
  watch(state.isSettingsPanelOpen, (open) => {
    if (open) return;
    stopShortcutRecording();
    closeSubPage();
  });
  watch(state.draftBackgroundAcrylicAppearance, (appearance) => {
    if (appearance === BACKGROUND_ACRYLIC_APPEARANCE_DARK || appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) {
      activeAcrylicParamsProfile.value = appearance;
    }
  }, { immediate: true });
  watch(excludedAppsSearchQuery, clearExcludedAppSelection);
  watch(state.scanAppBlacklist, () => {
    const currentKeys = new Set(state.scanAppBlacklist.value.map((app, index) => getExcludedAppKey(app, index)));
    selectedExcludedAppKeys.value = new Set([...selectedExcludedAppKeys.value].filter((key) => currentKeys.has(key)));
  });
  watch(isExcludedAppsPage, (active) => {
    if (!active) clearExcludedAppSelection();
  });

  function dispose() {
    clearLiveDesktopStatusTimer();
    stopShortcutRecording();
  }

  return Object.freeze({
    dispose,
    pages,
    shell,
    systemAppearance: options.systemAppearance,
  });
}
