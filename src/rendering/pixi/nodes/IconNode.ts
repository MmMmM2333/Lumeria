import { Container, Graphics, Rectangle, Sprite } from "pixi.js";
import type {
  DestroyOptions,
  FederatedPointerEvent,
  PointData,
  Text,
  TextStyleFontWeight,
} from "pixi.js";
import { PIXI_UI_FONT_FAMILY } from "../../typography.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { createPixiText } from "../pixiText.js";
import { killAllMotion } from "../animation/motionCleanup.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf, motionAdd, motionSequence, motion } from "../animation/motionTween.js";
import type { MotionControl } from "../animation/motionTween.js";
import {
  iconTextureRepository,
  type IconTextureRepository,
} from "../assets/iconTextureRepository.js";
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
import type { EditButton } from "./iconControlDrawing.js";
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
import type { FolderThumbChildLocalRect, FolderThumbMetrics } from "./folderThumbMetrics.js";
import { getFolderPreviewMotionPlan } from "./folderThumbPreviewMotion.js";
import type { FolderPreviewMotionPlan } from "./folderThumbPreviewMotion.js";
import {
  getActiveAppFolderCreateHoverState as getActiveAppFolderCreateHoverStateForIcon,
  getActiveFolderHoverState as getActiveFolderHoverStateForIcon,
  getAppFolderCreateTargetPadding as getAppFolderCreateTargetPaddingForIcon,
  getFolderHoverTargetPadding as getFolderHoverTargetPaddingForIcon,
  getFolderPreviewPlanKey,
} from "./iconFolderHoverState.js";
import type { IconFolderHoverState } from "./iconFolderHoverState.js";
import { getIconLabelRenderState } from "./iconLabelLayout.js";
import { resolveLabelRasterWidth } from "./iconLabelRaster.js";
import {
  drawFocusFrame,
  shouldDrawFocusFrame,
  getFocusFrameRect as getFocusFrameRectForIcon,
} from "./iconFocusFrame.js";
import {
  getEditButtonActionAt,
  getIconHitAreaRect,
} from "./iconInteractionGeometry.js";
import type { EditButtonAction } from "./iconInteractionGeometry.js";
import type { IconVisualState } from "./iconVisualState.js";
import type { SceneDataRecord, SceneItem } from "../../sceneFrame.js";
import type { StageRect, StageVisualRect } from "../geometry/stageCoordinates.js";

type TextStyleValueKey = "fontSize" | "lineHeight" | "wordWrap" | "wordWrapWidth";
type IconInteractionPhase = "armed" | "pressing";
type VisibleIconLabelState = Exclude<ReturnType<typeof getIconLabelRenderState>, Readonly<{ visible: false }>>;

interface MutablePoint extends PointData {
  set(x: number, y?: number): unknown;
}

interface FolderPreviewChildNode extends Container {
  folderPreviewChildId?: string | null;
}

interface FolderPreviewChildReleaseOptions {
  readonly expectedChildId?: string | null | undefined;
  readonly previewIconSize?: unknown;
}

export interface FolderPreviewChildReleasePose {
  readonly center: Readonly<{ x: number; y: number }>;
  readonly matrix: Readonly<{ a: number; b: number; c: number; d: number }>;
  readonly targetChildId: string;
}

export interface FolderCenterReleasePose {
  readonly center: Readonly<{ x: number; y: number }>;
}

export type IconNodeAction = EditButtonAction | "pointerdown";

export type IconNodeActionHandler = (
  action: IconNodeAction,
  event: unknown,
  item: SceneItem | null,
  source: SceneDataRecord | null,
  node: IconNode,
) => void;

export interface IconNodeOptions {
  readonly iconTextures?: IconTextureRepository | undefined;
  readonly onAction?: IconNodeActionHandler | undefined;
}

export type IconNodeStateInput = Readonly<Partial<IconVisualState> & {
  item: SceneItem | null;
  source: SceneDataRecord | null;
}>;

type IconNodeStateUpdateOptions = Readonly<{
  preserveRootPresentation?: boolean | undefined;
}>;

interface FlashOverlayOptions {
  readonly prepare?: (() => void) | undefined;
}

interface InteractionPhaseOptions {
  readonly immediate?: boolean | undefined;
}

interface AppFolderCreateBackdropOptions {
  readonly preserveCurrentScale?: boolean | undefined;
}

interface ImmediateOption {
  readonly immediate?: boolean | undefined;
}

interface RevealLabelOptions {
  readonly onCancel?: ((reason: string) => void) | undefined;
  readonly onComplete?: (() => void) | undefined;
}

interface ReleaseFolderHandoffOptions {
  readonly fadeLabel?: boolean | undefined;
}

interface FolderHoverFrameState {
  padding: number;
}

interface AppFolderCreateFrameState {
  alpha: number;
  padding: number;
  scale: number;
}

function makeLabelText(fontSize = 13): Text {
  return createPixiText({
    text: "",
    style: {
      align: "center",
      fill: 0xffffff,
      fontFamily: [...PIXI_UI_FONT_FAMILY],
      fontSize,
      fontWeight: "500" as TextStyleFontWeight,
      lineHeight: Math.round(fontSize * 1.22),
      wordWrap: true,
      wordWrapWidth: 160,
    },
  });
}

function makeEditButton(): EditButton {
  const button = new Container() as Container & { background: Graphics; textNode: Text };
  button.background = new Graphics();
  button.textNode = createPixiText({
    text: "",
    style: { fill: 0xffffff, fontSize: 13, fontWeight: "700" as TextStyleFontWeight },
  });
  button.textNode.anchor.set(0.5);
  button.addChild(button.background);
  button.addChild(button.textNode);
  return button;
}

function setCentered(displayObject: Sprite | Text, x: number, y: number): void {
  displayObject.anchor?.set?.(0.5);
  displayObject.position.set(x, y);
}

function boolSig(value: unknown): string {
  return value ? "1" : "0";
}

function numberSig(value: unknown, digits = 3): string {
  const number = Number(value) || 0;
  return number.toFixed(digits);
}

function setTextStyleValue(textNode: Text, prop: TextStyleValueKey, value: unknown): void {
  if ((textNode.style as unknown as Record<TextStyleValueKey, unknown> | null | undefined)?.[prop] === value) return;
  (textNode.style as unknown as Record<TextStyleValueKey, unknown>)[prop] = value;
}

function setTextValue(textNode: Text, value: unknown): void {
  const next = value == null ? "" : String(value);
  if (textNode.text !== next) textNode.text = next;
}

function setPositionValue(point: MutablePoint | null | undefined, x: number, y: number): void {
  if (point?.x === x && point?.y === y) return;
  point?.set?.(x, y);
}

function copyLabelPresentation(source: Text | null | undefined, target: Text | null | undefined): void {
  if (!source || !target) return;
  setTextValue(target, source.text);
  for (const prop of ["fontSize", "lineHeight", "wordWrap", "wordWrapWidth"] as const) {
    setTextStyleValue(
      target,
      prop,
      (source.style as unknown as Record<TextStyleValueKey, unknown> | null | undefined)?.[prop],
    );
  }
  target.anchor.set(source.anchor?.x ?? 0.5, source.anchor?.y ?? 0);
  target.position.set(source.position?.x ?? 0, source.position?.y ?? 0);
}

function getIconMotionLayer(source: SceneDataRecord | null | undefined): "desktop" | "folder" | "ghost" | "search" {
  const type = source?.type || "";
  if (type === "folder") return "folder";
  if (type === "search") return "search";
  if (String(type).includes("ghost")) return "ghost";
  return "desktop";
}

function getIconMotionKind(item: SceneItem | null | undefined, source: SceneDataRecord | null | undefined): "Folder" | "FolderGhost" | "Icon" {
  if (String(source?.type || "").includes("ghost")) return "FolderGhost";
  if (item?.type === "folder") return "Folder";
  return "Icon";
}

function getIconMotionLabel(item: SceneItem | null | undefined, fallback = "Icon"): unknown {
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
const EMOJI_FONT_FAMILY = [...new Set(["Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ...PIXI_UI_FONT_FAMILY])];
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
] as const;

function playFlashOverlay(overlay: Graphics, options: FlashOverlayOptions = {}): MotionControl {
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
  declare item: SceneItem | null;
  declare source: SceneDataRecord | null;
  declare iconSize: number;
  declare jiggleKey: string | null;
  declare stageHeight: number;
  declare stageWidth: number;
  declare textless: boolean;
  declare isFolder: boolean;
  declare openingScaleActive: boolean | null;
  declare interactionPhase: IconInteractionPhase | null;
  declare readonly onAction: IconNodeActionHandler;
  declare readonly focusFrame: Graphics;
  declare readonly batchSelectionBadge: Container;
  declare readonly batchSelectionBadgeBackground: Graphics;
  declare readonly batchSelectionBadgeCheck: Graphics;
  declare readonly batchSelectionBadgeText: Text;
  declare readonly jiggleWrap: Container;
  declare readonly visualWrap: Container;
  declare readonly folderSlotReleaseVisual: Container;
  declare readonly folderSlotReleaseSprite: Sprite;
  declare readonly folderSlotReleaseEmoji: Text;
  declare readonly folderThumb: Graphics;
  declare readonly folderPreviewMask: Graphics;
  declare readonly folderChildrenWrap: Container;
  declare readonly folderFlashOverlay: Graphics;
  declare readonly folderCreateBackdrop: Graphics;
  declare readonly folderCreateFlashOverlay: Graphics;
  declare readonly iconSprite: Sprite;
  declare readonly iconTextures: IconTextureRepository;
  declare readonly emojiText: Text;
  declare readonly labelText: Text;
  declare readonly labelTransitionText: Text;
  declare readonly missingBadge: Container;
  declare readonly missingBadgeBackground: Graphics;
  declare readonly missingBadgeText: Text;
  declare readonly removeButton: EditButton;
  declare readonly changeButton: EditButton;
  declare readonly resetButton: EditButton;
  declare readonly folderChildNodes: FolderPreviewChildNode[];
  declare folderHoverActive: boolean;
  declare folderHoverKey: string | null;
  declare folderHoverPhase: string | null;
  declare folderHoverClearing: boolean;
  declare readonly folderHoverFrame: FolderHoverFrameState;
  declare folderPreviewPlanKey: string | null;
  declare appFolderCreateActive: boolean;
  declare appFolderCreateClearing: boolean;
  declare appFolderCreateKey: string | null;
  declare appFolderCreatePhase: string | null;
  declare readonly appFolderCreateFrame: AppFolderCreateFrameState;
  declare appFolderCreateBackdropSig: string;
  declare appFolderCreateFlashSig: string;
  declare readonly editButtonSigs: WeakMap<EditButton, string>;
  declare folderFlashSig: string;
  declare folderPreviewMaskSig: string;
  declare folderThumbFrameSig: string;
  declare readonly hitAreaRect: Rectangle;
  declare hitAreaSig: string;
  declare labelRenderSig: string;
  declare labelTransitionBlendActive: boolean;
  declare missingBadgeSig: string;
  declare focusFrameSig: string;
  declare batchSelectionBadgeSig: string;
  declare state?: IconVisualState;
  declare folderSlotReleaseVisualTargetSize?: number | null;
  declare folderHandoffLabelRevealInProgress?: boolean;
  declare folderHandoffLabelReleased?: boolean;
  declare folderHandoffSourceHidden?: boolean;

  constructor(options: IconNodeOptions = {}) {
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
    this.iconTextures = options.iconTextures || iconTextureRepository;

    this.focusFrame = new Graphics();
    this.batchSelectionBadge = new Container();
    this.batchSelectionBadgeBackground = new Graphics();
    this.batchSelectionBadgeCheck = new Graphics();
    this.batchSelectionBadgeText = createPixiText({
      text: "",
      style: {
        align: "center",
        fill: 0xffffff,
        fontFamily: [...PIXI_UI_FONT_FAMILY],
        fontSize: 12,
        fontWeight: "800" as TextStyleFontWeight,
        lineHeight: 12,
      },
    });
    this.jiggleWrap = new Container();
    this.visualWrap = new Container();
    this.folderSlotReleaseVisual = new Container();
    this.folderSlotReleaseSprite = new Sprite();
    this.folderSlotReleaseEmoji = createPixiText({
      text: "",
      style: {
        align: "center",
        fill: 0xffffff,
        fontFamily: EMOJI_FONT_FAMILY,
        fontSize: 16,
        lineHeight: 0,
      },
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
      style: {
        align: "center",
        fill: 0xffffff,
        fontFamily: EMOJI_FONT_FAMILY,
        fontSize: 64,
        lineHeight: 64,
      },
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
        fontFamily: [...PIXI_UI_FONT_FAMILY],
        fontSize: 12,
        fontWeight: "800" as TextStyleFontWeight,
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
    this.appFolderCreateClearing = false;
    this.appFolderCreateKey = null;
    this.appFolderCreatePhase = null;
    this.appFolderCreateFrame = { alpha: 0, padding: 0, scale: 1 };
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

  setState(
    state: IconNodeStateInput,
    options: IconNodeStateUpdateOptions = {},
  ): void {
    // Legacy callers and focused node tests intentionally provide partial frames.
    // Preserve the original one-frame ownership semantics: omitted fields clear
    // instead of inheriting from the previous frame; only draggable has a default.
    state = { draggable: true, ...state } as IconVisualState;
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
    this.state = state as IconVisualState;
    if (wasFolder !== this.isFolder) {
      this.interactionPhase = null;
      killMotionOf(this.visualWrap, "alpha");
      killMotionOf(this.visualWrap.scale);
      this.visualWrap.alpha = 1;
      this.visualWrap.scale.set(1);
    }
    this.describeMotionTargets(state);
    this.eventMode = state.interactive === false ? "none" : "static";
    if (!options.preserveRootPresentation) {
      this.visible = !state.dragging && !state.ghosted;
      this.alpha = state.opening ? 0 : 1;
    }
    this.updateOpeningScale(state as IconVisualState);
    const suppressInteractionFeedback = Boolean(
      state.dragging || state.ghosted || state.opening || state.interactive === false
    );
    this.renderVisual(state as IconVisualState);
    this.renderLabel(state as IconVisualState);
    this.renderEditButtons(state as IconVisualState);
    this.renderFrame(state as IconVisualState);
    this.renderBatchSelectionBadge(state as IconVisualState);
    this.updateHitArea(state as IconVisualState);
    this.updateJiggle(state as IconVisualState);
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

  describeMotionTargets(state: Partial<IconVisualState> = this.state || {}): void {
    const item: SceneItem | null = state.item || this.item || null;
    const source: SceneDataRecord = state.source || this.source || {};
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
    const describe = (
      target: object | null | undefined,
      targetPart: string,
      suffix: string,
      overlayTarget: object | null | undefined = target,
    ): void => {
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

  updateOpeningScale(state: IconVisualState): void {
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

  getIconBounds(stageRect: StageRect | null | undefined): StageVisualRect | null {
    return this.getVisualBounds(this.visualWrap, stageRect, this.iconSize);
  }

  getFolderThumbBounds(stageRect: StageRect | null | undefined): StageVisualRect | null {
    if (!this.isFolder) return null;
    return this.getVisualBounds(this.folderThumb, stageRect, this.iconSize);
  }

  getFolderPreviewChildBounds(
    stageRect: StageRect | null | undefined,
    slotIndex: number,
  ): StageVisualRect | null {
    if (!this.isFolder) return null;
    const thumb = getFolderThumbMetrics(this.iconSize);
    const childNode = this.folderChildNodes?.[slotIndex];
    if (childNode && !childNode.destroyed) {
      return this.getVisualBounds(childNode, stageRect, thumb.childSize);
    }
    return this.getLocalVisualBounds(this.visualWrap, stageRect, getFolderThumbChildLocalRect(thumb, slotIndex));
  }

  getFolderPreviewChildReleasePose(
    relativeTo: Container | null | undefined,
    slotIndex: number,
    options: FolderPreviewChildReleaseOptions = {},
  ): FolderPreviewChildReleasePose | null {
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

  getFolderCenterReleasePose(relativeTo: Container | null | undefined): FolderCenterReleasePose | null {
    if (!this.isFolder || !relativeTo || !this.folderThumb || this.folderThumb.destroyed) return null;
    const center = relativeTo.toLocal({ x: 0, y: 0 }, this.folderThumb);
    if (![center.x, center.y].every(Number.isFinite)) return null;
    return { center: { x: center.x, y: center.y } };
  }

  getVisualBounds(
    node: Container | null,
    stageRect: StageRect | null | undefined,
    size: number,
  ): StageVisualRect | null {
    return mapDisplayObjectLocalRectToStageRect({
      allowGlobalFallback: true,
      node,
      rect: getCenteredLocalRect(size),
      stageHeight: this.stageHeight,
      stageRect,
      stageWidth: this.stageWidth,
    } as Parameters<typeof mapDisplayObjectLocalRectToStageRect>[0]);
  }

  getLocalVisualBounds(
    node: Container | null,
    stageRect: StageRect | null | undefined,
    rect: StageRect,
  ): StageVisualRect | null {
    return mapDisplayObjectLocalRectToStageRect({
      node,
      rect,
      stageHeight: this.stageHeight,
      stageRect,
      stageWidth: this.stageWidth,
    } as Parameters<typeof mapDisplayObjectLocalRectToStageRect>[0]);
  }

  handlePointerDown(event: FederatedPointerEvent): void {
    const original = event?.nativeEvent || event;
    if (original?.button !== 0) return;
    const action = this.getEditActionAt(event);
    if (action) {
      event?.stopPropagation?.();
      (original as { preventDefault?: () => void } | null | undefined)?.preventDefault?.();
      (original as { stopPropagation?: () => void } | null | undefined)?.stopPropagation?.();
      (original as { stopImmediatePropagation?: () => void } | null | undefined)?.stopImmediatePropagation?.();
      this.onAction(action, original, this.item, this.source, this);
      return;
    }
    this.onAction("pointerdown", original, this.item, this.source, this);
  }

  setInteractionPhase(phase: string | null | undefined, options: InteractionPhaseOptions = {}): void {
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

  getEditActionAt(event: FederatedPointerEvent): EditButtonAction | null {
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

  getVisualOffsetY(): number {
    return getIconVisualOffsetY(this.textless);
  }

  prepareFolderSlotReleaseVisual(targetSize: unknown = 16): boolean {
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

  clearFolderSlotReleaseVisual(reason = "folder-slot-release-visual-clear"): void {
    const wasActive = this.folderSlotReleaseVisual.visible;
    killMotionOf(this.folderSlotReleaseVisual, "alpha", { reason });
    this.folderSlotReleaseVisual.visible = false;
    this.folderSlotReleaseVisual.alpha = 0;
    this.folderSlotReleaseVisual.scale.set(1);
    this.folderSlotReleaseVisualTargetSize = null;
    if (wasActive) this.visualWrap.alpha = 1;
  }

  setFolderSlotReleaseVisualMix(value: unknown): boolean {
    if (!this.folderSlotReleaseVisual.visible) return false;
    const mix = Math.max(0, Math.min(1, Number(value) || 0));
    this.visualWrap.alpha = 1 - mix;
    this.folderSlotReleaseVisual.alpha = mix;
    return true;
  }

  commitFolderSlotReleaseVisual(): boolean {
    return this.setFolderSlotReleaseVisualMix(1);
  }

  updateHitArea(state: IconVisualState): void {
    const rect = getIconHitAreaRect({
      editing: state.editing,
      iconSize: this.iconSize,
      itemType: this.item?.type,
      visualOffsetY: this.getVisualOffsetY(),
    } as NonNullable<Parameters<typeof getIconHitAreaRect>[0]>);
    const sig = `${numberSig(rect.left)}:${numberSig(rect.top)}:${numberSig(rect.width)}:${numberSig(rect.height)}`;
    if (this.hitAreaSig === sig) return;
    this.hitAreaSig = sig;
    this.hitAreaRect.x = rect.left;
    this.hitAreaRect.y = rect.top;
    this.hitAreaRect.width = rect.width;
    this.hitAreaRect.height = rect.height;
    this.hitArea = this.hitAreaRect;
  }

  getFrameGeometryOptions(state: Partial<IconVisualState> = this.state || {}) {
    return {
      iconSize: this.iconSize,
      labelText: this.labelText,
      maxWidth: state?.cellWidth,
      cellWidth: state?.cellWidth,
      area: state?.area,
      source: state?.source,
      visualOffsetY: this.getVisualOffsetY(),
    } as Parameters<typeof getFocusFrameRectForIcon>[0] &
      Parameters<typeof getBatchSelectionFrameRect>[0];
  }

  getFocusFrameRect(state: Partial<IconVisualState> = this.state || {}) {
    return getFocusFrameRectForIcon(this.getFrameGeometryOptions(state));
  }

  getBatchSelectionFrameRect(state: Partial<IconVisualState> = this.state || {}) {
    return getBatchSelectionFrameRect(this.getFrameGeometryOptions(state));
  }

  renderFrame(state: IconVisualState): void {
    const isFolderDropHover = Boolean(this.isFolder && state.folderHoverState?.targetId === this.item?.id);
    const isAppFolderCreateHover = Boolean(!this.isFolder && state.folderHoverState?.targetId === this.item?.id && state.folderHoverState?.targetType === "app");
    if (!shouldDrawFocusFrame({ focused: state.focused, batchSelected: state.batchSelected,
      dropTarget: state.dropTarget, isFolderDropHover, isAppFolderCreateHover })) {
      if (this.focusFrameSig !== "hidden") this.focusFrame.clear();
      this.focusFrameSig = "hidden";
      return;
    }
    const rect = state.batchSelected
      ? this.getBatchSelectionFrameRect(state)
      : this.getFocusFrameRect(state);
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

  renderBatchSelectionBadge(state: IconVisualState): void {
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

  hideFolderChildren(): void {
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

  renderVisual(state: IconVisualState): void {
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
    const texture = this.iconTextures.resolve(this.item, () => {
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

  updateJiggle(state: Pick<IconVisualState, "dragging" | "editing" | "ghosted" | "jiggleSeed">): void {
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

  stopJiggle(): void {
    killMotionOf(this.jiggleWrap, null, { lane: "additive" });
    this.jiggleWrap.rotation = 0;
    this.jiggleWrap.y = 0;
    this.jiggleKey = null;
  }

  renderFolderThumb(state: IconVisualState): void {
    const size = this.iconSize;
    const thumb = getFolderThumbMetrics(size);
    const plan = getFolderPreviewMotionPlan(
      this.item as SceneItem & { readonly childPages?: unknown } | null,
      this.getActiveFolderHoverState(state)||this.folderHoverActive||this.folderHoverClearing||this.folderChildrenWrap.y!==0
        ?state.folderPreviewPageSize:Math.min(9,state.folderPreviewPageSize||9),
      thumb,
    );
    this.drawFolderThumbFrame(size, thumb);
    this.activateFolderPreviewMask(thumb);
    this.drawFolderFlashOverlay(size, thumb);
    this.folderChildrenWrap.visible = true;
    const suppressedChildIds = new Set(state.suppressedFolderPreviewChildIds || []);

    while (this.folderChildNodes.length < Math.max(9, plan.items.length)) {
      const childContainer = new Container() as FolderPreviewChildNode;
      const childSprite = new Sprite();
      const childEmoji = createPixiText({
        text: "",
        style: { align: "center", fill: 0xffffff, fontFamily: EMOJI_FONT_FAMILY, fontSize: 14, lineHeight: 0 },
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
      const node = this.folderChildNodes[index]!;
      const childSprite = node.children[0] as Sprite;
      const childEmoji = node.children[1] as Text;
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
      const texture = this.iconTextures.resolve(child, () => {
        if (this.destroyed || !this.state || this.item?.type !== "folder") return;
        const currentPlan = getFolderPreviewMotionPlan(
          this.item as SceneItem & { readonly childPages?: unknown } | null,
          this.state.folderPreviewPageSize,
          getFolderThumbMetrics(this.iconSize),
        );
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

  getFolderHoverTargetPadding(): number {
    return getFolderHoverTargetPaddingForIcon(this.iconSize);
  }

  getFolderHoverPadding(): number {
    return Math.max(0, Number(this.folderHoverFrame?.padding) || 0);
  }

  drawFolderThumbFrame(size: number, thumb: FolderThumbMetrics): void {
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

  activateFolderPreviewMask(thumb: FolderThumbMetrics): void {
    this.drawFolderPreviewMask(thumb);
    this.folderPreviewMask.visible = true;
    if (this.folderChildrenWrap.mask !== this.folderPreviewMask) {
      this.folderChildrenWrap.mask = this.folderPreviewMask;
    }
  }

  deactivateFolderPreviewMask(): void {
    const wasAttached = this.folderChildrenWrap.mask === this.folderPreviewMask;
    const hadGeometry = Boolean(this.folderPreviewMaskSig);
    if (wasAttached) this.folderChildrenWrap.mask = null;
    this.folderPreviewMask.visible = false;
    if (wasAttached || hadGeometry) this.folderPreviewMask.clear();
    this.folderPreviewMaskSig = "";
  }

  drawFolderPreviewMask(thumb: FolderThumbMetrics): void {
    const sig = `${numberSig(this.iconSize)}:${numberSig(thumb.start)}:${numberSig(thumb.childSize)}:${numberSig(thumb.gap)}`;
    if (this.folderPreviewMaskSig === sig) return;
    this.folderPreviewMaskSig = sig;
    drawFolderPreviewMaskGraphic(this.folderPreviewMask, this.iconSize, thumb);
  }

  drawFolderFlashOverlay(size: number, thumb: FolderThumbMetrics): void {
    const sig = `${numberSig(size)}:${numberSig(thumb.radius)}:${numberSig(this.getFolderHoverPadding())}`;
    if (this.folderFlashSig === sig) return;
    this.folderFlashSig = sig;
    drawFolderFlashOverlayGraphic(this.folderFlashOverlay, size, thumb, this.getFolderHoverPadding());
  }

  redrawFolderHoverFrame(): void {
    if (!this.isFolder) return;
    const size = this.iconSize;
    const thumb = getFolderThumbMetrics(size);
    this.drawFolderThumbFrame(size, thumb);
    this.drawFolderFlashOverlay(size, thumb);
  }

  prepareFolderHoverFrame(targetPadding: unknown): number {
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

  getActiveFolderHoverState(state: Pick<IconVisualState, "folderHoverState">): IconFolderHoverState | null {
    return getActiveFolderHoverStateForIcon({
      hoverState: state.folderHoverState as IconFolderHoverState | null,
      isFolder: this.isFolder,
      itemId: this.item?.id,
    } as Parameters<typeof getActiveFolderHoverStateForIcon>[0]);
  }

  updateFolderHoverAnimation(
    state: Pick<IconVisualState, "folderHoverState">,
    plan: Pick<FolderPreviewMotionPlan, "endY" | "items" | "startY">,
  ): void {
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

  playFolderFlash(): void {
    playFlashOverlay(this.folderFlashOverlay);
  }

  clearFolderHoverAnimation(): void {
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
      .to({ y: 0,onComplete:()=>{
        if(!this.destroyed&&this.isFolder&&this.state&&!this.getActiveFolderHoverState(this.state))this.renderFolderThumb(this.state);
      } })
      .start();
    killMotionOf(this.folderFlashOverlay);
    this.folderFlashOverlay.alpha = 0;
    this.folderFlashOverlay.visible = false;
  }

  resetFolderPreviewAfterGhost(): void {
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

  getActiveAppFolderCreateHoverState(state: Pick<IconVisualState, "folderHoverState">): IconFolderHoverState | null {
    return getActiveAppFolderCreateHoverStateForIcon({
      hoverState: state.folderHoverState as IconFolderHoverState | null,
      isFolder: this.isFolder,
      itemId: this.item?.id,
      itemType: this.item?.type,
    } as Parameters<typeof getActiveAppFolderCreateHoverStateForIcon>[0]);
  }

  getAppFolderCreateTargetPadding(): number {
    return getAppFolderCreateTargetPaddingForIcon(this.iconSize);
  }

  drawAppFolderCreateBackdrop(): void {
    const sig = `${numberSig(this.iconSize)}:${numberSig(this.appFolderCreateFrame.padding)}`;
    if (this.appFolderCreateBackdropSig === sig) return;
    this.appFolderCreateBackdropSig = sig;
    drawAppFolderCreateBackdropGraphic(this.folderCreateBackdrop, this.iconSize, {alpha:1,padding:this.appFolderCreateFrame.padding});
  }

  drawAppFolderCreateFlashOverlay(): void {
    const sig = `${numberSig(this.iconSize)}:${numberSig(this.appFolderCreateFrame.padding)}:${boolSig(this.folderCreateFlashOverlay.visible)}`;
    if (this.appFolderCreateFlashSig === sig) return;
    this.appFolderCreateFlashSig = sig;
    drawAppFolderCreateFlashOverlayGraphic(this.folderCreateFlashOverlay, this.iconSize, this.appFolderCreateFrame);
  }

  redrawAppFolderCreateFrame(): void {
    this.drawAppFolderCreateBackdrop();
    this.folderCreateBackdrop.alpha = this.appFolderCreateFrame.alpha;
    this.folderCreateBackdrop.scale.set(this.appFolderCreateFrame.scale);
    this.folderCreateBackdrop.visible = this.appFolderCreateActive || this.appFolderCreateClearing;
    if (this.folderCreateFlashOverlay.visible) this.drawAppFolderCreateFlashOverlay();
  }

  prepareAppFolderCreateBackdrop(
    targetPadding: unknown,
    options: AppFolderCreateBackdropOptions = {},
  ): void {
    const previousPadding = Math.max(0, Number(this.appFolderCreateFrame.padding) || 0);
    const nextPadding = Math.max(0, Number(targetPadding) || 0);
    const previousScale = Math.max(0.01, this.appFolderCreateFrame.scale);
    const nextScale = options.preserveCurrentScale
      ? previousScale
      : previousScale * getPaddedFrameScale(this.iconSize, previousPadding, nextPadding);
    this.appFolderCreateFrame.padding = nextPadding;
    this.appFolderCreateFrame.scale = nextScale;
    this.redrawAppFolderCreateFrame();
  }

  tweenAppFolderCreateIconAlpha(alpha: number, options: ImmediateOption = {}): void {
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

  updateAppFolderCreateHoverAnimation(state: Pick<IconVisualState, "folderHoverState">): void {
    const hoverState = this.getActiveAppFolderCreateHoverState(state);
    if (!hoverState) {
      this.clearAppFolderCreateHoverAnimation();
      return;
    }

    const wasActive = this.appFolderCreateActive;
    this.appFolderCreateActive = true;
    this.appFolderCreateClearing = false;
    const targetPadding = this.getAppFolderCreateTargetPadding();
    this.prepareAppFolderCreateBackdrop(targetPadding, {
      preserveCurrentScale: wasActive || this.folderCreateBackdrop.visible,
    });
    if (!wasActive) {
      // Geometry updates and interrupted exits share one presentation state.
      // Never animate Graphics.alpha while renderVisual writes a second alpha.
      motion(this.appFolderCreateFrame)
        .duration(APP_FOLDER_CREATE_FRAME_DURATION)
        .ease("power3.out")
        .overlay()
        .blend(APP_FOLDER_CREATE_BLEND_DURATION, APP_FOLDER_CREATE_BLEND_EASE)
        .to({
          alpha: 1,
          scale: 1,
          onUpdate: () => this.redrawAppFolderCreateFrame(),
          onComplete: () => this.redrawAppFolderCreateFrame(),
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

  playAppFolderCreateFlash(): void {
    playFlashOverlay(this.folderCreateFlashOverlay, {
      prepare: () => this.drawAppFolderCreateFlashOverlay(),
    });
  }

  clearAppFolderCreateHoverAnimation(options: ImmediateOption = {}): void {
    const shouldClear = this.appFolderCreateActive ||
      this.folderCreateBackdrop.visible ||
      this.iconSprite.alpha !== 1 ||
      this.emojiText.alpha !== 1 ||
      this.folderCreateFlashOverlay.visible;
    if (!shouldClear) return;
    if (this.appFolderCreateClearing && !options.immediate) return;

    this.appFolderCreateActive = false;
    this.appFolderCreateKey = null;
    this.appFolderCreatePhase = null;
    killMotionOf(this.folderCreateFlashOverlay);
    this.folderCreateFlashOverlay.alpha = 0;
    this.folderCreateFlashOverlay.visible = false;

    if (options.immediate) {
      killMotionOf(this.appFolderCreateFrame);
      this.appFolderCreateClearing = false;
      this.appFolderCreateFrame.alpha = 0;
      this.appFolderCreateFrame.padding = 0;
      this.appFolderCreateFrame.scale = 1;
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
    this.appFolderCreateClearing = true;
    motion(this.appFolderCreateFrame)
      .duration(FOLDER_HOVER_RESET_DURATION)
      .ease("power3.out")
      .overlay()
      .blend(APP_FOLDER_CREATE_BLEND_DURATION, APP_FOLDER_CREATE_BLEND_EASE)
      .to({
        alpha: 0,
        scale: hiddenScale,
        onUpdate: () => this.redrawAppFolderCreateFrame(),
        onComplete: () => {
          if (this.appFolderCreateActive) return;
          this.appFolderCreateClearing = false;
          this.appFolderCreateFrame.alpha = 0;
          this.appFolderCreateFrame.padding = 0;
          this.appFolderCreateFrame.scale = 1;
          this.appFolderCreateBackdropSig = "";
          this.folderCreateBackdrop.clear();
          this.folderCreateBackdrop.visible = false;
        },
      })
      .start();
    this.tweenAppFolderCreateIconAlpha(1);
  }

  renderMissingBadge(state: Pick<IconVisualState, "launchTargetStatus" | "badge">): void {
    const sig = `${numberSig(this.iconSize)}:${state.launchTargetStatus || ""}:${state.badge?.admin}:${state.badge?.missing}`;
    if (this.missingBadgeSig === sig) return;
    this.missingBadgeSig = sig;
    drawMissingBadge(this.missingBadge, this.missingBadgeBackground, this.missingBadgeText, this.iconSize, state.launchTargetStatus, state.badge);
  }

  renderLabel(state: IconVisualState): void {
    const requestedLabelState = getIconLabelRenderState({
      cellWidth: state.cellWidth,
      compact: state.compact,
      iconSize: this.iconSize,
      itemName: this.item?.name,
      singleLineLabel: state.singleLineLabel,
      textless: this.textless,
    });
    const labelState = requestedLabelState.visible
      ? { ...requestedLabelState, wordWrapWidth: resolveLabelRasterWidth(this.labelText, requestedLabelState) }
      : requestedLabelState;
    const sig = [
      boolSig(labelState.visible),
      (labelState as VisibleIconLabelState).text || "",
      numberSig((labelState as VisibleIconLabelState).fontSize),
      numberSig((labelState as VisibleIconLabelState).lineHeight),
      boolSig((labelState as VisibleIconLabelState).wordWrap),
      numberSig((labelState as VisibleIconLabelState).wordWrapWidth),
      numberSig((labelState as VisibleIconLabelState).anchorX),
      numberSig((labelState as VisibleIconLabelState).anchorY),
      numberSig((labelState as VisibleIconLabelState).x),
      numberSig((labelState as VisibleIconLabelState).y),
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
    setTextStyleValue(this.labelText, "fontSize", (labelState as VisibleIconLabelState).fontSize);
    setTextStyleValue(this.labelText, "lineHeight", (labelState as VisibleIconLabelState).lineHeight);
    setTextStyleValue(this.labelText, "wordWrap", (labelState as VisibleIconLabelState).wordWrap);
    setTextStyleValue(this.labelText, "wordWrapWidth", (labelState as VisibleIconLabelState).wordWrapWidth);
    setTextValue(this.labelText, (labelState as VisibleIconLabelState).text);
    this.labelText.anchor.set(
      (labelState as VisibleIconLabelState).anchorX,
      (labelState as VisibleIconLabelState).anchorY,
    );
    setPositionValue(
      this.labelText.position,
      (labelState as VisibleIconLabelState).x,
      (labelState as VisibleIconLabelState).y,
    );
    if (!state.visualSpecTransition?.active && this.labelTransitionBlendActive) {
      this.finishLabelTransitionBlend();
    }
  }

  finishLabelTransitionBlend(): void {
    if (!this.labelTransitionBlendActive && !this.labelTransitionText.visible) return;
    killMotionOf(this.labelTransitionText);
    killMotionOf(this.labelText);
    this.labelTransitionText.alpha = 0;
    this.labelTransitionText.visible = false;
    if (this.labelText.visible) this.labelText.alpha = 1;
    this.labelTransitionBlendActive = false;
  }

  revealLabelAfterGhost(options: RevealLabelOptions = {}): void {
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

  cancelFolderHandoffLabelFade(): void {
    if (!this.folderHandoffLabelRevealInProgress) return;
    this.folderHandoffLabelRevealInProgress = false;
    killMotionOf(this.labelText);
  }

  startFolderHandoffLabelFade(): void {
    if (!this.labelText?.visible) return;
    this.cancelFolderHandoffLabelFade();
    killMotionOf(this.labelText);
    this.labelText.renderable = true;
    this.labelText.alpha = 0;
    this.folderHandoffLabelReleased = true;
    this.folderHandoffLabelRevealInProgress = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.folderHandoffLabelRevealInProgress = false;
      if ((!this.folderHandoffSourceHidden || this.folderHandoffLabelReleased) && this.labelText?.visible) {
        this.labelText.renderable = true;
        this.labelText.alpha = 1;
      }
    };
    motion(this.labelText)
      .preset("fade", { duration: 0.24, ease: "linear" })
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 1, onCancel: finish, onComplete: finish })
      .start();
  }

  setFolderHandoffSourceHidden(hidden: unknown): void {
    const sourceHidden = Boolean(hidden);
    this.folderHandoffSourceHidden = sourceHidden;
    this.visualWrap.visible = !sourceHidden;
    if (this.labelText) {
      this.labelText.renderable = !sourceHidden;
      if (sourceHidden) {
        this.folderHandoffLabelReleased = false;
        this.finishLabelTransitionBlend();
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

  setFolderHandoffVisualHidden(hidden: unknown): void {
    this.setFolderHandoffSourceHidden(hidden);
  }

  releaseFolderHandoffLabel(): void {
    if (!this.folderHandoffSourceHidden || this.folderHandoffLabelReleased || !this.labelText?.visible) return;
    this.startFolderHandoffLabelFade();
  }

  releaseFolderHandoffSource(options: ReleaseFolderHandoffOptions = {}): void {
    const labelAlreadyReleased = this.folderHandoffLabelReleased === true;
    this.setFolderHandoffSourceHidden(false);
    if (!this.labelText?.visible) return;
    this.labelText.renderable = true;
    if (options.fadeLabel === false) {
      this.restoreLabelAfterGhost();
    } else if (labelAlreadyReleased) {
      this.folderHandoffLabelReleased = true;
    } else {
      this.startFolderHandoffLabelFade();
    }
  }

  restoreLabelAfterGhost(): void {
    if (!this.labelText.visible) return;
    this.cancelFolderHandoffLabelFade();
    killMotionOf(this.labelText);
    this.labelText.alpha = 1;
    this.folderHandoffLabelReleased = false;
  }

  renderEditButtons(state: IconVisualState): void {
    this.drawEditButton(this.removeButton, -this.iconSize / 2 + 2, -this.iconSize / 2 + 2, "×", state.editing && state.removable && this.item?.type === "app");
    this.drawEditButton(this.changeButton, this.iconSize / 2 - 2, -this.iconSize / 2 + 2, "+", state.editing && this.item?.type === "app");
    this.drawEditButton(this.resetButton, this.iconSize / 2 - 2, this.iconSize / 2 - 2, "↺", state.editing && state.hasCustomIcon && this.item?.type === "app");
  }

  drawEditButton(button: EditButton, x: number, y: number, label: string, visible: boolean): void {
    const sig = `${numberSig(x)}:${numberSig(y)}:${label}:${boolSig(visible)}`;
    if (this.editButtonSigs.get(button) === sig) return;
    this.editButtonSigs.set(button, sig);
    drawEditButtonGraphic(button, x, y, label, visible);
  }

  override destroy(options?: DestroyOptions): void {
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
