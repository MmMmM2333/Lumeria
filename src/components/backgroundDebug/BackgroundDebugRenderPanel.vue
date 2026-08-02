<template>
  <div class="background-debug-section">
    <div class="background-debug-subsection background-debug-render-config">
      <div class="background-debug-subtitle">捕获目标</div>
      <div class="background-debug-mode-group background-debug-render-target-group" role="group" aria-label="渲染探针捕获目标">
        <button
          v-for="target in RENDER_PROBE_TARGET_OPTIONS"
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
      <div class="background-debug-subtitle">Framebuffer 像素</div>
      <div class="background-debug-mode-group background-debug-render-pixel-group" role="group" aria-label="渲染探针像素捕获模式">
        <button
          type="button"
          :class="['background-debug-mode-button', renderProbePixels === RENDER_PROBE_PIXELS_OFF && 'background-debug-mode-button-active']"
          :disabled="isActionBusy"
          @click="renderProbePixels = RENDER_PROBE_PIXELS_OFF"
        >
          关闭
        </button>
        <button
          type="button"
          :class="['background-debug-mode-button', renderProbePixels === RENDER_PROBE_PIXELS_PHASE_DIFF && 'background-debug-mode-button-active']"
          :disabled="isActionBusy"
          @click="renderProbePixels = RENDER_PROBE_PIXELS_PHASE_DIFF"
        >
          阶段差异
        </button>
      </div>
      <label class="background-debug-toggle">
        <input v-model="renderProbeAutoFreeze" name="renderProbeAutoFreeze" type="checkbox" :disabled="isActionBusy">
        <span>发现约束违规或显著像素差异时自动冻结</span>
      </label>
    </div>

    <div class="background-debug-detail">
      最近刷新：{{ lastUpdatedLabel }}{{ isRefreshing ? " · 刷新中" : "" }}
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
      <div class="background-debug-subtitle">阶段捕获</div>
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
          <span>Framebuffer：{{ row.framebuffer }}</span>
          <span>约束违规：{{ row.violations }}</span>
        </article>
        <article v-if="renderProbePhaseRows.length === 0" class="background-debug-render-card">
          <strong>暂无阶段捕获</strong>
          <span>先布防探针，再长按并释放一个图标。</span>
        </article>
      </div>
    </div>

    <div class="background-debug-subsection">
      <div class="background-debug-subtitle">像素候选</div>
      <div v-if="renderProbePixelComparison" class="background-debug-detail">
        {{ renderProbePixelComparison.available ? "可分析" : `不可分析：${renderProbePixelComparison.reason || '未知原因'}` }}
        · 强候选 {{ renderProbePixelComparison.strongCandidateCount || 0 }}
        · 变化 {{ renderProbePixelComparison.changedSlotCount || 0 }}
        / 可比较 {{ renderProbePixelComparison.comparableSlotCount || 0 }}
      </div>
      <div class="background-debug-render-list">
        <article
          v-for="row in renderProbeCandidateRows"
          :key="row.key"
          :class="['background-debug-render-card', row.strong && 'background-debug-render-card-strong']"
        >
          <strong>
            <span>#{{ row.rank }} {{ row.title }}</span>
            <span>{{ row.strong ? "强候选" : "有变化" }}</span>
          </strong>
          <span>{{ row.identity }}</span>
          <span>{{ row.detail }}</span>
        </article>
        <article v-if="renderProbeCandidateRows.length === 0" class="background-debug-render-card">
          <strong>暂无像素候选</strong>
          <span>{{ renderProbePixelComparison ? "当前会话没有可排序的 framebuffer 差异。" : "先完成一次阶段差异拖拽会话。" }}</span>
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
        布防并清空
      </button>
      <button type="button" class="background-debug-button" :disabled="isActionBusy || !renderProbeReady" @click="disarmRenderProbe">
        解除布防
      </button>
      <button type="button" class="background-debug-button" :disabled="isActionBusy || !renderProbeReady" @click="clearRenderProbe">
        清空
      </button>
      <button type="button" class="background-debug-button" :disabled="isRefreshing" @click="refreshRenderProbeSummary">
        刷新
      </button>
      <button type="button" class="background-debug-button" :disabled="isActionBusy || !renderProbeReady" @click="copyRenderProbeJson">
        {{ renderProbeCopyButtonLabel }}
      </button>
      <button type="button" class="background-debug-button" :disabled="isActionBusy || !renderProbeReady" @click="downloadRenderProbeJson">
        下载 JSON
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { diagnosticClient } from "../../diagnostics/diagnosticClient.js";
import { formatDiagnosticActionError } from "./diagnosticUiError.js";
import {
  buildRenderProbeArmConfig,
  buildRenderProbeCandidateRows,
  buildRenderProbePhaseRows,
  buildRenderProbeStatusRows,
  RENDER_PROBE_PIXELS_OFF,
  RENDER_PROBE_PIXELS_PHASE_DIFF,
  RENDER_PROBE_TARGET_ALL,
  RENDER_PROBE_TARGET_OPTIONS,
  resolveRenderProbeDisplaySession,
} from "./renderProbePanelModel.js";

const props = defineProps({
  active: {
    type: Boolean,
    default: false,
  },
});

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
const renderProbeTargetInputLabel = computed(() => (
  RENDER_PROBE_TARGET_OPTIONS.find((option) => option.value === renderProbeTargetKind.value)?.label
  || "目标值"
));
const renderProbeDisplaySession = computed(() => resolveRenderProbeDisplaySession(renderProbeSummary.value));
const renderProbeStatusRows = computed(() => buildRenderProbeStatusRows(renderProbeSummary.value));
const renderProbePhaseRows = computed(() => buildRenderProbePhaseRows(renderProbeDisplaySession.value));
const renderProbeCandidateRows = computed(() => buildRenderProbeCandidateRows(renderProbeDisplaySession.value));
const renderProbePixelComparison = computed(() => renderProbeDisplaySession.value?.pixelComparison || null);
const renderProbeCopyButtonLabel = computed(() => (hasCopiedRenderJson.value ? "已复制" : "复制 JSON"));
const lastUpdatedLabel = computed(() => (
  lastUpdatedAt.value ? new Date(lastUpdatedAt.value).toLocaleTimeString("zh-CN", { hour12: false }) : "尚未成功"
));

async function refreshRenderProbeSummary() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    const summary = await diagnosticClient.invoke("render", "report.summary");
    if (!summary || typeof summary !== "object") throw new Error("渲染探针返回了无效摘要");
    renderProbeSummary.value = summary;
    renderProbeRefreshError.value = "";
    lastUpdatedAt.value = Date.now();
  } catch (error) {
    renderProbeRefreshError.value = formatDiagnosticActionError("刷新", error);
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
    renderProbeActionError.value = formatDiagnosticActionError(action, error);
  } finally {
    isActionBusy.value = false;
  }
}

function armRenderProbe() {
  return runRenderProbeAction("布防", "probe.arm", buildRenderProbeArmConfig({
    autoFreeze: renderProbeAutoFreeze.value,
    pixels: renderProbePixels.value,
    targetKind: renderProbeTargetKind.value,
    targetValue: renderProbeTargetValue.value,
  }));
}

function disarmRenderProbe() {
  return runRenderProbeAction("解除布防", "probe.disarm");
}

function clearRenderProbe() {
  return runRenderProbeAction("清空", "probe.clear");
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
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API 不可用");
    const delivery = await diagnosticClient.invoke("render", "report.export");
    const content = await diagnosticClient.consumeArtifactText(delivery, { path: ["content"] });
    await navigator.clipboard.writeText(content);
    markCopied();
    renderProbeActionError.value = "";
  } catch (error) {
    renderProbeActionError.value = formatDiagnosticActionError("复制", error);
  }
}

function downloadText(content, filename, mediaType = "text/plain") {
  if (
    typeof document === "undefined"
    || typeof URL === "undefined"
    || typeof URL.createObjectURL !== "function"
    || typeof Blob !== "function"
  ) {
    throw new Error("浏览器下载 API 不可用");
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
    renderProbeActionError.value = formatDiagnosticActionError("下载", error);
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
