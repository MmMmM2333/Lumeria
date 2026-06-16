<template>
  <div v-if="active" class="window-chrome-overlay">
    <div class="window-chrome-bar" aria-label="窗口栏">
      <div
        class="window-chrome-drag-area"
        aria-label="拖动窗口"
        @pointerdown.stop
        @mousedown.left.stop="handleDragMouseDown"
      >
        <span class="window-chrome-title-icon" aria-hidden="true">L</span>
        <span class="window-chrome-title-text">LaunchPad</span>
      </div>
      <div class="window-chrome-controls" @pointerdown.stop>
        <button class="window-chrome-control" type="button" aria-label="最小化窗口" title="最小化" @click.stop="handleMinimizeClick">
          <SubtractIcon class="window-chrome-control-icon" />
        </button>
        <button class="window-chrome-control" type="button" aria-label="最大化或还原窗口" title="最大化/还原" @click.stop="handleMaximizeClick">
          <MaximizeIcon class="window-chrome-control-icon" />
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
import DismissIcon from "~icons/fluent/dismiss-16-regular";
import MaximizeIcon from "~icons/fluent/maximize-16-regular";
import SubtractIcon from "~icons/fluent/subtract-16-regular";
import {
  hideWindow,
  minimizeWindow,
  startWindowDrag,
  startWindowResize,
  toggleWindowMaximize,
} from "../api/windowChromeApi.js";

defineProps({
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

function isPrimaryPointer(event) {
  return event.button === 0;
}

function handleWindowChromeError(action, error) {
  console.error(`Failed to ${action} LaunchPad window`, error);
}

function handleDragMouseDown(event) {
  event.preventDefault();
  startWindowDrag().catch((error) => handleWindowChromeError("drag", error));
}

function handleMinimizeClick() {
  minimizeWindow().catch((error) => handleWindowChromeError("minimize", error));
}

function handleMaximizeClick() {
  toggleWindowMaximize().catch((error) => handleWindowChromeError("maximize", error));
}

function handleCloseClick() {
  hideWindow().catch((error) => handleWindowChromeError("hide", error));
}

function handleResizePointerDown(event, direction) {
  if (!isPrimaryPointer(event)) return;
  event.preventDefault();
  startWindowResize(direction).catch((error) => handleWindowChromeError("resize", error));
}
</script>
