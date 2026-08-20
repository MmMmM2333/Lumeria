import type {
  FolderLayoutItem,
  LayoutDocument,
  LayoutSettings,
  ManualAppLayoutItem,
} from "./layoutDocument.js";

declare const settings: LayoutSettings;

const manualApp = {
  id: "manual-app",
  type: "manualApp",
  name: "Manual App",
  launchTarget: { kind: "executable", path: "C:/Apps/manual.exe" },
  launchArgs: "--profile test",
} satisfies ManualAppLayoutItem;

const folder = {
  id: "folder",
  type: "folder",
  name: "Folder",
  childPages: [[manualApp]],
} satisfies FolderLayoutItem;

const document = {
  version: 2,
  pages: [[{ id: "catalog", type: "catalogApp" }, folder]],
  settings,
} satisfies LayoutDocument;

void document;

// @ts-expect-error LayoutDocument v2 is the only persisted version.
const legacyVersion: LayoutDocument = { version: 1, pages: [], settings };
void legacyVersion;

const nestedFolder: FolderLayoutItem = {
  id: "outer",
  type: "folder",
  name: "Outer",
  // @ts-expect-error Folder child pages cannot contain another folder.
  childPages: [[folder]],
};
void nestedFolder;

// @ts-expect-error The persisted root contract is closed to unknown fields.
const unknownRootField: LayoutDocument = { version: 2, pages: [], settings, legacy: true };
void unknownRootField;
