<template>
  <div v-if="active" class="window-chrome-overlay">
    <div v-if="showTitlebar" class="window-chrome-bar" :aria-label="t('window.chrome.bar')">
      <div
        class="window-chrome-drag-area"
        :aria-label="t('window.chrome.drag')"
        @pointerdown.stop="handleDragPointerDown"
        @dblclick.left.stop="handleDragAreaDoubleClick"
      >
        <span class="window-chrome-title-icon" aria-hidden="true">L</span>
        <span class="window-chrome-title-text">Lumeria</span>
      </div>
      <div class="window-chrome-controls" @pointerdown.stop>
        <button class="window-chrome-control" type="button" :aria-label="t('window.chrome.minimize')" :title="t('window.chrome.minimize')" @click.stop="handleMinimizeClick">
          <SubtractIcon class="window-chrome-control-icon" />
        </button>
        <button class="window-chrome-control" type="button" :aria-label="maximizeButtonLabel" :title="maximizeButtonLabel" @click.stop="handleMaximizeClick">
          <component :is="isWindowMaximizedState ? RestoreIcon : MaximizeIcon" class="window-chrome-control-icon" />
        </button>
        <button class="window-chrome-control window-chrome-control-close" type="button" :aria-label="t('window.chrome.hide')" :title="t('window.chrome.hide')" @click.stop="handleCloseClick">
          <DismissIcon class="window-chrome-control-icon" />
        </button>
      </div>
    </div>
    <div
      v-else
      class="window-chrome-drag-strip"
      :aria-label="t('window.chrome.drag')"
      @pointerdown.stop="handleDragPointerDown"
      @dblclick.left.stop="handleDragAreaDoubleClick"
    />
    <div
      v-for="handle in resizeHandles"
      :key="handle.direction"
      :class="['window-chrome-resize-handle', `window-chrome-resize-${handle.className}`]"
      @pointerdown.stop="handleResizePointerDown($event, handle.direction)"
    />
  </div>
</template>

<script setup>
import DismissIcon from "~icons/fluent/dismiss-24-regular";
import MaximizeIcon from "~icons/fluent/maximize-24-regular";
import RestoreIcon from "~icons/fluent/square-multiple-24-regular";
import SubtractIcon from "~icons/fluent/subtract-24-regular";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  emitWindowChromeStateChange,
  isWindowMaximized,
  minimizeWindow,
  startWindowDrag,
  startWindowResize,
  toggleWindowMaximize,
} from "../api/windowChromeApi.js";
import { useLocalization } from "../i18n/localization.js";

const props = defineProps({
  active: {
    type: Boolean,
    default: false,
  },
  showTitlebar: {
    type: Boolean,
    default: true,
  },
});
const emit = defineEmits(["request-close"]);

const resizeHandles = Object.freeze([
  { className: "north", direction: "North" },
  { className: "south", direction: "South" },
  { className: "west", direction: "West" },
  { className: "east", direction: "East" },
  { className: "north-west", direction: "NorthWest" },
  { className: "north-east", direction: "NorthEast" },
  { className: "south-west", direction: "SouthWest" },
  { className: "south-east", direction: "SouthEast" },
]);

const isWindowMaximizedState = ref(false);
const { t } = useLocalization();
const maximizeButtonLabel = computed(() => (
  isWindowMaximizedState.value ? t("window.chrome.restore") : t("window.chrome.maximize")
));
let windowMaximizedRefreshFrame = null;
let windowMaximizedRefreshRequest = 0;

function isPrimaryPointer(event) {
  return event.isPrimary !== false && event.button === 0;
}

function handleWindowChromeError(action, error) {
  console.error(`Failed to ${action} Lumeria window`, error);
}

function handleDragPointerDown(event) {
  if (!isPrimaryPointer(event)) return;
  event.preventDefault();
  if (event.detail > 1) return;
  startWindowDrag().catch((error) => handleWindowChromeError("drag", error));
}

function handleMinimizeClick() {
  minimizeWindow().catch((error) => handleWindowChromeError("minimize", error));
}

async function toggleMaximizeAndRefresh() {
  const didToggle = await toggleWindowMaximize();
  if (!didToggle) return;
  emitWindowChromeStateChange({ reason: "maximize-toggle" });
  await refreshWindowMaximized();
  emitWindowChromeStateChange({ reason: "maximize-state-refresh" });
}

function handleMaximizeClick() {
  toggleMaximizeAndRefresh().catch((error) => handleWindowChromeError("maximize", error));
}

function handleDragAreaDoubleClick(event) {
  event.preventDefault();
  toggleMaximizeAndRefresh().catch((error) => handleWindowChromeError("maximize", error));
}

function handleCloseClick() {
  emit("request-close");
}

function handleResizePointerDown(event, direction) {
  if (!isPrimaryPointer(event)) return;
  event.preventDefault();
  startWindowResize(direction).catch((error) => handleWindowChromeError("resize", error));
}

async function refreshWindowMaximized() {
  const request = ++windowMaximizedRefreshRequest;
  const nextIsMaximized = await isWindowMaximized();
  if (request === windowMaximizedRefreshRequest) {
    isWindowMaximizedState.value = nextIsMaximized;
  }
}

function scheduleWindowMaximizedRefresh() {
  if (!props.active) return;
  if (typeof window === "undefined") {
    refreshWindowMaximized().catch((error) => handleWindowChromeError("read maximize state", error));
    return;
  }
  if (windowMaximizedRefreshFrame !== null) return;
  windowMaximizedRefreshFrame = window.requestAnimationFrame(() => {
    windowMaximizedRefreshFrame = null;
    refreshWindowMaximized().catch((error) => handleWindowChromeError("read maximize state", error));
  });
}

onMounted(() => {
  if (typeof window !== "undefined") {
    window.addEventListener("resize", scheduleWindowMaximizedRefresh);
  }
  scheduleWindowMaximizedRefresh();
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", scheduleWindowMaximizedRefresh);
    if (windowMaximizedRefreshFrame !== null) {
      window.cancelAnimationFrame(windowMaximizedRefreshFrame);
    }
  }
  windowMaximizedRefreshFrame = null;
});

watch(
  () => props.active,
  (isActive) => {
    if (isActive) scheduleWindowMaximizedRefresh();
  }
);
</script>
