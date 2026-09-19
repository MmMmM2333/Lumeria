import { describe, expect, test } from "bun:test";
import {
	createAccessibilityTree,
	createNativeAccessibilityBridge,
	nativeProviderAvailable,
} from "./native-accessibility";

describe("native accessibility semantic tree", () => {
	test("validates, diffs, navigates, scales, dispatches, and closes the semantic bridge", () => {
		const invoked: string[] = [];
		const feeds: string[][] = [];
		const tree = createAccessibilityTree();
		const unsubscribe = tree.subscribe((changes) => feeds.push(changes.map(({ type }) => type)));
		const first = tree.replaceTree([
			{ id: "root", parent: null, role: "group", name: "LaunchPad", bounds: { x: 0, y: 0, width: 100, height: 100 } },
			{
				id: "one", parent: "root", role: "button", name: "One", value: "old", focused: true,
				bounds: { x: 10, y: 10, width: 20, height: 20 }, invoke: () => { invoked.push("one"); },
			},
			{ id: "two", parent: "root", role: "button", name: "Two", bounds: { x: 40, y: 10, width: 20, height: 20 } },
		]);

		expect(nativeProviderAvailable).toBe(false);
		expect(first.map(({ type }) => type)).toEqual(["add", "add", "add", "focus"]);
		expect(tree.navigate("root", "firstChild")?.id).toBe("one");
		expect(tree.navigate("one", "next")?.id).toBe("two");
		expect(tree.navigate("two", "parent")?.id).toBe("root");
		expect(tree.hitTest(15, 15)?.id).toBe("one");
		expect(tree.physicalSnapshot(2)[1]?.bounds).toEqual({ x: 20, y: 20, width: 40, height: 40 });
		tree.dispatch("one", { type: "invoke" });
		expect(invoked).toEqual(["one"]);

		const second = tree.replaceTree([
			{ id: "root", parent: null, role: "group", name: "LaunchPad", bounds: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "two", parent: "root", role: "button", name: "Second", value: "new", focused: true, bounds: { x: 40, y: 10, width: 20, height: 20 } },
		]);
		expect(second.map(({ type }) => type)).toEqual(["remove", "update", "value", "focus"]);
		expect(feeds).toHaveLength(2);
		expect(() => tree.replaceTree([
			{ id: "a", parent: "b", role: "group", name: "A", bounds: { x: 0, y: 0, width: 1, height: 1 } },
			{ id: "b", parent: "a", role: "group", name: "B", bounds: { x: 0, y: 0, width: 1, height: 1 } },
		])).toThrow("cycle");
		unsubscribe();
		tree.destroy();
		expect(() => tree.dispatch("two", { type: "invoke" })).toThrow("destroyed");
	});

	test("encodes the A11Y ABI and routes native actions back to semantic nodes", async () => {
		const snapshots: Uint8Array[] = [];
		const actions: any[] = [];
		let detached = false;
		const store = createAccessibilityTree();
		const bridge = createNativeAccessibilityBridge({
			nativeHost: {
				uiaProviderAvailable: () => false,
				attachAccessibility: () => 1,
				updateAccessibilitySnapshot: (_window, snapshot) => { snapshots.push(snapshot.slice()); return 1; },
				pollAccessibilityAction: () => actions.shift() ?? null,
				detachAccessibility: () => { detached = true; return 1; },
			},
			windowHandle: 123,
			route: 9n,
			scale: 2,
			store,
		});
		let invoked = false;
		store.replaceTree([
			{ id: "root", parent: null, role: "group", name: "桌面", bounds: { x: 1, y: 2, width: 100, height: 50 } },
			{
				id: "app", parent: "root", role: "button", name: "应用", bounds: { x: 4, y: 5, width: 20, height: 10 },
				invoke: () => { invoked = true; },
			},
		]);
		const snapshot = snapshots.at(-1)!;
		const view = new DataView(snapshot.buffer, snapshot.byteOffset, snapshot.byteLength);
		expect(new TextDecoder().decode(snapshot.subarray(0, 4))).toBe("A11Y");
		expect(view.getUint32(8, true)).toBe(2);
		expect(view.getInt32(16 + 64 + 28, true)).toBe(8);
		expect(view.getInt32(16 + 64 + 36, true)).toBe(40);
		actions.push({ route: 9n, nodeId: view.getBigUint64(16 + 64, true), action: 1, code: 0, data: new Uint8Array() });
		expect(await bridge.pollActions()).toBe(1);
		expect(invoked).toBe(true);
		bridge.destroy();
		expect(detached).toBe(true);
	});
});
