<template>
  <div
    :class="[
      'app-manager-item',
      'scan-result-item',
      matchedKeyword && 'scan-result-ignored-item',
      selected && 'app-manager-item-selected',
    ]"
    role="listitem"
    :aria-selected="selected"
    @click="emit('toggle', !selected)"
  >
    <fluent-checkbox
      :name="`scanResultSelection-${app.id}`"
      :aria-label="t('dialogs.scanResults.selectApp', { name: app.name })"
      :checked.prop="selected"
      @click.stop
      @change.stop="emit('toggle', readControlChecked($event))"
    />
    <span class="app-manager-icon" aria-hidden="true">
      <img v-if="iconSource" :src="iconSource" alt="" draggable="false" />
      <span v-else>{{ app.emoji }}</span>
    </span>
    <span class="app-manager-details">
      <span class="app-manager-name">{{ app.name }}</span>
      <span class="app-manager-target" :title="targetPath || t('dialogs.scanResults.targetMissing')">
        {{ targetPath || t("dialogs.scanResults.targetMissing") }}
      </span>
      <span v-if="app.launchTarget?.kind === 'executable' && app.launchArgs" class="app-manager-target">
        {{ t("dialogs.scanResults.args", { args: app.launchArgs }) }}
      </span>
    </span>
    <span v-if="matchedKeyword" class="scan-result-keyword-badge" :title="t('dialogs.scanResults.matchedKeyword', { keyword: matchedKeyword })">
      {{ t("dialogs.scanResults.matchedKeyword", { keyword: matchedKeyword }) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { getIconSource } from "../domain/iconSource.js";
import type { ReadonlyLaunchpadApp } from "../domain/launchpadLayout.js";
import { useLocalization } from "../i18n/localization.js";

const props = withDefaults(defineProps<{
  app: ReadonlyLaunchpadApp;
  matchedKeyword?: string;
  selected: boolean;
  targetPath?: string;
}>(), {
  matchedKeyword: "",
  targetPath: "",
});
const emit = defineEmits<{ toggle: [selected: boolean] }>();
const { t } = useLocalization();
const iconSource = computed(() => getIconSource(props.app));

function readControlChecked(event: Event): boolean {
  const target = event.currentTarget;
  if (!target || !("checked" in target) || typeof target.checked !== "boolean") {
    throw new TypeError("Scan result checkbox currentTarget must expose a boolean checked value");
  }
  return target.checked;
}
</script>
