import {compareImportNames} from "../domain/importNameOrder.js";
import assert from "node:assert/strict";
import {createAppImportSession} from "../application/appImportSession.js";
import {emptyAppImportState,copyAppImportState} from "../domain/appImportState.js";
import type {LaunchpadPages} from "../domain/launchpadLayout.js";
import type {ScannedCatalogApp} from "../domain/applicationCatalog.js";
let pages:LaunchpadPages=[[]],state=emptyAppImportState(),hidden:string[]=[],counter=0;
const make=(id:string):ScannedCatalogApp=>({id,name:id,type:"app",trackingKey:id,identityStatus:"exact",launchTarget:{kind:"executable",path:`C:/${id}.exe`},sources:[{key:id,type:"startMenuUser",state:"primary",rootId:"user",rootLabel:"User",relativePath:`Suite/${id}.lnk`,absolutePath:`C:/Suite/${id}.lnk`}]});
const session=createAppImportSession({state:()=>state,write:s=>{state=s;},pages:()=>pages,commit:p=>{pages=p;},clone:p=>JSON.parse(JSON.stringify(p)),pageSize:()=>4,folderSize:()=>2,makeId:()=>`folder-${++counter}`,hidden:()=>hidden,hide:ids=>{hidden=ids;},allow:()=>{},sources:()=>[{id:"user",type:"startMenuUser",enabled:true}],normalize:a=>({...a,sources:a.sources.map(source=>({...source})),origin:"catalog"}),changed:()=>{},t:key=>key});
session.setCatalog([make("a"),make("b")]);session.open("initial",["a","b"]);session.apply();session.finish();
assert.equal(pages[0]![0]!.type,"folder");assert.equal(state.bindings.length,1);assert.equal(copyAppImportState(state).completed,true);
pages[0]![0]!.name="Renamed";session.setCatalog([make("a"),make("b"),make("c")]);session.appendAutomatic();
assert.deepEqual(state.recentIds,["c"]);session.open("recent",[]);assert.equal(session.rows[0]!.name,"Renamed");session.apply();session.finish();
assert.equal(pages[0]!.length,1);assert.equal(state.recentIds.length,0);assert.ok(session.canUndo);session.undo();assert.deepEqual(state.recentIds,["c"]);
session.setCatalog([make("a"),make("b"),make("c"),make("d"),make("e")]);session.open("manual",["d"],["d","e"]);session.choose(session.rows[0]!.key,"desktop");session.apply();session.apply();session.finish();assert.ok(state.deferredIds.includes("e"));
session.appendAutomatic();assert.ok(!pages.flat().some(i=>i.id==="e"));
session.open("recent",[]);pages[0]![0]!.name="Changed during preview";assert.throws(()=>session.apply(),/imports.changed/);assert.equal(session.rows[0]!.name,"Changed during preview");session.finish();
const before=JSON.parse(JSON.stringify(pages)) as LaunchpadPages;pages=pages.map(page=>page.filter(i=>i.type!=="folder"));session.observe(before,pages);assert.equal(state.bindings.length,0);assert.equal(state.dismissedGroups.length,1);
console.log("Native import session: grouped layout, provenance, automatic append, undo, deferral, idempotent retry and stale-preview validation passed");

pages=[[]];state=emptyAppImportState();hidden=[];
const baseLoose=make("z-root"),loose:ScannedCatalogApp={...baseLoose,sources:[{...baseLoose.sources[0]!,relativePath:"z-root.lnk"}]};
session.setCatalog([make("b"),loose,make("a")]);session.open("initial",["a","b","z-root"]);session.apply();session.finish();
assert.deepEqual(pages.flat().map(item=>item.type),["app","folder"],"initial apps precede folders");
const sortedFolder=pages.flat()[1]!;assert.ok(sortedFolder.type==="folder");assert.deepEqual(sortedFolder.childPages.flat().map(app=>app!.name),["a","b"]);

assert.deepEqual(["中文","Tool 10","apple","2 Tools","北京","Tool 2","#Other"].sort(compareImportNames),["2 Tools","apple","Tool 2","Tool 10","北京","中文","#Other"]);
