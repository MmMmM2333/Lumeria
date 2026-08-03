<template>
  <div v-if="model.isOpen.value" class="scan-result-overlay" @wheel.stop @pointerdown.self="model.actions.close">
    <section ref="dialogRef" class="scan-result-dialog" role="dialog" aria-modal="true" :aria-label="t('dialogs.scanResults.title')" tabindex="-1" @keydown="handleModalKeydown($event, dialogRef, model.actions.close)">
      <header class="scan-result-header">
        <div>
          <h2>{{ t("dialogs.scanResults.title") }}</h2>
          <p>{{ t("dialogs.scanResults.summary", { found: model.apps.value.length, selected: model.selectedCount.value }) }}</p>
          <p v-if="model.warnings.value.length" class="settings-field-hint">{{ t("dialogs.scanResults.partial") }}</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" :aria-label="t('dialogs.scanResults.close')" @click="model.actions.close">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="scan-result-body">
        <div v-if="model.apps.value.length" class="settings-list-actions">
          <button class="settings-link-button" type="button" @click="model.actions.selectAll">{{ t("common.actions.selectAll") }}</button>
          <button class="settings-link-button" type="button" @click="model.actions.clearSelection">{{ t("common.actions.clearSelection") }}</button>
        </div>
        <div v-if="model.apps.value.length" class="app-manager-list scan-result-list" role="list" :aria-label="t('dialogs.scanResults.available')">
          <div v-for="app in model.apps.value" :key="app.id" :class="['app-manager-item', 'scan-result-item', isSelected(app.id) && 'app-manager-item-selected']" role="listitem" :aria-selected="isSelected(app.id)" @click="model.actions.toggleSelection(app.id, !isSelected(app.id))">
            <fluent-checkbox :name="`scanResultSelection-${app.id}`" :aria-label="t('dialogs.scanResults.selectApp', { name: app.name })" :checked.prop="isSelected(app.id)" @click.stop @change.stop="model.actions.toggleSelection(app.id, $event.target.checked)" />
            <span class="app-manager-icon">
              <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
              <span v-else>{{ app.emoji }}</span>
            </span>
            <span class="app-manager-details">
              <span class="app-manager-name">{{ app.name }}</span>
              <span class="app-manager-target">{{ model.getLaunchTargetPath(app) || t("dialogs.scanResults.targetMissing") }}</span>
              <span v-if="app.launchTarget?.kind === 'executable' && app.launchArgs" class="app-manager-target">{{ t("dialogs.scanResults.args", { args: app.launchArgs }) }}</span>
            </span>
          </div>
        </div>
        <div v-else class="scan-result-empty">{{ t("dialogs.scanResults.empty") }}</div>
      </div>

      <footer class="scan-result-actions">
        <SettingsFluentButton appearance="outline" type="button" @click="model.actions.close">{{ t("common.actions.cancel") }}</SettingsFluentButton>
        <SettingsFluentButton appearance="primary" type="button" :disabled="!model.canAdd.value" @click="model.actions.addSelected">{{ t("dialogs.scanResults.addSelected") }}</SettingsFluentButton>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { ref } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import { getIconSource } from "../domain/iconSource.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import { useLocalization } from "../i18n/localization.js";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

const props = defineProps({ model: { type: Object, required: true } });
const { t } = useLocalization();
const dialogRef = ref(null);
const isSelected = (appId) => props.model.selectedIds.value.includes(appId);

function focus() {
  focusModalElement(dialogRef);
}

defineExpose({ focus });
</script>
