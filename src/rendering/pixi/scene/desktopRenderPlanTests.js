import { buildDesktopRenderPlan } from "./desktopRenderPlan.js";

function makeBaseState(overrides = {}) {
  return {
    activePageIndex: 0,
    activePages: [[]],
    desktopFrame: { height: 300, left: 0, top: 0, width: 400 },
    deviceResolution: 1,
    folderPageSize: 9,
    folderSourceGhostedIds: new Set(),
    getDesktopPageRenderMode: () => "interactive",
    getVisibleDesktopPage: (page) => page,
    gridCols: 2,
    gridRows: 1,
    height: 300,
    iconSize: 64,
    isEditMode: false,
    isFolderOpeningPreviewFrameGhosted: () => false,
    isIconOpening: () => false,
    isSearchMode: false,
    isTextlessMode: false,
    launchTargetStatusById: {},
    selectedIcon: null,
    setPageRef: () => {},
    showMissingLaunchTargetBadge: false,
    stageRect: { height: 300, left: 0, top: 0, width: 400 },
    width: 400,
    ...overrides,
  };
}

function makeHandoffCoordinator(active, folderId = null) {
  return {
    get folderId() {
      return folderId;
    },
    isCloseHandoffActive() {
      return active;
    },
  };
}

export function runDesktopRenderPlanTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Desktop render plan test failed] ${message}`);
  };

  {
    const app = { id: "app-a", type: "app" };
    const folder = { id: "folder-a", type: "folder" };
    const handoffEntry = { folderId: folder.id, visualReleased: false };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[app, folder]],
      dragMeta: { item: app },
      folderClosingHandoffIds: new Set([folder.id]),
      isIconOpening: (area, itemId) => area === "desktop" && itemId === app.id,
      selectedIcon: { area: "desktop", folderId: null, id: app.id, pageIndex: 0 },
      showMissingLaunchTargetBadge: true,
      launchTargetStatusById: { [app.id]: { missing: true } },
    }), {
      folderHandoffEntries: new Map([[folder.id, handoffEntry]]),
      folderLayer: { folderHandoff: makeHandoffCoordinator(true, folder.id) },
    });

    assert(plan.entries.length === 2, "plan should include visible desktop entries");
    assert(plan.pageRefs.length === 1, "plan should expose page ref updates");
    assert(plan.clearLaunchArea === "desktop", "plan should expose the launch bounds area to clear");
    assert(plan.clearFolderPreviewChildIds.join(",") === folder.id, "plan should expose folder preview child clears");
    assert(plan.pageTrack.pageIndex === 0 && plan.pageTrack.pageSpan === 400, "plan should expose page track target inputs");
    assert(plan.pageTrack.scope === "desktop", "desktop plans should mark the page track scope as desktop");

    const appEntry = plan.entries[0];
    assert(appEntry.key === "page:0:app-a", "app entry should expose the stable desktop node key");
    assert(appEntry.nodeState.dragging === true, "app entry should preserve drag state");
    assert(appEntry.nodeState.opening === true && appEntry.nodeState.selected === true, "app entry should preserve icon lookup state");
    assert(appEntry.nodeState.launchTargetStatus?.missing === true, "app entry should preserve launch target status");
    assert(appEntry.boundsEntry?.area === "desktop", "interactive app entry should expose bounds registration input");
    assert(Number.isFinite(appEntry.layoutTarget.x) && Number.isFinite(appEntry.layoutTarget.y), "app entry should expose a numeric layout target");

    const folderEntry = plan.entries[1];
    assert(folderEntry.effectiveFolderHandoffEntry === handoffEntry, "folder entry should keep the existing handoff entry");
    assert(folderEntry.isFolderClosingHandoff === true, "folder entry should identify active closing handoff state");
    assert(folderEntry.nodeState.preserveNodeScale === true, "handoff folder entry should preserve node scale");
    assert(folderEntry.nodeState.draggable === false && folderEntry.nodeState.interactive === false, "handoff folder should disable normal interaction");
    assert(folderEntry.boundsEntry?.handoffLayoutTarget, "handoff folder should expose a pinned bounds layout target");
  }

  {
    const appA = { id: "app-press-a", type: "app" };
    const appB = { id: "app-press-b", type: "app" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[appA, appB]],
      iconGesturePresentation: {
        phase: "armed",
        scope: "desktop",
        target: { id: appB.id, kind: "icon" },
      },
    }));

    assert(plan.entries[0].nodeState.interactionPhase == null, "non-target desktop icons should remain visually idle");
    assert(plan.entries[1].nodeState.interactionPhase === "armed", "the matching desktop icon should receive the armed phase");
  }

  {
    const folder = { id: "folder-stale", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      folderSourceGhostedIds: new Set([folder.id]),
    }), {
      effectiveFolderSourceGhostedIds: new Set([folder.id]),
      folderHandoffEntries: new Map([[folder.id, { folderId: folder.id, visualReleased: false }]]),
      folderLayer: {
        folderHandoff: makeHandoffCoordinator(false, null),
        hasVisibleFolderSubstitute: () => false,
      },
    });

    const [entry] = plan.entries;
    assert(entry.shouldRetireStaleHandoff === true, "plan should mark stale unreleased handoffs for retirement");
    assert(entry.effectiveFolderHandoffEntry === null, "retired handoff should not remain an effective folder handoff");
    assert(entry.isFolderClosingHandoff === false, "retired handoff should fall back to the ordinary icon path");
    assert(entry.nodeState.ghosted === true, "raw source ghosting should remain in the node state after retirement");
  }

  {
    const folder = { id: "folder-released", type: "folder" };
    const hoverState = {
      key: "folder-hover-released",
      phase: "hover",
      targetId: folder.id,
      targetType: "folder",
    };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      dragFolderHoverState: hoverState,
      dragFolderTargetId: folder.id,
      folderClosingHandoffIds: new Set([folder.id]),
      folderSourceGhostedIds: new Set([folder.id]),
    }), {
      effectiveFolderSourceGhostedIds: new Set([folder.id]),
      folderHandoffEntries: new Map([[folder.id, {
        cleanupFrame: { cancelled: false },
        folderId: folder.id,
        visualReleased: true,
      }]]),
      folderLayer: {
        folderHandoff: makeHandoffCoordinator(false, null),
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: () => false,
      },
    });

    const [entry] = plan.entries;
    assert(entry.isActiveFolderClosingHandoff === true, "test setup should retain the closing handoff id for this folder");
    assert(entry.isFolderClosingHandoff === false, "released handoff entries should not keep suppressing desktop hover");
    assert(entry.nodeState.folderHoverState === null, "folder drop hover should be owned by the independent drop target layer, not IconNode");
    assert(entry.nodeState.dropTarget === false, "folder drop target selection frame should be disabled on IconNode");
    assert(entry.nodeState.suppressFolderThumbFrame === true, "folder drop hover should suppress IconNode's original folder thumb frame to avoid double backgrounds");
    assert(entry.nodeState.ghosted === false, "released handoff entries should keep the real folder visible while source ghosting settles");
    assert(plan.folderDropTarget?.targetId === folder.id, "released handoff entries should expose an independent folder drop target");
    assert(plan.folderDropTarget.iconSize === entry.nodeState.iconSize, "folder drop target should preserve the logical icon size for thumb geometry");
    assert(entry.nodeState.interactive === true && entry.nodeState.draggable === true, "released handoff entries should restore ordinary desktop icon interaction");
  }

  {
    const folder = { id: "folder-opening-source", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      folderSourceGhostedIds: new Set([folder.id]),
      singleStageFolderState: {
        renderedFolder: folder,
      },
    }), {
      effectiveFolderSourceGhostedIds: new Set([folder.id]),
      folderHandoffEntries: new Map([[folder.id, {
        cleanupFrame: { cancelled: false },
        folderId: folder.id,
        visualReleased: true,
      }]]),
      folderLayer: {
        folderHandoff: makeHandoffCoordinator(false, null),
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: () => false,
      },
    });

    const [entry] = plan.entries;
    assert(entry.isActiveFolderClosingHandoff === false, "test setup should model a new open without an active closing handoff");
    assert(entry.folderPresentation.handoff.retainsSourceVisibility === false, "released closing handoff state should not retain visibility during a new open");
    assert(entry.nodeState.ghosted === true, "opening source ghosting should hide the real desktop folder even with a released stale handoff entry");
  }

  {
    const folder = { id: "folder-close-tail", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      folderSourceGhostedIds: new Set([folder.id]),
      singleStageFolderState: {
        isFolderClosing: true,
        renderedFolder: folder,
      },
    }), {
      effectiveFolderSourceGhostedIds: new Set([folder.id]),
      folderHandoffEntries: new Map([[folder.id, {
        cleanupFrame: { cancelled: false },
        folderId: folder.id,
        visualReleased: true,
      }]]),
      folderLayer: {
        folderHandoff: makeHandoffCoordinator(false, null),
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: () => false,
      },
    });

    const [entry] = plan.entries;
    assert(entry.isActiveFolderClosingHandoff === false, "test setup should model the frame after the closing id clears");
    assert(entry.folderPresentation.handoff.retainsSourceVisibility === true, "released close tail should retain source visibility while source ghosting settles");
    assert(entry.nodeState.ghosted === false, "released close tail should keep the real desktop folder visible for handoff");
  }

  {
    const app = { id: "app-create-target", type: "app" };
    const hoverState = {
      key: "app-create-hover",
      phase: "hover",
      targetId: app.id,
      targetType: "app",
    };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[app]],
      dragFolderHoverState: hoverState,
      dragFolderTargetId: app.id,
    }));

    const [entry] = plan.entries;
    assert(entry.nodeState.folderHoverState === hoverState, "app folder-create hover should still be handled by IconNode");
    assert(entry.nodeState.dropTarget === true, "app folder-create target should still receive the drop target state");
    assert(plan.folderDropTarget === null, "app folder-create hover should not use the folder drop target layer");
  }

  {
    const folder = { id: "folder-exit-held", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      dragFolderHoverState: null,
      dragFolderTargetId: null,
    }), {
      folderDropFrameSuppressedIds: new Set([folder.id]),
    });

    const [entry] = plan.entries;
    assert(plan.folderDropTarget === null, "held exit suppression should not create a new active folder drop target");
    assert(entry.nodeState.suppressFolderThumbFrame === true, "held exit suppression should keep the IconNode thumb frame hidden until the shrink-out layer finishes");
  }

  {
    const folder = { id: "folder-exit-restored", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      dragFolderHoverState: null,
      dragFolderTargetId: null,
    }), {
      folderDropFrameSuppressedIds: new Set(),
    });

    const [entry] = plan.entries;
    assert(entry.nodeState.suppressFolderThumbFrame === false, "without active or held folder drop ownership, IconNode should draw its normal thumb frame");
  }

  {
    const folder = { id: "folder-signature", type: "folder" };
    let nodeTouched = false;
    const node = {};
    Object.defineProperty(node, "expensivePixiGraph", {
      enumerable: true,
      get() {
        nodeTouched = true;
        throw new Error("desktop render plan signature touched the Pixi node graph");
      },
    });

    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      dragFolderHoverState: {
        key: "folder-hover-signature",
        phase: "hover",
        targetId: folder.id,
        targetType: "folder",
      },
      folderClosingHandoffIds: new Set([folder.id]),
      folderSourceGhostedIds: new Set([folder.id]),
    }), {
      effectiveFolderSourceGhostedIds: new Set([folder.id]),
      folderHandoffEntries: new Map([[folder.id, {
        cleanupFrame: { cancelled: false },
        folderId: folder.id,
        node,
        visualReleased: true,
      }]]),
      folderLayer: {
        folderHandoff: makeHandoffCoordinator(false, null),
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: () => false,
      },
    });

    assert(plan.signature && typeof plan.signature === "string", "plan should still produce a stable signature");
    assert(nodeTouched === false, "plan signature should summarize handoff presentation without traversing Pixi nodes");
  }

  {
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[]],
      isSearchMode: true,
    }));

    assert(plan.entries.length === 0, "empty search page should have no entries");
    assert(plan.emptyText.visible === true, "empty search page should show empty text");
    assert(plan.emptyText.x === 200 && plan.emptyText.y === 150, "empty text should be centered in the desktop frame");
    assert(plan.clearLaunchArea === "search", "search mode should clear search launch bounds");
    assert(plan.pageTrack.scope === "search", "search plans should mark the page track scope as search");
  }

  {
    const folderA = { id: "folder-a", type: "folder" };
    const folderB = { id: "folder-b", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folderA, folderB]],
      dragReleaseState: {
        suppressFolderPreviewChildId: "app-a",
        suppressFolderPreviewFolderId: "folder-b",
      },
      gridCols: 2,
      gridRows: 1,
    }));

    assert(plan.entries[0].nodeState.suppressedFolderPreviewChildId == null, "non-target folder should not receive preview child suppression");
    assert(plan.entries[1].nodeState.suppressedFolderPreviewChildId === "app-a", "target folder should receive preview child suppression");
  }

  {
    const folder = { id: "folder-created", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      folderCreateReleaseState: {
        folderId: folder.id,
        key: "folder-create-release",
      },
    }));

    const [entry] = plan.entries;
    assert(entry.nodeState.ghosted === true, "folder-create release should ghost the real created folder until the handoff completes");
    assert(entry.nodeState.suppressedFolderPreviewChildId == null, "folder-create release should not reuse the single child suppression path");
    assert(entry.nodeState.suppressLabelRevealAfterGhost === false, "folder-create release should let the real folder label reveal after the handoff");
  }

  {
    const folder = { id: "folder-static", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      folderSourceGhostedIds: new Set([folder.id]),
      getDesktopPageRenderMode: () => "static-real",
    }), {
      effectiveFolderSourceGhostedIds: new Set([folder.id]),
    });

    const [entry] = plan.entries;
    assert(entry.isInteractivePage === false, "static-real pages should stay non-interactive");
    assert(entry.nodeState.interactive === false, "static-real source ghosting should not re-enable interaction");
    assert(entry.nodeState.ghosted === true, "static-real source ghosting should still hide the real folder icon");
    assert(entry.nodeState.suppressLabelRevealAfterGhost === true, "source ghosting should restore the folder label immediately instead of restarting a fade");
  }
}
