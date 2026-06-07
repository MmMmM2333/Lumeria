import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";
import {
  getCenteredLocalRect,
  mapDisplayObjectLocalRectToStageRect,
} from "../geometry/displayObjectBounds.js";
import { getIconLabelLocalY, getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import {
  drawEditButton as drawEditButtonGraphic,
  drawMissingBadge,
} from "./iconControlDrawing.js";
import {
  drawAppFolderCreateBackdrop as drawAppFolderCreateBackdropGraphic,
  drawAppFolderCreateFlashOverlay as drawAppFolderCreateFlashOverlayGraphic,
  drawFolderFlashOverlay as drawFolderFlashOverlayGraphic,
  drawFolderPreviewMask as drawFolderPreviewMaskGraphic,
  drawFolderThumbFrame as drawFolderThumbFrameGraphic,
} from "./folderThumbDrawing.js";
import { getFolderThumbMetrics } from "./folderThumbMetrics.js";
import { getFolderPreviewMotionPlan } from "./folderThumbPreviewMotion.js";
import {
  getActiveAppFolderCreateHoverState as getActiveAppFolderCreateHoverStateForIcon,
  getActiveFolderHoverState as getActiveFolderHoverStateForIcon,
  getAppFolderCreateTargetPadding as getAppFolderCreateTargetPaddingForIcon,
  getFolderHoverTargetPadding as getFolderHoverTargetPaddingForIcon,
  getFolderPreviewPlanKey,
} from "./iconFolderHoverState.js";
import { fitSingleLineName, fitWrappedName } from "./iconLabelLayout.js";
import {
  drawSelectionFrame,
  getSelectionFrameRect as getSelectionFrameRectForIcon,
} from "./iconSelectionFrame.js";
import {
  getEditButtonActionAt,
  getIconHitAreaRect,
} from "./iconInteractionGeometry.js";

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

const PRESSED_VISUAL_ALPHA = 0.58;
const FOLDER_HOVER_FRAME_DURATION = 0.18;
const FOLDER_HOVER_RESET_DURATION = 0.16;
const FOLDER_THUMB_SCROLL_DURATION = 0.46;
const APP_FOLDER_CREATE_DIM_ALPHA = 0.48;
const APP_FOLDER_CREATE_DIM_DURATION = 0.12;
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
    return mapDisplayObjectLocalRectToStageRect({
      allowGlobalFallback: true,
      node,
      rect: getCenteredLocalRect(size),
      stageHeight: this.stageHeight,
      stageRect,
      stageWidth: this.stageWidth,
    });
  }

  getLocalVisualBounds(node, stageRect, rect) {
    return mapDisplayObjectLocalRectToStageRect({
      node,
      rect,
      stageHeight: this.stageHeight,
      stageRect,
      stageWidth: this.stageWidth,
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
    return getEditButtonActionAt(point, {
      changeButton: this.changeButton,
      editing: this.state.editing,
      hasCustomIcon: this.state.hasCustomIcon,
      itemType: this.item?.type,
      removable: this.state.removable,
      removeButton: this.removeButton,
      resetButton: this.resetButton,
    });
  }

  getVisualOffsetY() {
    return getIconVisualOffsetY(this.textless);
  }

  updateHitArea(state) {
    const rect = getIconHitAreaRect({
      editing: state.editing,
      iconSize: this.iconSize,
      itemType: this.item?.type,
      visualOffsetY: this.getVisualOffsetY(),
    });
    this.hitArea = new Rectangle(
      rect.left,
      rect.top,
      rect.width,
      rect.height
    );
  }

  getSelectionFrameRect() {
    return getSelectionFrameRectForIcon({
      iconSize: this.iconSize,
      labelText: this.labelText,
      visualOffsetY: this.getVisualOffsetY(),
    });
  }

  renderFrame(state) {
    const rect = this.getSelectionFrameRect();
    const isFolderDropHover = Boolean(this.isFolder && state.folderHoverState?.targetId === this.item?.id);
    const isAppFolderCreateHover = Boolean(!this.isFolder && state.folderHoverState?.targetId === this.item?.id && state.folderHoverState?.targetType === "app");
    drawSelectionFrame(this.selectionFrame, rect, this.iconSize, {
      dropTarget: state.dropTarget,
      isAppFolderCreateHover,
      isFolderDropHover,
      selected: state.selected,
    });
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
    return getFolderHoverTargetPaddingForIcon(this.iconSize);
  }

  getFolderHoverPadding() {
    return Math.max(0, Number(this.folderHoverFrame?.padding) || 0);
  }

  drawFolderThumbFrame(size, thumb) {
    drawFolderThumbFrameGraphic(this.folderThumb, size, thumb, this.getFolderHoverPadding());
  }

  drawFolderPreviewMask(thumb) {
    drawFolderPreviewMaskGraphic(this.folderPreviewMask, this.iconSize, thumb);
  }

  drawFolderFlashOverlay(size, thumb) {
    drawFolderFlashOverlayGraphic(this.folderFlashOverlay, size, thumb, this.getFolderHoverPadding());
  }

  redrawFolderHoverFrame() {
    if (!this.isFolder) return;
    const size = this.iconSize;
    const thumb = getFolderThumbMetrics(size);
    this.drawFolderThumbFrame(size, thumb);
    this.drawFolderFlashOverlay(size, thumb);
  }

  getActiveFolderHoverState(state) {
    return getActiveFolderHoverStateForIcon({
      hoverState: state.folderHoverState,
      isFolder: this.isFolder,
      itemId: this.item?.id,
    });
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

    const planKey = getFolderPreviewPlanKey(hoverState, plan);
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
    return getActiveAppFolderCreateHoverStateForIcon({
      hoverState: state.folderHoverState,
      isFolder: this.isFolder,
      itemId: this.item?.id,
      itemType: this.item?.type,
    });
  }

  getAppFolderCreateTargetPadding() {
    return getAppFolderCreateTargetPaddingForIcon(this.iconSize);
  }

  drawAppFolderCreateBackdrop() {
    drawAppFolderCreateBackdropGraphic(this.folderCreateBackdrop, this.iconSize, this.appFolderCreateFrame);
  }

  drawAppFolderCreateFlashOverlay() {
    drawAppFolderCreateFlashOverlayGraphic(this.folderCreateFlashOverlay, this.iconSize, this.appFolderCreateFrame);
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
    drawMissingBadge(this.missingBadge, this.missingBadgeBackground, this.missingBadgeText, this.iconSize, state.launchTargetStatus);
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
    this.labelText.position.set(0, getIconLabelLocalY(this.iconSize, this.textless));
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
    drawEditButtonGraphic(button, x, y, label, visible);
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
