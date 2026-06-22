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
      <div
        :class="[
          'background-debug-tabs',
          debugTabCount === 3 && 'background-debug-tabs-three',
          debugTabCount === 4 && 'background-debug-tabs-four',
        ]"
        role="tablist"
        aria-label="Background debug sections"
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

      <div v-else-if="activePanel === 'motion' && canDebugMotion" class="background-debug-section">
        <label class="background-debug-toggle">
          <input
            name="motionRecordEnabled"
            type="checkbox"
            :checked="motionRecordEnabled"
            :disabled="motionReplayCaptureActive"
            @change="setMotionRecordEnabled($event.target.checked)"
          >
          <span>Record</span>
        </label>

        <label class="background-debug-toggle">
          <input
            name="motionOverlayEnabled"
            type="checkbox"
            :checked="motionOverlayEnabled"
            :disabled="motionReplayCaptureActive"
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
            :disabled="motionReplayCaptureActive"
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
            type="number"
            min="1"
            max="300"
            step="1"
            :disabled="motionReplayCaptureActive || motionWindowPreset !== MOTION_RECORD_WINDOW_CUSTOM"
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
            type="range"
            min="0"
            max="2"
            step="0.05"
            :disabled="motionReplayCaptureActive"
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

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Replay Viewer</div>
          <label class="background-debug-control background-debug-textarea-control">
            <span>
              Import JSON
              <output>{{ motionReplayImportStatus }}</output>
            </span>
            <textarea
              rows="3"
              spellcheck="false"
              :maxlength="MOTION_REPLAY_IMPORT_MAX_BYTES"
              :value="motionReplayImportText"
              @input="updateMotionReplayImportText"
            ></textarea>
          </label>
          <label class="background-debug-control background-debug-file-control">
            <span>
              Trace file
              <output>{{ motionReplayViewerLoaded ? "loaded" : "none" }}</output>
            </span>
            <input
              type="file"
              accept="application/json,.json"
              @change="importMotionReplayFile"
            >
          </label>
          <div class="background-debug-actions background-debug-motion-replay-viewer-actions">
            <button type="button" class="background-debug-button" @click="loadMotionReplayImportText">
              Load Trace
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayTrace"
              @click="loadCapturedMotionReplayTrace"
            >
              Load Captured
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="clearMotionReplayViewer"
            >
              Clear Viewer
            </button>
          </div>
          <div v-if="motionReplayImportError" class="background-debug-error" :title="motionReplayImportError">
            {{ motionReplayImportError }}
          </div>

          <dl class="background-debug-status-grid">
            <div
              v-for="row in motionReplayOverviewRows"
              :key="row.label"
              :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
            >
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>

          <label class="background-debug-control">
            <span>
              Scrub
              <output>{{ formatMotionReplayTime(motionReplayCurrentTimeMs) }}</output>
            </span>
            <input
              type="range"
              :min="motionReplayTimeRange.min"
              :max="motionReplayTimeRange.max"
              step="1"
              :disabled="!motionReplayViewerLoaded"
              :value="motionReplayCurrentTimeMs"
              @input="updateMotionReplayCurrentTime"
            >
          </label>

          <label class="background-debug-control background-debug-motion-filter-control">
            <span>
              Replay Filter
              <output>{{ motionReplayFilterSummary.text }}</output>
            </span>
            <input
              type="search"
              placeholder="target / lane / prop / event"
              :disabled="!motionReplayViewerLoaded"
              :value="motionReplayFilterQuery"
              @input="updateMotionReplayFilterQuery"
            >
          </label>

          <div class="background-debug-actions background-debug-motion-replay-viewer-actions">
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="toggleMotionReplayPlayback"
            >
              {{ motionReplayPlayButtonLabel }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="setMotionReplayCurrentTime(motionReplayTimeRange.min, { pause: true })"
            >
              Jump Start
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="copyMotionReplayInterval"
            >
              {{ motionReplayIntervalCopyButtonLabel }}
            </button>
          </div>

          <div class="background-debug-motion-replay-interval-grid">
            <label class="background-debug-control background-debug-number-control">
              <span>
                Interval start
                <output>{{ formatMotionReplayTime(motionReplayIntervalStartMs) }}</output>
              </span>
              <input
                type="number"
                step="1"
                :disabled="!motionReplayViewerLoaded"
                :value="motionReplayIntervalStartMs"
                @change="updateMotionReplayIntervalStart"
              >
            </label>
            <label class="background-debug-control background-debug-number-control">
              <span>
                Interval end
                <output>{{ formatMotionReplayTime(motionReplayIntervalEndMs) }}</output>
              </span>
              <input
                type="number"
                step="1"
                :disabled="!motionReplayViewerLoaded"
                :value="motionReplayIntervalEndMs"
                @change="updateMotionReplayIntervalEnd"
              >
            </label>
          </div>

          <div class="background-debug-motion-property-table" role="table" aria-label="Replay frame properties">
            <div class="background-debug-motion-property-row background-debug-motion-row-head" role="row">
              <span role="columnheader">target.prop</span>
              <span role="columnheader">value</span>
              <span role="columnheader">to</span>
              <span role="columnheader">delta</span>
              <span role="columnheader">velocity</span>
              <span role="columnheader">driver</span>
              <span role="columnheader">lane</span>
              <span role="columnheader">laneKey</span>
              <span role="columnheader">sourceLabel</span>
            </div>
            <div
              v-for="(row, index) in motionReplayFrameRows"
              :key="`${row.targetProp}-${row.laneKey}-${index}`"
              class="background-debug-motion-property-row"
              role="row"
            >
              <span role="cell" :title="row.targetProp">{{ row.targetProp }}</span>
              <span role="cell" :title="row.value">{{ row.value }}</span>
              <span role="cell" :title="row.to">{{ row.to }}</span>
              <span role="cell" :title="row.delta">{{ row.delta }}</span>
              <span role="cell" :title="row.velocity">{{ row.velocity }}</span>
              <span role="cell" :title="row.driver">{{ row.driver }}</span>
              <span role="cell" :title="row.lane">{{ row.lane }}</span>
              <span role="cell" :title="row.laneKey">{{ row.laneKey }}</span>
              <span role="cell" :title="row.sourceLabel">{{ row.sourceLabel }}</span>
            </div>
            <div v-if="motionReplayFrameRows.length === 0" class="background-debug-motion-empty">
              no replay frame values
            </div>
          </div>

          <div class="background-debug-motion-timeline">
            <button
              v-for="event in motionReplayEventRows"
              :key="event.key"
              type="button"
              :class="['background-debug-motion-replay-event', event.isCurrent && 'background-debug-motion-replay-event-current']"
              :title="event.detail"
              @click="setMotionReplayCurrentTime(event.timeMs, { pause: true })"
            >
              <span>{{ event.time }}</span>
              <span>{{ event.type }}</span>
              <span>{{ event.sourceLabel }}</span>
              <span>{{ event.detail }}</span>
            </button>
            <div v-if="motionReplayEventRows.length === 0" class="background-debug-motion-empty">
              no replay events
            </div>
          </div>

          <div class="background-debug-motion-curve-list">
            <section
              v-for="group in motionReplayCurveGroups"
              :key="group.key"
              class="background-debug-motion-curve-card"
            >
              <header>
                <strong :title="group.label">{{ group.label }}</strong>
                <span>{{ group.summary }}</span>
              </header>
              <div class="background-debug-motion-curve-meta">
                <span :title="group.laneLabel">{{ group.laneLabel }}</span>
                <span :title="group.sourceLabel">{{ group.sourceLabel }}</span>
                <span>{{ formatMotionReplayTime(motionReplayCurrentTimeMs) }}</span>
              </div>
              <div class="background-debug-motion-curve-row">
                <span>value/to/events</span>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path class="background-debug-motion-curve-grid" d="M 0 50 L 100 50" />
                  <path v-if="group.toPath" class="background-debug-motion-curve-to" :d="group.toPath" />
                  <path v-if="group.valuePath" class="background-debug-motion-curve-value" :d="group.valuePath" />
                  <line
                    v-for="marker in group.eventMarkers"
                    :key="`${group.key}-${marker.type}-${marker.x}`"
                    class="background-debug-motion-curve-event"
                    :x1="marker.x"
                    y1="5"
                    :x2="marker.x"
                    y2="95"
                  />
                  <line
                    class="background-debug-motion-replay-curve-cursor"
                    :x1="group.cursorX"
                    y1="0"
                    :x2="group.cursorX"
                    y2="100"
                  />
                </svg>
                <output>{{ group.rangeLabels.value }}</output>
              </div>
            </section>
            <div v-if="motionReplayCurveGroups.length === 0" class="background-debug-motion-empty">
              no replay curves
            </div>
          </div>

          <div class="background-debug-motion-replay-overlay-list">
            <article
              v-for="row in motionReplayOverlayRows"
              :key="row.key"
              class="background-debug-motion-replay-overlay-card"
            >
              <strong :title="row.label">{{ row.label }}</strong>
              <span :title="row.valueSummary">{{ row.valueSummary }}</span>
              <span :title="row.laneSummary">{{ row.propSummary }} / {{ row.laneSummary }}</span>
            </article>
            <div v-if="motionReplayOverlayRows.length === 0" class="background-debug-motion-empty">
              no replay overlay targets
            </div>
          </div>
        </div>

        <dl class="background-debug-status-grid">
          <div
            v-for="row in motionOverviewRows"
            :key="row.label"
            :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
          >
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Filters</div>
          <div class="background-debug-mode-group background-debug-motion-filter-group" role="group" aria-label="Motion filter presets">
            <button
              v-for="preset in MOTION_FILTER_PRESETS"
              :key="preset.value"
              type="button"
              :class="['background-debug-mode-button', motionFilterPreset === preset.value && 'background-debug-mode-button-active']"
              @click="setMotionFilterPreset(preset.value)"
            >
              {{ preset.label }}
            </button>
          </div>
          <label class="background-debug-control background-debug-motion-filter-control">
            <span>
              Filter
              <output>{{ motionFilterSummary.text }}</output>
            </span>
            <input
              type="search"
              placeholder="target / lane / prop / event"
              :value="motionFilterQuery"
              @input="updateMotionFilterQuery"
            >
          </label>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Layer Tree</div>
          <div class="background-debug-motion-layer-tree">
            <section
              v-for="row in motionLayerTreeRows"
              :key="row.key"
              class="background-debug-motion-timeline-group"
            >
              <header>
                <strong :title="row.layer">{{ row.layer }}</strong>
                <span>{{ row.summary }}</span>
              </header>
              <div class="background-debug-motion-layer-row">
                <span>{{ row.targetCount }} targets</span>
                <span>{{ row.activeCount }} active</span>
                <span>{{ row.warningCount }} warnings</span>
                <span>{{ row.eventCount }} events</span>
              </div>
              <div class="background-debug-motion-layer-row">
                <span :title="row.detail">{{ row.detail }}</span>
                <span :title="row.sources">{{ row.sources }}</span>
              </div>
            </section>
            <div v-if="motionLayerTreeRows.length === 0" class="background-debug-motion-empty">
              no matching layers
            </div>
          </div>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Properties</div>
          <div class="background-debug-motion-property-table" role="table" aria-label="Pixi motion properties">
            <div class="background-debug-motion-property-row background-debug-motion-row-head" role="row">
              <span role="columnheader">target.prop</span>
              <span role="columnheader">value</span>
              <span role="columnheader">to</span>
              <span role="columnheader">delta</span>
              <span role="columnheader">velocity</span>
              <span role="columnheader">driver</span>
              <span role="columnheader">lane</span>
              <span role="columnheader">laneKey</span>
              <span role="columnheader">sourceLabel</span>
            </div>
            <div
              v-for="(row, index) in motionPropertyRows"
              :key="`${row.targetProp}-${row.laneKey}-${index}`"
              class="background-debug-motion-property-row"
              role="row"
            >
              <span role="cell" :title="row.targetProp">{{ row.targetProp }}</span>
              <span role="cell" :title="row.value">{{ row.value }}</span>
              <span role="cell" :title="row.to">{{ row.to }}</span>
              <span role="cell" :title="row.delta">{{ row.delta }}</span>
              <span role="cell" :title="row.velocity">{{ row.velocity }}</span>
              <span role="cell" :title="row.driver">{{ row.driver }}</span>
              <span role="cell" :title="row.lane">{{ row.lane }}</span>
              <span role="cell" :title="row.laneKey">{{ row.laneKey }}</span>
              <span role="cell" :title="row.sourceLabel">{{ row.sourceLabel }}</span>
            </div>
            <div v-if="motionPropertyRows.length === 0" class="background-debug-motion-empty">
              no matching properties
            </div>
          </div>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Timeline</div>
          <div class="background-debug-motion-timeline">
            <section
              v-for="group in motionTimelineGroups"
              :key="group.key"
              class="background-debug-motion-timeline-group"
            >
              <header>
                <strong :title="group.label">{{ group.label }}</strong>
                <span>{{ group.events.length }} events</span>
              </header>
              <div
                v-for="event in group.events"
                :key="event.key"
                class="background-debug-motion-timeline-event"
                :title="event.detail"
              >
                <span>{{ event.time }}</span>
                <span>{{ event.type }}</span>
                <span>{{ event.prop }}</span>
                <span>{{ event.detail }}</span>
              </div>
            </section>
            <div v-if="motionTimelineGroups.length === 0" class="background-debug-motion-empty">
              no matching timeline events
            </div>
          </div>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Curve Chart</div>
          <div class="background-debug-motion-curve-list">
            <section
              v-for="group in motionCurveChartGroups"
              :key="group.key"
              class="background-debug-motion-curve-card"
            >
              <header>
                <strong :title="group.overlayLabel">{{ group.label }}</strong>
                <span>{{ group.summary }}</span>
              </header>
              <div class="background-debug-motion-curve-meta">
                <span :title="group.laneLabel">{{ group.laneLabel }}</span>
                <span :title="group.sourceLabel">{{ group.sourceLabel }}</span>
                <span>v {{ formatMotionChartStat(group.stats.maxVelocity) }}</span>
              </div>
              <div class="background-debug-motion-curve-row">
                <span>value/to/events</span>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path class="background-debug-motion-curve-grid" d="M 0 50 L 100 50" />
                  <path v-if="group.toPath" class="background-debug-motion-curve-to" :d="group.toPath" />
                  <path v-if="group.valuePath" class="background-debug-motion-curve-value" :d="group.valuePath" />
                  <line
                    v-for="marker in group.eventMarkers"
                    :key="`${group.key}-${marker.time}-${marker.type}`"
                    class="background-debug-motion-curve-event"
                    :x1="marker.x"
                    y1="5"
                    :x2="marker.x"
                    y2="95"
                  />
                </svg>
                <output>{{ group.rangeLabels.value }}</output>
              </div>
              <div class="background-debug-motion-curve-row">
                <span>delta</span>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path class="background-debug-motion-curve-grid" d="M 0 50 L 100 50" />
                  <path v-if="group.deltaPath" class="background-debug-motion-curve-delta" :d="group.deltaPath" />
                </svg>
                <output>{{ group.rangeLabels.delta }}</output>
              </div>
              <div class="background-debug-motion-curve-row">
                <span>velocity</span>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path class="background-debug-motion-curve-grid" d="M 0 50 L 100 50" />
                  <path v-if="group.velocityPath" class="background-debug-motion-curve-velocity" :d="group.velocityPath" />
                </svg>
                <output>{{ group.rangeLabels.velocity }}</output>
              </div>
            </section>
            <div v-if="motionCurveChartGroups.length === 0" class="background-debug-motion-empty">
              no matching curve samples
            </div>
          </div>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Active Animations</div>
          <div class="background-debug-motion-table" role="table" aria-label="Active Pixi motion animations">
            <div class="background-debug-motion-row background-debug-motion-row-head" role="row">
              <span role="columnheader">target</span>
              <span role="columnheader">prop</span>
              <span role="columnheader">value -> to</span>
              <span role="columnheader">driver</span>
              <span role="columnheader">lane</span>
              <span role="columnheader">velocity</span>
            </div>
            <div
              v-for="(row, index) in motionAnimationRows"
              :key="`${row.target}-${row.prop}-${row.lane}-${index}`"
              class="background-debug-motion-row"
              role="row"
            >
              <span role="cell" :title="row.target">{{ row.target }}</span>
              <span role="cell" :title="row.prop">{{ row.prop }}</span>
              <span role="cell" :title="row.valueTo">{{ row.valueTo }}</span>
              <span role="cell" :title="row.driver">{{ row.driver }}</span>
              <span role="cell" :title="row.lane">{{ row.lane }}</span>
              <span role="cell" :title="row.velocity">{{ row.velocity }}</span>
            </div>
            <div v-if="motionAnimationRows.length === 0" class="background-debug-motion-empty">
              no active animations
            </div>
          </div>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Top Cancel Reasons</div>
          <dl class="background-debug-diagnostics">
            <div
              v-for="row in motionCancelReasonRows"
              :key="row.key"
              class="background-debug-stat"
              :title="row.detail"
            >
              <dt>{{ row.key }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
        </div>

        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Warnings</div>
          <div class="background-debug-motion-list">
            <div
              v-for="row in motionWarningRows"
              :key="`${row.key}-${row.detail}`"
              class="background-debug-detail"
              :title="row.detail"
            >
              {{ row.detail }}
            </div>
          </div>
        </div>

        <div class="background-debug-actions background-debug-motion-actions">
          <button
            type="button"
            class="background-debug-button"
            :disabled="motionReplayCaptureActive"
            @click="clearMotionDebugHistory"
          >
            Clear
          </button>
          <button type="button" class="background-debug-button" @click="copyMotionReport('summary')">
            {{ motionSummaryCopyButtonLabel }}
          </button>
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
    ]"
    :style="motionWorkspaceStyle"
    aria-label="Motion debug workspace"
    @click.stop
    @contextmenu.stop
    @pointerdown.stop
    @wheel.stop
  >
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

    <div class="motion-debug-workspace-grid">
      <section
        v-for="region in motionWorkspaceRegions"
        :key="region.id"
        class="motion-debug-workspace-region"
      >
        <header>
          <strong>{{ region.label }}</strong>
          <span>{{ region.sections.length }} views</span>
        </header>
        <div class="motion-debug-workspace-section-list">
          <article
            v-for="section in region.sections"
            :key="section.id"
            class="motion-debug-workspace-section-row"
          >
            <strong>{{ section.label }}</strong>
            <span>{{ getMotionWorkspaceSectionStatus(section.id) }}</span>
          </article>
        </div>
      </section>
    </div>
  </aside>
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
  getMotionReplayTimeRange,
  assertMotionReplayImportSize,
  MOTION_REPLAY_IMPORT_MAX_BYTES,
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
  parseMotionReplayTraceJson,
} from "./backgroundDebug/motionReplayViewerModel.js";
import {
  closeMotionDebugWorkspace,
  createMotionDebugWorkspaceSession,
  MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX,
  MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN,
  MOTION_DEBUG_WORKSPACE_MODE_DOCK,
  MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN,
  MOTION_DEBUG_WORKSPACE_REGIONS,
  openMotionDebugWorkspace,
  resizeMotionDebugWorkspaceDock,
  setMotionDebugWorkspaceMode,
} from "./backgroundDebug/motionDebugWorkspaceModel.js";
import { createMotionDebugAIReport } from "../rendering/pixi/animation/motionDebugReport.js";
import {
  createMotionReplayCaptureController,
  normalizeMotionReplayCaptureSeconds,
} from "../rendering/pixi/animation/motionReplayTrace.js";
import { motionRuntime } from "../rendering/pixi/animation/motionRuntime.js";

const props = defineProps({
  desktopLayoutDebugParams: {
    type: Object,
    default: () => ({ ...DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS }),
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
const isCollapsed = ref(false);
const activePanel = ref("acrylic");
const canDebugLiveDesktop = computed(() => isLiveDesktopExperimentEnabled());
const canDebugMotion = computed(() => Boolean(import.meta.env.DEV));
const debugTabCount = computed(() => 2 + (canDebugMotion.value ? 1 : 0) + (canDebugLiveDesktop.value ? 1 : 0));
const hasCopiedAcrylic = ref(false);
const hasCopiedDiagnostics = ref(false);
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
const motionOverlayEnabled = ref(false);
const motionRecordEnabled = ref(false);
const motionWindowPreset = ref("30000");
const motionCustomSeconds = ref(30);
const motionTimeScale = ref(1);
const motionFilterPreset = ref("all");
const motionFilterQuery = ref("");
const motionReport = ref(motionRuntime.debugReport({ includeChannels: true, includeTargets: true }));
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
let liveDesktopRateSample = null;
let acrylicCopyStateTimer = null;
let diagnosticsCopyStateTimer = null;
let motionFullCopyStateTimer = null;
let motionRuntimePollTimer = null;
let motionReplayIntervalCopyStateTimer = null;
let motionReplayPlaybackLastTime = 0;
let motionReplayPlaybackTimer = null;
let motionReplayTraceCopyStateTimer = null;
let motionSummaryCopyStateTimer = null;
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

const MOTION_WORKSPACE_SECTION_LABELS = {
  "ai-export": "AI Export",
  curves: "Curves",
  filters: "Filters",
  inspector: "Inspector",
  "event-track": "Event Track",
  "lane-breakdown": "Lane Breakdown",
  "layer-tree": "Layer Tree",
  pins: "Pins",
  properties: "Properties",
  "replay-scrubber": "Replay Scrubber",
  "target-tree": "Target Tree",
  timeline: "Timeline",
  warnings: "Warnings",
};

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
const motionFullCopyButtonLabel = computed(() => (hasCopiedMotionFull.value ? "已复制" : "Copy Full Report"));
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
const motionOverviewRows = computed(() => buildMotionOverviewRows(motionReport.value));
const motionAnimationRows = computed(() => buildMotionAnimationRows(motionReport.value));
const motionCancelReasonRows = computed(() => buildMotionCancelReasonRows(motionReport.value));
const motionWarningRows = computed(() => buildMotionWarningRows(motionReport.value));
const motionWindowSeconds = computed(() => resolveMotionRecordWindowMs(motionWindowPreset.value, motionCustomSeconds.value) / 1000);
const motionFilters = computed(() => ({
  preset: motionFilterPreset.value,
  query: motionFilterQuery.value,
}));
const motionFilterSummary = computed(() => buildMotionFilterSummary(motionReport.value, motionFilters.value));
const motionLayerTreeRows = computed(() => buildMotionLayerTreeRows(motionReport.value, motionFilters.value));
const motionPropertyRows = computed(() => buildMotionPropertyRows(motionReport.value, motionFilters.value));
const motionTimelineGroups = computed(() => buildMotionTimelineGroups(motionReport.value, motionFilters.value));
const motionCurveChartGroups = computed(() => buildMotionCurveChartGroups(motionReport.value, motionFilters.value));
const motionReplayCaptureRows = computed(() => buildMotionReplayCaptureRows(motionReplayCaptureStatus.value, motionReplayTrace.value));
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
  ? buildMotionReplayOverlayRows(motionReplayViewerTrace.value, motionReplayCurrentTimeMs.value, motionReplayFilters.value)
  : []);
const motionWorkspaceOpen = computed(() => canDebugMotion.value && motionWorkspaceSession.value.isOpen);
const motionWorkspaceFullscreen = computed(() => motionWorkspaceSession.value.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN);
const motionWorkspaceDockWidthPx = computed(() => motionWorkspaceSession.value.dockWidthPx);
const motionWorkspaceModeLabel = computed(() => (motionWorkspaceFullscreen.value ? "Fullscreen" : "Dock"));
const motionWorkspaceStyle = computed(() => (motionWorkspaceFullscreen.value
  ? undefined
  : { width: `${motionWorkspaceDockWidthPx.value}px` }));
const motionWorkspaceRegions = computed(() => MOTION_DEBUG_WORKSPACE_REGIONS.map((region) => ({
  ...region,
  sections: region.sections.map((id) => ({
    id,
    label: MOTION_WORKSPACE_SECTION_LABELS[id] || id,
  })),
})));

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

function getMotionWorkspaceViewportWidth() {
  return typeof window === "undefined" ? undefined : window.innerWidth;
}

function formatMotionWorkspaceTarget(target) {
  if (!target) return "none";
  return target.label || target.sourceLabel || target.layer || target.kind || `target ${target.targetId ?? "-"}`;
}

function formatMotionWorkspaceTrack(track) {
  if (!track) return "none";
  return `${track.prop || "unknown"} / ${track.lane || "base"}`;
}

function getMotionWorkspaceSectionStatus(id) {
  switch (id) {
    case "ai-export":
      return "summary / full";
    case "curves":
      return `${motionCurveChartGroups.value.length} curves`;
    case "event-track":
      return `${motionReplayEventRows.value.length} events`;
    case "filters":
      return motionFilterSummary.value.text;
    case "inspector":
      return formatMotionWorkspaceTarget(motionWorkspaceSession.value.selectedTarget);
    case "lane-breakdown":
      return formatMotionWorkspaceTrack(motionWorkspaceSession.value.selectedTrack);
    case "layer-tree":
      return `${motionLayerTreeRows.value.length} groups`;
    case "pins":
      return `${motionWorkspaceSession.value.pinnedTargets.length} pinned`;
    case "properties":
      return `${motionPropertyRows.value.length} rows`;
    case "replay-scrubber":
      return motionReplayViewerLoaded.value ? formatMotionReplayTime(motionReplayCurrentTimeMs.value) : "no replay";
    case "target-tree":
      return `${motionAnimationRows.value.length} active`;
    case "timeline":
      return `${motionTimelineGroups.value.length} tracks`;
    case "warnings":
      return `${motionWarningRows.value.length} warnings`;
    default:
      return "-";
  }
}

function formatEffectLabel(effect) {
  if (effect === BACKGROUND_EFFECT_ACRYLIC_WEBGL) return "acrylic";
  if (effect === BACKGROUND_EFFECT_BLUR) return "blur";
  return effect;
}

function refreshMotionReport() {
  if (!canDebugMotion.value) return;
  motionReport.value = motionRuntime.debugReport({
    includeChannels: true,
    includeHistory: true,
    includeTargets: true,
  });
}

function applyMotionRuntimeDebugConfig() {
  if (!canDebugMotion.value) return;
  if (motionReplayCaptureActive.value) {
    refreshMotionReport();
    return;
  }
  const config = buildMotionRuntimeDebugConfig({
    customSeconds: motionCustomSeconds.value,
    overlayEnabled: motionOverlayEnabled.value,
    recordEnabled: motionRecordEnabled.value,
    timeScale: motionTimeScale.value,
    windowPreset: motionWindowPreset.value,
  });
  motionCustomSeconds.value = normalizeMotionCustomSeconds(motionCustomSeconds.value);
  motionTimeScale.value = config.timeScale;
  motionRuntime.configureDebug(config);
  refreshMotionReport();
}

function restoreMotionTimeScale() {
  if (!canDebugMotion.value) return;
  if (motionTimeScale.value !== 1) motionTimeScale.value = 1;
  motionRuntime.configureDebug({ timeScale: 1 });
  refreshMotionReport();
}

function restoreMotionOverlay() {
  if (!canDebugMotion.value) return;
  if (motionOverlayEnabled.value) motionOverlayEnabled.value = false;
  motionRuntime.configureDebug({ overlayEnabled: false });
  refreshMotionReport();
}

function setMotionRecordEnabled(enabled) {
  motionRecordEnabled.value = Boolean(enabled);
  applyMotionRuntimeDebugConfig();
}

function setMotionOverlayEnabled(enabled) {
  motionOverlayEnabled.value = Boolean(enabled);
  applyMotionRuntimeDebugConfig();
}

function setMotionWindowPreset(preset) {
  motionWindowPreset.value = MOTION_RECORD_WINDOW_PRESETS.some((entry) => entry.value === preset)
    ? preset
    : "30000";
  applyMotionRuntimeDebugConfig();
}

function setMotionFilterPreset(preset) {
  motionFilterPreset.value = normalizeMotionFilterPreset(preset);
}

function updateMotionFilterQuery(event) {
  motionFilterQuery.value = event.target.value;
}

function updateMotionCustomSeconds(event) {
  motionCustomSeconds.value = normalizeMotionCustomSeconds(event.target.value);
  applyMotionRuntimeDebugConfig();
}

function updateMotionTimeScale(event) {
  motionTimeScale.value = normalizeMotionTimeScale(event.target.value);
  applyMotionRuntimeDebugConfig();
}

function openMotionWorkspace(mode = MOTION_DEBUG_WORKSPACE_MODE_DOCK) {
  if (!canDebugMotion.value) return;
  isCollapsed.value = false;
  activePanel.value = "motion";
  motionWorkspaceSession.value = openMotionDebugWorkspace(motionWorkspaceSession.value, {
    mode,
    viewportWidth: getMotionWorkspaceViewportWidth(),
  });
}

function closeMotionWorkspace() {
  motionWorkspaceSession.value = closeMotionDebugWorkspace(motionWorkspaceSession.value);
}

function setMotionWorkspaceMode(mode) {
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
  motionWorkspaceSession.value = resizeMotionDebugWorkspaceDock(motionWorkspaceSession.value, event.target.value, {
    viewportWidth: getMotionWorkspaceViewportWidth(),
  });
}

function clearMotionDebugHistory() {
  if (!canDebugMotion.value) return;
  if (motionReplayCaptureActive.value) return;
  motionRuntime.clearDebugHistory();
  refreshMotionReport();
}

function updateMotionReplayCaptureSeconds(event) {
  motionReplayCaptureSeconds.value = normalizeMotionReplayCaptureSeconds(event.target.value);
}

function syncMotionControlsFromRuntimeConfig() {
  const config = motionRuntime.configureDebug();
  motionOverlayEnabled.value = Boolean(config.overlayEnabled);
  motionRecordEnabled.value = Boolean(config.recordHistory);
  motionTimeScale.value = normalizeMotionTimeScale(config.timeScale);
}

function startMotionReplayCapture() {
  if (!canDebugMotion.value || motionReplayCaptureActive.value) return;
  motionReplayCaptureSeconds.value = normalizeMotionReplayCaptureSeconds(motionReplayCaptureSeconds.value);
  motionReplayTrace.value = null;
  motionReplayTraceJson.value = "";
  hasCopiedMotionReplayTrace.value = false;
  motionReplayCaptureStatus.value = motionReplayCapture.start({
    seconds: motionReplayCaptureSeconds.value,
  });
  refreshMotionReport();
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
  refreshMotionReport();
  return result;
}

function syncMotionReplayIntervalToRange(trace) {
  const range = trace ? getMotionReplayTimeRange(trace) : { max: 0, min: 0 };
  motionReplayIntervalStartMs.value = Number(range.min) || 0;
  motionReplayIntervalEndMs.value = Number(range.max) || 0;
}

function setMotionReplayCurrentTime(timeMs, options = {}) {
  if (!motionReplayViewerTrace.value) return;
  if (options.pause) stopMotionReplayPlayback();
  motionReplayCurrentTimeMs.value = normalizeMotionReplayTime(motionReplayViewerTrace.value, timeMs);
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
    syncMotionReplayIntervalToRange(normalized);
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

function updateMotionReplayFilterQuery(event) {
  motionReplayFilterQuery.value = event.target.value;
}

function updateMotionReplayIntervalStart(event) {
  if (!motionReplayViewerTrace.value) return;
  motionReplayIntervalStartMs.value = normalizeMotionReplayTime(motionReplayViewerTrace.value, event.target.value);
}

function updateMotionReplayIntervalEnd(event) {
  if (!motionReplayViewerTrace.value) return;
  motionReplayIntervalEndMs.value = normalizeMotionReplayTime(motionReplayViewerTrace.value, event.target.value);
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
      motionReplayCurrentTimeMs.value = normalizeMotionReplayTime(motionReplayViewerTrace.value, currentRange.max);
      stopMotionReplayPlayback();
      return;
    }
    motionReplayCurrentTimeMs.value = normalizeMotionReplayTime(motionReplayViewerTrace.value, nextTime);
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
    refreshMotionReport();
  } catch (error) {
    console.warn("Failed to copy Pixi motion debug report", error);
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
  if (
    typeof window === "undefined"
    || !canDebugMotion.value
    || isCollapsed.value
    || activePanel.value !== "motion"
  ) {
    stopMotionReplayPlayback();
    stopMotionReplayCapture();
    restoreMotionTimeScale();
    return;
  }
  applyMotionRuntimeDebugConfig();
  motionRuntimePollTimer = window.setInterval(refreshMotionReport, 500);
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

watch(canDebugMotion, (enabled) => {
  if (enabled) return;
  closeMotionWorkspace();
  if (activePanel.value === "motion") activePanel.value = "acrylic";
}, { immediate: true });

watch([isCollapsed, activePanel, canDebugLiveDesktop], restartLiveDesktopRuntimePoller, { flush: "post" });
watch([isCollapsed, activePanel, canDebugMotion], restartMotionRuntimePoller, { flush: "post" });

onMounted(() => {
  restartLiveDesktopRuntimePoller();
  restartMotionRuntimePoller();
});

onBeforeUnmount(() => {
  if (acrylicCopyStateTimer != null) window.clearTimeout(acrylicCopyStateTimer);
  if (diagnosticsCopyStateTimer != null) window.clearTimeout(diagnosticsCopyStateTimer);
  if (motionFullCopyStateTimer != null) window.clearTimeout(motionFullCopyStateTimer);
  if (motionReplayIntervalCopyStateTimer != null) window.clearTimeout(motionReplayIntervalCopyStateTimer);
  if (motionReplayTraceCopyStateTimer != null) window.clearTimeout(motionReplayTraceCopyStateTimer);
  if (motionSummaryCopyStateTimer != null) window.clearTimeout(motionSummaryCopyStateTimer);
  if (kawaseLiveDesktopSyncTimer != null) window.clearTimeout(kawaseLiveDesktopSyncTimer);
  stopMotionReplayPlayback();
  stopMotionReplayCapture();
  restoreMotionTimeScale();
  restoreMotionOverlay();
  clearMotionRuntimePoller();
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

.background-debug-tabs-three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.background-debug-tabs-four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  padding: 7px 0 2px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
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

.background-debug-motion-replay-interval-grid,
.background-debug-motion-replay-overlay-list {
  display: grid;
  gap: 6px;
  min-width: 0;
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
.background-debug-motion-workspace-actions,
.background-debug-motion-replay-actions,
.background-debug-motion-replay-viewer-actions,
.background-debug-live-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  justify-content: stretch;
}

.background-debug-motion-actions .background-debug-button,
.background-debug-motion-workspace-actions .background-debug-button,
.background-debug-motion-replay-actions .background-debug-button,
.background-debug-motion-replay-viewer-actions .background-debug-button,
.background-debug-live-actions .background-debug-button {
  width: 100%;
}

.background-debug-motion-workspace-actions {
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

  .motion-debug-workspace-toolbar,
  .motion-debug-workspace-toolbar-actions,
  .motion-debug-workspace-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .motion-debug-workspace-grid {
    overflow: auto;
  }
}

@media (max-width: 760px) {
  .background-debug-panel {
    right: 14px;
    bottom: 14px;
    width: calc(100vw - 28px);
  }
}
</style>
