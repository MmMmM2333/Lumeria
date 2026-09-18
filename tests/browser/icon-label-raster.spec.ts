import { test } from "@playwright/test";

test("reused label widths preserve multilingual raster pixels and DPI", async ({ page }) => {
  await page.goto("/tests/browser/fixtures/pixi-drag-preview-mask-batch.html");
  await page.evaluate(async () => {
    const fixturePath = "/tests/browser/fixtures/icon-label-raster.fixture.ts";
    const { runLabelRasterTests } = await import(fixturePath);
    runLabelRasterTests();
  });
});
