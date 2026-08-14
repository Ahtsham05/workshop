/**
 * Products are branch-scoped documents (no shared catalog id across branches) — the
 * same physical item is a separate Product doc per branch. This is the one shared
 * heuristic for recognizing "the same physical item" across branches: match by
 * barcode when present, else fall back to an exact case-insensitive name match.
 * Barcode has a global unique index (see product.model.js / productVariant.model.js),
 * so it's intentionally never duplicated across branches — name is the real workhorse.
 * Used by purchaseSuggestions.service.js (transfer suggestions) and
 * branchAvailability.service.js (per-branch stock lookup on Invoice).
 */
const matchKeyFor = (p) => (p.barcode ? `barcode:${p.barcode}` : `name:${p.name.trim().toLowerCase()}`);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds a Mongo query matching "the same physical item" as `product`, scoped by
 * `scope` (e.g. {organizationId, branchId} or just {organizationId}). Tries barcode OR
 * name — never barcode *instead of* name. This matters precisely because barcode is
 * globally unique: a second branch's copy of a barcoded item can never carry that same
 * barcode value, so a barcode-only query always misses it even when the same-named
 * product genuinely exists there. Name is always tried, whether or not a barcode is
 * present, so a barcoded source can still find a barcode-less (or differently-barcoded)
 * match elsewhere.
 */
const buildMatchQuery = (scope, product) => {
  const nameQuery = { name: { $regex: `^${escapeRegex(product.name.trim())}$`, $options: 'i' } };
  if (!product.barcode) return { ...scope, ...nameQuery };
  return { ...scope, $or: [{ barcode: product.barcode }, nameQuery] };
};

module.exports = { matchKeyFor, escapeRegex, buildMatchQuery };
