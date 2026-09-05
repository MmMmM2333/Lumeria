import { Tray } from "../../.hutch/devkit-dcomp-2.0.1/api/sdks/main/core/Tray";
import emitter from "../../.hutch/devkit-dcomp-2.0.1/api/sdks/main/events/eventEmitter";
import type { MenuItemConfig } from "../../.hutch/devkit-dcomp-2.0.1/api/sdks/main/proc/native";

export type NativeTrayOptions={title:string;image:string;onAction(action:string):void;onError(error:unknown):void};
/** Tray and its event subscription share the Starter's active FFI instance. */
export class NativeTray {
  readonly #tray:Tray;
  readonly #listener:(event:{data:{action:string}})=>void;
  #removed=false;
  constructor(options:NativeTrayOptions){
    this.#tray=new Tray({title:options.title,image:options.image,template:false,width:16,height:16});
    if(!this.#tray.id||!this.#tray.visible)throw new Error("Native system tray could not be created");
    this.#listener=event=>{if(this.#removed)return;try{options.onAction(event.data.action);}catch(error){options.onError(error);}};
    emitter.on(`tray-clicked-${this.#tray.id}`,this.#listener);
  }
  get id():number{return this.#tray.id;}
  setImage(path:string):void{this.#tray.setImage(path);}
  setMenu(items:MenuItemConfig[]):void{this.#tray.setMenu(items);}
  remove():void{
    if(this.#removed)return;this.#removed=true;
    emitter.off(`tray-clicked-${this.#tray.id}`,this.#listener);this.#tray.remove();
  }
}
