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
  return { separator: '-', padding: 6, startingNumber: 1, ...defaults };
};

const resolveConfig = async (organizationId, docType) => {
  const org = await getOrganizationService().getOrganizationById(organizationId);
  const stored = org?.documentNumbering?.[docType];
  const defaults = getDefaultConfig(docType);
  return stored ? { ...defaults, ...stored.toObject?.() ?? stored } : defaults;
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

const bucketKeyFor = (docType, organizationId, config, now = new Date()) => {
  const { seqKeyPrefix } = assertKnownDocType(docType);
  const base = `${seqKeyPrefix}_${organizationId}`;
  if (config.resetPeriod === 'yearly') return `${base}_${now.getFullYear()}`;
  if (config.resetPeriod === 'monthly') return `${base}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return base;
};

/** Org-scoped scan for the current max existing number in this bucket's prefix — the same
 * role DEFAULT_PURCHASE_INVOICE_SEQ (a hardcoded floor) played before this feature existed,
 * generalized into config.startingNumber. Only ever runs once per (org, docType, bucket) —
 * every call after the first hits the already-seeded counter directly.
 *
 * Scoped by resetPeriod's bucket boundary, not dateSegment's display granularity — e.g. a
 * 'never'-reset counter that still shows a monthly segment (an intentional, valid combo:
 * resetPeriod's granularity is allowed to be coarser than dateSegment's) must scan ALL of
 * this org's history under this prefix, not just the current month's docs, or the very first
 * seed would under-count and the counter would appear to "restart" each period despite being
 * configured never to. Since resetPeriod's granularity is always <= dateSegment's (enforced
 * by assertNumberingConsistency), the resetPeriod-derived scan segment is always a valid
 * literal prefix of whatever dateSegment actually prints.
 */
const scanCurrentMax = async ({ docType, organizationId, config, now = new Date() }) => {
  const { getModel, field, extraFilter } = assertKnownDocType(docType);
  const scanGranularity = config.resetPeriod === 'never' ? 'none' : config.resetPeriod;
  const segment = dateSegmentFor(scanGranularity, now);
  const docPrefix = [config.prefix, segment].filter(Boolean).join(config.separator || '');
  const docs = await getModel()
    .find({
      organizationId,
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
 * Migrate Invoice/Purchase's legacy GLOBAL unique index on invoiceNumber to a compound
 * per-organization one — same drop-and-recreate pattern already proven for PurchaseOrder's
 * orderNumber (see purchaseOrder.service.js#ensurePurchaseOrderIndexes). Memoized with an
 * in-flight promise (not just a boolean) since Invoice/Purchase creation is a much
 * higher-concurrency hot path than that precedent.
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
      const legacy = indexes.find(
        (idx) => idx.key?.invoiceNumber === 1 && Object.keys(idx.key).length === 1 && idx.unique
      );
      if (legacy) await collection.dropIndex(legacy.name);
    } catch (err) {
      if (err.codeName !== 'IndexNotFound') {
        // eslint-disable-next-line no-console
        console.error(`ensureNumberingIndexes(${docType}): failed to drop legacy index`, err.message);
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

/** Seeds the `_sequences` counter for a bucket the first time it's used, from the org-scoped
 * historical max (or the configured starting number, whichever is higher). Atomic/race-safe
 * via $setOnInsert + upsert — concurrent first-callers can't double-seed. */
const ensureCounterSeeded = async ({ docType, organizationId, config, bucketKey, now }) => {
  const db = mongoose.connection.db;
  const existing = await db.collection('_sequences').findOne({ _id: bucketKey });
  if (existing) return;

  const maxFound = await scanCurrentMax({ docType, organizationId, config, now });
  const seed = Math.max(maxFound, (config.startingNumber || 1) - 1);
  await db.collection('_sequences').updateOne(
    { _id: bucketKey },
    { $setOnInsert: { seq: seed } },
    { upsert: true }
  );
};

/**
 * Mint the next real number for this org/docType. The $inc itself is atomic and race-free
 * between two concurrent auto-generated numbers — but a manually-typed override (see the
 * pencil-edit UI on Invoice/Purchase panels) can still land on a value the counter hasn't
 * reached yet, so this still checks existence and skips ahead if needed, same as
 * purchaseOrder.service.js's generateOrderNumber.
 */
const generateNextNumber = async ({ organizationId, docType }) => {
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Organization is required to generate a document number');
  }
  const { getModel, field, extraFilter } = assertKnownDocType(docType);
  await ensureNumberingIndexes(docType);

  const config = await resolveConfig(organizationId, docType);
  const now = new Date();
  const bucketKey = bucketKeyFor(docType, organizationId, config, now);

  await ensureCounterSeeded({ docType, organizationId, config, bucketKey, now });

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
    // eslint-disable-next-line no-await-in-loop
    const exists = await getModel().exists({ organizationId, ...extraFilter, [field]: candidate });
    if (!exists) return candidate;
  }

  throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not generate a unique document number, please try again');
};

/**
 * Read-only preview — never mints/increments. With `config` (a draft from the settings UI,
 * not yet saved) it formats/peeks against that draft without touching real counters.
 * Without it, previews the org's real persisted config (used by the /next-number routes).
 */
const peekNextNumber = async ({ organizationId, docType, config: draftConfig }) => {
  assertKnownDocType(docType);
  const config = draftConfig ? { ...getDefaultConfig(docType), ...draftConfig } : await resolveConfig(organizationId, docType);
  assertNumberingConsistency(config);
  const now = new Date();
  const bucketKey = bucketKeyFor(docType, organizationId, config, now);

  const db = mongoose.connection.db;
  const existing = await db.collection('_sequences').findOne({ _id: bucketKey });
  const seed = existing
    ? existing.seq
    : Math.max(await scanCurrentMax({ docType, organizationId, config, now }), (config.startingNumber || 1) - 1);
  const seq = seed + 1;

  return { preview: formatNumber(config, seq, now), nextSeq: seq };
};

/**
 * Admin "resume/skip-ahead" action — sets the counter so the *next* generated number equals
 * `nextNumber`. Rejects if that would collide with a number already issued in this bucket.
 */
const setNextNumber = async ({ organizationId, docType, nextNumber }) => {
  assertKnownDocType(docType);
  const config = await resolveConfig(organizationId, docType);
  const now = new Date();
  const bucketKey = bucketKeyFor(docType, organizationId, config, now);

  await ensureCounterSeeded({ docType, organizationId, config, bucketKey, now });

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
  peekNextNumber,
  setNextNumber,
};
