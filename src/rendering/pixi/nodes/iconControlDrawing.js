import { reloadOnPixiHotUpdate } from "../devHmr.js";

export function getMissingBadgeLayout(iconSize) {
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

export function drawMissingBadge(badge, background, textNode, iconSize, status) {
  badge.visible = false;
  background.clear();
  if (!status || status !== "missing") return;

  const layout = getMissingBadgeLayout(iconSize);
  badge.visible = true;
  badge.position.set(layout.x, layout.y);
  background
    .circle(0, 0, layout.radius)
    .fill({ color: 0xb84a54, alpha: 1 })
    .stroke({ color: 0xffffff, alpha: 0.92, width: Math.max(1, layout.radius * 0.18) });
  textNode.text = "!";
  textNode.style.fontSize = layout.fontSize;
  textNode.style.lineHeight = layout.fontSize;
  textNode.position.set(0, layout.textOffsetY);
}

export function drawEditButton(button, x, y, label, visible) {
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
