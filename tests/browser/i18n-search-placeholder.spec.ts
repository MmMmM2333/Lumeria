import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function sampleSearchAnimation(page: Page, frameCount = 16) {
  return page.evaluate(async (count) => {
    const frames = [];
    for (let index = 0; index < count; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const content = document.querySelector(".search-pill-content");
      const icon = content?.querySelector(".hint-icon");
      if (!content || !icon) throw new Error("Search animation layout is incomplete");
      frames.push({
        contentWidth: content.getBoundingClientRect().width,
        iconLeft: icon.getBoundingClientRect().left,
      });
    }
    return frames;
  }, frameCount);
}

test.describe("localized launchpad search placeholder", () => {
  test.use({ locale: "en-US" });

  test("the English placeholder is not clipped and animates in both directions", async ({ page }) => {
    await page.goto("/tests/browser/reference/index.html");
    const search = page.getByRole("searchbox", { name: "Search apps" });
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute("placeholder", "Search");

    const centered = await search.evaluate((input) => {
      if (!(input instanceof HTMLInputElement)) throw new Error("Searchbox must be an input element");
      const content = input.closest(".search-pill-content");
      const icon = content?.querySelector(".hint-icon");
      if (!content || !icon) throw new Error("Search placeholder layout is incomplete");
      const contentStyle = getComputedStyle(content);
      const inputStyle = getComputedStyle(input);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas text measurement is unavailable");
      context.font = inputStyle.font;
      const contentRect = content.getBoundingClientRect();
      const pillRect = input.closest(".search-pill")?.getBoundingClientRect();
      return {
        availableWidth: contentRect.width,
        centered: content.classList.contains("search-pill-content")
          && input.closest(".search-pill")?.classList.contains("search-pill-centered"),
        centerDelta: pillRect
          ? Math.abs((contentRect.left + contentRect.width / 2) - (pillRect.left + pillRect.width / 2))
          : Number.POSITIVE_INFINITY,
        requiredWidth: icon.getBoundingClientRect().width
          + Number.parseFloat(contentStyle.columnGap || contentStyle.gap || "0")
          + context.measureText(input.placeholder).width,
        iconLeft: icon.getBoundingClientRect().left,
      };
    });

    expect(centered.centered).toBe(true);
    expect(centered.centerDelta).toBeLessThanOrEqual(1);
    expect(centered.availableWidth + 0.5).toBeGreaterThanOrEqual(centered.requiredWidth);

    await search.click();
    await expect(search).toBeFocused();
    await expect.poll(async () => search.evaluate((input) => (
      input instanceof HTMLInputElement
        ? input.closest(".search-pill-content")?.getBoundingClientRect().width || 0
        : 0
    ))).toBeGreaterThan(250);

    const focusedIconLeft = await search.evaluate((input) => (
      input instanceof HTMLInputElement
        ? input.closest(".search-pill-content")?.querySelector(".hint-icon")?.getBoundingClientRect().left
        ?? Number.NaN
        : Number.NaN
    ));
    await page.locator(".pixi-launchpad-canvas").click({ position: { x: 12, y: 12 } });
    const blurFrames = await sampleSearchAnimation(page);
    const lowerBound = Math.min(focusedIconLeft, centered.iconLeft) + 2;
    const upperBound = Math.max(focusedIconLeft, centered.iconLeft) - 2;
    expect(blurFrames.some((frame) => frame.iconLeft > lowerBound && frame.iconLeft < upperBound)).toBe(true);
    await expect.poll(async () => search.evaluate((input, centeredIconLeft) => {
      if (!(input instanceof HTMLInputElement)) return Number.POSITIVE_INFINITY;
      const icon = input.closest(".search-pill-content")?.querySelector(".hint-icon");
      return icon ? Math.abs(icon.getBoundingClientRect().left - centeredIconLeft) : Number.POSITIVE_INFINITY;
    }, centered.iconLeft)).toBeLessThanOrEqual(1);
  });
});
