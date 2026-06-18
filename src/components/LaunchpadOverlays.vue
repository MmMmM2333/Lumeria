<template>
  <div
    v-if="state.launchGhost.value"
    key="app-launch-ghost"
    ref="launchGhostRef"
    class="app-launch-ghost"
    :style="state.launchGhostStyle.value"
  >
    <div class="app-launch-ghost-box">
      <img v-if="getIconSource(state.launchGhost.value.app)" class="app-launch-ghost-image" :src="getIconSource(state.launchGhost.value.app)" alt="" draggable="false" />
      <span v-else class="app-launch-ghost-emoji">{{ state.launchGhost.value.app.emoji }}</span>
    </div>
  </div>

  <div v-if="iconContextMenu" class="icon-context-menu-layer" @contextmenu.prevent>
    <div class="icon-context-menu" :style="iconContextMenuStyle" role="menu" :aria-label="`${iconContextMenu.app.name} 菜单`" @pointerdown.stop>
      <button type="button" role="menuitem" @click="openContextMenuApp">打开</button>
      <button type="button" role="menuitem" @click="editContextMenuApp">编辑</button>
    </div>
  </div>

</template>

<script setup>
import { gsap } from "gsap";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { getIconSource } from "../domain/iconSource.js";

const props = defineProps({
  state: { type: Object, required: true },
});

const emit = defineEmits(["open-context-app", "edit-context-app"]);
const launchGhostRef = ref(null);
const iconContextMenu = ref(null);
const iconContextMenuStyle = computed(() => {
  if (!iconContextMenu.value) return {};
  return {
    left: `${iconContextMenu.value.x}px`,
    top: `${iconContextMenu.value.y}px`,
  };
});

watch(
  launchGhostRef,
  (node, previousNode) => {
    if (previousNode && previousNode !== node) gsap.killTweensOf(previousNode);
    if (!node) return;
    gsap.set(node, { opacity: 1, scale: 1 });
    gsap.to(node, {
      opacity: 0,
      scale: 1.92,
      duration: resolveLaunchGhostDuration(),
      ease: "power2.out",
      overwrite: "auto",
    });
  },
  { flush: "post" }
);

onBeforeUnmount(() => {
  if (launchGhostRef.value) gsap.killTweensOf(launchGhostRef.value);
});

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

function resolveLaunchGhostDuration() {
  const duration = Number(props.state.appLaunchGhostTransition?.duration);
  return Number.isFinite(duration) && duration >= 0 ? duration : 0.42;
}

defineExpose({
  closeIconContextMenu,
  openIconContextMenu,
});
</script>
