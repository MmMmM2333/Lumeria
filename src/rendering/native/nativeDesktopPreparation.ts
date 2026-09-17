import type { IconTextureItem } from "../pixi/assets/iconTextureRepository.js";
import { getNativeIconTextureSource } from "./nativeIconTextureSource.js";

/** Desktop image work only. All descendants remain owned by the layout repository,
 * but unopened folder contents must not enter the speculative decode queue. */
type DesktopItem=IconTextureItem&{readonly type?:string;readonly childPages?:unknown};
export function collectDesktopPreparationItems(pages:readonly (readonly (DesktopItem|null|undefined)[])[],folderPageSize=9):IconTextureItem[]{
  const result:IconTextureItem[]=[],sources=new Set<string>();
  const append=(item:DesktopItem|null|undefined)=>{
    if(!item||item.type==="folder")return;
    const source=getNativeIconTextureSource(item);
    if(!source||sources.has(source))return;
    sources.add(source);result.push(item);
  };
  for(const page of pages)for(const item of page){
    if(item?.type==="folder"){
      const first=Array.isArray(item.childPages)?item.childPages[0]:null;
      if(Array.isArray(first))for(const child of first.filter(Boolean).slice(0,Math.min(9,Math.max(1,folderPageSize))))append(child as DesktopItem);
    }
    else append(item);
  }
  return result;
}
