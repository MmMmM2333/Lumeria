import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";
import { mapLocalRectToStageRect } from "../geometry/stageCoordinates.js";
import { getFolderPreviewSlots } from "../../../domain/launchpadLayout.js";

function safeName(value) {
  const text = String(value || "");
  return text.length > 28 ? `${text.slice(0, 26)}...` : text;
}

function fitSingleLineName(value, fontSize, maxWidth) {
  const text = safeName(value);
  const maxChars = Math.max(4, Math.floor(maxWidth / Math.max(1, fontSize * 0.58)));
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 3))}...` : text;
}

function makeLabelText(fontSize = 13) {
  return new Text({
    text: "",
    style: {
      align: "center",
      fill: 0xffffff,
      fontFamily: "Inter, Segoe UI, sans-serif",
      fontSize,
      fontWeight: "520",
      lineHeight: Math.round(fontSize * 1.22),
      wordWrap: true,
      wordWrapWidth: 160,
    },
  });
}

function makeEditButton() {
  const button = new Container();
  button.background = new Graphics();
  button.textNode = new Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 13, fontWeight: "700" },
  });
  button.textNode.anchor.set(0.5);
  button.addChild(button.background);
  button.addChild(button.textNode);
  return button;
}

function setCentered(displayObject, x, y) {
  displayObject.anchor?.set?.(0.5);
  displayObject.position.set(x, y);
}

export class IconNode extends Container {
  constructor(options = {}) {
    super();
    this.item = null;
    this.source = null;
    this.iconSize = 64;
    this.jiggleKey = null;
    this.stageHeight = 1;
    this.stageWidth = 1;
    this.textless = false;
    this.isFolder = false;
    this.clickIntent = null;
    this.onAction = options.onAction || (() => {});

    this.selectionFrame = new Graphics();
    this.jiggleWrap = new Container();
    this.visualWrap = new Container();
    this.folderThumb = new Graphics();
    this.iconSprite = new Sprite();
    this.emojiText = new Text({
      text: "",
      style: { align: "center", fill: 0xffffff, fontSize: 64, lineHeight: 64 },
    });
    this.labelText = makeLabelText();
    this.missingBadge = new Container();
    this.missingBadgeBackground = new Graphics();
    this.missingBadgeText = new Text({
      text: "!",
      style: {
        align: "center",
        fill: 0xffffff,
        fontFamily: "Inter, Segoe UI, sans-serif",
        fontSize: 12,
        fontWeight: "800",
        lineHeight: 12,
      },
    });
    this.removeButton = makeEditButton();
    this.changeButton = makeEditButton();
    this.resetButton = makeEditButton();
    this.folderChildNodes = [];

    this.iconSprite.anchor.set(0.5);
    this.emojiText.anchor.set(0.5);
    this.missingBadge.visible = false;
    this.missingBadgeText.anchor.set(0.5);
    this.missingBadge.addChild(this.missingBadgeBackground);
    this.missingBadge.addChild(this.missingBadgeText);
    this.addChild(this.selectionFrame);
    this.addChild(this.jiggleWrap);
    this.jiggleWrap.addChild(this.visualWrap);
    this.visualWrap.addChild(this.folderThumb);
    this.visualWrap.addChild(this.iconSprite);
    this.visualWrap.addChild(this.emojiText);
    this.visualWrap.addChild(this.missingBadge);
    this.visualWrap.addChild(this.removeButton);
    this.visualWrap.addChild(this.changeButton);
    this.visualWrap.addChild(this.resetButton);
    this.jiggleWrap.addChild(this.labelText);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", (event) => this.handlePointerDown(event));
    this.on("pointerup", (event) => this.handlePointerUp(event));
    this.on("pointerupoutside", () => this.cancelClickIntent());
    this.on("rightdown", (event) => this.handleContextMenu(event));
  }

  setState(state) {
    state = { draggable: true, ...state };
    this.item = state.item;
    this.source = state.source;
    this.iconSize = state.iconSize || 64;
    this.stageHeight = Math.max(1, Number(state.stageHeight) || this.stageHeight || 1);
    this.stageWidth = Math.max(1, Number(state.stageWidth) || this.stageWidth || 1);
    this.textless = Boolean(state.textless);
    this.isFolder = state.item?.type === "folder";
    this.state = state;
    this.hitArea = new Rectangle(-state.cellWidth / 2, -state.cellHeight / 2, state.cellWidth, state.cellHeight);
    this.eventMode = state.interactive === false ? "none" : "static";
    this.cursor = state.interactive === false ? "default" : "pointer";
    this.visible = !state.dragging && !state.ghosted;
    this.alpha = state.opening ? 0 : 1;
    this.scale.set(state.opening ? 1.08 : 1);
    this.renderFrame(state);
    this.renderVisual(state);
    this.renderLabel(state);
    this.renderEditButtons(state);
    this.updateJiggle(state);
  }

  getIconBounds(stageRect) {
    return this.getVisualBounds(this.visualWrap, stageRect, this.iconSize);
  }

  getFolderPreviewChildBounds(stageRect, slotIndex) {
    const node = this.folderChildNodes[slotIndex];
    if (!node) return null;
    const size = Math.max(8, this.iconSize * 0.25);
    return this.getVisualBounds(node, stageRect, size);
  }

  getVisualBounds(node, stageRect, size) {
    const halfSize = size / 2;
    const matrix = node.getGlobalTransform?.();
    if (!matrix?.apply) {
      const global = node.getGlobalPosition();
      return mapLocalRectToStageRect(stageRect, this.stageWidth, this.stageHeight, {
        left: global.x - halfSize,
        top: global.y - halfSize,
        width: size,
        height: size,
      });
    }
    const points = [
      matrix.apply({ x: -halfSize, y: -halfSize }),
      matrix.apply({ x: halfSize, y: -halfSize }),
      matrix.apply({ x: -halfSize, y: halfSize }),
      matrix.apply({ x: halfSize, y: halfSize }),
    ];
    const left = Math.min(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const right = Math.max(...points.map((point) => point.x));
    const bottom = Math.max(...points.map((point) => point.y));
    return mapLocalRectToStageRect(stageRect, this.stageWidth, this.stageHeight, {
      left,
      top,
      width: right - left,
      height: bottom - top,
    });
  }

  handlePointerDown(event) {
    const original = event?.nativeEvent || event;
    if (original?.button === 2) {
      this.handleContextMenu(event);
      return;
    }
    const action = this.getEditActionAt(event);
    if (action) {
      this.onAction(action, original, this.item, this.source, this);
      return;
    }
    if (!this.state?.draggable) {
      this.clickIntent = this.item?.type === "app"
        ? { x: original.clientX ?? 0, y: original.clientY ?? 0, pointerId: original.pointerId }
        : null;
      original?.preventDefault?.();
      return;
    }
    this.onAction("pointerdown", original, this.item, this.source, this);
  }

  handlePointerUp(event) {
    if (this.state?.draggable || !this.clickIntent || this.item?.type !== "app") {
      this.cancelClickIntent();
      return;
    }
    const original = event?.nativeEvent || event;
    if (this.clickIntent.pointerId != null && original?.pointerId != null && this.clickIntent.pointerId !== original.pointerId) return;
    const distance = Math.hypot((original.clientX ?? 0) - this.clickIntent.x, (original.clientY ?? 0) - this.clickIntent.y);
    this.cancelClickIntent();
    if (distance > 8) return;
    original?.preventDefault?.();
    this.onAction("open", original, this.item, this.source, this);
  }

  cancelClickIntent() {
    this.clickIntent = null;
  }

  handleContextMenu(event) {
    const original = event?.nativeEvent || event;
    if (this.item?.type !== "app") return;
    this.onAction("context-menu", original, this.item, this.source, this);
  }

  getEditActionAt(event) {
    if (!this.state?.editing || this.item?.type !== "app") return null;
    const point = event.getLocalPosition?.(this.visualWrap);
    if (!point) return null;
    if (this.isInsideButton(point, this.removeButton) && this.state.removable) return "remove";
    if (this.isInsideButton(point, this.changeButton)) return "choose-icon";
    if (this.isInsideButton(point, this.resetButton) && this.state.hasCustomIcon) return "reset-icon";
    return null;
  }

  isInsideButton(point, button) {
    if (!button.visible) return false;
    const x = point.x - button.x;
    const y = point.y - button.y;
    return Math.hypot(x, y) <= 12;
  }

  renderFrame(state) {
    const width = Math.max(this.iconSize + 44, state.cellWidth * 0.62);
    const height = this.textless ? this.iconSize + 18 : this.iconSize + 48;
    const top = -height / 2 + 4;
    this.selectionFrame.clear();
    if (state.selected || state.dropTarget) {
      this.selectionFrame
        .roundRect(-width / 2, top, width, height, 18)
        .fill({ color: 0xffffff, alpha: state.dropTarget ? 0.18 : 0.1 })
        .stroke({ color: 0xffffff, alpha: state.dropTarget ? 0.9 : 0.42, width: state.dropTarget ? 2 : 1 });
    }
  }

  renderVisual(state) {
    this.visualWrap.position.set(0, this.textless ? 0 : -14);
    this.folderThumb.visible = this.isFolder;
    this.iconSprite.visible = false;
    this.emojiText.visible = false;

    if (this.isFolder) {
      this.renderFolderThumb(state);
      return;
    }

    const itemId = this.item?.id;
    const texture = getCachedIconTexture(this.item, () => {
      if (this.destroyed || this.item?.id !== itemId || !this.state) return;
      this.renderVisual(this.state);
    });
    if (texture) {
      this.iconSprite.visible = true;
      this.iconSprite.texture = texture;
      this.iconSprite.width = this.iconSize;
      this.iconSprite.height = this.iconSize;
    } else {
      this.emojiText.visible = true;
      this.emojiText.text = this.item?.emoji || "◼";
      this.emojiText.style.fontSize = this.iconSize;
      this.emojiText.style.lineHeight = this.iconSize;
    }
    this.renderMissingBadge(state);
  }

  updateJiggle(state) {
    const shouldJiggle = Boolean(state.editing && !state.dragging && !state.ghosted);
    const seed = Math.max(0, Number(state.jiggleSeed) || 0);
    const nextKey = shouldJiggle ? `jiggle-${seed}` : null;
    if (this.jiggleKey === nextKey) return;

    this.stopJiggle();
    this.jiggleKey = nextKey;
    if (!shouldJiggle) return;

    const direction = seed % 2 === 0 ? 1 : -1;
    const duration = seed % 3 === 0 ? 0.17 : 0.15;
    this.jiggleWrap.rotation = -direction * 0.032;
    this.jiggleWrap.y = -direction;
    gsap.to(this.jiggleWrap, {
      delay: (seed % 5) * 0.018,
      duration,
      ease: "sine.inOut",
      repeat: -1,
      rotation: direction * 0.032,
      y: direction,
      yoyo: true,
    });
  }

  stopJiggle() {
    gsap.killTweensOf(this.jiggleWrap);
    this.jiggleWrap.rotation = 0;
    this.jiggleWrap.y = 0;
    this.jiggleKey = null;
  }

  renderFolderThumb(state) {
    const size = this.iconSize;
    const radius = Math.max(14, size * 0.26);
    this.folderThumb.clear()
      .roundRect(-size / 2, -size / 2, size, size, radius)
      .fill({ color: 0xffffff, alpha: 0.22 })
      .stroke({ color: 0xffffff, alpha: 0.26, width: 1 });

    while (this.folderChildNodes.length < 9) {
      const childContainer = new Container();
      const childSprite = new Sprite();
      const childEmoji = new Text({ text: "", style: { fill: 0xffffff, fontSize: 14 } });
      childSprite.anchor.set(0.5);
      childEmoji.anchor.set(0.5);
      childContainer.addChild(childSprite);
      childContainer.addChild(childEmoji);
      this.folderChildNodes.push(childContainer);
      this.visualWrap.addChild(childContainer);
    }

    const slots = getFolderPreviewSlots(this.item, state.folderPreviewPageSize);
    const childSize = Math.max(8, size * 0.25);
    const gap = Math.max(2, size * 0.045);
    const start = -((childSize * 3 + gap * 2) / 2) + childSize / 2;
    for (let index = 0; index < 9; index += 1) {
      const child = slots[index];
      const node = this.folderChildNodes[index];
      const childSprite = node.children[0];
      const childEmoji = node.children[1];
      const col = index % 3;
      const row = Math.floor(index / 3);
      node.position.set(start + col * (childSize + gap), start + row * (childSize + gap));
      node.visible = Boolean(child);
      if (!child) continue;
      const childId = child.id;
      const texture = getCachedIconTexture(child, () => {
        if (this.destroyed || !this.state || this.item?.type !== "folder") return;
        const slots = getFolderPreviewSlots(this.item, this.state.folderPreviewPageSize);
        if (!slots.some((slot) => slot?.id === childId)) return;
        this.renderFolderThumb(this.state);
      });
      childSprite.visible = Boolean(texture);
      childEmoji.visible = !texture;
      if (texture) {
        childSprite.texture = texture;
        childSprite.width = childSize;
        childSprite.height = childSize;
      } else {
        childEmoji.text = child.emoji || "◼";
        childEmoji.style.fontSize = childSize;
      }
    }
    this.renderMissingBadge({ ...state, launchTargetStatus: null });
  }

  renderMissingBadge(state) {
    this.missingBadge.visible = false;
    this.missingBadgeBackground.clear();
    if (!state.launchTargetStatus || state.launchTargetStatus !== "missing") return;

    const radius = Math.max(8, Math.min(12, this.iconSize * 0.18));
    const edgeOffset = Math.max(2, radius * 0.36);
    const fontSize = Math.max(10, Math.round(radius * 1.35));
    this.missingBadge.visible = true;
    this.missingBadge.position.set(this.iconSize / 2 - edgeOffset, this.iconSize / 2 - edgeOffset);
    this.missingBadgeBackground
      .circle(0, 0, radius)
      .fill({ color: 0xb84a54, alpha: 1 })
      .stroke({ color: 0xffffff, alpha: 0.92, width: Math.max(1, radius * 0.18) });
    this.missingBadgeText.text = "!";
    this.missingBadgeText.style.fontSize = fontSize;
    this.missingBadgeText.style.lineHeight = fontSize;
    this.missingBadgeText.position.set(0, -Math.max(0.5, radius * 0.06));
  }

  renderLabel(state) {
    this.labelText.visible = !this.textless;
    if (!this.labelText.visible) return;
    const fontSize = state.compact ? 12 : 13;
    const singleLine = Boolean(state.singleLineLabel);
    this.labelText.text = singleLine
      ? fitSingleLineName(this.item?.name, fontSize, Math.max(56, state.cellWidth * 0.9))
      : safeName(this.item?.name);
    this.labelText.style.fontSize = fontSize;
    this.labelText.style.lineHeight = Math.round(fontSize * 1.22);
    this.labelText.style.wordWrap = !singleLine;
    this.labelText.style.wordWrapWidth = Math.max(72, Math.min(160, state.cellWidth * 0.84));
    this.labelText.anchor.set(0.5, 0);
    this.labelText.position.set(0, this.iconSize / 2 + 8 + (this.textless ? 0 : -14));
  }

  renderEditButtons(state) {
    this.drawEditButton(this.removeButton, -this.iconSize / 2 + 2, -this.iconSize / 2 + 2, "×", state.editing && state.removable && this.item?.type === "app");
    this.drawEditButton(this.changeButton, this.iconSize / 2 - 2, -this.iconSize / 2 + 2, "+", state.editing && this.item?.type === "app");
    this.drawEditButton(this.resetButton, this.iconSize / 2 - 2, this.iconSize / 2 - 2, "↺", state.editing && state.hasCustomIcon && this.item?.type === "app");
  }

  drawEditButton(button, x, y, label, visible) {
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

  destroy(options) {
    this.stopJiggle();
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
