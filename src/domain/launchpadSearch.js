import { match, pinyin } from "pinyin-pro";

const MATCH_RANK = {
  NAME_EXACT: 0,
  NAME_PREFIX: 1,
  NAME_SUBSTRING: 2,
  FULL_PINYIN_EXACT: 3,
  PINYIN_INITIALS_EXACT: 4,
  FULL_PINYIN_PREFIX: 5,
  PINYIN_INITIALS_PREFIX: 6,
  FULL_PINYIN_SUBSTRING: 7,
  PINYIN_INITIALS_SUBSTRING: 8,
  PINYIN_FALLBACK: 9,
};

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
  if (document.normalizedName === normalizedQuery) return makeMatch(document, MATCH_RANK.NAME_EXACT, 0, document.normalizedName.length, normalizedQuery.length);
  if (nameStart === 0) return makeMatch(document, MATCH_RANK.NAME_PREFIX, 0, document.normalizedName.length, normalizedQuery.length);
  if (nameStart > 0) return makeMatch(document, MATCH_RANK.NAME_SUBSTRING, nameStart, document.normalizedName.length, normalizedQuery.length);
  if (!compactQuery) return null;

  const fullPinyinStart = document.fullPinyin.indexOf(compactQuery);
  const initialsStart = document.pinyinInitials.indexOf(compactQuery);
  if (document.fullPinyin === compactQuery) return makeMatch(document, MATCH_RANK.FULL_PINYIN_EXACT, 0, document.fullPinyin.length, compactQuery.length);
  if (document.pinyinInitials === compactQuery) return makeMatch(document, MATCH_RANK.PINYIN_INITIALS_EXACT, 0, document.pinyinInitials.length, compactQuery.length);
  if (fullPinyinStart === 0) return makeMatch(document, MATCH_RANK.FULL_PINYIN_PREFIX, 0, document.fullPinyin.length, compactQuery.length);
  if (initialsStart === 0) return makeMatch(document, MATCH_RANK.PINYIN_INITIALS_PREFIX, 0, document.pinyinInitials.length, compactQuery.length);
  if (fullPinyinStart > 0) return makeMatch(document, MATCH_RANK.FULL_PINYIN_SUBSTRING, fullPinyinStart, document.fullPinyin.length, compactQuery.length);
  if (initialsStart > 0) return makeMatch(document, MATCH_RANK.PINYIN_INITIALS_SUBSTRING, initialsStart, document.pinyinInitials.length, compactQuery.length);
  if (compactQuery.length < 2 || !/^[a-zv]+$/.test(compactQuery)) return null;

  const matchedIndexes = match(document.app?.name || "", compactQuery, {
    continuous: true,
    insensitive: true,
    v: true,
  });
  if (matchedIndexes?.length) {
    return makeMatch(document, MATCH_RANK.PINYIN_FALLBACK, matchedIndexes[0], document.normalizedName.length, matchedIndexes.length);
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
