import { mapLocalRectToStageRect } from "../geometry/stageCoordinates.js";

export function makeIconRect(centerX, centerY, size) {
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    width: size,
    height: size,
  };
}

export function makeTargetIconBounds(stageRect, stageWidth, stageHeight, centerX, centerY, size, visualOffsetY = 0) {
  return mapLocalRectToStageRect(
    stageRect,
    stageWidth,
    stageHeight,
    makeIconRect(centerX, centerY + (Number(visualOffsetY) || 0), size)
  );
}

export function makeSyntheticPointerEvent(original, node) {
  const native = original?.nativeEvent || original || {};
  const bounds = node.getIconBounds(node.stageRect || { left: 0, top: 0 });
  return {
    button: native.button ?? 0,
    buttons: native.buttons ?? 1,
    clientX: native.clientX ?? 0,
    clientY: native.clientY ?? 0,
    currentTarget: {
      getBoundingClientRect: () => bounds,
      querySelector: () => null,
    },
    pointerId: native.pointerId,
    preventDefault: () => native.preventDefault?.(),
    stopPropagation: () => native.stopPropagation?.(),
    target: native.target,
    type: native.type || "pointerdown",
  };
}
