<template>
  <div class="motion-lab-root" data-motion-lab-root>
    <aside class="motion-lab-sidebar">
      <header class="motion-lab-header">
        <span>Pixi Motion Lab</span>
        <strong>dev only</strong>
      </header>

      <section class="motion-lab-section">
        <h2>Scenarios</h2>
        <button
          v-for="scenario in scenarioRows"
          :key="scenario.id"
          type="button"
          :class="['motion-lab-scenario', scenario.selected && 'motion-lab-scenario-selected']"
          @click="selectScenario(scenario.id)"
        >
          <span>{{ scenario.label }}</span>
          <strong>{{ scenario.stage }}</strong>
          <small>{{ scenario.description }} / {{ scenario.assertionCount }} assertion</small>
        </button>
      </section>

      <section class="motion-lab-section">
        <h2>Presets</h2>
        <div class="motion-lab-preset-status">
          <span>current</span>
          <strong>{{ activeParamPresetLabel }}</strong>
        </div>
        <div class="motion-lab-preset-grid">
          <button
            v-for="preset in paramPresetRows"
            :key="preset.id"
            type="button"
            :aria-pressed="preset.selected"
            :class="['motion-lab-preset', preset.selected && 'motion-lab-preset-selected']"
            @click="applyParamPreset(preset.id)"
          >
            <span>{{ preset.label }}</span>
            <strong>{{ preset.summary }}</strong>
            <small>{{ preset.description }}</small>
          </button>
        </div>
      </section>

      <section class="motion-lab-section">
        <template v-for="group in parameterGroups" :key="group.title">
          <h2>{{ group.title }}</h2>
          <label v-for="control in group.controls" :key="control.key" class="motion-lab-control">
            <span>
              {{ control.label }}
              <output>{{ formatParamOutput(control) }}</output>
            </span>
            <input
              v-if="control.type === 'range'"
              v-model.number="motionParams[control.key]"
              :name="`motionLab-${control.key}`"
              type="range"
              :min="control.min"
              :max="control.max"
              :step="control.step"
            >
            <select v-else v-model="motionParams[control.key]" :name="`motionLab-${control.key}`">
              <option v-for="option in control.options" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
        </template>
      </section>
    </aside>

    <main class="motion-lab-main">
      <section class="motion-lab-preview">
        <div ref="pixiHostRef" class="motion-lab-pixi-host" />
        <div class="motion-lab-preview-status">
          <span>{{ selectedScenarioLabel }}</span>
          <strong>{{ previewStatus }}</strong>
        </div>
      </section>

      <section class="motion-lab-toolbar">
        <button type="button" @click="runSelectedScenario">Run</button>
        <button type="button" @click="resetLabScene">Reset</button>
        <button type="button" @click="captureReplayTrace">Capture Replay</button>
        <button type="button" :disabled="!canSaveBaseline" @click="saveBaselineRun">Save Baseline</button>
        <button type="button" :disabled="!canCompareBaseline" @click="compareBaselineRun">Compare Baseline</button>
        <button type="button" :disabled="!canCompareLast" @click="compareLastRun">Compare Last</button>
        <button type="button" @click="copyLabReport">{{ reportCopyLabel }}</button>
        <button type="button" :disabled="!canCopyFocused" @click="copyFocusedExport">{{ focusedCopyLabel }}</button>
        <button type="button" :disabled="!replayTraceJson" @click="copyReplayTrace">{{ traceCopyLabel }}</button>
        <button type="button" :disabled="compareRows.length === 0" @click="copyCompareExport">{{ compareCopyLabel }}</button>
        <button type="button" :disabled="traceDiffRows.length === 0" @click="copyTraceDiffExport">{{ diffCopyLabel }}</button>
      </section>

      <section class="motion-lab-grid">
        <div class="motion-lab-panel">
          <header>
            <h2>Runtime</h2>
          </header>
          <dl class="motion-lab-stats">
            <div v-for="row in overviewRows" :key="row.label" :class="row.wide && 'motion-lab-stat-wide'">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
        </div>

        <div class="motion-lab-panel">
          <header>
            <h2>Warnings</h2>
          </header>
          <div class="motion-lab-list">
            <div v-for="row in warningRows" :key="`${row.key}-${row.detail}`" class="motion-lab-list-row">
              <span>{{ row.value }}</span>
              <strong>{{ row.detail }}</strong>
            </div>
          </div>
        </div>

        <div class="motion-lab-panel motion-lab-panel-wide">
          <header>
            <h2>Assertions</h2>
          </header>
          <div class="motion-lab-list">
            <div
              v-for="row in assertionRows"
              :key="row.id"
              :class="['motion-lab-list-row', 'motion-lab-assertion-row', row.passed && 'motion-lab-assertion-pass']"
            >
              <span>{{ row.status }}</span>
              <strong>{{ row.label }}</strong>
              <small>{{ row.detail }}</small>
            </div>
            <div v-if="assertionRows.length === 0" class="motion-lab-empty">no assertions run</div>
          </div>
        </div>

        <div class="motion-lab-panel motion-lab-panel-wide">
          <header>
            <h2>{{ comparePanelTitle }}</h2>
          </header>
          <dl class="motion-lab-stats">
            <div v-for="row in compareStatusRows" :key="row.label" :class="row.wide && 'motion-lab-stat-wide'">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
          <div class="motion-lab-list">
            <div v-for="row in compareRows" :key="row.label" class="motion-lab-list-row motion-lab-diff-row">
              <span>{{ row.label }}</span>
              <strong>{{ row.previous }} -> {{ row.current }}</strong>
              <small>{{ row.delta }}</small>
            </div>
            <div v-if="compareRows.length === 0" class="motion-lab-empty">{{ compareEmptyLabel }}</div>
          </div>
        </div>

        <div class="motion-lab-panel motion-lab-panel-wide">
          <header>
            <h2>Timeline</h2>
          </header>
          <div class="motion-lab-list">
            <div v-for="row in timelineRows" :key="row.key" class="motion-lab-list-row motion-lab-timeline-row">
              <span>{{ row.time }}</span>
              <span>{{ row.type }}</span>
              <strong>{{ row.detail }}</strong>
            </div>
            <div v-if="timelineRows.length === 0" class="motion-lab-empty">no events</div>
          </div>
        </div>

        <div class="motion-lab-panel motion-lab-panel-wide">
          <header>
            <h2>Curves</h2>
          </header>
          <div class="motion-lab-curve-grid">
            <article v-for="row in curveRows" :key="row.key" class="motion-lab-curve-row">
              <strong>{{ row.label }}</strong>
              <span>{{ row.lane }} / {{ row.driver }}</span>
              <span>{{ row.samples }} samples / v {{ row.maxVelocity }}</span>
            </article>
            <div v-if="curveRows.length === 0" class="motion-lab-empty">no curves</div>
          </div>
        </div>

        <div class="motion-lab-panel motion-lab-panel-wide">
          <header>
            <h2>Replay</h2>
          </header>
          <dl class="motion-lab-stats">
            <div>
              <dt>schema</dt>
              <dd>{{ replayTrace?.schema || "none" }}</dd>
            </div>
            <div>
              <dt>mode</dt>
              <dd>{{ replayTrace?.mode || "-" }}</dd>
            </div>
            <div>
              <dt>frames/events</dt>
              <dd>{{ replayTrace?.summary?.frameCount || 0 }} / {{ replayTrace?.summary?.eventCount || 0 }}</dd>
            </div>
            <div>
              <dt>tracks/targets</dt>
              <dd>{{ replayTrace?.summary?.trackCount || 0 }} / {{ replayTrace?.summary?.targetCount || 0 }}</dd>
            </div>
          </dl>
        </div>

        <div class="motion-lab-panel motion-lab-panel-wide">
          <header>
            <h2>Trace Diff</h2>
          </header>
          <div class="motion-lab-list">
            <div v-for="row in traceDiffRows" :key="row.label" class="motion-lab-list-row motion-lab-diff-row">
              <span>{{ row.label }}</span>
              <strong>{{ row.previous }} -> {{ row.current }}</strong>
              <small>{{ row.delta }}</small>
            </div>
            <div v-if="traceDiffRows.length === 0" class="motion-lab-empty">capture two traces</div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { Container, Graphics, Text } from "pixi.js";
import { buildMotionWarningRows } from "../components/backgroundDebug/motionDebugPanelModel.js";
import { createPixiApp } from "../rendering/pixi/createPixiApp.js";
import { createMotionRuntime } from "../rendering/pixi/animation/motionRuntime.js";
import { createMotionReplayTrace } from "../rendering/pixi/animation/motionReplayTrace.js";
import {
  applyMotionLabParamPreset,
  buildMotionLabParamPresetRows,
  buildMotionLabAssertionRows,
  buildMotionLabCompareRows,
  buildMotionLabCurveRows,
  buildMotionLabOverviewRows,
  buildMotionLabScenarioRows,
  buildMotionLabTraceDiffRows,
  buildMotionLabTimelineRows,
  createMotionLabCompareExport,
  createMotionLabBaselineCompareExport,
  createMotionLabFocusedExport,
  createMotionLabRunSnapshot,
  createMotionLabTraceDiffExport,
  DEFAULT_MOTION_LAB_PARAMS,
  MOTION_LAB_EASE_OPTIONS,
  MOTION_LAB_INTERRUPT_OPTIONS,
  MOTION_LAB_SCENARIOS,
  normalizeMotionLabParams,
  resolveMotionLabParamPresetId,
} from "./motionLabModel.js";
import {
  evaluateMotionLabScenarioAssertions,
  getMotionLabScenario,
  runMotionLabScenario,
} from "./motionLabScenarios.js";
import "./motionLab.css";

const pixiHostRef = ref(null);
const selectedScenarioId = ref(MOTION_LAB_SCENARIOS[0]?.id || "folder-open");
const previewStatus = ref("ready");
const motionReport = ref(makeEmptyReport());
const replayTrace = ref(null);
const replayTraceJson = ref("");
const assertionResults = ref([]);
const copiedReport = ref(false);
const copiedTrace = ref(false);
const copiedCompare = ref(false);
const copiedDiff = ref(false);
const copiedFocused = ref(false);
const currentRunSnapshot = ref(null);
const previousRunSnapshot = ref(null);
const savedBaselineSnapshot = ref(null);
const compareBaselineSnapshot = ref(null);
const compareCurrentSnapshot = ref(null);
const lastReplayTrace = ref(null);
const traceDiffBaseline = ref(null);
const traceDiffCurrent = ref(null);
const motionParams = reactive({ ...DEFAULT_MOTION_LAB_PARAMS });
const compareMode = ref("last");

const parameterGroups = Object.freeze([
  {
    title: "Spring",
    controls: [
      { key: "springStiffness", label: "stiffness", max: 720, min: 120, step: 10, type: "range" },
      { key: "springDamping", label: "damping", max: 80, min: 12, step: 1, type: "range" },
      { digits: 2, key: "springMass", label: "mass", max: 2, min: 0.4, step: 0.05, type: "range" },
    ],
  },
  {
    title: "Timing",
    controls: [
      { key: "durationMs", label: "duration", max: 900, min: 120, step: 20, suffix: "ms", type: "range" },
      { key: "ease", label: "ease", options: MOTION_LAB_EASE_OPTIONS, type: "select" },
    ],
  },
  {
    title: "Interruption",
    controls: [
      { key: "interruptPolicy", label: "policy", options: MOTION_LAB_INTERRUPT_OPTIONS, type: "select" },
      { key: "interruptDelayMs", label: "delay", max: 240, min: 0, step: 10, suffix: "ms", type: "range" },
      { key: "blendDurationMs", label: "blend", max: 240, min: 0, step: 10, suffix: "ms", type: "range" },
    ],
  },
  {
    title: "Drag",
    controls: [
      { key: "dragDistancePx", label: "distance", max: 360, min: 80, step: 10, suffix: "px", type: "range" },
      { key: "dragReleaseYPx", label: "release y", max: 320, min: 160, step: 8, suffix: "px", type: "range" },
    ],
  },
  {
    title: "Icon",
    controls: [
      { digits: 2, key: "iconPressScale", label: "press scale", max: 0.98, min: 0.7, step: 0.01, type: "range" },
      { digits: 2, key: "iconHoverScale", label: "hover scale", max: 1.2, min: 1, step: 0.01, type: "range" },
      { digits: 1, key: "jiggleRotationDeg", label: "jiggle", max: 9, min: 0, step: 0.3, suffix: "deg", type: "range" },
    ],
  },
  {
    title: "Folder",
    controls: [
      { digits: 2, key: "folderClosedScale", label: "closed scale", max: 0.98, min: 0.68, step: 0.01, type: "range" },
      { digits: 2, key: "folderOpenScale", label: "open scale", max: 1.12, min: 0.9, step: 0.01, type: "range" },
      { key: "folderTravelPx", label: "travel", max: 100, min: 0, step: 4, suffix: "px", type: "range" },
      { digits: 2, key: "folderHoverScale", label: "hover scale", max: 1.22, min: 1, step: 0.01, type: "range" },
      { key: "pageDistancePx", label: "page distance", max: 360, min: 80, step: 10, suffix: "px", type: "range" },
    ],
  },
]);

const scenarioRows = computed(() => buildMotionLabScenarioRows(MOTION_LAB_SCENARIOS, selectedScenarioId.value));
const selectedScenario = computed(() => getMotionLabScenario(selectedScenarioId.value));
const selectedScenarioLabel = computed(() => selectedScenario.value?.label || "Scenario");
const paramPresetRows = computed(() => buildMotionLabParamPresetRows(motionParams));
const activeParamPresetLabel = computed(() => {
  const selectedRow = paramPresetRows.value.find((row) => row.selected);
  return selectedRow?.label || "Custom";
});
const overviewRows = computed(() => buildMotionLabOverviewRows(motionReport.value, replayTrace.value));
const warningRows = computed(() => buildMotionWarningRows(motionReport.value, 6));
const assertionRows = computed(() => buildMotionLabAssertionRows(assertionResults.value));
const timelineRows = computed(() => buildMotionLabTimelineRows(motionReport.value));
const curveRows = computed(() => buildMotionLabCurveRows(motionReport.value));
const canSaveBaseline = computed(() => Boolean(currentRunSnapshot.value));
const canCopyFocused = computed(() => Boolean(currentRunSnapshot.value && assertionResults.value.length));
const canCompareLast = computed(() => Boolean(currentRunSnapshot.value && previousRunSnapshot.value));
const canCompareBaseline = computed(() => Boolean(currentRunSnapshot.value && savedBaselineSnapshot.value));
const compareRows = computed(() => buildMotionLabCompareRows(compareCurrentSnapshot.value, compareBaselineSnapshot.value));
const traceDiffRows = computed(() => buildMotionLabTraceDiffRows(traceDiffCurrent.value, traceDiffBaseline.value));
const reportCopyLabel = computed(() => copiedReport.value ? "Copied Report" : "Copy Report");
const focusedCopyLabel = computed(() => copiedFocused.value ? "Copied Focused" : "Copy Focused AI");
const traceCopyLabel = computed(() => copiedTrace.value ? "Copied Trace" : "Copy Trace");
const compareCopyLabel = computed(() => {
  if (copiedCompare.value) return compareMode.value === "baseline" ? "Copied Baseline" : "Copied Compare";
  return compareMode.value === "baseline" ? "Copy Baseline" : "Copy Compare";
});
const diffCopyLabel = computed(() => copiedDiff.value ? "Copied Diff" : "Copy Diff");
const comparePanelTitle = computed(() => compareMode.value === "baseline" ? "Baseline Compare" : "Compare Last");
const compareEmptyLabel = computed(() => {
  if (compareMode.value === "baseline") {
    if (!savedBaselineSnapshot.value) return "save a baseline run";
    return "run a current scenario";
  }
  return "run two scenarios";
});
const compareStatusRows = computed(() => [
  { label: "mode", value: compareMode.value === "baseline" ? "baseline" : "last" },
  { label: "baseline", value: formatRunSnapshotLabel(compareBaselineSnapshot.value) },
  { label: "current", value: formatRunSnapshotLabel(compareCurrentSnapshot.value), wide: true },
]);

let pixiApp = null;
let runtime = null;
let scene = null;
let reportTimer = null;
let copyReportTimer = null;
let copyTraceTimer = null;
let copyCompareTimer = null;
let copyDiffTimer = null;
let copyFocusedTimer = null;

function getMotionParams() {
  const normalized = normalizeMotionLabParams(motionParams);
  Object.assign(motionParams, normalized);
  return normalized;
}

function formatParamOutput(control) {
  const value = motionParams[control.key];
  if (control.type === "select") return String(value);
  const number = Number(value);
  const digits = Number.isFinite(Number(control.digits)) ? Number(control.digits) : 0;
  const formatted = Number.isFinite(number) ? number.toFixed(digits) : "-";
  return `${formatted}${control.suffix || ""}`;
}

function formatRunSnapshotLabel(snapshot = null) {
  if (!snapshot) return "none";
  const scenarioLabel = snapshot.scenario?.label || snapshot.scenario?.id || "Scenario";
  const summary = snapshot.summary || {};
  const passCount = Number(summary.assertionPassedCount) || 0;
  const failCount = Number(summary.assertionFailedCount) || 0;
  return `${scenarioLabel} / pass ${passCount} / fail ${failCount}`;
}

function makeEmptyReport() {
  return {
    config: { enabled: false },
    curveStats: [],
    history: { events: [], samples: [] },
    summary: {},
    warnings: [],
  };
}

function makeText(text, size = 13) {
  return new Text({
    style: {
      fill: 0xffffff,
      fontFamily: "Inter, Segoe UI, sans-serif",
      fontSize: size,
      fontWeight: "600",
    },
    text,
  });
}

function makeIcon(label, color) {
  const icon = new Container();
  icon.tile = new Graphics()
    .roundRect(-34, -34, 68, 68, 15)
    .fill({ alpha: 0.92, color })
    .roundRect(-27, -27, 54, 54, 12)
    .fill({ alpha: 0.18, color: 0xffffff });
  icon.label = makeText(label, 12);
  icon.label.anchor.set(0.5, 0);
  icon.label.y = 43;
  icon.addChild(icon.tile);
  icon.addChild(icon.label);
  return icon;
}

function makePanel() {
  const panel = new Container();
  panel.background = new Graphics()
    .roundRect(-96, -70, 192, 140, 28)
    .fill({ alpha: 0.26, color: 0xffffff })
    .roundRect(-72, -42, 144, 84, 20)
    .fill({ alpha: 0.34, color: 0x2dd4bf });
  panel.addChild(panel.background);
  return panel;
}

function makeHoverTarget(color) {
  const target = new Graphics()
    .roundRect(-44, -44, 88, 88, 18)
    .fill({ alpha: 0.16, color })
    .roundRect(-38, -38, 76, 76, 16)
    .fill({ alpha: 0.08, color: 0xffffff });
  target.alpha = 0;
  return target;
}

function makeMassIcon(index) {
  const hue = index % 3 === 0 ? 0x38bdf8 : index % 3 === 1 ? 0xa3e635 : 0xf472b6;
  return new Graphics()
    .roundRect(-8, -8, 16, 16, 4)
    .fill({ alpha: 0.68, color: hue });
}

function describeSceneTargets() {
  if (!runtime || !scene) return;
  runtime.describeTarget(scene.pageTrack, {
    kind: "MotionLabPageTrack",
    label: "pageTrack",
    overlayTarget: scene.pageTrack,
    sourceLabel: "motionLab.pageTrack",
  });
  runtime.describeTarget(scene.folderPanel, {
    kind: "MotionLabPanel",
    label: "folderPanel",
    overlayTarget: scene.folderPanel,
    sourceLabel: "motionLab.folder.panel",
  });
  runtime.describeTarget(scene.dragGhost, {
    kind: "MotionLabGhost",
    label: "dragGhost",
    overlayTarget: scene.dragGhost,
    sourceLabel: "motionLab.drag.ghost",
  });
  runtime.describeTarget(scene.folderPageTrack, {
    kind: "MotionLabFolderPageTrack",
    label: "folderPageTrack",
    overlayTarget: scene.folderPageTrack,
    sourceLabel: "motionLab.folder.pageTrack",
  });
  runtime.describeTarget(scene.folderHover, {
    kind: "MotionLabHover",
    label: "folderHover",
    overlayTarget: scene.folderHover,
    sourceLabel: "motionLab.folder.hover",
  });
  runtime.describeTarget(scene.createHover, {
    kind: "MotionLabCreateHover",
    label: "createHover",
    overlayTarget: scene.createHover,
    sourceLabel: "motionLab.appFolderCreate.hover",
  });
  scene.icons.forEach((icon, index) => {
    runtime.describeTarget(icon, {
      kind: "MotionLabIcon",
      label: `icon ${index + 1}`,
      overlayTarget: icon,
      sourceLabel: `motionLab.icon.${index + 1}`,
    });
  });
  scene.massIcons.forEach((icon, index) => {
    runtime.describeTarget(icon, {
      kind: "MotionLabMassIcon",
      label: `mass icon ${index + 1}`,
      overlayTarget: icon,
      sourceLabel: `motionLab.massIcon.${index + 1}`,
    });
  });
}

function createScene(app) {
  const stage = new Container();
  const guide = new Graphics()
    .roundRect(28, 24, 704, 392, 18)
    .fill({ alpha: 0.07, color: 0xffffff })
    .rect(62, 308, 612, 1)
    .fill({ alpha: 0.2, color: 0xffffff });
  const pageTrack = new Container();
  const folderPanel = makePanel();
  const folderPageTrack = new Container();
  const folderHover = makeHoverTarget(0x38bdf8);
  const createHover = makeHoverTarget(0xa3e635);
  const dragGhost = makeIcon("D", 0xf97316);
  const massIconLayer = new Container();
  const massIcons = Array.from({ length: 108 }, (_, index) => makeMassIcon(index));
  const icons = [
    makeIcon("A", 0x38bdf8),
    makeIcon("B", 0xa3e635),
    makeIcon("C", 0xf472b6),
  ];
  icons.forEach((icon, index) => {
    icon.position.set(180 + index * 104, 248);
    pageTrack.addChild(icon);
  });
  for (let index = 0; index < 8; index += 1) {
    const dot = new Graphics()
      .roundRect(-12, -12, 24, 24, 6)
      .fill({ alpha: 0.48, color: index % 2 ? 0xf472b6 : 0x38bdf8 });
    dot.position.set(-54 + (index % 4) * 36, -22 + Math.floor(index / 4) * 36);
    folderPageTrack.addChild(dot);
  }
  folderPanel.position.set(520, 174);
  folderPageTrack.position.set(0, 0);
  folderPanel.addChild(folderPageTrack);
  folderHover.position.set(284, 248);
  createHover.position.set(388, 248);
  dragGhost.position.set(210, 112);
  massIconLayer.alpha = 0.22;
  massIcons.forEach((icon, index) => {
    const col = index % 18;
    const row = Math.floor(index / 18);
    icon.position.set(82 + col * 32, 64 + row * 28);
    massIconLayer.addChild(icon);
  });
  stage.addChild(guide);
  stage.addChild(massIconLayer);
  stage.addChild(pageTrack);
  stage.addChild(folderHover);
  stage.addChild(createHover);
  stage.addChild(folderPanel);
  stage.addChild(dragGhost);
  app.stage.addChild(stage);
  return {
    createHover,
    dragGhost,
    folderHover,
    folderPanel,
    folderPageTrack,
    icons,
    massIconLayer,
    massIcons,
    pageTrack,
    stage,
  };
}

function configureRuntime() {
  runtime?.configureDebug({
    enabled: true,
    maxEvents: 3000,
    maxSamples: 1800,
    overlayEnabled: false,
    recordHistory: true,
    recordWindowMs: 30000,
    sampleHz: 30,
    timeScale: 1,
  });
}

function setSceneDefaults() {
  if (!scene) return;
  const params = getMotionParams();
  scene.pageTrack.position.set(0, 0);
  scene.folderPageTrack.position.set(0, 0);
  scene.folderPanel.position.set(520, 174);
  scene.folderPanel.scale.set(params.folderClosedScale);
  scene.folderPanel.alpha = 0.22;
  scene.folderHover.position.set(284, 248);
  scene.folderHover.scale.set(1);
  scene.folderHover.alpha = 0;
  scene.createHover.position.set(388, 248);
  scene.createHover.scale.set(1);
  scene.createHover.alpha = 0;
  scene.dragGhost.position.set(210, 112);
  scene.dragGhost.scale.set(0.78);
  scene.dragGhost.alpha = 0.5;
  scene.icons.forEach((icon, index) => {
    icon.position.set(180 + index * 104, 248);
    icon.scale.set(1);
    icon.alpha = 1;
    icon.rotation = 0;
  });
  scene.massIconLayer.alpha = 0.22;
  scene.massIcons.forEach((icon, index) => {
    const col = index % 18;
    const row = Math.floor(index / 18);
    icon.position.set(82 + col * 32, 64 + row * 28);
    icon.scale.set(1);
    icon.alpha = 1;
    icon.rotation = 0;
  });
}

function cancelSceneMotion(reason = "motion-lab-reset") {
  if (!runtime || !scene) return;
  for (const target of [
    scene.pageTrack,
    scene.folderPageTrack,
    scene.folderPanel,
    scene.folderPanel.scale,
    scene.folderHover,
    scene.folderHover.scale,
    scene.createHover,
    scene.createHover.scale,
    scene.dragGhost,
    scene.dragGhost.scale,
    ...scene.icons,
    ...scene.icons.map((icon) => icon.scale),
    ...scene.massIcons,
  ]) {
    runtime.cancelTarget(target, { reason });
  }
}

function refreshMotionReport() {
  if (!runtime) {
    motionReport.value = makeEmptyReport();
    return;
  }
  motionReport.value = runtime.debugReport({
    includeChannels: true,
    includeHistory: true,
    includeTargets: true,
  });
}

function resetLabScene() {
  cancelSceneMotion();
  runtime?.clearDebugHistory();
  setSceneDefaults();
  describeSceneTargets();
  replayTrace.value = null;
  replayTraceJson.value = "";
  assertionResults.value = [];
  previewStatus.value = "ready";
  refreshMotionReport();
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function makeScenarioContext() {
  return {
    motionParams: getMotionParams(),
    refreshReport: refreshMotionReport,
    report: motionReport.value,
    runtime,
    scene,
  };
}

function updateScenarioAssertions() {
  refreshMotionReport();
  const context = makeScenarioContext();
  context.report = motionReport.value;
  assertionResults.value = evaluateMotionLabScenarioAssertions(selectedScenario.value, context);
  return assertionResults.value;
}

async function runSelectedScenario() {
  if (!runtime || !scene) return;
  resetLabScene();
  previewStatus.value = "running";
  runMotionLabScenario(selectedScenarioId.value, makeScenarioContext());
  refreshMotionReport();
  await wait(selectedScenario.value?.assertAfterMs ?? 760);
  const assertions = updateScenarioAssertions();
  previewStatus.value = assertions.every((assertion) => assertion.passed) ? "passed" : "failed";
  recordRunSnapshot();
}

function selectScenario(id) {
  selectedScenarioId.value = getMotionLabScenario(id)?.id || MOTION_LAB_SCENARIOS[0].id;
  resetLabScene();
}

function applyParamPreset(id) {
  Object.assign(motionParams, applyMotionLabParamPreset(motionParams, id));
  resetLabScene();
  return getMotionParams();
}

function captureReplayTrace() {
  if (!runtime) return;
  updateScenarioAssertions();
  refreshMotionReport();
  const trace = createMotionReplayTrace(motionReport.value, {
    durationMs: 30000,
    sampleHz: 30,
  });
  traceDiffBaseline.value = lastReplayTrace.value;
  traceDiffCurrent.value = trace;
  lastReplayTrace.value = trace;
  replayTrace.value = trace;
  replayTraceJson.value = JSON.stringify(trace, null, 2);
  recordRunSnapshot(trace, { replaceCurrent: true });
}

async function copyText(text) {
  if (!text || typeof navigator === "undefined") return false;
  await navigator.clipboard?.writeText?.(text);
  return true;
}

async function copyLabReport() {
  updateScenarioAssertions();
  refreshMotionReport();
  const payload = {
    assertions: assertionResults.value,
    params: getMotionParams(),
    report: motionReport.value,
    scenario: {
      id: selectedScenario.value?.id,
      label: selectedScenario.value?.label,
    },
  };
  const ok = await copyText(JSON.stringify(payload, null, 2));
  if (!ok) return;
  copiedReport.value = true;
  if (copyReportTimer != null) window.clearTimeout(copyReportTimer);
  copyReportTimer = window.setTimeout(() => {
    copiedReport.value = false;
    copyReportTimer = null;
  }, 1200);
}

async function copyReplayTrace() {
  const ok = await copyText(replayTraceJson.value);
  if (!ok) return;
  copiedTrace.value = true;
  if (copyTraceTimer != null) window.clearTimeout(copyTraceTimer);
  copyTraceTimer = window.setTimeout(() => {
    copiedTrace.value = false;
    copyTraceTimer = null;
  }, 1200);
}

function createFocusedExportPayload() {
  if (!currentRunSnapshot.value) return null;
  updateScenarioAssertions();
  const currentSnapshot = makeRunSnapshot(replayTrace.value);
  return createMotionLabFocusedExport({
    assertions: assertionResults.value,
    baselineSnapshot: savedBaselineSnapshot.value,
    compareMode: compareMode.value,
    compareRows: compareRows.value,
    currentRunSnapshot: currentSnapshot,
    params: getMotionParams(),
    report: motionReport.value,
    scenario: selectedScenario.value,
    trace: replayTrace.value,
    traceDiffRows: traceDiffRows.value,
  });
}

function makeRunSnapshot(trace = replayTrace.value) {
  return createMotionLabRunSnapshot({
    assertions: assertionResults.value,
    params: getMotionParams(),
    report: motionReport.value,
    scenario: selectedScenario.value,
    trace,
  });
}

function recordRunSnapshot(trace = replayTrace.value, options = {}) {
  const snapshot = makeRunSnapshot(trace);
  if (options.replaceCurrent && currentRunSnapshot.value) {
    currentRunSnapshot.value = snapshot;
  } else {
    previousRunSnapshot.value = currentRunSnapshot.value;
    currentRunSnapshot.value = snapshot;
  }
  if (savedBaselineSnapshot.value) {
    compareBaselineRun();
  } else {
    compareLastRun();
  }
  return snapshot;
}

function compareLastRun() {
  if (!currentRunSnapshot.value || !previousRunSnapshot.value) return null;
  compareMode.value = "last";
  compareBaselineSnapshot.value = previousRunSnapshot.value;
  compareCurrentSnapshot.value = currentRunSnapshot.value;
  return compareRows.value;
}

function saveBaselineRun() {
  if (!currentRunSnapshot.value) return null;
  savedBaselineSnapshot.value = currentRunSnapshot.value;
  return compareBaselineRun();
}

function compareBaselineRun() {
  if (!currentRunSnapshot.value || !savedBaselineSnapshot.value) return null;
  compareMode.value = "baseline";
  compareBaselineSnapshot.value = savedBaselineSnapshot.value;
  compareCurrentSnapshot.value = currentRunSnapshot.value;
  return compareRows.value;
}

async function copyCompareExport() {
  const rows = compareMode.value === "baseline" ? compareBaselineRun() : compareLastRun();
  if (!rows || rows.length === 0) return;
  const payload = compareMode.value === "baseline"
    ? createMotionLabBaselineCompareExport(compareCurrentSnapshot.value, compareBaselineSnapshot.value)
    : createMotionLabCompareExport(compareCurrentSnapshot.value, compareBaselineSnapshot.value);
  const ok = await copyText(JSON.stringify(payload, null, 2));
  if (!ok) return;
  copiedCompare.value = true;
  if (copyCompareTimer != null) window.clearTimeout(copyCompareTimer);
  copyCompareTimer = window.setTimeout(() => {
    copiedCompare.value = false;
    copyCompareTimer = null;
  }, 1200);
}

async function copyFocusedExport() {
  const payload = createFocusedExportPayload();
  if (!payload) return;
  const ok = await copyText(payload.copyText);
  if (!ok) return;
  copiedFocused.value = true;
  if (copyFocusedTimer != null) window.clearTimeout(copyFocusedTimer);
  copyFocusedTimer = window.setTimeout(() => {
    copiedFocused.value = false;
    copyFocusedTimer = null;
  }, 1200);
}

async function copyTraceDiffExport() {
  const payload = createMotionLabTraceDiffExport(traceDiffCurrent.value, traceDiffBaseline.value);
  const ok = await copyText(JSON.stringify(payload, null, 2));
  if (!ok) return;
  copiedDiff.value = true;
  if (copyDiffTimer != null) window.clearTimeout(copyDiffTimer);
  copyDiffTimer = window.setTimeout(() => {
    copiedDiff.value = false;
    copyDiffTimer = null;
  }, 1200);
}

function installDebugApi() {
  globalThis.__LP_MOTION_LAB__ = {
    captureReplayTrace,
    assertions: () => assertionResults.value,
    baseline: () => savedBaselineSnapshot.value,
    baselineCompareExport: () => createMotionLabBaselineCompareExport(currentRunSnapshot.value, savedBaselineSnapshot.value),
    compareBaseline: compareBaselineRun,
    compareExport: () => (compareMode.value === "baseline"
      ? createMotionLabBaselineCompareExport(compareCurrentSnapshot.value, compareBaselineSnapshot.value)
      : createMotionLabCompareExport(compareCurrentSnapshot.value, compareBaselineSnapshot.value)),
    compareLast: compareLastRun,
    compareMode: () => compareMode.value,
    compareRows: () => compareRows.value,
    copyCompare: copyCompareExport,
    copyDiff: copyTraceDiffExport,
    copyFocused: copyFocusedExport,
    copyReport: copyLabReport,
    copyTrace: copyReplayTrace,
    focusedExport: createFocusedExportPayload,
    applyPreset: applyParamPreset,
    params: () => getMotionParams(),
    presetId: () => resolveMotionLabParamPresetId(motionParams),
    presets: () => paramPresetRows.value,
    report: () => motionReport.value,
    reset: resetLabScene,
    run: runSelectedScenario,
    runScenario: async (id) => {
      selectScenario(id);
      await runSelectedScenario();
      return {
        assertions: assertionResults.value,
        report: motionReport.value,
        scenarioId: selectedScenarioId.value,
      };
    },
    scenarios: () => scenarioRows.value,
    selectScenario,
    saveBaseline: saveBaselineRun,
    setParams: (patch = {}) => {
      Object.assign(motionParams, normalizeMotionLabParams({ ...motionParams, ...patch }));
      return getMotionParams();
    },
    status: () => ({
      canCompareLast: canCompareLast.value,
      canCompareBaseline: canCompareBaseline.value,
      canCopyFocused: canCopyFocused.value,
      hasBaseline: Boolean(savedBaselineSnapshot.value),
      hasPixiApp: Boolean(pixiApp),
      mounted: true,
      scenarioCount: scenarioRows.value.length,
      selectedScenarioId: selectedScenarioId.value,
      traceDiffRowCount: traceDiffRows.value.length,
      traceSchema: replayTrace.value?.schema || null,
    }),
    trace: () => replayTrace.value,
    traceDiffExport: () => createMotionLabTraceDiffExport(traceDiffCurrent.value, traceDiffBaseline.value),
    traceDiffRows: () => traceDiffRows.value,
  };
}

function clearCopyTimers() {
  if (copyReportTimer != null) window.clearTimeout(copyReportTimer);
  if (copyTraceTimer != null) window.clearTimeout(copyTraceTimer);
  if (copyCompareTimer != null) window.clearTimeout(copyCompareTimer);
  if (copyDiffTimer != null) window.clearTimeout(copyDiffTimer);
  if (copyFocusedTimer != null) window.clearTimeout(copyFocusedTimer);
  copyReportTimer = null;
  copyTraceTimer = null;
  copyCompareTimer = null;
  copyDiffTimer = null;
  copyFocusedTimer = null;
}

onMounted(async () => {
  runtime = createMotionRuntime();
  configureRuntime();
  pixiApp = await createPixiApp(pixiHostRef.value, {
    autoStart: true,
    className: "motion-lab-canvas",
  });
  scene = createScene(pixiApp);
  setSceneDefaults();
  describeSceneTargets();
  refreshMotionReport();
  reportTimer = window.setInterval(refreshMotionReport, 180);
  installDebugApi();
});

onBeforeUnmount(() => {
  clearCopyTimers();
  if (reportTimer != null) window.clearInterval(reportTimer);
  reportTimer = null;
  runtime?.reset();
  runtime = null;
  pixiApp?.destroy(false, { children: true });
  pixiApp = null;
  scene = null;
  if (globalThis.__LP_MOTION_LAB__) delete globalThis.__LP_MOTION_LAB__;
});
</script>
