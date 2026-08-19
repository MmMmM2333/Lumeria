export function makeDesktopSourceVisualKey(folderId) {
  return folderId ? `desktopSource:${folderId}` : null;
}

export function makeFolderIconVisualKey(folderId, itemId) {
  if (!folderId || !itemId) return null;
  return `folderIcon:${folderId}:${itemId}`;
}

export function makeFolderPageTrackVisualKey(folderId) {
  return folderId ? `folderPageTrack:${folderId}` : null;
}

export function makeItemVisualKey(itemId) {
  return itemId ? `item:${itemId}` : null;
}

export function makeFolderShellVisualKey(folderId) {
  return folderId ? `folderShell:${folderId}` : null;
}

function normalizeOwner(owner = {}) {
  const token = owner.token ?? null;
  if (token == null) return null;
  return {
    actorKey: owner.actorKey || null,
    folderId: owner.folderId || null,
    kind: owner.kind || "unknown",
    token,
  };
}

function ownerMatches(current, token) {
  return Boolean(current && token != null && current.token === token);
}

function ownersEqual(left, right) {
  return Boolean(left && right) &&
    left.actorKey === right.actorKey &&
    left.folderId === right.folderId &&
    left.kind === right.kind &&
    left.token === right.token;
}

export class VisualOwnershipRegistry {
  constructor(options = {}) {
    this.owners = new Map();
    this.listeners = new Set();
    this.pendingNotifications = [];
    this.notificationQueued = false;
    this.nextNotificationTicket = 1;
    this.scheduledNotificationTicket = null;
    this.revision = 0;
    this.scheduleFrame = options.scheduleFrame || ((callback) => motionRuntime.afterFrame(callback));
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.clearPendingNotifications();
    };
  }

  clearPendingNotifications() {
    const count = this.pendingNotifications.length;
    this.pendingNotifications.length = 0;
    this.notificationQueued = false;
    this.scheduledNotificationTicket = null;
    return count;
  }

  notifyChange(change) {
    if (!this.listeners.size) return;
    this.pendingNotifications.push({ change, snapshot: this.snapshot() });
    if (this.notificationQueued) return;
    const ticket = this.nextNotificationTicket;
    this.nextNotificationTicket += 1;
    this.notificationQueued = true;
    this.scheduledNotificationTicket = ticket;
    this.scheduleFrame(() => this.flushNotifications(ticket));
  }

  flushNotifications(ticket = this.scheduledNotificationTicket) {
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

  acquire(key, owner) {
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

  acquireMany(keys, owner) {
    let count = 0;
    for (const key of new Set((keys || []).filter(Boolean))) {
      if (this.acquire(key, owner)) count += 1;
    }
    return count;
  }

  release(key, token) {
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

  releaseByToken(token) {
    if (token == null) return 0;
    const released = [];
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

  getOwner(key) {
    const owner = key ? this.owners.get(key) || null : null;
    return owner ? { ...owner } : null;
  }

  isOwnedBy(key, token) {
    return ownerMatches(this.getOwner(key), token);
  }

  hasOwner(key) {
    return Boolean(this.getOwner(key));
  }

  clear() {
    if (!this.owners.size) return 0;
    const released = this.snapshot();
    this.owners.clear();
    this.revision += 1;
    this.notifyChange({ released, type: "clear" });
    return released.length;
  }

  snapshot() {
    return Array.from(this.owners.entries()).map(([key, owner]) => ({
      key,
      owner: { ...owner },
    }));
  }

  getRevision() {
    return this.revision;
  }

  dispose() {
    this.listeners.clear();
    this.clearPendingNotifications();
  }
}
import { motionRuntime } from "../animation/motionRuntime.js";
