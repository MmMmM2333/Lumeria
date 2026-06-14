import { Container, Text } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getDesktopGridMetrics, getGridSlotRect, makeRect } from "../geometry/gridGeometry.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";
import { makeStageVirtualElement } from "../geometry/stageCoordinates.js";
import {
  clearFolderPreviewChildBounds,
  clearLaunchIconBounds,
  registerFolderPreviewChildBounds,
  registerFolderPreviewChildTargetBounds,
  registerLaunchIconBounds,
  registerLaunchIconTargetBounds,
  registerTopLevelFolderThumbBounds,
  registerTopLevelFolderThumbTargetBounds,
  registerTopLevelIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import { layoutDuration, layoutEase, quickDuration, quickEase } from "../animation/eases.js";
import { pageTrackSpring, springTo, stopTargetSprings } from "../animation/springMotion.js";
import {
  isActiveDraggedLaunchItem,
  isReleaseGhostLaunchItem,
} from "./dragVisibility.js";
import { makeSyntheticPointerEvent, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { IconNode } from "../nodes/IconNode.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";

function sourceArea(source) {
  if (source.type === "folder") return "folder";
  if (source.type === "search") return "search";
  return "desktop";
}

function getDesktopIconSizing(state, slot) {
  const configuredSize = Math.max(1, Number(state.iconSize) || 64);
  const labelReserve = state.isTextlessMode ? 14 : 24;
  const maxByHeight = Math.max(36, slot.height - labelReserve);
  const iconSize = Math.max(36, Math.min(configuredSize, maxByHeight));
  const compact = iconSize < configuredSize || state.width <= 960 || slot.height < configuredSize + 42;
  return {
    compact,
    iconSize,
    singleLineLabel: false,
  };
}

function makeTargetFolderPreviewChildBounds(stageRect, stageWidth, stageHeight, centerX, centerY, iconSize, visualOffsetY, slotIndex) {
  const thumb = getFolderThumbMetrics(iconSize);
  const col = slotIndex % 3;
  const row = Math.floor(slotIndex / 3);
  const childCenterX = centerX + thumb.start + col * (thumb.childSize + thumb.gap);
  const childCenterY = centerY + thumb.start + row * (thumb.childSize + thumb.gap);
  return makeTargetIconBounds(
    stageRect,
    stageWidth,
    stageHeight,
    childCenterX,
    childCenterY,
    thumb.childSize,
    visualOffsetY
  );
}

export class DesktopLayer extends Container {
  constructor(options = {}) {
    super();
    this.pageTrack = new Container();
    this.iconNodes = new Map();
    this.boundsRegistration = null;
    this.emptyText = new Text({
      text: "没有找到匹配的应用",
      style: { fill: 0xffffff, fontSize: 15, alpha: 0.74, fontFamily: "Inter, Segoe UI, sans-serif" },
    });
    this.emptyText.anchor.set(0.5);
    this.addChild(this.pageTrack);
    this.addChild(this.emptyText);
    this.onIconAction = options.onIconAction || (() => {});
  }

  update(state) {
    this.stageRect = state.stageRect;
    this.widthValue = state.width;
    this.heightValue = state.height;
    const pages = state.activePages || [];
    const activePageIndex = state.activePageIndex || 0;
    const targetX = -activePageIndex * state.width;
    const shouldSnap = state.shouldSnapTrack;

    clearLaunchIconBounds(state.isSearchMode ? "search" : "desktop");
    for (const page of pages) {
      for (const item of page || []) {
        if (item?.type === "folder") clearFolderPreviewChildBounds(item.id);
      }
    }

    const seen = new Set();
    const boundsEntries = [];
    pages.forEach((page, pageIndex) => {
      const visibleItems = state.getVisibleDesktopPage(page);
      const renderMode = state.getDesktopPageRenderMode?.(pageIndex) || "interactive";
      const isInteractivePage = renderMode === "interactive";
      const metrics = getDesktopGridMetrics({
        cols: state.gridCols,
        height: state.height,
        isSearchMode: state.isSearchMode,
        paddingTop: state.desktopGridDebugOptions?.paddingTop,
        rows: state.gridRows,
        visibleCount: visibleItems.length,
        width: state.width,
      });
      if (typeof state.setPageRef === "function") {
        const gridRect = makeRect(metrics.gridLeft, metrics.gridTop, metrics.gridWidth, metrics.gridHeight);
        state.setPageRef(makeStageVirtualElement(state.stageRect, state.width, state.height, gridRect), pageIndex);
      }
      if (renderMode === "empty") return;

      visibleItems.forEach((item, index) => {
        const slot = getGridSlotRect(metrics, index);
        const sizing = getDesktopIconSizing(state, slot);
        const x = pageIndex * state.width + slot.left + slot.width / 2;
        const y = slot.top + slot.height / 2;
        const source = { type: state.isSearchMode ? "search" : "page", pageIndex, index };
        const key = `${source.type}:${pageIndex}:${item.id}`;
        const isActiveDraggedItem = isActiveDraggedLaunchItem(item, state);
        const isReleaseGhostItem = isReleaseGhostLaunchItem(item, state);
        seen.add(key);
        let node = this.iconNodes.get(key);
        if (!node) {
          node = new IconNode({
            onAction: (action, originalEvent, actionItem, actionSource, iconNode) =>
              this.handleIconAction(action, originalEvent, actionItem, actionSource, iconNode),
          });
          node.alpha = 0;
          node.position.set(x, y + 8);
          this.iconNodes.set(key, node);
          this.pageTrack.addChild(node);
          gsap.to(node, { alpha: 1, y, duration: quickDuration, ease: quickEase });
        } else {
          gsap.to(node, { duration: layoutDuration, ease: layoutEase, overwrite: "auto", x, y });
        }

        node.stageRect = state.stageRect;
        const isFolderSourceGhosted = item.type === "folder" && (
          state.folderSourceGhostedId === item.id ||
          state.isFolderOpeningPreviewFrameGhosted?.(item.id)
        );
        node.setState({
          cellHeight: slot.height,
          cellWidth: slot.width,
          compact: sizing.compact,
          dragging: !state.isSearchMode && isActiveDraggedItem,
          draggable: isInteractivePage && !state.isSearchMode,
          dropTarget: isInteractivePage && !state.isSearchMode && state.dragFolderTargetId === item.id,
          editing: isInteractivePage && state.isEditMode,
          folderHoverState: isInteractivePage && !state.isSearchMode && state.dragFolderHoverState?.targetId === item.id
            ? state.dragFolderHoverState
            : null,
          folderPreviewPageSize: state.folderPageSize,
          ghosted: isReleaseGhostItem ||
            (isInteractivePage && isFolderSourceGhosted),
          hasCustomIcon: Boolean(item.customIconPath || item.customIconDataUrl),
          iconSize: sizing.iconSize,
          interactive: isInteractivePage,
          item,
          jiggleSeed: pageIndex * 100 + index,
          launchTargetStatus: isInteractivePage && state.showMissingLaunchTargetBadge ? state.launchTargetStatusById?.[item.id] : null,
          opening: isInteractivePage && state.isIconOpening?.(state.isSearchMode ? "search" : "desktop", item.id, pageIndex),
          removable: item.type === "app",
          selected: isInteractivePage && state.isIconSelected?.(state.isSearchMode ? "search" : "desktop", item.id, pageIndex),
          source,
          singleLineLabel: sizing.singleLineLabel,
          stageHeight: state.height,
          stageWidth: state.width,
          suppressLabelRevealAfterGhost: isReleaseGhostItem || isFolderSourceGhosted,
          textless: state.isTextlessMode,
        });

        if (isInteractivePage) {
          const area = sourceArea(source);
          boundsEntries.push({ area, index, item, node, pageIndex, sizing, targetX, x, y });
        }
      });
    });

    this.emptyText.visible = Boolean(state.isSearchMode && pages[activePageIndex]?.length === 0);
    this.emptyText.position.set(state.width / 2, state.height / 2);
    for (const [key, node] of this.iconNodes) {
      if (seen.has(key)) continue;
      this.iconNodes.delete(key);
      gsap.killTweensOf(node);
      gsap.to(node, {
        alpha: 0,
        duration: quickDuration,
        ease: quickEase,
        onComplete: () => node.destroy({ children: true }),
      });
    }

    this.boundsRegistration = {
      entries: boundsEntries,
      height: state.height,
      isTextlessMode: state.isTextlessMode,
      stableStageRect: state.stableStageRect || state.stageRect,
      stageRect: state.stageRect,
      width: state.width,
    };
    const refreshBounds = () => this.refreshInteractiveBounds();
    springTo(this.pageTrack, "x", targetX, pageTrackSpring, {
      snap: shouldSnap,
      onComplete: refreshBounds,
      onUpdate: refreshBounds,
    });
    refreshBounds();
  }

  refreshInteractiveBounds() {
    const registration = this.boundsRegistration;
    if (!registration) return;
    for (const entry of registration.entries) {
      const { area, index, item, node, pageIndex, sizing, targetX, x, y } = entry;
      if (!item?.id || !node || node.destroyed) continue;
      const iconBounds = node.getIconBounds(registration.stageRect);
      const meta = { area, id: item.id, index, item, pageIndex };
      const visualOffsetY = getIconVisualOffsetY(registration.isTextlessMode);
      const stableTargetBounds = makeTargetIconBounds(
        registration.stableStageRect,
        registration.width,
        registration.height,
        targetX + x,
        y,
        sizing.iconSize,
        visualOffsetY
      );
      registerLaunchIconBounds(
        { area, folderId: null, id: item.id, pageIndex },
        iconBounds,
        meta
      );
      registerLaunchIconTargetBounds(
        { area, folderId: null, id: item.id, pageIndex },
        makeTargetIconBounds(
          registration.stageRect,
          registration.width,
          registration.height,
          targetX + x,
          y,
          sizing.iconSize,
          visualOffsetY
        ),
        meta
      );
      if (area === "desktop") registerTopLevelIconTargetBounds(item.id, stableTargetBounds, meta);
      if (item.type === "folder") {
        const folderThumbBounds = node.getFolderThumbBounds(registration.stageRect);
        registerTopLevelFolderThumbBounds(item.id, folderThumbBounds, meta);
        if (area === "desktop") registerTopLevelFolderThumbTargetBounds(item.id, stableTargetBounds, meta);
        this.registerFolderChildren(item, node, registration.stageRect, {
          centerX: targetX + x,
          centerY: y,
          height: registration.height,
          iconSize: sizing.iconSize,
          stableStageRect: registration.stableStageRect,
          visualOffsetY,
          width: registration.width,
        });
      }
    }
  }

  registerFolderChildren(folder, node, stageRect, target = null) {
    for (let index = 0; index < 9; index += 1) {
      const child = node.item ? node.item.childPages?.[0]?.[index] || node.item.children?.[index] : null;
      if (!child?.id) continue;
      const childRect = node.getFolderPreviewChildBounds(stageRect, index);
      if (childRect) registerFolderPreviewChildBounds(folder.id, child.id, index, childRect);
      if (target?.stableStageRect) {
        const targetChildRect = makeTargetFolderPreviewChildBounds(
          target.stableStageRect,
          target.width,
          target.height,
          target.centerX,
          target.centerY,
          target.iconSize,
          target.visualOffsetY,
          index
        );
        registerFolderPreviewChildTargetBounds(folder.id, child.id, index, targetChildRect);
      }
    }
  }

  handleIconAction(action, originalEvent, item, source, node) {
    const event = makeSyntheticPointerEvent(originalEvent, node);
    this.onIconAction(action, event, item, source, node);
  }

  destroy(options) {
    this.boundsRegistration = null;
    stopTargetSprings(this.pageTrack);
    super.destroy(options);
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
