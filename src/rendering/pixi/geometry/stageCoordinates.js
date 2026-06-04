import { reloadOnPixiHotUpdate } from "../devHmr.js";

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getStageScale(stageRect, stageWidth, stageHeight) {
  const layoutWidth = Math.max(1, safeNumber(stageWidth, 1));
  const layoutHeight = Math.max(1, safeNumber(stageHeight, 1));
  const rectWidth = safeNumber(stageRect?.width, layoutWidth);
  const rectHeight = safeNumber(stageRect?.height, layoutHeight);
  return {
    scaleX: rectWidth > 0 ? rectWidth / layoutWidth : 1,
    scaleY: rectHeight > 0 ? rectHeight / layoutHeight : 1,
  };
}

export function mapLocalRectToStageRect(stageRect, stageWidth, stageHeight, rect) {
  const source = rect || {};
  const { scaleX, scaleY } = getStageScale(stageRect, stageWidth, stageHeight);
  const left = safeNumber(stageRect?.left) + safeNumber(source.left) * scaleX;
  const top = safeNumber(stageRect?.top) + safeNumber(source.top) * scaleY;
  const width = Math.max(0, safeNumber(source.width) * scaleX);
  const height = Math.max(0, safeNumber(source.height) * scaleY);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

export function makeStageVirtualElement(stageRect, stageWidth, stageHeight, localRect) {
  const visualRect = mapLocalRectToStageRect(stageRect, stageWidth, stageHeight, localRect);
  const layoutWidth = Math.max(0, safeNumber(localRect?.width, visualRect.width));
  const layoutHeight = Math.max(0, safeNumber(localRect?.height, visualRect.height));
  return {
    clientHeight: layoutHeight,
    clientWidth: layoutWidth,
    offsetHeight: layoutHeight,
    offsetWidth: layoutWidth,
    getBoundingClientRect: () => visualRect,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
