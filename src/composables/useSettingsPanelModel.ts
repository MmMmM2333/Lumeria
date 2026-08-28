import { computed, effectScope, ref, watch } from "vue";
import type { Ref } from "vue";
import type {
  BackgroundLayoutContext,
  LiveDesktopBackgroundSupport,
  LiveDesktopRuntimeStatus,
  MainWindowEffectsSupport,
} from "../api/launchpadApi.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import { cx } from "../domain/launchpadLayout.js";
import type { AppearancePreference } from "../domain/appearancePreference.js";
import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  formatMainWindowShortcut,
} from "../domain/mainWindowShortcut.js";
import {
  APPEARANCE_DARK as SETTINGS_THEME_DARK,
  APPEARANCE_LIGHT as SETTINGS_THEME_LIGHT,
  APPEARANCE_SYSTEM as SETTINGS_THEME_SYSTEM,
  resolveAppearancePreference,
} from "../domain/appearancePreference.js";
import {
  LAUNCHPAD_ICON_DARK,
  LAUNCHPAD_ICON_LIGHT,
  LAUNCHPAD_ICON_PASTEL_DARK,
  LAUNCHPAD_ICON_PASTEL_LIGHT,
} from "../domain/launchpadIconVariant.js";
import { developerToolsPort, nativeLifecyclePort } from "../platform/launchpadPorts.js";
import type {
  DeveloperToolsPort,
  NativeLifecyclePort,
} from "../platform/launchpadPorts.js";
import type { LocalizationText } from "../i18n/localization.js";
import { mainWindowShortcutFromKeyboardEvent } from "../platform/mainWindowShortcutInput.js";
import { rgbArrayToHex } from "../domain/backgroundAcrylicParams.js";
import type { AcrylicParameters } from "../domain/layoutDocument.js";
import { useBackgroundImagePixelSize } from "./useBackgroundImagePixelSize.js";
import { ICON_SIZE_MAX, ICON_SIZE_MIN, ICON_SIZE_STEP } from "./launchpadConstants.js";
import type { useLaunchpadApps } from "./useLaunchpadApps.js";
import type { useLaunchpadSettings } from "./useLaunchpadSettings.js";
import type { useSettingsPanelFlow } from "./useSettingsPanelFlow.js";
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
  BACKGROUND_EFFECT_ACRYLIC,
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
  WINDOW_EFFECT_APPEARANCE_SYSTEM,
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
import type {
  BackgroundAcrylicProfileKey,
  WindowEffectAppearance,
  WindowEffectMaterial,
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

const SETTINGS_TAB_SPECS = Object.freeze([
  Object.freeze({ id: "general", labelKey: "settings.general.title" }),
  Object.freeze({ id: "interface", labelKey: "settings.interface.title" }),
  Object.freeze({ id: "apps", labelKey: "settings.apps.title" }),
  Object.freeze({ id: "about", labelKey: "settings.about.title" }),
] as const);

const SETTINGS_SUBPAGE_SPECS = Object.freeze({
  appsExcludedApps: Object.freeze({ id: "apps.excludedApps", labelKey: "settings.apps.excluded.title", parentTabId: "apps" }),
  appsAppManager: Object.freeze({ id: "apps.appManager", labelKey: "settings.apps.manager.title", parentTabId: "apps" }),
});

const GENERAL_CAPABILITIES = [
  "canConfigureLaunchAtLogin",
  "canCustomizeLaunchpadIcon",
  "draftLaunchpadIconVariant",
  "draftLaunchAtLogin",
  "draftLocalePreference",
  "draftMainWindowShortcut",
  "isApplyingSettingsConfig",
  "isRefreshingLaunchAtLogin",
  "launchAtLoginError",
  "localePreferenceError",
  "launchpadIconError",
] as const;

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
  "draftSettingsThemePreference",
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
  "setDraftSettingsThemePreference",
  "setDraftShowCustomTitlebar",
  "setDraftWindowEffectAppearance",
  "setDraftWindowEffectMaterial",
  "setDraftWindowMode",
  "useDraftDesktopWallpaper",
] as const;

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
] as const;

type ValueOwner<T> = Readonly<Pick<Ref<T>, "value">>;
type LiveDesktopBackgroundSupportDetail = Pick<LiveDesktopBackgroundSupport, "reason" | "detail">;
type LaunchpadSettingsOwner = ReturnType<typeof useLaunchpadSettings>;
type LaunchpadAppsOwner = ReturnType<typeof useLaunchpadApps>;
type SettingsPanelFlowOwner = ReturnType<typeof useSettingsPanelFlow>;
type PrefixedDraftCapabilities<Draft> = {
  [Key in keyof Draft as Key extends string ? `draft${Capitalize<Key>}` : never]: Draft[Key];
};
type SettingsCapabilitySource = PrefixedDraftCapabilities<LaunchpadSettingsOwner["draft"]>
  & LaunchpadSettingsOwner["actions"]
  & LaunchpadSettingsOwner["presentation"];
type AppsCapabilitySource = LaunchpadAppsOwner & LaunchpadAppsOwner["presentation"];
type SupplementalCapabilitySource = Readonly<{
  applySettingsConfig: () => Promise<unknown>;
  confirmForceFillAllPages: () => void;
  dragMeta: ValueOwner<unknown>;
  liveDesktopBackgroundSupport?: ValueOwner<LiveDesktopBackgroundSupportDetail | null>;
  liveDesktopRuntimeStatus?: ValueOwner<LiveDesktopRuntimeStatus | null>;
  refreshLiveDesktopRuntimeStatus?: () => unknown;
  setMainWindowShortcutCaptureActive?: (active: boolean) => unknown;
  windowEffectsSupport: ValueOwner<Partial<MainWindowEffectsSupport> | null>;
}>;
type SettingsPanelCapabilitySource = SettingsCapabilitySource
  & AppsCapabilitySource
  & SettingsPanelFlowOwner
  & SupplementalCapabilitySource;
type RoutedCapabilityName = (typeof GENERAL_CAPABILITIES)[number]
  | (typeof INTERFACE_CAPABILITIES)[number]
  | (typeof APPS_CAPABILITIES)[number];
type RequiredCapabilityName =
  | "applySettingsConfig"
  | "cancelScanAppExclusion"
  | "cancelScanAppExclusions"
  | "canUseDraftBackgroundEffect"
  | "canUseLiveDesktopBackground"
  | "canUseLiveDesktopBackgroundEffect"
  | "canUseWindowEffectMaterial"
  | "closeSettingsPanel"
  | "draftBackgroundAcrylicAppearance"
  | "draftBackgroundAcrylicBlurStrength"
  | "draftBackgroundAcrylicDarkParams"
  | "draftBackgroundAcrylicLightParams"
  | "draftBackgroundBlurStrength"
  | "draftBackgroundDarkenStrength"
  | "draftBackgroundEffect"
  | "draftBackgroundImageLayout"
  | "draftBackgroundImageOpacity"
  | "draftBackgroundImagePath"
  | "draftBackgroundImageUrl"
  | "draftBackgroundLiveDesktopOpacity"
  | "draftBackgroundSource"
  | "draftLaunchpadIconVariant"
  | "draftMainWindowShortcut"
  | "draftSettingsThemePreference"
  | "draftWindowEffectAppearance"
  | "draftWindowEffectMaterial"
  | "dragMeta"
  | "excludedScanApps"
  | "isApplyingSettingsConfig"
  | "isSettingsPanelOpen"
  | "mainWindowShortcutError"
  | "resetDraftBackgroundAcrylicParams"
  | "scanAppBlacklist"
  | "scanRoots"
  | "setDraftBackgroundAcrylicAppearance"
  | "setDraftBackgroundAcrylicParam"
  | "setDraftLaunchAtLogin"
  | "setDraftLaunchpadIconVariant"
  | "setDraftLocalePreference"
  | "setDraftMainWindowShortcut"
  | "setDraftWindowEffectAppearance"
  | "setDraftWindowEffectMaterial"
  | "setMainWindowShortcutError"
  | "settingsOverlayAnimate"
  | "settingsPanelAnimate"
  | "settingsPanelCloseDurationSeconds"
  | "settingsPanelInitial"
  | "shouldRenderSettingsPanel"
  | "windowEffectsSupport";

export type SettingsPanelCapabilities = Readonly<
  Required<Pick<SettingsPanelCapabilitySource, RoutedCapabilityName>>
  & Pick<SettingsPanelCapabilitySource, RequiredCapabilityName>
  & Pick<
    SettingsPanelCapabilitySource,
    "liveDesktopBackgroundSupport"
      | "liveDesktopRuntimeStatus"
      | "refreshLiveDesktopRuntimeStatus"
      | "setMainWindowShortcutCaptureActive"
  >
>;

export type SettingsPanelModelOptions = Readonly<{
  appVersion?: string;
  backgroundLayoutContext: ValueOwner<BackgroundLayoutContext | null>;
  capabilities: SettingsPanelCapabilities;
  developerTools?: DeveloperToolsPort;
  localizationText: LocalizationText;
  nativeEvents?: Pick<NativeLifecyclePort, "listen">;
  systemAppearance: ValueOwner<AppearancePreference>;
}>;

type SettingsTabId = (typeof SETTINGS_TAB_SPECS)[number]["id"];
type SettingsTabItem = Readonly<{ id: SettingsTabId; label: string }>;
type SettingsSubPageSpec = Readonly<{
  id: string;
  labelKey: string;
  parentTabId: SettingsTabId;
}>;
type SettingsSubPageItem = SettingsSubPageSpec & Readonly<{ label: string }>;
type ExcludedScanApp = SettingsPanelCapabilities["excludedScanApps"]["value"][number];

function pickCapabilities<Source extends object, const Names extends readonly (keyof Source)[]>(
  source: Source,
  names: Names,
): Pick<Source, Names[number]> {
  return Object.fromEntries(names.map((name) => [name, source[name]])) as Pick<Source, Names[number]>;
}

function getExcludedAppKey(app: ExcludedScanApp | null | undefined, index: number): string {
  if (app?.catalogId) return `catalog:${String(app.catalogId).toLocaleLowerCase()}`;
  if (app?.name) return `name:${String(app.name).toLocaleLowerCase()}:${index}`;
  return `excluded-app:${index}`;
}

export function useSettingsPanelModel(options: SettingsPanelModelOptions) {
  const scope = effectScope();
  let model: ReturnType<typeof createSettingsPanelModel>;
  try {
    const scopedModel = scope.run(() => createSettingsPanelModel(options));
    if (!scopedModel) throw new Error("Settings panel model scope was inactive during initialization");
    model = scopedModel;
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

function createSettingsPanelModel(options: SettingsPanelModelOptions) {
  const state = options.capabilities;
  const text = options.localizationText;
  const t = text.t;
  const developerTools = options.developerTools || developerToolsPort;
  const nativeEvents = options.nativeEvents || nativeLifecyclePort;
  if (typeof state.closeSettingsPanel !== "function" || typeof state.applySettingsConfig !== "function") {
    throw new TypeError("useSettingsPanelModel requires settings capabilities");
  }
  if (!options.systemAppearance || !("value" in options.systemAppearance)) {
    throw new TypeError("useSettingsPanelModel requires the shared system appearance owner");
  }
  if (!options.backgroundLayoutContext || !("value" in options.backgroundLayoutContext)) {
    throw new TypeError("useSettingsPanelModel requires background layout context");
  }
  if (typeof t !== "function" || typeof text.d !== "function") {
    throw new TypeError("useSettingsPanelModel requires localization text");
  }
  if (typeof nativeEvents.listen !== "function") {
    throw new TypeError("useSettingsPanelModel requires native events");
  }
  if (typeof developerTools.isAvailable !== "function" || typeof developerTools.openConsole !== "function") {
    throw new TypeError("useSettingsPanelModel requires developer tools");
  }

  const activeTab = ref<SettingsTabId>("general");
  const activeSubPage = ref<SettingsSubPageSpec | null>(null);
  const isNavigationCompact = ref(true);
  const routeTransitionName = ref(SETTINGS_ROUTE_TRANSITION_SWITCH);
  const resolvedSettingsTheme = computed(() => resolveAppearancePreference(
    state.draftSettingsThemePreference.value,
    options.systemAppearance.value
  ));
  const settingsThemeOptions = computed(() => [
    { value: SETTINGS_THEME_SYSTEM, label: t("settings.interface.theme.system") },
    { value: SETTINGS_THEME_LIGHT, label: t("settings.interface.theme.light") },
    { value: SETTINGS_THEME_DARK, label: t("settings.interface.theme.dark") },
  ]);
  const launchpadIconOptions = computed(() => [
    { value: LAUNCHPAD_ICON_LIGHT, label: t("settings.general.launchpadIcon.options.light") },
    { value: LAUNCHPAD_ICON_DARK, label: t("settings.general.launchpadIcon.options.dark") },
    { value: LAUNCHPAD_ICON_PASTEL_LIGHT, label: t("settings.general.launchpadIcon.options.pastelLight") },
    { value: LAUNCHPAD_ICON_PASTEL_DARK, label: t("settings.general.launchpadIcon.options.pastelDark") },
  ]);
  const settingsTabs = computed<SettingsTabItem[]>(() => (
    SETTINGS_TAB_SPECS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))
  ));
  const settingsSubPages = computed(() => Object.fromEntries(
    Object.entries(SETTINGS_SUBPAGE_SPECS).map(([name, page]) => [name, {
      id: page.id,
      label: t(page.labelKey),
      labelKey: page.labelKey,
      parentTabId: page.parentTabId,
    }]),
  ));
  const activeTabItem = computed(() => (
    settingsTabs.value.find((tab) => tab.id === activeTab.value) || settingsTabs.value[0]!
  ));
  const activeRoute = computed(() => {
    const tab = activeTabItem.value;
    const subPage = activeSubPage.value?.parentTabId === tab.id ? activeSubPage.value : null;
    return {
      depth: subPage ? 1 : 0,
      key: subPage ? `${tab.id}/${subPage.id}` : `${tab.id}/index`,
      label: subPage?.labelKey ? t(subPage.labelKey) : tab.label,
      parentLabel: tab.label,
      subPageId: subPage?.id || null,
      tabId: tab.id,
    };
  });

  function resolveRouteTransition(
    nextTabId: SettingsTabId,
    nextSubPage: SettingsSubPageSpec | null,
  ): string {
    if (nextTabId !== activeTab.value) return SETTINGS_ROUTE_TRANSITION_SWITCH;
    const currentDepth = activeSubPage.value ? 1 : 0;
    const nextDepth = nextSubPage ? 1 : 0;
    if (nextDepth > currentDepth) return SETTINGS_ROUTE_TRANSITION_FORWARD;
    if (nextDepth < currentDepth) return SETTINGS_ROUTE_TRANSITION_BACK;
    if (nextSubPage?.id !== activeSubPage.value?.id) return SETTINGS_ROUTE_TRANSITION_SWITCH;
    return routeTransitionName.value;
  }

  function updateRoute(tabId: SettingsTabId, subPage: SettingsSubPageSpec | null): boolean {
    if (!SETTINGS_TAB_SPECS.some((tab) => tab.id === tabId)) return false;
    const nextSubPage = subPage ? normalizeSettingsSubPage(subPage) : null;
    if (nextSubPage && nextSubPage.parentTabId !== tabId) return false;
    routeTransitionName.value = resolveRouteTransition(tabId, nextSubPage);
    activeSubPage.value = nextSubPage;
    activeTab.value = tabId;
    return true;
  }

  function selectTab(tabId: SettingsTabId): void {
    updateRoute(tabId, null);
  }

  function openSubPage(page: SettingsSubPageSpec): void {
    const next = normalizeSettingsSubPage(page);
    if (next) updateRoute(next.parentTabId, next);
  }

  function normalizeSettingsSubPage(page: SettingsSubPageSpec | null | undefined): SettingsSubPageSpec | null {
    if (!page?.id || !page?.labelKey || !page?.parentTabId) return null;
    if (!SETTINGS_TAB_SPECS.some((tab) => tab.id === page.parentTabId)) return null;
    return { id: page.id, labelKey: page.labelKey, parentTabId: page.parentTabId };
  }

  function closeSubPage() {
    if (activeSubPage.value) updateRoute(activeTab.value, null);
  }

  const isRecordingShortcut = ref(false);
  let shortcutRecordingSession = 0;
  let unlistenShortcutCaptured: (() => void) | null = null;

  function setShortcutError(message: unknown): void {
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

  function acceptShortcut(shortcut: string): void {
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
        const payload = event && typeof event === "object" && "payload" in event
          ? event.payload
          : null;
        const shortcut = String(payload || "").trim();
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
        setShortcutError(t("settings.general.shortcut.startFailed"));
      }
      console.error("Failed to listen for shortcut capture", error);
    }
  }

  function handleShortcutRecordingKeydown(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const result = mainWindowShortcutFromKeyboardEvent(event);
    if (result.status === "cancel") {
      stopShortcutRecording();
      setShortcutError("");
      return;
    }
    if (result.status === "invalid") {
      setShortcutError(t(`settings.general.shortcut.invalid.${result.reason}`));
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
      developerConsoleError.value = t("settings.general.advanced.unavailable");
      return false;
    }

    isOpeningDeveloperConsole.value = true;
    try {
      const opened = await developerTools.openConsole();
      if (!opened) {
        developerConsoleError.value = t("settings.general.advanced.openUnavailable");
        return false;
      }
      return true;
    } catch (error) {
      developerConsoleError.value = t("settings.general.advanced.openFailed");
      console.error("Failed to open developer console", error);
      return false;
    } finally {
      isOpeningDeveloperConsole.value = false;
    }
  }

  const canResetMainWindowShortcut = computed(() => (
    state.draftMainWindowShortcut.value !== DEFAULT_MAIN_WINDOW_SHORTCUT
  ));

  const general = Object.freeze({
    ...pickCapabilities(state, GENERAL_CAPABILITIES),
    canOpenDeveloperConsole,
    canResetMainWindowShortcut,
    cx,
    developerConsoleHint: computed(() => (
      developerConsoleError.value
      || (canOpenDeveloperConsole.value
        ? t("settings.general.advanced.hint")
        : t("settings.general.advanced.unavailableHint"))
    )),
    isOpeningDeveloperConsole,
    isRecordingMainWindowShortcut: isRecordingShortcut,
    launchpadIconOptions,
    mainWindowShortcutHint: computed(() => {
      if (state.mainWindowShortcutError.value) return state.mainWindowShortcutError.value;
      return isRecordingShortcut.value
        ? t("settings.general.shortcut.recordingHint")
        : t("settings.general.shortcut.hint");
    }),
    mainWindowShortcutLabel: computed(() => {
      if (isRecordingShortcut.value) return t("settings.general.shortcut.pressKeys");
      const shortcut = state.draftMainWindowShortcut.value;
      const formatted = shortcut === null ? null : formatMainWindowShortcut(shortcut);
      return formatted || t("settings.general.shortcut.notSet");
    }),
    actions: Object.freeze({
      clearShortcut,
      openDeveloperConsole,
      resetShortcut,
      setLaunchAtLogin: state.setDraftLaunchAtLogin,
      setLaunchpadIconVariant: state.setDraftLaunchpadIconVariant,
      setLocalePreference: state.setDraftLocalePreference,
      startShortcutRecording,
      stopShortcutRecording,
    }),
  });

  const activeAcrylicParamsProfile = ref<BackgroundAcrylicProfileKey>(BACKGROUND_ACRYLIC_APPEARANCE_DARK);
  const windowEffectsSupport = computed(() => state.windowEffectsSupport.value || {});
  const windowEffectMaterialNotes = computed(() => [
    { material: WINDOW_EFFECT_MATERIAL_NONE, materialClass: "none", label: t("settings.interface.window.materialNone"), description: t("settings.interface.window.materials.none"), available: true },
    { material: WINDOW_EFFECT_MATERIAL_ACRYLIC, materialClass: "acrylic", label: "Acrylic", description: t("settings.interface.window.materials.acrylic"), available: Boolean(windowEffectsSupport.value.supportsAcrylic) },
    { material: WINDOW_EFFECT_MATERIAL_MICA, materialClass: "mica", label: "Mica", description: t("settings.interface.window.materials.mica"), available: Boolean(windowEffectsSupport.value.supportsMica) },
    { material: WINDOW_EFFECT_MATERIAL_MICA_ALT, materialClass: "mica-alt", label: "Mica Alt", description: t("settings.interface.window.materials.micaAlt"), available: Boolean(windowEffectsSupport.value.supportsMicaAlt) },
  ]);
  type WindowEffectAppearanceItem = Readonly<{
    appearance: WindowEffectAppearance;
    appearanceLabel: string;
  }>;
  const windowEffectAppearances = computed<WindowEffectAppearanceItem[]>(() => [
    { appearance: WINDOW_EFFECT_APPEARANCE_SYSTEM, appearanceLabel: t("settings.interface.window.system") },
    { appearance: WINDOW_EFFECT_APPEARANCE_LIGHT, appearanceLabel: t("settings.interface.window.light") },
    { appearance: WINDOW_EFFECT_APPEARANCE_DARK, appearanceLabel: t("settings.interface.window.dark") },
  ]);
  const activeWindowEffectAppearance = computed<WindowEffectAppearanceItem>(() => (
    windowEffectAppearances.value.find((item) => item.appearance === state.draftWindowEffectAppearance.value)
    || windowEffectAppearances.value.find((item) => item.appearance === WINDOW_EFFECT_APPEARANCE_DARK)!
  ));
  const resolvedWindowEffectAppearance = computed(() => resolveAppearancePreference(
    activeWindowEffectAppearance.value.appearance,
    options.systemAppearance.value,
  ));
  const windowEffectPreviewItems = computed(() => windowEffectMaterialNotes.value.map((material) => ({
    ...material,
    ...activeWindowEffectAppearance.value,
    resolvedAppearance: resolvedWindowEffectAppearance.value,
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
      ? t("settings.interface.background.layer.hintCustom")
      : state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER
        ? t("settings.interface.background.layer.hintWallpaper")
        : state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && canShowLiveDesktopControls.value
          ? liveDesktopRuntimeDetail.value || t("settings.interface.background.layer.hintLive")
          : canShowLiveDesktopControls.value && !state.canUseLiveDesktopBackground() && liveDesktopUnavailableDetail.value
            ? t("settings.interface.background.layer.hintLiveUnavailable", { detail: liveDesktopUnavailableDetail.value })
            : t("settings.interface.background.layer.hintNone")
  ));
  const backgroundEffectHint = computed(() => (
    doesDraftBackgroundUseLayer.value
      ? doesDraftBackgroundUseLiveDesktop.value && !state.canUseLiveDesktopBackgroundEffect(state.draftBackgroundEffect.value)
        ? t("settings.interface.background.effect.hintCss")
        : state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC
          ? t("settings.interface.background.effect.hintAcrylic")
          : state.draftBackgroundEffect.value === BACKGROUND_EFFECT_BLUR
            ? t("settings.interface.background.effect.hintBlur")
            : state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED
              ? t("settings.interface.background.effect.hintDim")
              : t("settings.interface.background.effect.hintOriginal")
      : t("settings.interface.background.effect.unavailable")
  ));
  const draftBackgroundImageName = computed(() => {
    const path = String(state.draftBackgroundImagePath.value || "").trim();
    if (!path) return isDraftWindowsWallpaper.value
      ? t("settings.interface.background.layer.waitingSync")
      : t("settings.interface.background.layer.builtIn");
    const name = path.split(/[\\/]/).filter(Boolean).pop() || "";
    if (isDraftWindowsWallpaper.value && /^background-[a-f0-9]{32}\./i.test(name)) {
      return t("settings.interface.background.layer.currentWallpaper");
    }
    return /^background-[a-f0-9]{32}\./i.test(name)
      ? t("settings.interface.background.layer.custom")
      : name || t("settings.interface.background.layer.custom");
  });
  const hasDraftBackgroundImagePreview = computed(() => Boolean(
    doesDraftBackgroundUseImage.value && state.draftBackgroundImageUrl.value
  ));
  const draftBackgroundImagePixelSize = useBackgroundImagePixelSize(() => (
    hasDraftBackgroundImagePreview.value ? state.draftBackgroundImageUrl.value : null
  ));
  const backgroundLayerPreviewLabel = computed(() => {
    if (!doesDraftBackgroundUseImage.value) return t("settings.interface.background.layer.none");
    return isDraftWindowsWallpaper.value
      ? t("settings.interface.background.layer.waitingWallpaper")
      : t("settings.interface.background.layer.selectImage");
  });
  const backgroundEffectPreviewLabel = computed(() => (
    isDraftWindowsWallpaper.value
      ? t("settings.interface.background.layer.waitingWallpaper")
      : t("preview.selectImageFirst")
  ));
  const effectiveDraftBackgroundAcrylicAppearance = computed(() => {
    return resolveAppearancePreference(
      normalizeBackgroundAcrylicAppearance(state.draftBackgroundAcrylicAppearance.value),
      options.systemAppearance.value,
      BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
    );
  });
  const draftBackgroundAcrylicPreviewParams = computed(() => {
    const appearance = effectiveDraftBackgroundAcrylicAppearance.value;
    const params = appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
      ? state.draftBackgroundAcrylicLightParams.value
      : state.draftBackgroundAcrylicDarkParams.value;
    return normalizeBackgroundAcrylicParams(params, appearance);
  });
  const draftBackgroundEffectBlurStrength = computed(() => (
    state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC
      ? state.draftBackgroundAcrylicBlurStrength.value
      : state.draftBackgroundBlurStrength.value
  ));
  const activeAcrylicParams = computed(() => (
    activeAcrylicParamsProfile.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
      ? state.draftBackgroundAcrylicLightParams.value
      : state.draftBackgroundAcrylicDarkParams.value
  ));
  const activeAcrylicTintColorHex = computed(() => rgbArrayToHex(activeAcrylicParams.value?.tintColor));
  const backgroundImageLayoutOptions = computed(() => [
    { layout: BACKGROUND_IMAGE_LAYOUT_FILL, label: t("settings.interface.background.layer.layout.fill") },
    { layout: BACKGROUND_IMAGE_LAYOUT_FIT, label: t("settings.interface.background.layer.layout.fit") },
    { layout: BACKGROUND_IMAGE_LAYOUT_STRETCH, label: t("settings.interface.background.layer.layout.stretch") },
    { layout: BACKGROUND_IMAGE_LAYOUT_TILE, label: t("settings.interface.background.layer.layout.tile") },
    { layout: BACKGROUND_IMAGE_LAYOUT_CENTER, label: t("settings.interface.background.layer.layout.center") },
  ]);

  function selectWindowEffectPreview(
    material: WindowEffectMaterial,
    appearance: WindowEffectAppearance,
  ): void {
    if (!state.canUseWindowEffectMaterial(material)) return;
    state.setDraftWindowEffectMaterial(material);
    state.setDraftWindowEffectAppearance(appearance);
  }

  function setDraftBackgroundAcrylicAppearance(appearance: AppearancePreference): void {
    state.setDraftBackgroundAcrylicAppearance(appearance);
    if (appearance === BACKGROUND_ACRYLIC_APPEARANCE_DARK || appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) {
      activeAcrylicParamsProfile.value = appearance;
    }
  }

  function setActiveDraftBackgroundAcrylicParam(key: keyof AcrylicParameters, value: unknown): void {
    state.setDraftBackgroundAcrylicParam(activeAcrylicParamsProfile.value, key, value);
  }

  function resetActiveDraftBackgroundAcrylicParams() {
    state.resetDraftBackgroundAcrylicParams(activeAcrylicParamsProfile.value);
  }

  function formatAcrylicPercent(value: unknown): string {
    const number = Number(value);
    return `${Math.round((Number.isFinite(number) ? number : 0) * 100)}%`;
  }

  const activeWindowEffectItem = computed(() => (
    windowEffectPreviewItems.value.find((item) => item.active) || windowEffectPreviewItems.value[0]
  ));
  const windowEffectSummary = computed(() => {
    const item = activeWindowEffectItem.value;
    if (!item) return t("settings.interface.window.notSet");
    return item.material === WINDOW_EFFECT_MATERIAL_NONE
      ? item.label
      : `${item.label} · ${item.appearanceLabel}`;
  });
  const activeBackgroundImageLayoutLabel = computed(() => (
    backgroundImageLayoutOptions.value.find((item) => item.layout === state.draftBackgroundImageLayout.value)?.label
    || backgroundImageLayoutOptions.value[0]?.label
    || t("settings.interface.background.layer.layout.fill")
  ));
  const backgroundLayerSourceLabel = computed(() => {
    if (state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE) return t("settings.interface.background.layer.custom");
    if (state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER) return t("settings.interface.background.layer.wallpaper");
    if (state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && canShowLiveDesktopControls.value) return t("settings.interface.background.layer.live");
    return t("settings.interface.background.layer.none");
  });
  const backgroundLayerSummary = computed(() => {
    if (doesDraftBackgroundUseLiveDesktop.value) return `${backgroundLayerSourceLabel.value} · ${state.draftBackgroundLiveDesktopOpacity.value}%`;
    if (doesDraftBackgroundUseImage.value) return `${backgroundLayerSourceLabel.value} · ${activeBackgroundImageLayoutLabel.value} · ${state.draftBackgroundImageOpacity.value}%`;
    return backgroundLayerSourceLabel.value;
  });
  const backgroundAcrylicAppearanceLabel = computed(() => {
    if (state.draftBackgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_DARK) return t("settings.interface.window.dark");
    if (state.draftBackgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) return t("settings.interface.window.light");
    return t("settings.interface.background.effect.system");
  });
  const backgroundEffectSummary = computed(() => {
    if (!doesDraftBackgroundUseLayer.value) return t("settings.interface.background.effect.unavailable");
    if (state.draftBackgroundEffect.value === BACKGROUND_EFFECT_BLUR) return `${t("settings.interface.background.effect.blur")} · ${state.draftBackgroundBlurStrength.value}%`;
    if (state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC) return `Acrylic · ${backgroundAcrylicAppearanceLabel.value} · ${state.draftBackgroundAcrylicBlurStrength.value}%`;
    if (state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED) return `${t("settings.interface.background.effect.dim")} · ${state.draftBackgroundDarkenStrength.value}%`;
    return t("settings.interface.background.effect.original");
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
    BACKGROUND_EFFECT_ACRYLIC,
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
    SETTINGS_THEME_DARK,
    SETTINGS_THEME_LIGHT,
    SETTINGS_THEME_SYSTEM,
    WINDOW_EFFECT_APPEARANCE_DARK,
    WINDOW_EFFECT_APPEARANCE_LIGHT,
    WINDOW_EFFECT_APPEARANCE_SYSTEM,
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
    canUseDraftBackgroundEffect: (effect: unknown) => state.canUseDraftBackgroundEffect(effect),
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
    settingsThemeOptions,
    resolvedSettingsTheme,
    systemAppearance: options.systemAppearance,
    windowEffectPreviewItems,
    windowEffectSummary,
  });

  const excludedAppsSearchQuery = ref("");
  const selectedExcludedAppKeys = ref<Set<string>>(new Set());
  const isKeywordBlacklistExpanded = ref(false);
  const keywordFilterFocusRequest = ref(0);
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
  const isExcludedAppsPage = computed(() => activeSubPage.value?.id === SETTINGS_SUBPAGE_SPECS.appsExcludedApps.id);
  const isAppManagerPage = computed(() => activeSubPage.value?.id === SETTINGS_SUBPAGE_SPECS.appsAppManager.id);
  const isAppsDetailPage = computed(() => isExcludedAppsPage.value || isAppManagerPage.value);

  function openKeywordFilters() {
    updateRoute("apps", null);
    isKeywordBlacklistExpanded.value = true;
    keywordFilterFocusRequest.value += 1;
  }

  function setExcludedAppsSearchQuery(value: string): void {
    excludedAppsSearchQuery.value = value;
  }

  function isExcludedAppSelected(key: string): boolean {
    return selectedExcludedAppKeys.value.has(key);
  }

  function toggleExcludedAppSelection(
    key: string,
    checked = !isExcludedAppSelected(key),
  ): void {
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

  function cancelScanExclusion(index: number, key?: string): void {
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

  function getExcludedAppName(app: ExcludedScanApp | null | undefined): string {
    return String(app?.name || app?.catalogId || t("settings.apps.unnamed"));
  }

  function getExcludedAppSubtitle(app: ExcludedScanApp | null | undefined): string {
    return String(app?.catalogId || t("settings.apps.catalogIdMissing"));
  }

  function getExcludedAppGlyph(app: ExcludedScanApp | null | undefined): string {
    const emoji = app && "emoji" in app ? app.emoji : null;
    const label = String(emoji || app?.name || app?.catalogId || "A").trim();
    return label.charAt(0).toLocaleUpperCase() || "A";
  }

  function formatScanTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return text.d(date, "scanTimestamp");
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
    isKeywordBlacklistExpanded,
    keywordFilterFocusRequest,
    selectedExcludedAppCount,
    selectedExcludedAppKeys,
    settingsSubPages,
    actions: Object.freeze({
      cancelScanExclusion,
      cancelSelectedScanExclusions,
      clearExcludedAppSelection,
      openAppManager: () => openSubPage(SETTINGS_SUBPAGE_SPECS.appsAppManager),
      openExcludedApps: () => openSubPage(SETTINGS_SUBPAGE_SPECS.appsExcludedApps),
      openKeywordFilters,
      selectAllFilteredExcludedApps,
      setExcludedAppsSearchQuery,
      toggleExcludedAppSelection,
    }),
  });

  const pages = Object.freeze({
    about: Object.freeze({
      appVersion: String(options.appVersion || ""),
      draftLaunchpadIconVariant: state.draftLaunchpadIconVariant,
    }),
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
    resolvedSettingsTheme,
    shouldRender: state.shouldRenderSettingsPanel,
    showFooter: computed(() => activeRoute.value.depth === 0 && ["general", "interface"].includes(activeTab.value)),
    tabs: settingsTabs,
    actions: Object.freeze({
      apply: state.applySettingsConfig,
      close: state.closeSettingsPanel,
      closeSubPage,
      openSubPage,
      selectTab,
      toggleNavigation: () => { isNavigationCompact.value = !isNavigationCompact.value; },
    }),
  });

  let liveDesktopStatusTimer: number | null = null;
  function clearLiveDesktopStatusTimer() {
    if (liveDesktopStatusTimer && typeof window !== "undefined") window.clearInterval(liveDesktopStatusTimer);
    liveDesktopStatusTimer = null;
  }
  function refreshLiveDesktopRuntimeStatus() {
    if (!canShowLiveDesktopControls.value) return;
    Promise.resolve(state.refreshLiveDesktopRuntimeStatus?.()).catch((error) => {
      console.error("Live Desktop runtime refresh failed; the failure was recorded in state", error);
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
