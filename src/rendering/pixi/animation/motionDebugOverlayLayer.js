import { Container, Graphics } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { createPixiText } from "../pixiText.js";
import { buildMotionOverlayItems } from "./motionDebugOverlay.js";
import {
  readNumber,
  readPositiveNumber,
} from "./motionTraceShared.js";

const DEFAULT_MAX_OVERLAY_ITEMS = 18;
const LABEL_HEIGHT = 16;
const OVERLAY_TARGET_COLOR = 0xffffff;

function makeLabelText() {
  return createPixiText({
    text: "",
    style: {
      fill: 0x0d1117,
      fontFamily: "Inter, Segoe UI, sans-serif",
      fontSize: 10,
      fontWeight: "700",
      lineHeight: 12,
    },
  });
}

function shortenLabel(label) {
  const parts = String(label || "target").split(".").filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return parts[0] || "target";
}

function makeBadgeText(item) {
  const prop = item.propSummary ? ` ${item.propSummary}` : "";
  const lane = !prop && item.laneSummary ? ` ${item.laneSummary}` : "";
  return `${shortenLabel(item.label)}${prop}${lane}`;
}

function clampLabelPosition(value, max) {
  return Math.max(0, Math.min(readNumber(value), Math.max(0, readNumber(max) - 24)));
}

export class MotionDebugOverlayLayer extends Container {
  constructor(options = {}) {
    super();
    this.eventMode = "none";
    this.visible = false;
    this.maxItems = Math.max(1, Math.floor(readNumber(options.maxItems, DEFAULT_MAX_OVERLAY_ITEMS)));
    this.graphics = new Graphics();
    this.labelLayer = new Container();
    this.labelLayer.eventMode = "none";
    this.labels = [];
    this.lastSnapshot = {
      enabled: false,
      itemCount: 0,
      labels: [],
    };
    this.addChild(this.graphics);
    this.addChild(this.labelLayer);
  }

  getLabel(index) {
    let label = this.labels[index];
    if (!label) {
      label = makeLabelText();
      this.labels[index] = label;
      this.labelLayer.addChild(label);
    }
    return label;
  }

  clearOverlay() {
    this.graphics.clear();
    for (const label of this.labels) label.visible = false;
    this.visible = false;
    this.lastSnapshot = {
      enabled: false,
      itemCount: 0,
      labels: [],
    };
  }

  update(options = {}) {
    if (!options.enabled) {
      this.clearOverlay();
      return this.lastSnapshot;
    }
    const runtime = options.runtime;
    const report = options.report || runtime?.debugSnapshot?.({ includeTargets: true });
    const items = buildMotionOverlayItems(report, {
      enabled: true,
      maxItems: options.maxItems ?? this.maxItems,
      resolveTarget: (targetId, context) => runtime?.resolveDebugTarget?.(targetId, { ...context, bounds: true }) || null,
    });
    this.draw(items, options);
    this.visible = items.length > 0;
    this.lastSnapshot = {
      enabled: true,
      itemCount: items.length,
      labels: items.map((item) => makeBadgeText(item)),
    };
    return this.lastSnapshot;
  }

  draw(items = [], options = {}) {
    const stageWidth = readPositiveNumber(options.stageWidth, 0);
    const graphics = this.graphics;
    graphics.clear();
    items.forEach((item, index) => {
      const rect = item.rect;
      const color = item.color;
      graphics
        .rect(rect.left, rect.top, rect.width, rect.height)
        .stroke({ alpha: 0.95, color, width: item.hasWarning ? 3 : 2 });

      if (item.vector) {
        graphics
          .moveTo(item.vector.from.x, item.vector.from.y)
          .lineTo(item.vector.to.x, item.vector.to.y)
          .stroke({ alpha: 0.85, color: OVERLAY_TARGET_COLOR, width: 1 });
        graphics
          .circle(item.vector.to.x, item.vector.to.y, 3)
          .fill({ alpha: 0.9, color: OVERLAY_TARGET_COLOR });
      }

      const badge = makeBadgeText(item);
      const labelWidth = Math.min(220, Math.max(54, badge.length * 5.8 + 10));
      const labelX = clampLabelPosition(rect.left, stageWidth || rect.left + labelWidth);
      const labelY = Math.max(0, rect.top - LABEL_HEIGHT - 2);
      graphics
        .roundRect(labelX, labelY, labelWidth, LABEL_HEIGHT, 4)
        .fill({ alpha: 0.88, color });
      const label = this.getLabel(index);
      if (label.text !== badge) label.text = badge;
      label.visible = true;
      label.position.set(labelX + 5, labelY + 2);
    });
    for (let index = items.length; index < this.labels.length; index += 1) {
      this.labels[index].visible = false;
    }
  }

  debugSnapshot() {
    return { ...this.lastSnapshot, labels: [...this.lastSnapshot.labels] };
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
