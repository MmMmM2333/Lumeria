import { computed, ref } from "vue";
import { clamp } from "../domain/launchpadLayout.js";
import {
  DESKTOP_CLOSE_DURATION,
  DESKTOP_CLOSE_SCALE,
  SETTINGS_PANEL_CLOSE_DURATION,
} from "./launchpadConstants.js";

const SETTINGS_PANEL_CLOSE_MODE_PANEL = "panel";
const SETTINGS_PANEL_CLOSE_MODE_DESKTOP = "desktop";

export type SettingsPanelMotionGeometry = Readonly<{
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  borderRadius: number;
}>;
export type SettingsPanelAnchorRect = Readonly<Pick<DOMRect, "height" | "left" | "top" | "width">>;
export type SettingsPanelTriggerEvent = Readonly<{
  currentTarget?: Readonly<{
    getBoundingClientRect?: () => SettingsPanelAnchorRect;
  }> | null;
}> | null;
export type SettingsPanelFlowOptions = Readonly<{
  beginSettingsEdit: () => void;
  cancelSettingsEdit: () => void;
  closeManagedAppEditor: () => void;
  closeScanResults: () => void;
  isDragActive: () => boolean;
}>;
export type SettingsPanelCloseOptions = Readonly<{ mode?: "desktop" | "panel" }>;

export function useSettingsPanelFlow(options: SettingsPanelFlowOptions) {
  if (typeof options?.beginSettingsEdit !== "function" || typeof options?.cancelSettingsEdit !== "function") {
    throw new TypeError("useSettingsPanelFlow requires settings edit session commands");
  }
  const isSettingsPanelOpen = ref(false);
  const isSettingsPanelClosing = ref(false);
  const settingsPanelCloseMode = ref(SETTINGS_PANEL_CLOSE_MODE_PANEL);
  const settingsPanelMotionGeometry = ref({ x: 0, y: 0, scaleX: 0.08, scaleY: 0.06, borderRadius: 18 });
  let settingsPanelCloseTimer: number | null = null;

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
      if (settingsPanelCloseMode.value === SETTINGS_PANEL_CLOSE_MODE_DESKTOP) {
        return {
          opacity: 0,
          scaleX: DESKTOP_CLOSE_SCALE,
          scaleY: DESKTOP_CLOSE_SCALE,
          x: 0,
          y: 0,
          borderRadius: "18px",
        };
      }
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
  const settingsPanelCloseDurationSeconds = computed(() => (
    (settingsPanelCloseMode.value === SETTINGS_PANEL_CLOSE_MODE_DESKTOP
      ? DESKTOP_CLOSE_DURATION
      : SETTINGS_PANEL_CLOSE_DURATION) / 1000
  ));

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

  function makeSettingsPanelGeometryFromRect(rect: SettingsPanelAnchorRect | null): SettingsPanelMotionGeometry {
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

  function getSettingsButtonRect(event?: SettingsPanelTriggerEvent): SettingsPanelAnchorRect | null {
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

  function openSettingsPanel(event?: SettingsPanelTriggerEvent): void {
    if (options.isDragActive()) return;
    clearSettingsPanelCloseTimer();
    settingsPanelCloseMode.value = SETTINGS_PANEL_CLOSE_MODE_PANEL;
    settingsPanelMotionGeometry.value = makeSettingsPanelGeometryFromRect(getSettingsButtonRect(event) || getCenterSettingsRect());
    options.beginSettingsEdit();
    isSettingsPanelClosing.value = false;
    isSettingsPanelOpen.value = true;
  }

  function closeSettingsPanel(closeOptions: SettingsPanelCloseOptions = {}): void {
    if (!isSettingsPanelOpen.value || isSettingsPanelClosing.value) return;
    clearSettingsPanelCloseTimer();
    settingsPanelCloseMode.value = closeOptions?.mode === SETTINGS_PANEL_CLOSE_MODE_DESKTOP
      ? SETTINGS_PANEL_CLOSE_MODE_DESKTOP
      : SETTINGS_PANEL_CLOSE_MODE_PANEL;
    options.cancelSettingsEdit();
    options.closeManagedAppEditor();
    options.closeScanResults();
    isSettingsPanelOpen.value = false;
    isSettingsPanelClosing.value = true;
    const closeDurationMs = settingsPanelCloseMode.value === SETTINGS_PANEL_CLOSE_MODE_DESKTOP
      ? DESKTOP_CLOSE_DURATION
      : SETTINGS_PANEL_CLOSE_DURATION;
    settingsPanelCloseTimer = window.setTimeout(() => {
      isSettingsPanelClosing.value = false;
      settingsPanelCloseMode.value = SETTINGS_PANEL_CLOSE_MODE_PANEL;
      clearSettingsPanelCloseTimer();
    }, closeDurationMs);
  }

  return {
    clearSettingsPanelCloseTimer,
    closeSettingsPanel,
    isSettingsPanelOpen,
    openSettingsPanel,
    settingsOverlayAnimate,
    settingsPanelAnimate,
    settingsPanelCloseDurationSeconds,
    settingsPanelInitial,
    shouldRenderSettingsPanel,
  };
}
