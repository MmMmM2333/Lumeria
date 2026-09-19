import { describe, expect, test } from "bun:test";
import { installNativeRender, type FastRenderBundle } from "./native-render";

type Instruction = { renderPipeId: string; id: string };
type Bundle = FastRenderBundle<string, string>;

const batch = (id: string): Instruction => ({ renderPipeId: "batch", id });
const recorded = (instruction: Instruction): Bundle => ({
	bundle: `bundle:${instruction.id}`,
	vertexBuffer: `buffer:${instruction.id}`,
	vertexData: new Uint8Array([instruction.id.length]),
});

describe("native render public seam", () => {
	test("compiles and presents one root batch", () => {
		const render = installNativeRender<Instruction, string, string>({ recordBatch: recorded });
		const decision = render.compile({
			rendererUid: 7,
			generation: 3,
			isRootTarget: true,
			passCount: 1,
			instructions: [batch("only")],
		});

		expect(decision).toEqual({
			kind: "fast",
			plan: {
				rendererUid: 7,
				generation: 3,
				bundles: [{
					bundle: "bundle:only",
					vertexBuffer: "buffer:only",
					vertexData: new Uint8Array([4]),
				}],
			},
		});
		expect(render.present({ rendererUid: 7, generation: 3, submit: (plan) => plan.bundles.length }))
			.toEqual({ kind: "fast", status: 1 });
	});

	test("preserves every root batch in instruction order", () => {
		const render = installNativeRender<Instruction, string, string>({ recordBatch: recorded });
		const decision = render.compile({
			rendererUid: 1,
			generation: 1,
			isRootTarget: true,
			passCount: 1,
			instructions: [batch("first"), batch("second"), batch("third")],
		});

		expect(decision.kind).toBe("fast");
		if (decision.kind !== "fast") throw new Error("expected a fast render plan");
		expect(decision.plan.bundles.map(({ bundle }) => bundle))
			.toEqual(["bundle:first", "bundle:second", "bundle:third"]);
		expect(render.present({
			rendererUid: 1,
			generation: 1,
			submit: (plan) => plan.bundles.map(({ bundle }) => bundle),
		})).toEqual({ kind: "fast", status: ["bundle:first", "bundle:second", "bundle:third"] });
	});

	test("fails closed before recording unsupported work", () => {
		let recordedCount = 0;
		const render = installNativeRender<Instruction, string, string>({
			recordBatch(instruction) {
				recordedCount++;
				return recorded(instruction);
			},
		});

		expect(render.compile({
			rendererUid: 1,
			generation: 1,
			isRootTarget: true,
			passCount: 1,
			instructions: [batch("visible"), { renderPipeId: "filter", id: "unsupported" }],
		})).toEqual({ kind: "standard", reason: "unsupported-instruction" });
		expect(recordedCount).toBe(0);
		expect(render.present({ rendererUid: 1, generation: 1, submit: () => 0 }))
			.toEqual({ kind: "standard", reason: "unsupported-instruction" });

		expect(render.compile({
			rendererUid: 1,
			generation: 1,
			isRootTarget: false,
			passCount: 1,
			instructions: [batch("hidden")],
		})).toEqual({ kind: "standard", reason: "non-root-target" });
		expect(render.compile({
			rendererUid: 1,
			generation: 1,
			isRootTarget: true,
			passCount: 2,
			instructions: [batch("hidden")],
		})).toEqual({ kind: "standard", reason: "multiple-passes" });
	});

	test("invalidates plans when generation, renderer, or caller state changes", () => {
		const destroyed: string[] = [];
		const install = () => installNativeRender<Instruction, string, string>({
			recordBatch: recorded,
			destroyBundle: ({ bundle }) => destroyed.push(bundle),
		});
		const input = {
			rendererUid: 4,
			generation: 9,
			isRootTarget: true,
			passCount: 1,
			instructions: [batch("stale")],
		} as const;

		const generationChanged = install();
		generationChanged.compile(input);
		expect(generationChanged.present({ rendererUid: 4, generation: 10, submit: () => 0 }))
			.toEqual({ kind: "standard", reason: "generation-changed" });

		const rendererChanged = install();
		rendererChanged.compile(input);
		expect(rendererChanged.present({ rendererUid: 5, generation: 9, submit: () => 0 }))
			.toEqual({ kind: "standard", reason: "renderer-changed" });

		const explicitlyInvalidated = install();
		explicitlyInvalidated.compile(input);
		explicitlyInvalidated.invalidate();
		expect(explicitlyInvalidated.present({ rendererUid: 4, generation: 9, submit: () => 0 }))
			.toEqual({ kind: "standard", reason: "invalidated" });
		expect(destroyed).toEqual(["bundle:stale", "bundle:stale", "bundle:stale"]);
	});
});
