import assert from "node:assert/strict";
import {Container} from "pixi.js";
import {NativeDesktopScene} from "./NativeDesktopScene.js";
import {snapshotContractValue} from "../contractSnapshot.js";
import type {CompleteDesktopSceneFrame} from "../sceneFrame.js";
import type {DesktopLayer} from "../pixi/scene/DesktopLayer.js";
import {motionRuntime} from "../pixi/animation/motionRuntime.js";

export function runNativeSearchPerformanceTests(base:CompleteDesktopSceneFrame):void {
  motionRuntime.suspendAutoTicker();
  try{
    for(const count of [300,600]){
      const root=new Container(),scene=new NativeDesktopScene(root),viewport={width:1200,height:800,resolution:1};
      const items=Array.from({length:count},(_,i)=>({id:`search-perf-${i}`,name:`App ${i}`,type:"app" as const}));
      const pages=Array.from({length:Math.ceil(count/28)},(_,i)=>items.slice(i*28,(i+1)*28));
      const frame=snapshotContractValue({...base,viewport:{...base.viewport,gridCols:7,gridRows:4,activePages:pages,activePageIndex:0}}) as CompleteDesktopSceneFrame;
      try{
        scene.commit(frame,viewport,{snapDesktopLayout:true});
        const layer=root.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
        const desktop=new Map(layer.iconNodes);
        const search=(subset:typeof items)=>snapshotContractValue({...frame,
          viewport:{...frame.viewport,activePages:Array.from({length:Math.ceil(subset.length/28)},(_,i)=>subset.slice(i*28,(i+1)*28)),desktopTrackMotionKey:"search"},
          interaction:{...frame.interaction,isSearchMode:true}}) as CompleteDesktopSceneFrame;
        for(const subset of [items.filter((_,i)=>i%3===0),items.filter((_,i)=>i%3===0),[items[0]!],[],items.filter((_,i)=>i%3!==0)]){
          scene.commit(search(subset),viewport,{snapDesktopLayout:false});
          assert.ok(layer.iconNodes.size<=84,"search realizes at most neighbouring pages at rest");
          assert.ok([...desktop.values()].every(node=>!node.destroyed),"narrow queries preserve the desktop cache");
          assert.ok(layer.getNodeRetentionStatistics().searchCache<=count+84,"search history remains bounded");
        }
        scene.commit(frame,viewport,{snapDesktopLayout:false});
        for(const [key,node] of desktop){assert.equal(layer.iconNodes.get(key),node,"return to desktop reuses each node");assert.ok(node.visible);}
        scene.commit(search([items[0]!]),viewport,{snapDesktopLayout:false});
        scene.commit(search([items[0]!]),{...viewport,resolution:2},{snapDesktopLayout:false});
        scene.commit(frame,{...viewport,resolution:2},{snapDesktopLayout:false});
        for(const node of desktop.values())assert.equal(node.labelText.resolution,2,"detached desktop labels follow DPI changes during search");
        scene.commit(frame,viewport,{snapDesktopLayout:false});
        for(const ids of [[items[0]!.id,items[40]!.id],items.slice(0,60).map(item=>item.id),[]]){
          const selected=Object.freeze({...frame,interaction:Object.freeze({...frame.interaction,isBatchSelectionActive:true,selectedAppIds:snapshotContractValue(new Set(ids))})});
          const work=scene.commit(selected,viewport,{snapDesktopLayout:false});
          assert.equal(work.fullPlanBuilds,0,"cross-page/range selection must not rebuild geometry");
          for(const node of layer.iconNodes.values())assert.equal(node.state!.batchSelected,ids.includes(node.item!.id));
        }
        const focused=Object.freeze({...frame,interaction:Object.freeze({...frame.interaction,focusedIcon:Object.freeze({area:"desktop",id:items[1]!.id,pageIndex:0})})});
        assert.equal(scene.commit(focused,viewport,{snapDesktopLayout:false}).fullPlanBuilds,0);
        assert.equal(layer.iconNodes.get(`page:0:${items[1]!.id}`)!.state!.focused,true);
        const localStates=[...layer.iconNodes.values()].map(node=>node.state);
        scene.invalidateStructure();scene.commit(focused,viewport,{snapDesktopLayout:false});
        assert.deepEqual([...layer.iconNodes.values()].map(node=>node.state),localStates,"local presentation must equal a full rebuild");
        // A real folder badge must include selected children even on other pages.
        const folderFrame=snapshotContractValue({...frame,viewport:{...frame.viewport,activePages:[[{id:"selection-folder",name:"Folder",type:"folder",childPages:[[items[0]],[items[40]]]}],...pages.slice(1)]}}) as CompleteDesktopSceneFrame;
        scene.commit(folderFrame,viewport,{snapDesktopLayout:false});
        const folderSelected=Object.freeze({...folderFrame,interaction:Object.freeze({...folderFrame.interaction,isBatchSelectionActive:true,selectedAppIds:snapshotContractValue(new Set([items[0]!.id,items[40]!.id]))})});
        assert.equal(scene.commit(folderSelected,viewport,{snapDesktopLayout:false}).fullPlanBuilds,0);
        assert.equal(layer.iconNodes.get("page:0:selection-folder")!.state!.selectedChildCount,2);
        assert.equal(scene.commit(folderFrame,viewport,{snapDesktopLayout:false}).fullPlanBuilds,0);
        assert.equal(layer.iconNodes.get("page:0:selection-folder")!.state!.selectedChildCount,0);
      }finally{scene.destroy();root.destroy();motionRuntime.reset();}
    }
  }finally{motionRuntime.resumeAutoTicker();}
}
