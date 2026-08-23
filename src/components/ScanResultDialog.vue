<template>
  <div
    v-if="model.isOpen.value"
    class="scan-result-overlay"
    @contextmenu.self.stop.prevent
    @wheel.stop
    @pointerdown.self.stop.left="model.actions.close"
  >
    <section ref="dialogRef" class="scan-result-dialog" role="dialog" aria-modal="true" :aria-label="t('dialogs.scanResults.title')" tabindex="-1" @keydown="handleModalKeydown($event, dialogRef, model.actions.close)">
      <header class="scan-result-header">
        <div>
          <h2>{{ t("dialogs.scanResults.title") }}</h2>
          <p>{{ t("dialogs.scanResults.summary", { selected: model.selectedCount.value }) }}</p>
          <p v-if="model.warnings.value.length" class="settings-field-hint">{{ t("dialogs.scanResults.partial") }}</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" :aria-label="t('dialogs.scanResults.close')" @click="model.actions.close">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="scan-result-tabs" role="tablist" :aria-label="t('dialogs.scanResults.tabs.label')">
        <button
          id="scan-result-available-tab"
          type="button"
          role="tab"
          :class="['scan-result-tab', model.activeTab.value === 'available' && 'scan-result-tab-active']"
          :aria-selected="model.activeTab.value === 'available'"
          aria-controls="scan-result-available-panel"
          @click="model.actions.selectTab('available')"
        >
          {{ t("dialogs.scanResults.tabs.available", { count: model.apps.value.length }) }}
        </button>
        <button
          id="scan-result-ignored-tab"
          type="button"
          role="tab"
          :class="['scan-result-tab', model.activeTab.value === 'ignored' && 'scan-result-tab-active']"
          :aria-selected="model.activeTab.value === 'ignored'"
          aria-controls="scan-result-ignored-panel"
          @click="model.actions.selectTab('ignored')"
        >
          {{ t("dialogs.scanResults.tabs.ignored", { count: keywordExcludedTotal }) }}
        </button>
      </div>

      <div class="scan-result-body">
        <div
          v-show="model.activeTab.value === 'available'"
          id="scan-result-available-panel"
          role="tabpanel"
          aria-labelledby="scan-result-available-tab"
        >
          <div v-if="model.apps.value.length" class="settings-list-actions">
            <button class="settings-link-button" type="button" @click="model.actions.selectAll">{{ t("common.actions.selectAll") }}</button>
            <button class="settings-link-button" type="button" @click="model.actions.clearSelection">{{ t("common.actions.clearSelection") }}</button>
          </div>
          <div v-if="model.apps.value.length" class="app-manager-list scan-result-list" role="list" :aria-label="t('dialogs.scanResults.available')">
            <ScanResultAppRow
              v-for="app in model.apps.value"
              :key="app.id"
              :app="app"
              :selected="isSelected(app.id)"
              :target-path="model.getLaunchTargetPath(app)"
              @toggle="model.actions.toggleSelection(app.id, $event)"
            />
          </div>
          <div v-else class="scan-result-empty">{{ t("dialogs.scanResults.empty") }}</div>
        </div>

        <div
          v-show="model.activeTab.value === 'ignored'"
          id="scan-result-ignored-panel"
          role="tabpanel"
          aria-labelledby="scan-result-ignored-tab"
        >
          <div class="scan-result-ignored-intro">
            <span>{{ t("dialogs.scanResults.ignoredIntro") }}</span>
            <SettingsFluentButton appearance="subtle" size="small" type="button" @click="model.actions.manageKeywords">
              {{ t("dialogs.scanResults.manageKeywords") }}
            </SettingsFluentButton>
          </div>
          <div v-if="model.keywordExcludedApps.value.length" class="settings-list-actions">
            <button class="settings-link-button" type="button" @click="model.actions.selectAll">{{ t("common.actions.selectAll") }}</button>
            <button class="settings-link-button" type="button" @click="model.actions.clearSelection">{{ t("common.actions.clearSelection") }}</button>
          </div>
          <div v-if="model.keywordExcludedApps.value.length" class="app-manager-list scan-result-list" role="list" :aria-label="t('dialogs.scanResults.ignoredList')">
            <ScanResultAppRow
              v-for="entry in model.keywordExcludedApps.value"
              :key="entry.app.id"
              :app="entry.app"
              :matched-keyword="entry.matchedKeyword"
              :selected="isSelected(entry.app.id)"
              :target-path="model.getLaunchTargetPath(entry.app)"
              @toggle="model.actions.toggleSelection(entry.app.id, $event)"
            />
          </div>
          <div v-else class="scan-result-empty">{{ t("dialogs.scanResults.ignoredEmpty") }}</div>
          <p v-if="hiddenKeywordExclusionCount" class="scan-result-truncated-hint">
            {{ t("dialogs.scanResults.ignoredTruncated", { shown: model.keywordExcludedApps.value.length, total: keywordExcludedTotal }) }}
          </p>
        </div>
      </div>

      <footer class="scan-result-actions">
        <SettingsFluentButton appearance="outline" type="button" @click="model.actions.close">
          {{ t("common.actions.cancel") }}
        </SettingsFluentButton>
        <SettingsFluentButton appearance="primary" type="button" :disabled="!model.canAdd.value" @click="model.actions.addSelected">{{ t("dialogs.scanResults.addSelected") }}</SettingsFluentButton>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import type { LaunchpadController } from "../composables/useLaunchpadController.js";
import { useLocalization } from "../i18n/localization.js";
import ScanResultAppRow from "./ScanResultAppRow.vue";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

type ScanResultModel = LaunchpadController["dialogs"]["scanResultModel"];

const props = defineProps<{ model: ScanResultModel }>();
const { t } = useLocalization();
const dialogRef = ref<HTMLElement | null>(null);
const isSelected = (appId: string): boolean => props.model.selectedIds.value.includes(appId);
const keywordExcludedTotal = computed(() => Number(props.model.stats.value?.keywordExcludedApps) || 0);
const hiddenKeywordExclusionCount = computed(() => Math.max(
  0,
  keywordExcludedTotal.value - props.model.keywordExcludedApps.value.length,
));

function focus(): void {
  focusModalElement(dialogRef);
}

defineExpose({ focus });
</script>
