import { pageTrackSpring, springTo, stopSpring } from "./springMotion.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const activeGroups = new Set();

function readDelayMs(delay) {
  const seconds = Number(delay);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round(seconds * 1000);
}

function isDestroyed(target) {
  return !!target?.destroyed;
}

export function springGroupTo(entries, options = {}) {
  const scheduler = options.scheduler || globalThis;
  const tokens = [];
  let canceled = false;
  let completed = false;
  let remaining = 0;

  const controls = {
    cancel,
    get canceled() {
      return canceled;
    },
    get completed() {
      return completed;
    },
    get pendingCount() {
      return tokens.filter((token) => token.timer).length;
    },
  };

  function clearTokenTimer(token) {
    if (!token.timer) return;
    scheduler.clearTimeout?.(token.timer);
    token.timer = null;
  }

  function completeToken(token) {
    if (canceled || completed || token.done) return;
    token.done = true;
    token.active = false;
    remaining -= 1;
    if (remaining > 0) return;
    completed = true;
    activeGroups.delete(controls);
    options.onComplete?.();
  }

  function cancel() {
    if (canceled || completed) return;
    canceled = true;
    activeGroups.delete(controls);
    for (const token of tokens) {
      clearTokenTimer(token);
      if (token.active) stopSpring(token.target, token.prop);
      token.active = false;
    }
  }

  function cancelFromSpring(token, onCancel) {
    token.active = false;
    onCancel?.();
    if (!canceled && !completed) cancel();
  }

  function startToken(token) {
    token.timer = null;
    if (canceled || completed) return;
    if (isDestroyed(token.target)) {
      cancel();
      return;
    }

    const entryOptions = token.options || {};
    token.active = true;
    const spring = springTo(token.target, token.prop, token.to, token.config, {
      ...entryOptions,
      onCancel: () => cancelFromSpring(token, entryOptions.onCancel),
      onComplete: () => {
        token.active = false;
        entryOptions.onComplete?.();
        completeToken(token);
      },
      onUpdate: (value) => {
        if (isDestroyed(token.target)) {
          cancel();
          return;
        }
        entryOptions.onUpdate?.(value);
      },
    });

    if (!spring) {
      token.active = false;
      completeToken(token);
    }
  }

  for (const entry of entries || []) {
    if (!entry?.target || !entry.prop) continue;
    const token = {
      active: false,
      config: entry.config || options.config || pageTrackSpring,
      done: false,
      options: entry.options,
      prop: entry.prop,
      target: entry.target,
      timer: null,
      to: entry.to,
    };
    tokens.push(token);
  }

  remaining = tokens.length;
  if (!remaining) {
    completed = true;
    options.onComplete?.();
    return controls;
  }

  activeGroups.add(controls);
  for (const token of tokens) {
    const delayMs = readDelayMs(token.options?.delay ?? options.delay ?? 0);
    if (!delayMs) {
      startToken(token);
      continue;
    }
    token.timer = scheduler.setTimeout?.(() => {
      startToken(token);
    }, delayMs) || null;
    if (!token.timer) startToken(token);
  }

  return controls;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const group of Array.from(activeGroups)) group.cancel();
  });
  reloadOnPixiHotUpdate(import.meta.hot);
}
