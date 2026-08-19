const PHASE_HIDDEN = "hidden";
const PHASE_IDLE = "idle";
const PHASE_OPEN = "open";
const PHASE_OPENING = "opening";
const PHASE_CLOSING = "closing";

function success(extra = {}) {
  return { ok: true, ...extra };
}

function isPositiveSequence(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function readCloseTransition(value, openSequence) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "accepted,generation"
    || typeof value.accepted !== "boolean"
    || !isPositiveSequence(value.generation)
  ) {
    throw new TypeError("Native begin-close returned an invalid transition result");
  }
  if (value.accepted && value.generation <= openSequence) {
    throw new RangeError("Accepted native close generation must advance the open generation");
  }
  return value;
}

function freezeState(state) {
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
  constructor(options = {}) {
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

  #enqueue(operation) {
    const result = this.update.then(operation);
    this.update = result.then(() => undefined, () => undefined);
    return result;
  }

  #setRequested(capability, value) {
    this.state.requested[capability] = value;
    this.#publish();
  }

  #setApplied(capability, value) {
    this.state.applied[capability] = value;
    this.#publish();
  }

  snapshot() {
    return freezeState(this.state);
  }

  acceptOpen(openSequence) {
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

  apply(capability, requested, method, args, resolveApplied = () => requested) {
    this.#setRequested(capability, requested);
    return this.#enqueue(async () => {
      const outcome = await this.invoke(method, args);
      if (!outcome.ok) return outcome;
      if (outcome.skipped) return outcome;
      this.#setApplied(capability, resolveApplied(outcome.value));
      return outcome;
    });
  }

  reveal(openSequence) {
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

  beginClose(openSequence) {
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

  hide(generation) {
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
