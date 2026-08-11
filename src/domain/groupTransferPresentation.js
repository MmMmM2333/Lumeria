export const GROUP_TRANSFER_Z_BAND = Object.freeze({
  BUNDLE: 200,
  COUNT_BADGE: 1000,
  EXACT: 300,
  FOLDER_SHELL: 100,
  LEAD: 900,
});

const PREVIEW_SLOT_LIMIT = 9;

function normalizePositiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function cloneItem(item) {
  return item ? { ...item } : null;
}

function normalizeMembers(members) {
  const seen = new Set();
  return (members || [])
    .filter((member) => member?.id && member?.source && !seen.has(member.id) && seen.add(member.id))
    .map((member, index) => ({
      ...member,
      item: cloneItem(member.item),
      sourceOrder: Number.isFinite(Number(member.sourceOrder)) ? Number(member.sourceOrder) : index,
    }))
    .sort((left, right) => left.sourceOrder - right.sourceOrder);
}

function desktopSlotAnchor(location) {
  return {
    index: location.index,
    itemId: location.itemId || null,
    kind: "desktop-slot",
    pageIndex: location.pageIndex,
  };
}

function desktopEdgeAnchor(location, currentPageIndex) {
  const direction = location.pageIndex < currentPageIndex ? "left" : "right";
  return {
    direction,
    kind: `desktop-page-edge-${direction}`,
    pageIndex: location.pageIndex,
  };
}

function folderOpenSlotAnchor(location) {
  return {
    folderId: location.folderId,
    folderPageIndex: location.folderPageIndex,
    index: location.index,
    itemId: location.itemId || null,
    kind: "folder-open-slot",
  };
}

function folderPageEdgeAnchor(location, currentFolderPageIndex) {
  const direction = location.folderPageIndex < currentFolderPageIndex ? "left" : "right";
  return {
    direction,
    folderId: location.folderId,
    folderPageIndex: location.folderPageIndex,
    kind: `folder-page-edge-${direction}`,
  };
}

function folderPreviewAnchor(location) {
  return {
    folderId: location.folderId,
    itemId: location.itemId || null,
    kind: "folder-preview-slot",
    slotIndex: location.flatIndex,
  };
}

function folderCenterAnchor(location) {
  return {
    folderId: location.folderId,
    kind: "folder-center",
  };
}

function sourceAnchor(member, currentView) {
  const source = { ...member.source, itemId: member.id };
  const desktopPageIndex = Math.max(0, Number(currentView.desktopPageIndex) || 0);
  if (source.kind === "desktop") {
    return source.pageIndex === desktopPageIndex
      ? desktopSlotAnchor(source)
      : desktopEdgeAnchor(source, desktopPageIndex);
  }

  if (source.ownerPageIndex !== desktopPageIndex) {
    return desktopEdgeAnchor({ pageIndex: source.ownerPageIndex }, desktopPageIndex);
  }
  if (currentView.openFolderId === source.folderId) {
    const folderPageIndex = Math.max(0, Number(currentView.folderPageIndex) || 0);
    return source.folderPageIndex === folderPageIndex
      ? folderOpenSlotAnchor(source)
      : folderPageEdgeAnchor(source, folderPageIndex);
  }
  return Number(source.flatIndex) < PREVIEW_SLOT_LIMIT
    ? folderPreviewAnchor(source)
    : folderCenterAnchor(source);
}

function destinationAnchor(member, effects) {
  const destination = { ...member.destination, itemId: member.id };
  const finalDesktopPageIndex = Math.max(0, Number(effects.finalDesktopPageIndex) || 0);
  if (destination.kind === "desktop") {
    return destination.pageIndex === finalDesktopPageIndex
      ? desktopSlotAnchor(destination)
      : desktopEdgeAnchor(destination, finalDesktopPageIndex);
  }
  if (effects.finalOpenFolderId === destination.folderId) {
    const finalFolderPageIndex = Math.max(0, Number(effects.finalFolderPageIndex) || 0);
    return destination.folderPageIndex === finalFolderPageIndex
      ? folderOpenSlotAnchor(destination)
      : folderPageEdgeAnchor(destination, finalFolderPageIndex);
  }
  return Number(destination.flatIndex) < PREVIEW_SLOT_LIMIT
    ? folderPreviewAnchor(destination)
    : folderCenterAnchor(destination);
}

function anchorGroupKey(anchor) {
  if (!anchor) return "missing";
  if (anchor.kind.startsWith("desktop-page-edge-")) return anchor.kind;
  if (anchor.kind.startsWith("folder-page-edge-")) return `${anchor.kind}:${anchor.folderId}`;
  if (anchor.kind === "folder-center") return `${anchor.kind}:${anchor.folderId}`;
  return `${anchor.kind}:${anchor.itemId || anchor.folderId || anchor.pageIndex || 0}`;
}

function isExactAnchor(anchor) {
  return new Set([
    "desktop-slot",
    "folder-open-slot",
    "folder-preview-slot",
  ]).has(anchor?.kind);
}

function isFadingAnchor(anchor) {
  return Boolean(
    anchor?.kind === "folder-center" ||
    anchor?.kind?.startsWith("desktop-page-edge-") ||
    anchor?.kind?.startsWith("folder-page-edge-")
  );
}

function capturedPose(actorKey, memberId = null) {
  return {
    actorKey,
    itemId: memberId,
    kind: "captured-current-pose",
  };
}

function alphaPolicyFor(anchor, role) {
  if (role === "folder-shell") return { kind: "handoff", monotonic: true };
  if (role === "bundle" || isFadingAnchor(anchor)) {
    return { from: 1, kind: "fade-out", monotonic: true, to: 0 };
  }
  return { kind: "handoff", monotonic: true };
}

function zBandFor(role, sourceOrder) {
  if (role === "lead") return GROUP_TRANSFER_Z_BAND.LEAD;
  if (role === "bundle") return GROUP_TRANSFER_Z_BAND.BUNDLE;
  if (role === "folder-shell") return GROUP_TRANSFER_Z_BAND.FOLDER_SHELL;
  return Math.min(
    GROUP_TRANSFER_Z_BAND.LEAD - 1,
    GROUP_TRANSFER_Z_BAND.EXACT + Math.max(0, Number(sourceOrder) || 0)
  );
}

function makeExactActor(member, options = {}) {
  const role = options.isLead ? "lead" : "exact";
  const key = `item:${member.id}`;
  return {
    alphaPolicy: alphaPolicyFor(options.endAnchor, role),
    bundleCount: 1,
    countBadgeZBand: GROUP_TRANSFER_Z_BAND.COUNT_BADGE,
    delayGroup: Math.min(6, Math.max(0, Number(options.delayGroup) || 0)),
    endAnchor: options.endAnchor,
    item: cloneItem(member.item),
    key,
    memberIds: [member.id],
    representativeId: member.id,
    role,
    sourceOrder: member.sourceOrder,
    startAnchor: options.startAnchor,
    zBand: zBandFor(role, member.sourceOrder),
  };
}

function makeBundleActor(groupKey, members, options = {}) {
  const representative = members[0];
  const key = `bundle:${options.phase}:${groupKey}`;
  return {
    alphaPolicy: alphaPolicyFor(options.endAnchor, "bundle"),
    bundleCount: members.length,
    countBadgeZBand: GROUP_TRANSFER_Z_BAND.COUNT_BADGE,
    delayGroup: Math.min(6, Math.max(0, Number(options.delayGroup) || 0)),
    endAnchor: options.endAnchor,
    item: cloneItem(representative.item),
    key,
    memberIds: members.map((member) => member.id),
    representativeId: representative.id,
    role: "bundle",
    sourceOrder: representative.sourceOrder,
    startAnchor: options.startAnchor,
    zBand: GROUP_TRANSFER_Z_BAND.BUNDLE,
  };
}

function makeFolderShellActor(folderId, delayGroup = 0) {
  return {
    alphaPolicy: alphaPolicyFor(null, "folder-shell"),
    bundleCount: 0,
    countBadgeZBand: GROUP_TRANSFER_Z_BAND.COUNT_BADGE,
    delayGroup,
    endAnchor: { folderId, kind: "folder-shell" },
    item: null,
    key: `folderShell:${folderId}`,
    memberIds: [],
    representativeId: null,
    role: "folder-shell",
    sourceOrder: -1,
    startAnchor: capturedPose(`folderShell:${folderId}`),
    zBand: GROUP_TRANSFER_Z_BAND.FOLDER_SHELL,
  };
}

function indexCurrentOwners(currentActors) {
  const owners = new Map();
  for (const actor of currentActors || []) {
    for (const id of actor?.memberIds || []) {
      if (!owners.has(id)) owners.set(id, actor);
    }
  }
  return owners;
}

function currentStartAnchor(member, owners, fallbackAnchor) {
  const owner = owners.get(member.id);
  return owner ? capturedPose(owner.key, member.id) : fallbackAnchor;
}

function groupMembers(members, anchorFor) {
  const groups = new Map();
  for (const member of members) {
    const anchor = anchorFor(member);
    const key = anchorGroupKey(anchor);
    const group = groups.get(key) || { anchor, key, members: [] };
    group.members.push(member);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => (
    left.members[0].sourceOrder - right.members[0].sourceOrder
  ));
}

function buildGatherActors(members, options) {
  const leadId = options.currentView.leadId || members[0]?.id || null;
  const maxActors = normalizePositiveInteger(options.limits.maxGatherActors, 12);
  const maxBundles = normalizePositiveInteger(options.limits.maxBundles, 4);
  const lead = members.find((member) => member.id === leadId) || members[0] || null;
  const remaining = members.filter((member) => member.id !== lead?.id);
  const edgeGroups = groupMembers(
    remaining.filter((member) => !isExactAnchor(sourceAnchor(member, options.currentView))),
    (member) => sourceAnchor(member, options.currentView)
  );
  const bundleGroups = edgeGroups.slice(0, maxBundles);
  const bundledIds = new Set(bundleGroups.flatMap((group) => group.members.map((member) => member.id)));
  const exactCandidates = [
    ...(lead ? [lead] : []),
    ...remaining.filter((member) => !bundledIds.has(member.id)),
  ];
  const needsOverflow = exactCandidates.length + bundleGroups.length > maxActors;
  const exactLimit = Math.max(1, maxActors - bundleGroups.length - (needsOverflow ? 1 : 0));
  const exactMembers = exactCandidates.slice(0, exactLimit);
  const overflowMembers = exactCandidates.slice(exactLimit);
  const actors = exactMembers.map((member, index) => makeExactActor(member, {
    delayGroup: index,
    endAnchor: capturedPose(`item:${member.id}`, member.id),
    isLead: member.id === lead?.id,
    startAnchor: sourceAnchor(member, options.currentView),
  }));
  for (const group of bundleGroups) {
    actors.push(makeBundleActor(group.key, group.members, {
      delayGroup: actors.length,
      endAnchor: capturedPose(`bundle:gather:${group.key}`),
      phase: "gather",
      startAnchor: group.anchor,
    }));
  }
  if (overflowMembers.length) {
    const anchor = sourceAnchor(overflowMembers[0], options.currentView);
    actors.push(makeBundleActor("overflow", overflowMembers, {
      delayGroup: actors.length,
      endAnchor: capturedPose("bundle:gather:overflow"),
      phase: "gather",
      startAnchor: anchor,
    }));
  }
  return actors;
}

function buildDestinationActors(members, options) {
  const owners = indexCurrentOwners(options.currentActors);
  const leadId = options.currentView.leadId || members.find((member) => member.selected !== false)?.id || members[0]?.id;
  const continuityLimit = normalizePositiveInteger(options.limits.maxContinuityActors, 12);
  const continuityIds = new Set();
  for (const actor of options.currentActors || []) {
    if (!new Set(["exact", "lead"]).has(actor?.role)) continue;
    for (const id of actor.memberIds || []) {
      if (continuityIds.size >= continuityLimit) break;
      continuityIds.add(id);
    }
  }
  const exactMembers = [];
  const remaining = [];
  for (const member of members) {
    const anchor = destinationAnchor(member, options.effects);
    // Closed/new-folder overflow has one visual contract: a single +N actor.
    // Continuity keeps exact actors everywhere else, but must not re-expand
    // hidden folder members into several icons converging on the same center.
    if (
      anchor.kind !== "folder-center" &&
      (isExactAnchor(anchor) || continuityIds.has(member.id) || member.id === leadId)
    ) exactMembers.push(member);
    else remaining.push(member);
  }
  const actors = exactMembers.map((member, index) => {
    const endAnchor = destinationAnchor(member, options.effects);
    return makeExactActor(member, {
      delayGroup: index,
      endAnchor,
      isLead: member.id === leadId,
      startAnchor: currentStartAnchor(
        member,
        owners,
        sourceAnchor(member, options.currentView)
      ),
    });
  });
  const maxBundles = normalizePositiveInteger(options.limits.maxBundles, 4);
  const groups = groupMembers(remaining, (member) => destinationAnchor(member, options.effects));
  const selectedGroups = groups.slice(0, maxBundles);
  const extraMembers = groups.slice(maxBundles).flatMap((group) => group.members);
  if (extraMembers.length) {
    const anchor = destinationAnchor(extraMembers[0], options.effects);
    selectedGroups.push({ anchor, key: "overflow", members: extraMembers });
  }
  for (const group of selectedGroups) {
    const representative = group.members[0];
    actors.push(makeBundleActor(group.key, group.members, {
      delayGroup: actors.length,
      endAnchor: group.anchor,
      phase: "release",
      startAnchor: currentStartAnchor(
        representative,
        owners,
        sourceAnchor(representative, options.currentView)
      ),
    }));
  }
  if (options.effects.createdFolderId) {
    actors.unshift(makeFolderShellActor(options.effects.createdFolderId));
  }
  return actors;
}

function buildReturnActors(members, options) {
  const owners = indexCurrentOwners(options.currentActors);
  const leadId = options.currentView.leadId || members[0]?.id || null;
  const exactMembers = [];
  const groupedMembers = [];
  for (const member of members) {
    const anchor = sourceAnchor(member, options.currentView);
    if (isExactAnchor(anchor) || member.id === leadId) exactMembers.push(member);
    else groupedMembers.push(member);
  }
  const actors = exactMembers.map((member, index) => makeExactActor(member, {
    delayGroup: index,
    endAnchor: sourceAnchor(member, options.currentView),
    isLead: member.id === leadId,
    startAnchor: currentStartAnchor(member, owners, capturedPose(`item:${member.id}`, member.id)),
  }));
  const maxBundles = normalizePositiveInteger(options.limits.maxBundles, 4);
  const groups = groupMembers(groupedMembers, (member) => sourceAnchor(member, options.currentView));
  const selectedGroups = groups.slice(0, maxBundles);
  const extraMembers = groups.slice(maxBundles).flatMap((group) => group.members);
  if (extraMembers.length) {
    selectedGroups.push({
      anchor: sourceAnchor(extraMembers[0], options.currentView),
      key: "overflow",
      members: extraMembers,
    });
  }
  for (const group of selectedGroups) {
    const representative = group.members[0];
    actors.push(makeBundleActor(group.key, group.members, {
      delayGroup: actors.length,
      endAnchor: group.anchor,
      phase: "return",
      startAnchor: currentStartAnchor(
        representative,
        owners,
        capturedPose(`bundle:return:${group.key}`, representative.id)
      ),
    }));
  }
  return actors;
}

export function makeGroupTransferPresentation(options = {}) {
  const phase = String(options.phase || "gather");
  const transferPlan = options.transferPlan || null;
  const members = normalizeMembers(
    phase === "release"
      ? transferPlan?.members
      : options.sourceMembers || transferPlan?.members
  );
  const currentView = options.currentView || {};
  const limits = options.limits || {};
  const common = {
    currentActors: options.currentActors || [],
    currentView,
    effects: transferPlan?.effects || {},
    limits,
  };
  let actors;
  if (phase === "release") {
    if (!transferPlan || !new Set(["accepted", "noop"]).has(transferPlan.status)) {
      throw new TypeError("release presentation requires an accepted or noop transfer plan");
    }
    actors = buildDestinationActors(members, common);
  } else if (phase === "return") {
    actors = buildReturnActors(members, common);
  } else if (phase === "gather") {
    actors = buildGatherActors(members, common);
  } else {
    throw new TypeError(`Unsupported group transfer presentation phase: ${phase}`);
  }
  return {
    actors,
    phase,
    status: "ready",
  };
}
