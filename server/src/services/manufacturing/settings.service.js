const { ManufacturingSettings } = require('../../models');
const { COUNTER_KEYS } = require('../../config/manufacturing');
const { toBusinessCalendarDate } = require('../../utils/businessTimezone');

/** Returns the org's manufacturing settings, creating the defaults on first use. */
const getSettings = async (organizationId) =>
  ManufacturingSettings.findOneAndUpdate(
    { organizationId },
    { $setOnInsert: { organizationId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

const UPDATABLE_FIELDS = [
  'numberPadding',
  'defaultSourceLocation',
  'defaultWipLocation',
  'defaultFinishedGoodsLocation',
  'allowNegativeStockIssue',
  'allowOverProduction',
  'requireBomForProduction',
  'explodeSubAssemblies',
  'defaultPriority',
  'requireQualityCheck',
  'defaultRejectDisposition',
  'autoCompleteOrders',
  'batchNumbering',
  'floorShortfall',
];

const updateSettings = async (organizationId, body, updatedBy) => {
  await getSettings(organizationId);
  const $set = { updatedBy };
  UPDATABLE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) $set[field] = body[field];
  });
  if (body.prefixes) {
    COUNTER_KEYS.forEach((key) => {
      if (body.prefixes[key] !== undefined) $set[`prefixes.${key}`] = String(body.prefixes[key]).trim().toUpperCase();
    });
  }
  return ManufacturingSettings.findOneAndUpdate({ organizationId }, { $set }, { new: true });
};

/**
 * Atomically reserves the next number for a manufacturing document type. Called outside
 * any transaction on purpose: a counter bump inside a multi-document transaction would
 * serialize every concurrent create on this one settings document. A rolled-back create
 * just leaves a gap in the sequence, which is harmless.
 */
/**
 * Next number for a document type. With `session` the increment is part of the caller's
 * transaction (rolled back with it — no gaps); the settings document must already exist
 * then (call getSettings first, outside the transaction).
 */
const nextDocumentNumber = async (organizationId, key, { session } = {}) => {
  if (!session) await getSettings(organizationId);
  const settings = await ManufacturingSettings.findOneAndUpdate(
    { organizationId },
    { $inc: { [`counters.${key}`]: 1 } },
    { new: true, session }
  );
  const seq = settings.counters[key];
  const prefix = settings.prefixes[key] || key.toUpperCase();
  return `${prefix}-${String(seq).padStart(settings.numberPadding || 5, '0')}`;
};

/**
 * The finished-goods batch (lot) number for a new production order: the org's dated
 * sequence — prefix + production day (business timezone) + running number, e.g.
 * B261019-007 — or, with batchNumbering 'order', the order number itself. Same session
 * rules as nextDocumentNumber.
 */
const nextBatchNumber = async (organizationId, orderNumber, { session, date = new Date() } = {}) => {
  const current = await (session
    ? ManufacturingSettings.findOne({ organizationId }).session(session)
    : getSettings(organizationId));
  if (current && current.batchNumbering === 'order') return orderNumber;
  const settings = await ManufacturingSettings.findOneAndUpdate(
    { organizationId },
    { $inc: { 'counters.batch': 1 } },
    { new: true, session }
  );
  const day = toBusinessCalendarDate(date).replace(/-/g, '').slice(2); // YYMMDD
  const prefix = (settings.prefixes && settings.prefixes.batch) || 'B';
  return `${prefix}${day}-${String(settings.counters.batch).padStart(3, '0')}`;
};

module.exports = { getSettings, updateSettings, nextDocumentNumber, nextBatchNumber };
