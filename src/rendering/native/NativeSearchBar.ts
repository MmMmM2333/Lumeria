import { createNativeText, getNativeTextResolution } from "./nativeTypography.js";
import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { createTextInputHost, type NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { NativeClipboardPort } from "../../platform/clipboardPort.js";
import { NATIVE_UI_FONT_FAMILY as PIXI_UI_FONT_FAMILY } from "./nativeTypography.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import type { NativeNavigationKey } from "../../native/nativeStartup.js";

/** Native editor with the original search-pill presentation and timing. */
export class NativeSearchBar extends Container {
  handleKey: (event: NativeNavigationKey) => boolean = () => false;
  readonly host;
  readonly input;
  readonly #background = new Graphics();
  readonly #content = new Container();
  readonly #icon = new Graphics().circle(6, 6, 5).stroke({ color: 0xffffff, alpha: 0.82, width: 1.4 })
    .moveTo(10, 10).lineTo(14, 14).stroke({ color: 0xffffff, alpha: 0.82, width: 1.4 });
  readonly #placeholder;
  readonly #clear = new Graphics({label:"native-search-clear"});
  #width = 348;
  #hidden = false;
  #explicitEditing = false;
  #publishedQuery = "";
  /** Establish IME ownership before the first key without stealing another editor. */
  prepareForTyping(enabled: boolean): void {
    if (!enabled) { if (this.input.focused) this.input.blur(); return; }
    if (!this.host.focused && !this.#hidden) this.focusForTyping();
  }
  /** Native text focus also serves type-to-search. Only explicit focus edits the caret. */
  get explicitEditing():boolean{return this.#explicitEditing;}
  focusForTyping():void{this.input.focus();this.#explicitEditing=false;this.#sync();}
  focusEditor():void{this.input.focus();this.#explicitEditing=true;this.#sync();}
  captureFocus():(()=>void)|null {
    if(!this.input.focused)return null;
    const explicitEditing=this.#explicitEditing;
    return ()=>{
      if(this.destroyed||this.input.destroyed)return;
      if(explicitEditing)this.focusEditor();else this.focusForTyping();
    };
  }
  readonly #offRecovered: () => void;
  constructor(app: NativePixiApplication, placeholder: string, readonly onQuery: (query: string) => void, clipboard: NativeClipboardPort) {
    super({ label: "native-search-bar", eventMode: "static", cursor: "text" });
    const nativeEvents = (): Parameters<typeof createTextInputHost>[0]["nativeInput"] => ({
      ...app.nativeInput,
      onKey: listener => app.nativeInput.onKey(event => {
        if (!this.handleKey(event)) listener(event);
      }),
    });
    this.host = createTextInputHost({ root: app.stage, textResolution:getNativeTextResolution, nativeInput: nativeEvents(),
      nativeTextInput: app.textInput, clipboard, requestFrame: () => app.invalidate() });
    this.#offRecovered = app.on("recovered", () => this.host.rebindNativeInput(nativeEvents()));
    this.input = this.host.create({ width: 285, height: 27, chrome: false,
      style: { fontFamily: [...PIXI_UI_FONT_FAMILY], fontSize: 13, lineHeight: 19, padding: 4,
        textColor: 0xffffff, caretColor: 0xffffff, selectionColor: 0x3268ad } });
    this.input.label = "native-search-input";
    this.input.position.set(19, -5);
    this.#placeholder = createNativeText({ text: placeholder, style: { fontFamily: [...PIXI_UI_FONT_FAMILY], fontSize: 13, fill: 0xffffff } });
    this.#placeholder.alpha = 0.46;
    this.#placeholder.position.set(21, 0);
    this.#placeholder.eventMode = this.#icon.eventMode = "none";
    this.#clear.moveTo(-3, -3).lineTo(3, 3).moveTo(-3, 3).lineTo(3, -3).stroke({ color: 0xffffff, alpha: 0.7, width: 1.3 });
    this.#clear.eventMode = "static"; this.#clear.cursor = "pointer";
    this.#clear.hitArea = new Rectangle(-11, -11, 22, 22);
    this.#clear.on("pointerdown", event => event.stopPropagation());
    this.#clear.on("pointertap", event => { event.stopPropagation(); this.setQuery(""); this.focusEditor(); });
    this.#content.addChild(this.#icon, this.input, this.#placeholder);
    this.addChild(this.#background, this.#content, this.#clear);
    this.on("pointerdown", event => { event.stopPropagation(); this.focusEditor(); });
    this.input.on("focus", () => {this.#explicitEditing=true;this.#sync();});
    this.input.on("blur", () => {this.#explicitEditing=false;this.#sync();});
    this.input.on("textviewchange", () => {
      this.#sync();
      const query = this.input.displayValue;
      if (query === this.#publishedQuery) return;
      this.#publishedQuery = query;
      this.onQuery(query);
    });
    this.#sync();
  }
  setQuery(value: string): void {
    this.input.value = value; this.#sync();
    if (this.#publishedQuery !== value) { this.#publishedQuery = value; this.onQuery(value); }
  }
  setPlaceholder(value:string):void {this.#placeholder.text=value;this.#sync();}
  update(width: number, hidden: boolean, topInset=width<=760?14:20, interactive=true): void {
    const nextWidth = Math.min(348, Math.max(180, width - 40));
    if(nextWidth !== this.#width) { this.#width = nextWidth; this.input.resize(nextWidth - 63, 27); this.#sync(); }
    this.position.set((width - this.#width) / 2, 14+topInset);
    this.hitArea = new Rectangle(0, 0, this.#width, 35);
    this.interactiveChildren = !hidden&&interactive; this.eventMode = hidden||!interactive ? "none" : "static";
    if (hidden !== this.#hidden) {
      this.#hidden = hidden;
      if(hidden) this.input.blur();
      motion(this).preset("fade").to({ alpha: hidden ? 0 : 1 }).start();
    }
  }
  #sync(): void {
    const active = this.input.displayValue.trim().length > 0;
    const left = active || this.#explicitEditing || this.input.composing;
    this.input.caretBlinkEnabled = left;
    this.#background.clear().roundRect(0, 0, this.#width, 35, 6)
      .fill({ color: 0xffffff, alpha: active ? 0.13 : 0.09 })
      .stroke({ color: 0xffffff, alpha: active ? 0.22 : 0.16, width: 1 });
    this.#placeholder.visible = !left;
    this.input.alpha = left ? 1 : 0;
    this.#clear.visible = active; this.#clear.position.set(this.#width - 20, 17.5);
    motion(this.#content).duration(0.18).to({
      x: left ? 12 : (this.#width - this.#placeholder.width - 21) / 2, y: 10,
      onUpdate: () => { if (this.input.focused) this.host.syncFocused(); },
    }).start();
  }
  override destroy(): void {
    this.#offRecovered();
    killMotionOf(this); killMotionOf(this.#content);
    this.host.destroy();
    super.destroy({ children: true });
  }
}
