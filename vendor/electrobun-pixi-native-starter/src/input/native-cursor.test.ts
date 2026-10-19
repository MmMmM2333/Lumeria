import {expect,test} from "bun:test";
import {createNativeCursorPolicy} from "./native-cursor";

test("drag override holds the hand across default, text and resize hit targets",()=>{
  const applied:string[]=[],cursor=createNativeCursorPolicy(value=>applied.push(value));
  cursor.request("pointer");cursor.override("pointer");
  cursor.request("default");cursor.request("text");cursor.request("ew-resize");
  expect(applied).toEqual(["pointer"]);
  cursor.override(null);expect(applied).toEqual(["pointer","ew-resize"]);
  cursor.request("ew-resize");expect(applied.length).toBe(2);
});

test("release restores default even when the requested mode was cached during dragging",()=>{
  const applied:string[]=[],cursor=createNativeCursorPolicy(value=>applied.push(value));
  cursor.request("pointer");cursor.override("pointer");cursor.request(null);cursor.request(undefined);
  expect(applied).toEqual(["pointer"]);
  cursor.override(null);cursor.override(null);cursor.request("default");
  expect(applied).toEqual(["pointer","default"]);
  cursor.request("pointer");expect(applied).toEqual(["pointer","default","pointer"]);
});

test("a session can restore a text cursor without further pointer movement",()=>{
  const applied:string[]=[],cursor=createNativeCursorPolicy(value=>applied.push(value));
  cursor.request("text");cursor.override("pointer");cursor.override(null);
  expect(applied).toEqual(["text","pointer","text"]);
});
