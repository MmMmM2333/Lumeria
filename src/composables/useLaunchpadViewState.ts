import { computed } from "vue";
import type { CSSProperties, Ref } from "vue";
import type { AcrylicParameters, LayoutSettings } from "../domain/layoutDocument.js";
import type { BackgroundImageLayout } from "../domain/backgroundImageLayout.js";
import type { NormalizedLiveDesktopBackgroundSupport } from "./useLaunchpadSettingsConfig.js";
import { DESKTOP_CLOSE_SCALE } from "./launchpadConstants.js";
import {
  BACKGROUND_EFFECT_ACRYLIC,
  BACKGROUND_EFFECT_DIMMED,
  backgroundSourceUsesImage,
  backgroundSourceUsesLiveDesktop,
  clampBackgroundBaseOpacity,
  clampBackgroundAcrylicBlurStrength,
  clampBackgroundBlurStrength,
  clampBackgroundDarkenStrength,
  clampBackgroundImageOpacity,
  normalizeBackgroundBaseColor,
  normalizeBackgroundDarkenColor,
  normalizeLiveDesktopBackgroundSupport,
} from "./useLaunchpadSettingsConfig.js";
import { resolveCssBackgroundImagePlacement } from "../domain/backgroundImageLayout.js";
import {
  appLaunchGhostTransition,
  homeChromeTransition,
  panelSpring,
} from "./launchpadMotion.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import { backgroundEffectUsesPixi } from "../rendering/backgroundPort.js";

type ReadonlyState<T> = Readonly<Ref<T>>;

export type LaunchpadViewStateOptions = Readonly<{
  backgroundAcrylicBlurStrength?: ReadonlyState<unknown>;
  backgroundAcrylicParams?: ReadonlyState<Partial<AcrylicParameters> | null | undefined>;
  backgroundBaseColor?: ReadonlyState<unknown>;
  backgroundBaseOpacity?: ReadonlyState<unknown>;
  backgroundBlurStrength?: ReadonlyState<unknown>;
  backgroundDarkenColor?: ReadonlyState<unknown>;
  backgroundDarkenStrength?: ReadonlyState<unknown>;
  backgroundEffect: ReadonlyState<LayoutSettings["backgroundEffect"]>;
  backgroundImageLayout?: ReadonlyState<BackgroundImageLayout | undefined>;
  backgroundImageOpacity: ReadonlyState<unknown>;
  backgroundImageUrl?: ReadonlyState<string | null | undefined>;
  backgroundSource: ReadonlyState<LayoutSettings["backgroundSource"]>;
  iconSize: ReadonlyState<number>;
  isAppLaunching: ReadonlyState<boolean>;
  isDesktopClosing: ReadonlyState<boolean>;
  isDesktopOpen: ReadonlyState<boolean>;
  isFolderClosing: ReadonlyState<boolean>;
  isFolderLayerActive: ReadonlyState<boolean>;
  isFolderZoomFadeClosing?: ReadonlyState<boolean>;
  isHomeRevealSettling: ReadonlyState<boolean>;
  isSearchMode: ReadonlyState<boolean>;
  liveDesktopBackgroundSupport?: ReadonlyState<Partial<NormalizedLiveDesktopBackgroundSupport> | null | undefined>;
  liveDesktopCssFallbackEffectsEnabled?: ReadonlyState<boolean>;
  openFolderId: ReadonlyState<string | null>;
}>;

export type LaunchpadRootStyle = Readonly<{
  "--configured-app-icon-size": string;
  "--launchpad-background-base-color": string;
  "--launchpad-background-base-opacity": string;
  "--launchpad-background-image-opacity": string;
  "--launchpad-background-overlay-color": string;
  "--launchpad-background-overlay-opacity": string;
  "--launchpad-live-desktop-backdrop-filter": string;
  "--launchpad-live-desktop-backdrop-opacity": string;
}>;

export function useLaunchpadViewState(options: LaunchpadViewStateOptions) {
  const isDesktopFullyClosed = computed(() => Boolean(!options.isDesktopOpen.value && !options.isDesktopClosing.value));
  const isFolderLayerClosing = computed(() => Boolean(options.isFolderClosing.value || options.isFolderZoomFadeClosing?.value));
  const shouldSnapForFolderLayer = computed(() => Boolean(options.isFolderLayerActive.value && !isFolderLayerClosing.value));
  const shouldSnapDesktopTrack = computed(() => Boolean(
    shouldSnapForFolderLayer.value ||
    options.isHomeRevealSettling.value ||
    isDesktopFullyClosed.value ||
    options.isAppLaunching.value
  ));
  const desktopTrackVisibilityKey = computed(() => (options.isDesktopOpen.value || (options.isDesktopClosing.value && !options.isAppLaunching.value) ? "open" : "closed"));
  const desktopTrackMotionKey = computed(() => `${desktopTrackVisibilityKey.value}-${options.isSearchMode.value ? "search" : "desktop"}-${shouldSnapDesktopTrack.value ? "snap" : "spring"}`);
  const isDesktopAnimatingClosed = computed(() => Boolean(!options.isDesktopOpen.value || options.isDesktopClosing.value || options.isAppLaunching.value));
  const shouldHideHomeShell = computed(() => Boolean((options.openFolderId.value && !options.isFolderClosing.value) || isDesktopAnimatingClosed.value));
  const isHomeInteractionDisabled = computed(() => Boolean(!options.isDesktopOpen.value || options.isDesktopClosing.value || options.isAppLaunching.value));
  const shouldRenderPixiBackgroundEffect = computed(() => Boolean(
    backgroundEffectUsesPixi(options.backgroundEffect.value)
    && backgroundSourceUsesImage(options.backgroundSource.value)
    && options.backgroundImageUrl?.value
  ));
  const shouldUseLiveDesktopBackground = computed(() => Boolean(
    isLiveDesktopExperimentEnabled()
    && backgroundSourceUsesLiveDesktop(options.backgroundSource.value)
  ));
  const shouldUseCssLiveDesktopEffect = computed(() => Boolean(
    shouldUseLiveDesktopBackground.value
    && options.liveDesktopCssFallbackEffectsEnabled?.value
    && backgroundEffectUsesPixi(options.backgroundEffect.value)
    && !normalizeLiveDesktopBackgroundSupport(options.liveDesktopBackgroundSupport?.value).supportsLiveDesktopBackgroundEffects
  ));
  const liveDesktopBlurStrength = computed(() => (
    options.backgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC && options.backgroundAcrylicBlurStrength
      ? clampBackgroundAcrylicBlurStrength(options.backgroundAcrylicBlurStrength.value)
      : clampBackgroundBlurStrength(options.backgroundBlurStrength?.value)
  ));
  const liveDesktopBlurRadius = computed(() => (
    2 + (liveDesktopBlurStrength.value / 100) * 28
  ));
  const liveDesktopBackdropFilter = computed(() => {
    if (!shouldUseCssLiveDesktopEffect.value) return "none";
    const blur = `blur(${liveDesktopBlurRadius.value.toFixed(1)}px)`;
    if (options.backgroundEffect.value !== BACKGROUND_EFFECT_ACRYLIC) return blur;
    const params = options.backgroundAcrylicParams?.value || {};
    const brightness = Number.isFinite(Number(params.brightness)) ? Number(params.brightness) : 0.8;
    const contrast = Number.isFinite(Number(params.contrast)) ? Number(params.contrast) : 0.85;
    const saturation = Number.isFinite(Number(params.saturation)) ? Number(params.saturation) : 1.5;
    return `${blur} saturate(${Math.max(0.4, Math.min(1.8, saturation)).toFixed(2)}) contrast(${Math.max(0.6, Math.min(1.4, contrast)).toFixed(2)}) brightness(${Math.max(0.4, Math.min(1.4, brightness)).toFixed(2)})`;
  });
  const liveDesktopAcrylicOverlayColor = computed(() => {
    const tint = options.backgroundAcrylicParams?.value?.tintColor;
    if (!Array.isArray(tint) || tint.length < 3) return normalizeBackgroundDarkenColor(options.backgroundDarkenColor?.value);
    const [red, green, blue] = tint.slice(0, 3).map((value) => {
      const number = Number(value);
      return Math.max(0, Math.min(255, Math.round((Number.isFinite(number) ? number : 0) * 255)));
    });
    return `rgb(${red} ${green} ${blue})`;
  });
  const backgroundImageCssOpacity = computed(() => {
    if (shouldRenderPixiBackgroundEffect.value) return 0;
    if (!backgroundSourceUsesImage(options.backgroundSource.value)) return 0;
    return clampBackgroundImageOpacity(options.backgroundImageOpacity.value) / 100;
  });
  const backgroundOverlayOpacity = computed(() => (
    shouldUseLiveDesktopBackground.value && options.backgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC && shouldUseCssLiveDesktopEffect.value
      ? Math.max(0, Math.min(0.52, Number(options.backgroundAcrylicParams?.value?.tintStrength ?? 0.2) * 0.65))
      : options.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED
      ? clampBackgroundDarkenStrength(options.backgroundDarkenStrength?.value) / 100
      : 0
  ));
  const backgroundOverlayColor = computed(() => (
    shouldUseLiveDesktopBackground.value && options.backgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC && shouldUseCssLiveDesktopEffect.value
      ? liveDesktopAcrylicOverlayColor.value
      : normalizeBackgroundDarkenColor(options.backgroundDarkenColor?.value)
  ));
  const backgroundBaseColor = computed(() => normalizeBackgroundBaseColor(options.backgroundBaseColor?.value));
  const backgroundBaseOpacity = computed(() => (
    shouldUseLiveDesktopBackground.value
      ? 0
      : clampBackgroundBaseOpacity(options.backgroundBaseOpacity?.value) / 100
  ));
  const backgroundImageStyle = computed<CSSProperties>(() => {
    const imageUrl = options.backgroundImageUrl?.value;
    if (!imageUrl) return {};
    return {
      backgroundImage: `url(${JSON.stringify(imageUrl)})`,
      ...resolveCssBackgroundImagePlacement(options.backgroundImageLayout?.value),
    };
  });
  const rootStyle = computed<LaunchpadRootStyle>(() => ({
    "--configured-app-icon-size": `${options.iconSize.value}px`,
    "--launchpad-background-base-color": backgroundBaseColor.value,
    "--launchpad-background-base-opacity": `${backgroundBaseOpacity.value}`,
    "--launchpad-background-image-opacity": `${backgroundImageCssOpacity.value}`,
    "--launchpad-background-overlay-color": backgroundOverlayColor.value,
    "--launchpad-background-overlay-opacity": `${backgroundOverlayOpacity.value}`,
    "--launchpad-live-desktop-backdrop-filter": liveDesktopBackdropFilter.value,
    "--launchpad-live-desktop-backdrop-opacity": shouldUseCssLiveDesktopEffect.value ? "0.001" : "0",
  }));
  const desktopVisualTransform = computed(() => {
    if (isDesktopAnimatingClosed.value) return { scale: DESKTOP_CLOSE_SCALE, y: 0 };
    if (options.openFolderId.value && !options.isFolderClosing.value) return { scale: 0.92, y: 44 };
    return { scale: 1, y: 0 };
  });
  const desktopVisualAlpha = computed(() => (shouldHideHomeShell.value ? 0 : 1));
  const launchpadVisualTransform = computed(() => (isDesktopAnimatingClosed.value ? { scale: DESKTOP_CLOSE_SCALE, y: 0 } : { scale: 1, y: 0 }));
  const launchpadVisualAlpha = computed(() => (isDesktopAnimatingClosed.value ? 0 : 1));
  const homeChromeInitial = { opacity: 0, filter: "blur(8px)" };
  const homeChromeAnimate = computed(() => {
    if (isDesktopAnimatingClosed.value) return { opacity: 0, filter: "blur(8px)" };
    if (options.openFolderId.value && !options.isFolderClosing.value) return { opacity: 0, filter: "blur(0px)" };
    return { opacity: 1, filter: "blur(0px)" };
  });
  const homeChromeStyle = computed(() => ({
    pointerEvents: options.isFolderLayerActive.value || shouldHideHomeShell.value || isHomeInteractionDisabled.value ? "none" : "auto",
  }));

  return {
    appLaunchGhostTransition,
    backgroundImageStyle,
    desktopTrackMotionKey,
    desktopVisualTransform,
    desktopVisualAlpha,
    launchpadVisualTransform,
    launchpadVisualAlpha,
    homeChromeAnimate,
    homeChromeInitial,
    homeChromeStyle,
    homeChromeTransition,
    isHomeInteractionDisabled,
    panelSpring,
    rootStyle,
    shouldRenderPixiBackgroundEffect,
  };
}
