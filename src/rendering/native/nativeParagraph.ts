import { CanvasTextMetrics, TextStyle, type TextStyleOptions } from "pixi.js";
import { createNativeText } from "./nativeTypography.js";

const words=new Intl.Segmenter(undefined,{granularity:"word"});

/** Pixi's whitespace tokenizer treats an entire Chinese sentence as one word. */
export function createNativeParagraph(text:string,options:TextStyleOptions,width:number){
  const style=new TextStyle({...options,wordWrap:false});
  const measure=(value:string)=>CanvasTextMetrics.measureText(value,style).width;
  const closing=/^[，。！？；：、）》】」』”’.,!?;:%％]/u;
  const opening=/[（《【「『“‘(]$/u;
  const lines:string[]=[];
  for(const paragraph of text.split(/\r\n|\r|\n/u)){
    const tokens=Array.from(words.segment(paragraph),part=>part.segment);
    const units:string[]=[];
    for(const token of tokens){
      if(units.length&&(closing.test(token)||opening.test(units.at(-1)!)))units[units.length-1]+=token;
      else units.push(token);
    }
    let line="";
    const append=(unit:string)=>{
      if(line&&measure(line+unit)>width){lines.push(line.trimEnd());line="";}
      line+=line?unit:unit.trimStart();
    };
    for(const unit of units){
      if(measure(unit)>width){
        for(const grapheme of CanvasTextMetrics.graphemeSegmenter(unit))append(grapheme);
      }else append(unit);
    }
    lines.push(line.trimEnd());
  }
  const node=createNativeText({text:lines.join("\n"),eventMode:"none",style});
  return node;
}
