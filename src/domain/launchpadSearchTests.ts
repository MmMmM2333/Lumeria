import { buildAppSearchDocuments, searchAppDocuments,createAppSearchIndex } from "./launchpadSearch.js";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(`[Launchpad search domain test failed] ${message}`);
};

export function runLaunchpadSearchDomainTests() {
  const settings = { id: "settings", type: "app", name: "设置" };
  const documents = buildAppSearchDocuments([settings]);

  assert(searchAppDocuments(documents, "shezhi")[0]?.id === settings.id, "full pinyin should find a Chinese app name");
  assert(searchAppDocuments(documents, "sz")[0]?.id === settings.id, "pinyin initials should find a Chinese app name");
  assert(searchAppDocuments(documents, "shez")[0]?.id === settings.id, "a partial final syllable should match a full-pinyin prefix");
  assert(searchAppDocuments(documents, "ＳＺ")[0]?.id === settings.id, "full-width uppercase input should be normalized before matching");

  const shenzhen = { id: "shenzhen", type: "app", name: "深圳" };
  const literal = { id: "literal-sz", type: "app", name: "SZ" };
  const ranked = searchAppDocuments(buildAppSearchDocuments([settings, shenzhen, literal]), "sz");
  assert(ranked.map((app) => app.id).join(",") === "literal-sz,settings,shenzhen", "literal name matches should outrank stable pinyin matches");

  const superZoom = { id: "super-zoom", type: "app", name: "Super Zoom" };
  const derivedRanked = searchAppDocuments(buildAppSearchDocuments([settings, shenzhen, superZoom, literal]), "sz");
  assert(derivedRanked.map((app) => app.id).join(",") === "literal-sz,super-zoom,settings,shenzhen", "visible word initials should outrank pinyin-derived initials");

  const luBu = { id: "lu-bu", type: "app", name: "吕布" };
  assert(searchAppDocuments(buildAppSearchDocuments([luBu]), "lvbu")[0]?.id === luBu.id, "v should match the common keyboard form of u-diaeresis pinyin");

  const accounting = { id: "accounting", type: "app", name: "会计" };
  assert(searchAppDocuments(buildAppSearchDocuments([accounting]), "huiji")[0]?.id === accounting.id, "alternate polyphonic readings should be available as fallback matches");
  assert(searchAppDocuments(documents, "sezhi").length === 0, "pinyin matching should not silently become typo correction");

  const mixed = { id: "mixed", type: "app", name: "Visual Studio 设置" };
  const mixedDocuments = buildAppSearchDocuments([mixed]);
  assert(searchAppDocuments(mixedDocuments, "visual")[0]?.id === mixed.id, "literal Latin tokens should remain searchable in mixed names");
  assert(searchAppDocuments(mixedDocuments, "shezhi")[0]?.id === mixed.id, "full pinyin should match the Chinese block of a mixed name");
  assert(searchAppDocuments(mixedDocuments, "sz")[0]?.id === mixed.id, "pinyin initials should match the Chinese block of a mixed name");
  assert(searchAppDocuments(mixedDocuments, "visualstudioshezhi")[0]?.id === mixed.id, "compact mixed full pinyin should ignore separators");

  const visualStudioCode = { id: "visual-studio-code", type: "app", name: "Visual Studio Code" };
  const visualStudioCodeExtra = { id: "visual-studio-code-extra", type: "app", name: "Visual Studio Code Extra" };
  const visualStudioCodeDocuments = buildAppSearchDocuments([visualStudioCode]);
  assert(visualStudioCodeDocuments[0]?.fullPinyin === "", "non-Han app names should not derive a redundant full-pinyin field");
  assert(visualStudioCodeDocuments[0]?.pinyinInitials === "", "non-Han app names should not derive redundant pinyin initials");
  assert(searchAppDocuments(visualStudioCodeDocuments, "vscode")[0]?.id === visualStudioCode.id, "word-prefix composition should find Visual Studio Code with vscode");
  assert(searchAppDocuments(visualStudioCodeDocuments, "vistcode")[0]?.id === visualStudioCode.id, "word-prefix composition should accept longer prefixes from consecutive words");
  assert(searchAppDocuments(visualStudioCodeDocuments, "vs code")[0]?.id === visualStudioCode.id, "word-prefix composition should ignore query separators after multi-word matching is exhausted");
  assert(searchAppDocuments(visualStudioCodeDocuments, "ＶＳＣＯＤＥ")[0]?.id === visualStudioCode.id, "word-prefix composition should normalize full-width uppercase queries");
  assert(searchAppDocuments(visualStudioCodeDocuments, "vcode").length === 0, "compact word-prefix composition should not skip an unnamed middle word");
  assert(searchAppDocuments(visualStudioCodeDocuments, "vscx").length === 0, "word-prefix composition should not silently accept unmatched trailing characters");

  const visualSc = { id: "visual-sc", type: "app", name: "Visual SC" };
  const initialRanked = searchAppDocuments(buildAppSearchDocuments([visualSc, visualStudioCode]), "vsc");
  assert(initialRanked.map((app) => app.id).join(",") === "visual-studio-code,visual-sc", "exact word initials should outrank a looser word-prefix composition");

  const visualStudioCodeInsiders = { id: "visual-studio-code-insiders", type: "app", name: "Visual Studio Code Insiders" };
  const initialPrefixRanked = searchAppDocuments(buildAppSearchDocuments([visualSc, visualStudioCodeInsiders]), "vsc");
  assert(initialPrefixRanked.map((app) => app.id).join(",") === "visual-studio-code-insiders,visual-sc", "word-initial prefixes should outrank a looser word-prefix composition");

  const studioCi = { id: "studio-ci", type: "app", name: "Studio CI" };
  const initialSubstringRanked = searchAppDocuments(buildAppSearchDocuments([studioCi, visualStudioCodeInsiders]), "sci");
  assert(initialSubstringRanked.map((app) => app.id).join(",") === "visual-studio-code-insiders,studio-ci", "contiguous word-initial substrings should outrank a looser word-prefix composition");

  assert(searchAppDocuments(visualStudioCodeDocuments, "visual code")[0]?.id === visualStudioCode.id, "ordered multi-word queries should match distinct name-token prefixes while allowing gaps");
  assert(searchAppDocuments(visualStudioCodeDocuments, "code visual")[0]?.id === visualStudioCode.id, "unordered multi-word queries should match the same distinct name tokens at a lower relevance tier");
  assert(searchAppDocuments(visualStudioCodeDocuments, "vis cod")[0]?.id === visualStudioCode.id, "multi-word queries should accept a prefix for every query token");
  assert(searchAppDocuments(visualStudioCodeDocuments, "visual missing").length === 0, "multi-word matching should require every query token to match");

  const singleAppWord = { id: "single-app-word", type: "app", name: "Application" };
  assert(searchAppDocuments(buildAppSearchDocuments([singleAppWord]), "app app").length === 0, "multi-word matching should not reuse one name token for two query tokens");

  const reverseTokenOrder = { id: "reverse-token-order", type: "app", name: "Code Studio Visual" };
  const multiWordRanked = searchAppDocuments(buildAppSearchDocuments([reverseTokenOrder, visualStudioCode]), "vis cod");
  assert(multiWordRanked.map((app) => app.id).join(",") === "visual-studio-code,reverse-token-order", "ordered multi-word matches should outrank unordered matches");

  const visualCode = { id: "visual-code", type: "app", name: "Visual Code" };
  const gapRanked = searchAppDocuments(buildAppSearchDocuments([visualStudioCode, visualCode]), "vis cod");
  assert(gapRanked.map((app) => app.id).join(",") === "visual-code,visual-studio-code", "multi-word matches should prefer fewer skipped name tokens");

  const multiWordLengthRanked = searchAppDocuments(buildAppSearchDocuments([visualStudioCodeExtra, visualStudioCode]), "vis cod");
  assert(multiWordLengthRanked.map((app) => app.id).join(",") === "visual-studio-code,visual-studio-code-extra", "multi-word matches should prefer the shorter complete app name after token quality ties");

  const exactVsCode = { id: "exact-vscode", type: "app", name: "VSCode" };
  const exactVsc = { id: "exact-vsc", type: "app", name: "VSC" };
  const vscTool = { id: "vsc-tool", type: "app", name: "VSC Tool" };
  const exactCode = { id: "exact-code", type: "app", name: "Code" };
  const relevanceCorpus = buildAppSearchDocuments([visualStudioCode, vscTool, exactCode, exactVsCode, exactVsc]);
  assert(searchAppDocuments(relevanceCorpus, "vscode").map((app) => app.id).join(",") === "exact-vscode,visual-studio-code", "an exact visible name should outrank word-prefix composition");
  assert(searchAppDocuments(relevanceCorpus, "vsc").map((app) => app.id).join(",") === "exact-vsc,exact-vscode,vsc-tool,visual-studio-code", "exact and prefix visible names should outrank compact and initial-derived matches");
  assert(searchAppDocuments(relevanceCorpus, "code").map((app) => app.id).join(",") === "exact-code,exact-vscode,visual-studio-code", "an exact token name should outrank longer visible-name substrings");

  const compactRanked = searchAppDocuments(buildAppSearchDocuments([visualStudioCodeExtra, visualStudioCode]), "visualstudiocode");
  assert(compactRanked.map((app) => app.id).join(",") === "visual-studio-code,visual-studio-code-extra", "an exact compact name should outrank a longer compact-name prefix");

  const compositionRanked = searchAppDocuments(buildAppSearchDocuments([visualStudioCodeExtra, visualStudioCode]), "vscode");
  assert(compositionRanked.map((app) => app.id).join(",") === "visual-studio-code,visual-studio-code-extra", "word-prefix composition should prefer the shorter complete app name");

  const camelCaseCode = { id: "camel-case-code", type: "app", name: "VisualStudioCode" };
  assert(searchAppDocuments(buildAppSearchDocuments([camelCaseCode]), "vscode")[0]?.id === camelCaseCode.id, "camel-case names should expose word boundaries for prefix composition");

  const separatedCode = { id: "separated-code", type: "app", name: "Visual-Studio_Code" };
  assert(searchAppDocuments(buildAppSearchDocuments([separatedCode]), "vscode")[0]?.id === separatedCode.id, "punctuation and symbols should form word boundaries for prefix composition");

  const acronymAndNumber = { id: "acronym-and-number", type: "app", name: "HTTPServer2" };
  assert(searchAppDocuments(buildAppSearchDocuments([acronymAndNumber]), "hs2")[0]?.id === acronymAndNumber.id, "acronym and letter-number boundaries should contribute separate word initials");

  const adjacentScripts = { id: "adjacent-scripts", type: "app", name: "Visual设置" };
  assert(searchAppDocuments(buildAppSearchDocuments([adjacentScripts]), "v设置")[0]?.id === adjacentScripts.id, "Latin and Han script boundaries should form separate tokens for prefix composition");

  const cpp = { id: "cpp", type: "app", name: "C++" };
  assert(searchAppDocuments(buildAppSearchDocuments([cpp]), "c++")[0]?.id === cpp.id, "tokenization should not weaken literal punctuation-bearing app names");

  assert(searchAppDocuments(mixedDocuments, "").length === 0, "an empty query should not produce search results");
  const index=createAppSearchIndex<typeof settings>();
  const first={...settings,id:"first"},second={...settings,id:"second"};
  index.update([first,second]);
  const cached=index.search("sz");
  assert(index.search("sz")===cached,"repeated queries reuse bounded results");
  assert(index.search("ＳＺ")[0]===first,"full-width input keeps the original matching semantics");
  index.update([second,first]);
  assert(index.search("sz")[0]===second,"layout order changes must update tie-breaking");
  first.name="Calculator";index.update([second,first]);
  assert(index.search("sz").length===1&&index.search("calc")[0]===first,"rename invalidates names and query results even with mutable input");
  index.update([first]);assert(index.search("sz").length===0,"removed applications cannot survive in cached results");
  const beforeEviction=index.search("calc");
  for(let i=0;i<20;i++)index.search(`query-${i}`);
  assert(index.search("calc")!==beforeEviction,"query history must evict old result arrays");
}
