import type { SceneItem } from "../../sceneFrame.js";

export type DesktopHandoffObservation = Readonly<{
  activeClosingFolderIds: ReadonlySet<string>;
  desktopSourceGhostedIds: ReadonlySet<string>;
  visibleSubstituteFolderIds: ReadonlySet<string>;
}>;

export type DesktopFolderHandoffState = Readonly<{
  folderClosingHandoffIds: ReadonlySet<string>;
  folderSourceGhostedIds: ReadonlySet<string>;
  isFolderOpeningPreviewFrameGhosted: (folderId: string) => boolean;
  singleStageFolderState: Readonly<{
    folderOpenIconGhostSession?: Readonly<{
      folderId?: string | null;
      status?: string | null;
    }> | null;
    isDesktopClosing?: boolean;
    isFolderAppLaunchClosing?: boolean;
    isFolderClosing?: boolean;
    isFolderZoomFadeClosing?: boolean;
    renderedFolder?: SceneItem | null;
  }> | null;
}>;

export type DesktopFolderHandoffEntry = Readonly<{
  folderId: string;
  visualReleased: boolean;
}> & Readonly<Record<string, unknown>>;

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringSet(value: unknown, label: string): ReadonlySet<string> {
  if (!(value instanceof Set)) throw new TypeError(`${label} must return a Set`);
  const result = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !entry) {
      throw new TypeError(`${label} must contain non-empty folder ids`);
    }
    result.add(entry);
  }
  return result;
}

export function mergeFolderIdSets(
  ...sources: readonly (ReadonlySet<string> | readonly string[] | null | undefined)[]
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    if (!(source instanceof Set) && !Array.isArray(source)) {
      throw new TypeError("Folder id sources must be a Set or array");
    }
    for (const folderId of source) {
      if (typeof folderId !== "string" || !folderId) {
        throw new TypeError("Folder id sources must contain non-empty strings");
      }
      result.add(folderId);
    }
  }
  return result;
}

export function captureDesktopHandoffObservation(
  folderLayer: unknown,
  candidateFolderIds: ReadonlySet<string> | readonly string[],
): DesktopHandoffObservation {
  if (!isRecord(folderLayer)) throw new TypeError("Desktop handoff layer must be an object");
  const visualSession = folderLayer.folderVisualSession;
  if (!isRecord(visualSession) || typeof visualSession.snapshot !== "function") {
    throw new TypeError("Desktop handoff layer requires folderVisualSession.snapshot()");
  }
  if (typeof folderLayer.getDesktopSourceGhostedIds !== "function") {
    throw new TypeError("Desktop handoff layer requires getDesktopSourceGhostedIds()");
  }
  if (typeof folderLayer.hasVisibleFolderSubstitute !== "function") {
    throw new TypeError("Desktop handoff layer requires hasVisibleFolderSubstitute(folderId)");
  }

  const sessionSnapshot: unknown = Reflect.apply(visualSession.snapshot, visualSession, []);
  if (!isRecord(sessionSnapshot)) {
    throw new TypeError("folderVisualSession.snapshot() must return an object");
  }
  const activeClosingFolderIds = new Set<string>();
  const closing = sessionSnapshot.closing;
  if (closing !== null && closing !== undefined) {
    if (!isRecord(closing)) throw new TypeError("Folder visual closing snapshot must be an object or null");
    if (closing.handoffActive === true) {
      const folderId = typeof closing.folderId === "string" && closing.folderId
        ? closing.folderId
        : typeof folderLayer.currentFolderId === "string" && folderLayer.currentFolderId
          ? folderLayer.currentFolderId
          : null;
      if (!folderId) {
        throw new Error("An active desktop folder handoff must identify its folder");
      }
      activeClosingFolderIds.add(folderId);
    }
  }

  const sourceIds: unknown = Reflect.apply(
    folderLayer.getDesktopSourceGhostedIds,
    folderLayer,
    [],
  );
  const desktopSourceGhostedIds = readStringSet(
    sourceIds,
    "getDesktopSourceGhostedIds()",
  );
  const foldersToInspect = mergeFolderIdSets(
    candidateFolderIds,
    activeClosingFolderIds,
    desktopSourceGhostedIds,
  );
  const visibleSubstituteFolderIds = new Set<string>();
  for (const folderId of foldersToInspect) {
    const visible: unknown = Reflect.apply(
      folderLayer.hasVisibleFolderSubstitute,
      folderLayer,
      [folderId],
    );
    if (typeof visible !== "boolean") {
      throw new TypeError("hasVisibleFolderSubstitute(folderId) must return a boolean");
    }
    if (visible) visibleSubstituteFolderIds.add(folderId);
  }

  return {
    activeClosingFolderIds,
    desktopSourceGhostedIds,
    visibleSubstituteFolderIds,
  };
}

export function getDesktopSourceGhostedIdsFromOwnership(
  visualOwnership: unknown,
): ReadonlySet<string> {
  if (!isRecord(visualOwnership) || typeof visualOwnership.snapshot !== "function") {
    throw new TypeError("Desktop visual ownership requires snapshot()");
  }
  const snapshot: unknown = Reflect.apply(visualOwnership.snapshot, visualOwnership, []);
  if (!Array.isArray(snapshot)) {
    throw new TypeError("Desktop visual ownership snapshot must be an array");
  }
  const ids = new Set<string>();
  for (const value of snapshot) {
    if (!isRecord(value) || typeof value.key !== "string") continue;
    if (!value.key.startsWith("desktopSource:")) continue;
    const ownerFolderId = isRecord(value.owner) && typeof value.owner.folderId === "string"
      ? value.owner.folderId
      : null;
    const folderId = ownerFolderId || value.key.slice("desktopSource:".length);
    if (folderId) ids.add(folderId);
  }
  return ids;
}

export function hasFolderClosingHandoffId(
  state: Pick<DesktopFolderHandoffState, "folderClosingHandoffIds">,
  folderId: string,
): boolean {
  return Boolean(folderId && state.folderClosingHandoffIds.has(folderId));
}

export function hasRawFolderSourceGhosting(
  state: Pick<
    DesktopFolderHandoffState,
    "folderSourceGhostedIds" | "isFolderOpeningPreviewFrameGhosted"
  >,
  folderId: string,
): boolean {
  return state.folderSourceGhostedIds.has(folderId) ||
    state.isFolderOpeningPreviewFrameGhosted(folderId);
}

export function isFolderOpeningSourceGhosted(
  state: Pick<
    DesktopFolderHandoffState,
    "isFolderOpeningPreviewFrameGhosted" | "singleStageFolderState"
  >,
  folderId: string,
): boolean {
  if (state.isFolderOpeningPreviewFrameGhosted(folderId)) return true;
  const folderState = state.singleStageFolderState;
  if (folderState?.renderedFolder?.id !== folderId) return false;
  if (
    folderState.folderOpenIconGhostSession?.folderId === folderId &&
    folderState.folderOpenIconGhostSession.status === "staged"
  ) return false;
  return !folderState.isFolderClosing &&
    !folderState.isFolderAppLaunchClosing &&
    !folderState.isFolderZoomFadeClosing &&
    !folderState.isDesktopClosing;
}

export function shouldFinishFolderHandoff(
  state: Pick<DesktopFolderHandoffState, "folderClosingHandoffIds">,
  observation: DesktopHandoffObservation,
): boolean {
  return state.folderClosingHandoffIds.size === 0 &&
    observation.activeClosingFolderIds.size === 0;
}

export function shouldFinishFolderHandoffEntry(
  state: Pick<DesktopFolderHandoffState, "folderClosingHandoffIds">,
  observation: DesktopHandoffObservation,
  folderId: string,
): boolean {
  return !state.folderClosingHandoffIds.has(folderId) &&
    !observation.activeClosingFolderIds.has(folderId) &&
    !observation.desktopSourceGhostedIds.has(folderId) &&
    !observation.visibleSubstituteFolderIds.has(folderId);
}

export function isStaleHiddenFolderHandoffEntry(
  state: Pick<
    DesktopFolderHandoffState,
    "folderSourceGhostedIds" | "isFolderOpeningPreviewFrameGhosted"
  >,
  entry: DesktopFolderHandoffEntry | null,
  observation: DesktopHandoffObservation,
  folderId: string,
): boolean {
  if (!entry || entry.visualReleased) return false;
  if (hasRawFolderSourceGhosting(state, folderId)) return false;
  if (observation.activeClosingFolderIds.has(folderId)) return false;
  if (observation.desktopSourceGhostedIds.has(folderId)) return false;
  if (observation.visibleSubstituteFolderIds.has(folderId)) return false;
  return true;
}
