export type DragHost = Readonly<{
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
  addEventListener(type: "contextmenu", listener: (event: MouseEvent) => void, capture: boolean): void;
  removeEventListener(type: "contextmenu", listener: (event: MouseEvent) => void, capture: boolean): void;
  afterCommit(callback: () => void): void;
}>;
