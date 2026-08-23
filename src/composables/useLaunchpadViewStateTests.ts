import { ref } from "vue";
import type { Ref } from "vue";
import type { AcrylicParameters } from "../domain/layoutDocument.js";
import { setLiveDesktopExperimentEnabledForTests } from "../domain/experimentalFeatures.js";
import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_EFFECT_NONE,
  BACKGROUND_IMAGE_LAYOUT_FIT,
  BACKGROUND_IMAGE_LAYOUT_TILE,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
} from "./useLaunchpadSettingsConfig.js";
import {
  appLaunchGhostTransition,
  homeChromeTransition,
  panelSpring,
} from "./launchpadMotion.js";
import { DESKTOP_CLOSE_SCALE } from "./launchpadConstants.js";
import { useLaunchpadViewState } from "./useLaunchpadViewState.js";
import type { LaunchpadViewStateOptions } from "./useLaunchpadViewState.js";

type StateValue<T> = T extends Readonly<Ref<infer TValue>> ? TValue : never;
type ViewStateOverrides = {
  [TKey in keyof LaunchpadViewStateOptions]?: StateValue<LaunchpadViewStateOptions[TKey]>;
};

function createViewState(overrides: ViewStateOverrides = {}) {
  const state = {
    backgroundBaseColor: ref(overrides.backgroundBaseColor ?? "#10141f"),
    backgroundBaseOpacity: ref(overrides.backgroundBaseOpacity ?? 28),
    backgroundSource: ref(overrides.backgroundSource ?? BACKGROUND_SOURCE_SYSTEM_MATERIAL),
    backgroundEffect: ref(overrides.backgroundEffect ?? BACKGROUND_EFFECT_DIMMED),
    backgroundBlurStrength: ref(overrides.backgroundBlurStrength ?? 50),
    backgroundAcrylicBlurStrength: ref(overrides.backgroundAcrylicBlurStrength ?? 50),
    backgroundAcrylicParams: ref<Partial<AcrylicParameters> | null | undefined>(overrides.backgroundAcrylicParams ?? {
      brightness: 0.9,
      contrast: 1.1,
      saturation: 1.3,
      tintColor: [0.2, 0.4, 0.6],
      tintStrength: 0.4,
    }),
    backgroundImageLayout: ref(overrides.backgroundImageLayout ?? undefined),
    backgroundImageOpacity: ref(overrides.backgroundImageOpacity ?? 46),
    backgroundDarkenColor: ref(overrides.backgroundDarkenColor ?? "#1c1c1c"),
    backgroundDarkenStrength: ref(overrides.backgroundDarkenStrength ?? 28),
    backgroundImageUrl: ref(overrides.backgroundImageUrl ?? null),
    iconSize: ref(overrides.iconSize ?? 64),
    isAppLaunching: ref(Boolean(overrides.isAppLaunching)),
    isDesktopClosing: ref(Boolean(overrides.isDesktopClosing)),
    isDesktopOpen: ref(overrides.isDesktopOpen ?? true),
    isFolderClosing: ref(Boolean(overrides.isFolderClosing)),
    isFolderLayerActive: ref(Boolean(overrides.isFolderLayerActive)),
    isFolderZoomFadeClosing: ref(Boolean(overrides.isFolderZoomFadeClosing)),
    isHomeRevealSettling: ref(Boolean(overrides.isHomeRevealSettling)),
    isSearchMode: ref(Boolean(overrides.isSearchMode)),
    liveDesktopBackgroundSupport: ref(overrides.liveDesktopBackgroundSupport ?? {
      supportsLiveDesktopBackground: false,
      supportsLiveDesktopBackgroundEffects: false,
    }),
    liveDesktopCssFallbackEffectsEnabled: ref(Boolean(overrides.liveDesktopCssFallbackEffectsEnabled)),
    openFolderId: ref(overrides.openFolderId ?? null),
  } satisfies LaunchpadViewStateOptions;

  return {
    state,
    view: useLaunchpadViewState(state),
  };
}

export function runLaunchpadViewStateTests() {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`[Launchpad view state test failed] ${message}`);
  };
  setLiveDesktopExperimentEnabledForTests(true);

  const desktop = createViewState();
  assert(desktop.view.rootStyle.value["--configured-app-icon-size"] === "64px", "root style should expose configured icon size");
  assert(desktop.view.rootStyle.value["--launchpad-background-base-color"] === "#10141f", "root style should expose the default base color");
  assert(desktop.view.rootStyle.value["--launchpad-background-base-opacity"] === "0.28", "root style should expose the default base opacity");
  assert(desktop.view.rootStyle.value["--launchpad-background-image-opacity"] === "0", "root style should hide the background image in material mode");
  assert(desktop.view.rootStyle.value["--launchpad-background-overlay-color"] === "#1c1c1c", "root style should expose the default dim overlay color");
  assert(desktop.view.rootStyle.value["--launchpad-background-overlay-opacity"] === "0.28", "root style should expose the default dim overlay opacity");
  assert(desktop.view.rootStyle.value["--launchpad-live-desktop-backdrop-filter"] === "none", "root style should disable live desktop fallback filters by default");
  assert(desktop.view.rootStyle.value["--launchpad-live-desktop-backdrop-opacity"] === "0", "root style should keep the live desktop fallback layer transparent by default");
  assert(desktop.view.desktopTrackMotionKey.value === "open-desktop-spring", "desktop motion key should describe open desktop spring state");
  assert(desktop.view.desktopVisualTransform.value.scale === 1 && desktop.view.desktopVisualTransform.value.y === 0, "idle desktop visual root should not be transformed");
  assert(desktop.view.desktopVisualAlpha.value === 1, "idle desktop canvas should be visible");
  assert(desktop.view.launchpadVisualTransform.value.scale === 1, "idle launchpad visual layers should not be transformed");
  assert(desktop.view.launchpadVisualAlpha.value === 1, "idle launchpad visual layers should be visible");
  assert(desktop.view.homeChromeAnimate.value.opacity === 1, "home chrome should be visible in the idle desktop state");
  assert(desktop.view.homeChromeStyle.value.pointerEvents === "auto", "home chrome should allow pointer events in the idle desktop state");
  assert(desktop.view.appLaunchGhostTransition === appLaunchGhostTransition, "view state should expose the app launch ghost transition");
  assert(desktop.view.homeChromeTransition === homeChromeTransition, "view state should expose the home chrome transition");
  assert(desktop.view.panelSpring === panelSpring, "view state should expose the settings panel spring");
  assert(!("stiffness" in panelSpring) && !("damping" in panelSpring) && !("mass" in panelSpring), "settings panel transition should not expose GSAP-ignored spring fields");

  const imageBackground = createViewState({ backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE, backgroundImageOpacity: 58 });
  assert(imageBackground.view.rootStyle.value["--launchpad-background-image-opacity"] === "0.58", "root style should expose image opacity in image background mode");
  const tintedBackground = createViewState({ backgroundBaseColor: "#ABC", backgroundBaseOpacity: 74 });
  assert(tintedBackground.view.rootStyle.value["--launchpad-background-base-color"] === "#aabbcc", "root style should normalize base color");
  assert(tintedBackground.view.rootStyle.value["--launchpad-background-base-opacity"] === "0.74", "root style should expose configured base opacity");
  const customImageBackground = createViewState({ backgroundImageUrl: "asset://C:/Images/wallpaper.webp" });
  assert(customImageBackground.view.backgroundImageStyle.value.backgroundImage === "url(\"asset://C:/Images/wallpaper.webp\")", "background image style should expose custom asset urls");
  const fitImageBackground = createViewState({ backgroundImageLayout: BACKGROUND_IMAGE_LAYOUT_FIT, backgroundImageUrl: "asset://C:/Images/fit.webp" });
  assert(fitImageBackground.view.backgroundImageStyle.value.backgroundSize === "contain", "fit background image layout should use contain sizing");
  const tiledImageBackground = createViewState({ backgroundImageLayout: BACKGROUND_IMAGE_LAYOUT_TILE, backgroundImageUrl: "asset://C:/Images/tile.webp" });
  assert(tiledImageBackground.view.backgroundImageStyle.value.backgroundRepeat === "repeat", "tile background image layout should repeat the image");
  const unmaskedImageBackground = createViewState({ backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE, backgroundEffect: BACKGROUND_EFFECT_NONE });
  assert(unmaskedImageBackground.view.rootStyle.value["--launchpad-background-overlay-opacity"] === "0", "none background effect should hide the overlay");
  const dimmedImageBackground = createViewState({ backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE, backgroundDarkenColor: "#456", backgroundDarkenStrength: 64 });
  assert(dimmedImageBackground.view.rootStyle.value["--launchpad-background-overlay-color"] === "#445566", "dimmed background effect should expose configured darken color");
  assert(dimmedImageBackground.view.rootStyle.value["--launchpad-background-overlay-opacity"] === "0.64", "dimmed background effect should expose configured darken strength");
  const acrylicBackground = createViewState({
    backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
    backgroundEffect: BACKGROUND_EFFECT_ACRYLIC_WEBGL,
    backgroundImageOpacity: 71,
    backgroundImageUrl: "asset://C:/Images/acrylic.webp",
  });
  assert(acrylicBackground.view.shouldRenderPixiBackgroundEffect.value === true, "webgl acrylic should render the pixi background for image sources");
  assert(acrylicBackground.view.rootStyle.value["--launchpad-background-image-opacity"] === "0", "webgl acrylic should hide the css image background");
  assert(acrylicBackground.view.rootStyle.value["--launchpad-background-overlay-opacity"] === "0", "webgl acrylic should hide the css overlay");
  assert(acrylicBackground.view.backgroundImageStyle.value.backgroundImage === "url(\"asset://C:/Images/acrylic.webp\")", "webgl acrylic should keep the css image ready for handoff");
  const blurBackground = createViewState({
    backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
    backgroundEffect: BACKGROUND_EFFECT_BLUR,
    backgroundImageOpacity: 63,
    backgroundImageUrl: "asset://C:/Images/blur.webp",
  });
  assert(blurBackground.view.shouldRenderPixiBackgroundEffect.value === true, "blur should render the pixi background for image sources");
  assert(blurBackground.view.rootStyle.value["--launchpad-background-image-opacity"] === "0", "blur should hide the css image background");
  assert(blurBackground.view.rootStyle.value["--launchpad-background-overlay-opacity"] === "0", "blur should hide the css overlay");
  const liveDesktopBlur = createViewState({
    backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
    backgroundEffect: BACKGROUND_EFFECT_BLUR,
    backgroundBlurStrength: 50,
    backgroundBaseOpacity: 74,
    liveDesktopBackgroundSupport: {
      supportsLiveDesktopBackground: true,
      supportsLiveDesktopBackgroundEffects: false,
    },
  });
  assert(liveDesktopBlur.view.shouldRenderPixiBackgroundEffect.value === false, "live desktop blur should not use the image pixi background");
  assert(liveDesktopBlur.view.rootStyle.value["--launchpad-background-base-opacity"] === "0", "live desktop backgrounds should keep the css base layer transparent");
  assert(liveDesktopBlur.view.rootStyle.value["--launchpad-live-desktop-backdrop-filter"] === "none", "live desktop css fallback should stay disabled by default");
  assert(liveDesktopBlur.view.rootStyle.value["--launchpad-live-desktop-backdrop-opacity"] === "0", "live desktop css fallback should keep the backdrop layer transparent by default");
  const liveDesktopFallbackBlur = createViewState({
    backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
    backgroundEffect: BACKGROUND_EFFECT_BLUR,
    backgroundBlurStrength: 50,
    liveDesktopCssFallbackEffectsEnabled: true,
    liveDesktopBackgroundSupport: {
      supportsLiveDesktopBackground: true,
      supportsLiveDesktopBackgroundEffects: false,
    },
  });
  assert(liveDesktopFallbackBlur.view.rootStyle.value["--launchpad-live-desktop-backdrop-filter"] === "blur(16.0px)", "live desktop blur should use the css fallback when it is explicitly enabled");
  assert(liveDesktopFallbackBlur.view.rootStyle.value["--launchpad-live-desktop-backdrop-opacity"] === "0.001", "live desktop blur should activate the transparent backdrop layer when fallback is enabled");
  const liveDesktopNativeBlur = createViewState({
    backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
    backgroundEffect: BACKGROUND_EFFECT_BLUR,
    liveDesktopBackgroundSupport: {
      supportsLiveDesktopBackground: true,
      supportsLiveDesktopBackgroundEffects: true,
    },
  });
  assert(liveDesktopNativeBlur.view.rootStyle.value["--launchpad-live-desktop-backdrop-filter"] === "none", "native live desktop effects should not be double-filtered in css");
  const liveDesktopAcrylic = createViewState({
    backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
    backgroundEffect: BACKGROUND_EFFECT_ACRYLIC_WEBGL,
    backgroundBlurStrength: 10,
    backgroundAcrylicBlurStrength: 80,
    liveDesktopCssFallbackEffectsEnabled: true,
    liveDesktopBackgroundSupport: {
      supportsLiveDesktopBackground: true,
      supportsLiveDesktopBackgroundEffects: false,
    },
  });
  assert(liveDesktopAcrylic.view.rootStyle.value["--launchpad-background-overlay-color"] === "rgb(51 102 153)", "live desktop acrylic fallback should expose acrylic tint color");
  assert(liveDesktopAcrylic.view.rootStyle.value["--launchpad-background-overlay-opacity"] === "0.26", "live desktop acrylic fallback should expose acrylic tint opacity");
  assert(liveDesktopAcrylic.view.rootStyle.value["--launchpad-live-desktop-backdrop-filter"].includes("blur(24.4px)"), "live desktop acrylic fallback should use acrylic blur strength");
  assert(liveDesktopAcrylic.view.rootStyle.value["--launchpad-live-desktop-backdrop-filter"].includes("saturate(1.30)"), "live desktop acrylic fallback should include acrylic color adjustments");

  setLiveDesktopExperimentEnabledForTests(false);
  const disabledLiveDesktop = createViewState({
    backgroundSource: BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
    backgroundEffect: BACKGROUND_EFFECT_BLUR,
    backgroundBaseOpacity: 74,
    liveDesktopCssFallbackEffectsEnabled: true,
    liveDesktopBackgroundSupport: {
      supportsLiveDesktopBackground: true,
      supportsLiveDesktopBackgroundEffects: false,
    },
  });
  assert(disabledLiveDesktop.view.rootStyle.value["--launchpad-background-base-opacity"] === "0.74", "disabled live desktop experiment should keep the normal css base layer");
  assert(disabledLiveDesktop.view.rootStyle.value["--launchpad-live-desktop-backdrop-filter"] === "none", "disabled live desktop experiment should disable css fallback filters");
  assert(disabledLiveDesktop.view.rootStyle.value["--launchpad-live-desktop-backdrop-opacity"] === "0", "disabled live desktop experiment should keep the fallback layer transparent");
  setLiveDesktopExperimentEnabledForTests(true);

  const search = createViewState({ isSearchMode: true });
  assert(search.view.desktopTrackMotionKey.value === "open-search-spring", "desktop motion key should describe search mode");

  const closingDesktop = createViewState({ isDesktopOpen: false, isDesktopClosing: true, isSearchMode: true });
  assert(closingDesktop.view.desktopTrackMotionKey.value === "open-search-spring", "closing desktop should avoid remounting the page track");
  assert(closingDesktop.view.homeChromeAnimate.value.opacity === 0, "closing desktop should still hide home chrome");

  const closed = createViewState({ isDesktopOpen: false, isSearchMode: true });
  assert(closed.view.desktopTrackMotionKey.value === "closed-search-snap", "closed search should use snap motion key");
  assert(closed.view.desktopVisualTransform.value.scale === DESKTOP_CLOSE_SCALE, "closed desktop visual root should carry the close scale");
  assert(closed.view.desktopVisualAlpha.value === 0, "closed desktop canvas should be hidden");
  assert(closed.view.launchpadVisualTransform.value.scale === DESKTOP_CLOSE_SCALE, "closed launchpad should scale folder overlay layers");
  assert(closed.view.launchpadVisualAlpha.value === 0, "closed launchpad should hide folder overlay layers");
  assert(closed.view.homeChromeAnimate.value.opacity === 0, "closed desktop should hide home chrome");
  assert(closed.view.homeChromeStyle.value.pointerEvents === "none", "closed desktop should disable home chrome pointer events");

  const openFolder = createViewState({ openFolderId: "folder-1", isFolderLayerActive: true });
  assert(openFolder.view.desktopTrackMotionKey.value === "open-desktop-snap", "open folder should snap the desktop track");
  assert(!("y" in openFolder.view.homeChromeAnimate.value) && !("scale" in openFolder.view.homeChromeAnimate.value), "open folder chrome should not declare DOM transforms");
  assert(openFolder.view.desktopVisualTransform.value.y === 44 && openFolder.view.desktopVisualTransform.value.scale === 0.92, "open folder should move the desktop visual root inside Pixi");
  assert(openFolder.view.desktopVisualAlpha.value === 0, "open folder should hide the desktop canvas through view state");
  assert(openFolder.view.launchpadVisualTransform.value.scale === 1 && openFolder.view.launchpadVisualTransform.value.y === 0, "open folder should not transform folder overlay layers");
  assert(openFolder.view.launchpadVisualAlpha.value === 1, "open folder should keep folder overlay layers visible");
  assert(openFolder.view.homeChromeAnimate.value.filter === "blur(0px)", "open folder should avoid chrome blur compositor flicker");
  assert(openFolder.view.homeChromeStyle.value.pointerEvents === "none", "open folder should disable home chrome pointer events");

  const activeFolderLayer = createViewState({ isFolderLayerActive: true });
  assert(activeFolderLayer.view.homeChromeStyle.value.pointerEvents === "none", "active folder layer should keep home chrome pointer events disabled even without an open id");

  const closingFolderLayer = createViewState({ isFolderClosing: true, isFolderLayerActive: true });
  assert(closingFolderLayer.view.desktopTrackMotionKey.value === "open-desktop-spring", "closing folder should keep desktop page turns animated");
  assert(closingFolderLayer.view.homeChromeStyle.value.pointerEvents === "none", "closing folder should keep home chrome pointer events disabled");

  const zoomFadeClosingFolderLayer = createViewState({ isFolderZoomFadeClosing: true, isFolderLayerActive: true, openFolderId: "folder-1" });
  assert(zoomFadeClosingFolderLayer.view.desktopTrackMotionKey.value === "open-desktop-spring", "zoom-fade closing folder should keep desktop page turns animated");
  assert(zoomFadeClosingFolderLayer.view.homeChromeStyle.value.pointerEvents === "none", "zoom-fade closing folder should keep home chrome pointer events disabled");

  const settling = createViewState({ isHomeRevealSettling: true, isFolderLayerActive: true, openFolderId: "folder-1" });
  assert(settling.view.desktopTrackMotionKey.value === "open-desktop-snap", "home reveal settling should snap the desktop track");
  setLiveDesktopExperimentEnabledForTests(null);
}
