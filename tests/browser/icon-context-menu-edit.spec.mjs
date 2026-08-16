import { expect, test } from "@playwright/test";

test.use({ locale: "zh-CN" });

async function rightClickSingleSearchResult(page, itemName = "Safari") {
  const canvas = page.locator("canvas.pixi-launchpad-canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Pixi launchpad canvas has no visible bounds");
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  const menu = page.getByRole("menu", { name: `${itemName} 菜单` });
  const surfaceMenu = page.getByRole("menu", { name: "启动台菜单", exact: true });
  const centerX = bounds.x + bounds.width / 2;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    for (let offsetY = 96; offsetY <= bounds.height - 48; offsetY += 24) {
      await page.mouse.click(centerX, bounds.y + offsetY, { button: "right" });
      await page.waitForTimeout(20);
      if (await menu.isVisible()) return menu;
      if (await surfaceMenu.isVisible()) {
        throw new Error("Surface context menu opened while search mode was active");
      }
    }
  }

  throw new Error(`Could not open the ${itemName} context menu from the single-result grid`);
}

async function rightClickFolderTarget(page, folderName = "Productivity Suite") {
  const canvas = page.locator("canvas.pixi-launchpad-canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Pixi launchpad canvas has no visible bounds");
  const desktopMain = page.locator(".desktop-main");
  const mainBounds = await desktopMain.boundingBox();
  if (!mainBounds) throw new Error("Pixi desktop main has no visible bounds");
  const mainPadding = await desktopMain.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      bottom: Number.parseFloat(style.paddingBottom) || 0,
      top: Number.parseFloat(style.paddingTop) || 0,
    };
  });

  const menu = page.getByRole("menu", { name: `${folderName} 菜单`, exact: true });
  const frame = {
    height: mainBounds.height - mainPadding.top - mainPadding.bottom,
    left: bounds.x,
    top: mainBounds.y + mainPadding.top,
    width: bounds.width,
  };
  const width = frame.width;
  const height = frame.height;
  const compact = width <= 760;
  const cols = 7;
  const rows = 5;
  const paddingX = Math.min(compact ? 58 : 96, Math.max(20, width * 0.12));
  const paddingTop = compact ? 28 : 34;
  const paddingBottom = compact ? 16 : 24;
  const gapX = compact ? 8 : 12;
  const gapY = compact ? 12 : 16;
  const cellWidth = (width - paddingX * 2 - gapX * (cols - 1)) / cols;
  const cellHeight = (height - paddingTop - paddingBottom - gapY * (rows - 1)) / rows;

  for (let index = 0; index < cols * rows; index += 1) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = frame.left + paddingX + col * (cellWidth + gapX) + cellWidth / 2;
    const y = frame.top + paddingTop + row * (cellHeight + gapY) + cellHeight / 2;
    await page.mouse.click(x, y, { button: "right" });
    await page.waitForTimeout(20);
    if (await menu.isVisible()) return { menu, point: { x, y } };
    if (await page.locator("[role='menu']:visible").count()) {
      await page.keyboard.press("Escape");
    }
  }

  throw new Error(`Could not open the ${folderName} context menu from the first page grid`);
}

async function rightClickFolder(page, folderName = "Productivity Suite") {
  const { menu } = await rightClickFolderTarget(page, folderName);
  return menu;
}

async function rightClickFolderChild(page) {
  const folderMenu = await rightClickFolder(page);
  await folderMenu.getByRole("menuitem", { name: "打开", exact: true }).click();
  await expect(page.locator("input.pixi-folder-name-input")).toBeVisible();

  const canvas = page.locator("canvas.pixi-launchpad-canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Pixi launchpad canvas has no visible bounds");
  const visibleMenu = page.locator("fluent-menu-list[role='menu']:visible");
  for (let y = bounds.y + 120; y <= bounds.y + bounds.height - 100; y += 32) {
    for (let x = bounds.x + 80; x <= bounds.x + bounds.width - 80; x += 32) {
      await page.mouse.click(x, y, { button: "right" });
      await page.waitForTimeout(16);
      if (await visibleMenu.count()) {
        const label = await visibleMenu.getAttribute("aria-label");
        if (label && label !== "启动台菜单") {
          return { menu: visibleMenu, point: { x, y } };
        }
      }
    }
  }
  throw new Error("Could not open a child icon context menu inside Productivity Suite");
}

async function rightClickFolderBlank(page) {
  const canvas = page.locator("canvas.pixi-launchpad-canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Pixi launchpad canvas has no visible bounds");
  const folderMenu = page.getByRole("menu", { name: "文件夹菜单", exact: true });
  const visibleMenu = page.locator("fluent-menu-list[role='menu']:visible");
  for (let y = bounds.y + 120; y <= bounds.y + bounds.height - 100; y += 32) {
    for (let x = bounds.x + 80; x <= bounds.x + bounds.width - 80; x += 32) {
      await page.mouse.click(x, y, { button: "right" });
      await page.waitForTimeout(16);
      if (await folderMenu.isVisible()) return folderMenu;
      if (await visibleMenu.count()) await page.keyboard.press("Escape");
    }
  }
  throw new Error("Could not open the folder-scoped menu from blank panel space");
}

async function getDesktopSurfacePoint(page) {
  const desktopMain = page.locator(".desktop-main");
  await expect(desktopMain).toBeVisible();
  const mainBounds = await desktopMain.boundingBox();
  if (!mainBounds) throw new Error("Pixi desktop main has no visible bounds");
  return {
    x: mainBounds.x + mainBounds.width / 4,
    y: mainBounds.y + mainBounds.height - 24,
  };
}

async function rightClickDesktopSurface(page) {
  const point = await getDesktopSurfacePoint(page);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "启动台菜单", exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

async function applySettingsTheme(page, themeName) {
  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "外观", exact: true }).click();
  const appearancePanel = dialog.getByRole("tabpanel", { name: "外观" });
  await expect(appearancePanel).toBeVisible();
  await appearancePanel.getByRole("button", { name: themeName, exact: true }).click();
  await dialog.locator(".settings-actions fluent-button[appearance='primary']").click();
  await expect(dialog).toBeHidden();
}

async function readContextMenuTheme(menu) {
  return menu.evaluate((element) => {
    const layer = element.closest(".icon-context-menu-layer");
    const firstItem = element.querySelector("fluent-menu-item");
    const dangerItem = element.querySelector(".icon-context-menu-item-danger");
    if (!layer || !firstItem || !dangerItem) {
      throw new Error("Context menu theme probe is missing its layer or menu items");
    }
    const menuStyle = getComputedStyle(element);
    const firstItemStyle = getComputedStyle(firstItem);
    const dangerItemStyle = getComputedStyle(dangerItem);
    return {
      colorScheme: menuStyle.colorScheme,
      dangerBackgroundHover: dangerItemStyle.getPropertyValue("--colorNeutralBackground1Hover").trim(),
      dangerBackgroundSelected: dangerItemStyle.getPropertyValue("--colorNeutralBackground1Selected").trim(),
      dangerForeground: dangerItemStyle.getPropertyValue("--colorNeutralForeground2").trim(),
      dangerForegroundHover: dangerItemStyle.getPropertyValue("--colorNeutralForeground2Hover").trim(),
      dangerForegroundPressed: dangerItemStyle.getPropertyValue("--colorNeutralForeground2Pressed").trim(),
      dangerIconForegroundPressed: dangerItemStyle.getPropertyValue("--colorCompoundBrandForeground1Pressed").trim(),
      itemBackgroundHover: firstItemStyle.getPropertyValue("--colorNeutralBackground1Hover").trim(),
      itemForeground: firstItemStyle.getPropertyValue("--colorNeutralForeground2").trim(),
      menuBackground: menuStyle.getPropertyValue("--colorNeutralBackground1").trim(),
      menuShadow: menuStyle.getPropertyValue("--shadow16").trim(),
      menuStroke: menuStyle.getPropertyValue("--colorTransparentStroke").trim(),
      theme: layer.dataset.settingsTheme || null,
    };
  });
}

async function readSurfaceContextMenuTheme(menu) {
  return menu.evaluate((element) => {
    const layer = element.closest(".icon-context-menu-layer");
    const firstItem = element.querySelector("fluent-menu-item");
    if (!layer || !firstItem) throw new Error("Surface context menu theme probe is missing its layer or item");
    const menuStyle = getComputedStyle(element);
    const firstItemStyle = getComputedStyle(firstItem);
    return {
      colorScheme: menuStyle.colorScheme,
      itemBackgroundHover: firstItemStyle.getPropertyValue("--colorNeutralBackground1Hover").trim(),
      itemForeground: firstItemStyle.getPropertyValue("--colorNeutralForeground2").trim(),
      menuBackground: menuStyle.getPropertyValue("--colorNeutralBackground1").trim(),
      menuShadow: menuStyle.getPropertyValue("--shadow16").trim(),
      menuStroke: menuStyle.getPropertyValue("--colorTransparentStroke").trim(),
      theme: layer.dataset.settingsTheme || null,
    };
  });
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
  const dialog = page.getByRole("dialog", { name: "编辑应用" });
  await expect(dialog).toBeVisible();
  const point = await getDesktopSurfacePoint(page);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(page.locator("[role='menu']:visible")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.mouse.click(point.x, point.y);
  await expect(dialog).toBeHidden();
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

test("icon context menu preserves the existing dark palette", async ({ page }) => {
  await page.goto("/");
  const menu = await rightClickFolder(page);
  await expect(menu.getByRole("menuitem", { name: "解散文件夹" })).toBeVisible();

  expect(await readContextMenuTheme(menu)).toEqual({
    colorScheme: "dark",
    dangerBackgroundHover: "rgba(196, 43, 28, 0.16)",
    dangerBackgroundSelected: "rgba(196, 43, 28, 0.22)",
    dangerForeground: "rgba(255, 170, 160, 0.9)",
    dangerForegroundHover: "#ffb4a9",
    dangerForegroundPressed: "#ff8f83",
    dangerIconForegroundPressed: "#2886de",
    itemBackgroundHover: "#3d3d3d",
    itemForeground: "#d6d6d6",
    menuBackground: "#1f1f1f",
    menuShadow: "0 18px 42px rgba(0, 0, 0, 0.32)",
    menuStroke: "rgba(255, 255, 255, 0.14)",
    theme: "dark",
  });
});

test("icon context menu uses the selected light palette", async ({ page }) => {
  await page.goto("/");
  await applySettingsTheme(page, "浅色");
  const menu = await rightClickFolder(page);
  await expect(menu.getByRole("menuitem", { name: "解散文件夹" })).toBeVisible();

  expect(await readContextMenuTheme(menu)).toEqual({
    colorScheme: "light",
    dangerBackgroundHover: "#fdf6f6",
    dangerBackgroundSelected: "#f1bbbc",
    dangerForeground: "#bc2f32",
    dangerForegroundHover: "#bc2f32",
    dangerForegroundPressed: "#751d1f",
    dangerIconForegroundPressed: "#751d1f",
    itemBackgroundHover: "#f5f5f5",
    itemForeground: "#424242",
    menuBackground: "#ffffff",
    menuShadow: "0 0 2px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.14)",
    menuStroke: "rgba(0, 0, 0, 0.12)",
    theme: "light",
  });
});

test("blank-area context menu exposes only desktop actions and opens settings", async ({ page }) => {
  await page.goto("/");
  const menu = await rightClickDesktopSurface(page);

  await expect(menu.getByRole("menuitem", { name: "重新整理", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "打开设置", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "扫描应用", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "新增应用", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "新建文件夹", exact: true })).toHaveCount(0);

  await menu.getByRole("menuitem", { name: "打开设置", exact: true }).click();
  await expect(menu).toBeHidden();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  const point = await getDesktopSurfacePoint(page);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(page.locator("[role='menu']:visible")).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

test("blank-area menu is replaced by an icon menu on the next right click", async ({ page }) => {
  await page.goto("/");
  const { menu: iconMenu, point } = await rightClickFolderTarget(page);
  await page.keyboard.press("Escape");
  await expect(iconMenu).toBeHidden();

  const surfaceMenu = await rightClickDesktopSurface(page);
  await page.mouse.click(point.x, point.y, { button: "right" });

  await expect(surfaceMenu).toBeHidden();
  await expect(iconMenu).toBeVisible();
});

test("icon menu remains an icon menu when the same icon is right-clicked again", async ({ page }) => {
  await page.goto("/");
  const { menu: iconMenu, point } = await rightClickFolderTarget(page);

  await page.mouse.click(point.x, point.y, { button: "right" });

  await expect(iconMenu).toBeVisible();
  await expect(page.getByRole("menu", { name: "启动台菜单", exact: true })).toHaveCount(0);
});

test("icon menu is replaced by the blank-area menu on a surface right click", async ({ page }) => {
  await page.goto("/");
  const { menu: iconMenu } = await rightClickFolderTarget(page);
  const point = await getDesktopSurfacePoint(page);

  await page.mouse.click(point.x, point.y, { button: "right" });

  await expect(iconMenu).toBeHidden();
  await expect(page.getByRole("menu", { name: "启动台菜单", exact: true })).toBeVisible();
});

test("right-clicking the menu itself keeps the current icon menu open", async ({ page }) => {
  await page.goto("/");
  const iconMenu = await rightClickFolder(page);
  const bounds = await iconMenu.boundingBox();
  if (!bounds) throw new Error("Folder context menu has no visible bounds");

  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    { button: "right" }
  );

  await expect(iconMenu).toBeVisible();
  await expect(page.getByRole("menu", { name: "启动台菜单", exact: true })).toHaveCount(0);
});

test("left-clicking outside an icon menu closes it without passing through", async ({ page }) => {
  await page.goto("/");
  const iconMenu = await rightClickFolder(page);
  const point = await getDesktopSurfacePoint(page);

  await page.mouse.click(point.x, point.y);

  await expect(iconMenu).toBeHidden();
  await expect(page.locator(".launchpad-root")).toBeVisible();
});

test("search blank space suppresses the surface menu while search icons remain routable", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "搜索应用" });
  await search.fill("no-match-for-context-menu");
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  const point = await getDesktopSurfacePoint(page);
  await page.mouse.click(point.x, point.y, { button: "right" });

  await expect(page.locator("[role='menu']:visible")).toHaveCount(0);
  await expect(search).toHaveValue("no-match-for-context-menu");
});

test("folder icon, blank panel, and outside context menus keep their scopes separate", async ({ page }) => {
  await page.goto("/");
  const { menu: iconMenu, point: iconPoint } = await rightClickFolderChild(page);
  const label = await iconMenu.getAttribute("aria-label");

  await page.mouse.click(iconPoint.x, iconPoint.y, { button: "right" });
  await expect(iconMenu).toHaveAttribute("aria-label", label);
  await expect(page.getByRole("menu", { name: "启动台菜单", exact: true })).toHaveCount(0);

  await page.keyboard.press("Escape");
  const outsidePoint = await getDesktopSurfacePoint(page);
  await page.mouse.click(outsidePoint.x, outsidePoint.y, { button: "right" });
  await expect(page.locator("[role='menu']:visible")).toHaveCount(0);
  await expect(page.locator("input.pixi-folder-name-input")).toBeVisible();

  const folderMenu = await rightClickFolderBlank(page);
  await expect(folderMenu.getByRole("menuitem", { name: "批量管理", exact: true })).toBeVisible();
  await expect(folderMenu.getByRole("menuitem")).toHaveCount(1);
  await expect(page.getByRole("menu", { name: "启动台菜单", exact: true })).toHaveCount(0);
  await expect(page.locator("input.pixi-folder-name-input")).toBeVisible();

  await folderMenu.getByRole("menuitem", { name: "批量管理", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "批量管理", exact: true })).toBeVisible();
  await expect(page.locator("input.pixi-folder-name-input")).toBeVisible();
});

test("blank-area context menu routes rearrange to the existing confirmation", async ({ page }) => {
  await page.goto("/");
  const menu = await rightClickDesktopSurface(page);
  await menu.getByRole("menuitem", { name: "重新整理", exact: true }).click();

  await expect(menu).toBeHidden();
  const dialog = page.getByRole("alertdialog", { name: "重新整理桌面页面？" });
  await expect(dialog).toBeVisible();
  const point = await getDesktopSurfacePoint(page);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(page.locator("[role='menu']:visible")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.mouse.click(point.x, point.y);
  await expect(dialog).toBeHidden();
});

test("blank-area context menu follows the selected light palette", async ({ page }) => {
  await page.goto("/");
  await applySettingsTheme(page, "浅色");
  const menu = await rightClickDesktopSurface(page);
  const theme = await readSurfaceContextMenuTheme(menu);

  expect(theme).toMatchObject({
    colorScheme: "light",
    itemBackgroundHover: "#f5f5f5",
    itemForeground: "#424242",
    menuBackground: "#ffffff",
    menuShadow: "0 0 2px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.14)",
    menuStroke: "rgba(0, 0, 0, 0.12)",
    theme: "light",
  });
});

test("blank-area context menu is limited to the desktop main rectangle", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas.pixi-launchpad-canvas");
  const main = page.locator(".desktop-main");
  const mainBounds = await main.boundingBox();
  if (!mainBounds) throw new Error("Pixi desktop main has no visible bounds");

  const result = await canvas.evaluate((element, bounds) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
      clientX: bounds.x,
      clientY: bounds.y - 1,
    });
    const dispatchReturned = element.dispatchEvent(event);
    return {
      defaultPrevented: event.defaultPrevented,
      dispatchReturned,
    };
  }, mainBounds);

  expect(result).toEqual({ defaultPrevented: true, dispatchReturned: false });
  await expect(page.getByRole("menu", { name: "启动台菜单", exact: true })).toHaveCount(0);
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

test("launchpad chrome routes background context menus while preserving buttons and editable fields", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".launchpad-header")).toBeVisible();
  await expect(page.locator(".page-dots")).toBeVisible();

  async function dispatchContextMenu(selector) {
    return page.locator(selector).first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      const dispatchReturned = element.dispatchEvent(event);
      return {
        defaultPrevented: event.defaultPrevented,
        dispatchReturned,
      };
    });
  }

  const surfaceMenu = page.getByRole("menu", { name: "启动台菜单", exact: true });
  expect(await dispatchContextMenu(".launchpad-header")).toEqual({
    defaultPrevented: true,
    dispatchReturned: false,
  });
  await expect(surfaceMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(surfaceMenu).toBeHidden();

  expect(await dispatchContextMenu(".page-dots")).toEqual({
    defaultPrevented: true,
    dispatchReturned: false,
  });
  await expect(surfaceMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(surfaceMenu).toBeHidden();

  expect(await dispatchContextMenu(".settings-button")).toEqual({
    defaultPrevented: true,
    dispatchReturned: false,
  });
  expect(await dispatchContextMenu(".page-dot")).toEqual({
    defaultPrevented: true,
    dispatchReturned: false,
  });
  await expect(surfaceMenu).toHaveCount(0);

  expect(await dispatchContextMenu(".search-input")).toEqual({
    defaultPrevented: false,
    dispatchReturned: true,
  });
  await expect(surfaceMenu).toHaveCount(0);
});
