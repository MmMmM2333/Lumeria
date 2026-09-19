import assert from "node:assert/strict";
import type { Container } from "pixi.js";
import { IconNode } from "../pixi/nodes/IconNode.js";
import type { DesktopLayer } from "../pixi/scene/DesktopLayer.js";

/** Diagnostic-only probe, installed and restored by the isolated benchmark. */
export function measureNativeCreationNodes(stage:Container,active:()=>boolean){
  let states=0;
  const setState=IconNode.prototype.setState;
  IconNode.prototype.setState=function(...args:Parameters<typeof setState>){if(active())states++;return setState.apply(this,args);};
  return {
    count:()=>states,
    assertSettled:(folderId:string)=>{
      const layer=stage.getChildByLabel("launchpad-native-desktop",true) as DesktopLayer;
      const node=layer.findIconNodeByItemId(folderId)!;
      assert.ok(node?.visible&&node.renderable&&!node.state?.ghosted,"completed folder must be visible");
      assert.equal(node.__groupTransferSuppressedFolderPreviewChildIds?.length??0,0,"all thumbnail ownership must return");
      const expected=node.item?.type==="folder"?Math.min(9,node.item.childPages?.[0]?.filter(Boolean).length??0):0;
      assert.equal(node.folderChildNodes.filter(child=>child.visible&&child.renderable).length,expected,"created folder must render its real preview children");
      assert.ok(!layer.groupDragLayer!.nodes.some(actor=>actor.visible),"no release actors may remain visible");
    },
    dispose:()=>{IconNode.prototype.setState=setState;},
  };
}
