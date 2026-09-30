import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, relative, isAbsolute, dirname } from "node:path";
import { createHash } from "node:crypto";

// Read-only audit. It deliberately offers no delete switch.
const directory=resolve(process.argv[2]??join(process.env.APPDATA!,"com.lumeria.app"));
const output=resolve(process.argv[3]??"artifacts/icon-cache-audit.json"),iconDirectory=join(directory,"icons");
const protectedPaths=new Set<string>();
function inspect(value:unknown):void {
  if(!value||typeof value!=="object")return;
  for(const [key,child] of Object.entries(value)) {
    if(["iconPath","customIconPath"].includes(key)&&typeof child==="string")protectedPaths.add(resolve(child).toLowerCase());
    else inspect(child);
  }
}
// If a backup cannot be read, no cleanup candidate can be declared safe.
const errors:string[]=[];
for(const name of readdirSync(directory).filter(name=>name==="layout.json"||name==="catalog-cache.json"||/^layout\.backup\..+\.json$/.test(name))) {
  try{inspect(JSON.parse(readFileSync(join(directory,name),"utf8")));}catch{errors.push(`Unreadable reference document: ${name}`);}
}
const files=readdirSync(iconDirectory,{withFileTypes:true}).filter(entry=>entry.isFile()&&entry.name.endsWith(".png"));
const contents=new Map<string,number>();let totalBytes=0,referenced=0,recent=0,duplicateBytes=0;
const candidates:{name:string;bytes:number}[]=[];
const sessionPresent=existsSync(join(directory,".native-session.json"));
for(const file of files){
  const path=join(iconDirectory,file.name),inside=relative(iconDirectory,path);
  if(inside.startsWith("..")||isAbsolute(inside))throw new Error("Icon path escaped cache directory");
  const stat=statSync(path),bytes=readFileSync(path),hash=createHash("sha256").update(bytes).digest("hex");
  totalBytes+=stat.size;if(contents.has(hash))duplicateBytes+=stat.size;contents.set(hash,(contents.get(hash)??0)+1);
  if(protectedPaths.has(path.toLowerCase()))referenced++;
  else if(Date.now()-stat.mtimeMs<7*24*60*60*1000)recent++;
  else candidates.push({name:file.name,bytes:stat.size});
}
mkdirSync(dirname(output),{recursive:true});
const report={readOnly:true,pngFiles:files.length,totalBytes,referenced,recentlyRetained:recent,distinctContents:contents.size,duplicateBytes,
  sessionPresent,referenceErrors:errors,candidates,candidateBytes:candidates.reduce((sum,file)=>sum+file.bytes,0),
  deletionRequiresReview:true,liveResourceInspectionRequired:sessionPresent};
writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,candidates:report.candidates.length,output},null,2));
