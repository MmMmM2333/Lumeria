<template>
  <div :class="['settings-tab-panel', isAppsDetailPage && 'settings-tab-panel-fill']" role="tabpanel" aria-label="应用">
    <template v-if="isIgnoredAppsPage">
      <section class="settings-section settings-section-plain settings-section-fill" aria-label="忽略的应用">
        <div class="app-settings-detail-toolbar">
          <fluent-text-input
            class="settings-text-input ignored-app-search"
            name="ignoredAppSearch"
            placeholder="搜索忽略的应用"
            aria-label="搜索忽略的应用"
            autocomplete="off"
            :value.prop="ignoredAppsSearchQuery"
            @input="setIgnoredAppsSearchQuery($event.target.value)"
          >
            <SearchIcon slot="start" class="app-manager-search-icon" />
          </fluent-text-input>
        </div>

        <Transition name="settings-selection-bar">
          <div v-if="selectedIgnoredAppCount > 0" class="app-manager-selection-bar">
            <span>已选择 {{ selectedIgnoredAppCount }} 个应用</span>
            <span class="app-manager-selection-actions">
              <SettingsFluentButton appearance="outline" size="small" type="button" @click="restoreSelectedIgnoredApps">
                恢复所选
              </SettingsFluentButton>
              <SettingsFluentButton appearance="subtle" size="small" type="button" @click="clearIgnoredAppSelection">
                清空选择
              </SettingsFluentButton>
            </span>
          </div>
        </Transition>

        <div v-if="filteredIgnoredApps.length" class="settings-list-actions app-manager-list-actions ignored-app-list-actions">
          <span>{{ filteredIgnoredApps.length }} 个结果</span>
          <button class="settings-link-button" type="button" @click="selectAllFilteredIgnoredApps">全选</button>
        </div>

        <div v-if="filteredIgnoredApps.length" class="app-manager-list ignored-app-list" role="list" aria-label="忽略的应用">
          <div
            v-for="{ app, index, key } in filteredIgnoredApps"
            :key="key"
            :class="['app-manager-item', 'ignored-app-item', isIgnoredAppSelected(key) && 'app-manager-item-selected']"
            role="listitem"
            :aria-selected="isIgnoredAppSelected(key)"
            @click="toggleIgnoredAppSelection(key)"
          >
            <fluent-checkbox
              :name="`ignoredAppSelection-${key}`"
              :aria-label="`选择 ${getIgnoredAppName(app)}`"
              :checked.prop="isIgnoredAppSelected(key)"
              @click.stop
              @change.stop="toggleIgnoredAppSelection(key, $event.target.checked)"
            />
            <span class="app-manager-icon">
              <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
              <span v-else>{{ getIgnoredAppGlyph(app) }}</span>
            </span>
            <span class="app-manager-details">
              <span class="app-manager-name">{{ getIgnoredAppName(app) }}</span>
              <span class="app-manager-target" :title="getIgnoredAppSubtitle(app)">{{ getIgnoredAppSubtitle(app) }}</span>
            </span>
            <span class="app-manager-actions">
              <SettingsFluentButton
                class="ignored-app-restore-button"
                appearance="subtle"
                icon-only
                type="button"
                aria-label="恢复扫描"
                title="恢复扫描"
                @click.stop="restoreIgnoredApp(index, key)"
              >
                <ArrowCounterclockwiseIcon class="ignored-app-restore-icon" />
              </SettingsFluentButton>
            </span>
          </div>
        </div>
        <div v-else class="settings-empty-state app-settings-detail-empty">
          {{ state.scanAppBlacklist.value.length ? "没有匹配的应用" : "没有忽略的应用" }}
        </div>
      </section>
    </template>

    <template v-else-if="isAppManagerPage">
      <section class="settings-section settings-section-plain settings-section-fill app-manager-detail-section" aria-label="应用管理">
        <div class="app-manager-toolbar">
          <fluent-text-input
            class="settings-text-input app-manager-search"
            name="appManagerSearch"
            placeholder="搜索应用"
            aria-label="搜索应用"
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
              {{ state.isScanningApps.value ? "扫描中" : "扫描应用" }}
            </SettingsFluentButton>
            <SettingsFluentButton appearance="primary" type="button" @click="state.openAddManagedAppPage">
              <AddIcon slot="start" class="settings-command-icon" />
              新增应用
            </SettingsFluentButton>
          </div>
        </div>

        <Transition name="settings-selection-bar">
          <div v-if="state.selectedManagedAppCount.value > 0" class="app-manager-selection-bar">
            <span>已选择 {{ state.selectedManagedAppCount.value }} 个应用</span>
            <span class="app-manager-selection-actions">
              <SettingsFluentButton appearance="outline" size="small" type="button" @click="state.ignoreSelectedManagedApps">
                批量忽略
              </SettingsFluentButton>
              <SettingsFluentButton appearance="subtle" size="small" type="button" @click="state.deleteSelectedManagedApps">
                <DeleteIcon slot="start" class="settings-command-icon" />
                批量删除
              </SettingsFluentButton>
            </span>
          </div>
        </Transition>

        <div class="settings-list-actions app-manager-list-actions">
          <span>{{ state.filteredManagedApps.value.length }} / {{ state.managedApps.value.length }} 个应用</span>
          <button class="settings-link-button" type="button" @click="state.selectAllManagedApps">全选</button>
          <button class="settings-link-button" type="button" @click="state.clearManagedAppSelection">清空选择</button>
        </div>

        <div ref="appManagerListRef" class="app-manager-list app-manager-virtual-list app-manager-detail-list" role="list" aria-label="所有应用">
          <div v-if="!state.filteredManagedApps.value.length" class="settings-empty-state app-manager-empty-state">没有匹配的应用</div>
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
                :aria-label="`选择 ${app.name}`"
                :checked.prop="state.appManagerSelectedIds.value.includes(app.id)"
                @change="state.toggleManagedAppSelection(app.id, $event.target.checked)"
              />
              <span class="app-manager-icon">
                <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
                <span v-else>{{ app.emoji }}</span>
              </span>
              <span class="app-manager-details">
                <span class="app-manager-name">{{ app.name }}</span>
                <span class="app-manager-target">{{ state.getLaunchTargetPath(app) || "未设置启动路径" }}</span>
              </span>
              <span class="app-manager-actions">
                <fluent-menu>
                  <SettingsFluentButton
                    fluent-slot="trigger"
                    class="app-manager-more-button"
                    appearance="subtle"
                    icon-only
                    type="button"
                    :aria-label="`${app.name} 更多操作`"
                  >
                    <MoreHorizontalIcon class="app-manager-more-icon" />
                  </SettingsFluentButton>
                  <fluent-menu-list>
                    <fluent-menu-item @click="state.openEditManagedApp(app)">编辑</fluent-menu-item>
                    <fluent-menu-item @click="state.ignoreManagedApp(app)">忽略</fluent-menu-item>
                    <fluent-menu-item @click="state.deleteManagedApp(app.id)">删除</fluent-menu-item>
                  </fluent-menu-list>
                </fluent-menu>
              </span>
            </div>
          </div>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="settings-section settings-section-plain" aria-label="扫描来源">
      <div class="settings-section-header">
        <div>
          <h3>扫描来源</h3>
        </div>
        <div class="settings-inline-actions">
          <SettingsFluentButton appearance="outline" type="button" @click="state.confirmResetScanRoots">还原默认来源</SettingsFluentButton>
          <SettingsFluentButton appearance="primary" type="button" @click="state.addScanRoot">
            <AddIcon slot="start" class="settings-command-icon" />
            新增来源
          </SettingsFluentButton>
        </div>
      </div>

      <div class="settings-list">
        <div class="settings-list-row settings-app-row-compact">
          <span class="settings-list-icon" aria-hidden="true">
            <FolderProhibitedIcon />
          </span>
          <span class="settings-list-copy">
            <span class="settings-list-title">显示失效路径标记</span>
            <span class="settings-list-description">在启动目标丢失时提示</span>
          </span>
          <span class="settings-list-control">
            <fluent-switch
              :checked.prop="state.showMissingLaunchTargetBadge.value"
              aria-label="显示失效路径标记"
              @change="state.toggleMissingLaunchTargetBadge($event.target.checked)"
            />
          </span>
        </div>

        <div class="scan-root-list">
          <div v-for="root in state.scanRoots.value" :key="root.id" class="scan-root-item">
            <fluent-switch
              :checked.prop="root.enabled"
              :aria-label="`启用 ${root.label}`"
              @change="state.toggleScanRootEnabled(root.id, $event.target.checked)"
            />
            <span class="scan-root-details">
              <fluent-text-input
                class="settings-text-input scan-root-label"
                control-size="small"
                :name="`scanRootLabel-${root.id}`"
                :value.prop="root.label"
                :aria-label="`${root.label} 标签`"
                autocomplete="off"
                @change="state.changeScanRootLabel(root.id, $event.target.value)"
              />
              <span class="scan-root-path-row">
                <fluent-text-input
                  class="settings-text-input scan-root-path"
                  control-size="small"
                  :name="`scanRootPath-${root.id}`"
                  :value.prop="root.path"
                  :aria-label="`${root.label} 路径`"
                  autocomplete="off"
                  @change="state.changeScanRootPath(root.id, $event.target.value)"
                />
                <SettingsFluentButton
                  class="scan-root-browse-button"
                  appearance="outline"
                  size="small"
                  type="button"
                  :disabled="!state.canBrowseScanRoots.value || state.isBrowsingScanRoot(root.id)"
                  @click="state.browseScanRootDirectory(root.id)"
                >
                  {{ state.isBrowsingScanRoot(root.id) ? "选择中" : "浏览" }}
                </SettingsFluentButton>
              </span>
              <span v-if="root.lastScannedAt" class="settings-field-hint">上次扫描 {{ formatScanTime(root.lastScannedAt) }}</span>
            </span>
            <SettingsFluentButton
              appearance="subtle"
              size="small"
              type="button"
              :disabled="!root.removable"
              @click="state.removeScanRoot(root.id)"
            >
              删除
            </SettingsFluentButton>
          </div>
          <div v-if="!state.scanRoots.value.length" class="settings-empty-state">没有扫描来源</div>
          <div class="settings-list-summary-row">{{ enabledScanRootCount }} / {{ state.scanRoots.value.length }} 个来源已启用</div>
        </div>
      </div>
    </section>

      <section class="settings-section settings-section-plain" aria-label="扫描过滤">
        <div class="settings-section-header">
          <div>
            <h3>扫描过滤</h3>
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
                <span class="settings-list-title">关键字黑名单</span>
                <span class="settings-list-description">{{ state.scanKeywordBlacklist.value.length }} 个关键字</span>
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
                      placeholder="输入关键字"
                      aria-label="新增扫描过滤关键字"
                      autocomplete="off"
                      :value.prop="state.newScanKeyword.value"
                      @input="state.newScanKeyword.value = $event.target.value"
                      @keydown.enter.prevent="state.addScanKeywordBlacklistItem"
                    />
                    <SettingsFluentButton appearance="outline" type="button" @click="state.addScanKeywordBlacklistItem">添加</SettingsFluentButton>
                  </div>
                  <div v-if="state.scanKeywordBlacklist.value.length" class="scan-keyword-list">
                    <span v-for="(keyword, index) in state.scanKeywordBlacklist.value" :key="`${keyword}-${index}`" class="scan-keyword-chip">
                      <span>{{ keyword }}</span>
                      <button type="button" :aria-label="`移除关键字 ${keyword}`" @click="state.removeScanKeywordBlacklistItem(index)">
                        <DismissIcon class="scan-keyword-chip-icon" />
                      </button>
                    </span>
                  </div>
                  <div v-else class="settings-empty-state">没有关键字</div>
                </div>
              </div>
            </Transition>
          </div>

          <button
            type="button"
            class="settings-list-row settings-list-row-button settings-list-row-button-simple"
            @click="openIgnoredAppsPage"
          >
            <span class="settings-list-icon" aria-hidden="true">
              <AppsListDetailIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">忽略的应用</span>
              <span class="settings-list-description">{{ state.scanAppBlacklist.value.length }} 个应用</span>
            </span>
            <ChevronRightIcon class="settings-list-chevron" />
          </button>
        </div>
      </section>

      <section class="settings-section settings-section-plain" aria-label="应用管理">
        <div class="settings-section-header">
          <div>
            <h3>应用管理</h3>
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
              <span class="settings-list-title">应用管理</span>
              <span class="settings-list-description">{{ state.managedApps.value.length }} 个应用</span>
            </span>
            <ChevronRightIcon class="settings-list-chevron" />
          </button>

          <div class="settings-list-row">
            <span class="settings-list-icon" aria-hidden="true">
              <ArrowSyncIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">{{ state.isScanningApps.value ? "扫描中" : "扫描应用" }}</span>
              <span class="settings-list-description">{{ state.canScanManagedApps.value ? "从启用的扫描来源刷新应用" : "需要启用扫描来源" }}</span>
            </span>
            <span class="settings-list-control">
              <SettingsFluentButton
                appearance="outline"
                type="button"
                :disabled="!state.canScanManagedApps.value || state.isScanningApps.value"
                @click="state.rescanManagedApps"
              >
                {{ state.isScanningApps.value ? "扫描中" : "扫描" }}
              </SettingsFluentButton>
            </span>
          </div>

          <div class="settings-list-row">
            <span class="settings-list-icon" aria-hidden="true">
              <AddIcon />
            </span>
            <span class="settings-list-copy">
              <span class="settings-list-title">新增应用</span>
              <span class="settings-list-description">手动添加自定义应用</span>
            </span>
            <span class="settings-list-control">
              <SettingsFluentButton appearance="outline" type="button" @click="state.openAddManagedAppPage">
                新增
              </SettingsFluentButton>
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
import DismissIcon from "~icons/fluent/dismiss-12-regular";
import FilterIcon from "~icons/fluent/filter-24-regular";
import FolderProhibitedIcon from "~icons/fluent/folder-prohibited-24-regular";
import MoreHorizontalIcon from "~icons/fluent/more-horizontal-20-regular";
import SearchIcon from "~icons/fluent/search-20-regular";

import { getIconSource } from "../../domain/iconSource.js";
import SettingsFluentButton from "./SettingsFluentButton.vue";

const props = defineProps({
  backgroundLayoutContext: { type: Object, default: null },
  context: { type: Object, required: true },
  state: { type: Object, required: true },
});

const { activeSettingsSubPage, formatScanTime, openSettingsSubPage } = props.context;
const { state } = props;

const isKeywordBlacklistExpanded = ref(false);
const ignoredAppsSearchQuery = ref("");
const selectedIgnoredAppKeys = ref(new Set());

const APP_MANAGER_ROW_HEIGHT = 64;
const APP_MANAGER_ROW_GAP = 6;
const APP_MANAGER_OVERSCAN = 6;

const appManagerListRef = ref(null);

const enabledScanRootCount = computed(() => state.scanRoots.value.filter((root) => root.enabled).length);
const isIgnoredAppsPage = computed(() => activeSettingsSubPage.value?.id === "apps.ignoredApps");
const isAppManagerPage = computed(() => activeSettingsSubPage.value?.id === "apps.appManager");
const isAppsDetailPage = computed(() => isIgnoredAppsPage.value || isAppManagerPage.value);
const ignoredAppsSearchTerm = computed(() => ignoredAppsSearchQuery.value.trim().toLocaleLowerCase());
const filteredIgnoredApps = computed(() => {
  const term = ignoredAppsSearchTerm.value;
  return state.scanAppBlacklist.value
    .map((app, index) => ({ app, index, key: getIgnoredAppKey(app, index) }))
    .filter(({ app }) => {
      if (!term) return true;
      return [
        app.name,
        app.path,
        app.sourceKey,
      ].some((value) => String(value || "").toLocaleLowerCase().includes(term));
    });
});
const selectedIgnoredAppCount = computed(() => selectedIgnoredAppKeys.value.size);

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

watch(ignoredAppsSearchQuery, () => {
  clearIgnoredAppSelection();
});

watch(
  () => state.scanAppBlacklist.value,
  () => {
    const currentKeys = new Set(state.scanAppBlacklist.value.map((app, index) => getIgnoredAppKey(app, index)));
    selectedIgnoredAppKeys.value = new Set([...selectedIgnoredAppKeys.value].filter((key) => currentKeys.has(key)));
  },
);

watch(isIgnoredAppsPage, (active) => {
  if (!active) clearIgnoredAppSelection();
});

watch(isAppManagerPage, async (active) => {
  if (!active) return;
  await nextTick();
  appManagerVirtualizer.value.scrollToOffset(0);
  appManagerVirtualizer.value.measure();
});

function openIgnoredAppsPage() {
  openSettingsSubPage({
    id: "apps.ignoredApps",
    label: "忽略的应用",
    parentTabId: "apps",
  });
}

function openAppManagerPage() {
  openSettingsSubPage({
    id: "apps.appManager",
    label: "应用管理",
    parentTabId: "apps",
  });
}

function getIgnoredAppKey(app, index) {
  if (app?.sourceKey) return `source:${String(app.sourceKey).toLocaleLowerCase()}`;
  if (app?.path) return `path:${String(app.path).replace(/\\/g, "/").toLocaleLowerCase()}`;
  if (app?.name) return `name:${String(app.name).toLocaleLowerCase()}:${index}`;
  return `ignored-app:${index}`;
}

function getIgnoredAppName(app) {
  return String(app?.name || app?.path || app?.sourceKey || "未命名应用");
}

function getIgnoredAppSubtitle(app) {
  return String(app?.path || app?.sourceKey || "未设置路径");
}

function getIgnoredAppGlyph(app) {
  const label = String(app?.emoji || app?.name || app?.path || app?.sourceKey || "A").trim();
  return label.charAt(0).toLocaleUpperCase() || "A";
}

function isIgnoredAppSelected(key) {
  return selectedIgnoredAppKeys.value.has(key);
}

function setIgnoredAppsSearchQuery(value) {
  ignoredAppsSearchQuery.value = value;
}

function toggleIgnoredAppSelection(key, checked = !isIgnoredAppSelected(key)) {
  if (!key) return;
  const next = new Set(selectedIgnoredAppKeys.value);
  if (checked) next.add(key);
  else next.delete(key);
  selectedIgnoredAppKeys.value = next;
}

function selectAllFilteredIgnoredApps() {
  selectedIgnoredAppKeys.value = new Set(filteredIgnoredApps.value.map(({ key }) => key));
}

function clearIgnoredAppSelection() {
  if (selectedIgnoredAppKeys.value.size === 0) return;
  selectedIgnoredAppKeys.value = new Set();
}

function restoreIgnoredApp(index, key) {
  state.removeScanAppBlacklistItem(index);
  if (!key || !selectedIgnoredAppKeys.value.has(key)) return;
  const next = new Set(selectedIgnoredAppKeys.value);
  next.delete(key);
  selectedIgnoredAppKeys.value = next;
}

function restoreSelectedIgnoredApps() {
  if (selectedIgnoredAppKeys.value.size === 0) return;
  const selectedKeys = selectedIgnoredAppKeys.value;
  state.scanAppBlacklist.value
    .map((app, index) => ({ index, key: getIgnoredAppKey(app, index) }))
    .filter(({ key }) => selectedKeys.has(key))
    .sort((left, right) => right.index - left.index)
    .forEach(({ index }) => state.removeScanAppBlacklistItem(index));
  clearIgnoredAppSelection();
}

</script>
