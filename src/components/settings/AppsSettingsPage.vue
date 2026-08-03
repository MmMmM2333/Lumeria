<template>
  <div :class="['settings-tab-panel', isAppsDetailPage && 'settings-tab-panel-fill']" role="tabpanel" :aria-label="t('settings.apps.title')">
    <template v-if="isExcludedAppsPage">
      <section class="settings-section settings-section-plain settings-section-fill" :aria-label="t('settings.apps.excluded.title')">
        <div class="app-settings-detail-toolbar">
          <fluent-text-input
            class="settings-text-input excluded-app-search"
            name="excludedAppSearch"
            :placeholder="t('settings.apps.excluded.search')"
            :aria-label="t('settings.apps.excluded.search')"
            autocomplete="off"
            :value.prop="excludedAppsSearchQuery"
            @input="setExcludedAppsSearchQuery($event.target.value)"
          >
            <SearchIcon slot="start" class="app-manager-search-icon" />
          </fluent-text-input>
        </div>
        <p class="settings-field-hint excluded-app-description">
          {{ t("settings.apps.excluded.description") }}
        </p>

        <Transition name="settings-selection-bar">
          <div v-if="selectedExcludedAppCount > 0" class="app-manager-selection-bar">
            <span>{{ t("settings.apps.excluded.selected", { count: selectedExcludedAppCount }) }}</span>
            <span class="app-manager-selection-actions">
              <SettingsFluentButton appearance="subtle" size="small" type="button" @click="cancelSelectedScanExclusions">
                {{ t("settings.apps.excluded.removeSelected") }}
              </SettingsFluentButton>
            </span>
          </div>
        </Transition>

        <div v-if="filteredExcludedApps.length" class="settings-list-actions app-manager-list-actions excluded-app-list-actions">
          <span>{{ t("settings.apps.excluded.results", { count: filteredExcludedApps.length }) }}</span>
          <button class="settings-link-button" type="button" @click="selectAllFilteredExcludedApps">{{ t("common.actions.selectAll") }}</button>
          <button class="settings-link-button" type="button" @click="clearExcludedAppSelection">{{ t("common.actions.clearSelection") }}</button>
        </div>

        <div v-if="filteredExcludedApps.length" class="app-manager-list excluded-app-list" role="list" :aria-label="t('settings.apps.excluded.title')">
          <div
            v-for="{ app, index, key } in filteredExcludedApps"
            :key="key"
            :class="['app-manager-item', 'excluded-app-item', isExcludedAppSelected(key) && 'app-manager-item-selected']"
            role="listitem"
            :aria-selected="isExcludedAppSelected(key)"
            @click="toggleExcludedAppSelection(key)"
          >
            <fluent-checkbox
              :name="`excludedAppSelection-${key}`"
              :aria-label="t('settings.apps.excluded.select', { name: getExcludedAppName(app) })"
              :checked.prop="isExcludedAppSelected(key)"
              @click.stop
              @change.stop="toggleExcludedAppSelection(key, $event.target.checked)"
            />
            <span class="app-manager-icon">
              <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
              <span v-else>{{ getExcludedAppGlyph(app) }}</span>
            </span>
            <span class="app-manager-details">
              <span class="app-manager-name">{{ getExcludedAppName(app) }}</span>
              <span class="app-manager-target" :title="getExcludedAppSubtitle(app)">{{ getExcludedAppSubtitle(app) }}</span>
            </span>
            <span class="app-manager-actions">
              <SettingsFluentButton
                class="excluded-app-restore-button"
                appearance="subtle"
                icon-only
                type="button"
                :aria-label="t('settings.apps.excluded.restore', { name: getExcludedAppName(app) })"
                :title="t('settings.apps.excluded.restoreTitle')"
                @click.stop="cancelScanExclusion(index, key)"
              >
                <ArrowCounterclockwiseIcon class="excluded-app-restore-icon" />
              </SettingsFluentButton>
            </span>
          </div>
        </div>
        <div v-else class="settings-empty-state app-settings-detail-empty">
          {{ state.scanAppBlacklist.value.length ? t("settings.apps.excluded.noMatch") : t("settings.apps.excluded.empty") }}
        </div>
      </section>
    </template>

    <template v-else-if="isAppManagerPage">
      <section class="settings-section settings-section-plain settings-section-fill app-manager-detail-section" :aria-label="t('settings.apps.manager.title')">
        <div class="app-manager-toolbar">
          <fluent-text-input
            class="settings-text-input app-manager-search"
            name="appManagerSearch"
            :placeholder="t('settings.apps.manager.search')"
            :aria-label="t('settings.apps.manager.search')"
            autocomplete="off"
            :value.prop="state.appManagerSearchQuery.value"
            @input="state.appManagerSearchQuery.value = $event.target.value"
          >
            <SearchIcon slot="start" class="app-manager-search-icon" />
          </fluent-text-input>
          <div class="app-manager-toolbar-actions">
            <SettingsFluentButton
              appearance="outline"
              type="button"
              :disabled="!state.canScanManagedApps.value || state.isScanningApps.value"
              @click="state.rescanManagedApps"
            >
              <ArrowSyncIcon slot="start" class="settings-command-icon" />
              {{ state.isScanningApps.value ? t("settings.apps.manager.scanning") : t("settings.apps.manager.scanApps") }}
            </SettingsFluentButton>
            <SettingsFluentButton appearance="primary" type="button" @click="state.editorModel.actions.openCreate">
              <AddIcon slot="start" class="settings-command-icon" />
              {{ t("settings.apps.manager.addApp") }}
            </SettingsFluentButton>
          </div>
        </div>

        <Transition name="settings-selection-bar">
          <div v-if="state.selectedManagedAppCount.value > 0" class="app-manager-selection-bar">
            <span>{{ t("settings.apps.manager.selected", { count: state.selectedManagedAppCount.value }) }}</span>
            <span class="app-manager-selection-actions">
              <SettingsFluentButton appearance="subtle" size="small" type="button" @click="state.removeSelectedManagedAppsFromLaunchpad">
                <DeleteIcon slot="start" class="settings-command-icon" />
                {{ t("settings.apps.manager.remove") }}
              </SettingsFluentButton>
              <SettingsFluentButton
                appearance="subtle"
                tone="danger"
                size="small"
                type="button"
                :disabled="!state.canExcludeSelectedManagedAppsFromScan.value"
                :title="state.canExcludeSelectedManagedAppsFromScan.value ? '' : t('settings.apps.manager.excludeUnavailable')"
                @click="state.excludeSelectedManagedAppsFromScan"
              >
                <DeleteDismissIcon slot="start" class="settings-command-icon" />
                {{ t("settings.apps.manager.exclude") }}
              </SettingsFluentButton>
            </span>
          </div>
        </Transition>

        <div class="settings-list-actions app-manager-list-actions">
          <span>{{ t("settings.apps.manager.count", { filtered: state.filteredManagedApps.value.length, total: state.managedApps.value.length }) }}</span>
          <button class="settings-link-button" type="button" @click="state.selectAllManagedApps">{{ t("common.actions.selectAll") }}</button>
          <button class="settings-link-button" type="button" @click="state.clearManagedAppSelection">{{ t("common.actions.clearSelection") }}</button>
        </div>

        <div ref="appManagerListRef" class="app-manager-list app-manager-virtual-list app-manager-detail-list" role="list" :aria-label="t('settings.apps.manager.all')">
          <div v-if="!state.filteredManagedApps.value.length" class="settings-empty-state app-manager-empty-state">{{ t("settings.apps.manager.noMatch") }}</div>
          <div v-else class="app-manager-virtual-inner" :style="{ height: `${appManagerVirtualTotalSize}px` }">
            <div
              v-for="{ app, virtualRow } in appManagerVirtualRows"
              :key="virtualRow.key"
              :class="['app-manager-item', state.appManagerSelectedIds.value.includes(app.id) && 'app-manager-item-selected']"
              role="listitem"
              :aria-posinset="virtualRow.index + 1"
              :aria-setsize="state.filteredManagedApps.value.length"
              :style="getAppManagerVirtualRowStyle(virtualRow)"
            >
              <fluent-checkbox
                :name="`managedAppSelection-${app.id}`"
                :aria-label="t('settings.apps.manager.select', { name: app.name })"
                :checked.prop="state.appManagerSelectedIds.value.includes(app.id)"
                @change="state.toggleManagedAppSelection(app.id, $event.target.checked)"
              />
              <span class="app-manager-icon">
                <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
                <span v-else>{{ app.emoji }}</span>
              </span>
              <span class="app-manager-details">
                <span class="app-manager-name">{{ app.name }}</span>
                <span class="app-manager-target">{{ state.getLaunchTargetPath(app) || t("settings.apps.manager.targetMissing") }}</span>
              </span>
              <span class="app-manager-actions">
                <fluent-menu>
                  <SettingsFluentButton
                    fluent-slot="trigger"
                    class="app-manager-more-button"
                    appearance="subtle"
                    icon-only
                    type="button"
                    :aria-label="t('settings.apps.manager.more', { name: app.name })"
                  >
                    <MoreHorizontalIcon class="app-manager-more-icon" />
                  </SettingsFluentButton>
                  <fluent-menu-list>
                    <fluent-menu-item @click="state.editorModel.actions.openEdit(app)">{{ t("common.actions.edit") }}</fluent-menu-item>
                    <fluent-divider role="separator" />
                    <fluent-menu-item @click="state.removeManagedAppFromLaunchpad(app.id)">{{ t("settings.apps.manager.remove") }}</fluent-menu-item>
                    <fluent-menu-item
                      v-if="state.canExcludeManagedAppFromScan(app)"
                      class="settings-menu-item-danger"
                      @click="state.excludeManagedAppFromScan(app)"
                    >
                      {{ t("settings.apps.manager.exclude") }}
                    </fluent-menu-item>
                  </fluent-menu-list>
                </fluent-menu>
              </span>
            </div>
          </div>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="settings-section settings-section-plain" :aria-label="t('settings.apps.sources.title')">
      <div class="settings-section-header">
        <div class="settings-section-heading">
          <h3>{{ t("settings.apps.sources.title") }}</h3>
          <span class="settings-section-meta">{{ t("settings.apps.sources.summary", { total: state.scanRoots.value.length, enabled: enabledScanRootCount }) }}</span>
        </div>
        <div class="settings-inline-actions">
          <SettingsFluentButton appearance="outline" type="button" @click="state.confirmResetScanRoots">{{ t("settings.apps.sources.reset") }}</SettingsFluentButton>
          <SettingsFluentButton appearance="primary" type="button" @click="state.addScanRoot">
            <AddIcon slot="start" class="settings-command-icon" />
            {{ t("settings.apps.sources.add") }}
          </SettingsFluentButton>
        </div>
      </div>

      <div class="settings-list">
        <div class="scan-root-list">
          <div v-for="root in state.scanRoots.value" :key="root.id" class="scan-root-item">
            <fluent-switch
              :checked.prop="root.enabled"
              :aria-label="t('settings.apps.sources.enable', { name: root.label })"
              @change="state.toggleScanRootEnabled(root.id, $event.target.checked)"
            />
            <span class="scan-root-details">
              <fluent-text-input
                class="settings-text-input scan-root-label"
                control-size="small"
                :name="`scanRootLabel-${root.id}`"
                :value.prop="root.label"
                :aria-label="t('settings.apps.sources.label', { name: root.label })"
                autocomplete="off"
                @change="state.changeScanRootLabel(root.id, $event.target.value)"
              />
              <span class="scan-root-path-row">
                <fluent-text-input
                  class="settings-text-input scan-root-path"
                  control-size="small"
                  :name="`scanRootPath-${root.id}`"
                  :value.prop="root.path"
                  :aria-label="t('settings.apps.sources.path', { name: root.label })"
                  autocomplete="off"
                  :disabled="root.type === 'windowsAppCatalog'"
                  @change="state.changeScanRootPath(root.id, $event.target.value)"
                />
              </span>
              <span v-if="root.type === 'windowsAppCatalog'" class="settings-field-hint">
                {{ t("settings.apps.sources.windowsManaged") }}
              </span>
              <span v-if="root.lastScannedAt" class="settings-field-hint scan-root-status">{{ t("settings.apps.sources.lastScan", { time: formatScanTime(root.lastScannedAt) }) }}</span>
            </span>
            <span class="scan-root-actions">
              <SettingsFluentButton
                class="scan-root-browse-button"
                appearance="outline"
                size="small"
                type="button"
                :disabled="root.type === 'windowsAppCatalog' || !state.canBrowseScanRoots.value || state.isBrowsingScanRoot(root.id)"
                @click="state.browseScanRootDirectory(root.id)"
              >
                {{ state.isBrowsingScanRoot(root.id) ? t("settings.apps.sources.choosing") : t("common.actions.browse") }}
              </SettingsFluentButton>
              <SettingsFluentButton
                class="scan-root-delete-button"
                appearance="outline"
                tone="danger"
                size="small"
                type="button"
                :disabled="!root.removable"
                @click="state.removeScanRoot(root.id)"
              >
                {{ t("common.actions.delete") }}
              </SettingsFluentButton>
            </span>
          </div>
          <div v-if="!state.scanRoots.value.length" class="settings-empty-state">{{ t("settings.apps.sources.empty") }}</div>
        </div>
      </div>
    </section>

      <section class="settings-section settings-section-plain" :aria-label="t('settings.apps.filters.title')">
        <div class="settings-section-header">
          <div>
            <h3>{{ t("settings.apps.filters.title") }}</h3>
          </div>
        </div>

        <div class="settings-list">
          <div class="settings-list-expandable">
            <button
              type="button"
              class="settings-list-row settings-list-row-button settings-list-row-button-simple"
              :aria-expanded="isKeywordBlacklistExpanded"
              @click="isKeywordBlacklistExpanded = !isKeywordBlacklistExpanded"
            >
              <span class="settings-list-icon" aria-hidden="true">
                <FilterIcon />
              </span>
              <span class="settings-list-copy">
                <span class="settings-list-title">{{ t("settings.apps.filters.keywords") }}</span>
                <span class="settings-list-description">{{ t("settings.apps.filters.keywordCount", { count: state.scanKeywordBlacklist.value.length }) }}</span>
              </span>
              <ChevronDownIcon :class="['settings-list-chevron', isKeywordBlacklistExpanded && 'settings-list-chevron-open']" />
            </button>

            <Transition name="settings-expand">
              <div v-if="isKeywordBlacklistExpanded" class="settings-list-expand-shell">
                <div class="settings-list-expand">
                  <div class="scan-keyword-editor">
                    <fluent-text-input
                      class="settings-text-input scan-keyword-input"
                      name="newScanKeyword"
                      :placeholder="t('settings.apps.filters.keywordInput')"
                      :aria-label="t('settings.apps.filters.keywordAdd')"
                      autocomplete="off"
                      :value.prop="state.newScanKeyword.value"
                      @input="state.newScanKeyword.value = $event.target.value"
                      @keydown.enter.prevent="state.addScanKeywordBlacklistItem"
                    />
                    <SettingsFluentButton appearance="outline" type="button" @click="state.addScanKeywordBlacklistItem">{{ t("common.actions.add") }}</SettingsFluentButton>
                  </div>
                  <div v-if="state.scanKeywordBlacklist.value.length" class="scan-keyword-list">
                    <span v-for="(keyword, index) in state.scanKeywordBlacklist.value" :key="`${keyword}-${index}`" class="scan-keyword-chip">
                      <span>{{ keyword }}</span>
                      <button type="button" :aria-label="t('settings.apps.filters.keywordRemove', { keyword })" @click="state.removeScanKeywordBlacklistItem(index)">
                        <DismissIcon class="scan-keyword-chip-icon" />
                      </button>
                    </span>
                  </div>
                  <div v-else class="settings-empty-state">{{ t("settings.apps.filters.keywordEmpty") }}</div>
                </div>
              </div>
            </Transition>
          </div>

          <button
            type="button"
            class="settings-list-row settings-list-row-button settings-list-row-button-simple"
            @click="openExcludedAppsPage"
          >
            <span class="settings-list-icon" aria-hidden="true">
              <AppsListDetailIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">{{ t("settings.apps.excluded.title") }}</span>
              <span class="settings-list-description">{{ t("settings.apps.filters.appCount", { count: state.scanAppBlacklist.value.length }) }}</span>
            </span>
            <ChevronRightIcon class="settings-list-chevron" />
          </button>
        </div>
      </section>

      <section class="settings-section settings-section-plain" :aria-label="t('settings.apps.manager.title')">
        <div class="settings-section-header">
          <div>
            <h3>{{ t("settings.apps.manager.title") }}</h3>
          </div>
        </div>

        <div class="settings-list">
          <button
            type="button"
            class="settings-list-row settings-list-row-button settings-list-row-button-simple"
            @click="openAppManagerPage"
          >
            <span class="settings-list-icon" aria-hidden="true">
              <AppsListIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">{{ t("settings.apps.manager.title") }}</span>
              <span class="settings-list-description">{{ t("settings.apps.overview.appCount", { count: state.managedApps.value.length }) }}</span>
            </span>
            <ChevronRightIcon class="settings-list-chevron" />
          </button>

          <div class="settings-list-row">
            <span class="settings-list-icon" aria-hidden="true">
              <ArrowSyncIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">{{ state.isScanningApps.value ? t("settings.apps.manager.scanning") : t("settings.apps.manager.scanApps") }}</span>
              <span class="settings-list-description">{{ state.canScanManagedApps.value ? t("settings.apps.overview.scanReady") : t("settings.apps.overview.scanDisabled") }}</span>
            </span>
            <span class="settings-list-control">
              <SettingsFluentButton
                appearance="outline"
                type="button"
                :disabled="!state.canScanManagedApps.value || state.isScanningApps.value"
                @click="state.rescanManagedApps"
              >
                {{ state.isScanningApps.value ? t("settings.apps.manager.scanning") : t("settings.apps.overview.scan") }}
              </SettingsFluentButton>
            </span>
          </div>

          <div class="settings-list-row">
            <span class="settings-list-icon" aria-hidden="true">
              <AddIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">{{ t("settings.apps.manager.addApp") }}</span>
              <span class="settings-list-description">{{ t("settings.apps.overview.addDescription") }}</span>
            </span>
            <span class="settings-list-control">
              <SettingsFluentButton appearance="outline" type="button" @click="state.editorModel.actions.openCreate">
                {{ t("settings.apps.overview.add") }}
              </SettingsFluentButton>
            </span>
          </div>

          <div class="settings-list-row">
            <span class="settings-list-icon" aria-hidden="true">
              <FolderProhibitedIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">{{ t("settings.apps.overview.missingTarget") }}</span>
              <span class="settings-list-description">{{ t("settings.apps.overview.missingTargetDescription") }}</span>
            </span>
            <span class="settings-list-control">
              <fluent-switch
                :checked.prop="state.showMissingLaunchTargetBadge.value"
                :aria-label="t('settings.apps.overview.showMissingTarget')"
                @change="state.toggleMissingLaunchTargetBadge($event.target.checked)"
              />
            </span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import AddIcon from "~icons/fluent/add-20-regular";
import ArrowCounterclockwiseIcon from "~icons/fluent/arrow-counterclockwise-20-regular";
import AppsListDetailIcon from "~icons/fluent/apps-list-detail-24-regular";
import AppsListIcon from "~icons/fluent/apps-list-24-regular";
import ArrowSyncIcon from "~icons/fluent/arrow-sync-20-regular";
import ChevronDownIcon from "~icons/fluent/chevron-down-20-regular";
import ChevronRightIcon from "~icons/fluent/chevron-right-20-regular";
import DeleteIcon from "~icons/fluent/delete-20-regular";
import DeleteDismissIcon from "~icons/fluent/delete-dismiss-20-regular";
import DismissIcon from "~icons/fluent/dismiss-12-regular";
import FilterIcon from "~icons/fluent/filter-24-regular";
import FolderProhibitedIcon from "~icons/fluent/folder-prohibited-24-regular";
import MoreHorizontalIcon from "~icons/fluent/more-horizontal-20-regular";
import SearchIcon from "~icons/fluent/search-20-regular";

import { getIconSource } from "../../domain/iconSource.js";
import { useLocalization } from "../../i18n/localization.js";
import SettingsFluentButton from "./SettingsFluentButton.vue";

const props = defineProps({
  model: { type: Object, required: true },
});

const state = props.model;
const { t } = useLocalization();
const {
  enabledScanRootCount,
  excludedAppsSearchQuery,
  filteredExcludedApps,
  formatScanTime,
  getExcludedAppGlyph,
  getExcludedAppName,
  getExcludedAppSubtitle,
  isAppManagerPage,
  isAppsDetailPage,
  isExcludedAppSelected,
  isExcludedAppsPage,
  selectedExcludedAppCount,
} = props.model;
const {
  cancelScanExclusion,
  cancelSelectedScanExclusions,
  clearExcludedAppSelection,
  openAppManager: openAppManagerPage,
  openExcludedApps: openExcludedAppsPage,
  selectAllFilteredExcludedApps,
  setExcludedAppsSearchQuery,
  toggleExcludedAppSelection,
} = props.model.actions;

const isKeywordBlacklistExpanded = ref(false);

const APP_MANAGER_ROW_HEIGHT = 64;
const APP_MANAGER_ROW_GAP = 6;
const APP_MANAGER_OVERSCAN = 6;

const appManagerListRef = ref(null);

const appManagerVirtualizer = useVirtualizer({
  get count() {
    return state.filteredManagedApps.value.length;
  },
  getScrollElement: () => appManagerListRef.value,
  estimateSize: () => APP_MANAGER_ROW_HEIGHT,
  gap: APP_MANAGER_ROW_GAP,
  overscan: APP_MANAGER_OVERSCAN,
  getItemKey: (index) => state.filteredManagedApps.value[index]?.id ?? index,
});

const appManagerVirtualRows = computed(() =>
  appManagerVirtualizer.value
    .getVirtualItems()
    .map((virtualRow) => ({ app: state.filteredManagedApps.value[virtualRow.index], virtualRow }))
    .filter(({ app }) => Boolean(app)),
);

const appManagerVirtualTotalSize = computed(() => appManagerVirtualizer.value.getTotalSize());

function getAppManagerVirtualRowStyle(virtualRow) {
  return {
    transform: `translateY(${virtualRow.start}px)`,
  };
}

watch(
  () => state.appManagerSearchQuery.value,
  () => {
    if (!isAppManagerPage.value) return;
    appManagerVirtualizer.value.scrollToOffset(0);
  },
);

watch(isAppManagerPage, async (active) => {
  if (!active) return;
  await nextTick();
  appManagerVirtualizer.value.scrollToOffset(0);
  appManagerVirtualizer.value.measure();
});

</script>
