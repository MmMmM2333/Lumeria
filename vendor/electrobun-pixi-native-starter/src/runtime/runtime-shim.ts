if (typeof globalThis.requestAnimationFrame !== "function") {
	globalThis.requestAnimationFrame = (callback) => setImmediate(() => callback(performance.now())) as unknown as number;
	globalThis.cancelAnimationFrame = (id) => clearImmediate(id as unknown as ReturnType<typeof setImmediate>);
}
