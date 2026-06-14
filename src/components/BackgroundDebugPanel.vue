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
      <div v-if="canDebugLiveDesktop" class="background-debug-tabs" role="tablist" aria-label="Background debug sections">
        <button
          type="button"
          :class="['background-debug-tab', activePanel === 'acrylic' && 'background-debug-tab-active']"
          @click="activePanel = 'acrylic'"
        >
          Acrylic
        </button>
        <button
          v-if="canDebugLiveDesktop"
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

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Blur Kernel</div>
          <label class="background-debug-toggle">
            <input
              name="kawaseDebugOverride"
              type="checkbox"
              :checked="isKawaseOverrideEnabled"
              @change="setKawaseOverrideEnabled($event.target.checked)"
            >
            <span>覆盖半径/pass</span>
          </label>

          <div class="background-debug-mode-group background-debug-kernel-group" role="group" aria-label="Blur kernel">
            <button
              type="button"
              :class="['background-debug-mode-button', kawaseParams.kernel === BLUR_KERNEL_AUTO && 'background-debug-mode-button-active']"
              @click="setBlurKernel(BLUR_KERNEL_AUTO)"
            >
              Auto
            </button>
            <button
              type="button"
              :class="['background-debug-mode-button', kawaseParams.kernel === BLUR_KERNEL_DUAL_KAWASE && 'background-debug-mode-button-active']"
              @click="setBlurKernel(BLUR_KERNEL_DUAL_KAWASE)"
            >
              Dual
            </button>
            <button
              type="button"
              :class="['background-debug-mode-button', kawaseParams.kernel === BLUR_KERNEL_GAUSSIAN && 'background-debug-mode-button-active']"
              @click="setBlurKernel(BLUR_KERNEL_GAUSSIAN)"
            >
              Gaussian
            </button>
          </div>

          <label
            v-for="slider in activeBlurKernelSliders"
            :key="slider.key"
            class="background-debug-control"
          >
            <span>
              {{ slider.label }}
              <output>{{ formatValue(kawaseParams[slider.key], slider.digits) }}</output>
            </span>
            <input
              type="range"
              :min="slider.min"
              :max="slider.max"
              :step="slider.step"
              :value="kawaseParams[slider.key]"
              @input="updateKawaseNumber(slider.key, $event)"
            >
          </label>
          <div class="background-debug-detail" :title="blurKernelStatus">
            {{ blurKernelStatus }}
          </div>
        </div>

        <div class="background-debug-actions">
          <button type="button" class="background-debug-button" @click="resetBackgroundDebugParams">
            重置
          </button>
          <button type="button" class="background-debug-button" @click="copyParams">
            {{ acrylicCopyButtonLabel }}
          </button>
        </div>
      </div>

      <div v-else-if="canDebugLiveDesktop" class="background-debug-section">
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

        <div class="background-debug-mode-group background-debug-live-source-group" role="group" aria-label="Live desktop debug frame source override">
          <button
            type="button"
            :class="['background-debug-mode-button', !liveDesktopDebugFrameSourceOverride && 'background-debug-mode-button-active']"
            :disabled="isLiveDesktopActionBusy"
            @click="setLiveDesktopDebugFrameSourceOverride(null)"
          >
            WE Popup
          </button>
          <button
            type="button"
            :class="['background-debug-mode-button', liveDesktopDebugFrameSourceOverride === 'testPattern' && 'background-debug-mode-button-active']"
            :disabled="isLiveDesktopActionBusy"
            @click="setLiveDesktopDebugFrameSourceOverride('testPattern')"
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
            name="liveDesktopCssFallbackEffects"
            type="checkbox"
            :checked="liveDesktopCssFallbackEffects"
            :disabled="isLiveDesktopActionBusy"
            @change="setLiveDesktopCssFallbackEffects($event.target.checked)"
          >
          <span>CSS fallback 效果</span>
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
import {
  KAWASE_DEBUG_GAUSSIAN_CUTOFF_MAX,
  KAWASE_DEBUG_GAUSSIAN_CUTOFF_MIN,
  KAWASE_DEBUG_OFFSET_SCALE_MAX,
  KAWASE_DEBUG_OFFSET_SCALE_MIN,
  KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MAX,
  KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MIN,
  KAWASE_DEBUG_GAUSSIAN_RADIUS_SCALE_MAX,
  KAWASE_DEBUG_GAUSSIAN_RADIUS_SCALE_MIN,
  KAWASE_DEBUG_PASS_COUNT_MAX,
  KAWASE_DEBUG_PASS_COUNT_MIN,
  KAWASE_DEBUG_TEST_STRENGTH_MAX,
  KAWASE_DEBUG_TEST_STRENGTH_MIN,
  resetKawaseDebugParams,
  setKawaseDebugOverrideEnabled,
  updateKawaseDebugParams,
  useKawaseDebugOverrideEnabled,
  useKawaseDebugParams,
} from "../rendering/pixi/background/kawaseDebugParams.js";
import {
  BLUR_KERNEL_AUTO,
  BLUR_KERNEL_DUAL_KAWASE,
  BLUR_KERNEL_GAUSSIAN,
  resolveAutoBlurKernel,
  resolveAutoDualKawaseOffsetScale,
  resolveAutoGaussianRadiusPx,
} from "../domain/backgroundEffectPlan.js";
import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  clampBackgroundBlurStrength,
  normalizeBackgroundEffect,
} from "../composables/useLaunchpadSettingsConfig.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import {
  formatCount,
  formatFrameArrived,
  formatFrameTiming,
  formatLastFrame,
  formatLiveDesktopRates,
  formatPixelProbe,
  formatWindowMeta,
  formatWindowRect,
  formatWindowTitle,
  normalizeLiveDesktopStatus,
} from "./backgroundDebug/liveDesktopDiagnostics.js";
import {
  LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN,
  notifyLiveDesktopCompositorKeeperChanged,
  notifyLiveDesktopCssFallbackEffectsChanged,
  persistLiveDesktopCompositorKeeper,
  persistLiveDesktopCssFallbackEffects,
  persistLiveDesktopDebugFrameSourceOverride,
  persistLiveDesktopDisableMouseRelay,
  persistLiveDesktopForceDwmFlush,
  persistLiveDesktopSkipBlankFrames,
  readLiveDesktopCompositorKeeper,
  readLiveDesktopCssFallbackEffects,
  readLiveDesktopDebugFrameSourceOverride,
  readLiveDesktopDisableMouseRelay,
  readLiveDesktopForceDwmFlush,
  readLiveDesktopSkipBlankFrames,
} from "./backgroundDebug/liveDesktopDebugSettings.js";

const props = defineProps({
  state: {
    type: Object,
    default: null,
  },
});

const params = useAcrylicDebugParams();
const isOverrideEnabled = useAcrylicDebugOverrideEnabled();
const kawaseParams = useKawaseDebugParams();
const isKawaseOverrideEnabled = useKawaseDebugOverrideEnabled();
const isCollapsed = ref(false);
const activePanel = ref("acrylic");
const canDebugLiveDesktop = computed(() => isLiveDesktopExperimentEnabled());
const hasCopiedAcrylic = ref(false);
const hasCopiedDiagnostics = ref(false);
const liveDesktopDebugFrameSourceOverride = ref(canDebugLiveDesktop.value ? readLiveDesktopDebugFrameSourceOverride() : null);
const liveDesktopDisableMouseRelay = ref(canDebugLiveDesktop.value ? readLiveDesktopDisableMouseRelay() : true);
const liveDesktopCompositorKeeper = ref(canDebugLiveDesktop.value ? readLiveDesktopCompositorKeeper() : false);
const liveDesktopCssFallbackEffects = ref(canDebugLiveDesktop.value ? readLiveDesktopCssFallbackEffects() : false);
const liveDesktopSkipBlankFrames = ref(canDebugLiveDesktop.value ? readLiveDesktopSkipBlankFrames() : false);
const liveDesktopForceDwmFlush = ref(canDebugLiveDesktop.value ? readLiveDesktopForceDwmFlush() : false);
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
let kawaseLiveDesktopSyncTimer = null;

const sliders = [
  { key: "saturation", label: "saturation", min: 0.8, max: 1.8, step: 0.01, digits: 2 },
  { key: "contrast", label: "contrast", min: 0.75, max: 1.25, step: 0.01, digits: 2 },
  { key: "brightness", label: "brightness", min: 0.5, max: 1.2, step: 0.01, digits: 2 },
  { key: "tintStrength", label: "tintStrength", min: 0, max: 0.6, step: 0.01, digits: 2 },
  { key: "noise", label: "noise", min: 0, max: 0.06, step: 0.001, digits: 3 },
  { key: "seed", label: "seed", min: 0, max: 100, step: 0.01, digits: 2 },
];
const kawaseSliders = [
  {
    key: "passCount",
    label: "passCount",
    min: KAWASE_DEBUG_PASS_COUNT_MIN,
    max: KAWASE_DEBUG_PASS_COUNT_MAX,
    step: 1,
    digits: 0,
  },
  {
    key: "offsetScale",
    label: "radiusScale",
    min: KAWASE_DEBUG_OFFSET_SCALE_MIN,
    max: KAWASE_DEBUG_OFFSET_SCALE_MAX,
    step: 0.01,
    digits: 2,
  },
];
const gaussianSliders = [
  {
    key: "gaussianRadiusPx",
    label: "gaussianRadius",
    min: KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MAX,
    step: 0.25,
    digits: 2,
  },
];
const autoBlurKernelSliders = [
  {
    key: "testStrength",
    label: "testStrength",
    min: KAWASE_DEBUG_TEST_STRENGTH_MIN,
    max: KAWASE_DEBUG_TEST_STRENGTH_MAX,
    step: 1,
    digits: 0,
  },
  {
    key: "gaussianCutoff",
    label: "blurCutoff<=",
    min: KAWASE_DEBUG_GAUSSIAN_CUTOFF_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_CUTOFF_MAX,
    step: 1,
    digits: 0,
  },
  {
    key: "acrylicGaussianCutoff",
    label: "acrylicCutoff<=",
    min: KAWASE_DEBUG_GAUSSIAN_CUTOFF_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_CUTOFF_MAX,
    step: 1,
    digits: 0,
  },
  {
    key: "gaussianRadiusScale",
    label: "gaussianScale",
    min: KAWASE_DEBUG_GAUSSIAN_RADIUS_SCALE_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_RADIUS_SCALE_MAX,
    step: 0.01,
    digits: 2,
  },
  {
    key: "gaussianMaxRadiusPx",
    label: "gaussianMax",
    min: KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MAX,
    step: 0.25,
    digits: 2,
  },
  ...kawaseSliders,
];

const tintHex = computed(() => rgbArrayToHex(params.tintColor));
const activeBlurKernelSliders = computed(() => (
  kawaseParams.kernel === BLUR_KERNEL_AUTO
    ? autoBlurKernelSliders
    : kawaseParams.kernel === BLUR_KERNEL_GAUSSIAN
      ? gaussianSliders
      : kawaseSliders
));
const blurKernelStatus = computed(() => {
  const effect = normalizeBackgroundEffect(props.state?.draftBackgroundEffect?.value);
  const actualStrength = clampBackgroundBlurStrength(props.state?.draftBackgroundBlurStrength?.value);
  const testStrength = clampBackgroundBlurStrength(kawaseParams.testStrength);
  if (kawaseParams.kernel === BLUR_KERNEL_AUTO) {
    const resolvedKernel = resolveAutoBlurKernel(effect, testStrength, kawaseParams);
    const radius = resolveAutoGaussianRadiusPx(testStrength, kawaseParams);
    const cutoff = effect === BACKGROUND_EFFECT_ACRYLIC_WEBGL
      ? kawaseParams.acrylicGaussianCutoff
      : kawaseParams.gaussianCutoff;
    const offsetScale = resolveAutoDualKawaseOffsetScale(effect, testStrength, kawaseParams);
    const branchDetail = resolvedKernel === BLUR_KERNEL_GAUSSIAN
      ? ` radius=${radius.toFixed(2)}px`
      : ` pass=${Number(kawaseParams.passCount).toFixed(0)} radiusScale=${offsetScale.toFixed(2)} base=${Number(kawaseParams.offsetScale).toFixed(2)}`;
    return `auto ${formatEffectLabel(effect)} actual=${actualStrength} test=${testStrength} cutoff<=${Number(cutoff).toFixed(0)} -> ${resolvedKernel}${branchDetail}`;
  }
  if (kawaseParams.kernel === BLUR_KERNEL_GAUSSIAN) {
    return `manual gaussian radius=${Number(kawaseParams.gaussianRadiusPx).toFixed(2)}px`;
  }
  return `manual dual pass=${Number(kawaseParams.passCount).toFixed(0)} radiusScale=${Number(kawaseParams.offsetScale).toFixed(2)}`;
});
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
    { label: "shaderFallbacks", value: formatCount(diagnostics.shaderCopyFallbacks) },
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
    {
      label: "abandonedWorkers",
      value: `${formatCount(diagnostics.abandonedRendererWorkers)} active / ${formatCount(diagnostics.reapedAbandonedRendererWorkers)} reaped`,
      wide: true,
    },
    { label: "pixelProbe", value: formatPixelProbe(diagnostics), wide: true },
    { label: "lastFrame", value: formatLastFrame(diagnostics), wide: true },
    ...(diagnostics.lastAbandonedRendererReason
      ? [{ label: "lastAbandoned", value: diagnostics.lastAbandonedRendererReason, wide: true }]
      : []),
    ...(diagnostics.lastShaderCopyError
      ? [{ label: "lastShaderFallback", value: diagnostics.lastShaderCopyError, wide: true }]
      : []),
  ];
});
const liveDesktopLastError = computed(() => liveDesktopStatus.value.diagnostics.lastError);
const liveDesktopWindowDiagnostics = computed(() => liveDesktopStatus.value.windowDiagnostics);
const liveDesktopCandidateWindows = computed(() => liveDesktopWindowDiagnostics.value.candidates.slice(0, 5));
const liveDesktopWindowRows = computed(() => {
  const diagnostics = liveDesktopWindowDiagnostics.value;
  return [
    { label: "windowDiag", value: diagnostics.available ? "available" : diagnostics.reason || "-", wide: true },
    { label: "windows", value: formatCount(diagnostics.windowCount) },
    { label: "candidates", value: formatCount(diagnostics.candidateCount) },
  ];
});

function formatValue(value, digits) {
  return Number(value).toFixed(digits);
}

function formatEffectLabel(effect) {
  if (effect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) return "acrylic";
  if (effect === BACKGROUND_EFFECT_BLUR) return "blur";
  return effect;
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

function updateNumber(key, event) {
  updateAcrylicDebugParams({ [key]: Number(event.target.value) });
}

function syncLiveDesktopDebugEffects(options = {}) {
  if (!canDebugLiveDesktop.value) return;
  const delay = Number.isFinite(Number(options.delay)) ? Number(options.delay) : 80;
  if (kawaseLiveDesktopSyncTimer != null) window.clearTimeout(kawaseLiveDesktopSyncTimer);
  if (delay <= 0) {
    kawaseLiveDesktopSyncTimer = null;
    props.state?.syncLiveDesktopBackgroundRuntime?.();
    return;
  }
  kawaseLiveDesktopSyncTimer = window.setTimeout(() => {
    kawaseLiveDesktopSyncTimer = null;
    props.state?.syncLiveDesktopBackgroundRuntime?.();
  }, delay);
}

function setKawaseOverrideEnabled(enabled) {
  setKawaseDebugOverrideEnabled(enabled);
  syncLiveDesktopDebugEffects({ delay: 0 });
}

function setBlurKernel(kernel) {
  updateKawaseDebugParams({ kernel });
  syncLiveDesktopDebugEffects({ delay: 0 });
}

function updateKawaseNumber(key, event) {
  updateKawaseDebugParams({ [key]: Number(event.target.value) });
  syncLiveDesktopDebugEffects();
}

function resetBackgroundDebugParams() {
  resetAcrylicDebugParams();
  resetKawaseDebugParams();
  syncLiveDesktopDebugEffects({ delay: 0 });
}

function updateTintColor(event) {
  updateAcrylicDebugParams({
    tintColor: hexToRgbArray(event.target.value, params.tintColor),
  });
}

async function setLiveDesktopDisableMouseRelay(disabled) {
  if (!canDebugLiveDesktop.value) return;
  liveDesktopDisableMouseRelay.value = Boolean(disabled);
  liveDesktopRateSample = null;
  persistLiveDesktopDisableMouseRelay(liveDesktopDisableMouseRelay.value);
  await reconfigureLiveDesktopRuntime({
    restart: liveDesktopDebugFrameSourceOverride.value !== LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN,
  });
}

function setLiveDesktopCompositorKeeper(enabled) {
  if (!canDebugLiveDesktop.value) return;
  liveDesktopCompositorKeeper.value = Boolean(enabled);
  persistLiveDesktopCompositorKeeper(liveDesktopCompositorKeeper.value);
  notifyLiveDesktopCompositorKeeperChanged(liveDesktopCompositorKeeper.value);
}

async function setLiveDesktopCssFallbackEffects(enabled) {
  if (!canDebugLiveDesktop.value) return;
  liveDesktopCssFallbackEffects.value = Boolean(enabled);
  persistLiveDesktopCssFallbackEffects(liveDesktopCssFallbackEffects.value);
  notifyLiveDesktopCssFallbackEffectsChanged(liveDesktopCssFallbackEffects.value);
  await reconfigureLiveDesktopRuntime();
}

async function setLiveDesktopSkipBlankFrames(enabled) {
  if (!canDebugLiveDesktop.value) return;
  liveDesktopSkipBlankFrames.value = Boolean(enabled);
  liveDesktopRateSample = null;
  persistLiveDesktopSkipBlankFrames(liveDesktopSkipBlankFrames.value);
  await reconfigureLiveDesktopRuntime();
}

async function setLiveDesktopForceDwmFlush(enabled) {
  if (!canDebugLiveDesktop.value) return;
  liveDesktopForceDwmFlush.value = Boolean(enabled);
  liveDesktopRateSample = null;
  persistLiveDesktopForceDwmFlush(liveDesktopForceDwmFlush.value);
  await reconfigureLiveDesktopRuntime();
}

async function setLiveDesktopDebugFrameSourceOverride(frameSourceOverride) {
  if (!canDebugLiveDesktop.value) return;
  const normalizedFrameSourceOverride = frameSourceOverride === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
    ? LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
    : null;
  liveDesktopDebugFrameSourceOverride.value = normalizedFrameSourceOverride;
  liveDesktopRateSample = null;
  persistLiveDesktopDebugFrameSourceOverride(normalizedFrameSourceOverride);
  await reconfigureLiveDesktopRuntime({ restart: true });
}

async function refreshLiveDesktopRuntimeStatus() {
  if (!canDebugLiveDesktop.value) return;
  try {
    await props.state?.refreshLiveDesktopRuntimeStatus?.();
    updateLiveDesktopRates();
  } catch (error) {
    console.warn("Failed to refresh live desktop runtime status", error);
  }
}

async function reconfigureLiveDesktopRuntime(options = {}) {
  if (!canDebugLiveDesktop.value) return;
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
  if (!canDebugLiveDesktop.value) return;
  try {
    await copyToClipboard(
      JSON.stringify(
        {
          debugFrameSourceOverride: liveDesktopDebugFrameSourceOverride.value,
          disableMouseRelay: liveDesktopDisableMouseRelay.value,
          cssFallbackEffects: liveDesktopCssFallbackEffects.value,
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
    || !canDebugLiveDesktop.value
    || isCollapsed.value
    || activePanel.value !== "liveDesktop"
    || typeof props.state?.refreshLiveDesktopRuntimeStatus !== "function"
  ) {
    return;
  }
  liveDesktopDebugFrameSourceOverride.value = readLiveDesktopDebugFrameSourceOverride();
  liveDesktopCssFallbackEffects.value = readLiveDesktopCssFallbackEffects();
  liveDesktopSkipBlankFrames.value = readLiveDesktopSkipBlankFrames();
  liveDesktopForceDwmFlush.value = readLiveDesktopForceDwmFlush();
  liveDesktopRateSample = null;
  refreshLiveDesktopRuntimeStatus();
  liveDesktopRuntimePollTimer = window.setInterval(refreshLiveDesktopRuntimeStatus, 1000);
}

watch(canDebugLiveDesktop, (enabled) => {
  if (!enabled && activePanel.value === "liveDesktop") activePanel.value = "acrylic";
}, { immediate: true });

watch([isCollapsed, activePanel, canDebugLiveDesktop], restartLiveDesktopRuntimePoller, { flush: "post" });

onMounted(restartLiveDesktopRuntimePoller);

onBeforeUnmount(() => {
  if (acrylicCopyStateTimer != null) window.clearTimeout(acrylicCopyStateTimer);
  if (diagnosticsCopyStateTimer != null) window.clearTimeout(diagnosticsCopyStateTimer);
  if (kawaseLiveDesktopSyncTimer != null) window.clearTimeout(kawaseLiveDesktopSyncTimer);
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

.background-debug-subsection {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding-top: 9px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.background-debug-subtitle {
  color: rgba(255, 255, 255, 0.52);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.2;
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

.background-debug-kernel-group {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.background-debug-live-source-group {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  justify-content: flex-start;
  gap: 10px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  line-height: 1.2;
}

.background-debug-toggle input {
  flex: none;
  accent-color: rgba(255, 255, 255, 0.92);
}

.background-debug-toggle span {
  min-width: 0;
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
