import { Container, Graphics, Text } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { makeSingleStageFolderProbePlan } from "./singleStageFolderProbePlan.js";

export { isSingleStageFolderProbeEnabled, makeSingleStageFolderProbePlan } from "./singleStageFolderProbePlan.js";

export class SingleStageFolderProbeLayer extends Container {
  constructor() {
    super();
    this.panelGraphics = new Graphics();
    this.targetGraphics = new Graphics();
    this.label = new Text({
      text: "",
      style: {
        fill: 0xffffff,
        fontFamily: "Inter, Segoe UI, sans-serif",
        fontSize: 12,
        fontWeight: "600",
      },
    });
    this.label.alpha = 0.84;
    this.addChild(this.panelGraphics);
    this.addChild(this.targetGraphics);
    this.addChild(this.label);
    this.visible = false;
    this.stableFolderCloseTarget = null;
  }

  update(state, options = {}) {
    const plan = makeSingleStageFolderProbePlan(state, {
      enabled: options.enabled,
      previousStableFolderCloseTarget: this.stableFolderCloseTarget,
      wasClosing: this.wasClosing,
    });
    this.wasClosing = Boolean(state?.isFolderClosing || state?.isFolderAppLaunchClosing);
    this.stableFolderCloseTarget = plan?.stableFolderCloseTarget || null;
    this.visible = Boolean(plan);
    this.panelGraphics.clear();
    this.targetGraphics.clear();
    if (!plan) {
      this.label.visible = false;
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
    for (const preview of plan.previewRects) {
      const rect = preview.localRect;
      if (!rect) continue;
      this.targetGraphics
        .rect(rect.left, rect.top, rect.width, rect.height)
        .stroke({ color: 0x32d74b, alpha: 0.9, width: 1 });
    }

    this.label.visible = true;
    this.label.text = `single-stage probe: ${plan.folderId}`;
    this.label.position.set(panel.left, Math.max(0, panel.top - 22));
    return plan;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
