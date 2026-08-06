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
    v-if="contextMenu"
    ref="contextMenuThemeHostRef"
    class="icon-context-menu-layer settings-theme-scope"
    :data-settings-theme="state.resolvedSettingsTheme.value"
    @contextmenu.self.stop.prevent="requestContextMenuAtPointer"
    @pointerdown.self.stop="handleContextMenuLayerPointerDown"
    @wheel.capture="closeContextMenu"
  >
    <fluent-menu-list
      ref="contextMenuRef"
      class="icon-context-menu"
      :style="contextMenuStyle"
      role="menu"
      :aria-label="contextMenuAriaLabel"
      @contextmenu.stop.prevent
      @keydown.esc.stop.prevent="closeContextMenu"
      @pointerdown.stop
    >
      <template v-if="contextMenu.kind === 'icon'">
        <fluent-menu-item @click="runContextMenuAction('open')">
          <FolderOpenIcon v-if="contextMenu.item.type === 'folder'" slot="start" class="icon-context-menu-item-icon" />
          <OpenIcon v-else slot="start" class="icon-context-menu-item-icon" />
          {{ t("common.actions.open") }}
        </fluent-menu-item>
        <fluent-menu-item v-if="contextMenu.item.type === 'app'" @click="runContextMenuAction('edit')">
          <EditIcon slot="start" class="icon-context-menu-item-icon" />
          {{ t("common.actions.edit") }}
        </fluent-menu-item>
        <fluent-menu-item v-else @click="runContextMenuAction('rename')">
          <RenameIcon slot="start" class="icon-context-menu-item-icon" />
          {{ t("common.actions.rename") }}
        </fluent-menu-item>
        <fluent-divider class="icon-context-menu-divider" role="separator" />
        <fluent-menu-item v-if="contextMenu.item.type === 'app'" @click="runContextMenuAction('remove-from-launchpad')">
          <DeleteIcon slot="start" class="icon-context-menu-item-icon" />
          {{ t("launchpad.contextMenu.remove") }}
        </fluent-menu-item>
        <fluent-menu-item
          v-if="contextMenu.item.type === 'app' && state.canExcludeManagedAppFromScan(contextMenu.item)"
          class="icon-context-menu-item-danger"
          @click="runContextMenuAction('exclude-from-scan')"
        >
          <DeleteDismissIcon slot="start" class="icon-context-menu-item-icon" />
          {{ t("launchpad.contextMenu.exclude") }}
        </fluent-menu-item>
        <fluent-menu-item v-if="contextMenu.item.type === 'folder'" class="icon-context-menu-item-danger" @click="runContextMenuAction('dissolve')">
          <FolderArrowRightIcon slot="start" class="icon-context-menu-item-icon" />
          {{ t("launchpad.contextMenu.dissolve") }}
        </fluent-menu-item>
      </template>
      <template v-else>
        <fluent-menu-item @click="runContextMenuAction('compact-pages')">
          <ArrowSortIcon slot="start" class="icon-context-menu-item-icon" />
          {{ t("settings.interface.layout.compactAction") }}
        </fluent-menu-item>
        <fluent-menu-item
          v-if="isSurfaceScanAvailable(contextMenu)"
          :disabled="isSurfaceScanRunning(contextMenu)"
          @click="runContextMenuAction('scan-apps')"
        >
          <ScanObjectIcon slot="start" class="icon-context-menu-item-icon" />
          {{ isSurfaceScanRunning(contextMenu) ? t("settings.apps.manager.scanning") : t("settings.apps.manager.scanApps") }}
        </fluent-menu-item>
        <fluent-divider v-if="isSurfaceScanAvailable(contextMenu)" class="icon-context-menu-divider" role="separator" />
        <fluent-menu-item @click="runContextMenuAction('open-settings')">
          <SettingsIcon slot="start" class="icon-context-menu-item-icon" />
          {{ t("launchpad.openSettings") }}
        </fluent-menu-item>
      </template>
    </fluent-menu-list>
  </div>

</template>

<script setup>
import { setTheme } from "@fluentui/web-components";
import { webDarkTheme, webLightTheme } from "@fluentui/tokens";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ArrowSortIcon from "~icons/fluent/arrow-sort-20-regular";
import DeleteIcon from "~icons/fluent/delete-20-regular";
import DeleteDismissIcon from "~icons/fluent/delete-dismiss-20-regular";
import EditIcon from "~icons/fluent/edit-20-regular";
import FolderArrowRightIcon from "~icons/fluent/folder-arrow-right-20-regular";
import FolderOpenIcon from "~icons/fluent/folder-open-20-regular";
import OpenIcon from "~icons/fluent/open-20-regular";
import RenameIcon from "~icons/fluent/rename-20-regular";
import ScanObjectIcon from "~icons/fluent/scan-object-20-regular";
import SettingsIcon from "~icons/fluent/settings-20-regular";
import { useGsapDomMotion } from "../composables/useGsapDomMotion.js";
import { getIconSource } from "../domain/iconSource.js";
import { useLocalization } from "../i18n/localization.js";
import { clampIconContextMenuPosition } from "./iconContextMenuGeometry.js";

const props = defineProps({
  state: { type: Object, required: true },
});

const emit = defineEmits(["context-menu-action", "context-menu-request"]);
const { t } = useLocalization();
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
const contextMenu = ref(null);
const contextMenuRef = ref(null);
const contextMenuThemeHostRef = ref(null);
let contextMenuRequestId = 0;
let themedContextMenuHost = null;
const contextMenuStyle = computed(() => {
  if (!contextMenu.value) return {};
  return {
    left: `${contextMenu.value.positioned ? contextMenu.value.x : contextMenu.value.anchorX}px`,
    top: `${contextMenu.value.positioned ? contextMenu.value.y : contextMenu.value.anchorY}px`,
    visibility: contextMenu.value.positioned ? "visible" : "hidden",
  };
});
const contextMenuAriaLabel = computed(() => {
  if (!contextMenu.value) return "";
  if (contextMenu.value.kind === "surface") return t("launchpad.contextMenu.surfaceLabel");
  return t("launchpad.contextMenu.label", { name: contextMenu.value.item.name });
});

async function positionContextMenu(requestId) {
  await nextTick();
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  const menu = contextMenu.value;
  const element = contextMenuRef.value;
  if (!menu || requestId !== contextMenuRequestId || !element) return;
  const rect = element.getBoundingClientRect();
  const position = clampIconContextMenuPosition({
    anchorX: menu.anchorX,
    anchorY: menu.anchorY,
    menuHeight: rect.height,
    menuWidth: rect.width,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  });
  contextMenu.value = {
    ...menu,
    ...position,
    positioned: true,
  };
  await nextTick();
  contextMenuRef.value?.querySelector("fluent-menu-item")?.focus({ preventScroll: true });
}

function openIconContextMenu(event, item, source) {
  if (!item || (item.type !== "app" && item.type !== "folder")) return false;
  contextMenuRequestId += 1;
  const requestId = contextMenuRequestId;
  contextMenu.value = {
    kind: "icon",
    anchorX: Number(event?.clientX) || 0,
    anchorY: Number(event?.clientY) || 0,
    item,
    positioned: false,
    source,
    x: 0,
    y: 0,
  };
  void positionContextMenu(requestId);
  return true;
}

function openSurfaceContextMenu(event, capabilities = {}) {
  contextMenuRequestId += 1;
  const requestId = contextMenuRequestId;
  contextMenu.value = {
    kind: "surface",
    anchorX: Number(event?.clientX) || 0,
    anchorY: Number(event?.clientY) || 0,
    capabilities: {
      canScan: capabilities?.canScan ?? false,
      isScanning: capabilities?.isScanning ?? false,
    },
    positioned: false,
    x: 0,
    y: 0,
  };
  void positionContextMenu(requestId);
  return true;
}

function closeContextMenu() {
  if (!contextMenu.value) return false;
  contextMenuRequestId += 1;
  contextMenu.value = null;
  return true;
}

function handleContextMenuLayerPointerDown(event) {
  if (event?.button === 0) closeContextMenu();
}

function requestContextMenuAtPointer(event) {
  emit("context-menu-request", event);
}

function runContextMenuAction(action) {
  const menu = contextMenu.value;
  if (!menu) return;
  closeContextMenu();
  emit("context-menu-action", {
    action,
    item: menu.item || null,
    kind: menu.kind,
    source: menu.source || null,
  });
}

function resolveMaybeRef(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

function isSurfaceScanAvailable(menu) {
  return Boolean(resolveMaybeRef(menu?.capabilities?.canScan));
}

function isSurfaceScanRunning(menu) {
  return Boolean(resolveMaybeRef(menu?.capabilities?.isScanning));
}

watch([contextMenuThemeHostRef, props.state.resolvedSettingsTheme], ([host, theme]) => {
  if (themedContextMenuHost && themedContextMenuHost !== host) {
    setTheme(null, themedContextMenuHost);
  }
  themedContextMenuHost = host;
  if (host) setTheme(theme === "light" ? webLightTheme : webDarkTheme, host);
}, { flush: "post" });

onMounted(() => {
  window.addEventListener("blur", closeContextMenu);
  window.addEventListener("resize", closeContextMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener("blur", closeContextMenu);
  window.removeEventListener("resize", closeContextMenu);
  if (themedContextMenuHost) setTheme(null, themedContextMenuHost);
  themedContextMenuHost = null;
});

function resolveLaunchGhostDuration() {
  const duration = Number(props.state.appLaunchGhostTransition?.duration);
  return Number.isFinite(duration) && duration >= 0 ? duration : 0.42;
}

defineExpose({
  closeContextMenu,
  openIconContextMenu,
  openSurfaceContextMenu,
});
</script>
