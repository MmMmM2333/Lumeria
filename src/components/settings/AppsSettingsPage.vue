<template>
  <div class="settings-tab-panel" role="tabpanel" aria-label="应用">
    <section class="settings-section" aria-label="扫描来源">
      <div class="settings-section-header">
        <div>
          <h3>扫描来源</h3>
          <p>{{ state.scanRoots.value.filter((root) => root.enabled).length }} / {{ state.scanRoots.value.length }} 个来源已启用</p>
        </div>
        <div class="settings-inline-actions">
          <fluent-button appearance="outline" type="button" @click="state.confirmResetScanRoots">还原默认来源</fluent-button>
          <fluent-button appearance="primary" type="button" @click="state.addScanRoot">新增来源</fluent-button>
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-field-copy">
          <span>显示失效路径标记</span>
          <span class="settings-field-hint">在启动目标丢失时提示</span>
        </span>
        <fluent-switch
          :checked.prop="state.showMissingLaunchTargetBadge.value"
          aria-label="显示失效路径标记"
          @change="state.toggleMissingLaunchTargetBadge($event.target.checked)"
        />
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
              @change="state.changeScanRootLabel(root.id, $event.target.value)"
            />
            <span class="scan-root-path-row">
              <fluent-text-input
                class="settings-text-input scan-root-path"
                control-size="small"
                :name="`scanRootPath-${root.id}`"
                :value.prop="root.path"
                :aria-label="`${root.label} 路径`"
                @change="state.changeScanRootPath(root.id, $event.target.value)"
              />
              <fluent-button
                appearance="outline"
                size="small"
                type="button"
                :disabled.prop="!state.canBrowseScanRoots.value || state.isBrowsingScanRoot(root.id)"
                @click="state.browseScanRootDirectory(root.id)"
              >
                {{ state.isBrowsingScanRoot(root.id) ? "选择中" : "浏览" }}
              </fluent-button>
            </span>
            <span v-if="root.lastScannedAt" class="settings-field-hint">上次扫描 {{ formatScanTime(root.lastScannedAt) }}</span>
          </span>
          <fluent-button
            appearance="subtle"
            size="small"
            type="button"
            :disabled.prop="!root.removable"
            @click="state.removeScanRoot(root.id)"
          >
            删除
          </fluent-button>
        </div>
      </div>
    </section>

    <section class="settings-section" aria-label="扫描过滤">
      <div class="settings-section-header">
        <div>
          <h3>扫描过滤</h3>
          <p>{{ state.scanKeywordBlacklist.value.length }} 个关键字 · {{ state.scanAppBlacklist.value.length }} 个忽略应用</p>
        </div>
      </div>

      <div class="scan-filter-block">
        <div class="scan-filter-header">
          <span>关键字黑名单</span>
        </div>
        <div class="scan-keyword-editor">
          <fluent-text-input
            class="settings-text-input scan-keyword-input"
            name="newScanKeyword"
            placeholder="输入关键字"
            aria-label="新增扫描过滤关键字"
            :value.prop="state.newScanKeyword.value"
            @input="state.newScanKeyword.value = $event.target.value"
            @keydown.enter.prevent="state.addScanKeywordBlacklistItem"
          />
          <fluent-button appearance="outline" type="button" @click="state.addScanKeywordBlacklistItem">添加</fluent-button>
        </div>
        <div v-if="state.scanKeywordBlacklist.value.length" class="scan-keyword-list">
          <span v-for="(keyword, index) in state.scanKeywordBlacklist.value" :key="`${keyword}-${index}`" class="scan-keyword-chip">
            <span>{{ keyword }}</span>
            <button type="button" :aria-label="`移除关键字 ${keyword}`" @click="state.removeScanKeywordBlacklistItem(index)">×</button>
          </span>
        </div>
        <div v-else class="settings-empty-state">没有关键字</div>
      </div>

      <div class="scan-filter-block">
        <div class="scan-filter-header">
          <span>忽略的应用</span>
        </div>
        <div v-if="state.scanAppBlacklist.value.length" class="scan-blocked-app-list">
          <div v-for="(app, index) in state.scanAppBlacklist.value" :key="`${app.sourceKey || app.path}-${index}`" class="scan-blocked-app-item">
            <span class="scan-root-details">
              <span class="scan-root-name">{{ app.name || "未命名应用" }}</span>
              <span class="scan-blocked-app-path">{{ app.path || app.sourceKey }}</span>
            </span>
            <fluent-button appearance="outline" size="small" type="button" @click="state.removeScanAppBlacklistItem(index)">
              恢复扫描
            </fluent-button>
          </div>
        </div>
        <div v-else class="settings-empty-state">没有忽略的应用</div>
      </div>
    </section>

    <section class="settings-section" aria-label="应用管理">
      <div class="settings-section-header">
        <div>
          <h3>应用管理</h3>
          <p>{{ state.filteredManagedApps.value.length }} / {{ state.managedApps.value.length }} 个应用 · 已选择 {{ state.selectedManagedAppCount.value }} 个</p>
        </div>
        <div class="settings-inline-actions">
          <fluent-button
            appearance="outline"
            type="button"
            :disabled.prop="!state.canScanManagedApps.value || state.isScanningApps.value"
            @click="state.rescanManagedApps"
          >
            {{ state.isScanningApps.value ? "扫描中" : "扫描应用" }}
          </fluent-button>
          <fluent-button appearance="primary" type="button" @click="state.openAddManagedAppPage">新增应用</fluent-button>
          <fluent-button
            appearance="outline"
            type="button"
            :disabled.prop="state.selectedManagedAppCount.value === 0"
            @click="state.ignoreSelectedManagedApps"
          >
            批量忽略
          </fluent-button>
          <fluent-button
            appearance="subtle"
            type="button"
            :disabled.prop="state.selectedManagedAppCount.value === 0"
            @click="state.deleteSelectedManagedApps"
          >
            批量删除
          </fluent-button>
        </div>
      </div>

      <fluent-text-input
        class="settings-text-input app-manager-search"
        name="appManagerSearch"
        placeholder="搜索应用"
        aria-label="搜索应用"
        :value.prop="state.appManagerSearchQuery.value"
        @input="state.appManagerSearchQuery.value = $event.target.value"
      />

      <div class="settings-list-actions">
        <button class="settings-link-button" type="button" @click="state.selectAllManagedApps">全选</button>
        <button class="settings-link-button" type="button" @click="state.clearManagedAppSelection">清空选择</button>
      </div>

      <div class="app-manager-list" role="list" aria-label="所有应用">
        <div v-for="app in state.filteredManagedApps.value" :key="app.id" class="app-manager-item" role="listitem">
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
              <fluent-menu-button slot="trigger" appearance="subtle" size="small">更多</fluent-menu-button>
              <fluent-menu-list>
                <fluent-menu-item @click="state.openEditManagedApp(app)">编辑</fluent-menu-item>
                <fluent-menu-item @click="state.ignoreManagedApp(app)">忽略</fluent-menu-item>
                <fluent-menu-item @click="state.deleteManagedApp(app.id)">删除</fluent-menu-item>
              </fluent-menu-list>
            </fluent-menu>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { getIconSource } from "../../domain/iconSource.js";

const props = defineProps({
  backgroundLayoutContext: { type: Object, default: null },
  context: { type: Object, required: true },
  state: { type: Object, required: true },
});

const { formatScanTime } = props.context;
</script>
