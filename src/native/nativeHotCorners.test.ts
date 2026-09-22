import assert from "node:assert/strict";
import { createNativeHotCorners, type HotCornerBackend } from "./nativeHotCorners.js";
import { DEFAULT_HOT_CORNERS, readHotCornerSettings, assertHotCornerSettings } from "../domain/hotCorners.js";
import { assertLayoutDocument } from "../domain/layoutDocument.js";
import { readFileSync } from "node:fs";
let callback:Parameters<HotCornerBackend["start"]>[6]=()=>{},generation=0,stops=0;
const events:unknown[]=[];
const service=createNativeHotCorners({start(_mask,_delay,_modifier,_pause,_seams,g,cb){generation=g;callback=cb;},stop(){stops++;}},event=>events.push(event),error=>{throw error;});
service.apply({...DEFAULT_HOT_CORNERS,enabled:true,toggle:true});
callback(generation,0,0,1,123,1);callback(generation,0,0,1,123,1);await Promise.resolve();assert.equal(events.length,1);assert.equal((events[0] as {toggle:boolean}).toggle,true);
const old=callback,oldGeneration=generation;
service.apply({...DEFAULT_HOT_CORNERS,enabled:true});old(oldGeneration,0,0,1,123,1);await Promise.resolve();assert.equal(events.length,1);
callback(generation,0,0,1,123,1);service.apply(DEFAULT_HOT_CORNERS);await Promise.resolve();assert.equal(events.length,1);
service.dispose();assert.throws(()=>service.apply(DEFAULT_HOT_CORNERS));assert.ok(stops>=4);
const original=JSON.parse(readFileSync(new URL("../domain/fixtures/layout-v2-roundtrip.json",import.meta.url),"utf8"));assertLayoutDocument(original);
const legacy=structuredClone(original);delete legacy.settings.hotCorners;assertLayoutDocument(legacy);
for(const config of [DEFAULT_HOT_CORNERS,{...DEFAULT_HOT_CORNERS,enabled:true,toggle:true,corners:15}])assertLayoutDocument({...original,settings:{...original.settings,hotCorners:config}});
for(const config of [{...DEFAULT_HOT_CORNERS,enabled:true,corners:0},{...DEFAULT_HOT_CORNERS,corners:16},{...DEFAULT_HOT_CORNERS,delayMs:10001},{...DEFAULT_HOT_CORNERS,modifier:"meta"},{...DEFAULT_HOT_CORNERS,extra:true}]){
 assert.throws(()=>assertHotCornerSettings(config));assert.throws(()=>assertLayoutDocument({...original,settings:{...original.settings,hotCorners:config}}));
}
console.log("Hot corner configuration, legacy layouts, event generations and disposal passed");

assert.throws(()=>assertHotCornerSettings({...DEFAULT_HOT_CORNERS,allowSeams:1}));

const older={...DEFAULT_HOT_CORNERS};delete older.allowSeams;assert.equal(readHotCornerSettings(older).allowSeams,false);
assert.equal(readHotCornerSettings({...older,allowSeams:true}).allowSeams,true);

assert.equal(DEFAULT_HOT_CORNERS.enabled,false);
assert.equal(readHotCornerSettings(undefined).enabled,false);
assert.equal(readHotCornerSettings(undefined).delayMs,80);
assert.equal(readHotCornerSettings({...DEFAULT_HOT_CORNERS,delayMs:200}).delayMs,200);
for(const delayMs of [0,80,100,137,200,500,10000])assertHotCornerSettings({...DEFAULT_HOT_CORNERS,delayMs});
for(const delayMs of [-1,0.5,10001,NaN,Infinity,"100"])assert.throws(()=>assertHotCornerSettings({...DEFAULT_HOT_CORNERS,delayMs}));
