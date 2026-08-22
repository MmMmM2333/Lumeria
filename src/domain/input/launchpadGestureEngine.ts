import { launchpadGesturePolicy } from "./launchpadGesturePolicy.js";
import type { LaunchpadGesturePolicy } from "./launchpadGesturePolicy.js";

export type LaunchpadGestureTarget =
  | Readonly<{ id?: string | null; itemType?: string | null; kind: "icon" }>
  | Readonly<{ action?: string; kind: "surface" }>;

export type LaunchpadGestureViewport = Readonly<{
  pageCount: number;
  pageIndex: number;
  pageWidth: number;
  scope: string;
}>;

type ViewportInput = Readonly<{
  pageCount?: unknown;
  pageIndex?: unknown;
  pageWidth?: unknown;
  scope?: string;
}>;

export type LaunchpadGestureInput = Readonly<{
  button?: unknown;
  buttons?: number;
  ctrlKey?: boolean;
  deltaMode?: unknown;
  deltaX?: unknown;
  deltaY?: unknown;
  dragOnHold?: boolean;
  isPrimary?: boolean;
  kind?: string;
  metaKey?: boolean;
  momentum?: boolean | null;
  pointerId?: number | null | undefined;
  pointerType?: string;
  target?: LaunchpadGestureTarget;
  time?: unknown;
  type?: string;
  viewport?: ViewportInput;
  x?: unknown;
  y?: unknown;
}>;

export type LaunchpadPagePresentation = Readonly<{
  direction: -1 | 1;
  edge: boolean;
  fromIndex: number;
  phase: "scrub" | "settle";
  progress: number;
  scope: string;
  settle?: true;
  settleToken?: string;
  targetProgress?: 0 | 1;
  toIndex: number;
  velocity?: number;
}>;

export type LaunchpadTargetPresentation = Readonly<{
  phase: "armed" | "pressing";
  scope: string;
  target: Extract<LaunchpadGestureTarget, { kind: "icon" }>;
}>;

export type LaunchpadGestureDeadline = Readonly<{
  at: number;
  kind: "clearPresentation" | "hold" | "wheelEnd";
}>;

type PointerPayload = Readonly<{
  button?: unknown;
  buttons?: number;
  isPrimary?: boolean;
  pointerId?: number | null | undefined;
  pointerType?: string;
  time?: unknown;
  x?: unknown;
  y?: unknown;
}>;

export type LaunchpadGestureCommand =
  | Readonly<{ pageIndex: number; scope: string; type: "commitPage" }>
  | Readonly<{ target: LaunchpadGestureTarget; type: "activateTarget" }>
  | Readonly<{ target: LaunchpadGestureTarget; type: "surfaceTap" }>
  | Readonly<{ pointer: PointerPayload; target: LaunchpadGestureTarget; type: "cancelDrag" }>
  | Readonly<{ pointer: PointerPayload; target: LaunchpadGestureTarget; type: "finishDrag" }>
  | Readonly<{ pointer: PointerPayload; target: LaunchpadGestureTarget; type: "openContextMenu" }>
  | Readonly<{ pointer: PointerPayload; target: LaunchpadGestureTarget; type: "updateDrag" }>
  | Readonly<{
      dragAnchor: Readonly<{ x: number; y: number }>;
      dragStartedFromThreshold?: true;
      pointer: PointerPayload;
      target: LaunchpadGestureTarget;
      type: "startDrag";
    }>;

export type LaunchpadGestureOutput = Readonly<{
  commands: LaunchpadGestureCommand[];
  deadline?: LaunchpadGestureDeadline | null;
  handled: boolean;
  ownsPointer?: boolean;
  presentation: LaunchpadPagePresentation | null;
  releasesPointer?: boolean;
  targetPresentation?: LaunchpadTargetPresentation | null;
}>;

type PointerPan = Readonly<{
  direction: -1 | 1;
  edge: boolean;
  fromIndex: number;
  progress: number;
  scope: string;
  toIndex: number;
}>;

type PointerSession = {
  canceled?: boolean;
  dragging?: boolean;
  dragOnHold: boolean;
  held?: boolean;
  holdX?: number;
  holdY?: number;
  id: number | null | undefined;
  lastTime: number;
  lastX: number;
  lastY: number;
  pan?: PointerPan;
  panning?: boolean;
  pointerType: string;
  startX: number;
  startY: number;
  target: LaunchpadGestureTarget;
  velocityX: number;
  viewport: LaunchpadGestureViewport;
};

type WheelSession = {
  classification: "continuous" | "discrete" | "unknown";
  clearPresentationAt?: number;
  lastDelta: number;
  lastTime: number;
  nextRepeatAt?: number;
  phase?: "draining";
  presentation?: LaunchpadPagePresentation;
  sampleCount: number;
  travel: number;
  velocity: number;
  viewport: LaunchpadGestureViewport;
};

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeViewport(viewport: ViewportInput = {}): LaunchpadGestureViewport {
  return {
    scope: viewport.scope || "desktop",
    pageIndex: Math.max(0, Math.trunc(readNumber(viewport.pageIndex, 0))),
    pageCount: Math.max(0, Math.trunc(readNumber(viewport.pageCount, 0))),
    pageWidth: Math.max(1, readNumber(viewport.pageWidth, 1)),
  };
}

function isPrimaryPointerDown(input: LaunchpadGestureInput): boolean {
  return input?.isPrimary !== false && readNumber(input?.button, 0) === 0;
}

function resistEdgeProgress(rawProgress: number, maxProgress: unknown): number {
  const limit = Math.max(0.01, readNumber(maxProgress, 0.12));
  return limit * (1 - Math.exp(-Math.max(0, rawProgress) / limit));
}

export function createLaunchpadGestureEngine(
  policyOverrides: Partial<LaunchpadGesturePolicy> = {},
): Readonly<{ dispatch: (input?: LaunchpadGestureInput) => LaunchpadGestureOutput }> {
  const policy = { ...launchpadGesturePolicy, ...policyOverrides };
  let pointer: PointerSession | null = null;
  let wheel: WheelSession | null = null;
  let settleSequence = 0;

  function makeTargetPresentation(
    session: PointerSession | null,
    phase: LaunchpadTargetPresentation["phase"],
  ): LaunchpadTargetPresentation | null {
    if (session?.target?.kind !== "icon") return null;
    return {
      phase,
      scope: session.viewport.scope,
      target: session.target,
    };
  }

  function samplePointer(input: LaunchpadGestureInput): void {
    if (!pointer) return;
    const time = readNumber(input.time, pointer.lastTime);
    const x = readNumber(input.x, pointer.lastX);
    const y = readNumber(input.y, pointer.lastY);
    const dtMs = Math.max(1, Math.min(policy.pointerVelocityMaxDeltaMs, time - pointer.lastTime));
    const instantVelocityX = ((x - pointer.lastX) / dtMs) * 1000;
    pointer.velocityX += (instantVelocityX - pointer.velocityX) * policy.pointerVelocitySmoothing;
    pointer.lastTime = time;
    pointer.lastX = x;
    pointer.lastY = y;
  }

  function getPointerPan(input: LaunchpadGestureInput): PointerPan | null {
    const activePointer = pointer!;
    const dx = readNumber(input.x) - activePointer.startX;
    const dy = readNumber(input.y) - activePointer.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (!activePointer.panning) {
      const canPanFromTarget = activePointer.target?.kind === "surface" || activePointer.pointerType !== "mouse";
      if (!canPanFromTarget || absX < policy.pointerPanThreshold || absX < absY * policy.pointerPanDominance) return null;
    }
    const direction = dx < 0 ? 1 : -1;
    const toIndex = activePointer.viewport.pageIndex + direction;
    const edge = toIndex < 0 || toIndex >= activePointer.viewport.pageCount;
    const rawProgress = absX / activePointer.viewport.pageWidth;
    return {
      direction,
      edge,
      fromIndex: activePointer.viewport.pageIndex,
      progress: edge ? resistEdgeProgress(rawProgress, policy.edgeMaxProgress) : Math.min(1, rawProgress),
      scope: activePointer.viewport.scope,
      toIndex,
    };
  }

  function beginPointer(input: LaunchpadGestureInput): LaunchpadGestureOutput {
    if (pointer || !isPrimaryPointerDown(input)) return { handled: false, presentation: null, commands: [] };
    wheel = null;
    pointer = {
      dragOnHold: input.dragOnHold === true,
      id: input.pointerId,
      lastTime: readNumber(input.time),
      lastX: readNumber(input.x),
      lastY: readNumber(input.y),
      pointerType: input.pointerType || "mouse",
      startX: readNumber(input.x),
      startY: readNumber(input.y),
      target: input.target || { kind: "surface" },
      viewport: normalizeViewport(input.viewport),
      velocityX: 0,
    };
    return {
      handled: false,
      ownsPointer: true,
      presentation: null,
      targetPresentation: makeTargetPresentation(pointer, "pressing"),
      commands: [],
      deadline: pointer.target?.kind === "icon"
        ? { kind: "hold", at: readNumber(input.time) + policy.holdDurationMs }
        : null,
    };
  }

  function movePointer(input: LaunchpadGestureInput): LaunchpadGestureOutput {
    if (!pointer || (pointer.id != null && input.pointerId != null && pointer.id !== input.pointerId)) {
      return { handled: false, presentation: null, commands: [] };
    }
    if (typeof input.buttons === "number" && (input.buttons & 1) !== 1) {
      return cancelPointer({ ...input, type: "pointerCancel" });
    }
    samplePointer(input);
    if (pointer.dragging) {
      return {
        handled: true,
        presentation: null,
        commands: [{ type: "updateDrag", pointer: input, target: pointer.target }],
        deadline: null,
      };
    }
    if (pointer.held) {
      const distance = Math.hypot(
        readNumber(input.x) - pointer.holdX!,
        readNumber(input.y) - pointer.holdY!
      );
      if (distance < policy.dragStartDistance) {
        return { handled: true, presentation: null, commands: [], deadline: null };
      }
      pointer.dragging = true;
      return {
        handled: true,
        presentation: null,
        targetPresentation: null,
        commands: [{
          dragAnchor: { x: pointer.startX, y: pointer.startY },
          dragStartedFromThreshold: true,
          type: "startDrag",
          pointer: input,
          target: pointer.target,
        }],
        deadline: null,
      };
    }
    const pan = getPointerPan(input);
    if (!pan) {
      const distance = Math.hypot(readNumber(input.x) - pointer.startX, readNumber(input.y) - pointer.startY);
      if (distance >= policy.pointerPanThreshold) {
        pointer.canceled = true;
        return {
          handled: false,
          presentation: null,
          targetPresentation: null,
          commands: [],
          deadline: null,
        };
      }
      return { handled: false, presentation: null, commands: [] };
    }
    pointer.panning = true;
    pointer.pan = pan;
    return {
      handled: true,
      presentation: {
        phase: "scrub",
        ...pan,
      },
      targetPresentation: null,
      commands: [],
      deadline: null,
    };
  }

  function handleDeadline(input: LaunchpadGestureInput): LaunchpadGestureOutput {
    if (input.kind !== "hold" || !pointer || pointer.panning || pointer.canceled || pointer.target?.kind !== "icon") {
      return { handled: false, presentation: null, commands: [], deadline: null };
    }
    pointer.holdX = pointer.lastX;
    pointer.holdY = pointer.lastY;
    pointer.held = true;
    if (pointer.dragOnHold) {
      pointer.dragging = true;
      return {
        handled: true,
        presentation: null,
        targetPresentation: null,
        commands: [{
          dragAnchor: { x: pointer.startX, y: pointer.startY },
          type: "startDrag",
          pointer: {
            button: 0,
            buttons: 1,
            isPrimary: true,
            pointerId: pointer.id,
            pointerType: pointer.pointerType,
            time: pointer.lastTime,
            x: pointer.lastX,
            y: pointer.lastY,
          },
          target: pointer.target,
        }],
        deadline: null,
      };
    }
    return {
      handled: true,
      presentation: null,
      targetPresentation: makeTargetPresentation(pointer, "armed"),
      commands: [],
      deadline: null,
    };
  }

  function normalizeWheelDelta(input: LaunchpadGestureInput, viewport: LaunchpadGestureViewport): number {
    const mode = Math.trunc(readNumber(input.deltaMode, 0));
    const factor = mode === 1
      ? policy.wheelLineHeight
      : mode === 2
        ? viewport.pageWidth
        : 1;
    const deltaX = readNumber(input.deltaX) * factor;
    const deltaY = readNumber(input.deltaY) * factor;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX >= absY * policy.wheelPanDominance) return deltaX;
    if (absY >= absX * policy.wheelPanDominance) return deltaY;
    return absX >= absY ? deltaX : deltaY;
  }

  function makeWheelPresentation(session: WheelSession): LaunchpadPagePresentation {
    const direction = session.travel >= 0 ? 1 : -1;
    const toIndex = session.viewport.pageIndex + direction;
    const edge = toIndex < 0 || toIndex >= session.viewport.pageCount;
    const rawProgress = Math.abs(session.travel) / session.viewport.pageWidth;
    return {
      direction,
      edge,
      fromIndex: session.viewport.pageIndex,
      phase: "scrub",
      progress: edge ? resistEdgeProgress(rawProgress, policy.edgeMaxProgress) : Math.min(1, rawProgress),
      scope: session.viewport.scope,
      toIndex,
    };
  }

  function sampleWheelVelocity(session: WheelSession, delta: number, time: number): void {
    if (session.sampleCount > 0) {
      const dtMs = Math.max(1, Math.min(policy.wheelVelocityMaxDeltaMs, time - session.lastTime));
      const instantVelocity = (delta / dtMs) * 1000;
      session.velocity += (instantVelocity - session.velocity) * policy.wheelVelocitySmoothing;
    }
    session.lastDelta = delta;
    session.lastTime = time;
    session.sampleCount += 1;
  }

  function settleContinuousWheel(session: WheelSession): LaunchpadGestureOutput {
    const scrub = session.presentation || makeWheelPresentation(session);
    const directionVelocity = (Math.sign(session.travel || 1) * session.velocity) / session.viewport.pageWidth;
    const targetProgress = !scrub.edge && (
      scrub.progress >= policy.continuousWheelCommitProgress ||
      directionVelocity >= policy.continuousWheelCommitVelocity
    ) ? 1 : 0;
    const pageIndex = targetProgress === 1 ? scrub.toIndex : scrub.fromIndex;
    return {
      handled: true,
      presentation: {
        ...scrub,
        phase: "settle",
        settle: true,
        settleToken: `wheel:${++settleSequence}`,
        targetProgress,
        velocity: directionVelocity,
      },
      commands: pageIndex === scrub.fromIndex
        ? []
        : [{ type: "commitPage", scope: scrub.scope, pageIndex }],
    };
  }

  function commitDiscreteWheel(
    session: WheelSession,
    viewport: LaunchpadGestureViewport,
    delta: number,
    time: number,
    repeatDelayMs: number,
  ): LaunchpadGestureOutput {
    session.viewport = viewport;
    session.lastDelta = delta;
    session.lastTime = time;
    session.travel = delta;
    session.clearPresentationAt = time + 720;
    session.nextRepeatAt = time + repeatDelayMs;
    const scrub = makeWheelPresentation(session);
    const targetProgress = scrub.edge ? 0 : 1;
    const pageIndex = targetProgress === 1 ? scrub.toIndex : scrub.fromIndex;
    const presentation: LaunchpadPagePresentation = {
      ...scrub,
      phase: "settle",
      settle: true,
      settleToken: `wheel:${++settleSequence}`,
      targetProgress,
      velocity: 0,
    };
    session.presentation = presentation;
    return {
      handled: true,
      presentation,
      commands: pageIndex === scrub.fromIndex
        ? []
        : [{ type: "commitPage", scope: scrub.scope, pageIndex }],
      deadline: { kind: "wheelEnd", at: time + policy.wheelDiscreteIdleMs },
    };
  }

  function handleWheel(input: LaunchpadGestureInput): LaunchpadGestureOutput {
    if (pointer || input.ctrlKey || input.metaKey) {
      return { handled: false, presentation: null, commands: [], deadline: null };
    }
    const viewport = normalizeViewport(input.viewport);
    if (input.momentum === true && (!wheel || wheel.viewport.scope !== viewport.scope)) {
      return { handled: false, presentation: null, commands: [] };
    }
    const delta = normalizeWheelDelta(input, viewport);
    const time = readNumber(input.time);
    if (wheel?.phase === "draining" && wheel.viewport.scope === viewport.scope) {
      if (input.momentum === true) {
        return {
          handled: true,
          presentation: null,
          commands: [],
          deadline: { kind: "wheelEnd", at: readNumber(input.time) + policy.continuousWheelIdleMs },
        };
      }
      if (delta === 0) {
        return { handled: true, presentation: null, commands: [] };
      }
      wheel = null;
      return handleWheel(input);
    }
    if (input.momentum === true && wheel?.classification !== "discrete") {
      const activeWheel = wheel!;
      activeWheel.classification = "continuous";
      activeWheel.phase = "draining";
      activeWheel.clearPresentationAt = time + 720;
      return {
        ...settleContinuousWheel(activeWheel),
        deadline: { kind: "wheelEnd", at: time + policy.continuousWheelIdleMs },
      };
    }
    if (delta === 0) {
      return {
        handled: Boolean(wheel && wheel.viewport.scope === viewport.scope),
        presentation: null,
        commands: [],
      };
    }
    if (viewport.pageCount <= 1) {
      return { handled: false, presentation: null, commands: [], deadline: null };
    }
    if (!wheel || wheel.viewport.scope !== viewport.scope) {
      wheel = {
        classification: "unknown",
        lastDelta: 0,
        lastTime: readNumber(input.time),
        sampleCount: 0,
        travel: 0,
        velocity: 0,
        viewport,
      };
    }
    if (wheel.classification === "discrete") {
      const isCoarseDiscreteStep = input.momentum !== true &&
        Math.abs(delta) >= policy.wheelDiscreteMinDelta;
      const startsOppositeDiscreteBurst = isCoarseDiscreteStep &&
        Math.sign(delta) !== Math.sign(wheel.travel);
      if (startsOppositeDiscreteBurst) {
        wheel = null;
        return handleWheel(input);
      }
      if (isCoarseDiscreteStep && time >= wheel.nextRepeatAt!) {
        return commitDiscreteWheel(
          wheel,
          viewport,
          delta,
          time,
          policy.wheelDiscreteRepeatIntervalMs
        );
      }
      return {
        handled: true,
        presentation: null,
        commands: [],
        deadline: { kind: "wheelEnd", at: time + policy.wheelDiscreteIdleMs },
      };
    }
    if (
      wheel.classification === "unknown" &&
      input.momentum !== true &&
      Math.abs(delta) >= policy.wheelDiscreteMinDelta &&
      wheel.sampleCount === 0
    ) {
      wheel.classification = "discrete";
      wheel.sampleCount = 1;
      return commitDiscreteWheel(
        wheel,
        viewport,
        delta,
        time,
        policy.wheelDiscreteInitialRepeatDelayMs
      );
    }
    sampleWheelVelocity(wheel, delta, time);
    wheel.travel += delta;
    if (wheel.sampleCount > 1) wheel.classification = "continuous";
    const presentation = makeWheelPresentation(wheel);
    wheel.presentation = presentation;
    return {
      handled: true,
      presentation,
      commands: [],
      deadline: { kind: "wheelEnd", at: readNumber(input.time) + policy.continuousWheelIdleMs },
    };
  }

  function finishWheel(input: LaunchpadGestureInput): LaunchpadGestureOutput {
    if (!wheel) return { handled: false, presentation: null, commands: [], deadline: null };
    const session = wheel;
    wheel = null;
    if (session.classification === "discrete") {
      return {
        handled: true,
        presentation: null,
        commands: [],
        deadline: {
          kind: "clearPresentation",
          at: Math.max(
            readNumber(input.time),
            readNumber(session.clearPresentationAt, input.time as number),
          ),
        },
      };
    }
    if (session.phase === "draining") {
      return {
        handled: true,
        presentation: null,
        commands: [],
        deadline: {
          kind: "clearPresentation",
          at: Math.max(
            readNumber(input.time),
            readNumber(session.clearPresentationAt, input.time as number),
          ),
        },
      };
    }
    return {
      ...settleContinuousWheel(session),
      deadline: { kind: "clearPresentation", at: readNumber(input.time) + 720 },
    };
  }

  function cancelWheel(input: LaunchpadGestureInput): LaunchpadGestureOutput {
    if (!wheel) return { handled: false, presentation: null, commands: [], deadline: null };
    const session = wheel;
    wheel = null;
    if (session.classification === "discrete") {
      return {
        handled: true,
        presentation: null,
        commands: [],
        deadline: { kind: "clearPresentation", at: readNumber(input.time) },
      };
    }
    if (session.phase === "draining") {
      return {
        handled: true,
        presentation: null,
        commands: [],
        deadline: { kind: "clearPresentation", at: readNumber(input.time) },
      };
    }
    const scrub = session.presentation || makeWheelPresentation(session);
    return {
      handled: true,
      presentation: {
        ...scrub,
        phase: "settle",
        settle: true,
        settleToken: `wheel:${++settleSequence}`,
        targetProgress: 0,
        velocity: 0,
      },
      commands: [],
      deadline: { kind: "clearPresentation", at: readNumber(input.time) + 720 },
    };
  }

  function cancelAll(input: LaunchpadGestureInput): LaunchpadGestureOutput {
    if (pointer) {
      return cancelPointer({
        ...input,
        pointerId: pointer.id,
        x: pointer.lastX,
        y: pointer.lastY,
      });
    }
    return cancelWheel(input);
  }

  function finishPointer(input: LaunchpadGestureInput): LaunchpadGestureOutput {
    if (!pointer || (pointer.id != null && input.pointerId != null && pointer.id !== input.pointerId)) {
      return { handled: false, presentation: null, commands: [] };
    }
    samplePointer(input);
    const activePointer = pointer;
    const pan = activePointer.panning ? getPointerPan(input) || activePointer.pan : null;
    pointer = null;
    if (activePointer.dragging) {
      return {
        handled: true,
        presentation: null,
        targetPresentation: null,
        commands: [{ type: "finishDrag", pointer: input, target: activePointer.target }],
        deadline: null,
        releasesPointer: true,
      };
    }
    if (activePointer.held) {
      return {
        handled: true,
        presentation: null,
        targetPresentation: null,
        commands: activePointer.pointerType === "mouse"
          ? []
          : [{ type: "openContextMenu", pointer: input, target: activePointer.target }],
        deadline: null,
        releasesPointer: true,
      };
    }
    if (!pan) {
      if (activePointer.canceled) {
        return {
          handled: false,
          presentation: null,
          targetPresentation: null,
          commands: [],
          deadline: null,
          releasesPointer: true,
        };
      }
      const command: LaunchpadGestureCommand = activePointer.target?.kind === "icon"
        ? { type: "activateTarget", target: activePointer.target }
        : { type: "surfaceTap", target: activePointer.target };
      return {
        handled: true,
        presentation: null,
        targetPresentation: null,
        commands: [command],
        deadline: null,
        releasesPointer: true,
      };
    }
    const progressVelocity = (-pan.direction * activePointer.velocityX) / activePointer.viewport.pageWidth;
    const targetProgress = !pan.edge && (
      pan.progress >= policy.pointerCommitProgress || progressVelocity >= policy.pointerCommitVelocity
    ) ? 1 : 0;
    const pageIndex = targetProgress === 1 ? pan.toIndex : pan.fromIndex;
    return {
      handled: true,
      presentation: {
        ...pan,
        phase: "settle",
        settle: true,
        settleToken: `pointer:${++settleSequence}`,
        targetProgress,
        velocity: progressVelocity,
      },
      targetPresentation: null,
      commands: pageIndex === pan.fromIndex
        ? []
        : [{ type: "commitPage", scope: pan.scope, pageIndex }],
      deadline: { kind: "clearPresentation", at: readNumber(input.time) + 720 },
      releasesPointer: true,
    };
  }

  function cancelPointer(input: LaunchpadGestureInput): LaunchpadGestureOutput {
    if (!pointer || (pointer.id != null && input.pointerId != null && pointer.id !== input.pointerId)) {
      return { handled: false, presentation: null, commands: [] };
    }
    const activePointer = pointer;
    const pan = activePointer.panning ? getPointerPan(input) || activePointer.pan : null;
    pointer = null;
    if (activePointer.dragging) {
      return {
        handled: true,
        presentation: null,
        targetPresentation: null,
        commands: [{ type: "cancelDrag", pointer: input, target: activePointer.target }],
        deadline: null,
        releasesPointer: true,
      };
    }
    if (!pan) {
      return {
        handled: false,
        presentation: null,
        targetPresentation: null,
        commands: [],
        deadline: null,
        releasesPointer: true,
      };
    }
    return {
      handled: true,
      presentation: {
        ...pan,
        phase: "settle",
        settle: true,
        settleToken: `pointer:${++settleSequence}`,
        targetProgress: 0,
        velocity: 0,
      },
      targetPresentation: null,
      commands: [],
      deadline: { kind: "clearPresentation", at: readNumber(input.time) + 720 },
      releasesPointer: true,
    };
  }

  function dispatch(input: LaunchpadGestureInput = {}): LaunchpadGestureOutput {
    if (input.type === "pointerDown") return beginPointer(input);
    if (input.type === "pointerMove") return movePointer(input);
    if (input.type === "pointerUp") return finishPointer(input);
    if (input.type === "pointerCancel") return cancelPointer(input);
    if (input.type === "wheel") return handleWheel(input);
    if (input.type === "cancel") return cancelAll(input);
    if (input.type === "deadline" && input.kind === "wheelEnd") return finishWheel(input);
    if (input.type === "deadline") return handleDeadline(input);
    return { handled: false, presentation: null, commands: [] };
  }

  return { dispatch };
}
