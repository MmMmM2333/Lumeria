import { nextTick, ref } from "vue";
import { usePageRenderRange } from "./usePageRenderRange.js";

function createPageRenderRange(overrides = {}) {
  const pageIndex = ref(overrides.pageIndex ?? 0);
  const searchPageIndex = ref(overrides.searchPageIndex ?? 0);
  const folderPageIndex = ref(overrides.folderPageIndex ?? 0);
  const pages = ref(overrides.pages ?? [[], [], [], [], [], []]);
  const searchPages = ref(overrides.searchPages ?? [[], [], [], []]);
  const folderPages = ref(overrides.folderPages ?? [[], [], []]);
  const isSearchMode = ref(overrides.isSearchMode ?? false);
  const dragMeta = ref(overrides.dragMeta ?? null);

  return {
    pageIndex,
    searchPageIndex,
    folderPageIndex,
    pages,
    searchPages,
    folderPages,
    range: usePageRenderRange({
      activePageIndex: overrides.activePageIndex ?? pageIndex,
      folderPageIndex,
      folderPages,
      getDragMeta: () => dragMeta.value,
      isDragActive: () => Boolean(dragMeta.value),
      isSearchMode,
      pageIndex,
      pages,
      searchPageIndex,
      searchPages,
    }),
  };
}

async function flushPageJump() {
  await nextTick();
  await Promise.resolve();
}

function withFakeWindow(run) {
  const originalWindow = globalThis.window;
  const timeouts = [];
  const fakeWindow = {
    clearTimeout(timer) {
      const index = timeouts.indexOf(timer);
      if (index >= 0) timeouts.splice(index, 1);
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    setTimeout(callback) {
      const timer = { callback };
      timeouts.push(timer);
      return timer;
    },
  };

  globalThis.window = fakeWindow;

  return Promise.resolve()
    .then(() => run({
      flushTimeouts() {
        while (timeouts.length) {
          const timer = timeouts.shift();
          timer.callback();
        }
      },
    }))
    .finally(() => {
      if (originalWindow === undefined) delete globalThis.window;
      else globalThis.window = originalWindow;
    });
}

export async function runPageRenderRangeTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Page render range test failed] ${message}`);
  };

  await withFakeWindow(async () => {
    const { pageIndex, range } = createPageRenderRange({ pageIndex: 0 });
    range.commitPageIndex(1);
    assert(pageIndex.value === 1, "adjacent desktop page commits should be immediate");
    assert(range.getDesktopPageRenderMode(0) === "interactive", "neighbor pages should render after adjacent commits");
    assert(range.getDesktopPageRenderMode(2) === "interactive", "next neighbor pages should render after adjacent commits");
    assert(range.getDesktopPageRenderMode(3) === "empty", "adjacent commits should not create static transient pages");
    assert(range.getDesktopPageRenderMode(1) === "interactive", "current desktop page should use interactive rendering");
  });

  await withFakeWindow(async ({ flushTimeouts }) => {
    const { pageIndex, range } = createPageRenderRange({ pageIndex: 0 });
    range.commitPageIndex(5);
    assert(pageIndex.value === 0, "long desktop jumps should wait for the render bridge before committing");
    assert(range.getDesktopPageRenderMode(0) === "interactive", "long jumps should keep the source page rendered");
    assert(range.getDesktopPageRenderMode(5) === "interactive", "long jumps should render the target page");
    assert(range.getDesktopPageRenderMode(1) === "static-real", "long jumps should statically render the source-side middle page");
    assert(range.getDesktopPageRenderMode(2) === "static-real", "long jumps should statically render bridged pages");
    assert(range.getDesktopPageRenderMode(3) === "static-real", "long jumps should statically render all bridged middle pages");
    assert(range.getDesktopPageRenderMode(4) === "static-real", "long jumps should statically render the target-side middle page");

    await flushPageJump();
    assert(pageIndex.value === 5, "long desktop jumps should commit after the render bridge is ready");
    assert(range.getDesktopPageRenderMode(4) === "static-real", "bridged target neighbors should remain static until release");
    flushTimeouts();
    assert(range.getDesktopPageRenderMode(2) === "empty", "release timers should clear bridged static pages");
    assert(range.getDesktopPageRenderMode(4) === "interactive", "target neighbors should become interactive after bridged pages release");
  });

  await withFakeWindow(async () => {
    const dragMeta = { id: "dragging" };
    const { pageIndex, range } = createPageRenderRange({ dragMeta, pageIndex: 0 });
    range.commitPageIndex(5);
    assert(pageIndex.value === 5, "drag-active desktop jumps should commit immediately");
    assert(range.getDesktopPageRenderMode(2) === "empty", "drag-active jumps should not create static transient pages");
  });

  await withFakeWindow(async ({ flushTimeouts }) => {
    const { folderPageIndex, range } = createPageRenderRange({
      folderPageIndex: 0,
      folderPages: [[], [], [], []],
    });
    range.commitFolderPageIndex(4, { allowCreate: true });
    assert(folderPageIndex.value === 0, "long folder jumps should wait for the render bridge before committing");
    assert(range.getFolderPageRenderMode(0) === "interactive", "folder jumps should keep the source page rendered");
    assert(range.getFolderPageRenderMode(4) === "interactive", "folder jumps should render the allowed create target page");
    assert(range.getFolderPageRenderMode(1) === "static-real", "folder jumps should statically render bridged middle pages");
    assert(range.getFolderPageRenderMode(2) === "static-real", "folder jumps should statically render bridged pages");

    await flushPageJump();
    assert(folderPageIndex.value === 4, "folder jumps should allow committing to the create page");
    flushTimeouts();
    assert(range.getFolderPageRenderMode(1) === "empty", "folder release timers should clear bridged static pages");
  });

  await withFakeWindow(async () => {
    const { searchPageIndex, range } = createPageRenderRange({
      isSearchMode: true,
      searchPageIndex: 0,
      searchPages: [[], [], [], []],
    });
    range.commitActivePageIndex(3);
    await flushPageJump();
    assert(searchPageIndex.value === 3, "active page commits should target search pages in search mode");
  });
}
