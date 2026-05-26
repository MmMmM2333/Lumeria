import { computed, ref } from "vue";
import { clamp } from "../domain/launchpadLayout.js";
import { SETTINGS_PANEL_CLOSE_DURATION } from "./launchpadConstants.js";

export function useSettingsPanelFlow(options) {
  const isSettingsPanelOpen = ref(false);
  const isSettingsPanelClosing = ref(false);
  const settingsPanelMotionGeometry = ref({ x: 0, y: 0, scaleX: 0.08, scaleY: 0.06, borderRadius: 18 });
  let settingsPanelCloseTimer = null;

  const shouldRenderSettingsPanel = computed(() => Boolean(isSettingsPanelOpen.value || isSettingsPanelClosing.value));
  const settingsOverlayAnimate = computed(() => ({
    opacity: isSettingsPanelClosing.value ? 0 : 1,
  }));
  const settingsPanelInitial = computed(() => ({
    opacity: 0.88,
    scaleX: settingsPanelMotionGeometry.value.scaleX,
    scaleY: settingsPanelMotionGeometry.value.scaleY,
    x: settingsPanelMotionGeometry.value.x,
    y: settingsPanelMotionGeometry.value.y,
    borderRadius: `${settingsPanelMotionGeometry.value.borderRadius}px`,
  }));
  const settingsPanelAnimate = computed(() => {
    if (isSettingsPanelClosing.value) {
      return {
        opacity: 0,
        scaleX: settingsPanelMotionGeometry.value.scaleX,
        scaleY: settingsPanelMotionGeometry.value.scaleY,
        x: settingsPanelMotionGeometry.value.x,
        y: settingsPanelMotionGeometry.value.y,
        borderRadius: `${settingsPanelMotionGeometry.value.borderRadius}px`,
      };
    }
    return { opacity: 1, scaleX: 1, scaleY: 1, x: 0, y: 0, borderRadius: "18px" };
  });

  function clearSettingsPanelCloseTimer() {
    if (settingsPanelCloseTimer) window.clearTimeout(settingsPanelCloseTimer);
    settingsPanelCloseTimer = null;
  }

  function getSettingsPanelTargetSize() {
    if (typeof window === "undefined") return { width: 720, height: 760 };
    return {
      width: Math.min(720, window.innerWidth * 0.92),
      height: Math.min(760, Math.max(0, window.innerHeight - 48)),
    };
  }

  function makeSettingsPanelGeometryFromRect(rect) {
    if (!rect || typeof window === "undefined") {
      return { x: 0, y: 0, scaleX: 0.08, scaleY: 0.06, borderRadius: 18 };
    }
    const target = getSettingsPanelTargetSize();
    return {
      x: rect.left + rect.width / 2 - window.innerWidth / 2,
      y: rect.top + rect.height / 2 - window.innerHeight / 2,
      scaleX: clamp(rect.width / target.width, 0.04, 0.24),
      scaleY: clamp(rect.height / target.height, 0.04, 0.2),
      borderRadius: Math.min(18, Math.max(8, rect.width / 2)),
    };
  }

  function getSettingsButtonRect(event) {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function getCenterSettingsRect() {
    if (typeof window === "undefined") return null;
    const size = 36;
    return {
      left: window.innerWidth / 2 - size / 2,
      top: window.innerHeight / 2 - size / 2,
      width: size,
      height: size,
    };
  }

  function openSettingsPanel(event) {
    if (options.isDragActive()) return;
    clearSettingsPanelCloseTimer();
    settingsPanelMotionGeometry.value = makeSettingsPanelGeometryFromRect(getSettingsButtonRect(event) || getCenterSettingsRect());
    options.draftIconSize.value = options.iconSize.value;
    options.draftFolderIconSizeMode.value = options.folderIconSizeMode.value;
    options.draftFolderIconSize.value = options.folderIconSize.value;
    isSettingsPanelClosing.value = false;
    isSettingsPanelOpen.value = true;
  }

  function closeSettingsPanel() {
    if (!isSettingsPanelOpen.value || isSettingsPanelClosing.value) return;
    clearSettingsPanelCloseTimer();
    options.closeAddManagedAppPage();
    options.closeScanResultDialog();
    isSettingsPanelOpen.value = false;
    isSettingsPanelClosing.value = true;
    settingsPanelCloseTimer = window.setTimeout(() => {
      isSettingsPanelClosing.value = false;
      clearSettingsPanelCloseTimer();
    }, SETTINGS_PANEL_CLOSE_DURATION);
  }

  return {
    clearSettingsPanelCloseTimer,
    closeSettingsPanel,
    isSettingsPanelOpen,
    openSettingsPanel,
    settingsOverlayAnimate,
    settingsPanelAnimate,
    settingsPanelInitial,
    shouldRenderSettingsPanel,
  };
}
