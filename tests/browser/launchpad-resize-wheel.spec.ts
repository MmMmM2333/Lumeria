import { expect, test } from "@playwright/test";
import type {} from "../../src/testing/launchpadE2eProbe.js";

test.use({ locale: "en-US", viewport: { width: 900, height: 650 } });

test("incremental viewport resizing preserves icon hit targets", async ({ page }) => {
  await page.goto("/?fixture=multi-select");
  await page.waitForFunction(() => window.__LUMERIA_E2E__?.version === 1);
  const readBounds = () => page.evaluate(() => window.__LUMERIA_E2E__!.getIconBounds("app-4-calendar"));
  await expect.poll(async () => {
    try { return (await readBounds()).width; }
    catch { return 0; } // The probe is installed before the first scene has bounds.
  }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(async () => {
    const modulePath = "/src/rendering/pixi/animation/motionRuntime.ts";
    const { motionRuntime } = await import(modulePath);
    return motionRuntime.hasActiveWork();
  })).toBe(false);
  const before = await readBounds();
  for (const width of [
    ...Array.from({ length: 30 }, (_, index) => 901 + index),
    ...Array.from({ length: 30 }, (_, index) => 929 - index),
  ]) {
    await page.setViewportSize({ width, height: 650 });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  await expect.poll(async () => Math.abs((await readBounds()).left - before.left)).toBeLessThan(0.5);
  const after = await readBounds();
  expect(Math.abs(after.top - before.top)).toBeLessThan(0.5);
  await page.mouse.click(after.left + after.width / 2, after.top + after.height / 2, { button: "right" });
  await expect(page.getByRole("menuitem", { name: "Edit", exact: true })).toBeVisible();
});

test("continuous browser wheel input settles and reverses between pages", async ({ page }) => {
  await page.goto("/?fixture=multi-select");
  const dots = page.locator(".page-dots .page-dot");
  await expect(dots.nth(1)).toBeVisible();
  await expect(dots.nth(0)).toHaveClass(/page-dot-active/);
  await page.mouse.move(450, 320);
  for (const direction of [1, -1]) {
    for (let sample = 0; sample < 30; sample++) {
      await page.mouse.wheel(30 * direction, 0);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    }
    await expect(dots.nth(direction === 1 ? 1 : 0)).toHaveClass(/page-dot-active/);
  }
});
