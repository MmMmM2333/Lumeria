import {
  GROUP_TRANSFER_Z_BAND,
  makeGroupTransferPresentation,
  type CurrentGroupTransferActor,
  type GroupTransferActor,
  type GroupTransferPresentationMember,
} from "./groupTransferPresentation.js";
import type { GroupTransferLocation } from "./groupTransferPlanner.js";
import type { GroupTransferAppItem } from "./groupTransferSourceCapture.js";

type Assert = (condition: unknown, message: string) => asserts condition;

function app(id: string): GroupTransferAppItem {
  return { id, name: id, type: "app" };
}

function member(
  id: string,
  source: GroupTransferLocation,
  destination: GroupTransferLocation | null = null,
  sourceOrder = 0,
  role = "selected",
): GroupTransferPresentationMember {
  return {
    destination,
    id,
    item: app(id),
    role,
    selected: role !== "folder-create-target",
    source,
    sourceOrder,
  };
}

function memberOwners(actors: readonly (GroupTransferActor | CurrentGroupTransferActor)[]) {
  const owners = new Map<string, string[]>();
  for (const actor of actors) {
    for (const id of actor.memberIds || []) {
      owners.set(id, [...(owners.get(id) || []), actor.key]);
    }
  }
  return owners;
}

function assertSingleOwnership(
  assert: Assert,
  actors: readonly GroupTransferActor[],
  expectedIds: readonly string[],
  message: string,
): void {
  const owners = memberOwners(actors);
  for (const id of expectedIds) {
    assert(owners.get(id)?.length === 1, `${message}: ${id} must have exactly one actor owner`);
  }
  assert(owners.size === expectedIds.length, `${message}: actors must not own unrelated members`);
}

export function runGroupTransferPresentationTests() {
  const assert: Assert = (condition, message) => {
    if (!condition) throw new Error(`[Group transfer presentation test failed] ${message}`);
  };

  const gatherMembers = [
    member("desktop-left", { kind: "desktop", pageIndex: 0, index: 0 }, null, 0),
    member("lead", { kind: "desktop", pageIndex: 1, index: 0 }, null, 1),
    member("desktop-visible", { kind: "desktop", pageIndex: 1, index: 1 }, null, 2),
    member("desktop-right", { kind: "desktop", pageIndex: 2, index: 0 }, null, 3),
    member("folder-left", {
      flatIndex: 0,
      folderId: "open-folder",
      folderPageIndex: 0,
      index: 0,
      kind: "folder",
      ownerIndex: 2,
      ownerPageIndex: 1,
    }, null, 4),
    member("folder-visible", {
      flatIndex: 3,
      folderId: "open-folder",
      folderPageIndex: 1,
      index: 0,
      kind: "folder",
      ownerIndex: 2,
      ownerPageIndex: 1,
    }, null, 5),
    member("folder-right", {
      flatIndex: 6,
      folderId: "open-folder",
      folderPageIndex: 2,
      index: 0,
      kind: "folder",
      ownerIndex: 2,
      ownerPageIndex: 1,
    }, null, 6),
    member("closed-preview", {
      flatIndex: 2,
      folderId: "closed-folder",
      folderPageIndex: 0,
      index: 2,
      kind: "folder",
      ownerIndex: 3,
      ownerPageIndex: 1,
    }, null, 7),
    member("closed-hidden", {
      flatIndex: 10,
      folderId: "closed-folder",
      folderPageIndex: 2,
      index: 1,
      kind: "folder",
      ownerIndex: 3,
      ownerPageIndex: 1,
    }, null, 8),
  ];
  const gather = makeGroupTransferPresentation({
    currentActors: [],
    currentView: {
      desktopPageIndex: 1,
      folderPageIndex: 1,
      leadId: "lead",
      openFolderId: "open-folder",
    },
    limits: { maxBundles: 4, maxGatherActors: 12 },
    phase: "gather",
    sourceMembers: gatherMembers,
  });
  assertSingleOwnership(
    assert,
    gather.actors,
    gatherMembers.map((entry) => entry.id),
    "gather"
  );
  const leadActor = gather.actors.find((actor) => actor.role === "lead");
  assert(leadActor?.memberIds.join(",") === "lead", "gather should keep the lead as an exact actor");
  assert(
    leadActor.zBand === GROUP_TRANSFER_Z_BAND.LEAD &&
      gather.actors.every((actor) => actor.role === "lead" || actor.zBand < leadActor.zBand),
    "lead z-band should remain above every target or follower actor"
  );
  assert(
    gather.actors.some((actor) => actor.endAnchor.kind === "captured-current-pose"),
    "gather actors should converge on a render-clock pose independent of pointermove"
  );
  assert(
    gather.actors.some((actor) => actor.startAnchor.kind === "desktop-page-edge-left") &&
      gather.actors.some((actor) => actor.startAnchor.kind === "desktop-page-edge-right") &&
      gather.actors.some((actor) => actor.startAnchor.kind === "folder-page-edge-left") &&
      gather.actors.some((actor) => actor.startAnchor.kind === "folder-page-edge-right"),
    "gather should preserve independent desktop and open-folder page directions"
  );
  const folderLeftGatherActor = gather.actors.find(
    (actor) => actor.memberIds.includes("folder-left")
  );
  assert(
    folderLeftGatherActor?.startAnchor?.itemId === "folder-left" &&
      folderLeftGatherActor.startAnchor.index === 0 &&
      !("laneY" in folderLeftGatherActor.startAnchor),
    "folder page-edge anchors should preserve their semantic slot instead of freezing a normalized viewport lane"
  );

  const rowMembers = [
    member("remote-top", { kind: "desktop", pageIndex: 0, index: 0 }, null, 0),
    member("remote-bottom", { kind: "desktop", pageIndex: 0, index: 6 }, null, 1),
    member("row-lead", { kind: "desktop", pageIndex: 1, index: 0 }, null, 2),
  ];
  const rowGather = makeGroupTransferPresentation({
    currentActors: [],
    currentView: {
      desktopPageIndex: 1,
      folderPageIndex: 0,
      leadId: "row-lead",
      openFolderId: null,
    },
    limits: {
      desktopCols: 3,
      desktopRows: 3,
      maxBundles: 6,
      maxGatherActors: 12,
    },
    phase: "gather",
    sourceMembers: rowMembers,
  });
  const rowGatherBundles = rowGather.actors
    .filter((actor) => actor.startAnchor.kind === "desktop-page-edge-left")
    .sort((left, right) => (left.startAnchor.laneY ?? 0) - (right.startAnchor.laneY ?? 0));
  const topRowGatherBundle = rowGatherBundles[0];
  const bottomRowGatherBundle = rowGatherBundles[1];
  assert(
    rowGatherBundles.length === 2 &&
      topRowGatherBundle?.startAnchor.laneY != null &&
      bottomRowGatherBundle?.startAnchor.laneY != null &&
      Math.abs(topRowGatherBundle.startAnchor.laneY - 1 / 6) < 0.0001 &&
      Math.abs(bottomRowGatherBundle.startAnchor.laneY - 5 / 6) < 0.0001,
    "remote desktop actors from different source rows should keep independent normalized edge lanes"
  );
  const rowReturn = makeGroupTransferPresentation({
    currentActors: rowGather.actors,
    currentView: {
      desktopPageIndex: 1,
      folderPageIndex: 0,
      leadId: "row-lead",
      openFolderId: null,
    },
    limits: {
      desktopCols: 3,
      desktopRows: 3,
      maxBundles: 6,
    },
    phase: "return",
    sourceMembers: rowMembers,
  });
  const rowReturnBundles = rowReturn.actors
    .filter((actor) => actor.endAnchor.kind === "desktop-page-edge-left")
    .sort((left, right) => (left.endAnchor.laneY ?? 0) - (right.endAnchor.laneY ?? 0));
  assert(
    rowReturnBundles.length === 2 &&
      rowReturnBundles.every((actor, index) => (
        rowGatherBundles[index] != null &&
        actor.continuityKey === rowGatherBundles[index]!.continuityKey &&
        actor.key !== rowGatherBundles[index]!.key
      )),
    "gather and return bundles should preserve visual continuity without conflating phase ownership keys"
  );

  const releaseMembers = [
    member("visible-0", { kind: "desktop", pageIndex: 0, index: 0 }, { kind: "desktop", pageIndex: 2, index: 0 }, 0),
    member("visible-1", { kind: "desktop", pageIndex: 1, index: 0 }, { kind: "desktop", pageIndex: 2, index: 1 }, 1),
    member("left", { kind: "desktop", pageIndex: 0, index: 1 }, { kind: "desktop", pageIndex: 1, index: 0 }, 2),
    member("right", { kind: "desktop", pageIndex: 3, index: 0 }, { kind: "desktop", pageIndex: 3, index: 0 }, 3),
  ];
  const release = makeGroupTransferPresentation({
    currentActors: [{ key: "item:left", memberIds: ["left"], role: "exact" }],
    currentView: { desktopPageIndex: 2, folderPageIndex: 0, leadId: "visible-0", openFolderId: null },
    limits: { desktopPageSize: 4, maxBundles: 4, maxContinuityActors: 12 },
    phase: "release",
    transferPlan: {
      effects: {
        createdFolderId: null,
        finalDesktopPageIndex: 2,
        finalFolderPageIndex: null,
        finalOpenFolderId: null,
      },
      members: releaseMembers,
      status: "accepted",
    },
  });
  assertSingleOwnership(assert, release.actors, releaseMembers.map((entry) => entry.id), "release");
  assert(
    release.actors.filter((actor) => actor.endAnchor.kind === "desktop-slot").length === 2,
    "release should render every selected member landing on the current desktop page exactly"
  );
  assert(
    release.actors.find((actor) => actor.memberIds.includes("left"))?.role === "exact",
    "release should retain an existing exact actor for continuity even when its destination is offscreen"
  );
  assert(
    release.actors.some((actor) => actor.endAnchor.kind === "desktop-page-edge-right"),
    "remaining offscreen destinations should collapse into directional bundles"
  );

  const closedMembers = Array.from({ length: 13 }, (_, index) => member(
    `closed-${index}`,
    { kind: "desktop", pageIndex: 0, index },
    {
      flatIndex: index,
      folderId: "created-folder",
      folderPageIndex: Math.floor(index / 4),
      index: index % 4,
      kind: "folder",
      ownerIndex: 0,
      ownerPageIndex: 0,
    },
    index
  ));
  const closedRelease = makeGroupTransferPresentation({
    currentActors: [],
    currentView: { desktopPageIndex: 0, folderPageIndex: 0, leadId: "closed-0", openFolderId: null },
    limits: { folderPageSize: 4, maxBundles: 4, maxContinuityActors: 12 },
    phase: "release",
    transferPlan: {
      effects: {
        createdFolderId: "created-folder",
        finalDesktopPageIndex: 0,
        finalFolderPageIndex: null,
        finalOpenFolderId: null,
      },
      members: closedMembers,
      status: "accepted",
    },
  });
  assertSingleOwnership(assert, closedRelease.actors, closedMembers.map((entry) => entry.id), "closed-folder release");
  assert(
    closedRelease.actors.filter((actor) => actor.endAnchor.kind === "folder-preview-slot").length === 9,
    "closed/new folder release should exactly render the final first nine preview members"
  );
  const overflowActor = closedRelease.actors.find((actor) => actor.endAnchor.kind === "folder-center");
  assert(
    overflowActor?.role === "bundle" && overflowActor.bundleCount === 4 &&
      overflowActor.alphaPolicy.kind === "fade-out",
    "closed-folder overflow should use one monotonic +N center aggregate"
  );
  assert(
    closedRelease.actors.some((actor) => actor.role === "folder-shell"),
    "new folder framing should be an ordinary folder-shell actor"
  );

  const centerContinuityMember = member(
    "center-continuity",
    { kind: "desktop", pageIndex: 0, index: 4 },
    {
      flatIndex: 9,
      folderId: "existing-folder",
      folderPageIndex: 1,
      index: 0,
      kind: "folder",
      ownerIndex: 6,
      ownerPageIndex: 0,
    },
    0
  );
  const centerContinuityRelease = makeGroupTransferPresentation({
    currentActors: [{
      continuityKey: "item:center-continuity",
      key: "item:center-continuity",
      memberIds: ["center-continuity"],
      role: "lead",
    }],
    currentView: {
      desktopPageIndex: 0,
      folderPageIndex: 0,
      leadId: "center-continuity",
      openFolderId: null,
    },
    limits: { folderPageSize: 9, maxBundles: 4, maxContinuityActors: 12 },
    phase: "release",
    transferPlan: {
      effects: {
        createdFolderId: null,
        finalDesktopPageIndex: 0,
        finalFolderPageIndex: null,
        finalOpenFolderId: null,
      },
      members: [centerContinuityMember],
      status: "accepted",
    },
  });
  const centerContinuityActor = centerContinuityRelease.actors[0];
  assert(
    centerContinuityActor?.role === "bundle" &&
      centerContinuityActor.key === "bundle:release:folder-center:existing-folder" &&
      centerContinuityActor.continuityKey === "item:center-continuity" &&
      centerContinuityActor.startAnchor?.actorKey === "item:center-continuity",
    "a center-absorb bundle should retain the currently visible actor node and pose while taking new semantic ownership"
  );

  const returning = makeGroupTransferPresentation({
    currentActors: gather.actors,
    currentView: {
      desktopPageIndex: 1,
      folderPageIndex: 1,
      leadId: "lead",
      openFolderId: null,
    },
    limits: { desktopPageSize: 4, folderPageSize: 3, maxBundles: 4 },
    phase: "return",
    sourceMembers: gatherMembers,
  });
  assertSingleOwnership(assert, returning.actors, gatherMembers.map((entry) => entry.id), "return");
  assert(
    returning.actors.some((actor) => actor.endAnchor.kind === "folder-preview-slot") &&
      returning.actors.some((actor) => actor.endAnchor.kind === "folder-center") &&
      returning.actors.some((actor) => actor.endAnchor.kind === "desktop-page-edge-left"),
    "return should resolve closed-folder previews, hidden centers, and desktop page edges from semantic sources"
  );
  assert(
    [gather, release, closedRelease, returning].every((plan) => (
      plan.actors.every((actor) => actor.startAnchor?.kind)
    )),
    "every presentation actor should declare a semantic or captured-pose start anchor"
  );

  const visibilityMembers = [
    member("desktop-behind-folder", { kind: "desktop", pageIndex: 1, index: 4 }, null, 0),
    member("folder-other-page", {
      flatIndex: 0,
      folderId: "open-folder",
      folderPageIndex: 0,
      index: 0,
      kind: "folder",
      ownerIndex: 2,
      ownerPageIndex: 1,
    }, null, 1),
    member("folder-visible-lead", {
      flatIndex: 4,
      folderId: "open-folder",
      folderPageIndex: 1,
      index: 1,
      kind: "folder",
      ownerIndex: 2,
      ownerPageIndex: 1,
    }, null, 2),
  ];
  const visibilityReturn = makeGroupTransferPresentation({
    currentActors: [
      { key: "item:desktop-behind-folder", memberIds: ["desktop-behind-folder"], role: "exact" },
      { key: "bundle:gather:folder-left", memberIds: ["folder-other-page"], role: "bundle" },
      { key: "item:folder-visible-lead", memberIds: ["folder-visible-lead"], role: "lead" },
    ],
    currentView: {
      desktopPageIndex: 1,
      folderPageIndex: 1,
      leadId: "folder-visible-lead",
      openFolderId: "open-folder",
    },
    limits: {
      desktopCols: 3,
      desktopRows: 3,
      folderCols: 3,
      folderRows: 3,
      maxBundles: 6,
    },
    phase: "return",
    sourceMembers: visibilityMembers,
  });
  const desktopEgressActor = visibilityReturn.actors.find(
    (actor) => actor.memberIds.includes("desktop-behind-folder")
  );
  const clippedFolderActor = visibilityReturn.actors.find(
    (actor) => actor.memberIds.includes("folder-other-page")
  );
  assert(
    desktopEgressActor?.visibilityPolicy?.kind === "desktop-occluded-egress" &&
      desktopEgressActor.alphaPolicy.kind === "fade-out",
    "desktop return actors hidden behind an open folder should leave through the panel edge while fading"
  );
  assert(
    clippedFolderActor?.visibilityPolicy?.kind === "folder-panel-clip" &&
      clippedFolderActor.alphaPolicy.kind === "handoff",
    "remote-page folder actors should stay opaque and use the outer folder-panel clip"
  );
}
