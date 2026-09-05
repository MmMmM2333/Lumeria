import { Container, Graphics, Rectangle, type FederatedPointerEvent } from "pixi.js";
import { nativeFluentTheme, type NativeTheme } from "./NativeFluentButton.js";

/** Clipped content and one scroll offset, also usable by virtualized lists. */
export class NativeScrollView extends Container {
  readonly content=new Container();
  readonly #clip=new Graphics({eventMode:"none"});
  readonly #thumb=new Graphics({eventMode:"static",cursor:"pointer"});
  #offset=0;
  #contentHeight=0;
  #width=0;
  #height=0;
  #drag:{id:number;y:number;offset:number}|null=null;
  constructor(readonly invalidate:()=>void,readonly onScroll:(offset:number)=>void=()=>{},readonly theme:NativeTheme="dark"){
    super({eventMode:"static",label:"native-scroll-view"});
    this.addChild(this.content,this.#clip,this.#thumb);this.content.mask=this.#clip;
    this.on("wheel",event=>{
      event.stopPropagation();event.preventDefault();
      if(event.ctrlKey||event.metaKey)return;
      this.scrollTo(this.#offset+event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?this.#height:1));
    });
    this.#thumb.on("pointerdown",(event:FederatedPointerEvent)=>{
      event.stopPropagation();
      if(event.button===0)this.#drag={id:event.pointerId,y:this.toLocal(event.global).y,offset:this.#offset};
    });
    this.on("globalpointermove",(event:FederatedPointerEvent)=>{
      if(event.pointerId!==this.#drag?.id)return;
      const travel=this.#height-this.#thumbHeight();
      if(travel>0)this.scrollTo(this.#drag.offset+(this.toLocal(event.global).y-this.#drag.y)*this.maxOffset/travel);
    });
    const release=(event:FederatedPointerEvent)=>{if(event.pointerId===this.#drag?.id)this.#drag=null;};
    this.on("pointerup",release);this.on("pointerupoutside",release);this.on("pointercancel",release);
  }
  get offset():number{return this.#offset;}
  get maxOffset():number{return Math.max(0,this.#contentHeight-this.#height);}
  resize(width:number,height:number,contentHeight:number):void{
    if(![width,height,contentHeight].every(value=>Number.isFinite(value)&&value>=0))throw new TypeError("Invalid scroll extent");
    this.#width=width;this.#height=height;this.#contentHeight=contentHeight;
    this.hitArea=new Rectangle(0,0,width,height);
    this.#clip.clear().rect(0,0,width,height).fill(0xffffff);
    this.scrollTo(this.#offset);this.#draw();
  }
  scrollTo(offset:number):void {
    if(!Number.isFinite(offset))throw new TypeError("Invalid scroll offset");
    const next=Math.max(0,Math.min(this.maxOffset,offset));
    if(next===this.#offset)return;
    this.#offset=next;this.content.y=-next;this.#draw();this.onScroll(next);
  }
  reveal(top:number,height:number):void {
    if(top<this.#offset)this.scrollTo(top);
    else if(top+height>this.#offset+this.#height)this.scrollTo(top+height-this.#height);
  }
  #thumbHeight():number{return Math.min(this.#height,Math.max(24,this.#height*this.#height/Math.max(1,this.#contentHeight)));}
  #draw():void{
    this.#thumb.visible=this.maxOffset>0;
    const height=this.#thumbHeight();
    this.#thumb.clear().roundRect(0,0,4,height,2).fill(nativeFluentTheme(this.theme).colorNeutralForeground4);
    this.#thumb.position.set(this.#width-6,this.maxOffset>0?this.#offset/this.maxOffset*(this.#height-height):0);
    this.#thumb.hitArea=new Rectangle(-5,0,14,height);
    this.invalidate();
  }
  override destroy():void{this.#drag=null;super.destroy({children:true});}
}
