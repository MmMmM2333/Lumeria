<template>
      <section class="motion-debug-workspace-region">
        <header>
          <strong>检查器</strong>
          <span>{{ motionWorkspaceSelectedTargetLabel }}</span>
        </header>
        <div class="motion-debug-workspace-section-list">
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">当前选择</div>
            <dl class="background-debug-status-grid">
              <div class="background-debug-stat background-debug-stat-wide">
                <dt>目标</dt>
                <dd :title="motionWorkspaceSelectedTargetLabel">{{ motionWorkspaceSelectedTargetLabel }}</dd>
              </div>
              <div class="background-debug-stat background-debug-stat-wide">
                <dt>轨道</dt>
                <dd :title="motionWorkspaceSelectedTrackLabel">{{ motionWorkspaceSelectedTrackLabel }}</dd>
              </div>
              <div class="background-debug-stat">
                <dt>时间</dt>
                <dd>{{ formatMotionReplayTime(motionWorkspaceSelectedTimeMs) }}</dd>
              </div>
              <div class="background-debug-stat">
                <dt>过滤器</dt>
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
              载入回放轨迹后可检查选中轨道的数值
            </div>
            <div v-else-if="!motionInspectorModel.current" class="background-debug-motion-empty">
              当前时刻没有与选中目标或轨道匹配的采样
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">通道贡献拆解</div>
            <div class="motion-debug-inspector-card-list">
              <article
                v-for="row in motionInspectorLaneRows"
                :key="row.key"
                :class="['motion-debug-inspector-card', row.isSelected && 'motion-debug-inspector-card-selected']"
              >
                <strong :title="`${row.lane}/${row.laneKey}`">{{ row.lane }} / {{ row.laneKey }}</strong>
                <span :title="`${row.valueLabel} -> ${row.toLabel}`">{{ row.valueLabel }} -> {{ row.toLabel }}</span>
                <span :title="`delta ${row.deltaLabel} / velocity ${row.velocityLabel}`">
                  差值 {{ row.deltaLabel }} / 速度 {{ row.velocityLabel }}
                </span>
                <span :title="row.driver">{{ row.driver }}</span>
              </article>
              <div v-if="motionInspectorLaneRows.length === 0" class="background-debug-motion-empty">
                没有可拆解的通道贡献
              </div>
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">为什么还在移动？</div>
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
                暂无回放解释
              </div>
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">最近生命周期事件</div>
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
                没有匹配的生命周期事件
              </div>
            </div>
          </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">相关警告</div>
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
                没有相关警告
              </div>
            </div>
          </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">属性明细</div>
          <div
            class="background-debug-motion-property-table"
            role="table"
            aria-label="Pixi Motion 属性明细"
            @click="selectMotionWorkspacePropertyByEvent"
            @keydown.enter.prevent="selectMotionWorkspacePropertyByEvent"
            @keydown.space.prevent="selectMotionWorkspacePropertyByEvent"
          >
            <div class="background-debug-motion-property-row background-debug-motion-row-head" role="row">
              <span role="columnheader">目标.属性</span>
              <span role="columnheader">当前值</span>
              <span role="columnheader">目标值（to）</span>
              <span role="columnheader">差值（delta）</span>
              <span role="columnheader">速度</span>
              <span role="columnheader">驱动器</span>
              <span role="columnheader">通道（lane）</span>
              <span role="columnheader">通道键（laneKey）</span>
              <span role="columnheader">来源标签（sourceLabel）</span>
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
              没有匹配的属性
            </div>
          </div>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">主要取消原因</div>
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
          <div class="background-debug-subtitle">警告</div>
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
            <div class="background-debug-subtitle">AI 分析导出</div>
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
                清空历史
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
import { useMotionDebugWorkspaceRegion } from "./motionDebugWorkspaceContext.js";

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
