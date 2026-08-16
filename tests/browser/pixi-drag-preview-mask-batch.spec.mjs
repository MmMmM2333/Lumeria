import { expect, test } from "@playwright/test";

test("inactive drag-preview folder mask cannot corrupt later sprite pixels", async ({ page }) => {
  await page.goto("/tests/browser/fixtures/pixi-drag-preview-mask-batch.html");
  await page.waitForFunction(() => window.pixiDragPreviewMaskBatchFixtureReady === true);

  const result = await page.evaluate(() => window.runPixiDragPreviewMaskBatchRegression());
  const staleAttributeStarts = new Set(result.appMaskBatches.map((batch) => batch.attributeStart));
  const diagnostics = JSON.stringify({
    appMaskBatches: result.appMaskBatches,
    appMaskVisible: result.appMaskVisible,
    baselineCorruptionCount: result.baselineCorruptions.length,
    firstMotionCorruptions: result.motionCorruptions.slice(0, 12),
    maskAttachedInApp: result.maskAttachedInApp,
    motionCorruptionCount: result.motionCorruptions.length,
    offsetCollisions: result.sentinelOffsets.filter((entry) => staleAttributeStarts.has(entry.attributeStart)),
    rendererInfo: result.rendererInfo,
    transitionCycles: result.transitionCycles,
    warmCorruptionCount: result.warmCorruptions.length,
    warmMaskBatches: result.warmMaskBatches,
  }, null, 2);

  expect(result.renderer).toBe("webgl");
  expect(result.transitionCycles).toBe(10);
  expect(result.warmMaskBatches.length, diagnostics).toBeGreaterThan(0);
  expect(result.warmCorruptions.length, diagnostics).toBe(0);
  expect(result.baselineCorruptions.length, diagnostics).toBe(0);
  expect(result.motionCorruptions.length, diagnostics).toBe(0);
});

test("group-drag folder actors remain visible until they cross the rounded panel boundary", async ({ page }) => {
  await page.goto("/tests/browser/fixtures/pixi-drag-preview-mask-batch.html");
  await page.waitForFunction(() => window.pixiDragPreviewMaskBatchFixtureReady === true);

  const result = await page.evaluate(() => window.runGroupDragFolderClipRegression());
  const background = [0x11, 0x18, 0x27, 0xff];
  const actor = [0xf4, 0x3f, 0x5e, 0xff];
  const distance = (actual, expected) => Math.max(
    ...actual.map((channel, index) => Math.abs(channel - expected[index]))
  );
  const diagnostics = JSON.stringify(result, null, 2);

  expect(result.renderer).toBe("webgl");
  expect(result.maskAttached).toBe(true);
  expect(distance(result.inside, actor), diagnostics).toBeLessThanOrEqual(12);
  expect(distance(result.straightEdgeInside, actor), diagnostics).toBeLessThanOrEqual(12);
  expect(distance(result.outside, background), diagnostics).toBeLessThanOrEqual(12);
  expect(distance(result.cornerOutside, background), diagnostics).toBeLessThanOrEqual(12);
});
