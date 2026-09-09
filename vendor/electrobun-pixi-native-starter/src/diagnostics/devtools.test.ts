import { test,expect } from "bun:test";
import { Container, Graphics, Text } from "pixi.js";
import { mkdtemp,readFile,rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DebugScene } from "./debug-scene";
import { registerDebugInstance,discoverDebugInstances,publicInstance } from "./debug-registry";
import { installNativeSkia } from "../rendering/native-skia";

test("scene inspection identifies ancestor transparency and refuses ambiguous or retired nodes",()=>{
  installNativeSkia();const root=new Container(),parent=new Container({label:"parent",alpha:0}),child=new Graphics({label:"same"}).rect(0,0,32,32).fill(0xffffff);
  root.addChild(parent);parent.addChild(child);const duplicate=new Container({label:"same"});root.addChild(duplicate);
  const scene=new DebugScene(root),info=scene.inspect(child);
  expect(info.effectiveAlpha).toBe(0);expect(info.visibilityReasons.some(reason=>reason.includes("zero alpha"))).toBe(true);
  expect(()=>scene.resolve({label:"same"})).toThrow("Ambiguous");expect(scene.resolve({id:info.id})).toBe(child);
  child.removeFromParent();expect(()=>scene.resolve({id:info.id})).toThrow("no longer");child.destroy();root.destroy({children:true});
});
test("text diagnostics include actual raster density and tree truncation",()=>{
  installNativeSkia();const root=new Container(),text=new Text({text:"中",resolution:3,style:{fontSize:12,fontFamily:"Microsoft YaHei"}});root.addChild(text);
  const scene=new DebugScene(root);expect(scene.inspect(text).text?.resolution).toBe(3);
  expect(scene.tree(2,1).truncated).toBe(true);root.destroy({children:true});
});
test("independent registrations survive other instances stopping and filter stale servers",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"pixi-registry-test-"));
  const servers:Bun.Server<undefined>[]=[],stops:(()=>Promise<void>)[]=[];
  try{
    for(const id of ["instance-one","instance-two"]){
      const token=crypto.randomUUID();const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch:r=>r.headers.get("authorization")===`Bearer ${token}`?Response.json({instanceId:id}):new Response(null,{status:401})});servers.push(server);
      stops.push(await registerDebugInstance({protocol:1,instanceId:id,pid:process.pid,port:server.port!,token,name:id,build:"test",isolated:true,startedAt:new Date().toISOString()},directory));
    }
    expect((await discoverDebugInstances(directory)).length).toBe(2);await stops[0]!();
    const instances=await discoverDebugInstances(directory);expect(instances.map(i=>i.instanceId)).toEqual(["instance-two"]);
    expect("token" in publicInstance(instances[0]!)).toBe(false);
    expect(JSON.parse(await readFile(join(directory,"instance-two.json"),"utf8")).instanceId).toBe("instance-two");
    servers[1]!.stop(true);expect(await discoverDebugInstances(directory)).toEqual([]);
  }finally{for(const server of servers)server.stop(true);for(const stop of stops)await stop();await rm(directory,{recursive:true,force:true});}
});
