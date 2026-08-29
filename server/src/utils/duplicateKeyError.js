const httpStatus = require('http-status');
const ApiError = require('./ApiError');

// Compound org/branch-scoped unique indexes (Product/ProductVariant sku+barcode, etc.)
// always carry organizationId/branchId in their keyPattern alongside the field that
// actually caused the collision — naively taking Object.keys(keyPattern)[0] returns
// "organizationId" instead of "sku"/"barcode". This picks out the real differentiator.
const SCOPE_FIELDS = new Set(['organizationId', 'branchId']);

const FIELD_LABELS = {
  barcode: 'Barcode',
  sku: 'SKU',
  name: 'Product name',
};

// Separate from FIELD_LABELS because naively lowercasing "SKU" reads as "sku", not the
// acronym — this is what goes in the second half of the message ("a different ___").
const FIELD_LABELS_LOWER = {
  barcode: 'barcode',
  sku: 'SKU',
  name: 'product name',
};

// One static pattern per known field — avoids building a RegExp from dynamic input.
const DUP_KEY_FIELD_PATTERNS = {
  barcode: /\bbarcode:\s*"?([^,"}]*)"?/,
  sku: /\bsku:\s*"?([^,"}]*)"?/,
  name: /\bname:\s*"?([^,"}]*)"?/,
};

/**
 * Pulls { field, value } for the actual conflicting field out of a MongoDB E11000
 * error, correctly skipping over organizationId/branchId on a compound (org/branch-
 * scoped) index. Returns null if `error` isn't a duplicate-key error with a keyPattern
 * (e.g. a raw driver bulkWrite error that only has an errmsg — see errmsg fallback
 * below for that case).
 */
const extractDuplicateField = (error) => {
  if (!error || error.code !== 11000 || !error.keyPattern) return null;
  const field = Object.keys(error.keyPattern).find((key) => !SCOPE_FIELDS.has(key)) || Object.keys(error.keyPattern)[0];
  const value = error.keyValue ? error.keyValue[field] : undefined;
  return { field, value };
};

/**
 * Same idea as extractDuplicateField, but for a raw driver-level dup-key errmsg string
 * (bulkWrite/insertMany write errors don't reliably carry keyPattern/keyValue — only
 * errmsg). Scans the `dup key: { ... }` clause for a known sku/barcode/name field
 * rather than assuming the first key, since a compound index's dup key clause lists
 * organizationId/branchId first.
 */
const extractDuplicateFieldFromMessage = (errmsg) => {
  if (!errmsg) return null;
  const dupKeyClause = errmsg.match(/dup key:\s*\{([^}]*)\}/);
  if (!dupKeyClause) return null;
  const field = Object.keys(DUP_KEY_FIELD_PATTERNS).find((key) => DUP_KEY_FIELD_PATTERNS[key].test(dupKeyClause[1]));
  if (!field) return null;
  const match = dupKeyClause[1].match(DUP_KEY_FIELD_PATTERNS[field]);
  return { field, value: match[1].trim() };
};

const labelFor = (field) => FIELD_LABELS[field] || field;

// sku/barcode are branch-scoped (unique per organizationId+branchId, not globally —
// see product.model.js) — the message says so explicitly, both so "why does this exist
// in another branch's catalog but not mine" never comes up, and to point at the actual
// fix (edit the existing one) rather than just "pick something else".
const BRANCH_SCOPED_FIELDS = new Set(['barcode', 'sku']);

/**
 * Turns a MongoDB E11000 duplicate-key error into a friendly ApiError, correctly
 * identifying the actual conflicting field even when the underlying index is a
 * compound (org/branch-scoped) index. Returns null if `error` isn't a duplicate-key
 * error, so callers can fall through to `throw error` for anything else.
 */
const toDuplicateKeyApiError = (error) => {
  const found = extractDuplicateField(error);
  if (!found) return null;
  const label = labelFor(found.field);
  const lowerLabel = FIELD_LABELS_LOWER[found.field] || label.toLowerCase();
  const message = BRANCH_SCOPED_FIELDS.has(found.field)
    ? `${label} "${found.value}" is already used by another product in this branch. Use a different ${lowerLabel}, or open that product to edit it instead.`
    : `${label} "${found.value}" already exists. Please use a different ${lowerLabel}.`;
  return new ApiError(httpStatus.BAD_REQUEST, message);
};

module.exports = { extractDuplicateField, extractDuplicateFieldFromMessage, labelFor, toDuplicateKeyApiError };
