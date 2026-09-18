<template>
  <div
    v-if="shouldRender"
    key="settings-overlay"
    ref="settingsOverlayRef"
    :class="cx('settings-overlay', !isOpen && 'settings-overlay-closing')"
    @contextmenu.self.stop.prevent
    @wheel.stop
    @pointerdown.self.stop.left="closeSettingsPanel"
  >
    <section
      ref="settingsPanelRef"
      :class="cx('settings-panel settings-theme-scope select-none', isNavigationCompact && 'settings-panel-navigation-compact')"
      :data-settings-theme="resolvedSettingsTheme"
      role="dialog"
      aria-modal="true"
      :aria-label="t('settings.shell.title')"
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
            :aria-label="isNavigationCompact ? t('settings.shell.expandNavigation') : t('settings.shell.collapseNavigation')"
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
                :aria-label="t('settings.shell.backTo', { label: activeRoute.parentLabel })"
                @click="shell.actions.closeSubPage"
              >
                <ArrowLeftIcon class="settings-back-icon" />
              </SettingsFluentButton>
              <nav class="settings-breadcrumb" :aria-label="t('settings.shell.path')">
                <button
                  v-if="activeRoute.depth > 0"
                  type="button"
                  class="settings-breadcrumb-item settings-breadcrumb-parent"
                  :aria-label="t('settings.shell.backTo', { label: activeRoute.parentLabel })"
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
          <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" :aria-label="t('settings.shell.close')" @click="shell.actions.close">
            <DismissIcon class="settings-close-icon" />
          </SettingsFluentButton>
        </div>
      </header>

      <div :class="cx('settings-shell', isNavigationCompact && 'settings-shell-compact')">
        <nav class="settings-navigation" :aria-label="t('settings.shell.categories')">
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
              <GeneralSettingsPage v-if="activeTab === 'general'" :key="routeKey" :model="model.pages.general" />
              <InterfaceSettingsPage v-else-if="activeTab === 'interface'" :key="routeKey" :model="model.pages.interface" />
              <AppsSettingsPage v-else-if="activeTab === 'apps'" :key="routeKey" :model="model.pages.apps" />
              <AboutSettingsPage v-else :key="routeKey" :model="model.pages.about" />
            </Transition>
          </div>

          <footer v-if="showFooter" class="settings-actions">
            <span v-if="applyError" class="settings-field-error settings-apply-error" role="alert">{{ applyError }}</span>
            <SettingsFluentButton appearance="outline" type="button" @click="shell.actions.close">{{ t("common.actions.cancel") }}</SettingsFluentButton>
            <SettingsFluentButton appearance="primary" type="button" :disabled="!canApply" @click="applySettings">{{ t("common.actions.apply") }}</SettingsFluentButton>
          </footer>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { setTheme } from "@fluentui/web-components";
import { webDarkTheme, webLightTheme } from "@fluentui/tokens";
import AppsIcon from "~icons/fluent/apps-24-regular";
import ArrowLeftIcon from "~icons/fluent/arrow-left-20-regular";
import ChevronRightIcon from "~icons/fluent/chevron-right-16-regular";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import InfoIcon from "~icons/fluent/info-24-regular";
import NavigationIcon from "~icons/fluent/navigation-24-regular";
import PaintBrushIcon from "~icons/fluent/paint-brush-24-regular";
import SettingsRegularIcon from "~icons/fluent/settings-24-regular";
import { useDomMotion, type DomMotion } from "../composables/useDomMotion.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import type { useSettingsPanelModel } from "../composables/useSettingsPanelModel.js";
import { cx } from "../domain/launchpadLayout.js";
import { readErrorMessage } from "../application/errorMessage.js";
import { useLocalization } from "../i18n/localization.js";
import AboutSettingsPage from "./settings/AboutSettingsPage.vue";
import AppsSettingsPage from "./settings/AppsSettingsPage.vue";
import GeneralSettingsPage from "./settings/GeneralSettingsPage.vue";
import InterfaceSettingsPage from "./settings/InterfaceSettingsPage.vue";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

type SettingsPanelModel = ReturnType<typeof useSettingsPanelModel>;
type FluentMenuElement = HTMLElement & Readonly<{ closeMenu?: () => void }>;

const props = defineProps<{ model: SettingsPanelModel }>();
const { t } = useLocalization();
const shell = props.model.shell;
const {
  activeRoute,
  activeTab,
  canApply,
  isNavigationCompact,
  isOpen,
  routeKey,
  routeTransitionName,
  resolvedSettingsTheme,
  shouldRender,
  showFooter,
} = shell;

const applyError = ref("");
watch(isOpen, () => { applyError.value = ""; });
async function applySettings() {
  applyError.value = "";
  try {
    const outcome = await shell.actions.apply();
    if (outcome && typeof outcome === "object" && "ok" in outcome && outcome.ok === false) {
      const errors: unknown[] = ["error" in outcome ? outcome.error : outcome];
      if ("rollbackErrors" in outcome && Array.isArray(outcome.rollbackErrors)) errors.push(...outcome.rollbackErrors);
      applyError.value = errors.map(readErrorMessage).filter(Boolean).join("\n");
    }
  } catch (error) { applyError.value = readErrorMessage(error); }
}

const SETTINGS_OVERLAY_DURATION = 0.16;
const SETTINGS_OVERLAY_EASE = "cubic-out";
const SETTINGS_PANEL_OPEN_DURATION = 0.34;
const SETTINGS_PANEL_OPEN_EASE = "quart-out";
const SETTINGS_PANEL_CLOSE_DURATION = 0.22;
const SETTINGS_PANEL_CLOSE_EASE = "cubic-in-out";
const settingsOverlayRef = ref<HTMLElement | null>(null);
const settingsPanelRef = ref<HTMLElement | null>(null);
const settingsContentRef = ref<HTMLElement | null>(null);
let themedSettingsPanel: HTMLElement | null = null;
const settingsOverlayMotion = useDomMotion(settingsOverlayRef, {
  initial: { opacity: 0 },
  motion: resolveSettingsOverlayMotion,
});
const settingsPanelMotion = useDomMotion(settingsPanelRef, {
  initial: () => shell.motion.initial.value,
  motion: resolveSettingsPanelMotion,
});
const tabIcons = Object.freeze({
  general: SettingsRegularIcon,
  interface: PaintBrushIcon,
  apps: AppsIcon,
  about: InfoIcon,
});
const settingsTabs = computed(() => shell.tabs.value.map((tab) => ({ ...tab, icon: tabIcons[tab.id] })));
watch(isOpen, async (open) => {
  if (!open) return;
  await nextTick();
  focusModalElement(settingsPanelRef);
});
watch(shell.motion.overlay, () => settingsOverlayMotion.animate(), { flush: "post" });
watch(shell.motion.panel, () => settingsPanelMotion.animate(), { flush: "post" });
watch([settingsPanelRef, resolvedSettingsTheme], ([panel, theme]) => {
  if (themedSettingsPanel && themedSettingsPanel !== panel) setTheme(null, themedSettingsPanel);
  themedSettingsPanel = panel;
  if (panel) setTheme(theme === "light" ? webLightTheme : webDarkTheme, panel);
}, { flush: "post" });

onMounted(() => {
  if (typeof window !== "undefined") window.addEventListener("keydown", handleSettingsPanelWindowKeydown, true);
});
onBeforeUnmount(() => {
  if (typeof window !== "undefined") window.removeEventListener("keydown", handleSettingsPanelWindowKeydown, true);
  if (themedSettingsPanel) setTheme(null, themedSettingsPanel);
  themedSettingsPanel = null;
});

function resetSettingsContentScroll(): void {
  if (settingsContentRef.value) settingsContentRef.value.scrollTop = 0;
}

function handleSettingsPanelKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (event.key === "Escape" && closeOpenFluentPopup()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  handleModalKeydown(event, settingsPanelRef, shell.actions.close);
}

function closeSettingsPanel(): void {
  shell.actions.close();
}

function handleSettingsPanelWindowKeydown(event: KeyboardEvent): void {
  if (!isOpen.value || event.key !== "Escape" || !closeOpenFluentPopup()) return;
  event.preventDefault();
  event.stopPropagation();
}

function closeOpenFluentPopup(): boolean {
  const listboxes = Array.from(settingsPanelRef.value?.querySelectorAll<HTMLElement>("fluent-listbox") || []);
  const openListbox = listboxes.find((listbox) => listbox.matches(":popover-open"));
  if (openListbox) {
    openListbox.hidePopover?.();
    openListbox.closest<HTMLElement>("fluent-dropdown")?.focus({ preventScroll: true });
    return true;
  }

  const menus = Array.from(settingsPanelRef.value?.querySelectorAll<FluentMenuElement>("fluent-menu") || []);
  const openMenu = menus.find((menu) => menu.querySelector("[slot='trigger']")?.getAttribute("aria-expanded") === "true");
  if (!openMenu) return false;
  openMenu.closeMenu?.();
  openMenu.querySelector<HTMLElement>("[slot='trigger']")?.focus({ preventScroll: true });
  return true;
}

function resolveSettingsOverlayMotion(): DomMotion {
  return {
    ...shell.motion.overlay.value,
    duration: SETTINGS_OVERLAY_DURATION,
    ease: SETTINGS_OVERLAY_EASE,
  };
}

function resolveSettingsPanelMotion(): DomMotion {
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
