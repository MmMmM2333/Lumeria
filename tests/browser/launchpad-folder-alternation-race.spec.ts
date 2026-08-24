import type { Page } from "@playwright/test";
import type {} from "../../src/testing/launchpadE2eProbe.js";
import { expect, test } from "./fixtures/launchpadMouseTest.js";

type Point = Readonly<{ x: number; y: number }>;

interface FolderIconNodeSnapshot {
  readonly alpha?: number | null;
  readonly id?: string | null;
  readonly visible?: boolean | null;
}

interface PixiDisplaySnapshot {
  readonly alpha?: number | null;
  readonly childCount?: number | null;
  readonly destroyed?: boolean | null;
  readonly height?: number | null;
  readonly itemId?: string | null;
  readonly renderable?: boolean | null;
  readonly scaleX?: number | null;
  readonly scaleY?: number | null;
  readonly visible?: boolean | null;
  readonly width?: number | null;
  readonly x?: number | null;
  readonly y?: number | null;
}

interface FolderVisualSnapshot {
  readonly detachedClosingVisuals?: readonly Readonly<{
    destroyed?: boolean;
    folderId?: string | null;
  }>[];
  readonly folderNodes?: readonly Readonly<{
    display?: Readonly<{
      alpha?: number;
      eventMode?: string | null;
      visible?: boolean;
      x?: number;
      y?: number;
    }> | null;
    id?: string | null;
  }>[];
  readonly overlay?: Readonly<{
    closingFolderId?: string | null;
    currentFolderId?: string | null;
    debug?: Readonly<{
      folderLayout?: Readonly<{
        iconNodes?: readonly FolderIconNodeSnapshot[];
      }> | null;
      closingGhosts?: readonly PixiDisplaySnapshot[];
      detachedClosingVisuals?: readonly Readonly<{
        children?: readonly PixiDisplaySnapshot[];
        container?: PixiDisplaySnapshot | null;
        destroyed?: boolean;
        folderId?: string | null;
      }>[];
      frameGhost?: Readonly<{
        display?: PixiDisplaySnapshot | null;
        folderId?: string | null;
        phase?: string | null;
        presentation?: Readonly<{
          progress?: number | null;
        }> | null;
      }> | null;
      layerDisplay?: PixiDisplaySnapshot | null;
      openingGhosts?: readonly PixiDisplaySnapshot[];
      openingGeometry?: Readonly<{
        currentGeometryMatchesSession?: boolean;
        session?: Readonly<{ folderId?: string | null }> | null;
        snapshot?: Readonly<{ folderId?: string | null }> | null;
      }> | null;
      panelDisplay?: PixiDisplaySnapshot | null;
      previewSwapGhosts?: readonly PixiDisplaySnapshot[];
    }> | null;
    openingGhostItemIds?: readonly string[];
  }> | null;
  readonly ownership?: readonly unknown[];
}

interface FolderStateSnapshot {
  readonly closing: boolean;
  readonly layerActive: boolean;
  readonly openFolderId: string | null;
  readonly renderedFolderId: string | null;
}

interface FramebufferPixelSnapshot {
  readonly available: boolean;
  readonly captureDurationMs: number | null;
  readonly hash: string | null;
  readonly reason: string | null;
  readonly rgbSum: number | null;
  readonly sample: readonly number[];
}

interface RaceSample {
  readonly folder: FolderStateSnapshot;
  readonly pixel: FramebufferPixelSnapshot;
  readonly time: number;
  readonly visual: FolderVisualSnapshot;
}

interface RaceTrace {
  active: boolean;
  originalRender: ((...args: unknown[]) => unknown) | null;
  readonly probeFailures: string[];
  renderApp: Readonly<{ render: (...args: unknown[]) => unknown }> | null;
  readonly samples: RaceSample[];
}

interface LaunchpadProbeSnapshot {
  readonly folder?: Partial<FolderStateSnapshot> | null;
  readonly layout?: readonly (readonly Readonly<{
    childPages?: readonly (readonly Readonly<{ id?: string | null }>[])[];
    id?: string | null;
    type?: string | null;
  }>[])[];
  readonly visual?: Readonly<{ folderVisual?: FolderVisualSnapshot | null }> | null;
}

declare global {
  interface Window {
    __LUMERIA_FOLDER_ALTERNATION_TRACE__?: RaceTrace;
  }
}

async function readLaunchpadProbeSnapshot(page: Page): Promise<LaunchpadProbeSnapshot> {
  return page.evaluate(() => {
    const probe = window.__LUMERIA_E2E__;
    if (!probe || probe.version !== 1) throw new Error("Launchpad E2E probe is unavailable");
    return probe.snapshot() as LaunchpadProbeSnapshot;
  });
}

async function readFolderVisual(page: Page): Promise<FolderVisualSnapshot> {
  const snapshot = await readLaunchpadProbeSnapshot(page);
  const visual = snapshot.visual?.folderVisual;
  if (!visual) throw new Error("Folder visual snapshot is unavailable");
  return visual;
}

async function readFolderState(page: Page): Promise<FolderStateSnapshot> {
  const snapshot = await readLaunchpadProbeSnapshot(page);
  const folder = snapshot.folder;
  if (!folder) throw new Error("Folder state snapshot is unavailable");
  return {
    closing: folder.closing === true,
    layerActive: folder.layerActive === true,
    openFolderId: folder.openFolderId || null,
    renderedFolderId: folder.renderedFolderId || null,
  };
}

async function waitForFixture(page: Page): Promise<void> {
  const fixturePath = `/?fixture=multi-select&folder-alternation=${Date.now()}`;
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
    const probe = window.__LUMERIA_E2E__;
    if (
      !document.querySelector('[data-launchpad-fixture="multi-select"]') ||
      !probe ||
      probe.version !== 1
    ) return false;
    const snapshot = probe.snapshot() as LaunchpadProbeSnapshot;
    return Boolean(snapshot.visual?.folderVisual);
  }), { timeout: 10_000 }).toBe(true);
}

async function startRaceTrace(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const previous = window.__LUMERIA_FOLDER_ALTERNATION_TRACE__;
    if (previous?.renderApp && previous.originalRender) {
      Reflect.set(previous.renderApp, "render", previous.originalRender);
    }
    const probe = window.__LUMERIA_E2E__;
    if (!probe || probe.version !== 1) throw new Error("Launchpad E2E probe is unavailable");
    const renderApp = probe.getRenderTarget();
    const samplerPath = "/src/rendering/pixi/folderFramebufferSampler.dev.ts";
    const samplerModule = await import(/* @vite-ignore */ samplerPath) as Readonly<{
      captureFolderFramebufferSample(options: unknown): Readonly<{
        available?: boolean;
        captureDurationMs?: number;
        reason?: string | null;
        slots?: readonly Readonly<{
          hash?: string | null;
          rgbSum?: number;
          sample?: readonly number[];
        }>[];
      }>;
    }>;
    const captureFramebuffer = samplerModule.captureFolderFramebufferSample;
    if (typeof captureFramebuffer !== "function") {
      throw new Error("Folder framebuffer sampler is unavailable");
    }
    const canvas = Reflect.get(renderApp, "canvas") as HTMLCanvasElement | null;
    const canvasBounds = canvas?.getBoundingClientRect?.();
    if (!canvasBounds?.width || !canvasBounds.height) {
      throw new Error("Pixi canvas bounds are unavailable");
    }
    const framebufferBounds = {
      height: canvasBounds.height * 0.12,
      left: canvasBounds.left + (canvasBounds.width * 0.32),
      top: canvasBounds.top + (canvasBounds.height * 0.36),
      width: canvasBounds.width * 0.16,
    };
    const originalRender = renderApp.render;
    const trace: RaceTrace = {
      active: true,
      originalRender,
      probeFailures: [],
      renderApp,
      samples: [],
    };

    const sample = (): void => {
      if (!trace.active) return;
      const snapshot = probe.snapshot() as LaunchpadProbeSnapshot;
      const visual = snapshot.visual?.folderVisual;
      const folderSnapshot = snapshot.folder;
      if (!visual || !folderSnapshot) {
        const reason = !visual ? "folder visual snapshot unavailable" : "folder state snapshot unavailable";
        if (!trace.probeFailures.includes(reason)) trace.probeFailures.push(reason);
        return;
      }
      const folder = {
        closing: folderSnapshot.closing === true,
        layerActive: folderSnapshot.layerActive === true,
        openFolderId: folderSnapshot.openFolderId || null,
        renderedFolderId: folderSnapshot.renderedFolderId || null,
      };
      const shouldCapturePixels = trace.samples.length === 0 || Boolean(
        !folder.closing &&
        !folder.layerActive &&
        folder.openFolderId == null &&
        folder.renderedFolderId == null &&
        visual.overlay?.currentFolderId == null &&
        visual.overlay?.closingFolderId == null &&
        (visual.overlay?.debug?.folderLayout?.iconNodes || []).length === 0 &&
        (visual.detachedClosingVisuals || []).length === 0 &&
        (visual.ownership || []).length === 0
      );
      const framebuffer = shouldCapturePixels
        ? captureFramebuffer({
          app: renderApp,
          slots: [{
            clientBounds: framebufferBounds,
            folderId: "alternation-race-region",
          }],
        })
        : { available: false, captureDurationMs: 0, reason: "transition-active", slots: [] };
      const slot = framebuffer.slots?.[0] || null;
      trace.samples.push({
        folder,
        pixel: {
          available: framebuffer.available === true && Boolean(slot),
          captureDurationMs: framebuffer.captureDurationMs ?? null,
          hash: slot?.hash || null,
          reason: framebuffer.reason || null,
          rgbSum: slot?.rgbSum ?? null,
          sample: Array.from(slot?.sample || []),
        },
        time: performance.now(),
        visual,
      });
    };
    renderApp.render = function tracedPixiRender(...args: unknown[]): unknown {
      const result = Reflect.apply(originalRender, this, args);
      sample();
      return result;
    };
    window.__LUMERIA_FOLDER_ALTERNATION_TRACE__ = trace;
    renderApp.render();
  });
}

async function stopRaceTrace(page: Page): Promise<readonly RaceSample[]> {
  return page.evaluate(() => {
    const trace = window.__LUMERIA_FOLDER_ALTERNATION_TRACE__;
    if (!trace) throw new Error("Folder alternation trace was not started");
    trace.active = false;
    if (trace.renderApp && trace.originalRender) {
      Reflect.set(trace.renderApp, "render", trace.originalRender);
    }
    const samples = trace.samples.map((sample) => structuredClone(sample));
    const probeFailures = [...trace.probeFailures];
    delete window.__LUMERIA_FOLDER_ALTERNATION_TRACE__;
    if (probeFailures.length) {
      throw new Error(`Folder alternation trace lost required probe data: ${probeFailures.join(", ")}`);
    }
    return samples;
  });
}

function isSettledClosed(
  state: FolderStateSnapshot,
  visual: FolderVisualSnapshot,
): boolean {
  const overlay = visual.overlay;
  const debug = overlay?.debug;
  const iconNodes = debug?.folderLayout?.iconNodes;
  if (!debug || !Array.isArray(iconNodes)) return false;
  return !state.closing &&
    !state.layerActive &&
    state.openFolderId == null &&
    state.renderedFolderId == null &&
    overlay?.currentFolderId == null &&
    overlay?.closingFolderId == null &&
    iconNodes.length === 0 &&
    (visual.detachedClosingVisuals || []).length === 0 &&
    (visual.ownership || []).length === 0;
}

async function waitForSettledClose(page: Page): Promise<void> {
  await expect.poll(async () => {
    const [state, visual] = await Promise.all([readFolderState(page), readFolderVisual(page)]);
    return isSettledClosed(state, visual);
  }, { timeout: 5_000 }).toBe(true);
}

async function readVisibleFolders(page: Page): Promise<readonly Readonly<{ id: string }>[]> {
  const visual = await readFolderVisual(page);
  return (visual.folderNodes || []).flatMap((node) => (
    node.id && node.display?.visible && (node.display.alpha ?? 0) > 0.001
      ? [{ id: node.id }]
      : []
  ));
}

async function waitForVisibleFolders(page: Page): Promise<readonly Readonly<{ id: string }>[]> {
  let folders: readonly Readonly<{ id: string }>[] = [];
  await expect.poll(async () => {
    folders = await readVisibleFolders(page);
    return folders.length;
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  return folders;
}

async function readFolderContentIds(page: Page, folderId: string): Promise<ReadonlySet<string>> {
  const snapshot = await readLaunchpadProbeSnapshot(page);
  const folder = (snapshot.layout || []).flat().find((item) => (
    item?.type === "folder" && item.id === folderId
  ));
  if (!folder) throw new Error(`Folder ${folderId} is unavailable in the E2E layout snapshot`);
  const ids = (folder.childPages || []).flatMap((childPage) => (
    (childPage || []).flatMap((item) => item?.id ? [item.id] : [])
  ));
  return new Set(ids);
}

async function closeFolder(page: Page): Promise<void> {
  await page.mouse.click(16, Math.round((page.viewportSize()?.height || 800) * 0.45));
}

async function waitForFolderFlowOpen(page: Page, folderId: string): Promise<void> {
  await expect.poll(async () => (await readFolderState(page)).openFolderId, {
    intervals: [0, 0, 1, 2, 4],
    timeout: 2_000,
  }).toBe(folderId);
}

async function waitUntilDesktopFolderIsClickable(page: Page, folderId: string): Promise<void> {
  await expect.poll(async () => {
    const visual = await readFolderVisual(page);
    const node = (visual.folderNodes || []).find((entry) => entry.id === folderId);
    return Boolean(
      node?.display?.visible &&
      (node.display.alpha ?? 0) > 0.001 &&
      node.display.eventMode === "static"
    );
  }, { timeout: 5_000, intervals: [0, 8, 16, 16, 16] }).toBe(true);
}

async function readCurrentFolderPoint(page: Page, folderId: string): Promise<Point> {
  const bounds = await page.evaluate((id) => {
    const probe = window.__LUMERIA_E2E__;
    if (!probe || probe.version !== 1) throw new Error("Launchpad E2E probe is unavailable");
    return probe.getIconBounds(id);
  }, folderId);
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

async function traceFolderAlternation(
  page: Page,
  first: Readonly<{ id: string }>,
  second: Readonly<{ id: string }>,
  timing: Readonly<{
    clickableToOpenMs: number;
    firstOpenToCloseMs: number;
    secondOpenToCloseMs: number;
  }>,
): Promise<readonly RaceSample[]> {
  let samples: readonly RaceSample[] = [];
  await startRaceTrace(page);
  try {
    const firstPoint = await readCurrentFolderPoint(page, first.id);
    await page.mouse.click(firstPoint.x, firstPoint.y);
    await waitForFolderFlowOpen(page, first.id);
    await page.waitForTimeout(timing.firstOpenToCloseMs);
    await closeFolder(page);
    await waitUntilDesktopFolderIsClickable(page, second.id);
    await page.waitForTimeout(timing.clickableToOpenMs);
    const secondPoint = await readCurrentFolderPoint(page, second.id);
    await page.mouse.click(secondPoint.x, secondPoint.y);
    await waitForFolderFlowOpen(page, second.id);
    await page.waitForTimeout(timing.secondOpenToCloseMs);
    await closeFolder(page);
    await waitForSettledClose(page);
    await page.waitForTimeout(500);
  } finally {
    samples = await stopRaceTrace(page);
  }
  return samples;
}

function visibleOverlayIconIds(visual: FolderVisualSnapshot): readonly string[] {
  return (visual.overlay?.debug?.folderLayout?.iconNodes || []).flatMap((node) => (
    node.id && node.visible !== false && (node.alpha ?? 1) > 0.001 ? [node.id] : []
  ));
}

function isDisplayVisible(display: PixiDisplaySnapshot | null | undefined): boolean {
  return Boolean(
    display &&
    display.destroyed !== true &&
    display.visible !== false &&
    display.renderable !== false &&
    (display.alpha ?? 1) > 0.001
  );
}

function hasVisibleFolderTransitionActor(visual: FolderVisualSnapshot): boolean {
  const debug = visual.overlay?.debug;
  if (!debug) return false;
  if (isDisplayVisible(debug.layerDisplay) && Boolean(
    isDisplayVisible(debug.frameGhost?.display) ||
    (debug.openingGhosts || []).some(isDisplayVisible) ||
    (debug.closingGhosts || []).some(isDisplayVisible) ||
    (debug.previewSwapGhosts || []).some(isDisplayVisible) ||
    visibleOverlayIconIds(visual).length
  )) return true;
  return (debug.detachedClosingVisuals || []).some((entry) => (
    entry.destroyed !== true &&
    isDisplayVisible(entry.container) &&
    (entry.children || []).some(isDisplayVisible)
  ));
}

function visibleItemIds(displays: readonly PixiDisplaySnapshot[] | undefined): readonly string[] {
  return (displays || []).flatMap((display) => (
    display.itemId && isDisplayVisible(display) ? [display.itemId] : []
  ));
}

function findVisualProbeFailure(visual: FolderVisualSnapshot): string | null {
  const overlay = visual.overlay;
  const debug = overlay?.debug;
  if (!overlay) return "folder overlay snapshot unavailable";
  if (!debug) return "folder overlay debug snapshot unavailable";
  if (!Array.isArray(visual.folderNodes)) return "folder node snapshot unavailable";
  if (!Array.isArray(visual.detachedClosingVisuals)) return "detached closing snapshot unavailable";
  if (!Array.isArray(visual.ownership)) return "visual ownership snapshot unavailable";
  if (!Array.isArray(debug.folderLayout?.iconNodes)) return "folder layout snapshot unavailable";
  if (!Array.isArray(debug.closingGhosts)) return "closing ghost snapshot unavailable";
  if (!Array.isArray(debug.detachedClosingVisuals)) return "detached closing debug snapshot unavailable";
  if (!Array.isArray(debug.openingGhosts)) return "opening ghost snapshot unavailable";
  if (!Array.isArray(debug.previewSwapGhosts)) return "preview swap ghost snapshot unavailable";
  if (!debug.frameGhost) return "frame ghost snapshot unavailable";
  if (!debug.layerDisplay) return "folder layer display snapshot unavailable";
  return null;
}

function comparePixelSnapshots(
  baseline: FramebufferPixelSnapshot,
  current: FramebufferPixelSnapshot,
): Readonly<{
  changedCellRatio: number;
  meanAbsoluteDelta: number;
  relativeRgbDelta: number;
  strong: boolean;
}> | null {
  if (
    !baseline.available ||
    !current.available ||
    baseline.sample.length === 0 ||
    baseline.sample.length !== current.sample.length ||
    baseline.rgbSum == null ||
    current.rgbSum == null
  ) return null;
  let absoluteDelta = 0;
  let changedCells = 0;
  for (let index = 0; index < baseline.sample.length; index += 2) {
    const lumaDelta = Math.abs((current.sample[index] ?? 0) - (baseline.sample[index] ?? 0));
    const alphaDelta = Math.abs((current.sample[index + 1] ?? 0) - (baseline.sample[index + 1] ?? 0));
    absoluteDelta += lumaDelta + alphaDelta;
    if (Math.max(lumaDelta, alphaDelta) >= 8) changedCells += 1;
  }
  const cellCount = baseline.sample.length / 2;
  const meanAbsoluteDelta = absoluteDelta / (baseline.sample.length * 255);
  const changedCellRatio = changedCells / cellCount;
  const relativeRgbDelta = Math.abs(current.rgbSum - baseline.rgbSum) / Math.max(1, baseline.rgbSum);
  return {
    changedCellRatio,
    meanAbsoluteDelta,
    relativeRgbDelta,
    strong: changedCellRatio >= 0.2 && meanAbsoluteDelta >= 0.025,
  };
}

function findDetachedVisualDiscontinuities(
  samples: readonly RaceSample[],
): readonly Readonly<Record<string, unknown>>[] {
  const minima = new Map<string, Readonly<{
    height: number | null;
    scaleX: number | null;
    scaleY: number | null;
    width: number | null;
  }>>();
  const seenFolders = new Set<string>();
  const absentFolders = new Set<string>();
  const failures: Readonly<Record<string, unknown>>[] = [];

  for (const sample of samples) {
    const visuals = (sample.visual.overlay?.debug?.detachedClosingVisuals || []).filter((visual) => (
      visual.folderId &&
      visual.destroyed !== true &&
      isDisplayVisible(visual.container) &&
      (visual.children || []).some(isDisplayVisible)
    ));
    const visibleFolderIds = new Set(visuals.flatMap((visual) => (
      visual.folderId ? [visual.folderId] : []
    )));

    for (const folderId of seenFolders) {
      if (!visibleFolderIds.has(folderId)) absentFolders.add(folderId);
    }

    for (const visual of visuals) {
      const folderId = visual.folderId;
      if (!folderId) continue;
      if (absentFolders.has(folderId)) {
        failures.push({
          folderId,
          kind: "detached-visual-revived",
          time: sample.time,
        });
        absentFolders.delete(folderId);
      }
      seenFolders.add(folderId);

      for (const [index, child] of (visual.children || []).entries()) {
        if (!isDisplayVisible(child)) continue;
        const actorId = child.itemId || `frame-${index}`;
        const key = `${folderId}:${actorId}`;
        const previous = minima.get(key);
        const current = {
          height: child.height ?? null,
          scaleX: child.scaleX ?? null,
          scaleY: child.scaleY ?? null,
          width: child.width ?? null,
        };
        if (previous) {
          const jumps = (Object.keys(current) as (keyof typeof current)[]).flatMap((property) => {
            const before = previous[property];
            const after = current[property];
            if (before == null || after == null) return [];
            const allowance = property.startsWith("scale")
              ? Math.max(0.18, Math.abs(before) * 0.5)
              : Math.max(24, Math.abs(before) * 0.5);
            return after > before + allowance ? [{ after, before, property }] : [];
          });
          if (jumps.length) {
            failures.push({
              actorId,
              folderId,
              jumps,
              kind: "detached-visual-expanded-after-handoff",
              time: sample.time,
            });
          }
        }
        minima.set(key, {
          height: previous?.height == null || current.height == null
            ? current.height
            : Math.min(previous.height, current.height),
          scaleX: previous?.scaleX == null || current.scaleX == null
            ? current.scaleX
            : Math.min(previous.scaleX, current.scaleX),
          scaleY: previous?.scaleY == null || current.scaleY == null
            ? current.scaleY
            : Math.min(previous.scaleY, current.scaleY),
          width: previous?.width == null || current.width == null
            ? current.width
            : Math.min(previous.width, current.width),
        });
      }
    }
  }
  return failures;
}

test("rapidly alternating two folders never revives or cross-wires a stale folder visual @webview", async ({
  appPage: page,
}) => {
  test.skip(
    !process.env.LUMERIA_WEBVIEW_CDP_ENDPOINT,
    "The folder alternation race requires the connected WebView2 compositor",
  );
  test.setTimeout(180_000);
  await waitForFixture(page);
  await waitForSettledClose(page);
  const folders = await waitForVisibleFolders(page);
  const firstFolder = folders[0];
  const secondFolder = folders[1];
  if (!firstFolder || !secondFolder) throw new Error("Two visible folders are required for the alternation race");
  const directions = [
    { first: firstFolder, second: secondFolder },
    { first: secondFolder, second: firstFolder },
  ] as const;

  const timings = [
    { firstOpenToCloseMs: 600, clickableToOpenMs: 0, secondOpenToCloseMs: 160 },
    { firstOpenToCloseMs: 600, clickableToOpenMs: 0, secondOpenToCloseMs: 260 },
    { firstOpenToCloseMs: 480, clickableToOpenMs: 8, secondOpenToCloseMs: 200 },
    { firstOpenToCloseMs: 400, clickableToOpenMs: 0, secondOpenToCloseMs: 120 },
    { firstOpenToCloseMs: 320, clickableToOpenMs: 16, secondOpenToCloseMs: 80 },
    { firstOpenToCloseMs: 240, clickableToOpenMs: 0, secondOpenToCloseMs: 160 },
    { firstOpenToCloseMs: 160, clickableToOpenMs: 8, secondOpenToCloseMs: 120 },
    { firstOpenToCloseMs: 96, clickableToOpenMs: 0, secondOpenToCloseMs: 64 },
    { firstOpenToCloseMs: 48, clickableToOpenMs: 0, secondOpenToCloseMs: 32 },
    { firstOpenToCloseMs: 16, clickableToOpenMs: 0, secondOpenToCloseMs: 16 },
    { firstOpenToCloseMs: 0, clickableToOpenMs: 0, secondOpenToCloseMs: 0 },
    { firstOpenToCloseMs: 600, clickableToOpenMs: 16, secondOpenToCloseMs: 320 },
  ] as const;
  const failures: Readonly<Record<string, unknown>>[] = [];

  for (const { first, second } of directions) {
    const secondFolderIconIds = await readFolderContentIds(page, second.id);
    expect(secondFolderIconIds.size).toBeGreaterThan(0);
    let directionOverlapCount = 0;
    for (const timing of timings) {
      const diagnosticTiming = {
        ...timing,
        firstFolderId: first.id,
        secondFolderId: second.id,
      };
      const samples = await traceFolderAlternation(page, first, second, timing);
      const baselinePixel = samples[0]?.pixel || null;
      if (!baselinePixel?.available || !baselinePixel.hash) {
        failures.push({
          kind: "framebuffer-baseline-unavailable",
          pixel: baselinePixel,
          timing: diagnosticTiming,
        });
      }
      const sawSecond = samples.some((sample) => (
        sample.visual.overlay?.currentFolderId === second.id ||
        sample.folder.openFolderId === second.id ||
        sample.folder.renderedFolderId === second.id
      ));
      if (samples.some((sample) => (
        sample.visual.overlay?.currentFolderId === second.id &&
        (sample.visual.overlay?.debug?.detachedClosingVisuals || []).some((visual) => (
          visual.folderId === first.id && visual.destroyed !== true
        ))
      ))) {
        directionOverlapCount += 1;
      }

      let encounteredSecond = false;
      let lastSecondClosingFrameProgress: number | null = null;
      let sawSecondClosingActor = false;
      let sawSecondClosingState = false;
      let sawVisuallyClosedSecond = false;
      for (const sample of samples) {
        const probeFailure = findVisualProbeFailure(sample.visual);
        if (probeFailure) {
          failures.push({
            kind: "visual-probe-data-unavailable",
            reason: probeFailure,
            time: sample.time,
            timing: diagnosticTiming,
          });
          continue;
        }
        const overlay = sample.visual.overlay!;
        const debug = overlay.debug!;
        const currentFolderId = overlay.currentFolderId || null;
        if (
          currentFolderId === second.id ||
          sample.folder.openFolderId === second.id ||
          sample.folder.renderedFolderId === second.id
        ) {
          encounteredSecond = true;
        }
        const visuallyClosed = encounteredSecond &&
          isSettledClosed(sample.folder, sample.visual) &&
          !hasVisibleFolderTransitionActor(sample.visual);
        if (visuallyClosed) {
          sawVisuallyClosedSecond = true;
          if (!sample.pixel.available || !sample.pixel.hash) {
            failures.push({
              kind: "settled-framebuffer-unavailable",
              pixel: sample.pixel,
              time: sample.time,
              timing: diagnosticTiming,
            });
          } else {
            const pixelDifference = baselinePixel
              ? comparePixelSnapshots(baselinePixel, sample.pixel)
              : null;
            if (!pixelDifference) {
              failures.push({
                baselinePixel,
                kind: "settled-framebuffer-incomparable",
                pixel: sample.pixel,
                time: sample.time,
                timing: diagnosticTiming,
              });
            } else if (pixelDifference.strong) {
              failures.push({
                baselinePixel,
                folder: sample.folder,
                kind: "settled-scene-framebuffer-mismatch",
                pixel: sample.pixel,
                pixelDifference,
                time: sample.time,
                timing: diagnosticTiming,
              });
            }
          }
          continue;
        }

        const iconIds = visibleOverlayIconIds(sample.visual);
        const openingGhostIds = visibleItemIds(debug.openingGhosts);
        const crossWiredIds = currentFolderId === second.id
          ? [...iconIds, ...openingGhostIds].filter((id) => !secondFolderIconIds.has(id))
          : [];
        const geometry = debug.openingGeometry;
        const geometryFolderIds = [
          geometry?.session?.folderId || null,
          geometry?.snapshot?.folderId || null,
        ].filter((id): id is string => Boolean(id));
        const mismatchedGeometry = currentFolderId === second.id && geometryFolderIds.some((id) => (
          id !== second.id
        ));
        const secondIsClosing = encounteredSecond && sample.folder.closing && [
          overlay.closingFolderId,
          overlay.currentFolderId,
          sample.folder.openFolderId,
          sample.folder.renderedFolderId,
        ].includes(second.id);
        const closingGhostIds = visibleItemIds(debug.closingGhosts);
        const previewSwapGhostIds = visibleItemIds(debug.previewSwapGhosts);
        const foreignClosingIds = secondIsClosing
          ? [...closingGhostIds, ...previewSwapGhostIds].filter((id) => !secondFolderIconIds.has(id))
          : [];
        const frameGhost = debug.frameGhost;
        const frameGhostVisible = isDisplayVisible(frameGhost?.display);
        let mismatchedClosingFrame = false;
        let invalidClosingFrameProgress = false;
        if (secondIsClosing) {
          sawSecondClosingState = true;
          const visibleSecondDetachedActors = (debug.detachedClosingVisuals || []).some((visual) => (
            visual.folderId === second.id &&
            visual.destroyed !== true &&
            isDisplayVisible(visual.container) &&
            (visual.children || []).some(isDisplayVisible)
          ));
          sawSecondClosingActor ||= frameGhostVisible ||
            closingGhostIds.length > 0 ||
            previewSwapGhostIds.length > 0 ||
            visibleSecondDetachedActors;
          if (frameGhostVisible) {
            mismatchedClosingFrame = frameGhost?.folderId !== second.id || frameGhost.phase !== "closing";
            const progress = frameGhost?.presentation?.progress;
            invalidClosingFrameProgress = typeof progress !== "number" ||
              !Number.isFinite(progress) ||
              progress < -0.01 ||
              progress > 1.02 ||
              (lastSecondClosingFrameProgress !== null && progress + 0.02 < lastSecondClosingFrameProgress);
            if (typeof progress === "number" && Number.isFinite(progress)) {
              lastSecondClosingFrameProgress = progress;
            }
          }
        }
        const revivedAfterSettle = sawVisuallyClosedSecond && hasVisibleFolderTransitionActor(sample.visual);
        if (
          !crossWiredIds.length &&
          !foreignClosingIds.length &&
          !mismatchedGeometry &&
          !mismatchedClosingFrame &&
          !invalidClosingFrameProgress &&
          !revivedAfterSettle
        ) continue;
        failures.push({
          crossWiredIds,
          currentFolderId,
          folder: sample.folder,
          foreignClosingIds,
          frameGhost,
          geometryFolderIds,
          invalidClosingFrameProgress,
          mismatchedClosingFrame,
          revivedAfterSettle,
          time: sample.time,
          timing: diagnosticTiming,
        });
      }
      failures.push(...findDetachedVisualDiscontinuities(samples).map((failure) => ({
        ...failure,
        timing: diagnosticTiming,
      })));
      if (!sawSecond) {
        failures.push({ kind: "second-folder-was-not-observed", timing: diagnosticTiming });
      }
      if (!sawSecondClosingState) {
        failures.push({ kind: "second-folder-close-was-not-observed", timing: diagnosticTiming });
      } else if (!sawSecondClosingActor) {
        failures.push({ kind: "second-folder-closing-actor-was-not-observed", timing: diagnosticTiming });
      }
      if (failures.length) break;
    }
    if (!failures.length && directionOverlapCount === 0) {
      failures.push({
        firstFolderId: first.id,
        kind: "direction-overlap-was-not-observed",
        secondFolderId: second.id,
      });
    }
    if (failures.length) break;
  }

  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});
