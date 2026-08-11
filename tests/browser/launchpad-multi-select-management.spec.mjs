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
    const releaseDeadline = performance.now() + 3_000;
    while (state.groupDragState && performance.now() < releaseDeadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
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
    const settleDeadline = performance.now() + 3_000;
    while (state.groupDragState && performance.now() < settleDeadline) await wait(16);
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
    const settleDeadline = performance.now() + 3_000;
    while (state.groupDragState && performance.now() < settleDeadline) await wait(16);
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

test("responsive full-page return keeps the visual pose continuous and fades labels in", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 800 });
  await waitForFixture(page);

  const result = await page.evaluate(async () => {
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const root = document.querySelector("#app")?.__vue_app__?._instance;
    const state = root?.setupState;
    const seen = new Set();
    const findDesktopLayer = (vnode) => {
      if (!vnode) return null;
      const instance = vnode.component;
      if (instance && !seen.has(instance)) {
        seen.add(instance);
        const name = instance.type?.name || instance.type?.__name;
        if (name === "PixiDesktopSurface") return instance.setupState?.layer || null;
        const nested = findDesktopLayer(instance.subTree);
        if (nested) return nested;
      }
      if (Array.isArray(vnode.children)) {
        for (const child of vnode.children) {
          const nested = findDesktopLayer(child);
          if (nested) return nested;
        }
      }
      return null;
    };
    const layer = findDesktopLayer(root?.subTree);
    if (!state || !layer?.groupDragLayer) throw new Error("Pixi desktop group layer is unavailable");

    state.enterBatchSelection();
    await frame();
    state.selectCurrentBatchScope();
    await frame();
    const selectedIds = [...state.batchSelectedIds];
    const leadId = selectedIds[0];
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: leadId,
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
      pointerId: 81,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    await wait(540);
    const dragIconSize = layer.groupDragLayer.nodes[0]?.iconSize || 0;
    const invalidPoint = { x: -80, y: -80 };
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: invalidPoint.x,
      clientY: invalidPoint.y,
    }));
    await wait(80);
    window.dispatchEvent(new PointerEvent("pointerup", {
      ...init,
      buttons: 0,
      clientX: invalidPoint.x,
      clientY: invalidPoint.y,
    }));

    const readWorldIconSize = (node) => {
      const visual = node?.visualWrap || node;
      const matrix = visual?.worldTransform;
      if (!matrix) return null;
      return Number(node.iconSize) * Math.hypot(Number(matrix.a), Number(matrix.b));
    };
    const readVisualCenter = (node) => {
      const visual = node?.visualWrap || node;
      const center = layer.groupDragLayer.toLocal({ x: 0, y: 0 }, visual);
      return { x: center.x, y: center.y };
    };
    const pointDistance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
    let lastReleaseWorldSize = null;
    let lastReleaseScale = null;
    let releaseEntryCount = 0;
    let releaseIds = [];
    const reachedTargetIds = new Set();
    const ownershipRegressions = [];
    const deadline = performance.now() + 5_000;
    while (state.groupDragState && performance.now() < deadline) {
      await frame();
      const group = state.groupDragState;
      if (!group) break;
      releaseEntryCount = Math.max(releaseEntryCount, group.entries?.length || 0);
      releaseIds = group.entries?.map((entry) => entry.item?.id).filter(Boolean) || releaseIds;
      group.entries?.forEach((entry, entryIndex) => {
        const releaseGhost = layer.groupDragLayer.nodes[entryIndex];
        const liveTarget = layer.findIconNodeByItemId(entry.item?.id);
        if (!releaseGhost || !liveTarget) return;
        const delta = pointDistance(readVisualCenter(releaseGhost), readVisualCenter(liveTarget));
        if (delta <= 1) reachedTargetIds.add(entry.item.id);
        else if (reachedTargetIds.has(entry.item.id) && delta > 6) {
          ownershipRegressions.push({ delta, id: entry.item.id });
        }
      });
      const index = group.entries?.findIndex((entry) => entry.item?.id === leadId) ?? -1;
      const releaseNode = index >= 0 ? layer.groupDragLayer.nodes[index] : null;
      if (releaseNode?.visible) {
        lastReleaseWorldSize = readWorldIconSize(releaseNode);
        lastReleaseScale = releaseNode.scale.x;
      }
    }
    await frame();
    const liveNode = layer.findIconNodeByItemId(leadId);
    const handoffCenterMaxDelta = Math.max(...releaseIds.map((id, index) => {
      const releaseGhost = layer.groupDragLayer.nodes[index];
      const liveTarget = layer.findIconNodeByItemId(id);
      return pointDistance(readVisualCenter(releaseGhost), readVisualCenter(liveTarget));
    }));
    const readLabelAlphas = () => releaseIds.map(
      (id) => Number(layer.findIconNodeByItemId(id)?.labelText?.alpha)
    );
    const firstLabelAlphas = readLabelAlphas();
    let finalLabelAlphas = firstLabelAlphas;
    let sawPartialLabelAlpha = finalLabelAlphas.some((alpha) => alpha > 0 && alpha < 1);
    const labelDeadline = performance.now() + 1_000;
    while (Math.min(...finalLabelAlphas) < 0.999 && performance.now() < labelDeadline) {
      await frame();
      finalLabelAlphas = readLabelAlphas();
      sawPartialLabelAlpha ||= finalLabelAlphas.some((alpha) => alpha > 0 && alpha < 1);
    }
    return {
      dragIconSize,
      finalLabelAlphaMin: Math.min(...finalLabelAlphas),
      firstLabelAlphaMax: Math.max(...firstLabelAlphas),
      groupEnded: state.groupDragState == null,
      handoffCenterMaxDelta,
      lastReleaseScale,
      lastReleaseWorldSize,
      liveIconSize: liveNode?.iconSize || 0,
      liveWorldSize: readWorldIconSize(liveNode),
      ownershipRegressions,
      releaseEntryCount,
      sawPartialLabelAlpha,
      selectedCount: selectedIds.length,
    };
  });

  expect(result).toMatchObject({
    dragIconSize: 64,
    groupEnded: true,
    releaseEntryCount: 33,
    selectedCount: 33,
  });
  expect(result.liveIconSize).toBeLessThan(result.dragIconSize);
  expect(result.lastReleaseScale).toBeLessThan(1);
  expect(Math.abs(result.lastReleaseWorldSize - result.liveWorldSize)).toBeLessThan(0.5);
  expect(result.handoffCenterMaxDelta).toBeLessThan(0.5);
  expect(result.ownershipRegressions).toEqual([]);
  expect(result.firstLabelAlphaMax).toBeLessThan(0.05);
  expect(result.sawPartialLabelAlpha).toBe(true);
  expect(result.finalLabelAlphaMin).toBeGreaterThan(0.99);
});
