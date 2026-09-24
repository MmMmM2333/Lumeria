import {
	nativeFrameHost,
	type NativeTextEvent,
	type TextInputRect,
} from "../platform/native-frame-host";

export interface TextSelection {
	start: number;
	end: number;
}

export interface TextInputBeginOptions {
	caretRect: Readonly<TextInputRect>;
	surroundingText: string;
	selection: Readonly<TextSelection>;
	password?: boolean;
	multiline?: boolean;
}

export interface TextInputUpdateOptions {
	caretRect: Readonly<TextInputRect>;
	surroundingText: string;
	selection: Readonly<TextSelection>;
}

export interface NativeTextInputState {
	caretRect: Readonly<TextInputRect>;
	surroundingText: string;
	selection: Readonly<TextSelection>;
	password: boolean;
	multiline: boolean;
	degraded: boolean;
	composing: boolean;
}

export interface NativeTextInputStatus {
	/** 0 means the session has ended; 1/2 mean the operation was applied. */
	status: number;
	degraded: boolean;
}

export interface NativeTextTimestampedEvent {
	timestamp: bigint;
}

export interface NativeCompositionEndEvent extends NativeTextTimestampedEvent {
	reason: "commit" | "cancel";
}

export interface NativeCompositionUpdateEvent extends NativeTextTimestampedEvent {
	text: string;
	/** Cursor offset in UTF-16 code units, matching JS string indices. */
	cursorUtf16: number;
}

export interface NativeTextCommitEvent extends NativeTextTimestampedEvent {
	text: string;
}

export interface NativeTextInputErrorEvent extends NativeTextTimestampedEvent {
	code: number;
	message: string;
}

export type NativeTextInputActivity =
	| "begin"
	| "caret"
	| "composition"
	| "commit"
	| "error"
	| "end";

export interface NativeTextInputSessionOptions {
	windowHandle: number;
	route: bigint;
	nativeHost?: Pick<typeof nativeFrameHost, "beginTextInput" | "updateTextInput" | "endTextInput" | "pollTextEvent">;
	toPhysicalRect(rect: Readonly<TextInputRect>): TextInputRect;
	onActivity?(activity: NativeTextInputActivity): void;
}

export class NativeTextInputOperationError extends Error {
	readonly code: number;
	readonly operation: string;

	constructor(operation: string, code: number) {
		super(`${operation} failed (${code})`);
		this.name = "NativeTextInputOperationError";
		this.operation = operation;
		this.code = code;
	}
}

type Listener<T> = (event: T) => void;
type RoutedSession = { active: () => boolean; dispatch: (event: NativeTextEvent) => void; finishEnd: () => void };
const sessions = new Map<bigint, RoutedSession>();
let polling = false;

const checkedStatus = (
	operation: string,
	status: number,
	allowed: readonly number[],
): NativeTextInputStatus => {
	if (status < 0) throw new NativeTextInputOperationError(operation, status);
	if (!allowed.includes(status)) throw new NativeTextInputOperationError(operation, status);
	return { status, degraded: status === 2 };
};

const freezeRect = ({ x, y, width, height }: Readonly<TextInputRect>) =>
	Object.freeze({ x, y, width, height });

const assertSelection = (text: string, selection: Readonly<TextSelection>) => {
	if (!Number.isInteger(selection.start) || !Number.isInteger(selection.end)
		|| selection.start < 0 || selection.end < 0
		|| selection.start > text.length || selection.end > text.length) {
		throw new RangeError("selection must contain UTF-16 offsets within surroundingText");
	}
};

export function createNativeTextInputSession({
	windowHandle,
	route,
	nativeHost = nativeFrameHost,
	toPhysicalRect,
	onActivity,
}: NativeTextInputSessionOptions) {
	if (!Number.isSafeInteger(windowHandle) || windowHandle <= 0) {
		throw new TypeError("windowHandle must be a non-zero pointer");
	}
	if (typeof route !== "bigint" || route <= 0n || route > 0xffff_ffff_ffff_ffffn) {
		throw new RangeError("route must be a non-zero u64");
	}
	if (sessions.has(route)) throw new Error(`text input route ${route} is already registered`);

	const compositionStartListeners = new Set<Listener<NativeTextTimestampedEvent>>();
	const compositionUpdateListeners = new Set<Listener<NativeCompositionUpdateEvent>>();
	const compositionEndListeners = new Set<Listener<NativeCompositionEndEvent>>();
	const compositionCancelListeners = new Set<Listener<NativeTextTimestampedEvent>>();
	const commitListeners = new Set<Listener<NativeTextCommitEvent>>();
	const errorListeners = new Set<Listener<NativeTextInputErrorEvent>>();
	const endListeners = new Set<Listener<void>>();
	let state: NativeTextInputState | null = null;
	let destroyed = false;
	let ending = false;
	let ignoreNextCompositionEnd = false;

	const emit = <T>(listeners: Set<Listener<T>>, event: T) => {
		for (const listener of [...listeners]) {
			try { listener(event); } catch (error) {
				console.error("[native-text-input] listener failed", error);
			}
		}
	};
	const activity = (value: NativeTextInputActivity) => {
		try { onActivity?.(value); } catch (error) {
			console.error("[native-text-input] onActivity failed", error);
		}
	};
	const subscribe = <T>(listeners: Set<Listener<T>>, listener: Listener<T>) => {
		if (destroyed) return () => {};
		listeners.add(listener);
		return () => { listeners.delete(listener); };
	};
	const dispatch = (event: NativeTextEvent) => {
		if (destroyed || !state || event.route !== route) return;
		const timestamped = { timestamp: event.timestamp };
		if (event.kind === 1) {
			ignoreNextCompositionEnd = false;
			state = Object.freeze({ ...state, composing: true });
			emit(compositionStartListeners, timestamped);
			activity("composition");
		} else if (event.kind === 2) {
			emit(compositionUpdateListeners, {
				...timestamped,
				text: event.text,
				cursorUtf16: event.cursor,
			});
			activity("composition");
		} else if (event.kind === 3) {
			if (ignoreNextCompositionEnd) {
				ignoreNextCompositionEnd = false;
				return;
			}
			if (!state.composing) return;
			state = Object.freeze({ ...state, composing: false });
			emit(compositionCancelListeners, timestamped);
			emit(compositionEndListeners, { ...timestamped, reason: "cancel" });
			activity("composition");
		} else if (event.kind === 4) {
			if (state.composing) {
				state = Object.freeze({ ...state, composing: false });
				ignoreNextCompositionEnd = true;
				emit(commitListeners, { ...timestamped, text: event.text });
				emit(compositionEndListeners, { ...timestamped, reason: "commit" });
			} else {
				emit(commitListeners, { ...timestamped, text: event.text });
			}
			activity("commit");
		} else {
			emit(errorListeners, { ...timestamped, code: event.code, message: event.text });
			activity("error");
		}
	};
	const finishEnd = () => {
		if (!ending) return;
		state = null;
		ending = false;
		ignoreNextCompositionEnd = false;
		emit(endListeners, undefined);
		activity("end");
	};
	const drain = () => {
		if (destroyed || polling) return 0;
		polling = true;
		try {
			let count = 0;
			for (let event = nativeHost.pollTextEvent(); event; event = nativeHost.pollTextEvent()) {
				count++;
				const target = sessions.get(event.route);
				if (target?.active()) target.dispatch(event);
			}
			return count;
		} finally {
			polling = false;
			// An editor may discover native blur while handling a queued commit.
			// Keep delivering the remaining commits before notifying it of session end.
			for (const target of [...sessions.values()]) target.finishEnd();
		}
	};

	sessions.set(route, { active: () => state !== null && !destroyed, dispatch, finishEnd });

	const end = () => {
		if (ending) return { status: 0, degraded: false } satisfies NativeTextInputStatus;
		if (!state) {
			ignoreNextCompositionEnd = false;
			return { status: 0, degraded: false } satisfies NativeTextInputStatus;
		}
		ending = true;
		let result: NativeTextInputStatus;
		try {
			result = checkedStatus("endTextInput", nativeHost.endTextInput(windowHandle), [0, 1]);
		} catch (error) { ending = false; throw error; }
		// If already polling, the outer drain retires us after all queued events.
		drain();
		return result;
	};

	return {
		get active() { return state !== null; },
		get state(): Readonly<NativeTextInputState> | null { return state; },
		begin(options: TextInputBeginOptions): NativeTextInputStatus {
			if (destroyed) throw new Error("text input session is destroyed");
			if (ending) throw new Error("text input session is ending");
			ignoreNextCompositionEnd = false;
			assertSelection(options.surroundingText, options.selection);
			if (state) end();
			const caretRect = freezeRect(options.caretRect);
			const result = checkedStatus(
				"beginTextInput",
				nativeHost.beginTextInput(windowHandle, toPhysicalRect(caretRect)),
				[1, 2],
			);
			state = Object.freeze({
				caretRect,
				surroundingText: options.surroundingText,
				selection: Object.freeze({ ...options.selection }),
				password: options.password ?? false,
				multiline: options.multiline ?? false,
				degraded: result.degraded,
				composing: false,
			});
			activity("begin");
			return result;
		},
		update(options: TextInputUpdateOptions): NativeTextInputStatus {
			if (destroyed) throw new Error("text input session is destroyed");
			if (!state) throw new Error("text input session is not active");
			assertSelection(options.surroundingText, options.selection);
			if (ending) return { status: 0, degraded: false };
			const caretRect = freezeRect(options.caretRect);
			const result = checkedStatus(
				"updateTextInput",
				nativeHost.updateTextInput(windowHandle, toPhysicalRect(caretRect)),
				[0, 1, 2],
			);
			if (result.status === 0) { end(); return result; }
			state = Object.freeze({
				...state,
				caretRect,
				surroundingText: options.surroundingText,
				selection: Object.freeze({ ...options.selection }),
				degraded: result.degraded,
			});
			activity("caret");
			return result;
		},
		updateCaretRect(rect: Readonly<TextInputRect>): NativeTextInputStatus {
			if (!state) throw new Error("text input session is not active");
			return this.update({
				caretRect: rect,
				surroundingText: state.surroundingText,
				selection: state.selection,
			});
		},
		poll(): number {
			return drain();
		},
		updateComposition(text: string): void {
			if (!state || destroyed) return;
			const timestamp = BigInt(Math.floor(performance.now()));
			if (!state.composing) {
				ignoreNextCompositionEnd = false;
				state = Object.freeze({ ...state, composing: true });
				emit(compositionStartListeners, { timestamp });
			}
			emit(compositionUpdateListeners, { timestamp, text, cursorUtf16: text.length });
			activity("composition");
		},
		commit(text: string): void {
			if (!state || destroyed || !text) return;
			const timestamp = BigInt(Math.floor(performance.now()));
			if (state.composing) {
				state = Object.freeze({ ...state, composing: false });
				ignoreNextCompositionEnd = true;
				emit(commitListeners, { timestamp, text });
				emit(compositionEndListeners, { timestamp, reason: "commit" });
			} else {
				emit(commitListeners, { timestamp, text });
			}
			activity("commit");
		},
		end,
		blur: end,
		onCompositionStart: (listener: Listener<NativeTextTimestampedEvent>) =>
			subscribe(compositionStartListeners, listener),
		onCompositionUpdate: (listener: Listener<NativeCompositionUpdateEvent>) =>
			subscribe(compositionUpdateListeners, listener),
		onCompositionEnd: (listener: Listener<NativeCompositionEndEvent>) =>
			subscribe(compositionEndListeners, listener),
		onCompositionCancel: (listener: Listener<NativeTextTimestampedEvent>) =>
			subscribe(compositionCancelListeners, listener),
		onCommit: (listener: Listener<NativeTextCommitEvent>) => subscribe(commitListeners, listener),
		onError: (listener: Listener<NativeTextInputErrorEvent>) => subscribe(errorListeners, listener),
		/** Runs after queued text events are delivered and the JS session is inactive. */
		onEnd: (listener: Listener<void>) => subscribe(endListeners, listener),
		destroy() {
			if (destroyed) return;
			try { end(); } catch (error) {
				console.warn("[native-text-input] native cleanup failed", error);
			} finally {
				destroyed = true;
				state = null;
				sessions.delete(route);
				compositionStartListeners.clear();
				compositionUpdateListeners.clear();
				compositionEndListeners.clear();
				compositionCancelListeners.clear();
				commitListeners.clear();
				errorListeners.clear();
				endListeners.clear();
			}
		},
	};
}
