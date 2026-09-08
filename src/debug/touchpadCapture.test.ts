import assert from "node:assert/strict";
import { createTouchpadCapture } from "./touchpadCapture.js";

export function runTouchpadCaptureTests():void{
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
  capture.start();for(let i=0;i<31000;i++)capture.wheel(wheel,"desktop");assert.equal(capture.overflow,true);assert.equal(capture.recording,false);assert.equal(capture.count,30000);
}
