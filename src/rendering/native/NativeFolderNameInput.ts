import { Container, Graphics, Rectangle } from "pixi.js";
import type { TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/input/text-input.js";
import type { SingleStageFolderTitleFrame } from "../pixi/scene/singleStageFolderDomControls.js";
export type { SingleStageFolderTitleFrame } from "../pixi/scene/singleStageFolderDomControls.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";

/** The folder title is the editor, using the same native input session as other controls. */
export class NativeFolderNameInput extends Container {
  readonly input;
  readonly #background = new Graphics({ eventMode: "none" });
  readonly #paint = { fill: 0, ring: 0 };
  #hover = false;
  #folderId: string | null = null;
  #nameBeforeEdit = "";
  #pendingFolderId: string | null = null;
  #frame: SingleStageFolderTitleFrame | null = null;
  constructor(host: TextInputHost, readonly rename: (id: string, name: string) => void,
    readonly invalidate: () => void) {
    super({ label: "native-folder-name", eventMode: "none", cursor: "text" });
    this.visible = false;
    this.hitArea = new Rectangle(0, 0, 360, 38);
    this.input = host.create({ width: 360, height: 38, maxLength: 32, chrome: false,
      style: { fontFamily: [...NATIVE_UI_FONT_FAMILY], fontSize: 26, fontWeight: "normal",
        lineHeight: 34, padding: 2, paddingHorizontal: 12, textAlign: "center",
        textColor: 0xffffff, caretColor: 0xffffff, selectionColor: 0xffffff,
        selectionAlpha: 0.86, selectionTextColor: 0x312e81,
        dropShadow: { color: 0, alpha: 0.38, blur: 7, distance: 2, angle: Math.PI / 2 } } });
    this.input.label = "native-folder-name-input";
    this.addChild(this.#background, this.input);
    this.on("pointerdown", event => event.stopPropagation());
    this.on("pointerover", () => { this.#hover = true; this.#redraw(); });
    this.on("pointerout", () => { this.#hover = false; this.#redraw(); });
    this.input.on("focus", () => { this.#nameBeforeEdit = this.input.value; this.#redraw(); });
    this.input.on("blur", () => {
      if (!this.input.value) {
        this.input.value = this.#nameBeforeEdit;
        if (this.#folderId && this.#nameBeforeEdit) this.rename(this.#folderId, this.#nameBeforeEdit);
      }
      this.input.setSelectionRange(this.input.selection.focus);
      this.#redraw();
    });
    this.input.on("input", () => {
      if (this.#folderId && this.input.value) this.rename(this.#folderId, this.input.value);
    });
  }
  setFrame(frame: SingleStageFolderTitleFrame | null): void { this.#frame = frame; }
  requestRename(id: string): void { this.#pendingFolderId = id; }
  cancelRename(): void { this.#pendingFolderId = null; }
  update(folder: Readonly<{ id: string; name?: string }> | null, progress: number, blocked: boolean): void {
    const id = folder?.id ?? null;
    if (id !== this.#folderId) {
      this.input.blur();
      this.#folderId = id;
      this.input.value = folder?.name ?? "";
      this.#nameBeforeEdit = this.input.value;
    } else if (!this.input.focused && folder && this.input.value !== folder.name) {
      this.input.value = folder.name ?? "";
    }
    const frame = this.#frame;
    this.visible = Boolean(id && frame?.folderId === id);
    this.alpha = Math.max(0, Math.min(1, progress));
    if (this.visible && frame) this.position.set(frame.left + frame.width / 2 - 180, frame.top - 44);
    const disabled = blocked || !this.visible || progress < 0.99 || Number(frame?.progress ?? 0) < 0.99;
    if (disabled && this.#hover) { this.#hover = false; this.#redraw(); }
    if (this.input.disabled !== disabled) this.input.disabled = disabled;
    this.eventMode = disabled ? "none" : "static";
    this.interactiveChildren = !disabled;
    if (!disabled && this.#pendingFolderId === id) {
      this.#pendingFolderId = null;
      this.input.focus(); this.input.selectAll();
    }
  }
  #redraw(): void {
    killMotionOf(this.#paint);
    motion(this.#paint).duration(0.16).to({ fill: this.input.focused ? 0.14 : this.#hover ? 0.08 : 0,
      ring: this.input.focused ? 0.2 : 0 }, { onUpdate: () => {
      this.#background.clear().roundRect(0, 0, 360, 38, 10).fill({ color: 0xffffff, alpha: this.#paint.fill })
        .roundRect(-1, -1, 362, 40, 11).stroke({ color: 0xffffff, alpha: this.#paint.ring, width: 2 });
      this.invalidate();
    } }).start();
  }
  override destroy(): void {
    this.input.blur(); killMotionOf(this.#paint); super.destroy({ children: true });
  }
}
