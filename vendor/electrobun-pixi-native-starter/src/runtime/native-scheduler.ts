export type FrameSchedulerMode = "product" | "benchmark";

export interface FrameScheduler {
	invalidate(): void;
	animate(): () => void;
	suspend(): void;
	resume(): void;
	close(): void;
}

export interface FrameSchedulerOptions<Handle> {
	mode: FrameSchedulerMode;
	maxFps?: number;
	frame(time: number): void;
	schedule(callback: () => void, delayMs: number): Handle;
	cancel(handle: Handle): void;
	clock(): number;
}

export function createFrameScheduler<Handle>({
	mode,
	maxFps = 0,
	frame,
	schedule,
	cancel,
	clock,
}: FrameSchedulerOptions<Handle>): FrameScheduler {
	if (!Number.isFinite(maxFps) || maxFps < 0) throw new Error("maxFps must be a non-negative finite number");
	const frameInterval = maxFps > 0 ? 1000 / maxFps : 0;
	let dirty = false;
	let leases = 0;
	let suspended = false;
	let closed = false;
	let scheduled = false;
	let nextFrameAt = 0;
	let handle: Handle;

	const wantsFrame = () => mode === "benchmark" || dirty || leases > 0;
	const request = () => {
		if (closed || suspended || scheduled || !wantsFrame()) return;
		scheduled = true;
		handle = schedule(run, frameInterval ? Math.max(0, nextFrameAt - clock()) : 0);
	};
	const cancelPending = () => {
		if (!scheduled) return;
		scheduled = false;
		cancel(handle);
	};
	function run() {
		scheduled = false;
		if (closed || suspended || !wantsFrame()) return;
		const now = clock();
		if (frameInterval && nextFrameAt > now) {
			request();
			return;
		}
		dirty = false;
		if (frameInterval) {
			nextFrameAt = nextFrameAt === 0 || now - nextFrameAt >= frameInterval
				? now + frameInterval
				: nextFrameAt + frameInterval;
		}
		frame(now);
		request();
	}

	request();
	return {
		invalidate() {
			if (closed) return;
			dirty = true;
			request();
		},
		animate() {
			if (closed) return () => {};
			leases++;
			request();
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				leases--;
				if (mode === "product" && !dirty && leases === 0) cancelPending();
			};
		},
		suspend() {
			if (closed || suspended) return;
			suspended = true;
			nextFrameAt = 0;
			cancelPending();
		},
		resume() {
			if (closed || !suspended) return;
			suspended = false;
			request();
		},
		close() {
			if (closed) return;
			closed = true;
			cancelPending();
			dirty = false;
			leases = 0;
		},
	};
}
