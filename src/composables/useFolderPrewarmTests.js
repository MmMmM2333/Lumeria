import { getFirstFolderPageItems, makeFolderPrewarmKey, useFolderPrewarm } from "./useFolderPrewarm.js";

function createTimerHost() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    get size() {
      return timers.size;
    },
    runNext() {
      const [id, timer] = timers.entries().next().value || [];
      if (!timer) return false;
      timers.delete(id);
      timer.callback();
      return true;
    },
    setTimeout(callback, delay = 0) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    timers,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

export async function runFolderPrewarmTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder prewarm test failed] ${message}`);
  };

  const appA = { id: "app-a" };
  const appB = { id: "app-b" };
  const folder = { childPages: [[appA, appB]], id: "folder-1", type: "folder" };
  assert(getFirstFolderPageItems(folder).length === 2, "childPages should provide the first folder page");
  assert(getFirstFolderPageItems({ children: [appA] })[0] === appA, "children should be used as fallback");
  assert(makeFolderPrewarmKey(folder, 1) === "folder-1:app-a", "prewarm key should include visible first-page items");

  {
    const timerHost = createTimerHost();
    const rendered = [];
    const preloaded = [];
    const prewarm = useFolderPrewarm({
      canPrewarm: () => true,
      getActivePageIndex: () => 0,
      getActivePages: () => [[folder]],
      getFolderPageSize: () => 2,
      getVisibleDesktopPage: (page) => page,
      preloadIconTextures: async (items, options) => {
        preloaded.push({ items, options });
      },
      renderPrewarm: async (payload) => {
        rendered.push(payload);
        return true;
      },
      shouldRunPixi: () => false,
      timerHost,
    });

    assert(prewarm.scheduleFolderPrewarm(), "idle folder should schedule prewarm");
    assert(!prewarm.scheduleFolderPrewarm(folder), "duplicate pending prewarm should be ignored");
    assert(timerHost.size === 1, "duplicate schedule should keep one timer");
    assert(timerHost.runNext(), "scheduled timer should run");
    await flushMicrotasks();
    assert(preloaded.length === 1, "prewarm should preload first-page textures");
    assert(preloaded[0].options.timeoutMs === 80, "default texture timeout should be passed to preloader");
    assert(rendered.length === 1, "prewarm should render once");
    assert(rendered[0].firstPageItems.length === 2, "render payload should include first page items");
    assert(prewarm.getPrewarmedFolderKeys()[0] === "folder-1:app-a,app-b", "successful prewarm should remember its key");
    assert(!prewarm.scheduleFolderPrewarm(folder), "prewarmed folder should not be scheduled again");
  }

  {
    const timerHost = createTimerHost();
    let allowPrewarm = true;
    let resolvePreload;
    const rendered = [];
    const prewarm = useFolderPrewarm({
      canPrewarm: () => allowPrewarm,
      getActivePageIndex: () => 0,
      getActivePages: () => [[folder]],
      getFolderPageSize: () => 2,
      getVisibleDesktopPage: (page) => page,
      preloadIconTextures: () => new Promise((resolve) => {
        resolvePreload = resolve;
      }),
      renderPrewarm: async (payload) => {
        rendered.push(payload);
        return true;
      },
      shouldRunPixi: () => false,
      timerHost,
    });

    assert(prewarm.scheduleFolderPrewarm(), "prewarm should schedule before cancellation");
    timerHost.runNext();
    allowPrewarm = false;
    prewarm.cancelFolderPrewarm();
    resolvePreload();
    await flushMicrotasks();
    assert(rendered.length === 0, "cancelled request should not render after preload resolves");
  }

  {
    const timerHost = createTimerHost();
    let shouldRunPixi = true;
    const prewarm = useFolderPrewarm({
      canPrewarm: () => true,
      getActivePageIndex: () => 0,
      getActivePages: () => [[folder]],
      getFolderPageSize: () => 2,
      getVisibleDesktopPage: (page) => page,
      renderPrewarm: async () => true,
      shouldRunPixi: () => shouldRunPixi,
      timerHost,
    });

    assert(!prewarm.scheduleFolderPrewarm(), "active Pixi folder layer should block prewarm");
    shouldRunPixi = false;
    assert(prewarm.scheduleFolderPrewarm(), "idle Pixi folder layer should allow prewarm");
  }
}
