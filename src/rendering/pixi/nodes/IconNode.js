import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";
import { mapLocalRectToStageRect } from "../geometry/stageCoordinates.js";
import { getFolderThumbMetrics } from "./folderThumbMetrics.js";
import { getFolderPreviewMotionPlan } from "./folderThumbPreviewMotion.js";

function plainName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function fitSingleLineName(value, fontSize, maxWidth) {
  return truncateNameToWidth(plainName(value), fontSize, maxWidth);
}

function estimateLabelWidth(text, fontSize) {
  return Array.from(String(text || "")).reduce((width, char) => {
    if (/\s/.test(char)) return width + fontSize * 0.34;
    if (/[\u4e00-\u9fff]/.test(char)) return width + fontSize;
    if (/[ilI.,'`|!]/.test(char)) return width + fontSize * 0.36;
    if (/[MW@#%&]/.test(char)) return width + fontSize * 0.82;
    return width + fontSize * 0.58;
  }, 0);
}

function truncateNameToWidth(text, fontSize, maxWidth) {
  const value = String(text || "");
  if (!value || estimateLabelWidth(value, fontSize) <= maxWidth) return value;
  const ellipsis = "...";
  let result = "";
  for (const char of Array.from(value)) {
    const next = `${result}${char}`;
    if (estimateLabelWidth(`${next}${ellipsis}`, fontSize) > maxWidth) break;
    result = next;
  }
  return `${result.trimEnd() || Array.from(value)[0] || ""}${ellipsis}`;
}

function splitLabelLine(text, fontSize, maxWidth) {
  const value = String(text || "");
  if (estimateLabelWidth(value, fontSize) <= maxWidth) return [value, ""];

  const chars = Array.from(value);
  let breakAt = 0;
  let lastSoftBreak = -1;
  for (let index = 0; index < chars.length; index += 1) {
    const candidate = chars.slice(0, index + 1).join("");
    if (estimateLabelWidth(candidate, fontSize) > maxWidth) break;
    breakAt = index + 1;
    if (/[\s\-_/()]/.test(chars[index])) lastSoftBreak = index + 1;
  }

  const splitAt = lastSoftBreak > 1 ? lastSoftBreak : Math.max(1, breakAt);
  return [
    chars.slice(0, splitAt).join("").trimEnd(),
    chars.slice(splitAt).join("").trimStart(),
  ];
}

function fitWrappedName(value, fontSize, maxWidth) {
  let rest = plainName(value);
  const lines = [];
  while (rest && lines.length < 2) {
    if (lines.length === 1) {
      lines.push(truncateNameToWidth(rest, fontSize, maxWidth));
      break;
    }
    const [line, next] = splitLabelLine(rest, fontSize, maxWidth);
    lines.push(line);
    rest = next;
  }
  return lines.join("\n");
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

const EDIT_BUTTON_HIT_PADDING = 12;
const SELECTION_FRAME_MIN_PADDING_X = 12;
const SELECTION_FRAME_PADDING_TOP = 10;
const SELECTION_FRAME_PADDING_BOTTOM = 8;
const PRESSED_VISUAL_ALPHA = 0.58;
const FOLDER_HOVER_PADDING_RATIO = 0.16;
const FOLDER_HOVER_PADDING_MIN = 6;
const FOLDER_HOVER_PADDING_MAX = 14;
const FOLDER_HOVER_FRAME_DURATION = 0.18;
const FOLDER_HOVER_RESET_DURATION = 0.16;
const FOLDER_THUMB_SCROLL_DURATION = 0.46;
const APP_FOLDER_CREATE_DIM_ALPHA = 0.48;
const APP_FOLDER_CREATE_DIM_DURATION = 0.12;
const APP_FOLDER_CREATE_PADDING_RATIO = 0.18;
const APP_FOLDER_CREATE_PADDING_MIN = 8;
const APP_FOLDER_CREATE_PADDING_MAX = 16;
const APP_FOLDER_CREATE_FRAME_DURATION = 0.16;

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
    this.pressedPointerId = null;
    this.onAction = options.onAction || (() => {});

    this.selectionFrame = new Graphics();
    this.jiggleWrap = new Container();
    this.visualWrap = new Container();
    this.folderThumb = new Graphics();
    this.folderPreviewMask = new Graphics();
    this.folderChildrenWrap = new Container();
    this.folderFlashOverlay = new Graphics();
    this.folderCreateBackdrop = new Graphics();
    this.folderCreateFlashOverlay = new Graphics();
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
    this.folderHoverActive = false;
    this.folderHoverKey = null;
    this.folderHoverPhase = null;
    this.folderHoverFrame = { padding: 0 };
    this.folderPreviewPlanKey = null;
    this.appFolderCreateActive = false;
    this.appFolderCreateKey = null;
    this.appFolderCreatePhase = null;
    this.appFolderCreateFrame = { alpha: 0, padding: 0 };

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
    this.visualWrap.addChild(this.folderPreviewMask);
    this.visualWrap.addChild(this.folderChildrenWrap);
    this.visualWrap.addChild(this.folderFlashOverlay);
    this.visualWrap.addChild(this.folderCreateBackdrop);
    this.visualWrap.addChild(this.folderCreateFlashOverlay);
    this.visualWrap.addChild(this.iconSprite);
    this.visualWrap.addChild(this.emojiText);
    this.visualWrap.addChild(this.missingBadge);
    this.visualWrap.addChild(this.removeButton);
    this.visualWrap.addChild(this.changeButton);
    this.visualWrap.addChild(this.resetButton);
    this.folderChildrenWrap.mask = this.folderPreviewMask;
    this.folderFlashOverlay.visible = false;
    this.folderCreateBackdrop.visible = false;
    this.folderCreateFlashOverlay.visible = false;
    this.jiggleWrap.addChild(this.labelText);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", (event) => this.handlePointerDown(event));
    this.on("pointerup", (event) => this.handlePointerUp(event));
    this.on("pointerupoutside", () => this.cancelPressAndClickIntent());
    this.on("pointercancel", () => this.cancelPressAndClickIntent());
    this.on("rightdown", (event) => this.handleContextMenu(event));
  }

  setState(state) {
    state = { draggable: true, ...state };
    const wasGhosted = Boolean(this.state?.ghosted);
    this.item = state.item;
    this.source = state.source;
    this.iconSize = state.iconSize || 64;
    this.stageHeight = Math.max(1, Number(state.stageHeight) || this.stageHeight || 1);
    this.stageWidth = Math.max(1, Number(state.stageWidth) || this.stageWidth || 1);
    this.textless = Boolean(state.textless);
    this.isFolder = state.item?.type === "folder";
    this.state = state;
    this.eventMode = state.interactive === false ? "none" : "static";
    this.cursor = state.interactive === false ? "default" : "pointer";
    this.visible = !state.dragging && !state.ghosted;
    this.alpha = state.opening ? 0 : 1;
    if (!state.preserveNodeScale) this.scale.set(state.opening ? 1.08 : 1);
    if (state.dragging || state.ghosted || state.opening || state.interactive === false) this.setPressed(false, { immediate: true });
    this.renderVisual(state);
    this.renderLabel(state);
    this.renderEditButtons(state);
    this.renderFrame(state);
    this.updateHitArea(state);
    this.updateJiggle(state);
    if (this.isFolder && wasGhosted && !state.ghosted && !state.dragging && !state.opening) this.revealLabelAfterGhost();
  }

  getIconBounds(stageRect) {
    return this.getVisualBounds(this.visualWrap, stageRect, this.iconSize);
  }

  getFolderThumbBounds(stageRect) {
    if (!this.isFolder) return null;
    return this.getVisualBounds(this.folderThumb, stageRect, this.iconSize);
  }

  getFolderPreviewChildBounds(stageRect, slotIndex) {
    if (!this.isFolder) return null;
    const thumb = getFolderThumbMetrics(this.iconSize);
    const col = slotIndex % 3;
    const row = Math.floor(slotIndex / 3);
    const centerX = thumb.start + col * (thumb.childSize + thumb.gap);
    const centerY = thumb.start + row * (thumb.childSize + thumb.gap);
    return this.getLocalVisualBounds(this.visualWrap, stageRect, {
      left: centerX - thumb.childSize / 2,
      top: centerY - thumb.childSize / 2,
      width: thumb.childSize,
      height: thumb.childSize,
    });
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

  getLocalVisualBounds(node, stageRect, rect) {
    const matrix = node.getGlobalTransform?.();
    if (!matrix?.apply) return null;
    const points = [
      matrix.apply({ x: rect.left, y: rect.top }),
      matrix.apply({ x: rect.left + rect.width, y: rect.top }),
      matrix.apply({ x: rect.left, y: rect.top + rect.height }),
      matrix.apply({ x: rect.left + rect.width, y: rect.top + rect.height }),
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
      event?.stopPropagation?.();
      original?.preventDefault?.();
      original?.stopPropagation?.();
      original?.stopImmediatePropagation?.();
      this.onAction(action, original, this.item, this.source, this);
      return;
    }
    this.setPressed(true, { pointerId: original?.pointerId });
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
    this.setPressed(false);
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

  cancelPressAndClickIntent() {
    this.setPressed(false);
    this.cancelClickIntent();
  }

  setPressed(pressed, options = {}) {
    const nextAlpha = pressed ? PRESSED_VISUAL_ALPHA : 1;
    if (pressed) this.pressedPointerId = options.pointerId ?? this.pressedPointerId;
    else this.pressedPointerId = null;
    gsap.killTweensOf(this.visualWrap, "alpha");
    if (options.immediate) {
      this.visualWrap.alpha = nextAlpha;
      return;
    }
    gsap.to(this.visualWrap, {
      alpha: nextAlpha,
      duration: pressed ? 0.06 : 0.14,
      ease: "power2.out",
      overwrite: "auto",
    });
  }

  handleContextMenu(event) {
    this.setPressed(false);
    const original = event?.nativeEvent || event;
    if (this.item?.type !== "app") return;
    original?.preventDefault?.();
    original?.stopPropagation?.();
    original?.stopImmediatePropagation?.();
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

  getVisualOffsetY() {
    return this.textless ? 0 : -14;
  }

  updateHitArea(state) {
    const editPadding = state.editing && this.item?.type === "app" ? EDIT_BUTTON_HIT_PADDING : 0;
    const visualOffsetY = this.getVisualOffsetY();
    this.hitArea = new Rectangle(
      -this.iconSize / 2 - editPadding,
      visualOffsetY - this.iconSize / 2 - editPadding,
      this.iconSize + editPadding * 2,
      this.iconSize + editPadding * 2
    );
  }

  getSelectionFrameRect() {
    const visualOffsetY = this.getVisualOffsetY();
    let left = -this.iconSize / 2;
    let right = this.iconSize / 2;
    let top = visualOffsetY - this.iconSize / 2;
    let bottom = visualOffsetY + this.iconSize / 2;

    if (this.labelText.visible) {
      const fallbackWidth = Number(this.labelText.style?.wordWrapWidth) || 160;
      const lineHeight = Number(this.labelText.style?.lineHeight) || 16;
      const fontSize = Number(this.labelText.style?.fontSize) || 13;
      const textLines = String(this.labelText.text || "").split("\n");
      const rawEstimatedWidth = Math.max(...textLines.map((line) => estimateLabelWidth(line, fontSize)));
      const estimatedWidth = Math.min(fallbackWidth, rawEstimatedWidth);
      const estimatedLines = Math.max(1, textLines.length);
      const labelWidth = Math.max(0, Math.min(fallbackWidth, Number(this.labelText.width) || estimatedWidth));
      const labelHeight = Math.max(0, Number(this.labelText.height) || estimatedLines * lineHeight);
      left = Math.min(left, -labelWidth / 2);
      right = Math.max(right, labelWidth / 2);
      top = Math.min(top, this.labelText.y);
      bottom = Math.max(bottom, this.labelText.y + labelHeight);
    }

    const minWidth = this.iconSize + SELECTION_FRAME_MIN_PADDING_X * 2;
    const contentWidth = right - left;
    const height = bottom - top + SELECTION_FRAME_PADDING_TOP + SELECTION_FRAME_PADDING_BOTTOM;
    const width = Math.max(height, minWidth, contentWidth + SELECTION_FRAME_MIN_PADDING_X * 2);
    return {
      height,
      left: -width / 2,
      top: top - SELECTION_FRAME_PADDING_TOP,
      width,
    };
  }

  renderFrame(state) {
    const rect = this.getSelectionFrameRect();
    const radius = Math.min(28, Math.max(18, this.iconSize * 0.32));
    const isFolderDropHover = Boolean(this.isFolder && state.folderHoverState?.targetId === this.item?.id);
    const isAppFolderCreateHover = Boolean(!this.isFolder && state.folderHoverState?.targetId === this.item?.id && state.folderHoverState?.targetType === "app");
    this.selectionFrame.clear();
    if (state.selected || (state.dropTarget && !isAppFolderCreateHover && !isFolderDropHover)) {
      const isDropTarget = Boolean(state.dropTarget && !isAppFolderCreateHover && !isFolderDropHover);
      this.selectionFrame
        .roundRect(rect.left, rect.top, rect.width, rect.height, radius)
        .fill({ color: isDropTarget ? 0xffffff : 0x000000, alpha: isDropTarget ? 0.18 : 0.3 })
        .stroke({ color: 0xffffff, alpha: isDropTarget ? 0.9 : 0.12, width: isDropTarget ? 2 : 1 });
    }
  }

  hideFolderChildren() {
    this.folderChildrenWrap.visible = false;
    this.folderPreviewMask.clear();
    this.folderFlashOverlay.clear();
    this.folderFlashOverlay.visible = false;
    this.folderHoverActive = false;
    this.folderHoverKey = null;
    this.folderHoverPhase = null;
    this.folderHoverFrame.padding = 0;
    this.folderPreviewPlanKey = null;
    this.visualWrap.scale.set(1);
    gsap.killTweensOf(this.folderHoverFrame);
    for (const node of this.folderChildNodes) node.visible = false;
  }

  renderVisual(state) {
    this.visualWrap.position.set(0, this.getVisualOffsetY());
    this.folderThumb.visible = this.isFolder;
    this.iconSprite.visible = false;
    this.emojiText.visible = false;

    if (this.isFolder) {
      this.clearAppFolderCreateHoverAnimation({ immediate: true });
      this.renderFolderThumb(state);
      return;
    }

    this.hideFolderChildren();
    const itemId = this.item?.id;
    const texture = getCachedIconTexture(this.item, () => {
      if (this.destroyed || this.item?.id !== itemId || !this.state) return;
      this.renderVisual(this.state);
    }, this);
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
    this.updateAppFolderCreateHoverAnimation(state);
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
    const thumb = getFolderThumbMetrics(size);
    const plan = getFolderPreviewMotionPlan(this.item, state.folderPreviewPageSize, thumb);
    this.drawFolderThumbFrame(size, thumb);
    this.drawFolderPreviewMask(thumb);
    this.drawFolderFlashOverlay(size, thumb);
    this.folderChildrenWrap.visible = true;

    while (this.folderChildNodes.length < Math.max(9, plan.items.length)) {
      const childContainer = new Container();
      const childSprite = new Sprite();
      const childEmoji = new Text({ text: "", style: { fill: 0xffffff, fontSize: 14 } });
      childSprite.anchor.set(0.5);
      childEmoji.anchor.set(0.5);
      childContainer.addChild(childSprite);
      childContainer.addChild(childEmoji);
      this.folderChildNodes.push(childContainer);
      this.folderChildrenWrap.addChild(childContainer);
    }

    for (let index = 0; index < this.folderChildNodes.length; index += 1) {
      const child = plan.items[index] || null;
      const node = this.folderChildNodes[index];
      const childSprite = node.children[0];
      const childEmoji = node.children[1];
      const col = index % 3;
      const row = Math.floor(index / 3);
      node.position.set(thumb.start + col * (thumb.childSize + thumb.gap), thumb.start + row * (thumb.childSize + thumb.gap));
      node.visible = Boolean(child);
      if (!child) continue;
      const childId = child.id;
      const texture = getCachedIconTexture(child, () => {
        if (this.destroyed || !this.state || this.item?.type !== "folder") return;
        const currentPlan = getFolderPreviewMotionPlan(this.item, this.state.folderPreviewPageSize, getFolderThumbMetrics(this.iconSize));
        if (!currentPlan.items.some((item) => item?.id === childId)) return;
        this.renderFolderThumb(this.state);
      }, this);
      childSprite.visible = Boolean(texture);
      childEmoji.visible = !texture;
      if (texture) {
        childSprite.texture = texture;
        childSprite.width = thumb.childSize;
        childSprite.height = thumb.childSize;
      } else {
        childEmoji.text = child.emoji || "◼";
        childEmoji.style.fontSize = thumb.childSize;
      }
    }
    this.renderMissingBadge({ ...state, launchTargetStatus: null });
    this.updateFolderHoverAnimation(state, plan);
  }

  getFolderHoverTargetPadding() {
    return Math.max(
      FOLDER_HOVER_PADDING_MIN,
      Math.min(FOLDER_HOVER_PADDING_MAX, this.iconSize * FOLDER_HOVER_PADDING_RATIO)
    );
  }

  getFolderHoverPadding() {
    return Math.max(0, Number(this.folderHoverFrame?.padding) || 0);
  }

  drawFolderThumbFrame(size, thumb) {
    const padding = this.getFolderHoverPadding();
    const frameSize = size + padding * 2;
    const radius = thumb.radius + padding * 0.72;
    this.folderThumb.clear()
      .roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, radius)
      .fill({ color: thumb.fillColor, alpha: thumb.fillAlpha })
      .stroke({ color: thumb.strokeColor, alpha: thumb.strokeAlpha, width: thumb.strokeWidth });
  }

  drawFolderPreviewMask(thumb) {
    const maskPadding = Math.max(0.5, this.iconSize * 0.01);
    const left = thumb.start - thumb.childSize / 2 - maskPadding;
    const top = thumb.start - thumb.childSize / 2 - maskPadding;
    const width = thumb.childSize * 3 + thumb.gap * 2 + maskPadding * 2;
    const height = thumb.childSize * 3 + thumb.gap * 2 + maskPadding * 2;
    this.folderPreviewMask.clear()
      .rect(left, top, width, height)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  drawFolderFlashOverlay(size, thumb) {
    const padding = this.getFolderHoverPadding();
    const frameSize = size + padding * 2;
    const radius = thumb.radius + padding * 0.72;
    this.folderFlashOverlay.clear()
      .roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, radius)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  redrawFolderHoverFrame() {
    if (!this.isFolder) return;
    const size = this.iconSize;
    const thumb = getFolderThumbMetrics(size);
    this.drawFolderThumbFrame(size, thumb);
    this.drawFolderFlashOverlay(size, thumb);
  }

  getActiveFolderHoverState(state) {
    const hoverState = state.folderHoverState;
    if (!this.isFolder || hoverState?.targetId !== this.item?.id || hoverState.targetType !== "folder") return null;
    return hoverState;
  }

  updateFolderHoverAnimation(state, plan) {
    const hoverState = this.getActiveFolderHoverState(state);
    if (!hoverState) {
      this.clearFolderHoverAnimation();
      return;
    }

    const wasActive = this.folderHoverActive;
    this.folderHoverActive = true;
    this.visualWrap.scale.set(1);
    if (!wasActive) {
      gsap.killTweensOf(this.folderHoverFrame);
      gsap.to(this.folderHoverFrame, {
        duration: FOLDER_HOVER_FRAME_DURATION,
        ease: "power3.out",
        onUpdate: () => this.redrawFolderHoverFrame(),
        overwrite: "auto",
        padding: this.getFolderHoverTargetPadding(),
      });
    }

    const planKey = `${hoverState.key}:${plan.endY}:${plan.items.map((item) => item?.id || "").join("|")}`;
    if (this.folderHoverKey !== hoverState.key || this.folderPreviewPlanKey !== planKey) {
      this.folderHoverKey = hoverState.key;
      this.folderPreviewPlanKey = planKey;
      gsap.killTweensOf(this.folderChildrenWrap);
      this.folderChildrenWrap.y = plan.startY;
      if (plan.endY !== plan.startY) {
        gsap.to(this.folderChildrenWrap, {
          duration: FOLDER_THUMB_SCROLL_DURATION,
          ease: "power2.inOut",
          overwrite: "auto",
          y: plan.endY,
        });
      }
    }

    if (this.folderHoverPhase !== hoverState.phase) {
      this.folderHoverPhase = hoverState.phase;
      if (hoverState.phase === "flash") this.playFolderFlash();
    }
  }

  playFolderFlash() {
    gsap.killTweensOf(this.folderFlashOverlay);
    this.folderFlashOverlay.visible = true;
    this.folderFlashOverlay.alpha = 0;
    gsap.timeline({ defaults: { ease: "sine.inOut" } })
      .to(this.folderFlashOverlay, { alpha: 0.42, duration: 0.135 })
      .to(this.folderFlashOverlay, { alpha: 0.02, duration: 0.135 })
      .to(this.folderFlashOverlay, { alpha: 0.36, duration: 0.135 })
      .to(this.folderFlashOverlay, {
        alpha: 0,
        duration: 0.135,
        onComplete: () => {
          this.folderFlashOverlay.visible = false;
        },
      });
  }

  clearFolderHoverAnimation() {
    if (!this.folderHoverActive && this.folderHoverKey == null && this.folderChildrenWrap.y === 0 && this.getFolderHoverPadding() === 0) return;
    this.folderHoverActive = false;
    this.folderHoverKey = null;
    this.folderHoverPhase = null;
    this.folderPreviewPlanKey = null;
    this.visualWrap.scale.set(1);
    gsap.killTweensOf(this.folderHoverFrame);
    gsap.to(this.folderHoverFrame, {
      duration: FOLDER_HOVER_RESET_DURATION,
      ease: "power3.out",
      onUpdate: () => this.redrawFolderHoverFrame(),
      overwrite: "auto",
      padding: 0,
    });
    gsap.killTweensOf(this.visualWrap.scale);
    gsap.killTweensOf(this.folderChildrenWrap);
    gsap.to(this.folderChildrenWrap, {
      duration: FOLDER_HOVER_RESET_DURATION,
      ease: "power3.out",
      overwrite: "auto",
      y: 0,
    });
    gsap.killTweensOf(this.folderFlashOverlay);
    this.folderFlashOverlay.alpha = 0;
    this.folderFlashOverlay.visible = false;
  }

  getActiveAppFolderCreateHoverState(state) {
    const hoverState = state.folderHoverState;
    if (this.isFolder || this.item?.type !== "app" || hoverState?.targetId !== this.item?.id || hoverState.targetType !== "app") return null;
    return hoverState;
  }

  getAppFolderCreateTargetPadding() {
    return Math.max(
      APP_FOLDER_CREATE_PADDING_MIN,
      Math.min(APP_FOLDER_CREATE_PADDING_MAX, this.iconSize * APP_FOLDER_CREATE_PADDING_RATIO)
    );
  }

  drawAppFolderCreateBackdrop() {
    const alpha = Math.max(0, Math.min(1, Number(this.appFolderCreateFrame.alpha) || 0));
    const padding = Math.max(0, Number(this.appFolderCreateFrame.padding) || 0);
    this.folderCreateBackdrop.clear();
    if (alpha <= 0.001) {
      this.folderCreateBackdrop.visible = false;
      return;
    }
    const thumb = getFolderThumbMetrics(this.iconSize);
    const size = this.iconSize + padding * 2;
    const radius = thumb.radius + padding * 0.72;
    this.folderCreateBackdrop.visible = true;
    this.folderCreateBackdrop
      .roundRect(-size / 2, -size / 2, size, size, radius)
      .fill({ color: thumb.fillColor, alpha: 0.3 * alpha })
      .stroke({ color: thumb.strokeColor, alpha: 0.36 * alpha, width: thumb.strokeWidth });
  }

  drawAppFolderCreateFlashOverlay() {
    const padding = Math.max(0, Number(this.appFolderCreateFrame.padding) || 0);
    const thumb = getFolderThumbMetrics(this.iconSize);
    const size = this.iconSize + padding * 2;
    const radius = thumb.radius + padding * 0.72;
    this.folderCreateFlashOverlay.clear()
      .roundRect(-size / 2, -size / 2, size, size, radius)
      .fill({ color: 0xffffff, alpha: 1 });
  }

  redrawAppFolderCreateFrame() {
    this.drawAppFolderCreateBackdrop();
    if (this.folderCreateFlashOverlay.visible) this.drawAppFolderCreateFlashOverlay();
  }

  tweenAppFolderCreateIconAlpha(alpha, options = {}) {
    gsap.killTweensOf(this.iconSprite, "alpha");
    gsap.killTweensOf(this.emojiText, "alpha");
    if (options.immediate) {
      this.iconSprite.alpha = alpha;
      this.emojiText.alpha = alpha;
      return;
    }
    gsap.to([this.iconSprite, this.emojiText], {
      alpha,
      duration: APP_FOLDER_CREATE_DIM_DURATION,
      ease: "power2.out",
      overwrite: "auto",
    });
  }

  updateAppFolderCreateHoverAnimation(state) {
    const hoverState = this.getActiveAppFolderCreateHoverState(state);
    if (!hoverState) {
      this.clearAppFolderCreateHoverAnimation();
      return;
    }

    const wasActive = this.appFolderCreateActive;
    this.appFolderCreateActive = true;
    if (!wasActive) {
      this.appFolderCreateFrame.alpha = Math.max(0, this.appFolderCreateFrame.alpha);
      gsap.killTweensOf(this.appFolderCreateFrame);
      gsap.to(this.appFolderCreateFrame, {
        alpha: 1,
        duration: APP_FOLDER_CREATE_FRAME_DURATION,
        ease: "power3.out",
        onUpdate: () => this.redrawAppFolderCreateFrame(),
        overwrite: "auto",
        padding: this.getAppFolderCreateTargetPadding(),
      });
      this.tweenAppFolderCreateIconAlpha(APP_FOLDER_CREATE_DIM_ALPHA);
    }

    if (this.appFolderCreateKey !== hoverState.key) {
      this.appFolderCreateKey = hoverState.key;
      this.appFolderCreatePhase = null;
    }

    if (this.appFolderCreatePhase !== hoverState.phase) {
      this.appFolderCreatePhase = hoverState.phase;
      if (hoverState.phase === "flash") this.playAppFolderCreateFlash();
    }
  }

  playAppFolderCreateFlash() {
    gsap.killTweensOf(this.folderCreateFlashOverlay);
    this.drawAppFolderCreateFlashOverlay();
    this.folderCreateFlashOverlay.visible = true;
    this.folderCreateFlashOverlay.alpha = 0;
    gsap.timeline({ defaults: { ease: "sine.inOut" } })
      .to(this.folderCreateFlashOverlay, { alpha: 0.42, duration: 0.135 })
      .to(this.folderCreateFlashOverlay, { alpha: 0.02, duration: 0.135 })
      .to(this.folderCreateFlashOverlay, { alpha: 0.36, duration: 0.135 })
      .to(this.folderCreateFlashOverlay, {
        alpha: 0,
        duration: 0.135,
        onComplete: () => {
          this.folderCreateFlashOverlay.visible = false;
        },
      });
  }

  clearAppFolderCreateHoverAnimation(options = {}) {
    const shouldClear = this.appFolderCreateActive ||
      this.appFolderCreateFrame.alpha > 0 ||
      this.iconSprite.alpha !== 1 ||
      this.emojiText.alpha !== 1 ||
      this.folderCreateFlashOverlay.visible;
    if (!shouldClear) return;

    this.appFolderCreateActive = false;
    this.appFolderCreateKey = null;
    this.appFolderCreatePhase = null;
    gsap.killTweensOf(this.appFolderCreateFrame);
    gsap.killTweensOf(this.folderCreateFlashOverlay);
    this.folderCreateFlashOverlay.alpha = 0;
    this.folderCreateFlashOverlay.visible = false;

    if (options.immediate) {
      this.appFolderCreateFrame.alpha = 0;
      this.appFolderCreateFrame.padding = 0;
      this.folderCreateBackdrop.clear();
      this.folderCreateBackdrop.visible = false;
      this.folderCreateFlashOverlay.clear();
      this.tweenAppFolderCreateIconAlpha(1, { immediate: true });
      return;
    }

    gsap.to(this.appFolderCreateFrame, {
      alpha: 0,
      duration: FOLDER_HOVER_RESET_DURATION,
      ease: "power3.out",
      onComplete: () => {
        this.folderCreateBackdrop.visible = false;
      },
      onUpdate: () => this.redrawAppFolderCreateFrame(),
      overwrite: "auto",
      padding: 0,
    });
    this.tweenAppFolderCreateIconAlpha(1);
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
    const wrapWidth = Math.max(72, Math.min(160, state.cellWidth * 0.84));
    this.labelText.style.fontSize = fontSize;
    this.labelText.style.lineHeight = Math.round(fontSize * 1.22);
    this.labelText.style.wordWrap = !singleLine;
    this.labelText.style.wordWrapWidth = wrapWidth;
    this.labelText.text = singleLine
      ? fitSingleLineName(this.item?.name, fontSize, Math.max(56, state.cellWidth * 0.9))
      : fitWrappedName(this.item?.name, fontSize, wrapWidth);
    this.labelText.anchor.set(0.5, 0);
    this.labelText.position.set(0, this.iconSize / 2 + 8 + (this.textless ? 0 : -14));
  }

  revealLabelAfterGhost() {
    if (!this.labelText.visible) return;
    gsap.killTweensOf(this.labelText);
    this.labelText.alpha = 0;
    gsap.to(this.labelText, {
      alpha: 1,
      duration: 0.18,
      ease: "power2.out",
    });
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
    gsap.killTweensOf(this.visualWrap);
    gsap.killTweensOf(this.visualWrap.scale);
    gsap.killTweensOf(this.folderHoverFrame);
    gsap.killTweensOf(this.folderChildrenWrap);
    gsap.killTweensOf(this.folderFlashOverlay);
    gsap.killTweensOf(this.appFolderCreateFrame);
    gsap.killTweensOf(this.folderCreateFlashOverlay);
    gsap.killTweensOf(this.iconSprite);
    gsap.killTweensOf(this.emojiText);
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
