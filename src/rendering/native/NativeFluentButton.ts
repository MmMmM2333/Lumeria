import { Color, Container, Graphics, Rectangle, Text } from "pixi.js";
import * as fluentTokens from "@fluentui/tokens";
import { PIXI_UI_FONT_FAMILY } from "../typography.js";
// Package exports select CommonJS in Node (default namespace) and ESM in the bundler.
const {webDarkTheme,webLightTheme}="default" in fluentTokens
  ? fluentTokens.default as typeof fluentTokens : fluentTokens;

export type NativeTheme = "dark" | "light";
export type NativeButtonAppearance = "outline" | "primary" | "subtle";

export function nativeFluentTheme(theme: NativeTheme) {
  return theme === "light" ? webLightTheme : webDarkTheme;
}
export function nativeSettingsStyle(theme:NativeTheme){
  const colors=nativeFluentTheme(theme);
  return {panel:theme==="dark"?"#1f1f1f":colors.colorNeutralBackground2,
    row:theme==="dark"?"rgba(255,255,255,0.045)":colors.colorNeutralBackground1,
    border:theme==="dark"?"rgba(255,255,255,0.075)":colors.colorNeutralStroke2,
    text:theme==="dark"?"rgba(255,255,255,0.92)":colors.colorNeutralForeground1,
    muted:theme==="dark"?"rgba(255,255,255,0.56)":colors.colorNeutralForeground3,
    accent:theme==="dark"?"#4ba3f6":colors.colorBrandForeground1,
    nav:theme==="dark"?"rgba(255,255,255,0.018)":colors.colorNeutralBackground3,
    selected:theme==="dark"?"rgba(75,163,246,0.1)":colors.colorBrandBackground2};
}

/** The same Fluent token source as the Web controls; no DOM theme provider. */
export class NativeFluentButton extends Container {
  readonly background = new Graphics({eventMode:"none"});
  readonly caption: Text;
  readonly focusRing = new Graphics({eventMode:"none"});
  #hovered = false;
  #pressed = false;
  #disabled = false;
  #focused = false;
  #theme: NativeTheme;

  constructor(label:string, readonly controlWidth:number, readonly action:()=>void,
    readonly invalidate:()=>void, theme:NativeTheme="dark",
    readonly appearance:NativeButtonAppearance="outline",
    readonly danger=false, readonly controlHeight=34) {
    super({label:`native-action:${label}`,eventMode:"static",cursor:"pointer"});
    this.#theme=theme;
    this.hitArea=new Rectangle(0,0,controlWidth,controlHeight);
    this.caption=new Text({text:label,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13}});
    this.caption.anchor.set(0.5);this.caption.position.set(controlWidth/2,controlHeight/2);this.caption.eventMode="none";
    this.addChild(this.background,this.caption,this.focusRing);
    this.on("pointerover",()=>{this.#hovered=true;this.#draw();});
    this.on("pointerout",()=>{this.#hovered=false;this.#pressed=false;this.#draw();});
    this.on("pointerdown",event=>{event.stopPropagation();if(event.button===0){this.#pressed=true;this.#draw();}});
    this.on("pointerup",()=>{this.#pressed=false;this.#draw();});
    this.on("pointerupoutside",()=>{this.#pressed=false;this.#draw();});
    this.on("pointercancel",()=>{this.#pressed=false;this.#draw();});
    this.on("pointertap",event=>{event.stopPropagation();if(event.button===0)this.activate();});
    this.#draw();
  }
  activate():void {if(!this.#disabled)this.action();}
  get disabled():boolean {return this.#disabled;}
  set disabled(value:boolean) {
    if(value===this.#disabled)return;
    this.#disabled=value;this.#pressed=false;
    this.eventMode=value?"none":"static";this.cursor=value?"default":"pointer";this.#draw();
  }
  set focused(value:boolean) {this.#focused=value;this.#draw();}
  set theme(value:NativeTheme) {this.#theme=value;this.#draw();}
  #draw():void {
    const theme=nativeFluentTheme(this.#theme);
    const primary=this.appearance==="primary", subtle=this.appearance==="subtle";
    const fill=this.#disabled?theme.colorNeutralBackgroundDisabled
      :primary?(this.#pressed?theme.colorBrandBackgroundPressed:this.#hovered?theme.colorBrandBackgroundHover:theme.colorBrandBackground)
      :subtle?(this.#pressed?theme.colorSubtleBackgroundPressed:this.#hovered?theme.colorSubtleBackgroundHover:theme.colorSubtleBackground)
      :(this.#pressed?theme.colorNeutralBackground1Pressed:this.#hovered?theme.colorNeutralBackground1Hover:theme.colorNeutralBackground1);
    const color=new Color(fill);
    this.background.clear().roundRect(0,0,this.controlWidth,this.controlHeight,4).fill({color:color.toNumber(),alpha:color.alpha});
    if(!subtle&&!primary)this.background.stroke({color:this.#disabled?theme.colorNeutralStrokeDisabled:theme.colorNeutralStroke1,width:1});
    this.caption.style.fill=this.#disabled?theme.colorNeutralForegroundDisabled
      :this.danger?(this.#theme==="dark"?"#ffb4a9":theme.colorPaletteRedForeground1)
      :primary?theme.colorNeutralForegroundOnBrand:theme.colorNeutralForeground1;
    this.focusRing.clear();
    if(this.#focused&&!this.#disabled)this.focusRing.roundRect(2,2,this.controlWidth-4,this.controlHeight-4,3).stroke({color:theme.colorStrokeFocus2,width:2});
    this.invalidate();
  }
}
