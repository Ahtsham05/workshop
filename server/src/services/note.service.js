const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Note } = require('../models');

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : id);

const MAX_CONTENT_LENGTH = 200000; // ~200 KB of HTML per note

/** Tags arrive from a free-text input — normalize so "VAT", " vat " and "vat" are one tag. */
const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) return undefined;
  const seen = new Set();
  const out = [];
  tags.forEach((raw) => {
    const tag = String(raw || '').trim().slice(0, 40);
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tag);
  });
  return out.slice(0, 20);
};

const stripHtmlOnce = (html) =>
  String(html)
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(div|p|li|h1|h2|h3|blockquote|pre|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** Text that is still markup after one strip — i.e. markup that arrived HTML-entity-escaped. */
const stillLooksLikeMarkup = (text) => {
  const trimmed = text.trim();
  return trimmed.startsWith('<') && trimmed.includes('</') && /<[a-z][^>]*>/i.test(trimmed);
};

/**
 * Strip the editor HTML down to searchable text.
 * Block-level tags become newlines so "line 1<div>line 2</div>" does not search
 * as "line 1line 2", and checkbox markers survive as [ ] / [x].
 *
 * Repeats the strip when the result still looks like markup — mirrors the client's
 * own `htmlToPlainText` (lib/note-text.ts), for the same reason: a single pass
 * strips real tags first and only decodes `&lt;`/`&gt;` afterward, so content that
 * arrived HTML-entity-escaped (e.g. from the xss-clean middleware bug that used to
 * double-encode this field — fixed in app.js, but pre-existing notes saved under it
 * are still stored that way) decodes into visible `<div>` text instead of being
 * stripped. A second pass over the now-decoded text strips it for real.
 */
const toPlainText = (html) => {
  if (!html) return '';
  let text = stripHtmlOnce(html);
  for (let pass = 0; pass < 3 && stillLooksLikeMarkup(text); pass += 1) {
    text = stripHtmlOnce(text);
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
};

/**
 * Remove the handful of HTML constructs that could execute if a shared note were
 * rendered for another user. The editor only ever produces formatting markup, so
 * anything below is either paste residue or an attack.
 */
const sanitizeContent = (html) => {
  if (!html) return '';
  let out = String(html).slice(0, MAX_CONTENT_LENGTH);
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, '');
  // on* handlers, javascript: urls — both with and without quotes.
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
  out = out.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  return out;
};

/** First non-empty line of the body, used when the user never typed a title. */
const deriveTitle = (plainText) => {
  const firstLine = String(plainText || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine || '').slice(0, 120);
};

/**
 * What this user is allowed to read: their own notes, plus notes other people
 * shared to this branch or to the whole organization.
 */
const readableFilter = ({ organizationId, branchId, userId }) => {
  const shared = [{ visibility: 'organization' }];
  if (branchId) shared.push({ visibility: 'branch', branchId });
  return {
    organizationId,
    $or: [{ ownerId: userId }, { $and: [{ ownerId: { $ne: userId } }, { $or: shared }] }],
  };
};

const createNote = async (data, { organizationId, branchId, userId }) => {
  // An offline draft that syncs twice must not create two notes.
  if (data.clientId) {
    const existing = await Note.findOne({ organizationId, ownerId: userId, clientId: data.clientId });
    if (existing) return existing;
  }

  const content = sanitizeContent(data.content);
  const plainText = toPlainText(content);

  return Note.create({
    organizationId,
    branchId: branchId || null,
    ownerId: userId,
    title: (data.title || '').trim() || deriveTitle(plainText),
    content,
    plainText,
    color: data.color || 'default',
    tags: normalizeTags(data.tags) || [],
    isPinned: Boolean(data.isPinned),
    visibility: data.visibility || 'private',
    relatedType: data.relatedType,
    relatedId: data.relatedId,
    relatedLabel: data.relatedLabel,
    noteType: data.noteType || 'general',
    category: data.category,
    lastEditedBy: userId,
    clientId: data.clientId,
  });
};

const listNotes = async (query, scope) => {
  const filter = readableFilter(scope);

  // Trash and Archive are their own tabs — they never bleed into the main list.
  if (query.view === 'trash') {
    filter.isTrashed = true;
    filter.ownerId = scope.userId; // only your own notes can be in your trash
    delete filter.$or;
  } else if (query.view === 'archived') {
    filter.isTrashed = false;
    filter.isArchived = true;
  } else {
    filter.isTrashed = false;
    filter.isArchived = false;
  }

  if (query.color) filter.color = query.color;
  if (query.tag) filter.tags = query.tag;
  if (query.visibility) filter.visibility = query.visibility;
  if (query.relatedId) filter.relatedId = query.relatedId;
  if (query.noteType) filter.noteType = query.noteType;
  if (query.mine === 'true' || query.mine === true) filter.ownerId = scope.userId;

  if (query.search) {
    // Regex rather than $text: users search partial words ("inv" → "invoice")
    // while typing, which a text index cannot match.
    const escaped = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = { $regex: escaped, $options: 'i' };
    const searchClause = { $or: [{ title: rx }, { plainText: rx }, { tags: rx }] };
    // Keep the visibility $or intact — combine with $and instead of overwriting.
    const visibilityClause = filter.$or ? { $or: filter.$or } : null;
    delete filter.$or;
    filter.$and = [searchClause];
    if (visibilityClause) filter.$and.push(visibilityClause);
  }

  const options = {
    // Pinned first, then most recently touched — the order the UI renders.
    sortBy: 'isPinned:desc,updatedAt:desc',
    limit: query.limit ? Math.min(Number(query.limit), 200) : 100,
    page: query.page ? Number(query.page) : 1,
    // Shared notes show who wrote them — only the three fields the badge needs.
    populate: [{ path: 'ownerId', select: 'name email photo' }],
  };

  return Note.paginate(filter, options);
};

const getNote = async (id, scope) => {
  const note = await Note.findOne({ _id: id, ...readableFilter(scope) });
  if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
  return note;
};

/** Writes are owner-only, even for notes shared to the branch. */
const getOwnedNote = async (id, { organizationId, userId }) => {
  const note = await Note.findOne({ _id: id, organizationId, ownerId: userId });
  if (!note) throw new ApiError(httpStatus.NOT_FOUND, 'Note not found');
  return note;
};

const updateNote = async (id, data, scope) => {
  const note = await getOwnedNote(id, scope);

  if (data.content !== undefined) {
    note.content = sanitizeContent(data.content);
    note.plainText = toPlainText(note.content);
  }
  if (data.title !== undefined) note.title = String(data.title).trim();
  // Keep an untitled note labelled by its first line as the body changes.
  if (!note.title) note.title = deriveTitle(note.plainText);

  if (data.color !== undefined) note.color = data.color;
  if (data.tags !== undefined) note.tags = normalizeTags(data.tags) || [];
  if (data.isPinned !== undefined) note.isPinned = Boolean(data.isPinned);
  if (data.isArchived !== undefined) note.isArchived = Boolean(data.isArchived);
  if (data.visibility !== undefined) note.visibility = data.visibility;
  if (data.relatedType !== undefined) note.relatedType = data.relatedType || undefined;
  if (data.relatedId !== undefined) note.relatedId = data.relatedId || undefined;
  if (data.relatedLabel !== undefined) note.relatedLabel = data.relatedLabel;
  if (data.noteType !== undefined) note.noteType = data.noteType;
  if (data.category !== undefined) note.category = data.category;
  if (data.aiSummary !== undefined) note.aiSummary = data.aiSummary;

  note.lastEditedBy = scope.userId;
  await note.save();
  return note;
};

/** Default delete is a soft one; `permanent` is only reachable from the Trash tab. */
const deleteNote = async (id, { permanent }, scope) => {
  const note = await getOwnedNote(id, scope);
  if (permanent || note.isTrashed) {
    await note.deleteOne();
    return null;
  }
  note.isTrashed = true;
  note.trashedAt = new Date();
  note.isPinned = false;
  await note.save();
  return note;
};

const restoreNote = async (id, scope) => {
  const note = await getOwnedNote(id, scope);
  note.isTrashed = false;
  note.trashedAt = null;
  await note.save();
  return note;
};

const emptyTrash = async ({ organizationId, userId }) => {
  const result = await Note.deleteMany({ organizationId, ownerId: userId, isTrashed: true });
  return { deletedCount: result.deletedCount || 0 };
};

const duplicateNote = async (id, scope) => {
  const source = await getNote(id, scope);
  return Note.create({
    organizationId: scope.organizationId,
    branchId: scope.branchId || null,
    ownerId: scope.userId,
    title: `${source.title || 'Untitled'} (copy)`.slice(0, 160),
    content: source.content,
    plainText: source.plainText,
    color: source.color,
    tags: source.tags,
    visibility: 'private',
    relatedType: source.relatedType,
    relatedId: source.relatedId,
    relatedLabel: source.relatedLabel,
    noteType: source.noteType,
    category: source.category,
    lastEditedBy: scope.userId,
  });
};

// ── AI helpers ────────────────────────────────────────────────────────────────
// Deliberately no embeddings/vector store here — this app has no vector DB. Retrieval
// for "Ask Your Notes" and the related-notes score both lean on the keyword approach
// already proven by the search box above, just applied to a whole question instead of
// a partial typed word.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
  'my', 'me', 'i', 'what', 'did', 'do', 'does', 'about', 'with', 'that', 'this', 'it', 'have',
  'has', 'had', 'you', 'your', 'we', 'our', 'be', 'as', 'at', 'by', 'from', 'how', 'when',
  'where', 'which', 'who', 'can', 'could', 'would', 'should', 'tell', 'show', 'give', 'all',
]);

const extractKeywords = (text, max = 12) => {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return [...new Set(words)].slice(0, max);
};

/**
 * Candidate notes for "Ask Your Notes", ranked by the existing text index when the
 * question has real keywords, topped up with the user's most recent notes when there
 * are too few keyword matches (a one-word or all-stopword question) so the model still
 * has *something* scoped and current to reason over rather than nothing at all. Bounded
 * to `limit` notes and capped excerpt length by the caller — never the whole library.
 */
const searchCandidatesForAi = async (question, scope, limit = 20) => {
  const filter = readableFilter(scope);
  filter.isTrashed = false;
  const keywords = extractKeywords(question);

  let notes = [];
  if (keywords.length) {
    notes = await Note.find(
      { ...filter, $text: { $search: keywords.join(' ') } },
      { score: { $meta: 'textScore' } },
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean();
  }

  if (notes.length < limit) {
    const excludeIds = notes.map((note) => note._id);
    const extra = await Note.find({ ...filter, _id: { $nin: excludeIds } })
      .sort({ updatedAt: -1 })
      .limit(limit - notes.length)
      .lean();
    notes = notes.concat(extra);
  }
  return notes;
};

/** Whether this user has any readable notes at all — used to skip a Gemini call outright. */
const hasAnyReadableNotes = async (scope) => {
  const filter = readableFilter(scope);
  filter.isTrashed = false;
  const existing = await Note.exists(filter);
  return Boolean(existing);
};

const RELATED_CANDIDATE_POOL = 300;

/** Bag-of-words overlap, normalized so two long notes sharing a few words don't outscore two short, near-identical ones. */
const overlapScore = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((word) => {
    if (b.has(word)) shared += 1;
  });
  return shared / Math.sqrt(a.size * b.size);
};

/**
 * "Related Notes" without an AI call — instant and free, so it can run every time a
 * note is opened rather than only on demand. Scores on shared tags (strongest signal —
 * a user's own curation), keyword overlap in the body, and same type/category.
 */
const findRelatedNotes = async (note, scope, limit = 5) => {
  const filter = readableFilter(scope);
  filter.isTrashed = false;
  filter._id = { $ne: note._id || note.id };

  const candidates = await Note.find(filter, 'title plainText tags noteType category color updatedAt')
    .sort({ updatedAt: -1 })
    .limit(RELATED_CANDIDATE_POOL)
    .lean();

  const noteTags = new Set((note.tags || []).map((tag) => tag.toLowerCase()));
  const noteWords = new Set(extractKeywords(note.plainText, 40));

  const scored = candidates
    .map((candidate) => {
      const candidateTags = new Set((candidate.tags || []).map((tag) => tag.toLowerCase()));
      const sharedTags = [...candidateTags].filter((tag) => noteTags.has(tag)).length;
      const textScore = overlapScore(noteWords, new Set(extractKeywords(candidate.plainText, 40)));
      const sameType = candidate.noteType && candidate.noteType === note.noteType ? 0.1 : 0;
      const sameCategory = candidate.category && candidate.category === note.category ? 0.15 : 0;
      return { candidate, sharedTags, score: sharedTags * 0.5 + textScore + sameType + sameCategory };
    })
    .filter((entry) => entry.sharedTags > 0 || entry.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((entry) => ({
    id: entry.candidate._id,
    title: entry.candidate.title,
    color: entry.candidate.color,
    tags: entry.candidate.tags,
  }));
};

/** Persists an AI result the user is allowed to write (owner-only); silently skipped for shared, read-only notes. */
const cacheAiSummary = async (id, aiSummary, scope) => {
  try {
    const note = await getOwnedNote(id, scope);
    note.aiSummary = aiSummary;
    await note.save();
  } catch {
    // Read-only shared note — the caller still gets the summary for this one response.
  }
};

/** Every tag the user can see, with how many notes carry it — powers the tag filter. */
const listTags = async (scope) => {
  // $match in an aggregation gets no schema casting — the ids must already be ObjectIds.
  const castScope = {
    organizationId: toObjectId(scope.organizationId),
    branchId: scope.branchId ? toObjectId(scope.branchId) : null,
    userId: toObjectId(scope.userId),
  };
  const rows = await Note.aggregate([
    { $match: { ...readableFilter(castScope), isTrashed: false } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 100 },
  ]);
  return rows.map((row) => ({ tag: row._id, count: row.count }));
};

module.exports = {
  createNote,
  listNotes,
  getNote,
  getOwnedNote,
  updateNote,
  deleteNote,
  restoreNote,
  emptyTrash,
  duplicateNote,
  listTags,
  // AI helpers
  extractKeywords,
  searchCandidatesForAi,
  hasAnyReadableNotes,
  findRelatedNotes,
  cacheAiSummary,
  // exported for tests
  toPlainText,
  sanitizeContent,
};
