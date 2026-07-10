import { buildAppSearchDocuments, searchAppDocuments } from "./launchpadSearch.js";

const assert = (condition, message) => {
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
  assert(searchAppDocuments(mixedDocuments, "").length === 0, "an empty query should not produce search results");
}
