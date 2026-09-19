<template>
  <section
    :class="[
      'background-debug-panel',
      debugPanelDock === 'left' ? 'background-debug-panel-left' : 'background-debug-panel-right',
    ]"
    :aria-label="t('debug.panel.title')"
    @click.stop
    @contextmenu.stop
    @pointerdown.stop
    @wheel.stop
  >
    <header class="background-debug-header">
      <div class="background-debug-title">
        <strong>{{ t("debug.panel.title") }}</strong>
        <span>{{ t("debug.common.devOnly") }}</span>
      </div>
      <div class="background-debug-header-actions">
        <div class="background-debug-dock-toggle" role="group" :aria-label="t('debug.panel.positionAria')">
          <button
            type="button"
            :class="['background-debug-dock-button', debugPanelDock === 'left' && 'background-debug-dock-button-active']"
            :aria-pressed="debugPanelDock === 'left'"
            @click="setDebugPanelDock('left')"
          >
            {{ t("debug.common.leftBottom") }}
          </button>
          <button
            type="button"
            :class="['background-debug-dock-button', debugPanelDock === 'right' && 'background-debug-dock-button-active']"
            :aria-pressed="debugPanelDock === 'right'"
            @click="setDebugPanelDock('right')"
          >
            {{ t("debug.common.rightBottom") }}
          </button>
        </div>
        <button type="button" class="background-debug-button" @click="isCollapsed = !isCollapsed">
          {{ isCollapsed ? t("debug.common.expand") : t("debug.common.collapse") }}
        </button>
      </div>
    </header>

    <div v-if="!isCollapsed" class="background-debug-body">
      <div
        :class="[
          'background-debug-tabs',
          debugTabCount === 3 && 'background-debug-tabs-three',
          debugTabCount === 4 && 'background-debug-tabs-four',
          debugTabCount === 5 && 'background-debug-tabs-five',
          debugTabCount === 6 && 'background-debug-tabs-six',
        ]"
        role="tablist"
        :aria-label="t('debug.panel.sectionsAria')"
      >
        <button
          type="button"
          :class="['background-debug-tab', activePanel === 'acrylic' && 'background-debug-tab-active']"
          @click="activePanel = 'acrylic'"
        >
          {{ t("debug.panel.tabs.acrylic") }}
        </button>
        <button
          type="button"
          :class="['background-debug-tab', activePanel === 'layout' && 'background-debug-tab-active']"
          @click="activePanel = 'layout'"
        >
          {{ t("debug.panel.tabs.layout") }}
        </button>
        <button
          type="button"
          :class="['background-debug-tab', activePanel === 'notice' && 'background-debug-tab-active']"
          @click="activePanel = 'notice'"
        >
          {{ t("debug.panel.tabs.notice") }}
        </button>
        <button
          v-if="canDebugRender"
          type="button"
          :class="['background-debug-tab', activePanel === 'render' && 'background-debug-tab-active']"
          @click="activePanel = 'render'"
        >
          {{ t("debug.panel.tabs.render") }}
        </button>
        <button
          v-if="canDebugMotion"
          type="button"
          :class="['background-debug-tab', activePanel === 'motion' && 'background-debug-tab-active']"
          @click="activePanel = 'motion'"
        >
          {{ t("debug.panel.tabs.motion") }}
        </button>
        <button
          v-if="canDebugLiveDesktop"
          type="button"
          :class="['background-debug-tab', activePanel === 'liveDesktop' && 'background-debug-tab-active']"
          @click="activePanel = 'liveDesktop'"
        >
          {{ t("debug.panel.tabs.liveDesktop") }}
        </button>
      </div>

      <BackgroundDebugRenderPanel
        v-if="canDebugRender"
        v-show="activePanel === 'render'"
        :active="!isCollapsed && activePanel === 'render'"
      />
      <BackgroundDebugLiveDesktopPanel
        v-if="canDebugLiveDesktop"
        v-show="activePanel === 'liveDesktop'"
        :active="!isCollapsed && activePanel === 'liveDesktop'"
        :support="props.state?.liveDesktopBackgroundSupport?.value || null"
      />

      <div v-if="activePanel === 'acrylic'" class="background-debug-section">
        <label class="background-debug-toggle">
          <input
            name="acrylicDebugOverride"
            type="checkbox"
            :checked="isOverrideEnabled"
            @change="setAcrylicOverrideFromEvent"
          >
          <span>{{ t("debug.acrylic.override") }}</span>
        </label>

        <label
          v-for="slider in sliders"
          :key="slider.key"
          class="background-debug-control"
        >
          <span>
            {{ t(slider.labelKey) }}
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
            {{ t("debug.acrylic.tintColor") }}
            <output>{{ tintHex }}</output>
          </span>
          <input type="color" :value="tintHex" @input="updateTintColor">
        </label>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.acrylic.blurKernel") }}</div>
          <label class="background-debug-toggle">
            <input
              name="kawaseDebugOverride"
              type="checkbox"
              :checked="isKawaseOverrideEnabled"
              @change="setKawaseOverrideFromEvent"
            >
            <span>{{ t("debug.acrylic.overrideRadiusPass") }}</span>
          </label>

          <div class="background-debug-mode-group background-debug-kernel-group" role="group" :aria-label="t('debug.acrylic.blurKernel')">
            <button
              type="button"
              :class="['background-debug-mode-button', kawaseParams.kernel === BLUR_KERNEL_AUTO && 'background-debug-mode-button-active']"
              @click="setBlurKernel(BLUR_KERNEL_AUTO)"
            >
              {{ t("debug.acrylic.kernel.auto") }}
            </button>
            <button
              type="button"
              :class="['background-debug-mode-button', kawaseParams.kernel === BLUR_KERNEL_DUAL_KAWASE && 'background-debug-mode-button-active']"
              @click="setBlurKernel(BLUR_KERNEL_DUAL_KAWASE)"
            >
              {{ t("debug.acrylic.kernel.dualKawase") }}
            </button>
            <button
              type="button"
              :class="['background-debug-mode-button', kawaseParams.kernel === BLUR_KERNEL_GAUSSIAN && 'background-debug-mode-button-active']"
              @click="setBlurKernel(BLUR_KERNEL_GAUSSIAN)"
            >
              {{ t("debug.acrylic.kernel.gaussian") }}
            </button>
          </div>

          <label
            v-for="slider in activeBlurKernelSliders"
            :key="slider.key"
            class="background-debug-control"
          >
            <span>
              {{ t(slider.labelKey) }}
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
            {{ t("debug.common.reset") }}
          </button>
          <button type="button" class="background-debug-button" @click="copyParams">
            {{ acrylicCopyButtonLabel }}
          </button>
        </div>
      </div>

      <div v-else-if="activePanel === 'layout'" class="background-debug-section">
        <label class="background-debug-toggle">
          <input
            name="desktopLayoutDebugOverride"
            type="checkbox"
            :checked="layoutParams.enabled"
            @change="setLayoutDebugEnabledFromEvent"
          >
          <span>{{ t("debug.layout.override") }}</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="desktopDragHitZonesDebug"
            type="checkbox"
            :checked="layoutParams.dragHitZonesEnabled"
            @change="setDragHitZonesDebugEnabledFromEvent"
          >
          <span>{{ t("debug.layout.showDragHitZones") }}</span>
        </label>

        <label
          v-for="slider in layoutSliders"
          :key="slider.key"
          class="background-debug-control"
        >
          <span>
            {{ t(slider.labelKey) }}
            <output>{{ formatValue(layoutParams[slider.key], slider.digits) }}px</output>
          </span>
          <input
            type="range"
            :min="slider.min"
            :max="slider.max"
            :step="slider.step"
            :value="layoutParams[slider.key]"
            @input="updateLayoutNumber(slider.key, $event)"
          >
        </label>

        <dl class="background-debug-status-grid">
          <div
            v-for="row in layoutDebugRows"
            :key="row.label"
            :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
          >
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>

        <div class="background-debug-detail">
          {{ t("debug.layout.detail") }}
        </div>

        <div class="background-debug-actions">
          <button type="button" class="background-debug-button" @click="resetLayoutDebugParams">
            {{ t("debug.common.reset") }}
          </button>
        </div>
      </div>

      <div v-else-if="activePanel === 'notice'" class="background-debug-section">
        <div class="background-debug-detail">
          {{ t("debug.notice.detail") }}
        </div>

        <dl class="background-debug-status-grid">
          <div
            v-for="row in noticeDebugRows"
            :key="row.label"
            :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
          >
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.notice.dialogs.section") }}</div>
          <div class="background-debug-actions background-debug-notice-actions">
            <button
              v-for="sample in statusDialogDebugSamples"
              :key="sample.intent"
              type="button"
              class="background-debug-button"
              :disabled="!canDebugStatusDialog"
              @click="showDebugStatusDialog(sample)"
            >
              {{ sample.label }}
            </button>
          </div>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.notice.section") }}</div>
          <div class="background-debug-actions background-debug-notice-actions">
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugLayoutSaveFailed">
              {{ t("debug.notice.actions.saveFailed") }}
            </button>
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugLayoutSaveRecovered">
              {{ t("debug.notice.actions.saveRecovered") }}
            </button>
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugLayoutLoadFailed">
              {{ t("debug.notice.actions.loadFailed") }}
            </button>
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugLayoutLoadRecovered">
              {{ t("debug.notice.actions.loadRecovered") }}
            </button>
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugNoticeStack">
              {{ t("debug.notice.actions.stackSample") }}
            </button>
          </div>
        </div>

        <div class="background-debug-actions">
          <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="clearDebugNotices">
            {{ t("debug.notice.actions.clear") }}
          </button>
        </div>
      </div>

      <div v-else-if="activePanel === 'motion' && canDebugMotion" class="background-debug-section">
        <p
          v-if="motionDiagnosticError"
          class="background-debug-error"
          role="alert"
          :title="motionDiagnosticError"
        >
          {{ motionDiagnosticError }}
        </p>
        <label class="background-debug-toggle">
          <input
            name="motionRuntimeDebugEnabled"
            type="checkbox"
            :checked="motionRuntimeDebugEnabled"
            :disabled="motionReplayCaptureActive"
            @change="setMotionRuntimeDebugEnabledFromEvent"
          >
          <span>{{ t("debug.motion.settings.enableDiagnostics") }}</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="motionRecordEnabled"
            type="checkbox"
            :checked="motionRecordEnabled"
            :disabled="motionReplayCaptureActive || !motionRuntimeDebugEnabled"
            @change="setMotionRecordEnabledFromEvent"
          >
          <span>{{ t("debug.motion.settings.recordHistory") }}</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="motionOverlayEnabled"
            type="checkbox"
            :checked="motionOverlayEnabled"
            :disabled="motionReplayCaptureActive || !motionRuntimeDebugEnabled"
            @change="setMotionOverlayEnabledFromEvent"
          >
          <span>{{ t("debug.motion.settings.showOverlay") }}</span>
        </label>

        <div class="background-debug-mode-group background-debug-motion-window-group" role="group" :aria-label="t('debug.motion.aria.recordWindow')">
          <button
            v-for="preset in MOTION_RECORD_WINDOW_PRESETS"
            :key="preset.value"
            type="button"
            :class="['background-debug-mode-button', motionWindowPreset === preset.value && 'background-debug-mode-button-active']"
            :disabled="motionReplayCaptureActive || !motionRuntimeDebugEnabled"
            @click="setMotionWindowPreset(preset.value)"
          >
            {{ preset.labelKey ? t(preset.labelKey) : preset.label }}
          </button>
        </div>

        <label class="background-debug-control background-debug-number-control">
          <span>
            {{ t("debug.motion.fields.customSeconds") }}
            <output>{{ motionWindowSeconds.toFixed(0) }}s</output>
          </span>
          <input
            name="motionCustomSeconds"
            type="number"
            min="1"
            max="300"
            step="1"
            :disabled="motionReplayCaptureActive || !motionRuntimeDebugEnabled || motionWindowPreset !== MOTION_RECORD_WINDOW_CUSTOM"
            :value="motionCustomSeconds"
            @change="updateMotionCustomSeconds"
          >
        </label>

        <label class="background-debug-control">
          <span>
            {{ t("debug.motion.fields.timeScale") }}
            <output>{{ Number(motionTimeScale).toFixed(2) }}x</output>
          </span>
          <input
            name="motionTimeScale"
            type="range"
            min="0"
            max="2"
            step="0.05"
            :disabled="motionReplayCaptureActive || !motionRuntimeDebugEnabled"
            :value="motionTimeScale"
            @input="updateMotionTimeScale"
          >
        </label>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.analysisWorkspace") }}</div>
          <div class="background-debug-actions background-debug-motion-workspace-actions">
            <button
              type="button"
              class="background-debug-button"
              @click="openMotionWorkspace(MOTION_DEBUG_WORKSPACE_MODE_DOCK)"
            >
              {{ t("debug.motion.actions.openWorkspace") }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              @click="openMotionWorkspace(MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN)"
            >
              {{ t("debug.motion.actions.openFullscreen") }}
            </button>
          </div>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.replayCapture") }}</div>
          <label class="background-debug-control background-debug-number-control">
            <span>
              {{ t("debug.motion.fields.captureSeconds") }}
              <output>{{ motionReplayCaptureSeconds }}s / 60Hz</output>
            </span>
            <input
              name="motionReplayCaptureSeconds"
              type="number"
              min="1"
              max="300"
              step="1"
              :disabled="motionReplayCaptureActive"
              :value="motionReplayCaptureSeconds"
              @change="updateMotionReplayCaptureSeconds"
            >
          </label>
          <dl class="background-debug-status-grid">
            <div
              v-for="row in motionReplayCaptureRows"
              :key="row.label"
              :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
            >
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
          <div class="background-debug-actions background-debug-motion-replay-actions">
            <button
              type="button"
              class="background-debug-button"
              :disabled="motionReplayCaptureActive"
              @click="startMotionReplayCapture"
            >
              {{ t("debug.motion.actions.startCapture") }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayCaptureActive"
              @click="stopMotionReplayCapture()"
            >
              {{ t("debug.motion.actions.stopCapture") }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="motionReplayCaptureActive || !motionReplayCaptureArtifact"
              @click="copyMotionReplayTrace"
            >
              {{ motionReplayTraceCopyButtonLabel }}
            </button>
          </div>
        </div>

        <div class="background-debug-actions background-debug-motion-quick-actions">
          <button type="button" class="background-debug-button" @click="copyMotionReport('full')">
            {{ motionFullCopyButtonLabel }}
          </button>
        </div>
      </div>

    </div>
  </section>

  <aside
    v-if="motionWorkspaceOpen"
    :class="[
      'motion-debug-workspace',
      motionWorkspaceFullscreen ? 'motion-debug-workspace-fullscreen' : 'motion-debug-workspace-dock',
      motionWorkspaceDockResizeActive && 'motion-debug-workspace-resizing',
    ]"
    :style="motionWorkspaceStyle"
    :aria-label="t('debug.motion.workspace.title')"
    @click.stop
    @contextmenu.stop
    @pointerdown.stop
    @wheel.stop
  >
    <div
      v-if="!motionWorkspaceFullscreen"
      class="motion-debug-workspace-resize-handle"
      data-motion-workspace-resize-handle
      role="separator"
      tabindex="0"
      :aria-label="t('debug.motion.workspace.resizeAria')"
      aria-orientation="vertical"
      :aria-valuemin="MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN"
      :aria-valuemax="MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX"
      :aria-valuenow="motionWorkspaceDockWidthPx"
      :aria-valuetext="`${motionWorkspaceDockWidthPx}px`"
      @pointerdown.stop="startMotionWorkspaceDockResize"
      @keydown="handleMotionWorkspaceResizeHandleKeydown"
    />
    <header class="motion-debug-workspace-toolbar">
      <div class="motion-debug-workspace-title">
        <strong>{{ t("debug.motion.workspace.title") }}</strong>
        <span>{{ motionWorkspaceModeLabel }} / {{ t("debug.common.devOnly") }}</span>
      </div>
      <div class="motion-debug-workspace-toolbar-actions">
        <div class="background-debug-mode-group motion-debug-workspace-mode-group" role="group" :aria-label="t('debug.motion.workspace.modeAria')">
          <button
            type="button"
            :class="[
              'background-debug-mode-button',
              !motionWorkspaceFullscreen && 'background-debug-mode-button-active',
            ]"
            @click="setMotionWorkspaceMode(MOTION_DEBUG_WORKSPACE_MODE_DOCK)"
          >
            {{ t("debug.common.dock") }}
          </button>
          <button
            type="button"
            :class="[
              'background-debug-mode-button',
              motionWorkspaceFullscreen && 'background-debug-mode-button-active',
            ]"
            @click="setMotionWorkspaceMode(MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN)"
          >
            {{ t("debug.common.fullscreen") }}
          </button>
        </div>
        <button type="button" class="background-debug-button" @click="closeMotionWorkspace">
          {{ t("debug.common.close") }}
        </button>
      </div>
    </header>

    <label v-if="!motionWorkspaceFullscreen" class="motion-debug-workspace-dock-control">
      <span>
        {{ t("debug.motion.workspace.dockWidth") }}
        <output>{{ motionWorkspaceDockWidthPx }}px</output>
      </span>
      <input
        name="motionWorkspaceDockWidth"
        type="range"
        :min="MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN"
        :max="MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX"
        step="10"
        :value="motionWorkspaceDockWidthPx"
        @input="updateMotionWorkspaceDockWidth"
      >
    </label>

    <div class="motion-debug-workspace-selection" :aria-label="t('debug.motion.workspace.selectionAria')">
      <dl>
        <div>
          <dt>{{ t("debug.motion.fields.target") }}</dt>
          <dd :title="motionWorkspaceSelectedTargetLabel">{{ motionWorkspaceSelectedTargetLabel }}</dd>
        </div>
        <div>
          <dt>{{ t("debug.motion.fields.track") }}</dt>
          <dd :title="motionWorkspaceSelectedTrackLabel">{{ motionWorkspaceSelectedTrackLabel }}</dd>
        </div>
        <div>
          <dt>{{ t("debug.motion.fields.time") }}</dt>
          <dd>{{ formatMotionReplayTime(motionWorkspaceSelectedTimeMs) }}</dd>
        </div>
        <div>
          <dt>{{ t("debug.motion.fields.filter") }}</dt>
          <dd :title="motionWorkspaceFilterLabel">{{ motionWorkspaceFilterLabel }}</dd>
        </div>
      </dl>
      <div class="motion-debug-workspace-selection-actions">
        <button
          type="button"
          class="background-debug-button"
          :disabled="!motionWorkspaceSession.selectedTarget"
          @click="toggleMotionWorkspaceSelectedPin"
        >
          {{ motionWorkspacePinButtonLabel }}
        </button>
        <button type="button" class="background-debug-button" @click="clearMotionWorkspaceSelection">
          {{ t("debug.motion.actions.clearSelection") }}
        </button>
      </div>
    </div>

    <div class="motion-debug-workspace-grid">
      <BackgroundDebugMotionTargets />
      <BackgroundDebugMotionTimeline />
      <BackgroundDebugMotionInspector />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import type { Ref } from "vue";
import { useLocalization } from "../i18n/localization.js";
import BackgroundDebugLiveDesktopPanel from "./backgroundDebug/BackgroundDebugLiveDesktopPanel.vue";
import BackgroundDebugMotionInspector from "./backgroundDebug/BackgroundDebugMotionInspector.vue";
import BackgroundDebugMotionTargets from "./backgroundDebug/BackgroundDebugMotionTargets.vue";
import BackgroundDebugMotionTimeline from "./backgroundDebug/BackgroundDebugMotionTimeline.vue";
import BackgroundDebugRenderPanel from "./backgroundDebug/BackgroundDebugRenderPanel.vue";
import {
  createMotionDebugWorkspaceContext,
  MOTION_DEBUG_WORKSPACE_CONTEXT_KEY,
} from "./backgroundDebug/motionDebugWorkspaceContext.js";
import {
  formatAcrylicDebugParams,
  hexToRgbArray,
  resetAcrylicDebugParams,
  rgbArrayToHex,
  setAcrylicDebugOverrideEnabled,
  useAcrylicDebugOverrideEnabled,
  updateAcrylicDebugParams,
  useAcrylicDebugParams,
} from "../rendering/backgroundDebugPort.js";
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
} from "../rendering/backgroundDebugPort.js";
import {
  BLUR_KERNEL_AUTO,
  BLUR_KERNEL_DUAL_KAWASE,
  BLUR_KERNEL_GAUSSIAN,
  resolveAutoBlurKernel,
  resolveAutoDualKawaseOffsetScale,
  resolveAutoGaussianRadiusPx,
} from "../domain/backgroundEffectPlan.js";
import {
  BACKGROUND_EFFECT_ACRYLIC,
  BACKGROUND_EFFECT_BLUR,
  clampBackgroundBlurStrength,
  normalizeBackgroundEffect,
} from "../application/launchpadSettingsConfig.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import {
  DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS,
  DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS,
} from "./backgroundDebug/desktopLayoutDebugSettings.js";
import {
  buildMotionAnimationRows,
  buildMotionCancelReasonRows,
  buildMotionCurveChartGroups,
  buildMotionFilterSummary,
  buildMotionLayerTreeRows,
  buildMotionOverviewRows,
  buildMotionPropertyRows,
  buildMotionReplayCaptureRows,
  buildMotionRuntimeDebugConfig,
  buildMotionTimelineGroups,
  buildMotionWarningRows,
  MOTION_FILTER_PRESETS,
  MOTION_RECORD_WINDOW_CUSTOM,
  MOTION_RECORD_WINDOW_PRESETS,
  normalizeMotionFilterPreset,
  normalizeMotionCustomSeconds,
  normalizeMotionTimeScale,
  requireMotionDebugReportInput,
  requireMotionDiagnosticDescription,
  requireMotionDiagnosticSnapshot,
  requireMotionReplayCaptureStatus,
  requireMotionRuntimeDebugConfig,
  resolveMotionRecordWindowMs,
} from "./backgroundDebug/motionDebugPanelModel.js";
import type {
  MotionDebugReportInput,
  MotionReplayCaptureTraceInput,
  MotionReplayCaptureStatusInput,
} from "./backgroundDebug/motionDebugPanelModel.js";
import {
  assertMotionReplayImportSize,
  MOTION_REPLAY_IMPORT_MAX_BYTES,
} from "./backgroundDebug/motionReplayViewerModel.js";
import type {
  DiagnosticTranslate,
  MotionReplayStepDirection,
} from "./backgroundDebug/motionReplayViewerModel.js";
import {
  addMotionReplayBookmark,
  MOTION_REPLAY_BOOKMARK_LIMIT,
  removeMotionReplayBookmark,
} from "./backgroundDebug/motionReplayBookmarkModel.js";
import type {
  MotionReplayBookmark,
  MotionReplayBookmarkInput,
} from "./backgroundDebug/motionReplayBookmarkModel.js";
import {
  estimateMotionCaptureProfileSize,
  getMotionCaptureProfiles,
  MOTION_CAPTURE_ALLOWED_PROPS,
  MOTION_CAPTURE_DEFAULT_SAMPLE_HZ,
} from "./backgroundDebug/motionCaptureProfileModel.js";
import type {
  MotionCaptureAllowedProp,
  MotionCaptureProfile,
  MotionCaptureTargetFilters,
} from "./backgroundDebug/motionCaptureProfileModel.js";
import {
  MOTION_FOCUSED_DEBUG_SCHEMA,
} from "./backgroundDebug/motionFocusedDebugExportModel.js";
import type { MotionFocusedDebugExportOptions } from "./backgroundDebug/motionFocusedDebugExportModel.js";
import {
  MOTION_TRACK_CHART_DISPLAY_NORMALIZED,
  MOTION_TRACK_CHART_DISPLAY_RAW,
  MOTION_TRACK_CHART_SERIES_KEYS,
  normalizeMotionTrackChartSeriesVisibility,
} from "./backgroundDebug/motionTrackChartModel.js";
import type {
  MotionTrackChartDisplayMode,
  MotionTrackChartModel,
  MotionTrackChartSeriesKey,
  MotionTrackChartWindow,
} from "./backgroundDebug/motionTrackChartModel.js";
import { motionDiagnosticSession } from "../diagnostics/motionDiagnosticSession.js";
import type {
  MotionReplayDocument,
  MotionReplayOverlayRowsView,
} from "../diagnostics/motionReplayDocument.js";
import type { MotionReplayAnalysisFinding } from "../diagnostics/motionReplayAnalyzer.js";
import {
  buildMotionDebugWorkspaceCaptureProfile,
  closeMotionDebugWorkspace,
  createMotionDebugWorkspaceSession,
  MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX,
  MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN,
  MOTION_DEBUG_WORKSPACE_MODE_DOCK,
  MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN,
  openMotionDebugWorkspace,
  resizeMotionDebugWorkspaceDockByDelta,
  resizeMotionDebugWorkspaceDock,
  selectMotionDebugWorkspaceTarget,
  selectMotionDebugWorkspaceTrack,
  setMotionDebugWorkspaceCaptureProfile,
  setMotionDebugWorkspaceCaptureTargetFilters,
  setMotionDebugWorkspaceFilters,
  setMotionDebugWorkspaceMode,
  setMotionDebugWorkspaceTime,
  toggleMotionDebugWorkspaceCaptureProp,
  toggleMotionDebugWorkspacePin,
} from "./backgroundDebug/motionDebugWorkspaceModel.js";
import type {
  MotionDebugWorkspaceMode,
  MotionDebugWorkspaceSession,
} from "./backgroundDebug/motionDebugWorkspaceModel.js";
import { normalizeMotionReplayCaptureSeconds } from "../rendering/motionPort.js";
import type { MotionDebugConfig, MotionTraceRecord } from "../rendering/motionPort.js";
import { diagnosticClient, isDiagnosticArtifactDelivery } from "../diagnostics/diagnosticClient.js";
import type { DiagnosticArtifactDelivery } from "../diagnostics/diagnosticProtocol.js";
import { formatDiagnosticActionError } from "./backgroundDebug/diagnosticUiError.js";
import type { DesktopLayoutDebugParams, DesktopLayoutDebugParamsInput } from "./backgroundDebug/desktopLayoutDebugSettings.js";
import type { BlurKernel } from "../domain/backgroundEffectPlan.js";

const DEBUG_PANEL_DOCK_STORAGE_KEY = "lumeriaBackgroundDebugPanelDock";
const consumeDiagnosticArtifactText = diagnosticClient.consumeArtifactText;
const consumeDiagnosticArtifactValue = diagnosticClient.consumeArtifactValue;
const describeDiagnosticTool = diagnosticClient.describe;
const invokeDiagnosticTool = diagnosticClient.invoke;
const readDiagnosticArtifactJsonText = diagnosticClient.readArtifactJsonText;
const readDiagnosticArtifactValue = diagnosticClient.readArtifactValue;
const releaseDiagnosticArtifact = diagnosticClient.releaseArtifact;

interface ValueRef<T> { value: T }
interface DebugStatusDialogInput extends Readonly<Record<string, unknown>> {
  cancelText?: string;
  confirmText: string;
  intent: string;
  label?: string;
  message: string;
  suggestion?: string;
  title: string;
}
interface DebugDialogState {
  closeTransientNotice?: () => void;
  closeWarningDialog?: () => void;
  openWarningDialog?: (input: DebugStatusDialogInput) => void;
  showLayoutLoadFailed?: (input: Readonly<Record<string, unknown>>) => void;
  showLayoutLoadRecovered?: () => void;
  showLayoutSaveFailed?: (input: Readonly<Record<string, unknown>>) => void;
  showLayoutSaveRecovered?: () => void;
  transientNotice?: ValueRef<{ title?: string } | null>;
}
interface BackgroundDebugState {
  draftBackgroundAcrylicBlurStrength?: ValueRef<unknown>;
  draftBackgroundBlurStrength?: ValueRef<unknown>;
  draftBackgroundEffect?: ValueRef<unknown>;
  liveDesktopBackgroundSupport?: ValueRef<Readonly<Record<string, unknown>> | null>;
  syncLiveDesktopBackgroundRuntime?: () => unknown;
}
interface BackgroundDebugPanelProps {
  desktopLayoutDebugParams?: DesktopLayoutDebugParams;
  dialogState?: DebugDialogState | null;
  resetDesktopLayoutDebugParams?: (() => void) | null;
  state?: BackgroundDebugState | null;
  updateDesktopLayoutDebugParams?: ((patch: DesktopLayoutDebugParamsInput) => void) | null;
}
interface MotionWorkspaceDockResizeState {
  pointerId: number;
  startClientX: number;
  startWidthPx: number;
  target: Element;
}
interface StatusRow { label: string; value: string; wide?: boolean }
interface ReplayDocumentUseOptions { updateImportText?: boolean }
interface ReplayTimeOptions { pause?: boolean }
interface ReplayCaptureStopOptions { restore?: boolean }
interface LiveDesktopSyncOptions { delay?: number }
interface MotionTargetDisplayInput {
  kind?: string;
  label?: string;
  layer?: string;
  sourceLabel?: string;
  targetId?: unknown;
}
interface MotionTrackDisplayInput extends MotionTargetDisplayInput {
  lane?: string;
  laneKey?: string;
  prop?: string;
  timeMs?: unknown;
}
type DebugPanelDock = "left" | "right";
type DebugPanelTab = "acrylic" | "layout" | "liveDesktop" | "motion" | "notice" | "render";
type AcrylicDebugParams = ReturnType<typeof useAcrylicDebugParams>;
type AcrylicNumberKey = Exclude<keyof AcrylicDebugParams, "tintColor">;
type KawaseDebugParams = ReturnType<typeof useKawaseDebugParams>;
type KawaseNumberKey = Exclude<keyof KawaseDebugParams, "kernel">;
type LayoutNumberKey = Exclude<keyof DesktopLayoutDebugParams, "dragHitZonesEnabled" | "enabled">;
type MotionLayerTreeRow = ReturnType<typeof buildMotionLayerTreeRows>[number];
type MotionCurveChartGroup = ReturnType<typeof buildMotionCurveChartGroups>[number];
type MotionReplayOverlayRow = MotionReplayOverlayRowsView[number];
type MotionTrackChartTrack = MotionTrackChartModel["tracks"][number];
type MotionTrackChartMarker = MotionTrackChartTrack["eventMarkers"][number];
type MotionCaptureTargetFilterKey = keyof MotionCaptureTargetFilters;
type ClipboardTimerName = "acrylic" | "motionFocused" | "motionFull" | "motionReplayInterval" | "motionReplayTrace" | "motionSummary";
interface NumberSlider<Key extends PropertyKey> {
  digits: number;
  key: Key;
  labelKey: string;
  max: number;
  min: number;
  step: number;
}

const props = defineProps<BackgroundDebugPanelProps>();

const { n, resolvedLocale, t } = useLocalization();

const diagnosticTranslate: DiagnosticTranslate = (key, values) => {
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(values || {})) {
    params[name] = typeof value === "string" || typeof value === "number" ? value : String(value ?? "");
  }
  return t(key, params);
};

const params = useAcrylicDebugParams();
const isOverrideEnabled = useAcrylicDebugOverrideEnabled();
const kawaseParams = useKawaseDebugParams();
const isKawaseOverrideEnabled = useKawaseDebugOverrideEnabled();
const layoutParams = computed(() => props.desktopLayoutDebugParams || DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS);
const isCollapsed = ref(true);
const debugPanelDock = ref<DebugPanelDock>(readDebugPanelDock());
const activePanel = ref<DebugPanelTab>("acrylic");
const canDebugLiveDesktop = computed(() => isLiveDesktopExperimentEnabled());
const canDebugMotion = computed(() => Boolean(import.meta.env.DEV));
const canDebugRender = computed(() => Boolean(import.meta.env.DEV));
const canDebugNotice = computed(() => Boolean(
  props.dialogState?.showLayoutSaveFailed
    && props.dialogState?.showLayoutSaveRecovered
    && props.dialogState?.showLayoutLoadFailed
    && props.dialogState?.showLayoutLoadRecovered
));
const canDebugStatusDialog = computed(() => Boolean(props.dialogState?.openWarningDialog));
const debugTabCount = computed(() => 3
  + (canDebugRender.value ? 1 : 0)
  + (canDebugMotion.value ? 1 : 0)
  + (canDebugLiveDesktop.value ? 1 : 0));
const hasCopiedAcrylic = ref(false);
const hasCopiedMotionFocused = ref(false);
const hasCopiedMotionFull = ref(false);
const hasCopiedMotionReplayInterval = ref(false);
const hasCopiedMotionReplayTrace = ref(false);
const hasCopiedMotionSummary = ref(false);
const motionRuntimeDebugEnabled = ref(false);
const motionOverlayEnabled = ref(false);
const motionRecordEnabled = ref(false);
const motionWindowPreset = ref("30000");
const motionCustomSeconds = ref(30);
const motionTimeScale = ref(1);
const motionFilterPreset = ref("all");
const motionFilterQuery = ref("");
const motionSnapshot = ref<MotionDebugReportInput>({});
const motionReport = ref<MotionDebugReportInput>({});
const motionActionError = ref("");
const motionRefreshError = ref("");
const motionReplayCaptureSeconds = ref(30);
const motionReplayCaptureStatus = ref<MotionReplayCaptureStatusInput>({
  active: false,
  captureProfile: null,
  sampleHz: 60,
  seconds: 30,
  startedAt: null,
});
const motionReplayCaptureArtifact = ref<DiagnosticArtifactDelivery | null>(null);
const motionReplayCaptureSummary = ref<MotionReplayCaptureTraceInput | null>(null);
const motionReplayDocument = ref<MotionReplayDocument | null>(null);
const motionReplayImportText = ref("");
const motionReplayImportError = ref("");
const motionReplayCurrentTimeMs = ref(0);
const motionReplayFilterQuery = ref("");
const motionReplayPlaying = ref(false);
const motionReplayIntervalStartMs = ref(0);
const motionReplayIntervalEndMs = ref(0);
const motionReplayBookmarks = ref<MotionReplayBookmark[]>([]);
const motionTrackChartDisplayMode = ref<MotionTrackChartDisplayMode>(MOTION_TRACK_CHART_DISPLAY_RAW);
const motionTrackChartSeriesVisibility = ref(normalizeMotionTrackChartSeriesVisibility());
const motionTrackChartBrushAnchorMs = ref<number | null>(null);
const motionTrackChartBrushPointerId = ref<number | null>(null);
const motionTrackChartZoomStartMs = ref<number | null>(null);
const motionTrackChartZoomEndMs = ref<number | null>(null);
const motionWorkspaceDockResize = ref<MotionWorkspaceDockResizeState | null>(null);
const motionWorkspaceSession = ref<MotionDebugWorkspaceSession>(createMotionDebugWorkspaceSession({
  viewportWidth: typeof window === "undefined" ? undefined : window.innerWidth,
}));
const noticeDebugRows = computed<StatusRow[]>(() => [
  {
    label: t("debug.notice.transient"),
    value: props.dialogState?.transientNotice?.value?.title || t("debug.common.none"),
  },
]);
const statusDialogDebugSamples = computed<DebugStatusDialogInput[]>(() => [
  {
    intent: "warning",
    label: t("debug.notice.dialogs.actions.warning"),
    title: t("debug.notice.dialogs.samples.warning.title"),
    message: t("debug.notice.dialogs.samples.warning.message"),
    cancelText: t("common.actions.cancel"),
    confirmText: t("debug.notice.dialogs.samples.warning.confirm"),
  },
  {
    intent: "error",
    label: t("debug.notice.dialogs.actions.error"),
    title: t("debug.notice.dialogs.samples.error.title"),
    message: t("debug.notice.dialogs.samples.error.message"),
    suggestion: t("debug.notice.dialogs.samples.error.suggestion"),
    confirmText: t("notices.acknowledge"),
  },
  {
    intent: "info",
    label: t("debug.notice.dialogs.actions.info"),
    title: t("debug.notice.dialogs.samples.info.title"),
    message: t("debug.notice.dialogs.samples.info.message"),
    confirmText: t("notices.acknowledge"),
  },
  {
    intent: "success",
    label: t("debug.notice.dialogs.actions.success"),
    title: t("debug.notice.dialogs.samples.success.title"),
    message: t("debug.notice.dialogs.samples.success.message"),
    confirmText: t("notices.acknowledge"),
  },
]);
let acrylicCopyStateTimer: number | null = null;
let motionFocusedCopyStateTimer: number | null = null;
let motionFullCopyStateTimer: number | null = null;
let motionRuntimePollTimer: number | null = null;
let motionReplayIntervalCopyStateTimer: number | null = null;
let motionReplayPlaybackLastTime = 0;
let motionReplayPlaybackTimer: number | null = null;
let motionReplayTraceCopyStateTimer: number | null = null;
let motionSummaryCopyStateTimer: number | null = null;
let kawaseLiveDesktopSyncTimer: number | null = null;

const motionCaptureProfiles = getMotionCaptureProfiles();
const motionCaptureAllowedProps = MOTION_CAPTURE_ALLOWED_PROPS;
const MOTION_TRACK_CHART_SERIES_LABELS = Object.freeze({
  delta: "debug.motion.series.delta",
  to: "debug.motion.series.to",
  value: "debug.motion.series.value",
  velocity: "debug.motion.series.velocity",
});
const motionTrackChartSeriesOptions = MOTION_TRACK_CHART_SERIES_KEYS.map((key) => ({
  key,
  labelKey: MOTION_TRACK_CHART_SERIES_LABELS[key],
}));
const MOTION_WORKSPACE_DOCK_RESIZE_STEP_PX = 20;
const MOTION_WORKSPACE_DOCK_RESIZE_FAST_STEP_PX = 80;

const sliders = [
  { key: "saturation", labelKey: "debug.acrylic.fields.saturation", min: 0.8, max: 1.8, step: 0.01, digits: 2 },
  { key: "contrast", labelKey: "debug.acrylic.fields.contrast", min: 0.75, max: 1.25, step: 0.01, digits: 2 },
  { key: "brightness", labelKey: "debug.acrylic.fields.brightness", min: 0.5, max: 1.2, step: 0.01, digits: 2 },
  { key: "tintStrength", labelKey: "debug.acrylic.fields.tintStrength", min: 0, max: 0.6, step: 0.01, digits: 2 },
  { key: "noise", labelKey: "debug.acrylic.fields.noise", min: 0, max: 0.06, step: 0.001, digits: 3 },
  { key: "seed", labelKey: "debug.acrylic.fields.seed", min: 0, max: 100, step: 0.01, digits: 2 },
] as const satisfies readonly NumberSlider<AcrylicNumberKey>[];
const layoutSliders = [
  { key: "hostMaxHeightPx", labelKey: "debug.layout.fields.hostMaxHeight", min: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostMaxHeightPx.min, max: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostMaxHeightPx.max, step: 10, digits: 0 },
  { key: "hostHeightOffsetPx", labelKey: "debug.layout.fields.hostHeightOffset", min: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostHeightOffsetPx.min, max: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostHeightOffsetPx.max, step: 4, digits: 0 },
  { key: "mainPaddingYPx", labelKey: "debug.layout.fields.mainPaddingY", min: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.mainPaddingYPx.min, max: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.mainPaddingYPx.max, step: 1, digits: 0 },
  { key: "gridPaddingTopPx", labelKey: "debug.layout.fields.gridPaddingTop", min: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.gridPaddingTopPx.min, max: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.gridPaddingTopPx.max, step: 1, digits: 0 },
] as const satisfies readonly NumberSlider<LayoutNumberKey>[];
const kawaseSliders = [
  {
    key: "passCount",
    labelKey: "debug.acrylic.fields.passCount",
    min: KAWASE_DEBUG_PASS_COUNT_MIN,
    max: KAWASE_DEBUG_PASS_COUNT_MAX,
    step: 1,
    digits: 0,
  },
  {
    key: "offsetScale",
    labelKey: "debug.acrylic.fields.radiusScale",
    min: KAWASE_DEBUG_OFFSET_SCALE_MIN,
    max: KAWASE_DEBUG_OFFSET_SCALE_MAX,
    step: 0.01,
    digits: 2,
  },
] as const satisfies readonly NumberSlider<KawaseNumberKey>[];
const gaussianSliders = [
  {
    key: "gaussianRadiusPx",
    labelKey: "debug.acrylic.fields.gaussianRadius",
    min: KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MAX,
    step: 0.25,
    digits: 2,
  },
] as const satisfies readonly NumberSlider<KawaseNumberKey>[];
const autoBlurKernelSliders = [
  {
    key: "testStrength",
    labelKey: "debug.acrylic.fields.testStrength",
    min: KAWASE_DEBUG_TEST_STRENGTH_MIN,
    max: KAWASE_DEBUG_TEST_STRENGTH_MAX,
    step: 1,
    digits: 0,
  },
  {
    key: "gaussianCutoff",
    labelKey: "debug.acrylic.fields.blurCutoff",
    min: KAWASE_DEBUG_GAUSSIAN_CUTOFF_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_CUTOFF_MAX,
    step: 1,
    digits: 0,
  },
  {
    key: "acrylicGaussianCutoff",
    labelKey: "debug.acrylic.fields.acrylicCutoff",
    min: KAWASE_DEBUG_GAUSSIAN_CUTOFF_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_CUTOFF_MAX,
    step: 1,
    digits: 0,
  },
  {
    key: "gaussianRadiusScale",
    labelKey: "debug.acrylic.fields.gaussianScale",
    min: KAWASE_DEBUG_GAUSSIAN_RADIUS_SCALE_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_RADIUS_SCALE_MAX,
    step: 0.01,
    digits: 2,
  },
  {
    key: "gaussianMaxRadiusPx",
    labelKey: "debug.acrylic.fields.gaussianMax",
    min: KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MIN,
    max: KAWASE_DEBUG_GAUSSIAN_RADIUS_PX_MAX,
    step: 0.25,
    digits: 2,
  },
  ...kawaseSliders,
] as const satisfies readonly NumberSlider<KawaseNumberKey>[];

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
  const actualStrength = clampBackgroundBlurStrength(
    effect === BACKGROUND_EFFECT_ACRYLIC
      ? props.state?.draftBackgroundAcrylicBlurStrength?.value
      : props.state?.draftBackgroundBlurStrength?.value
  );
  const testStrength = clampBackgroundBlurStrength(kawaseParams.testStrength);
  if (kawaseParams.kernel === BLUR_KERNEL_AUTO) {
    const resolvedKernel = resolveAutoBlurKernel(effect, testStrength, kawaseParams);
    const radius = resolveAutoGaussianRadiusPx(testStrength, kawaseParams);
    const cutoff = effect === BACKGROUND_EFFECT_ACRYLIC
      ? kawaseParams.acrylicGaussianCutoff
      : kawaseParams.gaussianCutoff;
    const offsetScale = resolveAutoDualKawaseOffsetScale(effect, testStrength, kawaseParams);
    const branchDetail = resolvedKernel === BLUR_KERNEL_GAUSSIAN
      ? t("debug.acrylic.status.gaussianDetail", { radius: radius.toFixed(2) })
      : t("debug.acrylic.status.kawaseDetail", {
        baseScale: Number(kawaseParams.offsetScale).toFixed(2),
        passCount: Number(kawaseParams.passCount).toFixed(0),
        radiusScale: offsetScale.toFixed(2),
      });
    return t("debug.acrylic.status.auto", {
      actualStrength,
      cutoff: Number(cutoff).toFixed(0),
      detail: branchDetail,
      effect: formatEffectLabel(effect),
      kernel: formatBlurKernelLabel(resolvedKernel),
      testStrength,
    });
  }
  if (kawaseParams.kernel === BLUR_KERNEL_GAUSSIAN) {
    return t("debug.acrylic.status.manualGaussian", {
      radius: Number(kawaseParams.gaussianRadiusPx).toFixed(2),
    });
  }
  return t("debug.acrylic.status.manualKawase", {
    passCount: Number(kawaseParams.passCount).toFixed(0),
    radiusScale: Number(kawaseParams.offsetScale).toFixed(2),
  });
});
const acrylicCopyButtonLabel = computed(() => t(hasCopiedAcrylic.value ? "debug.common.copied" : "debug.common.copyJson"));
const motionFullCopyButtonLabel = computed(() => t(hasCopiedMotionFull.value ? "debug.common.copied" : "debug.motion.actions.copyAiReport"));
const motionReplayCaptureActive = computed(() => Boolean(motionReplayCaptureStatus.value.active));
const motionReplayCaptureAvailable = computed(() => Boolean(motionReplayCaptureArtifact.value));
const motionReplayIntervalCopyButtonLabel = computed(() => t(hasCopiedMotionReplayInterval.value ? "debug.common.copied" : "debug.motion.actions.copyInterval"));
const motionReplayPlayButtonLabel = computed(() => t(motionReplayPlaying.value ? "debug.motion.actions.pauseReplay" : "debug.motion.actions.playReplay"));
const motionReplayTraceCopyButtonLabel = computed(() => t(hasCopiedMotionReplayTrace.value ? "debug.common.copied" : "debug.motion.actions.copyCapture"));
const motionReplayViewerLoaded = computed(() => Boolean(motionReplayDocument.value));
const motionDiagnosticError = computed(() => motionActionError.value || motionRefreshError.value);
const motionReplayImportStatus = computed(() => {
  if (motionReplayImportError.value) return t("debug.common.error");
  return t(motionReplayViewerLoaded.value ? "debug.common.loaded" : "debug.common.empty");
});
const motionSummaryCopyButtonLabel = computed(() => t(hasCopiedMotionSummary.value ? "debug.common.copied" : "debug.motion.actions.copySummary"));
const layoutDebugRows = computed(() => {
  const params = layoutParams.value;
  return [
    { label: t("debug.layout.fields.enabled"), value: t(params.enabled ? "debug.common.yes" : "debug.common.no") },
    { label: t("debug.layout.fields.dragHit"), value: t(params.dragHitZonesEnabled ? "debug.common.shown" : "debug.common.hidden") },
    { label: t("debug.layout.fields.hostMax"), value: `${Number(params.hostMaxHeightPx).toFixed(0)}px` },
    { label: t("debug.layout.fields.heightOffset"), value: `${Number(params.hostHeightOffsetPx).toFixed(0)}px` },
    { label: t("debug.layout.fields.mainPaddingYShort"), value: `${Number(params.mainPaddingYPx).toFixed(0)}px` },
    { label: t("debug.layout.fields.gridTop"), value: `${Number(params.gridPaddingTopPx).toFixed(0)}px`, wide: true },
  ];
});
const motionOverviewRows = computed(() => buildMotionOverviewRows(motionSnapshot.value, diagnosticTranslate));
const motionAnimationRows = computed(() => buildMotionAnimationRows(motionSnapshot.value));
const motionCancelReasonRows = computed(() => buildMotionCancelReasonRows(motionSnapshot.value, 6, diagnosticTranslate));
const motionWarningRows = computed(() => buildMotionWarningRows(motionSnapshot.value, 6, diagnosticTranslate));
const motionWindowSeconds = computed(() => resolveMotionRecordWindowMs(motionWindowPreset.value, motionCustomSeconds.value) / 1000);
const motionFilters = computed(() => ({
  preset: motionFilterPreset.value,
  query: motionFilterQuery.value,
}));
const motionFilterSummary = computed(() => buildMotionFilterSummary(motionSnapshot.value, motionFilters.value, diagnosticTranslate));
const motionLayerTreeRows = computed(() => buildMotionLayerTreeRows(motionSnapshot.value, motionFilters.value, undefined, diagnosticTranslate));
const motionPropertyRows = computed(() => buildMotionPropertyRows(motionSnapshot.value, motionFilters.value));
const motionTimelineGroups = computed(() => buildMotionTimelineGroups(motionReport.value, motionFilters.value));
const motionCurveChartGroups = computed(() => buildMotionCurveChartGroups(motionReport.value, motionFilters.value, { t: diagnosticTranslate }));
const motionCaptureProfile = computed(() => buildMotionDebugWorkspaceCaptureProfile(motionWorkspaceSession.value));
const motionReplayCaptureEstimate = computed(() => estimateMotionCaptureProfileSize(
  motionSnapshot.value,
  motionCaptureProfile.value,
  {
    durationMs: normalizeMotionReplayCaptureSeconds(motionReplayCaptureSeconds.value) * 1000,
    sampleHz: MOTION_CAPTURE_DEFAULT_SAMPLE_HZ,
  }
));
const motionReplayCaptureRows = computed(() => buildMotionReplayCaptureRows(
  motionReplayCaptureStatus.value,
  motionReplayCaptureSummary.value,
  {
    actualBytes: motionReplayCaptureArtifact.value?.artifact?.byteLength || 0,
    estimate: motionReplayCaptureEstimate.value,
    profile: motionCaptureProfile.value,
    t: diagnosticTranslate,
  }
));
const motionCaptureSelectedPropCount = computed(() => motionCaptureProfile.value.propAllowlist.length);
const motionCaptureTargetFilterText = computed(() => {
  const filters = motionCaptureProfile.value.targetFilters;
  return {
    kinds: formatMotionCaptureFilterList(filters.kinds),
    layers: formatMotionCaptureFilterList(filters.layers),
    sourceLabels: formatMotionCaptureFilterList(filters.sourceLabels),
    sourceQuery: filters.sourceQuery,
  };
});
const motionCaptureEstimateRows = computed(() => [
  { label: t("debug.motion.fields.profile"), value: formatMotionCaptureProfileLabel(motionCaptureProfile.value), wide: true },
  { label: t("debug.motion.fields.props"), value: motionCaptureProfile.value.propAllowlist.join(", "), wide: true },
  { label: t("debug.motion.fields.targetsTechnical"), value: formatMotionCaptureTargetFilterSummary(motionCaptureProfile.value.targetFilters), wide: true },
  {
    label: t("debug.motion.fields.framesEventsTechnical"),
    value: `${formatDebugCount(motionReplayCaptureEstimate.value.frameCount)} / ${formatDebugCount(motionReplayCaptureEstimate.value.eventCount)}`,
    wide: true,
  },
  {
    label: t("debug.motion.fields.tracksTargetsTechnical"),
    value: `${formatDebugCount(motionReplayCaptureEstimate.value.trackCount)} / ${formatDebugCount(motionReplayCaptureEstimate.value.targetCount)}`,
    wide: true,
  },
  { label: t("debug.motion.fields.estimatedJson"), value: motionReplayCaptureEstimate.value.jsonSizeLabel, wide: true },
]);
const motionReplayTimeRange = computed(() => motionReplayDocument.value?.timeRange() || { max: 0, min: 0 });
const motionReplayFilters = computed(() => ({
  query: motionReplayFilterQuery.value,
}));
const motionReplayOverviewRows = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.getView("overview", {
    locale: resolvedLocale.value,
    t: diagnosticTranslate,
    timeMs: motionReplayCurrentTimeMs.value,
  })
  : [
    { label: t("debug.motion.fields.viewer"), value: t("debug.common.empty") },
    { label: t("debug.motion.fields.schema"), value: t("debug.common.none"), wide: true },
  ]);
const motionReplayFilterSummary = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.getView("filter-summary", {
    filters: motionReplayFilters.value,
    locale: resolvedLocale.value,
    t: diagnosticTranslate,
    timeMs: motionReplayCurrentTimeMs.value,
  })
  : { query: "", text: t("debug.motion.counts.propertiesEvents", { events: 0, properties: 0 }) });
const motionReplayFrameRows = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.getView("frame-rows", {
    filters: motionReplayFilters.value,
    locale: resolvedLocale.value,
    t: diagnosticTranslate,
    timeMs: motionReplayCurrentTimeMs.value,
  })
  : []);
const motionReplayEventRows = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.getView("event-rows", {
    filters: motionReplayFilters.value,
    locale: resolvedLocale.value,
    t: diagnosticTranslate,
    timeMs: motionReplayCurrentTimeMs.value,
  })
  : []);
const motionReplayCurveGroups = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.getView("curve-groups", {
    filters: motionReplayFilters.value,
    locale: resolvedLocale.value,
    t: diagnosticTranslate,
    timeMs: motionReplayCurrentTimeMs.value,
  })
  : []);
const motionReplayOverlayRows = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.getView("overlay-rows", {
    filters: motionReplayFilters.value,
    locale: resolvedLocale.value,
    selectedTarget: motionWorkspaceSession.value.selectedTarget,
    selectedTrack: motionWorkspaceSession.value.selectedTrack,
    t: diagnosticTranslate,
    timeMs: motionReplayCurrentTimeMs.value,
  })
  : []);
const motionTrackChartZoomWindow = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.getView("track-chart.zoom", {
    endMs: motionTrackChartZoomEndMs.value ?? motionReplayTimeRange.value.max,
    startMs: motionTrackChartZoomStartMs.value ?? motionReplayTimeRange.value.min,
  })
  : { endMs: 0, startMs: 0 });
const motionTrackChartZoomActive = computed(() => {
  if (!motionReplayDocument.value) return false;
  const range = motionReplayTimeRange.value;
  const zoom = motionTrackChartZoomWindow.value;
  return Math.round(zoom.startMs) !== Math.round(range.min)
    || Math.round(zoom.endMs) !== Math.round(range.max);
});
const motionTrackChartModel = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.getView("track-chart", {
    cursorTimeMs: motionWorkspaceSelectedTimeMs.value,
    displayMode: motionTrackChartDisplayMode.value,
    filters: motionReplayFilters.value,
    locale: resolvedLocale.value,
    selectedTrack: motionWorkspaceSession.value.selectedTrack,
    seriesVisibility: motionTrackChartSeriesVisibility.value,
    t: diagnosticTranslate,
    zoomWindow: motionTrackChartZoomWindow.value,
  })
  : null);
const motionTrackChartHeaderLabel = computed(() => {
  const chart = motionTrackChartModel.value;
  if (!chart) return t("debug.motion.counts.liveTracksNoReplay", { tracks: motionTimelineGroups.value.length });
  return t("debug.motion.counts.chartTracksEvents", {
    events: chart.summary.eventCount,
    total: chart.summary.trackCount,
    visible: chart.summary.visibleTrackCount,
  });
});
const motionTrackChartSummaryRows = computed(() => {
  const chart = motionTrackChartModel.value;
  if (!chart) return [];
  return [
    { label: t("debug.motion.fields.timeWindow"), value: `${formatMotionReplayTime(chart.zoomWindow.startMs)}..${formatMotionReplayTime(chart.zoomWindow.endMs)}`, wide: true },
    { label: t("debug.motion.fields.samples"), value: formatDebugCount(chart.summary.sampleCount) },
    { label: t("debug.motion.fields.events"), value: formatDebugCount(chart.summary.eventCount) },
    { label: t("debug.motion.fields.tracks"), value: `${formatDebugCount(chart.summary.visibleTrackCount)} / ${formatDebugCount(chart.summary.trackCount)}` },
    { label: t("debug.motion.fields.curvePoints"), value: t("debug.motion.counts.curvePointLimit", { count: formatDebugCount(chart.limits.maxPointsPerSeries) }) },
    { label: t("debug.motion.fields.timeCursor"), value: formatMotionReplayTime(chart.cursor.timeMs) },
  ];
});
const motionReplayAnalysis = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.analyze({
    filters: motionReplayFilters.value,
  })
  : null);
const motionReplayFindingRows = computed(() => motionReplayAnalysis.value?.findings || []);
const motionReplayFindingStatusLabel = computed(() => motionReplayAnalysis.value?.summary?.headline || t("debug.motion.values.noFindings"));
const motionTrackChartIntervalOverlay = computed(() => {
  const chart = motionTrackChartModel.value;
  if (!chart) return { active: false, width: 0, x: 0 };
  const startMs = Math.min(motionReplayIntervalStartMs.value, motionReplayIntervalEndMs.value);
  const endMs = Math.max(motionReplayIntervalStartMs.value, motionReplayIntervalEndMs.value);
  const clampedStart = Math.max(chart.zoomWindow.startMs, Math.min(chart.zoomWindow.endMs, startMs));
  const clampedEnd = Math.max(chart.zoomWindow.startMs, Math.min(chart.zoomWindow.endMs, endMs));
  const x = getMotionTrackChartTimePercent(clampedStart, chart.zoomWindow);
  const endX = getMotionTrackChartTimePercent(clampedEnd, chart.zoomWindow);
  return {
    active: endX > x,
    width: Math.max(0, endX - x),
    x,
  };
});
const motionTrackChartIntervalActive = computed(() => Boolean(
  motionReplayDocument.value
    && Math.round(motionReplayIntervalStartMs.value) !== Math.round(motionReplayIntervalEndMs.value)
));
const motionReplayBookmarkCanSave = computed(() => Boolean(motionReplayDocument.value && motionTrackChartIntervalActive.value));
const motionReplayBookmarkRows = computed(() => motionReplayBookmarks.value);
const motionReplayBookmarkStatusLabel = computed(() => `${motionReplayBookmarkRows.value.length}/${MOTION_REPLAY_BOOKMARK_LIMIT}`);
const motionFocusedDebugExportAvailable = computed(() => Boolean(motionReplayDocument.value));
const motionWorkspaceOpen = computed(() => canDebugMotion.value && motionWorkspaceSession.value.isOpen);
const motionWorkspaceFullscreen = computed(() => motionWorkspaceSession.value.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN);
const motionWorkspaceDockWidthPx = computed(() => motionWorkspaceSession.value.dockWidthPx);
const motionWorkspaceDockResizeActive = computed(() => motionWorkspaceDockResize.value != null);
const motionWorkspaceModeLabel = computed(() => t(motionWorkspaceFullscreen.value ? "debug.common.fullscreen" : "debug.common.dock"));
const motionWorkspaceStyle = computed(() => (motionWorkspaceFullscreen.value
  ? undefined
  : { width: `${motionWorkspaceDockWidthPx.value}px` }));
const motionWorkspaceSelectedTimeMs = computed(() => motionWorkspaceSession.value.selectedTimeMs);
const motionWorkspaceSelectedTargetLabel = computed(() => formatMotionWorkspaceTarget(motionWorkspaceSession.value.selectedTarget));
const motionWorkspaceSelectedTrackLabel = computed(() => formatMotionWorkspaceTrack(motionWorkspaceSession.value.selectedTrack));
const motionWorkspaceFilterLabel = computed(() => {
  const filters = motionWorkspaceSession.value.filters;
  const preset = MOTION_FILTER_PRESETS.find((entry) => entry.value === filters.preset);
  const presetLabel = preset?.labelKey ? t(preset.labelKey) : (preset?.label || t("debug.common.all"));
  return `${presetLabel}${filters.query ? ` / ${filters.query}` : ""}`;
});
const motionWorkspaceSelectedTargetPinned = computed(() => {
  const selectedKey = getMotionWorkspaceTargetKey(motionWorkspaceSession.value.selectedTarget);
  return Boolean(selectedKey && motionWorkspaceSession.value.pinnedTargets.some((pin) => pin.key === selectedKey));
});
const motionWorkspacePinButtonLabel = computed(() => t(motionWorkspaceSelectedTargetPinned.value
  ? "debug.motion.actions.unpinTarget"
  : "debug.motion.actions.pinTarget"));
const motionInspectorModel = computed(() => motionReplayDocument.value
  ? motionReplayDocument.value.getView("inspector", {
    locale: resolvedLocale.value,
    selectedTarget: motionWorkspaceSession.value.selectedTarget,
    selectedTimeMs: motionWorkspaceSelectedTimeMs.value,
    selectedTrack: motionWorkspaceSession.value.selectedTrack,
    t: diagnosticTranslate,
  })
  : null);
const motionInspectorStatusRows = computed(() => {
  const current = motionInspectorModel.value?.current;
  return [
    { label: t("debug.motion.series.value"), value: current?.valueLabel || "-" },
    { label: t("debug.motion.series.to"), value: current?.toLabel || "-" },
    { label: t("debug.motion.series.delta"), value: current?.deltaLabel || "-" },
    { label: t("debug.motion.series.velocity"), value: current?.velocityLabel || "-" },
    { label: t("debug.motion.fields.driver"), value: current?.driver || "-" },
    { label: t("debug.motion.fields.lane"), value: current ? `${current.lane}/${current.laneKey}` : "-", wide: true },
    { label: t("debug.motion.fields.sourceLabel"), value: current?.sourceLabel || "-", wide: true },
  ];
});
const motionInspectorLaneRows = computed(() => motionInspectorModel.value?.laneBreakdown || []);
const motionInspectorWhyRows = computed(() => motionInspectorModel.value?.whyRows || []);
const motionInspectorEventRows = computed(() => motionInspectorModel.value?.recentEvents || []);
const motionInspectorWarningRows = computed(() => motionInspectorModel.value?.warnings || []);
const motionFocusedCopyButtonLabel = computed(() => t(hasCopiedMotionFocused.value ? "debug.common.copied" : "debug.motion.actions.copyFocusedAi"));
const motionFocusedDebugScopeRows = computed(() => [
  {
    label: t("debug.motion.fields.captureDocument"),
    value: t(motionReplayDocument.value ? "debug.common.loaded" : "debug.common.none"),
  },
  {
    label: t("debug.motion.fields.schemaTechnical"),
    value: MOTION_FOCUSED_DEBUG_SCHEMA,
    wide: true,
  },
  {
    label: t("debug.motion.fields.interval"),
    value: motionReplayDocument.value
      ? `${formatMotionReplayTime(motionReplayIntervalStartMs.value)}..${formatMotionReplayTime(motionReplayIntervalEndMs.value)}`
      : "-",
    wide: true,
  },
  {
    label: t("debug.motion.fields.selection"),
    value: formatMotionFocusedDebugSelectionLabel(),
    wide: true,
  },
  {
    label: t("debug.motion.fields.tracksTechnical"),
    value: t(motionWorkspaceSession.value.selectedTrack ? "debug.motion.values.selectedTrack" : "debug.motion.values.allMatchingTracks"),
  },
  {
    label: t("debug.motion.fields.profileTechnical"),
    value: formatMotionCaptureProfileLabel(motionCaptureProfile.value),
  },
  {
    label: t("debug.motion.fields.filterTechnical"),
    value: motionReplayFilters.value.query || t("debug.common.none"),
  },
  {
    label: t("debug.motion.fields.bookmarksTechnical"),
    value: motionReplayBookmarkStatusLabel.value,
  },
]);

function requireInputElement(event: Event): HTMLInputElement {
  if (event.currentTarget instanceof HTMLInputElement) return event.currentTarget;
  throw new TypeError("Background debug control event currentTarget must be an input element");
}

function requireEventCurrentElement(event: Event, label: string): Element {
  if (event.currentTarget instanceof Element) return event.currentTarget;
  throw new TypeError(`${label} event currentTarget must be an element`);
}

function requireEventTargetElement(event: Event, label: string): Element {
  if (event.target instanceof Element) return event.target;
  throw new TypeError(`${label} event target must be an element`);
}

function setAcrylicOverrideFromEvent(event: Event): void {
  setAcrylicDebugOverrideEnabled(requireInputElement(event).checked);
}

function setKawaseOverrideFromEvent(event: Event): void {
  setKawaseOverrideEnabled(requireInputElement(event).checked);
}

function setLayoutDebugEnabledFromEvent(event: Event): void {
  setLayoutDebugEnabled(requireInputElement(event).checked);
}

function setDragHitZonesDebugEnabledFromEvent(event: Event): void {
  setDragHitZonesDebugEnabled(requireInputElement(event).checked);
}

function setMotionRuntimeDebugEnabledFromEvent(event: Event): void {
  setMotionRuntimeDebugEnabled(requireInputElement(event).checked);
}

function setMotionRecordEnabledFromEvent(event: Event): void {
  setMotionRecordEnabled(requireInputElement(event).checked);
}

function setMotionOverlayEnabledFromEvent(event: Event): void {
  setMotionOverlayEnabled(requireInputElement(event).checked);
}

function formatValue(value: unknown, digits: number): string {
  return Number(value).toFixed(digits);
}

function formatDebugCount(value: unknown): string {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  return n(count, "decimal");
}

function formatMotionChartStat(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "-";
}

function formatMotionReplayTime(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(0)}ms` : "-";
}

function formatMotionTrackChartValue(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(2);
}

function clampMotionTrackChartValue(value: unknown, min: unknown, max: unknown): number {
  const number = Number(value);
  const lower = Number.isFinite(Number(min)) ? Number(min) : 0;
  const upper = Math.max(lower, Number.isFinite(Number(max)) ? Number(max) : lower);
  if (!Number.isFinite(number)) return lower;
  return Math.min(upper, Math.max(lower, number));
}

function getMotionTrackChartTimePercent(timeMs: unknown, zoomWindow: MotionTrackChartWindow = motionTrackChartZoomWindow.value): number {
  const startMs = Number(zoomWindow?.startMs) || 0;
  const endMs = Number(zoomWindow?.endMs) || startMs;
  const span = endMs - startMs;
  if (span <= 0) return 0;
  return clampMotionTrackChartValue(((Number(timeMs) - startMs) / span) * 100, 0, 100);
}

function readMotionTrackChartPointerTime(event: PointerEvent): number | null {
  const target = requireEventCurrentElement(event, "Motion chart pointer");
  const chart = motionTrackChartModel.value;
  const rect = target.getBoundingClientRect();
  if (!chart || rect.width <= 0) return null;
  const ratio = clampMotionTrackChartValue((event.clientX - rect.left) / rect.width, 0, 1);
  const zoom = chart.zoomWindow;
  return zoom.startMs + ratio * (zoom.endMs - zoom.startMs);
}

function captureMotionTrackChartPointer(target: Element, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId);
  } catch (error) {
    console.debug("Motion chart pointer capture was unavailable", error);
  }
}

function releaseMotionTrackChartPointer(target: Element, pointerId: number): void {
  try {
    target.releasePointerCapture(pointerId);
  } catch (error) {
    console.debug("Motion chart pointer capture was already released", error);
  }
}

function getMotionWorkspaceViewportWidth(): number | undefined {
  return typeof window === "undefined" ? undefined : window.innerWidth;
}

function isMotionWorkspaceEditableTarget(target: EventTarget | null): boolean {
  return Boolean(target instanceof Element
    && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

function resizeMotionWorkspaceDockTo(widthPx: unknown): void {
  motionWorkspaceSession.value = resizeMotionDebugWorkspaceDock(motionWorkspaceSession.value, widthPx, {
    viewportWidth: getMotionWorkspaceViewportWidth(),
  });
}

function stepMotionWorkspaceDockWidth(direction: number, event: Pick<KeyboardEvent, "shiftKey">): void {
  const step = event.shiftKey ? MOTION_WORKSPACE_DOCK_RESIZE_FAST_STEP_PX : MOTION_WORKSPACE_DOCK_RESIZE_STEP_PX;
  motionWorkspaceSession.value = resizeMotionDebugWorkspaceDockByDelta(
    motionWorkspaceSession.value,
    direction * step,
    { viewportWidth: getMotionWorkspaceViewportWidth() },
  );
}

function releaseMotionWorkspaceDockResizePointer(): void {
  const state = motionWorkspaceDockResize.value;
  if (!state) return;
  try {
    state.target.releasePointerCapture(state.pointerId);
  } catch (error) {
    console.debug("Motion workspace resize pointer was already released", error);
  }
}

function removeMotionWorkspaceDockResizeListeners(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("pointermove", updateMotionWorkspaceDockResize);
  window.removeEventListener("pointerup", endMotionWorkspaceDockResize);
  window.removeEventListener("pointercancel", cancelMotionWorkspaceDockResize);
}

function clearMotionWorkspaceDockResize(): void {
  releaseMotionWorkspaceDockResizePointer();
  removeMotionWorkspaceDockResizeListeners();
  motionWorkspaceDockResize.value = null;
}

function startMotionWorkspaceDockResize(event: PointerEvent): void {
  if (motionWorkspaceFullscreen.value || event.button !== 0) return;
  event.preventDefault();
  clearMotionWorkspaceDockResize();
  const target = requireEventCurrentElement(event, "Motion workspace resize");
  try {
    target.setPointerCapture(event.pointerId);
  } catch (error) {
    console.debug("Motion workspace resize pointer capture was unavailable", error);
  }
  motionWorkspaceDockResize.value = {
    pointerId: event.pointerId,
    startClientX: Number(event.clientX) || 0,
    startWidthPx: motionWorkspaceSession.value.dockWidthPx,
    target,
  };
  if (typeof window === "undefined") return;
  window.addEventListener("pointermove", updateMotionWorkspaceDockResize);
  window.addEventListener("pointerup", endMotionWorkspaceDockResize);
  window.addEventListener("pointercancel", cancelMotionWorkspaceDockResize);
}

function updateMotionWorkspaceDockResize(event: PointerEvent): void {
  const state = motionWorkspaceDockResize.value;
  if (!state || event.pointerId !== state.pointerId) return;
  const clientX = Number(event.clientX);
  if (!Number.isFinite(clientX)) return;
  event.preventDefault();
  resizeMotionWorkspaceDockTo(state.startWidthPx + state.startClientX - clientX);
}

function endMotionWorkspaceDockResize(event: PointerEvent): void {
  const state = motionWorkspaceDockResize.value;
  if (!state || event.pointerId !== state.pointerId) return;
  updateMotionWorkspaceDockResize(event);
  clearMotionWorkspaceDockResize();
}

function cancelMotionWorkspaceDockResize(event: PointerEvent): void {
  const state = motionWorkspaceDockResize.value;
  if (!state || event.pointerId !== state.pointerId) return;
  clearMotionWorkspaceDockResize();
}

function handleMotionWorkspaceResizeHandleKeydown(event: KeyboardEvent): void {
  if (motionWorkspaceFullscreen.value) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    stepMotionWorkspaceDockWidth(1, event);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    stepMotionWorkspaceDockWidth(-1, event);
  } else if (event.key === "Home") {
    event.preventDefault();
    resizeMotionWorkspaceDockTo(MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN);
  } else if (event.key === "End") {
    event.preventDefault();
    resizeMotionWorkspaceDockTo(MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX);
  }
}

function handleMotionWorkspaceGlobalKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.key !== "Escape" || !motionWorkspaceOpen.value) return;
  if (isMotionWorkspaceEditableTarget(event.target)) return;
  event.preventDefault();
  if (motionWorkspaceFullscreen.value) {
    setMotionWorkspaceMode(MOTION_DEBUG_WORKSPACE_MODE_DOCK);
  } else {
    closeMotionWorkspace();
  }
}

function formatMotionWorkspaceTarget(target: MotionTargetDisplayInput | null): string {
  if (!target) return t("debug.common.none");
  return target.label
    || target.sourceLabel
    || target.layer
    || target.kind
    || t("debug.motion.values.targetWithId", { id: target.targetId == null ? "-" : String(target.targetId) });
}

function formatMotionWorkspaceTrack(track: MotionTrackDisplayInput | null): string {
  if (!track) return t("debug.common.none");
  return `${track.prop || t("debug.motion.values.unknownProperty")} / ${track.lane || "base"}`;
}

function formatMotionFocusedDebugSelectionLabel(): string {
  const targetLabel = motionWorkspaceSelectedTargetLabel.value;
  const trackLabel = motionWorkspaceSelectedTrackLabel.value;
  const none = t("debug.common.none");
  if (targetLabel === none && trackLabel === none) return t("debug.motion.values.allVisibleReplayTracks");
  if (trackLabel === none) return targetLabel;
  return `${targetLabel} / ${trackLabel}`;
}

function formatMotionReplayBookmarkMeta(bookmark: MotionReplayBookmark): string {
  const parts = [
    `${formatMotionReplayTime(bookmark.startMs)}..${formatMotionReplayTime(bookmark.endMs)}`,
  ];
  const trackLabel = formatMotionWorkspaceTrack(bookmark.track);
  if (trackLabel !== t("debug.common.none")) parts.push(trackLabel);
  const targetLabel = formatMotionWorkspaceTarget(bookmark.selection);
  if (targetLabel !== t("debug.common.none")) parts.push(targetLabel);
  if (bookmark.filters?.query) parts.push(t("debug.motion.values.filterQuery", { query: bookmark.filters.query }));
  return parts.join(" / ");
}

function formatMotionCaptureFilterList(values: readonly string[] = []): string {
  return values.join(", ");
}

function formatMotionCaptureTargetFilterSummary(filters: Partial<MotionCaptureTargetFilters> = {}): string {
  const parts: string[] = [];
  if (filters.layers?.length) parts.push(t("debug.motion.counts.filterLayers", { count: filters.layers.length }));
  if (filters.kinds?.length) parts.push(t("debug.motion.counts.filterKinds", { count: filters.kinds.length }));
  if (filters.sourceLabels?.length) parts.push(t("debug.motion.counts.filterSources", { count: filters.sourceLabels.length }));
  if (filters.sourceQuery) parts.push(t("debug.motion.values.searchQuery", { query: filters.sourceQuery }));
  return parts.length ? parts.join(" / ") : t("debug.common.all");
}

function parseMotionCaptureFilterList(value: unknown): string[] {
  return String(value ?? "")
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getMotionWorkspaceTargetKey(target: MotionTargetDisplayInput | null): string | null {
  if (!target) return null;
  if (target.targetId != null) return `id:${target.targetId}`;
  if (target.sourceLabel) return `source:${target.sourceLabel}`;
  if (target.label) return `label:${target.label}`;
  return null;
}

function isSameMotionWorkspaceTarget(a: MotionTargetDisplayInput | null, b: MotionTargetDisplayInput | null): boolean {
  const keyA = getMotionWorkspaceTargetKey(a);
  const keyB = getMotionWorkspaceTargetKey(b);
  if (keyA || keyB) return keyA === keyB;
  return Boolean(a?.layer && b?.layer && a.layer === b.layer);
}

function isMotionWorkspaceLayerSelected(row: MotionLayerTreeRow): boolean {
  const target = motionWorkspaceSession.value.selectedTarget;
  return Boolean(target && target.kind === "layer" && target.layer === row.layer);
}

function isMotionWorkspaceTrackSelected(row: MotionTrackDisplayInput): boolean {
  const track = motionWorkspaceSession.value.selectedTrack;
  if (!track) return false;
  return isSameMotionWorkspaceTarget(track, row)
    && track.prop === row.prop
    && track.lane === row.lane
    && track.laneKey === row.laneKey;
}

function isMotionWorkspaceTimelineEventSelected(event: MotionTrackDisplayInput): boolean {
  return isMotionWorkspaceTrackSelected(event)
    && Math.round(motionWorkspaceSession.value.selectedTimeMs) === Math.round(Number(event.timeMs) || 0);
}

function formatMotionCaptureProfileLabel(profile: MotionCaptureProfile): string {
  return profile.labelKey ? t(profile.labelKey) : (profile.label || profile.id || t("debug.common.none"));
}

function formatBlurKernelLabel(kernel: BlurKernel): string {
  if (kernel === BLUR_KERNEL_GAUSSIAN) return t("debug.acrylic.kernel.gaussian");
  if (kernel === BLUR_KERNEL_DUAL_KAWASE) return t("debug.acrylic.kernel.dualKawase");
  return t("debug.acrylic.kernel.auto");
}

function formatEffectLabel(effect: string): string {
  if (effect === BACKGROUND_EFFECT_ACRYLIC) return "acrylic";
  if (effect === BACKGROUND_EFFECT_BLUR) return "blur";
  return effect;
}

function syncMotionControlsFromConfig(config: Partial<MotionDebugConfig> = {}): void {
  motionRuntimeDebugEnabled.value = Boolean(config.enabled);
  motionOverlayEnabled.value = Boolean(config.enabled && config.overlayEnabled);
  motionRecordEnabled.value = Boolean(config.enabled && config.recordHistory);
  motionTimeScale.value = normalizeMotionTimeScale(config.timeScale);
}

function recordMotionActionError(actionKey: string, error: unknown, technicalLabel: string): void {
  motionActionError.value = formatDiagnosticActionError(t(actionKey), error, diagnosticTranslate);
  console.warn(technicalLabel, error);
}

function recordMotionRefreshError(actionKey: string, error: unknown, technicalLabel: string): void {
  motionRefreshError.value = formatDiagnosticActionError(t(actionKey), error, diagnosticTranslate);
  console.warn(technicalLabel, error);
}

async function refreshMotionSnapshot() {
  if (!canDebugMotion.value) return;
  try {
    const currentConfig = motionSnapshot.value?.config || {};
    const includeDebugDetails = Boolean(currentConfig.enabled || motionRuntimeDebugEnabled.value);
    const snapshot = requireMotionDiagnosticSnapshot(await invokeDiagnosticTool("motion", "runtime.snapshot", {
      includeChannels: includeDebugDetails,
      includeTargets: includeDebugDetails,
    }));
    motionSnapshot.value = snapshot;
    if (snapshot?.capture) motionReplayCaptureStatus.value = snapshot.capture;
    syncMotionControlsFromConfig(snapshot?.config);
    const sharedDocument = motionDiagnosticSession.getDocument();
    if (sharedDocument && sharedDocument !== motionReplayDocument.value) {
      useMotionReplayDocument(sharedDocument, "", { updateImportText: false });
    } else if (!sharedDocument && motionReplayDocument.value) {
      clearMotionReplayViewer();
    }
    motionRefreshError.value = "";
    return snapshot;
  } catch (error) {
    recordMotionRefreshError("debug.motion.actions.refreshState", error, "Failed to refresh motion diagnostics");
    return null;
  }
}

async function refreshMotionHistoryReport(_reason = "manual") {
  if (!canDebugMotion.value) return;
  try {
    const delivery = await invokeDiagnosticTool("motion", "report.read", {
      includeChannels: true,
      includeCurveStats: true,
      includeHistory: true,
      includeTargets: true,
    });
    motionReport.value = requireMotionDebugReportInput(await consumeDiagnosticArtifactValue(delivery));
    await refreshMotionSnapshot();
  } catch (error) {
    recordMotionRefreshError("debug.motion.actions.refreshHistory", error, "Failed to refresh motion diagnostic history");
  }
}

async function applyMotionRuntimeDebugConfig() {
  if (!canDebugMotion.value) return;
  if (motionReplayCaptureActive.value) {
    await refreshMotionSnapshot();
    return;
  }
  const config = buildMotionRuntimeDebugConfig({
    customSeconds: motionCustomSeconds.value,
    enabled: motionRuntimeDebugEnabled.value,
    overlayEnabled: motionOverlayEnabled.value,
    recordEnabled: motionRecordEnabled.value,
    timeScale: motionTimeScale.value,
    windowPreset: motionWindowPreset.value,
  });
  motionCustomSeconds.value = normalizeMotionCustomSeconds(motionCustomSeconds.value);
  motionTimeScale.value = config.timeScale;
  try {
    const applied = requireMotionRuntimeDebugConfig(await invokeDiagnosticTool("motion", "runtime.configure", config));
    syncMotionControlsFromConfig(applied);
    motionActionError.value = "";
    await refreshMotionSnapshot();
  } catch (error) {
    recordMotionActionError("debug.motion.actions.applySettings", error, "Failed to apply motion diagnostic config");
    await refreshMotionSnapshot();
  }
}

async function disableMotionRuntimeDebug() {
  motionRuntimeDebugEnabled.value = false;
  motionRecordEnabled.value = false;
  motionOverlayEnabled.value = false;
  if (motionTimeScale.value !== 1) motionTimeScale.value = 1;
  try {
    const config = requireMotionRuntimeDebugConfig(await invokeDiagnosticTool("motion", "runtime.configure", {
      enabled: false,
      overlayEnabled: false,
      recordHistory: false,
      timeScale: 1,
    }));
    syncMotionControlsFromConfig(config);
    motionActionError.value = "";
    await refreshMotionSnapshot();
  } catch (error) {
    recordMotionActionError("debug.motion.actions.disableDiagnostics", error, "Failed to disable motion diagnostics");
    await refreshMotionSnapshot();
  }
}

function setMotionRuntimeDebugEnabled(enabled: boolean): void {
  motionRuntimeDebugEnabled.value = Boolean(enabled);
  if (!motionRuntimeDebugEnabled.value) {
    disableMotionRuntimeDebug();
  } else {
    applyMotionRuntimeDebugConfig();
  }
  restartMotionRuntimePoller();
}

function setMotionRecordEnabled(enabled: boolean): void {
  if (!motionRuntimeDebugEnabled.value) return;
  motionRecordEnabled.value = Boolean(enabled);
  applyMotionRuntimeDebugConfig();
}

function setMotionOverlayEnabled(enabled: boolean): void {
  if (!motionRuntimeDebugEnabled.value) return;
  motionOverlayEnabled.value = Boolean(enabled);
  applyMotionRuntimeDebugConfig();
}

function setMotionWindowPreset(preset: string): void {
  motionWindowPreset.value = MOTION_RECORD_WINDOW_PRESETS.some((entry) => entry.value === preset)
    ? preset
    : "30000";
  applyMotionRuntimeDebugConfig();
}

function syncMotionWorkspaceFilters(): void {
  motionWorkspaceSession.value = setMotionDebugWorkspaceFilters(motionWorkspaceSession.value, {
    preset: motionFilterPreset.value,
    query: motionFilterQuery.value,
  });
}

function setMotionFilterPreset(preset: string): void {
  motionFilterPreset.value = normalizeMotionFilterPreset(preset);
  syncMotionWorkspaceFilters();
}

function updateMotionFilterQuery(event: Event): void {
  motionFilterQuery.value = requireInputElement(event).value;
  syncMotionWorkspaceFilters();
}

function updateMotionCustomSeconds(event: Event): void {
  motionCustomSeconds.value = normalizeMotionCustomSeconds(requireInputElement(event).value);
  applyMotionRuntimeDebugConfig();
}

function updateMotionTimeScale(event: Event): void {
  motionTimeScale.value = normalizeMotionTimeScale(requireInputElement(event).value);
  applyMotionRuntimeDebugConfig();
}

function openMotionWorkspace(mode: MotionDebugWorkspaceMode = motionWorkspaceSession.value.mode || MOTION_DEBUG_WORKSPACE_MODE_DOCK): void {
  if (!canDebugMotion.value) return;
  const wasOpen = motionWorkspaceSession.value.isOpen;
  isCollapsed.value = false;
  activePanel.value = "motion";
  motionWorkspaceSession.value = openMotionDebugWorkspace(motionWorkspaceSession.value, {
    mode,
    viewportWidth: getMotionWorkspaceViewportWidth(),
  });
  if (!wasOpen) refreshMotionHistoryReport("open-workspace");
}

function selectMotionWorkspaceLayer(row: MotionLayerTreeRow): void {
  openMotionWorkspace();
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTarget(motionWorkspaceSession.value, {
    kind: "layer",
    label: row.layer,
    layer: row.layer,
  });
}

function selectMotionWorkspaceTrack(row: unknown): void {
  openMotionWorkspace();
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTrack(motionWorkspaceSession.value, row);
}

function selectMotionWorkspaceReplayOverlay(row: MotionReplayOverlayRow): void {
  if (!row) return;
  openMotionWorkspace();
  if (row.primaryTrack) {
    motionWorkspaceSession.value = selectMotionDebugWorkspaceTrack(motionWorkspaceSession.value, row.primaryTrack);
  } else {
    motionWorkspaceSession.value = selectMotionDebugWorkspaceTarget(motionWorkspaceSession.value, row);
  }
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, motionReplayCurrentTimeMs.value);
}

function selectMotionWorkspacePropertyByEvent(event: Event): void {
  const rowElement = requireEventTargetElement(event, "Motion workspace property selection")
    .closest<HTMLElement>("[data-motion-property-index]");
  if (!rowElement) return;
  const index = Number(rowElement.dataset.motionPropertyIndex);
  const row = motionPropertyRows.value[index];
  if (!row) return;
  selectMotionWorkspaceTrack(row);
}

function selectMotionWorkspaceTimelineEvent(event: MotionTrackDisplayInput & { timeMs: unknown }): void {
  openMotionWorkspace();
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTrack(motionWorkspaceSession.value, event);
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, event.timeMs);
}

function selectMotionWorkspaceCurve(group: MotionCurveChartGroup): void {
  openMotionWorkspace();
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTrack(motionWorkspaceSession.value, group);
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, group.latestTimeMs);
}

function setMotionTrackChartDisplayMode(mode: MotionTrackChartDisplayMode): void {
  motionTrackChartDisplayMode.value = mode === MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    ? MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    : MOTION_TRACK_CHART_DISPLAY_RAW;
}

function toggleMotionTrackChartSeries(key: MotionTrackChartSeriesKey, event: Event): void {
  motionTrackChartSeriesVisibility.value = normalizeMotionTrackChartSeriesVisibility({
    ...motionTrackChartSeriesVisibility.value,
    [key]: requireInputElement(event).checked,
  });
}

function setMotionTrackChartSelectedTime(timeMs: unknown): void {
  if (!motionReplayDocument.value) return;
  const normalizedTime = motionReplayDocument.value.getView("time.normalize", { timeMs });
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, normalizedTime);
}

function setMotionTrackChartBrushInterval(startMs: unknown, endMs: unknown): void {
  if (!motionReplayDocument.value) return;
  const start = normalizeMotionReplayIntervalTime(startMs);
  const end = normalizeMotionReplayIntervalTime(endMs);
  motionReplayIntervalStartMs.value = Math.min(start, end);
  motionReplayIntervalEndMs.value = Math.max(start, end);
}

function updateMotionTrackChartPointer(event: PointerEvent): void {
  const timeMs = readMotionTrackChartPointerTime(event);
  if (timeMs == null) return;
  setMotionTrackChartSelectedTime(timeMs);
  if (motionTrackChartBrushPointerId.value === event.pointerId && motionTrackChartBrushAnchorMs.value != null) {
    setMotionTrackChartBrushInterval(motionTrackChartBrushAnchorMs.value, timeMs);
  }
}

function startMotionTrackChartBrush(event: PointerEvent): void {
  if (!motionReplayDocument.value || event.button !== 0) return;
  const timeMs = readMotionTrackChartPointerTime(event);
  if (timeMs == null) return;
  stopMotionReplayPlayback();
  event.preventDefault();
  captureMotionTrackChartPointer(requireEventCurrentElement(event, "Motion chart brush start"), event.pointerId);
  motionTrackChartBrushPointerId.value = event.pointerId;
  motionTrackChartBrushAnchorMs.value = timeMs;
  setMotionTrackChartSelectedTime(timeMs);
  setMotionTrackChartBrushInterval(timeMs, timeMs);
}

function endMotionTrackChartBrush(event: PointerEvent): void {
  if (motionTrackChartBrushPointerId.value !== event.pointerId) return;
  const timeMs = readMotionTrackChartPointerTime(event);
  if (timeMs != null && motionTrackChartBrushAnchorMs.value != null) {
    setMotionTrackChartSelectedTime(timeMs);
    setMotionTrackChartBrushInterval(motionTrackChartBrushAnchorMs.value, timeMs);
  }
  releaseMotionTrackChartPointer(requireEventCurrentElement(event, "Motion chart brush end"), event.pointerId);
  motionTrackChartBrushPointerId.value = null;
  motionTrackChartBrushAnchorMs.value = null;
}

function cancelMotionTrackChartBrush(event: PointerEvent): void {
  if (motionTrackChartBrushPointerId.value == null) return;
  releaseMotionTrackChartPointer(
    requireEventCurrentElement(event, "Motion chart brush cancellation"),
    motionTrackChartBrushPointerId.value,
  );
  motionTrackChartBrushPointerId.value = null;
  motionTrackChartBrushAnchorMs.value = null;
}

function setMotionTrackChartZoomWindow(startMs: unknown, endMs: unknown): void {
  if (!motionReplayDocument.value) return;
  const zoom = motionReplayDocument.value.getView("track-chart.zoom", { endMs, startMs });
  motionTrackChartZoomStartMs.value = zoom.startMs;
  motionTrackChartZoomEndMs.value = zoom.endMs;
  setMotionTrackChartSelectedTime(clampMotionTrackChartValue(
    motionWorkspaceSession.value.selectedTimeMs,
    zoom.startMs,
    zoom.endMs,
  ));
}

function updateMotionTrackChartZoomStart(event: Event): void {
  setMotionTrackChartZoomWindow(requireInputElement(event).value, motionTrackChartZoomWindow.value.endMs);
}

function updateMotionTrackChartZoomEnd(event: Event): void {
  setMotionTrackChartZoomWindow(motionTrackChartZoomWindow.value.startMs, requireInputElement(event).value);
}

function resetMotionTrackChartZoom(): void {
  motionTrackChartZoomStartMs.value = null;
  motionTrackChartZoomEndMs.value = null;
}

function ensureMotionTrackChartTimeVisible(timeMs: unknown): void {
  if (!motionReplayDocument.value || !motionTrackChartZoomActive.value) return;
  const zoom = motionTrackChartZoomWindow.value;
  const time = Number(timeMs);
  if (!Number.isFinite(time)) return;
  if (time < zoom.startMs || time > zoom.endMs) resetMotionTrackChartZoom();
}

function zoomMotionTrackChartToInterval(): void {
  if (!motionTrackChartIntervalActive.value) return;
  setMotionTrackChartZoomWindow(motionReplayIntervalStartMs.value, motionReplayIntervalEndMs.value);
}

function selectMotionTrackChartTrack(track: MotionTrackChartTrack): void {
  selectMotionWorkspaceTrack(track);
  if (track.current) {
    motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, track.current.timeMs);
  }
}

function selectMotionTrackChartEvent(track: MotionTrackChartTrack, marker: MotionTrackChartMarker): void {
  selectMotionWorkspaceTrack(track);
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, marker.timeMs);
  setMotionReplayCurrentTime(marker.timeMs, { pause: true });
}

function jumpMotionReplayFinding(finding: MotionReplayAnalysisFinding): void {
  const location = finding.location;
  if (!motionReplayDocument.value || !location) return;
  if (location.track) selectMotionWorkspaceTrack(location.track);
  ensureMotionTrackChartTimeVisible(location.timeMs);
  setMotionReplayCurrentTime(location.timeMs, { pause: true });
}

function clearMotionWorkspaceSelection(): void {
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTarget(motionWorkspaceSession.value, null);
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, 0);
}

function toggleMotionWorkspaceSelectedPin(): void {
  if (!motionWorkspaceSession.value.selectedTarget) return;
  motionWorkspaceSession.value = toggleMotionDebugWorkspacePin(
    motionWorkspaceSession.value,
    motionWorkspaceSession.value.selectedTarget,
  );
}

function closeMotionWorkspace(): void {
  clearMotionWorkspaceDockResize();
  motionWorkspaceSession.value = closeMotionDebugWorkspace(motionWorkspaceSession.value);
}

function setMotionWorkspaceMode(mode: MotionDebugWorkspaceMode): void {
  if (mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN) {
    clearMotionWorkspaceDockResize();
  }
  motionWorkspaceSession.value = setMotionDebugWorkspaceMode(motionWorkspaceSession.value, mode);
  if (mode === MOTION_DEBUG_WORKSPACE_MODE_DOCK) {
    motionWorkspaceSession.value = resizeMotionDebugWorkspaceDock(
      motionWorkspaceSession.value,
      motionWorkspaceSession.value.dockWidthPx,
      { viewportWidth: getMotionWorkspaceViewportWidth() },
    );
  }
}

function updateMotionWorkspaceDockWidth(event: Event): void {
  resizeMotionWorkspaceDockTo(requireInputElement(event).value);
}

function updateMotionWorkspaceCaptureProfile(event: Event): void {
  motionWorkspaceSession.value = setMotionDebugWorkspaceCaptureProfile(
    motionWorkspaceSession.value,
    requireInputElement(event).value,
  );
}

function toggleMotionWorkspaceCaptureProp(prop: MotionCaptureAllowedProp, event: Event): void {
  motionWorkspaceSession.value = toggleMotionDebugWorkspaceCaptureProp(
    motionWorkspaceSession.value,
    prop,
    requireInputElement(event).checked,
  );
}

function updateMotionWorkspaceCaptureTargetFilter(key: MotionCaptureTargetFilterKey, event: Event): void {
  const currentFilters = motionWorkspaceSession.value.captureTargetFilters;
  const value = requireInputElement(event).value;
  motionWorkspaceSession.value = setMotionDebugWorkspaceCaptureTargetFilters(motionWorkspaceSession.value, {
    ...currentFilters,
    [key]: key === "sourceQuery" ? value : parseMotionCaptureFilterList(value),
  });
}

async function clearMotionDebugHistory() {
  if (!canDebugMotion.value) return;
  if (motionReplayCaptureActive.value) return;
  try {
    await invokeDiagnosticTool("motion", "history.clear");
    motionActionError.value = "";
    await refreshMotionHistoryReport("clear-history");
  } catch (error) {
    recordMotionActionError("debug.motion.actions.clearHistoryAction", error, "Failed to clear motion diagnostic history");
    await refreshMotionSnapshot();
  }
}

function updateMotionReplayCaptureSeconds(event: Event): void {
  motionReplayCaptureSeconds.value = normalizeMotionReplayCaptureSeconds(requireInputElement(event).value);
}

async function syncMotionControlsFromRuntimeConfig() {
  try {
    const description = requireMotionDiagnosticDescription(await describeDiagnosticTool("motion"));
    syncMotionControlsFromConfig(description.status?.config);
    if (description.status?.capture) motionReplayCaptureStatus.value = description.status.capture;
    motionRefreshError.value = "";
  } catch (error) {
    recordMotionRefreshError("debug.motion.actions.syncControls", error, "Failed to synchronize motion diagnostic controls");
  }
}

async function startMotionReplayCapture() {
  if (!canDebugMotion.value || motionReplayCaptureActive.value) return;
  motionReplayCaptureSeconds.value = normalizeMotionReplayCaptureSeconds(motionReplayCaptureSeconds.value);
  try {
    await releaseMotionReplayCaptureArtifact();
    motionReplayCaptureSummary.value = null;
    hasCopiedMotionReplayTrace.value = false;
    motionReplayCaptureStatus.value = requireMotionReplayCaptureStatus(await invokeDiagnosticTool("motion", "replay.capture.start", {
      captureProfile: motionCaptureProfile.value,
      seconds: motionReplayCaptureSeconds.value,
    }));
    motionActionError.value = "";
    await syncMotionControlsFromRuntimeConfig();
    await refreshMotionSnapshot();
    restartMotionRuntimePoller();
  } catch (error) {
    recordMotionActionError("debug.motion.actions.startCaptureAction", error, "Failed to start motion replay capture");
    await refreshMotionSnapshot();
  }
}

async function stopMotionReplayCapture(options: ReplayCaptureStopOptions = {}): Promise<DiagnosticArtifactDelivery | null> {
  if (!canDebugMotion.value || !motionReplayCaptureActive.value) return null;
  try {
    const delivery = await invokeDiagnosticTool("motion", "replay.capture.stop", {
      restore: options.restore !== false,
    });
    if (!isDiagnosticArtifactDelivery(delivery)) {
      throw new TypeError("Motion replay capture stop did not return an artifact delivery");
    }
    motionReplayCaptureArtifact.value = delivery;
    const capturedDocument = motionDiagnosticSession.getDocument();
    if (!capturedDocument) throw new Error(t("debug.motion.errors.captureDocumentMissing"));
    motionReplayCaptureSummary.value = {
      capture: { profile: motionCaptureProfile.value },
      schema: capturedDocument.sourceSchema || capturedDocument.schema,
      summary: capturedDocument.summary(),
    };
    useMotionReplayDocument(capturedDocument, "", { updateImportText: false });
    motionActionError.value = "";
    await syncMotionControlsFromRuntimeConfig();
    await refreshMotionSnapshot();
    restartMotionRuntimePoller();
    return delivery;
  } catch (error) {
    recordMotionActionError("debug.motion.actions.stopCaptureAction", error, "Failed to stop motion replay capture");
    await refreshMotionSnapshot();
    return null;
  }
}

function syncMotionReplayIntervalToRange(document: MotionReplayDocument): void {
  const range = document.timeRange();
  motionReplayIntervalStartMs.value = Number(range.min) || 0;
  motionReplayIntervalEndMs.value = Number(range.max) || 0;
}

function normalizeMotionReplayIntervalTime(timeMs: unknown): number {
  if (!motionReplayDocument.value) return 0;
  return Math.round(motionReplayDocument.value.getView("time.normalize", { timeMs }));
}

function setMotionReplayCurrentTime(timeMs: unknown, options: ReplayTimeOptions = {}): void {
  if (!motionReplayDocument.value) return;
  if (options.pause) stopMotionReplayPlayback();
  const normalizedTime = motionReplayDocument.value.getView("time.normalize", { timeMs });
  motionReplayCurrentTimeMs.value = normalizedTime;
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, normalizedTime);
}

function useMotionReplayDocument(document: MotionReplayDocument, json = "", options: ReplayDocumentUseOptions = {}): void {
  motionReplayDocument.value = document;
  if (options.updateImportText) {
    motionReplayImportText.value = json || document.export({ format: "json" }).content;
  }
  motionReplayImportError.value = "";
  motionReplayFilterQuery.value = "";
  const range = document.timeRange();
  motionReplayCurrentTimeMs.value = document.getView("time.normalize", { timeMs: range.min });
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, motionReplayCurrentTimeMs.value);
  syncMotionReplayIntervalToRange(document);
  clearMotionReplayBookmarks();
  resetMotionTrackChartZoom();
  stopMotionReplayPlayback();
}

function loadMotionReplayTrace(trace: unknown, json = "", options: ReplayDocumentUseOptions = {}): void {
  if (!canDebugMotion.value) return;
  try {
    useMotionReplayDocument(motionDiagnosticSession.load(trace), json, options);
  } catch (error) {
    motionReplayImportError.value = error instanceof Error ? error.message : String(error);
  }
}

function loadMotionReplayJson(json: string, options: ReplayDocumentUseOptions = {}): void {
  if (!canDebugMotion.value) return;
  try {
    useMotionReplayDocument(
      motionDiagnosticSession.loadJson(json, { maxBytes: MOTION_REPLAY_IMPORT_MAX_BYTES }),
      json,
      options,
    );
  } catch (error) {
    motionReplayImportError.value = error instanceof Error ? error.message : String(error);
  }
}

async function loadCapturedMotionReplayTrace() {
  if (!motionReplayCaptureArtifact.value) return;
  try {
    const trace = await readDiagnosticArtifactValue(motionReplayCaptureArtifact.value);
    loadMotionReplayTrace(trace, "", { updateImportText: false });
  } catch (error) {
    motionReplayImportError.value = error instanceof Error ? error.message : String(error);
  }
}

async function releaseMotionReplayCaptureArtifact() {
  const delivery = motionReplayCaptureArtifact.value;
  if (!delivery) return;
  await releaseDiagnosticArtifact(delivery);
  if (motionReplayCaptureArtifact.value === delivery) motionReplayCaptureArtifact.value = null;
}

function clearMotionReplayViewer(): void {
  stopMotionReplayPlayback();
  motionDiagnosticSession.close();
  motionReplayDocument.value = null;
  motionReplayImportText.value = "";
  motionReplayImportError.value = "";
  motionReplayCurrentTimeMs.value = 0;
  motionReplayFilterQuery.value = "";
  motionReplayIntervalStartMs.value = 0;
  motionReplayIntervalEndMs.value = 0;
  clearMotionReplayBookmarks();
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, 0);
  resetMotionTrackChartZoom();
}

function updateMotionReplayImportText(event: Event): void {
  motionReplayImportText.value = requireInputElement(event).value;
  if (motionReplayImportError.value) motionReplayImportError.value = "";
}

function loadMotionReplayImportText() {
  loadMotionReplayJson(motionReplayImportText.value, { updateImportText: true });
}

async function importMotionReplayFile(event: Event): Promise<void> {
  const input = requireInputElement(event);
  const file = input.files?.[0];
  if (!file) return;
  try {
    assertMotionReplayImportSize(file.size);
    const text = await file.text();
    loadMotionReplayJson(text, { updateImportText: false });
  } catch (error) {
    motionReplayImportError.value = error instanceof Error ? error.message : String(error);
  } finally {
    input.value = "";
  }
}

function updateMotionReplayCurrentTime(event: Event): void {
  setMotionReplayCurrentTime(requireInputElement(event).value, { pause: true });
}

function stepMotionReplayFrame(direction: MotionReplayStepDirection): void {
  if (!motionReplayDocument.value) return;
  const timeMs = motionReplayDocument.value.getView("step.frame", {
    direction,
    timeMs: motionReplayCurrentTimeMs.value,
  });
  setMotionReplayCurrentTime(timeMs, { pause: true });
}

function stepMotionReplayEvent(direction: MotionReplayStepDirection): void {
  if (!motionReplayDocument.value) return;
  const event = motionReplayDocument.value.getView("step.event", {
    direction,
    filters: motionReplayFilters.value,
    timeMs: motionReplayCurrentTimeMs.value,
  });
  if (!event) return;
  selectMotionWorkspaceTrack(event);
  setMotionReplayCurrentTime(event.timeMs, { pause: true });
}

function updateMotionReplayFilterQuery(event: Event): void {
  motionReplayFilterQuery.value = requireInputElement(event).value;
}

function updateMotionReplayIntervalStart(event: Event): void {
  if (!motionReplayDocument.value) return;
  motionReplayIntervalStartMs.value = normalizeMotionReplayIntervalTime(requireInputElement(event).value);
}

function updateMotionReplayIntervalEnd(event: Event): void {
  if (!motionReplayDocument.value) return;
  motionReplayIntervalEndMs.value = normalizeMotionReplayIntervalTime(requireInputElement(event).value);
}

function buildMotionReplayBookmarkInput(): MotionReplayBookmarkInput {
  const selectedTrack = motionWorkspaceSession.value.selectedTrack;
  return {
    endMs: motionReplayIntervalEndMs.value,
    filters: motionReplayFilters.value,
    selection: motionWorkspaceSession.value.selectedTarget,
    startMs: motionReplayIntervalStartMs.value,
    track: selectedTrack,
  };
}

function saveMotionReplayBookmark(): void {
  const document = motionReplayDocument.value;
  if (!document || !motionReplayBookmarkCanSave.value) return;
  motionReplayBookmarks.value = addMotionReplayBookmark(
    motionReplayBookmarks.value,
    buildMotionReplayBookmarkInput(),
    {
      createdAt: new Date().toISOString(),
      normalizeTime: (timeMs) => document.getView("time.normalize", { timeMs }),
    },
  );
}

function applyMotionReplayBookmark(bookmark: MotionReplayBookmark): void {
  if (!motionReplayDocument.value) return;
  stopMotionReplayPlayback();
  motionReplayIntervalStartMs.value = normalizeMotionReplayIntervalTime(bookmark.startMs);
  motionReplayIntervalEndMs.value = normalizeMotionReplayIntervalTime(bookmark.endMs);
  if (bookmark.filters?.query != null) motionReplayFilterQuery.value = bookmark.filters.query;
  if (bookmark.track) {
    motionWorkspaceSession.value = selectMotionDebugWorkspaceTrack(motionWorkspaceSession.value, bookmark.track);
  } else if (bookmark.selection) {
    motionWorkspaceSession.value = selectMotionDebugWorkspaceTarget(motionWorkspaceSession.value, bookmark.selection);
  }
  setMotionReplayCurrentTime(motionReplayIntervalStartMs.value, { pause: true });
}

function deleteMotionReplayBookmark(bookmark: MotionReplayBookmark): void {
  motionReplayBookmarks.value = removeMotionReplayBookmark(motionReplayBookmarks.value, bookmark.id);
}

function clearMotionReplayBookmarks(): void {
  motionReplayBookmarks.value = [];
}

function stopMotionReplayPlayback(): void {
  if (motionReplayPlaybackTimer != null) window.clearInterval(motionReplayPlaybackTimer);
  motionReplayPlaybackTimer = null;
  motionReplayPlaybackLastTime = 0;
  motionReplayPlaying.value = false;
}

function startMotionReplayPlayback(): void {
  if (!motionReplayDocument.value || motionReplayPlaying.value) return;
  const range = motionReplayDocument.value.timeRange();
  if (motionReplayCurrentTimeMs.value >= range.max) {
    motionReplayCurrentTimeMs.value = motionReplayDocument.value.getView("time.normalize", { timeMs: range.min });
  }
  motionReplayPlaying.value = true;
  motionReplayPlaybackLastTime = performance.now();
  motionReplayPlaybackTimer = window.setInterval(() => {
    if (!motionReplayDocument.value) {
      stopMotionReplayPlayback();
      return;
    }
    const now = performance.now();
    const delta = now - motionReplayPlaybackLastTime;
    motionReplayPlaybackLastTime = now;
    const nextTime = motionReplayCurrentTimeMs.value + delta;
    const currentRange = motionReplayDocument.value.timeRange();
    if (nextTime >= currentRange.max) {
      setMotionReplayCurrentTime(currentRange.max);
      stopMotionReplayPlayback();
      return;
    }
    setMotionReplayCurrentTime(nextTime);
  }, 33);
}

function toggleMotionReplayPlayback(): void {
  if (motionReplayPlaying.value) stopMotionReplayPlayback();
  else startMotionReplayPlayback();
}

function normalizeDebugPanelDock(value: unknown): DebugPanelDock {
  return value === "left" ? "left" : "right";
}

function readDebugPanelDock(): DebugPanelDock {
  if (typeof window === "undefined") return "right";
  try {
    return normalizeDebugPanelDock(window.localStorage.getItem(DEBUG_PANEL_DOCK_STORAGE_KEY));
  } catch (error) {
    console.debug("Background debug panel dock preference was unavailable", error);
    return "right";
  }
}

function persistDebugPanelDock(dock: DebugPanelDock): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEBUG_PANEL_DOCK_STORAGE_KEY, normalizeDebugPanelDock(dock));
  } catch (error) {
    console.debug("Background debug panel dock preference could not be persisted", error);
  }
}

function setDebugPanelDock(dock: DebugPanelDock): void {
  debugPanelDock.value = normalizeDebugPanelDock(dock);
  persistDebugPanelDock(debugPanelDock.value);
}

function updateNumber(key: AcrylicNumberKey, event: Event): void {
  updateAcrylicDebugParams({ [key]: Number(requireInputElement(event).value) });
}

function syncLiveDesktopDebugEffects(options: LiveDesktopSyncOptions = {}): void {
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

function setKawaseOverrideEnabled(enabled: boolean): void {
  setKawaseDebugOverrideEnabled(enabled);
  syncLiveDesktopDebugEffects({ delay: 0 });
}

function setBlurKernel(kernel: BlurKernel): void {
  updateKawaseDebugParams({ kernel });
  syncLiveDesktopDebugEffects({ delay: 0 });
}

function updateKawaseNumber(key: KawaseNumberKey, event: Event): void {
  updateKawaseDebugParams({ [key]: Number(requireInputElement(event).value) });
  syncLiveDesktopDebugEffects();
}

function setLayoutDebugEnabled(enabled: boolean): void {
  props.updateDesktopLayoutDebugParams?.({ enabled });
}

function setDragHitZonesDebugEnabled(dragHitZonesEnabled: boolean): void {
  props.updateDesktopLayoutDebugParams?.({ dragHitZonesEnabled });
}

function updateLayoutNumber(key: LayoutNumberKey, event: Event): void {
  props.updateDesktopLayoutDebugParams?.({ [key]: Number(requireInputElement(event).value) });
}

function resetLayoutDebugParams(): void {
  props.resetDesktopLayoutDebugParams?.();
}

function showDebugStatusDialog(sample: DebugStatusDialogInput): void {
  props.dialogState?.openWarningDialog?.({
    title: sample.title,
    message: sample.message,
    suggestion: sample.suggestion || "",
    intent: sample.intent,
    cancelText: sample.cancelText || "",
    confirmText: sample.confirmText,
  });
}

function showDebugLayoutSaveFailed(): void {
  props.dialogState?.showLayoutSaveFailed?.({
    error: new Error("EACCES: permission denied, open C:/Users/233/AppData/Roaming/com.lumeria.app/layout.json"),
    retryCount: 3,
    onRetry: () => props.dialogState?.showLayoutSaveRecovered?.(),
  });
}

function showDebugLayoutSaveRecovered(): void {
  props.dialogState?.showLayoutSaveRecovered?.();
}

function showDebugLayoutLoadFailed(): void {
  props.dialogState?.showLayoutLoadFailed?.({
    error: new Error("Unexpected token at position 128 while parsing layout.json"),
    retryCount: 2,
    onRetry: () => props.dialogState?.showLayoutLoadRecovered?.(),
  });
}

function showDebugLayoutLoadRecovered(): void {
  props.dialogState?.showLayoutLoadRecovered?.();
}

function showDebugNoticeStack(): void {
  showDebugLayoutSaveFailed();
}

function clearDebugNotices(): void {
  props.dialogState?.closeWarningDialog?.();
  props.dialogState?.closeTransientNotice?.();
}

function resetBackgroundDebugParams(): void {
  resetAcrylicDebugParams();
  resetKawaseDebugParams();
  syncLiveDesktopDebugEffects({ delay: 0 });
}

function updateTintColor(event: Event): void {
  updateAcrylicDebugParams({
    tintColor: hexToRgbArray(requireInputElement(event).value, params.tintColor),
  });
}

function copyToClipboard(text: string, copiedRef: Ref<boolean>, timerName: ClipboardTimerName): Promise<void> {
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
    if (timerName === "motionSummary") {
      if (motionSummaryCopyStateTimer != null) window.clearTimeout(motionSummaryCopyStateTimer);
      motionSummaryCopyStateTimer = window.setTimeout(() => {
        motionSummaryCopyStateTimer = null;
        copiedRef.value = false;
      }, 1200);
      return;
    }
    if (timerName === "motionFull") {
      if (motionFullCopyStateTimer != null) window.clearTimeout(motionFullCopyStateTimer);
      motionFullCopyStateTimer = window.setTimeout(() => {
        motionFullCopyStateTimer = null;
        copiedRef.value = false;
      }, 1200);
      return;
    }
    if (timerName === "motionFocused") {
      if (motionFocusedCopyStateTimer != null) window.clearTimeout(motionFocusedCopyStateTimer);
      motionFocusedCopyStateTimer = window.setTimeout(() => {
        motionFocusedCopyStateTimer = null;
        copiedRef.value = false;
      }, 1200);
      return;
    }
    if (timerName === "motionReplayTrace") {
      if (motionReplayTraceCopyStateTimer != null) window.clearTimeout(motionReplayTraceCopyStateTimer);
      motionReplayTraceCopyStateTimer = window.setTimeout(() => {
        motionReplayTraceCopyStateTimer = null;
        copiedRef.value = false;
      }, 1200);
      return;
    }
    if (timerName === "motionReplayInterval") {
      if (motionReplayIntervalCopyStateTimer != null) window.clearTimeout(motionReplayIntervalCopyStateTimer);
      motionReplayIntervalCopyStateTimer = window.setTimeout(() => {
        motionReplayIntervalCopyStateTimer = null;
        copiedRef.value = false;
      }, 1200);
      return;
    }
    throw new Error(`Unknown copy state timer: ${timerName}`);
  });
}

async function copyParams() {
  try {
    await copyToClipboard(formatAcrylicDebugParams(), hasCopiedAcrylic, "acrylic");
  } catch (error) {
    console.warn("Failed to copy Acrylic debug params", error);
  }
}

async function copyMotionReport(mode: "full" | "summary"): Promise<void> {
  if (!canDebugMotion.value) return;
  try {
    const delivery = await invokeDiagnosticTool("motion", "report.generate", {
      mode,
      presentation: "markdown",
    });
    const copyText = await consumeDiagnosticArtifactText(delivery, { path: ["content"] });
    await copyToClipboard(
      copyText,
      mode === "full" ? hasCopiedMotionFull : hasCopiedMotionSummary,
      mode === "full" ? "motionFull" : "motionSummary",
    );
    motionActionError.value = "";
    if (mode === "full") {
      refreshMotionHistoryReport("copy-full-ai-report");
    } else {
      refreshMotionSnapshot();
    }
  } catch (error) {
    recordMotionActionError("debug.motion.actions.copyReport", error, "Failed to copy Pixi motion debug report");
  }
}

function buildMotionFocusedDebugExportOptions(bookmark: MotionReplayBookmark | null = null): MotionFocusedDebugExportOptions {
  const selectedTrack = bookmark?.track || motionWorkspaceSession.value.selectedTrack;
  const selection = bookmark?.selection || motionWorkspaceSession.value.selectedTarget;
  const filters = bookmark?.filters || motionReplayFilters.value;
  const interval = bookmark
    ? { endMs: bookmark.endMs, startMs: bookmark.startMs }
    : { endMs: motionReplayIntervalEndMs.value, startMs: motionReplayIntervalStartMs.value };
  const visibleTracks = selectedTrack?.targetId != null ? [selectedTrack] : [];
  return {
    bookmark,
    captureProfile: motionCaptureProfile.value,
    filters,
    interval,
    ...(selection ? { selection: { ...selection } } : {}),
    ...(selectedTrack ? { track: { ...selectedTrack } } : {}),
    visibleTracks,
  };
}

async function copyMotionFocusedDebugExport(bookmark: MotionReplayBookmark | null = null): Promise<void> {
  if (!canDebugMotion.value || !motionReplayDocument.value) return;
  try {
    const focused = motionReplayDocument.value.export({
      ...buildMotionFocusedDebugExportOptions(bookmark?.id ? bookmark : null),
      format: "focused",
      presentation: "markdown",
    });
    if (focused.presentation !== "markdown") {
      throw new TypeError("Focused Motion debug export did not return Markdown presentation");
    }
    await copyToClipboard(
      focused.content,
      hasCopiedMotionFocused,
      "motionFocused",
    );
    motionActionError.value = "";
  } catch (error) {
    recordMotionActionError("debug.motion.actions.copyFocusedReport", error, "Failed to copy focused Pixi motion debug export");
  }
}

async function copyMotionReplayTrace() {
  if (!canDebugMotion.value || !motionReplayCaptureArtifact.value) return;
  try {
    const json = await readDiagnosticArtifactJsonText(motionReplayCaptureArtifact.value);
    await copyToClipboard(
      json,
      hasCopiedMotionReplayTrace,
      "motionReplayTrace",
    );
    motionActionError.value = "";
  } catch (error) {
    recordMotionActionError("debug.motion.actions.copyCaptureAction", error, "Failed to copy Pixi motion replay trace");
  }
}

async function copyMotionReplayInterval() {
  if (!canDebugMotion.value || !motionReplayDocument.value) return;
  try {
    const interval = motionReplayDocument.value.export({
      endMs: motionReplayIntervalEndMs.value,
      filters: motionReplayFilters.value,
      format: "interval",
      presentation: "json",
      startMs: motionReplayIntervalStartMs.value,
    });
    if (interval.presentation !== "json") {
      throw new TypeError("Motion replay interval export did not return JSON presentation");
    }
    await copyToClipboard(
      interval.content,
      hasCopiedMotionReplayInterval,
      "motionReplayInterval",
    );
    motionActionError.value = "";
  } catch (error) {
    recordMotionActionError("debug.motion.actions.copyIntervalAction", error, "Failed to copy Pixi motion replay interval");
  }
}

function clearMotionRuntimePoller() {
  if (motionRuntimePollTimer == null) return;
  window.clearInterval(motionRuntimePollTimer);
  motionRuntimePollTimer = null;
}

function restartMotionRuntimePoller() {
  clearMotionRuntimePoller();
  if (typeof window === "undefined") return;
  if (!canDebugMotion.value) {
    stopMotionReplayPlayback();
    stopMotionReplayCapture();
    disableMotionRuntimeDebug();
    return;
  }
  if (isCollapsed.value || activePanel.value !== "motion") {
    stopMotionReplayPlayback();
    return;
  }
  applyMotionRuntimeDebugConfig();
  if (motionRuntimeDebugEnabled.value || motionReplayCaptureActive.value) {
    motionRuntimePollTimer = window.setInterval(refreshMotionSnapshot, 500);
  }
}

async function disposeMotionDebugPanelState() {
  stopMotionReplayPlayback();
  await stopMotionReplayCapture();
  await releaseMotionReplayCaptureArtifact();
  motionDiagnosticSession.close();
  motionReplayDocument.value = null;
  await disableMotionRuntimeDebug();
}

const motionDebugWorkspaceContext = createMotionDebugWorkspaceContext({
  targets: {
    MOTION_FILTER_PRESETS,
    isMotionWorkspaceLayerSelected,
    motionAnimationRows,
    motionCaptureAllowedProps,
    motionCaptureEstimateRows,
    motionCaptureProfile,
    motionCaptureProfiles,
    motionCaptureSelectedPropCount,
    motionCaptureTargetFilterText,
    motionFilterPreset,
    motionFilterQuery,
    motionFilterSummary,
    motionLayerTreeRows,
    motionOverviewRows,
    motionReplayCaptureActive,
    motionWorkspaceSession,
    selectMotionWorkspaceLayer,
    setMotionFilterPreset,
    toggleMotionWorkspaceCaptureProp,
    updateMotionFilterQuery,
    updateMotionWorkspaceCaptureProfile,
    updateMotionWorkspaceCaptureTargetFilter,
  },
  timeline: {
    MOTION_REPLAY_IMPORT_MAX_BYTES,
    MOTION_TRACK_CHART_DISPLAY_NORMALIZED,
    MOTION_TRACK_CHART_DISPLAY_RAW,
    applyMotionReplayBookmark,
    cancelMotionTrackChartBrush,
    clearMotionReplayBookmarks,
    clearMotionReplayViewer,
    copyMotionFocusedDebugExport,
    copyMotionReplayInterval,
    deleteMotionReplayBookmark,
    endMotionTrackChartBrush,
    formatMotionChartStat,
    formatMotionReplayBookmarkMeta,
    formatMotionReplayTime,
    formatMotionTrackChartValue,
    importMotionReplayFile,
    isMotionWorkspaceTimelineEventSelected,
    isMotionWorkspaceTrackSelected,
    jumpMotionReplayFinding,
    loadCapturedMotionReplayTrace,
    loadMotionReplayImportText,
    motionCurveChartGroups,
    motionReplayFindingRows,
    motionReplayFindingStatusLabel,
    motionReplayBookmarkCanSave,
    motionReplayBookmarkRows,
    motionReplayBookmarkStatusLabel,
    motionReplayCaptureActive,
    motionReplayCurrentTimeMs,
    motionReplayCurveGroups,
    motionReplayEventRows,
    motionReplayFilterQuery,
    motionReplayFilterSummary,
    motionReplayFrameRows,
    motionReplayImportError,
    motionReplayImportStatus,
    motionReplayImportText,
    motionReplayIntervalCopyButtonLabel,
    motionReplayIntervalEndMs,
    motionReplayIntervalStartMs,
    motionReplayOverlayRows,
    motionReplayOverviewRows,
    motionReplayPlayButtonLabel,
    motionReplayTimeRange,
    motionReplayCaptureAvailable,
    motionReplayViewerLoaded,
    motionTimelineGroups,
    motionTrackChartBrushPointerId,
    motionTrackChartDisplayMode,
    motionTrackChartHeaderLabel,
    motionTrackChartIntervalActive,
    motionTrackChartIntervalOverlay,
    motionTrackChartModel,
    motionTrackChartSeriesOptions,
    motionTrackChartSeriesVisibility,
    motionTrackChartSummaryRows,
    motionTrackChartZoomActive,
    motionTrackChartZoomWindow,
    resetMotionTrackChartZoom,
    saveMotionReplayBookmark,
    selectMotionTrackChartEvent,
    selectMotionTrackChartTrack,
    selectMotionWorkspaceCurve,
    selectMotionWorkspaceReplayOverlay,
    selectMotionWorkspaceTimelineEvent,
    selectMotionWorkspaceTrack,
    setMotionReplayCurrentTime,
    setMotionTrackChartDisplayMode,
    startMotionTrackChartBrush,
    stepMotionReplayEvent,
    stepMotionReplayFrame,
    toggleMotionReplayPlayback,
    toggleMotionTrackChartSeries,
    updateMotionReplayCurrentTime,
    updateMotionReplayFilterQuery,
    updateMotionReplayImportText,
    updateMotionReplayIntervalEnd,
    updateMotionReplayIntervalStart,
    updateMotionTrackChartPointer,
    updateMotionTrackChartZoomEnd,
    updateMotionTrackChartZoomStart,
    zoomMotionTrackChartToInterval,
  },
  inspector: {
    clearMotionDebugHistory,
    copyMotionFocusedDebugExport,
    copyMotionReport,
    formatMotionReplayTime,
    isMotionWorkspaceTrackSelected,
    motionCancelReasonRows,
    motionFocusedCopyButtonLabel,
    motionFocusedDebugExportAvailable,
    motionFocusedDebugScopeRows,
    motionFullCopyButtonLabel,
    motionInspectorEventRows,
    motionInspectorLaneRows,
    motionInspectorModel,
    motionInspectorStatusRows,
    motionInspectorWarningRows,
    motionInspectorWhyRows,
    motionPropertyRows,
    motionReplayCaptureActive,
    motionSummaryCopyButtonLabel,
    motionWarningRows,
    motionWorkspaceFilterLabel,
    motionWorkspaceSelectedTargetLabel,
    motionWorkspaceSelectedTimeMs,
    motionWorkspaceSelectedTrackLabel,
    selectMotionWorkspacePropertyByEvent,
  },
});

provide(MOTION_DEBUG_WORKSPACE_CONTEXT_KEY, motionDebugWorkspaceContext);

watch(canDebugLiveDesktop, (enabled) => {
  if (!enabled && activePanel.value === "liveDesktop") activePanel.value = "acrylic";
}, { immediate: true });

watch(canDebugMotion, (enabled) => {
  if (enabled) return;
  closeMotionWorkspace();
  if (activePanel.value === "motion") activePanel.value = "acrylic";
}, { immediate: true });

watch(canDebugRender, (enabled) => {
  if (!enabled && activePanel.value === "render") activePanel.value = "acrylic";
}, { immediate: true });

watch([isCollapsed, activePanel, canDebugMotion], restartMotionRuntimePoller, { flush: "post" });

onMounted(() => {
  window.addEventListener("keydown", handleMotionWorkspaceGlobalKeydown);
  restartMotionRuntimePoller();
});

onBeforeUnmount(() => {
  if (acrylicCopyStateTimer != null) window.clearTimeout(acrylicCopyStateTimer);
  if (motionFocusedCopyStateTimer != null) window.clearTimeout(motionFocusedCopyStateTimer);
  if (motionFullCopyStateTimer != null) window.clearTimeout(motionFullCopyStateTimer);
  if (motionReplayIntervalCopyStateTimer != null) window.clearTimeout(motionReplayIntervalCopyStateTimer);
  if (motionReplayTraceCopyStateTimer != null) window.clearTimeout(motionReplayTraceCopyStateTimer);
  if (motionSummaryCopyStateTimer != null) window.clearTimeout(motionSummaryCopyStateTimer);
  if (kawaseLiveDesktopSyncTimer != null) window.clearTimeout(kawaseLiveDesktopSyncTimer);
  void disposeMotionDebugPanelState().catch((error) => {
    console.error("Failed to release Motion debug panel state", error);
  });
  clearMotionWorkspaceDockResize();
  window.removeEventListener("keydown", handleMotionWorkspaceGlobalKeydown);
  clearMotionRuntimePoller();
});
</script>

<style>
.background-debug-panel {
  position: fixed;
  --background-debug-panel-inset: 18px;
  bottom: 18px;
  z-index: 88;
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

.background-debug-panel-right {
  right: var(--background-debug-panel-inset);
  left: auto;
}

.background-debug-panel-left {
  right: auto;
  left: var(--background-debug-panel-inset);
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

.background-debug-header-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
}

.background-debug-dock-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-dock-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 24px;
  padding: 0 7px;
  border: 0;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.62);
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.background-debug-dock-button-active {
  color: rgba(255, 255, 255, 0.94);
  background: rgba(255, 255, 255, 0.14);
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

.background-debug-tabs-three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.background-debug-tabs-four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.background-debug-tabs-five {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.background-debug-tabs-six {
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.background-debug-render-target-group {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.background-debug-render-pixel-group {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.background-debug-motion-window-group {
  grid-template-columns: repeat(5, minmax(0, 1fr));
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
  overflow: hidden;
  text-overflow: ellipsis;
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

.background-debug-number-control {
  grid-template-columns: minmax(0, 1fr) 78px;
  align-items: center;
}

.background-debug-number-control input[type="number"] {
  width: 100%;
  height: 28px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.background-debug-number-control input[type="number"]:disabled {
  opacity: 0.46;
}

.background-debug-select-control select,
.background-debug-render-target-control input[type="text"],
.background-debug-motion-capture-filter-control input[type="text"],
.background-debug-motion-capture-filter-control input[type="search"] {
  width: 100%;
  height: 28px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
}

.background-debug-select-control select:disabled,
.background-debug-motion-capture-filter-control input:disabled {
  opacity: 0.46;
}

.background-debug-motion-capture-props {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 8px;
  min-width: 0;
}

.background-debug-motion-capture-prop {
  min-height: 22px;
}

.background-debug-motion-capture-filter-grid {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.background-debug-motion-filter-group {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.background-debug-motion-filter-control input[type="search"] {
  width: 100%;
  height: 28px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
}

.background-debug-textarea-control textarea {
  width: 100%;
  min-width: 0;
  min-height: 68px;
  max-height: 140px;
  padding: 7px 8px;
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.86);
  background: rgba(255, 255, 255, 0.08);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10.5px;
  line-height: 1.35;
}

.background-debug-file-control input[type="file"] {
  width: 100%;
  min-width: 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
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
  overflow-wrap: anywhere;
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

.background-debug-window-list,
.background-debug-render-list {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.background-debug-motion-table {
  min-width: 0;
  overflow-x: hidden;
  padding-bottom: 2px;
}

.background-debug-motion-property-table {
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
}

.background-debug-motion-row {
  display: grid;
  grid-template-columns: minmax(78px, 1fr) 34px 76px 50px 64px 48px;
  min-width: 0;
  gap: 6px;
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.78);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10.5px;
  line-height: 1.25;
}

.background-debug-motion-property-row {
  display: grid;
  grid-template-columns: 108px 48px 48px 48px 52px 48px 46px 78px 96px;
  min-width: 606px;
  gap: 6px;
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.78);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  line-height: 1.25;
}

.background-debug-motion-row-head {
  color: rgba(255, 255, 255, 0.48);
  font-family: inherit;
  font-size: 10px;
  text-transform: uppercase;
}

.background-debug-motion-property-row span,
.background-debug-motion-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-motion-empty {
  min-width: 0;
  padding: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.035);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.background-debug-motion-list {
  display: grid;
  gap: 6px;
}

.background-debug-motion-layer-tree {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.background-debug-motion-layer-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.58);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  line-height: 1.2;
}

.background-debug-motion-layer-row + .background-debug-motion-layer-row {
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr);
}

.background-debug-motion-layer-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-motion-timeline {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.background-debug-motion-timeline-group {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-motion-timeline-group header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.background-debug-motion-timeline-group strong,
.background-debug-motion-timeline-group header span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-motion-timeline-group strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  line-height: 1.2;
}

.background-debug-motion-timeline-group header span {
  color: rgba(255, 255, 255, 0.48);
  font-size: 10px;
  line-height: 1.2;
}

.background-debug-motion-timeline-event {
  display: grid;
  grid-template-columns: 48px 52px 34px minmax(0, 1fr);
  gap: 6px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.7);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  line-height: 1.25;
}

.background-debug-motion-timeline-event span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-motion-replay-event {
  display: grid;
  grid-template-columns: 48px 52px minmax(68px, 0.7fr) minmax(0, 1fr);
  gap: 6px;
  min-width: 0;
  padding: 5px 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  line-height: 1.25;
  text-align: left;
}

.background-debug-motion-replay-event-current {
  border-color: rgba(110, 220, 255, 0.44);
  background: rgba(110, 220, 255, 0.12);
}

.background-debug-motion-replay-event span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-motion-curve-list {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.background-debug-motion-curve-card {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-motion-curve-card header,
.background-debug-motion-curve-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.background-debug-motion-curve-card strong,
.background-debug-motion-curve-card header span,
.background-debug-motion-curve-meta span,
.background-debug-motion-curve-row span,
.background-debug-motion-curve-row output {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-motion-curve-card strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  line-height: 1.2;
}

.background-debug-motion-curve-card header span,
.background-debug-motion-curve-meta,
.background-debug-motion-curve-row {
  color: rgba(255, 255, 255, 0.52);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  line-height: 1.2;
}

.background-debug-motion-curve-meta {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) auto;
}

.background-debug-motion-curve-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) 92px;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.background-debug-motion-curve-row svg {
  display: block;
  width: 100%;
  height: 32px;
  min-width: 0;
  overflow: visible;
}

.background-debug-motion-curve-row path,
.background-debug-motion-curve-row line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.background-debug-motion-curve-grid {
  stroke: rgba(255, 255, 255, 0.13);
  stroke-width: 1;
}

.background-debug-motion-curve-value {
  stroke: rgba(110, 220, 255, 0.95);
  stroke-width: 1.7;
}

.background-debug-motion-curve-to {
  stroke: rgba(255, 255, 255, 0.55);
  stroke-dasharray: 3 3;
  stroke-width: 1.1;
}

.background-debug-motion-curve-delta {
  stroke: rgba(255, 205, 105, 0.95);
  stroke-width: 1.5;
}

.background-debug-motion-curve-velocity {
  stroke: rgba(170, 240, 130, 0.95);
  stroke-width: 1.5;
}

.background-debug-motion-curve-event {
  stroke: rgba(255, 135, 150, 0.76);
  stroke-dasharray: 2 3;
  stroke-width: 1;
}

.background-debug-motion-replay-curve-cursor {
  stroke: rgba(255, 255, 255, 0.86);
  stroke-width: 1.2;
}

.motion-debug-track-chart-section {
  display: grid;
  gap: 8px;
}

.motion-debug-track-chart-toolbar {
  display: grid;
  grid-template-columns: minmax(160px, 0.75fr) minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.motion-debug-track-chart-mode-group {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
}

.motion-debug-track-chart-series-controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(54px, 1fr));
  gap: 6px;
  min-width: 0;
}

.motion-debug-track-chart-series-toggle {
  min-width: 0;
  padding: 5px 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
}

.motion-debug-track-chart-series-toggle span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-track-chart-window-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(168px, 0.85fr);
  gap: 8px;
  align-items: end;
  min-width: 0;
}

.motion-debug-track-chart-window-control {
  margin: 0;
}

.motion-debug-track-chart-window-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.motion-debug-track-chart-summary {
  margin: 0;
}

.motion-debug-track-chart-axis {
  position: relative;
  height: 18px;
  margin: 0 2px;
  color: rgba(255, 255, 255, 0.42);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 9.5px;
  line-height: 1;
}

.motion-debug-track-chart-axis span {
  position: absolute;
  top: 2px;
  min-width: 34px;
  transform: translateX(-50%);
  text-align: center;
  white-space: nowrap;
}

.motion-debug-track-chart-axis span:first-child {
  transform: translateX(0);
  text-align: left;
}

.motion-debug-track-chart-axis span:last-child {
  transform: translateX(-100%);
  text-align: right;
}

.motion-debug-track-chart-list {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.motion-debug-finding-panel {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.motion-debug-finding-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.66);
  font-size: 11px;
  line-height: 1.2;
}

.motion-debug-finding-panel header strong {
  color: rgba(255, 255, 255, 0.84);
}

.motion-debug-finding-panel header span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-finding-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
}

.motion-debug-finding-button {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 205, 105, 0.24);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 205, 105, 0.08);
  cursor: pointer;
  text-align: left;
}

.motion-debug-finding-button-info {
  border-color: rgba(112, 190, 255, 0.24);
  background: rgba(88, 170, 255, 0.08);
}

.motion-debug-finding-button-error,
.motion-debug-finding-button-critical {
  border-color: rgba(255, 112, 112, 0.34);
  background: rgba(255, 88, 88, 0.1);
}

.motion-debug-finding-button:hover {
  border-color: rgba(255, 215, 130, 0.42);
  background: rgba(255, 205, 105, 0.12);
}

.motion-debug-finding-button:focus-visible {
  outline: 2px solid rgba(255, 215, 130, 0.55);
  outline-offset: 2px;
}

.motion-debug-finding-button strong,
.motion-debug-finding-button span {
  min-width: 0;
  overflow: hidden;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-finding-button strong {
  color: rgba(255, 245, 220, 0.92);
  font-size: 10.5px;
  font-weight: 700;
}

.motion-debug-finding-button span {
  color: rgba(255, 255, 255, 0.55);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 9.5px;
}

.motion-debug-track-chart-row {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.motion-debug-track-chart-track-button {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.motion-debug-track-chart-track-button:hover strong {
  color: white;
}

.motion-debug-track-chart-track-button:focus-visible {
  outline: 2px solid rgba(120, 190, 255, 0.55);
  outline-offset: 2px;
}

.motion-debug-track-chart-row-header,
.motion-debug-track-chart-row-meta,
.motion-debug-track-chart-current,
.motion-debug-track-chart-ranges {
  display: grid;
  min-width: 0;
  gap: 6px;
  align-items: center;
}

.motion-debug-track-chart-row-header {
  grid-template-columns: minmax(0, 1fr) auto;
}

.motion-debug-track-chart-row-meta {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) auto auto;
}

.motion-debug-track-chart-current,
.motion-debug-track-chart-ranges {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.motion-debug-track-chart-row-header strong,
.motion-debug-track-chart-row-header span,
.motion-debug-track-chart-row-meta span,
.motion-debug-track-chart-current span,
.motion-debug-track-chart-ranges span {
  min-width: 0;
  overflow: hidden;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-track-chart-row-header strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-weight: 700;
}

.motion-debug-track-chart-row-header span,
.motion-debug-track-chart-row-meta,
.motion-debug-track-chart-current,
.motion-debug-track-chart-ranges {
  color: rgba(255, 255, 255, 0.52);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
}

.motion-debug-track-chart-current {
  color: rgba(255, 255, 255, 0.68);
}

.motion-debug-track-chart-activity {
  position: relative;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.motion-debug-track-chart-activity span {
  position: absolute;
  top: 0;
  bottom: 0;
  min-width: 2px;
  border-radius: inherit;
  background: rgba(110, 220, 255, 0.54);
}

.motion-debug-track-chart-plot {
  min-width: 0;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.motion-debug-track-chart-plot-brushing {
  cursor: col-resize;
}

.motion-debug-track-chart-plot svg {
  display: block;
  width: 100%;
  height: 58px;
  min-width: 0;
  overflow: visible;
}

.motion-debug-track-chart-plot path,
.motion-debug-track-chart-plot line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.motion-debug-track-chart-axis-line {
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1;
}

.motion-debug-track-chart-brush-range {
  fill: rgba(110, 220, 255, 0.12);
  stroke: rgba(110, 220, 255, 0.26);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.motion-debug-track-chart-series {
  stroke-width: 1.6;
}

.motion-debug-track-chart-series-value {
  stroke: rgba(110, 220, 255, 0.95);
}

.motion-debug-track-chart-series-to {
  stroke: rgba(255, 255, 255, 0.55);
  stroke-dasharray: 3 3;
  stroke-width: 1.1;
}

.motion-debug-track-chart-series-delta {
  stroke: rgba(255, 205, 105, 0.95);
}

.motion-debug-track-chart-series-velocity {
  stroke: rgba(170, 240, 130, 0.95);
}

.motion-debug-track-chart-event-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}

.motion-debug-track-chart-event-button {
  display: inline-grid;
  grid-auto-flow: column;
  gap: 4px;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  height: 22px;
  padding: 0 6px;
  border: 1px solid rgba(255, 135, 150, 0.22);
  border-radius: 8px;
  color: rgba(255, 210, 216, 0.82);
  background: rgba(255, 135, 150, 0.08);
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 9.5px;
  line-height: 1;
}

.motion-debug-track-chart-event-button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-motion-replay-interval-grid,
.background-debug-motion-replay-overlay-list {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.background-debug-motion-replay-bookmarks {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.background-debug-motion-replay-bookmarks header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.66);
  font-size: 11px;
  line-height: 1.2;
}

.background-debug-motion-replay-bookmarks header strong {
  color: rgba(255, 255, 255, 0.82);
  font-size: 11.5px;
}

.background-debug-motion-bookmark-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.background-debug-motion-bookmark-list {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.background-debug-motion-bookmark-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-motion-bookmark-main {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.background-debug-motion-bookmark-main strong,
.background-debug-motion-bookmark-main span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-motion-bookmark-main strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  line-height: 1.2;
}

.background-debug-motion-bookmark-main span {
  color: rgba(255, 255, 255, 0.56);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  line-height: 1.2;
}

.background-debug-motion-bookmark-row-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.background-debug-motion-bookmark-actions .background-debug-button,
.background-debug-motion-bookmark-row-actions .background-debug-button {
  width: 100%;
}

.motion-debug-inspector-current {
  margin-top: 8px;
}

.motion-debug-inspector-card-list {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.motion-debug-inspector-card {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.motion-debug-inspector-card strong,
.motion-debug-inspector-card span {
  min-width: 0;
  overflow: hidden;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-inspector-card strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-weight: 650;
}

.motion-debug-inspector-card span {
  color: rgba(255, 255, 255, 0.56);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
}

.motion-debug-inspector-card-selected,
.motion-debug-inspector-card-active {
  border-color: rgba(110, 220, 255, 0.36);
  background: rgba(110, 220, 255, 0.1);
}

.motion-debug-inspector-card-info {
  border-color: rgba(140, 190, 255, 0.24);
}

.motion-debug-inspector-card-warning {
  border-color: rgba(255, 205, 105, 0.34);
  background: rgba(255, 205, 105, 0.08);
}

.motion-debug-inspector-card-muted {
  opacity: 0.82;
}

.background-debug-motion-replay-overlay-card {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-motion-replay-overlay-card strong,
.background-debug-motion-replay-overlay-card span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-motion-replay-overlay-card strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  line-height: 1.2;
}

.background-debug-motion-replay-overlay-card span {
  color: rgba(255, 255, 255, 0.56);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  line-height: 1.2;
}

.background-debug-window-card,
.background-debug-render-card {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 7px 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.background-debug-window-card strong,
.background-debug-window-card span,
.background-debug-render-card > strong,
.background-debug-render-card > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-window-card strong,
.background-debug-render-card > strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 11.5px;
  font-weight: 650;
  line-height: 1.2;
}

.background-debug-window-card span,
.background-debug-render-card > span {
  color: rgba(255, 255, 255, 0.52);
  font-size: 10.5px;
  line-height: 1.2;
}

.background-debug-render-card > strong {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.background-debug-render-card > strong span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-render-card-strong {
  border-color: rgba(255, 190, 92, 0.32);
  background: rgba(255, 170, 54, 0.08);
}

.background-debug-motion-actions,
.background-debug-motion-quick-actions,
.background-debug-motion-workspace-actions,
.background-debug-motion-replay-actions,
.background-debug-motion-replay-viewer-actions,
.background-debug-motion-replay-step-actions,
.background-debug-notice-actions,
.background-debug-live-actions,
.background-debug-render-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  justify-content: stretch;
}

.background-debug-motion-actions .background-debug-button,
.background-debug-motion-quick-actions .background-debug-button,
.background-debug-motion-workspace-actions .background-debug-button,
.background-debug-motion-replay-actions .background-debug-button,
.background-debug-motion-replay-viewer-actions .background-debug-button,
.background-debug-motion-replay-step-actions .background-debug-button,
.background-debug-notice-actions .background-debug-button,
.background-debug-live-actions .background-debug-button,
.background-debug-render-actions .background-debug-button {
  width: 100%;
}

.background-debug-motion-quick-actions {
  grid-template-columns: minmax(0, 1fr);
}

.background-debug-motion-workspace-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.background-debug-notice-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.background-debug-motion-replay-step-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.background-debug-button:hover,
.background-debug-tab:hover,
.background-debug-mode-button:hover,
.background-debug-dock-button:hover {
  color: white;
  background: rgba(255, 255, 255, 0.16);
}

.background-debug-button:disabled,
.background-debug-mode-button:disabled {
  opacity: 0.48;
  cursor: default;
}

.background-debug-button:focus-visible,
.background-debug-tab:focus-visible,
.background-debug-mode-button:focus-visible,
.background-debug-dock-button:focus-visible,
.motion-debug-track-chart-event-button:focus-visible {
  outline: 2px solid rgba(120, 190, 255, 0.55);
  outline-offset: 2px;
}

.background-debug-motion-selectable {
  cursor: pointer;
}

.background-debug-motion-selectable:hover {
  border-color: rgba(120, 190, 255, 0.28);
  background: rgba(120, 190, 255, 0.09);
}

.background-debug-motion-selectable:focus-visible {
  outline: 2px solid rgba(120, 190, 255, 0.55);
  outline-offset: 2px;
}

.background-debug-motion-selected {
  border-color: rgba(120, 190, 255, 0.42);
  background: rgba(120, 190, 255, 0.14);
}

.motion-debug-workspace {
  position: fixed;
  top: 14px;
  right: 14px;
  bottom: 14px;
  z-index: 133;
  display: flex;
  flex-direction: column;
  min-width: min(520px, calc(100vw - 28px));
  max-width: calc(100vw - 28px);
  min-height: 0;
  padding: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(20, 23, 30, 0.94);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(22px) saturate(120%);
  -webkit-backdrop-filter: blur(22px) saturate(120%);
  font-size: 12px;
  line-height: 1.3;
}

.motion-debug-workspace-resizing {
  cursor: col-resize;
  user-select: none;
}

.motion-debug-workspace-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  width: 12px;
  padding: 0;
  border: 0;
  border-radius: 8px 0 0 8px;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.motion-debug-workspace-resize-handle::before {
  position: absolute;
  top: 48px;
  bottom: 48px;
  left: 4px;
  width: 2px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  content: "";
}

.motion-debug-workspace-resize-handle:hover::before,
.motion-debug-workspace-resize-handle:focus-visible::before,
.motion-debug-workspace-resizing .motion-debug-workspace-resize-handle::before {
  background: rgba(120, 190, 255, 0.72);
}

.motion-debug-workspace-resize-handle:focus-visible {
  outline: 2px solid rgba(120, 190, 255, 0.55);
  outline-offset: -2px;
}

.motion-debug-workspace *,
.motion-debug-workspace *::before,
.motion-debug-workspace *::after {
  box-sizing: border-box;
}

.motion-debug-workspace button {
  appearance: none;
  -webkit-appearance: none;
  font: inherit;
}

.motion-debug-workspace-fullscreen {
  inset: 10px;
  z-index: 134;
  width: auto;
  max-width: none;
}

.motion-debug-workspace-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.motion-debug-workspace-title {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.motion-debug-workspace-title strong {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.94);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-workspace-title span {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-workspace-toolbar-actions {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 72px;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.motion-debug-workspace-mode-group {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
}

.motion-debug-workspace-dock-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  min-width: 0;
  padding: 9px 0 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.motion-debug-workspace-dock-control span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.62);
  font-size: 11.5px;
  line-height: 1.2;
}

.motion-debug-workspace-dock-control output {
  flex: none;
  color: rgba(255, 255, 255, 0.88);
  font-variant-numeric: tabular-nums;
}

.motion-debug-workspace-dock-control input[type="range"] {
  width: 100%;
  min-width: 0;
  accent-color: rgba(255, 255, 255, 0.92);
}

.motion-debug-workspace-selection {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 10px 0 0;
}

.motion-debug-workspace-selection dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
  margin: 0;
}

.motion-debug-workspace-selection dl div {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 6px 7px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
}

.motion-debug-workspace-selection dt,
.motion-debug-workspace-selection dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-workspace-selection dt {
  color: rgba(255, 255, 255, 0.45);
  font-size: 10.5px;
}

.motion-debug-workspace-selection dd {
  color: rgba(255, 255, 255, 0.86);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.motion-debug-workspace-selection-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(98px, 1fr));
  gap: 8px;
  min-width: 0;
}

.motion-debug-workspace-grid {
  display: grid;
  grid-template-columns: minmax(132px, 0.82fr) minmax(208px, 1.3fr) minmax(142px, 1fr);
  gap: 8px;
  min-height: 0;
  min-width: 0;
  padding-top: 10px;
  overflow: hidden;
}

.motion-debug-workspace-region {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  gap: 8px;
  padding: 9px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.055);
}

.motion-debug-workspace-region header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.motion-debug-workspace-region header strong,
.motion-debug-workspace-region header span {
  min-width: 0;
  overflow: hidden;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-workspace-region header strong {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 700;
}

.motion-debug-workspace-region header span {
  color: rgba(255, 255, 255, 0.45);
  font-size: 10.5px;
}

.motion-debug-workspace-section-list {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.motion-debug-workspace-section-list > .background-debug-subsection,
.motion-debug-workspace-section-list > .background-debug-status-grid {
  min-width: 0;
}

.motion-debug-workspace-section-list > .background-debug-subsection {
  margin: 0;
}

.motion-debug-workspace-section-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(72px, auto);
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.075);
}

.motion-debug-workspace-section-row strong,
.motion-debug-workspace-section-row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-workspace-section-row strong {
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  font-weight: 650;
}

.motion-debug-workspace-section-row span {
  color: rgba(255, 255, 255, 0.52);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  line-height: 1.2;
  text-align: right;
}

.background-debug-body::-webkit-scrollbar,
.background-debug-detail::-webkit-scrollbar,
.motion-debug-workspace-section-list::-webkit-scrollbar {
  width: 8px;
}

.background-debug-body::-webkit-scrollbar-thumb,
.background-debug-detail::-webkit-scrollbar-thumb,
.motion-debug-workspace-section-list::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  background-clip: padding-box;
}

@media (max-width: 900px) {
  .motion-debug-workspace {
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto !important;
    min-width: 0;
    max-width: none;
  }

  .motion-debug-workspace-resize-handle,
  .motion-debug-workspace-dock-control {
    display: none;
  }

  .motion-debug-workspace-toolbar,
  .motion-debug-workspace-toolbar-actions,
  .motion-debug-workspace-selection,
  .motion-debug-workspace-selection dl,
  .motion-debug-workspace-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .motion-debug-workspace-grid {
    align-content: start;
    display: block;
    overflow: auto;
  }

  .motion-debug-workspace-region {
    display: block;
    overflow: visible;
  }

  .motion-debug-workspace-region + .motion-debug-workspace-region {
    margin-top: 8px;
  }

  .motion-debug-workspace-region > header {
    margin-bottom: 8px;
  }

  .motion-debug-workspace-section-list {
    overflow: visible;
  }

  .motion-debug-workspace-selection-actions,
  .motion-debug-track-chart-window-actions,
  .motion-debug-finding-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .motion-debug-track-chart-toolbar,
  .motion-debug-track-chart-window-controls,
  .motion-debug-track-chart-row-meta,
  .motion-debug-track-chart-current,
  .motion-debug-track-chart-ranges {
    grid-template-columns: minmax(0, 1fr);
  }

  .motion-debug-track-chart-series-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .background-debug-panel {
    --background-debug-panel-inset: 14px;
    bottom: 14px;
    width: calc(100vw - 28px);
  }

  .motion-debug-workspace {
    top: 8px;
    right: 8px;
    bottom: 8px;
    left: 8px;
    padding: 10px;
  }

  .motion-debug-workspace .background-debug-status-grid,
  .motion-debug-track-chart-series-controls {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
