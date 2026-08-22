import { expect, test } from "./fixtures/launchpadMouseTest.mjs";

test.use({ locale: "zh-CN" });

const E2E_PROBE_NAME = "__LUMERIA_E2E__";
const POINTER_TRACE_NAME = "__LUMERIA_POINTER_TRACE__";
const CANCELLATION_TRACE_NAME = "__LUMERIA_CANCELLATION_TRACE__";
const SOURCE_APP_ID = "app-12-books";
const TARGET_APP_ID = "app-4-calendar";

async function waitForFixture(page) {
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
  await expect.poll(async () => page.evaluate((probeName) => {
    const root = document.querySelector('[data-launchpad-fixture="multi-select"]');
    return Boolean(root && window[probeName]?.version === 1);
  }, E2E_PROBE_NAME), { timeout: 10_000 }).toBe(true);
}

async function readIconCenter(page, id) {
  await expect.poll(async () => page.evaluate(({ id: iconId, probeName }) => {
    try {
      window[probeName].getIconBounds(iconId);
      return true;
    } catch {
      return false;
    }
  }, { id, probeName: E2E_PROBE_NAME })).toBe(true);
  return page.evaluate(({ id: iconId, probeName }) => {
    const bounds = window[probeName].getIconBounds(iconId);
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  }, { id, probeName: E2E_PROBE_NAME });
}

async function prepareTrustedSource(page) {
  await waitForFixture(page);
  return readIconCenter(page, SOURCE_APP_ID);
}

async function prepareAppFolderScenario(page) {
  await waitForFixture(page);
  const [source, target] = await Promise.all([
    readIconCenter(page, SOURCE_APP_ID),
    readIconCenter(page, TARGET_APP_ID),
  ]);
  return { source, target };
}

async function startPointerTrace(page) {
  await page.evaluate((traceName) => {
    const previous = window[traceName];
    previous?.dispose?.();
    const events = [];
    const types = [
      "pointerdown",
      "gotpointercapture",
      "pointermove",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ];
    const listener = (event) => {
      const host = document.querySelector(".pixi-desktop-host-root-stage");
      if (!host?.contains(event.target)) return;
      events.push({
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
        isTrusted: event.isTrusted,
        pointerId: event.pointerId,
        target: event.target?.tagName || null,
        type: event.type,
      });
    };
    for (const type of types) document.addEventListener(type, listener, true);
    window[traceName] = {
      dispose() {
        for (const type of types) document.removeEventListener(type, listener, true);
      },
      events,
    };
  }, POINTER_TRACE_NAME);
}

async function stopPointerTrace(page) {
  return page.evaluate((traceName) => {
    const trace = window[traceName];
    if (!trace) throw new Error("Trusted pointer trace was not started");
    trace.dispose();
    const events = trace.events.map((event) => ({ ...event }));
    delete window[traceName];
    return events;
  }, POINTER_TRACE_NAME);
}

async function readProbeSnapshot(page) {
  return page.evaluate((probeName) => window[probeName].snapshot(), E2E_PROBE_NAME);
}

async function beginTrustedIconDrag(page, source) {
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.waitForTimeout(560);
  await page.mouse.move(source.x + 18, source.y, { steps: 2 });
  await expect.poll(async () => (await readProbeSnapshot(page)).drag?.phase || null).toBe("dragging");
}

async function enterTrustedAppTarget(page, source, target, targetId) {
  await beginTrustedIconDrag(page, source);
  await page.mouse.move(target.x, target.y);
  await expect.poll(async () => (await readProbeSnapshot(page)).hover?.targetId || null).toBe(targetId);
}

async function waitForHoverPhase(page, phase) {
  await page.waitForFunction(({ phase: expectedPhase, probeName }) => (
    window[probeName]?.snapshot?.().hover?.phase === expectedPhase
  ), { phase, probeName: E2E_PROBE_NAME }, { timeout: 3_000, polling: "raf" });
}

async function finishTrustedDragAt(page, point) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.up();
  await expect.poll(async () => (await readProbeSnapshot(page)).drag, { timeout: 5_000 }).toBeNull();
}

function expectNoFolderMutation(snapshot, layoutBefore) {
  expect(snapshot.folder).toMatchObject({
    layerActive: false,
    openFolderId: null,
    renderedFolderId: null,
  });
  expect(snapshot.layout).toEqual(layoutBefore);
  expect(snapshot.rollback).toBeNull();
}

function collectLayoutIds(pages) {
  const ids = [];
  for (const item of pages.flat()) {
    ids.push(item.id);
    if (item.type === "folder") ids.push(...collectLayoutIds(item.childPages || []));
  }
  return ids;
}

function findLayoutItem(pages, id) {
  return pages.flat().find((item) => item.id === id) || null;
}

function hasVisibleFolderCancellationActor(snapshot, expectedFolderId = null) {
  const folderVisual = snapshot.visual?.folderVisual;
  const overlay = folderVisual?.overlay;
  const rollbackLayer = folderVisual?.provisionalFolderRollback?.layer;
  const rollbackPresentation = folderVisual?.provisionalFolderRollback?.presentation;
  const matchesFolder = (folderId) => Boolean(
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

function countLiveDesktopFolderActors(snapshot, expectedFolderId) {
  return (snapshot.visual?.folderVisual?.folderNodes || []).filter((entry) => (
    entry.id === expectedFolderId &&
    entry.display?.visible &&
    entry.display?.alpha > 0.001 &&
    entry.state?.ghosted !== true &&
    entry.sourceGhostedByOwnership !== true
  )).length;
}

async function waitForFolderCancellationToSettle(page, layoutBefore, expectedFolderId = null) {
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

async function waitForProvisionalFolder(page) {
  try {
    await page.waitForFunction((probeName) => {
      const snapshot = window[probeName]?.snapshot?.();
      const folderId = snapshot?.folder?.openFolderId;
      const authoritativeIds = snapshot?.layout?.flat?.().map((item) => item.id) || [];
      const renderedIds = snapshot?.renderedLayout?.flat?.().map((item) => item.id) || [];
      return Boolean(
        folderId &&
        snapshot.folder?.renderedFolderId === folderId &&
        !authoritativeIds.includes(folderId) &&
        renderedIds.includes(folderId)
      );
    }, E2E_PROBE_NAME, { timeout: 6_000, polling: "raf" });
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

async function readOutsideOpenFolderPoint(page, snapshot) {
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

async function startCancellationFrameTrace(page, folderId) {
  await page.evaluate(({ folderId: expectedFolderId, probeName, traceName }) => {
    const previous = window[traceName];
    if (previous?.raf) cancelAnimationFrame(previous.raf);
    if (previous?.onCancelMove) {
      window.removeEventListener("pointermove", previous.onCancelMove);
    }
    const trace = {
      active: true,
      cancelMoveTime: null,
      onCancelMove: null,
      raf: null,
      samples: [],
    };
    trace.onCancelMove = () => {
      if (trace.cancelMoveTime == null) trace.cancelMoveTime = performance.now();
    };
    window.addEventListener("pointermove", trace.onCancelMove, { once: true });
    const sample = () => {
      if (!trace.active) return;
      const sampleTime = performance.now();
      const snapshot = window[probeName].snapshot();
      const folderVisual = snapshot.visual?.folderVisual;
      const overlay = folderVisual?.overlay;
      const layer = folderVisual?.provisionalFolderRollback?.layer;
      const rollbackPresentation = folderVisual?.provisionalFolderRollback?.presentation;
      const folderTitleInput = document.querySelector(".pixi-folder-name-input");
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
      trace.raf = requestAnimationFrame(sample);
    };
    window[traceName] = trace;
    sample();
  }, { folderId, probeName: E2E_PROBE_NAME, traceName: CANCELLATION_TRACE_NAME });
}

async function stopCancellationFrameTrace(page) {
  return page.evaluate((traceName) => {
    const trace = window[traceName];
    if (!trace) throw new Error("Folder cancellation trace was not started");
    trace.active = false;
    if (trace.raf) cancelAnimationFrame(trace.raf);
    if (trace.onCancelMove) window.removeEventListener("pointermove", trace.onCancelMove);
    const samples = trace.samples.map((sample) => ({ ...sample }));
    delete window[traceName];
    return samples;
  }, CANCELLATION_TRACE_NAME);
}

function expectFolderTitleToFadeOut(samples, options = {}) {
  const cancellationSamples = samples.filter((sample) => sample.afterCancelMove);
  expect(cancellationSamples.length).toBeGreaterThan(1);
  const diagnosticSamples = JSON.stringify(cancellationSamples.map((sample) => ({
    closing: sample.folderClosing,
    computed: sample.folderTitleOpacity,
    inline: sample.inlineFolderTitleOpacity,
  })));
  const opacity = cancellationSamples
    .map((sample) => sample.folderTitleOpacity)
    .filter(Number.isFinite);
  expect(opacity.length).toBeGreaterThan(1);
  if (options.requireVisibleStart === true) {
    expect(opacity[0]).toBeGreaterThan(0.5);
    expect(
      opacity.some((value) => value > 0.05 && value < opacity[0] - 0.05),
      `Visible-cancel folder title lacks an intermediate frame: ${diagnosticSamples}`
    ).toBe(true);
    expect(
      opacity.every((value, index) => index === 0 || value <= opacity[index - 1] + 0.02),
      `Visible-cancel folder title samples: ${diagnosticSamples}`
    ).toBe(true);
  } else if (opacity[0] <= 0.05) {
    expect(
      Math.max(...opacity),
      `Immediate-cancel folder title samples: ${diagnosticSamples}`
    ).toBeLessThanOrEqual(0.15);
  } else {
    expect(
      opacity.every((value, index) => index === 0 || value <= opacity[index - 1] + 0.02),
      `Partial-cancel folder title samples: ${diagnosticSamples}`
    ).toBe(true);
  }
  expect(opacity.at(-1)).toBeLessThanOrEqual(0.05);
}

test("trusted mouse drag acquires and releases the canvas pointer capture @webview", async ({ appPage: page }) => {
  const source = await prepareTrustedSource(page);
  await startPointerTrace(page);

  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.waitForTimeout(560);
  await page.mouse.move(source.x + 18, source.y, { steps: 2 });
  await expect.poll(async () => page.evaluate((probeName) => (
    window[probeName].snapshot().drag?.phase || null
  ), E2E_PROBE_NAME)).toBe("dragging");
  await page.mouse.up();

  await expect.poll(async () => page.evaluate((probeName) => (
    window[probeName].snapshot().drag
  ), E2E_PROBE_NAME)).toBeNull();
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
  expect(pointerEvents[0].target).toBe("CANVAS");
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
    return Boolean(frame?.active && frame.backdropVisible && frame.backdropAlpha > 0.5);
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
    return Boolean(frame?.active && frame.backdropVisible && frame.backdropAlpha > 0.5);
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
  const outsideFolder = await readOutsideOpenFolderPoint(page, opened);
  expect(opened.layout).toEqual(layoutBefore);
  expect(opened.renderedLayout.flat().some((item) => item.id === provisionalFolderId)).toBe(true);

  await startCancellationFrameTrace(page, provisionalFolderId);
  await page.mouse.move(outsideFolder.x, outsideFolder.y);
  await waitForFolderCancellationToSettle(page, layoutBefore, provisionalFolderId);
  const samples = await stopCancellationFrameTrace(page);
  const isCancellationActive = (sample) => Boolean(
    sample.folderActive || sample.rollbackPhase || sample.rollbackLayerActive
  );
  const firstCancellationIndex = samples.findIndex(isCancellationActive);
  let lastCancellationIndex = -1;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (!isCancellationActive(samples[index])) continue;
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
  expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(true);
  const targetLabelAlpha = rollbackSamples
    .map((sample) => sample.targetLabelAlpha)
    .filter(Number.isFinite);
  expect(targetLabelAlpha.length).toBeGreaterThan(1);
  expect(targetLabelAlpha.at(-1)).toBeGreaterThan(targetLabelAlpha[0]);
  expect(targetLabelAlpha.every((value, index) => (
    index === 0 || value >= targetLabelAlpha[index - 1] - 0.02
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

  await page.evaluate((traceName) => {
    const trace = window[traceName];
    const pointerId = trace?.events?.find((event) => event.type === "pointerdown")?.pointerId;
    const canvas = document.querySelector(".pixi-desktop-host-root-stage canvas");
    if (!canvas || pointerId == null || !canvas.hasPointerCapture(pointerId)) {
      throw new Error("Canvas does not own the trusted mouse pointer capture");
    }
    canvas.releasePointerCapture(pointerId);
  }, POINTER_TRACE_NAME);
  await waitForFolderCancellationToSettle(page, layoutBefore, provisionalFolderId);
  await expect.poll(async () => (await readProbeSnapshot(page)).drag, { timeout: 6_000 }).toBeNull();
  await page.mouse.up();
  const trace = await stopPointerTrace(page);
  const lostCapture = trace.find((event) => event.type === "lostpointercapture");
  expect(lostCapture).toMatchObject({ isTrusted: true, target: "CANVAS" });
});
