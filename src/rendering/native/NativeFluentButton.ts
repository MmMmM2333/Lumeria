import { Color, Container, Graphics, Rectangle, Text } from "pixi.js";
import * as fluentTokens from "@fluentui/tokens";
import { NATIVE_UI_FONT_FAMILY as PIXI_UI_FONT_FAMILY } from "./nativeTypography.js";
// Package exports select CommonJS in Node (default namespace) and ESM in the bundler.
const {webDarkTheme,webLightTheme}="default" in fluentTokens
  ? fluentTokens.default as typeof fluentTokens : fluentTokens;

export type NativeTheme = "dark" | "light";
export type NativeButtonAppearance = "outline" | "primary" | "subtle" | "settings-row" | "segment" | "link" | "list-row" | "option" | "preview" | "chip-remove" | "secondary";

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
  #busy=false;
  #focused = false;
  #selected = false;
  #disclosureHeader=false;
  readonly #stateGraphics:{node:Graphics;paint:(color:string)=>void}[]=[];
  #theme: NativeTheme;

  constructor(label:string, public controlWidth:number, readonly action:()=>void,
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
  activate():void {if(!this.#disabled&&!this.#busy)this.action();}
  set busy(value:boolean){this.#busy=value;}
  addStateGraphic(paint:(node:Graphics,color:string)=>void):Graphics{
    const node=new Graphics({eventMode:"none"});this.addChild(node);
    this.#stateGraphics.push({node,paint:color=>paint(node,color)});this.#draw();return node;
  }
  resizeWidth(width:number):void{
    this.controlWidth=width;this.caption.x=width/2;this.hitArea=new Rectangle(0,0,width,this.controlHeight);this.#draw();
  }
  get disabled():boolean {return this.#disabled;}
  set disabled(value:boolean) {
    if(value===this.#disabled)return;
    this.#disabled=value;this.#pressed=false;this.#hovered=false;
    this.eventMode=value?"none":"static";this.cursor=value?"default":"pointer";this.#draw();
  }
  get focused():boolean{return this.#focused;}
  set hovered(value:boolean){this.#hovered=value;this.#draw();}
  set selected(value:boolean){this.#selected=value;this.#draw();}
  set disclosureHeader(value:boolean){this.#disclosureHeader=value;this.#draw();}
  set focused(value:boolean) {if(this.#focused===value)return;this.#focused=value;this.#draw();}
  set theme(value:NativeTheme) {if(this.#theme===value)return;this.#theme=value;this.#draw();}
  #draw():void {
    const theme=nativeFluentTheme(this.#theme);
    if(this.appearance==="secondary"){
      const dark=this.#theme==="dark";
      this.background.clear().roundRect(0.5,0.5,this.controlWidth-1,this.controlHeight-1,12).fill(dark?"rgba(255,255,255,0.1)":theme.colorNeutralBackground1).stroke({color:dark?"rgba(255,255,255,0.18)":theme.colorNeutralStroke1,width:1});
      this.caption.style.fill=dark?"#ffffff":theme.colorNeutralForeground1;this.caption.style.fontWeight="600";this.alpha=this.#disabled?0.45:1;
      this.focusRing.clear();if(this.#focused&&!this.#disabled)this.focusRing.roundRect(2,2,this.controlWidth-4,this.controlHeight-4,10).stroke({color:theme.colorStrokeFocus2,width:2});
      this.invalidate();return;
    }
    if(this.appearance==="chip-remove"){
      const dark=this.#theme==="dark",active=!this.#disabled&&(this.#hovered||this.#pressed);
      const fill=active?(dark?`rgba(196,43,28,${this.#pressed?0.24:0.18})`:theme.colorPaletteRedBackground1):dark?"rgba(255,255,255,0.12)":theme.colorNeutralBackground1Hover;
      this.background.clear().roundRect(0,0,this.controlWidth,this.controlHeight,this.controlHeight/2).fill(fill);
      const color=active?(dark?"#ffb4a9":theme.colorPaletteRedForeground1):dark?"rgba(255,255,255,0.74)":theme.colorNeutralForeground2;
      for(const graphic of this.#stateGraphics)graphic.paint(color);
      this.focusRing.clear();if(this.#focused&&!this.#disabled)this.focusRing.roundRect(-1,-1,this.controlWidth+2,this.controlHeight+2,(this.controlHeight+2)/2).stroke({color:theme.colorStrokeFocus2,width:2});
      this.invalidate();return;
    }
    if(this.appearance==="option"||this.appearance==="preview"){
      const style=nativeSettingsStyle(this.#theme),dark=this.#theme==="dark",hover=!this.#disabled&&this.#hovered;
      const fill=hover?(dark?"rgba(255,255,255,0.065)":theme.colorNeutralBackground1Hover)
        :this.#selected?(dark?"rgba(75,163,246,0.16)":theme.colorBrandBackground2):dark?"rgba(0,0,0,0.1)":theme.colorNeutralBackground1;
      const border=this.#selected?(this.appearance==="preview"&&dark?"rgba(75,163,246,0.42)":style.accent):hover?theme.colorNeutralStroke1:style.border;
      this.background.clear().roundRect(0.5,0.5,this.controlWidth-1,this.controlHeight-1,8).fill(fill).stroke({color:border,width:1});
      if(this.#selected)this.background.roundRect(1.5,1.5,this.controlWidth-3,this.controlHeight-3,7).stroke({color:this.appearance==="preview"&&dark?"rgba(75,163,246,0.18)":style.accent,width:1});
      this.focusRing.clear();if(this.#focused&&!this.#disabled)this.focusRing.roundRect(2,2,this.controlWidth-4,this.controlHeight-4,6).stroke({color:style.accent,width:2});
      this.invalidate();return;
    }
    if(this.appearance==="segment"||this.appearance==="link"||this.appearance==="list-row"){
      const style=nativeSettingsStyle(this.#theme),active=!this.#disabled&&(this.#hovered||this.#pressed);
      this.background.clear();
      if(this.appearance==="segment"){
        const fill=active?(this.#theme==="dark"?"rgba(255,255,255,0.065)":theme.colorNeutralBackground1Hover)
          :this.#selected?(this.#theme==="dark"?"rgba(75,163,246,0.16)":theme.colorBrandBackground2):"transparent";
        this.background.rect(0,0,this.controlWidth,this.controlHeight).fill(fill);
        if(this.#selected)this.background.rect(0,this.controlHeight-2,this.controlWidth,2).fill(style.accent);
      }else if(this.appearance==="list-row"){
        const fill=this.#selected?(this.#theme==="dark"?`rgba(75,163,246,${active?0.16:0.12})`:theme.colorBrandBackground2)
          :active?(this.#theme==="dark"?"rgba(255,255,255,0.065)":theme.colorNeutralBackground1Hover):style.row;
        this.background.roundRect(0.5,0.5,this.controlWidth-1,this.controlHeight-1,8).fill(fill)
          .stroke({color:this.#selected?`rgba(75,163,246,${active?0.42:0.32})`:style.border,width:1});
      }
      this.caption.style.fill=this.#disabled?theme.colorNeutralForegroundDisabled
        :active||this.#selected?style.text:this.appearance==="link"&&this.#theme==="dark"?"rgba(255,255,255,0.76)":style.muted;
      this.focusRing.clear();
      if(this.#focused&&!this.#disabled)this.focusRing.roundRect(2,2,this.controlWidth-4,this.controlHeight-4,this.appearance==="segment"?0:3).stroke({color:theme.colorStrokeFocus2,width:2});
      this.invalidate();return;
    }
    if(this.appearance==="settings-row"){
      const style=nativeSettingsStyle(this.#theme);
      const fill=this.#theme==="dark"?`rgba(255,255,255,${this.#pressed?0.085:this.#hovered?0.065:0.045})`
        :this.#pressed?theme.colorNeutralBackground1Pressed:this.#hovered?theme.colorNeutralBackground1Hover:style.row;
      this.background.clear();
      if(this.#disclosureHeader){
        if(this.#hovered||this.#pressed)this.background.rect(1,1,this.controlWidth-2,this.controlHeight-1).fill(fill);
      }else this.background.roundRect(0,0,this.controlWidth,this.controlHeight,8).fill(fill).stroke({color:style.border,width:1});
      this.caption.style.fill=style.text;
      this.focusRing.clear();if(this.#focused&&!this.#disabled)this.focusRing.roundRect(2,2,this.controlWidth-4,this.controlHeight-4,6).stroke({color:style.accent,width:2});
      this.invalidate();return;
    }
    const primary=this.appearance==="primary", subtle=this.appearance==="subtle";
    const fill=this.#disabled?(!primary?"transparent":theme.colorNeutralBackgroundDisabled)
      :primary?(this.#pressed?theme.colorBrandBackgroundPressed:this.#hovered?theme.colorBrandBackgroundHover:theme.colorBrandBackground)
      :subtle?(this.#pressed?theme.colorSubtleBackgroundPressed:this.#hovered?theme.colorSubtleBackgroundHover:theme.colorSubtleBackground)
      :(this.#pressed?theme.colorNeutralBackground1Pressed:this.#hovered?theme.colorNeutralBackground1Hover:theme.colorNeutralBackground1);
    const color=new Color(fill);
    this.background.clear().roundRect(0,0,this.controlWidth,this.controlHeight,4).fill({color:color.toNumber(),alpha:color.alpha});
    if(!subtle&&!primary)this.background.stroke({color:this.#disabled?theme.colorNeutralStrokeDisabled:theme.colorNeutralStroke1,width:1});
    this.caption.style.fill=this.#disabled?theme.colorNeutralForegroundDisabled
      :this.danger?(this.#theme==="dark"?"#ffb4a9":theme.colorPaletteRedForeground1)
      :primary?theme.colorNeutralForegroundOnBrand:theme.colorNeutralForeground1;
    const iconColor=this.#disabled?theme.colorNeutralForegroundDisabled:theme.colorNeutralForeground3;
    for(const graphic of this.#stateGraphics)graphic.paint(iconColor);
    this.focusRing.clear();
    if(this.#focused&&!this.#disabled)this.focusRing.roundRect(2,2,this.controlWidth-4,this.controlHeight-4,3).stroke({color:theme.colorStrokeFocus2,width:2});
    this.invalidate();
  }
}
