<template>
  <Motion
    v-if="state.launchGhost.value"
    key="app-launch-ghost"
    class="app-launch-ghost"
    :initial="{ opacity: 1, scale: 1 }"
    :animate="{ opacity: 0, scale: 1.92 }"
    :transition="state.appLaunchGhostTransition"
    :style="state.launchGhostStyle.value"
  >
    <div class="app-launch-ghost-box">
      <img v-if="state.getIconSource(state.launchGhost.value.app)" class="app-launch-ghost-image" :src="state.getIconSource(state.launchGhost.value.app)" alt="" draggable="false" />
      <span v-else class="app-launch-ghost-emoji">{{ state.launchGhost.value.app.emoji }}</span>
    </div>
  </Motion>

  <div v-if="state.iconContextMenu.value" class="icon-context-menu-layer" @contextmenu.prevent>
    <div class="icon-context-menu" :style="state.iconContextMenuStyle.value" role="menu" :aria-label="`${state.iconContextMenu.value.app.name} 菜单`" @pointerdown.stop>
      <button type="button" role="menuitem" @click="$emit('open-context-app')">打开</button>
      <button type="button" role="menuitem" @click="$emit('edit-context-app')">编辑</button>
    </div>
  </div>

  <Motion
    v-if="state.dragMeta.value"
    key="drag-preview"
    :ref="(node) => bindRef(state.dragPreviewRef, node)"
    class="drag-preview"
    :initial="{ opacity: 0 }"
    :animate="{ opacity: 1 }"
    :transition="state.dragPreviewSpring"
  >
    <div class="drag-preview-box">
      <div v-if="state.dragMeta.value.item.type === 'folder'" class="drag-folder-thumb">
        <div
          v-for="(child, index) in state.folderPreviewSlots(state.dragMeta.value.item)"
          :key="child ? child.id : `drag-folder-empty-${index}`"
          :class="cx('drag-folder-child', !child && 'folder-child-empty')"
        >
          <img v-if="state.getIconSource(child)" class="drag-folder-child-image" :src="state.getIconSource(child)" alt="" draggable="false" />
          <span v-else-if="child">{{ child.emoji }}</span>
        </div>
      </div>
      <img v-else-if="state.getIconSource(state.dragMeta.value.item)" class="drag-preview-image" :src="state.getIconSource(state.dragMeta.value.item)" alt="" draggable="false" />
      <span v-else class="drag-preview-emoji">{{ state.dragMeta.value.item.emoji }}</span>
    </div>
    <div v-if="!state.isTextlessMode.value" class="drag-preview-name">{{ state.dragMeta.value.item.name }}</div>
  </Motion>
</template>

<script setup>
import { Motion } from "motion-v";
import { cx } from "../domain/launchpadLayout.js";

defineProps({
  state: { type: Object, required: true },
});

defineEmits(["open-context-app", "edit-context-app"]);

function bindRef(target, node) {
  if (target && typeof target === "object" && "value" in target) target.value = node;
}
</script>
