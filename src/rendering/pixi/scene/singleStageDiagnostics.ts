import { Container, Graphics } from "pixi.js";
import type { Text } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { createPixiText } from "../pixiText.js";
import { sceneDiagnosticsState } from "../../../diagnostics/sceneDiagnosticsState.js";
import { roundRect } from "./folderHandoffDebug.js";
import { getSingleStageDiagnosticsOptions, makeSingleStageDiagnosticsPlan } from "./singleStagePlan.js";
import type { RoundedDebugRect } from "./folderHandoffDebug.js";
import type { SingleStageDiagnosticsOptions } from "./singleStagePlan.js";

type SingleStageDiagnosticsState = Parameters<typeof makeSingleStageDiagnosticsPlan>[0];
type SingleStagePlanOptions = NonNullable<Parameters<typeof makeSingleStageDiagnosticsPlan>[1]>;
type SingleStageDiagnosticsPlan = NonNullable<ReturnType<typeof makeSingleStageDiagnosticsPlan>>;
type SingleStagePreviewPlan = NonNullable<SingleStageDiagnosticsPlan["previewRects"][number]>;

export interface SingleStageDiagnosticsLayerUpdateOptions {
  enabled?: SingleStagePlanOptions["enabled"];
  iconBoundsRegistry?: SingleStagePlanOptions["iconBoundsRegistry"];
}

export interface SingleStageDebugPreviewSnapshot {
  itemId: string;
  localRect: RoundedDebugRect | null;
  rect: RoundedDebugRect | null;
  slotIndex: number;
}

export interface SingleStageDebugSnapshot {
  canvasStageRect: RoundedDebugRect | null;
  closeIconLocalRect: RoundedDebugRect | null;
  closeIconRect: RoundedDebugRect | null;
  closeThumbLocalRect: RoundedDebugRect | null;
  closeThumbRect: RoundedDebugRect | null;
  desktopFrame: RoundedDebugRect | null;
  desktopStageRect: RoundedDebugRect | null;
  folderClientRect: RoundedDebugRect | null;
  folderId: string;
  folderLocalRect: RoundedDebugRect | null;
  panelRect: RoundedDebugRect | null;
  previewRects: SingleStageDebugPreviewSnapshot[];
  stableTarget: Readonly<{
    coordinateSpace: "client-visual" | "stage-layout" | null;
    previewChildCount: number;
    source: string | null;
  }>;
  stageRect: RoundedDebugRect | null;
}

export {
  getSingleStageDiagnosticsOptions,
  isSingleStageDiagnosticsEnabled,
  makeSingleStageDiagnosticsPlan,
} from "./singleStagePlan.js";

function makeDebugSnapshot(plan: SingleStageDiagnosticsPlan | null): SingleStageDebugSnapshot | null {
  if (!plan) return null;
  return {
    canvasStageRect: roundRect(plan.canvasStageRect),
    closeIconLocalRect: roundRect(plan.closeIconLocalRect),
    closeIconRect: roundRect(plan.closeIconRect),
    closeThumbLocalRect: roundRect(plan.closeThumbLocalRect),
    closeThumbRect: roundRect(plan.closeThumbRect),
    desktopFrame: roundRect(plan.desktopFrame),
    folderId: plan.folderId,
    folderLocalRect: roundRect(plan.folderLocalRect),
    folderClientRect: roundRect(plan.folderClientRect),
    desktopStageRect: roundRect(plan.desktopStageRect),
    panelRect: roundRect(plan.panelRect),
    previewRects: (plan.previewRects as readonly SingleStagePreviewPlan[]).map((preview) => ({
      itemId: preview.itemId,
      localRect: roundRect(preview.localRect),
      rect: roundRect(preview.rect),
      slotIndex: preview.slotIndex,
    })),
    stableTarget: {
      coordinateSpace: plan.stableFolderCloseTarget?.coordinateSpace || null,
      previewChildCount: plan.stableFolderCloseTarget?.previewChildRects?.size || 0,
      source: plan.stableFolderCloseTarget?.source || null,
    },
    stageRect: roundRect(plan.stageRect),
  };
}

export class SingleStageDiagnosticsLayer extends Container {
  declare readonly diagnosticLabelText: Text;
  declare lastDebugKey: string;
  declare panelGraphics: Graphics;
  declare stableFolderCloseTarget: SingleStageDiagnosticsPlan["stableFolderCloseTarget"];
  declare targetGraphics: Graphics;
  declare wasClosing: boolean | undefined;

  constructor() {
    super();
    this.panelGraphics = new Graphics();
    this.targetGraphics = new Graphics();
    this.diagnosticLabelText = createPixiText({
      text: "",
      style: {
        fill: 0xffffff,
        fontFamily: "Inter, Segoe UI, sans-serif",
        fontSize: 12,
        fontWeight: "600",
      },
    });
    this.diagnosticLabelText.alpha = 0.84;
    this.addChild(this.panelGraphics);
    this.addChild(this.targetGraphics);
    this.addChild(this.diagnosticLabelText);
    this.visible = false;
    this.stableFolderCloseTarget = null;
    this.lastDebugKey = "";
  }

  update(
    state: SingleStageDiagnosticsState,
    options: SingleStageDiagnosticsLayerUpdateOptions = {},
  ): SingleStageDiagnosticsPlan | null {
    const label = this.diagnosticLabelText;
    const diagnosticsOptions = getSingleStageDiagnosticsOptions(options.enabled);
    const plan = makeSingleStageDiagnosticsPlan(state, {
      enabled: diagnosticsOptions,
      iconBoundsRegistry: options.iconBoundsRegistry,
      previousStableFolderCloseTarget: this.stableFolderCloseTarget,
      wasClosing: this.wasClosing,
    } as SingleStagePlanOptions);
    this.wasClosing = Boolean(state?.isFolderClosing || state?.isFolderAppLaunchClosing);
    this.stableFolderCloseTarget = plan?.stableFolderCloseTarget || null;
    this.visible = Boolean(plan);
    this.panelGraphics.clear();
    this.targetGraphics.clear();
    this.publishDebugSnapshot(plan, diagnosticsOptions);
    if (!plan) {
      label.visible = false;
      return null;
    }

    const panel = plan.panelRect;
    this.panelGraphics
      .roundRect(panel.left, panel.top, panel.width, panel.height, 48)
      .fill({ color: 0x66d9ef, alpha: 0.045 })
      .stroke({ color: 0x66d9ef, alpha: 0.75, width: 2 });

    if (plan.folderLocalRect) {
      this.targetGraphics
        .rect(plan.folderLocalRect.left, plan.folderLocalRect.top, plan.folderLocalRect.width, plan.folderLocalRect.height)
        .stroke({ color: 0xffcc00, alpha: 0.85, width: 2 });
    }
    if (plan.closeThumbLocalRect) {
      this.targetGraphics
        .rect(plan.closeThumbLocalRect.left, plan.closeThumbLocalRect.top, plan.closeThumbLocalRect.width, plan.closeThumbLocalRect.height)
        .stroke({ color: 0xff2d55, alpha: 0.9, width: 2 });
    }
    for (const preview of plan.previewRects as readonly SingleStagePreviewPlan[]) {
      const rect = preview.localRect;
      if (!rect) continue;
      this.targetGraphics
        .rect(rect.left, rect.top, rect.width, rect.height)
        .stroke({ color: 0x32d74b, alpha: 0.9, width: 1 });
    }

    label.visible = true;
    label.text = `single-stage diagnostics: ${plan.folderId}`;
    label.position.set(panel.left, Math.max(0, panel.top - 22));
    return plan;
  }

  publishDebugSnapshot(
    plan: SingleStageDiagnosticsPlan | null,
    options: SingleStageDiagnosticsOptions,
  ): void {
    if (!options.diagnostics && !options.probe) return;
    const snapshot = makeDebugSnapshot(plan);
    sceneDiagnosticsState.publish("singleStage", snapshot);
    if (!options.log) return;
    const debugKey = JSON.stringify({
      closeThumb: snapshot?.closeThumbRect,
      folderId: snapshot?.folderId,
      panel: snapshot?.panelRect,
      stage: snapshot?.stageRect,
      desktopStage: snapshot?.desktopStageRect,
    });
    if (debugKey === this.lastDebugKey) return;
    this.lastDebugKey = debugKey;
    console.log("[single-stage-diagnostics]", snapshot);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
