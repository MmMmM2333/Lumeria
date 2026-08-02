<template>
  <div class="background-debug-section">
    <div class="background-debug-subtitle">状态一致性</div>
    <dl class="background-debug-status-grid">
      <div
        v-for="row in liveDesktopConsistencyRows"
        :key="row.label"
        :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
      >
        <dt>{{ row.label }}</dt>
        <dd :title="row.value">{{ row.value }}</dd>
      </div>
    </dl>

    <div class="background-debug-subtitle">原生运行时</div>
    <dl class="background-debug-status-grid">
      <div
        v-for="row in liveDesktopStatusRows"
        :key="row.label"
        :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
      >
        <dt>{{ row.label }}</dt>
        <dd :title="row.value">{{ row.value }}</dd>
      </div>
    </dl>

    <pre class="background-debug-detail" :title="liveDesktopStatus.detail">{{ liveDesktopStatus.detail || "暂无运行时详情" }}</pre>

    <div class="background-debug-mode-group background-debug-live-source-group" role="group" aria-label="Live Desktop 调试帧源覆盖">
      <button
        type="button"
        :class="['background-debug-mode-button', !liveDesktopDebugFrameSourceOverride && 'background-debug-mode-button-active']"
        :disabled="isLiveDesktopActionBusy"
        @click="setLiveDesktopDebugFrameSourceOverride(null)"
      >
        Wallpaper Engine 窗口
      </button>
      <button
        type="button"
        :class="['background-debug-mode-button', liveDesktopDebugFrameSourceOverride === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN && 'background-debug-mode-button-active']"
        :disabled="isLiveDesktopActionBusy"
        @click="setLiveDesktopDebugFrameSourceOverride(LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN)"
      >
        测试图案
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
      <span>CSS 后备效果</span>
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

    <div class="background-debug-subtitle">帧与合成指标</div>
    <dl class="background-debug-diagnostics">
      <div
        v-for="row in liveDesktopDiagnosticsRows"
        :key="row.label"
        :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
      >
        <dt>{{ row.label }}</dt>
        <dd :title="row.value">{{ row.value }}</dd>
      </div>
    </dl>

    <div class="background-debug-subtitle">窗口发现</div>
    <dl class="background-debug-diagnostics">
      <div
        v-for="row in liveDesktopWindowRows"
        :key="row.label"
        :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
      >
        <dt>{{ row.label }}</dt>
        <dd :title="row.value">{{ row.value }}</dd>
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
        <strong>没有 Live Desktop 候选窗口</strong>
        <span>{{ liveDesktopWindowDiagnostics.detail || liveDesktopWindowDiagnostics.reason || "尚未获得窗口诊断" }}</span>
      </article>
    </div>

    <div v-if="liveDesktopLastError" class="background-debug-error" :title="liveDesktopLastError">
      {{ liveDesktopLastError }}
    </div>

    <div class="background-debug-actions background-debug-live-actions">
      <button type="button" class="background-debug-button" :disabled="isLiveDesktopActionBusy" @click="refreshLiveDesktopRuntimeStatus">
        刷新
      </button>
      <button
        type="button"
        class="background-debug-button"
        :disabled="isLiveDesktopActionBusy"
        @click="reconfigureLiveDesktopRuntime"
      >
        {{ isLiveDesktopActionBusy ? "处理中" : "重新应用" }}
      </button>
      <button type="button" class="background-debug-button" :disabled="isCopyingDiagnostics" @click="copyDiagnostics">
        {{ diagnosticsCopyButtonLabel }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { diagnosticClient } from "../../diagnostics/diagnosticClient.js";
import { formatDiagnosticActionError } from "./diagnosticUiError.js";
import {
  DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS,
  LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN,
} from "../../diagnostics/liveDesktopDebugSettings.js";
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
} from "./liveDesktopDiagnostics.js";

const props = defineProps({
  active: {
    type: Boolean,
    default: false,
  },
  support: {
    type: Object,
    default: null,
  },
});

const SETTING_LABELS = Object.freeze({
  compositorKeeper: "合成稳定器",
  cssFallbackEffects: "CSS 后备效果",
  debugFrameSourceOverride: "调试帧源",
  disableMouseRelay: "禁用鼠标转发",
  forceDwmFlush: "强制 DWM Flush",
  skipBlankFrames: "跳过空白帧",
});
const PHASE_LABELS = Object.freeze({
  applying: "正在应用",
  failed: "失败",
  persisting: "正在保存",
  ready: "就绪",
  refreshing: "正在刷新",
  running: "运行中",
  stopped: "已停止",
  unknown: "未知",
});
const CONSISTENCY_LABELS = Object.freeze({
  consistent: "一致",
  drifted: "存在漂移",
  unverified: "未验证",
});
const VERIFICATION_LABELS = Object.freeze({
  "frontend-event-dispatched": "前端事件已分发",
  "runtime-accepted": "运行时已接受",
  unknown: "未知",
});

const hasCopiedDiagnostics = ref(false);
const isCopyingDiagnostics = ref(false);
const isLiveDesktopActionBusy = ref(false);
const liveDesktopActionError = ref("");
const liveDesktopPollError = ref("");
const liveDesktopDiagnosticState = ref(null);
const liveDesktopRates = ref(makeEmptyRates());
let copyStateTimer = null;
let liveDesktopRateSample = null;
let runtimePollTimer = null;

const liveDesktopDesiredSettings = computed(() => (
  liveDesktopDiagnosticState.value?.desired?.values || DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS
));
const liveDesktopDebugFrameSourceOverride = computed(() => liveDesktopDesiredSettings.value.debugFrameSourceOverride);
const liveDesktopDisableMouseRelay = computed(() => liveDesktopDesiredSettings.value.disableMouseRelay);
const liveDesktopCompositorKeeper = computed(() => liveDesktopDesiredSettings.value.compositorKeeper);
const liveDesktopCssFallbackEffects = computed(() => liveDesktopDesiredSettings.value.cssFallbackEffects);
const liveDesktopSkipBlankFrames = computed(() => liveDesktopDesiredSettings.value.skipBlankFrames);
const liveDesktopForceDwmFlush = computed(() => liveDesktopDesiredSettings.value.forceDwmFlush);
const liveDesktopStatus = computed(() => normalizeLiveDesktopStatus(liveDesktopDiagnosticState.value?.runtimeStatus));
const diagnosticsCopyButtonLabel = computed(() => (hasCopiedDiagnostics.value ? "已复制" : "复制诊断 JSON"));

function formatProtocolValue(value, labels) {
  const code = String(value || "unknown");
  return `${labels[code] || code} (${code})`;
}

function formatSettingNames(names = []) {
  return names.map((name) => `${SETTING_LABELS[name] || name} (${name})`).join("、") || "无";
}

const liveDesktopConsistencyRows = computed(() => {
  const state = liveDesktopDiagnosticState.value;
  const consistency = state?.consistency;
  const drift = [
    ...(consistency?.desiredVsApplied || []).map((name) => `${SETTING_LABELS[name] || name} → 已应用`),
    ...(consistency?.desiredVsPersisted || []).map((name) => `${SETTING_LABELS[name] || name} → 已持久化`),
  ];
  return [
    { label: "控制器状态", value: state ? formatProtocolValue(state.phase, PHASE_LABELS) : "未连接" },
    { label: "一致性", value: consistency ? formatProtocolValue(consistency.status, CONSISTENCY_LABELS) : "未验证" },
    { label: "期望版本", value: String(state?.desired?.revision ?? 0) },
    { label: "应用确认", value: formatProtocolValue(state?.applied?.verification, VERIFICATION_LABELS) },
    { label: "未确认设置", value: formatSettingNames(consistency?.unconfirmedAppliedKeys), wide: true },
    { label: "状态漂移", value: drift.join("、") || "无", wide: true },
    ...(state?.lastFailure
      ? [{
        label: "最近失败",
        value: `[${state.lastFailure.stage}/${state.lastFailure.code}] ${state.lastFailure.message}`,
        wide: true,
      }]
      : []),
    ...(state?.lastRefreshFailure
      ? [{
        label: "最近刷新失败",
        value: `[refresh/${state.lastRefreshFailure.code}] ${state.lastRefreshFailure.message}`,
        wide: true,
      }]
      : []),
  ];
});

const liveDesktopStatusRows = computed(() => {
  const status = liveDesktopStatus.value;
  return [
    { label: "阶段", value: formatProtocolValue(status.phase, PHASE_LABELS) },
    { label: "是否活跃", value: status.active ? "是" : "否" },
    { label: "代次", value: formatCount(status.generation) },
    { label: "原因", value: status.reason || "-", wide: true },
  ];
});

const liveDesktopDiagnosticsRows = computed(() => {
  const diagnostics = liveDesktopStatus.value.diagnostics;
  return [
    { label: "已复制帧", value: formatCount(diagnostics.framesCopied) },
    { label: "帧超时", value: formatCount(diagnostics.frameTimeouts) },
    { label: "复制错误", value: formatCount(diagnostics.copyErrors) },
    { label: "提交错误", value: formatCount(diagnostics.commitErrors) },
    { label: "Shader 后备", value: formatCount(diagnostics.shaderCopyFallbacks) },
    { label: "实时速率", value: formatLiveDesktopRates(liveDesktopRates.value), wide: true },
    { label: "帧到达信号", value: formatFrameArrived(diagnostics), wide: true },
    {
      label: "帧复制耗时",
      value: formatFrameTiming(
        diagnostics.frameCopySamples,
        diagnostics.frameCopyMicrosTotal,
        diagnostics.lastFrameCopyMicros,
        diagnostics.maxFrameCopyMicros,
      ),
      wide: true,
    },
    {
      label: "帧提交耗时",
      value: formatFrameTiming(
        diagnostics.frameCommitSamples,
        diagnostics.frameCommitMicrosTotal,
        diagnostics.lastFrameCommitMicros,
        diagnostics.maxFrameCommitMicros,
      ),
      wide: true,
    },
    { label: "配置更新", value: formatCount(diagnostics.configUpdates) },
    { label: "配置错误", value: formatCount(diagnostics.configErrors) },
    { label: "测试图案帧", value: formatCount(diagnostics.testPatternFrames) },
    { label: "跳过空白帧", value: formatCount(diagnostics.blankFrameSkips) },
    {
      label: "遗留渲染线程",
      value: `活跃 ${formatCount(diagnostics.abandonedRendererWorkers)} / 已回收 ${formatCount(diagnostics.reapedAbandonedRendererWorkers)}`,
      wide: true,
    },
    { label: "像素探针", value: formatPixelProbe(diagnostics), wide: true },
    { label: "最近一帧", value: formatLastFrame(diagnostics), wide: true },
    ...(diagnostics.lastAbandonedRendererReason
      ? [{ label: "最近遗留原因", value: diagnostics.lastAbandonedRendererReason, wide: true }]
      : []),
    ...(diagnostics.lastShaderCopyError
      ? [{ label: "最近 Shader 后备错误", value: diagnostics.lastShaderCopyError, wide: true }]
      : []),
  ];
});

const liveDesktopLastError = computed(() => liveDesktopActionError.value
  || (liveDesktopDiagnosticState.value?.lastFailure
    ? formatDiagnosticActionError("Live Desktop 状态变更", liveDesktopDiagnosticState.value.lastFailure)
    : "")
  || liveDesktopPollError.value
  || (liveDesktopDiagnosticState.value?.lastRefreshFailure
    ? formatDiagnosticActionError("Live Desktop 状态刷新", liveDesktopDiagnosticState.value.lastRefreshFailure)
    : "")
  || liveDesktopStatus.value.diagnostics.lastError);
const liveDesktopWindowDiagnostics = computed(() => liveDesktopStatus.value.windowDiagnostics);
const liveDesktopCandidateWindows = computed(() => liveDesktopWindowDiagnostics.value.candidates.slice(0, 5));
const liveDesktopWindowRows = computed(() => {
  const diagnostics = liveDesktopWindowDiagnostics.value;
  return [
    { label: "窗口诊断", value: diagnostics.available ? "可用" : diagnostics.reason || "不可用", wide: true },
    { label: "发现窗口", value: formatCount(diagnostics.windowCount) },
    { label: "候选窗口", value: formatCount(diagnostics.candidateCount) },
  ];
});

function makeEmptyRates() {
  return {
    arrivedPerSecond: 0,
    copyErrorsPerSecond: 0,
    droppedPerSecond: 0,
    framesPerSecond: 0,
    timeoutsPerSecond: 0,
  };
}

function updateLiveDesktopRates() {
  const diagnostics = liveDesktopStatus.value.diagnostics;
  const now = Date.now();
  if (!liveDesktopRateSample || now <= liveDesktopRateSample.measuredAt) {
    liveDesktopRateSample = {
      copyErrors: diagnostics.copyErrors,
      frameArrivedDroppedSignals: diagnostics.frameArrivedDroppedSignals,
      frameArrivedEvents: diagnostics.frameArrivedEvents,
      frameTimeouts: diagnostics.frameTimeouts,
      framesCopied: diagnostics.framesCopied,
      measuredAt: now,
    };
    liveDesktopRates.value = makeEmptyRates();
    return;
  }
  const elapsedSeconds = Math.max(0.001, (now - liveDesktopRateSample.measuredAt) / 1000);
  liveDesktopRates.value = {
    arrivedPerSecond: Math.max(0, (diagnostics.frameArrivedEvents - liveDesktopRateSample.frameArrivedEvents) / elapsedSeconds),
    copyErrorsPerSecond: Math.max(0, (diagnostics.copyErrors - liveDesktopRateSample.copyErrors) / elapsedSeconds),
    droppedPerSecond: Math.max(0, (diagnostics.frameArrivedDroppedSignals - liveDesktopRateSample.frameArrivedDroppedSignals) / elapsedSeconds),
    framesPerSecond: Math.max(0, (diagnostics.framesCopied - liveDesktopRateSample.framesCopied) / elapsedSeconds),
    timeoutsPerSecond: Math.max(0, (diagnostics.frameTimeouts - liveDesktopRateSample.frameTimeouts) / elapsedSeconds),
  };
  liveDesktopRateSample = {
    copyErrors: diagnostics.copyErrors,
    frameArrivedDroppedSignals: diagnostics.frameArrivedDroppedSignals,
    frameArrivedEvents: diagnostics.frameArrivedEvents,
    frameTimeouts: diagnostics.frameTimeouts,
    framesCopied: diagnostics.framesCopied,
    measuredAt: now,
  };
}

async function runLiveDesktopDiagnosticAction(operation, params = {}, actionLabel = operation, behavior = {}) {
  if (isLiveDesktopActionBusy.value) return null;
  const errorState = behavior.errorState || liveDesktopActionError;
  isLiveDesktopActionBusy.value = true;
  try {
    const state = await diagnosticClient.invoke("live-desktop", operation, params);
    if (!state || state.schema !== "lumeria-live-desktop-diagnostics-state/v1") {
      throw new Error("Live Desktop 诊断工具返回了无效状态");
    }
    liveDesktopDiagnosticState.value = state;
    errorState.value = "";
    updateLiveDesktopRates();
    return state;
  } catch (error) {
    errorState.value = formatDiagnosticActionError(actionLabel, error);
    return null;
  } finally {
    isLiveDesktopActionBusy.value = false;
  }
}

function updateLiveDesktopDiagnosticSettings(patch) {
  liveDesktopRateSample = null;
  return runLiveDesktopDiagnosticAction("settings.update", { patch }, "更新设置");
}

function setLiveDesktopDisableMouseRelay(disabled) {
  return updateLiveDesktopDiagnosticSettings({ disableMouseRelay: Boolean(disabled) });
}

function setLiveDesktopCompositorKeeper(enabled) {
  return updateLiveDesktopDiagnosticSettings({ compositorKeeper: Boolean(enabled) });
}

function setLiveDesktopCssFallbackEffects(enabled) {
  return updateLiveDesktopDiagnosticSettings({ cssFallbackEffects: Boolean(enabled) });
}

function setLiveDesktopSkipBlankFrames(enabled) {
  return updateLiveDesktopDiagnosticSettings({ skipBlankFrames: Boolean(enabled) });
}

function setLiveDesktopForceDwmFlush(enabled) {
  return updateLiveDesktopDiagnosticSettings({ forceDwmFlush: Boolean(enabled) });
}

function setLiveDesktopDebugFrameSourceOverride(frameSourceOverride) {
  return updateLiveDesktopDiagnosticSettings({
    debugFrameSourceOverride: frameSourceOverride === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      ? LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      : null,
  });
}

function refreshLiveDesktopRuntimeStatus() {
  return runLiveDesktopDiagnosticAction("runtime.refresh", {}, "刷新状态");
}

function reconfigureLiveDesktopRuntime() {
  return runLiveDesktopDiagnosticAction("runtime.apply", {}, "重新应用设置");
}

function markDiagnosticsCopied() {
  hasCopiedDiagnostics.value = true;
  if (copyStateTimer != null) window.clearTimeout(copyStateTimer);
  copyStateTimer = window.setTimeout(() => {
    copyStateTimer = null;
    hasCopiedDiagnostics.value = false;
  }, 1200);
}

async function copyDiagnostics() {
  if (isCopyingDiagnostics.value) return;
  isCopyingDiagnostics.value = true;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API 不可用");
    const diagnosticsState = await diagnosticClient.invoke("live-desktop", "state.read");
    const bundle = {
      capturedAt: new Date().toISOString(),
      diagnosticsState,
      schema: "lumeria-live-desktop-diagnostic-bundle/v1",
      support: props.support,
    };
    await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
    liveDesktopDiagnosticState.value = diagnosticsState;
    liveDesktopActionError.value = "";
    markDiagnosticsCopied();
  } catch (error) {
    liveDesktopActionError.value = formatDiagnosticActionError("复制诊断", error);
  } finally {
    isCopyingDiagnostics.value = false;
  }
}

function clearPoller() {
  if (runtimePollTimer == null) return;
  window.clearInterval(runtimePollTimer);
  runtimePollTimer = null;
}

function syncPoller() {
  clearPoller();
  if (!props.active || typeof window === "undefined") return;
  liveDesktopRateSample = null;
  const poll = () => runLiveDesktopDiagnosticAction(
    "runtime.refresh",
    {},
    "自动刷新状态",
    { errorState: liveDesktopPollError },
  );
  void poll();
  runtimePollTimer = window.setInterval(() => void poll(), 1000);
}

watch(() => props.active, syncPoller, { flush: "post", immediate: true });

onBeforeUnmount(() => {
  clearPoller();
  if (copyStateTimer != null) window.clearTimeout(copyStateTimer);
});
</script>
