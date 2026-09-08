import assert from "node:assert/strict";
import { Sprite, type Container } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createNativeEditing } from "../../native/nativeEditing.js";
import type { LaunchpadPages, ReadonlyLaunchpadPages } from "../../domain/launchpadLayout.js";
import type { NativeFolderFlow } from "./nativeFolderFlow.js";
import type { NativeDesktopScene } from "./NativeDesktopScene.js";
import { DesktopLayer } from "../pixi/scene/DesktopLayer.js";
import { IconNode } from "../pixi/nodes/IconNode.js";

type Options={app:NativePixiApplication;scene:NativeDesktopScene;editing:ReturnType<typeof createNativeEditing>;folder:NativeFolderFlow;
  pages():ReadonlyLaunchpadPages;clone(pages:ReadonlyLaunchpadPages):LaunchpadPages;
  present(reason:string):Promise<void>;capture(name:string):Promise<void>;};

/** Real native input, rendering and presented-frame regression against isolated fixtures. */
export async function runNativeDragVisualSmoke(options:Options){
  const {app,scene,editing,folder}=options;
  const baseline=options.clone(options.pages()),windowFrame=app.window.getFrame();
  const source=baseline[0]?.find(item=>item.type==="app"),target=baseline[0]?.find(item=>item.type==="app"&&item.id!==source?.id);
  const folderItem=baseline[0]?.find(item=>item.type==="folder");
  assert.ok(source&&target&&folderItem,"drag visual smoke needs two apps and a folder");
  const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
  const wait=async(reason:string,condition:()=>boolean)=>{
    const deadline=performance.now()+7000;
    while(!condition()){assert.ok(performance.now()<deadline,`${reason}: ${JSON.stringify({phase:editing.drag.groupDragState.value?.phase,hover:editing.drag.dragFolderHoverState.value,folder:folder.snapshot().renderedFolder?.id})}`);await delay(16);}
    await options.present(reason);
  };
  const node=(id:string)=>{const value=app.stage.getChildByLabel(`launchpad-item:${id}`,true);assert.ok(value instanceof IconNode);return value;};
  const bounds=(id:string)=>scene.createDragPointerEvent(id,{}).currentTarget.getBoundingClientRect();
  // A dedicated touch pointer keeps real mouse movement from terminating this replay.
  const pointer=(type:string,x:number,y:number)=>app.nativeInput.emitPointer(type,x,y,0,0,undefined,{pointerId:71,pointerType:"touch",isPrimary:true});
  const move=(x:number,y:number)=>pointer("pointermove",x,y);
  const settle=()=>wait("drag visual scene settled",()=>!scene.getMotionSnapshot().active&&!editing.drag.isDragActive()&&!folder.snapshot().renderedFolder);
  const layer=()=>app.stage.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
  const pickup=async(id:string)=>{
    const rect=bounds(id),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    pointer("pointerdown",x,y);await delay(450);move(x+30,y+24);
    await wait("native drag pickup",()=>editing.drag.isDragActive());
    const actor=layer().groupDragLayer!.nodes.find(actor=>actor.item?.id===id&&actor.visible);assert.ok(actor);
    return {actor,x,y};
  };
  const samples:{width:number;phase:string;visible:boolean;alpha:number;instructions:number;target:string}[]=[];
  const releaseSamples:{width:number;coverage:number;labels:string[]}[]=[];
  let releasing=false;
  const visibleAlpha=(leaf:Container)=>{let alpha=1;for(let current:Container|null=leaf;current;current=current.parent){if(!current.visible||!current.renderable)return 0;alpha*=current.alpha;}return alpha;};
  let enteredAt=0,lastKey="";
  const off=app.on("presented",()=>{
    if(releasing){
      const real=app.stage.getChildByLabel(`launchpad-item:${source.id}`,true);
      const actors=layer().groupDragLayer?.nodes.filter(actor=>actor.item?.id===source.id)??[];
      const owners=[...(real instanceof IconNode?[real]:[]),...actors];
      const labels=owners.flatMap(owner=>[owner.labelText,owner.labelTransitionText]).filter(label=>visibleAlpha(label)>0);
      releaseSamples.push({width:app.contentSize.width,coverage:labels.reduce((sum,label)=>sum+visibleAlpha(label),0),labels:labels.map(label=>label.text)});
    }
    const hover=editing.drag.dragFolderHoverState.value;
    if(!hover||hover.targetId!==target.id||folder.snapshot().renderedFolder){lastKey="";return;}
    if(lastKey!==hover.key){lastKey=hover.key;enteredAt=performance.now();}
    if(performance.now()-enteredAt<220)return;
    const targetNode=app.stage.getChildByLabel(`launchpad-item:${target.id}`,true);
    if(!(targetNode instanceof IconNode))return;
    samples.push({width:app.contentSize.width,phase:hover.phase,target:hover.targetId,
      visible:targetNode.visible&&targetNode.folderCreateBackdrop.visible,alpha:targetNode.folderCreateBackdrop.alpha,
      instructions:targetNode.folderCreateBackdrop.context.instructions.length});
  });
  let failure:unknown;
  try{
    for(const width of [760,1280]){
      app.window.setSize(width,760);await delay(120);
      const fixture=options.clone(baseline);const long=fixture[0]!.find(item=>item.id===source.id)!;
      long.name="这是用于验证小窗口与大窗口拖拽的很长应用名称 Windows Application";
      const testFolder=fixture[0]!.find(item=>item.id===folderItem.id);
      if(testFolder?.type==="folder"&&testFolder.childPages[0]?.[0])testFolder.childPages[0][0].customIconPath=source.customIconPath||source.iconPath||null;
      editing.commit(fixture);await settle();
      const original=node(source.id),text=original.labelText.text,texture=original.iconSprite.texture,size=original.iconSize;
      const picked=await pickup(source.id);
      assert.equal(picked.actor.iconSprite.texture,texture,"native pickup must keep the loaded icon texture");
      assert.equal(picked.actor.iconSize,size,"label bounds must not enlarge the dragged artwork");
      assert.equal(picked.actor.labelText.text,text,"pickup must preserve line breaks");
      await options.capture(`drag-longname-${width}-pickup`);
      for(let attempt=0;attempt<5;attempt++){
        const targetBounds=bounds(target.id),tx=targetBounds.left+targetBounds.width/2,ty=targetBounds.top+targetBounds.height/2;
        move(tx,ty);await wait("application folder hover target",()=>editing.drag.dragFolderHoverState.value?.targetId===target.id);
        await delay(320);await options.present("steady application folder hover");
        if(attempt===0)await options.capture(`drag-white-frame-${width}`);
        move(tx+3,ty-2);await delay(120);move(tx-2,ty+3);await delay(attempt===4?460:160);
        move(picked.x,picked.y);await wait("left application hover target",()=>!editing.drag.dragFolderHoverState.value);await delay(80+attempt*12);
      }
      move(picked.x,picked.y);await options.present("long-name return destination");
      releasing=true;pointer("pointerup",picked.x,picked.y);await settle();releasing=false;
      assert.equal(node(source.id).labelText.text,text,"release must preserve the same label layout");
      await options.capture(`drag-longname-${width}-released`);
      const folderSource=node(folderItem.id);
      const folderTextures:unknown[]=[];
      const collect=(root:Container)=>{if(root instanceof Sprite&&root.visible)folderTextures.push(root.texture);for(const child of root.children)collect(child);};
      collect(folderSource.folderChildrenWrap);
      assert.ok(folderTextures.length>0,"folder probe requires a real image thumbnail");
      const pickedFolder=await pickup(folderItem.id);
      const pickedTextures:unknown[]=[];
      const collectPicked=(root:Container)=>{if(root instanceof Sprite&&root.visible)pickedTextures.push(root.texture);for(const child of root.children)collectPicked(child);};
      collectPicked(pickedFolder.actor.folderChildrenWrap);
      assert.deepEqual(pickedTextures,folderTextures,"native folder pickup must retain every thumbnail texture");
      await options.capture(`drag-folder-${width}-pickup`);
      editing.drag.cancelDrag({userInitiatedCancel:true});pointer("pointerup",pickedFolder.x,pickedFolder.y);await settle();
    }
    assert.ok(samples.length>=20,"white-frame probe must observe presented hover frames");
    const missing=samples.filter(sample=>!sample.visible||sample.alpha<0.9||!sample.instructions);
    assert.deepEqual(missing,[],"active application folder white frame disappeared");
    assert.ok(releaseSamples.length>2,"label handoff must be observed in presented frames");
    assert.deepEqual(releaseSamples.filter(sample=>sample.coverage<0.95),[],"long-name release must not flash or disappear during ownership handoff");
    return {samples,releaseSamples,windows:2,hoverReentries:10};
  }catch(error){failure=error;console.error("Native drag visual probe failed",error);await options.capture("drag-visual-failure");throw error;}
  finally{
    off();
    try{
      if(editing.drag.isDragActive())editing.drag.cancelDrag({userInitiatedCancel:true});
      pointer("pointerup",0,0);
      if(folder.snapshot().renderedFolder)folder.close();
      await wait("visual smoke drag cleanup",()=>!editing.drag.isDragActive()&&!folder.snapshot().renderedFolder);
      editing.commit(baseline);app.window.setSize(windowFrame.width,windowFrame.height);app.window.setPosition(windowFrame.x,windowFrame.y);
      await settle();
    }catch(error){if(failure)console.error("Native drag visual cleanup also failed",error);else throw error;}
  }
}
