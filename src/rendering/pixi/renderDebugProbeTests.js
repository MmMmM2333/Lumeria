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
    renderable: options.childRenderable !== false,
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
    id: options.childId || "mi-service",
    name: options.childName || "MiService",
    type: "app",
  };
  const folder = {
    childPages: [[child]],
    id: options.folderId || "folder-tools",
    name: options.folderName || "工具",
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
      suppressedFolderPreviewChildIds: options.suppressed ? [child.id] : [],
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
    iconNodes: new Map([[`page:0:${folder.id}`, folderNode]]),
    lastDesktopRenderPlan: {
      entries: [{ key: `page:0:${folder.id}`, nodeState: { dragging: false }, item: folder }],
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
    let readPixelsCallCount = 0;
    harness.app.renderer.gl = {
      NO_ERROR: 0,
      readPixels(_x, _y, _width, _height, _format, _type, pixels) {
        readPixelsCallCount += 1;
        pixels.fill(255);
      },
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      getError: () => 0,
      isContextLost: () => false,
    };
    const snapshot = capturePixiRenderSnapshot({
      app: harness.app,
      layer: harness.layer,
      pixels: "phase-diff",
      target: "all-folders",
    });
    assert(snapshot.target === "all-folders", "global snapshots should identify their target scope");
    assert(snapshot.folders[0]?.children[0]?.pixelEligible === true, "global snapshots should include every visible preview slot");
    assert(snapshot.folders[0]?.children[0]?.pixel?.alphaNonZero > 0, "global snapshots should attach framebuffer summaries to preview slots");
    assert(readPixelsCallCount === 1 && snapshot.framebuffer?.readPixelsCallCount === 1, "a global snapshot should read once per phase");
  }

  {
    const first = makeFolderHarness();
    const second = makeFolderHarness({
      childId: "safari",
      childName: "Safari",
      folderId: "folder-browsers",
      folderName: "浏览器",
    });
    first.layer.iconNodes.set("page:0:folder-browsers", second.folderNode);
    const globalSnapshot = capturePixiRenderSnapshot({
      app: first.app,
      layer: first.layer,
      target: "all-folders",
    });
    const targetedSnapshot = capturePixiRenderSnapshot({
      app: first.app,
      layer: first.layer,
      target: { itemName: "Safari" },
    });
    const itemIdSnapshot = capturePixiRenderSnapshot({
      app: first.app,
      layer: first.layer,
      target: { itemId: "safari" },
    });
    const folderIdSnapshot = capturePixiRenderSnapshot({
      app: first.app,
      layer: first.layer,
      target: { folderId: "folder-browsers" },
    });
    assert(globalSnapshot.folders.length === 2, "the all-folders target should retain every folder in the rendered layer");
    assert(targetedSnapshot.folders.length === 1 && targetedSnapshot.folders[0]?.folderId === "folder-browsers", "item targets should retain only matching folders");
    assert(targetedSnapshot.folders[0]?.children[0]?.targeted === true, "item targets should mark the matching preview slot for sampling");
    assert(itemIdSnapshot.folders[0]?.folderId === "folder-browsers", "itemId targets should retain the containing folder");
    assert(folderIdSnapshot.folders[0]?.children[0]?.targeted === true, "folderId targets should include every preview slot in that folder");
  }

  {
    const harness = makeFolderHarness();
    const before = capturePixiRenderSnapshot({ app: harness.app, layer: harness.layer, target: "all-folders" });
    harness.childNode.children[0].texture.uid = 32;
    const after = capturePixiRenderSnapshot({ app: harness.app, layer: harness.layer, target: "all-folders" });
    assert(
      before.folders[0]?.children[0]?.sceneSignature !== after.folders[0]?.children[0]?.sceneSignature,
      "a Texture change with the same TextureSource should make phase pixels incomparable"
    );
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
    const harness = makeFolderHarness({ childRenderable: false, suppressed: true });
    const snapshot = capturePixiRenderSnapshot({ app: harness.app, layer: harness.layer, phase: "folder-preview-slot-release" });
    assert(
      !snapshot.violations.some((entry) => entry.code.startsWith("suppressed-child-")),
      "a suppressed preview child should stay transform-visible and non-renderable without a visual ownership violation"
    );
  }

  {
    const harness = makeFolderHarness({ suppressed: true });
    const snapshot = capturePixiRenderSnapshot({ app: harness.app, layer: harness.layer, phase: "folder-preview-slot-release" });
    assert(
      snapshot.violations.some((entry) => entry.code === "suppressed-child-renderable"),
      "a suppressed real preview child must not draw underneath the release ghost"
    );
  }

  {
    const harness = makeFolderHarness({ childRenderable: false, childVisible: false, suppressed: true });
    const snapshot = capturePixiRenderSnapshot({ app: harness.app, layer: harness.layer, phase: "folder-preview-slot-release" });
    assert(
      snapshot.violations.some((entry) => entry.code === "suppressed-child-transform-hidden"),
      "a suppressed preview child must remain transform-visible so the moving release target stays current"
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
    const probe = createPixiRenderProbe({
      capture: ({ phase }) => ({ folders: [], phase, violations: [] }),
    });
    const config = probe.commands.arm({
      clear: true,
      pixels: "phase-diff",
      target: "all-folders",
    });
    assert(config.target === "all-folders", "global diagnostics should expose an explicit all-folders target");
    assert(config.pixels === "phase-diff", "global diagnostics should expose the requested pixel comparison mode");
    assert(!("capturePixels" in config) && !("filter" in config), "the replaced pixel and filter config paths should be removed");
    probe.destroy();
  }

  {
    const probe = createPixiRenderProbe({
      capture: ({ phase }) => ({ folders: [], phase, violations: [] }),
    });
    let legacyConfigRejected = false;
    try {
      probe.commands.arm({ capturePixels: true, itemName: "MiService" });
    } catch (error) {
      legacyConfigRejected = /removed.*target.*pixels/i.test(String(error?.message || error));
    }
    assert(legacyConfigRejected, "replaced filter and capturePixels options should fail explicitly instead of arming a different scope");
    let ambiguousTargetRejected = false;
    try {
      probe.commands.arm({ target: { itemId: "mi-service", itemName: "MiService" } });
    } catch (error) {
      ambiguousTargetRejected = /exactly one/.test(String(error?.message || error));
    }
    assert(ambiguousTargetRejected, "ambiguous target objects should fail explicitly");
    probe.destroy();
  }

  {
    const captureOptions = [];
    const item = { id: "app-global", name: "Global App", type: "app" };
    const probe = createPixiRenderProbe({
      capture: (options) => {
        captureOptions.push(options);
        return { folders: [], phase: options.phase, violations: [] };
      },
    });
    probe.commands.arm({ clear: true, pixels: "phase-diff", target: "all-folders" });
    probe.notePointerDown({ event: { pointerId: 1 }, item, source: { type: "page" } });
    const start = probe.beforeRender({ dragMeta: { item, source: { type: "page" } }, renderer: { name: "canvas" } });
    probe.afterRender(start);
    assert(captureOptions[0]?.pixels === "off", "pointerdown should retain metadata without reading a stale framebuffer");
    assert(captureOptions[1]?.pixels === "phase-diff", "drag-start should receive the armed phase pixel mode");
    assert(captureOptions[1]?.target === "all-folders", "phase captures should receive the armed global target");
    probe.destroy();
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
    assert(JSON.parse(probe.commands.exportJson()).version === 2, "debug reports should export the migrated schema version");
    probe.destroy();
  }

  {
    const item = { id: "app-dragged", name: "Dragged App", type: "app" };
    const makePixel = (phase) => ({
      hash: phase === "drag-start" ? "missing" : "restored",
      sample: Array.from({ length: 64 }, (_value, index) => [
        phase === "drag-start" || index % 2 === 0 ? 20 : 220,
        255,
      ]).flat(),
      sampleHeight: 8,
      sampleWidth: 8,
    });
    const probe = createPixiRenderProbe({
      capture: ({ phase }) => ({
        framebuffer: phase === "pointerdown" ? null : { available: true },
        folders: phase === "pointerdown" ? [] : [{
          children: [{
            itemId: "mi-service",
            itemName: "MiService",
            pixel: makePixel(phase),
            sceneSignature: "stable-scene",
            slot: 5,
          }],
          folderId: "folder-tools",
          folderName: "工具",
        }],
        phase,
        violations: [],
      }),
    });
    probe.commands.arm({ clear: true, pixels: "phase-diff", target: "all-folders" });
    probe.notePointerDown({ event: { pointerId: 7 }, item, source: { type: "page" } });
    const start = probe.beforeRender({ dragMeta: { item, source: { type: "page" } }, renderer: { name: "canvas" } });
    probe.afterRender(start);
    const end = probe.beforeRender({ dragMeta: null, renderer: { name: "canvas" } });
    probe.afterRender(end);

    const comparison = probe.commands.snapshot().sessions[0]?.pixelComparison;
    assert(comparison?.available === true, "completed phase-diff sessions should compare disappearance and recovery frames");
    assert(comparison?.candidates[0]?.itemId === "mi-service", "session reports should identify the globally affected preview item");
    const summary = probe.commands.summary();
    const summaryJson = JSON.stringify(summary);
    assert(summary.sessionCount === 1 && summary.lastSession?.status === "complete", "lightweight summaries should expose completed session status");
    assert(summary.lastSession?.pixelComparison?.candidates[0]?.itemId === "mi-service", "lightweight summaries should retain ranked pixel candidates");
    assert(summary.lastSession?.captures.map((entry) => entry.phase).join(",") === "pointerdown,drag-start,drag-end", "lightweight summaries should retain phase coverage");
    assert(!summaryJson.includes('"folders"') && !summaryJson.includes('"sample"'), "lightweight summaries should exclude heavyweight folder and pixel samples");
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
