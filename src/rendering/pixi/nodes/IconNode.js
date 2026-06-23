import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motionAdd, motionSequence, transition } from "../animation/motionTween.js";
import { getCachedIconTexture } from "../assets/iconTextureCache.js";
import {
  getCenteredLocalRect,
  mapDisplayObjectLocalRectToStageRect,
} from "../geometry/displayObjectBounds.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
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
  getPaddedFrameScale,
} from "./folderThumbDrawing.js";
import { getFolderThumbChildLocalRect, getFolderThumbMetrics } from "./folderThumbMetrics.js";
import { getFolderPreviewMotionPlan } from "./folderThumbPreviewMotion.js";
import {
  getActiveAppFolderCreateHoverState as getActiveAppFolderCreateHoverStateForIcon,
  getActiveFolderHoverState as getActiveFolderHoverStateForIcon,
  getAppFolderCreateTargetPadding as getAppFolderCreateTargetPaddingForIcon,
  getFolderHoverTargetPadding as getFolderHoverTargetPaddingForIcon,
  getFolderPreviewPlanKey,
} from "./iconFolderHoverState.js";
import { getIconLabelRenderState } from "./iconLabelLayout.js";
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

function boolSig(value) {
  return value ? "1" : "0";
}

function numberSig(value, digits = 3) {
  const number = Number(value) || 0;
  return number.toFixed(digits);
}

function setTextStyleValue(textNode, prop, value) {
  if (textNode.style?.[prop] === value) return;
  textNode.style[prop] = value;
}

function setTextValue(textNode, value) {
  const next = value == null ? "" : String(value);
  if (textNode.text !== next) textNode.text = next;
}

function setPositionValue(point, x, y) {
  if (point?.x === x && point?.y === y) return;
  point?.set?.(x, y);
}

function getIconMotionLayer(source) {
  const type = source?.type || "";
  if (type === "folder") return "folder";
  if (type === "search") return "search";
  if (String(type).includes("ghost")) return "ghost";
  return "desktop";
}

function getIconMotionKind(item, source) {
  if (String(source?.type || "").includes("ghost")) return "FolderGhost";
  if (item?.type === "folder") return "Folder";
  return "Icon";
}

function getIconMotionLabel(item, fallback = "Icon") {
  return item?.name || item?.title || item?.id || fallback;
}

const PRESSED_VISUAL_ALPHA = 0.58;
const PRESS_SCALE_IMPULSE = -0.035;
const RELEASE_SCALE_IMPULSE = 0.02;
const FOLDER_HOVER_FRAME_DURATION = 0.18;
const FOLDER_HOVER_RESET_DURATION = 0.16;
const FOLDER_HOVER_BLEND_DURATION = 0.08;
const FOLDER_HOVER_BLEND_EASE = "power2.out";
const FOLDER_THUMB_SCROLL_DURATION = 0.46;
const APP_FOLDER_CREATE_DIM_ALPHA = 0.48;
const APP_FOLDER_CREATE_DIM_DURATION = 0.12;
const APP_FOLDER_CREATE_FRAME_DURATION = 0.16;
const APP_FOLDER_CREATE_BLEND_DURATION = 0.08;
const APP_FOLDER_CREATE_BLEND_EASE = "power2.out";
const ICON_OPENING_SCALE = 1.08;
const JIGGLE_ROTATION = 0.032;
const JIGGLE_Y = 1;
const JIGGLE_ROTATION_IMPULSE = 0.012;
const JIGGLE_Y_IMPULSE = 0.55;
const FOLDER_FLASH_STEPS = [
  { alpha: 0.42, duration: 0.135 },
  { alpha: 0.02, duration: 0.135 },
  { alpha: 0.36, duration: 0.135 },
  { alpha: 0, duration: 0.135 },
];

function playFlashOverlay(overlay, options = {}) {
  killMotionOf(overlay);
  options.prepare?.();
  overlay.visible = true;
  overlay.alpha = 0;
  return motionSequence(overlay, FOLDER_FLASH_STEPS.map((step, index) => ({
    ...step,
    ease: "sine.inOut",
    onComplete: index === FOLDER_FLASH_STEPS.length - 1
      ? () => {
        overlay.visible = false;
      }
      : undefined,
  })));
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
    this.openingScaleActive = null;
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
    this.folderHoverClearing = false;
    this.folderHoverFrame = { padding: 0 };
    this.folderPreviewPlanKey = null;
    this.appFolderCreateActive = false;
    this.appFolderCreateKey = null;
    this.appFolderCreatePhase = null;
    this.appFolderCreateFrame = { alpha: 0, padding: 0 };
    this.appFolderCreateBackdropSig = "";
    this.appFolderCreateFlashSig = "";
    this.editButtonSigs = new WeakMap();
    this.folderFlashSig = "";
    this.folderPreviewMaskSig = "";
    this.folderThumbFrameSig = "";
    this.hitAreaRect = new Rectangle();
    this.hitAreaSig = "";
    this.labelRenderSig = "";
    this.missingBadgeSig = "";
    this.selectionFrameSig = "";

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
    this.hitArea = this.hitAreaRect;
    this.on("pointerdown", (event) => this.handlePointerDown(event));
    this.on("pointerup", (event) => this.handlePointerUp(event));
    this.on("pointerupoutside", () => this.cancelPressAndClickIntent());
    this.on("pointercancel", () => this.cancelPressAndClickIntent());
    this.on("rightdown", (event) => this.handleContextMenu(event));
    this.describeMotionTargets();
  }

  setState(state) {
    state = { draggable: true, ...state };
    const wasGhosted = Boolean(this.state?.ghosted);
    const shouldRestoreLabelAfterGhost = Boolean(this.state?.suppressLabelRevealAfterGhost || state.suppressLabelRevealAfterGhost);
    this.item = state.item;
    this.source = state.source;
    this.iconSize = state.iconSize || 64;
    this.stageHeight = Math.max(1, Number(state.stageHeight) || this.stageHeight || 1);
    this.stageWidth = Math.max(1, Number(state.stageWidth) || this.stageWidth || 1);
    this.textless = Boolean(state.textless);
    this.isFolder = state.item?.type === "folder";
    this.state = state;
    this.describeMotionTargets(state);
    this.eventMode = state.interactive === false ? "none" : "static";
    this.cursor = state.interactive === false ? "default" : "pointer";
    this.visible = !state.dragging && !state.ghosted;
    this.alpha = state.opening ? 0 : 1;
    this.updateOpeningScale(state);
    if (state.dragging || state.ghosted || state.opening || state.interactive === false) this.setPressed(false, { immediate: true });
    this.renderVisual(state);
    this.renderLabel(state);
    this.renderEditButtons(state);
    this.renderFrame(state);
    this.updateHitArea(state);
    this.updateJiggle(state);
    if (this.isFolder && wasGhosted && !state.ghosted && !state.dragging && !state.opening) {
      this.resetFolderPreviewAfterGhost();
      if (shouldRestoreLabelAfterGhost) this.restoreLabelAfterGhost();
      else this.revealLabelAfterGhost();
    }
  }

  describeMotionTargets(state = this.state || {}) {
    const item = state.item || this.item || null;
    const source = state.source || this.source || {};
    const layer = getIconMotionLayer(source);
    const prefix = layer === "ghost" ? "ghost.icon" : `${layer}.icon`;
    const base = {
      index: source.index ?? null,
      itemId: item?.id ?? null,
      itemType: item?.type ?? null,
      kind: getIconMotionKind(item, source),
      label: getIconMotionLabel(item),
      layer,
      pageIndex: source.pageIndex ?? null,
      sourceType: source.type ?? null,
    };
    const describe = (target, targetPart, suffix, overlayTarget = target) => {
      if (!target) return;
      motionRuntime.describeTarget(target, {
        ...base,
        overlayTarget,
        sourceLabel: `${prefix}.${suffix}`,
        targetPart,
      });
    };
    describe(this, "node", "node");
    describe(this.scale, "node.scale", "nodeScale", this);
    describe(this.visualWrap, "visualWrap", "visualWrap");
    describe(this.visualWrap?.scale, "visualWrap.scale", "visualScale", this.visualWrap);
    describe(this.jiggleWrap, "jiggleWrap", "jiggleWrap");
    describe(this.folderThumb, "folderThumb", "folderThumb");
    describe(this.folderChildrenWrap, "folderChildrenWrap", "folderChildren");
    describe(this.folderFlashOverlay, "folderFlashOverlay", "folderFlash");
    describe(this.folderCreateBackdrop, "folderCreateBackdrop", "folderCreateBackdrop");
    describe(this.folderCreateFlashOverlay, "folderCreateFlashOverlay", "folderCreateFlash");
    describe(this.iconSprite, "iconSprite", "iconSprite");
    describe(this.emojiText, "emojiText", "emojiText");
    describe(this.labelText, "labelText", "label");
    describe(this.labelText?.scale, "labelText.scale", "labelScale", this.labelText);
  }

  updateOpeningScale(state) {
    if (state.preserveNodeScale) {
      this.openingScaleActive = null;
      killMotionOf(this.scale);
      return;
    }
    const shouldOpenScale = Boolean(state.opening);
    const nextScale = shouldOpenScale ? ICON_OPENING_SCALE : 1;
    if (this.openingScaleActive === shouldOpenScale) return;
    this.openingScaleActive = shouldOpenScale;
    if (Math.abs((Number(this.scale?.x) || 1) - nextScale) <= 0.0001 &&
      Math.abs((Number(this.scale?.y) || 1) - nextScale) <= 0.0001) {
      this.scale.set(nextScale);
      return;
    }
    transition(this.scale)
      .preset(shouldOpenScale ? "snappy" : "settle")
      .layout()
      .interrupt("retarget")
      .to({ x: nextScale, y: nextScale })
      .start();
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
    const childNode = this.folderChildNodes?.[slotIndex];
    if (childNode && !childNode.destroyed) {
      return this.getVisualBounds(childNode, stageRect, thumb.childSize);
    }
    return this.getLocalVisualBounds(this.visualWrap, stageRect, getFolderThumbChildLocalRect(thumb, slotIndex));
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
    const wasPressed = this.pressedPointerId != null;
    if (pressed) this.pressedPointerId = options.pointerId ?? this.pressedPointerId;
    else this.pressedPointerId = null;
    killMotionOf(this.visualWrap, "alpha");
    if (options.immediate) {
      this.visualWrap.alpha = nextAlpha;
      return;
    }
    if (pressed !== wasPressed) {
      const impulse = pressed ? PRESS_SCALE_IMPULSE : RELEASE_SCALE_IMPULSE;
      motionAdd(this.visualWrap.scale, {
        spring: { damping: 32, mass: 0.8, restDelta: 0.001, restSpeed: 0.001, stiffness: 520 },
        x: impulse,
        y: impulse,
      });
    }
    transition(this.visualWrap)
      .preset(pressed ? "press" : "release")
      .interrupt("retarget")
      .to({ alpha: nextAlpha })
      .start();
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
    const sig = `${numberSig(rect.left)}:${numberSig(rect.top)}:${numberSig(rect.width)}:${numberSig(rect.height)}`;
    if (this.hitAreaSig === sig) return;
    this.hitAreaSig = sig;
    this.hitAreaRect.x = rect.left;
    this.hitAreaRect.y = rect.top;
    this.hitAreaRect.width = rect.width;
    this.hitAreaRect.height = rect.height;
    this.hitArea = this.hitAreaRect;
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
    const sig = [
      numberSig(rect.left),
      numberSig(rect.top),
      numberSig(rect.width),
      numberSig(rect.height),
      numberSig(this.iconSize),
      boolSig(state.dropTarget),
      boolSig(isAppFolderCreateHover),
      boolSig(isFolderDropHover),
      boolSig(state.selected),
    ].join(":");
    if (this.selectionFrameSig === sig) return;
    this.selectionFrameSig = sig;
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
    this.folderHoverClearing = false;
    this.folderHoverFrame.padding = 0;
    this.folderPreviewPlanKey = null;
    this.folderFlashSig = "";
    this.folderPreviewMaskSig = "";
    this.folderThumbFrameSig = "";
    this.folderThumb.scale.set(1);
    this.visualWrap.scale.set(1);
    killMotionOf(this.folderHoverFrame);
    killMotionOf(this.folderThumb, "scale");
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
      setTextValue(this.emojiText, this.item?.emoji || "◼");
      setTextStyleValue(this.emojiText, "fontSize", this.iconSize);
      setTextStyleValue(this.emojiText, "lineHeight", this.iconSize);
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
    const fromRotation = -direction * JIGGLE_ROTATION;
    const fromY = -direction * JIGGLE_Y;
    transition(this.jiggleWrap)
      .jiggle()
      .to({
        delay: (seed % 5) * 0.018,
        duration,
        ease: "sine.inOut",
        from: {
          rotation: fromRotation,
          y: fromY,
        },
        loop: true,
        repeat: -1,
        rotation: direction * JIGGLE_ROTATION,
        y: direction * JIGGLE_Y,
        yoyo: true,
      })
      .start();
    motionAdd(this.jiggleWrap, {
      rotation: -direction * JIGGLE_ROTATION_IMPULSE,
      spring: { damping: 30, mass: 0.8, restDelta: 0.0005, restSpeed: 0.0005, stiffness: 420 },
      y: -direction * JIGGLE_Y_IMPULSE,
    });
  }

  stopJiggle() {
    killMotionOf(this.jiggleWrap, null, { lane: "additive" });
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
      const childRect = getFolderThumbChildLocalRect(thumb, index);
      node.position.set(childRect.left + childRect.width / 2, childRect.top + childRect.height / 2);
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
        setTextValue(childEmoji, child.emoji || "◼");
        setTextStyleValue(childEmoji, "fontSize", thumb.childSize);
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
    const sig = `${numberSig(size)}:${numberSig(thumb.radius)}:${numberSig(thumb.fillAlpha)}:${thumb.fillColor}:${numberSig(thumb.strokeAlpha)}:${thumb.strokeColor}:${numberSig(thumb.strokeWidth)}:${numberSig(this.getFolderHoverPadding())}`;
    if (this.folderThumbFrameSig === sig) return;
    this.folderThumbFrameSig = sig;
    drawFolderThumbFrameGraphic(this.folderThumb, size, thumb, this.getFolderHoverPadding());
  }

  drawFolderPreviewMask(thumb) {
    const sig = `${numberSig(this.iconSize)}:${numberSig(thumb.start)}:${numberSig(thumb.childSize)}:${numberSig(thumb.gap)}`;
    if (this.folderPreviewMaskSig === sig) return;
    this.folderPreviewMaskSig = sig;
    drawFolderPreviewMaskGraphic(this.folderPreviewMask, this.iconSize, thumb);
  }

  drawFolderFlashOverlay(size, thumb) {
    const sig = `${numberSig(size)}:${numberSig(thumb.radius)}:${numberSig(this.getFolderHoverPadding())}`;
    if (this.folderFlashSig === sig) return;
    this.folderFlashSig = sig;
    drawFolderFlashOverlayGraphic(this.folderFlashOverlay, size, thumb, this.getFolderHoverPadding());
  }

  redrawFolderHoverFrame() {
    if (!this.isFolder) return;
    const size = this.iconSize;
    const thumb = getFolderThumbMetrics(size);
    this.drawFolderThumbFrame(size, thumb);
    this.drawFolderFlashOverlay(size, thumb);
  }

  prepareFolderHoverFrame(targetPadding) {
    const previousPadding = this.getFolderHoverPadding();
    const nextPadding = Math.max(0, Number(targetPadding) || 0);
    const previousScale = Math.max(0.01, Number(this.folderThumb.scale?.x) || 1);
    const nextScale = previousScale * getPaddedFrameScale(this.iconSize, previousPadding, nextPadding);
    this.folderHoverFrame.padding = nextPadding;
    this.drawFolderThumbFrame(this.iconSize, getFolderThumbMetrics(this.iconSize));
    this.folderThumb.scale.set(nextScale);
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
    this.folderHoverClearing = false;
    this.visualWrap.scale.set(1);
    this.prepareFolderHoverFrame(this.getFolderHoverTargetPadding());
    if (!wasActive) {
      killMotionOf(this.folderHoverFrame);
      transition(this.folderThumb)
        .duration(FOLDER_HOVER_FRAME_DURATION)
        .ease("power3.out")
        .overlay()
        .blend(FOLDER_HOVER_BLEND_DURATION, FOLDER_HOVER_BLEND_EASE)
        .to({
          scale: 1,
        })
        .start();
    }

    const planKey = getFolderPreviewPlanKey(hoverState, plan);
    if (this.folderHoverKey !== hoverState.key || this.folderPreviewPlanKey !== planKey) {
      this.folderHoverKey = hoverState.key;
      this.folderPreviewPlanKey = planKey;
      killMotionOf(this.folderChildrenWrap, "y");
      this.folderChildrenWrap.y = plan.startY;
      if (plan.endY !== plan.startY) {
        transition(this.folderChildrenWrap)
          .duration(FOLDER_THUMB_SCROLL_DURATION)
          .ease("power2.inOut")
          .overlay()
          .blend(FOLDER_HOVER_BLEND_DURATION, FOLDER_HOVER_BLEND_EASE)
          .to({ y: plan.endY })
          .start();
      }
    }

    if (this.folderHoverPhase !== hoverState.phase) {
      this.folderHoverPhase = hoverState.phase;
      if (hoverState.phase === "flash") this.playFolderFlash();
    }
  }

  playFolderFlash() {
    playFlashOverlay(this.folderFlashOverlay);
  }

  clearFolderHoverAnimation() {
    if (this.folderHoverClearing) return;
    if (!this.folderHoverActive && this.folderHoverKey == null && this.folderChildrenWrap.y === 0 && this.getFolderHoverPadding() === 0) return;
    this.folderHoverActive = false;
    this.folderHoverKey = null;
    this.folderHoverPhase = null;
    this.folderPreviewPlanKey = null;
    this.folderHoverClearing = true;
    this.visualWrap.scale.set(1);
    killMotionOf(this.folderHoverFrame);
    const targetPadding = this.getFolderHoverPadding();
    const hiddenScale = getPaddedFrameScale(this.iconSize, 0, targetPadding);
    transition(this.folderThumb)
      .duration(FOLDER_HOVER_RESET_DURATION)
      .ease("power3.out")
      .overlay()
      .blend(FOLDER_HOVER_BLEND_DURATION, FOLDER_HOVER_BLEND_EASE)
      .to({
        onComplete: () => {
          this.folderHoverFrame.padding = 0;
          this.folderHoverClearing = false;
          this.folderThumbFrameSig = "";
          this.folderFlashSig = "";
          this.folderThumb.scale.set(1);
          this.redrawFolderHoverFrame();
        },
        scale: hiddenScale,
      })
      .start();
    killMotionOf(this.visualWrap.scale);
    transition(this.folderChildrenWrap)
      .duration(FOLDER_HOVER_RESET_DURATION)
      .ease("power3.out")
      .overlay()
      .blend(FOLDER_HOVER_BLEND_DURATION, FOLDER_HOVER_BLEND_EASE)
      .to({ y: 0 })
      .start();
    killMotionOf(this.folderFlashOverlay);
    this.folderFlashOverlay.alpha = 0;
    this.folderFlashOverlay.visible = false;
  }

  resetFolderPreviewAfterGhost() {
    this.folderHoverActive = false;
    this.folderHoverKey = null;
    this.folderHoverPhase = null;
    this.folderHoverClearing = false;
    this.folderPreviewPlanKey = null;
    this.folderHoverFrame.padding = 0;
    killMotionOf(this.folderHoverFrame);
    killMotionOf(this.folderThumb, "scale");
    killMotionOf(this.visualWrap.scale);
    killMotionOf(this.folderChildrenWrap);
    this.folderThumb.scale.set(1);
    this.visualWrap.scale.set(1);
    this.folderChildrenWrap.y = 0;
    this.redrawFolderHoverFrame();
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
    const sig = `${numberSig(this.iconSize)}:${numberSig(this.appFolderCreateFrame.alpha)}:${numberSig(this.appFolderCreateFrame.padding)}`;
    if (this.appFolderCreateBackdropSig === sig) return;
    this.appFolderCreateBackdropSig = sig;
    drawAppFolderCreateBackdropGraphic(this.folderCreateBackdrop, this.iconSize, this.appFolderCreateFrame);
  }

  drawAppFolderCreateFlashOverlay() {
    const sig = `${numberSig(this.iconSize)}:${numberSig(this.appFolderCreateFrame.padding)}:${boolSig(this.folderCreateFlashOverlay.visible)}`;
    if (this.appFolderCreateFlashSig === sig) return;
    this.appFolderCreateFlashSig = sig;
    drawAppFolderCreateFlashOverlayGraphic(this.folderCreateFlashOverlay, this.iconSize, this.appFolderCreateFrame);
  }

  redrawAppFolderCreateFrame() {
    this.drawAppFolderCreateBackdrop();
    if (this.folderCreateFlashOverlay.visible) this.drawAppFolderCreateFlashOverlay();
  }

  prepareAppFolderCreateBackdrop(targetPadding, options = {}) {
    const previousPadding = Math.max(0, Number(this.appFolderCreateFrame.padding) || 0);
    const nextPadding = Math.max(0, Number(targetPadding) || 0);
    const previousScale = Math.max(0.01, Number(this.folderCreateBackdrop.scale?.x) || 1);
    const previousAlpha = this.folderCreateBackdrop.visible
      ? Math.max(0, Number(this.folderCreateBackdrop.alpha) || 0)
      : Math.max(0, Number(this.appFolderCreateFrame.alpha) || 0);
    const nextScale = options.preserveCurrentScale
      ? previousScale
      : previousScale * getPaddedFrameScale(this.iconSize, previousPadding, nextPadding);
    this.appFolderCreateFrame.alpha = 1;
    this.appFolderCreateFrame.padding = nextPadding;
    this.drawAppFolderCreateBackdrop();
    this.folderCreateBackdrop.alpha = previousAlpha;
    this.folderCreateBackdrop.visible = true;
    this.folderCreateBackdrop.scale.set(nextScale);
  }

  tweenAppFolderCreateIconAlpha(alpha, options = {}) {
    if (options.immediate) {
      killMotionOf(this.iconSprite, "alpha");
      killMotionOf(this.emojiText, "alpha");
      this.iconSprite.alpha = alpha;
      this.emojiText.alpha = alpha;
      return;
    }
    transition([this.iconSprite, this.emojiText])
      .preset("fade", { duration: APP_FOLDER_CREATE_DIM_DURATION })
      .overlay()
      .blend(APP_FOLDER_CREATE_BLEND_DURATION, APP_FOLDER_CREATE_BLEND_EASE)
      .to({ alpha })
      .start();
  }

  updateAppFolderCreateHoverAnimation(state) {
    const hoverState = this.getActiveAppFolderCreateHoverState(state);
    if (!hoverState) {
      this.clearAppFolderCreateHoverAnimation();
      return;
    }

    const wasActive = this.appFolderCreateActive;
    this.appFolderCreateActive = true;
    const targetPadding = this.getAppFolderCreateTargetPadding();
    this.prepareAppFolderCreateBackdrop(targetPadding, {
      preserveCurrentScale: wasActive || this.folderCreateBackdrop.visible,
    });
    if (!wasActive) {
      killMotionOf(this.appFolderCreateFrame);
      transition(this.folderCreateBackdrop)
        .duration(APP_FOLDER_CREATE_FRAME_DURATION)
        .ease("power3.out")
        .overlay()
        .blend(APP_FOLDER_CREATE_BLEND_DURATION, APP_FOLDER_CREATE_BLEND_EASE)
        .to({
          alpha: 1,
          scale: 1,
        })
        .start();
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
    playFlashOverlay(this.folderCreateFlashOverlay, {
      prepare: () => this.drawAppFolderCreateFlashOverlay(),
    });
  }

  clearAppFolderCreateHoverAnimation(options = {}) {
    const shouldClear = this.appFolderCreateActive ||
      this.folderCreateBackdrop.visible ||
      this.iconSprite.alpha !== 1 ||
      this.emojiText.alpha !== 1 ||
      this.folderCreateFlashOverlay.visible;
    if (!shouldClear) return;

    this.appFolderCreateActive = false;
    this.appFolderCreateKey = null;
    this.appFolderCreatePhase = null;
    killMotionOf(this.appFolderCreateFrame);
    killMotionOf(this.folderCreateFlashOverlay);
    this.folderCreateFlashOverlay.alpha = 0;
    this.folderCreateFlashOverlay.visible = false;

    if (options.immediate) {
      killMotionOf(this.folderCreateBackdrop, "alpha,scale");
      this.appFolderCreateFrame.alpha = 0;
      this.appFolderCreateFrame.padding = 0;
      this.appFolderCreateBackdropSig = "";
      this.appFolderCreateFlashSig = "";
      this.folderCreateBackdrop.alpha = 0;
      this.folderCreateBackdrop.scale.set(1);
      this.folderCreateBackdrop.clear();
      this.folderCreateBackdrop.visible = false;
      this.folderCreateFlashOverlay.clear();
      this.tweenAppFolderCreateIconAlpha(1, { immediate: true });
      return;
    }

    const targetPadding = Math.max(0, Number(this.appFolderCreateFrame.padding) || 0);
    const hiddenScale = getPaddedFrameScale(this.iconSize, 0, targetPadding);
    transition(this.folderCreateBackdrop)
      .duration(FOLDER_HOVER_RESET_DURATION)
      .ease("power3.out")
      .overlay()
      .blend(APP_FOLDER_CREATE_BLEND_DURATION, APP_FOLDER_CREATE_BLEND_EASE)
      .to({
        alpha: 0,
        scale: hiddenScale,
        onComplete: () => {
          this.appFolderCreateFrame.alpha = 0;
          this.appFolderCreateFrame.padding = 0;
          this.appFolderCreateBackdropSig = "";
          this.folderCreateBackdrop.clear();
          this.folderCreateBackdrop.visible = false;
        },
      })
      .start();
    this.tweenAppFolderCreateIconAlpha(1);
  }

  renderMissingBadge(state) {
    const sig = `${numberSig(this.iconSize)}:${state.launchTargetStatus || ""}`;
    if (this.missingBadgeSig === sig) return;
    this.missingBadgeSig = sig;
    drawMissingBadge(this.missingBadge, this.missingBadgeBackground, this.missingBadgeText, this.iconSize, state.launchTargetStatus);
  }

  renderLabel(state) {
    const labelState = getIconLabelRenderState({
      cellWidth: state.cellWidth,
      compact: state.compact,
      iconSize: this.iconSize,
      itemName: this.item?.name,
      singleLineLabel: state.singleLineLabel,
      textless: this.textless,
    });
    const sig = [
      boolSig(labelState.visible),
      labelState.text || "",
      numberSig(labelState.fontSize),
      numberSig(labelState.lineHeight),
      boolSig(labelState.wordWrap),
      numberSig(labelState.wordWrapWidth),
      numberSig(labelState.anchorX),
      numberSig(labelState.anchorY),
      numberSig(labelState.x),
      numberSig(labelState.y),
    ].join(":");
    if (this.labelRenderSig === sig) return;
    this.labelRenderSig = sig;
    this.labelText.visible = labelState.visible;
    if (!this.labelText.visible) return;
    setTextStyleValue(this.labelText, "fontSize", labelState.fontSize);
    setTextStyleValue(this.labelText, "lineHeight", labelState.lineHeight);
    setTextStyleValue(this.labelText, "wordWrap", labelState.wordWrap);
    setTextStyleValue(this.labelText, "wordWrapWidth", labelState.wordWrapWidth);
    setTextValue(this.labelText, labelState.text);
    this.labelText.anchor.set(labelState.anchorX, labelState.anchorY);
    setPositionValue(this.labelText.position, labelState.x, labelState.y);
  }

  revealLabelAfterGhost() {
    if (!this.labelText.visible) return;
    killMotionOf(this.labelText);
    this.labelText.alpha = 0;
    transition(this.labelText)
      .preset("fade", { duration: 0.18 })
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 1 })
      .start();
  }

  setFolderHandoffVisualHidden(hidden) {
    this.visualWrap.visible = !hidden;
    if (hidden) return;
    this.setPressed(false, { immediate: true });
    killMotionOf(this.visualWrap.scale);
    this.visualWrap.scale.set(1);
  }

  restoreLabelAfterGhost() {
    if (!this.labelText.visible) return;
    killMotionOf(this.labelText);
    this.labelText.alpha = 1;
  }

  renderEditButtons(state) {
    this.drawEditButton(this.removeButton, -this.iconSize / 2 + 2, -this.iconSize / 2 + 2, "×", state.editing && state.removable && this.item?.type === "app");
    this.drawEditButton(this.changeButton, this.iconSize / 2 - 2, -this.iconSize / 2 + 2, "+", state.editing && this.item?.type === "app");
    this.drawEditButton(this.resetButton, this.iconSize / 2 - 2, this.iconSize / 2 - 2, "↺", state.editing && state.hasCustomIcon && this.item?.type === "app");
  }

  drawEditButton(button, x, y, label, visible) {
    const sig = `${numberSig(x)}:${numberSig(y)}:${label}:${boolSig(visible)}`;
    if (this.editButtonSigs.get(button) === sig) return;
    this.editButtonSigs.set(button, sig);
    drawEditButtonGraphic(button, x, y, label, visible);
  }

  destroy(options) {
    this.stopJiggle();
    killMotionOf(this.folderHoverFrame);
    killMotionOf(this.appFolderCreateFrame);
    killAllMotion(this, { reason: "destroyed" });
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
