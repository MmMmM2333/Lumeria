import {
  FolderVisualSession,
} from "./folderVisualSession.js";

declare const session: FolderVisualSession;

const rootSnapshot = session.snapshot();
void rootSnapshot.opening?.ghostIds;
void rootSnapshot.closing?.activeVisuals;

const opening = session.open({ folderId: "folder-a", targetKey: "target-a" });
void opening.isCurrent();
opening.present({ state: {}, targets: [] });

// @ts-expect-error Opening presentation plans require renderer state and targets.
opening.present({ targets: [] });

const closing = session.close({ folderId: "folder-a" });
void closing.isCurrent();
closing.present({ state: {}, targets: [] });

// @ts-expect-error Closing presentation plans reject implementation-specific top-level fields.
closing.present({ ghosts: [], state: {}, targets: [] });

// @ts-expect-error Adapter diagnostics are private to the visual adapter seam.
void opening.snapshot().adapter;

// @ts-expect-error Adapter diagnostics are private to the visual adapter seam.
void closing.snapshot().adapter;

// @ts-expect-error Root callers cannot mutate phase identity with raw tokens.
session.advanceOpening("folder-a", "token-a");

// @ts-expect-error Snapshot collections are readonly contract values.
closing.snapshot().ghostIds.push("app-a");
