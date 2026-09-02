import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Container, type Text } from "pixi.js";
import { assertLayoutDocument } from "../domain/layoutDocument.js";
import {
  assertCompleteDesktopSceneFrame,
  makeDesktopSceneFrame,
  type CompleteDesktopSceneFrame,
  type DesktopSceneFrameInput,
} from "../rendering/sceneFrame.js";
import { installNativeCanvasTestAdapter } from "./nativeCanvasTestAdapter.js";
import { assertNativeScenePixels } from "./nativePixelProof.js";
import { NativeDesktopScene } from "../rendering/native/NativeDesktopScene.js";
import { PIXI_UI_FONT_FAMILY } from "../rendering/typography.js";
import {
  getNativeActivePageItems,
  getNativePageTurnFromKey,
  getNativePageTurnFromWheel,
  makeNativeStartupFrame,
  makeNativeStartupScanRequest,
  turnNativeDesktopPage,
} from "./nativeStartup.js";

installNativeCanvasTestAdapter();

const savedLayout = assertLayoutDocument(JSON.parse(readFileSync(
  new URL("../domain/fixtures/layout-v2-roundtrip.json", import.meta.url),
  "utf8",
)) as unknown);
const savedStartupFrame = makeNativeStartupFrame(savedLayout, []);
assert.equal(savedStartupFrame.viewport.gridRows, 4);
assert.equal(savedStartupFrame.viewport.gridCols, 6);
assert.equal(savedStartupFrame.viewport.iconSize, 72);
assert.equal(savedStartupFrame.interaction.isTextlessMode, true);
assert.equal(savedStartupFrame.viewport.activePages[0]?.[0]?.id, "custom-editor");
assert.equal(savedStartupFrame.interaction.focusedIcon?.id, "custom-editor");
const savedScanRequest = makeNativeStartupScanRequest(savedLayout);
assert.equal(savedScanRequest.roots.length, 1);
assert.equal(savedScanRequest.roots[0]?.id, "root-custom");
assert.deepEqual(savedScanRequest.filters.keywordBlacklist, ["uninstall", "卸载"]);
const firstRunFrame = makeNativeStartupFrame(null, [{
  id: "first-run-app",
  type: "app",
  name: "First Run",
  launchTarget: { kind: "url", path: "https://example.invalid/first-run" },
  trackingKey: "launch:url:first-run",
  identityStatus: "exact",
  sources: [{
    key: "first-run-source",
    type: "customDirectory",
    state: "primary",
    rootId: "first-run-root",
    rootLabel: "First run root",
    relativePath: "First Run.url",
    absolutePath: "C:/First Run.url",
  }],
}]);
assert.equal(firstRunFrame.viewport.gridRows, 5);
assert.equal(firstRunFrame.viewport.gridCols, 7);
assert.equal(firstRunFrame.viewport.activePages[0]?.[0]?.id, "first-run-app");
assert.equal(makeNativeStartupScanRequest(null).roots.length, 3);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "PageDown" }), 1);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "ArrowLeft" }), -1);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "ArrowRight", repeat: true }), 0);
assert.equal(getNativePageTurnFromKey({ type: "down", key: "PageUp", ctrlKey: true }), 0);
assert.equal(getNativePageTurnFromWheel({ deltaX: 0, deltaY: 120 }), 1);
assert.equal(getNativePageTurnFromWheel({ deltaX: -120, deltaY: 10 }), -1);
assert.equal(getNativePageTurnFromWheel({ deltaX: 0, deltaY: 0 }), 0);
assert.equal(getNativePageTurnFromWheel({ deltaX: 120, metaKey: true }), 0);

const secondSavedPage = turnNativeDesktopPage(savedStartupFrame, 1);
assert.equal(secondSavedPage.viewport.activePageIndex, 1);
assert.equal(secondSavedPage.interaction.focusedIcon?.id, getNativeActivePageItems(secondSavedPage)[0]?.id);
assert.equal(turnNativeDesktopPage(secondSavedPage, 1), secondSavedPage, "the last page must not turn past its edge");
assert.equal(turnNativeDesktopPage(secondSavedPage, -1).viewport.activePageIndex, 0);

function makeCompleteFrame(overrides: DesktopSceneFrameInput = {}): CompleteDesktopSceneFrame {
  const frame = makeDesktopSceneFrame({
    activePageIndex: 0,
    activePages: [[{ emoji: "🚀", id: "app-1", name: "示例应用", type: "app" }]],
    appLaunchCloseSessionId: null,
    desktopGridDebugOptions: null,
    desktopProjectionEpoch: 0,
    desktopTrackMotionKey: "native-static-snap",
    desktopVisualAlpha: 1,
    desktopVisualTransform: { scale: 1, y: 0 },
    dragFolderHoverState: null,
    dragFolderTargetId: null,
    dragHitDebugOptions: null,
    dragHitDebugState: null,
    dragMeta: null,
    focusedIcon: null,
    folderClosingHandoffId: null,
    folderPageSize: 24,
    folderSourceGhostedId: null,
    folderSourceGhostedIds: new Set<string>(),
    gridCols: 7,
    gridRows: 4,
    groupDragState: null,
    iconGesturePresentation: null,
    iconSize: 64,
    isBatchSelectionActive: false,
    isDesktopClosing: false,
    isEditMode: false,
    isHomeRevealSettling: false,
    isSearchMode: false,
    isTextlessMode: false,
    launchTargetStatusById: {},
    launchpadVisualAlpha: 1,
    launchpadVisualTransform: { scale: 1, y: 0 },
    pageGridMeasureStyle: {},
    pageTrackScrub: null,
    provisionalFolderRollback: null,
    selectedAppIds: new Set<string>(),
    showMissingLaunchTargetBadge: false,
    singleStageDiagnosticsOptions: null,
    ...overrides,
  });
  assertCompleteDesktopSceneFrame(frame);
  return frame;
}

const stage = new Container();
const activations: string[] = [];
const scene = new NativeDesktopScene(stage, {
  onIconActivate: (item) => activations.push(item.id),
});
const frame = makeCompleteFrame();
const work = scene.commit(frame, { height: 600, resolution: 1.25, width: 900 });

assert.equal(work.structureFrames, 1);
assert.equal(work.fullPlanBuilds, 1);
assert.equal(work.reconciledNodes, 1);
assert.ok(stage.getChildByLabel("launchpad-native-desktop"));
const itemNode = stage.getChildByLabel("launchpad-item:app-1", true);
assert.ok(itemNode, "the active desktop page should create a real Pixi icon node");
assert.equal(itemNode.eventMode, "static", "the active native desktop page should accept pointer input");
const itemEvents = itemNode as unknown as {
  emit(type: string, event: unknown): boolean;
};
itemEvents.emit("pointerdown", {
  button: 0,
  getLocalPosition: () => ({ x: 0, y: 0 }),
  nativeEvent: { button: 0 },
});
itemEvents.emit("pointerupoutside", {});
itemEvents.emit("pointercancel", {});
assert.deepEqual(activations, [], "press or cancellation must not activate an icon");
itemEvents.emit("pointertap", {});
assert.deepEqual(activations, ["app-1"], "a completed pointer tap should activate exactly once");
const initialItemBounds = itemNode.getBounds();
const nativeItemNode = itemNode as Container & { emojiText: Text; labelText: Text };
assert.ok(
  nativeItemNode.labelText.width > 0 && nativeItemNode.labelText.width < 200,
  `the native app label should stay within its 160px layout width, received ${nativeItemNode.labelText.width}px`,
);
assert.ok(
  nativeItemNode.labelText.height > 0 && nativeItemNode.labelText.height < 40,
  `the native app label should stay near its 16px line height, received ${nativeItemNode.labelText.height}px`,
);
const emojiFontFamily = nativeItemNode.emojiText.style.fontFamily;
assert.deepEqual(
  (Array.isArray(nativeItemNode.labelText.style.fontFamily)
    ? nativeItemNode.labelText.style.fontFamily
    : [nativeItemNode.labelText.style.fontFamily]
  ).map((fontFamily) => fontFamily.replaceAll('"', "")),
  [...PIXI_UI_FONT_FAMILY],
  "native labels should use the explicit Latin/CJK/Emoji fallback order",
);
assert.deepEqual(
  (Array.isArray(emojiFontFamily) ? emojiFontFamily : [emojiFontFamily])
    .map((fontFamily) => fontFamily.replaceAll('"', "")),
  ["Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"],
  "native emoji text should request a color emoji font before the platform default",
);
assert.equal(frame.viewport.activePages[0]?.[0]?.id, "app-1", "commit must not mutate the scene frame");

const resizedWork = scene.commit(frame, { height: 760, resolution: 2.5, width: 1180 });
const resizedItemNode = stage.getChildByLabel("launchpad-item:app-1", true);
assert.equal(resizedWork.structureFrames, 1);
assert.equal(resizedItemNode, itemNode, "resize should update the existing icon node instead of rebuilding it");
const resizedItemBounds = itemNode.getBounds();
assert.ok(
  resizedItemBounds.x !== initialItemBounds.x || resizedItemBounds.y !== initialItemBounds.y,
  "a larger native viewport should reflow the desktop grid",
);
assert.ok(
  resizedItemBounds.x >= 0
    && resizedItemBounds.y >= 0
    && resizedItemBounds.x + resizedItemBounds.width <= 1180
    && resizedItemBounds.y + resizedItemBounds.height <= 760,
  "the resized icon should remain inside the native viewport",
);
assert.equal(nativeItemNode.emojiText.resolution, 2.5, "resize should update existing emoji texture resolution");
assert.equal(nativeItemNode.labelText.resolution, 2.5, "resize should update existing label texture resolution");

const pagedFrame = makeCompleteFrame({
  activePages: [
    [{ emoji: "1️⃣", id: "page-1", name: "第一页", type: "app" }],
    [{ emoji: "2️⃣", id: "page-2", name: "第二页", type: "app" }],
    [{ emoji: "3️⃣", id: "page-3", name: "第三页", type: "app" }],
  ],
});
const pageTwoFrame = turnNativeDesktopPage(pagedFrame, 1);
scene.commit(pageTwoFrame, { height: 760, resolution: 2.5, width: 1180 });
assert.ok(stage.getChildByLabel("launchpad-item:page-2", true), "turning should materialize the next desktop page");
assert.equal(stage.getChildByLabel("launchpad-item:page-1", true), null, "the previous page should not remain a second live scene");
const pageThreeFrame = turnNativeDesktopPage(pageTwoFrame, 1);
scene.commit(pageThreeFrame, { height: 760, resolution: 2.5, width: 1180 });
const thirdPageNode = stage.getChildByLabel("launchpad-item:page-3", true);
assert.ok(thirdPageNode, "three-page layouts should reach their final page");
const thirdPageBounds = thirdPageNode.getBounds();
assert.ok(
  thirdPageBounds.x >= 0
    && thirdPageBounds.y >= 0
    && thirdPageBounds.x + thirdPageBounds.width <= 1180
    && thirdPageBounds.y + thirdPageBounds.height <= 760,
  "the turned page icon should remain inside the native viewport",
);

const background = [9, 11, 20, 255] as const;
const contaminatedPixels = new Uint8ClampedArray(8 * 8 * 4);
for (let offset = 0; offset < contaminatedPixels.length; offset += 4) {
  contaminatedPixels.set(background, offset);
}
contaminatedPixels.set([255, 255, 255, 255], (7 * 8 + 4) * 4);
assert.throws(
  () => assertNativeScenePixels(
    { height: 8, pixels: contaminatedPixels, width: 8 },
    { background, contentBottom: 6, emojiRegions: [], iconRegions: [], labelRegions: [] },
  ),
  /lower empty area contains 1 foreground pixel/,
  "native pixel proof should reject content leaking into the lower empty area",
);
const tofuPixels = new Uint8ClampedArray(8 * 8 * 4);
for (let offset = 0; offset < tofuPixels.length; offset += 4) tofuPixels.set(background, offset);
tofuPixels.set([255, 255, 255, 255], (2 * 8 + 2) * 4);
assert.throws(
  () => assertNativeScenePixels(
    { height: 8, pixels: tofuPixels, width: 8 },
    {
      background,
      contentBottom: 6,
      emojiRegions: [{ height: 3, width: 3, x: 1, y: 1 }],
      iconRegions: [],
      labelRegions: [],
    },
  ),
  /color emoji pixels/,
  "native pixel proof should reject monochrome missing-glyph boxes",
);
const missingLabelPixels = new Uint8ClampedArray(8 * 8 * 4);
for (let offset = 0; offset < missingLabelPixels.length; offset += 4) missingLabelPixels.set(background, offset);
missingLabelPixels.set([240, 80, 20, 255], (2 * 8 + 2) * 4);
assert.throws(
  () => assertNativeScenePixels(
    { height: 8, pixels: missingLabelPixels, width: 8 },
    {
      background,
      contentBottom: 6,
      emojiRegions: [{ height: 3, width: 3, x: 1, y: 1 }],
      iconRegions: [],
      labelRegions: [{ height: 1, width: 3, x: 1, y: 4 }],
    },
  ),
  /Label region 0 contains no foreground pixels/,
  "native pixel proof should require every app label to reach the GPU texture",
);
const iconPixels = new Uint8ClampedArray(4 * 4 * 4);
for (let offset = 0; offset < iconPixels.length; offset += 4) iconPixels.set(background, offset);
iconPixels.set([239, 59, 109, 255], (1 * 4 + 1) * 4);
const iconProof = assertNativeScenePixels(
  { height: 4, pixels: iconPixels, width: 4 },
  {
    background,
    contentBottom: 4,
    emojiRegions: [],
    iconRegions: [{ height: 2, width: 2, x: 1, y: 1 }],
    labelRegions: [],
  },
);
assert.equal(iconProof.iconForegroundPixels[0], 1, "native pixel proof should count uploaded icon pixels");
const grayscaleIconPixels = new Uint8ClampedArray(iconPixels);
grayscaleIconPixels.set([180, 180, 180, 255], (1 * 4 + 1) * 4);
assert.throws(
  () => assertNativeScenePixels(
    { height: 4, pixels: grayscaleIconPixels, width: 4 },
    {
      background,
      contentBottom: 4,
      emojiRegions: [],
      iconRegions: [{ height: 2, width: 2, x: 1, y: 1 }],
      labelRegions: [],
    },
  ),
  /no colored icon pixels/,
  "native pixel proof should reject an icon region without colored pixels",
);

assert.throws(
  () => scene.commit(makeCompleteFrame({ isEditMode: true }), { height: 600, resolution: 1, width: 900 }),
  /interaction\.isEditMode/,
);
assert.throws(
  () => scene.commit(frame, { height: 600, resolution: 0, width: 900 }),
  /NativeSceneViewport\.resolution/,
  "native viewport validation must reject a zero device resolution",
);

scene.destroy();
scene.destroy();
assert.equal(stage.children.length, 0);
assert.throws(
  () => scene.commit(frame, { height: 600, resolution: 1, width: 900 }),
  /has been destroyed/,
);

stage.destroy();
console.log("Native desktop scene tests passed");
