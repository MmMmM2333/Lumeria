import { Container, Graphics } from "pixi.js";
import type { Text } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { sceneDiagnosticsState } from "../../../diagnostics/sceneDiagnosticsState.js";
import { createPixiText } from "../pixiText.js";
import {
  clientPointToStageVisualPoint,
  clientRectToStageVisualRect,
} from "../geometry/stageCoordinates.js";
import type { StageOrigin, StagePoint, StageRect } from "../geometry/stageCoordinates.js";

interface DragHitTargetSnapshot {
  expandedTargetRect?: StageRect | null;
  id?: string | null;
  intentRect?: StageRect | null;
  rect?: StageRect | null;
  type?: string | null;
}

interface DragHitPageSnapshot {
  index?: number | null;
  insertIndex?: number | null;
  slotCellRect?: StageRect | null;
  slotTargetRect?: StageRect | null;
}

interface DragHitFolderDecisionSnapshot {
  accepted?: boolean;
  dragIntersectsExpandedTarget?: boolean;
  expandedTargetRect?: StageRect | null;
  intentRect?: StageRect | null;
  reason?: string | null;
}

export interface DragHitDebugSnapshot {
  active: boolean;
  dragRect?: StageRect | null;
  folderDecision?: DragHitFolderDecisionSnapshot | null;
  folderHover?: Readonly<{ stickyRect?: StageRect | null }> | null;
  key?: string | null;
  lockedTarget?: DragHitTargetSnapshot | null;
  page?: DragHitPageSnapshot | null;
  phase?: string | null;
  pointer?: StagePoint | null;
  reason?: string | null;
  source?: unknown;
  target?: DragHitTargetSnapshot | null;
  visualCenter?: StagePoint | null;
  winner?: string | null;
}

export interface DragHitDebugLayerUpdateOptions {
  enabled?: boolean;
  stageRect?: StageOrigin | null;
}

interface DragHitRectStyle {
  alpha?: number;
  color?: number;
  fillAlpha?: number;
  width?: number;
}

const COLORS = Object.freeze({
  drag: 0xffffff,
  expandedTarget: 0xff9f0a,
  intent: 0xffd60a,
  locked: 0xbf5af2,
  pageSlot: 0x0a84ff,
  pointer: 0x64d2ff,
  target: 0x32d74b,
  warning: 0xff453a,
});

function cloneRect(rect: Partial<StageRect> | null | undefined): StageRect | null {
  if (!rect) return null;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  return { height, left, top, width };
}

function makeLabelText(): Text {
  return createPixiText({
    text: "",
    style: {
      fill: 0x07111f,
      fontFamily: "Inter, Segoe UI, sans-serif",
      fontSize: 10,
      fontWeight: "700",
      lineHeight: 12,
    },
  });
}

function shorten(value: unknown, fallback = "-"): string {
  const text = String(value || fallback);
  return text.length > 30 ? `${text.slice(0, 27)}...` : text;
}

export class DragHitDebugLayer extends Container {
  declare graphics: Graphics;
  declare labelLayer: Container;
  declare labels: Text[];
  declare lastSnapshot: DragHitDebugSnapshot | null;

  constructor() {
    super();
    this.eventMode = "none";
    this.visible = false;
    this.graphics = new Graphics();
    this.labelLayer = new Container();
    this.labelLayer.eventMode = "none";
    this.labels = [];
    this.lastSnapshot = null;
    this.addChild(this.graphics);
    this.addChild(this.labelLayer);
  }

  getLabel(index: number): Text {
    let label = this.labels[index];
    if (!label) {
      label = makeLabelText();
      this.labels[index] = label;
      this.labelLayer.addChild(label);
    }
    return label;
  }

  clearOverlay(): void {
    this.graphics.clear();
    for (const label of this.labels) label.visible = false;
    this.visible = false;
    this.lastSnapshot = null;
  }

  update(
    state: DragHitDebugSnapshot | null | undefined,
    options: DragHitDebugLayerUpdateOptions = {},
  ): DragHitDebugSnapshot | null {
    if (!options.enabled || !state?.active) {
      this.clearOverlay();
      sceneDiagnosticsState.publish("dragHit", null);
      return null;
    }
    this.visible = true;
    this.lastSnapshot = state;
    sceneDiagnosticsState.publish("dragHit", state);
    this.draw(state, options.stageRect || {});
    return state;
  }

  drawRect(
    rect: StageRect,
    stageRect: Partial<StageOrigin>,
    style: DragHitRectStyle = {},
  ): StageRect | null {
    const local = cloneRect(clientRectToStageVisualRect(rect, stageRect as StageOrigin));
    if (!local || local.width <= 0 || local.height <= 0) return null;
    if ((style.fillAlpha as number) > 0) {
      this.graphics
        .rect(local.left, local.top, local.width, local.height)
        .fill({ alpha: style.fillAlpha as number, color: style.color! });
    }
    this.graphics
      .rect(local.left, local.top, local.width, local.height)
      .stroke({
        alpha: style.alpha ?? 0.9,
        color: style.color ?? COLORS.drag,
        width: style.width ?? 1,
      });
    return local;
  }

  drawPoint(
    point: StagePoint,
    stageRect: Partial<StageOrigin>,
    color: number,
    radius = 4,
  ): void {
    const local = clientPointToStageVisualPoint(point, stageRect as StageOrigin);
    if (!local) return;
    this.graphics
      .circle(local.x, local.y, radius)
      .fill({ alpha: 0.92, color })
      .circle(local.x, local.y, radius + 2)
      .stroke({ alpha: 0.72, color, width: 1 });
  }

  drawLabel(
    index: number,
    text: unknown,
    rect: StageRect,
    color: number,
    stageRect: Partial<StageOrigin>,
  ): number {
    const local = cloneRect(clientRectToStageVisualRect(rect, stageRect as StageOrigin));
    if (!local) return index;
    const label = this.getLabel(index);
    const safeText = shorten(text);
    const width = Math.min(240, Math.max(56, safeText.length * 5.8 + 10));
    const x = Math.max(0, local.left);
    const y = Math.max(0, local.top - 18);
    this.graphics
      .roundRect(x, y, width, 16, 4)
      .fill({ alpha: 0.88, color });
    if (label.text !== safeText) label.text = safeText;
    label.visible = true;
    label.position.set(x + 5, y + 2);
    return index + 1;
  }

  draw(state: DragHitDebugSnapshot, stageRect: Partial<StageOrigin>): void {
    this.graphics.clear();
    let labelIndex = 0;

    const page = state.page || {};
    const target = state.target || null;
    const lockedTarget = state.lockedTarget || null;
    const targetRect = target?.rect;
    const expandedTargetRect = target?.expandedTargetRect || state.folderDecision?.expandedTargetRect;
    const intentRect = target?.intentRect || state.folderDecision?.intentRect;
    const lockedRect = lockedTarget?.rect;
    const stickyRect = state.folderHover?.stickyRect;

    if (page.slotCellRect) {
      this.drawRect(page.slotCellRect, stageRect, {
        alpha: 0.86,
        color: COLORS.pageSlot,
        fillAlpha: state.winner === "page-sort" || state.winner === "page-release" ? 0.11 : 0.04,
        width: 2,
      });
      labelIndex = this.drawLabel(
        labelIndex,
        `slot ${page.index}:${page.insertIndex}`,
        page.slotCellRect,
        COLORS.pageSlot,
        stageRect
      );
    }

    if (page.slotTargetRect) {
      this.drawRect(page.slotTargetRect, stageRect, {
        alpha: 0.58,
        color: COLORS.pageSlot,
        width: 1,
      });
    }

    if (targetRect) {
      this.drawRect(targetRect, stageRect, {
        alpha: 0.92,
        color: COLORS.target,
        fillAlpha: 0.035,
        width: 2,
      });
      labelIndex = this.drawLabel(
        labelIndex,
        `${target.type}:${target.id}`,
        targetRect,
        COLORS.target,
        stageRect
      );
    }

    if (expandedTargetRect) {
      this.drawRect(expandedTargetRect, stageRect, {
        alpha: 0.9,
        color: COLORS.expandedTarget,
        fillAlpha: state.folderDecision?.dragIntersectsExpandedTarget ? 0.075 : 0.025,
        width: 2,
      });
    }

    if (intentRect) {
      this.drawRect(intentRect, stageRect, {
        alpha: 0.96,
        color: COLORS.intent,
        fillAlpha: state.folderDecision?.accepted ? 0.16 : 0.055,
        width: 3,
      });
      labelIndex = this.drawLabel(
        labelIndex,
        "folder intent",
        intentRect,
        COLORS.intent,
        stageRect
      );
    }

    if (stickyRect) {
      this.drawRect(stickyRect, stageRect, {
        alpha: 0.86,
        color: COLORS.locked,
        fillAlpha: 0.045,
        width: 2,
      });
    }

    if (lockedRect && lockedRect !== targetRect) {
      this.drawRect(lockedRect, stageRect, {
        alpha: 0.95,
        color: COLORS.locked,
        fillAlpha: 0.05,
        width: 2,
      });
    }

    if (state.dragRect) {
      this.drawRect(state.dragRect, stageRect, {
        alpha: 0.98,
        color: COLORS.drag,
        fillAlpha: 0.035,
        width: 2,
      });
    }

    if (state.visualCenter) this.drawPoint(state.visualCenter, stageRect, COLORS.drag, 4);
    if (state.pointer) this.drawPoint(state.pointer, stageRect, COLORS.pointer, 3);

    const summaryRect = state.dragRect || targetRect || page.slotCellRect;
    if (summaryRect) {
      const reason = state.reason || state.folderDecision?.reason || "none";
      const targetId = state.target?.id || state.lockedTarget?.id || "-";
      labelIndex = this.drawLabel(
        labelIndex,
        `${state.winner || "pending"} / ${reason} / ${targetId}`,
        {
          ...summaryRect,
          top: summaryRect.top + summaryRect.height + 22,
        },
        String(state.winner || "").startsWith("folder") ? COLORS.expandedTarget : COLORS.warning,
        stageRect
      );
    }

    for (let index = labelIndex; index < this.labels.length; index += 1) {
      this.labels[index]!.visible = false;
    }
  }

  debugSnapshot(): DragHitDebugSnapshot | null {
    return this.lastSnapshot;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
