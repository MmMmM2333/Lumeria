import { expect, test } from "@playwright/test";

test.use({ locale: "zh-CN" });

async function waitForFixture(page) {
  await page.goto(`/?fixture=multi-select&group-release=${Date.now()}`);
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
    if (!location) throw new Error(`Missing icon: ${iconId}`);
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: iconId,
      pageIndex: location.pageIndex,
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
      pointerId,
      pointerType: "mouse",
      view: window,
    };
    if (type === "contextmenu") {
      target.dispatchEvent(new MouseEvent("contextmenu", {
        ...init,
        button: 2,
        buttons: 2,
      }));
      return;
    }
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
  }, {
    iconId: id,
    pointerId: options.pointerId || 31,
    type: options.type || "click",
  });
}

async function enterBatchSelectionOf(page, ids) {
  await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    state.enterBatchSelection();
  });
  await page.waitForTimeout(50);
  await expect.poll(async () => page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return Boolean(state.isBatchSelectionActive);
  })).toBe(true);
  for (let index = 0; index < ids.length; index += 1) {
    await dispatchIconPointer(page, ids[index], { pointerId: 41 + index });
  }
  await expect.poll(async () => page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return [...state.batchSelectedIds];
  })).toEqual(ids);
}

async function enterBatchSelection(page) {
  await enterBatchSelectionOf(page, ["app-0-safari", "app-1-mail"]);
}

async function createSmallFolder(page) {
  await enterBatchSelection(page);
  await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    state.createFolderFromBatchSelection();
  });
  await page.waitForFunction(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.activePages.flat().some((item) => item.type === "folder" && item.children?.length === 2);
  });
  await page.waitForFunction(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return !state.groupDragState;
  }, null, { timeout: 4_000 });
  const result = await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return {
      batch: state.isBatchSelectionActive,
      folderId: state.activePages.flat()
        .find((item) => item.type === "folder" && item.children?.length === 2)?.id || null,
      openFolderId: state.openFolderId,
      selectedIds: [...state.batchSelectedIds],
    };
  });
  if (!result.folderId) throw new Error("small test folder was not created");
  expect(result).toMatchObject({
    batch: true,
    openFolderId: null,
    selectedIds: [],
  });
  await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    state.clearBatchSelection();
    state.commitActivePageIndex(0);
  });
  await page.waitForTimeout(500);
  return result.folderId;
}

async function readReleasePlan(page) {
  return page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const plan = state.groupDragState?.runtimePlan;
    return plan
      ? {
        key: plan.key,
        entries: plan.entries?.map((entry) => ({
          id: entry.id,
          mode: entry.mode,
          target: entry.target,
        })) || [],
        status: state.groupDragState.runtimeStatus,
      }
      : null;
  });
}

async function dragIconToFolder(page, sourceId, folderId, pointerId) {
  await waitForIconBounds(page, sourceId);
  await waitForIconBounds(page, folderId);
  const points = await page.evaluate(({ sourceId: source, folderId: folder }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const center = (id) => {
      const location = state.activePages
        .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
        .find((entry) => entry.item.id === id);
      const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "desktop",
        id,
        pageIndex: location.pageIndex,
      });
      return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    };
    return { source: center(source), folder: center(folder) };
  }, { sourceId, folderId });

  await page.evaluate(({ point, pointerId }) => {
    const target = document.elementFromPoint(point.x, point.y);
    if (!target) throw new Error(`Pointer start target is outside the viewport: ${JSON.stringify(point)}`);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
  }, { point: points.source, pointerId });
  await page.waitForTimeout(560);
  // The first post-hold move arms the real drag. Move a short distance first,
  // then move onto the target so the drag offset is sampled at the source.
  const intermediate = {
    x: points.source.x + (points.folder.x - points.source.x) * 0.12,
    y: points.source.y + (points.folder.y - points.source.y) * 0.12,
  };
  await page.evaluate(({ point, pointerId }) => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point: intermediate, pointerId });
  await page.waitForTimeout(80);
  await page.evaluate(({ point, pointerId }) => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point: points.folder, pointerId });
  await page.waitForTimeout(120);
  await page.evaluate(({ point, pointerId }) => {
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point: points.folder, pointerId });
  await page.waitForFunction(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return Boolean(state.groupDragState?.runtimePlan);
  }, null, { timeout: 3_000 });
  const plan = await readReleasePlan(page);
  await page.waitForFunction(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return !state.groupDragState;
  }, null, { timeout: 3_000 });
  return plan;
}

async function dispatchDragPointer(page, type, point, pointerId) {
  await page.evaluate(({ point, pointerId, type }) => {
    const target = type === "pointerdown"
      ? document.elementFromPoint(point.x, point.y)
      : window;
    if (!target) throw new Error(`Pointer target is outside the viewport: ${JSON.stringify(point)}`);
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point, pointerId, type });
}

async function readDesktopIconCenter(page, id) {
  await waitForIconBounds(page, id);
  return page.evaluate((iconId) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const location = state.activePages
      .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
      .find((entry) => entry.item.id === iconId);
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id: iconId,
      pageIndex: location.pageIndex,
    });
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  }, id);
}

test("closed-folder releases use preview slots for the first nine and center absorb after them", async ({ page }) => {
  test.setTimeout(60_000);
  await waitForFixture(page);
  const folderId = await createSmallFolder(page);
  const sourceIds = [
    "app-2-photos",
    "app-3-music",
    "app-4-calendar",
    "app-5-maps",
    "app-6-messages",
    "app-7-notes",
    "app-8-reminders",
    "app-9-facetime",
  ];
  const plans = [];
  for (let index = 0; index < sourceIds.length; index += 1) {
    plans.push(await dragIconToFolder(page, sourceIds[index], folderId, 100 + index));
  }

  expect(plans.slice(0, 6).every((plan) => plan.entries[0]?.mode === "folder-preview-slot")).toBe(true);
  expect(plans[0].entries[0].target.slotIndex).toBe(2);
  expect(plans[5].entries[0].target.slotIndex).toBe(7);
  expect(plans[6].entries[0].mode).toBe("folder-preview-slot");
  expect(plans[6].entries[0].target.slotIndex).toBe(8);
  expect(plans[7].entries[0].mode).toBe("folder-center-absorb");
  await expect.poll(async () => page.evaluate(({ folderId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.activePages.flat().find((item) => item.id === folderId)?.children?.length || 0;
  }, { folderId })).toBe(10);
});

test("an auto-opened one-row folder waits for panel entry before closing and does not reopen", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const folderId = await createSmallFolder(page);
  const source = await readDesktopIconCenter(page, "app-2-photos");
  const folderPoint = await readDesktopIconCenter(page, folderId);
  const pointerId = 220;
  await dispatchDragPointer(page, "pointerdown", source, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", {
    x: source.x + (folderPoint.x - source.x) * 0.12,
    y: source.y + (folderPoint.y - source.y) * 0.12,
  }, pointerId);
  await page.waitForTimeout(80);
  await dispatchDragPointer(page, "pointermove", folderPoint, pointerId);

  await expect.poll(async () => page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.openFolderId;
  }), { timeout: 4_000 }).toBe(folderId);
  const geometry = await page.evaluate(({ folderPoint }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const rect = state.folderPanelRef?.getBoundingClientRect?.();
    if (!rect) throw new Error("Auto-opened folder panel bounds are unavailable");
    return {
      folderPointOutside: folderPoint.x < rect.left || folderPoint.x > rect.right ||
        folderPoint.y < rect.top || folderPoint.y > rect.bottom,
      inside: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      outside: {
        x: rect.left > 100 ? rect.left - 80 : rect.right + 80,
        y: rect.top + rect.height / 2,
      },
    };
  }, { folderPoint });
  expect(geometry.folderPointOutside).toBe(true);

  await dispatchDragPointer(page, "pointermove", {
    x: folderPoint.x + 1,
    y: folderPoint.y,
  }, pointerId);
  await page.waitForTimeout(120);
  expect(await page.evaluate(({ folderId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.openFolderId === folderId && state.isFolderClosing === false;
  }, { folderId })).toBe(true);

  await dispatchDragPointer(page, "pointermove", geometry.inside, pointerId);
  await page.waitForTimeout(100);
  await dispatchDragPointer(page, "pointermove", geometry.outside, pointerId);
  await expect.poll(async () => page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.openFolderId;
  })).toBeNull();
  await page.waitForTimeout(1_400);
  expect(await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return {
      active: state.isFolderLayerActive,
      openFolderId: state.openFolderId,
      renderedFolderId: state.renderedFolder?.id || null,
    };
  })).toEqual({ active: false, openFolderId: null, renderedFolderId: null });
  await dispatchDragPointer(page, "pointercancel", geometry.outside, pointerId);
});

test("a selected group can leave an open folder and commit onto the desktop", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const setup = await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const folder = state.activePages.flat().find((item) => item.id === "folder-creative-lab");
    const childIds = folder?.children?.slice(0, 2).map((item) => item.id) || [];
    if (childIds.length !== 2) throw new Error("Creative Lab needs two fixture children");
    state.commitOpenFolder(folder.id);
    return { childIds, folderId: folder.id };
  });
  await expect.poll(async () => page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.openFolderId;
  })).toBe(setup.folderId);
  await page.waitForFunction(({ childIds, folderId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return childIds.every((id) => state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "folder",
      folderId,
      id,
      pageIndex: 0,
    }));
  }, setup);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    state.enterBatchSelection();
  });
  await page.waitForTimeout(50);
  for (let index = 0; index < setup.childIds.length; index += 1) {
    await page.evaluate(({ folderId, id, pointerId }) => {
      const state = document.querySelector("#app").__vue_app__._instance.setupState;
      const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "folder",
        folderId,
        id,
        pageIndex: 0,
      });
      const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      const target = document.elementFromPoint(point.x, point.y);
      const init = {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId,
        pointerType: "mouse",
        view: window,
      };
      target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
      target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
    }, { folderId: setup.folderId, id: setup.childIds[index], pointerId: 230 + index });
  }
  await expect.poll(async () => page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return [...state.batchSelectedIds];
  })).toEqual(setup.childIds);

  const drag = await page.evaluate(({ childIds, folderId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "folder",
      folderId,
      id: childIds[0],
      pageIndex: 0,
    });
    const panel = state.folderPanelRef?.getBoundingClientRect?.();
    if (!panel) throw new Error("Open folder panel bounds are unavailable");
    return {
      outside: {
        x: panel.left > 48 ? panel.left - 24 : panel.right + 24,
        y: panel.top + panel.height / 2,
      },
      source: { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
    };
  }, setup);
  const pointerId = 240;
  await dispatchDragPointer(page, "pointerdown", drag.source, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", {
    x: drag.source.x + 12,
    y: drag.source.y + 4,
  }, pointerId);
  await page.waitForTimeout(80);
  await dispatchDragPointer(page, "pointermove", drag.outside, pointerId);
  await expect.poll(async () => page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.openFolderId;
  })).toBeNull();
  await expect.poll(async () => page.evaluate(() => {
    const group = document.querySelector("#app").__vue_app__._instance.setupState.groupDragState;
    return {
      reason: group?.intentPlan?.reason || null,
      status: group?.intentPlan?.status || null,
      type: group?.intent?.type || null,
    };
  })).toEqual({ reason: null, status: "accepted", type: "desktop-slot" });
  await dispatchDragPointer(page, "pointerup", drag.outside, pointerId);
  await page.waitForFunction(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return !state.groupDragState;
  }, null, { timeout: 5_000 });

  const result = await page.evaluate(({ childIds, folderId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const folder = state.activePages.flat().find((item) => item.id === folderId);
    return {
      folderChildren: folder?.children?.map((item) => item.id) || [],
      openFolderId: state.openFolderId,
      topLevelIds: state.activePages.flat().map((item) => item.id),
    };
  }, setup);
  expect(result.openFolderId).toBeNull();
  expect(result.topLevelIds).toEqual(expect.arrayContaining(setup.childIds));
  expect(result.folderChildren.filter((id) => setup.childIds.includes(id))).toEqual([]);
  await expect.poll(async () => page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.isFolderLayerActive;
  })).toBe(false);
});

test("canceling a mixed desktop and folder-child drag restores the projected folder shell", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 800 });
  await waitForFixture(page);
  await enterBatchSelectionOf(page, ["app-4-calendar", "app-5-maps"]);
  await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    state.createFolderFromBatchSelection();
  });
  await page.waitForFunction(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return !state.groupDragState && state.activePages[0]?.some((item) =>
      item.type === "folder" &&
      item.children?.some((child) => child.id === "app-4-calendar") &&
      item.children?.some((child) => child.id === "app-5-maps")
    );
  }, null, { timeout: 5_000 });
  const setup = await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const folderIndex = state.activePages[0].findIndex((item) =>
      item.type === "folder" &&
      item.children?.some((child) => child.id === "app-4-calendar") &&
      item.children?.some((child) => child.id === "app-5-maps")
    );
    const folder = state.activePages[0][folderIndex];
    return { folderId: folder?.id || null, folderIndex };
  });
  expect(setup).toMatchObject({ folderIndex: 4 });
  expect(setup.folderId).toBeTruthy();

  await dispatchIconPointer(page, "app-2-photos", { pointerId: 260 });
  await dispatchIconPointer(page, "app-3-music", { pointerId: 261 });
  await page.evaluate((folderId) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    state.commitOpenFolder(folderId);
  }, setup.folderId);
  await page.waitForFunction(({ childId, folderId }) => {
    const state = document.querySelector("#app")?.__vue_app__?._instance?.setupState;
    return state?.openFolderId === folderId && Boolean(state.iconBoundsRegistry.getBounds(
      "launch",
      "rendered",
      { area: "folder", folderId, id: childId, pageIndex: 0 }
    ));
  }, { childId: "app-4-calendar", folderId: setup.folderId });
  await page.waitForTimeout(900);
  await page.evaluate(({ childId, folderId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "folder",
      folderId,
      id: childId,
      pageIndex: 0,
    });
    const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const target = document.elementFromPoint(point.x, point.y);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId: 262,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
  }, { childId: "app-4-calendar", folderId: setup.folderId });
  await expect.poll(async () => page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return [...state.batchSelectedIds];
  })).toEqual(["app-2-photos", "app-3-music", "app-4-calendar"]);
  await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    state.commitOpenFolder(null);
  });
  await page.waitForFunction(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.openFolderId == null && state.isFolderLayerActive === false;
  }, null, { timeout: 5_000 });
  await waitForIconBounds(page, setup.folderId);
  await page.waitForFunction(({ childId, folderId }) => {
    const registry = document.querySelector("#app")?.__vue_app__?._instance?.setupState?.iconBoundsRegistry;
    const key = { childId, folderId, slotIndex: 0 };
    return Boolean(
      registry?.getBounds("previewChild", "stableStageLayout", key) &&
      registry?.getBounds("previewChild", "rendered", key)
    );
  }, { childId: "app-4-calendar", folderId: setup.folderId });
  await page.waitForTimeout(300);

  const result = await page.evaluate(async ({ folderId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const pageBefore = JSON.stringify(state.activePages[0]);
    const findFolderIndex = (pages = state.activePages) => pages[0]?.findIndex((item) => item.id === folderId) ?? -1;
    const readDesktopCenter = (id, variant = "rendered") => {
      const location = state.activePages
        .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
        .find((entry) => entry.item.id === id);
      const bounds = state.iconBoundsRegistry.getBounds("launch", variant, {
        area: "desktop",
        id,
        pageIndex: location.pageIndex,
      });
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    };
    const originalCenter = readDesktopCenter(folderId, "stableStageLayout");
    const source = readDesktopCenter("app-2-photos");
    const target = document.elementFromPoint(source.x, source.y);
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: source.x,
      clientY: source.y,
      isPrimary: true,
      pointerId: 263,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    await wait(540);
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: source.x + 14,
      clientY: source.y + 5,
    }));
    await wait(80);

    const cols = Math.max(1, Number(state.gridCols) || 1);
    const rows = Math.max(1, Number(state.gridRows) || 1);
    const firstCenter = readDesktopCenter(state.activePages[0][0].id);
    const secondCenter = readDesktopCenter(state.activePages[0][1].id);
    const nextRowCenter = readDesktopCenter(state.activePages[0][cols].id);
    const cellWidth = secondCenter.x - firstCenter.x;
    const cellHeight = nextRowCenter.y - firstCenter.y;
    const pageRect = {
      height: cellHeight * rows,
      left: firstCenter.x - cellWidth / 2,
      top: firstCenter.y - cellHeight / 2,
      width: cellWidth * cols,
    };
    const capacity = cols * rows;
    const candidateIndexes = [20, 27, 13, 10, 30, capacity - 2]
      .filter((index, position, items) => index > 4 && index < capacity && items.indexOf(index) === position);
    let projectedIndex = -1;
    let projectedIntent = null;
    for (const index of candidateIndexes) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const point = {
        x: pageRect.left + (col + 0.08) * (pageRect.width / cols),
        y: pageRect.top + (row + 0.5) * (pageRect.height / rows),
      };
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: point.x,
        clientY: point.y,
      }));
      await wait(140);
      projectedIndex = findFolderIndex(state.groupDragState?.projectedPages || []);
      projectedIntent = state.groupDragState?.intent?.type || null;
      if (projectedIndex === 2 && projectedIntent === "desktop-slot") break;
    }

    const toolbar = document.querySelector(".launchpad-selection-toolbar-cancel-active");
    if (!toolbar) throw new Error("Batch cancel zone is unavailable during the mixed-source drag");
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
    const cancelArmed = state.groupDragState?.cancelArmed === true;
    window.dispatchEvent(new PointerEvent("pointerup", {
      ...init,
      buttons: 0,
      clientX: cancelPoint.x,
      clientY: cancelPoint.y,
    }));
    const release = {
      outcome: state.groupDragState?.outcome || null,
      phase: state.groupDragState?.phase || null,
    };
    const releaseDeadline = performance.now() + 5_000;
    while (state.groupDragState && performance.now() < releaseDeadline) await frame();

    let finalCenter = readDesktopCenter(folderId);
    let finalDelta = Math.hypot(
      finalCenter.x - originalCenter.x,
      finalCenter.y - originalCenter.y
    );
    const layoutDeadline = performance.now() + 3_000;
    while (finalDelta > 0.75 && performance.now() < layoutDeadline) {
      await frame();
      finalCenter = readDesktopCenter(folderId);
      finalDelta = Math.hypot(
        finalCenter.x - originalCenter.x,
        finalCenter.y - originalCenter.y
      );
    }
    return {
      cancelArmed,
      finalDelta,
      finalFolderIndex: findFolderIndex(),
      groupEnded: state.groupDragState == null,
      layoutUnchanged: JSON.stringify(state.activePages[0]) === pageBefore,
      projectedIndex,
      projectedIntent,
      release,
      selectedIds: [...state.batchSelectedIds],
    };
  }, { folderId: setup.folderId });

  expect(result).toMatchObject({
    cancelArmed: true,
    finalFolderIndex: 4,
    layoutUnchanged: true,
    projectedIndex: 2,
    projectedIntent: "desktop-slot",
    release: { outcome: "cancelled", phase: "returning" },
    selectedIds: ["app-2-photos", "app-3-music", "app-4-calendar"],
  });
  expect(result.finalDelta).toBeLessThanOrEqual(0.75);
  expect(result.groupEnded).toBe(true);
});

test("created-folder release keeps the hover frame center continuous on pointerup", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const sourceId = "app-12-books";
  const targetId = "app-4-calendar";
  const pointerId = 240;
  const points = await page.evaluate(({ sourceId, targetId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const center = (id) => {
      const location = state.activePages
        .flatMap((items, pageIndex) => items.map((item) => ({ item, pageIndex })))
        .find((entry) => entry.item.id === id);
      const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "desktop",
        id,
        pageIndex: location.pageIndex,
      });
      return {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
    };
    return { source: center(sourceId), target: center(targetId) };
  }, { sourceId, targetId });

  await page.evaluate(({ point, pointerId }) => {
    const target = document.elementFromPoint(point.x, point.y);
    target.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));
  }, { point: points.source, pointerId });
  await page.waitForTimeout(560);
  const intermediate = {
    x: points.source.x + (points.target.x - points.source.x) * 0.12,
    y: points.source.y + (points.target.y - points.source.y) * 0.12,
  };
  for (const [point, delay] of [[intermediate, 80], [points.target, 160]]) {
    await page.evaluate(({ point, pointerId }) => {
      window.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        isPrimary: true,
        pointerId,
        pointerType: "mouse",
        view: window,
      }));
    }, { point, pointerId });
    await page.waitForTimeout(delay);
  }
  await page.waitForFunction((targetId) => {
    const state = document.querySelector("#app")?.__vue_app__?._instance?.setupState;
    return state?.dragFolderHoverState?.targetId === targetId;
  }, targetId);

  const continuity = await page.evaluate(async ({ point, pointerId, sourceId, targetId }) => {
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
    if (!layer?.groupDragLayer) throw new Error("Pixi desktop group layer is unavailable");

    const dragGroup = state.groupDragState;
    const sourceEntryIndex = dragGroup?.entries?.findIndex((entry) => entry.item?.id === sourceId) ?? -1;
    const sourceEntry = sourceEntryIndex >= 0 ? dragGroup.entries[sourceEntryIndex] : null;
    const sourceNodeBeforeRelease = sourceEntry?.actorKey
      ? layer.groupDragLayer.activeNodesByActorKey.get(sourceEntry.actorKey)
      : null;
    if (!sourceNodeBeforeRelease) throw new Error("Source actor node is not synchronized before release");
    const sourceCenterBeforeRelease = sourceNodeBeforeRelease
      ? layer.groupDragLayer.toLocal({ x: 0, y: 0 }, sourceNodeBeforeRelease.visualWrap)
      : null;
    let actorHandoff = null;
    const originalGroupLayerUpdate = layer.groupDragLayer.update;
    layer.groupDragLayer.update = function instrumentActorHandoff(nextState) {
      const result = originalGroupLayerUpdate.call(this, nextState);
      const nextGroup = nextState?.groupState;
      const releaseActorsReady = nextGroup?.phase === "releasing" &&
        this.activeNodesByActorKey.size === nextGroup.entries.length &&
        nextGroup.entries.every((entry) => this.activeNodesByActorKey.has(entry.actorKey));
      if (!actorHandoff && releaseActorsReady) {
        const nextIndex = nextGroup.entries.findIndex((entry) => entry.actorKey === sourceEntry?.actorKey);
        const nextNode = sourceEntry?.actorKey
          ? this.activeNodesByActorKey.get(sourceEntry.actorKey)
          : null;
        const nextCenter = nextNode
          ? this.toLocal({ x: 0, y: 0 }, nextNode.visualWrap)
          : null;
        actorHandoff = {
          actorOrder: nextGroup.entries.map((entry) => entry.actorKey),
          orderedNodeMatches: nextIndex >= 0 && this.nodes[nextIndex] === nextNode,
          centerDelta: sourceCenterBeforeRelease && nextCenter
            ? Math.hypot(
              nextCenter.x - sourceCenterBeforeRelease.x,
              nextCenter.y - sourceCenterBeforeRelease.y
            )
            : null,
          sameNode: nextNode === sourceNodeBeforeRelease,
        };
        this.update = originalGroupLayerUpdate;
      }
      return result;
    };

    const targetNode = layer.findIconNodeByItemId(targetId);
    const hoverCenter = layer.groupDragLayer.toLocal(
      { x: 0, y: 0 },
      targetNode?.folderCreateBackdrop || targetNode?.visualWrap || targetNode
    );

    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));

    return new Promise((resolve, reject) => {
      let frames = 0;
      let firstReleaseFrame = null;
      const ownershipViolations = [];
      const sample = () => {
        frames += 1;
        const frame = layer.groupDragLayer?.releaseController?.folderShellFrame;
        const group = state.groupDragState;
        const folderId = group?.semanticPlan?.effects?.createdFolderId;
        if (frame?.visible && !firstReleaseFrame) {
          const folderNode = layer.findIconNodeByItemId(folderId);
          const folderEntry = layer.lastDesktopRenderPlan?.entries?.find(
            (entry) => entry.item?.id === folderId
          );
          firstReleaseFrame = {
            firstReleaseCenter: { x: frame.position.x, y: frame.position.y },
            folderLayoutY: folderEntry?.layoutTarget?.y ?? null,
            folderNodeY: folderNode?.position?.y ?? null,
            hoverCenter: { x: hoverCenter.x, y: hoverCenter.y },
            sampledFrame: frames,
          };
        }
        if (firstReleaseFrame && group?.phase === "releasing" && folderId) {
          const folderNode = layer.findIconNodeByItemId(folderId);
          const shellKey = `folderShell:${folderId}`;
          const shellOwned = layer.visualOwnership.hasOwner(shellKey);
          const shellVisible = frame?.visible === true;
          const folderLive = folderNode?.visible === true && folderNode?.state?.ghosted !== true;
          if (Number(shellVisible) + Number(folderLive) !== 1 || shellVisible !== shellOwned) {
            ownershipViolations.push({
              frame: frames,
              kind: "folder-shell",
              folderLive,
              shellOwned,
              shellVisible,
            });
          }
          for (const entry of group.runtimePlan?.entries || []) {
            if (entry.mode !== "created-folder") continue;
            const entryIndex = group.entries.findIndex((candidate) => (
              candidate.actorKey === entry.actorKey || candidate.item?.id === entry.id
            ));
            const ghost = entryIndex >= 0 ? layer.groupDragLayer.nodes[entryIndex] : null;
            const child = folderNode?.folderChildNodes?.[entry.target?.slotIndex];
            const ghostDrawable = ghost?.visible === true && ghost?.renderable !== false && Number(ghost.alpha) > 0.001;
            const childDrawable = folderLive && child?.visible === true && child?.renderable === true;
            if (Number(ghostDrawable) + Number(childDrawable) !== 1) {
              ownershipViolations.push({
                childDrawable,
                frame: frames,
                ghostDrawable,
                id: entry.id,
                kind: "preview-slot",
              });
            }
          }
        }
        if (firstReleaseFrame && !group) {
          layer.groupDragLayer.update = originalGroupLayerUpdate;
          resolve({ ...firstReleaseFrame, actorHandoff, ownershipViolations });
          return;
        }
        if (frames >= 240) {
          layer.groupDragLayer.update = originalGroupLayerUpdate;
          reject(new Error("created-folder release did not settle with continuous visual ownership"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { point: points.target, pointerId, sourceId, targetId });

  expect(continuity.actorHandoff?.sameNode).toBe(true);
  expect(continuity.actorHandoff?.orderedNodeMatches).toBe(true);
  expect(continuity.actorHandoff?.actorOrder.slice(0, 2)).toEqual([
    `item:${targetId}`,
    `item:${sourceId}`,
  ]);
  expect(continuity.actorHandoff?.centerDelta).toBeLessThanOrEqual(0.5);
  expect(Math.abs(continuity.firstReleaseCenter.x - continuity.hoverCenter.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(continuity.firstReleaseCenter.y - continuity.hoverCenter.y)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(continuity.folderNodeY - continuity.folderLayoutY)).toBeLessThanOrEqual(0.001);
  expect(continuity.ownershipViolations).toEqual([]);
});

test("single-icon return keeps its already visible label opaque through handoff", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const iconId = "app-3-music";
  const pointerId = 241;
  const point = await readDesktopIconCenter(page, iconId);

  await dispatchDragPointer(page, "pointerdown", point, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", { x: point.x + 18, y: point.y }, pointerId);
  await page.waitForTimeout(80);
  await dispatchDragPointer(page, "pointermove", point, pointerId);
  await page.waitForTimeout(120);
  await page.waitForFunction(() => {
    const state = document.querySelector("#app")?.__vue_app__?._instance?.setupState;
    return state?.groupDragState?.phase === "dragging";
  });

  const handoff = await page.evaluate(async ({ iconId, point, pointerId }) => {
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
    if (!layer?.groupDragLayer) throw new Error("Pixi desktop group layer is unavailable");
    const dragGroup = state.groupDragState;
    const ghostIndex = dragGroup.entries.findIndex((entry) => entry.item?.id === iconId);
    const ghostNode = ghostIndex >= 0 ? layer.groupDragLayer.nodes[ghostIndex] : null;
    const ghostLabelAlphaBeforeRelease = Number(ghostNode?.labelText?.alpha);

    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      isPrimary: true,
      pointerId,
      pointerType: "mouse",
      view: window,
    }));

    return new Promise((resolve, reject) => {
      let frames = 0;
      let settledFrames = 0;
      let liveLabelFrameCount = 0;
      let minLiveLabelAlpha = 1;
      let releaseOutcome = null;
      let releasePhase = null;
      const sample = () => {
        frames += 1;
        const group = state.groupDragState;
        if (group) {
          releaseOutcome ||= group.outcome;
          if (["releasing", "returning"].includes(group.phase)) releasePhase ||= group.phase;
        }
        const liveNode = layer.findIconNodeByItemId(iconId);
        if (liveNode?.visible === true && liveNode?.labelText?.visible === true) {
          liveLabelFrameCount += 1;
          minLiveLabelAlpha = Math.min(minLiveLabelAlpha, Number(liveNode.labelText.alpha));
        }
        settledFrames = group ? 0 : settledFrames + 1;
        if (settledFrames >= 12) {
          resolve({
            ghostLabelAlphaBeforeRelease,
            liveLabelFrameCount,
            minLiveLabelAlpha,
            releaseOutcome,
            releasePhase,
          });
          return;
        }
        if (frames >= 240) {
          reject(new Error("single-icon return did not settle"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { iconId, point, pointerId });

  expect(handoff.ghostLabelAlphaBeforeRelease).toBeGreaterThanOrEqual(0.99);
  expect(handoff.liveLabelFrameCount).toBeGreaterThan(0);
  expect(handoff.minLiveLabelAlpha).toBeGreaterThanOrEqual(0.99);
  expect(handoff.releaseOutcome).toBe("noop");
  expect(handoff.releasePhase).toBe("returning");
});

test("a first-cell app target wins over the overlapping desktop page-turn zone", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const ids = await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const apps = state.activePages[1].filter((item) => item.type === "app").slice(0, 2);
    if (apps.length !== 2) throw new Error("The second fixture page needs two app targets");
    state.commitActivePageIndex(1);
    return { sourceId: apps[1].id, targetId: apps[0].id };
  });
  await expect.poll(async () => page.evaluate(() => (
    document.querySelector("#app").__vue_app__._instance.setupState.activePageIndex
  ))).toBe(1);
  await page.waitForTimeout(500);
  const source = await readDesktopIconCenter(page, ids.sourceId);
  const target = await readDesktopIconCenter(page, ids.targetId);
  const pointerId = 245;
  await dispatchDragPointer(page, "pointerdown", source, pointerId);
  await page.waitForTimeout(560);
  await dispatchDragPointer(page, "pointermove", {
    x: source.x + (target.x - source.x) * 0.12,
    y: source.y + (target.y - source.y) * 0.12,
  }, pointerId);
  await page.waitForTimeout(80);
  await dispatchDragPointer(page, "pointermove", target, pointerId);

  const linger = await page.evaluate(async ({ targetId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const pageIndexes = [];
    const deadline = performance.now() + 950;
    while (performance.now() < deadline) {
      pageIndexes.push(state.activePageIndex);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {
      intentTargetId: state.groupDragState?.intent?.targetAppId || null,
      intentType: state.groupDragState?.intent?.type || null,
      pageIndexes: [...new Set(pageIndexes)],
      targetMatched: state.groupDragState?.intent?.targetAppId === targetId,
    };
  }, { targetId: ids.targetId });
  expect(linger).toEqual({
    intentTargetId: ids.targetId,
    intentType: "application",
    pageIndexes: [1],
    targetMatched: true,
  });

  await dispatchDragPointer(page, "pointerup", target, pointerId);
  await page.waitForFunction(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return !state.groupDragState;
  }, null, { timeout: 5_000 });
  expect(await page.evaluate(({ sourceId, targetId }) => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const folder = state.activePages.flat().find((item) => (
      item.type === "folder" &&
      item.children?.some((child) => child.id === sourceId) &&
      item.children?.some((child) => child.id === targetId)
    ));
    return { activePageIndex: state.activePageIndex, folderCreated: Boolean(folder) };
  }, ids)).toEqual({ activePageIndex: 1, folderCreated: true });
});

for (const viewport of [
  { height: 650, label: "960x650", width: 960 },
  { height: 1080, label: "1920x1080", width: 1920 },
]) {
  test(`a top-left anchored first-slot release stays on the current page at ${viewport.label}`, async ({ page }) => {
    test.setTimeout(30_000);
    await page.setViewportSize({ height: viewport.height, width: viewport.width });
    await waitForFixture(page);
    const ids = await page.evaluate(() => {
      const state = document.querySelector("#app").__vue_app__._instance.setupState;
      const apps = state.activePages[1].filter((item) => item.type === "app");
      if (apps.length < 5) throw new Error("The second fixture page needs five apps");
      state.commitActivePageIndex(1);
      return { firstId: apps[0].id, sourceId: apps[4].id };
    });
    await expect.poll(async () => page.evaluate(() => (
      document.querySelector("#app").__vue_app__._instance.setupState.activePageIndex
    ))).toBe(1);
    await page.waitForTimeout(500);
    await enterBatchSelectionOf(page, [ids.firstId, ids.sourceId]);

    const result = await page.evaluate(async ({ firstId, sourceId }) => {
      const state = document.querySelector("#app").__vue_app__._instance.setupState;
      const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
      const readBounds = (id) => state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "desktop",
        id,
        pageIndex: 1,
      });
      const firstBounds = readBounds(firstId);
      const sourceBounds = readBounds(sourceId);
      const mainRect = document.querySelector("main.desktop-main")?.getBoundingClientRect();
      if (!firstBounds || !sourceBounds || !mainRect) throw new Error("First-slot drag geometry is unavailable");
      const sourcePoint = { x: sourceBounds.left + 1, y: sourceBounds.top + 1 };
      const releasePoint = { x: firstBounds.left + 1, y: firstBounds.top + 1 };
      const firstCenter = {
        x: firstBounds.left + firstBounds.width / 2,
        y: firstBounds.top + firstBounds.height / 2,
      };
      const target = document.elementFromPoint(sourcePoint.x, sourcePoint.y);
      if (!target) throw new Error("The source top-left point is outside the viewport");
      const init = {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: sourcePoint.x,
        clientY: sourcePoint.y,
        isPrimary: true,
        pointerId: 246,
        pointerType: "mouse",
        view: window,
      };
      target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
      await wait(560);
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: sourcePoint.x + 12,
        clientY: sourcePoint.y + 4,
      }));
      await wait(80);
      if (!state.groupDragState) throw new Error("The edge fixture did not activate an icon drag");
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: releasePoint.x,
        clientY: releasePoint.y,
      }));
      await wait(90);
      const group = state.groupDragState;
      const beforeRelease = {
        activePageIndex: state.activePageIndex,
        center: group?.center || null,
        intent: group?.intent || null,
        navigationBoundary: mainRect.left + 92,
        pointer: group?.pointer || null,
      };
      const pageIndexes = [state.activePageIndex];
      window.dispatchEvent(new PointerEvent("pointerup", {
        ...init,
        buttons: 0,
        clientX: releasePoint.x,
        clientY: releasePoint.y,
      }));
      const deadline = performance.now() + 5_000;
      while (state.groupDragState && performance.now() < deadline) {
        pageIndexes.push(state.activePageIndex);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      pageIndexes.push(state.activePageIndex);
      return {
        activePageIndex: state.activePageIndex,
        beforeRelease,
        firstCenter,
        firstPageFirstId: state.activePages[0][0]?.id || null,
        groupEnded: state.groupDragState == null,
        pageIndexes: [...new Set(pageIndexes)],
        secondPageFirstIds: state.activePages[1].slice(0, 2).map((item) => item.id),
        transientNotice: state.transientNotice?.message || null,
      };
    }, ids);

    expect(result.beforeRelease).toMatchObject({
      activePageIndex: 1,
      intent: { index: 0, pageIndex: 1, type: "desktop-slot" },
    });
    expect(Math.abs(result.beforeRelease.center.x - result.firstCenter.x)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(result.beforeRelease.center.y - result.firstCenter.y)).toBeLessThanOrEqual(0.1);
    expect(result.beforeRelease.pointer.x).toBeGreaterThan(result.beforeRelease.navigationBoundary);
    expect(result).toMatchObject({
      activePageIndex: 1,
      firstPageFirstId: "app-0-safari",
      groupEnded: true,
      pageIndexes: [1],
      secondPageFirstIds: [ids.firstId, ids.sourceId],
      transientNotice: null,
    });
  });
}

test("the desktop navigation edge turns only after its full dwell", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ height: 650, width: 960 });

  const runEdgeScenario = async ({ cancel, dwellMs, pointerId }) => {
    await waitForFixture(page);
    return page.evaluate(async ({ cancel: shouldCancel, dwellMs: dwell, pointerId: id }) => {
      const state = document.querySelector("#app").__vue_app__._instance.setupState;
      const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      state.commitActivePageIndex(1);
      await wait(500);
      const source = state.activePages[1].find((item) => item.type === "app");
      const bounds = state.iconBoundsRegistry.getBounds("launch", "rendered", {
        area: "desktop",
        id: source.id,
        pageIndex: 1,
      });
      const mainRect = document.querySelector("main.desktop-main")?.getBoundingClientRect();
      if (!bounds || !mainRect) throw new Error("Desktop edge drag geometry is unavailable");
      const sourcePoint = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
      const edgePoint = {
        x: mainRect.left + 20,
        y: sourcePoint.y,
      };
      const target = document.elementFromPoint(sourcePoint.x, sourcePoint.y);
      if (!target) throw new Error("The edge fixture source is outside the viewport");
      const beforeLayout = JSON.stringify(state.activePages);
      const init = {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: sourcePoint.x,
        clientY: sourcePoint.y,
        isPrimary: true,
        pointerId: id,
        pointerType: "mouse",
        view: window,
      };
      target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
      await wait(560);
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: sourcePoint.x + 12,
        clientY: sourcePoint.y + 4,
      }));
      await wait(80);
      if (!state.groupDragState) throw new Error("The edge fixture did not activate an icon drag");
      window.dispatchEvent(new PointerEvent("pointermove", {
        ...init,
        buttons: 1,
        clientX: edgePoint.x,
        clientY: edgePoint.y,
      }));
      const pageIndexes = [];
      const dwellDeadline = performance.now() + dwell;
      while (performance.now() < dwellDeadline) {
        pageIndexes.push(state.activePageIndex);
        await frame();
      }
      const beforeRelease = {
        activePageIndex: state.activePageIndex,
        desktopPageIndex: state.groupDragState?.desktopPageIndex ?? null,
        phase: state.groupDragState?.phase || null,
        pointerX: state.groupDragState?.pointer?.x ?? null,
      };
      window.dispatchEvent(new PointerEvent(shouldCancel ? "pointercancel" : "pointerup", {
        ...init,
        buttons: 0,
        clientX: edgePoint.x,
        clientY: edgePoint.y,
      }));
      const settleDeadline = performance.now() + 5_000;
      while (state.groupDragState && performance.now() < settleDeadline) await frame();
      pageIndexes.push(state.activePageIndex);
      return {
        beforeRelease,
        edgeBoundary: mainRect.left + 92,
        groupEnded: state.groupDragState == null,
        layoutUnchanged: JSON.stringify(state.activePages) === beforeLayout,
        pageIndexes: [...new Set(pageIndexes)],
        transientNotice: state.transientNotice?.message || null,
      };
    }, { cancel, dwellMs, pointerId });
  };

  const quickRelease = await runEdgeScenario({ cancel: false, dwellMs: 150, pointerId: 247 });
  expect(quickRelease.beforeRelease).toMatchObject({
    activePageIndex: 1,
    desktopPageIndex: 1,
    phase: "dragging",
  });
  expect(quickRelease.beforeRelease.pointerX).toBeLessThan(quickRelease.edgeBoundary);
  expect(quickRelease).toMatchObject({
    groupEnded: true,
    layoutUnchanged: true,
    pageIndexes: [1],
    transientNotice: null,
  });

  const fullDwell = await runEdgeScenario({ cancel: true, dwellMs: 1_200, pointerId: 248 });
  expect(fullDwell.beforeRelease).toMatchObject({
    activePageIndex: 0,
    desktopPageIndex: 0,
    phase: "dragging",
  });
  expect(fullDwell.beforeRelease.pointerX).toBeLessThan(fullDwell.edgeBoundary);
  expect(fullDwell).toMatchObject({
    groupEnded: true,
    layoutUnchanged: true,
    pageIndexes: [1, 0],
    transientNotice: null,
  });
});

test("an app target remains semantic after desktop edge navigation", async ({ page }) => {
  test.setTimeout(30_000);
  await page.setViewportSize({ height: 650, width: 960 });
  await waitForFixture(page);

  const result = await page.evaluate(async () => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const readStableBounds = (id) => {
      const record = state.iconBoundsRegistry.getBounds("topLevel", "stableStageLayout", id);
      const stageRect = record?.meta?.stageRect;
      const stageWidth = Number(record?.meta?.stageWidth);
      const stageHeight = Number(record?.meta?.stageHeight);
      if (!record || !stageRect || !stageWidth || !stageHeight) return null;
      const scaleX = stageRect.width / stageWidth;
      const scaleY = stageRect.height / stageHeight;
      return {
        height: record.height * scaleY,
        left: stageRect.left + record.left * scaleX,
        top: stageRect.top + record.top * scaleY,
        width: record.width * scaleX,
      };
    };
    const firstPageTarget = state.activePages[0].find((item) => item.type === "app");
    const secondPageSource = state.activePages[1].find((item) => item.type === "app");
    state.commitActivePageIndex(1);
    await wait(500);
    const readBounds = (id, pageIndex) => state.iconBoundsRegistry.getBounds("launch", "rendered", {
      area: "desktop",
      id,
      pageIndex,
    });
    const sourceBounds = readBounds(secondPageSource.id, 1);
    const mainRect = document.querySelector("main.desktop-main")?.getBoundingClientRect();
    if (!sourceBounds || !mainRect) throw new Error("Cross-page target geometry is unavailable");
    const sourcePoint = {
      x: sourceBounds.left + sourceBounds.width / 2,
      y: sourceBounds.top + sourceBounds.height / 2,
    };
    const edgePoint = { x: mainRect.left + 20, y: sourcePoint.y };
    const target = document.elementFromPoint(sourcePoint.x, sourcePoint.y);
    if (!target) throw new Error("Cross-page source is outside the viewport");
    const init = {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: sourcePoint.x,
      clientY: sourcePoint.y,
      isPrimary: true,
      pointerId: 249,
      pointerType: "mouse",
      view: window,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
    await wait(560);
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: sourcePoint.x + 12,
      clientY: sourcePoint.y + 4,
    }));
    await wait(80);
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: edgePoint.x,
      clientY: edgePoint.y,
    }));
    const navigationDeadline = performance.now() + 1_500;
    while (state.activePageIndex !== 0 && performance.now() < navigationDeadline) await frame();
    await wait(120);
    const targetBounds = readStableBounds(firstPageTarget.id);
    if (!targetBounds) throw new Error("The first-page target did not render after navigation");
    const targetPoint = {
      x: targetBounds.left + targetBounds.width / 2,
      y: targetBounds.top + targetBounds.height / 2,
    };
    window.dispatchEvent(new PointerEvent("pointermove", {
      ...init,
      buttons: 1,
      clientX: targetPoint.x,
      clientY: targetPoint.y,
    }));
    await wait(90);
    const beforeCancel = {
      activePageIndex: state.activePageIndex,
      intent: state.groupDragState?.intent || null,
      targetId: firstPageTarget.id,
    };
    window.dispatchEvent(new PointerEvent("pointercancel", {
      ...init,
      buttons: 0,
      clientX: targetPoint.x,
      clientY: targetPoint.y,
    }));
    return beforeCancel;
  });

  expect(result).toMatchObject({
    activePageIndex: 0,
    intent: { type: "application" },
  });
  expect(result.intent.targetAppId).toBe(result.targetId);
});

test("toolbar batch folder creation uses committed layout with bounded actors and complete ownership", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const selectedIds = [
    "app-0-safari",
    "app-1-mail",
    "app-2-photos",
    "app-3-music",
    "app-4-calendar",
    "app-5-maps",
    "app-6-messages",
    "app-7-notes",
    "app-8-reminders",
    "app-9-facetime",
    "app-10-weather",
    "app-11-clock",
    "app-12-books",
    "app-13-tv",
  ];
  const followerId = "app-14-podcasts";
  await enterBatchSelectionOf(page, selectedIds);

  const release = await page.evaluate(async ({ followerId, selectedIds }) => {
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
    if (!layer?.groupDragLayer) throw new Error("Pixi desktop group layer is unavailable");
    const readTarget = (id) => {
      const target = layer.lastDesktopRenderPlan?.entries
        ?.find((entry) => entry.item?.id === id)?.layoutTarget;
      return target ? { x: target.x, y: target.y } : null;
    };
    const beforeSelectedTargets = Object.fromEntries(
      selectedIds.map((id) => [id, readTarget(id)])
    );
    const beforeFollowerTarget = readTarget(followerId);
    state.createFolderFromBatchSelection();

    return new Promise((resolve, reject) => {
      let frames = 0;
      const sample = () => {
        frames += 1;
        const group = state.groupDragState;
        const releaseRenderReady = group?.phase === "releasing" &&
          group.runtimePlan &&
          layer.groupDragLayer.activeKey === group.key &&
          layer.groupDragLayer.activeNodesByActorKey.size === group.entries.length;
        if (releaseRenderReady) {
          const folderId = group.semanticPlan?.effects?.createdFolderId;
          const anchorId = group.intent?.anchorId;
          const folderTarget = readTarget(folderId);
          const followerTarget = readTarget(followerId);
          if (!folderTarget || !followerTarget) {
            requestAnimationFrame(sample);
            return;
          }
          const actors = group.presentationPlan?.actors || [];
          const transferOwnership = layer.visualOwnership.snapshot()
            .filter((entry) => entry.owner?.kind === "group-transfer")
            .map((entry) => entry.key);
          const folderEntry = layer.lastDesktopRenderPlan?.entries
            ?.find((entry) => entry.item?.id === folderId);
          const folderNode = layer.findIconNodeByItemId(folderId);
          const bundleActor = actors.find((actor) => actor.role === "bundle");
          resolve({
            anchorId,
            actorMemberIds: actors.flatMap((actor) => actor.memberIds || []),
            actorRoles: actors.map((actor) => actor.role),
            aggregateMemberCount: bundleActor?.memberIds?.length || 0,
            badgeVisible: layer.groupDragLayer.badge.visible,
            beforeAnchorTarget: beforeSelectedTargets[anchorId] || null,
            beforeFollowerTarget,
            folderId,
            folderNodeGhosted: folderNode?.state?.ghosted === true,
            folderShellVisible: layer.groupDragLayer.releaseController.folderShellFrame?.visible === true,
            folderTarget,
            followerTarget,
            groupEntries: group.entries.map((entry) => entry.item?.id || null),
            nodePoolSize: layer.groupDragLayer.nodes.length,
            ownershipKeys: transferOwnership,
            releaseEntries: group.runtimePlan.entries.map((entry) => ({
              actorKey: entry.actorKey,
              id: entry.id,
              mode: entry.mode,
              slotIndex: entry.target?.slotIndex ?? null,
            })),
            semanticMemberIds: group.semanticPlan?.members?.map((member) => member.id) || [],
            suppressedPreviewChildIds: folderEntry?.nodeState?.suppressedFolderPreviewChildIds || [],
          });
          return;
        }
        if (frames >= 90) {
          reject(new Error("toolbar folder release did not reach the accepted phase"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { followerId, selectedIds });

  expect(release.badgeVisible).toBe(false);
  expect(release.nodePoolSize).toBeGreaterThanOrEqual(10);
  expect(release.groupEntries).toHaveLength(10);
  expect(release.releaseEntries).toHaveLength(10);
  expect([...release.semanticMemberIds].sort()).toEqual([...selectedIds].sort());
  expect([...release.actorMemberIds].sort()).toEqual([...selectedIds].sort());
  expect(release.actorRoles.filter((role) => role === "bundle")).toHaveLength(1);
  expect(release.actorRoles.filter((role) => role === "folder-shell")).toHaveLength(1);
  expect(release.aggregateMemberCount).toBe(selectedIds.length - 9);
  expect(release.releaseEntries.filter((entry) => entry.mode === "created-folder"))
    .toHaveLength(9);
  expect(release.releaseEntries
    .filter((entry) => entry.mode === "created-folder")
    .every((entry) => entry.slotIndex >= 0 && entry.slotIndex < 9)).toBe(true);
  expect(release.releaseEntries.filter((entry) => entry.mode === "folder-center-absorb"))
    .toHaveLength(1);
  expect(release.ownershipKeys).toEqual(expect.arrayContaining([
    ...selectedIds.map((id) => `item:${id}`),
    `folderShell:${release.folderId}`,
  ]));
  expect(release.folderNodeGhosted).toBe(true);
  expect(release.folderShellVisible).toBe(true);
  expect([...release.suppressedPreviewChildIds].sort()).toEqual([...selectedIds].sort());
  expect(release.anchorId).toBe(selectedIds.at(-1));
  expect(release.folderTarget).not.toEqual(release.beforeAnchorTarget);
  expect(release.followerTarget).not.toEqual(release.beforeFollowerTarget);

  const settled = await page.evaluate(async ({ beforeFollowerTarget, folderId, followerId }) => {
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
    const deadline = performance.now() + 5_000;
    const ownershipViolations = [];
    while (performance.now() < deadline) {
      const group = state.groupDragState;
      if (group?.phase === "releasing") {
        const folderNode = layer.findIconNodeByItemId(folderId);
        const shellFrame = layer.groupDragLayer.releaseController.folderShellFrame;
        const shellOwned = layer.visualOwnership.hasOwner(`folderShell:${folderId}`);
        const shellVisible = shellFrame?.visible === true;
        const folderLive = folderNode?.visible === true && folderNode?.state?.ghosted !== true;
        if (Number(shellVisible) + Number(folderLive) !== 1 || shellVisible !== shellOwned) {
          ownershipViolations.push({ folderLive, kind: "folder-shell", shellOwned, shellVisible });
        }
        for (const entry of group.runtimePlan?.entries || []) {
          if (entry.mode !== "created-folder") continue;
          const entryIndex = group.entries.findIndex((candidate) => (
            candidate.actorKey === entry.actorKey || candidate.item?.id === entry.id
          ));
          const ghost = entryIndex >= 0 ? layer.groupDragLayer.nodes[entryIndex] : null;
          const child = folderNode?.folderChildNodes?.[entry.target?.slotIndex];
          const ghostDrawable = ghost?.visible === true && ghost?.renderable !== false && Number(ghost.alpha) > 0.001;
          const childDrawable = folderLive && child?.visible === true && child?.renderable === true;
          if (Number(ghostDrawable) + Number(childDrawable) !== 1) {
            ownershipViolations.push({ childDrawable, ghostDrawable, id: entry.id, kind: "preview-slot" });
          }
        }
      }
      const followerTarget = layer?.lastDesktopRenderPlan?.entries
        ?.find((entry) => entry.item?.id === followerId)?.layoutTarget;
      if (!state.groupDragState && followerTarget) {
        const folder = state.activePages.flat().find((item) => item.id === folderId);
        return {
          batch: state.isBatchSelectionActive,
          childCount: folder?.children?.length || 0,
          followerTarget: { x: followerTarget.x, y: followerTarget.y },
          openFolderId: state.openFolderId,
          ownershipViolations,
          selectedIds: [...state.batchSelectedIds],
        };
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    throw new Error("toolbar folder transfer did not settle after release ownership ended");
  }, {
    beforeFollowerTarget: release.beforeFollowerTarget,
    folderId: release.folderId,
    followerId,
  });

  expect(settled).toMatchObject({
    batch: true,
    childCount: 14,
    openFolderId: null,
    selectedIds: [],
  });
  expect(settled.ownershipViolations).toEqual([]);
  expect(settled.followerTarget).toEqual(release.followerTarget);
});

test("full current-page selection keeps complete ownership with a bounded folder release", async ({ page }) => {
  test.setTimeout(90_000);
  await waitForFixture(page);
  const selectedIds = await page.evaluate(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return state.activePages[0]
      .filter((item) => item.type === "app")
      .map((item) => item.id);
  });
  expect(selectedIds).toHaveLength(33);
  await enterBatchSelectionOf(page, selectedIds);

  const result = await page.evaluate(async ({ selectedIds }) => {
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
    if (!layer?.groupDragLayer) throw new Error("Pixi desktop group layer is unavailable");

    const startedAt = performance.now();
    let accepted = null;
    const visibleOwnedIds = new Set();
    state.createFolderFromBatchSelection();

    return new Promise((resolve, reject) => {
      const deadline = performance.now() + 10_000;
      const sample = () => {
        const group = state.groupDragState;
        const releaseRenderReady = group?.phase === "releasing" &&
          group.runtimePlan &&
          layer.groupDragLayer.activeKey === group.key &&
          layer.groupDragLayer.activeNodesByActorKey.size === group.entries.length;
        if (releaseRenderReady) {
          if (!accepted) {
            const actors = group.presentationPlan?.actors || [];
            const bundleActor = actors.find((actor) => actor.role === "bundle");
            accepted = {
              actorMemberIds: actors.flatMap((actor) => actor.memberIds || []),
              actorRoles: actors.map((actor) => actor.role),
              aggregateMemberCount: bundleActor?.memberIds?.length || 0,
              folderId: group.semanticPlan?.effects?.createdFolderId,
              groupIds: group.entries.map((entry) => entry.item?.id || null),
              nodePoolSize: layer.groupDragLayer.nodes.length,
              ownershipKeys: layer.visualOwnership.snapshot()
                .filter((entry) => entry.owner?.kind === "group-transfer")
                .map((entry) => entry.key),
              releaseIds: group.runtimePlan.entries.map((entry) => entry.id),
              releaseModes: group.runtimePlan.entries.map((entry) => entry.mode),
              semanticMemberIds: group.semanticPlan?.members?.map((member) => member.id) || [],
            };
          }
          for (const id of selectedIds) {
            const node = layer.findIconNodeByItemId(id);
            if (node?.visible) visibleOwnedIds.add(id);
          }
        }
        if (accepted && !group) {
          const folder = state.activePages.flat().find((item) => item.id === accepted.folderId);
          resolve({
            ...accepted,
            batch: state.isBatchSelectionActive,
            childCount: folder?.children?.length || 0,
            durationMs: performance.now() - startedAt,
            openFolderId: state.openFolderId,
            selectedIds: [...state.batchSelectedIds],
            visibleOwnedIds: [...visibleOwnedIds],
          });
          return;
        }
        if (performance.now() >= deadline) {
          reject(new Error("full-page folder release did not settle within ten seconds"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { selectedIds });

  expect(result.groupIds).toHaveLength(10);
  expect(result.releaseIds).toHaveLength(10);
  expect([...result.semanticMemberIds].sort()).toEqual([...selectedIds].sort());
  expect([...result.actorMemberIds].sort()).toEqual([...selectedIds].sort());
  expect(result.actorRoles.filter((role) => role === "bundle")).toHaveLength(1);
  expect(result.actorRoles.filter((role) => role === "folder-shell")).toHaveLength(1);
  expect(result.aggregateMemberCount).toBe(selectedIds.length - 9);
  expect(result.nodePoolSize).toBeGreaterThanOrEqual(10);
  expect(result.releaseModes.filter((mode) => mode === "created-folder")).toHaveLength(9);
  expect(result.releaseModes.filter((mode) => mode === "folder-center-absorb")).toHaveLength(1);
  expect(result.ownershipKeys).toEqual(expect.arrayContaining([
    ...selectedIds.map((id) => `item:${id}`),
    `folderShell:${result.folderId}`,
  ]));
  expect(result.visibleOwnedIds).toEqual([]);
  expect(result).toMatchObject({
    batch: true,
    childCount: selectedIds.length,
    openFolderId: null,
    selectedIds: [],
  });
  expect(result.durationMs).toBeLessThan(10_000);
});
