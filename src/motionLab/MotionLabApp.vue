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
        <h2>Parameters</h2>
        <label class="motion-lab-control">
          <span>
            stiffness
            <output>{{ motionParams.stiffness }}</output>
          </span>
          <input v-model.number="motionParams.stiffness" type="range" min="120" max="720" step="10">
        </label>
        <label class="motion-lab-control">
          <span>
            damping
            <output>{{ motionParams.damping }}</output>
          </span>
          <input v-model.number="motionParams.damping" type="range" min="12" max="80" step="1">
        </label>
        <label class="motion-lab-control">
          <span>
            duration
            <output>{{ motionParams.durationMs }}ms</output>
          </span>
          <input v-model.number="motionParams.durationMs" type="range" min="120" max="900" step="20">
        </label>
        <label class="motion-lab-control">
          <span>
            distance
            <output>{{ motionParams.distancePx }}px</output>
          </span>
          <input v-model.number="motionParams.distancePx" type="range" min="80" max="360" step="10">
        </label>
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
        <button type="button" @click="copyLabReport">{{ reportCopyLabel }}</button>
        <button type="button" :disabled="!replayTraceJson" @click="copyReplayTrace">{{ traceCopyLabel }}</button>
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
  buildMotionLabAssertionRows,
  buildMotionLabCurveRows,
  buildMotionLabOverviewRows,
  buildMotionLabScenarioRows,
  buildMotionLabTimelineRows,
  MOTION_LAB_SCENARIOS,
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
const motionParams = reactive({
  damping: 34,
  distancePx: 220,
  durationMs: 360,
  stiffness: 360,
});

const scenarioRows = computed(() => buildMotionLabScenarioRows(MOTION_LAB_SCENARIOS, selectedScenarioId.value));
const selectedScenario = computed(() => getMotionLabScenario(selectedScenarioId.value));
const selectedScenarioLabel = computed(() => selectedScenario.value?.label || "Scenario");
const overviewRows = computed(() => buildMotionLabOverviewRows(motionReport.value, replayTrace.value));
const warningRows = computed(() => buildMotionWarningRows(motionReport.value, 6));
const assertionRows = computed(() => buildMotionLabAssertionRows(assertionResults.value));
const timelineRows = computed(() => buildMotionLabTimelineRows(motionReport.value));
const curveRows = computed(() => buildMotionLabCurveRows(motionReport.value));
const reportCopyLabel = computed(() => copiedReport.value ? "Copied Report" : "Copy Report");
const traceCopyLabel = computed(() => copiedTrace.value ? "Copied Trace" : "Copy Trace");

let pixiApp = null;
let runtime = null;
let scene = null;
let reportTimer = null;
let copyReportTimer = null;
let copyTraceTimer = null;

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
  scene.pageTrack.position.set(0, 0);
  scene.folderPageTrack.position.set(0, 0);
  scene.folderPanel.position.set(520, 174);
  scene.folderPanel.scale.set(0.86);
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
    motionParams,
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
}

function selectScenario(id) {
  selectedScenarioId.value = getMotionLabScenario(id)?.id || MOTION_LAB_SCENARIOS[0].id;
  resetLabScene();
}

function captureReplayTrace() {
  if (!runtime) return;
  updateScenarioAssertions();
  refreshMotionReport();
  const trace = createMotionReplayTrace(motionReport.value, {
    durationMs: 30000,
    sampleHz: 30,
  });
  replayTrace.value = trace;
  replayTraceJson.value = JSON.stringify(trace, null, 2);
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

function installDebugApi() {
  globalThis.__LP_MOTION_LAB__ = {
    captureReplayTrace,
    assertions: () => assertionResults.value,
    copyReport: copyLabReport,
    copyTrace: copyReplayTrace,
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
    status: () => ({
      hasPixiApp: Boolean(pixiApp),
      mounted: true,
      scenarioCount: scenarioRows.value.length,
      selectedScenarioId: selectedScenarioId.value,
      traceSchema: replayTrace.value?.schema || null,
    }),
    trace: () => replayTrace.value,
  };
}

function clearCopyTimers() {
  if (copyReportTimer != null) window.clearTimeout(copyReportTimer);
  if (copyTraceTimer != null) window.clearTimeout(copyTraceTimer);
  copyReportTimer = null;
  copyTraceTimer = null;
}

onMounted(async () => {
  runtime = createMotionRuntime();
  configureRuntime();
  pixiApp = await createPixiApp(pixiHostRef.value, { className: "motion-lab-canvas" });
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
