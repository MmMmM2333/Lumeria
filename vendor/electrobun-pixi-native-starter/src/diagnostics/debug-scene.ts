import { Container, Graphics, Sprite, Text } from "pixi.js";

export type DebugSelector={id?:string;label?:string};
export class DebugScene {
  readonly #ids=new WeakMap<Container,string>();
  #next=0;
  constructor(readonly root:Container){}
  id(node:Container){let id=this.#ids.get(node);if(!id){id=`node-${++this.#next}`;this.#ids.set(node,id);}return id;}
  nodes(limit=20000){const result:Container[]=[],pending=[this.root];while(pending.length&&result.length<limit){const node=pending.pop()!;result.push(node);for(let i=node.children.length-1;i>=0;i--)pending.push(node.children[i]!);}return result;}
  resolve(selector:DebugSelector):Container{
    if(Boolean(selector.id)===Boolean(selector.label))throw new Error("Specify exactly one node id or label");
    const matches=this.nodes().filter(node=>selector.id?this.id(node)===selector.id:node.label===selector.label);
    if(matches.length!==1)throw new Error(matches.length?`Ambiguous label: ${matches.length} nodes; select a node id`:"Node no longer exists");
    return matches[0]!;
  }
  inspect(node:Container){
    const reasons:string[]=[],ancestors:{id:string;label:string;alpha:number;visible:boolean;renderable:boolean}[]=[];
    let effectiveAlpha=1;
    for(let current:Container|null=node;current;current=current.parent){
      effectiveAlpha*=current.alpha;
      if(!current.visible)reasons.push(`${this.id(current)} is hidden`);
      if(!current.renderable)reasons.push(`${this.id(current)} is not renderable`);
      if(current.alpha===0)reasons.push(`${this.id(current)} has zero alpha`);
      ancestors.push({id:this.id(current),label:current.label,alpha:current.alpha,visible:current.visible,renderable:current.renderable});
    }
    const bounds=node.getBounds(),local=node.getLocalBounds();
    const rect=(b:{x:number;y:number;width:number;height:number})=>({x:b.x,y:b.y,width:b.width,height:b.height});
    const texture=node instanceof Sprite?node.texture:null;
    return {id:this.id(node),label:node.label,type:node.constructor.name,parentId:node.parent?this.id(node.parent):null,
      visible:node.visible,renderable:node.renderable,alpha:node.alpha,effectiveAlpha,visibilityReasons:reasons,
      visibilityLimit:"Mask coverage, transparent texels and occlusion require pixel inspection",ancestors,
      bounds:rect(bounds),localBounds:rect(local),position:{x:node.x,y:node.y},scale:{x:node.scale.x,y:node.scale.y},rotation:node.rotation,
      worldTransform:{a:node.worldTransform.a,b:node.worldTransform.b,c:node.worldTransform.c,d:node.worldTransform.d,tx:node.worldTransform.tx,ty:node.worldTransform.ty},
      eventMode:node.eventMode,interactiveChildren:node.interactiveChildren,hitArea:node.hitArea?{type:node.hitArea.constructor.name,...rect(node.hitArea as unknown as Parameters<typeof rect>[0])}:null,
      mask:node.mask instanceof Container?this.id(node.mask):node.mask?"configured":null,
      filters:node.filters?.map(filter=>({type:filter.constructor.name,enabled:filter.enabled,padding:filter.padding,resolution:filter.resolution,blendRequired:filter.blendRequired}))??[],
      text:node instanceof Text?{value:node.text,fontFamily:node.style.fontFamily,fontSize:node.style.fontSize,fontWeight:node.style.fontWeight,lineHeight:node.style.lineHeight,wordWrap:node.style.wordWrap,wordWrapWidth:node.style.wordWrapWidth,resolution:node.resolution,actualFallbackFont:"unavailable"}:null,
      texture:texture?{uid:texture.uid,sourceUid:texture.source.uid,width:texture.width,height:texture.height,pixelWidth:texture.source.pixelWidth,pixelHeight:texture.source.pixelHeight,resolution:texture.source.resolution,format:texture.source.format,destroyed:texture.destroyed,sourceDestroyed:texture.source.destroyed}:null,
      graphics:node instanceof Graphics?{instructions:node.context.instructions.length}:null};
  }
  tree(depth=4,limit=200,selector?:DebugSelector){
    const root=selector?this.resolve(selector):this.root;let count=0,truncated=false;
    const visit=(node:Container,remaining:number):unknown=>{
      if(count>=limit){truncated=true;return null;}count++;
      return {id:this.id(node),label:node.label,type:node.constructor.name,visible:node.visible,alpha:node.alpha,
        children:remaining?node.children.map(child=>visit(child,remaining-1)).filter(Boolean):[],childCount:node.children.length};
    };
    const tree=visit(root,depth);return {root:tree,count,truncated};
  }
}
