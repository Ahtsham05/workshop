/**
 * Products are branch-scoped documents (no shared catalog id across branches) — the
 * same physical item is a separate Product doc per branch. This is the one shared
 * heuristic for recognizing "the same physical item" across branches: match by
 * barcode when present, else fall back to an exact case-insensitive name match.
 * Barcode/SKU uniqueness is scoped per (organizationId, branchId), not global (see
 * product.model.js / productVariant.model.js) — a barcode CAN legitimately repeat
 * across branches (usually because it's the same physical item copied there), which is
 * exactly what this heuristic is trying to detect. Name is still the real workhorse
 * (see buildMatchQuery below): an accidental cross-branch barcode collision on two
 * genuinely different items is a rare, low-stakes mismatch for a *suggestion* feature,
 * not a data-integrity concern.
 * Used by purchaseSuggestions.service.js (transfer suggestions) and
 * branchAvailability.service.js (per-branch stock lookup on Invoice).
 */
const matchKeyFor = (p) => (p.barcode ? `barcode:${p.barcode}` : `name:${p.name.trim().toLowerCase()}`);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds a Mongo query matching "the same physical item" as `product`, scoped by
 * `scope` (e.g. {organizationId, branchId} or just {organizationId}). Tries barcode OR
 * name — never barcode *instead of* name — since barcode is only unique within a
 * single branch now, not across the whole match scope: a same-barcode copy in another
 * branch is the common case this is meant to catch, but a barcode-less counterpart (or
 * one whose barcode was entered differently) still needs the name fallback to be found.
 */
const buildMatchQuery = (scope, product) => {
  const nameQuery = { name: { $regex: `^${escapeRegex(product.name.trim())}$`, $options: 'i' } };
  if (!product.barcode) return { ...scope, ...nameQuery };
  return { ...scope, $or: [{ barcode: product.barcode }, nameQuery] };
};

/**
 * Same "same physical item" heuristic as buildMatchQuery, but with barcode treated as
 * authoritative — checked first, on its own, and used unconditionally the moment it
 * matches, exactly like a real barcode scan would. Only falls back to the exact-name
 * match when there's no barcode to check, or nothing at this scope carries it yet. Used
 * at the match-*or-create* decision points (inventory transfer, master-product linking)
 * where getting priority right actually matters, as opposed to buildMatchQuery's single
 * combined query, kept deliberately simple for the lower-stakes suggestion/lookup
 * features that use it (see this file's top docblock).
 */
const findBestMatch = async ({ Model, scope, product, session, codeFields = ['barcode'] }) => {
  const nameQuery = { name: { $regex: `^${escapeRegex(product.name.trim())}$`, $options: 'i' } };
  // Exact codes the product carries, strongest first (a barcode, then e.g. an SKU) — each
  // wins over any code after it and over the name.
  const codes = codeFields.filter((field) => product[field]).map((field) => [field, product[field]]);
  if (!codes.length) return Model.findOne({ ...scope, ...nameQuery }).session(session || null);
  // One round trip for every candidate instead of a lookup per code and then by name.
  // Oldest first, so a tie between same-name entries resolves the same way every time.
  const candidates = await Model.find({ ...scope, $or: [...codes.map(([field, value]) => ({ [field]: value })), nameQuery] })
    .sort({ _id: 1 })
    .limit(20)
    .session(session || null);
  for (const [field, value] of codes) {
    const byCode = candidates.find((doc) => doc[field] === value);
    if (byCode) return byCode;
  }
  return candidates[0] || null;
};

module.exports = { matchKeyFor, escapeRegex, buildMatchQuery, findBestMatch };
