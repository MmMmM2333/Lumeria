function roundGeometryValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export function makeFolderPanelTargetKey(folderId, targetX, targetY, panelRect) {
  return [
    folderId || "",
    roundGeometryValue(targetX),
    roundGeometryValue(targetY),
    roundGeometryValue(panelRect?.width),
    roundGeometryValue(panelRect?.height),
  ].join(":");
}

export class FolderTransitionCoordinator {
  constructor() {
    this.activeOpenSession = null;
    this.nextToken = 1;
  }

  beginOpen(folderId, targetKey, options = {}) {
    const current = this.activeOpenSession;
    const nextFolderId = folderId || null;
    const nextTargetKey = targetKey || "";
    const shouldReuse = !options.forceNew &&
      current &&
      current.folderId === nextFolderId;

    if (shouldReuse) {
      if (current.targetKey !== nextTargetKey) {
        current.targetKey = nextTargetKey;
        current.geometrySnapshot = null;
        current.geometryLayoutKey = null;
        if (!current.revealed) current.panelReady = false;
      }
      return { session: current, started: false };
    }

    const session = {
      folderId: nextFolderId,
      ghostsReady: false,
      panelReady: false,
      revealed: false,
      geometryLayoutKey: null,
      geometrySnapshot: null,
      targetKey: nextTargetKey,
      token: this.nextToken,
    };
    this.nextToken += 1;
    this.activeOpenSession = session;
    return { session, started: true };
  }

  get activeOpenToken() {
    return this.activeOpenSession?.token || null;
  }

  isCurrentOpen(token) {
    return Boolean(token && this.activeOpenSession?.token === token);
  }

  markPanelPending(token, targetKey = null) {
    if (!this.isCurrentOpen(token)) return false;
    if (targetKey != null && this.activeOpenSession.targetKey !== targetKey) {
      this.activeOpenSession.targetKey = targetKey;
      this.activeOpenSession.geometrySnapshot = null;
      this.activeOpenSession.geometryLayoutKey = null;
    }
    if (!this.activeOpenSession.revealed) this.activeOpenSession.panelReady = false;
    return true;
  }

  setOpenGeometrySnapshot(token, snapshot) {
    if (!this.isCurrentOpen(token) || !snapshot) return false;
    const session = this.activeOpenSession;
    const nextLayoutKey = snapshot.layoutKey || null;
    if (session.geometryLayoutKey === nextLayoutKey && session.geometrySnapshot === snapshot) return false;
    if (session.geometryLayoutKey && session.geometryLayoutKey !== nextLayoutKey && !session.revealed) {
      session.panelReady = false;
    }
    session.geometryLayoutKey = nextLayoutKey;
    session.geometrySnapshot = snapshot;
    return true;
  }

  getOpenGeometrySnapshot(token = null) {
    const session = this.activeOpenSession;
    if (!session) return null;
    if (token != null && session.token !== token) return null;
    return session.geometrySnapshot || null;
  }

  markPanelReady(token) {
    if (!this.isCurrentOpen(token)) return false;
    if (this.activeOpenSession.panelReady) return false;
    this.activeOpenSession.panelReady = true;
    return true;
  }

  markGhostsReady(token) {
    if (!this.isCurrentOpen(token)) return false;
    if (this.activeOpenSession.ghostsReady) return false;
    this.activeOpenSession.ghostsReady = true;
    return true;
  }

  canReveal(token) {
    const session = this.activeOpenSession;
    return Boolean(
      token &&
      session?.token === token &&
      session.panelReady &&
      session.ghostsReady &&
      !session.revealed
    );
  }

  finishReveal(token) {
    if (!this.canReveal(token)) return false;
    this.activeOpenSession.revealed = true;
    return true;
  }

  isRevealPending() {
    const session = this.activeOpenSession;
    return Boolean(session && !session.revealed);
  }

  cancelOpen(token = null) {
    if (token && !this.isCurrentOpen(token)) return false;
    if (!this.activeOpenSession) return false;
    this.activeOpenSession = null;
    return true;
  }
}
