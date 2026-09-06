import { Container, Graphics, Text } from "pixi.js";
import { NativeSingleLineText } from "./NativeSingleLineText.js";

type Geometry={x:number;y:number;sx:number;sy:number;bounds?:{x:number;y:number;width:number;height:number};wrap?:number;availableWidth?:number};
export type SettingsGeometry=ReadonlyMap<string,Geometry>;

function visit(root:Container,read:(node:Container,key:string)=>void,path="root"):void{
  read(root,path);
  const occurrences=new Map<string,number>();
  for(const child of root.children){
    const name=child.label||child.constructor.name,index=occurrences.get(name)??0;occurrences.set(name,index+1);
    visit(child,read,`${path}/${name}:${index}`);
  }
}

/** Capture presented geometry before rebuilding a settings page for its target width. */
export function captureSettingsGeometry(root:Container):SettingsGeometry{
  const snapshot=new Map<string,Geometry>();
  visit(root,(node,key)=>{
    const value:Geometry={x:node.x,y:node.y,sx:node.scale.x,sy:node.scale.y};
    if(node instanceof Graphics){const b=node.getLocalBounds();value.bounds={x:b.x,y:b.y,width:b.width,height:b.height};}
    if(node instanceof Text&&node.style.wordWrap)value.wrap=node.style.wordWrapWidth;
    if(node instanceof NativeSingleLineText)value.availableWidth=node.availableWidth;
    snapshot.set(key,value);
  });
  return snapshot;
}

/** FLIP geometry only: text keeps its font size and scale, and wraps at the current width. */
export function createSettingsTransition(root:Container,previous:SettingsGeometry):{update(progress:number):void}{
  const frames:{node:Container;from:Geometry;to:Geometry}[]=[];
  const target=captureSettingsGeometry(root);
  visit(root,(node,key)=>{
    const from=previous.get(key),to=target.get(key);if(from&&to)frames.push({node,from,to});
  });
  const mix=(a:number,b:number,p:number)=>a+(b-a)*p;
  return {update(progress){
    const p=Math.max(0,Math.min(1,progress));
    for(const {node,from,to} of frames){
      if(node.destroyed)continue;
      node.position.set(mix(from.x,to.x,p),mix(from.y,to.y,p));
      if(node instanceof Graphics&&from.bounds&&to.bounds){
        const a=from.bounds,b=to.bounds;
        const sx=b.width>0?mix(a.width*from.sx,b.width*to.sx,p)/b.width:to.sx;
        const sy=b.height>0?mix(a.height*from.sy,b.height*to.sy,p)/b.height:to.sy;
        node.scale.set(sx,sy);
        node.x+=mix(a.x*from.sx,b.x*to.sx,p)-b.x*sx;
        node.y+=mix(a.y*from.sy,b.y*to.sy,p)-b.y*sy;
      }else{
        node.scale.set(mix(from.sx,to.sx,p),mix(from.sy,to.sy,p));
      }
      if(node instanceof Text&&from.wrap!==undefined&&to.wrap!==undefined)node.style.wordWrapWidth=mix(from.wrap,to.wrap,p);
      if(node instanceof NativeSingleLineText&&from.availableWidth!==undefined&&to.availableWidth!==undefined)node.setAvailableWidth(mix(from.availableWidth,to.availableWidth,p));
    }
  }};
}
