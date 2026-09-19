import { expect, test } from "@playwright/test";

test("custom background filters render through both Pixi GPU backends", async ({ page }) => {
  await page.goto("/tests/browser/fixtures/pixi-filter-backends.html");
  await page.waitForFunction(() => window.pixiFilterBackendsFixtureReady === true);
  const result = await page.evaluate(() => window.runPixiFilterBackendsRegression());
  const diagnostics = JSON.stringify({
    acrylicParity: result.acrylicParity,
    gaussianParity: result.gaussianParity,
    kawaseParity: result.kawaseParity,
    webgl: { ...result.webgl, pixels: undefined },
    webgpu: { ...result.webgpu, pixels: undefined },
  }, null, 2);

  expect(result.webgl.renderer).toBe("webgl");
  expect(result.webgpu.renderer).toBe("webgpu");
  expect(result.webgl.compatibleRenderers).toBe(true);
  expect(result.webgpu.compatibleRenderers).toBe(true);
  expect(result.webgpu.gpuErrors, diagnostics).toEqual([]);
  for (const backend of [result.webgl, result.webgpu]) {
    expect(backend.sourceToGaussian.changedComponents, diagnostics).toBeGreaterThan(100);
    expect(backend.sourceToKawase.changedComponents, diagnostics).toBeGreaterThan(100);
    expect(backend.kawaseToAcrylic.changedComponents, diagnostics).toBeGreaterThan(100);
  }
  expect(result.gaussianParity.mean, diagnostics).toBeLessThanOrEqual(1);
  expect(result.kawaseParity.mean, diagnostics).toBeLessThanOrEqual(1);
  expect(result.acrylicParity.mean, diagnostics).toBeLessThanOrEqual(1);
});
