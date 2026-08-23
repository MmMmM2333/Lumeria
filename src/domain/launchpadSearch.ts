import { match, pinyin } from "pinyin-pro";

const MATCH_RANK = {
  NAME_EXACT: 0,
  NAME_PREFIX: 1,
  NAME_SUBSTRING: 2,
  COMPACT_NAME_EXACT: 3,
  COMPACT_NAME_PREFIX: 4,
  COMPACT_NAME_SUBSTRING: 5,
  MULTI_WORD_ORDERED: 6,
  MULTI_WORD_UNORDERED: 7,
  WORD_INITIALS_EXACT: 8,
  WORD_INITIALS_PREFIX: 9,
  WORD_INITIALS_SUBSTRING: 10,
  WORD_PREFIX_COMPOSITION: 11,
  FULL_PINYIN_EXACT: 12,
  PINYIN_INITIALS_EXACT: 13,
  FULL_PINYIN_PREFIX: 14,
  PINYIN_INITIALS_PREFIX: 15,
  FULL_PINYIN_SUBSTRING: 16,
  PINYIN_INITIALS_SUBSTRING: 17,
  PINYIN_FALLBACK: 18,
};

export type SearchableApp = { name?: unknown };

export type AppSearchDocument<TApp extends SearchableApp = SearchableApp> = {
  app: TApp;
  originalOrder: number;
  normalizedName: string;
  compactName: string;
  nameTokens: string[];
  wordInitials: string;
  hasHanText: boolean;
  fullPinyin: string;
  pinyinInitials: string;
};

type SearchQuery = {
  normalized: string;
  compact: string;
  compactPinyin: string;
  tokens: string[];
};

type MatchMetrics = {
  tokenGapCount?: number;
  prefixRemainder?: number;
};

type SearchMatch<TApp extends SearchableApp = SearchableApp> = {
  document: AppSearchDocument<TApp>;
  rank: number;
  start: number;
  tokenGapCount: number;
  prefixRemainder: number;
  lengthDifference: number;
};

type TokenMatchState = {
  last: number;
  prefixRemainder: number;
  start: number;
  tokenGapCount: number;
};

function isSearchTokenState(value: TokenMatchState | null): value is TokenMatchState {
  return value !== null;
}

function normalizeSearchValue(value: unknown): string {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
}

function compactSearchValue(value: unknown): string {
  return normalizeSearchValue(value).replace(/[\s\p{P}\p{S}]+/gu, "");
}

function compactPinyinValue(value: unknown): string {
  return compactSearchValue(value).replaceAll("ü", "v");
}

function tokenizeSearchValue(value: unknown): string[] {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll}+)/gu, "$1 $2")
    .replace(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .replace(/(\p{Script=Latin})(\p{Script=Han})/gu, "$1 $2")
    .replace(/(\p{Script=Han})(\p{Script=Latin})/gu, "$1 $2")
    .split(/[\s\p{P}\p{S}]+/gu)
    .map(normalizeSearchValue)
    .filter(Boolean);
}

function buildSearchQuery(value: unknown): SearchQuery {
  return {
    normalized: normalizeSearchValue(value),
    compact: compactSearchValue(value),
    compactPinyin: compactPinyinValue(value),
    tokens: tokenizeSearchValue(value),
  };
}

export function buildAppSearchDocuments<TApp extends SearchableApp>(
  apps: readonly TApp[] | null | undefined,
): AppSearchDocument<TApp>[] {
  return (apps || []).map((app, originalOrder) => {
    const name = String(app?.name || "");
    const nameTokens = tokenizeSearchValue(name);
    const hasHanText = /\p{Script=Han}/u.test(name);
    return {
      app,
      originalOrder,
      normalizedName: normalizeSearchValue(name),
      compactName: compactSearchValue(name),
      nameTokens,
      wordInitials: nameTokens.map((token) => Array.from(token)[0] || "").join(""),
      hasHanText,
      fullPinyin: hasHanText
        ? compactPinyinValue(pinyin(name, { toneType: "none", type: "array" }).join(""))
        : "",
      pinyinInitials: hasHanText
        ? compactPinyinValue(pinyin(name, { pattern: "first", toneType: "none", type: "array" }).join(""))
        : "",
    };
  });
}

function makeMatch<TApp extends SearchableApp>(
  document: AppSearchDocument<TApp>,
  rank: number,
  start: number,
  targetLength: number,
  queryLength: number,
  metrics: MatchMetrics = {},
): SearchMatch<TApp> {
  return {
    document,
    rank,
    start,
    tokenGapCount: metrics.tokenGapCount || 0,
    prefixRemainder: metrics.prefixRemainder || 0,
    lengthDifference: Math.max(0, targetLength - queryLength),
  };
}

function compareTokenMatchMetrics(
  left: Pick<TokenMatchState, "start" | "tokenGapCount" | "prefixRemainder">,
  right: Pick<TokenMatchState, "start" | "tokenGapCount" | "prefixRemainder">,
): number {
  return left.tokenGapCount - right.tokenGapCount
    || left.start - right.start
    || left.prefixRemainder - right.prefixRemainder;
}

function matchOrderedMultiTokenQuery<TApp extends SearchableApp>(
  document: AppSearchDocument<TApp>,
  queryTokens: readonly string[],
): SearchMatch<TApp> | null {
  const nameTokens = document.nameTokens || [];
  if (queryTokens.length < 2 || nameTokens.length < queryTokens.length) return null;
  const firstQueryToken = queryTokens[0]!;

  let states: TokenMatchState[] = nameTokens
    .map((token, index) => token.startsWith(firstQueryToken) ? {
      last: index,
      prefixRemainder: token.length - firstQueryToken.length,
      start: index,
      tokenGapCount: 0,
    } : null)
    .filter(isSearchTokenState);

  for (let queryIndex = 1; queryIndex < queryTokens.length && states.length; queryIndex += 1) {
    const queryToken = queryTokens[queryIndex];
    const nextStates: TokenMatchState[] = [];
    for (let nameIndex = 0; nameIndex < nameTokens.length; nameIndex += 1) {
      const nameToken = nameTokens[nameIndex];
      if (!nameToken || !queryToken || !nameToken.startsWith(queryToken)) continue;
      let best: TokenMatchState | null = null;
      for (const state of states) {
        if (state.last >= nameIndex) continue;
        const candidate = {
          last: nameIndex,
          prefixRemainder: state.prefixRemainder + nameToken.length - queryToken.length,
          start: state.start,
          tokenGapCount: state.tokenGapCount + nameIndex - state.last - 1,
        };
        if (!best || compareTokenMatchMetrics(candidate, best) < 0) best = candidate;
      }
      if (best) nextStates.push(best);
    }
    states = nextStates;
  }

  if (!states.length) return null;
  const best = states.reduce((current, candidate) => (
    compareTokenMatchMetrics(candidate, current) < 0 ? candidate : current
  ));
  const queryLength = queryTokens.reduce((total, token) => total + token.length, 0);
  return makeMatch(
    document,
    MATCH_RANK.MULTI_WORD_ORDERED,
    best.start,
    document.compactName.length,
    queryLength,
    best
  );
}

function matchUnorderedMultiTokenQuery<TApp extends SearchableApp>(
  document: AppSearchDocument<TApp>,
  queryTokens: readonly string[],
): SearchMatch<TApp> | null {
  const nameTokens = document.nameTokens || [];
  if (queryTokens.length < 2 || nameTokens.length < queryTokens.length) return null;

  const availableNameTokenIndexes = new Set(nameTokens.map((_, index) => index));
  // Longer prefixes have the narrower candidate set, so claim them before a
  // shorter prefix can take the only name token that satisfies both.
  const orderedQueryTokens = queryTokens
    .map((token, originalIndex) => ({ originalIndex, token }))
    .sort((left, right) => right.token.length - left.token.length || left.originalIndex - right.originalIndex);
  const assignedNameTokenIndexes: number[] = [];
  let prefixRemainder = 0;

  for (const queryToken of orderedQueryTokens) {
    let best: { nameIndex: number; prefixRemainder: number } | null = null;
    for (const nameIndex of availableNameTokenIndexes) {
      const nameToken = nameTokens[nameIndex];
      if (!nameToken || !nameToken.startsWith(queryToken.token)) continue;
      const candidate = {
        nameIndex,
        prefixRemainder: nameToken.length - queryToken.token.length,
      };
      if (!best || candidate.prefixRemainder < best.prefixRemainder || (
        candidate.prefixRemainder === best.prefixRemainder && candidate.nameIndex < best.nameIndex
      )) best = candidate;
    }
    if (!best) return null;
    availableNameTokenIndexes.delete(best.nameIndex);
    assignedNameTokenIndexes.push(best.nameIndex);
    prefixRemainder += best.prefixRemainder;
  }

  assignedNameTokenIndexes.sort((left, right) => left - right);
  const start = assignedNameTokenIndexes[0] ?? 0;
  const end = assignedNameTokenIndexes[assignedNameTokenIndexes.length - 1] ?? start;
  const tokenGapCount = end - start + 1 - assignedNameTokenIndexes.length;
  const queryLength = queryTokens.reduce((total, token) => total + token.length, 0);
  return makeMatch(
    document,
    MATCH_RANK.MULTI_WORD_UNORDERED,
    start,
    document.compactName.length,
    queryLength,
    { prefixRemainder, tokenGapCount }
  );
}

function matchTokenPrefixComposition<TApp extends SearchableApp>(
  document: AppSearchDocument<TApp>,
  compactQuery: string,
): SearchMatch<TApp> | null {
  const tokens = document.nameTokens || [];
  if (compactQuery.length < 2 || tokens.length < 2) return null;

  // Each state consumes a non-empty prefix from consecutive name tokens.
  // Completed states are recorded but never allowed to skip into a later word.
  let best: { start: number; unmatchedChars: number } | null = null;
  for (let start = 0; start < tokens.length - 1; start += 1) {
    let states = new Map<number, number>([[0, 0]]);
    for (let tokenIndex = start; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex];
      if (!token) continue;
      const nextStates = new Map<number, number>();
      for (const [queryIndex, unmatchedChars] of states) {
        const remainingLength = compactQuery.length - queryIndex;
        const maxLength = Math.min(token.length, remainingLength);
        for (let length = 1; length <= maxLength; length += 1) {
          if (token.slice(0, length) !== compactQuery.slice(queryIndex, queryIndex + length)) break;
          const nextQueryIndex = queryIndex + length;
          const nextUnmatchedChars = unmatchedChars + token.length - length;
          const previous = nextStates.get(nextQueryIndex);
          if (previous == null || nextUnmatchedChars < previous) nextStates.set(nextQueryIndex, nextUnmatchedChars);
        }
      }

      const consumedTokenCount = tokenIndex - start + 1;
      const unmatchedChars = nextStates.get(compactQuery.length);
      if (consumedTokenCount >= 2 && unmatchedChars != null) {
        const candidate = { start, unmatchedChars };
        if (!best || candidate.start < best.start || (
          candidate.start === best.start && candidate.unmatchedChars < best.unmatchedChars
        )) best = candidate;
      }
      if (!nextStates.size) break;
      nextStates.delete(compactQuery.length);
      states = nextStates;
    }
  }

  if (!best) return null;
  return makeMatch(
    document,
    MATCH_RANK.WORD_PREFIX_COMPOSITION,
    best.start,
    document.compactName.length,
    compactQuery.length,
    { prefixRemainder: best.unmatchedChars }
  );
}

function matchDocument<TApp extends SearchableApp>(
  document: AppSearchDocument<TApp>,
  query: SearchQuery,
): SearchMatch<TApp> | null {
  const {
    compact: compactQuery,
    compactPinyin: compactPinyinQuery,
    normalized: normalizedQuery,
    tokens: queryTokens,
  } = query;
  const nameStart = document.normalizedName.indexOf(normalizedQuery);
  if (document.normalizedName === normalizedQuery) return makeMatch(document, MATCH_RANK.NAME_EXACT, 0, document.normalizedName.length, normalizedQuery.length);
  if (nameStart === 0) return makeMatch(document, MATCH_RANK.NAME_PREFIX, 0, document.normalizedName.length, normalizedQuery.length);
  if (nameStart > 0) return makeMatch(document, MATCH_RANK.NAME_SUBSTRING, nameStart, document.normalizedName.length, normalizedQuery.length);
  if (!compactQuery) return null;

  const compactNameStart = document.compactName.indexOf(compactQuery);
  if (document.compactName === compactQuery) return makeMatch(document, MATCH_RANK.COMPACT_NAME_EXACT, 0, document.compactName.length, compactQuery.length);
  if (compactNameStart === 0) return makeMatch(document, MATCH_RANK.COMPACT_NAME_PREFIX, 0, document.compactName.length, compactQuery.length);
  if (compactNameStart > 0) return makeMatch(document, MATCH_RANK.COMPACT_NAME_SUBSTRING, compactNameStart, document.compactName.length, compactQuery.length);

  const orderedMultiTokenMatch = matchOrderedMultiTokenQuery(document, queryTokens);
  if (orderedMultiTokenMatch) return orderedMultiTokenMatch;
  const unorderedMultiTokenMatch = matchUnorderedMultiTokenQuery(document, queryTokens);
  if (unorderedMultiTokenMatch) return unorderedMultiTokenMatch;

  if (compactQuery.length >= 2 && document.wordInitials === compactQuery) {
    return makeMatch(document, MATCH_RANK.WORD_INITIALS_EXACT, 0, document.wordInitials.length, compactQuery.length);
  }
  if (compactQuery.length >= 2 && document.wordInitials.startsWith(compactQuery)) {
    return makeMatch(document, MATCH_RANK.WORD_INITIALS_PREFIX, 0, document.wordInitials.length, compactQuery.length);
  }
  const wordInitialsStart = compactQuery.length >= 2 ? document.wordInitials.indexOf(compactQuery) : -1;
  if (wordInitialsStart > 0) {
    return makeMatch(document, MATCH_RANK.WORD_INITIALS_SUBSTRING, wordInitialsStart, document.wordInitials.length, compactQuery.length);
  }

  const wordPrefixComposition = matchTokenPrefixComposition(document, compactQuery);
  if (wordPrefixComposition) return wordPrefixComposition;

  const fullPinyinStart = document.fullPinyin.indexOf(compactPinyinQuery);
  const initialsStart = document.pinyinInitials.indexOf(compactPinyinQuery);
  if (document.fullPinyin === compactPinyinQuery) return makeMatch(document, MATCH_RANK.FULL_PINYIN_EXACT, 0, document.fullPinyin.length, compactPinyinQuery.length);
  if (document.pinyinInitials === compactPinyinQuery) return makeMatch(document, MATCH_RANK.PINYIN_INITIALS_EXACT, 0, document.pinyinInitials.length, compactPinyinQuery.length);
  if (fullPinyinStart === 0) return makeMatch(document, MATCH_RANK.FULL_PINYIN_PREFIX, 0, document.fullPinyin.length, compactPinyinQuery.length);
  if (initialsStart === 0) return makeMatch(document, MATCH_RANK.PINYIN_INITIALS_PREFIX, 0, document.pinyinInitials.length, compactPinyinQuery.length);
  if (fullPinyinStart > 0) return makeMatch(document, MATCH_RANK.FULL_PINYIN_SUBSTRING, fullPinyinStart, document.fullPinyin.length, compactPinyinQuery.length);
  if (initialsStart > 0) return makeMatch(document, MATCH_RANK.PINYIN_INITIALS_SUBSTRING, initialsStart, document.pinyinInitials.length, compactPinyinQuery.length);
  // Alternate-reading lookup only adds information for Han text and is much
  // more expensive than the precomputed literal and pinyin fields above.
  if (!document.hasHanText || compactPinyinQuery.length < 2 || !/^[a-zv]+$/.test(compactPinyinQuery)) return null;

  const matchedIndexes = match(String(document.app?.name || ""), compactPinyinQuery, {
    continuous: true,
    insensitive: true,
    v: true,
  });
  if (matchedIndexes?.length) {
    return makeMatch(document, MATCH_RANK.PINYIN_FALLBACK, matchedIndexes[0] ?? 0, document.normalizedName.length, matchedIndexes.length);
  }
  return null;
}

function isSearchMatch<TApp extends SearchableApp>(
  value: SearchMatch<TApp> | null,
): value is SearchMatch<TApp> {
  return value !== null;
}

export function searchAppDocuments<TApp extends SearchableApp>(
  documents: readonly AppSearchDocument<TApp>[] | null | undefined,
  query: unknown,
): TApp[] {
  const searchQuery = buildSearchQuery(query);
  if (!searchQuery.normalized) return [];
  return (documents || [])
    .map((document) => matchDocument(document, searchQuery))
    .filter(isSearchMatch)
    .sort((left, right) => (
      left.rank - right.rank
      || left.tokenGapCount - right.tokenGapCount
      || left.start - right.start
      || left.prefixRemainder - right.prefixRemainder
      || left.lengthDifference - right.lengthDifference
      || left.document.originalOrder - right.document.originalOrder
    ))
    .map((match) => match.document.app);
}
