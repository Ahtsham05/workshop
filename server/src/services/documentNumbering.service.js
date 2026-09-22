const httpStatus = require('http-status');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

// Lazily required to avoid a require-cycle with models/index.js -> services/index.js.
const getModels = () => require('../models');
const getOrganizationService = () => require('./organization.service');

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const GRANULARITY = { none: 0, yearly: 1, monthly: 2 };

// docType -> which model/collection holds the number, plus any extra filter needed to tell
// Invoice and Quotation documents apart (they share the same `invoices` Mongo collection).
const DOC_TYPES = {
  invoice: {
    getModel: () => getModels().Invoice,
    field: 'invoiceNumber',
    extraFilter: { type: { $ne: 'quotation' } },
    seqKeyPrefix: 'invoiceNumber',
  },
  purchase: {
    getModel: () => getModels().Purchase,
    field: 'invoiceNumber',
    extraFilter: {},
    seqKeyPrefix: 'purchaseNumber',
  },
  quotation: {
    getModel: () => getModels().Invoice,
    field: 'invoiceNumber',
    extraFilter: { type: 'quotation' },
    seqKeyPrefix: 'quotationNumber',
  },
};

const assertKnownDocType = (docType) => {
  if (!DOC_TYPES[docType]) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Unknown document numbering type "${docType}"`);
  }
  return DOC_TYPES[docType];
};

/**
 * `resetPeriod`'s granularity can never exceed `dateSegment`'s — a monthly reset needs a
 * segment that visibly changes every month, otherwise two numerically-distinct counters
 * print identically (e.g. dateSegment 'yearly' + resetPeriod 'monthly' would print the same
 * INV-2026-000001 in both February and March). Mirrored client-side for live validation.
 */
const assertNumberingConsistency = (config) => {
  if (GRANULARITY[config.resetPeriod] > GRANULARITY[config.dateSegment]) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Reset period cannot be more frequent than the date segment'
    );
  }
};

const getDefaultConfig = (docType) => {
  const defaults = {
    invoice: { prefix: 'INV', dateSegment: 'monthly', resetPeriod: 'monthly' },
    purchase: { prefix: 'PUR', dateSegment: 'none', resetPeriod: 'never' },
    quotation: { prefix: 'QUO', dateSegment: 'monthly', resetPeriod: 'monthly' },
  }[docType];
  return { separator: '-', padding: 6, startingNumber: 1, scope: 'organization', ...defaults };
};

const resolveConfig = async (organizationId, docType) => {
  const org = await getOrganizationService().getOrganizationById(organizationId);
  const stored = org?.documentNumbering?.[docType];
  const defaults = getDefaultConfig(docType);
  return stored ? { ...defaults, ...stored.toObject?.() ?? stored } : defaults;
};

const assertBranchForScope = (config, branchId) => {
  if (config.scope === 'branch' && !branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A branch is required for this document type\'s per-branch numbering');
  }
};

const dateSegmentFor = (dateSegment, date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  if (dateSegment === 'yearly') return String(year);
  if (dateSegment === 'monthly') return `${year}${month}`;
  return '';
};

/** Pure string formatter — mirrored client-side (see document-numbering-settings.tsx) for
 * instant, zero-latency preview as the user edits prefix/separator/padding. */
const formatNumber = (config, seq, now = new Date()) => {
  const segment = dateSegmentFor(config.dateSegment, now);
  return [config.prefix, segment, String(seq).padStart(config.padding, '0')].filter(Boolean).join(config.separator || '');
};

/**
 * `scope: 'organization'` (default) — one bucket shared by every branch, so numbers stay
 * continuous org-wide regardless of which branch created the document.
 * `scope: 'branch'` — a separate bucket per branch, so e.g. Branch A can run 1000, 1001,
 * 1002... entirely independently of whatever Branch B is doing — Branch B's activity never
 * advances or gets skipped-over by Branch A's counter, and vice versa.
 */
const bucketKeyFor = (docType, organizationId, config, now = new Date(), branchId = null) => {
  const { seqKeyPrefix } = assertKnownDocType(docType);
  const scopeSegment = config.scope === 'branch' ? `${organizationId}_${branchId}` : `${organizationId}`;
  const base = `${seqKeyPrefix}_${scopeSegment}`;
  if (config.resetPeriod === 'yearly') return `${base}_${now.getFullYear()}`;
  if (config.resetPeriod === 'monthly') return `${base}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return base;
};

/** Scoped scan for the current max existing number in this bucket's prefix — the same role
 * DEFAULT_PURCHASE_INVOICE_SEQ (a hardcoded floor) played before this feature existed,
 * generalized into config.startingNumber. Only ever runs once per (org[, branch], docType,
 * bucket) — every call after the first hits the already-seeded counter directly.
 *
 * Scoped by resetPeriod's bucket boundary, not dateSegment's display granularity — e.g. a
 * 'never'-reset counter that still shows a monthly segment (an intentional, valid combo:
 * resetPeriod's granularity is allowed to be coarser than dateSegment's) must scan ALL of
 * this scope's history under this prefix, not just the current month's docs, or the very
 * first seed would under-count and the counter would appear to "restart" each period despite
 * being configured never to. Since resetPeriod's granularity is always <= dateSegment's
 * (enforced by assertNumberingConsistency), the resetPeriod-derived scan segment is always a
 * valid literal prefix of whatever dateSegment actually prints.
 */
const scanCurrentMax = async ({ docType, organizationId, branchId, config, now = new Date() }) => {
  const { getModel, field, extraFilter } = assertKnownDocType(docType);
  const scanGranularity = config.resetPeriod === 'never' ? 'none' : config.resetPeriod;
  const segment = dateSegmentFor(scanGranularity, now);
  const docPrefix = [config.prefix, segment].filter(Boolean).join(config.separator || '');
  const docs = await getModel()
    .find({
      organizationId,
      ...(config.scope === 'branch' ? { branchId } : {}),
      ...extraFilter,
      [field]: { $regex: `^${escapeRegex(docPrefix)}${escapeRegex(config.separator || '')}?` },
    })
    .select(field)
    .lean();

  let max = 0;
  for (const doc of docs) {
    const match = String(doc[field] || '').match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return max;
};

let indexesEnsured = { invoice: false, purchase: false };
let indexesInFlight = { invoice: null, purchase: null };

/**
 * Migrate Invoice/Purchase's unique index on invoiceNumber up to a compound
 * {organizationId, branchId, invoiceNumber} one — the same drop-and-recreate pattern already
 * proven for PurchaseOrder's orderNumber (see purchaseOrder.service.js#ensurePurchaseOrderIndexes)
 * and already used from the start by ServiceInvoice (serviceInvoice.model.js). Branch-scoped
 * (not just org-scoped) so a per-branch numbering config (see bucketKeyFor above) can
 * actually let two branches share the same number — org-scoped numbering configs remain
 * fully protected too: generateNextNumber below additionally self-checks org-wide when a
 * docType's scope is 'organization', and assertManualNumberAvailable does the same for
 * manually-typed overrides. Detects and drops EITHER earlier index shape this field has had
 * (the original fully-global 1-field one, or the org-scoped 2-field one from directly before
 * this branch-scoping change) — memoized with an in-flight promise (not just a boolean)
 * since Invoice/Purchase creation is a much higher-concurrency hot path than the precedent.
 */
const ensureNumberingIndexes = async (docType) => {
  if (docType !== 'invoice' && docType !== 'purchase') return; // quotation shares Invoice's index
  if (indexesEnsured[docType]) return;
  if (indexesInFlight[docType]) return indexesInFlight[docType];

  indexesInFlight[docType] = (async () => {
    const { Invoice, Purchase } = getModels();
    const Model = docType === 'invoice' ? Invoice : Purchase;
    const collectionName = docType === 'invoice' ? 'invoices' : 'purchases';
    const collection = mongoose.connection.collection(collectionName);
    try {
      const indexes = await collection.indexes();
      const superseded = indexes.filter((idx) => {
        if (!idx.unique || idx.key?.invoiceNumber !== 1) return false;
        const keys = Object.keys(idx.key);
        return (
          (keys.length === 1) || // legacy fully-global {invoiceNumber}
          (keys.length === 2 && idx.key.organizationId === 1) // pre-branch-scoping {organizationId, invoiceNumber}
        );
      });
      // eslint-disable-next-line no-restricted-syntax
      for (const idx of superseded) {
        // eslint-disable-next-line no-await-in-loop
        await collection.dropIndex(idx.name);
      }
    } catch (err) {
      if (err.codeName !== 'IndexNotFound') {
        // eslint-disable-next-line no-console
        console.error(`ensureNumberingIndexes(${docType}): failed to drop superseded index`, err.message);
      }
    }
    try {
      await Model.syncIndexes();
      indexesEnsured[docType] = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`ensureNumberingIndexes(${docType}): syncIndexes failed`, err.message);
    }
  })();

  try {
    await indexesInFlight[docType];
  } finally {
    indexesInFlight[docType] = null;
  }
};

/** Seeds the `_sequences` counter for a bucket the first time it's used, from the
 * appropriately-scoped historical max (or the configured starting number, whichever is
 * higher). Atomic/race-safe via $setOnInsert + upsert — concurrent first-callers can't
 * double-seed. */
const ensureCounterSeeded = async ({ docType, organizationId, branchId, config, bucketKey, now }) => {
  const db = mongoose.connection.db;
  const existing = await db.collection('_sequences').findOne({ _id: bucketKey });
  if (existing) return;

  const maxFound = await scanCurrentMax({ docType, organizationId, branchId, config, now });
  const seed = Math.max(maxFound, (config.startingNumber || 1) - 1);
  await db.collection('_sequences').updateOne(
    { _id: bucketKey },
    { $setOnInsert: { seq: seed } },
    { upsert: true }
  );
};

/**
 * Mint the next real number for this org[/branch]/docType. The $inc itself is atomic and
 * race-free between two concurrent auto-generated numbers — but a manually-typed override
 * (see the pencil-edit UI on Invoice/Purchase panels) can still land on a value the counter
 * hasn't reached yet, so this still checks existence and skips ahead if needed, same as
 * purchaseOrder.service.js's generateOrderNumber. That existence check is itself scoped to
 * match this docType's configured scope: org-wide when scope is 'organization' (so two
 * branches sharing one sequence never both land on the same number), branch-only when scope
 * is 'branch' (so Branch A's numbers are never skipped just because Branch B already used
 * them — the whole point of per-branch numbering).
 */
const generateNextNumber = async ({ organizationId, branchId, docType }) => {
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Organization is required to generate a document number');
  }
  const { getModel, field, extraFilter } = assertKnownDocType(docType);
  await ensureNumberingIndexes(docType);

  const config = await resolveConfig(organizationId, docType);
  assertBranchForScope(config, branchId);
  const now = new Date();
  const bucketKey = bucketKeyFor(docType, organizationId, config, now, branchId);

  await ensureCounterSeeded({ docType, organizationId, branchId, config, bucketKey, now });

  const db = mongoose.connection.db;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await db.collection('_sequences').findOneAndUpdate(
      { _id: bucketKey },
      { $inc: { seq: 1 } },
      { returnDocument: 'after' }
    );
    const seq = Number(result?.seq ?? result?.value?.seq);
    if (!Number.isFinite(seq) || seq <= 0) continue; // eslint-disable-line no-continue

    const candidate = formatNumber(config, seq, now);
    const existsFilter = { organizationId, ...extraFilter, [field]: candidate };
    if (config.scope === 'branch') existsFilter.branchId = branchId;
    // eslint-disable-next-line no-await-in-loop
    const exists = await getModel().exists(existsFilter);
    if (!exists) return candidate;
  }

  throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not generate a unique document number, please try again');
};

/**
 * Guards a manually-typed number the same way generateNextNumber's own existence check
 * guards an auto-generated one. Needed as an explicit pre-check (not just relying on the
 * DB's unique index and catching E11000) because that index is now branch-scoped
 * {organizationId, branchId, invoiceNumber} — sufficient on its own for a 'branch'-scope
 * docType, but NOT sufficient for an 'organization'-scope one, where two different branches
 * must still never end up with the same manually-typed number. No-ops (returns without
 * checking) for 'branch' scope, since the DB index alone already covers that case.
 */
const assertManualNumberAvailable = async ({ organizationId, branchId, docType, invoiceNumber, excludeId }) => {
  const { getModel, field, extraFilter } = assertKnownDocType(docType);
  const config = await resolveConfig(organizationId, docType);
  if (config.scope !== 'organization') return; // branch-scoped DB index is already sufficient

  const exists = await getModel().exists({
    organizationId,
    ...extraFilter,
    [field]: invoiceNumber,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
  if (exists) {
    throw new ApiError(httpStatus.BAD_REQUEST, `${docType === 'purchase' ? 'Invoice' : 'Invoice'} number "${invoiceNumber}" is already in use`);
  }
};

/**
 * Read-only preview — never mints/increments. With `config` (a draft from the settings UI,
 * not yet saved) it formats/peeks against that draft without touching real counters.
 * Without it, previews the org's real persisted config (used by the /next-number routes).
 * `branchId` is required whenever the (draft or resolved) config's scope is 'branch'.
 */
const peekNextNumber = async ({ organizationId, branchId, docType, config: draftConfig }) => {
  assertKnownDocType(docType);
  const config = draftConfig ? { ...getDefaultConfig(docType), ...draftConfig } : await resolveConfig(organizationId, docType);
  assertNumberingConsistency(config);
  assertBranchForScope(config, branchId);
  const now = new Date();
  const bucketKey = bucketKeyFor(docType, organizationId, config, now, branchId);

  const db = mongoose.connection.db;
  const existing = await db.collection('_sequences').findOne({ _id: bucketKey });
  const seed = existing
    ? existing.seq
    : Math.max(await scanCurrentMax({ docType, organizationId, branchId, config, now }), (config.startingNumber || 1) - 1);
  const seq = seed + 1;

  return { preview: formatNumber(config, seq, now), nextSeq: seq };
};

/**
 * Admin "resume/skip-ahead" action — sets the counter so the *next* generated number equals
 * `nextNumber`. Rejects if that would collide with a number already issued in this bucket.
 * `branchId` selects WHICH branch's bucket to set when this docType's scope is 'branch' —
 * e.g. resuming Branch A at 1000 has no effect on Branch B's own sequence.
 */
const setNextNumber = async ({ organizationId, branchId, docType, nextNumber }) => {
  assertKnownDocType(docType);
  const config = await resolveConfig(organizationId, docType);
  assertBranchForScope(config, branchId);
  const now = new Date();
  const bucketKey = bucketKeyFor(docType, organizationId, config, now, branchId);

  await ensureCounterSeeded({ docType, organizationId, branchId, config, bucketKey, now });

  const db = mongoose.connection.db;
  const existing = await db.collection('_sequences').findOne({ _id: bucketKey });
  const currentMax = existing?.seq ?? 0;

  if (nextNumber <= currentMax) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Next number must be greater than the current highest issued number (${formatNumber(config, currentMax, now)})`
    );
  }

  await db.collection('_sequences').updateOne(
    { _id: bucketKey },
    { $set: { seq: nextNumber - 1 } },
    { upsert: true }
  );

  return { preview: formatNumber(config, nextNumber, now), nextSeq: nextNumber };
};

module.exports = {
  DOC_TYPES,
  getDefaultConfig,
  assertNumberingConsistency,
  formatNumber,
  generateNextNumber,
  assertManualNumberAvailable,
  peekNextNumber,
  setNextNumber,
};
