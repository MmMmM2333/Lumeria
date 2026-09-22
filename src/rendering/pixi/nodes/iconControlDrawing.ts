import { reloadOnPixiHotUpdate } from "../devHmr.js";
import type { Container, Graphics, Text } from "pixi.js";

export interface MissingBadgeLayout {
  edgeOffset: number;
  fontSize: number;
  radius: number;
  textOffsetY: number;
  x: number;
  y: number;
}

export interface BatchSelectionCheckOptions {
  alpha?: number;
  color?: number;
}

export type EditButton = Container & Readonly<{
  background: Graphics;
  textNode: Text;
}>;

export function getMissingBadgeLayout(iconSize: number): MissingBadgeLayout {
  const radius = Math.max(8, Math.min(12, iconSize * 0.18));
  const edgeOffset = Math.max(2, radius * 0.36);
  const fontSize = Math.max(10, Math.round(radius * 1.35));
  return {
    edgeOffset,
    fontSize,
    radius,
    textOffsetY: -Math.max(0.5, radius * 0.06),
    x: iconSize / 2 - edgeOffset,
    y: iconSize / 2 - edgeOffset,
  };
}

export function drawMissingBadge(
  badge: Container,
  background: Graphics,
  textNode: Text,
  iconSize: number,
  status: string | null | undefined,
  spec?: import("../../../domain/iconBadge.js").IconBadge | null,
): void {
  badge.visible = false;
  background.clear();
  textNode.visible = true;
  if (spec) {
    badge.position.set(0,0);
    badge.visible = spec.admin || spec.missing !== "none";
    textNode.visible = spec.missing === "question";
    if (spec.missing === "question") {
      textNode.text="?";textNode.style.fontSize=iconSize*0.85;textNode.style.lineHeight=iconSize;
      textNode.style.fill=0xffffff;textNode.style.stroke={color:0x263238,width:Math.max(1,iconSize*0.025)};
      textNode.alpha=0.8;textNode.position.set(0,0);
    } else if (spec.missing === "prohibited") {
      background.circle(0,0,iconSize*0.46).fill({color:0xffffff,alpha:0.25});
      const r=iconSize*0.29,w=iconSize*0.075,d=r*0.707;
      for(const [color,width,alpha] of [[0x263238,w+2,0.35],[0xffffff,w,0.78]] as const){
        background.circle(0,0,r).moveTo(-d,-d).lineTo(d,d).stroke({color,width,alpha,cap:"round"});
      }
    }
    if (spec.admin) {
      const s=iconSize*0.28,x=iconSize*0.5-s*0.6,y=iconSize*0.5-s*0.6;
      background.poly([x-s/2,y-s/2,x+s/2,y-s/2,x+s/2,y+s*0.08,x+s*0.3,y+s*0.37,x,y+s*0.6,x-s*0.3,y+s*0.37,x-s/2,y+s*0.08]).fill(0x1672bd).stroke({color:0xffffff,width:Math.max(1,s*0.07)});
      background.rect(x,y-s/2,s/2,s/2).fill(0xffd74b);
      background.poly([x-s/2,y,x,y,x,y+s*0.6,x-s*0.3,y+s*0.37,x-s/2,y+s*0.08]).fill(0xffd74b);
    }
    return;
  }
  textNode.alpha=1;
  if (!status || status !== "missing") return;

  const layout = getMissingBadgeLayout(iconSize);
  badge.visible = true;
  badge.position.set(layout.x, layout.y);
  background
    .circle(0, 0, layout.radius)
    .fill({ color: 0xb84a54, alpha: 1 })
    .stroke({ color: 0xffffff, alpha: 0.92, width: Math.max(1, layout.radius * 0.18) });
  textNode.text = "?";
  textNode.style.fontSize = layout.fontSize;
  textNode.style.lineHeight = layout.fontSize;
  textNode.position.set(0, layout.textOffsetY);
}

export function drawBatchSelectionCheck(
  graphics: Graphics,
  size: number,
  options: BatchSelectionCheckOptions = {},
): void {
  graphics.clear();
  const safeSize = Math.max(1, Number(size) || 1);
  const strokeWidth = Math.max(1.6, safeSize * 0.1);
  const color = options.color ?? 0xffffff;
  const alpha = options.alpha ?? 1;
  graphics
    .moveTo(-safeSize * 0.19, -safeSize * 0.01)
    .lineTo(-safeSize * 0.03, safeSize * 0.17)
    .lineTo(safeSize * 0.24, -safeSize * 0.19)
    .stroke({ alpha, color, width: strokeWidth, cap: "round", join: "round" });
}

export function drawEditButton(
  button: EditButton,
  x: number,
  y: number,
  label: string,
  visible: boolean,
): void {
  button.visible = Boolean(visible);
  if (!visible) return;
  button.position.set(x, y);
  button.background.clear()
    .circle(0, 0, 11)
    .fill({ color: 0x111827, alpha: 0.84 })
    .stroke({ color: 0xffffff, alpha: 0.7, width: 1 });
  button.textNode.text = label;
  button.textNode.style.fontSize = label === "×" ? 17 : 13;
}

reloadOnPixiHotUpdate(import.meta.hot);
