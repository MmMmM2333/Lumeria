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
    focusedIcon: null,
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
      groupDragState: { phase: "dragging" },
      groupTransferOwnedItemIds: new Set([app.id]),
      folderClosingHandoffIds: new Set([folder.id]),
      isIconOpening: (area, itemId) => area === "desktop" && itemId === app.id,
      focusedIcon: { area: "desktop", folderId: null, id: app.id, pageIndex: 0 },
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
    assert(appEntry.nodeState.opening === true && appEntry.nodeState.focused === true, "app entry should preserve icon focus and opening state");
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
    assert(plan.folderDropTargetExit?.mode === "immediate", "opening render plans should request immediate drop-frame retirement");
    assert(plan.folderDropTargetExit?.targetId === folder.id, "opening render plans should target the opening folder's drop frame");
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
    const selectedChildA = { id: "app-a", type: "app" };
    const selectedChildB = { id: "app-b", type: "app" };
    const unselectedChild = { id: "app-c", type: "app" };
    const folderA = {
      childPages: [[unselectedChild]],
      children: [unselectedChild],
      id: "folder-a",
      type: "folder",
    };
    const folderB = {
      childPages: [[selectedChildA, unselectedChild, selectedChildB]],
      children: [selectedChildA, unselectedChild, selectedChildB],
      id: "folder-b",
      type: "folder",
    };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folderA, folderB]],
      dragMeta: {
        draggedIds: [selectedChildA.id, selectedChildB.id],
        item: selectedChildA,
      },
      groupDragState: { phase: "dragging" },
      groupTransferOwnedItemIds: new Set([selectedChildA.id, selectedChildB.id]),
      gridCols: 2,
      gridRows: 1,
    }));

    assert(plan.entries[0].nodeState.suppressedFolderPreviewChildIds.length === 0, "folders without dragged children should not suppress preview slots");
    assert(
      plan.entries[1].nodeState.suppressedFolderPreviewChildIds.join(",") === "app-a,app-b",
      "every dragged child represented in the first nine preview slots should transfer visual ownership"
    );
  }

  {
    const folder = { id: "folder-created", type: "folder" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
    }));

    const [entry] = plan.entries;
    assert(entry.nodeState.ghosted === false, "new folders should be rendered by the normal desktop path");
    assert(entry.nodeState.suppressedFolderPreviewChildIds.length === 0, "folders without dragged preview children should not suppress slots");
    assert(entry.nodeState.suppressLabelRevealAfterGhost === false, "normal folders should not suppress their labels");
  }

  {
    const appA = { id: "return-label-a", type: "app" };
    const appB = { id: "return-label-b", type: "app" };
    const makeReturnPlan = (phase) => buildDesktopRenderPlan(makeBaseState({
      activePages: [[appA, appB]],
      dragMeta: { draggedIds: [appA.id, appB.id], item: appA },
      groupDragState: { phase, totalCount: 2 },
      groupTransferOwnedItemIds: new Set([appA.id, appB.id]),
      isBatchSelectionActive: true,
    }));
    const returningPlan = makeReturnPlan("returning");
    assert(
      returningPlan.entries.every((entry) => entry.nodeState.revealLabelAfterVisualHandoff === true),
      "every visible batch item returning to origin should carry the deferred label reveal intent"
    );
    const acceptedPlan = makeReturnPlan("releasing");
    assert(
      acceptedPlan.entries.every((entry) => entry.nodeState.revealLabelAfterVisualHandoff === true),
      "accepted point handoffs should fade labels in after visual ownership transfers"
    );
  }

  {
    const app = { id: "single-return-label", type: "app" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[app]],
      dragMeta: { draggedIds: [app.id], item: app },
      groupDragState: {
        phase: "returning",
        totalCount: 1,
        visualSpec: { textless: false },
      },
      groupTransferOwnedItemIds: new Set([app.id]),
    }));
    assert(
      plan.entries[0].nodeState.revealLabelAfterVisualHandoff === false,
      "a labeled single-icon ghost should hand its already-visible label back without restarting a fade"
    );
  }

  {
    const app = { id: "single-return-size-mismatch", type: "app" };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[app]],
      dragMeta: { draggedIds: [app.id], item: app },
      groupDragState: {
        phase: "returning",
        totalCount: 1,
        visualSpec: {
          cellHeight: 132,
          cellWidth: 116,
          compact: false,
          iconSize: 88,
          singleLineLabel: false,
          textless: false,
        },
      },
      groupTransferOwnedItemIds: new Set([app.id]),
    }));
    assert(
      plan.entries[0].nodeState.revealLabelAfterVisualHandoff === true,
      "a single-icon handoff with different target sizing should defer the target label until visual ownership changes",
    );
  }

  {
    const app = { id: "single-desktop-release-label", type: "app" };
    const makeReleasePlan = (owned) => buildDesktopRenderPlan(makeBaseState({
      activePages: [[app]],
      dragMeta: {
        item: app,
        source: { folderId: "folder-source", type: "folder" },
      },
      groupDragState: {
        outcome: "accepted",
        phase: "releasing",
        runtimePlan: {
          entries: [{
            id: app.id,
            memberIds: [app.id],
            mode: "point-handoff",
            target: { area: "desktop", id: app.id, kind: "desktop" },
          }],
        },
        totalCount: 1,
        visualSpec: {
          cellHeight: 104,
          cellWidth: 86,
          compact: false,
          iconSize: 64,
          singleLineLabel: false,
          textless: false,
        },
      },
      groupTransferOwnedItemIds: owned ? new Set([app.id]) : new Set(),
    }));
    const ownedPlan = makeReleasePlan(true);
    const releasedPlan = makeReleasePlan(false);
    assert(
      ownedPlan.entries[0].nodeState.ghosted === true &&
        ownedPlan.entries[0].nodeState.revealLabelAfterVisualHandoff === false,
      "accepted desktop point releases should keep the real node hidden without arming a redundant label fade",
    );
    assert(
      releasedPlan.entries[0].nodeState.ghosted === false &&
        releasedPlan.entries[0].nodeState.revealLabelAfterVisualHandoff === false,
      "accepted desktop point releases should reveal the settled desktop label immediately after actor ownership ends",
    );
  }

  {
    const folder = { id: "folder-created-release", type: "folder" };
    const makePlanForPhase = (phase) => buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      groupDragState: phase ? { phase } : null,
      groupTransferOwnedFolderShellIds: phase ? new Set([folder.id]) : new Set(),
    }));

    const committingEntry = makePlanForPhase("committing").entries[0];
    const acceptedEntry = makePlanForPhase("releasing").entries[0];
    const idleEntry = makePlanForPhase(null).entries[0];
    assert(committingEntry.nodeState.ghosted === true, "the new real folder should stay hidden while its target app joins the release layer");
    assert(acceptedEntry.nodeState.ghosted === true, "the new real folder should stay hidden through staggered landing");
    assert(idleEntry.nodeState.ghosted === false, "the new real folder should appear after group visual ownership ends");
    assert(
      acceptedEntry.nodeState.suppressLabelRevealAfterGhost === false,
      "folder creation release should use the normal reveal instead of inheriting folder handoff label suppression"
    );
  }

  {
    const folder = { id: "folder-desktop-owned", type: "folder" };
    const ownedEntry = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      dragMeta: { draggedIds: [folder.id], item: folder },
      groupDragState: { phase: "dragging", totalCount: 1 },
      groupTransferOwnedItemIds: new Set([folder.id]),
    })).entries[0];
    const releasedEntry = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      dragMeta: { draggedIds: [folder.id], item: folder },
      groupDragState: { phase: "releasing", totalCount: 1 },
      groupTransferOwnedItemIds: new Set(),
    })).entries[0];

    assert(ownedEntry.nodeState.ghosted === true, "an existing desktop folder should hide its real node while the transfer actor owns it");
    assert(
      ownedEntry.nodeState.suppressLabelRevealAfterGhost === true,
      "an ordinary desktop folder transfer should keep the existing label visible when the real node is restored"
    );
    assert(releasedEntry.nodeState.ghosted === false, "the desktop folder should become visible after transfer ownership ends");
    assert(
      releasedEntry.nodeState.suppressLabelRevealAfterGhost === false,
      "label suppression should be scoped to the ownership frame instead of leaking into idle desktop rendering"
    );
  }

  {
    const targetApp = { id: "folder-release-target", type: "app" };
    const draggedApp = { id: "folder-release-dragged", type: "app" };
    const folder = {
      childPages: [[targetApp, draggedApp]],
      children: [targetApp, draggedApp],
      id: "folder-created-preview-ownership",
      type: "folder",
    };
    const plan = buildDesktopRenderPlan(makeBaseState({
      activePages: [[folder]],
      dragMeta: {
        draggedIds: [draggedApp.id],
        item: draggedApp,
      },
      groupDragState: {
        phase: "releasing",
      },
      groupTransferOwnedFolderShellIds: new Set([folder.id]),
      groupTransferOwnedItemIds: new Set([draggedApp.id, targetApp.id]),
    }));

    assert(
      plan.entries[0].nodeState.suppressedFolderPreviewChildIds.join(",") ===
        `${targetApp.id},${draggedApp.id}`,
      "created-folder release must suppress both the dragged app and the app that was the drop target from the committed thumbnail"
    );
  }

  {
    const lead = { id: "release-layout-lead", type: "app" };
    const selected = { id: "release-layout-selected", type: "app" };
    const follower = { id: "release-layout-follower", type: "app" };
    const tail = { id: "release-layout-tail", type: "app" };
    const folder = {
      childPages: [[lead, selected]],
      children: [lead, selected],
      id: "release-layout-folder",
      type: "folder",
    };
    const basePages = [[lead, selected, follower, tail]];
    const committedPages = [[folder, follower, tail]];
    const basePlan = buildDesktopRenderPlan(makeBaseState({
      activePages: basePages,
      gridCols: 4,
      gridRows: 1,
    }));
    const releasePlan = buildDesktopRenderPlan(makeBaseState({
      activePages: committedPages,
      dragMeta: { draggedIds: [lead.id, selected.id], item: lead },
      gridCols: 4,
      gridRows: 1,
      groupDragState: {
        phase: "releasing",
      },
      groupTransferOwnedFolderShellIds: new Set([folder.id]),
      groupTransferOwnedItemIds: new Set([lead.id, selected.id]),
    }));
    const settledPlan = buildDesktopRenderPlan(makeBaseState({
      activePages: committedPages,
      gridCols: 4,
      gridRows: 1,
    }));
    const getTarget = (plan, id) => plan.entries.find((entry) => entry.item.id === id)?.layoutTarget;
    const baseLeadTarget = getTarget(basePlan, lead.id);
    const releaseFolderTarget = getTarget(releasePlan, folder.id);
    const releaseFollowerTarget = getTarget(releasePlan, follower.id);
    const settledFolderTarget = getTarget(settledPlan, folder.id);
    const settledFollowerTarget = getTarget(settledPlan, follower.id);

    assert(
      releaseFolderTarget.x === settledFolderTarget.x && releaseFolderTarget.y === settledFolderTarget.y &&
        releaseFolderTarget.x === baseLeadTarget.x && releaseFolderTarget.y === baseLeadTarget.y,
      "the owned folder shell should use the authoritative committed folder slot"
    );
    assert(
      releaseFollowerTarget.x === settledFollowerTarget.x && releaseFollowerTarget.y === settledFollowerTarget.y,
      "unselected desktop icons should use the committed layout without a second held-layout source"
    );
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
