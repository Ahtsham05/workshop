/**
 * Matches a line from a supplier price list ("Galaxy A15 4/128") to a product in the catalog
 * ("Samsung Galaxy A15 4GB/128GB Black").
 *
 * The one thing this module must never do is confidently pair two DIFFERENT products, because
 * the consequence is the wrong price written onto a real item. Generic fuzzy string similarity
 * is the wrong tool for that: "Galaxy A15 4/128" and "Galaxy A15 6/128" differ by one character,
 * "iPhone 15 Pro" and "iPhone 15 Pro Max" are a substring of each other, and in a price list
 * those are exactly the pairs that carry very different prices. So tokens are split into
 *
 *   - hard tokens: anything with a digit — models (a15, 13c), numbers (15), RAM/ROM pairs
 *     (4/128), storage (128gb), dimensions (20w, 5000mah). Two names that DISAGREE on a hard token
 *     of the same kind are different products, full stop.
 *   - soft tokens: words (samsung, galaxy). These match fuzzily (typos, spelling variants).
 *
 * and a match is only ever "high" — safe to pre-select — when the hard tokens agree in both
 * directions, no variant word (pro/max/plus/pta/non...) is missing or extra, the words cover
 * the query, and no second product scores about the same. Everything else is "review" (a
 * suggestion the user must confirm) or unmatched. See tests/unit/utils/priceMatcher.test.js.
 *
 * Pure functions, no I/O.
 */

const { normalizeDigits } = require('./importRow');

const HIGH_SCORE = 0.86;
const REVIEW_SCORE = 0.66;
const SUGGEST_SCORE = 0.4;
const AMBIGUITY_GAP = 0.04;
const MAX_CANDIDATES = 80;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'of', 'new', 'original', 'orig', 'genuine', 'official', 'pcs', 'pc',
  'piece', 'pieces', 'only', 'price', 'rate', 'rs', 'pkr', 'available', 'stock', 'offer', 'set',
]);

// Words that turn one product into a different (differently priced) one. Present on one side
// only, they block a "high" match ("iPhone 15 Pro" vs "iPhone 15 Pro Max", "PTA" vs "Non PTA").
const VARIANT_WORDS = new Set([
  'pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'fe', 'se', 'prime', 'power', 'neo', 'edge',
  'fold', 'flip', 'air', 'go', 'turbo', 'gt', 'xl', 'note', 'pta', 'non', 'nonpta', 'dual',
  'single', 'esim', 'refurbished', 'used', 'open', 'box', 'active', 'core',
]);

const STORAGE_GB = new Set([8, 16, 32, 64, 128, 256, 512, 1024, 2048]);
const DIM_UNITS = 'mah|mp|hz|w|inch|mm|cm|m|kg|g|ml|l|v|a';

// ─── Tokenizing ──────────────────────────────────────────────────────────────

const stripAccents = (text) => text.normalize('NFKD').replace(/[\u0300-\u036F]/g, '');

/**
 * Normalizes spec notation so every way of writing it lands on one token:
 * "4GB/128GB", "4gb ram 128gb rom", "4+128", "4 / 128" → "4/128"; "1TB" → "1024gb";
 * "20 W", "20 watt" → "20w"; "6.7 inch", "6.7\"" → "6.7inch".
 */
const normalizeSpecs = (text) => {
  let s = text;
  s = s.replace(/(\d{1,2})\s*gb\s*(?:ram)?[\s,/+&-]*(\d{2,4})\s*gb(?:\s*rom)?/g, '$1/$2 ');
  s = s.replace(/(\d{1,2})\s*[/+]\s*(\d{1,4})(?!\d)/g, (m, ram, rom) =>
    Number(ram) <= 24 && (STORAGE_GB.has(Number(rom)) || Number(rom) <= 2) ? `${ram}/${rom} ` : m,
  );
  s = s.replace(/\b(\d{1,2})-(\d{2,4})\b/g, (m, ram, rom) =>
    Number(ram) <= 24 && STORAGE_GB.has(Number(rom)) ? `${ram}/${rom} ` : m,
  );
  s = s.replace(/(\d+(?:\.\d+)?)\s*tb\b/g, (m, n) => `${Math.round(Number(n) * 1024)}gb `);
  s = s.replace(/(\d+)\s*gb\b/g, '$1gb ');
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:inch|inches|in\b|"|”|″)/g, '$1inch ');
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:watts?)\b/g, '$1w ');
  s = s.replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s+(${DIM_UNITS})\\b`, 'g'), '$1$2 ');
  return s;
};

const classify = (token) => {
  if (/^\d+\/\d+$/.test(token)) return 'pair';
  if (/^\d+gb$/.test(token)) return 'storage';
  if (new RegExp(`^\\d+(?:\\.\\d+)?(?:${DIM_UNITS}|inch)$`).test(token)) return 'dim';
  if (/^[\d.]+$/.test(token)) return 'num';
  if (/\d/.test(token)) return 'model';
  return 'word';
};

/** Splits "iphone15" → iphone + 15 and "15pro" → 15 + pro; leaves real model codes (a15) alone. */
const splitGlued = (token) => {
  let m = token.match(/^([a-z]{4,})(\d+[a-z]?)$/);
  if (m) return [m[1], m[2]];
  m = token.match(/^(\d+)(pro|max|plus|ultra|mini|lite|fe)$/);
  if (m) return [m[1], m[2]];
  return [token];
};

/**
 * @returns {{ soft: string[], hard: Map<string,string>, compact: string, tokens: string[] }}
 *   `hard` maps token → class (pair|storage|dim|model|num).
 */
const tokenize = (text) => {
  const base = stripAccents(normalizeDigits(String(text || '')))
    .toLowerCase()
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '');
  const spec = normalizeSpecs(base);
  const raw = spec
    .replace(/[^\p{L}\p{N}/.\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[/.]+|[/.]+$/g, ''))
    .filter(Boolean);

  const tokens = [];
  raw.forEach((t) => {
    if (t.includes('/') && !/^\d+\/\d+$/.test(t)) t.split('/').filter(Boolean).forEach((p) => tokens.push(...splitGlued(p)));
    else tokens.push(...splitGlued(t));
  });

  const soft = [];
  const hard = new Map();
  const kept = [];
  tokens.forEach((t) => {
    const cls = classify(t);
    if (cls === 'word') {
      if (STOP_WORDS.has(t) || (t.length < 2 && !/\p{N}/u.test(t))) return;
      soft.push(t);
      kept.push(t);
      return;
    }
    // A pair carries its storage too, so "4/128" also satisfies a product that only says "128GB".
    hard.set(t, cls);
    kept.push(t);
    if (cls === 'pair') hard.set(`${t.split('/')[1]}gb`, 'storage');
  });

  return { soft: [...new Set(soft)], hard, tokens: kept, compact: kept.join('').replace(/[^\p{L}\p{N}]/gu, '') };
};

// ─── Fuzzy word comparison ───────────────────────────────────────────────────

/** Edit distance, abandoning early once it must exceed `max` (words are short; this is hot). */
const withinDistance = (a, b, max) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
};

/** 1 for identical words, 0.8 for a typo-sized difference (only on longer words), else 0. */
const wordSimilarity = (a, b) => {
  if (a === b) return 1;
  const len = Math.min(a.length, b.length);
  if (len >= 8 && withinDistance(a, b, 2)) return 0.8;
  if (len >= 5 && withinDistance(a, b, 1)) return 0.8;
  return 0;
};

// ─── Index ───────────────────────────────────────────────────────────────────

const codeKey = (value) => String(value || '').trim().toLowerCase();

/**
 * @param {Array<{ id: string, name: string, nameUrdu?: string, barcode?: string, sku?: string }>} entries
 */
const buildCatalogIndex = (entries) => {
  const list = [];
  const byToken = new Map();
  const byCode = new Map();
  const byCompact = new Map();
  const vocab = new Set();

  entries.forEach((entry) => {
    const primary = tokenize(entry.name);
    const urdu = entry.nameUrdu ? tokenize(entry.nameUrdu) : null;
    const soft = urdu ? [...new Set([...primary.soft, ...urdu.soft])] : primary.soft;
    const hard = new Map(primary.hard);
    if (urdu) urdu.hard.forEach((cls, t) => hard.set(t, cls));

    const position = list.length;
    list.push({ entry, soft, softSet: new Set(soft), hard, compact: primary.compact, compactUrdu: urdu ? urdu.compact : '' });

    [...soft, ...hard.keys()].forEach((t) => {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(position);
    });
    soft.forEach((t) => vocab.add(t));

    [entry.barcode, entry.sku].forEach((code) => {
      const key = codeKey(code);
      if (key.length >= 3 && !byCode.has(key)) byCode.set(key, position);
    });
    [primary.compact, urdu ? urdu.compact : ''].forEach((c) => {
      if (!c) return;
      if (!byCompact.has(c)) byCompact.set(c, []);
      byCompact.get(c).push(position);
    });
  });

  return { list, byToken, byCode, byCompact, vocab: [...vocab], fuzzyCache: new Map() };
};

/** Catalog words within typo distance of `word` (cached; the vocabulary is a few thousand words). */
const similarVocabulary = (index, word) => {
  if (index.fuzzyCache.has(word)) return index.fuzzyCache.get(word);
  const found = [];
  if (word.length >= 5) {
    index.vocab.forEach((v) => {
      if (v !== word && wordSimilarity(word, v) > 0) found.push(v);
    });
  }
  index.fuzzyCache.set(word, found);
  return found;
};

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Compares a query against one catalog entry.
 * @returns {{ score: number, flags: string[], hardExact: boolean, softCov: number, softPrec: number, contextHit: boolean }}
 */
const scorePair = (query, item) => {
  const flags = [];

  // ── hard tokens ──
  const matchedHard = [];
  const missingFromProduct = new Map(); // in the query, not the product
  query.hard.forEach((cls, t) => {
    if (item.hard.has(t)) matchedHard.push(t);
    else missingFromProduct.set(t, cls);
  });
  const extraInProduct = new Map(); // in the product, not the query
  item.hard.forEach((cls, t) => {
    if (!query.hard.has(t)) extraInProduct.set(t, cls);
  });

  const classesMissing = new Set(missingFromProduct.values());
  const conflict = [...extraInProduct.values()].some((cls) => classesMissing.has(cls));
  const hardExact = missingFromProduct.size === 0 && extraInProduct.size === 0;

  // ── soft tokens (query words + optional section words) ──
  let softHit = 0;
  const explained = new Set();
  query.soft.forEach((word) => {
    let best = 0;
    let bestWord = null;
    item.soft.forEach((w) => {
      const sim = wordSimilarity(word, w);
      if (sim > best) {
        best = sim;
        bestWord = w;
      }
    });
    softHit += best;
    if (bestWord) explained.add(bestWord);
    if (best > 0 && best < 1 && !flags.includes('fuzzy_words')) flags.push('fuzzy_words');
  });

  // Section words only ever help: counted when the product has them, ignored when it doesn't.
  let contextHit = false;
  let contextTotal = 0;
  query.context.forEach((word) => {
    if (item.softSet.has(word)) {
      contextHit = true;
      contextTotal += 1;
      explained.add(word);
    }
  });

  const softDenominator = query.soft.length + contextTotal;
  const softNumerator = softHit + contextTotal;
  const softCov = softDenominator ? softNumerator / softDenominator : 0;
  const softPrec = item.soft.length ? explained.size / item.soft.length : 0;

  // ── variant words ──
  const variantOf = (words) => words.filter((w) => VARIANT_WORDS.has(w));
  const qVariants = new Set(variantOf(query.soft));
  const pVariants = new Set(variantOf(item.soft));
  const variantMismatch = [...qVariants].some((w) => !pVariants.has(w)) || [...pVariants].some((w) => !qVariants.has(w));

  // ── combine ──
  const hardScore =
    !query.hard.size && !item.hard.size
      ? null
      : !query.hard.size || !item.hard.size
        ? 0.55
        : 0.65 * (matchedHard.length / query.hard.size) + 0.35 * (matchedHard.length / item.hard.size);
  const softScore =
    !softDenominator && !item.soft.length
      ? null
      : !softDenominator || !item.soft.length
        ? 0.5
        : 0.65 * softCov + 0.35 * softPrec;

  let score;
  if (hardScore === null && softScore === null) score = 0;
  else if (hardScore === null) score = softScore;
  else if (softScore === null) score = hardScore;
  else score = 0.4 * softScore + 0.6 * hardScore;

  if (conflict) {
    score = Math.min(score, 0.62);
    flags.push('spec_conflict');
  }
  if (!conflict && extraInProduct.size) flags.push('product_more_specific');
  if (!conflict && missingFromProduct.size) flags.push('query_more_specific');
  if (variantMismatch) {
    score = Math.min(score, 0.8);
    flags.push('variant_word');
  }
  if (query.context.length && contextHit) flags.push('section_used');

  // A section word breaks ties between otherwise equal candidates; it never lifts a score itself.
  const ranking = score + (contextHit ? 0.004 : 0);
  const pinned = hardExact && query.hard.size > 0;
  return { score, ranking, flags, hardExact, pinned, variantMismatch, softCov, softPrec, contextHit, conflict };
};

const prepareQuery = ({ name, section, codes }) => {
  const own = tokenize(name);
  const ownSet = new Set(own.soft);
  const context = section
    ? tokenize(section).soft.filter((w) => !ownSet.has(w) && !VARIANT_WORDS.has(w))
    : [];
  return { ...own, context, codes: (codes || []).map(codeKey).filter(Boolean), rawName: name };
};

/**
 * Candidate positions worth scoring: everything sharing one of the query's rarest tokens.
 * Scoring the whole catalog per query is what makes naive fuzzy matching unusable at 500 lines
 * x 20,000 products; a shared *rare* token (a model number) is a cheap, sound pre-filter.
 */
const gatherCandidates = (index, query) => {
  const tokens = [...query.hard.keys(), ...query.soft];
  const expanded = [];
  tokens.forEach((t) => {
    if (index.byToken.has(t)) expanded.push(t);
    else if (!query.hard.has(t)) similarVocabulary(index, t).forEach((v) => expanded.push(v));
  });

  const ranked = [...new Set(expanded)]
    .map((t) => ({ t, df: index.byToken.get(t).length }))
    .sort((a, b) => a.df - b.df);

  const shared = new Map();
  let taken = 0;
  ranked.forEach(({ t, df }) => {
    // Rarest tokens always; common ones (a brand) only while the pool is still small.
    if (taken >= 4 && df > 300) return;
    taken += 1;
    index.byToken.get(t).forEach((pos) => shared.set(pos, (shared.get(pos) || 0) + 1));
  });

  return [...shared.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CANDIDATES)
    .map(([pos]) => pos);
};

/**
 * @param {ReturnType<typeof buildCatalogIndex>} index
 * @param {{ name: string, section?: string|null, codes?: string[] }} row
 * @param {{ limit?: number }} [options]
 * @returns {{
 *   status: 'high'|'review'|'none', method: 'code'|'exact'|'name'|null, score: number,
 *   entry: object|null, flags: string[],
 *   alternatives: Array<{ entry: object, score: number, flags: string[] }>,
 * }}
 */
const matchRow = (index, row, options = {}) => {
  const limit = options.limit || 4;
  const none = { status: 'none', method: null, score: 0, entry: null, flags: [], alternatives: [] };
  if (!index.list.length) return none;

  const query = prepareQuery(row);

  // 1. A barcode/SKU is authoritative — checked before any name logic.
  // A SKU written inside the name ("Buds SM-R510") is split at its hyphen by the tokenizer, so
  // whole whitespace-delimited chunks are looked up too.
  const rawChunks = String(row.name || '')
    .split(/[\s,;|]+/)
    .map((c) => codeKey(c.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')))
    .filter((c) => c.length >= 4 && /\d/.test(c));
  const nameTokens = query.tokens.filter((t) => t.length >= 4 && /\d/.test(t));
  const codeHit = [...query.codes, ...rawChunks, ...nameTokens].map((c) => index.byCode.get(c)).find((pos) => pos !== undefined);
  if (codeHit !== undefined) {
    return { status: 'high', method: 'code', score: 1, entry: index.list[codeHit].entry, flags: [], alternatives: [] };
  }

  if (!query.tokens.length) return none;

  // 2. Identical name once spelling/spec notation is normalized. Several products sharing it
  //    (e.g. two "Charger" entries) is ambiguous, not exact.
  const sameName = index.byCompact.get(query.compact);
  if (sameName && sameName.length === 1 && query.compact.length >= 3) {
    return { status: 'high', method: 'exact', score: 1, entry: index.list[sameName[0]].entry, flags: [], alternatives: [] };
  }

  // 3. Scored match.
  const scored = gatherCandidates(index, query)
    .map((pos) => ({ pos, ...scorePair(query, index.list[pos]) }))
    .filter((c) => c.score >= SUGGEST_SCORE)
    .sort((a, b) => b.ranking - a.ranking);
  if (sameName && sameName.length > 1) {
    // Same name on several products: surface them all, and force a human choice.
    sameName.forEach((pos) => {
      const found = scored.find((c) => c.pos === pos);
      if (found) found.flags.push('ambiguous');
    });
  }
  if (!scored.length) return none;

  const top = scored[0];
  const runnerUp = scored.find((c) => c.pos !== top.pos);
  const ambiguous =
    Boolean(runnerUp) && top.score - runnerUp.score < AMBIGUITY_GAP && runnerUp.score >= REVIEW_SCORE;
  const flags = [...top.flags];
  if (ambiguous && !flags.includes('ambiguous')) flags.push('ambiguous');

  const hasOwnWords = query.soft.length > 0;
  const isHigh =
    top.score >= HIGH_SCORE &&
    top.hardExact &&
    !top.variantMismatch &&
    !top.conflict &&
    !ambiguous &&
    !flags.includes('ambiguous') &&
    // When the model/spec tokens pin the product down, a missing brand word is harmless
    // ("Hot 40i 4/128" is the Infinix); without them, words alone must explain the product.
    (hasOwnWords ? top.softCov >= 0.8 && top.softPrec >= (top.pinned ? 0.4 : 0.6) : top.contextHit);

  let status = 'none';
  if (isHigh) status = 'high';
  else if (top.score >= REVIEW_SCORE) status = 'review';

  const alternatives = scored
    .filter((c) => c.pos !== top.pos)
    .slice(0, limit)
    .map((c) => ({ entry: index.list[c.pos].entry, score: round(c.score), flags: c.flags }));

  if (status === 'none') {
    // Below the review bar: nothing is linked, but the best guesses are still offered.
    return {
      status,
      method: null,
      score: round(top.score),
      entry: null,
      flags: [],
      alternatives: [{ entry: index.list[top.pos].entry, score: round(top.score), flags: top.flags }, ...alternatives].slice(0, limit),
    };
  }

  return { status, method: 'name', score: round(top.score), entry: index.list[top.pos].entry, flags, alternatives };
};

const round = (n) => Math.round(n * 1000) / 1000;

/** Stable key for "remember this line means that product" (see PriceListAlias). */
const aliasKey = (name) => tokenize(name).tokens.join(' ');

module.exports = {
  buildCatalogIndex,
  matchRow,
  tokenize,
  aliasKey,
  HIGH_SCORE,
  REVIEW_SCORE,
  SUGGEST_SCORE,
};
