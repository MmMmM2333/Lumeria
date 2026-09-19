import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type {
  LaunchpadDragFolderHoverState,
  LaunchpadGroupDragState,
} from "../../src/composables/useLaunchpadDrag.js";
import type {
  LaunchpadFolder,
  LaunchpadItem,
  LaunchpadPages,
} from "../../src/domain/launchpadLayout.js";
import type {
  IconBoundsRegistry,
  IconBoundsVariant,
} from "../../src/rendering/pixi/geometry/iconBoundsRegistry.js";
import type { DesktopLayer } from "../../src/rendering/pixi/scene/DesktopLayer.js";

type GroupReleaseItem = LaunchpadItem;
type GroupReleaseFolder = LaunchpadFolder;
type GroupReleasePages = LaunchpadPages;
type GroupReleasePoint = Readonly<{ x: number; y: number }>;
type GroupReleaseDragPointerType = "pointercancel" | "pointerdown" | "pointermove" | "pointerup";
type GroupReleaseIconPointerOptions = Readonly<{
  pointerId?: number;
  type?: "click" | "contextmenu";
}>;

interface GroupReleaseRef<Value> {
  value: Value;
}

interface GroupReleasePointerEvent {
  readonly button: number;
  readonly buttons: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly currentTarget: Readonly<{
    getBoundingClientRect(): Readonly<{ height: number; left: number; top: number; width: number }>;
  }>;
  readonly dragVisualState?: Readonly<{
    cellHeight: number;
    cellWidth: number;
    compact: boolean;
    iconSize: number;
    singleLineLabel: boolean;
  }>;
  readonly isPrimary: boolean;
  readonly pointerId: number;
  readonly pointerType: string;
  preventDefault(): void;
  stopImmediatePropagation?(): void;
  stopPropagation(): void;
  readonly type: string;
}

interface GroupReleaseFolderOverlay {
  readonly folderPageIndex: GroupReleaseRef<number>;
  readonly folderPageTurnRequest: GroupReleaseRef<unknown>;
  readonly folderViewportRef: GroupReleaseRef<HTMLElement | null>;
  readonly visualFolderPageIndex: GroupReleaseRef<number>;
  commitFolderPageIndex(pageIndex: number, options: Readonly<{ allowCreate: boolean }>): void;
  handleIconPointerDown(
    event: GroupReleasePointerEvent,
    item: GroupReleaseItem,
    source: Readonly<{ folderId: string; index: number; pageIndex: number; type: "folder" }>,
  ): void;
}

interface GroupReleaseSettingsPanel {
  readonly draftFolderCols: GroupReleaseRef<number>;
  readonly draftFolderRows: GroupReleaseRef<number>;
  applySettingsConfig(): Promise<
    Readonly<{ ok: true }> | Readonly<{ error: unknown; ok: false }>
  >;
  changeDraftFolderCols(delta: number): void;
  changeDraftFolderRows(delta: number): void;
}

interface GroupReleaseSetupState {
  readonly activePages: GroupReleasePages;
  readonly batchSelectedIds: Set<string>;
  readonly dragFolderHoverState: LaunchpadDragFolderHoverState | null;
  readonly folderOverlay: GroupReleaseFolderOverlay;
  readonly folderPanelRef: HTMLElement | null;
  readonly groupDragState: LaunchpadGroupDragState | null;
  readonly iconBoundsRegistry: IconBoundsRegistry;
  readonly renderedFolder: GroupReleaseItem | null;
  readonly settingsPanel: GroupReleaseSettingsPanel;
  readonly transientNotice: Readonly<{ message?: string }> | null;
  activePageIndex: number;
  dragFolderTargetId: string | null;
  gridCols: number;
  gridRows: number;
  isBatchSelectionActive: boolean;
  isFolderClosing: boolean;
  isFolderLayerActive: boolean;
  openFolderId: string | null;
  clearBatchSelection(): void;
  commitActivePageIndex(pageIndex: number): void;
  commitOpenFolder(folderId: string | null): void;
  createFolderFromBatchSelection(): void;
  enterBatchSelection(item?: GroupReleaseItem): void;
}

interface GroupReleaseComponentInstance {
  readonly setupState?: Readonly<{ layer?: DesktopLayer }>;
  readonly subTree?: GroupReleaseVNode;
  readonly type?: Readonly<{ __name?: string; name?: string }>;
}

interface GroupReleaseVNode {
  readonly children?: GroupReleaseVNode[];
  readonly component?: GroupReleaseComponentInstance | null;
}

interface GroupReleaseRootInstance {
  readonly setupState: GroupReleaseSetupState;
  readonly subTree?: GroupReleaseVNode;
}

interface GroupReleaseAppElement extends Element {
  readonly __vue_app__?: Readonly<{
    _instance?: GroupReleaseRootInstance;
  }>;
}

interface GroupReleaseTestBridge {
  getDesktopLayer(): DesktopLayer;
  getFolder(id: string): GroupReleaseFolder;
  getInstance(): GroupReleaseRootInstance;
  getState(): GroupReleaseSetupState;
}

interface FolderDropFrameSample {
  readonly fillVisible: boolean;
  readonly strokeVisible: boolean;
}

interface FolderHandoffResult {
  readonly firstVisibleTargetDeltaById: Readonly<Record<string, number>>;
  readonly maxReturningTargetDelta: number;
  readonly ownershipVisibilityViolationIds: string[];
  readonly releaseOutcome: string | null;
  readonly sawReturning: boolean;
  readonly selectedIds: string[];
}

type GroupReleaseDiagnostic = Readonly<Record<
  string,
  boolean | null | number | string
>>;

interface ActorHandoffSnapshot {
  readonly actorOrder: (string | undefined)[];
  readonly centerDelta: number | null;
  readonly orderedNodeMatches: boolean;
  readonly sameNode: boolean;
}

interface CreatedFolderReleaseFrame {
  readonly firstReleaseCenter: GroupReleasePoint;
  readonly folderLayoutY: number | null;
  readonly folderNodeY: number | null;
  readonly hoverCenter: GroupReleasePoint;
  readonly sampledFrame: number;
}

type CreatedFolderContinuityResult = CreatedFolderReleaseFrame & Readonly<{
  actorHandoff: ActorHandoffSnapshot | null;
  ownershipViolations: GroupReleaseDiagnostic[];
}>;

interface SingleIconHandoffResult {
  readonly ghostLabelAlphaBeforeRelease: number;
  readonly liveLabelFrameCount: number;
  readonly minLiveLabelAlpha: number;
  readonly releaseOutcome: string | null;
  readonly releasePhase: string | null;
}

interface ToolbarReleaseEntryBase {
  readonly actorKey: string | undefined;
  readonly id: string;
}

type ToolbarReleaseEntrySnapshot =
  | (ToolbarReleaseEntryBase & Readonly<{
    mode: "created-folder";
    slotIndex: number;
  }>)
  | (ToolbarReleaseEntryBase & Readonly<{
    mode: "folder-center-absorb";
    slotIndex: number | null;
  }>);

interface ToolbarFolderReleaseResult {
  readonly actorMemberIds: string[];
  readonly actorRoles: (string | undefined)[];
  readonly aggregateMemberCount: number;
  readonly anchorId: string;
  readonly badgeVisible: boolean;
  readonly beforeAnchorTarget: GroupReleasePoint | null;
  readonly beforeFollowerTarget: GroupReleasePoint | null;
  readonly folderId: string;
  readonly folderNodeGhosted: boolean;
  readonly folderShellVisible: boolean;
  readonly folderTarget: GroupReleasePoint;
  readonly followerTarget: GroupReleasePoint;
  readonly groupEntries: (string | null)[];
  readonly nodePoolSize: number;
  readonly ownershipKeys: string[];
  readonly releaseEntries: ToolbarReleaseEntrySnapshot[];
  readonly semanticMemberIds: string[];
  readonly suppressedPreviewChildIds: string[];
}

interface FullPageAcceptedRelease {
  readonly actorMemberIds: string[];
  readonly actorRoles: (string | undefined)[];
  readonly aggregateMemberCount: number;
  readonly folderId: string;
  readonly groupIds: (string | null)[];
  readonly nodePoolSize: number;
  readonly ownershipKeys: string[];
  readonly releaseIds: string[];
  readonly releaseModes: string[];
  readonly semanticMemberIds: string[];
}

interface FullPageReleaseResult extends FullPageAcceptedRelease {
  readonly batch: boolean;
  readonly childCount: number;
  readonly durationMs: number;
  readonly openFolderId: string | null;
  readonly selectedIds: string[];
  readonly visibleOwnedIds: string[];
}

function requireArrayEntry<Value>(
  entries: readonly Value[],
  index: number,
  label: string,
): Value {
  const entry = entries[index];
  if (entry === undefined) throw new Error(`${label} is missing entry ${index}`);
  return entry;
}

declare global {
  interface Window {
    __folderDropFrameTrace?: {
      active: boolean;
      samples: FolderDropFrameSample[];
    };
    __LUMERIA_GROUP_RELEASE_TEST__: GroupReleaseTestBridge;
  }
}

test.use({ locale: "zh-CN" });

async function waitForFixture(page: Page) {
  await page.addInitScript(() => {
    const getInstance = (): GroupReleaseRootInstance => {
      const instance = document.querySelector<GroupReleaseAppElement>("#app")
        ?.__vue_app__?._instance;
      if (!instance) throw new Error("Launchpad group-release fixture instance is unavailable");
      return instance;
    };
    const getState = (): GroupReleaseSetupState => getInstance().setupState;
    const getDesktopLayer = (): DesktopLayer => {
      const seen = new Set<GroupReleaseComponentInstance>();
      const findDesktopLayer = (
        vnode: GroupReleaseVNode | null | undefined,
      ): DesktopLayer | null => {
        if (!vnode) return null;
        const instance = vnode.component;
        if (instance && !seen.has(instance)) {
          seen.add(instance);
          const name = instance.type?.name || instance.type?.__name;
          if (name === "PixiDesktopSurface") return instance.setupState?.layer || null;
          const nested = findDesktopLayer(instance.subTree);
          if (nested) return nested;
        }
        if (Array.isArray(vnode.children)) {
          for (const child of vnode.children) {
            const nested = findDesktopLayer(child);
            if (nested) return nested;
          }
        }
        return null;
      };
      const layer = findDesktopLayer(getInstance().subTree);
      if (!layer) throw new Error("Pixi desktop layer is unavailable");
      return layer;
    };
    const getFolder = (id: string): GroupReleaseFolder => {
      const folder = getState().activePages.flat().find((item): item is GroupReleaseFolder => (
        item.type === "folder" && item.id === id
      ));
      if (!folder) throw new Error(`Launchpad group-release fixture folder is unavailable: ${id}`);
      return folder;
    };
    window.__LUMERIA_GROUP_RELEASE_TEST__ = {
      getDesktopLayer,
      getFolder,
      getInstance,
      getState,
    };
  });
  await page.goto(`/tests/browser/reference/index.html?fixture=multi-select&group-release=${Date.now()}`);
  await page.waitForFunction(() => {
    const state = document.querySelector<GroupReleaseAppElement>("#app")
      ?.__vue_app__?._instance?.setupState;
    return document.querySelector('[data-launchpad-fixture="multi-select"]') &&
      state?.activePages?.length === 3 &&
      state.activePages[0]?.length === 35;
  });
  await waitForIconBounds(page, "app-0-safari");
}

async function waitForIconBounds(page: Page, id: string) {
  await page.waitForFunction((iconId) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const location = state?.activePages
      ?.flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
      .find((entry) => entry.item.id === iconId);
    return Boolean(location && state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: iconId,
      pageIndex: location.pageIndex,
    }));
  }, id);
}

async function readFolderDropFrameState(page: Page, folderId: string) {
  return page.evaluate((targetFolderId) => {
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    return {
      fillVisible: layer.folderDropFillLayer?.getFrame?.(targetFolderId)?.visible === true,
      planActive: layer.lastDesktopRenderPlan?.folderDropTarget?.targetId === targetFolderId,
      strokeVisible: layer.folderDropStrokeLayer?.getFrame?.(targetFolderId)?.visible === true,
    };
  }, folderId);
}

async function startFolderDropFrameTrace(page: Page, folderId: string) {
  await page.evaluate((targetFolderId) => {
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    const trace: { active: boolean; samples: FolderDropFrameSample[] } = {
      active: true,
      samples: [],
    };
    window.__folderDropFrameTrace = trace;
    const sample = () => {
      if (!trace.active) return;
      const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
      const planActive = layer.lastDesktopRenderPlan?.folderDropTarget?.targetId === targetFolderId;
      if (state?.openFolderId === targetFolderId && !planActive) {
        trace.samples.push({
          fillVisible: layer.folderDropFillLayer?.getFrame?.(targetFolderId)?.visible === true,
          strokeVisible: layer.folderDropStrokeLayer?.getFrame?.(targetFolderId)?.visible === true,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, folderId);
}

async function stopFolderDropFrameTrace(page: Page) {
  return page.evaluate(() => {
    const trace = window.__folderDropFrameTrace;
    if (!trace) throw new Error("Folder drop-frame trace was not started");
    trace.active = false;
    delete window.__folderDropFrameTrace;
    return trace.samples;
  });
}

async function dispatchIconPointer(
  page: Page,
  id: string,
  options: GroupReleaseIconPointerOptions = {},
) {
  await waitForIconBounds(page, id);
  return page.evaluate(({ iconId, pointerId, type }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const location = state.activePages
      .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
      .find((entry) => entry.item.id === iconId);
    if (!location) throw new Error(`Missing icon: ${iconId}`);
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: iconId,
      pageIndex: location.pageIndex,
    });
    if (!bounds) throw new Error(`Missing rendered icon bounds: ${iconId}`);
    const clientX = (bounds.left + bounds.right) / 2;
    const clientY = (bounds.top + bounds.bottom) / 2;
    const target = document.elementFromPoint(clientX, clientY);
    if (!target) throw new Error(`Icon pointer target is outside the viewport: ${iconId}`);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX,
      clientY,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    };
    if (type === "contextmenu") {
      target.dispatchEvent(new MouseEvent("contextmenu", {
        ...init,
        button: 2,
        buttons: 2,
      }));
      return;
    }
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
  }, {
    iconId: id,
    pointerId: options.pointerId || 31,
    type: options.type || "click",
  });
}

async function enterBatchSelectionOf(page: Page, ids: readonly string[]) {
  await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    state.enterBatchSelection();
  });
  await page.waitForTimeout(50);
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return Boolean(state.isBatchSelectionActive);
  })).toBe(true);
  for (const [index, id] of ids.entries()) {
    await dispatchIconPointer(page, id, { pointerId: 41 + index });
  }
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return [...state.batchSelectedIds];
  })).toEqual(ids);
}

async function enterBatchSelection(page: Page) {
  await enterBatchSelectionOf(page, ["app-0-safari", "app-1-mail"]);
}

async function createSmallFolder(page: Page) {
  await enterBatchSelection(page);
  await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    state.createFolderFromBatchSelection();
  });
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.activePages.flat().some((item) => item.type === "folder" && item.childPages.flat().length === 2);
  });
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return !state.groupDragState;
  }, null, { timeout: 4_000 });
  const result = await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return {
      batch: state.isBatchSelectionActive,
      folderId: state.activePages.flat()
        .find((item) => item.type === "folder" && item.childPages.flat().length === 2)?.id || null,
      openFolderId: state.openFolderId,
      selectedIds: [...state.batchSelectedIds],
    };
  });
  if (!result.folderId) throw new Error("small test folder was not created");
  expect(result).toMatchObject({
    batch: true,
    openFolderId: null,
    selectedIds: [],
  });
  await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    state.clearBatchSelection();
    state.commitActivePageIndex(0);
  });
  await page.waitForTimeout(500);
  return result.folderId;
}

async function readReleasePlan(page: Page) {
  return page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const plan = state.groupDragState?.runtimePlan;
    return plan
      ? {
        key: plan.key,
        entries: plan.entries?.map((entry) => ({
          id: entry.id,
          mode: entry.mode,
          target: entry.target,
        })) || [],
        status: state.groupDragState.runtimeStatus,
      }
      : null;
  });
}

async function dragIconToFolder(
  page: Page,
  sourceId: string,
  folderId: string,
  pointerId: number,
) {
  await waitForIconBounds(page, sourceId);
  await waitForIconBounds(page, folderId);
  const points = await page.evaluate(({ sourceId: source, folderId: folder }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const center = (id: string) => {
      const location = state.activePages
        .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
        .find((entry) => entry.item.id === id);
      if (!location) throw new Error(`Missing icon location: ${id}`);
      const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "desktop",
        id,
        pageIndex: location.pageIndex,
      });
      if (!bounds) throw new Error(`Missing rendered icon geometry: ${id}`);
      return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    };
    return { source: center(source), folder: center(folder) };
  }, { sourceId, folderId });

  await page.evaluate(({ point, pointerId }) => {
    const target = document.elementFromPoint(point.x, point.y);
    if (!target) throw new Error(`Pointer start target is outside the viewport: ${JSON.stringify(point)}`);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
  }, { point: points.source, pointerId });
  await page.waitForTimeout(560);
  // The first post-hold move arms the real drag. Move a short distance first,
  // then move onto the target so the drag offset is sampled at the source.
  const intermediate = {
    x: points.source.x + (points.folder.x - points.source.x) * 0.12,
    y: points.source.y + (points.folder.y - points.source.y) * 0.12,
  };
  await page.evaluate(({ point, pointerId }) => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point: intermediate, pointerId });
  await page.waitForTimeout(80);
  await page.evaluate(({ point, pointerId }) => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point: points.folder, pointerId });
  await page.waitForTimeout(120);
  await page.evaluate(({ point, pointerId }) => {
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point: points.folder, pointerId });
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return Boolean(state.groupDragState?.runtimePlan);
  }, null, { timeout: 3_000 });
  const plan = await readReleasePlan(page);
  if (!plan) throw new Error("Folder release completed without a runtime plan");
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return !state.groupDragState;
  }, null, { timeout: 3_000 });
  return plan;
}

async function dispatchDragPointer(
  page: Page,
  type: GroupReleaseDragPointerType,
  point: GroupReleasePoint,
  pointerId: number,
) {
  await page.evaluate(({ point, pointerId, type }) => {
    const target = type === "pointerdown"
      ? document.elementFromPoint(point.x, point.y)
      : window;
    if (!target) throw new Error(`Pointer target is outside the viewport: ${JSON.stringify(point)}`);
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point, pointerId, type });
}

async function readDesktopIconCenter(page: Page, id: string) {
  await waitForIconBounds(page, id);
  return page.evaluate((iconId) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const location = state.activePages
      .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
      .find((entry) => entry.item.id === iconId);
    if (!location) throw new Error(`Missing icon location: ${iconId}`);
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: iconId,
      pageIndex: location.pageIndex,
    });
    if (!bounds) throw new Error(`Missing rendered icon geometry: ${iconId}`);
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  }, id);
}

test("closed-folder releases use preview slots for the first nine and center absorb after them", async ({ page }) => {
  test.setTimeout(60_000);
  await waitForFixture(page);
  const folderId = await createSmallFolder(page);
  const sourceIds = [
    "app-2-photos",
    "app-3-music",
    "app-4-calendar",
    "app-5-maps",
    "app-6-messages",
    "app-7-notes",
    "app-8-reminders",
    "app-9-facetime",
  ];
  const plans: Awaited<ReturnType<typeof dragIconToFolder>>[] = [];
  for (const [index, sourceId] of sourceIds.entries()) {
    plans.push(await dragIconToFolder(page, sourceId, folderId, 100 + index));
  }

  expect(plans.slice(0, 6).every((plan) => plan.entries[0]?.mode === "folder-preview-slot")).toBe(true);
  const firstEntry = requireArrayEntry(requireArrayEntry(plans, 0, "release plans").entries, 0, "first release plan");
  const sixthEntry = requireArrayEntry(requireArrayEntry(plans, 5, "release plans").entries, 0, "sixth release plan");
  const seventhEntry = requireArrayEntry(requireArrayEntry(plans, 6, "release plans").entries, 0, "seventh release plan");
  const eighthEntry = requireArrayEntry(requireArrayEntry(plans, 7, "release plans").entries, 0, "eighth release plan");
  expect(firstEntry.target.slotIndex).toBe(2);
  expect(sixthEntry.target.slotIndex).toBe(7);
  expect(seventhEntry.mode).toBe("folder-preview-slot");
  expect(seventhEntry.target.slotIndex).toBe(8);
  expect(eighthEntry.mode).toBe("folder-center-absorb");
  await expect.poll(async () => page.evaluate(({ folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = state.activePages.flat().find((item) => item.id === folderId);
    return folder?.type === "folder" ? folder.childPages.flat().length : 0;
  }, { folderId })).toBe(10);
});

test("an auto-opened one-row folder waits for panel entry before closing and does not reopen", async ({ page }) => {
  test.setTimeout(30_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await waitForFixture(page);
  const folderId = await createSmallFolder(page);
  const source = await readDesktopIconCenter(page, "app-2-photos");
  const folderPoint = await readDesktopIconCenter(page, folderId);
  const pointerId = 220;
  await startFolderDropFrameTrace(page, folderId);
  await dispatchDragPointer(page, "pointerdown", source, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", {
    x: source.x + (folderPoint.x - source.x) * 0.12,
    y: source.y + (folderPoint.y - source.y) * 0.12,
  }, pointerId);
  await page.waitForTimeout(80);
  await dispatchDragPointer(page, "pointermove", folderPoint, pointerId);

  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.openFolderId;
  }), { timeout: 4_000 }).toBe(folderId);
  await expect.poll(
    () => readFolderDropFrameState(page, folderId),
    { timeout: 2_000 }
  ).toEqual({ fillVisible: false, planActive: false, strokeVisible: false });
  const openingFrameSamples = await stopFolderDropFrameTrace(page);
  expect(openingFrameSamples.length).toBeGreaterThan(0);
  expect(openingFrameSamples.every((sample) => !sample.fillVisible && !sample.strokeVisible)).toBe(true);
  const geometry = await page.evaluate(({ folderPoint }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const rect = state.folderPanelRef?.getBoundingClientRect?.();
    if (!rect) throw new Error("Auto-opened folder panel bounds are unavailable");
    return {
      folderPointOutside: folderPoint.x < rect.left || folderPoint.x > rect.right ||
        folderPoint.y < rect.top || folderPoint.y > rect.bottom,
      inside: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      outside: {
        x: rect.left > 100 ? rect.left - 80 : rect.right + 80,
        y: rect.top + rect.height / 2,
      },
    };
  }, { folderPoint });
  expect(geometry.folderPointOutside).toBe(true);

  await dispatchDragPointer(page, "pointermove", {
    x: folderPoint.x + 1,
    y: folderPoint.y,
  }, pointerId);
  await page.waitForTimeout(120);
  expect(await page.evaluate(({ folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.openFolderId === folderId && state.isFolderClosing === false;
  }, { folderId })).toBe(true);

  await dispatchDragPointer(page, "pointermove", geometry.inside, pointerId);
  await page.waitForTimeout(100);
  await dispatchDragPointer(page, "pointermove", geometry.outside, pointerId);
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.openFolderId;
  })).toBeNull();
  await page.waitForTimeout(1_400);
  expect(await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return {
      active: state.isFolderLayerActive,
      openFolderId: state.openFolderId,
      renderedFolderId: state.renderedFolder?.id || null,
    };
  })).toEqual({ active: false, openFolderId: null, renderedFolderId: null });
  await dispatchDragPointer(page, "pointercancel", geometry.outside, pointerId);
});

test("a selected group can leave an open folder and commit onto the desktop", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const setup = await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder("folder-creative-lab");
    const childIds = folder.childPages.flat()
      .flatMap((item) => item ? [item.id] : [])
      .slice(0, 2);
    if (childIds.length !== 2) throw new Error("Creative Lab needs two fixture children");
    state.commitOpenFolder(folder.id);
    return { childIds, folderId: folder.id };
  });
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.openFolderId;
  })).toBe(setup.folderId);
  await page.waitForFunction(({ childIds, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return childIds.every((id) => state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "folder",
      folderId,
      id,
      pageIndex: 0,
    }));
  }, setup);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    state.enterBatchSelection();
  });
  await page.waitForTimeout(50);
  for (const [index, id] of setup.childIds.entries()) {
    await page.evaluate(({ folderId, id, pointerId }) => {
      const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
      const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "folder",
        folderId,
        id,
        pageIndex: 0,
      });
      if (!bounds) throw new Error(`Selected folder child bounds are unavailable: ${id}`);
      const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      const target = document.elementFromPoint(point.x, point.y);
      if (!target) throw new Error(`Selected folder child pointer target is unavailable: ${id}`);
      const init = {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId,
        pointerType: "mouse",
        view: window,
      };
      target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
      target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
    }, { folderId: setup.folderId, id, pointerId: 230 + index });
  }
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return [...state.batchSelectedIds];
  })).toEqual(setup.childIds);

  const drag = await page.evaluate(({ childIds, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const leadId = childIds[0];
    if (!leadId) throw new Error("Open-folder desktop drag lead is unavailable");
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "folder",
      folderId,
      id: leadId,
      pageIndex: 0,
    });
    const panel = state.folderPanelRef?.getBoundingClientRect?.();
    if (!bounds || !panel) throw new Error("Open folder drag geometry is unavailable");
    return {
      outside: {
        x: panel.left > 48 ? panel.left - 24 : panel.right + 24,
        y: panel.top + panel.height / 2,
      },
      source: { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
    };
  }, setup);
  const pointerId = 240;
  await dispatchDragPointer(page, "pointerdown", drag.source, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", {
    x: drag.source.x + 12,
    y: drag.source.y + 4,
  }, pointerId);
  await page.waitForTimeout(80);
  await dispatchDragPointer(page, "pointermove", drag.outside, pointerId);
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.openFolderId;
  })).toBeNull();
  await expect.poll(async () => page.evaluate(() => {
    const group = window.__LUMERIA_GROUP_RELEASE_TEST__.getState().groupDragState;
    return {
      reason: group?.intentPlan?.reason || null,
      status: group?.intentPlan?.status || null,
      type: group?.intent?.type || null,
    };
  })).toEqual({ reason: null, status: "accepted", type: "desktop-slot" });
  await dispatchDragPointer(page, "pointerup", drag.outside, pointerId);
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return !state.groupDragState;
  }, null, { timeout: 5_000 });

  const result = await page.evaluate(({ childIds, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder(folderId);
    return {
      folderChildren: folder.childPages.flat().flatMap((item) => item ? [item.id] : []),
      openFolderId: state.openFolderId,
      topLevelIds: state.activePages.flat().map((item) => item.id),
    };
  }, setup);
  expect(result.openFolderId).toBeNull();
  expect(result.topLevelIds).toEqual(expect.arrayContaining(setup.childIds));
  expect(result.folderChildren.filter((id) => setup.childIds.includes(id))).toEqual([]);
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.isFolderLayerActive;
  })).toBe(false);
});

test("a folder drag turns from the visible panel border and keeps a new page latched through a small retreat", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const setup = await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder("folder-creative-lab");
    const childId = folder.childPages[2]?.[0]?.id;
    if (!childId) throw new Error("Creative Lab needs a populated third page");
    state.commitOpenFolder(folder.id);
    state.folderOverlay.commitFolderPageIndex(2, { allowCreate: false });
    return { childId, folderId: folder.id };
  });
  await page.waitForFunction(({ childId, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state?.openFolderId === folderId && state.folderOverlay.folderPageIndex.value === 2 && Boolean(
      state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "folder",
        folderId,
        id: childId,
        pageIndex: 2,
      })
    );
  }, setup);
  await page.waitForTimeout(900);

  const points = await page.evaluate(({ childId, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "folder",
      folderId,
      id: childId,
      pageIndex: 2,
    });
    const viewport = state.folderOverlay.folderViewportRef.value?.getBoundingClientRect?.();
    const panel = state.folderPanelRef?.getBoundingClientRect?.();
    if (!bounds || !viewport || !panel) throw new Error("Folder drag geometry is unavailable");
    return {
      edge: { x: panel.right - 2, y: viewport.bottom - 24 },
      retreat: { x: viewport.right - 68, y: viewport.bottom - 24 },
      source: {
        x: bounds.left + Math.min(8, bounds.width * 0.15),
        y: bounds.top + bounds.height / 2,
      },
      sourceRect: {
        height: bounds.height,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
      },
    };
  }, setup);
  const pointerId = 245;
  await page.evaluate((childId) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder("folder-creative-lab");
    const child = folder.childPages[2]?.find((item) => item?.id === childId);
    if (!child) throw new Error("Folder edge fixture selection item is unavailable");
    state.enterBatchSelection(child);
  }, setup.childId);
  await page.waitForFunction((childId) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state?.isBatchSelectionActive === true && state.batchSelectedIds.has(childId);
  }, setup.childId);
  await page.evaluate(({ childId, folderId, point, pointerId, sourceRect }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder(folderId);
    const item = folder.childPages[2]?.find((child) => child?.id === childId);
    if (!item) throw new Error("Folder edge fixture drag item is unavailable");
    state.folderOverlay.handleIconPointerDown({
      button: 0,
      buttons: 1,
      clientX: point.x,
      clientY: point.y,
      currentTarget: {
        getBoundingClientRect: () => sourceRect,
      },
      dragVisualState: {
        cellHeight: 80,
        cellWidth: 80,
        compact: false,
        iconSize: 64,
        singleLineLabel: false,
      },
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      preventDefault() {},
      stopPropagation() {},
      type: "pointerdown",
    }, item, {
      folderId,
      index: 0,
      pageIndex: 2,
      type: "folder",
    });
  }, { ...setup, point: points.source, pointerId, sourceRect: points.sourceRect });
  await page.waitForTimeout(700);
  await page.waitForFunction(() => Boolean(
    window.__LUMERIA_GROUP_RELEASE_TEST__.getState().groupDragState
  ), null, { timeout: 3_000 });
  await dispatchDragPointer(page, "pointermove", points.edge, pointerId);
  await page.waitForTimeout(350);

  expect(await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return {
      folderPageIndex: state.folderOverlay.folderPageIndex.value,
      request: state.folderOverlay.folderPageTurnRequest.value,
      visualFolderPageIndex: state.folderOverlay.visualFolderPageIndex.value,
    };
  })).toEqual({ folderPageIndex: 2, request: null, visualFolderPageIndex: 2 });

  await page.waitForTimeout(1_200);
  expect(await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.folderOverlay.folderPageIndex.value;
  })).toBe(3);
  await dispatchDragPointer(page, "pointermove", points.retreat, pointerId);
  await page.waitForTimeout(1_000);
  expect(await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return {
      folderPageIndex: state.folderOverlay.folderPageIndex.value,
      visualFolderPageIndex: state.folderOverlay.visualFolderPageIndex.value,
    };
  })).toEqual({ folderPageIndex: 3, visualFolderPageIndex: 3 });

  await dispatchDragPointer(page, "pointercancel", points.retreat, pointerId);
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return !state.groupDragState;
  });
});

test("a child dragged directly out of a one-row folder onto its source folder can auto-open it again", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const folderId = await createSmallFolder(page);
  const setup = await page.evaluate((sourceFolderId) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder(sourceFolderId);
    const childId = folder.childPages[0]?.[0]?.id;
    if (!childId) throw new Error("One-row source folder needs a child");
    state.commitOpenFolder(folder.id);
    state.folderOverlay.commitFolderPageIndex(0, { allowCreate: false });
    return { childId, folderId: folder.id };
  }, folderId);
  await page.waitForFunction(({ childId, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state?.openFolderId === folderId && Boolean(
      state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "folder",
        folderId,
        id: childId,
        pageIndex: 0,
      })
    );
  }, setup);
  await page.waitForTimeout(900);
  const points = await page.evaluate(({ childId, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "folder",
      folderId,
      id: childId,
      pageIndex: 0,
    });
    const panel = state.folderPanelRef?.getBoundingClientRect?.();
    if (!bounds || !panel) throw new Error("Folder re-entry source geometry is unavailable");
    return {
      exit: {
        x: panel.left > 40 ? panel.left - 24 : panel.right + 24,
        y: panel.top + panel.height / 2,
      },
      source: { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
    };
  }, setup);
  const pointerId = 246;
  await dispatchDragPointer(page, "pointerdown", points.source, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", {
    x: points.source.x + 12,
    y: points.source.y + 4,
  }, pointerId);
  await page.waitForTimeout(80);
  await dispatchDragPointer(page, "pointermove", points.exit, pointerId);
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.openFolderId;
  })).toBeNull();
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.isFolderLayerActive === false;
  }, null, { timeout: 3_000 });
  const folderPoint = await readDesktopIconCenter(page, setup.folderId);
  await dispatchDragPointer(page, "pointermove", folderPoint, pointerId);

  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return {
      intentTarget: state.groupDragState?.intent?.folderId || null,
      intentType: state.groupDragState?.intent?.type || null,
      targetId: state.dragFolderTargetId,
    };
  })).toEqual({
    intentTarget: setup.folderId,
    intentType: "folder-thumbnail",
    targetId: setup.folderId,
  });
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.openFolderId;
  }), { timeout: 3_000 }).toBe(setup.folderId);

  await dispatchDragPointer(page, "pointercancel", folderPoint, pointerId);
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return !state.groupDragState;
  });
});

test("ESC cancellation of a 2x7 cross-page folder drag hands real icons off at stable slots", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await waitForFixture(page);
  const setup = await page.evaluate(async () => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const root = window.__LUMERIA_GROUP_RELEASE_TEST__.getInstance();
    const settings = root.setupState.settingsPanel;
    while (Number(settings.draftFolderRows.value) > 2) settings.changeDraftFolderRows(-1);
    while (Number(settings.draftFolderRows.value) < 2) settings.changeDraftFolderRows(1);
    while (Number(settings.draftFolderCols.value) > 7) settings.changeDraftFolderCols(-1);
    while (Number(settings.draftFolderCols.value) < 7) settings.changeDraftFolderCols(1);
    const outcome = await settings.applySettingsConfig();
    if (!outcome?.ok) throw outcome?.error || new Error("Unable to apply the 2x7 folder fixture");
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder("folder-creative-lab");
    const firstId = folder.childPages[0]?.[0]?.id;
    const secondId = folder.childPages[1]?.[0]?.id;
    if (!firstId || !secondId) throw new Error("2x7 folder fixture needs two populated pages");
    state.commitOpenFolder(folder.id);
    state.folderOverlay.commitFolderPageIndex(0, { allowCreate: false });
    return { firstId, folderId: folder.id, secondId };
  });
  await page.waitForFunction(({ firstId, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state?.openFolderId === folderId && Boolean(
      state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "folder",
        folderId,
        id: firstId,
        pageIndex: 0,
      })
    );
  }, setup);
  await page.waitForTimeout(900);
  await page.evaluate(({ firstId, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder(folderId);
    const first = folder.childPages[0]?.find((item) => item?.id === firstId);
    if (!first) throw new Error("First-page selection item is unavailable");
    state.enterBatchSelection(first);
    state.folderOverlay.commitFolderPageIndex(1, { allowCreate: false });
  }, setup);
  await page.waitForFunction(({ folderId, secondId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state?.folderOverlay?.folderPageIndex?.value === 1 && Boolean(
      state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "folder",
        folderId,
        id: secondId,
        pageIndex: 1,
      })
    );
  }, setup);
  await page.waitForTimeout(700);
  const source = await page.evaluate(({ firstId, folderId, secondId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder(folderId);
    const second = folder.childPages[1]?.find((item) => item?.id === secondId);
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "folder",
      folderId,
      id: secondId,
      pageIndex: 1,
    });
    if (!second || !bounds) throw new Error("Second-page selection geometry is unavailable");
    return {
      point: { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      rect: { height: bounds.height, left: bounds.left, top: bounds.top, width: bounds.width },
    };
  }, setup);
  await page.evaluate(({ folderId, point, rect, secondId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder(folderId);
    const item = folder.childPages[1]?.find((child) => child?.id === secondId);
    const nativeEvent = {
      button: 0,
      buttons: 1,
      clientX: point.x,
      clientY: point.y,
      currentTarget: { getBoundingClientRect: () => rect },
      isPrimary: true,
      pointerId: 248,
      pointerType: "mouse",
      preventDefault() {},
      stopImmediatePropagation() {},
      stopPropagation() {},
      type: "pointerdown",
    };
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    const folderLayer = layer.singleStageFolderLayer;
    const node = folderLayer?.iconNodes?.get(`${folderId}:${secondId}`);
    if (!item || !folderLayer || !node?.item || node.item.id !== item.id) {
      throw new Error("Second-page Pixi icon node is unavailable");
    }
    folderLayer.handleIconAction(
      "pointerdown",
      nativeEvent,
      node.item,
      { folderId, index: 0, pageIndex: 1, type: "folder" },
      node
    );
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId: 248,
      pointerType: "mouse",
      view: window,
    }));
  }, { ...setup, ...source });
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return [...state.batchSelectedIds];
  })).toEqual([setup.firstId, setup.secondId]);
  const pointerId = 247;
  await page.evaluate(({ folderId, point, pointerId, rect, secondId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder(folderId);
    const item = folder.childPages[1]?.find((child) => child?.id === secondId);
    if (!item) throw new Error("Cross-page drag lead is unavailable");
    state.folderOverlay.handleIconPointerDown({
      button: 0,
      buttons: 1,
      clientX: point.x,
      clientY: point.y,
      currentTarget: { getBoundingClientRect: () => rect },
      dragVisualState: {
        cellHeight: 80,
        cellWidth: 80,
        compact: false,
        iconSize: 64,
        singleLineLabel: false,
      },
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      preventDefault() {},
      stopPropagation() {},
      type: "pointerdown",
    }, item, { folderId, index: 0, pageIndex: 1, type: "folder" });
  }, { ...setup, ...source, pointerId });
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", {
    x: source.point.x + 16,
    y: source.point.y + 5,
  }, pointerId);
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state?.groupDragState?.phase === "dragging";
  });

  const handoffPromise = page.evaluate(async ({ firstId, folderId, secondId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    const folderLayer = layer.singleStageFolderLayer;
    if (!folderLayer) throw new Error("Pixi folder layer is unavailable");
    const entries = [
      { id: firstId, key: `${folderId}:${firstId}` },
      { id: secondId, key: `${folderId}:${secondId}` },
    ];
    return new Promise<FolderHandoffResult>((resolve, reject) => {
      let frames = 0;
      let settledFrames = 0;
      let sawReturning = false;
      let maxReturningTargetDelta = 0;
      let releaseOutcome: string | null = null;
      const firstVisibleTargetDeltaById = new Map<string, number>();
      const ownershipVisibilityViolationIds = new Set<string>();
      const sample = () => {
        frames += 1;
        const group = state.groupDragState;
        if (group?.phase === "returning") {
          sawReturning = true;
          releaseOutcome ||= group.outcome;
          for (const { id, key } of entries) {
            const node = folderLayer.iconNodes.get(key);
            const target = folderLayer.folderIconLayoutTargets.get(key);
            if (!node || !target) continue;
            const targetDelta = Math.hypot(node.x - target.x, node.y - target.y);
            maxReturningTargetDelta = Math.max(maxReturningTargetDelta, targetDelta);
            if (layer.visualOwnership.hasOwner(`item:${id}`) && node.visible === true) {
              ownershipVisibilityViolationIds.add(id);
            }
            if (node.visible === true && !firstVisibleTargetDeltaById.has(id)) {
              firstVisibleTargetDeltaById.set(id, targetDelta);
            }
          }
        }
        if (!group && sawReturning) {
          settledFrames += 1;
          for (const { id, key } of entries) {
            if (firstVisibleTargetDeltaById.has(id)) continue;
            const node = folderLayer.iconNodes.get(key);
            const target = folderLayer.folderIconLayoutTargets.get(key);
            if (node?.visible === true && target) {
              firstVisibleTargetDeltaById.set(
                id,
                Math.hypot(node.x - target.x, node.y - target.y)
              );
            }
          }
        } else {
          settledFrames = 0;
        }
        if (settledFrames >= 8) {
          resolve({
            firstVisibleTargetDeltaById: Object.fromEntries(firstVisibleTargetDeltaById),
            maxReturningTargetDelta,
            ownershipVisibilityViolationIds: [...ownershipVisibilityViolationIds],
            releaseOutcome,
            sawReturning,
            selectedIds: [...state.batchSelectedIds],
          });
          return;
        }
        if (frames >= 300) {
          reject(new Error("2x7 ESC folder handoff did not settle"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, setup);
  await page.keyboard.press("Escape");
  const handoff = await handoffPromise;

  expect(handoff).toMatchObject({
    ownershipVisibilityViolationIds: [],
    releaseOutcome: "cancelled",
    sawReturning: true,
    selectedIds: [setup.firstId, setup.secondId],
  });
  expect(handoff.maxReturningTargetDelta).toBeLessThanOrEqual(0.75);
  const firstHandoffDelta = handoff.firstVisibleTargetDeltaById[setup.firstId];
  const secondHandoffDelta = handoff.firstVisibleTargetDeltaById[setup.secondId];
  if (firstHandoffDelta === undefined || secondHandoffDelta === undefined) {
    throw new Error("2x7 ESC folder handoff target deltas are unavailable");
  }
  expect(firstHandoffDelta).toBeLessThanOrEqual(0.75);
  expect(secondHandoffDelta).toBeLessThanOrEqual(0.75);
});

test("canceling a mixed desktop and folder-child drag restores the projected folder shell", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 800 });
  await waitForFixture(page);
  await enterBatchSelectionOf(page, ["app-4-calendar", "app-5-maps"]);
  await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    state.createFolderFromBatchSelection();
  });
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return !state.groupDragState && state.activePages[0]?.some((item) =>
      item.type === "folder" &&
      item.childPages.flat().some((child) => child?.id === "app-4-calendar") &&
      item.childPages.flat().some((child) => child?.id === "app-5-maps")
    );
  }, null, { timeout: 5_000 });
  const setup = await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const firstPage = state.activePages[0];
    if (!firstPage) throw new Error("Mixed-source first page is unavailable");
    const folderIndex = firstPage.findIndex((item) =>
      item.type === "folder" &&
      item.childPages.flat().some((child) => child?.id === "app-4-calendar") &&
      item.childPages.flat().some((child) => child?.id === "app-5-maps")
    );
    const folder = firstPage[folderIndex];
    if (!folder || folder.type !== "folder") {
      throw new Error("Mixed-source projected folder is unavailable");
    }
    return { folderId: folder.id, folderIndex };
  });
  expect(setup).toMatchObject({ folderIndex: 4 });
  expect(setup.folderId).toBeTruthy();

  await dispatchIconPointer(page, "app-2-photos", { pointerId: 260 });
  await dispatchIconPointer(page, "app-3-music", { pointerId: 261 });
  await page.evaluate((folderId) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    state.commitOpenFolder(folderId);
  }, setup.folderId);
  await page.waitForFunction(({ childId, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state?.openFolderId === folderId && Boolean(state.iconBoundsRegistry.getBounds(
      "launch",
      "rendered",
      { area: "folder", folderId, id: childId, pageIndex: 0 }
    ));
  }, { childId: "app-4-calendar", folderId: setup.folderId });
  await page.waitForTimeout(900);
  await page.evaluate(({ childId, folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "folder",
      folderId,
      id: childId,
      pageIndex: 0,
    });
    if (!bounds) throw new Error("Mixed-source folder child bounds are unavailable");
    const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const target = document.elementFromPoint(point.x, point.y);
    if (!target) throw new Error("Mixed-source folder child pointer target is unavailable");
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId: 262,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
  }, { childId: "app-4-calendar", folderId: setup.folderId });
  await expect.poll(async () => page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return [...state.batchSelectedIds];
  })).toEqual(["app-2-photos", "app-3-music", "app-4-calendar"]);
  await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    state.commitOpenFolder(null);
  });
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state.openFolderId == null && state.isFolderLayerActive === false;
  }, null, { timeout: 5_000 });
  await waitForIconBounds(page, setup.folderId);
  await page.waitForFunction(({ childId, folderId }) => {
    const registry = window.__LUMERIA_GROUP_RELEASE_TEST__.getState().iconBoundsRegistry;
    const key = { childId, folderId, slotIndex: 0 };
    return Boolean(
      registry?.getBounds("previewChild", "stableStageLayout", key) &&
      registry?.getBounds("previewChild", "rendered", key)
    );
  }, { childId: "app-4-calendar", folderId: setup.folderId });
  await page.waitForTimeout(300);

  const result = await page.evaluate(async ({ folderId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const firstPage = state.activePages[0];
    if (!firstPage) throw new Error("Mixed-source first page is unavailable during drag");
    const pageBefore = JSON.stringify(firstPage);
    const findFolderIndex = (pages: LaunchpadPages = state.activePages): number => (
      pages[0]?.findIndex((item) => item.id === folderId) ?? -1
    );
    const readDesktopCenter = (
      id: string,
      variant: IconBoundsVariant = "rendered",
    ): GroupReleasePoint => {
      const location = state.activePages
        .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
        .find((entry) => entry.item.id === id);
      if (!location) throw new Error(`Mixed-source desktop item is unavailable: ${id}`);
      const bounds = state.iconBoundsRegistry.getBounds("launch", variant, {
        area: "desktop",
        id,
        pageIndex: location.pageIndex,
      });
      if (!bounds) throw new Error(`Mixed-source desktop bounds are unavailable: ${id}`);
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    };
    const originalCenter = readDesktopCenter(folderId, "stableStageLayout");
    const source = readDesktopCenter("app-2-photos");
    const target = document.elementFromPoint(source.x, source.y);
    if (!target) throw new Error("Mixed-source desktop pointer target is unavailable");
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: source.x,
      clientY: source.y,
      isPrimary: true,
      pointerId: 263,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    await wait(540);
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: source.x + 14,
      clientY: source.y + 5,
    }));
    await wait(80);

    const cols = Math.max(1, Number(state.gridCols) || 1);
    const rows = Math.max(1, Number(state.gridRows) || 1);
    const firstItem = firstPage[0];
    const secondItem = firstPage[1];
    const nextRowItem = firstPage[cols];
    if (!firstItem || !secondItem || !nextRowItem) {
      throw new Error("Mixed-source desktop grid anchors are unavailable");
    }
    const firstCenter = readDesktopCenter(firstItem.id);
    const secondCenter = readDesktopCenter(secondItem.id);
    const nextRowCenter = readDesktopCenter(nextRowItem.id);
    const cellWidth = secondCenter.x - firstCenter.x;
    const cellHeight = nextRowCenter.y - firstCenter.y;
    const pageRect = {
      height: cellHeight * rows,
      left: firstCenter.x - cellWidth / 2,
      top: firstCenter.y - cellHeight / 2,
      width: cellWidth * cols,
    };
    const capacity = cols * rows;
    const candidateIndexes = [20, 27, 13, 10, 30, capacity - 2]
      .filter((index, position, items) => index > 4 && index < capacity && items.indexOf(index) === position);
    let projectedIndex = -1;
    let projectedIntent: string | null = null;
    for (const index of candidateIndexes) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const point = {
        x: pageRect.left + (col + 0.08) * (pageRect.width / cols),
        y: pageRect.top + (row + 0.5) * (pageRect.height / rows),
      };
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: point.x,
        clientY: point.y,
      }));
      await wait(140);
      projectedIndex = findFolderIndex(state.groupDragState?.projectedPages || []);
      projectedIntent = state.groupDragState?.intent?.type || null;
      if (projectedIndex === 2 && projectedIntent === "desktop-slot") break;
    }

    const toolbar = document.querySelector(".launchpad-selection-toolbar-cancel-active");
    if (!toolbar) throw new Error("Batch cancel zone is unavailable during the mixed-source drag");
    const toolbarRect = toolbar.getBoundingClientRect();
    const cancelPoint = {
      x: toolbarRect.left + toolbarRect.width / 2,
      y: toolbarRect.top + toolbarRect.height / 2,
    };
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: cancelPoint.x,
      clientY: cancelPoint.y,
    }));
    await wait(80);
    const cancelArmed = state.groupDragState?.cancelArmed === true;
    window.dispatchEvent(new PointerEvent("pointerup", {
      ...init,
      buttons: 0,
      clientX: cancelPoint.x,
      clientY: cancelPoint.y,
    }));
    const release = {
      outcome: state.groupDragState?.outcome || null,
      phase: state.groupDragState?.phase || null,
    };
    const releaseDeadline = performance.now() + 5_000;
    while (state.groupDragState && performance.now() < releaseDeadline) await frame();

    let finalCenter = readDesktopCenter(folderId);
    let finalDelta = Math.hypot(
      finalCenter.x - originalCenter.x,
      finalCenter.y - originalCenter.y
    );
    const layoutDeadline = performance.now() + 3_000;
    while (finalDelta > 0.75 && performance.now() < layoutDeadline) {
      await frame();
      finalCenter = readDesktopCenter(folderId);
      finalDelta = Math.hypot(
        finalCenter.x - originalCenter.x,
        finalCenter.y - originalCenter.y
      );
    }
    return {
      cancelArmed,
      finalDelta,
      finalFolderIndex: findFolderIndex(),
      groupEnded: state.groupDragState == null,
      layoutUnchanged: JSON.stringify(state.activePages[0]) === pageBefore,
      projectedIndex,
      projectedIntent,
      release,
      selectedIds: [...state.batchSelectedIds],
    };
  }, { folderId: setup.folderId });

  expect(result).toMatchObject({
    cancelArmed: true,
    finalFolderIndex: 4,
    layoutUnchanged: true,
    projectedIndex: 2,
    projectedIntent: "desktop-slot",
    release: { outcome: "cancelled", phase: "returning" },
    selectedIds: ["app-2-photos", "app-3-music", "app-4-calendar"],
  });
  expect(result.finalDelta).toBeLessThanOrEqual(0.75);
  expect(result.groupEnded).toBe(true);
});

test("created-folder release keeps the hover frame center continuous on pointerup", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const sourceId = "app-12-books";
  const targetId = "app-4-calendar";
  const pointerId = 240;
  const points = await page.evaluate(({ sourceId, targetId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const center = (id: string): GroupReleasePoint => {
      const location = state.activePages
        .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
        .find((entry) => entry.item.id === id);
      if (!location) throw new Error(`Desktop release item is unavailable: ${id}`);
      const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "desktop",
        id,
        pageIndex: location.pageIndex,
      });
      if (!bounds) throw new Error(`Desktop release bounds are unavailable: ${id}`);
      return {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
    };
    return { source: center(sourceId), target: center(targetId) };
  }, { sourceId, targetId });

  await page.evaluate(({ point, pointerId }) => {
    const target = document.elementFromPoint(point.x, point.y);
    if (!target) throw new Error("Created-folder source pointer target is unavailable");
    target.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point: points.source, pointerId });
  await page.waitForTimeout(560);
  const intermediate = {
    x: points.source.x + (points.target.x - points.source.x) * 0.12,
    y: points.source.y + (points.target.y - points.source.y) * 0.12,
  };
  const movements: readonly Readonly<{ delay: number; point: GroupReleasePoint }>[] = [
    { delay: 80, point: intermediate },
    { delay: 160, point: points.target },
  ];
  for (const { point, delay } of movements) {
    await page.evaluate(({ point, pointerId }) => {
      window.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId,
        pointerType: "mouse",
        view: window,
      }));
    }, { point, pointerId });
    await page.waitForTimeout(delay);
  }
  await page.waitForFunction((targetId) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state?.dragFolderHoverState?.targetId === targetId;
  }, targetId);

  const continuity = await page.evaluate(async ({ point, pointerId, sourceId, targetId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    const groupDragLayer = layer.groupDragLayer;
    if (!groupDragLayer) throw new Error("Pixi desktop group layer is unavailable");

    const dragGroup = state.groupDragState;
    if (!dragGroup) throw new Error("Created-folder drag state is unavailable before release");
    const sourceEntryIndex = dragGroup.entries.findIndex((entry) => entry.item?.id === sourceId);
    const sourceEntry = sourceEntryIndex >= 0 ? dragGroup.entries[sourceEntryIndex] : null;
    const sourceNodeBeforeRelease = sourceEntry?.continuityKey
      ? groupDragLayer.activeNodesByContinuityKey.get(sourceEntry.continuityKey)
      : null;
    if (!sourceNodeBeforeRelease) throw new Error("Source actor node is not synchronized before release");
    const sourceCenterBeforeRelease = groupDragLayer.toLocal(
      { x: 0, y: 0 },
      sourceNodeBeforeRelease.visualWrap,
    );
    let actorHandoff: ActorHandoffSnapshot | null = null;
    const originalGroupLayerUpdate = groupDragLayer.update;
    groupDragLayer.update = function instrumentActorHandoff(nextState) {
      const result = originalGroupLayerUpdate.call(this, nextState);
      const nextGroup = nextState?.groupState;
      const releaseActorsReady = nextGroup?.phase === "releasing" &&
        this.activeNodesByContinuityKey.size === nextGroup.entries.length &&
        nextGroup.entries.every((entry) => (
          typeof entry.continuityKey === "string" &&
          this.activeNodesByContinuityKey.has(entry.continuityKey)
        ));
      if (!actorHandoff && releaseActorsReady) {
        const nextIndex = nextGroup.entries.findIndex((entry) => entry.actorKey === sourceEntry?.actorKey);
        const nextNode = sourceEntry?.continuityKey
          ? this.activeNodesByContinuityKey.get(sourceEntry.continuityKey)
          : null;
        const nextCenter = nextNode
          ? this.toLocal({ x: 0, y: 0 }, nextNode.visualWrap)
          : null;
        actorHandoff = {
          actorOrder: nextGroup.entries.map((entry) => entry.actorKey),
          orderedNodeMatches: nextIndex >= 0 && this.nodes[nextIndex] === nextNode,
          centerDelta: nextCenter
            ? Math.hypot(
              nextCenter.x - sourceCenterBeforeRelease.x,
              nextCenter.y - sourceCenterBeforeRelease.y
            )
            : null,
          sameNode: nextNode === sourceNodeBeforeRelease,
        };
        this.update = originalGroupLayerUpdate;
      }
      return result;
    };

    const targetNode = layer.findIconNodeByItemId(targetId);
    const hoverVisual = targetNode?.folderCreateBackdrop || targetNode?.visualWrap || targetNode;
    if (!hoverVisual) throw new Error("Created-folder hover visual is unavailable");
    const hoverCenter = groupDragLayer.toLocal(
      { x: 0, y: 0 },
      hoverVisual,
    );

    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));

    return new Promise<CreatedFolderContinuityResult>((resolve, reject) => {
      let frames = 0;
      let firstReleaseFrame: CreatedFolderReleaseFrame | null = null;
      const ownershipViolations: GroupReleaseDiagnostic[] = [];
      const sample = () => {
        frames += 1;
        const frame = groupDragLayer.releaseController?.folderShellFrame;
        const group = state.groupDragState;
        const folderId = group?.semanticPlan?.effects?.createdFolderId;
        if (frame?.visible && !firstReleaseFrame) {
          const folderNode = layer.findIconNodeByItemId(folderId);
          const folderEntry = layer.lastDesktopRenderPlan?.entries?.find(
            (entry) => entry.item?.id === folderId
          );
          firstReleaseFrame = {
            firstReleaseCenter: { x: frame.position.x, y: frame.position.y },
            folderLayoutY: folderEntry?.layoutTarget?.y ?? null,
            folderNodeY: folderNode?.position?.y ?? null,
            hoverCenter: { x: hoverCenter.x, y: hoverCenter.y },
            sampledFrame: frames,
          };
        }
        if (firstReleaseFrame && group?.phase === "releasing" && folderId) {
          const folderNode = layer.findIconNodeByItemId(folderId);
          const shellKey = `folderShell:${folderId}`;
          const shellOwned = layer.visualOwnership.hasOwner(shellKey);
          const shellVisible = frame?.visible === true;
          const folderLive = folderNode?.visible === true && folderNode?.state?.ghosted !== true;
          if (Number(shellVisible) + Number(folderLive) !== 1 || shellVisible !== shellOwned) {
            ownershipViolations.push({
              frame: frames,
              kind: "folder-shell",
              folderLive,
              shellOwned,
              shellVisible,
            });
          }
          for (const entry of group.runtimePlan?.entries || []) {
            if (entry.mode !== "created-folder") continue;
            const entryIndex = group.entries.findIndex((candidate) => (
              candidate.actorKey === entry.actorKey || candidate.item?.id === entry.id
            ));
            const ghost = entryIndex >= 0 ? groupDragLayer.nodes[entryIndex] : null;
            const slotIndex = entry.target?.slotIndex;
            const child = typeof slotIndex === "number"
              ? folderNode?.folderChildNodes?.[slotIndex]
              : null;
            const ghostDrawable = ghost?.visible === true && ghost?.renderable !== false && Number(ghost.alpha) > 0.001;
            const childDrawable = folderLive && child?.visible === true && child?.renderable === true;
            if (Number(ghostDrawable) + Number(childDrawable) !== 1) {
              ownershipViolations.push({
                childDrawable,
                frame: frames,
                ghostDrawable,
                id: entry.id,
                kind: "preview-slot",
              });
            }
          }
        }
        if (firstReleaseFrame && !group) {
          groupDragLayer.update = originalGroupLayerUpdate;
          resolve({ ...firstReleaseFrame, actorHandoff, ownershipViolations });
          return;
        }
        if (frames >= 240) {
          groupDragLayer.update = originalGroupLayerUpdate;
          reject(new Error("created-folder release did not settle with continuous visual ownership"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { point: points.target, pointerId, sourceId, targetId });

  expect(continuity.actorHandoff?.sameNode).toBe(true);
  expect(continuity.actorHandoff?.orderedNodeMatches).toBe(true);
  expect(continuity.actorHandoff?.actorOrder.slice(0, 2)).toEqual([
    `item:${targetId}`,
    `item:${sourceId}`,
  ]);
  expect(continuity.actorHandoff?.centerDelta).toBeLessThanOrEqual(0.5);
  expect(Math.abs(continuity.firstReleaseCenter.x - continuity.hoverCenter.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(continuity.firstReleaseCenter.y - continuity.hoverCenter.y)).toBeLessThanOrEqual(0.5);
  if (continuity.folderNodeY === null || continuity.folderLayoutY === null) {
    throw new Error("Created-folder release layout coordinates are unavailable");
  }
  expect(Math.abs(continuity.folderNodeY - continuity.folderLayoutY)).toBeLessThanOrEqual(0.001);
  expect(continuity.ownershipViolations).toEqual([]);
});

test("single-icon return keeps its already visible label opaque through handoff", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const iconId = "app-3-music";
  const pointerId = 241;
  const point = await readDesktopIconCenter(page, iconId);

  await dispatchDragPointer(page, "pointerdown", point, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", { x: point.x + 18, y: point.y }, pointerId);
  await page.waitForTimeout(80);
  await dispatchDragPointer(page, "pointermove", point, pointerId);
  await page.waitForTimeout(120);
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return state?.groupDragState?.phase === "dragging";
  });

  const handoff = await page.evaluate(async ({ iconId, point, pointerId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    const groupDragLayer = layer.groupDragLayer;
    if (!groupDragLayer) throw new Error("Pixi desktop group layer is unavailable");
    const dragGroup = state.groupDragState;
    if (!dragGroup) throw new Error("Single-icon drag state is unavailable before release");
    const ghostIndex = dragGroup.entries.findIndex((entry) => entry.item?.id === iconId);
    const ghostNode = ghostIndex >= 0 ? groupDragLayer.nodes[ghostIndex] : null;
    const ghostLabelAlphaBeforeRelease = Number(ghostNode?.labelText?.alpha);

    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));

    return new Promise<SingleIconHandoffResult>((resolve, reject) => {
      let frames = 0;
      let settledFrames = 0;
      let liveLabelFrameCount = 0;
      let minLiveLabelAlpha = 1;
      let releaseOutcome: string | null = null;
      let releasePhase: string | null = null;
      const sample = () => {
        frames += 1;
        const group = state.groupDragState;
        if (group) {
          releaseOutcome ||= group.outcome;
          if (["releasing", "returning"].includes(group.phase)) releasePhase ||= group.phase;
        }
        const liveNode = layer.findIconNodeByItemId(iconId);
        if (liveNode?.visible === true && liveNode?.labelText?.visible === true) {
          liveLabelFrameCount += 1;
          minLiveLabelAlpha = Math.min(minLiveLabelAlpha, Number(liveNode.labelText.alpha));
        }
        settledFrames = group ? 0 : settledFrames + 1;
        if (settledFrames >= 12) {
          resolve({
            ghostLabelAlphaBeforeRelease,
            liveLabelFrameCount,
            minLiveLabelAlpha,
            releaseOutcome,
            releasePhase,
          });
          return;
        }
        if (frames >= 240) {
          reject(new Error("single-icon return did not settle"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { iconId, point, pointerId });

  expect(handoff.ghostLabelAlphaBeforeRelease).toBeGreaterThanOrEqual(0.99);
  expect(handoff.liveLabelFrameCount).toBeGreaterThan(0);
  expect(handoff.minLiveLabelAlpha).toBeGreaterThanOrEqual(0.99);
  expect(handoff.releaseOutcome).toBe("noop");
  expect(handoff.releasePhase).toBe("returning");
});

test("long-distance desktop release keeps a stable slot and exactly one visual owner", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const iconId = "app-0-safari";
  const neighborId = "app-1-mail";
  const pointerId = 243;
  const source = await readDesktopIconCenter(page, iconId);

  await dispatchDragPointer(page, "pointerdown", source, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", {
    x: source.x + 24,
    y: source.y + 12,
  }, pointerId);
  await page.waitForTimeout(60);

  const result = await page.evaluate(async ({ iconId, neighborId, pointerId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    const groupDragLayer = layer.groupDragLayer;
    if (!groupDragLayer) throw new Error("Pixi desktop group layer is unavailable");
    const readCenter = (id: string): GroupReleasePoint => {
      const location = state.activePages
        .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
        .find((entry) => entry.item.id === id);
      if (!location) throw new Error(`Long-distance release item is unavailable: ${id}`);
      const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "desktop",
        id,
        pageIndex: location.pageIndex,
      });
      if (!bounds) throw new Error(`Long-distance release bounds are unavailable: ${id}`);
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    };
    const cols = Math.max(1, Number(state.gridCols) || 1);
    const activePage = state.activePages[0];
    if (!activePage) throw new Error("Long-distance release page is unavailable");
    const firstItem = activePage[0];
    const secondItem = activePage[1];
    const nextRowItem = activePage[cols];
    if (!firstItem || !secondItem || !nextRowItem) {
      throw new Error("Long-distance release grid anchors are unavailable");
    }
    const first = readCenter(firstItem.id);
    const second = readCenter(secondItem.id);
    const nextRow = readCenter(nextRowItem.id);
    const cellWidth = second.x - first.x;
    const cellHeight = nextRow.y - first.y;
    const targetIndex = Math.min(activePage.length - 2, cols * 4 + 2);
    const targetCol = targetIndex % cols;
    const targetRow = Math.floor(targetIndex / cols);
    const target = {
      x: first.x - cellWidth / 2 + (targetCol + 0.08) * cellWidth,
      y: first.y + targetRow * cellHeight,
    };
    const pointerEvent = (
      type: "pointermove" | "pointerup",
      buttons: number,
    ) => new PointerEvent(type, {
      bubbles: true,
      button: 0,
      buttons,
      cancelable: true,
      clientX: target.x,
      clientY: target.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    });
    type DragNode = (typeof groupDragLayer.nodes)[number];
    type LiveNode = NonNullable<ReturnType<typeof layer.findIconNodeByItemId>>;
    const isDrawable = (
      node: DragNode | LiveNode | null,
      includeGhostState = false,
    ): boolean => Boolean(
      node &&
      !node.destroyed &&
      node.visible === true &&
      node.renderable !== false &&
      Number(node.alpha) > 0.001 &&
      (includeGhostState || node.state?.ghosted !== true)
    );
    const violations: GroupReleaseDiagnostic[] = [];
    let settledFrames = 0;
    let frames = 0;

    window.dispatchEvent(pointerEvent("pointermove", 1));
    window.dispatchEvent(pointerEvent("pointerup", 0));

    while (frames < 240 && settledFrames < 12) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      frames += 1;
      const group = state.groupDragState;
      const entry = group?.entries?.find((candidate) => candidate.item?.id === iconId);
      const actor = (entry?.continuityKey
        ? groupDragLayer.activeNodesByContinuityKey.get(entry.continuityKey)
        : null) || groupDragLayer.nodes.find((node) => node?.item?.id === iconId) || null;
      const liveNode = layer.findIconNodeByItemId(iconId);
      const actorDrawable = isDrawable(actor, true);
      const liveDrawable = isDrawable(liveNode);
      if (Number(actorDrawable) + Number(liveDrawable) !== 1) {
        violations.push({
          actorDrawable,
          frame: frames,
          groupPhase: group?.phase || null,
          liveDrawable,
          liveGhosted: liveNode?.state?.ghosted === true,
        });
      }
      settledFrames = group ? 0 : settledFrames + 1;
    }
    if (settledFrames < 12) throw new Error("long-distance desktop release did not settle");

    const sourceNode = layer.findIconNodeByItemId(iconId);
    const neighborNode = layer.findIconNodeByItemId(neighborId);
    const planEntry = layer.lastDesktopRenderPlan?.entries?.find((entry) => entry.item?.id === iconId);
    const finalPage = state.activePages[0];
    if (!finalPage) throw new Error("Long-distance release final page is unavailable");
    return {
      finalIndex: finalPage.findIndex((item) => item.id === iconId),
      finalTargetDelta: Math.hypot(
        Number(sourceNode?.position?.x) - Number(planEntry?.layoutTarget?.x),
        Number(sourceNode?.position?.y) - Number(planEntry?.layoutTarget?.y)
      ),
      overlapDistance: Math.hypot(
        Number(sourceNode?.position?.x) - Number(neighborNode?.position?.x),
        Number(sourceNode?.position?.y) - Number(neighborNode?.position?.y)
      ),
      targetIndex,
      violations,
    };
  }, { iconId, neighborId, pointerId });

  expect(result.finalIndex).toBe(result.targetIndex);
  expect(result.finalTargetDelta).toBeLessThanOrEqual(0.5);
  expect(result.overlapDistance).toBeGreaterThan(20);
  expect(result.violations).toEqual([]);
});

test("a first-cell app target wins over the overlapping desktop page-turn zone", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const ids = await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const pageItems = state.activePages[1];
    if (!pageItems) throw new Error("The second fixture page is unavailable");
    const apps = pageItems.filter((item) => item.type === "app").slice(0, 2);
    if (apps.length !== 2) throw new Error("The second fixture page needs two app targets");
    const targetApp = apps[0];
    const sourceApp = apps[1];
    if (!targetApp || !sourceApp) throw new Error("The second fixture app targets are unavailable");
    state.commitActivePageIndex(1);
    return {
      sourceId: sourceApp.id,
      targetId: targetApp.id,
    };
  });
  await expect.poll(async () => page.evaluate(() => (
    window.__LUMERIA_GROUP_RELEASE_TEST__.getState().activePageIndex
  ))).toBe(1);
  await page.waitForTimeout(500);
  const source = await readDesktopIconCenter(page, ids.sourceId);
  const target = await readDesktopIconCenter(page, ids.targetId);
  const pointerId = 245;
  await dispatchDragPointer(page, "pointerdown", source, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", {
    x: source.x + (target.x - source.x) * 0.12,
    y: source.y + (target.y - source.y) * 0.12,
  }, pointerId);
  await page.waitForTimeout(80);
  await dispatchDragPointer(page, "pointermove", target, pointerId);

  const linger = await page.evaluate(async ({ targetId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const pageIndexes: number[] = [];
    const deadline = performance.now() + 950;
    while (performance.now() < deadline) {
      pageIndexes.push(state.activePageIndex);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return {
      intentTargetId: state.groupDragState?.intent?.targetAppId || null,
      intentType: state.groupDragState?.intent?.type || null,
      pageIndexes: [...new Set(pageIndexes)],
      targetMatched: state.groupDragState?.intent?.targetAppId === targetId,
    };
  }, { targetId: ids.targetId });
  expect(linger).toEqual({
    intentTargetId: ids.targetId,
    intentType: "application",
    pageIndexes: [1],
    targetMatched: true,
  });

  await dispatchDragPointer(page, "pointerup", target, pointerId);
  await page.waitForFunction(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    return !state.groupDragState;
  }, null, { timeout: 5_000 });
  expect(await page.evaluate(({ sourceId, targetId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const folder = state.activePages.flat().find((item) => (
      item.type === "folder" &&
      item.childPages.flat().some((child) => child?.id === sourceId) &&
      item.childPages.flat().some((child) => child?.id === targetId)
    ));
    return { activePageIndex: state.activePageIndex, folderCreated: Boolean(folder) };
  }, ids)).toEqual({ activePageIndex: 1, folderCreated: true });
});

for (const viewport of [
  { height: 650, label: "960x650", width: 960 },
  { height: 1080, label: "1920x1080", width: 1920 },
]) {
  test(`a top-left anchored first-slot release stays on the current page at ${viewport.label}`, async ({ page }) => {
    test.setTimeout(30_000);
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await waitForFixture(page);
    const ids = await page.evaluate(() => {
      const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
      const secondPage = state.activePages[1];
      if (!secondPage) throw new Error("The second fixture page is unavailable");
      const apps = secondPage.filter((item) => item.type === "app");
      if (apps.length < 5) throw new Error("The second fixture page needs five apps");
      const firstApp = apps[0];
      const sourceApp = apps[4];
      if (!firstApp || !sourceApp) throw new Error("The first-slot fixture apps are unavailable");
      state.commitActivePageIndex(1);
      return { firstId: firstApp.id, sourceId: sourceApp.id };
    });
    await expect.poll(async () => page.evaluate(() => (
      window.__LUMERIA_GROUP_RELEASE_TEST__.getState().activePageIndex
    ))).toBe(1);
    await page.waitForTimeout(500);
    await enterBatchSelectionOf(page, [ids.firstId, ids.sourceId]);

    const result = await page.evaluate(async ({ firstId, sourceId }) => {
      const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
      const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));
      const readBounds = (id: string) => state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "desktop",
        id,
        pageIndex: 1,
      });
      const firstBounds = readBounds(firstId);
      const sourceBounds = readBounds(sourceId);
      const mainRect = document.querySelector("main.desktop-main")?.getBoundingClientRect();
      if (!firstBounds || !sourceBounds || !mainRect) throw new Error("First-slot drag geometry is unavailable");
      const sourcePoint = { x: sourceBounds.left + 1, y: sourceBounds.top + 1 };
      const releasePoint = { x: firstBounds.left + 1, y: firstBounds.top + 1 };
      const firstCenter = {
        x: firstBounds.left + firstBounds.width / 2,
        y: firstBounds.top + firstBounds.height / 2,
      };
      const target = document.elementFromPoint(sourcePoint.x, sourcePoint.y);
      if (!target) throw new Error("The source top-left point is outside the viewport");
      const init = {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: sourcePoint.x,
        clientY: sourcePoint.y,
        isPrimary: true,
        pointerId: 246,
        pointerType: "mouse",
        view: window,
      };
      target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
      await wait(560);
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: sourcePoint.x + 12,
        clientY: sourcePoint.y + 4,
      }));
      await wait(80);
      if (!state.groupDragState) throw new Error("The edge fixture did not activate an icon drag");
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: releasePoint.x,
        clientY: releasePoint.y,
      }));
      await wait(90);
      const group = state.groupDragState;
      const beforeRelease = {
        activePageIndex: state.activePageIndex,
        center: group?.center || null,
        intent: group?.intent || null,
        navigationBoundary: mainRect.left + 92,
        pointer: group?.pointer || null,
      };
      const pageIndexes: number[] = [state.activePageIndex];
      window.dispatchEvent(new PointerEvent("pointerup", {
        ...init,
        buttons: 0,
        clientX: releasePoint.x,
        clientY: releasePoint.y,
      }));
      const deadline = performance.now() + 5_000;
      while (state.groupDragState && performance.now() < deadline) {
        pageIndexes.push(state.activePageIndex);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      pageIndexes.push(state.activePageIndex);
      const secondPage = state.activePages[1];
      if (!secondPage) throw new Error("The second fixture page disappeared after release");
      return {
        activePageIndex: state.activePageIndex,
        beforeRelease,
        firstCenter,
        firstPageFirstId: state.activePages[0]?.[0]?.id || null,
        groupEnded: state.groupDragState == null,
        pageIndexes: [...new Set(pageIndexes)],
        secondPageFirstIds: secondPage.slice(0, 2).map((item) => item.id),
        transientNotice: state.transientNotice?.message || null,
      };
    }, ids);

    expect(result.beforeRelease).toMatchObject({
      activePageIndex: 1,
      intent: { index: 0, pageIndex: 1, type: "desktop-slot" },
    });
    if (!result.beforeRelease.center || !result.beforeRelease.pointer) {
      throw new Error("First-slot release pose is unavailable before pointerup");
    }
    expect(Math.abs(result.beforeRelease.center.x - result.firstCenter.x)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(result.beforeRelease.center.y - result.firstCenter.y)).toBeLessThanOrEqual(0.1);
    expect(result.beforeRelease.pointer.x).toBeGreaterThan(result.beforeRelease.navigationBoundary);
    expect(result).toMatchObject({
      activePageIndex: 1,
      firstPageFirstId: "app-0-safari",
      groupEnded: true,
      pageIndexes: [1],
      secondPageFirstIds: [ids.firstId, ids.sourceId],
      transientNotice: null,
    });
  });
}

test("the desktop navigation edge turns only after its full dwell", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ height: 650, width: 960 });

  const runEdgeScenario = async ({
    cancel,
    dwellMs,
    pointerId,
  }: Readonly<{ cancel: boolean; dwellMs: number; pointerId: number }>) => {
    await waitForFixture(page);
    return page.evaluate(async ({ cancel: shouldCancel, dwellMs: dwell, pointerId: id }) => {
      const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
      const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      state.commitActivePageIndex(1);
      await wait(500);
      const secondPage = state.activePages[1];
      const source = secondPage?.find((item) => item.type === "app");
      if (!source) throw new Error("The desktop edge source is unavailable");
      const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "desktop",
        id: source.id,
        pageIndex: 1,
      });
      const mainRect = document.querySelector("main.desktop-main")?.getBoundingClientRect();
      if (!bounds || !mainRect) throw new Error("Desktop edge drag geometry is unavailable");
      const sourcePoint = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
      const edgePoint = {
        x: mainRect.left + 20,
        y: sourcePoint.y,
      };
      const target = document.elementFromPoint(sourcePoint.x, sourcePoint.y);
      if (!target) throw new Error("The edge fixture source is outside the viewport");
      const beforeLayout = JSON.stringify(state.activePages);
      const init = {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: sourcePoint.x,
        clientY: sourcePoint.y,
        isPrimary: true,
        pointerId: id,
        pointerType: "mouse",
        view: window,
      };
      target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
      await wait(560);
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: sourcePoint.x + 12,
        clientY: sourcePoint.y + 4,
      }));
      await wait(80);
      if (!state.groupDragState) throw new Error("The edge fixture did not activate an icon drag");
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: edgePoint.x,
        clientY: edgePoint.y,
      }));
      const pageIndexes: number[] = [];
      const dwellDeadline = performance.now() + dwell;
      while (performance.now() < dwellDeadline) {
        pageIndexes.push(state.activePageIndex);
        await frame();
      }
      const beforeRelease = {
        activePageIndex: state.activePageIndex,
        desktopPageIndex: state.groupDragState?.desktopPageIndex ?? null,
        phase: state.groupDragState?.phase || null,
        pointerX: state.groupDragState?.pointer?.x ?? null,
      };
      window.dispatchEvent(new PointerEvent(shouldCancel ? "pointercancel" : "pointerup", {
        ...init,
        buttons: 0,
        clientX: edgePoint.x,
        clientY: edgePoint.y,
      }));
      const settleDeadline = performance.now() + 5_000;
      while (state.groupDragState && performance.now() < settleDeadline) await frame();
      pageIndexes.push(state.activePageIndex);
      return {
        beforeRelease,
        edgeBoundary: mainRect.left + 92,
        groupEnded: state.groupDragState == null,
        layoutUnchanged: JSON.stringify(state.activePages) === beforeLayout,
        pageIndexes: [...new Set(pageIndexes)],
        transientNotice: state.transientNotice?.message || null,
      };
    }, { cancel, dwellMs, pointerId });
  };

  const quickRelease = await runEdgeScenario({ cancel: false, dwellMs: 150, pointerId: 247 });
  expect(quickRelease.beforeRelease).toMatchObject({
    activePageIndex: 1,
    desktopPageIndex: 1,
    phase: "dragging",
  });
  expect(quickRelease.beforeRelease.pointerX).toBeLessThan(quickRelease.edgeBoundary);
  expect(quickRelease).toMatchObject({
    groupEnded: true,
    layoutUnchanged: true,
    pageIndexes: [1],
    transientNotice: null,
  });

  const fullDwell = await runEdgeScenario({ cancel: true, dwellMs: 1_200, pointerId: 248 });
  expect(fullDwell.beforeRelease).toMatchObject({
    activePageIndex: 0,
    desktopPageIndex: 0,
    phase: "dragging",
  });
  expect(fullDwell.beforeRelease.pointerX).toBeLessThan(fullDwell.edgeBoundary);
  expect(fullDwell).toMatchObject({
    groupEnded: true,
    layoutUnchanged: true,
    pageIndexes: [1, 0],
    transientNotice: null,
  });
});

test("an app target remains semantic after desktop edge navigation", async ({ page }) => {
  test.setTimeout(30_000);
  await page.setViewportSize({ height: 650, width: 960 });
  await waitForFixture(page);

  const result = await page.evaluate(async () => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const wait = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration));
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const readStableBounds = (id: string) => {
      const record = state.iconBoundsRegistry.getBounds("topLevel", "stableStageLayout", id);
      const stageRect = record?.meta?.stageRect;
      const stageWidth = Number(record?.meta?.stageWidth);
      const stageHeight = Number(record?.meta?.stageHeight);
      if (!record || !stageRect || !stageWidth || !stageHeight) return null;
      const scaleX = stageRect.width / stageWidth;
      const scaleY = stageRect.height / stageHeight;
      return {
        height: record.height * scaleY,
        left: stageRect.left + record.left * scaleX,
        top: stageRect.top + record.top * scaleY,
        width: record.width * scaleX,
      };
    };
    const firstPageTarget = state.activePages[0]?.find((item) => item.type === "app");
    const secondPageSource = state.activePages[1]?.find((item) => item.type === "app");
    if (!firstPageTarget || !secondPageSource) {
      throw new Error("Cross-page source or target app is unavailable");
    }
    state.commitActivePageIndex(1);
    await wait(500);
    const readBounds = (id: string, pageIndex: number) => state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id,
      pageIndex,
    });
    const sourceBounds = readBounds(secondPageSource.id, 1);
    const mainRect = document.querySelector("main.desktop-main")?.getBoundingClientRect();
    if (!sourceBounds || !mainRect) throw new Error("Cross-page target geometry is unavailable");
    const sourcePoint = {
      x: sourceBounds.left + sourceBounds.width / 2,
      y: sourceBounds.top + sourceBounds.height / 2,
    };
    const edgePoint = { x: mainRect.left + 20, y: sourcePoint.y };
    const target = document.elementFromPoint(sourcePoint.x, sourcePoint.y);
    if (!target) throw new Error("Cross-page source is outside the viewport");
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: sourcePoint.x,
      clientY: sourcePoint.y,
      isPrimary: true,
      pointerId: 249,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    await wait(560);
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: sourcePoint.x + 12,
      clientY: sourcePoint.y + 4,
    }));
    await wait(80);
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: edgePoint.x,
      clientY: edgePoint.y,
    }));
    const navigationDeadline = performance.now() + 1_500;
    while (state.activePageIndex !== 0 && performance.now() < navigationDeadline) await frame();
    await wait(120);
    const targetBounds = readStableBounds(firstPageTarget.id);
    if (!targetBounds) throw new Error("The first-page target did not render after navigation");
    const targetPoint = {
      x: targetBounds.left + targetBounds.width / 2,
      y: targetBounds.top + targetBounds.height / 2,
    };
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: targetPoint.x,
      clientY: targetPoint.y,
    }));
    await wait(90);
    const beforeCancel = {
      activePageIndex: state.activePageIndex,
      intent: state.groupDragState?.intent || null,
      targetId: firstPageTarget.id,
    };
    window.dispatchEvent(new PointerEvent("pointercancel", {
      ...init,
      buttons: 0,
      clientX: targetPoint.x,
      clientY: targetPoint.y,
    }));
    return beforeCancel;
  });

  expect(result).toMatchObject({
    activePageIndex: 0,
    intent: { type: "application" },
  });
  if (!result.intent) throw new Error("Cross-page application intent is unavailable");
  expect(result.intent.targetAppId).toBe(result.targetId);
});

test("toolbar batch folder creation uses committed layout with bounded actors and complete ownership", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const selectedIds = [
    "app-0-safari",
    "app-1-mail",
    "app-2-photos",
    "app-3-music",
    "app-4-calendar",
    "app-5-maps",
    "app-6-messages",
    "app-7-notes",
    "app-8-reminders",
    "app-9-facetime",
    "app-10-weather",
    "app-11-clock",
    "app-12-books",
    "app-13-tv",
  ];
  const followerId = "app-14-podcasts";
  await enterBatchSelectionOf(page, selectedIds);

  const release = await page.evaluate(async ({ followerId, selectedIds }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    const groupDragLayer = layer.groupDragLayer;
    const releaseController = groupDragLayer?.releaseController;
    if (!groupDragLayer || !releaseController) {
      throw new Error("Pixi desktop group release controller is unavailable");
    }
    const readTarget = (id: string): GroupReleasePoint | null => {
      const target = layer.lastDesktopRenderPlan?.entries
        ?.find((entry) => entry.item?.id === id)?.layoutTarget;
      return target ? { x: target.x, y: target.y } : null;
    };
    const beforeSelectedTargets = Object.fromEntries(
      selectedIds.map((id) => [id, readTarget(id)])
    );
    const beforeFollowerTarget = readTarget(followerId);
    state.createFolderFromBatchSelection();

    return new Promise<ToolbarFolderReleaseResult>((resolve, reject) => {
      let frames = 0;
      const sample = () => {
        frames += 1;
        const group = state.groupDragState;
        const releaseRenderReady = group?.phase === "releasing" &&
          group.runtimePlan &&
          groupDragLayer.activeKey === group.key &&
          groupDragLayer.activeNodesByContinuityKey.size === group.entries.length;
        if (releaseRenderReady) {
          const folderId = group.semanticPlan?.effects?.createdFolderId;
          const anchorId = group.intent?.anchorId;
          if (!folderId || !anchorId) {
            reject(new Error("Toolbar folder release lacks a folder or anchor id"));
            return;
          }
          const folderTarget = readTarget(folderId);
          const followerTarget = readTarget(followerId);
          if (!folderTarget || !followerTarget) {
            requestAnimationFrame(sample);
            return;
          }
          const actors = group.presentationPlan?.actors || [];
          const transferOwnership = layer.visualOwnership.snapshot()
            .filter((entry) => entry.owner?.kind === "group-transfer")
            .map((entry) => entry.key);
          const folderEntry = layer.lastDesktopRenderPlan?.entries
            ?.find((entry) => entry.item?.id === folderId);
          const folderNode = layer.findIconNodeByItemId(folderId);
          const bundleActor = actors.find((actor) => actor.role === "bundle");
          const rawSuppressedIds = folderEntry?.nodeState?.suppressedFolderPreviewChildIds;
          const suppressedValues: unknown[] = Array.isArray(rawSuppressedIds)
            ? rawSuppressedIds
            : [];
          if (!suppressedValues.every((value) => typeof value === "string")) {
            reject(new Error("Toolbar folder release exposed invalid suppressed child ids"));
            return;
          }
          const suppressedPreviewChildIds = suppressedValues.flatMap((value) => (
            typeof value === "string" ? [value] : []
          ));
          const releaseEntries: ToolbarReleaseEntrySnapshot[] = [];
          for (const entry of group.runtimePlan.entries) {
            if (entry.mode === "created-folder") {
              const slotIndex = entry.target?.slotIndex;
              if (typeof slotIndex !== "number") {
                reject(new Error(`Toolbar created-folder entry lacks a slot: ${entry.id}`));
                return;
              }
              releaseEntries.push({
                actorKey: entry.actorKey,
                id: entry.id,
                mode: "created-folder",
                slotIndex,
              });
              continue;
            }
            if (entry.mode !== "folder-center-absorb") {
              reject(new Error(`Toolbar folder release exposed an unexpected mode: ${entry.mode}`));
              return;
            }
            releaseEntries.push({
              actorKey: entry.actorKey,
              id: entry.id,
              mode: "folder-center-absorb",
              slotIndex: entry.target?.slotIndex ?? null,
            });
          }
          resolve({
            anchorId,
            actorMemberIds: actors.flatMap((actor) => actor.memberIds || []),
            actorRoles: actors.map((actor) => actor.role),
            aggregateMemberCount: bundleActor?.memberIds?.length || 0,
            badgeVisible: groupDragLayer.badge.visible,
            beforeAnchorTarget: beforeSelectedTargets[anchorId] || null,
            beforeFollowerTarget,
            folderId,
            folderNodeGhosted: folderNode?.state?.ghosted === true,
            folderShellVisible: releaseController.folderShellFrame?.visible === true,
            folderTarget,
            followerTarget,
            groupEntries: group.entries.map((entry) => entry.item?.id || null),
            nodePoolSize: groupDragLayer.nodes.length,
            ownershipKeys: transferOwnership,
            releaseEntries,
            semanticMemberIds: group.semanticPlan?.members?.map((member) => member.id) || [],
            suppressedPreviewChildIds,
          });
          return;
        }
        if (frames >= 90) {
          reject(new Error("toolbar folder release did not reach the accepted phase"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { followerId, selectedIds });

  expect(release.badgeVisible).toBe(false);
  expect(release.nodePoolSize).toBeGreaterThanOrEqual(10);
  expect(release.groupEntries).toHaveLength(10);
  expect(release.releaseEntries).toHaveLength(10);
  expect([...release.semanticMemberIds].sort()).toEqual([...selectedIds].sort());
  expect([...release.actorMemberIds].sort()).toEqual([...selectedIds].sort());
  expect(release.actorRoles.filter((role) => role === "bundle")).toHaveLength(1);
  expect(release.actorRoles.filter((role) => role === "folder-shell")).toHaveLength(1);
  expect(release.aggregateMemberCount).toBe(selectedIds.length - 9);
  expect(release.releaseEntries.filter((entry) => entry.mode === "created-folder"))
    .toHaveLength(9);
  expect(release.releaseEntries
    .filter((entry) => entry.mode === "created-folder")
    .every((entry) => entry.slotIndex >= 0 && entry.slotIndex < 9)).toBe(true);
  expect(release.releaseEntries.filter((entry) => entry.mode === "folder-center-absorb"))
    .toHaveLength(1);
  expect(release.ownershipKeys).toEqual(expect.arrayContaining([
    ...selectedIds.map((id) => `item:${id}`),
    `folderShell:${release.folderId}`,
  ]));
  expect(release.folderNodeGhosted).toBe(true);
  expect(release.folderShellVisible).toBe(true);
  expect([...release.suppressedPreviewChildIds].sort()).toEqual([...selectedIds].sort());
  expect(release.anchorId).toBe(selectedIds.at(-1));
  expect(release.folderTarget).not.toEqual(release.beforeAnchorTarget);
  expect(release.followerTarget).not.toEqual(release.beforeFollowerTarget);

  const settled = await page.evaluate(async ({ folderId, followerId }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    const groupDragLayer = layer.groupDragLayer;
    const releaseController = groupDragLayer?.releaseController;
    if (!groupDragLayer || !releaseController) {
      throw new Error("Pixi toolbar folder release controller is unavailable while settling");
    }
    const deadline = performance.now() + 5_000;
    const ownershipViolations: GroupReleaseDiagnostic[] = [];
    while (performance.now() < deadline) {
      const group = state.groupDragState;
      if (group?.phase === "releasing") {
        const folderNode = layer.findIconNodeByItemId(folderId);
        const shellFrame = releaseController.folderShellFrame;
        const shellOwned = layer.visualOwnership.hasOwner(`folderShell:${folderId}`);
        const shellVisible = shellFrame?.visible === true;
        const folderLive = folderNode?.visible === true && folderNode?.state?.ghosted !== true;
        if (Number(shellVisible) + Number(folderLive) !== 1 || shellVisible !== shellOwned) {
          ownershipViolations.push({ folderLive, kind: "folder-shell", shellOwned, shellVisible });
        }
        for (const entry of group.runtimePlan?.entries || []) {
          if (entry.mode !== "created-folder") continue;
          const entryIndex = group.entries.findIndex((candidate) => (
            candidate.actorKey === entry.actorKey || candidate.item?.id === entry.id
          ));
          const ghost = entryIndex >= 0 ? groupDragLayer.nodes[entryIndex] : null;
          const slotIndex = entry.target?.slotIndex;
          const child = typeof slotIndex === "number"
            ? folderNode?.folderChildNodes?.[slotIndex]
            : null;
          const ghostDrawable = ghost?.visible === true && ghost?.renderable !== false && Number(ghost.alpha) > 0.001;
          const childDrawable = folderLive && child?.visible === true && child?.renderable === true;
          if (Number(ghostDrawable) + Number(childDrawable) !== 1) {
            ownershipViolations.push({ childDrawable, ghostDrawable, id: entry.id, kind: "preview-slot" });
          }
        }
      }
      const followerTarget = layer.lastDesktopRenderPlan?.entries
        ?.find((entry) => entry.item?.id === followerId)?.layoutTarget;
      if (!state.groupDragState && followerTarget) {
        const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder(folderId);
        return {
          batch: state.isBatchSelectionActive,
          childCount: folder.childPages.flat().filter((child) => child != null).length,
          followerTarget: { x: followerTarget.x, y: followerTarget.y },
          openFolderId: state.openFolderId,
          ownershipViolations,
          selectedIds: [...state.batchSelectedIds],
        };
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    throw new Error("toolbar folder transfer did not settle after release ownership ended");
  }, {
    beforeFollowerTarget: release.beforeFollowerTarget,
    folderId: release.folderId,
    followerId,
  });

  expect(settled).toMatchObject({
    batch: true,
    childCount: 14,
    openFolderId: null,
    selectedIds: [],
  });
  expect(settled.ownershipViolations).toEqual([]);
  expect(settled.followerTarget).toEqual(release.followerTarget);
});

test("full current-page selection keeps complete ownership with a bounded folder release", async ({ page }) => {
  test.setTimeout(90_000);
  await waitForFixture(page);
  const selectedIds = await page.evaluate(() => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const firstPage = state.activePages[0];
    if (!firstPage) throw new Error("Full-page selection source page is unavailable");
    return firstPage
      .filter((item) => item.type === "app")
      .map((item) => item.id);
  });
  expect(selectedIds).toHaveLength(33);
  await enterBatchSelectionOf(page, selectedIds);

  const result = await page.evaluate(async ({ selectedIds }) => {
    const state = window.__LUMERIA_GROUP_RELEASE_TEST__.getState();
    const layer = window.__LUMERIA_GROUP_RELEASE_TEST__.getDesktopLayer();
    const groupDragLayer = layer.groupDragLayer;
    if (!groupDragLayer) throw new Error("Pixi desktop group layer is unavailable");

    const startedAt = performance.now();
    let accepted: FullPageAcceptedRelease | null = null;
    const visibleOwnedIds = new Set<string>();
    state.createFolderFromBatchSelection();

    return new Promise<FullPageReleaseResult>((resolve, reject) => {
      const deadline = performance.now() + 10_000;
      const sample = () => {
        const group = state.groupDragState;
        const releaseRenderReady = group?.phase === "releasing" &&
          group.runtimePlan &&
          groupDragLayer.activeKey === group.key &&
          groupDragLayer.activeNodesByContinuityKey.size === group.entries.length;
        if (releaseRenderReady) {
          if (!accepted) {
            const actors = group.presentationPlan?.actors || [];
            const bundleActor = actors.find((actor) => actor.role === "bundle");
            const folderId = group.semanticPlan?.effects?.createdFolderId;
            if (!folderId) {
              reject(new Error("Full-page folder release lacks a created folder id"));
              return;
            }
            accepted = {
              actorMemberIds: actors.flatMap((actor) => actor.memberIds || []),
              actorRoles: actors.map((actor) => actor.role),
              aggregateMemberCount: bundleActor?.memberIds?.length || 0,
              folderId,
              groupIds: group.entries.map((entry) => entry.item?.id || null),
              nodePoolSize: groupDragLayer.nodes.length,
              ownershipKeys: layer.visualOwnership.snapshot()
                .filter((entry) => entry.owner?.kind === "group-transfer")
                .map((entry) => entry.key),
              releaseIds: group.runtimePlan.entries.map((entry) => entry.id),
              releaseModes: group.runtimePlan.entries.map((entry) => entry.mode),
              semanticMemberIds: group.semanticPlan?.members?.map((member) => member.id) || [],
            };
          }
          for (const id of selectedIds) {
            const node = layer.findIconNodeByItemId(id);
            if (node?.visible) visibleOwnedIds.add(id);
          }
        }
        if (accepted && !group) {
          const folder = window.__LUMERIA_GROUP_RELEASE_TEST__.getFolder(accepted.folderId);
          resolve({
            ...accepted,
            batch: state.isBatchSelectionActive,
            childCount: folder.childPages.flat().filter((child) => child != null).length,
            durationMs: performance.now() - startedAt,
            openFolderId: state.openFolderId,
            selectedIds: [...state.batchSelectedIds],
            visibleOwnedIds: [...visibleOwnedIds],
          });
          return;
        }
        if (performance.now() >= deadline) {
          reject(new Error("full-page folder release did not settle within ten seconds"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { selectedIds });

  expect(result.groupIds).toHaveLength(10);
  expect(result.releaseIds).toHaveLength(10);
  expect([...result.semanticMemberIds].sort()).toEqual([...selectedIds].sort());
  expect([...result.actorMemberIds].sort()).toEqual([...selectedIds].sort());
  expect(result.actorRoles.filter((role) => role === "bundle")).toHaveLength(1);
  expect(result.actorRoles.filter((role) => role === "folder-shell")).toHaveLength(1);
  expect(result.aggregateMemberCount).toBe(selectedIds.length - 9);
  expect(result.nodePoolSize).toBeGreaterThanOrEqual(10);
  expect(result.releaseModes.filter((mode) => mode === "created-folder")).toHaveLength(9);
  expect(result.releaseModes.filter((mode) => mode === "folder-center-absorb")).toHaveLength(1);
  expect(result.ownershipKeys).toEqual(expect.arrayContaining([
    ...selectedIds.map((id) => `item:${id}`),
    `folderShell:${result.folderId}`,
  ]));
  expect(result.visibleOwnedIds).toEqual([]);
  expect(result).toMatchObject({
    batch: true,
    childCount: selectedIds.length,
    openFolderId: null,
    selectedIds: [],
  });
  expect(result.durationMs).toBeLessThan(10_000);
});
