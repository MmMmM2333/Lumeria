import { expect, test } from "bun:test";
import { attachNativePixiEvents, normalizeNativeWheel } from "./native-events";

test("hidden recovery preserves native focus and delivers the first activation", () => {
  const input=attachNativePixiEvents({id:1,wgpuViewId:1,on:()=>()=>{}} as any,
    {events:{rootBoundary:{mappingState:{trackingData:{}}}}} as any,
    {pollEvent:()=>null,initialFocused:false});
  const focus:boolean[]=[];
  input.onFocusChange(value=>focus.push(value));
  expect(input.focused).toBe(false);
  input.emitFocus(true); input.emitFocus(true);
  expect(input.focused).toBe(true);
  expect(focus).toEqual([true]);
  input.destroy();
});

test("native wheel exposes browser-compatible pixel deltas without losing precision", () => {
	expect(normalizeNativeWheel(0, 120)).toEqual({ deltaX: 0, deltaY: -100, deltaMode: 0 });
	expect(normalizeNativeWheel(0, -120)).toEqual({ deltaX: 0, deltaY: 100, deltaMode: 0 });
	expect(normalizeNativeWheel(120, 0)).toEqual({ deltaX: 100, deltaY: 0, deltaMode: 0 });
	expect(normalizeNativeWheel(-120, 0)).toEqual({ deltaX: -100, deltaY: 0, deltaMode: 0 });
	expect(Array.from({ length: 4 }, () => normalizeNativeWheel(30, 0).deltaX)
		.reduce((sum, delta) => sum + delta, 0)).toBe(100);
});

test("touchpad pixels and explicit phases bypass notch normalization without contaminating mouse wheel",()=>{
  const pending:any[]=[],delivered:any[]=[];
  const input=attachNativePixiEvents({id:1,wgpuViewId:1,on:()=>()=>{}} as any,{events:{onWheel:(e:any)=>delivered.push(e),rootBoundary:{mappingState:{trackingData:{}}}}} as any,{pollEvent:()=>pending.shift()??null});
  for(const phase of ["begin","update","inertia","end","cancel"]){
    pending.push({kind:9,route:1n,timestamp:BigInt(100+pending.length*16),x:10,y:20,wheelX:12.5,wheelY:-4.25,modifiers:0,touchpad:{source:"touchpad",phase,sequence:1}});
  }
  pending.push({kind:9,route:1n,timestamp:200n,x:10,y:20,wheelX:0,wheelY:120,modifiers:0});input.poll();
  expect(delivered.length).toBe(6);expect(delivered[1]).toMatchObject({deltaX:12.5,deltaY:-4.25,nativeTouchpad:{phase:"update"},momentum:false});
  expect(delivered[2].momentum).toBe(true);expect(delivered[5]).toMatchObject({deltaX:0,deltaY:-100});expect(delivered[5].nativeTouchpad).toBeUndefined();input.destroy();
});

test("public key wheel and focus replay uses host normalization and resets repeat on blur", () => {
  const wheels:any[]=[];
  const events={rootBoundary:{mappingState:{trackingData:{}}},onWheel:(event:any)=>wheels.push(event)};
  const input=attachNativePixiEvents(
    {id:1,wgpuViewId:1,on:()=>()=>{}} as any,{events} as any,
    {pollEvent:()=>null},
  );
  const keys:any[]=[],focus:boolean[]=[];
  input.onKey(event=>keys.push(event));input.onFocusChange(value=>focus.push(value));
  input.emitFocus(true);
  input.emitKey("down",{keyCode:0x41,modifiers:3});
  input.emitKey("down",{keyCode:0x41,modifiers:3});
  expect(keys[0]).toMatchObject({key:"A",code:"KeyA",ctrlKey:true,shiftKey:true,repeat:false});
  expect(keys[1].repeat).toBe(true);
  input.emitFocus(false);input.emitFocus(true);
  input.emitKey("down",{keyCode:0x41});
  expect(keys[2].repeat).toBe(false);
  input.emitWheel(10,20,0,100,0);
  expect(wheels[0]).toMatchObject({clientX:10,clientY:20,deltaY:100,deltaMode:0});
  expect(focus.slice(-2)).toEqual([false,true]);
  input.destroy();
});

test("two native touch contacts keep independent pointer data and implicit capture", () => {
	const pending: any[] = [];
	const delivered: any[] = [];
	const trackingData: Record<number, any> = {};
	const tracking = (pointerId: number) => trackingData[pointerId] ??= { pressTargetsByButton: {} };
	const events = {
		rootBoundary: {
			mappingState: { trackingData },
			trackingData: tracking,
		},
		_onPointerDown(event: any) {
			tracking(event.pointerId).pressTargetsByButton[0] = [{ label: `touch-${event.pointerId}` }];
			delivered.push(event);
		},
		_onPointerMove: (event: any) => delivered.push(event),
		_onPointerUp: (event: any) => delivered.push(event),
		_onPointerOverOut: (event: any) => delivered.push(event),
	};
	const captureCalls: boolean[] = [];
	const input = attachNativePixiEvents(
		{ id: 1, wgpuViewId: 1, on: () => () => {} } as any,
		{ events } as any,
		{
			pollEvent: () => pending.shift() ?? null,
			setPointerCapture: (captured) => { captureCalls.push(captured); return true; },
		},
	);
	const touch = (kind: number, pointerId: number, overrides: Record<string, unknown> = {}) => ({
		route: 1n, timestamp: 100n + BigInt(delivered.length), kind, modifiers: 0,
		x: pointerId, y: pointerId + 1, movementX: 0, movementY: 0,
		button: kind === 1 ? -1 : 0, buttons: kind === 3 || kind === 6 ? 0 : 1,
		wheelX: 0, wheelY: 0, deltaMode: 0, keyCode: 0, scanCode: 0,
		repeat: false, detail: 0, pointerId, screenX: pointerId, screenY: pointerId + 1,
		pointerType: "touch", isPrimary: pointerId === 31, width: 12, height: 18, pressure: 0.4,
		...overrides,
	});

	pending.push(touch(2, 31), touch(2, 44, { pressure: 0.7 }));
	input.poll();
	expect(input.hasPointerCapture(31)).toBe(true);
	expect(input.hasPointerCapture(44)).toBe(true);
	expect(captureCalls).toEqual([]);
	expect(delivered.filter(({ type }) => type === "pointerdown").map((event) => ({
		pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
		width: event.width, height: event.height, pressure: event.pressure, buttons: event.buttons,
	}))).toEqual([
		{ pointerId: 31, pointerType: "touch", isPrimary: true, width: 12, height: 18, pressure: 0.4, buttons: 1 },
		{ pointerId: 44, pointerType: "touch", isPrimary: false, width: 12, height: 18, pressure: 0.7, buttons: 1 },
	]);

	pending.push(touch(3, 31, { pressure: 0 }));
	input.poll();
	expect(input.hasPointerCapture(31)).toBe(false);
	expect(input.hasPointerCapture(44)).toBe(true);

	pending.push(touch(1, 44, { x: 50, y: 60, movementX: 6, movementY: 15 }));
	input.poll();
	const move = delivered.findLast(({ type }) => type === "pointermove");
	expect({ pointerId: move.pointerId, button: move.button, buttons: move.buttons, movementX: move.movementX, movementY: move.movementY })
		.toEqual({ pointerId: 44, button: -1, buttons: 1, movementX: 6, movementY: 15 });

	pending.push(touch(6, 44, { buttons: 0, pressure: 0 }));
	input.poll();
	expect(delivered.slice(-3).map(({ type, pointerId }) => [type, pointerId])).toEqual([
		["pointercancel", 44], ["pointerout", 44], ["lostpointercapture", 44],
	]);

	pending.push(touch(2, 51, { pointerType: "mouse", modifiers: 32 }));input.poll();
	expect(delivered.findLast(event => event.type === "pointerdown")).toMatchObject({ activatesWindow: true, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false });
	pending.push(touch(3, 51, { pointerType: "mouse", modifiers: 0, buttons: 0 }));input.poll();
	expect(delivered.findLast(event => event.type === "pointerup").activatesWindow).toBe(false);
	pending.push(touch(2, 51, { pointerType: "mouse", modifiers: 0 }));input.poll();
	expect(delivered.findLast(event => event.type === "pointerdown").activatesWindow).toBe(false);
	pending.push(touch(3, 51, { pointerType: "mouse", modifiers: 0, buttons: 0 }));input.poll();

	input.destroy();
});
