import type { Page } from "@playwright/test";
import type {} from "../../src/testing/launchpadE2eProbe.js";
import { expect, test } from "./fixtures/launchpadMouseTest.js";

test.use({ locale: "zh-CN" });

const SOURCE_APP_ID = "app-12-books";
const TARGET_APP_ID = "app-4-calendar";

type Point = Readonly<{ x: number; y: number }>;

interface LayoutItem {
  readonly childPages?: LayoutPages;
  readonly id: string | null;
  readonly type: string | null;
}

type LayoutPages = readonly (readonly LayoutItem[])[];

interface DisplaySnapshot {
  readonly alpha: number;
  readonly visible: boolean;
}

interface FolderNodeSnapshot {
  readonly display?: DisplaySnapshot | null;
  readonly id: string | null;
  readonly sourceGhostedByOwnership?: boolean;
  readonly state?: Readonly<{ ghosted?: boolean }> | null;
}

interface FolderHandoffNodeSnapshot {
  readonly display?: DisplaySnapshot | null;
  readonly folderId: string | null;
}

interface GeometryRectSnapshot {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface FolderOverlaySnapshot {
  readonly closingFolderId?: string | null;
  readonly currentFolderId?: string | null;
  readonly debug?: Readonly<{
    openingGeometry?: Readonly<{
      snapshot?: Readonly<{
        panelRect?: GeometryRectSnapshot | null;
        stageRect?: GeometryRectSnapshot | null;
      }> | null;
    }> | null;
  }> | null;
}

interface RollbackLayerSnapshot {
  readonly active?: boolean;
  readonly folder?: Readonly<{ alpha?: number | null }> | null;
  readonly handoffVelocity?: number | null;
  readonly progress?: number | null;
  readonly target?: Readonly<{ labelAlpha?: number | null }> | null;
}

interface ProvisionalFolderVisualSnapshot {
  readonly folderHandoffNodes?: readonly FolderHandoffNodeSnapshot[];
  readonly folderNodes?: readonly FolderNodeSnapshot[];
  readonly overlay?: FolderOverlaySnapshot | null;
  readonly provisionalFolderRollback?: Readonly<{
    layer?: RollbackLayerSnapshot | null;
    presentation?: Readonly<{ folderId?: string | null }> | null;
  }> | null;
}

interface ProvisionalFolderSnapshot {
  readonly drag: Readonly<{ phase: string | null }> | null;
  readonly folder: Readonly<{
    closing: boolean;
    layerActive: boolean;
    openFolderId: string | null;
    renderedFolderId: string | null;
  }>;
  readonly hover: Readonly<{
    phase: string | null;
    targetId: string | null;
    targetType: string | null;
  }> | null;
  readonly layout: LayoutPages;
  readonly renderedLayout: LayoutPages;
  readonly rollback: Readonly<{
    folderId: string | null;
    handoffVelocity: number;
    phase: string | null;
    targetAppId: string | null;
  }> | null;
  readonly visual: Readonly<{
    folderCreateTargets?: readonly Readonly<{
      active?: boolean;
      backdropAlpha?: number;
      backdropVisible?: boolean;
      id: string;
    }>[];
    folderVisual?: ProvisionalFolderVisualSnapshot | null;
  }> | null;
}

interface ProvisionalFolderProbe {
  getIconBounds(id: string): Readonly<{
    height: number;
    left: number;
    top: number;
    width: number;
  }>;
  snapshot(): ProvisionalFolderSnapshot;
  readonly version: 1;
}

interface ProvisionalFolderTestBridge {
  getProbe(): ProvisionalFolderProbe;
}

interface PointerTraceEvent {
  readonly buttons: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly isTrusted: boolean;
  readonly pointerId: number;
  readonly target: string | null;
  readonly type: string;
}

interface PointerTrace {
  dispose(): void;
  readonly events: PointerTraceEvent[];
}

interface CancellationSample {
  readonly actorVisible: boolean;
  readonly afterCancelMove: boolean;
  readonly folderActive: boolean;
  readonly folderAlpha: number | null;
  readonly folderClosing: boolean;
  readonly folderTitleOpacity: number | null;
  readonly handoffVelocity: number | null;
  readonly inlineFolderTitleOpacity: number | null;
  readonly layoutSignature: string;
  readonly liveDesktopFolderCount: number;
  readonly progress: number | null;
  readonly rollbackLayerActive: boolean;
  readonly rollbackPhase: string | null;
  readonly targetLabelAlpha: number | null;
  readonly time: number;
}

interface CancellationTrace {
  active: boolean;
  cancelMoveTime: number | null;
  onCancelMove: (() => void) | null;
  raf: number | null;
  readonly samples: CancellationSample[];
}

declare global {
  interface Window {
    __LUMERIA_CANCELLATION_TRACE__?: CancellationTrace;
    __LUMERIA_POINTER_TRACE__?: PointerTrace;
    __LUMERIA_PROVISIONAL_FOLDER_TEST__: ProvisionalFolderTestBridge;
  }
}

function requireArrayEntry<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Missing ${label} at index ${index}`);
  return item;
}

function isFiniteNumber(value: number | null): value is number {
  return Number.isFinite(value);
}

async function installProvisionalFolderTestBridge(page: Page): Promise<void> {
  await page.evaluate(() => {
    const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => (
      typeof value === "object" && value !== null && !Array.isArray(value)
    );
    const isNullableString = (value: unknown): value is string | null => (
      value === null || typeof value === "string"
    );
    const isOptionalBoolean = (value: unknown): value is boolean | undefined => (
      value === undefined || typeof value === "boolean"
    );
    const isOptionalNullableNumber = (value: unknown): value is number | null | undefined => (
      value === undefined || value === null || typeof value === "number"
    );
    const isOptionalNullableString = (value: unknown): value is string | null | undefined => (
      value === undefined || isNullableString(value)
    );
    const isDisplaySnapshot = (value: unknown): value is DisplaySnapshot => (
      isRecord(value) && typeof value.alpha === "number" && typeof value.visible === "boolean"
    );
    const isOptionalDisplaySnapshot = (
      value: unknown,
    ): value is DisplaySnapshot | null | undefined => (
      value === undefined || value === null || isDisplaySnapshot(value)
    );
    const isGeometryRectSnapshot = (value: unknown): value is GeometryRectSnapshot => (
      isRecord(value) &&
      typeof value.height === "number" &&
      typeof value.left === "number" &&
      typeof value.top === "number" &&
      typeof value.width === "number"
    );
    function isLayoutPages(value: unknown): value is LayoutPages {
      return Array.isArray(value) && value.every((page) => (
        Array.isArray(page) && page.every((item) => (
          isRecord(item) &&
          isNullableString(item.id) &&
          isNullableString(item.type) &&
          (item.childPages === undefined || isLayoutPages(item.childPages))
        ))
      ));
    }
    const isFolderNodeSnapshot = (value: unknown): value is FolderNodeSnapshot => (
      isRecord(value) &&
      isNullableString(value.id) &&
      isOptionalDisplaySnapshot(value.display) &&
      isOptionalBoolean(value.sourceGhostedByOwnership) &&
      (value.state === undefined || value.state === null || (
        isRecord(value.state) && isOptionalBoolean(value.state.ghosted)
      ))
    );
    const isFolderHandoffNodeSnapshot = (
      value: unknown,
    ): value is FolderHandoffNodeSnapshot => (
      isRecord(value) &&
      isNullableString(value.folderId) &&
      isOptionalDisplaySnapshot(value.display)
    );
    const isFolderOverlaySnapshot = (value: unknown): value is FolderOverlaySnapshot => {
      if (!isRecord(value) ||
        !isOptionalNullableString(value.closingFolderId) ||
        !isOptionalNullableString(value.currentFolderId)) return false;
      if (value.debug === undefined || value.debug === null) return true;
      if (!isRecord(value.debug)) return false;
      const openingGeometry = value.debug.openingGeometry;
      if (openingGeometry === undefined || openingGeometry === null) return true;
      if (!isRecord(openingGeometry)) return false;
      const snapshot = openingGeometry.snapshot;
      if (snapshot === undefined || snapshot === null) return true;
      return isRecord(snapshot) &&
        (snapshot.panelRect === undefined || snapshot.panelRect === null ||
          isGeometryRectSnapshot(snapshot.panelRect)) &&
        (snapshot.stageRect === undefined || snapshot.stageRect === null ||
          isGeometryRectSnapshot(snapshot.stageRect));
    };
    const isRollbackLayerSnapshot = (value: unknown): value is RollbackLayerSnapshot => (
      isRecord(value) &&
      isOptionalBoolean(value.active) &&
      isOptionalNullableNumber(value.handoffVelocity) &&
      isOptionalNullableNumber(value.progress) &&
      (value.folder === undefined || value.folder === null || (
        isRecord(value.folder) && isOptionalNullableNumber(value.folder.alpha)
      )) &&
      (value.target === undefined || value.target === null || (
        isRecord(value.target) && isOptionalNullableNumber(value.target.labelAlpha)
      ))
    );
    const isFolderVisualSnapshot = (
      value: unknown,
    ): value is ProvisionalFolderVisualSnapshot => {
      if (!isRecord(value)) return false;
      if (value.folderNodes !== undefined && (!Array.isArray(value.folderNodes) ||
        !value.folderNodes.every(isFolderNodeSnapshot))) return false;
      if (value.folderHandoffNodes !== undefined &&
        (!Array.isArray(value.folderHandoffNodes) ||
          !value.folderHandoffNodes.every(isFolderHandoffNodeSnapshot))) return false;
      if (value.overlay !== undefined && value.overlay !== null &&
        !isFolderOverlaySnapshot(value.overlay)) return false;
      const rollback = value.provisionalFolderRollback;
      if (rollback === undefined || rollback === null) return true;
      if (!isRecord(rollback)) return false;
      if (rollback.layer !== undefined && rollback.layer !== null &&
        !isRollbackLayerSnapshot(rollback.layer)) return false;
      return rollback.presentation === undefined || rollback.presentation === null || (
        isRecord(rollback.presentation) &&
        isOptionalNullableString(rollback.presentation.folderId)
      );
    };
    const isVisualSnapshot = (
      value: unknown,
    ): value is ProvisionalFolderSnapshot["visual"] => {
      if (value === null) return true;
      if (!isRecord(value)) return false;
      if (value.folderCreateTargets !== undefined && (
        !Array.isArray(value.folderCreateTargets) ||
        !value.folderCreateTargets.every((entry) => (
          isRecord(entry) &&
          typeof entry.id === "string" &&
          isOptionalBoolean(entry.active) &&
          isOptionalBoolean(entry.backdropVisible) &&
          isOptionalNullableNumber(entry.backdropAlpha)
        ))
      )) return false;
      return value.folderVisual === undefined || value.folderVisual === null ||
        isFolderVisualSnapshot(value.folderVisual);
    };
    const isProvisionalFolderSnapshot = (
      value: unknown,
    ): value is ProvisionalFolderSnapshot => {
      if (!isRecord(value) ||
        !isLayoutPages(value.layout) ||
        !isLayoutPages(value.renderedLayout) ||
        !isVisualSnapshot(value.visual)) return false;
      const dragValid = value.drag === null || (
        isRecord(value.drag) && isNullableString(value.drag.phase)
      );
      const hoverValid = value.hover === null || (
        isRecord(value.hover) &&
        isNullableString(value.hover.phase) &&
        isNullableString(value.hover.targetId) &&
        isNullableString(value.hover.targetType)
      );
      const folderValid = isRecord(value.folder) &&
        typeof value.folder.closing === "boolean" &&
        typeof value.folder.layerActive === "boolean" &&
        isNullableString(value.folder.openFolderId) &&
        isNullableString(value.folder.renderedFolderId);
      const rollbackValid = value.rollback === null || (
        isRecord(value.rollback) &&
        isNullableString(value.rollback.folderId) &&
        typeof value.rollback.handoffVelocity === "number" &&
        isNullableString(value.rollback.phase) &&
        isNullableString(value.rollback.targetAppId)
      );
      return dragValid && hoverValid && folderValid && rollbackValid;
    };
    const getProbe = (): ProvisionalFolderProbe => {
      const probe = window.__LUMERIA_E2E__;
      if (!probe || probe.version !== 1) {
        throw new Error("Launchpad E2E probe is unavailable");
      }
      return {
        getIconBounds: (id: string) => probe.getIconBounds(id),
        snapshot: () => {
          const snapshot = probe.snapshot();
          if (!isProvisionalFolderSnapshot(snapshot)) {
            throw new Error("Launchpad E2E probe returned an invalid provisional-folder snapshot");
          }
          return snapshot;
        },
        version: probe.version,
      };
    };
    window.__LUMERIA_PROVISIONAL_FOLDER_TEST__ = { getProbe };
  });
}

async function waitForFixture(page: Page): Promise<void> {
  const fixturePath = `/?fixture=multi-select&trusted-mouse=${Date.now()}`;
  if (process.env.LUMERIA_WEBVIEW_CDP_ENDPOINT) {
    const baseUrl = process.env.LUMERIA_WEBVIEW_BASE_URL || page.url();
    if (!/^https?:\/\//.test(baseUrl)) {
      throw new Error(`WebView2 page has no HTTP fixture origin: ${baseUrl}`);
    }
    await page.goto(new URL(fixturePath, baseUrl).href);
  } else {
    await page.goto(fixturePath);
  }
  await expect.poll(async () => page.evaluate(() => {
    const root = document.querySelector('[data-launchpad-fixture="multi-select"]');
    return Boolean(root && window.__LUMERIA_E2E__?.version === 1);
  }), { timeout: 10_000 }).toBe(true);
  await installProvisionalFolderTestBridge(page);
}

async function readIconCenter(page: Page, id: string): Promise<Point> {
  await expect.poll(async () => page.evaluate((iconId: string) => {
    try {
      window.__LUMERIA_PROVISIONAL_FOLDER_TEST__.getProbe().getIconBounds(iconId);
      return true;
    } catch {
      return false;
    }
  }, id)).toBe(true);
  return page.evaluate((iconId: string) => {
    const bounds = window.__LUMERIA_PROVISIONAL_FOLDER_TEST__.getProbe().getIconBounds(iconId);
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  }, id);
}

async function prepareTrustedSource(page: Page): Promise<Point> {
  await waitForFixture(page);
  return readIconCenter(page, SOURCE_APP_ID);
}

async function prepareAppFolderScenario(page: Page): Promise<Readonly<{ source: Point; target: Point }>> {
  await waitForFixture(page);
  const [source, target] = await Promise.all([
    readIconCenter(page, SOURCE_APP_ID),
    readIconCenter(page, TARGET_APP_ID),
  ]);
  return { source, target };
}

async function startPointerTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const previous = window.__LUMERIA_POINTER_TRACE__;
    previous?.dispose?.();
    const events: PointerTraceEvent[] = [];
    const types = [
      "pointerdown",
      "gotpointercapture",
      "pointermove",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ] as const;
    const listener = (event: PointerEvent) => {
      const host = document.querySelector(".pixi-desktop-host-root-stage");
      if (!(event.target instanceof Node) || !host?.contains(event.target)) return;
      events.push({
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
        isTrusted: event.isTrusted,
        pointerId: event.pointerId,
        target: event.target instanceof Element ? event.target.tagName : null,
        type: event.type,
      });
    };
    for (const type of types) document.addEventListener(type, listener, true);
    window.__LUMERIA_POINTER_TRACE__ = {
      dispose() {
        for (const type of types) document.removeEventListener(type, listener, true);
      },
      events,
    };
  });
}

async function stopPointerTrace(page: Page): Promise<PointerTraceEvent[]> {
  return page.evaluate(() => {
    const trace = window.__LUMERIA_POINTER_TRACE__;
    if (!trace) throw new Error("Trusted pointer trace was not started");
    trace.dispose();
    const events = trace.events.map((event) => ({ ...event }));
    delete window.__LUMERIA_POINTER_TRACE__;
    return events;
  });
}

async function readProbeSnapshot(page: Page): Promise<ProvisionalFolderSnapshot> {
  return page.evaluate(() => (
    window.__LUMERIA_PROVISIONAL_FOLDER_TEST__.getProbe().snapshot()
  ));
}

async function beginTrustedIconDrag(page: Page, source: Point): Promise<void> {
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.waitForTimeout(560);
  await page.mouse.move(source.x + 18, source.y, { steps: 2 });
  await expect.poll(async () => (await readProbeSnapshot(page)).drag?.phase || null).toBe("dragging");
}

async function enterTrustedAppTarget(
  page: Page,
  source: Point,
  target: Point,
  targetId: string,
): Promise<void> {
  await beginTrustedIconDrag(page, source);
  await page.mouse.move(target.x, target.y);
  await expect.poll(async () => (await readProbeSnapshot(page)).hover?.targetId || null).toBe(targetId);
}

async function waitForHoverPhase(page: Page, phase: string): Promise<void> {
  await page.waitForFunction((expectedPhase: string) => (
    window.__LUMERIA_PROVISIONAL_FOLDER_TEST__.getProbe().snapshot().hover?.phase === expectedPhase
  ), phase, { timeout: 3_000, polling: "raf" });
}

async function finishTrustedDragAt(page: Page, point: Point): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.up();
  await expect.poll(async () => (await readProbeSnapshot(page)).drag, { timeout: 5_000 }).toBeNull();
}

function expectNoFolderMutation(
  snapshot: ProvisionalFolderSnapshot,
  layoutBefore: LayoutPages,
): void {
  expect(snapshot.folder).toMatchObject({
    layerActive: false,
    openFolderId: null,
    renderedFolderId: null,
  });
  expect(snapshot.layout).toEqual(layoutBefore);
  expect(snapshot.rollback).toBeNull();
}

function collectLayoutIds(pages: LayoutPages): (string | null)[] {
  const ids: (string | null)[] = [];
  for (const item of pages.flat()) {
    ids.push(item.id);
    if (item.type === "folder") ids.push(...collectLayoutIds(item.childPages || []));
  }
  return ids;
}

function findLayoutItem(pages: LayoutPages, id: string | null): LayoutItem | null {
  return pages.flat().find((item) => item.id === id) || null;
}

function hasVisibleFolderCancellationActor(
  snapshot: ProvisionalFolderSnapshot,
  expectedFolderId: string | null = null,
): boolean {
  const folderVisual = snapshot.visual?.folderVisual;
  const overlay = folderVisual?.overlay;
  const rollbackLayer = folderVisual?.provisionalFolderRollback?.layer;
  const rollbackPresentation = folderVisual?.provisionalFolderRollback?.presentation;
  const matchesFolder = (folderId: string | null | undefined): boolean => Boolean(
    folderId && (!expectedFolderId || folderId === expectedFolderId)
  );
  return Boolean(
    matchesFolder(overlay?.currentFolderId) ||
    matchesFolder(overlay?.closingFolderId) ||
    (rollbackLayer?.active && matchesFolder(
      rollbackPresentation?.folderId || snapshot.rollback?.folderId
    )) ||
    folderVisual?.folderNodes?.some((entry) => (
      matchesFolder(entry.id) && entry.display?.visible && entry.display?.alpha > 0.001
    )) ||
    folderVisual?.folderHandoffNodes?.some((entry) => (
      matchesFolder(entry.folderId) && entry.display?.visible && entry.display?.alpha > 0.001
    ))
  );
}

function countLiveDesktopFolderActors(
  snapshot: ProvisionalFolderSnapshot,
  expectedFolderId: string,
): number {
  return (snapshot.visual?.folderVisual?.folderNodes || []).filter((entry) => (
    entry.id === expectedFolderId &&
    entry.display?.visible &&
    entry.display?.alpha > 0.001 &&
    entry.state?.ghosted !== true &&
    entry.sourceGhostedByOwnership !== true
  )).length;
}

async function waitForFolderCancellationToSettle(
  page: Page,
  layoutBefore: LayoutPages,
  expectedFolderId: string | null = null,
): Promise<ProvisionalFolderSnapshot> {
  try {
    await expect.poll(async () => {
      const snapshot = await readProbeSnapshot(page);
      return snapshot.folder.layerActive || snapshot.folder.renderedFolderId || snapshot.rollback
        ? "active"
        : "settled";
    }, { timeout: 6_000 }).toBe("settled");
  } catch (error) {
    const snapshot = await readProbeSnapshot(page);
    throw new Error(`Folder cancellation did not settle: ${JSON.stringify({
      drag: snapshot.drag,
      folder: snapshot.folder,
      hover: snapshot.hover,
      rollback: snapshot.rollback,
    })}`, { cause: error });
  }
  const settled = await readProbeSnapshot(page);
  expectNoFolderMutation(settled, layoutBefore);
  if (expectedFolderId) {
    expect(hasVisibleFolderCancellationActor(settled, expectedFolderId)).toBe(false);
    expect(countLiveDesktopFolderActors(settled, expectedFolderId)).toBe(0);
  }
  return settled;
}

async function waitForProvisionalFolder(page: Page): Promise<ProvisionalFolderSnapshot> {
  try {
    await page.waitForFunction(() => {
      const snapshot = window.__LUMERIA_PROVISIONAL_FOLDER_TEST__.getProbe().snapshot();
      const folderId = snapshot.folder.openFolderId;
      const authoritativeIds = snapshot.layout.flat().map((item) => item.id);
      const renderedIds = snapshot.renderedLayout.flat().map((item) => item.id);
      return Boolean(
        folderId &&
        snapshot.folder.renderedFolderId === folderId &&
        !authoritativeIds.includes(folderId) &&
        renderedIds.includes(folderId)
      );
    }, undefined, { timeout: 6_000, polling: "raf" });
  } catch (error) {
    const snapshot = await readProbeSnapshot(page);
    throw new Error(`Provisional folder did not open: ${JSON.stringify({
      drag: snapshot.drag,
      folder: snapshot.folder,
      hover: snapshot.hover,
    })}`, { cause: error });
  }
  return readProbeSnapshot(page);
}

async function readOutsideOpenFolderPoint(
  page: Page,
  snapshot: ProvisionalFolderSnapshot,
): Promise<Point> {
  const geometry = snapshot.visual?.folderVisual?.overlay?.debug?.openingGeometry?.snapshot;
  const panelRect = geometry?.panelRect;
  const stageRect = geometry?.stageRect;
  if (!panelRect || !stageRect) throw new Error("Open folder panel geometry is unavailable");
  return page.evaluate(({ panelRect: panel, stageRect: stage }) => {
    const panelLeft = stage.left + panel.left;
    const panelRight = panelLeft + panel.width;
    const leftCandidate = panelLeft - 48;
    const rightCandidate = panelRight + 48;
    const x = leftCandidate >= 12 ? leftCandidate : rightCandidate;
    return {
      x: Math.min(window.innerWidth - 12, Math.max(12, x)),
      y: Math.min(
        window.innerHeight - 12,
        Math.max(12, stage.top + panel.top + panel.height / 2),
      ),
    };
  }, { panelRect, stageRect });
}

async function startCancellationFrameTrace(page: Page, folderId: string): Promise<void> {
  await page.evaluate((expectedFolderId: string) => {
    const previous = window.__LUMERIA_CANCELLATION_TRACE__;
    if (previous?.raf) cancelAnimationFrame(previous.raf);
    if (previous?.onCancelMove) {
      window.removeEventListener("pointermove", previous.onCancelMove, true);
    }
    const trace: CancellationTrace = {
      active: true,
      cancelMoveTime: null,
      onCancelMove: null,
      raf: null,
      samples: [],
    };
    trace.onCancelMove = () => {
      if (trace.cancelMoveTime == null) trace.cancelMoveTime = performance.now();
      // Capture the visible cancellation boundary before event handlers start
      // fading. The next RAF may already be several animation steps later.
      sample(false);
    };
    window.addEventListener("pointermove", trace.onCancelMove, { once: true, capture: true });
    const sample = (scheduleNext = true) => {
      if (!trace.active) return;
      const sampleTime = performance.now();
      const snapshot = window.__LUMERIA_PROVISIONAL_FOLDER_TEST__.getProbe().snapshot();
      const folderVisual = snapshot.visual?.folderVisual;
      const overlay = folderVisual?.overlay;
      const layer = folderVisual?.provisionalFolderRollback?.layer;
      const rollbackPresentation = folderVisual?.provisionalFolderRollback?.presentation;
      const folderTitleInput = document.querySelector<HTMLElement>(".pixi-folder-name-input");
      const folderTitleOpacity = folderTitleInput
        ? Number.parseFloat(getComputedStyle(folderTitleInput).opacity)
        : null;
      const inlineFolderTitleOpacity = folderTitleInput
        ? Number.parseFloat(folderTitleInput.style.opacity)
        : null;
      const matchingFolderNodes = (folderVisual?.folderNodes || []).filter((entry) => (
        entry.id === expectedFolderId
      ));
      const liveDesktopFolderCount = (folderVisual?.folderNodes || []).filter((entry) => (
        entry.id === expectedFolderId &&
        entry.display?.visible &&
        entry.display?.alpha > 0.001 &&
        entry.state?.ghosted !== true &&
        entry.sourceGhostedByOwnership !== true
      )).length;
      trace.samples.push({
        actorVisible: Boolean(
          overlay?.currentFolderId === expectedFolderId ||
          overlay?.closingFolderId === expectedFolderId ||
          (layer?.active && rollbackPresentation?.folderId === expectedFolderId) ||
          matchingFolderNodes.some((entry) => (
            entry.display?.visible && entry.display?.alpha > 0.001
          )) ||
          (folderVisual?.folderHandoffNodes || []).some((entry) => (
            entry.folderId === expectedFolderId &&
            entry.display?.visible &&
            entry.display?.alpha > 0.001
          ))
        ),
        afterCancelMove: trace.cancelMoveTime != null && sampleTime >= trace.cancelMoveTime,
        folderClosing: snapshot.folder?.closing === true,
        folderActive: snapshot.folder?.layerActive === true,
        folderAlpha: layer?.folder?.alpha ?? null,
        folderTitleOpacity: Number.isFinite(folderTitleOpacity) ? folderTitleOpacity : null,
        handoffVelocity: layer?.handoffVelocity ?? snapshot.rollback?.handoffVelocity ?? null,
        inlineFolderTitleOpacity: Number.isFinite(inlineFolderTitleOpacity)
          ? inlineFolderTitleOpacity
          : null,
        layoutSignature: JSON.stringify(snapshot.layout),
        liveDesktopFolderCount,
        progress: layer?.progress ?? null,
        rollbackLayerActive: layer?.active === true,
        rollbackPhase: snapshot.rollback?.phase || null,
        targetLabelAlpha: layer?.target?.labelAlpha ?? null,
        time: sampleTime,
      });
      if (scheduleNext) trace.raf = requestAnimationFrame(() => sample());
    };
    window.__LUMERIA_CANCELLATION_TRACE__ = trace;
    sample();
  }, folderId);
}

async function stopCancellationFrameTrace(page: Page): Promise<CancellationSample[]> {
  return page.evaluate(() => {
    const trace = window.__LUMERIA_CANCELLATION_TRACE__;
    if (!trace) throw new Error("Folder cancellation trace was not started");
    trace.active = false;
    if (trace.raf) cancelAnimationFrame(trace.raf);
    if (trace.onCancelMove) window.removeEventListener("pointermove", trace.onCancelMove, true);
    const samples = trace.samples.map((sample) => ({ ...sample }));
    delete window.__LUMERIA_CANCELLATION_TRACE__;
    return samples;
  });
}

function expectFolderTitleToFadeOut(
  samples: readonly CancellationSample[],
  options: Readonly<{ requireVisibleStart?: boolean }> = {},
): void {
  const cancellationSamples = samples.filter((sample) => sample.afterCancelMove);
  expect(cancellationSamples.length).toBeGreaterThan(1);
  const diagnosticSamples = JSON.stringify(cancellationSamples.map((sample) => ({
    closing: sample.folderClosing,
    computed: sample.folderTitleOpacity,
    inline: sample.inlineFolderTitleOpacity,
  })));
  const opacity = cancellationSamples
    .map((sample) => sample.folderTitleOpacity)
    .filter(isFiniteNumber);
  expect(opacity.length).toBeGreaterThan(1);
  const firstOpacity = requireArrayEntry(opacity, 0, "folder title opacity sample");
  if (options.requireVisibleStart === true) {
    expect(firstOpacity).toBeGreaterThan(0.5);
    expect(
      opacity.some((value) => value > 0.05 && value < firstOpacity - 0.05),
      `Visible-cancel folder title lacks an intermediate frame: ${diagnosticSamples}`
    ).toBe(true);
    expect(
      opacity.every((value, index) => index === 0 || value <=
        requireArrayEntry(opacity, index - 1, "previous folder title opacity") + 0.02),
      `Visible-cancel folder title samples: ${diagnosticSamples}`
    ).toBe(true);
  } else if (firstOpacity <= 0.05) {
    expect(
      Math.max(...opacity),
      `Immediate-cancel folder title samples: ${diagnosticSamples}`
    ).toBeLessThanOrEqual(0.15);
  } else {
    expect(
      opacity.every((value, index) => index === 0 || value <=
        requireArrayEntry(opacity, index - 1, "previous folder title opacity") + 0.02),
      `Partial-cancel folder title samples: ${diagnosticSamples}`
    ).toBe(true);
  }
  expect(requireArrayEntry(opacity, opacity.length - 1, "final folder title opacity"))
    .toBeLessThanOrEqual(0.05);
}

test("trusted mouse drag acquires and releases the canvas pointer capture @webview", async ({ appPage: page }) => {
  const source = await prepareTrustedSource(page);
  await startPointerTrace(page);

  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.waitForTimeout(560);
  await page.mouse.move(source.x + 18, source.y, { steps: 2 });
  await expect.poll(async () => page.evaluate(() => (
    window.__LUMERIA_PROVISIONAL_FOLDER_TEST__.getProbe().snapshot().drag?.phase || null
  ))).toBe("dragging");
  await page.mouse.up();

  await expect.poll(async () => page.evaluate(() => (
    window.__LUMERIA_PROVISIONAL_FOLDER_TEST__.getProbe().snapshot().drag
  ))).toBeNull();
  const trace = await stopPointerTrace(page);
  const pointerEvents = trace.filter((event) => event.type !== "pointermove");

  expect(pointerEvents.map((event) => event.type)).toEqual([
    "pointerdown",
    "gotpointercapture",
    "pointerup",
    "lostpointercapture",
  ]);
  expect(pointerEvents.every((event) => event.isTrusted)).toBe(true);
  expect(new Set(pointerEvents.map((event) => event.pointerId)).size).toBe(1);
  expect(requireArrayEntry(pointerEvents, 0, "first trusted pointer event").target).toBe("CANVAS");
});

test("a fast trusted entry keeps the app-folder target frame visibly active @webview", async ({ appPage: page }) => {
  const { source, target } = await prepareAppFolderScenario(page);
  await beginTrustedIconDrag(page, source);

  await page.mouse.move(target.x, target.y);
  await expect.poll(async () => {
    const snapshot = await readProbeSnapshot(page);
    return snapshot.hover?.targetId || null;
  }).toBe(TARGET_APP_ID);
  await expect.poll(async () => {
    const snapshot = await readProbeSnapshot(page);
    const frame = snapshot.visual?.folderCreateTargets?.find((entry) => entry.id === TARGET_APP_ID);
    return Boolean(frame?.active && frame.backdropVisible && (frame.backdropAlpha ?? 0) > 0.5);
  }).toBe(true);

  await page.mouse.move(source.x, source.y);
  await page.mouse.up();
  await expect.poll(async () => (await readProbeSnapshot(page)).drag).toBeNull();
});

test("leaving and re-entering the same app target restores its active frame", async ({ appPage: page }) => {
  const { source, target } = await prepareAppFolderScenario(page);
  await beginTrustedIconDrag(page, source);

  await page.mouse.move(target.x, target.y);
  await expect.poll(async () => {
    const snapshot = await readProbeSnapshot(page);
    return snapshot.visual?.folderCreateTargets?.find((entry) => entry.id === TARGET_APP_ID)?.active;
  }).toBe(true);
  await page.mouse.move(source.x, source.y);
  await expect.poll(async () => (await readProbeSnapshot(page)).hover).toBeNull();
  await expect.poll(async () => {
    const snapshot = await readProbeSnapshot(page);
    return Boolean(
      snapshot.visual?.folderCreateTargets?.find((entry) => entry.id === TARGET_APP_ID)?.active
    );
  }).toBe(false);

  await page.mouse.move(target.x, target.y);
  await expect.poll(async () => (await readProbeSnapshot(page)).hover?.targetId || null)
    .toBe(TARGET_APP_ID);
  await expect.poll(async () => {
    const snapshot = await readProbeSnapshot(page);
    const frame = snapshot.visual?.folderCreateTargets?.find((entry) => entry.id === TARGET_APP_ID);
    return Boolean(frame?.active && frame.backdropVisible && (frame.backdropAlpha ?? 0) > 0.5);
  }).toBe(true);

  await finishTrustedDragAt(page, source);
});

test("leaving an app target during hover cancels creation without changing layout", async ({ appPage: page }) => {
  const { source, target } = await prepareAppFolderScenario(page);
  const layoutBefore = (await readProbeSnapshot(page)).layout;
  await beginTrustedIconDrag(page, source);

  await page.mouse.move(target.x, target.y);
  await expect.poll(async () => (await readProbeSnapshot(page)).hover).toMatchObject({
    phase: "hover",
    targetId: TARGET_APP_ID,
  });
  await page.mouse.move(source.x, source.y);
  await expect.poll(async () => (await readProbeSnapshot(page)).hover).toBeNull();

  expectNoFolderMutation(await readProbeSnapshot(page), layoutBefore);
  await finishTrustedDragAt(page, source);
});

test("leaving during the app-target flash never opens a provisional folder", async ({ appPage: page }) => {
  const { source, target } = await prepareAppFolderScenario(page);
  const layoutBefore = (await readProbeSnapshot(page)).layout;
  await enterTrustedAppTarget(page, source, target, TARGET_APP_ID);
  await waitForHoverPhase(page, "flash");

  await page.mouse.move(source.x, source.y);
  await expect.poll(async () => (await readProbeSnapshot(page)).hover).toBeNull();
  expectNoFolderMutation(await readProbeSnapshot(page), layoutBefore);
  await finishTrustedDragAt(page, source);
});

test("leaving at the opening boundary never leaves an empty sunken folder state", async ({ appPage: page }) => {
  const { source, target } = await prepareAppFolderScenario(page);
  const layoutBefore = (await readProbeSnapshot(page)).layout;
  await enterTrustedAppTarget(page, source, target, TARGET_APP_ID);
  await waitForHoverPhase(page, "opening");

  await page.mouse.move(source.x, source.y);
  await expect.poll(async () => (await readProbeSnapshot(page)).hover).toBeNull();
  const boundary = await readProbeSnapshot(page);
  expect(boundary.layout).toEqual(layoutBefore);
  if (boundary.folder.layerActive || boundary.rollback) {
    expect(hasVisibleFolderCancellationActor(boundary)).toBe(true);
  }
  await waitForFolderCancellationToSettle(page, layoutBefore);
  await finishTrustedDragAt(page, source);
});

test("moving out immediately after provisional open keeps one closing actor until rollback settles @webview", async ({ appPage: page }) => {
  test.setTimeout(35_000);
  const { source, target } = await prepareAppFolderScenario(page);
  const layoutBefore = (await readProbeSnapshot(page)).layout;
  const layoutSignature = JSON.stringify(layoutBefore);
  await enterTrustedAppTarget(page, source, target, TARGET_APP_ID);
  const opened = await waitForProvisionalFolder(page);
  const provisionalFolderId = opened.folder.openFolderId;
  if (!provisionalFolderId) throw new Error("Provisional folder id is unavailable after opening");
  const outsideFolder = await readOutsideOpenFolderPoint(page, opened);
  expect(opened.layout).toEqual(layoutBefore);
  expect(opened.renderedLayout.flat().some((item) => item.id === provisionalFolderId)).toBe(true);

  await startCancellationFrameTrace(page, provisionalFolderId);
  await page.mouse.move(outsideFolder.x, outsideFolder.y);
  await waitForFolderCancellationToSettle(page, layoutBefore, provisionalFolderId);
  const samples = await stopCancellationFrameTrace(page);
  const isCancellationActive = (sample: CancellationSample): boolean => Boolean(
    sample.folderActive || sample.rollbackPhase || sample.rollbackLayerActive
  );
  const firstCancellationIndex = samples.findIndex(isCancellationActive);
  let lastCancellationIndex = -1;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (!isCancellationActive(requireArrayEntry(samples, index, "cancellation sample"))) continue;
    lastCancellationIndex = index;
    break;
  }
  expect(firstCancellationIndex).toBeGreaterThanOrEqual(0);
  expect(lastCancellationIndex).toBeGreaterThanOrEqual(firstCancellationIndex);
  const cancellationSamples = samples.slice(firstCancellationIndex, lastCancellationIndex + 1);
  const rollbackSamples = samples.filter((sample) => sample.rollbackLayerActive);

  expect(cancellationSamples.length).toBeGreaterThan(0);
  expect(cancellationSamples.every((sample) => sample.actorVisible)).toBe(true);
  expect(samples.every((sample) => sample.layoutSignature === layoutSignature)).toBe(true);
  expect(cancellationSamples.every((sample) => sample.liveDesktopFolderCount <= 1)).toBe(true);
  expectFolderTitleToFadeOut(samples);
  expect(rollbackSamples.length).toBeGreaterThan(1);
  expect(rollbackSamples.some((sample) => Number(sample.handoffVelocity) > 0.01)).toBe(true);
  const progress = rollbackSamples.map((sample) => Number(sample.progress)).filter(Number.isFinite);
  expect(progress.every((value, index) => index === 0 || value >=
    requireArrayEntry(progress, index - 1, "previous rollback progress"))).toBe(true);
  const targetLabelAlpha = rollbackSamples
    .map((sample) => sample.targetLabelAlpha)
    .filter(isFiniteNumber);
  expect(targetLabelAlpha.length).toBeGreaterThan(1);
  expect(requireArrayEntry(targetLabelAlpha, targetLabelAlpha.length - 1, "final target label alpha"))
    .toBeGreaterThan(requireArrayEntry(targetLabelAlpha, 0, "initial target label alpha"));
  expect(targetLabelAlpha.every((value, index) => (
    index === 0 || value >=
      requireArrayEntry(targetLabelAlpha, index - 1, "previous target label alpha") - 0.02
  ))).toBe(true);
  await finishTrustedDragAt(page, source);
});

test("a visible provisional folder title fades out monotonically on cancellation @webview", async ({ appPage: page }) => {
  test.setTimeout(35_000);
  const { source, target } = await prepareAppFolderScenario(page);
  const layoutBefore = (await readProbeSnapshot(page)).layout;
  const layoutSignature = JSON.stringify(layoutBefore);
  await enterTrustedAppTarget(page, source, target, TARGET_APP_ID);
  const opened = await waitForProvisionalFolder(page);
  const provisionalFolderId = opened.folder.openFolderId;
  if (!provisionalFolderId) throw new Error("Visible provisional folder id is unavailable");
  const outsideFolder = await readOutsideOpenFolderPoint(page, opened);
  await expect.poll(async () => page.evaluate(() => {
    const input = document.querySelector(".pixi-folder-name-input");
    return input ? Number.parseFloat(getComputedStyle(input).opacity) : 0;
  }), { timeout: 3_000 }).toBeGreaterThan(0.8);

  await startCancellationFrameTrace(page, provisionalFolderId);
  await page.mouse.move(outsideFolder.x, outsideFolder.y);
  await waitForFolderCancellationToSettle(page, layoutBefore, provisionalFolderId);
  const samples = await stopCancellationFrameTrace(page);
  expect(samples.every((sample) => sample.layoutSignature === layoutSignature)).toBe(true);
  expectFolderTitleToFadeOut(samples, { requireVisibleStart: true });
  await finishTrustedDragAt(page, source);
});

test("releasing over an opened provisional target commits exactly one two-app folder @webview", async ({ appPage: page }) => {
  test.setTimeout(35_000);
  const { source, target } = await prepareAppFolderScenario(page);
  const layoutBefore = (await readProbeSnapshot(page)).layout;
  await enterTrustedAppTarget(page, source, target, TARGET_APP_ID);
  const opened = await waitForProvisionalFolder(page);
  const folderId = opened.folder.openFolderId;
  if (!folderId) throw new Error("Committed provisional folder id is unavailable");

  expect(findLayoutItem(layoutBefore, folderId)).toBeNull();
  await page.mouse.up();
  await expect.poll(async () => Boolean(findLayoutItem(
    (await readProbeSnapshot(page)).layout,
    folderId,
  )), { timeout: 6_000 }).toBe(true);
  await expect.poll(async () => (await readProbeSnapshot(page)).drag, { timeout: 6_000 }).toBeNull();

  const committed = await readProbeSnapshot(page);
  const folder = findLayoutItem(committed.layout, folderId);
  const topLevelIds = committed.layout.flat().map((item) => item.id);
  const allIds = collectLayoutIds(committed.layout);
  expect(folder?.type).toBe("folder");
  if (!folder?.childPages) throw new Error(`Committed folder layout is unavailable: ${folderId}`);
  expect(folder.childPages.flat().map((item) => item.id).sort()).toEqual([SOURCE_APP_ID, TARGET_APP_ID].sort());
  expect(topLevelIds).not.toContain(SOURCE_APP_ID);
  expect(topLevelIds).not.toContain(TARGET_APP_ID);
  expect(allIds.filter((id) => id === folderId)).toHaveLength(1);
  expect(allIds.filter((id) => id === SOURCE_APP_ID)).toHaveLength(1);
  expect(allIds.filter((id) => id === TARGET_APP_ID)).toHaveLength(1);
  expect(committed.folder).toMatchObject({
    layerActive: true,
    openFolderId: folderId,
    renderedFolderId: folderId,
  });
  expect(committed.rollback).toBeNull();
});

test("browser-forced pointer-capture loss cancels an opened provisional folder @webview", async ({ appPage: page }) => {
  test.setTimeout(35_000);
  const { source, target } = await prepareAppFolderScenario(page);
  const layoutBefore = (await readProbeSnapshot(page)).layout;
  await startPointerTrace(page);
  await enterTrustedAppTarget(page, source, target, TARGET_APP_ID);
  const opened = await waitForProvisionalFolder(page);
  const provisionalFolderId = opened.folder.openFolderId;
  if (!provisionalFolderId) throw new Error("Captured provisional folder id is unavailable");

  await page.evaluate(() => {
    const trace = window.__LUMERIA_POINTER_TRACE__;
    const pointerId = trace?.events?.find((event) => event.type === "pointerdown")?.pointerId;
    const canvas = document.querySelector<HTMLCanvasElement>(".pixi-desktop-host-root-stage canvas");
    if (!canvas || pointerId == null || !canvas.hasPointerCapture(pointerId)) {
      throw new Error("Canvas does not own the trusted mouse pointer capture");
    }
    canvas.releasePointerCapture(pointerId);
  });
  await waitForFolderCancellationToSettle(page, layoutBefore, provisionalFolderId);
  await expect.poll(async () => (await readProbeSnapshot(page)).drag, { timeout: 6_000 }).toBeNull();
  await page.mouse.up();
  const trace = await stopPointerTrace(page);
  const lostCapture = trace.find((event) => event.type === "lostpointercapture");
  expect(lostCapture).toMatchObject({ isTrusted: true, target: "CANVAS" });
});
