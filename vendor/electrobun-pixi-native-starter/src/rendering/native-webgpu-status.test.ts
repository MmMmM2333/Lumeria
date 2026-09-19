import { describe, expect, test, mock } from "bun:test";
// Context contract tests do not need Electrobun native DLLs beside the test host.
const electrobunNativeAdapter:Record<string,unknown>={};
mock.module("./electrobun-native-adapter",()=>({electrobunNativeAdapter}));
const { consumePresentStatus, createContext, present, getSurfaceTextureUsage } = await import("./native-webgpu-context");
import { normalizePresentStatus } from "./native-webgpu-status";

describe("native WebGPU present status", () => {
	test("normalizes WebGPU and native frame status codes", () => {
		expect([1, 2, 3, 4, 5, 6].map(normalizePresentStatus)).toEqual([
			"success", "suboptimal", "timeout", "outdated", "surface-lost", "out-of-memory",
		]);
		expect([-2, -3, -4, -6].map(normalizePresentStatus)).toEqual([
			"timeout", "outdated", "surface-lost", "out-of-memory",
		]);
	});

	test("normalizes named statuses and errors", () => {
		expect(normalizePresentStatus("device_lost")).toBe("device-lost");
		expect(normalizePresentStatus({ surfaceStatus: 4 })).toBe("outdated");
		expect(normalizePresentStatus(new Error("GPU device lost"))).toBe("device-lost");
		expect(normalizePresentStatus(-15)).toBe("fatal");
		expect(normalizePresentStatus(undefined)).toBeNull();
	});

	test("does not carry a fast-path status into a standard frame", () => {
		const adapter = electrobunNativeAdapter as any;
		const original = {
			createWebgpuContext: adapter.createWebgpuContext,
			consumeWebgpuPresentStatus: adapter.consumeWebgpuPresentStatus,
			submitWithWebgpuSurface: adapter.submitWithWebgpuSurface,
		};
		const raw = { status: 1,textureUsage:0 };
		Object.assign(adapter, {
			createWebgpuContext: () => ({
				canvas: { width: 1, height: 1, getContext: () => raw },
				context: raw,
			}),
			consumeWebgpuPresentStatus: () => {
				const status = raw.status;
				raw.status = null as any;
				return status;
			},
			submitWithWebgpuSurface: (_context: unknown, submit: (surface: number) => unknown) => submit(123),
		});
		try {
			const context = createContext({} as any);
      expect(getSurfaceTextureUsage(context)).toBe(0);
      raw.textureUsage=0x17;expect(getSurfaceTextureUsage(context)&1).toBe(1);
      raw.textureUsage=0x12;expect(getSurfaceTextureUsage(context)&1).toBe(0);
			expect(present(context, () => -3)).toBe("outdated");
			raw.status = 5;
			expect(consumePresentStatus(context)).toBe("surface-lost");
			expect(consumePresentStatus(context)).toBeNull();
		} finally {
			Object.assign(adapter, original);
		}
	});
});
