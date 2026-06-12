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
            :class="['background-debug-mode-button', liveDesktopMode === 'workerWCapture' && 'background-debug-mode-button-active']"
            :disabled="isLiveDesktopActionBusy"
            @click="setLiveDesktopDiagnosticMode('workerWCapture')"
          >
            WorkerW
          </button>
          <button
            type="button"
            :class="['background-debug-mode-button', liveDesktopMode === 'dwmSharedSurfaceCapture' && 'background-debug-mode-button-active']"
            :disabled="isLiveDesktopActionBusy"
            @click="setLiveDesktopDiagnosticMode('dwmSharedSurfaceCapture')"
          >
            DWM Surface
          </button>
          <button
            type="button"
            :class="['background-debug-mode-button', liveDesktopMode === 'wallpaperEnginePopupCapture' && 'background-debug-mode-button-active']"
            :disabled="isLiveDesktopActionBusy"
            @click="setLiveDesktopDiagnosticMode('wallpaperEnginePopupCapture')"
          >
            WE Popup
          </button>
          <button
            type="button"
            :class="['background-debug-mode-button', liveDesktopMode === 'monitorCapture' && 'background-debug-mode-button-active']"
            :disabled="isLiveDesktopActionBusy"
            @click="setLiveDesktopDiagnosticMode('monitorCapture')"
          >
            Monitor
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

        <label class="background-debug-toggle">
          <input
            name="liveDesktopDisableMouseRelay"
            type="checkbox"
            :checked="liveDesktopDisableMouseRelay"
            :disabled="isLiveDesktopActionBusy"
            @change="setLiveDesktopDisableMouseRelay($event.target.checked)"
          >
          <span>禁用鼠标转发</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="liveDesktopCompositorKeeper"
            type="checkbox"
            :checked="liveDesktopCompositorKeeper"
            :disabled="isLiveDesktopActionBusy"
            @change="setLiveDesktopCompositorKeeper($event.target.checked)"
          >
          <span>合成稳定器</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="liveDesktopOwnedPopupHost"
            type="checkbox"
            :checked="liveDesktopHostMode === LIVE_DESKTOP_HOST_MODE_OWNED_POPUP"
            :disabled="isLiveDesktopActionBusy"
            @change="setLiveDesktopHostMode($event.target.checked ? LIVE_DESKTOP_HOST_MODE_OWNED_POPUP : LIVE_DESKTOP_HOST_MODE_WEBVIEW_TARGET)"
          >
          <span>独立背景 HWND</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="liveDesktopChildWindowHost"
            type="checkbox"
            :checked="liveDesktopHostMode === LIVE_DESKTOP_HOST_MODE_CHILD_WINDOW"
            :disabled="isLiveDesktopActionBusy"
            @change="setLiveDesktopHostMode($event.target.checked ? LIVE_DESKTOP_HOST_MODE_CHILD_WINDOW : LIVE_DESKTOP_HOST_MODE_WEBVIEW_TARGET)"
          >
          <span>Child 背景 HWND</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="liveDesktopSkipBlankFrames"
            type="checkbox"
            :checked="liveDesktopSkipBlankFrames"
            :disabled="isLiveDesktopActionBusy"
            @change="setLiveDesktopSkipBlankFrames($event.target.checked)"
          >
          <span>跳过疑似空白帧</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="liveDesktopForceDwmFlush"
            type="checkbox"
            :checked="liveDesktopForceDwmFlush"
            :disabled="isLiveDesktopActionBusy"
            @change="setLiveDesktopForceDwmFlush($event.target.checked)"
          >
          <span>强制 DWM Flush</span>
        </label>

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

        <dl class="background-debug-diagnostics">
          <div
            v-for="row in liveDesktopWindowRows"
            :key="row.label"
            :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
          >
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>

        <div class="background-debug-window-list">
          <article
            v-for="windowInfo in liveDesktopCandidateWindows"
            :key="windowInfo.hwnd"
            class="background-debug-window-card"
          >
            <strong>{{ formatWindowTitle(windowInfo) }}</strong>
            <span>{{ formatWindowMeta(windowInfo) }}</span>
            <span>{{ formatWindowRect(windowInfo.rect) }}</span>
          </article>
          <article v-if="liveDesktopCandidateWindows.length === 0" class="background-debug-window-card">
            <strong>No live desktop candidates</strong>
            <span>{{ liveDesktopWindowDiagnostics.detail || liveDesktopWindowDiagnostics.reason }}</span>
          </article>
        </div>

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
const LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY = "launchpadLiveDesktopDisableMouseRelay";
const LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY = "launchpadLiveDesktopCompositorKeeper";
const LIVE_DESKTOP_COMPOSITOR_KEEPER_CHANGED_EVENT = "launchpad-live-desktop-compositor-keeper-change";
const LIVE_DESKTOP_HOST_MODE_STORAGE_KEY = "launchpadLiveDesktopHostMode";
const LIVE_DESKTOP_HOST_MODE_WEBVIEW_TARGET = "webviewTarget";
const LIVE_DESKTOP_HOST_MODE_OWNED_POPUP = "ownedPopupHost";
const LIVE_DESKTOP_HOST_MODE_CHILD_WINDOW = "childWindowHost";
const LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY = "launchpadLiveDesktopSkipBlankFrames";
const LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY = "launchpadLiveDesktopForceDwmFlush";
const LIVE_DESKTOP_MODE_WORKERW_CAPTURE = "workerWCapture";
const LIVE_DESKTOP_MODE_DWM_SHARED_SURFACE_CAPTURE = "dwmSharedSurfaceCapture";
const LIVE_DESKTOP_MODE_WALLPAPER_ENGINE_POPUP_CAPTURE = "wallpaperEnginePopupCapture";
const LIVE_DESKTOP_MODE_MONITOR_CAPTURE = "monitorCapture";
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
    frameArrivedEvents: 0,
    frameArrivedDroppedSignals: 0,
    frameCopySamples: 0,
    frameCopyMicrosTotal: 0,
    lastFrameCopyMicros: 0,
    maxFrameCopyMicros: 0,
    frameCommitSamples: 0,
    frameCommitMicrosTotal: 0,
    lastFrameCommitMicros: 0,
    maxFrameCommitMicros: 0,
    configUpdates: 0,
    configErrors: 0,
    lastFrameWidth: 0,
    lastFrameHeight: 0,
    lastFrameFormat: 0,
    testPatternFrames: 0,
    dwmSurfaceUpdates: 0,
    dwmSurfaceUpdateErrors: 0,
    lastDwmSurfaceUpdateRectWidth: 0,
    lastDwmSurfaceUpdateRectHeight: 0,
    pixelProbeSamples: 0,
    pixelProbeErrors: 0,
    blankFrameSkips: 0,
    lastPixelProbeWidth: 0,
    lastPixelProbeHeight: 0,
    lastPixelProbeMinRgb: 0,
    lastPixelProbeMaxRgb: 0,
    lastPixelProbeAvgRgb: 0,
    lastPixelProbeMinAlpha: 0,
    lastPixelProbeMaxAlpha: 0,
    lastPixelProbeAvgAlpha: 0,
    lastError: "",
  },
  windowDiagnostics: {
    platform: "unknown",
    available: false,
    reason: "",
    detail: "",
    windowCount: 0,
    candidateCount: 0,
    windows: [],
    candidates: [],
  },
});

const params = useAcrylicDebugParams();
const isOverrideEnabled = useAcrylicDebugOverrideEnabled();
const isCollapsed = ref(false);
const activePanel = ref("acrylic");
const hasCopiedAcrylic = ref(false);
const hasCopiedDiagnostics = ref(false);
const liveDesktopMode = ref(readLiveDesktopDiagnosticMode());
const liveDesktopDisableMouseRelay = ref(readLiveDesktopDisableMouseRelay());
const liveDesktopCompositorKeeper = ref(readLiveDesktopCompositorKeeper());
const liveDesktopHostMode = ref(readLiveDesktopHostMode());
const liveDesktopSkipBlankFrames = ref(readLiveDesktopSkipBlankFrames());
const liveDesktopForceDwmFlush = ref(readLiveDesktopForceDwmFlush());
const isLiveDesktopActionBusy = ref(false);
const liveDesktopRates = ref({
  framesPerSecond: 0,
  arrivedPerSecond: 0,
  droppedPerSecond: 0,
  timeoutsPerSecond: 0,
  copyErrorsPerSecond: 0,
});
let liveDesktopRateSample = null;
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
    { label: "rates", value: formatLiveDesktopRates(liveDesktopRates.value), wide: true },
    { label: "frameArrived", value: formatFrameArrived(diagnostics), wide: true },
    {
      label: "copyTiming",
      value: formatFrameTiming(
        diagnostics.frameCopySamples,
        diagnostics.frameCopyMicrosTotal,
        diagnostics.lastFrameCopyMicros,
        diagnostics.maxFrameCopyMicros,
      ),
      wide: true,
    },
    {
      label: "commitTiming",
      value: formatFrameTiming(
        diagnostics.frameCommitSamples,
        diagnostics.frameCommitMicrosTotal,
        diagnostics.lastFrameCommitMicros,
        diagnostics.maxFrameCommitMicros,
      ),
      wide: true,
    },
    { label: "configUpdates", value: formatCount(diagnostics.configUpdates) },
    { label: "configErrors", value: formatCount(diagnostics.configErrors) },
    { label: "testPatternFrames", value: formatCount(diagnostics.testPatternFrames) },
    { label: "blankFrameSkips", value: formatCount(diagnostics.blankFrameSkips) },
    { label: "dwmUpdate", value: formatDwmUpdate(diagnostics), wide: true },
    { label: "pixelProbe", value: formatPixelProbe(diagnostics), wide: true },
    { label: "lastFrame", value: formatLastFrame(diagnostics), wide: true },
  ];
});
const liveDesktopLastError = computed(() => liveDesktopStatus.value.diagnostics.lastError);
const liveDesktopWindowDiagnostics = computed(() => liveDesktopStatus.value.windowDiagnostics);
const liveDesktopCandidateWindows = computed(() => liveDesktopWindowDiagnostics.value.candidates.slice(0, 5));
const liveDesktopWindowRows = computed(() => {
  const diagnostics = liveDesktopWindowDiagnostics.value;
  return [
    { label: "workerw", value: diagnostics.available ? "available" : diagnostics.reason || "-", wide: true },
    { label: "windows", value: formatCount(diagnostics.windowCount) },
    { label: "candidates", value: formatCount(diagnostics.candidateCount) },
  ];
});

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
      frameArrivedEvents: normalizeCount(diagnostics.frameArrivedEvents),
      frameArrivedDroppedSignals: normalizeCount(diagnostics.frameArrivedDroppedSignals),
      frameCopySamples: normalizeCount(diagnostics.frameCopySamples),
      frameCopyMicrosTotal: normalizeCount(diagnostics.frameCopyMicrosTotal),
      lastFrameCopyMicros: normalizeCount(diagnostics.lastFrameCopyMicros),
      maxFrameCopyMicros: normalizeCount(diagnostics.maxFrameCopyMicros),
      frameCommitSamples: normalizeCount(diagnostics.frameCommitSamples),
      frameCommitMicrosTotal: normalizeCount(diagnostics.frameCommitMicrosTotal),
      lastFrameCommitMicros: normalizeCount(diagnostics.lastFrameCommitMicros),
      maxFrameCommitMicros: normalizeCount(diagnostics.maxFrameCommitMicros),
      configUpdates: normalizeCount(diagnostics.configUpdates),
      configErrors: normalizeCount(diagnostics.configErrors),
      lastFrameWidth: normalizeCount(diagnostics.lastFrameWidth),
      lastFrameHeight: normalizeCount(diagnostics.lastFrameHeight),
      lastFrameFormat: normalizeCount(diagnostics.lastFrameFormat),
      testPatternFrames: normalizeCount(diagnostics.testPatternFrames),
      dwmSurfaceUpdates: normalizeCount(diagnostics.dwmSurfaceUpdates),
      dwmSurfaceUpdateErrors: normalizeCount(diagnostics.dwmSurfaceUpdateErrors),
      lastDwmSurfaceUpdateRectWidth: normalizeCount(diagnostics.lastDwmSurfaceUpdateRectWidth),
      lastDwmSurfaceUpdateRectHeight: normalizeCount(diagnostics.lastDwmSurfaceUpdateRectHeight),
      pixelProbeSamples: normalizeCount(diagnostics.pixelProbeSamples),
      pixelProbeErrors: normalizeCount(diagnostics.pixelProbeErrors),
      blankFrameSkips: normalizeCount(diagnostics.blankFrameSkips),
      lastPixelProbeWidth: normalizeCount(diagnostics.lastPixelProbeWidth),
      lastPixelProbeHeight: normalizeCount(diagnostics.lastPixelProbeHeight),
      lastPixelProbeMinRgb: normalizeCount(diagnostics.lastPixelProbeMinRgb),
      lastPixelProbeMaxRgb: normalizeCount(diagnostics.lastPixelProbeMaxRgb),
      lastPixelProbeAvgRgb: normalizeCount(diagnostics.lastPixelProbeAvgRgb),
      lastPixelProbeMinAlpha: normalizeCount(diagnostics.lastPixelProbeMinAlpha),
      lastPixelProbeMaxAlpha: normalizeCount(diagnostics.lastPixelProbeMaxAlpha),
      lastPixelProbeAvgAlpha: normalizeCount(diagnostics.lastPixelProbeAvgAlpha),
      lastError: String(diagnostics.lastError || ""),
    },
    windowDiagnostics: normalizeLiveDesktopWindowDiagnostics(status?.windowDiagnostics),
  };
}

function normalizeLiveDesktopWindowDiagnostics(diagnostics) {
  const windows = Array.isArray(diagnostics?.windows)
    ? diagnostics.windows.map(normalizeLiveDesktopWindowInfo)
    : [];
  const candidates = Array.isArray(diagnostics?.candidates)
    ? diagnostics.candidates.map(normalizeLiveDesktopWindowInfo)
    : [];
  return {
    platform: String(diagnostics?.platform || DEFAULT_LIVE_DESKTOP_STATUS.windowDiagnostics.platform),
    available: Boolean(diagnostics?.available),
    reason: String(diagnostics?.reason || DEFAULT_LIVE_DESKTOP_STATUS.windowDiagnostics.reason),
    detail: String(diagnostics?.detail || ""),
    windowCount: normalizeCount(diagnostics?.windowCount ?? windows.length),
    candidateCount: normalizeCount(diagnostics?.candidateCount ?? candidates.length),
    windows,
    candidates,
  };
}

function normalizeLiveDesktopWindowInfo(windowInfo) {
  return {
    hwnd: String(windowInfo?.hwnd || ""),
    parentHwnd: String(windowInfo?.parentHwnd || ""),
    rootHwnd: String(windowInfo?.rootHwnd || ""),
    pid: normalizeCount(windowInfo?.pid),
    className: String(windowInfo?.className || ""),
    title: String(windowInfo?.title || ""),
    processName: String(windowInfo?.processName || ""),
    role: String(windowInfo?.role || "window"),
    candidateReason: String(windowInfo?.candidateReason || ""),
    visible: Boolean(windowInfo?.visible),
    style: String(windowInfo?.style || ""),
    exStyle: String(windowInfo?.exStyle || ""),
    cloaked: normalizeCount(windowInfo?.cloaked),
    rect: normalizeLiveDesktopWindowRect(windowInfo?.rect),
  };
}

function normalizeLiveDesktopWindowRect(rect) {
  return {
    left: normalizeSignedInteger(rect?.left),
    top: normalizeSignedInteger(rect?.top),
    right: normalizeSignedInteger(rect?.right),
    bottom: normalizeSignedInteger(rect?.bottom),
    width: normalizeCount(rect?.width),
    height: normalizeCount(rect?.height),
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

function formatDwmUpdate(diagnostics) {
  if (!diagnostics.dwmSurfaceUpdates && !diagnostics.dwmSurfaceUpdateErrors) return "-";
  const rect = diagnostics.lastDwmSurfaceUpdateRectWidth || diagnostics.lastDwmSurfaceUpdateRectHeight
    ? ` rect ${diagnostics.lastDwmSurfaceUpdateRectWidth}x${diagnostics.lastDwmSurfaceUpdateRectHeight}`
    : "";
  return `${diagnostics.dwmSurfaceUpdates} ok / ${diagnostics.dwmSurfaceUpdateErrors} err${rect}`;
}

function formatPixelProbe(diagnostics) {
  if (!diagnostics.pixelProbeSamples && !diagnostics.pixelProbeErrors) return "-";
  const size = diagnostics.lastPixelProbeWidth && diagnostics.lastPixelProbeHeight
    ? `${diagnostics.lastPixelProbeWidth}x${diagnostics.lastPixelProbeHeight} `
    : "";
  return `${diagnostics.pixelProbeSamples} ok / ${diagnostics.pixelProbeErrors} err ${size}rgb ${diagnostics.lastPixelProbeMinRgb}/${diagnostics.lastPixelProbeMaxRgb}/${diagnostics.lastPixelProbeAvgRgb} alpha ${diagnostics.lastPixelProbeMinAlpha}/${diagnostics.lastPixelProbeMaxAlpha}/${diagnostics.lastPixelProbeAvgAlpha}`;
}

function formatFrameArrived(diagnostics) {
  if (!diagnostics.frameArrivedEvents && !diagnostics.frameArrivedDroppedSignals) return "-";
  return `${diagnostics.frameArrivedEvents} events / ${diagnostics.frameArrivedDroppedSignals} dropped`;
}

function formatFrameTiming(samples, totalMicros, lastMicros, maxMicros) {
  if (!samples) return "-";
  const averageMicros = totalMicros / samples;
  return [
    `avg ${formatMicrosAsMillis(averageMicros)}ms`,
    `last ${formatMicrosAsMillis(lastMicros)}ms`,
    `max ${formatMicrosAsMillis(maxMicros)}ms`,
  ].join(" / ");
}

function formatMicrosAsMillis(micros) {
  return (Number(micros) / 1000).toFixed(2);
}

function formatLiveDesktopRates(rates) {
  return [
    `frames ${rates.framesPerSecond.toFixed(1)}/s`,
    `arrived ${rates.arrivedPerSecond.toFixed(1)}/s`,
    `dropped ${rates.droppedPerSecond.toFixed(1)}/s`,
    `timeouts ${rates.timeoutsPerSecond.toFixed(1)}/s`,
    `copyErr ${rates.copyErrorsPerSecond.toFixed(1)}/s`,
  ].join(" · ");
}

function updateLiveDesktopRates() {
  const diagnostics = liveDesktopStatus.value.diagnostics;
  const now = Date.now();
  if (!liveDesktopRateSample || now <= liveDesktopRateSample.measuredAt) {
    liveDesktopRateSample = {
      measuredAt: now,
      framesCopied: diagnostics.framesCopied,
      frameArrivedEvents: diagnostics.frameArrivedEvents,
      frameArrivedDroppedSignals: diagnostics.frameArrivedDroppedSignals,
      frameTimeouts: diagnostics.frameTimeouts,
      copyErrors: diagnostics.copyErrors,
    };
    liveDesktopRates.value = {
      framesPerSecond: 0,
      arrivedPerSecond: 0,
      droppedPerSecond: 0,
      timeoutsPerSecond: 0,
      copyErrorsPerSecond: 0,
    };
    return;
  }
  const elapsedSeconds = Math.max(0.001, (now - liveDesktopRateSample.measuredAt) / 1000);
  liveDesktopRates.value = {
    framesPerSecond: Math.max(
      0,
      (diagnostics.framesCopied - liveDesktopRateSample.framesCopied) / elapsedSeconds,
    ),
    arrivedPerSecond: Math.max(
      0,
      (diagnostics.frameArrivedEvents - liveDesktopRateSample.frameArrivedEvents) / elapsedSeconds,
    ),
    droppedPerSecond: Math.max(
      0,
      (diagnostics.frameArrivedDroppedSignals - liveDesktopRateSample.frameArrivedDroppedSignals) / elapsedSeconds,
    ),
    timeoutsPerSecond: Math.max(
      0,
      (diagnostics.frameTimeouts - liveDesktopRateSample.frameTimeouts) / elapsedSeconds,
    ),
    copyErrorsPerSecond: Math.max(
      0,
      (diagnostics.copyErrors - liveDesktopRateSample.copyErrors) / elapsedSeconds,
    ),
  };
  liveDesktopRateSample = {
    measuredAt: now,
    framesCopied: diagnostics.framesCopied,
    frameArrivedEvents: diagnostics.frameArrivedEvents,
    frameArrivedDroppedSignals: diagnostics.frameArrivedDroppedSignals,
    frameTimeouts: diagnostics.frameTimeouts,
    copyErrors: diagnostics.copyErrors,
  };
}

function normalizeSignedInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function formatWindowTitle(windowInfo) {
  return `${windowInfo.role || "window"} ${windowInfo.hwnd || "-"}`;
}

function formatWindowMeta(windowInfo) {
  const process = windowInfo.processName || `pid ${windowInfo.pid}`;
  const className = windowInfo.className || "unknown class";
  const reason = windowInfo.candidateReason || "diagnostic";
  const title = windowInfo.title ? ` · ${windowInfo.title}` : "";
  return `${reason} · ${className} · ${process} · parent ${windowInfo.parentHwnd || "-"} · root ${windowInfo.rootHwnd || "-"} · style ${windowInfo.style || "-"} · ex ${windowInfo.exStyle || "-"} · cloaked ${windowInfo.cloaked}${title}`;
}

function formatWindowRect(rect) {
  return `${rect.left},${rect.top} ${rect.width}x${rect.height}`;
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
  if (typeof window === "undefined") return LIVE_DESKTOP_MODE_WORKERW_CAPTURE;
  try {
    const mode = window.localStorage?.getItem(LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY);
    if (mode === LIVE_DESKTOP_MODE_TEST_PATTERN) return LIVE_DESKTOP_MODE_TEST_PATTERN;
    if (mode === LIVE_DESKTOP_MODE_MONITOR_CAPTURE) return LIVE_DESKTOP_MODE_MONITOR_CAPTURE;
    if (mode === LIVE_DESKTOP_MODE_WALLPAPER_ENGINE_POPUP_CAPTURE) return LIVE_DESKTOP_MODE_WALLPAPER_ENGINE_POPUP_CAPTURE;
    if (mode === LIVE_DESKTOP_MODE_DWM_SHARED_SURFACE_CAPTURE) return LIVE_DESKTOP_MODE_DWM_SHARED_SURFACE_CAPTURE;
    return LIVE_DESKTOP_MODE_WORKERW_CAPTURE;
  } catch {
    return LIVE_DESKTOP_MODE_WORKERW_CAPTURE;
  }
}

function readLiveDesktopDisableMouseRelay() {
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY) !== "false";
  } catch (error) {
    console.warn("Failed to read live desktop mouse relay setting", error);
    return true;
  }
}

function readLiveDesktopCompositorKeeper() {
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Failed to read live desktop compositor keeper setting", error);
    return false;
  }
}

function readLiveDesktopHostMode() {
  try {
    const mode = window.localStorage?.getItem(LIVE_DESKTOP_HOST_MODE_STORAGE_KEY);
    if (mode === LIVE_DESKTOP_HOST_MODE_CHILD_WINDOW) return LIVE_DESKTOP_HOST_MODE_CHILD_WINDOW;
    if (mode === LIVE_DESKTOP_HOST_MODE_OWNED_POPUP) return LIVE_DESKTOP_HOST_MODE_OWNED_POPUP;
    return LIVE_DESKTOP_HOST_MODE_WEBVIEW_TARGET;
  } catch (error) {
    console.warn("Failed to read live desktop host mode setting", error);
    return LIVE_DESKTOP_HOST_MODE_WEBVIEW_TARGET;
  }
}

function readLiveDesktopSkipBlankFrames() {
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Failed to read live desktop skip blank frames setting", error);
    return false;
  }
}

function readLiveDesktopForceDwmFlush() {
  try {
    return window.localStorage?.getItem(LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Failed to read live desktop DWM flush setting", error);
    return false;
  }
}

function persistLiveDesktopDisableMouseRelay(disabled) {
  try {
    if (disabled) {
      window.localStorage?.removeItem(LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY);
    } else {
      window.localStorage?.setItem(LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY, "false");
    }
  } catch (error) {
    console.warn("Failed to persist live desktop mouse relay setting", error);
  }
}

function persistLiveDesktopCompositorKeeper(enabled) {
  try {
    if (enabled) {
      window.localStorage?.setItem(LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY, "true");
    } else {
      window.localStorage?.removeItem(LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist live desktop compositor keeper setting", error);
  }
}

function persistLiveDesktopHostMode(mode) {
  try {
    if (mode === LIVE_DESKTOP_HOST_MODE_OWNED_POPUP || mode === LIVE_DESKTOP_HOST_MODE_CHILD_WINDOW) {
      window.localStorage?.setItem(LIVE_DESKTOP_HOST_MODE_STORAGE_KEY, mode);
    } else {
      window.localStorage?.removeItem(LIVE_DESKTOP_HOST_MODE_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist live desktop host mode setting", error);
  }
}

function persistLiveDesktopSkipBlankFrames(enabled) {
  try {
    if (enabled) {
      window.localStorage?.setItem(LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY, "true");
    } else {
      window.localStorage?.removeItem(LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist live desktop skip blank frames setting", error);
  }
}

function persistLiveDesktopForceDwmFlush(enabled) {
  try {
    if (enabled) {
      window.localStorage?.setItem(LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY, "true");
    } else {
      window.localStorage?.removeItem(LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist live desktop DWM flush setting", error);
  }
}

function notifyLiveDesktopCompositorKeeperChanged(enabled) {
  window.dispatchEvent(new CustomEvent(LIVE_DESKTOP_COMPOSITOR_KEEPER_CHANGED_EVENT, {
    detail: { enabled },
  }));
}

function persistLiveDesktopDiagnosticMode(mode) {
  if (typeof window === "undefined") return;
  try {
    if (mode === LIVE_DESKTOP_MODE_TEST_PATTERN) {
      window.localStorage?.setItem(LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY, LIVE_DESKTOP_MODE_TEST_PATTERN);
      return;
    }
    if (mode === LIVE_DESKTOP_MODE_MONITOR_CAPTURE) {
      window.localStorage?.setItem(LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY, LIVE_DESKTOP_MODE_MONITOR_CAPTURE);
      return;
    }
    if (mode === LIVE_DESKTOP_MODE_WALLPAPER_ENGINE_POPUP_CAPTURE) {
      window.localStorage?.setItem(LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY, LIVE_DESKTOP_MODE_WALLPAPER_ENGINE_POPUP_CAPTURE);
      return;
    }
    if (mode === LIVE_DESKTOP_MODE_DWM_SHARED_SURFACE_CAPTURE) {
      window.localStorage?.setItem(LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY, LIVE_DESKTOP_MODE_DWM_SHARED_SURFACE_CAPTURE);
      return;
    }
    window.localStorage?.removeItem(LIVE_DESKTOP_DIAGNOSTIC_MODE_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to persist live desktop diagnostic mode", error);
  }
}

async function setLiveDesktopDisableMouseRelay(disabled) {
  liveDesktopDisableMouseRelay.value = Boolean(disabled);
  liveDesktopRateSample = null;
  persistLiveDesktopDisableMouseRelay(liveDesktopDisableMouseRelay.value);
  await reconfigureLiveDesktopRuntime({
    restart: liveDesktopMode.value === LIVE_DESKTOP_MODE_WALLPAPER_ENGINE_POPUP_CAPTURE,
  });
}

function setLiveDesktopCompositorKeeper(enabled) {
  liveDesktopCompositorKeeper.value = Boolean(enabled);
  persistLiveDesktopCompositorKeeper(liveDesktopCompositorKeeper.value);
  notifyLiveDesktopCompositorKeeperChanged(liveDesktopCompositorKeeper.value);
}

async function setLiveDesktopHostMode(mode) {
  liveDesktopHostMode.value = [
    LIVE_DESKTOP_HOST_MODE_OWNED_POPUP,
    LIVE_DESKTOP_HOST_MODE_CHILD_WINDOW,
  ].includes(mode)
    ? mode
    : LIVE_DESKTOP_HOST_MODE_WEBVIEW_TARGET;
  liveDesktopRateSample = null;
  persistLiveDesktopHostMode(liveDesktopHostMode.value);
  await reconfigureLiveDesktopRuntime({ restart: true });
}

async function setLiveDesktopSkipBlankFrames(enabled) {
  liveDesktopSkipBlankFrames.value = Boolean(enabled);
  liveDesktopRateSample = null;
  persistLiveDesktopSkipBlankFrames(liveDesktopSkipBlankFrames.value);
  await reconfigureLiveDesktopRuntime();
}

async function setLiveDesktopForceDwmFlush(enabled) {
  liveDesktopForceDwmFlush.value = Boolean(enabled);
  liveDesktopRateSample = null;
  persistLiveDesktopForceDwmFlush(liveDesktopForceDwmFlush.value);
  await reconfigureLiveDesktopRuntime();
}

async function setLiveDesktopDiagnosticMode(mode) {
  const normalizedMode = [
    LIVE_DESKTOP_MODE_TEST_PATTERN,
    LIVE_DESKTOP_MODE_MONITOR_CAPTURE,
    LIVE_DESKTOP_MODE_WALLPAPER_ENGINE_POPUP_CAPTURE,
    LIVE_DESKTOP_MODE_DWM_SHARED_SURFACE_CAPTURE,
  ].includes(mode)
    ? mode
    : LIVE_DESKTOP_MODE_WORKERW_CAPTURE;
  liveDesktopMode.value = normalizedMode;
  liveDesktopRateSample = null;
  persistLiveDesktopDiagnosticMode(normalizedMode);
  await reconfigureLiveDesktopRuntime({
    restart: normalizedMode === LIVE_DESKTOP_MODE_WORKERW_CAPTURE
      || normalizedMode === LIVE_DESKTOP_MODE_WALLPAPER_ENGINE_POPUP_CAPTURE
      || normalizedMode === LIVE_DESKTOP_MODE_DWM_SHARED_SURFACE_CAPTURE
      || normalizedMode === LIVE_DESKTOP_MODE_MONITOR_CAPTURE,
  });
}

async function refreshLiveDesktopRuntimeStatus() {
  try {
    await props.state?.refreshLiveDesktopRuntimeStatus?.();
    updateLiveDesktopRates();
  } catch (error) {
    console.warn("Failed to refresh live desktop runtime status", error);
  }
}

async function reconfigureLiveDesktopRuntime(options = {}) {
  if (isLiveDesktopActionBusy.value) return;
  isLiveDesktopActionBusy.value = true;
  try {
    if (options.restart && typeof props.state?.restartLiveDesktopBackgroundRuntime === "function") {
      await props.state.restartLiveDesktopBackgroundRuntime();
    } else if (typeof props.state?.syncLiveDesktopBackgroundRuntime === "function") {
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
          disableMouseRelay: liveDesktopDisableMouseRelay.value,
          hostMode: liveDesktopHostMode.value,
          skipBlankFrames: liveDesktopSkipBlankFrames.value,
          forceDwmFlush: liveDesktopForceDwmFlush.value,
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
  liveDesktopHostMode.value = readLiveDesktopHostMode();
  liveDesktopSkipBlankFrames.value = readLiveDesktopSkipBlankFrames();
  liveDesktopForceDwmFlush.value = readLiveDesktopForceDwmFlush();
  liveDesktopRateSample = null;
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
  gap: 4px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-tabs {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.background-debug-mode-group {
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.background-debug-window-list {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.background-debug-window-card {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-window-card strong,
.background-debug-window-card span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-window-card strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11.5px;
  font-weight: 650;
  line-height: 1.2;
}

.background-debug-window-card span {
  color: rgba(255, 255, 255, 0.52);
  font-size: 10.5px;
  line-height: 1.2;
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
