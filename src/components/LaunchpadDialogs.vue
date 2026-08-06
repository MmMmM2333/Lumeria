<template>
  <div ref="dialogThemeHostRef" class="launchpad-dialog-host settings-theme-scope" :data-settings-theme="state.resolvedSettingsTheme.value">
    <ScanResultDialog ref="scanResultDialogRef" :model="state.scanResultModel" />
    <ManagedAppEditorDialog ref="managedAppEditorDialogRef" :model="state.editorModel" />
    <AppIconChooserDialog ref="appIconChooserDialogRef" :model="state.iconChooserModel" />

    <div
      v-if="state.warningDialog.value"
      key="warning-dialog-overlay"
      ref="warningDialogOverlayRef"
      :class="['warning-dialog-overlay', !state.isWarningDialogOpen.value && 'warning-dialog-overlay-closing']"
      @contextmenu.self.stop.prevent
      @wheel.stop
      @pointerdown.self.stop.left="state.closeWarningDialog"
    >
    <section
      ref="warningDialogRef"
      :class="['warning-dialog', `warning-dialog-${warningDialogIntent}`]"
      role="alertdialog"
      aria-modal="true"
      :aria-label="state.warningDialog.value.title"
      tabindex="-1"
      @keydown="handleModalKeydown($event, warningDialogRef, state.closeWarningDialog)"
    >
      <div class="warning-dialog-icon">
        <component :is="warningDialogIcon" class="warning-dialog-svg" />
      </div>
      <div class="warning-dialog-content">
        <h2>{{ state.warningDialog.value.title }}</h2>
        <p>{{ state.warningDialog.value.message }}</p>
        <p v-if="state.warningDialog.value.suggestion" class="warning-dialog-suggestion">{{ t("dialogs.warning.suggestion", { suggestion: state.warningDialog.value.suggestion }) }}</p>
      </div>
      <footer class="warning-dialog-actions">
        <SettingsFluentButton v-if="state.warningDialog.value.cancelText" appearance="outline" type="button" @click="state.closeWarningDialog">{{ state.warningDialog.value.cancelText }}</SettingsFluentButton>
        <SettingsFluentButton
          v-if="state.warningDialog.value.confirmText"
          :appearance="warningConfirmAppearance"
          :tone="warningConfirmTone"
          type="button"
          @click="state.confirmWarningDialog"
        >
          {{ state.warningDialog.value.confirmText }}
        </SettingsFluentButton>
      </footer>
    </section>
    </div>
  </div>

  <div
    v-if="state.layoutRecoveryNotice.value || state.transientNotice.value"
    class="launchpad-notice-stack"
    @click.stop
    @contextmenu.stop
    @pointerdown.stop
    @wheel.stop
  >
    <section
      v-if="state.layoutRecoveryNotice.value"
      :class="['launchpad-notice-card', `launchpad-notice-card-${normalizeDialogIntent(state.layoutRecoveryNotice.value.intent || 'warning')}`]"
      role="status"
      aria-live="polite"
    >
      <component :is="getNoticeIcon(state.layoutRecoveryNotice.value.intent || 'warning')" class="launchpad-notice-icon" aria-hidden="true" />
      <span class="launchpad-notice-copy">
        <strong>{{ state.layoutRecoveryNotice.value.title }}</strong>
        <span>{{ state.layoutRecoveryNotice.value.message }}</span>
        <small v-if="state.layoutRecoveryNotice.value.backupPath">{{ state.layoutRecoveryNotice.value.backupPath }}</small>
      </span>
      <SettingsFluentButton appearance="subtle" icon-only class="launchpad-notice-dismiss-button" type="button" :aria-label="t('dialogs.notices.dismissRecovery')" @click="state.closeLayoutRecoveryNotice">
        <DismissIcon class="launchpad-notice-dismiss-icon" />
      </SettingsFluentButton>
    </section>

    <section
      v-if="state.transientNotice.value"
      :class="['launchpad-notice-card', `launchpad-notice-card-${normalizeDialogIntent(state.transientNotice.value.intent || 'info')}`]"
      role="status"
      aria-live="polite"
    >
      <component :is="getNoticeIcon(state.transientNotice.value.intent || 'info')" class="launchpad-notice-icon" aria-hidden="true" />
      <span class="launchpad-notice-copy">
        <strong>{{ state.transientNotice.value.title }}</strong>
        <span>{{ state.transientNotice.value.message }}</span>
        <small v-if="state.transientNotice.value.detail">{{ state.transientNotice.value.detail }}</small>
      </span>
      <SettingsFluentButton appearance="subtle" icon-only class="launchpad-notice-dismiss-button" type="button" :aria-label="t('dialogs.notices.dismiss')" @click="state.closeTransientNotice">
        <DismissIcon class="launchpad-notice-dismiss-icon" />
      </SettingsFluentButton>
      <div v-if="state.transientNotice.value.actionText" class="launchpad-notice-actions">
        <SettingsFluentButton
          class="launchpad-notice-action-button"
          appearance="outline"
          size="small"
          type="button"
          @click="state.transientNotice.value.onAction?.()"
        >
          {{ state.transientNotice.value.actionText }}
        </SettingsFluentButton>
      </div>
    </section>
  </div>
</template>

<script setup>
import { setTheme } from "@fluentui/web-components";
import { webDarkTheme, webLightTheme } from "@fluentui/tokens";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import CheckmarkCircleIcon from "~icons/fluent/checkmark-circle-20-regular";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import ErrorCircleIcon from "~icons/fluent/error-circle-20-regular";
import InfoIcon from "~icons/fluent/info-20-regular";
import WarningIcon from "~icons/fluent/warning-20-regular";
import { useGsapDomMotion } from "../composables/useGsapDomMotion.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import { useLocalization } from "../i18n/localization.js";
import AppIconChooserDialog from "./AppIconChooserDialog.vue";
import ManagedAppEditorDialog from "./ManagedAppEditorDialog.vue";
import ScanResultDialog from "./ScanResultDialog.vue";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

const props = defineProps({
  state: { type: Object, required: true },
});
const { t } = useLocalization();

const dialogThemeHostRef = ref(null);
const scanResultDialogRef = ref(null);
const managedAppEditorDialogRef = ref(null);
const appIconChooserDialogRef = ref(null);
const warningDialogOverlayRef = ref(null);
const warningDialogRef = ref(null);
const warningDialogOverlayMotion = useGsapDomMotion(warningDialogOverlayRef, {
  initial: { opacity: 0 },
  motion: resolveWarningDialogOverlayMotion,
});
const warningDialogMotion = useGsapDomMotion(warningDialogRef, {
  initial: { opacity: 0, scale: 0.96 },
  motion: resolveWarningDialogPanelMotion,
});
let themedDialogHost = null;

const warningDialogIntent = computed(() => normalizeDialogIntent(props.state.warningDialog.value?.intent));
const warningDialogIcon = computed(() => getNoticeIcon(warningDialogIntent.value));
const warningConfirmAppearance = computed(() => (
  props.state.warningDialog.value?.confirmAppearance || (warningDialogIntent.value === "error" ? "outline" : "primary")
));
const warningConfirmTone = computed(() => (
  props.state.warningDialog.value?.confirmTone || (warningDialogIntent.value === "error" ? "danger" : null)
));
const activeDialog = computed(() => {
  if (props.state.warningDialog.value) {
    return { id: "warning", focus: () => focusModalElement(warningDialogRef) };
  }
  if (props.state.iconChooserModel.chooser.value) {
    return { id: "iconChooser", focus: () => appIconChooserDialogRef.value?.focus() };
  }
  if (props.state.editorModel.isOpen.value) {
    return { id: "editor", focus: () => managedAppEditorDialogRef.value?.focus() };
  }
  if (props.state.scanResultModel.isOpen.value) {
    return { id: "scanResult", focus: () => scanResultDialogRef.value?.focus() };
  }
  return null;
});

watch(
  () => activeDialog.value?.id,
  async () => {
    await nextTick();
    activeDialog.value?.focus();
  }
);

watch([dialogThemeHostRef, props.state.resolvedSettingsTheme], ([host, theme]) => {
  if (themedDialogHost && themedDialogHost !== host) setTheme(null, themedDialogHost);
  themedDialogHost = host;
  if (host) setTheme(theme === "light" ? webLightTheme : webDarkTheme, host);
}, { flush: "post" });

onBeforeUnmount(() => {
  if (themedDialogHost) setTheme(null, themedDialogHost);
  themedDialogHost = null;
});

watch(
  () => props.state.isWarningDialogOpen.value,
  () => {
    warningDialogOverlayMotion.animate();
    warningDialogMotion.animate();
  },
  { flush: "post" }
);

function normalizeDialogIntent(intent) {
  return ["success", "warning", "error", "info"].includes(intent) ? intent : "warning";
}

function getNoticeIcon(intent) {
  switch (normalizeDialogIntent(intent)) {
    case "success":
      return CheckmarkCircleIcon;
    case "error":
      return ErrorCircleIcon;
    case "info":
      return InfoIcon;
    default:
      return WarningIcon;
  }
}

function resolveWarningDialogOverlayMotion() {
  return {
    opacity: props.state.isWarningDialogOpen.value ? 1 : 0,
    duration: 0.14,
  };
}

function resolveWarningDialogPanelMotion() {
  return props.state.isWarningDialogOpen.value
    ? { opacity: 1, scale: 1, duration: 0.16 }
    : { opacity: 0, scale: 0.96, duration: 0.16 };
}
</script>
