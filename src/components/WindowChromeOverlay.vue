<template>
  <div v-if="active" class="window-chrome-overlay">
    <div class="window-chrome-bar" aria-label="窗口栏">
      <div
        class="window-chrome-drag-area"
        aria-label="拖动窗口"
        @pointerdown.stop
        @mousedown.left.stop="handleDragMouseDown"
        @dblclick.left.stop="handleDragAreaDoubleClick"
      >
        <span class="window-chrome-title-icon" aria-hidden="true">L</span>
        <span class="window-chrome-title-text">LaunchPad</span>
      </div>
      <div class="window-chrome-controls" @pointerdown.stop>
        <button class="window-chrome-control" type="button" aria-label="最小化窗口" title="最小化" @click.stop="handleMinimizeClick">
          <SubtractIcon class="window-chrome-control-icon" />
        </button>
        <button class="window-chrome-control" type="button" :aria-label="maximizeButtonLabel" :title="maximizeButtonLabel" @click.stop="handleMaximizeClick">
          <component :is="isWindowMaximizedState ? RestoreIcon : MaximizeIcon" class="window-chrome-control-icon" />
        </button>
        <button class="window-chrome-control window-chrome-control-close" type="button" aria-label="隐藏窗口" title="隐藏" @click.stop="handleCloseClick">
          <DismissIcon class="window-chrome-control-icon" />
        </button>
      </div>
    </div>
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
  hideWindow,
  isWindowMaximized,
  minimizeWindow,
  startWindowDrag,
  startWindowResize,
  toggleWindowMaximize,
} from "../api/windowChromeApi.js";

const props = defineProps({
  active: {
    type: Boolean,
    default: false,
  },
});

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
const maximizeButtonLabel = computed(() => (isWindowMaximizedState.value ? "向下还原窗口" : "最大化窗口"));
let windowMaximizedRefreshFrame = null;
let windowMaximizedRefreshRequest = 0;

function isPrimaryPointer(event) {
  return event.button === 0;
}

function handleWindowChromeError(action, error) {
  console.error(`Failed to ${action} LaunchPad window`, error);
}

function handleDragMouseDown(event) {
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
  hideWindow().catch((error) => handleWindowChromeError("hide", error));
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
