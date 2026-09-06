import { Container, Graphics } from "pixi.js";
import type { NativeTheme } from "../NativeFluentButton.js";
import { nativeUiMetrics,nativeUiTheme } from "./nativeUiTheme.js";

/** Owns the expanded surface, separator, vertical padding and animated clipping. */
export class NativeDisclosureSurface extends Container {
  readonly content=new Container({label:"native-disclosure-content"});
  readonly #surface=new Graphics({eventMode:"none"});
  readonly #clip=new Graphics({eventMode:"none"});
  constructor(readonly surfaceWidth:number,readonly contentHeight:number,readonly theme:NativeTheme,readonly decorated=true){
    super({eventMode:"passive"});
    this.addChild(this.content,this.#surface,this.#clip);this.setChildIndex(this.#surface,0);this.content.mask=this.#clip;
  }
  get expandedHeight():number{return this.contentHeight+(this.decorated?nativeUiMetrics.disclosurePadding*2+1:0);}
  update(heightProgress:number,opacity:number,interactive:boolean):number{
    const height=this.expandedHeight*heightProgress,padding=this.decorated?nativeUiMetrics.disclosurePadding:0;
    this.#clip.clear().rect(0,0,this.surfaceWidth,height).fill(0xffffff);
    this.#surface.clear();
    if(this.decorated&&height>0){const colors=nativeUiTheme(this.theme);
      this.#surface.moveTo(0,0).lineTo(this.surfaceWidth,0).lineTo(this.surfaceWidth,Math.max(0,height-8))
        .quadraticCurveTo(this.surfaceWidth,height,this.surfaceWidth-8,height).lineTo(8,height).quadraticCurveTo(0,height,0,Math.max(0,height-8)).closePath().fill(colors.disclosure);
      this.#surface.moveTo(0,0.5).lineTo(this.surfaceWidth,0.5).stroke({color:colors.separator,width:1});
    }
    this.visible=heightProgress>0;this.eventMode=interactive?"passive":"none";
    this.content.y=(padding+(this.decorated?1:0))*heightProgress-3*(1-heightProgress);this.content.alpha=opacity;
    return height;
  }
}
