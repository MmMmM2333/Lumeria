export interface VisualOwnershipOwnerInput {
  actorKey?: string | null;
  folderId?: string | null;
  kind?: string | null;
  token?: unknown;
}

export interface VisualOwnershipOwner {
  actorKey: string | null;
  folderId: string | null;
  kind: string;
  token: unknown;
}

export interface VisualOwnershipSnapshotEntry {
  key: string;
  owner: VisualOwnershipOwner;
}

export interface VisualOwnershipChange {
  key?: string;
  nextOwner?: VisualOwnershipOwner;
  previousOwner?: VisualOwnershipOwner | null;
  released?: VisualOwnershipSnapshotEntry[];
  token?: unknown;
  type: "acquire" | "clear" | "release" | "releaseByToken" | "transfer";
}

export type VisualOwnershipListener = (
  change: VisualOwnershipChange,
  snapshot: VisualOwnershipSnapshotEntry[],
) => void;

export interface VisualOwnershipRegistryOptions {
  scheduleFrame?: (callback: () => void) => unknown;
}

interface VisualOwnershipNotification {
  change: VisualOwnershipChange;
  snapshot: VisualOwnershipSnapshotEntry[];
}

export function makeDesktopSourceVisualKey(folderId: string | null | undefined): string | null {
  return folderId ? `desktopSource:${folderId}` : null;
}

export function makeFolderIconVisualKey(
  folderId: string | null | undefined,
  itemId: string | null | undefined,
): string | null {
  if (!folderId || !itemId) return null;
  return `folderIcon:${folderId}:${itemId}`;
}

export function makeFolderPageTrackVisualKey(folderId: string | null | undefined): string | null {
  return folderId ? `folderPageTrack:${folderId}` : null;
}

export function makeItemVisualKey(itemId: string | null | undefined): string | null {
  return itemId ? `item:${itemId}` : null;
}

export function makeFolderShellVisualKey(folderId: string | null | undefined): string | null {
  return folderId ? `folderShell:${folderId}` : null;
}

function normalizeOwner(owner: VisualOwnershipOwnerInput = {}): VisualOwnershipOwner | null {
  const token = owner.token ?? null;
  if (token == null) return null;
  return {
    actorKey: owner.actorKey || null,
    folderId: owner.folderId || null,
    kind: owner.kind || "unknown",
    token,
  };
}

function ownerMatches(
  current: VisualOwnershipOwner | null | undefined,
  token: unknown,
): current is VisualOwnershipOwner {
  return Boolean(current && token != null && current.token === token);
}

function ownersEqual(
  left: VisualOwnershipOwner | null | undefined,
  right: VisualOwnershipOwner | null | undefined,
): boolean {
  return Boolean(left && right) &&
    left!.actorKey === right!.actorKey &&
    left!.folderId === right!.folderId &&
    left!.kind === right!.kind &&
    left!.token === right!.token;
}

export class VisualOwnershipRegistry {
  declare readonly owners: Map<string, VisualOwnershipOwner>;
  declare readonly listeners: Set<VisualOwnershipListener>;
  declare readonly pendingNotifications: VisualOwnershipNotification[];
  declare notificationQueued: boolean;
  declare nextNotificationTicket: number;
  declare scheduledNotificationTicket: number | null;
  declare revision: number;
  declare readonly scheduleFrame: (callback: () => void) => unknown;

  constructor(options: VisualOwnershipRegistryOptions = {}) {
    this.owners = new Map<string, VisualOwnershipOwner>();
    this.listeners = new Set<VisualOwnershipListener>();
    this.pendingNotifications = [];
    this.notificationQueued = false;
    this.nextNotificationTicket = 1;
    this.scheduledNotificationTicket = null;
    this.revision = 0;
    this.scheduleFrame = options.scheduleFrame || ((callback) => motionRuntime.afterFrame(callback));
  }

  subscribe(listener: unknown): () => void {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener as VisualOwnershipListener);
    return () => {
      this.listeners.delete(listener as VisualOwnershipListener);
      if (!this.listeners.size) this.clearPendingNotifications();
    };
  }

  clearPendingNotifications(): number {
    const count = this.pendingNotifications.length;
    this.pendingNotifications.length = 0;
    this.notificationQueued = false;
    this.scheduledNotificationTicket = null;
    return count;
  }

  notifyChange(change: VisualOwnershipChange): void {
    if (!this.listeners.size) return;
    this.pendingNotifications.push({ change, snapshot: this.snapshot() });
    if (this.notificationQueued) return;
    const ticket = this.nextNotificationTicket;
    this.nextNotificationTicket += 1;
    this.notificationQueued = true;
    this.scheduledNotificationTicket = ticket;
    this.scheduleFrame(() => this.flushNotifications(ticket));
  }

  flushNotifications(ticket: number | null = this.scheduledNotificationTicket): number {
    if (ticket == null || ticket !== this.scheduledNotificationTicket) return 0;
    this.notificationQueued = false;
    this.scheduledNotificationTicket = null;
    const notifications = this.pendingNotifications.splice(0);
    const listeners = Array.from(this.listeners);
    for (const { change, snapshot } of notifications) {
      for (const listener of listeners) listener(change, snapshot);
    }
    return notifications.length;
  }

  acquire(
    key: string | null | undefined,
    owner: VisualOwnershipOwnerInput,
  ): boolean {
    const normalized = normalizeOwner(owner);
    if (!key || !normalized) return false;
    const previous = this.owners.get(key) || null;
    if (ownersEqual(previous, normalized)) return false;
    this.owners.set(key, normalized);
    this.revision += 1;
    this.notifyChange({
      key,
      nextOwner: { ...normalized },
      previousOwner: previous ? { ...previous } : null,
      type: previous ? "transfer" : "acquire",
    });
    return true;
  }

  acquireMany(
    keys: readonly (string | null | undefined)[] | null | undefined,
    owner: VisualOwnershipOwnerInput,
  ): number {
    let count = 0;
    for (const key of new Set((keys || []).filter(Boolean))) {
      if (this.acquire(key, owner)) count += 1;
    }
    return count;
  }

  release(key: string | null | undefined, token: unknown): boolean {
    if (!key) return false;
    const current = this.owners.get(key);
    if (!ownerMatches(current, token)) return false;
    this.owners.delete(key);
    this.revision += 1;
    this.notifyChange({
      key,
      previousOwner: { ...current },
      token,
      type: "release",
    });
    return true;
  }

  releaseByToken(token: unknown): number {
    if (token == null) return 0;
    const released: VisualOwnershipSnapshotEntry[] = [];
    for (const [key, owner] of Array.from(this.owners.entries())) {
      if (!ownerMatches(owner, token)) continue;
      this.owners.delete(key);
      released.push({ key, owner: { ...owner } });
    }
    if (released.length) {
      this.revision += 1;
      this.notifyChange({ released, token, type: "releaseByToken" });
    }
    return released.length;
  }

  getOwner(key: string | null | undefined): VisualOwnershipOwner | null {
    const owner = key ? this.owners.get(key) || null : null;
    return owner ? { ...owner } : null;
  }

  isOwnedBy(key: string | null | undefined, token: unknown): boolean {
    return ownerMatches(this.getOwner(key), token);
  }

  hasOwner(key: string | null | undefined): boolean {
    return Boolean(this.getOwner(key));
  }

  clear(): number {
    if (!this.owners.size) return 0;
    const released = this.snapshot();
    this.owners.clear();
    this.revision += 1;
    this.notifyChange({ released, type: "clear" });
    return released.length;
  }

  snapshot(): VisualOwnershipSnapshotEntry[] {
    return Array.from(this.owners.entries()).map(([key, owner]) => ({
      key,
      owner: { ...owner },
    }));
  }

  getRevision(): number {
    return this.revision;
  }

  dispose(): void {
    this.listeners.clear();
    this.clearPendingNotifications();
  }
}

import { motionRuntime } from "../animation/motionRuntime.js";
