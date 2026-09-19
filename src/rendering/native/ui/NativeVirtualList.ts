import { Container } from "pixi.js";
import type { NativeSettingsControl } from "../NativeSettingsShell.js";
import { destroyNativeSubtree, releaseNativeGraphics } from "../nativeGraphicsLifecycle.js";

type Row={node:Container;controls:NativeSettingsControl[];update?:(index:number)=>boolean|void};

export class NativeVirtualList extends Container {
  readonly controls:NativeSettingsControl[]=[];
  readonly #rows=new Map<number,Row>();
  #keys:string[]=[];
  #pinned:number|null=null;
  #focusListener:((key:string)=>void)|null=null;
  constructor(public count:number,readonly stride:number,readonly rowControls:number,
    readonly build:(index:number)=>Row,readonly key:(index:number)=>string=index=>String(index),
    readonly isDisabled:(index:number,part:number)=>boolean=()=>false){
    super({label:"native-virtual-list",eventMode:"passive"});
    this.#keys=Array.from({length:count},(_,index)=>key(index));this.#buildControls();
  }
  #buildControls():void{
    this.controls.length=0;
    for(let index=0;index<this.count;index++)for(let part=0;part<this.rowControls;part++)this.controls.push({
      node:this,virtualKey:`virtual:${this.#keys[index]}:${part}`,disabled:()=>this.isDisabled(index,part),
      revealRect:()=>({top:this.y+index*this.stride,height:this.stride}),
      focus:active=>{if(active){this.#pinned=index;this.#ensure(index).controls[part]?.focus(true);}else{this.#rows.get(index)?.controls[part]?.focus(false);if(this.#pinned===index)this.#pinned=null;}},
      handleKey:key=>this.#ensure(index).controls[part]?.handleKey(key)??false,
    });
  }
  /** Reconcile a changed data set by stable key, retaining matching visible rows. */
  updateItems(count:number):boolean{
    const keys=Array.from({length:count},(_,index)=>this.key(index));
    if(keys.length===this.#keys.length&&keys.every((key,index)=>key===this.#keys[index])){this.refreshRows();return false;}
    const previous=new Map([...this.#rows].map(([index,row])=>[this.#keys[index]!,row]));
    const pinned=this.#pinned===null?null:this.#keys[this.#pinned];
    this.#rows.clear();this.count=count;this.#keys=keys;
    this.#pinned=pinned==null?null:keys.indexOf(pinned);if(this.#pinned===-1)this.#pinned=null;
    keys.forEach((key,index)=>{const row=previous.get(key);if(row){previous.delete(key);row.node.y=index*this.stride;this.#rows.set(index,row);}});
    for(const row of previous.values())destroyNativeSubtree(row.node);
    this.#buildControls();this.refreshRows();return true;
  }
  refreshRows():void{for(const [index,row] of [...this.#rows])if(row.update?.(index)===false){destroyNativeSubtree(row.node);this.#rows.delete(index);this.#ensure(index);}}
  get mountedCount():number{return this.#rows.size;}
  onControlFocus(listener:(key:string)=>void):void{this.#focusListener=listener;}
  #ensure(index:number){
    let row=this.#rows.get(index);if(row)return row;
    row=this.build(index);row.node.y=index*this.stride;
    const key=this.#keys[index];
    row.controls.forEach((control,part)=>control.node.on("pointerdown",()=>this.#focusListener?.(`virtual:${key}:${part}`)));
    this.#rows.set(index,row);this.addChild(row.node);return row;
  }
  viewport(top:number,height:number):void{
    const first=Math.max(0,Math.floor(top/this.stride)-2),last=Math.min(this.count,Math.ceil((top+height)/this.stride)+2);
    for(const [index,row] of this.#rows)if((index<first||index>=last)&&index!==this.#pinned){destroyNativeSubtree(row.node);this.#rows.delete(index);}
    for(let index=first;index<last;index++)this.#ensure(index);
  }
  override destroy():void{releaseNativeGraphics(this);this.#rows.clear();this.controls.length=0;this.#keys=[];this.#focusListener=null;this.#pinned=null;super.destroy({children:true});}
}
