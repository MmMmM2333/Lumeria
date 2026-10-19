import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReleaseVersion } from "../src/platform/product.js";

const crates=["lumeria-core","lumeria-hot-corners","lumeria-native-data","lumeria-live-desktop"] as const;
const workspaceVersion=/(\[workspace\.package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;

/** Synchronize only first-party product versions; dependencies and protocols are independent. */
export function productVersion(root:string,next?:string):string{
  const read=(path:string)=>readFileSync(resolve(root,path),"utf8");
  const pkg=JSON.parse(read("package.json"));
  const lock=JSON.parse(read("package-lock.json"));
  const version=next??pkg.version;
  assertReleaseVersion(version);
  const cargo=read("Cargo.toml"),cargoLock=read("Cargo.lock");
  const workspace=cargo.match(workspaceVersion);
  if(!workspace)throw new Error("Missing Cargo workspace package version");
  for(const crate of crates){
    if(!/^version\.workspace\s*=\s*true\s*$/m.test(read(`crates/${crate}/Cargo.toml`)))throw new Error(`${crate} must inherit the workspace version`);
  }
  let updatedLock=cargoLock;
  for(const crate of crates){
    const pattern=new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${crate}"\\r?\\nversion = ")([^"]+)(")`);
    const match=cargoLock.match(pattern);
    if(!match)throw new Error(`Missing Cargo.lock package: ${crate}`);
    if(!next&&match[2]!==version)throw new Error(`${crate} lock version differs from package.json`);
    updatedLock=updatedLock.replace(pattern,(_all,prefix:string,_old:string,suffix:string)=>prefix+version+suffix);
  }
  if(!next){
    if(workspace[2]!==version||lock.version!==version||lock.packages?.[""]?.version!==version)throw new Error("Product versions differ between npm, Cargo and lock files");
    return version;
  }
  pkg.version=version;lock.version=version;lock.packages[""].version=version;
  const changes=new Map([
    ["package.json",JSON.stringify(pkg,null,2)+"\n"],
    ["package-lock.json",JSON.stringify(lock,null,2)+"\n"],
    ["Cargo.toml",cargo.replace(workspaceVersion,(_all,prefix:string,_old:string,suffix:string)=>prefix+version+suffix)],
    ["Cargo.lock",updatedLock],
  ]);
  const originals=new Map([...changes.keys()].map(path=>[path,read(path)]));
  try{for(const [path,content] of changes)writeFileSync(resolve(root,path),content);}
  catch(error){for(const [path,content] of originals)writeFileSync(resolve(root,path),content);throw error;}
  return productVersion(root);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length!==1)throw new Error("Use --check or a stable version such as 1.0.0");
  const version=productVersion(process.cwd(),args[0]==="--check"?undefined:args[0]);
  console.log(`Product version ${args[0]==="--check"?"verified":"updated"}: ${version}`);
}
