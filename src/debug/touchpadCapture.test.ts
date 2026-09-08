import assert from "node:assert/strict";
import { createTouchpadCapture } from "./touchpadCapture.js";
import { getPageSwipeSpeed,setPageSwipeSpeed } from "../rendering/pageSwipePreview.js";

export function runTouchpadCaptureTests():void{
  const previousSpeed=getPageSwipeSpeed();
  const capture=createTouchpadCapture("native",()=>({width:900,height:600,resolution:1.25}));
  const wheel={deltaX:5.25,deltaY:-10,deltaMode:0,timeStamp:100,ctrlKey:false,metaKey:false};
  capture.wheel(wheel,"desktop");assert.equal(capture.count,0);
  capture.start();capture.wheel(wheel,"folder");capture.mark();
  capture.decision({commands:[{type:"commitPage",scope:"folder:private-app-id",pageIndex:2}],handled:true,presentation:null});
  capture.stop();const count=capture.count;capture.wheel(wheel,"desktop");assert.equal(capture.count,count);
  capture.start();capture.scroll(45);capture.stop();const result=JSON.parse(capture.serialize());
  assert.equal(result.events.filter((event:{kind:string})=>event.kind==="start").length,2,"restarting retains earlier segments");
  assert.equal(result.events.find((event:{kind:string})=>event.kind==="wheel").dx,5.25);
  assert.equal(result.events.find((event:{kind:string})=>event.kind==="wheel").momentum,null);
  assert.ok(!capture.serialize().includes("private-app-id"),"IDs and user content are never exported");
  try{setPageSwipeSpeed(4);capture.start();capture.speed();capture.stop();const modes=JSON.parse(capture.serialize()).events;assert.equal(modes.findLast((event:{kind:string})=>event.kind==="start").speed,4);assert.equal(modes.find((event:{kind:string})=>event.kind==="speed").speed,4);}finally{setPageSwipeSpeed(previousSpeed);}
  capture.start();for(let i=0;i<31000;i++)capture.wheel(wheel,"desktop");assert.equal(capture.overflow,true);assert.equal(capture.recording,false);assert.equal(capture.count,30000);
}
