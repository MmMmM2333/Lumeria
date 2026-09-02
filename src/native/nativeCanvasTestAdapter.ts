import { Image, createCanvas } from "@napi-rs/canvas";
import { DOMAdapter, type Adapter } from "pixi.js";

const Canvas2D = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d")).constructor as ReturnType<
  Adapter["getCanvasRenderingContext2D"]
>;

export function installNativeCanvasTestAdapter(): void {
  const adapter = DOMAdapter.get();
  DOMAdapter.set({
    ...adapter,
    createCanvas: (width = 1, height = 1) => createCanvas(width, height) as unknown as ReturnType<Adapter["createCanvas"]>,
    createImage: () => new Image() as unknown as ReturnType<Adapter["createImage"]>,
    getCanvasRenderingContext2D: () => Canvas2D,
    getFontFaceSet: () => null,
    getNavigator: () => ({ gpu: null, userAgent: "LaunchPad native scene test" }),
  });
}
