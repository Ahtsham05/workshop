/**
 * Word-based list search shared by paginate.plugin.js and the product list.
 *
 * The old behaviour escaped the whole query and matched it as ONE contiguous substring, so
 * "jbl speaker" never found "JBL Flip 6 Bluetooth Speaker" (the words are not adjacent).
 * Now the query is split into words; every word must appear (any order, any gap) in at
 * least one of the searched fields. Each word is regex-escaped, so user input stays safe.
 */
const MAX_TOKENS = 8;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const tokenizeSearch = (search) => {
  const seen = new Set();
  return String(search || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TOKENS);
};

const parseFields = (fieldName) =>
  String(fieldName || '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

/** `{ $and: [ {$or: fields match word1}, {$or: fields match word2}, ... ] }`, or null when there is nothing to search. */
const buildTokenSearchMatch = (search, fieldName) => {
  const tokens = tokenizeSearch(search);
  const fields = parseFields(fieldName);
  if (tokens.length === 0 || fields.length === 0) return null;
  return {
    $and: tokens.map((token) => {
      const escaped = escapeRegex(token);
      return { $or: fields.map((field) => ({ [field]: { $regex: escaped, $options: 'i' } })) };
    }),
  };
};

/** Adds the search to `filter` without clobbering an `$or`/`$and` the caller already set. */
const applyTokenSearch = (filter, search, fieldName) => {
  const match = buildTokenSearchMatch(search, fieldName);
  if (!match) return filter;
  return { ...filter, $and: [...(filter && filter.$and ? filter.$and : []), ...match.$and] };
};

/**
 * Clauses (to spread into an `$and`) for hand-written list searches: every word of `search`
 * must match at least one of `fields`. `[]` when there is nothing to search.
 */
const tokenSearchClauses = (search, fields) => {
  const match = buildTokenSearchMatch(search, Array.isArray(fields) ? fields.join(',') : fields);
  return match ? match.$and : [];
};

/** Same as tokenSearchClauses, merged into an existing filter object (keeps its `$and`). */
const withTokenSearch = (filter, search, fields) => {
  const clauses = tokenSearchClauses(search, fields);
  if (clauses.length === 0) return filter;
  return { ...filter, $and: [...(filter.$and || []), ...clauses] };
};

/** In-place variant of withTokenSearch for code that builds a filter object it already owns. */
const addTokenSearch = (filter, search, fields) => {
  const clauses = tokenSearchClauses(search, fields);
  if (clauses.length > 0) filter.$and = [...(filter.$and || []), ...clauses];
  return filter;
};

/**
 * In-memory relevance score of one text against a search (higher = better). Mirrors the
 * Mongo-side score in product.service.js: exact > starts-with > contiguous phrase > starts with
 * first word / ends with last word > per-word hits.
 */
const scoreText = (text, search, tokens = tokenizeSearch(search)) => {
  const t = String(text || '').toLowerCase();
  if (!t || tokens.length === 0) return 0;
  const phrase = tokens.map((w) => w.toLowerCase()).join(' ');
  const words = tokens.map((w) => w.toLowerCase());
  const norm = t.replace(/\s+/g, ' ').trim();
  let score = 0;
  if (norm === phrase) score += 1000;
  if (norm.startsWith(phrase)) score += 500;
  if (norm.includes(phrase)) score += 300;
  if (norm.startsWith(words[0])) score += 120;
  if (words.length > 1 && norm.endsWith(words[words.length - 1])) score += 80;
  words.forEach((w) => {
    if (new RegExp(`(^|[^a-z0-9])${escapeRegex(w)}`).test(norm)) score += 30;
    if (new RegExp(`(^|[^a-z0-9])${escapeRegex(w)}([^a-z0-9]|$)`).test(norm)) score += 20;
    if (norm.includes(w)) score += 10;
  });
  return score;
};

/** Score of a lean document: best of its name-like `fields`, exact hit on `exactFields` wins outright. */
const scoreDocument = (doc, search, { nameFields, exactFields = [] }) => {
  const tokens = tokenizeSearch(search);
  const lower = String(search).trim().toLowerCase();
  if (exactFields.some((f) => String(doc[f] || '').toLowerCase() === lower)) return 900;
  return nameFields.reduce((best, f, i) => Math.max(best, scoreText(doc[f], search, tokens) - i), 0);
};

/** Stable best-match-first ordering of already-fetched docs (ties keep their incoming order). */
const rankDocuments = (docs, search, fields) => {
  const list = parseFields(fields);
  if (!search || list.length === 0) return docs;
  const scored = docs.map((doc, index) => ({
    doc,
    index,
    score: scoreDocument(doc, search, { nameFields: list, exactFields: list }),
  }));
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.doc);
};

module.exports = {
  rankDocuments,
  escapeRegex,
  tokenizeSearch,
  parseFields,
  buildTokenSearchMatch,
  applyTokenSearch,
  tokenSearchClauses,
  withTokenSearch,
  addTokenSearch,
  scoreText,
  scoreDocument,
};
