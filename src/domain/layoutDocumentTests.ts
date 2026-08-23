import { assertLayoutDocument } from "./layoutDocument.js";
import { readFileSync } from "node:fs";

type MutableItem = {
  id: string;
  type: string;
  name?: string;
  children?: unknown;
  childPages?: MutableItem[][];
  [key: string]: unknown;
};

type MutableDocument = {
  pages: MutableItem[][];
  settings: Record<string, unknown>;
  [key: string]: unknown;
};

type ContractCase = {
  name: string;
  path: (string | number)[];
  remove?: boolean;
  value?: unknown;
  valid: boolean;
};

const canonicalDocument = JSON.parse(
  readFileSync(new URL("./fixtures/layout-v2-roundtrip.json", import.meta.url), "utf8")
) as MutableDocument;
const contractCases = JSON.parse(
  readFileSync(new URL("./fixtures/layout-v2-contract-cases.json", import.meta.url), "utf8")
) as ContractCase[];

function cloneDocument(): MutableDocument {
  return structuredClone(canonicalDocument);
}

function applyContractCase(document: MutableDocument, contractCase: ContractCase): MutableDocument {
  if (!Array.isArray(contractCase.path)) return document;
  let parent: unknown = document;
  for (const segment of contractCase.path.slice(0, -1)) {
    if (parent === null || typeof parent !== "object") return document;
    parent = (parent as Record<string, unknown>)[String(segment)];
  }
  const key = contractCase.path.at(-1);
  if (key == null || parent === null || typeof parent !== "object") return document;
  const record = parent as Record<string, unknown>;
  if (contractCase.remove) delete record[String(key)];
  else record[String(key)] = structuredClone(contractCase.value);
  return document;
}

function makeDocument(): MutableDocument {
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
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[LayoutDocument test failed] ${message}`);
  };
  const rejectsWith = (callback: () => unknown, fragment: string): boolean => {
    try {
      callback();
      return false;
    } catch (error) {
      return String(error instanceof Error ? error.message : error).includes(fragment);
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
  invalidLegacy.pages[0]![1]!.children = [];
  assert(
    rejectsWith(() => assertLayoutDocument(invalidLegacy), "children is no longer supported"),
    "legacy flat folder children should be rejected"
  );

  const invalidFolder = makeDocument();
  delete invalidFolder.pages[0]![1]!.childPages;
  assert(rejectsWith(() => assertLayoutDocument(invalidFolder), "childPages"), "folders must carry childPages");

  const nestedFolder = makeDocument();
  nestedFolder.pages[0]![1]!.childPages![0]!.push({
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
  duplicateId.pages[0]![1]!.childPages![0]![0]!.id = "catalog-app";
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
