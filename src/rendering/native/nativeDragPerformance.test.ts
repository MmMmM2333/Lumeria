import assert from "node:assert/strict";
import { Container } from "pixi.js";
import { NativeDesktopScene } from "./NativeDesktopScene.js";
import { snapshotContractValue } from "../contractSnapshot.js";
import type { CompleteDesktopSceneFrame } from "../sceneFrame.js";
import { motionRuntime } from "../pixi/animation/motionRuntime.js";
import type { DesktopLayer } from "../pixi/scene/DesktopLayer.js";
import { IconNode } from "../pixi/nodes/IconNode.js";

/** Count real scene work rather than enforcing machine-dependent time limits. */
export function runNativeDragPerformanceTests(base:CompleteDesktopSceneFrame):void{
  const viewport={width:1200,height:800,resolution:1};
  motionRuntime.suspendAutoTicker();
  try{
    for(const count of [48,300,600]){
      const root=new Container(),scene=new NativeDesktopScene(root);
      try{
        const items=Array.from({length:count},(_,index)=>({id:`drag-perf-${index}`,name:`App ${index}`,emoji:"L",type:"app" as const}));
        const pages=Array.from({length:Math.ceil(count/48)},(_,index)=>items.slice(index*48,(index+1)*48));
        const frame=snapshotContractValue({...base,viewport:{...base.viewport,activePages:pages,activePageIndex:0,gridCols:8,gridRows:6},
          interaction:{...base.interaction,isTextlessMode:true}}) as CompleteDesktopSceneFrame;
        const group={key:"drag-perf",phase:"dragging",entries:[{actorKey:`item:${items[0]!.id}`,item:items[0]!,memberIds:[items[0]!.id],
          bundleCount:1,delayMs:0,order:0,origin:{x:100,y:100},originKind:"lead",originScale:1}],
          draggedIds:[items[0]!.id],leadId:items[0]!.id,totalCount:1,reducedMotion:true,trail:[],source:{area:"desktop",pageIndex:0,index:0}};
        const moving=(index:number):CompleteDesktopSceneFrame=>Object.freeze({...frame,interaction:Object.freeze({...frame.interaction,
          groupDragState:snapshotContractValue({...group,pointer:{x:200+index,y:200},center:{x:200+index,y:200}})})});
        scene.commit(frame,viewport,{snapDesktopLayout:true});
        scene.commit(moving(0),viewport,{snapDesktopLayout:false});
        const layer=root.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
        const actor=layer.groupDragLayer!.nodes.find(node=>node.item?.id===items[0]!.id)!;
        assert.ok(actor,"pickup creates a visible drag actor");const initialX=actor.x;
        const times:number[]=[];
        for(let index=1;index<=100;index++){
          const next=moving(index),start=performance.now(),work=scene.commit(next,viewport,{snapDesktopLayout:false});
          if(index>20)times.push(performance.now()-start);
          assert.equal(work.interactionFrames,1);assert.equal(work.fullPlanBuilds,0);
          assert.equal(work.reconciledNodes,0,`${count} apps: moving the pointer must not reconcile desktop nodes`);
        }
        assert.ok(actor.x>initialX+90,"interaction updates must actually move the drag actor");
        const latest=moving(100);
        for(let index=0;index<20;index++)scene.requestLayerUpdate("group-transfer-actor-handoff");
        const local=scene.commit(latest,viewport,{snapDesktopLayout:false});
        assert.equal(local.fullPlanBuilds,0,"coalesced handoff notifications must not rebuild the layout");
        assert.equal(local.interactionFrames,1);
        assert.equal(scene.commit(latest,viewport,{snapDesktopLayout:false}).interactionFrames,0,"one interaction commit consumes all pending handoffs");
        scene.requestLayerUpdate("folder-handoff-reconciled");
        assert.equal(scene.commit(latest,viewport,{snapDesktopLayout:false}).fullPlanBuilds,1,"folder lifecycle requests retain structural reconciliation");
        assert.equal(scene.commit(Object.freeze({...latest,interaction:Object.freeze({...latest.interaction,dragFolderTargetId:items[1]!.id})}),viewport,{snapDesktopLayout:false}).fullPlanBuilds,1,
          "a changed drop target still rebuilds the structural plan");
        assert.equal(scene.commit(Object.freeze({...latest,viewport:Object.freeze({...latest.viewport,activePages:snapshotContractValue([...pages.slice(1),pages[0]!])})}),viewport,{snapDesktopLayout:false}).fullPlanBuilds,1,
          "reordering projected pages must not reuse stale geometry");
        scene.commit(frame,viewport,{snapDesktopLayout:false});
        assert.ok(!actor.visible,"ending a drag clears its actor");
        const node=root.getChildByLabel(`launchpad-item:${items[1]!.id}`,true) as IconNode;
        const original=node.setState;let changes=0;
        node.setState=function(...args:Parameters<typeof original>){changes++;return original.apply(this,args);};
        scene.invalidateStructure();scene.commit(frame,viewport,{snapDesktopLayout:false});
        assert.equal(changes,0,"unaffected application visuals must survive a structural notification");
        const renamed=snapshotContractValue({...frame,viewport:{...frame.viewport,activePages:pages.map(page=>page.map(item=>item.id===items[1]!.id?{...item,name:"Renamed",customIconPath:"new-icon.png"}:item))}}) as CompleteDesktopSceneFrame;
        scene.commit(renamed,viewport,{snapDesktopLayout:false});
        assert.equal(changes,1,"name/artwork changes must still update a retained node");
        assert.equal(node.item?.name,"Renamed");node.setState=original;
        times.sort((a,b)=>a-b);console.log("Native drag commit",JSON.stringify({count,samples:times.length,p50ms:times[40],p95ms:times[76],fullPlanBuilds:0,reconciledNodes:0}));
      }finally{scene.destroy();root.destroy();motionRuntime.reset();}
    }
  }finally{motionRuntime.resumeAutoTicker();}
}
