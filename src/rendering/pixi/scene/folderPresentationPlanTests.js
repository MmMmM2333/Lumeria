import { resolveFolderPresentationState } from "./folderPresentationPlan.js";

function makeReleasedEntry(folderId) {
  return {
    cleanupFrame: { cancelled: false },
    folderId,
    visualReleased: true,
  };
}

export function runFolderPresentationPlanTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder presentation plan test failed] ${message}`);
  };

  {
    const folderId = "folder-released";
    const hoverState = {
      key: "hover-released",
      phase: "hover",
      targetId: folderId,
      targetType: "folder",
    };
    const presentation = resolveFolderPresentationState({
      dragFolderHoverState: hoverState,
      dragFolderTargetId: folderId,
      existingHandoffEntry: makeReleasedEntry(folderId),
      folderId,
      geometry: {
        stableRect: { height: 64, left: 100, top: 80, width: 64 },
      },
      isActiveClosingHandoff: true,
      isEffectiveSourceGhosted: true,
      isInteractivePage: true,
      isRawSourceGhosted: true,
      isSearchMode: false,
    });

    assert(presentation.phase === "closingHandoffReleased", "released handoff should get its own presentation phase");
    assert(presentation.handoff.blocksHover === false, "released handoff should not block hover");
    assert(presentation.handoff.syncsNode === false, "released handoff should not re-sync the desktop node");
    assert(presentation.handoff.retainsSourceVisibility === true, "released handoff should retain source visibility while ghosting is settling");
    assert(presentation.handoff.pinsLayout === true, "released handoff should pin layout until cleanup settles");
    assert(presentation.sourceVisible === true, "released source should remain visible even with raw source ghosting");
    assert(presentation.acceptsDropHover === true, "released handoff should accept folder drop hover");
    assert(presentation.isSourceGhosted === false, "retained source visibility should suppress node ghosting");
    assert(presentation.dropTarget?.active === true, "released handoff should expose an independent drop target");
    assert(presentation.dropTarget.iconSize === 64, "drop target should carry the logical folder icon size for thumb geometry");
    assert(presentation.dropTarget.hoverState === hoverState, "drop target should preserve the active hover intent");
  }

  {
    const folderId = "folder-hidden";
    const presentation = resolveFolderPresentationState({
      existingHandoffEntry: { folderId, visualReleased: false },
      folderId,
      geometry: {
        stableRect: { height: 64, left: 100, top: 80, width: 64 },
      },
      isActiveClosingHandoff: true,
      isEffectiveSourceGhosted: true,
      isInteractivePage: true,
      isRawSourceGhosted: true,
      isSearchMode: false,
    });

    assert(presentation.phase === "closingHandoffHidden", "unreleased handoff should stay in the hidden phase");
    assert(presentation.handoff.blocksHover === true, "hidden handoff should block hover");
    assert(presentation.handoff.syncsNode === true, "hidden handoff should keep syncing the desktop node");
    assert(presentation.sourceVisible === false, "hidden handoff should not expose the real source artwork");
    assert(presentation.acceptsDropHover === false, "hidden handoff should not accept drop hover");
    assert(presentation.dropTarget === null, "hidden handoff should not expose a drop target");
  }

  {
    const folderId = "folder-moving";
    const hoverState = {
      key: "hover-moving",
      phase: "hover",
      targetId: folderId,
      targetType: "folder",
    };
    const first = resolveFolderPresentationState({
      dragFolderHoverState: hoverState,
      folderId,
      geometry: {
        liveRect: { height: 64, left: 100, top: 80, width: 64 },
        stableRect: { height: 64, left: 120, top: 80, width: 64 },
      },
      isInteractivePage: true,
      isSearchMode: false,
    });
    const second = resolveFolderPresentationState({
      dragFolderHoverState: hoverState,
      folderId,
      geometry: {
        liveRect: { height: 64, left: 180, top: 80, width: 64 },
        stableRect: { height: 64, left: 120, top: 80, width: 64 },
      },
      isInteractivePage: true,
      isSearchMode: false,
    });

    assert(first.dropTarget.geometryVersion !== second.dropTarget.geometryVersion, "same targetId should get a new geometry version when the live rect changes");
    assert(second.geometry.hoverRect.left === 180, "hover rect should follow live/rendered geometry instead of the stable release rect");
    assert(second.geometry.releaseRect.left === 120, "release rect should remain stable/final when live geometry moves");
  }
}
