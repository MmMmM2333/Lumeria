import { Application, Container, Sprite, Texture } from "pixi.js";
import { IconNode } from "/src/rendering/pixi/nodes/IconNode.js";
import { GroupDragLayer } from "/src/rendering/pixi/scene/GroupDragLayer.js";

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0x111827;
const SENTINEL_SIZE = 18;
const SENTINEL_COLUMNS = 16;
const TRANSITION_CYCLES = 10;
const SENTINEL_COLORS = [
  0xf43f5e,
  0x22c55e,
  0x3b82f6,
  0xf59e0b,
  0xa855f7,
  0x06b6d4,
  0xf97316,
  0x84cc16,
];

function rgb(color) {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, 0xff];
}

function colorDistance(actual, expected) {
  return Math.max(
    Math.abs(actual[0] - expected[0]),
    Math.abs(actual[1] - expected[1]),
    Math.abs(actual[2] - expected[2]),
    Math.abs(actual[3] - expected[3]),
  );
}

function makeIconState(item) {
  return {
    cellHeight: 80,
    cellWidth: 80,
    compact: false,
    draggable: false,
    editing: false,
    folderPreviewPageSize: 9,
    ghosted: false,
    iconSize: 64,
    interactive: false,
    item,
    opening: false,
    preserveNodeScale: true,
    source: { index: 0, pageIndex: 0, type: "page" },
    stageHeight: HEIGHT,
    stageWidth: WIDTH,
    textless: true,
  };
}

function makeSentinels() {
  const layer = new Container();
  const sprites = [];
  for (let index = 0; index < 64; index += 1) {
    const color = SENTINEL_COLORS[index % SENTINEL_COLORS.length];
    const sprite = new Sprite(Texture.WHITE);
    sprite.anchor.set(0.5);
    sprite.tint = color;
    sprite.width = SENTINEL_SIZE;
    sprite.height = SENTINEL_SIZE;
    sprite.position.set(
      360 + (index % SENTINEL_COLUMNS) * 26,
      40 + Math.floor(index / SENTINEL_COLUMNS) * 26,
    );
    sprite.label = `sentinel-${index}`;
    layer.addChild(sprite);
    sprites.push({ color, index, sprite });
  }
  return { layer, sprites };
}

function readPixel(gl, x, y) {
  const pixel = new Uint8Array(4);
  gl.readPixels(Math.round(x), HEIGHT - 1 - Math.round(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return Array.from(pixel);
}

function readCorruptions(gl, sentinels, phase) {
  gl.finish();
  const corruptions = [];
  for (const sentinel of sentinels) {
    const actual = readPixel(gl, sentinel.sprite.x, sentinel.sprite.y);
    const expected = rgb(sentinel.color);
    if (colorDistance(actual, expected) > 12) {
      corruptions.push({ actual, expected, index: sentinel.index, phase });
    }
  }
  return corruptions;
}

function readMaskBatches(mask, renderer) {
  const gpuData = mask?._gpuData?.[renderer.uid];
  return (gpuData?.batches || []).map((batch) => ({
    attributeStart: batch._attributeStart,
    indexStart: batch._indexStart,
  }));
}

function readSentinelOffsets(sentinels, renderer) {
  return sentinels.map(({ index, sprite }) => {
    const batchable = sprite?._gpuData?.[renderer.uid];
    return {
      attributeStart: batchable?._attributeStart ?? null,
      index,
      indexStart: batchable?._indexStart ?? null,
    };
  });
}

async function runRegression() {
  const app = new Application();
  await app.init({
    antialias: false,
    autoStart: false,
    background: BACKGROUND,
    height: HEIGHT,
    preference: ["webgl"],
    preserveDrawingBuffer: true,
    resolution: 1,
    width: WIDTH,
  });
  document.body.replaceChildren(app.canvas);

  const renderer = app.renderer;
  if (renderer.name !== "webgl") {
    app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    throw new Error(`WebGL renderer required, received ${renderer.name}`);
  }

  const gl = renderer.gl;
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererInfo = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);

  const previewNode = new IconNode({ onAction: () => {} });
  previewNode.position.set(120, 120);
  const { layer: sentinelLayer, sprites: sentinels } = makeSentinels();
  app.stage.addChild(previewNode);
  app.stage.addChild(sentinelLayer);

  const folderItem = {
    childPages: [[]],
    children: [],
    id: "folder-mask-prime",
    name: "Folder Mask Prime",
    type: "folder",
  };
  const appItem = {
    emoji: "E",
    id: "app-mask-trigger",
    name: "App Mask Trigger",
    type: "app",
  };

  let appMaskBatches = [];
  let appSentinelOffsets = [];
  let warmMaskBatches = [];
  const warmCorruptions = [];
  const baselineCorruptions = [];
  const motionCorruptions = [];
  for (let cycle = 0; cycle < TRANSITION_CYCLES; cycle += 1) {
    previewNode.setState(makeIconState(folderItem));
    renderer.render(app.stage);
    if (cycle === 0) warmMaskBatches = readMaskBatches(previewNode.folderPreviewMask, renderer);
    warmCorruptions.push(...readCorruptions(gl, sentinels, `folder-warm-${cycle}`));

    previewNode.setState(makeIconState(appItem));
    renderer.render(app.stage);
    if (cycle === 0) {
      appMaskBatches = readMaskBatches(previewNode.folderPreviewMask, renderer);
      appSentinelOffsets = readSentinelOffsets(sentinels, renderer);
    }
    baselineCorruptions.push(...readCorruptions(gl, sentinels, `app-baseline-${cycle}`));

    for (let frame = 0; frame < 3; frame += 1) {
      const scale = frame % 2 === 0 ? 1.08 : 1.14;
      previewNode.scale.set(scale);
      renderer.render(app.stage);
      motionCorruptions.push(...readCorruptions(gl, sentinels, `app-motion-${cycle}-${frame}`));
    }
  }

  const result = {
    appMaskBatches,
    appMaskVisible: previewNode.folderPreviewMask.visible,
    baselineCorruptions,
    maskAttachedInApp: previewNode.folderChildrenWrap.mask === previewNode.folderPreviewMask,
    motionCorruptions,
    renderer: renderer.name,
    rendererInfo,
    sentinelOffsets: appSentinelOffsets,
    transitionCycles: TRANSITION_CYCLES,
    warmCorruptions,
    warmMaskBatches,
  };

  app.destroy(
    { removeView: true, releaseGlobalResources: true },
    { children: true, texture: false, textureSource: false },
  );
  return result;
}

async function runGroupDragFolderClipRegression() {
  const app = new Application();
  await app.init({
    antialias: false,
    autoStart: false,
    background: BACKGROUND,
    height: HEIGHT,
    preference: ["webgl"],
    preserveDrawingBuffer: true,
    resolution: 1,
    width: WIDTH,
  });
  document.body.replaceChildren(app.canvas);

  const renderer = app.renderer;
  if (renderer.name !== "webgl") {
    app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    throw new Error(`WebGL renderer required, received ${renderer.name}`);
  }

  const panel = { height: 220, radius: 48, width: 300, x: 100, y: 80 };
  const layer = new GroupDragLayer({
    resolveFolderClipGeometry: () => ({
      ...panel,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    }),
  });
  layer.visible = true;
  layer.syncFolderClipMask();
  app.stage.addChild(layer);

  const actor = new Sprite(Texture.WHITE);
  actor.tint = 0xf43f5e;
  actor.position.set(60, 40);
  actor.width = 380;
  actor.height = 300;
  layer.folderClipActorLayer.addChild(actor);
  renderer.render(app.stage);

  const gl = renderer.gl;
  gl.finish();
  const result = {
    cornerOutside: readPixel(gl, panel.x + 4, panel.y + 4),
    inside: readPixel(gl, panel.x + panel.width / 2, panel.y + panel.height / 2),
    maskAttached: layer.folderClipActorLayer.mask === layer.folderClipMask,
    outside: readPixel(gl, panel.x - 10, panel.y + panel.height / 2),
    renderer: renderer.name,
    straightEdgeInside: readPixel(gl, panel.x + panel.width / 2, panel.y + 4),
  };

  app.destroy(
    { removeView: true, releaseGlobalResources: true },
    { children: true, texture: false, textureSource: false },
  );
  return result;
}

window.runPixiDragPreviewMaskBatchRegression = runRegression;
window.runGroupDragFolderClipRegression = runGroupDragFolderClipRegression;
window.pixiDragPreviewMaskBatchFixtureReady = true;
