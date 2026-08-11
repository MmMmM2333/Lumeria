import { motionRuntime } from "../animation/motionRuntime.js";

function installPixiTextTestDom() {
  if (!("CanvasRenderingContext2D" in globalThis)) {
    globalThis.CanvasRenderingContext2D = class CanvasRenderingContext2D {};
  }
  if ("document" in globalThis) return;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      baseURI: "http://localhost/",
      fonts: null,
      createElement(tagName) {
        if (tagName !== "canvas") return {};
        const context = Object.create(globalThis.CanvasRenderingContext2D.prototype);
        Object.assign(context, {
          canvas: null,
          clearRect: () => {},
          fillRect: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          measureText: (text) => ({
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

function app(id) {
  return { emoji: id.slice(0, 1).toUpperCase(), id, name: id, type: "app" };
}

function makeEntry(id, order, overrides = {}) {
  return {
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

function makeState(groupState, overrides = {}) {
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

function makePointReleasePlan(entryId, fallback) {
  return {
    entries: [{
      delayMs: 0,
      fallback,
      id: entryId,
      memberIds: [entryId],
      mode: "point-handoff",
      order: 0,
      start: { offset: { x: 0, y: 0 }, pointer: fallback },
      target: { area: "desktop", id: entryId, kind: "desktop" },
      velocity: { x: 0, y: 0 },
    }],
    key: `plan-${entryId}`,
    status: "pending",
  };
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
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Group drag layer test failed] ${message}`);
  };
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
    prewarmLayer.onRender?.();
    assert(
      prewarmLayer.nodes.length === 4 &&
        prewarmLayer.nodes.slice(2).every((node) => !node.visible),
      "subsequent render frames should continue one-at-a-time prewarming without exposing pooled nodes"
    );
    prewarmLayer.update(makeState(null, { releasePrewarmCount: 6 }));
    assert(
      prewarmLayer.nodes.length === 5 &&
        prewarmLayer.nodes.every((node) => !node.visible) &&
        prewarmRequests >= 3,
      "passive batch-mode prewarming should continue while no drag presentation is active"
    );

    const gatedEntries = Array.from({ length: 6 }, (_, index) => makeEntry(`gated-${index}`, index));
    const gatedState = makeState({
      center: { x: 260, y: 210 },
      entries: gatedEntries,
      key: "gated-release",
      leadId: gatedEntries[0].item.id,
      phase: "accepted",
      pointer: { x: 260, y: 210 },
      reducedMotion: false,
      releasePlan: {
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
      prewarmLayer.nodes.length === 6 &&
        prewarmLayer.activeEntryIds.size === 0 &&
        prewarmLayer.releaseController.lanes.size === 0,
      "the frame that finishes pool allocation should not also construct every release lane"
    );
    prewarmLayer.update(gatedState);
    assert(
      prewarmLayer.activeEntryIds.size === 6 &&
        prewarmLayer.releaseController.lanes.size === 6,
      "release lanes should start together on the render after the pool becomes ready"
    );
  } finally {
    prewarmLayer.destroy({ children: true });
  }
  let releaseSettled = 0;
  const layer = new GroupDragLayer({
    onReleaseSettled: () => {
      releaseSettled += 1;
    },
  });
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
    assert(layer.entryBadges[3].container.visible && layer.entryBadges[3].text.text === "+2", "bundle representatives should expose an additional-member badge");
    assert(!("trail" in layer), "batch dragging should not allocate a visible pointer-trail graphics layer");
    assert(layer.badge.visible === true, "the aggregate count badge should remain visible while the group is interactive");

    layer.update(makeState({
      center: { x: 320, y: 240 },
      dropStatus: "accepted",
      entries,
      key: "group-a",
      phase: "accepted",
      pointer: { x: 320, y: 240 },
      reducedMotion: true,
      releasePlan: { entries: [], key: "group-a-release" },
      totalCount: 20,
      trail: [],
    }));
    assert(
      layer.badge.visible === false,
      "the aggregate count badge should leave with pointer ownership instead of lingering during release"
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
    const preservedLeadPosition = {
      x: layer.nodes[0].position.x,
      y: layer.nodes[0].position.y,
    };
    const releaseOnlyEntry = makeEntry("expanded-12", 12, {
      releaseRole: "member",
      releaseStart: {
        alpha: 0,
        kind: "stack-tail",
        point: { x: 320, y: 240 },
        scale: 0.72,
      },
    });
    const expandedEntries = [...boundedDragEntries, releaseOnlyEntry];
    const expandedReleaseState = makeState({
      center: { x: 320, y: 240 },
      entries: expandedEntries,
      key: "expanded-release",
      leadId: "expanded-0",
      phase: "accepted",
      pointer: { x: 320, y: 240 },
      reducedMotion: false,
      releasePlan: {
        entries: expandedEntries.map((entry, index) => ({
          delayMs: index * 8,
          fallback: { x: 480 + index * 2, y: 300 },
          id: entry.item.id,
          memberIds: [entry.item.id],
          mode: "point-handoff",
          order: index,
          target: { area: "desktop", id: entry.item.id, kind: "desktop" },
          velocity: { x: 0, y: 0 },
        })),
        key: "plan-expanded-release",
      },
      totalCount: 13,
      trail: [],
    });
    layer.update(expandedReleaseState);
    assert(layer.nodes.length === 13, "release should grow the reusable node pool beyond the drag representative cap");
    assert(
      Math.abs(layer.nodes[0].position.x - preservedLeadPosition.x) < 0.001 &&
        Math.abs(layer.nodes[0].position.y - preservedLeadPosition.y) < 0.001,
      "existing drag representatives should continue from their current poses"
    );
    layer.update(expandedReleaseState);
    const releaseOnlyXChannel = motionRuntime.getChannel(layer.nodes[12], "x");
    const releaseOnlyYChannel = motionRuntime.getChannel(layer.nodes[12], "y");
    const releaseOnlyScaleXChannel = motionRuntime.getChannel(layer.nodes[12].scale, "x");
    const competingOverlayIds = expandedEntries
      .filter((_entry, index) => {
        const node = layer.nodes[index];
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
      ["drag", "handoff"].includes(releaseOnlyXChannel?.activeBaseKey) &&
        ["drag", "handoff"].includes(releaseOnlyYChannel?.activeBaseKey) &&
        ["drag", "handoff"].includes(releaseOnlyScaleXChannel?.activeBaseKey) &&
        releaseOnlyXChannel.base.size === 1 &&
        releaseOnlyYChannel.base.size === 1 &&
        releaseOnlyScaleXChannel.base.size === 1 &&
        !releaseOnlyXChannel.base.has("overlay") &&
        !releaseOnlyYChannel.base.has("overlay") &&
        !releaseOnlyScaleXChannel.base.has("overlay"),
      `a release-only node should have one release owner instead of retaining a competing stack overlay ` +
        `(x: ${[...(releaseOnlyXChannel?.base?.keys?.() || [])].join(",")}; ` +
        `y: ${[...(releaseOnlyYChannel?.base?.keys?.() || [])].join(",")}; ` +
        `scaleX: ${[...(releaseOnlyScaleXChannel?.base?.keys?.() || [])].join(",")})`
    );
    assert(
      layer.nodes[12].position.x === 320 &&
        layer.nodes[12].position.y === 240 &&
        layer.nodes[12].alpha === 0 &&
        Math.abs(layer.nodes[12].scale.x - 0.72) < 0.001,
      "a release-only pooled node should begin invisibly at the declared stack-tail pose"
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
      phase: "accepted",
      pointer: { x: 320, y: 240 },
      reducedMotion: true,
      releasePlan: {
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
      layer.nodes[1].zIndex > layer.nodes[0].zIndex,
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
    assert(layer.nodes.length === 13, "shrinking a drag should retain the release high-water node pool for reuse");
    assert(layer.nodes[0].visible && layer.nodes[1].visible && !layer.nodes[2].visible, "unused pooled nodes should be hidden");

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
    const stationaryFollower = layer.nodes[3];
    const followerXBeforeIdleFrames = stationaryFollower.position.x;
    for (let index = 0; index < 10; index += 1) {
      motionRuntime.step(1 / 60);
      layer.onRender?.();
    }
    const followerXAfterIdleFrames = stationaryFollower.position.x;
    assert(
      followerXAfterIdleFrames > followerXBeforeIdleFrames + 20,
      "followers should consume the remaining pointer history after mouse movement stops"
    );
    for (let index = 0; index < 4; index += 1) {
      motionRuntime.step(1 / 60);
      layer.onRender?.();
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
      releasePlan: makePointReleasePlan("single-visual", { x: 420, y: 300 }),
      totalCount: 1,
      trail: [],
    }));
    assert(
      layer.nodes[1].position.x === 515 && layer.nodes[1].position.y === 289,
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
    const singleNode = layer.nodes[0];
    assert(
      singleNode.state.compact === false &&
        singleNode.state.singleLineLabel === false &&
        singleNode.state.textless === false &&
        singleNode.state.cellWidth === 104 &&
        singleNode.state.cellHeight === 118,
      "a single representative should retain the source label and cell layout"
    );
    assert(
      singleNode.position.y === 224,
      "visual-center targets should be converted to the labeled node origin"
    );

    motionRuntime.reset();
    layer.clear();
    const hoverEntry = makeEntry("hover-release-app", 0, {
      origin: { x: 120, y: 180 },
    });
    const hoverGroup = {
      center: { x: 260, y: 210 },
      entries: [hoverEntry],
      key: "hover-release",
      phase: "dragging",
      pointer: { x: 260, y: 210 },
      reducedMotion: false,
      totalCount: 1,
      trail: [],
    };
    layer.update(makeState(hoverGroup, {
      dragFolderHoverState: {
        key: "hover-release-target",
        phase: "hover",
        targetId: hoverEntry.item.id,
        targetType: "app",
      },
    }));
    motionRuntime.step(0.04);
    const hoverReleaseNode = layer.nodes[0];
    assert(
      hoverReleaseNode.iconSprite.alpha < 0.9,
      "app-on-app hover should visibly dim the source before release"
    );
    layer.update(makeState({
      ...hoverGroup,
      phase: "accepted",
      releasePlan: makePointReleasePlan(hoverEntry.item.id, { x: 420, y: 300 }),
    }));
    assert(
      hoverReleaseNode.iconSprite.alpha === 1 &&
        hoverReleaseNode.emojiText.alpha === 1 &&
        hoverReleaseNode.folderCreateBackdrop.visible === false,
      "accepted release must take the pooled icon out of app-folder-create hover synchronously instead of brightening during the landing motion"
    );

    const slotFolder = {
      iconSize: 64,
      item: { id: "slot-folder", type: "folder" },
      getFolderPreviewChildReleasePose: (_relativeTo, _slotIndex, options = {}) => ({
        center: { x: 420, y: 300 },
        matrix: { a: 1, b: 0, c: 0, d: 1 },
        targetChildId: options.expectedChildId,
      }),
    };
    layer.resolveFolderNode = () => slotFolder;
    const slotEntry = makeEntry("slot-release-app", 0);
    const slotGroup = {
      center: { x: 260, y: 210 },
      entries: [slotEntry],
      key: "slot-release",
      phase: "accepted",
      pointer: { x: 260, y: 210 },
      reducedMotion: true,
      releasePlan: {
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
    };
    layer.update(makeState(slotGroup));
    const slotNode = layer.nodes[0];
    const slotLane = [...layer.releaseController.lanes.values()][0];
    assert(
      slotNode.iconSize === 16 &&
        slotNode.state?.folderPreviewRelease === true &&
        slotNode.emojiText.style.lineHeight === 0,
      "folder slot release ghosts must render directly at the thumbnail child size"
    );
    assert(
      slotLane?.controller?.active?.release?.size?.width === 16 &&
        Math.abs(slotLane?.controller?.active?.release?.sourceSize - (64 * 1.08)) < 0.001,
      "folder slot release must keep target and source metrics in the same handoff contract"
    );

    layer.clear();
    motionRuntime.reset();
    const releaseOnlySlotEntry = makeEntry("release-only-slot-app", 12, {
      releaseRole: "member",
      releaseStart: {
        alpha: 0,
        kind: "stack-tail",
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
      phase: "accepted",
      pointer: { x: 300, y: 220 },
      reducedMotion: false,
      releasePlan: {
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
    const releaseOnlySlotNode = layer.nodes[0];
    assert(releaseOnlySlotNode.alpha === 0, "a folder-bound release-only node should retain its invisible first frame");
    for (let index = 0; index < 180 && releaseSettled === settledBeforeReleaseOnlySlot; index += 1) {
      motionRuntime.step(1 / 60);
      layer.onRender?.();
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
        kind: "stack-tail",
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
      phase: "accepted",
      pointer: { x: 300, y: 220 },
      reducedMotion: false,
      releasePlan: {
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
    const releaseOnlyCenterNode = layer.nodes[0];
    for (let index = 0; index < 5; index += 1) {
      motionRuntime.step(1 / 60);
      layer.onRender?.();
    }
    assert(
      releaseOnlyCenterNode.alpha === 0,
      "a center-absorb member should remain invisible until its release delay starts"
    );
    for (let index = 0; index < 8; index += 1) {
      motionRuntime.step(1 / 60);
      layer.onRender?.();
    }
    assert(
      releaseOnlyCenterNode.alpha > 0.1,
      "a center-absorb member should become visible while travelling from the stack tail"
    );
    for (let index = 0; index < 120 && releaseSettled === settledBeforeCenterAbsorb; index += 1) {
      motionRuntime.step(1 / 60);
      layer.onRender?.();
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
    const continuityGroup = {
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
    };
    layer.update(makeState(continuityGroup));
    const continuityDraggedNode = layer.nodes[0];
    const draggedCenterBeforeRelease = layer.toLocal(
      { x: 0, y: 0 },
      continuityDraggedNode.visualWrap
    );
    layer.update(makeState({
      ...continuityGroup,
      entries: [continuityDraggedApp, continuityTargetApp],
      phase: "accepted",
      releasePlan: {
        entries: [continuityTargetApp, continuityDraggedApp].map((entry, slotIndex) => ({
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
      },
    }));
    const continuityTargetNode = layer.nodes[1];
    const draggedCenterAfterRelease = layer.toLocal(
      { x: 0, y: 0 },
      continuityDraggedNode.visualWrap
    );
    const targetCenterAfterRelease = layer.toLocal(
      { x: 0, y: 0 },
      continuityTargetNode.visualWrap
    );
    const continuityFrame = layer.releaseController.createdFolderFrame;
    assert(
      Math.abs(draggedCenterAfterRelease.x - draggedCenterBeforeRelease.x) < 0.001 &&
        Math.abs(draggedCenterAfterRelease.y - draggedCenterBeforeRelease.y) < 0.001 &&
        Math.abs(targetCenterAfterRelease.x - continuityTargetApp.origin.x) < 0.001 &&
        Math.abs(targetCenterAfterRelease.y - continuityTargetApp.origin.y) < 0.001 &&
        Math.abs(continuityFrame.position.x - continuityTargetApp.origin.x) < 0.001 &&
        Math.abs(continuityFrame.position.y - continuityTargetApp.origin.y) < 0.001,
      "created-folder release must preserve both app visual centers and start its frame at target B without a labeled-to-textless jump"
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
      phase: "accepted",
      pointer: { x: 260, y: 210 },
      reducedMotion: false,
      releasePlan: {
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
      },
      totalCount: 1,
      trail: [],
    }));
    const createdLanesById = new Map(
      [...layer.releaseController.lanes.values()].map((lane) => [lane.context.entry.id, lane])
    );
    const frame = layer.releaseController.createdFolderFrame;
    const draggedFollower = createdLanesById.get(draggedApp.item.id)?.controller?.targetFollower;
    const targetFollower = createdLanesById.get(targetApp.item.id)?.controller?.targetFollower;
    layer.sortChildren();
    assert(
      layer.getChildIndex(frame) < layer.getChildIndex(targetFollower) &&
        layer.getChildIndex(targetFollower) < layer.getChildIndex(draggedFollower),
      "created-folder release must render the frame below target B and keep dragged icon A above B after reparenting"
    );

    layer.resolveFolderNode = () => null;
    layer.clear();

    // Restore the unchanged-state probe after the isolated handoff scenario;
    // it intentionally reuses the same pooled node.
    layer.update(singleState);

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
    layer.update({
      ...singleState,
      groupState: {
        ...singleState.groupState,
        center: { x: 260, y: 210 },
        phase: "accepted",
        releasePlan: makePointReleasePlan("single-visual", { x: 420, y: 300 }),
      },
    });
    for (let index = 0; index < 180 && releaseSettled === pointReleaseSettledBefore; index += 1) {
      motionRuntime.step(1 / 60);
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
    assert(
      !layer.visible && layer.activeEntryIds.size === 0 && layer.nodes.every((node) => !node.visible),
      "clearing should release every pooled visual owner"
    );
  } finally {
    layer.destroy({ children: true });
    motionRuntime.reset();
  }
}
