import { expect, test } from "@playwright/test";

async function rightClickSingleSearchResult(page) {
  const canvas = page.locator("canvas.pixi-launchpad-canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Pixi launchpad canvas has no visible bounds");

  const menu = page.getByRole("menu", { name: "Safari 菜单" });
  const centerX = bounds.x + bounds.width / 2;
  for (let offsetY = 96; offsetY <= bounds.height - 48; offsetY += 24) {
    await page.mouse.click(centerX, bounds.y + offsetY, { button: "right" });
    if (await menu.isVisible()) return menu;
  }

  throw new Error("Could not open the Safari context menu from the single-result grid");
}

test("editing an app from its context menu opens the edit dialog", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "搜索应用" });
  await expect(search).toBeVisible();
  await search.fill("Safari");

  const menu = await rightClickSingleSearchResult(page);
  await menu.getByRole("menuitem", { name: "编辑" }).click();

  await expect(menu).toBeHidden();
  await expect(page.getByRole("dialog", { name: "编辑应用" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
