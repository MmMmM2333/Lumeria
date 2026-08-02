import { progressDriver, spring, tween } from "../rendering/pixi/animation/motionRuntime.js";
import { motionSequence, motionTo } from "../rendering/pixi/animation/motionTween.js";
import { normalizeMotionLabParams } from "./motionLabParams.js";

export const MOTION_LAB_SCENARIO_IDS = Object.freeze([
  "folder-open",
  "folder-close",
  "folder-open-interrupted-by-close",
  "folder-close-interrupted-by-open",
  "desktop-page-scrub",
  "folder-page-scrub",
  "drag-release",
  "icon-press-release",
  "folder-hover",
  "app-folder-create-hover",
  "edit-jiggle",
  "hundred-icon-layout-retarget",
]);

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasEvent(report = {}, predicate = () => false) {
  return (report.history?.events || []).some(predicate);
}

function hasTrack(report = {}, sourceLabel, prop = null) {
  return (report.history?.events || []).some((event) => (
    event.sourceLabel === sourceLabel && (prop == null || event.prop === prop)
  ));
}

function countEvents(report = {}, predicate = () => true) {
  return (report.history?.events || []).filter(predicate).length;
}

function makeSpring(params = {}, overrides = {}) {
  const normalized = normalizeMotionLabParams(params);
  return spring({
    damping: normalized.springDamping,
    mass: normalized.springMass,
    stiffness: normalized.springStiffness,
    ...overrides,
  });
}

function makeTween(params = {}, overrides = {}) {
  const normalized = normalizeMotionLabParams(params);
  return tween({
    duration: normalized.durationMs / 1000,
    ease: normalized.ease,
    ...overrides,
  });
}

function interruptOptions(params = {}) {
  const normalized = normalizeMotionLabParams(params);
  return {
    blendDuration: normalized.blendDurationMs / 1000,
    blendEase: normalized.ease,
    interrupt: normalized.interruptPolicy,
  };
}

function shortTweenDuration(params = {}, factor = 0.33) {
  const normalized = normalizeMotionLabParams(params);
  return Math.max(0.06, (normalized.durationMs / 1000) * factor);
}

function degreesToRadians(value) {
  return readNumber(value, 0) * (Math.PI / 180);
}

function playFolderOpen(context, laneKey = "folder-open") {
  const { motionParams, runtime, scene } = context;
  const params = normalizeMotionLabParams(motionParams);
  motionTo(scene.folderPanel, {
    alpha: 1,
    driver: makeTween(motionParams),
    from: { alpha: 0.22, scale: params.folderClosedScale, y: 174 + params.folderTravelPx },
    ...interruptOptions(motionParams),
    lane: "base",
    laneKey,
    scale: params.folderOpenScale,
    sourceLabel: "motionLab.folder.panel",
    y: 174,
  }, {
    debugMetadata: { kind: "MotionLabPanel", label: "folderPanel" },
    runtime,
  });
}

function playFolderClose(context, laneKey = "folder-close") {
  const { motionParams, runtime, scene } = context;
  const params = normalizeMotionLabParams(motionParams);
  scene.folderPanel.alpha = 1;
  scene.folderPanel.scale.set(params.folderOpenScale);
  scene.folderPanel.y = 174;
  motionTo(scene.folderPanel, {
    alpha: 0.18,
    driver: makeTween(motionParams, { duration: shortTweenDuration(motionParams, 0.62) }),
    ...interruptOptions(motionParams),
    lane: "base",
    laneKey,
    scale: params.folderClosedScale,
    sourceLabel: "motionLab.folder.panel",
    y: 174 + params.folderTravelPx,
  }, {
    debugMetadata: { kind: "MotionLabPanel", label: "folderPanel" },
    runtime,
  });
}

function stepRuntime(context, seconds = 0.08) {
  context.runtime?.step?.(seconds);
  context.refreshReport?.();
}

function stepInterruptionDelay(context) {
  const params = normalizeMotionLabParams(context.motionParams);
  stepRuntime(context, params.interruptDelayMs / 1000);
}

function createScenario(definition) {
  return Object.freeze({
    assertAfterMs: 760,
    description: "",
    stage: "dsl",
    ...definition,
    assertions: Object.freeze(definition.assertions || []),
  });
}

export const MOTION_LAB_SCENARIOS = Object.freeze([
  createScenario({
    assertions: [{
      id: "folder-open-track",
      label: "文件夹面板记录 scale/alpha 轨道",
      test: ({ report }) => hasTrack(report, "motionLab.folder.panel", "alpha") && hasTrack(report, "motionLab.folder.panel", "x"),
    }],
    description: "文件夹面板进入时的 scale、y 与 alpha 动画",
    id: "folder-open",
    label: "打开文件夹",
    run: playFolderOpen,
  }),
  createScenario({
    assertions: [{
      id: "folder-close-track",
      label: "文件夹关闭产生面板事件",
      test: ({ report }) => hasTrack(report, "motionLab.folder.panel", "alpha") && hasTrack(report, "motionLab.folder.panel", "x"),
    }],
    description: "文件夹面板退出时的 scale 与 alpha 动画",
    id: "folder-close",
    label: "关闭文件夹",
    run: playFolderClose,
  }),
  createScenario({
    assertions: [{
      id: "open-close-cancel",
      label: "打开动作被关闭动作中断",
      test: ({ report }) => hasEvent(report, (event) => event.type === "cancel" && event.reason === "replace" && event.sourceLabel === "motionLab.folder.panel"),
    }],
    description: "开始打开后，由关闭动作替换同一通道",
    id: "folder-open-interrupted-by-close",
    label: "打开被关闭中断",
    run: (context) => {
      playFolderOpen(context, "folder-panel-interrupt");
      stepInterruptionDelay(context);
      playFolderClose(context, "folder-panel-interrupt");
    },
  }),
  createScenario({
    assertions: [{
      id: "close-open-cancel",
      label: "关闭动作被打开动作中断",
      test: ({ report }) => hasEvent(report, (event) => event.type === "cancel" && event.reason === "replace" && event.sourceLabel === "motionLab.folder.panel"),
    }],
    description: "开始关闭后，由打开动作替换同一通道",
    id: "folder-close-interrupted-by-open",
    label: "关闭被打开中断",
    run: (context) => {
      playFolderClose(context, "folder-panel-interrupt");
      stepInterruptionDelay(context);
      playFolderOpen(context, "folder-panel-interrupt");
    },
  }),
  createScenario({
    assertions: [{
      id: "desktop-page-retarget",
      label: "桌面翻页拖动会重定向页面轨道",
      test: ({ report }) => hasEvent(report, (event) => event.type === "retarget" && event.sourceLabel === "motionLab.pageTrack"),
    }],
    description: "桌面页面轨道弹向另一页并发生 retarget",
    id: "desktop-page-scrub",
    label: "桌面翻页拖动",
    run: ({ motionParams, runtime, scene }) => {
      const params = normalizeMotionLabParams(motionParams);
      motionTo(scene.pageTrack, {
        driver: makeSpring(motionParams),
        from: { x: 0 },
        ...interruptOptions(motionParams),
        lane: "base",
        laneKey: "desktop-page-scrub",
        sourceLabel: "motionLab.pageTrack",
        x: -params.pageDistancePx,
      }, {
        debugMetadata: { kind: "MotionLabPageTrack", label: "pageTrack" },
        runtime,
      });
      runtime.step(0.08);
      motionTo(scene.pageTrack, {
        driver: makeSpring(motionParams),
        ...interruptOptions(motionParams),
        lane: "base",
        laneKey: "desktop-page-scrub",
        sourceLabel: "motionLab.pageTrack",
        x: -Math.round(params.pageDistancePx * 0.52),
      }, {
        debugMetadata: { kind: "MotionLabPageTrack", label: "pageTrack" },
        runtime,
      });
    },
  }),
  createScenario({
    assertions: [{
      id: "folder-page-progress",
      label: "文件夹翻页拖动产生 progress 通道",
      test: ({ report }) => hasTrack(report, "motionLab.folder.pageTrack", "x"),
    }],
    description: "文件夹内部页面轨道使用 progress 拖动",
    id: "folder-page-scrub",
    label: "文件夹翻页拖动",
    run: ({ motionParams, runtime, scene }) => {
      const params = normalizeMotionLabParams(motionParams);
      scene.folderPanel.alpha = 1;
      scene.folderPanel.scale.set(params.folderOpenScale);
      motionTo(scene.folderPageTrack, {
        driver: progressDriver({ completeAtEnd: false, ease: params.ease, progress: 0.72 }),
        from: { x: 0 },
        lane: "base",
        laneKey: "folder-page-scrub",
        sourceLabel: "motionLab.folder.pageTrack",
        x: -Math.round(params.pageDistancePx * 0.57),
      }, {
        debugMetadata: { kind: "MotionLabFolderPageTrack", label: "folderPageTrack" },
        runtime,
      });
      runtime.step(0.04);
    },
  }),
  createScenario({
    assertions: [{
      id: "drag-release-track",
      label: "拖拽幽灵在 x/y 方向释放",
      test: ({ report }) => hasTrack(report, "motionLab.drag.ghost", "x") && hasTrack(report, "motionLab.drag.ghost", "y"),
    }],
    description: "拖拽幽灵回落到网格",
    id: "drag-release",
    label: "拖拽释放",
    run: ({ motionParams, runtime, scene }) => {
      const params = normalizeMotionLabParams(motionParams);
      scene.dragGhost.alpha = 0.85;
      scene.dragGhost.position.set(210, 112);
      motionTo(scene.dragGhost, {
        alpha: 1,
        driver: makeSpring(motionParams),
        ...interruptOptions(motionParams),
        lane: "base",
        laneKey: "drag-release",
        sourceLabel: "motionLab.drag.ghost",
        x: 210 + params.dragDistancePx,
        y: params.dragReleaseYPx,
      }, {
        debugMetadata: { kind: "MotionLabGhost", label: "dragGhost" },
        runtime,
      });
    },
  }),
  createScenario({
    assertions: [{
      id: "icon-press-factor",
      label: "图标按压使用 factor 通道",
      test: ({ report }) => hasEvent(report, (event) => event.sourceLabel === "motionLab.icon.1" && event.lane === "factor" && event.laneKey === "press"),
    }],
    description: "图标通过 factor 缩放完成按下与释放",
    id: "icon-press-release",
    label: "图标按压 / 释放",
    run: ({ motionParams, runtime, scene }) => {
      const params = normalizeMotionLabParams(motionParams);
      motionSequence(scene.icons[0], [
        {
          driver: tween({ duration: shortTweenDuration(motionParams), ease: params.ease }),
          lane: "factor",
          laneKey: "press",
          scale: params.iconPressScale,
          sourceLabel: "motionLab.icon.1",
        },
        {
          driver: makeSpring(motionParams),
          lane: "factor",
          laneKey: "press",
          scale: 1,
          sourceLabel: "motionLab.icon.1",
        },
      ], {
        debugMetadata: { kind: "MotionLabIcon", label: "icon 1" },
        runtime,
      });
    },
  }),
  createScenario({
    assertions: [{
      id: "folder-hover",
      label: "文件夹悬停驱动 hover 通道",
      test: ({ report }) => hasEvent(report, (event) => event.sourceLabel === "motionLab.folder.hover" && event.laneKey === "folder-hover"),
    }],
    description: "文件夹目标悬停环与图标缩放",
    id: "folder-hover",
    label: "文件夹悬停",
    run: ({ motionParams, runtime, scene }) => {
      const params = normalizeMotionLabParams(motionParams);
      scene.folderHover.alpha = 0;
      motionTo(scene.folderHover, {
        alpha: 0.82,
        driver: makeTween(motionParams, { duration: shortTweenDuration(motionParams, 0.5) }),
        lane: "base",
        laneKey: "folder-hover",
        scale: params.folderHoverScale,
        sourceLabel: "motionLab.folder.hover",
      }, {
        debugMetadata: { kind: "MotionLabHover", label: "folderHover" },
        runtime,
      });
      motionTo(scene.icons[1], {
        driver: makeSpring(motionParams),
        lane: "factor",
        laneKey: "folder-hover",
        scale: params.iconHoverScale,
        sourceLabel: "motionLab.icon.2",
      }, {
        debugMetadata: { kind: "MotionLabIcon", label: "icon 2" },
        runtime,
      });
    },
  }),
  createScenario({
    assertions: [{
      id: "app-folder-create-hover",
      label: "应用成组悬停产生 create 通道",
      test: ({ report }) => hasEvent(report, (event) => event.sourceLabel === "motionLab.appFolderCreate.hover" && event.laneKey === "app-folder-create-hover"),
    }],
    description: "应用成组创建时的悬停闪烁目标",
    id: "app-folder-create-hover",
    label: "应用成组创建悬停",
    run: ({ motionParams, runtime, scene }) => {
      const params = normalizeMotionLabParams(motionParams);
      scene.createHover.alpha = 0;
      motionTo(scene.createHover, {
        alpha: 0.9,
        driver: makeTween(motionParams, { duration: shortTweenDuration(motionParams, 0.62) }),
        lane: "base",
        laneKey: "app-folder-create-hover",
        scale: params.folderHoverScale,
        sourceLabel: "motionLab.appFolderCreate.hover",
      }, {
        debugMetadata: { kind: "MotionLabCreateHover", label: "createHover" },
        runtime,
      });
    },
  }),
  createScenario({
    assertions: [{
      id: "edit-jiggle-additive",
      label: "编辑抖动使用 additive 通道",
      test: ({ report }) => hasEvent(report, (event) => event.sourceLabel === "motionLab.icon.1" && event.lane === "additive" && event.laneKey === "edit-jiggle"),
    }],
    description: "编辑模式抖动驱动叠加旋转",
    id: "edit-jiggle",
    label: "编辑模式抖动",
    run: ({ motionParams, runtime, scene }) => {
      const params = normalizeMotionLabParams(motionParams);
      motionTo(scene.icons[0], {
        driver: tween({ duration: shortTweenDuration(motionParams, 0.22), ease: params.ease, repeat: 5, yoyo: true }),
        lane: "additive",
        laneKey: "edit-jiggle",
        rotation: degreesToRadians(params.jiggleRotationDeg),
        sourceLabel: "motionLab.icon.1",
      }, {
        debugMetadata: { kind: "MotionLabIcon", label: "icon 1" },
        runtime,
      });
      motionTo(scene.icons[1], {
        driver: tween({ duration: shortTweenDuration(motionParams, 0.22), ease: params.ease, repeat: 5, yoyo: true }),
        lane: "additive",
        laneKey: "edit-jiggle",
        rotation: -degreesToRadians(params.jiggleRotationDeg),
        sourceLabel: "motionLab.icon.2",
      }, {
        debugMetadata: { kind: "MotionLabIcon", label: "icon 2" },
        runtime,
      });
    },
  }),
  createScenario({
    assertAfterMs: 900,
    assertions: [{
      id: "hundred-icon-retarget",
      label: "100+ 图标重定向会产生 retarget 事件",
      test: ({ report }) => countEvents(report, (event) => event.type === "retarget" && String(event.sourceLabel || "").startsWith("motionLab.massIcon.")) >= 100,
    }],
    description: "100+ 图标布局弹簧 retarget 压力场景",
    id: "hundred-icon-layout-retarget",
    label: "100+ 图标布局重定向",
    run: ({ motionParams, runtime, scene }) => {
      const params = normalizeMotionLabParams(motionParams);
      scene.massIconLayer.alpha = 1;
      scene.massIcons.forEach((icon, index) => {
        const col = index % 18;
        const row = Math.floor(index / 18);
        const sourceLabel = `motionLab.massIcon.${index + 1}`;
        motionTo(icon, {
          driver: makeSpring(motionParams, { damping: params.springDamping + 4 }),
          ...interruptOptions(motionParams),
          lane: "base",
          laneKey: "mass-layout",
          sourceLabel,
          x: 112 + col * 32,
          y: 84 + row * 28,
        }, {
          debugMetadata: { kind: "MotionLabMassIcon", label: `mass icon ${index + 1}` },
          runtime,
        });
      });
      runtime.step(0.08);
      scene.massIcons.forEach((icon, index) => {
        const col = index % 18;
        const row = Math.floor(index / 18);
        const sourceLabel = `motionLab.massIcon.${index + 1}`;
        motionTo(icon, {
          driver: makeSpring(motionParams, { damping: params.springDamping + 4 }),
          ...interruptOptions(motionParams),
          lane: "base",
          laneKey: "mass-layout",
          sourceLabel,
          x: 92 + (17 - col) * 31,
          y: 72 + row * 26,
        }, {
          debugMetadata: { kind: "MotionLabMassIcon", label: `mass icon ${index + 1}` },
          runtime,
        });
      });
    },
  }),
]);

export function getMotionLabScenario(id) {
  return MOTION_LAB_SCENARIOS.find((scenario) => scenario.id === id) || MOTION_LAB_SCENARIOS[0];
}

export function runMotionLabScenario(id, context) {
  const scenario = getMotionLabScenario(id);
  scenario?.run?.(context);
  return scenario;
}

export function evaluateMotionLabScenarioAssertions(scenario, context) {
  const assertions = scenario?.assertions || [];
  return assertions.map((assertion) => {
    try {
      const passed = Boolean(assertion.test?.(context));
      return {
        detail: assertion.detail || assertion.label,
        id: assertion.id,
        label: assertion.label,
        passed,
        status: passed ? "pass" : "fail",
      };
    } catch (error) {
      return {
        detail: error instanceof Error ? error.message : String(error),
        id: assertion.id,
        label: assertion.label,
        passed: false,
        status: "fail",
      };
    }
  });
}
