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
