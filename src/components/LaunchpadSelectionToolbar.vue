<template>
  <section
    class="launchpad-selection-toolbar settings-theme-scope"
    role="toolbar"
    :aria-label="t('launchpad.batch.toolbarLabel')"
    :aria-busy="disabled"
    @contextmenu.stop.prevent
    @pointerdown.stop
  >
    <button
      type="button"
      class="launchpad-selection-toolbar-button launchpad-selection-toolbar-close"
      :aria-label="t('launchpad.batch.done')"
      :disabled="disabled"
      @click="$emit('close')"
    >
      <DismissIcon aria-hidden="true" />
    </button>

    <div class="launchpad-selection-toolbar-summary" aria-live="polite">
      <strong>{{ t("launchpad.batch.selectedCount", { count: selectedCount }) }}</strong>
      <span v-if="hiddenCount > 0">
        {{ t("launchpad.batch.hiddenCount", { count: hiddenCount }) }}
      </span>
    </div>

    <div class="launchpad-selection-toolbar-actions">
      <button
        type="button"
        class="launchpad-selection-toolbar-button launchpad-selection-toolbar-action"
        :disabled="disabled"
        @click="$emit('select-scope')"
      >
        <SelectAllOnIcon aria-hidden="true" />
        <span>{{ t("launchpad.batch.selectScope") }}</span>
        <span v-if="scopeSelectedCount > 0" class="launchpad-selection-toolbar-action-count">
          {{ scopeSelectedCount }}
        </span>
      </button>
      <button
        type="button"
        class="launchpad-selection-toolbar-button launchpad-selection-toolbar-action"
        :disabled="disabled || !canCreateFolder"
        @click="$emit('create-folder')"
      >
        <FolderAddIcon aria-hidden="true" />
        <span>{{ t("launchpad.batch.createFolder") }}</span>
      </button>
      <button
        type="button"
        class="launchpad-selection-toolbar-button launchpad-selection-toolbar-action launchpad-selection-toolbar-danger"
        :disabled="disabled || selectedCount === 0"
        @click="$emit('delete')"
      >
        <DeleteIcon aria-hidden="true" />
        <span>{{ t("launchpad.batch.delete") }}</span>
      </button>
    </div>

    <button
      type="button"
      class="launchpad-selection-toolbar-button launchpad-selection-toolbar-done"
      :disabled="disabled"
      @click="$emit('close')"
    >
      {{ t("launchpad.batch.done") }}
    </button>
  </section>
</template>

<script setup>
import DeleteIcon from "~icons/fluent/delete-20-regular";
import DismissIcon from "~icons/fluent/dismiss-20-regular";
import FolderAddIcon from "~icons/fluent/folder-add-20-regular";
import SelectAllOnIcon from "~icons/fluent/select-all-on-20-regular";
import { useLocalization } from "../i18n/localization.js";

defineProps({
  canCreateFolder: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  hiddenCount: { type: Number, default: 0 },
  scopeSelectedCount: { type: Number, default: 0 },
  selectedCount: { type: Number, default: 0 },
});

defineEmits(["close", "create-folder", "delete", "select-scope"]);

const { t } = useLocalization();
</script>
