import { assertLayoutDocument } from "./layoutDocument.js";
import { readFileSync } from "node:fs";

const canonicalDocument = JSON.parse(
  readFileSync(new URL("./fixtures/layout-v2-roundtrip.json", import.meta.url), "utf8")
);
const contractCases = JSON.parse(
  readFileSync(new URL("./fixtures/layout-v2-contract-cases.json", import.meta.url), "utf8")
);

function cloneDocument() {
  return structuredClone(canonicalDocument);
}

function applyContractCase(document, contractCase) {
  if (!Array.isArray(contractCase.path)) return document;
  const parent = contractCase.path
    .slice(0, -1)
    .reduce((value, segment) => value[segment], document);
  const key = contractCase.path.at(-1);
  if (contractCase.remove) delete parent[key];
  else parent[key] = structuredClone(contractCase.value);
  return document;
}

function makeDocument() {
  const document = cloneDocument();
  document.pages = [[
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
    ]];
  return document;
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

  const canonical = cloneDocument();
  assert(assertLayoutDocument(canonical) === canonical, "the contract should preserve the validated document reference");

  contractCases.forEach((contractCase) => {
    const candidate = applyContractCase(cloneDocument(), contractCase);
    const accepted = !rejectsWith(() => assertLayoutDocument(candidate), "");
    assert(
      accepted === contractCase.valid,
      `shared contract case '${contractCase.name}' should be ${contractCase.valid ? "accepted" : "rejected"}`
    );
  });

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
