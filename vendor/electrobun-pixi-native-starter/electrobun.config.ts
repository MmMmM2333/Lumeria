import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "PixiJS Native WebGPU",
		identifier: "dev.example.electrobun-pixijs-webgpu",
		version: "0.2.0",
	},
	build: {
		mainProcess: "bun",
		bun: { entrypoint: "src/main.ts" },
		cottontail: { entrypoint: "src/main.ts" },
		copy: {
			"assets/bunnies": "bun/assets/bunnies",
			"node_modules/@napi-rs/canvas-win32-x64-msvc/icudtl.dat": "bun/icudtl.dat",
			".hutch/native-frame/native-frame.dll": "bun/native-frame.dll",
		},
		mac: { bundleWGPU: true },
		win: { bundleWGPU: true },
		linux: { bundleWGPU: true },
	},
} satisfies ElectrobunConfig;
