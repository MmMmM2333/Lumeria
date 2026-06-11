<template>
  <section
    class="background-debug-panel"
    aria-label="Background debug panel"
    @click.stop
    @contextmenu.stop
    @pointerdown.stop
    @wheel.stop
  >
    <header class="background-debug-header">
      <div class="background-debug-title">
        <strong>Background Debug</strong>
        <span>dev only</span>
      </div>
      <button type="button" class="background-debug-button" @click="isCollapsed = !isCollapsed">
        {{ isCollapsed ? "展开" : "收起" }}
      </button>
    </header>

    <div v-if="!isCollapsed" class="background-debug-body">
      <div class="background-debug-tabs" role="tablist" aria-label="Background debug sections">
        <button
          type="button"
          :class="['background-debug-tab', activePanel === 'acrylic' && 'background-debug-tab-active']"
          @click="activePanel = 'acrylic'"
        >
          Acrylic
        </button>
        <button
          type="button"
          :class="['background-debug-tab', activePanel === 'liveDesktop' && 'background-debug-tab-active']"
          @click="activePanel = 'liveDesktop'"
        >
          Live Desktop
        </button>
      </div>

      <div v-if="activePanel === 'acrylic'" class="background-debug-section">
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
            {{ acrylicCopyButtonLabel }}
          </button>
        </div>
      </div>

      <div v-else class="background-debug-section">
        <dl class="background-debug-status-grid">
          <div
            v-for="row in liveDesktopStatusRows"
            :key="row.label"
            :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
          >
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>

        <pre class="background-debug-detail" :title="liveDesktopStatus.detail">{{ liveDesktopStatus.detail || "no detail" }}</pre>

        <div class="background-debug-mode-group" role="group" aria-label="Live desktop diagnostic mode">
          <button
            type="button"
            :class="['background-debug-mode-button', liveDesktopMode === 'capture' && 'background-debug-mode-button-active']"
            :disabled="isLiveDesktopActionBusy"
            @click="setLiveDesktopDiagnosticMode('capture')"
          >
            Capture
          </button>
          <button
            type="button"
            :class="['background-debug-mode-button', liveDesktopMode === 'testPattern' && 'background-debug-mode-button-active']"
            :disabled="isLiveDesktopActionBusy"
            @click="setLiveDesktopDiagnosticMode('testPattern')"
          >
            Test Pattern
          </button>
        </div>

        <dl class="background-debug-diagnostics">
          <div
            v-for="row in liveDesktopDiagnosticsRows"
            :key="row.label"
            :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
          >
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>

        <div v-if="liveDesktopLastError" class="background-debug-error" :title="liveDesktopLastError">
          {{ liveDesktopLastError }}
        </div>

        <div class="background-debug-actions background-debug-live-actions">
          <button type="button" class="background-debug-button" @click="refreshLiveDesktopRuntimeStatus">
            刷新
          </button>
          <button
            type="button"
            class="background-debug-button"
            :disabled="isLiveDesktopActionBusy"
            @click="reconfigureLiveDesktopRuntime"
          >
            {{ isLiveDesktopActionBusy ? "处理中" : "重配" }}
          </button>
          <button type="button" class="background-debug-button" @click="copyDiagnostics">
            {{ diagnosticsCopyButtonLabel }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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

const props = defineProps({
  state: {
    type: Object,
    default: null,
  },
});

const LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY = "launchpadLiveDesktopDiagnosticMode";
const LIVE_DESKTOP_MODE_CAPTURE = "capture";
const LIVE_DESKTOP_MODE_TEST_PATTERN = "testPattern";
const DEFAULT_LIVE_DESKTOP_STATUS = Object.freeze({
  phase: "unknown",
  active: false,
  generation: 0,
  reason: "",
  detail: "",
  diagnostics: {
    framesCopied: 0,
    frameTimeouts: 0,
    copyErrors: 0,
    commitErrors: 0,
    configUpdates: 0,
    configErrors: 0,
    lastFrameWidth: 0,
    lastFrameHeight: 0,
    lastFrameFormat: 0,
    testPatternFrames: 0,
    lastError: "",
  },
});

const params = useAcrylicDebugParams();
const isOverrideEnabled = useAcrylicDebugOverrideEnabled();
const isCollapsed = ref(false);
const activePanel = ref("acrylic");
const hasCopiedAcrylic = ref(false);
const hasCopiedDiagnostics = ref(false);
const liveDesktopMode = ref(readLiveDesktopDiagnosticMode());
const isLiveDesktopActionBusy = ref(false);
let acrylicCopyStateTimer = null;
let diagnosticsCopyStateTimer = null;
let liveDesktopRuntimePollTimer = null;

const sliders = [
  { key: "saturation", label: "saturation", min: 0.8, max: 1.8, step: 0.01, digits: 2 },
  { key: "contrast", label: "contrast", min: 0.75, max: 1.25, step: 0.01, digits: 2 },
  { key: "brightness", label: "brightness", min: 0.5, max: 1.2, step: 0.01, digits: 2 },
  { key: "tintStrength", label: "tintStrength", min: 0, max: 0.6, step: 0.01, digits: 2 },
  { key: "noise", label: "noise", min: 0, max: 0.06, step: 0.001, digits: 3 },
  { key: "seed", label: "seed", min: 0, max: 100, step: 0.01, digits: 2 },
];

const tintHex = computed(() => rgbArrayToHex(params.tintColor));
const acrylicCopyButtonLabel = computed(() => (hasCopiedAcrylic.value ? "已复制" : "复制 JSON"));
const diagnosticsCopyButtonLabel = computed(() => (hasCopiedDiagnostics.value ? "已复制" : "复制诊断"));
const liveDesktopStatus = computed(() => normalizeLiveDesktopStatus(props.state?.liveDesktopRuntimeStatus?.value));
const liveDesktopStatusRows = computed(() => {
  const status = liveDesktopStatus.value;
  return [
    { label: "phase", value: status.phase },
    { label: "active", value: status.active ? "true" : "false" },
    { label: "generation", value: formatCount(status.generation) },
    { label: "reason", value: status.reason || "-", wide: true },
  ];
});
const liveDesktopDiagnosticsRows = computed(() => {
  const diagnostics = liveDesktopStatus.value.diagnostics;
  return [
    { label: "framesCopied", value: formatCount(diagnostics.framesCopied) },
    { label: "timeouts", value: formatCount(diagnostics.frameTimeouts) },
    { label: "copyErrors", value: formatCount(diagnostics.copyErrors) },
    { label: "commitErrors", value: formatCount(diagnostics.commitErrors) },
    { label: "configUpdates", value: formatCount(diagnostics.configUpdates) },
    { label: "configErrors", value: formatCount(diagnostics.configErrors) },
    { label: "testPatternFrames", value: formatCount(diagnostics.testPatternFrames) },
    { label: "lastFrame", value: formatLastFrame(diagnostics), wide: true },
  ];
});
const liveDesktopLastError = computed(() => liveDesktopStatus.value.diagnostics.lastError);

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function normalizeLiveDesktopStatus(status) {
  const diagnostics = status?.diagnostics || {};
  return {
    phase: String(status?.phase || DEFAULT_LIVE_DESKTOP_STATUS.phase),
    active: Boolean(status?.active),
    generation: normalizeCount(status?.generation),
    reason: String(status?.reason || ""),
    detail: String(status?.detail || ""),
    diagnostics: {
      framesCopied: normalizeCount(diagnostics.framesCopied),
      frameTimeouts: normalizeCount(diagnostics.frameTimeouts),
      copyErrors: normalizeCount(diagnostics.copyErrors),
      commitErrors: normalizeCount(diagnostics.commitErrors),
      configUpdates: normalizeCount(diagnostics.configUpdates),
      configErrors: normalizeCount(diagnostics.configErrors),
      lastFrameWidth: normalizeCount(diagnostics.lastFrameWidth),
      lastFrameHeight: normalizeCount(diagnostics.lastFrameHeight),
      lastFrameFormat: normalizeCount(diagnostics.lastFrameFormat),
      testPatternFrames: normalizeCount(diagnostics.testPatternFrames),
      lastError: String(diagnostics.lastError || ""),
    },
  };
}

function formatValue(value, digits) {
  return Number(value).toFixed(digits);
}

function formatCount(value) {
  return String(normalizeCount(value));
}

function formatLastFrame(diagnostics) {
  if (!diagnostics.lastFrameWidth || !diagnostics.lastFrameHeight) return "-";
  return `${diagnostics.lastFrameWidth}x${diagnostics.lastFrameHeight} fmt ${diagnostics.lastFrameFormat}`;
}

function updateNumber(key, event) {
  updateAcrylicDebugParams({ [key]: Number(event.target.value) });
}

function updateTintColor(event) {
  updateAcrylicDebugParams({
    tintColor: hexToRgbArray(event.target.value, params.tintColor),
  });
}

function readLiveDesktopDiagnosticMode() {
  if (typeof window === "undefined") return LIVE_DESKTOP_MODE_CAPTURE;
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY) === LIVE_DESKTOP_MODE_TEST_PATTERN
      ? LIVE_DESKTOP_MODE_TEST_PATTERN
      : LIVE_DESKTOP_MODE_CAPTURE;
  } catch {
    return LIVE_DESKTOP_MODE_CAPTURE;
  }
}

function persistLiveDesktopDiagnosticMode(mode) {
  if (typeof window === "undefined") return;
  try {
    if (mode === LIVE_DESKTOP_MODE_TEST_PATTERN) {
      window.localStorage?.setItem(LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY, LIVE_DESKTOP_MODE_TEST_PATTERN);
      return;
    }
    window.localStorage?.removeItem(LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to persist live desktop diagnostic mode", error);
  }
}

async function setLiveDesktopDiagnosticMode(mode) {
  const normalizedMode = mode === LIVE_DESKTOP_MODE_TEST_PATTERN
    ? LIVE_DESKTOP_MODE_TEST_PATTERN
    : LIVE_DESKTOP_MODE_CAPTURE;
  liveDesktopMode.value = normalizedMode;
  persistLiveDesktopDiagnosticMode(normalizedMode);
  await reconfigureLiveDesktopRuntime();
}

async function refreshLiveDesktopRuntimeStatus() {
  try {
    await props.state?.refreshLiveDesktopRuntimeStatus?.();
  } catch (error) {
    console.warn("Failed to refresh live desktop runtime status", error);
  }
}

async function reconfigureLiveDesktopRuntime() {
  if (isLiveDesktopActionBusy.value) return;
  isLiveDesktopActionBusy.value = true;
  try {
    if (typeof props.state?.syncLiveDesktopBackgroundRuntime === "function") {
      await props.state.syncLiveDesktopBackgroundRuntime();
    }
    await refreshLiveDesktopRuntimeStatus();
  } catch (error) {
    console.warn("Failed to reconfigure live desktop runtime", error);
  } finally {
    isLiveDesktopActionBusy.value = false;
  }
}

function copyToClipboard(text, copiedRef, timerName) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
  return navigator.clipboard.writeText(text).then(() => {
    copiedRef.value = true;
    if (timerName === "acrylic") {
      if (acrylicCopyStateTimer != null) window.clearTimeout(acrylicCopyStateTimer);
      acrylicCopyStateTimer = window.setTimeout(() => {
        acrylicCopyStateTimer = null;
        copiedRef.value = false;
      }, 1200);
      return;
    }
    if (diagnosticsCopyStateTimer != null) window.clearTimeout(diagnosticsCopyStateTimer);
    diagnosticsCopyStateTimer = window.setTimeout(() => {
      diagnosticsCopyStateTimer = null;
      copiedRef.value = false;
    }, 1200);
  });
}

async function copyParams() {
  try {
    await copyToClipboard(formatAcrylicDebugParams(), hasCopiedAcrylic, "acrylic");
  } catch (error) {
    console.warn("Failed to copy Acrylic debug params", error);
  }
}

async function copyDiagnostics() {
  try {
    await copyToClipboard(
      JSON.stringify(
        {
          diagnosticMode: liveDesktopMode.value,
          support: props.state?.liveDesktopBackgroundSupport?.value || null,
          runtimeStatus: liveDesktopStatus.value,
        },
        null,
        2
      ),
      hasCopiedDiagnostics,
      "diagnostics"
    );
  } catch (error) {
    console.warn("Failed to copy live desktop diagnostics", error);
  }
}

function clearLiveDesktopRuntimePoller() {
  if (liveDesktopRuntimePollTimer == null) return;
  window.clearInterval(liveDesktopRuntimePollTimer);
  liveDesktopRuntimePollTimer = null;
}

function restartLiveDesktopRuntimePoller() {
  clearLiveDesktopRuntimePoller();
  if (
    typeof window === "undefined"
    || isCollapsed.value
    || activePanel.value !== "liveDesktop"
    || typeof props.state?.refreshLiveDesktopRuntimeStatus !== "function"
  ) {
    return;
  }
  liveDesktopMode.value = readLiveDesktopDiagnosticMode();
  refreshLiveDesktopRuntimeStatus();
  liveDesktopRuntimePollTimer = window.setInterval(refreshLiveDesktopRuntimeStatus, 1000);
}

watch([isCollapsed, activePanel], restartLiveDesktopRuntimePoller, { flush: "post" });

onMounted(restartLiveDesktopRuntimePoller);

onBeforeUnmount(() => {
  if (acrylicCopyStateTimer != null) window.clearTimeout(acrylicCopyStateTimer);
  if (diagnosticsCopyStateTimer != null) window.clearTimeout(diagnosticsCopyStateTimer);
  clearLiveDesktopRuntimePoller();
});
</script>

<style scoped>
.background-debug-panel {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 132;
  display: flex;
  flex-direction: column;
  width: 380px;
  max-width: calc(100vw - 36px);
  max-height: calc(100vh - 36px);
  padding: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(24, 28, 36, 0.9);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(22px) saturate(120%);
  -webkit-backdrop-filter: blur(22px) saturate(120%);
  font-size: 12px;
  line-height: 1.3;
}

.background-debug-panel *,
.background-debug-panel *::before,
.background-debug-panel *::after {
  box-sizing: border-box;
}

.background-debug-panel button {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
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
  font-weight: 700;
  line-height: 1.2;
}

.background-debug-title span {
  color: rgba(255, 255, 255, 0.48);
  font-size: 11px;
  line-height: 1.2;
}

.background-debug-body,
.background-debug-section {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.background-debug-body {
  margin-top: 12px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.background-debug-tabs,
.background-debug-mode-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-tab,
.background-debug-mode-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.62);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.background-debug-tab-active,
.background-debug-mode-button-active {
  color: rgba(255, 255, 255, 0.94);
  background: rgba(255, 255, 255, 0.14);
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

.background-debug-status-grid,
.background-debug-diagnostics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}

.background-debug-stat {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 6px 7px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-stat-wide {
  grid-column: 1 / -1;
  grid-template-columns: minmax(86px, 0.35fr) minmax(0, 1fr);
  align-items: center;
}

.background-debug-stat dt,
.background-debug-stat dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-stat dt {
  color: rgba(255, 255, 255, 0.48);
  font-size: 10.5px;
  line-height: 1.15;
}

.background-debug-stat dd {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1.25;
}

.background-debug-detail,
.background-debug-error {
  min-width: 0;
  margin: 0;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.06);
  line-height: 1.35;
  word-break: break-word;
}

.background-debug-detail {
  max-height: 94px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10.5px;
  white-space: pre-wrap;
}

.background-debug-error {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  font-size: 11px;
}

.background-debug-error {
  border-color: rgba(255, 120, 120, 0.26);
  color: rgba(255, 180, 180, 0.9);
  background: rgba(255, 70, 70, 0.08);
}

.background-debug-live-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  justify-content: stretch;
}

.background-debug-live-actions .background-debug-button {
  width: 100%;
}

.background-debug-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.background-debug-button:hover,
.background-debug-tab:hover,
.background-debug-mode-button:hover {
  color: white;
  background: rgba(255, 255, 255, 0.16);
}

.background-debug-button:disabled,
.background-debug-mode-button:disabled {
  opacity: 0.48;
  cursor: default;
}

.background-debug-body::-webkit-scrollbar,
.background-debug-detail::-webkit-scrollbar {
  width: 8px;
}

.background-debug-body::-webkit-scrollbar-thumb,
.background-debug-detail::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  background-clip: padding-box;
}

@media (max-width: 760px) {
  .background-debug-panel {
    right: 14px;
    bottom: 14px;
    width: calc(100vw - 28px);
  }
}
</style>
