const PHASE_HIDDEN = "hidden";
const PHASE_IDLE = "idle";
const PHASE_OPEN = "open";
const PHASE_OPENING = "opening";
const PHASE_CLOSING = "closing";

export type MainWindowTransitionPhase =
  | typeof PHASE_HIDDEN
  | typeof PHASE_IDLE
  | typeof PHASE_OPEN
  | typeof PHASE_OPENING
  | typeof PHASE_CLOSING;

export type MainWindowCapability = "effects" | "frame" | "mode" | "visibility";
export type MainWindowMutableCapability = Exclude<MainWindowCapability, "visibility">;

export type MainWindowSurfaceValues = Readonly<Record<MainWindowCapability, unknown>>;

export type MainWindowTransitionSnapshot = Readonly<{
  applied: MainWindowSurfaceValues;
  epoch: number;
  generation: number | null;
  phase: MainWindowTransitionPhase;
  requested: MainWindowSurfaceValues;
}>;

export type MainWindowTransitionSuccess = {
  ok: true;
  skipped?: boolean;
  value?: unknown;
  readonly [key: string]: unknown;
};

export type MainWindowTransitionFailure = {
  ok: false;
  error: unknown;
  readonly [key: string]: unknown;
};

export type MainWindowTransitionOutcome = MainWindowTransitionSuccess | MainWindowTransitionFailure;

export type MainWindowNativeMethod = (...args: never[]) => unknown;

export type MainWindowTransitionPort = Readonly<{
  beginClose: MainWindowNativeMethod;
  hide: MainWindowNativeMethod;
  reveal: MainWindowNativeMethod;
}>;

export type MainWindowTransitionOptions = Readonly<{
  invoke: (
    method: MainWindowNativeMethod,
    args: readonly unknown[],
  ) => Promise<MainWindowTransitionOutcome>;
  port: MainWindowTransitionPort;
  publish?: (snapshot: MainWindowTransitionSnapshot) => void;
}>;

type MutableMainWindowTransitionState = {
  applied: Record<MainWindowCapability, unknown>;
  epoch: number;
  generation: number | null;
  phase: MainWindowTransitionPhase;
  requested: Record<MainWindowCapability, unknown>;
};

type NativeCloseTransition = Readonly<{
  accepted: boolean;
  generation: number;
}>;

function success<Extra extends Record<string, unknown> = Record<never, never>>(
  extra: Extra = {} as Extra,
): MainWindowTransitionSuccess & Extra {
  return { ok: true, ...extra };
}

function isPositiveSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function readCloseTransition(value: unknown, openSequence: number): NativeCloseTransition {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Native begin-close returned an invalid transition result");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !== "accepted,generation"
    || typeof record.accepted !== "boolean"
    || !isPositiveSequence(record.generation)
  ) {
    throw new TypeError("Native begin-close returned an invalid transition result");
  }
  const transition = record as { accepted: boolean; generation: number };
  if (transition.accepted && transition.generation <= openSequence) {
    throw new RangeError("Accepted native close generation must advance the open generation");
  }
  return transition;
}

function freezeState(state: MutableMainWindowTransitionState): MainWindowTransitionSnapshot {
  return Object.freeze({
    applied: Object.freeze({ ...state.applied }),
    epoch: state.epoch,
    generation: state.generation,
    phase: state.phase,
    requested: Object.freeze({ ...state.requested }),
  });
}

/**
 * Sole ordering and generation authority for main-window native mutations.
 * Requested values are published immediately; applied values move only after
 * the platform adapter confirms the operation.
 */
export class MainWindowTransition {
  readonly invoke: MainWindowTransitionOptions["invoke"];
  readonly port: MainWindowTransitionPort;
  readonly publish: (snapshot: MainWindowTransitionSnapshot) => void;
  private update: Promise<void>;
  private state: MutableMainWindowTransitionState;

  constructor(options: MainWindowTransitionOptions) {
    if (typeof options.invoke !== "function") {
      throw new TypeError("MainWindowTransition requires an invoke adapter");
    }
    if (!options.port || typeof options.port !== "object") {
      throw new TypeError("MainWindowTransition requires a window port");
    }
    this.invoke = options.invoke;
    this.port = options.port;
    this.publish = typeof options.publish === "function" ? options.publish : () => {};
    this.update = Promise.resolve();
    this.state = {
      applied: {
        effects: null,
        frame: null,
        mode: null,
        visibility: null,
      },
      epoch: 0,
      generation: null,
      phase: PHASE_IDLE,
      requested: {
        effects: null,
        frame: null,
        mode: null,
        visibility: null,
      },
    };
    this.#publish();
  }

  #publish() {
    this.publish(this.snapshot());
  }

  #enqueue<Result>(operation: () => Result | Promise<Result>): Promise<Result> {
    const result = this.update.then(operation);
    this.update = result.then(() => undefined, () => undefined);
    return result;
  }

  #setRequested(capability: MainWindowCapability, value: unknown): void {
    this.state.requested[capability] = value;
    this.#publish();
  }

  #setApplied(capability: MainWindowCapability, value: unknown): void {
    this.state.applied[capability] = value;
    this.#publish();
  }

  snapshot(): MainWindowTransitionSnapshot {
    return freezeState(this.state);
  }

  acceptOpen(openSequence: number): boolean {
    if (!isPositiveSequence(openSequence)) {
      throw new TypeError("MainWindowTransition open sequence must be a positive safe integer");
    }
    const current = this.state.generation;
    if (current !== null && openSequence < current) return false;
    if (openSequence === current) {
      return this.state.phase === PHASE_OPEN || this.state.phase === PHASE_OPENING;
    }
    this.state.epoch += 1;
    this.state.generation = openSequence;
    this.state.phase = PHASE_OPENING;
    this.state.requested.visibility = "visible";
    this.#publish();
    return true;
  }

  apply(
    capability: MainWindowMutableCapability,
    requested: unknown,
    method: MainWindowNativeMethod,
    args: readonly unknown[],
    resolveApplied: (value: unknown) => unknown = () => requested,
  ): Promise<MainWindowTransitionOutcome> {
    this.#setRequested(capability, requested);
    return this.#enqueue(async () => {
      const outcome = await this.invoke(method, args);
      if (!outcome.ok) return outcome;
      if (outcome.skipped) return outcome;
      this.#setApplied(capability, resolveApplied(outcome.value));
      return outcome;
    });
  }

  reveal(openSequence: number): Promise<MainWindowTransitionOutcome> {
    const epoch = this.state.epoch;
    this.#setRequested("visibility", "visible");
    return this.#enqueue(async () => {
      if (
        epoch !== this.state.epoch
        || openSequence !== this.state.generation
        || (this.state.phase !== PHASE_OPENING && this.state.phase !== PHASE_OPEN)
      ) {
        return success({ stale: true });
      }
      const outcome = await this.invoke(this.port.reveal, [openSequence]);
      if (!outcome.ok) return outcome;
      if (
        outcome.value !== true
        || epoch !== this.state.epoch
        || openSequence !== this.state.generation
        || (this.state.phase !== PHASE_OPENING && this.state.phase !== PHASE_OPEN)
      ) {
        return success({ stale: true, value: outcome.value });
      }
      this.state.phase = PHASE_OPEN;
      this.#setApplied("visibility", "visible");
      return outcome;
    });
  }

  beginClose(openSequence: number): Promise<MainWindowTransitionOutcome> {
    if (
      !isPositiveSequence(openSequence)
      || openSequence !== this.state.generation
      || (this.state.phase !== PHASE_OPENING && this.state.phase !== PHASE_OPEN)
    ) {
      return Promise.resolve(success({ accepted: false, stale: true }));
    }
    this.state.epoch += 1;
    const epoch = this.state.epoch;
    this.state.phase = PHASE_CLOSING;
    this.state.requested.visibility = "hidden";
    this.#publish();
    return this.#enqueue(async () => {
      if (epoch !== this.state.epoch) return success({ accepted: false, stale: true });
      const outcome = await this.invoke(this.port.beginClose, [openSequence]);
      if (!outcome.ok) return outcome;
      if (outcome.skipped) return success({ accepted: false, skipped: true });
      const transition = readCloseTransition(outcome.value, openSequence);
      if (epoch !== this.state.epoch || !transition.accepted) {
        return success({
          accepted: false,
          generation: transition.generation,
          stale: true,
          value: transition,
        });
      }
      this.state.generation = transition.generation;
      this.#publish();
      return success({
        accepted: true,
        generation: transition.generation,
        value: transition,
      });
    });
  }

  hide(generation: number): Promise<MainWindowTransitionOutcome> {
    const epoch = this.state.epoch;
    return this.#enqueue(async () => {
      if (
        !isPositiveSequence(generation)
        || epoch !== this.state.epoch
        || generation !== this.state.generation
        || this.state.phase !== PHASE_CLOSING
      ) {
        return success({ stale: true });
      }
      const outcome = await this.invoke(this.port.hide, [generation]);
      if (!outcome.ok) return outcome;
      if (
        outcome.value !== true
        || epoch !== this.state.epoch
        || generation !== this.state.generation
        || this.state.phase !== PHASE_CLOSING
      ) {
        return success({ stale: true, value: outcome.value });
      }
      this.state.phase = PHASE_HIDDEN;
      this.#setApplied("visibility", "hidden");
      return outcome;
    });
  }
}
