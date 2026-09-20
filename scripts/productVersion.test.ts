import assert from "node:assert/strict";
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync } from "node:fs";
import { dirname,join } from "node:path";
import { productVersion } from "./productVersion.js";

mkdirSync(".codex-dev",{recursive:true});
const root=mkdtempSync(join(process.cwd(),".codex-dev/product-version-"));
try{
  for(const file of ["package.json","package-lock.json","Cargo.toml","Cargo.lock",
    ...["lumeria-core","lumeria-native-data","lumeria-live-desktop"].map(name=>`crates/${name}/Cargo.toml`)]){
    mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),readFileSync(file));
  }
  const current=productVersion(root);
  const dependencyBlocks=(text:string)=>text.split("[[package]]").filter(block=>!/^\s*name = "lumeria-/u.test(block));
  const dependencies=dependencyBlocks(readFileSync(join(root,"Cargo.lock"),"utf8"));
  assert.equal(productVersion(root,"2.3.4"),"2.3.4");
  assert.deepEqual(dependencyBlocks(readFileSync(join(root,"Cargo.lock"),"utf8")),dependencies);
  assert.throws(()=>productVersion(root,"1.0.0-beta"));
  assert.throws(()=>productVersion(root,"65536.0.0"));
  assert.equal(productVersion(root),"2.3.4","invalid versions must leave files unchanged");
  const lockPath=join(root,"package-lock.json"),lock=JSON.parse(readFileSync(lockPath,"utf8"));
  lock.packages[""].version="9.9.9";writeFileSync(lockPath,JSON.stringify(lock));
  assert.throws(()=>productVersion(root),/versions differ/);
  assert.equal(productVersion(root,current),current,"synchronization repairs drift");
}finally{rmSync(root,{recursive:true,force:true});}
console.log("Product version synchronization tests passed");
