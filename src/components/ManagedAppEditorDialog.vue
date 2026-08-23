<template>
  <div
    v-if="model.isOpen.value"
    class="app-edit-overlay"
    @contextmenu.self.stop.prevent
    @wheel.stop
    @pointerdown.self.stop.left="model.actions.cancel"
  >
    <section
      ref="dialogRef"
      class="app-edit-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="isEditing ? t('dialogs.appEditor.editTitle') : t('dialogs.appEditor.addTitle')"
      tabindex="-1"
      @keydown="handleModalKeydown($event, dialogRef, model.actions.cancel)"
    >
      <header class="app-edit-header">
        <div>
          <h2>{{ isEditing ? t("dialogs.appEditor.editTitle") : t("dialogs.appEditor.addTitle") }}</h2>
          <p v-if="!isEditing">{{ t("dialogs.appEditor.addDescription") }}</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" :aria-label="isEditing ? t('dialogs.appEditor.closeEdit') : t('dialogs.appEditor.closeAdd')" @click="model.actions.cancel">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="app-edit-body">
        <div class="app-edit-icon-row">
          <span class="app-edit-icon">
            <img v-if="iconSource" :src="iconSource" alt="" draggable="false" />
            <span v-else>{{ model.glyph.value }}</span>
          </span>
          <div class="app-edit-icon-actions">
            <SettingsFluentButton appearance="outline" type="button" @click="model.actions.openIconChooser">{{ t("dialogs.appEditor.changeIcon") }}</SettingsFluentButton>
            <SettingsFluentButton appearance="outline" type="button" @click="model.actions.resetIcon">{{ t("common.actions.restoreDefault") }}</SettingsFluentButton>
          </div>
        </div>

        <label class="app-edit-field">
          <span>{{ t("dialogs.appEditor.name") }}</span>
          <fluent-text-input
            class="settings-text-input app-edit-input"
            name="managedAppName"
            maxlength="64"
            :aria-label="t('dialogs.appEditor.name')"
            autocomplete="off"
            :value.prop="model.name.value"
            @input="model.name.value = readControlValue($event)"
          />
        </label>
        <label class="app-edit-field">
          <span>{{ model.targetReadOnly.value ? t("dialogs.appEditor.windowsIdManaged") : t("dialogs.appEditor.target") }}</span>
          <span class="app-edit-target-row">
            <fluent-text-input
              class="settings-text-input app-edit-input"
              name="managedAppTarget"
              :aria-label="model.targetReadOnly.value ? t('dialogs.appEditor.windowsId') : t('dialogs.appEditor.target')"
              autocomplete="off"
              :value.prop="model.target.value"
              :disabled="model.targetReadOnly.value"
              @input="model.target.value = readControlValue($event)"
            />
            <SettingsFluentButton appearance="outline" type="button" :disabled="!model.canBrowseTarget.value" @click="model.actions.browseTarget">
              {{ model.isBrowsingTarget.value ? t("dialogs.appEditor.choosing") : t("common.actions.browse") }}
            </SettingsFluentButton>
          </span>
        </label>
        <label v-if="model.canEditArgs.value" class="app-edit-field">
          <span>{{ t("dialogs.appEditor.args") }}</span>
          <fluent-text-input
            class="settings-text-input app-edit-input"
            name="managedAppArgs"
            :aria-label="t('dialogs.appEditor.args')"
            autocomplete="off"
            :value.prop="model.args.value"
            @input="model.args.value = readControlValue($event)"
          />
        </label>
      </div>

      <footer class="app-edit-actions">
        <SettingsFluentButton appearance="outline" type="button" @click="model.actions.cancel">{{ t("common.actions.cancel") }}</SettingsFluentButton>
        <SettingsFluentButton appearance="primary" type="button" :disabled="!model.canSave.value" @click="model.actions.save">{{ t("common.actions.save") }}</SettingsFluentButton>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import { getDefaultIconSource, getIconSource } from "../domain/iconSource.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import type { LaunchpadController } from "../composables/useLaunchpadController.js";
import { useLocalization } from "../i18n/localization.js";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

type ManagedAppEditorModel = LaunchpadController["dialogs"]["editorModel"];

const props = defineProps<{ model: ManagedAppEditorModel }>();
const { t } = useLocalization();
const dialogRef = ref<HTMLElement | null>(null);
const isEditing = computed(() => props.model.mode.value === "edit");
const iconSource = computed(() => {
  if (props.model.iconDataUrl.value) return props.model.iconDataUrl.value;
  if (!isEditing.value) return null;
  if (props.model.isIconReset.value) return getDefaultIconSource(props.model.app.value);
  return getIconSource(props.model.app.value);
});

function readControlValue(event: Event): string {
  const target = event.currentTarget;
  if (!target || !("value" in target) || typeof target.value !== "string") {
    throw new TypeError("Managed app editor control currentTarget must expose a string value");
  }
  return target.value;
}

function focus(): void {
  focusModalElement(dialogRef);
}

defineExpose({ focus });
</script>
