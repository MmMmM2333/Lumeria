import { ref } from "vue";
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
  homeShellTransition,
  panelSpring,
} from "./launchpadMotion.js";
import { useLaunchpadViewState } from "./useLaunchpadViewState.js";

function createViewState(overrides = {}) {
  const state = {
    backgroundBaseColor: ref(overrides.backgroundBaseColor ?? "#10141f"),
    backgroundBaseOpacity: ref(overrides.backgroundBaseOpacity ?? 28),
    backgroundSource: ref(overrides.backgroundSource ?? BACKGROUND_SOURCE_SYSTEM_MATERIAL),
    backgroundEffect: ref(overrides.backgroundEffect ?? BACKGROUND_EFFECT_DIMMED),
    backgroundBlurStrength: ref(overrides.backgroundBlurStrength ?? 50),
    backgroundAcrylicParams: ref(overrides.backgroundAcrylicParams ?? {
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
    isHomeRevealSettling: ref(Boolean(overrides.isHomeRevealSettling)),
    isSearchMode: ref(Boolean(overrides.isSearchMode)),
    liveDesktopBackgroundSupport: ref(overrides.liveDesktopBackgroundSupport ?? {
      supportsLiveDesktopBackground: false,
      supportsLiveDesktopBackgroundEffects: false,
    }),
    liveDesktopCssFallbackEffectsEnabled: ref(Boolean(overrides.liveDesktopCssFallbackEffectsEnabled)),
    openFolderId: ref(overrides.openFolderId ?? null),
  };

  return {
    state,
    view: useLaunchpadViewState(state),
  };
}

export function runLaunchpadViewStateTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad view state test failed] ${message}`);
  };

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
  assert(desktop.view.homeShellAnimate.value.opacity === 1, "home shell should be visible in the idle desktop state");
  assert(desktop.view.homeShellStyle.value.pointerEvents === "auto", "home shell should allow pointer events in the idle desktop state");
  assert(desktop.view.appLaunchGhostTransition === appLaunchGhostTransition, "view state should expose the app launch ghost transition");
  assert(desktop.view.homeShellTransition === homeShellTransition, "view state should expose the home shell transition");
  assert(desktop.view.panelSpring === panelSpring, "view state should expose the settings panel spring");

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
    liveDesktopCssFallbackEffectsEnabled: true,
    liveDesktopBackgroundSupport: {
      supportsLiveDesktopBackground: true,
      supportsLiveDesktopBackgroundEffects: false,
    },
  });
  assert(liveDesktopAcrylic.view.rootStyle.value["--launchpad-background-overlay-color"] === "rgb(51 102 153)", "live desktop acrylic fallback should expose acrylic tint color");
  assert(liveDesktopAcrylic.view.rootStyle.value["--launchpad-background-overlay-opacity"] === "0.26", "live desktop acrylic fallback should expose acrylic tint opacity");
  assert(liveDesktopAcrylic.view.rootStyle.value["--launchpad-live-desktop-backdrop-filter"].includes("saturate(1.30)"), "live desktop acrylic fallback should include acrylic color adjustments");

  const search = createViewState({ isSearchMode: true });
  assert(search.view.desktopTrackMotionKey.value === "open-search-spring", "desktop motion key should describe search mode");

  const closingDesktop = createViewState({ isDesktopOpen: false, isDesktopClosing: true, isSearchMode: true });
  assert(closingDesktop.view.desktopTrackMotionKey.value === "open-search-spring", "closing desktop should avoid remounting the page track");
  assert(closingDesktop.view.homeShellAnimate.value.opacity === 0, "closing desktop should still hide home shell");

  const closed = createViewState({ isDesktopOpen: false, isSearchMode: true });
  assert(closed.view.desktopTrackMotionKey.value === "closed-search-snap", "closed search should use snap motion key");
  assert(closed.view.homeShellAnimate.value.opacity === 0, "closed desktop should hide home shell");
  assert(closed.view.homeShellStyle.value.pointerEvents === "none", "closed desktop should disable home shell pointer events");

  const openFolder = createViewState({ openFolderId: "folder-1", isFolderLayerActive: true });
  assert(openFolder.view.desktopTrackMotionKey.value === "open-desktop-snap", "open folder should snap the desktop track");
  assert(openFolder.view.homeShellAnimate.value.y === 44, "open folder should move home shell down");
  assert(openFolder.view.homeShellStyle.value.pointerEvents === "none", "open folder should disable home shell pointer events");

  const settling = createViewState({ isHomeRevealSettling: true, isFolderLayerActive: true, openFolderId: "folder-1" });
  assert(settling.view.desktopTrackMotionKey.value === "open-desktop-snap", "home reveal settling should snap the desktop track");
}
