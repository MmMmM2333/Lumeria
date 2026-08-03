<template>
  <div class="background-debug-section">
    <div class="background-debug-subsection background-debug-render-config">
      <div class="background-debug-subtitle">{{ t("debug.render.captureTarget") }}</div>
      <div class="background-debug-mode-group background-debug-render-target-group" role="group" :aria-label="t('debug.render.captureTargetAria')">
        <button
          v-for="target in renderProbeTargetOptions"
          :key="target.value"
          type="button"
          :class="['background-debug-mode-button', renderProbeTargetKind === target.value && 'background-debug-mode-button-active']"
          :disabled="isActionBusy"
          @click="renderProbeTargetKind = target.value"
        >
          {{ target.label }}
        </button>
      </div>

      <label
        v-if="renderProbeTargetKind !== RENDER_PROBE_TARGET_ALL"
        class="background-debug-control background-debug-render-target-control"
      >
        <span>{{ renderProbeTargetInputLabel }}</span>
        <input
          v-model="renderProbeTargetValue"
          name="renderProbeTargetValue"
          type="text"
          :disabled="isActionBusy"
          :placeholder="renderProbeTargetInputLabel"
        >
      </label>
    </div>

    <div class="background-debug-subsection">
      <div class="background-debug-subtitle">{{ t("debug.render.pixels.title") }}</div>
      <div class="background-debug-mode-group background-debug-render-pixel-group" role="group" :aria-label="t('debug.render.pixels.aria')">
        <button
          type="button"
          :class="['background-debug-mode-button', renderProbePixels === RENDER_PROBE_PIXELS_OFF && 'background-debug-mode-button-active']"
          :disabled="isActionBusy"
          @click="renderProbePixels = RENDER_PROBE_PIXELS_OFF"
        >
          {{ t("debug.common.off") }}
        </button>
        <button
          type="button"
          :class="['background-debug-mode-button', renderProbePixels === RENDER_PROBE_PIXELS_PHASE_DIFF && 'background-debug-mode-button-active']"
          :disabled="isActionBusy"
          @click="renderProbePixels = RENDER_PROBE_PIXELS_PHASE_DIFF"
        >
          {{ t("debug.render.pixels.phaseDiff") }}
        </button>
      </div>
      <label class="background-debug-toggle">
        <input v-model="renderProbeAutoFreeze" name="renderProbeAutoFreeze" type="checkbox" :disabled="isActionBusy">
        <span>{{ t("debug.render.pixels.autoFreeze") }}</span>
      </label>
    </div>

    <div class="background-debug-detail">
      {{ t("debug.render.lastRefresh", { time: lastUpdatedLabel, state: isRefreshing ? t("debug.render.refreshingSuffix") : "" }) }}
    </div>
    <div v-if="renderProbeError" class="background-debug-error" :title="renderProbeError">
      {{ renderProbeError }}
    </div>

    <dl class="background-debug-status-grid">
      <div
        v-for="row in renderProbeStatusRows"
        :key="row.label"
        :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
      >
        <dt>{{ row.label }}</dt>
        <dd :title="row.value">{{ row.value }}</dd>
      </div>
    </dl>

    <div class="background-debug-subsection">
      <div class="background-debug-subtitle">{{ t("debug.render.phases.title") }}</div>
      <div class="background-debug-render-list">
        <article
          v-for="row in renderProbePhaseRows"
          :key="row.key"
          class="background-debug-render-card"
        >
          <strong>
            <span>{{ row.phase }}</span>
            <span>{{ row.time }}</span>
          </strong>
          <span>{{ t("debug.render.phases.framebuffer", { value: row.framebuffer }) }}</span>
          <span>{{ t("debug.render.phases.violations", { count: row.violations }) }}</span>
        </article>
        <article v-if="renderProbePhaseRows.length === 0" class="background-debug-render-card">
          <strong>{{ t("debug.render.phases.emptyTitle") }}</strong>
          <span>{{ t("debug.render.phases.emptyMessage") }}</span>
        </article>
      </div>
    </div>

    <div class="background-debug-subsection">
      <div class="background-debug-subtitle">{{ t("debug.render.candidates.title") }}</div>
      <div v-if="renderProbePixelComparison" class="background-debug-detail">
        {{ pixelComparisonSummary }}
      </div>
      <div class="background-debug-render-list">
        <article
          v-for="row in renderProbeCandidateRows"
          :key="row.key"
          :class="['background-debug-render-card', row.strong && 'background-debug-render-card-strong']"
        >
          <strong>
            <span>#{{ row.rank }} {{ row.title }}</span>
            <span>{{ t(row.strong ? "debug.render.candidates.strong" : "debug.render.candidates.changed") }}</span>
          </strong>
          <span>{{ row.identity }}</span>
          <span>{{ row.detail }}</span>
        </article>
        <article v-if="renderProbeCandidateRows.length === 0" class="background-debug-render-card">
          <strong>{{ t("debug.render.candidates.emptyTitle") }}</strong>
          <span>{{ t(renderProbePixelComparison ? "debug.render.candidates.emptyWithComparison" : "debug.render.candidates.emptyWithoutComparison") }}</span>
        </article>
      </div>
    </div>

    <div class="background-debug-actions background-debug-render-actions">
      <button
        type="button"
        class="background-debug-button"
        :disabled="isActionBusy || !renderProbeReady || !renderProbeCanArm"
        @click="armRenderProbe"
      >
        {{ t("debug.render.actions.armAndClear") }}
      </button>
      <button type="button" class="background-debug-button" :disabled="isActionBusy || !renderProbeReady" @click="disarmRenderProbe">
        {{ t("debug.render.actions.disarm") }}
      </button>
      <button type="button" class="background-debug-button" :disabled="isActionBusy || !renderProbeReady" @click="clearRenderProbe">
        {{ t("debug.common.clear") }}
      </button>
      <button type="button" class="background-debug-button" :disabled="isRefreshing" @click="refreshRenderProbeSummary">
        {{ t("debug.common.refresh") }}
      </button>
      <button type="button" class="background-debug-button" :disabled="isActionBusy || !renderProbeReady" @click="copyRenderProbeJson">
        {{ renderProbeCopyButtonLabel }}
      </button>
      <button type="button" class="background-debug-button" :disabled="isActionBusy || !renderProbeReady" @click="downloadRenderProbeJson">
        {{ t("debug.common.downloadJson") }}
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
  buildRenderProbeArmConfig,
  buildRenderProbeCandidateRows,
  buildRenderProbePhaseRows,
  buildRenderProbeStatusRows,
  RENDER_PROBE_PIXELS_OFF,
  RENDER_PROBE_PIXELS_PHASE_DIFF,
  RENDER_PROBE_TARGET_ALL,
  getRenderProbeTargetOptions,
  resolveRenderProbeDisplaySession,
} from "./renderProbePanelModel.js";

const props = defineProps({
  active: {
    type: Boolean,
    default: false,
  },
});
const { resolvedLocale, t } = useLocalization();

const hasCopiedRenderJson = ref(false);
const isActionBusy = ref(false);
const isRefreshing = ref(false);
const lastUpdatedAt = ref(null);
const renderProbeActionError = ref("");
const renderProbeAutoFreeze = ref(true);
const renderProbePixels = ref(RENDER_PROBE_PIXELS_OFF);
const renderProbeRefreshError = ref("");
const renderProbeSummary = ref(null);
const renderProbeTargetKind = ref(RENDER_PROBE_TARGET_ALL);
const renderProbeTargetValue = ref("");
let copyStateTimer = null;
let runtimePollTimer = null;

const renderProbeError = computed(() => renderProbeActionError.value || renderProbeRefreshError.value);
const renderProbeReady = computed(() => Boolean(renderProbeSummary.value));
const renderProbeCanArm = computed(() => (
  renderProbeTargetKind.value === RENDER_PROBE_TARGET_ALL
  || Boolean(renderProbeTargetValue.value.trim())
));
const renderProbeTargetOptions = computed(() => getRenderProbeTargetOptions(t));
const renderProbeTargetInputLabel = computed(() => (
  renderProbeTargetOptions.value.find((option) => option.value === renderProbeTargetKind.value)?.label
  || t("debug.render.target.value")
));
const renderProbeDisplaySession = computed(() => resolveRenderProbeDisplaySession(renderProbeSummary.value));
const renderProbeStatusRows = computed(() => buildRenderProbeStatusRows(renderProbeSummary.value, t));
const renderProbePhaseRows = computed(() => buildRenderProbePhaseRows(renderProbeDisplaySession.value, t));
const renderProbeCandidateRows = computed(() => buildRenderProbeCandidateRows(renderProbeDisplaySession.value, t));
const renderProbePixelComparison = computed(() => renderProbeDisplaySession.value?.pixelComparison || null);
const renderProbeCopyButtonLabel = computed(() => t(hasCopiedRenderJson.value ? "debug.common.copied" : "debug.common.copyJson"));
const pixelComparisonSummary = computed(() => {
  const comparison = renderProbePixelComparison.value;
  if (!comparison) return "";
  const availability = comparison.available
    ? t("debug.render.candidates.available")
    : t("debug.render.candidates.unavailable", {
      reason: comparison.reason || t("debug.common.unknownReason"),
    });
  return t("debug.render.candidates.summary", {
    availability,
    changed: comparison.changedSlotCount || 0,
    comparable: comparison.comparableSlotCount || 0,
    strong: comparison.strongCandidateCount || 0,
  });
});
const lastUpdatedLabel = computed(() => (
  lastUpdatedAt.value
    ? new Date(lastUpdatedAt.value).toLocaleTimeString(resolvedLocale.value, { hour12: false })
    : t("debug.render.lastRefreshPending")
));

async function refreshRenderProbeSummary() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    const summary = await diagnosticClient.invoke("render", "report.summary");
    if (!summary || typeof summary !== "object") throw new Error(t("debug.render.errors.invalidSummary"));
    renderProbeSummary.value = summary;
    renderProbeRefreshError.value = "";
    lastUpdatedAt.value = Date.now();
  } catch (error) {
    renderProbeRefreshError.value = formatDiagnosticActionError(t("debug.common.refresh"), error, t);
  } finally {
    isRefreshing.value = false;
  }
}

async function runRenderProbeAction(action, operation, params = {}) {
  if (isActionBusy.value) return;
  isActionBusy.value = true;
  try {
    await diagnosticClient.invoke("render", operation, params);
    renderProbeActionError.value = "";
    await refreshRenderProbeSummary();
  } catch (error) {
    renderProbeActionError.value = formatDiagnosticActionError(action, error, t);
  } finally {
    isActionBusy.value = false;
  }
}

function armRenderProbe() {
  return runRenderProbeAction(t("debug.render.actions.arm"), "probe.arm", buildRenderProbeArmConfig({
    autoFreeze: renderProbeAutoFreeze.value,
    pixels: renderProbePixels.value,
    targetKind: renderProbeTargetKind.value,
    targetValue: renderProbeTargetValue.value,
  }));
}

function disarmRenderProbe() {
  return runRenderProbeAction(t("debug.render.actions.disarm"), "probe.disarm");
}

function clearRenderProbe() {
  return runRenderProbeAction(t("debug.common.clear"), "probe.clear");
}

function markCopied() {
  hasCopiedRenderJson.value = true;
  if (copyStateTimer != null) window.clearTimeout(copyStateTimer);
  copyStateTimer = window.setTimeout(() => {
    copyStateTimer = null;
    hasCopiedRenderJson.value = false;
  }, 1200);
}

async function copyRenderProbeJson() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
    const delivery = await diagnosticClient.invoke("render", "report.export");
    const content = await diagnosticClient.consumeArtifactText(delivery, { path: ["content"] });
    await navigator.clipboard.writeText(content);
    markCopied();
    renderProbeActionError.value = "";
  } catch (error) {
    renderProbeActionError.value = formatDiagnosticActionError(t("debug.render.actions.copy"), error, t);
  }
}

function downloadText(content, filename, mediaType = "text/plain") {
  if (
    typeof document === "undefined"
    || typeof URL === "undefined"
    || typeof URL.createObjectURL !== "function"
    || typeof Blob !== "function"
  ) {
    throw new Error("Browser download APIs are unavailable");
  }
  const url = URL.createObjectURL(new Blob([content], { type: mediaType }));
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function downloadRenderProbeJson() {
  try {
    const delivery = await diagnosticClient.invoke("render", "report.export");
    const content = await diagnosticClient.consumeArtifactText(delivery, { path: ["content"] });
    downloadText(content, `lumeria-render-trace-${Date.now()}.json`, "application/json");
    renderProbeActionError.value = "";
  } catch (error) {
    renderProbeActionError.value = formatDiagnosticActionError(t("debug.render.actions.download"), error, t);
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
  void refreshRenderProbeSummary();
  runtimePollTimer = window.setInterval(() => void refreshRenderProbeSummary(), 1000);
}

watch(() => props.active, syncPoller, { flush: "post", immediate: true });

onBeforeUnmount(() => {
  clearPoller();
  if (copyStateTimer != null) window.clearTimeout(copyStateTimer);
});
</script>
