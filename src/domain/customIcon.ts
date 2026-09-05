import { ICON_SIZE_MAX } from "./launchpadGridDefaults.js";
export const CUSTOM_ICON_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const CUSTOM_ICON_DATA_URL_MAX_LENGTH = 1_400_000;
export const CUSTOM_ICON_MIN_SOURCE_SIZE = 16;
export function getCustomIconCanvasSize(width: unknown, height: unknown): number {
  const sourceMax = Math.max(Number(width) || 0, Number(height) || 0);
  if (sourceMax <= 0) return ICON_SIZE_MAX;
  return Math.min(ICON_SIZE_MAX * 2, Math.max(ICON_SIZE_MAX, sourceMax));
}
export function getCustomIconPlacement(width:number,height:number) {
  const size=getCustomIconCanvasSize(width,height),scale=Math.min(size/width,size/height);
  const drawWidth=Math.max(1,Math.round(width*scale)),drawHeight=Math.max(1,Math.round(height*scale));
  return {size,width:drawWidth,height:drawHeight,x:Math.round((size-drawWidth)/2),y:Math.round((size-drawHeight)/2)};
}
