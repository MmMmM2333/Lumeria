<template>
      <section class="motion-debug-workspace-region">
        <header>
          <strong>{{ t("debug.motion.sections.timeline") }}</strong>
          <span>{{ motionTrackChartHeaderLabel }}</span>
        </header>
        <div class="motion-debug-workspace-section-list">
        <div class="background-debug-subsection motion-debug-track-chart-section">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.trackChart") }}</div>
          <div class="motion-debug-track-chart-toolbar">
            <div class="background-debug-mode-group motion-debug-track-chart-mode-group" role="group" :aria-label="t('debug.motion.aria.trackMode')">
              <button
                type="button"
                :class="[
                  'background-debug-mode-button',
                  motionTrackChartDisplayMode === MOTION_TRACK_CHART_DISPLAY_RAW && 'background-debug-mode-button-active',
                ]"
                @click="setMotionTrackChartDisplayMode(MOTION_TRACK_CHART_DISPLAY_RAW)"
              >
                {{ t("debug.motion.chart.raw") }}
              </button>
              <button
                type="button"
                :class="[
                  'background-debug-mode-button',
                  motionTrackChartDisplayMode === MOTION_TRACK_CHART_DISPLAY_NORMALIZED && 'background-debug-mode-button-active',
                ]"
                @click="setMotionTrackChartDisplayMode(MOTION_TRACK_CHART_DISPLAY_NORMALIZED)"
              >
                {{ t("debug.motion.chart.normalized") }}
              </button>
            </div>
            <div class="motion-debug-track-chart-series-controls" role="group" :aria-label="t('debug.motion.aria.trackSeries')">
              <label
                v-for="option in motionTrackChartSeriesOptions"
                :key="option.key"
                class="background-debug-toggle motion-debug-track-chart-series-toggle"
              >
                <input
                  :name="`motionTrackChartSeries-${option.key}`"
                  type="checkbox"
                  :checked="motionTrackChartSeriesVisibility[option.key]"
                  @change="toggleMotionTrackChartSeries(option.key, $event)"
                >
                <span>{{ t(option.labelKey) }}</span>
              </label>
            </div>
          </div>

          <div v-if="motionTrackChartModel" class="motion-debug-track-chart-window-controls">
            <label class="background-debug-control background-debug-number-control motion-debug-track-chart-window-control">
              <span>
                {{ t("debug.motion.chart.zoomStart") }}
                <output>{{ formatMotionReplayTime(motionTrackChartZoomWindow.startMs) }}</output>
              </span>
              <input
                name="motionTrackChartZoomStartMs"
                type="number"
                step="1"
                :min="motionReplayTimeRange.min"
                :max="motionReplayTimeRange.max"
                :value="motionTrackChartZoomWindow.startMs"
                @change="updateMotionTrackChartZoomStart"
              >
            </label>
            <label class="background-debug-control background-debug-number-control motion-debug-track-chart-window-control">
              <span>
                {{ t("debug.motion.chart.zoomEnd") }}
                <output>{{ formatMotionReplayTime(motionTrackChartZoomWindow.endMs) }}</output>
              </span>
              <input
                name="motionTrackChartZoomEndMs"
                type="number"
                step="1"
                :min="motionReplayTimeRange.min"
                :max="motionReplayTimeRange.max"
                :value="motionTrackChartZoomWindow.endMs"
                @change="updateMotionTrackChartZoomEnd"
              >
            </label>
            <div class="background-debug-actions motion-debug-track-chart-window-actions">
              <button
                type="button"
                class="background-debug-button"
                :disabled="!motionTrackChartIntervalActive"
                @click="zoomMotionTrackChartToInterval"
              >
                {{ t("debug.motion.actions.zoomSelection") }}
              </button>
              <button
                type="button"
                class="background-debug-button"
                :disabled="!motionTrackChartZoomActive"
                @click="resetMotionTrackChartZoom"
              >
                {{ t("debug.motion.actions.resetZoom") }}
              </button>
            </div>
          </div>

          <dl v-if="motionTrackChartModel" class="background-debug-status-grid motion-debug-track-chart-summary">
            <div
              v-for="row in motionTrackChartSummaryRows"
              :key="row.label"
              :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
            >
              <dt>{{ row.label }}</dt>
              <dd :title="row.value">{{ row.value }}</dd>
            </div>
          </dl>

          <div v-if="motionTrackChartModel" class="motion-debug-finding-panel">
            <header>
              <strong>{{ t("debug.motion.sections.findings") }}</strong>
              <span :title="motionReplayFindingStatusLabel">{{ motionReplayFindingStatusLabel }}</span>
            </header>
            <div
              v-if="motionReplayFindingRows.length"
              class="motion-debug-finding-grid"
              role="group"
              :aria-label="t('debug.motion.aria.findings')"
            >
              <button
                v-for="finding in motionReplayFindingRows"
                :key="finding.id"
                type="button"
                :class="['motion-debug-finding-button', `motion-debug-finding-button-${finding.severity}`]"
                :title="finding.message"
                @click="jumpMotionReplayFinding(finding)"
              >
                <strong>{{ finding.title }}</strong>
                <span>{{ finding.location.timeLabel }} / {{ finding.location.track.prop }} / {{ finding.location.track.lane }}</span>
                <span>{{ finding.observations[0]?.message || finding.message }}</span>
              </button>
            </div>
            <div v-else class="background-debug-motion-empty">
              {{ t("debug.motion.empty.noFindings") }}
            </div>
          </div>

          <div v-if="motionTrackChartModel" class="motion-debug-track-chart-axis" aria-hidden="true">
            <span
              v-for="tick in motionTrackChartModel.axis.ticks"
              :key="`${tick.timeMs}-${tick.x}`"
              :style="{ left: `${tick.x}%` }"
            >
              {{ tick.label }}
            </span>
          </div>

          <div v-if="motionTrackChartModel" class="motion-debug-track-chart-list">
            <section
              v-for="track in motionTrackChartModel.tracks"
              :key="track.key"
              :class="[
                'motion-debug-track-chart-row',
                track.isSelected && 'background-debug-motion-selected',
              ]"
            >
              <button
                type="button"
                class="motion-debug-track-chart-track-button"
                @click="selectMotionTrackChartTrack(track)"
              >
                <span class="motion-debug-track-chart-row-header">
                  <strong :title="track.targetProp">{{ track.targetProp }}</strong>
                  <span>{{ track.summary }}</span>
                </span>
              </button>
              <div class="motion-debug-track-chart-row-meta">
                <span :title="track.laneLabel">{{ track.laneLabel }}</span>
                <span :title="track.sourceLabel">{{ track.sourceLabel }}</span>
                <span>{{ t("debug.motion.chart.maxVelocity", { value: formatMotionTrackChartValue(track.stats.maxAbsVelocity) }) }}</span>
                <span>{{ t("debug.motion.chart.maxDelta", { value: formatMotionTrackChartValue(track.stats.maxAbsDelta) }) }}</span>
              </div>
              <div class="motion-debug-track-chart-current">
                <span>{{ t("debug.motion.chart.currentValue", { value: formatMotionTrackChartValue(track.current?.value) }) }}</span>
                <span>{{ t("debug.motion.chart.targetValue", { value: formatMotionTrackChartValue(track.current?.to) }) }}</span>
                <span>{{ t("debug.motion.chart.delta", { value: formatMotionTrackChartValue(track.current?.delta) }) }}</span>
                <span>{{ t("debug.motion.chart.velocity", { value: formatMotionTrackChartValue(track.current?.velocity) }) }}</span>
              </div>
              <div class="motion-debug-track-chart-activity" aria-hidden="true">
                <span
                  :style="{
                    left: `${track.timeline.startX}%`,
                    width: `${track.timeline.width}%`,
                  }"
                ></span>
              </div>
              <div
                :class="[
                  'motion-debug-track-chart-plot',
                  motionTrackChartBrushPointerId != null && 'motion-debug-track-chart-plot-brushing',
                ]"
                @pointermove="updateMotionTrackChartPointer"
                @pointerdown="startMotionTrackChartBrush"
                @pointerup="endMotionTrackChartBrush"
                @pointercancel="cancelMotionTrackChartBrush"
              >
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <rect
                    v-if="motionTrackChartIntervalOverlay.active"
                    class="motion-debug-track-chart-brush-range"
                    :x="motionTrackChartIntervalOverlay.x"
                    y="0"
                    :width="motionTrackChartIntervalOverlay.width"
                    height="100"
                  />
                  <line
                    v-for="tick in motionTrackChartModel.axis.ticks"
                    :key="`${track.key}-tick-${tick.timeMs}-${tick.x}`"
                    class="motion-debug-track-chart-axis-line"
                    :x1="tick.x"
                    y1="0"
                    :x2="tick.x"
                    y2="100"
                  />
                  <path class="background-debug-motion-curve-grid" d="M 0 50 L 100 50" />
                  <template v-for="seriesKey in track.visibleSeries" :key="`${track.key}-${seriesKey}`">
                    <path
                      v-if="track.series[seriesKey].path"
                      :class="[
                        'motion-debug-track-chart-series',
                        `motion-debug-track-chart-series-${seriesKey}`,
                      ]"
                      :d="track.series[seriesKey].path"
                    />
                  </template>
                  <line
                    v-for="marker in track.eventMarkers"
                    :key="`${track.key}-${marker.type}-${marker.timeMs}-${marker.x}`"
                    class="background-debug-motion-curve-event"
                    :x1="marker.x"
                    y1="5"
                    :x2="marker.x"
                    y2="95"
                  >
                    <title>{{ marker.detail }}</title>
                  </line>
                  <line
                    class="background-debug-motion-replay-curve-cursor"
                    :x1="motionTrackChartModel.cursor.x"
                    y1="0"
                    :x2="motionTrackChartModel.cursor.x"
                    y2="100"
                  />
                </svg>
              </div>
              <div class="motion-debug-track-chart-event-list" v-if="track.eventMarkers.length">
                <button
                  v-for="marker in track.eventMarkers"
                  :key="`${track.key}-event-${marker.type}-${marker.timeMs}`"
                  type="button"
                  class="motion-debug-track-chart-event-button"
                  :title="marker.detail"
                  @click.stop="selectMotionTrackChartEvent(track, marker)"
                >
                  <span>{{ marker.type }}</span>
                  <span>{{ formatMotionReplayTime(marker.timeMs) }}</span>
                </button>
              </div>
              <div class="motion-debug-track-chart-ranges">
                <span
                  v-for="option in motionTrackChartSeriesOptions"
                  :key="`${track.key}-range-${option.key}`"
                  :title="track.rangeLabels[option.key]"
                >
                  {{ t(option.labelKey) }} {{ track.rangeLabels[option.key] }}
                </span>
              </div>
            </section>
            <div v-if="motionTrackChartModel.tracks.length === 0" class="background-debug-motion-empty">
              {{ t("debug.motion.empty.noReplayTracks") }}
            </div>
            <div v-if="motionTrackChartModel.limits.tracksLimited" class="background-debug-motion-empty">
              {{ t("debug.motion.counts.visibleTracks", { visible: motionTrackChartModel.summary.visibleTrackCount, total: motionTrackChartModel.summary.trackCount }) }}
            </div>
          </div>
          <div v-else class="background-debug-motion-empty">
            {{ t("debug.motion.empty.loadReplayTracks") }}
          </div>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.replayViewer") }}</div>
          <label class="background-debug-control background-debug-textarea-control">
            <span>
              {{ t("debug.motion.actions.importJson") }}
              <output>{{ motionReplayImportStatus }}</output>
            </span>
            <textarea
              name="motionReplayImportText"
              rows="3"
              spellcheck="false"
              :maxlength="MOTION_REPLAY_IMPORT_MAX_BYTES"
              :value="motionReplayImportText"
              @input="updateMotionReplayImportText"
            ></textarea>
          </label>
          <label class="background-debug-control background-debug-file-control">
            <span>
              {{ t("debug.motion.replay.traceFile") }}
              <output>{{ t(motionReplayViewerLoaded ? "debug.motion.replay.loaded" : "debug.common.none") }}</output>
            </span>
            <input
              name="motionReplayTraceFile"
              type="file"
              accept="application/json,.json"
              @change="importMotionReplayFile"
            >
          </label>
          <div class="background-debug-actions background-debug-motion-replay-viewer-actions">
            <button type="button" class="background-debug-button" @click="loadMotionReplayImportText">
              {{ t("debug.motion.actions.loadTrace") }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayCaptureAvailable"
              @click="loadCapturedMotionReplayTrace"
            >
              {{ t("debug.motion.actions.loadCurrentCapture") }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="clearMotionReplayViewer"
            >
              {{ t("debug.motion.actions.clearViewer") }}
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
              {{ t("debug.motion.replay.timeCursor") }}
              <output>{{ formatMotionReplayTime(motionReplayCurrentTimeMs) }}</output>
            </span>
            <input
              name="motionReplayScrub"
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
              {{ t("debug.motion.replay.filter") }}
              <output>{{ motionReplayFilterSummary.text }}</output>
            </span>
            <input
              name="motionReplayFilterQuery"
              type="search"
              :placeholder="t('debug.motion.searchPlaceholder')"
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
              {{ t("debug.motion.actions.jumpStart") }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="setMotionReplayCurrentTime(motionReplayTimeRange.max, { pause: true })"
            >
              {{ t("debug.motion.actions.jumpEnd") }}
            </button>
          </div>

          <div class="background-debug-actions background-debug-motion-replay-step-actions">
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="stepMotionReplayFrame('previous')"
            >
              {{ t("debug.motion.actions.previousFrame") }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="stepMotionReplayFrame('next')"
            >
              {{ t("debug.motion.actions.nextFrame") }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="stepMotionReplayEvent('previous')"
            >
              {{ t("debug.motion.actions.previousEvent") }}
            </button>
            <button
              type="button"
              class="background-debug-button"
              :disabled="!motionReplayViewerLoaded"
              @click="stepMotionReplayEvent('next')"
            >
              {{ t("debug.motion.actions.nextEvent") }}
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
                {{ t("debug.motion.replay.selectionStart") }}
                <output>{{ formatMotionReplayTime(motionReplayIntervalStartMs) }}</output>
              </span>
              <input
                name="motionReplayIntervalStartMs"
                type="number"
                step="1"
                :disabled="!motionReplayViewerLoaded"
                :value="motionReplayIntervalStartMs"
                @change="updateMotionReplayIntervalStart"
              >
            </label>
            <label class="background-debug-control background-debug-number-control">
              <span>
                {{ t("debug.motion.replay.selectionEnd") }}
                <output>{{ formatMotionReplayTime(motionReplayIntervalEndMs) }}</output>
              </span>
              <input
                name="motionReplayIntervalEndMs"
                type="number"
                step="1"
                :disabled="!motionReplayViewerLoaded"
                :value="motionReplayIntervalEndMs"
                @change="updateMotionReplayIntervalEnd"
              >
            </label>
          </div>

          <div class="background-debug-motion-replay-bookmarks">
            <header>
              <strong>{{ t("debug.motion.sections.bookmarks") }}</strong>
              <span>{{ motionReplayBookmarkStatusLabel }}</span>
            </header>
            <div class="background-debug-actions background-debug-motion-bookmark-actions">
              <button
                type="button"
                class="background-debug-button"
                :disabled="!motionReplayBookmarkCanSave"
                @click="saveMotionReplayBookmark"
              >
                {{ t("debug.motion.actions.saveBookmark") }}
              </button>
              <button
                type="button"
                class="background-debug-button"
                :disabled="motionReplayBookmarkRows.length === 0"
                @click="clearMotionReplayBookmarks"
              >
                {{ t("debug.motion.actions.clearBookmarks") }}
              </button>
            </div>
            <div class="background-debug-motion-bookmark-list">
              <article
                v-for="bookmark in motionReplayBookmarkRows"
                :key="bookmark.id"
                class="background-debug-motion-bookmark-card"
              >
                <div class="background-debug-motion-bookmark-main">
                  <strong :title="bookmark.label">{{ bookmark.label }}</strong>
                  <span :title="formatMotionReplayBookmarkMeta(bookmark)">
                    {{ formatMotionReplayBookmarkMeta(bookmark) }}
                  </span>
                </div>
                <div class="background-debug-actions background-debug-motion-bookmark-row-actions">
                  <button
                    type="button"
                    class="background-debug-button"
                    :disabled="!motionReplayViewerLoaded"
                    @click="applyMotionReplayBookmark(bookmark)"
                  >
                    {{ t("debug.common.apply") }}
                  </button>
                  <button
                    type="button"
                    class="background-debug-button"
                    :disabled="!motionReplayViewerLoaded"
                    @click="copyMotionFocusedDebugExport(bookmark)"
                  >
                    {{ t("debug.motion.actions.exportFocused") }}
                  </button>
                  <button
                    type="button"
                    class="background-debug-button"
                    @click="deleteMotionReplayBookmark(bookmark)"
                  >
                    {{ t("debug.common.delete") }}
                  </button>
                </div>
              </article>
              <div v-if="motionReplayBookmarkRows.length === 0" class="background-debug-motion-empty">
                {{ t("debug.motion.empty.noBookmarks") }}
              </div>
            </div>
          </div>

          <div class="background-debug-motion-property-table" role="table" :aria-label="t('debug.motion.aria.replayProperties')">
            <div class="background-debug-motion-property-row background-debug-motion-row-head" role="row">
              <span role="columnheader">{{ t("debug.motion.fields.targetProp") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.currentValue") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.targetValue") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.delta") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.velocity") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.driver") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.lane") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.laneKey") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.sourceLabel") }}</span>
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
              {{ t("debug.motion.empty.noReplayProperties") }}
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
              {{ t("debug.motion.empty.noReplayEvents") }}
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
                <span>{{ t("debug.motion.values.currentTargetEvent") }}</span>
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
              {{ t("debug.motion.empty.noReplayCurves") }}
            </div>
          </div>

          <div class="background-debug-motion-replay-overlay-list">
            <article
              v-for="row in motionReplayOverlayRows"
              :key="row.key"
              :class="[
                'background-debug-motion-replay-overlay-card',
                'background-debug-motion-selectable',
                row.isSelected && 'background-debug-motion-selected',
              ]"
              role="button"
              tabindex="0"
              @click="selectMotionWorkspaceReplayOverlay(row)"
              @keydown.enter.prevent="selectMotionWorkspaceReplayOverlay(row)"
              @keydown.space.prevent="selectMotionWorkspaceReplayOverlay(row)"
            >
              <strong :title="row.label">{{ row.label }}</strong>
              <span :title="row.sourceLabel || row.kind || row.layer">
                {{ row.sourceLabel || row.kind || row.layer || t("debug.motion.values.targetFallback") }}
              </span>
              <span :title="row.valueSummary">{{ row.valueSummary }}</span>
              <span :title="row.laneSummary">{{ row.propSummary }} / {{ row.laneSummary }}</span>
              <span>{{ t("debug.motion.counts.values", { count: row.valueCount }) }}</span>
            </article>
            <div v-if="motionReplayOverlayRows.length === 0" class="background-debug-motion-empty">
              {{ t("debug.motion.empty.noReplayTargets") }}
            </div>
          </div>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.eventTimeline") }}</div>
          <div class="background-debug-motion-timeline">
            <section
              v-for="group in motionTimelineGroups"
              :key="group.key"
              :class="[
                'background-debug-motion-timeline-group',
                'background-debug-motion-selectable',
                isMotionWorkspaceTrackSelected(group) && 'background-debug-motion-selected',
              ]"
              role="button"
              tabindex="0"
              @click="selectMotionWorkspaceTrack(group)"
              @keydown.enter.prevent="selectMotionWorkspaceTrack(group)"
              @keydown.space.prevent="selectMotionWorkspaceTrack(group)"
            >
              <header>
                <strong :title="group.label">{{ group.label }}</strong>
                <span>{{ t("debug.motion.counts.events", { count: group.events.length }) }}</span>
              </header>
              <div
                v-for="event in group.events"
                :key="event.key"
                :class="[
                  'background-debug-motion-timeline-event',
                  'background-debug-motion-selectable',
                  isMotionWorkspaceTimelineEventSelected(event) && 'background-debug-motion-selected',
                ]"
                :title="event.detail"
                role="button"
                tabindex="0"
                @click.stop="selectMotionWorkspaceTimelineEvent(event)"
                @keydown.enter.prevent.stop="selectMotionWorkspaceTimelineEvent(event)"
                @keydown.space.prevent.stop="selectMotionWorkspaceTimelineEvent(event)"
              >
                <span>{{ event.time }}</span>
                <span>{{ event.type }}</span>
                <span>{{ event.prop }}</span>
                <span>{{ event.detail }}</span>
              </div>
            </section>
            <div v-if="motionTimelineGroups.length === 0" class="background-debug-motion-empty">
              {{ t("debug.motion.empty.noTimelineEvents") }}
            </div>
          </div>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.curveChart") }}</div>
          <div class="background-debug-motion-curve-list">
            <section
              v-for="group in motionCurveChartGroups"
              :key="group.key"
              :class="[
                'background-debug-motion-curve-card',
                'background-debug-motion-selectable',
                isMotionWorkspaceTrackSelected(group) && 'background-debug-motion-selected',
              ]"
              role="button"
              tabindex="0"
              @click="selectMotionWorkspaceCurve(group)"
              @keydown.enter.prevent="selectMotionWorkspaceCurve(group)"
              @keydown.space.prevent="selectMotionWorkspaceCurve(group)"
            >
              <header>
                <strong :title="group.overlayLabel">{{ group.label }}</strong>
                <span>{{ group.summary }}</span>
              </header>
              <div class="background-debug-motion-curve-meta">
                <span :title="group.laneLabel">{{ group.laneLabel }}</span>
                <span :title="group.sourceLabel">{{ group.sourceLabel }}</span>
                <span>{{ t("debug.motion.chart.maxVelocity", { value: formatMotionChartStat(group.stats.maxVelocity) }) }}</span>
              </div>
              <div class="background-debug-motion-curve-row">
                <span>{{ t("debug.motion.values.currentTargetEvent") }}</span>
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
                <span>{{ t("debug.motion.fields.delta") }}</span>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path class="background-debug-motion-curve-grid" d="M 0 50 L 100 50" />
                  <path v-if="group.deltaPath" class="background-debug-motion-curve-delta" :d="group.deltaPath" />
                </svg>
                <output>{{ group.rangeLabels.delta }}</output>
              </div>
              <div class="background-debug-motion-curve-row">
                <span>{{ t("debug.motion.fields.velocity") }}</span>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path class="background-debug-motion-curve-grid" d="M 0 50 L 100 50" />
                  <path v-if="group.velocityPath" class="background-debug-motion-curve-velocity" :d="group.velocityPath" />
                </svg>
                <output>{{ group.rangeLabels.velocity }}</output>
              </div>
            </section>
            <div v-if="motionCurveChartGroups.length === 0" class="background-debug-motion-empty">
              {{ t("debug.motion.empty.noCurveSamples") }}
            </div>
          </div>
        </div>
        </div>
      </section>
</template>

<script setup lang="ts">
import { useLocalization } from "../../i18n/localization.js";
import { useMotionDebugWorkspaceRegion } from "./motionDebugWorkspaceContext.js";

const { t } = useLocalization();

const {
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
} = useMotionDebugWorkspaceRegion("timeline");
</script>
