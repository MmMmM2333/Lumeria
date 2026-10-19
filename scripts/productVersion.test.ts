import assert from "node:assert/strict";
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync } from "node:fs";
import { dirname,join } from "node:path";
import { productVersion } from "./productVersion.js";

const crates=["lumeria-core","lumeria-hot-corners","lumeria-native-data","lumeria-live-desktop"] as const;

mkdirSync(".codex-dev",{recursive:true});
const root=mkdtempSync(join(process.cwd(),".codex-dev/product-version-"));
try{
  for(const file of ["package.json","package-lock.json","Cargo.toml","Cargo.lock",
    ...crates.map(name=>`crates/${name}/Cargo.toml`)]){
    mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),readFileSync(file));
  }
  const current=productVersion(root);
  const dependencyBlocks=(text:string)=>text.split("[[package]]").filter(block=>!/^\s*name = "lumeria-/u.test(block));
  const dependencies=dependencyBlocks(readFileSync(join(root,"Cargo.lock"),"utf8"));
  assert.equal(productVersion(root,"2.3.4"),"2.3.4");
  const cargoLockPath=join(root,"Cargo.lock"),updatedCargoLock=readFileSync(cargoLockPath,"utf8");
  for(const crate of crates){
    const block=updatedCargoLock.split("[[package]]").find(block=>block.includes(`name = "${crate}"`));
    assert.equal(block?.match(/^version = "([^"]+)"/m)?.[1],"2.3.4",`${crate} must be synchronized`);
  }
  assert.deepEqual(dependencyBlocks(updatedCargoLock),dependencies);
  writeFileSync(cargoLockPath,updatedCargoLock.replace(/(name = "lumeria-hot-corners"\r?\nversion = ")[^"]+/,(_all,prefix:string)=>prefix+"9.9.9"));
  assert.throws(()=>productVersion(root),/lumeria-hot-corners lock version differs/);
  assert.equal(productVersion(root,"2.3.4"),"2.3.4","synchronization repairs hot-corners drift");
  assert.equal(readFileSync(cargoLockPath,"utf8"),updatedCargoLock);
  assert.throws(()=>productVersion(root,"1.0.0-beta"));
  assert.throws(()=>productVersion(root,"65536.0.0"));
  assert.equal(productVersion(root),"2.3.4","invalid versions must leave files unchanged");
  const lockPath=join(root,"package-lock.json"),lock=JSON.parse(readFileSync(lockPath,"utf8"));
  lock.packages[""].version="9.9.9";writeFileSync(lockPath,JSON.stringify(lock));
  assert.throws(()=>productVersion(root),/versions differ/);
  assert.equal(productVersion(root,current),current,"synchronization repairs drift");
}finally{rmSync(root,{recursive:true,force:true});}
console.log("Product version synchronization tests passed");
