<template>
      <section class="motion-debug-workspace-region">
        <header>
          <strong>目标</strong>
          <span>{{ motionLayerTreeRows.length }} 个图层 / {{ motionAnimationRows.length }} 个活动动画</span>
        </header>
        <div class="motion-debug-workspace-section-list">
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
          <div class="background-debug-subtitle">捕获配置</div>
          <label class="background-debug-control background-debug-select-control">
            <span>
              配置
              <output>{{ motionCaptureProfile.label }}</output>
            </span>
            <select
              name="motionCaptureProfileId"
              :disabled="motionReplayCaptureActive"
              :value="motionCaptureProfile.id"
              @change="updateMotionWorkspaceCaptureProfile"
            >
              <option
                v-for="profile in motionCaptureProfiles"
                :key="profile.id"
                :value="profile.id"
              >
                {{ profile.label }}
              </option>
            </select>
          </label>
          <div class="background-debug-motion-capture-props" role="group" aria-label="捕获属性">
            <label
              v-for="prop in motionCaptureAllowedProps"
              :key="prop"
              class="background-debug-toggle background-debug-motion-capture-prop"
            >
              <input
                :name="`motionCaptureProp-${prop}`"
                type="checkbox"
                :checked="motionCaptureProfile.propAllowlist.includes(prop)"
                :disabled="motionReplayCaptureActive || (motionCaptureProfile.propAllowlist.includes(prop) && motionCaptureSelectedPropCount <= 1)"
                @change="toggleMotionWorkspaceCaptureProp(prop, $event)"
              >
              <span>{{ prop }}</span>
            </label>
          </div>
          <div class="background-debug-motion-capture-filter-grid">
            <label class="background-debug-control background-debug-motion-capture-filter-control">
              <span>
                图层（layers）
                <output>{{ motionCaptureTargetFilterText.layers || "全部" }}</output>
              </span>
              <input
                name="motionCaptureLayerFilter"
                type="text"
                placeholder="desktop, folder"
                :disabled="motionReplayCaptureActive"
                :value="motionCaptureTargetFilterText.layers"
                @input="updateMotionWorkspaceCaptureTargetFilter('layers', $event)"
              >
            </label>
            <label class="background-debug-control background-debug-motion-capture-filter-control">
              <span>
                类型（kinds）
                <output>{{ motionCaptureTargetFilterText.kinds || "全部" }}</output>
              </span>
              <input
                name="motionCaptureKindFilter"
                type="text"
                placeholder="Icon, FolderPanel"
                :disabled="motionReplayCaptureActive"
                :value="motionCaptureTargetFilterText.kinds"
                @input="updateMotionWorkspaceCaptureTargetFilter('kinds', $event)"
              >
            </label>
            <label class="background-debug-control background-debug-motion-capture-filter-control">
              <span>
                来源标签（sourceLabels）
                <output>{{ motionCaptureTargetFilterText.sourceLabels || "全部" }}</output>
              </span>
              <input
                name="motionCaptureSourceLabelFilter"
                type="text"
                placeholder="desktop.icon.node"
                :disabled="motionReplayCaptureActive"
                :value="motionCaptureTargetFilterText.sourceLabels"
                @input="updateMotionWorkspaceCaptureTargetFilter('sourceLabels', $event)"
              >
            </label>
            <label class="background-debug-control background-debug-motion-capture-filter-control">
              <span>
                来源搜索
                <output>{{ motionCaptureTargetFilterText.sourceQuery || "全部" }}</output>
              </span>
              <input
                name="motionCaptureSourceQuery"
                type="search"
                placeholder="icon / panel"
                :disabled="motionReplayCaptureActive"
                :value="motionCaptureTargetFilterText.sourceQuery"
                @input="updateMotionWorkspaceCaptureTargetFilter('sourceQuery', $event)"
              >
            </label>
          </div>
          <dl class="background-debug-status-grid background-debug-motion-capture-estimate">
            <div
              v-for="row in motionCaptureEstimateRows"
              :key="row.label"
              :class="['background-debug-stat', row.wide && 'background-debug-stat-wide']"
            >
              <dt>{{ row.label }}</dt>
              <dd :title="row.value">{{ row.value }}</dd>
            </div>
          </dl>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">过滤器</div>
          <div class="background-debug-mode-group background-debug-motion-filter-group" role="group" aria-label="Motion 过滤预设">
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
              搜索条件
              <output>{{ motionFilterSummary.text }}</output>
            </span>
            <input
              name="motionFilterQuery"
              type="search"
              placeholder="目标 / 通道 / 属性 / 事件"
              :value="motionFilterQuery"
              @input="updateMotionFilterQuery"
            >
          </label>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">图层树</div>
          <div class="background-debug-motion-layer-tree">
            <section
              v-for="row in motionLayerTreeRows"
              :key="row.key"
              :class="[
                'background-debug-motion-timeline-group',
                'background-debug-motion-selectable',
                isMotionWorkspaceLayerSelected(row) && 'background-debug-motion-selected',
              ]"
              role="button"
              tabindex="0"
              @click="selectMotionWorkspaceLayer(row)"
              @keydown.enter.prevent="selectMotionWorkspaceLayer(row)"
              @keydown.space.prevent="selectMotionWorkspaceLayer(row)"
            >
              <header>
                <strong :title="row.layer">{{ row.layer }}</strong>
                <span>{{ row.summary }}</span>
              </header>
              <div class="background-debug-motion-layer-row">
                <span>{{ row.targetCount }} 个目标</span>
                <span>{{ row.activeCount }} 个活动动画</span>
                <span>{{ row.warningCount }} 个警告</span>
                <span>{{ row.eventCount }} 个事件</span>
              </div>
              <div class="background-debug-motion-layer-row">
                <span :title="row.detail">{{ row.detail }}</span>
                <span :title="row.sources">{{ row.sources }}</span>
              </div>
            </section>
            <div v-if="motionLayerTreeRows.length === 0" class="background-debug-motion-empty">
              没有匹配的图层
            </div>
          </div>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">活动动画</div>
          <div class="background-debug-motion-table" role="table" aria-label="活动中的 Pixi Motion 动画">
            <div class="background-debug-motion-row background-debug-motion-row-head" role="row">
              <span role="columnheader">目标</span>
              <span role="columnheader">属性（prop）</span>
              <span role="columnheader">当前值 → 目标值</span>
              <span role="columnheader">驱动器</span>
              <span role="columnheader">通道（lane）</span>
              <span role="columnheader">速度</span>
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
              当前没有活动动画
            </div>
          </div>
        </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">固定目标</div>
            <div class="background-debug-motion-replay-overlay-list">
              <article
                v-for="pin in motionWorkspaceSession.pinnedTargets"
                :key="pin.key"
                class="background-debug-motion-replay-overlay-card"
              >
                <strong :title="pin.label">{{ pin.label }}</strong>
                <span :title="pin.sourceLabel || pin.layer || pin.kind">{{ pin.sourceLabel || pin.layer || pin.kind || pin.key }}</span>
              </article>
              <div v-if="motionWorkspaceSession.pinnedTargets.length === 0" class="background-debug-motion-empty">
                尚未固定目标
              </div>
            </div>
          </div>
        </div>
      </section>
</template>

<script setup>
import { useMotionDebugWorkspaceRegion } from "./motionDebugWorkspaceContext.js";

const {
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
} = useMotionDebugWorkspaceRegion("targets");
</script>
