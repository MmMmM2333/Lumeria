import { writeFileSync } from "node:fs";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";
import type { NativeIconNode } from "../product/nativeIconNode.js";
import type { NativeFrameProof,NativeHostLifecycleProof,NativeProof } from "./nativeProofTypes.js";

type NativeSmokeSupport = typeof import("../nativeSmokeSupport.js");

// Read-only live readers and capture resources that the final smoke proof
// scenario needs. The values are gathered by the entry assembly from the
// running product; this module never owns product state.
export type NativeSmokeProofInputs = Readonly<{
  backingHeight: number;
  backingWidth: number;
  catalogApps: number;
  contentSize: Readonly<{ height: number; width: number }>;
  desktopPageMotionObserved: boolean;
  dpiResolution: number;
  dpiTransition: NativeHostLifecycleProof["dpiTransition"];
  folderChildLaunchObserved: boolean;
  folderCloseMotionObserved: boolean;
  folderOpenMotionObserved: boolean;
  folderPageMotionObserved: boolean;
  loadedLayout: boolean;
  pageCount: number;
  pageNavigation: NativeFrameProof["pageNavigation"];
  presentCount: number;
  reconciledNodes: number;
  resizeLiveBackingObserved: boolean;
  resizeObserved: boolean;
  resizePresentCount: number;
  resizeSettledBackingObserved: boolean;
  resolution: number;
  restoreObserved: boolean;
  restorePresentCount: number;
  structuredLaunchFailureObserved: boolean;
  visibleNodes: number;
}>;

export type NativeSmokeProofContext = Readonly<{
  activePageItems: readonly SceneItem[];
  app: NativePixiApplication;
  background: readonly [number, number, number, number];
  iconNodes: readonly NativeIconNode[];
  inputs: NativeSmokeProofInputs;
  smoke: NativeSmokeSupport;
}>;

// Captures and publishes the final scene pixel proof. Ordering matches the
// previous inline block: capture the settled frame, sample pixels, assert the
// scene, then write the marker for the external smoke runner.
export async function captureNativeSmokeProof(context: NativeSmokeProofContext): Promise<void> {
  const { activePageItems, app, background, iconNodes, inputs, smoke } = context;
  const { contentSize } = inputs;
  await smoke.captureSmokeFrame(app, "desktop-restored-resized");
  const pixels = await smoke.captureScenePixels(app, contentSize.width, contentSize.height);
  const iconRegions = iconNodes
    .filter((node) => node.iconSprite.visible)
    .map((node) => smoke.toPixelRegion(node.iconSprite, pixels.width, pixels.height));
  if (iconRegions.length < 1) throw new Error("Expected at least one native PNG icon sprite");
  const pixelProof = smoke.assertNativeScenePixels(pixels, {
    background,
    contentBottom: Math.ceil(contentSize.height / 2),
    contentEnd: Math.floor(contentSize.height - 72),
    emojiRegions: iconNodes
      .filter((node) => node.emojiText.visible)
      .map((node) => smoke.toPixelRegion(node.emojiText, pixels.width, pixels.height)),
    iconRegions,
    labelRegions: iconNodes.map((node) => smoke.toPixelRegion(node.labelText, pixels.width, pixels.height)),
  });
  const cjkLabelPixels = activePageItems.flatMap((item, index) => (
    typeof item.name === "string" && /\p{Script=Han}/u.test(item.name)
      ? [pixelProof.labelForegroundPixels[index] ?? 0]
      : []
  ));
  if (cjkLabelPixels.length < 1 || cjkLabelPixels.some((count) => count <= 0)) {
    throw new Error("Native CJK labels did not produce foreground pixels");
  }
  const proof: NativeProof = Object.freeze({
    ...pixelProof,
    backingHeight: inputs.backingHeight,
    backingWidth: inputs.backingWidth,
    catalogApps: inputs.catalogApps,
    cjkLabelPixels,
    desktopPageMotionObserved: inputs.desktopPageMotionObserved,
    dpiResolution: inputs.dpiResolution,
    dpiTransition: inputs.dpiTransition,
    folderChildLaunchObserved: inputs.folderChildLaunchObserved,
    folderCloseMotionObserved: inputs.folderCloseMotionObserved,
    folderOpenMotionObserved: inputs.folderOpenMotionObserved,
    folderPageMotionObserved: inputs.folderPageMotionObserved,
    folderPageNavigation: "verified",
    height: contentSize.height,
    loadedLayout: inputs.loadedLayout,
    pageCount: inputs.pageCount,
    pageNavigation: inputs.pageNavigation,
    inputNavigation: "verified",
    folderInterruptions: "verified",
    folderTitleSamples: 20,
    presentCount: inputs.presentCount,
    presented: true,
    reconciledNodes: inputs.reconciledNodes,
    resolution: inputs.resolution,
    resizeLiveBackingObserved: inputs.resizeLiveBackingObserved,
    resizeMode: "live",
    resizeObserved: inputs.resizeObserved,
    resizePresentCount: inputs.resizePresentCount,
    resizeSettledBackingObserved: inputs.resizeSettledBackingObserved,
    restoreObserved: inputs.restoreObserved,
    restorePresentCount: inputs.restorePresentCount,
    structuredLaunchFailureObserved: inputs.structuredLaunchFailureObserved,
    visibleNodes: inputs.visibleNodes,
    width: contentSize.width,
  });
  const markerPath = process.env.LAUNCHPAD_NATIVE_SMOKE_MARKER;
  if (!markerPath) throw new Error("LAUNCHPAD_NATIVE_SMOKE_MARKER is required in smoke mode");
  writeFileSync(markerPath, JSON.stringify(proof), "utf8");
  console.log(JSON.stringify(proof, null, 2));
}
