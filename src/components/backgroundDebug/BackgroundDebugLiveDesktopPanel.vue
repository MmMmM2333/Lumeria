<template>
  <div class="background-debug-section">
    <div class="background-debug-subtitle">{{ t("debug.liveDesktop.sections.consistency") }}</div>
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

    <div class="background-debug-subtitle">{{ t("debug.liveDesktop.sections.runtime") }}</div>
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

    <pre class="background-debug-detail" :title="liveDesktopStatus.detail">{{ liveDesktopStatus.detail || t("debug.liveDesktop.runtimeDetailEmpty") }}</pre>

    <div class="background-debug-mode-group background-debug-live-source-group" role="group" :aria-label="t('debug.liveDesktop.frameSource.aria')">
      <button
        type="button"
        :class="['background-debug-mode-button', !liveDesktopDebugFrameSourceOverride && 'background-debug-mode-button-active']"
        :disabled="isLiveDesktopActionBusy"
        @click="setLiveDesktopDebugFrameSourceOverride(null)"
      >
        {{ t("debug.liveDesktop.frameSource.wallpaperEngine") }}
      </button>
      <button
        type="button"
        :class="['background-debug-mode-button', liveDesktopDebugFrameSourceOverride === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN && 'background-debug-mode-button-active']"
        :disabled="isLiveDesktopActionBusy"
        @click="setLiveDesktopDebugFrameSourceOverride(LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN)"
      >
        {{ t("debug.liveDesktop.frameSource.testPattern") }}
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
      <span>{{ t("debug.liveDesktop.settings.disableMouseRelay") }}</span>
    </label>

    <label class="background-debug-toggle">
      <input
        name="liveDesktopCompositorKeeper"
        type="checkbox"
        :checked="liveDesktopCompositorKeeper"
        :disabled="isLiveDesktopActionBusy"
        @change="setLiveDesktopCompositorKeeper($event.target.checked)"
      >
      <span>{{ t("debug.liveDesktop.settings.compositorKeeper") }}</span>
    </label>

    <label class="background-debug-toggle">
      <input
        name="liveDesktopCssFallbackEffects"
        type="checkbox"
        :checked="liveDesktopCssFallbackEffects"
        :disabled="isLiveDesktopActionBusy"
        @change="setLiveDesktopCssFallbackEffects($event.target.checked)"
      >
      <span>{{ t("debug.liveDesktop.settings.cssFallbackEffects") }}</span>
    </label>

    <label class="background-debug-toggle">
      <input
        name="liveDesktopSkipBlankFrames"
        type="checkbox"
        :checked="liveDesktopSkipBlankFrames"
        :disabled="isLiveDesktopActionBusy"
        @change="setLiveDesktopSkipBlankFrames($event.target.checked)"
      >
      <span>{{ t("debug.liveDesktop.settings.skipBlankFrames") }}</span>
    </label>

    <label class="background-debug-toggle">
      <input
        name="liveDesktopForceDwmFlush"
        type="checkbox"
        :checked="liveDesktopForceDwmFlush"
        :disabled="isLiveDesktopActionBusy"
        @change="setLiveDesktopForceDwmFlush($event.target.checked)"
      >
      <span>{{ t("debug.liveDesktop.settings.forceDwmFlush") }}</span>
    </label>

    <div class="background-debug-subtitle">{{ t("debug.liveDesktop.sections.metrics") }}</div>
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

    <div class="background-debug-subtitle">{{ t("debug.liveDesktop.sections.windows") }}</div>
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
        <strong>{{ formatWindowTitle(windowInfo, t) }}</strong>
        <span>{{ formatWindowMeta(windowInfo, t) }}</span>
        <span>{{ formatWindowRect(windowInfo.rect) }}</span>
      </article>
      <article v-if="liveDesktopCandidateWindows.length === 0" class="background-debug-window-card">
        <strong>{{ t("debug.liveDesktop.windows.emptyTitle") }}</strong>
        <span>{{ liveDesktopWindowDiagnostics.detail || liveDesktopWindowDiagnostics.reason || t("debug.liveDesktop.windows.emptyDetail") }}</span>
      </article>
    </div>

    <div v-if="liveDesktopLastError" class="background-debug-error" :title="liveDesktopLastError">
      {{ liveDesktopLastError }}
    </div>

    <div class="background-debug-actions background-debug-live-actions">
      <button type="button" class="background-debug-button" :disabled="isLiveDesktopActionBusy" @click="refreshLiveDesktopRuntimeStatus">
        {{ t("debug.common.refresh") }}
      </button>
      <button
        type="button"
        class="background-debug-button"
        :disabled="isLiveDesktopActionBusy"
        @click="reconfigureLiveDesktopRuntime"
      >
        {{ t(isLiveDesktopActionBusy ? "debug.common.processing" : "debug.liveDesktop.actions.reapply") }}
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
import { useLocalization } from "../../i18n/localization.js";
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
const { t } = useLocalization();

const SETTING_LABEL_KEYS = Object.freeze({
  compositorKeeper: "debug.liveDesktop.settings.compositorKeeper",
  cssFallbackEffects: "debug.liveDesktop.settings.cssFallbackEffects",
  debugFrameSourceOverride: "debug.liveDesktop.settings.debugFrameSourceOverride",
  disableMouseRelay: "debug.liveDesktop.settings.disableMouseRelay",
  forceDwmFlush: "debug.liveDesktop.settings.forceDwmFlush",
  skipBlankFrames: "debug.liveDesktop.settings.skipBlankFramesShort",
});
const PHASE_LABEL_KEYS = Object.freeze({
  applying: "debug.liveDesktop.phase.applying",
  failed: "debug.liveDesktop.phase.failed",
  persisting: "debug.liveDesktop.phase.persisting",
  ready: "debug.liveDesktop.phase.ready",
  refreshing: "debug.liveDesktop.phase.refreshing",
  running: "debug.liveDesktop.phase.running",
  stopped: "debug.liveDesktop.phase.stopped",
  unknown: "debug.liveDesktop.phase.unknown",
});
const CONSISTENCY_LABEL_KEYS = Object.freeze({
  consistent: "debug.liveDesktop.consistency.consistent",
  drifted: "debug.liveDesktop.consistency.drifted",
  unverified: "debug.liveDesktop.consistency.unverified",
});
const VERIFICATION_LABEL_KEYS = Object.freeze({
  "frontend-event-dispatched": "debug.liveDesktop.verification.frontend-event-dispatched",
  "runtime-accepted": "debug.liveDesktop.verification.runtime-accepted",
  unknown: "debug.liveDesktop.verification.unknown",
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
const diagnosticsCopyButtonLabel = computed(() => t(hasCopiedDiagnostics.value ? "debug.common.copied" : "debug.liveDesktop.actions.copyDiagnosticsJson"));

function formatProtocolValue(value, labels) {
  const code = String(value || "unknown");
  return `${labels[code] ? t(labels[code]) : code} (${code})`;
}

function formatSettingNames(names = []) {
  return names
    .map((name) => `${SETTING_LABEL_KEYS[name] ? t(SETTING_LABEL_KEYS[name]) : name} (${name})`)
    .join(t("debug.common.listSeparator")) || t("debug.common.none");
}

const liveDesktopConsistencyRows = computed(() => {
  const state = liveDesktopDiagnosticState.value;
  const consistency = state?.consistency;
  const drift = [
    ...(consistency?.desiredVsApplied || []).map((name) => t("debug.liveDesktop.consistency.applied", {
      name: SETTING_LABEL_KEYS[name] ? t(SETTING_LABEL_KEYS[name]) : name,
    })),
    ...(consistency?.desiredVsPersisted || []).map((name) => t("debug.liveDesktop.consistency.persisted", {
      name: SETTING_LABEL_KEYS[name] ? t(SETTING_LABEL_KEYS[name]) : name,
    })),
  ];
  return [
    { label: t("debug.liveDesktop.fields.controllerState"), value: state ? formatProtocolValue(state.phase, PHASE_LABEL_KEYS) : t("debug.common.notConnected") },
    { label: t("debug.liveDesktop.fields.consistency"), value: consistency ? formatProtocolValue(consistency.status, CONSISTENCY_LABEL_KEYS) : t("debug.liveDesktop.consistency.unverified") },
    { label: t("debug.liveDesktop.fields.desiredRevision"), value: String(state?.desired?.revision ?? 0) },
    { label: t("debug.liveDesktop.fields.appliedVerification"), value: formatProtocolValue(state?.applied?.verification, VERIFICATION_LABEL_KEYS) },
    { label: t("debug.liveDesktop.fields.unconfirmedSettings"), value: formatSettingNames(consistency?.unconfirmedAppliedKeys), wide: true },
    { label: t("debug.liveDesktop.fields.stateDrift"), value: drift.join(t("debug.common.listSeparator")) || t("debug.common.none"), wide: true },
    ...(state?.lastFailure
      ? [{
        label: t("debug.liveDesktop.fields.lastFailure"),
        value: `[${state.lastFailure.stage}/${state.lastFailure.code}] ${state.lastFailure.message}`,
        wide: true,
      }]
      : []),
    ...(state?.lastRefreshFailure
      ? [{
        label: t("debug.liveDesktop.fields.lastRefreshFailure"),
        value: `[refresh/${state.lastRefreshFailure.code}] ${state.lastRefreshFailure.message}`,
        wide: true,
      }]
      : []),
  ];
});

const liveDesktopStatusRows = computed(() => {
  const status = liveDesktopStatus.value;
  return [
    { label: t("debug.liveDesktop.fields.phase"), value: formatProtocolValue(status.phase, PHASE_LABEL_KEYS) },
    { label: t("debug.liveDesktop.fields.active"), value: t(status.active ? "debug.common.yes" : "debug.common.no") },
    { label: t("debug.liveDesktop.fields.generation"), value: formatCount(status.generation) },
    { label: t("debug.liveDesktop.fields.reason"), value: status.reason || "-", wide: true },
  ];
});

const liveDesktopDiagnosticsRows = computed(() => {
  const diagnostics = liveDesktopStatus.value.diagnostics;
  return [
    { label: t("debug.liveDesktop.fields.framesCopied"), value: formatCount(diagnostics.framesCopied) },
    { label: t("debug.liveDesktop.fields.frameTimeouts"), value: formatCount(diagnostics.frameTimeouts) },
    { label: t("debug.liveDesktop.fields.copyErrors"), value: formatCount(diagnostics.copyErrors) },
    { label: t("debug.liveDesktop.fields.commitErrors"), value: formatCount(diagnostics.commitErrors) },
    { label: t("debug.liveDesktop.fields.shaderFallbacks"), value: formatCount(diagnostics.shaderCopyFallbacks) },
    { label: t("debug.liveDesktop.fields.rates"), value: formatLiveDesktopRates(liveDesktopRates.value, t), wide: true },
    { label: t("debug.liveDesktop.fields.frameArrived"), value: formatFrameArrived(diagnostics, t), wide: true },
    {
      label: t("debug.liveDesktop.fields.frameCopyTiming"),
      value: formatFrameTiming(
        diagnostics.frameCopySamples,
        diagnostics.frameCopyMicrosTotal,
        diagnostics.lastFrameCopyMicros,
        diagnostics.maxFrameCopyMicros,
        t,
      ),
      wide: true,
    },
    {
      label: t("debug.liveDesktop.fields.frameCommitTiming"),
      value: formatFrameTiming(
        diagnostics.frameCommitSamples,
        diagnostics.frameCommitMicrosTotal,
        diagnostics.lastFrameCommitMicros,
        diagnostics.maxFrameCommitMicros,
        t,
      ),
      wide: true,
    },
    { label: t("debug.liveDesktop.fields.configUpdates"), value: formatCount(diagnostics.configUpdates) },
    { label: t("debug.liveDesktop.fields.configErrors"), value: formatCount(diagnostics.configErrors) },
    { label: t("debug.liveDesktop.fields.testPatternFrames"), value: formatCount(diagnostics.testPatternFrames) },
    { label: t("debug.liveDesktop.settings.skipBlankFramesShort"), value: formatCount(diagnostics.blankFrameSkips) },
    {
      label: t("debug.liveDesktop.fields.abandonedWorkers"),
      value: t("debug.liveDesktop.workerSummary", {
        active: formatCount(diagnostics.abandonedRendererWorkers),
        reaped: formatCount(diagnostics.reapedAbandonedRendererWorkers),
      }),
      wide: true,
    },
    { label: t("debug.liveDesktop.fields.pixelProbe"), value: formatPixelProbe(diagnostics, t), wide: true },
    { label: t("debug.liveDesktop.fields.lastFrame"), value: formatLastFrame(diagnostics, t), wide: true },
    ...(diagnostics.lastAbandonedRendererReason
      ? [{ label: t("debug.liveDesktop.fields.lastAbandonedReason"), value: diagnostics.lastAbandonedRendererReason, wide: true }]
      : []),
    ...(diagnostics.lastShaderCopyError
      ? [{ label: t("debug.liveDesktop.fields.lastShaderFallbackError"), value: diagnostics.lastShaderCopyError, wide: true }]
      : []),
  ];
});

const liveDesktopLastError = computed(() => liveDesktopActionError.value
  || (liveDesktopDiagnosticState.value?.lastFailure
    ? formatDiagnosticActionError(t("debug.liveDesktop.actions.stateChange"), liveDesktopDiagnosticState.value.lastFailure, t)
    : "")
  || liveDesktopPollError.value
  || (liveDesktopDiagnosticState.value?.lastRefreshFailure
    ? formatDiagnosticActionError(t("debug.liveDesktop.actions.stateRefresh"), liveDesktopDiagnosticState.value.lastRefreshFailure, t)
    : "")
  || liveDesktopStatus.value.diagnostics.lastError);
const liveDesktopWindowDiagnostics = computed(() => liveDesktopStatus.value.windowDiagnostics);
const liveDesktopCandidateWindows = computed(() => liveDesktopWindowDiagnostics.value.candidates.slice(0, 5));
const liveDesktopWindowRows = computed(() => {
  const diagnostics = liveDesktopWindowDiagnostics.value;
  return [
    { label: t("debug.liveDesktop.fields.windowDiagnostics"), value: diagnostics.available ? t("debug.common.available") : diagnostics.reason || t("debug.common.unavailable"), wide: true },
    { label: t("debug.liveDesktop.fields.windowsFound"), value: formatCount(diagnostics.windowCount) },
    { label: t("debug.liveDesktop.fields.candidateWindows"), value: formatCount(diagnostics.candidateCount) },
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
      throw new Error(t("debug.liveDesktop.errors.invalidState"));
    }
    liveDesktopDiagnosticState.value = state;
    errorState.value = "";
    updateLiveDesktopRates();
    return state;
  } catch (error) {
    errorState.value = formatDiagnosticActionError(actionLabel, error, t);
    return null;
  } finally {
    isLiveDesktopActionBusy.value = false;
  }
}

function updateLiveDesktopDiagnosticSettings(patch) {
  liveDesktopRateSample = null;
  return runLiveDesktopDiagnosticAction("settings.update", { patch }, t("debug.liveDesktop.actions.updateSettings"));
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
  return runLiveDesktopDiagnosticAction("runtime.refresh", {}, t("debug.liveDesktop.actions.refreshState"));
}

function reconfigureLiveDesktopRuntime() {
  return runLiveDesktopDiagnosticAction("runtime.apply", {}, t("debug.liveDesktop.actions.reapplySettings"));
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
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
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
    liveDesktopActionError.value = formatDiagnosticActionError(t("debug.liveDesktop.actions.copyDiagnostics"), error, t);
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
    t("debug.liveDesktop.actions.autoRefreshState"),
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
