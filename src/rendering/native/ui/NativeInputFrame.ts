import { Container, Graphics } from "pixi.js";
import { nativeSettingsStyle,type NativeTheme } from "../NativeFluentButton.js";
import { nativeUiTheme } from "./nativeUiTheme.js";

/** A single outer border stays above clipped input/stepper contents in every state. */
export class NativeInputFrame extends Container {
  readonly content=new Container();
  readonly #background=new Graphics({eventMode:"none"});
  readonly #clip=new Graphics({eventMode:"none"});
  readonly #border=new Graphics({eventMode:"none",label:"native-input-frame:border"});
  constructor(readonly frameWidth:number,readonly frameHeight:number,readonly theme:NativeTheme){
    super({eventMode:"passive"});this.addChild(this.#background,this.content,this.#clip,this.#border);
    this.#clip.roundRect(1,1,frameWidth-2,frameHeight-2,3).fill(0xffffff);this.content.mask=this.#clip;
    this.paint(false,false,false);
  }
  paint(hover:boolean,focused:boolean,disabled:boolean):void{
    const w=this.frameWidth,h=this.frameHeight,colors=nativeUiTheme(this.theme),style=nativeSettingsStyle(this.theme);
    this.#background.clear().roundRect(0.5,0.5,w-1,h-1,4).fill(hover&&this.theme==="dark"?"rgba(255,255,255,0.065)":colors.input);
    this.#border.clear().roundRect(0.5,0.5,w-1,h-1,4).stroke({color:colors.inputBorder,width:1})
      .moveTo(3,h-0.5).lineTo(w-3,h-0.5).stroke({color:focused?style.accent:colors.inputBottom,width:focused?2:1});
    this.alpha=disabled?0.62:1;
  }
}
