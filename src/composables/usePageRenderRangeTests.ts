import { computed, nextTick, ref, type Ref } from "vue";
import {
  usePageRenderRange,
  type FolderPageRenderOptions,
} from "./usePageRenderRange.js";
import type {
  FolderPageTurnPhase,
  FolderPageTurnRequest,
} from "./useLaunchpadLayout.js";

type PageTurnRefs = Readonly<{
  folderPageIndex: Ref<number>;
  folderPageTurnRequest: Ref<FolderPageTurnRequest | null>;
}>;

type CommitFolderPageTurnOverride = (
  context: PageTurnRefs & Readonly<{
    commitOptions: FolderPageRenderOptions & Readonly<{ maxIndex: number }>;
    token: number;
  }>,
) => boolean;

type PageRenderRangeOverrides = Readonly<{
  activePageIndex?: Readonly<Ref<number>>;
  commitFolderPageTurnRequest?: CommitFolderPageTurnOverride;
  dragMeta?: unknown;
  folderPageIndex?: number;
  folderPages?: unknown[][];
  getVisualFolderPageIndex?: (refs: PageTurnRefs) => number;
  isSearchMode?: boolean;
  pageIndex?: number;
  pages?: unknown[][];
  searchPageIndex?: number;
  searchPages?: unknown[][];
  searchPagesRef?: Readonly<Ref<readonly (readonly unknown[])[]>>;
}>;

function normalizeFolderPageTurnPhase(value: unknown): FolderPageTurnPhase {
  return value === "idle" || value === "opening" || value === "open" || value === "closing"
    ? value
    : "open";
}

function readRefValue<T>(source: Readonly<{ value: T }>): T {
  return source.value;
}

function readNumber(read: () => number): number {
  return read();
}

function readFolderPageTurnPhase(read: () => FolderPageTurnPhase): FolderPageTurnPhase {
  return read();
}

function createPageRenderRange(overrides: PageRenderRangeOverrides = {}) {
  const pageIndex = ref(overrides.pageIndex ?? 0);
  const searchPageIndex = ref(overrides.searchPageIndex ?? 0);
  const folderPageIndex = ref(overrides.folderPageIndex ?? 0);
  const folderPageTurnRequest = ref<FolderPageTurnRequest | null>(null);
  const pages = ref(overrides.pages ?? [[], [], [], [], [], []]);
  const searchPages = overrides.searchPagesRef ?? ref(overrides.searchPages ?? [[], [], [], []]);
  const folderPages = ref(overrides.folderPages ?? [[], [], []]);
  const isSearchMode = ref(overrides.isSearchMode ?? false);
  const dragMeta = ref(overrides.dragMeta ?? null);
  const visualFolderPageIndex = computed(() => {
    if (typeof overrides.getVisualFolderPageIndex === "function") {
      return overrides.getVisualFolderPageIndex({ folderPageIndex, folderPageTurnRequest });
    }
    return folderPageTurnRequest.value?.targetIndex ?? folderPageIndex.value;
  });
  let nextFolderPageTurnToken = 1;

  return {
    folderPageTurnRequest,
    pageIndex,
    searchPageIndex,
    folderPageIndex,
    pages,
    searchPages,
    folderPages,
    range: usePageRenderRange({
      activePageIndex: overrides.activePageIndex ?? pageIndex,
      commitFolderPageIndexState: (value) => { folderPageIndex.value = value; },
      commitPageIndexState: (value) => { pageIndex.value = value; },
      commitSearchPageIndexState: (value) => { searchPageIndex.value = value; },
      folderPageIndex,
      folderPageTurnRequest,
      folderPages,
      getDragMeta: () => dragMeta.value,
      isDragActive: () => Boolean(dragMeta.value),
      isSearchMode,
      pageIndex,
      pages,
      requestFolderPageTurn: (targetIndex, requestOptions) => {
        const maxIndex = Math.max(0, Number(requestOptions.maxIndex) || 0);
        const token = nextFolderPageTurnToken;
        nextFolderPageTurnToken += 1;
        folderPageTurnRequest.value = {
          token,
          folderId: requestOptions.folderId || "folder-1",
          fromIndex: folderPageIndex.value,
          targetIndex: Math.min(Math.max(0, targetIndex), maxIndex),
          source: requestOptions.source || null,
          phaseAtRequest: normalizeFolderPageTurnPhase(requestOptions.phase),
        };
        return token;
      },
      commitFolderPageTurnRequest: (token, commitOptions) => {
        if (typeof overrides.commitFolderPageTurnRequest === "function") {
          return overrides.commitFolderPageTurnRequest({
            commitOptions,
            folderPageIndex,
            folderPageTurnRequest,
            token,
          });
        }
        const request = folderPageTurnRequest.value;
        if (!request || request.token !== token) return false;
        folderPageIndex.value = request.targetIndex;
        folderPageTurnRequest.value = null;
        return true;
      },
      searchPageIndex,
      searchPages,
      visualFolderPageIndex,
    }),
  };
}

async function flushPageJump(): Promise<void> {
  await nextTick();
  await Promise.resolve();
}

type FakeTimer = Readonly<{ callback: () => void }>;
type FakeWindowControls = Readonly<{ flushTimeouts: () => void }>;

function withFakeWindow(run: (controls: FakeWindowControls) => void | Promise<void>): Promise<void> {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timeouts: FakeTimer[] = [];
  const fakeWindow = {
    clearTimeout(timer: FakeTimer): void {
      const index = timeouts.indexOf(timer);
      if (index >= 0) timeouts.splice(index, 1);
    },
    requestAnimationFrame(callback: FrameRequestCallback): number {
      callback(0);
      return 1;
    },
    setTimeout(callback: () => void): FakeTimer {
      const timer = { callback };
      timeouts.push(timer);
      return timer;
    },
  };

  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });

  return Promise.resolve()
    .then(() => run({
      flushTimeouts() {
        while (timeouts.length) {
          const timer = timeouts.shift();
          timer?.callback();
        }
      },
    }))
    .finally(() => {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    });
}

export async function runPageRenderRangeTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Page render range test failed] ${message}`);
  };

  let inactiveSearchPageReads = 0;
  const inactiveSearchPages = computed<unknown[][]>(() => {
    inactiveSearchPageReads += 1;
    return [[], []];
  });
  const inactiveSearch = createPageRenderRange({
    isSearchMode: false,
    searchPageIndex: 1,
    searchPagesRef: inactiveSearchPages,
  });
  inactiveSearch.range.reclampPageIndices();
  assert(readNumber(() => inactiveSearchPageReads) === 0, "desktop index reclamping must not evaluate inactive search pages");
  assert(readRefValue(inactiveSearch.searchPageIndex) === 0, "inactive search pagination should normalize directly to page zero");

  await withFakeWindow(async () => {
    const { pageIndex, range } = createPageRenderRange({ pageIndex: 0 });
    range.commitPageIndex(1);
    assert(readRefValue(pageIndex) === 1, "adjacent desktop page commits should be immediate");
    assert(range.getDesktopPageRenderMode(0) === "interactive", "neighbor pages should render after adjacent commits");
    assert(range.getDesktopPageRenderMode(2) === "interactive", "next neighbor pages should render after adjacent commits");
    assert(range.getDesktopPageRenderMode(3) === "empty", "adjacent commits should not create static transient pages");
    assert(range.getDesktopPageRenderMode(1) === "interactive", "current desktop page should use interactive rendering");
  });

  await withFakeWindow(async ({ flushTimeouts }) => {
    const { pageIndex, range } = createPageRenderRange({ pageIndex: 0 });
    range.commitPageIndex(5);
    assert(readRefValue(pageIndex) === 0, "long desktop jumps should wait for the render bridge before committing");
    assert(range.getDesktopPageRenderMode(0) === "interactive", "long jumps should keep the source page rendered");
    assert(range.getDesktopPageRenderMode(5) === "interactive", "long jumps should render the target page");
    assert(range.getDesktopPageRenderMode(1) === "static-real", "long jumps should statically render the source-side middle page");
    assert(range.getDesktopPageRenderMode(2) === "static-real", "long jumps should statically render bridged pages");
    assert(range.getDesktopPageRenderMode(3) === "static-real", "long jumps should statically render all bridged middle pages");
    assert(range.getDesktopPageRenderMode(4) === "static-real", "long jumps should statically render the target-side middle page");

    await flushPageJump();
    assert(readRefValue(pageIndex) === 5, "long desktop jumps should commit after the render bridge is ready");
    assert(range.getDesktopPageRenderMode(4) === "static-real", "bridged target neighbors should remain static until release");
    flushTimeouts();
    assert(range.getDesktopPageRenderMode(2) === "empty", "release timers should clear bridged static pages");
    assert(range.getDesktopPageRenderMode(4) === "interactive", "target neighbors should become interactive after bridged pages release");
  });

  await withFakeWindow(async () => {
    const dragMeta = { id: "dragging" };
    const { pageIndex, range } = createPageRenderRange({ dragMeta, pageIndex: 0 });
    range.commitPageIndex(5);
    assert(readRefValue(pageIndex) === 5, "drag-active desktop jumps should commit immediately");
    assert(range.getDesktopPageRenderMode(2) === "empty", "drag-active jumps should not create static transient pages");
  });

  await withFakeWindow(async () => {
    const { folderPageIndex, folderPageTurnRequest, range } = createPageRenderRange({
      dragMeta: { id: "dragging" },
      folderPageIndex: 0,
      folderPages: [[], [], []],
    });
    range.requestFolderPageTurn(2, { folderId: "folder-1", phase: "open", source: "wheel" });
    assert(readRefValue(folderPageIndex) === 0, "visual folder page turns should not commit before their request is accepted");
    assert(readRefValue(folderPageTurnRequest)?.targetIndex === 2, "visual folder page turns should expose their requested page");
    assert(range.getFolderPageRenderMode(2) === "interactive", "active drags should keep the visual folder page rendered when committed state lags");
    assert(range.getFolderPageRenderMode(0) === "empty", "active drag culling should be centered on the visual folder page");
  });

  await withFakeWindow(async ({ flushTimeouts }) => {
    const { folderPageIndex, range } = createPageRenderRange({
      folderPageIndex: 0,
      folderPages: [[], [], [], []],
    });
    range.commitFolderPageIndex(4, { allowCreate: true });
    assert(readRefValue(folderPageIndex) === 0, "long folder jumps should wait for the render bridge before committing");
    assert(range.getFolderPageRenderMode(0) === "interactive", "folder jumps should keep the source page rendered");
    assert(range.getFolderPageRenderMode(4) === "interactive", "folder jumps should render the allowed create target page");
    assert(range.getFolderPageRenderMode(1) === "static-real", "folder jumps should statically render bridged middle pages");
    assert(range.getFolderPageRenderMode(2) === "static-real", "folder jumps should statically render bridged pages");

    await flushPageJump();
    assert(readRefValue(folderPageIndex) === 4, "folder jumps should allow committing to the create page");
    flushTimeouts();
    assert(range.getFolderPageRenderMode(1) === "empty", "folder release timers should clear bridged static pages");
  });

  await withFakeWindow(async () => {
    const { folderPageIndex, folderPageTurnRequest, range } = createPageRenderRange({
      folderPageIndex: 0,
      folderPages: [[], [], [], [], []],
    });
    const token = range.requestFolderPageTurn(4, { folderId: "folder-1", phase: "open", source: "wheel" });
    assert(readRefValue(folderPageTurnRequest)?.token === token, "folder page turn requests should be recorded before commit");
    assert(readRefValue(folderPageIndex) === 0, "folder page turn requests should not commit immediately");
    assert(range.getFolderPageRenderMode(0) === "interactive", "folder page turn requests should keep the source page interactive");
    assert(range.getFolderPageRenderMode(4) === "interactive", "folder page turn requests should make the target page interactive");
    assert(range.getFolderPageRenderMode(2) === "static-real", "folder page turn requests should render bridged middle pages");
  });

  await withFakeWindow(async () => {
    const { folderPageIndex, range } = createPageRenderRange({
      folderPageIndex: 0,
      folderPages: [[], [], [], [], []],
    });
    const token = range.requestFolderPageTurn(4, { folderId: "folder-1", phase: "open" });
    assert(range.commitFolderPageTurnRequest(token), "folder page turn request commits should schedule through render range");
    assert(readRefValue(folderPageIndex) === 0, "long folder page turn request commits should wait for the render bridge");
    await flushPageJump();
    assert(readRefValue(folderPageIndex) === 4, "folder page turn request commits should land after the render bridge");
  });

  await withFakeWindow(async () => {
    const { folderPageIndex, range } = createPageRenderRange({
      folderPageIndex: 0,
      folderPages: [[], [], [], [], []],
    });
    const staleToken = range.requestFolderPageTurn(4, { folderId: "folder-1", phase: "open" });
    range.commitFolderPageTurnRequest(staleToken);
    range.requestFolderPageTurn(2, { folderId: "folder-1", phase: "open" });
    await flushPageJump();
    assert(readRefValue(folderPageIndex) === 0, "superseded folder page turn requests should not commit through a stale token");
  });

  await withFakeWindow(async ({ flushTimeouts }) => {
    let phase: FolderPageTurnPhase = "open";
    const { folderPageIndex, range } = createPageRenderRange({
      commitFolderPageTurnRequest: ({ folderPageTurnRequest, token }) => {
        const request = folderPageTurnRequest.value;
        if (readFolderPageTurnPhase(() => phase) !== "open" || !request || request.token !== token) return false;
        folderPageIndex.value = request.targetIndex;
        folderPageTurnRequest.value = null;
        return true;
      },
      folderPageIndex: 0,
      folderPages: [[], [], [], [], []],
      getVisualFolderPageIndex: ({ folderPageIndex, folderPageTurnRequest }) => (
        readFolderPageTurnPhase(() => phase) === "open"
          ? folderPageTurnRequest.value?.targetIndex ?? folderPageIndex.value
          : folderPageIndex.value
      ),
    });
    const token = range.requestFolderPageTurn(4, { folderId: "folder-1", phase: "open" });
    assert(range.commitFolderPageTurnRequest(token), "folder page turn request should schedule before close interrupts it");
    phase = "closing";
    await flushPageJump();
    assert(readRefValue(folderPageIndex) === 0, "folder page turn requests rejected after close starts should not commit");
    assert(range.getFolderPageRenderMode(2) === "empty", "rejected delayed folder page turn requests should clear the transient render range");
    flushTimeouts();
    assert(range.getFolderPageRenderMode(4) === "empty", "rejected delayed folder page turn requests should not leave a release timer behind");
  });

  await withFakeWindow(async () => {
    const { searchPageIndex, range } = createPageRenderRange({
      isSearchMode: true,
      searchPageIndex: 0,
      searchPages: [[], [], [], []],
    });
    range.commitActivePageIndex(3);
    await flushPageJump();
    assert(readRefValue(searchPageIndex) === 3, "active page commits should target search pages in search mode");
  });
}
