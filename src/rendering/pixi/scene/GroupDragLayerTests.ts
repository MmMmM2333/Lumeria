import { motionRuntime } from "../animation/motionRuntime.js";
import { Container } from "pixi.js";
import type { PointData } from "pixi.js";
import type { SceneItem } from "../../sceneFrame.js";
import type {
  GroupDragEntry,
  GroupDragGroup,
  GroupDragLayer as GroupDragLayerInstance,
  GroupDragUpdateState,
} from "./GroupDragLayer.js";
import type {
  GroupReleaseController,
  GroupReleaseFolderLane,
  GroupReleaseFolderNode,
  GroupReleaseLane,
  GroupReleasePlan,
} from "./GroupReleaseController.js";
import {
  makeFolderShellVisualKey,
  makeItemVisualKey,
  VisualOwnershipRegistry,
} from "./visualOwnershipRegistry.js";
import type { VisualOwnershipChange } from "./visualOwnershipRegistry.js";

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

type TestGroupDragEntry = Omit<Mutable<GroupDragEntry>,
  "actorKey" | "bundleCount" | "delayMs" | "memberIds" | "order" | "originKind" | "originScale"
> & {
  actorKey: string;
  bundleCount: number;
  delayMs: number;
  memberIds: string[];
  order: number;
  originKind: string;
  originScale: number;
};

type OwnershipEvent = Readonly<{
  change: VisualOwnershipChange;
  nodeVisible: boolean;
  shellOwned: boolean;
}>;

function installPixiTextTestDom() {
  if (!("CanvasRenderingContext2D" in globalThis)) {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class CanvasRenderingContext2D {};
  }
  if ("document" in globalThis) return;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      baseURI: "http://localhost/",
      fonts: null,
      createElement(tagName: string) {
        if (tagName !== "canvas") return {};
        const context = Object.create(globalThis.CanvasRenderingContext2D.prototype);
        Object.assign(context, {
          canvas: null,
          clearRect: () => {},
          fillRect: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          measureText: (text: unknown) => ({
            actualBoundingBoxAscent: 10,
            actualBoundingBoxDescent: 3,
            width: String(text || "").length * 8,
          }),
          restore: () => {},
          save: () => {},
          scale: () => {},
          setTransform: () => {},
          strokeText: () => {},
          fillText: () => {},
        });
        const canvas = {
          getContext: () => context,
          height: 0,
          width: 0,
        };
        context.canvas = canvas;
        return canvas;
      },
    },
  });
}

function app(id: string): SceneItem {
  return { emoji: id.slice(0, 1).toUpperCase(), id, name: id, type: "app" };
}

function makeEntry(
  id: string,
  order: number,
  overrides: Partial<TestGroupDragEntry> = {},
): TestGroupDragEntry {
  return {
    actorKey: `item:${id}`,
    bundleCount: 1,
    delayMs: order * 10,
    item: app(id),
    memberIds: [id],
    order,
    origin: { x: 40 + order * 20, y: 80 },
    originKind: order === 0 ? "lead" : "visible-desktop",
    originScale: 1,
    ...overrides,
  };
}

function makeState(
  groupState: GroupDragGroup | null,
  overrides: Partial<GroupDragUpdateState> = {},
): GroupDragUpdateState {
  return {
    folderPageSize: 9,
    groupState,
    height: 600,
    iconSize: 64,
    isTextlessMode: false,
    launchTargetStatusById: {},
    showMissingLaunchTargetBadge: false,
    stageRect: { height: 600, left: 0, top: 0, width: 800 },
    width: 800,
    ...overrides,
  };
}

function makePointReleasePlan(entryId: string, fallback: PointData): GroupReleasePlan {
  return {
    entries: [{
      delayMs: 0,
      fallback,
      id: entryId,
      memberIds: [entryId],
      mode: "point-handoff",
      target: { area: "desktop", id: entryId, kind: "desktop" },
      velocity: { x: 0, y: 0 },
    }],
    key: `plan-${entryId}`,
    status: "pending",
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[Group drag layer test failed] ${message}`);
}

function requireAt<T>(values: readonly T[], index: number, message: string): T {
  const value = values[index];
  assert(value !== undefined, message);
  return value;
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  assert(value != null, message);
  return value;
}

function makeGroup(group: GroupDragGroup): GroupDragGroup {
  return group;
}

function makeReleasePlan(plan: GroupReleasePlan): GroupReleasePlan {
  return plan;
}

function requireReleaseController(
  controller: GroupReleaseController | null,
  message: string,
): GroupReleaseController {
  assert(controller, message);
  return controller;
}

function requireFolderLane(
  lane: GroupReleaseLane | undefined,
  message: string,
): GroupReleaseFolderLane {
  assert(lane?.kind === "folder", message);
  return lane;
}

function renderGroupDragFrame(layer: GroupDragLayerInstance): void {
  layer.renderFollowerFrame();
  requireReleaseController(
    layer.releaseController,
    "the group release controller should exist while rendering a test frame",
  ).renderFrame();
}

export async function runGroupDragLayerTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  installPixiTextTestDom();
  const { GroupDragLayer } = await import("./GroupDragLayer.js");
  let prewarmRequests = 0;
  const prewarmLayer = new GroupDragLayer({
    onPrewarmRequest: () => {
      prewarmRequests += 1;
    },
  });
  try {
    const prewarmEntries = [makeEntry("prewarm-0", 0), makeEntry("prewarm-1", 1)];
    prewarmLayer.update(makeState({
      center: { x: 260, y: 210 },
      entries: prewarmEntries,
      key: "prewarm-group",
      phase: "gathering",
      pointer: { x: 260, y: 210 },
      reducedMotion: true,
      releaseVisualCount: 10,
      totalCount: 10,
      trail: [],
    }));
    assert(
      prewarmLayer.nodes.length === 3 &&
        prewarmLayer.nodes.slice(2).every((node) => !node.visible),
      "one group update should allocate only one invisible release-pool batch"
    );
    renderGroupDragFrame(prewarmLayer);
    assert(
      (prewarmLayer.nodes.length as number) === 4 &&
        prewarmLayer.nodes.slice(2).every((node) => !node.visible),
      "subsequent render frames should continue one-at-a-time prewarming without exposing pooled nodes"
    );
    prewarmLayer.update(makeState(null, { releasePrewarmCount: 6 }));
    assert(
      (prewarmLayer.nodes.length as number) === 5 &&
        prewarmLayer.nodes.every((node) => !node.visible) &&
        prewarmRequests >= 3,
      "passive batch-mode prewarming should continue while no drag presentation is active"
    );

    const gatedEntries = Array.from({ length: 6 }, (_, index) => makeEntry(`gated-${index}`, index));
    const gatedLead = requireAt(gatedEntries, 0, "the gated release should contain a lead entry");
    const gatedState = makeState({
      center: { x: 260, y: 210 },
      entries: gatedEntries,
      key: "gated-release",
      leadId: gatedLead.item.id,
      phase: "releasing",
      pointer: { x: 260, y: 210 },
      reducedMotion: false,
      runtimePlan: {
        entries: gatedEntries.map((entry, index) => ({
          fallback: { x: 420 + index * 4, y: 300 },
          id: entry.item.id,
          mode: "point-handoff",
          target: { area: "desktop", id: entry.item.id, kind: "desktop" },
        })),
        key: "plan-gated-release",
      },
      totalCount: 6,
      trail: [],
    });
    prewarmLayer.update(gatedState);
    assert(
      (prewarmLayer.nodes.length as number) === 6 &&
        prewarmLayer.activeNodesByContinuityKey.size === 0 &&
        requireReleaseController(prewarmLayer.releaseController, "prewarm release controller should exist").lanes.size === 0,
      "the frame that finishes pool allocation should not also construct every release lane"
    );
    prewarmLayer.update(gatedState);
    assert(
      (prewarmLayer.activeNodesByContinuityKey.size as number) === 6 &&
        requireReleaseController(prewarmLayer.releaseController, "prewarm release controller should exist").lanes.size === 6,
      "release lanes should start together on the render after the pool becomes ready"
    );
  } finally {
    prewarmLayer.destroy({ children: true });
  }

  const ownershipNotificationFrames: Array<() => void> = [];
  const flushOwnershipNotifications = () => {
    while (ownershipNotificationFrames.length) {
      requireValue(ownershipNotificationFrames.shift(), "a scheduled ownership notification should exist")();
    }
  };
  const ownershipRegistry = new VisualOwnershipRegistry({
    scheduleFrame: (callback) => ownershipNotificationFrames.push(callback),
  });
  const ownershipEvents: OwnershipEvent[] = [];
  let ownershipSettled = 0;
  let ownershipAborted = 0;
  const ownershipLayer = new GroupDragLayer({
    onReleaseAborted: () => {
      ownershipAborted += 1;
    },
    onReleaseSettled: () => {
      ownershipSettled += 1;
    },
    resolvePointTarget: () => ({
      point: { x: 420, y: 300 },
      scale: { x: 1, y: 1 },
    }),
    visualOwnership: ownershipRegistry,
  });
  const unsubscribeOwnership = ownershipRegistry.subscribe((change: VisualOwnershipChange) => {
    ownershipEvents.push({
      change,
      nodeVisible: ownershipLayer.nodes[0]?.visible === true,
      shellOwned: ownershipRegistry.hasOwner(makeFolderShellVisualKey("ownership-folder")),
    });
  });
  try {
    const ownershipEntry = makeEntry("ownership-app", 0, {
      actorKey: "item:ownership-app",
      zBand: 900,
    });
    const ownershipRuntimePlan = makeReleasePlan({
      entries: [{
        actorKey: "item:ownership-app",
        fallback: { x: 420, y: 300 },
        id: ownershipEntry.item.id,
        memberIds: [ownershipEntry.item.id],
        mode: "point-handoff",
        target: { area: "desktop", id: ownershipEntry.item.id, kind: "desktop" },
      }],
      key: "plan-ownership-handoff",
      status: "pending",
    });
    const ownershipGroup = makeGroup({
      center: { x: 260, y: 210 },
      entries: [ownershipEntry],
      key: "ownership-handoff",
      outcome: "accepted",
      phase: "releasing",
      pointer: { x: 260, y: 210 },
      presentationPlan: {
        actors: [
          {
            endAnchor: { itemId: ownershipEntry.item.id, kind: "desktop-slot" },
            key: "item:ownership-app",
            memberIds: [ownershipEntry.item.id],
            role: "lead",
          },
        ],
      },
      reducedMotion: false,
      runtimePlan: ownershipRuntimePlan,
      semanticPlan: { effects: {} },
      totalCount: 1,
      trail: [],
    });
    ownershipLayer.syncVisualOwnership(ownershipGroup);
    assert(
      ownershipRegistry.hasOwner(makeItemVisualKey(ownershipEntry.item.id)),
      "an accepted transfer should acquire item ownership before live layout is exposed"
    );
    ownershipLayer.update(makeState(ownershipGroup));
    ownershipLayer.update(makeState(ownershipGroup));
    for (let index = 0; index < 180 && ownershipSettled === 0; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(ownershipLayer);
    }
    flushOwnershipNotifications();
    const itemReleaseEvent = ownershipEvents.find((event) => (
      event.change?.type === "release" && event.change?.key === makeItemVisualKey(ownershipEntry.item.id)
    ));
    assert(
      ownershipSettled === 1 && itemReleaseEvent?.nodeVisible === false,
      "the transfer actor must be hidden before its item ownership key is released"
    );
    assert(ownershipRegistry.snapshot().length === 0, "an ordinary item handoff should release its only visual owner");

    ownershipLayer.clear();
    ownershipSettled = 0;
    const createdFolderId = "ownership-created-folder";
    const createdEntries = [
      makeEntry("ownership-created-a", 0, { actorKey: "item:ownership-created-a" }),
      makeEntry("ownership-created-b", 1, { actorKey: "item:ownership-created-b" }),
    ];
    const createdEntryA = requireAt(createdEntries, 0, "the first created-folder entry should exist");
    const createdEntryB = requireAt(createdEntries, 1, "the second created-folder entry should exist");
    const createdRuntimePlan = makeReleasePlan({
      entries: createdEntries.map((entry, slotIndex) => ({
        actorKey: entry.actorKey,
        id: entry.item.id,
        memberIds: [entry.item.id],
        mode: "created-folder",
        target: {
          expectedChildId: entry.item.id,
          folderId: createdFolderId,
          slotIndex,
        },
      })),
      key: "plan-created-ownership-handoff",
      shellActors: [{
        endAnchor: { folderId: createdFolderId, kind: "folder-shell" },
        key: `folderShell:${createdFolderId}`,
        role: "folder-shell",
      }],
    });
    const createdOwnershipGroup = makeGroup({
      ...ownershipGroup,
      entries: createdEntries,
      key: "created-ownership-handoff",
      presentationPlan: {
        actors: [
          ...createdEntries.map((entry) => ({
            endAnchor: { folderId: createdFolderId, kind: "folder-preview-slot" },
            key: entry.actorKey,
            memberIds: [entry.item.id],
            role: "exact",
          })),
          ...(createdRuntimePlan.shellActors || []),
        ],
      },
      runtimePlan: createdRuntimePlan,
      semanticPlan: { effects: { createdFolderId } },
      totalCount: 2,
    });
    ownershipLayer.syncVisualOwnership(createdOwnershipGroup);
    const createdNodeA = ownershipLayer.acquireNode(0);
    const createdNodeB = ownershipLayer.acquireNode(1);
    createdNodeA.visible = true;
    createdNodeB.visible = true;
    ownershipLayer.finishReleaseActor({
      actorKey: createdEntryA.actorKey,
      node: createdNodeA,
      runtimePlan: createdRuntimePlan,
    }, false);
    assert(
      createdNodeA.visible === true &&
        ownershipRegistry.hasOwner(makeItemVisualKey(createdEntryA.item.id)) &&
        ownershipSettled === 0,
      "a preview actor that arrives before its created-folder shell should retain the ghost until the shell handoff"
    );
    ownershipLayer.finishFolderShellActor({
      actorKey: `folderShell:${createdFolderId}`,
      folderId: createdFolderId,
      planKey: requireValue(createdRuntimePlan.key, "the created-folder plan key should exist"),
    });
    assert(
      (createdNodeA.visible as boolean) === false &&
        !ownershipRegistry.hasOwner(makeFolderShellVisualKey(createdFolderId)) &&
        !ownershipRegistry.hasOwner(makeItemVisualKey(createdEntryA.item.id)) &&
        ownershipRegistry.hasOwner(makeItemVisualKey(createdEntryB.item.id)) &&
        (ownershipSettled as number) === 1,
      "the shell handoff should reveal the live folder and atomically flush every preview actor already waiting at its slot"
    );

    ownershipLayer.clear();
    const partialEntries = [
      makeEntry("partial-a", 0, { actorKey: "item:partial-a", zBand: 900 }),
      makeEntry("partial-b", 1, { actorKey: "item:partial-b", zBand: 301 }),
    ];
    const partialRuntimePlan = makeReleasePlan({
      entries: partialEntries.map((entry, index) => ({
        actorKey: entry.actorKey,
        fallback: { x: 420 + index * 72, y: 300 },
        id: entry.item.id,
        memberIds: [entry.item.id],
        mode: "point-handoff",
        target: { area: "desktop", id: entry.item.id, kind: "desktop" },
      })),
      key: "plan-partial-handoff",
      status: "pending",
    });
    let partialGroup = makeGroup({
      center: { x: 260, y: 210 },
      entries: partialEntries,
      key: "partial-handoff",
      outcome: "accepted",
      phase: "releasing",
      pointer: { x: 260, y: 210 },
      presentationPlan: {
        actors: partialEntries.map((entry) => ({
          endAnchor: { itemId: entry.item.id, kind: "desktop-slot" },
          key: entry.actorKey,
          memberIds: [entry.item.id],
          role: entry.item.id === "partial-a" ? "lead" : "exact",
        })),
      },
      reducedMotion: false,
      runtimePlan: partialRuntimePlan,
      semanticPlan: { effects: {} },
      settledActorKeys: Array<string>(),
      totalCount: 2,
      trail: [],
    });
    ownershipLayer.syncVisualOwnership(partialGroup);
    ownershipLayer.update(makeState(partialGroup));
    ownershipLayer.update(makeState(partialGroup));
    const partialNodeA = requireAt(ownershipLayer.nodes, 0, "the first partial actor node should exist");
    const partialNodeB = requireAt(ownershipLayer.nodes, 1, "the second partial actor node should exist");
    ownershipLayer.finishReleaseActor({
      actorKey: "item:partial-a",
      node: partialNodeA,
      runtimePlan: partialRuntimePlan,
    }, false);
    partialGroup = makeGroup({ ...partialGroup, settledActorKeys: ["item:partial-a"] });
    ownershipLayer.syncVisualOwnership(partialGroup);
    ownershipLayer.update(makeState(partialGroup));
    assert(
      partialNodeA.visible === false && partialNodeB.visible === true,
      "a handed-off actor must stay hidden while the remaining group actors continue releasing"
    );
    assert(
      !ownershipRegistry.hasOwner(makeItemVisualKey("partial-a")) &&
        ownershipRegistry.hasOwner(makeItemVisualKey("partial-b")) &&
        requireReleaseController(ownershipLayer.releaseController, "ownership release controller should exist").lanes.size === 1,
      "a handed-off actor must leave both visual ownership and its runtime lane without disturbing active actors"
    );

    ownershipLayer.clear();
    flushOwnershipNotifications();
    ownershipEvents.length = 0;
    const abortGroup = makeGroup({
      ...ownershipGroup,
      key: "ownership-abort",
      presentationPlan: {
        actors: ["abort-a", "abort-b"].map((id) => ({
          endAnchor: { itemId: id, kind: "desktop-slot" },
          key: `item:${id}`,
          memberIds: [id],
          role: "exact",
        })),
      },
      runtimePlan: {
        entries: ["abort-a", "abort-b"].map((id) => ({
          actorKey: `item:${id}`,
          id,
          mode: "point-handoff",
        })),
        key: "plan-ownership-abort",
      },
      semanticPlan: { effects: {} },
    });
    ownershipLayer.syncVisualOwnership(abortGroup);
    const abortNodeA = ownershipLayer.acquireNode(0);
    const abortNodeB = ownershipLayer.acquireNode(1);
    abortNodeA.visible = true;
    abortNodeB.visible = true;
    ownershipLayer.finishReleaseActor({
      actorKey: "item:abort-a",
      node: abortNodeA,
      runtimePlan: requireValue(abortGroup.runtimePlan, "the abort runtime plan should exist"),
    }, true);
    flushOwnershipNotifications();
    const abortReleaseEvent = ownershipEvents.find((event) => event.change?.type === "releaseByToken");
    assert(
      ownershipAborted === 1 &&
        ownershipRegistry.snapshot().length === 0 &&
        (abortNodeA.visible as boolean) === false &&
        (abortNodeB.visible as boolean) === false &&
        abortReleaseEvent?.nodeVisible === false,
      "a visual abort should hide every actor before atomically releasing all transfer ownership"
    );
  } finally {
    unsubscribeOwnership();
    ownershipLayer.destroy({ children: true });
    motionRuntime.reset();
  }
  let releaseSettled = 0;
  const layer = new GroupDragLayer({
    onReleaseSettled: () => {
      releaseSettled += 1;
    },
    resolveFolderClipGeometry: () => ({
      height: 220,
      radius: 48,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: 300,
      x: 100,
      y: 50,
    }),
    resolvePointTarget: ({ entry, node }) => {
      const visualOffset = node?.visualWrap?.position || { x: 0, y: 0 };
      return {
        point: {
          x: (Number(entry?.fallback?.x) || 480) - (Number(visualOffset.x) || 0),
          y: (Number(entry?.fallback?.y) || 300) - (Number(visualOffset.y) || 0),
        },
        scale: { x: 1, y: 1 },
      };
    },
  });
  const releaseController = requireReleaseController(
    layer.releaseController,
    "the primary group release controller should exist",
  );
  try {
    const entries = Array.from({ length: 12 }, (_, index) => makeEntry(`app-${index}`, index));
    entries[3] = makeEntry("bundle-representative", 3, {
      bundleCount: 3,
      memberIds: ["bundle-representative", "hidden-a", "hidden-b"],
      originKind: "folder-bundle",
    });
    layer.update(makeState({
      center: { x: 320, y: 240 },
      entries,
      key: "group-a",
      phase: "gathering",
      pointer: { x: 320, y: 240 },
      reducedMotion: true,
      totalCount: 20,
      trail: [
        { time: 0, x: 120, y: 240 },
        { time: 100, x: 320, y: 240 },
      ],
    }));
    assert(layer.eventMode === "none", "the group layer must never participate in hit testing");
    assert(layer.nodes.length === 12, "the layer should allocate only the bounded representative count");
    assert(layer.nodes.every((node) => node.eventMode === "none"), "pooled representative nodes must not receive pointer events");
    const bundleBadge = requireAt(layer.entryBadges, 3, "the bundle representative badge should exist");
    assert(bundleBadge.container.visible && bundleBadge.text.text === "+2", "bundle representatives should expose an additional-member badge");
    assert(!("trail" in layer), "batch dragging should not allocate a visible pointer-trail graphics layer");
    assert(layer.badge.visible === true, "the aggregate count badge should remain visible while the group is interactive");

    layer.update(makeState({
      center: { x: 320, y: 240 },
      entries,
      key: "group-a",
      phase: "releasing",
      pointer: { x: 320, y: 240 },
      reducedMotion: true,
      runtimePlan: { entries: [], key: "group-a-release" },
      totalCount: 20,
      trail: [],
    }));
    assert(
      (layer.badge.visible as boolean) === false,
      "the aggregate count badge should leave with pointer ownership instead of lingering during release"
    );

    layer.clear();
    motionRuntime.reset();
    const gatherBundle = makeEntry("continuity-bundle", 0, {
      actorKey: "bundle:gather:desktop-left-row-2",
      continuityKey: "bundle:desktop-left-row-2",
      origin: { x: -24, y: 360 },
      originKind: "desktop-page-bundle",
    });
    const bundleGroup = makeGroup({
      center: { x: 340, y: 260 },
      entries: [gatherBundle],
      key: "bundle-continuity",
      phase: "dragging",
      pointer: { x: 340, y: 260 },
      reducedMotion: false,
      totalCount: 2,
      trail: [],
    });
    layer.update(makeState(bundleGroup));
    const gatheredBundleNode = requireAt(layer.nodes, 0, "the gathered bundle node should exist");
    const gatheredBundlePose = {
      x: gatheredBundleNode.position.x,
      y: gatheredBundleNode.position.y,
    };
    const returnBundle: TestGroupDragEntry = {
      ...gatherBundle,
      actorKey: "bundle:return:desktop-left-row-2",
      releaseStart: { kind: "current-pose" },
    };
    layer.update(makeState({
      ...bundleGroup,
      entries: [returnBundle],
      phase: "returning",
      runtimePlan: {
        entries: [{
          actorKey: returnBundle.actorKey,
          fallback: { x: -28, y: 360 },
          id: returnBundle.item.id,
          memberIds: [...returnBundle.memberIds],
          mode: "return",
          target: { area: "desktop", id: returnBundle.item.id },
          velocity: { x: 0, y: 0 },
        }],
        key: "plan-bundle-continuity",
      },
    }));
    assert(
      requireAt(layer.nodes, 0, "the returning bundle node should exist") === gatheredBundleNode &&
        Math.abs(gatheredBundleNode.position.x - gatheredBundlePose.x) < 0.001 &&
        Math.abs(gatheredBundleNode.position.y - gatheredBundlePose.y) < 0.001,
      "a phase-specific bundle actor should reuse its continuity node without a first-frame origin reset"
    );

    layer.clear();
    motionRuntime.reset();
    const boundedDragEntries = Array.from(
      { length: 12 },
      (_, index) => makeEntry(`expanded-${index}`, index)
    );
    layer.update(makeState({
      center: { x: 320, y: 240 },
      entries: boundedDragEntries,
      key: "expanded-release",
      leadId: "expanded-0",
      phase: "dragging",
      pointer: { x: 320, y: 240 },
      reducedMotion: false,
      totalCount: 13,
      trail: [],
    }));
    const boundedLeadNode = requireAt(layer.nodes, 0, "the bounded drag lead node should exist");
    const preservedLeadPosition = {
      x: boundedLeadNode.position.x,
      y: boundedLeadNode.position.y,
    };
    const releaseOnlyEntry = makeEntry("expanded-12", 12, {
      releaseRole: "member",
      releaseStart: {
        alpha: 1,
        kind: "source-origin",
        point: { x: 44, y: 78 },
        scale: 0.72,
      },
    });
    const expandedEntries = [...boundedDragEntries, releaseOnlyEntry];
    const expandedReleaseState = makeState({
      center: { x: 320, y: 240 },
      entries: expandedEntries,
      key: "expanded-release",
      leadId: "expanded-0",
      phase: "releasing",
      pointer: { x: 320, y: 240 },
      reducedMotion: false,
      runtimePlan: {
        entries: expandedEntries.map((entry, index) => ({
          delayMs: index * 8,
          fallback: { x: 480 + index * 2, y: 300 },
          id: entry.item.id,
          memberIds: [entry.item.id],
          mode: "point-handoff",
          target: { area: "desktop", id: entry.item.id, kind: "desktop" },
          velocity: { x: 0, y: 0 },
        })),
        key: "plan-expanded-release",
      },
      totalCount: 13,
      trail: [],
    });
    layer.update(expandedReleaseState);
    assert((layer.nodes.length as number) === 13, "release should grow the reusable node pool beyond the drag representative cap");
    assert(
      Math.abs(boundedLeadNode.position.x - preservedLeadPosition.x) < 0.001 &&
        Math.abs(boundedLeadNode.position.y - preservedLeadPosition.y) < 0.001,
      "existing drag representatives should continue from their current poses"
    );
    layer.update(expandedReleaseState);
    const releaseOnlyNode = requireAt(layer.nodes, 12, "the release-only node should exist");
    const releaseOnlyXChannel = requireValue(
      motionRuntime.getChannel(releaseOnlyNode, "x"),
      "the release-only x channel should exist",
    );
    const releaseOnlyYChannel = requireValue(
      motionRuntime.getChannel(releaseOnlyNode, "y"),
      "the release-only y channel should exist",
    );
    const releaseOnlyScaleXChannel = requireValue(
      motionRuntime.getChannel(releaseOnlyNode.scale, "x"),
      "the release-only scale channel should exist",
    );
    const releaseOnlyXOwner = requireValue(releaseOnlyXChannel.activeBaseKey, "the x channel should have an owner");
    const releaseOnlyYOwner = requireValue(releaseOnlyYChannel.activeBaseKey, "the y channel should have an owner");
    const releaseOnlyScaleOwner = requireValue(releaseOnlyScaleXChannel.activeBaseKey, "the scale channel should have an owner");
    const competingOverlayIds = expandedEntries
      .filter((_entry, index) => {
        const node = requireAt(layer.nodes, index, "each expanded release actor should have a node");
        return motionRuntime.getChannel(node, "x")?.base?.has("overlay") ||
          motionRuntime.getChannel(node, "y")?.base?.has("overlay") ||
          motionRuntime.getChannel(node.scale, "x")?.base?.has("overlay") ||
          motionRuntime.getChannel(node.scale, "y")?.base?.has("overlay");
      })
      .map((entry) => entry.item.id);
    assert(
      competingOverlayIds.length === 0,
      `release ownership should clear every existing follower overlay (${competingOverlayIds.join(",")})`
    );
    assert(
      ["drag", "handoff"].includes(releaseOnlyXOwner) &&
        ["drag", "handoff"].includes(releaseOnlyYOwner) &&
        ["drag", "handoff"].includes(releaseOnlyScaleOwner) &&
        releaseOnlyXChannel.base.size === 1 &&
        releaseOnlyYChannel.base.size === 1 &&
        releaseOnlyScaleXChannel.base.size === 1 &&
        !releaseOnlyXChannel.base.has("overlay") &&
        !releaseOnlyYChannel.base.has("overlay") &&
        !releaseOnlyScaleXChannel.base.has("overlay"),
      `a release-only node should have one release owner instead of retaining a competing stack overlay ` +
        `(x: ${[...releaseOnlyXChannel.base.keys()].join(",")}; ` +
        `y: ${[...releaseOnlyYChannel.base.keys()].join(",")}; ` +
        `scaleX: ${[...releaseOnlyScaleXChannel.base.keys()].join(",")})`
    );
    assert(
      releaseOnlyNode.position.x === 44 &&
        releaseOnlyNode.position.y === 78 &&
        releaseOnlyNode.alpha === 1 &&
        Math.abs(releaseOnlyNode.scale.x - 0.72) < 0.001,
      "a release-only pooled node should begin at its semantic source pose"
    );

    layer.clear();
    const roleTarget = makeEntry("role-target-b", 0, {
      releaseRole: "folder-create-target",
      releaseStart: { alpha: 1, kind: "source-origin", point: { x: 500, y: 220 }, scale: 1 },
    });
    const roleLead = makeEntry("role-lead-a", 1, {
      releaseRole: "lead",
      releaseStart: { kind: "current-pose" },
    });
    layer.update(makeState({
      center: { x: 320, y: 240 },
      entries: [roleTarget, roleLead],
      key: "role-z-order",
      leadId: roleLead.item.id,
      phase: "releasing",
      pointer: { x: 320, y: 240 },
      reducedMotion: true,
      runtimePlan: {
        entries: [roleTarget, roleLead].map((entry, index) => ({
          fallback: { x: 500 + index * 20, y: 300 },
          id: entry.item.id,
          mode: "point-handoff",
          target: { area: "desktop", id: entry.item.id, kind: "desktop" },
        })),
        key: "plan-role-z-order",
      },
      totalCount: 1,
      trail: [],
    }));
    assert(
      requireAt(layer.nodes, 1, "the lead role node should exist").zIndex >
        requireAt(layer.nodes, 0, "the target role node should exist").zIndex,
      "dragged icon A should remain above folder target B even if entry order changes"
    );

    layer.update(makeState({
      center: { x: 360, y: 260 },
      entries: entries.slice(0, 2),
      key: "group-b",
      phase: "gathering",
      pointer: { x: 360, y: 260 },
      reducedMotion: true,
      totalCount: 2,
      trail: [],
    }));
    assert((layer.nodes.length as number) === 13, "shrinking a drag should retain the release high-water node pool for reuse");
    assert(
      requireAt(layer.nodes, 0, "the first reused node should exist").visible &&
        requireAt(layer.nodes, 1, "the second reused node should exist").visible &&
        !requireAt(layer.nodes, 2, "the first unused pooled node should exist").visible,
      "unused pooled nodes should be hidden",
    );

    const stationaryEntries = entries.slice(0, 4);
    layer.update(makeState({
      center: { x: 220, y: 260 },
      entries: stationaryEntries,
      key: "stationary-follow",
      phase: "gathering",
      pointer: { x: 220, y: 260 },
      reducedMotion: false,
      totalCount: 4,
      trail: [{ time: 0, x: 220, y: 260 }],
    }));
    for (let index = 0; index < 20; index += 1) motionRuntime.step(1 / 60);
    layer.update(makeState({
      center: { x: 420, y: 260 },
      entries: stationaryEntries,
      key: "stationary-follow",
      phase: "dragging",
      pointer: { x: 420, y: 260 },
      reducedMotion: false,
      totalCount: 4,
      trail: [
        { time: 0, x: 220, y: 260 },
        { time: 120, x: 420, y: 260 },
      ],
    }));
    const stationaryFollower = requireAt(layer.nodes, 3, "the stationary follower node should exist");
    const followerXBeforeIdleFrames = stationaryFollower.position.x;
    for (let index = 0; index < 10; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    const followerXAfterIdleFrames = stationaryFollower.position.x;
    assert(
      followerXAfterIdleFrames > followerXBeforeIdleFrames + 20,
      "followers should consume the remaining pointer history after mouse movement stops"
    );
    for (let index = 0; index < 4; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    assert(
      Math.abs(stationaryFollower.position.x - followerXAfterIdleFrames) < 0.01,
      "the stationary follower clock should settle instead of running indefinitely"
    );

    const lead = makeEntry("folder-create-lead", 0);
    layer.update(makeState({
      center: { x: 300, y: 220 },
      entries: [lead],
      key: "folder-create",
      phase: "dragging",
      pointer: { x: 300, y: 220 },
      reducedMotion: false,
      totalCount: 1,
      trail: [],
    }));
    const folderTarget = makeEntry("folder-create-target", 1, {
      origin: { x: 515, y: 275 },
      originKind: "folder-create-target",
    });
    layer.update(makeState({
      center: { x: 300, y: 220 },
      entries: [lead, folderTarget],
      key: "folder-create",
      phase: "committing",
      pointer: { x: 300, y: 220 },
      reducedMotion: false,
      runtimePlan: makePointReleasePlan("single-visual", { x: 420, y: 300 }),
      totalCount: 1,
      trail: [],
    }));
    assert(
      requireAt(layer.nodes, 1, "the folder-create target node should exist").position.x === 515 &&
        requireAt(layer.nodes, 1, "the folder-create target node should exist").position.y === 289,
      "an app target added during commit should begin at its visual origin instead of a stale pooled coordinate"
    );

    const singleEntry = makeEntry("single-visual", 0, {
      origin: { x: 120, y: 180 },
    });
    const singleState = makeState({
      center: { x: 260, y: 210 },
      entries: [singleEntry],
      key: "single-visual",
      phase: "dragging",
      pointer: { x: 260, y: 210 },
      reducedMotion: true,
      totalCount: 1,
      trail: [],
      visualSpec: {
        cellHeight: 118,
        cellWidth: 104,
        compact: false,
        iconSize: 64,
        singleLineLabel: false,
        textless: false,
      },
    });
    layer.update(singleState);
    let singleNode = requireAt(layer.nodes, 0, "the single visual node should exist");
    const singleNodeState = requireValue(singleNode.state, "the single visual state should exist");
    assert(
      singleNodeState.compact === false &&
        singleNodeState.singleLineLabel === false &&
        singleNodeState.textless === false &&
        singleNodeState.cellWidth === 104 &&
        singleNodeState.cellHeight === 118,
      "a single representative should retain the source label and cell layout"
    );
    assert(
      singleNode.position.y === 224,
      "visual-center targets should be converted to the labeled node origin"
    );

    const transitionEntry = makeEntry("visual-spec-transition", 0, {
      origin: { x: 120, y: 180 },
    });
    const transitionGroup = makeGroup({
      center: { x: 260, y: 210 },
      entries: [transitionEntry],
      folderTransit: { folderId: "folder-transition" },
      intent: { folderId: "folder-transition", type: "folder-slot" },
      key: "visual-spec-transition",
      phase: "dragging",
      pointer: { x: 260, y: 210 },
      reducedMotion: false,
      totalCount: 1,
      trail: [],
      visualSpec: {
        cellHeight: 138,
        cellWidth: 126,
        compact: false,
        iconSize: 92,
        singleLineLabel: false,
        textless: false,
      },
    });
    const folderVisualSpec = {
      cellHeight: 104,
      cellWidth: 86,
      compact: false,
      iconSize: 64,
      singleLineLabel: false,
      textless: false,
    };
    layer.update(makeState(transitionGroup, { folderVisualSpec }));
    const transitionNode = requireAt(layer.nodes, 0, "the visual transition node should exist");
    let transitionState = requireValue(transitionNode.state, "the initial visual transition state should exist");
    assert(
      transitionState.cellWidth === 126 && transitionState.iconSize === 92,
      "folder visual handoff should start from the grabbed desktop specification"
    );
    motionRuntime.step(0.09);
    layer.update(makeState(transitionGroup, { folderVisualSpec }));
    transitionState = requireValue(transitionNode.state, "the interpolated visual transition state should exist");
    assert(
      transitionState.cellWidth < 126 && transitionState.cellWidth > 86 &&
        transitionState.iconSize < 92 && transitionState.iconSize > 64,
      "folder visual handoff should interpolate icon and label geometry while the pointer remains down"
    );
    for (let index = 0; index < 8; index += 1) {
      motionRuntime.step(0.05);
      layer.update(makeState(transitionGroup, { folderVisualSpec }));
    }
    transitionState = requireValue(transitionNode.state, "the settled folder visual state should exist");
    assert(
      Math.abs(transitionState.cellWidth - 86) < 0.001 &&
        Math.abs(transitionState.iconSize - 64) < 0.001,
      "folder visual handoff should settle on the folder specification before release"
    );
    const desktopReturnGroup = makeGroup({
      ...transitionGroup,
      folderTransit: null,
      intent: { type: "desktop-slot" },
    });
    layer.update(makeState(desktopReturnGroup, { folderVisualSpec }));
    motionRuntime.step(0.09);
    layer.update(makeState(desktopReturnGroup, { folderVisualSpec }));
    transitionState = requireValue(transitionNode.state, "the returning desktop visual state should exist");
    assert(
      transitionState.cellWidth < 126 && transitionState.cellWidth > 86,
      "leaving the folder should reverse the same visual handoff instead of snapping at release"
    );

    const folderOriginGroup = makeGroup({
      ...transitionGroup,
      key: "folder-origin-visual-spec",
      folderTransit: null,
      intent: { index: 0, pageIndex: 0, type: "desktop-slot" },
      source: { folderId: "folder-transition", index: 0, pageIndex: 0, type: "folder" },
      visualSpec: folderVisualSpec,
    });
    const desktopVisualSpec = transitionGroup.visualSpec;
    layer.update(makeState(folderOriginGroup, { desktopVisualSpec, folderVisualSpec }));
    const folderOriginNode = requireAt(layer.nodes, 0, "the folder-origin node should exist");
    let folderOriginState = requireValue(folderOriginNode.state, "the initial folder-origin state should exist");
    assert(
      folderOriginState.cellWidth === 86 && folderOriginState.iconSize === 64,
      "a folder-origin drag should begin with the folder label and icon specification"
    );
    motionRuntime.step(0.09);
    layer.update(makeState(folderOriginGroup, { desktopVisualSpec, folderVisualSpec }));
    folderOriginState = requireValue(folderOriginNode.state, "the interpolated folder-origin state should exist");
    assert(
      folderOriginState.cellWidth < 126 && folderOriginState.cellWidth > 86 &&
        folderOriginState.iconSize < 92 && folderOriginState.iconSize > 64,
      "leaving a folder should interpolate a folder-origin drag toward the desktop specification"
    );
    for (let index = 0; index < 8; index += 1) {
      motionRuntime.step(0.05);
      layer.update(makeState(folderOriginGroup, { desktopVisualSpec, folderVisualSpec }));
    }
    folderOriginState = requireValue(folderOriginNode.state, "the settled folder-origin state should exist");
    assert(
      Math.abs(folderOriginState.cellWidth - 126) < 0.001 &&
        Math.abs(folderOriginState.iconSize - 92) < 0.001,
      "a folder-origin drag should settle on the desktop specification before release"
    );

    transitionNode.labelTransitionBlendActive = true;
    transitionNode.labelTransitionText.visible = true;
    transitionNode.labelText.visible = true;
    transitionNode.labelText.alpha = 0;
    layer.clear();
    assert(
      (transitionNode.labelTransitionBlendActive as boolean) === false &&
        (transitionNode.labelTransitionText.visible as boolean) === false &&
        transitionNode.labelText.alpha === 1,
      "clearing a pooled drag actor should stop any in-flight label handoff before reuse"
    );

    motionRuntime.reset();
    const hoverEntry = makeEntry("hover-release-app", 0, {
      origin: { x: 120, y: 180 },
    });
    const hoverGroup = makeGroup({
      center: { x: 260, y: 210 },
      entries: [hoverEntry],
      key: "hover-release",
      phase: "dragging",
      pointer: { x: 260, y: 210 },
      reducedMotion: false,
      totalCount: 1,
      trail: [],
    });
    layer.update(makeState(hoverGroup, {
      dragFolderHoverState: {
        key: "hover-release-target",
        phase: "hover",
        targetId: hoverEntry.item.id,
        targetType: "app",
      },
    }));
    motionRuntime.step(0.04);
    const hoverReleaseNode = requireAt(layer.nodes, 0, "the hover release node should exist");
    assert(
      hoverReleaseNode.iconSprite.alpha < 0.9,
      "app-on-app hover should visibly dim the source before release"
    );
    layer.update(makeState({
      ...hoverGroup,
      phase: "releasing",
      runtimePlan: makePointReleasePlan(hoverEntry.item.id, { x: 420, y: 300 }),
    }));
    assert(
      hoverReleaseNode.iconSprite.alpha === 1 &&
        hoverReleaseNode.emojiText.alpha === 1 &&
        hoverReleaseNode.folderCreateBackdrop.visible === false,
      "accepted release must take the pooled icon out of app-folder-create hover synchronously instead of brightening during the landing motion"
    );

    const slotFolder: GroupReleaseFolderNode = new Container();
    slotFolder.iconSize = 64;
    slotFolder.item = { id: "slot-folder", type: "folder" };
    slotFolder.getFolderPreviewChildReleasePose = (_relativeTo, _slotIndex, options = {}) => ({
        center: { x: 420, y: 300 },
        matrix: { a: 1, b: 0, c: 0, d: 1 },
        ...(options.expectedChildId !== undefined
          ? { targetChildId: options.expectedChildId }
          : {}),
      });
    const slotResolverNodePresence: boolean[] = [];
    layer.resolveFolderNode = (payload) => {
      slotResolverNodePresence.push(Object.prototype.hasOwnProperty.call(payload, "node"));
      return slotFolder;
    };
    const slotEntry = makeEntry("slot-release-app", 0);
    const slotGroup = makeGroup({
      center: { x: 260, y: 210 },
      entries: [slotEntry],
      key: "slot-release",
      phase: "releasing",
      pointer: { x: 260, y: 210 },
      reducedMotion: true,
      runtimePlan: {
        entries: [{
          id: slotEntry.item.id,
          mode: "folder-preview-slot",
          target: {
            expectedChildId: slotEntry.item.id,
            folderId: "slot-folder",
            kind: "closed-folder",
            slotIndex: 0,
          },
        }],
        key: "plan-slot-release",
      },
      totalCount: 1,
      trail: [],
    });
    layer.update(makeState(slotGroup));
    assert(
      slotResolverNodePresence[0] === false && slotResolverNodePresence.includes(true),
      "folder target preflight should omit an unavailable release node while active-lane resolution should publish it",
    );
    const slotNode = requireAt(layer.nodes, 0, "the folder-slot release node should exist");
    const slotLane = requireFolderLane(
      [...releaseController.lanes.values()][0],
      "the folder-slot release lane should exist",
    );
    const slotLaneController = requireValue(slotLane.controller, "the folder-slot controller should exist");
    const slotRelease = requireValue(slotLaneController.active?.release, "the folder-slot release should be active");
    assert(
      slotNode.iconSize === 64 &&
        slotNode.state?.folderPreviewRelease !== true &&
        slotNode.labelText.visible === true &&
        slotNode.folderSlotReleaseVisual?.visible !== true,
      "folder slot release ghosts must preserve the grabbed source visual on the release handoff frame"
    );
    assert(
      slotRelease.size?.width === 64 &&
        slotRelease.targetVisualIconSize === 16 &&
        Math.abs(requireValue(slotRelease.sourceSize, "the slot source size should exist") - (64 * 1.08)) < 0.001,
      "folder slot release must keep target and source metrics in the same handoff contract"
    );
    for (let index = 0; index < 12 && (slotNode.folderSlotReleaseVisual?.visible as boolean | undefined) !== true; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    assert(
      slotNode.iconSize === 64 &&
        (slotNode.folderSlotReleaseVisual?.visible as boolean | undefined) === true &&
        slotNode.visualWrap.alpha === 1 &&
        slotNode.folderSlotReleaseVisualTargetSize === 16 &&
        slotNode.folderSlotReleaseEmoji.style.lineHeight === 0,
      "folder slot release ghosts should blend in a target-sized thumbnail raster without removing the continuous source visual"
    );

    layer.clear();
    motionRuntime.reset();
    const staticSlotPoseResolver = slotFolder.getFolderPreviewChildReleasePose;
    const movingSlotCenter = { x: 420, y: 300 };
    slotFolder.getFolderPreviewChildReleasePose = (_relativeTo, _slotIndex, options = {}) => ({
      center: { ...movingSlotCenter },
      matrix: { a: 1, b: 0, c: 0, d: 1 },
      ...(options.expectedChildId !== undefined
        ? { targetChildId: options.expectedChildId }
        : {}),
    });
    const movingSlotEntry = makeEntry("moving-slot-release-app", 0, {
      origin: { x: 180, y: 220 },
    });
    const movingSlotGroup = makeGroup({
      center: { x: 260, y: 210 },
      entries: [movingSlotEntry],
      key: "moving-slot-release",
      phase: "releasing",
      pointer: { x: 260, y: 210 },
      reducedMotion: false,
      runtimePlan: {
        entries: [{
          id: movingSlotEntry.item.id,
          mode: "folder-preview-slot",
          target: {
            expectedChildId: movingSlotEntry.item.id,
            folderId: "slot-folder",
            kind: "closed-folder",
            slotIndex: 0,
          },
        }],
        key: "plan-moving-slot-release",
      },
      totalCount: 1,
      trail: [],
    });
    const movingSlotState = makeState(movingSlotGroup);
    layer.update(movingSlotState);
    for (let index = 0; index < 6; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    const movingSlotNode = requireAt(layer.nodes, 0, "the moving folder-slot node should exist");
    layer.update(movingSlotState);
    const movingSlotCenterBeforeTargetMove = layer.toLocal(
      { x: 0, y: 0 },
      movingSlotNode.visualWrap
    );
    movingSlotCenter.x += 120;
    movingSlotCenter.y -= 36;
    renderGroupDragFrame(layer);
    const movingSlotCenterAfterTargetMove = layer.toLocal(
      { x: 0, y: 0 },
      movingSlotNode.visualWrap
    );
    assert(
      movingSlotCenterAfterTargetMove.x - movingSlotCenterBeforeTargetMove.x > 5 &&
        movingSlotCenterAfterTargetMove.y - movingSlotCenterBeforeTargetMove.y < -1,
      "a folder-slot release actor should keep following a moving folder after the release state is refreshed"
    );
    slotFolder.getFolderPreviewChildReleasePose = staticSlotPoseResolver;

    layer.clear();
    motionRuntime.reset();
    const movingAbsorbCenter = { x: 420, y: 300 };
    slotFolder.getFolderCenterReleasePose = () => ({ center: { ...movingAbsorbCenter } });
    const movingAbsorbEntry = makeEntry("moving-center-absorb-app", 0, {
      origin: { x: 180, y: 220 },
    });
    const movingAbsorbGroup = makeGroup({
      center: { x: 260, y: 210 },
      entries: [movingAbsorbEntry],
      key: "moving-center-absorb",
      phase: "releasing",
      pointer: { x: 260, y: 210 },
      reducedMotion: false,
      runtimePlan: {
        entries: [{
          id: movingAbsorbEntry.item.id,
          mode: "folder-center-absorb",
          target: { folderId: "slot-folder", kind: "closed-folder" },
        }],
        key: "plan-moving-center-absorb",
      },
      totalCount: 1,
      trail: [],
    });
    const movingAbsorbState = makeState(movingAbsorbGroup);
    layer.update(movingAbsorbState);
    for (let index = 0; index < 6; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    const movingAbsorbNode = requireAt(layer.nodes, 0, "the moving center-absorb node should exist");
    layer.update(movingAbsorbState);
    const movingAbsorbCenterBeforeTargetMove = layer.toLocal(
      { x: 0, y: 0 },
      movingAbsorbNode.visualWrap
    );
    movingAbsorbCenter.x += 120;
    movingAbsorbCenter.y -= 36;
    renderGroupDragFrame(layer);
    const movingAbsorbCenterAfterTargetMove = layer.toLocal(
      { x: 0, y: 0 },
      movingAbsorbNode.visualWrap
    );
    const distanceBeforeFade = Math.hypot(
      movingAbsorbCenter.x - movingAbsorbCenterAfterTargetMove.x,
      movingAbsorbCenter.y - movingAbsorbCenterAfterTargetMove.y
    );
    const alphaBeforeFade = movingAbsorbNode.alpha;
    for (let index = 0; index < 5; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    const movingAbsorbCenterDuringFade = layer.toLocal(
      { x: 0, y: 0 },
      movingAbsorbNode.visualWrap
    );
    const distanceDuringFade = Math.hypot(
      movingAbsorbCenter.x - movingAbsorbCenterDuringFade.x,
      movingAbsorbCenter.y - movingAbsorbCenterDuringFade.y
    );
    assert(
      movingAbsorbCenterAfterTargetMove.x - movingAbsorbCenterBeforeTargetMove.x > 5 &&
        movingAbsorbCenterAfterTargetMove.y - movingAbsorbCenterBeforeTargetMove.y < -1 &&
        movingAbsorbNode.alpha < alphaBeforeFade &&
        distanceDuringFade < distanceBeforeFade,
      "a fading center-absorb actor should keep approaching a moving folder after the release state is refreshed"
    );

    layer.clear();
    motionRuntime.reset();
    const releaseOnlySlotEntry = makeEntry("release-only-slot-app", 12, {
      releaseRole: "member",
      releaseStart: {
        alpha: 0,
        kind: "source-origin",
        point: { x: 300, y: 220 },
        scale: 0.72,
      },
    });
    const settledBeforeReleaseOnlySlot = releaseSettled;
    layer.update(makeState({
      center: { x: 300, y: 220 },
      entries: [releaseOnlySlotEntry],
      key: "release-only-slot",
      leadId: "another-lead",
      phase: "releasing",
      pointer: { x: 300, y: 220 },
      reducedMotion: false,
      runtimePlan: {
        entries: [{
          delayMs: 0,
          id: releaseOnlySlotEntry.item.id,
          mode: "folder-preview-slot",
          startAlpha: 0,
          target: {
            expectedChildId: releaseOnlySlotEntry.item.id,
            folderId: "slot-folder",
            kind: "closed-folder",
            slotIndex: 0,
          },
        }],
        key: "plan-release-only-slot",
      },
      totalCount: 13,
      trail: [],
    }));
    const releaseOnlySlotNode = requireAt(layer.nodes, 0, "the release-only folder-slot node should exist");
    assert(releaseOnlySlotNode.alpha === 0, "a folder-bound release-only node should retain its invisible first frame");
    for (let index = 0; index < 180 && releaseSettled === settledBeforeReleaseOnlySlot; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    assert(
      releaseOnlySlotNode.alpha > 0.99,
      `a release-only node should fade into its folder preview landing (alpha: ${releaseOnlySlotNode.alpha})`
    );
    assert(
      releaseSettled > settledBeforeReleaseOnlySlot,
      "folder preview ownership should settle after the release-only node becomes visible"
    );

    layer.clear();
    motionRuntime.reset();
    slotFolder.getFolderCenterReleasePose = () => ({ center: { x: 420, y: 300 } });
    const releaseOnlyCenterEntry = makeEntry("release-only-center-app", 13, {
      releaseRole: "member",
      releaseStart: {
        alpha: 0,
        kind: "source-origin",
        point: { x: 300, y: 220 },
        scale: 0.72,
      },
    });
    const settledBeforeCenterAbsorb = releaseSettled;
    layer.update(makeState({
      center: { x: 300, y: 220 },
      entries: [releaseOnlyCenterEntry],
      key: "release-only-center",
      leadId: "another-lead",
      phase: "releasing",
      pointer: { x: 300, y: 220 },
      reducedMotion: false,
      runtimePlan: {
        entries: [{
          delayMs: 100,
          id: releaseOnlyCenterEntry.item.id,
          mode: "folder-center-absorb",
          startAlpha: 0,
          target: { folderId: "slot-folder", kind: "closed-folder" },
        }],
        key: "plan-release-only-center",
      },
      totalCount: 14,
      trail: [],
    }));
    const releaseOnlyCenterNode = requireAt(layer.nodes, 0, "the release-only center node should exist");
    for (let index = 0; index < 5; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    assert(
      releaseOnlyCenterNode.alpha === 0,
      "a center-absorb member should remain invisible until its release delay starts"
    );
    for (let index = 0; index < 8; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    assert(
      releaseOnlyCenterNode.alpha > 0.1,
      "a center-absorb member should become visible while travelling from the stack tail"
    );
    for (let index = 0; index < 120 && releaseSettled === settledBeforeCenterAbsorb; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    assert(
      releaseOnlyCenterNode.alpha < 0.01 && releaseSettled > settledBeforeCenterAbsorb,
      "a center-absorb member should fade out at the folder center before ownership settles"
    );

    layer.clear();
    motionRuntime.reset();
    const continuityDraggedApp = makeEntry("created-folder-continuity-dragged", 0);
    const continuityTargetApp = makeEntry("created-folder-continuity-target", 1, {
      origin: { x: 515, y: 275 },
      originKind: "folder-create-target",
    });
    const continuityGroup = makeGroup({
      center: { x: 300, y: 220 },
      entries: [continuityDraggedApp],
      key: "created-folder-continuity",
      phase: "dragging",
      pointer: { x: 300, y: 220 },
      reducedMotion: false,
      totalCount: 1,
      trail: [],
      visualSpec: {
        cellHeight: 118,
        cellWidth: 104,
        compact: false,
        iconSize: 64,
        singleLineLabel: false,
        textless: false,
      },
    });
    layer.update(makeState(continuityGroup));
    const continuityDraggedNode = requireAt(layer.nodes, 0, "the continuity drag node should exist");
    const draggedCenterBeforeRelease = layer.toLocal(
      { x: 0, y: 0 },
      continuityDraggedNode.visualWrap
    );
    layer.update(makeState({
      ...continuityGroup,
      entries: [continuityTargetApp, continuityDraggedApp],
      phase: "releasing",
      runtimePlan: {
        entries: [continuityTargetApp, continuityDraggedApp].map((entry, slotIndex) => ({
          actorKey: entry.actorKey,
          id: entry.item.id,
          mode: "created-folder",
          target: {
            expectedChildId: entry.item.id,
            folderId: "slot-folder",
            kind: "created-folder",
            slotIndex,
          },
        })),
        key: "plan-created-folder-continuity",
        shellActors: [{
          endAnchor: { folderId: "slot-folder", kind: "folder-shell" },
          key: "folderShell:slot-folder",
          role: "folder-shell",
          zBand: 100,
        }],
      },
    }));
    const continuityTargetNode = requireAt(layer.nodes, 0, "the continuity target node should exist");
    const continuityDraggedReleaseNode = requireAt(layer.nodes, 1, "the continuity release node should exist");
    const draggedCenterAfterRelease = layer.toLocal(
      { x: 0, y: 0 },
      continuityDraggedReleaseNode.visualWrap
    );
    const targetCenterAfterRelease = layer.toLocal(
      { x: 0, y: 0 },
      continuityTargetNode.visualWrap
    );
    const continuityFrame = requireValue(
      releaseController.folderShellFrame,
      "the continuity folder shell frame should exist",
    );
    assert(
      continuityDraggedReleaseNode === continuityDraggedNode &&
        Math.abs(draggedCenterAfterRelease.x - draggedCenterBeforeRelease.x) < 0.001 &&
        Math.abs(draggedCenterAfterRelease.y - draggedCenterBeforeRelease.y) < 0.001 &&
        Math.abs(targetCenterAfterRelease.x - continuityTargetApp.origin.x) < 0.001 &&
        Math.abs(targetCenterAfterRelease.y - continuityTargetApp.origin.y) < 0.001 &&
        Math.abs(continuityFrame.position.x - continuityTargetApp.origin.x) < 0.001 &&
        Math.abs(continuityFrame.position.y - continuityTargetApp.origin.y) < 0.001,
      "created-folder release must preserve actor-to-node identity and both app visual centers when source ordering puts target B before dragged A"
    );

    layer.clear();
    motionRuntime.reset();
    const draggedApp = makeEntry("created-folder-dragged", 0);
    const targetApp = makeEntry("created-folder-target", 1, {
      originKind: "folder-create-target",
    });
    layer.update(makeState({
      center: { x: 260, y: 210 },
      entries: [draggedApp, targetApp],
      key: "created-folder-z-order",
      phase: "releasing",
      pointer: { x: 260, y: 210 },
      reducedMotion: false,
      runtimePlan: {
        entries: [draggedApp, targetApp].map((entry, index) => ({
          id: entry.item.id,
          mode: "created-folder",
          target: {
            expectedChildId: entry.item.id,
            folderId: "slot-folder",
            kind: "created-folder",
            slotIndex: index,
          },
        })),
        key: "plan-created-folder-z-order",
        shellActors: [{
          endAnchor: { folderId: "slot-folder", kind: "folder-shell" },
          key: "folderShell:slot-folder",
          role: "folder-shell",
          zBand: 100,
        }],
      },
      totalCount: 1,
      trail: [],
    }));
    const createdLanesById = new Map<string, GroupReleaseFolderLane>();
    for (const lane of releaseController.lanes.values()) {
      if (lane.kind === "folder" && lane.context) {
        createdLanesById.set(lane.context.entry.id, lane);
      }
    }
    const frame = requireValue(releaseController.folderShellFrame, "the created-folder frame should exist");
    const draggedLane = requireValue(createdLanesById.get(draggedApp.item.id), "the dragged folder lane should exist");
    const targetLane = requireValue(createdLanesById.get(targetApp.item.id), "the target folder lane should exist");
    const draggedFollower = requireValue(
      requireValue(draggedLane.controller, "the dragged folder controller should exist").targetFollower,
      "the dragged folder follower should exist",
    );
    const targetFollower = requireValue(
      requireValue(targetLane.controller, "the target folder controller should exist").targetFollower,
      "the target folder follower should exist",
    );
    layer.sortChildren();
    assert(
      layer.getChildIndex(frame) < layer.getChildIndex(targetFollower) &&
        layer.getChildIndex(targetFollower) < layer.getChildIndex(draggedFollower),
      "created-folder release must render the frame below target B and keep dragged icon A above B after reparenting"
    );

    layer.resolveFolderNode = () => null;
    layer.clear();

    // Restore the unchanged-state probe after the isolated handoff scenario.
    // A cleared session may take any free pooled node; identity is guaranteed
    // only while the same actor remains active within one transfer session.
    layer.update(singleState);
    singleNode = requireAt(layer.nodes, 0, "the restored single visual node should exist");

    let stateCalls = 0;
    const originalSetState = singleNode.setState.bind(singleNode);
    singleNode.setState = (nextState) => {
      stateCalls += 1;
      return originalSetState(nextState);
    };
    layer.update(singleState);
    assert(stateCalls === 0, "unchanged pointer frames should not rebuild IconNode state");

    motionRuntime.reset();
    const pointReleaseSettledBefore = releaseSettled;
    const singleGroupState = requireValue(singleState.groupState, "the single visual group state should exist");
    layer.update({
      ...singleState,
      groupState: {
        ...singleGroupState,
        center: { x: 260, y: 210 },
        phase: "releasing",
        runtimePlan: makePointReleasePlan("single-visual", { x: 420, y: 300 }),
      },
    });
    for (let index = 0; index < 180 && releaseSettled === pointReleaseSettledBefore; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    assert(
      releaseSettled === pointReleaseSettledBefore + 1,
      "accepted release should report one explicit visual settlement"
    );
    assert(
      singleNode.alpha > 0.99 &&
        Math.abs(singleNode.scale.x - 1) < 0.01 &&
        Math.abs(singleNode.scale.y - 1) < 0.01,
      "accepted release should keep the representative visible and finish at the real icon scale"
    );
    assert(
      Math.abs(singleNode.position.x - 420) < 0.01 &&
        Math.abs(singleNode.position.y - 314) < 0.01,
      "accepted release should land on the visual-center-adjusted target"
    );

    layer.clear();
    motionRuntime.reset();
    const egressEntry = makeEntry("desktop-egress", 0, {
      alphaPolicy: { from: 1, kind: "fade-out", monotonic: true, to: 0 },
      visibilityPolicy: { folderId: "folder-a", kind: "desktop-occluded-egress" },
    });
    const egressGroup = makeGroup({
      center: { x: 300, y: 220 },
      entries: [egressEntry],
      key: "desktop-egress-group",
      phase: "dragging",
      pointer: { x: 300, y: 220 },
      reducedMotion: false,
      totalCount: 1,
      trail: [],
    });
    layer.update(makeState(egressGroup));
    const egressNode = requireAt(layer.nodes, 0, "the desktop egress node should exist");
    const egressSettledBefore = releaseSettled;
    layer.update(makeState({
      ...egressGroup,
      phase: "returning",
      runtimePlan: {
        entries: [{
          actorKey: egressEntry.actorKey,
          alphaPolicy: egressEntry.alphaPolicy,
          fallback: { x: 60, y: 40 },
          id: egressEntry.item.id,
          memberIds: [...egressEntry.memberIds],
          mode: "return",
          originAlpha: 1,
          target: { area: "desktop", id: egressEntry.item.id },
          velocity: { x: 0, y: 0 },
        }],
        key: "plan-desktop-egress",
      },
    }));
    for (let index = 0; index < 180 && releaseSettled === egressSettledBefore; index += 1) {
      motionRuntime.step(1 / 60);
      renderGroupDragFrame(layer);
    }
    assert(
      releaseSettled === egressSettledBefore + 1 && egressNode.alpha < 0.01,
      "an occluded desktop return should settle at zero alpha without an opaque handoff flash"
    );

    layer.clear();
    motionRuntime.reset();
    const clippedGatherEntry = makeEntry("folder-page-clipped", 0, {
      actorKey: "bundle:gather:folder-page-left-row-1",
      continuityKey: "bundle:folder-page-left-row-1",
      originKind: "folder-page-bundle",
    });
    const clippedGroup = makeGroup({
      center: { x: 300, y: 220 },
      entries: [clippedGatherEntry],
      key: "folder-page-clip-group",
      phase: "dragging",
      pointer: { x: 300, y: 220 },
      reducedMotion: false,
      totalCount: 2,
      trail: [],
    });
    layer.update(makeState(clippedGroup));
    const clippedNode = requireAt(layer.nodes, 0, "the clipped folder-page node should exist");
    const clippedReturnEntry: TestGroupDragEntry = {
      ...clippedGatherEntry,
      actorKey: "bundle:return:folder-page-left-row-1",
      alphaPolicy: { kind: "handoff", monotonic: true },
      releaseStart: { kind: "current-pose" },
      visibilityPolicy: { folderId: "folder-a", kind: "folder-panel-clip" },
    };
    layer.update(makeState({
      ...clippedGroup,
      entries: [clippedReturnEntry],
      phase: "returning",
      runtimePlan: {
        entries: [{
          actorKey: clippedReturnEntry.actorKey,
          alphaPolicy: clippedReturnEntry.alphaPolicy,
          fallback: { x: 76, y: 160 },
          id: clippedReturnEntry.item.id,
          memberIds: [...clippedReturnEntry.memberIds],
          mode: "return",
          originAlpha: 1,
          target: { area: "folder", id: clippedReturnEntry.item.id },
          velocity: { x: 0, y: 0 },
        }],
        key: "plan-folder-page-clip",
      },
    }));
    assert(
      requireAt(layer.nodes, 0, "the clipped return node should exist") === clippedNode &&
        clippedNode.parent === layer.folderClipActorLayer &&
        layer.folderClipActorLayer.mask === layer.folderClipMask &&
        clippedNode.alpha > 0.99,
      "a remote folder-page return should preserve its node and route it through the outer-panel clip while staying opaque"
    );

    layer.clear();
    const recycledNode = requireAt(layer.nodes, 0, "the recycled node should exist");
    recycledNode.pivot.set(0, -14);
    recycledNode.skew.set(0.12, -0.08);
    recycledNode.rotation = 0.2;
    layer.clear();
    assert(
      recycledNode.pivot.x === 0 &&
        recycledNode.pivot.y === 0 &&
        recycledNode.skew.x === 0 &&
        recycledNode.skew.y === 0 &&
        recycledNode.rotation === 0,
      "returning an actor to the pool should clear structural transforms left by folder release ownership"
    );

    recycledNode.pivot.set(0, -14);
    layer.update(makeState({
      center: { x: 260, y: 210 },
      entries: [makeEntry("recycled-desktop", 0)],
      key: "recycled-desktop-group",
      phase: "gathering",
      pointer: { x: 260, y: 210 },
      reducedMotion: true,
      totalCount: 1,
      trail: [],
    }));
    assert(
      requireAt(layer.nodes, 0, "the reused desktop node should exist") === recycledNode &&
        recycledNode.pivot.x === 0 && recycledNode.pivot.y === 0,
      "allocating a pooled actor for a new drag should enforce the neutral root-transform invariant"
    );

    layer.clear();
    assert(
      !layer.visible && layer.activeNodesByContinuityKey.size === 0 && layer.nodes.every((node) => !node.visible),
      "clearing should release every pooled visual owner"
    );
  } finally {
    layer.destroy({ children: true });
    motionRuntime.reset();
  }
}
