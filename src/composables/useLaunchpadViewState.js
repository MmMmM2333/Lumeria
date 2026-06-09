import { computed } from "vue";
import { DESKTOP_CLOSE_SCALE } from "./launchpadConstants.js";
import {
  BACKGROUND_EFFECT_DIMMED,
  backgroundEffectUsesPixi,
  backgroundSourceUsesImage,
  clampBackgroundBaseOpacity,
  clampBackgroundImageOpacity,
  normalizeBackgroundBaseColor,
} from "./useLaunchpadSettingsConfig.js";
import {
  appLaunchGhostTransition,
  homeShellTransition,
  panelSpring,
} from "./launchpadMotion.js";

export function useLaunchpadViewState(options) {
  const isDesktopFullyClosed = computed(() => Boolean(!options.isDesktopOpen.value && !options.isDesktopClosing.value));
  const shouldSnapDesktopTrack = computed(() => Boolean(
    options.isFolderLayerActive.value ||
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
  const backgroundImageCssOpacity = computed(() => {
    if (shouldRenderPixiBackgroundEffect.value) return 0;
    if (!backgroundSourceUsesImage(options.backgroundSource.value)) return 0;
    return clampBackgroundImageOpacity(options.backgroundImageOpacity.value) / 100;
  });
  const backgroundOverlayOpacity = computed(() => (
    options.backgroundEffect.value === BACKGROUND_EFFECT_DIMMED ? 0.28 : 0
  ));
  const backgroundBaseColor = computed(() => normalizeBackgroundBaseColor(options.backgroundBaseColor?.value));
  const backgroundBaseOpacity = computed(() => clampBackgroundBaseOpacity(options.backgroundBaseOpacity?.value) / 100);
  const backgroundImageStyle = computed(() => {
    const imageUrl = options.backgroundImageUrl?.value;
    if (!imageUrl) return {};
    return {
      backgroundImage: `url(${JSON.stringify(imageUrl)})`,
    };
  });
  const rootStyle = computed(() => ({
    "--configured-app-icon-size": `${options.iconSize.value}px`,
    "--launchpad-background-base-color": backgroundBaseColor.value,
    "--launchpad-background-base-opacity": `${backgroundBaseOpacity.value}`,
    "--launchpad-background-image-opacity": `${backgroundImageCssOpacity.value}`,
    "--launchpad-background-overlay-opacity": `${backgroundOverlayOpacity.value}`,
  }));
  const homeShellInitial = { opacity: 0, scale: DESKTOP_CLOSE_SCALE, y: 0, filter: "blur(8px)" };
  const homeShellAnimate = computed(() => {
    if (isDesktopAnimatingClosed.value) return { opacity: 0, scale: DESKTOP_CLOSE_SCALE, y: 0, filter: "blur(8px)" };
    if (options.openFolderId.value && !options.isFolderClosing.value) return { opacity: 0, scale: 0.92, y: 44, filter: "blur(6px)" };
    return { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" };
  });
  const homeShellStyle = computed(() => ({
    pointerEvents: shouldHideHomeShell.value || isHomeInteractionDisabled.value ? "none" : "auto",
  }));

  return {
    appLaunchGhostTransition,
    backgroundImageStyle,
    desktopTrackMotionKey,
    homeShellAnimate,
    homeShellInitial,
    homeShellStyle,
    homeShellTransition,
    isHomeInteractionDisabled,
    panelSpring,
    rootStyle,
    shouldRenderPixiBackgroundEffect,
  };
}
