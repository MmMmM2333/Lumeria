import { Container, DOMAdapter, Graphics, Rectangle, Text } from "pixi.js";
import {
	TextEditor,
	type TextEditorCommand,
	type TextEditorLayout,
	type TextSelection,
} from "./text-editor";

type Off = () => void;
type KeyEvent = {
	type: "down" | "up";
	key: string;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey?: boolean;
	isComposing: boolean;
};

export interface TextInputNativeEvents {
	onKey(listener: (event: KeyEvent) => void): Off;
	onFocusChange(listener: (focused: boolean) => void): Off;
	onTextCommit(listener: (text: string) => void): Off;
}

interface NativeContext {
	caretRect: { x: number; y: number; width: number; height: number };
	surroundingText: string;
	selection: { start: number; end: number };
	multiline?: boolean;
}

export interface TextInputNativeSession {
	readonly active: boolean;
	begin(options: NativeContext): unknown;
	update(options: NativeContext): unknown;
	end(): unknown;
	commit(text: string): void;
	onCompositionStart(listener: (event: { timestamp: bigint }) => void): Off;
	onCompositionUpdate(listener: (event: { timestamp: bigint; text: string; cursorUtf16: number }) => void): Off;
	onCompositionCancel(listener: (event: { timestamp: bigint }) => void): Off;
	onCommit(listener: (event: { timestamp: bigint; text: string }) => void): Off;
}

type ClipboardResult<T> = { ok: true; value: T } | { ok: false; error?: unknown };
export interface TextInputClipboard {
	readText(): Promise<ClipboardResult<string | null>>;
	writeText(text: string): Promise<ClipboardResult<unknown>>;
}

export interface TextInputStyle {
	fontFamily: string | readonly string[];
	fontSize: number;
	lineHeight: number;
	padding: number;
	textColor: number;
	placeholderColor: number;
	backgroundColor: number;
	borderColor: number;
	focusColor: number;
	selectionColor: number;
	caretColor: number;
}

export interface TextInputOptions {
	width: number;
	height: number;
	value?: string;
	placeholder?: string;
	multiline?: boolean;
	maxLength?: number;
	readOnly?: boolean;
	disabled?: boolean;
	style?: Partial<TextInputStyle>;
}

export interface TextInputHostOptions {
	root: Container;
	nativeInput: TextInputNativeEvents;
	nativeTextInput: TextInputNativeSession;
	clipboard: TextInputClipboard;
	requestFrame(): void;
}

const defaultStyle: TextInputStyle = {
	fontFamily: "Segoe UI, Segoe UI Emoji, sans-serif",
	fontSize: 18,
	lineHeight: 26,
	padding: 10,
	textColor: 0xf4f6ff,
	placeholderColor: 0x77809f,
	backgroundColor: 0x101426,
	borderColor: 0x343d68,
	focusColor: 0x6c63ff,
	selectionColor: 0x4654a8,
	caretColor: 0xffffff,
};

export class TextInputHost {
	private readonly nativeTextInput: TextInputNativeSession;
	private readonly clipboard: TextInputClipboard;
	private readonly root: Container;
	private readonly requestFrame: () => void;
	private readonly inputs: TextInput[] = [];
	private inputOff: Off[] = [];
	private sessionOff: Off[] = [];
	private blinkTimer?: ReturnType<typeof setInterval>;
	private destroyed = false;
	private focusEpoch = 0;
	focused: TextInput | null = null;

	constructor(options: TextInputHostOptions) {
		this.root = options.root;
		this.nativeTextInput = options.nativeTextInput;
		this.clipboard = options.clipboard;
		this.requestFrame = options.requestFrame;
		this.root.on("pointerdown", this.onRootPointerDown);
		this.bindNativeInput(options.nativeInput);
		this.sessionOff = [
			this.nativeTextInput.onCompositionStart(() => this.focused?.beginComposition()),
			this.nativeTextInput.onCompositionUpdate(({ text, cursorUtf16 }) =>
				this.focused?.updateComposition(text, cursorUtf16)),
			this.nativeTextInput.onCompositionCancel(() => this.focused?.cancelComposition()),
			this.nativeTextInput.onCommit(({ text }) => this.focused?.commitText(text)),
		];
	}

	create(options: TextInputOptions): TextInput {
		if (this.destroyed) throw new Error("TextInputHost is destroyed");
		const input = new TextInput(this, options);
		this.inputs.push(input);
		return input;
	}

	rebindNativeInput(nativeInput: TextInputNativeEvents): void {
		this.bindNativeInput(nativeInput);
	}

	focus(input: TextInput): void {
		if (this.destroyed || input.disabled || this.focused === input) return;
		this.blur();
		this.focused = input;
		this.focusEpoch++;
		input.setFocused(true);
		if (input.readOnly) {
			if (this.nativeTextInput.active) this.nativeTextInput.end();
		} else this.nativeTextInput.begin(input.nativeContext());
		this.resetCaretBlink();
		input.emitEvent("focus");
		this.requestFrame();
	}

	blur(input = this.focused): void {
		if (!input || this.focused !== input) return;
		input.cancelComposition();
		if (this.nativeTextInput.active) this.nativeTextInput.end();
		this.focused = null;
		this.focusEpoch++;
		this.stopCaretBlink();
		input.setFocused(false);
		input.emitEvent("blur");
		this.requestFrame();
	}

	syncFocused(): void {
		if (this.focused) this.sync(this.focused);
		this.requestFrame();
	}

	recover(): void {
		for (const input of this.inputs) input.refresh(false);
		this.syncFocused();
		this.requestFrame();
	}

	unregister(input: TextInput): void {
		if (this.focused === input) this.blur(input);
		const index = this.inputs.indexOf(input);
		if (index >= 0) this.inputs.splice(index, 1);
	}

	didChange(input: TextInput, beforeValue: string, beforeSelection: string, userInput: boolean): void {
		input.refresh(true);
		if (this.focused === input) {
			this.sync(input);
			this.resetCaretBlink();
		}
		if (input.value !== beforeValue) {
			input.revision++;
			if (userInput) input.emitEvent("input", input.value);
		}
		if (input.selectionKey() !== beforeSelection) input.emitEvent("selectionchange", input.selection);
		this.requestFrame();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.blur();
		this.destroyed = true;
		this.root.off("pointerdown", this.onRootPointerDown);
		for (const off of [...this.inputOff, ...this.sessionOff]) off();
		this.inputOff = [];
		this.sessionOff = [];
		for (const input of [...this.inputs]) input.destroy();
	}

	private bindNativeInput(nativeInput: TextInputNativeEvents): void {
		for (const off of this.inputOff) off();
		this.inputOff = [
			nativeInput.onKey((event) => this.onKey(event)),
			nativeInput.onFocusChange((focused) => { if (!focused) this.blur(); }),
			nativeInput.onTextCommit((text) => {
				if (this.focused && this.nativeTextInput.active) this.nativeTextInput.commit(text);
			}),
		];
	}

	private sync(input: TextInput): void {
		if (input.readOnly) {
			if (this.nativeTextInput.active) this.nativeTextInput.end();
			return;
		}
		const context = input.nativeContext();
		if (this.nativeTextInput.active) this.nativeTextInput.update(context);
		else this.nativeTextInput.begin(context);
	}

	private resetCaretBlink(): void {
		if (!this.focused) return;
		this.focused.setCaretVisible(true);
		this.stopCaretBlink();
		this.blinkTimer = setInterval(() => {
			if (!this.focused) return;
			this.focused.setCaretVisible(!this.focused.caretVisible);
			this.requestFrame();
		}, 500);
	}

	private stopCaretBlink(): void {
		if (this.blinkTimer) clearInterval(this.blinkTimer);
		this.blinkTimer = undefined;
	}

	private onRootPointerDown = (event: any) => {
		if (this.focused && !this.focused.containsTarget(event.target)) this.blur();
	};

	private onKey(event: KeyEvent): void {
		const input = this.focused;
		if (!input || event.type !== "down" || event.isComposing || event.altKey) return;
		const key = event.key;
		const lower = key.toLowerCase();
		if (event.ctrlKey && lower === "a") return input.selectAll();
		if (event.ctrlKey && lower === "c") { void this.copy(input, false); return; }
		if (event.ctrlKey && lower === "x") { if (!input.readOnly) void this.copy(input, true); return; }
		if (event.ctrlKey && lower === "v") { if (!input.readOnly) void this.paste(input); return; }
		if (event.ctrlKey && (lower === "z" || lower === "y")) {
			if (!input.readOnly) input.command({ type: lower === "y" || event.shiftKey ? "redo" : "undo" }, true);
			return;
		}
		if (key === "Tab") { this.focusNext(input, event.shiftKey ? -1 : 1); return; }
		if (key === "Escape") { this.blur(input); return; }
		if (key === "Enter") {
			if (input.multiline && !input.readOnly) input.command({ type: "insert", text: "\n" }, true);
			else if (!input.multiline) input.emitEvent("submit", input.value);
			return;
		}
		if (key === "Backspace" || key === "Delete") {
			if (!input.readOnly) input.command({
				type: key === "Backspace" ? "backspace" : "delete",
				word: event.ctrlKey,
			}, true);
			return;
		}
		if (key === "ArrowLeft" || key === "ArrowRight") {
			input.command({
				type: "move-horizontal",
				direction: key === "ArrowLeft" ? -1 : 1,
				extend: event.shiftKey,
				word: event.ctrlKey,
			}, false);
			return;
		}
		if (key === "ArrowUp" || key === "ArrowDown") {
			input.command({
				type: "move-vertical",
				direction: key === "ArrowUp" ? -1 : 1,
				extend: event.shiftKey,
			}, false);
			return;
		}
		if (key === "PageUp" || key === "PageDown") {
			input.movePage(key === "PageUp" ? -1 : 1, event.shiftKey);
			return;
		}
		if (key === "Home" || key === "End") input.command({
			type: "move-line-boundary",
			edge: key === "Home" ? "start" : "end",
			extend: event.shiftKey,
			document: event.ctrlKey,
		}, false);
	}

	private focusNext(input: TextInput, direction: -1 | 1): void {
		const enabled = this.inputs.filter((candidate) => !candidate.disabled);
		if (enabled.length === 0) return;
		const current = enabled.indexOf(input);
		this.focus(enabled[(current + direction + enabled.length) % enabled.length]!);
	}

	private async copy(input: TextInput, cut: boolean): Promise<void> {
		const selection = input.selection;
		if (selection.start === selection.end) return;
		const revision = input.revision;
		const selectionKey = input.selectionKey();
		const focusEpoch = this.focusEpoch;
		const result = await this.clipboard.writeText(input.value.slice(selection.start, selection.end));
		if (!cut || !result.ok || input.readOnly || input.editor.state.composition
			|| this.focused !== input || input.revision !== revision
			|| input.selectionKey() !== selectionKey || this.focusEpoch !== focusEpoch) return;
		input.command({ type: "insert", text: "", history: "cut" }, true);
	}

	private async paste(input: TextInput): Promise<void> {
		const revision = input.revision;
		const selectionKey = input.selectionKey();
		const focusEpoch = this.focusEpoch;
		const result = await this.clipboard.readText();
		if (!result.ok || result.value === null || input.readOnly || input.editor.state.composition
			|| this.focused !== input || input.revision !== revision
			|| input.selectionKey() !== selectionKey || this.focusEpoch !== focusEpoch) return;
		input.command({ type: "insert", text: result.value, history: "paste" }, true);
	}
}

export class TextInput extends Container {
	readonly multiline: boolean;
	readonly editor: TextEditor;
	revision = 0;
	caretVisible = false;
	private readonly inputStyle: TextInputStyle;
	private readonly font: string;
	private readonly measure: (text: string) => number;
	private readonly background = new Graphics();
	private readonly content = new Container();
	private readonly selectionLayer = new Graphics();
	private readonly textNode: Text;
	private readonly compositionLayer = new Graphics();
	private readonly caretLayer = new Graphics();
	private readonly placeholderNode: Text;
	private readonly clip = new Graphics();
	private readonly focusLayer = new Graphics();
	private layoutSnapshot!: TextEditorLayout;
	private focusedState = false;
	private dragging = false;
	private dragAnchor = 0;
	private dragPoint = { x: 0, y: 0 };
	private dragTimer?: ReturnType<typeof setInterval>;
	private _readOnly: boolean;
	private _disabled: boolean;

	constructor(
		private readonly host: TextInputHost,
		options: TextInputOptions,
		private inputWidth = options.width,
		private inputHeight = options.height,
		private placeholder = options.placeholder ?? "",
	) {
		super();
		if (!Number.isFinite(this.inputWidth) || this.inputWidth <= 0
			|| !Number.isFinite(this.inputHeight) || this.inputHeight <= 0) {
			throw new RangeError("TextInput width and height must be positive");
		}
		this.multiline = options.multiline ?? false;
		this._readOnly = options.readOnly ?? false;
		this._disabled = options.disabled ?? false;
		this.inputStyle = { ...defaultStyle, ...options.style };
		const fontFamily = typeof this.inputStyle.fontFamily === "string"
			? this.inputStyle.fontFamily
			: this.inputStyle.fontFamily.join(", ");
		this.font = `${this.inputStyle.fontSize}px ${fontFamily}`;
		const context = (DOMAdapter.get().createCanvas(1, 1) as any).getContext("2d");
		this.measure = (text) => { context.font = this.font; return context.measureText(text).width; };
		this.editor = new TextEditor({
			value: options.value,
			multiline: this.multiline,
			maxLength: options.maxLength ?? (this.multiline ? 16_384 : 4_096),
		});
		const textStyle = {
			fontFamily,
			fontSize: this.inputStyle.fontSize,
			lineHeight: this.inputStyle.lineHeight,
			fill: this.inputStyle.textColor,
		};
		this.textNode = new Text({ text: "", style: textStyle });
		this.placeholderNode = new Text({ text: this.placeholder, style: {
			...textStyle, fill: this.inputStyle.placeholderColor,
		} });
		this.content.addChild(this.selectionLayer, this.textNode, this.compositionLayer, this.caretLayer, this.placeholderNode);
		this.addChild(this.background, this.content, this.clip, this.focusLayer);
		this.content.mask = this.clip;
		this.eventMode = "static";
		this.cursor = "text";
		this.updateHitArea();
		this.on("pointerdown", this.onPointerDown);
		this.on("globalpointermove", this.onPointerMove);
		for (const name of ["pointerup", "pointerupoutside", "pointercancel", "lostpointercapture"] as const) {
			this.on(name, this.onPointerEnd);
		}
		this.on("wheel", this.onWheel);
		this.refresh(false);
	}

	get value(): string { return this.editor.state.value; }
	set value(value: string) { this.setValue(value); }
	get selection(): Readonly<TextSelection> {
		const { anchor, focus } = this.editor.state;
		return { anchor, focus, start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
	}
	get readOnly(): boolean { return this._readOnly; }
	set readOnly(value: boolean) {
		this._readOnly = Boolean(value);
		if (this._readOnly) this.cancelComposition();
		if (this.host.focused === this) this.host.syncFocused();
	}
	get disabled(): boolean { return this._disabled; }
	set disabled(value: boolean) {
		this._disabled = Boolean(value);
		if (this._disabled) this.host.blur(this);
		this.refresh(false);
	}

	setValue(value: string): void { this.change(false, () => this.editor.setValue(value)); }
	setSelectionRange(anchor: number, focus = anchor): void {
		this.change(false, () => { this.editor.cancelComposition(); this.editor.setSelection(anchor, focus); });
	}
	selectAll(): void { this.change(false, () => this.editor.selectAll()); }
	focus(): void { this.host.focus(this); }
	blur(): void { this.host.blur(this); }
	resize(width: number, height: number): void {
		if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
			throw new RangeError("TextInput width and height must be positive");
		}
		this.inputWidth = width;
		this.inputHeight = height;
		this.updateHitArea();
		this.refresh(true);
		this.host.syncFocused();
	}

	command(command: TextEditorCommand, userInput: boolean): void {
		this.change(userInput, () => this.editor.dispatch(command, this.layoutSnapshot));
	}
	movePage(direction: -1 | 1, extend = false): void {
		const lines = Math.max(1, Math.floor(this.innerSize().height / this.inputStyle.lineHeight) - 1);
		this.command({ type: "move-vertical", direction, extend, lines }, false);
	}
	beginComposition(): void {
		if (this._readOnly || this._disabled) return;
		this.editor.startComposition();
		this.syncView();
	}
	updateComposition(text: string, cursorUtf16: number): void {
		if (this._readOnly || this._disabled) return;
		this.editor.updateComposition(text, cursorUtf16);
		this.syncView();
	}
	commitText(text: string): void {
		if (this._readOnly || this._disabled) return;
		this.change(true, () => {
			if (!this.editor.state.composition) {
				return this.editor.dispatch({ type: "insert", text, history: "typing" });
			}
			this.editor.commitComposition(text);
			return true;
		});
	}
	cancelComposition(): void {
		if (this.editor.cancelComposition()) this.syncView();
	}
	setFocused(focused: boolean): void {
		if (this.focusedState !== focused) this.editor.breakHistoryGroup();
		this.focusedState = focused;
		this.caretVisible = focused;
		this.refresh(false);
	}
	setCaretVisible(visible: boolean): void { this.caretVisible = visible; this.drawCaret(); }
	selectionKey(): string { return `${this.editor.state.anchor}:${this.editor.state.focus}`; }
	containsTarget(target: unknown): boolean {
		for (let node = target as any; node; node = node.parent) if (node === this) return true;
		return false;
	}
	emitEvent(name: string, value?: unknown): void { (this as any).emit(name, value); }

	nativeContext(): NativeContext {
		const caret = this.layoutSnapshot.offsetToCaret(this.editor.view.caret, this.editor.state.affinity);
		const local = this.layoutToLocal(caret.x, caret.y);
		const topLeft = this.toGlobal(local as any);
		const bottomRight = this.toGlobal({ x: local.x + 2, y: local.y + caret.height } as any);
		const selection = this.selection;
		return {
			caretRect: {
				x: Math.min(topLeft.x, bottomRight.x), y: Math.min(topLeft.y, bottomRight.y),
				width: Math.max(1, Math.abs(bottomRight.x - topLeft.x)),
				height: Math.max(1, Math.abs(bottomRight.y - topLeft.y)),
			},
			surroundingText: this.value,
			selection: { start: selection.start, end: selection.end },
			multiline: this.multiline,
		};
	}

	refresh(ensureCaret: boolean): void {
		const inner = this.innerSize();
		this.layoutSnapshot = this.editor.layout({
			width: inner.width,
			lineHeight: this.inputStyle.lineHeight,
			font: this.multiline ? this.font : undefined,
			measureText: this.measure,
		});
		if (ensureCaret) this.editor.ensureCaretVisible(this.layoutSnapshot, { ...inner, margin: 3 });
		else this.editor.setScroll(this.editor.state.scrollX, this.editor.state.scrollY, this.layoutSnapshot, inner);
		this.draw();
	}

	destroy(options?: any): void {
		this.stopDragging();
		this.host.unregister(this);
		super.destroy(options ?? { children: true });
	}

	private change(userInput: boolean, mutate: () => unknown): void {
		const beforeValue = this.value;
		const beforeSelection = this.selectionKey();
		if (mutate() !== false) this.host.didChange(this, beforeValue, beforeSelection, userInput);
	}
	private syncView(): void { this.refresh(true); this.host.syncFocused(); }
	private innerSize() {
		const padding = this.inputStyle.padding;
		return { width: Math.max(1, this.inputWidth - padding * 2), height: Math.max(1, this.inputHeight - padding * 2) };
	}
	private updateHitArea(): void { this.hitArea = new Rectangle(0, 0, this.inputWidth, this.inputHeight); }
	private layoutToLocal(x: number, y: number) {
		const inner = this.innerSize();
		const vertical = this.multiline ? 0 : Math.max(0, (inner.height - this.inputStyle.lineHeight) / 2);
		return { x: this.inputStyle.padding + x - this.editor.state.scrollX,
			y: this.inputStyle.padding + vertical + y - this.editor.state.scrollY };
	}
	private localToLayout(x: number, y: number) {
		const inner = this.innerSize();
		const vertical = this.multiline ? 0 : Math.max(0, (inner.height - this.inputStyle.lineHeight) / 2);
		return { x: x - this.inputStyle.padding + this.editor.state.scrollX,
			y: y - this.inputStyle.padding - vertical + this.editor.state.scrollY };
	}
	private draw(): void {
		const style = this.inputStyle;
		const inner = this.innerSize();
		this.background.clear().roundRect(0, 0, this.inputWidth, this.inputHeight, 8)
			.fill({ color: style.backgroundColor }).stroke({ color: style.borderColor, width: 1 });
		this.focusLayer.clear();
		if (this.focusedState) this.focusLayer.roundRect(0, 0, this.inputWidth, this.inputHeight, 8)
			.stroke({ color: style.focusColor, width: 2 });
		this.clip.clear().rect(style.padding, style.padding, inner.width, inner.height).fill({ color: 0xffffff });
		this.alpha = this._disabled ? 0.55 : 1;
		const view = this.editor.view;
		if (this.multiline) {
			const visible = this.layoutSnapshot.lines.filter((line) =>
				line.y + line.height >= this.editor.state.scrollY - line.height
				&& line.y <= this.editor.state.scrollY + inner.height + line.height);
			const first = visible[0] ?? this.layoutSnapshot.lines[0]!;
			this.textNode.text = visible.map((line) => line.text).join("\n");
			const position = this.layoutToLocal(0, first.y);
			this.textNode.position.set(position.x, position.y);
		} else {
			const left = this.layoutSnapshot.pointToOffset(Math.max(0, this.editor.state.scrollX - 32), 0).offset;
			const right = this.layoutSnapshot.pointToOffset(this.editor.state.scrollX + inner.width + 32, 0).offset;
			this.textNode.text = view.text.slice(left, Math.max(left, right));
			const position = this.layoutToLocal(this.layoutSnapshot.offsetToCaret(left).x, 0);
			this.textNode.position.set(position.x, position.y);
		}
		this.placeholderNode.visible = view.text.length === 0 && this.placeholder.length > 0;
		const placeholderPosition = this.layoutToLocal(0, 0);
		this.placeholderNode.position.set(placeholderPosition.x, placeholderPosition.y);
		this.selectionLayer.clear();
		for (const rect of this.layoutSnapshot.rangeToRects(view.selection.start, view.selection.end)) {
			const position = this.layoutToLocal(rect.x, rect.y);
			this.selectionLayer.rect(position.x, position.y, rect.width, rect.height)
				.fill({ color: style.selectionColor, alpha: 0.8 });
		}
		this.compositionLayer.clear();
		if (view.composition) for (const rect of this.layoutSnapshot.rangeToRects(view.composition.start, view.composition.end)) {
			const position = this.layoutToLocal(rect.x, rect.y);
			this.compositionLayer.rect(position.x, position.y + rect.height - 2, Math.max(1, rect.width), 2)
				.fill({ color: style.focusColor });
		}
		this.drawCaret();
	}

	private drawCaret(): void {
		this.caretLayer.clear();
		const view = this.editor.view;
		if (!this.focusedState || !this.caretVisible || view.selection.start !== view.selection.end) return;
		const caret = this.layoutSnapshot.offsetToCaret(view.caret, this.editor.state.affinity);
		const position = this.layoutToLocal(caret.x, caret.y);
		this.caretLayer.rect(position.x, position.y, 1.5, caret.height).fill({ color: this.inputStyle.caretColor });
	}
	private eventLocal(event: any) { return event.getLocalPosition?.(this) ?? this.toLocal(event.global); }
	private onPointerDown = (event: any) => {
		if (this._disabled || (event.button !== undefined && event.button !== 0)) return;
		this.focus();
		if (this.editor.cancelComposition()) this.refresh(false);
		const local = this.eventLocal(event);
		const layoutPoint = this.localToLayout(local.x, local.y);
		const point = this.layoutSnapshot.pointToOffset(layoutPoint.x, layoutPoint.y);
		const beforeValue = this.value;
		const beforeSelection = this.selectionKey();
		if (Number(event.detail) >= 3) {
			const line = this.layoutSnapshot.lines[this.layoutSnapshot.offsetToCaret(point.offset, point.affinity).lineIndex]!;
			this.editor.setSelection(line.start, line.end + (line.hardBreak ? 1 : 0), point.affinity);
		} else if (Number(event.detail) === 2) {
			const range = this.editor.wordRangeAt(point.offset);
			this.editor.setSelection(range.start, range.end, point.affinity);
		} else if (event.shiftKey) {
			this.editor.setSelection(this.editor.state.anchor, point.offset, point.affinity);
		} else {
			this.editor.setSelection(point.offset, point.offset, point.affinity);
		}
		this.dragAnchor = this.editor.state.anchor;
		this.dragging = true;
		this.dragPoint = local;
		this.host.didChange(this, beforeValue, beforeSelection, false);
	};

	private onPointerMove = (event: any) => {
		if (!this.dragging) return;
		this.dragPoint = this.eventLocal(event);
		this.dragStep();
		const outside = this.dragPoint.x < 0 || this.dragPoint.x > this.inputWidth
			|| this.dragPoint.y < 0 || this.dragPoint.y > this.inputHeight;
		if (outside && !this.dragTimer) this.dragTimer = setInterval(() => this.dragStep(), 16);
		else if (!outside && this.dragTimer) { clearInterval(this.dragTimer); this.dragTimer = undefined; }
	};
	private onPointerEnd = () => this.stopDragging();
	private onWheel = (event: any) => {
		if (!this.multiline || this._disabled) return;
		this.editor.scrollBy(0, Number(event.deltaY ?? 0) * this.inputStyle.lineHeight * 3,
			this.layoutSnapshot, this.innerSize());
		this.refresh(false);
		this.host.syncFocused();
	};
	private dragStep(): void {
		if (!this.dragging) return;
		const edgeX = this.dragPoint.x < 0 ? this.dragPoint.x
			: this.dragPoint.x > this.inputWidth ? this.dragPoint.x - this.inputWidth : 0;
		const edgeY = this.dragPoint.y < 0 ? this.dragPoint.y
			: this.dragPoint.y > this.inputHeight ? this.dragPoint.y - this.inputHeight : 0;
		const speed = (distance: number) => Math.sign(distance) * Math.min(32, Math.max(2, Math.abs(distance) / 4));
		this.editor.scrollBy(speed(edgeX), speed(edgeY), this.layoutSnapshot, this.innerSize());
		const point = this.localToLayout(this.dragPoint.x, this.dragPoint.y);
		const hit = this.layoutSnapshot.pointToOffset(point.x, point.y);
		const beforeValue = this.value;
		const beforeSelection = this.selectionKey();
		this.editor.setSelection(this.dragAnchor, hit.offset, hit.affinity);
		this.host.didChange(this, beforeValue, beforeSelection, false);
	}
	private stopDragging(): void {
		this.dragging = false;
		if (this.dragTimer) clearInterval(this.dragTimer);
		this.dragTimer = undefined;
	}
}

export const createTextInputHost = (options: TextInputHostOptions) => new TextInputHost(options);
