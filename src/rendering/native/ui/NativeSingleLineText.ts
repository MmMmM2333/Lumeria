import { CanvasTextMetrics, Text, type TextOptions } from "pixi.js";
import { getNativeTextResolution } from "../nativeTypography.js";

/** Single-line CSS-like ellipsis without stretching glyphs or changing the full value. */
export class NativeSingleLineText extends Text {
  #availableWidth=-1;
  #parts:string[]=[];
  #fullText="";
  constructor(fullText:string,style:NonNullable<TextOptions["style"]>,width:number){
    super({text:fullText,eventMode:"none",style,resolution:getNativeTextResolution()});
    this.setValue(fullText,width);
  }
  get fullText():string{return this.#fullText;}
  get availableWidth():number{return this.#availableWidth;}
  setValue(value:string,width=this.#availableWidth):void{
    if(value!==this.#fullText){
      this.#fullText=value;this.#parts=Array.from(new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(value),part=>part.segment);
      this.#availableWidth=-1;
    }
    this.setAvailableWidth(width);
  }
  setAvailableWidth(width:number):void{
    const next=Math.max(0,width);if(next===this.#availableWidth)return;this.#availableWidth=next;
    const fits=(value:string)=>CanvasTextMetrics.measureText(value,this.style,undefined,false).width<=next;
    if(fits(this.fullText)){this.text=this.fullText;return;}
    if(!fits("…")){this.text="";return;}
    let low=0,high=this.#parts.length;
    while(low<high){const mid=Math.ceil((low+high)/2);if(fits(this.#parts.slice(0,mid).join("")+"…"))low=mid;else high=mid-1;}
    this.text=this.#parts.slice(0,low).join("")+"…";
  }
}
