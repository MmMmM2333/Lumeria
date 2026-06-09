<template>
  <section class="background-debug-panel" aria-label="Acrylic debug panel">
    <header class="background-debug-header">
      <div class="background-debug-title">
        <strong>Acrylic Debug</strong>
        <span>dev only</span>
      </div>
      <button type="button" class="background-debug-button" @click="isCollapsed = !isCollapsed">
        {{ isCollapsed ? "展开" : "收起" }}
      </button>
    </header>

    <div v-if="!isCollapsed" class="background-debug-body">
      <label class="background-debug-toggle">
        <input
          name="acrylicDebugOverride"
          type="checkbox"
          :checked="isOverrideEnabled"
          @change="setAcrylicDebugOverrideEnabled($event.target.checked)"
        >
        <span>覆盖设置</span>
      </label>

      <label
        v-for="slider in sliders"
        :key="slider.key"
        class="background-debug-control"
      >
        <span>
          {{ slider.label }}
          <output>{{ formatValue(params[slider.key], slider.digits) }}</output>
        </span>
        <input
          type="range"
          :min="slider.min"
          :max="slider.max"
          :step="slider.step"
          :value="params[slider.key]"
          @input="updateNumber(slider.key, $event)"
        >
      </label>

      <label class="background-debug-control background-debug-color-control">
        <span>
          tintColor
          <output>{{ tintHex }}</output>
        </span>
        <input type="color" :value="tintHex" @input="updateTintColor">
      </label>

      <div class="background-debug-actions">
        <button type="button" class="background-debug-button" @click="resetAcrylicDebugParams">
          重置
        </button>
        <button type="button" class="background-debug-button" @click="copyParams">
          {{ copyButtonLabel }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import {
  formatAcrylicDebugParams,
  hexToRgbArray,
  resetAcrylicDebugParams,
  rgbArrayToHex,
  setAcrylicDebugOverrideEnabled,
  useAcrylicDebugOverrideEnabled,
  updateAcrylicDebugParams,
  useAcrylicDebugParams,
} from "../rendering/pixi/background/acrylicDebugParams.js";

const params = useAcrylicDebugParams();
const isOverrideEnabled = useAcrylicDebugOverrideEnabled();
const isCollapsed = ref(false);
const hasCopied = ref(false);
let copyStateTimer = null;

const sliders = [
  { key: "saturation", label: "saturation", min: 0.8, max: 1.8, step: 0.01, digits: 2 },
  { key: "contrast", label: "contrast", min: 0.75, max: 1.25, step: 0.01, digits: 2 },
  { key: "brightness", label: "brightness", min: 0.5, max: 1.2, step: 0.01, digits: 2 },
  { key: "tintStrength", label: "tintStrength", min: 0, max: 0.6, step: 0.01, digits: 2 },
  { key: "noise", label: "noise", min: 0, max: 0.06, step: 0.001, digits: 3 },
  { key: "seed", label: "seed", min: 0, max: 100, step: 0.01, digits: 2 },
];

const tintHex = computed(() => rgbArrayToHex(params.tintColor));
const copyButtonLabel = computed(() => (hasCopied.value ? "已复制" : "复制 JSON"));

function formatValue(value, digits) {
  return Number(value).toFixed(digits);
}

function updateNumber(key, event) {
  updateAcrylicDebugParams({ [key]: Number(event.target.value) });
}

function updateTintColor(event) {
  updateAcrylicDebugParams({
    tintColor: hexToRgbArray(event.target.value, params.tintColor),
  });
}

async function copyParams() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
    await navigator.clipboard.writeText(formatAcrylicDebugParams());
    hasCopied.value = true;
    if (copyStateTimer != null) window.clearTimeout(copyStateTimer);
    copyStateTimer = window.setTimeout(() => {
      copyStateTimer = null;
      hasCopied.value = false;
    }, 1200);
  } catch (error) {
    console.warn("Failed to copy Acrylic debug params", error);
  }
}

onBeforeUnmount(() => {
  if (copyStateTimer != null) window.clearTimeout(copyStateTimer);
});
</script>

<style scoped>
.background-debug-panel {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 132;
  width: 300px;
  max-width: calc(100vw - 36px);
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(24, 28, 36, 0.9);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(22px) saturate(120%);
  -webkit-backdrop-filter: blur(22px) saturate(120%);
}

.background-debug-header,
.background-debug-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.background-debug-title {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.background-debug-title strong {
  font-size: 13px;
  line-height: 1.2;
}

.background-debug-title span {
  color: rgba(255, 255, 255, 0.48);
  font-size: 11px;
  line-height: 1.2;
}

.background-debug-body {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.background-debug-control {
  display: grid;
  gap: 6px;
}

.background-debug-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  line-height: 1.2;
}

.background-debug-toggle input {
  accent-color: rgba(255, 255, 255, 0.92);
}

.background-debug-control span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  line-height: 1.2;
}

.background-debug-control output {
  color: rgba(255, 255, 255, 0.92);
  font-variant-numeric: tabular-nums;
}

.background-debug-control input[type="range"] {
  width: 100%;
  height: 18px;
  min-width: 0;
  padding: 0;
  accent-color: rgba(255, 255, 255, 0.92);
  background: transparent;
}

.background-debug-color-control {
  grid-template-columns: minmax(0, 1fr) 34px;
  align-items: center;
}

.background-debug-color-control span {
  min-width: 0;
}

.background-debug-color-control input[type="color"] {
  width: 34px;
  height: 28px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
}

.background-debug-button {
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.86);
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.background-debug-button:hover {
  color: white;
  background: rgba(255, 255, 255, 0.16);
}

@media (max-width: 760px) {
  .background-debug-panel {
    right: 14px;
    bottom: 14px;
    width: calc(100vw - 28px);
  }
}
</style>
