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

  <div
    v-if="iconContextMenu"
    class="icon-context-menu-layer"
    @contextmenu.prevent
    @pointerdown.self="closeIconContextMenu"
    @wheel.capture="closeIconContextMenu"
  >
    <fluent-menu-list
      ref="iconContextMenuRef"
      class="icon-context-menu"
      :style="iconContextMenuStyle"
      role="menu"
      :aria-label="`${iconContextMenu.item.name} 菜单`"
      @keydown.esc.stop.prevent="closeIconContextMenu"
      @pointerdown.stop
    >
      <fluent-menu-item @click="runIconContextMenuAction('open')">
        <FolderOpenIcon v-if="iconContextMenu.item.type === 'folder'" slot="start" class="icon-context-menu-item-icon" />
        <OpenIcon v-else slot="start" class="icon-context-menu-item-icon" />
        打开
      </fluent-menu-item>
      <fluent-menu-item v-if="iconContextMenu.item.type === 'app'" @click="runIconContextMenuAction('edit')">
        <EditIcon slot="start" class="icon-context-menu-item-icon" />
        编辑
      </fluent-menu-item>
      <fluent-menu-item v-else @click="runIconContextMenuAction('rename')">
        <RenameIcon slot="start" class="icon-context-menu-item-icon" />
        重命名
      </fluent-menu-item>
      <fluent-divider class="icon-context-menu-divider" role="separator" />
      <fluent-menu-item v-if="iconContextMenu.item.type === 'app'" @click="runIconContextMenuAction('remove-from-launchpad')">
        <DeleteIcon slot="start" class="icon-context-menu-item-icon" />
        从启动台移除
      </fluent-menu-item>
      <fluent-menu-item
        v-if="iconContextMenu.item.type === 'app' && state.canExcludeManagedAppFromScan(iconContextMenu.item)"
        class="icon-context-menu-item-danger"
        @click="runIconContextMenuAction('exclude-from-scan')"
      >
        <DeleteDismissIcon slot="start" class="icon-context-menu-item-icon" />
        移除并从扫描中排除
      </fluent-menu-item>
      <fluent-menu-item v-if="iconContextMenu.item.type === 'folder'" class="icon-context-menu-item-danger" @click="runIconContextMenuAction('dissolve')">
        <FolderArrowRightIcon slot="start" class="icon-context-menu-item-icon" />
        解散文件夹
      </fluent-menu-item>
    </fluent-menu-list>
  </div>

</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import DeleteIcon from "~icons/fluent/delete-20-regular";
import DeleteDismissIcon from "~icons/fluent/delete-dismiss-20-regular";
import EditIcon from "~icons/fluent/edit-20-regular";
import FolderArrowRightIcon from "~icons/fluent/folder-arrow-right-20-regular";
import FolderOpenIcon from "~icons/fluent/folder-open-20-regular";
import OpenIcon from "~icons/fluent/open-20-regular";
import RenameIcon from "~icons/fluent/rename-20-regular";
import { useGsapDomMotion } from "../composables/useGsapDomMotion.js";
import { getIconSource } from "../domain/iconSource.js";
import { clampIconContextMenuPosition } from "./iconContextMenuGeometry.js";

const props = defineProps({
  state: { type: Object, required: true },
});

const emit = defineEmits(["context-menu-action"]);
const launchGhostRef = ref(null);
useGsapDomMotion(launchGhostRef, {
  initial: { opacity: 1, scale: 1 },
  motion: () => ({
    opacity: 0,
    scale: 1.92,
    duration: resolveLaunchGhostDuration(),
    ease: "power2.out",
  }),
});
const iconContextMenu = ref(null);
const iconContextMenuRef = ref(null);
let iconContextMenuRequestId = 0;
const iconContextMenuStyle = computed(() => {
  if (!iconContextMenu.value) return {};
  return {
    left: `${iconContextMenu.value.positioned ? iconContextMenu.value.x : iconContextMenu.value.anchorX}px`,
    top: `${iconContextMenu.value.positioned ? iconContextMenu.value.y : iconContextMenu.value.anchorY}px`,
    visibility: iconContextMenu.value.positioned ? "visible" : "hidden",
  };
});

async function positionIconContextMenu(requestId) {
  await nextTick();
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  const menu = iconContextMenu.value;
  const element = iconContextMenuRef.value;
  if (!menu || requestId !== iconContextMenuRequestId || !element) return;
  const rect = element.getBoundingClientRect();
  const position = clampIconContextMenuPosition({
    anchorX: menu.anchorX,
    anchorY: menu.anchorY,
    menuHeight: rect.height,
    menuWidth: rect.width,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  });
  iconContextMenu.value = {
    ...menu,
    ...position,
    positioned: true,
  };
  await nextTick();
  iconContextMenuRef.value?.querySelector("fluent-menu-item")?.focus({ preventScroll: true });
}

function openIconContextMenu(event, item, source) {
  if (!item || (item.type !== "app" && item.type !== "folder")) return false;
  iconContextMenuRequestId += 1;
  const requestId = iconContextMenuRequestId;
  iconContextMenu.value = {
    anchorX: Number(event?.clientX) || 0,
    anchorY: Number(event?.clientY) || 0,
    item,
    positioned: false,
    source,
    x: 0,
    y: 0,
  };
  void positionIconContextMenu(requestId);
  return true;
}

function closeIconContextMenu() {
  if (!iconContextMenu.value) return false;
  iconContextMenuRequestId += 1;
  iconContextMenu.value = null;
  return true;
}

function runIconContextMenuAction(action) {
  const menu = iconContextMenu.value;
  if (!menu) return;
  closeIconContextMenu();
  emit("context-menu-action", action, menu.item, menu.source);
}

onMounted(() => {
  window.addEventListener("blur", closeIconContextMenu);
  window.addEventListener("resize", closeIconContextMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener("blur", closeIconContextMenu);
  window.removeEventListener("resize", closeIconContextMenu);
});

function resolveLaunchGhostDuration() {
  const duration = Number(props.state.appLaunchGhostTransition?.duration);
  return Number.isFinite(duration) && duration >= 0 ? duration : 0.42;
}

defineExpose({
  closeIconContextMenu,
  openIconContextMenu,
});
</script>
