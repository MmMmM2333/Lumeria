<template>
  <section
    ref="rootRef"
    :class="[
      'launchpad-selection-toolbar',
      'settings-theme-scope',
      cancelActive && 'launchpad-selection-toolbar-cancel-active',
      cancelArmed && 'launchpad-selection-toolbar-cancel-armed',
    ]"
    role="toolbar"
    :aria-label="cancelActive ? t('launchpad.batch.cancelDrag') : t('launchpad.batch.toolbarLabel')"
    :aria-busy="disabled && !cancelActive"
    :data-settings-theme="resolvedSettingsTheme"
    @contextmenu.stop.prevent
    @pointerdown.stop
  >
    <div
      v-if="cancelActive"
      class="launchpad-selection-toolbar-cancel"
      aria-live="polite"
    >
      <span class="launchpad-selection-toolbar-cancel-icon" aria-hidden="true">
        <DismissIcon />
      </span>
      <span class="launchpad-selection-toolbar-cancel-copy">
        <strong>
          {{ cancelArmed ? t("launchpad.batch.releaseToCancel") : t("launchpad.batch.cancelDrag") }}
        </strong>
        <span>{{ t("launchpad.batch.cancelDragHint") }}</span>
      </span>
      <kbd>Esc</kbd>
    </div>

    <template v-else>
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
        </button>
        <button
          type="button"
          class="launchpad-selection-toolbar-button launchpad-selection-toolbar-action"
          :aria-label="t('common.actions.clearSelection')"
          :title="t('common.actions.clearSelection')"
          :disabled="disabled || selectedCount === 0"
          @click="$emit('clear-selection')"
        >
          <SubtractSquareIcon aria-hidden="true" />
          <span>{{ t("common.actions.clearSelection") }}</span>
        </button>
        <span
          class="launchpad-selection-toolbar-divider"
          role="separator"
          aria-orientation="vertical"
        />
        <button
          type="button"
          class="launchpad-selection-toolbar-button launchpad-selection-toolbar-action"
          :title="t('launchpad.batch.createFolder')"
          :disabled="disabled || !canCreateFolder"
          @click="$emit('create-folder')"
        >
          <FolderAddIcon aria-hidden="true" />
          <span>{{ t("launchpad.batch.createFolder") }}</span>
        </button>
        <fluent-menu class="launchpad-selection-toolbar-remove-menu">
          <button
            slot="trigger"
            type="button"
            class="launchpad-selection-toolbar-button launchpad-selection-toolbar-action launchpad-selection-toolbar-danger launchpad-selection-toolbar-remove-trigger"
            :aria-label="t('launchpad.batch.removeOptions')"
            :title="t('launchpad.batch.removeOptions')"
            :disabled="disabled || selectedCount === 0"
          >
            <DeleteIcon aria-hidden="true" />
            <span>{{ t("launchpad.batch.remove") }}</span>
            <ChevronDownIcon class="launchpad-selection-toolbar-remove-chevron" aria-hidden="true" />
          </button>
          <fluent-menu-list
            class="launchpad-selection-toolbar-remove-menu-list"
            :aria-label="t('launchpad.batch.removeOptions')"
          >
            <fluent-menu-item
              :disabled="disabled"
              @click="$emit('remove')"
            >
              <DeleteIcon slot="start" class="launchpad-selection-toolbar-menu-icon" />
              {{ t("settings.apps.manager.remove") }}
            </fluent-menu-item>
            <fluent-menu-item
              class="launchpad-selection-toolbar-menu-danger"
              :disabled="disabled || !canExcludeFromScan"
              :aria-disabled="disabled || !canExcludeFromScan ? 'true' : 'false'"
              :title="canExcludeFromScan ? '' : t('settings.apps.manager.excludeUnavailable')"
              @click="$emit('exclude')"
            >
              <DeleteDismissIcon slot="start" class="launchpad-selection-toolbar-menu-icon" />
              {{ t("settings.apps.manager.exclude") }}
            </fluent-menu-item>
          </fluent-menu-list>
        </fluent-menu>
      </div>

      <button
        type="button"
        class="launchpad-selection-toolbar-button launchpad-selection-toolbar-done"
        :disabled="disabled"
        @click="$emit('close')"
      >
        {{ t("launchpad.batch.done") }}
      </button>
    </template>
  </section>
</template>

<script setup>
import { setTheme } from "@fluentui/web-components";
import { webDarkTheme, webLightTheme } from "@fluentui/tokens";
import { onBeforeUnmount, ref, watch } from "vue";
import ChevronDownIcon from "~icons/fluent/chevron-down-16-regular";
import DeleteIcon from "~icons/fluent/delete-20-regular";
import DeleteDismissIcon from "~icons/fluent/delete-dismiss-20-regular";
import DismissIcon from "~icons/fluent/dismiss-20-regular";
import FolderAddIcon from "~icons/fluent/folder-add-20-regular";
import SelectAllOnIcon from "~icons/fluent/select-all-on-20-regular";
import SubtractSquareIcon from "~icons/fluent/subtract-square-20-regular";
import { useLocalization } from "../i18n/localization.js";

const props = defineProps({
  canCreateFolder: { type: Boolean, default: false },
  canExcludeFromScan: { type: Boolean, default: false },
  cancelActive: { type: Boolean, default: false },
  cancelArmed: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  hiddenCount: { type: Number, default: 0 },
  resolvedSettingsTheme: { type: String, default: "dark" },
  selectedCount: { type: Number, default: 0 },
});

defineEmits(["clear-selection", "close", "create-folder", "exclude", "remove", "select-scope"]);

const { t } = useLocalization();
const rootRef = ref(null);
let themedRoot = null;

watch([rootRef, () => props.resolvedSettingsTheme], ([root, theme]) => {
  if (themedRoot && themedRoot !== root) setTheme(null, themedRoot);
  themedRoot = root;
  if (root) setTheme(theme === "light" ? webLightTheme : webDarkTheme, root);
}, { flush: "post" });

onBeforeUnmount(() => {
  if (themedRoot) setTheme(null, themedRoot);
  themedRoot = null;
});

defineExpose({
  getBoundingClientRect: () => rootRef.value?.getBoundingClientRect?.() || null,
});
</script>
