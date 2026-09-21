import type {ScannedCatalogApp,CatalogSource} from "../../../src/domain/applicationCatalog.js";
import type {ImportSourcePolicy} from "../../../src/domain/appImportPlan.js";

export type LabSource={-readonly [K in keyof ImportSourcePolicy]:ImportSourcePolicy[K]} & {name:string;path:string;};
export const defaultSources=():LabSource[]=>[
  {id:"user",name:"用户开始菜单",path:"%APPDATA% / Programs",enabled:true,grouped:true,keepSingle:false},
  {id:"system",name:"系统开始菜单",path:"%ProgramData% / Programs",enabled:true,grouped:true,keepSingle:false},
  {id:"windows",name:"Windows 应用",path:"shell:AppsFolder",enabled:true,grouped:false,keepSingle:false},
  {id:"custom",name:"自定义工具目录",path:"D: / Tools",enabled:false,grouped:false,keepSingle:false},
];
const source=(rootId:string,relativePath:string,state:CatalogSource["state"]="primary"):CatalogSource=>({
  key:`${rootId}:${relativePath}`,rootId,relativePath,state,rootLabel:rootId,absolutePath:`fixture://${rootId}/${relativePath}`,
  type:rootId==="user"?"startMenuUser":rootId==="system"?"startMenuSystem":rootId==="windows"?"windowsAppCatalog":"customDirectory",
});
const app=(id:string,name:string,root:string,path:string,extra:CatalogSource[]=[]):ScannedCatalogApp=>({
  id,name,type:"app",trackingKey:`fixture:${id}`,identityStatus:"exact",launchTarget:{kind:"executable",path:`fixture://${id}`},sources:[source(root,path),...extra],
});
export const initialApps:readonly ScannedCatalogApp[]=[
  app("suite-a","应用 A","system","示例应用组/应用 A.lnk"),
  app("suite-b","应用 B","system","示例应用组/应用 B.lnk"),
  app("suite-c","应用 C","system","示例应用组/Tools/应用 C.lnk"),
  app("suite-d","应用 D","system","示例应用组/应用 D.lnk"),
  app("tools","工具 A","user","工具合集/工具 A.lnk",[source("system","工具合集/工具 A.lnk","equivalent")]),
  app("tool-b","工具 B","system","工具合集/工具 B.lnk"),
  app("tool-c","工具 C","user","工具合集/Player.lnk"),
  app("pot","示例播放器","user","示例播放器/示例播放器.lnk"),
  app("terminal","终端","windows","终端"),
  app("notepad","记事本","windows","Notepad"),
  app("code","编辑器","user","编辑器.lnk"),
  app("custom-tool","日志工具","custom","工具合集/Logs.lnk"),
];
export const installBatches={
  extras:{label:"安装附加应用组",description:"新增 3 个入口，测试后续分组",apps:[app("py","附加应用组","system","附加应用组/附加应用 A.lnk"),app("idle","附加应用 B","system","附加应用组/附加应用 B.lnk"),app("py-doc","附加应用 C","system","附加应用组/Docs.lnk")]},
  tools:{label:"工具合集 新工具",description:"已有文件夹新增成员，测试整理建议",apps:[app("tool-d","工具 D","system","工具合集/Config.lnk")]},
  pot:{label:"示例播放器 新工具",description:"单应用变多应用，旧图标不自动搬动",apps:[app("player-settings","播放器设置","user","示例播放器/Config.lnk")]},
} satisfies Record<string,{label:string;description:string;apps:ScannedCatalogApp[]}>;
export const filteredEntries=[{name:"Uninstall 示例播放器",reason:"命中 uninstall 关键词"},{name:"工具 A（系统副本）",reason:"同一应用合并为一个入口，保留来源信息"}];
export function catalogFor(installed:readonly string[]):ScannedCatalogApp[]{return [...initialApps,...Object.entries(installBatches).filter(([id])=>installed.includes(id)).flatMap(([,batch])=>batch.apps)];}
