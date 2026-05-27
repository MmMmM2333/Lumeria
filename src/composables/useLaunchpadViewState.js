import { computed } from "vue";
import { DESKTOP_CLOSE_SCALE } from "./launchpadConstants.js";
import {
  appLaunchGhostTransition,
  desktopTrackTransition,
  dragPreviewSpring,
  folderContentTransition,
  homeShellTransition,
  instantTrackTransition,
  layoutSpring,
  panelSpring,
} from "./launchpadMotion.js";

export function useLaunchpadViewState(options) {
  const desktopTrackAnimate = computed(() => ({ x: `-${options.pageIndex.value * 100}%` }));
  const searchTrackAnimate = computed(() => ({ x: `-${options.searchPageIndex.value * 100}%` }));
  const activeDesktopTrackAnimate = computed(() => (options.isSearchMode.value ? searchTrackAnimate.value : desktopTrackAnimate.value));
  const shouldFreezeDesktopProjection = computed(() => Boolean(
    options.isFolderLayerActive.value ||
    options.isHomeRevealSettling.value ||
    !options.isDesktopOpen.value ||
    options.isDesktopClosing.value ||
    options.isAppLaunching.value
  ));
  const shouldSnapDesktopTrack = computed(() => Boolean(
    options.isFolderLayerActive.value ||
    options.isHomeRevealSettling.value ||
    !options.isDesktopOpen.value ||
    options.isDesktopClosing.value ||
    options.isAppLaunching.value
  ));
  const desktopLayoutEnabled = computed(() => !shouldFreezeDesktopProjection.value);
  const desktopProjectionKeyMode = computed(() => (desktopLayoutEnabled.value ? `enabled-${options.desktopProjectionEpoch.value}` : "frozen"));
  const activeDesktopTrackTransition = computed(() => (shouldSnapDesktopTrack.value ? instantTrackTransition : desktopTrackTransition));
  const desktopTrackMotionKey = computed(() => `${options.isDesktopOpen.value ? "open" : "closed"}-${options.isSearchMode.value ? "search" : "desktop"}-${shouldSnapDesktopTrack.value ? "snap" : "spring"}`);
  const folderTrackAnimate = computed(() => ({ x: `-${options.folderPageIndex.value * 100}%` }));
  const isDesktopAnimatingClosed = computed(() => Boolean(!options.isDesktopOpen.value || options.isDesktopClosing.value || options.isAppLaunching.value));
  const shouldHideHomeShell = computed(() => Boolean((options.openFolderId.value && !options.isFolderClosing.value) || isDesktopAnimatingClosed.value));
  const isHomeInteractionDisabled = computed(() => Boolean(!options.isDesktopOpen.value || options.isDesktopClosing.value || options.isAppLaunching.value));
  const rootStyle = computed(() => ({
    "--configured-app-icon-size": `${options.iconSize.value}px`,
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
  const folderPanelInitial = computed(() => ({
    opacity: 0.92,
    scaleX: options.folderMotionGeometry.value.scaleX,
    scaleY: options.folderMotionGeometry.value.scaleY,
    x: options.folderMotionGeometry.value.x,
    y: options.folderMotionGeometry.value.y,
    borderRadius: `${options.folderMotionGeometry.value.borderRadius}px`,
    filter: "blur(0px)",
  }));
  const folderPanelAnimate = computed(() => {
    if (options.isFolderAppLaunchClosing.value) {
      return { opacity: 0, scaleX: 1.08, scaleY: 1.08, x: 0, y: 0, borderRadius: "46px", filter: "blur(0px)" };
    }
    if (options.isFolderClosing.value) {
      return {
        opacity: 0,
        scaleX: options.folderMotionGeometry.value.scaleX,
        scaleY: options.folderMotionGeometry.value.scaleY,
        x: options.folderMotionGeometry.value.x,
        y: options.folderMotionGeometry.value.y,
        borderRadius: `${options.folderMotionGeometry.value.borderRadius}px`,
        filter: "blur(0px)",
      };
    }
    if (isDesktopAnimatingClosed.value) {
      return { opacity: 0, scaleX: DESKTOP_CLOSE_SCALE, scaleY: DESKTOP_CLOSE_SCALE, x: 0, y: 0, borderRadius: "42px", filter: "blur(8px)" };
    }
    return { opacity: 1, scaleX: 1, scaleY: 1, x: 0, y: 0, borderRadius: "42px", filter: "blur(0px)" };
  });
  const folderPanelTransition = computed(() => (
    isDesktopAnimatingClosed.value || (options.isHomeRevealSettling.value && options.openFolderId.value && !options.isFolderClosing.value)
      ? homeShellTransition
      : panelSpring
  ));
  const folderContentInitial = { opacity: 0, scale: 0.94, y: 18 };
  const folderContentAnimate = computed(() => {
    if (options.isFolderAppLaunchClosing.value) return { opacity: 0, scale: 1.08, y: 0 };
    return options.isFolderClosing.value
      ? { opacity: 0, scale: 0.96, y: 12 }
      : { opacity: 1, scale: 1, y: 0 };
  });
  const pageGridStyle = computed(() => ({
    gridTemplateColumns: `repeat(${options.gridCols.value}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${options.gridRows.value}, minmax(0, 1fr))`,
  }));

  function getDesktopGridProjectionKey(pageNumber) {
    return `${options.isSearchMode.value ? "search" : "desktop"}-grid-${pageNumber}-${desktopProjectionKeyMode.value}`;
  }

  return {
    activeDesktopTrackAnimate,
    activeDesktopTrackTransition,
    appLaunchGhostTransition,
    desktopLayoutEnabled,
    desktopTrackMotionKey,
    desktopTrackTransition,
    dragPreviewSpring,
    folderContentAnimate,
    folderContentInitial,
    folderContentTransition,
    folderPanelAnimate,
    folderPanelInitial,
    folderPanelTransition,
    folderTrackAnimate,
    getDesktopGridProjectionKey,
    homeShellAnimate,
    homeShellInitial,
    homeShellStyle,
    homeShellTransition,
    isHomeInteractionDisabled,
    layoutSpring,
    pageGridStyle,
    panelSpring,
    rootStyle,
  };
}
