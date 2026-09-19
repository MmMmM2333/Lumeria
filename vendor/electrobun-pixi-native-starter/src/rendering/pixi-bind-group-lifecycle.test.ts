import { expect, test } from "bun:test";
import { getTextureBatchBindGroup } from "pixi.js";

class FakeResource {
	destroyed = false;
	readonly _resourceId: number;
	readonly _resourceType: string;
	private listeners: Array<{ callback: (resource: FakeResource) => void; context: unknown }> = [];

	constructor(type: string, id: number) {
		this._resourceType = type;
		this._resourceId = id;
	}

	on(event: string, callback: (resource: FakeResource) => void, context: unknown) {
		if (event === "change") this.listeners.push({ callback, context });
	}

	off(event: string, callback: (resource: FakeResource) => void, context: unknown) {
		if (event === "change") {
			this.listeners = this.listeners.filter((listener) => listener.callback !== callback || listener.context !== context);
		}
	}

	destroy() {
		this.destroyed = true;
		for (const listener of [...this.listeners]) listener.callback.call(listener.context, this);
	}
}

test("destroyed batch textures leave no warning or cached BindGroup", () => {
	const source = new FakeResource("textureSource", 1);
	const style = new FakeResource("textureSampler", 2);
	const texture = { uid: 0x5eed, source, style };
	const warnings: unknown[][] = [];
	const originalWarn = console.warn;
	console.warn = (...args) => warnings.push(args);
	try {
		const first = getTextureBatchBindGroup([texture] as never, 1, 1);
		source.destroy();
		expect(warnings).toEqual([]);
		expect(first.resources).toBeNull();
		const second = getTextureBatchBindGroup([texture] as never, 1, 1);
		expect(second).not.toBe(first);
		second.destroy();
		const third = getTextureBatchBindGroup([texture] as never, 1, 1);
		expect(third).not.toBe(second);
		third.destroy();
	} finally {
		console.warn = originalWarn;
	}
});
