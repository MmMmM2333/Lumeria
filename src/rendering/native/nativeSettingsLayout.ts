import { Container, Graphics } from "pixi.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import type { NativeTheme } from "./NativeFluentButton.js";
import { NativeDisclosureSurface } from "./ui/NativeDisclosureSurface.js";
import { NativeDisclosureCard } from "./ui/NativeDisclosureCard.js";
import type { NativeFluentButton } from "./NativeFluentButton.js";

export type NativeDisclosure = { id:string; expanded:boolean };
export type NativeDisclosureProgress = ReadonlyMap<string, {height:number; opacity:number}>;

/** Lay out disclosure heights without rebuilding controls on animation frames. */
export class NativeSettingsLayout {
  readonly disclosures:NativeDisclosure[]=[];
  #blocks:{node:Container;top:number;height:number;measure:(progress:NativeDisclosureProgress)=>number}[]=[];
  #positions=new Map<Container,{y:number;anchor:number}>();
  #height=0;
  constructor(readonly node:Container,readonly width:number,readonly theme:NativeTheme="dark"){}
  disclosure(id:string,expanded:boolean,start:number,top:number,height:number,controls:readonly NativeSettingsControl[],chevron?:Container,decorated=true,header?:NativeFluentButton):void{
    const children=this.node.children.slice(start);this.node.removeChildren(start);
    const wrapper=new NativeDisclosureSurface(this.width,height,this.theme,decorated);wrapper.label=`native-disclosure:${id}`;wrapper.y=top;
    const content=wrapper.content;
    for(const child of children){child.y-=top;content.addChild(child);}
    this.node.addChild(wrapper);this.disclosures.push({id,expanded});
    const card=header?new NativeDisclosureCard(this.width,header.controlHeight,this.theme):null;
    if(card&&header){card.y=top-header.controlHeight;this.node.addChildAt(card,0);header.disclosureHeader=true;}
    for(const control of controls){const disabled=control.disabled;control.disabled=()=>!expanded||disabled();}
    this.#blocks.push({node:wrapper,top,height,measure:progress=>{
      const state=progress.get(id),amount=state?.height??(expanded?1:0);
      const visibleHeight=wrapper.update(amount,state?.opacity??(expanded?1:0),expanded);
      card?.update(visibleHeight);
      if(chevron)chevron.rotation=-Math.PI*amount;
      return visibleHeight;
    }});
  }
  child(page:NativeSettingsContent):void{
    if(!page.layout)return;
    this.disclosures.push(...page.layout.disclosures);
    this.#blocks.push({node:page.node,top:page.node.y,height:page.height,measure:progress=>page.layout!.reflow(progress)});
  }
  finish(height:number):this{
    this.#height=height;
    // Graphics may encode their row offset in path coordinates. Other children
    // use position; measuring each masked text separately would detach its sibling mask.
    for(const child of this.node.children)this.#positions.set(child,{y:child.y,anchor:child.y+(child instanceof Graphics?child.getLocalBounds().minY:0)});
    return this;
  }
  reflow(progress:NativeDisclosureProgress):number{
    const deltas=this.#blocks.map(block=>({node:block.node,end:block.top+block.height,delta:block.measure(progress)-block.height}));
    for(const [child,{y,anchor}] of this.#positions){
      if(!child.destroyed)child.y=y+deltas.reduce((sum,entry)=>sum+(child!==entry.node&&anchor>=entry.end-1?entry.delta:0),0);
    }
    return this.#height+deltas.reduce((sum,entry)=>sum+entry.delta,0);
  }
}

export function nativeSettingsChevron(parent:Container,x:number,y:number,color:string|number):Graphics{
  const mark=new Graphics({eventMode:"none"}).moveTo(-4,-2).lineTo(0,2).lineTo(4,-2).stroke({color,width:1.25});
  mark.position.set(x,y);parent.addChild(mark);return mark;
}
