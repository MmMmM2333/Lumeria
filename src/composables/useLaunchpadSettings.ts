import { readonly, ref } from "vue";
import type { Ref } from "vue";
import { readErrorMessage } from "../application/errorMessage.js";
import type { AcrylicParameters, LayoutSettings } from "../domain/layoutDocument.js";
import type { AppearancePreference } from "../domain/appearancePreference.js";
import type { LaunchpadIconVariant } from "../domain/launchpadIconVariant.js";
import type { MainWindowEffectsSupport } from "../api/launchpadApi.js";
import type { LocaleState } from "../i18n/locale.js";
import type { LocalizationText } from "../i18n/localization.js";
import type {
  AutostartPort,
  BackgroundAssetPort,
  LaunchpadIconPort,
  LocaleRuntimePort,
} from "../platform/launchpadPorts.js";
import type { useLaunchpadLayout } from "./useLaunchpadLayout.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  normalizeMainWindowShortcut,
} from "../domain/mainWindowShortcut.js";
import {
  APPEARANCE_DARK,
  normalizeAppearancePreference,
} from "../domain/appearancePreference.js";
import {
  DEFAULT_LAUNCHPAD_ICON_VARIANT,
  normalizeLaunchpadIconVariant,
} from "../domain/launchpadIconVariant.js";
import {
  FOLDER_ICON_SIZE_MODE_CUSTOM,
  clampLaunchpadIconSize,
  normalizeFolderIconSizeMode,
} from "../domain/layoutConfiguration.js";
import {
  backgroundAssetPort,
  autostartPort as defaultAutostartPort,
  launchpadIconPort as defaultLaunchpadIconPort,
  localeRuntimePort as defaultLocaleRuntimePort,
} from "../platform/launchpadPorts.js";
import {
  DEFAULT_LOCALE_PREFERENCE,
  normalizeLocalePreference,
} from "../i18n/locale.js";
import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ROWS,
  ICON_SIZE_STEP,
} from "./launchpadConstants.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_BASE_OPACITY_MAX,
  BACKGROUND_BASE_OPACITY_STEP,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_IMAGE_OPACITY_STEP,
  BACKGROUND_LIVE_DESKTOP_OPACITY_STEP,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
  BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
  DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE,
  DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_BASE_COLOR,
  DEFAULT_BACKGROUND_BASE_OPACITY,
  DEFAULT_BACKGROUND_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_DARKEN_COLOR,
  DEFAULT_BACKGROUND_DARKEN_STRENGTH,
  DEFAULT_BACKGROUND_IMAGE_LAYOUT,
  DEFAULT_BACKGROUND_IMAGE_OPACITY,
  DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY,
  DEFAULT_FULLSCREEN_OVERSCAN_ENABLED,
  DEFAULT_SHOW_CUSTOM_TITLEBAR,
  DEFAULT_WINDOW_MODE,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_NONE,
  backgroundSourceUsesImage,
  backgroundSourceUsesLiveDesktop,
  clampBackgroundAcrylicBlurStrength,
  clampBackgroundBaseOpacity,
  clampBackgroundBlurStrength,
  clampBackgroundDarkenStrength,
  clampBackgroundImageOpacity,
  clampBackgroundLiveDesktopOpacity,
  createDefaultBackgroundAcrylicParams,
  normalizeBackgroundAcrylicAppearance,
  normalizeBackgroundAcrylicParams,
  normalizeBackgroundAcrylicProfileKey,
  normalizeBackgroundBaseColor,
  normalizeBackgroundDarkenColor,
  normalizeBackgroundEffect,
  normalizeBackgroundImageLayout,
  normalizeBackgroundImagePath,
  normalizeBackgroundSource,
  normalizeFullscreenOverscanEnabled,
  normalizeLiveDesktopBackgroundSupport,
  normalizeShowCustomTitlebar,
  normalizeWindowEffectAppearance,
  normalizeWindowEffectMaterial,
  normalizeWindowMode,
  resolveWindowEffectMaterialForSupport,
} from "./useLaunchpadSettingsConfig.js";
import type { NormalizedLiveDesktopBackgroundSupport } from "./useLaunchpadSettingsConfig.js";
import { backgroundEffectUsesPixi } from "../rendering/backgroundPort.js";
import { clamp } from "../domain/launchpadLayout.js";

const DEFAULT_SETTINGS_THEME_PREFERENCE = APPEARANCE_DARK;

export type LaunchpadSettingsRuntimeOptions = Readonly<{
  reclampPageIndices?: () => void;
  schedulePageGridMetrics?: () => void;
  syncLiveDesktop?: () => unknown | Promise<unknown>;
}>;
export type LaunchpadSettingsFragment = {
  readonly [TKey in keyof LayoutSettings]?: unknown;
};
export type MainWindowShortcutOutcome =
  | Readonly<{ ok: true; shortcut: string | null; skipped?: boolean }>
  | Readonly<{ ok: false; error: unknown }>;
export type LaunchpadSettingsMainWindow = Readonly<{
  support: Readonly<{ value: Partial<MainWindowEffectsSupport> }>;
  registerShortcut: (shortcut: string | null) => Promise<MainWindowShortcutOutcome>;
  setEffectsEnabled: (request: Readonly<{
    enabled: boolean;
    material: LayoutSettings["windowEffectMaterial"];
    appearance: LayoutSettings["windowEffectAppearance"];
  }>) => unknown | Promise<unknown>;
  setMode: (request: Readonly<{
    mode: LayoutSettings["windowMode"];
    fullscreenOverscanEnabled: boolean;
  }>) => unknown | Promise<unknown>;
}>;
export type LaunchpadSettingsOptions = Readonly<{
  activateLocale?: (state: LocaleState) => void;
  autostartPort?: AutostartPort;
  backgroundAssetPort?: BackgroundAssetPort;
  isDragActive?: () => boolean;
  launchpadIconPort?: LaunchpadIconPort;
  layout: ReturnType<typeof useLaunchpadLayout>;
  liveDesktopSupport: Readonly<{ value: Partial<NormalizedLiveDesktopBackgroundSupport> }>;
  localeRuntime?: Pick<LocaleRuntimePort, "applyPreference">;
  localizationText: Pick<LocalizationText, "t">;
  mainWindow: LaunchpadSettingsMainWindow;
}>;

export type LaunchpadSettingsFailure<TExtra extends object = object> =
  Readonly<{ ok: false; error: unknown }> & TExtra;

function mutableAcrylicParams(profile: unknown): AcrylicParameters {
  return { ...createDefaultBackgroundAcrylicParams(profile) };
}

function explicitFailure<TExtra extends object = object>(
  error: unknown,
  extra: TExtra = {} as TExtra,
): LaunchpadSettingsFailure<TExtra> {
  return { ok: false, error, ...extra };
}

function errorMessage(error: unknown, fallback: string): string {
  return readErrorMessage(error) || fallback;
}

export function useLaunchpadSettings(options: LaunchpadSettingsOptions) {
  const layout = options.layout;
  const mainWindow = options.mainWindow;
  const liveDesktopSupport = options.liveDesktopSupport;
  const backgroundAssets = options.backgroundAssetPort || backgroundAssetPort;
  const launchpadIcons = options.launchpadIconPort || defaultLaunchpadIconPort;
  const localeRuntime = options.localeRuntime || defaultLocaleRuntimePort;
  const autostart = options.autostartPort || defaultAutostartPort;
  const activateLocale = typeof options.activateLocale === "function" ? options.activateLocale : () => {};
  const t = options.localizationText?.t;
  if (typeof layout?.captureConfiguration !== "function" || typeof layout?.applyConfiguration !== "function") {
    throw new TypeError("useLaunchpadSettings requires layout");
  }
  if (!mainWindow?.support || typeof mainWindow.registerShortcut !== "function") {
    throw new TypeError("useLaunchpadSettings requires mainWindow");
  }
  if (!liveDesktopSupport || !("value" in liveDesktopSupport)) {
    throw new TypeError("useLaunchpadSettings requires liveDesktopSupport");
  }
  if (typeof localeRuntime?.applyPreference !== "function") {
    throw new TypeError("useLaunchpadSettings requires localeRuntime");
  }
  if (typeof launchpadIcons?.isAvailable !== "function" || typeof launchpadIcons?.applyVariant !== "function") {
    throw new TypeError("useLaunchpadSettings requires launchpadIconPort");
  }
  if (
    typeof autostart?.isAvailable !== "function"
    || typeof autostart?.getStatus !== "function"
    || typeof autostart?.setEnabled !== "function"
  ) {
    throw new TypeError("useLaunchpadSettings requires autostartPort");
  }
  if (typeof t !== "function") {
    throw new TypeError("useLaunchpadSettings requires localization text");
  }

  const isTextlessModeState = ref(false);
  const backgroundSourceState = ref<LayoutSettings["backgroundSource"]>(BACKGROUND_SOURCE_SYSTEM_MATERIAL);
  const backgroundEffectState = ref<LayoutSettings["backgroundEffect"]>(BACKGROUND_EFFECT_DIMMED);
  const backgroundBaseColorState = ref(DEFAULT_BACKGROUND_BASE_COLOR);
  const backgroundBaseOpacityState = ref(DEFAULT_BACKGROUND_BASE_OPACITY);
  const backgroundImageOpacityState = ref(DEFAULT_BACKGROUND_IMAGE_OPACITY);
  const backgroundLiveDesktopOpacityState = ref(DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY);
  const backgroundImageLayoutState = ref<LayoutSettings["backgroundImageLayout"]>(DEFAULT_BACKGROUND_IMAGE_LAYOUT);
  const backgroundBlurStrengthState = ref(DEFAULT_BACKGROUND_BLUR_STRENGTH);
  const backgroundAcrylicBlurStrengthState = ref(DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH);
  const backgroundDarkenStrengthState = ref(DEFAULT_BACKGROUND_DARKEN_STRENGTH);
  const backgroundDarkenColorState = ref(DEFAULT_BACKGROUND_DARKEN_COLOR);
  const backgroundAcrylicAppearanceState = ref<LayoutSettings["backgroundAcrylicAppearance"]>(DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE);
  const backgroundAcrylicDarkParamsState = ref(mutableAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_DARK));
  const backgroundAcrylicLightParamsState = ref(mutableAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_LIGHT));
  const backgroundImagePathState = ref<string | null>(null);
  const backgroundImageUrlState = ref<string | null>(null);
  const windowEffectMaterialState = ref<LayoutSettings["windowEffectMaterial"]>(WINDOW_EFFECT_MATERIAL_ACRYLIC);
  const windowEffectAppearanceState = ref<LayoutSettings["windowEffectAppearance"]>(WINDOW_EFFECT_APPEARANCE_DARK);
  const windowModeState = ref<LayoutSettings["windowMode"]>(DEFAULT_WINDOW_MODE);
  const fullscreenOverscanEnabledState = ref(DEFAULT_FULLSCREEN_OVERSCAN_ENABLED);
  const showCustomTitlebarState = ref(DEFAULT_SHOW_CUSTOM_TITLEBAR);
  const mainWindowShortcutState = ref<string | null>(DEFAULT_MAIN_WINDOW_SHORTCUT);
  const localePreferenceState = ref(DEFAULT_LOCALE_PREFERENCE);
  const settingsThemePreferenceState = ref<AppearancePreference>(DEFAULT_SETTINGS_THEME_PREFERENCE);
  const launchpadIconVariantState = ref<LaunchpadIconVariant>(DEFAULT_LAUNCHPAD_ICON_VARIANT);
  const launchAtLoginState = ref(false);
  const canConfigureLaunchAtLoginState = ref(Boolean(autostart.isAvailable()));
  const isRefreshingLaunchAtLoginState = ref(false);
  let launchAtLoginStatusRequestId = 0;

  const draftRows = ref(DEFAULT_ROWS);
  const draftCols = ref(DEFAULT_COLS);
  const draftFolderRows = ref(DEFAULT_FOLDER_ROWS);
  const draftFolderCols = ref(DEFAULT_FOLDER_COLS);
  const draftIconSize = ref(clampLaunchpadIconSize(null));
  const draftFolderIconSizeMode = ref<LayoutSettings["folderIconSizeMode"]>(normalizeFolderIconSizeMode(null));
  const draftFolderIconSize = ref(clampLaunchpadIconSize(null));
  const draftIsTextlessMode = ref(false);
  const draftBackgroundSource = ref<LayoutSettings["backgroundSource"]>(BACKGROUND_SOURCE_SYSTEM_MATERIAL);
  const draftBackgroundEffect = ref<LayoutSettings["backgroundEffect"]>(BACKGROUND_EFFECT_DIMMED);
  const draftBackgroundBaseColor = ref(DEFAULT_BACKGROUND_BASE_COLOR);
  const draftBackgroundBaseOpacity = ref(DEFAULT_BACKGROUND_BASE_OPACITY);
  const draftBackgroundImageOpacity = ref(DEFAULT_BACKGROUND_IMAGE_OPACITY);
  const draftBackgroundLiveDesktopOpacity = ref(DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY);
  const draftBackgroundImageLayout = ref<LayoutSettings["backgroundImageLayout"]>(DEFAULT_BACKGROUND_IMAGE_LAYOUT);
  const draftBackgroundBlurStrength = ref(DEFAULT_BACKGROUND_BLUR_STRENGTH);
  const draftBackgroundAcrylicBlurStrength = ref(DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH);
  const draftBackgroundDarkenStrength = ref(DEFAULT_BACKGROUND_DARKEN_STRENGTH);
  const draftBackgroundDarkenColor = ref(DEFAULT_BACKGROUND_DARKEN_COLOR);
  const draftBackgroundAcrylicAppearance = ref<LayoutSettings["backgroundAcrylicAppearance"]>(DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE);
  const draftBackgroundAcrylicDarkParams = ref(mutableAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_DARK));
  const draftBackgroundAcrylicLightParams = ref(mutableAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_LIGHT));
  const draftBackgroundImagePath = ref<string | null>(null);
  const draftBackgroundImageUrl = ref<string | null>(null);
  const draftWindowEffectMaterial = ref<LayoutSettings["windowEffectMaterial"]>(WINDOW_EFFECT_MATERIAL_ACRYLIC);
  const draftWindowEffectAppearance = ref<LayoutSettings["windowEffectAppearance"]>(WINDOW_EFFECT_APPEARANCE_DARK);
  const draftWindowMode = ref<LayoutSettings["windowMode"]>(DEFAULT_WINDOW_MODE);
  const draftFullscreenOverscanEnabled = ref(DEFAULT_FULLSCREEN_OVERSCAN_ENABLED);
  const draftShowCustomTitlebar = ref(DEFAULT_SHOW_CUSTOM_TITLEBAR);
  const draftMainWindowShortcut = ref<string | null>(DEFAULT_MAIN_WINDOW_SHORTCUT);
  const draftLocalePreference = ref(DEFAULT_LOCALE_PREFERENCE);
  const draftSettingsThemePreference = ref<AppearancePreference>(DEFAULT_SETTINGS_THEME_PREFERENCE);
  const draftLaunchpadIconVariant = ref<LaunchpadIconVariant>(DEFAULT_LAUNCHPAD_ICON_VARIANT);
  const draftLaunchAtLogin = ref(false);
  const mainWindowShortcutErrorState = ref("");
  const localePreferenceErrorState = ref("");
  const launchpadIconErrorState = ref("");
  const launchAtLoginErrorState = ref("");
  const canCustomizeLaunchpadIconState = ref(Boolean(launchpadIcons.isAvailable()));
  const isApplyingSettingsConfigState = ref(false);
  const isChoosingBackgroundImageState = ref(false);
  let backgroundRequestId = 0;

  function canUseLiveDesktopBackground() {
    return Boolean(
      isLiveDesktopExperimentEnabled()
      && normalizeLiveDesktopBackgroundSupport(liveDesktopSupport.value).supportsLiveDesktopBackground
    );
  }

  function syncDraftsFromCommitted() {
    const currentLayout = layout.captureConfiguration();
    draftRows.value = currentLayout.rows;
    draftCols.value = currentLayout.cols;
    draftFolderRows.value = currentLayout.folderRows;
    draftFolderCols.value = currentLayout.folderCols;
    draftIconSize.value = currentLayout.iconSize;
    draftFolderIconSizeMode.value = currentLayout.folderIconSizeMode;
    draftFolderIconSize.value = currentLayout.folderIconSize;
    draftIsTextlessMode.value = isTextlessModeState.value;
    draftBackgroundSource.value = backgroundSourceState.value;
    draftBackgroundEffect.value = backgroundEffectState.value;
    draftBackgroundBaseColor.value = backgroundBaseColorState.value;
    draftBackgroundBaseOpacity.value = backgroundBaseOpacityState.value;
    draftBackgroundImageOpacity.value = backgroundImageOpacityState.value;
    draftBackgroundLiveDesktopOpacity.value = backgroundLiveDesktopOpacityState.value;
    draftBackgroundImageLayout.value = backgroundImageLayoutState.value;
    draftBackgroundBlurStrength.value = backgroundBlurStrengthState.value;
    draftBackgroundAcrylicBlurStrength.value = backgroundAcrylicBlurStrengthState.value;
    draftBackgroundDarkenStrength.value = backgroundDarkenStrengthState.value;
    draftBackgroundDarkenColor.value = backgroundDarkenColorState.value;
    draftBackgroundAcrylicAppearance.value = backgroundAcrylicAppearanceState.value;
    draftBackgroundAcrylicDarkParams.value = normalizeBackgroundAcrylicParams(
      backgroundAcrylicDarkParamsState.value,
      BACKGROUND_ACRYLIC_APPEARANCE_DARK
    );
    draftBackgroundAcrylicLightParams.value = normalizeBackgroundAcrylicParams(
      backgroundAcrylicLightParamsState.value,
      BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    );
    draftBackgroundImagePath.value = backgroundImagePathState.value;
    draftBackgroundImageUrl.value = backgroundImageUrlState.value;
    draftWindowEffectMaterial.value = windowEffectMaterialState.value;
    draftWindowEffectAppearance.value = windowEffectAppearanceState.value;
    draftWindowMode.value = windowModeState.value;
    draftFullscreenOverscanEnabled.value = fullscreenOverscanEnabledState.value;
    draftShowCustomTitlebar.value = showCustomTitlebarState.value;
    draftMainWindowShortcut.value = mainWindowShortcutState.value;
    draftLocalePreference.value = localePreferenceState.value;
    draftSettingsThemePreference.value = settingsThemePreferenceState.value;
    draftLaunchpadIconVariant.value = launchpadIconVariantState.value;
    draftLaunchAtLogin.value = launchAtLoginState.value;
  }

  async function refreshLaunchAtLoginStatus() {
    const requestId = ++launchAtLoginStatusRequestId;
    const available = Boolean(autostart.isAvailable());
    canConfigureLaunchAtLoginState.value = available;
    if (!available) {
      isRefreshingLaunchAtLoginState.value = false;
      launchAtLoginErrorState.value = "";
      return { ok: true, available: false, status: false };
    }
    isRefreshingLaunchAtLoginState.value = true;
    launchAtLoginErrorState.value = "";
    try {
      const status = Boolean(await autostart.getStatus());
      if (requestId !== launchAtLoginStatusRequestId) return { ok: true, stale: true };
      launchAtLoginState.value = status;
      draftLaunchAtLogin.value = status;
      return { ok: true, available: true, status };
    } catch (error) {
      if (requestId !== launchAtLoginStatusRequestId) return { ok: true, stale: true };
      launchAtLoginErrorState.value = errorMessage(error, t("settings.general.startup.unavailable"));
      return explicitFailure(error);
    } finally {
      if (requestId === launchAtLoginStatusRequestId) isRefreshingLaunchAtLoginState.value = false;
    }
  }

  function beginEdit() {
    backgroundRequestId++;
    isChoosingBackgroundImageState.value = false;
    mainWindowShortcutErrorState.value = "";
    localePreferenceErrorState.value = "";
    launchpadIconErrorState.value = "";
    launchAtLoginErrorState.value = "";
    syncDraftsFromCommitted();
    void refreshLaunchAtLoginStatus();
  }

  function cancelEdit() {
    backgroundRequestId++;
    isChoosingBackgroundImageState.value = false;
    mainWindowShortcutErrorState.value = "";
    localePreferenceErrorState.value = "";
    launchpadIconErrorState.value = "";
    launchAtLoginErrorState.value = "";
    syncDraftsFromCommitted();
  }

  function changeDraftRows(delta: number): void {
    draftRows.value = clamp(Number(draftRows.value) + delta || DEFAULT_ROWS, 2, 8);
  }

  function changeDraftCols(delta: number): void {
    draftCols.value = clamp(Number(draftCols.value) + delta || DEFAULT_COLS, 3, 10);
  }

  function changeDraftFolderRows(delta: number): void {
    draftFolderRows.value = clamp(Number(draftFolderRows.value) + delta || DEFAULT_FOLDER_ROWS, 2, 6);
  }

  function changeDraftFolderCols(delta: number): void {
    draftFolderCols.value = clamp(Number(draftFolderCols.value) + delta || DEFAULT_FOLDER_COLS, 2, 8);
  }

  function changeDraftIconSize(direction: number): void {
    draftIconSize.value = clampLaunchpadIconSize(draftIconSize.value + direction * ICON_SIZE_STEP);
  }

  function changeDraftFolderIconSize(direction: number): void {
    draftFolderIconSize.value = clampLaunchpadIconSize(draftFolderIconSize.value + direction * ICON_SIZE_STEP);
  }

  function setDraftFolderIconSizeMode(mode: unknown): void {
    const nextMode = normalizeFolderIconSizeMode(mode);
    if (
      nextMode === FOLDER_ICON_SIZE_MODE_CUSTOM
      && draftFolderIconSizeMode.value !== FOLDER_ICON_SIZE_MODE_CUSTOM
      && layout.captureConfiguration().folderIconSizeMode !== FOLDER_ICON_SIZE_MODE_CUSTOM
    ) {
      draftFolderIconSize.value = clampLaunchpadIconSize(draftIconSize.value);
    }
    draftFolderIconSizeMode.value = nextMode;
    draftFolderIconSize.value = clampLaunchpadIconSize(draftFolderIconSize.value);
  }

  function canUseLiveDesktopBackgroundEffect(effect: unknown): boolean {
    return canUseLiveDesktopBackground() && Boolean(normalizeBackgroundEffect(effect));
  }

  function canUseDraftBackgroundEffect(effect: unknown): boolean {
    if (backgroundSourceUsesImage(draftBackgroundSource.value)) return true;
    if (backgroundSourceUsesLiveDesktop(draftBackgroundSource.value)) {
      return canUseLiveDesktopBackgroundEffect(effect);
    }
    return false;
  }

  function setDraftBackgroundSource(source: unknown): void {
    const nextSource = normalizeBackgroundSource(source);
    if (backgroundSourceUsesLiveDesktop(nextSource) && !canUseLiveDesktopBackground()) return;
    draftBackgroundSource.value = nextSource;
    if (!backgroundSourceUsesImage(nextSource)) {
      draftBackgroundImagePath.value = null;
      draftBackgroundImageUrl.value = null;
      if (!backgroundSourceUsesLiveDesktop(nextSource) || !canUseLiveDesktopBackgroundEffect(draftBackgroundEffect.value)) {
        draftBackgroundEffect.value = BACKGROUND_EFFECT_DIMMED;
      }
    }
  }

  function setDraftBackgroundEffect(effect: unknown): void {
    const nextEffect = normalizeBackgroundEffect(effect);
    draftBackgroundEffect.value = canUseDraftBackgroundEffect(nextEffect)
      ? nextEffect
      : BACKGROUND_EFFECT_DIMMED;
  }

  function setDraftBackgroundImageOpacity(value: unknown): void {
    draftBackgroundImageOpacity.value = clampBackgroundImageOpacity(value);
  }

  function setDraftBackgroundLiveDesktopOpacity(value: unknown): void {
    draftBackgroundLiveDesktopOpacity.value = clampBackgroundLiveDesktopOpacity(value);
  }

  function setDraftBackgroundImageLayout(value: unknown): void {
    draftBackgroundImageLayout.value = normalizeBackgroundImageLayout(value);
  }

  function setDraftBackgroundBlurStrength(value: unknown): void {
    draftBackgroundBlurStrength.value = clampBackgroundBlurStrength(value);
  }

  function setDraftBackgroundAcrylicBlurStrength(value: unknown): void {
    draftBackgroundAcrylicBlurStrength.value = clampBackgroundAcrylicBlurStrength(value);
  }

  function setDraftBackgroundDarkenStrength(value: unknown): void {
    draftBackgroundDarkenStrength.value = clampBackgroundDarkenStrength(value);
  }

  function setDraftBackgroundDarkenColor(value: unknown): void {
    draftBackgroundDarkenColor.value = normalizeBackgroundDarkenColor(value);
  }

  function setDraftBackgroundAcrylicAppearance(value: unknown): void {
    draftBackgroundAcrylicAppearance.value = normalizeBackgroundAcrylicAppearance(value);
  }

  function getDraftBackgroundAcrylicParamsRef(profile: unknown): Ref<AcrylicParameters> {
    return normalizeBackgroundAcrylicProfileKey(profile) === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
      ? draftBackgroundAcrylicLightParams
      : draftBackgroundAcrylicDarkParams;
  }

  function setDraftBackgroundAcrylicParam(
    profile: unknown,
    key: keyof AcrylicParameters,
    value: unknown,
  ): void {
    const target = getDraftBackgroundAcrylicParamsRef(profile);
    const profileKey = normalizeBackgroundAcrylicProfileKey(profile);
    const current = normalizeBackgroundAcrylicParams(target.value, profileKey);
    if (!Object.prototype.hasOwnProperty.call(current, key)) return;
    target.value = normalizeBackgroundAcrylicParams({
      ...current,
      [key]: key === "tintColor" ? value : Number(value),
    }, profileKey);
  }

  function resetDraftBackgroundAcrylicParams(profile: unknown): void {
    const profileKey = normalizeBackgroundAcrylicProfileKey(profile);
    getDraftBackgroundAcrylicParamsRef(profile).value = createDefaultBackgroundAcrylicParams(profileKey);
  }

  function changeDraftBackgroundImageOpacity(direction: number): void {
    setDraftBackgroundImageOpacity(Number(draftBackgroundImageOpacity.value) + direction * BACKGROUND_IMAGE_OPACITY_STEP);
  }

  function changeDraftBackgroundLiveDesktopOpacity(direction: number): void {
    setDraftBackgroundLiveDesktopOpacity(Number(draftBackgroundLiveDesktopOpacity.value) + direction * BACKGROUND_LIVE_DESKTOP_OPACITY_STEP);
  }

  function setDraftBackgroundBaseColor(value: unknown): void {
    draftBackgroundBaseColor.value = normalizeBackgroundBaseColor(value);
  }

  function setDraftBackgroundBaseOpacity(value: unknown): void {
    draftBackgroundBaseOpacity.value = clampBackgroundBaseOpacity(value);
  }

  function changeDraftBackgroundBaseOpacity(direction: number): void {
    setDraftBackgroundBaseOpacity(Number(draftBackgroundBaseOpacity.value) + direction * BACKGROUND_BASE_OPACITY_STEP);
  }

  async function chooseDraftBackgroundImage() {
    if (isChoosingBackgroundImageState.value) return { ok: true, skipped: true };
    const requestId = ++backgroundRequestId;
    isChoosingBackgroundImageState.value = true;
    try {
      const selected = await backgroundAssets.pickImage();
      if (requestId !== backgroundRequestId) return { ok: true, skipped: true };
      const imagePath = normalizeBackgroundImagePath(selected?.imagePath);
      if (!imagePath) return { ok: true, skipped: true };
      draftBackgroundImagePath.value = imagePath;
      draftBackgroundImageUrl.value = backgroundAssets.toAssetUrl(imagePath);
      draftBackgroundSource.value = BACKGROUND_SOURCE_CUSTOM_IMAGE;
      draftBackgroundEffect.value = BACKGROUND_EFFECT_DIMMED;
      return { ok: true, imagePath };
    } catch (error) {
      return explicitFailure(error);
    } finally {
      if (requestId === backgroundRequestId) isChoosingBackgroundImageState.value = false;
    }
  }

  async function useDraftDesktopWallpaper() {
    if (isChoosingBackgroundImageState.value) return { ok: true, skipped: true };
    const requestId = ++backgroundRequestId;
    isChoosingBackgroundImageState.value = true;
    try {
      const selected = await backgroundAssets.getDesktopWallpaper();
      if (requestId !== backgroundRequestId) return { ok: true, skipped: true };
      const imagePath = normalizeBackgroundImagePath(selected?.imagePath);
      if (!imagePath) return { ok: true, skipped: true };
      draftBackgroundImagePath.value = imagePath;
      draftBackgroundImageUrl.value = backgroundAssets.toAssetUrl(imagePath);
      draftBackgroundSource.value = BACKGROUND_SOURCE_WINDOWS_WALLPAPER;
      draftBackgroundEffect.value = BACKGROUND_EFFECT_DIMMED;
      return { ok: true, imagePath };
    } catch (error) {
      return explicitFailure(error);
    } finally {
      if (requestId === backgroundRequestId) isChoosingBackgroundImageState.value = false;
    }
  }

  function clearDraftBackgroundImage() {
    draftBackgroundImagePath.value = null;
    draftBackgroundImageUrl.value = null;
    draftBackgroundSource.value = BACKGROUND_SOURCE_SYSTEM_MATERIAL;
  }

  function canUseWindowEffectMaterial(material: unknown): boolean {
    const normalized = normalizeWindowEffectMaterial(material);
    if (normalized === WINDOW_EFFECT_MATERIAL_NONE) return true;
    const support = mainWindow.support.value;
    if (normalized === "acrylic") return Boolean(support.supportsAcrylic);
    if (normalized === "mica") return Boolean(support.supportsMica);
    if (normalized === "micaAlt") return Boolean(support.supportsMicaAlt);
    return false;
  }

  function setDraftWindowEffectMaterial(value: unknown): void {
    const next = normalizeWindowEffectMaterial(value);
    if (!canUseWindowEffectMaterial(next)) return;
    draftWindowEffectMaterial.value = next;
    if (next === WINDOW_EFFECT_MATERIAL_NONE && clampBackgroundBaseOpacity(draftBackgroundBaseOpacity.value) === 0) {
      draftBackgroundBaseOpacity.value = BACKGROUND_BASE_OPACITY_MAX;
    }
  }

  function setDraftWindowEffectAppearance(value: unknown): void {
    draftWindowEffectAppearance.value = normalizeWindowEffectAppearance(value);
  }

  function setDraftWindowMode(value: unknown): void {
    draftWindowMode.value = normalizeWindowMode(value);
  }

  function setDraftFullscreenOverscanEnabled(value: unknown): void {
    draftFullscreenOverscanEnabled.value = normalizeFullscreenOverscanEnabled(value);
  }

  function setDraftShowCustomTitlebar(value: unknown): void {
    draftShowCustomTitlebar.value = normalizeShowCustomTitlebar(value);
  }

  function setDraftMainWindowShortcut(value: unknown): void {
    draftMainWindowShortcut.value = normalizeMainWindowShortcut(value);
    mainWindowShortcutErrorState.value = "";
  }

  function setDraftLocalePreference(value: unknown): void {
    draftLocalePreference.value = normalizeLocalePreference(value);
    localePreferenceErrorState.value = "";
  }

  function setDraftSettingsThemePreference(value: unknown): void {
    draftSettingsThemePreference.value = normalizeAppearancePreference(value);
  }

  function setDraftLaunchpadIconVariant(value: unknown): void {
    draftLaunchpadIconVariant.value = normalizeLaunchpadIconVariant(value);
    launchpadIconErrorState.value = "";
  }

  function setDraftLaunchAtLogin(value: unknown): void {
    draftLaunchAtLogin.value = Boolean(value);
    launchAtLoginErrorState.value = "";
  }

  function setMainWindowShortcutError(value: unknown): void {
    mainWindowShortcutErrorState.value = String(value || "");
  }

  function commitDraft(
    nextShortcut: string | null,
    nextLocalePreference: string,
    nextLaunchpadIconVariant: LaunchpadIconVariant,
    nextLaunchAtLogin: boolean,
    runtimeOptions: LaunchpadSettingsRuntimeOptions,
  ) {
    let appliedLayout = layout.captureConfiguration();
    if (!options.isDragActive?.()) {
      appliedLayout = layout.applyConfiguration({
        rows: draftRows.value,
        cols: draftCols.value,
        folderRows: draftFolderRows.value,
        folderCols: draftFolderCols.value,
        iconSize: draftIconSize.value,
        folderIconSizeMode: draftFolderIconSizeMode.value,
        folderIconSize: draftFolderIconSize.value,
      });
      runtimeOptions.reclampPageIndices?.();
      isTextlessModeState.value = Boolean(draftIsTextlessMode.value);
    }
    runtimeOptions.schedulePageGridMetrics?.();

    const requestedSource = normalizeBackgroundSource(draftBackgroundSource.value);
    const usesImage = backgroundSourceUsesImage(requestedSource);
    const usesLiveDesktop = backgroundSourceUsesLiveDesktop(requestedSource) && canUseLiveDesktopBackground();
    const imagePath = usesImage ? normalizeBackgroundImagePath(draftBackgroundImagePath.value) : null;
    const normalizedEffect = normalizeBackgroundEffect(draftBackgroundEffect.value);
    const effect = !usesLiveDesktop && backgroundEffectUsesPixi(normalizedEffect) && !imagePath
      ? BACKGROUND_EFFECT_DIMMED
      : normalizedEffect;

    backgroundSourceState.value = usesLiveDesktop || imagePath
      ? requestedSource
      : BACKGROUND_SOURCE_SYSTEM_MATERIAL;
    backgroundEffectState.value = effect;
    backgroundBaseColorState.value = normalizeBackgroundBaseColor(draftBackgroundBaseColor.value);
    backgroundBaseOpacityState.value = clampBackgroundBaseOpacity(draftBackgroundBaseOpacity.value);
    backgroundImageOpacityState.value = clampBackgroundImageOpacity(draftBackgroundImageOpacity.value);
    backgroundLiveDesktopOpacityState.value = clampBackgroundLiveDesktopOpacity(draftBackgroundLiveDesktopOpacity.value);
    backgroundImageLayoutState.value = normalizeBackgroundImageLayout(draftBackgroundImageLayout.value);
    backgroundBlurStrengthState.value = clampBackgroundBlurStrength(draftBackgroundBlurStrength.value);
    backgroundAcrylicBlurStrengthState.value = clampBackgroundAcrylicBlurStrength(draftBackgroundAcrylicBlurStrength.value);
    backgroundDarkenStrengthState.value = clampBackgroundDarkenStrength(draftBackgroundDarkenStrength.value);
    backgroundDarkenColorState.value = normalizeBackgroundDarkenColor(draftBackgroundDarkenColor.value);
    backgroundAcrylicAppearanceState.value = normalizeBackgroundAcrylicAppearance(draftBackgroundAcrylicAppearance.value);
    backgroundAcrylicDarkParamsState.value = normalizeBackgroundAcrylicParams(draftBackgroundAcrylicDarkParams.value, BACKGROUND_ACRYLIC_APPEARANCE_DARK);
    backgroundAcrylicLightParamsState.value = normalizeBackgroundAcrylicParams(draftBackgroundAcrylicLightParams.value, BACKGROUND_ACRYLIC_APPEARANCE_LIGHT);
    backgroundImagePathState.value = imagePath;
    backgroundImageUrlState.value = imagePath
      ? draftBackgroundImageUrl.value || backgroundAssets.toAssetUrl(imagePath)
      : null;
    windowEffectMaterialState.value = resolveWindowEffectMaterialForSupport(
      draftWindowEffectMaterial.value,
      mainWindow.support.value
    );
    windowEffectAppearanceState.value = normalizeWindowEffectAppearance(draftWindowEffectAppearance.value);
    windowModeState.value = normalizeWindowMode(draftWindowMode.value);
    fullscreenOverscanEnabledState.value = normalizeFullscreenOverscanEnabled(draftFullscreenOverscanEnabled.value);
    showCustomTitlebarState.value = normalizeShowCustomTitlebar(draftShowCustomTitlebar.value);
    mainWindowShortcutState.value = nextShortcut;
    localePreferenceState.value = nextLocalePreference;
    settingsThemePreferenceState.value = normalizeAppearancePreference(draftSettingsThemePreference.value);
    launchpadIconVariantState.value = nextLaunchpadIconVariant;
    launchAtLoginState.value = Boolean(nextLaunchAtLogin);
    syncDraftsFromCommitted();
    return appliedLayout;
  }

  async function applyEdit(runtimeOptions: LaunchpadSettingsRuntimeOptions = {}) {
    const currentShortcut = normalizeMainWindowShortcut(mainWindowShortcutState.value);
    const nextShortcut = normalizeMainWindowShortcut(draftMainWindowShortcut.value);
    const currentLocalePreference = normalizeLocalePreference(localePreferenceState.value);
    const nextLocalePreference = normalizeLocalePreference(draftLocalePreference.value);
    const currentLaunchpadIconVariant = normalizeLaunchpadIconVariant(launchpadIconVariantState.value);
    const nextLaunchpadIconVariant = normalizeLaunchpadIconVariant(draftLaunchpadIconVariant.value);
    const currentLaunchAtLogin = Boolean(launchAtLoginState.value);
    const nextLaunchAtLogin = Boolean(draftLaunchAtLogin.value);
    mainWindowShortcutErrorState.value = "";
    localePreferenceErrorState.value = "";
    launchpadIconErrorState.value = "";
    launchAtLoginErrorState.value = "";
    isApplyingSettingsConfigState.value = true;
    try {
      let appliedLocaleState = null;
      if (nextLocalePreference !== currentLocalePreference) {
        const localeOutcome = await localeRuntime.applyPreference(nextLocalePreference);
        if (!localeOutcome?.ok) {
          const localeError = localeOutcome?.error || new Error("Unable to apply language");
          localePreferenceErrorState.value = localeError.message;
          return explicitFailure(localeError);
        }
        appliedLocaleState = localeOutcome.state;
      }

      let shortcutApplied = false;
      if (nextShortcut !== currentShortcut) {
        let shortcutOutcome;
        try {
          shortcutOutcome = await mainWindow.registerShortcut(nextShortcut);
        } catch (error) {
          shortcutOutcome = explicitFailure(error);
        }
        if (!shortcutOutcome.ok) {
          if (appliedLocaleState) {
            const rollbackOutcome = await localeRuntime.applyPreference(currentLocalePreference);
            if (!rollbackOutcome?.ok) {
              const rollbackError = rollbackOutcome?.error || new Error("Unable to restore previous language");
              localePreferenceErrorState.value = rollbackError.message;
              return explicitFailure(shortcutOutcome.error, { rollbackError });
            }
          }
          mainWindowShortcutErrorState.value = errorMessage(
            shortcutOutcome.error,
            t("settings.general.shortcut.unavailable"),
          );
          return explicitFailure(shortcutOutcome.error);
        }
        shortcutApplied = true;
      }

      let launchpadIconApplied = false;
      if (nextLaunchpadIconVariant !== currentLaunchpadIconVariant) {
        let iconError = null;
        if (!launchpadIcons.isAvailable()) {
          iconError = new Error(t("settings.general.launchpadIcon.unavailable"));
        } else {
          try {
            const appliedVariant = await launchpadIcons.applyVariant(nextLaunchpadIconVariant);
            if (appliedVariant !== nextLaunchpadIconVariant) {
              throw new Error(`Native icon runtime returned an unexpected variant: ${String(appliedVariant)}`);
            }
          } catch (error) {
            iconError = error;
          }
        }

        if (iconError) {
          const rollbackErrors = [];
          if (shortcutApplied) {
            const shortcutRollback = await mainWindow.registerShortcut(currentShortcut);
            if (!shortcutRollback.ok) {
              rollbackErrors.push(shortcutRollback.error);
              mainWindowShortcutErrorState.value = errorMessage(shortcutRollback.error, t("settings.general.shortcut.unavailable"));
            }
          }
          if (appliedLocaleState) {
            const localeRollback = await localeRuntime.applyPreference(currentLocalePreference);
            if (!localeRollback?.ok) {
              const rollbackError = localeRollback?.error || new Error("Unable to restore previous language");
              rollbackErrors.push(rollbackError);
              localePreferenceErrorState.value = rollbackError.message;
            }
          }
          launchpadIconErrorState.value = errorMessage(iconError, t("settings.general.launchpadIcon.applyFailed"));
          return explicitFailure(iconError, rollbackErrors.length ? { rollbackErrors } : {});
        }
        launchpadIconApplied = true;
      }

      let startupAttempted = false;
      if (nextLaunchAtLogin !== currentLaunchAtLogin) {
        let startupError = null;
        if (!autostart.isAvailable()) {
          startupError = new Error(t("settings.general.startup.unavailable"));
        } else {
          startupAttempted = true;
          try {
            const appliedStatus = Boolean(await autostart.setEnabled(nextLaunchAtLogin));
            if (appliedStatus !== nextLaunchAtLogin) {
              throw new Error(`Autostart runtime returned an unexpected status: ${String(appliedStatus)}`);
            }
          } catch (error) {
            startupError = error;
          }
        }

        if (startupError) {
          const rollbackErrors = [];
          if (startupAttempted) {
            try {
              await autostart.setEnabled(currentLaunchAtLogin);
            } catch (error) {
              rollbackErrors.push(error);
            }
          }
          if (launchpadIconApplied) {
            try {
              const restoredVariant = await launchpadIcons.applyVariant(currentLaunchpadIconVariant);
              if (restoredVariant !== currentLaunchpadIconVariant) {
                throw new Error(`Native icon runtime returned an unexpected rollback variant: ${String(restoredVariant)}`);
              }
            } catch (error) {
              rollbackErrors.push(error);
              launchpadIconErrorState.value = errorMessage(error, t("settings.general.launchpadIcon.applyFailed"));
            }
          }
          if (shortcutApplied) {
            const shortcutRollback = await mainWindow.registerShortcut(currentShortcut);
            if (!shortcutRollback.ok) {
              rollbackErrors.push(shortcutRollback.error);
              mainWindowShortcutErrorState.value = errorMessage(shortcutRollback.error, t("settings.general.shortcut.unavailable"));
            }
          }
          if (appliedLocaleState) {
            const localeRollback = await localeRuntime.applyPreference(currentLocalePreference);
            if (!localeRollback?.ok) {
              const rollbackError = localeRollback?.error || new Error("Unable to restore previous language");
              rollbackErrors.push(rollbackError);
              localePreferenceErrorState.value = rollbackError.message;
            }
          }
          launchAtLoginErrorState.value = errorMessage(startupError, t("settings.general.startup.applyFailed"));
          return explicitFailure(startupError, rollbackErrors.length ? { rollbackErrors } : {});
        }
      }

      const appliedLayout = commitDraft(
        nextShortcut,
        nextLocalePreference,
        nextLaunchpadIconVariant,
        nextLaunchAtLogin,
        runtimeOptions,
      );
      if (appliedLocaleState) activateLocale(appliedLocaleState);
      const modeOutcome = await mainWindow.setMode({
        mode: windowModeState.value,
        fullscreenOverscanEnabled: fullscreenOverscanEnabledState.value,
      });
      const effectsOutcome = await mainWindow.setEffectsEnabled({
        enabled: true,
        material: windowEffectMaterialState.value,
        appearance: windowEffectAppearanceState.value,
      });
      const liveDesktopOutcome = await runtimeOptions.syncLiveDesktop?.();
      return {
        ok: true as const,
        appliedLayout,
        platform: { effects: effectsOutcome, liveDesktop: liveDesktopOutcome, mode: modeOutcome },
      };
    } finally {
      isApplyingSettingsConfigState.value = false;
    }
  }

  function restore(fragment: LaunchpadSettingsFragment = {}): void {
    isTextlessModeState.value = Boolean(fragment.textless);
    const requestedSource = normalizeBackgroundSource(fragment.backgroundSource);
    const usesLiveDesktop = backgroundSourceUsesLiveDesktop(requestedSource) && canUseLiveDesktopBackground();
    const imagePath = backgroundSourceUsesImage(requestedSource)
      ? normalizeBackgroundImagePath(fragment.backgroundImagePath)
      : null;
    const normalizedEffect = normalizeBackgroundEffect(fragment.backgroundEffect);
    backgroundSourceState.value = usesLiveDesktop || imagePath
      ? requestedSource
      : BACKGROUND_SOURCE_SYSTEM_MATERIAL;
    backgroundEffectState.value = !usesLiveDesktop && backgroundEffectUsesPixi(normalizedEffect) && !imagePath
      ? BACKGROUND_EFFECT_DIMMED
      : normalizedEffect;
    backgroundBaseColorState.value = normalizeBackgroundBaseColor(fragment.backgroundBaseColor);
    backgroundBaseOpacityState.value = clampBackgroundBaseOpacity(fragment.backgroundBaseOpacity);
    backgroundImageOpacityState.value = clampBackgroundImageOpacity(fragment.backgroundImageOpacity);
    backgroundLiveDesktopOpacityState.value = clampBackgroundLiveDesktopOpacity(fragment.backgroundLiveDesktopOpacity);
    backgroundImageLayoutState.value = normalizeBackgroundImageLayout(fragment.backgroundImageLayout);
    backgroundBlurStrengthState.value = clampBackgroundBlurStrength(fragment.backgroundBlurStrength);
    backgroundAcrylicBlurStrengthState.value = clampBackgroundAcrylicBlurStrength(fragment.backgroundAcrylicBlurStrength);
    backgroundDarkenStrengthState.value = clampBackgroundDarkenStrength(fragment.backgroundDarkenStrength);
    backgroundDarkenColorState.value = normalizeBackgroundDarkenColor(fragment.backgroundDarkenColor);
    backgroundAcrylicAppearanceState.value = normalizeBackgroundAcrylicAppearance(fragment.backgroundAcrylicAppearance);
    backgroundAcrylicDarkParamsState.value = normalizeBackgroundAcrylicParams(fragment.backgroundAcrylicDarkParams, BACKGROUND_ACRYLIC_APPEARANCE_DARK);
    backgroundAcrylicLightParamsState.value = normalizeBackgroundAcrylicParams(fragment.backgroundAcrylicLightParams, BACKGROUND_ACRYLIC_APPEARANCE_LIGHT);
    backgroundImagePathState.value = imagePath;
    backgroundImageUrlState.value = imagePath ? backgroundAssets.toAssetUrl(imagePath) : null;
    windowEffectMaterialState.value = resolveWindowEffectMaterialForSupport(fragment.windowEffectMaterial, mainWindow.support.value);
    windowEffectAppearanceState.value = normalizeWindowEffectAppearance(fragment.windowEffectAppearance);
    windowModeState.value = normalizeWindowMode(fragment.windowMode);
    fullscreenOverscanEnabledState.value = normalizeFullscreenOverscanEnabled(fragment.fullscreenOverscanEnabled);
    showCustomTitlebarState.value = normalizeShowCustomTitlebar(fragment.showCustomTitlebar);
    mainWindowShortcutState.value = normalizeMainWindowShortcut(fragment.mainWindowShortcut);
    localePreferenceState.value = normalizeLocalePreference(fragment.localePreference);
    settingsThemePreferenceState.value = normalizeAppearancePreference(fragment.settingsThemePreference);
    launchpadIconVariantState.value = normalizeLaunchpadIconVariant(fragment.launchpadIconVariant);
    mainWindowShortcutErrorState.value = "";
    localePreferenceErrorState.value = "";
    launchpadIconErrorState.value = "";
    launchAtLoginErrorState.value = "";
    syncDraftsFromCommitted();
  }

  function capture() {
    return {
      textless: isTextlessModeState.value,
      backgroundBaseColor: backgroundBaseColorState.value,
      backgroundBaseOpacity: backgroundBaseOpacityState.value,
      backgroundSource: backgroundSourceState.value,
      backgroundEffect: backgroundEffectState.value,
      backgroundImageOpacity: backgroundImageOpacityState.value,
      backgroundLiveDesktopOpacity: backgroundLiveDesktopOpacityState.value,
      backgroundImageLayout: backgroundImageLayoutState.value,
      backgroundBlurStrength: backgroundBlurStrengthState.value,
      backgroundAcrylicBlurStrength: backgroundAcrylicBlurStrengthState.value,
      backgroundDarkenStrength: backgroundDarkenStrengthState.value,
      backgroundDarkenColor: backgroundDarkenColorState.value,
      backgroundAcrylicAppearance: backgroundAcrylicAppearanceState.value,
      backgroundAcrylicDarkParams: backgroundAcrylicDarkParamsState.value,
      backgroundAcrylicLightParams: backgroundAcrylicLightParamsState.value,
      backgroundImagePath: backgroundImagePathState.value,
      windowEffectMaterial: windowEffectMaterialState.value,
      windowEffectAppearance: windowEffectAppearanceState.value,
      windowMode: windowModeState.value,
      fullscreenOverscanEnabled: fullscreenOverscanEnabledState.value,
      showCustomTitlebar: showCustomTitlebarState.value,
      mainWindowShortcut: mainWindowShortcutState.value,
      localePreference: localePreferenceState.value,
      settingsThemePreference: settingsThemePreferenceState.value,
      launchpadIconVariant: launchpadIconVariantState.value,
    };
  }

  function reconcileWindowEffectsSupport() {
    windowEffectMaterialState.value = resolveWindowEffectMaterialForSupport(
      windowEffectMaterialState.value,
      mainWindow.support.value
    );
    windowEffectAppearanceState.value = normalizeWindowEffectAppearance(windowEffectAppearanceState.value);
    draftWindowEffectMaterial.value = windowEffectMaterialState.value;
    draftWindowEffectAppearance.value = windowEffectAppearanceState.value;
  }

  function refreshDesktopWallpaper(imagePath: unknown, imageUrl?: string | null): boolean {
    if (backgroundSourceState.value !== BACKGROUND_SOURCE_WINDOWS_WALLPAPER) return false;
    const normalizedPath = normalizeBackgroundImagePath(imagePath);
    if (!normalizedPath) return false;
    const resolvedUrl = imageUrl || backgroundAssets.toAssetUrl(normalizedPath);
    if (backgroundImagePathState.value === normalizedPath && backgroundImageUrlState.value === resolvedUrl) return false;
    backgroundImagePathState.value = normalizedPath;
    backgroundImageUrlState.value = resolvedUrl;
    if (draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER) {
      draftBackgroundImagePath.value = normalizedPath;
      draftBackgroundImageUrl.value = resolvedUrl;
    }
    return true;
  }

  async function registerCurrentShortcut() {
    const outcome = await mainWindow.registerShortcut(mainWindowShortcutState.value);
    if (!outcome.ok) {
      mainWindowShortcutErrorState.value = errorMessage(outcome.error, t("settings.general.shortcut.unavailable"));
      return outcome;
    }
    draftMainWindowShortcut.value = outcome.shortcut;
    mainWindowShortcutErrorState.value = "";
    return outcome;
  }

  function captureWindowPresentation() {
    return {
      material: windowEffectMaterialState.value,
      appearance: windowEffectAppearanceState.value,
      mode: windowModeState.value,
      fullscreenOverscanEnabled: fullscreenOverscanEnabledState.value,
    };
  }

  function captureLiveDesktopConfig() {
    return {
      backgroundSource: backgroundSourceState.value,
      effect: backgroundEffectState.value,
      backgroundLiveDesktopOpacity: backgroundLiveDesktopOpacityState.value,
      backgroundAcrylicAppearance: backgroundAcrylicAppearanceState.value,
      backgroundAcrylicDarkParams: backgroundAcrylicDarkParamsState.value,
      backgroundAcrylicLightParams: backgroundAcrylicLightParamsState.value,
      backgroundAcrylicBlurStrength: backgroundAcrylicBlurStrengthState.value,
      backgroundBlurStrength: backgroundBlurStrengthState.value,
      backgroundDarkenStrength: backgroundDarkenStrengthState.value,
      backgroundDarkenColor: backgroundDarkenColorState.value,
      windowEffectAppearance: windowEffectAppearanceState.value,
    };
  }

  const presentation = Object.freeze({
    backgroundAcrylicAppearance: readonly(backgroundAcrylicAppearanceState),
    backgroundAcrylicBlurStrength: readonly(backgroundAcrylicBlurStrengthState),
    backgroundAcrylicDarkParams: readonly(backgroundAcrylicDarkParamsState),
    backgroundAcrylicLightParams: readonly(backgroundAcrylicLightParamsState),
    backgroundBaseColor: readonly(backgroundBaseColorState),
    backgroundBaseOpacity: readonly(backgroundBaseOpacityState),
    backgroundBlurStrength: readonly(backgroundBlurStrengthState),
    backgroundDarkenColor: readonly(backgroundDarkenColorState),
    backgroundDarkenStrength: readonly(backgroundDarkenStrengthState),
    backgroundEffect: readonly(backgroundEffectState),
    backgroundImageLayout: readonly(backgroundImageLayoutState),
    backgroundImageOpacity: readonly(backgroundImageOpacityState),
    backgroundImagePath: readonly(backgroundImagePathState),
    backgroundImageUrl: readonly(backgroundImageUrlState),
    backgroundLiveDesktopOpacity: readonly(backgroundLiveDesktopOpacityState),
    backgroundSource: readonly(backgroundSourceState),
    canCustomizeLaunchpadIcon: readonly(canCustomizeLaunchpadIconState),
    canConfigureLaunchAtLogin: readonly(canConfigureLaunchAtLoginState),
    fullscreenOverscanEnabled: readonly(fullscreenOverscanEnabledState),
    isApplyingSettingsConfig: readonly(isApplyingSettingsConfigState),
    isChoosingBackgroundImage: readonly(isChoosingBackgroundImageState),
    isRefreshingLaunchAtLogin: readonly(isRefreshingLaunchAtLoginState),
    isTextlessMode: readonly(isTextlessModeState),
    localePreference: readonly(localePreferenceState),
    localePreferenceError: readonly(localePreferenceErrorState),
    launchpadIconError: readonly(launchpadIconErrorState),
    launchpadIconVariant: readonly(launchpadIconVariantState),
    launchAtLogin: readonly(launchAtLoginState),
    launchAtLoginError: readonly(launchAtLoginErrorState),
    mainWindowShortcut: readonly(mainWindowShortcutState),
    mainWindowShortcutError: readonly(mainWindowShortcutErrorState),
    settingsThemePreference: readonly(settingsThemePreferenceState),
    showCustomTitlebar: readonly(showCustomTitlebarState),
    windowEffectAppearance: readonly(windowEffectAppearanceState),
    windowEffectMaterial: readonly(windowEffectMaterialState),
    windowMode: readonly(windowModeState),
  });

  const draft = Object.freeze({
    rows: draftRows,
    cols: draftCols,
    folderRows: draftFolderRows,
    folderCols: draftFolderCols,
    iconSize: draftIconSize,
    folderIconSizeMode: draftFolderIconSizeMode,
    folderIconSize: draftFolderIconSize,
    isTextlessMode: draftIsTextlessMode,
    backgroundSource: draftBackgroundSource,
    backgroundEffect: draftBackgroundEffect,
    backgroundBaseColor: draftBackgroundBaseColor,
    backgroundBaseOpacity: draftBackgroundBaseOpacity,
    backgroundImageOpacity: draftBackgroundImageOpacity,
    backgroundLiveDesktopOpacity: draftBackgroundLiveDesktopOpacity,
    backgroundImageLayout: draftBackgroundImageLayout,
    backgroundBlurStrength: draftBackgroundBlurStrength,
    backgroundAcrylicBlurStrength: draftBackgroundAcrylicBlurStrength,
    backgroundDarkenStrength: draftBackgroundDarkenStrength,
    backgroundDarkenColor: draftBackgroundDarkenColor,
    backgroundAcrylicAppearance: draftBackgroundAcrylicAppearance,
    backgroundAcrylicDarkParams: draftBackgroundAcrylicDarkParams,
    backgroundAcrylicLightParams: draftBackgroundAcrylicLightParams,
    backgroundImagePath: draftBackgroundImagePath,
    backgroundImageUrl: draftBackgroundImageUrl,
    windowEffectMaterial: draftWindowEffectMaterial,
    windowEffectAppearance: draftWindowEffectAppearance,
    windowMode: draftWindowMode,
    fullscreenOverscanEnabled: draftFullscreenOverscanEnabled,
    showCustomTitlebar: draftShowCustomTitlebar,
    mainWindowShortcut: draftMainWindowShortcut,
    localePreference: draftLocalePreference,
    settingsThemePreference: draftSettingsThemePreference,
    launchpadIconVariant: draftLaunchpadIconVariant,
    launchAtLogin: draftLaunchAtLogin,
  });

  const actions = Object.freeze({
    canUseDraftBackgroundEffect,
    canUseLiveDesktopBackground,
    canUseLiveDesktopBackgroundEffect,
    canUseWindowEffectMaterial,
    changeDraftBackgroundBaseOpacity,
    changeDraftBackgroundImageOpacity,
    changeDraftBackgroundLiveDesktopOpacity,
    changeDraftCols,
    changeDraftFolderCols,
    changeDraftFolderIconSize,
    changeDraftFolderRows,
    changeDraftIconSize,
    changeDraftRows,
    chooseDraftBackgroundImage,
    clampIconSize: clampLaunchpadIconSize,
    clearDraftBackgroundImage,
    resetDraftBackgroundAcrylicParams,
    setDraftBackgroundAcrylicAppearance,
    setDraftBackgroundAcrylicBlurStrength,
    setDraftBackgroundAcrylicParam,
    setDraftBackgroundBaseColor,
    setDraftBackgroundBaseOpacity,
    setDraftBackgroundBlurStrength,
    setDraftBackgroundDarkenColor,
    setDraftBackgroundDarkenStrength,
    setDraftBackgroundEffect,
    setDraftBackgroundImageLayout,
    setDraftBackgroundImageOpacity,
    setDraftBackgroundLiveDesktopOpacity,
    setDraftBackgroundSource,
    setDraftFolderIconSizeMode,
    setDraftFullscreenOverscanEnabled,
    setDraftLocalePreference,
    setDraftLaunchpadIconVariant,
    setDraftLaunchAtLogin,
    setDraftSettingsThemePreference,
    setDraftMainWindowShortcut,
    setMainWindowShortcutError,
    setDraftShowCustomTitlebar,
    setDraftWindowEffectAppearance,
    setDraftWindowEffectMaterial,
    setDraftWindowMode,
    useDraftDesktopWallpaper,
  });
  const nativeIntegration = Object.freeze({
    captureLiveDesktopConfig,
    captureWindowPresentation,
    getBackgroundSource: () => backgroundSourceState.value,
    reconcileWindowEffectsSupport,
    refreshDesktopWallpaper,
    refreshLaunchAtLoginStatus,
    registerCurrentShortcut,
  });

  syncDraftsFromCommitted();

  return {
    actions,
    applyEdit,
    beginEdit,
    cancelEdit,
    draft,
    nativeIntegration,
    persistence: Object.freeze({ capture, restore }),
    presentation,
  };
}
