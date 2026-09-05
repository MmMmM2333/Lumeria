import { Container, Graphics, Rectangle } from "pixi.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import type { CompleteDesktopSceneFrame } from "../sceneFrame.js";

/** Same 22×44 hit targets, 10px dots and colors as launchpad.css. */
export class NativePageDots extends Container {
  #targetAlpha = 1;
  #activeIndex = 0;
  readonly #dots: { button: Container; dot: Graphics; selection: Graphics }[] = [];
  constructor(readonly onPage: (index: number) => void) {
    super({ label: "native-desktop-page-dots" });
  }
  update(frame: CompleteDesktopSceneFrame, width: number, height: number, hidden: boolean): void {
    const count = frame.viewport.activePages.length;
    this.#activeIndex = frame.viewport.activePageIndex;
    while (this.#dots.length > count) this.#dots.pop()!.button.destroy({ children: true });
    while (this.#dots.length < count) {
      const index = this.#dots.length;
      const button = new Container({ label: `native-page-dot:${index}`, eventMode: "static", cursor: "pointer" });
      button.hitArea = new Rectangle(0, 0, 22, 44);
      const dot = new Graphics().circle(11, 22, 5).fill(0xffffff);
      const selection = new Graphics().circle(16, 8, 3).fill(0x55aaff).stroke({ color: 0xffffff, alpha: 0.88, width: 1 });
      selection.eventMode = dot.eventMode = "none";
      const fade = (hover: boolean) => motion(dot).preset("fade").to({ alpha: this.#activeIndex === index ? 0.96 : hover ? 0.5 : 0.28 }).start();
      button.on("pointerover", () => fade(true));
      button.on("pointerout", () => fade(false));
      button.on("pointerdown", event => event.stopPropagation());
      button.on("pointertap", event => { event.stopPropagation(); this.onPage(index); });
      button.on("destroyed", () => killMotionOf(dot));
      button.addChild(dot, selection);
      this.addChild(button);
      this.#dots.push({ button, dot, selection });
    }
    this.position.set((width - count * 22) / 2, height - 62);
    for (const [index, { button, dot, selection }] of this.#dots.entries()) {
      button.x = index * 22;
      dot.alpha = index === this.#activeIndex ? 0.96 : 0.28;
      selection.visible = frame.viewport.activePages[index]!.some(item => item && frame.interaction.selectedAppIds.has(item.id));
    }
    this.interactiveChildren = !hidden;
    const alpha = hidden ? 0 : 1;
    if (alpha !== this.#targetAlpha) {
      this.#targetAlpha = alpha;
      motion(this).preset("fade").to({ alpha }).start();
    }
  }
  override destroy(): void {
    killMotionOf(this);
    super.destroy({ children: true });
  }
}
