<template>
  <div v-if="model.chooser.value" class="icon-chooser-overlay" @wheel.stop @pointerdown.self="model.actions.close">
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
          <div v-if="model.isLoading.value" class="icon-chooser-empty">{{ t("dialogs.iconChooser.loading") }}</div>
          <div v-else-if="model.error.value" class="icon-chooser-empty">{{ model.error.value }}</div>
          <div v-else-if="model.choices.value.length" class="icon-chooser-grid">
            <button v-for="choice in model.choices.value" :key="choice.id" class="icon-chooser-option" type="button" :aria-label="t('dialogs.iconChooser.chooseEmbedded')" @click="model.actions.choose(choice)">
              <img :src="choice.iconDataUrl" alt="" draggable="false" />
            </button>
          </div>
          <div v-else class="icon-chooser-empty">{{ t("dialogs.iconChooser.empty") }}</div>
        </section>

        <section class="icon-chooser-section" :aria-label="t('dialogs.iconChooser.local')">
          <div class="icon-chooser-section-header"><h3>{{ t("dialogs.iconChooser.local") }}</h3></div>
          <label class="settings-secondary-button icon-chooser-upload-button">
            {{ t("common.actions.selectImage") }}
            <input name="customIconFile" type="file" accept="image/*" :aria-label="t('dialogs.iconChooser.chooseFromDisk')" autocomplete="off" @change="model.actions.upload" />
          </label>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import { useLocalization } from "../i18n/localization.js";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

const props = defineProps({ model: { type: Object, required: true } });
const { t } = useLocalization();
const dialogRef = ref(null);

function focus() {
  focusModalElement(dialogRef);
}

defineExpose({ focus });
</script>
