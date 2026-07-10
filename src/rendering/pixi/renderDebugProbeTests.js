import {
  capturePixiRenderSnapshot,
  createPixiRenderProbe,
} from "./renderDebugProbe.dev.js";
import { beginPixiBatchBindingCapture } from "./pixiBatchBindingProbe.dev.js";

function makeBounds(left, top, width, height) {
  return {
    maxX: left + width,
    maxY: top + height,
    minX: left,
    minY: top,
  };
}

function makeFolderHarness(options = {}) {
  const expectedSource = {
    destroyed: false,
    height: 32,
    pixelHeight: 32,
    pixelWidth: 32,
    resource: {
      complete: true,
      naturalHeight: 32,
      naturalWidth: 32,
    },
    uid: 41,
    width: 32,
  };
  const boundSource = options.boundSource || expectedSource;
  const texture = {
    destroyed: options.textureDestroyed === true,
    source: expectedSource,
    uid: 31,
  };
  const batch = {
    action: "startBatch",
    size: 6,
    start: 0,
    textures: {
      count: 1,
      textures: [boundSource],
    },
  };
  const childSprite = {
    _gpuData: {
      7: {
        _batch: batch,
        _batcher: { maxTextures: 16 },
        _textureId: 0,
      },
    },
    alpha: 1,
    destroyed: false,
    getBounds: () => makeBounds(12, 12, 16, 16),
    renderable: true,
    texture,
    visible: true,
    worldAlpha: 1,
  };
  const childEmoji = {
    alpha: 1,
    destroyed: false,
    renderable: true,
    text: "M",
    visible: false,
    worldAlpha: 1,
  };
  const childNode = {
    alpha: 1,
    destroyed: false,
    getBounds: () => makeBounds(12, 12, 16, 16),
    renderable: true,
    visible: options.childVisible !== false,
    worldAlpha: 1,
    children: [childSprite, childEmoji],
  };
  const mask = {
    alpha: 1,
    destroyed: false,
    getBounds: () => makeBounds(0, 0, 64, 64),
    includeInBuild: false,
    measurable: false,
    renderable: true,
    visible: true,
    worldAlpha: 1,
  };
  const child = {
    emoji: "M",
    iconDataUrl: "data:image/png;base64,secret-icon-payload",
    id: "mi-service",
    name: "MiService",
    type: "app",
  };
  const folder = {
    childPages: [[child]],
    id: "folder-tools",
    name: "工具",
    type: "folder",
  };
  const folderNode = {
    alpha: 1,
    destroyed: false,
    folderChildrenWrap: {
      effects: [{ pipe: "stencilMask" }],
      mask,
      renderable: true,
      visible: true,
    },
    folderChildNodes: [childNode],
    folderPreviewMask: mask,
    getFolderPreviewChildBounds: () => makeBounds(112, 112, 16, 16),
    getLocalVisualBounds: () => makeBounds(100, 100, 64, 64),
    iconSize: 64,
    item: folder,
    renderable: true,
    state: {
      folderPreviewPageSize: 9,
      suppressedFolderPreviewChildId: options.suppressed ? child.id : null,
    },
    visible: true,
    visualWrap: {},
    worldAlpha: 1,
  };
  const instructions = options.unbalancedStencil
    ? [{ action: "pushMaskBegin", renderPipeId: "stencilMask" }]
    : [
        { action: "pushMaskBegin", renderPipeId: "stencilMask" },
        { action: "pushMaskEnd", renderPipeId: "stencilMask" },
        { action: "popMaskBegin", renderPipeId: "stencilMask" },
        { action: "popMaskEnd", renderPipeId: "stencilMask" },
      ];
  const renderer = {
    height: 600,
    name: "webgl",
    resolution: 1.5,
    tick: 12,
    uid: 7,
    width: 800,
  };
  const app = {
    canvas: {
      clientHeight: 400,
      clientWidth: 533,
      height: 600,
      width: 800,
    },
    renderer,
    stage: {
      renderGroup: {
        instructionSet: {
          instructions,
          instructionSize: instructions.length,
        },
      },
    },
  };
  const layer = {
    iconNodes: new Map([["page:0:folder-tools", folderNode]]),
    lastDesktopRenderPlan: {
      entries: [{ key: "page:0:folder-tools", nodeState: { dragging: false }, item: folder }],
      signature: "plan-signature",
    },
    stageRect: { height: 400, left: 0, top: 0, width: 533 },
  };
  return { app, batch, boundSource, child, childNode, expectedSource, folder, folderNode, layer };
}

export function runRenderDebugProbeTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi render debug probe test failed] ${message}`);
  };

  {
    const harness = makeFolderHarness();
    const byBatch = new WeakMap([[harness.batch, {
      slots: [{ glHandleMatchesPlanned: true, location: 0, pixiBoundSourceUid: 41 }],
    }]]);
    const snapshot = capturePixiRenderSnapshot({
      app: harness.app,
      batchBindings: {
        available: true,
        batchCount: 1,
        byBatch,
        errors: [],
        reason: null,
        rendererName: "webgl",
      },
      layer: harness.layer,
      phase: "drag-start",
      reasons: ["watch-effect", "icon-pointerdown"],
    });
    const child = snapshot.folders[0]?.children[0];
    assert(child?.itemId === "mi-service", "folder snapshots should identify every preview slot item");
    assert(child?.texture?.sourceUid === 41, "folder snapshots should expose the expected texture source uid");
    assert(child?.batch?.plannedSourceUid === 41, "folder snapshots should expose the batch-planned source uid");
    assert(child?.batch?.plannedSourceMatches === true, "matching sprite and batch texture sources should satisfy the invariant");
    assert(child?.batch?.actualBoundSourceUid === 41, "folder snapshots should expose the source bound during the draw");
    assert(child?.batch?.glHandleMatchesPlanned === true, "folder snapshots should verify the actual WebGL texture handle");
    assert(child?.intersectsMask === true, "folder snapshots should compare child bounds with the computed mask clip bounds");
    assert(snapshot.folders[0]?.mask?.clipBounds?.width === 64, "non-measurable Pixi masks should retain computed clip bounds");
    assert(child?.source?.fingerprint && !JSON.stringify(snapshot).includes("secret-icon-payload"), "icon sources should be fingerprinted without leaking data URLs");
    assert(child?.pixel === null, "framebuffer reads should remain disabled unless explicitly armed");
    assert(snapshot.stencil?.balanced === true, "balanced stencil instructions should be reported as healthy");
    assert(snapshot.batchBindingCapture?.available === true, "phase snapshots should report batch binding capture availability");
    assert(snapshot.violations.length === 0, "healthy folder preview state should not emit invariant violations");
  }

  {
    const harness = makeFolderHarness();
    harness.app.canvas.getBoundingClientRect = () => ({ height: 600, left: 0, top: 0, width: 800 });
    harness.app.renderer.gl = {
      readPixels(_x, _y, _width, _height, _format, _type, pixels) {
        pixels.fill(255);
      },
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
    };
    const snapshot = capturePixiRenderSnapshot({
      app: harness.app,
      capturePixels: true,
      filter: { folderId: harness.folder.id },
      layer: harness.layer,
    });
    assert(snapshot.folders[0]?.children[0]?.focused === true, "folder filters should focus visible child slots for pixel capture");
    assert(snapshot.folders[0]?.children[0]?.pixel?.alphaNonZero > 0, "folder filters should capture pixels inside the mask");
  }

  {
    const harness = makeFolderHarness();
    const actualSource = { ...harness.expectedSource, uid: 99 };
    const byBatch = new WeakMap([[harness.batch, {
      slots: [{ glHandleMatchesPlanned: false, location: 0, pixiBoundSourceUid: actualSource.uid }],
    }]]);
    const snapshot = capturePixiRenderSnapshot({
      app: harness.app,
      batchBindings: {
        available: true,
        batchCount: 1,
        byBatch,
        errors: [],
        reason: null,
        rendererName: "webgl",
      },
      layer: harness.layer,
      phase: "drag-start",
    });
    const codes = snapshot.violations.map((entry) => entry.code);
    assert(codes.includes("batch-draw-source-mismatch"), "a wrong source bound during draw should be detected");
    assert(codes.includes("gl-texture-binding-mismatch"), "a wrong WebGL texture handle should be detected");
  }

  {
    const harness = makeFolderHarness({ boundSource: { uid: 99 }, unbalancedStencil: true });
    const snapshot = capturePixiRenderSnapshot({ app: harness.app, layer: harness.layer, phase: "drag-start" });
    const codes = snapshot.violations.map((entry) => entry.code);
    assert(codes.includes("batch-source-mismatch"), "a stale batch texture slot should be detected");
    assert(codes.includes("stencil-unbalanced"), "an unbalanced stencil instruction stream should be detected");
  }

  {
    const harness = makeFolderHarness({ childVisible: false });
    const snapshot = capturePixiRenderSnapshot({ app: harness.app, layer: harness.layer, phase: "drag-start" });
    assert(
      snapshot.violations.some((entry) => entry.code === "preview-child-hidden"),
      "a present unsuppressed preview child should never be hidden"
    );
  }

  {
    const harness = makeFolderHarness();
    harness.app.stage.renderGroup.instructionSet = null;
    const snapshot = capturePixiRenderSnapshot({ app: harness.app, layer: harness.layer });
    assert(
      snapshot.violations.some((entry) => entry.code === "stencil-instructions-unavailable"),
      "missing stencil evidence should be explicit instead of reporting a healthy balance"
    );
  }

  {
    const harness = makeFolderHarness();
    harness.app.stage.renderGroup.instructionSet = { instructionSize: 0, instructions: [] };
    const snapshot = capturePixiRenderSnapshot({ app: harness.app, layer: harness.layer });
    assert(
      snapshot.violations.some((entry) => entry.code === "stencil-mask-count-mismatch"),
      "an empty stencil stream should not report success while a visible folder mask is expected"
    );
  }

  {
    const glHandle = {};
    const source = {
      _gpuData: { 7: { target: 0x0de1, texture: glHandle } },
      uid: 41,
    };
    let activeTexture = 0x84c0;
    const boundHandles = new Map();
    const gl = {
      ACTIVE_TEXTURE: 0x84e0,
      TEXTURE0: 0x84c0,
      TEXTURE_2D: 0x0de1,
      TEXTURE_2D_ARRAY: 0x8c1a,
      TEXTURE_CUBE_MAP: 0x8513,
      TEXTURE_BINDING_2D: 0x8069,
      TEXTURE_BINDING_2D_ARRAY: 0x8c1d,
      TEXTURE_BINDING_CUBE_MAP: 0x8514,
      activeTexture(value) {
        activeTexture = value;
      },
      getParameter(parameter) {
        if (parameter === this.ACTIVE_TEXTURE) return activeTexture;
        if (parameter === this.TEXTURE_BINDING_2D) return boundHandles.get(activeTexture) || null;
        return null;
      },
    };
    const renderer = {
      gl,
      name: "webgl",
      renderPipes: { batch: { _adaptor: null } },
      texture: { _boundTextures: [] },
      uid: 7,
    };
    const originalExecute = () => {
      renderer.texture._boundTextures[0] = source;
      boundHandles.set(gl.TEXTURE0, glHandle);
    };
    renderer.renderPipes.batch._adaptor = { execute: originalExecute };
    const batch = { textures: { count: 1, textures: [source] } };
    const bindingCapture = beginPixiBatchBindingCapture(renderer);
    renderer.renderPipes.batch._adaptor.execute({}, batch);
    const evidence = bindingCapture.finish();
    const slot = evidence.byBatch.get(batch)?.slots?.[0];
    assert(slot?.pixiBoundSourceUid === 41, "batch capture should retain the Pixi source bound at draw time");
    assert(slot?.glHandleMatchesPlanned === true, "batch capture should compare the actual WebGL handle with the planned source");
    assert(renderer.renderPipes.batch._adaptor.execute === originalExecute, "batch capture should restore the Pixi adaptor after rendering");
  }

  {
    let threw = false;
    try {
      createPixiRenderProbe();
    } catch (error) {
      threw = /capture function/.test(String(error?.message || error));
    }
    assert(threw, "render probes should fail explicitly when no capture function is provided");
  }

  {
    let time = 0;
    const probe = createPixiRenderProbe({
      capture: ({ phase }) => ({
        folders: [],
        phase,
        violations: phase === "pointerdown" ? [{ code: "pointerdown-anomaly" }] : [],
      }),
      now: () => ++time,
    });
    probe.notePointerDown({
      event: { button: 0, pointerId: 8, pointerType: "touch" },
      item: { id: "app-pointer", name: "Pointer App", type: "app" },
      source: { index: 0, pageIndex: 0, type: "page" },
    });
    probe.beforeRender({
      dragMeta: { item: { id: "app-pointer", name: "Pointer App", type: "app" }, source: { type: "page" } },
      renderer: { name: "canvas" },
    });
    assert(
      probe.commands.snapshot().activeSession?.frozenReason === "invariant:pointerdown-anomaly",
      "the first pointerdown invariant should freeze when the drag session starts"
    );
    probe.destroy();
  }

  {
    let time = 0;
    const captures = [];
    const probe = createPixiRenderProbe({
      capture: ({ phase }) => {
        captures.push(phase);
        return { folders: [], phase, violations: phase === "drag-start" ? [{ code: "test-anomaly" }] : [] };
      },
      maxEvents: 4,
      maxSessions: 2,
      now: () => ++time,
    });

    probe.notePointerDown({
      event: { button: 0, clientX: 10, clientY: 20, pointerId: 5, pointerType: "mouse" },
      item: { id: "app-a", name: "App A", type: "app" },
      source: { index: 0, pageIndex: 0, type: "page" },
    });
    const startTransition = probe.beforeRender({
      dragMeta: { item: { id: "app-a", name: "App A", type: "app" }, source: { type: "page" } },
      reasons: ["watch-effect", "motion-frame"],
      updateLayer: true,
    });
    probe.recordDesktopPlan(
      { entries: [{ key: "app-a", nodeState: { dragging: false } }], signature: "before" },
      { entries: [{ key: "app-a", nodeState: { dragging: true } }], signature: "after" }
    );
    probe.afterRender(startTransition);

    const active = probe.commands.snapshot().activeSession;
    assert(active?.dragItem?.id === "app-a", "drag-start should open a trace session for the active item");
    assert(active?.frozenReason === "invariant:test-anomaly", "the first invariant violation should freeze the evidence window");
    assert(active?.captures[0]?.phase === "pointerdown", "the pre-drag pointer snapshot should be retained in the session");
    assert(active?.captures.some((entry) => entry.phase === "drag-start"), "the first rendered drag frame should be captured");

    const endTransition = probe.beforeRender({ dragMeta: null, reasons: ["watch-effect"], updateLayer: true });
    probe.afterRender(endTransition);
    const report = probe.commands.snapshot();
    assert(report.activeSession === null, "drag-end should close the active trace session");
    assert(report.sessions.length === 1, "completed drag sessions should remain available after the visual recovers");
    assert(report.sessions[0].captures.some((entry) => entry.phase === "drag-end"), "the recovery frame should be retained");
    assert(captures.join(",") === "pointerdown,drag-start,drag-end", "only diagnostic phase boundaries should take full snapshots");
    assert(JSON.parse(probe.commands.exportJson()).version === 1, "debug reports should export as versioned JSON");
    probe.destroy();
  }

  {
    let time = 0;
    const probe = createPixiRenderProbe({
      capture: ({ phase }) => ({ folders: [], phase, violations: [] }),
      maxEvents: 20,
      maxSessions: 2,
      now: () => ++time,
    });
    for (let index = 0; index < 25; index += 1) probe.record("bounded-event", { index });
    const events = probe.commands.snapshot().recentEvents;
    assert(events.length === 20, "the recent event ring should enforce its configured bound");
    assert(events[0]?.detail?.index === 5, "the recent event ring should retain the newest events");

    for (let index = 0; index < 3; index += 1) {
      const item = { id: `session-${index}`, name: `Session ${index}`, type: "app" };
      probe.notePointerDown({ event: { pointerId: index }, item, source: { type: "page" } });
      const start = probe.beforeRender({ dragMeta: { item, source: { type: "page" } }, renderer: { name: "canvas" } });
      probe.afterRender(start);
      const end = probe.beforeRender({ dragMeta: null, renderer: { name: "canvas" } });
      probe.afterRender(end);
    }
    const sessions = probe.commands.snapshot().sessions;
    assert(sessions.length === 2, "the completed drag session ring should enforce its configured bound");
    assert(sessions[0]?.dragItem?.id === "session-1", "the completed session ring should retain the newest sessions");
    probe.destroy();
  }
}
