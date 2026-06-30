<template>
  <div
    v-if="state.shouldRenderSettingsPanel.value"
    key="settings-overlay"
    ref="settingsOverlayRef"
    :class="cx('settings-overlay', !state.isSettingsPanelOpen.value && 'settings-overlay-closing')"
    @wheel.stop
    @pointerdown.self="state.closeSettingsPanel"
  >
    <section
      ref="settingsPanelRef"
      :class="cx('settings-panel', isSettingsNavigationCompact && 'settings-panel-navigation-compact')"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      tabindex="-1"
      @keydown="handleSettingsPanelKeydown"
    >
      <header class="settings-panel-header">
        <div class="settings-panel-header-rail">
          <fluent-button
            appearance="subtle"
            icon-only
            class="settings-navigation-toggle-button"
            type="button"
            :aria-label="isSettingsNavigationCompact ? '展开设置导航' : '折叠设置导航'"
            :aria-pressed="isSettingsNavigationCompact"
            @click="isSettingsNavigationCompact = !isSettingsNavigationCompact"
          >
            <NavigationIcon class="settings-navigation-toggle-icon" />
          </fluent-button>
        </div>
        <div class="settings-panel-header-main">
          <div class="settings-title-block">
            <h2>设置</h2>
          </div>
          <fluent-button
            appearance="subtle"
            icon-only
            class="settings-close-button"
            type="button"
            aria-label="关闭设置"
            @click="state.closeSettingsPanel"
          >
            <DismissIcon class="settings-close-icon" />
          </fluent-button>
        </div>
      </header>

      <div :class="cx('settings-shell', isSettingsNavigationCompact && 'settings-shell-compact')">
        <nav class="settings-navigation" aria-label="设置分类">
          <button
            v-for="tab in settingsTabs"
            :key="tab.id"
            type="button"
            :class="cx('settings-nav-item', activeSettingsTab === tab.id && 'settings-nav-item-active')"
            :aria-current="activeSettingsTab === tab.id ? 'page' : undefined"
            :aria-label="tab.label"
            :title="isSettingsNavigationCompact ? tab.label : undefined"
            @click="activeSettingsTab = tab.id"
          >
            <component :is="tab.icon" class="settings-nav-icon" />
            <span class="settings-nav-copy">
              <span>{{ tab.label }}</span>
            </span>
          </button>
        </nav>

        <div class="settings-main">
          <div class="settings-content">
            <component
              :is="activeSettingsPageComponent"
              :state="state"
              :context="settingsPanelContext"
              :background-layout-context="backgroundLayoutContext"
            />
          </div>

          <footer v-if="activeSettingsTab === 'general' || activeSettingsTab === 'interface'" class="settings-actions">
            <fluent-button appearance="outline" type="button" @click="state.closeSettingsPanel">取消</fluent-button>
            <fluent-button
              appearance="primary"
              type="button"
              :disabled.prop="!!state.dragMeta.value || state.isApplyingSettingsConfig.value"
              @click="state.applySettingsConfig"
            >
              应用
            </fluent-button>
          </footer>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppsIcon from "~icons/fluent/apps-24-regular";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import InfoIcon from "~icons/fluent/info-24-regular";
import NavigationIcon from "~icons/fluent/navigation-24-regular";
import PaintBrushIcon from "~icons/fluent/paint-brush-24-regular";
import SettingsRegularIcon from "~icons/fluent/settings-24-regular";
import AboutSettingsPage from "./settings/AboutSettingsPage.vue";
import AppsSettingsPage from "./settings/AppsSettingsPage.vue";
import GeneralSettingsPage from "./settings/GeneralSettingsPage.vue";
import InterfaceSettingsPage from "./settings/InterfaceSettingsPage.vue";
import { useBackgroundImagePixelSize } from "../composables/useBackgroundImagePixelSize.js";
import { useGsapDomMotion } from "../composables/useGsapDomMotion.js";
import { ICON_SIZE_MAX, ICON_SIZE_MIN, ICON_SIZE_STEP } from "../composables/launchpadConstants.js";
import { listenNativeEvent } from "../api/launchpadApi.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_EFFECT_NONE,
  BACKGROUND_BLUR_STRENGTH_MAX,
  BACKGROUND_BLUR_STRENGTH_MIN,
  BACKGROUND_BLUR_STRENGTH_STEP,
  BACKGROUND_DARKEN_STRENGTH_MAX,
  BACKGROUND_DARKEN_STRENGTH_MIN,
  BACKGROUND_DARKEN_STRENGTH_STEP,
  BACKGROUND_BASE_OPACITY_MAX,
  BACKGROUND_BASE_OPACITY_MIN,
  BACKGROUND_BASE_OPACITY_STEP,
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
  backgroundSourceUsesLiveDesktop,
  backgroundSourceUsesImage,
  normalizeBackgroundAcrylicAppearance,
  normalizeBackgroundAcrylicParams,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_MATERIAL_NONE,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_MICA,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
  WINDOW_MODE_FULLSCREEN,
  WINDOW_MODE_WINDOWED,
} from "../composables/useLaunchpadSettingsConfig.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import { cx } from "../domain/launchpadLayout.js";
import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  formatMainWindowShortcut,
  mainWindowShortcutFromKeyboardEvent,
} from "../domain/mainWindowShortcut.js";
import { rgbArrayToHex } from "../rendering/pixi/background/acrylicParams.js";

const props = defineProps({
  backgroundLayoutContext: { type: Object, default: null },
  state: { type: Object, required: true },
});

const activeSettingsTab = ref("general");
const isSettingsNavigationCompact = ref(false);
const activeAcrylicParamsProfile = ref(BACKGROUND_ACRYLIC_APPEARANCE_DARK);
const settingsOverlayRef = ref(null);
const settingsPanelRef = ref(null);
const settingsOverlayMotion = useGsapDomMotion(settingsOverlayRef, {
  initial: { opacity: 0 },
  motion: resolveSettingsOverlayMotion,
});
const settingsPanelMotion = useGsapDomMotion(settingsPanelRef, {
  initial: () => props.state.settingsPanelInitial.value,
  motion: resolveSettingsPanelMotion,
});
const systemAcrylicAppearance = ref(BACKGROUND_ACRYLIC_APPEARANCE_DARK);
const isRecordingMainWindowShortcut = ref(false);
let systemAppearanceQuery = null;
let liveDesktopStatusTimer = null;
let unlistenMainWindowShortcutCaptured = null;
let mainWindowShortcutRecordingSession = 0;
const ACRYLIC_PARAM_STEP = 0.01;
const SETTINGS_OVERLAY_DURATION = 0.16;
const SETTINGS_OVERLAY_EASE = "power2.out";
const SETTINGS_PANEL_OPEN_DURATION = 0.34;
const SETTINGS_PANEL_OPEN_EASE = "power3.out";
const SETTINGS_PANEL_CLOSE_DURATION = 0.22;
const SETTINGS_PANEL_CLOSE_EASE = "power2.inOut";
const LIVE_DESKTOP_STATUS_REFRESH_INTERVAL_MS = 1000;
const ACRYLIC_TINT_STRENGTH_MIN = 0;
const ACRYLIC_TINT_STRENGTH_MAX = 0.6;
const ACRYLIC_BRIGHTNESS_MIN = 0.5;
const ACRYLIC_BRIGHTNESS_MAX = 1.2;
const ACRYLIC_CONTRAST_MIN = 0.75;
const ACRYLIC_CONTRAST_MAX = 1.25;
const ACRYLIC_SATURATION_MIN = 0.8;
const ACRYLIC_SATURATION_MAX = 1.8;
const windowEffectsSupport = computed(() => props.state.windowEffectsSupport.value || {});
const windowEffectMaterialNotes = computed(() => [
  {
    material: WINDOW_EFFECT_MATERIAL_NONE,
    materialClass: "none",
    label: "无材质",
    description: "关闭系统材质，只显示底色与图片层",
    available: true,
  },
  {
    material: WINDOW_EFFECT_MATERIAL_ACRYLIC,
    materialClass: "acrylic",
    label: "Acrylic",
    description: "半透明模糊，背景变化更明显",
    available: Boolean(windowEffectsSupport.value.supportsAcrylic),
  },
  {
    material: WINDOW_EFFECT_MATERIAL_MICA,
    materialClass: "mica",
    label: "Mica",
    description: "桌面采样，观感更稳定，资源占用更低",
    available: Boolean(windowEffectsSupport.value.supportsMica),
  },
  {
    material: WINDOW_EFFECT_MATERIAL_MICA_ALT,
    materialClass: "mica-alt",
    label: "Mica Alt",
    description: "Mica 变体，层次更强，适合分层窗口",
    available: Boolean(windowEffectsSupport.value.supportsMicaAlt),
  },
]);
const windowEffectAppearances = [
  { appearance: WINDOW_EFFECT_APPEARANCE_LIGHT, appearanceLabel: "浅色" },
  { appearance: WINDOW_EFFECT_APPEARANCE_DARK, appearanceLabel: "深色" },
];
const mainWindowShortcutLabel = computed(() => (
  isRecordingMainWindowShortcut.value
    ? "按下组合键"
    : formatMainWindowShortcut(props.state.draftMainWindowShortcut.value)
));
const mainWindowShortcutHint = computed(() => {
  if (props.state.mainWindowShortcutError.value) return props.state.mainWindowShortcutError.value;
  return isRecordingMainWindowShortcut.value ? "按 Esc 取消录制" : "快速显示或隐藏 LaunchPad";
});
const backgroundImageLayoutOptions = [
  { layout: BACKGROUND_IMAGE_LAYOUT_FILL, label: "填充" },
  { layout: BACKGROUND_IMAGE_LAYOUT_FIT, label: "适应" },
  { layout: BACKGROUND_IMAGE_LAYOUT_STRETCH, label: "拉伸" },
  { layout: BACKGROUND_IMAGE_LAYOUT_TILE, label: "平铺" },
  { layout: BACKGROUND_IMAGE_LAYOUT_CENTER, label: "居中" },
];
const activeWindowEffectAppearance = computed(() => (
  windowEffectAppearances.find((item) => item.appearance === props.state.draftWindowEffectAppearance.value)
  || windowEffectAppearances[1]
));
const windowEffectPreviewItems = computed(() => (
  windowEffectMaterialNotes.value.map((material) => ({
    ...material,
    ...activeWindowEffectAppearance.value,
    active: props.state.draftWindowEffectMaterial.value === material.material,
  }))
));
const canEditWindowEffectAppearance = computed(() =>
  props.state.draftWindowEffectMaterial.value !== WINDOW_EFFECT_MATERIAL_NONE
  && props.state.canUseWindowEffectMaterial(props.state.draftWindowEffectMaterial.value)
);
const doesDraftBackgroundUseImage = computed(() => backgroundSourceUsesImage(props.state.draftBackgroundSource.value));
const canShowLiveDesktopControls = computed(() => isLiveDesktopExperimentEnabled());
const doesDraftBackgroundUseLiveDesktop = computed(() => Boolean(
  canShowLiveDesktopControls.value
  && backgroundSourceUsesLiveDesktop(props.state.draftBackgroundSource.value)
));
const doesDraftBackgroundUseLayer = computed(() => doesDraftBackgroundUseImage.value || doesDraftBackgroundUseLiveDesktop.value);
const isDraftCustomImage = computed(() => props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE);
const isDraftWindowsWallpaper = computed(() => props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER);
const canUseDraftBackgroundEffect = (effect) => props.state.canUseDraftBackgroundEffect(effect);
const liveDesktopUnavailableDetail = computed(() => {
  const support = props.state.liveDesktopBackgroundSupport?.value;
  return String(support?.detail || support?.reason || "").trim();
});
const liveDesktopRuntimeDetail = computed(() => {
  const status = props.state.liveDesktopRuntimeStatus?.value;
  if (!status || status.phase === "stopped") return "";
  return String(status.detail || status.reason || "").trim();
});
const backgroundSourceHint = computed(() =>
  props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE
    ? "自定义图片叠在底色上方"
    : props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER
      ? "跟随当前 Windows 桌面壁纸"
      : props.state.draftBackgroundSource.value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP && canShowLiveDesktopControls.value
        ? liveDesktopRuntimeDetail.value || "捕获动态桌面并在 Native GPU 管线中合成"
        : canShowLiveDesktopControls.value && !props.state.canUseLiveDesktopBackground() && liveDesktopUnavailableDetail.value
          ? `动态桌面不可用：${liveDesktopUnavailableDetail.value}`
        : "不叠加背景层"
);
const backgroundEffectHint = computed(() =>
  doesDraftBackgroundUseLayer.value
    ? doesDraftBackgroundUseLiveDesktop.value && !props.state.canUseLiveDesktopBackgroundEffect(props.state.draftBackgroundEffect.value)
      ? "当前效果由前端透明层合成"
      : props.state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL
      ? "WebGL Acrylic 风格合成"
      : props.state.draftBackgroundEffect.value === BACKGROUND_EFFECT_BLUR
        ? "模糊背景层"
      : props.state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED
        ? "叠加暗化遮罩"
        : "直接显示背景层"
    : "选择背景层后可用"
);
const draftBackgroundImageName = computed(() => {
  const path = String(props.state.draftBackgroundImagePath.value || "").trim();
  if (!path) return isDraftWindowsWallpaper.value ? "等待同步桌面壁纸" : "使用内置图片";
  const name = path.split(/[\\/]/).filter(Boolean).pop() || "";
  if (isDraftWindowsWallpaper.value && /^background-[a-f0-9]{32}\./i.test(name)) return "当前桌面壁纸";
  return /^background-[a-f0-9]{32}\./i.test(name) ? "自定义图片" : name || "自定义图片";
});
const hasDraftBackgroundImagePreview = computed(() => Boolean(
  doesDraftBackgroundUseImage.value && props.state.draftBackgroundImageUrl.value
));
const draftBackgroundImagePixelSize = useBackgroundImagePixelSize(() => (
  hasDraftBackgroundImagePreview.value ? props.state.draftBackgroundImageUrl.value : null
));
const backgroundLayerPreviewLabel = computed(() => {
  if (!doesDraftBackgroundUseImage.value) return "无图片";
  return isDraftWindowsWallpaper.value ? "等待壁纸" : "选择图片";
});
const backgroundEffectPreviewLabel = computed(() => (
  isDraftWindowsWallpaper.value ? "等待壁纸" : "选择图片后可用"
));
const effectiveDraftBackgroundAcrylicAppearance = computed(() => {
  const appearance = normalizeBackgroundAcrylicAppearance(props.state.draftBackgroundAcrylicAppearance.value);
  return appearance === BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM ? systemAcrylicAppearance.value : appearance;
});
const draftBackgroundAcrylicPreviewParams = computed(() => {
  const appearance = effectiveDraftBackgroundAcrylicAppearance.value;
  const params = appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    ? props.state.draftBackgroundAcrylicLightParams.value
    : props.state.draftBackgroundAcrylicDarkParams.value;
  return normalizeBackgroundAcrylicParams(params, appearance);
});
const draftBackgroundEffectBlurStrength = computed(() => (
  props.state.draftBackgroundEffect.value === BACKGROUND_EFFECT_ACRYLIC_WEBGL
    ? props.state.draftBackgroundAcrylicBlurStrength.value
    : props.state.draftBackgroundBlurStrength.value
));
const activeAcrylicParams = computed(() => (
  activeAcrylicParamsProfile.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    ? props.state.draftBackgroundAcrylicLightParams.value
    : props.state.draftBackgroundAcrylicDarkParams.value
));
const activeAcrylicTintColorHex = computed(() => rgbArrayToHex(activeAcrylicParams.value?.tintColor));
const windowEffectsSupportHint = computed(() => {
  const availableLabels = windowEffectMaterialNotes.value
    .filter((item) => item.available)
    .map((item) => item.label);
  return availableLabels.length ? `${availableLabels.join(" / ")} 可用` : "当前系统不可用";
});
const settingsTabs = [
  { id: "general", label: "通用", icon: SettingsRegularIcon },
  { id: "interface", label: "外观", icon: PaintBrushIcon },
  { id: "apps", label: "应用", icon: AppsIcon },
  { id: "about", label: "关于", icon: InfoIcon },
];
const settingsPageComponents = {
  general: GeneralSettingsPage,
  interface: InterfaceSettingsPage,
  apps: AppsSettingsPage,
  about: AboutSettingsPage,
};
const activeSettingsPageComponent = computed(() => (
  settingsPageComponents[activeSettingsTab.value] || GeneralSettingsPage
));
const settingsPanelContext = {
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
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
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
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_MICA,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
  WINDOW_EFFECT_MATERIAL_NONE,
  WINDOW_MODE_FULLSCREEN,
  WINDOW_MODE_WINDOWED,
  activeAcrylicParams,
  activeAcrylicParamsProfile,
  activeAcrylicTintColorHex,
  activeSettingsTab,
  backgroundEffectHint,
  backgroundEffectPreviewLabel,
  backgroundImageLayoutOptions,
  backgroundLayerPreviewLabel,
  backgroundSourceHint,
  canEditWindowEffectAppearance,
  canShowLiveDesktopControls,
  canUseDraftBackgroundEffect,
  clearMainWindowShortcut,
  cx,
  doesDraftBackgroundUseImage,
  doesDraftBackgroundUseLayer,
  doesDraftBackgroundUseLiveDesktop,
  draftBackgroundAcrylicPreviewParams,
  draftBackgroundEffectBlurStrength,
  draftBackgroundImageName,
  draftBackgroundImagePixelSize,
  formatAcrylicPercent,
  formatScanTime,
  hasDraftBackgroundImagePreview,
  isDraftCustomImage,
  isDraftWindowsWallpaper,
  isRecordingMainWindowShortcut,
  mainWindowShortcutHint,
  mainWindowShortcutLabel,
  resetActiveDraftBackgroundAcrylicParams,
  resetMainWindowShortcut,
  selectWindowEffectPreview,
  setActiveDraftBackgroundAcrylicParam,
  setDraftBackgroundAcrylicAppearance,
  startMainWindowShortcutRecording,
  windowEffectPreviewItems,
  windowEffectsSupportHint,
};

onMounted(() => {
  if (typeof window === "undefined") return;
  window.addEventListener("keydown", handleSettingsPanelWindowKeydown, true);
  if (typeof window.matchMedia !== "function") return;
  systemAppearanceQuery = window.matchMedia("(prefers-color-scheme: light)");
  updateSystemAcrylicAppearance();
  if (typeof systemAppearanceQuery.addEventListener === "function") {
    systemAppearanceQuery.addEventListener("change", updateSystemAcrylicAppearance);
  } else {
    systemAppearanceQuery.addListener?.(updateSystemAcrylicAppearance);
  }
});

onBeforeUnmount(() => {
  clearLiveDesktopStatusTimer();
  stopMainWindowShortcutRecording();
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleSettingsPanelWindowKeydown, true);
  }
  if (!systemAppearanceQuery) return;
  if (typeof systemAppearanceQuery.removeEventListener === "function") {
    systemAppearanceQuery.removeEventListener("change", updateSystemAcrylicAppearance);
  } else {
    systemAppearanceQuery.removeListener?.(updateSystemAcrylicAppearance);
  }
  systemAppearanceQuery = null;
});

watch(
  [
    () => props.state.isSettingsPanelOpen.value,
    () => props.state.draftBackgroundSource.value,
  ],
  syncLiveDesktopStatusTimer,
  { immediate: true }
);

watch(
  () => props.state.isSettingsPanelOpen.value,
  async (isOpen) => {
    if (!isOpen) {
      stopMainWindowShortcutRecording();
      return;
    }
    await nextTick();
    focusModalElement(settingsPanelRef);
  }
);

watch(
  () => props.state.draftBackgroundAcrylicAppearance.value,
  (appearance) => {
    if (appearance === BACKGROUND_ACRYLIC_APPEARANCE_DARK || appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) {
      activeAcrylicParamsProfile.value = appearance;
    }
  },
  { immediate: true }
);

watch(
  () => props.state.settingsOverlayAnimate.value,
  () => {
    settingsOverlayMotion.animate();
  },
  { flush: "post" }
);

watch(
  () => props.state.settingsPanelAnimate.value,
  () => {
    settingsPanelMotion.animate();
  },
  { flush: "post" }
);

async function startMainWindowShortcutRecording() {
  if (typeof window === "undefined") return;
  if (isRecordingMainWindowShortcut.value) return;
  props.state.mainWindowShortcutError.value = "";
  isRecordingMainWindowShortcut.value = true;
  mainWindowShortcutRecordingSession += 1;
  const session = mainWindowShortcutRecordingSession;
  window.addEventListener("keydown", handleMainWindowShortcutRecordingKeydown, true);
  const unlisten = await listenNativeEvent("launchpad-main-window-shortcut-captured", (event) => {
    if (session !== mainWindowShortcutRecordingSession) return;
    const shortcut = String(event?.payload || "").trim();
    if (!shortcut) return;
    props.state.setDraftMainWindowShortcut(shortcut);
    props.state.mainWindowShortcutError.value = "";
    stopMainWindowShortcutRecording();
  });
  if (session !== mainWindowShortcutRecordingSession) {
    unlisten?.();
    return;
  }
  unlistenMainWindowShortcutCaptured = unlisten;
  props.state.setMainWindowShortcutCaptureActive?.(true);
}

function stopMainWindowShortcutRecording() {
  if (isRecordingMainWindowShortcut.value) {
    props.state.setMainWindowShortcutCaptureActive?.(false);
  }
  mainWindowShortcutRecordingSession += 1;
  unlistenMainWindowShortcutCaptured?.();
  unlistenMainWindowShortcutCaptured = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleMainWindowShortcutRecordingKeydown, true);
  }
  isRecordingMainWindowShortcut.value = false;
}

function handleMainWindowShortcutRecordingKeydown(event) {
  event.preventDefault();
  event.stopPropagation();
  const result = mainWindowShortcutFromKeyboardEvent(event);
  if (result.status === "cancel") {
    stopMainWindowShortcutRecording();
    props.state.mainWindowShortcutError.value = "";
    return;
  }
  if (result.status === "invalid") {
    props.state.mainWindowShortcutError.value = result.message;
    return;
  }
  props.state.setDraftMainWindowShortcut(result.shortcut);
  props.state.mainWindowShortcutError.value = "";
  stopMainWindowShortcutRecording();
}

function resetMainWindowShortcut() {
  stopMainWindowShortcutRecording();
  props.state.setDraftMainWindowShortcut(DEFAULT_MAIN_WINDOW_SHORTCUT);
}

function clearMainWindowShortcut() {
  stopMainWindowShortcutRecording();
  props.state.setDraftMainWindowShortcut(null);
}

function handleSettingsPanelKeydown(event) {
  if (event.defaultPrevented) return;
  if (event.key === "Escape" && closeOpenFluentMenu()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  handleModalKeydown(event, settingsPanelRef, props.state.closeSettingsPanel);
}

function handleSettingsPanelWindowKeydown(event) {
  if (!props.state.isSettingsPanelOpen.value || event.key !== "Escape") return;
  if (!closeOpenFluentMenu()) return;
  event.preventDefault();
  event.stopPropagation();
}

function closeOpenFluentMenu() {
  const panel = settingsPanelRef.value;
  const menus = Array.from(panel?.querySelectorAll?.("fluent-menu") || []);
  const openMenu = menus.find((menu) => (
    menu.querySelector("[slot='trigger']")?.getAttribute("aria-expanded") === "true"
  ));
  if (!openMenu) return false;
  openMenu.closeMenu?.();
  openMenu.querySelector("[slot='trigger']")?.focus?.({ preventScroll: true });
  return true;
}

function resolveSettingsOverlayMotion() {
  return {
    ...props.state.settingsOverlayAnimate.value,
    duration: SETTINGS_OVERLAY_DURATION,
    ease: SETTINGS_OVERLAY_EASE,
  };
}

function resolveSettingsPanelMotion() {
  const target = props.state.settingsPanelAnimate.value;
  const isClosing = Number(target.opacity) === 0;
  const closeDuration = Number(props.state.settingsPanelCloseDurationSeconds?.value);
  let duration = SETTINGS_PANEL_OPEN_DURATION;
  if (isClosing) {
    duration = Number.isFinite(closeDuration) ? closeDuration : SETTINGS_PANEL_CLOSE_DURATION;
  }
  return {
    ...target,
    duration,
    ease: isClosing ? SETTINGS_PANEL_CLOSE_EASE : SETTINGS_PANEL_OPEN_EASE,
  };
}

function resolveSystemAcrylicAppearance() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return BACKGROUND_ACRYLIC_APPEARANCE_DARK;
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    : BACKGROUND_ACRYLIC_APPEARANCE_DARK;
}

function updateSystemAcrylicAppearance() {
  systemAcrylicAppearance.value = resolveSystemAcrylicAppearance();
}

function clearLiveDesktopStatusTimer() {
  if (liveDesktopStatusTimer) window.clearInterval(liveDesktopStatusTimer);
  liveDesktopStatusTimer = null;
}

function refreshLiveDesktopRuntimeStatus() {
  if (!canShowLiveDesktopControls.value) return;
  props.state.refreshLiveDesktopRuntimeStatus?.();
}

function syncLiveDesktopStatusTimer() {
  clearLiveDesktopStatusTimer();
  if (typeof window === "undefined") return;
  if (!canShowLiveDesktopControls.value) return;
  if (!props.state.isSettingsPanelOpen.value || !doesDraftBackgroundUseLiveDesktop.value) return;
  if (typeof props.state.refreshLiveDesktopRuntimeStatus !== "function") return;
  refreshLiveDesktopRuntimeStatus();
  liveDesktopStatusTimer = window.setInterval(
    refreshLiveDesktopRuntimeStatus,
    LIVE_DESKTOP_STATUS_REFRESH_INTERVAL_MS
  );
}

function selectWindowEffectPreview(material, appearance) {
  if (!props.state.canUseWindowEffectMaterial(material)) return;
  props.state.setDraftWindowEffectMaterial(material);
  props.state.setDraftWindowEffectAppearance(appearance);
}

function setDraftBackgroundAcrylicAppearance(appearance) {
  props.state.setDraftBackgroundAcrylicAppearance(appearance);
  if (appearance === BACKGROUND_ACRYLIC_APPEARANCE_DARK || appearance === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) {
    activeAcrylicParamsProfile.value = appearance;
  }
}

function setActiveDraftBackgroundAcrylicParam(key, value) {
  props.state.setDraftBackgroundAcrylicParam(activeAcrylicParamsProfile.value, key, value);
}

function resetActiveDraftBackgroundAcrylicParams() {
  props.state.resetDraftBackgroundAcrylicParams(activeAcrylicParamsProfile.value);
}

function formatAcrylicPercent(value) {
  const number = Number(value);
  return `${Math.round((Number.isFinite(number) ? number : 0) * 100)}%`;
}

function formatScanTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
</script>
