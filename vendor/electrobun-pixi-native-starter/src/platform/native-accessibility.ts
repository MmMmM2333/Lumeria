export const nativeProviderAvailable = false;

export interface AccessibilityBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type AccessibilityValue = string | number;

export interface AccessibilityNode {
	id: string;
	parent: string | null;
	role: string;
	name: string;
	description?: string;
	value?: string;
	bounds: AccessibilityBounds;
	focused?: boolean;
	disabled?: boolean;
	selected?: boolean;
	checked?: boolean;
	min?: number;
	max?: number;
	current?: number;
	invoke?: () => void | Promise<void>;
	toggle?: () => void | Promise<void>;
	setValue?: (value: AccessibilityValue) => void | Promise<void>;
	focus?: () => void | Promise<void>;
}

export type AccessibilityActionName = "invoke" | "toggle" | "setValue" | "focus";

export type AccessibilityAction =
	| { type: "invoke" }
	| { type: "toggle" }
	| { type: "setValue"; value: AccessibilityValue }
	| { type: "focus" };

export interface AccessibilityNodeSnapshot {
	id: string;
	parent: string | null;
	childIndex: number;
	role: string;
	name: string;
	description?: string;
	value?: string;
	bounds: AccessibilityBounds;
	focused?: boolean;
	disabled?: boolean;
	selected?: boolean;
	checked?: boolean;
	min?: number;
	max?: number;
	current?: number;
	actions: readonly AccessibilityActionName[];
}

export type AccessibilityChange =
	| { type: "add"; node: AccessibilityNodeSnapshot }
	| { type: "update"; id: string; changes: Partial<AccessibilityNodeSnapshot> }
	| { type: "remove"; id: string }
	| { type: "focus"; previous: string | null; current: string | null }
	| {
		type: "value";
		id: string;
		previous: { value?: string; current?: number };
		current: { value?: string; current?: number };
	};

export type AccessibilityNavigation = "parent" | "firstChild" | "next" | "previous";

type StoredNode = AccessibilityNode & { bounds: AccessibilityBounds };
type Listener = (changes: readonly AccessibilityChange[]) => void;

const actionNames: readonly AccessibilityActionName[] = ["invoke", "toggle", "setValue", "focus"];
const dedicatedChanges = new Set<keyof AccessibilityNodeSnapshot>(["focused", "value", "current"]);

function cloneNode(node: AccessibilityNode): StoredNode {
	return { ...node, bounds: { ...node.bounds } };
}

function actionsFor(node: AccessibilityNode): readonly AccessibilityActionName[] {
	return actionNames.filter((name) => typeof node[name] === "function");
}

function same(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (Array.isArray(left) && Array.isArray(right)) {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}
	if (left && right && typeof left === "object" && typeof right === "object") {
		const leftRecord = left as Record<string, unknown>;
		const rightRecord = right as Record<string, unknown>;
		const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
		return [...keys].every((key) => leftRecord[key] === rightRecord[key]);
	}
	return false;
}

function validateBounds(id: string, bounds: AccessibilityBounds): void {
	if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
		|| bounds.width < 0 || bounds.height < 0) {
		throw new Error(`Accessibility node "${id}" has invalid bounds`);
	}
}

function validateNodes(nodes: readonly AccessibilityNode[]): Map<string, StoredNode> {
	const byId = new Map<string, StoredNode>();
	let focused = 0;
	for (const node of nodes) {
		if (!node.id) throw new Error("Accessibility node id must not be empty");
		if (byId.has(node.id)) throw new Error(`Duplicate accessibility node id "${node.id}"`);
		validateBounds(node.id, node.bounds);
		if (node.focused) focused++;
		byId.set(node.id, cloneNode(node));
	}
	if (focused > 1) throw new Error("Accessibility tree may contain only one focused node");
	for (const node of byId.values()) {
		if (node.parent !== null && !byId.has(node.parent)) {
			throw new Error(`Accessibility node "${node.id}" has missing parent "${node.parent}"`);
		}
	}
	const complete = new Set<string>();
	for (const node of byId.values()) {
		const path = new Set<string>();
		let cursor: StoredNode | undefined = node;
		while (cursor && !complete.has(cursor.id)) {
			if (path.has(cursor.id)) throw new Error(`Accessibility tree contains a cycle at "${cursor.id}"`);
			path.add(cursor.id);
			cursor = cursor.parent === null ? undefined : byId.get(cursor.parent);
		}
		for (const id of path) complete.add(id);
	}
	return byId;
}

function orderedIds(nodes: readonly AccessibilityNode[], byId: ReadonlyMap<string, StoredNode>): string[] {
	const children = new Map<string | null, string[]>();
	for (const node of nodes) {
		const siblings = children.get(node.parent) ?? [];
		siblings.push(node.id);
		children.set(node.parent, siblings);
	}
	const ordered: string[] = [];
	const visit = (id: string) => {
		ordered.push(id);
		for (const child of children.get(id) ?? []) visit(child);
	};
	for (const root of children.get(null) ?? []) visit(root);
	if (ordered.length !== byId.size) throw new Error("Accessibility tree contains no reachable root");
	return ordered;
}

function childIndices(nodes: readonly AccessibilityNode[]): Map<string, number> {
	const counts = new Map<string | null, number>();
	const indices = new Map<string, number>();
	for (const node of nodes) {
		const index = counts.get(node.parent) ?? 0;
		indices.set(node.id, index);
		counts.set(node.parent, index + 1);
	}
	return indices;
}

function toSnapshot(node: StoredNode, childIndex: number, scale = 1): AccessibilityNodeSnapshot {
	const bounds = scale === 1 ? { ...node.bounds } : {
		x: node.bounds.x * scale,
		y: node.bounds.y * scale,
		width: node.bounds.width * scale,
		height: node.bounds.height * scale,
	};
	return {
		id: node.id,
		parent: node.parent,
		childIndex,
		role: node.role,
		name: node.name,
		...(node.description === undefined ? {} : { description: node.description }),
		...(node.value === undefined ? {} : { value: node.value }),
		bounds,
		...(node.focused === undefined ? {} : { focused: node.focused }),
		...(node.disabled === undefined ? {} : { disabled: node.disabled }),
		...(node.selected === undefined ? {} : { selected: node.selected }),
		...(node.checked === undefined ? {} : { checked: node.checked }),
		...(node.min === undefined ? {} : { min: node.min }),
		...(node.max === undefined ? {} : { max: node.max }),
		...(node.current === undefined ? {} : { current: node.current }),
		actions: actionsFor(node),
	};
}

export function createAccessibilityTree() {
	let nodes = new Map<string, StoredNode>();
	let order: string[] = [];
	let indices = new Map<string, number>();
	let destroyed = false;
	const listeners = new Set<Listener>();
	const alive = () => {
		if (destroyed) throw new Error("Accessibility tree has been destroyed");
	};
	const snapshotFor = (id: string, scale = 1) => {
		const node = nodes.get(id);
		if (!node) throw new Error(`Unknown accessibility node "${id}"`);
		return toSnapshot(node, indices.get(id) ?? 0, scale);
	};
	const focusedId = (source: ReadonlyMap<string, StoredNode>) =>
		[...source.values()].find((node) => node.focused)?.id ?? null;

	return {
		replaceTree(next: readonly AccessibilityNode[]): readonly AccessibilityChange[] {
			alive();
			const nextNodes = validateNodes(next);
			const nextOrder = orderedIds(next, nextNodes);
			const nextIndices = childIndices(next);
			const changes: AccessibilityChange[] = [];
			for (const id of [...order].reverse()) {
				if (!nextNodes.has(id)) changes.push({ type: "remove", id });
			}
			for (const id of nextOrder) {
				const nextNode = nextNodes.get(id)!;
				const nextSnapshot = toSnapshot(nextNode, nextIndices.get(id) ?? 0);
				const previousNode = nodes.get(id);
				if (!previousNode) {
					changes.push({ type: "add", node: nextSnapshot });
					continue;
				}
				const previousSnapshot = toSnapshot(previousNode, indices.get(id) ?? 0);
				const update: Partial<AccessibilityNodeSnapshot> = {};
				const keys = Object.keys({ ...previousSnapshot, ...nextSnapshot }) as (keyof AccessibilityNodeSnapshot)[];
				for (const key of keys) {
					if (!dedicatedChanges.has(key) && !same(previousSnapshot[key], nextSnapshot[key])) {
						(update as Record<string, unknown>)[key] = nextSnapshot[key];
					}
				}
				if (Object.keys(update).length) changes.push({ type: "update", id, changes: update });
				if (previousNode.value !== nextNode.value || previousNode.current !== nextNode.current) {
					changes.push({
						type: "value",
						id,
						previous: { value: previousNode.value, current: previousNode.current },
						current: { value: nextNode.value, current: nextNode.current },
					});
				}
			}
			const previousFocus = focusedId(nodes);
			const nextFocus = focusedId(nextNodes);
			if (previousFocus !== nextFocus) {
				changes.push({ type: "focus", previous: previousFocus, current: nextFocus });
			}
			nodes = nextNodes;
			order = nextOrder;
			indices = nextIndices;
			if (changes.length) for (const listener of [...listeners]) listener(changes);
			return changes;
		},

		snapshot(): readonly AccessibilityNodeSnapshot[] {
			alive();
			return order.map((id) => snapshotFor(id));
		},

		physicalSnapshot(scale: number): readonly AccessibilityNodeSnapshot[] {
			alive();
			if (!Number.isFinite(scale) || scale <= 0) throw new Error("Accessibility scale must be positive");
			return order.map((id) => snapshotFor(id, scale));
		},

		hitTest(x: number, y: number): AccessibilityNodeSnapshot | null {
			alive();
			for (let index = order.length - 1; index >= 0; index--) {
				const node = nodes.get(order[index]!)!;
				const bounds = node.bounds;
				if (x >= bounds.x && y >= bounds.y
					&& x < bounds.x + bounds.width && y < bounds.y + bounds.height) {
					return snapshotFor(node.id);
				}
			}
			return null;
		},

		navigate(id: string | null, direction: AccessibilityNavigation): AccessibilityNodeSnapshot | null {
			alive();
			if (id === null) {
				const target = direction === "previous" ? order.at(-1) : order[0];
				return target ? snapshotFor(target) : null;
			}
			const node = nodes.get(id);
			if (!node) return null;
			let target: string | undefined;
			if (direction === "parent") target = node.parent ?? undefined;
			else if (direction === "firstChild") target = order.find((candidate) => nodes.get(candidate)?.parent === id);
			else {
				const position = order.indexOf(id) + (direction === "next" ? 1 : -1);
				target = order[position];
			}
			return target ? snapshotFor(target) : null;
		},

		dispatch(id: string, action: AccessibilityAction): void | Promise<void> {
			alive();
			const node = nodes.get(id);
			if (!node) throw new Error(`Unknown accessibility node "${id}"`);
			const handler = node[action.type];
			if (typeof handler !== "function") {
				throw new Error(`Accessibility node "${id}" does not support ${action.type}`);
			}
			return action.type === "setValue" ? node.setValue!(action.value) : (handler as () => void | Promise<void>)();
		},

		subscribe(listener: Listener): () => void {
			alive();
			listeners.add(listener);
			return () => listeners.delete(listener);
		},

		destroy(): void {
			if (destroyed) return;
			destroyed = true;
			listeners.clear();
			nodes.clear();
			order = [];
			indices.clear();
		},
	};
}

export type NativeAccessibilityStore = ReturnType<typeof createAccessibilityTree>;

export interface NativeAccessibilityActionEvent {
	route: bigint;
	nodeId: bigint;
	action: 1 | 2 | 3 | 4;
	code: number;
	data: Uint8Array;
}

export interface NativeAccessibilityHost {
	uiaProviderAvailable(): boolean;
	attachAccessibility(window: number, route: bigint): number;
	updateAccessibilitySnapshot(window: number, snapshot: Uint8Array): number;
	pollAccessibilityAction(route?: bigint): NativeAccessibilityActionEvent | null;
	detachAccessibility(window: number): number;
}

export interface NativeAccessibilityBridgeOptions {
	nativeHost: NativeAccessibilityHost;
	windowHandle: number;
	route: bigint;
	scale: number | (() => number);
	store?: NativeAccessibilityStore;
}

const MAX_NATIVE_NODES = 65535;
const MAX_NATIVE_SNAPSHOT_BYTES = 4 * 1024 * 1024;
const U64_MASK = 0xffff_ffff_ffff_ffffn;
const roleCodes: Readonly<Record<string, number>> = Object.freeze({
	application: 1,
	window: 2,
	group: 3,
	button: 4,
	checkbox: 5,
	radio: 6,
	textbox: 7,
	statictext: 8,
	text: 8,
	image: 9,
	link: 10,
	list: 11,
	listitem: 12,
	menu: 13,
	menuitem: 14,
	tablist: 15,
	tab: 16,
	slider: 17,
	progressbar: 18,
	dialog: 19,
	separator: 20,
});

function hashAccessibilityId(id: string, encoder: TextEncoder): bigint {
	let hash = 0xcbf2_9ce4_8422_2325n;
	for (const byte of encoder.encode(id)) hash = ((hash ^ BigInt(byte)) * 0x100_0000_01b3n) & U64_MASK;
	return hash || 1n;
}

function i32(value: number, field: string): number {
	const rounded = Math.round(value);
	if (!Number.isSafeInteger(rounded) || rounded < -0x8000_0000 || rounded > 0x7fff_ffff) {
		throw new RangeError(`accessibility ${field} must fit i32`);
	}
	return rounded;
}

export function createNativeAccessibilityBridge({
	nativeHost,
	windowHandle,
	route,
	scale,
	store = createAccessibilityTree(),
}: NativeAccessibilityBridgeOptions) {
	if (typeof route !== "bigint" || route <= 0n || route > U64_MASK) {
		throw new RangeError("accessibility route must be a non-zero u64");
	}
	const providerAvailable = nativeHost.uiaProviderAvailable();
	if (providerAvailable !== nativeProviderAvailable) {
		throw new Error(`native UIA provider mismatch: expected ${nativeProviderAvailable}, got ${providerAvailable}`);
	}
	const attached = nativeHost.attachAccessibility(windowHandle, route);
	if (attached <= 0) throw new Error(`attach native accessibility failed (${attached})`);

	const encoder = new TextEncoder();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	const nativeById = new Map<string, bigint>();
	const idByNative = new Map<bigint, string>();
	let closed = false;
	const idFor = (id: string) => {
		const existing = nativeById.get(id);
		if (existing !== undefined) return existing;
		let candidate = hashAccessibilityId(id, encoder);
		while (idByNative.has(candidate) && idByNative.get(candidate) !== id) {
			candidate = (candidate + 1n) & U64_MASK || 1n;
		}
		nativeById.set(id, candidate);
		idByNative.set(candidate, id);
		return candidate;
	};
	const currentScale = () => typeof scale === "function" ? scale() : scale;
	const encodeSnapshot = () => {
		const nodes = store.physicalSnapshot(currentScale());
		if (nodes.length > MAX_NATIVE_NODES) {
			throw new RangeError(`accessibility snapshot exceeds ${MAX_NATIVE_NODES} nodes`);
		}
		for (const node of nodes) idFor(node.id);
		const strings = nodes.map((node) => ({
			name: encoder.encode(node.name),
			value: encoder.encode(node.value ?? (node.current === undefined ? "" : String(node.current))),
		}));
		const recordsEnd = 16 + nodes.length * 64;
		const total = strings.reduce((length, item) => length + item.name.length + item.value.length, recordsEnd);
		if (total > MAX_NATIVE_SNAPSHOT_BYTES) {
			throw new RangeError(`accessibility snapshot exceeds ${MAX_NATIVE_SNAPSHOT_BYTES} bytes`);
		}
		const bytes = new Uint8Array(total);
		const view = new DataView(bytes.buffer);
		bytes.set([0x41, 0x31, 0x31, 0x59]);
		view.setUint16(4, 1, true);
		view.setUint32(8, nodes.length, true);
		view.setUint32(12, total, true);
		let arenaOffset = recordsEnd;
		for (let index = 0; index < nodes.length; index++) {
			const node = nodes[index]!;
			const text = strings[index]!;
			const base = 16 + index * 64;
			view.setBigUint64(base, idFor(node.id), true);
			view.setBigUint64(base + 8, node.parent === null ? 0n : idFor(node.parent), true);
			view.setUint32(base + 16, roleCodes[node.role.toLowerCase()] ?? 0, true);
			const state = (node.focused ? 1 : 0) | (node.disabled ? 2 : 0)
				| (node.selected ? 4 : 0) | (node.checked ? 8 : 0);
			const actions = (node.actions.includes("invoke") ? 1 : 0)
				| (node.actions.includes("toggle") ? 2 : 0)
				| (node.actions.includes("setValue") ? 4 : 0)
				| (node.actions.includes("focus") ? 8 : 0);
			view.setUint32(base + 20, state, true);
			view.setUint32(base + 24, actions, true);
			view.setInt32(base + 28, i32(node.bounds.x, `${node.id}.x`), true);
			view.setInt32(base + 32, i32(node.bounds.y, `${node.id}.y`), true);
			view.setInt32(base + 36, i32(node.bounds.width, `${node.id}.width`), true);
			view.setInt32(base + 40, i32(node.bounds.height, `${node.id}.height`), true);
			if (text.name.length) {
				view.setUint32(base + 44, arenaOffset, true);
				view.setUint32(base + 48, text.name.length, true);
				bytes.set(text.name, arenaOffset);
				arenaOffset += text.name.length;
			}
			if (text.value.length) {
				view.setUint32(base + 52, arenaOffset, true);
				view.setUint32(base + 56, text.value.length, true);
				bytes.set(text.value, arenaOffset);
				arenaOffset += text.value.length;
			}
		}
		return bytes;
	};
	const sync = () => {
		if (closed) throw new Error("Native accessibility bridge has been destroyed");
		const status = nativeHost.updateAccessibilitySnapshot(windowHandle, encodeSnapshot());
		if (status <= 0) throw new Error(`update native accessibility snapshot failed (${status})`);
	};
	const unsubscribe = store.subscribe(sync);
	try {
		sync();
	} catch (error) {
		unsubscribe();
		nativeHost.detachAccessibility(windowHandle);
		throw error;
	}

	return {
		store,
		providerAvailable,
		sync,
		async pollActions(limit = 64): Promise<number> {
			if (closed) throw new Error("Native accessibility bridge has been destroyed");
			if (!Number.isInteger(limit) || limit < 1 || limit > 256) {
				throw new RangeError("accessibility action poll limit must be 1..256");
			}
			let count = 0;
			while (count < limit) {
				const event = nativeHost.pollAccessibilityAction(route);
				if (!event) break;
				if (event.route !== route) throw new Error(`native accessibility action route mismatch (${event.route})`);
				if (event.code !== 0) throw new Error(`native accessibility action failed (${event.code})`);
				const id = idByNative.get(event.nodeId);
				if (!id) throw new Error(`native accessibility action references unknown node ${event.nodeId}`);
				let action: AccessibilityAction;
				if (event.action === 1) action = { type: "invoke" };
				else if (event.action === 2) action = { type: "toggle" };
				else if (event.action === 3) action = { type: "setValue", value: decoder.decode(event.data) };
				else action = { type: "focus" };
				if (event.action !== 3 && event.data.byteLength !== 0) {
					throw new Error(`native accessibility action ${event.action} has unexpected data`);
				}
				await store.dispatch(id, action);
				count++;
			}
			return count;
		},
		destroy(): void {
			if (closed) return;
			closed = true;
			unsubscribe();
			const status = nativeHost.detachAccessibility(windowHandle);
			if (status < 0) throw new Error(`detach native accessibility failed (${status})`);
		},
	};
}
