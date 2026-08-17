import { assertLayoutDocument } from "./layoutDocument.js";

function makeDocument() {
  return {
    version: 2,
    pages: [[
      { id: "catalog-app", type: "catalogApp", overrides: { name: "Renamed" } },
      {
        id: "folder",
        type: "folder",
        name: "Folder",
        childPages: [[{
          id: "manual-app",
          type: "manualApp",
          name: "Manual",
          launchTarget: { kind: "executable", path: "C:/Apps/manual.exe" },
          launchArgs: "--profile test",
        }]],
      },
    ]],
    settings: {
      gridRows: 4,
      gridCols: 6,
      folderRows: 3,
      folderCols: 4,
      iconSize: 72,
      textless: false,
      hiddenAppIds: [],
      scanRoots: [],
      scanKeywordAllowlist: [],
      scanKeywordBlacklist: [],
      scanAppBlacklist: [],
      showMissingLaunchTargetBadge: true,
      mainWindowShortcut: "control+alt+KeyL",
    },
  };
}

export function runLayoutDocumentTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[LayoutDocument test failed] ${message}`);
  };
  const rejectsWith = (callback, fragment) => {
    try {
      callback();
      return false;
    } catch (error) {
      return String(error.message).includes(fragment);
    }
  };

  const document = makeDocument();
  assert(assertLayoutDocument(document) === document, "the contract should preserve the validated document reference");

  const invalidLegacy = makeDocument();
  invalidLegacy.pages[0][1].children = [];
  assert(
    rejectsWith(() => assertLayoutDocument(invalidLegacy), "children is no longer supported"),
    "legacy flat folder children should be rejected"
  );

  const invalidFolder = makeDocument();
  delete invalidFolder.pages[0][1].childPages;
  assert(rejectsWith(() => assertLayoutDocument(invalidFolder), "childPages"), "folders must carry childPages");

  const nestedFolder = makeDocument();
  nestedFolder.pages[0][1].childPages[0].push({
    id: "nested-folder",
    type: "folder",
    name: "Nested",
    childPages: [[]],
  });
  assert(
    rejectsWith(() => assertLayoutDocument(nestedFolder), "catalogApp or manualApp"),
    "folder pages must not contain nested folders"
  );

  const duplicateId = makeDocument();
  duplicateId.pages[0][1].childPages[0][0].id = "catalog-app";
  assert(
    rejectsWith(() => assertLayoutDocument(duplicateId), "must be unique"),
    "all persisted item ids must be unique"
  );

  const missingAllowlist = makeDocument();
  delete missingAllowlist.settings.scanKeywordAllowlist;
  assert(
    rejectsWith(() => assertLayoutDocument(missingAllowlist), "scanKeywordAllowlist"),
    "the canonical settings contract must include scanKeywordAllowlist"
  );
}
