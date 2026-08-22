import {
  GROUP_TRANSFER_RUNTIME_MODE,
  makeGroupTransferRuntimeEntries,
  makeGroupTransferRuntimeReleasePlan,
} from "./groupTransferRuntimeAdapter.js";
import type {
  GroupTransferRuntimeActor,
  GroupTransferRuntimeSourceEntry,
} from "./groupTransferRuntimeAdapter.js";
import type {
  GroupTransferAlphaPolicy,
  GroupTransferAnchor,
} from "../../../domain/groupTransferPresentation.js";

interface ActorOptions {
  alphaPolicy?: GroupTransferAlphaPolicy;
  delayGroup?: number;
  endAnchor?: GroupTransferAnchor;
  key?: string;
  memberIds?: string[];
  role?: GroupTransferRuntimeActor["role"];
  sourceOrder?: number;
  startAnchor?: GroupTransferAnchor;
  zBand?: number;
}

function actor(id: string | null, options: ActorOptions = {}): GroupTransferRuntimeActor {
  const isFolderShell = options.role === "folder-shell";
  if (!id && !isFolderShell) throw new Error("non-shell test actors require an id");
  const actorId = isFolderShell ? null : id;
  return {
    alphaPolicy: options.alphaPolicy || { kind: "handoff", monotonic: true },
    bundleCount: options.memberIds?.length || 1,
    delayGroup: options.delayGroup || 0,
    endAnchor: options.endAnchor || { index: 0, itemId: id, kind: "desktop-slot", pageIndex: 0 },
    item: actorId ? { id: actorId, name: actorId, type: "app" } : null,
    key: options.key || `item:${id}`,
    memberIds: options.memberIds || (actorId ? [actorId] : []),
    representativeId: actorId,
    role: options.role || "exact",
    sourceOrder: options.sourceOrder || 0,
    startAnchor: options.startAnchor || { index: 0, itemId: id, kind: "desktop-slot", pageIndex: 0 },
    zBand: options.zBand || 300,
  };
}

function sourceEntry(id: string, order = 0): GroupTransferRuntimeSourceEntry {
  return {
    delayMs: 0,
    item: { id, name: id, type: "app" },
    order,
    origin: { x: 20 + order * 10, y: 40 + order * 10 },
    originAlpha: 1,
    originKind: "visible-desktop",
    originScale: 1,
  };
}

export function runGroupTransferRuntimeAdapterTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Group transfer runtime adapter test failed] ${message}`);
  };

  const actors = [
    actor("lead", { delayGroup: 0, role: "lead", zBand: 900 }),
    actor("preview", {
      delayGroup: 4,
      endAnchor: {
        folderId: "created-folder",
        itemId: "preview",
        kind: "folder-preview-slot",
        slotIndex: 2,
      },
    }),
    actor("overflow", {
      alphaPolicy: { from: 1, kind: "fade-out", monotonic: true, to: 0 },
      delayGroup: 20,
      endAnchor: { folderId: "created-folder", kind: "folder-center" },
      key: "bundle:release:folder-center:created-folder",
      memberIds: ["overflow", "overflow-2", "overflow-3"],
      role: "bundle",
      zBand: 200,
    }),
    actor(null, {
      endAnchor: { folderId: "created-folder", kind: "folder-shell" },
      key: "folderShell:created-folder",
      memberIds: [],
      role: "folder-shell",
      zBand: 100,
    }),
  ];
  const sourceEntries = [sourceEntry("lead"), sourceEntry("preview", 1), sourceEntry("overflow", 2)];
  const runtime = makeGroupTransferRuntimeEntries({
    phase: "release",
    presentationPlan: { actors, phase: "release", status: "ready" },
    sourceEntries,
  });
  assert(runtime.entries.length === 3, "icon runtime entries should exclude the folder-shell graphics actor");
  assert(runtime.shellActors.length === 1, "folder-shell actors should remain explicit runtime actors");
  assert(
    runtime.entries.find((entry) => entry.item.id === "lead")?.zBand === 900,
    "runtime entries should preserve presentation z-bands"
  );
  assert(
    runtime.entries.find((entry) => entry.item.id === "overflow")?.memberIds.length === 3,
    "bundle runtime entries should retain every semantic member id"
  );
  assert(
    runtime.entries.every((entry) => Boolean(
      entry.releaseStart && ["source-origin", "current-pose"].includes(entry.releaseStart.kind)
    )),
    "release actors should begin from either their captured current pose or semantic source pose"
  );

  const releasePlan = makeGroupTransferRuntimeReleasePlan({
    key: "transfer-1",
    phase: "release",
    presentationPlan: { actors, phase: "release", status: "ready" },
    transferPlan: {
      effects: { createdFolderId: "created-folder" },
      status: "accepted",
    },
    velocity: { x: 120, y: -30 },
  });
  const previewLane = releasePlan.entries.find((entry) => entry.id === "preview");
  const overflowLane = releasePlan.entries.find((entry) => entry.id === "overflow");
  assert(previewLane, "the release plan should contain the preview lane");
  assert(overflowLane, "the release plan should contain the overflow lane");
  assert(
    previewLane.mode === GROUP_TRANSFER_RUNTIME_MODE.CREATED_FOLDER &&
      previewLane.target.slotIndex === 2,
    "created-folder preview anchors should map to an exact preview lane"
  );
  assert(
    overflowLane.mode === GROUP_TRANSFER_RUNTIME_MODE.FOLDER_CENTER_ABSORB &&
      overflowLane.alphaPolicy?.kind === "fade-out",
    "folder-center bundles should map to one fading absorb lane"
  );
  assert(
    releasePlan.entries.every((entry) => entry.delayMs <= 72),
    "cohort staggering should never exceed 72ms"
  );
  assert(
    !JSON.stringify(releasePlan).includes("fallback"),
    "runtime release plans should not contain synthetic fallback points"
  );

  const returnPlan = makeGroupTransferRuntimeReleasePlan({
    key: "transfer-return",
    phase: "return",
    presentationPlan: {
      actors: [actor("lead", {
        endAnchor: { kind: "desktop-page-edge-left", pageIndex: 0 },
        role: "lead",
      })],
      phase: "return",
      status: "ready",
    },
    transferPlan: null,
  });
  const returnEntry = returnPlan.entries[0];
  assert(returnEntry, "the return plan should contain its lead entry");
  assert(
    returnEntry.mode === GROUP_TRANSFER_RUNTIME_MODE.RETURN &&
      returnEntry.target.semanticAnchor.kind === "desktop-page-edge-left",
    "return plans should retain semantic source anchors without reopening old pages"
  );
}
