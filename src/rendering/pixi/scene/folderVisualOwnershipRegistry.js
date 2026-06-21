export function makeDesktopSourceVisualKey(folderId) {
  return folderId ? `desktopSource:${folderId}` : null;
}

export function makeFolderIconVisualKey(folderId, itemId, pageIndex = 0) {
  if (!folderId || !itemId) return null;
  return `folderIcon:${folderId}:${pageIndex}:${itemId}`;
}

export function makeFolderPageTrackVisualKey(folderId) {
  return folderId ? `folderPageTrack:${folderId}` : null;
}

function normalizeOwner(owner = {}) {
  const token = owner.token ?? owner.sessionToken ?? null;
  if (token == null) return null;
  return {
    folderId: owner.folderId || null,
    kind: owner.kind || "unknown",
    token,
  };
}

function ownerMatches(current, token) {
  return Boolean(current && token != null && current.token === token);
}

function ownersEqual(a, b) {
  return Boolean(a && b) &&
    a.folderId === b.folderId &&
    a.kind === b.kind &&
    a.token === b.token;
}

export class FolderVisualOwnershipRegistry {
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
    for (const listener of Array.from(this.listeners)) {
      listener(change, snapshot);
    }
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
    let count = 0;
    const released = [];
    for (const [key, owner] of Array.from(this.owners.entries())) {
      if (!ownerMatches(owner, token)) continue;
      this.owners.delete(key);
      released.push({ key, owner: { ...owner } });
      count += 1;
    }
    if (released.length) {
      this.notifyChange({
        released,
        token,
        type: "releaseByToken",
      });
    }
    return count;
  }

  releaseByScope(scope = {}) {
    const {
      folderId = null,
      keyPrefix = null,
      kind = null,
      token = null,
    } = scope;
    let count = 0;
    const released = [];
    for (const [key, owner] of Array.from(this.owners.entries())) {
      if (token != null && owner.token !== token) continue;
      if (folderId != null && owner.folderId !== folderId) continue;
      if (kind != null && owner.kind !== kind) continue;
      if (keyPrefix != null && !key.startsWith(keyPrefix)) continue;
      this.owners.delete(key);
      released.push({ key, owner: { ...owner } });
      count += 1;
    }
    if (released.length) {
      this.notifyChange({
        released,
        scope: { folderId, keyPrefix, kind, token },
        type: "releaseByScope",
      });
    }
    return count;
  }

  transfer(key, fromToken, owner) {
    if (!key) return false;
    const current = this.owners.get(key);
    if (!ownerMatches(current, fromToken)) return false;
    return this.acquire(key, owner);
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
    this.notifyChange({
      released,
      type: "clear",
    });
    return released.length;
  }

  snapshot() {
    return Array.from(this.owners.entries()).map(([key, owner]) => ({
      key,
      owner: { ...owner },
    }));
  }
}
