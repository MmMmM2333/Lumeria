<template>
      <section class="motion-debug-workspace-region">
        <header>
          <strong>{{ t("debug.motion.sections.targets") }}</strong>
          <span>{{ t("debug.motion.counts.layersAnimations", { layers: motionLayerTreeRows.length, animations: motionAnimationRows.length }) }}</span>
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
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.captureConfig") }}</div>
          <label class="background-debug-control background-debug-select-control">
            <span>
              {{ t("debug.motion.fields.configuration") }}
              <output>{{ motionCaptureProfile.labelKey ? t(motionCaptureProfile.labelKey) : motionCaptureProfile.label }}</output>
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
                {{ profile.labelKey ? t(profile.labelKey) : profile.label }}
              </option>
            </select>
          </label>
          <div class="background-debug-motion-capture-props" role="group" :aria-label="t('debug.motion.aria.captureProperties')">
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
                {{ t("debug.motion.fields.layers") }}
                <output>{{ motionCaptureTargetFilterText.layers || t("debug.common.all") }}</output>
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
                {{ t("debug.motion.fields.kinds") }}
                <output>{{ motionCaptureTargetFilterText.kinds || t("debug.common.all") }}</output>
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
                {{ t("debug.motion.fields.sourceLabel") }}
                <output>{{ motionCaptureTargetFilterText.sourceLabels || t("debug.common.all") }}</output>
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
                {{ t("debug.motion.fields.sourceSearch") }}
                <output>{{ motionCaptureTargetFilterText.sourceQuery || t("debug.common.all") }}</output>
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
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.filters") }}</div>
          <div class="background-debug-mode-group background-debug-motion-filter-group" role="group" :aria-label="t('debug.motion.aria.filterPresets')">
            <button
              v-for="preset in MOTION_FILTER_PRESETS"
              :key="preset.value"
              type="button"
              :class="['background-debug-mode-button', motionFilterPreset === preset.value && 'background-debug-mode-button-active']"
              @click="setMotionFilterPreset(preset.value)"
            >
              {{ preset.labelKey ? t(preset.labelKey) : preset.label }}
            </button>
          </div>
          <label class="background-debug-control background-debug-motion-filter-control">
            <span>
              {{ t("debug.motion.fields.searchCriteria") }}
              <output>{{ motionFilterSummary.text }}</output>
            </span>
            <input
              name="motionFilterQuery"
              type="search"
              :placeholder="t('debug.motion.searchPlaceholder')"
              :value="motionFilterQuery"
              @input="updateMotionFilterQuery"
            >
          </label>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.layerTree") }}</div>
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
                <span>{{ t("debug.motion.counts.targets", { count: row.targetCount }) }}</span>
                <span>{{ t("debug.motion.counts.animations", { count: row.activeCount }) }}</span>
                <span>{{ t("debug.motion.counts.warnings", { count: row.warningCount }) }}</span>
                <span>{{ t("debug.motion.counts.events", { count: row.eventCount }) }}</span>
              </div>
              <div class="background-debug-motion-layer-row">
                <span :title="row.detail">{{ row.detail }}</span>
                <span :title="row.sources">{{ row.sources }}</span>
              </div>
            </section>
            <div v-if="motionLayerTreeRows.length === 0" class="background-debug-motion-empty">
              {{ t("debug.motion.empty.noLayers") }}
            </div>
          </div>
        </div>
        <div class="background-debug-subsection">
          <div class="background-debug-subtitle">{{ t("debug.motion.sections.activeAnimations") }}</div>
          <div class="background-debug-motion-table" role="table" :aria-label="t('debug.motion.aria.activeAnimations')">
            <div class="background-debug-motion-row background-debug-motion-row-head" role="row">
              <span role="columnheader">{{ t("debug.motion.fields.target") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.property") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.valueTo") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.driver") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.lane") }}</span>
              <span role="columnheader">{{ t("debug.motion.fields.velocity") }}</span>
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
              {{ t("debug.motion.empty.noActiveAnimations") }}
            </div>
          </div>
        </div>
          <div class="background-debug-subsection">
            <div class="background-debug-subtitle">{{ t("debug.motion.sections.pinnedTargets") }}</div>
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
                {{ t("debug.motion.empty.noPinnedTargets") }}
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
