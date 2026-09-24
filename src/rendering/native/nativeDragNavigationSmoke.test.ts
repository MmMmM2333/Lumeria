import assert from "node:assert/strict";
import { snapshotContractValue } from "../../rendering/contractSnapshot.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";
import type { NativeDesktopSmokeContext } from "../../native/diagnostics/nativeDesktopSmoke.test.js";
import type { LaunchpadApp, LaunchpadPages } from "../../domain/launchpadLayout.js";
import { IconNode } from "../../rendering/pixi/nodes/IconNode.js";
import { DesktopLayer } from "../../rendering/pixi/scene/DesktopLayer.js";
import { Container, Texture, BufferImageSource, Rectangle } from "pixi.js";

/** Exercises the native input/router boundary, not just the drag controller. */
export async function runNativeDragNavigationSmoke(c: Pick<NativeDesktopSmokeContext,
  "app" | "editing" | "layoutState" | "scene" | "folderFlow" | "currentFrame" | "onDesktopPageIndexCommit" | "present" | "waitFor" | "capture" | "saves">): Promise<void> {
  const editing = c.editing()!;
  const baseline = c.layoutState.operations.clonePages(c.layoutState.presentation.pages.value);
  const folderNavigationSamples:unknown[]=[];
  const template = baseline.flat().find((item): item is LaunchpadApp => item.type === "app")!;
  const app = (id: string): LaunchpadApp => ({ ...template, id, name: id });
  const fixture: LaunchpadPages = [[app("drag-a"), app("keep-a")], [app("drag-b"), app("keep-b")], [app("drag-c"), app("keep-c")]];
  const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  const settle = async () => {
    await c.present("drag navigation scene commit");
    await c.waitFor("drag navigation settled", () => !editing.drag.isDragActive() && !c.scene.getMotionSnapshot().active);
  };
  const restore = async (pages: LaunchpadPages, page = 0) => {
    c.folderFlow.reset(); editing.selection.clear(); editing.commit(pages); c.onDesktopPageIndexCommit(page); await settle();
  };
  // Keep the injected drag distinct from incidental OS mouse-motion packets.
  const pointer = (type: string, x: number, y: number) => c.app.nativeInput.emitPointer(type, x, y, 0,0,undefined,
    {pointerId:71,pointerType:"mouse",isPrimary:true});
  const pickup = async (id: string) => {
    const r = c.scene.createDragPointerEvent(id, {}).currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    pointer("pointermove", x, y); pointer("pointerdown", x, y); await delay(450);
    pointer("pointermove", x + 30, y + 20); await c.present("navigation pickup");
    assert.ok(editing.drag.isDragActive());
    return { x: x + 30, y: y + 20 };
  };
  const cancel = async (p: {x:number;y:number}) => {
    pointer("pointercancel",p.x,p.y); pointer("pointerup",p.x,p.y); await settle();
  };
  const desktopArrived = (index:number) => c.currentFrame().viewport.activePageIndex===index
    && editing.drag.groupDragState.value?.desktopPageIndex===index
    && Math.abs(c.scene.getMotionSnapshot().desktopPageTrackX + index*c.app.contentSize.width)<0.5;
  try {
    await restore(fixture);
    let p = await pickup("drag-a");
    c.app.nativeInput.emitWheel(p.x, p.y, 0, 120, 0, 0, performance.now());
    await c.waitFor("wheel changes page during drag", () => c.currentFrame().viewport.activePageIndex === 1);
    assert.ok(editing.drag.isDragActive(), "wheel must preserve drag ownership");
    await c.capture("drag-wheel-page");
    pointer("pointermove", c.app.contentSize.width - 3, p.y);
    await c.waitFor("edge changes page during drag", () => c.currentFrame().viewport.activePageIndex === 2);
    await c.waitFor("mixed wheel and edge actually display third page",()=>desktopArrived(2));
    assert.ok(editing.drag.isDragActive(), "edge page commit must not cancel its own drag");
    await cancel(p);
    assert.deepEqual(c.layoutState.presentation.pages.value, fixture, "cancel after navigation must preserve layout");

    const mixedFixture:LaunchpadPages=[...fixture,[app("drag-d"),app("keep-d")],[app("drag-e"),app("keep-e")]];
    await restore(mixedFixture);
    p=await pickup("drag-a");
    pointer("pointermove",c.app.contentSize.width-3,p.y);
    await c.waitFor("stationary edge first page",()=>desktopArrived(1));
    await c.waitFor("stationary edge second page",()=>desktopArrived(2));
    c.app.nativeInput.emitWheel(c.app.contentSize.width-3,p.y,0,-120,0,0,performance.now());
    await c.waitFor("wheel reverses edge navigation",()=>desktopArrived(1));
    await c.waitFor("edge resumes after wheel idle without pointer movement",()=>desktopArrived(2));
    pointer("pointermove",c.app.contentSize.width/2,p.y);
    await delay(950);assert.ok(desktopArrived(2),"leaving edge must stop automatic navigation");
    let time=performance.now(),sequence=900;
    const touchpad=(phase:"begin"|"update"|"inertia"|"end",dx=0)=>{
      time+=16;c.app.nativeInput.emitWheel(c.app.contentSize.width/2,p.y,dx,0,0,0,time,{source:"touchpad",phase,sequence});
    };
    touchpad("begin");touchpad("update",c.app.contentSize.width*.3);
    pointer("pointermove",c.app.contentSize.width-3,p.y);
    await delay(900);
    assert.equal(c.currentFrame().viewport.activePageIndex,2,"active touchpad must postpone edge repeats");
    assert.ok(editing.drag.isDragActive(),"drag must remain held during the active touchpad session");
    touchpad("end");await c.waitFor("touchpad settles on fourth page",()=>desktopArrived(3));
    await c.waitFor("edge follows completed touchpad",()=>desktopArrived(4));
    touchpad("end");touchpad("inertia",100);
    pointer("pointermove",c.app.contentSize.width/2,c.app.contentSize.height-100);
    await delay(100);assert.ok(desktopArrived(4),"late wheel end/inertia must not overwrite the edge destination");
    pointer("pointerup",c.app.contentSize.width/2,c.app.contentSize.height-100);await settle();
    assert.equal(c.layoutState.operations.findTopLevel(c.layoutState.presentation.pages.value,"drag-a")?.pageIndex,4,
      "drop must commit into the page actually displayed after mixed navigation");
    await c.capture("drag-mixed-navigation-drop");

    await restore(fixture, 2);
    p = await pickup("drag-c");
    pointer("pointermove",c.app.contentSize.width - 3,p.y);
    await c.waitFor("desktop virtual page",()=>c.currentFrame().viewport.activePageIndex===3);
    await c.capture("drag-desktop-virtual-page");
    await cancel(p);
    assert.equal(c.layoutState.presentation.pages.value.length,3,"cancel must discard the virtual desktop page");

    const folder = {id:"drag-folder",name:"Drag folder",type:"folder" as const,childPages:[[app("child-a"),app("child-b"),app("child-c")]]};
    const folderFixture: LaunchpadPages = [[app("outside"),folder],[app("other")]];
    const pagedFolder={...folder,childPages:[[app("child-a"),app("child-b")],[app("folder-page-two")],[app("folder-page-three")]]};
    await restore([[pagedFolder,app("folder-keep")]]);
    c.folderFlow.open(snapshotContractValue(pagedFolder) as SceneItem);await settle();
    p=await pickup("child-a");
    const repeatedPanel=c.scene.getFolderPanelRect()!;
    pointer("pointermove",repeatedPanel.left+repeatedPanel.width-3,p.y);
    const folderArrived=(index:number)=>{
      const motion=c.scene.getMotionSnapshot();
      folderNavigationSamples.push({time:performance.now(),index:c.folderFlow.snapshot().folderPageIndex,x:motion.folderPageTrackX,target:motion.folderPageTrackTargetX});
      return c.folderFlow.snapshot().folderPageIndex===index&&motion.folderPageTrackTargetX!==null
        && Math.abs((motion.folderPageTrackX??0)-motion.folderPageTrackTargetX)<0.5;
    };
    await c.waitFor("folder stationary repeat reaches second page",()=>folderArrived(1));
    await c.waitFor("folder stationary repeat reaches third page",()=>folderArrived(2));
    c.app.nativeInput.emitWheel(repeatedPanel.left+repeatedPanel.width-3,p.y,0,-120,0,0,performance.now());
    await c.waitFor("folder wheel reverses edge",()=>folderArrived(1));
    await c.waitFor("folder edge resumes after wheel",()=>folderArrived(2));
    pointer("pointermove",repeatedPanel.left+repeatedPanel.width/2,p.y);await cancel(p);
    await restore(folderFixture);
    c.folderFlow.open(snapshotContractValue(folder) as SceneItem); await settle();
    p = await pickup("child-a");
    const panel = c.scene.getFolderPanelRect()!;
    pointer("pointermove",panel.left+panel.width-3,p.y);
    await c.waitFor("folder virtual page",()=>c.folderFlow.snapshot().folderPageIndex===1);
    assert.ok(editing.drag.isDragActive());
    await c.waitFor("folder virtual page track arrives",()=>{
      const motion=c.scene.getMotionSnapshot();
      return motion.folderPageTrackTargetX!==null && motion.folderPageTrackTargetX < 0
        && Math.abs((motion.folderPageTrackX??0)-motion.folderPageTrackTargetX)<0.5;
    });
    await c.capture("drag-folder-virtual-page");
    pointer("pointermove",panel.left+panel.width/2,p.y);
    await c.present("folder virtual drop target");
    pointer("pointerup",panel.left+panel.width/2,p.y);
    await settle();
    const savedFolder=c.layoutState.operations.findFolder(c.layoutState.presentation.pages.value,folder.id)!.item;
    assert.equal(savedFolder.childPages.length,2,"drop must persist the new folder page");
    assert.ok(savedFolder.childPages[1]!.some(item=>item?.id==="child-a"));

    await restore(fixture,2);
    editing.selection.begin({initialIds:["drag-a","drag-b","drag-c"]});
    assert.equal(editing.createFolder(),true); await settle();
    assert.equal(c.currentFrame().viewport.activePageIndex,2,"batch create must remain on the command page");
    assert.ok(c.layoutState.presentation.pages.value[2]!.some(item=>item.type==="folder"));
    await c.capture("batch-folder-current-page");

    await restore(folderFixture);
    c.folderFlow.open(snapshotContractValue(folder) as SceneItem);await settle();
    editing.selection.begin({initialIds:["outside","child-a","child-b"]});
    assert.equal(editing.createFolder(),true);await settle();
    await c.waitFor("batch source folder closes",()=>!c.folderFlow.snapshot().renderedFolder);
    assert.equal(c.layoutState.operations.findFolder(c.layoutState.presentation.pages.value,folder.id)!.item.childPages.flat().length,1);
    await c.capture("batch-folder-from-open-folder");

    const previewFolder={...folder,childPages:[Array.from({length:12},(_,i)=>app(`preview-${i}`))]};
    await restore([[previewFolder,app("preview-keep")]]);
    c.folderFlow.open(snapshotContractValue(previewFolder) as SceneItem);await settle();
    editing.selection.begin({initialIds:["preview-1","preview-3","preview-5"]});
    assert.equal(editing.createFolder(),true);
    await settle();
    await c.waitFor("compacted source thumbnail finishes closing",()=>!c.folderFlow.snapshot().renderedFolder);
    const previewNode=c.app.stage.getChildByLabel(`launchpad-item:${folder.id}`,true);
    assert.ok(previewNode instanceof IconNode);
    const expected=["preview-0","preview-2","preview-4","preview-6","preview-7","preview-8","preview-9","preview-10","preview-11"]
      .slice(0,Math.min(9,c.layoutState.presentation.folderPageSize.value));
    assert.deepEqual(previewNode.folderChildNodes.filter(node=>node.visible&&node.renderable).map(node=>node.folderPreviewChildId),expected,
      "source thumbnail must compact removed slots and refill all nine positions from remaining children");
    await c.capture("batch-folder-source-preview-compacted");

    // Sample actual composited pixels, including the texture's own alpha. Node
    // opacity alone cannot detect a duplicate translucent raster getting brighter.
    const pixelRoot=new Container();
    const pixelNode=new IconNode({iconTextures:previewNode.iconTextures});
    const pixelTexture=new Texture({source:new BufferImageSource({resource:new Uint8Array([255,255,255,128]),width:1,height:1,alphaMode:"no-premultiply-alpha"})});
    pixelRoot.addChild(pixelNode);
    try{
      pixelNode.setState({...previewNode.state!,item:snapshotContractValue(app("pixel-probe")) as SceneItem,iconSize:64,ghosted:false,suppressFolderThumbFrame:false});
      pixelNode.position.set(40,40);pixelNode.labelText.visible=false;
      pixelNode.iconSprite.texture=pixelTexture;pixelNode.iconSprite.visible=true;pixelNode.emojiText.visible=false;
      pixelNode.iconSprite.width=pixelNode.iconSprite.height=64;
      pixelNode.prepareFolderSlotReleaseVisual(16);
      const samples:number[]=[];
      for(const mix of [0,0.25,0.5,0.75,1]){
        pixelNode.setFolderSlotReleaseVisualMix(mix);
        const pixels=await c.app.renderer.extract.pixels({target:pixelRoot,frame:new Rectangle(0,0,80,80),resolution:1,clearColor:0x000000});
        samples.push(pixels.pixels[(26*80+40)*4]!);
      }
      console.log("Closing translucent raster pixels",JSON.stringify(samples));
      assert.ok(Math.max(...samples)-Math.min(...samples)<=2,"closing raster handoff must preserve translucent pixel brightness");
    }finally{pixelRoot.destroy({children:true});pixelTexture.destroy(true);}

    const closingCoverage: number[]=[];
    const offCoverage=c.app.on("presented",()=>{
      const layer=c.app.stage.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
      for(const node of layer.singleStageFolderLayer.closingGhostLayer.children){
        if(!(node instanceof IconNode)||!node.folderSlotReleaseVisual.visible)continue;
        const incoming=node.folderSlotReleaseVisual.alpha;
        closingCoverage.push(incoming+node.visualWrap.alpha*(1-incoming));
      }
    });
    try{
      const live=c.layoutState.operations.findFolder(c.layoutState.presentation.pages.value,folder.id)!.item;
      c.folderFlow.open(snapshotContractValue(live) as SceneItem);await settle();
      c.folderFlow.close();await settle();
      assert.ok(closingCoverage.length>0,"real presented frames must cover the raster transition");
      assert.ok(closingCoverage.every(value=>value>=0.999),"closing thumbnail rasters must not lose opacity mid-transition");
    }finally{offCoverage();}

    for(const closeDelay of [40,120,220]){
      await restore([[previewFolder,app("race-keep")]]);
      c.folderFlow.open(snapshotContractValue(previewFolder) as SceneItem);await settle();
      editing.selection.begin({initialIds:["preview-1","preview-3","preview-5"]});
      c.folderFlow.close();await delay(closeDelay);await c.present("create during existing close");
      const layer=c.app.stage.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
      const session=layer.singleStageFolderLayer.folderVisualSession.snapshot().closing;
      assert.ok(session,"race must start before the closing session is retired");
      const poses=c.scene.captureClosingSourcePoses(folder.id,["preview-1","preview-3","preview-5"]);
      assert.ok(poses.size>0,"race requires presented closing actors");
      assert.equal(editing.createFolder(),true);
      const entries=editing.drag.groupDragState.value!.entries;
      for(const [id,pose] of poses){
        const entry=entries.find(entry=>entry.item.id===id);assert.ok(entry);
        assert.ok(Math.abs(entry.origin.x-(pose.rect.left+pose.rect.width/2))<0.01,"creation must inherit closing actor x");
        assert.ok(Math.abs(entry.origin.y-(pose.rect.top+pose.rect.height/2))<0.01,"creation must inherit closing actor y");
      }
      await c.present("closing actors transferred");
      for(const id of poses.keys())assert.equal(layer.singleStageFolderLayer.closingGhosts.activeGhostsByItemId.has(id),false,
        "the closing layer must relinquish actors now owned by creation");
      await settle();await c.waitFor("one close completes",()=>!c.folderFlow.snapshot().renderedFolder);
      await c.capture(`batch-create-during-close-${closeDelay}`);
    }

    // A full page forces the closing source folder into the next page while an
    // application is dragged in front of it. Its real node must retain identity.
    const pageSize=c.layoutState.presentation.pageSize.value;
    const fullPage=Array.from({length:pageSize-1},(_,i)=>app(`full-${i}`));
    await restore([[...fullPage,folder],[app("overflow-keep")]]);
    const original=c.app.stage.getChildByLabel(`launchpad-item:${folder.id}`,true);
    assert.ok(original instanceof IconNode);
    c.folderFlow.open(snapshotContractValue(folder) as SceneItem);await settle();
    p=await pickup("child-a");
    const closingPanel=c.scene.getFolderPanelRect()!;
    pointer("pointermove",Math.max(1,closingPanel.left-24),closingPanel.top+closingPanel.height/2);
    await c.waitFor("source folder closing",()=>c.folderFlow.snapshot().isClosing || !c.folderFlow.snapshot().renderedFolder);
    const destination=c.scene.createDragPointerEvent("full-0",{}).currentTarget.getBoundingClientRect();
    pointer("pointermove",destination.left+2,destination.top+destination.height-2);
    await delay(80);await c.present("closing folder crosses page boundary");
    const layer=c.app.stage.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
    const reused=[...layer.iconNodes.values()].find(node=>node.item?.id===folder.id);
    assert.equal(reused,original,"closing folder must retain its node across page-local layout keys");
    assert.ok([...layer.iconNodes].some(([key,node])=>node===original && key.startsWith("page:1:")),"fixture must actually move the source folder to the next page");
    await c.capture("drag-closing-folder-last-slot");
    await cancel(p);
  } catch(error) {
    console.error("Drag navigation failure state",JSON.stringify({folder:c.folderFlow.snapshot(),drag:editing.drag.groupDragState.value?.phase,
      source:editing.drag.dragMeta.value?.source,page:c.currentFrame().viewport.activePageIndex,motion:c.scene.getMotionSnapshot(),
      groupPage:editing.drag.groupDragState.value?.desktopPageIndex,intent:editing.drag.groupDragState.value?.intent,
      folderNavigationSamples:folderNavigationSamples.filter((_,i)=>i%8===0)}));
    await c.capture("drag-navigation-failure");throw error;
  } finally {
    if(editing.drag.isDragActive()){editing.drag.cancelDrag({type:"pointercancel"});pointer("pointerup",0,0);}
    await restore(baseline); await c.saves.flush();
  }
  console.log("Native drag wheel/edge/virtual pages, contextual batch creation and closing identity passed");
}
