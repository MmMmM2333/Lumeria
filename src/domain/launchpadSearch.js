import { match, pinyin } from "pinyin-pro";

function normalizeSearchValue(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
}

function compactSearchValue(value) {
  return normalizeSearchValue(value).replace(/[\s\p{P}\p{S}]+/gu, "");
}

function compactPinyinValue(value) {
  return compactSearchValue(value).replaceAll("ü", "v");
}

export function buildAppSearchDocuments(apps) {
  return (apps || []).map((app, originalOrder) => ({
    app,
    originalOrder,
    normalizedName: normalizeSearchValue(app?.name),
    fullPinyin: compactPinyinValue(pinyin(app?.name || "", { toneType: "none", type: "array" }).join("")),
    pinyinInitials: compactPinyinValue(pinyin(app?.name || "", { pattern: "first", toneType: "none", type: "array" }).join("")),
  }));
}

function makeMatch(document, rank, start, targetLength, queryLength) {
  return {
    document,
    rank,
    start,
    lengthDifference: Math.max(0, targetLength - queryLength),
  };
}

function matchDocument(document, normalizedQuery, compactQuery) {
  const nameStart = document.normalizedName.indexOf(normalizedQuery);
  if (document.normalizedName === normalizedQuery) return makeMatch(document, 0, 0, document.normalizedName.length, normalizedQuery.length);
  if (nameStart === 0) return makeMatch(document, 1, 0, document.normalizedName.length, normalizedQuery.length);
  if (nameStart > 0) return makeMatch(document, 2, nameStart, document.normalizedName.length, normalizedQuery.length);
  if (!compactQuery) return null;

  const fullPinyinStart = document.fullPinyin.indexOf(compactQuery);
  const initialsStart = document.pinyinInitials.indexOf(compactQuery);
  if (document.fullPinyin === compactQuery) return makeMatch(document, 3, 0, document.fullPinyin.length, compactQuery.length);
  if (document.pinyinInitials === compactQuery) return makeMatch(document, 4, 0, document.pinyinInitials.length, compactQuery.length);
  if (fullPinyinStart === 0) return makeMatch(document, 5, 0, document.fullPinyin.length, compactQuery.length);
  if (initialsStart === 0) return makeMatch(document, 6, 0, document.pinyinInitials.length, compactQuery.length);
  if (fullPinyinStart > 0) return makeMatch(document, 7, fullPinyinStart, document.fullPinyin.length, compactQuery.length);
  if (initialsStart > 0) return makeMatch(document, 8, initialsStart, document.pinyinInitials.length, compactQuery.length);
  if (compactQuery.length < 2 || !/^[a-zv]+$/.test(compactQuery)) return null;

  const matchedIndexes = match(document.app?.name || "", compactQuery, {
    continuous: true,
    insensitive: true,
    v: true,
  });
  if (matchedIndexes?.length) {
    return makeMatch(document, 9, matchedIndexes[0], document.normalizedName.length, matchedIndexes.length);
  }
  return null;
}

export function searchAppDocuments(documents, query) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return [];
  const compactQuery = compactPinyinValue(query);
  return (documents || [])
    .map((document) => matchDocument(document, normalizedQuery, compactQuery))
    .filter(Boolean)
    .sort((left, right) => (
      left.rank - right.rank
      || left.start - right.start
      || left.lengthDifference - right.lengthDifference
      || left.document.originalOrder - right.document.originalOrder
    ))
    .map((match) => match.document.app);
}
