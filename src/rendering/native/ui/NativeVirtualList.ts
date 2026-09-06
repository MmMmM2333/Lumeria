import { Container } from "pixi.js";
import type { NativeSettingsControl } from "../NativeSettingsShell.js";

export class NativeVirtualList extends Container {
  readonly controls:NativeSettingsControl[]=[];
  readonly #rows=new Map<number,{node:Container;controls:NativeSettingsControl[]}>();
  #pinned:number|null=null;
  #focusListener:((key:string)=>void)|null=null;
  constructor(readonly count:number,readonly stride:number,readonly rowControls:number,
    readonly build:(index:number)=>{node:Container;controls:NativeSettingsControl[]},readonly key:(index:number)=>string=index=>String(index),
    readonly isDisabled:(index:number,part:number)=>boolean=()=>false){
    super({label:"native-virtual-list",eventMode:"passive"});
    for(let index=0;index<count;index++)for(let part=0;part<rowControls;part++)this.controls.push({
      node:this,virtualKey:`virtual:${key(index)}:${part}`,disabled:()=>this.isDisabled(index,part),
      revealRect:()=>({top:this.y+index*stride,height:stride}),
      focus:active=>{if(active){this.#pinned=index;this.#ensure(index).controls[part]?.focus(true);}else{this.#rows.get(index)?.controls[part]?.focus(false);if(this.#pinned===index)this.#pinned=null;}},
      handleKey:key=>this.#ensure(index).controls[part]?.handleKey(key)??false,
    });
  }
  get mountedCount():number{return this.#rows.size;}
  onControlFocus(listener:(key:string)=>void):void{this.#focusListener=listener;}
  #ensure(index:number){
    let row=this.#rows.get(index);if(row)return row;
    row=this.build(index);row.node.y=index*this.stride;
    row.controls.forEach((control,part)=>control.node.on("pointerdown",()=>this.#focusListener?.(`virtual:${this.key(index)}:${part}`)));
    this.#rows.set(index,row);this.addChild(row.node);return row;
  }
  viewport(top:number,height:number):void{
    const first=Math.max(0,Math.floor(top/this.stride)-2),last=Math.min(this.count,Math.ceil((top+height)/this.stride)+2);
    for(const [index,row] of this.#rows)if((index<first||index>=last)&&index!==this.#pinned){row.node.destroy({children:true});this.#rows.delete(index);}
    for(let index=first;index<last;index++)this.#ensure(index);
  }
  override destroy():void{this.#rows.clear();super.destroy({children:true});}
}
