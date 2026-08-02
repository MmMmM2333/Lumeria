<template>
  <div
    v-if="shouldRender"
    key="settings-overlay"
    ref="settingsOverlayRef"
    :class="cx('settings-overlay', !isOpen && 'settings-overlay-closing')"
    @wheel.stop
    @pointerdown.self="shell.actions.close"
  >
    <section
      ref="settingsPanelRef"
      :class="cx('settings-panel', isNavigationCompact && 'settings-panel-navigation-compact')"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      tabindex="-1"
      @keydown="handleSettingsPanelKeydown"
    >
      <header class="settings-panel-header">
        <div class="settings-panel-header-rail">
          <SettingsFluentButton
            appearance="subtle"
            icon-only
            class="settings-navigation-toggle-button"
            type="button"
            :aria-label="isNavigationCompact ? '展开设置导航' : '折叠设置导航'"
            :aria-pressed="isNavigationCompact"
            @click="shell.actions.toggleNavigation"
          >
            <NavigationIcon class="settings-navigation-toggle-icon" />
          </SettingsFluentButton>
        </div>
        <div class="settings-panel-header-main">
          <div class="settings-title-block">
            <div class="settings-title-row">
              <SettingsFluentButton
                v-if="activeRoute.depth > 0"
                appearance="subtle"
                icon-only
                class="settings-back-button"
                type="button"
                :aria-label="`返回${activeRoute.parentLabel}`"
                @click="shell.actions.closeSubPage"
              >
                <ArrowLeftIcon class="settings-back-icon" />
              </SettingsFluentButton>
              <nav class="settings-breadcrumb" aria-label="设置路径">
                <button
                  v-if="activeRoute.depth > 0"
                  type="button"
                  class="settings-breadcrumb-item settings-breadcrumb-parent"
                  :aria-label="`返回${activeRoute.parentLabel}`"
                  @click="shell.actions.closeSubPage"
                >
                  {{ activeRoute.parentLabel }}
                </button>
                <span v-else class="settings-breadcrumb-item settings-breadcrumb-current">{{ activeRoute.label }}</span>
                <template v-if="activeRoute.depth > 0">
                  <ChevronRightIcon class="settings-breadcrumb-separator" />
                  <span class="settings-breadcrumb-item settings-breadcrumb-current">{{ activeRoute.label }}</span>
                </template>
              </nav>
            </div>
          </div>
          <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" aria-label="关闭设置" @click="shell.actions.close">
            <DismissIcon class="settings-close-icon" />
          </SettingsFluentButton>
        </div>
      </header>

      <div :class="cx('settings-shell', isNavigationCompact && 'settings-shell-compact')">
        <nav class="settings-navigation" aria-label="设置分类">
          <button
            v-for="tab in settingsTabs"
            :key="tab.id"
            type="button"
            :class="cx('settings-nav-item', activeTab === tab.id && 'settings-nav-item-active')"
            :aria-current="activeTab === tab.id ? 'page' : undefined"
            :aria-label="tab.label"
            :title="isNavigationCompact ? tab.label : undefined"
            @click="shell.actions.selectTab(tab.id)"
          >
            <component :is="tab.icon" class="settings-nav-icon" />
            <span class="settings-nav-copy"><span>{{ tab.label }}</span></span>
          </button>
        </nav>

        <div class="settings-main">
          <div ref="settingsContentRef" class="settings-content">
            <Transition :name="routeTransitionName" mode="out-in" @before-enter="resetSettingsContentScroll">
              <component :is="activePageComponent" :key="routeKey" :model="activePageModel" />
            </Transition>
          </div>

          <footer v-if="showFooter" class="settings-actions">
            <SettingsFluentButton appearance="outline" type="button" @click="shell.actions.close">取消</SettingsFluentButton>
            <SettingsFluentButton appearance="primary" type="button" :disabled="!canApply" @click="shell.actions.apply">应用</SettingsFluentButton>
          </footer>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppsIcon from "~icons/fluent/apps-24-regular";
import ArrowLeftIcon from "~icons/fluent/arrow-left-20-regular";
import ChevronRightIcon from "~icons/fluent/chevron-right-16-regular";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import InfoIcon from "~icons/fluent/info-24-regular";
import NavigationIcon from "~icons/fluent/navigation-24-regular";
import PaintBrushIcon from "~icons/fluent/paint-brush-24-regular";
import SettingsRegularIcon from "~icons/fluent/settings-24-regular";
import { useGsapDomMotion } from "../composables/useGsapDomMotion.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import { cx } from "../domain/launchpadLayout.js";
import AboutSettingsPage from "./settings/AboutSettingsPage.vue";
import AppsSettingsPage from "./settings/AppsSettingsPage.vue";
import GeneralSettingsPage from "./settings/GeneralSettingsPage.vue";
import InterfaceSettingsPage from "./settings/InterfaceSettingsPage.vue";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

const props = defineProps({ model: { type: Object, required: true } });
const shell = props.model.shell;
const {
  activePageModel,
  activeRoute,
  activeTab,
  canApply,
  isNavigationCompact,
  isOpen,
  routeKey,
  routeTransitionName,
  shouldRender,
  showFooter,
} = shell;

const SETTINGS_OVERLAY_DURATION = 0.16;
const SETTINGS_OVERLAY_EASE = "power2.out";
const SETTINGS_PANEL_OPEN_DURATION = 0.34;
const SETTINGS_PANEL_OPEN_EASE = "power3.out";
const SETTINGS_PANEL_CLOSE_DURATION = 0.22;
const SETTINGS_PANEL_CLOSE_EASE = "power2.inOut";
const settingsOverlayRef = ref(null);
const settingsPanelRef = ref(null);
const settingsContentRef = ref(null);
const settingsOverlayMotion = useGsapDomMotion(settingsOverlayRef, {
  initial: { opacity: 0 },
  motion: resolveSettingsOverlayMotion,
});
const settingsPanelMotion = useGsapDomMotion(settingsPanelRef, {
  initial: () => shell.motion.initial.value,
  motion: resolveSettingsPanelMotion,
});
const tabIcons = Object.freeze({
  general: SettingsRegularIcon,
  interface: PaintBrushIcon,
  apps: AppsIcon,
  about: InfoIcon,
});
const settingsTabs = shell.tabs.map((tab) => ({ ...tab, icon: tabIcons[tab.id] }));
const pageComponents = Object.freeze({
  general: GeneralSettingsPage,
  interface: InterfaceSettingsPage,
  apps: AppsSettingsPage,
  about: AboutSettingsPage,
});
const activePageComponent = computed(() => pageComponents[activeTab.value] || GeneralSettingsPage);

watch(isOpen, async (open) => {
  if (!open) return;
  await nextTick();
  focusModalElement(settingsPanelRef);
});
watch(shell.motion.overlay, () => settingsOverlayMotion.animate(), { flush: "post" });
watch(shell.motion.panel, () => settingsPanelMotion.animate(), { flush: "post" });

onMounted(() => {
  if (typeof window !== "undefined") window.addEventListener("keydown", handleSettingsPanelWindowKeydown, true);
});
onBeforeUnmount(() => {
  if (typeof window !== "undefined") window.removeEventListener("keydown", handleSettingsPanelWindowKeydown, true);
});

function resetSettingsContentScroll() {
  if (settingsContentRef.value) settingsContentRef.value.scrollTop = 0;
}

function handleSettingsPanelKeydown(event) {
  if (event.defaultPrevented) return;
  if (event.key === "Escape" && closeOpenFluentMenu()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  handleModalKeydown(event, settingsPanelRef, shell.actions.close);
}

function handleSettingsPanelWindowKeydown(event) {
  if (!isOpen.value || event.key !== "Escape" || !closeOpenFluentMenu()) return;
  event.preventDefault();
  event.stopPropagation();
}

function closeOpenFluentMenu() {
  const menus = Array.from(settingsPanelRef.value?.querySelectorAll?.("fluent-menu") || []);
  const openMenu = menus.find((menu) => menu.querySelector("[slot='trigger']")?.getAttribute("aria-expanded") === "true");
  if (!openMenu) return false;
  openMenu.closeMenu?.();
  openMenu.querySelector("[slot='trigger']")?.focus?.({ preventScroll: true });
  return true;
}

function resolveSettingsOverlayMotion() {
  return {
    ...shell.motion.overlay.value,
    duration: SETTINGS_OVERLAY_DURATION,
    ease: SETTINGS_OVERLAY_EASE,
  };
}

function resolveSettingsPanelMotion() {
  const target = shell.motion.panel.value;
  const isClosing = Number(target.opacity) === 0;
  const closeDuration = Number(shell.motion.closeDurationSeconds?.value);
  return {
    ...target,
    duration: isClosing && Number.isFinite(closeDuration)
      ? closeDuration
      : isClosing ? SETTINGS_PANEL_CLOSE_DURATION : SETTINGS_PANEL_OPEN_DURATION,
    ease: isClosing ? SETTINGS_PANEL_CLOSE_EASE : SETTINGS_PANEL_OPEN_EASE,
  };
}
</script>
