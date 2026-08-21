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
