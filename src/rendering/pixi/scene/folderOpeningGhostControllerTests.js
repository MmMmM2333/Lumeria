import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import { motionRuntime } from "../animation/motionRuntime.js";

function makeTimerHost() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    runAll() {
      const pending = Array.from(timers.entries());
      for (const [id, callback] of pending) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        callback();
      }
    },
    setTimeout(callback) {
      const id = nextId;
      nextId += 1;
      timers.set(id, callback);
      return id;
    },
    get size() {
      return timers.size;
    },
  };
}

function makeGhost() {
  return {
    alpha: 0,
    children: [],
    destroyed: false,
    eventMode: "static",
    item: null,
    position: {
      set(x, y) {
        this.x = x;
        this.y = y;
      },
      x: 0,
      y: 0,
    },
    scale: {
      set(x, y = x) {
        this.x = x;
        this.y = y;
      },
      x: 1,
      y: 1,
    },
    setState(state) {
      this.item = state.item;
      this.state = state;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function makeLayer() {
  const calls = [];
  const ghosts = [];
  const iconNode = { alpha: 1, item: { id: "app-1" }, visible: true };
  return {
    calls,
    frameGhost: { alpha: 1, visible: true },
    iconNodes: new Map([["app-1", iconNode]]),
    openingGhostKeys: null,
    openingGhostLayer: {
      children: ghosts,
      addChild(ghost) {
        ghosts.push(ghost);
      },
      removeChildren() {
        return ghosts.splice(0);
      },
    },
    pageTrack: { visible: true },
    panelMaterial: { alpha: 0, visible: false },
    clearFrameGhost() {
      calls.push("clear-frame");
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
    },
    revealIconNodes() {
      calls.push("reveal-icons");
      for (const node of this.iconNodes.values()) {
        node.visible = true;
        node.alpha = 1;
      }
    },
    get ghosts() {
      return ghosts;
    },
    get iconNode() {
      return iconNode;
    },
  };
}

function makeState(completed) {
  return {
    folderOpenIconGhosts: [],
    folderPageIndex: 0,
    folderPageSize: 9,
    height: 800,
    isTextlessMode: false,
    launchTargetStatusById: {},
    showMissingLaunchTargetBadge: false,
    stageRect: { left: 0, top: 0 },
    width: 1200,
    completeFolderOpenIconGhost: (key) => completed.push(key),
    getFolderOpenIconGhostKey: () => "controller-open-key",
  };
}

function makeTarget(id = "app-1") {
  return {
    cellHeight: 80,
    cellWidth: 80,
    columnCount: 3,
    iconSize: 64,
    index: 0,
    item: { id, type: "app" },
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: { height: 64, left: 100, top: 120, width: 64 },
  };
}

export function runFolderOpeningGhostControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder opening ghost controller test failed] ${message}`);
  };

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const target = makeTarget();
    controller.start(makeState(completed), [target]);

    assert(layer.openingGhostKeys.has("app-1"), "start should track active opening ghost keys");
    assert(layer.ghosts.length === 1, "start should create one opening ghost");
    assert(layer.iconNode.visible === false, "start should hide the real icon node");
    assert(layer.pageTrack.visible === false, "start should hide the page track");
    assert(layer.panelMaterial.visible && layer.panelMaterial.alpha === 1, "start should keep the real panel material visible");
    assert(layer.frameGhost.visible === false && layer.frameGhost.alpha === 0, "start should hide the frame ghost");
    assert(timerHost.size === 1, "start should schedule a fallback clear timer");

    controller.complete(makeState(completed), target, layer.ghosts[0]);
    assert(completed.join(",") === "controller-open-key", "complete should notify the controller ghost key");
    assert(layer.openingGhostKeys.size === 0, "complete should clear the finished key");
    assert(layer.iconNode.visible === true, "complete should reveal icon nodes after all ghosts finish");
    assert(layer.ghosts.length === 0, "complete should remove opening ghost visuals");
    assert(timerHost.size === 0, "complete should clear the fallback timer");
  }

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    controller.start(makeState(completed), [makeTarget()]);
    timerHost.runAll();

    assert(layer.openingGhostKeys.size === 0, "fallback should clear active keys");
    assert(completed.join(",") === "controller-open-key", "fallback should complete pending controller keys");
    assert(layer.iconNode.visible === true, "fallback should reveal hidden icon nodes");
    assert(layer.ghosts.length === 0, "fallback should destroy opening ghost visuals");
    assert(layer.pageTrack.visible === true, "fallback should restore the page track");
  }

  {
    const completed = [];
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    controller.start({
      ...makeState(completed),
      folderOpenIconGhosts: [{ key: "open-a" }, { key: "open-b" }],
    }, [{ ...makeTarget(), sourceRect: null }]);

    assert(completed.join(",") === "open-a,open-b", "missing opening targets should complete published ghost keys");
    assert(layer.ghosts.length === 0, "missing opening targets should not create ghost visuals");
    assert(layer.pageTrack.visible === true, "missing opening targets should keep the page track visible");
  }

  {
    const completed = [];
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    const target = { ...makeTarget(), controllerGhostKey: "open-a" };
    const missingTarget = { ...makeTarget("app-2"), controllerGhostKey: "open-b" };
    delete missingTarget.targetStageLayoutRect;
    controller.start({
      ...makeState(completed),
      folderOpenIconGhosts: [{ key: "open-a" }, { key: "open-b" }],
    }, [target, missingTarget]);

    assert(completed.join(",") === "open-b", "missing opening target keys should complete immediately");
    assert(layer.ghosts.length === 1, "usable opening targets should still render ghost visuals");
    controller.complete(makeState(completed), target, layer.ghosts[0]);
    assert(completed.join(",") === "open-b,open-a", "usable opening target should complete after its animation");
  }

  {
    const completed = [];
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    controller.start(makeState(completed), [{
      ...makeTarget(),
      targetStageLayoutRect: { height: 64, left: 100, top: 120, width: 64 },
    }]);

    assert(layer.ghosts.length === 1, "stage layout opening targets should not require a client target rect");
    controller.clear();
  }

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    controller.start(makeState(completed), [makeTarget()]);
    const released = controller.releaseGhost("app-1");

    assert(released, "release should return the matching opening ghost");
    assert(!released.destroyed, "release should not destroy the ghost handed to closing");
    assert(layer.ghosts.length === 0, "release should remove the ghost from the opening layer");
    assert(!layer.openingGhostKeys?.has("app-1"), "release should clear the active opening key");
    assert(completed.join(",") === "", "release should not complete the opening controller key");
    assert(timerHost.size === 0, "release should clear the fallback timer when no opening ghosts remain");
    assert(motionRuntime.getChannel(released, "x")?.base?.size === 1, "release should keep opening ghost x spring available for closing retarget");
    assert(motionRuntime.getChannel(released, "y")?.base?.size === 1, "release should keep opening ghost y spring available for closing retarget");
    motionRuntime.reset();
  }

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const firstTarget = makeTarget("app-1");
    const secondTarget = makeTarget("app-2");
    layer.iconNodes.set("app-2", { alpha: 1, item: { id: "app-2" }, visible: true });
    controller.start(makeState(completed), [firstTarget, secondTarget]);
    const released = controller.releaseGhost("app-1");

    assert(released?.item?.id === "app-1", "release should return the requested ghost");
    assert(layer.ghosts.length === 1 && layer.ghosts[0].item.id === "app-2", "release should keep unrelated opening ghosts active");
    assert(layer.openingGhostKeys.has("app-2"), "release should preserve unrelated active opening keys");
    assert(timerHost.size === 1, "release should keep the fallback timer while another opening ghost remains");
    assert(completed.join(",") === "", "release should not complete unrelated opening keys");
    controller.clear();
  }
}
