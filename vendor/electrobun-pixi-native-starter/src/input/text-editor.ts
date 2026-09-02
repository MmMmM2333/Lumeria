import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";

export type TextAffinity = "upstream" | "downstream";

export interface TextSelection {
	anchor: number;
	focus: number;
	start: number;
	end: number;
}

export interface TextComposition {
	text: string;
	replaceStart: number;
	replaceEnd: number;
	caretUtf16: number;
	anchor: number;
	focus: number;
}

export interface TextEditorState {
	value: string;
	anchor: number;
	focus: number;
	affinity: TextAffinity;
	preferredX?: number;
	composition?: Readonly<TextComposition>;
	scrollX: number;
	scrollY: number;
}

export interface TextEditorView {
	text: string;
	selection: Readonly<TextSelection>;
	caret: number;
	composition?: Readonly<{ start: number; end: number; caret: number }>;
}

export interface TextRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface TextCaret extends TextRect {
	offset: number;
	lineIndex: number;
	affinity: TextAffinity;
}

export interface TextLayoutLine {
	start: number;
	end: number;
	text: string;
	width: number;
	y: number;
	height: number;
	hardBreak: boolean;
}

export interface TextEditorLayout {
	readonly text: string;
	readonly lines: readonly Readonly<TextLayoutLine>[];
	readonly contentWidth: number;
	readonly contentHeight: number;
	offsetToCaret(offset: number, affinity?: TextAffinity): TextCaret;
	pointToOffset(x: number, y: number): { offset: number; affinity: TextAffinity };
	rangeToRects(start: number, end: number): TextRect[];
}

export interface TextLayoutOptions {
	width: number;
	lineHeight: number;
	font?: string;
	measureText(text: string): number;
}

export interface TextViewport {
	width: number;
	height: number;
	margin?: number;
}

export type TextEditorCommand =
	| { type: "insert"; text: string; history?: "typing" | "paste" | "cut" | "ime" }
	| { type: "backspace"; word?: boolean }
	| { type: "delete"; word?: boolean }
	| { type: "move-horizontal"; direction: -1 | 1; extend?: boolean; word?: boolean }
	| { type: "move-vertical"; direction: -1 | 1; extend?: boolean; lines?: number }
	| { type: "move-line-boundary"; edge: "start" | "end"; extend?: boolean; document?: boolean }
	| { type: "select-all" }
	| { type: "undo" }
	| { type: "redo" };

export interface TextEditorOptions {
	value?: string;
	multiline?: boolean;
	maxLength?: number;
}

type HistoryKind = "typing" | "newline" | "paste" | "cut" | "ime" | "backspace" | "delete";
type HistorySnapshot = { value: string; anchor: number; focus: number; affinity: TextAffinity };

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

function boundaries(text: string): number[] {
	const result = [0];
	for (const part of graphemeSegmenter.segment(text)) result.push(part.index + part.segment.length);
	return result;
}

function nearestBoundary(text: string, offset: number): number {
	const target = Math.max(0, Math.min(text.length, Math.trunc(offset)));
	const points = boundaries(text);
	for (let index = 1; index < points.length; index++) {
		if (points[index]! >= target) {
			const before = points[index - 1]!;
			const after = points[index]!;
			return target - before <= after - target ? before : after;
		}
	}
	return text.length;
}

function adjacentBoundary(text: string, offset: number, direction: -1 | 1): number {
	const points = boundaries(text);
	if (direction < 0) {
		for (let index = points.length - 1; index >= 0; index--) {
			if (points[index]! < offset) return points[index]!;
		}
		return 0;
	}
	return points.find((point) => point > offset) ?? text.length;
}

function truncateAtBoundary(text: string, maxUtf16: number): string {
	if (text.length <= maxUtf16) return text;
	let end = 0;
	for (const part of graphemeSegmenter.segment(text)) {
		const next = part.index + part.segment.length;
		if (next > maxUtf16) break;
		end = next;
	}
	return text.slice(0, end);
}

function wordBoundary(text: string, offset: number, direction: -1 | 1): number {
	const words = [...wordSegmenter.segment(text)].filter((part) => part.isWordLike);
	if (direction > 0) return words.find((part) => part.index > offset)?.index ?? text.length;
	for (let index = words.length - 1; index >= 0; index--) {
		if (words[index]!.index < offset) return words[index]!.index;
	}
	return 0;
}

function measuredLines(
	text: string,
	multiline: boolean,
	width: number,
	lineHeight: number,
	measureText: (text: string) => number,
): TextLayoutLine[] {
	if (!multiline) return [{
		start: 0, end: text.length, text, width: measureText(text),
		y: 0, height: lineHeight, hardBreak: false,
	}];
	const lines: TextLayoutLine[] = [];
	let paragraphStart = 0;
	for (let newline = text.indexOf("\n");; newline = text.indexOf("\n", paragraphStart)) {
		const paragraphEnd = newline < 0 ? text.length : newline;
		const paragraph = text.slice(paragraphStart, paragraphEnd);
		let lineStart = paragraphStart;
		let lineText = "";
		if (paragraph.length > 0) {
			for (const part of graphemeSegmenter.segment(paragraph)) {
				const candidate = lineText + part.segment;
				if (lineText && measureText(candidate) > width) {
					lines.push({
						start: lineStart,
						end: paragraphStart + part.index,
						text: lineText,
						width: measureText(lineText),
						y: 0,
						height: lineHeight,
						hardBreak: false,
					});
					lineStart = paragraphStart + part.index;
					lineText = part.segment;
				} else {
					lineText = candidate;
				}
			}
		}
		lines.push({
			start: lineStart,
			end: paragraphEnd,
			text: lineText,
			width: measureText(lineText),
			y: 0,
			height: lineHeight,
			hardBreak: newline >= 0,
		});
		if (newline < 0) break;
		paragraphStart = newline + 1;
	}
	return lines.map((line, index) => ({ ...line, y: index * lineHeight }));
}

function pretextLines(text: string, font: string, width: number, lineHeight: number): TextLayoutLine[] {
	const result = layoutWithLines(
		prepareWithSegments(text, font, { whiteSpace: "pre-wrap" }),
		width,
		lineHeight,
	);
	if (result.lines.length === 0) return [{
		start: 0, end: 0, text: "", width: 0, y: 0, height: lineHeight, hardBreak: false,
	}];
	let cursor = 0;
	const lines = result.lines.map((line, index) => {
		const found = text.indexOf(line.text, cursor);
		const start = text.startsWith(line.text, cursor) ? cursor : found < 0 ? cursor : found;
		const end = start + line.text.length;
		const hardBreak = text[end] === "\n";
		cursor = end + (hardBreak ? 1 : 0);
		return { start, end, text: line.text, width: line.width, y: index * lineHeight, height: lineHeight, hardBreak };
	});
	if (text.endsWith("\n") && lines[lines.length - 1]?.start !== text.length) {
		lines.push({
			start: text.length, end: text.length, text: "", width: 0,
			y: lines.length * lineHeight, height: lineHeight, hardBreak: false,
		});
	}
	return lines;
}

function createLayout(text: string, lines: TextLayoutLine[], measureText: (text: string) => number): TextEditorLayout {
	const contentWidth = Math.max(0, ...lines.map((line) => line.width));
	const contentHeight = lines.reduce((height, line) => Math.max(height, line.y + line.height), 0);
	const lineForOffset = (rawOffset: number, affinity: TextAffinity) => {
		const offset = Math.max(0, Math.min(text.length, Math.trunc(rawOffset)));
		const matches = lines.filter((line) => offset >= line.start && offset <= line.end);
		if (matches.length > 1) return affinity === "upstream" ? matches[0]! : matches[matches.length - 1]!;
		return matches[0] ?? lines.find((line) => offset < line.start) ?? lines[lines.length - 1]!;
	};
	const offsetToCaret = (rawOffset: number, affinity: TextAffinity = "downstream"): TextCaret => {
		const offset = Math.max(0, Math.min(text.length, Math.trunc(rawOffset)));
		const line = lineForOffset(offset, affinity);
		const lineIndex = lines.indexOf(line);
		const localOffset = Math.max(0, Math.min(line.text.length, offset - line.start));
		return {
			x: measureText(line.text.slice(0, localOffset)), y: line.y, width: 1, height: line.height,
			offset, lineIndex, affinity,
		};
	};
	return {
		text,
		lines,
		contentWidth,
		contentHeight,
		offsetToCaret,
		pointToOffset(x, y) {
			const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(y / lines[0]!.height)));
			const line = lines[lineIndex]!;
			const points = boundaries(line.text);
			let localOffset = 0;
			for (let index = 1; index < points.length; index++) {
				const before = points[index - 1]!;
				const after = points[index]!;
				const midpoint = (measureText(line.text.slice(0, before)) + measureText(line.text.slice(0, after))) / 2;
				if (x < midpoint) break;
				localOffset = after;
			}
			const offset = line.start + localOffset;
			const softEnd = localOffset === line.text.length && lineIndex + 1 < lines.length
				&& !line.hardBreak && lines[lineIndex + 1]!.start === line.end;
			return { offset, affinity: softEnd ? "upstream" : "downstream" };
		},
		rangeToRects(rawStart, rawEnd) {
			const start = Math.max(0, Math.min(text.length, Math.trunc(Math.min(rawStart, rawEnd))));
			const end = Math.max(start, Math.min(text.length, Math.trunc(Math.max(rawStart, rawEnd))));
			const rects: TextRect[] = [];
			for (const line of lines) {
				const from = Math.max(start, line.start);
				const to = Math.min(end, line.end);
				const hardBreakSelected = line.hardBreak && start <= line.end && end > line.end;
				if (to <= from && !hardBreakSelected) continue;
				const x = measureText(line.text.slice(0, from - line.start));
				const right = measureText(line.text.slice(0, to - line.start))
					+ (hardBreakSelected ? Math.max(1, measureText(" ")) : 0);
				rects.push({ x, y: line.y, width: right - x, height: line.height });
			}
			return rects;
		},
	};
}

export class TextEditor {
	readonly multiline: boolean;
	readonly maxLength: number;
	private value: string;
	private anchor = 0;
	private focus = 0;
	private affinity: TextAffinity = "downstream";
	private preferredX?: number;
	private composition?: TextComposition;
	private scrollX = 0;
	private scrollY = 0;
	private readonly undoStack: HistorySnapshot[] = [];
	private readonly redoStack: HistorySnapshot[] = [];
	private lastHistoryKind?: HistoryKind;

	constructor(options: TextEditorOptions = {}) {
		this.multiline = options.multiline ?? false;
		if (options.maxLength !== undefined
			&& (!Number.isInteger(options.maxLength) || options.maxLength < 0)) {
			throw new RangeError("maxLength must be a non-negative integer");
		}
		this.maxLength = options.maxLength ?? Number.POSITIVE_INFINITY;
		this.value = truncateAtBoundary(this.normalize(options.value ?? ""), this.maxLength);
		this.anchor = this.focus = this.value.length;
	}

	get state(): Readonly<TextEditorState> {
		return {
			value: this.value,
			anchor: this.anchor,
			focus: this.focus,
			affinity: this.affinity,
			preferredX: this.preferredX,
			composition: this.composition ? { ...this.composition } : undefined,
			scrollX: this.scrollX,
			scrollY: this.scrollY,
		};
	}

	get view(): Readonly<TextEditorView> {
		if (this.composition) {
			const { replaceStart, replaceEnd, text, caretUtf16 } = this.composition;
			const caret = replaceStart + caretUtf16;
			return {
				text: this.value.slice(0, replaceStart) + text + this.value.slice(replaceEnd),
				selection: this.selection(caret, caret),
				caret,
				composition: { start: replaceStart, end: replaceStart + text.length, caret },
			};
		}
		const selection = this.selection(this.anchor, this.focus);
		return { text: this.value, selection, caret: this.focus };
	}

	setValue(value: string): void {
		this.composition = undefined;
		this.value = truncateAtBoundary(this.normalize(value), this.maxLength);
		this.anchor = this.focus = this.value.length;
		this.preferredX = undefined;
		this.undoStack.length = 0;
		this.redoStack.length = 0;
		this.lastHistoryKind = undefined;
	}

	setSelection(anchor: number, focus = anchor, affinity: TextAffinity = "downstream"): void {
		this.anchor = nearestBoundary(this.value, anchor);
		this.focus = nearestBoundary(this.value, focus);
		this.affinity = affinity;
		this.preferredX = undefined;
		this.lastHistoryKind = undefined;
	}

	selectAll(): void {
		this.anchor = 0;
		this.focus = this.value.length;
		this.lastHistoryKind = undefined;
	}

	breakHistoryGroup(): void { this.lastHistoryKind = undefined; }

	wordRangeAt(offset: number): { start: number; end: number } {
		const point = Math.max(0, Math.min(this.value.length, Math.trunc(offset)));
		for (const part of wordSegmenter.segment(this.value)) {
			const end = part.index + part.segment.length;
			if (part.isWordLike && part.index <= point && point < end) {
				return { start: part.index, end };
			}
		}
		const start = nearestBoundary(this.value, point);
		return { start, end: adjacentBoundary(this.value, start, 1) };
	}

	startComposition(): void {
		if (this.composition) return;
		const { start, end } = this.selection(this.anchor, this.focus);
		this.composition = {
			text: "",
			replaceStart: start,
			replaceEnd: end,
			caretUtf16: 0,
			anchor: this.anchor,
			focus: this.focus,
		};
	}

	updateComposition(text: string, caretUtf16 = text.length): void {
		this.startComposition();
		const composition = this.composition!;
		const normalized = this.normalize(text);
		composition.text = normalized;
		composition.caretUtf16 = nearestBoundary(normalized, caretUtf16);
	}

	commitComposition(text?: string): boolean {
		if (!this.composition) {
			if (text === undefined) return false;
			return this.replaceSelection(text);
		}
		const composition = this.composition;
		this.composition = undefined;
		this.anchor = composition.replaceStart;
		this.focus = composition.replaceEnd;
		return this.replaceSelection(text ?? composition.text, "ime");
	}

	cancelComposition(): boolean {
		if (!this.composition) return false;
		const { anchor, focus } = this.composition;
		this.composition = undefined;
		this.anchor = anchor;
		this.focus = focus;
		return true;
	}

	dispatch(command: TextEditorCommand, layout?: TextEditorLayout): boolean {
		if (command.type === "insert") return this.replaceSelection(command.text, command.history ?? "typing");
		if (command.type === "backspace") {
			if (this.anchor !== this.focus) return this.replaceSelection("", "backspace");
			const start = command.word
				? wordBoundary(this.value, this.focus, -1)
				: adjacentBoundary(this.value, this.focus, -1);
			if (start === this.focus) return false;
			const before = this.historySnapshot();
			this.anchor = start;
			return this.replaceSelection("", "backspace", before);
		}
		if (command.type === "delete") {
			if (this.anchor !== this.focus) return this.replaceSelection("", "delete");
			const end = command.word
				? wordBoundary(this.value, this.focus, 1)
				: adjacentBoundary(this.value, this.focus, 1);
			if (end === this.focus) return false;
			const before = this.historySnapshot();
			this.focus = end;
			return this.replaceSelection("", "delete", before);
		}
		if (command.type === "move-horizontal") {
			const { start, end } = this.selection(this.anchor, this.focus);
			const atUpstream = layout?.offsetToCaret(this.focus, "upstream");
			const atDownstream = layout?.offsetToCaret(this.focus, "downstream");
			const atSoftBoundary = atUpstream?.lineIndex !== atDownstream?.lineIndex;
			let next: number;
			if (!command.extend && start !== end) next = command.direction < 0 ? start : end;
			else if (!command.word && atSoftBoundary
				&& ((command.direction > 0 && this.affinity === "upstream")
					|| (command.direction < 0 && this.affinity === "downstream"))) {
				next = this.focus;
				this.affinity = command.direction > 0 ? "downstream" : "upstream";
			} else {
				next = command.word
					? wordBoundary(this.value, this.focus, command.direction)
					: adjacentBoundary(this.value, this.focus, command.direction);
				const nextUpstream = layout?.offsetToCaret(next, "upstream");
				const nextDownstream = layout?.offsetToCaret(next, "downstream");
				this.affinity = nextUpstream?.lineIndex !== nextDownstream?.lineIndex
					? (command.direction > 0 ? "upstream" : "downstream")
					: "downstream";
			}
			this.focus = next;
			if (!command.extend) this.anchor = next;
			this.preferredX = undefined;
			this.lastHistoryKind = undefined;
			return true;
		}
		if (command.type === "move-vertical") {
			if (!layout) return false;
			const caret = layout.offsetToCaret(this.focus, this.affinity);
			this.preferredX ??= caret.x;
			const lineCount = Math.max(1, Math.trunc(command.lines ?? 1));
			const point = layout.pointToOffset(
				this.preferredX,
				caret.y + command.direction * caret.height * lineCount + caret.height / 2,
			);
			this.focus = point.offset;
			this.affinity = point.affinity;
			if (!command.extend) this.anchor = this.focus;
			this.lastHistoryKind = undefined;
			return true;
		}
		if (command.type === "move-line-boundary") {
			let next: number;
			if (command.document) next = command.edge === "start" ? 0 : this.value.length;
			else if (layout) {
				const line = layout.lines[layout.offsetToCaret(this.focus, this.affinity).lineIndex]!;
				next = command.edge === "start" ? line.start : line.end;
			} else {
				const start = this.value.lastIndexOf("\n", Math.max(0, this.focus - 1)) + 1;
				const newline = this.value.indexOf("\n", this.focus);
				next = command.edge === "start" ? start : newline < 0 ? this.value.length : newline;
			}
			this.focus = next;
			this.affinity = command.edge === "end" ? "upstream" : "downstream";
			if (!command.extend) this.anchor = next;
			this.preferredX = undefined;
			this.lastHistoryKind = undefined;
			return true;
		}
		if (command.type === "select-all") {
			this.selectAll();
			return true;
		}
		if (command.type === "undo") return this.restoreHistory(this.undoStack, this.redoStack);
		if (command.type === "redo") return this.restoreHistory(this.redoStack, this.undoStack);
		return false;
	}

	layout(options: TextLayoutOptions): TextEditorLayout {
		if (!Number.isFinite(options.width) || options.width < 0) throw new RangeError("layout width must be non-negative");
		if (!Number.isFinite(options.lineHeight) || options.lineHeight <= 0) throw new RangeError("lineHeight must be positive");
		const text = this.view.text;
		const lines = this.multiline && options.font
			? pretextLines(text, options.font, options.width, options.lineHeight)
			: measuredLines(text, this.multiline, options.width, options.lineHeight, options.measureText);
		return createLayout(text, lines, options.measureText);
	}

	setScroll(x: number, y: number, layout: TextEditorLayout, viewport: TextViewport): void {
		const maxX = Math.max(0, layout.contentWidth - viewport.width);
		const maxY = Math.max(0, layout.contentHeight - viewport.height);
		this.scrollX = this.multiline ? 0 : Math.max(0, Math.min(maxX, x));
		this.scrollY = this.multiline ? Math.max(0, Math.min(maxY, y)) : 0;
	}

	scrollBy(dx: number, dy: number, layout: TextEditorLayout, viewport: TextViewport): void {
		this.setScroll(this.scrollX + dx, this.scrollY + dy, layout, viewport);
	}

	ensureCaretVisible(layout: TextEditorLayout, viewport: TextViewport): void {
		const margin = Math.max(0, Math.min(viewport.margin ?? 0, Math.min(viewport.width, viewport.height) / 2));
		const caret = layout.offsetToCaret(this.view.caret, this.affinity);
		let x = this.scrollX;
		let y = this.scrollY;
		if (caret.x < x + margin) x = caret.x - margin;
		else if (caret.x + caret.width > x + viewport.width - margin) x = caret.x + caret.width - viewport.width + margin;
		if (caret.y < y + margin) y = caret.y - margin;
		else if (caret.y + caret.height > y + viewport.height - margin) y = caret.y + caret.height - viewport.height + margin;
		this.setScroll(x, y, layout, viewport);
	}

	private replaceSelection(text: string, history: HistoryKind = "typing", before?: HistorySnapshot): boolean {
		const { start, end } = this.selection(this.anchor, this.focus);
		const available = this.maxLength - (this.value.length - (end - start));
		const inserted = truncateAtBoundary(this.normalize(text), available);
		const next = this.value.slice(0, start) + inserted + this.value.slice(end);
		if (next === this.value && start === end) return false;
		this.recordHistory(history === "typing" && inserted.includes("\n") ? "newline" : history, before);
		this.value = next;
		this.anchor = this.focus = start + inserted.length;
		this.affinity = "downstream";
		this.preferredX = undefined;
		return true;
	}

	private historySnapshot(): HistorySnapshot {
		return { value: this.value, anchor: this.anchor, focus: this.focus, affinity: this.affinity };
	}

	private recordHistory(kind: HistoryKind, before = this.historySnapshot()): void {
		const merge = kind === "typing" || kind === "backspace" || kind === "delete";
		if (!merge || this.lastHistoryKind !== kind) {
			this.undoStack.push(before);
			if (this.undoStack.length > 100) this.undoStack.shift();
		}
		this.redoStack.length = 0;
		this.lastHistoryKind = merge ? kind : undefined;
	}

	private restoreHistory(from: HistorySnapshot[], to: HistorySnapshot[]): boolean {
		const snapshot = from.pop();
		if (!snapshot) return false;
		to.push(this.historySnapshot());
		this.value = snapshot.value;
		this.anchor = snapshot.anchor;
		this.focus = snapshot.focus;
		this.affinity = snapshot.affinity;
		this.composition = undefined;
		this.preferredX = undefined;
		this.lastHistoryKind = undefined;
		return true;
	}

	private selection(anchor: number, focus: number): TextSelection {
		return { anchor, focus, start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
	}

	private normalize(value: string): string {
		return this.multiline ? value.replace(/\r\n?/g, "\n") : value.replace(/[\r\n]+/g, " ");
	}
}
