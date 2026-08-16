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
  constructor() {
    this.owners = new Map();
    this.listeners = new Set();
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyChange(change) {
    if (!this.listeners.size) return;
    const snapshot = this.snapshot();
    for (const listener of Array.from(this.listeners)) listener(change, snapshot);
  }

  acquire(key, owner) {
    const normalized = normalizeOwner(owner);
    if (!key || !normalized) return false;
    const previous = this.owners.get(key) || null;
    if (ownersEqual(previous, normalized)) return false;
    this.owners.set(key, normalized);
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
      this.notifyChange({ released, token, type: "releaseByToken" });
    }
    return released.length;
  }

  getOwner(key) {
    return key ? this.owners.get(key) || null : null;
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
    this.notifyChange({ released, type: "clear" });
    return released.length;
  }

  snapshot() {
    return Array.from(this.owners.entries()).map(([key, owner]) => ({
      key,
      owner: { ...owner },
    }));
  }
}
