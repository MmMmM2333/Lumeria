import {
  GROUP_TRANSFER_Z_BAND,
  makeGroupTransferPresentation,
} from "./groupTransferPresentation.js";

function app(id) {
  return { id, name: id, type: "app" };
}

function member(id, source, destination = null, sourceOrder = 0, role = "selected") {
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

function memberOwners(actors) {
  const owners = new Map();
  for (const actor of actors) {
    for (const id of actor.memberIds || []) {
      owners.set(id, [...(owners.get(id) || []), actor.key]);
    }
  }
  return owners;
}

function assertSingleOwnership(assert, actors, expectedIds, message) {
  const owners = memberOwners(actors);
  for (const id of expectedIds) {
    assert(owners.get(id)?.length === 1, `${message}: ${id} must have exactly one actor owner`);
  }
  assert(owners.size === expectedIds.length, `${message}: actors must not own unrelated members`);
}

export function runGroupTransferPresentationTests() {
  const assert = (condition, message) => {
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
}
