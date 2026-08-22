import type {
  DesktopRenderPlan,
  DesktopRenderPlanContext,
} from "./desktopRenderPlan.js";
import type { FolderOpeningGeometrySnapshot } from "./folderOpeningGeometrySnapshot.js";
import type { FolderOverlayRenderPlan } from "./folderOverlayRenderPlan.js";
import type {
  FolderOverlayRect,
  StableFolderCloseTarget,
} from "./folderOverlayTargets.js";
import type { IconVisualSpec } from "./iconVisualSpec.js";

declare const iconVisualSpec: IconVisualSpec;
declare const rect: FolderOverlayRect;
declare const stableTarget: StableFolderCloseTarget;
declare const openingSnapshot: FolderOpeningGeometrySnapshot;
declare const desktopContext: DesktopRenderPlanContext;
declare const desktopPlan: DesktopRenderPlan;
declare const folderPlan: FolderOverlayRenderPlan;
declare const createAppLaunchVisualCommitTracker:
  typeof import("../appLaunchVisualCommit.js").createAppLaunchVisualCommitTracker;
declare const createPixiRenderProbe:
  typeof import("../renderDebugProbe.dev.js").createPixiRenderProbe;
declare const makeDesktopBoundsRegistration:
  typeof import("./desktopBoundsRegistration.js").makeDesktopBoundsRegistration;
declare const resolveDesktopBoundsTargets:
  typeof import("./desktopBoundsTargets.js").resolveDesktopBoundsTargets;

type DesktopLayerConstructorArgs = ConstructorParameters<
  typeof import("./DesktopLayer.js").DesktopLayer
>;
type FolderOverlayLayerConstructorArgs = ConstructorParameters<
  typeof import("./FolderOverlayLayer.js").FolderOverlayLayer
>;

// @ts-expect-error Desktop layers require their rendering dependencies.
const missingDesktopLayerOptions: DesktopLayerConstructorArgs = [];
void missingDesktopLayerOptions;

// @ts-expect-error Folder overlays require their rendering dependencies.
const missingFolderOverlayLayerOptions: FolderOverlayLayerConstructorArgs = [];
void missingFolderOverlayLayerOptions;

// @ts-expect-error App-launch commit tracking requires session and commit callbacks.
createAppLaunchVisualCommitTracker({ requestAnimationFrame: () => 0 });

// @ts-expect-error Render probes require a capture callback.
createPixiRenderProbe();

// @ts-expect-error A declared desktop-frame shape requires a matching frame value.
makeDesktopBoundsRegistration<{ id: string }, { width: number }>({}, []);

// @ts-expect-error Desktop bounds projection requires its complete input.
resolveDesktopBoundsTargets();

// @ts-expect-error Published icon visual specs are readonly.
iconVisualSpec.iconSize = 72;

// @ts-expect-error Published geometry rectangles are readonly.
rect.left = 12;

// @ts-expect-error Stable close-target maps expose no mutation API.
stableTarget.previewChildRects.set("app-a:0", rect);

// @ts-expect-error Opening source snapshots are immutable contracts.
openingSnapshot.source.folderRect = rect;

// @ts-expect-error Desktop handoff observations expose readonly sets.
desktopContext.handoffObservation.activeClosingFolderIds.add("folder-a");

// @ts-expect-error Desktop render-plan entries are readonly.
desktopPlan.entries.push(desktopPlan.entries[0]);

// @ts-expect-error Folder render-plan entries are readonly.
folderPlan.entries.push(folderPlan.entries[0]);
