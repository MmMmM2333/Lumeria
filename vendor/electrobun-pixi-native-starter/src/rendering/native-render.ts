export type FastRenderFallbackReason =
	| "not-compiled"
	| "non-root-target"
	| "multiple-passes"
	| "unsupported-instruction"
	| "no-batches"
	| "batch-recording-failed"
	| "renderer-changed"
	| "generation-changed"
	| "invalidated";

export interface FastRenderInstruction {
	readonly renderPipeId: string;
}

export interface FastRenderBundle<TBundle = unknown, TVertexBuffer = unknown> {
	readonly bundle: TBundle;
	readonly vertexBuffer: TVertexBuffer;
	readonly vertexData: Uint8Array;
}

export interface FastRenderPlan<TBundle = unknown, TVertexBuffer = unknown> {
	readonly rendererUid: number;
	readonly generation: number;
	readonly bundles: readonly FastRenderBundle<TBundle, TVertexBuffer>[];
}

export type FastRenderDecision<TBundle = unknown, TVertexBuffer = unknown> =
	| { readonly kind: "fast"; readonly plan: FastRenderPlan<TBundle, TVertexBuffer> }
	| { readonly kind: "standard"; readonly reason: FastRenderFallbackReason };

export interface FastRenderCompileInput<TInstruction extends FastRenderInstruction> {
	readonly rendererUid: number;
	readonly generation: number;
	readonly isRootTarget: boolean;
	readonly passCount: number;
	readonly instructions: readonly TInstruction[];
}

export interface FastRenderPresentInput<TStatus, TBundle = unknown, TVertexBuffer = unknown> {
	readonly rendererUid: number;
	readonly generation: number;
	readonly submit: (plan: FastRenderPlan<TBundle, TVertexBuffer>) => TStatus;
}

export type FastRenderPresentResult<TStatus> =
	| { readonly kind: "fast"; readonly status: TStatus }
	| { readonly kind: "standard"; readonly reason: FastRenderFallbackReason };

export function installNativeRender<
	TInstruction extends FastRenderInstruction,
	TBundle = unknown,
	TVertexBuffer = unknown,
>(options: {
	recordBatch: (
		instruction: TInstruction,
		index: number,
	) => FastRenderBundle<TBundle, TVertexBuffer> | null;
	destroyBundle?: (bundle: FastRenderBundle<TBundle, TVertexBuffer>) => void;
}) {
	let plan: FastRenderPlan<TBundle, TVertexBuffer> | null = null;
	let fallbackReason: FastRenderFallbackReason = "not-compiled";

	const destroy = (bundles: readonly FastRenderBundle<TBundle, TVertexBuffer>[]) => {
		if (!options.destroyBundle) return;
		for (const bundle of bundles) options.destroyBundle(bundle);
	};
	const discard = (reason: FastRenderFallbackReason) => {
		const stale = plan;
		plan = null;
		fallbackReason = reason;
		if (stale) destroy(stale.bundles);
	};
	const standard = (reason: FastRenderFallbackReason) => {
		discard(reason);
		return { kind: "standard", reason } as const;
	};

	return {
		compile(input: FastRenderCompileInput<TInstruction>): FastRenderDecision<TBundle, TVertexBuffer> {
			discard("invalidated");
			if (!input.isRootTarget) return standard("non-root-target");
			if (input.passCount !== 1) return standard("multiple-passes");
			if (!input.instructions.every(({ renderPipeId }) => renderPipeId === "batch")) {
				return standard("unsupported-instruction");
			}
			if (input.instructions.length === 0) return standard("no-batches");

			const bundles: FastRenderBundle<TBundle, TVertexBuffer>[] = [];
			try {
				for (let index = 0; index < input.instructions.length; index++) {
					const bundle = options.recordBatch(input.instructions[index], index);
					if (!bundle) {
						destroy(bundles);
						fallbackReason = "batch-recording-failed";
						return { kind: "standard", reason: fallbackReason };
					}
					bundles.push(bundle);
				}
			} catch {
				destroy(bundles);
				fallbackReason = "batch-recording-failed";
				return { kind: "standard", reason: fallbackReason };
			}

			plan = Object.freeze({
				rendererUid: input.rendererUid,
				generation: input.generation,
				bundles: Object.freeze(bundles),
			});
			return { kind: "fast", plan };
		},

		present<TStatus>(
			input: FastRenderPresentInput<TStatus, TBundle, TVertexBuffer>,
		): FastRenderPresentResult<TStatus> {
			if (!plan) return { kind: "standard", reason: fallbackReason };
			if (plan.rendererUid !== input.rendererUid) return standard("renderer-changed");
			if (plan.generation !== input.generation) return standard("generation-changed");
			return { kind: "fast", status: input.submit(plan) };
		},

		invalidate() {
			discard("invalidated");
		},
	};
}
