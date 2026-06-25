<template>
      <section class="motion-debug-workspace-region">
        <header>
          <strong>Inspector</strong>
          <span>{{ motionWorkspaceSelectedTargetLabel }}</span>
        </header>
        <div class="motion-debug-workspace-section-list">
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">Inspector</div>
            <dl class="background-debug-status-grid">
              <div class="background-debug-stat background-debug-stat-wide">
                <dt>target</dt>
                <dd :title="motionWorkspaceSelectedTargetLabel">{{ motionWorkspaceSelectedTargetLabel }}</dd>
              </div>
              <div class="background-debug-stat background-debug-stat-wide">
                <dt>track</dt>
                <dd :title="motionWorkspaceSelectedTrackLabel">{{ motionWorkspaceSelectedTrackLabel }}</dd>
              </div>
              <div class="background-debug-stat">
                <dt>time</dt>
                <dd>{{ formatMotionReplayTime(motionWorkspaceSelectedTimeMs) }}</dd>
              </div>
              <div class="background-debug-stat">
                <dt>filter</dt>
                <dd :title="motionWorkspaceFilterLabel">{{ motionWorkspaceFilterLabel }}</dd>
              </div>
            </dl>
            <dl class="background-debug-status-grid motion-debug-inspector-current">
              <div
                v-for="row in motionInspectorStatusRows"
                :key="row.label"
                :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
              >
                <dt>{{ row.label }}</dt>
                <dd :title="row.value">{{ row.value }}</dd>
              </div>
            </dl>
            <div v-if="!motionInspectorModel" class="background-debug-motion-empty">
              load a replay trace to inspect selected track values
            </div>
            <div v-else-if="!motionInspectorModel.current" class="background-debug-motion-empty">
              no current sample for selected target or track
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">Lane Breakdown</div>
            <div class="motion-debug-inspector-card-list">
              <article
                v-for="row in motionInspectorLaneRows"
                :key="row.key"
                :class="['motion-debug-inspector-card', row.isSelected && 'motion-debug-inspector-card-selected']"
              >
                <strong :title="`${row.lane}/${row.laneKey}`">{{ row.lane }} / {{ row.laneKey }}</strong>
                <span :title="`${row.valueLabel} -> ${row.toLabel}`">{{ row.valueLabel }} -> {{ row.toLabel }}</span>
                <span :title="`delta ${row.deltaLabel} / velocity ${row.velocityLabel}`">
                  delta {{ row.deltaLabel }} / v {{ row.velocityLabel }}
                </span>
                <span :title="row.driver">{{ row.driver }}</span>
              </article>
              <div v-if="motionInspectorLaneRows.length === 0" class="background-debug-motion-empty">
                no lane breakdown
              </div>
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">Why Is It Moving?</div>
            <div class="motion-debug-inspector-card-list">
              <article
                v-for="row in motionInspectorWhyRows"
                :key="row.key"
                :class="['motion-debug-inspector-card', `motion-debug-inspector-card-${row.tone}`]"
              >
                <strong>{{ row.label }}</strong>
                <span :title="row.detail">{{ row.detail }}</span>
              </article>
              <div v-if="motionInspectorWhyRows.length === 0" class="background-debug-motion-empty">
                no replay explanation
              </div>
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">Recent Lifecycle Events</div>
            <div class="motion-debug-inspector-card-list">
              <article
                v-for="event in motionInspectorEventRows"
                :key="event.key"
                :class="['motion-debug-inspector-card', event.isCurrent && 'motion-debug-inspector-card-selected']"
              >
                <strong>{{ event.timeLabel }} {{ event.type }}</strong>
                <span :title="event.detail">{{ event.detail }}</span>
                <span :title="`${event.lane}/${event.laneKey}`">{{ event.lane }} / {{ event.laneKey }}</span>
              </article>
              <div v-if="motionInspectorEventRows.length === 0" class="background-debug-motion-empty">
                no matching lifecycle events
              </div>
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">Matching Warnings</div>
            <div class="motion-debug-inspector-card-list">
              <article
                v-for="warning in motionInspectorWarningRows"
                :key="warning.key"
                class="motion-debug-inspector-card motion-debug-inspector-card-warning"
              >
                <strong>{{ warning.type }}</strong>
                <span :title="warning.detail">{{ warning.detail }}</span>
              </article>
              <div v-if="motionInspectorWarningRows.length === 0" class="background-debug-motion-empty">
                no matching warnings
              </div>
            </div>
          </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">Properties</div>
          <div
            class="background-debug-motion-property-table"
            role="table"
            aria-label="Pixi motion properties"
            @click="selectMotionWorkspacePropertyByEvent"
            @keydown.enter.prevent="selectMotionWorkspacePropertyByEvent"
            @keydown.space.prevent="selectMotionWorkspacePropertyByEvent"
          >
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
              :class="[
                'background-debug-motion-property-row',
                'background-debug-motion-selectable',
                isMotionWorkspaceTrackSelected(row) && 'background-debug-motion-selected',
              ]"
              role="row"
              tabindex="0"
              :data-motion-property-index="index"
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
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">AI Export</div>
            <dl class="background-debug-status-grid">
              <div
                v-for="row in motionFocusedDebugScopeRows"
                :key="row.label"
                :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
              >
                <dt>{{ row.label }}</dt>
                <dd :title="row.value">{{ row.value }}</dd>
              </div>
            </dl>
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
              <button
                type="button"
                class="background-debug-button"
                :disabled="!motionFocusedDebugExportAvailable"
                @click="copyMotionFocusedDebugExport()"
              >
                {{ motionFocusedCopyButtonLabel }}
              </button>
              <button type="button" class="background-debug-button" @click="copyMotionReport('full')">
                {{ motionFullCopyButtonLabel }}
              </button>
            </div>
          </div>
        </div>
      </section>
</template>

<script setup>
import { useMotionDebugWorkspaceContext } from "./motionDebugWorkspaceContext.js";

const {
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
} = useMotionDebugWorkspaceContext();
</script>
