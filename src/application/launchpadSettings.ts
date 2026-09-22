import { DEFAULT_HOT_CORNERS, readHotCornerSettings, type HotCornerSettings } from "../domain/hotCorners.js";
import type { StateHost, StateCell } from "./stateHost.js";
import {createLayoutSettings} from "./layoutSettings.js";
import { readErrorMessage } from "../application/errorMessage.js";
import type { AcrylicParameters, LayoutSettings } from "../domain/layoutDocument.js";
import type { AppearancePreference } from "../domain/appearancePreference.js";
import type { LaunchpadIconVariant } from "../domain/launchpadIconVariant.js";
import type { MainWindowEffectsSupport } from "../platform/launchpadContracts.js";
import type { LocaleState } from "../i18n/locale.js";
import type { TranslationPort } from "../i18n/translationPort.js";
import type {
  AutostartPort,
  BackgroundAssetPort,
  LaunchpadIconPort,
  LocaleRuntimePort,
} from "../platform/launchpadPortContracts.js";
import type { createLaunchpadLayoutState } from "./launchpadLayoutState.js";
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
import { clampLaunchpadIconSize } from "../domain/layoutConfiguration.js";
import {
  DEFAULT_LOCALE_PREFERENCE,
  normalizeLocalePreference,
} from "../i18n/locale.js";
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
} from "./launchpadSettingsConfig.js";
import type { NormalizedLiveDesktopBackgroundSupport } from "./launchpadSettingsConfig.js";
import { backgroundEffectUsesPixi } from "../rendering/backgroundCapability.js";

const DEFAULT_SETTINGS_THEME_PREFERENCE = APPEARANCE_DARK;

export type LaunchpadSettingsRuntimeOptions = Readonly<{
  applyWindowPresentation?: boolean;
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
  applyHotCorners?: (config: HotCornerSettings) => void | Promise<void>;
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
  autostartPort: AutostartPort;
  backgroundAssetPort: BackgroundAssetPort;
  isDragActive?: () => boolean;
  launchpadIconPort: LaunchpadIconPort;
  layout: Pick<ReturnType<typeof createLaunchpadLayoutState>, "captureConfiguration" | "applyConfiguration" | "createConfigurationRollback">;
  liveDesktopSupport: Readonly<{ value: Partial<NormalizedLiveDesktopBackgroundSupport> }>;
  isLiveDesktopEnabled?: () => boolean;
  localeRuntime: Pick<LocaleRuntimePort, "applyPreference">;
  localizationText: TranslationPort;
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

export function createLaunchpadSettings(options: LaunchpadSettingsOptions, host: StateHost) {
  const { cell: ref, readonly } = host;
  const layout = options.layout;
  const mainWindow = options.mainWindow;
  const liveDesktopSupport = options.liveDesktopSupport;
  const backgroundAssets = options.backgroundAssetPort;
  const launchpadIcons = options.launchpadIconPort;
  const localeRuntime = options.localeRuntime;
  const autostart = options.autostartPort;
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

  const layoutSettings=createLayoutSettings({layout,...options.isDragActive?{isDragActive:options.isDragActive}:{}},host);
  const {isTextlessModeState,draftRows,draftCols,draftFolderRows,draftFolderCols,draftIconSize,draftFolderIconSizeMode,draftFolderIconSize,draftIsTextlessMode,changeDraftRows,changeDraftCols,changeDraftFolderRows,changeDraftFolderCols,changeDraftIconSize,changeDraftFolderIconSize,setDraftFolderIconSizeMode,applyLayoutEdit}=layoutSettings;
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
  const hotCornersState = ref<HotCornerSettings>({ ...DEFAULT_HOT_CORNERS });
  const draftHotCorners = ref<HotCornerSettings>({ ...DEFAULT_HOT_CORNERS });
  const mainWindowShortcutState = ref<string | null>(DEFAULT_MAIN_WINDOW_SHORTCUT);
  const localePreferenceState = ref(DEFAULT_LOCALE_PREFERENCE);
  const settingsThemePreferenceState = ref<AppearancePreference>(DEFAULT_SETTINGS_THEME_PREFERENCE);
  const launchpadIconVariantState = ref<LaunchpadIconVariant>(DEFAULT_LAUNCHPAD_ICON_VARIANT);
  const launchAtLoginState = ref(false);
  const canConfigureLaunchAtLoginState = ref(Boolean(autostart.isAvailable()));
  const isRefreshingLaunchAtLoginState = ref(false);
  let launchAtLoginStatusRequestId = 0;

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
      (options.isLiveDesktopEnabled ?? isLiveDesktopExperimentEnabled)()
      && normalizeLiveDesktopBackgroundSupport(liveDesktopSupport.value).supportsLiveDesktopBackground
    );
  }

  function syncDraftsFromCommitted() {
    layoutSettings.syncDraftsFromCommitted();
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
    draftHotCorners.value = { ...hotCornersState.value };
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
    return refreshLaunchAtLoginStatus();
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

  function getDraftBackgroundAcrylicParamsRef(profile: unknown): StateCell<AcrylicParameters> {
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
    const requestId=++backgroundRequestId;
    isChoosingBackgroundImageState.value = true;
    try {
      const selected = await backgroundAssets.pickImage();
      if(requestId!==backgroundRequestId)return {ok:true,skipped:true};
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
      if(requestId===backgroundRequestId)isChoosingBackgroundImageState.value = false;
    }
  }

  async function useDraftDesktopWallpaper() {
    if (isChoosingBackgroundImageState.value) return { ok: true, skipped: true };
    const requestId=++backgroundRequestId;
    isChoosingBackgroundImageState.value = true;
    try {
      const selected = await backgroundAssets.getDesktopWallpaper();
      if(requestId!==backgroundRequestId)return {ok:true,skipped:true};
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
      if(requestId===backgroundRequestId)isChoosingBackgroundImageState.value = false;
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
    const appliedLayout = applyLayoutEdit(runtimeOptions);

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
    hotCornersState.value = readHotCornerSettings(draftHotCorners.value);
    localePreferenceState.value = nextLocalePreference;
    settingsThemePreferenceState.value = normalizeAppearancePreference(draftSettingsThemePreference.value);
    launchpadIconVariantState.value = nextLaunchpadIconVariant;
    launchAtLoginState.value = Boolean(nextLaunchAtLogin);
    syncDraftsFromCommitted();
    return appliedLayout;
  }

  async function applyEdit(runtimeOptions: LaunchpadSettingsRuntimeOptions = {}) {
    if (isApplyingSettingsConfigState.value) return explicitFailure(new Error("Settings are already being applied"));
    const committed = capture();
    const currentLaunchAtLogin = Boolean(launchAtLoginState.value);
    const currentImageUrl = backgroundImageUrlState.value;
    const restoreLayout = layout.createConfigurationRollback();
    const restoreDraft = Object.values(draft).map(cell => {
      const value = cell.value;
      return () => { cell.value = value; };
    });
    const nextShortcut = normalizeMainWindowShortcut(draftMainWindowShortcut.value);
    const nextLocalePreference = normalizeLocalePreference(draftLocalePreference.value);
    const nextLaunchpadIconVariant = normalizeLaunchpadIconVariant(draftLaunchpadIconVariant.value);
    const nextLaunchAtLogin = Boolean(draftLaunchAtLogin.value);
    const undo: Array<() => unknown | Promise<unknown>> = [];
    let reportFailure: ((error: unknown) => void) | undefined;
    let localeActivationAttempted = false;
    let liveDesktopAttempted = false;
    let commitAttempted = false;

    // Host adapters may throw or return a structured failure. Neither is success.
    function requireSuccess(outcome: unknown): void {
      if (!outcome || typeof outcome !== "object") return;
      if ("ok" in outcome && outcome.ok === false) {
        throw "error" in outcome ? outcome.error : new Error("Platform settings operation failed");
      }
      if ("phase" in outcome && outcome.phase === "failed") {
        throw new Error("detail" in outcome ? String(outcome.detail) : "Live desktop synchronization failed");
      }
    }
    mainWindowShortcutErrorState.value = "";
    localePreferenceErrorState.value = "";
    launchpadIconErrorState.value = "";
    launchAtLoginErrorState.value = "";
    isApplyingSettingsConfigState.value = true;
    try {
      let appliedLocaleState: LocaleState | null = null;
      if (nextLocalePreference !== committed.localePreference) {
        reportFailure = error => { localePreferenceErrorState.value = errorMessage(error, "Unable to apply language"); };
        undo.push(async () => {
          const outcome = await localeRuntime.applyPreference(committed.localePreference);
          if (!outcome.ok) throw outcome.error;
          if (localeActivationAttempted) activateLocale(outcome.state);
        });
        const outcome = await localeRuntime.applyPreference(nextLocalePreference);
        if (!outcome.ok) throw outcome.error;
        appliedLocaleState = outcome.state;
      }
      if(draftHotCorners.value.enabled && !draftHotCorners.value.corners) throw new Error(t("settings.general.hotCorners.selectCorner"));
      const nextHotCorners = readHotCornerSettings(draftHotCorners.value);
      if (JSON.stringify(nextHotCorners) !== JSON.stringify(committed.hotCorners)) {
        if (!mainWindow.applyHotCorners && nextHotCorners.enabled) throw new Error(t("settings.general.hotCorners.unavailable"));
        undo.push(async () => { await mainWindow.applyHotCorners?.(committed.hotCorners); });
        await mainWindow.applyHotCorners?.(nextHotCorners);
      }
      if (nextShortcut !== committed.mainWindowShortcut) {
        reportFailure = error => { mainWindowShortcutErrorState.value = errorMessage(error, t("settings.general.shortcut.unavailable")); };
        undo.push(() => mainWindow.registerShortcut(committed.mainWindowShortcut));
        requireSuccess(await mainWindow.registerShortcut(nextShortcut));
      }
      if (nextLaunchpadIconVariant !== committed.launchpadIconVariant) {
        reportFailure = error => { launchpadIconErrorState.value = errorMessage(error, t("settings.general.launchpadIcon.applyFailed")); };
        if (!launchpadIcons.isAvailable()) throw new Error(t("settings.general.launchpadIcon.unavailable"));
        undo.push(async () => {
          if (await launchpadIcons.applyVariant(committed.launchpadIconVariant) !== committed.launchpadIconVariant) {
            throw new Error("Native icon runtime did not restore the previous variant");
          }
        });
        if (await launchpadIcons.applyVariant(nextLaunchpadIconVariant) !== nextLaunchpadIconVariant) {
          throw new Error("Native icon runtime returned an unexpected variant");
        }
      }
      if (nextLaunchAtLogin !== currentLaunchAtLogin) {
        reportFailure = error => { launchAtLoginErrorState.value = errorMessage(error, t("settings.general.startup.applyFailed")); };
        if (!autostart.isAvailable()) throw new Error(t("settings.general.startup.unavailable"));
        undo.push(async () => {
          if (Boolean(await autostart.setEnabled(currentLaunchAtLogin)) !== currentLaunchAtLogin) {
            throw new Error("Autostart did not restore the previous status");
          }
        });
        if (Boolean(await autostart.setEnabled(nextLaunchAtLogin)) !== nextLaunchAtLogin) {
          throw new Error("Autostart runtime returned an unexpected status");
        }
      }

      reportFailure = undefined;
      let modeOutcome: unknown;
      let effectsOutcome: unknown;
      if (runtimeOptions.applyWindowPresentation !== false) {
        // Register compensation before invoking: a failed host call may have partially applied.
        undo.push(() => mainWindow.setMode({
          mode: committed.windowMode, fullscreenOverscanEnabled: committed.fullscreenOverscanEnabled,
        }));
        modeOutcome = await mainWindow.setMode({
          mode: normalizeWindowMode(draftWindowMode.value),
          fullscreenOverscanEnabled: normalizeFullscreenOverscanEnabled(draftFullscreenOverscanEnabled.value),
        });
        requireSuccess(modeOutcome);
        undo.push(() => mainWindow.setEffectsEnabled({
          enabled: true, material: committed.windowEffectMaterial, appearance: committed.windowEffectAppearance,
        }));
        effectsOutcome = await mainWindow.setEffectsEnabled({
          enabled: true,
          material: resolveWindowEffectMaterialForSupport(draftWindowEffectMaterial.value, mainWindow.support.value),
          appearance: normalizeWindowEffectAppearance(draftWindowEffectAppearance.value),
        });
        requireSuccess(effectsOutcome);
      }

      undo.push(restoreLayout);
      undo.push(() => {
        restore(committed);
        launchAtLoginState.value = currentLaunchAtLogin;
        backgroundImageUrlState.value = currentImageUrl;
      });
      commitAttempted = true;
      const appliedLayout = commitDraft(
        nextShortcut, nextLocalePreference, nextLaunchpadIconVariant, nextLaunchAtLogin, runtimeOptions,
      );
      if (appliedLocaleState) {
        localeActivationAttempted = true;
        activateLocale(appliedLocaleState);
      }
      let liveDesktopOutcome: unknown;
      if (runtimeOptions.syncLiveDesktop) {
        liveDesktopAttempted = true;
        liveDesktopOutcome = await runtimeOptions.syncLiveDesktop();
        requireSuccess(liveDesktopOutcome);
      }
      return {
        ok: true as const,
        appliedLayout,
        platform: { effects: effectsOutcome, liveDesktop: liveDesktopOutcome, mode: modeOutcome },
      };
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (const restoreOperation of undo.reverse()) {
        try { requireSuccess(await restoreOperation()); }
        catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      // Re-sync only after committed values have been restored, and keep the user's draft for retry.
      for (const restoreCell of restoreDraft) restoreCell();
      if (commitAttempted) {
        try { runtimeOptions.schedulePageGridMetrics?.(); }
        catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      if (liveDesktopAttempted) {
        try { requireSuccess(await runtimeOptions.syncLiveDesktop?.()); }
        catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      reportFailure?.(error);
      return explicitFailure(error, { rollbackErrors });
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
    hotCornersState.value = readHotCornerSettings(fragment.hotCorners);
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
      hotCorners: { ...hotCornersState.value },
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
    hotCorners: readonly(hotCornersState),
    canConfigureHotCorners: readonly(ref(Boolean(mainWindow.applyHotCorners))),
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
    hotCorners: draftHotCorners,
    localePreference: draftLocalePreference,
    settingsThemePreference: draftSettingsThemePreference,
    launchpadIconVariant: draftLaunchpadIconVariant,
    launchAtLogin: draftLaunchAtLogin,
  });

  const actions = Object.freeze({
    setDraftHotCorners: (value: HotCornerSettings) => { draftHotCorners.value = { ...value }; },
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
    layoutSettings,
    actions,
    applyLayoutEdit,
    applyEdit,
    beginEdit,
    cancelEdit,
    draft,
    nativeIntegration,
    persistence: Object.freeze({ capture, restore }),
    presentation,
  };
}
