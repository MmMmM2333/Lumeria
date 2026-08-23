import {
  Application,
  Container,
  Sprite,
  Texture,
  WebGLRenderer,
} from "pixi.js";
import type { Graphics } from "pixi.js";
import { IconNode } from "../../../src/rendering/pixi/nodes/IconNode.js";
import type { IconNodeStateInput } from "../../../src/rendering/pixi/nodes/IconNode.js";
import { GroupDragLayer } from "../../../src/rendering/pixi/scene/GroupDragLayer.js";
import type { SceneDataRecord, SceneItem } from "../../../src/rendering/sceneFrame.js";

const WIDTH = 800;
const HEIGHT = 600;
const BACKGROUND = 0x111827;
const SENTINEL_SIZE = 18;
const SENTINEL_COLUMNS = 16;
const TRANSITION_CYCLES = 10;
const SENTINEL_COLORS: readonly number[] = [
  0xf43f5e,
  0x22c55e,
  0x3b82f6,
  0xf59e0b,
  0xa855f7,
  0x06b6d4,
  0xf97316,
  0x84cc16,
];

export type PixiRegressionPixel = readonly [number, number, number, number];

export interface PixiRegressionBatchOffset {
  readonly attributeStart: number;
  readonly indexStart: number;
}

interface Sentinel {
  readonly color: number;
  readonly index: number;
  readonly sprite: Sprite;
}

interface SentinelSet {
  readonly layer: Container;
  readonly sprites: Sentinel[];
}

export interface PixiRegressionSentinelOffset {
  readonly attributeStart: number | null;
  readonly index: number;
  readonly indexStart: number | null;
}

export interface PixiRegressionPixelCorruption {
  readonly actual: PixiRegressionPixel;
  readonly expected: PixiRegressionPixel;
  readonly index: number;
  readonly phase: string;
}

export interface PixiDragPreviewMaskBatchRegressionResult {
  readonly appMaskBatches: PixiRegressionBatchOffset[];
  readonly appMaskVisible: boolean;
  readonly baselineCorruptions: PixiRegressionPixelCorruption[];
  readonly maskAttachedInApp: boolean;
  readonly motionCorruptions: PixiRegressionPixelCorruption[];
  readonly renderer: string;
  readonly rendererInfo: string;
  readonly sentinelOffsets: PixiRegressionSentinelOffset[];
  readonly transitionCycles: number;
  readonly warmCorruptions: PixiRegressionPixelCorruption[];
  readonly warmMaskBatches: PixiRegressionBatchOffset[];
}

export interface GroupDragFolderClipRegressionResult {
  readonly cornerOutside: PixiRegressionPixel;
  readonly inside: PixiRegressionPixel;
  readonly maskAttached: boolean;
  readonly outside: PixiRegressionPixel;
  readonly renderer: string;
  readonly straightEdgeInside: PixiRegressionPixel;
}

declare global {
  interface Window {
    pixiDragPreviewMaskBatchFixtureReady: boolean;
    runGroupDragFolderClipRegression: () => Promise<GroupDragFolderClipRegressionResult>;
    runPixiDragPreviewMaskBatchRegression: () => Promise<PixiDragPreviewMaskBatchRegressionResult>;
  }
}

function rgb(color: number): PixiRegressionPixel {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, 0xff];
}

function colorDistance(actual: PixiRegressionPixel, expected: PixiRegressionPixel): number {
  return Math.max(
    Math.abs(actual[0] - expected[0]),
    Math.abs(actual[1] - expected[1]),
    Math.abs(actual[2] - expected[2]),
    Math.abs(actual[3] - expected[3]),
  );
}

function makeIconState(item: SceneItem): IconNodeStateInput {
  const source: SceneDataRecord = { index: 0, pageIndex: 0, type: "page" };
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
    source,
    stageHeight: HEIGHT,
    stageWidth: WIDTH,
    textless: true,
  };
}

function readSentinelColor(index: number): number {
  const color = SENTINEL_COLORS[index % SENTINEL_COLORS.length];
  if (color === undefined) throw new RangeError(`No sentinel color for index ${index}`);
  return color;
}

function makeSentinels(): SentinelSet {
  const layer = new Container();
  const sprites: Sentinel[] = [];
  for (let index = 0; index < 64; index += 1) {
    const color = readSentinelColor(index);
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

function readPixel(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  x: number,
  y: number,
): PixiRegressionPixel {
  const pixel = new Uint8Array(4);
  gl.readPixels(Math.round(x), HEIGHT - 1 - Math.round(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const red = pixel[0];
  const green = pixel[1];
  const blue = pixel[2];
  const alpha = pixel[3];
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    throw new RangeError("WebGL pixel read did not return four channels");
  }
  return [red, green, blue, alpha];
}

function readCorruptions(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  sentinels: readonly Sentinel[],
  phase: string,
): PixiRegressionPixelCorruption[] {
  gl.finish();
  const corruptions: PixiRegressionPixelCorruption[] = [];
  for (const sentinel of sentinels) {
    const actual = readPixel(gl, sentinel.sprite.x, sentinel.sprite.y);
    const expected = rgb(sentinel.color);
    if (colorDistance(actual, expected) > 12) {
      corruptions.push({ actual, expected, index: sentinel.index, phase });
    }
  }
  return corruptions;
}

function readMaskBatches(mask: Graphics, renderer: WebGLRenderer): PixiRegressionBatchOffset[] {
  const gpuData = mask._gpuData[renderer.uid];
  return (gpuData?.batches || []).map((batch) => ({
    attributeStart: batch._attributeStart,
    indexStart: batch._indexStart,
  }));
}

function readSentinelOffsets(
  sentinels: readonly Sentinel[],
  renderer: WebGLRenderer,
): PixiRegressionSentinelOffset[] {
  return sentinels.map(({ index, sprite }) => {
    const batchable = sprite._gpuData[renderer.uid];
    return {
      attributeStart: batchable?._attributeStart ?? null,
      index,
      indexStart: batchable?._indexStart ?? null,
    };
  });
}

function requireWebGlRenderer(app: Application): WebGLRenderer {
  const renderer = app.renderer;
  if (!(renderer instanceof WebGLRenderer)) {
    const rendererName = renderer.name;
    app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    throw new Error(`WebGL renderer required, received ${rendererName}`);
  }
  return renderer;
}

function readRendererInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const value: unknown = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  if (typeof value !== "string") {
    throw new TypeError("WebGL renderer information must be a string");
  }
  return value;
}

async function runRegression(): Promise<PixiDragPreviewMaskBatchRegressionResult> {
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
  const renderer = requireWebGlRenderer(app);
  document.body.replaceChildren(renderer.canvas);

  const gl = renderer.gl;
  const rendererInfo = readRendererInfo(gl);

  const previewNode = new IconNode({ onAction: () => {} });
  previewNode.position.set(120, 120);
  const { layer: sentinelLayer, sprites: sentinels } = makeSentinels();
  app.stage.addChild(previewNode);
  app.stage.addChild(sentinelLayer);

  const folderItem: SceneItem = {
    childPages: [[]],
    children: [],
    id: "folder-mask-prime",
    name: "Folder Mask Prime",
    type: "folder",
  };
  const appItem: SceneItem = {
    emoji: "E",
    id: "app-mask-trigger",
    name: "App Mask Trigger",
    type: "app",
  };

  let appMaskBatches: PixiRegressionBatchOffset[] = [];
  let appSentinelOffsets: PixiRegressionSentinelOffset[] = [];
  let warmMaskBatches: PixiRegressionBatchOffset[] = [];
  const warmCorruptions: PixiRegressionPixelCorruption[] = [];
  const baselineCorruptions: PixiRegressionPixelCorruption[] = [];
  const motionCorruptions: PixiRegressionPixelCorruption[] = [];
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

  const result: PixiDragPreviewMaskBatchRegressionResult = {
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

async function runGroupDragFolderClipRegression(): Promise<GroupDragFolderClipRegressionResult> {
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
  const renderer = requireWebGlRenderer(app);
  document.body.replaceChildren(renderer.canvas);

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
  const result: GroupDragFolderClipRegressionResult = {
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
