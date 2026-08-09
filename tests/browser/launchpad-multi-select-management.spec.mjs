import { expect, test } from "@playwright/test";

test.use({ locale: "zh-CN" });

async function waitForFixture(page) {
  await page.goto("/?fixture=multi-select");
  await page.waitForFunction(() => {
    const state = document.querySelector("#app")?.__vue_app__?._instance?.setupState;
    return document.querySelector('[data-launchpad-fixture="multi-select"]') &&
      state?.activePages?.length === 3 &&
      state.activePages[0]?.length === 35;
  });
  await waitForIconBounds(page, "app-0-safari");
}

async function waitForIconBounds(page, id) {
  await page.waitForFunction((iconId) => {
    const state = document.querySelector("#app")?.__vue_app__?._instance?.setupState;
    const location = state?.activePages
      ?.flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
      .find((entry) => entry.item.id === iconId);
    return Boolean(location && state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: iconId,
      pageIndex: location.pageIndex,
    }));
  }, id);
}

async function dispatchIconPointer(page, id, options = {}) {
  await waitForIconBounds(page, id);
  return page.evaluate(({ iconId, pointerId, type }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const location = state.activePages
      .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
      .find((entry) => entry.item.id === iconId);
    if (!location) throw new Error(`Missing desktop fixture icon: ${iconId}`);
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: iconId,
      pageIndex: location.pageIndex,
    });
    if (!bounds) throw new Error(`Missing rendered fixture bounds: ${iconId}`);
    const clientX = (bounds.left + bounds.right) / 2;
    const clientY = (bounds.top + bounds.bottom) / 2;
    const target = document.elementFromPoint(clientX, clientY);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX,
      clientY,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    };
    if (type === "contextmenu") {
      const event = new MouseEvent("contextmenu", {
        ...init,
        button: 2,
        buttons: 2,
      });
      target.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented };
    }
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
    return { clientX, clientY };
  }, {
    iconId: id,
    pointerId: options.pointerId || 31,
    type: options.type || "click",
  });
}

async function dispatchSurfaceContextMenu(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".pixi-desktop-host");
    const main = document.querySelector("main.desktop-main");
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    if (!host || !main) throw new Error("Missing desktop surface host");
    const rect = main.getBoundingClientRect();
    const candidates = [
      [0.94, 0.92],
      [0.88, 0.88],
      [0.94, 0.76],
      [0.82, 0.92],
      [0.76, 0.84],
    ];
    const point = candidates
      .map(([xRatio, yRatio]) => ({
        x: rect.left + rect.width * xRatio,
        y: rect.top + rect.height * yRatio,
      }))
      .find(({ x, y }) => {
        const hit = state.iconBoundsRegistry.getAtPoint("launch", x, y, { area: "desktop" });
        return !hit || hit.meta?.pageIndex !== state.activePageIndex;
      });
    if (!point) throw new Error("Could not find a blank desktop surface point");
    const { x: clientX, y: clientY } = point;
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
      clientX,
      clientY,
      view: window,
    });
    host.dispatchEvent(event);
    return { clientX, clientY, defaultPrevented: event.defaultPrevented };
  });
}

async function readManagementState(page) {
  return page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return {
      batch: state.isBatchSelectionActive,
      edit: state.isEditMode,
      frozen: state.isBatchSelectionFrozen,
      pageSizes: state.activePages.map((items) => items.length),
      selectedIds: [...state.batchSelectedIds],
    };
  });
}

test("surface batch entry and app-on-app group drop stay atomic", async ({ page }) => {
  await waitForFixture(page);

  await dispatchIconPointer(page, "app-0-safari", {
    pointerId: 41,
    type: "contextmenu",
  });
  await expect(page.locator("fluent-menu-item").filter({ hasText: "批量管理" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await dispatchSurfaceContextMenu(page);
  await page.locator("fluent-menu-item").filter({ hasText: "批量管理" }).click();
  await expect.poll(async () => (await readManagementState(page)).batch).toBe(true);
  await expect.poll(async () => (await readManagementState(page)).selectedIds).toEqual([]);

  await dispatchIconPointer(page, "app-0-safari", { pointerId: 41 });
  await expect.poll(async () => (await readManagementState(page)).selectedIds).toEqual([
    "app-0-safari",
  ]);

  await dispatchIconPointer(page, "app-1-mail", { pointerId: 42 });
  await expect.poll(async () => (await readManagementState(page)).selectedIds).toEqual([
    "app-0-safari",
    "app-1-mail",
  ]);
  await waitForIconBounds(page, "app-0-safari");
  await waitForIconBounds(page, "app-2-photos");

  const result = await page.evaluate(async () => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const getBounds = (id) => state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id,
      pageIndex: 0,
    });
    const leadBounds = getBounds("app-0-safari");
    const targetBounds = getBounds("app-2-photos");
    const leadX = (leadBounds.left + leadBounds.right) / 2;
    const leadY = (leadBounds.top + leadBounds.bottom) / 2;
    const targetX = (targetBounds.left + targetBounds.right) / 2;
    const targetY = (targetBounds.top + targetBounds.bottom) / 2;
    const target = document.elementFromPoint(leadX, leadY);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: leadX,
      clientY: leadY,
      isPrimary: true,
      pointerId: 43,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    await wait(540);
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: targetX,
      clientY: targetY,
    }));
    await wait(100);
    const beforeRelease = {
      intent: state.groupDragState?.intent,
      projected: state.groupDragState?.projectedPages,
      status: state.groupDragState?.dropStatus,
    };
    window.dispatchEvent(new PointerEvent("pointerup", {
      ...init,
      buttons: 0,
      clientX: targetX,
      clientY: targetY,
    }));
    await wait(850);
    const folder = state.activePages
      .flat()
      .find((item) => item.type === "folder" &&
        item.children?.some((child) => child.id === "app-2-photos"));
    const allIds = state.activePages.flatMap((items) => items.flatMap((item) => [
      item.id,
      ...(item.children || []).map((child) => child.id),
    ]));
    return {
      batch: state.isBatchSelectionActive,
      beforeRelease,
      duplicateIds: [...new Set(allIds.filter((id, index) => allIds.indexOf(id) !== index))],
      folderChildren: folder?.children?.map((child) => child.id) || [],
      groupEnded: state.groupDragState == null,
      openFolderId: state.openFolderId,
      selectedIds: [...state.batchSelectedIds],
    };
  });

  expect(result.beforeRelease).toEqual({
    intent: {
      targetAppId: "app-2-photos",
      type: "app-folder-create",
    },
    projected: null,
    status: "accepted",
  });
  expect(result.folderChildren).toEqual([
    "app-2-photos",
    "app-0-safari",
    "app-1-mail",
  ]);
  expect(result.duplicateIds).toEqual([]);
  expect(result.groupEnded).toBe(true);
  expect(result.batch).toBe(true);
  expect(result.openFolderId).toBeNull();
  expect(result.selectedIds).toEqual([]);
});

test("top cancel zone and Escape return a batch drag without changing layout", async ({ page }) => {
  await waitForFixture(page);
  await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    state.enterBatchSelection();
  });
  await dispatchIconPointer(page, "app-0-safari", { pointerId: 71 });
  await dispatchIconPointer(page, "app-1-mail", { pointerId: 72 });

  const zoneResult = await page.evaluate(async () => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const before = JSON.stringify(state.activePages);
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: "app-0-safari",
      pageIndex: 0,
    });
    const start = {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    };
    const target = document.elementFromPoint(start.x, start.y);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: start.x,
      clientY: start.y,
      isPrimary: true,
      pointerId: 73,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    await wait(540);
    const toolbar = document.querySelector(".launchpad-selection-toolbar-cancel-active");
    if (!toolbar) throw new Error("Batch cancel zone did not replace the selection toolbar");
    const toolbarRect = toolbar.getBoundingClientRect();
    const cancelPoint = {
      x: toolbarRect.left + toolbarRect.width / 2,
      y: toolbarRect.top + toolbarRect.height / 2,
    };
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: cancelPoint.x,
      clientY: cancelPoint.y,
    }));
    await wait(80);
    const armed = {
      cancelArmed: state.groupDragState?.cancelArmed,
      dropStatus: state.groupDragState?.dropStatus,
      text: toolbar.textContent,
    };
    window.dispatchEvent(new PointerEvent("pointerup", {
      ...init,
      buttons: 0,
      clientX: cancelPoint.x,
      clientY: cancelPoint.y,
    }));
    await wait(20);
    const release = {
      cancelSource: state.groupDragState?.cancelSource,
      modes: state.groupDragState?.releasePlan?.entries?.map((entry) => entry.mode) || [],
      phase: state.groupDragState?.phase,
    };
    await wait(450);
    return {
      armed,
      batch: state.isBatchSelectionActive,
      frozen: state.isBatchSelectionFrozen,
      groupEnded: state.groupDragState == null,
      layoutUnchanged: JSON.stringify(state.activePages) === before,
      release,
      selectedIds: [...state.batchSelectedIds],
    };
  });

  expect(zoneResult.armed).toMatchObject({
    cancelArmed: true,
    dropStatus: "cancel",
  });
  expect(zoneResult.armed.text).toContain("松开以取消本次拖拽");
  expect(zoneResult.release).toMatchObject({
    cancelSource: "drop-zone",
    phase: "cancelling",
  });
  expect(zoneResult.release.modes.every((mode) => mode === "return-to-origin")).toBe(true);
  expect(zoneResult).toMatchObject({
    batch: true,
    frozen: false,
    groupEnded: true,
    layoutUnchanged: true,
    selectedIds: ["app-0-safari", "app-1-mail"],
  });

  const escapeResult = await page.evaluate(async () => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const before = JSON.stringify(state.activePages);
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: "app-0-safari",
      pageIndex: 0,
    });
    const start = {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    };
    const target = document.elementFromPoint(start.x, start.y);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: start.x,
      clientY: start.y,
      isPrimary: true,
      pointerId: 74,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    await wait(540);
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: start.x + 90,
      clientY: start.y + 40,
    }));
    await wait(60);
    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Escape",
      key: "Escape",
    });
    window.dispatchEvent(escape);
    await wait(20);
    const release = {
      cancelSource: state.groupDragState?.cancelSource,
      phase: state.groupDragState?.phase,
    };
    await wait(450);
    return {
      batch: state.isBatchSelectionActive,
      defaultPrevented: escape.defaultPrevented,
      groupEnded: state.groupDragState == null,
      layoutUnchanged: JSON.stringify(state.activePages) === before,
      release,
      selectedIds: [...state.batchSelectedIds],
    };
  });

  expect(escapeResult).toMatchObject({
    batch: true,
    defaultPrevented: true,
    groupEnded: true,
    layoutUnchanged: true,
    release: {
      cancelSource: "keyboard",
      phase: "cancelling",
    },
    selectedIds: ["app-0-safari", "app-1-mail"],
  });
});

test("Alt quick edit remains mutually exclusive with batch deletion", async ({ page }) => {
  await waitForFixture(page);

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      cancelable: true,
      code: "AltLeft",
      key: "Alt",
    }));
  });
  await expect.poll(async () => (await readManagementState(page)).edit).toBe(true);

  const contextResult = await dispatchIconPointer(page, "app-0-safari", {
    pointerId: 51,
    type: "contextmenu",
  });
  expect(contextResult.defaultPrevented).toBe(true);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", {
      bubbles: true,
      cancelable: true,
      code: "AltLeft",
      key: "Alt",
    }));
  });
  await expect.poll(async () => (await readManagementState(page)).edit).toBe(false);

  await dispatchIconPointer(page, "app-0-safari", {
    pointerId: 52,
    type: "contextmenu",
  });
  await expect(page.locator("fluent-menu-item").filter({ hasText: "批量管理" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await dispatchSurfaceContextMenu(page);
  await page.locator("fluent-menu-item").filter({ hasText: "批量管理" }).click();
  await dispatchIconPointer(page, "app-0-safari", { pointerId: 52 });
  await dispatchIconPointer(page, "app-1-mail", { pointerId: 53 });
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      cancelable: true,
      code: "AltLeft",
      key: "Alt",
    }));
  });
  await page.waitForTimeout(570);
  expect(await readManagementState(page)).toMatchObject({
    batch: true,
    edit: false,
    selectedIds: ["app-0-safari", "app-1-mail"],
  });
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", {
      bubbles: true,
      cancelable: true,
      code: "AltLeft",
      key: "Alt",
    }));
  });

  await page.getByRole("button", { exact: true, name: "删除" }).click();
  const dialog = page.getByRole("alertdialog", { name: "删除所选应用？" });
  await expect(dialog).toContainText("所选的 2 个应用");
  await dialog.locator("fluent-button").filter({ hasText: "删除" }).click();
  await expect.poll(async () => readManagementState(page)).toMatchObject({
    batch: false,
    pageSizes: [33, 35, 28],
    selectedIds: [],
  });
});

test("reduced motion rejects an invalid group drop without stagger", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForFixture(page);
  await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    state.enterBatchSelection(state.activePages[0][0]);
  });
  await dispatchIconPointer(page, "app-1-mail", { pointerId: 61 });

  const result = await page.evaluate(async () => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: "app-0-safari",
      pageIndex: 0,
    });
    const clientX = (bounds.left + bounds.right) / 2;
    const clientY = (bounds.top + bounds.bottom) / 2;
    const target = document.elementFromPoint(clientX, clientY);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX,
      clientY,
      isPrimary: true,
      pointerId: 62,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    await wait(540);
    const reducedMotion = state.groupDragState?.reducedMotion;
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: -80,
      clientY: -80,
    }));
    await wait(70);
    const rejected = {
      phase: state.groupDragState?.phase,
      reason: state.groupDragState?.dropReason,
      status: state.groupDragState?.dropStatus,
    };
    window.dispatchEvent(new PointerEvent("pointerup", {
      ...init,
      buttons: 0,
      clientX: -80,
      clientY: -80,
    }));
    await wait(50);
    return {
      frozen: state.isBatchSelectionFrozen,
      groupEnded: state.groupDragState == null,
      reducedMotion,
      rejected,
      selectedIds: [...state.batchSelectedIds],
    };
  });

  expect(result).toEqual({
    frozen: false,
    groupEnded: true,
    reducedMotion: true,
    rejected: {
      phase: "dragging",
      reason: "invalid-target",
      status: "rejected",
    },
    selectedIds: ["app-0-safari", "app-1-mail"],
  });
});
