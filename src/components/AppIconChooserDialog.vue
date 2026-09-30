<template>
  <div
    v-if="model.chooser.value"
    class="icon-chooser-overlay"
    @contextmenu.self.stop.prevent
    @wheel.stop
    @pointerdown.self.stop.left="model.actions.close"
  >
    <section ref="dialogRef" class="icon-chooser-dialog" role="dialog" aria-modal="true" :aria-label="model.chooser.value.title" tabindex="-1" @keydown="handleModalKeydown($event, dialogRef, model.actions.close)">
      <header class="icon-chooser-header">
        <div>
          <h2>{{ model.chooser.value.title }}</h2>
          <p>{{ model.chooser.value.subtitle }}</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" :aria-label="t('dialogs.iconChooser.close')" @click="model.actions.close">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="icon-chooser-body">
        <section class="icon-chooser-section" :aria-label="t('dialogs.iconChooser.embedded')">
          <div class="icon-chooser-section-header">
            <h3>{{ t("dialogs.iconChooser.embedded") }}</h3>
            <span v-if="model.choices.value.length">{{ t("dialogs.iconChooser.count", { count: model.choices.value.length }) }}</span>
          </div>
          <div v-if="model.choices.value.length" class="icon-chooser-grid">
            <button v-for="choice in model.choices.value" :key="choice.id" class="icon-chooser-option" type="button" :aria-label="t('dialogs.iconChooser.chooseEmbedded')" @click="model.actions.choose(choice)">
              <img :src="choice.iconUrl || choice.iconDataUrl || undefined" alt="" draggable="false" loading="lazy" />
            </button>
          </div>
          <div v-else-if="model.isLoading.value" style="min-height: 76px; display: flex; align-items: center" role="status">{{ t("dialogs.iconChooser.loading") }}</div>
          <div v-else-if="model.error.value" class="icon-chooser-empty">{{ model.error.value }}</div>
          <div v-else class="icon-chooser-empty">{{ t("dialogs.iconChooser.empty") }}</div>
        </section>

        <section class="icon-chooser-section" :aria-label="t('dialogs.iconChooser.local')">
          <div class="icon-chooser-section-header"><h3>{{ t("dialogs.iconChooser.local") }}</h3></div>
          <label class="settings-secondary-button icon-chooser-upload-button">
            {{ t("common.actions.selectImage") }}
            <input name="customIconFile" type="file" accept="image/*" :aria-label="t('dialogs.iconChooser.chooseFromDisk')" autocomplete="off" @change="handleUpload" />
          </label>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import type { LaunchpadController } from "../composables/useLaunchpadController.js";
import { useLocalization } from "../i18n/localization.js";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

type IconChooserModel = LaunchpadController["dialogs"]["iconChooserModel"];

const props = defineProps<{ model: IconChooserModel }>();
const { t } = useLocalization();
const dialogRef = ref<HTMLElement | null>(null);

function focus(): void {
  focusModalElement(dialogRef);
}

function handleUpload(event: Event): void {
  if (!(event.currentTarget instanceof HTMLInputElement)) {
    throw new TypeError("App icon upload event currentTarget must be an input element");
  }
  props.model.actions.upload({
    target: event.currentTarget,
  });
}

defineExpose({ focus });
</script>
