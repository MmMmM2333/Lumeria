import { BlurFilter, Container, Graphics } from "pixi.js";

/** Render the pixel/rgba shadows used by the existing Fluent and panel CSS. */
export function nativePanelShadow(width:number,height:number,shadow:string):Container{
  const node=new Container({eventMode:"none",label:"native-panel-shadow"});
  const filters:BlurFilter[]=[];
  const lengths="(-?\\d+(?:\\.\\d+)?)(?:px)?";
  const pattern=new RegExp(`${lengths}\\s+${lengths}\\s+${lengths}\\s+(rgba?\\([^)]*\\))`,"g");
  for(const match of shadow.matchAll(pattern)){
    const blur=Number(match[3]),shape=new Graphics({eventMode:"none"}).roundRect(0,0,width,height,8).fill(match[4]!);
    shape.position.set(Number(match[1]),Number(match[2]));
    if(blur>0){const filter=new BlurFilter({strength:blur/2,quality:4,resolution:1});filters.push(filter);shape.filters=[filter];}
    node.addChild(shape);
  }
  node.on("destroyed",()=>{for(const filter of filters){filter.blurXFilter.destroy();filter.blurYFilter.destroy();filter.destroy();}});
  return node;
}
