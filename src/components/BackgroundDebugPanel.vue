<template>
  <section
    :class="[
      'background-debug-panel',
      debugPanelDock === 'left' ? 'background-debug-panel-left' : 'background-debug-panel-right',
    ]"
    aria-label="Debug panel"
    @click.stop
    @contextmenu.stop
    @pointerdown.stop
    @wheel.stop
  >
    <header class="background-debug-header">
      <div class="background-debug-title">
        <strong>Debug Panel</strong>
        <span>dev only</span>
      </div>
      <div class="background-debug-header-actions">
        <div class="background-debug-dock-toggle" role="group" aria-label="Debug 面板位置">
          <button
            type="button"
            :class="['background-debug-dock-button', debugPanelDock === 'left' && 'background-debug-dock-button-active']"
            :aria-pressed="debugPanelDock === 'left'"
            @click="setDebugPanelDock('left')"
          >
            左下角
          </button>
          <button
            type="button"
            :class="['background-debug-dock-button', debugPanelDock === 'right' && 'background-debug-dock-button-active']"
            :aria-pressed="debugPanelDock === 'right'"
            @click="setDebugPanelDock('right')"
          >
            右下角
          </button>
        </div>
        <button type="button" class="background-debug-button" @click="isCollapsed = !isCollapsed">
          {{ isCollapsed ? "展开" : "收起" }}
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
        ]"
        role="tablist"
        aria-label="Debug panel sections"
      >
        <button
          type="button"
          :class="['background-debug-tab', activePanel === 'acrylic' && 'background-debug-tab-active']"
          @click="activePanel = 'acrylic'"
        >
          Acrylic
        </button>
        <button
          type="button"
          :class="['background-debug-tab', activePanel === 'layout' && 'background-debug-tab-active']"
          @click="activePanel = 'layout'"
        >
          Layout
        </button>
        <button
          type="button"
          :class="['background-debug-tab', activePanel === 'notice' && 'background-debug-tab-active']"
          @click="activePanel = 'notice'"
        >
          Notice
        </button>
        <button
          v-if="canDebugMotion"
          type="button"
          :class="['background-debug-tab', activePanel === 'motion' && 'background-debug-tab-active']"
          @click="activePanel = 'motion'"
        >
          Motion
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

      <div v-else-if="activePanel === 'layout'" class="background-debug-section">
        <label class="background-debug-toggle">
          <input
            name="desktopLayoutDebugOverride"
            type="checkbox"
            :checked="layoutParams.enabled"
            @change="setLayoutDebugEnabled($event.target.checked)"
          >
          <span>覆盖布局</span>
        </label>

        <label
          v-for="slider in layoutSliders"
          :key="slider.key"
          class="background-debug-control"
        >
          <span>
            {{ slider.label }}
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
          CSS controls host/main sizing; gridTop controls the Pixi first-row offset.
        </div>

        <div class="background-debug-actions">
          <button type="button" class="background-debug-button" @click="resetLayoutDebugParams">
            重置
          </button>
        </div>
      </div>

      <div v-else-if="activePanel === 'notice'" class="background-debug-section">
        <div class="background-debug-detail">
          生成布局保存、载入和恢复通知，用来检查 LaunchPad 右下角 notice 的 Fluent 卡片样式。
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
          <div class="background-debug-subtitle">Layout Notices</div>
          <div class="background-debug-actions background-debug-notice-actions">
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugLayoutSaveFailed">
              保存失败
            </button>
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugLayoutSaveRecovered">
              保存恢复
            </button>
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugLayoutLoadFailed">
              载入失败
            </button>
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugLayoutLoadRecovered">
              载入恢复
            </button>
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugLayoutRecovered">
              布局恢复
            </button>
            <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="showDebugNoticeStack">
              堆叠样例
            </button>
          </div>
        </div>

        <div class="background-debug-actions">
          <button type="button" class="background-debug-button" :disabled="!canDebugNotice" @click="clearDebugNotices">
            清空通知
          </button>
        </div>
      </div>

      <div v-else-if="activePanel === 'motion' && canDebugMotion" class="background-debug-section">
        <label class="background-debug-toggle">
          <input
            name="motionRuntimeDebugEnabled"
            type="checkbox"
            :checked="motionRuntimeDebugEnabled"
            :disabled="motionReplayCaptureActive"
            @change="setMotionRuntimeDebugEnabled($event.target.checked)"
          >
          <span>Enable</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="motionRecordEnabled"
            type="checkbox"
            :checked="motionRecordEnabled"
            :disabled="motionReplayCaptureActive || !motionRuntimeDebugEnabled"
            @change="setMotionRecordEnabled($event.target.checked)"
          >
          <span>Record</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="motionOverlayEnabled"
            type="checkbox"
            :checked="motionOverlayEnabled"
            :disabled="motionReplayCaptureActive || !motionRuntimeDebugEnabled"
            @change="setMotionOverlayEnabled($event.target.checked)"
          >
          <span>Overlay</span>
        </label>

        <div class="background-debug-mode-group background-debug-motion-window-group" role="group" aria-label="Motion record window">
          <button
            v-for="preset in MOTION_RECORD_WINDOW_PRESETS"
            :key="preset.value"
            type="button"
            :class="['background-debug-mode-button', motionWindowPreset === preset.value && 'background-debug-mode-button-active']"
            :disabled="motionReplayCaptureActive || !motionRuntimeDebugEnabled"
            @click="setMotionWindowPreset(preset.value)"
          >
            {{ preset.label }}
          </button>
        </div>

        <label class="background-debug-control background-debug-number-control">
          <span>
            Custom seconds
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
            Time Scale
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
          <div class="background-debug-subtitle">Workspace</div>
          <div class="background-debug-actions background-debug-motion-workspace-actions">
            <button
              type="button"
              class="background-debug-button"
              @click="openMotionWorkspace(MOTION_DEBUG_WORKSPACE_MODE_DOCK)"
            >
              Open Workspace
            </button>
            <button
              type="button"
              class="background-debug-button"
              @click="openMotionWorkspace(MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN)"
            >
              Fullscreen
            </button>
          </div>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Replay Capture</div>
          <label class="background-debug-control background-debug-number-control">
            <span>
              Capture seconds
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
              Start Capture
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayCaptureActive"
              @click="stopMotionReplayCapture"
            >
              Stop Capture
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="motionReplayCaptureActive || !motionReplayTraceJson"
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

      <div v-else-if="activePanel === 'liveDesktop' && canDebugLiveDesktop" class="background-debug-section">
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

  <aside
    v-if="motionWorkspaceOpen"
    :class="[
      'motion-debug-workspace',
      motionWorkspaceFullscreen ? 'motion-debug-workspace-fullscreen' : 'motion-debug-workspace-dock',
      motionWorkspaceDockResizeActive && 'motion-debug-workspace-resizing',
    ]"
    :style="motionWorkspaceStyle"
    aria-label="Motion debug workspace"
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
      aria-label="Resize workspace dock"
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
        <strong>Motion Debug Workspace</strong>
        <span>{{ motionWorkspaceModeLabel }} / dev only</span>
      </div>
      <div class="motion-debug-workspace-toolbar-actions">
        <div class="background-debug-mode-group motion-debug-workspace-mode-group" role="group" aria-label="Workspace mode">
          <button
            type="button"
            :class="[
              'background-debug-mode-button',
              !motionWorkspaceFullscreen && 'background-debug-mode-button-active',
            ]"
            @click="setMotionWorkspaceMode(MOTION_DEBUG_WORKSPACE_MODE_DOCK)"
          >
            Dock
          </button>
          <button
            type="button"
            :class="[
              'background-debug-mode-button',
              motionWorkspaceFullscreen && 'background-debug-mode-button-active',
            ]"
            @click="setMotionWorkspaceMode(MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN)"
          >
            Fullscreen
          </button>
        </div>
        <button type="button" class="background-debug-button" @click="closeMotionWorkspace">
          Close
        </button>
      </div>
    </header>

    <label v-if="!motionWorkspaceFullscreen" class="motion-debug-workspace-dock-control">
      <span>
        Dock width
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

    <div class="motion-debug-workspace-selection" aria-label="Workspace selection">
      <dl>
        <div>
          <dt>Target</dt>
          <dd :title="motionWorkspaceSelectedTargetLabel">{{ motionWorkspaceSelectedTargetLabel }}</dd>
        </div>
        <div>
          <dt>Track</dt>
          <dd :title="motionWorkspaceSelectedTrackLabel">{{ motionWorkspaceSelectedTrackLabel }}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{{ formatMotionReplayTime(motionWorkspaceSelectedTimeMs) }}</dd>
        </div>
        <div>
          <dt>Filter</dt>
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
          Clear Selection
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

<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import BackgroundDebugMotionInspector from "./backgroundDebug/BackgroundDebugMotionInspector.vue";
import BackgroundDebugMotionTargets from "./backgroundDebug/BackgroundDebugMotionTargets.vue";
import BackgroundDebugMotionTimeline from "./backgroundDebug/BackgroundDebugMotionTimeline.vue";
import { MOTION_DEBUG_WORKSPACE_CONTEXT_KEY } from "./backgroundDebug/motionDebugWorkspaceContext.js";
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
  resolveMotionRecordWindowMs,
} from "./backgroundDebug/motionDebugPanelModel.js";
import {
  buildMotionReplayCurveGroups,
  buildMotionReplayEventRows,
  buildMotionReplayFilterSummary,
  buildMotionReplayFrameRows,
  buildMotionReplayOverlayRows,
  buildMotionReplayOverviewRows,
  createMotionReplayIntervalExport,
  findMotionReplayEventStep,
  findMotionReplayFrameStepTime,
  getMotionReplayTimeRange,
  assertMotionReplayImportSize,
  MOTION_REPLAY_IMPORT_MAX_BYTES,
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
  parseMotionReplayTraceJson,
} from "./backgroundDebug/motionReplayViewerModel.js";
import {
  addMotionReplayBookmark,
  MOTION_REPLAY_BOOKMARK_LIMIT,
  removeMotionReplayBookmark,
} from "./backgroundDebug/motionReplayBookmarkModel.js";
import {
  estimateMotionCaptureProfileSize,
  getMotionCaptureProfiles,
  MOTION_CAPTURE_ALLOWED_PROPS,
  MOTION_CAPTURE_DEFAULT_SAMPLE_HZ,
} from "./backgroundDebug/motionCaptureProfileModel.js";
import {
  createMotionFocusedDebugExport,
  MOTION_FOCUSED_DEBUG_SCHEMA,
} from "./backgroundDebug/motionFocusedDebugExportModel.js";
import {
  buildMotionInspectorModel,
} from "./backgroundDebug/motionInspectorModel.js";
import {
  buildMotionReplayAnomalyJumps,
  MOTION_REPLAY_ANOMALY_TYPES,
} from "./backgroundDebug/motionReplayAnomalyModel.js";
import {
  buildMotionTrackChartModel,
  MOTION_TRACK_CHART_DISPLAY_NORMALIZED,
  MOTION_TRACK_CHART_DISPLAY_RAW,
  MOTION_TRACK_CHART_SERIES_KEYS,
  normalizeMotionTrackChartZoomWindow,
  normalizeMotionTrackChartSeriesVisibility,
} from "./backgroundDebug/motionTrackChartModel.js";
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
import { createMotionDebugAIReport } from "../rendering/pixi/animation/motionDebugReport.js";
import {
  createMotionReplayCaptureController,
  normalizeMotionReplayCaptureSeconds,
} from "../rendering/pixi/animation/motionReplayTrace.js";
import { motionRuntime } from "../rendering/pixi/animation/motionRuntime.js";

const DEBUG_PANEL_DOCK_STORAGE_KEY = "launchpadBackgroundDebugPanelDock";

const props = defineProps({
  desktopLayoutDebugParams: {
    type: Object,
    default: () => ({ ...DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS }),
  },
  dialogState: {
    type: Object,
    default: null,
  },
  resetDesktopLayoutDebugParams: {
    type: Function,
    default: null,
  },
  state: {
    type: Object,
    default: null,
  },
  updateDesktopLayoutDebugParams: {
    type: Function,
    default: null,
  },
});

const params = useAcrylicDebugParams();
const isOverrideEnabled = useAcrylicDebugOverrideEnabled();
const kawaseParams = useKawaseDebugParams();
const isKawaseOverrideEnabled = useKawaseDebugOverrideEnabled();
const layoutParams = computed(() => props.desktopLayoutDebugParams || DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS);
const isCollapsed = ref(true);
const debugPanelDock = ref(readDebugPanelDock());
const activePanel = ref("acrylic");
const canDebugLiveDesktop = computed(() => isLiveDesktopExperimentEnabled());
const canDebugMotion = computed(() => Boolean(import.meta.env.DEV));
const canDebugNotice = computed(() => Boolean(
  props.dialogState?.showLayoutSaveFailed
    && props.dialogState?.showLayoutSaveRecovered
    && props.dialogState?.showLayoutLoadFailed
    && props.dialogState?.showLayoutLoadRecovered
    && props.dialogState?.handleLayoutRecovered
));
const debugTabCount = computed(() => 3 + (canDebugMotion.value ? 1 : 0) + (canDebugLiveDesktop.value ? 1 : 0));
const hasCopiedAcrylic = ref(false);
const hasCopiedDiagnostics = ref(false);
const hasCopiedMotionFocused = ref(false);
const hasCopiedMotionFull = ref(false);
const hasCopiedMotionReplayInterval = ref(false);
const hasCopiedMotionReplayTrace = ref(false);
const hasCopiedMotionSummary = ref(false);
const liveDesktopDebugFrameSourceOverride = ref(canDebugLiveDesktop.value ? readLiveDesktopDebugFrameSourceOverride() : null);
const liveDesktopDisableMouseRelay = ref(canDebugLiveDesktop.value ? readLiveDesktopDisableMouseRelay() : true);
const liveDesktopCompositorKeeper = ref(canDebugLiveDesktop.value ? readLiveDesktopCompositorKeeper() : false);
const liveDesktopCssFallbackEffects = ref(canDebugLiveDesktop.value ? readLiveDesktopCssFallbackEffects() : false);
const liveDesktopSkipBlankFrames = ref(canDebugLiveDesktop.value ? readLiveDesktopSkipBlankFrames() : false);
const liveDesktopForceDwmFlush = ref(canDebugLiveDesktop.value ? readLiveDesktopForceDwmFlush() : false);
const isLiveDesktopActionBusy = ref(false);
const motionRuntimeDebugEnabled = ref(false);
const motionOverlayEnabled = ref(false);
const motionRecordEnabled = ref(false);
const motionWindowPreset = ref("30000");
const motionCustomSeconds = ref(30);
const motionTimeScale = ref(1);
const motionFilterPreset = ref("all");
const motionFilterQuery = ref("");
const motionSnapshot = ref(readMotionRuntimeSnapshot());
const motionReport = ref({});
const motionReplayCapture = createMotionReplayCaptureController(motionRuntime);
const motionReplayCaptureSeconds = ref(30);
const motionReplayCaptureStatus = ref(motionReplayCapture.status());
const motionReplayTrace = ref(null);
const motionReplayTraceJson = ref("");
const motionReplayViewerTrace = ref(null);
const motionReplayImportText = ref("");
const motionReplayImportError = ref("");
const motionReplayCurrentTimeMs = ref(0);
const motionReplayFilterQuery = ref("");
const motionReplayPlaying = ref(false);
const motionReplayIntervalStartMs = ref(0);
const motionReplayIntervalEndMs = ref(0);
const motionReplayBookmarks = ref([]);
const motionTrackChartDisplayMode = ref(MOTION_TRACK_CHART_DISPLAY_RAW);
const motionTrackChartSeriesVisibility = ref(normalizeMotionTrackChartSeriesVisibility());
const motionTrackChartBrushAnchorMs = ref(null);
const motionTrackChartBrushPointerId = ref(null);
const motionTrackChartZoomStartMs = ref(null);
const motionTrackChartZoomEndMs = ref(null);
const motionWorkspaceDockResize = ref(null);
const motionWorkspaceSession = ref(createMotionDebugWorkspaceSession({
  viewportWidth: typeof window === "undefined" ? undefined : window.innerWidth,
}));
const liveDesktopRates = ref({
  framesPerSecond: 0,
  arrivedPerSecond: 0,
  droppedPerSecond: 0,
  timeoutsPerSecond: 0,
  copyErrorsPerSecond: 0,
});
const noticeDebugRows = computed(() => [
  {
    label: "Save",
    value: props.dialogState?.layoutSaveNotice?.value?.title || "none",
  },
  {
    label: "Recovery",
    value: props.dialogState?.layoutRecoveryNotice?.value?.title || "none",
  },
]);
let liveDesktopRateSample = null;
let acrylicCopyStateTimer = null;
let diagnosticsCopyStateTimer = null;
let motionFocusedCopyStateTimer = null;
let motionFullCopyStateTimer = null;
let motionRuntimePollTimer = null;
let motionReplayIntervalCopyStateTimer = null;
let motionReplayPlaybackLastTime = 0;
let motionReplayPlaybackTimer = null;
let motionReplayTraceCopyStateTimer = null;
let motionSummaryCopyStateTimer = null;
let liveDesktopRuntimePollTimer = null;
let kawaseLiveDesktopSyncTimer = null;

const motionCaptureProfiles = getMotionCaptureProfiles();
const motionCaptureAllowedProps = MOTION_CAPTURE_ALLOWED_PROPS;
const motionTrackChartSeriesOptions = MOTION_TRACK_CHART_SERIES_KEYS.map((key) => ({
  key,
  label: key,
}));
const MOTION_WORKSPACE_DOCK_RESIZE_STEP_PX = 20;
const MOTION_WORKSPACE_DOCK_RESIZE_FAST_STEP_PX = 80;

const sliders = [
  { key: "saturation", label: "saturation", min: 0.8, max: 1.8, step: 0.01, digits: 2 },
  { key: "contrast", label: "contrast", min: 0.75, max: 1.25, step: 0.01, digits: 2 },
  { key: "brightness", label: "brightness", min: 0.5, max: 1.2, step: 0.01, digits: 2 },
  { key: "tintStrength", label: "tintStrength", min: 0, max: 0.6, step: 0.01, digits: 2 },
  { key: "noise", label: "noise", min: 0, max: 0.06, step: 0.001, digits: 3 },
  { key: "seed", label: "seed", min: 0, max: 100, step: 0.01, digits: 2 },
];
const layoutSliders = [
  { key: "hostMaxHeightPx", label: "hostMaxHeight", min: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostMaxHeightPx.min, max: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostMaxHeightPx.max, step: 10, digits: 0 },
  { key: "hostHeightOffsetPx", label: "hostHeightOffset", min: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostHeightOffsetPx.min, max: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostHeightOffsetPx.max, step: 4, digits: 0 },
  { key: "mainPaddingYPx", label: "mainPaddingY", min: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.mainPaddingYPx.min, max: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.mainPaddingYPx.max, step: 1, digits: 0 },
  { key: "gridPaddingTopPx", label: "gridPaddingTop", min: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.gridPaddingTopPx.min, max: DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.gridPaddingTopPx.max, step: 1, digits: 0 },
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
  const actualStrength = clampBackgroundBlurStrength(
    effect === BACKGROUND_EFFECT_ACRYLIC_WEBGL
      ? props.state?.draftBackgroundAcrylicBlurStrength?.value
      : props.state?.draftBackgroundBlurStrength?.value
  );
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
const motionFullCopyButtonLabel = computed(() => (hasCopiedMotionFull.value ? "已复制" : "Copy AI Report"));
const motionReplayCaptureActive = computed(() => Boolean(motionReplayCaptureStatus.value.active));
const motionReplayIntervalCopyButtonLabel = computed(() => (hasCopiedMotionReplayInterval.value ? "Copied" : "Copy Interval"));
const motionReplayPlayButtonLabel = computed(() => (motionReplayPlaying.value ? "Pause Replay" : "Play Replay"));
const motionReplayTraceCopyButtonLabel = computed(() => (hasCopiedMotionReplayTrace.value ? "Copied" : "Copy Trace"));
const motionReplayViewerLoaded = computed(() => Boolean(motionReplayViewerTrace.value));
const motionReplayImportStatus = computed(() => {
  if (motionReplayImportError.value) return "error";
  return motionReplayViewerLoaded.value ? "loaded" : "empty";
});
const motionSummaryCopyButtonLabel = computed(() => (hasCopiedMotionSummary.value ? "已复制" : "Copy Summary"));
const layoutDebugRows = computed(() => {
  const params = layoutParams.value;
  return [
    { label: "enabled", value: params.enabled ? "true" : "false" },
    { label: "hostMax", value: `${Number(params.hostMaxHeightPx).toFixed(0)}px` },
    { label: "heightOffset", value: `${Number(params.hostHeightOffsetPx).toFixed(0)}px` },
    { label: "mainPaddingY", value: `${Number(params.mainPaddingYPx).toFixed(0)}px` },
    { label: "gridTop", value: `${Number(params.gridPaddingTopPx).toFixed(0)}px`, wide: true },
  ];
});
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
const motionOverviewRows = computed(() => buildMotionOverviewRows(motionSnapshot.value));
const motionAnimationRows = computed(() => buildMotionAnimationRows(motionSnapshot.value));
const motionCancelReasonRows = computed(() => buildMotionCancelReasonRows(motionSnapshot.value));
const motionWarningRows = computed(() => buildMotionWarningRows(motionSnapshot.value));
const motionWindowSeconds = computed(() => resolveMotionRecordWindowMs(motionWindowPreset.value, motionCustomSeconds.value) / 1000);
const motionFilters = computed(() => ({
  preset: motionFilterPreset.value,
  query: motionFilterQuery.value,
}));
const motionFilterSummary = computed(() => buildMotionFilterSummary(motionSnapshot.value, motionFilters.value));
const motionLayerTreeRows = computed(() => buildMotionLayerTreeRows(motionSnapshot.value, motionFilters.value));
const motionPropertyRows = computed(() => buildMotionPropertyRows(motionSnapshot.value, motionFilters.value));
const motionTimelineGroups = computed(() => buildMotionTimelineGroups(motionReport.value, motionFilters.value));
const motionCurveChartGroups = computed(() => buildMotionCurveChartGroups(motionReport.value, motionFilters.value));
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
  motionReplayTrace.value,
  {
    actualBytes: motionReplayTraceJson.value.length,
    estimate: motionReplayCaptureEstimate.value,
    profile: motionCaptureProfile.value,
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
  { label: "profile", value: motionCaptureProfile.value.label, wide: true },
  { label: "props", value: motionCaptureProfile.value.propAllowlist.join(", "), wide: true },
  { label: "targets", value: formatMotionCaptureTargetFilterSummary(motionCaptureProfile.value.targetFilters), wide: true },
  {
    label: "frames/events",
    value: `${formatCount(motionReplayCaptureEstimate.value.frameCount)} / ${formatCount(motionReplayCaptureEstimate.value.eventCount)}`,
    wide: true,
  },
  {
    label: "tracks/targets",
    value: `${formatCount(motionReplayCaptureEstimate.value.trackCount)} / ${formatCount(motionReplayCaptureEstimate.value.targetCount)}`,
    wide: true,
  },
  { label: "json", value: motionReplayCaptureEstimate.value.jsonSizeLabel, wide: true },
]);
const motionReplayTimeRange = computed(() => motionReplayViewerTrace.value ? getMotionReplayTimeRange(motionReplayViewerTrace.value) : { max: 0, min: 0 });
const motionReplayFilters = computed(() => ({
  query: motionReplayFilterQuery.value,
}));
const motionReplayOverviewRows = computed(() => buildMotionReplayOverviewRows(motionReplayViewerTrace.value, motionReplayCurrentTimeMs.value));
const motionReplayFilterSummary = computed(() => motionReplayViewerTrace.value
  ? buildMotionReplayFilterSummary(motionReplayViewerTrace.value, motionReplayCurrentTimeMs.value, motionReplayFilters.value)
  : { query: "", text: "0 props / 0 events" });
const motionReplayFrameRows = computed(() => motionReplayViewerTrace.value
  ? buildMotionReplayFrameRows(motionReplayViewerTrace.value, motionReplayCurrentTimeMs.value, motionReplayFilters.value)
  : []);
const motionReplayEventRows = computed(() => motionReplayViewerTrace.value
  ? buildMotionReplayEventRows(motionReplayViewerTrace.value, motionReplayCurrentTimeMs.value, motionReplayFilters.value)
  : []);
const motionReplayCurveGroups = computed(() => motionReplayViewerTrace.value
  ? buildMotionReplayCurveGroups(motionReplayViewerTrace.value, motionReplayCurrentTimeMs.value, motionReplayFilters.value)
  : []);
const motionReplayOverlayRows = computed(() => motionReplayViewerTrace.value
  ? buildMotionReplayOverlayRows(motionReplayViewerTrace.value, motionReplayCurrentTimeMs.value, motionReplayFilters.value, {
    selectedTarget: motionWorkspaceSession.value.selectedTarget,
    selectedTrack: motionWorkspaceSession.value.selectedTrack,
  })
  : []);
const motionTrackChartZoomWindow = computed(() => motionReplayViewerTrace.value
  ? normalizeMotionTrackChartZoomWindow(motionReplayViewerTrace.value, {
    endMs: motionTrackChartZoomEndMs.value ?? motionReplayTimeRange.value.max,
    startMs: motionTrackChartZoomStartMs.value ?? motionReplayTimeRange.value.min,
  })
  : { endMs: 0, startMs: 0 });
const motionTrackChartZoomActive = computed(() => {
  if (!motionReplayViewerTrace.value) return false;
  const range = motionReplayTimeRange.value;
  const zoom = motionTrackChartZoomWindow.value;
  return Math.round(zoom.startMs) !== Math.round(range.min)
    || Math.round(zoom.endMs) !== Math.round(range.max);
});
const motionTrackChartModel = computed(() => motionReplayViewerTrace.value
  ? buildMotionTrackChartModel(motionReplayViewerTrace.value, {
    cursorTimeMs: motionWorkspaceSelectedTimeMs.value,
    displayMode: motionTrackChartDisplayMode.value,
    filters: motionReplayFilters.value,
    selectedTrack: motionWorkspaceSession.value.selectedTrack,
    seriesVisibility: motionTrackChartSeriesVisibility.value,
    zoomWindow: motionTrackChartZoomWindow.value,
  })
  : null);
const motionTrackChartHeaderLabel = computed(() => {
  const chart = motionTrackChartModel.value;
  if (!chart) return `${motionTimelineGroups.value.length} live tracks / no replay trace`;
  return `${chart.summary.visibleTrackCount}/${chart.summary.trackCount} chart tracks / ${chart.summary.eventCount} events`;
});
const motionTrackChartSummaryRows = computed(() => {
  const chart = motionTrackChartModel.value;
  if (!chart) return [];
  return [
    { label: "window", value: `${formatMotionReplayTime(chart.zoomWindow.startMs)}..${formatMotionReplayTime(chart.zoomWindow.endMs)}`, wide: true },
    { label: "samples", value: formatCount(chart.summary.sampleCount) },
    { label: "events", value: formatCount(chart.summary.eventCount) },
    { label: "tracks", value: `${formatCount(chart.summary.visibleTrackCount)} / ${formatCount(chart.summary.trackCount)}` },
    { label: "points", value: `<=${formatCount(chart.limits.maxPointsPerSeries)} / series` },
    { label: "cursor", value: formatMotionReplayTime(chart.cursor.timeMs) },
  ];
});
const motionReplayAnomalyRows = computed(() => motionReplayViewerTrace.value
  ? buildMotionReplayAnomalyJumps(motionReplayViewerTrace.value, {
    filters: motionReplayFilters.value,
  })
  : []);
const motionReplayAnomalyStatusLabel = computed(() => `${motionReplayAnomalyRows.value.length}/${MOTION_REPLAY_ANOMALY_TYPES.length} signals`);
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
  motionReplayViewerTrace.value
    && Math.round(motionReplayIntervalStartMs.value) !== Math.round(motionReplayIntervalEndMs.value)
));
const motionReplayBookmarkCanSave = computed(() => Boolean(motionReplayViewerTrace.value && motionTrackChartIntervalActive.value));
const motionReplayBookmarkRows = computed(() => motionReplayBookmarks.value);
const motionReplayBookmarkStatusLabel = computed(() => `${motionReplayBookmarkRows.value.length}/${MOTION_REPLAY_BOOKMARK_LIMIT}`);
const motionFocusedDebugExportAvailable = computed(() => Boolean(motionReplayViewerTrace.value));
const motionWorkspaceOpen = computed(() => canDebugMotion.value && motionWorkspaceSession.value.isOpen);
const motionWorkspaceFullscreen = computed(() => motionWorkspaceSession.value.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN);
const motionWorkspaceDockWidthPx = computed(() => motionWorkspaceSession.value.dockWidthPx);
const motionWorkspaceDockResizeActive = computed(() => motionWorkspaceDockResize.value != null);
const motionWorkspaceModeLabel = computed(() => (motionWorkspaceFullscreen.value ? "Fullscreen" : "Dock"));
const motionWorkspaceStyle = computed(() => (motionWorkspaceFullscreen.value
  ? undefined
  : { width: `${motionWorkspaceDockWidthPx.value}px` }));
const motionWorkspaceSelectedTimeMs = computed(() => motionWorkspaceSession.value.selectedTimeMs);
const motionWorkspaceSelectedTargetLabel = computed(() => formatMotionWorkspaceTarget(motionWorkspaceSession.value.selectedTarget));
const motionWorkspaceSelectedTrackLabel = computed(() => formatMotionWorkspaceTrack(motionWorkspaceSession.value.selectedTrack));
const motionWorkspaceFilterLabel = computed(() => {
  const filters = motionWorkspaceSession.value.filters;
  return `${filters.preset || "all"}${filters.query ? ` / ${filters.query}` : ""}`;
});
const motionWorkspaceSelectedTargetPinned = computed(() => {
  const selectedKey = getMotionWorkspaceTargetKey(motionWorkspaceSession.value.selectedTarget);
  return Boolean(selectedKey && motionWorkspaceSession.value.pinnedTargets.some((pin) => pin.key === selectedKey));
});
const motionWorkspacePinButtonLabel = computed(() => (motionWorkspaceSelectedTargetPinned.value ? "Unpin Target" : "Pin Target"));
const motionInspectorModel = computed(() => motionReplayViewerTrace.value
  ? buildMotionInspectorModel(motionReplayViewerTrace.value, {
    selectedTarget: motionWorkspaceSession.value.selectedTarget,
    selectedTimeMs: motionWorkspaceSelectedTimeMs.value,
    selectedTrack: motionWorkspaceSession.value.selectedTrack,
  })
  : null);
const motionInspectorStatusRows = computed(() => {
  const current = motionInspectorModel.value?.current;
  return [
    { label: "value", value: current?.valueLabel || "-" },
    { label: "to", value: current?.toLabel || "-" },
    { label: "delta", value: current?.deltaLabel || "-" },
    { label: "velocity", value: current?.velocityLabel || "-" },
    { label: "driver", value: current?.driver || "-" },
    { label: "lane", value: current ? `${current.lane}/${current.laneKey}` : "-", wide: true },
    { label: "source", value: current?.sourceLabel || "-", wide: true },
  ];
});
const motionInspectorLaneRows = computed(() => motionInspectorModel.value?.laneBreakdown || []);
const motionInspectorWhyRows = computed(() => motionInspectorModel.value?.whyRows || []);
const motionInspectorEventRows = computed(() => motionInspectorModel.value?.recentEvents || []);
const motionInspectorWarningRows = computed(() => motionInspectorModel.value?.warnings || []);
const motionFocusedCopyButtonLabel = computed(() => (hasCopiedMotionFocused.value ? "Copied" : "Copy Focused AI"));
const motionFocusedDebugScopeRows = computed(() => [
  {
    label: "trace",
    value: motionReplayViewerTrace.value ? "loaded" : "none",
  },
  {
    label: "schema",
    value: MOTION_FOCUSED_DEBUG_SCHEMA,
    wide: true,
  },
  {
    label: "interval",
    value: motionReplayViewerTrace.value
      ? `${formatMotionReplayTime(motionReplayIntervalStartMs.value)}..${formatMotionReplayTime(motionReplayIntervalEndMs.value)}`
      : "-",
    wide: true,
  },
  {
    label: "selection",
    value: formatMotionFocusedDebugSelectionLabel(),
    wide: true,
  },
  {
    label: "tracks",
    value: motionWorkspaceSession.value.selectedTrack ? "selected track" : "all matching",
  },
  {
    label: "profile",
    value: motionCaptureProfile.value.label,
  },
  {
    label: "filter",
    value: motionReplayFilters.value.query || "none",
  },
  {
    label: "bookmarks",
    value: motionReplayBookmarkStatusLabel.value,
  },
]);

function formatValue(value, digits) {
  return Number(value).toFixed(digits);
}

function formatMotionChartStat(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "-";
}

function formatMotionReplayTime(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(0)}ms` : "-";
}

function formatMotionTrackChartValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(2);
}

function clampMotionTrackChartValue(value, min, max) {
  const number = Number(value);
  const lower = Number.isFinite(Number(min)) ? Number(min) : 0;
  const upper = Math.max(lower, Number.isFinite(Number(max)) ? Number(max) : lower);
  if (!Number.isFinite(number)) return lower;
  return Math.min(upper, Math.max(lower, number));
}

function getMotionTrackChartTimePercent(timeMs, zoomWindow = motionTrackChartZoomWindow.value) {
  const startMs = Number(zoomWindow?.startMs) || 0;
  const endMs = Number(zoomWindow?.endMs) || startMs;
  const span = endMs - startMs;
  if (span <= 0) return 0;
  return clampMotionTrackChartValue(((Number(timeMs) - startMs) / span) * 100, 0, 100);
}

function readMotionTrackChartPointerTime(event) {
  const chart = motionTrackChartModel.value;
  const target = event.currentTarget;
  const rect = target?.getBoundingClientRect?.();
  if (!chart || !rect || rect.width <= 0) return null;
  const ratio = clampMotionTrackChartValue((event.clientX - rect.left) / rect.width, 0, 1);
  const zoom = chart.zoomWindow;
  return zoom.startMs + ratio * (zoom.endMs - zoom.startMs);
}

function captureMotionTrackChartPointer(target, pointerId) {
  try {
    target?.setPointerCapture?.(pointerId);
  } catch {
    // Synthetic pointer events in tests may not have a browser-owned pointer id.
  }
}

function releaseMotionTrackChartPointer(target, pointerId) {
  try {
    target?.releasePointerCapture?.(pointerId);
  } catch {
    // The pointer may already be released by the browser.
  }
}

function getMotionWorkspaceViewportWidth() {
  return typeof window === "undefined" ? undefined : window.innerWidth;
}

function isMotionWorkspaceEditableTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

function resizeMotionWorkspaceDockTo(widthPx) {
  motionWorkspaceSession.value = resizeMotionDebugWorkspaceDock(motionWorkspaceSession.value, widthPx, {
    viewportWidth: getMotionWorkspaceViewportWidth(),
  });
}

function stepMotionWorkspaceDockWidth(direction, event = {}) {
  const step = event.shiftKey ? MOTION_WORKSPACE_DOCK_RESIZE_FAST_STEP_PX : MOTION_WORKSPACE_DOCK_RESIZE_STEP_PX;
  motionWorkspaceSession.value = resizeMotionDebugWorkspaceDockByDelta(
    motionWorkspaceSession.value,
    direction * step,
    { viewportWidth: getMotionWorkspaceViewportWidth() },
  );
}

function releaseMotionWorkspaceDockResizePointer() {
  const state = motionWorkspaceDockResize.value;
  if (!state) return;
  try {
    state.target?.releasePointerCapture?.(state.pointerId);
  } catch {
    // The pointer may already be released by the browser.
  }
}

function removeMotionWorkspaceDockResizeListeners() {
  if (typeof window === "undefined") return;
  window.removeEventListener("pointermove", updateMotionWorkspaceDockResize);
  window.removeEventListener("pointerup", endMotionWorkspaceDockResize);
  window.removeEventListener("pointercancel", cancelMotionWorkspaceDockResize);
}

function clearMotionWorkspaceDockResize() {
  releaseMotionWorkspaceDockResizePointer();
  removeMotionWorkspaceDockResizeListeners();
  motionWorkspaceDockResize.value = null;
}

function startMotionWorkspaceDockResize(event) {
  if (motionWorkspaceFullscreen.value || event.button !== 0) return;
  event.preventDefault();
  clearMotionWorkspaceDockResize();
  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic pointer events in tests may not have a browser-owned pointer id.
  }
  motionWorkspaceDockResize.value = {
    pointerId: event.pointerId,
    startClientX: Number(event.clientX) || 0,
    startWidthPx: motionWorkspaceSession.value.dockWidthPx,
    target: event.currentTarget,
  };
  if (typeof window === "undefined") return;
  window.addEventListener("pointermove", updateMotionWorkspaceDockResize);
  window.addEventListener("pointerup", endMotionWorkspaceDockResize);
  window.addEventListener("pointercancel", cancelMotionWorkspaceDockResize);
}

function updateMotionWorkspaceDockResize(event) {
  const state = motionWorkspaceDockResize.value;
  if (!state || event.pointerId !== state.pointerId) return;
  const clientX = Number(event.clientX);
  if (!Number.isFinite(clientX)) return;
  event.preventDefault();
  resizeMotionWorkspaceDockTo(state.startWidthPx + state.startClientX - clientX);
}

function endMotionWorkspaceDockResize(event) {
  const state = motionWorkspaceDockResize.value;
  if (!state || event.pointerId !== state.pointerId) return;
  updateMotionWorkspaceDockResize(event);
  clearMotionWorkspaceDockResize();
}

function cancelMotionWorkspaceDockResize(event) {
  const state = motionWorkspaceDockResize.value;
  if (!state || event.pointerId !== state.pointerId) return;
  clearMotionWorkspaceDockResize();
}

function handleMotionWorkspaceResizeHandleKeydown(event) {
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

function handleMotionWorkspaceGlobalKeydown(event) {
  if (event.defaultPrevented || event.key !== "Escape" || !motionWorkspaceOpen.value) return;
  if (isMotionWorkspaceEditableTarget(event.target)) return;
  event.preventDefault();
  if (motionWorkspaceFullscreen.value) {
    setMotionWorkspaceMode(MOTION_DEBUG_WORKSPACE_MODE_DOCK);
  } else {
    closeMotionWorkspace();
  }
}

function formatMotionWorkspaceTarget(target) {
  if (!target) return "none";
  return target.label || target.sourceLabel || target.layer || target.kind || `target ${target.targetId ?? "-"}`;
}

function formatMotionWorkspaceTrack(track) {
  if (!track) return "none";
  return `${track.prop || "unknown"} / ${track.lane || "base"}`;
}

function formatMotionFocusedDebugSelectionLabel() {
  const targetLabel = motionWorkspaceSelectedTargetLabel.value;
  const trackLabel = motionWorkspaceSelectedTrackLabel.value;
  if (targetLabel === "none" && trackLabel === "none") return "all visible replay tracks";
  if (trackLabel === "none") return targetLabel;
  return `${targetLabel} / ${trackLabel}`;
}

function formatMotionReplayBookmarkMeta(bookmark = {}) {
  const parts = [
    `${formatMotionReplayTime(bookmark.startMs)}..${formatMotionReplayTime(bookmark.endMs)}`,
  ];
  const trackLabel = formatMotionWorkspaceTrack(bookmark.track);
  if (trackLabel !== "none") parts.push(trackLabel);
  const targetLabel = formatMotionWorkspaceTarget(bookmark.selection);
  if (targetLabel !== "none") parts.push(targetLabel);
  if (bookmark.filters?.query) parts.push(`filter:${bookmark.filters.query}`);
  return parts.join(" / ");
}

function formatMotionCaptureFilterList(values = []) {
  return (Array.isArray(values) ? values : []).join(", ");
}

function formatMotionCaptureTargetFilterSummary(filters = {}) {
  const parts = [];
  if (filters.layers?.length) parts.push(`${filters.layers.length} layer`);
  if (filters.kinds?.length) parts.push(`${filters.kinds.length} kind`);
  if (filters.sourceLabels?.length) parts.push(`${filters.sourceLabels.length} source`);
  if (filters.sourceQuery) parts.push(`query:${filters.sourceQuery}`);
  return parts.length ? parts.join(" / ") : "all targets";
}

function parseMotionCaptureFilterList(value) {
  return String(value ?? "")
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getMotionWorkspaceTargetKey(target) {
  if (!target) return null;
  if (target.targetId != null) return `id:${target.targetId}`;
  if (target.sourceLabel) return `source:${target.sourceLabel}`;
  if (target.label) return `label:${target.label}`;
  return null;
}

function isSameMotionWorkspaceTarget(a, b) {
  const keyA = getMotionWorkspaceTargetKey(a);
  const keyB = getMotionWorkspaceTargetKey(b);
  if (keyA || keyB) return keyA === keyB;
  return Boolean(a?.layer && b?.layer && a.layer === b.layer);
}

function isMotionWorkspaceLayerSelected(row) {
  const target = motionWorkspaceSession.value.selectedTarget;
  return Boolean(target && target.kind === "layer" && target.layer === row.layer);
}

function isMotionWorkspaceTrackSelected(row) {
  const track = motionWorkspaceSession.value.selectedTrack;
  if (!track) return false;
  return isSameMotionWorkspaceTarget(track, row)
    && track.prop === row.prop
    && track.lane === row.lane
    && track.laneKey === row.laneKey;
}

function isMotionWorkspaceTimelineEventSelected(event) {
  return isMotionWorkspaceTrackSelected(event)
    && Math.round(motionWorkspaceSession.value.selectedTimeMs) === Math.round(Number(event.timeMs) || 0);
}

function formatEffectLabel(effect) {
  if (effect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) return "acrylic";
  if (effect === BACKGROUND_EFFECT_BLUR) return "blur";
  return effect;
}

function readMotionRuntimeSnapshot() {
  if (!canDebugMotion.value) return {};
  const config = motionRuntime.configureDebug();
  const includeDebugDetails = Boolean(config.enabled);
  return {
    ...motionRuntime.debugSnapshot({
      includeChannels: includeDebugDetails,
      includeTargets: includeDebugDetails,
    }),
    config,
  };
}

function refreshMotionSnapshot() {
  if (!canDebugMotion.value) return;
  motionSnapshot.value = readMotionRuntimeSnapshot();
}

function refreshMotionHistoryReport(_reason = "manual") {
  if (!canDebugMotion.value) return;
  motionReport.value = motionRuntime.debugReport({
    includeChannels: true,
    includeCurveStats: true,
    includeHistory: true,
    includeTargets: true,
  });
  refreshMotionSnapshot();
}

function applyMotionRuntimeDebugConfig() {
  if (!canDebugMotion.value) return;
  if (motionReplayCaptureActive.value) {
    refreshMotionSnapshot();
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
  motionRuntime.configureDebug(config);
  refreshMotionSnapshot();
}

function disableMotionRuntimeDebug() {
  motionRuntimeDebugEnabled.value = false;
  motionRecordEnabled.value = false;
  motionOverlayEnabled.value = false;
  if (motionTimeScale.value !== 1) motionTimeScale.value = 1;
  motionRuntime.configureDebug({
    enabled: false,
    overlayEnabled: false,
    recordHistory: false,
    timeScale: 1,
  });
  refreshMotionSnapshot();
}

function setMotionRuntimeDebugEnabled(enabled) {
  motionRuntimeDebugEnabled.value = Boolean(enabled);
  if (!motionRuntimeDebugEnabled.value) {
    disableMotionRuntimeDebug();
  } else {
    applyMotionRuntimeDebugConfig();
  }
  restartMotionRuntimePoller();
}

function setMotionRecordEnabled(enabled) {
  if (!motionRuntimeDebugEnabled.value) return;
  motionRecordEnabled.value = Boolean(enabled);
  applyMotionRuntimeDebugConfig();
}

function setMotionOverlayEnabled(enabled) {
  if (!motionRuntimeDebugEnabled.value) return;
  motionOverlayEnabled.value = Boolean(enabled);
  applyMotionRuntimeDebugConfig();
}

function setMotionWindowPreset(preset) {
  motionWindowPreset.value = MOTION_RECORD_WINDOW_PRESETS.some((entry) => entry.value === preset)
    ? preset
    : "30000";
  applyMotionRuntimeDebugConfig();
}

function syncMotionWorkspaceFilters() {
  motionWorkspaceSession.value = setMotionDebugWorkspaceFilters(motionWorkspaceSession.value, {
    preset: motionFilterPreset.value,
    query: motionFilterQuery.value,
  });
}

function setMotionFilterPreset(preset) {
  motionFilterPreset.value = normalizeMotionFilterPreset(preset);
  syncMotionWorkspaceFilters();
}

function updateMotionFilterQuery(event) {
  motionFilterQuery.value = event.target.value;
  syncMotionWorkspaceFilters();
}

function updateMotionCustomSeconds(event) {
  motionCustomSeconds.value = normalizeMotionCustomSeconds(event.target.value);
  applyMotionRuntimeDebugConfig();
}

function updateMotionTimeScale(event) {
  motionTimeScale.value = normalizeMotionTimeScale(event.target.value);
  applyMotionRuntimeDebugConfig();
}

function openMotionWorkspace(mode = motionWorkspaceSession.value.mode || MOTION_DEBUG_WORKSPACE_MODE_DOCK) {
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

function selectMotionWorkspaceLayer(row) {
  openMotionWorkspace();
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTarget(motionWorkspaceSession.value, {
    kind: "layer",
    label: row.layer,
    layer: row.layer,
  });
}

function selectMotionWorkspaceTrack(row) {
  openMotionWorkspace();
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTrack(motionWorkspaceSession.value, row);
}

function selectMotionWorkspaceReplayOverlay(row) {
  if (!row) return;
  openMotionWorkspace();
  if (row.primaryTrack) {
    motionWorkspaceSession.value = selectMotionDebugWorkspaceTrack(motionWorkspaceSession.value, row.primaryTrack);
  } else {
    motionWorkspaceSession.value = selectMotionDebugWorkspaceTarget(motionWorkspaceSession.value, row);
  }
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, motionReplayCurrentTimeMs.value);
}

function selectMotionWorkspacePropertyByEvent(event) {
  const rowElement = event.target?.closest?.("[data-motion-property-index]");
  if (!rowElement) return;
  const index = Number(rowElement.dataset.motionPropertyIndex);
  const row = motionPropertyRows.value[index];
  if (!row) return;
  selectMotionWorkspaceTrack(row);
}

function selectMotionWorkspaceTimelineEvent(event) {
  openMotionWorkspace();
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTrack(motionWorkspaceSession.value, event);
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, event.timeMs);
}

function selectMotionWorkspaceCurve(group) {
  openMotionWorkspace();
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTrack(motionWorkspaceSession.value, group);
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, group.latestTimeMs);
}

function setMotionTrackChartDisplayMode(mode) {
  motionTrackChartDisplayMode.value = mode === MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    ? MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    : MOTION_TRACK_CHART_DISPLAY_RAW;
}

function toggleMotionTrackChartSeries(key, event) {
  motionTrackChartSeriesVisibility.value = normalizeMotionTrackChartSeriesVisibility({
    ...motionTrackChartSeriesVisibility.value,
    [key]: event.target.checked,
  });
}

function setMotionTrackChartSelectedTime(timeMs) {
  if (!motionReplayViewerTrace.value) return;
  const normalizedTime = normalizeMotionReplayTime(motionReplayViewerTrace.value, timeMs);
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, normalizedTime);
}

function setMotionTrackChartBrushInterval(startMs, endMs) {
  if (!motionReplayViewerTrace.value) return;
  const start = normalizeMotionReplayIntervalTime(startMs);
  const end = normalizeMotionReplayIntervalTime(endMs);
  motionReplayIntervalStartMs.value = Math.min(start, end);
  motionReplayIntervalEndMs.value = Math.max(start, end);
}

function updateMotionTrackChartPointer(event) {
  const timeMs = readMotionTrackChartPointerTime(event);
  if (timeMs == null) return;
  setMotionTrackChartSelectedTime(timeMs);
  if (motionTrackChartBrushPointerId.value === event.pointerId && motionTrackChartBrushAnchorMs.value != null) {
    setMotionTrackChartBrushInterval(motionTrackChartBrushAnchorMs.value, timeMs);
  }
}

function startMotionTrackChartBrush(event) {
  if (!motionReplayViewerTrace.value || event.button !== 0) return;
  const timeMs = readMotionTrackChartPointerTime(event);
  if (timeMs == null) return;
  stopMotionReplayPlayback();
  event.preventDefault();
  captureMotionTrackChartPointer(event.currentTarget, event.pointerId);
  motionTrackChartBrushPointerId.value = event.pointerId;
  motionTrackChartBrushAnchorMs.value = timeMs;
  setMotionTrackChartSelectedTime(timeMs);
  setMotionTrackChartBrushInterval(timeMs, timeMs);
}

function endMotionTrackChartBrush(event) {
  if (motionTrackChartBrushPointerId.value !== event.pointerId) return;
  const timeMs = readMotionTrackChartPointerTime(event);
  if (timeMs != null && motionTrackChartBrushAnchorMs.value != null) {
    setMotionTrackChartSelectedTime(timeMs);
    setMotionTrackChartBrushInterval(motionTrackChartBrushAnchorMs.value, timeMs);
  }
  releaseMotionTrackChartPointer(event.currentTarget, event.pointerId);
  motionTrackChartBrushPointerId.value = null;
  motionTrackChartBrushAnchorMs.value = null;
}

function cancelMotionTrackChartBrush(event) {
  if (motionTrackChartBrushPointerId.value == null) return;
  releaseMotionTrackChartPointer(event.currentTarget, motionTrackChartBrushPointerId.value);
  motionTrackChartBrushPointerId.value = null;
  motionTrackChartBrushAnchorMs.value = null;
}

function setMotionTrackChartZoomWindow(startMs, endMs) {
  if (!motionReplayViewerTrace.value) return;
  const zoom = normalizeMotionTrackChartZoomWindow(motionReplayViewerTrace.value, { endMs, startMs });
  motionTrackChartZoomStartMs.value = zoom.startMs;
  motionTrackChartZoomEndMs.value = zoom.endMs;
  setMotionTrackChartSelectedTime(clampMotionTrackChartValue(
    motionWorkspaceSession.value.selectedTimeMs,
    zoom.startMs,
    zoom.endMs,
  ));
}

function updateMotionTrackChartZoomStart(event) {
  setMotionTrackChartZoomWindow(event.target.value, motionTrackChartZoomWindow.value.endMs);
}

function updateMotionTrackChartZoomEnd(event) {
  setMotionTrackChartZoomWindow(motionTrackChartZoomWindow.value.startMs, event.target.value);
}

function resetMotionTrackChartZoom() {
  motionTrackChartZoomStartMs.value = null;
  motionTrackChartZoomEndMs.value = null;
}

function ensureMotionTrackChartTimeVisible(timeMs) {
  if (!motionReplayViewerTrace.value || !motionTrackChartZoomActive.value) return;
  const zoom = motionTrackChartZoomWindow.value;
  const time = Number(timeMs);
  if (!Number.isFinite(time)) return;
  if (time < zoom.startMs || time > zoom.endMs) resetMotionTrackChartZoom();
}

function zoomMotionTrackChartToInterval() {
  if (!motionTrackChartIntervalActive.value) return;
  setMotionTrackChartZoomWindow(motionReplayIntervalStartMs.value, motionReplayIntervalEndMs.value);
}

function selectMotionTrackChartTrack(track) {
  selectMotionWorkspaceTrack(track);
  if (track.current) {
    motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, track.current.timeMs);
  }
}

function selectMotionTrackChartEvent(track, marker) {
  selectMotionWorkspaceTrack(track);
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, marker.timeMs);
  setMotionReplayCurrentTime(marker.timeMs, { pause: true });
}

function jumpMotionReplayAnomaly(row = {}) {
  if (!motionReplayViewerTrace.value || !row) return;
  if (row.track) selectMotionWorkspaceTrack(row.track);
  ensureMotionTrackChartTimeVisible(row.timeMs);
  setMotionReplayCurrentTime(row.timeMs, { pause: true });
}

function clearMotionWorkspaceSelection() {
  motionWorkspaceSession.value = selectMotionDebugWorkspaceTarget(motionWorkspaceSession.value, null);
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, 0);
}

function toggleMotionWorkspaceSelectedPin() {
  if (!motionWorkspaceSession.value.selectedTarget) return;
  motionWorkspaceSession.value = toggleMotionDebugWorkspacePin(
    motionWorkspaceSession.value,
    motionWorkspaceSession.value.selectedTarget,
  );
}

function closeMotionWorkspace() {
  clearMotionWorkspaceDockResize();
  motionWorkspaceSession.value = closeMotionDebugWorkspace(motionWorkspaceSession.value);
}

function setMotionWorkspaceMode(mode) {
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

function updateMotionWorkspaceDockWidth(event) {
  resizeMotionWorkspaceDockTo(event.target.value);
}

function updateMotionWorkspaceCaptureProfile(event) {
  motionWorkspaceSession.value = setMotionDebugWorkspaceCaptureProfile(
    motionWorkspaceSession.value,
    event.target.value,
  );
}

function toggleMotionWorkspaceCaptureProp(prop, event) {
  motionWorkspaceSession.value = toggleMotionDebugWorkspaceCaptureProp(
    motionWorkspaceSession.value,
    prop,
    event.target.checked,
  );
}

function updateMotionWorkspaceCaptureTargetFilter(key, event) {
  const currentFilters = motionWorkspaceSession.value.captureTargetFilters;
  const value = event.target.value;
  motionWorkspaceSession.value = setMotionDebugWorkspaceCaptureTargetFilters(motionWorkspaceSession.value, {
    ...currentFilters,
    [key]: key === "sourceQuery" ? value : parseMotionCaptureFilterList(value),
  });
}

function clearMotionDebugHistory() {
  if (!canDebugMotion.value) return;
  if (motionReplayCaptureActive.value) return;
  motionRuntime.clearDebugHistory();
  refreshMotionHistoryReport("clear-history");
}

function updateMotionReplayCaptureSeconds(event) {
  motionReplayCaptureSeconds.value = normalizeMotionReplayCaptureSeconds(event.target.value);
}

function syncMotionControlsFromRuntimeConfig() {
  const config = motionRuntime.configureDebug();
  motionRuntimeDebugEnabled.value = Boolean(config.enabled);
  motionOverlayEnabled.value = Boolean(config.enabled && config.overlayEnabled);
  motionRecordEnabled.value = Boolean(config.enabled && config.recordHistory);
  motionTimeScale.value = normalizeMotionTimeScale(config.timeScale);
}

function startMotionReplayCapture() {
  if (!canDebugMotion.value || motionReplayCaptureActive.value) return;
  motionReplayCaptureSeconds.value = normalizeMotionReplayCaptureSeconds(motionReplayCaptureSeconds.value);
  motionReplayTrace.value = null;
  motionReplayTraceJson.value = "";
  hasCopiedMotionReplayTrace.value = false;
  motionReplayCaptureStatus.value = motionReplayCapture.start({
    captureProfile: motionCaptureProfile.value,
    seconds: motionReplayCaptureSeconds.value,
  });
  syncMotionControlsFromRuntimeConfig();
  refreshMotionSnapshot();
  restartMotionRuntimePoller();
}

function stopMotionReplayCapture(options = {}) {
  if (!canDebugMotion.value || !motionReplayCaptureActive.value) return null;
  const result = motionReplayCapture.stop({
    restore: options.restore !== false,
  });
  motionReplayCaptureStatus.value = result.status;
  motionReplayTrace.value = result.trace;
  motionReplayTraceJson.value = result.json;
  loadMotionReplayTrace(result.trace, result.json, { updateImportText: false });
  syncMotionControlsFromRuntimeConfig();
  refreshMotionSnapshot();
  restartMotionRuntimePoller();
  return result;
}

function syncMotionReplayIntervalToRange(trace) {
  const range = trace ? getMotionReplayTimeRange(trace) : { max: 0, min: 0 };
  motionReplayIntervalStartMs.value = Number(range.min) || 0;
  motionReplayIntervalEndMs.value = Number(range.max) || 0;
}

function normalizeMotionReplayIntervalTime(timeMs) {
  if (!motionReplayViewerTrace.value) return 0;
  return Math.round(normalizeMotionReplayTime(motionReplayViewerTrace.value, timeMs));
}

function setMotionReplayCurrentTime(timeMs, options = {}) {
  if (!motionReplayViewerTrace.value) return;
  if (options.pause) stopMotionReplayPlayback();
  const normalizedTime = normalizeMotionReplayTime(motionReplayViewerTrace.value, timeMs);
  motionReplayCurrentTimeMs.value = normalizedTime;
  motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, normalizedTime);
}

function loadMotionReplayTrace(trace, json = "", options = {}) {
  if (!canDebugMotion.value) return;
  try {
    const normalized = normalizeMotionReplayTrace(trace);
    motionReplayViewerTrace.value = normalized;
    if (options.updateImportText) {
      motionReplayImportText.value = json || JSON.stringify(normalized, null, 2);
    }
    motionReplayImportError.value = "";
    motionReplayFilterQuery.value = "";
    const range = getMotionReplayTimeRange(normalized);
    motionReplayCurrentTimeMs.value = normalizeMotionReplayTime(normalized, range.min);
    motionWorkspaceSession.value = setMotionDebugWorkspaceTime(motionWorkspaceSession.value, motionReplayCurrentTimeMs.value);
    syncMotionReplayIntervalToRange(normalized);
    clearMotionReplayBookmarks();
    resetMotionTrackChartZoom();
    stopMotionReplayPlayback();
  } catch (error) {
    motionReplayImportError.value = error instanceof Error ? error.message : String(error);
  }
}

function loadCapturedMotionReplayTrace() {
  if (!motionReplayTrace.value) return;
  loadMotionReplayTrace(motionReplayTrace.value, motionReplayTraceJson.value, { updateImportText: false });
}

function clearMotionReplayViewer() {
  stopMotionReplayPlayback();
  motionReplayViewerTrace.value = null;
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

function updateMotionReplayImportText(event) {
  motionReplayImportText.value = event.target.value;
  if (motionReplayImportError.value) motionReplayImportError.value = "";
}

function loadMotionReplayImportText() {
  try {
    loadMotionReplayTrace(parseMotionReplayTraceJson(motionReplayImportText.value), motionReplayImportText.value, { updateImportText: true });
  } catch (error) {
    motionReplayImportError.value = error instanceof Error ? error.message : String(error);
  }
}

async function importMotionReplayFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    assertMotionReplayImportSize(file.size);
    const text = await file.text();
    loadMotionReplayTrace(parseMotionReplayTraceJson(text), text, { updateImportText: false });
  } catch (error) {
    motionReplayImportError.value = error instanceof Error ? error.message : String(error);
  } finally {
    event.target.value = "";
  }
}

function updateMotionReplayCurrentTime(event) {
  setMotionReplayCurrentTime(event.target.value, { pause: true });
}

function stepMotionReplayFrame(direction) {
  if (!motionReplayViewerTrace.value) return;
  const timeMs = findMotionReplayFrameStepTime(
    motionReplayViewerTrace.value,
    motionReplayCurrentTimeMs.value,
    direction,
  );
  setMotionReplayCurrentTime(timeMs, { pause: true });
}

function stepMotionReplayEvent(direction) {
  if (!motionReplayViewerTrace.value) return;
  const event = findMotionReplayEventStep(
    motionReplayViewerTrace.value,
    motionReplayCurrentTimeMs.value,
    direction,
    motionReplayFilters.value,
  );
  if (!event) return;
  selectMotionWorkspaceTrack(event);
  setMotionReplayCurrentTime(event.timeMs, { pause: true });
}

function updateMotionReplayFilterQuery(event) {
  motionReplayFilterQuery.value = event.target.value;
}

function updateMotionReplayIntervalStart(event) {
  if (!motionReplayViewerTrace.value) return;
  motionReplayIntervalStartMs.value = normalizeMotionReplayIntervalTime(event.target.value);
}

function updateMotionReplayIntervalEnd(event) {
  if (!motionReplayViewerTrace.value) return;
  motionReplayIntervalEndMs.value = normalizeMotionReplayIntervalTime(event.target.value);
}

function buildMotionReplayBookmarkInput() {
  const selectedTrack = motionWorkspaceSession.value.selectedTrack;
  return {
    endMs: motionReplayIntervalEndMs.value,
    filters: motionReplayFilters.value,
    selection: motionWorkspaceSession.value.selectedTarget,
    startMs: motionReplayIntervalStartMs.value,
    track: selectedTrack,
  };
}

function saveMotionReplayBookmark() {
  if (!motionReplayViewerTrace.value || !motionReplayBookmarkCanSave.value) return;
  motionReplayBookmarks.value = addMotionReplayBookmark(
    motionReplayBookmarks.value,
    buildMotionReplayBookmarkInput(),
    {
      createdAt: new Date().toISOString(),
      trace: motionReplayViewerTrace.value,
    },
  );
}

function applyMotionReplayBookmark(bookmark = {}) {
  if (!motionReplayViewerTrace.value || !bookmark) return;
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

function deleteMotionReplayBookmark(bookmark = {}) {
  motionReplayBookmarks.value = removeMotionReplayBookmark(motionReplayBookmarks.value, bookmark.id);
}

function clearMotionReplayBookmarks() {
  motionReplayBookmarks.value = [];
}

function stopMotionReplayPlayback() {
  if (motionReplayPlaybackTimer != null) window.clearInterval(motionReplayPlaybackTimer);
  motionReplayPlaybackTimer = null;
  motionReplayPlaybackLastTime = 0;
  motionReplayPlaying.value = false;
}

function startMotionReplayPlayback() {
  if (!motionReplayViewerTrace.value || motionReplayPlaying.value) return;
  const range = getMotionReplayTimeRange(motionReplayViewerTrace.value);
  if (motionReplayCurrentTimeMs.value >= range.max) {
    motionReplayCurrentTimeMs.value = normalizeMotionReplayTime(motionReplayViewerTrace.value, range.min);
  }
  motionReplayPlaying.value = true;
  motionReplayPlaybackLastTime = performance.now();
  motionReplayPlaybackTimer = window.setInterval(() => {
    if (!motionReplayViewerTrace.value) {
      stopMotionReplayPlayback();
      return;
    }
    const now = performance.now();
    const delta = now - motionReplayPlaybackLastTime;
    motionReplayPlaybackLastTime = now;
    const nextTime = motionReplayCurrentTimeMs.value + delta;
    const currentRange = getMotionReplayTimeRange(motionReplayViewerTrace.value);
    if (nextTime >= currentRange.max) {
      setMotionReplayCurrentTime(currentRange.max);
      stopMotionReplayPlayback();
      return;
    }
    setMotionReplayCurrentTime(nextTime);
  }, 33);
}

function toggleMotionReplayPlayback() {
  if (motionReplayPlaying.value) stopMotionReplayPlayback();
  else startMotionReplayPlayback();
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

function normalizeDebugPanelDock(value) {
  return value === "left" ? "left" : "right";
}

function readDebugPanelDock() {
  if (typeof window === "undefined") return "right";
  try {
    return normalizeDebugPanelDock(window.localStorage.getItem(DEBUG_PANEL_DOCK_STORAGE_KEY));
  } catch {
    return "right";
  }
}

function persistDebugPanelDock(dock) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEBUG_PANEL_DOCK_STORAGE_KEY, normalizeDebugPanelDock(dock));
  } catch {
    // The debug panel should still work when storage is unavailable.
  }
}

function setDebugPanelDock(dock) {
  debugPanelDock.value = normalizeDebugPanelDock(dock);
  persistDebugPanelDock(debugPanelDock.value);
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

function setLayoutDebugEnabled(enabled) {
  props.updateDesktopLayoutDebugParams?.({ enabled });
}

function updateLayoutNumber(key, event) {
  props.updateDesktopLayoutDebugParams?.({ [key]: Number(event.target.value) });
}

function resetLayoutDebugParams() {
  props.resetDesktopLayoutDebugParams?.();
}

function showDebugLayoutSaveFailed() {
  props.dialogState?.showLayoutSaveFailed?.({
    error: new Error("EACCES: permission denied, open C:/Users/233/AppData/Roaming/LaunchPad/layout.json"),
    retryCount: 3,
    onRetry: () => props.dialogState?.showLayoutSaveRecovered?.(),
  });
}

function showDebugLayoutSaveRecovered() {
  props.dialogState?.showLayoutSaveRecovered?.();
}

function showDebugLayoutLoadFailed() {
  props.dialogState?.showLayoutLoadFailed?.({
    error: new Error("Unexpected token at position 128 while parsing layout.json"),
    retryCount: 2,
    onRetry: () => props.dialogState?.showLayoutLoadRecovered?.(),
  });
}

function showDebugLayoutLoadRecovered() {
  props.dialogState?.showLayoutLoadRecovered?.();
}

function showDebugLayoutRecovered() {
  props.dialogState?.handleLayoutRecovered?.({
    payload: {
      backupPath: "C:/Users/233/AppData/Roaming/LaunchPad/layout.corrupt.backup.json",
    },
  });
}

function showDebugNoticeStack() {
  showDebugLayoutRecovered();
  showDebugLayoutSaveFailed();
}

function clearDebugNotices() {
  props.dialogState?.closeLayoutRecoveryNotice?.();
  props.dialogState?.closeLayoutSaveNotice?.();
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

async function copyMotionReport(mode) {
  if (!canDebugMotion.value) return;
  try {
    const report = createMotionDebugAIReport(motionRuntime, { mode });
    await copyToClipboard(
      report.copyText,
      mode === "full" ? hasCopiedMotionFull : hasCopiedMotionSummary,
      mode === "full" ? "motionFull" : "motionSummary",
    );
    if (mode === "full") {
      refreshMotionHistoryReport("copy-full-ai-report");
    } else {
      refreshMotionSnapshot();
    }
  } catch (error) {
    console.warn("Failed to copy Pixi motion debug report", error);
  }
}

function buildMotionFocusedDebugExportOptions(bookmark = null) {
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
    selection,
    track: selectedTrack,
    visibleTracks,
  };
}

async function copyMotionFocusedDebugExport(bookmark = null) {
  if (!canDebugMotion.value || !motionReplayViewerTrace.value) return;
  try {
    const focused = createMotionFocusedDebugExport(
      motionReplayViewerTrace.value,
      buildMotionFocusedDebugExportOptions(bookmark?.id ? bookmark : null),
    );
    await copyToClipboard(
      focused.copyText,
      hasCopiedMotionFocused,
      "motionFocused",
    );
  } catch (error) {
    console.warn("Failed to copy focused Pixi motion debug export", error);
  }
}

async function copyMotionReplayTrace() {
  if (!canDebugMotion.value || !motionReplayTraceJson.value) return;
  try {
    await copyToClipboard(
      motionReplayTraceJson.value,
      hasCopiedMotionReplayTrace,
      "motionReplayTrace",
    );
  } catch (error) {
    console.warn("Failed to copy Pixi motion replay trace", error);
  }
}

async function copyMotionReplayInterval() {
  if (!canDebugMotion.value || !motionReplayViewerTrace.value) return;
  try {
    const interval = createMotionReplayIntervalExport(motionReplayViewerTrace.value, {
      endMs: motionReplayIntervalEndMs.value,
      filters: motionReplayFilters.value,
      startMs: motionReplayIntervalStartMs.value,
    });
    await copyToClipboard(
      interval.json,
      hasCopiedMotionReplayInterval,
      "motionReplayInterval",
    );
  } catch (error) {
    console.warn("Failed to copy Pixi motion replay interval", error);
  }
}

function clearLiveDesktopRuntimePoller() {
  if (liveDesktopRuntimePollTimer == null) return;
  window.clearInterval(liveDesktopRuntimePollTimer);
  liveDesktopRuntimePollTimer = null;
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

const motionDebugWorkspaceContext = {
  MOTION_FILTER_PRESETS,
  MOTION_REPLAY_IMPORT_MAX_BYTES,
  MOTION_TRACK_CHART_DISPLAY_NORMALIZED,
  MOTION_TRACK_CHART_DISPLAY_RAW,
  applyMotionReplayBookmark,
  cancelMotionTrackChartBrush,
  clearMotionDebugHistory,
  clearMotionReplayBookmarks,
  clearMotionReplayViewer,
  copyMotionFocusedDebugExport,
  copyMotionReplayInterval,
  copyMotionReport,
  deleteMotionReplayBookmark,
  endMotionTrackChartBrush,
  formatMotionChartStat,
  formatMotionReplayBookmarkMeta,
  formatMotionReplayTime,
  formatMotionTrackChartValue,
  importMotionReplayFile,
  isMotionWorkspaceLayerSelected,
  isMotionWorkspaceTimelineEventSelected,
  isMotionWorkspaceTrackSelected,
  jumpMotionReplayAnomaly,
  loadCapturedMotionReplayTrace,
  loadMotionReplayImportText,
  motionAnimationRows,
  motionCancelReasonRows,
  motionCaptureAllowedProps,
  motionCaptureEstimateRows,
  motionCaptureProfile,
  motionCaptureProfiles,
  motionCaptureSelectedPropCount,
  motionCaptureTargetFilterText,
  motionCurveChartGroups,
  motionFilterPreset,
  motionFilterQuery,
  motionFilterSummary,
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
  motionLayerTreeRows,
  motionOverviewRows,
  motionPropertyRows,
  motionReplayAnomalyRows,
  motionReplayAnomalyStatusLabel,
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
  motionReplayTrace,
  motionReplayViewerLoaded,
  motionSummaryCopyButtonLabel,
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
  motionWarningRows,
  motionWorkspaceFilterLabel,
  motionWorkspaceSelectedTargetLabel,
  motionWorkspaceSelectedTimeMs,
  motionWorkspaceSelectedTrackLabel,
  motionWorkspaceSession,
  resetMotionTrackChartZoom,
  saveMotionReplayBookmark,
  selectMotionTrackChartEvent,
  selectMotionTrackChartTrack,
  selectMotionWorkspaceCurve,
  selectMotionWorkspaceLayer,
  selectMotionWorkspacePropertyByEvent,
  selectMotionWorkspaceReplayOverlay,
  selectMotionWorkspaceTimelineEvent,
  selectMotionWorkspaceTrack,
  setMotionFilterPreset,
  setMotionReplayCurrentTime,
  setMotionTrackChartDisplayMode,
  startMotionTrackChartBrush,
  stepMotionReplayEvent,
  stepMotionReplayFrame,
  toggleMotionReplayPlayback,
  toggleMotionTrackChartSeries,
  toggleMotionWorkspaceCaptureProp,
  updateMotionFilterQuery,
  updateMotionReplayCurrentTime,
  updateMotionReplayFilterQuery,
  updateMotionReplayImportText,
  updateMotionReplayIntervalEnd,
  updateMotionReplayIntervalStart,
  updateMotionTrackChartPointer,
  updateMotionTrackChartZoomEnd,
  updateMotionTrackChartZoomStart,
  updateMotionWorkspaceCaptureProfile,
  updateMotionWorkspaceCaptureTargetFilter,
  zoomMotionTrackChartToInterval,
};

provide(MOTION_DEBUG_WORKSPACE_CONTEXT_KEY, motionDebugWorkspaceContext);

watch(canDebugLiveDesktop, (enabled) => {
  if (!enabled && activePanel.value === "liveDesktop") activePanel.value = "acrylic";
}, { immediate: true });

watch(canDebugMotion, (enabled) => {
  if (enabled) return;
  closeMotionWorkspace();
  if (activePanel.value === "motion") activePanel.value = "acrylic";
}, { immediate: true });

watch([isCollapsed, activePanel, canDebugLiveDesktop], restartLiveDesktopRuntimePoller, { flush: "post" });
watch([isCollapsed, activePanel, canDebugMotion], restartMotionRuntimePoller, { flush: "post" });

onMounted(() => {
  window.addEventListener("keydown", handleMotionWorkspaceGlobalKeydown);
  restartLiveDesktopRuntimePoller();
  restartMotionRuntimePoller();
});

onBeforeUnmount(() => {
  if (acrylicCopyStateTimer != null) window.clearTimeout(acrylicCopyStateTimer);
  if (diagnosticsCopyStateTimer != null) window.clearTimeout(diagnosticsCopyStateTimer);
  if (motionFocusedCopyStateTimer != null) window.clearTimeout(motionFocusedCopyStateTimer);
  if (motionFullCopyStateTimer != null) window.clearTimeout(motionFullCopyStateTimer);
  if (motionReplayIntervalCopyStateTimer != null) window.clearTimeout(motionReplayIntervalCopyStateTimer);
  if (motionReplayTraceCopyStateTimer != null) window.clearTimeout(motionReplayTraceCopyStateTimer);
  if (motionSummaryCopyStateTimer != null) window.clearTimeout(motionSummaryCopyStateTimer);
  if (kawaseLiveDesktopSyncTimer != null) window.clearTimeout(kawaseLiveDesktopSyncTimer);
  stopMotionReplayPlayback();
  stopMotionReplayCapture();
  disableMotionRuntimeDebug();
  clearMotionWorkspaceDockResize();
  window.removeEventListener("keydown", handleMotionWorkspaceGlobalKeydown);
  clearMotionRuntimePoller();
  clearLiveDesktopRuntimePoller();
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

.background-debug-mode-group {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.background-debug-kernel-group {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.background-debug-live-source-group {
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

.background-debug-window-list {
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

.motion-debug-anomaly-panel {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.motion-debug-anomaly-panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  color: rgba(255, 255, 255, 0.66);
  font-size: 11px;
  line-height: 1.2;
}

.motion-debug-anomaly-panel header strong {
  color: rgba(255, 255, 255, 0.84);
}

.motion-debug-anomaly-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
}

.motion-debug-anomaly-button {
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

.motion-debug-anomaly-button:hover {
  border-color: rgba(255, 215, 130, 0.42);
  background: rgba(255, 205, 105, 0.12);
}

.motion-debug-anomaly-button:focus-visible {
  outline: 2px solid rgba(255, 215, 130, 0.55);
  outline-offset: 2px;
}

.motion-debug-anomaly-button strong,
.motion-debug-anomaly-button span {
  min-width: 0;
  overflow: hidden;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.motion-debug-anomaly-button strong {
  color: rgba(255, 245, 220, 0.92);
  font-size: 10.5px;
  font-weight: 700;
}

.motion-debug-anomaly-button span {
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

.background-debug-motion-actions,
.background-debug-motion-quick-actions,
.background-debug-motion-workspace-actions,
.background-debug-motion-replay-actions,
.background-debug-motion-replay-viewer-actions,
.background-debug-motion-replay-step-actions,
.background-debug-notice-actions,
.background-debug-live-actions {
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
.background-debug-live-actions .background-debug-button {
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
  .motion-debug-anomaly-grid {
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
