<template>
  <div v-if="model.isOpen.value" class="app-edit-overlay" @wheel.stop @pointerdown.self="model.actions.cancel">
    <section
      ref="dialogRef"
      class="app-edit-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="isEditing ? '编辑应用' : '新增应用'"
      tabindex="-1"
      @keydown="handleModalKeydown($event, dialogRef, model.actions.cancel)"
    >
      <header class="app-edit-header">
        <div>
          <h2>{{ isEditing ? "编辑应用" : "新增应用" }}</h2>
          <p v-if="!isEditing">添加自定义应用到启动台</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" :aria-label="isEditing ? '关闭编辑窗口' : '关闭新增窗口'" @click="model.actions.cancel">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="app-edit-body">
        <div class="app-edit-icon-row">
          <span class="app-edit-icon">
            <img v-if="iconSource" :src="iconSource" alt="" draggable="false" />
            <span v-else>{{ model.glyph.value }}</span>
          </span>
          <div class="app-edit-icon-actions">
            <SettingsFluentButton appearance="outline" type="button" @click="model.actions.openIconChooser">更换图标</SettingsFluentButton>
            <SettingsFluentButton appearance="subtle" type="button" @click="model.actions.resetIcon">恢复默认</SettingsFluentButton>
          </div>
        </div>

        <label class="app-edit-field">
          <span>应用名称</span>
          <fluent-text-input
            class="settings-text-input app-edit-input"
            name="managedAppName"
            maxlength="64"
            aria-label="应用名称"
            autocomplete="off"
            :value.prop="model.name.value"
            @input="model.name.value = $event.target.value"
          />
        </label>
        <label class="app-edit-field">
          <span>{{ model.targetReadOnly.value ? "Windows 应用标识（由系统管理）" : "启动路径或 URL" }}</span>
          <span class="app-edit-target-row">
            <fluent-text-input
              class="settings-text-input app-edit-input"
              name="managedAppTarget"
              :aria-label="model.targetReadOnly.value ? 'Windows 应用标识' : '启动路径或 URL'"
              autocomplete="off"
              :value.prop="model.target.value"
              :disabled="model.targetReadOnly.value"
              @input="model.target.value = $event.target.value"
            />
            <SettingsFluentButton appearance="outline" type="button" :disabled="!model.canBrowseTarget.value" @click="model.actions.browseTarget">
              {{ model.isBrowsingTarget.value ? "选择中" : "浏览" }}
            </SettingsFluentButton>
          </span>
        </label>
        <label v-if="model.canEditArgs.value" class="app-edit-field">
          <span>启动参数</span>
          <fluent-text-input
            class="settings-text-input app-edit-input"
            name="managedAppArgs"
            aria-label="启动参数"
            autocomplete="off"
            :value.prop="model.args.value"
            @input="model.args.value = $event.target.value"
          />
        </label>
      </div>

      <footer class="app-edit-actions">
        <SettingsFluentButton appearance="outline" type="button" @click="model.actions.cancel">取消</SettingsFluentButton>
        <SettingsFluentButton appearance="primary" type="button" :disabled="!model.canSave.value" @click="model.actions.save">保存</SettingsFluentButton>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import { getDefaultIconSource, getIconSource } from "../domain/iconSource.js";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

const props = defineProps({ model: { type: Object, required: true } });
const dialogRef = ref(null);
const isEditing = computed(() => props.model.mode.value === "edit");
const iconSource = computed(() => {
  if (props.model.iconDataUrl.value) return props.model.iconDataUrl.value;
  if (!isEditing.value) return null;
  if (props.model.isIconReset.value) return getDefaultIconSource(props.model.app.value);
  return getIconSource(props.model.app.value);
});

function focus() {
  focusModalElement(dialogRef);
}

defineExpose({ focus });
</script>
