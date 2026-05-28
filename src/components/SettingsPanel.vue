<template>
  <Motion
    v-if="state.shouldRenderSettingsPanel.value"
    key="settings-overlay"
    :class="cx('settings-overlay', !state.isSettingsPanelOpen.value && 'settings-overlay-closing')"
    :initial="{ opacity: 0 }"
    :animate="state.settingsOverlayAnimate.value"
    :transition="{ duration: 0.16 }"
    @wheel.stop
    @pointerdown.self="state.closeSettingsPanel"
  >
    <Motion
      class="settings-panel"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      :initial="state.settingsPanelInitial.value"
      :animate="state.settingsPanelAnimate.value"
      :transition="state.panelSpring"
    >
      <header class="settings-panel-header">
        <div>
          <h2>设置</h2>
        </div>
        <button class="settings-close-button" type="button" aria-label="关闭设置" @click="state.closeSettingsPanel">×</button>
      </header>

      <nav class="settings-tabs" role="tablist" aria-label="设置分类">
        <button
          v-for="tab in settingsTabs"
          :key="tab.id"
          type="button"
          role="tab"
          :class="cx('settings-tab', activeSettingsTab === tab.id && 'settings-tab-active')"
          :aria-selected="activeSettingsTab === tab.id"
          :tabindex="activeSettingsTab === tab.id ? 0 : -1"
          @click="activeSettingsTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div class="settings-panel-body">
        <div v-if="activeSettingsTab === 'general'" class="settings-tab-panel" role="tabpanel" aria-label="通用">
          <section class="settings-section" aria-label="通用">
            <div class="settings-section-header">
              <h3>通用</h3>
            </div>
            <div class="settings-options">
              <label class="settings-option settings-option-disabled">
                <span class="settings-option-copy">
                  <span>开机自启</span>
                  <span class="settings-field-hint">登录 Windows 后自动打开 LaunchPad</span>
                </span>
                <input type="checkbox" aria-label="开机自启" disabled />
              </label>
              <div class="settings-option settings-option-disabled">
                <span class="settings-option-copy">
                  <span>快捷键</span>
                  <span class="settings-field-hint">快速显示或隐藏 LaunchPad</span>
                </span>
                <div class="settings-hotkey-control">
                  <kbd>Alt + Space</kbd>
                  <button class="settings-secondary-button" type="button" disabled>录制</button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="activeSettingsTab === 'interface'" class="settings-tab-panel" role="tabpanel" aria-label="界面">
          <section class="settings-section" aria-label="显示偏好">
            <div class="settings-section-header">
              <h3>显示偏好</h3>
            </div>
            <div class="settings-grid">
              <div class="settings-field settings-field-wide settings-grid-layout-field">
                <span>桌面布局</span>
                <div class="settings-grid-layout-control" aria-label="桌面布局">
                  <div class="settings-number-control">
                    <input v-model.number="state.draftRows.value" min="2" max="8" type="number" aria-label="桌面行数" />
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增加桌面行数" @click.prevent="state.changeDraftRows(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="减少桌面行数" @click.prevent="state.changeDraftRows(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                  <span class="settings-grid-layout-separator">×</span>
                  <div class="settings-number-control">
                    <input v-model.number="state.draftCols.value" min="3" max="10" type="number" aria-label="桌面列数" />
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增加桌面列数" @click.prevent="state.changeDraftCols(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="减少桌面列数" @click.prevent="state.changeDraftCols(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="settings-field settings-field-wide settings-grid-layout-field">
                <span>文件夹布局</span>
                <div class="settings-grid-layout-control" aria-label="文件夹布局">
                  <div class="settings-number-control">
                    <input v-model.number="state.draftFolderRows.value" min="2" max="6" type="number" aria-label="文件夹行数" />
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增加文件夹行数" @click.prevent="state.changeDraftFolderRows(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="减少文件夹行数" @click.prevent="state.changeDraftFolderRows(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                  <span class="settings-grid-layout-separator">×</span>
                  <div class="settings-number-control">
                    <input v-model.number="state.draftFolderCols.value" min="2" max="8" type="number" aria-label="文件夹列数" />
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增加文件夹列数" @click.prevent="state.changeDraftFolderCols(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="减少文件夹列数" @click.prevent="state.changeDraftFolderCols(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="settings-field settings-field-wide">
                <span class="settings-field-copy">
                  <span>图标大小</span>
                  <span class="settings-field-hint">{{ ICON_SIZE_MIN }}-{{ ICON_SIZE_MAX }}px</span>
                </span>
                <div class="settings-number-control settings-number-control-wide">
                  <input v-model.number="state.draftIconSize.value" :min="ICON_SIZE_MIN" :max="ICON_SIZE_MAX" :step="ICON_SIZE_STEP" type="number" aria-label="图标大小" />
                  <span class="settings-number-unit">px</span>
                  <div class="settings-number-buttons">
                    <button type="button" aria-label="增大图标" @click.prevent="state.changeDraftIconSize(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                    <button type="button" aria-label="缩小图标" @click.prevent="state.changeDraftIconSize(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                  </div>
                </div>
              </div>
              <div class="settings-field settings-field-wide settings-folder-icon-size-field">
                <span class="settings-field-copy">
                  <span>文件夹图标大小</span>
                  <span class="settings-field-hint">{{ ICON_SIZE_MIN }}-{{ ICON_SIZE_MAX }}px</span>
                </span>
                <div class="settings-folder-icon-size-control">
                  <div class="settings-segmented-control" aria-label="文件夹图标大小模式">
                    <button
                      type="button"
                      :class="cx('settings-segmented-button', state.draftFolderIconSizeMode.value === 'global' && 'settings-segmented-button-active')"
                      @click="state.setDraftFolderIconSizeMode('global')"
                    >
                      跟随全局
                    </button>
                    <button
                      type="button"
                      :class="cx('settings-segmented-button', state.draftFolderIconSizeMode.value === 'custom' && 'settings-segmented-button-active')"
                      @click="state.setDraftFolderIconSizeMode('custom')"
                    >
                      自定义
                    </button>
                  </div>
                  <div v-if="state.draftFolderIconSizeMode.value === 'custom'" class="settings-number-control settings-number-control-wide">
                    <input v-model.number="state.draftFolderIconSize.value" :min="ICON_SIZE_MIN" :max="ICON_SIZE_MAX" :step="ICON_SIZE_STEP" type="number" aria-label="文件夹图标大小" />
                    <span class="settings-number-unit">px</span>
                    <div class="settings-number-buttons">
                      <button type="button" aria-label="增大文件夹图标" @click.prevent="state.changeDraftFolderIconSize(1)"><ChevronUpIcon class="settings-number-icon" /></button>
                      <button type="button" aria-label="缩小文件夹图标" @click.prevent="state.changeDraftFolderIconSize(-1)"><ChevronDownIcon class="settings-number-icon" /></button>
                    </div>
                  </div>
                </div>
              </div>
              <label class="settings-toggle">
                <span>无字模式</span>
                <input v-model="state.isTextlessMode.value" type="checkbox" />
              </label>
            </div>
          </section>

          <section class="settings-section" aria-label="整理空位">
            <div class="settings-section-header">
              <div>
                <h3>整理空位</h3>
                <p>根据当前行列布局，将App向前整理以填补空位</p>
              </div>
              <button class="settings-warning-button" type="button" :disabled="!!state.dragMeta.value" @click="state.confirmForceFillAllPages">重新整理</button>
            </div>
          </section>
        </div>

        <div v-else-if="activeSettingsTab === 'apps'" class="settings-tab-panel" role="tabpanel" aria-label="Apps">
          <section class="settings-section" aria-label="扫描来源">
            <div class="settings-section-header">
              <div>
                <h3>扫描来源</h3>
                <p>{{ state.scanRoots.value.filter((root) => root.enabled).length }} / {{ state.scanRoots.value.length }} 个来源已启用</p>
              </div>
              <div class="settings-inline-actions">
                <button class="settings-secondary-button" type="button" @click="state.addScanRoot">新增来源</button>
              </div>
            </div>
            <label class="settings-toggle">
              <span>显示失效路径标记</span>
              <input
                :checked="state.showMissingLaunchTargetBadge.value"
                type="checkbox"
                aria-label="显示失效路径标记"
                @change="state.toggleMissingLaunchTargetBadge($event.target.checked)"
              />
            </label>
            <div class="scan-root-list">
              <div v-for="root in state.scanRoots.value" :key="root.id" class="scan-root-item">
                <input
                  type="checkbox"
                  :checked="root.enabled"
                  :aria-label="`启用 ${root.label}`"
                  @change="state.toggleScanRootEnabled(root.id, $event.target.checked)"
                />
                <span class="scan-root-details">
                  <span class="scan-root-name">{{ root.label }}</span>
                  <input
                    class="scan-root-path"
                    :value="root.path"
                    type="text"
                    :aria-label="`${root.label} 路径`"
                    @change="state.changeScanRootPath(root.id, $event.target.value)"
                  />
                  <span v-if="root.lastScannedAt" class="settings-field-hint">上次扫描 {{ root.lastScannedAt }}</span>
                </span>
                <button class="settings-danger-button" type="button" :disabled="!root.removable" @click="state.removeScanRoot(root.id)">删除</button>
              </div>
            </div>
          </section>

          <section class="settings-section" aria-label="应用管理">
            <div class="settings-section-header">
              <div>
                <h3>应用管理</h3>
                <p>{{ state.filteredManagedApps.value.length }} / {{ state.managedApps.value.length }} 个应用 · 已选择 {{ state.selectedManagedAppCount.value }} 个</p>
              </div>
              <div class="settings-inline-actions">
                <button class="settings-secondary-button" type="button" :disabled="!state.canScanManagedApps.value || state.isScanningApps.value" @click="state.rescanManagedApps">
                  {{ state.isScanningApps.value ? "扫描中" : "扫描应用" }}
                </button>
                <button class="settings-primary-button" type="button" @click="state.openAddManagedAppPage">新增应用</button>
                <button class="settings-danger-button" type="button" :disabled="state.selectedManagedAppCount.value === 0" @click="state.deleteSelectedManagedApps">批量删除</button>
              </div>
            </div>

            <input v-model="state.appManagerSearchQuery.value" class="app-manager-search" type="search" placeholder="搜索应用" aria-label="搜索应用" />

            <div class="settings-list-actions">
              <button class="settings-link-button" type="button" @click="state.selectAllManagedApps">全选</button>
              <button class="settings-link-button" type="button" @click="state.clearManagedAppSelection">清空选择</button>
            </div>

            <div class="app-manager-list" role="list" aria-label="所有应用">
              <div v-for="app in state.filteredManagedApps.value" :key="app.id" class="app-manager-item" role="listitem">
                <input
                  type="checkbox"
                  :aria-label="`选择 ${app.name}`"
                  :checked="state.appManagerSelectedIds.value.includes(app.id)"
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
                  <button class="settings-secondary-button" type="button" @click="state.openEditManagedApp(app)">编辑</button>
                  <button class="settings-danger-button" type="button" @click="state.deleteManagedApp(app.id)">删除</button>
                </span>
              </div>
            </div>
          </section>
        </div>

        <div v-else class="settings-tab-panel" role="tabpanel" aria-label="关于">
          <section class="settings-section" aria-label="关于">
            <div class="settings-section-header">
              <h3>关于</h3>
            </div>
            <div class="settings-about-card">
              <span class="settings-about-name">LaunchPad</span>
              <span class="settings-about-version">版本 {{ state.appVersion }}</span>
            </div>
          </section>
        </div>
      </div>

      <footer v-if="activeSettingsTab === 'interface'" class="settings-actions">
        <button class="settings-secondary-button" type="button" @click="state.closeSettingsPanel">取消</button>
        <button class="settings-primary-button" type="button" :disabled="!!state.dragMeta.value" @click="state.applySettingsConfig">应用</button>
      </footer>
    </Motion>
  </Motion>
</template>

<script setup>
import { Motion } from "motion-v";
import { ref } from "vue";
import { ChevronDownIcon, ChevronUpIcon } from "./Icons.js";
import { ICON_SIZE_MAX, ICON_SIZE_MIN, ICON_SIZE_STEP } from "../composables/launchpadConstants.js";
import { getIconSource } from "../domain/iconSource.js";
import { cx } from "../domain/launchpadLayout.js";

defineProps({
  state: { type: Object, required: true },
});

const activeSettingsTab = ref("general");
const settingsTabs = [
  { id: "general", label: "通用" },
  { id: "interface", label: "界面" },
  { id: "apps", label: "Apps" },
  { id: "about", label: "关于" },
];
</script>
