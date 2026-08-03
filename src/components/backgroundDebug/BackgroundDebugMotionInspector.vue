<template>
      <section class="motion-debug-workspace-region">
        <header>
          <strong>{{ t("debug.motion.sections.inspector") }}</strong>
          <span>{{ motionWorkspaceSelectedTargetLabel }}</span>
        </header>
        <div class="motion-debug-workspace-section-list">
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">{{ t("debug.motion.sections.currentSelection") }}</div>
            <dl class="background-debug-status-grid">
              <div class="background-debug-stat background-debug-stat-wide">
                <dt>{{ t("debug.motion.fields.target") }}</dt>
                <dd :title="motionWorkspaceSelectedTargetLabel">{{ motionWorkspaceSelectedTargetLabel }}</dd>
              </div>
              <div class="background-debug-stat background-debug-stat-wide">
                <dt>{{ t("debug.motion.fields.track") }}</dt>
                <dd :title="motionWorkspaceSelectedTrackLabel">{{ motionWorkspaceSelectedTrackLabel }}</dd>
              </div>
              <div class="background-debug-stat">
                <dt>{{ t("debug.motion.fields.time") }}</dt>
                <dd>{{ formatMotionReplayTime(motionWorkspaceSelectedTimeMs) }}</dd>
              </div>
              <div class="background-debug-stat">
                <dt>{{ t("debug.motion.fields.filter") }}</dt>
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
              {{ t("debug.motion.empty.loadReplay") }}
            </div>
            <div v-else-if="!motionInspectorModel.current" class="background-debug-motion-empty">
              {{ t("debug.motion.empty.noCurrentSample") }}
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">{{ t("debug.motion.sections.channelBreakdown") }}</div>
            <div class="motion-debug-inspector-card-list">
              <article
                v-for="row in motionInspectorLaneRows"
                :key="row.key"
                :class="['motion-debug-inspector-card', row.isSelected && 'motion-debug-inspector-card-selected']"
              >
                <strong :title="`${row.lane}/${row.laneKey}`">{{ row.lane }} / {{ row.laneKey }}</strong>
                <span :title="`${row.valueLabel} -> ${row.toLabel}`">{{ row.valueLabel }} -> {{ row.toLabel }}</span>
                <span :title="`delta ${row.deltaLabel} / velocity ${row.velocityLabel}`">
                  {{ t("debug.motion.values.deltaVelocity", { delta: row.deltaLabel, velocity: row.velocityLabel }) }}
                </span>
                <span :title="row.driver">{{ row.driver }}</span>
              </article>
              <div v-if="motionInspectorLaneRows.length === 0" class="background-debug-motion-empty">
                {{ t("debug.motion.empty.noLaneContribution") }}
              </div>
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">{{ t("debug.motion.sections.whyMoving") }}</div>
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
                {{ t("debug.motion.empty.noExplanation") }}
              </div>
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">{{ t("debug.motion.sections.recentLifecycle") }}</div>
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
                {{ t("debug.motion.empty.noLifecycle") }}
              </div>
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">{{ t("debug.motion.sections.relatedWarnings") }}</div>
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
                {{ t("debug.motion.empty.noRelatedWarnings") }}
              </div>
            </div>
          </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.propertyDetails") }}</div>
          <div
            class="background-debug-motion-property-table"
            role="table"
            :aria-label="t('debug.motion.aria.propertyDetails')"
            @click="selectMotionWorkspacePropertyByEvent"
            @keydown.enter.prevent="selectMotionWorkspacePropertyByEvent"
            @keydown.space.prevent="selectMotionWorkspacePropertyByEvent"
          >
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
              {{ t("debug.motion.empty.noProperties") }}
            </div>
          </div>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.cancelReasons") }}</div>
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
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.warnings") }}</div>
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
            <div class="background-debug-subtitle">{{ t("debug.motion.sections.aiExport") }}</div>
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
                {{ t("debug.motion.actions.clearHistory") }}
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
import { useLocalization } from "../../i18n/localization.js";
import { useMotionDebugWorkspaceRegion } from "./motionDebugWorkspaceContext.js";

const { t } = useLocalization();

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
} = useMotionDebugWorkspaceRegion("inspector");
</script>
