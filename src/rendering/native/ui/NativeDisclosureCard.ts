import { Graphics } from "pixi.js";
import { nativeSettingsStyle,type NativeTheme } from "../NativeFluentButton.js";

/** One outer card spans the header and animated detail surface. */
export class NativeDisclosureCard extends Graphics {
  constructor(readonly cardWidth:number,readonly headerHeight:number,readonly theme:NativeTheme){
    super({eventMode:"none",label:"native-disclosure-card"});
  }
  update(detailHeight:number):void{
    const style=nativeSettingsStyle(this.theme);
    this.clear().roundRect(0.5,0.5,this.cardWidth-1,this.headerHeight+detailHeight-1,8)
      .fill(style.row).stroke({color:style.border,width:1});
  }
}
