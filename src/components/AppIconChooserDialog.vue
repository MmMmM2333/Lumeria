<template>
  <div v-if="model.chooser.value" class="icon-chooser-overlay" @wheel.stop @pointerdown.self="model.actions.close">
    <section ref="dialogRef" class="icon-chooser-dialog" role="dialog" aria-modal="true" :aria-label="model.chooser.value.title" tabindex="-1" @keydown="handleModalKeydown($event, dialogRef, model.actions.close)">
      <header class="icon-chooser-header">
        <div>
          <h2>{{ model.chooser.value.title }}</h2>
          <p>{{ model.chooser.value.subtitle }}</p>
        </div>
        <SettingsFluentButton appearance="subtle" icon-only class="settings-close-button" type="button" aria-label="关闭图标选择" @click="model.actions.close">
          <DismissIcon class="settings-close-icon" />
        </SettingsFluentButton>
      </header>

      <div class="icon-chooser-body">
        <section class="icon-chooser-section" aria-label="应用内图标">
          <div class="icon-chooser-section-header">
            <h3>应用内图标</h3>
            <span v-if="model.choices.value.length">{{ model.choices.value.length }} 个</span>
          </div>
          <div v-if="model.isLoading.value" class="icon-chooser-empty">正在读取</div>
          <div v-else-if="model.error.value" class="icon-chooser-empty">{{ model.error.value }}</div>
          <div v-else-if="model.choices.value.length" class="icon-chooser-grid">
            <button v-for="choice in model.choices.value" :key="choice.id" class="icon-chooser-option" type="button" aria-label="选择应用内图标" @click="model.actions.choose(choice)">
              <img :src="choice.iconDataUrl" alt="" draggable="false" />
            </button>
          </div>
          <div v-else class="icon-chooser-empty">没有可用图标</div>
        </section>

        <section class="icon-chooser-section" aria-label="本地图片">
          <div class="icon-chooser-section-header"><h3>本地图片</h3></div>
          <label class="settings-secondary-button icon-chooser-upload-button">
            选择图片
            <input name="customIconFile" type="file" accept="image/*" aria-label="从硬盘选择图片" autocomplete="off" @change="model.actions.upload" />
          </label>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from "vue";
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import { focusModalElement, handleModalKeydown } from "../composables/useModalFocusTrap.js";
import SettingsFluentButton from "./settings/SettingsFluentButton.vue";

const props = defineProps({ model: { type: Object, required: true } });
const dialogRef = ref(null);

function focus() {
  focusModalElement(dialogRef);
}

defineExpose({ focus });
</script>
