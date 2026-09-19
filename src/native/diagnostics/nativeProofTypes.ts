import type { NativeScenePixelProof } from "../nativePixelProof.js";

// Proof shapes describe the diagnostic verification contract. They are
// standalone types so the diagnostic scenarios and the entry assembly can
// share them without pulling scenario code into the production path.

export type NativeFrameProof = Readonly<{
  backingHeight: number;
  backingWidth: number;
  catalogApps: number;
  cjkLabelPixels: readonly number[];
  height: number;
  loadedLayout: boolean;
  pageCount: number;
  desktopPageMotionObserved: boolean;
  folderChildLaunchObserved: boolean;
  folderCloseMotionObserved: boolean;
  folderOpenMotionObserved: boolean;
  folderPageMotionObserved: boolean;
  folderPageNavigation: "verified";
  pageNavigation: "skipped-single-page" | "verified";
  inputNavigation: "verified";
  folderInterruptions: "verified";
  folderTitleSamples: number;
  presentCount: number;
  presented: true;
  reconciledNodes: number;
  resolution: number;
  visibleNodes: number;
  width: number;
}>;

export type NativeHostLifecycleProof = Readonly<{
  dpiResolution: number;
  dpiTransition: "skipped-no-mixed-dpi-display" | "verified-display-fallback";
  resizeLiveBackingObserved: boolean;
  resizeMode: "live";
  resizeObserved: boolean;
  resizePresentCount: number;
  resizeSettledBackingObserved: boolean;
  restoreObserved: boolean;
  restorePresentCount: number;
  structuredLaunchFailureObserved: boolean;
}>;

export type NativeProof = NativeFrameProof & NativeHostLifecycleProof & NativeScenePixelProof;
