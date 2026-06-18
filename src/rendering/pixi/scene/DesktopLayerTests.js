function makePageTrack(children) {
  const pageTrack = {
    children,
    setChildIndex(child, index) {
      const currentIndex = this.children.indexOf(child);
      if (currentIndex < 0) return;
      this.children.splice(currentIndex, 1);
      this.children.splice(index, 0, child);
    },
  };
  for (const child of children) child.parent = pageTrack;
  return pageTrack;
}

function makeNode(id) {
  return {
    alpha: 0,
    cursor: "pointer",
    destroyed: false,
    eventMode: "static",
    id,
    labelText: { alpha: 0.5, visible: true },
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
      x: 0.7,
      y: 0.7,
    },
    visible: false,
  };
}

function makeLayer(DesktopLayer, pageTrack) {
  const layer = Object.create(DesktopLayer.prototype);
  layer.folderHandoffNode = null;
  layer.hasDesktopVisualAlpha = false;
  layer.pageTrack = pageTrack;
  layer.visualRoot = { alpha: 1, interactiveChildren: true, visible: false };
  return layer;
}

export async function runDesktopLayerTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  const { DesktopLayer, resolveDesktopVisualAlpha } = await import("./DesktopLayer.js");
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[DesktopLayer test failed] ${message}`);
  };

  {
    assert(resolveDesktopVisualAlpha({ desktopVisualAlpha: -1 }) === 0, "desktop alpha should clamp low values");
    assert(resolveDesktopVisualAlpha({ desktopVisualAlpha: 2 }) === 1, "desktop alpha should clamp high values");
    assert(resolveDesktopVisualAlpha({}) === 1, "desktop alpha should default to visible");

    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.applyDesktopVisualAlpha({ desktopVisualAlpha: 0 });

    assert(layer.visualRoot.visible === true, "hidden desktop should stay renderable so alpha can animate");
    assert(layer.visualRoot.alpha === 0, "hidden desktop should apply the requested alpha");
    assert(layer.visualRoot.interactiveChildren === false, "hidden desktop should not receive icon interaction");
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    const after = makeNode("after");
    const pageTrack = makePageTrack([before, folder, after]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });

    assert(pageTrack.children.length === 3, "handoff should reuse the real folder node");
    assert(pageTrack.children[2] === folder, "handoff should raise the real folder node");
    assert(layer.folderHandoffNode.node === folder, "handoff state should reference the real node");
    assert(folder.position.x === 12 && folder.position.y === 34, "handoff should snap node to the target");
    assert(folder.scale.x === 1 && folder.scale.y === 1, "handoff should reset node scale");
    assert(folder.visible === true && folder.alpha === 1, "handoff should make the real node visible");
    assert(folder.eventMode === "none" && folder.cursor === "default", "handoff should disable interaction");
    assert(folder.labelText.visible === false && folder.labelText.alpha === 1, "handoff should hide the label without fade state");

    layer.clearFolderHandoffNode();

    assert(layer.folderHandoffNode === null, "clear should remove handoff state");
    assert(pageTrack.children[1] === folder, "clear should restore original z order");
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    const pageTrack = makePageTrack([before, folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-1", folder, {
      scaleX: 1.087,
      scaleY: 1.086,
      x: 18,
      y: 42,
    });

    assert(folder.position.x === 18 && folder.position.y === 42, "handoff should apply the pinned position");
    assert(folder.scale.x === 1.087 && folder.scale.y === 1.086, "handoff should apply inverse shell scale");
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    const pageTrack = makePageTrack([before, folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const hadRequestAnimationFrame = "requestAnimationFrame" in globalThis;
    const hadCancelAnimationFrame = "cancelAnimationFrame" in globalThis;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    let queuedFrame = null;
    globalThis.requestAnimationFrame = (callback) => {
      queuedFrame = callback;
      return 9;
    };
    globalThis.cancelAnimationFrame = () => {};

    try {
      layer.ensureFolderHandoffNode("folder-1", folder, { x: 20, y: 30 });
      layer.finishFolderHandoffNodeAfterFrame();

      assert(layer.folderHandoffNode.cleanupFrame === 9, "finish should wait one frame before cleanup");
      assert(pageTrack.children[1] === folder, "handoff should stay raised until the cleanup frame");

      queuedFrame();

      assert(layer.folderHandoffNode === null, "cleanup frame should clear handoff state");
      assert(pageTrack.children[1] === folder, "cleanup frame should preserve the restored z order");
    } finally {
      if (hadRequestAnimationFrame) globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      else delete globalThis.requestAnimationFrame;
      if (hadCancelAnimationFrame) globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      else delete globalThis.cancelAnimationFrame;
    }
  }
}
