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

test("scrolling over an icon context menu closes it without consuming the wheel event", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "搜索应用" });
  await expect(search).toBeVisible();
  await search.fill("Safari");

  const menu = await rightClickSingleSearchResult(page);
  const bounds = await menu.boundingBox();
  if (!bounds) throw new Error("Safari context menu has no visible bounds");

  await page.evaluate(() => {
    window.__contextMenuWheelProbe = 0;
    document.querySelector(".launchpad-root")?.addEventListener("wheel", () => {
      window.__contextMenuWheelProbe += 1;
    }, { once: true });
  });
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, 120);

  await expect(menu).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__contextMenuWheelProbe)).toBe(1);
});

test("the Pixi canvas suppresses the browser's native context menu", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas.pixi-launchpad-canvas");
  await expect(canvas).toBeVisible();

  const result = await canvas.evaluate((element) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
    });
    const dispatchReturned = element.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented,
      dispatchReturned,
    };
  });

  expect(result).toEqual({
    defaultPrevented: true,
    dispatchReturned: false,
  });
});

test("launchpad chrome suppresses native context menus outside editable fields", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".launchpad-header")).toBeVisible();
  await expect(page.locator(".page-dots")).toBeVisible();

  const result = await page.evaluate(() => {
    function dispatchContextMenu(selector) {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing context menu probe target: ${selector}`);
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
      });
      const dispatchReturned = element.dispatchEvent(event);
      return {
        defaultPrevented: event.defaultPrevented,
        dispatchReturned,
      };
    }

    return {
      footer: dispatchContextMenu(".page-dots"),
      header: dispatchContextMenu(".launchpad-header"),
      searchInput: dispatchContextMenu(".search-input"),
    };
  });

  expect(result).toEqual({
    footer: { defaultPrevented: true, dispatchReturned: false },
    header: { defaultPrevented: true, dispatchReturned: false },
    searchInput: { defaultPrevented: false, dispatchReturned: true },
  });
});
