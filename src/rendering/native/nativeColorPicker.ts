import { Container, Graphics, Rectangle, Sprite, Texture, BufferImageSource, type FederatedPointerEvent } from "pixi.js";
import type { NativeManagement } from "./NativeManagement.js";
import type { NativeSettingsControl } from "./NativeSettingsShell.js";
import { createNativeSettingsInput } from "./nativeSettingsInput.js";
import { createNativeText, NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { nativeSettingsStyle } from "./NativeFluentButton.js";
import { t } from "../../native/nativeLocalization.js";

import { hsvColor, colorHsv } from "../../domain/colorPicker.js";

/** Owns a color draft; closing never mutates the caller's setting. */
export function chooseNativeColor(management:NativeManagement,initial:number):Promise<number|null>{
  return new Promise(resolve=>{
    let selected=initial,accepted=false,commit=()=>{};
    management.dialog({id:"color-picker",title:t("dialogs.colorPicker.title"),width:360,
      cancelText:t("common.actions.cancel"),confirmText:t("common.actions.apply"),
      confirm:()=>{commit();accepted=true;resolve(selected);},onClose:()=>{if(!accepted)resolve(null);},
      build:width=>{
        const node=new Container(),controls:NativeSettingsControl[]=[],style=nativeSettingsStyle(management.theme);
        let [h,s,v]=colorHsv(selected),pointer:number|null=null;
        const size=64,pixels=new Uint8Array(size*size*4);
        const source=new BufferImageSource({resource:pixels,width:size,height:size,format:"rgba8unorm",alphaMode:"no-premultiply-alpha"});
        const texture=new Texture({source}),spectrum=new Sprite({texture,eventMode:"static",cursor:"crosshair",label:"native-color:spectrum"});
        spectrum.width=width;spectrum.height=180;spectrum.hitArea=new Rectangle(0,0,size,size);node.addChild(spectrum);
        const marker=new Graphics({eventMode:"none"});node.addChild(marker);
        const previews=new Graphics({eventMode:"none"});previews.y=226;node.addChild(previews);
        const text=(value:string,x:number,y:number)=>{const label=createNativeText({text:value,style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,fill:style.text}});label.position.set(x,y);node.addChild(label);};
        text(t("dialogs.colorPicker.original"),0,262);text(t("dialogs.colorPicker.new"),width/2+6,262);
        const input=createNativeSettingsInput(management.host,{width,height:34,value:"",theme:management.theme,invalidate:management.invalidate});
        input.label="native-color:hex";input.y=291;node.addChild(input);
        const channels=["R","G","B"].map((name,index)=>{
          const x=index*(width+9)/3;text(name,x,335);
          const field=createNativeSettingsInput(management.host,{width:(width-18)/3,height:34,value:"",theme:management.theme,invalidate:management.invalidate});
          field.label=`native-color:${name}`;field.position.set(x,355);node.addChild(field);return field;
        });
        let rasterHue=-1;
        const paint=()=>{
          selected=hsvColor(h,s,v);
          if(h!==rasterHue){
            rasterHue=h;
            for(let y=0;y<size;y++)for(let x=0;x<size;x++){
              const color=hsvColor(h,x/(size-1),1-y/(size-1)),offset=(y*size+x)*4;
              pixels[offset]=color>>16&255;pixels[offset+1]=color>>8&255;pixels[offset+2]=color&255;pixels[offset+3]=255;
            }
            source.update();
          }
          marker.clear().circle(s*width,(1-v)*180,6).stroke({color:0,width:3}).circle(s*width,(1-v)*180,6).stroke({color:0xffffff,width:1.5});
          previews.clear().roundRect(0,0,width/2-6,28,4).fill(initial).roundRect(width/2+6,0,width/2-6,28,4).fill(selected);
          input.value=`#${selected.toString(16).padStart(6,"0")}`;
          channels.forEach((field,index)=>{field.value=String(selected>>(16-index*8)&255);});management.invalidate();
          paintHue();
        };
        const hue=new Container({eventMode:"static",cursor:"pointer",label:"native-color:hue"});
        hue.hitArea=new Rectangle(0,0,width,32);hue.y=188;
        let huePointer:number|null=null;
        const huePixels=new Uint8Array(360*4);
        for(let index=0;index<360;index++){const color=hsvColor(index,1,1);huePixels.set([color>>16&255,color>>8&255,color&255,255],index*4);}
        const hueTexture=new Texture({source:new BufferImageSource({resource:huePixels,width:360,height:1,format:"rgba8unorm",alphaMode:"no-premultiply-alpha"})});
        const hueStrip=new Sprite({texture:hueTexture,eventMode:"none"});hueStrip.position.set(10,10);hueStrip.width=width-20;hueStrip.height=12;hue.addChild(hueStrip);
        const hueClip=new Graphics({eventMode:"none"}).roundRect(10,10,width-20,12,6).fill(0xffffff);
        hue.addChild(hueClip);hueStrip.mask=hueClip;
        const hueThumb=new Graphics({eventMode:"none"});hue.addChild(hueThumb);node.addChild(hue);
        const paintHue=()=>{const x=10+(width-20)*h/359;hueThumb.clear()
          .circle(x,17,9).fill({color:0,alpha:0.2})
          .circle(x,16,8).fill(hsvColor(h,1,1)).stroke({color:0xffffff,width:2});};
        const huePoint=(event:FederatedPointerEvent)=>{h=Math.round(Math.max(0,Math.min(1,(event.getLocalPosition(hue).x-10)/(width-20)))*359);paint();};
        hue.on("pointerdown",event=>{if(event.button!==0)return;event.stopPropagation();management.host.blur();huePointer=event.pointerId;huePoint(event);});
        hue.on("globalpointermove",event=>{if(huePointer===event.pointerId)huePoint(event);});
        for(const name of ["pointerup","pointerupoutside","pointercancel"] as const)hue.on(name,()=>{huePointer=null;});
        const setColor=(color:number)=>{[h,s,v]=colorHsv(color);paint();};
        const commitHex=()=>{const value=input.value.trim();if(/^#?[a-f\d]{6}$/i.test(value))setColor(Number.parseInt(value.replace("#",""),16));else paint();};
        const commitRgb=()=>{const rgb=channels.map(field=>Number(field.value));if(rgb.every(value=>Number.isInteger(value)&&value>=0&&value<=255))setColor((rgb[0]!<<16)|(rgb[1]!<<8)|rgb[2]!);else paint();};
        input.on("input",()=>{if(/^#[a-f\d]{6}$/i.test(input.value))commitHex();});
        commit=()=>{if(channels.some(field=>field.focused))commitRgb();else commitHex();};
        for(const field of [input,...channels]){
          const save=field===input?commitHex:commitRgb;field.on("blur",save);
          controls.push({node:field,disabled:()=>false,focus:active=>{if(active)field.focus();else field.blur();},handleKey:key=>{if(key!=="Enter")return false;save();return true;}});
        }
        const point=(event:FederatedPointerEvent)=>{const local=event.getLocalPosition(node);s=Math.max(0,Math.min(1,local.x/width));v=1-Math.max(0,Math.min(1,local.y/180));paint();};
        spectrum.on("pointerdown",event=>{if(event.button!==0)return;event.stopPropagation();management.host.blur();pointer=event.pointerId;point(event);});
        spectrum.on("globalpointermove",event=>{if(pointer===event.pointerId)point(event);});
        for(const name of ["pointerup","pointerupoutside","pointercancel"] as const)spectrum.on(name,()=>{pointer=null;});
        const ring=new Graphics({eventMode:"none"});node.addChild(ring);
        controls.unshift({node:spectrum,disabled:()=>false,focus:active=>{ring.clear();if(active)ring.rect(0,0,width,180).stroke({color:style.accent,width:2});management.invalidate();},handleKey:key=>{
          if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(key))return false;
          s=Math.max(0,Math.min(1,s+(key==="ArrowLeft"?-0.01:key==="ArrowRight"?0.01:0)));
          v=Math.max(0,Math.min(1,v+(key==="ArrowDown"?-0.01:key==="ArrowUp"?0.01:0)));paint();return true;
        }},{node:hue,disabled:()=>false,focus:active=>{ring.clear();if(active)ring.roundRect(0,188,width,32,4).stroke({color:style.accent,width:2});management.invalidate();},handleKey:key=>{
          const next=key==="Home"?0:key==="End"?359:key==="ArrowLeft"||key==="ArrowDown"?h-1:key==="ArrowRight"||key==="ArrowUp"?h+1:null;
          if(next===null)return false;h=Math.max(0,Math.min(359,next));paint();return true;
        }});
        paint();return {node,height:393,controls,update:()=>false,dispose:()=>{
          for(const field of [input,...channels]){field.removeAllListeners("blur");field.destroy();}
          texture.destroy(true);
          hueTexture.destroy(true);
        }};
      }});
  });
}
