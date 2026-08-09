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
    const plan = state.groupDragState?.releasePlan;
    return plan
      ? {
        key: plan.key,
        entries: plan.entries?.map((entry) => ({
          id: entry.id,
          mode: entry.mode,
          target: entry.target,
        })) || [],
        status: state.groupDragState.releaseStatus,
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
    return Boolean(state.groupDragState?.releasePlan);
  }, null, { timeout: 3_000 });
  const plan = await readReleasePlan(page);
  await page.waitForFunction(() => {
    const state = document.querySelector("#app").__vue_app__._instance.setupState;
    return !state.groupDragState;
  }, null, { timeout: 3_000 });
  return plan;
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

test("created-folder release keeps the hover frame center continuous on pointerup", async ({ page }) => {
  test.setTimeout(30_000);
  await waitForFixture(page);
  const sourceId = "app-3-music";
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

  const continuity = await page.evaluate(async ({ point, pointerId, targetId }) => {
    const root = document.querySelector("#app")?.__vue_app__?._instance;
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
      const sample = () => {
        frames += 1;
        const frame = layer.groupDragLayer?.releaseController?.createdFolderFrame;
        if (frame?.visible) {
          const state = document.querySelector("#app").__vue_app__._instance.setupState;
          const folderId = state.groupDragState?.releaseCreatedFolderId;
          const folderNode = layer.findIconNodeByItemId(folderId);
          const folderEntry = layer.lastDesktopRenderPlan?.entries?.find(
            (entry) => entry.item?.id === folderId
          );
          resolve({
            firstReleaseCenter: { x: frame.position.x, y: frame.position.y },
            folderLayoutY: folderEntry?.layoutTarget?.y ?? null,
            folderNodeY: folderNode?.position?.y ?? null,
            hoverCenter: { x: hoverCenter.x, y: hoverCenter.y },
            sampledFrame: frames,
          });
          return;
        }
        if (frames >= 12) {
          reject(new Error("created-folder release frame did not become visible"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { point: points.target, pointerId, targetId });

  expect(Math.abs(continuity.firstReleaseCenter.x - continuity.hoverCenter.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(continuity.firstReleaseCenter.y - continuity.hoverCenter.y)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(continuity.folderNodeY - continuity.folderLayoutY)).toBeLessThanOrEqual(0.001);
});

test("toolbar batch folder creation contains release visuals and holds the pre-commit layout", async ({ page }) => {
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
        if (group?.phase === "accepted" && group.releasePlan) {
          const folderId = group.releaseCreatedFolderId;
          const anchorId = group.releaseLayoutAnchorId;
          const folderTarget = readTarget(folderId);
          const followerTarget = readTarget(followerId);
          if (!folderTarget || !followerTarget) {
            requestAnimationFrame(sample);
            return;
          }
          resolve({
            anchorId,
            badgeVisible: layer.groupDragLayer.badge.visible,
            beforeAnchorTarget: beforeSelectedTargets[anchorId] || null,
            beforeFollowerTarget,
            folderId,
            folderTarget,
            followerTarget,
            releaseEntries: group.releasePlan.entries.map((entry) => ({
              mode: entry.mode,
              slotIndex: entry.target?.slotIndex ?? null,
            })),
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
  expect(release.releaseEntries.filter((entry) => entry.mode === "created-folder"))
    .toHaveLength(9);
  expect(release.releaseEntries
    .filter((entry) => entry.mode === "created-folder")
    .every((entry) => entry.slotIndex >= 0 && entry.slotIndex < 9)).toBe(true);
  expect(release.releaseEntries.slice(9)
    .every((entry) => entry.mode === "folder-center-absorb")).toBe(true);
  expect(release.folderTarget).toEqual(release.beforeAnchorTarget);
  expect(release.followerTarget).toEqual(release.beforeFollowerTarget);

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
    while (performance.now() < deadline) {
      const followerTarget = layer?.lastDesktopRenderPlan?.entries
        ?.find((entry) => entry.item?.id === followerId)?.layoutTarget;
      const hasSettledLayout = followerTarget && (
        followerTarget.x !== beforeFollowerTarget.x ||
        followerTarget.y !== beforeFollowerTarget.y
      );
      if (!state.groupDragState && hasSettledLayout) {
        const folder = state.activePages.flat().find((item) => item.id === folderId);
        return {
          batch: state.isBatchSelectionActive,
          childCount: folder?.children?.length || 0,
          followerTarget: { x: followerTarget.x, y: followerTarget.y },
          openFolderId: state.openFolderId,
          selectedIds: [...state.batchSelectedIds],
        };
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    throw new Error("committed desktop layout did not settle after release ownership ended");
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
  expect(settled.followerTarget).not.toEqual(release.beforeFollowerTarget);
});
