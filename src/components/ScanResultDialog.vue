<template>
  <div v-if="model.isOpen.value" class="scan-result-overlay" @wheel.stop @pointerdown.self="model.actions.close">
    <section ref="dialogRef" class="scan-result-dialog" role="dialog" aria-modal="true" aria-label="扫描结果" tabindex="-1" @keydown="handleModalKeydown($event, dialogRef, model.actions.close)">
      <header class="scan-result-header">
        <div>
          <h2>扫描结果</h2>
          <p>发现 {{ model.apps.value.length }} 个可添加应用 · 已选择 {{ model.selectedCount.value }} 个</p>
          <p v-if="model.warnings.value.length" class="settings-field-hint">部分目录因权限、链接或扫描限制被跳过</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" aria-label="关闭扫描结果" @click="model.actions.close">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="scan-result-body">
        <div v-if="model.apps.value.length" class="settings-list-actions">
          <button class="settings-link-button" type="button" @click="model.actions.selectAll">全选</button>
          <button class="settings-link-button" type="button" @click="model.actions.clearSelection">清空选择</button>
        </div>
        <div v-if="model.apps.value.length" class="app-manager-list scan-result-list" role="list" aria-label="可添加应用">
          <div v-for="app in model.apps.value" :key="app.id" :class="['app-manager-item', 'scan-result-item', isSelected(app.id) && 'app-manager-item-selected']" role="listitem" :aria-selected="isSelected(app.id)" @click="model.actions.toggleSelection(app.id, !isSelected(app.id))">
            <fluent-checkbox :name="`scanResultSelection-${app.id}`" :aria-label="`选择 ${app.name}`" :checked.prop="isSelected(app.id)" @click.stop @change.stop="model.actions.toggleSelection(app.id, $event.target.checked)" />
            <span class="app-manager-icon">
              <img v-if="getIconSource(app)" :src="getIconSource(app)" alt="" draggable="false" />
              <span v-else>{{ app.emoji }}</span>
            </span>
            <span class="app-manager-details">
              <span class="app-manager-name">{{ app.name }}</span>
              <span class="app-manager-target">{{ model.getLaunchTargetPath(app) || "未设置启动路径" }}</span>
              <span v-if="app.launchTarget?.kind === 'executable' && app.launchArgs" class="app-manager-target">参数：{{ app.launchArgs }}</span>
            </span>
          </div>
        </div>
        <div v-else class="scan-result-empty">没有发现可添加的应用</div>
      </div>

      <footer class="scan-result-actions">
        <SettingsFluentButton appearance="outline" type="button" @click="model.actions.close">取消</SettingsFluentButton>
        <SettingsFluentButton appearance="primary" type="button" :disabled="!model.canAdd.value" @click="model.actions.addSelected">添加所选</SettingsFluentButton>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { ref } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import { getIconSource } from "../domain/iconSource.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

const props = defineProps({ model: { type: Object, required: true } });
const dialogRef = ref(null);
const isSelected = (appId) => props.model.selectedIds.value.includes(appId);

function focus() {
  focusModalElement(dialogRef);
}

defineExpose({ focus });
</script>
