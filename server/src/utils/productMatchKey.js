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

module.exports = { matchKeyFor, escapeRegex, buildMatchQuery };
