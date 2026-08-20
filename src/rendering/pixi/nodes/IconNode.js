import { Container, Graphics, Rectangle, Sprite } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { createPixiText } from "../pixiText.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motionAdd, motionSequence, motion } from "../animation/motionTween.js";
import { iconTextureRepository } from "../assets/iconTextureRepository.js";
import {
  getCenteredLocalRect,
  mapDisplayObjectLocalRectToStageRect,
} from "../geometry/displayObjectBounds.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import {
  drawEditButton as drawEditButtonGraphic,
  drawBatchSelectionCheck,
  drawMissingBadge,
} from "./iconControlDrawing.js";
import {
  getBatchSelectionBadgeLayout,
  getBatchSelectionFrameRect,
} from "./batchSelectionGeometry.js";
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
  drawFocusFrame,
  getFocusFrameRect as getFocusFrameRectForIcon,
} from "./iconFocusFrame.js";
import {
  getEditButtonActionAt,
  getIconHitAreaRect,
} from "./iconInteractionGeometry.js";

function makeLabelText(fontSize = 13) {
  return createPixiText({
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
  button.textNode = createPixiText({
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

function copyLabelPresentation(source, target) {
  if (!source || !target) return;
  setTextValue(target, source.text);
  for (const prop of ["fontSize", "lineHeight", "wordWrap", "wordWrapWidth"]) {
    setTextStyleValue(target, prop, source.style?.[prop]);
  }
  target.anchor.set(source.anchor?.x ?? 0.5, source.anchor?.y ?? 0);
  target.position.set(source.position?.x ?? 0, source.position?.y ?? 0);
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

const PRESSING_VISUAL_ALPHA = 0.72;
const ARMED_VISUAL_ALPHA = 0.92;
const PRESSING_SCALE_IMPULSE = -0.03;
const ARMED_SCALE_IMPULSE = 0.05;
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
    this.openingScaleActive = null;
    this.interactionPhase = null;
    this.onAction = options.onAction || (() => {});

    this.focusFrame = new Graphics();
    this.batchSelectionBadge = new Container();
    this.batchSelectionBadgeBackground = new Graphics();
    this.batchSelectionBadgeCheck = new Graphics();
    this.batchSelectionBadgeText = createPixiText({
      text: "",
      style: {
        align: "center",
        fill: 0xffffff,
        fontFamily: "Inter, Segoe UI, sans-serif",
        fontSize: 12,
        fontWeight: "800",
        lineHeight: 12,
      },
    });
    this.jiggleWrap = new Container();
    this.visualWrap = new Container();
    this.folderSlotReleaseVisual = new Container();
    this.folderSlotReleaseSprite = new Sprite();
    this.folderSlotReleaseEmoji = createPixiText({
      text: "",
      style: { align: "center", fill: 0xffffff, fontSize: 16, lineHeight: 0 },
    });
    this.folderThumb = new Graphics();
    this.folderPreviewMask = new Graphics();
    this.folderPreviewMask.visible = false;
    this.folderChildrenWrap = new Container();
    this.folderFlashOverlay = new Graphics();
    this.folderCreateBackdrop = new Graphics();
    this.folderCreateFlashOverlay = new Graphics();
    this.iconSprite = new Sprite();
    this.emojiText = createPixiText({
      text: "",
      style: { align: "center", fill: 0xffffff, fontSize: 64, lineHeight: 64 },
    });
    this.labelText = makeLabelText();
    this.labelTransitionText = makeLabelText();
    this.missingBadge = new Container();
    this.missingBadgeBackground = new Graphics();
    this.missingBadgeText = createPixiText({
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
    this.labelTransitionBlendActive = false;
    this.missingBadgeSig = "";
    this.focusFrameSig = "";
    this.batchSelectionBadgeSig = "";

    this.iconSprite.anchor.set(0.5);
    this.emojiText.anchor.set(0.5);
    this.folderSlotReleaseSprite.anchor.set(0.5);
    this.folderSlotReleaseEmoji.anchor.set(0.5);
    this.folderSlotReleaseVisual.addChild(
      this.folderSlotReleaseSprite,
      this.folderSlotReleaseEmoji
    );
    this.folderSlotReleaseVisual.eventMode = "none";
    this.folderSlotReleaseVisual.visible = false;
    this.missingBadge.visible = false;
    this.batchSelectionBadge.visible = false;
    this.batchSelectionBadge.eventMode = "none";
    this.batchSelectionBadgeCheck.visible = false;
    this.batchSelectionBadgeText.anchor.set(0.5);
    this.batchSelectionBadge.addChild(
      this.batchSelectionBadgeBackground,
      this.batchSelectionBadgeCheck,
      this.batchSelectionBadgeText
    );
    this.missingBadgeText.anchor.set(0.5);
    this.missingBadge.addChild(this.missingBadgeBackground);
    this.missingBadge.addChild(this.missingBadgeText);
    this.addChild(this.focusFrame);
    this.addChild(this.jiggleWrap);
    this.jiggleWrap.addChild(this.visualWrap);
    this.jiggleWrap.addChild(this.folderSlotReleaseVisual);
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
    this.visualWrap.addChild(this.batchSelectionBadge);
    this.folderFlashOverlay.visible = false;
    this.folderCreateBackdrop.visible = false;
    this.folderCreateFlashOverlay.visible = false;
    this.labelTransitionText.eventMode = "none";
    this.labelTransitionText.visible = false;
    this.jiggleWrap.addChild(this.labelTransitionText);
    this.jiggleWrap.addChild(this.labelText);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.hitArea = this.hitAreaRect;
    this.on("pointerdown", (event) => this.handlePointerDown(event));
    this.describeMotionTargets();
  }

  /** @param {import("./iconVisualState.js").IconVisualState} state */
  setState(state) {
    state = { draggable: true, ...state };
    const wasGhosted = Boolean(this.state?.ghosted);
    const wasDragging = Boolean(this.state?.dragging);
    const wasFolder = this.isFolder;
    const shouldRevealLabelAfterVisualHandoff = Boolean(
      (wasDragging || wasGhosted) &&
      this.state?.revealLabelAfterVisualHandoff &&
      !state.dragging &&
      !state.ghosted &&
      !state.opening
    );
    const shouldRestoreLabelAfterGhost = Boolean(this.state?.suppressLabelRevealAfterGhost || state.suppressLabelRevealAfterGhost);
    this.item = state.item;
    this.source = state.source;
    this.iconSize = state.iconSize || 64;
    this.stageHeight = Math.max(1, Number(state.stageHeight) || this.stageHeight || 1);
    this.stageWidth = Math.max(1, Number(state.stageWidth) || this.stageWidth || 1);
    this.textless = Boolean(state.textless);
    this.isFolder = state.item?.type === "folder";
    this.state = state;
    if (wasFolder !== this.isFolder) {
      this.interactionPhase = null;
      killMotionOf(this.visualWrap, "alpha");
      killMotionOf(this.visualWrap.scale);
      this.visualWrap.alpha = 1;
      this.visualWrap.scale.set(1);
    }
    this.describeMotionTargets(state);
    this.eventMode = state.interactive === false ? "none" : "static";
    this.visible = !state.dragging && !state.ghosted;
    this.alpha = state.opening ? 0 : 1;
    this.updateOpeningScale(state);
    const suppressInteractionFeedback = Boolean(
      state.dragging || state.ghosted || state.opening || state.interactive === false
    );
    this.renderVisual(state);
    this.renderLabel(state);
    this.renderEditButtons(state);
    this.renderFrame(state);
    this.renderBatchSelectionBadge(state);
    this.updateHitArea(state);
    this.updateJiggle(state);
    this.setInteractionPhase(
      suppressInteractionFeedback ? null : state.interactionPhase,
      { immediate: suppressInteractionFeedback }
    );
    if (shouldRevealLabelAfterVisualHandoff) this.revealLabelAfterGhost();
    if (this.isFolder && wasGhosted && !state.ghosted && !state.dragging && !state.opening) {
      this.resetFolderPreviewAfterGhost();
      if (this.folderHandoffLabelRevealInProgress) return;
      if (shouldRestoreLabelAfterGhost) this.restoreLabelAfterGhost();
      else if (!shouldRevealLabelAfterVisualHandoff) this.revealLabelAfterGhost();
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
    motion(this.scale)
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

  getFolderPreviewChildReleasePose(relativeTo, slotIndex, options = {}) {
    if (!this.isFolder || !relativeTo) return null;
    const childNode = this.folderChildNodes?.[slotIndex];
    const expectedChildId = options.expectedChildId || null;
    if (!childNode || childNode.destroyed || !childNode.visible || !childNode.folderPreviewChildId) return null;
    if (expectedChildId && childNode.folderPreviewChildId !== expectedChildId) return null;

    const center = relativeTo.toLocal({ x: 0, y: 0 }, childNode);
    const xUnit = relativeTo.toLocal({ x: 1, y: 0 }, childNode);
    const yUnit = relativeTo.toLocal({ x: 0, y: 1 }, childNode);
    if (![center.x, center.y, xUnit.x, xUnit.y, yUnit.x, yUnit.y].every(Number.isFinite)) return null;
    const thumb = getFolderThumbMetrics(this.iconSize);
    const previewIconSize = Math.max(1, Number(options.previewIconSize) || this.iconSize || 64);
    const visualScale = thumb.childSize / previewIconSize;
    return {
      center: { x: center.x, y: center.y },
      matrix: {
        a: (xUnit.x - center.x) * visualScale,
        b: (xUnit.y - center.y) * visualScale,
        c: (yUnit.x - center.x) * visualScale,
        d: (yUnit.y - center.y) * visualScale,
      },
      targetChildId: childNode.folderPreviewChildId,
    };
  }

  getFolderCenterReleasePose(relativeTo) {
    if (!this.isFolder || !relativeTo || !this.folderThumb || this.folderThumb.destroyed) return null;
    const center = relativeTo.toLocal({ x: 0, y: 0 }, this.folderThumb);
    if (![center.x, center.y].every(Number.isFinite)) return null;
    return { center: { x: center.x, y: center.y } };
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
    if (original?.button !== 0) return;
    const action = this.getEditActionAt(event);
    if (action) {
      event?.stopPropagation?.();
      original?.preventDefault?.();
      original?.stopPropagation?.();
      original?.stopImmediatePropagation?.();
      this.onAction(action, original, this.item, this.source, this);
      return;
    }
    this.onAction("pointerdown", original, this.item, this.source, this);
  }

  setInteractionPhase(phase, options = {}) {
    const nextPhase = phase === "pressing" || phase === "armed" ? phase : null;
    const previousPhase = this.interactionPhase;
    const nextAlpha = nextPhase === "pressing"
      ? PRESSING_VISUAL_ALPHA
      : nextPhase === "armed"
        ? ARMED_VISUAL_ALPHA
        : 1;
    this.interactionPhase = nextPhase;
    this.cursor = this.state?.interactive === false
      ? "default"
      : "pointer";
    if (nextPhase === previousPhase && !options.immediate) return;
    killMotionOf(this.visualWrap, "alpha");
    if (options.immediate) {
      this.visualWrap.alpha = nextAlpha;
      killMotionOf(this.visualWrap.scale);
      this.visualWrap.scale.set(1);
      return;
    }
    const impulse = nextPhase === "pressing"
      ? PRESSING_SCALE_IMPULSE
      : nextPhase === "armed"
        ? ARMED_SCALE_IMPULSE
        : RELEASE_SCALE_IMPULSE;
    if (previousPhase !== nextPhase) {
      motionAdd(this.visualWrap.scale, {
        spring: { damping: 32, mass: 0.8, restDelta: 0.001, restSpeed: 0.001, stiffness: 520 },
        x: impulse,
        y: impulse,
      });
    }
    motion(this.visualWrap)
      .preset(nextPhase === "pressing" ? "press" : "release")
      .interrupt("retarget")
      .to({ alpha: nextAlpha })
      .start();
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

  prepareFolderSlotReleaseVisual(targetSize = 16) {
    if (this.isFolder || !this.item) return false;
    const size = Math.max(1, Number(targetSize) || 16);
    const sourceSize = Math.max(1, Number(this.iconSize) || 64);
    const texture = this.iconSprite.visible ? this.iconSprite.texture : null;
    this.folderSlotReleaseSprite.visible = Boolean(texture);
    this.folderSlotReleaseEmoji.visible = !texture;
    if (texture) {
      this.folderSlotReleaseSprite.texture = texture;
      this.folderSlotReleaseSprite.width = size;
      this.folderSlotReleaseSprite.height = size;
    } else {
      setTextValue(this.folderSlotReleaseEmoji, this.item.emoji || "◼");
      setTextStyleValue(this.folderSlotReleaseEmoji, "fontSize", size);
      setTextStyleValue(this.folderSlotReleaseEmoji, "lineHeight", 0);
    }
    this.folderSlotReleaseVisual.position.set(0, this.getVisualOffsetY());
    this.folderSlotReleaseVisual.scale.set(sourceSize / size);
    this.folderSlotReleaseVisual.alpha = 0;
    this.folderSlotReleaseVisual.visible = true;
    this.visualWrap.alpha = 1;
    this.folderSlotReleaseVisualTargetSize = size;
    return true;
  }

  clearFolderSlotReleaseVisual(reason = "folder-slot-release-visual-clear") {
    killMotionOf(this.folderSlotReleaseVisual, "alpha", { reason });
    this.folderSlotReleaseVisual.visible = false;
    this.folderSlotReleaseVisual.alpha = 0;
    this.folderSlotReleaseVisual.scale.set(1);
    this.folderSlotReleaseVisualTargetSize = null;
  }

  commitFolderSlotReleaseVisual() {
    if (!this.folderSlotReleaseVisual.visible) return false;
    this.visualWrap.alpha = 0;
    this.folderSlotReleaseVisual.alpha = 1;
    return true;
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

  getFrameGeometryOptions(state = this.state || {}) {
    return {
      iconSize: this.iconSize,
      labelText: this.labelText,
      maxWidth: state?.cellWidth,
      cellWidth: state?.cellWidth,
      area: state?.area,
      source: state?.source,
      visualOffsetY: this.getVisualOffsetY(),
    };
  }

  getFocusFrameRect(state = this.state || {}) {
    return getFocusFrameRectForIcon(this.getFrameGeometryOptions(state));
  }

  getBatchSelectionFrameRect(state = this.state || {}) {
    return getBatchSelectionFrameRect(this.getFrameGeometryOptions(state));
  }

  renderFrame(state) {
    const rect = state.batchSelected
      ? this.getBatchSelectionFrameRect(state)
      : this.getFocusFrameRect(state);
    const isFolderDropHover = Boolean(this.isFolder && state.folderHoverState?.targetId === this.item?.id);
    const isAppFolderCreateHover = Boolean(!this.isFolder && state.folderHoverState?.targetId === this.item?.id && state.folderHoverState?.targetType === "app");
    const sig = [
      numberSig(rect.left),
      numberSig(rect.top),
      numberSig(rect.width),
      numberSig(rect.height),
      numberSig(this.iconSize),
      boolSig(state.dropTarget),
      boolSig(state.batchSelected),
      boolSig(isAppFolderCreateHover),
      boolSig(isFolderDropHover),
      boolSig(state.focused),
    ].join(":");
    if (this.focusFrameSig === sig) return;
    this.focusFrameSig = sig;
    drawFocusFrame(this.focusFrame, rect, this.iconSize, {
      batchSelected: state.batchSelected,
      dropTarget: state.dropTarget,
      isAppFolderCreateHover,
      isFolderDropHover,
      focused: state.focused,
    });
  }

  renderBatchSelectionBadge(state) {
    const selectedChildCount = Math.max(0, Number(state.selectedChildCount) || 0);
    const isSelectedApp = Boolean(state.batchSelected && this.item?.type === "app");
    const isSelectedFolder = Boolean(this.item?.type === "folder" && selectedChildCount > 0);
    const isVisible = isSelectedApp || isSelectedFolder;
    const label = isSelectedApp
      ? "✓"
      : selectedChildCount > 99
        ? "99+"
        : String(selectedChildCount);
    const frameRect = isVisible ? this.getBatchSelectionFrameRect(state) : null;
    const layout = isVisible
      ? getBatchSelectionBadgeLayout({
        frameRect,
        iconSize: this.iconSize,
        isCheck: isSelectedApp,
        label,
      })
      : null;
    const visualOffsetY = this.getVisualOffsetY();
    const sig = [
      boolSig(isSelectedApp),
      boolSig(isSelectedFolder),
      label,
      numberSig(layout?.x),
      numberSig(layout?.y),
      numberSig(layout?.size),
      numberSig(layout?.strokeWidth),
      numberSig(frameRect?.width),
      numberSig(frameRect?.height),
      numberSig(this.iconSize),
      numberSig(visualOffsetY),
      numberSig(state.cellWidth),
      String(state.area || state.source?.type || ""),
    ].join(":");
    if (this.batchSelectionBadgeSig === sig) return;
    this.batchSelectionBadgeSig = sig;
    this.batchSelectionBadge.visible = isVisible;
    this.batchSelectionBadgeCheck.visible = isVisible && isSelectedApp;
    this.batchSelectionBadgeText.visible = isVisible && !isSelectedApp;
    if (!isVisible || !layout) return;

    // The badge lives under visualWrap so it follows the icon's visual motion.
    // frameRect is in IconNode coordinates, therefore remove visualWrap's Y
    // offset before assigning the badge's local position.
    this.batchSelectionBadge.position.set(layout.x, layout.y - visualOffsetY);
    this.batchSelectionBadgeBackground
      .clear()
      .circle(0, 0, layout.size / 2)
      .fill({ color: 0x1687ff, alpha: 1 })
      .stroke({ color: 0xffffff, alpha: 0.96, width: layout.strokeWidth });
    if (isSelectedApp) {
      drawBatchSelectionCheck(this.batchSelectionBadgeCheck, layout.size);
      setTextValue(this.batchSelectionBadgeText, "");
      return;
    }
    this.batchSelectionBadgeCheck.clear();
    setTextValue(this.batchSelectionBadgeText, label);
    setTextStyleValue(this.batchSelectionBadgeText, "fontSize", layout.fontSize);
    setTextStyleValue(this.batchSelectionBadgeText, "lineHeight", layout.fontSize);
    this.batchSelectionBadgeText.position.set(layout.textOffsetX, layout.textOffsetY);
  }

  hideFolderChildren() {
    this.deactivateFolderPreviewMask();
    this.folderChildrenWrap.visible = false;
    this.folderFlashOverlay.clear();
    this.folderFlashOverlay.visible = false;
    this.folderHoverActive = false;
    this.folderHoverKey = null;
    this.folderHoverPhase = null;
    this.folderHoverClearing = false;
    this.folderHoverFrame.padding = 0;
    this.folderPreviewPlanKey = null;
    this.folderFlashSig = "";
    this.folderThumbFrameSig = "";
    this.folderThumb.scale.set(1);
    killMotionOf(this.folderHoverFrame);
    killMotionOf(this.folderThumb, "scale");
    for (const node of this.folderChildNodes) {
      node.folderPreviewChildId = null;
      node.renderable = false;
      node.visible = false;
    }
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
    const texture = iconTextureRepository.resolve(this.item, () => {
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
      // Folder thumbnail children use Pixi Text's natural line height. Keep
      // slot-release ghosts on that same raster style; rendering a 16px glyph
      // into a 16px line box avoids the old 64px-texture sampling jump.
      setTextStyleValue(
        this.emojiText,
        "lineHeight",
        state.folderPreviewRelease === true ? 0 : this.iconSize
      );
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
    motion(this.jiggleWrap)
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
    this.activateFolderPreviewMask(thumb);
    this.drawFolderFlashOverlay(size, thumb);
    this.folderChildrenWrap.visible = true;
    const suppressedChildIds = new Set(state.suppressedFolderPreviewChildIds || []);

    while (this.folderChildNodes.length < Math.max(9, plan.items.length)) {
      const childContainer = new Container();
      const childSprite = new Sprite();
      const childEmoji = createPixiText({
        text: "",
        style: { align: "center", fill: 0xffffff, fontSize: 14, lineHeight: 0 },
      });
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
      node.renderable = Boolean(child);
      node.folderPreviewChildId = child?.id || null;
      if (!child) continue;
      if (suppressedChildIds.has(child.id)) {
        node.renderable = false;
        childSprite.visible = false;
        childEmoji.visible = false;
        continue;
      }
      const childId = child.id;
      const texture = iconTextureRepository.resolve(child, () => {
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
        setTextStyleValue(childEmoji, "lineHeight", 0);
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
    const suppressFrame = this.state?.suppressFolderThumbFrame === true;
    const sig = `${numberSig(size)}:${numberSig(thumb.radius)}:${numberSig(thumb.fillAlpha)}:${thumb.fillColor}:${numberSig(thumb.strokeAlpha)}:${thumb.strokeColor}:${numberSig(thumb.strokeWidth)}:${numberSig(this.getFolderHoverPadding())}:${boolSig(suppressFrame)}`;
    if (this.folderThumbFrameSig === sig) return;
    this.folderThumbFrameSig = sig;
    if (suppressFrame) {
      this.folderThumb.clear();
      return;
    }
    drawFolderThumbFrameGraphic(this.folderThumb, size, thumb, this.getFolderHoverPadding());
  }

  activateFolderPreviewMask(thumb) {
    this.drawFolderPreviewMask(thumb);
    this.folderPreviewMask.visible = true;
    if (this.folderChildrenWrap.mask !== this.folderPreviewMask) {
      this.folderChildrenWrap.mask = this.folderPreviewMask;
    }
  }

  deactivateFolderPreviewMask() {
    const wasAttached = this.folderChildrenWrap.mask === this.folderPreviewMask;
    const hadGeometry = Boolean(this.folderPreviewMaskSig);
    if (wasAttached) this.folderChildrenWrap.mask = null;
    this.folderPreviewMask.visible = false;
    if (wasAttached || hadGeometry) this.folderPreviewMask.clear();
    this.folderPreviewMaskSig = "";
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
    const scaleBase = previousPadding <= 0.001 ? 1 : previousScale;
    const nextScale = scaleBase * getPaddedFrameScale(this.iconSize, previousPadding, nextPadding);
    this.folderHoverFrame.padding = nextPadding;
    this.drawFolderThumbFrame(this.iconSize, getFolderThumbMetrics(this.iconSize));
    this.folderThumb.scale.set(nextScale);
    return nextScale;
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
    const previousHoverKey = this.folderHoverKey;
    this.folderHoverActive = true;
    this.folderHoverClearing = false;
    this.visualWrap.scale.set(1);
    const frameScale = this.prepareFolderHoverFrame(this.getFolderHoverTargetPadding());
    const shouldAnimateFrame =
      !wasActive ||
      (previousHoverKey !== hoverState.key && Math.abs(frameScale - 1) > 0.001);
    if (shouldAnimateFrame) {
      killMotionOf(this.folderHoverFrame);
      motion(this.folderThumb)
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
        motion(this.folderChildrenWrap)
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
    motion(this.folderThumb)
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
    motion(this.folderChildrenWrap)
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
    motion([this.iconSprite, this.emojiText])
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
      motion(this.folderCreateBackdrop)
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
    motion(this.folderCreateBackdrop)
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
    if (this.labelRenderSig === sig) {
      if (!state.visualSpecTransition?.active && this.labelTransitionBlendActive) {
        this.finishLabelTransitionBlend();
      }
      return;
    }
    const shouldBlend = Boolean(
      state.visualSpecTransition?.active &&
      this.labelText.visible &&
      this.labelText.text &&
      !this.labelTransitionBlendActive
    );
    if (shouldBlend) {
      copyLabelPresentation(this.labelText, this.labelTransitionText);
      this.labelTransitionText.visible = true;
      this.labelTransitionText.alpha = Math.max(0, Number(this.labelText.alpha) || 1);
      this.labelText.alpha = 0;
      this.labelTransitionBlendActive = true;
      motion(this.labelTransitionText)
        .preset("fade", { duration: 0.12 })
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 0, onComplete: () => this.finishLabelTransitionBlend() })
        .start();
      motion(this.labelText)
        .preset("fade", { duration: 0.12 })
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 1 })
        .start();
    }
    this.labelRenderSig = sig;
    this.labelText.visible = labelState.visible;
    if (!this.labelText.visible) {
      this.finishLabelTransitionBlend();
      return;
    }
    setTextStyleValue(this.labelText, "fontSize", labelState.fontSize);
    setTextStyleValue(this.labelText, "lineHeight", labelState.lineHeight);
    setTextStyleValue(this.labelText, "wordWrap", labelState.wordWrap);
    setTextStyleValue(this.labelText, "wordWrapWidth", labelState.wordWrapWidth);
    setTextValue(this.labelText, labelState.text);
    this.labelText.anchor.set(labelState.anchorX, labelState.anchorY);
    setPositionValue(this.labelText.position, labelState.x, labelState.y);
    if (!state.visualSpecTransition?.active && this.labelTransitionBlendActive) {
      this.finishLabelTransitionBlend();
    }
  }

  finishLabelTransitionBlend() {
    if (!this.labelTransitionBlendActive && !this.labelTransitionText.visible) return;
    killMotionOf(this.labelTransitionText);
    killMotionOf(this.labelText);
    this.labelTransitionText.alpha = 0;
    this.labelTransitionText.visible = false;
    if (this.labelText.visible) this.labelText.alpha = 1;
    this.labelTransitionBlendActive = false;
  }

  revealLabelAfterGhost(options = {}) {
    if (!this.labelText.visible) return;
    this.cancelFolderHandoffLabelFade();
    killMotionOf(this.labelText);
    const currentAlpha = Number(this.labelText.alpha);
    if (!(currentAlpha > 0 && currentAlpha < 1)) this.labelText.alpha = 0;
    motion(this.labelText)
      .preset("fade", { duration: 0.18 })
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 1, onCancel: options.onCancel, onComplete: options.onComplete })
      .start();
  }

  cancelFolderHandoffLabelFade() {
    if (this.folderHandoffLabelFadeFrame == null) return;
    if (typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(this.folderHandoffLabelFadeFrame);
    }
    if (typeof globalThis.clearTimeout === "function") {
      globalThis.clearTimeout(this.folderHandoffLabelFadeFrame);
    }
    this.folderHandoffLabelFadeFrame = null;
  }

  startFolderHandoffLabelFade() {
    if (!this.labelText?.visible) return;
    this.cancelFolderHandoffLabelFade();
    killMotionOf(this.labelText);
    this.labelText.renderable = true;
    this.labelText.alpha = 0;
    this.folderHandoffLabelRevealInProgress = true;
    const finish = () => {
      this.folderHandoffLabelFadeFrame = null;
      this.folderHandoffLabelRevealInProgress = false;
      if (!this.folderHandoffSourceHidden && this.labelText?.visible) {
        this.labelText.renderable = true;
        this.labelText.alpha = 1;
      }
    };
    if (typeof globalThis.setTimeout !== "function") {
      motion(this.labelText)
        .preset("fade", { duration: 0.18 })
        .overlay()
        .interrupt("retarget")
        .to({ alpha: 1, onCancel: finish, onComplete: finish })
        .start();
      return;
    }
    const startTime = globalThis.performance?.now?.() ?? Date.now();
    const duration = 180;
    const step = () => {
      if (this.destroyed || this.folderHandoffSourceHidden || !this.labelText?.visible) {
        this.folderHandoffLabelFadeFrame = null;
        this.folderHandoffLabelRevealInProgress = false;
        return;
      }
      const now = globalThis.performance?.now?.() ?? Date.now();
      const elapsed = Math.max(0, (Number(now) || Date.now()) - startTime);
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - progress) * (1 - progress);
      this.labelText.alpha = eased;
      if (progress >= 1) {
        finish();
        return;
      }
      this.folderHandoffLabelFadeFrame = globalThis.setTimeout(step, 16);
    };
    this.folderHandoffLabelFadeFrame = globalThis.setTimeout(step, 16);
  }

  setFolderHandoffSourceHidden(hidden) {
    const sourceHidden = Boolean(hidden);
    this.folderHandoffSourceHidden = sourceHidden;
    this.visualWrap.visible = !sourceHidden;
    if (this.labelText) {
      this.labelText.renderable = !sourceHidden;
      if (sourceHidden) {
        this.finishLabelTransitionBlend();
        this.folderHandoffLabelRevealInProgress = false;
        this.cancelFolderHandoffLabelFade();
        killMotionOf(this.labelText);
        this.labelText.alpha = 0;
      }
    }
    if (sourceHidden) return;
    this.setInteractionPhase(null, { immediate: true });
    this.visualWrap.alpha = 1;
    killMotionOf(this.visualWrap.scale);
    this.visualWrap.scale.set(1);
  }

  setFolderHandoffVisualHidden(hidden) {
    this.setFolderHandoffSourceHidden(hidden);
  }

  releaseFolderHandoffSource(options = {}) {
    this.setFolderHandoffSourceHidden(false);
    if (!this.labelText?.visible) return;
    this.labelText.renderable = true;
    if (options.fadeLabel === false) {
      this.folderHandoffLabelRevealInProgress = false;
      this.cancelFolderHandoffLabelFade();
      this.restoreLabelAfterGhost();
    } else {
      this.startFolderHandoffLabelFade();
    }
  }

  restoreLabelAfterGhost() {
    if (!this.labelText.visible) return;
    this.folderHandoffLabelRevealInProgress = false;
    this.cancelFolderHandoffLabelFade();
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
    this.cancelFolderHandoffLabelFade();
    killMotionOf(this.folderHoverFrame);
    killMotionOf(this.appFolderCreateFrame);
    killAllMotion(this, { reason: "destroyed" });
    if (this.folderChildrenWrap?.mask === this.folderPreviewMask) {
      this.folderChildrenWrap.mask = null;
    }
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
