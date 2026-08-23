import { motionSequence, motionTo, progressDriver, spring, tween } from "../rendering/motionPort.js";
import { normalizeMotionLabParams } from "./motionLabParams.js";
import type { Container } from "pixi.js";
import type { MotionDebugReport, MotionRuntime, MotionTraceRecord } from "../rendering/motionPort.js";
import type { MotionLabParamsInput } from "./motionLabParams.js";

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
] as const);

export type MotionLabScenarioId = (typeof MOTION_LAB_SCENARIO_IDS)[number];

export interface MotionLabScene {
  createHover: Container;
  dragGhost: Container;
  folderHover: Container;
  folderPageTrack: Container;
  folderPanel: Container;
  icons: readonly Container[];
  massIconLayer: Container;
  massIcons: readonly Container[];
  pageTrack: Container;
}

type MotionLabReportInput = Readonly<
  Partial<Omit<MotionDebugReport, "history">>
  & { history?: Readonly<{ events?: readonly MotionTraceRecord[] }> }
>;

export interface MotionLabScenarioContext {
  motionParams: MotionLabParamsInput;
  refreshReport?: (() => void) | undefined;
  report?: MotionLabReportInput | null | undefined;
  runtime: MotionRuntime;
  scene: MotionLabScene;
}

export interface MotionLabScenarioAssertion {
  detail?: string;
  detailKey?: string;
  id: string;
  label: string;
  labelKey?: string;
  test: (context: MotionLabScenarioContext) => boolean;
}

interface MotionLabScenarioDefinition {
  assertAfterMs?: number;
  assertions?: readonly Omit<MotionLabScenarioAssertion, "labelKey">[];
  description: string;
  id: MotionLabScenarioId;
  label: string;
  run: (context: MotionLabScenarioContext) => void;
  stage?: string;
}

export interface MotionLabScenario extends Omit<MotionLabScenarioDefinition, "assertions"> {
  assertAfterMs: number;
  assertions: readonly Readonly<MotionLabScenarioAssertion>[];
  descriptionKey: string;
  labelKey: string;
  stage: string;
}

export interface MotionLabAssertionResult {
  detail: string;
  detailKey: string | null;
  id: string;
  label: string;
  labelKey: string;
  passed: boolean;
  status: "fail" | "pass";
}

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasEvent(report: MotionLabReportInput | null = {}, predicate: (event: MotionTraceRecord) => boolean = () => false): boolean {
  return (report?.history?.events || []).some(predicate);
}

function hasTrack(report: MotionLabReportInput | null = {}, sourceLabel: string, prop: string | null = null): boolean {
  return (report?.history?.events || []).some((event) => (
    event.sourceLabel === sourceLabel && (prop == null || event.prop === prop)
  ));
}

function countEvents(report: MotionLabReportInput | null = {}, predicate: (event: MotionTraceRecord) => boolean = () => true): number {
  return (report?.history?.events || []).filter(predicate).length;
}

function makeSpring(params: MotionLabParamsInput = {}, overrides: Parameters<typeof spring>[0] = {}) {
  const normalized = normalizeMotionLabParams(params);
  return spring({
    damping: normalized.springDamping,
    mass: normalized.springMass,
    stiffness: normalized.springStiffness,
    ...overrides,
  });
}

function makeTween(params: MotionLabParamsInput = {}, overrides: Parameters<typeof tween>[0] = {}) {
  const normalized = normalizeMotionLabParams(params);
  return tween({
    duration: normalized.durationMs / 1000,
    ease: normalized.ease,
    ...overrides,
  });
}

function interruptOptions(params: MotionLabParamsInput = {}) {
  const normalized = normalizeMotionLabParams(params);
  return {
    blendDuration: normalized.blendDurationMs / 1000,
    blendEase: normalized.ease,
    interrupt: normalized.interruptPolicy,
  };
}

function shortTweenDuration(params: MotionLabParamsInput = {}, factor = 0.33): number {
  const normalized = normalizeMotionLabParams(params);
  return Math.max(0.06, (normalized.durationMs / 1000) * factor);
}

function degreesToRadians(value: unknown): number {
  return readNumber(value, 0) * (Math.PI / 180);
}

function playFolderOpen(context: MotionLabScenarioContext, laneKey = "folder-open"): void {
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

function playFolderClose(context: MotionLabScenarioContext, laneKey = "folder-close"): void {
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

function stepRuntime(context: MotionLabScenarioContext, seconds = 0.08): void {
  context.runtime?.step?.(seconds);
  context.refreshReport?.();
}

function stepInterruptionDelay(context: MotionLabScenarioContext): void {
  const params = normalizeMotionLabParams(context.motionParams);
  stepRuntime(context, params.interruptDelayMs / 1000);
}

function toMessageSegment(value: unknown): string {
  return String(value || "")
    .replace(/-([a-z0-9])/g, (_match: string, character: string) => character.toUpperCase());
}

function createScenario(definition: MotionLabScenarioDefinition): Readonly<MotionLabScenario> {
  const messageBase = `motionLab.scenarios.${toMessageSegment(definition.id)}`;
  return Object.freeze({
    assertAfterMs: 760,
    stage: "dsl",
    ...definition,
    descriptionKey: `${messageBase}.description`,
    labelKey: `${messageBase}.label`,
    assertions: Object.freeze((definition.assertions || []).map((assertion) => Object.freeze({
      ...assertion,
      labelKey: `${messageBase}.assertions.${toMessageSegment(assertion.id)}`,
    }))),
  });
}

export const MOTION_LAB_SCENARIOS = Object.freeze([
  createScenario({
    assertions: [{
      id: "folder-open-track",
      label: "The folder panel records scale and alpha tracks",
      test: ({ report }) => hasTrack(report, "motionLab.folder.panel", "alpha") && hasTrack(report, "motionLab.folder.panel", "x"),
    }],
    description: "Animates the folder panel scale, y position, and alpha as it enters.",
    id: "folder-open",
    label: "Open folder",
    run: playFolderOpen,
  }),
  createScenario({
    assertions: [{
      id: "folder-close-track",
      label: "Closing the folder produces panel events",
      test: ({ report }) => hasTrack(report, "motionLab.folder.panel", "alpha") && hasTrack(report, "motionLab.folder.panel", "x"),
    }],
    description: "Animates the folder panel scale and alpha as it exits.",
    id: "folder-close",
    label: "Close folder",
    run: playFolderClose,
  }),
  createScenario({
    assertions: [{
      id: "open-close-cancel",
      label: "The close action interrupts the open action",
      test: ({ report }) => hasEvent(report, (event) => event.type === "cancel" && event.reason === "replace" && event.sourceLabel === "motionLab.folder.panel"),
    }],
    description: "Starts opening, then replaces the same lane with a close action.",
    id: "folder-open-interrupted-by-close",
    label: "Open interrupted by close",
    run: (context) => {
      playFolderOpen(context, "folder-panel-interrupt");
      stepInterruptionDelay(context);
      playFolderClose(context, "folder-panel-interrupt");
    },
  }),
  createScenario({
    assertions: [{
      id: "close-open-cancel",
      label: "The open action interrupts the close action",
      test: ({ report }) => hasEvent(report, (event) => event.type === "cancel" && event.reason === "replace" && event.sourceLabel === "motionLab.folder.panel"),
    }],
    description: "Starts closing, then replaces the same lane with an open action.",
    id: "folder-close-interrupted-by-open",
    label: "Close interrupted by open",
    run: (context) => {
      playFolderClose(context, "folder-panel-interrupt");
      stepInterruptionDelay(context);
      playFolderOpen(context, "folder-panel-interrupt");
    },
  }),
  createScenario({
    assertions: [{
      id: "desktop-page-retarget",
      label: "Desktop page dragging retargets the page track",
      test: ({ report }) => hasEvent(report, (event) => event.type === "retarget" && event.sourceLabel === "motionLab.pageTrack"),
    }],
    description: "Springs the desktop page track toward another page and retargets it.",
    id: "desktop-page-scrub",
    label: "Desktop page drag",
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
      label: "Folder page dragging produces a progress lane",
      test: ({ report }) => hasTrack(report, "motionLab.folder.pageTrack", "x"),
    }],
    description: "Drags the folder's internal page track with progress.",
    id: "folder-page-scrub",
    label: "Folder page drag",
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
      label: "The drag ghost releases along x and y",
      test: ({ report }) => hasTrack(report, "motionLab.drag.ghost", "x") && hasTrack(report, "motionLab.drag.ghost", "y"),
    }],
    description: "Drops the drag ghost back onto the grid.",
    id: "drag-release",
    label: "Drag release",
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
      label: "Icon pressing uses a factor lane",
      test: ({ report }) => hasEvent(report, (event) => event.sourceLabel === "motionLab.icon.1" && event.lane === "factor" && event.laneKey === "press"),
    }],
    description: "Presses and releases an icon through factor scaling.",
    id: "icon-press-release",
    label: "Icon press / release",
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
      label: "Folder hover drives the hover lane",
      test: ({ report }) => hasEvent(report, (event) => event.sourceLabel === "motionLab.folder.hover" && event.laneKey === "folder-hover"),
    }],
    description: "Animates the folder target hover ring and icon scale.",
    id: "folder-hover",
    label: "Folder hover",
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
      label: "App grouping hover produces a create lane",
      test: ({ report }) => hasEvent(report, (event) => event.sourceLabel === "motionLab.appFolderCreate.hover" && event.laneKey === "app-folder-create-hover"),
    }],
    description: "Animates the hover pulse used while grouping apps.",
    id: "app-folder-create-hover",
    label: "App grouping hover",
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
      label: "Edit jiggle uses an additive lane",
      test: ({ report }) => hasEvent(report, (event) => event.sourceLabel === "motionLab.icon.1" && event.lane === "additive" && event.laneKey === "edit-jiggle"),
    }],
    description: "Drives additive rotation for edit-mode jiggle.",
    id: "edit-jiggle",
    label: "Edit-mode jiggle",
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
      label: "Retargeting 100+ icons produces retarget events",
      test: ({ report }) => countEvents(report, (event) => event.type === "retarget" && String(event.sourceLabel || "").startsWith("motionLab.massIcon.")) >= 100,
    }],
    description: "Stress-tests layout spring retargeting with more than 100 icons.",
    id: "hundred-icon-layout-retarget",
    label: "100+ icon layout retarget",
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

export function getMotionLabScenario(id: unknown): Readonly<MotionLabScenario> {
  return MOTION_LAB_SCENARIOS.find((scenario) => scenario.id === id) || MOTION_LAB_SCENARIOS[0]!;
}

export function runMotionLabScenario(id: unknown, context: MotionLabScenarioContext): Readonly<MotionLabScenario> {
  const scenario = getMotionLabScenario(id);
  scenario?.run?.(context);
  return scenario;
}

export function evaluateMotionLabScenarioAssertions(scenario: MotionLabScenario | null | undefined, context: MotionLabScenarioContext): MotionLabAssertionResult[] {
  const assertions = scenario?.assertions || [];
  return assertions.map((assertion) => {
    try {
      const passed = Boolean(assertion.test?.(context));
      return {
        detail: assertion.detail || assertion.label,
        detailKey: assertion.detailKey || assertion.labelKey || null,
        id: assertion.id,
        label: assertion.label,
        labelKey: assertion.labelKey || "",
        passed,
        status: passed ? "pass" : "fail",
      };
    } catch (error) {
      return {
        detail: error instanceof Error ? error.message : String(error),
        detailKey: null,
        id: assertion.id,
        label: assertion.label,
        labelKey: assertion.labelKey || "",
        passed: false,
        status: "fail",
      };
    }
  });
}
