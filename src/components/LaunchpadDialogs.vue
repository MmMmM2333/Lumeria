<template>
  <div v-if="state.isScanResultDialogOpen.value" class="scan-result-overlay" @wheel.stop @pointerdown.self="state.closeScanResultDialog">
    <section ref="scanResultDialogRef" class="scan-result-dialog" role="dialog" aria-modal="true" aria-label="扫描结果" tabindex="-1" @keydown="handleDialogKeydown($event, scanResultDialogRef, state.closeScanResultDialog)">
      <header class="scan-result-header">
        <div>
          <h2>扫描结果</h2>
          <p>发现 {{ state.scanResultApps.value.length }} 个可添加应用 · 已选择 {{ state.scanResultSelectedCount.value }} 个</p>
          <p v-if="state.scanResultWarnings.value.length" class="settings-field-hint">部分目录因权限、链接或扫描限制被跳过</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" aria-label="关闭扫描结果" @click="state.closeScanResultDialog">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="scan-result-body">
        <div v-if="state.scanResultApps.value.length" class="settings-list-actions">
          <button class="settings-link-button" type="button" @click="state.selectAllScanResultApps">全选</button>
          <button class="settings-link-button" type="button" @click="state.clearScanResultSelection">清空选择</button>
        </div>

        <div v-if="state.scanResultApps.value.length" class="app-manager-list scan-result-list" role="list" aria-label="可添加应用">
          <div
            v-for="app in state.scanResultApps.value"
            :key="app.id"
            :class="['app-manager-item', 'scan-result-item', isScanResultAppSelected(app.id) && 'app-manager-item-selected']"
            role="listitem"
            :aria-selected="isScanResultAppSelected(app.id)"
            @click="state.toggleScanResultSelection(app.id, !isScanResultAppSelected(app.id))"
          >
            <fluent-checkbox
              :name="`scanResultSelection-${app.id}`"
              :aria-label="`选择 ${app.name}`"
              :checked.prop="isScanResultAppSelected(app.id)"
              @click.stop
              @change.stop="state.toggleScanResultSelection(app.id, $event.target.checked)"
            />
            <span class="app-manager-icon">
              <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
              <span v-else>{{ app.emoji }}</span>
            </span>
            <span class="app-manager-details">
              <span class="app-manager-name">{{ app.name }}</span>
              <span class="app-manager-target">{{ state.getLaunchTargetPath(app) || "未设置启动路径" }}</span>
              <span v-if="app.launchTarget?.kind === 'executable' && app.launchArgs" class="app-manager-target">参数：{{ app.launchArgs }}</span>
            </span>
          </div>
        </div>

        <div v-else class="scan-result-empty">没有发现可添加的应用</div>
      </div>

      <footer class="scan-result-actions">
        <SettingsFluentButton appearance="outline" type="button" @click="state.closeScanResultDialog">取消</SettingsFluentButton>
        <SettingsFluentButton appearance="primary" type="button" :disabled="!state.canAddScannedApps.value" @click="state.addSelectedScannedApps">添加所选</SettingsFluentButton>
      </footer>
    </section>
  </div>

  <div v-if="state.isAddingManagedApp.value" class="app-edit-overlay" @wheel.stop @pointerdown.self="state.closeAddManagedAppPage">
    <section ref="addAppDialogRef" class="app-edit-dialog" role="dialog" aria-modal="true" aria-label="新增应用" tabindex="-1" @keydown="handleDialogKeydown($event, addAppDialogRef, state.closeAddManagedAppPage)">
      <header class="app-edit-header">
        <div>
          <h2>新增应用</h2>
          <p>添加自定义应用到启动台</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" aria-label="关闭新增窗口" @click="state.closeAddManagedAppPage">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="app-edit-body">
        <div class="app-edit-icon-row">
          <span class="app-edit-icon">
            <img v-if="state.newAppIconDataUrl.value" :src="state.newAppIconDataUrl.value" alt="" draggable="false" />
            <span v-else>{{ state.newManagedAppGlyph.value }}</span>
          </span>
          <div class="app-edit-icon-actions">
            <SettingsFluentButton appearance="outline" type="button" @click="state.openNewAppIconChooser">更换图标</SettingsFluentButton>
            <SettingsFluentButton appearance="subtle" type="button" @click="state.resetNewAppIcon">恢复默认</SettingsFluentButton>
          </div>
        </div>

        <label class="app-edit-field">
          <span>应用名称</span>
          <fluent-text-input
            class="settings-text-input app-edit-input"
            name="newAppName"
            maxlength="64"
            aria-label="应用名称"
            autocomplete="off"
            :value.prop="state.newAppName.value"
            @input="state.newAppName.value = $event.target.value"
          />
        </label>
        <label class="app-edit-field">
          <span>启动路径或 URL</span>
          <span class="app-edit-target-row">
            <fluent-text-input
              class="settings-text-input app-edit-input"
              name="newAppTarget"
              aria-label="启动路径或 URL"
              autocomplete="off"
              :value.prop="state.newAppTarget.value"
              @input="state.newAppTarget.value = $event.target.value"
            />
            <SettingsFluentButton appearance="outline" type="button" :disabled="!state.canBrowseLaunchFile.value || state.isBrowsingNewAppTarget.value" @click="state.browseNewAppLaunchFile">
              {{ state.isBrowsingNewAppTarget.value ? "选择中" : "浏览" }}
            </SettingsFluentButton>
          </span>
        </label>
        <label v-if="state.canEditNewAppArgs.value" class="app-edit-field">
          <span>启动参数</span>
          <fluent-text-input
            class="settings-text-input app-edit-input"
            name="newAppArgs"
            aria-label="启动参数"
            autocomplete="off"
            :value.prop="state.newAppArgs.value"
            @input="state.newAppArgs.value = $event.target.value"
          />
        </label>
      </div>

      <footer class="app-edit-actions">
        <SettingsFluentButton appearance="outline" type="button" @click="state.closeAddManagedAppPage">取消</SettingsFluentButton>
        <SettingsFluentButton appearance="primary" type="button" :disabled="!state.canAddManagedApp.value" @click="state.addManagedApp">保存</SettingsFluentButton>
      </footer>
    </section>
  </div>

  <div v-if="state.editingManagedApp.value" class="app-edit-overlay" @wheel.stop @pointerdown.self="state.closeEditManagedApp">
    <section ref="editAppDialogRef" class="app-edit-dialog" role="dialog" aria-modal="true" aria-label="编辑应用" tabindex="-1" @keydown="handleDialogKeydown($event, editAppDialogRef, state.closeEditManagedApp)">
      <header class="app-edit-header">
        <div>
          <h2>编辑应用</h2>
          <p>{{ state.editingManagedApp.value.name }}</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" aria-label="关闭编辑窗口" @click="state.closeEditManagedApp">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="app-edit-body">
        <div class="app-edit-icon-row">
          <span class="app-edit-icon">
            <img v-if="editingAppIconSource" :src="editingAppIconSource" alt="" draggable="false" />
            <span v-else>{{ state.editingManagedApp.value.emoji }}</span>
          </span>
          <div class="app-edit-icon-actions">
            <SettingsFluentButton appearance="outline" type="button" @click="state.openEditAppIconChooser">更换图标</SettingsFluentButton>
            <SettingsFluentButton appearance="subtle" type="button" @click="state.resetEditAppIcon">恢复默认</SettingsFluentButton>
          </div>
        </div>

        <label class="app-edit-field">
          <span>应用名称</span>
          <fluent-text-input
            class="settings-text-input app-edit-input"
            name="editAppName"
            maxlength="64"
            aria-label="应用名称"
            autocomplete="off"
            :value.prop="state.editAppName.value"
            @input="state.editAppName.value = $event.target.value"
          />
        </label>
        <label class="app-edit-field">
          <span>启动路径或 URL</span>
          <span class="app-edit-target-row">
            <fluent-text-input
              class="settings-text-input app-edit-input"
              name="editAppTarget"
              aria-label="启动路径或 URL"
              autocomplete="off"
              :value.prop="state.editAppTarget.value"
              @input="state.editAppTarget.value = $event.target.value"
            />
            <SettingsFluentButton appearance="outline" type="button" :disabled="!state.canBrowseLaunchFile.value || state.isBrowsingEditAppTarget.value" @click="state.browseEditAppLaunchFile">
              {{ state.isBrowsingEditAppTarget.value ? "选择中" : "浏览" }}
            </SettingsFluentButton>
          </span>
        </label>
        <label v-if="state.canEditAppArgs.value" class="app-edit-field">
          <span>启动参数</span>
          <fluent-text-input
            class="settings-text-input app-edit-input"
            name="editAppArgs"
            aria-label="启动参数"
            autocomplete="off"
            :value.prop="state.editAppArgs.value"
            @input="state.editAppArgs.value = $event.target.value"
          />
        </label>
      </div>

      <footer class="app-edit-actions">
        <SettingsFluentButton appearance="outline" type="button" @click="state.closeEditManagedApp">取消</SettingsFluentButton>
        <SettingsFluentButton appearance="primary" type="button" :disabled="!state.canSaveEditingManagedApp.value" @click="state.saveEditingManagedApp">保存</SettingsFluentButton>
      </footer>
    </section>
  </div>

  <div v-if="state.iconChooser.value" class="icon-chooser-overlay" @wheel.stop @pointerdown.self="state.closeIconChooser">
    <section ref="iconChooserDialogRef" class="icon-chooser-dialog" role="dialog" aria-modal="true" :aria-label="state.iconChooser.value.title" tabindex="-1" @keydown="handleDialogKeydown($event, iconChooserDialogRef, state.closeIconChooser)">
      <header class="icon-chooser-header">
        <div>
          <h2>{{ state.iconChooser.value.title }}</h2>
          <p>{{ state.iconChooser.value.subtitle }}</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" aria-label="关闭图标选择" @click="state.closeIconChooser">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="icon-chooser-body">
        <section class="icon-chooser-section" aria-label="应用内图标">
          <div class="icon-chooser-section-header">
            <h3>应用内图标</h3>
            <span v-if="state.iconChoices.value.length">{{ state.iconChoices.value.length }} 个</span>
          </div>
          <div v-if="state.isLoadingIconChoices.value" class="icon-chooser-empty">正在读取</div>
          <div v-else-if="state.iconChoicesError.value" class="icon-chooser-empty">{{ state.iconChoicesError.value }}</div>
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
            <input name="customIconFile" type="file" accept="image/*" aria-label="从硬盘选择图片" autocomplete="off" @change="state.handleIconChooserUpload" />
          </label>
        </section>
      </div>
    </section>
  </div>

  <div v-if="state.layoutRecoveryNotice.value || state.layoutSaveNotice.value" class="layout-notice-stack">
    <fluent-message-bar
      v-if="state.layoutRecoveryNotice.value"
      class="layout-notice-bar"
      layout="multiline"
      :intent="state.layoutRecoveryNotice.value.intent || 'warning'"
      aria-live="polite"
    >
      <component :is="getNoticeIcon(state.layoutRecoveryNotice.value.intent || 'warning')" slot="icon" class="layout-notice-icon" />
      <span class="layout-recovery-copy">
        <strong>{{ state.layoutRecoveryNotice.value.title }}</strong>
        <span>{{ state.layoutRecoveryNotice.value.message }}</span>
        <small v-if="state.layoutRecoveryNotice.value.backupPath">{{ state.layoutRecoveryNotice.value.backupPath }}</small>
      </span>
      <SettingsFluentButton fluent-slot="dismiss" appearance="subtle" icon-only type="button" aria-label="关闭布局恢复提示" @click="state.closeLayoutRecoveryNotice">
        <DismissIcon class="layout-notice-dismiss-icon" />
      </SettingsFluentButton>
    </fluent-message-bar>

    <fluent-message-bar
      v-if="state.layoutSaveNotice.value"
      class="layout-notice-bar"
      layout="multiline"
      :intent="state.layoutSaveNotice.value.intent || 'info'"
      aria-live="polite"
    >
      <component :is="getNoticeIcon(state.layoutSaveNotice.value.intent || 'info')" slot="icon" class="layout-notice-icon" />
      <span class="layout-recovery-copy">
        <strong>{{ state.layoutSaveNotice.value.title }}</strong>
        <span>{{ state.layoutSaveNotice.value.message }}</span>
        <small v-if="state.layoutSaveNotice.value.detail">{{ state.layoutSaveNotice.value.detail }}</small>
      </span>
      <SettingsFluentButton
        v-if="state.layoutSaveNotice.value.actionText"
        fluent-slot="actions"
        appearance="outline"
        size="small"
        type="button"
        @click="state.layoutSaveNotice.value.onAction?.()"
      >
        {{ state.layoutSaveNotice.value.actionText }}
      </SettingsFluentButton>
      <SettingsFluentButton fluent-slot="dismiss" appearance="subtle" icon-only type="button" aria-label="关闭布局保存提示" @click="state.closeLayoutSaveNotice">
        <DismissIcon class="layout-notice-dismiss-icon" />
      </SettingsFluentButton>
    </fluent-message-bar>
  </div>

  <div
    v-if="state.warningDialog.value"
    key="warning-dialog-overlay"
    ref="warningDialogOverlayRef"
    :class="['warning-dialog-overlay', !state.isWarningDialogOpen.value && 'warning-dialog-overlay-closing']"
    @wheel.stop
    @pointerdown.self="state.closeWarningDialog"
  >
    <section
      ref="warningDialogRef"
      :class="['warning-dialog', `warning-dialog-${warningDialogIntent}`]"
      role="alertdialog"
      aria-modal="true"
      :aria-label="state.warningDialog.value.title"
      tabindex="-1"
      @keydown="handleDialogKeydown($event, warningDialogRef, state.closeWarningDialog)"
    >
      <div class="warning-dialog-icon">
        <component :is="warningDialogIcon" class="warning-dialog-svg" />
      </div>
      <div class="warning-dialog-content">
        <h2>{{ state.warningDialog.value.title }}</h2>
        <p>{{ state.warningDialog.value.message }}</p>
        <p v-if="state.warningDialog.value.suggestion" class="warning-dialog-suggestion">建议：{{ state.warningDialog.value.suggestion }}</p>
      </div>
      <footer class="warning-dialog-actions">
        <SettingsFluentButton v-if="state.warningDialog.value.cancelText" appearance="outline" type="button" @click="state.closeWarningDialog">{{ state.warningDialog.value.cancelText }}</SettingsFluentButton>
        <SettingsFluentButton
          v-if="state.warningDialog.value.confirmText"
          :appearance="warningConfirmAppearance"
          :tone="warningConfirmTone"
          type="button"
          @click="state.confirmWarningDialog"
        >
          {{ state.warningDialog.value.confirmText }}
        </SettingsFluentButton>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import CheckmarkCircleIcon from "~icons/fluent/checkmark-circle-20-regular";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import ErrorCircleIcon from "~icons/fluent/error-circle-20-regular";
import InfoIcon from "~icons/fluent/info-20-regular";
import { AlertTriangleIcon } from "./Icons.js";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";
import { useGsapDomMotion } from "../composables/useGsapDomMotion.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import { getDefaultIconSource, getIconSource } from "../domain/iconSource.js";

const props = defineProps({
  state: { type: Object, required: true },
});

const scanResultDialogRef = ref(null);
const addAppDialogRef = ref(null);
const editAppDialogRef = ref(null);
const iconChooserDialogRef = ref(null);
const warningDialogOverlayRef = ref(null);
const warningDialogRef = ref(null);
const warningDialogOverlayMotion = useGsapDomMotion(warningDialogOverlayRef, {
  initial: { opacity: 0 },
  motion: resolveWarningDialogOverlayMotion,
});
const warningDialogMotion = useGsapDomMotion(warningDialogRef, {
  initial: { opacity: 0, scale: 0.96 },
  motion: resolveWarningDialogPanelMotion,
});

const activeDialog = computed(() => {
  if (props.state.warningDialog.value) return { id: "warning", ref: warningDialogRef };
  if (props.state.iconChooser.value) return { id: "iconChooser", ref: iconChooserDialogRef };
  if (props.state.editingManagedApp.value) return { id: "editApp", ref: editAppDialogRef };
  if (props.state.isAddingManagedApp.value) return { id: "addApp", ref: addAppDialogRef };
  if (props.state.isScanResultDialogOpen.value) return { id: "scanResult", ref: scanResultDialogRef };
  return null;
});

const editingAppIconSource = computed(() => {
  if (props.state.editAppIconDataUrl.value) return props.state.editAppIconDataUrl.value;
  if (props.state.isEditAppIconReset.value) return getDefaultIconSource(props.state.editingManagedApp.value);
  return getIconSource(props.state.editingManagedApp.value);
});

const warningDialogIntent = computed(() => normalizeDialogIntent(props.state.warningDialog.value?.intent));
const warningDialogIcon = computed(() => getNoticeIcon(warningDialogIntent.value));
const warningConfirmAppearance = computed(() => (warningDialogIntent.value === "error" ? "outline" : "primary"));
const warningConfirmTone = computed(() => (warningDialogIntent.value === "error" ? "danger" : null));

watch(
  () => activeDialog.value?.id,
  async () => {
    const dialog = activeDialog.value;
    if (!dialog) return;
    await nextTick();
    focusModalElement(dialog.ref);
  }
);

watch(
  () => props.state.isWarningDialogOpen.value,
  () => {
    warningDialogOverlayMotion.animate();
    warningDialogMotion.animate();
  },
  { flush: "post" }
);

function handleDialogKeydown(event, dialogRef, onEscape) {
  handleModalKeydown(event, dialogRef, onEscape);
}

function isScanResultAppSelected(appId) {
  return props.state.scanResultSelectedIds.value.includes(appId);
}

function normalizeDialogIntent(intent) {
  return ["success", "warning", "error", "info"].includes(intent) ? intent : "warning";
}

function getNoticeIcon(intent) {
  switch (normalizeDialogIntent(intent)) {
    case "success":
      return CheckmarkCircleIcon;
    case "error":
      return ErrorCircleIcon;
    case "info":
      return InfoIcon;
    default:
      return AlertTriangleIcon;
  }
}

function resolveWarningDialogOverlayMotion() {
  return {
    opacity: props.state.isWarningDialogOpen.value ? 1 : 0,
    duration: 0.14,
  };
}

function resolveWarningDialogPanelMotion() {
  return props.state.isWarningDialogOpen.value
    ? { opacity: 1, scale: 1, duration: 0.16 }
    : { opacity: 0, scale: 0.96, duration: 0.16 };
}
</script>
