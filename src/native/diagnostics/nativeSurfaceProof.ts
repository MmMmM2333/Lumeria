import { Screen } from "../../../vendor/electrobun-pixi-native-starter/src/platform/electrobun-sdk.js";
import assert from "node:assert/strict";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { NativeIconNode } from "../product/nativeIconNode.js";
import { displayFor } from "../product/nativeScenePresentation.js";

type SceneCommitWork = ReturnType<NativeDesktopScene["commit"]>;

// Resize, mixed-DPI and suspend/resume verification. The scenario reads live
// product state through getters and returns the evidence it observed; the entry
// assembly keeps ownership of the proof variables and the resize observer flag.
export type NativeSurfaceProofContext = Readonly<{
  app: NativePixiApplication;
  commitScene: (
    viewport: Readonly<{ height: number; resolution: number; width: number }>,
    snapDesktopLayout: boolean,
  ) => SceneCommitWork;
  getLiveBackingObserved: () => boolean;
  getObservedResizeEvents: () => number;
  iconNodes: () => readonly NativeIconNode[];
  initialWork: SceneCommitWork;
  present: (description: string) => Promise<void>;
  selectionToolbarX: () => number;
  setObserveLiveResize: (value: boolean) => void;
  settingsButtonX: () => number;
  searchBarX: () => number;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
}>;

export type NativeSurfaceProofOutcome = Readonly<{
  dpiResolution: number | null;
  dpiTransition: "verified-display-fallback" | null;
  presentCount: number;
  resizeObserved: boolean;
  resizePresentCount: number;
  resizeSettledBackingObserved: boolean;
  restoreObserved: boolean;
  restorePresentCount: number;
  work: SceneCommitWork;
}>;

export async function runNativeSurfaceProof(context: NativeSurfaceProofContext): Promise<NativeSurfaceProofOutcome> {
  const {
    app, commitScene, getLiveBackingObserved, getObservedResizeEvents, iconNodes, initialWork, present,
    selectionToolbarX, setObserveLiveResize, settingsButtonX, searchBarX, waitFor,
  } = context;
  const initialSize = app.contentSize;
  const initialResizeEvents = getObservedResizeEvents();
  setObserveLiveResize(true);
  const windowFrame = app.window.getFrame();
  app.window.setSize(windowFrame.width + 160, windowFrame.height + 80);
  await waitFor(
    "the native resize event to update the public viewport",
    () => getObservedResizeEvents() > initialResizeEvents && (
      app.contentSize.width !== initialSize.width || app.contentSize.height !== initialSize.height
    ),
  );
  const liveSize = app.contentSize;
  if (!getLiveBackingObserved()) {
    throw new Error("Live resize did not update the GPU backing with the public viewport");
  }
  await waitFor(
    "live resize to match the GPU backing",
    () => {
      const source = app.renderer.view.texture.source;
      return source.pixelWidth === Math.round(liveSize.width * app.resolution)
        && source.pixelHeight === Math.round(liveSize.height * app.resolution);
    },
  );
  setObserveLiveResize(false);
  const resizeSettledBackingObserved = true;
  await present("the resized LaunchPad scene frame");
  const resizedSearchWidth = Math.min(348, Math.max(180, app.contentSize.width - 40));
  assert.equal(searchBarX(), (app.contentSize.width - resizedSearchWidth) / 2,
    "resize must recenter the search bar without waiting for an animation commit");
  assert.equal(settingsButtonX(), app.contentSize.width - 54,
    "resize must keep the settings button anchored to the current right edge");
  assert.equal(selectionToolbarX(), (app.contentSize.width - Math.min(760, app.contentSize.width - (app.contentSize.width<=760?20:40))) / 2,
    "resize must update the selection toolbar even while it is hidden");
  let presentCount = 1;
  const resizeObserved = true;
  const resizePresentCount = 1;

  const currentDisplay = displayFor(app.window.getFrame());
  const alternateDisplay = Screen.getAllDisplays().find((candidate) => (
    candidate.id !== currentDisplay.id && candidate.scaleFactor !== app.resolution
  ));
  let dpiTransition: NativeSurfaceProofOutcome["dpiTransition"] = null;
  let dpiResolution: number | null = null;
  let work = initialWork;
  if (alternateDisplay) {
    app.window.setPosition(
      alternateDisplay.workArea.x + 32,
      alternateDisplay.workArea.y + 32,
    );
    await waitFor(
      "the public resolution to follow the mixed-DPI display",
      () => app.resolution === alternateDisplay.scaleFactor,
    );
    work = commitScene({
      height: app.contentSize.height,
      resolution: app.resolution,
      width: app.contentSize.width,
    }, true);
    if (iconNodes().some((node) => (
      node.emojiText.resolution !== Math.max(2,app.resolution) || node.labelText.resolution !== Math.max(2,app.resolution)
    ))) {
      throw new Error("Native Pixi text resolution did not follow the mixed-DPI display");
    }
    await present("the mixed-DPI LaunchPad scene frame");
    presentCount += 1;
    dpiTransition = "verified-display-fallback";
    dpiResolution = app.resolution;
  }

  app.window.minimize();
  await waitFor(
    "the native application to suspend after minimization",
    () => app.window.isMinimized() && app.state === "suspended",
  );
  app.window.unminimize();
  await waitFor(
    "the native application to resume after restoration",
    () => !app.window.isMinimized() && app.state === "running",
  );
  work = commitScene({
    height: app.contentSize.height,
    resolution: app.resolution,
    width: app.contentSize.width,
  }, true);
  await present("the restored LaunchPad scene frame");
  presentCount += 1;

  return Object.freeze({
    dpiResolution,
    dpiTransition,
    presentCount,
    resizeObserved,
    resizePresentCount,
    resizeSettledBackingObserved,
    restoreObserved: true,
    restorePresentCount: 1,
    work,
  });
}
