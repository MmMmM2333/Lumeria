import { createTouchpadCapture,setTouchpadCapture } from "./touchpadCapture.js";
import { translateMessage } from "../i18n/catalogs.js";
import {getPageSwipeSpeed,cyclePageSwipeSpeed} from "../rendering/pageSwipePreview.js";

export function installWebTouchpadCapture():void{
  const t=(key:string,values:Record<string,string|number>={})=>translateMessage(document.documentElement.lang==="en-US"?"en-US":"zh-CN",key,values);
  const panel=document.createElement("aside"),status=document.createElement("span");
  panel.setAttribute("aria-label",t("touchpadCapture.title"));
  panel.style.cssText="position:fixed;bottom:8px;left:8px;z-index:2147483647;background:#20242e;color:white;padding:10px;border:1px solid #8292ad;border-radius:8px;font:13px system-ui;display:flex;gap:10px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 40px)";
  const capture=createTouchpadCapture("web",()=>({width:innerWidth,height:innerHeight,resolution:devicePixelRatio}),()=>{status.textContent=t(capture.overflow?"touchpadCapture.full":capture.recording?"touchpadCapture.recording":"touchpadCapture.stopped");});
  setTouchpadCapture(capture);status.textContent=t("touchpadCapture.stopped");
  const exportFile=()=>{
    capture.stop();const url=URL.createObjectURL(new Blob([capture.serialize()],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download=`touchpad-web-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const toggle=()=>capture.recording?capture.stop():capture.start();
  panel.append(status);
  for(const [label,action] of [[t("touchpadCapture.toggle"),toggle],[t("touchpadCapture.mark"),()=>{capture.mark();marked.textContent=t("touchpadCapture.marked",{count:capture.count});}],[t("touchpadCapture.export"),exportFile]] as const){const button=document.createElement("button");button.textContent=label;button.onclick=action;panel.append(button);}
  const marked=document.createElement("span");panel.append(marked);
  const speed=document.createElement("button");
  const speedLabel=()=>t("touchpadCapture.speed",{mode:getPageSwipeSpeed()?t("touchpadCapture.rate",{rate:getPageSwipeSpeed()}):t("touchpadCapture.baseline")});
  const changeSpeed=()=>{cyclePageSwipeSpeed();capture.speed();speed.textContent=speedLabel();};
  speed.textContent=speedLabel();speed.onclick=changeSpeed;panel.append(speed);
  document.body.append(panel);
  window.addEventListener("keydown",event=>{if(event.key==="F9"&&!event.repeat&&!event.isComposing){event.preventDefault();event.stopImmediatePropagation();changeSpeed();}},true);
  window.addEventListener("keydown",event=>{if(event.repeat||event.isComposing)return;if(["F6","F7","F8"].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();if(event.key==="F6")toggle();if(event.key==="F7"){capture.mark();marked.textContent=t("touchpadCapture.marked",{count:capture.count});}if(event.key==="F8")exportFile();}},true);
  window.addEventListener("wheel",event=>{if(panel.contains(event.target as Node))return;const el=event.target instanceof Element?event.target:null;capture.wheel(event,el?.closest('[role="dialog"],.settings-panel')?"control":"desktop");},{capture:true,passive:true});
  document.addEventListener("scroll",event=>{if(event.target instanceof Element)capture.scroll(event.target.scrollTop);},true);
}
