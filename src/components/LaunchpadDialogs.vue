<template>
  <div v-if="state.isScanResultDialogOpen.value" class="scan-result-overlay" @wheel.stop @pointerdown.self="state.closeScanResultDialog">
    <section class="scan-result-dialog" role="dialog" aria-modal="true" aria-label="扫描结果">
      <header class="scan-result-header">
        <div>
          <h2>扫描结果</h2>
          <p>发现 {{ state.scanResultApps.value.length }} 个可添加应用 · 已选择 {{ state.scanResultSelectedCount.value }} 个</p>
        </div>
        <button class="settings-close-button" type="button" aria-label="关闭扫描结果" @click="state.closeScanResultDialog">×</button>
      </header>

      <div class="scan-result-body">
        <div v-if="state.scanResultApps.value.length" class="settings-list-actions">
          <button class="settings-link-button" type="button" @click="state.selectAllScanResultApps">全选</button>
          <button class="settings-link-button" type="button" @click="state.clearScanResultSelection">清空选择</button>
        </div>

        <div v-if="state.scanResultApps.value.length" class="app-manager-list scan-result-list" role="list" aria-label="可添加应用">
          <label v-for="app in state.scanResultApps.value" :key="app.id" class="app-manager-item scan-result-item" role="listitem">
            <input
              type="checkbox"
              :aria-label="`选择 ${app.name}`"
              :checked="state.scanResultSelectedIds.value.includes(app.id)"
              @change="state.toggleScanResultSelection(app.id, $event.target.checked)"
            />
            <span class="app-manager-icon">
              <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
              <span v-else>{{ app.emoji }}</span>
            </span>
            <span class="app-manager-details">
              <span class="app-manager-name">{{ app.name }}</span>
              <span class="app-manager-target">{{ state.getLaunchTargetPath(app) || "未设置启动路径" }}</span>
              <span v-if="app.launchArgs" class="app-manager-target">参数：{{ app.launchArgs }}</span>
            </span>
          </label>
        </div>

        <div v-else class="scan-result-empty">没有发现可添加的应用</div>
      </div>

      <footer class="scan-result-actions">
        <button class="settings-secondary-button" type="button" @click="state.closeScanResultDialog">取消</button>
        <button class="settings-primary-button" type="button" :disabled="!state.canAddScannedApps.value" @click="state.addSelectedScannedApps">添加所选</button>
      </footer>
    </section>
  </div>

  <div v-if="state.isAddingManagedApp.value" class="app-edit-overlay" @wheel.stop @pointerdown.self="state.closeAddManagedAppPage">
    <section class="app-edit-dialog" role="dialog" aria-modal="true" aria-label="新增应用">
      <header class="app-edit-header">
        <div>
          <h2>新增应用</h2>
          <p>添加自定义应用到启动台</p>
        </div>
        <button class="settings-close-button" type="button" aria-label="关闭新增窗口" @click="state.closeAddManagedAppPage">×</button>
      </header>

      <div class="app-edit-body">
        <div class="app-edit-icon-row">
          <span class="app-edit-icon">
            <img v-if="state.newAppIconDataUrl.value" :src="state.newAppIconDataUrl.value" alt="" draggable="false" />
            <span v-else>{{ state.newManagedAppGlyph.value }}</span>
          </span>
          <div class="app-edit-icon-actions">
            <button class="settings-secondary-button" type="button" @click="state.openNewAppIconChooser">更换图标</button>
            <button class="settings-secondary-button" type="button" @click="state.resetNewAppIcon">恢复默认</button>
          </div>
        </div>

        <label class="app-edit-field">
          <span>应用名称</span>
          <input v-model="state.newAppName.value" type="text" maxlength="64" aria-label="应用名称" />
        </label>
        <label class="app-edit-field">
          <span>启动路径或 URL</span>
          <span class="app-edit-target-row">
            <input v-model="state.newAppTarget.value" type="text" aria-label="启动路径或 URL" />
            <button class="settings-secondary-button" type="button" :disabled="!state.canBrowseLaunchFile.value || state.isBrowsingNewAppTarget.value" @click="state.browseNewAppLaunchFile">
              {{ state.isBrowsingNewAppTarget.value ? "选择中" : "浏览" }}
            </button>
          </span>
        </label>
        <label class="app-edit-field">
          <span>启动参数</span>
          <input v-model="state.newAppArgs.value" type="text" aria-label="启动参数" />
        </label>
      </div>

      <footer class="app-edit-actions">
        <button class="settings-secondary-button" type="button" @click="state.closeAddManagedAppPage">取消</button>
        <button class="settings-primary-button" type="button" :disabled="!state.canAddManagedApp.value" @click="state.addManagedApp">保存</button>
      </footer>
    </section>
  </div>

  <div v-if="state.editingManagedApp.value" class="app-edit-overlay" @wheel.stop @pointerdown.self="state.closeEditManagedApp">
    <section class="app-edit-dialog" role="dialog" aria-modal="true" aria-label="编辑应用">
      <header class="app-edit-header">
        <div>
          <h2>编辑应用</h2>
          <p>{{ state.editingManagedApp.value.name }}</p>
        </div>
        <button class="settings-close-button" type="button" aria-label="关闭编辑窗口" @click="state.closeEditManagedApp">×</button>
      </header>

      <div class="app-edit-body">
        <div class="app-edit-icon-row">
          <span class="app-edit-icon">
            <img v-if="editingAppIconSource" :src="editingAppIconSource" alt="" draggable="false" />
            <span v-else>{{ state.editingManagedApp.value.emoji }}</span>
          </span>
          <div class="app-edit-icon-actions">
            <button class="settings-secondary-button" type="button" @click="state.openEditAppIconChooser">更换图标</button>
            <button class="settings-secondary-button" type="button" @click="state.resetEditAppIcon">恢复默认</button>
          </div>
        </div>

        <label class="app-edit-field">
          <span>应用名称</span>
          <input v-model="state.editAppName.value" type="text" maxlength="64" aria-label="应用名称" />
        </label>
        <label class="app-edit-field">
          <span>启动路径或 URL</span>
          <span class="app-edit-target-row">
            <input v-model="state.editAppTarget.value" type="text" aria-label="启动路径或 URL" />
            <button class="settings-secondary-button" type="button" :disabled="!state.canBrowseLaunchFile.value || state.isBrowsingEditAppTarget.value" @click="state.browseEditAppLaunchFile">
              {{ state.isBrowsingEditAppTarget.value ? "选择中" : "浏览" }}
            </button>
          </span>
        </label>
        <label class="app-edit-field">
          <span>启动参数</span>
          <input v-model="state.editAppArgs.value" type="text" aria-label="启动参数" />
        </label>
      </div>

      <footer class="app-edit-actions">
        <button class="settings-secondary-button" type="button" @click="state.closeEditManagedApp">取消</button>
        <button class="settings-primary-button" type="button" :disabled="!state.canSaveEditingManagedApp.value" @click="state.saveEditingManagedApp">保存</button>
      </footer>
    </section>
  </div>

  <div v-if="state.iconChooser.value" class="icon-chooser-overlay" @wheel.stop @pointerdown.self="state.closeIconChooser">
    <section class="icon-chooser-dialog" role="dialog" aria-modal="true" :aria-label="state.iconChooser.value.title">
      <header class="icon-chooser-header">
        <div>
          <h2>{{ state.iconChooser.value.title }}</h2>
          <p>{{ state.iconChooser.value.subtitle }}</p>
        </div>
        <button class="settings-close-button" type="button" aria-label="关闭图标选择" @click="state.closeIconChooser">×</button>
      </header>

      <div class="icon-chooser-body">
        <section class="icon-chooser-section" aria-label="应用内图标">
          <div class="icon-chooser-section-header">
            <h3>应用内图标</h3>
            <span v-if="state.iconChoices.value.length">{{ state.iconChoices.value.length }} 个</span>
          </div>
          <div v-if="state.isLoadingIconChoices.value" class="icon-chooser-empty">正在读取</div>
          <div v-else-if="state.iconChoices.value.length" class="icon-chooser-grid">
            <button
              v-for="choice in state.iconChoices.value"
              :key="choice.id"
              class="icon-chooser-option"
              type="button"
              aria-label="选择应用内图标"
              @click="state.chooseIconCandidate(choice)"
            >
              <img :src="choice.iconDataUrl" alt="" draggable="false" />
            </button>
          </div>
          <div v-else class="icon-chooser-empty">没有可用图标</div>
        </section>

        <section class="icon-chooser-section" aria-label="本地图片">
          <div class="icon-chooser-section-header">
            <h3>本地图片</h3>
          </div>
          <label class="settings-secondary-button icon-chooser-upload-button">
            选择图片
            <input type="file" accept="image/*" aria-label="从硬盘选择图片" @change="state.handleIconChooserUpload" />
          </label>
        </section>
      </div>
    </section>
  </div>

  <div v-if="state.layoutRecoveryNotice.value" class="layout-recovery-notice" role="status" aria-live="polite">
    <div class="layout-recovery-copy">
      <strong>{{ state.layoutRecoveryNotice.value.title }}</strong>
      <span>{{ state.layoutRecoveryNotice.value.message }}</span>
      <small v-if="state.layoutRecoveryNotice.value.backupPath">{{ state.layoutRecoveryNotice.value.backupPath }}</small>
    </div>
    <button class="layout-recovery-close" type="button" aria-label="关闭布局恢复提示" @click="state.closeLayoutRecoveryNotice">×</button>
  </div>

  <Motion
    v-if="state.warningDialog.value"
    key="warning-dialog-overlay"
    :class="['warning-dialog-overlay', !state.isWarningDialogOpen.value && 'warning-dialog-overlay-closing']"
    :initial="{ opacity: 0 }"
    :animate="{ opacity: state.isWarningDialogOpen.value ? 1 : 0 }"
    :transition="{ duration: 0.14, ease: 'easeOut' }"
    @wheel.stop
    @pointerdown.self="state.closeWarningDialog"
  >
    <Motion
      class="warning-dialog"
      role="alertdialog"
      aria-modal="true"
      :aria-label="state.warningDialog.value.title"
      :initial="{ opacity: 0, scale: 0.96 }"
      :animate="state.isWarningDialogOpen.value ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }"
      :transition="{ duration: 0.16, ease: 'easeOut' }"
    >
      <div class="warning-dialog-icon">
        <AlertTriangleIcon class="warning-dialog-svg" />
      </div>
      <div class="warning-dialog-content">
        <h2>{{ state.warningDialog.value.title }}</h2>
        <p>{{ state.warningDialog.value.message }}</p>
        <p v-if="state.warningDialog.value.suggestion" class="warning-dialog-suggestion">建议：{{ state.warningDialog.value.suggestion }}</p>
      </div>
      <footer class="warning-dialog-actions">
        <button v-if="state.warningDialog.value.cancelText" class="settings-secondary-button" type="button" @click="state.closeWarningDialog">{{ state.warningDialog.value.cancelText }}</button>
        <button v-if="state.warningDialog.value.confirmText" class="settings-warning-button" type="button" @click="state.confirmWarningDialog">{{ state.warningDialog.value.confirmText }}</button>
      </footer>
    </Motion>
  </Motion>
</template>

<script setup>
import { Motion } from "motion-v";
import { computed } from "vue";
import { AlertTriangleIcon } from "./Icons.js";
import { getDefaultIconSource, getIconSource } from "../domain/iconSource.js";

const props = defineProps({
  state: { type: Object, required: true },
});

const editingAppIconSource = computed(() => {
  if (props.state.editAppIconDataUrl.value) return props.state.editAppIconDataUrl.value;
  if (props.state.isEditAppIconReset.value) return getDefaultIconSource(props.state.editingManagedApp.value);
  return getIconSource(props.state.editingManagedApp.value);
});
</script>
