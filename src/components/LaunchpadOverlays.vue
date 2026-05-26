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
      <img v-if="getIconSource(state.launchGhost.value.app)" class="app-launch-ghost-image" :src="getIconSource(state.launchGhost.value.app)" alt="" draggable="false" />
      <span v-else class="app-launch-ghost-emoji">{{ state.launchGhost.value.app.emoji }}</span>
    </div>
  </Motion>

  <div v-if="iconContextMenu" class="icon-context-menu-layer" @contextmenu.prevent>
    <div class="icon-context-menu" :style="iconContextMenuStyle" role="menu" :aria-label="`${iconContextMenu.app.name} 菜单`" @pointerdown.stop>
      <button type="button" role="menuitem" @click="openContextMenuApp">打开</button>
      <button type="button" role="menuitem" @click="editContextMenuApp">编辑</button>
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
          <img v-if="getIconSource(child)" class="drag-folder-child-image" :src="getIconSource(child)" alt="" draggable="false" />
          <span v-else-if="child">{{ child.emoji }}</span>
        </div>
      </div>
      <img v-else-if="getIconSource(state.dragMeta.value.item)" class="drag-preview-image" :src="getIconSource(state.dragMeta.value.item)" alt="" draggable="false" />
      <span v-else class="drag-preview-emoji">{{ state.dragMeta.value.item.emoji }}</span>
    </div>
    <div v-if="!state.isTextlessMode.value" class="drag-preview-name">{{ state.dragMeta.value.item.name }}</div>
  </Motion>
</template>

<script setup>
import { Motion } from "motion-v";
import { computed, ref } from "vue";
import { getIconSource } from "../domain/iconSource.js";
import { cx } from "../domain/launchpadLayout.js";

defineProps({
  state: { type: Object, required: true },
});

const emit = defineEmits(["open-context-app", "edit-context-app"]);
const iconContextMenu = ref(null);
const iconContextMenuStyle = computed(() => {
  if (!iconContextMenu.value) return {};
  return {
    left: `${iconContextMenu.value.x}px`,
    top: `${iconContextMenu.value.y}px`,
  };
});

function bindRef(target, node) {
  if (target && typeof target === "object" && "value" in target) target.value = node;
}

function openIconContextMenu(event, app, source) {
  if (!app || app.type !== "app") return false;
  const menuWidth = 172;
  const menuHeight = 116;
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - menuWidth - margin);
  const maxY = Math.max(margin, window.innerHeight - menuHeight - margin);
  iconContextMenu.value = {
    app,
    source,
    x: Math.min(Math.max(event.clientX, margin), maxX),
    y: Math.min(Math.max(event.clientY, margin), maxY),
  };
  return true;
}

function closeIconContextMenu() {
  if (!iconContextMenu.value) return false;
  iconContextMenu.value = null;
  return true;
}

function openContextMenuApp() {
  const menu = iconContextMenu.value;
  if (!menu) return;
  closeIconContextMenu();
  emit("open-context-app", menu.app, menu.source);
}

function editContextMenuApp() {
  const menu = iconContextMenu.value;
  if (!menu) return;
  closeIconContextMenu();
  emit("edit-context-app", menu.app);
}

defineExpose({
  closeIconContextMenu,
  openIconContextMenu,
});
</script>
