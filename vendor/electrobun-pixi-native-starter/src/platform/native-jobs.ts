import {
	nativeFrameHost,
	type NativeJobEvent,
	type NativeJobKind,
} from "./native-frame-host";

export interface NativeJobProgress {
	completed: bigint;
	total: bigint;
	ratio: number | null;
}

export interface NativeJobOptions {
	signal?: AbortSignal;
	onProgress?(progress: NativeJobProgress): void;
}

export type NativeDirectoryEntryType = "file" | "directory" | "symlink" | "other";

export interface NativeDirectoryEntry {
	name: string;
	type: NativeDirectoryEntryType;
}

export class NativeJobError extends Error {
	readonly code: string;
	readonly nativeCode?: number;

	constructor(code: string, message: string, nativeCode?: number) {
		super(message);
		this.name = "NativeJobError";
		this.code = code;
		this.nativeCode = nativeCode;
	}
}

type PendingJob = {
	kind: NativeJobKind;
	settled: boolean;
	decode(data: Uint8Array): unknown;
	resolve(value: unknown): void;
	reject(error: NativeJobError): void;
	onProgress?: NativeJobOptions["onProgress"];
	signal?: AbortSignal;
	abort?: () => void;
	aborted: boolean;
};

const JOB_ERROR_CODES: Readonly<Record<number, string>> = {
	1: "UNSUPPORTED",
	2: "INVALID_UTF8",
	3: "INVALID_PATH",
	4: "IO_ERROR",
	5: "RESULT_TOO_LARGE",
	6: "WORKER_START_FAILED",
	7: "QUEUE_LIMIT",
	8: "ALLOCATION_FAILED",
};
const ENTRY_TYPES = ["other", "file", "directory", "symlink"] as const;
const requestEncoder = new TextEncoder();
const scanDecoder = new TextDecoder("utf-8", { fatal: true });
const jobs = new Map<bigint, PendingJob>();
let timer: ReturnType<typeof setInterval> | null = null;
let closed = false;

const stopTimer = () => {
	if (!timer) return;
	clearInterval(timer);
	timer = null;
};

const cleanup = (jobId: bigint, job: PendingJob) => {
	if (job.settled) return false;
	job.settled = true;
	jobs.delete(jobId);
	if (job.signal && job.abort) job.signal.removeEventListener("abort", job.abort);
	if (jobs.size === 0) stopTimer();
	return true;
};

const rejectAll = (error: NativeJobError) => {
	for (const [jobId, job] of [...jobs]) {
		if (cleanup(jobId, job)) job.reject(error);
	}
	stopTimer();
};

const fatal = (error: NativeJobError) => {
	if (closed) return;
	closed = true;
	rejectAll(error);
	try { nativeFrameHost.shutdownJobs(); } catch { /* bridge is already unusable */ }
};

const nativeError = (event: NativeJobEvent) => new NativeJobError(
	JOB_ERROR_CODES[event.code] ?? "NATIVE_ERROR",
	event.message || `native job failed (${event.code})`,
	event.code,
);

const handleEvent = (event: NativeJobEvent) => {
	const job = jobs.get(event.jobId);
	if (!job || job.settled) return;
	if (event.jobKind !== job.kind) {
		if (cleanup(event.jobId, job)) {
			job.reject(new NativeJobError("PROTOCOL_ERROR", "native job kind does not match its request"));
		}
		return;
	}
	if (event.eventKind === 1) {
		if (job.aborted) return;
		if (!job.onProgress) return;
		const ratio = event.total === 0n ? null : Number(event.completed) / Number(event.total);
		try {
			job.onProgress({ completed: event.completed, total: event.total, ratio });
		} catch (error) {
			console.error("[native-jobs] onProgress callback failed", error);
		}
		return;
	}
	if (!cleanup(event.jobId, job)) return;
	if (job.aborted || event.eventKind === 4) {
		job.reject(new NativeJobError("ABORTED", event.message || "native job was cancelled"));
	} else if (event.eventKind === 3) {
		job.reject(nativeError(event));
	} else if (event.code !== 0) {
		job.reject(new NativeJobError("PROTOCOL_ERROR", `native job result has non-zero code ${event.code}`));
	} else {
		try {
			job.resolve(job.decode(event.data));
		} catch (error) {
			job.reject(error instanceof NativeJobError
				? error
				: new NativeJobError("INVALID_RESULT", error instanceof Error ? error.message : String(error)));
		}
	}
};

const drain = () => {
	try {
		for (let count = 0; count < 64; count++) {
			const event = nativeFrameHost.pollJobEvent();
			if (!event) break;
			handleEvent(event);
		}
	} catch (error) {
		fatal(new NativeJobError(
			"POLL_FAILED",
			error instanceof Error ? error.message : String(error),
		));
	}
};

const ensureTimer = () => {
	if (!timer) timer = setInterval(drain, 8);
};

const parseScan = (data: Uint8Array): NativeDirectoryEntry[] => {
	if (data.byteLength < 8 || data[0] !== 0x53 || data[1] !== 0x43
		|| data[2] !== 0x4e || data[3] !== 0x31) {
		throw new NativeJobError("INVALID_SCAN_RESULT", "directory scan result has an invalid SCN1 header");
	}
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const count = view.getUint32(4, true);
	if (count > Math.floor((data.byteLength - 8) / 8)) {
		throw new NativeJobError("INVALID_SCAN_RESULT", "directory scan entry count exceeds result bounds");
	}
	const entries: NativeDirectoryEntry[] = [];
	let offset = 8;
	for (let index = 0; index < count; index++) {
		if (offset > data.byteLength - 8) {
			throw new NativeJobError("INVALID_SCAN_RESULT", `directory scan record ${index} is truncated`);
		}
		const nameLength = view.getUint32(offset, true);
		const type = data[offset + 4];
		if (type > 3 || data[offset + 5] !== 0 || data[offset + 6] !== 0 || data[offset + 7] !== 0) {
			throw new NativeJobError("INVALID_SCAN_RESULT", `directory scan record ${index} has invalid metadata`);
		}
		offset += 8;
		if (nameLength === 0 || nameLength > data.byteLength - offset) {
			throw new NativeJobError("INVALID_SCAN_RESULT", `directory scan record ${index} has invalid name bounds`);
		}
		let name: string;
		try {
			name = scanDecoder.decode(data.subarray(offset, offset + nameLength));
		} catch {
			throw new NativeJobError("INVALID_SCAN_RESULT", `directory scan record ${index} name is not valid UTF-8`);
		}
		if (name.includes("\0")) {
			throw new NativeJobError("INVALID_SCAN_RESULT", `directory scan record ${index} name contains NUL`);
		}
		entries.push({ name, type: ENTRY_TYPES[type] });
		offset += nameLength;
	}
	if (offset !== data.byteLength) {
		throw new NativeJobError("INVALID_SCAN_RESULT", "directory scan result contains trailing data");
	}
	return entries;
};

const encodePath = (path: string) => {
	if (typeof path !== "string" || path.length === 0) {
		throw new NativeJobError("INVALID_PATH", "native job path must not be empty");
	}
	for (let index = 0; index < path.length; index++) {
		const unit = path.charCodeAt(index);
		if (unit === 0) throw new NativeJobError("INVALID_PATH", "native job path must not contain NUL");
		if (unit >= 0xd800 && unit <= 0xdbff) {
			const low = path.charCodeAt(++index);
			if (low < 0xdc00 || low > 0xdfff) {
				throw new NativeJobError("INVALID_PATH", "native job path contains an unpaired UTF-16 surrogate");
			}
		} else if (unit >= 0xdc00 && unit <= 0xdfff) {
			throw new NativeJobError("INVALID_PATH", "native job path contains an unpaired UTF-16 surrogate");
		}
	}
	return requestEncoder.encode(path);
};

function start<T>(
	kind: NativeJobKind,
	path: string,
	decode: (data: Uint8Array) => T,
	options: NativeJobOptions,
): Promise<T> {
	if (closed) return Promise.reject(new NativeJobError("SHUTDOWN", "native jobs have been shut down"));
	if (options.signal?.aborted) return Promise.reject(new NativeJobError("ABORTED", "native job was cancelled"));
	let jobId: bigint;
	try {
		jobId = nativeFrameHost.startJob(kind, encodePath(path));
	} catch (error) {
		return Promise.reject(error instanceof NativeJobError ? error : new NativeJobError(
			"INVALID_REQUEST",
			error instanceof Error ? error.message : String(error),
		));
	}
	if (jobId === 0n) {
		return Promise.reject(new NativeJobError("START_FAILED", "native job could not be started"));
	}
	if (jobs.has(jobId)) {
		const error = new NativeJobError("PROTOCOL_ERROR", `native job id ${jobId} was reused`);
		fatal(error);
		return Promise.reject(error);
	}

	return new Promise<T>((resolve, reject) => {
		const job: PendingJob = {
			kind,
			settled: false,
			aborted: false,
			decode,
			resolve: (value) => resolve(value as T),
			reject,
			onProgress: options.onProgress,
			signal: options.signal,
		};
		if (options.signal) {
			job.abort = () => {
				if (job.settled || job.aborted) return;
				job.aborted = true;
				try {
					const status = nativeFrameHost.cancelJob(jobId);
					if (status < 0) fatal(new NativeJobError("CANCEL_FAILED", `native job cancellation failed (${status})`));
				} catch (error) {
					fatal(new NativeJobError(
						"CANCEL_FAILED",
						error instanceof Error ? error.message : String(error),
					));
				}
			};
		}
		jobs.set(jobId, job);
		if (options.signal && job.abort) {
			options.signal.addEventListener("abort", job.abort, { once: true });
			if (options.signal.aborted) job.abort();
		}
		try {
			ensureTimer();
		} catch (error) {
			fatal(new NativeJobError(
				"POLL_START_FAILED",
				error instanceof Error ? error.message : String(error),
			));
		}
	});
}

export const NativeJobs = Object.freeze({
	readFile(path: string, options: NativeJobOptions = {}): Promise<Uint8Array> {
		return start(1, path, (data) => data, options);
	},
	scanDirectory(path: string, options: NativeJobOptions = {}): Promise<NativeDirectoryEntry[]> {
		return start(2, path, parseScan, options);
	},
	shutdown(): number {
		if (closed) return 0;
		closed = true;
		rejectAll(new NativeJobError("SHUTDOWN", "native jobs have been shut down"));
		let status: number;
		try {
			status = nativeFrameHost.shutdownJobs();
		} catch (error) {
			throw new NativeJobError(
				"SHUTDOWN_FAILED",
				error instanceof Error ? error.message : String(error),
			);
		}
		if (status < 0) throw new NativeJobError("SHUTDOWN_FAILED", `native job shutdown failed (${status})`);
		return status;
	},
});
