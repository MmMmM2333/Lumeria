/** Owns queued scene work from startup through teardown, including synchronous commits. */
export function createNativeSceneScheduler(enqueue: (task: () => void) => void = queueMicrotask) {
  const state: {
    disposed: boolean;
    pending: boolean;
    snap: boolean;
    task: object | null;
    render: ((snap: boolean) => void) | null;
  } = { disposed: false, pending: false, snap: false, task: null, render: null };

  const run = (snap = false): void => {
    if (state.disposed) return;
    if (!state.render) { state.pending = true; state.snap ||= snap; return; }
    const render = state.render;
    const shouldSnap = snap || state.snap;
    state.pending = false; state.snap = false; state.task = null;
    render(shouldSnap);
  };
  const flush = (): void => { if (state.pending) run(); };
  const schedule = (): void => {
    if (state.disposed || !state.render || !state.pending || state.task) return;
    const task = {};
    state.task = task;
    enqueue(() => {
      if (state.task !== task) return;
      state.task = null;
      flush();
    });
  };
  return {
    get disposed(): boolean { return state.disposed; },
    get pending(): boolean { return state.pending; },
    request(): void {
      if (state.disposed) return;
      state.pending = true;
      schedule();
    },
    connect(render: (snap: boolean) => void): void {
      if (state.disposed || state.render) throw new Error("Scene scheduler cannot be connected again");
      state.render = render;
      schedule();
    },
    run,
    flush,
    dispose(): void {
      state.disposed = true;
      state.render = null; state.task = null; state.pending = false; state.snap = false;
    },
  };
}
