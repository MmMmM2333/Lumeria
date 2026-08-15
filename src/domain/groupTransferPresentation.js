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

function edgeLane(location, columns, rows) {
  const columnCount = normalizePositiveInteger(columns, 1);
  const rowCount = normalizePositiveInteger(rows, 1);
  const rawIndex = Number(location?.index);
  if (!Number.isFinite(rawIndex)) {
    return { laneRow: null, laneY: 0.5 };
  }
  const laneRow = Math.min(
    rowCount - 1,
    Math.max(0, Math.floor(Math.max(0, rawIndex) / columnCount))
  );
  return {
    laneRow,
    laneY: (laneRow + 0.5) / rowCount,
  };
}

function desktopEdgeAnchor(location, currentPageIndex, limits) {
  const direction = location.pageIndex < currentPageIndex ? "left" : "right";
  const columns = normalizePositiveInteger(limits?.desktopCols, 1);
  const rows = normalizePositiveInteger(
    limits?.desktopRows,
    Math.max(1, Math.ceil(normalizePositiveInteger(limits?.desktopPageSize, columns) / columns))
  );
  return {
    direction,
    kind: `desktop-page-edge-${direction}`,
    ...edgeLane(location, columns, rows),
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

function folderPageEdgeAnchor(location, currentFolderPageIndex, limits) {
  const direction = location.folderPageIndex < currentFolderPageIndex ? "left" : "right";
  const columns = normalizePositiveInteger(limits?.folderCols, 1);
  const rows = normalizePositiveInteger(
    limits?.folderRows,
    Math.max(1, Math.ceil(normalizePositiveInteger(limits?.folderPageSize, columns) / columns))
  );
  const { laneRow } = edgeLane(location, columns, rows);
  return {
    direction,
    folderId: location.folderId,
    folderPageIndex: location.folderPageIndex,
    index: location.index,
    itemId: location.itemId || null,
    kind: `folder-page-edge-${direction}`,
    laneRow,
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

function sourceAnchor(member, currentView, limits) {
  const source = { ...member.source, itemId: member.id };
  const desktopPageIndex = Math.max(0, Number(currentView.desktopPageIndex) || 0);
  if (source.kind === "desktop") {
    return source.pageIndex === desktopPageIndex
      ? desktopSlotAnchor(source)
      : desktopEdgeAnchor(source, desktopPageIndex, limits);
  }

  if (source.ownerPageIndex !== desktopPageIndex) {
    return desktopEdgeAnchor({
      index: source.ownerIndex,
      pageIndex: source.ownerPageIndex,
    }, desktopPageIndex, limits);
  }
  if (currentView.openFolderId === source.folderId) {
    const folderPageIndex = Math.max(0, Number(currentView.folderPageIndex) || 0);
    return source.folderPageIndex === folderPageIndex
      ? folderOpenSlotAnchor(source)
      : folderPageEdgeAnchor(source, folderPageIndex, limits);
  }
  return Number(source.flatIndex) < PREVIEW_SLOT_LIMIT
    ? folderPreviewAnchor(source)
    : folderCenterAnchor(source);
}

function destinationAnchor(member, effects, limits) {
  const destination = { ...member.destination, itemId: member.id };
  const finalDesktopPageIndex = Math.max(0, Number(effects.finalDesktopPageIndex) || 0);
  if (destination.kind === "desktop") {
    return destination.pageIndex === finalDesktopPageIndex
      ? desktopSlotAnchor(destination)
      : desktopEdgeAnchor(destination, finalDesktopPageIndex, limits);
  }
  if (effects.finalOpenFolderId === destination.folderId) {
    const finalFolderPageIndex = Math.max(0, Number(effects.finalFolderPageIndex) || 0);
    return destination.folderPageIndex === finalFolderPageIndex
      ? folderOpenSlotAnchor(destination)
      : folderPageEdgeAnchor(destination, finalFolderPageIndex, limits);
  }
  return Number(destination.flatIndex) < PREVIEW_SLOT_LIMIT
    ? folderPreviewAnchor(destination)
    : folderCenterAnchor(destination);
}

function anchorGroupKey(anchor) {
  if (!anchor) return "missing";
  if (anchor.kind.startsWith("desktop-page-edge-")) {
    return `${anchor.kind}:page:${anchor.pageIndex}:row:${anchor.laneRow ?? "middle"}`;
  }
  if (anchor.kind.startsWith("folder-page-edge-")) {
    return `${anchor.kind}:${anchor.folderId}:page:${anchor.folderPageIndex}:row:${anchor.laneRow ?? "middle"}`;
  }
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
    anchor?.kind?.startsWith("desktop-page-edge-")
  );
}

function visibilityPolicyFor(anchor, currentView) {
  if (anchor?.kind?.startsWith("folder-page-edge-")) {
    return {
      folderId: anchor.folderId || currentView?.openFolderId || null,
      kind: "folder-panel-clip",
    };
  }
  if (anchor?.kind === "desktop-slot" && currentView?.openFolderId) {
    return {
      folderId: currentView.openFolderId,
      kind: "desktop-occluded-egress",
    };
  }
  return { kind: "none" };
}

function capturedPose(actorKey, memberId = null) {
  return {
    actorKey,
    itemId: memberId,
    kind: "captured-current-pose",
  };
}

function alphaPolicyFor(anchor, role, visibilityPolicy = { kind: "none" }) {
  if (role === "folder-shell") return { kind: "handoff", monotonic: true };
  if (visibilityPolicy.kind === "folder-panel-clip") {
    return { kind: "handoff", monotonic: true };
  }
  if (visibilityPolicy.kind === "desktop-occluded-egress") {
    return { from: 1, kind: "fade-out", monotonic: true, to: 0 };
  }
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
  const visibilityPolicy = options.visibilityPolicy || { kind: "none" };
  return {
    alphaPolicy: alphaPolicyFor(options.endAnchor, role, visibilityPolicy),
    bundleCount: 1,
    countBadgeZBand: GROUP_TRANSFER_Z_BAND.COUNT_BADGE,
    delayGroup: Math.min(6, Math.max(0, Number(options.delayGroup) || 0)),
    endAnchor: options.endAnchor,
    item: cloneItem(member.item),
    key,
    continuityKey: key,
    memberIds: [member.id],
    representativeId: member.id,
    role,
    sourceOrder: member.sourceOrder,
    startAnchor: options.startAnchor,
    visibilityPolicy,
    zBand: zBandFor(role, member.sourceOrder),
  };
}

function makeBundleActor(groupKey, members, options = {}) {
  const representative = members[0];
  const key = `bundle:${options.phase}:${groupKey}`;
  const visibilityPolicy = options.visibilityPolicy || { kind: "none" };
  return {
    alphaPolicy: alphaPolicyFor(options.endAnchor, "bundle", visibilityPolicy),
    bundleCount: members.length,
    countBadgeZBand: GROUP_TRANSFER_Z_BAND.COUNT_BADGE,
    delayGroup: Math.min(6, Math.max(0, Number(options.delayGroup) || 0)),
    endAnchor: options.endAnchor,
    item: cloneItem(representative.item),
    key,
    continuityKey: options.continuityKey || `bundle:${groupKey}`,
    memberIds: members.map((member) => member.id),
    representativeId: representative.id,
    role: "bundle",
    sourceOrder: representative.sourceOrder,
    startAnchor: options.startAnchor,
    visibilityPolicy,
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
    continuityKey: `folderShell:${folderId}`,
    memberIds: [],
    representativeId: null,
    role: "folder-shell",
    sourceOrder: -1,
    startAnchor: capturedPose(`folderShell:${folderId}`),
    visibilityPolicy: { kind: "none" },
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

function claimCurrentContinuityKey(member, owners, claimedKeys) {
  const owner = owners.get(member.id);
  const candidate = owner?.continuityKey || owner?.key || null;
  if (!candidate || claimedKeys.has(candidate)) return null;
  claimedKeys.add(candidate);
  return candidate;
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
    remaining.filter((member) => !isExactAnchor(sourceAnchor(member, options.currentView, options.limits))),
    (member) => sourceAnchor(member, options.currentView, options.limits)
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
    startAnchor: sourceAnchor(member, options.currentView, options.limits),
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
    const anchor = sourceAnchor(overflowMembers[0], options.currentView, options.limits);
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
    const anchor = destinationAnchor(member, options.effects, options.limits);
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
    const endAnchor = destinationAnchor(member, options.effects, options.limits);
    return makeExactActor(member, {
      delayGroup: index,
      endAnchor,
      isLead: member.id === leadId,
      startAnchor: currentStartAnchor(
        member,
        owners,
        sourceAnchor(member, options.currentView, options.limits)
      ),
      visibilityPolicy: visibilityPolicyFor(endAnchor, options.currentView),
    });
  });
  const claimedContinuityKeys = new Set(actors.map((actor) => actor.continuityKey));
  const maxBundles = normalizePositiveInteger(options.limits.maxBundles, 4);
  const groups = groupMembers(
    remaining,
    (member) => destinationAnchor(member, options.effects, options.limits)
  );
  const selectedGroups = groups.slice(0, maxBundles);
  const extraMembers = groups.slice(maxBundles).flatMap((group) => group.members);
  if (extraMembers.length) {
    const anchor = destinationAnchor(extraMembers[0], options.effects, options.limits);
    selectedGroups.push({ anchor, key: "overflow", members: extraMembers });
  }
  for (const group of selectedGroups) {
    const representative = group.members[0];
    const actor = makeBundleActor(group.key, group.members, {
      continuityKey: claimCurrentContinuityKey(
        representative,
        owners,
        claimedContinuityKeys
      ),
      delayGroup: actors.length,
      endAnchor: group.anchor,
      phase: "release",
      startAnchor: currentStartAnchor(
        representative,
        owners,
        sourceAnchor(representative, options.currentView, options.limits)
      ),
      visibilityPolicy: visibilityPolicyFor(group.anchor, options.currentView),
    });
    claimedContinuityKeys.add(actor.continuityKey);
    actors.push(actor);
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
    const anchor = sourceAnchor(member, options.currentView, options.limits);
    if (isExactAnchor(anchor) || member.id === leadId) exactMembers.push(member);
    else groupedMembers.push(member);
  }
  const actors = exactMembers.map((member, index) => {
    const endAnchor = sourceAnchor(member, options.currentView, options.limits);
    return makeExactActor(member, {
      delayGroup: index,
      endAnchor,
      isLead: member.id === leadId,
      startAnchor: currentStartAnchor(member, owners, capturedPose(`item:${member.id}`, member.id)),
      visibilityPolicy: visibilityPolicyFor(endAnchor, options.currentView),
    });
  });
  const maxBundles = normalizePositiveInteger(options.limits.maxBundles, 4);
  const groups = groupMembers(
    groupedMembers,
    (member) => sourceAnchor(member, options.currentView, options.limits)
  );
  const selectedGroups = groups.slice(0, maxBundles);
  const extraMembers = groups.slice(maxBundles).flatMap((group) => group.members);
  if (extraMembers.length) {
    selectedGroups.push({
      anchor: sourceAnchor(extraMembers[0], options.currentView, options.limits),
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
      visibilityPolicy: visibilityPolicyFor(group.anchor, options.currentView),
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
