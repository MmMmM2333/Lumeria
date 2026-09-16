import assert from "node:assert/strict";
import { Container, Sprite, Text, Texture, BufferImageSource } from "pixi.js";
import { createCanvas } from "@napi-rs/canvas";
import { NativeDesktopScene } from "./NativeDesktopScene.js";
import { NativeSelectionToolbar } from "./NativeSelectionToolbar.js";
import { NativeLaunchGhost } from "./NativeLaunchGhost.js";
import { configureNativeTextResolution, createNativeText, getNativeTextResolution } from "./nativeTypography.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";
import { createIconTextureRepository } from "../pixi/assets/iconTextureRepository.js";
import { DesktopLayer } from "../pixi/scene/DesktopLayer.js";
import { IconNode } from "../pixi/nodes/IconNode.js";
import { motionRuntime } from "../pixi/animation/motionRuntime.js";
import { snapshotContractValue } from "../contractSnapshot.js";
import type { CompleteDesktopSceneFrame, SceneItem } from "../sceneFrame.js";

export async function runNativeVisualParityTests(baseFrame:CompleteDesktopSceneFrame):Promise<void>{
  motionRuntime.reset();motionRuntime.suspendAutoTicker();
  const root=new Container();
  const icons=createIconTextureRepository({resolveSource:item=>item?.id?"native-test-icon":null,
    loadTexture:async()=>new Texture({source:new BufferImageSource({resource:new Uint8Array([240,30,90,255]),width:1,height:1,format:"rgba8unorm"})})});
  const item:SceneItem={id:"parity-app",type:"app",name:"这是一个用于验证拖拽交接的很长的应用名称 Windows Application",emoji:"中"};
  const folder:SceneItem={id:"parity-folder",type:"folder",name:"文件夹",childPages:[[{...item,id:"parity-child"}]]};
  await icons.synchronize([item]);
  const scene=new NativeDesktopScene(root,{iconTextures:icons});
  const frame=snapshotContractValue({...baseFrame,viewport:{...baseFrame.viewport,activePages:[[item,folder]],activePageIndex:0,gridCols:8,gridRows:6}}) as CompleteDesktopSceneFrame;
  try{
    for(const width of [760,900,1400]){
      scene.commit(frame,{width,height:800,resolution:1},{snapDesktopLayout:true});
      for(let i=0;i<60;i++)motionRuntime.step(1/120);
      const layer=root.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
      const node=root.getChildByLabel(`launchpad-item:${item.id}`,true) as IconNode;
      const actor=layer.groupDragLayer!.acquireNode(0);
      assert.equal(actor.iconTextures,icons,"drag artwork must use the same repository as the real native icon");
      actor.setState({...node.state!,dragging:false,ghosted:false});
      assert.equal(actor.iconSprite.texture,node.iconSprite.texture,"pickup must preserve the loaded artwork");
      const event=scene.createDragPointerEvent(item.id,{type:"pointermove"});
      assert.equal(event.dragVisualState.iconSize,node.state!.iconSize);
      assert.equal(event.dragVisualState.cellWidth,node.state!.cellWidth);
      assert.equal(event.dragVisualState.singleLineLabel,node.state!.singleLineLabel);
      assert.deepEqual(event.currentTarget.getBoundingClientRect(),node.getIconBounds({left:0,top:0,width,height:800}));
      assert.equal(actor.labelText.text,node.labelText.text,"pickup and real icon must retain the same line breaks at each window size");
      const folderNode=root.getChildByLabel(`launchpad-item:${folder.id}`,true) as IconNode;
      actor.setState({...folderNode.state!,dragging:false,ghosted:false});
      const textures:Texture[]=[];
      const visit=(container:Container)=>{if(container instanceof Sprite&&container.visible)textures.push(container.texture);for(const child of container.children)visit(child);};
      visit(actor.folderChildrenWrap);
      assert.ok(textures.includes(icons.resolve(item)!),"folder drag must keep thumbnail textures");
      const folderEvent=scene.createDragPointerEvent(folder.id,{});
      assert.equal(folderEvent.folderOriginBounds?.previewChildRects[0]?.childId,"parity-child");
      for(const phase of ["hover","flash"]){
        for(const delay of [0,0.008,0.032,0.08,0.16]){
          const hover={key:"parity-hover",phase,targetType:"app" as const,targetId:item.id};
          node.updateAppFolderCreateHoverAnimation({folderHoverState:hover});
          for(let i=0;i<30;i++)motionRuntime.step(1/120);
          node.updateAppFolderCreateHoverAnimation({folderHoverState:null});motionRuntime.step(delay);
          node.updateAppFolderCreateHoverAnimation({folderHoverState:hover});
          for(let i=0;i<50;i++){node.updateAppFolderCreateHoverAnimation({folderHoverState:hover});motionRuntime.step(1/120);}
          assert.ok(node.folderCreateBackdrop.visible&&node.folderCreateBackdrop.alpha>0.99,"a live target must survive interrupted hover exits");
        }
      }
      actor.clearAppFolderCreateHoverAnimation({immediate:true});
      const fingerprint=(text:string)=>{
        const canvas=createCanvas(96,80),context=canvas.getContext("2d");
        context.font=`40px ${(actor.emojiText.style.fontFamily as string[]).map(name=>JSON.stringify(name.replaceAll('"',''))).join(",")}`;
        context.fillText(text,4,50);return Buffer.from(context.getImageData(0,0,96,80).data);
      };
      assert.notDeepEqual(fingerprint("中"),fingerprint("\u{10ffff}"),"CJK fallback must not rasterize as missing-glyph boxes");
    }
    const textRoot=new Container(),label=createNativeText({text:"文字"}),ellipsis=new NativeSingleLineText("很长的文字",{fontSize:12},80);
    textRoot.addChild(label,ellipsis);assert.equal(label.resolution,2);assert.equal(ellipsis.resolution,2);
    configureNativeTextResolution(3,textRoot);assert.equal(label.resolution,3);assert.equal(createNativeText({text:"new"}).resolution,3);
    configureNativeTextResolution(1,textRoot);assert.equal(label.resolution,2);assert.equal(getNativeTextResolution(),2);textRoot.destroy({children:true});
    let clears=0,menus=0;
    const toolbar=new NativeSelectionToolbar({invalidate:()=>{},selectScope:()=>{},clear:()=>clears++,createFolder:()=>{},removeMenu:()=>menus++,done:()=>{}});
    const state={width:900,chromeInset:32,theme:"dark" as const,active:true,count:3,hiddenCount:1,frozen:false,canCancel:false,cancelArmed:false};
    for(const width of [420,760,900,1400]){
      toolbar.update({...state,width});for(let i=0;i<30;i++)motionRuntime.step(1/120);
      const rect=toolbar.cancelZoneRect()!;assert.ok(rect.left>=0&&rect.left+rect.width<=width);
      assert.equal(rect.top,32+(width<=760?6:10));
      assert.ok(toolbar.summaryText.length>0);
    }
    toolbar.focus(1);toolbar.handleKey("Enter");assert.equal(clears,1);
    toolbar.focus(3);toolbar.handleKey("Enter");assert.equal(menus,1);
    toolbar.update({...state,frozen:true});assert.equal(toolbar.hasFocus,false);
    toolbar.update({...state,theme:"light",canCancel:true,cancelArmed:true});assert.ok(toolbar.summaryText.includes("\n"));
    toolbar.update({...state,active:false});assert.equal(toolbar.cancelZoneRect(),null);toolbar.destroy();
    const source=new Container() as Container & {iconSprite:Sprite};
    source.iconSprite=new Sprite(Texture.WHITE);source.iconSprite.width=source.iconSprite.height=72;
    source.addChild(source.iconSprite);source.scale.set(64/72);
    const ghost=new NativeLaunchGhost();
    try{
      ghost.update({app:{id:"launch",name:"Launch",type:"app"},rect:{left:100,top:100,width:64,height:64}},source,72);
      const image=ghost.getChildByLabel("native-launch-image") as Sprite;
      assert.equal(image.width,72,"launch image must use the configured size, not the pressed or compact grid bounds");
      assert.ok(ghost.getChildByLabel("native-launch-shadow"),"image launch must retain the original drop shadow");
      let completed=false;const completion=ghost.waitForCompletion().then(()=>{completed=true;});
      for(let i=0;i<6;i++)motionRuntime.step(.1);
      await Promise.resolve();assert.equal(completed,false,"slow frames must not truncate the launch visual at its wall-clock duration");
      for(let i=0;i<20;i++)motionRuntime.step(1/60);
      await completion;assert.equal(ghost.alpha,0);assert.equal(ghost.scale.x,1.92);
      assert.ok(Math.abs(image.getBounds().width-138.24)<0.001);
    }finally{ghost.destroy();source.destroy({children:true});}
  }finally{scene.destroy();root.destroy();icons.dispose();configureNativeTextResolution(1);motionRuntime.reset();motionRuntime.resumeAutoTicker();}
}
