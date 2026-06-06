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

  <div v-if="shouldRenderFolderGhostLayers && state.folderOpenIconGhosts.value.length" class="folder-open-icon-ghost-layer" aria-hidden="true">
    <Motion
      v-for="ghost in state.folderOpenIconGhosts.value"
      :key="ghost.key"
      class="folder-open-icon-ghost"
      :initial="state.getFolderOpenIconGhostInitial(ghost)"
      :animate="state.getFolderOpenIconGhostAnimate(ghost)"
      :transition="state.getFolderOpenIconGhostTransition(ghost)"
      :style="state.getFolderOpenIconGhostStyle(ghost)"
      @motioncomplete="state.completeFolderOpenIconGhost(ghost.key)"
    >
      <div class="icon-selection-frame folder-open-icon-ghost-frame">
        <div class="icon-hit-target folder-open-icon-ghost-hit-target">
          <div class="icon-visual-wrap">
            <div class="icon-box">
              <img v-if="getIconSource(ghost.item)" class="app-icon-image" :src="getIconSource(ghost.item)" alt="" draggable="false" />
              <span v-else class="icon-emoji">{{ ghost.item.emoji }}</span>
            </div>
            <MissingLaunchTargetBadge :status="state.showMissingLaunchTargetBadge.value ? state.launchTargetStatusById.value[ghost.item.id] : null" />
          </div>
        </div>
        <div v-if="!state.isTextlessMode.value" class="icon-name folder-open-icon-ghost-name">{{ ghost.item.name }}</div>
      </div>
    </Motion>
  </div>

  <div v-if="shouldRenderFolderGhostLayers && state.folderCloseIconGhosts.value.length" class="folder-close-icon-ghost-layer" aria-hidden="true">
    <Motion
      v-for="ghost in state.folderCloseIconGhosts.value"
      :key="ghost.key"
      class="folder-close-icon-ghost"
      :initial="state.getFolderCloseIconGhostInitial(ghost)"
      :animate="state.getFolderCloseIconGhostAnimate(ghost)"
      :transition="state.getFolderCloseIconGhostTransition(ghost)"
      :style="state.getFolderCloseIconGhostStyle(ghost)"
      @motioncomplete="state.completeFolderCloseIconGhost(ghost.key)"
    >
      <div class="icon-selection-frame folder-close-icon-ghost-frame">
        <div class="icon-hit-target folder-close-icon-ghost-hit-target">
          <div class="icon-visual-wrap">
            <div class="icon-box">
              <img v-if="getIconSource(ghost.item)" class="app-icon-image" :src="getIconSource(ghost.item)" alt="" draggable="false" />
              <span v-else class="icon-emoji">{{ ghost.item.emoji }}</span>
            </div>
            <MissingLaunchTargetBadge :status="state.showMissingLaunchTargetBadge.value ? state.launchTargetStatusById.value[ghost.item.id] : null" />
          </div>
        </div>
        <div v-if="!state.isTextlessMode.value" class="icon-name folder-close-icon-ghost-name">{{ ghost.item.name }}</div>
      </div>
    </Motion>
  </div>

  <div v-if="iconContextMenu" class="icon-context-menu-layer" @contextmenu.prevent>
    <div class="icon-context-menu" :style="iconContextMenuStyle" role="menu" :aria-label="`${iconContextMenu.app.name} 菜单`" @pointerdown.stop>
      <button type="button" role="menuitem" @click="openContextMenuApp">打开</button>
      <button type="button" role="menuitem" @click="editContextMenuApp">编辑</button>
    </div>
  </div>

</template>

<script setup>
import { Motion } from "motion-v";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import MissingLaunchTargetBadge from "./MissingLaunchTargetBadge.js";
import { getIconSource } from "../domain/iconSource.js";

const props = defineProps({
  state: { type: Object, required: true },
});

const emit = defineEmits(["open-context-app", "edit-context-app"]);
const iconContextMenu = ref(null);
const hiddenFolderGhostCompletionDelay = 650;
const hiddenFolderGhostTimers = new Map();
const shouldRenderFolderGhostLayers = computed(() => props.state.renderFolderGhostLayers !== false);
const iconContextMenuStyle = computed(() => {
  if (!iconContextMenu.value) return {};
  return {
    left: `${iconContextMenu.value.x}px`,
    top: `${iconContextMenu.value.y}px`,
  };
});

function clearHiddenFolderGhostTimer(timerKey) {
  const timer = hiddenFolderGhostTimers.get(timerKey);
  if (!timer) return;
  clearTimeout(timer);
  hiddenFolderGhostTimers.delete(timerKey);
}

function clearHiddenFolderGhostTimers() {
  for (const timerKey of hiddenFolderGhostTimers.keys()) clearHiddenFolderGhostTimer(timerKey);
}

function scheduleHiddenFolderGhostCompletions(kind, ghosts) {
  const items = Array.isArray(ghosts) ? ghosts : [];
  const activeTimerKeys = new Set(items.map((ghost) => `${kind}:${ghost.key}`));
  for (const timerKey of hiddenFolderGhostTimers.keys()) {
    if (timerKey.startsWith(`${kind}:`) && !activeTimerKeys.has(timerKey)) clearHiddenFolderGhostTimer(timerKey);
  }
  if (shouldRenderFolderGhostLayers.value) {
    for (const timerKey of activeTimerKeys) clearHiddenFolderGhostTimer(timerKey);
    return;
  }

  const complete = kind === "open" ? props.state.completeFolderOpenIconGhost : props.state.completeFolderCloseIconGhost;
  for (const ghost of items) {
    const timerKey = `${kind}:${ghost.key}`;
    if (hiddenFolderGhostTimers.has(timerKey)) continue;
    const timer = window.setTimeout(() => {
      hiddenFolderGhostTimers.delete(timerKey);
      complete?.(ghost.key);
    }, hiddenFolderGhostCompletionDelay);
    hiddenFolderGhostTimers.set(timerKey, timer);
  }
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

watch(
  () => props.state.folderOpenIconGhosts.value,
  (ghosts) => scheduleHiddenFolderGhostCompletions("open", ghosts),
  { immediate: true }
);

watch(
  () => props.state.folderCloseIconGhosts.value,
  (ghosts) => scheduleHiddenFolderGhostCompletions("close", ghosts),
  { immediate: true }
);

watch(shouldRenderFolderGhostLayers, () => {
  scheduleHiddenFolderGhostCompletions("open", props.state.folderOpenIconGhosts.value);
  scheduleHiddenFolderGhostCompletions("close", props.state.folderCloseIconGhosts.value);
});

onBeforeUnmount(clearHiddenFolderGhostTimers);

defineExpose({
  closeIconContextMenu,
  openIconContextMenu,
});
</script>
